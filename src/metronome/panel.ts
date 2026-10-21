// The Metronome panel. The drawing leads: the head holds start and stop, the tempo (−, +,
// typed, tapped), the mode in force and the subdivision (each a button with its menu, over
// the drawing) and the view. The mode's menu: the kinds on the left (meter, cycle, clave,
// Euclidean rhythm, polyrhythm), the choices of the one picked on the right, the recent
// modes on top. Two views: the necklace (the pulses round a circle, groups as arcs, a
// polyrhythm's second voice inside) and the pulses (a block a pulse in a row, accented ones
// taller, a group a gap). Both carry the count sounding, large, and flash on the accents,
// as metronome apps cue the beat for the eye. The trainer and the flash live in the ⋯ menu.

import { escapeHtml } from '../ui/html'
import { loadBool, loadChoice, loadJSON, save } from '../ui/storage'
import { wirePopover, closePopover, isPopoverOpen } from '../ui/popover'
import { t } from '../i18n/i18n'
import type { StringKey } from '../i18n/en'
import { parseMeter, type ClickKind, type MetronomeMode, type MetronomePattern } from './pattern'
import {
  getMetronome, getPattern, setMetronome, startMetronome, stopMetronome, isMetronomeRunning,
  currentClick, tap, setMetronomeChangeCallback, TEMPO_MIN, TEMPO_MAX,
} from './engine'

type Kind = MetronomeMode['kind']
const KINDS: Kind[] = ['meter', 'cycle', 'clave', 'euclid', 'poly']
// The meters most played; any other is typed
const METERS = ['2/4', '3/4', '4/4', '6/8', '7/8', '2+2+3/8']
const TRADITIONS = ['hindustani', 'carnatic', 'flamenco', 'aksak'] as const
const VIEWS = ['necklace', 'pulses'] as const
type View = typeof VIEWS[number]
const RECENT_MAX = 4

// The kind shown on the right of the mode's menu; a mode is set only when a choice is made
let kind: Kind = getMetronome().mode.kind
let view = loadChoice<View>('metronome-view', VIEWS, 'necklace')
let flash = loadBool('metronome-flash', true)
let showCount = loadBool('metronome-count', true)
let recent = loadJSON<MetronomeMode[]>('metronome-recent', [])
// The Euclidean rhythm and the polyrhythm being set in the menu, before Use
let draftEuclid = { pulses: 3, steps: 8 }
let draftPoly = { a: 3, b: 2 }

const meterText = (m: MetronomeMode) => m.kind === 'meter' ? `${m.numerators.join('+')}/${m.denominator}` : ''
const sameMode = (a: MetronomeMode, b: MetronomeMode) => JSON.stringify(a) === JSON.stringify(b)

function modeLabel(m: MetronomeMode): string {
  switch (m.kind) {
    case 'meter': return meterText(m)
    case 'cycle': return UMT.RHYTHMIC_CYCLES[m.id]?.name ?? m.id
    case 'clave': return UMT.CLAVE_PATTERNS[m.id]?.name ?? m.id
    case 'euclid': return `E(${m.pulses}, ${m.steps})`
    case 'poly': return `${m.a}:${m.b}`
  }
}

/** A mode chosen: set, kept first among the recent ones, the menu closed. */
function choose(mode: MetronomeMode) {
  recent = [mode, ...recent.filter(r => !sameMode(r, mode))].slice(0, RECENT_MAX)
  save('metronome-recent', recent)
  closePopover()
  setMetronome({ mode })
}

const row = (attrs: string, label: string, on: boolean, hint = '', title = '') =>
  `<button type="button" class="choice-row" ${attrs} aria-pressed="${on}"${title ? ` title="${escapeHtml(title)}"` : ''}>${escapeHtml(label)}${hint ? `<span class="choice-hint">${escapeHtml(hint)}</span>` : ''}</button>`
const chip = (attrs: string, label: string, on: boolean, title = '') =>
  `<button type="button" class="menu-chip" ${attrs} aria-pressed="${on}"${title ? ` title="${escapeHtml(title)}"` : ''}>${escapeHtml(label)}</button>`
