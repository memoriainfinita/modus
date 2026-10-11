// The Player panel: a recording being transcribed, from a local file. Its waveform, a click
// to go anywhere, an A–B loop, slower or faster without changing the pitch, back 5 s. The
// file is not stored: it is the user's, read in this page only, and opened again after a reload.

import { escapeHtml } from './html'
import { loadChoice, save } from './storage'
import { color } from './theme'
import { t } from '../i18n/i18n'

export const SPEEDS = ['0.5', '0.6', '0.75', '0.9', '1', '1.1', '1.25'] as const
type Speed = typeof SPEEDS[number]

/** 75.4 s → "1:15", or "1:15.4" with tenths (where the playhead and the loop are). */
export function formatTime(s: number, tenths = false): string {
  if (!isFinite(s) || s < 0) s = 0
  const d = Math.floor(s * 10 + 1e-6)
  const m = Math.floor(d / 600)
  const sec = Math.floor((d % 600) / 10)
  return `${m}:${String(sec).padStart(2, '0')}${tenths ? `.${d % 10}` : ''}`
}

/** The loudest sample in each of `columns` slices: the waveform drawn. */
export function computePeaks(samples: Float32Array, columns: number): number[] {
  const per = Math.max(1, Math.floor(samples.length / columns))
  const peaks: number[] = []
  for (let c = 0; c < columns; c++) {
    let max = 0
    const end = Math.min(samples.length, (c + 1) * per)
    for (let i = c * per; i < end; i++) { const v = Math.abs(samples[i]); if (v > max) max = v }
    peaks.push(max)
  }
  return peaks
}

/** Where the loop goes back: at B (or the end) it returns to A. Null while it should play on. */
export function loopTarget(time: number, a: number | null, b: number | null, duration: number): number | null {
  if (a === null) return null
  const end = b !== null && b > a ? b : duration
  return time >= end ? a : null
}

const audio: HTMLAudioElement | null = typeof Audio === 'undefined' ? null : new Audio()
let fileName = ''
let samples: Float32Array | null = null
let loopA: number | null = null
let loopB: number | null = null
let speed = loadChoice<Speed>('player-speed', SPEEDS, '1')
let frame = 0

if (audio) {
  audio.preload = 'auto'
  ;(audio as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = true
}

async function openFile(file: File, container: HTMLElement) {
  if (!audio) return
  if (audio.src) URL.revokeObjectURL(audio.src)
  audio.src = URL.createObjectURL(file)
  audio.playbackRate = Number(speed)
  fileName = file.name
  loopA = loopB = null
  samples = null
  renderPlayer(container)
  // The waveform: decoded once, the first channel is enough to see where things are
  try {
    const ctx = new OfflineAudioContext(1, 1, 44100)
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer())
    samples = buffer.getChannelData(0)
  } catch { samples = null }
  drawWave(container)
}

function drawWave(container: HTMLElement) {
  const canvas = container.querySelector<HTMLCanvasElement>('.player-wave')
  if (!canvas || !audio) return
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr))
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
  const g = canvas.getContext('2d')
  if (!g) return
  g.clearRect(0, 0, w, h)
  const dur = audio.duration
  const x = (s: number) => isFinite(dur) && dur > 0 ? (s / dur) * w : 0
  if (loopA !== null) {
    g.globalAlpha = 0.25
    g.fillStyle = color('accent')
    const end = loopB !== null && loopB > loopA ? loopB : dur
    g.fillRect(x(loopA), 0, x(end) - x(loopA), h)
    g.globalAlpha = 1
  }
  if (samples) {
    const peaks = computePeaks(samples, w)
    g.fillStyle = color('text-muted')
    peaks.forEach((p, i) => { const ph = Math.max(1, p * h * 0.9); g.fillRect(i, (h - ph) / 2, 1, ph) })
  }
  g.fillStyle = color('cursor')
  g.fillRect(Math.round(x(audio.currentTime)), 0, Math.max(1, dpr), h)
}

/** While playing: the playhead moves, the loop returns to A, the time is written. */
function tick(container: HTMLElement) {
  cancelAnimationFrame(frame)
  if (!audio || audio.paused) return
  const back = loopTarget(audio.currentTime, loopA, loopB, audio.duration)
  if (back !== null) audio.currentTime = back
  const time = container.querySelector('.player-time')
  if (time) time.textContent = `${formatTime(audio.currentTime, true)} / ${formatTime(audio.duration)}`
  drawWave(container)
  frame = requestAnimationFrame(() => tick(container))
}

