// scripts/lib/audioCut.mjs
// ffmpeg-based loudness measurement, gain and gapless mp3 cut rendering for the chant studio.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, delimiter } from 'node:path'

export const TARGET_LUFS = -14
const TRUE_PEAK_LIMIT_DB = -1

const FALLBACKS = {
  ffmpeg: join(homedir(), 'bin', 'ffmpeg'),
  'yt-dlp': join(homedir(), '.local', 'bin', 'yt-dlp'),
}

const INSTALL_HINTS = {
  ffmpeg: 'install ffmpeg (e.g. `brew install ffmpeg`, or put a static build at ~/bin/ffmpeg)',
  'yt-dlp': 'install yt-dlp (e.g. `brew install yt-dlp`, or put it at ~/.local/bin/yt-dlp)',
}

export function findBinary(name) {
  if (!FALLBACKS[name]) throw new Error(`unknown binary: ${name}`)
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (dir && existsSync(join(dir, name))) return join(dir, name)
  }
  if (existsSync(FALLBACKS[name])) return FALLBACKS[name]
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

export function computeGainDb({ integratedLufs, sliderDb = 0, target = TARGET_LUFS }) {
  return target - integratedLufs + sliderDb
}

// start/end are seconds in the original; fades are linear (afade default curve is "tri" = linear).
// Whole-file re-encode: start 0, end = duration, fadeInMs = fadeOutMs = 0.
export function buildRenderArgs({ src, out, start, end, fadeInMs = 0, fadeOutMs = 0, gainDb = 0 }) {
  const dur = end - start
  if (!(dur > 0)) throw new Error(`invalid cut: start ${start} end ${end}`)
  const limit = (10 ** (TRUE_PEAK_LIMIT_DB / 20)).toFixed(6)
  const filters = [
    // Zero-base timestamps so A/B are measured from the first decoded sample, then cut sample-accurately.
    'asetpts=PTS-STARTPTS',
    `atrim=start=${start}:end=${end}`,
    'asetpts=PTS-STARTPTS',
    `volume=${gainDb}dB`,
    // level=false: no auto make-up gain; latency=true: compensate lookahead so the cut stays aligned.
    `alimiter=limit=${limit}:level=false:latency=true`,
  ]
  if (fadeInMs > 0) filters.push(`afade=t=in:st=0:d=${fadeInMs / 1000}`)
  if (fadeOutMs > 0) filters.push(`afade=t=out:st=${dur - fadeOutMs / 1000}:d=${fadeOutMs / 1000}`)
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

export async function renderCut(opts) {
  await runFfmpeg(buildRenderArgs(opts))
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

// song = A→B with fade in + fade out; intro = 0→B with fade out only. Same gain for both.
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
