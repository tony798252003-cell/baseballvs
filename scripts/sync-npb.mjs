// Usage: node scripts/sync-npb.mjs [--apply]
// Without --apply this is read-only: it fetches baseball.yahoo.co.jp and prints the planned changes.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { loadEnv, createServiceClient } from './lib/env.mjs'
import { fetchNpbRoster, parseNpbRoster } from './lib/npbClient.mjs'
import { planRosterSync, checkSafetyValve } from './lib/rosterSync.mjs'
import { matchNpbUnkeyed, filterNpbUpdates, dedupeByKey, planUnlinkedDepartures, fillEmptyPosition } from './lib/npbSync.mjs'
import { buildSummary } from './lib/syncSummary.mjs'
import { TEAMS } from '../src/constants/teams.js'

const APPLY = process.argv.includes('--apply')
const COUNTS_DIR = 'scripts/.cache'
const COUNTS_FILE = `${COUNTS_DIR}/npb-last-counts.json`
const TEAM_DELAY_MS = 1000
const BATCH = 200

loadEnv()
const supabase = createServiceClient()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function check(error, what) {
  if (error) {
    console.error(`FAILED: ${what}: ${error.message}`)
    process.exit(1)
  }
}

// PostgREST caps a response at 1000 rows, so page through.
async function fetchAllPlayers() {
  const all = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('players').select('*').order('id').range(from, from + 999)
    check(error, 'read players')
    all.push(...data)
    if (data.length < 1000) return all
  }
}

async function fetchRosters() {
  const scraped = []
  const pageCounts = {}
  const teams = TEAMS.filter((t) => t.yahooTeamId)
  for (const [i, team] of teams.entries()) {
    console.log(`  抓取 ${team.name}...`)
    const rows = parseNpbRoster(await fetchNpbRoster(team.yahooTeamId), { team: team.name })
    pageCounts[team.name] = rows.length
    scraped.push(...rows)
    if (i < teams.length - 1) await sleep(TEAM_DELAY_MS)
  }
  return { scraped, pageCounts }
}

function readPreviousCounts() {
  try {
    return JSON.parse(readFileSync(COUNTS_FILE, 'utf8'))
  } catch {
    return null
  }
}

// 順序：更新（含補 npb_id）→ 新增 → 離隊；任一失敗立刻中止
async function apply({ updates, inserts, departures }) {
  for (const u of updates) {
    const { error } = await supabase.from('players').update(u.patch).eq('id', u.id)
    check(error, `update player ${u.id}`)
  }
  for (let i = 0; i < inserts.length; i += BATCH) {
    const { error } = await supabase.from('players').insert(inserts.slice(i, i + BATCH), { defaultToNull: false })
    check(error, `insert players batch ${i / BATCH}`)
  }
  const ids = departures.map((d) => d.id)
  for (let i = 0; i < ids.length; i += BATCH) {
    const { error } = await supabase.from('players').update({ status: 'departed' }).in('id', ids.slice(i, i + BATCH))
    check(error, `mark departures batch ${i / BATCH}`)
  }
}

async function main() {
  console.log(`NPB 名單同步（${APPLY ? '--apply 寫入模式' : 'dry run，不寫入'}）\n`)
  const { scraped: rawScraped, pageCounts } = await fetchRosters()
  const scraped = dedupeByKey(rawScraped)

  const valve = checkSafetyValve(pageCounts, readPreviousCounts())
  if (!valve.ok) {
    console.error(`安全閥觸發，中止：${valve.reason}`)
    process.exit(1)
  }

  const dbPlayers = await fetchAllPlayers()
  const { matches, ambiguous } = matchNpbUnkeyed(dbPlayers, scraped)
  const linkById = new Map(matches.map((m) => [m.id, m.key]))
  // 先綁上 npb_id，planner 才會把這些列當作既有列更新、而不是新增
  const linked = dbPlayers.map((r) => (linkById.has(r.id) ? { ...r, npb_id: linkById.get(r.id) } : r))

  const planned = planRosterSync({ dbPlayers: linked, scraped, org: 'NPB', keyField: 'npb_id' })
  const plan = { ...planned, updates: fillEmptyPosition(filterNpbUpdates(planned.updates, linked), scraped, linked) }

  const patches = new Map(plan.updates.map((u) => [u.id, { ...u.patch }]))
  for (const [id, key] of linkById) patches.set(id, { npb_id: key, ...patches.get(id) })
  const updates = [...patches].map(([id, patch]) => ({ id, patch }))

  console.log(`\n${buildSummary({ plan, links: matches, ambiguous, pageCounts, keyField: 'npb_id' })}\n`)
  const unlinked = planUnlinkedDepartures(dbPlayers, new Set(linkById.keys()))
  console.log(`將標記離隊（既有 NPB 列比對後仍無對應）${unlinked.length}：${unlinked.map((r) => `${r.name}(${r.team}, id=${r.id})`).join('、') || '無'}\n`)

  if (!APPLY) {
    console.log('dry run 結束（未寫入）。加 --apply 才會寫入。')
    return
  }

  await apply({ updates, inserts: plan.inserts, departures: [...plan.departures, ...unlinked] })
  mkdirSync(COUNTS_DIR, { recursive: true })
  writeFileSync(COUNTS_FILE, JSON.stringify(pageCounts, null, 2))
  console.log(`完成，已寫入並更新 ${COUNTS_FILE}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
