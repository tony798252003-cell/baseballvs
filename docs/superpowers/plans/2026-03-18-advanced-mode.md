# 進階模式 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「進階模式」——對戰模式的嚴格版，要求 9 個打順各有唯一守備位置，代打後可整體重組守備，換攻守前必須補滿守位缺口。

**Architecture:** 在現有 versus 模式基礎上擴充。`awayTeam` / `homeTeam` 各自攜帶 `lineupPositions`（9位守位陣列）與 `pendingPositionFills`（待補清單）。選陣容階段加入每打順守位下拉；代打後檢查守位相容性；三出局前若有缺口，顯示 `DefenseReorganizeDialog`（表格式守備重組）。

**Tech Stack:** Vue 3 Composition API, Tailwind CSS

---

## 檔案清單

| 動作 | 路徑 | 說明 |
|------|------|------|
| 修改 | `src/components/MenuScreen.vue` | 新增進階模式按鈕 |
| 修改 | `src/components/LineupSelectionScreen.vue` | 進階模式每打順加守位下拉、停用隨機 |
| 修改 | `src/composables/useGameState.js` | awayTeam/homeTeam 新增 lineupPositions、pendingPositionFills；useGameState export 的 currentLineupPositions 改名為 `activeLineupPositions` 避免衝突 |
| 修改 | `src/composables/useInningManager.js` | checkGameEnd 支援 advanced |
| 修改 | `src/App.vue` | selectMode 初始化、confirmAwayTeam 儲存守位、substituteBatter 守位檢查、handleThreeOuts 觸發重組 |
| 新增 | `src/components/DefenseReorganizeDialog.vue` | 表格式守備重組對話框 |

---

## Task 1：MenuScreen 新增進階模式按鈕

**Files:**
- Modify: `src/components/MenuScreen.vue`

- [ ] **Step 1：在現有 grid 改為三欄並新增進階模式按鈕**

將 `grid grid-cols-2` 改為 `grid grid-cols-3`，新增：

```html
<button @click="$emit('select-mode', 'advanced')"
  class="bg-emerald-600 hover:bg-emerald-500 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-150 transform hover:scale-105 cursor-pointer min-h-11 flex flex-col items-center justify-center gap-2 border-l-4 border-emerald-400">
  <div class="text-3xl font-black text-white leading-tight">進階模式</div>
  <div class="text-emerald-100 font-bold text-base">嚴格守位</div>
</button>
```

- [ ] **Step 2：commit**

```bash
git add src/components/MenuScreen.vue
git commit -m "feat: 首頁新增進階模式按鈕"
```

---

## Task 2：useGameState 擴充守位狀態

**Files:**
- Modify: `src/composables/useGameState.js`

- [ ] **Step 1：awayTeam / homeTeam 初始結構加入 lineupPositions 和 pendingPositionFills**

將第 13-14 行改為：

```js
const awayTeam = ref({ lineup: [], pitcher: null, batterIndex: 0, lineupPositions: [], pendingPositionFills: [] })
const homeTeam = ref({ lineup: [], pitcher: null, batterIndex: 0, lineupPositions: [], pendingPositionFills: [] })
```

- [ ] **Step 2：resetGameState 也重置這兩個欄位**

```js
awayTeam.value.lineupPositions = []
awayTeam.value.pendingPositionFills = []
homeTeam.value.lineupPositions = []
homeTeam.value.pendingPositionFills = []
```

- [ ] **Step 3：export 新增兩個 computed，命名為 `activeLineupPositions` 和 `activePendingFills`（避免與 App.vue 選陣容用的臨時 ref 命名衝突）**

```js
const activeLineupPositions = computed(() =>
  isTop.value ? awayTeam.value.lineupPositions : homeTeam.value.lineupPositions
)
const activePendingFills = computed(() =>
  isTop.value ? awayTeam.value.pendingPositionFills : homeTeam.value.pendingPositionFills
)
```

並加入 return 物件。

- [ ] **Step 4：commit**

```bash
git add src/composables/useGameState.js
git commit -m "feat: useGameState 新增守位狀態欄位"
```

---

## Task 3：守位工具函式（App.vue）

- [ ] **Step 1：在 App.vue script setup 加入守位常數與驗證函式**

```js
const FIELDING_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']
const PITCHER_POSITIONS = ['SP', 'RP', 'CP', 'P']

function canPlayPosition(player, position) {
  if (position === 'DH') return !PITCHER_POSITIONS.includes(player.mainPosition)
  if (!player.mainPosition && !player.otherPositions) return true
  if (player.mainPosition === position) return true
  if (player.otherPositions) {
    return player.otherPositions.split('/').map(p => p.trim()).includes(position)
  }
  return false
}
```

- [ ] **Step 2：commit**

