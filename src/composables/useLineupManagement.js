import { ref, computed } from 'vue'

// 陣容管理 composable
export function useLineupManagement() {
  const replacingIndex = ref(-1)
  
  // 添加球員到打序
  const addToLineup = (player, currentLineup, showToast, showPitcherSelect, currentPitcher) => {
    // 如果在更換模式，執行更換
    if (replacingIndex.value !== -1) {
      const oldPlayer = currentLineup.value[replacingIndex.value]
      const newLineup = [...currentLineup.value]
      newLineup[replacingIndex.value] = player
      currentLineup.value = newLineup
      showToast(`已替換第${replacingIndex.value + 1}棒：${oldPlayer.name} → ${player.name}`, 'success')
      replacingIndex.value = -1
      return
    }
    
    // 正常添加模式
    if (currentLineup.value.includes(player)) return
    if (currentLineup.value.length >= 9) {
      showToast('打序已滿（最多9人）', 'alert')
      return
    }
    currentLineup.value = [...currentLineup.value, player]
    
    // 當選滿9人時，自動彈出投手選擇對話框
    if (currentLineup.value.length === 9 && !currentPitcher.value) {
      setTimeout(() => {
        showPitcherSelect.value = true
      }, 300)
    }
  }
  
  // 從打序中移除球員
  const removeFromLineup = (index, currentLineup) => {
    const newLineup = [...currentLineup.value]
    newLineup.splice(index, 1)
    currentLineup.value = newLineup
  }
  
  // 點擊已選球員進行更換
  const replaceLineupPlayer = (index, showToast) => {
    replacingIndex.value = index
    showToast(`請從左側選擇球員替換第${index + 1}棒`, 'info')
    
    // 5秒後自動取消替換模式
    setTimeout(() => {
      if (replacingIndex.value === index) {
        replacingIndex.value = -1
      }
    }, 5000)
  }
  
  // 清空當前打序
  const clearLineup = (currentLineup, currentPitcher) => {
    currentLineup.value = []
    currentPitcher.value = null
    replacingIndex.value = -1
  }
  
  // 隨機選擇球員
  const randomSelectLineup = (batters, pitchers, currentLineup, currentPitcher, showToast) => {
    clearLineup(currentLineup, currentPitcher)
    
    // 從所有打者中隨機選擇9名
    const availableBatters = [...batters.value]
    const shuffled = availableBatters.sort(() => Math.random() - 0.5)
    
    const newLineup = []
    for (let i = 0; i < 9 && i < shuffled.length; i++) {
      newLineup.push(shuffled[i])
    }
    currentLineup.value = newLineup
    
    // 隨機選擇一個投手
    const availablePitchers = [...pitchers.value]
    if (availablePitchers.length > 0) {
      const randomPitcher = availablePitchers[Math.floor(Math.random() * availablePitchers.length)]
      currentPitcher.value = randomPitcher
    }
    
    showToast('已隨機選擇球員！', 'success')
  }
  
  // 確認客隊設定，切換到主隊選擇
  const confirmAwayTeam = (currentLineup, currentPitcher, isSelectingAwayTeam, selectedTeam, showToast) => {
    if (currentLineup.value.length < 9 || !currentPitcher.value) {
      showToast('請選擇完整的9位打者和1位投手', 'alert')
      return
    }
    isSelectingAwayTeam.value = false
    replacingIndex.value = -1
    selectedTeam.value = null
    showToast('客隊設定完成！請選擇主隊', 'success')
  }
  
  // 返回客隊設定
  const backToAwayTeam = (isSelectingAwayTeam, selectedTeam) => {
    isSelectingAwayTeam.value = true
    replacingIndex.value = -1
    selectedTeam.value = null
  }
  
  return {
    replacingIndex,
    addToLineup,
    removeFromLineup,
    replaceLineupPlayer,
    clearLineup,
    randomSelectLineup,
    confirmAwayTeam,
    backToAwayTeam
  }
}
