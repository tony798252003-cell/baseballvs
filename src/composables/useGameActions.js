import { ref } from 'vue'

export function useGameActions(gameState, playerData, speech, audio) {
  const isPlayingResultSpeech = ref(false)

  // 下一棒
  const nextBatter = () => {
    gameState.currentBatterIndex.value = (gameState.currentBatterIndex.value + 1) % gameState.lineup.value.length
  }

  // 處理三出局的共用邏輯
  const handleThreeOuts = () => {
    if (gameState.gameType.value === 'versus') {
      // 保存當前隊伍的打者索引
      if (gameState.isTop.value) {
        gameState.awayTeam.value.batterIndex = gameState.currentBatterIndex.value
        console.log('一局上結束，保存客隊索引:', gameState.currentBatterIndex.value)
      } else {
        gameState.homeTeam.value.batterIndex = gameState.currentBatterIndex.value
        console.log('一局下結束，保存主隊索引:', gameState.currentBatterIndex.value)
      }
      
      // 切換攻守
      const wasTop = gameState.isTop.value
      gameState.isTop.value = !gameState.isTop.value
      
      console.log('切換攻守:', wasTop ? '上半→下半' : '下半→上半', 'isTop:', gameState.isTop.value)
      
      showToast(wasTop ? "三人出局！攻守交換 - 換主隊進攻" : "三人出局！攻守交換 - 換客隊進攻", 'alert')
      
      // 如果下半局結束，進入下一局
      if (!wasTop) {
        gameState.inning.value++
        console.log('進入下一局:', gameState.inning.value)
        // 檢查是否已經打完9局
        if (gameState.inning.value > 9) {
          showToast(`比賽結束！最終比分 客隊 ${gameState.score.away} : ${gameState.score.home} 主隊`, 'alert')
          gameState.mode.value = 'menu'
          return
        }
        // 進入新局時，初始化該局得分為0
        const newInning = gameState.inning.value - 1
        if (newInning < 9 && gameState.inningScores.value.away[newInning] === undefined) {
          gameState.inningScores.value.away[newInning] = 0
          gameState.inningScores.value.home[newInning] = 0
        }
      }
      
      // 切換打線和投手，並恢復該隊的打者索引
      if (gameState.isTop.value) {
        // 客隊進攻，主隊投手
        console.log('切換到客隊進攻，客隊打線:', gameState.awayTeam.value.lineup.map(p => p.name))
        gameState.lineup.value = [...gameState.awayTeam.value.lineup]
        gameState.selectedPitcher.value = gameState.homeTeam.value.pitcher
        gameState.currentBatterIndex.value = gameState.awayTeam.value.batterIndex
        console.log('恢復客隊打者索引:', gameState.currentBatterIndex.value)
        console.log('lineup 更新後:', gameState.lineup.value.map(p => p.name))
      } else {
        // 主隊進攻，客隊投手
        console.log('切換到主隊進攻，主隊打線:', gameState.homeTeam.value.lineup.map(p => p.name))
        gameState.lineup.value = [...gameState.homeTeam.value.lineup]
        gameState.selectedPitcher.value = gameState.awayTeam.value.pitcher
        gameState.currentBatterIndex.value = gameState.homeTeam.value.batterIndex
        console.log('恢復主隊打者索引:', gameState.currentBatterIndex.value)
        console.log('lineup 更新後:', gameState.lineup.value.map(p => p.name))
      }
      
      // 重置出局數和壘包
      gameState.outs.value = 0
      gameState.runners.value = [false, false, false]
      gameState.runnerPhotos.value = ['', '', '']
      
      console.log('切換後 currentPlayer:', gameState.currentPlayer.value?.name, 'lineup:', gameState.lineup.value.map(p => p.name))
      
      // 如果是一局下半開始且需要主隊介紹
      if (gameState.inning.value === 1 && !gameState.isTop.value && gameState.needHomeTeamIntro.value) {
        console.log('需要播放主隊介紹')
        gameState.needHomeTeamIntro.value = false
        gameState.showLineupIntro.value = true
        gameState.introIndex.value = 0
        // 這裡需要調用 playLineupIntro，但它在 App.vue 中
        // TODO: 將 playLineupIntro 也移到 composable
        return
      }
      
      // 播放新打者的介紹語音和音樂
      console.log('播放新打者語音和音樂:', gameState.currentPlayer.value?.name)
      if (gameState.currentPlayer.value && !gameState.isMuted.value) {
        setTimeout(() => {
          speech.speakBatterName(gameState.currentPlayer.value.name, gameState.currentBatterIndex.value)
        }, 500)
        
        // 然後播放音樂
        setTimeout(() => {
          audio.playBatterMusic(gameState.currentPlayer.value)
        }, 4000)
      }
    } else {
      // 單人模式
      showToast("三人出局！清除壘包", 'alert')
      gameState.inning.value++
      // 檢查是否已經打完9局
      if (gameState.inning.value > 9) {
        showToast(`比賽結束！最終得分 ${gameState.score.home} 分`, 'alert')
        gameState.mode.value = 'menu'
        return
      }
      // 進入新局時，初始化該局得分為0
      const newInning = gameState.inning.value - 1
      if (newInning < 9 && gameState.inningScores.value.away[newInning] === undefined) {
        gameState.inningScores.value.away[newInning] = 0
      }
      gameState.outs.value = 0
      gameState.runners.value = [false, false, false]
      gameState.runnerPhotos.value = ['', '', '']
      nextBatter()
    }
  }

  // 加分
  const addScore = (runs) => {
    if (runs === 0) return
    
    if (gameState.gameType.value === 'versus') {
      if (gameState.isTop.value) {
        gameState.score.away += runs
        const currentInning = gameState.inning.value - 1
        if (currentInning >= 0 && currentInning < 9) {
          if (gameState.inningScores.value.away[currentInning] === undefined) {
            gameState.inningScores.value.away[currentInning] = 0
          }
          gameState.inningScores.value.away[currentInning] += runs
        }
      } else {
        gameState.score.home += runs
        const currentInning = gameState.inning.value - 1
        if (currentInning >= 0 && currentInning < 9) {
          if (gameState.inningScores.value.home[currentInning] === undefined) {
            gameState.inningScores.value.home[currentInning] = 0
          }
          gameState.inningScores.value.home[currentInning] += runs
        }
      }
    } else {
      gameState.score.home += runs
      const currentInning = gameState.inning.value - 1
      if (currentInning >= 0 && currentInning < 9) {
        if (gameState.inningScores.value.home[currentInning] === undefined) {
          gameState.inningScores.value.home[currentInning] = 0
        }
        gameState.inningScores.value.home[currentInning] += runs
      }
    }
  }

  // 處理安打
  const handleHit = (bases) => {
    // 停止音樂
    audio.stopMusic()
    
    // 播放安打音效
    if (!gameState.isMuted.value) {
      const hitSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAAB4eXp7fH1+f4CAgYKDhIWGh4iJiomKiYiHhoWEg4KBgH9+fXx7enl4d3Z1dHNycXBvbm1sa2ppZ2ZlZGNiYWBfXl1cW1pZWFdWVVRTUlFQT05NTEtKSUhHRkVEQ0JBQD8+PTw7Ojk4NzY1NDMyMTAvLi0sKyopKCcmJSQjIiEgHx4dHBsaGRgXFhUUExIREA8ODQwLCgkIBwYFBAMCAQA=')
      hitSound.volume = 0.5
      hitSound.play().catch(() => {})
    }
    
    // 播放語音
    if (!gameState.isMuted.value && 'speechSynthesis' in window) {
      isPlayingResultSpeech.value = true
      window.speechSynthesis.cancel()
      
      const hitText = bases === 1 ? '一壘安打' : bases === 2 ? '二壘安打' : bases === 3 ? '三壘安打' : '全壘打'
      const utterance = new SpeechSynthesisUtterance(speech.processSpeechText(hitText))
      utterance.lang = 'zh-TW'
      utterance.rate = 0.9
      utterance.pitch = 1.0
      utterance.volume = 1.0
      
      utterance.onend = () => {
        isPlayingResultSpeech.value = false
      }
      
      setTimeout(() => {
        window.speechSynthesis.speak(utterance)
      }, 100)
    }
    
    let runs = 0
    const newRunners = [...gameState.runners.value]
    const newRunnerPhotos = [...gameState.runnerPhotos.value]
    
    if (bases === 4) {
      // 全壘打
      runs = 1 + newRunners.filter(r => r).length
      newRunners.fill(false)
      newRunnerPhotos.fill('')
    } else {
      // 處理壘包推進
      for (let i = 2; i >= 0; i--) {
        if (newRunners[i]) {
          const newBase = i + bases
          if (newBase >= 3) {
            runs++
          } else {
            newRunners[newBase] = true
            newRunnerPhotos[newBase] = newRunnerPhotos[i]
          }
          newRunners[i] = false
          newRunnerPhotos[i] = ''
        }
      }
      newRunners[bases - 1] = true
      newRunnerPhotos[bases - 1] = gameState.currentPlayer.value?.photo || ''
    }
    
    gameState.runners.value = newRunners
    gameState.runnerPhotos.value = newRunnerPhotos
    gameState.balls.value = 0
    gameState.strikes.value = 0
    
    addScore(runs)
    nextBatter()
  }

  // 處理保送
  const handleWalk = () => {
    audio.stopMusic()
    
    if (!gameState.isMuted.value && 'speechSynthesis' in window) {
      isPlayingResultSpeech.value = true
      window.speechSynthesis.cancel()
      
      const utterance = new SpeechSynthesisUtterance(speech.processSpeechText('保送'))
      utterance.lang = 'zh-TW'
      utterance.rate = 0.9
      utterance.pitch = 1.0
      utterance.volume = 1.0
      
      utterance.onend = () => {
        isPlayingResultSpeech.value = false
      }
      
      setTimeout(() => {
        window.speechSynthesis.speak(utterance)
      }, 100)
    }
    
    const newRunners = [...gameState.runners.value]
    const newRunnerPhotos = [...gameState.runnerPhotos.value]
    let runs = 0
    
    if (newRunners[0]) {
      if (newRunners[1]) {
        if (newRunners[2]) {
          runs = 1
        } else {
          newRunners[2] = true
          newRunnerPhotos[2] = newRunnerPhotos[1]
        }
      }
      newRunners[1] = true
      newRunnerPhotos[1] = newRunnerPhotos[0]
    }
    newRunners[0] = true
    newRunnerPhotos[0] = gameState.currentPlayer.value?.photo || ''
    
    gameState.runners.value = newRunners
    gameState.runnerPhotos.value = newRunnerPhotos
    gameState.balls.value = 0
    gameState.strikes.value = 0
    
    addScore(runs)
    nextBatter()
  }

  // 處理觸身球
  const handleHBP = () => {
    handleWalk()
  }

  // 三振
  const handleStrikeout = () => {
    audio.stopMusic()
    
    if (!gameState.isMuted.value) {
      const outSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAAB4cnJzdHZ4eXp7fH1+f4CAgIGAgH9+fXx7enl4d3Z1dHNycXBvbm1sa2poZ2ZlZGNiYWBfXl1cW1pZWFdWVVRTUlFQT05NTEtKSUhHRkVEQ0JBQD8+PTw7Ojk4NzY1NDMyMTAvLi0sKyopKCcmJSQjIiEgHx4dHBsaGRgXFhUUExIREA8ODQwLCgkIBwYFBAMCAQAAAgQGCAoMDg8REx')
      outSound.volume = 0.3
      outSound.play().catch(() => {})
    }
    
    if (!gameState.isMuted.value && 'speechSynthesis' in window) {
      isPlayingResultSpeech.value = true
      window.speechSynthesis.cancel()
      
      const utterance = new SpeechSynthesisUtterance(speech.processSpeechText('打者三振出局'))
      utterance.lang = 'zh-TW'
      utterance.rate = 0.9
      utterance.pitch = 1.0
      utterance.volume = 1.0
      
      utterance.onend = () => {
        isPlayingResultSpeech.value = false
      }
      
      setTimeout(() => {
        window.speechSynthesis.speak(utterance)
      }, 100)
    }
    
    const newOuts = gameState.outs.value + 1
    gameState.balls.value = 0
    gameState.strikes.value = 0

    if (newOuts >= 3) {
      handleThreeOuts()
    } else {
      gameState.outs.value = newOuts
      showToast("三振出局！")
      nextBatter()
    }
  }

  // 出局
  const handleOut = () => {
    audio.stopMusic()
    
    if (!gameState.isMuted.value) {
      const outSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAAB4cnJzdHZ4eXp7fH1+f4CAgIGAgH9+fXx7enl4d3Z1dHNycXBvbm1sa2poZ2ZlZGNiYWBfXl1cW1pZWFdWVVRTUlFQT05NTEtKSUhHRkVEQ0JBQD8+PTw7Ojk4NzY1NDMyMTAvLi0sKyopKCcmJSQjIiEgHx4dHBsaGRgXFhUUExIREA8ODQwLCgkIBwYFBAMCAQAAAgQGCAoMDg8REx')
      outSound.volume = 0.3
      outSound.play().catch(() => {})
    }
    
    if (!gameState.isMuted.value && 'speechSynthesis' in window) {
      isPlayingResultSpeech.value = true
      window.speechSynthesis.cancel()
      
      const utterance = new SpeechSynthesisUtterance(speech.processSpeechText('打者出局'))
      utterance.lang = 'zh-TW'
      utterance.rate = 0.9
      utterance.pitch = 1.0
      utterance.volume = 1.0
      
      utterance.onend = () => {
        isPlayingResultSpeech.value = false
      }
      
      setTimeout(() => {
        window.speechSynthesis.speak(utterance)
      }, 100)
    }
    
    const newOuts = gameState.outs.value + 1
    gameState.balls.value = 0
    gameState.strikes.value = 0

    if (newOuts >= 3) {
      handleThreeOuts()
    } else {
      gameState.outs.value = newOuts
      showToast("出局！")
      nextBatter()
    }
  }

  // 顯示通知（需要從外部傳入或在這裡實現）
  const showToast = (text, type = 'info') => {
    gameState.notification.value = { text, type }
    setTimeout(() => {
      gameState.notification.value = null
    }, 2000)
  }

  return {
    isPlayingResultSpeech,
    nextBatter,
    handleThreeOuts,
    addScore,
    handleHit,
    handleWalk,
    handleHBP,
    handleStrikeout,
    handleOut,
    showToast
  }
}
