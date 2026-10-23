import { teamInfo } from '../constants/teams.js'

// 沒有個人應援曲時的順序：本隊嗆斯曲 → 後繼球隊嗆斯曲 → 通用嗆斯曲 → 無
export function pickFallbackChant(player, teamChants = [], genericUrl = '', random = Math.random) {
  const pick = (kind, team) => {
    const chants = team ? teamChants.filter(c => c.team === team) : []
    if (!chants.length) return null
    return { kind, url: chants[Math.floor(random() * chants.length)].url }
  }
  return (
    pick('team', player.team) ||
    pick('successor', teamInfo(player.team)?.successor) ||
    (genericUrl ? { kind: 'generic', url: genericUrl } : null)
  )
}
