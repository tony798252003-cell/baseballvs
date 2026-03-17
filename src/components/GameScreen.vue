<template>
  <div class="w-full h-full relative bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 flex flex-col lg:flex-row overflow-hidden">
    <!-- 左側：球場鑽石區（響應式） -->
    <div class="w-full lg:w-1/2 h-1/2 lg:h-full relative flex flex-col">
      <!-- 背景圖片（整個左半部） -->
      <div class="absolute inset-0 z-0">
        <img src="/baseball-field.jpg" alt="Baseball Field" class="w-full h-full object-cover" />
      </div>

      <!-- 頂部標題與控制（透明背景） -->
      <div class="relative z-30 bg-gradient-to-r from-blue-900/80 via-slate-800/80 to-red-900/80 backdrop-blur-sm px-2 lg:px-4 py-2 lg:py-3 border-b-4 border-yellow-500 shadow-xl">
        <div class="flex items-center justify-between gap-2">
          <h1 class="text-base lg:text-2xl font-black text-yellow-400 truncate" style="text-shadow: 2px 2px 4px rgba(0,0,0,0.5)">⚾ 棒球對決</h1>
          <div class="flex items-center gap-1 lg:gap-2 flex-shrink-0">
            <button @click="$emit('go-menu')" class="bg-red-600/90 hover:bg-red-500 text-white px-2 py-1 rounded-lg text-xs font-bold transition">
              🏠
            </button>
            <button @click="$emit('go-lineup')" class="bg-slate-700/80 hover:bg-slate-600 text-white px-2 py-1 rounded-lg text-xs font-bold transition">
              <SettingsIcon :size="12" class="inline" /><span class="hidden sm:inline ml-1">重選</span>
            </button>
            <button @click="$emit('toggle-pitch-count')" :class="[
              'text-white px-2 py-1 rounded-lg text-xs font-bold transition',
              showPitchCount ? 'bg-yellow-600/90 hover:bg-yellow-500' : 'bg-slate-700/80 hover:bg-slate-600'
            ]" :title="showPitchCount ? '隱藏球數' : '顯示球數'">
              📊
            </button>
            <div class="text-white font-bold text-xs hidden md:block">
              {{ gameType === 'single' ? '🎯 無限暢打' : '⚔️ 對戰模式' }}
            </div>
            <button @click="$emit('toggle-mute')" class="bg-slate-700/80 hover:bg-slate-600 text-white px-2 py-1 rounded-lg transition">
              <VolumeXIcon v-if="isMuted" :size="12" />
              <Volume2Icon v-else :size="12" />
            </button>
          </div>
        </div>
      </div>

      <!-- 記分板（覆蓋在球場圖片上） -->
      <div class="relative z-20 flex items-start justify-center pt-4 lg:pt-6">
        <div class="bg-slate-950/95 backdrop-blur-sm text-white px-4 lg:px-6 py-2 lg:py-3 rounded-xl lg:rounded-2xl shadow-2xl border-2 lg:border-4 border-yellow-500 max-w-3xl">
          <div class="flex items-center justify-between gap-4 lg:gap-6">
            <div class="text-center">
              <div class="text-xs text-slate-400 font-bold uppercase">客隊</div>
              <div class="text-3xl lg:text-5xl font-black font-mono text-yellow-400">{{ score.away }}</div>
            </div>
            <div class="text-center border-x-2 lg:border-x-4 border-slate-700 px-3 lg:px-6">
              <div class="text-xs text-slate-400 font-bold uppercase">局數</div>
              <div class="text-2xl lg:text-3xl font-black mb-1">
                {{ gameType === 'versus' ? (isTop ? '▲' : '▼') : '' }} {{ inning }}
              </div>
              <div class="flex justify-center gap-1 lg:gap-2 mb-1">
                <div v-for="i in 2" :key="i" :class="[
                  'w-4 h-4 lg:w-5 lg:h-5 rounded-full transition-all',
                  i - 1 < outs ? 'bg-red-500 shadow-lg shadow-red-500/50 scale-110 animate-pulse' : 'bg-slate-700'
                ]"></div>
              </div>
              <div class="text-xs text-red-400 font-bold">{{ outs }} OUT</div>
            </div>
            <div class="text-center">
              <div class="text-xs text-slate-400 font-bold uppercase">主隊</div>
              <div class="text-3xl lg:text-5xl font-black font-mono">{{ score.home }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 球場鑽石區域（覆蓋在圖片上） -->
      <BasesDisplay 
        :runners="runners"
        :runner-photos="runnerPhotos"
        :pitcher="selectedPitcher"
        :batter="currentPlayer"
      />
    </div>

    <!-- 右側：打者投手資訊 + 操作按鈕（響應式） -->
    <div class="w-full lg:w-1/2 h-1/2 lg:h-full flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <!-- 記分板 -->
      <div class="bg-gradient-to-r from-green-700 via-green-600 to-green-700 border-b-4 border-yellow-500 shadow-lg flex-shrink-0">
        <div class="px-2 py-3 overflow-x-auto">
          <ScoreBoard 
            :game-type="gameType"
            :inning="inning"
            :is-top="isTop"
            :score="score"
            :inning-scores="inningScores"
            :away-team="awayTeamName"
            :home-team="homeTeamName"
          />
        </div>
      </div>
      
      <!-- 打者資訊區（佔大部分空間，響應式） -->
      <div class="flex-[3] bg-gradient-to-br from-blue-400 via-cyan-500 to-blue-600 flex overflow-hidden relative min-h-0">
        
        <!-- 左侧：当前打者詳细信息 -->
        <div class="flex-1 p-2 sm:p-3 lg:p-4 flex items-center justify-center relative overflow-y-auto">
          <!-- 左上角：代打和換投按鈕 -->
          <div class="absolute top-1 left-1 sm:top-2 sm:left-2 lg:top-3 lg:left-3 flex gap-1 sm:gap-2 z-10">
            <button @click="$emit('show-batter-select')" class="bg-pink-500 hover:bg-pink-600 text-white px-1.5 py-1 sm:px-2 sm:py-1.5 lg:px-3 lg:py-2 rounded-lg font-bold text-xs transition transform hover:scale-105 shadow-lg">
              🔄<span class="hidden sm:inline ml-1">代打</span>
            </button>
            <button @click="$emit('show-pitcher-select')" class="bg-orange-600 hover:bg-orange-700 text-white px-1.5 py-1 sm:px-2 sm:py-1.5 lg:px-3 lg:py-2 rounded-lg font-bold text-xs transition transform hover:scale-105 shadow-lg">
              🔄<span class="hidden sm:inline ml-1">換投</span>
            </button>
          </div>
          
          <!-- 播放音樂按鈕（右上角） -->
          <div v-if="currentPlayer" class="absolute top-1 right-1 sm:top-2 sm:right-2 lg:top-4 lg:right-4 z-10">
            <button @click="$emit('play-batter-music', currentPlayer)" class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1.5 sm:px-3 sm:py-2 lg:px-4 lg:py-3 rounded-lg font-bold text-xs sm:text-sm transition transform hover:scale-105 shadow-lg">
              🎵 <span class="hidden sm:inline">播放</span>
            </button>
          </div>
          
          <PlayerCard 
            v-if="currentPlayer" 
            :player="currentPlayer"
            :results="batterResults && batterResults[`${currentPlayer.name}${currentPlayer.number}`]"
          >
            <template #default-icon>
              <UsersIcon :size="32" class="sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-16 lg:h-16" />
            </template>
          </PlayerCard>
        </div>
        
        <!-- 右侧：先发打序列表 -->
        <LineupList :lineup="lineup" :current-batter-index="currentBatterIndex" />
      </div>

      <!-- 投手資訊區（細條，響應式） -->
      <PitcherInfo 
        :pitcher="selectedPitcher"
        :stats="getPitcherStats && getPitcherStats(selectedPitcher)"
      />

      <!-- 操作按鈕區 -->
      <div class="flex-shrink-0 bg-slate-900 px-2 sm:px-3 lg:px-4 py-2 lg:py-3 space-y-2 flex flex-col justify-center">
        <!-- 球數計數器（可選） -->
        <div v-if="showPitchCount" class="bg-slate-950/90 backdrop-blur-sm p-3 rounded-xl flex items-center justify-between border-2 border-yellow-500 shadow-xl">
          <div class="flex gap-4">
            <div class="text-center">
              <div class="text-xs text-slate-400 font-bold mb-1">BALL</div>
              <div class="text-3xl font-black text-green-400">{{ balls }}</div>
            </div>
            <div class="text-center">
              <div class="text-xs text-slate-400 font-bold mb-1">STRIKE</div>
              <div class="text-3xl font-black text-yellow-400">{{ strikes }}</div>
            </div>
          </div>
          <div class="flex gap-2">
            <button @click="$emit('add-ball')" class="px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-bold text-xs transition transform hover:scale-105 text-white">
              壞球
            </button>
            <button @click="$emit('add-strike')" class="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-bold text-xs transition transform hover:scale-105 text-white">
              好球
            </button>
            <button @click="$emit('reset-count')" class="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition text-white">
              <RotateCcwIcon :size="14" />
            </button>
          </div>
        </div>

        <!-- 主要操作按鈕 -->
        <GameControls 
          @hit="$emit('hit', $event)"
          @walk="$emit('walk')"
          @hbp="$emit('hbp')"
          @out="$emit('out')"
          @strikeout="$emit('strikeout')"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import ScoreBoard from './ScoreBoard.vue';
import PlayerCard from './PlayerCard.vue';
import GameControls from './GameControls.vue';
import LineupList from './LineupList.vue';
import PitcherInfo from './PitcherInfo.vue';
import BasesDisplay from './BasesDisplay.vue';
import { SettingsIcon, Volume2Icon, VolumeXIcon, RotateCcwIcon, UsersIcon } from './Icons.vue';

defineProps({
  gameType: String,
  inning: Number,
  isTop: Boolean,
  score: Object,
  outs: Number,
  runners: Object,
  runnerPhotos: Object,
  selectedPitcher: Object,
  currentPlayer: Object,
  inningScores: Object,
  awayTeamName: String,
  homeTeamName: String,
  lineup: Array,
  currentBatterIndex: Number,
  showPitchCount: Boolean,
  balls: Number,
  strikes: Number,
  isMuted: Boolean,
  getPitcherStats: Function,
  batterResults: Object
});

defineEmits([
  'go-menu',
  'go-lineup',
  'toggle-pitch-count',
  'toggle-mute',
  'show-batter-select',
  'show-pitcher-select',
  'play-batter-music',
  'add-ball',
  'add-strike',
  'reset-count',
  'hit',
  'walk',
  'hbp',
  'out',
  'strikeout'
]);
</script>
