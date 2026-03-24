<template>
  <div class="w-screen h-screen overflow-hidden">
    <!-- Audio 元素 -->
    <audio ref="audioRef" class="hidden"></audio>


    <!-- 通知 -->
    <Notification :notification="notification" />

    <!-- 設定頁面 -->
    <AdminScreen
      v-if="mode === 'admin'"
      @back="mode = 'menu'"
    />

    <!-- 主選單畫面 -->
    <MenuScreen
      v-if="mode === 'menu'"
      :is-loading="isLoading"
      :load-error="loadError"
      :roster-count="roster.length"
      @select-mode="selectMode"
      @retry="loadCSVFromURL"
      @go-admin="mode = 'admin'"
    />

    <!-- 選手挑選畫面 -->
    <LineupSelectionScreen
      v-if="mode === 'lineup'"
      :game-type="gameType"
      :batters="batters"
      :pitchers="pitchers"
      :selected-team="selectedTeam"
      :team-logos="teamLogos"
      :teams-with-batters="teamsWithBatters"
      :teams-with-pitchers="teamsWithPitchers"
      :filtered-batters="filteredBatters"
      :filtered-pitchers="filteredPitchers"
      :current-lineup="currentLineup"
      :current-pitcher="currentPitcher"
      :replacing-index="replacingIndex"
      :is-selecting-away-team="isSelectingAwayTeam"
      :selected-league="selectedLeague"
      @back="mode = 'menu'"
      @update:selected-team="selectedTeam = $event"
      @update:selected-league="selectedLeague = $event"
      @add-player="addToLineup"
      @replace-player="replaceLineupPlayer"
      @remove-player="removeFromLineup"
      @set-pitcher="currentPitcher = $event"
      @clear-pitcher="currentPitcher = null"
      @random-select="randomSelectLineup"
      @clear-lineup="clearLineup"
      :draft-lineup-positions="gameType === 'advanced' ? draftLineupPositions : null"
      @update:draft-lineup-position="(i, pos) => { const p = [...draftLineupPositions]; p[i] = pos; draftLineupPositions.value = p }"
      @swap-lineup-positions="swapLineupPositions"
      @confirm-away="confirmAwayTeam"
      @start-game="startGame"
      @back-to-away="backToAwayTeam"
    />

    <!-- 先發介紹畫面 -->
    <LineupIntroScreen
      :show="showLineupIntro"
      :lineup="lineup"
      :current-index="introIndex"
      :game-type="gameType"
      :is-top="isTop"
      @skip="skipIntro"
    />

    <!-- 比賽畫面（響應式布局） -->
    <GameScreen
      v-if="mode === 'game'"
      :key="`game-${selectedPitcher?.name}-${inning}-${isTop}`"
      :game-type="gameType"
      :inning="inning"
      :is-top="isTop"
      :score="score"
      :outs="outs"
      :runners="runners"
      :runner-photos="runnerPhotos"
      :selected-pitcher="selectedPitcher"
      :current-player="currentPlayer"
      :inning-scores="inningScores"
      :away-team-name="awayTeamName"
      :home-team-name="homeTeamName"
      :lineup="lineup"
      :current-batter-index="currentBatterIndex"
      :show-pitch-count="showPitchCount"
      :balls="balls"
      :strikes="strikes"
      :is-muted="isMuted"
      :get-pitcher-stats="getPitcherStats"
      :batter-results="batterResults"
      @go-menu="mode = 'menu'"
      @go-lineup="mode = 'lineup'"
      @toggle-pitch-count="showPitchCount = !showPitchCount"
      @toggle-mute="isMuted = !isMuted"
      @show-batter-select="showBatterSelect = true"
      @show-pitcher-select="showPitcherSelect = true"
      @play-batter-music="playBatterMusic"
      @add-ball="addBall"
      @add-strike="addStrike"
      @reset-count="balls = 0; strikes = 0"
      @hit="handleHit"
      @walk="handleWalk"
      @hbp="handleHBP"
      @out="handleOut"
      @strikeout="handleStrikeout"
    />

    <!-- 代打選擇器彈窗 -->
    <BatterSelectDialog
      :show="showBatterSelect"
      :filtered-batters="filteredBatters"
      :teams-with-batters="teamsWithBatters"
      :team-logos="teamLogos"
      :selected-team="selectedTeam"
      :selected-league="selectedLeague"
      :played-batters="playedBatters"
      :lineup="lineup"
      :current-batter-index="currentBatterIndex"
      @close="showBatterSelect = false"
      @select="substituteBatter($event)"
      @update:selected-team="selectedTeam = $event"
      @update:selected-league="selectedLeague = $event"
    />

    <!-- 進階模式守備重組對話框 -->
    <DefenseReorganizeDialog
      v-if="showDefenseReorganize"
      :lineup="isTop ? awayTeam.lineup : homeTeam.lineup"
      :lineup-positions="isTop ? awayTeam.lineupPositions : homeTeam.lineupPositions"
      :pending-fills="isTop ? awayTeam.pendingPositionFills : homeTeam.pendingPositionFills"
      :bench-roster="benchRoster"
      @confirm="onDefenseReorganizeConfirm"
    />

    <!-- 換投手選擇器彈窗 -->
    <PitcherSelectDialog
      v-if="mode === 'game'"
      :show="showPitcherSelect"
      title="選擇投手"
      :pitchers="pitchers"
      :filtered-pitchers="filteredPitchers"
      :teams-with-pitchers="teamsWithPitchers"
      :team-logos="teamLogos"
      :selected-team="selectedTeam"
      :selected-league="selectedLeague"
      :played-pitchers="playedPitchers"
      :get-team-pitcher-count="getTeamPitcherCount"
      @close="showPitcherSelect = false"
      @select="substitutePitcher($event)"
      @update:selected-team="selectedTeam = $event"
      @update:selected-league="selectedLeague = $event"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { supabase } from './lib/supabase.js'
