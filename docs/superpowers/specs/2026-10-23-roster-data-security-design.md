# 球員資料與後台安全改版 設計規格

**日期：** 2026-10-23
**功能：** 修補 Supabase 金鑰外洩與後台無權限控管；重做球員資料同步（CPBL 現役＋離隊標記＋歷史球員補齊、日職完整名單、精選 MLB 球員）；前台改為「聯盟 → 球隊」分類；應援曲新增通用備案；清理殘留檔案。

---

## 背景與目標

這是「大改版」的下一階段。大改版目前拆成五塊，依序進行：

1. **安全**（本文件）
2. **球員資料**（本文件）
3. **清理殘留檔案**（本文件，附帶小項）
4. 視覺風格：之後重新 brainstorming，**不沿用** `2026-07-24-visual-style-redesign-design.md` 的結論
5. 比賽記分規則／遊戲模式：之後重新 brainstorming

（先前已完成：後台音樂設定流程，見 `2026-07-23-music-management-redesign-design.md`。）

### 使用者描述的問題

- 球員都有在名單裡，但很多人還沒做應援曲；使用者想支援**日職**和**部分 MLB** 球員。
- 已離隊的球員要保留（應援曲等手動資料是心血），只標記離隊；並希望**把以前的球員補齊**。
- 更新球員不需要按鈕，使用者會定期請 Claude 在本機跑同步。

### 調查發現的事實（2026-10-23）

- **Supabase 專案目前連不上**（`ehevruywqvpdbzveqxum.supabase.co` NXDOMAIN），使用者判斷是免費方案閒置被暫停。
- **`src/lib/supabase.js` 放的是 service_role key**（變數名寫 ANON，JWT payload 是 `"role":"service_role"`），打包進前端，任何人都有 DB 完整寫入權限。同一把 key 也硬寫在 `scripts/*.mjs`，且已在 git 歷史中。後台（`AdminScreen`）從主選單按鈕直接進入，沒有任何登入。
- **`scripts/scrape-cpbl.mjs` 目前跑不起來**：cpbl.com.tw 前的 HiNetCDN 第一次請求回 `308` 並 `Set-Cookie: __chtcdn=...`，Node `fetch` 不保留 cookie 導致無限轉址（`redirect count exceeded`）。解法：先 `redirect:'manual'` 取 cookie，之後請求帶 `Cookie` header。
- **姓名前綴清理漏了 `#`**：現有 regex `^[◎*＊※]+` 不含 `#`／`＃`／`✽`，會產生 `#麥斯威尼` 這類名字。官網 `/player` 頁圖例：`＃` 註銷註冊、`✽` 合約所屬（只能出賽二軍）、`◎` 自主培訓或測試洋將。
- **CPBL 洋將現有 selector 都抓得到**（中文音譯名、有 Acnt、有照片），結構同本土球員。
- **前台 `usePlayerData.js` 用 `select('*')` 不分頁**，PostgREST 預設單次上限 1000 筆。目前名單未觸頂（使用者確認人都在），但補齊歷史＋日職後必定超過。
- **官網沒有「退休／離隊」標記**：個人頁頁首只顯示最後所屬球隊（例：彭政閔仍顯示中信兄弟）。判斷離隊只能靠「不在當季六隊名單內」。
- **歷史球員可用 Acnt 流水號列舉**：`GET /team/person?Acnt=%010d`，無效號碼 302 回首頁；目前觀察最大值約 `0000007880`，約 8,000 次請求。
- **Supabase 已由使用者 Restore（2026-10-23）**，恢復後立即備份至 repo 外 `/Users/tonywang/orca/workspaces/baseballvs/backups/2026-10-23/`：`players` 621 筆、`team_chants` 23 筆。有 song 114 人、intro 65 人；姓名無符號污染；重複（姓名＋隊伍）3 組：郭俊麟（統一獅）、宋家豪（東北樂天金鷹）、孫易磊（北海道火腿鬥士），皆無應援曲；無 `cpbl_acnt` 的非教練 46 人（多為旅外）。
- **前台部署在 Vercel**（`https://baseballvs.vercel.app`，GitHub deployments 由 `vercel[bot]` 建立，push 到 `main` 觸發 Production）。
- repo 內沒有任何 schema／migration 檔。
- 播放邏輯（`src/composables/useAudio.js`）：intro → 循環 song；都沒有則隨機播該隊嗆斯曲（`team_chants`）；再沒有就不出聲。

