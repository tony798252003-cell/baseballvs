<template>
  <div v-if="show" class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div class="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-3xl font-black text-white">選擇代打</h2>
        <button @click="$emit('close')" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl font-bold transition-all duration-150 cursor-pointer min-h-11">
          關閉
        </button>
      </div>

      <!-- 一軍/二軍切換 -->
      <div class="flex gap-2 mb-3">
        <button v-for="l in ['一軍', '二軍', 'all']" :key="l"
          @click="$emit('update:selectedLeague', l)"
          :class="[
            'px-4 py-1.5 rounded-full font-bold text-sm transition-all duration-150 border cursor-pointer min-h-11',
            selectedLeague === l ? 'bg-blue-500 text-white border-blue-500' : 'bg-white/10 text-slate-300 border-white/20 hover:bg-white/20'
          ]">
          {{ l === 'all' ? '全部' : l }}
        </button>
      </div>

      <!-- 球隊篩選 -->
      <div class="flex gap-2 mb-4 flex-wrap">
        <button @click="$emit('update:selectedTeam', null)" :class="[
          'px-3 py-2 rounded-xl font-bold transition-all duration-150 border shadow-md text-sm cursor-pointer min-h-11',
          selectedTeam === null ? 'bg-blue-500 text-white border-blue-500 scale-105' : 'bg-white/10 text-slate-300 border-white/20 hover:bg-white/20'
        ]">
          全部
        </button>
        <!-- 中職六隊 -->
        <button v-for="team in cpblTeamsWithBatters" :key="team" @click="$emit('update:selectedTeam', team)" :class="[
          'px-2 py-2 rounded-xl font-bold transition-all duration-150 border shadow-md cursor-pointer',
          selectedTeam === team ? 'bg-blue-500/30 text-white border-blue-400 scale-105' : 'bg-white/10 text-slate-300 border-white/20 hover:bg-white/20'
        ]">
          <img v-if="teamLogos[team]" :src="teamLogos[team]" class="w-8 h-8 object-contain" :alt="team" />
          <span class="text-sm" v-else>{{ team }}</span>
        </button>
        <!-- 其他球隊折疊 -->
        <button v-if="otherTeamsWithBatters.length > 0"
          @click="showOtherTeams = !showOtherTeams"
          :class="[
            'px-2 py-2 rounded-xl font-bold transition-all duration-150 border shadow-md text-xs cursor-pointer min-h-11',
            isOtherTeamSelected ? 'bg-blue-500/30 text-white border-blue-400 scale-105' : 'bg-white/10 text-slate-300 border-white/20 hover:bg-white/20'
          ]">
          {{ showOtherTeams ? '▲' : '▼' }}
        </button>
        <template v-if="showOtherTeams">
          <button v-for="team in otherTeamsWithBatters" :key="team" @click="$emit('update:selectedTeam', team)" :class="[
            'px-2 py-1 rounded-xl font-bold transition-all duration-150 border shadow-md text-xs cursor-pointer',
            selectedTeam === team ? 'bg-blue-500/30 text-white border-blue-400 scale-105' : 'bg-white/10 text-slate-300 border-white/20 hover:bg-white/20'
          ]" style="max-width:80px; word-break:break-all">
            {{ team }}
          </button>
        </template>
      </div>

      <!-- 球員列表 -->
      <div class="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
        <button v-for="player in filteredBatters" :key="player.name + player.number"
          @click="$emit('select', player)"
          :disabled="isPlayerDisabled(player)"
          class="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/40 disabled:opacity-50 p-2 rounded-xl transition-all duration-150 transform hover:scale-105 disabled:scale-100 text-left border border-blue-500/30 hover:border-blue-400/60 disabled:border-white/5 shadow-md cursor-pointer disabled:cursor-not-allowed">
          <div class="flex items-start gap-2">
            <img v-if="player.photo" :src="player.photo" class="w-12 h-12 rounded-full object-cover border-2 border-blue-400/60 shadow-md flex-shrink-0" />
            <div v-else class="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-xl flex-shrink-0">⚾</div>
            <div class="flex-1 min-w-0 flex flex-col justify-between">
              <div class="flex items-center gap-1 mb-1">
                <span :class="[
                  'text-white font-black leading-tight',
                  player.name.length > 6 ? 'text-sm' : player.name.length > 4 ? 'text-base' : 'text-lg'
                ]" :style="player.name.length > 6 ? 'word-wrap: break-word; overflow-wrap: break-word;' : ''">{{ player.name }}</span>
                <span v-if="player.song" class="text-xs text-blue-400">♪</span>
              </div>
              <div class="text-xs text-blue-400 font-bold">#{{ player.number }} · {{ player.mainPosition }}</div>
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const CPBL_TEAMS = ['樂天桃猿', '統一獅', '富邦悍將', '味全龍', '台鋼雄鷹', '中信兄弟'];

const props = defineProps({
  show: Boolean,
  filteredBatters: Array,
  teamsWithBatters: Array,
  teamLogos: Object,
  selectedTeam: null,
  selectedLeague: String,
  playedBatters: Set,
  lineup: Array,
  currentBatterIndex: Number
});

defineEmits(['close', 'select', 'update:selectedTeam', 'update:selectedLeague']);

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

const isPlayerDisabled = (player) => {
  return props.playedBatters.has(player.name + player.number) ||
         props.lineup.some((p, idx) => idx !== props.currentBatterIndex && p.name === player.name && p.number === player.number);
};
</script>
