import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ehevruywqvpdbzveqxum.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoZXZydXl3cXZwZGJ6dmVxeHVtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzcxNjcxMiwiZXhwIjoyMDg5MjkyNzEyfQ.KoZ4QUoftI0fjHydy8POsyccPZg0-AG8-WQ1HgZ5nug'
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQxWiFy6zh81UBv2yO1mwLCbPDMrm_3Iw77q9LrPbmb4C5roLCR3simgX-NLTgYPgUvqMv1nflJ8V-9/pub?gid=112417298&single=true&output=csv'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes
    } else if (line[i] === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += line[i]
    }
  }
  result.push(current.trim())
  return result
}

async function main() {
  console.log('📥 從 Google Sheet 取得音樂資料...')
  const res = await fetch(CSV_URL)
  const text = await res.text()
  const lines = text.trim().split('\n').slice(1)

  // 只取有 song 的球員
  const songsMap = {}
  for (const line of lines) {
    const v = parseCSVLine(line)
    const name = v[0]?.trim()
    const number = v[1]?.trim()
    const song = v[4]?.trim()
    const emoji = v[5]?.trim()
    const intro = v[6]?.trim()
    if (name && (song || emoji || intro)) {
      songsMap[`${name}-${number}`] = { song, emoji, intro }
    }
  }

  console.log(`✅ 找到 ${Object.keys(songsMap).length} 筆有音樂/Emoji/Intro 的球員`)

  // 從 Supabase 取所有球員
  const { data: players } = await supabase.from('players').select('id, name, number')

  let updated = 0
  for (const player of players) {
    const key = `${player.name}-${player.number}`
    const extra = songsMap[key]
    if (!extra) continue

    const update = {}
    if (extra.song) update.song = extra.song
    if (extra.emoji) update.emoji = extra.emoji
    if (extra.intro) update.intro = extra.intro

    if (Object.keys(update).length > 0) {
      await supabase.from('players').update(update).eq('id', player.id)
      updated++
    }
  }

  console.log(`✅ 已補回 ${updated} 筆球員的音樂/Emoji/Intro 資料`)
}

main().catch(console.error)
