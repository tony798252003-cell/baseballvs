// Pure planners for duplicate merging and unkeyed-row matching: no network, no DB.
import { MANUAL_FIELDS } from './rosterSync.mjs'
import { canonicalTeamName, orgOfTeam } from '../../src/constants/teams.js'

const EXTERNAL_IDS = ['cpbl_acnt', 'npb_id', 'mlb_id']
const hasExternalId = (r) => EXTERNAL_IDS.some((f) => r[f] != null && r[f] !== '')
const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0)
const byCreatedAt = (a, b) => String(a.created_at).localeCompare(String(b.created_at))

export function planDuplicateMerges(rows) {
  const groups = new Map()
  for (const r of rows) {
    const team = canonicalTeamName(r.team)
    const key = JSON.stringify([orgOfTeam(team) ?? r.org, r.name, team])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }

  const plans = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const sorted = [...group].sort(byCreatedAt)
    const keep = sorted.find(hasExternalId) ?? sorted[0]
    const others = sorted.filter((r) => r !== keep)
    const patch = {}
    for (const f of MANUAL_FIELDS) {
      if (!isEmpty(keep[f])) continue
      const donor = others.find((r) => !isEmpty(r[f]))
      if (donor) patch[f] = donor[f]
    }
    plans.push({ keepId: keep.id, removeIds: others.map((r) => String(r.id)), patch })
  }
  return plans
}

// scraped: [{ name, key }]. Only unkeyed db rows of the org are candidates.
export function matchUnkeyed(dbRows, scraped, { org, keyField }) {
  const unkeyed = dbRows.filter((r) => r.org === org && (r[keyField] == null || r[keyField] === ''))
  const matches = []
  const ambiguous = []
  for (const s of scraped) {
    if (s.key == null) continue
    const hits = unkeyed.filter((r) => r.name === s.name)
    if (hits.length === 1) matches.push({ id: hits[0].id, key: s.key })
    else if (hits.length > 1) ambiguous.push({ name: s.name, candidates: hits.map((r) => String(r.id)) })
  }
  return { matches, ambiguous }
}