import Notification from './components/Notification.vue'
import AdminScreen from './components/AdminScreen.vue'
import MenuScreen from './components/MenuScreen.vue'
import LineupSelectionScreen from './components/LineupSelectionScreen.vue'
import LineupIntroScreen from './components/LineupIntroScreen.vue'
import GameScreen from './components/GameScreen.vue'
import ScoreBoard from './components/ScoreBoard.vue'
import PlayerCard from './components/PlayerCard.vue'
import GameControls from './components/GameControls.vue'
import LineupList from './components/LineupList.vue'
import PitcherInfo from './components/PitcherInfo.vue'
import BallCountDisplay from './components/BallCountDisplay.vue'
import PitcherSelectDialog from './components/PitcherSelectDialog.vue'
import BatterSelectDialog from './components/BatterSelectDialog.vue'
import DefenseReorganizeDialog from './components/DefenseReorganizeDialog.vue'
import BasesDisplay from './components/BasesDisplay.vue'
import { processRunners, processWalk, playOutSound, playHitSound, speak } from './composables/gameHelpers.js'
import { useGameState } from './composables/useGameState.js'
import { usePlayerData } from './composables/usePlayerData.js'
import { useAudio } from './composables/useAudio.js'
import { useSpeech } from './composables/useSpeech.js'
import { useLineupManagement } from './composables/useLineupManagement.js'
import { usePlayerFilters } from './composables/usePlayerFilters.js'
import { useCurrentTeam } from './composables/useCurrentTeam.js'
import { useGameInitialization } from './composables/useGameInitialization.js'
import { useInningManager } from './composables/useInningManager.js'
import { useGameStats } from './composables/useGameStats.js'
import { TEXTS } from './constants/texts.js'
import { 
  PlayIcon, 
  RotateCcwIcon, 
  UsersIcon, 
  SettingsIcon, 
  Volume2Icon, 
  VolumeXIcon, 
  ActivityIcon, 
  TrophyIcon, 
  XCircleIcon, 
  InfoIcon 
} from './components/Icons.vue'

// === 使用 Composables ===
const gameState = useGameState()
const playerData = usePlayerData()
const audio = useAudio()
const speech = useSpeech()
const lineupMgmt = useLineupManagement()

// 解構 gameState
const {
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
  currentPlayer
} = gameState

// 解構 playerData
const {
  roster,
  isLoading,
  loadError,
  selectedTeam,
  teamLogos,
  CPBL_TEAMS,
  loadCSVFromURL,
  normalizeTeamName
} = playerData

// 解構 audio
const { audioRef, playBatterMusic, stopMusic } = audio

// 解構 speech（但不包括 speakBatterName，因為我們會覆寫它）
const { processSpeechText, speakIntro, cancel: cancelSpeech } = speech

// 解構 lineupMgmt
const { replacingIndex } = lineupMgmt

// 使用球員過濾 composable
const {
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
} = usePlayerFilters(roster, selectedTeam)

// 使用當前隊伍 composable
const { currentLineup, currentPitcher } = useCurrentTeam(
  gameType, 
  isSelectingAwayTeam, 
  lineup, 
  selectedPitcher, 
  awayTeam, 
  homeTeam
)

// Toast 通知
const showToast = (text, type = 'info') => {
  notification.value = { text, type }
  setTimeout(() => notification.value = null, 3000)
}

