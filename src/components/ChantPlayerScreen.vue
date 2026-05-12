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

      <!-- 下半：播放區 -->
      <div class="flex-shrink-0 px-4 pb-6 pt-2" style="min-height: 45vh">
        <div v-if="currentIndex >= 0 && teamPlayers[currentIndex]"
          class="rounded-2xl bg-slate-800/90 backdrop-blur-md border border-slate-700/50 shadow-xl p-4 flex items-center gap-4">
          <img v-if="teamPlayers[currentIndex].photo"
            :src="teamPlayers[currentIndex].photo"
            :alt="teamPlayers[currentIndex].name"
            class="w-20 h-20 rounded-full object-cover flex-shrink-0 ring-2 ring-yellow-400/60 shadow-md" />
          <div v-else
            class="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-3xl flex-shrink-0 ring-2 ring-slate-600">⚾</div>
          <div class="flex-1 min-w-0">
            <div class="font-black text-xl text-white truncate leading-tight">{{ teamPlayers[currentIndex].name }}</div>
            <div class="text-slate-400 text-sm mt-0.5">#{{ teamPlayers[currentIndex].number }}</div>
            <div class="mt-3 bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div class="h-full bg-yellow-400 transition-all duration-500 rounded-full"
                :style="{ width: progressPercent + '%' }"></div>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <button @click="prevTrack" aria-label="上一首"
              class="w-12 h-12 rounded-full bg-slate-700 hover:bg-slate-600 active:bg-slate-500 flex items-center justify-center text-slate-300 hover:text-white transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-yellow-400">⏮</button>
            <button @click="togglePlay" :aria-label="isPlaying ? '暫停' : '播放'"
              class="w-14 h-14 rounded-full bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 flex items-center justify-center text-slate-900 text-xl font-bold transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-yellow-200 shadow-lg shadow-yellow-400/30">{{ isPlaying ? '⏸' : '▶' }}</button>
            <button @click="nextTrack" aria-label="下一首"
              class="w-12 h-12 rounded-full bg-slate-700 hover:bg-slate-600 active:bg-slate-500 flex items-center justify-center text-slate-300 hover:text-white transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-yellow-400">⏭</button>
          </div>
        </div>
        <div v-else class="flex items-center justify-center h-full text-slate-500 text-lg">
          點選球員開始播放
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
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
const progressPercent = ref(0)

const playableIndices = computed(() =>
  teamPlayers.value
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.song)
    .map(({ i }) => i)
)

function stopAudio() {
  if (audio.value) {
    audio.value.pause()
    audio.value.src = ''
    audio.value = null
  }
  isPlaying.value = false
  progressPercent.value = 0
}

function playAt(idx) {
  stopAudio()
  const player = teamPlayers.value[idx]
  if (!player?.song) { nextTrack(); return }
  currentIndex.value = idx
  const a = new Audio(player.song)
  audio.value = a
  a.ontimeupdate = () => {
    if (a.duration) progressPercent.value = (a.currentTime / a.duration) * 100
  }
  a.onended = () => nextTrack()
  a.play().catch(() => {})
  isPlaying.value = true
}

function startFrom(idx) {
  playAt(idx)
}

function togglePlay() {
  if (!audio.value) return
  if (isPlaying.value) {
    audio.value.pause()
    isPlaying.value = false
  } else {
    audio.value.play().catch(() => {})
    isPlaying.value = true
  }
}

function nextTrack() {
  if (playableIndices.value.length === 0) return
  const pos = playableIndices.value.indexOf(currentIndex.value)
  const next = playableIndices.value[(pos + 1) % playableIndices.value.length]
  playAt(next)
}

function prevTrack() {
  if (playableIndices.value.length === 0) return
  const pos = playableIndices.value.indexOf(currentIndex.value)
  if (pos === -1) { playAt(playableIndices.value[playableIndices.value.length - 1]); return }
  const prev = playableIndices.value[(pos - 1 + playableIndices.value.length) % playableIndices.value.length]
  playAt(prev)
}

watch(selectedTeam, () => {
  stopAudio()
  currentIndex.value = -1
})

onUnmounted(() => stopAudio())
</script>
