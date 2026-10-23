// Pure helpers for sync-npb.mjs: name matching across 新字体/旧字体, update filtering, duplicate-id guard.
import { matchUnkeyed } from './playerMerge.mjs'

// 旧字体 → Yahoo 使用的新字体；只收有把握是同一字的異體
const VARIANTS = {
  淺: '浅', 彌: '弥', 澤: '沢', 邊: '辺', 邉: '辺', 齋: '斎', 齊: '斉', 廣: '広', 國: '国',
  濱: '浜', 髙: '高', 﨑: '崎', 櫻: '桜', 惠: '恵', 將: '将', 壯: '壮', 晉: '晋',
}
// 非字形差異：DB 用中文名，Yahoo 用日文表記（DB 名 → Yahoo 名）
export const NAME_OVERRIDES = { 張峻瑋: '張峻ウェイ' }

export function normalizeNpbName(name) {
  const base = NAME_OVERRIDES[name] ?? name
  return [...base].map((c) => VARIANTS[c] ?? c).join('')
}

// 僅限唯一：DB 側由 matchUnkeyed 保證只有一筆；Yahoo 側若有多人正規化後同名（如多位マルティネス）則不比對
export function matchNpbUnkeyed(dbRows, scraped, { org = 'NPB', keyField = 'npb_id' } = {}) {
  const counts = new Map()
  for (const s of scraped) counts.set(normalizeNpbName(s.name), (counts.get(normalizeNpbName(s.name)) ?? 0) + 1)
  const uniqueScraped = scraped.filter((s) => counts.get(normalizeNpbName(s.name)) === 1).map((s) => ({ ...s, name: normalizeNpbName(s.name) }))
  const normalizedDb = dbRows.map((r) => ({ ...r, name: normalizeNpbName(r.name ?? '') }))
  return matchUnkeyed(normalizedDb, uniqueScraped, { org, keyField })
}

const isEmpty = (v) => v == null || v === ''

// Ruling 16/17：既有列的 name 不改（DB 名字經人工整理）；DB 已有照片時不覆蓋；變空的更新直接丟棄
export function filterNpbUpdates(updates, dbPlayers) {
  const byId = new Map(dbPlayers.map((r) => [r.id, r]))
  const out = []
  for (const u of updates) {
    const patch = { ...u.patch }
    delete patch.name
    if (!isEmpty(byId.get(u.id)?.photo)) delete patch.photo
    if (Object.keys(patch).length) out.push({ ...u, patch })
  }
  return out
}

// 同一 Yahoo id 重複：完全相同就去重；內容衝突代表頁面異常，直接丟錯（呼叫端須在任何寫入前呼叫）
export function dedupeByKey(scraped) {
  const seen = new Map()
  const kept = []
  for (const s of scraped) {
    const prev = seen.get(s.key)
    if (!prev) {
      seen.set(s.key, s)
      kept.push(s)
    } else if (JSON.stringify(prev) !== JSON.stringify(s)) {
      throw new Error(`Yahoo id ${s.key} 重複且內容不同：${JSON.stringify(prev)} vs ${JSON.stringify(s)}`)
    }
  }
  return kept
}
