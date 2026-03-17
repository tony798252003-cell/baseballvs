import { parse } from 'node-html-parser'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ehevruywqvpdbzveqxum.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoZXZydXl3cXZwZGJ6dmVxeHVtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzcxNjcxMiwiZXhwIjoyMDg5MjkyNzEyfQ.KoZ4QUoftI0fjHydy8POsyccPZg0-AG8-WQ1HgZ5nug'
const BASE_URL = 'https://www.cpbl.com.tw'

const TEAMS = [
  { code: 'ACN', name: '中信兄弟' },
  { code: 'ADD', name: '統一獅' },
  { code: 'AJL', name: '樂天桃猿' },
  { code: 'AEO', name: '富邦悍將' },
  { code: 'AAA', name: '味全龍' },
  { code: 'AKP', name: '台鋼雄鷹' },
]

// 守位分類對應（球隊頁面的粗分類，用於跳過教練）
const POSITION_CATEGORY_MAP = {
  '投手': 'P',
  '捕手': 'C',
  '內野手': 'IF',
  '外野手': 'OF',
  '指定打擊': 'DH',
  '教練': 'COACH',
}

// 詳細守位中英對照（球員個人頁面的「位置」欄位）
const POSITION_EN_MAP = {
  '投手': 'P',
  '捕手': 'C',
  '一壘手': '1B',
  '二壘手': '2B',
  '三壘手': '3B',
  '游擊手': 'SS',
  '左外野手': 'LF',
  '中外野手': 'CF',
  '右外野手': 'RF',
  '外野手': 'OF',
  '內野手': 'IF',
  '指定打擊': 'DH',
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function fetchTeamPlayers(teamCode, teamName, league = '一軍') {
  const kindCode = league === '二軍' ? 'D' : 'A'
  console.log(`  抓取 ${teamName} ${league}...`)
  const res = await fetch(`${BASE_URL}/team`, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `ClubNo=${teamCode}&KindCode=${kindCode}`
  })
  const html = await res.text()
  const root = parse(html)

  const players = []
  let currentPosition = ''

  // 找所有 cat_title（守位分類）和 PlayerItem（球員）
  // 依序處理每個 TeamPlayersList（投手、捕手、內野手、外野手）
  const sections = root.querySelectorAll('.cat_title, .TeamPlayersList')

  for (const section of sections) {
    if (section.classList.contains('cat_title')) {
      currentPosition = section.text.trim()
      continue
    }

    // 教練用 COACH 標記
    const positionLabel = currentPosition === '教練' ? 'COACH' : (POSITION_CATEGORY_MAP[currentPosition] || currentPosition)

    const isCoach = currentPosition === '教練'
    const items = section.querySelectorAll('.item')
    for (const item of items) {
      // 教練沒有 <a> 連結，球員有
      const nameElWithLink = item.querySelector('.name a')
      const nameElPlain = item.querySelector('.name')
      const nameEl = nameElWithLink || nameElPlain
      const numberEl = item.querySelector('.number')
      const imgEl = item.querySelector('.img a') || item.querySelector('.img span')

      if (!nameEl || !nameEl.text.trim()) continue

      const name = nameEl.text.trim().replace(/^[◎*＊※]+/, '').trim()
      const number = numberEl?.text.trim() || ''
      const acnt = nameElWithLink?.getAttribute('href')?.match(/Acnt=(\d+)/)?.[1] || ''

      // 取得照片 URL
      const style = imgEl?.getAttribute('style') || ''
      const photoMatch = style.match(/url\('([^']+)'\)/)
      const photo = photoMatch ? BASE_URL + photoMatch[1] : ''

      players.push({
        name,
        number,
        team: teamName,
        original_team: teamName,
        photo,
        // song / emoji / intro 不在這裡設定，upsert 時排除這些欄位
        main_position: isCoach ? '' : positionLabel,
        is_coach: isCoach,
        league,
        pitching_hand: '右',
        batting_hand: '右',
        cpbl_acnt: acnt || null,
      })
    }
  }

  console.log(`    ✅ ${players.length} 名球員`)
  return players
}

