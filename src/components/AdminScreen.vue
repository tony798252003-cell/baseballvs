<template>
  <AdminLogin v-if="session === null" @back="emit('back')" />
  <div v-else-if="session" class="w-full h-full bg-slate-900 text-white flex flex-col overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 flex-shrink-0">
      <div class="flex items-center gap-3">
        <button @click="$emit('back')" class="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg text-sm transition">← 返回</button>
        <h1 class="text-xl font-bold">⚙️ 球員資料設定</h1>
      </div>
      <div class="flex items-center gap-4">
        <div class="text-slate-400 text-sm">未設定音樂：{{ unmappedPlayers.length }} 人</div>
        <button @click="logout" class="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg text-sm transition">登出</button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-slate-700 flex-shrink-0">
      <button v-for="tab in tabs" :key="tab.id"
        @click="activeTab = tab.id"
        :class="['px-6 py-3 text-sm font-bold transition border-b-2', activeTab === tab.id ? 'border-yellow-400 text-yellow-400' : 'border-transparent text-slate-400 hover:text-white']">
        {{ tab.label }}
      </button>
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
      <!-- Dropbox 同步區塊 -->
      <div class="bg-slate-800 rounded-xl border border-slate-600 overflow-hidden flex-shrink-0">
        <button @click="dropboxSyncOpen = !dropboxSyncOpen"
          class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-700 transition">
          <span class="font-bold text-sm">☁️ Dropbox 同步</span>
          <span class="text-slate-400 text-xs">{{ dropboxSyncOpen ? '▲ 收折' : '▼ 展開' }}</span>
        </button>

        <div v-if="dropboxSyncOpen" class="px-4 pb-4 space-y-3 border-t border-slate-700">
          <div class="flex gap-2 pt-3">
            <input
              v-model="dropboxToken"
              type="password"
              placeholder="Dropbox Access Token"
              class="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400"
            />
          </div>
          <div class="flex gap-2">
            <input
              v-model="dropboxFolder"
              placeholder="資料夾路徑（如 /Music/Chance）"
              class="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400"
            />
            <button
              @click="syncFromDropbox"
              :disabled="dropboxSyncing"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition disabled:opacity-50 whitespace-nowrap"
            >
              {{ dropboxSyncing ? '讀取中...' : '同步' }}
            </button>
          </div>

          <div v-if="dropboxPreview.length > 0" class="space-y-2">
            <div class="flex items-center justify-between">
              <div class="text-sm font-bold text-green-400">找到 {{ dropboxPreview.length }} 首新應援曲：</div>
              <button @click="dropboxPreview.forEach(i => i.checked = !dropboxPreview.every(x => x.checked))"
                class="text-xs text-slate-400 hover:text-white transition">全選/取消</button>
            </div>
            <div v-for="item in dropboxPreview" :key="item.path"
              class="flex items-center gap-3 px-3 py-2 bg-slate-900 rounded-lg border border-slate-700">
              <input type="checkbox" v-model="item.checked" class="w-4 h-4 cursor-pointer" />
              <div class="flex-1">
                <span class="text-xs text-slate-400 mr-2">{{ item.team }}</span>
                <span class="text-sm font-bold">{{ item.name }}</span>
              </div>
            </div>
            <button
              @click="confirmDropboxAdd"
              :disabled="dropboxConfirming || dropboxPreview.filter(i => i.checked).length === 0"
              class="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold transition disabled:opacity-50"
            >
              {{ dropboxConfirming ? '新增中...' : `確認新增 ${dropboxPreview.filter(i => i.checked).length} 首` }}
            </button>
          </div>

          <div v-if="dropboxUnparsed.length > 0" class="space-y-1">
            <div class="text-xs text-yellow-400 font-bold">⚠ 無法解析（格式需為「球隊 - 歌名.mp3」）：</div>
            <div v-for="name in dropboxUnparsed" :key="name" class="text-xs text-slate-500 pl-2">{{ name }}</div>
          </div>
        </div>
      </div>
      <!-- 通用嗆斯曲 -->
      <div class="flex gap-3 items-end">
        <div class="flex-1">
          <label class="text-xs text-slate-400 mb-1 block">通用嗆斯曲 URL（球員沒有個人曲、也沒有球隊曲時播放）</label>
          <input v-model="genericChantUrl" class="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400" placeholder="https://..." />
        </div>
        <button @click="saveGenericChant" :disabled="saving" class="bg-yellow-400 text-slate-900 font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50">儲存</button>
      </div>
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

    <!-- 音樂狀態 tab -->
    <div v-if="activeTab === 'musicStatus'" class="flex-1 overflow-hidden flex flex-col gap-3 p-4">
      <!-- Dropbox 匯入區塊 -->
      <div class="bg-slate-800 rounded-xl border border-slate-600 overflow-hidden flex-shrink-0">
        <button @click="playerDropboxSyncOpen = !playerDropboxSyncOpen"
          class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-700 transition">
          <span class="font-bold text-sm">☁️ Dropbox 匯入</span>
          <span class="text-slate-400 text-xs">{{ playerDropboxSyncOpen ? '▲ 收折' : '▼ 展開' }}</span>
        </button>

        <div v-if="playerDropboxSyncOpen" class="px-4 pb-4 space-y-3 border-t border-slate-700">
          <div class="flex gap-2 pt-3">
            <input
              v-model="dropboxToken"
              type="password"
              placeholder="Dropbox Access Token"
              class="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400"
            />
          </div>
          <div class="flex gap-2">
            <input
              v-model="playerDropboxFolder"
              placeholder="資料夾路徑（如 /Music/Players）"
              class="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400"
            />
            <button
              @click="scanPlayerDropbox"
              :disabled="playerDropboxScanning"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition disabled:opacity-50 whitespace-nowrap"
            >
              {{ playerDropboxScanning ? '讀取中...' : '掃描' }}
            </button>
          </div>

          <div v-if="playerDropboxPreview.length > 0" class="space-y-2">
            <div class="text-sm font-bold text-green-400">找到 {{ playerDropboxPreview.length }} 筆可匯入：</div>
            <div v-for="item in playerDropboxPreview" :key="item.key"
              class="flex items-center gap-3 px-3 py-2 bg-slate-900 rounded-lg border border-slate-700">
              <input type="checkbox" v-model="item.checked" class="w-4 h-4 cursor-pointer" />
              <span :class="['text-xs px-2 py-0.5 rounded whitespace-nowrap', item.status === 'new' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400']">
                {{ item.status === 'new' ? `新增：${item.kind}` : `覆蓋：${item.kind}` }}
              </span>
              <div class="flex-1">
                <span class="text-xs text-slate-400 mr-2">{{ item.team }}</span>
                <span class="text-sm font-bold">{{ item.name }}</span>
                <div v-if="item.status === 'overwrite'" class="text-xs text-slate-500 truncate">目前：{{ item.currentValue }}</div>
              </div>
            </div>
            <button
              @click="confirmPlayerDropboxImport"
              :disabled="playerDropboxConfirming || playerDropboxPreview.filter(i => i.checked).length === 0"
              class="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold transition disabled:opacity-50"
            >
              {{ playerDropboxConfirming ? '匯入中...' : `確認匯入 ${playerDropboxPreview.filter(i => i.checked).length} 筆` }}
            </button>
          </div>

          <div v-if="playerDropboxUnparsed.length > 0" class="space-y-1">
            <div class="text-xs text-yellow-400 font-bold">⚠ 無法處理：</div>
            <div v-for="entry in playerDropboxUnparsed" :key="entry.name" class="text-xs text-slate-500 pl-2">{{ entry.name }} — {{ entry.reason }}</div>
          </div>
        </div>
      </div>

      <!-- 工具列 -->
      <div class="flex items-center gap-3 flex-shrink-0">
        <button
          @click="verifyAllMusic"
          :disabled="verifying"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition disabled:opacity-50"
        >
          {{ verifying ? `驗證中 ${verifyProgress} / ${verifyTotal}` : '🔍 全部驗證' }}
        </button>
        <select v-model="musicStatusFilter" class="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="">所有隊伍</option>
          <option v-for="t in teams" :key="t">{{ t }}</option>
        </select>
        <div class="text-xs text-slate-400 ml-auto">
          共 {{ musicStatusPlayers.length }} 人
          ・🔴 {{ musicStatusPlayers.filter(p => p._status === 'error').length }}
          ・⚫ {{ musicStatusPlayers.filter(p => p._status === 'no_song').length }}
          ・✅ {{ musicStatusPlayers.filter(p => p._status === 'ok').length }}
        </div>
      </div>

      <!-- 球員列表 -->
      <div class="flex-1 overflow-y-auto">
        <table class="w-full text-sm">
          <thead class="text-slate-400 text-xs uppercase sticky top-0 bg-slate-900">
            <tr>
              <th class="text-left py-2 px-3">球員</th>
              <th class="text-left py-2 px-3">隊伍</th>
              <th class="text-left py-2 px-3">狀態</th>
              <th class="text-left py-2 px-3">URL</th>
              <th class="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in musicStatusPlayers" :key="p.id"
              class="border-t border-slate-800 hover:bg-slate-800/50">
              <td class="py-2 px-3">
                <span class="font-bold">{{ p.name }}</span>
                <span class="text-slate-500 ml-2">#{{ p.number }}</span>
              </td>
              <td class="py-2 px-3 text-slate-400 text-xs">{{ p.team }}</td>
              <td class="py-2 px-3">
                <span v-if="p._status === 'ok'" class="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">✅ 正常</span>
                <span v-else-if="p._status === 'error'" class="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">🔴 壞掉</span>
                <span v-else-if="p._status === 'no_song'" class="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded">⚫ 無歌</span>
                <span v-else class="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded">待驗證</span>
              </td>
              <td class="py-2 px-3 text-xs text-slate-500 max-w-xs truncate">{{ p.song || '—' }}</td>
              <td class="py-2 px-3">
                <div class="flex gap-2 justify-end">
                  <button v-if="p.song"
                    @click="playPreview(p)"
                    :class="['text-xs px-2 py-1 rounded transition', previewingId === p.id ? 'bg-yellow-500 text-black' : 'bg-slate-700 hover:bg-slate-600 text-white']">
                    {{ previewingId === p.id ? '⏹ 停止' : '▶ 試播' }}
                  </button>
                  <button @click="editPlayer(p)" class="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded transition">編輯</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast" class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-full text-sm font-bold shadow-xl z-50">
      {{ toast }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { supabase } from '../lib/supabase.js'
import { fetchAllPages } from '../lib/fetchAllPages.js'
import AdminLogin from './AdminLogin.vue'

const emit = defineEmits(['back'])

const tabs = [
  { id: 'all', label: '📋 所有球員' },
  { id: 'chants', label: '🎵 球隊嗆斯曲' },
  { id: 'musicStatus', label: '🎧 音樂狀態' },
]
const activeTab = ref('all')
const searchQuery = ref('')
const filterTeam = ref('')
const toast = ref(null)
const session = ref(undefined) // undefined = 檢查中, null = 未登入
const saving = ref(false)

// 資料
const dbPlayers = ref([])
const editingPlayer = ref(null)
const editForm = ref({})
const deletingPlayer = ref(null)

// 音樂狀態
const musicStatusMap = ref({})   // { [playerId]: 'pending' | 'ok' | 'error' | 'no_song' }
const verifying = ref(false)
const verifyProgress = ref(0)
const verifyTotal = ref(0)
const previewingId = ref(null)
const previewAudio = ref(null)
const musicStatusFilter = ref('')

// 嗆斯曲
const teamChantsData = ref([])
const chantForm = ref({ team: '', name: '', url: '' })
const genericChantUrl = ref('')
const chantsByTeam = computed(() => {
  const map = {}
  for (const c of teamChantsData.value) {
    if (!map[c.team]) map[c.team] = []
    map[c.team].push(c)
  }
  return map
})

// Dropbox 同步
const dropboxToken = ref('')
const dropboxFolder = ref('/Music/Chance')
const dropboxSyncOpen = ref(false)
const dropboxSyncing = ref(false)
const dropboxPreview = ref([])   // [{ team, name, path, checked }]
const dropboxConfirming = ref(false)
const dropboxUnparsed = ref([])  // 無法解析的檔名

// 球員應援歌 Dropbox 匯入
const playerDropboxFolder = ref('/Music/Players')
const playerDropboxSyncOpen = ref(false)
const playerDropboxScanning = ref(false)
const playerDropboxPreview = ref([])    // [{ key, team, name, kind: 'song'|'intro', status: 'new'|'overwrite', dropboxPath, currentValue, checked }]
const playerDropboxUnparsed = ref([])   // [{ name, reason }]
const playerDropboxConfirming = ref(false)

const allPositions = ['SP', 'RP', 'CP', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']

const teams = computed(() => [...new Set(dbPlayers.value.map(p => p.team).filter(Boolean))].sort())

const unmappedPlayers = computed(() => dbPlayers.value.filter(p => !p.song))

const filteredAllPlayers = computed(() => {
  let list = dbPlayers.value
  if (searchQuery.value) list = list.filter(p => p.name.includes(searchQuery.value))
  if (filterTeam.value) list = list.filter(p => p.team === filterTeam.value)
  return list
})

const musicStatusPlayers = computed(() => {
  const order = { error: 0, no_song: 1, pending: 2, ok: 3 }
  let list = dbPlayers.value.map(p => ({
    ...p,
    _status: musicStatusMap.value[p.id] ?? (p.song ? 'pending' : 'no_song')
  }))
  if (musicStatusFilter.value) list = list.filter(p => p.team === musicStatusFilter.value)
  return list.sort((a, b) => (order[a._status] ?? 4) - (order[b._status] ?? 4))
})

async function loadData() {
  // 載入 DB 球員
  dbPlayers.value = await fetchAllPages(() => supabase.from('players').select('id, name, number, team, main_position, song, emoji, intro, other_positions').order('team').order('name').order('id'))

  // 載入嗆斯曲
  const { data: chants } = await supabase.from('team_chants').select('*').order('team').order('name')
  teamChantsData.value = chants || []

  const { data: setting } = await supabase.from('app_settings').select('value').eq('key', 'generic_chant_url').maybeSingle()
  genericChantUrl.value = setting?.value || ''
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
  const { data, error } = await supabase.from('players').update(update).eq('id', editingPlayer.value.id).select('id')
  saving.value = false
  if (error || !data?.length) { showToast('❌ 儲存失敗'); return }
  Object.assign(editingPlayer.value, update)
  if (editingPlayer.value?.id) {
    musicStatusMap.value[editingPlayer.value.id] = update.song ? 'pending' : 'no_song'
  }
  editingPlayer.value = null
  showToast('✅ 已儲存')
}

function confirmDelete() {
  deletingPlayer.value = editingPlayer.value
}

async function deletePlayer() {
  saving.value = true
  const { data, error } = await supabase.from('players').delete().eq('id', deletingPlayer.value.id).select('id')
  saving.value = false
  if (error || !data?.length) { showToast('❌ 刪除失敗'); return }
  dbPlayers.value = dbPlayers.value.filter(p => p.id !== deletingPlayer.value.id)
  deletingPlayer.value = null
  editingPlayer.value = null
  showToast('🗑️ 已刪除')
}

async function syncFromDropbox() {
  if (!dropboxToken.value.trim()) {
    showToast('❌ 請輸入 Access Token')
    return
  }
  dropboxSyncing.value = true
  dropboxPreview.value = []
  dropboxUnparsed.value = []

  try {
    const listRes = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${dropboxToken.value.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: dropboxFolder.value }),
    })

    if (listRes.status === 401) {
      showToast('❌ Token 無效或已過期')
      return
    }
    if (!listRes.ok) {
      showToast('❌ Dropbox 連線失敗')
      return
    }

    const listData = await listRes.json()
    const mp3Files = listData.entries.filter(e => e.name.toLowerCase().endsWith('.mp3'))

    const existingKeys = new Set(
      teamChantsData.value.map(c => `${c.team.trim()}__${c.name.trim()}`)
    )

    const newItems = []
    const unparsed = []

    for (const file of mp3Files) {
      const separatorIdx = file.name.indexOf(' - ')
      if (separatorIdx === -1) {
        unparsed.push(file.name)
        continue
      }
      const team = file.name.slice(0, separatorIdx).trim()
      const nameWithExt = file.name.slice(separatorIdx + 3).trim()
      const name = nameWithExt.replace(/\.mp3$/i, '').trim()
      const key = `${team}__${name}`
      if (!existingKeys.has(key)) {
        newItems.push({ team, name, path: file.path_lower, checked: true })
      }
    }

    dropboxPreview.value = newItems
    dropboxUnparsed.value = unparsed

    if (newItems.length === 0 && unparsed.length === 0) {
      showToast('✅ 已是最新，無新增項目')
    }
  } catch (e) {
    showToast('❌ Dropbox 連線失敗')
  } finally {
    dropboxSyncing.value = false
  }
}

