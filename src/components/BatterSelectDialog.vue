<template>
  <div v-if="show" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
    <div class="bg-gradient-to-br from-pink-100 to-purple-100 rounded-3xl p-6 max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-3xl font-black text-pink-600">🔄 選擇代打</h2>
        <button @click="$emit('close')" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-full font-bold">
          ✖ 關閉
        </button>
      </div>
      
      <!-- 球隊篩選 -->
      <div class="flex gap-2 mb-4 flex-wrap">
        <button @click="$emit('update:selectedTeam', null)" :class="[
          'px-3 py-2 rounded-xl font-bold transition-all border-2 border-white shadow-md text-sm',
          selectedTeam === null ? 'bg-pink-400 text-white scale-105' : 'bg-white text-pink-600 hover:bg-pink-50'
        ]">
          全部
        </button>
        <button v-for="team in teamsWithBatters" :key="team" @click="$emit('update:selectedTeam', team)" :class="[
          'px-2 py-2 rounded-xl font-bold transition-all border-2 border-white shadow-md',
          selectedTeam === team ? 'bg-pink-400 text-white scale-105' : 'bg-white text-pink-600 hover:bg-pink-50'
        ]">
          <img v-if="teamLogos[team]" :src="teamLogos[team]" class="w-8 h-8 object-contain" :alt="team" />
          <span class="text-sm" v-else>{{ team }}</span>
        </button>
      </div>

      <!-- 球員列表 -->
      <div class="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
        <button v-for="player in filteredBatters" :key="player.name + player.number"
          @click="$emit('select', player)"
          :disabled="isPlayerDisabled(player)"
          class="bg-white hover:bg-pink-50 disabled:bg-gray-200 disabled:opacity-50 p-2 rounded-xl transition-all transform hover:scale-105 disabled:scale-100 text-left border-2 border-pink-300 hover:border-pink-500 disabled:border-gray-300 shadow-md">
          <div class="flex items-start gap-2">
            <img v-if="player.photo" :src="player.photo" class="w-12 h-12 rounded-full object-cover border-2 border-pink-400 shadow-md flex-shrink-0" />
            <div v-else class="w-12 h-12 rounded-full bg-pink-200 flex items-center justify-center text-xl flex-shrink-0">⚾</div>
            <div class="flex-1 min-w-0 flex flex-col justify-between">
              <div :class="[
                'text-gray-800 font-black leading-tight mb-1',
                player.name.length > 6 ? 'text-sm' : player.name.length > 4 ? 'text-base' : 'text-lg'
              ]" :style="player.name.length > 6 ? 'word-wrap: break-word; overflow-wrap: break-word;' : ''">{{ player.name }}</div>
              <div class="text-xs text-pink-600 font-bold">#{{ player.number }} · {{ player.mainPosition }}</div>
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  show: Boolean,
  filteredBatters: Array,
  teamsWithBatters: Array,
  teamLogos: Object,
  selectedTeam: null,
  playedBatters: Set,
  lineup: Array,
  currentBatterIndex: Number
});

defineEmits(['close', 'select', 'update:selectedTeam']);

const isPlayerDisabled = (player) => {
  return props.playedBatters.has(player.name + player.number) || 
         props.lineup.some((p, idx) => idx !== props.currentBatterIndex && p.name === player.name && p.number === player.number);
};
</script>
