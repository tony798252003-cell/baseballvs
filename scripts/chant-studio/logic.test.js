import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampCut, compressorMakeupDb, cutToSave, fadeSec, previewGainDb, previewLufs, submitNames } from './logic.js'

// A B dragged to the very end must not round up past the duration, or the server rejects every save.
test('cutToSave keeps B at or below a non-whole-ms duration', () => {
  const dur = 50.735604
  const { A, B } = cutToSave({ A: 11.254, B: dur }, dur)
  assert.equal(B, 50.735)
  assert.ok(B <= dur && A < B)
})

// Ordinary values are saved to the nearest ms, unchanged in meaning.
test('cutToSave rounds normal values to ms', () => {
  assert.deepEqual(cutToSave({ A: 0.0104, B: 42.6226 }, 55.232), { A: 0.01, B: 42.623 })
})

// After B is pulled back, A must still be strictly before it.
test('cutToSave keeps A < B when both sit at the end', () => {
  const dur = 10.0004
  const { A, B } = cutToSave({ A: 10.0004, B: 10.0004 }, dur)
  assert.ok(A < B && B <= dur && A >= 0)
})

// Dragging A past B pushes B along so the loop stays at least 1 s and inside the file.
test('clampCut keeps a 1 s loop inside the file', () => {
  assert.deepEqual(clampCut({ A: 20, B: 5 }, 30), { A: 20, B: 21 })
  assert.deepEqual(clampCut({ A: 40, B: 50 }, 30), { A: 29, B: 30 })
  assert.deepEqual(clampCut({ A: -2, B: 10 }, 30), { A: 0, B: 10 })
})

// Preview must use the render's gain: target - measured + slider, clamped to ±20 dB.
test('previewGainDb matches the server formula and clamp', () => {
  assert.equal(previewGainDb({ targetLufs: -14, integratedLufs: -11.6, sliderDb: 2.5 }).toFixed(3), '0.100')
  assert.equal(previewGainDb({ targetLufs: -14, integratedLufs: -50, sliderDb: 6 }), 20)
  assert.equal(previewGainDb({ targetLufs: -14, integratedLufs: 10, sliderDb: -6 }), -20)
})

// Short segments get fades of at most half their length, as in buildRenderArgs.
test('fadeSec clamps to half the segment', () => {
  assert.equal(fadeSec(60, 10), 0.06)
  assert.equal(fadeSec(300, 0.4), 0.2)
})

// The preview limiter (threshold -1, ratio 20) adds ~0.57 dB that has to be taken back out.
test('compressorMakeupDb for the preview limiter', () => {
  assert.equal(compressorMakeupDb(-1, 20).toFixed(2), '0.57')
})

// Already-uploaded cards are skipped by submit, so the confirm dialog must not list them.
test('submitNames lists resolved cards that are not uploaded', () => {
  const cards = [
    { team: 'T', name: '甲', status: 'resolved' },
    { team: 'T', name: '乙', status: 'resolved', uploaded: { song: 'x', intro: null } },
    { team: 'T', name: '丙', status: 'pending' },
  ]
  assert.deepEqual(submitNames(cards), ['T - 甲'])
})

// Preview must level by the same A→B loudness the submit renders with; the whole-file value is only a stand-in.
test('previewLufs uses segmentLufs ?? integratedLufs and is pending until this exact cut was measured', () => {
  const card = { integratedLufs: -9, segmentLufs: -11, segmentCut: { A: 5, B: 20 } }
  assert.deepEqual(previewLufs(card, { A: 5, B: 20 }), { lufs: -11, pending: false })
  assert.deepEqual(previewLufs(card, { A: 5.01, B: 20 }), { lufs: -11, pending: true })
  assert.deepEqual(previewLufs({ integratedLufs: -9 }, { A: 5, B: 20 }), { lufs: -9, pending: true })
})
