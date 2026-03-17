// 遊戲邏輯輔助函數

// 處理跑壘邏輯
export function processRunners(runners, runnerPhotos, bases, currentPlayerPhoto) {
  const newRunners = [...runners]
  const newRunnerPhotos = [...runnerPhotos]
  let runs = 0
  
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
    newRunnerPhotos[bases - 1] = currentPlayerPhoto || ''
  }
  
  return { runners: newRunners, runnerPhotos: newRunnerPhotos, runs }
}

// 處理保送跑壘邏輯
export function processWalk(runners, runnerPhotos, currentPlayerPhoto) {
  const newRunners = [...runners]
  const newRunnerPhotos = [...runnerPhotos]
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
  newRunnerPhotos[0] = currentPlayerPhoto || ''
  
  return { runners: newRunners, runnerPhotos: newRunnerPhotos, runs }
}

// 播放出局音效
export function playOutSound(isMuted) {
  if (!isMuted) {
    const outSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAAB4cnJzdHZ4eXp7fH1+f4CAgIGAgH9+fXx7enl4d3Z1dHNycXBvbm1sa2poZ2ZlZGNiYWBfXl1cW1pZWFdWVVRTUlFQT05NTEtKSUhHRkVEQ0JBQD8+PTw7Ojk4NzY1NDMyMTAvLi0sKyopKCcmJSQjIiEgHx4dHBsaGRgXFhUUExIREA8ODQwLCgkIBwYFBAMCAQAAAgQGCAoMDg8REx')
    outSound.volume = 0.3
    outSound.play().catch(() => {})
  }
}

// 播放安打音效
export function playHitSound(isMuted) {
  if (!isMuted) {
    const hitSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAAB4eXp7fH1+f4CAgYKDhIWGh4iJiomKiYiHhoWEg4KBgH9+fXx7enl4d3Z1dHNycXBvbm1sa2ppZ2ZlZGNiYWBfXl1cW1pZWFdWVVRTUlFQT05NTEtKSUhHRkVEQ0JBQD8+PTw7Ojk4NzY1NDMyMTAvLi0sKyopKCcmJSQjIiEgHx4dHBsaGRgXFhUUExIREA8ODQwLCgkIBwYFBAMCAQA=')
    hitSound.volume = 0.5
    hitSound.play().catch(() => {})
  }
}

// 文字轉語音
export function speak(text, processSpeechText, isMuted, onEnd) {
  if (isMuted || !('speechSynthesis' in window)) {
    // 如果靜音或不支持語音，直接調用回調
    if (onEnd) onEnd()
    return
  }
  
  window.speechSynthesis.cancel()
  
  const processedText = processSpeechText(text)
  
  const utterance = new SpeechSynthesisUtterance(processedText)
  utterance.lang = 'zh-TW'
  utterance.rate = 0.9
  utterance.pitch = 1.0
  utterance.volume = 1.0
  
  if (onEnd) {
    utterance.onend = onEnd
  }
  
  setTimeout(() => {
    window.speechSynthesis.speak(utterance)
  }, 100)
}
