import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeNpbName, matchNpbUnkeyed, filterNpbUpdates, dedupeByKey, planUnlinkedDepartures } from './npbSync.mjs'

const db = (id, name, extra = {}) => ({ id, name, org: 'NPB', npb_id: null, is_coach: false, ...extra })

test('舊字體/中文名變體與 Yahoo 名正規化後相同，才不會重複新增', () => {
  assert.equal(normalizeNpbName('湯淺京己'), normalizeNpbName('湯浅京己'))
  assert.equal(normalizeNpbName('宮城大彌'), normalizeNpbName('宮城大弥'))
  assert.equal(normalizeNpbName('張峻瑋'), '張峻ウェイ')
})

test('matchNpbUnkeyed links variant spellings but never guesses between same-named Yahoo players', () => {
  const rows = [db(1, '湯淺京己'), db(2, '張峻瑋'), db(3, 'マルティネス'), db(4, '林家正')]
  const scraped = [
    { name: '湯浅京己', key: '10' }, { name: '張峻ウェイ', key: '11' },
    { name: 'マルティネス', key: '12' }, { name: 'マルティネス', key: '13' },
  ]
  const { matches } = matchNpbUnkeyed(rows, scraped)
  assert.deepEqual(matches, [{ id: 1, key: '10' }, { id: 2, key: '11' }])
})

test('filterNpbUpdates: name never updated; photo kept when DB has one, filled when DB is empty; empty patches dropped', () => {
  const dbRows = [{ id: 1, photo: 'old.jpg' }, { id: 2, photo: '' }, { id: 3, photo: 'x.jpg' }]
  const out = filterNpbUpdates([
    { id: 1, patch: { name: '湯浅京己', photo: 'new.jpg', number: '5' } },
    { id: 2, patch: { photo: 'new.jpg' } },
    { id: 3, patch: { name: 'x', photo: 'new.jpg' } },
  ], dbRows)
  assert.deepEqual(out, [{ id: 1, patch: { number: '5' } }, { id: 2, patch: { photo: 'new.jpg' } }])
})

test('dedupeByKey drops identical repeats and aborts on conflicting data for one id', () => {
  const a = { key: '1', name: 'A', team: 'T' }
  assert.deepEqual(dedupeByKey([a, { ...a }]), [a])
  assert.throws(() => dedupeByKey([a, { ...a, team: 'U' }]), /重複且內容不同/)
})

// Ruling 18：Yahoo 名單找不到的舊 NPB 列不該繼續出現在現役名單
test('planUnlinkedDepartures: unkeyed, unlinked active NPB players depart; linked, keyed, coach, other-org and already-departed rows do not', () => {
  const rows = [
    db(1, '林家正', { status: 'active', team: '北海道火腿鬥士' }),
    db(2, '已綁', { status: 'active' }),
    db(3, '有號', { status: 'active', npb_id: '99' }),
    db(4, '教練', { status: 'active', is_coach: true }),
    db(5, '中職', { status: 'active', org: 'CPBL' }),
    db(6, '早走', { status: 'departed' }),
  ]
  assert.deepEqual(planUnlinkedDepartures(rows, new Set([2])), [{ id: 1, name: '林家正', team: '北海道火腿鬥士' }])
})
