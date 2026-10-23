import { TEAMS } from '../constants/teams.js'

const TEAM_ORDER = new Map(TEAMS.map((t, i) => [t.name, i]))

// 依聯盟／分類過濾名單：'departed' 只看離隊球員（忽略 league）；其餘只看現役；教練一律排除
// 聯盟以 DB 的 org 欄位為準（隊名不在 TEAMS 的球員也不能消失）
export function filterRosterByLeague(roster, org, league) {
  const inOrg = roster.filter(p => p.org === org)
  const players = inOrg.filter(p => !p.isCoach)
  if (league === 'departed') return players.filter(p => p.status === 'departed')
  const active = players.filter(p => p.status === 'active')
  if (league === 'all') return active
  return active.filter(p => p.league === league)
}

// 球隊名稱依 TEAMS 順序排列（現役中職六隊在前、已解散隊在後、不在 TEAMS 的隊名最後）
export function sortTeamsByTeamsOrder(teamNames) {
  const rank = t => TEAM_ORDER.get(t) ?? Infinity
  return [...teamNames].sort((a, b) => rank(a) - rank(b))
}

// 離隊／歷史名單有數千人：必須先選球隊才列出球員
export function requiresTeamSelection(league, team) {
  return league === 'departed' && team == null
}
