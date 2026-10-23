// Pure roster sync planner: no network, no DB. Callers apply the returned plan.
export const MANUAL_FIELDS = ['song', 'intro', 'emoji', 'eye_mask_position', 'other_positions']
export const OFFICIAL_FIELDS = ['name', 'number', 'team', 'photo', 'league', 'roster_mark', 'status', 'is_coach']
const INSERT_ONLY_FIELDS = ['pitching_hand', 'batting_hand', 'main_position']

const statusOf = (s) => (s.roster_mark === '#' ? 'departed' : 'active')

export function planRosterSync({ dbPlayers, scraped, org, keyField }) {
  const plan = { inserts: [], updates: [], departures: [], returns: [], transfers: [], conflicts: [], skipped: [] }
  const orgRows = dbPlayers.filter((r) => r.org === org)
  // 外部 id 不分聯盟：別聯盟的列帶同一個 key 代表同一人換了聯盟，要搬列而不是新增重複列（本聯盟的列優先）。
  // 沒有共同 key 的跨聯盟移籍（例如中職旅外）不在此處理。
  const keyed = (rows) => rows.filter((r) => r[keyField] != null).map((r) => [String(r[keyField]), r])
  const byKey = new Map([...keyed(dbPlayers.filter((r) => r.org !== org)), ...keyed(orgRows)])
  // 無 key 的教練只比對無 key 的教練列：回填產生的歷史教練列帶 acnt，不可造成永久同名衝突
  const coaches = orgRows.filter((r) => r.is_coach && r[keyField] == null)
  const matched = new Set()
  const conflictNames = new Set()

  for (const s of scraped) {
    let row
    if (s.key != null) {
      row = byKey.get(String(s.key))
    } else if (!s.is_coach) {
      // 無 key 的球員無法辨識，若新增會每次重跑都再插一筆
      plan.skipped.push({ name: s.name, team: s.team })
      continue
    } else {
      const hits = coaches.filter((r) => r.name === s.name)
      const active = hits.filter((r) => r.status === 'active')
      const pick = hits.length > 1 && active.length === 1 ? active : hits
      if (pick.length > 1) {
        conflictNames.add(s.name)
        if (!plan.conflicts.includes(s.name)) plan.conflicts.push(s.name)
        continue
      }
      row = pick[0]
    }

    const status = statusOf(s)
    if (!row) {
      const insert = { org, [keyField]: s.key ?? null, status }
      for (const f of OFFICIAL_FIELDS) if (f !== 'status' && s[f] !== undefined) insert[f] = s[f]
      for (const f of INSERT_ONLY_FIELDS) if (s[f] !== undefined) insert[f] = s[f]
      plan.inserts.push(insert)
      continue
    }

    matched.add(row.id)
    const patch = row.org !== org ? { org } : {}
    for (const f of OFFICIAL_FIELDS) {
      const next = f === 'status' ? status : s[f]
      if (next !== undefined && next !== row[f]) patch[f] = next
    }
    if (Object.keys(patch).length === 0) continue
    plan.updates.push({ id: row.id, patch })
    if (patch.team !== undefined) plan.transfers.push({ id: row.id, name: s.name ?? row.name, from: row.team, to: patch.team })
    if (row.status === 'departed' && patch.status === 'active') plan.returns.push({ id: row.id, name: s.name ?? row.name, team: patch.team ?? row.team })
  }

  for (const r of orgRows) {
    if (r.status !== 'active' || matched.has(r.id)) continue
    const gone = r[keyField] != null ? true : r.is_coach && !conflictNames.has(r.name)
    if (gone) plan.departures.push({ id: r.id, name: r.name, team: r.team })
  }
  return plan
}

export function checkSafetyValve(pageCounts, previous) {
  for (const [page, n] of Object.entries(pageCounts)) {
    if (n === 0) return { ok: false, reason: `page ${page} returned 0 rows` }
  }
  if (previous) {
    for (const [page, prev] of Object.entries(previous)) {
      const n = pageCounts[page] ?? 0
      if (n < prev / 2) return { ok: false, reason: `page ${page} dropped from ${prev} to ${n} rows` }
    }
  }
  return { ok: true }
}
