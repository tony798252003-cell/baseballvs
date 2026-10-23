# 後台音樂設定流程改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dead Google Sheet CSV player-matching tab, add a Dropbox filename-matching import (song + intro) to AdminScreen's 音樂狀態 tab, and ship two local Node CLI scripts — one for processing+uploading new walk-up songs end-to-end, one for migrating old inconsistently-named Dropbox files into the new structure.

**Architecture:** AdminScreen.vue gets surgical edits (delete dead code, add one new collapsible section reusing the existing 嗆斯曲-tab Dropbox-sync UI pattern). Two new standalone Node scripts share a small library module (`scripts/lib/dropboxMusicSync.mjs`) for Dropbox upload/move/link and player-matching logic, following the existing `scripts/*.mjs` convention (hardcoded Supabase client, plain `fetch`, no new npm dependencies except relying on Node's built-in `fetch`, `readline/promises`, and `process.loadEnvFile`).

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Supabase JS client, Dropbox HTTP API (v2), Node.js 22 built-ins (`fetch`, `readline/promises`, `child_process`, `process.loadEnvFile`), system `ffmpeg` binary (external dependency, invoked via `child_process`).

## Global Constraints

- No new npm dependencies. Node 22's built-in `fetch`, `readline/promises`, and `process.loadEnvFile` cover everything needed; `ffmpeg` is an external system binary invoked via `child_process`, not an npm package.
- Follow the existing `scripts/*.mjs` convention: ESM, hardcoded Supabase URL/anon key at the top of files that use Supabase directly (matches `scripts/restore-songs.mjs`, `scripts/scrape-cpbl.mjs`, `scripts/add-international-players.mjs`).
- This repo has no test framework (no jest/vitest/mocha in `package.json`). Every "test" step in this plan is a manual run with an expected console/UI outcome, not an automated assertion — this matches the project's existing verification style (see the spec's own 驗證方式 section).
- `ffmpeg` is not installed in the plan-writing environment. Any step that shells out to `ffmpeg` is marked **[MANUAL VERIFY — requires local ffmpeg]** and must be run by the user on their own machine, not by whoever executes this plan in a sandboxed environment.
- Team full names (must match exactly, copied from `scripts/scrape-cpbl.mjs`): `中信兄弟`, `統一獅`, `樂天桃猿`, `富邦悍將`, `味全龍`, `台鋼雄鷹`.
- Dropbox folder → team map (from the design spec, confirmed against the user's actual Dropbox `/Music` folder listing): `Brothers→中信兄弟`, `Lions→統一獅`, `Fubon→富邦悍將`, `Dragons→味全龍`, `Hawks→台鋼雄鷹`, `Monkeys→樂天桃猿`. `Chance` is team chants (out of scope). `MLB` has no single team — match by name only, across all players.
- `players` table columns used: `id, name, number, team, main_position, song, emoji, intro, other_positions` (confirmed via existing `AdminScreen.vue` `loadData()` query).
- `player.intro`: if the value starts with `http`, both `useAudio.js` and `App.vue`'s TTS fallback already treat it as an audio URL (played once, then the loop song takes over). Non-`http` values are spoken via TTS. Writing a Dropbox URL into `intro` requires no changes to playback code — it already works correctly.

---

## File Structure

- Modify: `src/components/AdminScreen.vue` — remove dead CSV tab/logic, add Dropbox player-song import block to 音樂狀態 tab.
- Modify: `.gitignore` — add `.env`.
- Create: `.env.example` — documents `DROPBOX_TOKEN`.
- Create: `scripts/lib/dropboxMusicSync.mjs` — shared Dropbox HTTP helpers + team/folder map + fuzzy matching, used by both new scripts.
- Create: `scripts/add-player-song.mjs` — interactive: trim/merge/volume via ffmpeg → upload → write to Supabase.
- Create: `scripts/migrate-legacy-songs.mjs` — batch: scan legacy folders → fuzzy match → preview → confirm → move + write to Supabase.

---

### Task 1: Remove the dead Google Sheet CSV tab from AdminScreen

**Files:**
- Modify: `src/components/AdminScreen.vue`

**Interfaces:**
- Produces: `tabs` array with 3 entries (`all`, `chants`, `musicStatus`), default `activeTab` = `'all'`. `unmappedPlayers` computed stays (still used by the header counter and by Task 3's "already has song" grouping logic).

- [ ] **Step 1: Remove the 未對應音樂 tab button and its template block**

In `src/components/AdminScreen.vue`, remove this tab definition (part of the `tabs` array, currently line 367):
```js
{ id: 'unmapped', label: '🔗 未對應音樂' },
```
and change the default from:
```js
const activeTab = ref('unmapped')
```
to:
```js
const activeTab = ref('all')
```

Remove the entire 未對應音樂 tab template block (currently lines 22–62, the `<div v-if="activeTab === 'unmapped'" ...>` through its closing `</div>`), and remove the `<span v-if="tab.id === 'unmapped'" ...>` badge markup inside the tab-button loop (currently line 18) since there's no `unmapped` tab left to attach it to.

- [ ] **Step 2: Remove CSV-related script state and functions**

Remove these declarations:
```js
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQxWiFy6zh81UBv2yO1mwLCbPDMrm_3Iw77q9LrPbmb4C5roLCR3simgX-NLTgYPgUvqMv1nflJ8V-9/pub?gid=112417298&single=true&output=csv'
```
```js
const csvUnmatched = ref([])
const selectedCsvPlayer = ref(null)
```
```js
const filteredDbPlayers = computed(() => {
  let list = dbPlayers.value
  if (searchQuery.value) list = list.filter(p => p.name.includes(searchQuery.value))
  return list
})
```
```js
function parseCSVLine(line) { /* ... entire function ... */ }
```
```js
function selectCsvPlayer(p) {
  selectedCsvPlayer.value = p
  searchQuery.value = p.name
}
```
```js
async function mapPlayers(dbPlayer) { /* ... entire function ... */ }
```

- [ ] **Step 3: Remove the CSV-fetch block inside `loadData()`**

In `loadData()`, remove:
```js
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
```
`loadData()` should end right after `teamChantsData.value = chants || []`.

- [ ] **Step 4: Manually verify**

Run `npm run dev`, open the app, navigate to Admin (⚙️). Confirm:
- Only 3 tabs show: 全部球員 / 嗆斯曲 / 音樂狀態.
- 全部球員 is the default active tab on open.
- Header still shows "未設定音樂：X 人" with a sane count.
- No console errors on load.

- [ ] **Step 5: Commit**

```bash
git add src/components/AdminScreen.vue
git commit -m "refactor: remove dead Google Sheet CSV player-matching tab"
```

---

### Task 2: `.env` support for local scripts

**Files:**
- Modify: `.gitignore`
- Create: `.env.example`

**Interfaces:**
- Produces: local scripts read `DROPBOX_TOKEN` via `process.env.DROPBOX_TOKEN` after calling `process.loadEnvFile('.env')`.

- [ ] **Step 1: Add `.env` to `.gitignore`**

Append to `.gitignore`:
```
.env
```

- [ ] **Step 2: Create `.env.example`**

```
# Dropbox access token used by scripts/add-player-song.mjs and scripts/migrate-legacy-songs.mjs
DROPBOX_TOKEN=
```

- [ ] **Step 3: Verify**

Run:
```bash
git check-ignore -v .env || echo "not ignored"
```
Expected: prints the `.gitignore:.env` match line (confirms `.env` would be ignored if created).

- [ ] **Step 4: Commit**

```bash
git add .gitignore .env.example
git commit -m "chore: add .env support for local Dropbox scripts"
```

---

### Task 3: Shared Dropbox/matching library for the two node scripts

**Files:**
- Create: `scripts/lib/dropboxMusicSync.mjs`

**Interfaces:**
- Consumes: nothing (uses global `fetch`).
- Produces (all exported from this module):
  - `SUPABASE_URL: string`, `SUPABASE_KEY: string` — constants, for scripts to build their own client (matches existing convention of each script owning its client).
  - `TEAM_FOLDER_MAP: Record<string, string>` — `{ Brothers: '中信兄弟', Lions: '統一獅', Fubon: '富邦悍將', Dragons: '味全龍', Hawks: '台鋼雄鷹', Monkeys: '樂天桃猿' }`
  - `fuzzyNameMatch(a: string, b: string): boolean` — true if trimmed `a` and `b` are equal or one contains the other.
  - `parseLegacyFilename(filename: string): { number: string | null, name: string, isIntro: boolean }`
  - `listDropboxFolder(token: string, path: string): Promise<{ name: string, path_lower: string }[]>` — throws on non-OK response.
  - `uploadToDropbox(token: string, localFilePath: string, dropboxPath: string): Promise<void>` — overwrites if exists.
  - `moveDropboxFile(token: string, fromPath: string, toPath: string): Promise<void>` — throws on failure.
  - `getSharedLinkRawUrl(token: string, dropboxPath: string): Promise<string>` — creates (or reuses existing) shared link, returns it converted to `?raw=1` form.

- [ ] **Step 1: Write the module**

```js
// scripts/lib/dropboxMusicSync.mjs

export const SUPABASE_URL = 'https://ehevruywqvpdbzveqxum.supabase.co'
export const SUPABASE_KEY = '<REDACTED>'

export const TEAM_FOLDER_MAP = {
  Brothers: '中信兄弟',
  Lions: '統一獅',
  Fubon: '富邦悍將',
  Dragons: '味全龍',
  Hawks: '台鋼雄鷹',
  Monkeys: '樂天桃猿',
}

export function fuzzyNameMatch(a, b) {
  const x = (a || '').trim()
  const y = (b || '').trim()
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

// "5林襄.mp3" -> { number: '5', name: '林襄', isIntro: false }
// "5林襄-Intro.mp3" -> { number: '5', name: '林襄', isIntro: true }
// "林襄intro.mp3" -> { number: null, name: '林襄', isIntro: true }
export function parseLegacyFilename(filename) {
  let base = filename.replace(/\.mp3$/i, '')

  const introMatch = base.match(/^(.*?)[\s\-_]*intro$/i)
  const isIntro = !!introMatch
  if (isIntro) base = introMatch[1]

  const numberMatch = base.match(/^(\d+)(.*)$/)
  const number = numberMatch ? numberMatch[1] : null
  const name = (numberMatch ? numberMatch[2] : base).trim()

  return { number, name, isIntro }
}

export async function listDropboxFolder(token, path) {
  const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) {
    throw new Error(`列出資料夾失敗 (${path}): ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return data.entries.filter(e => e['.tag'] === 'file' && e.name.toLowerCase().endsWith('.mp3'))
}

export async function uploadToDropbox(token, localFilePath, dropboxPath) {
  const fs = await import('node:fs')
  const fileBuffer = fs.readFileSync(localFilePath)
  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path: dropboxPath, mode: 'overwrite', autorename: false, mute: true }),
      'Content-Type': 'application/octet-stream',
    },
    body: fileBuffer,
  })
  if (!res.ok) {
    throw new Error(`上傳失敗 (${dropboxPath}): ${res.status} ${await res.text()}`)
  }
}

