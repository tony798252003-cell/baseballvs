import { ref, computed } from 'vue'
import { TEXTS } from '../constants/texts'

export function useInningManager(gameState, showToast) {
  const {
    gameType, isTop, inning, lineup, selectedPitcher, awayTeam, homeTeam,
    currentBatterIndex, outs, runners, runnerPhotos, inningScores, score, mode
  } = gameState

  // 切換團隊（上下半局切換時使用）
  const switchTeam = () => {
    if (isTop.value) {
      // 切換到客隊進攻，主隊投手
      console.log('切換到客隊進攻，客隊打線:', awayTeam.value.lineup.map(p => p.name))
      lineup.value = [...awayTeam.value.lineup]
      selectedPitcher.value = homeTeam.value.pitcher
      currentBatterIndex.value = awayTeam.value.batterIndex
      console.log('恢復客隊打者索引:', currentBatterIndex.value)
    } else {
      // 切換到主隊進攻，客隊投手
      console.log('切換到主隊進攻，主隊打線:', homeTeam.value.lineup.map(p => p.name))
      lineup.value = [...homeTeam.value.lineup]
      selectedPitcher.value = awayTeam.value.pitcher
      currentBatterIndex.value = homeTeam.value.batterIndex
      console.log('恢復主隊打者索引:', currentBatterIndex.value)
    }
    console.log('lineup 更新後:', lineup.value.map(p => p.name))
  }

  // 重置場上狀態（出局數和壘包）
  const resetFieldState = () => {
    outs.value = 0
    runners.value = [false, false, false]
    runnerPhotos.value = ['', '', '']
  }

  // 初始化局得分
  const initializeInningScore = (inningNumber) => {
    const inningIndex = inningNumber - 1
    if (inningIndex < 9 && inningScores.value.away[inningIndex] === undefined) {
      inningScores.value.away[inningIndex] = 0
      inningScores.value.home[inningIndex] = 0
    }
  }

  // 檢查遊戲是否結束（9局以上）
  const checkGameEnd = () => {
    if (inning.value > 9) {
      if (gameType.value === 'versus') {
        showToast(TEXTS.game.gameOver(score.away, score.home), TEXTS.toast.alert)
      } else {
        showToast(TEXTS.game.gameOverSingle(score.away), TEXTS.toast.alert)
      }
      mode.value = 'menu'
      return true
    }
    return false
  }

  // 處理三出局（versus mode）
  const handleThreeOutsVersus = (callbacks) => {
    const { playLineupIntro, speakBatterName, playBatterMusic, currentPlayer, showLineupIntro, introIndex, needHomeTeamIntro, isMuted, audioRef, teamChants } = callbacks

    // 保存當前隊伍的下一個打者索引（三出局那個打者打完了，下次從下一棒開始）
    const nextBatterIndex = (currentBatterIndex.value + 1) % lineup.value.length
    if (isTop.value) {
      awayTeam.value.batterIndex = nextBatterIndex
      console.log('一局上結束，保存客隊下一棒索引:', nextBatterIndex)
    } else {
      homeTeam.value.batterIndex = nextBatterIndex
      console.log('一局下結束，保存主隊下一棒索引:', nextBatterIndex)
    }

    // 切換攻守
    const wasTop = isTop.value
    isTop.value = !isTop.value
    console.log('切換攻守:', wasTop ? '上半→下半' : '下半→上半', 'isTop:', isTop.value)

    showToast(TEXTS.game.threeOutsSwitch(wasTop), TEXTS.toast.alert)

    // 如果是下半局結束，進入下一局
    if (!wasTop) {
      inning.value++
      console.log('進入下一局:', inning.value)
      
      // 檢查遊戲是否結束
      if (checkGameEnd()) return

      // 初始化新局得分
      initializeInningScore(inning.value)
    }

    // 切換打線和投手
    switchTeam()

    // 重置場上狀態
    resetFieldState()

    console.log('切換後 currentPlayer:', currentPlayer.value?.name, 'lineup:', lineup.value.map(p => p.name))

    // 如果是一局下半開始且需要主隊介紹
    if (inning.value === 1 && !isTop.value && needHomeTeamIntro.value) {
      console.log('需要播放主隊介紹')
      needHomeTeamIntro.value = false
      showLineupIntro.value = true
      introIndex.value = 0
      playLineupIntro()
      return
    }

    // 播放新打者的介紹語音和音樂
    console.log('播放新打者語音和音樂:', currentPlayer.value?.name)
    if (currentPlayer.value && !isMuted.value) {
      setTimeout(() => {
        speakBatterName(currentPlayer.value.name, currentBatterIndex.value)
      }, 500)

      if (audioRef.value) {
        setTimeout(() => {
          playBatterMusic(currentPlayer.value, teamChants?.value || [])
        }, 4000)
      }
    }
  }

  // 處理三出局（single mode）
  const handleThreeOutsSingle = (nextBatter) => {
    showToast(TEXTS.game.threeOuts, TEXTS.toast.alert)
    inning.value++

    // 檢查遊戲是否結束
    if (checkGameEnd()) return

    // 初始化新局得分
    initializeInningScore(inning.value)

    // 重置場上狀態
    resetFieldState()
    nextBatter()
  }

  return {
    switchTeam,
    resetFieldState,
    initializeInningScore,
    checkGameEnd,
    handleThreeOutsVersus,
    handleThreeOutsSingle
  }
}
