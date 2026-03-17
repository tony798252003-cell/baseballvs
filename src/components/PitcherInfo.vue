<template>
  <div v-if="pitcher" class="bg-orange-950/80 backdrop-blur-sm px-2 lg:px-4 py-2 border-y-2 border-orange-400 shadow-lg flex-shrink-0">
    <div class="flex items-center gap-2 lg:gap-3">
      <div class="w-10 h-10 lg:w-14 lg:h-14 rounded-full border-2 border-orange-400 shadow-lg overflow-hidden bg-slate-700 flex-shrink-0">
        <img v-if="pitcher.photo" :src="pitcher.photo" :alt="pitcher.name" class="w-full h-full object-cover" />
        <div v-else class="w-full h-full flex items-center justify-center text-xl lg:text-3xl">🔥</div>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-white truncate flex items-baseline gap-2">
          <span class="text-xl lg:text-3xl font-black">{{ pitcher.name }}</span>
          <span class="text-sm lg:text-base text-orange-300">#{{ pitcher.number }} ・ {{ pitcher.pitchingHand }}投{{ pitcher.battingHand }}打</span>
        </div>
        <!-- 投手統計數據 - 總是顯示，如果沒有 stats 則顯示 0 -->
        <div class="flex gap-3 lg:gap-4 mt-1 text-xs lg:text-sm">
          <div class="text-yellow-300">
            <span class="text-orange-400 font-bold">被安打:</span> {{ stats?.hits || 0 }}
          </div>
          <div class="text-yellow-300">
            <span class="text-orange-400 font-bold">三振:</span> {{ stats?.strikeouts || 0 }}
          </div>
          <div class="text-yellow-300">
            <span class="text-orange-400 font-bold">四壞:</span> {{ stats?.walks || 0 }}
          </div>
          <div class="text-yellow-300">
            <span class="text-orange-400 font-bold">失分:</span> {{ stats?.runs || 0 }}
          </div>
          <div class="text-yellow-300">
            <span class="text-orange-400 font-bold">ERA:</span> {{ displayERA }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  pitcher: {
    type: Object,
    default: null
  },
  stats: {
    type: Object,
    default: null
  }
});

// 直接在這裡計算 ERA
const displayERA = computed(() => {
  if (!props.stats) return '0.00'
  
  const { outs, earnedRuns } = props.stats
  
  // 如果有失分但沒有出局數
  if (earnedRuns > 0 && outs === 0) {
    return '∞'
  }
  
  if (outs === 0) return '0.00'
  
  // ERA = (自責分 × 9) / (出局數 / 3)
  const innings = outs / 3
  const era = (earnedRuns * 9) / innings
  return era.toFixed(2)
})
</script>