async function confirmDropboxAdd() {
  const selected = dropboxPreview.value.filter(item => item.checked)
  if (selected.length === 0) return

  dropboxConfirming.value = true
  let added = 0
  let failed = 0

  try {
    for (const item of selected) {
      try {
        let url = ''
        const linkRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${dropboxToken.value.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            path: item.path,
            settings: { requested_visibility: 'public' },
          }),
        })

        if (linkRes.status === 409) {
          const errData = await linkRes.json()
          url = errData?.error?.shared_link_already_exists?.metadata?.url || ''
        } else if (linkRes.ok) {
          const linkData = await linkRes.json()
          url = linkData.url || ''
        } else {
          failed++
          continue
        }

        if (!url) { failed++; continue }

        if (url.includes('?dl=0')) {
          url = url.replace('?dl=0', '?raw=1')
        } else {
          url = url + (url.includes('?') ? '&raw=1' : '?raw=1')
        }

        const { data: inserted, error } = await supabase
          .from('team_chants')
          .insert({ team: item.team, name: item.name, url })
          .select()
          .single()

        if (error) {
          console.error(`[Dropbox Sync] insert failed for "${item.team} - ${item.name}":`, error)
          failed++
          continue
        }
        teamChantsData.value.push(inserted)
        added++
      } catch (e) {
        console.error(`[Dropbox Sync] exception for "${item.team} - ${item.name}":`, e)
        failed++
      }
    }
  } finally {
    dropboxConfirming.value = false
    dropboxPreview.value = []
    dropboxUnparsed.value = []
  }

  if (added === 0 && failed > 0) {
    showToast(`❌ 新增失敗（${failed} 筆）`)
  } else if (failed > 0) {
    showToast(`✅ 已新增 ${added} 首（⚠ ${failed} 筆失敗）`)
  } else {
    showToast(`✅ 已新增 ${added} 首應援曲`)
  }
}

