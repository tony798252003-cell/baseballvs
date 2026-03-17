<template>
  <div class="w-full h-full bg-slate-900 text-white flex flex-col overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 flex-shrink-0">
      <div class="flex items-center gap-3">
        <button @click="$emit('back')" class="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg text-sm transition">← 返回</button>
        <h1 class="text-xl font-bold">⚙️ 球員資料設定</h1>
      </div>
      <div class="text-slate-400 text-sm">未設定音樂：{{ unmappedPlayers.length }} 人</div>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-slate-700 flex-shrink-0">
      <button v-for="tab in tabs" :key="tab.id"
        @click="activeTab = tab.id"
        :class="['px-6 py-3 text-sm font-bold transition border-b-2', activeTab === tab.id ? 'border-yellow-400 text-yellow-400' : 'border-transparent text-slate-400 hover:text-white']">
        {{ tab.label }}
        <span v-if="tab.id === 'unmapped'" class="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{{ unmappedPlayers.length }}</span>
      </button>
    </div>

    <!-- 未設定音樂 tab -->
    <div v-if="activeTab === 'unmapped'" class="flex-1 overflow-hidden flex gap-4 p-4">
      <!-- 左：CSV 未 map 球員 -->
      <div class="w-1/2 flex flex-col gap-3">
        <div class="text-sm text-slate-400 font-bold">Google Sheet 有音樂但未對應到資料庫的球員</div>
        <div class="flex-1 overflow-y-auto space-y-2">
          <div v-for="p in csvUnmatched" :key="p.name + p.number"
            @click="selectCsvPlayer(p)"
            :class="['p-3 rounded-lg cursor-pointer border transition', selectedCsvPlayer?.name === p.name && selectedCsvPlayer?.number === p.number ? 'bg-yellow-500/20 border-yellow-500' : 'bg-slate-800 border-slate-700 hover:border-slate-500']">
            <div class="font-bold">{{ p.name }} <span class="text-slate-400 text-sm">#{{ p.number }}</span></div>
            <div class="text-xs text-slate-400 truncate mt-1">{{ p.song }}</div>
          </div>
        </div>
      </div>

      <!-- 右：搜尋 DB 球員配對 -->
      <div class="w-1/2 flex flex-col gap-3">
        <div class="text-sm text-slate-400 font-bold">
          {{ selectedCsvPlayer ? `配對：${selectedCsvPlayer.name} #${selectedCsvPlayer.number}` : '點選左側球員後，在下方搜尋對應的資料庫球員' }}
        </div>
        <input v-model="searchQuery" placeholder="搜尋球員姓名..."
          class="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400" />
        <div class="flex-1 overflow-y-auto space-y-2">
          <div v-for="p in filteredDbPlayers" :key="p.id"
            :class="['p-3 rounded-lg border transition', selectedCsvPlayer ? 'cursor-pointer hover:border-green-500' : 'opacity-50 cursor-not-allowed', 'bg-slate-800 border-slate-700']"
            @click="selectedCsvPlayer && mapPlayers(p)">
            <div class="flex items-center justify-between">
              <div>
                <span class="font-bold">{{ p.name }}</span>
                <span class="text-slate-400 text-sm ml-2">#{{ p.number }}</span>
                <span class="text-xs ml-2 px-1.5 py-0.5 rounded" :class="p.song ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'">
                  {{ p.song ? '有音樂' : '無音樂' }}
                </span>
              </div>
              <span class="text-xs text-slate-500">{{ p.team }}</span>
            </div>
            <div v-if="p.song" class="text-xs text-slate-500 truncate mt-1">{{ p.song }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 全部球員 tab -->
    <div v-if="activeTab === 'all'" class="flex-1 overflow-hidden flex flex-col gap-3 p-4">
      <div class="flex gap-3">
        <input v-model="searchQuery" placeholder="搜尋球員姓名..."
          class="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400" />
        <select v-model="filterTeam" class="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="">所有隊伍</option>
          <option v-for="t in teams" :key="t">{{ t }}</option>
        </select>
      </div>
      <div class="flex-1 overflow-y-auto">
        <table class="w-full text-sm">
          <thead class="text-slate-400 text-xs uppercase sticky top-0 bg-slate-900">
            <tr>
              <th class="text-left py-2 px-3">球員</th>
              <th class="text-left py-2 px-3">隊伍</th>
              <th class="text-left py-2 px-3">守位</th>
              <th class="text-left py-2 px-3">音樂</th>
              <th class="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in filteredAllPlayers" :key="p.id"
              class="border-t border-slate-800 hover:bg-slate-800/50">
              <td class="py-2 px-3">
                <span class="font-bold">{{ p.name }}</span>
                <span class="text-slate-500 ml-2">#{{ p.number }}</span>
              </td>
              <td class="py-2 px-3 text-slate-400">{{ p.team }}</td>
              <td class="py-2 px-3">
                <span class="text-xs bg-slate-700 px-2 py-0.5 rounded">{{ p.main_position || '—' }}</span>
              </td>
              <td class="py-2 px-3">
                <span v-if="p.song" class="text-xs text-green-400">✓ 有音樂</span>
                <span v-else class="text-xs text-slate-500">—</span>
              </td>
              <td class="py-2 px-3">
                <button @click="editPlayer(p)" class="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded transition">編輯</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 編輯 modal -->
    <div v-if="editingPlayer" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50" @click.self="editingPlayer = null">
      <div class="bg-slate-800 rounded-2xl p-6 w-full max-w-lg border border-slate-600 max-h-[90vh] overflow-y-auto">
        <h2 class="text-lg font-bold mb-4">編輯球員資料</h2>
        <div class="space-y-3">
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="text-xs text-slate-400 mb-1 block">姓名</label>
              <input v-model="editForm.name" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400" />
            </div>
            <div class="w-24">
              <label class="text-xs text-slate-400 mb-1 block">背號</label>
              <input v-model="editForm.number" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400" />
            </div>
          </div>
          <div>
            <label class="text-xs text-slate-400 mb-1 block">球隊</label>
            <select v-model="editForm.team" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400">
              <option value="">-- 選擇球隊 --</option>
              <option v-for="t in teams" :key="t">{{ t }}</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-slate-400 mb-1 block">主守位</label>
            <select v-model="editForm.main_position" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400">
              <option value="">-- 選擇守位 --</option>
              <option v-for="pos in allPositions" :key="pos">{{ pos }}</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-slate-400 mb-1 block">其他守位（可複選）</label>
            <div class="flex flex-wrap gap-2">
              <label v-for="pos in allPositions" :key="pos"
                :class="['flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition select-none',
                  editForm.otherPositionsArr.includes(pos)
                    ? 'bg-yellow-500/20 border-yellow-500 text-yellow-300'
                    : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-400']">
                <input type="checkbox" class="hidden" :value="pos" v-model="editForm.otherPositionsArr" />
                {{ pos }}
              </label>
            </div>
          </div>
          <div>
            <label class="text-xs text-slate-400 mb-1 block">音樂連結 (song)</label>
            <input v-model="editForm.song" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400" placeholder="https://..." />
          </div>
          <div>
            <label class="text-xs text-slate-400 mb-1 block">Emoji</label>
            <input v-model="editForm.emoji" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400" />
          </div>
          <div>
            <label class="text-xs text-slate-400 mb-1 block">Intro 文字</label>
            <textarea v-model="editForm.intro" rows="2" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400 resize-none"></textarea>
          </div>
        </div>
        <div class="flex gap-3 mt-5">
          <button @click="confirmDelete" class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-bold transition">刪除球員</button>
          <div class="flex-1"></div>
          <button @click="editingPlayer = null" class="px-4 py-2 bg-slate-700 rounded-lg text-sm hover:bg-slate-600 transition">取消</button>
          <button @click="saveEdit" :disabled="saving" class="px-4 py-2 bg-yellow-500 text-black rounded-lg text-sm font-bold hover:bg-yellow-400 transition disabled:opacity-50">
            {{ saving ? '儲存中...' : '儲存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 刪除確認 modal -->
    <div v-if="deletingPlayer" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[60]">
      <div class="bg-slate-800 rounded-2xl p-6 w-full max-w-sm border border-red-600">
        <h2 class="text-lg font-bold mb-2">確認刪除</h2>
        <p class="text-slate-300 text-sm mb-5">確定要刪除 <span class="text-white font-bold">{{ deletingPlayer.name }} #{{ deletingPlayer.number }}</span>？此操作無法復原。</p>
        <div class="flex gap-3 justify-end">
          <button @click="deletingPlayer = null" class="px-4 py-2 bg-slate-700 rounded-lg text-sm hover:bg-slate-600 transition">取消</button>
          <button @click="deletePlayer" :disabled="saving" class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-bold transition disabled:opacity-50">
            {{ saving ? '刪除中...' : '確認刪除' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 嗆斯曲 tab -->
    <div v-if="activeTab === 'chants'" class="flex-1 overflow-hidden flex flex-col gap-4 p-4">
      <!-- 新增表單 -->
      <div class="flex gap-3 items-end">
        <div>
          <label class="text-xs text-slate-400 mb-1 block">球隊</label>
          <select v-model="chantForm.team" class="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400">
            <option value="">-- 選擇 --</option>
            <option v-for="t in teams" :key="t">{{ t }}</option>
          </select>
        </div>
        <div class="w-36">
          <label class="text-xs text-slate-400 mb-1 block">名稱</label>
          <input v-model="chantForm.name" class="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400" placeholder="制霸天下" />
        </div>
        <div class="flex-1">
          <label class="text-xs text-slate-400 mb-1 block">URL</label>
          <input v-model="chantForm.url" class="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400" placeholder="https://..." />
        </div>
        <button @click="addChant" :disabled="saving" class="px-4 py-2 bg-yellow-500 text-black rounded-lg text-sm font-bold hover:bg-yellow-400 transition disabled:opacity-50 whitespace-nowrap">新增</button>
      </div>
      <!-- 列表 -->
      <div class="flex-1 overflow-y-auto">
        <div v-for="(chants, team) in chantsByTeam" :key="team" class="mb-4">
          <div class="text-xs text-slate-400 font-bold uppercase mb-2">{{ team }}</div>
          <div v-for="c in chants" :key="c.id" class="flex items-center gap-3 py-2 px-3 bg-slate-800 rounded-lg border border-slate-700 mb-1.5">
            <span class="font-bold text-sm flex-1">{{ c.name }}</span>
            <span class="text-xs text-slate-500 truncate max-w-xs">{{ c.url }}</span>
            <button @click="deleteChant(c)" class="text-xs text-red-400 hover:text-red-300 transition">刪除</button>
          </div>
        </div>
        <div v-if="Object.keys(chantsByTeam).length === 0" class="text-slate-500 text-sm text-center py-8">尚無嗆斯曲</div>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast" class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-full text-sm font-bold shadow-xl z-50">
      {{ toast }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabase.js'

const emit = defineEmits(['back'])

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQxWiFy6zh81UBv2yO1mwLCbPDMrm_3Iw77q9LrPbmb4C5roLCR3simgX-NLTgYPgUvqMv1nflJ8V-9/pub?gid=112417298&single=true&output=csv'

const tabs = [
  { id: 'unmapped', label: '🔗 未對應音樂' },
  { id: 'all', label: '📋 所有球員' },
  { id: 'chants', label: '🎵 球隊嗆斯曲' },
]
const activeTab = ref('unmapped')
const searchQuery = ref('')
const filterTeam = ref('')
const toast = ref(null)
const saving = ref(false)

// 資料
const dbPlayers = ref([])
const csvUnmatched = ref([])
const selectedCsvPlayer = ref(null)
const editingPlayer = ref(null)
const editForm = ref({})
const deletingPlayer = ref(null)

// 嗆斯曲
const teamChantsData = ref([])
const chantForm = ref({ team: '', name: '', url: '' })
const chantsByTeam = computed(() => {
  const map = {}
  for (const c of teamChantsData.value) {
    if (!map[c.team]) map[c.team] = []
    map[c.team].push(c)
  }
  return map
})

const allPositions = ['SP', 'RP', 'CP', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']

const teams = computed(() => [...new Set(dbPlayers.value.map(p => p.team).filter(Boolean))].sort())

const unmappedPlayers = computed(() => dbPlayers.value.filter(p => !p.song))

const filteredDbPlayers = computed(() => {
  let list = dbPlayers.value
  if (searchQuery.value) list = list.filter(p => p.name.includes(searchQuery.value))
  return list
})

const filteredAllPlayers = computed(() => {
  let list = dbPlayers.value
  if (searchQuery.value) list = list.filter(p => p.name.includes(searchQuery.value))
  if (filterTeam.value) list = list.filter(p => p.team === filterTeam.value)
  return list
})

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes }
    else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = '' }
    else { current += line[i] }
  }
  result.push(current.trim())
  return result
}

async function loadData() {
  // 載入 DB 球員
  const { data } = await supabase.from('players').select('id, name, number, team, main_position, song, emoji, intro, other_positions').order('team').order('name')
  dbPlayers.value = data || []

  // 載入嗆斯曲
  const { data: chants } = await supabase.from('team_chants').select('*').order('team').order('name')
  teamChantsData.value = chants || []

  // 載入 CSV 並找出沒 map 的
  try {
    const res = await fetch(CSV_URL)
    const text = await res.text()
    const lines = text.trim().split('\n').slice(1)
    const dbMap = new Set(data.map(p => `${p.name}-${p.number}`))

    csvUnmatched.value = lines.map(line => {
      const v = parseCSVLine(line)
      return { name: v[0]?.trim(), number: v[1]?.trim(), song: v[4]?.trim(), emoji: v[5]?.trim(), intro: v[6]?.trim() }
    }).filter(p => p.name && p.song && !dbMap.has(`${p.name}-${p.number}`))
  } catch (e) {
    console.error('CSV 載入失敗', e)
  }
}

function selectCsvPlayer(p) {
  selectedCsvPlayer.value = p
  searchQuery.value = p.name
}

async function mapPlayers(dbPlayer) {
  if (!selectedCsvPlayer.value) return
  const update = {}
  if (selectedCsvPlayer.value.song) update.song = selectedCsvPlayer.value.song
  if (selectedCsvPlayer.value.emoji) update.emoji = selectedCsvPlayer.value.emoji
  if (selectedCsvPlayer.value.intro) update.intro = selectedCsvPlayer.value.intro

  const { error } = await supabase.from('players').update(update).eq('id', dbPlayer.id)
  if (error) { showToast('❌ 儲存失敗'); return }

  // 更新本地資料
  const idx = dbPlayers.value.findIndex(p => p.id === dbPlayer.id)
  if (idx >= 0) Object.assign(dbPlayers.value[idx], update)
  csvUnmatched.value = csvUnmatched.value.filter(p => !(p.name === selectedCsvPlayer.value.name && p.number === selectedCsvPlayer.value.number))
  selectedCsvPlayer.value = null
  searchQuery.value = ''
  showToast(`✅ 已對應 ${dbPlayer.name}`)
}

function editPlayer(p) {
  editingPlayer.value = p
  const otherArr = p.other_positions ? p.other_positions.split('/').map(s => s.trim()).filter(Boolean) : []
  editForm.value = {
    name: p.name || '',
    number: p.number || '',
    team: p.team || '',
    main_position: p.main_position || '',
    otherPositionsArr: otherArr,
    song: p.song || '',
    emoji: p.emoji || '',
    intro: p.intro || '',
  }
}

async function saveEdit() {
  saving.value = true
  const update = {
    name: editForm.value.name,
    number: editForm.value.number,
    team: editForm.value.team,
    main_position: editForm.value.main_position,
    other_positions: editForm.value.otherPositionsArr.join('/') || null,
    song: editForm.value.song || null,
    emoji: editForm.value.emoji || null,
    intro: editForm.value.intro || null,
  }
  const { error } = await supabase.from('players').update(update).eq('id', editingPlayer.value.id)
  saving.value = false
  if (error) { showToast('❌ 儲存失敗'); return }
  Object.assign(editingPlayer.value, update)
  editingPlayer.value = null
  showToast('✅ 已儲存')
}

function confirmDelete() {
  deletingPlayer.value = editingPlayer.value
}

async function deletePlayer() {
  saving.value = true
  const { error } = await supabase.from('players').delete().eq('id', deletingPlayer.value.id)
  saving.value = false
  if (error) { showToast('❌ 刪除失敗'); return }
  dbPlayers.value = dbPlayers.value.filter(p => p.id !== deletingPlayer.value.id)
  deletingPlayer.value = null
  editingPlayer.value = null
  showToast('🗑️ 已刪除')
}

async function addChant() {
  if (!chantForm.value.team || !chantForm.value.name || !chantForm.value.url) return
  saving.value = true
  const { data, error } = await supabase.from('team_chants').insert(chantForm.value).select().single()
  saving.value = false
  if (error) { showToast('❌ 新增失敗'); return }
  teamChantsData.value.push(data)
  chantForm.value = { team: '', name: '', url: '' }
  showToast('✅ 已新增')
}

async function deleteChant(c) {
  const { error } = await supabase.from('team_chants').delete().eq('id', c.id)
  if (error) { showToast('❌ 刪除失敗'); return }
  teamChantsData.value = teamChantsData.value.filter(x => x.id !== c.id)
  showToast('🗑️ 已刪除')
}

function showToast(msg) {
  toast.value = msg
  setTimeout(() => toast.value = null, 3000)
}

onMounted(loadData)
</script>
