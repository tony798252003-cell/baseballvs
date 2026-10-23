// 回填 CPBL 歷史球員：依 Acnt 逐一掃官網個人頁，把 DB 沒有的人以 status='departed' 補進 players
// 可中斷續跑（進度檔）；不加 --apply 只掃描與回報，不寫 DB
// 用法：node scripts/backfill-cpbl-history.mjs [--apply] [--limit N] [--start N] [--progress <path>]
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadEnv, createServiceClient } from './lib/env.mjs'
import { createCpblSession, parsePersonPage } from './lib/cpblClient.mjs'
import { matchUnkeyed } from './lib/playerMerge.mjs'
import { canonicalTeamName } from '../src/constants/teams.js'
import { fetchAllPages } from '../src/lib/fetchAllPages.js'

export const DEFAULT_PROGRESS = 'scripts/.cache/cpbl-history-progress.json'
export const STOP_AFTER_INVALID = 300
const SAVE_EVERY = 25
const REQUEST_INTERVAL_MS = 1000
const FETCH_ATTEMPTS = 3
const INSERT_BATCH = 200

export const formatAcnt = n => String(n).padStart(10, '0')

export function newState(next = 1) {
  return { next, found: [], highestValid: 0, invalidRun: 0 }
}

// 無效 Acnt 會連續出現（實測 4037 之後有 >300 個空洞，之後仍有有效 id）：
// 至少見過一個有效 id、連續 N 個無效、且已掃過 DB 內最大的 cpbl_acnt，才視為掃完
export function shouldStop(state, maxDbAcnt = 0, limit = STOP_AFTER_INVALID) {
  return state.highestValid > 0 && state.invalidRun >= limit && state.next > maxDbAcnt
}

export function maxAcnt(dbRows) {
  return Math.max(0, ...dbRows.map(r => Number(r.cpbl_acnt)).filter(Number.isFinite))
}

// 純函式：記錄單一 id 的結果並把 next 往前推
export function advanceState(state, id, person) {
  const next = { ...state, next: id + 1 }
  if (!person) return { ...next, invalidRun: state.invalidRun + 1 }
  return {
    ...next,
    found: [...state.found, { cpbl_acnt: formatAcnt(id), ...person }],
    highestValid: Math.max(state.highestValid, id),
    invalidRun: 0,
  }
}

// 缺值欄位保持省略（insert 時用 defaultToNull:false，DB default 生效）；isPlayer:false（教練/工作人員）→ is_coach:true
// number 為 NOT NULL 且無 default → 缺值時填 ''；team 再正規化一次（進度檔可能是加入簡稱別名前掃的）
export function buildRow({ isPlayer, ...parsed }) {
  const row = { org: 'CPBL', status: 'departed', ...parsed, number: parsed.number ?? '', is_coach: !isPlayer }
  if (row.team !== undefined) row.team = canonicalTeamName(row.team)
  return row
}

export function parseArgs(argv) {
  const args = { apply: false, limit: Infinity, start: null, progress: DEFAULT_PROGRESS }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') args.apply = true
    else if (a === '--limit') args.limit = Number(argv[++i])
    else if (a === '--start') args.start = Number(argv[++i])
    else if (a === '--progress') args.progress = argv[++i]
    else throw new Error(`Unknown argument: ${a}`)
  }
  if (args.limit !== Infinity && !(Number.isInteger(args.limit) && args.limit > 0)) throw new Error('--limit needs a positive integer')
  if (args.start !== null && !(Number.isInteger(args.start) && args.start > 0)) throw new Error('--start needs a positive integer')
  return args
}

// 把掃到的人分成：DB 已有（略過）、可與無 acnt 的舊資料配對（補 acnt）、需人工判斷（ambiguous）、全新（插入）
// 只憑姓名辨識身分太弱，所以只在「掃到的頁面同名只有一個、未綁 acnt 的非教練 DB 列同名也只有一列、且隊名（正規化後）相同」時才自動配對
// （教練列不參與，同名歷史球員另插新列；同名不同隊 → 待人工判斷）
// dbRows 須含所有聯盟：別聯盟的列帶同一個 acnt 也算 DB 已有
export function planBackfill(rawFound, dbRows) {
  const found = [...new Map(rawFound.map(f => [f.cpbl_acnt, f])).values()] // 續跑重掃可能有重複 acnt
  const known = new Set(dbRows.map(r => r.cpbl_acnt).filter(Boolean))
  const fresh = found.filter(f => !known.has(f.cpbl_acnt))
  const freshByName = Map.groupBy(fresh, f => f.name)
  const { matches: rawMatches, ambiguous: rawAmbiguous } = matchUnkeyed(dbRows, fresh.map(f => ({ key: f.cpbl_acnt, name: f.name })), { org: 'CPBL', keyField: 'cpbl_acnt' })

  const ambiguous = new Map() // name -> { name, candidates, acnts }
  const flag = (name, candidates) => ambiguous.set(name, { name, candidates, acnts: freshByName.get(name).map(f => f.cpbl_acnt) })
  for (const a of rawAmbiguous) flag(a.name, a.candidates)
  const matches = []
  const dbById = new Map(dbRows.map(r => [r.id, r]))
  const sameTeam = (a, b) => a != null && b != null && canonicalTeamName(a) === canonicalTeamName(b)
  for (const m of rawMatches) {
    const f = fresh.find(f => f.cpbl_acnt === m.key)
    if (freshByName.get(f.name).length > 1 || !sameTeam(f.team, dbById.get(m.id).team)) flag(f.name, [String(m.id)])
    else matches.push(m)
  }
  const linked = new Set(matches.map(m => m.key))
  return {
    skipped: found.length - fresh.length,
    matches,
    ambiguous: [...ambiguous.values()],
    inserts: fresh.filter(f => !linked.has(f.cpbl_acnt) && !ambiguous.has(f.name)).map(buildRow),
  }
}

