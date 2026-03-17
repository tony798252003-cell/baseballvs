import { ref } from 'vue'

export function useAudio() {
  const audioRef = ref(null)
  
  const playBatterMusic = (player, teamChants = []) => {
    console.log('playBatterMusic 被調用:', { 
      player: player?.name,
      hasAudioRef: !!audioRef.value,
      song: player?.song,
      intro: player?.intro 
    })
    
    if (!audioRef.value) {
      console.log('audioRef 不存在，無法播放')
      return
    }
    
    audioRef.value.pause()
    audioRef.value.currentTime = 0
    audioRef.value.onended = null
    audioRef.value.ontimeupdate = null
    
    if (player.intro && player.intro.startsWith('http')) {
      console.log('播放 intro 音檔:', player.intro)
      audioRef.value.src = player.intro
      audioRef.value.loop = false
      audioRef.value.play()
        .then(() => console.log('intro 開始播放'))
        .catch(error => console.log("Auto-play prevented:", error))
      
      audioRef.value.onended = () => {
        if (player.song) {
          console.log('intro 結束，播放 song:', player.song)
          audioRef.value.src = player.song
          audioRef.value.loop = false
          
          audioRef.value.onended = () => {
            console.log('song 結束，循環播放')
            audioRef.value.currentTime = 0
            audioRef.value.play().catch(() => {})
          }
          
          audioRef.value.play()
            .then(() => console.log('song 開始播放'))
            .catch(error => console.log("Auto-play prevented:", error))
        }
      }
    } else if (player.song) {
      console.log('播放 song 音檔:', player.song)
      audioRef.value.src = player.song
      audioRef.value.loop = false
      
      audioRef.value.onended = () => {
        console.log('song 結束，循環播放')
        audioRef.value.currentTime = 0
        audioRef.value.play().catch(() => {})
      }
      
      audioRef.value.play()
        .then(() => console.log('song 開始播放'))
        .catch(error => console.log("Auto-play prevented:", error))
    } else {
      // 沒有個人應援曲，嘗試播放球隊嗆斯曲
      const chants = teamChants.filter(c => c.team === player.team)
      if (chants.length > 0) {
        const chant = chants[Math.floor(Math.random() * chants.length)]
        console.log('播放球隊嗆斯曲:', chant.name)
        audioRef.value.src = chant.url
        audioRef.value.loop = false
        audioRef.value.onended = () => {
          audioRef.value.currentTime = 0
          audioRef.value.play().catch(() => {})
        }
        audioRef.value.play().catch(error => console.log("Auto-play prevented:", error))
      } else {
        console.log('球員沒有 song 或 intro，也沒有球隊嗆斯曲')
      }
    }
  }
  
  const pauseMusic = () => {
    if (audioRef.value) {
      audioRef.value.pause()
    }
  }
  
  const resumeMusic = () => {
    if (audioRef.value) {
      audioRef.value.play().catch(() => {})
    }
  }
  
  const stopMusic = () => {
    if (audioRef.value) {
      audioRef.value.pause()
      audioRef.value.currentTime = 0
    }
  }
  
  return {
    audioRef,
    playBatterMusic,
    pauseMusic,
    resumeMusic,
    stopMusic
  }
}
