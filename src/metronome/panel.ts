// The Metronome panel: start and stop, the tempo (−, +, typed, tapped), what it counts as tabs
// (a meter, a cycle, a clave, a Euclidean rhythm, a polyrhythm), the subdivision, and the
// necklace: the pulses round a circle, groups as arcs, the one sounding lit, a polyrhythm's
// second voice as an inner ring. The tempo trainer lives in the panel's ⋯ menu.

import { escapeHtml } from '../ui/html'
import { t } from '../i18n/i18n'
import type { StringKey } from '../i18n/en'
import { parseMeter, type MetronomeMode, type MetronomePattern } from './pattern'
import {
  getMetronome, getPattern, setMetronome, startMetronome, stopMetronome, isMetronomeRunning,
  currentClick, tap, setMetronomeChangeCallback, TEMPO_MIN, TEMPO_MAX,
} from './engine'

type Tab = MetronomeMode['kind']
const TABS: Tab[] = ['meter', 'cycle', 'clave', 'euclid', 'poly']
const METERS = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '2+2+3/8', '3+3+2/8', '9/8', '2+2+2+3/8', '12/8']
const POLYS: [number, number][] = [[3, 2], [2, 3], [4, 3], [3, 4], [5, 4], [5, 3]]
const TRADITIONS = ['hindustani', 'carnatic', 'flamenco', 'aksak'] as const

// The tab shown; a mode is set from it when a choice is made, not when it is opened
let tab: Tab = getMetronome().mode.kind

const meterText = (m: MetronomeMode) => m.kind === 'meter' ? `${m.numerators.join('+')}/${m.denominator}` : ''

function modeLabel(m: MetronomeMode): string {
  switch (m.kind) {
    case 'meter': return meterText(m)
    case 'cycle': return UMT.RHYTHMIC_CYCLES[m.id]?.name ?? m.id
    case 'clave': return UMT.CLAVE_PATTERNS[m.id]?.name ?? m.id
    case 'euclid': return `E(${m.pulses}, ${m.steps})`
    case 'poly': return `${m.a}:${m.b}`
  }
}

const chip = (attrs: string, label: string, on: boolean, title = '') =>
  `<button type="button" class="menu-chip" ${attrs} aria-pressed="${on}"${title ? ` title="${escapeHtml(title)}"` : ''}>${escapeHtml(label)}</button>`
const num = (field: string, value: number, min: number, max: number, label: string) =>
  `<input type="number" class="metro-num" data-field="${field}" min="${min}" max="${max}" step="1" value="${value}" aria-label="${escapeHtml(label)}">`

function choices(): string {
  const m = getMetronome().mode
  switch (tab) {
    case 'meter':
      return `<div class="metro-choices">
        <input type="text" class="metro-meter" value="${escapeHtml(meterText(m) || '4/4')}" aria-label="${escapeHtml(t('metro.meter'))}" title="${escapeHtml(t('metro.meter.title'))}" spellcheck="false">
        ${METERS.map(s => chip(`data-meter="${s}"`, s, meterText(m) === s)).join('')}</div>`
    case 'cycle':
      return TRADITIONS.map(tr => {
        const ids = Object.keys(UMT.RHYTHMIC_CYCLES).filter(id => UMT.RHYTHMIC_CYCLES[id].tradition === tr)
        return `<div class="metro-choices"><span class="metro-label">${escapeHtml(t(`metro.trad.${tr}` as StringKey))}</span>${ids.map(id => {
          const c = UMT.RHYTHMIC_CYCLES[id]
          return chip(`data-cycle="${id}"`, c.name, m.kind === 'cycle' && m.id === id, `${c.beats} · ${c.groups.join('+')} — ${c.source}`)
        }).join('')}</div>`
      }).join('')
    case 'clave':
      return `<div class="metro-choices">${Object.keys(UMT.CLAVE_PATTERNS).map(id =>
        chip(`data-clave="${id}"`, UMT.CLAVE_PATTERNS[id].name, m.kind === 'clave' && m.id === id, UMT.CLAVE_PATTERNS[id].description)).join('')}</div>`
    case 'euclid': {
      const e = m.kind === 'euclid' ? m : { pulses: 3, steps: 8 }
      return `<div class="metro-choices">
        ${num('pulses', e.pulses, 0, 32, t('metro.euclid.k'))}<span class="metro-label">${escapeHtml(t('metro.euclid.k'))} ${escapeHtml(t('metro.euclid.in'))}</span>
        ${num('steps', e.steps, 1, 32, t('metro.euclid.n'))}<span class="metro-label">${escapeHtml(t('metro.euclid.n'))}</span>
        <button type="button" class="menu-chip" data-euclid aria-pressed="${m.kind === 'euclid'}">${escapeHtml(t('metro.use'))}</button></div>`
    }
    case 'poly':
      return `<div class="metro-choices">${POLYS.map(([a, b]) => chip(`data-poly="${a}:${b}"`, `${a}:${b}`, m.kind === 'poly' && m.a === a && m.b === b)).join('')}</div>`
  }
}

