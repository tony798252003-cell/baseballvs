import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchAllPages } from './fetchAllPages.js'

const fake = (total, ranges = []) => () => ({
  range: async (from, to) => {
    ranges.push([from, to])
    const n = Math.max(0, Math.min(to + 1, total) - from)
    return { data: Array.from({ length: n }, (_, i) => from + i), error: null }
  },
})

// 漏頁會讓名單少人，且不會有任何錯誤訊息
test('collects every row across pages in order', async () => {
  const ranges = []
  const rows = await fetchAllPages(fake(2350, ranges))
  assert.equal(rows.length, 2350)
  assert.deepEqual(rows.slice(0, 3), [0, 1, 2])
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]])
})
// 剛好整頁時必須再取一次空頁確認，否則會漏判結尾
test('exact multiple of page size fetches one more empty page', async () => {
  const ranges = []
  const rows = await fetchAllPages(fake(1000, ranges))
  assert.equal(rows.length, 1000)
  assert.equal(ranges.length, 2)
})
// 錯誤要往外拋，讓 UI 顯示載入失敗而非半份名單
test('throws on supabase error', async () => {
  await assert.rejects(
    fetchAllPages(() => ({ range: async () => ({ data: null, error: new Error('boom') }) })),
    /boom/,
  )
})
