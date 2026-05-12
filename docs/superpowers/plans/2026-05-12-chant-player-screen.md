# 應援曲播放畫面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 ChantPlayerScreen，讓球迷點選球員頭像就能播放應援曲，播完自動輪播整隊。

**Architecture:** 新增獨立的 `ChantPlayerScreen.vue` 元件，掛載在 `App.vue` 的 `mode === 'chantPlayer'` 路由下。畫面分兩個視圖（選隊 / 球員+播放），狀態全在元件內部管理。沿用 Supabase 讀取球員資料，UI 使用 ui-ux-pro-max 設計。

**Tech Stack:** Vue 3 Composition API、Tailwind CSS、HTML Audio API、Supabase

---

## 檔案異動

- **Create:** `src/components/ChantPlayerScreen.vue` — 主畫面元件（選隊視圖 + 球員視圖 + 播放控制）
- **Modify:** `src/App.vue` — import ChantPlayerScreen，新增 `v-if="mode === 'chantPlayer'"` 路由
- **Modify:** `src/components/MenuScreen.vue` — 新增「🎵 應援曲」按鈕，emit `go-chant`

---

## Task 1：MenuScreen 新增入口 + App.vue 路由

**Files:**
- Modify: `src/components/MenuScreen.vue`
- Modify: `src/App.vue`

- [ ] **Step 1：在 MenuScreen 遊戲模式按鈕區塊後新增「應援曲」按鈕**

找到 `src/components/MenuScreen.vue` 中遊戲模式的 grid（3 個按鈕那段），在它後方（`</div>` 後、`<div v-if="!isLoading && !loadError" class="flex items-center justify-center gap-4">` 前）插入：

```html
<!-- 應援曲模式 -->
<div v-if="!isLoading && !loadError" class="mt-4">
  <button @click="$emit('go-chant')"
    class="w-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-150 transform hover:scale-105 cursor-pointer flex items-center justify-center gap-3">
    <span class="text-4xl">🎵</span>
    <div class="text-left">
      <div class="text-2xl font-black text-white">應援曲</div>
      <div class="text-pink-100 font-bold text-sm">點選球員播放加油歌</div>
    </div>
  </button>
</div>
```

- [ ] **Step 2：在 MenuScreen 的 `defineEmits` 加入 `go-chant`**

找到 `src/components/MenuScreen.vue` 末尾：

```js
defineEmits(['select-mode', 'retry', 'go-admin']);
```

改為：

```js
defineEmits(['select-mode', 'retry', 'go-admin', 'go-chant']);
```

- [ ] **Step 3：在 App.vue 中 import ChantPlayerScreen 並加入路由**

找到 `src/App.vue` 的 `<script setup>` 中 import 區塊，新增：

```js
import ChantPlayerScreen from './components/ChantPlayerScreen.vue'
```

找到 `<!-- 主選單畫面 -->` 的 `<MenuScreen>` 標籤，新增 `@go-chant="mode = 'chantPlayer'"` prop：

```html
<MenuScreen
  v-if="mode === 'menu'"
  :is-loading="isLoading"
  :load-error="loadError"
  :roster-count="roster.length"
  @select-mode="selectMode"
  @retry="loadCSVFromURL"
  @go-admin="mode = 'admin'"
  @go-chant="mode = 'chantPlayer'"
/>
```

在 `AdminScreen` 的 `v-if` 區塊前插入：

```html
<!-- 應援曲播放畫面 -->
<ChantPlayerScreen
  v-if="mode === 'chantPlayer'"
  @back="mode = 'menu'"
/>
```

- [ ] **Step 4：建立空白的 ChantPlayerScreen.vue（讓 import 不報錯）**

建立 `src/components/ChantPlayerScreen.vue`：

```vue
<template>
  <div class="w-full h-full bg-slate-900 text-white flex items-center justify-center">
    <p class="text-slate-400">應援曲（施工中）</p>
  </div>
</template>

<script setup>
defineEmits(['back'])
</script>
```

- [ ] **Step 5：確認 dev server 無報錯，主選單出現「🎵 應援曲」按鈕，點入顯示施工中**

```bash
npm run dev
```

預期：主選單底部有粉紅色「應援曲」按鈕，點擊進入顯示「應援曲（施工中）」，無 console error。

- [ ] **Step 6：Commit**

```bash
git add src/components/MenuScreen.vue src/App.vue src/components/ChantPlayerScreen.vue
git commit -m "feat: add chant player screen route and menu entry"
```

---

## Task 2：選隊視圖

**Files:**
- Modify: `src/components/ChantPlayerScreen.vue`

> **重要：** 這個 Task 的 UI 實作**必須使用 `superpowers:ui-ux-pro-max` skill**。先呼叫該 skill，讓它指導你設計選隊視圖的 HTML/CSS，再把結果整合進元件。

- [ ] **Step 1：呼叫 `superpowers:ui-ux-pro-max` skill**

