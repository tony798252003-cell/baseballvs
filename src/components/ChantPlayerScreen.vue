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
</script>
