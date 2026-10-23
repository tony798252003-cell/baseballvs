import { TEAMS, orgOfTeam } from '../constants/teams.js'

const TEAM_ORDER = new Map(TEAMS.map((t, i) => [t.name, i]))

// 依聯盟／分類過濾名單：'departed' 只看離隊球員（忽略 league／教練）；其餘只看現役
export function filterRosterByLeague(roster, org, league) {
  const inOrg = roster.filter(p => orgOfTeam(p.team) === org)
  if (league === 'departed') return inOrg.filter(p => p.status === 'departed')
  const active = inOrg.filter(p => p.status === 'active')
  if (league === 'coach') return active.filter(p => p.isCoach)
  if (league === 'all') return active
  return active.filter(p => !p.isCoach && p.league === league)
}

// 球隊名稱依 TEAMS 順序排列（現役中職六隊在前、已解散隊在後）
export function sortTeamsByTeamsOrder(teamNames) {
  return [...teamNames].sort((a, b) => TEAM_ORDER.get(a) - TEAM_ORDER.get(b))
}