function parsePlayerDropboxFilename(filename) {
  const base = filename.replace(/\.mp3$/i, '')
  const introMatch = base.match(/^(.*?)\s*-\s*(.+?)\s*-\s*intro$/i)
  if (introMatch) return { team: introMatch[1].trim(), name: introMatch[2].trim(), kind: 'intro' }
  const songMatch = base.match(/^(.*?)\s*-\s*(.+)$/)
  if (songMatch) return { team: songMatch[1].trim(), name: songMatch[2].trim(), kind: 'song' }
  return null
}

async function scanPlayerDropbox() {
  if (!dropboxToken.value.trim()) {
    showToast('❌ 請輸入 Access Token')
    return
  }
  playerDropboxScanning.value = true
  playerDropboxPreview.value = []
  playerDropboxUnparsed.value = []

  try {
    const listRes = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dropboxToken.value.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: playerDropboxFolder.value }),
    })

    if (listRes.status === 401) { showToast('❌ Token 無效或已過期'); return }
    if (!listRes.ok) { showToast('❌ Dropbox 連線失敗'); return }

    const listData = await listRes.json()
    const mp3Files = listData.entries.filter(e => e.name.toLowerCase().endsWith('.mp3'))

    const preview = []
    const unparsed = []

    for (const file of mp3Files) {
      const parsed = parsePlayerDropboxFilename(file.name)
      if (!parsed) { unparsed.push({ name: file.name, reason: '格式錯誤（需為「球隊 - 姓名.mp3」或「球隊 - 姓名 - Intro.mp3」）' }); continue }

      const matches = dbPlayers.value.filter(p => p.team === parsed.team && p.name === parsed.name)
      if (matches.length === 0) { unparsed.push({ name: file.name, reason: `找不到球員（${parsed.team} - ${parsed.name}）` }); continue }
      if (matches.length > 1) { unparsed.push({ name: file.name, reason: `同隊同名有 ${matches.length} 筆，需手動處理` }); continue }

      const player = matches[0]
      const currentValue = parsed.kind === 'intro' ? player.intro : player.song
      preview.push({
        key: file.path_lower,
        playerId: player.id,
        team: parsed.team,
        name: parsed.name,
        kind: parsed.kind,
        status: currentValue ? 'overwrite' : 'new',
        dropboxPath: file.path_lower,
        currentValue: currentValue || '',
        checked: !currentValue,
      })
    }

    playerDropboxPreview.value = preview
    playerDropboxUnparsed.value = unparsed

    if (preview.length === 0 && unparsed.length === 0) {
      showToast('✅ 已是最新，無新增項目')
    }
  } catch (e) {
    showToast('❌ Dropbox 連線失敗')
  } finally {
    playerDropboxScanning.value = false
  }
}

