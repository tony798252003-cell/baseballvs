# Dropbox 球隊嗆斯曲同步 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AdminScreen 嗆斯曲 tab 頂部新增 Dropbox 同步區塊，自動偵測 `/Music` 資料夾中的新應援曲並批量新增至 Supabase。

**Architecture:** 所有變更集中在 `AdminScreen.vue`，新增 Dropbox sync 的 refs + 兩個 async functions + UI 區塊。呼叫 Dropbox HTTP API v2（無 SDK，純 fetch），解析檔名後比對現有 `teamChantsData`，顯示預覽清單讓使用者勾選後 insert。

**Tech Stack:** Vue 3 Composition API、Dropbox API v2（HTTP）、Supabase JS client

---

## Files

- Modify: `src/components/AdminScreen.vue`
  - Script：新增 dropbox sync refs + `syncFromDropbox()` + `confirmDropboxAdd()` 函數
  - Template：在嗆斯曲 tab 頂部插入同步 UI 區塊

---

### Task 1: 新增 Dropbox sync 的 state refs

**Files:**
- Modify: `src/components/AdminScreen.vue:258-268`（嗆斯曲 refs 區塊）

- [ ] **Step 1: 在現有嗆斯曲 refs 下方（第 260 行 `const chantForm` 前）新增以下 refs**

```javascript
// Dropbox 同步
const dropboxToken = ref('')
const dropboxSyncOpen = ref(false)
const dropboxSyncing = ref(false)
const dropboxPreview = ref([])   // [{ team, name, path, checked }]
const dropboxConfirming = ref(false)
const dropboxUnparsed = ref([])  // 無法解析的檔名
```

- [ ] **Step 2: 確認儲存後瀏覽器 console 無錯誤，頁面正常顯示**

- [ ] **Step 3: Commit**
```bash
git add src/components/AdminScreen.vue
git commit -m "feat: add dropbox sync state refs"
```

---

### Task 2: 實作 `syncFromDropbox()` 函數

**Files:**
- Modify: `src/components/AdminScreen.vue`（script，緊接 `addChant` 函數之前）

- [ ] **Step 1: 在 `addChant()` 函數前插入 `syncFromDropbox` 函數**

```javascript
async function syncFromDropbox() {
  if (!dropboxToken.value.trim()) {
    showToast('❌ 請輸入 Access Token')
    return
  }
  dropboxSyncing.value = true
  dropboxPreview.value = []
  dropboxUnparsed.value = []

  try {
    // 1. 列出 /Music 資料夾
    const listRes = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${dropboxToken.value.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: '/Music' }),
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

    // 2. 解析檔名，比對現有嗆斯曲
    const existingKeys = new Set(
      teamChantsData.value.map(c => `${c.team}__${c.name}`)
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
      const name = nameWithExt.replace(/\.mp3$/i, '')
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
```

- [ ] **Step 2: 手動測試：在嗆斯曲 tab 呼叫函數（console 暫時測試）確認邏輯無誤**

- [ ] **Step 3: Commit**
```bash
git add src/components/AdminScreen.vue
git commit -m "feat: add syncFromDropbox function"
```

---

### Task 3: 實作 `confirmDropboxAdd()` 函數

**Files:**
- Modify: `src/components/AdminScreen.vue`（緊接 `syncFromDropbox` 之後）

- [ ] **Step 1: 在 `syncFromDropbox` 函數後插入 `confirmDropboxAdd` 函數**

