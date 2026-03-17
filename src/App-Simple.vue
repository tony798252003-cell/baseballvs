<template>
  <div class="min-h-screen bg-gray-900 text-white p-8">
    <h1 class="text-4xl font-bold mb-8">棒球對決 - 測試版</h1>
    
    <!-- 模式選擇 -->
    <div v-if="mode === 'menu'" class="space-y-4">
      <button @click="selectMode('single')" class="bg-blue-500 px-6 py-3 rounded">單人模式</button>
      <button @click="selectMode('versus')" class="bg-green-500 px-6 py-3 rounded ml-4">對戰模式</button>
    </div>
    
    <!-- 球員選擇 -->
    <div v-if="mode === 'lineup'" class="space-y-4">
      <h2 class="text-2xl">{{ gameType === 'versus' && isSelectingAwayTeam ? '選擇客隊' : (gameType === 'versus' ? '選擇主隊' : '選擇球員') }}</h2>
      
      <div class="grid grid-cols-3 gap-4">
        <div v-for="player in roster.slice(0, 20)" :key="player.name + player.number"
          @click="addToLineup(player)"
          class="bg-gray-800 p-4 rounded cursor-pointer hover:bg-gray-700">
          <div>{{ player.name }} #{{ player.number }}</div>
          <div class="text-sm text-gray-400">{{ player.team }}</div>
        </div>
      </div>
      
      <div class="mt-8">
        <h3 class="text-xl mb-4">已選打序 ({{ gameType === 'versus' && isSelectingAwayTeam ? '客隊' : (gameType === 'versus' ? '主隊' : '') }})</h3>
        <div v-for="(player, index) in currentLineup" :key="index" class="bg-gray-800 p-2 mb-2 rounded">
          {{ index + 1 }}. {{ player.name }} #{{ player.number }}
        </div>
      </div>
      
      <div class="mt-4 space-x-4">
        <button @click="mode = 'menu'" class="bg-red-500 px-6 py-3 rounded">返回</button>
        <button v-if="gameType === 'versus' && isSelectingAwayTeam" 
          @click="confirmAwayTeam" 
          :disabled="currentLineup.length < 9"
          class="bg-blue-500 px-6 py-3 rounded disabled:opacity-50">
          確認客隊
        </button>
        <button v-else @click="startGame" 
          :disabled="currentLineup.length < 9"
          class="bg-green-500 px-6 py-3 rounded disabled:opacity-50">
          開始比賽
        </button>
      </div>
    </div>
    
    <!-- 比賽畫面 -->
    <div v-if="mode === 'game'" class="space-y-4">
      <div class="flex justify-between items-center">
        <h2 class="text-2xl">{{ inning }}局 {{ isTop ? '上' : '下' }} | {{ outs }}出局</h2>
        <div class="text-xl">客隊 {{ score.away }} : {{ score.home }} 主隊</div>
      </div>
      
      <!-- 記分板 -->
      <div class="bg-gray-800 p-4 rounded">
        <table class="w-full text-center">
          <thead>
            <tr>
              <th class="px-2">隊伍</th>
              <th v-for="i in 9" :key="i" class="px-2">{{ i }}</th>
              <th class="px-2 bg-yellow-500 text-black">R</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="gameType === 'versus'">
              <td class="px-2">客隊</td>
              <td v-for="i in 9" :key="i" class="px-2">{{ inningScores.away[i-1] ?? '-' }}</td>
              <td class="px-2 bg-yellow-500 text-black font-bold">{{ score.away }}</td>
            </tr>
            <tr v-if="gameType === 'versus'">
              <td class="px-2">主隊</td>
              <td v-for="i in 9" :key="i" class="px-2">{{ inningScores.home[i-1] ?? '-' }}</td>
              <td class="px-2 bg-yellow-500 text-black font-bold">{{ score.home }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <!-- 當前打者 -->
      <div class="bg-gray-800 p-6 rounded">
        <h3 class="text-2xl mb-4">當前打者</h3>
        <div v-if="currentPlayer">
          <div class="text-3xl font-bold">{{ currentPlayer.name }}</div>
          <div class="text-xl">#{{ currentPlayer.number }} {{ currentPlayer.team }}</div>
        </div>
      </div>
      
      <!-- 先發打序 -->
      <div class="bg-gray-800 p-4 rounded">
        <h3 class="text-xl mb-4">先發打序</h3>
        <div v-for="(player, index) in lineup" :key="index"
          :class="['p-2 mb-2 rounded', index === currentBatterIndex ? 'bg-yellow-500 text-black' : 'bg-gray-700']">
          {{ index + 1 }}. {{ player.name }} #{{ player.number }} {{ player.team }}
        </div>
      </div>
      
      <!-- 操作按鈕 -->
      <div class="grid grid-cols-4 gap-4">
        <button @click="handleHit(1)" class="bg-green-500 px-6 py-3 rounded">一壘安打</button>
        <button @click="handleHit(2)" class="bg-green-600 px-6 py-3 rounded">二壘安打</button>
        <button @click="handleHit(3)" class="bg-green-700 px-6 py-3 rounded">三壘安打</button>
        <button @click="handleHit(4)" class="bg-purple-500 px-6 py-3 rounded">全壘打</button>
        <button @click="handleWalk" class="bg-blue-500 px-6 py-3 rounded">保送</button>
        <button @click="handleHBP" class="bg-orange-500 px-6 py-3 rounded">觸身球</button>
        <button @click="handleOut" class="bg-red-500 px-6 py-3 rounded">出局</button>
        <button @click="handleStrikeout" class="bg-red-700 px-6 py-3 rounded">三振</button>
      </div>
      
      <button @click="mode = 'menu'" class="bg-gray-500 px-6 py-3 rounded mt-4">返回主選單</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useGameState } from './composables/useGameState'
