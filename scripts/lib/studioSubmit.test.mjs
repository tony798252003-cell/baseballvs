import { test } from 'node:test'
import assert from 'node:assert/strict'
import { submitApproved } from './studioSubmit.mjs'

const card = (id, over = {}) => ({
  playerId: id, name: `卡片名${id}`, team: '卡片隊', status: 'resolved', original: `b/orig/${id}-v.mp3`,
  integratedLufs: -10, durationSec: 30, A: 5, B: 20, fadeMs: 60, sliderDb: 2, withIntro: false, ...over,
})
const stateOf = (...cards) => ({ batch: 'b', cards: Object.fromEntries(cards.map((c) => [c.playerId, c])) })
const dbRow = (id, over = {}) => ({ id: Number(id), name: `球員${id}`, team: '樂天桃猿', song: null, intro: null, ...over })

const fakes = (db, over = {}) => {
  const calls = { render: [], upload: [], writes: [], saves: 0 }
  return {
    calls,
    deps: {
      readPlayer: async (id) => db[id] ?? null,
      render: async (opts) => {
        calls.render.push(opts)
        return { songPath: `${opts.outDir}/song.mp3`, introPath: opts.withIntro ? `${opts.outDir}/intro.mp3` : null }
      },
      upload: async (local, remote) => { calls.upload.push([local, remote]) },
      link: async (remote) => `https://dl/${encodeURIComponent(remote)}?raw=1`,
      writePlayer: async (id, patch) => { calls.writes.push([id, patch]) },
      save: async () => { calls.saves++ },
      log: () => {},
      ...over,
    },
  }
}
const opts = { studioDir: '/studio' }

test('happy path renders with the card cut and gain, names files from the DB row, writes song+intro only', async () => {
  // Ruling 5: Dropbox names come from the current DB team/name, not the card's cached copy.
  const state = stateOf(card('1', { withIntro: true }))
  const { calls, deps } = fakes({ 1: dbRow('1') })
  const summary = await submitApproved(state, deps, opts)

  assert.deepEqual(summary, { uploaded: ['樂天桃猿 - 球員1'], skipped: [], failed: [] })
  assert.deepEqual(calls.render, [{
    src: '/studio/b/orig/1-v.mp3', outDir: '/studio/b/render/1', A: 5, B: 20, fadeMs: 60, gainDb: -14 - -10 + 2, withIntro: true,
  }])
  assert.deepEqual(calls.upload.map(([, r]) => r), ['/Music/Players/樂天桃猿 - 球員1.mp3', '/Music/Players/樂天桃猿 - 球員1 - Intro.mp3'])
  const song = `https://dl/${encodeURIComponent('/Music/Players/樂天桃猿 - 球員1.mp3')}?raw=1`
  const intro = `https://dl/${encodeURIComponent('/Music/Players/樂天桃猿 - 球員1 - Intro.mp3')}?raw=1`
  assert.deepEqual(calls.writes, [['1', { song, intro }]])
  assert.deepEqual(state.cards['1'].uploaded, { song, intro })
  assert.equal(calls.saves, 1)
})

test('without 有前奏 only the song is rendered and written (intro column left untouched)', async () => {
  // Unchecked 有前奏 must not clear or write intro.
  const { calls, deps } = fakes({ 1: dbRow('1') })
  await submitApproved(stateOf(card('1')), deps, opts)
  assert.equal(calls.render[0].withIntro, false)
  assert.equal(calls.upload.length, 1)
  assert.deepEqual(Object.keys(calls.writes[0][1]), ['song'])
})

test('a stale card whose DB song became non-empty is skipped with no render/upload/write', async () => {
  // Never overwrite a song someone added after the card was made.
  const state = stateOf(card('1'))
  const { calls, deps } = fakes({ 1: dbRow('1', { song: 'https://old?raw=1' }) })
  const summary = await submitApproved(state, deps, opts)
  assert.deepEqual(summary.skipped, [{ name: '樂天桃猿 - 球員1', reason: '已有歌' }])
  assert.deepEqual([calls.render.length, calls.upload.length, calls.writes.length], [0, 0, 0])
  assert.equal(state.cards['1'].uploaded, undefined)
})

test('DB intro already set: song uploaded and written, intro not uploaded and listed as skipped', async () => {
  // Never overwrite a non-empty intro, but the missing song is still worth delivering.
  const state = stateOf(card('1', { withIntro: true }))
  const { calls, deps } = fakes({ 1: dbRow('1', { intro: 'https://old-intro?raw=1' }) })
  const summary = await submitApproved(state, deps, opts)
  assert.deepEqual(summary.uploaded, ['樂天桃猿 - 球員1'])
  assert.deepEqual(summary.skipped, [{ name: '樂天桃猿 - 球員1', reason: '已有 intro，略過前奏' }])
  assert.deepEqual(calls.upload.map(([, r]) => r), ['/Music/Players/樂天桃猿 - 球員1.mp3'])
  assert.deepEqual(Object.keys(calls.writes[0][1]), ['song'])
  assert.equal(state.cards['1'].uploaded.intro, null)
})

test('an upload failure lands in failed and the next card still goes through', async () => {
  // One bad card must not block the rest of the batch.
  const state = stateOf(card('1'), card('2'))
  const { calls, deps } = fakes({ 1: dbRow('1'), 2: dbRow('2') }, {
    upload: async (local, remote) => { if (remote.includes('球員1')) throw new Error('上傳失敗 500') },
  })
  const summary = await submitApproved(state, deps, opts)
  assert.deepEqual(summary.failed, [{ name: '樂天桃猿 - 球員1', error: '上傳失敗 500' }])
  assert.deepEqual(summary.uploaded, ['樂天桃猿 - 球員2'])
  assert.deepEqual(calls.writes.map(([id]) => id), ['2'])
  assert.equal(state.cards['1'].uploaded, undefined)
})

test('already-uploaded, unresolved and in-pipeline cards are not submitted', async () => {
  // Re-running submit must not redo finished cards or race the download pipeline.
  const state = stateOf(
    card('1', { uploaded: { song: 'https://x?raw=1', intro: null } }),
    card('2', { status: 'pending' }),
    card('3'),
    card('4'),
  )
  const { calls, deps } = fakes({ 1: dbRow('1'), 2: dbRow('2'), 3: dbRow('3'), 4: dbRow('4') })
  const summary = await submitApproved(state, deps, { ...opts, busyId: '3' })
  assert.deepEqual(summary.uploaded, ['樂天桃猿 - 球員4'])
  assert.deepEqual(calls.writes.map(([id]) => id), ['4'])
})

test('a card un-resolved while an earlier card is uploading is not submitted', async () => {
  // The page stays editable during a submit; the card's state at its turn is what counts.
  const state = stateOf(card('1'), card('2'))
  const { calls, deps } = fakes({ 1: dbRow('1'), 2: dbRow('2') }, {
    upload: async () => { state.cards['2'].status = 'pending' },
  })
  const summary = await submitApproved(state, deps, opts)
  assert.deepEqual(summary.uploaded, ['樂天桃猿 - 球員1'])
  assert.deepEqual(calls.writes.map(([id]) => id), ['1'])
})

test('a player missing from the DB is a failure, not a crash', async () => {
  // Cards outside the current CLI scope may linger in state; the DB re-read is the authority.
  const { deps } = fakes({})
  const summary = await submitApproved(stateOf(card('9')), deps, opts)
  assert.deepEqual(summary.failed, [{ name: '卡片隊 - 卡片名9', error: '資料庫找不到這位球員' }])
})
