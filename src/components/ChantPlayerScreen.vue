<template>
  <div class="w-full h-full bg-slate-900 text-white flex flex-col overflow-hidden">
    <!-- 選隊視圖 -->
    <div v-if="!selectedTeam" class="flex-1 flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="flex items-center gap-4 px-6 py-4 flex-shrink-0">
        <button @click="$emit('back')"
          class="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-sm font-bold transition cursor-pointer">
          ← 返回
        </button>
        <h1 class="text-2xl font-black">選擇隊伍</h1>
      </div>
      <!-- 6 隊 Grid -->
      <div class="flex-1 overflow-y-auto px-4 pb-6">
        <div class="grid grid-cols-2 gap-4">
          <button
            v-for="team in CPBL_TEAMS"
            :key="team"
            @click="selectTeam(team)"
            class="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-6 flex flex-col items-center justify-center hover:bg-white/20 hover:scale-105 hover:border-white/40 active:scale-95 transition-all duration-200 cursor-pointer shadow-xl shadow-black/30 min-h-[160px]"
          >
            <img :src="teamLogos[team]" :alt="team" class="w-20 h-20 object-contain mx-auto mb-3" />
            <div class="text-xl font-black">{{ team }}</div>
            <div class="text-sm opacity-70 mt-1">
              {{ playersWithSong(team).length }} 首應援曲
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- 球員視圖 -->
    <div v-else class="flex-1 flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="flex items-center gap-4 px-6 py-4 flex-shrink-0">
        <button @click="selectedTeam = null"
          class="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-sm font-bold transition cursor-pointer">
          ← {{ selectedTeam }}
        </button>
        <h1 class="text-xl font-black flex-1 text-center">🎵 應援曲</h1>
      </div>

      <!-- 上半：球員頭像網格 -->
      <div class="flex-1 overflow-y-auto px-4 pb-2" style="max-height: 55vh">
        <div class="grid grid-cols-3 gap-3">
          <button
            v-for="(player, idx) in teamPlayers"
            :key="player.id"
            @click="player.song && startFrom(idx)"
            :class="[
              'flex flex-col items-center p-3 rounded-2xl transition-all duration-200',
              !player.song
                ? 'bg-slate-800 opacity-40 cursor-not-allowed border-2 border-transparent'
                : currentIndex === idx && isPlaying
                  ? 'bg-yellow-950/60 border-2 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)] scale-105 cursor-pointer animate-pulse'
                  : 'bg-slate-800 border-2 border-transparent hover:bg-slate-700 hover:scale-105 hover:border-slate-600 cursor-pointer'
            ]"
          >
            <div class="relative">
              <img
                v-if="player.photo"
                :src="player.photo"
                :alt="player.name"
                class="w-20 h-20 rounded-full object-cover border-4"
                :class="currentIndex === idx && isPlaying ? 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)]' : 'border-transparent'"
              />
              <div v-else
                class="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-3xl border-4"
                :class="currentIndex === idx && isPlaying ? 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)]' : 'border-transparent'"
              >⚾</div>
              <div v-if="currentIndex === idx && isPlaying"
                class="absolute -top-1 -right-1 text-lg animate-bounce">🎵</div>
            </div>
            <div class="text-sm font-bold mt-2 text-center leading-tight">{{ player.name }}</div>
            <div class="text-xs text-slate-400">#{{ player.number }}</div>
          </button>
        </div>
      </div>

      <!-- 下半：播放區（Task 4 填入） -->
      <div class="flex-shrink-0 px-4 pb-6 pt-2" style="min-height: 45vh">
        <div class="flex items-center justify-center h-full text-slate-500 text-lg">
          點選球員開始播放
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabase.js'

const emit = defineEmits(['back'])

const CPBL_TEAMS = ['樂天桃猿', '統一獅', '富邦悍將', '味全龍', '台鋼雄鷹', '中信兄弟']
const teamLogos = {
  '樂天桃猿': '/logos/rakuten.png',
  '統一獅': '/logos/lions.png',
  '富邦悍將': '/logos/fubon.png',
  '味全龍': '/logos/dragons.png',
  '台鋼雄鷹': '/logos/hawks.png',
  '中信兄弟': '/logos/brothers.png',
}

const allPlayers = ref([])
const selectedTeam = ref(null)

onMounted(async () => {
  const { data } = await supabase
    .from('players')
    .select('id, name, number, photo, song, team')
    .order('team').order('number')
  allPlayers.value = data || []
})

const teamPlayers = computed(() =>
  selectedTeam.value
    ? allPlayers.value.filter(p => p.team === selectedTeam.value)
    : []
)

function playersWithSong(team) {
  return allPlayers.value.filter(p => p.team === team && p.song)
}

function selectTeam(team) {
  selectedTeam.value = team
}

const currentIndex = ref(-1)
const isPlaying = ref(false)
const audio = ref(null)

function startFrom(idx) {
  currentIndex.value = idx
  isPlaying.value = true
}
</script>
