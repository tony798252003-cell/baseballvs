const PAGE_SIZE = 1000

// Supabase 單次最多回 1000 筆：用 range 逐頁取，直到某頁不滿 PAGE_SIZE
// buildQuery 每頁都要回傳新的 query builder（builder 只能 await 一次）
export async function fetchAllPages(buildQuery) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE_SIZE) return rows
  }
}
