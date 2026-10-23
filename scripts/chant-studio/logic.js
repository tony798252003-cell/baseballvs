// 卡片頁的純邏輯（切點取整、預覽增益、送出清單），app.js 與 node --test 共用。

export const MAX_GAIN_DB = 20 // same clamp as computeGainDb on the server
export const MIN_LOOP_SEC = 1

// Keeps a dragged cut inside the original with at least MIN_LOOP_SEC between A and B.
export function clampCut({ A, B }, durationSec) {
  const a = Math.max(0, Math.min(A, durationSec - MIN_LOOP_SEC))
  return { A: a, B: Math.max(a + MIN_LOOP_SEC, Math.min(B, durationSec)) }
}

// Millisecond values to save. The server requires 0 <= A < B <= durationSec, and durations are not
// whole ms (e.g. 50.735604), so a B rounded up past the end is pulled back to the last whole ms.
export function cutToSave({ A, B }, durationSec) {
  let b = Math.round(B * 1000) / 1000
  if (b > durationSec) b = Math.floor(durationSec * 1000) / 1000
  let a = Math.max(0, Math.round(A * 1000) / 1000)
  if (a >= b) a = Math.max(0, Math.round((b - 0.001) * 1000) / 1000)
  return { A: a, B: b }
}

// Gain basis for a cut {A, B} (saved ms values): the A→B segment LUFS (segmentLufs ?? integratedLufs, the
// whole-file value only until a segment was measured); pending while the server has not measured this cut.
export function previewLufs(card, cut) {
  const sc = card.segmentCut
  return { lufs: card.segmentLufs ?? card.integratedLufs, pending: !(sc && sc.A === cut.A && sc.B === cut.B) }
}

export function previewGainDb({ targetLufs, integratedLufs, sliderDb }) {
  return Math.min(MAX_GAIN_DB, Math.max(-MAX_GAIN_DB, targetLufs - integratedLufs + sliderDb))
}

// Fade length in seconds, clamped to half the segment like buildRenderArgs.
export const fadeSec = (fadeMs, lenSec) => Math.min(Math.max(fadeMs, 0) / 1000, lenSec / 2)

// Chrome's DynamicsCompressorNode always adds makeup gain = (1 / gain at 0 dBFS)^0.6. With knee 0 the
// curve maps 0 dBFS to threshold * (1 - 1/ratio), so makeup is 0.6 * -threshold * (1 - 1/ratio) dB.
export const compressorMakeupDb = (thresholdDb, ratio) => 0.6 * -thresholdDb * (1 - 1 / ratio)

// Names (球隊 - 姓名) the next submit will process: resolved and not uploaded yet.
export const submitNames = (cards) => cards.filter((c) => c.status === 'resolved' && !c.uploaded).map((c) => `${c.team} - ${c.name}`)