export async function moveDropboxFile(token, fromPath, toPath) {
  const res = await fetch('https://api.dropboxapi.com/2/files/move_v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from_path: fromPath, to_path: toPath, autorename: false }),
  })
  if (!res.ok) {
    throw new Error(`搬移失敗 (${fromPath} -> ${toPath}): ${res.status} ${await res.text()}`)
  }
}

export async function getSharedLinkRawUrl(token, dropboxPath) {
  const res = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: dropboxPath, settings: { requested_visibility: 'public' } }),
  })

  let url = ''
  if (res.status === 409) {
    const errData = await res.json()
    url = errData?.error?.shared_link_already_exists?.metadata?.url || ''
  } else if (res.ok) {
    const data = await res.json()
    url = data.url || ''
  } else {
    throw new Error(`建立分享連結失敗 (${dropboxPath}): ${res.status} ${await res.text()}`)
  }

  if (!url) throw new Error(`未取得分享連結 (${dropboxPath})`)

  return url.includes('?dl=0')
    ? url.replace('?dl=0', '?raw=1')
    : url + (url.includes('?') ? '&raw=1' : '?raw=1')
}
```

- [ ] **Step 2: Manually verify parsing logic**

Run:
```bash
node -e "
import('./scripts/lib/dropboxMusicSync.mjs').then(({ parseLegacyFilename, fuzzyNameMatch }) => {
  console.log(parseLegacyFilename('5林襄.mp3'))
  console.log(parseLegacyFilename('5林襄-Intro.mp3'))
  console.log(parseLegacyFilename('林襄intro.mp3'))
  console.log(parseLegacyFilename('林襄.mp3'))
  console.log(fuzzyNameMatch('林襄', '林襄'))
  console.log(fuzzyNameMatch('林襄', '林襄(代打)'))
  console.log(fuzzyNameMatch('林襄', '陳晨威'))
})
"
```
Expected output:
```
{ number: '5', name: '林襄', isIntro: false }
{ number: '5', name: '林襄', isIntro: true }
{ number: null, name: '林襄', isIntro: true }
{ number: null, name: '林襄', isIntro: false }
true
true
false
```

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/dropboxMusicSync.mjs
git commit -m "feat: add shared Dropbox/matching helpers for music scripts"
```

