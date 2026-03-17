export function useSpeech() {
  const isPlayingResultSpeech = { value: false }
  
  const processSpeechText = (text) => {
    return text.replace(/曾/g, '增')
  }
  
  const speak = (text, options = {}) => {
    if (!('speechSynthesis' in window)) return
    
    const {
      onEnd = null,
      lang = 'zh-TW',
      rate = 0.9,
      pitch = 1.0,
      volume = 1.0
    } = options
    
    window.speechSynthesis.cancel()
    
    const utterance = new SpeechSynthesisUtterance(processSpeechText(text))
    utterance.lang = lang
    utterance.rate = rate
    utterance.pitch = pitch
    utterance.volume = volume
    
    if (onEnd) {
      utterance.onend = onEnd
    }
    
    setTimeout(() => {
      window.speechSynthesis.speak(utterance)
    }, 100)
  }
  
  const speakBatterName = (name, batterIndex) => {
    const text = `第 ${batterIndex + 1} 棒、${name}`
    speak(text)
  }
  
  const speakIntro = (text) => {
    speak(text)
  }
  
  const cancel = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }
  
  return {
    isPlayingResultSpeech,
    processSpeechText,
    speak,
    speakBatterName,
    speakIntro,
    cancel
  }
}
