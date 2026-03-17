<template>
  <div class="grid grid-cols-4 md:grid-cols-8 gap-2">
    <!-- 1B -->
    <button @click="$emit('hit', 1)" 
      class="bg-red-400 hover:bg-red-300 active:bg-red-500 text-white rounded-2xl py-4 px-2 shadow-lg transition-all transform hover:scale-105 active:scale-95 border-3 border-white/50">
      <div class="text-center">
        <div class="text-3xl font-black">1B</div>
      </div>
    </button>

    <!-- 2B -->
    <button @click="$emit('hit', 2)" 
      class="bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500 text-white rounded-2xl py-4 px-2 shadow-lg transition-all transform hover:scale-105 active:scale-95 border-3 border-white/50">
      <div class="text-center">
        <div class="text-3xl font-black">2B</div>
      </div>
    </button>

    <!-- 3B -->
    <button @click="$emit('hit', 3)" 
      class="bg-blue-400 hover:bg-blue-300 active:bg-blue-500 text-white rounded-2xl py-4 px-2 shadow-lg transition-all transform hover:scale-105 active:scale-95 border-3 border-white/50">
      <div class="text-center">
        <div class="text-3xl font-black">3B</div>
      </div>
    </button>

    <!-- HR -->
    <button @click="$emit('hit', 4)" 
      class="bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-white rounded-2xl py-4 px-2 shadow-lg transition-all transform hover:scale-105 active:scale-95 border-3 border-white/50">
      <div class="text-center">
        <div class="text-3xl font-black">HR</div>
      </div>
    </button>

    <!-- BB -->
    <button @click="$emit('walk')" 
      class="bg-purple-400 hover:bg-purple-300 active:bg-purple-500 text-white rounded-2xl py-4 px-2 shadow-lg transition-all transform hover:scale-105 active:scale-95 border-3 border-white/50">
      <div class="text-center">
        <div class="text-3xl font-black">BB</div>
      </div>
    </button>
    
    <!-- HBP (觸身球) -->
    <button @click="$emit('hbp')" 
      class="bg-pink-500 hover:bg-pink-400 active:bg-pink-600 text-white rounded-2xl py-4 px-2 shadow-lg transition-all transform hover:scale-105 active:scale-95 border-3 border-white/50">
      <div class="text-center">
        <div class="text-2xl font-black">HBP</div>
      </div>
    </button>

    <!-- OUT -->
    <button @click="$emit('out')" 
      class="bg-orange-400 hover:bg-orange-300 active:bg-orange-500 text-white rounded-2xl py-4 px-2 shadow-lg transition-all transform hover:scale-105 active:scale-95 border-3 border-white/50">
      <div class="text-center">
        <div class="text-2xl font-black">OUT</div>
      </div>
    </button>
    
    <!-- K (三振) -->
    <button @click="$emit('strikeout')" 
      class="bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-2xl py-4 px-2 shadow-lg transition-all transform hover:scale-105 active:scale-95 border-3 border-white/50">
      <div class="text-center">
        <div class="text-3xl font-black">K</div>
      </div>
    </button>
  </div>
</template>

<script setup>
defineEmits(['hit', 'walk', 'hbp', 'out', 'strikeout']);
</script>