---

### Task 4: Dropbox player-song import block in AdminScreen's 音樂狀態 tab

**Files:**
- Modify: `src/components/AdminScreen.vue`

**Interfaces:**
- Consumes: existing `dropboxToken` ref (shared with the 嗆斯曲 tab's sync section), existing `dbPlayers`, `musicStatusMap`, `showToast()`.
- Produces: nothing consumed by later tasks (this is UI-only, independent of the two node scripts).

- [ ] **Step 1: Add new script state**

Add near the existing Dropbox-related state (after the `dropboxUnparsed` declaration):
```js
// 球員應援歌 Dropbox 匯入
const playerDropboxFolder = ref('/Music/Players')
const playerDropboxSyncOpen = ref(false)
const playerDropboxScanning = ref(false)
const playerDropboxPreview = ref([])    // [{ key, team, name, kind: 'song'|'intro', status: 'new'|'overwrite', dropboxPath, currentValue, checked }]
const playerDropboxUnparsed = ref([])   // [{ name, reason }]
const playerDropboxConfirming = ref(false)
```

- [ ] **Step 2: Add the scan function**

```js
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
```

- [ ] **Step 3: Add the confirm-import function**

```js
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
        const { error } = await supabase.from('players').update({ [field]: url }).eq('id', item.playerId)
        if (error) { console.error(`[Player Dropbox Sync] update failed for "${item.team} - ${item.name}":`, error); failed++; continue }

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

  if (failed > 0) {
    showToast(`✅ 已匯入 ${added} 首（⚠ ${failed} 筆失敗）`)
  } else {
    showToast(`✅ 已匯入 ${added} 首應援歌`)
  }
}
```

- [ ] **Step 4: Add the template block**

Inside the `音樂狀態` tab's `<div v-if="activeTab === 'musicStatus'" ...>`, insert this new collapsible section immediately before the existing `<!-- 工具列 -->` div:
```html
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
```

- [ ] **Step 5: Manually verify**

Run `npm run dev`, open Admin → 音樂狀態 tab. Confirm:
- New「☁️ Dropbox 匯入」collapsible section appears above the existing 工具列.
- Expanding it shows token input, folder path (defaulted to `/Music/Players`), and a 掃描 button.
- With an invalid/empty token, clicking 掃描 shows the "請輸入 Access Token" toast.
- (If you have a real Dropbox token available) point it at a test folder with a file named e.g. `統一獅 - 測試球員.mp3` where `測試球員` exists in `dbPlayers` with no `song` set — confirm it shows up in the 新增 (green) group, checked by default; a file matching a player who already has a `song` shows in the 覆蓋 (yellow) group, unchecked by default with the current URL visible.

- [ ] **Step 6: Commit**

```bash
git add src/components/AdminScreen.vue
git commit -m "feat: add Dropbox player-song import to 音樂狀態 tab (song + intro)"
```

---

### Task 5: `scripts/add-player-song.mjs` — trim/merge/volume/upload/write CLI

**Files:**
- Create: `scripts/add-player-song.mjs`
- Consumes: `scripts/lib/dropboxMusicSync.mjs` (`SUPABASE_URL`, `SUPABASE_KEY`, `uploadToDropbox`, `getSharedLinkRawUrl`).

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
// scripts/add-player-song.mjs
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { SUPABASE_URL, SUPABASE_KEY, uploadToDropbox, getSharedLinkRawUrl } from './lib/dropboxMusicSync.mjs'

try {
  process.loadEnvFile('.env')
} catch {
  // .env is optional; DROPBOX_TOKEN may already be in the environment
}

const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN
if (!DROPBOX_TOKEN) {
  console.error('❌ 缺少 DROPBOX_TOKEN，請在 .env 設定（參考 .env.example）')
  process.exit(1)
}

function checkFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  } catch {
    console.error('❌ 找不到 ffmpeg，請先安裝：brew install ffmpeg')
    process.exit(1)
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const rl = createInterface({ input: process.stdin, output: process.stdout })

async function ask(question) {
  return (await rl.question(question)).trim()
}

async function pickPlayer() {
  const keyword = await ask('搜尋球員姓名關鍵字：')
  const { data, error } = await supabase.from('players').select('id, name, number, team, song, intro').ilike('name', `%${keyword}%`)
  if (error) throw error
  if (!data || data.length === 0) {
    console.error('❌ 找不到符合的球員')
    process.exit(1)
  }
  if (data.length === 1) return data[0]

  console.log('找到多筆符合，請選擇：')
  data.forEach((p, i) => console.log(`  [${i}] ${p.name} #${p.number} (${p.team})`))
  const idx = Number(await ask('輸入編號：'))
  if (Number.isNaN(idx) || !data[idx]) {
    console.error('❌ 輸入無效')
    process.exit(1)
  }
  return data[idx]
}

function runFfmpeg(args) {
  execFileSync('ffmpeg', ['-y', ...args], { stdio: 'inherit' })
}

function trim(inputPath, outputPath, start, end) {
  const args = ['-i', inputPath]
  if (start) args.push('-ss', start)
  if (end) args.push('-to', end)
  args.push('-c:a', 'libmp3lame', '-q:a', '2', outputPath)
  runFfmpeg(args)
}

function concat(partPaths, outputPath, tmpDir) {
  const listPath = join(tmpDir, 'concat-list.txt')
  writeFileSync(listPath, partPaths.map(p => `file '${p}'`).join('\n'))
  runFfmpeg(['-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-q:a', '2', outputPath])
}

function adjustVolume(inputPath, outputPath, spec) {
  const filter = spec === 'auto' ? 'loudnorm' : `volume=${spec}dB`
  runFfmpeg(['-i', inputPath, '-af', filter, '-c:a', 'libmp3lame', '-q:a', '2', outputPath])
}

async function main() {
  const inputPaths = process.argv.slice(2)
  if (inputPaths.length === 0 || inputPaths.length > 2) {
    console.error('用法：node scripts/add-player-song.mjs <音檔路徑> [第二段音檔路徑]')
    process.exit(1)
  }

  checkFfmpeg()

  const player = await pickPlayer()
  const kindAnswer = (await ask('這次是 song（循環）還是 intro（進場播一次）？[song/intro]：')).toLowerCase()
  const kind = kindAnswer === 'intro' ? 'intro' : 'song'

  const tmpDir = mkdtempSync(join(tmpdir(), 'add-player-song-'))
  const parts = []

  try {
    for (let i = 0; i < inputPaths.length; i++) {
      const start = await ask(`第 ${i + 1} 段裁切起始時間（mm:ss，留空 = 不裁切）：`)
      const end = await ask(`第 ${i + 1} 段裁切結束時間（mm:ss，留空 = 不裁切）：`)
      const partPath = join(tmpDir, `part-${i}.mp3`)
      trim(inputPaths[i], partPath, start || null, end || null)
      parts.push(partPath)
    }

    let mergedPath = parts[0]
    if (parts.length > 1) {
      mergedPath = join(tmpDir, 'merged.mp3')
      concat(parts, mergedPath, tmpDir)
    }

    const volumeAnswer = await ask('音量調整？留空 = 不調整，輸入 "auto" = 自動正規化，或輸入 dB 數值（例如 3 或 -2）：')
    let finalPath = mergedPath
    if (volumeAnswer) {
      finalPath = join(tmpDir, 'final.mp3')
      adjustVolume(mergedPath, finalPath, volumeAnswer)
    }

    const suffix = kind === 'intro' ? ' - Intro' : ''
    const dropboxPath = `/Music/Players/${player.team} - ${player.name}${suffix}.mp3`

    console.log(`上傳中：${dropboxPath}`)
    await uploadToDropbox(DROPBOX_TOKEN, finalPath, dropboxPath)

    console.log('產生分享連結中...')
    const url = await getSharedLinkRawUrl(DROPBOX_TOKEN, dropboxPath)

    const field = kind === 'intro' ? 'intro' : 'song'
    const { error } = await supabase.from('players').update({ [field]: url }).eq('id', player.id)
    if (error) throw error

    console.log('✅ 完成')
    console.log(`  球員：${player.name} #${player.number} (${player.team})`)
    console.log(`  欄位：${field}`)
    console.log(`  Dropbox 路徑：${dropboxPath}`)
    console.log(`  URL：${url}`)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
    rl.close()
  }
}

main().catch(e => {
  console.error('❌', e.message)
  process.exit(1)
})
```

- [ ] **Step 2: [MANUAL VERIFY — requires local ffmpeg] Run against a real test file**

On a machine with `ffmpeg` installed and a valid `DROPBOX_TOKEN` in `.env`:
```bash
node scripts/add-player-song.mjs ~/Downloads/test-song.mp3
```
Follow the prompts (search an existing test player, choose `song`, skip trim/volume). Expected: script prints a Dropbox path and a `?raw=1` URL, and the target player's `song` column in Supabase is updated to that URL. Confirm by reloading AdminScreen → 全部球員 and checking the row shows "✓ 有音樂".

- [ ] **Step 3: Commit**

```bash
git add scripts/add-player-song.mjs
git commit -m "feat: add add-player-song.mjs CLI for trim/merge/volume/upload/write"
```

---

### Task 6: `scripts/migrate-legacy-songs.mjs` — legacy folder migration CLI

**Files:**
- Create: `scripts/migrate-legacy-songs.mjs`
- Consumes: `scripts/lib/dropboxMusicSync.mjs` (`SUPABASE_URL`, `SUPABASE_KEY`, `TEAM_FOLDER_MAP`, `fuzzyNameMatch`, `parseLegacyFilename`, `listDropboxFolder`, `moveDropboxFile`, `getSharedLinkRawUrl`).

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
// scripts/migrate-legacy-songs.mjs
import { createClient } from '@supabase/supabase-js'
import { createInterface } from 'node:readline/promises'
import {
  SUPABASE_URL, SUPABASE_KEY, TEAM_FOLDER_MAP,
  fuzzyNameMatch, parseLegacyFilename, listDropboxFolder, moveDropboxFile, getSharedLinkRawUrl,
} from './lib/dropboxMusicSync.mjs'

try {
  process.loadEnvFile('.env')
} catch {
  // optional
}

const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN
if (!DROPBOX_TOKEN) {
  console.error('❌ 缺少 DROPBOX_TOKEN，請在 .env 設定（參考 .env.example）')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const rl = createInterface({ input: process.stdin, output: process.stdout })

function matchPlayer(entry, teamPlayers, allPlayers) {
  // Team-scoped folders: prefer number match, fall back to fuzzy name.
  if (teamPlayers) {
    if (entry.number) {
      const byNumber = teamPlayers.filter(p => String(p.number) === entry.number)
      if (byNumber.length === 1) return byNumber[0]
    }
    const byName = teamPlayers.filter(p => fuzzyNameMatch(p.name, entry.name))
    return byName.length === 1 ? byName[0] : { ambiguous: byName.length > 1 }
  }
  // MLB folder: name-only match across everyone.
  const byName = allPlayers.filter(p => fuzzyNameMatch(p.name, entry.name))
  return byName.length === 1 ? byName[0] : { ambiguous: byName.length > 1 }
}

async function scanFolder(folder, team, teamPlayers, allPlayers, matched, unparsed) {
  let files
  try {
    files = await listDropboxFolder(DROPBOX_TOKEN, `/Music/${folder}`)
  } catch (e) {
    console.error(`⚠ 略過 /Music/${folder}：${e.message}`)
    return
  }

  for (const file of files) {
    const parsed = parseLegacyFilename(file.name)
    if (!parsed.name) { unparsed.push({ path: file.path_lower, reason: '無法解析姓名' }); continue }

    const result = matchPlayer(parsed, teamPlayers, allPlayers)
    if (!result || result.ambiguous !== undefined) {
      unparsed.push({ path: file.path_lower, reason: result?.ambiguous ? '模糊比對到多筆，需手動處理' : '找不到球員' })
      continue
    }

    const player = result
    const kind = parsed.isIntro ? 'intro' : 'song'
    const currentValue = player[kind]
    const targetTeam = team || player.team
    const suffix = kind === 'intro' ? ' - Intro' : ''
    const targetPath = `/Music/Players/${targetTeam} - ${player.name}${suffix}.mp3`

    matched.push({
      fromPath: file.path_lower,
      toPath: targetPath,
      playerId: player.id,
      playerLabel: `${player.name} #${player.number} (${targetTeam})`,
      kind,
      status: currentValue ? 'overwrite' : 'new',
      currentValue: currentValue || '',
      selected: !currentValue,
    })
  }
}