const stepper = (field: string, value: number, label: string) =>
  `<span class="metro-stepper" role="group" aria-label="${escapeHtml(label)}">
    <button type="button" class="size-ctrl-btn" data-step="${field}" data-dir="-1" aria-label="${escapeHtml(t('ctrl.smaller'))}">−</button>
    <span class="metro-step-value" data-value="${field}">${value}</span>
    <button type="button" class="size-ctrl-btn" data-step="${field}" data-dir="1" aria-label="${escapeHtml(t('ctrl.larger'))}">+</button>
  </span>`

/** The right column of the mode's menu: the choices of the kind picked. */
function options(): string {
  const m = getMetronome().mode
  switch (kind) {
    case 'meter':
      return `<input type="text" class="metro-meter" value="${escapeHtml(meterText(m) || '4/4')}" aria-label="${escapeHtml(t('metro.meter'))}" title="${escapeHtml(t('metro.meter.title'))}" spellcheck="false">
        <div class="menu-chips">${METERS.map(s => chip(`data-meter="${s}"`, s, meterText(m) === s)).join('')}</div>`
    case 'cycle':
      return TRADITIONS.map(tr => `<div class="choice-group">${escapeHtml(t(`metro.trad.${tr}` as StringKey))}</div>` +
        Object.keys(UMT.RHYTHMIC_CYCLES).filter(id => UMT.RHYTHMIC_CYCLES[id].tradition === tr).map(id => {
          const c = UMT.RHYTHMIC_CYCLES[id]
          return row(`data-cycle="${id}"`, c.name, m.kind === 'cycle' && m.id === id, String(c.beats), `${c.groups.join('+')} — ${c.source}`)
        }).join('')).join('')
    case 'clave':
      return Object.keys(UMT.CLAVE_PATTERNS).map(id =>
        row(`data-clave="${id}"`, UMT.CLAVE_PATTERNS[id].name, m.kind === 'clave' && m.id === id, '', UMT.CLAVE_PATTERNS[id].description)).join('')
    case 'euclid':
      return `<div class="metro-draft">${stepper('pulses', draftEuclid.pulses, t('metro.euclid.k'))}<span class="metro-label">${escapeHtml(t('metro.euclid.k'))} ${escapeHtml(t('metro.euclid.in'))}</span>
        ${stepper('steps', draftEuclid.steps, t('metro.euclid.n'))}<span class="metro-label">${escapeHtml(t('metro.euclid.n'))}</span></div>
        <button type="button" class="song-btn song-btn-main" data-use="euclid">${escapeHtml(t('metro.use'))}</button>`
    case 'poly':
      return `<div class="metro-draft">${stepper('a', draftPoly.a, t('metro.poly.a'))}<span class="metro-label">:</span>${stepper('b', draftPoly.b, t('metro.poly.b'))}</div>
        <button type="button" class="song-btn song-btn-main" data-use="poly">${escapeHtml(t('metro.use'))}</button>`
  }
}

/** The whole menu: the recent modes, the kinds, the choices of the kind picked. */
function modeMenu(): string {
  const m = getMetronome().mode
  const recents = recent.filter(r => !sameMode(r, m))
  return `<div class="view-menu pop-menu metro-pop" role="dialog" aria-label="${escapeHtml(t('metro.kind'))}">
    ${recents.length ? `<div class="metro-recent"><span class="metro-label">${escapeHtml(t('metro.recent'))}</span>${recents.map((r, i) =>
      chip(`data-recent="${i}"`, modeLabel(r), false)).join('')}</div>` : ''}
    <div class="metro-pop-cols">
      <div class="metro-kinds" role="group" aria-label="${escapeHtml(t('metro.kind'))}">${KINDS.map(k =>
        `<button type="button" class="choice-row${k === kind ? ' active-mode' : ''}" data-kind="${k}">${escapeHtml(t(`metro.tab.${k}` as StringKey))}</button>`).join('')}</div>
      <div class="metro-options">${options()}</div>
    </div>
  </div>`
}

