// 應援曲工作台卡片頁：讀 /api/state 畫卡片，拖拉 A/B 微調（沿用試驗頁），Web Audio 預覽＝成品的切點、淡入淡出與增益。
import { clampCut, compressorMakeupDb, cutToSave, fadeSec, previewGainDb, submitNames } from './logic.js'

const STATUS_LABEL = { pending: '待處理', resolved: '✅ 已解決', skipped: '⏭ 跳過', notfound: '找不到', error: '錯誤' }
const LIMIT_DB = -1
const LIMIT_RATIO = 20
const LOW_CONFIDENCE = 0.3
const SAVE_DELAY_MS = 400
const POLL_MS = 3000
const ZOOM_SEC = 1.5
const DRAG_START_PX = 3

const ctx = new (window.AudioContext || window.webkitAudioContext)()
let targetLufs = -12
let latest = null // last /api/state
const views = new Map() // playerId -> view
const buffers = new Map() // media path -> Promise<{ buf, env }>

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const round3 = (x) => Math.round(x * 1000) / 1000
const fmtLen = (s) => (s == null ? '?' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`)
const fmtDb = (d) => `${d > 0 ? '+' : ''}${d.toFixed(1)} dB`
const mediaUrl = (rel) => `/media/${rel.split('/').map(encodeURIComponent).join('/')}`
const needsWork = (c) => c.status === 'pending' && !c.original
const isProcessing = (c) => latest?.processing === c.playerId
// Server data plus the processing flag: a change in either re-renders the card.
const cardKey = (c) => `${JSON.stringify(c)}${isProcessing(c) ? '#processing' : ''}`

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  let data = null
  try { data = await res.json() } catch { /* non-JSON body */ }
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
  return data
}

// ---- audio ----
// 1 ms max-abs envelope so redraws during drag/playback don't rescan millions of samples.
function envelope(buf) {
  const per = Math.max(1, Math.round(buf.sampleRate / 1000))
  const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i))
  const env = new Float32Array(Math.ceil(buf.length / per))
  for (let b = 0; b < env.length; b++) {
    let mx = 0
    for (const ch of chans) for (let i = b * per, e = Math.min(ch.length, i + per); i < e; i++) { const v = Math.abs(ch[i]); if (v > mx) mx = v }
    env[b] = mx
  }
  return env
}

function loadAudio(rel) {
  if (!buffers.has(rel)) {
    const p = fetch(mediaUrl(rel))
      .then((r) => { if (!r.ok) throw new Error(`音檔讀取失敗 HTTP ${r.status}（${rel}）`); return r.arrayBuffer() })
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => ({ buf, env: envelope(buf) }))
    p.catch(() => buffers.delete(rel))
    buffers.set(rel, p)
  }
  return buffers.get(rel)
}

// One playback at a time, owned by one view. Segments are scheduled back to back (no overlap), like the
// rendered files played gaplessly. Original: fade -> shared volume (gain) -> limiter (~ -1 dB) -> makeup
// compensation -> speakers. Rendered files already carry gain/fades/limit, so they go straight out.
const player = { view: null, nodes: [], sched: [], vol: null, endAt: 0 }

function stopPlayback() {
  for (const n of player.nodes) { try { n.stop() } catch { /* already stopped */ } }
  const v = player.view
  Object.assign(player, { view: null, nodes: [], sched: [], vol: null, endAt: 0 })
  v?.drawAll()
}

async function startPlayback(view, { rendered = false } = {}) {
  stopPlayback()
  await ctx.resume()
  stopPlayback() // another click may have started a playback while we awaited resume()
  const vol = ctx.createGain()
  if (rendered) vol.connect(ctx.destination)
  else {
    vol.gain.value = 10 ** (view.gainDb() / 20)
    const lim = ctx.createDynamicsCompressor()
    lim.threshold.value = LIMIT_DB
    lim.knee.value = 0
    lim.ratio.value = LIMIT_RATIO
    lim.attack.value = 0.001
    lim.release.value = 0.1
    // The compressor always adds makeup gain (~0.57 dB here); take it back out so preview loudness ≈ render.
    const unmakeup = ctx.createGain()
    unmakeup.gain.value = 10 ** (-compressorMakeupDb(LIMIT_DB, LIMIT_RATIO) / 20)
    vol.connect(lim).connect(unmakeup).connect(ctx.destination)
  }
  Object.assign(player, { view, vol })
  return ctx.currentTime + 0.05
}

// Plays buf[off, off+len) at `when`; fades are linear and clamped to half the segment like the render.
// origOff is where the segment starts in the original, so the playhead can be drawn on its waveform.
function segment(when, buf, off, len, { fadeIn = false, fadeOut = false, origOff = off } = {}) {
  const { view } = player
  const src = ctx.createBufferSource()
  src.buffer = buf
  const fade = ctx.createGain()
  src.connect(fade).connect(player.vol)
  const f = fadeSec(view.st.fadeMs, len)
  fade.gain.setValueAtTime(fadeIn && f ? 0 : 1, when)
  if (fadeIn && f) fade.gain.linearRampToValueAtTime(1, when + f)
  if (fadeOut && f) { fade.gain.setValueAtTime(1, when + len - f); fade.gain.linearRampToValueAtTime(0, when + len) }
  src.start(when, off, len)
  player.nodes.push(src)
  player.sched.push({ at: when, off: origOff, len })
  player.endAt = when + len
  return when + len
}

function playheadSec() {
  const now = ctx.currentTime
  for (let i = player.sched.length - 1; i >= 0; i--) {
    const e = player.sched[i]
    if (now >= e.at && now < e.at + e.len) return e.off + (now - e.at)
  }
  return null
}

;(function tick() {
  if (player.view) {
    if (ctx.currentTime > player.endAt) stopPlayback()
    else player.view.drawAll()
  }
  requestAnimationFrame(tick)
})()

// ---- card view ----
function chosenVideo(card) {
  if (card.customUrl) return { title: '自貼網址', url: card.customUrl }
  const v = card.candidates?.[card.chosen ?? 0]
  return v && { ...v, url: `https://www.youtube.com/watch?v=${v.videoId}` }
}