async function main() {
  const { data: allPlayers, error } = await supabase.from('players').select('id, name, number, team, song, intro')
  if (error) throw error

  const matched = []
  const unparsed = []

  for (const [folder, team] of Object.entries(TEAM_FOLDER_MAP)) {
    const teamPlayers = allPlayers.filter(p => p.team === team)
    await scanFolder(folder, team, teamPlayers, allPlayers, matched, unparsed)
  }
  await scanFolder('MLB', null, null, allPlayers, matched, unparsed)

  if (matched.length === 0) {
    console.log('沒有找到可搬移的檔案。')
    if (unparsed.length > 0) {
      console.log(`\n無法處理的檔案（${unparsed.length} 筆）：`)
      unparsed.forEach(u => console.log(`  ${u.path} — ${u.reason}`))
    }
    rl.close()
    return
  }

  console.log(`找到 ${matched.length} 筆可搬移：\n`)
  matched.forEach((m, i) => {
    console.log(`[${i}] ${m.status === 'new' ? '新增' : '覆蓋'}:${m.kind}  ${m.playerLabel}`)
    console.log(`     ${m.fromPath}  ->  ${m.toPath}`)
    if (m.status === 'overwrite') console.log(`     目前值：${m.currentValue}`)
  })

  if (unparsed.length > 0) {
    console.log(`\n無法處理的檔案（${unparsed.length} 筆，不會被搬移）：`)
    unparsed.forEach(u => console.log(`  ${u.path} — ${u.reason}`))
  }

  console.log(`\n預設：新增項目已勾選，覆蓋項目未勾選。`)
  const toggleAnswer = await rl.question('輸入要「切換勾選狀態」的編號（逗號分隔），或直接 Enter 套用預設：')
  if (toggleAnswer.trim()) {
    for (const raw of toggleAnswer.split(',')) {
      const idx = Number(raw.trim())
      if (matched[idx]) matched[idx].selected = !matched[idx].selected
    }
  }

  const confirmAnswer = await rl.question('確認執行以上勾選項目的搬移與寫入？[y/N]：')
  rl.close()
  if (confirmAnswer.trim().toLowerCase() !== 'y') {
    console.log('已取消，未做任何變更。')
    return
  }

  let moved = 0
  let failed = 0
  for (const item of matched.filter(m => m.selected)) {
    try {
      await moveDropboxFile(DROPBOX_TOKEN, item.fromPath, item.toPath)
      const url = await getSharedLinkRawUrl(DROPBOX_TOKEN, item.toPath)
      const { error: updateError } = await supabase.from('players').update({ [item.kind]: url }).eq('id', item.playerId)
      if (updateError) throw updateError
      moved++
    } catch (e) {
      console.error(`❌ ${item.fromPath}: ${e.message}`)
      failed++
    }
  }

  console.log(`\n✅ 完成：成功 ${moved} 筆，失敗 ${failed} 筆，未選取/無法處理 ${matched.length - moved - failed + unparsed.length} 筆`)
}

