// 應援曲工作台：本機伺服器（只綁 127.0.0.1）。讀資料庫找缺歌球員 → 搜尋 YouTube → 下載 → 建議切點，
// 卡片頁在 scripts/chant-studio/。只有 POST /api/submit（頁面上的「📤 送出」）會上傳 Dropbox 並寫入 players.song／intro。
//
// node scripts/chant-studio.mjs --team 樂天桃猿 [--team …] [--league 一軍] [--org CPBL] [--include-pitchers]
//   [--batch name] [--port 8777] [--cookies-from-browser chrome] [--no-open]
import { spawn } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createServiceClient, loadEnv } from './lib/env.mjs'
import { fetchAllPages } from '../src/lib/fetchAllPages.js'
import { searchPlayer } from './lib/youtubeSearch.mjs'
import { TARGET_LUFS, computeGainDb, decodeDurationSec, decodePcm, findBinary, measureLoudness, renderPair } from './lib/audioCut.mjs'
import { getDropboxAccessToken, getSharedLinkRawUrl, uploadToDropbox } from './lib/dropboxMusicSync.mjs'
import { suggestCut } from './lib/cutSuggest.mjs'
import { STUDIO_DIR, batchName, loadState, mergePlayers, saveState } from './lib/studioState.mjs'
import { createSubmitter, submitApproved } from './lib/studioSubmit.mjs'
import {
  applyCardEdit, checkRequest, chooseNextCandidate, mediaPath, nextCardId, retryCard, runPipeline, safeJoin, selectPlayers,
  useCustomUrl,
} from './lib/studioPipeline.mjs'

const PAGE_DIR = fileURLToPath(new URL('./chant-studio/', import.meta.url))
const ANALYSIS_RATE = 11025
const SEARCH_GAP_MS = 1600
const MAX_BODY = 64 * 1024
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.webm': 'audio/webm', '.opus': 'audio/ogg',
}

const { values: args } = parseArgs({
  options: {
    team: { type: 'string', multiple: true, default: [] },
    league: { type: 'string' },
    org: { type: 'string', default: 'CPBL' },
    'include-pitchers': { type: 'boolean', default: false },
    batch: { type: 'string' },
    port: { type: 'string', default: '8777' },
    'cookies-from-browser': { type: 'string' },
    'no-open': { type: 'boolean', default: false },
  },
})
if (args.batch && !/^[^\\/:*?"<>|\s.][^\\/:*?"<>|\s]*$/.test(args.batch)) {
  console.error(`--batch 名稱不可含路徑字元或空白：${args.batch}`)
  process.exit(1)
}
const port = Number(args.port)
const cookies = args['cookies-from-browser']
const scope = { teams: args.team, league: args.league, org: args.org, includePitchers: args['include-pitchers'] }
const batch = args.batch ?? batchName(scope)
const save = (s) => saveState(s)

// ---- 讀資料庫（唯讀）並建立狀態 ----
loadEnv()
const supabase = createServiceClient()
const rows = await fetchAllPages(() => supabase
  .from('players')
  .select('id, name, number, team, main_position, league, org, status, is_coach, song')
  .order('id'))
const players = selectPlayers(rows, scope)
if (!players.length) console.warn('⚠ 沒有符合條件的球員（檢查 --team／--league／--org）')

// The single in-memory state: every handler and the pipeline mutate it, then save.
const state = mergePlayers(loadState(batch), players)
save(state)

// ---- 外部動作：搜尋、下載、分析 ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let lastSearchAt = 0
async function search(card) {
  await sleep(Math.max(0, lastSearchAt + SEARCH_GAP_MS - Date.now()))
  try {
    const otherNames = Object.values(state.cards).map((c) => c.name).filter((n) => n !== card.name)
    return await searchPlayer({ name: card.name, team: card.team }, { otherNames })
  } finally {
    lastSearchAt = Date.now()
  }
}

