// The guided tour: on the first visit, ten steps that point at each part of the page and
// say what it is for. Skipped, finished or closed, it does not come back by itself; the
// help panel starts it again. A step whose panel is hidden is shown in the middle.

import { escapeHtml } from './html'
import { loadBool, save } from './storage'
import { t } from '../i18n/i18n'
import type { StringKey } from '../i18n/en'

const STEPS: { id: string; target: string | null }[] = [
  { id: 'welcome', target: null },
  { id: 'input', target: '#btn-input-status' },
  { id: 'key', target: '#btn-key' },
  { id: 'analysis', target: '#mod-analysis' },
  { id: 'explain', target: '#mod-explain' },
  { id: 'cof', target: '#mod-cof' },
  { id: 'history', target: '#mod-history' },
  { id: 'layout', target: '#btn-layout, #tab-layout' },   // the top bar's, or the bottom bar's on a phone
  { id: 'practice', target: '#mod-progressions' },
  { id: 'help', target: '#btn-help' },
]

let step = -1
let returnFocus: HTMLElement | null = null

/** The tour on a first visit; never in a browser driven by tests (it would cover the page). */
export function maybeStartTour() {
  if (loadBool('tour-done', false) || navigator.webdriver) return
  startTour()
}

export function startTour() {
  returnFocus = document.activeElement as HTMLElement | null
  step = 0
  draw()
  document.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', draw)
}

export function endTour() {
  if (step < 0) return
  step = -1
  save('tour-done', true)
  document.getElementById('tour')?.remove()
  document.removeEventListener('keydown', onKey, true)
  window.removeEventListener('resize', draw)
  returnFocus?.focus()
}

function go(to: number) {
  if (to < 0) return
  if (to >= STEPS.length) { endTour(); return }
  step = to
  draw()
}

function onKey(e: KeyboardEvent) {
  if (step < 0) return
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTour() }
  else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); go(step + 1) }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(step - 1) }
}

/** The first of the targets that is on the page and shown. */
function visibleTarget(selector: string | null): HTMLElement | null {
  if (!selector) return null
  return [...document.querySelectorAll<HTMLElement>(selector)].find(el => {
    if (el.closest('.module-hidden')) return false
    const r = el.getBoundingClientRect()
    return r.width && r.height
  }) ?? null
}

function draw() {
  if (step < 0) return
  const s = STEPS[step]
  let root = document.getElementById('tour')
  if (!root) {
    root = document.createElement('div')
    root.id = 'tour'
    document.body.appendChild(root)
  }
  const target = visibleTarget(s.target)
  target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  const r = target?.getBoundingClientRect()
  const pad = 6
  const spot = r ? `<div class="tour-spot" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>` : '<div class="tour-dim"></div>'
  const last = step === STEPS.length - 1
  root.innerHTML = `${spot}
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" tabindex="-1">
      <div class="tour-count">${step + 1} / ${STEPS.length}</div>
      <h2 id="tour-title" class="tour-title">${escapeHtml(t(`tour.${s.id}.title` as StringKey))}</h2>
      <p class="tour-text">${escapeHtml(t((target?.closest('#tabbar') ? `tour.${s.id}.touch` : `tour.${s.id}`) as StringKey))}</p>
      <div class="tour-buttons">
        <button class="ctrl-btn" data-tour="skip">${escapeHtml(t(last ? 'tour.close' : 'tour.skip'))}</button>
        <span class="tour-gap"></span>
        <button class="ctrl-btn" data-tour="back"${step === 0 ? ' disabled' : ''}>${escapeHtml(t('tour.back'))}</button>
        <button class="ctrl-btn tour-next" data-tour="next">${escapeHtml(t(last ? 'tour.done' : 'tour.next'))}</button>
      </div>
    </div>`
  const card = root.querySelector<HTMLElement>('.tour-card')!
  // Beside the target when there is room, under it otherwise; in the middle with no target
  const cw = Math.min(360, window.innerWidth - 24)
  card.style.width = `${cw}px`
  if (r) {
    const below = r.bottom + 12, above = r.top - 12
    const left = Math.max(12, Math.min(window.innerWidth - cw - 12, r.left))
    card.style.left = `${left}px`
    const h = card.offsetHeight
    card.style.top = below + h < window.innerHeight ? `${below}px` : above - h > 0 ? `${above - h}px` : `${Math.max(12, (window.innerHeight - h) / 2)}px`
  } else {
    card.style.left = `${(window.innerWidth - cw) / 2}px`
    card.style.top = `${Math.max(12, (window.innerHeight - card.offsetHeight) / 2)}px`
  }
  root.querySelector('[data-tour="next"]')!.addEventListener('click', () => go(step + 1))
  root.querySelector('[data-tour="back"]')!.addEventListener('click', () => go(step - 1))
  root.querySelector('[data-tour="skip"]')!.addEventListener('click', endTour)
  root.querySelector<HTMLElement>('.tour-next')!.focus()
}