使用 `Skill` 工具呼叫 `ui-ux-pro-max`，描述需求如下：

> 設計一個全螢幕的「選隊頁」，用於棒球 CPBL 應援曲播放 App。
> - 深色背景（slate-900 或更深）
> - 6 支球隊以大格子 2 欄排列顯示
> - 每格：球隊 Logo 圖片（圓形或方形大圖）+ 球隊名稱
> - 字體大、按鈕大，適合平板/手機觸控
> - 左上角有「← 返回」按鈕
> - 風格：claymorphism 或深色 glassmorphism，鮮豔活潑

取得設計後整合進元件。

- [ ] **Step 2：將 ChantPlayerScreen.vue 替換為含選隊視圖的完整版**

根據 ui-ux-pro-max 的設計，實作以下功能：

```vue
<template>
  <div class="w-full h-full bg-slate-900 text-white flex flex-col overflow-hidden">
    <!-- 選隊視圖 -->
    <div v-if="!selectedTeam" class="flex-1 flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="flex items-center gap-4 px-6 py-4 flex-shrink-0">
        <button @click="$emit('back')"
          class="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-sm font-bold transition">
          ← 返回
        </button>
        <h1 class="text-2xl font-black">🎵 選擇隊伍</h1>
      </div>
      <!-- 6 隊 Grid（由 ui-ux-pro-max 提供的設計填入此處） -->
      <div class="flex-1 overflow-y-auto px-4 pb-6">
        <div class="grid grid-cols-2 gap-4">
          <button
            v-for="team in CPBL_TEAMS"
            :key="team"
            @click="selectTeam(team)"
            class="[由 ui-ux-pro-max 設計提供的 class]"
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
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
```

> **注意：** 把 ui-ux-pro-max 提供的實際 Tailwind class 填入 `[由 ui-ux-pro-max 設計提供的 class]` 處，不要保留 placeholder 字樣。

- [ ] **Step 3：確認選隊頁正常顯示**

預期：6 隊大格子顯示，每格有 Logo、隊名、應援曲數量，點擊後 `selectedTeam` 被設定（此時畫面會空白，下一個 Task 實作球員視圖）。

- [ ] **Step 4：Commit**

```bash
git add src/components/ChantPlayerScreen.vue
git commit -m "feat: add team selection view to ChantPlayerScreen"
```

---

## Task 3：球員頭像網格視圖

**Files:**
- Modify: `src/components/ChantPlayerScreen.vue`

> **重要：** 球員網格 UI 同樣**必須使用 `superpowers:ui-ux-pro-max` skill**。

- [ ] **Step 1：呼叫 `superpowers:ui-ux-pro-max` skill**

使用 `Skill` 工具呼叫 `ui-ux-pro-max`，描述需求如下：

> 設計一個球員頭像網格區塊（上半部畫面），用於棒球 CPBL 應援曲播放 App。
> - 深色背景
> - 每格：圓形頭像照片（或 emoji placeholder）+ 姓名 + 背號
> - 正在播放的球員：黃色/金色發光框 + 脈動動畫
> - 沒有應援曲的球員：灰色半透明，視覺上暗示不可互動
> - 字體大，格子大，適合手指點擊
> - 3 欄排列

- [ ] **Step 2：在 template 的選隊視圖 `</div>` 後新增球員視圖**

在 `<div v-if="!selectedTeam"` 區塊結束後，加入球員視圖（`v-else`）：

```html
<!-- 球員視圖 -->
<div v-else class="flex-1 flex flex-col overflow-hidden">
  <!-- Header -->
  <div class="flex items-center gap-4 px-6 py-4 flex-shrink-0">
    <button @click="selectedTeam = null"
      class="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-sm font-bold transition">
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
          !player.song && 'opacity-40 cursor-not-allowed',
          player.song && currentIndex === idx && isPlaying
            ? '[由 ui-ux-pro-max 設計提供的 playing class]'
            : player.song ? '[由 ui-ux-pro-max 設計提供的 normal class]' : 'bg-slate-800'
        ]"
      >
        <div class="relative">
          <img
            v-if="player.photo"
            :src="player.photo"
            :alt="player.name"
            class="w-20 h-20 rounded-full object-cover border-4 border-transparent"
            :class="currentIndex === idx && isPlaying ? 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)]' : ''"
          />
          <div v-else
            class="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-3xl border-4"
            :class="currentIndex === idx && isPlaying ? 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)]' : 'border-transparent'"
          >⚾</div>
          <!-- 音符動畫（播放中） -->
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
    <!-- placeholder -->
  </div>
</div>
```

- [ ] **Step 3：在 script setup 新增播放狀態 reactive**

在 `function selectTeam(team)` 之後新增：

```js
const currentIndex = ref(-1)
const isPlaying = ref(false)
const audio = ref(null)

function startFrom(idx) {
  currentIndex.value = idx
  isPlaying.value = true
}
```

