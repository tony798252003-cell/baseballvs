// Suggest loop cut points (A = loop start, B = loop end) for a chant.
// Approach: band-energy frames -> onset envelope -> tempo -> try only whole-bar loop lengths
// in 12-45 s -> keep the length whose repeat matches best -> A = where that repeat starts.
// Chants are drums/brass/shouting with little pitch content, so we match energy, not chroma.
// The result is only a starting point; the studio UI lets the user drag A/B.

const HOP_SEC = 0.01
const SMOOTH_FRAMES = 5
const BAND_CUTOFFS_HZ = [200, 1000, 3000]
const MIN_LOOP_SEC = 12
const MAX_LOOP_SEC = 45
const BEATS_PER_BAR = 4
const LAG_TOLERANCE = 0.02 // tempo estimate error allowed around n * bar
const MATCH_WINDOW_SEC = 3
const BEAT_SNAP_SEC = 0.1
const SHORTER_LOOP_RATIO = 0.92 // prefer the shortest loop scoring within this ratio of the best
const INTRO_MIN_SEC = 2

// Log energy per frame for a few frequency bands (one-pole filter differences).
function bandEnergies(pcm, sampleRate, hop) {
  const n = Math.floor(pcm.length / hop)
  const nb = BAND_CUTOFFS_HZ.length + 1
  const bands = Array.from({ length: nb }, () => new Float32Array(n))
  const coef = BAND_CUTOFFS_HZ.map((fc) => 1 - Math.exp((-2 * Math.PI * Math.min(fc, sampleRate * 0.45)) / sampleRate))
  const lp = new Float64Array(coef.length)
  const out = new Float64Array(nb)
  for (let f = 0; f < n; f++) {
    out.fill(0)
    for (let i = f * hop, end = i + hop; i < end; i++) {
      const x = pcm[i]
      for (let k = 0; k < coef.length; k++) lp[k] += coef[k] * (x - lp[k])
      let prev = 0
      for (let k = 0; k < coef.length; k++) {
        const v = lp[k] - prev
        out[k] += v * v
        prev = lp[k]
      }
      const hi = x - prev
      out[nb - 1] += hi * hi
    }
    for (let b = 0; b < nb; b++) bands[b][f] = out[b] / hop
  }
  // Trailing moving average before the log: 10 ms frames alone are too noisy for tempo.
  for (const band of bands) {
    let sum = 0
    const lin = Float32Array.from(band)
    for (let f = 0; f < n; f++) {
      sum += lin[f] - (f >= SMOOTH_FRAMES ? lin[f - SMOOTH_FRAMES] : 0)
      band[f] = Math.log(Math.max(sum, 0) / Math.min(f + 1, SMOOTH_FRAMES) + 1e-10)
    }
  }
  return bands
}

function onsetEnvelope(bands, n) {
  const env = new Float32Array(n)
  for (let f = 1; f < n; f++) {
    let s = 0
    for (const band of bands) s += Math.max(0, band[f] - band[f - 1])
    env[f] = s
  }
  return env
}

function meanStd(arr) {
  let s = 0
  let s2 = 0
  for (const v of arr) {
    s += v
    s2 += v * v
  }
  const mean = arr.length ? s / arr.length : 0
  const variance = arr.length ? s2 / arr.length - mean * mean : 0
  return { mean, std: Math.sqrt(Math.max(variance, 0)) }
}

// Onset times: local maxima (±50 ms) that stand out from the surrounding second.
function pickOnsets(env, hopSec) {
  const n = env.length
  const { std } = meanStd(env)
  const half = Math.round(0.05 / hopSec)
  const ctx = Math.round(1 / hopSec)
  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + env[i]
  const times = []
  for (let i = 1; i < n; i++) {
    const v = env[i]
    if (v <= 0) continue
    const lo = Math.max(0, i - ctx)
    const hi = Math.min(n, i + ctx + 1)
    if (v < (prefix[hi] - prefix[lo]) / (hi - lo) + 0.5 * std) continue
    let isPeak = true
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      if (env[j] > v || (env[j] === v && j < i)) {
        isPeak = false
        break
      }
    }
    if (isPeak) times.push(Math.round(i * hopSec * 1000) / 1000)
  }
  return times
}

