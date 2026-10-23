// 舊歌音量統一：把資料庫引用的所有 Dropbox 音檔（players.song／intro、team_chants.url、
// app_settings.generic_chant_url）調到同一目標響度 TARGET_LUFS。
//
// node scripts/normalize-music.mjs                 dry run：下載備份 → 量測 → 列出每首響度與將套用的增益（不寫入）
// node scripts/normalize-music.mjs --only-measure  只量測目前 Dropbox 上的檔案（下載到暫存目錄，不動備份），印響度統計
// node scripts/normalize-music.mjs --apply         dry run 全部步驟後，重新編碼（V0、gapless、−1 dBTP）並同路徑覆蓋上傳；
//                                                  分享連結若改變則更新資料庫引用
//
// 備份：/Users/tonywang/orca/workspaces/baseballvs/backups/music-<YYYY-MM-DD>/（含 manifest.json）。
// 備份檔已存在就不重下載，所以同一天 --apply 後再跑也不會被新檔蓋掉；重編碼一律以備份（原檔）為來源。
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { createServiceClient, loadEnv } from './lib/env.mjs'
import { fetchAllPages } from '../src/lib/fetchAllPages.js'
import { TARGET_LUFS, decodeDurationSec, measureLoudness, renderCut } from './lib/audioCut.mjs'
import { getDropboxAccessToken, getSharedLinkRawUrl, uploadToDropbox } from './lib/dropboxMusicSync.mjs'
import { backupFileName, fileActions, median, planNormalization, toSharedLinkUrl } from './lib/normalizePlan.mjs'

const BACKUP_ROOT = '/Users/tonywang/orca/workspaces/baseballvs/backups'
const KIND_LABEL = { song: '循環版', intro: '前奏版', chant: '嗆斯曲', generic: '通用應援曲' }

const { values: args } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    'only-measure': { type: 'boolean', default: false },
  },
})
if (args.apply && args['only-measure']) {
  console.error('--apply 與 --only-measure 不能同時使用')
  process.exit(1)
}

loadEnv()
const supabase = createServiceClient()

function check(error, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
}

