<template>
  <div class="w-full h-full relative bg-gradient-to-br from-sky-200 via-blue-100 to-green-100 flex items-center justify-center overflow-hidden">
    <div class="text-center px-6 relative z-10">
      <!-- Logo -->
      <div class="mb-8">
        <div class="text-8xl mb-4 animate-bounce">⚾</div>
        <h1 class="text-7xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-4" style="text-shadow: 4px 4px 8px rgba(0,0,0,0.1)">
          棒球對決
        </h1>
        <p class="text-2xl text-blue-600 font-bold mb-2">Baseball Showdown</p>
      </div>

      <!-- 載入狀態 -->
      <div v-if="isLoading" class="bg-white/80 backdrop-blur-sm rounded-3xl p-8 mb-6 border-4 border-blue-400 shadow-xl">
        <div class="animate-spin text-6xl mb-4">⚾</div>
        <div class="text-blue-600 text-xl font-bold">載入中...</div>
      </div>

      <div v-else-if="loadError" class="bg-red-100 backdrop-blur-sm rounded-3xl p-8 mb-6 border-4 border-red-400 shadow-xl">
        <div class="text-red-600 text-xl font-bold mb-4">⚠️ 載入失敗</div>
        <button @click="$emit('retry')" class="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-2xl font-bold transition shadow-lg">
          🔄 重試
        </button>
      </div>

      <!-- 遊戲模式選擇 -->
      <div v-if="!isLoading && !loadError" class="grid grid-cols-2 gap-8 mb-8">
        <button @click="$emit('select-mode', 'single')" 
          class="group bg-gradient-to-br from-yellow-300 to-orange-400 hover:from-yellow-200 hover:to-orange-300 p-10 rounded-3xl shadow-2xl transition-all transform hover:scale-110 hover:rotate-2 border-4 border-white">
          <div class="text-7xl mb-4">🎯</div>
          <div class="text-4xl font-black text-white mb-2" style="text-shadow: 2px 2px 0px rgba(0,0,0,0.2)">單人模式</div>
          <div class="text-orange-800 font-bold text-xl">無限暢打</div>
        </button>
        <button @click="$emit('select-mode', 'versus')" 
          class="group bg-gradient-to-br from-green-300 to-emerald-400 hover:from-green-200 hover:to-emerald-300 p-10 rounded-3xl shadow-2xl transition-all transform hover:scale-110 hover:-rotate-2 border-4 border-white">
          <div class="text-7xl mb-4">⚔️</div>
          <div class="text-4xl font-black text-white mb-2" style="text-shadow: 2px 2px 0px rgba(0,0,0,0.2)">對戰模式</div>
          <div class="text-green-800 font-bold text-xl">攻守交換</div>
        </button>
      </div>

      <div v-if="!isLoading && !loadError" class="flex items-center justify-center gap-4">
        <div class="bg-white/60 px-6 py-3 rounded-full">
          <span class="text-blue-600 font-bold text-lg">🎮 已載入 {{ rosterCount }} 位球員</span>
        </div>
        <button @click="$emit('go-admin')" class="bg-white/60 hover:bg-white/80 px-4 py-3 rounded-full transition">
          <span class="text-slate-600 font-bold">⚙️</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  isLoading: Boolean,
  loadError: Boolean,
  rosterCount: Number
});

defineEmits(['select-mode', 'retry', 'go-admin']);
</script>
