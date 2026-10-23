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
const SHORTER_LOOP_RATIO = 0.85 // prefer the shortest loop whose contrast is within this ratio of the best
const INTRO_MIN_SEC = 2
const INTRO_MIN_CONFIDENCE = 0.3
const FFT_SEC = 0.023 // FFT window for the spectral-shape features (256 points at 11025 Hz)
const SHAPE_BANDS = 16
const SHAPE_MIN_HZ = 100
const SHAPE_MAX_HZ = 5000

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
// Bars are assumed 4/4: a 3/4 loop is only found when it happens to be a whole number of 4-beat
// bars, otherwise its double (two loops) can come back as the suggested length.
function beatPeriodFrames(env, hopSec) {
  const n = env.length
  const { mean } = meanStd(env)
  const minLag = Math.round(0.3 / hopSec)
  const maxLag = Math.round(0.6 / hopSec)
  const multiples = 4
  // comb() reads up to round(multiples * (maxLag + 1)) during sub-frame refinement.
  const ac = new Float64Array((maxLag + 1) * multiples + 1)
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

// In-place radix-2 complex FFT (length must be a power of two).
function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let tmp = re[i]
      re[i] = re[j]
      re[j] = tmp
      tmp = im[i]
      im[i] = im[j]
      im[j] = tmp
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    const wr = Math.cos((-2 * Math.PI) / len)
    const wi = Math.sin((-2 * Math.PI) / len)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < half; k++) {
        const a = i + k
        const b = a + half
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
        const next = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = next
      }
    }
  }
}

// Repeat-matching features per frame: spectral shape (log energy in log-spaced FFT bands minus
// the frame mean) plus that mean as loudness. On a steady drum grid every whole-beat lag lines up
// the loudness envelope, so only shape (which drum / which layer) tells a real repeat apart.
// Returns { feats, shapeBands }: feats[0..shapeBands-1] are shape, feats[shapeBands] is loudness.
function spectralFeatures(pcm, sampleRate, hop, n) {
  let size = 1
  while (size < sampleRate * FFT_SEC) size *= 2
  const hz = sampleRate / size
  const top = Math.min(SHAPE_MAX_HZ, sampleRate * 0.45)
  const ranges = []
  let prev = Math.max(1, Math.round(SHAPE_MIN_HZ / hz))
  for (let b = 1; b <= SHAPE_BANDS; b++) {
    const edge = Math.min(size / 2, Math.round((SHAPE_MIN_HZ * (top / SHAPE_MIN_HZ) ** (b / SHAPE_BANDS)) / hz))
    if (edge > prev) {
      ranges.push([prev, edge])
      prev = edge
    }
  }
  const nb = ranges.length
  const feats = Array.from({ length: nb + 1 }, () => new Float32Array(n))
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size))
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  const logE = new Float64Array(nb)
  for (let f = 0; f < n; f++) {
    const start = f * hop - size / 2 // centre the FFT window on the frame start
    for (let i = 0; i < size; i++) {
      const j = start + i
      re[i] = j >= 0 && j < pcm.length ? pcm[j] * window[i] : 0
      im[i] = 0
    }
    fft(re, im)
    let mean = 0
    for (let b = 0; b < nb; b++) {
      let e = 0
      for (let k = ranges[b][0]; k < ranges[b][1]; k++) e += re[k] * re[k] + im[k] * im[k]
      logE[b] = Math.log(e / (ranges[b][1] - ranges[b][0]) + 1e-10)
      mean += logE[b] / nb
    }
    for (let b = 0; b < nb; b++) feats[b][f] = logE[b] - mean
    feats[nb][f] = mean
  }
  // z-score each shape band over time: every frame of music shares the same spectral tilt, which
  // would make any two frames look alike; what identifies a passage is the deviation from it.
  for (let b = 0; b < nb; b++) {
    const { mean, std } = meanStd(feats[b])
    for (let f = 0; f < n; f++) feats[b][f] = std > 0 ? (feats[b][f] - mean) / std : 0
  }
  return { feats, shapeBands: nb }
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
// matching worse than the repeat and start matching like it. The per-frame match is the cosine of
// the two spectral-shape vectors, so "both loud" (a noisy lead-in against a loud loop tail) does
// not count as a match, only "same shape" does.
function repeatStart(c, feats, shapeBands, lag, n, win) {
  const threshold = 0.6 * percentile(c, 0.9)
  let coarse = c.findIndex((v) => v >= threshold)
  if (coarse < 0) coarse = 0
  let score = 0
  for (let t = coarse; t < c.length; t++) score += c[t]
  score /= c.length - coarse

  const p = new Float64Array(n - lag)
  for (let t = 0; t < p.length; t++) {
    let dot = 0
    let xx = 0
    let yy = 0
    for (let b = 0; b < shapeBands; b++) {
      const x = feats[b][t]
      const y = feats[b][t + lag]
      dot += x * y
      xx += x * x
      yy += y * y
    }
    p[t] = xx > 1e-9 && yy > 1e-9 ? dot / Math.sqrt(xx * yy) : 0
  }
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

  const { feats, shapeBands } = spectralFeatures(pcm, sampleRate, hop, n)
  const candidates = []
  for (const lag of lags) {
    const c = windowedMatch(feats, lag, n, win)
    if (c) candidates.push({ lag, ...repeatStart(c, feats, shapeBands, lag, n, win) })
  }
  if (!candidates.length) return fallback
  // Contrast, not raw score: on steady-beat material every bar lag matches fairly well, so a loop
  // only counts by how far it stands above the typical (median) candidate.
  const sorted = candidates.map((k) => k.score).sort((a, b) => a - b)
  const baseline = sorted[Math.floor((sorted.length - 1) / 2)]
  for (const k of candidates) k.contrast = k.score - baseline
  const top = Math.max(...candidates.map((k) => k.contrast))
  // `|| k.contrast === top` keeps the best candidate when no contrast is positive.
  const chosen = candidates
    .filter((k) => k.contrast >= top * SHORTER_LOOP_RATIO || k.contrast === top)
    .sort((a, b) => a.lag - b.lag)[0]
  const confidence = baseline < 1 ? Math.min(1, Math.max(0, chosen.contrast / (1 - baseline))) : 0

  let A = chosen.start * hopSec
  const near = beats.reduce((best, t) => (Math.abs(t - A) < Math.abs(best - A) ? t : best), Infinity)
  if (Math.abs(near - A) <= BEAT_SNAP_SEC) A = near
  A = Math.round(A * 1000) / 1000
  const B = Math.min(duration, Math.round((A + chosen.lag * hopSec) * 1000) / 1000)
  return {
    A,
    B,
    leadInSec: A,
    // A low-confidence A is a guess, so it must not auto-check 有前奏.
    hasIntro: A >= INTRO_MIN_SEC && confidence >= INTRO_MIN_CONFIDENCE,
    confidence: Math.round(confidence * 1000) / 1000,
    beats,
  }
}
