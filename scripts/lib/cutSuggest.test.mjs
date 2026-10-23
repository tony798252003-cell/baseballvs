import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { suggestCut } from './cutSuggest.mjs'
import { decodePcm, findBinary } from './audioCut.mjs'

const SR = 11025

// Deterministic PRNG so the synthetic signals are identical on every run.
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// A 16 s "chant" loop: 8 bars of 4 beats at 120 BPM. Each beat gets its own pitch/level and
// some get an off-beat hit, so no sub-period shorter than 16 s repeats exactly.
function loopPattern() {
  const r = rng(42)
  const hits = []
  for (let beat = 0; beat < 32; beat++) {
    const t = beat * 0.5
    hits.push({ t, freq: 200 + Math.floor(r() * 8) * 250, amp: beat % 4 === 0 ? 0.9 : 0.4 + r() * 0.4 })
    if (r() < 0.4) hits.push({ t: t + 0.25, freq: 300 + Math.floor(r() * 8) * 300, amp: 0.3 + r() * 0.3 })
  }
  return hits
}

function synth({ leadIn, loops, loopSec = 16 }) {
  const total = leadIn + loops * loopSec
  const pcm = new Float32Array(Math.round(total * SR))
  const r = rng(7)
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = (r() * 2 - 1) * (i < leadIn * SR ? 0.3 : 0.002)
  }
  const hits = loopPattern()
  for (let k = 0; k < loops; k++) {
    for (const h of hits) {
      const start = Math.round((leadIn + k * loopSec + h.t) * SR)
      for (let j = 0; j < 0.12 * SR && start + j < pcm.length; j++) {
        pcm[start + j] += h.amp * Math.exp(-j / (0.025 * SR)) * Math.sin((2 * Math.PI * h.freq * j) / SR)
      }
    }
  }
  return pcm
}

test('noise lead-in + 16 s loop: A lands on the loop start so the intro version keeps the lead-in', () => {
  const cut = suggestCut(synth({ leadIn: 6.8, loops: 3 }), SR)
  assert.ok(Math.abs(cut.A - 6.8) <= 0.15, `A=${cut.A}`)
  assert.ok(Math.abs(cut.B - cut.A - 16) <= 0.15, `B-A=${cut.B - cut.A}`)
  assert.equal(cut.leadInSec, cut.A)
  assert.equal(cut.hasIntro, true)
  assert.ok(cut.confidence > 0.5, `confidence=${cut.confidence}`)
  assert.ok(cut.beats.length > 50, 'beats feed the UI 對齊鼓點 button')
  assert.ok(cut.beats.some((b) => Math.abs(b - 7.3) < 0.03), 'the second loop beat is found to within 30 ms')
})

test('loop from t=0: no intro is suggested, so 有前奏 stays unchecked', () => {
  const cut = suggestCut(synth({ leadIn: 0, loops: 3 }), SR)
  assert.ok(cut.A < 2, `A=${cut.A}`)
  assert.ok(Math.abs(cut.B - cut.A - 16) <= 0.15, `B-A=${cut.B - cut.A}`)
  assert.equal(cut.hasIntro, false)
})

test('pure noise: still returns a cut (never throws) but flags it as low confidence', () => {
  const r = rng(99)
  const pcm = new Float32Array(40 * SR).map(() => (r() * 2 - 1) * 0.3)
  const cut = suggestCut(pcm, SR)
  assert.ok(cut.confidence < 0.3, `confidence=${cut.confidence}`)
  assert.ok(cut.B > cut.A && cut.B <= 40.001)
  assert.equal(cut.hasIntro, false, 'a guessed A must not auto-check 有前奏')
})

// Steady 120 BPM drums: a 16-beat (8 s) drum half played twice per loop, optionally with a
// sustained high "vocal" layer on the second half (3.5 kHz+) and, with vocalBoth, a lower one
// (2.5 kHz+) on the first half; either way the true loop is 16 s, not 8 s.
// Every whole-beat lag lines up this drum grid, which is what fooled loudness-only matching.
function drumLoop({ leadIn, loops = 3, vocal = 0, vocalBoth = false, seed = 7 }) {
  const beat = 0.5
  const half = 16 * beat
  const total = leadIn + loops * 2 * half + 1
  const pcm = new Float32Array(Math.round(total * SR))
  const noise = rng(seed)
  for (let i = 0; i < pcm.length; i++) pcm[i] = (noise() * 2 - 1) * (i < leadIn * SR ? 0.3 : 0.002)
  const r = rng(42)
  const drum = Array.from({ length: 16 }, (_, b) => ({ t: b * beat, f: 200 + Math.floor(r() * 8) * 250, a: b % 4 === 0 ? 0.9 : 0.4 + r() * 0.4 }))
  const add = (start, f, a, dur, tau) => {
    for (let j = 0; j < dur * SR && start + j < pcm.length; j++) pcm[start + j] += a * Math.exp(-j / (tau * SR)) * Math.sin((2 * Math.PI * f * j) / SR)
  }
  for (let k = 0; k < loops; k++) {
    for (let h = 0; h < 2; h++) {
      const base = leadIn + (2 * k + h) * half
      for (const d of drum) add(Math.round((base + d.t) * SR), d.f, d.a, 0.12, 0.025)
      if (vocal && (h === 1 || vocalBoth)) {
        for (let b = 0; b < 16; b += 2) add(Math.round((base + b * beat) * SR), (h === 1 ? 3500 : 2500) + (b % 4) * 400, vocal, 1.5 * beat, 0.3)
      }
    }
  }
  return pcm
}

