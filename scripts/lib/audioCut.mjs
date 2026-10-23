// scripts/lib/audioCut.mjs
// ffmpeg-based loudness measurement, gain and gapless mp3 cut rendering for the chant studio.
import { spawn } from 'node:child_process'
import { accessSync, constants, mkdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, delimiter } from 'node:path'

export const TARGET_LUFS = -14
// Requirement: true peak <= -1 dBTP. The limiter runs 4x oversampled and aims lower to absorb
// resampling and mp3 encoder overshoot. -2 dB covers HF square waves and pink noise; pathological
// wideband material (clipped white noise) overshoots ~2.5 dB in the encoder, so renderCut measures
// the result and re-renders with a lower ceiling when needed.
export const TRUE_PEAK_MAX_DB = -1
const LIMITER_CEILING_DB = -2
const CEILING_RETRY_MARGIN_DB = 0.3
const MAX_RENDER_ATTEMPTS = 3
const OUTPUT_RATE = 44100
const MAX_GAIN_DB = 20

const FALLBACKS = {
  ffmpeg: join(homedir(), 'bin', 'ffmpeg'),
  'yt-dlp': join(homedir(), '.local', 'bin', 'yt-dlp'),
}

const INSTALL_HINTS = {
  ffmpeg: 'install ffmpeg (e.g. `brew install ffmpeg`, or put a static build at ~/bin/ffmpeg)',
  'yt-dlp': 'install yt-dlp (e.g. `brew install yt-dlp`, or put it at ~/.local/bin/yt-dlp)',
}

function isExecutableFile(path) {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}

export function findBinary(name) {
  if (!FALLBACKS[name]) throw new Error(`unknown binary: ${name}`)
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (dir && isExecutableFile(join(dir, name))) return join(dir, name)
  }
  if (isExecutableFile(FALLBACKS[name])) return FALLBACKS[name]
  throw new Error(`${name} not found on PATH or at ${FALLBACKS[name]}; ${INSTALL_HINTS[name]}`)
}