```bash
git add src/App.vue
git commit -m "feat: 新增守位驗證工具函式"
```

---

## Task 4：選陣容階段守位指派

**Files:**
- Modify: `src/App.vue`
- Modify: `src/components/LineupSelectionScreen.vue`

### App.vue 部分

- [ ] **Step 1：新增 `draftLineupPositions` ref（選陣容用臨時狀態，與 useGameState 的 `activeLineupPositions` 命名不同）**

```js
const draftLineupPositions = ref([]) // 選陣容時每打順的守位（字串）
```

- [ ] **Step 2：addToLineup 在 advanced 模式下同步新增空守位槽**

在 `addToLineup` 的正常新增球員邏輯後（`currentLineup.value = [...currentLineup.value, player]`），加：

```js
if (gameType.value === 'advanced') {
  draftLineupPositions.value = [...draftLineupPositions.value, '']
}
```

- [ ] **Step 3：removeFromLineup 同步移除對應守位**

在 `removeFromLineup` 的 splice 後加：

```js
if (gameType.value === 'advanced') {
  const newPos = [...draftLineupPositions.value]
  newPos.splice(index, 1)
  draftLineupPositions.value = newPos
}
```

- [ ] **Step 4：clearLineup 同步清空**

```js
if (gameType.value === 'advanced') draftLineupPositions.value = []
```

- [ ] **Step 5：confirmAwayTeam 驗證守位並儲存到 awayTeam**

在現有長度驗證後加：

```js
if (gameType.value === 'advanced') {
  const filled = draftLineupPositions.value.every(p => p !== '')
  const unique = new Set(draftLineupPositions.value).size === 9
  if (!filled || !unique) {
    showToast('請為 9 個打順各指定唯一守備位置', 'alert')
    return
  }
  awayTeam.value.lineupPositions = [...draftLineupPositions.value]
  draftLineupPositions.value = []
}
```

- [ ] **Step 6：startGame（確認主隊函式）加入相同驗證，儲存到 homeTeam**

找到確認主隊並開始比賽的函式，加入：

```js
if (gameType.value === 'advanced') {
  const filled = draftLineupPositions.value.every(p => p !== '')
  const unique = new Set(draftLineupPositions.value).size === 9
  if (!filled || !unique) {
    showToast('請為 9 個打順各指定唯一守備位置', 'alert')
    return
  }
  homeTeam.value.lineupPositions = [...draftLineupPositions.value]
}
```

- [ ] **Step 7：selectMode 改為 advanced 與 versus 共用初始化**

```js
if (type === 'versus' || type === 'advanced') {
  awayTeam.value = { lineup: [], pitcher: null, batterIndex: 0, lineupPositions: [], pendingPositionFills: [] }
  homeTeam.value = { lineup: [], pitcher: null, batterIndex: 0, lineupPositions: [], pendingPositionFills: [] }
  isSelectingAwayTeam.value = true
  needHomeTeamIntro.value = false
}
```

- [ ] **Step 8：把 `draftLineupPositions` 和更新函式傳給 LineupSelectionScreen**

```html
:draft-lineup-positions="gameType === 'advanced' ? draftLineupPositions : null"
@update:draft-lineup-position="updateDraftLineupPosition"
```

```js
const updateDraftLineupPosition = (index, position) => {
  const newPos = [...draftLineupPositions.value]
  newPos[index] = position
  draftLineupPositions.value = newPos
}
```

### LineupSelectionScreen.vue 部分

- [ ] **Step 9：新增 prop 與 emit**

```js
defineProps({
  // ...現有 props...
  draftLineupPositions: { type: Array, default: null },
})
defineEmits([
  // ...現有 emits...
  'update:draft-lineup-position'
])
```

- [ ] **Step 10：打序列表每個球員旁新增守位下拉（僅 advanced 模式顯示）**

在右側打序列表中，每個打順項目旁加：

```html
<select v-if="draftLineupPositions"
  :value="draftLineupPositions[index]"
  @change="$emit('update:draft-lineup-position', index, $event.target.value)"
  class="text-xs bg-slate-100 border border-slate-300 rounded px-1 py-0.5 ml-1">
  <option value="">--</option>
  <option v-for="pos in ['C','1B','2B','3B','SS','LF','CF','RF','DH']" :key="pos"
    :value="pos"
    :disabled="draftLineupPositions.includes(pos) && draftLineupPositions[index] !== pos">
    {{ pos }}
  </option>
</select>
```

- [ ] **Step 11：進階模式停用隨機選擇按鈕**

找到隨機選擇按鈕，加上 `v-if="gameType !== 'advanced'"`。

- [ ] **Step 12：commit**

```bash
git add src/App.vue src/components/LineupSelectionScreen.vue
git commit -m "feat: 進階模式選陣容守位指派 UI"
```

