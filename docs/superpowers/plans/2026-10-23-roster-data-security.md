# 球員資料與後台安全改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock down Supabase (publishable key + RLS + admin login), rebuild player-data sync (CPBL current + departed flag + full history backfill, full NPB rosters, curated MLB list), switch the frontend to 聯盟 → 球隊 grouping with a 離隊／歷史 tab, add a successor/generic chant fallback, and delete leftover files.

**Architecture:** Pure logic (HTML parsing, roster diffing, merge planning, name display, chant fallback) lives in small ESM modules under `scripts/lib/` and `src/lib/`, unit-tested with Node's built-in `node --test`. Thin CLI scripts in `scripts/` wire those modules to the network and Supabase (service key from `.env`, `--dry-run` by default). The frontend reads a single team table `src/constants/teams.js` shared with the scripts. Schema changes are SQL files in `supabase/migrations/` that the user runs in the Supabase SQL Editor.

**Tech Stack:** Vue 3 `<script setup>`, Vite 5, Tailwind 3, `@supabase/supabase-js` 2, `node-html-parser` 7, Node 22 built-ins (`fetch`, `node:test`, `process.loadEnvFile`). Vercel hosting (`https://baseballvs.vercel.app`, Production = `main`).

**Spec:** `docs/superpowers/specs/2026-10-23-roster-data-security-design.md`

## Global Constraints

- No new npm dependencies.
- **Testing convention change (flagged to user):** this repo previously had no tests. Pure modules get `*.test.mjs` files next to them run by `node --test` (built-in, zero deps); add `"test": "node --test"` to `package.json`. UI and network steps stay manual-verify, like earlier plans.
- Manual fields that sync must **never** write: `song`, `intro`, `emoji`, `eye_mask_position`, `other_positions`.
- `OFFICIAL_FIELDS` sync may write on existing rows: `name`, `number`, `team`, `photo`, `league`, `roster_mark`, `status`, `is_coach`. `pitching_hand`, `batting_hand`, `main_position` are written **only on insert**.
- Roster-mark characters to strip from names and store in `roster_mark`: `#` `＃` `✽` `◎` `*` `＊` `※`. Normalize `＃`→`#`, `＊`→`*` when storing.
- `#`（註銷註冊）⇒ `status = 'departed'`.
- `org` values: `CPBL` / `NPB` / `MLB`. `status` values: `active` / `departed`. `league` stays `一軍` / `二軍`; NPB 支配下 → `一軍`, 育成 → `二軍`.
- Name language by nationality: CPBL = official Chinese; Japanese = kanji as-is (no glyph conversion); NPB foreigners = katakana as-is; other MLB = English. Team names always Chinese.
- Lineup list shows only the surname for Latin-script names; larger cards show the full name.
- RLS write policy email: `tony798252003@gmail.com`.
- Chant order: intro → loop song → team chant → successor team chant → generic chant (loop) → silence.
- Existing CPBL six (order as in code today): `樂天桃猿`, `統一獅`, `富邦悍將`, `味全龍`, `台鋼雄鷹`, `中信兄弟`. CPBL ClubNo: `ACN` 中信兄弟, `ADD` 統一獅, `AJL` 樂天桃猿, `AEO` 富邦悍將, `AAA` 味全龍, `AKP` 台鋼雄鷹.
- CPBL site needs the HiNetCDN cookie: first request with `redirect: 'manual'`, capture `__chtcdn` from `Set-Cookie`, send it as `Cookie` on all later requests. Browser-like `User-Agent` on every request.
- Throttle: CPBL team pages 800 ms apart (existing), person pages ≥ 1 s apart.
- Every write script defaults to dry run; writes only with `--apply`.
- Steps tagged **[USER]** need the user to act in a dashboard; stop and give them exact click/SQL instructions, then wait.
- Pushing / merging to `main` deploys to production: confirm with the user before doing it.
- Pre-change backup already exists at `/Users/tonywang/orca/workspaces/baseballvs/backups/2026-10-23/` (players 621, team_chants 23). CPBL HTML fixtures saved at `/Users/tonywang/orca/workspaces/baseballvs/backups/cpbl-fixtures-2026-10-23/`.

## Review Focus