// 使用遊戲初始化 composable
const gameInitialization = useGameInitialization(gameState, showToast)

// 使用局管理 composable
const inningManager = useInningManager(gameState, showToast)

// 使用統計系統 composable
const gameStats = useGameStats()
const {
  getPitcherStats,
  getBatterStats,
  recordOutForPitcher,
  recordStrikeout,
  recordWalk,
  recordHit,
  recordOut,
  recordRunsAllowed,
  recordRBI,
  clearStats
} = gameStats

// 創建隊伍名稱 computed
const awayTeamName = computed(() => {
  if (gameType.value === 'single') return ''
  return awayTeam.value?.name || '客隊'
})

const homeTeamName = computed(() => {
  if (gameType.value === 'single') return ''
  return homeTeam.value?.name || '主隊'
})

const csvInput = ref('')
const teamChants = ref([])

// === 進階模式守位工具 ===
const FIELDING_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']
const PITCHER_POSITIONS = ['SP', 'RP', 'CP', 'P']

function canPlayPosition(player, position) {
  if (position === 'DH') return !PITCHER_POSITIONS.includes(player.mainPosition)
  if (!player.mainPosition && !player.otherPositions) return true
  if (player.mainPosition === position) return true
  if (player.otherPositions) {
    return player.otherPositions.split('/').map(p => p.trim()).includes(position)
  }
  return false
}

const draftLineupPositions = ref([]) // 選陣容時每打順的守位（進階模式用）

// 取得球員可擔任的守備位置清單（按主守位→副守位→DH排序）
function getPlayerPositions(player) {
  // 投手不可擔任野手守位
  if (PITCHER_POSITIONS.includes(player.mainPosition)) return []
  const positions = []
  if (player.mainPosition) positions.push(player.mainPosition)
  if (player.otherPositions) {
    player.otherPositions.split('/').map(p => p.trim()).filter(p => p && !PITCHER_POSITIONS.includes(p)).forEach(p => {
      if (!positions.includes(p)) positions.push(p)
    })
  }
  // 任何非投手皆可擔任 DH
  if (!positions.includes('DH')) positions.push('DH')
  // 自由球員（無設定主守位）→ 可擔任任何守位
  if (!player.mainPosition) return [...FIELDING_POSITIONS]
  return positions
}

// 守備重組對話框狀態
const showDefenseReorganize = ref(false)
const pendingThreeOutsCallbacks = ref(null)

onMounted(async () => {
  await loadCSVFromURL()
  const { data } = await supabase.from('team_chants').select('team, name, url')
  if (data) teamChants.value = data
  
  // 初始化語音引擎
  if ('speechSynthesis' in window) {
    // 觸發語音列表載入
    window.speechSynthesis.getVoices()
  }
})

// === 模式選擇 ===
const selectMode = (type) => {
  gameType.value = type
  mode.value = 'lineup'
  
  // 清空所有選手
  lineup.value = []
  selectedPitcher.value = null
  selectedTeam.value = null
  replacingIndex.value = -1
  
  // 如果是對戰模式或進階模式，初始化兩隊數據
  if (type === 'versus' || type === 'advanced') {
    awayTeam.value = { lineup: [], pitcher: null, batterIndex: 0, lineupPositions: [], pendingPositionFills: [] }
    homeTeam.value = { lineup: [], pitcher: null, batterIndex: 0, lineupPositions: [], pendingPositionFills: [] }
    isSelectingAwayTeam.value = true
    needHomeTeamIntro.value = false
    draftLineupPositions.value = []
  }
}

// === 打序選擇 ===
const addToLineup = (player) => {
  // 如果正在替換模式
  if (replacingIndex.value >= 0) {
    const existingIndex = currentLineup.value.findIndex((p, i) => p === player && i !== replacingIndex.value)
    if (existingIndex >= 0) {
      showToast('該球員已在打序中', 'alert')
      return
    }

    // 進階模式：替換時檢查守位相容性
    if (gameType.value === 'advanced') {
      const requiredPos = draftLineupPositions.value[replacingIndex.value]
      if (!canPlayPosition(player, requiredPos)) {
        showToast(`${player.name} 無法擔任 ${requiredPos}，無法替換`, 'alert')
        return
      }
    }

    const oldPlayer = currentLineup.value[replacingIndex.value]
    const newLineup = [...currentLineup.value]
    newLineup[replacingIndex.value] = player
    currentLineup.value = newLineup
    showToast(TEXTS.lineup.replaced(replacingIndex.value, oldPlayer.name, player.name), TEXTS.toast.success)
    replacingIndex.value = -1
    return
  }

  // 正常添加模式
  if (currentLineup.value.some(p => p.name === player.name && p.number === player.number)) return
  if (currentLineup.value.length >= 9) {
    showToast(TEXTS.lineup.full, TEXTS.toast.alert)
    return
  }

  // 進階模式：自動分配守位
  if (gameType.value === 'advanced') {
    const takenPositions = new Set(draftLineupPositions.value.filter(p => p))
    const available = getPlayerPositions(player).find(p => !takenPositions.has(p))
    if (!available) {
      showToast(`${player.name} 沒有可用的守備位置（所有守位已被使用）`, 'alert')
      return
    }
    currentLineup.value = [...currentLineup.value, player]
    draftLineupPositions.value = [...draftLineupPositions.value, available]
    return
  }

  currentLineup.value = [...currentLineup.value, player]
}