export function renderPlayer(container: HTMLElement) {
  const loaded = !!audio?.src
  const dis = loaded ? '' : ' disabled'
  const mark = (s: number | null) => s === null ? '' : ` ${formatTime(s, true)}`
  container.innerHTML = `
    <div class="player-head">
      <label class="ctrl-btn player-open" title="${escapeHtml(t('player.open.title'))}">${escapeHtml(t('player.open'))}<input type="file" accept="audio/*" hidden></label>
      <span class="player-name">${escapeHtml(fileName || t('player.none'))}</span>
    </div>
    <canvas class="player-wave" title="${escapeHtml(t('player.wave.title'))}"></canvas>
    <div class="player-ctrl">
      <button class="ctrl-btn" data-act="back" title="${escapeHtml(t('player.back.title'))}"${dis}>⟲5</button>
      <button class="ctrl-btn" data-act="play" title="${escapeHtml(t('player.play.title'))}"${dis}>${audio && !audio.paused ? '⏸' : '▶'}</button>
      <span class="player-time">${formatTime(audio?.currentTime ?? 0, true)} / ${formatTime(audio?.duration ?? 0)}</span>
      <select class="player-speed" title="${escapeHtml(t('player.speed.title'))}">
        ${SPEEDS.map(s => `<option value="${s}"${s === speed ? ' selected' : ''}>${Math.round(Number(s) * 100)}%</option>`).join('')}
      </select>
      <button class="size-ctrl-btn${loopA !== null ? ' active' : ''}" data-act="a" title="${escapeHtml(t('player.a.title'))}"${dis}>A${mark(loopA)}</button>
      <button class="size-ctrl-btn${loopB !== null ? ' active' : ''}" data-act="b" title="${escapeHtml(t('player.b.title'))}"${dis}>B${mark(loopB)}</button>
      <button class="size-ctrl-btn" data-act="clear" title="${escapeHtml(t('player.clear.title'))}"${loopA === null ? ' disabled' : ''}>×</button>
    </div>`

  const input = container.querySelector<HTMLInputElement>('input[type=file]')!
  input.addEventListener('change', () => { const f = input.files?.[0]; if (f) openFile(f, container) })
  container.ondragover = e => { e.preventDefault() }
  container.ondrop = e => {
    const f = e.dataTransfer?.files?.[0]
    if (!f || !f.type.startsWith('audio')) return
    e.preventDefault()
    openFile(f, container)
  }

  container.querySelector<HTMLSelectElement>('.player-speed')!.addEventListener('change', e => {
    speed = (e.target as HTMLSelectElement).value as Speed
    save('player-speed', speed)
    if (audio) audio.playbackRate = Number(speed)
  })

  container.querySelectorAll<HTMLButtonElement>('[data-act]').forEach(b => b.addEventListener('click', () => {
    if (!audio?.src) return
    const act = b.dataset.act
    if (act === 'play') {
      if (audio.paused) audio.play().then(() => tick(container)).catch(() => {})
      else audio.pause()
    } else if (act === 'back') audio.currentTime = Math.max(loopA ?? 0, audio.currentTime - 5)
    else if (act === 'a') { loopA = audio.currentTime; if (loopB !== null && loopB <= loopA) loopB = null }
    else if (act === 'b') { if (loopA === null) loopA = 0; loopB = audio.currentTime > loopA ? audio.currentTime : null }
    else if (act === 'clear') loopA = loopB = null
    renderPlayer(container)
  }))

  const canvas = container.querySelector<HTMLCanvasElement>('.player-wave')!
  canvas.addEventListener('click', e => {
    if (!audio?.src || !isFinite(audio.duration)) return
    const r = canvas.getBoundingClientRect()
    audio.currentTime = Math.max(0, Math.min(audio.duration, ((e.clientX - r.left) / r.width) * audio.duration))
    renderPlayer(container)
  })

  if (audio) {
    audio.onloadedmetadata = () => renderPlayer(container)
    audio.onpause = () => { cancelAnimationFrame(frame); renderPlayer(container) }
    // A loop with no B runs to the end and starts again at A
    audio.onended = () => {
      if (loopA !== null) { audio.currentTime = loopA; audio.play().catch(() => {}); return }
      cancelAnimationFrame(frame)
      renderPlayer(container)
    }
    audio.onplay = () => tick(container)
  }
  requestAnimationFrame(() => drawWave(container))
  // The waveform follows the panel's size
  if (observed !== container && typeof ResizeObserver !== 'undefined') {
    observed = container
    new ResizeObserver(() => drawWave(container)).observe(container)
  }
}

let observed: HTMLElement | null = null

/** For tests: the element that plays. */
export function playerAudio(): HTMLAudioElement | null { return audio }
