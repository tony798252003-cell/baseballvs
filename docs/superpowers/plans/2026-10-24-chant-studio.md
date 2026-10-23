# 應援曲工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local "chant studio" (Node server + one browser page) that finds YouTube versions for players without songs, downloads, suggests A/B cut points, lets the user tune/approve per card with gapless preview, renders and uploads approved ones; plus Dropbox refresh-token auth, existing-music loudness normalization, and gapless playback in the app.

**Architecture:** Pure, tested modules in `scripts/lib/` (YouTube result parsing/ranking, loudness/gain math and ffmpeg arg building, cut suggestion on PCM, studio state, Dropbox token refresh). A thin HTTP server `scripts/chant-studio.mjs` (127.0.0.1 only) wires them to yt-dlp, ffmpeg, Supabase and Dropbox, and serves a static page in `scripts/chant-studio/` whose tuning UI ports the spike's `tune.js`. App playback in `src/composables/useAudio.js` moves to Web Audio with `<audio>` fallback.

**Tech Stack:** Node 22 (built-in `http`, `fetch`, `node:test`, `child_process`), ffmpeg (`ebur128`, `volume`, `alimiter`, `afade`, `atrim`, libmp3lame), yt-dlp, Supabase JS, Dropbox HTTP API v2, Vue 3, Web Audio API. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-24-chant-studio-design.md`

## Global Constraints

- No new npm dependencies. Only ffmpeg (no ffprobe) and yt-dlp as external binaries; find them via PATH, falling back to `~/bin/ffmpeg` and `~/.local/bin/yt-dlp`.
- Server binds `127.0.0.1` only.
- Studio scope default: `status='active'`, `is_coach=false`, `song` empty; `--org` default `CPBL`; `--league` only applies to CPBL; pitchers (`main_position` in P/SP/RP/CP) excluded unless `--include-pitchers`.
- Never overwrite a non-empty `song`; never overwrite a non-empty `intro` (skip the intro and list it in the summary); unchecked 有前奏 leaves `intro` untouched.
- Cut structure: intro = original 0 → B with fade-out; song = original A → B with fade-in and fade-out of the slider length (0–300 ms, linear). Intro only if 有前奏 is checked (auto-checked when detected lead-in ≥ 2 s).
- Gain = (target − integrated LUFS of the whole original) + user slider (−6…+6 dB); same gain for intro and song; true-peak limit −1 dBTP. Target placeholder −14 LUFS in one constant `TARGET_LUFS`.
- Output format mp3 (libmp3lame, high quality, gapless/LAME header written); filenames `球隊 - 姓名.mp3` and `球隊 - 姓名 - Intro.mp3` in Dropbox `/Music/Players/`; DB gets the `?raw=1` shared link.
- Persistent studio data dir (state + downloads + renders): `/Users/tonywang/orca/workspaces/baseballvs/chant-studio/`.
- YouTube search: fetch `https://www.youtube.com/results?search_query=…` with a browser UA, parse `var ytInitialData = {...};`; ≥1.5 s between requests; queries `<隊名> <姓名> 應援曲`, `<姓名> 應援曲`; keep top 3.
- `.env` gains `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN` (names in `.env.example`); refresh token written to `.env` by the auth script, never printed.
- Every DB/Dropbox-writing script defaults to dry run; writes only with `--apply` (studio writes only on 「📤 送出」).
- Tests: `node --test` files next to modules; one-line why-comment per test.
- UI text 繁體中文.

## Review Focus

1. **A player gets a song (or intro) through another path after the studio loaded** → submit re-reads the DB row and skips it, listing it. Pinned in Task 7 (`submitApproved` test with a stale card).
2. **Preview and rendered file differ in length/start because of mp3 encoder delay** → rendered song length = B − A within 10 ms after decode. Pinned in Task 3 (render integration test on a generated tone).
3. **YouTube search/download fails or is blocked for one player** → that card shows the error with 重試; other cards continue. Pinned in Task 6 (`runPipeline` test with a failing fetcher).
4. **A quiet original needs a big positive gain** → output true peak ≤ −1 dBTP, no clipping. Pinned in Task 3 (render test with a near-full-scale tone and +6 dB slider).
5. **Server restarted mid-session** → card edits, statuses and downloads persist; nothing is re-downloaded. Pinned in Task 5 (state round-trip test) and Task 6 (pipeline skips cards that already have `original`).

