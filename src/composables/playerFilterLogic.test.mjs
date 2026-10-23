import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterRosterByLeague, sortTeamsByTeamsOrder, requiresTeamSelection } from './playerFilterLogic.js'
import { orgOfTeam } from '../constants/teams.js'

const p = (name, team, extra = {}) => ({ name, team, org: orgOfTeam(team), status: 'active', isCoach: false, league: '一軍', ...extra })
const roster = [
  p('A', '中信兄弟'),
  p('B', '中信兄弟', { league: '二軍' }),
  p('C', '統一獅', { isCoach: true }),
  p('前教練', '統一獅', { isCoach: true, status: 'departed' }),
  p('彭政閔', '中信兄弟', { status: 'departed', league: '一軍' }),
  p('老將', '興農牛', { status: 'departed', league: undefined }),
  p('D', '阪神虎'),
  p('E', '洛杉磯道奇'),
]
const names = (l, org, lg) => filterRosterByLeague(l, org, lg).map(x => x.name)

test('active tabs never include departed players (離隊者不能被選進現役打線)', () => {
  assert.deepEqual(names(roster, 'CPBL', '一軍'), ['A'])
  assert.deepEqual(names(roster, 'CPBL', '二軍'), ['B'])
  assert.deepEqual(names(roster, 'CPBL', 'all'), ['A', 'B'])
})

test('departed tab ignores league so defunct-team players appear', () => {
  assert.deepEqual(names(roster, 'CPBL', 'departed'), ['彭政閔', '老將'])
})

// 使用者決定：教練暫時不能上場
test('coaches never appear in any league option', () => {
  for (const lg of ['一軍', '二軍', 'all', 'departed']) {
    assert.ok(!names(roster, 'CPBL', lg).some(n => n === 'C' || n === '前教練'), lg)
  }
})

test('org filter separates CPBL / NPB / MLB', () => {
  assert.deepEqual(names(roster, 'NPB', '一軍'), ['D'])
  assert.deepEqual(names(roster, 'MLB', '一軍'), ['E'])
})

// 新的歷史隊名還沒進 TEAMS 時，球員不能因此從中職分頁消失
test('player with an unknown team but org CPBL still appears under 中職 (org comes from DB, not TEAMS)', () => {
  const list = [p('X', '不存在隊', { org: 'CPBL' })]
  assert.deepEqual(names(list, 'CPBL', '一軍'), ['X'])
  assert.deepEqual(names(list, 'NPB', '一軍'), [])
})

test('unknown team names sort after every known team (logos/order only, never dropped)', () => {
  assert.deepEqual(sortTeamsByTeamsOrder(['不存在隊', '兄弟象', '樂天桃猿']), ['樂天桃猿', '兄弟象', '不存在隊'])
})

// 離隊分頁一次渲染數千張照片會卡死：沒選球隊時不列球員
test('departed tab requires a team before listing players; other tabs do not', () => {
  assert.equal(requiresTeamSelection('departed', null), true)
  assert.equal(requiresTeamSelection('departed', '兄弟象'), false)
  assert.equal(requiresTeamSelection('一軍', null), false)
})

test('team order follows TEAMS: active CPBL six first, defunct after', () => {
  assert.deepEqual(
    sortTeamsByTeamsOrder(['興農牛', '中信兄弟', '樂天桃猿', '兄弟象']),
    ['樂天桃猿', '中信兄弟', '兄弟象', '興農牛']
  )
})
