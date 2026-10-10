// A view window: one element of the detector, alone, filling the window, on a chroma or
// dark background, for an OBS window capture. It plays nothing and takes no input: the
// main window sends what is on screen (view/channel.ts).

import { subscribeView, VIEW_BACKGROUNDS, VIEW_NAMES } from './channel'
import type { ViewName, ViewBackground, ViewState } from './channel'
import { renderStaff } from '../diagrams/staff'
import { renderPiano } from '../diagrams/piano'
import { renderGuitar } from '../diagrams/guitar'
import { renderCircleOfFifths } from '../diagrams/cof'
import type { CofOptions } from '../diagrams/cof'
import { chordColor, NEUTRAL_COLOR } from '../theory/chord'
import { escapeHtml } from '../ui/html'
import { loadBool, loadChoice } from '../ui/storage'

const FUNCTION_NAMES: Record<string, string> = { T: 'Tonic', S: 'Subdominant', D: 'Dominant' }

/** Makes an SVG scale to its container: a viewBox from its size, no fixed width or height. */
function fitSvg(svg: SVGSVGElement | null) {
  if (!svg) return
  if (!svg.getAttribute('viewBox')) {
    const w = parseFloat(svg.getAttribute('width') ?? ''), h = parseFloat(svg.getAttribute('height') ?? '')
    if (w > 0 && h > 0) svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  }
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.style.width = '100%'
  svg.style.height = '100%'
}

function cofOptions(): CofOptions {
  return {
    accidental: loadChoice('cof-accidental', ['flat', 'sharp'] as const, 'flat'),
    showMinor: loadBool('cof-show-minor', true),
    showDegrees: loadBool('cof-show-degrees', false),
    show7ths: loadBool('cof-show-7ths', false),
  }
}

function renderChordView(el: HTMLElement, s: ViewState) {
  if (!s.label) { el.innerHTML = ''; return }
  const color = s.symbol ? chordColor(s.symbol) : NEUTRAL_COLOR
  const detail = s.kind === 'chord' && s.roman && s.roman !== '?'
    ? [s.roman, s.function ? FUNCTION_NAMES[s.function] : null].filter(Boolean).join(' · ')
    : ''
  el.innerHTML = `
    <div class="view-chord-name" style="color:${color}">${escapeHtml(s.label)}</div>
    ${detail ? `<div class="view-chord-detail">${escapeHtml(detail)}</div>` : ''}`
}

function render(view: ViewName, el: HTMLElement, s: ViewState) {
  if (view === 'chord') return renderChordView(el, s)
  if (view === 'staff') {
    // A short staff (clef, signature, chord). abcjs fixes the height of the element it
    // draws into, so it draws into an inner one that is then stretched.
    el.innerHTML = '<div></div>'
    const inner = el.firstElementChild as HTMLElement
    renderStaff(inner, s.notes, 200, s.key, 1)
    inner.style.height = '100%'
    inner.style.width = '100%'
  }
  else if (view === 'cof') renderCircleOfFifths(el, s.key, s.symbol, () => {}, 400, { ...cofOptions(), backdrop: '#1a1a2e' })
  else if (view === 'piano') renderPiano(el, s.notes, s.symbol)
  else if (view === 'guitar') renderGuitar(el, s.symbol, s.notes, s.guitarVoicing)
  fitSvg(el.querySelector('svg'))
}

/** Reads `?view=` and `?bg=`; false when the page is not a view window. */
export function runViewerFromUrl(): boolean {
  const params = new URLSearchParams(location.search)
  const view = params.get('view') as ViewName | null
  if (!view || !VIEW_NAMES.includes(view)) return false
  const bg = (params.get('bg') ?? 'green') as ViewBackground
  const background = VIEW_BACKGROUNDS[bg] ?? VIEW_BACKGROUNDS.green

  // A stable title: OBS window capture finds the window by it.
  document.title = `Modus view: ${view}`
  document.body.classList.add('view-mode')
  document.body.style.background = background
  document.getElementById('app')!.style.display = 'none'
  const el = document.createElement('div')
  el.id = 'view-content'
  el.className = `view-${view}`
  document.body.appendChild(el)

  subscribeView(s => render(view, el, s))
  // Guitar tuning and CoF options live in localStorage: when the main window changes
  // them, the view reloads with them (songs are saved there too, and are ignored).
  window.addEventListener('storage', e => {
    if (e.key && /^(guitar-|cof-)/.test(e.key)) location.reload()
  })
  return true
}