1. **CPBL returns a partial or blocked page mid-run** (CDN hiccup, site redesign) → nobody gets marked departed; whole run aborts. Pinned in Task 6 (`checkSafetyValve`).
2. **Re-running a sync** → zero inserts/updates on the second run, no duplicate rows, manual fields untouched. Pinned in Task 6 (`planRosterSync` idempotency test).
3. **Two different real people with the same name** (common in CPBL) → auto-merge must not fire; goes to the manual list. Pinned in Task 8 (`planDuplicateMerges`, `matchUnkeyed`) and Task 6 (unmatched handling).
4. **Admin session expires while editing** → the RLS-rejected write must show the existing error toast, not a success toast. Pinned in Task 3 manual step.
5. **Latin names with suffixes or a single token** (`Vladimir Guerrero Jr.`, `Ichiro`) → lineup shows `Guerrero Jr.` / `Ichiro`, never empty. Pinned in Task 13 (`lineupName` tests).

---

## File Structure

- Create `supabase/migrations/000_baseline.sql` — current schema, from the user's introspection output.
- Create `supabase/migrations/001_roster_fields_and_rls.sql` — new columns, `app_settings`, RLS.
- Create `scripts/lib/env.mjs` — `.env` loading + service Supabase client for all scripts.
- Modify `scripts/lib/dropboxMusicSync.mjs`, `scripts/add-player-song.mjs`, `scripts/migrate-legacy-songs.mjs`, `scripts/restore-songs.mjs`, `scripts/add-international-players.mjs`, `scripts/scrape-cpbl.mjs` — drop hardcoded keys.
- Modify `src/lib/supabase.js` — env-based publishable key.
- Create `src/components/AdminLogin.vue`; modify `src/components/AdminScreen.vue` — login gate, paginated load, generic chant field.
- Create `src/constants/teams.js` — single team table.
- Create `scripts/lib/playerMerge.mjs` (+ test) — duplicate/unmatched merge planning.
- Create `scripts/normalize-existing-players.mjs` — one-off cleanup of current data.
- Create `scripts/lib/cpblClient.mjs` (+ test, + `scripts/lib/__fixtures__/cpbl/`) — CDN session + CPBL HTML parsing.
- Create `scripts/lib/rosterSync.mjs` (+ test) — diff planning + safety valve.
- Rewrite `scripts/scrape-cpbl.mjs` — CPBL current sync.
- Create `scripts/backfill-cpbl-history.mjs` — resumable Acnt enumeration.
- Create `scripts/lib/npbClient.mjs` (+ test, + fixtures), `scripts/sync-npb.mjs`; add NPB logos under `public/logos/`.
- Create `scripts/data/mlb-players.json`; rewrite `scripts/add-international-players.mjs` to read it.
- Create `src/lib/playerName.js` (+ test), `src/lib/chantFallback.js` (+ test).
- Modify `src/composables/usePlayerData.js`, `usePlayerFilters.js`, `useAudio.js`, `src/App.vue`.
- Create `src/components/OrgTabs.vue`; modify `LineupSelectionScreen.vue`, `BatterSelectDialog.vue`, `PitcherSelectDialog.vue`, `DefenseReorganizeDialog.vue`, `ChantPlayerScreen.vue`, `PlayerCard.vue`, `LineupIntroScreen.vue`, plus wherever the lineup list renders names.
- Delete `app.jsx`, `index-vue.html`, `src/App-Simple.vue`, `scripts/import-players.mjs`. Modify `README.md`, `.gitignore`, `.env.example`, `package.json`.

---

## Phase A — 安全

### Task 1: Baseline schema + migration 001

**Files:**
- Create: `supabase/migrations/000_baseline.sql`, `supabase/migrations/001_roster_fields_and_rls.sql`

**Interfaces:**
- Produces: columns `players.org text not null default 'CPBL'`, `players.status text not null default 'active'` (check `in ('active','departed')`), `players.roster_mark text`, `players.npb_id text unique`, `players.mlb_id integer unique`; unique index on `players.cpbl_acnt` (where not null) if missing; table `app_settings(key text primary key, value text)`; RLS on `players`, `team_chants`, `app_settings`.

- [ ] **Step 1: [USER] Introspect current schema.** Give the user one SQL query to run in the SQL Editor that lists columns (`information_schema.columns`), constraints/indexes (`pg_indexes`), existing RLS state (`pg_class.relrowsecurity`) and policies (`pg_policies`) for `players` and `team_chants`. Ask them to paste the result.
- [ ] **Step 2: Write `000_baseline.sql`** reproducing the pasted schema (`create table if not exists …`), so the repo has a starting point. No behavior change.
- [ ] **Step 3: Write `001_roster_fields_and_rls.sql`.** Columns/table per Interfaces. Policies, for each of the three tables:
  ```sql
  create policy "<t> read" on <t> for select to anon, authenticated using (true);
  create policy "<t> owner write" on <t> for all to authenticated
    using ((auth.jwt() ->> 'email') = 'tony798252003@gmail.com')
    with check ((auth.jwt() ->> 'email') = 'tony798252003@gmail.com');
  ```
  Enabling RLS now is safe: the live frontend still uses the service-role key, which bypasses RLS, until Task 4.
