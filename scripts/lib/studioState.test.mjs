import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { batchName, loadState, saveState, mergePlayers } from './studioState.mjs'

const tmp = () => mkdtempSync(join(tmpdir(), 'studio-state-'))
const p = (id, name) => ({ id, name, team: '樂天桃猿', number: '7', main_position: 'OF' })

test('loadState on a missing file returns a fresh state (first run must not throw)', () => {
  const dir = tmp()
  try {
    assert.deepEqual(loadState('b1', dir), { batch: 'b1', cards: {} })
  } finally { rmSync(dir, { recursive: true }) }
})

test('round-trip preserves user edits (reopening the studio must resume work)', () => {
  const dir = tmp()
  try {
    const s = mergePlayers(loadState('b1', dir), [p('1', 'A')])
    s.cards['1'].status = 'resolved'
    s.cards['1'].A = 1.5
    s.cards['1'].sliderDb = -2
    saveState(s, dir)
    assert.deepEqual(loadState('b1', dir), s)
  } finally { rmSync(dir, { recursive: true }) }
})

test('mergePlayers adds new players with defaults (new roster rows need cards)', () => {
  const s = mergePlayers({ batch: 'b', cards: {} }, [p('1', 'A')])
  assert.deepEqual(s.cards['1'], {
    playerId: '1', name: 'A', team: '樂天桃猿', number: '7', position: 'OF',
    status: 'pending', candidates: [], chosen: 0, fadeMs: 60, sliderDb: 0, withIntro: false,
  })
})

test('mergePlayers keeps an edited card and drops nothing (edits must survive a re-run)', () => {
  const s = mergePlayers({ batch: 'b', cards: {} }, [p('1', 'A')])
  s.cards['1'].status = 'skipped'
  s.cards['1'].chosen = 2
  const m = mergePlayers(s, [p('2', 'B')])
  assert.equal(m.cards['1'].status, 'skipped')
  assert.equal(m.cards['1'].chosen, 2)
  assert.equal(m.cards['2'].status, 'pending')
  assert.deepEqual(Object.keys(m.cards).sort(), ['1', '2'])
})

test('atomic save leaves no .tmp file behind (crash-safe write must clean up)', () => {
  const dir = tmp()
  try {
    saveState({ batch: 'b1', cards: {} }, dir)
    assert.deepEqual(readdirSync(dir), ['b1.json'])
  } finally { rmSync(dir, { recursive: true }) }
})

test('batchName is stable regardless of team order (same batch must reopen same file)', () => {
  const a = batchName({ teams: ['樂天桃猿', '中信兄弟'], league: '一軍', org: 'CPBL' })
  const b = batchName({ teams: ['中信兄弟', '樂天桃猿'], league: '一軍', org: 'CPBL' })
  assert.equal(a, b)
  assert.notEqual(a, batchName({ teams: ['樂天桃猿'], league: '一軍', org: 'CPBL' }))
})
