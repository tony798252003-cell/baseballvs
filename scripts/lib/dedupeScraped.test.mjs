import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dropShadowedCoaches } from './dedupeScraped.mjs'

test('drops the coach entry of a player-coach so the sync does not insert a second row for one person', () => {
  const player = { name: '林哲瑄', team: '富邦悍將', key: '0000003339', is_coach: false }
  const coach = { name: '林哲瑄', team: '富邦悍將', key: null, is_coach: true }
  const r = dropShadowedCoaches([player, coach])
  assert.deepEqual(r, { kept: [player], dropped: [coach] })
})

test('keeps a same-name coach on a different team and coaches with no keyed twin', () => {
  // same name on another team is a different person
  const rows = [
    { name: '林哲瑄', team: '富邦悍將', key: '1', is_coach: false },
    { name: '林哲瑄', team: '統一獅', key: null, is_coach: true },
    { name: '王教練', team: '富邦悍將', key: null, is_coach: true },
  ]
  assert.equal(dropShadowedCoaches(rows).dropped.length, 0)
})