// 單一 id 的抓取。回傳 person，或 null（有正面證據的無效 id：被導向離開 /team/person）。
// 200 但仍在 /team/person 卻解析不出來（CDN 攔截頁等）不是無效：換 session 重抓，仍不行就丟錯中止
export async function fetchPerson(id, ctx) {
  const { createSession, sleep = () => {}, attempts = FETCH_ATTEMPTS } = ctx
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await ctx.session.get(`/team/person?Acnt=${formatAcnt(id)}`)
      if (res.status === 200) {
        const person = parsePersonPage(res.html)
        if (person) return person
        if (new URL(res.url).pathname !== '/team/person') return null
        console.warn(`Acnt ${formatAcnt(id)}: 頁面無法解析（仍在 /team/person），重建 session`)
      } else {
        console.warn(`Acnt ${formatAcnt(id)}: HTTP ${res.status}，重建 session`)
      }
    } catch (e) {
      console.warn(`Acnt ${formatAcnt(id)}: ${e.message}，重建 session`)
    }
    // 不可把失敗當成「無效 id」，否則會錯過真實球員
    if (attempt >= attempts) throw new Error(`Acnt ${formatAcnt(id)}: ${attempts} 次失敗，中止（進度已保存，可續跑）`)
    await sleep(REQUEST_INTERVAL_MS * attempt * 2)
    ctx.session = await createSession()
  }
}

function loadProgress(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}

function saveProgress(path, state) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(state))
  renameSync(tmp, path)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  const args = parseArgs(process.argv.slice(2))
  let state = loadProgress(args.progress) ?? newState()
  if (args.start !== null) state = { ...state, next: args.start, invalidRun: 0 }
  console.log(`起點 Acnt=${formatAcnt(state.next)}，已找到 ${state.found.length} 筆，最高有效 ${state.highestValid}，連續無效 ${state.invalidRun}${args.apply ? '（--apply）' : '（dry run）'}`)

  loadEnv()
  const supabase = createServiceClient()
  const dbRows = await fetchAllPages(() => supabase.from('players').select('id, name, org, team, cpbl_acnt, is_coach').order('id'))
  const maxDbAcnt = maxAcnt(dbRows)
  const ctx = { session: await createCpblSession(), createSession: createCpblSession, sleep }

  // Ctrl-C / kill：處理完手上這個 id、存檔後再結束，避免丟掉未滿 25 個的進度
  let interrupted = false
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { interrupted = true })

  let processed = 0
  try {
    while (!interrupted && !shouldStop(state, maxDbAcnt) && processed < args.limit) {
      const id = state.next
      const person = await fetchPerson(id, ctx)
      state = advanceState(state, id, person)
      processed++
      console.log(`${formatAcnt(id)} ${person ? `${person.name}${person.isPlayer ? '' : '（非球員）'}` : '-'}`)
      if (processed % SAVE_EVERY === 0) {
        saveProgress(args.progress, state)
        console.log(`-- saved next=${state.next} found=${state.found.length}`)
      }
      await sleep(REQUEST_INTERVAL_MS)
    }
  } finally {
    saveProgress(args.progress, state)
    console.log(`-- saved next=${state.next} found=${state.found.length}`)
  }

  if (interrupted) {
    console.log(`已中斷，進度已保存（next=${state.next}）`)
    return
  }
  const done = shouldStop(state, maxDbAcnt)
  console.log(done ? `掃描完成：連續 ${STOP_AFTER_INVALID} 個無效，最高有效 Acnt=${formatAcnt(state.highestValid)}` : `本次處理 ${processed} 個 id，尚未掃完（next=${state.next}）`)

  const plan = planBackfill(state.found, dbRows)
  console.log(`找到 ${state.found.length}；DB 已有 ${plan.skipped}；配對舊資料補 acnt ${plan.matches.length}；同名待判斷 ${plan.ambiguous.length}；新增 ${plan.inserts.length}`)

  if (plan.ambiguous.length) {
    const path = join(dirname(args.progress), 'cpbl-history-ambiguous.json')
    writeFileSync(path, JSON.stringify(plan.ambiguous, null, 2))
    console.log(`同名待判斷清單：${path}`)
  }

  if (!args.apply) {
    console.log('dry run：未寫入 DB（加 --apply 才會寫入）')
    return
  }
  for (const m of plan.matches) {
    const { error } = await supabase.from('players').update({ cpbl_acnt: m.key }).eq('id', m.id)
    if (error) throw error
  }
  for (let i = 0; i < plan.inserts.length; i += INSERT_BATCH) {
    const { error } = await supabase.from('players').insert(plan.inserts.slice(i, i + INSERT_BATCH), { defaultToNull: false })
    if (error) throw error
    console.log(`inserted ${Math.min(i + INSERT_BATCH, plan.inserts.length)}/${plan.inserts.length}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => {
    console.error(e)
    process.exit(1)
  })
}
