import { ref, computed, triggerRef } from 'vue'

export function useGameStats() {
  // 投手統計 { pitcherId: { pitches, hits, strikeouts, walks, runs, earnedRuns } }
  const pitcherStats = ref({})
  
  // 打者統計 { batterId: { atBats, hits, rbis, runs, homeRuns, strikeouts, walks } }
  const batterStats = ref({})

  // 初始化投手統計
  const initPitcherStats = (pitcher) => {
    const id = `${pitcher.name}${pitcher.number}`
    if (!pitcherStats.value[id]) {
      pitcherStats.value[id] = {
        outs: 0,  // 改用出局數來計算局數
        hits: 0,
        strikeouts: 0,
        walks: 0,
        runs: 0,
        earnedRuns: 0
      }
    }
    return pitcherStats.value[id]
  }

  // 初始化打者統計
  const initBatterStats = (batter) => {
    const id = `${batter.name}${batter.number}`
    if (!batterStats.value[id]) {
      batterStats.value[id] = {
        atBats: 0,
        hits: 0,
        rbis: 0,
        runs: 0,
        homeRuns: 0,
        strikeouts: 0,
        walks: 0
      }
    }
    return batterStats.value[id]
  }

  // 獲取投手統計
  const getPitcherStats = (pitcher) => {
    if (!pitcher) return null
    const id = `${pitcher.name}${pitcher.number}`
    return pitcherStats.value[id] || initPitcherStats(pitcher)
  }

  // 獲取打者統計
  const getBatterStats = (batter) => {
    if (!batter) return null
    const id = `${batter.name}${batter.number}`
    return batterStats.value[id] || initBatterStats(batter)
  }

  // 計算投手防禦率
  const calculateERA = (pitcher) => {
    const stats = getPitcherStats(pitcher)
    console.log('calculateERA 被調用:', {
      pitcher: pitcher?.name,
      stats: stats,
      outs: stats?.outs,
      earnedRuns: stats?.earnedRuns,
      runs: stats?.runs
    })
    
    if (!stats) return '0.00'
    
    // 如果有失分但沒有出局數，顯示無窮大的 ERA
    if (stats.earnedRuns > 0 && stats.outs === 0) {
      return '∞'
    }
    
    if (stats.outs === 0) return '0.00'
    
    // 正確計算：每 3 個出局數 = 1 局
    const innings = stats.outs / 3
    const era = (stats.earnedRuns * 9) / innings
    return era.toFixed(2)
  }

  // 計算打者打擊率
  const calculateAVG = (batter) => {
    const stats = getBatterStats(batter)
    if (!stats || stats.atBats === 0) return '.000'
    const avg = stats.hits / stats.atBats
    return avg.toFixed(3)
  }

  // 記錄出局數（用於計算投球局數）
  const recordOutForPitcher = (pitcher) => {
    const stats = initPitcherStats(pitcher)
    stats.outs++
    console.log('recordOutForPitcher 被調用:', {
      pitcher: pitcher?.name,
      outs: stats.outs,
      innings: (stats.outs / 3).toFixed(1)
    })
    triggerRef(pitcherStats)
  }

  // 記錄被安打
  const recordHitAllowed = (pitcher) => {
    const stats = initPitcherStats(pitcher)
    stats.hits++
  }

  // 記錄三振
  const recordStrikeout = (pitcher, batter) => {
    const pStats = initPitcherStats(pitcher)
    const bStats = initBatterStats(batter)
    pStats.strikeouts++
    pStats.outs++  // 三振也是出局
    bStats.strikeouts++
    bStats.atBats++
    triggerRef(pitcherStats)
  }

  // 記錄四壞球
  const recordWalk = (pitcher, batter) => {
    const pStats = initPitcherStats(pitcher)
    const bStats = initBatterStats(batter)
    pStats.walks++
    bStats.walks++
    // 四壞球不算打數
    triggerRef(pitcherStats)
  }

  // 記錄安打
  const recordHit = (pitcher, batter, isHomeRun = false) => {
    const pStats = initPitcherStats(pitcher)
    const bStats = initBatterStats(batter)
    pStats.hits++
    bStats.hits++
    bStats.atBats++
    if (isHomeRun) {
      bStats.homeRuns++
    }
    triggerRef(pitcherStats)
  }

  // 記錄出局（非三振）
  const recordOut = (pitcher, batter) => {
    const pStats = initPitcherStats(pitcher)
    const bStats = initBatterStats(batter)
    pStats.outs++  // 記錄投手的出局數
    bStats.atBats++
    triggerRef(pitcherStats)
  }

  // 記錄失分
  const recordRunsAllowed = (pitcher, runs, earned = true) => {
    const stats = initPitcherStats(pitcher)
    stats.runs += runs
    if (earned) {
      stats.earnedRuns += runs
    }
    console.log('recordRunsAllowed 被調用:', {
      pitcher: pitcher?.name,
      runs,
      earned,
      totalRuns: stats.runs,
      totalEarnedRuns: stats.earnedRuns,
      pitches: stats.pitches
    })
    triggerRef(pitcherStats)
  }

  // 記錄打點
  const recordRBI = (batter, rbis) => {
    const stats = initBatterStats(batter)
    stats.rbis += rbis
  }

  // 記錄得分
  const recordRun = (batter) => {
    const stats = initBatterStats(batter)
    stats.runs++
  }

  // 清空所有統計
  const clearStats = () => {
    pitcherStats.value = {}
    batterStats.value = {}
  }

  return {
    pitcherStats,
    batterStats,
    getPitcherStats,
    getBatterStats,
    calculateERA,
    calculateAVG,
    recordOutForPitcher,
    recordHitAllowed,
    recordStrikeout,
    recordWalk,
    recordHit,
    recordOut,
    recordRunsAllowed,
    recordRBI,
    recordRun,
    clearStats
  }
}