### 目標

- 堵住金鑰外洩：前台只拿得到唯讀權限，寫入必須登入。
- 一支可重複執行的本機同步 script，負責 CPBL 現役名單與日職名單，正確標記離隊。
- 一次性補齊 CPBL 1990 年至今的歷史球員。
- 日職 12 隊完整名單；MLB 維持精選名單。
- 前台改為先選聯盟（中職／日職／美職）再選球隊，新增「離隊／歷史」分頁，可跨聯盟組隊。
- 沒有個人曲的球員也能出聲（通用應援曲備案）。

### 非目標

- 後台「同步 CPBL」按鈕或 Edge Function（使用者選擇由 Claude 定期在本機跑）。
- MLB 完整名單。
- 視覺風格、比賽記分規則的任何改動（第 4、5 塊另議）。
- 逐年球隊經歷：歷史球員只掛最後所屬球隊，不做「每段經歷一筆」。
- 自動找／做應援曲。

### 反目標（做了也算失敗）

- 同步時**刪除**或覆寫任何球員的 `song`／`intro`／`emoji`／`eye_mask_position`／`other_positions` 等手動欄位。
- 球員換隊或重跑同步後產生重複的球員資料。
- 選打線畫面的現役名單被數千名歷史球員淹沒。
- 安全修好了，但使用者自己在後台改歌、Dropbox 匯入、刪球員卻不能用了。

---

## 範圍

### 0. 前置（使用者執行）

~~使用者 Restore 專案、全表備份~~（2026-10-23 已完成，見上）。schema 變更前再備份一次。

第一支 migration 先補「現況 baseline schema」（含既有約束；`cpbl_acnt` 目前是否 unique 需確認——實作者準備一段查詢 `information_schema`／`pg_indexes` 的 SQL，請使用者在 dashboard SQL Editor 執行並回貼結果）。migration 存 `supabase/migrations/`，由使用者在 SQL Editor 執行或實作者用 service key 以外的方式執行（Supabase REST 無法跑 DDL）。

### 1. 安全

