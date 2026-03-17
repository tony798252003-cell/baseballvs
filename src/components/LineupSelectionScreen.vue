<template>
  <div class="w-full h-full bg-gradient-to-br from-purple-200 via-pink-100 to-yellow-100 flex">
    <!-- 左側：球隊選擇與球員列表 -->
    <div class="w-2/3 h-full flex flex-col p-6 overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-4xl font-black text-purple-600" style="text-shadow: 2px 2px 0px #fff">
            {{ gameType === 'single' ? '⚡ 選擇打者' : (isSelectingAwayTeam ? '🏃 客隊打序' : '🏠 主隊打序') }}
          </h2>
          <p v-if="gameType === 'versus'" class="text-sm text-purple-700 font-bold mt-1">
            {{ isSelectingAwayTeam ? '先選擇客隊（上半局進攻）9位打者及投手' : '選擇主隊（下半局進攻）9位打者及投手' }}
          </p>
        </div>
        <button @click="$emit('back')" class="bg-red-400 hover:bg-red-500 text-white px-6 py-3 rounded-2xl font-bold shadow-lg border-2 border-white">
          ← 返回
        </button>
      </div>

      <!-- 一軍/二軍切換 -->
      <div class="flex gap-2 mb-3">
        <button v-for="l in ['一軍', '二軍', 'all']" :key="l"
          @click="$emit('update:selected-league', l)"
          :class="[
            'px-4 py-1.5 rounded-full font-bold text-sm transition border-2',
            selectedLeague === l ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-blue-600 border-blue-300 hover:bg-blue-50'
          ]">
          {{ l === 'all' ? '全部' : l }}
        </button>
      </div>

      <!-- 球隊與守位篩選 -->
      <div class="flex gap-2 mb-4 flex-wrap">
        <button @click="$emit('update:selectedTeam', null)" :class="[
          'px-4 py-2 rounded-2xl font-bold transition-all border-2 border-white shadow-md',
          selectedTeam === null ? 'bg-blue-400 text-white scale-105' : 'bg-white text-blue-600 hover:bg-blue-50'
        ]">
          全部 ({{ batters.length }})
        </button>
        <!-- 中職六隊 -->
        <button v-for="team in cpblTeamsWithBatters" :key="team" @click="$emit('update:selectedTeam', team)" :class="[
          'px-3 py-3 rounded-2xl font-bold transition-all border-2 border-white shadow-md flex flex-col items-center gap-1',
          selectedTeam === team ? 'bg-blue-400 text-white scale-105' : 'bg-white text-blue-600 hover:bg-blue-50'
        ]">
          <img v-if="teamLogos[team]" :src="teamLogos[team]" class="w-16 h-16 object-contain" :alt="team" />
          <span class="text-2xl" v-else>⚾</span>
          <div class="text-center">
            <div class="text-xs font-bold">{{ team }}</div>
            <div class="text-xs opacity-75">({{ getTeamBatterCount(team) }})</div>
          </div>
        </button>
        <!-- 其他球隊折疊按鈕 -->
        <button v-if="otherTeamsWithBatters.length > 0"
          @click="showOtherTeams = !showOtherTeams"
          :class="[
            'px-3 py-3 rounded-2xl font-bold transition-all border-2 border-white shadow-md flex flex-col items-center gap-1',
            isOtherTeamSelected ? 'bg-blue-400 text-white scale-105' : 'bg-white text-blue-600 hover:bg-blue-50'
          ]">
          <span class="text-2xl">🌍</span>
          <div class="text-center">
            <div class="text-xs font-bold">其他球隊</div>
            <div class="text-xs opacity-75">{{ showOtherTeams ? '▲ 收折' : '▼ 展開' }}</div>
          </div>
        </button>
        <!-- 展開後的其他球隊 -->
        <template v-if="showOtherTeams">
          <button v-for="team in otherTeamsWithBatters" :key="team" @click="$emit('update:selectedTeam', team)" :class="[
            'px-3 py-2 rounded-2xl font-bold transition-all border-2 shadow-md flex flex-col items-center gap-0.5',
            selectedTeam === team ? 'bg-blue-400 text-white border-blue-400 scale-105' : 'bg-white/80 text-blue-600 border-blue-200 hover:bg-blue-50'
          ]">
            <span class="text-lg">⚾</span>
            <div class="text-center">
              <div class="text-xs font-bold leading-tight" style="max-width:72px; word-break:break-all">{{ team }}</div>
              <div class="text-xs opacity-75">({{ getTeamBatterCount(team) }})</div>
            </div>
          </button>
        </template>
      </div>

      <!-- 球員列表 -->
      <div class="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 content-start">
        <button v-for="player in filteredBatters" :key="player.name + player.number"
          @click="$emit('add-player', player)"
          :disabled="currentLineup.includes(player)"
          class="bg-white hover:bg-yellow-50 disabled:bg-gray-100 disabled:opacity-40 p-2 rounded-lg transition-all transform hover:scale-105 text-left border-2 border-blue-300 hover:border-blue-500 disabled:border-gray-300 shadow-md">
          <div class="flex items-start gap-2">
            <img v-if="player.photo" :src="player.photo" class="w-12 h-12 rounded-full object-cover border-2 border-blue-400 shadow-md flex-shrink-0" />
            <div v-else class="w-12 h-12 rounded-full bg-blue-200 flex items-center justify-center text-xl flex-shrink-0">⚾</div>
            <div class="flex-1 min-w-0 flex flex-col justify-between">
              <div :class="[
                'text-gray-800 font-black leading-tight mb-1',
                player.name.length > 6 ? 'text-sm' : player.name.length > 4 ? 'text-base' : 'text-lg'
              ]" :style="player.name.length > 6 ? 'word-wrap: break-word; overflow-wrap: break-word;' : ''">{{ player.name }}</div>
              <div class="text-xs text-blue-600 font-bold">#{{ player.number }} · {{ player.mainPosition }}</div>
            </div>
          </div>
        </button>
      </div>
    </div>

    <!-- 右側：已選打序 -->
    <div class="w-1/3 h-full bg-gradient-to-br from-blue-200 to-purple-200 p-4 border-l-4 border-yellow-400 flex flex-col shadow-xl overflow-hidden relative">
      <h3 class="text-xl font-black text-blue-600 mb-2" style="text-shadow: 2px 2px 0px #fff">
        {{ gameType === 'single' ? '⚡ 打者' : (isSelectingAwayTeam ? '🏃 客隊' : '🏠 主隊') }} ({{ currentLineup.length }}/9)
      </h3>
      
      <!-- 9個棒次固定顯示，不捲動 - 為投手區域預留空間 -->
      <div class="flex flex-col justify-between" style="height: calc(100% - 280px); min-height: 300px; overflow-y: auto;">
        <!-- 已選擇的打者 -->
        <div v-for="(player, index) in currentLineup" :key="index"
          @click="$emit('replace-player', index)"
          :class="[
            'bg-white p-1.5 rounded-lg flex items-center gap-2 shadow-md cursor-pointer hover:bg-blue-50 transition-colors',
            replacingIndex === index ? 'border-3 border-yellow-400 animate-pulse' : 'border-2 border-blue-300'
          ]">
          <div class="text-xl font-black text-blue-500 w-7">{{ index + 1 }}</div>
          <img v-if="player.photo" :src="player.photo" class="w-9 h-9 rounded-full object-cover border-2 border-yellow-400" />
          <div v-else class="w-9 h-9 rounded-full bg-blue-200 flex items-center justify-center text-base">⚾</div>
          <div class="flex-1 min-w-0">
            <div :class="[
              'text-gray-800 font-black leading-tight',
              player.name.length > 5 ? 'text-xs break-words' : 'text-sm',
              player.name.length <= 5 ? 'truncate' : ''
            ]">{{ player.name }}</div>
            <div class="text-xs text-blue-600 font-bold truncate">#{{ player.number }}</div>
          </div>
        </div>
        
        <!-- 未選擇的棒次 -->
        <div v-for="i in (9 - currentLineup.length)" :key="'empty-' + i"
          :class="[
            'p-1.5 rounded-lg flex items-center gap-2 transition-all',
            i === 1 ? 'bg-yellow-100 border-3 border-yellow-400 animate-pulse shadow-lg' : 'bg-white/50 border-2 border-dashed border-blue-300'
          ]">
          <div :class="[
            'text-xl font-black w-7',
            i === 1 ? 'text-yellow-600' : 'text-gray-300'
          ]">{{ currentLineup.length + i }}</div>
          <div :class="[
            'italic font-bold text-xs',
            i === 1 ? 'text-yellow-600' : 'text-gray-400'
          ]">{{ i === 1 ? '👈 選第' + (currentLineup.length + 1) + '棒' : '未選擇' }}</div>
        </div>
      </div>

      <!-- 投手選擇和按鈕區域 - 固定在底部 -->
      <div class="absolute bottom-4 left-4 right-4 bg-gradient-to-br from-blue-200 to-purple-200 pt-3 pb-1">
      <!-- 投手選擇 -->
      <div class="mb-2 flex-shrink-0">
        <h3 class="text-base font-black text-orange-600 mb-1.5" style="text-shadow: 1px 1px 0px #fff">🔥 {{ gameType === 'versus' && !isSelectingAwayTeam ? '主隊投手' : '對戰投手' }}</h3>
        <div v-if="currentPitcher" @click="$emit('select-pitcher')" class="bg-white p-2 rounded-lg flex items-center gap-2 border-2 border-orange-300 shadow-md cursor-pointer hover:bg-orange-50 transition-colors">
          <img v-if="currentPitcher.photo" :src="currentPitcher.photo" class="w-9 h-9 rounded-full object-cover border-2 border-orange-400" />
          <div v-else class="w-9 h-9 rounded-full bg-orange-200 flex items-center justify-center text-base">🔥</div>
          <div class="flex-1 min-w-0">
            <div class="text-gray-800 font-black text-sm truncate">{{ currentPitcher.name }}</div>
            <div class="text-xs text-orange-600 font-bold">#{{ currentPitcher.number }}</div>
          </div>
          <button @click.stop="$emit('clear-pitcher')" class="text-red-500 hover:text-red-600 hover:bg-red-100 p-1 rounded-full flex-shrink-0">
            <XCircleIcon :size="16" />
          </button>
        </div>
        <button v-else @click="$emit('select-pitcher')" 
          :disabled="currentLineup.length < 9"
          :class="[
            'w-full py-2.5 rounded-lg font-black text-sm transition shadow-lg border-2 border-white',
            currentLineup.length < 9 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-orange-400 hover:bg-orange-500 text-white animate-pulse'
          ]">
          {{ currentLineup.length < 9 ? `選擇打者 (${currentLineup.length}/9)` : '選擇投手 🔥' }}
        </button>
      </div>

      <button @click="$emit('random-select')" v-if="currentLineup.length === 0"
        class="w-full bg-purple-500 hover:bg-purple-600 text-white py-2 rounded-lg font-bold text-sm mb-1.5 transition shadow-lg border-2 border-white flex-shrink-0">
        🎲 隨機選擇
      </button>
      <button @click="$emit('clear-lineup')" v-if="currentLineup.length > 0"
        class="w-full bg-red-400 hover:bg-red-500 text-white py-1.5 rounded-lg font-bold text-xs mb-1.5 transition shadow-lg border-2 border-white flex-shrink-0">
        🗑️ 清空打序
      </button>
      
      <!-- 對戰模式的確認按鈕 -->
      <div v-if="gameType === 'versus'" class="flex-shrink-0">
        <button v-if="isSelectingAwayTeam" @click="$emit('confirm-away')" 
          :disabled="currentLineup.length < 9 || !currentPitcher"
          class="w-full bg-gradient-to-r from-blue-400 to-cyan-500 hover:from-blue-500 hover:to-cyan-600 disabled:bg-gray-300 disabled:opacity-50 text-white py-3 rounded-lg font-black text-base transition-all transform hover:scale-105 disabled:scale-100 flex items-center justify-center gap-2 shadow-xl border-2 border-white mb-1.5">
          <PlayIcon :fill="true" />
          {{ currentLineup.length < 9 ? `選擇打者 (${currentLineup.length}/9)` : (!currentPitcher ? '選擇投手' : '確認客隊 →') }}
        </button>
        <button v-else @click="$emit('start-game')" 
          :disabled="currentLineup.length < 9 || !currentPitcher"
          class="w-full bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600 disabled:bg-gray-300 disabled:opacity-50 text-white py-3 rounded-lg font-black text-base transition-all transform hover:scale-105 disabled:scale-100 flex items-center justify-center gap-2 shadow-xl border-2 border-white">
          <PlayIcon :fill="true" />
          {{ currentLineup.length < 9 ? `選擇打者 (${currentLineup.length}/9)` : (!currentPitcher ? '選擇投手' : '開始比賽！') }}
        </button>
        <button v-if="!isSelectingAwayTeam" @click="$emit('back-to-away')"
          class="w-full bg-gray-400 hover:bg-gray-500 text-white py-2 rounded-lg font-bold text-xs transition shadow-lg border-2 border-white mt-1.5">
          ← 返回客隊設定
        </button>
      </div>
      
      <!-- 單人模式的開始按鈕 -->
      <button v-else @click="$emit('start-game')" 
        :disabled="currentLineup.length < 9 || !currentPitcher"
        class="w-full bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600 disabled:bg-gray-300 disabled:opacity-50 text-white py-3 rounded-lg font-black text-base transition-all transform hover:scale-105 disabled:scale-100 flex items-center justify-center gap-2 shadow-xl border-2 border-white flex-shrink-0">
        <PlayIcon :fill="true" />
        {{ currentLineup.length < 9 ? `選擇打者 (${currentLineup.length}/9)` : (!currentPitcher ? '選擇投手' : '開始比賽！') }}
      </button>
      </div>
      <!-- 結束投手和按鈕區域的 absolute div -->
    </div>
    <!-- 結束右側已選打序容器 -->
  </div>
  <!-- 結束主容器 -->