// Beat period in frames: comb over onset autocorrelation (period plus its first multiples, so a
// lone sub-beat peak does not win), with a mild prior around 120 BPM. Searching only 100-200 BPM
// means a half-time chant gets the faster beat, whose bars still include every real bar length.
function beatPeriodFrames(env, hopSec) {
  const n = env.length
  const { mean } = meanStd(env)
  const minLag = Math.round(0.3 / hopSec)
  const maxLag = Math.round(0.6 / hopSec)
  const multiples = 4
  const ac = new Float64Array(maxLag * multiples + 2)
  for (let lag = 1; lag < ac.length && lag < n; lag++) {
    let s = 0
    for (let i = 0; i + lag < n; i++) s += (env[i] - mean) * (env[i + lag] - mean)
    ac[lag] = s / (n - lag)
  }
  const comb = (p) => {
    let s = 0
    for (let k = 1; k <= multiples; k++) s += ac[Math.round(k * p)]
    return s / multiples
  }
  let best = Math.round(0.5 / hopSec)
  let bestScore = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    const octaves = Math.log2((lag * hopSec) / 0.5)
    const weighted = comb(lag) * Math.exp(-0.5 * octaves * octaves)
    if (weighted > bestScore) {
      bestScore = weighted
      best = lag
    }
  }
  // Sub-frame refinement: best fractional period on the comb within ±1 frame.
  let refined = best
  for (let p = best - 1; p <= best + 1; p += 0.05) if (comb(p) > comb(refined)) refined = p
  return refined
}

function zScore(bands) {
  return bands.map((band) => {
    const { mean, std } = meanStd(band)
    return band.map((v) => (std > 0 ? (v - mean) / std : 0))
  })
}

function lagScore(z, lag, n) {
  let s = 0
  for (const band of z) for (let t = 0; t + lag < n; t++) s += band[t] * band[t + lag]
  return s / (z.length * (n - lag))
}

// Windowed Pearson correlation between frames t.. and t+lag.., averaged over bands.
function windowedMatch(bands, lag, n, win) {
  const count = n - lag - win + 1
  if (count < 1) return null
  const c = new Float64Array(count)
  for (const band of bands) {
    const len = n - lag
    const px = new Float64Array(len + 1)
    const py = new Float64Array(len + 1)
    const pxx = new Float64Array(len + 1)
    const pyy = new Float64Array(len + 1)
    const pxy = new Float64Array(len + 1)
    for (let t = 0; t < len; t++) {
      const x = band[t]
      const y = band[t + lag]
      px[t + 1] = px[t] + x
      py[t + 1] = py[t] + y
      pxx[t + 1] = pxx[t] + x * x
      pyy[t + 1] = pyy[t] + y * y
      pxy[t + 1] = pxy[t] + x * y
    }
    for (let t = 0; t < count; t++) {
      const e = t + win
      const sx = px[e] - px[t]
      const sy = py[e] - py[t]
      const vx = pxx[e] - pxx[t] - (sx * sx) / win
      const vy = pyy[e] - pyy[t] - (sy * sy) / win
      const cov = pxy[e] - pxy[t] - (sx * sy) / win
      if (vx > 1e-9 && vy > 1e-9) c[t] += cov / Math.sqrt(vx * vy) / bands.length
    }
  }
  return c
}

