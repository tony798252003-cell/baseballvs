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

## 技術棧

- Vue 3 (Composition API)
- Vite
- Tailwind CSS
- JavaScript
