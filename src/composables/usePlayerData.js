import { ref } from 'vue'
import { supabase } from '../lib/supabase.js'

export function usePlayerData() {
  const roster = ref([])
  const isLoading = ref(true)
  const loadError = ref(false)
  const selectedTeam = ref(null)

  const CPBL_TEAMS = ['樂天桃猿', '統一獅', '富邦悍將', '味全龍', '台鋼雄鷹', '中信兄弟']

  const teamLogos = {
    '樂天桃猿': '/logos/rakuten.png',
    '統一獅': '/logos/lions.png',
    '富邦悍將': '/logos/fubon.png',
    '味全龍': '/logos/dragons.png',
    '台鋼雄鷹': '/logos/hawks.png',
    '中信兄弟': '/logos/brothers.png'
  }

  const normalizeTeamName = (teamName) => {
    return CPBL_TEAMS.includes(teamName) ? teamName : '其他球隊'
  }

  const loadCSVFromURL = async () => {
    isLoading.value = true
    loadError.value = false
    try {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('team')

      if (error) throw error

      roster.value = data.map(p => ({
        name: p.name,
        number: p.number,
        team: p.team,
        originalTeam: p.original_team,
        photo: p.photo,
        song: p.song,
        emoji: p.emoji,
        intro: p.intro,
        eyeMaskPosition: p.eye_mask_position,
        mainPosition: p.main_position,
        otherPositions: p.other_positions,
        pitchingHand: p.pitching_hand,
        battingHand: p.batting_hand,
        league: p.league || '一軍',
        isCoach: p.is_coach || false,
      }))

      isLoading.value = false
    } catch (error) {
      console.error('載入球員資料失敗:', error)
      loadError.value = true
      isLoading.value = false
    }
  }

  return {
    roster,
    isLoading,
    loadError,
    selectedTeam,
    teamLogos,
    CPBL_TEAMS,
    loadCSVFromURL,
    normalizeTeamName
  }
}
