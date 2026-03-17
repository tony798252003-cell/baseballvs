import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ehevruywqvpdbzveqxum.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoZXZydXl3cXZwZGJ6dmVxeHVtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzcxNjcxMiwiZXhwIjoyMDg5MjkyNzEyfQ.KoZ4QUoftI0fjHydy8POsyccPZg0-AG8-WQ1HgZ5nug'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function mlbPhotoUrl(mlbId) {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${mlbId}/headshot/67/current`
}

async function fetchMLBPhoto(mlbId) {
  if (!mlbId) return ''
  try {
    const url = mlbPhotoUrl(mlbId)
    const res = await fetch(url, { method: 'HEAD' })
    if (res.ok) return url
  } catch {}
  return ''
}

// upsertPlayer: 用 name + team 比對；若 oldTeam 有值則先清掉舊隊伍的同名球員再 insert
async function upsertPlayer(player, oldTeam = null) {
  // 若有舊隊伍，先找到並更新 team（避免重複）
  if (oldTeam) {
    const { data: old } = await supabase
      .from('players').select('id').eq('name', player.name).eq('team', oldTeam).single()
    if (old) {
      const { error } = await supabase.from('players').update({
        team: player.team,
        original_team: player.original_team || player.team,
        number: player.number,
        main_position: player.main_position,
        pitching_hand: player.pitching_hand,
        batting_hand: player.batting_hand,
        photo: player.photo || '',
        league: player.league || '一軍',
      }).eq('id', old.id)
      if (error) console.error(`  ❌ 更新 ${player.name} 失敗:`, error.message)
      else console.log(`  🔄 更新 ${player.name} (${oldTeam} → ${player.team})`)
      return
    }
  }

  const { data: existing } = await supabase
    .from('players').select('id, photo').eq('name', player.name).eq('team', player.team).single()

  if (existing) {
    const { error } = await supabase.from('players').update({
      number: player.number,
      main_position: player.main_position,
      pitching_hand: player.pitching_hand,
      batting_hand: player.batting_hand,
      photo: player.photo || existing.photo || '',
      league: player.league || '一軍',
    }).eq('id', existing.id)
    if (error) console.error(`  ❌ 更新 ${player.name} 失敗:`, error.message)
    else console.log(`  ♻️  更新 ${player.name} (${player.team})`)
  } else {
    const { error } = await supabase.from('players').insert({
      name: player.name,
      number: player.number,
      team: player.team,
      original_team: player.original_team || player.team,
      photo: player.photo || '',
      main_position: player.main_position,
      pitching_hand: player.pitching_hand,
      batting_hand: player.batting_hand,
      league: player.league || '一軍',
      is_coach: false,
    })
    if (error) console.error(`  ❌ 新增 ${player.name} 失敗:`, error.message)
    else console.log(`  ✅ 新增 ${player.name} (${player.team})`)
  }
}

// ============================================================
// 日職台灣球員（依 2026 WBC 名單更新後的隊伍）
// ============================================================
const NPB_TAIWAN_PLAYERS = [
  // 古林睿煬：之前寫錯為阪神虎，實際為北海道火腿鬥士
  { name: '古林睿煬', number: '11', team: '北海道火腿鬥士', main_position: 'OF', pitching_hand: '右', batting_hand: '右', oldTeam: '阪神虎' },
  // 孫易磊：之前寫錯為中日龍，實際為北海道火腿鬥士
  { name: '孫易磊',   number: '96', team: '北海道火腿鬥士', main_position: 'P',  pitching_hand: '右', batting_hand: '左', oldTeam: '中日龍' },
  // 徐若熙：之前寫錯為歐力士牛，實際為福岡軟銀鷹
  { name: '徐若熙',   number: '00', team: '福岡軟銀鷹',     main_position: 'P',  pitching_hand: '右', batting_hand: '右', oldTeam: '歐力士牛' },
  // 張峻瑋：新增（福岡軟銀鷹）
  { name: '張峻瑋',   number: '37', team: '福岡軟銀鷹',     main_position: 'P',  pitching_hand: '右', batting_hand: '右' },
  // 林安可：之前寫錯為福岡軟銀鷹，實際為埼玉西武獅；守位也更正（守位為外野）
  { name: '林安可',   number: '77', team: '埼玉西武獅',      main_position: 'OF', pitching_hand: '左', batting_hand: '左', oldTeam: '福岡軟銀鷹' },
  // 林家正：之前寫錯為投手在養樂多，實際為自由球員＋捕手
  { name: '林家正',   number: '27', team: '自由球員',         main_position: 'C',  pitching_hand: '右', batting_hand: '右', oldTeam: '東京養樂多燕子' },
]

// ============================================================
// WBC 中華隊 - 美職/小聯盟球員（不在中職或日職 DB 裡的）
// ============================================================
const WBC_TAIWAN_MLBMINOR = [
  { name: '沙子宸',   number: '92', team: '奧克蘭運動家體系', main_position: 'P', pitching_hand: '右', batting_hand: '右', mlbId: null },
  { name: '林維恩',   number: '42', team: '奧克蘭運動家體系', main_position: 'P', pitching_hand: '左', batting_hand: '左', mlbId: null },
  { name: '莊陳仲敖', number: '48', team: '奧克蘭運動家體系', main_position: 'P', pitching_hand: '右', batting_hand: '右', mlbId: null },
  { name: '陳柏毓',   number: '44', team: '匹茲堡海盜體系',   main_position: 'P', pitching_hand: '右', batting_hand: '左', mlbId: null },
  { name: '林昱珉',   number: '45', team: '亞利桑那響尾蛇體系', main_position: 'P', pitching_hand: '左', batting_hand: '左', mlbId: null },
  { name: '鄭宗哲',   number: '1',  team: '波士頓紅襪體系',   main_position: 'SS', pitching_hand: '右', batting_hand: '左', mlbId: null },
  { name: 'Stuart Fairchild', number: '17', team: '克利夫蘭守護者', main_position: 'OF', pitching_hand: '右', batting_hand: '右', mlbId: 663821 },
]

