<template>
  <div class="w-32 sm:w-40 md:w-48 lg:w-64 bg-slate-800/90 backdrop-blur-sm border-l-4 border-yellow-400 flex flex-col flex-shrink-0 overflow-hidden">
    <div class="p-1.5 sm:p-2 bg-yellow-400 text-slate-900 font-black text-center text-xs sm:text-sm lg:text-base flex-shrink-0">
      先發打序
    </div>
    <div class="flex-1 flex flex-col justify-between py-1 px-1 sm:px-1.5">
      <div v-for="(player, index) in lineup" :key="index" 
        :class="[
          'py-0.5 px-1.5 sm:px-2 rounded-lg transition-all',
          index === currentBatterIndex ? 'bg-yellow-400 text-slate-900 shadow-lg' : 'bg-slate-700/50 text-white'
        ]">
        <div class="flex items-center">
          <div :class="[
            'font-bold leading-tight flex-shrink-0 mr-1',
            player.name.length > 5 ? 'text-xs sm:text-sm lg:text-base' : 'text-sm sm:text-base lg:text-lg'
          ]">
            {{ index + 1 }}
          </div>
          <div :class="[
            'font-bold leading-tight flex-1 text-center',
            player.name.length > 5 ? 'text-xs sm:text-sm lg:text-base break-words' : 'text-sm sm:text-base lg:text-lg truncate'
          ]">
            {{ player.name }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  lineup: {
    type: Array,
    required: true
  },
  currentBatterIndex: {
    type: Number,
    required: true
  }
});
</script>
