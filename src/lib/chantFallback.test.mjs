import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickFallbackChant } from './chantFallback.js'

const chants = [
  { team: '中信兄弟', name: 'a', url: 'http://x/a.mp3' },
  { team: '中信兄弟', name: 'b', url: 'http://x/b.mp3' },
  { team: '統一7-ELEVEn獅', name: 'c', url: 'http://x/c.mp3' },
]

// 球員本隊有嗆斯曲時優先用本隊的，不可被後繼隊或通用曲蓋掉
test('own team chants win over successor and generic', () => {
  const r = pickFallbackChant({ team: '中信兄弟' }, chants, 'http://g', () => 0)
  assert.deepEqual(r, { kind: 'team', url: 'http://x/a.mp3' })
})

// 歷史球隊（兄弟象）沒有自己的嗆斯曲，應沿用同球團現役隊的
test('defunct team falls back to successor chants', () => {
  const r = pickFallbackChant({ team: '兄弟象' }, chants, 'http://g', () => 0.99)
  assert.deepEqual(r, { kind: 'successor', url: 'http://x/b.mp3' })
})

// 非中職球員沒有任何球隊曲時，才用通用嗆斯曲
test('no team or successor chants uses generic url', () => {
  const r = pickFallbackChant({ team: '讀賣巨人' }, chants, 'http://g')
  assert.deepEqual(r, { kind: 'generic', url: 'http://g' })
})

test('nothing available returns null', () => {
  assert.equal(pickFallbackChant({ team: '讀賣巨人' }, chants, ''), null)
  assert.equal(pickFallbackChant({ team: '讀賣巨人' }, chants, undefined), null)
  assert.equal(pickFallbackChant({ team: '讀賣巨人' }, [], null), null)
})

test('random stub picks deterministic index', () => {
  assert.equal(pickFallbackChant({ team: '中信兄弟' }, chants, '', () => 0.5).url, 'http://x/b.mp3')
})
