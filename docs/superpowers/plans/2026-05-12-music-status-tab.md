# 音樂狀態 Tab 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AdminScreen 新增「音樂狀態」Tab，讓管理者能一覽所有球員加油歌狀態，手動驗證連結是否可播放，並進行試播與編輯。

**Architecture:** 全部修改集中在 `AdminScreen.vue` 單一檔案。新增第四個 tab 的 template 區塊，加入 reactive state 管理驗證進度與播放狀態，並撰寫 `verifyAllMusic()` 與試播邏輯。沿用現有的 `editPlayer()` / `saveEdit()` modal 流程。

**Tech Stack:** Vue 3 Composition API、HTML Audio API、Tailwind CSS

---

## 檔案異動

- Modify: `src/components/AdminScreen.vue`（唯一需要修改的檔案）

---

## Task 1：新增 Tab 定義與空白 template 區塊

**Files:**
- Modify: `src/components/AdminScreen.vue`

- [ ] **Step 1：在 tabs 陣列新增第四個 tab**

找到 `AdminScreen.vue:300-304`：

```js
const tabs = [
  { id: 'unmapped', label: '🔗 未對應音樂' },
  { id: 'all', label: '📋 所有球員' },
  { id: 'chants', label: '🎵 球隊嗆斯曲' },
]
```

改為：

```js
const tabs = [
  { id: 'unmapped', label: '🔗 未對應音樂' },
  { id: 'all', label: '📋 所有球員' },
  { id: 'chants', label: '🎵 球隊嗆斯曲' },
  { id: 'musicStatus', label: '🎧 音樂狀態' },
]
```

- [ ] **Step 2：在 template 的 `<!-- Toast -->` 區塊之前新增空白 tab 內容**

找到 `AdminScreen.vue:285`（`<!-- Toast -->`），在它前面插入：

```html
<!-- 音樂狀態 tab -->
<div v-if="activeTab === 'musicStatus'" class="flex-1 overflow-hidden flex flex-col gap-3 p-4">
  <p class="text-slate-400 text-sm">音樂狀態（施工中）</p>
</div>
```

- [ ] **Step 3：啟動 dev server，切換到「音樂狀態」tab 確認出現**

```bash
npm run dev
```

預期：tab 列出現第四個「🎧 音樂狀態」，點進去顯示「音樂狀態（施工中）」

- [ ] **Step 4：Commit**

```bash
git add src/components/AdminScreen.vue
git commit -m "feat: add music status tab scaffold"
```

---

## Task 2：新增 reactive state 與 computed

**Files:**
- Modify: `src/components/AdminScreen.vue`

- [ ] **Step 1：在 script setup 新增音樂狀態相關 state**

在 `AdminScreen.vue` 的 `// 嗆斯曲` 區塊之前（約第 319 行），插入：

```js
// 音樂狀態
const musicStatusMap = ref({})   // { [playerId]: 'pending' | 'ok' | 'error' | 'no_song' }
const verifying = ref(false)
const verifyProgress = ref(0)
const verifyTotal = ref(0)
const previewingId = ref(null)
const previewAudio = ref(null)
const musicStatusFilter = ref('')
```

- [ ] **Step 2：新增 computed：依狀態分組排序的球員清單**

在 `filteredAllPlayers` computed 之後插入：

```js
const musicStatusPlayers = computed(() => {
  const order = { error: 0, no_song: 1, pending: 2, ok: 3 }
  let list = dbPlayers.value.map(p => ({
    ...p,
    _status: musicStatusMap.value[p.id] ?? (p.song ? 'pending' : 'no_song')
  }))
  if (musicStatusFilter.value) list = list.filter(p => p.team === musicStatusFilter.value)
  return list.sort((a, b) => (order[a._status] ?? 4) - (order[b._status] ?? 4))
})
```

- [ ] **Step 3：確認 dev server 無報錯**

預期：瀏覽器 console 無 Vue warning

- [ ] **Step 4：Commit**

```bash
git add src/components/AdminScreen.vue
git commit -m "feat: add music status reactive state and computed"
```

---

## Task 3：實作驗證邏輯 verifyAllMusic()

**Files:**
- Modify: `src/components/AdminScreen.vue`

- [ ] **Step 1：新增 verifyAllMusic 函式**

在 `showToast` 函式之前插入：

```js
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
      const cleanup = () => { audio.src = ''; resolve() }
      audio.oncanplay = () => { musicStatusMap.value[p.id] = 'ok'; cleanup() }
      audio.onerror = () => { musicStatusMap.value[p.id] = 'error'; cleanup() }
      setTimeout(() => { musicStatusMap.value[p.id] = 'error'; cleanup() }, 8000)
      audio.src = p.song
      audio.load()
    })
    verifyProgress.value++
  }

  verifying.value = false
  showToast(`✅ 驗證完成：${withSong.length} 首`)
}
```

- [ ] **Step 2：確認 dev server 無報錯**

- [ ] **Step 3：Commit**

```bash
git add src/components/AdminScreen.vue
git commit -m "feat: implement verifyAllMusic with Audio object"
```

---

## Task 4：實作試播邏輯

**Files:**
- Modify: `src/components/AdminScreen.vue`

- [ ] **Step 1：新增 playPreview 與 stopPreview 函式**

緊接在 `verifyAllMusic` 之後插入：

```js
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
```

- [ ] **Step 2：Commit**

```bash
git add src/components/AdminScreen.vue
git commit -m "feat: add playPreview / stopPreview for music status tab"
```

---

## Task 5：完成音樂狀態 tab template

**Files:**
- Modify: `src/components/AdminScreen.vue`

- [ ] **Step 1：將施工中的 template 替換為完整版**

找到 Task 1 插入的空白 tab：

```html
<!-- 音樂狀態 tab -->
<div v-if="activeTab === 'musicStatus'" class="flex-1 overflow-hidden flex flex-col gap-3 p-4">
  <p class="text-slate-400 text-sm">音樂狀態（施工中）</p>
</div>
```

替換為：

```html
<!-- 音樂狀態 tab -->
<div v-if="activeTab === 'musicStatus'" class="flex-1 overflow-hidden flex flex-col gap-3 p-4">
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
```

- [ ] **Step 2：測試完整流程**

1. 切到「🎧 音樂狀態」tab
2. 確認球員列表顯示，預設所有有 URL 的球員狀態為「待驗證」，無 URL 為「⚫ 無歌」
3. 按「全部驗證」，確認進度顯示 X / N，驗證結束後狀態更新
4. 點「▶ 試播」，確認音樂播放；再點「⏹ 停止」，確認停止
5. 點「編輯」，確認開啟現有 modal；修改 URL 儲存後，該球員狀態重設為「待驗證」
6. 測試隊伍篩選下拉

- [ ] **Step 3：儲存後重設驗證狀態**

找到 `saveEdit()` 函式中 `editingPlayer.value = null` 那行，在它之前插入：

```js
if (editingPlayer.value?.id) {
  musicStatusMap.value[editingPlayer.value.id] = update.song ? 'pending' : 'no_song'
}
```

完整的 `saveEdit` 結果：

```js
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
  if (editingPlayer.value?.id) {
    musicStatusMap.value[editingPlayer.value.id] = update.song ? 'pending' : 'no_song'
  }
  editingPlayer.value = null
  showToast('✅ 已儲存')
}
```

- [ ] **Step 4：Commit**

```bash
git add src/components/AdminScreen.vue
git commit -m "feat: complete music status tab with verify, preview, and edit reset"
```
