import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  findBinary, parseEbur128, computeGainDb, TARGET_LUFS, buildRenderArgs,
  renderCut, renderPair, decodeDurationSec, decodePcm, measureLoudness,
} from './audioCut.mjs'

// Real stderr tail from `ffmpeg -i x.wav -af ebur128=peak=true -f null -` (ffmpeg 9.0.1).
const EBUR128_STDERR = `[Parsed_ebur128_0 @ 0x7f84d5405380] t: 29.999977  TARGET:-23 LUFS    M:  -9.7 S:  -9.8     I:  -9.8 LUFS       LRA:   0.1 LU  FTPK:  -9.0  -9.0 dBFS  TPK:  -9.0  -9.0 dBFS
[Parsed_ebur128_0 @ 0x7f84d5405380] Summary:

  Integrated loudness:
    I:          -9.8 LUFS
    Threshold: -19.8 LUFS

  Loudness range:
    LRA:         0.1 LU
    Threshold: -29.8 LUFS
    LRA low:    -9.9 LUFS
    LRA high:   -9.8 LUFS

  True peak:
    Peak:       -9.0 dBFS
[out#0/null @ 0x7f84d530f300] video:0KiB audio:5168KiB subtitle:0KiB other streams:0KiB global headers:0KiB muxing overhead: unknown
`

// Per-frame lines also contain "I:" and "TPK:"; gain must come from the final summary, not a running value.
test('parseEbur128 reads integrated loudness and true peak from the summary block', () => {
  assert.deepEqual(parseEbur128(EBUR128_STDERR), { integratedLufs: -9.8, truePeakDb: -9.0 })
})

// A silent/garbled run must not yield a NaN gain that ffmpeg would reject mid-render.
test('parseEbur128 throws when the summary is missing', () => {
  assert.throws(() => parseEbur128('ffmpeg: no such file'), /summary not found/)
})

// Gain brings the whole original to target, then the per-card slider nudges it.
test('computeGainDb = target - integrated + slider', () => {
  assert.equal(TARGET_LUFS, -12)
  assert.equal(computeGainDb({ integratedLufs: -20, sliderDb: 2 }), 10)
  assert.equal(computeGainDb({ integratedLufs: -10 }), -2)
})

// A near-silent source must not be boosted by 50+ dB (noise floor blown up into the limiter).
test('computeGainDb clamps to +-20 dB', () => {
  assert.equal(computeGainDb({ integratedLufs: -70 }), 20)
  assert.equal(computeGainDb({ integratedLufs: 30 }), -20)
})

// ebur128 reports -inf for silence; that must stop the render with a clear reason, not produce volume=infdB.
test('computeGainDb throws on non-finite loudness', () => {
  assert.throws(() => computeGainDb({ integratedLufs: -Infinity }), /silent or unreadable/)
  assert.throws(() => computeGainDb({ integratedLufs: NaN }), /silent or unreadable/)
})

// The render must apply gain, peak-limit to -1 dBTP, fade both ends and encode high-quality VBR with a gapless header.
test('buildRenderArgs contains volume, limiter, both fades, V0 and the Xing/LAME header', () => {
  const args = buildRenderArgs({ src: 'in.webm', out: 'out.mp3', start: 4, end: 20, fadeInMs: 100, fadeOutMs: 150, gainDb: 3.5 })
  const af = args[args.indexOf('-af') + 1]
  assert.match(af, /atrim=start=4:end=20/)
  assert.match(af, /volume=3\.5dB/)
  // Limiter runs 4x oversampled (true-peak aware) with a -2 dB ceiling, then back to 44.1 kHz.
  assert.match(af, /aresample=176400,alimiter=limit=0\.794328:level=false:latency=true,aresample=44100/)
  assert.match(af, /afade=t=in:st=0:d=0\.1/)
  assert.match(af, /afade=t=out:st=15\.85:d=0\.15/)
  assert.equal(args[args.indexOf('-q:a') + 1], '0')
  assert.equal(args[args.indexOf('-c:a') + 1], 'libmp3lame')
  assert.equal(args[args.indexOf('-write_xing') + 1], '1')
  assert.equal(args.at(-1), 'out.mp3')
})

