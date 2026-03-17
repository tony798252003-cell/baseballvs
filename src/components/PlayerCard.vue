<template>
  <div class="w-full max-w-xl bg-white/95 backdrop-blur-sm rounded-xl sm:rounded-2xl lg:rounded-3xl p-2 sm:p-3 lg:p-4 border-2 lg:border-3 border-yellow-400 shadow-2xl overflow-hidden">
    <div class="flex flex-col items-center gap-1 sm:gap-2 lg:gap-3">
      <!-- 響應式大頭照 -->
      <div class="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 rounded-full border-2 sm:border-3 md:border-4 border-yellow-400 shadow-2xl overflow-hidden bg-gradient-to-br from-blue-100 to-blue-200 flex-shrink-0">
        <img v-if="player.photo" :src="player.photo" :alt="player.name" class="w-full h-full object-cover" />
        <div v-else class="w-full h-full flex items-center justify-center text-blue-400">
          <slot name="default-icon">
            <UsersIcon :size="32" class="sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-16 lg:h-16" />
          </slot>
        </div>
      </div>
      
      <div class="flex-1 min-w-0 text-center w-full overflow-hidden">
        <!-- 名字顯示：5個字以下不換行，6個字以上第5個字後換行 -->
        <div v-if="player.name.length <= 5" :class="[
          'font-black text-gray-900 mb-1 leading-tight',
          player.name.length <= 3 ? 'text-xl sm:text-2xl md:text-3xl lg:text-4xl' : 
          player.name.length <= 4 ? 'text-lg sm:text-xl md:text-2xl lg:text-3xl' :
          'text-base sm:text-lg md:text-xl lg:text-2xl'
        ]">{{ player.name }}</div>
        <div v-else class="font-black text-gray-900 mb-1 leading-tight">
          <div :class="[
            player.name.length === 6 ? 'text-base sm:text-lg md:text-xl lg:text-2xl' : 'text-sm sm:text-base md:text-lg lg:text-xl'
          ]">
            {{ player.name.substring(0, player.name.length === 6 ? 4 : 5) }}
          </div>
          <div :class="[
            player.name.length === 6 ? 'text-base sm:text-lg md:text-xl lg:text-2xl' : 'text-sm sm:text-base md:text-lg lg:text-xl'
          ]">
            {{ player.name.substring(player.name.length === 6 ? 4 : 5) }}
          </div>
        </div>
        
        <div class="flex items-center justify-center gap-1 sm:gap-2 mb-0.5 flex-wrap overflow-hidden">
          <div class="text-xs sm:text-sm md:text-base lg:text-lg font-bold text-blue-600">#{{ player.number }}</div>
          <div class="text-xs sm:text-sm md:text-base text-gray-700 font-semibold truncate max-w-[100px] sm:max-w-[120px] md:max-w-[150px]">{{ player.originalTeam }}</div>
        </div>
        
        <div class="flex items-center justify-center gap-1 flex-wrap overflow-hidden">
          <div class="inline-block bg-orange-400 text-white px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full text-xs sm:text-sm font-bold">{{ player.mainPosition }}</div>
          <div class="inline-block bg-gray-600 text-white px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap">{{ player.pitchingHand }}投{{ player.battingHand }}打</div>
        </div>
        
        <!-- 本場攻擊結果記錄 -->
        <div v-if="results && results.length > 0" class="mt-2 pt-2 border-t-2 border-gray-200 w-full">
          <div class="text-xs text-gray-600 font-bold mb-1.5 text-center">本場紀錄</div>
          <div class="flex flex-wrap gap-1 justify-center">
            <div 
              v-for="(result, index) in results" 
              :key="index"
              :class="[
                'px-2 py-1 rounded text-xs font-bold border-2',
                result.type === 'hit' ? 'bg-red-50 border-red-500 text-red-700' :
                result.type === 'walk' ? 'bg-yellow-50 border-yellow-500 text-yellow-700' :
                'bg-gray-100 border-gray-700 text-gray-700'
              ]"
            >
              {{ result.detail }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { UsersIcon } from './Icons.vue';

defineProps({
  player: {
    type: Object,
    required: true
  },
  results: {
    type: Array,
    default: () => []
  }
});
</script>
