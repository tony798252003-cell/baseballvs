# 後台音樂設定流程改版 設計規格

**日期：** 2026-07-23
**功能：** 移除已廢棄的 Google Sheet CSV 對應流程，改用 Dropbox 檔名比對匯入球員應援歌；新增本地 CLI 工具處理「音檔後製 → 上傳 → 入庫」一條龍。

---

## 背景與目標

這是「大改版」規劃中的第一個子專案（其餘兩個子專案——比賽記分主流程、整體視覺風格——留待後續各自開一輪 brainstorming，不在本文件範圍內）。

目前新增球員個人應援歌的實際流程是：

1. 在 YouTube 找到想要的音樂（手動，不自動化）
2. 用線上轉檔網站轉成 mp3
3. 用另一個線上工具裁切
4. 手動把檔案改名、上傳到 Dropbox、產生分享連結
5. 打開 AdminScreen「全部球員」tab，開編輯 modal，貼上連結儲存

AdminScreen 裡還留著一條「未對應音樂」tab，是舊的 Google Sheet CSV 比對流程，現在已經沒在用，但仍佔用介面空間、容易誤導。

同時 `scripts/restore-songs.mjs` 也是基於同一份 Google Sheet CSV 寫的一次性腳本，屬於同個廢棄流程的殘留，本次不處理（不刪除，因為是一次性歷史腳本，不影響現行功能；如未來需要清理可另外處理）。

### 目標

- 移除沒人用的 Google Sheet CSV 對應介面，簡化 AdminScreen。
- 新增以 Dropbox 資料夾檔名比對為主的匯入機制，作為**盤點/補救**用途（保留在 App 內，供尚未經過新 CLI 工具、或歷史遺留檔案的情況使用）。
- 新增本地 CLI 工具，把「裁切、合併、調音量、命名、上傳 Dropbox、寫入資料庫」全部串成一個指令，取代現在分散在多個網站/App 之間的手動流程，成為新增應援歌的**主要路徑**。
- 保留「誰還沒有應援歌」的全域可見性（現有 header 計數器）。

---

## 範圍

### 1. AdminScreen Tab 調整

移除**未對應音樂**tab 及其邏輯：
- 移除 `CSV_URL`、`csvUnmatched`、`selectedCsvPlayer`、`selectCsvPlayer()`、`mapPlayers()`、`filteredDbPlayers` 及對應的左右配對面板 template。
- `loadData()` 中移除 fetch CSV 與比對未對應球員的段落。

保留的三個 tab：**全部球員** / **嗆斯曲** / **音樂狀態**。

Header 的「未設定音樂：X 人」計數（`unmappedPlayers.length`，即 `dbPlayers.filter(p => !p.song)`）維持不變，不受 tab 切換影響，作為隨時可見的整體進度指標。

### 2. 音樂狀態 tab：新增 Dropbox 匯入區塊

在現有「音樂狀態」tab 頂部（驗證按鈕列上方）新增一個可收折區塊「☁️ Dropbox 匯入」，UI 樣式比照「嗆斯曲」tab 既有的 Dropbox 同步區塊（token 輸入、資料夾路徑、掃描按鈕、預覽清單、確認匯入按鈕）。

**共用與差異：**
- Dropbox Access Token 欄位與嗆斯曲 tab 共用同一個 `dropboxToken` state（同一組 Dropbox App，不用重複貼兩次）。
- 資料夾路徑分開：嗆斯曲維持 `/Music/Chance`，本區塊新增獨立 state `playerDropboxFolder`，預設值 `/Music/Players`。

**檔名比對規則：**
- 檔名格式：`球隊 - 姓名.mp3`（與嗆斯曲 tab 相同格式，一致好記）。
- 解析後用「球隊 + 姓名」兩欄位（trim 後）exact match 現有 `dbPlayers`。

**掃描結果分三組顯示：**

| 分組 | 條件 | 預設勾選 | UI 提示 |
|------|------|----------|---------|
| 新增 | 解析成功、找到唯一對應球員、該球員目前 `song` 為空 | ✅ 預設勾選 | 綠色標籤「新增」 |
| 覆蓋 | 解析成功、找到唯一對應球員、該球員目前已有 `song` | ⬜ 預設不勾選 | 黃色標籤「已有音樂，是否覆蓋」，同時顯示目前的 URL 供比對 |
| 無法處理 | 檔名格式不符、或比對不到球員、或同隊同名有多筆（罕見） | 不可勾選，僅列出 | 灰色列表，顯示原因（格式錯誤 / 找不到球員 / 同名多筆需手動處理）|