// ============================================================
// WBC 日本隊（保持原本清單）
// ============================================================
const WBC_JAPAN_PLAYERS = [
  { name: '山本由伸',   number: '18', team: 'LA道奇',          main_position: 'P',  pitching_hand: '右', batting_hand: '右', mlbId: 683003 },
  { name: '佐佐木朗希', number: '17', team: '德州遊騎兵',      main_position: 'P',  pitching_hand: '右', batting_hand: '右', mlbId: 673524 },
  { name: '今永昇太',   number: '21', team: '芝加哥小熊',      main_position: 'P',  pitching_hand: '左', batting_hand: '左', mlbId: 680776 },
  { name: '千賀滉大',   number: '92', team: '紐約大都會',      main_position: 'P',  pitching_hand: '右', batting_hand: '右', mlbId: 677651 },
  { name: '平良海馬',   number: '34', team: '紐約洋基',        main_position: 'P',  pitching_hand: '右', batting_hand: '右', mlbId: 681911 },
  { name: '藤浪晋太郎', number: '11', team: '讀賣巨人',        main_position: 'P',  pitching_hand: '右', batting_hand: '右' },
  { name: '栗林良吏',   number: '15', team: '廣島東洋鯉魚',    main_position: 'P',  pitching_hand: '右', batting_hand: '右' },
  { name: '湯淺京己',   number: '26', team: '阪神虎',          main_position: 'P',  pitching_hand: '右', batting_hand: '右' },
  { name: '鈴木博志',   number: '19', team: '中日龍',          main_position: 'P',  pitching_hand: '右', batting_hand: '右' },
  { name: '宮城大彌',   number: '13', team: '歐力士牛',        main_position: 'P',  pitching_hand: '左', batting_hand: '右' },
  { name: '中村悠平',   number: '27', team: '東京養樂多燕子',  main_position: 'C',  pitching_hand: '右', batting_hand: '右' },
  { name: '會澤翼',     number: '37', team: '廣島東洋鯉魚',    main_position: 'C',  pitching_hand: '右', batting_hand: '右' },
  { name: '大谷翔平',   number: '17', team: 'LA道奇',          main_position: 'DH', pitching_hand: '右', batting_hand: '左', mlbId: 660271 },
  { name: '源田壮亮',   number: '6',  team: '西武獅',          main_position: 'SS', pitching_hand: '右', batting_hand: '左' },
  { name: '坂本勇人',   number: '6',  team: '讀賣巨人',        main_position: 'SS', pitching_hand: '右', batting_hand: '右' },
  { name: '菊池涼介',   number: '33', team: '廣島東洋鯉魚',    main_position: '2B', pitching_hand: '右', batting_hand: '右' },
  { name: '牧秀悟',     number: '2',  team: '橫濱DeNA海灣星',  main_position: '2B', pitching_hand: '右', batting_hand: '右' },
  { name: '岡本和真',   number: '25', team: '讀賣巨人',        main_position: '3B', pitching_hand: '右', batting_hand: '右' },
  { name: '佐藤輝明',   number: '8',  team: '阪神虎',          main_position: '3B', pitching_hand: '右', batting_hand: '右' },
  { name: '山田哲人',   number: '23', team: '東京養樂多燕子',  main_position: '2B', pitching_hand: '右', batting_hand: '右' },
  { name: '鈴木誠也',   number: '51', team: '芝加哥小熊',      main_position: 'RF', pitching_hand: '右', batting_hand: '右', mlbId: 673548 },
  { name: '吉田正尚',   number: '7',  team: '波士頓紅襪',      main_position: 'LF', pitching_hand: '右', batting_hand: '左', mlbId: 673237 },
  { name: '近藤健介',   number: '5',  team: '福岡軟銀鷹',      main_position: 'LF', pitching_hand: '右', batting_hand: '左' },
  { name: '万波中正',   number: '32', team: '北海道火腿鬥士',  main_position: 'OF', pitching_hand: '右', batting_hand: '右' },
]

async function main() {
  // ── 日職台灣球員（含更正） ────────────────────────────────
  console.log('\n🇹🇼  日職台灣球員（更正＋新增）...')
  for (const p of NPB_TAIWAN_PLAYERS) {
    const { oldTeam, ...player } = p
    await upsertPlayer({ ...player, original_team: player.team, league: '一軍', photo: '' }, oldTeam)
  }

  // ── WBC 台灣隊美職/小聯盟球員 ────────────────────────────
  console.log('\n🇹🇼  WBC 中華隊美職/小聯盟球員...')
  for (const p of WBC_TAIWAN_MLBMINOR) {
    let photo = ''
    if (p.mlbId) photo = await fetchMLBPhoto(p.mlbId)
    const { mlbId, ...player } = p
    await upsertPlayer({ ...player, original_team: player.team, league: '一軍', photo })
    await new Promise(r => setTimeout(r, 150))
  }

  // ── WBC 日本隊（更新照片） ────────────────────────────────
  console.log('\n🇯🇵  WBC 日本隊球員（更新照片）...')
  for (const p of WBC_JAPAN_PLAYERS) {
    let photo = ''
    if (p.mlbId) photo = await fetchMLBPhoto(p.mlbId)
    const { mlbId, ...player } = p
    await upsertPlayer({ ...player, original_team: player.team, league: '一軍', photo })
    await new Promise(r => setTimeout(r, 150))
  }

  console.log('\n🎉 完成！')
}

main().catch(console.error)