// 進階模式：打線內兩人互換守位
const swapLineupPositions = (indexA, indexB) => {
  const posA = draftLineupPositions.value[indexA]
  const posB = draftLineupPositions.value[indexB]
  const playerA = currentLineup.value[indexA]
  const playerB = currentLineup.value[indexB]
  if (!canPlayPosition(playerA, posB)) {
    showToast(`${playerA.name} 無法擔任 ${posB}`, 'alert')
    return
  }
  if (!canPlayPosition(playerB, posA)) {
    showToast(`${playerB.name} 無法擔任 ${posA}`, 'alert')
    return
  }
  const newPos = [...draftLineupPositions.value]
  newPos[indexA] = posB
  newPos[indexB] = posA
  draftLineupPositions.value = newPos
  showToast(`${playerA.name}(${posB}) ↔ ${playerB.name}(${posA}) 守位互換`, 'success')
}

const removeFromLineup = (index) => {
  const newLineup = [...currentLineup.value]
  newLineup.splice(index, 1)
  currentLineup.value = newLineup
  if (gameType.value === 'advanced') {
    const newPos = [...draftLineupPositions.value]
    newPos.splice(index, 1)
    draftLineupPositions.value = newPos
  }
}

// 確認客隊設定，切換到主隊選擇
const confirmAwayTeam = () => {
  if (currentLineup.value.length < 9 || !currentPitcher.value) {
    showToast(TEXTS.lineup.needComplete, TEXTS.toast.alert)
    return
  }
  if (gameType.value === 'advanced') {
    const filled = draftLineupPositions.value.every(p => p !== '')
    const unique = new Set(draftLineupPositions.value).size === 9
    if (!filled || !unique) {
      showToast('請為 9 個打順各指定唯一守備位置', 'alert')
      return
    }
    awayTeam.value.lineupPositions = [...draftLineupPositions.value]
    draftLineupPositions.value = []
  }
  isSelectingAwayTeam.value = false
  replacingIndex.value = -1
  selectedTeam.value = null
  showToast(TEXTS.team.awayConfirmed, TEXTS.toast.success)
}

// 返回客隊設定
const backToAwayTeam = () => {
  isSelectingAwayTeam.value = true
  replacingIndex.value = -1
  selectedTeam.value = null
}

// 清空當前打序
const clearLineup = () => {
  currentLineup.value = []
  currentPitcher.value = null
  replacingIndex.value = -1
  if (gameType.value === 'advanced') draftLineupPositions.value = []
}

// 點擊已選球員進行更換
const replaceLineupPlayer = (index) => {
  replacingIndex.value = index
  showToast(TEXTS.lineup.replacePrompt(index), TEXTS.toast.info)
  
  // 3秒後自動取消替換模式
  setTimeout(() => {
    if (replacingIndex.value === index) {
      replacingIndex.value = -1
    }
  }, 5000)
}

// 代打功能
const substituteBatter = (player) => {
  if (currentBatterIndex.value >= lineup.value.length) return
  
  const oldPlayer = lineup.value[currentBatterIndex.value]
  lineup.value[currentBatterIndex.value] = player
  showToast(TEXTS.substitution.batter(oldPlayer.name, player.name), TEXTS.toast.success)
  showBatterSelect.value = false
  selectedTeam.value = null
  
  // 中断音乐
  if (audioRef.value) {
    audioRef.value.pause()
    audioRef.value.currentTime = 0
  }
  
  // 播放代打語音
  speak(TEXTS.game.speech.substitute(player.name), processSpeechText, isMuted.value, 
    !isMuted.value ? () => playBatterMusic(player, teamChants.value) : null)
  
  // 如果沒有語音或靜音，直接播放音樂
  if (isMuted.value || !('speechSynthesis' in window)) {
    playBatterMusic(player, teamChants.value)
  }

  // 進階模式：同步更新 team object 並檢查守位相容性
  if (gameType.value === 'advanced') {
    const idx = currentBatterIndex.value
    const team = isTop.value ? awayTeam.value : homeTeam.value
    const requiredPos = team.lineupPositions[idx]
    team.lineup[idx] = player
    if (canPlayPosition(player, requiredPos)) {
      team.pendingPositionFills = team.pendingPositionFills.filter(f => f.batterIndex !== idx)
    } else {
      const alreadyPending = team.pendingPositionFills.some(f => f.batterIndex === idx)
      if (!alreadyPending) {
        team.pendingPositionFills.push({ batterIndex: idx, requiredPosition: requiredPos })
      }
    }
  }
}

