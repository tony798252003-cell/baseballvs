// 舊歌音量統一：把資料庫引用的所有 Dropbox 音檔（players.song／intro、team_chants.url、
// app_settings.generic_chant_url）調到同一目標響度 TARGET_LUFS。
//
// node scripts/normalize-music.mjs                 dry run：下載備份 → 量測 → 列出每首響度與將套用的增益（不寫入）
// node scripts/normalize-music.mjs --only-measure  只量測目前 Dropbox 上的檔案（下載到暫存目錄，不動備份），印響度統計
// node scripts/normalize-music.mjs --apply         dry run 全部步驟後，重新編碼（V0、gapless、−1 dBTP）並同路徑覆蓋上傳；
//                                                  分享連結若改變則更新資料庫引用
// 試跑單檔：--only <球員 id 或分享連結>（球員 id ＝該球員的循環版＋前奏版）、--limit <n>（前 n 個單位，
//          一位球員的循環版＋前奏版算一個單位）。可與上面任一模式併用。
//
// 備份：/Users/tonywang/orca/workspaces/baseballvs/backups/music-<YYYY-MM-DD>/（含 manifest.json，逐檔寫入）。
// 可重複執行：備份檔已存在就不重下載（同一天 --apply 後再跑也不會被新檔蓋掉；重編碼一律以備份原檔為來源），
// 已套用過的 Dropbox 路徑記在 backups/music-applied.json，之後任何一天再跑都會略過，不會重複調整。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { createServiceClient, loadEnv } from './lib/env.mjs'
import { fetchAllPages } from '../src/lib/fetchAllPages.js'
import { TARGET_LUFS, decodeDurationSec, measureLoudness, renderWithSharedCeiling } from './lib/audioCut.mjs'
import { getDropboxAccessToken, getSharedLinkRawUrl, uploadToDropbox } from './lib/dropboxMusicSync.mjs'
import {
  backupFileName, fileActions, linkKey, median, pathConflicts, planNormalization, renderGroups, selectRefs, toSharedLinkUrl,
} from './lib/normalizePlan.mjs'

const BACKUP_ROOT = '/Users/tonywang/orca/workspaces/baseballvs/backups'
const LEDGER_PATH = join(BACKUP_ROOT, 'music-applied.json')
const KIND_LABEL = { song: '循環版', intro: '前奏版', chant: '嗆斯曲', generic: '通用應援曲' }
const MAX_DURATION_DRIFT_SEC = 0.05

const { values: args } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    'only-measure': { type: 'boolean', default: false },
    only: { type: 'string' },
    limit: { type: 'string' },
  },
})
if (args.apply && args['only-measure']) {
  console.error('--apply 與 --only-measure 不能同時使用')
  process.exit(1)
}
if (args.limit != null && !/^[1-9]\d*$/.test(args.limit)) {
  console.error('--limit 需要正整數')
  process.exit(1)
}

loadEnv()
const supabase = createServiceClient()

function check(error, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
}

function isDropboxUrl(v) {
  if (!/^https?:\/\//i.test(v || '')) return false
  try {
    return /(^|\.)dropbox(usercontent)?\.com$/i.test(new URL(v).hostname)
  } catch {
    return false
  }
}

function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback
}

function writeJson(path, value) {
  writeFileSync(`${path}.part`, JSON.stringify(value, null, 2))
  renameSync(`${path}.part`, path)
}

// Every Dropbox reference in the DB; TTS-text intros and non-Dropbox links are not ours to rewrite.
async function collectRefs() {
  const players = await fetchAllPages(() => supabase.from('players').select('id, name, team, song, intro').order('id'))
  const chants = await fetchAllPages(() => supabase.from('team_chants').select('id, team, name, url').order('id'))
  const { data: generic, error } = await supabase.from('app_settings').select('value').eq('key', 'generic_chant_url').maybeSingle()
  check(error, 'read app_settings')

  const refs = []
  const ignored = []
  const add = (ref) => (isDropboxUrl(ref.url) ? refs.push(ref) : /^https?:/i.test(ref.url || '') && ignored.push(ref))
  for (const p of players) {
    if (p.song) add({ kind: 'song', ownerId: p.id, url: p.song, label: `${p.team ?? ''} ${p.name}` })
    if (p.intro) add({ kind: 'intro', ownerId: p.id, url: p.intro, label: `${p.team ?? ''} ${p.name}` })
  }
  for (const c of chants) add({ kind: 'chant', ownerId: c.id, url: c.url, label: `${c.team} ${c.name}` })
  if (generic?.value) add({ kind: 'generic', ownerId: 'generic', url: generic.value, label: '通用應援曲' })
  return { refs, ignored }
}