function isDropboxUrl(v) {
  if (!/^https?:\/\//i.test(v || '')) return false
  return /(^|\.)dropbox(usercontent)?\.com$/i.test(new URL(v).hostname)
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

// Downloads each URL once into dir (skips files already there when keepExisting), measures it.
// Returns Map url -> { file, lufs, truePeakDb, error }.
async function fetchAndMeasure(urls, dir, { keepExisting }) {
  const out = new Map()
  let i = 0
  for (const url of urls) {
    i++
    const file = join(dir, backupFileName(url))
    process.stdout.write(`\r量測中 ${i}/${urls.length}`)
    try {
      if (!(keepExisting && existsSync(file) && statSync(file).size > 0)) await download(url, file)
      const { integratedLufs, truePeakDb } = await measureLoudness(file)
      out.set(url, { file, lufs: integratedLufs, truePeakDb })
    } catch (e) {
      out.set(url, { file, lufs: null, error: e.message })
    }
  }
  process.stdout.write('\n')
  return out
}

const fmt = (v, d = 1) => (Number.isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(d) : String(v ?? '—'))

// The 循環版 median is the reference for choosing TARGET_LUFS with the user.
function printStats(refs, measured) {
  for (const kind of Object.keys(KIND_LABEL)) {
    const values = [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.url))].map((u) => measured.get(u).lufs)
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

async function applyActions(actions, measured, workDir) {
  const token = await getDropboxAccessToken()
  mkdirSync(workDir, { recursive: true })
  const done = []
  const relinked = []
  const failed = []
  let i = 0
  for (const a of actions) {
    i++
    const { file } = measured.get(a.url)
    const out = join(workDir, backupFileName(a.url))
    console.log(`[${i}/${actions.length}] ${a.refs[0].label} ${KIND_LABEL[a.refs[0].kind]} ${fmt(a.gainDb)} dB`)
    try {
      const path = await sharedLinkPath(token, a.url)
      await renderCut({ src: file, out, start: 0, end: await decodeDurationSec(file), fadeInMs: 0, fadeOutMs: 0, gainDb: a.gainDb })
      await uploadToDropbox(token, out, path)
      const newUrl = await getSharedLinkRawUrl(token, path)
      if (toSharedLinkUrl(newUrl) !== toSharedLinkUrl(a.url)) {
        for (const ref of a.refs) await updateReference(ref, newUrl)
        relinked.push(a)
      }
      done.push(a)
    } catch (e) {
      failed.push({ ...a, error: e.message })
      console.error(`  失敗：${e.message}`)
    }
  }
  console.log(`\n套用完成：重新編碼並上傳 ${done.length}、分享連結改變而更新資料庫 ${relinked.length}、失敗 ${failed.length}`)
  for (const f of failed) console.log(`  失敗：${f.refs[0].label} ${KIND_LABEL[f.refs[0].kind]} — ${f.error}`)
  if (failed.length) process.exitCode = 1
}

async function main() {
  const mode = args.apply ? '--apply 寫入模式' : args['only-measure'] ? '--only-measure 只量測' : 'dry run，不寫入'
  console.log(`舊歌音量統一（${mode}），目標 ${TARGET_LUFS} LUFS\n`)
  const { refs, ignored } = await collectRefs()
  const urls = [...new Set(refs.map((r) => r.url))]
  console.log(`資料庫引用 Dropbox 音檔 ${refs.length} 處、${urls.length} 個檔案；非 Dropbox 連結略過 ${ignored.length} 處`)

  if (args['only-measure']) {
    const dir = mkdtempSync(join(tmpdir(), 'normalize-music-'))
    try {
      const measured = await fetchAndMeasure(urls, dir, { keepExisting: false })
      for (const r of refs) {
        const m = measured.get(r.url)
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
  const measured = await fetchAndMeasure(urls, backupDir, { keepExisting: true })
  const manifest = urls.map((url) => ({
    url,
    file: backupFileName(url),
    refs: refs.filter((r) => r.url === url).map(({ kind, ownerId, label }) => ({ kind, ownerId, label })),
  }))
  writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), files: manifest }, null, 2))
  const backedUp = urls.filter((u) => existsSync(measured.get(u).file)).length
  console.log(`備份：${backupDir}（${backedUp}/${urls.length} 個檔案，manifest.json）`)

  const plan = planNormalization(refs.map((r) => ({ ...r, lufs: measured.get(r.url).lufs })), TARGET_LUFS)
  const actions = fileActions(plan)
  console.log('\n目前響度    增益      類型      檔案 / 引用')
  for (const a of actions) {
    const m = measured.get(a.url)
    const who = a.refs.map((r) => `${KIND_LABEL[r.kind]} ${r.label}`).join('；')
    console.log(`${fmt(m.lufs).padStart(6)} LUFS  ${a.skipped ? '  略過' : `${fmt(a.gainDb)} dB`.padStart(8)}  ${backupFileName(a.url)}  ${who}`)
  }
  console.log('')
  printStats(refs, measured)
  const skipped = actions.filter((a) => a.skipped)
  console.log(`\n將重新編碼 ${actions.length - skipped.length} 個檔案，略過 ${skipped.length}`)
  for (const a of skipped) console.log(`  略過：${a.refs.map((r) => `${KIND_LABEL[r.kind]} ${r.label}`).join('；')} — ${measured.get(a.url).error ?? a.skipped}`)

  if (!args.apply) {
    console.log('\ndry run 結束（未寫入）。加 --apply 才會重新編碼並上傳。')
    return
  }
  await applyActions(actions.filter((a) => !a.skipped), measured, join(backupDir, 'normalized'))
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