- [ ] **Step 4: [USER] Run 001 in SQL Editor.** Then verify with curl using the **old** key: `GET /rest/v1/players?select=org,status&limit=1` returns `[{"org":"CPBL","status":"active"}]`, and `GET /rest/v1/players` count is still 621.
- [ ] **Step 5: Commit** `supabase/migrations/` — `feat: add baseline schema and roster/RLS migration`.

### Task 2: Move keys out of code

**Files:**
- Create: `scripts/lib/env.mjs`
- Modify: every `scripts/*.mjs` and `scripts/lib/dropboxMusicSync.mjs` that holds a key; `src/lib/supabase.js`; `.env.example`; `package.json` (add `"test": "node --test"`)

**Interfaces:**
- Produces: `loadEnv(): void` (calls `process.loadEnvFile('.env')`, ignores missing file); `createServiceClient(): SupabaseClient` (reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; exits with a clear message naming the missing var). `dropboxMusicSync.mjs` stops exporting `SUPABASE_URL`/`SUPABASE_KEY`; its importers use `createServiceClient()`.
- Frontend env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

- [ ] **Step 1: [USER] Create new API keys.** Dashboard → Project Settings → API Keys → create a publishable key and a secret key (new-style). Do **not** disable legacy keys yet. User puts them in `.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`=secret, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`=publishable). Claude never prints the secret key.
- [ ] **Step 2: Implement `env.mjs`, switch all scripts, update `src/lib/supabase.js` to `createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)`, update `.env.example` (names only).**
- [ ] **Step 3: Verify no key remains:** `git grep -n "eyJhbGci"` → no output.
- [ ] **Step 4: Verify scripts still work:** `node scripts/migrate-legacy-songs.mjs` reaches its first Dropbox/DB call without an auth error (Ctrl-C after the listing).
- [ ] **Step 5: Verify frontend read:** `npm install && npm run dev`, open the app → MenuScreen shows `已載入 621 位球員`.
- [ ] **Step 6: Commit** — `refactor: load Supabase keys from env, remove hardcoded service key`.

### Task 3: Admin login gate

**Files:**
- Create: `src/components/AdminLogin.vue`
- Modify: `src/components/AdminScreen.vue`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.js`.
- Produces: `AdminLogin.vue` emits `logged-in`; uses `supabase.auth.signInWithPassword({ email, password })`. `AdminScreen.vue` checks `supabase.auth.getSession()` on mount and renders `AdminLogin` until a session exists; add a 登出 button (`supabase.auth.signOut()`). Style follows AdminScreen's existing classes.

- [ ] **Step 1: [USER] Auth setup.** Dashboard → Authentication → disable "Allow new users to sign up"; add user `tony798252003@gmail.com` with a password.
- [ ] **Step 2: Implement login gate.**
- [ ] **Step 3: Manual verify (dev server):** logged out → admin shows login; wrong password → error message; logged in → edit a test player's emoji and save → success toast and DB changed; revert it. Dropbox 匯入 preview + confirm on one file works; add + delete a test team chant works.
- [ ] **Step 4: Manual verify RLS rejection surfaces:** in DevTools run `await supabase.auth.signOut()` while the edit modal is open, then save → the existing error toast appears (not success). If any AdminScreen write path ignores `error`, fix that path to show the error toast.
- [ ] **Step 5: Manual verify anon cannot write:** `curl -X PATCH "$VITE_SUPABASE_URL/rest/v1/players?id=eq.<id>" -H "apikey: <publishable>" -H "Content-Type: application/json" -d '{"emoji":"x"}' -H "Prefer: return=representation"` → returns `[]` (0 rows updated).
- [ ] **Step 6: Commit** — `feat: require login for admin screen`.

### Task 4: Deploy and retire the leaked key

