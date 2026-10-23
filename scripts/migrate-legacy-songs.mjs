#!/usr/bin/env node
// scripts/migrate-legacy-songs.mjs
import { loadEnv, createServiceClient } from './lib/env.mjs'
import { createInterface } from 'node:readline/promises'
import {
  TEAM_FOLDER_MAP,
  fuzzyNameMatch, parseLegacyFilename, listDropboxFolder, moveDropboxFile, getSharedLinkRawUrl,
} from './lib/dropboxMusicSync.mjs'

loadEnv()

const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN
if (!DROPBOX_TOKEN) {
  console.error('❌ 缺少 DROPBOX_TOKEN，請在 .env 設定（參考 .env.example）')
  process.exit(1)
}

const supabase = createServiceClient()
const rl = createInterface({ input: process.stdin, output: process.stdout })

function matchPlayer(entry, teamPlayers, allPlayers) {
  // Team-scoped folders: prefer number match, fall back to fuzzy name.
  if (teamPlayers) {
    if (entry.number) {
      const byNumber = teamPlayers.filter(p => String(p.number) === entry.number)
      if (byNumber.length === 1) return byNumber[0]
    }
    const byName = teamPlayers.filter(p => fuzzyNameMatch(p.name, entry.name))
    return byName.length === 1 ? byName[0] : { ambiguous: byName.length > 1 }
  }
  // MLB folder: name-only match across everyone.
  const byName = allPlayers.filter(p => fuzzyNameMatch(p.name, entry.name))
  return byName.length === 1 ? byName[0] : { ambiguous: byName.length > 1 }
}

async function scanFolder(folder, team, teamPlayers, allPlayers, matched, unparsed) {
  let files
  try {
    files = await listDropboxFolder(DROPBOX_TOKEN, `/Music/${folder}`)
  } catch (e) {
    console.error(`⚠ 略過 /Music/${folder}：${e.message}`)
    return
  }

  for (const file of files) {
    const parsed = parseLegacyFilename(file.name)
    if (!parsed.name) { unparsed.push({ path: file.path_lower, reason: '無法解析姓名' }); continue }

    const result = matchPlayer(parsed, teamPlayers, allPlayers)
    if (!result || result.ambiguous !== undefined) {
      unparsed.push({ path: file.path_lower, reason: result?.ambiguous ? '模糊比對到多筆，需手動處理' : '找不到球員' })
      continue
    }

    const player = result
    const kind = parsed.isIntro ? 'intro' : 'song'
    const currentValue = player[kind]
    const targetTeam = team || player.team
    const suffix = kind === 'intro' ? ' - Intro' : ''
    const targetPath = `/Music/Players/${targetTeam} - ${player.name}${suffix}.mp3`

    matched.push({
      fromPath: file.path_lower,
      toPath: targetPath,
      playerId: player.id,
      playerLabel: `${player.name} #${player.number} (${targetTeam})`,
      kind,
      status: currentValue ? 'overwrite' : 'new',
      currentValue: currentValue || '',
      selected: !currentValue,
    })
  }
}

async function main() {
  const { data: allPlayers, error } = await supabase.from('players').select('id, name, number, team, song, intro')
  if (error) throw error

  const matched = []
  const unparsed = []

  for (const [folder, team] of Object.entries(TEAM_FOLDER_MAP)) {
    const teamPlayers = allPlayers.filter(p => p.team === team)
    await scanFolder(folder, team, teamPlayers, allPlayers, matched, unparsed)
  }
  await scanFolder('MLB', null, null, allPlayers, matched, unparsed)

  if (matched.length === 0) {
    console.log('沒有找到可搬移的檔案。')
    if (unparsed.length > 0) {
      console.log(`\n無法處理的檔案（${unparsed.length} 筆）：`)
      unparsed.forEach(u => console.log(`  ${u.path} — ${u.reason}`))
    }
    rl.close()
    return
  }

  console.log(`找到 ${matched.length} 筆可搬移：\n`)
  matched.forEach((m, i) => {
    console.log(`[${i}] ${m.status === 'new' ? '新增' : '覆蓋'}:${m.kind}  ${m.playerLabel}`)
    console.log(`     ${m.fromPath}  ->  ${m.toPath}`)
    if (m.status === 'overwrite') console.log(`     目前值：${m.currentValue}`)
  })

  if (unparsed.length > 0) {
    console.log(`\n無法處理的檔案（${unparsed.length} 筆，不會被搬移）：`)
    unparsed.forEach(u => console.log(`  ${u.path} — ${u.reason}`))
  }

  console.log(`\n預設：新增項目已勾選，覆蓋項目未勾選。`)
  const toggleAnswer = await rl.question('輸入要「切換勾選狀態」的編號（逗號分隔），或直接 Enter 套用預設：')
  if (toggleAnswer.trim()) {
    for (const raw of toggleAnswer.split(',')) {
      const idx = Number(raw.trim())
      if (matched[idx]) matched[idx].selected = !matched[idx].selected
    }
  }

  const confirmAnswer = await rl.question('確認執行以上勾選項目的搬移與寫入？[y/N]：')
  rl.close()
  if (confirmAnswer.trim().toLowerCase() !== 'y') {
    console.log('已取消，未做任何變更。')
    return
  }

  let moved = 0
  let failed = 0
  for (const item of matched.filter(m => m.selected)) {
    try {
      await moveDropboxFile(DROPBOX_TOKEN, item.fromPath, item.toPath)
      const url = await getSharedLinkRawUrl(DROPBOX_TOKEN, item.toPath)
      const { error: updateError } = await supabase.from('players').update({ [item.kind]: url }).eq('id', item.playerId)
      if (updateError) throw updateError
      moved++
    } catch (e) {
      console.error(`❌ ${item.fromPath}: ${e.message}`)
      failed++
    }
  }

  console.log(`\n✅ 完成：成功 ${moved} 筆，失敗 ${failed} 筆，未選取/無法處理 ${matched.length - moved - failed + unparsed.length} 筆`)
}

main().catch(e => {
  console.error('❌', e.message)
  process.exit(1)
})
