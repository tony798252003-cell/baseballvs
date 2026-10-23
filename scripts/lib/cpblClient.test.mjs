import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripRosterMark, parseTeamPage, parsePersonPage, createCpblSession } from './cpblClient.mjs'

const fx = name => readFileSync(new URL(`./__fixtures__/cpbl/${name}`, import.meta.url), 'utf8')

test('stripRosterMark removes each mark char and normalizes full-width ones', () => {
  // 名單標記若沒剝掉，會讓同一球員在不同期出現不同名字
  assert.deepEqual(stripRosterMark('#麥斯威尼'), { name: '麥斯威尼', rosterMark: '#' })
  assert.deepEqual(stripRosterMark('＃許基宏'), { name: '許基宏', rosterMark: '#' })
  assert.deepEqual(stripRosterMark('✽杰克'), { name: '杰克', rosterMark: '✽' })
  assert.deepEqual(stripRosterMark('◎大瀧幸治'), { name: '大瀧幸治', rosterMark: '◎' })
  assert.deepEqual(stripRosterMark('＊某人'), { name: '某人', rosterMark: '*' })
  assert.deepEqual(stripRosterMark('※某人'), { name: '某人', rosterMark: '※' })
})

test('stripRosterMark leaves names with interpunct untouched', () => {
  // 原住民姓名的「．」不是標記，不能被誤剝
  assert.deepEqual(stripRosterMark('吉力吉撈．鞏冠'), { name: '吉力吉撈．鞏冠', rosterMark: null })
})