```javascript
async function confirmDropboxAdd() {
  const selected = dropboxPreview.value.filter(item => item.checked)
  if (selected.length === 0) return

  dropboxConfirming.value = true
  let added = 0
  let failed = 0

  for (const item of selected) {
    try {
      // 取得 Dropbox 共享連結
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
        // 連結已存在，從 error body 取得
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

      // 轉換為可串流 URL
      if (url.includes('?dl=0')) {
        url = url.replace('?dl=0', '?raw=1')
      } else if (!url.includes('?')) {
        url = url + '?raw=1'
      }

      // Insert 到 Supabase
      const { data: inserted, error } = await supabase
        .from('team_chants')
        .insert({ team: item.team, name: item.name, url })
        .select()
        .single()

      if (error) { failed++; continue }
      teamChantsData.value.push(inserted)
      added++
    } catch (e) {
      failed++
    }
  }

  dropboxConfirming.value = false
  dropboxPreview.value = []
  dropboxUnparsed.value = []

  if (failed > 0) {
    showToast(`✅ 已新增 ${added} 首（⚠ ${failed} 筆失敗）`)
  } else {
    showToast(`✅ 已新增 ${added} 首應援曲`)
  }
}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/AdminScreen.vue
git commit -m "feat: add confirmDropboxAdd function"
```

---

### Task 4: 新增 UI 區塊到嗆斯曲 tab

**Files:**
- Modify: `src/components/AdminScreen.vue:189-222`（嗆斯曲 tab template）

- [ ] **Step 1: 在嗆斯曲 tab 的 `<!-- 新增表單 -->` 注釋前插入 Dropbox 同步區塊**

找到這行（第 190-191 行）：
```html
    <!-- 嗆斯曲 tab -->
    <div v-if="activeTab === 'chants'" class="flex-1 overflow-hidden flex flex-col gap-4 p-4">
      <!-- 新增表單 -->
```

在 `<!-- 新增表單 -->` 前插入：
```html
      <!-- Dropbox 同步區塊 -->
      <div class="bg-slate-800 rounded-xl border border-slate-600 overflow-hidden">
        <!-- 標頭（可收折） -->
        <button @click="dropboxSyncOpen = !dropboxSyncOpen"
          class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-700 transition">
          <span class="font-bold text-sm">☁️ Dropbox 同步</span>
          <span class="text-slate-400 text-xs">{{ dropboxSyncOpen ? '▲ 收折' : '▼ 展開' }}</span>
        </button>

        <!-- 展開內容 -->
        <div v-if="dropboxSyncOpen" class="px-4 pb-4 space-y-3 border-t border-slate-700">
          <!-- Token 輸入 -->
          <div class="flex gap-2 pt-3">
            <input
              v-model="dropboxToken"
              type="password"
              placeholder="Dropbox Access Token"
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

          <!-- 無新增項目 -->
          <div v-if="!dropboxSyncing && dropboxPreview.length === 0 && dropboxUnparsed.length === 0 && dropboxToken"
            class="text-slate-400 text-sm text-center py-2">
            按「同步」開始掃描
          </div>

          <!-- 預覽清單 -->
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


          <!-- 無法解析 -->
          <div v-if="dropboxUnparsed.length > 0" class="space-y-1">
            <div class="text-xs text-yellow-400 font-bold">⚠ 無法解析（格式需為「球隊 - 歌名.mp3」）：</div>
            <div v-for="name in dropboxUnparsed" :key="name" class="text-xs text-slate-500 pl-2">{{ name }}</div>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: 儲存後在瀏覽器確認：**
  - 嗆斯曲 tab 頂部出現「☁️ Dropbox 同步」可收折區塊
  - 點「展開」顯示 token 輸入欄和同步按鈕
  - 點「收折」隱藏內容，token 保留
  - 輸入 token 後按同步，正確解析並顯示預覽
  - 勾選項目後按確認，成功新增並更新列表

- [ ] **Step 3: 用真實 token 做 end-to-end 測試**
  1. 展開同步區塊
  2. 貼入有效 Dropbox access token
  3. 按「同步」—— 應看到新應援曲清單（若已全部同步則顯示 0 首）
  4. 取消全選再勾選 1 首，按確認
  5. 確認嗆斯曲列表下方出現新項目
  6. 確認 toast 顯示「✅ 已新增 1 首應援曲」

- [ ] **Step 4: Commit**
```bash
git add src/components/AdminScreen.vue
git commit -m "feat: dropbox chant sync UI in chants tab"
```
