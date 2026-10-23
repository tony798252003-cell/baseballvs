// A player-coach appears twice on a team page: keyed (player section) and keyless (教練 section).
// The keyed player row wins so the person stays selectable as a player; the coach duplicate is dropped.
export function dropShadowedCoaches(scraped) {
  const keyed = new Set(scraped.filter((s) => s.key != null).map((s) => `${s.team}|${s.name}`))
  const kept = []
  const dropped = []
  for (const s of scraped) {
    if (s.key == null && s.is_coach && keyed.has(`${s.team}|${s.name}`)) dropped.push(s)
    else kept.push(s)
  }
  return { kept, dropped }
}