// 換投手功能
const substitutePitcher = (pitcher) => {
  const oldPitcher = selectedPitcher.value
  selectedPitcher.value = pitcher
  playedPitchers.value.add(pitcher.name + pitcher.number)
  
  // 重要：更新對應隊伍的投手，這樣換局時才不會換回來
  if (gameType.value === 'versus' || gameType.value === 'advanced') {
    if (isTop.value) {
      // 上半局進攻 -> 主隊投手
      homeTeam.value.pitcher = pitcher
      console.log('更新主隊投手:', pitcher.name)
    } else {
      // 下半局進攻 -> 客隊投手
      awayTeam.value.pitcher = pitcher
      console.log('更新客隊投手:', pitcher.name)
    }
  }
  
  showToast(TEXTS.substitution.pitcher(oldPitcher?.name, pitcher.name), TEXTS.toast.success)
  showPitcherSelect.value = false
  selectedTeam.value = null
  
  if (audioRef.value) audioRef.value.pause()
  
  // 播放換投語音
  const resumeMusic = () => {
    if (!isMuted.value && audioRef.value?.src && audioRef.value.paused) {
      setTimeout(() => audioRef.value.play().catch(() => {}), 300)
    }
  }
  
  speak(TEXTS.game.speech.pitcherChange(pitcher.name), processSpeechText, isMuted.value, resumeMusic)
  
  // 如果沒有語音或靜音，稍等後恢復音樂
  if ((isMuted.value || !('speechSynthesis' in window)) && !isMuted.value) {
    setTimeout(() => {
      if (audioRef.value?.src && audioRef.value.paused) {
        audioRef.value.play().catch(() => {})
      }
    }, 500)
  }
}

// 随机选择球员
const randomSelectLineup = () => {
  clearLineup()
  
  // 从所有打者中随机选择9名
  const availableBatters = [...batters.value]
  const shuffled = availableBatters.sort(() => Math.random() - 0.5)
  
  const newLineup = []
  for (let i = 0; i < 9 && i < shuffled.length; i++) {
    newLineup.push(shuffled[i])
  }
  currentLineup.value = newLineup
  
  // 隨機選擇一個投手
  const availablePitchers = [...pitchers.value]
  if (availablePitchers.length > 0) {
    const randomPitcher = availablePitchers[Math.floor(Math.random() * availablePitchers.length)]
    currentPitcher.value = randomPitcher
  }
  
  showToast(TEXTS.lineup.randomSelected, TEXTS.toast.success)
}

// 跳過先發介紹
const skipIntro = () => {
  // 立即停止所有語音播放
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
    ;[50, 100, 200].forEach(delay => 
      setTimeout(() => window.speechSynthesis.cancel(), delay)
    )
  }
  
  // 直接結束介紹
  introIndex.value = lineup.value.length
  showLineupIntro.value = false
  
  // 確保第一棒的語音和音樂播放
  if (currentPlayer.value && !isMuted.value) {
    setTimeout(() => speakBatterName(currentPlayer.value.name, currentBatterIndex.value), 300)
    setTimeout(() => playBatterMusic(currentPlayer.value, teamChants.value), 3800)
  }
}

const startGame = () => {
  // 進階模式：驗證主隊守位並儲存
  if (gameType.value === 'advanced') {
    const filled = draftLineupPositions.value.every(p => p !== '')
    const unique = new Set(draftLineupPositions.value).size === 9
    if (!filled || !unique) {
      showToast('請為 9 個打順各指定唯一守備位置', 'alert')
      return
    }
    homeTeam.value.lineupPositions = [...draftLineupPositions.value]
    draftLineupPositions.value = []
  }

  // 清空統計
  clearStats()
  batterResults.value = {}

  gameInitialization.startGame({
    showLineupIntro,
    introIndex,
    playLineupIntro,
    needHomeTeamIntro
  })
}