/** The subdivision's menu: 1–6 clicks a pulse. */
function subMenu(): string {
  const sub = getMetronome().sub
  return `<div class="view-menu pop-menu metro-sub-pop" role="group" aria-label="${escapeHtml(t('metro.sub'))}">
    <div class="view-menu-title">${escapeHtml(t('metro.sub'))}</div>
    <div class="menu-chips">${[1, 2, 3, 4, 5, 6].map(n => chip(`data-sub="${n}"`, String(n), sub === n, t('metro.sub.title', { n }))).join('')}</div>
  </div>`
}

/** What each pulse is, from its first click that is not a subdivision ('rest' where it has none: a clave's empty step). */
const pulseKind = (p: MetronomePattern, v: number, i: number): ClickKind | 'rest' =>
  p.clicks.find(c => c.voice === v && c.pulse === i && c.kind !== 'sub')?.kind ?? 'rest'

/** The count shown before it starts: the first pulse's. */
const firstCount = (p: MetronomePattern) => String(p.counts[0] ?? 1)

/** The necklace: one dot a pulse round the circle, groups as arcs outside it, counts beside, the count sounding in the middle. */
function necklace(p: MetronomePattern): string {
  const C = 120, R = [84, 52], arcR = 96, labelR = 108
  const pos = (i: number, n: number, r: number) => {
    const a = (-90 + 360 * i / n) * Math.PI / 180
    return [C + r * Math.cos(a), C + r * Math.sin(a)]
  }
  let svg = `<circle class="metro-halo" cx="${C}" cy="${C}" r="${arcR + 6}"/>`
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
      const k = pulseKind(p, v, i)
      const [x, y] = pos(i, n, R[v])
      const r = k === 'strong' ? 7 : k === 'accent' || k === 'poly' ? 6 : k === 'rest' ? 3 : 5
      svg += `<circle class="metro-dot metro-${k}" data-v="${v}" data-p="${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"/>`
      // Counts round the outer ring, when they are few enough to read
      if (v === 0 && n <= 24) {
        const [lx, ly] = pos(i, n, labelR)
        svg += `<text class="metro-count" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${p.counts[i]}</text>`
      }
    }
  })
  // The count sounding, large, in the middle (inside the polyrhythm's inner ring), when shown
  if (showCount) svg += `<text class="metro-big" x="${C}" y="${C}" font-size="${p.pulses.length > 1 ? 40 : 64}">${firstCount(p)}</text>`
  return `<svg class="metro-necklace" viewBox="0 0 240 240" role="img" aria-label="${escapeHtml(t('metro.necklace'))}">${svg}</svg>`
}

/** The pulses: a block a pulse, groups apart, accented ones taller; a polyrhythm's voices as two rows; the count above. */
function pulses(p: MetronomePattern): string {
  const rowOf = (v: number) => {
    const n = p.pulses[v]
    // A row's groups: the pattern's for the first voice, one group for the second
    const groups = v === 0 ? p.groups : [n]
    let i = 0
    return `<div class="metro-row">${groups.map(g => `<div class="metro-group">${Array.from({ length: g }, () => {
      const k = pulseKind(p, v, i)
      return `<div class="metro-block metro-${k}" data-v="${v}" data-p="${i++}"></div>`
    }).join('')}</div>`).join('')}</div>`
  }
  return `<div class="metro-pulses" role="img" aria-label="${escapeHtml(t('metro.pulsesView'))}">
    ${showCount ? `<div class="metro-big-html">${firstCount(p)}</div>` : ''}
    ${p.pulses.map((_, v) => rowOf(v)).join('')}
  </div>`
}

let container: HTMLElement | null = null
let frame = 0
let lastAt = -1
let flashTimer: ReturnType<typeof setTimeout> | null = null

