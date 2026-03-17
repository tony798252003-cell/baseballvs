import { TEXTS } from '../constants/texts'

export function useGameInitialization(gameState, showToast) {
  const {
    gameType, lineup, selectedPitcher, awayTeam, homeTeam, mode,
    currentBatterIndex, score, inning, isTop, outs, runners,
    inningScores, playedBatters, playedPitchers, showPitcherSelect
  } = gameState

  // 驗證單人模式陣容
  const validateSingleMode = () => {
    if (lineup.value.length === 0) {
      showToast(TEXTS.lineup.needPlayer, TEXTS.toast.alert)
      return false
    }
    if (!selectedPitcher.value) {
      showToast(TEXTS.lineup.needPitcher, TEXTS.toast.alert)
      return false
    }
    return true
  }

  // 驗證對戰模式陣容
  const validateVersusMode = () => {
    if (awayTeam.value.lineup.length < 9 || !awayTeam.value.pitcher) {
      showToast(TEXTS.lineup.awayIncomplete, TEXTS.toast.alert)
      return false
    }
    if (homeTeam.value.lineup.length < 9 || !homeTeam.value.pitcher) {
      showToast(TEXTS.lineup.homeIncomplete, TEXTS.toast.alert)
      return false
    }
    return true
  }

  // 初始化對戰模式的團隊數據
  const initializeVersusMode = () => {
    // 初始化兩隊的打者索引
    awayTeam.value.batterIndex = 0
    homeTeam.value.batterIndex = 0
    
    // 設定 lineup 和 selectedPitcher 為客隊的資料（上半局開始）
    console.log('遊戲開始 - 設定客隊打線:', awayTeam.value.lineup.map(p => p.name))
    lineup.value = [...awayTeam.value.lineup]
    selectedPitcher.value = homeTeam.value.pitcher // 客隊進攻時，主隊投手
    console.log('lineup 設定完成:', lineup.value.map(p => p.name))
  }

  // 初始化遊戲狀態
  const initializeGameState = () => {
    mode.value = 'game'
    showPitcherSelect.value = false
    currentBatterIndex.value = 0
    score.away = 0
    score.home = 0
    inning.value = 1
    isTop.value = true
    outs.value = 0
    runners.value = [false, false, false]
  }

  // 初始化每局得分記錄
  const initializeInningScores = () => {
    inningScores.value = {
      away: Array(9).fill(0).map((_, i) => i === 0 ? 0 : undefined),
      home: Array(9).fill(0).map((_, i) => i === 0 ? 0 : undefined)
    }
  }

  // 初始化已上場記錄
  const initializePlayedPlayers = (needHomeTeamIntro) => {
    playedBatters.value = new Set()
    playedPitchers.value = new Set([
      selectedPitcher.value && `${selectedPitcher.value.name}${selectedPitcher.value.number}`,
      gameType.value === 'versus' && awayTeam.value.pitcher && `${awayTeam.value.pitcher.name}${awayTeam.value.pitcher.number}`
    ].filter(Boolean))
    
    // 設定需要主隊介紹的標記
    if (gameType.value === 'versus' && needHomeTeamIntro) {
      needHomeTeamIntro.value = true
    }
  }

  // 開始遊戲
  const startGame = (callbacks) => {
    const { showLineupIntro, introIndex, playLineupIntro, needHomeTeamIntro } = callbacks

    // 驗證
    if (gameType.value === 'single') {
      if (!validateSingleMode()) return
    } else {
      if (!validateVersusMode()) return
      initializeVersusMode()
    }

    // 初始化遊戲狀態
    initializeGameState()
    initializeInningScores()
    initializePlayedPlayers(needHomeTeamIntro)

    // 顯示先發介紹畫面
    showLineupIntro.value = true
    introIndex.value = 0
    playLineupIntro()
  }

  return {
    validateSingleMode,
    validateVersusMode,
    initializeVersusMode,
    initializeGameState,
    initializeInningScores,
    initializePlayedPlayers,
    startGame
  }
}
