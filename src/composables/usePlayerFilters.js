import { computed, ref, watch } from 'vue'
import { orgOfTeam } from '../constants/teams.js'
import { filterRosterByLeague, sortTeamsByTeamsOrder } from './playerFilterLogic.js'

// 球員過濾和計算 composable
export function usePlayerFilters(roster, selectedTeam) {
  const selectedOrg = ref('CPBL') // 'CPBL' | 'NPB' | 'MLB'
  const selectedLeague = ref('一軍') // '一軍' | '二軍' | 'all' | 'departed'

  // 換聯盟時清掉已選球隊（舊球隊不屬於新聯盟）
  watch(selectedOrg, () => { selectedTeam.value = null })

  // 球隊列表：僅限目前聯盟，依 TEAMS 順序
  const teams = computed(() => {
    const teamSet = new Set(roster.value.map(p => p.team))
    return sortTeamsByTeamsOrder(
      [...teamSet].filter(t => orgOfTeam(t) === selectedOrg.value)
    )
  })

  // 判斷是否為投手守位的輔助函數
  const isPitcherPosition = (position) => {
    if (!position) return false
    const pos = position.toUpperCase()
    return pos === 'P' || pos === 'SP' || pos === 'RP' || pos === 'CP'
  }

  // 檢查球員是否有投手守位（主要守位或其他守位）
  const hasAnyPitcherPosition = (player) => {
    // 檢查主要守位
    if (isPitcherPosition(player.mainPosition)) return true
    // 檢查其他守位
    if (player.otherPositions) {
      const positions = player.otherPositions.split(',').map(p => p.trim())
      return positions.some(pos => isPitcherPosition(pos))
    }
    return false
  }

  // 依聯盟與 league／離隊分類過濾的基礎名單
  const leagueRoster = computed(() =>
    filterRosterByLeague(roster.value, selectedOrg.value, selectedLeague.value)
  )

  // 打者：主要守位不是純投手的球員都可以打擊
  const batters = computed(() =>
    leagueRoster.value.filter(p => !isPitcherPosition(p.mainPosition))
  )

  // 投手：任何有投手守位的球員（主要守位或其他守位）
  const pitchers = computed(() =>
    leagueRoster.value.filter(p => hasAnyPitcherPosition(p))
  )

  // 篩選後的打者
  const filteredBatters = computed(() => {
    if (selectedTeam.value === null) return batters.value
    return batters.value.filter(p => p.team === selectedTeam.value)
  })

  // 篩選後的投手
  const filteredPitchers = computed(() => {
    if (selectedTeam.value === null) return pitchers.value
    return pitchers.value.filter(p => p.team === selectedTeam.value)
  })

  // 計算球隊球員數量
  const getTeamBatterCount = (team) => 
    batters.value.filter(p => p.team === team).length

  const getTeamPitcherCount = (team) => 
    pitchers.value.filter(p => p.team === team).length

  // 有打者的球隊列表
  const teamsWithBatters = computed(() => 
    teams.value.filter(team => getTeamBatterCount(team) > 0)
  )

  // 有投手的球隊列表
  const teamsWithPitchers = computed(() => 
    teams.value.filter(team => getTeamPitcherCount(team) > 0)
  )

  return {
    teams,
    batters,
    pitchers,
    filteredBatters,
    filteredPitchers,
    teamsWithBatters,
    teamsWithPitchers,
    getTeamBatterCount,
    getTeamPitcherCount,
    selectedLeague,
    selectedOrg,
  }
}
