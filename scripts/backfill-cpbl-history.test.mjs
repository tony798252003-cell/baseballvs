import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAcnt, newState, advanceState, shouldStop, buildRow, parseArgs, planBackfill } from './backfill-cpbl-history.mjs'

test('formatAcnt zero-pads to 10 digits (site key format)', () => {
  assert.equal(formatAcnt(7880), '0000007880')
})

test('advanceState: valid id resets the invalid run, raises highestValid; invalid id extends run', () => {
  let s = newState(5)
  s = advanceState(s, 5, null)
  s = advanceState(s, 6, null)
  assert.equal(s.invalidRun, 2)
  assert.equal(s.next, 7)
  s = advanceState(s, 7, { name: 'A', isPlayer: true })
  assert.equal(s.invalidRun, 0)
  assert.equal(s.highestValid, 7)
  assert.deepEqual(s.found, [{ cpbl_acnt: '0000000007', name: 'A', isPlayer: true }])
  assert.equal(advanceState(s, 8, null).highestValid, 7)
})

test('advanceState does not mutate the previous state (safe to save mid-run)', () => {
  const s = newState(1)
  advanceState(s, 1, { name: 'A', isPlayer: true })
  assert.equal(s.found.length, 0)
})

test('shouldStop only after 300 consecutive invalid ids; a valid id restarts the count', () => {
  let s = newState(1)
  for (let i = 1; i <= 299; i++) s = advanceState(s, i, null)
  assert.equal(shouldStop(s), false)
  s = advanceState(s, 300, { name: 'A', isPlayer: true })
  for (let i = 301; i <= 599; i++) s = advanceState(s, i, null)
  assert.equal(shouldStop(s), false)
  s = advanceState(s, 600, null)
  assert.equal(shouldStop(s), true)
})

test('buildRow: staff become coaches, players do not; missing fields stay omitted', () => {
  assert.deepEqual(buildRow({ cpbl_acnt: '1', name: 'A', isPlayer: true }), { org: 'CPBL', status: 'departed', cpbl_acnt: '1', name: 'A', is_coach: false })
  assert.equal(buildRow({ cpbl_acnt: '2', name: 'B', isPlayer: false }).is_coach, true)
  assert.equal('number' in buildRow({ cpbl_acnt: '1', name: 'A', isPlayer: true }), false)
})

test('parseArgs: defaults, flags, and rejects bad input', () => {
  assert.deepEqual(parseArgs([]), { apply: false, limit: Infinity, start: null, progress: 'scripts/.cache/cpbl-history-progress.json' })
  const a = parseArgs(['--apply', '--limit', '50', '--start', '7', '--progress', 'x.json'])
  assert.deepEqual(a, { apply: true, limit: 50, start: 7, progress: 'x.json' })
  assert.throws(() => parseArgs(['--limit', 'abc']))
  assert.throws(() => parseArgs(['--bogus']))
})

test('planBackfill: skips known acnt, links same-name unkeyed row, defers duplicate-name rows, inserts the rest', () => {
  const found = [
    { cpbl_acnt: '0000000001', name: '已有', isPlayer: true },
    { cpbl_acnt: '0000000002', name: '舊資料', isPlayer: true },
    { cpbl_acnt: '0000000003', name: '同名', isPlayer: true },
    { cpbl_acnt: '0000000004', name: '全新', isPlayer: false },
  ]
  const db = [
    { id: 10, org: 'CPBL', name: '已有', cpbl_acnt: '0000000001' },
    { id: 11, org: 'CPBL', name: '舊資料', cpbl_acnt: null },
    { id: 12, org: 'CPBL', name: '同名', cpbl_acnt: null },
    { id: 13, org: 'CPBL', name: '同名', cpbl_acnt: null },
  ]
  const plan = planBackfill(found, db)
  assert.equal(plan.skipped, 1)
  assert.deepEqual(plan.matches, [{ id: 11, key: '0000000002' }])
  assert.equal(plan.ambiguous.length, 1)
  assert.deepEqual(plan.inserts.map(r => r.name), ['全新'])
  assert.equal(plan.inserts[0].is_coach, true)
})
