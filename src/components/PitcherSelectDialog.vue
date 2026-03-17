<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div class="bg-gradient-to-br from-orange-100 to-red-100 rounded-3xl p-8 max-w-4xl max-h-[80vh] flex flex-col border-4 border-orange-400 shadow-2xl">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-4xl font-black text-orange-600" style="text-shadow: 2px 2px 0px #fff">🔥 {{ title }}</h2>
        <button @click="$emit('close')" class="text-red-500 hover:text-red-600 hover:bg-red-100 p-3 rounded-full">
          <XCircleIcon :size="32" />
        </button>
      </div>

      <!-- 球隊篩選 -->
      <div class="flex gap-2 mb-4 flex-wrap">
        <button @click="$emit('update:selectedTeam', null)" :class="[
          'px-4 py-2 rounded-2xl font-bold transition-all border-2 border-white shadow-md',
          selectedTeam === null ? 'bg-orange-400 text-white scale-105' : 'bg-white text-orange-600 hover:bg-orange-50'
        ]">
          全部 ({{ pitchers.length }})
        </button>
        <button v-for="team in teamsWithPitchers" :key="team" @click="$emit('update:selectedTeam', team)" :class="[
          'px-3 py-3 rounded-2xl font-bold transition-all border-2 border-white shadow-md flex flex-col items-center gap-1',
          selectedTeam === team ? 'bg-orange-400 text-white scale-105' : 'bg-white text-orange-600 hover:bg-orange-50'
        ]">
          <img v-if="teamLogos[team]" :src="teamLogos[team]" class="w-16 h-16 object-contain" :alt="team" />
          <span class="text-2xl" v-else>⚾</span>
          <div class="text-center">
            <div class="text-xs font-bold">{{ team }}</div>
            <div class="text-xs opacity-75">({{ getTeamPitcherCount(team) }})</div>
          </div>
        </button>
      </div>

      <!-- 投手列表 -->
      <div class="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
        <button v-for="pitcher in filteredPitchers" :key="pitcher.name + pitcher.number"
          @click="$emit('select', pitcher)"
          :disabled="playedPitchers.has(pitcher.name + pitcher.number)"
          class="bg-white hover:bg-orange-50 disabled:bg-gray-200 disabled:opacity-50 p-2 rounded-lg transition-all transform hover:scale-105 disabled:scale-100 text-left border-2 border-orange-300 hover:border-orange-500 disabled:border-gray-300 shadow-md">
          <div class="flex items-start gap-2">
            <img v-if="pitcher.photo" :src="pitcher.photo" class="w-12 h-12 rounded-full object-cover border-2 border-orange-400 shadow-md flex-shrink-0" />
            <div v-else class="w-12 h-12 rounded-full bg-orange-200 flex items-center justify-center text-xl flex-shrink-0">🔥</div>
            <div class="flex-1 min-w-0 flex flex-col justify-between">
              <div :class="[
                'text-gray-800 font-black leading-tight mb-1',
                pitcher.name.length > 6 ? 'text-sm' : pitcher.name.length > 4 ? 'text-base' : 'text-lg'
              ]" :style="pitcher.name.length > 6 ? 'word-wrap: break-word; overflow-wrap: break-word;' : ''">{{ pitcher.name }}</div>
              <div class="text-xs text-orange-600 font-bold">#{{ pitcher.number }} · {{ pitcher.mainPosition }}</div>
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { XCircleIcon } from './Icons.vue';

defineProps({
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
  playedPitchers: Set,
  getTeamPitcherCount: Function
});

defineEmits(['close', 'select', 'update:selectedTeam']);
</script>