function videoHtml(card) {
  const v = chosenVideo(card)
  if (!v) return ''
  const meta = v.channel ? `<br><small>${esc(v.channel)} · ${fmtLen(v.lengthSec)} · 觀看 ${Number(v.views ?? 0).toLocaleString()} 次</small>` : ''
  const why = v.reasons?.length ? `<div class="why">挑選理由：${esc(v.reasons.join('；'))}</div>` : ''
  const alts = (card.candidates ?? []).map((c, i) => ({ c, i })).filter(({ i }) => card.customUrl || i !== (card.chosen ?? 0))
  const altHtml = alts.length ? `<ol class="alts">${alts.map(({ c, i }) => `<li value="${i + 1}"><a href="https://www.youtube.com/watch?v=${esc(c.videoId)}" target="_blank" rel="noopener">${esc(c.title)}</a> · ${esc(c.channel)} · ${fmtLen(c.lengthSec)}</li>`).join('')}</ol>` : ''
  return `<div class="pick">採用：<a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a>${meta}</div>${why}${altHtml ? `<div class="dim">其他候選：</div>${altHtml}` : ''}`
}

function headerHtml(card) {
  const s = card.suggestion
  const low = s && s.confidence < LOW_CONFIDENCE ? `<span class="badge low" title="建議切點信心 ${s.confidence}">低信心</span>` : ''
  let status = STATUS_LABEL[card.status] ?? card.status
  if (needsWork(card)) status = isProcessing(card) ? '處理中…' : '排隊中'
  return `<h2>#${esc(card.number)} ${esc(card.name)} <small>${esc(card.position ?? '')} · ${esc(card.team)}</small>
    <span class="badge ${esc(card.status)}">${esc(status)}</span>${card.uploaded ? '<span class="badge resolved">已上傳</span>' : ''}${low}</h2>`
}

