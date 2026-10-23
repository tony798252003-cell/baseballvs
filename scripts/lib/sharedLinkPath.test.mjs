import test from 'node:test'
import assert from 'node:assert/strict'
import { lookupPaths, sharedLinkPath } from './sharedLinkPath.mjs'
import { evaluateLookups } from './normalizePlan.mjs'

const URL_A = 'https://dl.dropboxusercontent.com/scl/fi/a/x.mp3?rlkey=K&dl=0'
const URL_B = 'https://dl.dropboxusercontent.com/scl/fi/b/y.mp3?rlkey=K&dl=0'

function res(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => headers[h.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }
}

// Scripted fake fetch: each call shifts the next response (or a function of the request body).
function fakeFetch(script) {
  const calls = []
  const impl = async (url, init) => {
    calls.push(JSON.parse(init.body).url)
    const next = typeof script === 'function' ? script(JSON.parse(init.body).url) : script.shift()
    if (next instanceof Error) throw next
    return next
  }
  return { impl, calls }
}

test('a 429 is retried after Retry-After and then resolves', async () => {
  // Dropbox rate-limits bursts; one 429 must not turn into a failed (or aborted) apply.
  const slept = []
  const { impl, calls } = fakeFetch([res(429, 'too_many_requests', { 'retry-after': '2' }), res(200, { path_lower: '/music/x.mp3' })])
  const { path } = await sharedLinkPath('t', URL_A, { fetchImpl: impl, sleep: async (ms) => slept.push(ms) })
  assert.equal(path, '/music/x.mp3')
  assert.equal(calls.length, 2)
  assert.deepEqual(slept, [2000])
  assert.equal(calls[0], 'https://www.dropbox.com/scl/fi/a/x.mp3?rlkey=K')
})

test('a persistent 500 is retried a bounded number of times and then thrown', async () => {
  // Retrying forever would hang the run; giving up must surface as an error, not a dead link.
  const { impl, calls } = fakeFetch(() => res(500, 'internal'))
  await assert.rejects(sharedLinkPath('t', URL_A, { fetchImpl: impl, sleep: async () => {} }), /500/)
  assert.equal(calls.length, 4)
})

test('persistent 500 on an unselected file aborts --apply; a 404 on an unselected file is only listed', async () => {
  // A failed lookup could hide a path conflict, so nothing may be uploaded; a dead link cannot conflict.
  const sleep = async () => {}
  const actions = [{ key: '/scl/fi/a?rlkey=K' }]
  const targets = new Map([['/scl/fi/a?rlkey=K', URL_A], ['/scl/fi/b?rlkey=K', URL_B]])

  const flaky = fakeFetch((u) => (u.includes('/a/') ? res(200, { path_lower: '/music/x.mp3' }) : res(500, 'internal')))
  const aborted = evaluateLookups(actions, await lookupPaths('t', targets, { fetchImpl: flaky.impl, sleep }))
  assert.equal(aborted.abort.length, 1)
  assert.match(aborted.abort[0], /\/scl\/fi\/b/)

  const dead = fakeFetch((u) => (u.includes('/a/') ? res(200, { path_lower: '/music/x.mp3' }) : res(409, { error_summary: 'shared_link_not_found/..' })))
  const ok = evaluateLookups(actions, await lookupPaths('t', targets, { fetchImpl: dead.impl, sleep }))
  assert.deepEqual(ok.abort, [])
  assert.equal(ok.failures.size, 0)
  assert.deepEqual(ok.ignored.map((i) => i.key), ['/scl/fi/b?rlkey=K'])

  const notFound = fakeFetch((u) => (u.includes('/a/') ? res(200, { path_lower: '/music/x.mp3' }) : res(404, 'not found')))
  assert.deepEqual(evaluateLookups(actions, await lookupPaths('t', targets, { fetchImpl: notFound.impl, sleep })).abort, [])
})

test('lookups are spaced out so ~200 calls do not burst the API', async () => {
  // A small gap between lookups keeps a full run well under Dropbox rate limits.
  const slept = []
  const { impl } = fakeFetch(() => res(200, { path_lower: '/p' }))
  await lookupPaths('t', new Map([['a', URL_A], ['b', URL_B]]), { fetchImpl: impl, sleep: async (ms) => slept.push(ms) })
  assert.deepEqual(slept, [100])
})

test('a 409 shared_link_access_denied is unresolvable (listed), not an abort; a 429 still aborts', async () => {
  // A private/foreign link cannot be uploaded to nor collide with our paths; only transient failures hide conflicts.
  const sleep = async () => {}
  const actions = [{ key: '/scl/fi/a?rlkey=K' }]
  const targets = new Map([['/scl/fi/a?rlkey=K', URL_A], ['/scl/fi/b?rlkey=K', URL_B]])
  const denied = fakeFetch((u) => (u.includes('/a/') ? res(200, { path_lower: '/music/x.mp3' }) : res(409, { error_summary: 'shared_link_access_denied/..' })))
  const ok = evaluateLookups(actions, await lookupPaths('t', targets, { fetchImpl: denied.impl, sleep }))
  assert.deepEqual(ok.abort, [])
  assert.deepEqual(ok.ignored.map((i) => i.key), ['/scl/fi/b?rlkey=K'])
  const limited = fakeFetch((u) => (u.includes('/a/') ? res(200, { path_lower: '/music/x.mp3' }) : res(429, 'too_many_requests')))
  assert.equal(evaluateLookups(actions, await lookupPaths('t', targets, { fetchImpl: limited.impl, sleep })).abort.length, 1)
})

test('upload path keeps path_display case while conflicts/ledger use path_lower', async () => {
  // Uploading to path_lower would recreate the file under a lower-cased name/folder in Dropbox.
  const { impl } = fakeFetch(() => res(200, { path_lower: '/music/players/a b.mp3', path_display: '/Music/Players/A B.mp3' }))
  const lookups = await lookupPaths('t', new Map([['k', URL_A]]), { fetchImpl: impl, sleep: async () => {} })
  const { pathOf, uploadPathOf } = evaluateLookups([{ key: 'k' }], lookups)
  assert.equal(pathOf.get('k'), '/music/players/a b.mp3')
  assert.equal(uploadPathOf.get('k'), '/Music/Players/A B.mp3')
})