// 播放先發介紹
const playLineupIntro = () => {
  if (introIndex.value >= lineup.value.length) {
    setTimeout(() => {
      showLineupIntro.value = false
      // 不在這裡播放音樂，讓 watch 處理
    }, 1500)
    return
  }
  
  const player = lineup.value[introIndex.value]
  const introText = (player.intro?.trim() && !player.intro.startsWith('http'))
    ? player.intro
    : TEXTS.game.speech.batterIntro(introIndex.value, player.number, player.name)
  
  speakIntro(introText)
  setTimeout(() => {
    introIndex.value++
    playLineupIntro()
  }, 4000)
}

// 覆寫 speakBatterName 使用文案常數
const speakBatterName = (name, batterIndex) => {
  speak(TEXTS.game.speech.batterUp(batterIndex, name), processSpeechText, isMuted.value, null)
}

// 語音播放中的狀態標記
const isPlayingResultSpeech = ref(false)

watch([currentBatterIndex, mode, isMuted, showLineupIntro], ([newIndex, newMode, newMuted, newShowIntro], [oldIndex, oldMode, oldMuted, oldShowIntro]) => {
  // 只在遊戲模式、未靜音、且不在播放介紹時播放音樂
  if (newMode === 'game' && !newMuted && !newShowIntro) {
    const player = currentPlayer.value
    if (player && audioRef.value) {
      // 觸發條件：
      // 1. 從其他模式切換到 game 模式
      // 2. 打者索引改變
      // 3. 介紹結束（oldShowIntro 為 true，newShowIntro 為 false）
      const modeChange = oldMode !== 'game' && newMode === 'game'
      const indexChange = newIndex !== oldIndex && oldIndex !== undefined
      const introEnd = oldShowIntro === true && newShowIntro === false
      
      const shouldPlay = modeChange || indexChange || introEnd
      
      console.log('Watch 觸發:', { 
        newIndex, oldIndex, newMode, oldMode, newShowIntro, oldShowIntro,
        modeChange, indexChange, introEnd, shouldPlay,
        player: player.name,
        hasSong: !!player.song,
        hasIntro: !!player.intro
      })
      
      if (shouldPlay) {
        // 等待安打/出局語音播放完成
        const checkAndPlay = () => {
          if (isPlayingResultSpeech.value) {
            console.log('等待結果語音播放完成...')
            // 如果還在播放結果語音，稍後再檢查
            setTimeout(checkAndPlay, 200)
            return
          }
          
          // 播放TTS語音
          console.log('播放打者語音:', player.name)
          speakBatterName(player.name, newIndex)
          
          // 等待語音播報完成後再播放音樂
          setTimeout(() => {
            if (!isMuted.value && mode.value === 'game' && !showLineupIntro.value) {
              console.log('嘗試播放應援曲:', { 
                player: player.name, 
                song: player.song, 
                intro: player.intro,
                audioRef: !!audioRef.value 
              })
              playBatterMusic(player, teamChants.value)
            } else {
              console.log('跳過音樂播放:', { 
                isMuted: isMuted.value, 
                mode: mode.value, 
                showLineupIntro: showLineupIntro.value 
              })
            }
          }, 3500) // 3.5秒後播放，給足夠時間完成語音播報
        }
        
        checkAndPlay()
      }
    } else {
      console.log('無法播放:', { hasPlayer: !!player, hasAudioRef: !!audioRef.value })
      if (audioRef.value) {
        audioRef.value.pause()
      }
    }
  } else if (audioRef.value && (newShowIntro || newMode !== 'game')) {
    console.log('停止音樂:', { newShowIntro, newMode })
    // 如果開始播放介紹或離開遊戲模式，停止音樂
    audioRef.value.pause()
  }
}, { deep: true })

// === 棒球邏輯 ===
const nextBatter = () => {
  // 記錄當前打者已上場
  if (currentPlayer.value) {
    playedBatters.value.add(currentPlayer.value.name + currentPlayer.value.number)
  }
  
  balls.value = 0
  strikes.value = 0
  currentBatterIndex.value = (currentBatterIndex.value + 1) % lineup.value.length
}

