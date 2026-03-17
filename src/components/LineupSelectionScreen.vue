<template>
  <div class="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex">
    <!-- 左側：球隊選擇與球員列表 -->
    <div class="w-2/3 h-full flex flex-col p-6 overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-4xl font-black text-white">
            {{ gameType === 'single' ? '選擇打者' : (isSelectingAwayTeam ? '客隊打序' : '主隊打序') }}
          </h2>
          <p v-if="gameType === 'versus'" class="text-sm text-slate-400 font-bold mt-1">
            {{ isSelectingAwayTeam ? '先選擇客隊（上半局進攻）9位打者及投手' : '選擇主隊（下半局進攻）9位打者及投手' }}
          </p>
        </div>
        <button @click="$emit('back')" class="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition-all duration-150 cursor-pointer min-h-11">
          ← 返回
        </button>
      </div>

      <!-- 一軍/二軍切換 -->
      <div class="flex gap-2 mb-3">
        <button v-for="l in ['一軍', '二軍', 'all']" :key="l"
          @click="$emit('update:selected-league', l)"
          :class="[
            'px-4 py-1.5 rounded-full font-bold text-sm transition-all duration-150 border cursor-pointer min-h-11',
            selectedLeague === l ? 'bg-blue-500 text-white border-blue-500' : 'bg-white/10 text-slate-300 border-white/20 hover:bg-white/20'
          ]">
          {{ l === 'all' ? '全部' : l }}
        </button>
      </div>

      <!-- 球隊與守位篩選 -->
      <div class="flex gap-2 mb-4 flex-wrap">
        <button @click="$emit('update:selectedTeam', null)" :class="[
          'px-4 py-2 rounded-2xl font-bold transition-all duration-150 border shadow-md cursor-pointer min-h-11',
          selectedTeam === null ? 'bg-blue-500 text-white border-blue-500 scale-105' : 'bg-white/10 text-slate-300 border-white/20 hover:bg-white/20'
        ]">
          全部 ({{ batters.length }})
        </button>
        <!-- 中職六隊 -->
        <button v-for="team in cpblTeamsWithBatters" :key="team" @click="$emit('update:selectedTeam', team)" :class="[
          'px-3 py-3 rounded-2xl font-bold transition-all duration-150 border shadow-md flex flex-col items-center gap-1 cursor-pointer',
          selectedTeam === team ? 'bg-blue-500/30 text-white border-amber-400 scale-105' : 'bg-white/10 text-slate-300 border-white/20 hover:bg-white/20'
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
            'px-3 py-3 rounded-2xl font-bold transition-all duration-150 border shadow-md flex flex-col items-center gap-1 cursor-pointer',
            isOtherTeamSelected ? 'bg-blue-500/30 text-white border-amber-400 scale-105' : 'bg-white/10 text-slate-300 border-white/20 hover:bg-white/20'
          ]">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/>
          </svg>
          <div class="text-center">
            <div class="text-xs font-bold">其他球隊</div>
            <div class="text-xs opacity-75">{{ showOtherTeams ? '▲ 收折' : '▼ 展開' }}</div>
          </div>
        </button>
        <!-- 展開後的其他球隊 -->
        <template v-if="showOtherTeams">
          <button v-for="team in otherTeamsWithBatters" :key="team" @click="$emit('update:selectedTeam', team)" :class="[
            'px-3 py-2 rounded-2xl font-bold transition-all duration-150 border shadow-md flex flex-col items-center gap-0.5 cursor-pointer',
            selectedTeam === team ? 'bg-blue-500/30 text-white border-amber-400 scale-105' : 'bg-white/10 text-slate-300 border-white/20 hover:bg-white/20'
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
          class="bg-slate-800/80 hover:bg-slate-700/80 disabled:bg-slate-800/40 disabled:opacity-40 p-2 rounded-lg transition-all duration-150 transform hover:scale-105 text-left border border-white/10 hover:border-blue-400/50 disabled:border-white/5 shadow-md cursor-pointer disabled:cursor-not-allowed">
          <div class="flex items-start gap-2">
            <img v-if="player.photo" :src="player.photo" class="w-12 h-12 rounded-full object-cover border-2 border-blue-400/60 shadow-md flex-shrink-0" />
            <div v-else class="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-xl flex-shrink-0">⚾</div>
            <div class="flex-1 min-w-0 flex flex-col justify-between">
              <div class="flex items-center gap-1 mb-1">
                <span :class="[
                  'text-white font-black leading-tight',
                  player.name.length > 6 ? 'text-sm' : player.name.length > 4 ? 'text-base' : 'text-lg'
                ]" :style="player.name.length > 6 ? 'word-wrap: break-word; overflow-wrap: break-word;' : ''">{{ player.name }}</span>
                <span v-if="player.song" class="text-xs text-amber-400">♪</span>
              </div>
              <div class="text-xs text-slate-400 font-bold">#{{ player.number }} · {{ player.mainPosition }}</div>
            </div>
          </div>
        </button>
      </div>
    </div>

    <!-- 右側：已選打序 -->
    <div class="w-1/3 h-full bg-white/5 backdrop-blur-md p-4 border-l border-amber-400/30 flex flex-col shadow-xl overflow-hidden relative">
      <h3 class="text-xl font-black text-white mb-2">
        {{ gameType === 'single' ? '打者' : (isSelectingAwayTeam ? '客隊' : '主隊') }} ({{ currentLineup.length }}/9)
      </h3>

      <!-- 9個棒次固定顯示，不捲動 - 為投手區域預留空間 -->
      <div class="flex flex-col justify-between" style="height: calc(100% - 280px); min-height: 300px; overflow-y: auto;">
        <!-- 已選擇的打者 -->
        <div v-for="(player, index) in currentLineup" :key="index"
          @click="$emit('replace-player', index)"
          :class="[
            'bg-slate-700 p-1.5 rounded-lg flex items-center gap-2 shadow-md cursor-pointer hover:bg-slate-600 transition-colors duration-150',
            replacingIndex === index ? 'border-2 border-amber-400 animate-pulse' : 'border border-white/10'
          ]">
          <div class="text-xl font-black text-blue-400 w-7">{{ index + 1 }}</div>
          <img v-if="player.photo" :src="player.photo" class="w-9 h-9 rounded-full object-cover border-2 border-amber-400/60" />
          <div v-else class="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center text-base">⚾</div>
          <div class="flex-1 min-w-0">
            <div :class="[
              'text-white font-black leading-tight',
              player.name.length > 5 ? 'text-xs break-words' : 'text-sm',
              player.name.length <= 5 ? 'truncate' : ''
            ]">{{ player.name }}</div>
            <div class="text-xs text-slate-400 font-bold truncate">#{{ player.number }}</div>
          </div>
        </div>

        <!-- 未選擇的棒次 -->
        <div v-for="i in (9 - currentLineup.length)" :key="'empty-' + i"
          :class="[
            'p-1.5 rounded-lg flex items-center gap-2 transition-all duration-150',
            i === 1 ? 'bg-amber-400/10 border-2 border-amber-400 animate-pulse shadow-lg' : 'border border-dashed border-slate-600'
          ]">
          <div :class="[
            'text-xl font-black w-7',
            i === 1 ? 'text-amber-400' : 'text-slate-600'
          ]">{{ currentLineup.length + i }}</div>
          <div :class="[
            'italic font-bold text-xs',
            i === 1 ? 'text-amber-400' : 'text-slate-600'
          ]">{{ i === 1 ? '← 選第' + (currentLineup.length + 1) + '棒' : '未選擇' }}</div>
        </div>
      </div>

      <!-- 投手選擇和按鈕區域 - 固定在底部 -->
      <div class="absolute bottom-4 left-4 right-4 bg-slate-900/90 pt-3 pb-1 rounded-xl px-3">
      <!-- 投手選擇 -->
      <div class="mb-2 flex-shrink-0">
        <h3 class="text-base font-black text-amber-400 mb-1.5">{{ gameType === 'versus' && !isSelectingAwayTeam ? '主隊投手' : '對戰投手' }}</h3>
        <div v-if="currentPitcher" @click="$emit('select-pitcher')" class="bg-slate-700 p-2 rounded-lg flex items-center gap-2 border border-amber-500/40 shadow-md cursor-pointer hover:bg-slate-600 transition-colors duration-150">
          <img v-if="currentPitcher.photo" :src="currentPitcher.photo" class="w-9 h-9 rounded-full object-cover border-2 border-amber-400/60" />
          <div v-else class="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center text-base">⚾</div>
          <div class="flex-1 min-w-0">
            <div class="text-white font-black text-sm truncate">{{ currentPitcher.name }}</div>
            <div class="text-xs text-amber-400 font-bold">#{{ currentPitcher.number }}</div>
          </div>
          <button @click.stop="$emit('clear-pitcher')" class="text-red-400 hover:text-red-300 hover:bg-red-500/20 p-1 rounded-full flex-shrink-0 cursor-pointer">
            <XCircleIcon :size="16" />
          </button>
        </div>
        <button v-else @click="$emit('select-pitcher')"
          :disabled="currentLineup.length < 9"
          :class="[
            'w-full py-2.5 rounded-lg font-black text-sm transition-all duration-150 shadow-lg border cursor-pointer min-h-11',
            currentLineup.length < 9 ? 'bg-slate-700 text-slate-500 cursor-not-allowed border-slate-600' : 'bg-amber-500 hover:bg-amber-400 text-white animate-pulse border-amber-400'
          ]">
          {{ currentLineup.length < 9 ? `選擇打者 (${currentLineup.length}/9)` : '選擇投手' }}
        </button>
      </div>

      <button @click="$emit('random-select')" v-if="currentLineup.length === 0"
        class="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-xl font-bold text-sm mb-1.5 transition-all duration-150 shadow-lg cursor-pointer min-h-11 flex-shrink-0">
        隨機選擇
      </button>
      <button @click="$emit('clear-lineup')" v-if="currentLineup.length > 0"
        class="w-full bg-red-500/80 hover:bg-red-500 text-white py-1.5 rounded-xl font-bold text-xs mb-1.5 transition-all duration-150 shadow-lg cursor-pointer flex-shrink-0">
        清空打序
      </button>

      <!-- 對戰模式的確認按鈕 -->
      <div v-if="gameType === 'versus'" class="flex-shrink-0">
        <button v-if="isSelectingAwayTeam" @click="$emit('confirm-away')"
          :disabled="currentLineup.length < 9 || !currentPitcher"
          class="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:bg-slate-700 disabled:opacity-50 text-white py-3 rounded-xl font-black text-base transition-all duration-150 transform hover:scale-105 disabled:scale-100 flex items-center justify-center gap-2 shadow-xl border border-white/10 cursor-pointer disabled:cursor-not-allowed min-h-11 mb-1.5">
          <PlayIcon :fill="true" />
          {{ currentLineup.length < 9 ? `選擇打者 (${currentLineup.length}/9)` : (!currentPitcher ? '選擇投手' : '確認客隊 →') }}
        </button>
        <button v-else @click="$emit('start-game')"
          :disabled="currentLineup.length < 9 || !currentPitcher"
          class="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 disabled:bg-slate-700 disabled:opacity-50 text-white py-3 rounded-xl font-black text-base transition-all duration-150 transform hover:scale-105 disabled:scale-100 flex items-center justify-center gap-2 shadow-xl border border-white/10 cursor-pointer disabled:cursor-not-allowed min-h-11">
          <PlayIcon :fill="true" />
          {{ currentLineup.length < 9 ? `選擇打者 (${currentLineup.length}/9)` : (!currentPitcher ? '選擇投手' : '開始比賽！') }}
        </button>
        <button v-if="!isSelectingAwayTeam" @click="$emit('back-to-away')"
          class="w-full bg-slate-600 hover:bg-slate-500 text-white py-2 rounded-xl font-bold text-xs transition-all duration-150 shadow-lg cursor-pointer mt-1.5 min-h-11">
          ← 返回客隊設定
        </button>
      </div>

      <!-- 單人模式的開始按鈕 -->
      <button v-else @click="$emit('start-game')"
        :disabled="currentLineup.length < 9 || !currentPitcher"
        class="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 disabled:bg-slate-700 disabled:opacity-50 text-white py-3 rounded-xl font-black text-base transition-all duration-150 transform hover:scale-105 disabled:scale-100 flex items-center justify-center gap-2 shadow-xl border border-white/10 cursor-pointer disabled:cursor-not-allowed min-h-11 flex-shrink-0">
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
