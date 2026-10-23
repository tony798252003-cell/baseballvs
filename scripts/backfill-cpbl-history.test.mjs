import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAcnt, newState, advanceState, shouldStop, buildRow, parseArgs, planBackfill, fetchPerson, maxAcnt } from './backfill-cpbl-history.mjs'

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

test('buildRow: staff become coaches, players do not; missing optional fields stay omitted', () => {
  assert.deepEqual(buildRow({ cpbl_acnt: '1', name: 'A', number: '7', isPlayer: true }), { org: 'CPBL', status: 'departed', cpbl_acnt: '1', name: 'A', number: '7', is_coach: false })
  assert.equal(buildRow({ cpbl_acnt: '2', name: 'B', isPlayer: false }).is_coach, true)
  assert.equal('team' in buildRow({ cpbl_acnt: '1', name: 'A', isPlayer: true }), false)
})

// players.number 是 NOT NULL 且沒有 default：缺背號的那一筆會讓整批 insert 失敗
test('buildRow: missing number becomes empty string', () => {
  assert.equal(buildRow({ cpbl_acnt: '1', name: 'A', isPlayer: true }).number, '')
})

// 進度檔裡的隊名可能是加別名前掃到的簡稱，寫入前要轉成正式隊名
test('buildRow: header abbreviation from an old progress file is canonicalized', () => {
  assert.equal(buildRow({ cpbl_acnt: '1', name: 'A', team: '兄弟', isPlayer: true }).team, '兄弟象')
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
    { cpbl_acnt: '0000000002', name: '舊資料', team: '兄弟', isPlayer: true },
    { cpbl_acnt: '0000000003', name: '同名', isPlayer: true },
    { cpbl_acnt: '0000000004', name: '全新', isPlayer: false },
  ]
  const db = [
    { id: 10, org: 'CPBL', name: '已有', cpbl_acnt: '0000000001' },
    { id: 11, org: 'CPBL', name: '舊資料', team: '兄弟象', cpbl_acnt: null },
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

test('shouldStop never fires before the first valid hit (a leading gap must not end the scan)', () => {
  let s = newState(1)
  for (let i = 1; i <= 400; i++) s = advanceState(s, i, null)
  assert.equal(s.highestValid, 0)
  assert.equal(shouldStop(s), false)
})

test('planBackfill: two scanned pages with one name + one unkeyed row -> ambiguous, not linked or inserted', () => {
  const found = [
    { cpbl_acnt: '0000000001', name: '同名', isPlayer: true },
    { cpbl_acnt: '0000000002', name: '同名', isPlayer: true },
  ]
  const plan = planBackfill(found, [{ id: 11, org: 'CPBL', name: '同名', cpbl_acnt: null, is_coach: false }])
  assert.deepEqual(plan.matches, [])
  assert.deepEqual(plan.inserts, [])
  assert.equal(plan.ambiguous.length, 1)
  assert.deepEqual(plan.ambiguous[0].acnts, ['0000000001', '0000000002'])
})

test('planBackfill: a same-name unkeyed coach row is not linked or flagged; the retired player is inserted as its own departed row', () => {
  const found = [{ cpbl_acnt: '0000000001', name: '教練', isPlayer: true }]
  const plan = planBackfill(found, [{ id: 11, org: 'CPBL', name: '教練', cpbl_acnt: null, is_coach: true }])
  assert.deepEqual(plan.matches, [])
  assert.deepEqual(plan.ambiguous, [])
  assert.deepEqual(plan.inserts.map(r => [r.name, r.status, r.cpbl_acnt]), [['教練', 'departed', '0000000001']])
})

const PERSON_HTML = '<div class="PlayerBrief"><div class="name">某人</div><dl><dd><span class="label">位置</span><span class="desc">投手</span></dd></dl></div>'
const fakeSession = responses => ({ get: async () => responses.shift() })

test('fetchPerson: redirect away from /team/person is positive evidence of an invalid id', async () => {
  const ctx = { session: fakeSession([{ status: 200, url: 'https://www.cpbl.com.tw/', html: '<html></html>' }]), createSession: async () => assert.fail('no refresh expected') }
  assert.equal(await fetchPerson(1, ctx), null)
})

test('fetchPerson: unparseable page still on /team/person is retried with a fresh session, then parsed', async () => {
  let refreshed = 0
  const ctx = {
    session: fakeSession([{ status: 200, url: 'https://www.cpbl.com.tw/team/person?Acnt=0000000001', html: 'cdn interstitial' }]),
    createSession: async () => { refreshed++; return fakeSession([{ status: 200, url: 'https://www.cpbl.com.tw/team/person?Acnt=0000000001', html: PERSON_HTML }]) },
  }
  const person = await fetchPerson(1, ctx)
  assert.equal(person.name, '某人')
  assert.equal(refreshed, 1)
})

test('fetchPerson: persistently unparseable page is a failure (throws), never an invalid id', async () => {
  const bad = { status: 200, url: 'https://www.cpbl.com.tw/team/person?Acnt=0000000001', html: 'cdn interstitial' }
  const ctx = { session: fakeSession([bad]), createSession: async () => fakeSession([bad]), attempts: 2 }
  await assert.rejects(fetchPerson(1, ctx), /失敗/)
})

test('shouldStop: a 300-invalid gap below the highest Acnt already in the DB does not stop; past it, it does', () => {
  let s = newState(1)
  s = advanceState(s, 1, { name: 'A', isPlayer: true })
  for (let i = 2; i <= 301; i++) s = advanceState(s, i, null)
  assert.equal(s.invalidRun, 300)
  assert.equal(shouldStop(s, 7880), false)
  assert.equal(shouldStop(s, 0), true)
  assert.equal(shouldStop({ ...s, next: 7881 }, 7880), true)
})

test('maxAcnt: highest numeric cpbl_acnt, ignoring null rows', () => {
  assert.equal(maxAcnt([{ cpbl_acnt: '0000007880' }, { cpbl_acnt: null }, { cpbl_acnt: '0000000012' }]), 7880)
  assert.equal(maxAcnt([]), 0)
})

// spec 2.5：只憑同名就綁 acnt 會把不同人合併；同名不同隊要人工判斷
test('planBackfill: same name but different team is ambiguous, not linked or inserted', () => {
  const found = [{ cpbl_acnt: '0000000002', name: '舊資料', team: '統一獅', isPlayer: true }]
  const plan = planBackfill(found, [{ id: 11, org: 'CPBL', name: '舊資料', team: '中信兄弟', cpbl_acnt: null, is_coach: false }])
  assert.deepEqual(plan.matches, [])
  assert.deepEqual(plan.inserts, [])
  assert.deepEqual(plan.ambiguous, [{ name: '舊資料', candidates: ['11'], acnts: ['0000000002'] }])
})

// acnt 不分聯盟：別聯盟的列已有這個 acnt 就是同一人，不可再插一筆
test('planBackfill: acnt already held by a row of another org counts as known', () => {
  const found = [{ cpbl_acnt: '0000000001', name: '旅外', team: '兄弟', isPlayer: true }]
  const plan = planBackfill(found, [{ id: 10, org: 'MLB', name: '旅外', team: '紐約洋基', cpbl_acnt: '0000000001' }])
  assert.equal(plan.skipped, 1)
  assert.deepEqual(plan.inserts, [])
})

// 用 --start 續跑重掃同一段會在進度檔裡留下重複 acnt，不能因此插兩筆
test('planBackfill: duplicate acnt in found is planned once', () => {
  const f = { cpbl_acnt: '0000000001', name: '新', team: '兄弟', isPlayer: true }
  const plan = planBackfill([f, { ...f }], [])
  assert.equal(plan.inserts.length, 1)
  assert.deepEqual(plan.ambiguous, [])
})
