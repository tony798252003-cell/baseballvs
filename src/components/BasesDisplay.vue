<template>
  <div class="flex-1 relative z-10 flex items-center justify-center">
    <!-- 二壘（上方）-->
    <div v-if="runners[1]" class="absolute top-[22%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
      <div class="w-16 h-16 lg:w-20 lg:h-20 rounded-full border-2 lg:border-4 transition-all duration-300 overflow-hidden shadow-2xl flex items-center justify-center border-yellow-400 shadow-yellow-500/70 scale-110 animate-bounce" style="background-color: #3b82f6">
        <img v-if="runnerPhotos[1]" :src="runnerPhotos[1]" class="w-full h-full object-cover" />
        <div v-else class="text-2xl lg:text-3xl font-black text-white drop-shadow-lg">2</div>
      </div>
    </div>

    <!-- 三壘（左方）-->
    <div v-if="runners[2]" class="absolute top-[50%] left-[10%] -translate-y-1/2 z-20">
      <div class="w-16 h-16 lg:w-20 lg:h-20 rounded-full border-2 lg:border-4 transition-all duration-300 overflow-hidden shadow-2xl flex items-center justify-center border-yellow-400 shadow-yellow-500/70 scale-110 animate-bounce" style="background-color: #3b82f6">
        <img v-if="runnerPhotos[2]" :src="runnerPhotos[2]" class="w-full h-full object-cover" />
        <div v-else class="text-2xl lg:text-3xl font-black text-white drop-shadow-lg">3</div>
      </div>
    </div>

    <!-- 一壘（右方）-->
    <div v-if="runners[0]" class="absolute top-[50%] right-[10%] -translate-y-1/2 z-20">
      <div class="w-16 h-16 lg:w-20 lg:h-20 rounded-full border-2 lg:border-4 transition-all duration-300 overflow-hidden shadow-2xl flex items-center justify-center border-yellow-400 shadow-yellow-500/70 scale-110 animate-bounce" style="background-color: #3b82f6">
        <img v-if="runnerPhotos[0]" :src="runnerPhotos[0]" class="w-full h-full object-cover" />
        <div v-else class="text-2xl lg:text-3xl font-black text-white drop-shadow-lg">1</div>
      </div>
    </div>

    <!-- 投手丘（中央）-->
    <div v-if="pitcher" class="absolute top-[50%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
      <div class="w-16 h-16 lg:w-20 lg:h-20 rounded-full border-2 lg:border-4 overflow-hidden shadow-2xl flex items-center justify-center border-orange-400 bg-orange-500">
        <img v-if="pitcher.photo" :src="pitcher.photo" :alt="pitcher.name" class="w-full h-full object-cover" />
        <div v-else class="text-2xl lg:text-3xl">🔥</div>
      </div>
    </div>

    <!-- 打者照片（本壘板左或右边）-->
    <div v-if="batter" :class="[
      'absolute bottom-[18%] z-20',
      batter.battingHand === '左' ? 'right-[38%]' : 'left-[38%]'
    ]">
      <div class="w-16 h-16 lg:w-20 lg:h-20 rounded-full border-2 lg:border-4 overflow-hidden shadow-2xl flex items-center justify-center border-blue-400 bg-blue-500">
        <img v-if="batter.photo" :src="batter.photo" :alt="batter.name" class="w-full h-full object-cover" />
        <div v-else class="text-white text-sm">⚾</div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  runners: {
    type: Array,
    required: true
  },
  runnerPhotos: {
    type: Array,
    required: true
  },
  pitcher: {
    type: Object,
    default: null
  },
  batter: {
    type: Object,
    default: null
  }
});
</script>
