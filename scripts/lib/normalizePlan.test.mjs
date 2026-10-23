import test from 'node:test'
import assert from 'node:assert/strict'
import { planNormalization, fileActions, median, toSharedLinkUrl, backupFileName } from './normalizePlan.mjs'

const T = -14

test('intro uses the song gain so the intro→song seam has no level step', () => {
  const plan = planNormalization([
    { kind: 'song', ownerId: 1, url: 'u-song', lufs: -10 },
    { kind: 'intro', ownerId: 1, url: 'u-intro', lufs: -20 },
  ], T)
  assert.deepEqual(plan.map((p) => [p.url, p.gainDb]), [['u-song', -4], ['u-intro', -4]])
})

test('chants and the generic chant are gained individually even if they share an ownerId with a player', () => {
  const plan = planNormalization([
    { kind: 'song', ownerId: 1, url: 'u-song', lufs: -10 },
    { kind: 'chant', ownerId: 1, url: 'u-chant', lufs: -18 },
    { kind: 'generic', ownerId: 'generic', url: 'u-gen', lufs: -12 },
  ], T)
  assert.deepEqual(plan.map((p) => p.gainDb), [-4, 4, -2])
})

test('a player with only an intro is normalized by its own loudness', () => {
  const [p] = planNormalization([{ kind: 'intro', ownerId: 7, url: 'u', lufs: -17 }], T)
  assert.equal(p.gainDb, 3)
})

test('the gain follows the target passed in, not a hard-coded value', () => {
  const [p] = planNormalization([{ kind: 'song', ownerId: 1, url: 'u', lufs: -16 }], -12)
  assert.equal(p.gainDb, 4)
})

test('a silent/unreadable song is skipped, and its intro is skipped too rather than gained alone', () => {
  // Re-encoding only the intro would create the level step at the seam that the shared gain prevents.
  const plan = planNormalization([
    { kind: 'song', ownerId: 1, url: 'u-song', lufs: -Infinity },
    { kind: 'intro', ownerId: 1, url: 'u-intro', lufs: -15 },
    { kind: 'chant', ownerId: 'c', url: 'u-chant', lufs: null },
  ], T)
  assert.equal(plan.length, 3)
  for (const p of plan) {
    assert.equal(p.gainDb, null)
    assert.ok(p.skipped)
  }
})

test('a file referenced twice with the same gain is re-encoded once', () => {
  const acts = fileActions([
    { kind: 'song', ownerId: 1, url: 'u', gainDb: 2 },
    { kind: 'chant', ownerId: 'c', url: 'u', gainDb: 2 },
  ])
  assert.equal(acts.length, 1)
  assert.equal(acts[0].gainDb, 2)
  assert.equal(acts[0].refs.length, 2)
})

test('a file referenced twice with different gains is skipped instead of picking one arbitrarily', () => {
  const acts = fileActions([
    { kind: 'intro', ownerId: 1, url: 'u', gainDb: 2 },
    { kind: 'song', ownerId: 2, url: 'u', gainDb: -3 },
  ])
  assert.equal(acts[0].gainDb, null)
  assert.match(acts[0].skipped, /增益不一致/)
})

test('a skipped reference makes the whole file skipped', () => {
  const acts = fileActions([
    { kind: 'song', ownerId: 1, url: 'u', gainDb: 2 },
    { kind: 'chant', ownerId: 'c', url: 'u', gainDb: null, skipped: 'x' },
  ])
  assert.equal(acts[0].gainDb, null)
})

test('median of song LUFS ignores unmeasurable values and averages the middle pair', () => {
  assert.equal(median([-10, -Infinity, -14, -12, null, -16]), -13)
  assert.equal(median([-9]), -9)
  assert.equal(median([]), null)
})

test('shared-link URL for the Dropbox API drops dl/raw and the download host but keeps rlkey', () => {
  // dl.dropboxusercontent.com is how most DB rows store links; the API wants the www.dropbox.com form.
  assert.equal(
    toSharedLinkUrl('https://dl.dropboxusercontent.com/scl/fi/abc/48.mp3?rlkey=K&dl=0'),
    'https://www.dropbox.com/scl/fi/abc/48.mp3?rlkey=K',
  )
  assert.equal(
    toSharedLinkUrl('https://www.dropbox.com/scl/fi/abc/48.mp3?rlkey=K&dl=0&raw=1'),
    'https://www.dropbox.com/scl/fi/abc/48.mp3?rlkey=K',
  )
})

test('backup file names are stable per URL and do not collide on equal basenames', () => {
  // Many legacy files share basenames like "48.mp3" in different team folders.
  const a = backupFileName('https://dl.dropboxusercontent.com/scl/fi/aaa/48.mp3?rlkey=1&dl=0')
  const b = backupFileName('https://dl.dropboxusercontent.com/scl/fi/bbb/48.mp3?rlkey=2&dl=0')
  assert.notEqual(a, b)
  assert.equal(a, backupFileName('https://dl.dropboxusercontent.com/scl/fi/aaa/48.mp3?rlkey=1&dl=0'))
  assert.match(a, /^[0-9a-f]{8}-48\.mp3$/)
  assert.match(backupFileName('https://www.dropbox.com/scl/fi/x/%E6%9E%97%E8%A5%84.mp3?raw=1'), /-林襄\.mp3$/)
})
