import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  selectPlayers, runPipeline, nextCardId, applyCardEdit, youtubeVideoId,
  chooseNextCandidate, useCustomUrl, retryCard, safeJoin, checkRequest, mediaPath,
} from './studioPipeline.mjs'

const row = (over = {}) => ({
  id: 1, name: '甲', number: '1', team: '樂天桃猿', main_position: 'SS', league: '一軍',
  org: 'CPBL', status: 'active', is_coach: false, song: null, ...over,
})
const ids = (players) => players.map((p) => p.id)
const opts = { teams: ['樂天桃猿'], league: '一軍', org: 'CPBL', includePitchers: false }

test('selectPlayers excludes pitchers unless asked (no entrance-song search this round)', () => {
  const rows = ['P', 'SP', 'RP', 'CP', 'C'].map((pos, i) => row({ id: i + 1, main_position: pos }))
  assert.deepEqual(ids(selectPlayers(rows, opts)), [5])
  assert.deepEqual(ids(selectPlayers(rows, { ...opts, includePitchers: true })), [1, 2, 3, 4, 5])
})

test('selectPlayers applies league only to CPBL (NPB/MLB rows have no 一軍/二軍 split)', () => {
  const rows = [row({ id: 1 }), row({ id: 2, league: '二軍' }), row({ id: 3, league: null })]
  assert.deepEqual(ids(selectPlayers(rows, opts)), [1, 3])
  const npb = [row({ id: 4, org: 'NPB', team: '阪神', league: '二軍' })]
  assert.deepEqual(ids(selectPlayers(npb, { teams: ['阪神'], league: '一軍', org: 'NPB' })), [4])
})

test('selectPlayers keeps only empty songs (never touch a player who already has one)', () => {
  const rows = [row({ id: 1, song: '' }), row({ id: 2, song: 'https://x/a.mp3?raw=1' }), row({ id: 3, song: '  ' }), row({ id: 4 })]
  assert.deepEqual(ids(selectPlayers(rows, opts)), [1, 3, 4])
})

test('selectPlayers drops coaches, departed players, other teams and orgs (studio scope)', () => {
  const rows = [
    row({ id: 1, is_coach: true }), row({ id: 2, status: 'departed' }),
    row({ id: 3, team: '統一獅' }), row({ id: 4, org: 'NPB' }), row({ id: 5 }),
  ]
  assert.deepEqual(ids(selectPlayers(rows, opts)), [5])
  assert.deepEqual(ids(selectPlayers(rows, { ...opts, teams: [] })), [3, 5])
})

const card = (id, over = {}) => ({
  playerId: id, name: `球員${id}`, team: '樂天桃猿', status: 'pending', candidates: [], chosen: 0,
  fadeMs: 60, sliderDb: 0, withIntro: false, ...over,
})
const vid = (id) => id.padStart(11, 'v') // 11-char YouTube-shaped id
const suggestion = { A: 6.8, B: 22.8, leadInSec: 6.8, hasIntro: true, confidence: 0.7, beats: [0.5, 1] }
const fakes = (over = {}) => {
  const calls = { search: [], download: [], analyze: [], saves: 0 }
  return {
    calls,
    deps: {
      search: async (c) => { calls.search.push(c.playerId); return [{ videoId: vid(c.playerId), title: 't' }] },
      download: async (c, src) => { calls.download.push(src); return `b/orig/${c.playerId}-${src.videoId}.mp3` },
      analyze: async (orig) => { calls.analyze.push(orig); return { integratedLufs: -10, durationSec: 30, suggestion } },
      save: async () => { calls.saves++ },
      ...over,
    },
  }
}

test('runPipeline: one failing search marks only that card error and continues (one blocked player must not stall the batch)', async () => {
  const state = { batch: 'b', cards: { 1: card('1'), 2: card('2') } }
  const { calls, deps } = fakes({
    search: async (c) => {
      calls.search.push(c.playerId)
      if (c.playerId === '1') throw new Error('YouTube search failed: HTTP 429')
      return [{ videoId: vid('2') }]
    },
  })
  await runPipeline(state, deps)
  assert.equal(state.cards[1].status, 'error')
  assert.match(state.cards[1].error, /HTTP 429/)
  assert.equal(state.cards[2].status, 'pending')
  assert.equal(state.cards[2].original, `b/orig/2-${vid('2')}.mp3`)
  assert.equal(calls.saves, 2)
})

test('runPipeline sets cut, intro and loudness from the analysis (the page starts from the suggestion)', async () => {
  const state = { batch: 'b', cards: { 1: card('1') } }
  const { calls, deps } = fakes({ analyze: async () => ({ integratedLufs: -9.5, durationSec: 22.5, suggestion }) })
  await runPipeline(state, deps)
  const c = state.cards[1]
  assert.deepEqual(calls.download, [{ videoId: vid('1'), url: `https://www.youtube.com/watch?v=${vid('1')}` }])
  assert.deepEqual([c.A, c.B, c.withIntro, c.integratedLufs, c.durationSec], [6.8, 22.5, true, -9.5, 22.5])
  assert.deepEqual(c.suggestion, suggestion)
})

