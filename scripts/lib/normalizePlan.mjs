// scripts/lib/normalizePlan.mjs
// Pure planning helpers for scripts/normalize-music.mjs (existing music loudness normalization).
import { createHash } from 'node:crypto'
import { computeGainDb } from './audioCut.mjs'

function gainOrSkip(lufs, target) {
  try {
    return { gainDb: computeGainDb({ integratedLufs: lufs, target }) }
  } catch (e) {
    return { gainDb: null, skipped: e.message }
  }
}

/**
 * items: { kind: 'song'|'intro'|'chant'|'generic', ownerId, url, lufs }[]
 * Song and intro of the same player share the song's gain (an intro-only player uses its own);
 * chants and the generic chant are gained individually. Unmeasurable items get gainDb null + skipped.
 */
export function planNormalization(items, target) {
  const songLufs = new Map(items.filter((i) => i.kind === 'song').map((i) => [i.ownerId, i.lufs]))
  return items.map(({ kind, ownerId, url, lufs }) => {
    if (kind === 'intro' && songLufs.has(ownerId)) {
      const shared = gainOrSkip(songLufs.get(ownerId), target)
      if (shared.skipped) shared.skipped = `循環版無法量測，前奏版一併略過（${shared.skipped}）`
      return { ownerId, kind, url, ...shared }
    }
    return { ownerId, kind, url, ...gainOrSkip(lufs, target) }
  })
}

// One action per file: a file referenced more than once is re-encoded once, and only when every
// reference agrees on the gain.
export function fileActions(plan) {
  const byUrl = new Map()
  for (const p of plan) {
    if (!byUrl.has(p.url)) byUrl.set(p.url, [])
    byUrl.get(p.url).push(p)
  }
  return [...byUrl].map(([url, refs]) => {
    const skippedRef = refs.find((r) => r.skipped)
    if (skippedRef) return { url, refs, gainDb: null, skipped: skippedRef.skipped }
    const gains = new Set(refs.map((r) => r.gainDb.toFixed(2)))
    if (gains.size > 1) return { url, refs, gainDb: null, skipped: `多處引用的增益不一致（${[...gains].join(' / ')} dB）` }
    return { url, refs, gainDb: refs[0].gainDb }
  })
}

export function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

// Canonical shared-link form for Dropbox `sharing/get_shared_link_metadata` and for comparing links.
export function toSharedLinkUrl(url) {
  const u = new URL(url)
  u.hostname = 'www.dropbox.com'
  u.searchParams.delete('dl')
  u.searchParams.delete('raw')
  return u.toString()
}

// "<sha1(url)[0..8]>-<basename>": stable across runs, unique even when basenames repeat across folders.
export function backupFileName(url) {
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 8)
  const base = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'file.mp3').replace(/[/\\]/g, '_')
  return `${hash}-${base}`
}