// Runs ffmpeg; resolves { stdout: Buffer, stderr: string }, rejects on non-zero exit.
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(findBinary('ffmpeg'), ['-hide_banner', '-nostdin', ...args])
    const out = []
    let stderr = ''
    proc.stdout.on('data', (d) => out.push(d))
    proc.stderr.on('data', (d) => { stderr += d })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr })
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`))
    })
  })
}

// Reads the "Summary:" block printed by `-af ebur128=peak=true`.
export function parseEbur128(stderr) {
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'))
  const i = summary.match(/Integrated loudness:\s*I:\s*(-?[\d.]+|-inf)\s*LUFS/)
  const p = summary.match(/True peak:\s*Peak:\s*(-?[\d.]+|-inf)\s*dBFS/)
  if (!i || !p) throw new Error('ebur128 summary not found in ffmpeg output')
  const num = (s) => (s === '-inf' ? -Infinity : Number(s))
  return { integratedLufs: num(i[1]), truePeakDb: num(p[1]) }
}

export async function measureLoudness(file) {
  const { stderr } = await runFfmpeg(['-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'])
  return parseEbur128(stderr)
}

// Clamped to +-MAX_GAIN_DB so a near-silent source cannot be blown up by tens of dB.
export function computeGainDb({ integratedLufs, sliderDb = 0, target = TARGET_LUFS }) {
  if (!Number.isFinite(integratedLufs)) {
    throw new Error(`cannot compute gain: integrated loudness is ${integratedLufs} (silent or unreadable source)`)
  }
  const gain = target - integratedLufs + sliderDb
  return Math.min(MAX_GAIN_DB, Math.max(-MAX_GAIN_DB, gain))
}

// start/end are seconds in the original; fades are linear (afade default curve is "tri" = linear).
// Each fade is clamped to half the cut so fades never overlap or start before 0.
// Whole-file re-encode: start 0, end = duration, fadeInMs = fadeOutMs = 0.
// Output is always 44.1 kHz (the limiter's 4x oversampling resamples anyway).
export function buildRenderArgs({ src, out, start, end, fadeInMs = 0, fadeOutMs = 0, gainDb = 0, ceilingDb = LIMITER_CEILING_DB }) {
  const dur = end - start
  if (!(dur > 0)) throw new Error(`invalid cut: start ${start} end ${end}`)
  const limit = (10 ** (ceilingDb / 20)).toFixed(6)
  const fadeIn = Math.min(Math.max(fadeInMs, 0) / 1000, dur / 2)
  const fadeOut = Math.min(Math.max(fadeOutMs, 0) / 1000, dur / 2)
  const filters = [
    // Zero-base timestamps so A/B are measured from the first decoded sample, then cut sample-accurately.
    'asetpts=PTS-STARTPTS',
    `atrim=start=${start}:end=${end}`,
    'asetpts=PTS-STARTPTS',
    `volume=${gainDb}dB`,
    // alimiter is sample-peak only; running it at 4x the output rate makes it catch inter-sample (true) peaks.
    // level=false: no auto make-up gain; latency=true: compensate lookahead so the cut stays aligned.
    `aresample=${OUTPUT_RATE * 4}`,
    `alimiter=limit=${limit}:level=false:latency=true`,
    `aresample=${OUTPUT_RATE}`,
  ]
  if (fadeIn > 0) filters.push(`afade=t=in:st=0:d=${fadeIn}`)
  if (fadeOut > 0) filters.push(`afade=t=out:st=${dur - fadeOut}:d=${fadeOut}`)
  return [
    '-y', '-nostats', '-i', src,
    '-vn', '-map_metadata', '-1',
    '-af', filters.join(','),
    '-c:a', 'libmp3lame', '-q:a', '0',
    // Xing/LAME header carries encoder delay + padding so decoders trim them (gapless loop).
    '-write_xing', '1',
    '-f', 'mp3', out,
  ]
}

// Renders, then verifies the encoded file's true peak; lowers the limiter ceiling by the overshoot and retries.
export async function renderCut(opts) {
  let ceilingDb = LIMITER_CEILING_DB
  for (let attempt = 1; ; attempt++) {
    await runFfmpeg(buildRenderArgs({ ...opts, ceilingDb }))
    const { truePeakDb } = await measureLoudness(opts.out)
    if (truePeakDb <= TRUE_PEAK_MAX_DB) return
    if (attempt === MAX_RENDER_ATTEMPTS) {
      throw new Error(`true peak ${truePeakDb} dBTP still above ${TRUE_PEAK_MAX_DB} after ${attempt} renders of ${opts.out}`)
    }
    ceilingDb -= truePeakDb - TRUE_PEAK_MAX_DB + CEILING_RETRY_MARGIN_DB
  }
}

// Decoded length as a decoder sees it (encoder delay/padding removed when the LAME header is honoured).
export async function decodeDurationSec(file) {
  const { stdout } = await runFfmpeg(['-nostats', '-progress', 'pipe:1', '-i', file, '-vn', '-f', 'null', '-'])
  const all = [...stdout.toString().matchAll(/out_time_us=(\d+)/g)]
  if (!all.length) throw new Error(`could not read decoded duration of ${file}`)
  return Number(all.at(-1)[1]) / 1e6
}

export async function decodePcm(file, sampleRate = 11025) {
  const { stdout } = await runFfmpeg(['-nostats', '-i', file, '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', '-'])
  const n = Math.floor(stdout.byteLength / 4)
  // Copy out: a pooled Buffer's byteOffset is not guaranteed to be 4-byte aligned.
  return new Float32Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + n * 4))
}

/**
 * song = A→B with fade in + fade out; intro = 0→B with fade out only. Same gain for both.
 * Writes fixed names (song.mp3 / intro.mp3) into outDir, so each call needs its own outDir
 * or it overwrites the previous pair.
 */
export async function renderPair({ src, outDir, A, B, fadeMs, gainDb, withIntro }) {
  mkdirSync(outDir, { recursive: true })
  const songPath = join(outDir, 'song.mp3')
  await renderCut({ src, out: songPath, start: A, end: B, fadeInMs: fadeMs, fadeOutMs: fadeMs, gainDb })
  let introPath = null
  if (withIntro) {
    introPath = join(outDir, 'intro.mp3')
    await renderCut({ src, out: introPath, start: 0, end: B, fadeInMs: 0, fadeOutMs: fadeMs, gainDb })
  }
  return { songPath, introPath }
}
