#!/usr/bin/env node
// scripts/add-player-song.mjs
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { SUPABASE_URL, SUPABASE_KEY, uploadToDropbox, getSharedLinkRawUrl } from './lib/dropboxMusicSync.mjs'

try {
  process.loadEnvFile('.env')
} catch {
  // .env is optional; DROPBOX_TOKEN may already be in the environment
}

const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN
if (!DROPBOX_TOKEN) {
  console.error('❌ 缺少 DROPBOX_TOKEN，請在 .env 設定（參考 .env.example）')
  process.exit(1)
}

function checkFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  } catch {
    console.error('❌ 找不到 ffmpeg，請先安裝：brew install ffmpeg')
    process.exit(1)
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const rl = createInterface({ input: process.stdin, output: process.stdout })

async function ask(question) {
  return (await rl.question(question)).trim()
}

async function pickPlayer() {
  const keyword = await ask('搜尋球員姓名關鍵字：')
  const { data, error } = await supabase.from('players').select('id, name, number, team, song, intro').ilike('name', `%${keyword}%`)
  if (error) throw error
  if (!data || data.length === 0) {
    console.error('❌ 找不到符合的球員')
    process.exit(1)
  }
  if (data.length === 1) return data[0]

  console.log('找到多筆符合，請選擇：')
  data.forEach((p, i) => console.log(`  [${i}] ${p.name} #${p.number} (${p.team})`))
  const idx = Number(await ask('輸入編號：'))
  if (Number.isNaN(idx) || !data[idx]) {
    console.error('❌ 輸入無效')
    process.exit(1)
  }
  return data[idx]
}

function runFfmpeg(args) {
  execFileSync('ffmpeg', ['-y', ...args], { stdio: 'inherit' })
}

function trim(inputPath, outputPath, start, end) {
  const args = ['-i', inputPath]
  if (start) args.push('-ss', start)
  if (end) args.push('-to', end)
  args.push('-c:a', 'libmp3lame', '-q:a', '2', outputPath)
  runFfmpeg(args)
}

function concat(partPaths, outputPath, tmpDir) {
  const listPath = join(tmpDir, 'concat-list.txt')
  writeFileSync(listPath, partPaths.map(p => `file '${p}'`).join('\n'))
  runFfmpeg(['-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-q:a', '2', outputPath])
}

function adjustVolume(inputPath, outputPath, spec) {
  const filter = spec === 'auto' ? 'loudnorm' : `volume=${spec}dB`
  runFfmpeg(['-i', inputPath, '-af', filter, '-c:a', 'libmp3lame', '-q:a', '2', outputPath])
}

async function main() {
  const inputPaths = process.argv.slice(2)
  if (inputPaths.length === 0 || inputPaths.length > 2) {
    console.error('用法：node scripts/add-player-song.mjs <音檔路徑> [第二段音檔路徑]')
    process.exit(1)
  }

  checkFfmpeg()

  const player = await pickPlayer()
  let kind = null
  while (kind !== 'song' && kind !== 'intro') {
    const kindAnswer = (await ask('這次是 song（循環）還是 intro（進場播一次）？[song/intro]：')).toLowerCase()
    if (kindAnswer === 'song' || kindAnswer === 'intro') {
      kind = kindAnswer
    } else {
      console.log('請輸入 song 或 intro')
    }
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'add-player-song-'))
  const parts = []

  try {
    for (let i = 0; i < inputPaths.length; i++) {
      const start = await ask(`第 ${i + 1} 段裁切起始時間（mm:ss，留空 = 不裁切）：`)
      const end = await ask(`第 ${i + 1} 段裁切結束時間（mm:ss，留空 = 不裁切）：`)
      const partPath = join(tmpDir, `part-${i}.mp3`)
      trim(inputPaths[i], partPath, start || null, end || null)
      parts.push(partPath)
    }

    let mergedPath = parts[0]
    if (parts.length > 1) {
      mergedPath = join(tmpDir, 'merged.mp3')
      concat(parts, mergedPath, tmpDir)
    }

    const volumeAnswer = await ask('音量調整？留空 = 不調整，輸入 "auto" = 自動正規化，或輸入 dB 數值（例如 3 或 -2）：')
    let finalPath = mergedPath
    if (volumeAnswer) {
      finalPath = join(tmpDir, 'final.mp3')
      adjustVolume(mergedPath, finalPath, volumeAnswer)
    }

    const suffix = kind === 'intro' ? ' - Intro' : ''
    const dropboxPath = `/Music/Players/${player.team} - ${player.name}${suffix}.mp3`

    console.log(`上傳中：${dropboxPath}`)
    await uploadToDropbox(DROPBOX_TOKEN, finalPath, dropboxPath)

    console.log('產生分享連結中...')
    const url = await getSharedLinkRawUrl(DROPBOX_TOKEN, dropboxPath)

    const field = kind === 'intro' ? 'intro' : 'song'
    const { error } = await supabase.from('players').update({ [field]: url }).eq('id', player.id)
    if (error) throw error

    console.log('✅ 完成')
    console.log(`  球員：${player.name} #${player.number} (${player.team})`)
    console.log(`  欄位：${field}`)
    console.log(`  Dropbox 路徑：${dropboxPath}`)
    console.log(`  URL：${url}`)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
    rl.close()
  }
}

main().catch(e => {
  console.error('❌', e.message)
  process.exit(1)
})
