import test from 'node:test'
import assert from 'node:assert/strict'
import {
  planNormalization, fileActions, renderGroups, pathConflicts, selectRefs, linkKey, median, toSharedLinkUrl, backupFileName,
  lookupTargets, evaluateLookups, ledgerStateOf,
} from './normalizePlan.mjs'

const T = -14
const L = (id, q = 'rlkey=K&dl=0') => `https://dl.dropboxusercontent.com/scl/fi/${id}/x.mp3?${q}`

test('intro uses the song gain so the intro→song seam has no level step', () => {
  // A different gain on the intro would make the volume jump when playback switches to the loop.
  const plan = planNormalization([
    { kind: 'song', ownerId: 1, url: 'u-song', lufs: -10 },
    { kind: 'intro', ownerId: 1, url: 'u-intro', lufs: -20 },
  ], T)
  assert.deepEqual(plan.map((p) => [p.url, p.gainDb]), [['u-song', -4], ['u-intro', -4]])
})

test('chants and the generic chant are gained individually even if they share an ownerId with a player', () => {
  // They are played on their own, so each must reach the target by itself.
  const plan = planNormalization([
    { kind: 'song', ownerId: 1, url: 'u-song', lufs: -10 },
    { kind: 'chant', ownerId: 1, url: 'u-chant', lufs: -18 },
    { kind: 'generic', ownerId: 'generic', url: 'u-gen', lufs: -12 },
  ], T)
  assert.deepEqual(plan.map((p) => p.gainDb), [-4, 4, -2])
})

test('a player with only an intro is normalized by its own loudness', () => {
  // No song to share with, so the intro must still be brought to the target.
  const [p] = planNormalization([{ kind: 'intro', ownerId: 7, url: 'u', lufs: -17 }], T)
  assert.equal(p.gainDb, 3)
})

