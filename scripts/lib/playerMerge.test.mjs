import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDuplicateMerges, matchUnkeyed } from './playerMerge.mjs'

const row = (o) => ({ org: 'CPBL', team: '統一獅', name: '郭俊麟', created_at: '2024-01-01', ...o })

test('keeps the row with an external id and copies missing manual fields into it', () => {
  // the acnt row is the one the official sync will match later; losing it would orphan the player
  const rows = [
    row({ id: 1, cpbl_acnt: '0000001260', song: null }),
    row({ id: 2, cpbl_acnt: null, song: 'my song' }),
  ]
  assert.deepEqual(planDuplicateMerges(rows).merges, [{ keepId: 1, removeIds: ['2'], patch: { song: 'my song' } }])
})

test('does not overwrite a manual field the keep row already has', () => {
  // manual data is hand-curated; the duplicate must never clobber it
  const rows = [
    row({ id: 1, cpbl_acnt: 'A', song: 'keep me' }),
    row({ id: 2, song: 'other' }),
  ]
  assert.deepEqual(planDuplicateMerges(rows).merges[0].patch, {})
})

test('same name on different teams is not a duplicate', () => {
  // different people can share a name across teams
  assert.deepEqual(planDuplicateMerges([row({ id: 1 }), row({ id: 2, team: '富邦悍將' })]), { merges: [], ambiguous: [] })
})

test('groups after canonicalizing team names', () => {
  // LA道奇 and 洛杉磯道奇 are the same team once aliases are resolved
  const rows = [
    row({ id: 1, team: 'LA道奇', name: '某人', created_at: '2024-02-01' }),
    row({ id: 2, team: '洛杉磯道奇', name: '某人', created_at: '2024-01-01' }),
  ]
  const plan = planDuplicateMerges(rows).merges
  assert.equal(plan.length, 1)
  assert.equal(plan[0].keepId, 2)
})

test('without an external id the oldest row is kept', () => {
  // oldest row is most likely the original entry
  const rows = [row({ id: 5, created_at: '2025-01-01' }), row({ id: 4, created_at: '2024-01-01' })]
  assert.equal(planDuplicateMerges(rows).merges[0].keepId, 4)
})

test('empty array counts as empty for manual fields', () => {
  // other_positions is an array column; [] must not block a real value
  const rows = [
    row({ id: 1, cpbl_acnt: 'A', other_positions: [] }),
    row({ id: 2, other_positions: ['游擊手'] }),
  ]
  assert.deepEqual(planDuplicateMerges(rows).merges[0].patch, { other_positions: ['游擊手'] })
})

test('conflicting external ids are skipped and reported', () => {
  // two different acnts means two different people sharing a name; merging would destroy one
  const rows = [row({ id: 1, cpbl_acnt: 'A' }), row({ id: 2, cpbl_acnt: 'B' })]
  assert.deepEqual(planDuplicateMerges(rows), {
    merges: [],
    ambiguous: [{ name: '郭俊麟', team: '統一獅', candidates: ['1', '2'] }],
  })
})

test('external id on a removed row is copied into the keep row', () => {
  // dropping the row that holds mlb_id would break later official-sync matching
  const rows = [row({ id: 1, cpbl_acnt: 'A' }), row({ id: 2, mlb_id: '77' })]
  assert.deepEqual(planDuplicateMerges(rows).merges[0].patch, { mlb_id: '77' })
})

test('emoji on the removed row survives into the keep patch', () => {
  // emoji is hand-entered manual data and must not be lost with the deleted row
  const rows = [row({ id: 1, cpbl_acnt: 'A' }), row({ id: 2, emoji: '🔥' })]
  assert.deepEqual(planDuplicateMerges(rows).merges[0].patch, { emoji: '🔥' })
})

test('matchUnkeyed matches a single unkeyed db row by name', () => {
  // a unique name lets us attach the official id without guessing
  const db = [{ id: 7, org: 'NPB', name: '孫易磊', npb_id: null }, { id: 8, org: 'NPB', name: '別人', npb_id: '9' }]
  const r = matchUnkeyed(db, [{ name: '孫易磊', key: '123' }], { org: 'NPB', keyField: 'npb_id' })
  assert.deepEqual(r, { matches: [{ id: 7, key: '123' }], ambiguous: [] })
})

test('matchUnkeyed reports duplicate unkeyed names as ambiguous', () => {
  // attaching an id to the wrong namesake would corrupt data, so a human must decide
  const db = [{ id: 1, org: 'NPB', name: '林子豪' }, { id: 2, org: 'NPB', name: '林子豪' }]
  const r = matchUnkeyed(db, [{ name: '林子豪', key: '5' }], { org: 'NPB', keyField: 'npb_id' })
  assert.deepEqual(r, { matches: [], ambiguous: [{ name: '林子豪', candidates: ['1', '2'] }] })
})

const wu = [
  { id: 2277, org: 'CPBL', name: '吳承翰', team: '台鋼雄鷹', is_coach: true, cpbl_acnt: null },
  { id: 2905, org: 'CPBL', name: '吳承翰', team: '味全龍', is_coach: false, cpbl_acnt: '0000007311' },
]

test('matchUnkeyed never links a scraped key that another db row already holds', () => {
  // a coach and a player share the name 吳承翰; relinking would hit the unique constraint (or merge two people)
  const r = matchUnkeyed(wu, [{ name: '吳承翰', key: '0000007311' }], { org: 'CPBL', keyField: 'cpbl_acnt' })
  assert.deepEqual(r, { matches: [], ambiguous: [] })
})

test('matchUnkeyed never links a keyed scraped row onto a coach row', () => {
  // coach rows have no external id; planRosterSync matches them by name + is_coach instead
  const r = matchUnkeyed([wu[0]], [{ name: '吳承翰', key: '0000007311' }], { org: 'CPBL', keyField: 'cpbl_acnt' })
  assert.deepEqual(r, { matches: [], ambiguous: [] })
})