// A loud noise lead-in against a loud loop tail is "both loud", not "same sound"; A must stay
// at the loop start or the intro version loses (or gains) seconds of lead-in.
for (const leadIn of [6.8, 4]) {
  test(`loud ${leadIn} s lead-in before a steady-beat loop: A stays at the loop start`, () => {
    const cut = suggestCut(drumLoop({ leadIn, vocal: 0.5 }), SR)
    assert.ok(Math.abs(cut.A - leadIn) <= 0.3, `A=${cut.A}`)
    assert.ok(Math.abs(cut.B - cut.A - 16) <= 0.15, `B-A=${cut.B - cut.A}`)
    assert.equal(cut.hasIntro, true)
  })
}

// Halves that differ only in one band (the vocal layer) make 16 s the loop; 12 s or 14 s only
// line up the drum grid and would cut the chant mid-phrase.
for (const [label, opts] of [
  ['vocal on 2nd half, no lead-in', { leadIn: 0, vocal: 0.5 }],
  ['different vocal bands on each half, 4 s lead-in', { leadIn: 4, vocal: 0.5, vocalBoth: true }],
]) {
  test(`steady beat, halves differ by band (${label}): picks the 16 s loop, not 12 or 14 s`, () => {
    const cut = suggestCut(drumLoop(opts), SR)
    assert.ok(Math.abs(cut.B - cut.A - 16) <= 0.15, `B-A=${cut.B - cut.A}`)
    assert.equal(cut.hasIntro, opts.leadIn >= 2)
  })
}

// Identical 8 s halves: only multiples of 8 s are real repeats; 12 s (1.5 halves) is not.
test('identical 8 s drum halves: picks a real repeat (16 or 24 s), never 12 s', () => {
  const cut = suggestCut(drumLoop({ leadIn: 4 }), SR)
  const loop = cut.B - cut.A
  assert.ok([16, 24].some((l) => Math.abs(loop - l) <= 0.15), `B-A=${loop}`)
})

// One identical click every beat: every bar length is an equally good "loop", so the detector
// cannot decide and must say so instead of reporting a confident 12 s.
test('undecidable uniform beat: confidence stays below 0.5', () => {
  const r = rng(3)
  const pcm = new Float32Array(60 * SR)
  for (let i = 0; i < pcm.length; i++) pcm[i] = (r() * 2 - 1) * (i < 4 * SR ? 0.3 : 0.002)
  for (let t = 4; t < 59.8; t += 0.5) {
    const s = Math.round(t * SR)
    for (let j = 0; j < 0.12 * SR; j++) pcm[s + j] += 0.8 * Math.exp(-j / (0.025 * SR)) * Math.sin((2 * Math.PI * 700 * j) / SR)
  }
  const cut = suggestCut(pcm, SR)
  assert.ok(cut.confidence < 0.5, `confidence=${cut.confidence}`)
})

// The studio analyses ~1 min originals per card; the suggestion must not stall the pipeline.
test('60 s clip at 11025 Hz is analysed in under 1 s', () => {
  const pcm = drumLoop({ leadIn: 12, vocal: 0.5 }).subarray(0, 60 * SR)
  const t0 = performance.now()
  suggestCut(pcm, SR)
  assert.ok(performance.now() - t0 < 1000)
})

test('clip too short for any 12 s loop: returns the whole clip with zero confidence', () => {
  const cut = suggestCut(new Float32Array(5 * SR), SR)
  assert.equal(cut.A, 0)
  assert.ok(Math.abs(cut.B - 5) < 0.01)
  assert.equal(cut.confidence, 0)
  assert.equal(cut.hasIntro, false)
})

const CHANT = '/private/tmp/claude-501/-Users-tonywang-orca-workspaces-baseballvs-crayfish/aa44445e-59f6-43d2-abe9-aa0ce186f531/scratchpad/chant'
const REF_INTRO = join(CHANT, '354-intro.mp3') // user's hand-cut intro version = original 0 -> B
const REF_SONG = join(CHANT, '354-song.mp3') // user's hand-cut loop = original A -> B (A = 6.80 s)
function haveFfmpeg() {
  try {
    return Boolean(findBinary('ffmpeg'))
  } catch {
    return false
  }
}
const haveRef = existsSync(REF_INTRO) && existsSync(REF_SONG) && haveFfmpeg()

// The user's own hand cut is the ground truth. The intro file alone holds the loop only once, so
// intro + song rebuilds an original with lead-in + loop + loop (what a YouTube source looks like).
test('real reference 354: A and loop length match the user hand cut (A 6.80 s, loop 34.57 s)', { skip: !haveRef && 'reference mp3 or ffmpeg missing' }, async () => {
  const intro = await decodePcm(REF_INTRO, SR)
  const song = await decodePcm(REF_SONG, SR)
  const pcm = new Float32Array(intro.length + song.length)
  pcm.set(intro)
  pcm.set(song, intro.length)
  const cut = suggestCut(pcm, SR)
  assert.ok(Math.abs(cut.A - 6.8) <= 0.3, `A=${cut.A} B=${cut.B} conf=${cut.confidence}`)
  assert.ok(Math.abs(cut.B - cut.A - song.length / SR) <= 0.15, `B-A=${cut.B - cut.A}`)
  assert.equal(cut.hasIntro, true)
})
