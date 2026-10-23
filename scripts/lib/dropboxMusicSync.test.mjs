import { test } from 'node:test'
import assert from 'node:assert/strict'
import { headerSafeJson } from './dropboxMusicSync.mjs'

test('Dropbox-API-Arg for a Chinese path is header-safe and decodes back to the same path', () => {
  // Studio file names are 「球隊 - 姓名.mp3」; fetch throws on header characters above U+00FF, failing every upload.
  const arg = headerSafeJson({ path: '/Music/Players/樂天桃猿 - 球員1.mp3' })
  assert.doesNotThrow(() => new Headers({ 'Dropbox-API-Arg': arg }))
  assert.match(arg, /^[\x20-\x7e]*$/)
  assert.equal(JSON.parse(arg).path, '/Music/Players/樂天桃猿 - 球員1.mp3')
})
