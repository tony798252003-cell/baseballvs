import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scheduleIntroThenSong, toCorsFetchUrl } from './gaplessAudio.js'

// 主歌必須剛好接在前奏結尾，差一點就會聽到空白或重疊
test('song starts exactly when the intro ends', () => {
  const { introStart, songStart } = scheduleIntroThenSong(10, 4.25)
  assert.ok(introStart > 10, 'starts slightly in the future so the first samples are not clipped')
  assert.equal(songStart, introStart + 4.25)
})

// 沒有前奏時主歌直接開始，不能多等一段前奏長度
test('without an intro the song starts right away', () => {
  const { introStart, songStart } = scheduleIntroThenSong(10, 0)
  assert.equal(songStart, introStart)
})

// www.dropbox.com 的 ?raw=1 會 302 轉址且轉址回應沒有 CORS 標頭，fetch 會失敗；直接打檔案主機才拿得到
test('www.dropbox.com links are fetched from the CORS-enabled file host', () => {
  assert.equal(
    toCorsFetchUrl('https://www.dropbox.com/scl/fi/abc/x.mp3?rlkey=k&raw=1'),
    'https://dl.dropboxusercontent.com/scl/fi/abc/x.mp3?rlkey=k&raw=1'
  )
})

// 其他網址（含已是 dl.dropboxusercontent.com 的舊資料）原樣使用
test('other urls are left unchanged', () => {
  const u = 'https://dl.dropboxusercontent.com/scl/fi/abc/x.mp3?rlkey=k&dl=0'
  assert.equal(toCorsFetchUrl(u), u)
  assert.equal(toCorsFetchUrl('https://example.com/a.mp3'), 'https://example.com/a.mp3')
})