async function confirmPlayerDropboxImport() {
  const selected = playerDropboxPreview.value.filter(item => item.checked)
  if (selected.length === 0) return

  playerDropboxConfirming.value = true
  let added = 0
  let failed = 0

  try {
    for (const item of selected) {
      try {
        let url = ''
        const linkRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${dropboxToken.value.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path: item.dropboxPath, settings: { requested_visibility: 'public' } }),
        })

        if (linkRes.status === 409) {
          const errData = await linkRes.json()
          url = errData?.error?.shared_link_already_exists?.metadata?.url || ''
        } else if (linkRes.ok) {
          const linkData = await linkRes.json()
          url = linkData.url || ''
        } else {
          failed++
          continue
        }

        if (!url) { failed++; continue }
        url = url.includes('?dl=0') ? url.replace('?dl=0', '?raw=1') : url + (url.includes('?') ? '&raw=1' : '?raw=1')

        const field = item.kind === 'intro' ? 'intro' : 'song'
        const { data: updated, error } = await supabase.from('players').update({ [field]: url }).eq('id', item.playerId).select('id')
        if (error || !updated?.length) { console.error(`[Player Dropbox Sync] update failed for "${item.team} - ${item.name}":`, error); failed++; continue }

        const idx = dbPlayers.value.findIndex(p => p.id === item.playerId)
        if (idx >= 0) dbPlayers.value[idx][field] = url
        if (field === 'song') musicStatusMap.value[item.playerId] = 'pending'
        added++
      } catch (e) {
        console.error(`[Player Dropbox Sync] exception for "${item.team} - ${item.name}":`, e)
        failed++
      }
    }
  } finally {
    playerDropboxConfirming.value = false
    playerDropboxPreview.value = []
    playerDropboxUnparsed.value = []
  }

  if (added === 0 && failed > 0) {
    showToast(`❌ 匯入失敗（${failed} 筆）`)
  } else if (failed > 0) {
    showToast(`✅ 已匯入 ${added} 首（⚠ ${failed} 筆失敗）`)
  } else {
    showToast(`✅ 已匯入 ${added} 首應援歌`)
  }
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