---

## Task 5：代打守位檢查

**Files:**
- Modify: `src/App.vue`（substituteBatter 函式）

- [ ] **Step 1：在 substituteBatter 現有打線替換邏輯之後，加入 advanced 模式守位判斷**

現有邏輯（第 425-448 行）已更新 `lineup.value[currentBatterIndex.value] = player`，在此**之後**加入：

```js
// 進階模式：同步更新 team object 並檢查守位相容性
if (gameType.value === 'advanced') {
  const idx = currentBatterIndex.value
  const team = isTop.value ? awayTeam.value : homeTeam.value
  const requiredPos = team.lineupPositions[idx]

  // 同步更新 team lineup（確保守備陣容資料與 lineup.value 一致）
  team.lineup[idx] = player

  if (canPlayPosition(player, requiredPos)) {
    // 守位相符，移除該打順的待補記錄（若有）
    team.pendingPositionFills = team.pendingPositionFills.filter(f => f.batterIndex !== idx)
  } else {
    // 守位不符，加入待補清單（避免重複）
    const alreadyPending = team.pendingPositionFills.some(f => f.batterIndex === idx)
    if (!alreadyPending) {
      team.pendingPositionFills.push({ batterIndex: idx, requiredPosition: requiredPos })
    }
  }
}
```

- [ ] **Step 2：commit**

```bash
git add src/App.vue
git commit -m "feat: 代打後守位相容性檢查"
```

---

## Task 6：DefenseReorganizeDialog 元件

**Files:**
- Create: `src/components/DefenseReorganizeDialog.vue`

- [ ] **Step 1：建立元件**

```vue
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
              <option v-for="p in lineupOptions(idx)" :key="p.id" :value="p.id">
                {{ p.name }} #{{ p.number }}
              </option>
            </optgroup>
            <optgroup label="板凳換入">
              <option v-for="p in benchOptions(idx)" :key="p.id" :value="p.id">
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
  // benchRoster：同隊可換入的球員（不含已在打線中的），由 App.vue 傳入過濾後的名單
  benchRoster: { type: Array, default: () => [] },
})

const emit = defineEmits(['confirm'])

function canPlayPosition(player, position) {
  if (position === 'DH') return !PITCHER_POSITIONS.includes(player.mainPosition)
  if (!player.mainPosition && !player.otherPositions) return true
  if (player.mainPosition === position) return true
  if (player.otherPositions) {
    return player.otherPositions.split('/').map(p => p.trim()).includes(position)
  }
  return false
}

const slots = ref(props.lineup.map((player, idx) => ({
  playerId: player?.id || '',
  playerObj: player,
  position: props.lineupPositions[idx] || '',
  hasProblem: props.pendingFills.some(f => f.batterIndex === idx),
  errorMsg: '',
})))

function lineupOptions(currentIdx) {
  // 目前打線中其他球員（可互換守位）
  return props.lineup.filter((p, i) => p && i !== currentIdx)
}

function benchOptions(currentIdx) {
  // 板凳球員：props.benchRoster 已由外部過濾為同隊且不在打線中的球員
  const inSlots = new Set(slots.value.filter((_, i) => i !== currentIdx).map(s => s.playerId))
  return props.benchRoster.filter(p => !inSlots.has(p.id))
}

function isPositionTaken(pos, currentIdx) {
  return slots.value.some((s, i) => i !== currentIdx && s.position === pos)
}

function onPlayerChange(idx, event) {
  const id = event.target.value
  const fromLineup = props.lineup.find(p => p?.id === id)
  const fromBench = props.benchRoster.find(p => p.id === id)
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

const problemCount = computed(() => slots.value.filter(s => s.hasProblem).length)

function confirm() {
  if (problemCount.value > 0) return
  emit('confirm', {
    newLineup: slots.value.map(s => s.playerObj),
    newPositions: slots.value.map(s => s.position),
  })
}
</script>
```

- [ ] **Step 2：commit**

```bash
git add src/components/DefenseReorganizeDialog.vue
git commit -m "feat: 新增 DefenseReorganizeDialog 守備重組對話框"
```

---

## Task 7：三出局前觸發守備重組

**Files:**
- Modify: `src/composables/useInningManager.js`
- Modify: `src/App.vue`

### useInningManager.js

- [ ] **Step 1：checkGameEnd 改為 `!== 'single'`**

```js
const checkGameEnd = () => {
  if (inning.value > 9) {
    if (gameType.value !== 'single') {
      showToast(TEXTS.game.gameOver(score.away, score.home), TEXTS.toast.alert)
    } else {
      showToast(TEXTS.game.gameOverSingle(score.away), TEXTS.toast.alert)
    }
    mode.value = 'menu'
    return true
  }
  return false
}
```

