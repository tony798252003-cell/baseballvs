import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { TEAMS, CPBL_TEAMS, canonicalTeamName, teamInfo, orgOfTeam } from './teams.js'

// 備份 (2026-10-23) players.team 的相異值（不含「其他球隊」）
const DB_TEAMS = [
  'LA道奇', '中信兄弟', '中日龍', '亞利桑那響尾蛇體系', '克利夫蘭守護者', '北海道火腿鬥士',
  '匹茲堡海盜體系', '台鋼雄鷹', '味全龍', '埼玉西武獅', '奧克蘭運動家體系', '富邦悍將',
  '廣島東洋鯉魚', '德州遊騎兵', '東京養樂多燕子', '東北樂天金鷹', '樂天桃猿', '橫濱DeNA海灣星',
  '歐力士牛', '波士頓紅襪', '波士頓紅襪體系', '福岡軟銀鷹', '紐約大都會', '紐約洋基', '統一獅',
  '自由球員', '芝加哥小熊', '西武獅', '讀賣巨人', '費城費城人', '阪神虎',
]
// 只出現在 players.original_team，Task 8 會用它回填「其他球隊」
const DB_ORIGINAL_TEAMS = ['教士', '日本火腿', '東北樂天', '道奇']

test('資料庫既有球隊名都能解析到有 org 的正式隊名（否則球員會掉出分頁）', () => {
  for (const name of [...DB_TEAMS, ...DB_ORIGINAL_TEAMS]) {
    const canon = canonicalTeamName(name)
    assert.ok(orgOfTeam(canon), `${name} -> ${canon} 沒有 org`)
  }
})

test('別名正規化成正式隊名', () => {
  assert.equal(canonicalTeamName('LA道奇'), '洛杉磯道奇')
  assert.equal(canonicalTeamName('西武獅'), '埼玉西武獅')
  assert.equal(canonicalTeamName('道奇'), '洛杉磯道奇')
  assert.equal(canonicalTeamName('東北樂天'), '東北樂天金鷹')
  assert.equal(canonicalTeamName('日本火腿'), '北海道火腿鬥士')
  assert.equal(canonicalTeamName('教士'), '聖地牙哥教士')
  assert.equal(canonicalTeamName('波士頓紅襪體系'), '波士頓紅襪')
})

test('未知隊名原樣回傳，teamInfo/orgOfTeam 回 undefined', () => {
  assert.equal(canonicalTeamName('不存在隊'), '不存在隊')
  assert.equal(teamInfo('不存在隊'), undefined)
  assert.equal(orgOfTeam('不存在隊'), undefined)
})

test('CPBL_TEAMS 為現役六隊且順序固定', () => {
  assert.deepEqual(CPBL_TEAMS, ['樂天桃猿', '統一獅', '富邦悍將', '味全龍', '台鋼雄鷹', '中信兄弟'])
})

test('已解散球隊的 successor 必須是現役 CPBL 球隊（歷史分頁靠它導到現任球隊）', () => {
  const defunct = TEAMS.filter(t => t.defunct)
  assert.ok(defunct.length > 0)
  for (const t of defunct) {
    assert.equal(t.org, 'CPBL', `${t.name} 已解散卻不是 CPBL`)
    if (!t.successor) continue
    const s = teamInfo(t.successor)
    assert.ok(s && !s.defunct && s.org === 'CPBL', `${t.name} 的 successor ${t.successor} 不是現役 CPBL`)
  }
  assert.equal(teamInfo('兄弟象').successor, '中信兄弟')
  assert.equal(teamInfo('Lamigo桃猿').successor, '樂天桃猿')
  assert.equal(teamInfo('義大犀牛').successor, '富邦悍將')
})

test('NPB 現役剛好 12 隊且都有 npbCode 與存在的 logo', () => {
  const npb = TEAMS.filter(t => t.org === 'NPB' && !t.defunct)
  assert.equal(npb.length, 12)
  assert.equal(new Set(npb.map(t => t.npbCode)).size, 12)
  for (const t of npb) {
    assert.ok(t.npbCode, `${t.name} 缺 npbCode`)
    assert.ok(existsSync(new URL(`../../public${t.logo}`, import.meta.url)), `${t.name} logo 檔不存在`)
  }
})

test('現役 CPBL 六隊都有 cpblClubNo 與存在的 logo', () => {
  for (const name of CPBL_TEAMS) {
    const t = teamInfo(name)
    assert.ok(t.cpblClubNo, `${name} 缺 cpblClubNo`)
    assert.ok(existsSync(new URL(`../../public${t.logo}`, import.meta.url)), `${name} logo 檔不存在`)
  }
})

test('隊名與別名不可重複（否則 canonicalTeamName 結果不確定）', () => {
  const all = TEAMS.flatMap(t => [t.name, ...(t.aliases || [])])
  assert.equal(new Set(all).size, all.length)
})
