// YouTube 搜尋結果解析與應援曲候選排序（只讀網頁，不寫任何東西）。
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MIN_GAP_MS = 1600

// 各隊官方頻道名稱關鍵字（小寫比對）
const OFFICIAL_CHANNELS = {
  樂天桃猿: ['rakuten monkeys', '樂天桃猿'],
  統一獅: ['uni lions', '統一獅', 'uni-lions'],
  富邦悍將: ['fubon guardians', '富邦悍將'],
  味全龍: ['weichuan dragons', 'wei chuan dragons', '味全龍'],
  台鋼雄鷹: ['tsg hawks', 'tsghawks', '台鋼雄鷹'],
  中信兄弟: ['ctbc brothers', '中信兄弟'],
}

const GIRL_GROUPS = ['rakuten girls', '樂天女孩', 'uni girls', 'passion sisters', 'wing stars', 'fubon angels', 'dragon beauties', 'tsghawks girls', 'tsg hawks girls']
const BAD_VERSION = ['交響', 'remix', '改編', 'cover', '鋼琴', '直笛', '教學']
const FANCAM = ['cheerleader', 'fancam', '#shorts', '啦啦隊', '直拍']
const COMPILATION = ['合輯', '合集', '串燒', '大全']

const text = (o) => o?.simpleText ?? o?.runs?.map((r) => r.text).join('') ?? ''

function parseLength(t) {
  if (!t) return null
  const parts = t.split(':').map(Number)
  if (parts.some(Number.isNaN)) return null
  return parts.reduce((s, x) => s * 60 + x, 0)
}

function parseViews(t) {
  const m = /([\d,.]+)\s*([萬万億亿KkMm]?)/.exec(t ?? '')
  if (!m) return 0
  const n = parseFloat(m[1].replace(/,/g, ''))
  if (Number.isNaN(n)) return 0
  const mult = { 萬: 1e4, 万: 1e4, 億: 1e8, 亿: 1e8, k: 1e3, m: 1e6 }[m[2].toLowerCase()] ?? 1
  return Math.round(n * mult)
}

export function parseYoutubeResults(html) {
  const m = /var ytInitialData = (\{.*?\});<\/script>/s.exec(html)
  if (!m) return []
  let data
  try { data = JSON.parse(m[1]) } catch { return [] }
  const out = []
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk)
    if (!o || typeof o !== 'object') return
    if (o.videoRenderer?.videoId) {
      const r = o.videoRenderer
      out.push({
        videoId: r.videoId,
        title: text(r.title),
        lengthSec: parseLength(r.lengthText?.simpleText),
        channel: text(r.ownerText),
        views: parseViews(text(r.viewCountText)),
      })
    }
    Object.values(o).forEach(walk)
  }
  walk(data)
  return out
}

const has = (s, list) => list.find((k) => s.includes(k))

export function rankCandidates(videos, { name, team, otherNames = [] }) {
  const official = OFFICIAL_CHANNELS[team] ?? [team?.toLowerCase()].filter(Boolean)
  const seen = new Set()
  const ranked = []
  for (const v of videos) {
    if (seen.has(v.videoId) || !v.title.includes(name)) continue
    seen.add(v.videoId)
    const title = v.title.toLowerCase()
    const channel = v.channel.toLowerCase()
    let score = 0
    const reasons = []
    const add = (n, why) => { score += n; reasons.push(`${why} ${n > 0 ? '+' : ''}${n}`) }

    if (v.lengthSec == null) add(-20, 'no length')
    else if (v.lengthSec >= 30 && v.lengthSec <= 180) {
      add(30, 'length 30-180s')
      if (v.lengthSec <= 70) add(10, 'short clean edit')
    } else if (v.lengthSec < 30) add(-20, 'too short')
    else add(-Math.min(40, Math.round((v.lengthSec - 180) / 6)), 'too long')

    if (has(channel, official)) add(25, 'official channel')
    const bad = has(title, BAD_VERSION)
    if (bad) add(bad === '教學' ? -30 : -40, `version: ${bad}`)
    const fan = has(title, FANCAM)
    const girls = has(title, GIRL_GROUPS) ?? has(channel, GIRL_GROUPS)
    if (fan || girls) add(-40, `cheerleader/fancam: ${fan ?? girls}`)
    const others = otherNames.filter((n) => n !== name && v.title.includes(n))
    if (others.length >= 2 || has(title, COMPILATION)) add(-30, 'compilation')
    add(Math.round(4 * Math.log10(v.views + 1) * 10) / 10, 'views')

    ranked.push({ ...v, score, reasons })
  }
  return ranked.sort((a, b) => b.score - a.score)
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function searchPlayer({ name, team }, { fetchImpl = fetch, sleep = defaultSleep, otherNames } = {}) {
  const queries = [`${name} 應援曲`, `${team} ${name} 應援曲`]
  const all = []
  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await sleep(MIN_GAP_MS)
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(queries[i])}&hl=zh-TW&gl=TW`
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9' } })
    if (!res.ok) throw new Error(`YouTube search failed: HTTP ${res.status}`)
    all.push(...parseYoutubeResults(await res.text()))
  }
  return rankCandidates(all, { name, team, otherNames }).slice(0, 3)
}
