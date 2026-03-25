# 進階模式設計文件

## 概覽

新增「進階模式」，從首頁進入，為對戰模式的嚴格版本。強制要求 9 個打順各對應唯一的守備位置（含 DH），並在換攻守前強制補上因代打產生的守位缺口。

---

## 1. 首頁 MenuScreen

新增第三個按鈕「進階模式」，樣式獨立（例如綠色），副標題「嚴格守位」。
觸發 `$emit('select-mode', 'advanced')`。

`gameType` 新增 `'advanced'`，對 App.vue 現有的 `'single'` / `'versus'` 邏輯向下相容。進階模式在多數地方與 versus 相同（如 `checkGameEnd`、記分板、換攻守），共用判斷可改為 `gameType !== 'single'`。

---

## 2. 選陣容階段（LineupSelectionScreen）

`gameType === 'advanced'` 時，啟用進階選陣容 UI：

- 與 versus 相同：先選客隊，再選主隊
- 9 個打順各需：
  - 選一位球員（從球員選擇器）
  - 指定一個守備位置（下拉：C / 1B / 2B / 3B / SS / LF / CF / RF / DH）
- 驗證規則：
  - 若球員的 `mainPosition` 和 `otherPositions` 皆為空，視為「自由球員」，可擔任任何守位
  - 否則球員的 `mainPosition` 或 `otherPositions`（camelCase，對齊現有程式碼）必須包含所選守位
  - DH 為特殊守位：任何非投手球員皆可擔任 DH，不需守位驗證
  - SP/RP/CP 不算野手守位
  - 9 個守位不得重複
  - 未通過驗證不得進入比賽
- 投手仍單獨選，不佔打序（同 versus 邏輯）
- 進階模式下**停用隨機選擇功能**（因需手動指定守位）

---

## 3. 遊戲狀態擴充（useGameState）

新增以下狀態，分別記錄客隊與主隊：

```js
// 每支隊伍 9 個打順對應的守備位置（camelCase）
// e.g. ['C', '1B', 'SS', '3B', 'LF', 'CF', 'RF', '2B', 'DH']
const awayLineupPositions = ref([])  // 存在 awayTeam 物件內
const homeLineupPositions = ref([])  // 存在 homeTeam 物件內

// 守位待補清單（分開儲存，避免換攻守時互相汙染）
// awayTeam.pendingPositionFills / homeTeam.pendingPositionFills
// 格式：{ batterIndex: number, requiredPosition: string }[]
```

`awayTeam` 和 `homeTeam` 的資料結構擴充：

```js
const awayTeam = ref({ lineup: [], pitcher: null, batterIndex: 0, lineupPositions: [], pendingPositionFills: [] })
const homeTeam = ref({ lineup: [], pitcher: null, batterIndex: 0, lineupPositions: [], pendingPositionFills: [] })
```

`switchTeams()` 不需要特別處理 lineupPositions，因為守位資料已存在各隊的物件內，切換 lineup 時一起取用。

取得當前進攻隊守位的方式：

```js
const currentLineupPositions = computed(() =>
  isTop.value ? awayTeam.value.lineupPositions : homeTeam.value.lineupPositions
)
const currentPendingFills = computed(() =>
  isTop.value ? awayTeam.value.pendingPositionFills : homeTeam.value.pendingPositionFills
)
```

---

## 4. 代打邏輯（App.vue 的 substituteBatter）

進階模式下代打時（在現有 `substituteBatter` 函式內擴充）：

1. 將新打者換入打線（同現有邏輯）
2. 取得該打順的 `requiredPosition = currentLineupPositions.value[batterIndex]`
3. 若 requiredPosition 為 `'DH'`：不需驗證，直接更新守位對應為 DH
4. 否則若新打者的 `mainPosition` 和 `otherPositions` 皆為空（自由球員），視為符合任何守位
5. 否則檢查新打者的 `mainPosition` / `otherPositions` 是否包含 requiredPosition
5. 若不包含 → 將 `{ batterIndex, requiredPosition }` 加入當前進攻隊的 `pendingPositionFills`
6. 若包含 → 更新當前進攻隊的 `lineupPositions[batterIndex]`

---

## 5. 換攻守前強制換守備（handleThreeOuts）

進階模式三出局時，換攻守前先檢查**當前進攻隊**的 `pendingPositionFills`：

- 若為空 → 正常換攻守
- 若非空 → 顯示「守位補強」對話框（ForceSubstituteDialog）
- 換攻守完成後清空**剛結束進攻**那隊的 `pendingPositionFills`

**ForceSubstituteDialog（表格式守備重組）**：

顯示 9 個打順 × 守備位置的表格，每行顯示：打順編號、目前球員名字、守備位置下拉。

操作邏輯：
- 下拉可選「現有打線內的其他球員」（若該球員守位合格）或「從板凳換入新球員」
- 自由球員（無設定守位）可填任何位置
- DH 位置任何非投手球員皆可
- 若某行球員被調走守別的位置，原本的位置自動標紅（缺口）
- 表格底部顯示「缺口數量」，全部填滿才可按「確認」
- 確認後更新整個 `lineupPositions` 及 `lineup`（若有換入新球員）

---

## 6. 進階模式在現有 versus 邏輯的相容

凡現有程式碼判斷 `gameType.value === 'versus'` 的地方，若進階模式需要相同行為，改為 `gameType.value !== 'single'`。包含：
- `useInningManager.js` 的 `checkGameEnd()`
- App.vue 的換攻守、記分板、打線介紹等邏輯

---

## 7. 元件清單

| 元件/檔案 | 變更內容 |
|-----------|----------|
| `MenuScreen.vue` | 新增進階模式按鈕 |
| `LineupSelectionScreen.vue` | 進階模式下每打順附加守位下拉；停用隨機選擇 |
| `useGameState.js` | awayTeam/homeTeam 新增 lineupPositions、pendingPositionFills |
| `App.vue` | substituteBatter 守位檢查；handleThreeOuts 守位補強觸發 |
| `useInningManager.js` | checkGameEnd 改為 `!== 'single'` 判斷 |
| `ForceSubstituteDialog.vue` | 新元件：強制守位補強對話框 |

---

## 8. 不在範圍內

- 換投守位驗證（投手單獨管理）
- 單人模式的守位驗證
- 自動建議換人
