# Dropbox 球隊嗆斯曲同步功能 Design

## Goal
在 AdminScreen 嗆斯曲 tab 新增一個 Dropbox 同步區塊，讓使用者輸入 access token 後自動偵測新應援曲並一鍵新增至 Supabase。

## Architecture
功能完全在 `AdminScreen.vue` 內實作，不新增額外檔案。呼叫 Dropbox HTTP API（fetch），解析檔名後與 Supabase `team_chants` 比對，顯示預覽讓使用者勾選確認後 insert。

## Tech Stack
- Dropbox API v2（HTTP fetch，無 SDK）
- Supabase JS client（已有）
- Vue 3 Composition API（已有）

---

## Data Flow

```
使用者輸入 access token
        ↓
POST /files/list_folder { path: "/Music" }
        ↓
解析 entries[].name: "{球隊} - {歌曲名}.mp3"
        ↓
比對 Supabase team_chants（team + name 組合）
        ↓
顯示新增項目預覽（可勾選，預設全選）
        ↓
使用者按「確認新增」
        ↓
對每個勾選項目：
  POST /sharing/create_shared_link_with_settings
  轉換 URL: dropbox.com → dl.dropboxusercontent.com
        ↓
Supabase insert team_chants { team, name, url }
```

## Dropbox API

### 列出檔案
```
POST https://api.dropboxapi.com/2/files/list_folder
Authorization: Bearer {token}
Content-Type: application/json
Body: { "path": "/Music" }
```
回傳 `result.entries[]`，每筆有 `.name`（檔名）和 `.path_lower`。

### 取得共享連結
```
POST https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings
Authorization: Bearer {token}
Content-Type: application/json
Body: { "path": "/Music/{filename}", "settings": { "requested_visibility": "public" } }
```
若連結已存在會回傳 409，錯誤 body 內含 `shared_link_already_exists.metadata.url`，直接使用即可。

### URL 轉換（可直接串流）
回傳的 shared link 結尾為 `?dl=0`，直接用 `.replace('?dl=0', '?raw=1')` 替換。
若無 `?dl=0`（少數情況），則在 URL 末尾加上 `?raw=1`。

## 檔名解析規則
- 格式：`{球隊} - {歌曲名}.mp3`
- 分隔符：` - `（空格破折號空格），**以第一個**分隔符切割（split limit 2）
  - 例如 `味全龍 - 主題曲 - 官方版.mp3` → team=`味全龍`、name=`主題曲 - 官方版`
- 副檔名：只處理 `.mp3`，其他跳過
- 無法解析（無分隔符）：跳過並在 UI 顯示警告

## 比對邏輯
已存在條件：`team_chants` 中有同 `team` 且同 `name` 的記錄（大小寫敏感）。
Supabase 端不需額外 unique constraint，前端比對後只 insert 不存在的項目，防止重複。

## Token 安全
Token 只存在 component state（ref），不寫 localStorage，頁面重整後自動清除。收折區塊不清除 token 和預覽清單（方便使用者展開重看）。

## 409 error 處理
```json
// Dropbox 409 error body 結構
{
  "error_summary": "shared_link_already_exists/...",
  "error": {
    ".tag": "shared_link_already_exists",
    "shared_link_already_exists": {
      "metadata": { "url": "https://www.dropbox.com/s/xxx/file.mp3?dl=0" }
    }
  }
}
```
解析 `error.shared_link_already_exists.metadata.url` 直接使用，再套 URL 轉換。

## 部分失敗
失敗項目不重試，完成後顯示「✅ 已新增 N 首（⚠ M 筆失敗）」即可。

## UI 設計

位於嗆斯曲 tab 最上方，可收折的「☁️ Dropbox 同步」區塊：

```
┌─ ☁️ Dropbox 同步 ──────────────────── [展開/收折] ─┐
│ Access Token: [________________________] [同步]     │
│                                                      │
│ （同步後顯示）                                        │
│ 找到 3 首新應援曲：                                   │
│ ☑ 味全龍 - 新歌名                                    │
│ ☑ 台鋼雄鷹 - 新歌名                                  │
│ ☑ 中信兄弟 - 新歌名                                  │
│ ⚠ 無法解析：filename_without_dash.mp3               │
│                          [全選] [確認新增 3 首]       │
└──────────────────────────────────────────────────────┘
```

### 狀態
- **idle**：只顯示 token 輸入欄 + 同步按鈕
- **loading**：按鈕 disabled + spinner
- **preview**：顯示新增清單（可勾選）+ 確認按鈕
- **confirming**：確認按鈕 disabled + spinner
- **done**：顯示「✅ 已新增 N 首」，清單消失

## Error Handling
- token 為空：toast 提示「請輸入 Access Token」
- API 401：toast「Token 無效或已過期」
- API 其他錯誤：toast「Dropbox 連線失敗」
- 找不到新應援曲：顯示「✅ 已是最新，無新增項目」
- 部分 insert 失敗：繼續其他項目，最後顯示「新增 N 首（M 筆失敗）」