function run(bin, argv) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, argv)
    let stderr = ''
    proc.stdout.resume()
    proc.stderr.on('data', (d) => { stderr += d })
    proc.on('error', reject)
    proc.on('close', (code) => (code === 0 ? resolve() : reject(Object.assign(new Error(`exit ${code}`), { stderr }))))
  })
}

async function download(card, { videoId, url }) {
  const rel = `${batch}/orig/${card.playerId}-${videoId}.mp3`
  const dir = join(STUDIO_DIR, batch, 'orig')
  mkdirSync(dir, { recursive: true })
  const argv = ['-x', '--audio-format', 'mp3', '--ffmpeg-location', findBinary('ffmpeg'),
    '-o', join(dir, `${card.playerId}-${videoId}.%(ext)s`)]
  if (cookies) argv.push('--cookies-from-browser', cookies)
  argv.push(url)
  try {
    await run(findBinary('yt-dlp'), argv)
  } catch (e) {
    const detail = (e.stderr ?? e.message).trim().split('\n').filter((l) => /ERROR|error/.test(l)).slice(-2).join(' | ') || e.message
    const botCheck = /not a bot|sign in to confirm|cookies/i.test(e.stderr ?? '')
    const hint = botCheck && !cookies ? '（YouTube 要求驗證：請用 --cookies-from-browser chrome 重新啟動工作台）' : ''
    throw new Error(`yt-dlp 下載失敗：${detail}${hint}`)
  }
  if (!existsSync(join(STUDIO_DIR, rel))) throw new Error(`yt-dlp 沒有產生 ${rel}`)
  return rel
}

async function analyze(rel) {
  const file = join(STUDIO_DIR, rel)
  const { integratedLufs } = await measureLoudness(file)
  computeGainDb({ integratedLufs }) // throws for silent/unreadable audio -> card error
  const durationSec = await decodeDurationSec(file)
  const suggestion = suggestCut(await decodePcm(file, ANALYSIS_RATE), ANALYSIS_RATE)
  return { integratedLufs, durationSec, suggestion }
}

// ---- 依序處理（一次一張），使用者的 換版本／貼網址／重試 先排 ----
const queue = []
let processing = null
let running = false
function kick() {
  if (running) return
  running = true
  runPipeline(state, { search, download, analyze, save }, { queue, onStart: (id) => { processing = id; console.log(`… ${state.cards[id].name}`) } })
    .catch((e) => console.error('pipeline stopped:', e))
    .finally(() => {
      running = false
      processing = null
      if (nextCardId(state, [...queue])) kick()
    })
}

// ---- 送出（一次只跑一個）：重新讀資料庫 → 產生成品 → 上傳 Dropbox → 只寫 song／intro ----
async function readPlayer(id) {
  const { data, error } = await supabase.from('players').select('id, name, team, song, intro').eq('id', id).maybeSingle()
  if (error) throw new Error(`讀取球員失敗：${error.message}`)
  return data
}
async function findNameConflict({ id, team, name }) {
  const { data, error } = await supabase.from('players').select('id, song, intro').eq('team', team).eq('name', name).neq('id', id)
  if (error) throw new Error(`檢查同名球員失敗：${error.message}`)
  return data.some((r) => [r.song, r.intro].some((v) => v != null && String(v).trim() !== ''))
}
// Conditional write: only while every patched column is still null/empty; returns the number of rows written.
async function writePlayer(id, patch) {
  const stillEmpty = Object.keys(patch).map((k) => `or(${k}.is.null,${k}.eq.)`).join(',')
  const { data, error } = await supabase.from('players').update(patch).eq('id', id).or(`and(${stillEmpty})`).select('id')
  if (error) throw new Error(`寫入資料庫失敗：${error.message}`)
  return data.length
}
const submitter = createSubmitter(async (onStart) => {
  const summary = await submitApproved(state, {
    readPlayer,
    findNameConflict,
    writePlayer,
    render: renderPair,
    upload: async (local, remote) => uploadToDropbox(await getDropboxAccessToken(), local, remote),
    link: async (remote) => getSharedLinkRawUrl(await getDropboxAccessToken(), remote),
    save,
    log: (msg) => console.log(msg),
  }, { busyId: processing, onStart })
  console.log(`送出完成：上傳 ${summary.uploaded.length}、跳過 ${summary.skipped.length}、失敗 ${summary.failed.length}`)
  return summary
})

