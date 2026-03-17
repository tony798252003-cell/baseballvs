import { computed } from 'vue'

// 當前陣容管理 composable
export function useCurrentTeam(gameType, isSelectingAwayTeam, lineup, selectedPitcher, awayTeam, homeTeam) {
  // 當前正在編輯的陣容（根據遊戲模式和選擇狀態）
  const currentLineup = computed({
    get: () => {
      if (gameType.value === 'versus') {
        return isSelectingAwayTeam.value ? awayTeam.value.lineup : homeTeam.value.lineup
      }
      return lineup.value
    },
    set: (val) => {
      if (gameType.value === 'versus') {
        if (isSelectingAwayTeam.value) {
          awayTeam.value.lineup = val
        } else {
          homeTeam.value.lineup = val
        }
      } else {
        lineup.value = val
      }
    }
  })

  // 當前正在編輯的投手（根據遊戲模式和選擇狀態）
  const currentPitcher = computed({
    get: () => {
      if (gameType.value === 'versus') {
        return isSelectingAwayTeam.value ? awayTeam.value.pitcher : homeTeam.value.pitcher
      }
      return selectedPitcher.value
    },
    set: (val) => {
      if (gameType.value === 'versus') {
        if (isSelectingAwayTeam.value) {
          awayTeam.value.pitcher = val
        } else {
          homeTeam.value.pitcher = val
        }
      } else {
        selectedPitcher.value = val
      }
    }
  })

  return {
    currentLineup,
    currentPitcher,
  }
}
