import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planRosterSync, checkSafetyValve, MANUAL_FIELDS } from './rosterSync.mjs'

const base = { org: 'CPBL', keyField: 'cpbl_acnt' }
const sc = (o = {}) => ({ key: 'A1', name: '王', number: '1', team: '兄弟', photo: 'p.png', league: '一軍', roster_mark: null, is_coach: false, ...o })
const db = (o = {}) => ({ id: 1, org: 'CPBL', cpbl_acnt: 'A1', name: '王', number: '1', team: '兄弟', photo: 'p.png', league: '一軍', roster_mark: null, is_coach: false, status: 'active', song: 'x', ...o })

// Mirrors what the sync script would persist, so idempotency can be checked end to end.
function apply(dbPlayers, plan, keyField = 'cpbl_acnt') {
  let nextId = 1000
  const rows = dbPlayers.map(r => ({ ...r }))
  for (const u of plan.updates) Object.assign(rows.find(r => r.id === u.id), u.patch)
  for (const d of plan.departures) rows.find(r => r.id === d.id).status = 'departed'
  for (const i of plan.inserts) rows.push({ id: nextId++, ...i })
  return rows
}

test('new key inserts active row; "#" mark inserts departed (註銷註冊 must never show as active)', () => {
  const p = planRosterSync({ ...base, dbPlayers: [], scraped: [sc(), sc({ key: 'B2', roster_mark: '#' })] })
  assert.equal(p.inserts.length, 2)
  assert.equal(p.inserts[0].status, 'active')
  assert.equal(p.inserts[0].org, 'CPBL')
  assert.equal(p.inserts[0].cpbl_acnt, 'A1')
  assert.ok(!('key' in p.inserts[0]))
  assert.equal(p.inserts[1].status, 'departed')
})

test('only changed official fields are patched and manual fields never appear (protects hand-entered songs/intros)', () => {
  const p = planRosterSync({ ...base, dbPlayers: [db()], scraped: [sc({ number: '9', song: 'evil', intro: 'evil' })] })
  assert.deepEqual(p.updates, [{ id: 1, patch: { number: '9' } }])
  for (const u of p.updates) for (const f of MANUAL_FIELDS) assert.ok(!(f in u.patch))
})

test('re-running after applying a plan yields an empty plan (sync is idempotent, no churn)', () => {
  const dbPlayers = [db({ number: '5' }), db({ id: 2, cpbl_acnt: 'GONE', name: '走' })]
  const scraped = [sc(), sc({ key: 'N', name: '新' })]
  const first = planRosterSync({ ...base, dbPlayers, scraped })
  assert.ok(first.updates.length && first.inserts.length && first.departures.length)
  const second = planRosterSync({ ...base, dbPlayers: apply(dbPlayers, first), scraped })
  for (const k of Object.keys(second)) assert.deepEqual(second[k], [], k)
})

test('departures: active keyed row missing from scrape, but not other orgs or keyless non-coaches (avoid wiping unrelated data)', () => {
  const dbPlayers = [
    db({ id: 2, cpbl_acnt: 'GONE', name: '走', team: '獅' }),
    db({ id: 3, org: 'NPB', cpbl_acnt: 'X', npb_id: 'X' }),
    db({ id: 4, cpbl_acnt: null, name: '國際' }),
  ]
  const p = planRosterSync({ ...base, dbPlayers, scraped: [] })
  assert.deepEqual(p.departures, [{ id: 2, name: '走', team: '獅' }])
})

test('departed row that reappears is a return with status active (re-registration restores the player)', () => {
  const p = planRosterSync({ ...base, dbPlayers: [db({ status: 'departed', roster_mark: '#' })], scraped: [sc()] })
  assert.deepEqual(p.returns, [{ id: 1, name: '王', team: '兄弟' }])
  assert.equal(p.updates[0].patch.status, 'active')
})

test('team change is reported as a transfer and patches team (history of moves is surfaced)', () => {
  const p = planRosterSync({ ...base, dbPlayers: [db()], scraped: [sc({ team: '獅' })] })
  assert.deepEqual(p.transfers, [{ id: 1, name: '王', from: '兄弟', to: '獅' }])
  assert.equal(p.updates[0].patch.team, '獅')
})

test('coach matched by name updates instead of inserting a duplicate', () => {
  const coach = db({ id: 7, cpbl_acnt: null, name: '教', is_coach: true })
  const p = planRosterSync({ ...base, dbPlayers: [coach], scraped: [sc({ key: null, name: '教', is_coach: true, team: '獅' })] })
  assert.equal(p.inserts.length, 0)
  assert.deepEqual(p.updates, [{ id: 7, patch: { team: '獅' } }])
})

test('ambiguous coach name is a conflict and is skipped (cannot guess which row is right)', () => {
  const dbPlayers = [db({ id: 7, cpbl_acnt: null, name: '教', is_coach: true }), db({ id: 8, cpbl_acnt: null, name: '教', is_coach: true })]
  const p = planRosterSync({ ...base, dbPlayers, scraped: [sc({ key: null, name: '教', is_coach: true, team: '獅' })] })
  assert.deepEqual(p.conflicts, ['教'])
  assert.deepEqual(p.updates, [])
  assert.deepEqual(p.inserts, [])
  assert.deepEqual(p.departures, [])
})

test('active coach absent from scrape departs (coaches have no key but still leave)', () => {
  const p = planRosterSync({ ...base, dbPlayers: [db({ id: 7, cpbl_acnt: null, name: '教', is_coach: true })], scraped: [] })
  assert.deepEqual(p.departures, [{ id: 7, name: '教', team: '兄弟' }])
})

test('safety valve blocks empty pages and large drops (a broken scrape must not mass-depart players)', () => {
  assert.equal(checkSafetyValve({ a: 0, b: 40 }, null).ok, false)
  assert.equal(checkSafetyValve({ a: 20 }, { a: 45 }).ok, false)
  assert.equal(checkSafetyValve({ a: 44 }, { a: 45 }).ok, true)
  assert.equal(checkSafetyValve({ a: 5, b: 40 }, null).ok, true)
  assert.equal(checkSafetyValve({}, { a: 10 }).ok, false)
})