- [ ] **Step 1: [USER] Vercel env vars.** Vercel → project → Settings → Environment Variables: add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` for Production and Preview.
- [ ] **Step 2: Confirm with the user, then merge Phase A to `main` and push** (deploys).
- [ ] **Step 3: Verify production:** open `https://baseballvs.vercel.app` → roster loads; fetch its JS bundle(s) and grep for `service_role` and the secret key prefix → no match.
- [ ] **Step 4: [USER] Disable legacy JWT keys** in the dashboard.
- [ ] **Step 5: Verify:** old service-role key → `GET /rest/v1/players` returns 401; production site still loads; admin login still works; scripts still work with the new secret key.

---

## Phase B — 球員資料

### Task 5: Team table

**Files:**
- Create: `src/constants/teams.js`

**Interfaces:**
- Produces:
  ```js
  export const ORGS = [{ id: 'CPBL', label: '中職' }, { id: 'NPB', label: '日職' }, { id: 'MLB', label: '美職' }]
  export const TEAMS // [{ name, org, logo?, cpblClubNo?, npbCode?, defunct?, successor?, aliases?: string[] }]
  export const CPBL_TEAMS // active CPBL six names, order per Global Constraints
  export function canonicalTeamName(name: string): string // alias → name; unknown → input unchanged
  export function teamInfo(name: string): Team | undefined
  export function orgOfTeam(name: string): 'CPBL'|'NPB'|'MLB'|undefined
  ```
- Contents: CPBL six (existing logo paths); CPBL defunct teams with `successor` (researched; list each mapping in the commit message for the user to check — at least 兄弟象→中信兄弟, Lamigo→樂天桃猿, 義大→富邦悍將; leave `successor` empty where none); NPB 12 with `npbCode` and `logo: '/logos/<en>.png'`; every MLB/other team name currently in the DB (see backup) with `org: 'MLB'`. Aliases cover existing variants found in the backup: `LA道奇`→`洛杉磯道奇`, `西武獅`→`埼玉西武獅`, and any others discovered. Decide whether `XX體系` folds into the parent team (spec leaves it to you) and state the choice in the commit message.

- [ ] **Step 1: Write `src/constants/teams.test.mjs`:** every team currently in the backup's `players.team` (except `其他球隊`) resolves via `canonicalTeamName` to a name with an `org`; `canonicalTeamName('LA道奇') === '洛杉磯道奇'`; `CPBL_TEAMS` deep-equals the six in order; every `successor` names a non-defunct CPBL team; NPB has exactly 12 non-defunct teams. (Inline the backup's distinct team list in the test — don't read the backup file.)
- [ ] **Step 2: Run `node --test src/constants/` → FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Download 12 NPB logos** (Wikipedia/official) into `public/logos/`, transparent PNG, roughly the size of existing logos.
- [ ] **Step 6: Commit** — `feat: add shared team table with orgs, aliases, successors`.

### Task 6: Roster sync core (pure)

**Files:**
- Create: `scripts/lib/rosterSync.mjs`, `scripts/lib/rosterSync.test.mjs`

**Interfaces:**
- Produces:
  ```js
  export const MANUAL_FIELDS = ['song','intro','emoji','eye_mask_position','other_positions']
  export const OFFICIAL_FIELDS = ['name','number','team','photo','league','roster_mark','status','is_coach']
  // scraped: [{ key, name, number, team, photo, league, roster_mark, is_coach, pitching_hand?, batting_hand?, main_position? }]
  export function planRosterSync({ dbPlayers, scraped, org, keyField }): {
    inserts: object[],                 // new rows, status per roster_mark
    updates: { id, patch }[],          // only OFFICIAL_FIELDS that changed
    departures: { id, name, team }[],  // active db rows of this org not in scraped: keyed rows, plus coaches (is_coach) not matched by name
    returns: { id, name, team }[],     // departed rows that reappeared (subset of updates)
    transfers: { id, name, from, to }[],
    conflicts: string[]                // coach names with >1 db match; skipped
  }
  export function checkSafetyValve(pageCounts: Record<string, number>, previous: Record<string, number> | null): { ok: boolean, reason?: string }
  ```
  `keyField` is `cpbl_acnt` or `npb_id`; scraped `key` is that value. Coaches (no key) are matched by `name` + `is_coach` within the org; a coach name with >1 DB match is skipped and listed in `conflicts`.