const NUDGES = ['-0.1', '-0.01', '+0.01', '+0.1']
function tuneHtml(card) {
  const nudge = (k) => `<div class="row"><span class="lbl l${k}"></span>${NUDGES.map((d) => `<button data-m="${k}" data-d="${d}">${d}</button>`).join('')}<button data-snap="${k}">對齊鼓點</button></div>`
  const note = card.uploaded ? '<div class="dim">已上傳：試聽播放產生出來的成品檔，切點不能再改。</div>' : ''
  const lead = card.suggestion ? `（偵測前奏 ${card.suggestion.leadInSec.toFixed(2)} s）` : ''
  return `<div class="tune">${note}
    <div class="dim">拖拉 A／B，放開自動播接縫；雙擊整首波形＝從那裡播原曲；紅線＝目前位置</div>
    <canvas class="wave"></canvas>
    <div class="zooms"><div><div class="row">A 附近 ±1.5s</div><canvas class="za"></canvas></div><div><div class="row">B 附近 ±1.5s</div><canvas class="zb"></canvas></div></div>
    ${nudge('A')}${nudge('B')}
    <div class="row">淡入淡出 <input type="range" class="xf" min="0" max="300" step="10"> <span class="xfv lbl"></span></div>
    <div class="row">音量 <input type="range" class="vol" min="-6" max="6" step="0.5"> <span class="volv lbl"></span></div>
    <div class="row"><label><input type="checkbox" class="intro"> 有前奏（前奏版＝開頭→B）${esc(lead)}</label></div>
    <div class="row"><button class="full">▶ 前奏→循環×2</button><button class="loop3">🔁 循環×3</button><button class="pri seam">⏩ 只聽接縫</button><button class="stp">■ 停止</button><span class="pos lbl"></span></div>
  </div>`
}

function actionsHtml(card) {
  const b = []
  const hasCut = !!card.original
  if (card.status === 'resolved') b.push('<button data-act="pending">↩ 改回待處理</button>')
  else if (hasCut && card.status !== 'error') b.push('<button data-act="resolved">✅ 此筆已解決</button>')
  if (card.candidates?.length > 1 || (card.customUrl && card.candidates?.length)) b.push('<button data-act="next">🔄 換下一個版本</button>')
  if (card.status === 'skipped' && hasCut) b.push('<button data-act="pending">↩ 取消跳過</button>')
  else if (card.status !== 'skipped') b.push('<button data-act="skipped">⏭ 跳過</button>')
  if (['error', 'notfound', 'skipped'].includes(card.status)) b.push('<button data-act="retry">重試</button>')
  b.push('<input type="url" class="url" placeholder="貼 YouTube 網址"><button data-act="url">用這個網址</button>')
  return `<div class="actions">${b.join('')}<span class="msg"></span></div>`
}

function createView(card) {
  const el = document.createElement('section')
  const view = {
    id: card.playerId, card, el, buf: null, env: null, st: null,
    dirty: false, saving: false, saveTimer: null, saveError: null, dragging: false, lastEdit: 0,
  }
  const q = (s) => el.querySelector(s)
  const msg = (text, cls = '') => { const m = q('.msg'); if (m) { m.textContent = text; m.className = `msg ${cls}` } }
  view.msg = msg

  el.className = `card ${card.status}`
  el.dataset.status = card.status
  const busy = needsWork(card)
  el.innerHTML = `${headerHtml(card)}${videoHtml(card)}
    ${card.status === 'error' ? `<p class="err">錯誤：${esc(card.error)}</p>` : ''}
    ${card.status === 'notfound' ? '<p class="err">找不到合適的影片，請貼 YouTube 網址或重試。</p>' : ''}
    ${busy ? '<p class="dim">搜尋／下載／分析中，完成後會自動出現微調區。</p>' : ''}
    ${card.original && card.status !== 'error' ? '<div class="tunebox"><p class="dim">載入原曲…</p></div>' : ''}
    ${isProcessing(card) || card.uploaded ? '' : actionsHtml(card)}`

  view.gainDb = () => previewGainDb({ targetLufs, integratedLufs: card.integratedLufs, sliderDb: view.st.sliderDb })

  // ---- actions ----
  el.querySelectorAll('[data-act]').forEach((btn) => { btn.onclick = () => runAction(view, btn.dataset.act) })

  // Decoded lazily (card scrolled into view or first touched): each original is several MB of PCM.
  let loading = false
  view.load = () => {
    if (loading || !card.original || card.status === 'error') return
    loading = true
    lazyLoader.unobserve(el)
    const renderDir = `${latest.batch}/render/${card.playerId}`
    Promise.all([
      loadAudio(card.original),
      card.uploaded ? loadAudio(`${renderDir}/song.mp3`) : null,
      card.uploaded?.intro ? loadAudio(`${renderDir}/intro.mp3`) : null,
    ]).then(([orig, song, intro]) => {
      if (views.get(view.id) !== view) return // replaced meanwhile
      Object.assign(view, { buf: orig.buf, env: orig.env, song: song?.buf ?? null, intro: intro?.buf ?? null })
      q('.tunebox').innerHTML = tuneHtml(card)
      bindTune(view)
    }).catch((e) => { q('.tunebox').innerHTML = `<p class="err">${esc(e.message)}</p>` })
  }
  if (card.original && card.status !== 'error') {
    lazyLoader.observe(el)
    el.addEventListener('pointerdown', view.load, { once: true })
  }
  return view
}