</template>

<script setup>
import { computed, ref } from 'vue';
import { XCircleIcon, PlayIcon } from './Icons.vue';

const CPBL_TEAMS = ['樂天桃猿', '統一獅', '富邦悍將', '味全龍', '台鋼雄鷹', '中信兄弟'];

const props = defineProps({
  gameType: String,
  batters: Array,
  selectedTeam: String,
  teamLogos: Object,
  teamsWithBatters: Array,
  filteredBatters: Array,
  currentLineup: Array,
  currentPitcher: Object,
  replacingIndex: Number,
  selectedLeague: String,
  isSelectingAwayTeam: Boolean
});

defineEmits([
  'back',
  'update:selectedTeam',
  'add-player',
  'replace-player',
  'remove-player',
  'select-pitcher',
  'clear-pitcher',
  'random-select',
  'clear-lineup',
  'confirm-away',
  'start-game',
  'back-to-away',
  'update:selected-league'
]);

const showOtherTeams = ref(false);

const cpblTeamsWithBatters = computed(() =>
  props.teamsWithBatters.filter(t => CPBL_TEAMS.includes(t))
);

const otherTeamsWithBatters = computed(() =>
  props.teamsWithBatters.filter(t => !CPBL_TEAMS.includes(t))
);

const isOtherTeamSelected = computed(() =>
  props.selectedTeam !== null && !CPBL_TEAMS.includes(props.selectedTeam)
);

function getTeamBatterCount(team) {
  return props.batters.filter(p => p.team === team).length;
}
</script>