const handleHit = (bases) => {
  // 中断当前播放的应援曲
  if (audioRef.value) {
    audioRef.value.pause()
    audioRef.value.currentTime = 0
  }
  
  // 播放安打音效（使用輔助函數）
  playHitSound(isMuted.value)
  
  // 處理跑壘邏輯（使用輔助函數）
  const result = processRunners(
    runners.value, 
    runnerPhotos.value, 
    bases, 
    currentPlayer.value?.photo
  )
  
  runners.value = result.runners
  runnerPhotos.value = result.runnerPhotos
  const runs = result.runs

  // 記錄統計：安打、失分、打點
  if (currentPlayer.value && selectedPitcher.value) {
    recordHit(selectedPitcher.value, currentPlayer.value, bases === 4)
    if (runs > 0) {
      recordRunsAllowed(selectedPitcher.value, runs)
      recordRBI(currentPlayer.value, runs)
    }
    
    // 記錄打者攻擊結果
    const batterId = `${currentPlayer.value.name}${currentPlayer.value.number}`
    if (!batterResults.value[batterId]) batterResults.value[batterId] = []
    const hitTypes = ['一壘', '二壘', '三壘', '全壘']
    batterResults.value[batterId].push({ type: 'hit', detail: hitTypes[bases - 1] })
  }

  // 顯示提示
  if (bases === 4) {
    showToast(TEXTS.game.homeRun(runs), TEXTS.toast.alert)
  } else {
    const hitNames = [TEXTS.game.hitTypes.single, TEXTS.game.hitTypes.double, TEXTS.game.hitTypes.triple]
    if (runs > 0) showToast(TEXTS.game.hit(hitNames[bases-1], runs))
  }

  // 播放語音（使用輔助函數）
  const hitTexts = [TEXTS.game.speech.single, TEXTS.game.speech.double, TEXTS.game.speech.triple, TEXTS.game.speech.homeRun]
  const speechText = runs > 0 
    ? TEXTS.game.speech.hitWithRuns(hitTexts[bases - 1], runs)
    : TEXTS.game.speech.hitNoRuns(hitTexts[bases - 1])
  
  isPlayingResultSpeech.value = true
  speak(speechText, processSpeechText, isMuted.value, () => {
    isPlayingResultSpeech.value = false
  })

  addScore(runs)
  nextBatter()
}

const handleWalk = () => {
  // 記錄統計：四壞球
  if (currentPlayer.value && selectedPitcher.value) {
    recordWalk(selectedPitcher.value, currentPlayer.value)
    
    // 記錄打者攻擊結果
    const batterId = `${currentPlayer.value.name}${currentPlayer.value.number}`
    if (!batterResults.value[batterId]) batterResults.value[batterId] = []
    batterResults.value[batterId].push({ type: 'walk', detail: '四壞' })
  }
  
  // 處理保送跑壘邏輯（使用輔助函數）
  const result = processWalk(
    runners.value, 
    runnerPhotos.value, 
    currentPlayer.value?.photo
  )
  
  runners.value = result.runners
  runnerPhotos.value = result.runnerPhotos
  const runs = result.runs
  
  // 記錄失分和打點
  if (runs > 0 && currentPlayer.value && selectedPitcher.value) {
    recordRunsAllowed(selectedPitcher.value, runs)
    recordRBI(currentPlayer.value, runs)
  }
  
  if (runs > 0) showToast(TEXTS.game.walkLoaded)
  
  // 播放語音（使用輔助函數）
  const speechText = runs > 0 
    ? TEXTS.game.speech.walkWithRuns(runs)
    : TEXTS.game.speech.walk
  
  isPlayingResultSpeech.value = true
  speak(speechText, processSpeechText, isMuted.value, () => {
    isPlayingResultSpeech.value = false
  })
  
  addScore(runs)
  nextBatter()
}

// 觸身球 (HBP - Hit By Pitch)
const handleHBP = () => {
  // 記錄打者攻擊結果
  if (currentPlayer.value) {
    const batterId = `${currentPlayer.value.name}${currentPlayer.value.number}`
    if (!batterResults.value[batterId]) batterResults.value[batterId] = []
    batterResults.value[batterId].push({ type: 'walk', detail: '觸身' })
  }
  
  // 處理觸身球跑壘邏輯（與保送相同）
  const result = processWalk(
    runners.value, 
    runnerPhotos.value, 
    currentPlayer.value?.photo
  )
  
  runners.value = result.runners
  runnerPhotos.value = result.runnerPhotos
  const runs = result.runs
  
  if (runs > 0) showToast(TEXTS.game.hbpLoaded)
  else showToast(TEXTS.game.hbp)
  
  // 播放語音（使用輔助函數）
  const speechText = runs > 0 
    ? TEXTS.game.speech.hbpWithRuns(runs)
    : TEXTS.game.speech.hbp
  
  isPlayingResultSpeech.value = true
  speak(speechText, processSpeechText, isMuted.value, () => {
    isPlayingResultSpeech.value = false
  })
  
  addScore(runs)
  nextBatter()
}

const buildVersusCallbacks = () => ({
  playLineupIntro,
  speakBatterName,
  playBatterMusic,
  currentPlayer,
  showLineupIntro,
  introIndex,
  needHomeTeamIntro,
  isMuted,
  audioRef,
  teamChants,
})