const lazyLoader = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) [...views.values()].find((v) => v.el === e.target)?.load()
}, { rootMargin: '300px' })

function bindTune(view) {
  const { el, card, env, buf } = view
  const q = (s) => el.querySelector(s)
  const dur = card.durationSec
  const st = view.st = { A: card.A, B: card.B, fadeMs: card.fadeMs, sliderDb: card.sliderDb, withIntro: card.withIntro }
  const beats = card.suggestion?.beats ?? []
  const windows = { wave: () => [0, dur], za: () => [st.A - ZOOM_SEC, st.A + ZOOM_SEC], zb: () => [st.B - ZOOM_SEC, st.B + ZOOM_SEC] }
  const frozen = {} // zoom window held still while dragging inside it

  const locked = !!card.uploaded // edits would not change the uploaded files
  const clamp = () => Object.assign(st, clampCut(st, dur))

  function draw(cls) {
    const cv = q(`.${cls}`)
    const [t0, t1] = frozen[cls] ?? windows[cls]()
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(cv.clientWidth * dpr))
    const h = Math.max(1, Math.round(cv.clientHeight * dpr))
    if (cv.width !== w) cv.width = w
    if (cv.height !== h) cv.height = h
    const g = cv.getContext('2d')
    const X = (t) => ((t - t0) / (t1 - t0)) * w
    g.fillStyle = '#111'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#6d9dc5'
    const perPx = (t1 - t0) / w
    for (let x = 0; x < w; x++) {
      const a = Math.floor((t0 + x * perPx) * 1000)
      const b = Math.max(a + 1, Math.floor((t0 + (x + 1) * perPx) * 1000))
      let mx = 0
      for (let i = Math.max(0, a); i < b && i < env.length; i++) if (env[i] > mx) mx = env[i]
      g.fillRect(x, h / 2 - (mx * h) / 2, 1, Math.max(1, mx * h))
    }
    g.fillStyle = 'rgba(224,164,88,.18)'
    g.fillRect(X(st.A), 0, X(st.B) - X(st.A), h)
    g.fillStyle = '#888'
    for (const t of beats) if (t >= t0 && t <= t1) g.fillRect(X(t), h - 6 * dpr, Math.max(1, dpr), 6 * dpr)
    g.font = `bold ${12 * dpr}px sans-serif`
    for (const [k, t, c] of [['A', st.A, '#7fb08a'], ['B', st.B, '#e0a458']]) {
      g.fillStyle = c
      g.fillRect(X(t) - dpr, 0, 2 * dpr, h)
      g.fillText(k, X(t) + 3 * dpr, 12 * dpr)
    }
    const p = player.view === view ? playheadSec() : null
    if (p != null && p >= t0 && p <= t1) {
      g.fillStyle = '#ff3b30'
      g.fillRect(X(p) - dpr, 0, 2 * dpr, h)
      const label = `${p.toFixed(2)}s`
      const tx = X(p) + 4 * dpr + g.measureText(label).width > w ? X(p) - 4 * dpr - g.measureText(label).width : X(p) + 4 * dpr
      g.fillText(label, tx, h - 10 * dpr)
    }
  }

  view.drawAll = () => {
    if (!q('.wave')) return
    draw('wave'); draw('za'); draw('zb')
    q('.lA').textContent = `A = ${st.A.toFixed(2)}s`
    q('.lB').textContent = `B = ${st.B.toFixed(2)}s（循環 ${(st.B - st.A).toFixed(2)}s）`
    const p = player.view === view ? playheadSec() : null
    q('.pos').textContent = p == null ? '' : `▶ ${p.toFixed(2)}s`
  }

  function showValues() {
    q('.xf').value = st.fadeMs
    q('.xfv').textContent = `${st.fadeMs} ms`
    q('.vol').value = st.sliderDb
    q('.volv').textContent = `${fmtDb(st.sliderDb)}（總增益 ${fmtDb(view.gainDb())}）`
    q('.intro').checked = st.withIntro
    q('.full').style.display = (locked ? view.intro : st.withIntro) ? '' : 'none'
  }

  // ---- previews ----
  // Uploaded cards play the rendered song/intro files (spec §4); others preview from the original.
  async function playSeam() {
    let t = await startPlayback(view, { rendered: locked })
    if (locked) {
      const S = view.song
      const pre = Math.min(3, S.duration)
      t = segment(t, S, S.duration - pre, pre, { origOff: st.A + S.duration - pre })
      segment(t, S, 0, pre, { origOff: st.A })
      return
    }
    const pre = Math.min(3, st.B - st.A)
    t = segment(t, buf, st.B - pre, pre, { fadeOut: true })
    segment(t, buf, st.A, pre, { fadeIn: true })
  }
  async function playLoops(n, withIntro) {
    let t = await startPlayback(view, { rendered: locked })
    if (locked) {
      if (withIntro && view.intro) t = segment(t, view.intro, 0, view.intro.duration, { origOff: 0 })
      for (let k = 0; k < n; k++) t = segment(t, view.song, 0, view.song.duration, { origOff: st.A })
      return
    }
    if (withIntro) t = segment(t, buf, 0, st.B, { fadeOut: true })
    for (let k = 0; k < n; k++) t = segment(t, buf, st.A, st.B - st.A, { fadeIn: true, fadeOut: true })
  }
  async function playFrom(sec) {
    const t = await startPlayback(view)
    const off = Math.max(0, Math.min(sec, buf.duration - 0.01))
    segment(t, buf, off, buf.duration - off)
  }

  function edited(seam) {
    clamp()
    view.drawAll()
    queueSave(view)
    if (seam) playSeam()
  }

  // ---- drag: a press only grabs after a few px of movement, so double-click stays free for playFrom ----
  function bindDrag(cls, pick) {
    const cv = q(`.${cls}`)
    let press = null
    const tAt = (ev) => {
      const [t0, t1] = frozen[cls] ?? windows[cls]()
      const rc = cv.getBoundingClientRect()
      return t0 + ((ev.clientX - rc.left) / rc.width) * (t1 - t0)
    }
    cv.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return
      if (cls !== 'wave') frozen[cls] = windows[cls]()
      press = { x: ev.clientX, key: pick(tAt(ev)), active: false }
      cv.setPointerCapture(ev.pointerId)
    })
    cv.addEventListener('pointermove', (ev) => {
      if (!press) return
      if (!press.active && Math.abs(ev.clientX - press.x) < DRAG_START_PX) return
      press.active = true
      view.dragging = true
      st[press.key] = tAt(ev)
      clamp()
      view.drawAll()
    })
    const end = () => {
      if (!press) return
      const wasDrag = press.active
      press = null
      delete frozen[cls]
      view.dragging = false
      if (wasDrag) edited(true)
      else view.drawAll()
    }
    cv.addEventListener('pointerup', end)
    cv.addEventListener('pointercancel', end)
  }
  if (!locked) {
    bindDrag('wave', (t) => (Math.abs(t - st.A) < Math.abs(t - st.B) ? 'A' : 'B'))
    bindDrag('za', () => 'A')
    bindDrag('zb', () => 'B')
  }
  q('.wave').addEventListener('dblclick', (ev) => {
    const rc = q('.wave').getBoundingClientRect()
    playFrom(((ev.clientX - rc.left) / rc.width) * dur)
  })

  el.querySelectorAll('button[data-m]').forEach((b) => {
    b.onclick = () => { st[b.dataset.m] = round3(st[b.dataset.m] + parseFloat(b.dataset.d)); edited(true) }
  })
  el.querySelectorAll('button[data-snap]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.snap
      if (!beats.length) return view.msg('沒有偵測到鼓點', 'bad')
      st[k] = beats.reduce((p, t) => (Math.abs(t - st[k]) < Math.abs(p - st[k]) ? t : p))
      edited(true)
    }
  })
  q('.xf').oninput = () => { st.fadeMs = Number(q('.xf').value); showValues(); queueSave(view) }
  q('.xf').onchange = () => playSeam()
  q('.vol').oninput = () => {
    st.sliderDb = Number(q('.vol').value)
    showValues()
    if (player.view === view) player.vol.gain.setTargetAtTime(10 ** (view.gainDb() / 20), ctx.currentTime, 0.02)
    queueSave(view)
  }
  q('.intro').onchange = () => { st.withIntro = q('.intro').checked; showValues(); queueSave(view) }
  q('.seam').onclick = playSeam
  q('.full').onclick = () => playLoops(2, true)
  q('.loop3').onclick = () => playLoops(3, false)
  q('.stp').onclick = stopPlayback
  if (locked) el.querySelectorAll('.tune [data-m], .tune [data-snap], .tune input').forEach((x) => { x.disabled = true })

  showValues()
  view.drawAll()
}

