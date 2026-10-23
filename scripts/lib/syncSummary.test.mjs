import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSummary } from './syncSummary.mjs'

const empty = { inserts: [], updates: [], departures: [], returns: [], transfers: [], conflicts: [] }

test('summary lists names so the operator can sanity-check departures before --apply', () => {
  const out = buildSummary({
    plan: { ...empty, departures: [{ id: 1, name: '王小明', team: '統一獅' }], transfers: [{ id: 2, name: '李大華', from: '味全龍', to: '樂天桃猿' }] },
    links: [{ id: 3, key: '1' }],
    ambiguous: [{ name: '陳同名', candidates: ['4', '5'] }],
    pageCounts: { 'ACN-A': 30 },
  })
  assert.match(out, /離隊 1/)
  assert.match(out, /離隊：王小明\(統一獅\)/)
  assert.match(out, /李大華\(味全龍→樂天桃猿\)/)
  assert.match(out, /補 cpbl_acnt 1/)
  assert.match(out, /陳同名\[4,5\]/)
  assert.match(out, /ACN-A=30/)
})

test('empty plan prints zero counts and no name sections', () => {
  const out = buildSummary({ plan: empty })
  assert.match(out, /新增 0、更新 0、離隊 0/)
  assert.doesNotMatch(out, /離隊：/)
})

test('update tally counts patched fields so a surprising mass change is visible before --apply', () => {
  const out = buildSummary({
    plan: { ...empty, updates: [{ id: 1, patch: { league: '二軍', status: 'active' } }, { id: 2, patch: { league: '一軍' } }] },
  })
  assert.match(out, /更新欄位：league 2、status 1/)
})
