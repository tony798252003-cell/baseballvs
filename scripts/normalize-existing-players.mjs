// Usage: node scripts/normalize-existing-players.mjs [--apply]
// Without --apply this is read-only: it only prints the planned changes.
import { loadEnv, createServiceClient } from './lib/env.mjs'
import { planDuplicateMerges } from './lib/playerMerge.mjs'
import { canonicalTeamName, orgOfTeam } from '../src/constants/teams.js'

const APPLY = process.argv.includes('--apply')
const OTHER_TEAM = '其他球隊'

loadEnv()
const supabase = createServiceClient()

function check(error, what) {
  if (error) {
    console.error(`FAILED: ${what}: ${error.message}`)
    process.exit(1)
  }
}

// PostgREST caps a response at 1000 rows, so page through.
async function fetchAll(table, orderBy) {
  const all = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(orderBy).range(from, from + 999)
    check(error, `read ${table}`)
    all.push(...data)
    if (data.length < 1000) return all
  }
}

const players = await fetchAll('players', 'id')
const chants = await fetchAll('team_chants', 'id')
console.log(`Loaded ${players.length} players, ${chants.length} team_chants`)

// (1)(2) normalize team + org, applied locally so the merge planner sees final values
const playerUpdates = []
for (const r of players) {
  // 其他球隊 with no usable original_team: keep the current team rather than writing null
  const team = r.team === OTHER_TEAM && r.original_team ? canonicalTeamName(r.original_team) : canonicalTeamName(r.team)
  const org = orgOfTeam(team) ?? r.org
  if (team === OTHER_TEAM || orgOfTeam(team) === undefined) {
    console.warn(`WARN unknown team for ${r.id} ${r.name}: team=${r.team} original_team=${r.original_team}`)
  }
  const patch = {}
  if (team !== r.team) patch.team = team
  if (org !== r.org) patch.org = org
  if (Object.keys(patch).length) playerUpdates.push({ id: r.id, name: r.name, patch, before: { team: r.team, org: r.org } })
  r.team = team
  r.org = org
}

// (3) team_chants renames
const chantUpdates = chants
  .map((c) => ({ id: c.id, name: c.name, from: c.team, to: canonicalTeamName(c.team) }))
  .filter((c) => c.to !== c.from)
console.log(`\n== team_chants: ${chantUpdates.length} rows to update ==`)
for (const c of chantUpdates) console.log(`  ${c.id} ${c.name}: ${c.from} -> ${c.to}`)

// (4) duplicate merges
const { merges, ambiguous } = planDuplicateMerges(players)
const byId = new Map(players.map((p) => [String(p.id), p]))
console.log(`\n== duplicate merges: ${merges.length} groups ==`)
for (const m of merges) {
  const keep = byId.get(String(m.keepId))
  console.log(`  ${keep.name} (${keep.team}): keep #${m.keepId}, remove ${m.removeIds.map((i) => '#' + i).join(', ')}, patch ${JSON.stringify(m.patch)}`)
}
const removed = new Set(merges.flatMap((m) => m.removeIds))
console.log(`\n== skipped (conflicting external ids, needs a human): ${ambiguous.length} groups ==`)
for (const a of ambiguous) console.log(`  ${a.name} (${a.team}): candidates ${a.candidates.map((i) => '#' + i).join(', ')}`)

const liveUpdates = playerUpdates.filter((u) => !removed.has(String(u.id)))
console.log(`\n== players: ${liveUpdates.length} rows to update (excluding rows removed by merges) ==`)
for (const u of liveUpdates) {
  console.log(`  #${u.id} ${u.name}: ${JSON.stringify(u.before)} -> ${JSON.stringify(u.patch)}`)
}
console.log(`\nPlayers after apply: ${players.length - removed.size}`)

if (!APPLY) {
  console.log('\nDry run only. Re-run with --apply to write.')
  process.exit(0)
}

// Writes: abort on first failure. Keep-row patch goes before any delete so manual fields can't be lost.
for (const u of liveUpdates) {
  const { error } = await supabase.from('players').update(u.patch).eq('id', u.id)
  check(error, `update player ${u.id}`)
}
for (const c of chantUpdates) {
  const { error } = await supabase.from('team_chants').update({ team: c.to }).eq('id', c.id)
  check(error, `update team_chant ${c.id}`)
}
for (const m of merges) {
  if (Object.keys(m.patch).length) {
    const { error } = await supabase.from('players').update(m.patch).eq('id', m.keepId)
    check(error, `patch keep row ${m.keepId}`)
  }
  const { error } = await supabase.from('players').delete().in('id', m.removeIds)
  check(error, `delete duplicates of ${m.keepId}`)
}
console.log('\nApplied.')