// Whole-file mode is used to re-encode existing songs: no fade filters may touch the edges.
test('buildRenderArgs whole-file mode (no fades) emits no afade', () => {
  const args = buildRenderArgs({ src: 'old.mp3', out: 'new.mp3', start: 0, end: 61.2, fadeInMs: 0, fadeOutMs: 0, gainDb: -2 })
  const af = args[args.indexOf('-af') + 1]
  assert.doesNotMatch(af, /afade/)
  assert.match(af, /atrim=start=0:end=61\.2/)
})

// A fade longer than the cut would give afade a negative start and an overlapping fade-in/out.
test('buildRenderArgs clamps fades to half the cut', () => {
  const args = buildRenderArgs({ src: 'a', out: 'b', start: 1, end: 1.2, fadeInMs: 300, fadeOutMs: 300, gainDb: 0 })
  const af = args[args.indexOf('-af') + 1]
  const fin = af.match(/afade=t=in:st=([-\d.e]+):d=([-\d.e]+)/)
  const fout = af.match(/afade=t=out:st=([-\d.e]+):d=([-\d.e]+)/)
  assert.ok(Math.abs(Number(fin[2]) - 0.1) < 1e-9, af)
  assert.ok(Math.abs(Number(fout[2]) - 0.1) < 1e-9, af)
  assert.ok(Number(fout[1]) >= 0 && Math.abs(Number(fout[1]) + Number(fout[2]) - 0.2) < 1e-9, af)
})

// A non-executable file (or directory) named like the binary on PATH must not be picked over a real one.
test('findBinary skips non-executable PATH entries', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'findbin-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const fake = join(dir, 'ffmpeg')
  writeFileSync(fake, 'not a binary', { mode: 0o644 })
  mkdirSync(join(dir, 'yt-dlp'))
  const oldPath = process.env.PATH
  process.env.PATH = dir
  try {
    for (const name of ['ffmpeg', 'yt-dlp']) {
      let found = null
      try { found = findBinary(name) } catch (e) { assert.match(e.message, /not found/) }
      assert.notEqual(found, join(dir, name))
    }
  } finally {
    process.env.PATH = oldPath
  }
})

let ffmpegMissing = false
try { findBinary('ffmpeg') } catch (e) { ffmpegMissing = `ffmpeg not available, skipping integration: ${e.message}` }

function makeSignal(dir, name, amp) {
  // 30 s, 2 s repeating pattern (220 Hz then 440 Hz), stereo 44.1 kHz.
  const out = join(dir, name)
  const r = spawnSync(findBinary('ffmpeg'), ['-hide_banner', '-y', '-f', 'lavfi', '-i',
    `aevalsrc=${amp}*sin(2*PI*(220+220*floor(mod(t\\,2)))*t):s=44100:d=30`, '-ac', '2', '-c:a', 'pcm_s16le', out])
  assert.equal(r.status, 0, r.stderr?.toString())
  return out
}

