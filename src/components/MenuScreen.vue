<template>
  <div class="w-full h-full relative bg-gradient-to-br from-sky-100 via-white to-indigo-100 flex items-center justify-center overflow-hidden">
    <!-- Subtle decorative radial behind the logo -->
    <div class="absolute inset-0 pointer-events-none" style="background: radial-gradient(ellipse at 50% 30%, rgba(99,102,241,0.12) 0%, transparent 65%)"></div>
    <!-- Decorative circle -->
    <div class="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-indigo-100/60 blur-3xl pointer-events-none"></div>

    <div class="text-center px-6 relative z-10 w-full max-w-md">
      <!-- Logo -->
      <div class="mb-10">
        <div class="text-8xl mb-4 animate-bounce">⚾</div>
        <h1 class="text-7xl font-black bg-gradient-to-r from-indigo-600 via-indigo-500 to-amber-500 bg-clip-text text-transparent mb-3">
          棒球對決
        </h1>
        <p class="text-xl text-slate-500 font-bold tracking-widest uppercase">Baseball Showdown</p>
      </div>

      <!-- 載入狀態 -->
      <div v-if="isLoading" class="bg-white shadow-md border border-slate-100 rounded-2xl p-8 mb-6">
        <div class="flex items-center justify-center mb-4">
          <svg class="animate-spin w-12 h-12 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        </div>
        <div class="text-slate-900 text-xl font-bold">載入中...</div>
      </div>

      <div v-else-if="loadError" class="bg-red-50 border border-red-200 rounded-2xl p-8 mb-6 shadow-md">
        <div class="text-red-500 text-xl font-bold mb-4">載入失敗</div>
        <button @click="$emit('retry')" class="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl font-bold transition-all duration-150 shadow-lg cursor-pointer min-h-11">
          重試
        </button>
      </div>

      <!-- 遊戲模式選擇 -->
      <div v-if="!isLoading && !loadError" class="grid grid-cols-2 gap-6 mb-8">
        <button @click="$emit('select-mode', 'single')"
          class="bg-indigo-600 hover:bg-indigo-500 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-150 transform hover:scale-105 cursor-pointer min-h-11 flex flex-col items-center justify-center gap-2 border-l-4 border-indigo-400">
          <div class="text-3xl font-black text-white leading-tight">單人模式</div>
          <div class="text-indigo-200 font-bold text-base">無限暢打</div>
        </button>
        <button @click="$emit('select-mode', 'versus')"
          class="bg-amber-500 hover:bg-amber-400 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-150 transform hover:scale-105 cursor-pointer min-h-11 flex flex-col items-center justify-center gap-2 border-l-4 border-amber-300">
          <div class="text-3xl font-black text-white leading-tight">對戰模式</div>
          <div class="text-amber-100 font-bold text-base">攻守交換</div>
        </button>
      </div>

      <div v-if="!isLoading && !loadError" class="flex items-center justify-center gap-4">
        <div class="bg-white border border-slate-200 shadow-sm px-5 py-2 rounded-full">
          <span class="text-slate-600 font-bold text-sm">已載入 {{ rosterCount }} 位球員</span>
        </div>
        <button @click="$emit('go-admin')" class="bg-white border border-slate-200 shadow-sm hover:bg-indigo-50 px-4 py-2 rounded-full transition-all duration-150 cursor-pointer min-h-11 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
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
