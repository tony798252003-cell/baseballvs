<template>
  <div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2">
    <div class="bg-white rounded-2xl w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">

      <!-- Header -->
      <div class="px-5 py-3 bg-yellow-500 flex items-center justify-between flex-shrink-0">
        <div>
          <h2 class="text-lg font-black text-black">⚠️ 守備重組</h2>
          <p class="text-xs text-yellow-900">代打球員守位不符，請重新調整守備陣容後才能繼續</p>
        </div>
        <button @click="confirm" :disabled="problemCount > 0"
          class="px-5 py-2 bg-black text-yellow-400 rounded-xl font-black text-sm disabled:opacity-40 disabled:cursor-not-allowed transition">
          確認守備配置
        </button>
      </div>

      <!-- Body -->
      <div class="flex flex-1 min-h-0">

        <!-- Left: 9 slots -->
        <div class="w-52 border-r border-slate-200 overflow-y-auto p-2 flex flex-col gap-1 bg-slate-50 flex-shrink-0">
          <div v-for="(slot, idx) in slots" :key="idx"
            @click="selectSlot(idx)"
            :class="['p-2 rounded-xl border cursor-pointer transition flex items-center gap-2',
              selectedSlot === idx ? 'border-indigo-500 bg-indigo-50 shadow-sm' :
              slot.hasProblem ? 'border-red-400 bg-red-50 hover:border-red-500' :
              'border-slate-200 bg-white hover:border-slate-300']">
            <div class="font-black text-slate-400 text-sm w-5 flex-shrink-0">{{ idx + 1 }}</div>
            <img v-if="slot.player?.photo" :src="slot.player.photo" class="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-slate-200" />
            <div v-else class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs flex-shrink-0">⚾</div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-black truncate text-slate-800">{{ slot.player?.name || '空' }}</div>
              <div class="flex items-center gap-1 mt-0.5">
                <span class="text-xs px-1.5 py-0.5 rounded font-black"
                  :class="slot.hasProblem ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'">
                  {{ slot.position }}
                </span>
                <span v-if="slot.hasProblem" class="text-xs text-red-500">⚠️</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: player picker -->
        <div class="flex-1 flex flex-col overflow-hidden min-w-0">

          <!-- No slot selected -->
          <div v-if="selectedSlot < 0" class="flex-1 flex items-center justify-center">
            <div class="text-center text-slate-400">
              <div class="text-4xl mb-2">👈</div>
              <div class="font-bold">點選左側棒次來更換球員</div>
            </div>
          </div>

          <template v-else>
            <!-- Selected slot info -->
            <div class="px-4 py-2 border-b bg-indigo-50 flex items-center gap-3 flex-shrink-0">
              <div class="font-black text-indigo-700 text-sm">第 {{ selectedSlot + 1 }} 棒</div>
              <span class="px-2 py-0.5 rounded-lg bg-indigo-200 text-indigo-800 font-black text-xs">
                守位需求：{{ slots[selectedSlot].position }}
              </span>
              <div class="text-xs text-slate-500">目前：{{ slots[selectedSlot].player?.name }}</div>
              <span v-if="slots[selectedSlot].hasProblem" class="text-xs text-red-500 font-bold ml-auto">⚠️ 守位不符</span>
            </div>

            <!-- League filter -->
            <div class="flex gap-1 px-3 pt-2 flex-wrap flex-shrink-0">
              <button v-for="l in ['一軍', '二軍', 'coach', 'all']" :key="l"
                @click="pickerLeague = l; pickerTeam = null"
                :class="['px-3 py-1 rounded-full text-xs font-bold border transition cursor-pointer',
                  pickerLeague === l ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300']">
                {{ l === 'all' ? '全部' : l === 'coach' ? '教練' : l }}
              </button>
            </div>

            <!-- Position filter -->
            <div class="flex gap-1 px-3 pt-1 pb-1 flex-wrap flex-shrink-0">
              <button @click="pickerPositionFilter = null"
                :class="['px-2 py-0.5 rounded-lg text-xs font-bold border transition cursor-pointer',
                  pickerPositionFilter === null ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-emerald-50 hover:border-emerald-400']">
                全部守位
              </button>
              <button v-for="pos in FIELDING_POSITIONS" :key="pos"
                @click="pickerPositionFilter = pos"
                :class="['px-2 py-0.5 rounded-lg text-xs font-bold border transition cursor-pointer',
                  pickerPositionFilter === pos ? 'bg-emerald-600 text-white border-emerald-600' :
                  pos === slots[selectedSlot].position ? 'bg-emerald-100 text-emerald-700 border-emerald-300' :
                  'bg-slate-100 text-slate-600 border-slate-200 hover:bg-emerald-50 hover:border-emerald-400']">
                {{ pos }}
              </button>
            </div>

            <!-- Team filter -->
            <div class="flex gap-1 px-3 pb-2 flex-wrap flex-shrink-0 border-b border-slate-100">
              <button @click="pickerTeam = null"
                :class="['px-2 py-1 rounded-lg text-xs font-bold border transition cursor-pointer',
                  pickerTeam === null ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-indigo-50']">
                全部隊伍
              </button>
              <button v-for="team in availableTeams" :key="team"
                @click="pickerTeam = team"
                :class="['px-2 py-1 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center gap-1',
                  pickerTeam === team ? 'ring-2 ring-indigo-400 bg-indigo-50 border-indigo-300' : 'bg-white text-slate-600 border-slate-200 hover:bg-indigo-50']">
                <img v-if="teamLogos?.[team]" :src="teamLogos[team]" class="w-5 h-5 object-contain" />
                <span>{{ team }}</span>
              </button>
            </div>

            <!-- Player grid -->
            <div class="flex-1 overflow-y-auto px-3 py-2">
              <div class="grid grid-cols-3 gap-2">
                <button v-for="player in filteredPickerPlayers" :key="player.name + player.number"
                  @click="selectPlayer(player)"
                  :class="['p-2 rounded-xl border text-left transition hover:shadow-md cursor-pointer',
                    isCurrentSlotPlayer(player) ? 'ring-2 ring-indigo-500 border-indigo-300 bg-indigo-50' :
                    isInOtherSlot(player) ? 'border-amber-300 bg-amber-50 hover:border-amber-400' :
                    'border-slate-200 bg-white hover:border-indigo-300']">
                  <div class="flex items-center gap-2 mb-1">
                    <img v-if="player.photo" :src="player.photo" class="w-10 h-10 rounded-full object-cover flex-shrink-0 border-2 border-slate-200" />
                    <div v-else class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm flex-shrink-0">⚾</div>
                    <div class="flex-1 min-w-0">
                      <div :class="['font-black leading-tight', player.name.length > 5 ? 'text-xs' : 'text-sm']">{{ player.name }}</div>
                      <div class="text-xs text-slate-400">#{{ player.number }}</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-1 flex-wrap">
                    <span class="text-xs px-1 rounded bg-slate-100 text-slate-600 font-bold">{{ player.mainPosition || '--' }}</span>
                    <span v-if="player.otherPositions" class="text-xs text-slate-400">{{ player.otherPositions }}</span>
                    <span v-if="isInOtherSlot(player)" class="text-xs px-1 rounded bg-amber-100 text-amber-700 font-bold ml-auto">⇄ 換位</span>
                  </div>
                </button>
              </div>
              <div v-if="filteredPickerPlayers.length === 0" class="text-center text-slate-400 py-10 font-bold">
                沒有符合條件的球員
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-2 border-t bg-slate-50 text-sm font-bold flex-shrink-0"
        :class="problemCount === 0 ? 'text-green-600' : 'text-red-500'">
        {{ problemCount === 0 ? '✅ 守備陣容完整，可以確認' : `⚠️ 還有 ${problemCount} 個守位問題需要修正` }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const FIELDING_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']
const PITCHER_POSITIONS = ['SP', 'RP', 'CP', 'P']
const CPBL_TEAMS = ['樂天桃猿', '統一獅', '富邦悍將', '味全龍', '台鋼雄鷹', '中信兄弟']

const props = defineProps({
  lineup: Array,
  lineupPositions: Array,
  pendingFills: Array,
  benchRoster: { type: Array, default: () => [] },
  teamLogos: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['confirm'])

function playerId(p) {
  return p?.id || (p?.name + p?.number)
}

function canPlayPosition(player, position) {
  if (!player) return false
  if (PITCHER_POSITIONS.includes(player.mainPosition)) return false
  if (position === 'DH') return true
  if (!player.mainPosition && !player.otherPositions) return true
  if (player.mainPosition === position) return true
  if (player.otherPositions) {
    return player.otherPositions.split('/').map(p => p.trim()).includes(position)
  }
  return false
}

// === 狀態 ===
const slots = ref(props.lineup.map((player, idx) => ({
  player,
  position: props.lineupPositions[idx] || '',
  hasProblem: false,
  errorMsg: '',
})))

const selectedSlot = ref(-1)
const pickerLeague = ref('一軍')
const pickerTeam = ref(null)
const pickerPositionFilter = ref(null)

// === 選擇棒次 ===
function selectSlot(idx) {
  selectedSlot.value = idx
  pickerPositionFilter.value = slots.value[idx]?.position || null
  pickerTeam.value = null
}

// === 可用球員（打線其他棒次 + 板凳） ===
const allAvailablePlayers = computed(() => {
  if (selectedSlot.value < 0) return []
  const assignedToOthers = new Set(
    slots.value.filter((_, i) => i !== selectedSlot.value).map(s => playerId(s.player)).filter(Boolean)
  )
  const lineupPlayers = props.lineup.filter(p => p)
  const bench = props.benchRoster.filter(p => !assignedToOthers.has(playerId(p)))
  const seen = new Set()
  return [...lineupPlayers, ...bench].filter(p => {
    const id = playerId(p)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
})

// 可用球隊清單
const availableTeams = computed(() => {
  const teams = new Set(allAvailablePlayers.value.map(p => p.team).filter(Boolean))
  return [
    ...CPBL_TEAMS.filter(t => teams.has(t)),
    ...[...teams].filter(t => !CPBL_TEAMS.includes(t))
  ]
})

// 篩選後的球員清單
const filteredPickerPlayers = computed(() => {
  let players = allAvailablePlayers.value

  if (pickerLeague.value === 'coach') {
    players = players.filter(p => p.isCoach)
  } else if (pickerLeague.value !== 'all') {
    players = players.filter(p => !p.isCoach && p.league === pickerLeague.value)
  }

  if (pickerTeam.value) {
    players = players.filter(p => p.team === pickerTeam.value)
  }

  if (pickerPositionFilter.value) {
    players = players.filter(p => canPlayPosition(p, pickerPositionFilter.value))
  }

  return players
})

function isInOtherSlot(player) {
  const id = playerId(player)
  return slots.value.some((s, i) => i !== selectedSlot.value && playerId(s.player) === id)
}

function isCurrentSlotPlayer(player) {
  if (selectedSlot.value < 0) return false
  return playerId(slots.value[selectedSlot.value]?.player) === playerId(player)
}

// === 選擇球員 ===
function selectPlayer(player) {
  const slotIdx = selectedSlot.value
  if (slotIdx < 0) return

  const otherSlotIdx = slots.value.findIndex((s, i) => i !== slotIdx && playerId(s.player) === playerId(player))

  if (otherSlotIdx >= 0) {
    // 已在其他棒次 → 互換
    const temp = slots.value[slotIdx].player
    slots.value[slotIdx].player = player
    slots.value[otherSlotIdx].player = temp
  } else {
    // 板凳球員 → 替換
    slots.value[slotIdx].player = player
  }

  validateAll()

  // 自動跳到下一個問題棒次
  const nextProblem = slots.value.findIndex((s, i) => i !== slotIdx && s.hasProblem)
  if (nextProblem >= 0) {
    selectSlot(nextProblem)
  }
}

function validateAll() {
  slots.value.forEach(slot => {
    slot.hasProblem = false
    slot.errorMsg = ''
    if (!slot.player || !slot.position) {
      slot.hasProblem = true
      slot.errorMsg = '未填完整'
      return
    }
    if (!canPlayPosition(slot.player, slot.position)) {
      slot.hasProblem = true
      slot.errorMsg = `${slot.player.name} 無法擔任 ${slot.position}`
    }
  })
}

validateAll()

const problemCount = computed(() => slots.value.filter(s => s.hasProblem).length)

function confirm() {
  if (problemCount.value > 0) return
  emit('confirm', {
    newLineup: slots.value.map(s => s.player),
    newPositions: slots.value.map(s => s.position),
  })
}

// 初始化：自動選第一個問題棒次
const firstProblem = slots.value.findIndex(s => s.hasProblem)
if (firstProblem >= 0) selectSlot(firstProblem)
</script>