/** The necklace: one dot a pulse round the circle, groups as arcs outside it, counts beside; a second voice inside. */
function necklace(p: MetronomePattern): string {
  const C = 120, R = [84, 52], arcR = 96, labelR = 108
  const pos = (i: number, n: number, r: number) => {
    const a = (-90 + 360 * i / n) * Math.PI / 180
    return [C + r * Math.cos(a), C + r * Math.sin(a)]
  }
  let svg = ''
  // Groups: an arc from each group's first pulse to just before the next
  let start = 0
  const n0 = p.pulses[0]
  if (p.groups.length > 1) for (const g of p.groups) {
    const [x1, y1] = pos(start + 0.15, n0, arcR), [x2, y2] = pos(start + g - 0.15, n0, arcR)
    const large = g / n0 > 0.5 ? 1 : 0
    svg += `<path class="metro-arc" d="M${x1.toFixed(1)},${y1.toFixed(1)} A${arcR},${arcR} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)}"/>`
    start += g
  }
  p.pulses.forEach((n, v) => {
    for (let i = 0; i < n; i++) {
      const head = p.clicks.find(c => c.voice === v && c.pulse === i && c.kind !== 'sub')
      const kind = head?.kind ?? 'rest'
      const [x, y] = pos(i, n, R[v])
      const r = kind === 'strong' ? 7 : kind === 'accent' || kind === 'poly' ? 6 : kind === 'rest' ? 3 : 5
      svg += `<circle class="metro-dot metro-${kind}" data-v="${v}" data-p="${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"/>`
      // Counts round the outer ring, when they are few enough to read
      if (v === 0 && n <= 24) {
        const [lx, ly] = pos(i, n, labelR)
        svg += `<text class="metro-count" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${p.counts[i]}</text>`
      }
    }
  })
  return `<svg class="metro-necklace" viewBox="0 0 240 240" role="img" aria-label="${escapeHtml(t('metro.necklace'))}">${svg}</svg>`
}

let container: HTMLElement | null = null
let frame = 0

/** While running, the dot of the click sounding is lit; between clicks the last one stays lit. */
function light() {
  cancelAnimationFrame(frame)
  if (!container) return
  const c = currentClick()
  container.querySelectorAll('.metro-dot.lit').forEach(d => d.classList.remove('lit'))
  if (c) container.querySelector(`.metro-dot[data-v="${c.voice}"][data-p="${c.pulse}"]`)?.classList.add('lit')
  if (isMetronomeRunning()) frame = requestAnimationFrame(light)
}

