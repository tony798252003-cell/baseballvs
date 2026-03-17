import { ref, reactive, computed } from 'vue'

export function useGameState() {
  // 遊戲模式
  const mode = ref('menu') // menu, lineup, game
  const gameType = ref('single') // single, versus
  
  // 球員陣容
  const lineup = ref([])
  const selectedPitcher = ref(null)
  
  // 對戰模式數據
  const awayTeam = ref({ lineup: [], pitcher: null, batterIndex: 0 })
  const homeTeam = ref({ lineup: [], pitcher: null, batterIndex: 0 })
  const isSelectingAwayTeam = ref(true)
  const needHomeTeamIntro = ref(false)
  
  // 比賽狀態
  const currentBatterIndex = ref(0)
  const score = reactive({ away: 0, home: 0 })
  const inning = ref(1)
  const isTop = ref(true)
  const outs = ref(0)
  const runners = ref([false, false, false])
  const runnerPhotos = ref(['', '', ''])
  const inningScores = ref({ away: [], home: [] })
  
  // 記球數
  const showPitchCount = ref(false)
  const balls = ref(0)
  const strikes = ref(0)
  
  // 追蹤已上場球員
  const playedBatters = ref(new Set())
  const playedPitchers = ref(new Set())
  
  // 打者攻擊結果記錄 { batterId: [results] }
  // result: { type: 'hit'|'out'|'walk'|'hbp', detail: '一壘安'|'三振'|'四壞' }
  const batterResults = ref({})
  
  // UI 狀態
  const showLineupIntro = ref(false)
  const introIndex = ref(0)
  const showPitcherSelect = ref(false)
  const showBatterSelect = ref(false)
  const notification = ref(null)
  const isMuted = ref(false)
  const replacingIndex = ref(-1)
  
  // 計算當前打者
  const currentPlayer = computed(() => {
    if (lineup.value.length === 0) return null
    return lineup.value[currentBatterIndex.value]
  })
  
  // 重置遊戲狀態
  const resetGameState = () => {
    currentBatterIndex.value = 0
    score.away = 0
    score.home = 0
    inning.value = 1
    isTop.value = true
    outs.value = 0
    runners.value = [false, false, false]
    runnerPhotos.value = ['', '', '']
    balls.value = 0
    strikes.value = 0
    playedBatters.value = new Set()
    playedPitchers.value = new Set()
    inningScores.value = {
      away: Array(9).fill(undefined).map((_, i) => i === 0 ? 0 : undefined),
      home: Array(9).fill(undefined).map((_, i) => i === 0 ? 0 : undefined)
    }
  }
  
  // 切換隊伍
  const switchTeams = () => {
    console.log('switchTeams 被調用')
    
    // 保存當前隊伍的打者索引
    if (isTop.value) {
      awayTeam.value.batterIndex = currentBatterIndex.value
      console.log('保存客隊索引:', currentBatterIndex.value)
    } else {
      homeTeam.value.batterIndex = currentBatterIndex.value
      console.log('保存主隊索引:', currentBatterIndex.value)
    }
    
    // 切換攻守
    isTop.value = !isTop.value
    console.log('切換後 isTop:', isTop.value)
    
    // 切換打線和投手
    if (isTop.value) {
      // 客隊進攻
      console.log('設定客隊打線，人數:', awayTeam.value.lineup.length)
      lineup.value = [...awayTeam.value.lineup]
      selectedPitcher.value = homeTeam.value.pitcher
      currentBatterIndex.value = awayTeam.value.batterIndex
    } else {
      // 主隊進攻
      console.log('設定主隊打線，人數:', homeTeam.value.lineup.length)
      lineup.value = [...homeTeam.value.lineup]
      selectedPitcher.value = awayTeam.value.pitcher
      currentBatterIndex.value = homeTeam.value.batterIndex
    }
    
    console.log('切換後 lineup 長度:', lineup.value.length)
    console.log('切換後 currentBatterIndex:', currentBatterIndex.value)
  }
  
  return {
    // 狀態
    mode,
    gameType,
    lineup,
    selectedPitcher,
    awayTeam,
    homeTeam,
    isSelectingAwayTeam,
    needHomeTeamIntro,
    currentBatterIndex,
    score,
    inning,
    isTop,
    outs,
    runners,
    runnerPhotos,
    inningScores,
    showPitchCount,
    balls,
    strikes,
    playedBatters,
    playedPitchers,
    batterResults,
    showLineupIntro,
    introIndex,
    showPitcherSelect,
    showBatterSelect,
    notification,
    isMuted,
    replacingIndex,
    currentPlayer,
    
    // 方法
    resetGameState,
    switchTeams
  }
}
