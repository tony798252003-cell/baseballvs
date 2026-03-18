<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
    <div class="bg-white border border-slate-100 rounded-3xl p-8 max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-4xl font-black text-slate-900">{{ title }}</h2>
        <button @click="$emit('close')" class="text-red-500 hover:text-red-600 hover:bg-red-50 p-3 rounded-full transition-all duration-150 cursor-pointer">
          <XCircleIcon :size="32" />
        </button>
      </div>

      <!-- 一軍/二軍切換 -->
      <div class="flex gap-2 mb-3">
        <button v-for="l in ['一軍', '二軍', 'coach', 'all']" :key="l"
          @click="$emit('update:selectedLeague', l)"
          :class="[
            'px-4 py-1.5 rounded-full font-bold text-sm transition-all duration-150 border cursor-pointer min-h-11',
            selectedLeague === l ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-amber-50 hover:border-amber-300'
          ]">
          {{ l === 'all' ? '全部' : l === 'coach' ? '教練' : l }}
        </button>
      </div>

      <!-- 球隊篩選 -->
      <div class="flex gap-2 mb-4 flex-wrap">
        <button @click="$emit('update:selectedTeam', null)" :class="[
          'px-4 py-2 rounded-2xl font-bold transition-all duration-150 border shadow-md cursor-pointer min-h-11',
          selectedTeam === null ? 'bg-amber-500 text-white border-amber-500 scale-105' : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50 hover:border-amber-300'
        ]">
          全部 ({{ pitchers.length }})
        </button>
        <!-- 中職六隊 -->
        <button v-for="team in cpblTeamsWithPitchers" :key="team" @click="$emit('update:selectedTeam', team)" :class="[
          'px-3 py-3 rounded-2xl font-bold transition-all duration-150 border shadow-md flex flex-col items-center gap-1 cursor-pointer',
          selectedTeam === team ? 'ring-2 ring-amber-400 bg-amber-50 border-amber-300 scale-105' : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50 hover:border-amber-300'
        ]">
          <img v-if="teamLogos[team]" :src="teamLogos[team]" class="w-16 h-16 object-contain" :alt="team" />
          <span class="text-2xl" v-else>⚾</span>
          <div class="text-center">
            <div class="text-xs font-bold">{{ team }}</div>
            <div class="text-xs opacity-75">({{ getTeamPitcherCount(team) }})</div>
          </div>
        </button>
        <!-- 其他球隊折疊按鈕 -->
        <button v-if="otherTeamsWithPitchers.length > 0"
          @click="showOtherTeams = !showOtherTeams"
          :class="[
            'px-3 py-3 rounded-2xl font-bold transition-all duration-150 border shadow-md flex flex-col items-center gap-1 cursor-pointer',
            isOtherTeamSelected ? 'ring-2 ring-amber-400 bg-amber-50 border-amber-300 scale-105' : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50 hover:border-amber-300'
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
          <button v-for="team in otherTeamsWithPitchers" :key="team" @click="$emit('update:selectedTeam', team)" :class="[
            'px-3 py-2 rounded-2xl font-bold transition-all duration-150 border shadow-md flex flex-col items-center gap-0.5 cursor-pointer',
            selectedTeam === team ? 'ring-2 ring-amber-400 bg-amber-50 border-amber-300 scale-105' : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50 hover:border-amber-300'
          ]">
            <span class="text-lg">⚾</span>
            <div class="text-center">
              <div class="text-xs font-bold leading-tight" style="max-width:72px; word-break:break-all">{{ team }}</div>
              <div class="text-xs opacity-75">({{ getTeamPitcherCount(team) }})</div>
            </div>
          </button>
        </template>
      </div>

      <!-- 投手列表 -->
      <div class="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
        <button v-for="pitcher in filteredPitchers" :key="pitcher.name + pitcher.number"
          @click="$emit('select', pitcher)"
          :disabled="playedPitchers.has(pitcher.name + pitcher.number)"
          class="bg-white hover:shadow-md disabled:bg-slate-50 disabled:opacity-50 p-2 rounded-lg transition-all duration-150 transform hover:scale-105 disabled:scale-100 text-left border border-amber-100 hover:border-amber-400 disabled:border-slate-100 shadow-sm cursor-pointer disabled:cursor-not-allowed">
          <div class="flex items-start gap-2">
            <img v-if="pitcher.photo" :src="pitcher.photo" class="w-12 h-12 rounded-full object-cover border-2 border-amber-300 shadow-md flex-shrink-0" />
            <div v-else class="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-xl flex-shrink-0">⚾</div>
            <div class="flex-1 min-w-0 flex flex-col justify-between">
              <div class="flex items-center gap-1 mb-1">
                <span :class="[
                  'text-slate-900 font-black leading-tight',
                  pitcher.name.length > 6 ? 'text-sm' : pitcher.name.length > 4 ? 'text-base' : 'text-lg'
                ]" :style="pitcher.name.length > 6 ? 'word-wrap: break-word; overflow-wrap: break-word;' : ''">{{ pitcher.name }}</span>
                <span v-if="pitcher.song" class="text-xs text-amber-500">♪</span>
              </div>
              <div class="text-xs text-amber-600 font-bold">#{{ pitcher.number }} · {{ pitcher.mainPosition }}</div>
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { XCircleIcon } from './Icons.vue';

const CPBL_TEAMS = ['樂天桃猿', '統一獅', '富邦悍將', '味全龍', '台鋼雄鷹', '中信兄弟'];

const props = defineProps({
  show: Boolean,
  title: {
    type: String,
    default: '選擇對戰投手'
  },
  pitchers: Array,
  filteredPitchers: Array,
  teamsWithPitchers: Array,
  teamLogos: Object,
  selectedTeam: null,
  selectedLeague: String,
  playedPitchers: Set,
  getTeamPitcherCount: Function
});

defineEmits(['close', 'select', 'update:selectedTeam', 'update:selectedLeague']);

const showOtherTeams = ref(false);

const cpblTeamsWithPitchers = computed(() =>
  props.teamsWithPitchers.filter(t => CPBL_TEAMS.includes(t))
);

const otherTeamsWithPitchers = computed(() =>
  props.teamsWithPitchers.filter(t => !CPBL_TEAMS.includes(t))
);

const isOtherTeamSelected = computed(() =>
  props.selectedTeam !== null && !CPBL_TEAMS.includes(props.selectedTeam)
);
</script>