- [ ] **Step 2：commit**

```bash
git add src/composables/useInningManager.js
git commit -m "fix: checkGameEnd 支援 advanced 模式"
```

### App.vue

- [ ] **Step 3：抽出 buildVersusCallbacks 函式**

將現有 `handleThreeOuts` 內的 inline callbacks 物件抽為函式，確認與現有傳遞的欄位完全一致：

```js
const buildVersusCallbacks = () => ({
  playLineupIntro,
  speakBatterName,
  playBatterMusic,
  currentPlayer,
  showLineupIntro,
  introIndex,
  needHomeTeamIntro,
  isMuted,
  audioRef,
  teamChants,
})
```

- [ ] **Step 4：新增守備重組對話框狀態**

```js
const showDefenseReorganize = ref(false)
const pendingThreeOutsCallbacks = ref(null)
```

- [ ] **Step 5：新增 benchRoster computed（同隊且不在當前打線的球員）**

```js
const benchRoster = computed(() => {
  const currentLineupIds = new Set(lineup.value.map(p => p?.id).filter(Boolean))
  const currentTeam = isTop.value ? awayTeam.value.lineup[0]?.team : homeTeam.value.lineup[0]?.team
  return roster.value.filter(p => p.team === currentTeam && !currentLineupIds.has(p.id))
})
```

- [ ] **Step 6：修改 handleThreeOuts**

```js
const handleThreeOuts = () => {
  if (gameType.value === 'advanced') {
    const team = isTop.value ? awayTeam.value : homeTeam.value
    if (team.pendingPositionFills.length > 0) {
      pendingThreeOutsCallbacks.value = buildVersusCallbacks()
      showDefenseReorganize.value = true
      return
    }
    // 無缺口，防禦性清空並換攻守
    team.pendingPositionFills = []
    inningManager.handleThreeOutsVersus(buildVersusCallbacks())
    return
  }
  if (gameType.value === 'versus') {
    inningManager.handleThreeOutsVersus(buildVersusCallbacks())
  } else {
    inningManager.handleThreeOutsSingle(nextBatter)
  }
}
```

- [ ] **Step 7：守備重組確認後的處理**

```js
const onDefenseReorganizeConfirm = ({ newLineup, newPositions }) => {
  const team = isTop.value ? awayTeam.value : homeTeam.value
  // 更新 team object（switchTeam 會從這裡取值）
  team.lineup = newLineup
  team.lineupPositions = newPositions
  team.pendingPositionFills = []
  showDefenseReorganize.value = false
  // 繼續三出局換攻守（switchTeam 內部會更新 lineup.value）
  if (pendingThreeOutsCallbacks.value) {
    inningManager.handleThreeOutsVersus(pendingThreeOutsCallbacks.value)
    pendingThreeOutsCallbacks.value = null
  }
}
```

- [ ] **Step 8：import 並在 template 加入 DefenseReorganizeDialog**

```js
import DefenseReorganizeDialog from './components/DefenseReorganizeDialog.vue'
```

```html
<DefenseReorganizeDialog
  v-if="showDefenseReorganize"
  :lineup="isTop ? awayTeam.lineup : homeTeam.lineup"
  :lineup-positions="isTop ? awayTeam.lineupPositions : homeTeam.lineupPositions"
  :pending-fills="isTop ? awayTeam.pendingPositionFills : homeTeam.pendingPositionFills"
  :bench-roster="benchRoster"
  @confirm="onDefenseReorganizeConfirm"
/>
```

- [ ] **Step 9：commit**

```bash
git add src/App.vue src/composables/useInningManager.js
git commit -m "feat: 三出局前觸發守備重組，進階模式完整整合"
```

---

## Task 8：收尾與整合測試

- [ ] **Step 1：手動測試進階模式流程**
  1. 首頁點「進階模式」→ 進入選陣容
  2. 選 9 人但不指定守位 → 確認應被擋下（toast 提示）
  3. 指定守位但重複 → 守位下拉 disabled，無法選取
  4. 正確選完 9 人 + 各自不重複守位 + 投手 → 可進入比賽
  5. 比賽中代打一個守位**符合**的球員 → 三出局後直接換攻守，無彈窗
  6. 比賽中代打一個守位**不符**的球員 → 三出局後彈出守備重組對話框
  7. 守備重組表格中：調動現有打線球員守位 + 從板凳補人 → 缺口標紅
  8. 補滿後按確認 → 換攻守正常繼續

- [ ] **Step 2：確認 versus 模式未受影響**
  1. 首頁點「對戰模式」→ 選陣容無守位下拉
  2. 比賽正常進行，三出局直接換攻守

- [ ] **Step 3：commit & push**

```bash
git add .
git commit -m "feat: 進階模式完整實作"
git push
```