async function saveGenericChant() {
  saving.value = true
  const { data, error } = await supabase.from('app_settings')
    .upsert({ key: 'generic_chant_url', value: genericChantUrl.value.trim() }, { onConflict: 'key' }).select('key')
  saving.value = false
  if (error || !data?.length) { showToast('❌ 儲存失敗'); return }
  showToast('✅ 已儲存')
}

async function deleteChant(c) {
  const { data, error } = await supabase.from('team_chants').delete().eq('id', c.id).select('id')
  if (error || !data?.length) { showToast('❌ 刪除失敗'); return }
  teamChantsData.value = teamChantsData.value.filter(x => x.id !== c.id)
  showToast('🗑️ 已刪除')
}

async function verifyAllMusic() {
  const withSong = dbPlayers.value.filter(p => p.song)
  verifying.value = true
  verifyTotal.value = withSong.length
  verifyProgress.value = 0

  // 沒有 song 的直接標為 no_song
  for (const p of dbPlayers.value.filter(p => !p.song)) {
    musicStatusMap.value[p.id] = 'no_song'
  }

  for (const p of withSong) {
    await new Promise(resolve => {
      const audio = new Audio()
      audio.volume = 0
      let settled = false
      let timer = null
      const cleanup = (status) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        musicStatusMap.value[p.id] = status
        audio.src = ''
        resolve()
      }
      audio.oncanplay = () => cleanup('ok')
      audio.onerror = () => cleanup('error')
      timer = setTimeout(() => cleanup('error'), 8000)
      audio.src = p.song
      audio.load()
    })
    verifyProgress.value++
  }

  verifying.value = false
  showToast(`✅ 驗證完成：${withSong.length} 首`)
}

function playPreview(p) {
  if (previewAudio.value) {
    previewAudio.value.pause()
    previewAudio.value.src = ''
    previewAudio.value = null
  }
  if (previewingId.value === p.id) {
    previewingId.value = null
    return
  }
  const audio = new Audio(p.song)
  audio.onended = () => { previewingId.value = null }
  audio.play().catch(() => {})
  previewAudio.value = audio
  previewingId.value = p.id
}

function showToast(msg) {
  toast.value = msg
  setTimeout(() => toast.value = null, 3000)
}

async function logout() {
  await supabase.auth.signOut()
}

let authSub = null
onMounted(async () => {
  try {
    const { data } = await supabase.auth.getSession()
    session.value = data.session
  } catch (e) {
    session.value = null
  }
  const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => { session.value = s })
  authSub = sub.subscription
})
onUnmounted(() => authSub?.unsubscribe())

watch(() => !!session.value, (on) => { if (on) loadData() })
</script>