main().catch(e => {
  console.error('❌', e.message)
  process.exit(1)
})
```

- [ ] **Step 2: [MANUAL VERIFY — requires local ffmpeg-free Dropbox access] Dry-run against one folder first**

Since this script always scans all folders, for a first cautious run temporarily comment out all `TEAM_FOLDER_MAP` entries except one (e.g. `Lions`) and the `MLB` call, run:
```bash
node scripts/migrate-legacy-songs.mjs
```
Expected: prints a numbered preview list with `新增`/`覆蓋` groupings and Dropbox `from -> to` paths, an "無法處理" list for anything unparseable, then prompts for toggle/confirm. Answer `N` at the confirm prompt and verify no Dropbox files moved (check the source folder is unchanged) and no Supabase rows changed.

- [ ] **Step 3: [MANUAL VERIFY] Full run**

Restore the full `TEAM_FOLDER_MAP`, run again, review the full preview carefully, confirm with `y`. Verify in Dropbox that files moved into `/Music/Players/` with the new naming, and in Supabase that the corresponding `song`/`intro` columns were updated. Spot-check a few "無法處理" entries manually to confirm they're genuinely ambiguous/unmatched, not a bug in the parsing regex.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-legacy-songs.mjs
git commit -m "feat: add migrate-legacy-songs.mjs for legacy Dropbox filename migration"
```

---

## Self-Review Notes

- **Spec coverage:** Tab removal (Task 1) ✅; Dropbox import block with song+intro grouping (Task 4) ✅; CLI trim/merge/volume/upload/write with song+intro choice (Task 5) ✅; legacy migration with folder map, number-then-fuzzy matching, MLB exception, preview/confirm, move+write (Task 6) ✅; `.env` + `.gitignore` (Task 2) ✅; shared lib to avoid duplicating Dropbox HTTP calls across two scripts (Task 3) ✅.
- **Placeholder scan:** no TBD/TODO; every step has runnable code and a concrete expected outcome.
- **Type/name consistency:** `TEAM_FOLDER_MAP`, `fuzzyNameMatch`, `parseLegacyFilename`, `listDropboxFolder`, `uploadToDropbox`, `moveDropboxFile`, `getSharedLinkRawUrl` are defined once in Task 3 and imported with matching names/signatures in Tasks 5 and 6. `players` field names (`song`, `intro`, `team`, `number`, `name`, `id`) are consistent across Tasks 1, 4, 5, 6.
- **Known limitation acknowledged in-plan:** ffmpeg-dependent steps can't be executed by whoever runs this plan in a sandbox without ffmpeg installed; those steps are explicitly marked for manual local verification by the user.
