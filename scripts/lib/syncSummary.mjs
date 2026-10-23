// Pure formatter for the roster sync summary (no I/O).
const names = (list) => list.map((x) => x.name).join('、')

export function buildSummary({ plan, links = [], ambiguous = [], pageCounts = {}, dedupedCoaches = [], keyField = 'cpbl_acnt' }) {
  const lines = []
  lines.push(`頁面人數：${Object.entries(pageCounts).map(([k, n]) => `${k}=${n}`).join(' ')}`)
  lines.push(`新增 ${plan.inserts.length}、更新 ${plan.updates.length}、離隊 ${plan.departures.length}、回鍋 ${plan.returns.length}、換隊 ${plan.transfers.length}、補 ${keyField} ${links.length}`)
  const tally = {}
  for (const u of plan.updates) for (const f of Object.keys(u.patch)) tally[f] = (tally[f] ?? 0) + 1
  const fields = Object.entries(tally).sort((a, b) => b[1] - a[1])
  if (fields.length) lines.push(`更新欄位：${fields.map(([f, n]) => `${f} ${n}`).join('、')}`)
  if (plan.inserts.length) lines.push(`新增：${plan.inserts.map((i) => i.name ?? i[keyField]).join('、')}`)
  if (plan.transfers.length) lines.push(`換隊：${plan.transfers.map((t) => `${t.name}(${t.from}→${t.to})`).join('、')}`)
  if (plan.departures.length) lines.push(`離隊：${plan.departures.map((d) => `${d.name}(${d.team})`).join('、')}`)
  if (plan.returns.length) lines.push(`回鍋：${names(plan.returns)}`)
  if (dedupedCoaches.length) lines.push(`去重（球員兼教練，保留球員列）${dedupedCoaches.length}：${names(dedupedCoaches)}`)
  if (plan.conflicts.length) lines.push(`衝突（同名多筆教練，略過）：${plan.conflicts.join('、')}`)
  if (ambiguous.length) lines.push(`無法比對（同名多筆未綁定）：${ambiguous.map((a) => `${a.name}[${a.candidates.join(',')}]`).join('、')}`)
  return lines.join('\n')
}
