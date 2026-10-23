import { parse } from 'node-html-parser'
import { canonicalTeamName } from '../../src/constants/teams.js'

export const BASE_URL = 'https://www.cpbl.com.tw'
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MAX_REDIRECTS = 5
const BOOTSTRAP_ATTEMPTS = 4

// 守位分類對應（球隊頁面的粗分類，用於跳過教練）
export const POSITION_CATEGORY_MAP = {
  '投手': 'P',
  '捕手': 'C',
  '內野手': 'IF',
  '外野手': 'OF',
  '指定打擊': 'DH',
  '教練': 'COACH',
}

// 詳細守位中英對照（球員個人頁面的「位置」欄位）
export const POSITION_EN_MAP = {
  '投手': 'P',
  '捕手': 'C',
  '一壘手': '1B',
  '二壘手': '2B',
  '三壘手': '3B',
  '游擊手': 'SS',
  '左外野手': 'LF',
  '中外野手': 'CF',
  '右外野手': 'RF',
  '外野手': 'OF',
  '內野手': 'IF',
  '指定打擊': 'DH',
}

const MARK_CHARS = '#＃✽◎*＊※'
const MARK_RE = new RegExp(`^[${MARK_CHARS}]+`)
const MARK_NORMALIZE = { '＃': '#', '＊': '*' }

export function stripRosterMark(raw) {
  const text = raw.trim()
  const m = text.match(MARK_RE)
  if (!m) return { name: text, rosterMark: null }
  const mark = m[0][0]
  return { name: text.slice(m[0].length).trim(), rosterMark: MARK_NORMALIZE[mark] ?? mark }
}

function photoFromStyle(el) {
  const m = (el?.getAttribute('style') || '').match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/)
  // 直接串接、不做 URL 編碼：與舊爬蟲寫進 DB 的 photo 字串一致，避免同步誤判為變更
  return m ? (m[1].startsWith('/') ? BASE_URL + m[1] : m[1]) : undefined
}

// 缺值一律省略屬性（不給 null / ''），避免一次失靈的爬取把 DB 既有值洗掉
function omitEmpty(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ''))
}

export function parseTeamPage(html, { team, league }) {
  const root = parse(html)
  const rows = []
  let category = ''
  for (const section of root.querySelectorAll('.cat_title, .TeamPlayersList')) {
    if (section.classList.contains('cat_title')) {
      category = section.text.trim()
      continue
    }
    const isCoach = category === '教練'
    for (const item of section.querySelectorAll('.item')) {
      // 教練沒有 <a> 連結，球員有
      const link = item.querySelector('.name a')
      const nameEl = link || item.querySelector('.name')
      if (!nameEl || !nameEl.text.trim()) continue
      const { name, rosterMark } = stripRosterMark(nameEl.text)
      const acnt = link?.getAttribute('href')?.match(/Acnt=(\d+)/)?.[1]
      rows.push({
        ...omitEmpty({
          name,
          number: item.querySelector('.number')?.text.trim(),
          team,
          photo: photoFromStyle(item.querySelector('.img a') || item.querySelector('.img span')),
          league,
          main_position: isCoach ? undefined : (POSITION_CATEGORY_MAP[category] || category),
        }),
        key: isCoach ? null : (acnt ?? null),
        roster_mark: rosterMark,
        is_coach: isCoach,
      })
    }
  }
  return rows
}

// 回傳 null：無效 Acnt 會被導向首頁，頁面沒有 .PlayerBrief
export function parsePersonPage(html) {
  const root = parse(html)
  const brief = root.querySelector('.PlayerBrief')
  if (!brief) return null

  const descOf = label => {
    for (const dd of brief.querySelectorAll('dd')) {
      if (dd.querySelector('.label')?.text.trim() === label) return dd.querySelector('.desc')?.text.trim()
    }
    return undefined
  }

  // 頁首隊名：「富邦悍將二軍」→ 富邦悍將 / 二軍；無後綴視為一軍
  const headerTeam = brief.querySelector('.team')?.text.trim() || ''
  const isMinor = headerTeam.endsWith('二軍')
  const rawTeam = isMinor ? headerTeam.slice(0, -2) : headerTeam

  const position = descOf('位置')
  const habit = descOf('投打習慣')
  const hands = habit?.match(/^(右|左|兩)投(右|左|兩)打$/)
  const nameEl = brief.querySelector('.name')
  const numberEl = nameEl?.querySelector('.number')
  const number = numberEl?.text.trim()
  numberEl?.remove()

  return {
    ...omitEmpty({
      name: nameEl ? stripRosterMark(nameEl.text).name : undefined,
      number,
      photo: photoFromStyle(brief.querySelector('.img span')),
      team: rawTeam ? canonicalTeamName(rawTeam) : undefined,
      league: rawTeam ? (isMinor ? '二軍' : '一軍') : undefined,
      pitching_hand: hands?.[1],
      batting_hand: hands?.[2],
      main_position: position ? (POSITION_EN_MAP[position] || position) : undefined,
    }),
    // 教練/工作人員頁沒有「位置」「投打習慣」欄位
    isPlayer: position !== undefined || habit !== undefined,
  }
}

// 官網由 HiNetCDN 擋：第一次請求回 308 + Set-Cookie(__chtcdn)，之後都要帶 Cookie
export async function createCpblSession({ fetchImpl = fetch } = {}) {
  const jar = new Map()
  const remember = res => {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';')
      const i = pair.indexOf('=')
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim())
    }
  }
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')

  async function request(path, { method = 'GET', body } = {}) {
    let url = new URL(path, BASE_URL).href
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const headers = { 'User-Agent': USER_AGENT }
      if (jar.size) headers.Cookie = cookieHeader()
      if (body !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded'
      const res = await fetchImpl(url, { method, headers, body, redirect: 'manual' })
      remember(res)
      const location = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url).href
        continue
      }
      return { status: res.status, url, html: await res.text() }
    }
    throw new Error(`CPBL: too many redirects for ${path}`)
  }

  // 首頁與 GET /team 都不發 cookie；一般頁面（這裡用 /schedule）的請求會回 308 + Set-Cookie，
  // 但 CDN 多節點下實測有時直接回 200 不給 cookie，所以重試幾次；仍拿不到也不致命：
  // 之後任何請求若被 308 擋下，request() 的轉址迴圈會自己撿 cookie 再重送
  for (let attempt = 0; attempt < BOOTSTRAP_ATTEMPTS && !jar.has('__chtcdn'); attempt++) {
    remember(await fetchImpl(new URL('/schedule', BASE_URL).href, { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual' }))
  }

  return {
    get: path => request(path),
    post: (path, body) => request(path, { method: 'POST', body }),
  }
}