「確認匯入」只處理「新增」與「覆蓋」兩組裡被勾選的項目：
1. 對每個勾選項目呼叫 Dropbox `create_shared_link_with_settings`（若已存在則取用既有連結，比照嗆斯曲 tab 現有錯誤處理），轉換成 `?raw=1` 格式。
2. `supabase.from('players').update({ song: url }).eq('id', ...)`。
3. 更新本地 `dbPlayers` 與 `musicStatusMap`（設為 `pending`，因為還沒重新驗證）。
4. Toast 顯示成功/失敗筆數，比照嗆斯曲 tab 現有模式。

### 3. 本地 CLI 工具：`scripts/add-player-song.mjs`

延續 `scripts/restore-songs.mjs` 的既有寫法（node ESM + `@supabase/supabase-js`，直接建立 client），新增一支互動式腳本，涵蓋「音檔後製 → 上傳 → 入庫」全流程，取代現在分散在多個網站/工具間的手動步驟。**YouTube 抓取音源本身不自動化**，工具從「本機已有一個音檔」開始接手。

**用法：**
```
node scripts/add-player-song.mjs <音檔路徑> [第二段音檔路徑]
```
第二個路徑為選填，用於銜接兩段音樂（例如 intro + 主歌）。

**互動流程：**
1. 從 Supabase 撈 `players`，依輸入的姓名關鍵字模糊搜尋，列出候選（含隊伍、背號）供選擇；若唯一符合則直接確認。
2. 對每個輸入音檔詢問裁切區間（起始/結束時間，格式 `mm:ss`，留空 = 不裁切）。
3. 若有第二段音檔，詢問是否要正規化銜接（直接接續，不做淡入淡出，保持簡單）。
4. 詢問是否要音量正規化（ffmpeg `loudnorm`）或指定 dB 調整值（留空 = 不調整）。
5. 依序呼叫 ffmpeg（`child_process`）：裁切各段 → 合併（若有第二段） → 調音量 → 輸出成暫存 mp3。
6. 依「球隊 - 姓名.mp3」規則命名，透過 Dropbox API 上傳到 `/Music/Players/`（已存在同名檔案則覆蓋，因為就是同一位球員換歌的情境）。
7. 產生分享連結，轉換成 `?raw=1` 格式（沿用 AdminScreen 既有邏輯）。
8. `supabase.from('players').update({ song: url }).eq('id', 選定的球員id)`。
9. 印出完成摘要（球員姓名、Dropbox 路徑、寫入的 URL）。

**設定：**
- Dropbox Access Token 存於本地 `.env`（新增 `DROPBOX_TOKEN=...`），並將 `.env` 加入 `.gitignore`（若尚未忽略）。
- 前提：本機需安裝 `ffmpeg`（`brew install ffmpeg`），腳本啟動時檢查 `ffmpeg` 是否可執行，找不到則印出安裝提示並結束。

**錯誤處理：**
- 找不到符合的球員 → 印出提示，結束（不建立任何檔案/連結）。
- ffmpeg 處理失敗 → 印出 ffmpeg 錯誤訊息，不進行後續上傳/寫入。
- Dropbox 上傳或建立分享連結失敗 → 印出錯誤，不寫入 Supabase（避免資料庫指向不存在的檔案）。

---

## 不在範圍內

- YouTube 音源下載/擷取自動化（不做）。
- 比賽記分主流程改版、整體視覺風格改版（各自獨立子專案，後續另開 brainstorming）。
- 團隊嗆斯曲（`team_chants`）流程本身不變動，僅與新功能共用 Dropbox token 欄位。
- `scripts/restore-songs.mjs`（舊 Google Sheet 腳本）不刪除、不修改，視為歷史一次性腳本。
- 音檔淡入淡出等進階混音效果（合併僅做直接銜接）。
- Dropbox 掃描比對的「同隊同名多筆」自動判斷（列為需手動處理，不強行猜測）。

---

## 驗證方式

- AdminScreen：移除未對應音樂 tab 後，確認畫面正常渲染、無殘留死碼呼叫；Dropbox 匯入區塊以測試資料夾驗證三種分組（新增/覆蓋/無法處理）皆正確分類，確認匯入後 `players.song` 與 UI 狀態同步更新。
- CLI 工具：以一個已知球員 + 測試音檔跑過完整流程，確認裁切/合併/調音量後的檔案可正常播放、Dropbox 連結可用、Supabase 對應球員的 `song` 欄位確實更新。