// ---- saving ----
const editBody = (view) => view.st && {
  ...cutToSave(view.st, view.card.durationSec), fadeMs: view.st.fadeMs, sliderDb: view.st.sliderDb, withIntro: view.st.withIntro,
}

function queueSave(view) {
  view.dirty = true
  view.lastEdit = performance.now()
  clearTimeout(view.saveTimer)
  view.saveTimer = setTimeout(() => flushSave(view), SAVE_DELAY_MS)
}

// saveTimer is cleared when it fires, so `finally` can tell whether another edit is still waiting.
async function flushSave(view) {
  view.saveTimer = null
  if (view.saving) { view.saveTimer = setTimeout(() => flushSave(view), SAVE_DELAY_MS); return }
  view.saving = true
  view.msg('儲存中…')
  try {
    const card = await api(`/api/cards/${encodeURIComponent(view.id)}`, editBody(view))
    view.card = card
    view.serverKey = cardKey(card)
    view.saveError = null
    view.msg('✓ 已儲存', 'ok')
  } catch (e) {
    view.saveError = e.message
    view.msg(`儲存失敗：${e.message}`, 'bad')
  } finally {
    view.saving = false
    if (!view.saveError && !view.saveTimer) view.dirty = false
  }
}

async function runAction(view, act) {
  const id = encodeURIComponent(view.id)
  clearTimeout(view.saveTimer)
  view.saveTimer = null
  view.el.querySelectorAll('.actions button').forEach((b) => { b.disabled = true })
  view.msg('處理中…')
  try {
    let card
    if (act === 'next' || act === 'retry') card = await api(`/api/cards/${id}/${act}`, {})
    else if (act === 'url') card = await api(`/api/cards/${id}/url`, { url: view.el.querySelector('.url').value.trim() })
    else card = await api(`/api/cards/${id}`, { ...editBody(view), status: act })
    if (player.view === view) stopPlayback()
    view.dirty = false
    view.saveError = null
    replaceCard(card)
    await refresh()
  } catch (e) {
    view.el.querySelectorAll('.actions button').forEach((b) => { b.disabled = false })
    view.msg(`失敗：${e.message}`, 'bad')
  }
}

