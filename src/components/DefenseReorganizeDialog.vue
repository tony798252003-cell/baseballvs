<template>
  <div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
    <div class="bg-slate-800 rounded-2xl p-6 w-full max-w-2xl border border-yellow-500 max-h-[90vh] overflow-y-auto">
      <h2 class="text-xl font-black text-yellow-400 mb-1">⚠️ 守備重組</h2>
      <p class="text-slate-400 text-sm mb-4">代打球員守位不符，請重新調整守備陣容，補滿所有守位後才能繼續。</p>

      <div class="space-y-2">
        <div v-for="(slot, idx) in slots" :key="idx"
          :class="['flex items-center gap-3 p-3 rounded-lg border transition',
            slot.hasProblem ? 'border-red-500 bg-red-500/10' : 'border-slate-600 bg-slate-700']">
          <div class="w-8 text-slate-400 text-sm font-bold text-center">{{ idx + 1 }}</div>

          <!-- 球員選擇 -->
          <select v-model="slot.playerId" @change="onPlayerChange(idx, $event)"
            class="flex-1 bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400">
            <option value="">-- 選擇球員 --</option>
            <optgroup label="目前打線">
              <option v-for="p in lineupOptions(idx)" :key="p.id || (p.name + p.number)" :value="p.id || (p.name + p.number)">
                {{ p.name }} #{{ p.number }}
              </option>
            </optgroup>
            <optgroup label="板凳換入" v-if="benchOptions(idx).length > 0">
              <option v-for="p in benchOptions(idx)" :key="p.id || (p.name + p.number)" :value="p.id || (p.name + p.number)">
                {{ p.name }} #{{ p.number }}
              </option>
            </optgroup>
          </select>

          <!-- 守位選擇 -->
          <select v-model="slot.position" @change="validateAll"
            class="w-24 bg-slate-600 border border-slate-500 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-yellow-400">
            <option value="">--</option>
            <option v-for="pos in FIELDING_POSITIONS" :key="pos" :value="pos"
              :disabled="isPositionTaken(pos, idx)">
              {{ pos }}
            </option>
          </select>

          <div class="text-xs w-20" :class="slot.hasProblem ? 'text-red-400' : 'text-green-400'">
            {{ slot.hasProblem ? slot.errorMsg : '✓' }}
          </div>
        </div>
      </div>

      <div class="mt-4 text-sm" :class="problemCount === 0 ? 'text-green-400' : 'text-red-400'">
        {{ problemCount === 0 ? '✅ 守備陣容完整' : `⚠️ 還有 ${problemCount} 個問題需要修正` }}
      </div>

      <div class="flex justify-end mt-5">
        <button @click="confirm" :disabled="problemCount > 0"
          class="px-6 py-2 bg-yellow-500 text-black rounded-lg font-black hover:bg-yellow-400 transition disabled:opacity-40 disabled:cursor-not-allowed">
          確認守備配置
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const FIELDING_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']
const PITCHER_POSITIONS = ['SP', 'RP', 'CP', 'P']

const props = defineProps({
  lineup: Array,           // 目前打線（9人）
  lineupPositions: Array,  // 目前守位對應
  pendingFills: Array,     // 待補清單 [{batterIndex, requiredPosition}]
  benchRoster: { type: Array, default: () => [] },
})

const emit = defineEmits(['confirm'])

function playerId(p) {
  return p?.id || (p?.name + p?.number)
}

function canPlayPosition(player, position) {
  if (!player) return false
  if (position === 'DH') return !PITCHER_POSITIONS.includes(player.mainPosition)
  if (!player.mainPosition && !player.otherPositions) return true
  if (player.mainPosition === position) return true
  if (player.otherPositions) {
    return player.otherPositions.split('/').map(p => p.trim()).includes(position)
  }
  return false
}

const slots = ref(props.lineup.map((player, idx) => ({
  playerId: playerId(player),
  playerObj: player,
  position: props.lineupPositions[idx] || '',
  hasProblem: props.pendingFills.some(f => f.batterIndex === idx),
  errorMsg: '',
})))

// Run initial validation
function lineupOptions(currentIdx) {
  return props.lineup.filter((p, i) => p && i !== currentIdx)
}

function benchOptions(currentIdx) {
  const inSlots = new Set(slots.value.filter((_, i) => i !== currentIdx).map(s => s.playerId))
  return props.benchRoster.filter(p => !inSlots.has(playerId(p)))
}

function isPositionTaken(pos, currentIdx) {
  return slots.value.some((s, i) => i !== currentIdx && s.position === pos)
}

function onPlayerChange(idx, event) {
  const id = event.target.value
  const fromLineup = props.lineup.find(p => playerId(p) === id)
  const fromBench = props.benchRoster.find(p => playerId(p) === id)
  slots.value[idx].playerObj = fromLineup || fromBench || null
  validateAll()
}

function validateAll() {
  const usedPositions = new Set()
  slots.value.forEach(slot => {
    slot.hasProblem = false
    slot.errorMsg = ''
    if (!slot.playerId || !slot.position) {
      slot.hasProblem = true
      slot.errorMsg = '未填完整'
      return
    }
    if (usedPositions.has(slot.position)) {
      slot.hasProblem = true
      slot.errorMsg = '守位重複'
    } else {
      usedPositions.add(slot.position)
    }
    if (slot.playerObj && !canPlayPosition(slot.playerObj, slot.position)) {
      slot.hasProblem = true
      slot.errorMsg = '守位不符'
    }
  })
}

validateAll()

const problemCount = computed(() => slots.value.filter(s => s.hasProblem).length)

function confirm() {
  if (problemCount.value > 0) return
  emit('confirm', {
    newLineup: slots.value.map(s => s.playerObj),
    newPositions: slots.value.map(s => s.position),
  })
}
</script>
