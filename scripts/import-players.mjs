import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ehevruywqvpdbzveqxum.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoZXZydXl3cXZwZGJ6dmVxeHVtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzcxNjcxMiwiZXhwIjoyMDg5MjkyNzEyfQ.KoZ4QUoftI0fjHydy8POsyccPZg0-AG8-WQ1HgZ5nug'
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQxWiFy6zh81UBv2yO1mwLCbPDMrm_3Iw77q9LrPbmb4C5roLCR3simgX-NLTgYPgUvqMv1nflJ8V-9/pub?gid=112417298&single=true&output=csv'

const CPBL_TEAMS = ['樂天桃猿', '統一獅', '富邦悍將', '味全龍', '台鋼雄鷹', '中信兄弟']
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
  console.log('📥 取得 CSV 資料...')
  const res = await fetch(CSV_URL)
  const text = await res.text()
  const lines = text.trim().split('\n')
  console.log(`✅ 共 ${lines.length - 1} 筆原始資料`)

  const players = lines.slice(1).map(line => {
    const v = parseCSVLine(line)
    const originalTeam = v[2] || '自由球員'
    return {
      name: v[0] || '未命名',
      number: v[1] || '00',
      team: CPBL_TEAMS.includes(originalTeam) ? originalTeam : '其他球隊',
      original_team: originalTeam,
      photo: v[3] || '',
      song: v[4] || '',
      emoji: v[5] || '',
      intro: v[6] || '',
      eye_mask_position: v[7] || '',
      main_position: v[8] || '',
      other_positions: v[9] || '',
      pitching_hand: v[10] || '右',
      batting_hand: v[11] || '右',
    }
  }).filter(p => p.name && p.name !== '未命名')

  console.log(`📊 有效球員：${players.length} 人`)
  console.log('⬆️  匯入 Supabase...')

  const { error } = await supabase.from('players').insert(players)

  if (error) {
    console.error('❌ 匯入失敗:', error.message)
    process.exit(1)
  }

  console.log(`✅ 成功匯入 ${players.length} 筆球員資料！`)
}

main().catch(console.error)