// Public shared links download without a token. Written to a temp name first so a broken download
// never becomes a "backup".
async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下載失敗 ${res.status}`)
  if (/text\/html/i.test(res.headers.get('content-type') || '')) throw new Error('下載到的是網頁而不是音檔（連結失效？）')
  writeFileSync(`${dest}.part`, Buffer.from(await res.arrayBuffer()))
  renameSync(`${dest}.part`, dest)
}

// Downloads each file (by linkKey) once into dir (skips files already there when keepExisting), measures it.
// Returns Map key -> { file, lufs, truePeakDb, error }; onEach(key, result) runs after every file.
async function fetchAndMeasure(urlByKey, dir, { keepExisting, onEach = () => {} }) {
  const out = new Map()
  let i = 0
  for (const [key, url] of urlByKey) {
    i++
    const file = join(dir, backupFileName(url))
    process.stdout.write(`\r量測中 ${i}/${urlByKey.size}`)
    try {
      if (!(keepExisting && existsSync(file) && statSync(file).size > 0)) await download(url, file)
      const { integratedLufs, truePeakDb } = await measureLoudness(file)
      out.set(key, { file, lufs: integratedLufs, truePeakDb })
    } catch (e) {
      out.set(key, { file, lufs: null, error: e.message })
    }
    onEach(key, out.get(key))
  }
  process.stdout.write('\n')
  return out
}

const fmt = (v, d = 1) => (Number.isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(d) : String(v ?? '—'))
const describe = (a) => a.refs.map((r) => `${KIND_LABEL[r.kind]} ${r.label}`).join('；')

// The 循環版 median is the reference for choosing TARGET_LUFS with the user.
function printStats(refs, measured) {
  for (const kind of Object.keys(KIND_LABEL)) {
    const values = [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.key))].map((k) => measured.get(k).lufs)
    if (!values.length) continue
    const finite = values.filter(Number.isFinite)
    const range = finite.length ? `${fmt(Math.min(...finite))} ~ ${fmt(Math.max(...finite))}` : '—'
    console.log(`${KIND_LABEL[kind]}：${values.length} 首，中位數 ${fmt(median(finite))} LUFS，範圍 ${range}，無法量測 ${values.length - finite.length}`)
  }
  const all = [...measured.values()].map((m) => m.lufs).filter(Number.isFinite)
  const within = all.filter((v) => Math.abs(v - TARGET_LUFS) <= 1).length
  console.log(`全部 ${measured.size} 個檔案，中位數 ${fmt(median(all))} LUFS；落在目標 ${TARGET_LUFS} ±1 LU 內：${within}/${all.length}`)
}

// Dropbox path of a shared link (needs a token; only called with --apply).
async function sharedLinkPath(token, url) {
  const res = await fetch('https://api.dropboxapi.com/2/sharing/get_shared_link_metadata', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: toSharedLinkUrl(url) }),
  })
  if (!res.ok) throw new Error(`查分享連結路徑失敗 ${res.status} ${await res.text()}`)
  const meta = await res.json()
  if (!meta.path_lower) throw new Error('分享連結沒有路徑（檔案不在此 Dropbox 帳號內？）')
  return meta.path_lower
}

async function updateReference(ref, newUrl) {
  const q = {
    song: () => supabase.from('players').update({ song: newUrl }).eq('id', ref.ownerId).eq('song', ref.url),
    intro: () => supabase.from('players').update({ intro: newUrl }).eq('id', ref.ownerId).eq('intro', ref.url),
    chant: () => supabase.from('team_chants').update({ url: newUrl }).eq('id', ref.ownerId).eq('url', ref.url),
    generic: () => supabase.from('app_settings').update({ value: newUrl }).eq('key', 'generic_chant_url').eq('value', ref.url),
  }[ref.kind]
  const { data, error } = await q().select()
  check(error, `更新 ${ref.kind} ${ref.ownerId}`)
  if (!data?.length) throw new Error(`資料庫引用已變動，未更新 ${ref.kind} ${ref.ownerId}`)
}

// Uploads nothing until every action's Dropbox path is resolved and checked for collisions; each render
// group (a player's song + intro) is rendered with one shared limiter ceiling and uploaded as a unit.
async function applyGroups(groups, measured, workDir, ledger, backupDir) {
  const token = await getDropboxAccessToken()
  mkdirSync(workDir, { recursive: true })
  const failures = new Map() // key -> reason
  const pathOf = new Map()
  const actions = groups.flat()

  for (const a of actions) {
    try {
      pathOf.set(a.key, await sharedLinkPath(token, a.url))
    } catch (e) {
      failures.set(a.key, e.message)
    }
  }
  const conflicts = pathConflicts(actions.filter((a) => pathOf.has(a.key)).map((a) => ({ action: a, path: pathOf.get(a.key) })))
  for (const key of conflicts) failures.set(key, `Dropbox 路徑 ${pathOf.get(key)} 被多個不同連結引用`)

  const done = []
  const relinked = []
  const alreadyApplied = []
  let i = 0
  for (const group of groups) {
    i++
    console.log(`[${i}/${groups.length}] ${group.map(describe).join('＋')} ${fmt(group[0].gainDb)} dB`)
    const failed = group.filter((a) => failures.has(a.key))
    if (failed.length) {
      for (const a of group) if (!failures.has(a.key)) failures.set(a.key, `同組檔案失敗，整組略過（${failures.get(failed[0].key)}）`)
      console.error(`  略過：${failures.get(failed[0].key)}`)
      continue
    }
    const applied = group.filter((a) => ledger.applied[pathOf.get(a.key)])
    if (applied.length === group.length) {
      alreadyApplied.push(...group)
      console.log('  已套用過，略過')
      continue
    }
    if (applied.length) {
      for (const a of group) failures.set(a.key, '同組只有部分檔案已套用，需人工確認')
      console.error('  略過：同組只有部分檔案已套用，需人工確認')
      continue
    }
    try {
      const cuts = []
      for (const a of group) {
        const src = measured.get(a.key).file
        const srcDur = await decodeDurationSec(src)
        cuts.push({ a, srcDur, src, out: join(workDir, backupFileName(a.url)), start: 0, end: srcDur, gainDb: a.gainDb })
      }
      await renderWithSharedCeiling(cuts)
      for (const c of cuts) {
        const outDur = await decodeDurationSec(c.out)
        if (Math.abs(outDur - c.srcDur) > MAX_DURATION_DRIFT_SEC) {
          throw new Error(`重新編碼後長度 ${outDur.toFixed(3)}s 與原檔 ${c.srcDur.toFixed(3)}s 差超過 ${MAX_DURATION_DRIFT_SEC * 1000} ms（${c.a.refs[0].label}）`)
        }
      }
      for (const { a, out } of cuts) {
        const path = pathOf.get(a.key)
        await uploadToDropbox(token, out, path)
        const newUrl = await getSharedLinkRawUrl(token, path)
        const changed = linkKey(newUrl) !== a.key
        if (changed) for (const ref of a.refs) await updateReference(ref, newUrl)
        ledger.applied[path] = {
          key: a.key, url: a.url, newUrl: changed ? newUrl : undefined, gainDb: a.gainDb, backup: measured.get(a.key).file,
          backupDir, appliedAt: new Date().toISOString(),
        }
        writeJson(LEDGER_PATH, ledger)
        done.push(a)
        if (changed) relinked.push(a)
      }
    } catch (e) {
      for (const a of group) if (!done.includes(a)) failures.set(a.key, e.message)
      console.error(`  失敗：${e.message}`)
    }
  }
  console.log(`\n套用完成：重新編碼並上傳 ${done.length}、分享連結改變而更新資料庫 ${relinked.length}、` +
    `先前已套用 ${alreadyApplied.length}、失敗／略過 ${failures.size}`)
  for (const a of actions) if (failures.has(a.key)) console.log(`  失敗：${describe(a)} — ${failures.get(a.key)}`)
  if (failures.size) process.exitCode = 1
}

async function main() {
  const mode = args.apply ? '--apply 寫入模式' : args['only-measure'] ? '--only-measure 只量測' : 'dry run，不寫入'
  console.log(`舊歌音量統一（${mode}），目標 ${TARGET_LUFS} LUFS\n`)
  const collected = await collectRefs()
  const refs = selectRefs(collected.refs, { only: args.only, limit: args.limit && Number(args.limit) })
    .map((r) => ({ ...r, key: linkKey(r.url) }))
  if (!refs.length) throw new Error(args.only ? `--only ${args.only} 找不到對應的引用` : '沒有任何 Dropbox 音檔引用')
  const urlByKey = new Map()
  for (const r of refs) if (!urlByKey.has(r.key)) urlByKey.set(r.key, r.url)
  const narrowed = args.only || args.limit ? `（--only/--limit 篩選後；全部 ${collected.refs.length} 處）` : ''
  console.log(`資料庫引用 Dropbox 音檔 ${refs.length} 處、${urlByKey.size} 個檔案${narrowed}；非 Dropbox 連結略過 ${collected.ignored.length} 處`)

  if (args['only-measure']) {
    const dir = mkdtempSync(join(tmpdir(), 'normalize-music-'))
    try {
      const measured = await fetchAndMeasure(urlByKey, dir, { keepExisting: false })
      for (const r of refs) {
        const m = measured.get(r.key)
        console.log(`${fmt(m.lufs).padStart(6)} LUFS  TP ${fmt(m.truePeakDb).padStart(5)}  ${KIND_LABEL[r.kind]}  ${r.label}${m.error ? `  ✗ ${m.error}` : ''}`)
      }
      printStats(refs, measured)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    return
  }

  const backupDir = join(BACKUP_ROOT, `music-${new Date().toLocaleDateString('sv-SE')}`)
  mkdirSync(backupDir, { recursive: true })
  const manifestPath = join(backupDir, 'manifest.json')
  const manifest = readJson(manifestPath, { createdAt: new Date().toISOString(), files: [] })
  const entries = new Map(manifest.files.map((f) => [f.key, f]))
  const measured = await fetchAndMeasure(urlByKey, backupDir, {
    keepExisting: true,
    onEach(key, m) {
      entries.set(key, {
        key,
        url: urlByKey.get(key),
        file: backupFileName(urlByKey.get(key)),
        refs: refs.filter((r) => r.key === key).map(({ kind, ownerId, label, url }) => ({ kind, ownerId, label, url })),
        lufs: Number.isFinite(m.lufs) ? m.lufs : null,
        error: m.error ?? null,
      })
      writeJson(manifestPath, { ...manifest, updatedAt: new Date().toISOString(), files: [...entries.values()] })
    },
  })
  const backedUp = [...measured.values()].filter((m) => existsSync(m.file)).length
  console.log(`備份：${backupDir}（${backedUp}/${urlByKey.size} 個檔案，manifest.json）`)

  const ledger = readJson(LEDGER_PATH, { applied: {} })
  const appliedKeys = new Set(Object.values(ledger.applied).map((e) => e.key))
  const plan = planNormalization(refs.map((r) => ({ ...r, lufs: measured.get(r.key).lufs })), TARGET_LUFS)
  const groups = renderGroups(fileActions(plan))
  const actions = groups.flat()
  console.log('\n目前響度    增益      檔案 / 引用')
  for (const a of actions) {
    const m = measured.get(a.key)
    const gain = a.skipped ? '  略過' : appliedKeys.has(a.key) ? '已套用' : `${fmt(a.gainDb)} dB`
    console.log(`${fmt(m.lufs).padStart(6)} LUFS  ${gain.padStart(8)}  ${backupFileName(a.url)}  ${describe(a)}`)
  }
  console.log('')
  printStats(refs, measured)
  const skipped = actions.filter((a) => a.skipped)
  const already = actions.filter((a) => !a.skipped && appliedKeys.has(a.key))
  console.log(`\n將重新編碼 ${actions.length - skipped.length - already.length} 個檔案，先前已套用 ${already.length}，略過 ${skipped.length}`)
  for (const a of skipped) console.log(`  略過：${describe(a)} — ${measured.get(a.key).error ?? a.skipped}`)

  if (!args.apply) {
    console.log('\ndry run 結束（未寫入）。加 --apply 才會重新編碼並上傳（建議先用 --only 試一首）。')
    return
  }
  await applyGroups(groups.filter((g) => !g[0].skipped), measured, join(backupDir, 'normalized'), ledger, backupDir)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
