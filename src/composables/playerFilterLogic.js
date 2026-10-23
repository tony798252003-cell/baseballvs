import { TEAMS, orgOfTeam } from '../constants/teams.js'

const TEAM_ORDER = new Map(TEAMS.map((t, i) => [t.name, i]))

// 依聯盟／分類過濾名單：'departed' 只看離隊球員（忽略 league）；其餘只看現役；教練一律排除
export function filterRosterByLeague(roster, org, league) {
  const inOrg = roster.filter(p => orgOfTeam(p.team) === org)
  const players = inOrg.filter(p => !p.isCoach)
  if (league === 'departed') return players.filter(p => p.status === 'departed')
  const active = players.filter(p => p.status === 'active')
  if (league === 'all') return active
  return active.filter(p => p.league === league)
}

// 球隊名稱依 TEAMS 順序排列（現役中職六隊在前、已解散隊在後）
export function sortTeamsByTeamsOrder(teamNames) {
  return [...teamNames].sort((a, b) => TEAM_ORDER.get(a) - TEAM_ORDER.get(b))
}