const benchRoster = computed(() => {
  const currentLineupIds = new Set(lineup.value.map(p => p?.id || (p?.name + p?.number)).filter(Boolean))
  const currentTeam = isTop.value ? awayTeam.value.lineup[0]?.team : homeTeam.value.lineup[0]?.team
  return roster.value.filter(p => p.team === currentTeam && !currentLineupIds.has(p.id || (p.name + p.number)))
})

// 處理三出局的共用邏輯
const handleThreeOuts = () => {
  if (gameType.value === 'advanced') {
    const team = isTop.value ? awayTeam.value : homeTeam.value
    if (team.pendingPositionFills.length > 0) {
      pendingThreeOutsCallbacks.value = buildVersusCallbacks()
      showDefenseReorganize.value = true
      return
    }
    team.pendingPositionFills = []
    inningManager.handleThreeOutsVersus(buildVersusCallbacks())
    return
  }
  if (gameType.value === 'versus') {
    inningManager.handleThreeOutsVersus(buildVersusCallbacks())
  } else {
    inningManager.handleThreeOutsSingle(nextBatter)
  }
}

const onDefenseReorganizeConfirm = ({ newLineup, newPositions }) => {
  const team = isTop.value ? awayTeam.value : homeTeam.value
  team.lineup = newLineup
  team.lineupPositions = newPositions
  team.pendingPositionFills = []
  showDefenseReorganize.value = false
  if (pendingThreeOutsCallbacks.value) {
    inningManager.handleThreeOutsVersus(pendingThreeOutsCallbacks.value)
    pendingThreeOutsCallbacks.value = null
  }
}

// 通用出局處理
const handleOutBase = (speechText, toastText) => {
  // 中断当前播放的应援曲
  if (audioRef.value) {
    audioRef.value.pause()
    audioRef.value.currentTime = 0
  }
  
  // 播放出局音效
  playOutSound(isMuted.value)
  
  // 播放語音
  isPlayingResultSpeech.value = true
  speak(speechText, processSpeechText, isMuted.value, () => {
    isPlayingResultSpeech.value = false
  })
  
  const newOuts = outs.value + 1
  balls.value = 0
  strikes.value = 0
  outs.value = newOuts

  if (newOuts >= 3) {
    handleThreeOuts()
  } else {
    showToast(toastText)
    nextBatter()
  }
}

const handleStrikeout = () => {
  // 記錄統計：三振
  if (currentPlayer.value && selectedPitcher.value) {
    recordStrikeout(selectedPitcher.value, currentPlayer.value)
    
    // 記錄打者攻擊結果
    const batterId = `${currentPlayer.value.name}${currentPlayer.value.number}`
    if (!batterResults.value[batterId]) batterResults.value[batterId] = []
    batterResults.value[batterId].push({ type: 'out', detail: '三振' })
  }
  return handleOutBase(TEXTS.game.speech.strikeout, TEXTS.game.strikeout)
}

const handleOut = () => {
  // 記錄統計：出局（包含投手的出局數）
  if (currentPlayer.value && selectedPitcher.value) {
    recordOut(selectedPitcher.value, currentPlayer.value)
    
    // 記錄打者攻擊結果
    const batterId = `${currentPlayer.value.name}${currentPlayer.value.number}`
    if (!batterResults.value[batterId]) batterResults.value[batterId] = []
    batterResults.value[batterId].push({ type: 'out', detail: '出局' })
  }
  return handleOutBase(TEXTS.game.speech.out, TEXTS.game.out)
}

const addScore = (runs) => {
  if (runs === 0) return
  const currentInning = inning.value - 1 // 陣列索引從0開始
  if (gameType.value !== 'single') {
    if (isTop.value) {
      score.away += runs
      if (currentInning < 9) {
        if (inningScores.value.away[currentInning] === undefined) inningScores.value.away[currentInning] = 0
        inningScores.value.away[currentInning] += runs
      }
    } else {
      score.home += runs
      if (currentInning < 9) {
        if (inningScores.value.home[currentInning] === undefined) inningScores.value.home[currentInning] = 0
        inningScores.value.home[currentInning] += runs
      }
    }
  } else {
    score.away += runs
    if (currentInning < 9) {
      if (inningScores.value.away[currentInning] === undefined) inningScores.value.away[currentInning] = 0
      inningScores.value.away[currentInning] += runs
    }
  }
}

const addBall = () => {
  balls.value + 1 === 4 ? (showToast(TEXTS.game.fourBalls), handleWalk()) : balls.value++
}

const addStrike = () => {
  strikes.value + 1 === 3 ? (showToast(TEXTS.game.threeStrikes, TEXTS.toast.alert), handleStrikeout()) : strikes.value++
}
</script>
