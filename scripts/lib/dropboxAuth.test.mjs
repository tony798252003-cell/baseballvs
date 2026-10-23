import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { getDropboxAccessToken, _resetDropboxTokenCache } from './dropboxMusicSync.mjs'

const REFRESH_ENV = { DROPBOX_APP_KEY: 'key', DROPBOX_APP_SECRET: 'secret', DROPBOX_REFRESH_TOKEN: 'rt' }

function fakeFetch(tokens) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init })
    return { ok: true, json: async () => ({ access_token: tokens[calls.length - 1], expires_in: 14400 }) }
  }
  fn.calls = calls
  return fn
}

beforeEach(() => _resetDropboxTokenCache())

test('refreshes once with basic auth and reuses the cache (avoids hitting Dropbox on every upload)', async () => {
  const fetchImpl = fakeFetch(['t1', 't2'])
  const now = () => 1_000
  assert.equal(await getDropboxAccessToken({ env: REFRESH_ENV, fetchImpl, now }), 't1')
  assert.equal(await getDropboxAccessToken({ env: REFRESH_ENV, fetchImpl, now }), 't1')
  assert.equal(fetchImpl.calls.length, 1)
  const { url, init } = fetchImpl.calls[0]
  assert.equal(url, 'https://api.dropboxapi.com/oauth2/token')
  assert.equal(init.method, 'POST')
  assert.equal(init.headers.Authorization, 'Basic ' + Buffer.from('key:secret').toString('base64'))
  assert.equal(new URLSearchParams(init.body).get('grant_type'), 'refresh_token')
  assert.equal(new URLSearchParams(init.body).get('refresh_token'), 'rt')
})

test('refetches once within 60 s of expiry (token must not die mid-upload)', async () => {
  const fetchImpl = fakeFetch(['t1', 't2'])
  let t = 0
  const now = () => t
  await getDropboxAccessToken({ env: REFRESH_ENV, fetchImpl, now })
  t = (14400 - 61) * 1000
  assert.equal(await getDropboxAccessToken({ env: REFRESH_ENV, fetchImpl, now }), 't1')
  t = (14400 - 60) * 1000
  assert.equal(await getDropboxAccessToken({ env: REFRESH_ENV, fetchImpl, now }), 't2')
  assert.equal(fetchImpl.calls.length, 2)
})

test('falls back to the legacy DROPBOX_TOKEN without any network call', async () => {
  const fetchImpl = fakeFetch([])
  assert.equal(await getDropboxAccessToken({ env: { DROPBOX_TOKEN: 'legacy' }, fetchImpl }), 'legacy')
  assert.equal(fetchImpl.calls.length, 0)
})

test('throws an actionable message when no credentials are set', async () => {
  await assert.rejects(
    getDropboxAccessToken({ env: {}, fetchImpl: fakeFetch([]) }),
    { message: '缺少 Dropbox 授權，請執行 node scripts/dropbox-auth.mjs' },
  )
})

test('surfaces a failed refresh instead of caching garbage', async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, text: async () => 'invalid_grant' })
  await assert.rejects(getDropboxAccessToken({ env: REFRESH_ENV, fetchImpl }), /400/)
})
