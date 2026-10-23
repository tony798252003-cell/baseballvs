const LATIN = /^[\p{Script=Latin}\s.'’-]+$/u
const SUFFIX = /^(Jr\.?|Sr\.?|II|III|IV)$/i

// 打序欄位窄：西洋名只顯示姓氏（Jr./III 等後綴與姓氏併記），其他文字原樣回傳
export function lineupName(name) {
  if (!name || !LATIN.test(name)) return name
  const tokens = name.trim().split(/\s+/)
  if (tokens.length === 1) return tokens[0]
  const last = tokens[tokens.length - 1]
  if (SUFFIX.test(last) && tokens.length >= 2) {
    return tokens.length === 2 ? name.trim() : `${tokens[tokens.length - 2]} ${last}`
  }
  return last
}