---

## File Structure

- Modify `scripts/lib/dropboxMusicSync.mjs` — add `getDropboxAccessToken()`.
- Create `scripts/dropbox-auth.mjs` — one-time refresh-token setup.
- Modify `scripts/add-player-song.mjs`, `scripts/migrate-legacy-songs.mjs`, `.env.example`.
- Create `scripts/lib/youtubeSearch.mjs` (+ test, + `scripts/lib/__fixtures__/youtube/results.html`).
- Create `scripts/lib/audioCut.mjs` (+ test) — binaries, loudness, gain, render.
- Create `scripts/lib/cutSuggest.mjs` (+ test) — A/B suggestion from PCM.
- Create `scripts/lib/studioState.mjs` (+ test).
- Create `scripts/chant-studio.mjs` — server, pipeline, API, submit.
- Create `scripts/chant-studio/index.html`, `scripts/chant-studio/app.js` — page.
- Create `scripts/normalize-music.mjs` — existing-music normalization.
- Modify `src/composables/useAudio.js` (+ any `audioRef` consumers) — gapless playback.
- Modify `README.md` — studio + auth + normalize commands.

---

### Task 1: Dropbox refresh-token auth

**Files:** Modify `scripts/lib/dropboxMusicSync.mjs`, `scripts/add-player-song.mjs`, `scripts/migrate-legacy-songs.mjs`, `.env.example`; Create `scripts/dropbox-auth.mjs`, `scripts/lib/dropboxAuth.test.mjs`

**Interfaces:**
- Produces: `getDropboxAccessToken({ env = process.env, fetchImpl = fetch, now = Date.now } = {}): Promise<string>` — if `DROPBOX_REFRESH_TOKEN` + `DROPBOX_APP_KEY` + `DROPBOX_APP_SECRET` exist, POST `https://api.dropboxapi.com/oauth2/token` (`grant_type=refresh_token`, basic auth key:secret), cache the token until 60 s before `expires_in`; else return `DROPBOX_TOKEN`; else throw `缺少 Dropbox 授權，請執行 node scripts/dropbox-auth.mjs`.
- Produces: `upsertEnvVar(envText: string, key: string, value: string): string` (exported from `scripts/dropbox-auth.mjs` or a small lib) — replaces or appends `KEY=value`, preserving other lines.

- [ ] **Step 1: Tests** (`dropboxAuth.test.mjs`): refresh path calls the token URL once and reuses cache on the second call; cache expires (fake `now`) → refetches; falls back to `DROPBOX_TOKEN`; throws the message above when nothing set; `upsertEnvVar` replaces an existing line and appends a missing one without touching others.
- [ ] **Step 2: FAIL → implement → PASS.**
- [ ] **Step 3: `dropbox-auth.mjs`**: reads key/secret from `.env`, prints the authorize URL `https://www.dropbox.com/oauth2/authorize?client_id=<key>&token_access_type=offline&response_type=code`, prompts for the code (readline), exchanges it (`grant_type=authorization_code`), writes `DROPBOX_REFRESH_TOKEN` into `.env` via `upsertEnvVar`, prints only `✓ 已寫入 .env`.
- [ ] **Step 4: Switch `add-player-song.mjs` and `migrate-legacy-songs.mjs` to `await getDropboxAccessToken()`**; update `.env.example` names.
- [ ] **Step 5: `node --check` both scripts; commit** — `feat: Dropbox refresh-token auth`.

### Task 2: YouTube search parsing and ranking

**Files:** Create `scripts/lib/youtubeSearch.mjs`, `scripts/lib/youtubeSearch.test.mjs`, `scripts/lib/__fixtures__/youtube/results.html` (save one real results page for `陳鏞基 應援曲` during Step 1)

