// 應援曲工作台：球員篩選、逐張卡片處理（搜尋→下載→分析）與卡片編輯規則。外部動作全部由呼叫端注入。
import { join, sep } from 'node:path'

const PITCHER_POSITIONS = new Set(['P', 'SP', 'RP', 'CP'])
const EDIT_STATUSES = new Set(['pending', 'resolved', 'skipped'])
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'])
const VIDEO_ID = /^[\w-]{11}$/

const isEmpty = (v) => v == null || String(v).trim() === ''

export function selectPlayers(rows, { teams = [], league, org = 'CPBL', includePitchers = false } = {}) {
  return rows.filter((r) =>
    (r.org ?? 'CPBL') === org
    && r.status === 'active'
    && !r.is_coach
    && isEmpty(r.song)
    && (!teams.length || teams.includes(r.team))
    && (org !== 'CPBL' || !league || (r.league || '一軍') === league)
    && (includePitchers || !PITCHER_POSITIONS.has(r.main_position)))
}

export const watchUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`

// Returns the 11-char video id of a youtube.com / youtu.be link, or null for anything else.
export function youtubeVideoId(input) {
  let u
  try { u = new URL(input) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  let id = null
  if (u.hostname === 'youtu.be') id = u.pathname.split('/')[1]
  else if (YOUTUBE_HOSTS.has(u.hostname)) {
    const [, first, second] = u.pathname.split('/')
    id = first === 'watch' ? u.searchParams.get('v') : ['shorts', 'live', 'embed'].includes(first) ? second : null
  }
  return id && VIDEO_ID.test(id) ? id : null
}

const needsWork = (c) => c?.status === 'pending' && !c.original

// Queued ids (user clicks) first, then the first pending card in batch order.
export function nextCardId(state, queue = []) {
  while (queue.length) {
    const id = queue.shift()
    if (needsWork(state.cards[id])) return id
  }
  return Object.keys(state.cards).find((id) => needsWork(state.cards[id])) ?? null
}

async function processCard(card, { search, download, analyze }) {
  try {
    let source
    if (card.customUrl) source = { videoId: youtubeVideoId(card.customUrl), url: card.customUrl }
    else {
      // videoId ends up in a file path and a yt-dlp argument: drop anything that is not a plain id
      if (!card.candidates?.length) card.candidates = (await search(card)).filter((v) => VIDEO_ID.test(v?.videoId ?? ''))
      if (!card.candidates.length) {
        card.status = 'notfound'
        return
      }
      const v = card.candidates[card.chosen] ?? card.candidates[0]
      source = { videoId: v.videoId, url: watchUrl(v.videoId) }
    }
    const original = await download(card, source)
    const { integratedLufs, durationSec, suggestion } = await analyze(original)
    // Keep the starting cut inside 0 <= A < B <= duration so edits/renders validate.
    const B = Math.min(suggestion.B, durationSec)
    const A = suggestion.A >= 0 && suggestion.A < B ? suggestion.A : 0
    Object.assign(card, { original, integratedLufs, durationSec, suggestion, A, B, withIntro: suggestion.hasIntro })
    delete card.error
  } catch (e) {
    card.status = 'error'
    card.error = e.message
  }
}

// Processes pending cards without an original one at a time; saves after each card.
// `queue` (mutable) lets the server put user-requested cards first; onStart(id) reports progress.
export async function runPipeline(state, deps, { queue = [], onStart } = {}) {
  for (let id = nextCardId(state, queue); id; id = nextCardId(state, queue)) {
    onStart?.(id)
    await processCard(state.cards[id], deps)
    await deps.save(state)
  }
}

const num = (v) => typeof v === 'number' && Number.isFinite(v)

// Gain basis = integrated LUFS of the song segment A→B of the original (what normalize-music measures on
// the song file). segmentCut is the {A, B} it was measured for; a different cut makes it stale.
const SEGMENT_KEYS = ['segmentLufs', 'segmentCut', 'segmentError']
export const segmentFresh = (card) => !!card.segmentCut && card.segmentCut.A === card.A && card.segmentCut.B === card.B

// Cards whose segment loudness should be (re)measured in the background.
export const needsSegmentMeasure = (card) => !!card.original && card.status !== 'error' && num(card.A) && num(card.B) && !segmentFresh(card)

/**
 * Returns the segment LUFS for the card's current cut, measuring it first when missing or stale
 * (measure(original, A, B) -> integrated LUFS). The result is stored only if the cut did not change meanwhile.
 * Throws for a segment that cannot be measured (silent/unreadable), like the whole-file analysis.
 */
export async function ensureSegmentLufs(card, measure) {
  if (!segmentFresh(card)) {
    const { original, A, B } = card
    let lufs
    let error
    try {
      lufs = await measure(original, A, B)
      if (!num(lufs)) throw new Error(`段落響度為 ${lufs}（無聲或無法讀取）`)
    } catch (e) {
      error = e.message
    }
    if (card.original === original && card.A === A && card.B === B) {
      for (const k of SEGMENT_KEYS) delete card[k]
      Object.assign(card, { segmentCut: { A, B } }, error ? { segmentError: error } : { segmentLufs: lufs })
    }
    if (error) throw new Error(`量測 A→B 響度失敗：${error}`)
    return lufs
  }
  if (card.segmentError) throw new Error(`量測 A→B 響度失敗：${card.segmentError}`)
  return card.segmentLufs
}

// Validates a partial edit against the card; applies it and returns null, or returns an error message unchanged.
export function applyCardEdit(card, body) {
  const next = { A: card.A, B: card.B, fadeMs: card.fadeMs, sliderDb: card.sliderDb, withIntro: card.withIntro, status: card.status }
  for (const k of Object.keys(next)) if (body?.[k] !== undefined) next[k] = body[k]
  if (body?.status !== undefined && !EDIT_STATUSES.has(body.status)) return `不支援的狀態：${body.status}`
  const touchesCut = body?.A !== undefined || body?.B !== undefined || ['pending', 'resolved'].includes(body?.status)
  if (touchesCut) {
    if (!card.original || !num(card.durationSec)) return '尚未下載原曲，無法設定切點或狀態'
    if (!num(next.A) || !num(next.B) || !(next.A >= 0 && next.A < next.B && next.B <= card.durationSec)) {
      return `切點需符合 0 ≤ A < B ≤ ${card.durationSec.toFixed(2)}`
    }
  }
  if (!num(next.fadeMs) || next.fadeMs < 0 || next.fadeMs > 300) return '淡入淡出需在 0–300 ms'
  if (!num(next.sliderDb) || next.sliderDb < -6 || next.sliderDb > 6) return '音量需在 −6～+6 dB'
  if (typeof next.withIntro !== 'boolean') return '有前奏需為 true/false'
  Object.assign(card, next)
  return null
}

// Clears the download/analysis so the pipeline processes the card again; keeps fade/slider preferences.
function resetForReprocess(card) {
  for (const k of ['original', 'integratedLufs', 'durationSec', 'suggestion', 'A', 'B', 'error', ...SEGMENT_KEYS]) delete card[k]
  card.withIntro = false
  card.status = 'pending'
}

export function chooseNextCandidate(card) {
  const n = card.candidates?.length ?? 0
  if (n === 0 || (n === 1 && !card.customUrl)) return '沒有其他候選版本，請貼 YouTube 網址'
  card.chosen = ((card.chosen ?? 0) + 1) % n
  delete card.customUrl
  resetForReprocess(card)
  return null
}

export function useCustomUrl(card, url) {
  const id = youtubeVideoId(url)
  if (!id) return '只接受 youtube.com／youtu.be 的影片網址'
  card.customUrl = watchUrl(id)
  resetForReprocess(card)
  return null
}

export function retryCard(card) {
  if (!['error', 'notfound', 'skipped'].includes(card.status)) return '只有錯誤、找不到或已跳過的卡片可以重試'
  resetForReprocess(card)
  return null
}

// Joins a URL-relative path under root; null for absolute paths, `..`/`.`/empty segments, backslashes or NUL.
export function safeJoin(root, rel) {
  if (!rel || rel.startsWith('/') || /[\\\0]/.test(rel)) return null
  if (rel.split('/').some((s) => s === '' || s === '.' || s === '..')) return null
  const full = join(root, rel)
  return full.startsWith(root.endsWith(sep) ? root : root + sep) ? full : null
}

// Media is limited to <batch>/orig/<file> and <batch>/render/<playerId>/<file> of the current batch.
export function mediaPath(studioDir, batch, rel) {
  const parts = rel?.split('/') ?? []
  const ok = parts[0] === batch && ((parts[1] === 'orig' && parts.length === 3) || (parts[1] === 'render' && parts.length === 4))
  return ok ? safeJoin(studioDir, rel) : null
}

// Local-only guard: Host must be this server (DNS rebinding), a present Origin must be this server,
// and POSTs must be JSON (forces a CORS preflight, which the server never answers with CORS headers).
export function checkRequest({ method, host, origin, contentType }, port) {
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`]
  if (!allowed.includes(host)) return { status: 403, error: 'forbidden host' }
  if (origin !== undefined && !allowed.some((h) => origin === `http://${h}`)) return { status: 403, error: 'forbidden origin' }
  if (method === 'POST' && (contentType ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    return { status: 415, error: 'Content-Type must be application/json' }
  }
  return null
}
