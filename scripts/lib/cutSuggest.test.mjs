import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { suggestCut } from './cutSuggest.mjs'

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
const FFMPEG = join(homedir(), 'bin', 'ffmpeg')
const haveRef = existsSync(REF_INTRO) && existsSync(REF_SONG) && existsSync(FFMPEG)

function decode(file) {
  const buf = execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 64 * 1024 * 1024 })
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}

// The user's own hand cut is the ground truth. The intro file alone holds the loop only once, so
// intro + song rebuilds an original with lead-in + loop + loop (what a YouTube source looks like).
test('real reference 354: A and loop length match the user hand cut (A 6.80 s, loop 34.57 s)', { skip: !haveRef && 'reference mp3 or ffmpeg missing' }, () => {
  const intro = decode(REF_INTRO)
  const song = decode(REF_SONG)
  const pcm = new Float32Array(intro.length + song.length)
  pcm.set(intro)
  pcm.set(song, intro.length)
  const cut = suggestCut(pcm, SR)
  assert.ok(Math.abs(cut.A - 6.8) <= 0.3, `A=${cut.A} B=${cut.B} conf=${cut.confidence}`)
  assert.ok(Math.abs(cut.B - cut.A - song.length / SR) <= 0.15, `B-A=${cut.B - cut.A}`)
  assert.equal(cut.hasIntro, true)
})