test('runPipeline skips cards that already have an original (restart must not re-download)', async () => {
  const state = { batch: 'b', cards: { 1: card('1', { original: 'b/orig/1-x.mp3' }), 2: card('2', { status: 'resolved' }) } }
  const { calls, deps } = fakes()
  await runPipeline(state, deps)
  assert.deepEqual([calls.search, calls.download, calls.analyze, calls.saves], [[], [], [], 0])
})

test('runPipeline marks a card with no candidates notfound (the page then offers the paste-URL field)', async () => {
  const state = { batch: 'b', cards: { 1: card('1') } }
  const { calls, deps } = fakes({ search: async () => [] })
  await runPipeline(state, deps)
  assert.equal(state.cards[1].status, 'notfound')
  assert.deepEqual(calls.download, [])
  assert.equal(calls.saves, 1)
})

test('runPipeline uses a pasted URL instead of searching (user override wins)', async () => {
  const state = { batch: 'b', cards: { 1: card('1', { customUrl: 'https://www.youtube.com/watch?v=abcdefghijk' }) } }
  const { calls, deps } = fakes()
  await runPipeline(state, deps)
  assert.deepEqual(calls.search, [])
  assert.deepEqual(calls.download, [{ videoId: 'abcdefghijk', url: 'https://www.youtube.com/watch?v=abcdefghijk' }])
})

test('runPipeline turns a silent original into a card error (gain cannot be computed)', async () => {
  const state = { batch: 'b', cards: { 1: card('1') } }
  const { deps } = fakes({ analyze: async () => { throw new Error('cannot compute gain: integrated loudness is -Infinity') } })
  await runPipeline(state, deps)
  assert.equal(state.cards[1].status, 'error')
  assert.equal(state.cards[1].original, undefined)
})

test('nextCardId serves queued requests first (next/url/retry clicks should not wait for the whole batch)', () => {
  const state = { cards: { 1: card('1'), 2: card('2'), 3: card('3', { original: 'x' }) } }
  assert.equal(nextCardId(state, ['3', '2']), '2')
  assert.equal(nextCardId(state, []), '1')
  assert.equal(nextCardId({ cards: { 3: card('3', { original: 'x' }) } }, []), null)
})

const ready = (over = {}) => card('1', { original: 'b/orig/1-v.mp3', durationSec: 30, A: 5, B: 20, ...over })

test('applyCardEdit saves valid edits and rejects out-of-range cuts (render would fail on bad A/B)', () => {
  const c = ready()
  assert.equal(applyCardEdit(c, { A: 6, B: 21.5, fadeMs: 120, sliderDb: -2.5, withIntro: true, status: 'resolved' }), null)
  assert.deepEqual([c.A, c.B, c.fadeMs, c.sliderDb, c.withIntro, c.status], [6, 21.5, 120, -2.5, true, 'resolved'])
  for (const bad of [{ A: -1 }, { A: 20 }, { B: 31 }, { A: '1' }, { fadeMs: 301 }, { fadeMs: -1 }, { sliderDb: 6.5 }, { sliderDb: -7 }, { withIntro: 1 }, { status: 'error' }]) {
    const c2 = ready()
    assert.ok(applyCardEdit(c2, bad), JSON.stringify(bad))
    assert.deepEqual(c2, ready(), `unchanged after ${JSON.stringify(bad)}`)
  }
})

test('applyCardEdit refuses to resolve a card without a downloaded original (nothing to render)', () => {
  assert.ok(applyCardEdit(card('1'), { status: 'resolved' }))
  const c = card('1', { status: 'notfound' })
  assert.equal(applyCardEdit(c, { status: 'skipped' }), null)
  assert.equal(c.status, 'skipped')
})