- [ ] **Step 4：確認球員網格正常顯示**

預期：點選隊伍後顯示球員頭像網格，有應援曲的球員正常顯示，無應援曲的半透明。點擊有應援曲的球員不報錯（播放邏輯 Task 4 實作）。

- [ ] **Step 5：Commit**

```bash
git add src/components/ChantPlayerScreen.vue
git commit -m "feat: add player grid view to ChantPlayerScreen"
```

---

## Task 4：播放區 + 自動輪播邏輯

**Files:**
- Modify: `src/components/ChantPlayerScreen.vue`

> **重要：** 播放區 UI **必須使用 `superpowers:ui-ux-pro-max` skill**。

- [ ] **Step 1：呼叫 `superpowers:ui-ux-pro-max` skill**

使用 `Skill` 工具呼叫 `ui-ux-pro-max`，描述需求如下：

> 設計一個音樂播放控制列（下半部畫面），用於棒球 CPBL 應援曲播放 App。
> - 深色玻璃背景（glassmorphism）
> - 左側：當前球員圓形大頭像（80px）
> - 中間：姓名（大字）、背號（小字）、進度條（細長條，顏色鮮豔）
> - 右側：上一首 ⏮ / 播放暫停 ⏯ / 下一首 ⏭ 三個大按鈕
> - 適合平板/手機

- [ ] **Step 2：將 Task 3 中的播放區 placeholder 替換為實際 UI**

找到 `<!-- placeholder -->` 那行，替換為根據 ui-ux-pro-max 設計的播放區 HTML。播放區需使用以下 Vue bindings：

- 當前球員：`teamPlayers[currentIndex]`（注意 currentIndex 可能為 -1，需 guard）
- 進度條：`progressPercent`（0–100）
- 播放/暫停按鈕：`@click="togglePlay"`
- 上一首：`@click="prevTrack"`
- 下一首：`@click="nextTrack"`

範例結構（class 由 ui-ux-pro-max 提供）：

```html
<div v-if="currentIndex >= 0 && teamPlayers[currentIndex]" class="[ui-ux-pro-max class]">
  <img v-if="teamPlayers[currentIndex].photo" :src="teamPlayers[currentIndex].photo"
    class="w-20 h-20 rounded-full object-cover flex-shrink-0" />
  <div v-else class="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-3xl flex-shrink-0">⚾</div>

  <div class="flex-1 min-w-0">
    <div class="font-black text-xl truncate">{{ teamPlayers[currentIndex].name }}</div>
    <div class="text-slate-400 text-sm">#{{ teamPlayers[currentIndex].number }}</div>
    <div class="mt-2 bg-slate-700 rounded-full h-2 overflow-hidden">
      <div class="h-full bg-yellow-400 transition-all duration-500 rounded-full"
        :style="{ width: progressPercent + '%' }"></div>
    </div>
  </div>

  <div class="flex items-center gap-3 flex-shrink-0">
    <button @click="prevTrack" class="[ui-ux-pro-max class]">⏮</button>
    <button @click="togglePlay" class="[ui-ux-pro-max class]">
      {{ isPlaying ? '⏸' : '▶' }}
    </button>
    <button @click="nextTrack" class="[ui-ux-pro-max class]">⏭</button>
  </div>
</div>
<div v-else class="flex items-center justify-center h-full text-slate-500 text-lg">
  點選球員開始播放
</div>
```

- [ ] **Step 3：實作播放邏輯**

將 script setup 中的 `startFrom`、`currentIndex`、`isPlaying`、`audio` 替換為完整實作：

```js
const currentIndex = ref(-1)
const isPlaying = ref(false)
const audio = ref(null)
const progressPercent = ref(0)

// 只取有歌的球員索引清單（用於輪播跳過無歌球員）
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
  const prev = playableIndices.value[(pos - 1 + playableIndices.value.length) % playableIndices.value.length]
  playAt(prev)
}

// 切換隊伍時停止播放
watch(selectedTeam, () => {
  stopAudio()
  currentIndex.value = -1
})

// 離開畫面時清理
onUnmounted(() => stopAudio())
```

同時在 import 行加上 `watch`：

```js
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
```

- [ ] **Step 4：完整測試播放流程**

1. 進入應援曲 → 選隊 → 點一個有應援曲的球員
2. 確認音樂開始播放，進度條推進，頭像有黃色發光框，音符動畫出現
3. 播完後自動跳下一首（有應援曲的球員）
4. 點「⏮」「⏭」確認切換
5. 點「⏸」確認暫停，再點「▶」確認繼續
6. 點另一隊，確認音樂停止，新隊球員顯示
7. 點「返回」到選隊頁，確認音樂停止

- [ ] **Step 5：Commit**

```bash
git add src/components/ChantPlayerScreen.vue
git commit -m "feat: add playback controls and autoplay to ChantPlayerScreen"
```