test('integration: rendered song/intro decode to exact cut lengths and peaks stay under -1 dBTP', { skip: ffmpegMissing }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'audiocut-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const src = makeSignal(dir, 'src.wav', 0.5)

  // A seam of >10 ms (mp3 delay/padding) would be audible when the song loops; decoders must yield exactly B-A.
  await t.test('renderPair lengths are gapless within 10 ms', async () => {
    const { songPath, introPath } = await renderPair({ src, outDir: join(dir, 'pair'), A: 4, B: 20, fadeMs: 100, gainDb: 0, withIntro: true })
    const song = await decodeDurationSec(songPath)
    const intro = await decodeDurationSec(introPath)
    assert.ok(Math.abs(song - 16) <= 0.01, `song decoded ${song}s`)
    assert.ok(Math.abs(intro - 20) <= 0.01, `intro decoded ${intro}s`)
    // Cross-check by counting decoded samples, independent of ffmpeg's progress clock.
    const pcm = await decodePcm(songPath, 11025)
    assert.ok(Math.abs(pcm.length / 11025 - 16) <= 0.01, `song pcm ${pcm.length / 11025}s`)
  })

  // Without 有前奏 no intro file is produced, so an existing DB intro is never replaced.
  await t.test('renderPair without intro returns introPath null', async () => {
    const { introPath } = await renderPair({ src, outDir: join(dir, 'nointro'), A: 4, B: 20, fadeMs: 0, gainDb: 0, withIntro: false })
    assert.equal(introPath, null)
  })

  // Loud sources plus positive gain must not clip on playback. Clipped wideband noise and an HF square wave
  // have inter-sample peaks and mp3-encoder overshoot that a plain sample-peak limiter lets through.
  for (const [name, lavfi] of [
    ['clipped white noise', 'anoisesrc=a=1:c=white:d=30:r=44100,volume=12dB'],
    ['3 kHz square', 'aevalsrc=0.99*sgn(sin(2*PI*3000*t)):s=44100:d=30'],
  ]) {
    await t.test(`true peak of ${name} after +6 dB stays <= -1 dBTP (+0.2)`, async () => {
      const wav = join(dir, `${name}.wav`)
      const r = spawnSync(findBinary('ffmpeg'), ['-hide_banner', '-y', '-f', 'lavfi', '-i', lavfi, '-ac', '2', '-c:a', 'pcm_s16le', wav])
      assert.equal(r.status, 0, r.stderr?.toString())
      const out = join(dir, `${name}.mp3`)
      await renderCut({ src: wav, out, start: 4, end: 20, fadeInMs: 100, fadeOutMs: 100, gainDb: 6 })
      const { truePeakDb } = await measureLoudness(out)
      assert.ok(truePeakDb <= -1.0 + 0.2, `true peak ${truePeakDb} dBTP`)
      assert.ok(Math.abs((await decodeDurationSec(out)) - 16) <= 0.01)
    })
  }

  // Intro plays straight into the song: if only the intro got a lower limiter ceiling the seam would jump in level.
  await t.test('renderPair limits intro and song with one shared ceiling when only the intro is hot', async () => {
    const hot = join(dir, 'hot-intro.wav')
    // 0-4 s full-scale random square noise (pre-A), then a moderate 440 Hz tone.
    const r = spawnSync(findBinary('ffmpeg'), ['-hide_banner', '-y', '-f', 'lavfi', '-i',
      'aevalsrc=if(lt(t\\,4)\\,sgn(random(0)-0.5)\\,0.3*sin(2*PI*440*t)):s=44100:d=30', '-ac', '2', '-c:a', 'pcm_s16le', hot])
    assert.equal(r.status, 0, r.stderr?.toString())
    const songOnly = await renderPair({ src: hot, outDir: join(dir, 'hot-song'), A: 4, B: 20, fadeMs: 100, gainDb: 6, withIntro: false })
    const pair = await renderPair({ src: hot, outDir: join(dir, 'hot-pair'), A: 4, B: 20, fadeMs: 100, gainDb: 6, withIntro: true })
    // The song alone never needs a retry; with the hot intro the shared ceiling must drop for both files.
    assert.equal(songOnly.ceilingDb, -2)
    assert.ok(pair.ceilingDb < -2, `pair ceiling ${pair.ceilingDb}`)
    for (const f of [pair.songPath, pair.introPath]) {
      const { truePeakDb } = await measureLoudness(f)
      assert.ok(truePeakDb <= -1.0 + 0.2, `${f} true peak ${truePeakDb}`)
    }
  })

  // Whole-file re-encode of an existing song must keep its length (no added delay/padding).
  await t.test('whole-file re-encode keeps duration', async () => {
    const out = join(dir, 'whole.mp3')
    await renderCut({ src, out, start: 0, end: 30, fadeInMs: 0, fadeOutMs: 0, gainDb: -3 })
    const d = await decodeDurationSec(out)
    assert.ok(Math.abs(d - 30) <= 0.01, `whole decoded ${d}s`)
    const again = join(dir, 'whole2.mp3')
    await renderCut({ src: out, out: again, start: 0, end: d, fadeInMs: 0, fadeOutMs: 0, gainDb: 0 })
    const d2 = await decodeDurationSec(again)
    assert.ok(Math.abs(d2 - 30) <= 0.01, `mp3→mp3 re-encode decoded ${d2}s`)
  })
})
