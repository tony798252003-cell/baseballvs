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

/**
 * Identity of the Dropbox file behind a shared link: the link id path plus rlkey. Host, dl/raw/st
 * and other params differ between stored forms of the same link, so they are ignored.
 * /scl/fi/<id>/<name> -> /scl/fi/<id>; legacy /s/<id>/<name> -> /s/<id>.
 */
export function linkKey(url) {
  const u = new URL(url)
  const parts = u.pathname.split('/').filter(Boolean)
  const idParts = parts[0] === 'scl' && parts[1] === 'fi' ? parts.slice(0, 3) : parts[0] === 's' ? parts.slice(0, 2) : parts
  return `/${idParts.join('/')}?rlkey=${u.searchParams.get('rlkey') ?? ''}`
}

// One action per Dropbox file (grouped by linkKey): a file referenced more than once is re-encoded
// once, and only when every reference agrees on the gain.
export function fileActions(plan) {
  const byKey = new Map()
  for (const p of plan) {
    const key = linkKey(p.url)
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(p)
  }
  return [...byKey].map(([key, refs]) => {
    const base = { key, url: refs[0].url, refs }
    const skippedRef = refs.find((r) => r.skipped)
    if (skippedRef) return { ...base, gainDb: null, skipped: skippedRef.skipped }
    const gains = new Set(refs.map((r) => r.gainDb.toFixed(2)))
    if (gains.size > 1) return { ...base, gainDb: null, skipped: `多處引用的增益不一致（${[...gains].join(' / ')} dB）` }
    return { ...base, gainDb: refs[0].gainDb }
  })
}

/**
 * Actions that must be rendered together with one limiter ceiling: a player's song and intro
 * (transitively, if files are shared). Everything else is its own group. Returns arrays of actions.
 * If any member is skipped the whole group is skipped: re-encoding only half a pair would put a
 * level step at the intro→song seam.
 */
export function renderGroups(actions) {
  const parent = actions.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const firstByPlayer = new Map()
  actions.forEach((a, i) => {
    for (const r of a.refs) {
      if (r.kind !== 'song' && r.kind !== 'intro') continue
      if (firstByPlayer.has(r.ownerId)) parent[find(i)] = find(firstByPlayer.get(r.ownerId))
      else firstByPlayer.set(r.ownerId, i)
    }
  })
  const groups = new Map()
  actions.forEach((a, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(a)
  })
  return [...groups.values()].map((g) => {
    const skippedMember = g.find((a) => a.skipped)
    if (!skippedMember) return g
    return g.map((a) => (a.skipped ? a : { ...a, gainDb: null, skipped: `同一球員的前奏版／循環版有檔案略過，整組略過（${skippedMember.skipped}）` }))
  })
}

// resolved: { action, path }[] -> Set of action keys whose Dropbox path is shared with another action.
export function pathConflicts(resolved) {
  const byPath = new Map()
  for (const { action, path } of resolved) {
    if (!byPath.has(path)) byPath.set(path, [])
    byPath.get(path).push(action.key)
  }
  return new Set([...byPath.values()].filter((keys) => keys.length > 1).flat())
}

/**
 * Narrows refs for a trial run. only: a player id (that player's song + intro) or a shared-link URL
 * (that file, plus the song/intro partner of any player using it, so the shared gain is still known).
 * limit: first n units, where a player's song + intro count as one unit.
 */
export function selectRefs(refs, { only, limit } = {}) {
  const unitOf = (r) => (r.kind === 'song' || r.kind === 'intro' ? `p:${r.ownerId}` : `f:${linkKey(r.url)}`)
  let selected = refs
  if (only) {
    const isPlayerId = /^\d+$/.test(only)
    const units = new Set(
      refs.filter((r) => (isPlayerId ? unitOf(r) === `p:${only}` : linkKey(r.url) === linkKey(only))).map(unitOf),
    )
    selected = refs.filter((r) => units.has(unitOf(r)))
  }
  if (limit != null) {
    const units = [...new Set(selected.map(unitOf))].slice(0, limit)
    selected = selected.filter((r) => units.includes(unitOf(r)))
  }
  return selected
}

export function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

// Shared-link form for Dropbox `sharing/get_shared_link_metadata`.
export function toSharedLinkUrl(url) {
  const u = new URL(url)
  u.hostname = 'www.dropbox.com'
  u.searchParams.delete('dl')
  u.searchParams.delete('raw')
  return u.toString()
}

// "<sha1(linkKey)[0..8]>-<basename>": stable across runs and link forms, unique even when basenames
// repeat across folders.
export function backupFileName(url) {
  const hash = createHash('sha1').update(linkKey(url)).digest('hex').slice(0, 8)
  const base = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'file.mp3').replace(/[/\\]/g, '_')
  return `${hash}-${base}`
}