/** While running: the pulse sounding lit, its count in the middle, and a flash on the accents. */
function light() {
  cancelAnimationFrame(frame)
  if (!container) return
  const now = currentClick()
  if (now && now.at !== lastAt) {
    lastAt = now.at
    const { click } = now
    const p = getPattern()
    container.querySelectorAll('.lit').forEach(d => d.classList.remove('lit'))
    container.querySelectorAll(`.metro-viz [data-v="${click.voice}"][data-p="${click.pulse}"]`).forEach(d => d.classList.add('lit'))
    // The count of the first voice's pulse: the second voice of a polyrhythm keeps the count
    if (click.voice === 0 && click.kind !== 'sub') {
      const big = container.querySelector('.metro-big, .metro-big-html')
      if (big) {
        big.textContent = String(p.counts[click.pulse] ?? click.pulse + 1)
        big.classList.toggle('accent', click.kind === 'strong' || click.kind === 'accent')
      }
    }
    if (flash && (click.kind === 'strong' || click.kind === 'accent')) {
      const viz = container.querySelector('.metro-viz')
      viz?.classList.remove('flash-strong', 'flash-accent')
      void (viz as HTMLElement | null)?.offsetWidth   // restarts the transition on a flash in a row
      viz?.classList.add(click.kind === 'strong' ? 'flash-strong' : 'flash-accent')
      if (flashTimer) clearTimeout(flashTimer)
      flashTimer = setTimeout(() => viz?.classList.remove('flash-strong', 'flash-accent'), 110)
    }
  }
  if (isMetronomeRunning()) frame = requestAnimationFrame(light)
  else { container.querySelectorAll('.lit').forEach(d => d.classList.remove('lit')); lastAt = -1 }
}

export function renderMetronome(el: HTMLElement) {
  container = el
  // Its own menus go with the drawing they belong to; another panel's open menu stays open
  if (container.querySelector<HTMLElement>('.metro-pop.open, .metro-sub-pop.open') && [...container.querySelectorAll<HTMLElement>('.metro-pop, .metro-sub-pop')].some(isPopoverOpen)) closePopover()
  const s = getMetronome()
  const running = isMetronomeRunning()
  // A clave is in sixteenths and a polyrhythm two voices: their pulses are not split
  const splits = s.mode.kind === 'meter' || s.mode.kind === 'cycle' || s.mode.kind === 'euclid'
  kind = s.mode.kind
  if (s.mode.kind === 'euclid') draftEuclid = { pulses: s.mode.pulses, steps: s.mode.steps }
  if (s.mode.kind === 'poly') draftPoly = { a: s.mode.a, b: s.mode.b }
  el.innerHTML = `
    <div class="metro-head">
      <button type="button" class="ctrl-btn metro-play" title="${escapeHtml(t(running ? 'metro.stop' : 'metro.start'))}" aria-label="${escapeHtml(t(running ? 'metro.stop' : 'metro.start'))}">${running ? '■' : '▶'}</button>
      <span class="metro-tempo" role="group" aria-label="${escapeHtml(t('metro.tempo'))}">
        <button type="button" class="size-ctrl-btn" data-tempo="-1" aria-label="${escapeHtml(t('ctrl.smaller'))}">−</button>
        <input type="number" class="metro-num" data-field="tempo" min="${TEMPO_MIN}" max="${TEMPO_MAX}" step="1" value="${s.tempo}" aria-label="${escapeHtml(t('metro.tempo'))}"><span class="metro-label">bpm</span>
        <button type="button" class="size-ctrl-btn" data-tempo="1" aria-label="${escapeHtml(t('ctrl.larger'))}">+</button>
      </span>
      <button type="button" class="ctrl-btn metro-tap" title="${escapeHtml(t('metro.tap.title'))}">${escapeHtml(t('metro.tap'))}</button>
      <span class="pop-anchor"><button type="button" class="ctrl-btn metro-mode" title="${escapeHtml(t('metro.kind'))}">${escapeHtml(modeLabel(s.mode))} ▾</button>${modeMenu()}</span>
      ${splits ? `<span class="pop-anchor"><button type="button" class="ctrl-btn metro-sub" title="${escapeHtml(t('metro.sub'))}">♪ ${s.sub} ▾</button>${subMenu()}</span>` : ''}
      ${s.trainer.on ? `<span class="metro-now">${escapeHtml(t('metro.trainer.on', { max: s.trainer.max }))}</span>` : ''}
      <span class="strings-tabs metro-views" role="group" aria-label="${escapeHtml(t('metro.view'))}">${VIEWS.map(v =>
        `<button type="button" class="strings-tab" data-view="${v}" aria-pressed="${v === view}">${escapeHtml(t(`metro.view.${v}` as StringKey))}</button>`).join('')}</span>
    </div>
    <div class="metro-viz${running ? ' running' : ''}">${view === 'necklace' ? necklace(getPattern()) : pulses(getPattern())}</div>`

  el.querySelector('.metro-play')!.addEventListener('click', () => isMetronomeRunning() ? stopMetronome() : startMetronome())
  el.querySelector('.metro-tap')!.addEventListener('click', () => tap())
  el.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.addEventListener('click', () => {
    view = b.dataset.view as View
    save('metronome-view', view)
    renderMetronome(el)
  }))
  el.querySelectorAll<HTMLButtonElement>('[data-tempo]').forEach(b => b.addEventListener('click', () => setMetronome({ tempo: getMetronome().tempo + Number(b.dataset.tempo) })))
  el.querySelector<HTMLInputElement>('.metro-num[data-field="tempo"]')!.addEventListener('change', e => setMetronome({ tempo: Number((e.target as HTMLInputElement).value) || getMetronome().tempo }))

  const pop = el.querySelector<HTMLElement>('.metro-pop')!
  wirePopover(pop, [el.querySelector<HTMLElement>('.metro-mode')!])
  wireModeMenu(pop)
  const subPop = el.querySelector<HTMLElement>('.metro-sub-pop')
  if (subPop) {
    wirePopover(subPop, [el.querySelector<HTMLElement>('.metro-sub')!])
    subPop.querySelectorAll<HTMLButtonElement>('[data-sub]').forEach(b => b.addEventListener('click', () => { closePopover(); setMetronome({ sub: Number(b.dataset.sub) }) }))
  }
  wireMenu()
  lastAt = -1
  light()
}

