import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseNpbRoster, fetchNpbRoster } from './npbClient.mjs'

const giants = readFileSync(new URL('./__fixtures__/npb/giants-players.html', import.meta.url), 'utf8')
const TEAM = '讀賣巨人'

const item = (num, name, { id = '1', src = 'https://img.example/1.jpg' } = {}) => `
  <li class="bb-playerList__item"><a class="bb-playerList__link" href="/npb/player/${id}/top">
  <div class="bb-playerList__thumb">${src === null ? '' : `<img class="bb-playerList__img" src="${src}">`}</div>
  <p class="bb-playerList__number">${num}</p><p class="bb-playerList__name">${name}</p>
  <p class="bb-playerList__other">x</p></a></li>`
const page = (...sections) => sections.map(([title, ...items]) => `
  <section class="bb-modCommon01"><header><h2 class="bb-head01__title">${title}</h2></header>
  <ul class="bb-playerList">${items.join('')}</ul></section>`).join('')

test('real Giants page: roster size is in the plausible 支配下+育成 range and coaches are excluded', () => {
  // 球團名單 60–110 人；若誤把「監督・コーチ」(約 27 人) 算進來會超過範圍
  const rows = parseNpbRoster(giants, { team: TEAM })
  assert.ok(rows.length >= 60 && rows.length <= 110, `got ${rows.length}`)
  assert.ok(rows.every((r) => r.is_coach === false))
  assert.ok(!rows.some((r) => r.name === '山口鉄也'), '山口鉄也 is a coach on this page')
})

test('real Giants page: known player has Yahoo id, number, team, photo; spaces stripped from name', () => {
  // DB 既有列的姓名沒有空白，matchUnkeyed 靠完全相同的姓名比對
  const row = parseNpbRoster(giants, { team: TEAM }).find((r) => r.name === '田中将大')
  assert.equal(row.key, '700069')
  assert.equal(row.number, '11')
  assert.equal(row.team, TEAM)
  assert.equal(row.league, '一軍')
  assert.match(row.photo, /700069\.jpg$/)
  assert.equal(row.roster_mark, null)
})

test('real Giants page: katakana foreigner kept as shown, and both leagues present', () => {
  const rows = parseNpbRoster(giants, { team: TEAM })
  assert.ok(rows.some((r) => r.name === 'ウィットリー' && r.league === '一軍'))
  assert.ok(rows.some((r) => r.league === '二軍'))
  assert.ok(rows.every((r) => r.key))
})

test('育成 is told apart by a 3+ digit number; 支配下 numbers 0/00/99 stay 一軍', () => {
  // Yahoo 沒有 支配下/育成 的分區標題，唯一線索是背號位數
  const rows = parseNpbRoster(page(['投手', item('00', 'A'), item('0', 'B'), item('99', 'C'), item('011', 'D'), item('120', 'E')]), { team: TEAM })
  assert.deepEqual(rows.map((r) => r.league), ['一軍', '一軍', '一軍', '二軍', '二軍'])
})

test('全形空白也會移除；單名（大勢）不變', () => {
  const rows = parseNpbRoster(page(['投手', item('1', '山本　由伸'), item('2', '大勢')]), { team: TEAM })
  assert.deepEqual(rows.map((r) => r.name), ['山本由伸', '大勢'])
})

test('missing photo / number: property omitted, never null or empty string', () => {
  const [row] = parseNpbRoster(page(['投手', item('', 'A', { src: null })]), { team: TEAM })
  assert.ok(!('photo' in row))
  assert.ok(!('number' in row))
})

test('every section except 監督・コーチ is read', () => {
  const rows = parseNpbRoster(page(['投手', item('1', 'A', { id: '1' })], ['外野手', item('2', 'B', { id: '2' })], ['監督・コーチ', item('71', 'C', { id: '3' })]), { team: TEAM })
  assert.deepEqual(rows.map((r) => r.key), ['1', '2'])
})

test('fetchNpbRoster fetches the team players page with a browser UA and throws on non-200', async () => {
  const calls = []
  const ok = async (url, opts) => (calls.push([url, opts.headers['User-Agent']]), { ok: true, status: 200, text: async () => 'html' })
  assert.equal(await fetchNpbRoster(376, { fetchImpl: ok }), 'html')
  assert.equal(calls[0][0], 'https://baseball.yahoo.co.jp/npb/teams/376/players')
  assert.match(calls[0][1], /Mozilla/)
  const bad = async () => ({ ok: false, status: 404, text: async () => '' })
  await assert.rejects(() => fetchNpbRoster(10, { fetchImpl: bad }), /404/)
})

test('main_position comes from the section title (pitchers must be P or the app treats them as batters)', () => {
  const rows = parseNpbRoster(giants, { team: TEAM })
  for (const pos of ['P', 'C', 'IF', 'OF']) assert.ok(rows.some((r) => r.main_position === pos), pos)
  assert.equal(rows.find((r) => r.name === '田中将大').main_position, 'P')
  assert.equal(rows.find((r) => r.name === '甲斐拓也').main_position, 'C')
  assert.ok(rows.every((r) => r.main_position))
})

test('unknown section title omits main_position', () => {
  const [row] = parseNpbRoster(page(['謎', item('1', 'A')]), { team: TEAM })
  assert.ok(!('main_position' in row))
})
