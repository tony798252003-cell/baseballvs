<template>
  <div class="flex gap-2 sm:gap-3 justify-center mb-2">
    <!-- 好球數 -->
    <div class="bg-slate-900/80 backdrop-blur-sm rounded-xl px-3 py-2 border-2 border-yellow-400 shadow-lg">
      <div class="text-yellow-400 text-xs font-bold mb-1">好球</div>
      <div class="flex gap-1">
        <div v-for="i in 3" :key="i" :class="[
          'w-3 h-3 rounded-full transition-all',
          i - 1 < strikes ? 'bg-yellow-400 shadow-lg shadow-yellow-400/50' : 'bg-slate-700'
        ]"></div>
      </div>
    </div>
    
    <!-- 壞球數 -->
    <div class="bg-slate-900/80 backdrop-blur-sm rounded-xl px-3 py-2 border-2 border-green-400 shadow-lg">
      <div class="text-green-400 text-xs font-bold mb-1">壞球</div>
      <div class="flex gap-1">
        <div v-for="i in 4" :key="i" :class="[
          'w-3 h-3 rounded-full transition-all',
          i - 1 < balls ? 'bg-green-400 shadow-lg shadow-green-400/50' : 'bg-slate-700'
        ]"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  balls: {
    type: Number,
    required: true
  },
  strikes: {
    type: Number,
    required: true
  }
});
</script>