test('parseTeamPage reads 一軍 roster with keys, coaches and no mark chars', () => {
  // 一軍頁是名單同步的主要輸入；key 與教練旗標錯了會造成重複或誤刪
  const rows = parseTeamPage(fx('team_ACN_A.html'), { team: '中信兄弟', league: '一軍' })
  assert.equal(rows.length, 44)
  const felix = rows.find(r => r.name === '菲力士')
  assert.equal(felix.key, '0000007560')
  assert.equal(felix.team, '中信兄弟')
  assert.equal(felix.league, '一軍')
  assert.equal(felix.is_coach, false)
  assert.equal(felix.roster_mark, null)
  assert.match(felix.photo, /^https:\/\/www\.cpbl\.com\.tw\/files\//)
  assert.ok(!rows.some(r => /^[#＃✽◎*＊※]/.test(r.name)))
  const coaches = rows.filter(r => r.is_coach)
  assert.ok(coaches.length > 0)
  assert.ok(coaches.every(c => c.key === null))
  assert.ok(rows.filter(r => !r.is_coach).every(p => /^\d{10}$/.test(p.key)))
})

test('parseTeamPage 二軍 captures roster marks separately from names', () => {
  // 二軍頁名字帶 * # ◎，標記要進 roster_mark 而不是名字
  const rows = parseTeamPage(fx('team_ACN_D.html'), { team: '中信兄弟', league: '二軍' })
  assert.equal(rows.length, 69)
  const hsu = rows.find(r => r.key === '0000001119')
  assert.equal(hsu.name, '許基宏')
  assert.equal(hsu.roster_mark, '#')
  assert.equal(rows.find(r => r.key === '0000007584').roster_mark, '◎')
  assert.equal(rows.find(r => r.key === '0000007285').roster_mark, '*')
})

test('parseTeamPage omits properties it cannot find instead of emitting empty values', () => {
  // 空字串/null 會把 DB 既有值洗掉；缺值必須是 undefined
  const html = '<div class="cat_title">投手</div><div class="TeamPlayersList"><div class="item"><div><div class="img"><span></span></div><div class="cont"><div class="name"><a href="/team/person?Acnt=0000000001">甲</a></div></div></div></div></div>'
  const [p] = parseTeamPage(html, { team: '中信兄弟', league: '一軍' })
  assert.equal(p.key, '0000000001')
  assert.equal('number' in p, false)
  assert.equal('photo' in p, false)
})

test('parsePersonPage reads header, hands and position', () => {
  // 個人頁是投打手/守位的唯一來源
  const p = parsePersonPage(fx('per_0000000667.html'))
  assert.equal(p.name, '彭政閔')
  assert.equal(p.number, '23')
  assert.equal(p.team, '中信兄弟')
  assert.equal(p.league, '一軍')
  assert.equal(p.pitching_hand, '右')
  assert.equal(p.batting_hand, '右')
  assert.equal(p.main_position, '1B')
  assert.equal(p.isPlayer, true)
  assert.match(p.photo, /^https:\/\/www\.cpbl\.com\.tw\/files\//)
  assert.equal(parsePersonPage(fx('per_0000007560.html')).name, '菲力士')
  assert.equal(parsePersonPage(fx('per_0000007560.html')).main_position, 'P')
})

test('parsePersonPage returns null for the homepage served on an invalid Acnt', () => {
  // 無效 Acnt 會被導向首頁；不能把首頁當球員解析
  assert.equal(parsePersonPage(fx('per_0000009999.html')), null)
})

test('parsePersonPage canonicalizes former team names', () => {
  // 退役球員頁首顯示當年隊名簡稱（Lamigo），需對到 TEAMS 的正式隊名，否則會成為未知隊名
  const p = parsePersonPage(fx('per_0000000064.html'))
  assert.equal(p.name, '陳金鋒')
  assert.equal(p.team, 'Lamigo桃猿')
})

test('parsePersonPage splits 二軍 suffix and marks staff pages as non-player', () => {
  // 球員頁沒有「投打習慣/位置」就是非球員，不能補預設的右投右打
  const staff = '<div class="PlayerBrief"><div><dl><dt><div class="team">富邦悍將二軍</div><div class="name">某教練<span class="number">70</span></div></dt><dd class="born"><div class="label">生日</div><div class="desc">1970/01/01</div></dd></dl></div></div>'
  const p = parsePersonPage(staff)
  assert.equal(p.team, '富邦悍將')
  assert.equal(p.league, '二軍')
  assert.equal(p.isPlayer, false)
  assert.equal(p.pitching_hand, undefined)
  assert.equal(p.main_position, undefined)
})

test('session captures __chtcdn from the 308, follows later redirects and replays the jar', async () => {
  // CDN 第一次回 308 + Set-Cookie，沒帶 cookie 後續請求會被擋
  const calls = []
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts })
    if (calls.length === 1) {
      return new Response('', { status: 308, headers: { location: '/', 'set-cookie': '__chtcdn=abc; Path=/; HttpOnly' } })
    }
    if (calls.length === 2) {
      return new Response('', { status: 302, headers: { location: '/team/done', 'set-cookie': 'XSRF=tok; Path=/' } })
    }
    return new Response('<html>ok</html>', { status: 200 })
  }
  const s = await createCpblSession({ fetchImpl: fakeFetch })
  assert.equal(calls[0].opts.redirect, 'manual')
  const r = await s.post('/team', 'ClubNo=ACN&KindCode=A')
  assert.equal(r.status, 200)
  assert.equal(r.html, '<html>ok</html>')
  assert.equal(r.url, 'https://www.cpbl.com.tw/team/done')
  assert.equal(calls.length, 3)
  assert.match(calls[1].opts.headers.Cookie, /__chtcdn=abc/)
  const last = calls.at(-1)
  assert.equal(last.opts.method, 'POST')
  assert.equal(last.opts.headers['Content-Type'], 'application/x-www-form-urlencoded')
  assert.match(last.opts.headers.Cookie, /__chtcdn=abc/)
  assert.match(last.opts.headers.Cookie, /XSRF=tok/)
  assert.match(last.opts.headers['User-Agent'], /Mozilla/)
})

test('session retries bootstrap when the CDN node skips the cookie, and still works via 308 later', async () => {
  // 實測 CDN 有時直接回 200 不發 cookie；不能因此整個失敗，後續請求被 308 時要能自行撿 cookie
  const calls = []
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts })
    if (calls.length <= 4) return new Response('', { status: 200 })
    if (!opts.headers.Cookie) return new Response('', { status: 308, headers: { location: '/team', 'set-cookie': '__chtcdn=zzz; Path=/' } })
    return new Response('real', { status: 200 })
  }
  const s = await createCpblSession({ fetchImpl: fakeFetch })
  assert.equal(calls.length, 4)
  const r = await s.post('/team', 'a=b')
  assert.equal(r.html, 'real')
  assert.equal(calls.at(-1).opts.method, 'POST')
  assert.equal(calls.at(-1).opts.body, 'a=b')
})
