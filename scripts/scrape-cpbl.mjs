// Usage: node scripts/scrape-cpbl.mjs [--apply]
// Without --apply this is read-only: it fetches cpbl.com.tw and prints the planned changes.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { loadEnv, createServiceClient } from './lib/env.mjs'
import { createCpblSession, parseTeamPage, parsePersonPage } from './lib/cpblClient.mjs'
import { planRosterSync, checkSafetyValve } from './lib/rosterSync.mjs'
import { matchUnkeyed } from './lib/playerMerge.mjs'
import { dropShadowedCoaches } from './lib/dedupeScraped.mjs'
import { buildSummary } from './lib/syncSummary.mjs'
import { TEAMS } from '../src/constants/teams.js'

const APPLY = process.argv.includes('--apply')
const COUNTS_DIR = 'scripts/.cache'
const COUNTS_FILE = `${COUNTS_DIR}/cpbl-last-counts.json`
const KINDS = [{ code: 'A', league: '一軍' }, { code: 'D', league: '二軍' }]
const TEAM_DELAY_MS = 800
const PERSON_DELAY_MS = 1000
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

async function fetchRosters(session) {
  const scraped = []
  const pageCounts = {}
  for (const team of TEAMS.filter((t) => t.cpblClubNo)) {
    for (const kind of KINDS) {
      const page = `${team.cpblClubNo}-${kind.code}`
      console.log(`  抓取 ${team.name} ${kind.league}...`)
      const res = await session.post('/team', `ClubNo=${team.cpblClubNo}&KindCode=${kind.code}`)
      const rows = res.status === 200 ? parseTeamPage(res.html, { team: team.name, league: kind.league }) : []
      pageCounts[page] = rows.length
      scraped.push(...rows)
      await sleep(TEAM_DELAY_MS)
    }
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

// 只有新增列才需要個人頁（投打手、細分守位只在 insert 時寫入）
async function enrichInserts(session, inserts) {
  const withKey = inserts.filter((i) => i.cpbl_acnt)
  for (let i = 0; i < withKey.length; i++) {
    const ins = withKey[i]
    let person = null
    let why = ''
    try {
      const res = await session.get(`/team/person?Acnt=${ins.cpbl_acnt}`)
      person = res.status === 200 ? parsePersonPage(res.html) : null
      if (!person) why = res.status === 200 ? '頁面解析失敗' : `HTTP ${res.status}`
    } catch (e) {
      why = e.message
    }
    if (why) console.warn(`\n  警告：${ins.name} (Acnt=${ins.cpbl_acnt}) 球員頁無法取得（${why}），略過投打手/守位`)
    if (person?.isPlayer) {
      for (const f of ['pitching_hand', 'batting_hand', 'main_position']) if (person[f] !== undefined) ins[f] = person[f]
    }
    process.stdout.write(`\r  球員頁 ${i + 1}/${withKey.length}`)
    await sleep(PERSON_DELAY_MS)
  }
  if (withKey.length) console.log()
}

// 順序：更新（含補 cpbl_acnt）→ 新增 → 離隊；任一失敗立刻中止
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
  console.log(`CPBL 名單同步（${APPLY ? '--apply 寫入模式' : 'dry run，不寫入'}）\n`)
  const session = await createCpblSession()
  const { scraped: rawScraped, pageCounts } = await fetchRosters(session)
  const { kept: scraped, dropped: dedupedCoaches } = dropShadowedCoaches(rawScraped)

  const valve = checkSafetyValve(pageCounts, readPreviousCounts())
  if (!valve.ok) {
    console.error(`安全閥觸發，中止：${valve.reason}`)
    process.exit(1)
  }

  const dbPlayers = await fetchAllPlayers()
  const { matches, ambiguous } = matchUnkeyed(dbPlayers, scraped, { org: 'CPBL', keyField: 'cpbl_acnt' })
  const linkById = new Map(matches.map((m) => [m.id, m.key]))
  // 先綁上 cpbl_acnt，planner 才會把這些列當作既有列更新、而不是新增
  const linked = dbPlayers.map((r) => (linkById.has(r.id) ? { ...r, cpbl_acnt: linkById.get(r.id) } : r))

  const plan = planRosterSync({ dbPlayers: linked, scraped, org: 'CPBL', keyField: 'cpbl_acnt' })

  const patches = new Map(plan.updates.map((u) => [u.id, { ...u.patch }]))
  for (const [id, key] of linkById) patches.set(id, { cpbl_acnt: key, ...patches.get(id) })
  const updates = [...patches].map(([id, patch]) => ({ id, patch }))

  console.log(`\n${buildSummary({ plan, links: matches, ambiguous, pageCounts, dedupedCoaches })}\n`)

  if (!APPLY) {
    console.log('dry run 結束（未寫入、未抓球員個人頁）。加 --apply 才會寫入。')
    return
  }

  await enrichInserts(session, plan.inserts)
  await apply({ updates, inserts: plan.inserts, departures: plan.departures })
  mkdirSync(COUNTS_DIR, { recursive: true })
  writeFileSync(COUNTS_FILE, JSON.stringify(pageCounts, null, 2))
  console.log(`完成，已寫入並更新 ${COUNTS_FILE}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