import { usePlayerData } from './composables/usePlayerData'
import { useSpeech } from './composables/useSpeech'
import { useAudio } from './composables/useAudio'

// 解構 composables
const {
  mode,
  gameType,
  lineup,
  awayTeam,
  homeTeam,
  isSelectingAwayTeam,
  currentBatterIndex,
  score,
  inning,
  isTop,
  outs,
  runners,
  inningScores,
  currentPlayer,
  resetGameState,
  switchTeams
} = useGameState()

const { roster, loadCSVFromURL } = usePlayerData()
const speech = useSpeech()
const audio = useAudio()

// 計算當前正在編輯的陣容
const currentLineup = computed(() => {
  if (gameType.value === 'versus') {
    return isSelectingAwayTeam.value 
      ? awayTeam.value.lineup 
      : homeTeam.value.lineup
  }
  return lineup.value
})

// 選擇模式
const selectMode = (type) => {
  gameType.value = type
  mode.value = 'lineup'
  
  if (type === 'versus') {
    awayTeam.value = { lineup: [], pitcher: null, batterIndex: 0 }
    homeTeam.value = { lineup: [], pitcher: null, batterIndex: 0 }
    isSelectingAwayTeam.value = true
  }
}

// 添加到打序
const addToLineup = (player) => {
  if (gameType.value === 'versus') {
    const team = isSelectingAwayTeam.value ? awayTeam.value : homeTeam.value
    if (team.lineup.length < 9 && !team.lineup.includes(player)) {
      team.lineup.push(player)
    }
  } else {
    if (lineup.value.length < 9 && !lineup.value.includes(player)) {
      lineup.value.push(player)
    }
  }
}

// 確認客隊
const confirmAwayTeam = () => {
  if (awayTeam.value.lineup.length < 9) return
  isSelectingAwayTeam.value = false
}

// 開始比賽
const startGame = () => {
  console.log('=== 開始比賽 ===')
  
  if (gameType.value === 'versus') {
    if (awayTeam.value.lineup.length < 9 || homeTeam.value.lineup.length < 9) {
      alert('請選擇完整陣容')
      return
    }
    
    // 初始化索引
    awayTeam.value.batterIndex = 0
    homeTeam.value.batterIndex = 0
    
    // 設定客隊先攻
    console.log('設定客隊打線:', awayTeam.value.lineup.map(p => p.name))
    lineup.value = [...awayTeam.value.lineup]
    console.log('lineup 設定完成:', lineup.value.map(p => p.name))
  }
  
  mode.value = 'game'
  resetGameState()
}

// 下一棒
const nextBatter = () => {
  currentBatterIndex.value = (currentBatterIndex.value + 1) % lineup.value.length
}

// 處理安打
const handleHit = (bases) => {
  let runs = 0
  const newRunners = [...runners.value]
  
  if (bases === 4) {
    runs = 1 + newRunners.filter(r => r).length
    newRunners.fill(false)
  } else {
    for (let i = 2; i >= 0; i--) {
      if (newRunners[i]) {
        const newBase = i + bases
        if (newBase >= 3) runs++
        else newRunners[newBase] = true
        newRunners[i] = false
      }
    }
    newRunners[bases - 1] = true
  }
  
  runners.value = newRunners
  addScore(runs)
  nextBatter()
}

// 處理保送
const handleWalk = () => {
  const newRunners = [...runners.value]
  let runs = 0
  
  if (newRunners[0]) {
    if (newRunners[1]) {
      if (newRunners[2]) runs = 1
      newRunners[2] = true
    }
    newRunners[1] = true
  }
  newRunners[0] = true
  
  runners.value = newRunners
  addScore(runs)
  nextBatter()
}

// 處理觸身球
const handleHBP = () => {
  handleWalk()
}

// 處理三振
const handleStrikeout = () => {
  handleOut()
}

// 處理出局
const handleOut = () => {
  const newOuts = outs.value + 1
  
  if (newOuts >= 3) {
    console.log('=== 三出局 ===')
    
    if (gameType.value === 'versus') {
      console.log('對戰模式，當前 isTop:', isTop.value)
      
      // 切換隊伍
      switchTeams()
      
      // 檢查是否下半局結束
      if (!isTop.value) {
        // 剛切換到下半局，不用進入下一局
      } else {
        // 剛切換到上半局，代表上一局下半結束，進入下一局
        const wasTop = !isTop.value
        if (!wasTop) {
          inning.value++
          console.log('進入下一局:', inning.value)
          
          if (inning.value > 9) {
            alert(`比賽結束！最終比分 客隊 ${score.away} : ${score.home} 主隊`)
            mode.value = 'menu'
            return
          }
        }
      }
    } else {
      inning.value++
      if (inning.value > 9) {
        alert(`比賽結束！最終得分 ${score.home} 分`)
        mode.value = 'menu'
        return
      }
    }
    
    outs.value = 0
    runners.value = [false, false, false]
    
    console.log('出局後狀態:')
    console.log('- isTop:', isTop.value)
    console.log('- lineup:', lineup.value.map(p => p.name))
    console.log('- currentBatterIndex:', currentBatterIndex.value)
    console.log('- currentPlayer:', currentPlayer.value?.name)
  } else {
    outs.value = newOuts
    nextBatter()
  }
}

// 加分
const addScore = (runs) => {
  if (runs === 0) return
  
  if (gameType.value === 'versus') {
    if (isTop.value) {
      score.away += runs
    } else {
      score.home += runs
    }
  } else {
    score.home += runs
  }
}

// 初始化
onMounted(async () => {
  await loadCSVFromURL()
})
</script>