test('youtubeVideoId accepts only YouTube hosts (yt-dlp must not fetch arbitrary sites)', () => {
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1'), 'dQw4w9WgXcQ')
  assert.equal(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=3'), 'dQw4w9WgXcQ')
  assert.equal(youtubeVideoId('https://m.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  for (const bad of ['https://evil.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'file:///etc/passwd', 'not a url', 'https://www.youtube.com/watch?v=short']) {
    assert.equal(youtubeVideoId(bad), null, bad)
  }
})

test('chooseNextCandidate cycles candidates and resets the cut (new version needs a fresh analysis)', () => {
  const c = ready({ candidates: [{ videoId: 'a' }, { videoId: 'b' }], chosen: 1, customUrl: 'u', sliderDb: 2 })
  assert.equal(chooseNextCandidate(c), null)
  assert.deepEqual([c.chosen, c.original, c.A, c.customUrl, c.status, c.sliderDb], [0, undefined, undefined, undefined, 'pending', 2])
  assert.ok(chooseNextCandidate(ready({ candidates: [{ videoId: 'a' }] })))
})

test('useCustomUrl stores a canonical watch URL and rejects other hosts', () => {
  const c = ready({ status: 'notfound' })
  assert.equal(useCustomUrl(c, 'https://youtu.be/dQw4w9WgXcQ'), null)
  assert.deepEqual([c.customUrl, c.status, c.original], ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'pending', undefined])
  assert.ok(useCustomUrl(ready(), 'https://vimeo.com/123'))
})

test('retryCard only re-queues error/notfound/skipped cards (retry must not discard a tuned card)', () => {
  const c = card('1', { status: 'error', error: 'boom' })
  assert.equal(retryCard(c), null)
  assert.deepEqual([c.status, c.error], ['pending', undefined])
  const skipped = card('2', { status: 'skipped' })
  assert.equal(retryCard(skipped), null)
  assert.equal(skipped.status, 'pending')
  assert.ok(retryCard(ready({ status: 'resolved' })))
})

test('safeJoin blocks path traversal (media route must stay inside the studio dir)', () => {
  assert.equal(safeJoin('/data', 'b/orig/1-x.mp3'), '/data/b/orig/1-x.mp3')
  for (const bad of ['../etc/passwd', 'b/../../x', '/etc/passwd', 'b\\..\\x', 'b//x', '', 'a\0b']) {
    assert.equal(safeJoin('/data', bad), null, bad)
  }
})

test('runPipeline skips search results with a malformed videoId (it becomes a file path and yt-dlp argument)', async () => {
  const state = { batch: 'b', cards: { 1: card('1') } }
  const { calls, deps } = fakes({ search: async () => [{ videoId: '../../x' }, { videoId: 'abcdefghijk' }] })
  await runPipeline(state, deps)
  assert.deepEqual(state.cards[1].candidates.map((v) => v.videoId), ['abcdefghijk'])
  assert.deepEqual(calls.download.map((d) => d.videoId), ['abcdefghijk'])
  const only = { batch: 'b', cards: { 1: card('1') } }
  await runPipeline(only, fakes({ search: async () => [{ videoId: 'bad id' }] }).deps)
  assert.equal(only.cards[1].status, 'notfound')
})

test('runPipeline clamps a suggestion into 0 <= A < B <= duration (later edits/renders validate against it)', async () => {
  const state = { batch: 'b', cards: { 1: card('1') } }
  const bad = { ...suggestion, A: 25, B: 40 }
  await runPipeline(state, fakes({ analyze: async () => ({ integratedLufs: -10, durationSec: 20, suggestion: bad }) }).deps)
  const c = state.cards[1]
  assert.equal(c.B, 20)
  assert.ok(c.A >= 0 && c.A < c.B, `A=${c.A}`)
  const neg = { batch: 'b', cards: { 1: card('1') } }
  await runPipeline(neg, fakes({ analyze: async () => ({ integratedLufs: -10, durationSec: 20, suggestion: { ...suggestion, A: -1, B: 10 } }) }).deps)
  assert.deepEqual([neg.cards[1].A, neg.cards[1].B], [0, 10])
})

const req = (over = {}) => ({ method: 'POST', host: '127.0.0.1:8777', origin: undefined, contentType: 'application/json', ...over })

test('checkRequest blocks DNS rebinding and cross-site POSTs (any web page could otherwise drive the local studio)', () => {
  assert.equal(checkRequest(req(), 8777), null)
  assert.equal(checkRequest(req({ host: 'localhost:8777', origin: 'http://localhost:8777', contentType: 'application/json; charset=utf-8' }), 8777), null)
  assert.equal(checkRequest(req({ method: 'GET', contentType: undefined }), 8777), null)
  assert.equal(checkRequest(req({ host: 'evil.com:8777' }), 8777).status, 403)
  assert.equal(checkRequest(req({ host: '127.0.0.1:9999' }), 8777).status, 403)
  assert.equal(checkRequest(req({ method: 'GET', host: 'evil.com' }), 8777).status, 403)
  assert.equal(checkRequest(req({ contentType: 'text/plain' }), 8777).status, 415)
  assert.equal(checkRequest(req({ contentType: undefined }), 8777).status, 415)
  assert.equal(checkRequest(req({ origin: 'https://evil.com' }), 8777).status, 403)
  assert.equal(checkRequest(req({ origin: 'null' }), 8777).status, 403)
})

test('mediaPath serves only a batch\'s originals and renders (not state files or other batches)', () => {
  assert.equal(mediaPath('/data', 'b1', 'b1/orig/1-abcdefghijk.mp3'), '/data/b1/orig/1-abcdefghijk.mp3')
  assert.equal(mediaPath('/data', 'b1', 'b1/render/1/song.mp3'), '/data/b1/render/1/song.mp3')
  for (const bad of ['b1.json', 'b2/orig/x.mp3', 'b1/other/x.mp3', 'b1/orig/../../b2.json', 'b1/orig/']) {
    assert.equal(mediaPath('/data', 'b1', bad), null, bad)
  }
})