// ---- HTTP ----
const sendJson = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': MIME['.json'] })
  res.end(JSON.stringify(body))
}

function sendFile(res, file) {
  let st
  try { st = file && statSync(file) } catch { st = null }
  if (!st?.isFile()) return sendJson(res, 404, { error: 'not found' })
  res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': st.size })
  createReadStream(file).on('error', () => res.destroy()).pipe(res)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (d) => {
      body += d
      if (body.length > MAX_BODY) {
        reject(Object.assign(new Error('body too large'), { status: 413 }))
        req.destroy()
      }
    })
    req.on('end', () => {
      let parsed
      try { parsed = body ? JSON.parse(body) : {} } catch { parsed = undefined }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) resolve(parsed)
      else reject(Object.assign(new Error('body must be a JSON object'), { status: 400 }))
    })
    req.on('error', reject)
  })
}

function apiState() {
  const cards = Object.values(state.cards)
  const counts = { total: cards.length }
  for (const c of cards) counts[c.status] = (counts[c.status] ?? 0) + 1
  return { batch, targetLufs: TARGET_LUFS, processing, queued: [...queue], counts, cards }
}

const CARD_ACTIONS = { next: chooseNextCandidate, retry: retryCard, url: (card, body) => useCustomUrl(card, body.url) }

async function handle(req, res) {
  const denied = checkRequest({ method: req.method, host: req.headers.host, origin: req.headers.origin, contentType: req.headers['content-type'] }, port)
  if (denied) return sendJson(res, denied.status, { error: denied.error })
  const { pathname } = new URL(req.url, 'http://127.0.0.1')
  let path
  try { path = decodeURIComponent(pathname) } catch { return sendJson(res, 400, { error: 'bad path' }) }

  if (req.method === 'GET' && path === '/api/state') return sendJson(res, 200, apiState())
  if (req.method === 'GET' && path.startsWith('/media/')) return sendFile(res, mediaPath(STUDIO_DIR, batch, path.slice('/media/'.length)))
  if (req.method === 'POST' && path === '/api/submit') {
    await readJson(req)
    const { status, body } = await submitter.request()
    return sendJson(res, status, body)
  }

  const m = /^\/api\/cards\/([^/]+)(?:\/(next|url|retry))?$/.exec(path)
  if (req.method === 'POST' && m) {
    const card = state.cards[m[1]]
    if (!card) return sendJson(res, 404, { error: '找不到這張卡片' })
    const body = await readJson(req)
    // Checked after the body is read so the check and the mutation below run without an await in between.
    if (processing === m[1] || submitter.currentId() === m[1]) return sendJson(res, 409, { error: '這張卡片正在處理中，請稍候' })
    const error = m[2] ? CARD_ACTIONS[m[2]](card, body) : applyCardEdit(card, body)
    if (error) return sendJson(res, 400, { error })
    save(state)
    if (m[2]) {
      queue.push(m[1])
      kick()
    }
    return sendJson(res, 200, card)
  }

  if (req.method === 'GET') return sendFile(res, path === '/' ? join(PAGE_DIR, 'index.html') : safeJoin(PAGE_DIR, path.slice(1)))
  return sendJson(res, 404, { error: 'not found' })
}

const server = createServer((req, res) => {
  handle(req, res).catch((e) => sendJson(res, e.status ?? 500, { error: e.message }))
})
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`
  console.log(`應援曲工作台：${url}（批次 ${batch}，${Object.keys(state.cards).length} 張卡片）`)
  if (!args['no-open']) spawn('open', [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
  kick()
})
