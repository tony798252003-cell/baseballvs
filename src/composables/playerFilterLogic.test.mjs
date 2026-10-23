import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterRosterByLeague, sortTeamsByTeamsOrder } from './playerFilterLogic.js'

const p = (name, team, extra = {}) => ({ name, team, status: 'active', isCoach: false, league: '一軍', ...extra })
const roster = [
  p('A', '中信兄弟'),
  p('B', '中信兄弟', { league: '二軍' }),
  p('C', '統一獅', { isCoach: true }),
  p('彭政閔', '中信兄弟', { status: 'departed', league: '一軍' }),
  p('老將', '興農牛', { status: 'departed', league: undefined }),
  p('D', '阪神虎'),
  p('E', '洛杉磯道奇'),
]
const names = (l, org, lg) => filterRosterByLeague(l, org, lg).map(x => x.name)

test('active tabs never include departed players (離隊者不能被選進現役打線)', () => {
  assert.deepEqual(names(roster, 'CPBL', '一軍'), ['A'])
  assert.deepEqual(names(roster, 'CPBL', '二軍'), ['B'])
  assert.deepEqual(names(roster, 'CPBL', 'coach'), ['C'])
  assert.deepEqual(names(roster, 'CPBL', 'all'), ['A', 'B', 'C'])
})

test('departed tab ignores league/coach so defunct-team players appear', () => {
  assert.deepEqual(names(roster, 'CPBL', 'departed'), ['彭政閔', '老將'])
})

test('org filter separates CPBL / NPB / MLB', () => {
  assert.deepEqual(names(roster, 'NPB', '一軍'), ['D'])
  assert.deepEqual(names(roster, 'MLB', '一軍'), ['E'])
})

test('unknown team names are excluded from every org', () => {
  assert.deepEqual(names([p('X', '不存在隊')], 'CPBL', '一軍'), [])
})

test('team order follows TEAMS: active CPBL six first, defunct after', () => {
  assert.deepEqual(
    sortTeamsByTeamsOrder(['興農牛', '中信兄弟', '樂天桃猿', '兄弟象']),
    ['樂天桃猿', '中信兄弟', '兄弟象', '興農牛']
  )
})
