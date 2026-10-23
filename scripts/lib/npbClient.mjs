import { parse } from 'node-html-parser'

export const BASE_URL = 'https://baseball.yahoo.co.jp'
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const STAFF_SECTION = '監督・コーチ'
// 球隊頁分區標題 → App 的 main_position 代碼（同 cpbl 的 POSITION_CATEGORY_MAP）
const POSITION_BY_SECTION = { 投手: 'P', 捕手: 'C', 内野手: 'IF', 外野手: 'OF' }

// 缺值一律省略屬性（不給 null / ''），避免一次失靈的爬取把 DB 既有值洗掉
function omitEmpty(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ''))
}

// Yahoo 顯示「山本 由伸」，DB 既有列沒有空白；半形與全形空白都移除
const stripSpaces = (s) => s.replace(/[\s　]+/g, '')

// Yahoo 球隊頁沒有 支配下/育成 的分區，唯一線索是背號：育成為三位數（含 011 這類補零），支配下最多兩位（0、00 也是）
const leagueOf = (number) => (number && number.length >= 3 ? '二軍' : '一軍')

export function parseNpbRoster(html, { team }) {
  const root = parse(html)
  const rows = []
  for (const section of root.querySelectorAll('section')) {
    const title = section.querySelector('.bb-head01__title')?.text.trim()
    if (title === STAFF_SECTION) continue
    for (const item of section.querySelectorAll('.bb-playerList__item')) {
      const id = item.querySelector('a.bb-playerList__link')?.getAttribute('href')?.match(/\/npb\/player\/(\d+)\//)?.[1]
      const name = stripSpaces(item.querySelector('.bb-playerList__name')?.text ?? '')
      if (!id || !name) continue
      const number = item.querySelector('.bb-playerList__number')?.text.trim()
      rows.push({
        ...omitEmpty({
          name,
          number,
          team,
          photo: item.querySelector('img.bb-playerList__img')?.getAttribute('src')?.trim(),
          league: leagueOf(number),
          main_position: POSITION_BY_SECTION[title],
        }),
        key: id,
        roster_mark: null,
        is_coach: false,
      })
    }
  }
  return rows
}

export async function fetchNpbRoster(yahooTeamId, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${BASE_URL}/npb/teams/${yahooTeamId}/players`, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`NPB (Yahoo) team ${yahooTeamId}: HTTP ${res.status}`)
  return res.text()
}