/** The mode's menu: a kind redraws its column only, so the menu stays open; a choice closes it. */
function wireModeMenu(pop: HTMLElement) {
  const column = pop.querySelector<HTMLElement>('.metro-options')!
  const wireOptions = () => {
    column.innerHTML = options()
    column.querySelectorAll<HTMLButtonElement>('[data-meter]').forEach(b => b.addEventListener('click', () => { const m = parseMeter(b.dataset.meter!); if (m) choose({ kind: 'meter', ...m }) }))
    column.querySelector<HTMLInputElement>('.metro-meter')?.addEventListener('change', e => {
      const input = e.target as HTMLInputElement
      const m = parseMeter(input.value)
      input.classList.toggle('invalid', !m)
      if (m) choose({ kind: 'meter', ...m })
    })
    column.querySelectorAll<HTMLButtonElement>('[data-cycle]').forEach(b => b.addEventListener('click', () => choose({ kind: 'cycle', id: b.dataset.cycle! })))
    column.querySelectorAll<HTMLButtonElement>('[data-clave]').forEach(b => b.addEventListener('click', () => choose({ kind: 'clave', id: b.dataset.clave! })))
    // The steppers change the draft in place; Use applies it
    column.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(b => b.addEventListener('click', () => {
      const field = b.dataset.step!, dir = Number(b.dataset.dir)
      const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
      if (field === 'pulses') draftEuclid.pulses = clamp(draftEuclid.pulses + dir, 0, draftEuclid.steps)
      if (field === 'steps') { draftEuclid.steps = clamp(draftEuclid.steps + dir, 1, 32); draftEuclid.pulses = Math.min(draftEuclid.pulses, draftEuclid.steps) }
      if (field === 'a') draftPoly.a = clamp(draftPoly.a + dir, 1, 12)
      if (field === 'b') draftPoly.b = clamp(draftPoly.b + dir, 1, 12)
      column.querySelectorAll<HTMLElement>('[data-value]').forEach(v => {
        v.textContent = String(({ pulses: draftEuclid.pulses, steps: draftEuclid.steps, a: draftPoly.a, b: draftPoly.b } as Record<string, number>)[v.dataset.value!])
      })
    }))
    column.querySelector('[data-use="euclid"]')?.addEventListener('click', () => choose({ kind: 'euclid', ...draftEuclid }))
    column.querySelector('[data-use="poly"]')?.addEventListener('click', () => choose({ kind: 'poly', ...draftPoly }))
  }
  pop.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(b => b.addEventListener('click', () => {
    kind = b.dataset.kind as Kind
    pop.querySelectorAll('[data-kind]').forEach(k => k.classList.toggle('active-mode', k === b))
    wireOptions()
  }))
  const others = recent.filter(r => !sameMode(r, getMetronome().mode))
  pop.querySelectorAll<HTMLButtonElement>('[data-recent]').forEach(b => b.addEventListener('click', () => choose(others[Number(b.dataset.recent)])))
  wireOptions()
}

