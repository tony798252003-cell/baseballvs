<template>
  <div v-if="show" class="fixed inset-0 bg-gradient-to-br from-blue-900 via-purple-900 to-red-900 flex items-center justify-center z-50 animate-fadeIn">
    <button @click="$emit('skip')" class="fixed bottom-8 right-8 bg-red-500 hover:bg-red-600 text-white px-8 py-4 rounded-full font-bold transition-all transform hover:scale-110 shadow-xl border-2 border-white z-[60] text-lg">
      ⏩ 跳過介紹
    </button>
    <div class="text-center">
      <div class="text-6xl font-black text-yellow-400 mb-8 animate-pulse" style="text-shadow: 4px 4px 8px rgba(0,0,0,0.8)">
        {{ title }}
      </div>
      <div v-if="currentPlayer" class="bg-white/10 backdrop-blur-md rounded-3xl p-12 border-4 border-yellow-400 shadow-2xl transform animate-bounce">
        <img v-if="currentPlayer.photo" :src="currentPlayer.photo" class="w-40 h-40 rounded-full object-cover border-6 border-yellow-400 shadow-2xl mx-auto mb-6" />
        <div class="text-7xl font-black text-white mb-4" style="text-shadow: 3px 3px 6px rgba(0,0,0,0.8)">
          第{{ currentIndex + 1 }}棒
        </div>
        <div class="text-5xl font-black text-yellow-300 mb-2">{{ currentPlayer.name }}</div>
        <div class="text-3xl text-orange-400 font-bold mb-2">#{{ currentPlayer.number }}</div>
        <div class="text-2xl text-cyan-300 font-bold mb-2">{{ currentPlayer.originalTeam }}</div>
        <div class="text-2xl text-green-300 font-bold">{{ currentPlayer.mainPosition }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  show: Boolean,
  lineup: Array,
  currentIndex: Number,
  gameType: String,
  isTop: Boolean
});

defineEmits(['skip']);

const title = computed(() => {
  if (props.gameType === 'versus' && !props.isTop) {
    return '🏠 主隊先發打序';
  } else if (props.gameType === 'versus') {
    return '🏃 客隊先發打序';
  }
  return '先發打序介紹';
});

const currentPlayer = computed(() => {
  return props.lineup?.[props.currentIndex];
});
</script>