function percentile(arr, p) {
  const sorted = Array.from(arr).sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

// Start of the repeat: the first window that matches well gives a coarse start; the exact frame
// is where the running sum of (match - half the matched level) bottoms out, i.e. where frames stop
// matching worse than the repeat and start matching like it.
function repeatStart(c, z, lag, n, win) {
  const threshold = 0.6 * percentile(c, 0.9)
  let coarse = c.findIndex((v) => v >= threshold)
  if (coarse < 0) coarse = 0
  let score = 0
  for (let t = coarse; t < c.length; t++) score += c[t]
  score /= c.length - coarse

  const p = new Float64Array(n - lag)
  for (const band of z) for (let t = 0; t < p.length; t++) p[t] += (band[t] * band[t + lag]) / z.length
  // Clip so one dropout (both sides near-silent -> huge z product) cannot drag the start.
  for (let t = 0; t < p.length; t++) p[t] = Math.max(-1, Math.min(1, p[t]))
  let level = 0
  for (let t = coarse; t < p.length; t++) level += p[t]
  const half = level / (p.length - coarse) / 2

  const lo = Math.max(0, coarse - win)
  const hi = Math.min(p.length - 1, coarse + win)
  let start = lo
  let run = 0
  let lowest = 0
  for (let t = lo; t < hi; t++) {
    run += p[t] - half
    if (run < lowest) {
      lowest = run
      start = t + 1
    }
  }
  return { start, score }
}

export function suggestCut(pcm, sampleRate) {
  const duration = pcm.length / sampleRate
  const hop = Math.max(1, Math.round(sampleRate * HOP_SEC))
  const hopSec = hop / sampleRate
  const bands = bandEnergies(pcm, sampleRate, hop)
  const n = bands[0].length
  const env = onsetEnvelope(bands, n)
  const beats = pickOnsets(env, hopSec)
  const fallback = { A: 0, B: duration, leadInSec: 0, hasIntro: false, confidence: 0, beats }

  const win = Math.round(MATCH_WINDOW_SEC / hopSec)
  const minLag = Math.round(MIN_LOOP_SEC / hopSec)
  const maxLag = Math.min(Math.round(MAX_LOOP_SEC / hopSec), n - win)
  if (maxLag < minLag) return fallback

  const z = zScore(bands)
  const barFrames = BEATS_PER_BAR * beatPeriodFrames(env, hopSec)
  const lags = new Set()
  for (let bars = Math.ceil((minLag * (1 - LAG_TOLERANCE)) / barFrames); bars * barFrames * (1 - LAG_TOLERANCE) <= maxLag; bars++) {
    const center = bars * barFrames
    const lo = Math.max(minLag, Math.floor(center * (1 - LAG_TOLERANCE)))
    const hi = Math.min(maxLag, Math.ceil(center * (1 + LAG_TOLERANCE)))
    let bestLag = -1
    let bestScore = -Infinity
    for (let lag = lo; lag <= hi; lag++) {
      const s = lagScore(z, lag, n)
      if (s > bestScore) {
        bestScore = s
        bestLag = lag
      }
    }
    if (bestLag > 0) lags.add(bestLag)
  }

  const candidates = []
  for (const lag of lags) {
    const c = windowedMatch(bands, lag, n, win)
    if (c) candidates.push({ lag, ...repeatStart(c, z, lag, n, win) })
  }
  if (!candidates.length) return fallback
  const top = Math.max(...candidates.map((k) => k.score))
  // `|| k.score === top` keeps the best candidate when every score is negative.
  const chosen = candidates.filter((k) => k.score >= top * SHORTER_LOOP_RATIO || k.score === top).sort((a, b) => a.lag - b.lag)[0]

  let A = chosen.start * hopSec
  const near = beats.reduce((best, t) => (Math.abs(t - A) < Math.abs(best - A) ? t : best), Infinity)
  if (Math.abs(near - A) <= BEAT_SNAP_SEC) A = near
  A = Math.round(A * 1000) / 1000
  const B = Math.min(duration, Math.round((A + chosen.lag * hopSec) * 1000) / 1000)
  return {
    A,
    B,
    leadInSec: A,
    hasIntro: A >= INTRO_MIN_SEC,
    confidence: Math.round(Math.min(1, Math.max(0, chosen.score)) * 1000) / 1000,
    beats,
  }
}