test('the gain follows the target passed in, not a hard-coded value', () => {
  // TARGET_LUFS is still to be agreed with the user; the plan must follow whatever is chosen.
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

test('the same Dropbox file stored in different link forms has one identity', () => {
  // DB rows mix dl.dropboxusercontent.com/dl=0 and www.dropbox.com/raw=1; treating them as two files
  // would re-encode one file twice (gain applied twice).
  const k = linkKey('https://dl.dropboxusercontent.com/scl/fi/abc/48.mp3?rlkey=K&dl=0')
  assert.equal(linkKey('https://www.dropbox.com/scl/fi/abc/48.mp3?rlkey=K&dl=0&raw=1'), k)
  assert.equal(linkKey('https://www.dropbox.com/scl/fi/abc/48.mp3?rlkey=K&st=xyz&dl=0'), k)
  assert.notEqual(linkKey('https://www.dropbox.com/scl/fi/abc/48.mp3?rlkey=OTHER&dl=0'), k)
  assert.notEqual(linkKey('https://www.dropbox.com/scl/fi/def/48.mp3?rlkey=K&dl=0'), k)
})

test('a re-fetched link that differs only in st/dl/raw/host counts as unchanged', () => {
  // Otherwise every applied file would trigger a pointless DB rewrite of its references.
  const stored = 'https://dl.dropboxusercontent.com/scl/fi/abc/48.mp3?rlkey=K&dl=0'
  const refetched = 'https://www.dropbox.com/scl/fi/abc/48.mp3?rlkey=K&st=abc123&dl=0&raw=1'
  assert.equal(linkKey(refetched), linkKey(stored))
})

test('a file referenced in two link forms with the same gain is re-encoded once', () => {
  // One file, one re-encode: the gain must not be applied twice.
  const acts = fileActions([
    { kind: 'song', ownerId: 1, url: L('a'), gainDb: 2 },
    { kind: 'chant', ownerId: 'c', url: L('a', 'rlkey=K&dl=0&raw=1'), gainDb: 2 },
  ])
  assert.equal(acts.length, 1)
  assert.equal(acts[0].gainDb, 2)
  assert.equal(acts[0].refs.length, 2)
})

test('a file referenced twice with different gains is skipped instead of picking one arbitrarily', () => {
  // Either choice would leave one of the references off target or break a song/intro pair.
  const acts = fileActions([
    { kind: 'intro', ownerId: 1, url: L('a'), gainDb: 2 },
    { kind: 'song', ownerId: 2, url: L('a'), gainDb: -3 },
  ])
  assert.equal(acts[0].gainDb, null)
  assert.match(acts[0].skipped, /增益不一致/)
})

test('a skipped reference makes the whole file skipped', () => {
  // A file can only be re-encoded once; if any reference cannot be planned, leave it untouched.
  const acts = fileActions([
    { kind: 'song', ownerId: 1, url: L('a'), gainDb: 2 },
    { kind: 'chant', ownerId: 'c', url: L('a'), gainDb: null, skipped: 'x' },
  ])
  assert.equal(acts[0].gainDb, null)
})

test('a player song and intro are rendered as one group; chants are rendered alone', () => {
  // The pair needs one shared limiter ceiling, or the intro→song seam gets a level step.
  const acts = fileActions([
    { kind: 'song', ownerId: 1, url: L('s'), gainDb: 1 },
    { kind: 'chant', ownerId: 'c', url: L('c'), gainDb: 2 },
    { kind: 'intro', ownerId: 1, url: L('i'), gainDb: 1 },
  ])
  const groups = renderGroups(acts).map((g) => g.map((a) => a.key).sort())
  assert.deepEqual(groups, [[linkKey(L('i')), linkKey(L('s'))], [linkKey(L('c'))]])
})

test('an unmeasurable intro makes its song skipped too', () => {
  // Re-encoding only the song would leave the old intro level next to it at the seam.
  const acts = fileActions([
    { kind: 'song', ownerId: 1, url: L('s'), gainDb: 1 },
    { kind: 'intro', ownerId: 1, url: L('i'), gainDb: null, skipped: '404' },
  ])
  const [group] = renderGroups(acts)
  assert.equal(group.length, 2)
  for (const a of group) assert.ok(a.skipped)
})

test('two links resolving to the same Dropbox path are both flagged', () => {
  // Two links to one path would upload that path twice, stacking two re-encodes of different sources.
  const conflicts = pathConflicts([{ key: 'a', path: '/music/x.mp3' }, { key: 'b', path: '/music/x.mp3' }, { key: 'c', path: '/music/y.mp3' }])
  assert.deepEqual([...conflicts].sort(), ['a', 'b'])
})

test('apply looks up skipped and out-of-scope files too, and blocks a selected file sharing their path', () => {
  // Reverting to looking up only the planned/selected actions would miss these collisions.
  const allRefs = [
    { kind: 'song', ownerId: 1, url: L('ok') },
    { kind: 'chant', ownerId: 'c', url: L('bad') },
    { kind: 'song', ownerId: 9, url: L('other') },
    { kind: 'song', ownerId: 8, url: L('free') },
  ]
  const selected = selectRefs(allRefs, { only: '1' })
  const lufs = { ok: -10, bad: -10, other: -10, free: -10 }
  const plan = planNormalization([...selected, allRefs[1]].map((r) => ({ ...r, lufs: lufs[r.url.split('/')[5]] })), T)
  plan[1] = { ...plan[1], gainDb: null, skipped: '增益不一致' }
  const actions = fileActions(plan).filter((a) => !a.skipped)
  assert.deepEqual(actions.map((a) => a.key), [linkKey(L('ok'))])

  const targets = lookupTargets(allRefs)
  assert.deepEqual([...targets.keys()], allRefs.map((r) => linkKey(r.url)))

  const pathFor = { ok: '/music/same.mp3', bad: '/music/same.mp3', other: '/music/other.mp3', free: '/music/free.mp3' }
  const lookups = new Map([...targets].map(([key, url]) => [key, { path: pathFor[url.split('/')[5]] }]))
  const { abort, failures } = evaluateLookups(actions, lookups)
  assert.deepEqual(abort, [])
  assert.match(failures.get(linkKey(L('ok'))), /多個不同連結/)

  const sameAsUnselected = new Map(lookups)
  sameAsUnselected.set(linkKey(L('bad')), { path: '/music/bad.mp3' })
  sameAsUnselected.set(linkKey(L('other')), { path: '/music/same.mp3' })
  assert.ok(evaluateLookups(actions, sameAsUnselected).failures.has(linkKey(L('ok'))))
})

test('a selected file missing from the lookups aborts instead of uploading unchecked', () => {
  // Guards against a call site that forgets to look up the selected files themselves.
  const { abort } = evaluateLookups([{ key: 'k' }], new Map())
  assert.equal(abort.length, 1)
})

test('a selected dead link fails that file but does not abort the run', () => {
  // A dead selected link cannot be uploaded to; other files are still safe to process.
  const { abort, failures } = evaluateLookups([{ key: 'k' }], new Map([['k', { unresolvable: '分享連結已失效 404' }]]))
  assert.deepEqual(abort, [])
  assert.match(failures.get('k'), /失效/)
})

const refs = [
  { kind: 'song', ownerId: 1, url: L('s1') },
  { kind: 'intro', ownerId: 1, url: L('i1') },
  { kind: 'song', ownerId: 2, url: L('s2') },
  { kind: 'chant', ownerId: 'c', url: L('c') },
]

test('--only <player id> keeps that player song and intro together', () => {
  // A one-file trial on a pair still needs the song to compute the intro gain.
  assert.deepEqual(selectRefs(refs, { only: '1' }).map((r) => r.url), [L('s1'), L('i1')])
})

test('--only <url> matches the file in any link form and pulls in its pair partner', () => {
  // The trial URL may be pasted from the browser in a different form than stored in the DB.
  assert.deepEqual(selectRefs(refs, { only: 'https://www.dropbox.com/scl/fi/i1/x.mp3?rlkey=K&raw=1' }).map((r) => r.url), [L('s1'), L('i1')])
  assert.deepEqual(selectRefs(refs, { only: L('c') }).map((r) => r.url), [L('c')])
})

test('--limit counts a song+intro pair as one unit and no selection keeps everything', () => {
  // --limit 1 must not split a pair; omitting both flags keeps the default full run.
  assert.equal(selectRefs(refs, { limit: 1 }).length, 2)
  assert.equal(selectRefs(refs, { limit: 2 }).length, 3)
  assert.equal(selectRefs(refs, {}).length, 4)
})

test('--only on a player pulls in every other reference to that player files, so the gain check still runs', () => {
  // A file also used as a team chant must not be re-encoded with only the player-side view of it.
  const all = [
    { kind: 'song', ownerId: 1, url: L('s1') },
    { kind: 'intro', ownerId: 1, url: L('i1') },
    { kind: 'chant', ownerId: 'c', url: L('i1', 'rlkey=K&raw=1') },
    { kind: 'song', ownerId: 2, url: L('s2') },
  ]
  const sel = selectRefs(all, { only: '1' })
  assert.deepEqual(sel.map((r) => r.kind), ['song', 'intro', 'chant'])
  const lufs = { s1: -10, i1: -20, s2: -12 }
  const plan = planNormalization(sel.map((r) => ({ ...r, lufs: lufs[r.url.split('/')[5]] })), T)
  const shared = fileActions(plan).find((a) => a.key === linkKey(L('i1')))
  assert.match(shared.skipped, /增益不一致/)
})

test('selection closes transitively over shared files and player pairs', () => {
  // chant file = player 2 song, so player 2 intro must come too or its seam would get a level step.
  const all = [
    { kind: 'chant', ownerId: 'c', url: L('x') },
    { kind: 'song', ownerId: 2, url: L('x') },
    { kind: 'intro', ownerId: 2, url: L('i2') },
    { kind: 'song', ownerId: 3, url: L('s3') },
  ]
  assert.deepEqual(selectRefs(all, { only: L('x') }).map((r) => r.url), [L('x'), L('x'), L('i2')])
})

test('a ledger entry without state counts as done; uploaded stays needs-human', () => {
  // Dry run and --apply must agree, or a legacy entry would be shown as pending but skipped on apply.
  assert.equal(ledgerStateOf({ key: 'k' }), 'done')
  assert.equal(ledgerStateOf({ key: 'k', state: 'uploaded' }), 'uploaded')
  assert.equal(ledgerStateOf(undefined), undefined)
})

test('median of song LUFS ignores unmeasurable values and averages the middle pair', () => {
  // The median sets TARGET_LUFS; dead links (null) and silent files (-inf) must not skew it.
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

test('backup file names are stable per file and do not collide on equal basenames', () => {
  // Many legacy files share basenames like "48.mp3" in different team folders.
  const a = backupFileName('https://dl.dropboxusercontent.com/scl/fi/aaa/48.mp3?rlkey=1&dl=0')
  const b = backupFileName('https://dl.dropboxusercontent.com/scl/fi/bbb/48.mp3?rlkey=2&dl=0')
  assert.notEqual(a, b)
  assert.equal(a, backupFileName('https://www.dropbox.com/scl/fi/aaa/48.mp3?rlkey=1&dl=0&raw=1'))
  assert.match(a, /^[0-9a-f]{8}-48\.mp3$/)
  assert.match(backupFileName('https://www.dropbox.com/scl/fi/x/%E6%9E%97%E8%A5%84.mp3?raw=1'), /-林襄\.mp3$/)
})
