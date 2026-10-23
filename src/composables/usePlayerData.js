import { ref } from 'vue'
import { supabase } from '../lib/supabase.js'
import { fetchAllPages } from '../lib/fetchAllPages.js'

export function usePlayerData() {
  const roster = ref([])
  const isLoading = ref(true)
  const loadError = ref(false)
  const selectedTeam = ref(null)

  const loadCSVFromURL = async () => {
    isLoading.value = true
    loadError.value = false
    try {
      const data = await fetchAllPages(() => supabase
        .from('players')
        .select('*')
        .order('team')
        .order('id'))

      roster.value = data.map(p => ({
        name: p.name,
        number: p.number,
        team: p.team,
        org: p.org,
        status: p.status,
        rosterMark: p.roster_mark,
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
    loadCSVFromURL
  }
}