- [ ] **Step 1: Write tests** (each with a one-line comment saying why it matters):
  - new key → one insert with `status:'active'`; with `roster_mark:'#'` → `status:'departed'`.
  - existing row with `song:'x'`, scraped same key, changed `number` → `updates` patch is exactly `{ number }`; no manual field ever appears in any patch.
  - running `planRosterSync` with `dbPlayers` = result of applying the first plan → all arrays empty (idempotency).
  - db active row missing from scraped → in `departures`; db row of **another org** missing → not in departures; db row without key (and not coach) → not in departures.
  - departed row reappears → in `returns` and patch has `status:'active'`.
  - team change → in `transfers`, patch has new `team`.
  - coach changed team → one update (no insert); two coaches same name → `conflicts` contains the name, no update; active coach of this org absent from scraped → in `departures`.
  - `checkSafetyValve({a:0,b:40},null)` → not ok; `({a:20},{a:45})` → not ok; `({a:44},{a:45})` → ok; `(counts, null)` with all > 0 → ok.
- [ ] **Step 2: Run `node --test scripts/lib/rosterSync.test.mjs` → FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat: add pure roster sync planner with safety valve`.

### Task 7: CPBL client (cookie + parsing)

**Files:**
- Create: `scripts/lib/cpblClient.mjs`, `scripts/lib/cpblClient.test.mjs`, `scripts/lib/__fixtures__/cpbl/` (copy `team_ACN_A.html`, `team_ACN_D.html`, `per_0000000667.html` 彭政閔, `per_0000007560.html` 菲力士, `per_0000000064.html`, `per_0000009999.html` invalid from the fixtures backup)

**Interfaces:**
- Produces:
  ```js
  export function stripRosterMark(raw: string): { name: string, rosterMark: string|null }
  export function parseTeamPage(html: string, { team, league }): ScrapedPlayer[] // key = cpbl_acnt; coaches key = null, is_coach true
  export function parsePersonPage(html: string): { name, number, photo, team, league, pitching_hand, batting_hand, main_position, isPlayer: boolean } | null // null for invalid/homepage
  export async function createCpblSession(): Promise<{ get(path): Promise<{status, url, html}>, post(path, body): Promise<{status, url, html}> }>
  ```
  Reuse the existing `POSITION_CATEGORY_MAP` / `POSITION_EN_MAP` / hand-parsing logic from the current `scrape-cpbl.mjs` (move it, don't duplicate). `parsePersonPage` takes `team` from the page header (e.g. `中信兄弟`; `富邦悍將二軍` → team `富邦悍將`, league `二軍`) and canonicalizes via `canonicalTeamName`.

- [ ] **Step 1: Write tests:** `stripRosterMark('#麥斯威尼')` → `{name:'麥斯威尼', rosterMark:'#'}`; `'＃許基宏'` → mark `'#'`; `'✽杰克'` → `'✽'`; `'◎大瀧幸治'` → `'◎'`; `'吉力吉撈．鞏冠'` → unchanged, mark null. `parseTeamPage(ACN_A,{team:'中信兄弟',league:'一軍'})` → 44 rows, includes `菲力士` with key `0000007560`, no name starts with a mark char, coaches have `is_coach:true`. `parsePersonPage(per_0000000667)` → name `彭政閔`, team `中信兄弟`; `per_0000007560` → name `菲力士`; `per_0000009999` → `null`.
- [ ] **Step 2: Run → FAIL. Step 3: Implement. Step 4: Run → PASS.**
- [ ] **Step 5: Live smoke test:** a tiny inline script calling `createCpblSession()` then `post('/team','ClubNo=ACN&KindCode=A')` → status 200, `parseTeamPage` returns > 30 rows.
- [ ] **Step 6: Commit** — `feat: add CPBL client with CDN cookie handling and roster-mark parsing`.

### Task 8: Merge planner + normalize existing data

**Files:**
- Create: `scripts/lib/playerMerge.mjs`, `scripts/lib/playerMerge.test.mjs`, `scripts/normalize-existing-players.mjs`

**Interfaces:**
- Consumes: `MANUAL_FIELDS` (Task 6), `canonicalTeamName`, `orgOfTeam` (Task 5).
- Produces:
  ```js
  export function planDuplicateMerges(rows): { keepId, removeIds: string[], patch: object }[] // group by org+name+team; keep the row with an external id, else oldest created_at; patch copies MANUAL_FIELDS into keep only where keep's value is empty
  export function matchUnkeyed(dbRows, scraped, { org, keyField }): { matches: { id, key }[], ambiguous: { name, candidates: string[] }[] }
  // matches only when exactly one db row in the org has that name and no keyField; >1 → ambiguous
  ```
- `normalize-existing-players.mjs [--apply]`: (1) `team = canonicalTeamName(team)`, and `team = canonicalTeamName(original_team)` where `team = '其他球隊'`; (2) `org = orgOfTeam(team)`; (3) same renames on `team_chants.team`; (4) apply `planDuplicateMerges`. Prints every change; writes only with `--apply`.

- [ ] **Step 1: Tests:** two rows same name/team, one with `cpbl_acnt` and no song, other with song → keep the acnt row, patch `{song}`, remove other. Keep row already has song → song not overwritten. Same name different team → no merge. `matchUnkeyed`: one unkeyed `孫易磊` + scraped `孫易磊` → match; two unkeyed `林子豪` → ambiguous.
- [ ] **Step 2: FAIL → Step 3: implement → Step 4: PASS.**
- [ ] **Step 5: Dry run** `node scripts/normalize-existing-players.mjs` → shows 3 merge groups (郭俊麟, 宋家豪, 孫易磊), 達比修有 → `聖地牙哥教士`, no row left with `team='其他球隊'`, every row gets an `org`. Show the output to the user.
- [ ] **Step 6: After user OK, `--apply`;** re-run dry → no changes. Player count = 621 − removed duplicates.
- [ ] **Step 7: Commit** — `feat: normalize existing player teams/orgs and merge duplicates`.

### Task 9: CPBL current sync script

**Files:**
- Rewrite: `scripts/scrape-cpbl.mjs`
- Modify: `.gitignore` (add `scripts/.cache/`)

**Interfaces:**
- Consumes: `createCpblSession`, `parseTeamPage`, `parsePersonPage` (Task 7); `planRosterSync`, `checkSafetyValve` (Task 6); `matchUnkeyed` (Task 8); `createServiceClient` (Task 2).
- Behavior: fetch 12 pages → `checkSafetyValve` against `scripts/.cache/cpbl-last-counts.json` (abort on fail, exit 1) → `matchUnkeyed` first-run linking → person pages only for inserts → `planRosterSync(org:'CPBL', keyField:'cpbl_acnt')` → print summary (新增 / 換隊 names / 離隊 names / 回鍋 / conflicts / ambiguous) → with `--apply` write and save counts. AdminScreen-style batching is fine; paginate the DB read (>1000).

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Dry run** → summary shows names without mark chars; departures list is plausible (show to user).
- [ ] **Step 3: `--apply`, then dry run again** → all zero.
- [ ] **Step 4: Verify manual fields:** pick 3 players that had `song` in the backup → same `song`/`intro` after.
- [ ] **Step 5: Verify safety valve live:** temporarily edit `scripts/.cache/cpbl-last-counts.json` to double one page's count, dry run → aborts with reason; restore file.
- [ ] **Step 6: Commit** — `feat: rewrite CPBL sync with departures, returns and safety valve`.

### Task 10: History backfill

**Files:**
- Create: `scripts/backfill-cpbl-history.mjs`

**Interfaces:**
- Consumes: `createCpblSession`, `parsePersonPage`, `matchUnkeyed`, `createServiceClient`.
- Behavior: iterate Acnt from progress file `scripts/.cache/cpbl-history-progress.json` (`{ next, found: [...] }`, saved every 25 ids), 1 req/s, stop after 300 consecutive invalid ids past the highest valid id seen. Refresh session on non-200/redirect loops. Skip Acnts already in DB. For new ones, build rows `{ org:'CPBL', status:'departed', cpbl_acnt, …parsed }`; `isPlayer:false` (staff) rows get `is_coach:true`. Before inserting, `matchUnkeyed` against unkeyed DB rows; ambiguous ones written to `scripts/.cache/cpbl-history-ambiguous.json` for the user. `--apply` inserts in batches of 200; without it only scans and reports counts.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Short run** with a `--limit 50` flag → interrupt with Ctrl-C after ~20, re-run → resumes at the saved `next`.
- [ ] **Step 3: Full run in background** (`run_in_background`, ~2–3 h) with `--apply`.
- [ ] **Step 4: Verify:** 彭政閔 and 陳金鋒 exist with `status='departed'`; `select cpbl_acnt, count(*) … having count(*)>1` → none; show ambiguous list to user.
- [ ] **Step 5: Run Task 9 sync `--apply`** → current players back to `active`.
- [ ] **Step 6: Commit** — `feat: add resumable CPBL history backfill`.

### Task 11: NPB sync

**Files:**
- Create: `scripts/lib/npbClient.mjs`, `scripts/lib/npbClient.test.mjs`, `scripts/lib/__fixtures__/npb/` (one team's roster page, saved during Step 1), `scripts/sync-npb.mjs`

**Interfaces:**
- Produces: `parseNpbRoster(html, { team }): ScrapedPlayer[]` (key = `npb_id`, `league` 一軍 for 支配下 / 二軍 for 育成, names as on page); `fetchNpbRoster(npbCode): Promise<string>`.
- Consumes: `planRosterSync(org:'NPB', keyField:'npb_id')`, `checkSafetyValve`, `matchUnkeyed` (links existing unkeyed Japanese players), `TEAMS` (`npbCode`).

- [ ] **Step 1: Research** npb.jp roster page URL/structure for one team; save it as a fixture; note in the commit how 支配下/育成 and coaches are distinguished.
- [ ] **Step 2: Tests:** fixture → row count in expected range (60–110), contains a known player by kanji name with an id, katakana foreigner present unchanged, both leagues present.
- [ ] **Step 3: FAIL → implement → PASS.**
- [ ] **Step 4: `sync-npb.mjs` dry run** → 12 teams, per-team counts, existing 藤浪/孫易磊-type rows linked (not inserted twice), ambiguous list shown to user.
- [ ] **Step 5: `--apply`, re-run dry → zero.**
- [ ] **Step 6: Remove NPB-based Taiwanese players from the MLB/curated list** (Task 12 data file) so they're maintained only here.
- [ ] **Step 7: Commit** — `feat: add NPB full-roster sync`.

### Task 12: Curated MLB list

**Files:**
- Create: `scripts/data/mlb-players.json`
- Rewrite: `scripts/add-international-players.mjs`

**Interfaces:**
- Data file entries: `{ name, number, team, main_position, pitching_hand, batting_hand, mlbId?, status? }` — moved from the current hardcoded list, minus NPB players, team names canonicalized, names per nationality rule (Japanese kanji kept, others English).
- Script: upsert by `mlb_id`, else `name`+`team` via `matchUnkeyed`; `org:'MLB'`; photo via existing `mlbPhotoUrl`; `status` from file (default `active`); no departure logic. `--apply` to write.

- [ ] **Step 1: Implement; dry run** → only updates/links, no duplicates of existing rows.
- [ ] **Step 2: `--apply`, re-run → zero changes.**
- [ ] **Step 3: Commit** — `refactor: move curated MLB players to a data file`.

---

## Phase C — 前台

### Task 13: Data loading, names, team display

**Files:**
- Create: `src/lib/playerName.js`, `src/lib/playerName.test.mjs`
- Modify: `src/composables/usePlayerData.js`, `src/components/AdminScreen.vue` (`loadData`), `src/components/PlayerCard.vue`, `src/components/LineupIntroScreen.vue`, the component(s) rendering the lineup/batting-order list

**Interfaces:**
- Produces: `lineupName(name: string): string` — if the name is Latin script (`/^[\p{Script=Latin}\s.'’-]+$/u`), return the last token, joining a trailing suffix (`Jr.`, `Sr.`, `II`, `III`, `IV`) with the token before it; otherwise return `name` unchanged. `usePlayerData` roster items gain `org`, `status`, `rosterMark`; drop the `originalTeam` read — components use `player.team`. Remove `normalizeTeamName`/`CPBL_TEAMS`/`teamLogos` from `usePlayerData` in favor of `src/constants/teams.js`; update `App.vue` destructuring accordingly.
- Both loaders fetch with `.range(from, from + 999)` until a short page.

- [ ] **Step 1: Tests:** `'Stuart Fairchild'`→`'Fairchild'`; `'Vladimir Guerrero Jr.'`→`'Guerrero Jr.'`; `'Ichiro'`→`'Ichiro'`; `'山本由伸'`→same; `'オースティン'`→same; `'吉力吉撈．鞏冠'`→same.
- [ ] **Step 2: FAIL → implement → PASS.**
- [ ] **Step 3: Wire loaders, `team` display, `lineupName` in the lineup list only.**
- [ ] **Step 4: Manual verify:** MenuScreen count equals DB count (now > 1000); AdminScreen 全部球員 shows the same total; 達比修有's card shows 聖地牙哥教士; a lineup with Stuart Fairchild shows `Fairchild`.
- [ ] **Step 5: Commit** — `feat: paginated roster loading, team display and lineup surnames`.

### Task 14: 聯盟 → 球隊 and 離隊／歷史

**Files:**
- Create: `src/components/OrgTabs.vue`
- Modify: `src/composables/usePlayerFilters.js`, `src/App.vue`, `LineupSelectionScreen.vue`, `BatterSelectDialog.vue`, `PitcherSelectDialog.vue`, `DefenseReorganizeDialog.vue`, `ChantPlayerScreen.vue`

**Interfaces:**
- `usePlayerFilters` adds `selectedOrg = ref('CPBL')` (returned); `selectedLeague` options become `'一軍'|'二軍'|'coach'|'all'|'departed'`. Active options filter `status === 'active'`; `'departed'` filters `status === 'departed'` (ignores league/coach). `teams` / `teamsWithBatters` / `teamsWithPitchers` are limited to `orgOfTeam(team) === selectedOrg`, ordered by `TEAMS` order (CPBL active six first, defunct after). Selecting a different org resets `selectedTeam` to `null`.
- `OrgTabs.vue`: `v-model` (`modelValue` = org id), renders `ORGS` labels, styled like the existing 一軍/二軍 pills in `LineupSelectionScreen.vue`.
- Each of the four selection UIs: add `OrgTabs` above the team buttons, add `離隊／歷史` to the league pills, replace the local `CPBL_TEAMS` constant + "其他球隊" fold with the org-filtered team list (logo when `teamInfo(team).logo`, else ⚾ as today). `DefenseReorganizeDialog` keeps its own local picker state but uses the same rules. `ChantPlayerScreen` only swaps its local constants for imports (still CPBL six).
- No visual redesign — reuse existing classes.

- [ ] **Step 1: Implement filters + OrgTabs + four UIs.**
- [ ] **Step 2: Manual verify:** 中職 一軍 shows no departed players; 離隊／歷史 under 中職 shows 彭政閔 under 中信兄弟 and defunct teams as groups; 日職 shows 12 teams with logos; 美職 lists MLB teams; build a 2-team game with a lineup mixing 中信兄弟 and 阪神虎 players and play one at-bat; pitcher dialog and defense reorganize dialog can pick an NPB pitcher.
- [ ] **Step 3: `npm run build`** → succeeds.
- [ ] **Step 4: Commit** — `feat: org tabs and departed/history tab in player selection`.

### Task 15: Successor + generic chant fallback

**Files:**
- Create: `src/lib/chantFallback.js`, `src/lib/chantFallback.test.mjs`
- Modify: `src/composables/useAudio.js`, `src/App.vue` (load `app_settings`), `src/components/AdminScreen.vue` (嗆斯曲 tab field)

**Interfaces:**
- Produces: `pickFallbackChant(player, teamChants, genericUrl, random = Math.random): { kind: 'team'|'successor'|'generic', url: string } | null` — team chants of `player.team`; else chants of `teamInfo(player.team)?.successor`; else `genericUrl` if non-empty; else `null`.
- `useAudio.playBatterMusic(player, teamChants, genericChantUrl)` uses it in the existing "no intro/song" branch; generic plays looped like team chants today.
- AdminScreen 嗆斯曲 tab: one input + 儲存 that upserts `app_settings` `{ key: 'generic_chant_url', value }`; shows current value on load.

- [ ] **Step 1: Tests:** player with team chants → `team`; 兄弟象 player, no 兄弟象 chants, 中信兄弟 chants exist → `successor`; NPB player, generic set → `generic`; nothing → `null`; `random` stub picks deterministic index.
- [ ] **Step 2: FAIL → implement → PASS.**
- [ ] **Step 3: Manual verify:** set generic URL in admin; an NPB player without song plays it; a 兄弟象 historical player without song plays a 中信兄弟 chant.
- [ ] **Step 4: Commit** — `feat: successor and generic chant fallback`.

---

## Phase D — 清理

### Task 16: Remove leftovers, docs

**Files:**
- Delete: `app.jsx`, `index-vue.html`, `src/App-Simple.vue`, `scripts/import-players.mjs`
- Modify: `README.md`

- [ ] **Step 1: `git grep -n -e "App-Simple" -e "index-vue" -e "app.jsx" -e "import-players"`** excluding `docs/` → no hits. Delete files.
- [ ] **Step 2: README:** remove 「CSV 球員名單匯入」; add `.env` variables, `npm test`, and the sync commands (`scrape-cpbl.mjs`, `sync-npb.mjs`, `add-international-players.mjs`, `backfill-cpbl-history.mjs`, all `--apply`).
- [ ] **Step 3: `npm test && npm run build`** → pass.
- [ ] **Step 4: Commit** — `chore: remove leftover prototypes and legacy CSV import`.
- [ ] **Step 5: Confirm with user, then merge to `main` and push** (deploys Phases B–D); verify `https://baseballvs.vercel.app` loads > 1000 players and org tabs work.