// ---- page ----
function replaceCard(card) {
  const old = views.get(card.playerId)
  const view = createView(card)
  view.serverKey = cardKey(card)
  views.set(card.playerId, view)
  if (old) {
    if (player.view === old) stopPlayback()
    lazyLoader.unobserve(old.el)
    // A new download (換版本／貼網址／重試) replaces the original: free the old decoded audio.
    if (old.card.original && old.card.original !== card.original) buffers.delete(old.card.original)
    old.el.replaceWith(view.el)
  } else document.getElementById('cards').appendChild(view.el)
  applyFilter()
}

function applyFilter() {
  const f = document.getElementById('filter').value
  for (const v of views.values()) v.el.style.display = !f || v.card.status === f ? '' : 'none'
}

function renderTop(s) {
  document.getElementById('batch').textContent = `批次 ${s.batch}`
  const c = s.counts ?? {}
  document.getElementById('counts').textContent = [`共 ${c.total ?? 0}`, ...Object.keys(STATUS_LABEL).map((k) => `${STATUS_LABEL[k]} ${c[k] ?? 0}`)].join('　')
  const proc = s.processing && s.cards.find((x) => x.playerId === s.processing)
  const waiting = s.cards.filter(needsWork).length
  document.getElementById('processing').textContent = proc ? `處理中：${proc.name}（還有 ${waiting} 張待處理）` : ''
}

