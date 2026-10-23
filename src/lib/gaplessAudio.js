// 排程起點稍微往後推，避免 start() 時間已過而切掉開頭
const START_LEAD_SECONDS = 0.05

// 前奏與主歌的 AudioContext 排程時間：主歌接在前奏結尾，無縫
export function scheduleIntroThenSong(now, introDuration) {
  const introStart = now + START_LEAD_SECONDS
  return { introStart, songStart: introStart + introDuration }
}

// www.dropbox.com 的轉址回應沒有 Access-Control-Allow-Origin，fetch 會被擋；
// dl.dropboxusercontent.com 直接回檔案且帶 `access-control-allow-origin: *`
export function toCorsFetchUrl(url) {
  return url.replace(/^https:\/\/www\.dropbox\.com\//, 'https://dl.dropboxusercontent.com/')
}