**Interfaces:**
- Produces: `parseYoutubeResults(html: string): Video[]` with `Video = { videoId, title, lengthSec, channel, views }` (views as integer; missing length → `null`).
- Produces: `rankCandidates(videos: Video[], { name, team }): Ranked[]` with `Ranked = Video & { score, reasons: string[] }`, sorted desc, only titles containing `name`; dedupe by `videoId`.
- Produces: `async searchPlayer({ name, team }, { fetchImpl = fetch, sleep }): Promise<Ranked[]>` (top 3, both queries, ≥1.5 s between requests).
- Scoring (from spec §2): +len 30–180 s, +short clean edit (≤ 70 s), +official channel (channel contains the team name or its common English name), − 交響樂/Remix/改編/cover/鋼琴/直笛/教學, − compilation (title mentions ≥2 other names or 合輯), − cheerleader/fancam/#shorts/女孩團名 (Rakuten Girls, 樂天女孩, Uni Girls, Passion Sisters, Wing Stars, Fubon Angels, Dragon Beauties, TsgHawks girls), + log(views).

- [ ] **Step 1: Save fixture** (curl with browser UA) and write tests: fixture parses ≥ 8 videos with numeric `lengthSec`; `rankCandidates` puts an official short clip above a fancam and above a 交響樂 version (synthetic inputs); title without the name is dropped; duplicates collapse.
- [ ] **Step 2: FAIL → implement → PASS.** Commit — `feat: YouTube result parsing and chant ranking`.

### Task 3: Audio lib — binaries, loudness, gain, render

**Files:** Create `scripts/lib/audioCut.mjs`, `scripts/lib/audioCut.test.mjs`

**Interfaces:**
- Produces: `findBinary(name: 'ffmpeg'|'yt-dlp'): string` (PATH, then `~/bin/ffmpeg` / `~/.local/bin/yt-dlp`; throws with install hint).
- Produces: `parseEbur128(stderr: string): { integratedLufs: number, truePeakDb: number }` (from `-af ebur128=peak=true` summary).
- Produces: `measureLoudness(file): Promise<{ integratedLufs, truePeakDb }>`.
- Produces: `TARGET_LUFS = -14`; `computeGainDb({ integratedLufs, sliderDb = 0, target = TARGET_LUFS }): number`.
- Produces: `buildRenderArgs({ src, out, start, end, fadeInMs, fadeOutMs, gainDb }): string[]` — `-ss/-to` (or `atrim`) on the original, `volume=<gainDb>dB`, `alimiter=limit=<-1 dBTP as linear>`, `afade` in/out, `libmp3lame -q:a 0`, write Xing/LAME header.
- Produces: `renderCut(opts): Promise<void>`; `decodeDurationSec(file): Promise<number>` (ffmpeg decode to null, parse `time=`).
- Produces: `decodePcm(file, sampleRate = 11025): Promise<Float32Array>` (ffmpeg → f32le mono).
- Produces: `renderPair({ src, outDir, A, B, fadeMs, gainDb, withIntro }): Promise<{ songPath, introPath|null }>` — song A→B with fades both ends; intro 0→B with fade-out only.

- [ ] **Step 1: Tests:** `parseEbur128` on a pasted real stderr sample; `computeGainDb({integratedLufs:-20,sliderDb:2})===8`; `buildRenderArgs` contains the volume, limiter, both fades and `-q:a 0`. Integration (skips with a clear message if ffmpeg missing): generate a 30 s test signal (repeating 2 s pattern) with ffmpeg; `renderPair` with A=4, B=20 → decoded song length 16 ± 0.01 s, intro 20 ± 0.01 s; render with near-full-scale input and `gainDb=+6` → measured true peak ≤ −1.0 dBTP (+0.2 tolerance).
- [ ] **Step 2: FAIL → implement → PASS.** If mp3 padding breaks the ±10 ms check, fix in `buildRenderArgs` (e.g. LAME header + correct trimming) — do not loosen the tolerance. Commit — `feat: loudness, gain and gapless cut rendering`.