let pollTimer = null
let refreshing = false
async function refresh() {
  if (refreshing) return
  refreshing = true
  const startedAt = performance.now()
  try {
    const s = await api('/api/state')
    latest = s
    targetLufs = s.targetLufs
    if (!views.size) document.getElementById('cards').textContent = ''
    for (const card of s.cards) {
      const v = views.get(card.playerId)
      if (v && v.serverKey === cardKey(card)) continue
      // Don't clobber a card the user is editing, or one edited after this request went out (stale response).
      if (v && (v.dragging || v.dirty || v.saving || v.saveError || v.lastEdit > startedAt)) continue
      replaceCard(card)
    }
    if (!s.cards.length) document.getElementById('cards').innerHTML = '<p class="dim">這個批次沒有卡片。</p>'
    renderTop(s)
  } catch (e) {
    document.getElementById('processing').textContent = `讀取狀態失敗：${e.message}`
  } finally {
    refreshing = false
  }
  clearTimeout(pollTimer)
  const busy = latest && (latest.processing || latest.queued?.length || latest.cards.some(needsWork))
  if (busy || !latest) pollTimer = setTimeout(refresh, POLL_MS)
}

document.getElementById('filter').onchange = applyFilter

document.getElementById('submit').onclick = async () => {
  const names = submitNames([...views.values()].map((v) => v.card))
  const out = document.getElementById('summary')
  if (!names.length) { out.innerHTML = '<div class="box">沒有尚未上傳的已解決卡片。</div>'; return }
  if (!confirm(`將產生成品、上傳 Dropbox 並寫入資料庫，共 ${names.length} 筆：\n\n${names.join('\n')}\n\n確定送出？`)) return
  const btn = document.getElementById('submit')
  btn.disabled = true
  out.innerHTML = '<div class="box">送出中…（產生成品並上傳，可能需要一段時間）</div>'
  try {
    const r = await api('/api/submit', {})
    const list = (items, f) => (items?.length ? `<ul>${items.map((x) => `<li>${esc(x.name)}：${esc(f(x))}</li>`).join('')}</ul>` : '')
    const uploaded = r.uploaded ?? []
    out.innerHTML = `<div class="box"><b>送出完成</b>：上傳 ${uploaded.length} 首，跳過 ${r.skipped?.length ?? 0} 筆，失敗 ${r.failed?.length ?? 0} 筆
      ${uploaded.length ? `<div>上傳：</div><ul>${uploaded.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      ${r.skipped?.length ? `<div>跳過：</div>${list(r.skipped, (x) => x.reason)}` : ''}
      ${r.failed?.length ? `<div class="err">失敗：</div>${list(r.failed, (x) => x.error)}` : ''}</div>`
  } catch (e) {
    out.innerHTML = `<div class="box err">送出失敗：${esc(e.message)}</div>`
  } finally {
    btn.disabled = false
    await refresh()
  }
}

window.addEventListener('resize', () => { for (const v of views.values()) v.drawAll?.() })
refresh()
