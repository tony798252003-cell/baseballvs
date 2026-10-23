import { ref } from 'vue'
import { pickFallbackChant } from '../lib/chantFallback.js'
import { scheduleIntroThenSong, toCorsFetchUrl } from '../lib/gaplessAudio.js'

// 解碼後的音檔很佔記憶體（一首 1 分鐘約 20–30MB），只保留最近用過的幾首
const MAX_CACHED_BUFFERS = 8

export function useAudio() {
  const audioRef = ref(null)

  let ctx = null
  let sources = []
  const bufferCache = new Map()
  // 每次播放/停止遞增；非同步載入完成時若已不是同一次就丟棄
  let playToken = 0
  // 'idle' | 'playing' | 'paused'
  let state = 'idle'
  // 'webaudio' | 'element'：這次播放實際走哪條路
  let engine = null

  const getContext = () => {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return null
      ctx = new Ctx()
    }
    return ctx
  }

  // 瀏覽器要求 AudioContext 在使用者操作後才能出聲：第一次點擊/按鍵時建立並 resume
  if (typeof window !== 'undefined') {
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      const c = getContext()
      if (c && state !== 'paused') c.resume().catch(() => {})
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
  }

  const loadBuffer = (c, url) => {
    if (bufferCache.has(url)) {
      const cached = bufferCache.get(url)
      bufferCache.delete(url)
      bufferCache.set(url, cached)
      return cached
    }
    const p = fetch(toCorsFetchUrl(url))
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.arrayBuffer()
      })
      .then(data => c.decodeAudioData(data))
    p.catch(() => bufferCache.delete(url))
    bufferCache.set(url, p)
    if (bufferCache.size > MAX_CACHED_BUFFERS) {
      bufferCache.delete(bufferCache.keys().next().value)
    }
    return p
  }

  const stopSources = () => {
    for (const s of sources) {
      try { s.stop() } catch { /* 尚未開始或已停止 */ }
      s.disconnect()
    }
    sources = []
  }

  const startSource = (c, buffer, when, loop) => {
    const s = c.createBufferSource()
    s.buffer = buffer
    s.loop = loop
    s.connect(c.destination)
    s.start(when)
    sources.push(s)
  }

  // Web Audio：前奏結尾精準接主歌，主歌用 loop 無縫循環
  const playWithWebAudio = async (token, introUrl, loopUrl) => {
    const c = getContext()
    if (!c) throw new Error('AudioContext 不支援')
    engine = 'webaudio'
    c.resume().catch(() => {})
    const [introBuffer, loopBuffer] = await Promise.all([
      introUrl ? loadBuffer(c, introUrl) : null,
      loopUrl ? loadBuffer(c, loopUrl) : null
    ])
    if (token !== playToken) return
    const { introStart, songStart } = scheduleIntroThenSong(c.currentTime, introBuffer ? introBuffer.duration : 0)
    if (introBuffer) startSource(c, introBuffer, introStart, false)
    if (loopBuffer) startSource(c, loopBuffer, songStart, true)
    console.log('Web Audio 開始播放:', { intro: introUrl, loop: loopUrl })
  }

  // 原本的 <audio> 播放方式（Web Audio 載入/解碼失敗時使用）
  const playWithElement = (introUrl, loopUrl) => {
    const el = audioRef.value
    if (!el) return
    engine = 'element'
    el.pause()
    el.currentTime = 0
    el.onended = null
    el.ontimeupdate = null

    const playLoop = (url) => {
      el.src = url
      el.loop = false
      el.onended = () => {
        console.log('song 結束，循環播放')
        el.currentTime = 0
        el.play().catch(() => {})
      }
      el.play()
        .then(() => console.log('song 開始播放'))
        .catch(error => console.log("Auto-play prevented:", error))
    }

    if (introUrl) {
      el.src = introUrl
      el.loop = false
      el.play()
        .then(() => console.log('intro 開始播放'))
        .catch(error => console.log("Auto-play prevented:", error))
      el.onended = () => {
        if (loopUrl) {
          console.log('intro 結束，播放 song:', loopUrl)
          playLoop(loopUrl)
        }
      }
    } else {
      playLoop(loopUrl)
    }
  }

  const stopAll = () => {
    stopSources()
    if (audioRef.value) {
      audioRef.value.pause()
      audioRef.value.currentTime = 0
      audioRef.value.onended = null
    }
  }

  const playBatterMusic = (player, teamChants = [], genericChantUrl = '') => {
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

    const token = ++playToken
    stopAll()

    let introUrl = null
    let loopUrl = null
    if (player.intro && player.intro.startsWith('http')) {
      console.log('播放 intro 音檔:', player.intro)
      introUrl = player.intro
      loopUrl = player.song || null
    } else if (player.song) {
      console.log('播放 song 音檔:', player.song)
      loopUrl = player.song
    } else {
      // 沒有個人應援曲：本隊嗆斯曲 → 後繼球隊嗆斯曲 → 通用嗆斯曲
      const chant = pickFallbackChant(player, teamChants, genericChantUrl)
      if (!chant) {
        console.log('球員沒有 song 或 intro，也沒有嗆斯曲')
        state = 'idle'
        return
      }
      console.log('播放嗆斯曲:', chant.kind, chant.url)
      loopUrl = chant.url
    }

    state = 'playing'
    playWithWebAudio(token, introUrl, loopUrl).catch(error => {
      if (token !== playToken) return
      console.log('Web Audio 無法播放，改用 <audio>:', error)
      stopSources()
      playWithElement(introUrl, loopUrl)
      // 載入期間被暫停：<audio> 也維持暫停，等 resumeMusic
      if (state === 'paused') audioRef.value?.pause()
    })
  }

  const pauseMusic = () => {
    if (state !== 'playing') return
    state = 'paused'
    if (ctx) ctx.suspend().catch(() => {})
    if (audioRef.value) audioRef.value.pause()
  }

  const resumeMusic = () => {
    if (state !== 'paused') return
    state = 'playing'
    if (engine === 'element') {
      if (audioRef.value) audioRef.value.play().catch(() => {})
    } else if (ctx) {
      ctx.resume().catch(() => {})
    }
  }

  const stopMusic = () => {
    playToken++
    state = 'idle'
    stopAll()
  }

  return {
    audioRef,
    playBatterMusic,
    pauseMusic,
    resumeMusic,
    stopMusic
  }
}