### Task 4: Cut suggestion

**Files:** Create `scripts/lib/cutSuggest.mjs`, `scripts/lib/cutSuggest.test.mjs`

**Interfaces:**
- Produces: `suggestCut(pcm: Float32Array, sampleRate: number): { A: number, B: number, leadInSec: number, hasIntro: boolean, confidence: number, beats: number[] }` — detect onsets/tempo, search loop length only among whole-bar lengths in 12–45 s, choose A at the start of the first repeat, B = A + loop; `hasIntro = leadInSec >= 2`; `beats` = onset times (seconds) for the UI's 對齊鼓點.
- Consumes: `decodePcm` from Task 3.

- [ ] **Step 1: Tests** with synthetic signals: 6.8 s noise lead-in + click-track pattern repeating every 16 s → `A≈6.8 (±0.15)`, `B−A≈16 (±0.15)`, `hasIntro` true; pattern from t=0 → `hasIntro` false; pure noise → returns something with `confidence < 0.3` (never throws). Also the user's real reference: if `/private/tmp/claude-501/-Users-tonywang-orca-workspaces-baseballvs-crayfish/aa44445e-59f6-43d2-abe9-aa0ce186f531/scratchpad/chant/354-intro.mp3` exists, A ≈ 6.8 ± 0.3 (skip if missing).
- [ ] **Step 2: FAIL → implement → PASS.** Commit — `feat: bar-aligned loop cut suggestion`.

### Task 5: Studio state

**Files:** Create `scripts/lib/studioState.mjs`, `scripts/lib/studioState.test.mjs`

**Interfaces:**
- Produces: `STUDIO_DIR = '/Users/tonywang/orca/workspaces/baseballvs/chant-studio'`.
- Produces: `Card = { playerId, name, team, number, position, status: 'pending'|'resolved'|'skipped'|'notfound'|'error', candidates: Ranked[], chosen: number, customUrl?: string, original?: string, error?: string, A?: number, B?: number, fadeMs: number, sliderDb: number, withIntro: boolean, integratedLufs?: number, suggestion?: {...}, uploaded?: { song, intro } }`.
- Produces: `batchName({ teams, league, org }): string`; `loadState(batch, dir = STUDIO_DIR): { batch, cards: Record<string, Card> }`; `saveState(state, dir)` (atomic write via tmp + rename); `mergePlayers(state, players): state` (adds new players as pending cards, keeps existing card data, drops nothing).

- [ ] **Step 1: Tests** (temp dir): round-trip preserves edits; `mergePlayers` keeps an edited card and adds a new one; atomic save leaves no `.tmp` on success; `batchName` stable for the same inputs regardless of team order.
- [ ] **Step 2: FAIL → implement → PASS.** Commit — `feat: chant studio state store`.

### Task 6: Studio server and pipeline

