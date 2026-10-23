// 回填 CPBL 歷史球員：依 Acnt 逐一掃官網個人頁，把 DB 沒有的人以 status='departed' 補進 players
// 可中斷續跑（進度檔）；不加 --apply 只掃描與回報，不寫 DB
// 用法：node scripts/backfill-cpbl-history.mjs [--apply] [--limit N] [--start N] [--progress <path>]
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadEnv, createServiceClient } from './lib/env.mjs'
import { createCpblSession, parsePersonPage } from './lib/cpblClient.mjs'
import { matchUnkeyed } from './lib/playerMerge.mjs'
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

// 無效 Acnt 會連續出現；超過最高有效 id 後連續 N 個無效即視為掃完
export function shouldStop(state, limit = STOP_AFTER_INVALID) {
  return state.invalidRun >= limit
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

// 缺值欄位保持省略（DB default 生效）；isPlayer:false（教練/工作人員）→ is_coach:true
export function buildRow({ isPlayer, ...parsed }) {
  return { org: 'CPBL', status: 'departed', ...parsed, is_coach: !isPlayer }
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

// 把掃到的人分成：DB 已有（略過）、可與無 acnt 的舊資料同名配對（補 acnt）、同名多筆（人工判斷）、全新（插入）
export function planBackfill(found, dbRows) {
  const known = new Set(dbRows.map(r => r.cpbl_acnt).filter(Boolean))
  const fresh = found.filter(f => !known.has(f.cpbl_acnt))
  const { matches, ambiguous } = matchUnkeyed(dbRows, fresh.map(f => ({ key: f.cpbl_acnt, name: f.name })), { org: 'CPBL', keyField: 'cpbl_acnt' })
  const handled = new Set([...matches.map(m => m.key), ...ambiguous.flatMap(a => fresh.filter(f => f.name === a.name).map(f => f.cpbl_acnt))])
  return {
    skipped: found.length - fresh.length,
    matches,
    ambiguous,
    inserts: fresh.filter(f => !handled.has(f.cpbl_acnt)).map(buildRow),
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
  if (args.start !== null) state = { ...state, next: args.start }
  console.log(`起點 Acnt=${formatAcnt(state.next)}，已找到 ${state.found.length} 筆，最高有效 ${state.highestValid}，連續無效 ${state.invalidRun}${args.apply ? '（--apply）' : '（dry run）'}`)

  let session = await createCpblSession()
  const fetchPerson = async id => {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await session.get(`/team/person?Acnt=${formatAcnt(id)}`)
        if (res.status === 200) return parsePersonPage(res.html)
        console.warn(`Acnt ${formatAcnt(id)}: HTTP ${res.status}，重建 session`)
      } catch (e) {
        console.warn(`Acnt ${formatAcnt(id)}: ${e.message}，重建 session`)
      }
      // 不可把失敗當成「無效 id」，否則會錯過真實球員
      if (attempt >= FETCH_ATTEMPTS) throw new Error(`Acnt ${formatAcnt(id)}: ${FETCH_ATTEMPTS} 次失敗，中止（進度已保存，可續跑）`)
      await sleep(REQUEST_INTERVAL_MS * attempt * 2)
      session = await createCpblSession()
    }
  }

  // Ctrl-C / kill：處理完手上這個 id、存檔後再結束，避免丟掉未滿 25 個的進度
  let interrupted = false
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { interrupted = true })

  let processed = 0
  try {
    while (!interrupted && !shouldStop(state) && processed < args.limit) {
      const id = state.next
      const person = await fetchPerson(id)
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
  const done = shouldStop(state)
  console.log(done ? `掃描完成：連續 ${STOP_AFTER_INVALID} 個無效，最高有效 Acnt=${formatAcnt(state.highestValid)}` : `本次處理 ${processed} 個 id，尚未掃完（next=${state.next}）`)

  loadEnv()
  const supabase = createServiceClient()
  const dbRows = await fetchAllPages(() => supabase.from('players').select('id, name, org, cpbl_acnt').eq('org', 'CPBL').order('id'))
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
    const { error } = await supabase.from('players').insert(plan.inserts.slice(i, i + INSERT_BATCH))
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