**1.1 金鑰**
- **輪替方式（Claude 的決定）**：改用 Supabase 新版 **publishable／secret key**，全部程式切換完成且 Vercel 部署成功後，再於 dashboard 停用 legacy JWT keys。如此舊 service_role（含 git 歷史中那把）失效，且不會登出既有 session。dashboard 操作由使用者執行，實作者提供逐步說明。不改寫 git 歷史。
- 前台 `src/lib/supabase.js` 改用 **publishable key**，從 `import.meta.env.VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 讀取。本機放 `.env`；Vercel 專案 Environment Variables 設同名變數（Production＋Preview），由使用者在 Vercel dashboard 設定或用 `vercel env` CLI。
- 順序很重要：先部署新版前台（用 publishable key）並確認運作，再停用 legacy keys，否則線上版會在中間斷線。
- 所有 `scripts/*.mjs` 改從 `.env` 讀 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`（沿用現有 `.env` 載入方式，即 Dropbox token 那套），移除硬寫的 key。`.env.example` 補上這些欄位（無值）。

**1.2 RLS**
- `players`、`team_chants`、新增的 `app_settings`（見 2.7）全部開啟 RLS。
- 政策：`anon` 與 `authenticated` 可 `select`；`insert`／`update`／`delete` 僅限 `authenticated` 且 `auth.jwt()->>'email'` 等於 `tony798252003@gmail.com`（寫在 policy 裡）。
- 本機 script 用 service_role，不受 RLS 影響。

**1.3 後台登入**
- 進入 `AdminScreen` 前若無 session，顯示登入畫面（Supabase Auth email＋密碼）。登入後 session 由 supabase-js 保存。
- 在 Supabase dashboard 關閉公開註冊，只手動建立 `tony798252003@gmail.com` 一個帳號（使用者操作）。
- 後台現有的所有寫入（編輯球員、刪除、嗆斯曲新增刪除、Dropbox 匯入）在登入狀態下照常運作——這是驗收重點。

### 2. 球員資料

**2.1 資料模型（`players` 新增欄位）**

| 欄位 | 型別 | 說明 |
|---|---|---|
| `org` | text, not null, default `'CPBL'` | 聯盟：`CPBL`／`NPB`／`MLB`。現有非 CPBL 的旅外球員依所屬隊伍回填 |
| `status` | text, not null, default `'active'` | `active`／`departed` |
| `roster_mark` | text, null | 官網名冊符號 `#`／`✽`／`◎`，原樣存，前台不顯示 |
| `npb_id` | text, unique, null | 日職球員的官網 ID，作為 NPB 同步的比對鍵 |
| `mlb_id` | integer, unique, null | MLB Stats API 的 person id（現有精選名單已有部分） |

- 既有 `league` 欄位維持「一軍／二軍」語意；日職「支配下登錄」→ `一軍`，「育成選手」→ `二軍`。
- 既有 `cpbl_acnt` 維持 CPBL 比對鍵（unique）。
- 欄位命名、是否加 index 等細節由實作者決定。

**2.2 隊名對照表**
- 一律中文隊名，建一份單一來源的對照表（建議放 `src/constants/teams.js`，前台與 script 共用）：每隊包含 `org`、中文隊名、logo 路徑、各來源的代碼（CPBL `ClubNo`、NPB 代碼）。
- 現有不一致的隊名統一（例：`LA道奇` → `洛杉磯道奇`）；「XX體系」（MLB 小聯盟）是否併入母隊由實作者依現有資料決定並列在 PR 說明。
- CPBL 已解散／改名球隊（兄弟象、Lamigo、興農、義大、時報鷹、三商虎、俊國熊、第一金剛等）保留原隊名，不給 logo 也可以。對照表為這些隊伍加一欄 **`successor`（接手球隊）**，例：兄弟象 → 中信兄弟、Lamigo → 樂天桃猿、義大 → 富邦悍將；無明確接手者（如時報鷹、三商虎）留空。各隊對應由實作者查證後列在 PR 說明。
- 隊名統一時，`team_chants.team` 需一起改，否則 `useAudio.js` 的字串比對會失效。
- 日職 12 隊 logo 由實作者從維基百科或官網下載，放 `public/logos/`，檔名比照現有英文小寫（例：`hanshin.png`）。

**2.3 球員姓名規則**
- **姓名語言看國籍，不看所屬聯盟。**
  - CPBL 球員：照官網中文（含洋將的中文音譯）。
  - 日本球員（不論在 NPB 或 MLB）：漢字原名，**不轉換字形**。
  - NPB 的外籍球員：照 NPB 官網的片假名原樣存。
  - 其他 MLB 球員：英文原名。
- 同步時清掉官網名冊符號前綴（`#`、`＃`、`✽`、`◎`、`*`、`＊`、`※`），清掉的符號存入 `roster_mark`。
- 前台打序清單：英文名（以拉丁字母為主的名字）只顯示姓（最後一個空白後的部分）；大格子（打者卡等）顯示全名。這一條在第 4 塊視覺改版時也要帶進去。

**2.3.1 既有資料一次性整理（Claude 的決定）**

- `original_team`：前台改為一律讀 `team`（`PlayerCard.vue`、`LineupIntroScreen.vue` 目前讀 `originalTeam`）。migration 把 `team = '其他球隊'` 的列改成 `original_team` 的真實隊名（例：達比修有 → 聖地牙哥教士）。欄位保留不再使用，標記為待清理；同步 script 不再寫入它。
- 沒有外部 ID 的既有球員（無 `cpbl_acnt`／`npb_id`／`mlb_id`），在各自來源首次同步時：**同 `org` 內同名且 DB 只有一筆** → 自動合併（補上外部 ID、更新官方欄位）；若有多筆同名，將手動欄位（`song`／`intro`／`emoji`／`eye_mask_position`／`other_positions`）搬到保留的那筆（只在目標欄位為空時搬），再刪除多餘的重複列。其他對不上的情況列成清單給使用者人工確認，**不自動刪除、不自動標離隊**。
- 前述 3 組重複資料以同一規則清掉。

**2.4 CPBL 現役同步（可重複執行）**

改寫 `scripts/scrape-cpbl.mjs`（或新檔，由實作者決定，但舊的不要並存）：

1. 處理 CDN cookie（見「調查發現的事實」）。
2. 抓 6 隊 × 一軍／二軍 共 12 頁名單，解析姓名、背號、照片、Acnt、名冊符號、守位分類。
3. 只對**DB 裡還沒有**的 Acnt 抓個人頁（投打習慣、詳細守位），已存在的球員不重抓個人頁。
4. 以 `cpbl_acnt` upsert，**只更新官方欄位**（`name`、`number`、`team`、`photo`、`league`、`roster_mark`、`status`，新球員才寫入投打習慣與守位），不碰手動欄位。
5. 離隊判斷：
   - 本次名單內、且 `roster_mark` 不是 `#` → `status = 'active'`。
   - `roster_mark = '#'`（註銷註冊）→ `departed`。
   - DB 裡 `org = 'CPBL'` 且有 `cpbl_acnt`、但本次名單沒出現 → `departed`，`team` 保留最後所屬隊伍。
   - 已 departed 的人重新出現在名單（回鍋）→ 改回 `active` 並更新隊伍。
6. 教練（無 Acnt）：用「姓名＋`is_coach`」比對（不再用姓名＋隊伍，避免換隊產生重複）；同名教練衝突時印警告不寫入。本次不在任何隊教練名單的教練 → `departed`。
7. **安全閥**：若某一頁解析出 0 人或比上次少一半以上，視為官網改版或抓取失敗，整次中止、不標記任何人離隊。
8. 結束時印摘要：新增 X、換隊 Y（列名單）、標記離隊 Z（列名單）、回鍋 W。

**2.5 CPBL 歷史球員補齊（一次性）**

新 script，例如 `scripts/backfill-cpbl-history.mjs`：

- 列舉 Acnt `0000000001` 到目前觀察最大值再往上多掃一段（連續 N 個無效才停，N 由實作者決定）。
- 節流約每秒 1 次；**可中斷續跑**（進度存在本機檔案，例如 `scripts/.cache/`，加入 `.gitignore`）。
- 每個有效 Acnt：解析姓名、背號、照片、投打習慣、守位、頁首最後所屬球隊（含「二軍」字樣判斷 `league`），以及能從個人頁判斷的教練／職員身分（若個人頁可區分；無法區分時寫入 PR 說明）。
- DB 已有該 Acnt → 不動（現役同步負責）；沒有 → 新增，`status = 'departed'`、`org = 'CPBL'`。
- 和 DB 既有「沒有 Acnt 的同名球員」（早期 CSV 匯入的資料）比對：同名同隊 → 補上 `cpbl_acnt` 而不是新增一筆；同名不同隊或多筆 → 列入待人工確認清單，不自動合併。
- 補完後跑一次 2.4 現役同步，讓現役者回到 `active`。

**2.6 日職同步（可重複執行）**

新 script，例如 `scripts/sync-npb.mjs`：

- 來源：NPB 官網各隊名單頁（`npb.jp` 球團選手一覽，確切 URL 與結構由實作者查證）。
- 範圍：12 隊的支配下登錄（→ `一軍`）與育成選手（→ `二軍`），是否含教練由實作者依頁面結構決定並說明。
- 以 `npb_id` 比對；現有旅外日職球員（無 `npb_id`）首次同步時用姓名＋隊伍對上並補 `npb_id`。
- 離隊規則同 CPBL：不在本次名單 → `departed`；同樣有安全閥。
- 照片：官網有就存 URL；投打習慣、守位從官網取得。
- 台灣旅日球員（例：古林睿煬、孫易磊、徐若熙）會出現在 NPB 官網名單中，以 NPB 同步為準，從精選名單移除以免雙重維護。

**2.7 MLB 精選名單**

- 把 `scripts/add-international-players.mjs` 中的硬寫名單抽成一份資料檔（例如 `scripts/data/mlb-players.json`），script 改為讀檔＋以 `mlb_id` upsert（沒有 `mlb_id` 的小聯盟球員用姓名＋隊伍）。
- 照片沿用現有 MLB headshot URL 規則。
- 使用者要新增 MLB 球員時，告訴 Claude 名字，由 Claude 查資料加進資料檔再跑。
- 精選名單中的人不做離隊判斷；要移除時從資料檔標記 `status: departed`。

**2.8 前台**

- **載入**：`usePlayerData.js` 分頁抓取（每頁 1000，用 `.range()` 迴圈）直到抓完，一次全部載入。對應新增欄位 `org`、`status`、`rosterMark`。
- **分類**：選人時最上層先選聯盟（中職／日職／美職），再選球隊；取代現在 `normalizeTeamName` 把非 CPBL 全部丟進「其他球隊」的邏輯。
  - 中職：6 隊（有 logo）。
  - 日職：12 隊（有 logo）。
  - 美職：依隊名分組，不需 logo。
- **離隊／歷史分頁**：現有一軍／二軍／教練／全部切換旁新增「離隊／歷史」。一軍／二軍／教練／全部只顯示 `status = 'active'`；「離隊／歷史」只顯示 `departed`，依最後所屬球隊分組（含已解散球隊）。
- **跨聯盟組隊**：打線選人不限聯盟、不限現役。實作者需確認 `LineupSelectionScreen`、`DefenseReorganizeDialog`、`ChantPlayerScreen` 等所有取用 roster 的地方都套上新分類，而不是只改一處。
- 這次只做分類邏輯與必要的 UI 元素，**不做視覺改版**，樣式沿用各畫面現有寫法。

**2.9 通用應援曲**

- 新增 `app_settings` 表（key／value），存 `generic_chant_url`。
- 後台「嗆斯曲」tab 新增一個欄位設定通用應援曲 URL（可沿用 Dropbox 分享連結格式）。
- 播放順序改為：intro → 循環 song；沒有 → 該隊嗆斯曲；該隊沒有嗆斯曲且對照表有 `successor` → 接手球隊的嗆斯曲；沒有 → 通用應援曲（循環）；再沒有才不出聲。

### 3. 清理

- 刪除根目錄 `app.jsx`（舊 React 版）、`index-vue.html`（CDN 版 Vue）、`src/App-Simple.vue`；刪除前用 grep 確認沒有任何引用（2026-10-23 檢查時無引用）。
- `scripts/import-players.mjs`（Google Sheet CSV 匯入，用 `insert` 會產生重複）：音樂改版已廢棄該 CSV 流程，刪除。`scripts/restore-songs.mjs` 先前 spec 決定保留，本次維持不動。
- README 更新：拿掉「CSV 球員名單匯入」，補上同步 script 的用法與 `.env` 欄位。

---

## 驗證方式

- **安全**：用 publishable key 對 `players` 做 `update` 應被 RLS 拒絕；前台 build 產物與 `https://baseballvs.vercel.app` 載入的 JS 中搜尋不到 service_role／secret key；停用 legacy keys 後，舊 service_role key 打 REST 回 401；未登入進後台出現登入畫面；登入後編輯歌曲、Dropbox 匯入、刪球員、新增嗆斯曲都成功。
- **CPBL 同步**：連跑兩次，第二次摘要應為 0 新增／0 換隊／0 離隊；姓名不含 `#` 等符號；抽查一位已知手動設定應援曲的球員，同步後 `song`／`intro` 不變；把某頁故意弄壞（或模擬回傳空頁）時整次中止且無人被標離隊。
- **歷史補齊**：中斷後重跑能從斷點續跑；抽查彭政閔、陳金鋒等退休球員存在且 `departed`；無重複 `cpbl_acnt`；列出「待人工確認」的同名清單交給使用者。
- **日職**：12 隊皆有資料，每隊人數合理（支配下約 60–70、育成數十）；台灣旅日球員不重複。
- **前台**：總筆數 > 1000 時前台載入筆數等於 DB 筆數；聯盟 → 球隊選單可選到日職、美職球員；現役分頁看不到 departed 球員，「離隊／歷史」看得到；可組一支混合中職＋日職的打線開打；英文名在打序清單只顯示姓。
- **接手球隊嗆斯曲**：挑一位最後所屬兄弟象、沒有個人曲的歷史球員，播放時播中信兄弟的嗆斯曲。
- **通用應援曲**：設定後，挑一位沒有個人曲、所屬隊伍也沒有嗆斯曲的球員（例如日職球員），播放時會播通用曲。

---

## 留給實作者決定

- 新增欄位的確切型別細節、index、migration 寫法（SQL 存在 repo 內，例如 `supabase/migrations/`）。
- 同步 script 的檔名與模組拆分（共用的 CDN cookie、Supabase client、`.env` 載入可放 `scripts/lib/`）。
- 歷史列舉的停止條件與節流參數。
- NPB 官網的抓取方式與欄位對應。
- MLB 「XX體系」是否併入母隊。
- 前台聯盟選單的具體 UI 形式（在既有畫面風格內）。