export function renderMetronome(el: HTMLElement) {
  container = el
  const s = getMetronome()
  const running = isMetronomeRunning()
  const splits = tab === 'meter' || tab === 'cycle' || tab === 'euclid'
  el.innerHTML = `
    <div class="metro-head">
      <button type="button" class="ctrl-btn metro-play" title="${escapeHtml(t(running ? 'metro.stop' : 'metro.start'))}" aria-label="${escapeHtml(t(running ? 'metro.stop' : 'metro.start'))}">${running ? '■' : '▶'}</button>
      <span class="metro-tempo" role="group" aria-label="${escapeHtml(t('metro.tempo'))}">
        <button type="button" class="size-ctrl-btn" data-tempo="-1" aria-label="${escapeHtml(t('ctrl.smaller'))}">−</button>
        ${num('tempo', s.tempo, TEMPO_MIN, TEMPO_MAX, t('metro.tempo'))}<span class="metro-label">bpm</span>
        <button type="button" class="size-ctrl-btn" data-tempo="1" aria-label="${escapeHtml(t('ctrl.larger'))}">+</button>
      </span>
      <button type="button" class="ctrl-btn metro-tap" title="${escapeHtml(t('metro.tap.title'))}">${escapeHtml(t('metro.tap'))}</button>
      <span class="metro-now">${escapeHtml(modeLabel(s.mode))}${s.trainer.on ? ` · ${escapeHtml(t('metro.trainer.on', { max: s.trainer.max }))}` : ''}</span>
    </div>
    <span class="strings-tabs metro-tabs" role="group" aria-label="${escapeHtml(t('metro.kind'))}">${TABS.map(k =>
      `<button type="button" class="strings-tab" data-tab="${k}" aria-pressed="${k === tab}">${escapeHtml(t(`metro.tab.${k}` as StringKey))}</button>`).join('')}</span>
    ${choices()}
    ${splits ? `<div class="metro-choices"><span class="metro-label">${escapeHtml(t('metro.sub'))}</span>${[1, 2, 3, 4, 5, 6].map(n =>
      chip(`data-sub="${n}"`, String(n), s.sub === n, t('metro.sub.title', { n }))).join('')}</div>` : ''}
    ${necklace(getPattern())}`

  const set = (mode: MetronomeMode) => { setMetronome({ mode }) }
  el.querySelector('.metro-play')!.addEventListener('click', () => isMetronomeRunning() ? stopMetronome() : startMetronome())
  el.querySelector('.metro-tap')!.addEventListener('click', () => tap())
  el.querySelectorAll<HTMLButtonElement>('[data-tempo]').forEach(b => b.addEventListener('click', () => setMetronome({ tempo: getMetronome().tempo + Number(b.dataset.tempo) })))
  el.querySelector<HTMLInputElement>('.metro-num[data-field="tempo"]')!.addEventListener('change', e => setMetronome({ tempo: Number((e.target as HTMLInputElement).value) || getMetronome().tempo }))
  el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab as Tab; renderMetronome(el) }))
  el.querySelectorAll<HTMLButtonElement>('[data-meter]').forEach(b => b.addEventListener('click', () => { const m = parseMeter(b.dataset.meter!); if (m) set({ kind: 'meter', ...m }) }))
  el.querySelector<HTMLInputElement>('.metro-meter')?.addEventListener('change', e => {
    const input = e.target as HTMLInputElement
    const m = parseMeter(input.value)
    input.classList.toggle('invalid', !m)
    if (m) set({ kind: 'meter', ...m })
  })
  el.querySelectorAll<HTMLButtonElement>('[data-cycle]').forEach(b => b.addEventListener('click', () => set({ kind: 'cycle', id: b.dataset.cycle! })))
  el.querySelectorAll<HTMLButtonElement>('[data-clave]').forEach(b => b.addEventListener('click', () => set({ kind: 'clave', id: b.dataset.clave! })))
  el.querySelectorAll<HTMLButtonElement>('[data-poly]').forEach(b => b.addEventListener('click', () => {
    const [a, c] = b.dataset.poly!.split(':').map(Number)
    set({ kind: 'poly', a, b: c })
  }))
  el.querySelector('[data-euclid]')?.addEventListener('click', () => {
    const v = (f: string) => Number(el.querySelector<HTMLInputElement>(`.metro-num[data-field="${f}"]`)!.value)
    set({ kind: 'euclid', pulses: v('pulses'), steps: v('steps') })
  })
  el.querySelectorAll<HTMLButtonElement>('[data-sub]').forEach(b => b.addEventListener('click', () => setMetronome({ sub: Number(b.dataset.sub) })))
  wireTrainer()
  light()
}

/** The trainer's controls, in the panel's ⋯ menu (built with the layout). */
function wireTrainer() {
  const menu = document.getElementById('menu-metronome')
  if (!menu || menu.dataset.wired) return
  menu.dataset.wired = '1'
  const tr = getMetronome().trainer
  const on = menu.querySelector<HTMLButtonElement>('#btn-metro-trainer')
  on?.setAttribute('aria-pressed', String(tr.on))
  on?.addEventListener('click', () => {
    const now = !getMetronome().trainer.on
    setMetronome({ trainer: { ...getMetronome().trainer, on: now } })
    on.setAttribute('aria-pressed', String(now))
  })
  menu.querySelectorAll<HTMLInputElement>('input[data-trainer]').forEach(i => {
    i.value = String(tr[i.dataset.trainer as 'step' | 'every' | 'max'])
    i.addEventListener('change', () => setMetronome({ trainer: { ...getMetronome().trainer, [i.dataset.trainer!]: Math.max(1, Number(i.value) || 1) } }))
  })
}

/** The trainer's rows for the ⋯ menu. */
export function metronomeMenuHtml(): string {
  const row = (field: string, label: string, unit: string) =>
    `<label class="menu-row metro-trainer-row"><span class="menu-label">${escapeHtml(label)}</span><input type="number" class="metro-num" data-trainer="${field}" min="1" max="${TEMPO_MAX}" step="1"><span class="metro-label">${escapeHtml(unit)}</span></label>`
  return `<button type="button" id="btn-metro-trainer" class="menu-item" aria-pressed="false" title="${escapeHtml(t('metro.trainer.title'))}"><span class="menu-check" aria-hidden="true"></span><span class="menu-label">${escapeHtml(t('metro.trainer'))}</span></button>
    ${row('step', t('metro.trainer.step'), 'bpm')}${row('every', t('metro.trainer.every'), t('metro.trainer.cycles'))}${row('max', t('metro.trainer.max'), 'bpm')}`
}

// Drawn again when the settings change (and when it starts or stops); the dot follows without a redraw
setMetronomeChangeCallback(() => { if (container?.isConnected) renderMetronome(container) })