**Files:** Create `scripts/chant-studio.mjs`, `scripts/lib/studioPipeline.mjs`, `scripts/lib/studioPipeline.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–5; `createServiceClient`/`loadEnv` (`scripts/lib/env.mjs`); `fetchAllPages` (`src/lib/fetchAllPages.js`).
- Produces (pure-ish, injectable deps): `selectPlayers(rows, { teams, league, org, includePitchers }): Player[]`; `async runPipeline(state, { search, download, analyze, save }): void` — for each pending card without `original`: search → choose → download → `measureLoudness` + `suggestCut` → set A/B/withIntro/integratedLufs; on any failure set `status:'error'` with message and continue; cards with no candidates → `notfound`; saves after each card.
- HTTP API (JSON):
  - `GET /` and static files from `scripts/chant-studio/`; `GET /media/<file>` serves originals/renders from `STUDIO_DIR` (no path traversal).
  - `GET /api/state` → cards + counts.
  - `POST /api/cards/:id` body `{ A, B, fadeMs, sliderDb, withIntro, status }` → validated (0 ≤ A < B ≤ duration, fade 0–300, slider −6…6) and saved.
  - `POST /api/cards/:id/next` → next candidate, re-download + analyze.
  - `POST /api/cards/:id/url` body `{ url }` → only `youtube.com`/`youtu.be` URLs; download + analyze.
  - `POST /api/cards/:id/retry`.
  - `POST /api/submit` → Task 7.
- CLI: `node scripts/chant-studio.mjs --team 樂天桃猿 [--team …] [--league 一軍] [--org CPBL] [--include-pitchers] [--batch name] [--port 8777]`; prints the URL and opens it (`open`).
- Download: `yt-dlp -x --audio-format mp3 -o <STUDIO_DIR>/<batch>/orig/<playerId>-<videoId>.%(ext)s <url>`; on bot-check errors, the card error suggests `--cookies-from-browser chrome` and the server accepts `--cookies-from-browser <browser>` to pass through.

- [ ] **Step 1: Tests** for `selectPlayers` (pitcher exclusion, league only for CPBL, song-empty only, coaches/departed excluded) and `runPipeline` with fakes (one search throws → that card `error`, the next still processed; card with existing `original` is not re-downloaded; no candidates → `notfound`).
- [ ] **Step 2: FAIL → implement → PASS.**
- [ ] **Step 3: Manual smoke:** run against `--team 樂天桃猿 --league 一軍` → 6 cards; `curl /api/state` shows them processed or with clear errors.
- [ ] **Step 4: Commit** — `feat: chant studio server and pipeline`.

### Task 7: Submit (render, upload, DB write)

**Files:** Modify `scripts/chant-studio.mjs`; Create `scripts/lib/studioSubmit.mjs`, `scripts/lib/studioSubmit.test.mjs`

**Interfaces:**
- Produces: `async submitApproved(state, { readPlayer, render, upload, link, writePlayer, log }): { uploaded: string[], skipped: { name, reason }[], failed: { name, error }[] }` — for each `resolved` card without `uploaded`: re-read the player row; skip if `song` non-empty (`已有歌`); render via `renderPair` with `gainDb = computeGainDb({ integratedLufs, sliderDb })`; upload to `/Music/Players/<team> - <name>.mp3` (and ` - Intro.mp3` when intro rendered and DB `intro` empty, else list `已有 intro，略過前奏`); get raw links; write `song` (and `intro`) only; mark `uploaded`; save state after each.
- `POST /api/submit` returns that summary; page shows it.

- [ ] **Step 1: Tests** with fakes: stale card whose DB song became non-empty → skipped, no upload; card with DB intro text → song uploaded, intro skipped + listed; upload failure → `failed`, next card continues; already-`uploaded` card not redone.
- [ ] **Step 2: FAIL → implement → PASS.** Commit — `feat: chant studio submit`.

### Task 8: Studio page

**Files:** Create `scripts/chant-studio/index.html`, `scripts/chant-studio/app.js`

**Interfaces:**
- Consumes: Task 6 API, Task 7 submit; `/media/<original>`.
- Port the spike UI: `/private/tmp/claude-501/-Users-tonywang-orca-workspaces-baseballvs-crayfish/aa44445e-59f6-43d2-abe9-aa0ce186f531/scratchpad/chant-spike/tune.js` (waveform with draggable A/B, two ±1.5 s zoom canvases, beat ticks from `suggestion.beats`, ±0.01/±0.1 nudges, 對齊鼓點, red playhead on all three canvases with current seconds, double-click to play original from there, auto seam playback on release, fade slider 0–300 ms, 有前奏 checkbox) plus a **音量 slider −6…+6 dB**. All preview playback via Web Audio applying `gainDb = TARGET_LUFS − integratedLufs + sliderDb` (send target from the server in `/api/state`), same fades/limits as render (limiter approximated by a DynamicsCompressor at −1 dB is acceptable in preview).
- Per card: player info, chosen video + reasons + alternatives, buttons `▶ 前奏→循環×2` (when 有前奏), `🔁 循環×3`, `⏩ 只聽接縫`, `■ 停止`, `✅ 此筆已解決`, `🔄 換下一個版本`, `⏭ 跳過`, 貼 YouTube 網址 field, error + 重試 when `status:error`. Edits auto-save (debounced POST).
- Top bar: counts per status, filter by status, `📤 送出已解決的` with a confirm dialog listing names, then the summary.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Manual check** (controller with the user): tune one card, reload page → values persist; resolve → submit dry path visible.
- [ ] **Step 3: Commit** — `feat: chant studio page`.

### Task 9: Normalize existing music

**Files:** Create `scripts/normalize-music.mjs`, `scripts/lib/normalizePlan.mjs`, `scripts/lib/normalizePlan.test.mjs`

**Interfaces:**
- Consumes: `getDropboxAccessToken`, `measureLoudness`, `computeGainDb`, `buildRenderArgs` (whole-file mode: start 0, end = duration, no fades).
- Produces: `planNormalization(items: { kind: 'song'|'intro'|'chant'|'generic', ownerId, url, lufs }[], target): { ownerId, kind, url, gainDb }[]` — song and intro of the same player share the song's gain (if no song, intro's own); chants/generic individually.
- Flow: collect every Dropbox URL referenced by `players.song/intro` (http only), `team_chants.url`, `app_settings.generic_chant_url`; download all to `/Users/tonywang/orca/workspaces/baseballvs/backups/music-<YYYY-MM-DD>/` with a `manifest.json` (url → file, owner); measure; print table (file, current LUFS, gain). Also print the median song LUFS (to set `TARGET_LUFS` with the user). With `--apply`: re-encode (V0, gapless, −1 dBTP limiter), upload to the same Dropbox path (resolve path from the shared link via Dropbox `sharing/get_shared_link_metadata`), then re-fetch the shared link; if it changed, update the DB reference.
- `--only-measure` prints LUFS stats without planning.

- [ ] **Step 1: Tests** for `planNormalization` (shared gain for a player pair; chant independent; intro-only player uses its own).
- [ ] **Step 2: FAIL → implement → PASS.**
- [ ] **Step 3: Controller+user:** run `--only-measure`, agree on `TARGET_LUFS`, update the constant (Task 3) if different, dry run, then `--apply` after user OK. Verify re-measure all within target ±1 LU.
- [ ] **Step 4: Commit** — `feat: normalize existing music loudness`.

### Task 10: Gapless playback in the app

**Files:** Modify `src/composables/useAudio.js` (+ `src/App.vue` and any other `audioRef` consumers found by `git grep -n "audioRef\|useAudio" src`)

**Interfaces:**
- Keep the public API of `useAudio()` (`playBatterMusic(player, teamChants, genericChantUrl)`, pause/resume/stop functions, `audioRef`) so callers don't change.
- Implementation: an `AudioContext` created lazily and `resume()`d on first user gesture; `fetch` + `decodeAudioData` (cache by URL); intro then song scheduled at `start + intro.duration`; song `loop = true`; chant fallbacks (team → successor → generic, via `pickFallbackChant`) also via Web Audio loop; stopping/switching batter stops all sources. If fetch/decode fails (CORS etc.), fall back to the existing `<audio>` code path for that play.

- [ ] **Step 1: Check Dropbox CORS** (controller can run): `curl -sI -H "Origin: https://baseballvs.vercel.app" "<a song raw url>"` → note `access-control-allow-origin`. Record result in the report.
- [ ] **Step 2: Implement**; extract any pure scheduling helper you add into `src/lib/` with a `node --test` test (e.g. schedule times for intro→song).
- [ ] **Step 3: `npm test` + `npm run build`.** Manual (controller with user): a player with intro (陳鏞基) plays intro→song with no audible gap; song loops seamlessly; pause/resume; next batter stops previous; a player without song plays team chant.
- [ ] **Step 4: Commit** — `feat: gapless batter music playback`.

### Task 11: Docs

- [ ] README: `dropbox-auth.mjs` setup (App key/secret, permissions `files.content.read`, `files.content.write`, `sharing.read`, `sharing.write`), `chant-studio.mjs` usage and flags, `normalize-music.mjs` flags. Commit — `docs: chant studio usage`.