/** The trainer and the flash, in the panel's ⋯ menu (built with the layout). */
function wireMenu() {
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
  const count = menu.querySelector<HTMLButtonElement>('#btn-metro-count')
  count?.setAttribute('aria-pressed', String(showCount))
  count?.addEventListener('click', () => {
    showCount = !showCount
    save('metronome-count', showCount)
    count.setAttribute('aria-pressed', String(showCount))
    if (container) renderMetronome(container)
  })
  const fl = menu.querySelector<HTMLButtonElement>('#btn-metro-flash')
  fl?.setAttribute('aria-pressed', String(flash))
  fl?.addEventListener('click', () => {
    flash = !flash
    save('metronome-flash', flash)
    fl.setAttribute('aria-pressed', String(flash))
  })
  menu.querySelectorAll<HTMLInputElement>('input[data-trainer]').forEach(i => {
    i.value = String(tr[i.dataset.trainer as 'step' | 'every' | 'max'])
    i.addEventListener('change', () => setMetronome({ trainer: { ...getMetronome().trainer, [i.dataset.trainer!]: Math.max(1, Number(i.value) || 1) } }))
  })
}

/** The ⋯ menu: the large count and the flash on the accents, then the trainer's rows. */
export function metronomeMenuHtml(): string {
  const field = (name: string, label: string, unit: string) =>
    `<label class="menu-row metro-trainer-row"><span class="menu-label">${escapeHtml(label)}</span><input type="number" class="metro-num" data-trainer="${name}" min="1" max="${TEMPO_MAX}" step="1"><span class="metro-label">${escapeHtml(unit)}</span></label>`
  return `<button type="button" id="btn-metro-count" class="menu-item" aria-pressed="true" title="${escapeHtml(t('metro.count.title'))}"><span class="menu-check" aria-hidden="true"></span><span class="menu-label">${escapeHtml(t('metro.count'))}</span></button>
    <button type="button" id="btn-metro-flash" class="menu-item" aria-pressed="true" title="${escapeHtml(t('metro.flash.title'))}"><span class="menu-check" aria-hidden="true"></span><span class="menu-label">${escapeHtml(t('metro.flash'))}</span></button>
    <div class="menu-sep"></div>
    <button type="button" id="btn-metro-trainer" class="menu-item" aria-pressed="false" title="${escapeHtml(t('metro.trainer.title'))}"><span class="menu-check" aria-hidden="true"></span><span class="menu-label">${escapeHtml(t('metro.trainer'))}</span></button>
    ${field('step', t('metro.trainer.step'), 'bpm')}${field('every', t('metro.trainer.every'), t('metro.trainer.cycles'))}${field('max', t('metro.trainer.max'), 'bpm')}`
}

// Drawn again when the settings change (and when it starts or stops); the pulse follows without a redraw
setMetronomeChangeCallback(() => { if (container?.isConnected) renderMetronome(container) })
