// 共用球隊表：前端元件與 Node 腳本都會 import，所以只能是純 ESM、不可 import Vue。

export const ORGS = [
  { id: 'CPBL', label: '中職' },
  { id: 'NPB', label: '日職' },
  { id: 'MLB', label: '美職' },
]

const cpbl = (name, logo, cpblClubNo) => ({ name, org: 'CPBL', logo, cpblClubNo })
const npb = (name, yahooTeamId, en) => ({ name, org: 'NPB', logo: `/logos/npb-${en}.png`, yahooTeamId })
const mlb = (name, aliases) => ({ name, org: 'MLB', ...(aliases && { aliases }) })
// 已解散／改名球隊：保留當時隊名；同一球團改名者以 successor 指向現役球隊
// aliases：CPBL 官網個人頁頁首使用的簡稱（例如「兄弟」）
const defunct = (name, successor, aliases) => ({ name, org: 'CPBL', defunct: true, ...(successor && { successor }), ...(aliases && { aliases }) })

export const TEAMS = [
  // CPBL 現役（順序即 CPBL_TEAMS 順序）
  cpbl('樂天桃猿', '/logos/rakuten.png', 'AJL'),
  cpbl('統一獅', '/logos/lions.png', 'ADD'),
  cpbl('富邦悍將', '/logos/fubon.png', 'AEO'),
  cpbl('味全龍', '/logos/dragons.png', 'AAA'),
  cpbl('台鋼雄鷹', '/logos/hawks.png', 'AKP'),
  cpbl('中信兄弟', '/logos/brothers.png', 'ACN'),

  // CPBL 已解散／改名（舊味全龍與現役味全龍視為同一隊，不另立）
  defunct('兄弟象', '中信兄弟', ['兄弟']),
  defunct('統一7-ELEVEn獅', '統一獅'),
  defunct('俊國熊', '富邦悍將', ['俊國']),
  defunct('興農熊', '富邦悍將'),
  defunct('興農牛', '富邦悍將', ['興農']), // 簡稱「興農」涵蓋興農熊／興農牛，對應較晚的興農牛
  defunct('義大犀牛', '富邦悍將', ['義大']),
  defunct('第一金剛', '樂天桃猿', ['第一']),
  defunct('La New熊', '樂天桃猿'),
  defunct('Lamigo桃猿', '樂天桃猿', ['Lamigo']),
  defunct('和信鯨'),
  defunct('中信鯨', undefined, ['中信']),
  defunct('誠泰COBRAS', undefined, ['誠泰']),
  defunct('米迪亞暴龍', undefined, ['米迪亞']),
  defunct('三商虎', undefined, ['三商']),
  defunct('時報鷹', undefined, ['時報']),

  // NPB 12 隊（yahooTeamId 為 baseball.yahoo.co.jp/npb/teams/<id>/players）
  npb('讀賣巨人', 1, 'giants'),
  npb('阪神虎', 5, 'tigers'),
  npb('中日龍', 4, 'dragons'),
  npb('橫濱DeNA海灣星', 3, 'baystars'),
  npb('廣島東洋鯉魚', 6, 'carp'),
  npb('東京養樂多燕子', 2, 'swallows'),
  npb('福岡軟銀鷹', 12, 'hawks'),
  { ...npb('北海道火腿鬥士', 8, 'fighters'), aliases: ['日本火腿'] },
  npb('千葉羅德海洋', 9, 'marines'),
  { ...npb('東北樂天金鷹', 376, 'eagles'), aliases: ['東北樂天'] },
  { ...npb('埼玉西武獅', 7, 'lions'), aliases: ['西武獅'] },
  npb('歐力士牛', 11, 'buffaloes'),

  // MLB（「XX體系」＝該球團小聯盟體系，併入母隊當別名）
  mlb('洛杉磯道奇', ['LA道奇', '道奇']),
  mlb('聖地牙哥教士', ['教士']),
  mlb('克利夫蘭守護者'),
  mlb('亞利桑那響尾蛇', ['亞利桑那響尾蛇體系']),
  mlb('匹茲堡海盜', ['匹茲堡海盜體系']),
  mlb('奧克蘭運動家', ['奧克蘭運動家體系']),
  mlb('德州遊騎兵'),
  mlb('波士頓紅襪', ['波士頓紅襪體系']),
  mlb('紐約大都會'),
  mlb('紐約洋基'),
  mlb('芝加哥小熊'),
  mlb('費城費城人'),
  mlb('自由球員'), // 偽球隊：無所屬球團的球員，無 logo
]

export const CPBL_TEAMS = TEAMS.filter(t => t.org === 'CPBL' && !t.defunct).map(t => t.name)

const byName = new Map()
for (const t of TEAMS) {
  byName.set(t.name, t)
  for (const a of t.aliases || []) byName.set(a, t)
}

export function teamInfo(name) {
  return byName.get(name)
}

export function canonicalTeamName(name) {
  return byName.get(name)?.name ?? name
}

export function orgOfTeam(name) {
  return byName.get(name)?.org
}