async function fetchPlayerDetail(acnt) {
  try {
    const res = await fetch(`${BASE_URL}/team/person?Acnt=${acnt}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    })
    const html = await res.text()
    const root = parse(html)

    // 找「投打習慣」欄位
    let pitchingHand = '右'
    let battingHand = '右'
    const dds = root.querySelectorAll('dd')
    for (const dd of dds) {
      const label = dd.querySelector('.label')?.text.trim()
      if (label === '投打習慣') {
        const desc = dd.querySelector('.desc')?.text.trim() || ''
        // 格式：「右投右打」、「左投左打」、「右投兩打」等
        const match = desc.match(/^(右|左|兩)投(右|左|兩)打$/)
        if (match) {
          pitchingHand = match[1]
          battingHand = match[2]
        }
        break
      }
    }

    // 找「位置」（實際守位，如：投手、游擊手、中外野手等）
    let mainPosition = ''
    for (const dd of dds) {
      const label = dd.querySelector('.label')?.text.trim()
      if (label === '位置') {
        mainPosition = dd.querySelector('.desc')?.text.trim() || ''
        break
      }
    }

    // 轉成英文守位
    const mainPositionEn = POSITION_EN_MAP[mainPosition] || mainPosition

    return { pitching_hand: pitchingHand, batting_hand: battingHand, main_position: mainPositionEn }
  } catch {
    return {}
  }
}

async function main() {
  console.log('🏟️  開始從中華職棒官網抓取球員資料...\n')

  let allPlayers = []

  for (const team of TEAMS) {
    const major = await fetchTeamPlayers(team.code, team.name, '一軍')
    allPlayers = allPlayers.concat(major)
    await new Promise(r => setTimeout(r, 800))
    const minor = await fetchTeamPlayers(team.code, team.name, '二軍')
    allPlayers = allPlayers.concat(minor)
    await new Promise(r => setTimeout(r, 800))
  }

  console.log(`\n📊 共抓到 ${allPlayers.length} 名球員`)
  console.log('🔍 抓取各球員詳細資料（投打手）...')

  // 抓投打手資訊（跳過教練，只抓有 acnt 的球員）
  const nonCoaches = allPlayers.filter(p => p.main_position !== 'COACH' && p.cpbl_acnt)
  for (let i = 0; i < nonCoaches.length; i++) {
    const p = nonCoaches[i]
    const detail = await fetchPlayerDetail(p.cpbl_acnt)
    if (detail.pitching_hand) p.pitching_hand = detail.pitching_hand
    if (detail.batting_hand) p.batting_hand = detail.batting_hand
    if (detail.main_position) p.main_position = detail.main_position
    process.stdout.write(`\r  進度：${i + 1}/${nonCoaches.length}`)
    await new Promise(r => setTimeout(r, 300))
  }
  console.log('\n')

  console.log('⬆️  Upsert 到 Supabase（保留舊資料、更新現有球員）...')
  const withAcnt = allPlayers.filter(p => p.cpbl_acnt)
  const coaches = allPlayers.filter(p => !p.cpbl_acnt && p.is_coach)

  // 有 acnt 的球員用 upsert
  if (withAcnt.length > 0) {
    const { error } = await supabase.from('players').upsert(withAcnt, { onConflict: 'cpbl_acnt' })
    if (error) { console.error('❌ upsert 失敗:', error.message); process.exit(1) }
  }

  // 教練沒有 acnt，用姓名+隊伍比對，存在就更新（只更新 photo/number），不存在就新增
  let coachNew = 0, coachUpdated = 0
  for (const coach of coaches) {
    const { data: existing } = await supabase.from('players')
      .select('id').eq('name', coach.name).eq('team', coach.team).single()
    if (existing) {
      await supabase.from('players').update({ photo: coach.photo, number: coach.number, is_coach: true }).eq('id', existing.id)
      coachUpdated++
    } else {
      await supabase.from('players').insert(coach)
      coachNew++
    }
  }

  console.log(`✅ 完成！球員更新 ${withAcnt.length} 筆，教練新增 ${coachNew} 筆、更新 ${coachUpdated} 筆`)

  // 顯示各隊人數統計
  const teamStats = allPlayers.reduce((acc, p) => {
    acc[p.team] = (acc[p.team] || 0) + 1
    return acc
  }, {})
  console.log('\n各隊人數：')
  for (const [team, count] of Object.entries(teamStats)) {
    console.log(`  ${team}: ${count} 人`)
  }
}

main().catch(console.error)
