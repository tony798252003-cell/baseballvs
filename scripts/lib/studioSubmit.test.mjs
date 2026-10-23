import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSubmitter, submitApproved } from './studioSubmit.mjs'

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
      findNameConflict: async () => false,
      render: async (opts) => {
        calls.render.push(opts)
        return { songPath: `${opts.outDir}/song.mp3`, introPath: opts.withIntro ? `${opts.outDir}/intro.mp3` : null }
      },
      upload: async (local, remote) => { calls.upload.push([local, remote]) },
      link: async (remote) => `https://dl/${encodeURIComponent(remote)}?raw=1`,
      writePlayer: async (id, patch) => { calls.writes.push([id, patch]); return 1 },
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
    src: '/studio/b/orig/1-v.mp3', outDir: '/studio/b/render/1', A: 5, B: 20, fadeMs: 60, gainDb: -12 - -10 + 2, withIntro: true,
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

test('DB song filled between re-read and write (0 rows written) -> failed, card not marked uploaded', async () => {
  // The conditional write is the last guard against overwriting a song; 0 rows must not look like success.
  const state = stateOf(card('1'), card('2'))
  const { deps } = fakes({ 1: dbRow('1'), 2: dbRow('2') }, { writePlayer: async (id) => (id === '1' ? 0 : 1) })
  const summary = await submitApproved(state, deps, opts)
  assert.deepEqual(summary.failed, [{ name: '樂天桃猿 - 球員1', error: '寫入前歌曲已被填入，未寫入' }])
  assert.equal(state.cards['1'].uploaded, undefined)
  assert.deepEqual(summary.uploaded, ['樂天桃猿 - 球員2'])
})

test('DB intro filled between re-read and write -> song written alone, intro reported skipped', async () => {
  // An intro conflict must not cost the player the missing song, nor overwrite the new intro.
  const state = stateOf(card('1', { withIntro: true }))
  const f = fakes({ 1: dbRow('1') }, {
    writePlayer: async (id, patch) => { f.calls.writes.push([id, patch]); return patch.intro ? 0 : 1 },
  })
  const summary = await submitApproved(state, f.deps, opts)
  assert.deepEqual(f.calls.writes.map(([, p]) => Object.keys(p)), [['song', 'intro'], ['song']])
  assert.deepEqual(summary.uploaded, ['樂天桃猿 - 球員1'])
  assert.deepEqual(summary.skipped, [{ name: '樂天桃猿 - 球員1', reason: '已有 intro，略過前奏' }])
  assert.equal(state.cards['1'].uploaded.intro, null)
})

test('both song and intro filled meanwhile -> failed after the song-only retry also writes 0 rows', async () => {
  // The retry without intro is still conditional on song, so a filled song is never overwritten.
  const state = stateOf(card('1', { withIntro: true }))
  const { deps } = fakes({ 1: dbRow('1') }, { writePlayer: async () => 0 })
  const summary = await submitApproved(state, deps, opts)
  assert.deepEqual(summary.failed, [{ name: '樂天桃猿 - 球員1', error: '寫入前歌曲已被填入，未寫入' }])
  assert.equal(state.cards['1'].uploaded, undefined)
})

test('another same-team same-name player with a file -> failed before render/upload', async () => {
  // Same team+name is the same Dropbox path; uploading would overwrite the other player's song.
  const state = stateOf(card('1'))
  const { calls, deps } = fakes({ 1: dbRow('1') }, { findNameConflict: async (p) => p.id === 1 })
  const summary = await submitApproved(state, deps, opts)
  assert.deepEqual(summary.failed, [{ name: '樂天桃猿 - 球員1', error: '同隊同名球員已有檔案，未上傳' }])
  assert.deepEqual([calls.render.length, calls.upload.length, calls.writes.length], [0, 0, 0])
})

test('team/name with a slash, surrounding whitespace or a trailing dot -> failed, nothing uploaded', async () => {
  // Such names would change the Dropbox path (subfolder, trimmed or mangled filename).
  const db = { 1: dbRow('1', { name: 'A/B' }), 2: dbRow('2', { name: ' 乙' }), 3: dbRow('3', { team: '樂天桃猿.' }), 4: dbRow('4', { name: '丁 ' }) }
  const { calls, deps } = fakes(db)
  const summary = await submitApproved(stateOf(card('1'), card('2'), card('3'), card('4')), deps, opts)
  assert.deepEqual(summary.failed.map((f) => f.error), Array(4).fill('檔名含不允許的字元'))
  assert.equal(calls.upload.length, 0)
})

test('state save failing after the DB write is reported distinctly and keeps uploaded in memory', async () => {
  // The DB already has the song; the card must not be re-uploaded by a retry in this session.
  const state = stateOf(card('1'))
  const { deps } = fakes({ 1: dbRow('1') }, { save: async () => { throw new Error('disk full') } })
  const summary = await submitApproved(state, deps, opts)
  assert.deepEqual(summary.failed, [{ name: '樂天桃猿 - 球員1', error: '已寫入資料庫，但狀態存檔失敗：disk full' }])
  assert.deepEqual(summary.uploaded, [])
  assert.ok(state.cards['1'].uploaded.song)
})

test('a DB write error -> failed, not marked uploaded, next card continues', async () => {
  // A transient DB error on one player must not lose the rest of the batch.
  const state = stateOf(card('1'), card('2'))
  const f = fakes({ 1: dbRow('1'), 2: dbRow('2') }, {
    writePlayer: async (id, patch) => {
      if (id === '1') throw new Error('寫入資料庫失敗：timeout')
      f.calls.writes.push([id, patch])
      return 1
    },
  })
  const summary = await submitApproved(state, f.deps, opts)
  assert.deepEqual(summary.failed, [{ name: '樂天桃猿 - 球員1', error: '寫入資料庫失敗：timeout' }])
  assert.equal(state.cards['1'].uploaded, undefined)
  assert.deepEqual(summary.uploaded, ['樂天桃猿 - 球員2'])
})

test('createSubmitter answers 409 while a submit runs and exposes the card in progress', async () => {
  // Two overlapping submits would upload/write the same cards twice.
  let release, started
  const startedP = new Promise((r) => { started = r })
  const submitter = createSubmitter(async (onStart) => {
    onStart('7')
    started()
    await new Promise((r) => { release = r })
    return { uploaded: ['x'], skipped: [], failed: [] }
  })
  const first = submitter.request()
  await startedP
  assert.equal(submitter.currentId(), '7')
  assert.deepEqual(await submitter.request(), { status: 409, body: { error: '送出進行中，請稍候' } })
  release()
  assert.deepEqual(await first, { status: 200, body: { uploaded: ['x'], skipped: [], failed: [] } })
  assert.equal(submitter.currentId(), null)
})

test('createSubmitter frees the lock when a submit throws', async () => {
  // A crashed submit must not leave the page stuck on 409 forever.
  let fail = true
  const submitter = createSubmitter(async () => { if (fail) throw new Error('boom'); return 'ok' })
  await assert.rejects(submitter.request(), /boom/)
  fail = false
  assert.deepEqual(await submitter.request(), { status: 200, body: 'ok' })
})
