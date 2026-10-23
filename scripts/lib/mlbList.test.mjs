import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { planMlbSync, mlbPhotoUrl } from './mlbList.mjs'
import { canonicalTeamName, orgOfTeam } from '../../src/constants/teams.js'

const entry = { name: '山本由伸', number: '18', team: '洛杉磯道奇', main_position: 'SP', pitching_hand: '右', batting_hand: '右', mlbId: 683003 }
const row = (o) => ({ id: 1, name: '山本由伸', number: '18', team: 'LA道奇', org: 'CPBL', main_position: 'SP', pitching_hand: '右', batting_hand: '右', status: 'active', photo: 'x', mlb_id: null, ...o })

test('links an alias-team, org-unnormalized row by name+team instead of inserting a duplicate', () => {
  const plan = planMlbSync([row()], [entry])
  assert.equal(plan.inserts.length, 0)
  assert.deepEqual(plan.updates, [{ id: 1, name: '山本由伸', patch: { mlb_id: 683003 } }])
})

test('an already-synced row yields no change (idempotent re-run)', () => {
  const plan = planMlbSync([row({ mlb_id: 683003 })], [entry])
  assert.deepEqual(plan, { inserts: [], updates: [], ambiguous: [], notes: [] })
})

test('mlb_id match wins and follows a team change', () => {
  const plan = planMlbSync([row({ team: '德州遊騎兵', mlb_id: 683003 })], [entry])
  assert.equal(plan.updates[0].patch.team, '洛杉磯道奇')
})

test('never overwrites an existing photo, fills an empty one', () => {
  assert.equal(planMlbSync([row({ mlb_id: 683003 })], [entry]).updates.length, 0)
  const p = planMlbSync([row({ mlb_id: 683003, photo: '' })], [entry]).updates[0].patch
  assert.equal(p.photo, mlbPhotoUrl(683003))
})

test('does not link a same-name same-team row that carries a different mlb_id', () => {
  const plan = planMlbSync([row({ mlb_id: 111 })], [entry])
  assert.equal(plan.inserts.length, 1)
})

test('keyless entry matches by name+team only; same name on another team is inserted with a note', () => {
  const e = { name: '林家正', number: '27', team: '自由球員', main_position: 'C', pitching_hand: '右', batting_hand: '右' }
  const plan = planMlbSync([{ id: 9, name: '林家正', team: '東京養樂多燕子', org: 'NPB', number: '27', photo: '' }], [e])
  assert.equal(plan.inserts.length, 1)
  assert.equal(plan.inserts[0].org, 'MLB')
  assert.equal(plan.inserts[0].photo, '')
  assert.match(plan.notes[0], /東京養樂多燕子/)
})

test('two candidate rows are reported ambiguous, not guessed', () => {
  const plan = planMlbSync([row(), row({ id: 2 })], [entry])
  assert.equal(plan.ambiguous.length, 1)
  assert.equal(plan.inserts.length + plan.updates.length, 0)
})

test('data file: only MLB-org teams, canonical names, unique name+team', () => {
  const list = JSON.parse(readFileSync(new URL('../data/mlb-players.json', import.meta.url), 'utf8'))
  const keys = new Set()
  for (const p of list) {
    assert.equal(canonicalTeamName(p.team), p.team, `${p.name} team not canonical`)
    assert.equal(orgOfTeam(p.team), 'MLB', `${p.name} is not an MLB-org team`)
    keys.add(`${p.name}|${p.team}`)
  }
  assert.equal(keys.size, list.length)
})
