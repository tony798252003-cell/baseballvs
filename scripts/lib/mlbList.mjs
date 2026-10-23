// Pure planner for the curated MLB list: no network, no DB.
import { matchUnkeyed } from './playerMerge.mjs'
import { canonicalTeamName, orgOfTeam } from '../../src/constants/teams.js'

export function mlbPhotoUrl(mlbId) {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${mlbId}/headshot/67/current`
}

const FILE_FIELDS = ['number', 'main_position', 'pitching_hand', 'batting_hand']

// DB isn't normalized yet (team aliases, org still 'CPBL'), so compare on canonical team / derived org.
const normalize = (r) => {
  const team = canonicalTeamName(r.team)
  return { ...r, team, org: orgOfTeam(team) ?? r.org }
}

export function planMlbSync(dbRows, entries) {
  const rows = dbRows.map(normalize)
  const inserts = []
  const updates = []
  const ambiguous = []
  const notes = []

  for (const e of entries) {
    const team = canonicalTeamName(e.team)
    const sameName = rows.filter((r) => r.name === e.name)
    const sameTeam = sameName.filter((r) => r.team === team)

    let target = null
    const byId = e.mlbId == null ? null : rows.find((r) => String(r.mlb_id) === String(e.mlbId))
    if (byId) target = byId
    else {
      let hits
      if (e.mlbId == null) hits = sameTeam
      else {
        // a row on this team that already carries a different mlb_id is another person: never link it
        const ids = matchUnkeyed(sameTeam, [{ name: e.name, key: e.mlbId }], { org: 'MLB', keyField: 'mlb_id' })
        hits = rows.filter((r) => ids.matches.some((m) => m.id === r.id))
        if (ids.ambiguous.length) {
          ambiguous.push({ name: e.name, team, candidates: ids.ambiguous[0].candidates })
          continue
        }
      }
      if (hits.length > 1) {
        ambiguous.push({ name: e.name, team, candidates: hits.map((r) => String(r.id)) })
        continue
      }
      target = hits[0] ?? null
    }

    if (!target) {
      const elsewhere = sameName.filter((r) => r.team !== team)
      if (elsewhere.length) notes.push(`${e.name}: inserting on ${team}, but same name already exists on ${elsewhere.map((r) => `${r.team}(id ${r.id})`).join(', ')}`)
      const photo = e.mlbId != null ? mlbPhotoUrl(e.mlbId) : ''
      inserts.push({
        name: e.name, team, original_team: team, org: 'MLB', league: '一軍', is_coach: false,
        ...Object.fromEntries(FILE_FIELDS.map((f) => [f, e[f]])),
        status: e.status ?? 'active', photo,
        ...(e.mlbId != null && { mlb_id: e.mlbId }),
      })
      continue
    }

    const want = {
      team, org: 'MLB', status: e.status ?? 'active',
      ...Object.fromEntries(FILE_FIELDS.map((f) => [f, e[f]])),
      ...(e.mlbId != null && { mlb_id: e.mlbId }),
      // never replace an existing photo (may be a curated upload), only fill an empty one
      ...(e.mlbId != null && !target.photo && { photo: mlbPhotoUrl(e.mlbId) }),
    }
    const patch = {}
    for (const [f, v] of Object.entries(want)) {
      if (v == null) continue
      if (String(target[f] ?? '') !== String(v)) patch[f] = v
    }
    if (Object.keys(patch).length) updates.push({ id: target.id, name: e.name, patch })
  }
  return { inserts, updates, ambiguous, notes }
}
