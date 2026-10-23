# ⚾ 棒球對決

Vue 3 + Vite + Tailwind CSS 打造的互動式棒球計分應用

## 功能特色

- 🎮 單人無限打擊 / 雙人攻守交換模式
- 📊 即時記分板與壘包顯示
- ⚡ 記球數功能（好球/壞球）
- 🎵 球員加油歌播放

## 安裝與運行

```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev

# 打包生產版本
npm run build

# 預覽生產版本
npm run preview

# 執行測試
npm test
```

管理後台需登入後才能使用。

## 環境變數（`.env`）

- `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`：同步腳本使用
- `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`：前端使用
- `DROPBOX_TOKEN`：加油歌檔案上傳
- `DROPBOX_APP_KEY`、`DROPBOX_APP_SECRET`：Dropbox App 金鑰（應援曲工作台、舊歌音量統一使用）
- `DROPBOX_REFRESH_TOKEN`：由 `scripts/dropbox-auth.mjs` 自動寫入，勿手動填

## 資料同步指令

皆預設為試跑（dry-run），加上 `--apply` 才會寫入資料庫。

```bash
# 同步 CPBL 球員名單
node scripts/scrape-cpbl.mjs [--apply]

# 新增國際球員
node scripts/add-international-players.mjs [--apply]

# 回填 CPBL 歷史球員（--limit 筆數、--start 起點、--progress <path> 進度檔，可中斷續跑）
node scripts/backfill-cpbl-history.mjs [--apply] [--limit N] [--start N] [--progress <path>]

# 一次性：正規化既有球員資料
node scripts/normalize-existing-players.mjs [--apply]
```

注意：`scripts/restore-songs.mjs` 與 `scripts/migrate-legacy-songs.mjs` 是舊的一次性工具，以姓名比對球員且未分頁（超過 1000 筆會漏），請勿用於現有資料。

## 應援曲工作台

### Dropbox 一次性授權

1. 到 Dropbox App Console 開啟權限：`files.content.read`、`files.content.write`、`sharing.read`、`sharing.write`
2. 在 `.env` 填入 `DROPBOX_APP_KEY`、`DROPBOX_APP_SECRET`
3. 執行 `node scripts/dropbox-auth.mjs`，開啟（或複製）印出的授權網址，把取得的 code 貼回終端機；腳本會把 `DROPBOX_REFRESH_TOKEN` 寫進 `.env`

### 工作台

```bash
node scripts/chant-studio.mjs --team <隊名> [--team …] [--league 一軍|二軍] [--org CPBL|NPB|MLB] [選項]
```

- `--team <隊名>`：要處理的球隊，可重複指定
- `--league 一軍|二軍`：限定一軍或二軍
- `--org CPBL|NPB|MLB`：聯盟組織（預設 CPBL）
- `--include-pitchers`：連投手一起處理（預設不含）
- `--batch <名稱>`：批次名稱（進度檔名；不可含路徑字元或空白，未指定則依範圍自動命名）
- `--port <埠號>`：本機網頁埠（預設 8777）
- `--cookies-from-browser <瀏覽器>`：yt-dlp 下載時使用該瀏覽器的 cookies
- `--no-open`：啟動後不自動開啟瀏覽器

流程：

- 每位球員一張卡片，自動搜尋、下載並建議 A/B 剪點
- 可調整 A/B 剪點、淡入淡出、音量
- 每張卡片可按 ✅ 已解決、🔄 換版本、⏭ 跳過，或貼上自己的網址
- 📤 送出：渲染成品、上傳 Dropbox `/Music/Players/`，只在該球員 song 仍為空時才寫入資料庫

資料目錄：`/Users/tonywang/orca/workspaces/baseballvs/chant-studio/`。需安裝 yt-dlp（`uv tool install yt-dlp`）與 ffmpeg。

### 舊歌音量統一

```bash
node scripts/normalize-music.mjs [--only-measure] [--only <球員 id>] [--limit N] [--apply]
```

- 預設為試跑（dry-run），加上 `--apply` 才會上傳並寫入資料庫
- `--only-measure`：只量測音量，不做任何修改（不可與 `--apply` 併用）
- `--only <球員 id>`：只處理指定球員
- `--limit N`：最多處理 N 筆（正整數）
- 目標響度 −12 LUFS；原檔會先備份到 `/Users/tonywang/orca/workspaces/baseballvs/backups/music-<日期>/`
- 建議先用 `--apply --only <球員 id>` 試一位，確認無誤再全面套用

## 技術棧

- Vue 3 (Composition API)
- Vite
- Tailwind CSS
- JavaScript
