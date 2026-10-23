import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseYoutubeResults, rankCandidates, searchPlayer } from './youtubeSearch.mjs'

const html = readFileSync(new URL('./__fixtures__/youtube/results.html', import.meta.url), 'utf8')

const v = (videoId, title, { lengthSec = 56, channel = '某頻道', views = 1000 } = {}) => ({ videoId, title, lengthSec, channel, views })
const NAME = '陳鏞基'
const TEAM = '樂天桃猿'
const rank = (videos, opts = {}) => rankCandidates(videos, { name: NAME, team: TEAM, ...opts })

test('real results page: parses at least 8 videos with numeric lengthSec, ids, titles, integer views', () => {
  const videos = parseYoutubeResults(html)
  assert.ok(videos.length >= 8, `got ${videos.length}`)
  assert.ok(videos.filter((x) => typeof x.lengthSec === 'number').length >= 8)
  for (const x of videos) {
    assert.match(x.videoId, /^[\w-]{11}$/)
    assert.ok(x.title && x.channel)
    assert.ok(Number.isInteger(x.views))
  }
})

const page = (data, tail = ';</script>') => `<script>var ytInitialData = ${JSON.stringify(data)}${tail}`

test('page without ytInitialData throws (a blocked/changed page must not look like "no results")', () => {
  assert.throws(() => parseYoutubeResults('<html></html>'), /ytInitialData not found/)
})

test('malformed ytInitialData JSON throws with context', () => {
  assert.throws(() => parseYoutubeResults('<script>var ytInitialData = {"a": nope};</script>'), /not valid JSON/)
})

test('a real no-results page (ytInitialData without videos) returns []', () => {
  assert.deepEqual(parseYoutubeResults(page({ contents: {} })), [])
})

test('extraction survives whitespace before </script> and braces/escaped quotes inside strings', () => {
  const data = { x: 'a}b"c{', v: { videoRenderer: { videoId: 'abcdefghijk', title: { simpleText: '陳鏞基 應援曲' } } } }
  const out = parseYoutubeResults(page(data, ';\n  </script>'))
  assert.equal(out.length, 1)
  assert.equal(out[0].videoId, 'abcdefghijk')
})

test('official short clip outranks a cheerleader fancam and a 交響樂 version (why: users want the clean stadium chant)', () => {
  const official = v('off', `${NAME} 應援曲`, { channel: 'Rakuten Monkeys', views: 5000 })
  const fancam = v('fan', `${NAME} 應援曲 Rakuten Girls #shorts`, { lengthSec: 40, views: 900000 })
  const orch = v('orc', `${NAME} 應援曲 交響樂版`, { lengthSec: 120, views: 900000 })
  const ranked = rank([fancam, orch, official])
  assert.equal(ranked[0].videoId, 'off')
  assert.ok(ranked[0].reasons.length > 0)
})

test('教學 and compilation videos rank below a plain clip', () => {
  const plain = v('ok', `${NAME} 應援曲`)
  const lesson = v('les', `${NAME} 應援曲教學`, { channel: 'Rakuten Monkeys' })
  const comp = v('cmp', `${NAME} 應援曲合輯`)
  assert.equal(rank([lesson, comp, plain])[0].videoId, 'ok')
  const names = rank([v('c2', `${NAME}、林立、朱育賢 應援曲`), plain], { otherNames: ['林立', '朱育賢'] })
  assert.equal(names[0].videoId, 'ok')
})

test('titles without the player name are dropped', () => {
  assert.deepEqual(rank([v('x', '別人 應援曲')]), [])
})

test('name must not be a prefix of a longer name; punctuation and spaces are ignored', () => {
  const kept = (title, name = '林立') => rank([v('k', title)], { name }).length === 1
  assert.equal(kept('林立中應援曲'), false)
  assert.equal(kept('林立 應援曲'), true)
  assert.equal(kept('#林立應援曲'), true)
  assert.equal(kept('吉力吉撈．鞏冠 應援', '吉力吉撈鞏冠'), true)
  assert.equal(kept('吉力吉撈鞏冠 應援', '吉力吉撈．鞏冠'), true)
})

test('duplicate videoIds collapse to one entry', () => {
  const ranked = rank([v('d', `${NAME} 應援曲`), v('d', `${NAME} 應援曲`)])
  assert.equal(ranked.length, 1)
})

test('missing length is tolerated (null) and scores below an in-range clip', () => {
  const ranked = rank([v('n', `${NAME} 應援曲`, { lengthSec: null }), v('a', `${NAME} 應援曲`)])
  assert.equal(ranked[0].videoId, 'a')
})

test('official channel detection uses the team table (English name counts)', () => {
  const a = v('a', `${NAME} 應援曲`, { channel: 'Rakuten Monkeys' })
  const b = v('b', `${NAME} 應援曲`, { channel: 'Fubon Guardians' })
  assert.equal(rank([b, a])[0].videoId, 'a')
  assert.equal(rankCandidates([a, b], { name: NAME, team: '富邦悍將' })[0].videoId, 'b')
})

test('searchPlayer runs both queries, waits between requests, returns top 3 deduped', async () => {
  const calls = []
  const sleeps = []
  const fetchImpl = async (url) => {
    calls.push(String(url))
    return { ok: true, text: async () => html }
  }
  const name = NAME
  const out = await searchPlayer({ name, team: TEAM }, { fetchImpl, sleep: async (ms) => sleeps.push(ms) })
  assert.equal(calls.length, 2)
  assert.ok(calls.every((u) => u.includes('youtube.com/results')))
  assert.ok(sleeps.length >= 1 && sleeps.every((ms) => ms >= 1500))
  assert.ok(out.length > 0 && out.length <= 3)
  assert.ok(decodeURIComponent(calls[0]).includes(`${TEAM} ${name} 應援曲`))
  assert.equal(new Set(out.map((r) => r.videoId)).size, out.length)
})

test('searchPlayer passes otherNames through so name-based compilations are demoted', async () => {
  const others = ['林立', '朱育賢']
  const title = `${NAME} ${others.join(' ')} 應援曲`
  const body = page({ r: { videoRenderer: { videoId: 'comp1234567', title: { simpleText: title }, ownerText: { simpleText: 'c' }, lengthText: { simpleText: '0:56' } } } })
  const fetchImpl = async () => ({ ok: true, text: async () => body })
  const run = (otherNames) => searchPlayer({ name: NAME, team: TEAM }, { fetchImpl, sleep: async () => {}, otherNames })
  const [plain] = await run(undefined)
  const [demoted] = await run(others)
  assert.ok(demoted.score < plain.score)
})

test('searchPlayer throws on a non-ok response', async () => {
  const fetchImpl = async () => ({ ok: false, status: 429 })
  await assert.rejects(searchPlayer({ name: NAME, team: TEAM }, { fetchImpl, sleep: async () => {} }), /429/)
})
