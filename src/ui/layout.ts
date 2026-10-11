// Page structure: the toolbar and the panels on the layout grid (layout/grid.ts). Every
// panel is built once and shown where the layout puts it, or hidden; moving and resizing
// snap to the grid. Behaviour inside the panels is wired in app.ts.

import type { AppState } from '../types'
import { ALL_KEYS } from '../theory/keys'
import { GM_INSTRUMENT_GROUPS, getCurrentInstrument, getVolume } from '../audio/audio'
import { setGuitarControlsVisible } from '../diagrams/guitar'
import { ANALYSIS_FIELD_KEYS, fieldLabel, fieldTooltip } from '../detector/analysis-panel'
import type { AnalysisFieldKey } from '../detector/analysis-panel'
import { loadBool, loadJSON, save } from './storage'
import { escapeHtml } from './html'
import { fitSvg } from './fit'
import { VIEW_NAMES, VIEW_BACKGROUNDS } from '../view/channel'
import type { ViewName, ViewBackground } from '../view/channel'
import { t, keyLabel } from '../i18n/i18n'
import { COLS, placeCell, addCell, removeCell, parseGrid } from '../layout/grid'
import type { Cell, Grid } from '../layout/grid'
import { MODULE_IDS, MODULE_SIZE, PRESETS, PRESET_IDS } from '../layout/presets'
import type { ModuleId, PresetId } from '../layout/presets'

export type Panels = AppState['panels']

const viewLabel = (v: ViewName) => t(`view.${v}`)

const $ = (id: string) => document.getElementById(id)!

/** Which panels show their control rows, as last left. */
export function loadPanels(): Panels {
  return {
    cofControls:      loadBool('panel-cofControls', true),
    guitarControls:   loadBool('panel-guitarControls', true),
    analysisControls: loadBool('panel-analysisControls', true),
  }
}

// ─── Layout state ────────────────────────────────────────────────────────────

let grid: Grid = parseGrid(loadJSON<unknown>('layout', null), MODULE_IDS) ?? PRESETS.standard
const savedLayouts: Record<string, Grid> = loadSavedLayouts()
const layoutListeners: (() => void)[] = []

function loadSavedLayouts(): Record<string, Grid> {
  const raw = loadJSON<unknown>('layouts', {})
  const out: Record<string, Grid> = {}
  if (raw && typeof raw === 'object') {
    for (const [name, value] of Object.entries(raw)) {
      const g = parseGrid(value, MODULE_IDS)
      if (g && name.trim()) out[name] = g
    }
  }
  return out
}

export function currentGrid(): Grid { return grid }
export function isModuleShown(id: ModuleId): boolean { return grid.some(c => c.id === id) }

/** Calls back after the layout changes: panels moved, resized, shown or hidden. */
export function onLayoutChange(f: () => void) { layoutListeners.push(f) }

function setGrid(next: Grid, persist = true) {
  grid = next
  applyGrid()
  if (persist) save('layout', grid)
  layoutListeners.forEach(f => f())
}

export function applyPreset(id: PresetId) { setGrid(PRESETS[id].map(c => ({ ...c }))) }

export function showModule(id: ModuleId, shown: boolean) {
  if (shown === isModuleShown(id)) return
  setGrid(shown ? addCell(grid, { id, x: 0, ...MODULE_SIZE[id] }) : removeCell(grid, id))
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function renderLayout(panels: Panels, fieldsVisible: Record<AnalysisFieldKey, boolean>) {
  $('app').innerHTML =
    buildToolbar() +
    '<div id="midi-banner"></div>' +
    `<div id="grid" class="grid">${MODULE_IDS.map(id => moduleFrame(id, panels, fieldsVisible)).join('')}</div>`
  applyGrid()
  wireGrid()
  wireLayoutMenu()
  watchFittedDiagrams()
}

/** Control-row ▲▼ buttons flip their flag, persist it and re-apply visibility. */
export function wirePanelToggles(panels: Panels) {
  document.querySelectorAll<HTMLButtonElement>('.toggle-btn[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel as keyof Panels
      panels[panel] = !panels[panel]
      save(`panel-${panel}`, panels[panel])
      applyPanelVisibility(panels)
    })
  })
}

export function applyPanelVisibility(panels: Panels) {
  const cc = document.getElementById('cof-controls'); if (cc) cc.style.display = panels.cofControls ? '' : 'none'
  setGuitarControlsVisible(panels.guitarControls)
  const gcw = document.getElementById('guitar-ctrl-wrap'); if (gcw) gcw.style.display = panels.guitarControls ? '' : 'none'
  const ac = document.getElementById('analysis-controls'); if (ac) ac.style.display = panels.analysisControls ? '' : 'none'
  ;(['cofControls', 'guitarControls', 'analysisControls'] as const).forEach(key => {
    const btn = document.querySelector<HTMLButtonElement>(`.toggle-btn[data-panel="${key}"]`)
    if (btn) btn.textContent = panels[key] ? '▲' : '▼'
  })
}

function buildToolbar(): string {
  return `
    <div id="z1-toolbar" class="toolbar">
      <span id="midi-status" class="midi-status">MIDI: —</span>
      <select id="midi-device" class="ctrl-select"></select>
      <select id="midi-in-ch" class="ctrl-select" title="${t('midi.inChannel.title')}">
        <option value="0">${t('midi.inChannel.all')}</option>
        ${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">${t('midi.inChannel.one', { n: i + 1 })}</option>`).join('')}
      </select>
      <select id="midi-out" class="ctrl-select" title="${t('midi.out.title')}"><option value="">${t('midi.out.off')}</option></select>
      <select id="midi-out-ch" class="ctrl-select" title="${t('midi.outChannel.title')}">
        ${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">${t('midi.outChannel.one', { n: i + 1 })}</option>`).join('')}
      </select>
      <button id="btn-thru" class="mode-btn" title="${t('midi.thru.title')}">${t('midi.thru')}</button>
      <button id="btn-normal" class="mode-btn" data-mode="normal" title="${t('mode.normal.title')}">${t('mode.normal')}</button>
      <button id="btn-hold" class="mode-btn" data-mode="hold" title="${t('mode.hold.title')}">${t('mode.hold')}</button>
      <button id="btn-arpeggio" class="mode-btn" data-mode="arpeggio" title="${t('mode.arpeggio.title')}">${t('mode.arpeggio')}</button>
      <button id="btn-keyboard" class="mode-btn" title="${t('keyboard.title')}">⌨</button>
      <span id="keyboard-status" class="auto-key-label"></span>
      <select id="key-select" class="ctrl-select">
        <option value="">${t('key.auto')}</option>
        ${ALL_KEYS.map(k => `<option value="${k}">${keyLabel(k)}</option>`).join('')}
      </select>
      <span id="auto-key-label" class="auto-key-label"></span>
      <input id="typed-chord" class="ctrl-select typed-chord" placeholder="${t('typed.placeholder')}" title="${t('typed.title')}" autocomplete="off" spellcheck="false">
      <span class="toolbar-sep"></span>
      <div id="audio-progress" class="audio-progress" title="${t('audio.title')}">
        <div id="audio-progress-fill" class="audio-progress-fill"></div>
        <span id="audio-status" class="audio-status">${t('audio.idle')}</span>
      </div>
      <button id="btn-play-chord" class="ctrl-btn" title="${t('audio.play.title')}">▶</button>
      <select id="audio-instrument" class="ctrl-select" title="${t('audio.instrument.title')}">
        ${GM_INSTRUMENT_GROUPS.map(g =>
          `<optgroup label="${t(g.label)}">${g.instruments.map(i =>
            `<option value="${i}"${i === getCurrentInstrument() ? ' selected' : ''}>${i.replace(/_/g,' ')}</option>`
          ).join('')}</optgroup>`
        ).join('')}
      </select>
      <input id="audio-volume" type="range" min="0" max="1" step="0.05" value="${getVolume()}" title="${t('audio.volume.title')}" class="volume-slider">
      <div class="view-menu-wrap">
        <button id="btn-layout" class="ctrl-btn" title="${t('layout.title')}">▦</button>
        <div id="layout-menu" class="view-menu"></div>
      </div>
      <div class="view-menu-wrap">
        <button id="btn-present" class="ctrl-btn" title="${t('present.title')}">⛶</button>
        <button id="btn-views" class="ctrl-btn" title="${t('views.title')}">⧉</button>
        <div id="view-menu" class="view-menu">
          <div class="view-menu-title">${t('views.open')}</div>
          ${VIEW_NAMES.map(v => `<button class="ctrl-btn" data-view="${v}">${viewLabel(v)}</button>`).join('')}
          <label class="view-menu-bg">${t('views.background')}
            <select id="view-bg" class="ctrl-select">
              ${(Object.keys(VIEW_BACKGROUNDS) as ViewBackground[]).map(b => `<option value="${b}">${t(`views.bg.${b}`)}</option>`).join('')}
            </select>
          </label>
          <div class="view-menu-hint">${t('views.hint')}</div>
          <div class="view-menu-title">${t('views.save')}</div>
          ${(['staff', 'cof', 'guitar', 'piano'] as const).map(v => `
            <div class="view-menu-export"><span>${viewLabel(v)}</span>
              <button class="ctrl-btn" data-export="${v}" data-format="svg">SVG</button>
              <button class="ctrl-btn" data-export="${v}" data-format="png">PNG</button>
            </div>`).join('')}
        </div>
      </div>
      <button id="btn-help" class="help-btn" title="${t('help.title')}">?</button>
    </div>`
}

// ─── Panels ──────────────────────────────────────────────────────────────────

const toggle = (panel: keyof Panels) => `<button class="toggle-btn small" data-panel="${panel}" title="${t('module.controls')}">▼</button>`

/** What a panel's header carries besides its title and ×. */
function headerTools(id: ModuleId): string {
  if (id === 'analysis') return toggle('analysisControls')
  if (id === 'cof') return toggle('cofControls')
  if (id === 'guitar') return toggle('guitarControls')
  if (id === 'piano') return `<button id="btn-piano-prev" class="size-ctrl-btn" title="${t('piano.prev.title')}">⇠</button>`
  if (id === 'key') return `
    <button id="btn-key-minus" class="size-ctrl-btn" title="${t('ctrl.smaller')}">−</button>
    <button id="btn-key-plus"  class="size-ctrl-btn" title="${t('ctrl.larger')}">+</button>
    <button id="btn-key-7"     class="size-ctrl-btn" title="${t('keyPanel.sevenths.title')}">7</button>
    <button id="btn-key-neg"   class="size-ctrl-btn" title="${t('keyPanel.neg.title')}">${t('keyPanel.neg')}</button>
    <button id="btn-key-par"   class="size-ctrl-btn" title="${t('keyPanel.par.title')}">${t('keyPanel.par')}</button>
    <button id="btn-key-colt"  class="size-ctrl-btn" title="${t('keyPanel.colt.title')}">${t('keyPanel.colt')}</button>`
  return ''
}

function moduleBody(id: ModuleId, fieldsVisible: Record<AnalysisFieldKey, boolean>): string {
  switch (id) {
    case 'chord': return '<div id="chord-summary"></div>'
    case 'staff': return `
      <div id="staff-container" class="fit"></div>
      <div class="ctrl-row module-controls" style="justify-content:center">
        <button id="btn-staff-clef" class="size-ctrl-btn" title="${t('staff.clef.title')}"></button>
        <button id="btn-staff-prev" class="size-ctrl-btn" title="${t('staff.prev.title')}">⇠</button>
      </div>`
    case 'analysis': return `
      <div id="analysis-content"></div>
      <div id="analysis-controls" class="module-controls">
        <div class="ctrl-row">
          <button id="btn-analysis-minus" class="size-ctrl-btn" title="${t('ctrl.smaller')}">−</button>
          <button id="btn-analysis-plus"  class="size-ctrl-btn" title="${t('ctrl.larger')}">+</button>
        </div>
        <div class="ctrl-row" style="display:grid;grid-template-columns:repeat(4,1fr);gap:2px">
          ${ANALYSIS_FIELD_KEYS.map(f =>
            `<button id="btn-field-${f}" class="size-ctrl-btn${fieldsVisible[f] ? ' active' : ''}"
              title="${fieldTooltip(f)}">${fieldLabel(f)}</button>`
          ).join('')}
        </div>
      </div>`
    case 'cof': return `
      <div id="cof-container" class="fit"></div>
      <div id="cof-controls" class="module-controls">
        <div class="ctrl-row">
          <button id="btn-cof-flat"   class="size-ctrl-btn" title="${t('cof.flat.title')}">b</button>
          <button id="btn-cof-sharp"  class="size-ctrl-btn" title="${t('cof.sharp.title')}">#</button>
          <button id="btn-cof-minor"  class="size-ctrl-btn" title="${t('cof.minor.title')}">m</button>
          <button id="btn-cof-deg"    class="size-ctrl-btn" title="${t('cof.degrees.title')}">°</button>
          <button id="btn-cof-7"      class="size-ctrl-btn" title="${t('cof.sevenths.title')}">7</button>
        </div>
      </div>`
    case 'guitar': return '<div id="guitar-container"></div>'
    case 'key': return '<div id="key-container"></div>'
    case 'explain': return '<div id="explain-container"></div>'
    case 'progressions': return '<div id="progressions-container"></div>'
    case 'ear': return '<div id="ear-container"></div>'
    case 'player': return '<div id="player-container"></div>'
    case 'piano': return '<div id="piano-container" class="fit"></div>'
    case 'velocity': return '<div id="velocity-container"></div>'
    case 'history': return '<div id="zone2-content"></div>'
    case 'song': return '<div id="zone3-content"></div>'
  }
}

function moduleFrame(id: ModuleId, _panels: Panels, fieldsVisible: Record<AnalysisFieldKey, boolean>): string {
  return `
    <section id="mod-${id}" class="module module-${id}" data-module="${id}">
      <header class="module-header" title="${t('module.drag')}">
        <span class="module-title">${t(`module.${id}`)}</span>
        <span class="module-tools">${headerTools(id)}</span>
        <button class="module-close" data-close="${id}" title="${t('module.hide')}">×</button>
      </header>
      <div class="module-body">${moduleBody(id, fieldsVisible)}</div>
      <div class="module-resize" title="${t('module.resize')}"></div>
    </section>`
}

const byPosition = (a: Cell, b: Cell) => a.y - b.y || a.x - b.x

/** Puts each panel in its cells; on a narrow screen they stack in the same order. */
function applyGrid() {
  const order = [...grid].sort(byPosition).map(c => c.id)
  for (const id of MODULE_IDS) {
    const el = document.getElementById(`mod-${id}`)
    if (!el) continue
    const c = grid.find(cell => cell.id === id)
    el.classList.toggle('module-hidden', !c)
    if (!c) continue
    el.style.gridColumn = `${c.x + 1} / span ${c.w}`
    el.style.gridRow = `${c.y + 1} / span ${c.h}`
    el.style.order = String(order.indexOf(id))
    el.style.setProperty('--h', String(c.h))
  }
  renderLayoutMenu()
}

// ─── Moving and resizing ─────────────────────────────────────────────────────

const narrow = () => matchMedia('(max-width: 720px)').matches

function wireGrid() {
  const gridEl = $('grid')
  gridEl.addEventListener('click', e => {
    const close = (e.target as HTMLElement).closest<HTMLElement>('[data-close]')
    if (close) showModule(close.dataset.close as ModuleId, false)
  })
  gridEl.addEventListener('pointerdown', e => {
    if (e.button !== 0 || narrow() || document.body.classList.contains('presenting')) return
    const target = e.target as HTMLElement
    const resize = target.closest('.module-resize')
    const header = target.closest('.module-header')
    if (!resize && (!header || target.closest('button, select, input'))) return
    const el = target.closest<HTMLElement>('.module')!
    const start = grid.find(c => c.id === el.dataset.module)
    if (!start) return
    e.preventDefault()
    const handle = (resize ?? header) as HTMLElement
    handle.setPointerCapture(e.pointerId)
    const cs = getComputedStyle(gridEl)
    const gap = parseFloat(cs.columnGap) || 0
    const inner = gridEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const stepX = (inner - gap * (COLS - 1)) / COLS + gap
    const stepY = (parseFloat(cs.gridAutoRows) || 30) + (parseFloat(cs.rowGap) || 0)
    const base = grid
    let last = ''
    el.classList.add('module-moving')
    const move = (ev: PointerEvent) => {
      const dx = Math.round((ev.clientX - e.clientX) / stepX)
      const dy = Math.round((ev.clientY - e.clientY) / stepY)
      const cell = resize ? { ...start, w: start.w + dx, h: start.h + dy } : { ...start, x: start.x + dx, y: start.y + dy }
      const sig = `${cell.x},${cell.y},${cell.w},${cell.h}`
      if (sig === last) return
      last = sig
      setGrid(placeCell(base, cell), false)
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      el.classList.remove('module-moving')
      save('layout', grid)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  })
}

// Diagrams fill their panel: each SVG drawn into a .fit container scales to it.
function watchFittedDiagrams() {
  const fitAll = (el: HTMLElement) => {
    // abcjs fixes the height of the element it draws into and leaves part of its canvas empty
    el.style.height = ''
    const svgs = el.id === 'guitar-container' ? el.querySelectorAll(':scope > div:first-child svg') : el.querySelectorAll(':scope > svg')
    svgs.forEach(svg => fitSvg(svg as SVGSVGElement, el.id === 'staff-container'))
  }
  const containers = [...document.querySelectorAll<HTMLElement>('.fit, #guitar-container')]
  const observer = new MutationObserver(records => {
    const touched = new Set(records.map(r => (r.target as HTMLElement).closest<HTMLElement>('.fit, #guitar-container')))
    touched.forEach(el => el && fitAll(el))
  })
  containers.forEach(el => observer.observe(el, { childList: true, subtree: true }))
}

// ─── Layout menu ─────────────────────────────────────────────────────────────

function renderLayoutMenu() {
  const menu = document.getElementById('layout-menu')
  if (!menu) return
  const names = Object.keys(savedLayouts).sort((a, b) => a.localeCompare(b))
  menu.innerHTML = `
    <div class="view-menu-title">${t('layout.presets')}</div>
    <div class="layout-presets">
      ${PRESET_IDS.map(p => `<button class="ctrl-btn" data-preset="${p}" title="${t(`layout.preset.${p}.title`)}">${t(`layout.preset.${p}`)}</button>`).join('')}
    </div>
    ${names.length ? `<div class="view-menu-title">${t('layout.saved')}</div>` : ''}
    ${names.map(n => `
      <div class="layout-saved-row">
        <button class="ctrl-btn" data-saved="${escapeHtml(n)}">${escapeHtml(n)}</button>
        <button class="ctrl-btn" data-delete="${escapeHtml(n)}" title="${t('layout.delete')}">×</button>
      </div>`).join('')}
    <div class="layout-save-row">
      <input id="layout-name" class="ctrl-select" placeholder="${t('layout.name')}" maxlength="40">
      <button id="layout-save" class="ctrl-btn">${t('layout.save')}</button>
    </div>
    <div class="view-menu-title">${t('layout.panels')}</div>
    <div class="layout-modules">
      ${MODULE_IDS.map(id => `
        <label class="layout-module"><input type="checkbox" data-module="${id}"${isModuleShown(id) ? ' checked' : ''}> ${t(`module.${id}`)}</label>`).join('')}
    </div>
    <div class="view-menu-hint">${t('layout.hint')}</div>`
}

function wireLayoutMenu() {
  const menu = $('layout-menu')
  $('btn-layout').addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('open') })
  document.addEventListener('click', e => { if (!menu.contains(e.target as Node) && e.target !== $('btn-layout')) menu.classList.remove('open') })
  menu.addEventListener('click', e => {
    e.stopPropagation()
    const el = e.target as HTMLElement
    const preset = el.closest<HTMLElement>('[data-preset]')?.dataset.preset as PresetId | undefined
    const saved = el.closest<HTMLElement>('[data-saved]')?.dataset.saved
    const del = el.closest<HTMLElement>('[data-delete]')?.dataset.delete
    if (preset) applyPreset(preset)
    else if (saved !== undefined && savedLayouts[saved]) setGrid(savedLayouts[saved].map(c => ({ ...c })))
    else if (del !== undefined) {
      delete savedLayouts[del]
      save('layouts', savedLayouts)
      renderLayoutMenu()
    }
    else if (el.id === 'layout-save') saveCurrentAs()
  })
  menu.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target as HTMLElement).id === 'layout-name') saveCurrentAs() })
  menu.addEventListener('change', e => {
    const box = (e.target as HTMLElement).closest<HTMLInputElement>('input[data-module]')
    if (box) showModule(box.dataset.module as ModuleId, box.checked)
  })
}

function saveCurrentAs() {
  const input = document.getElementById('layout-name') as HTMLInputElement | null
  const name = input?.value.trim()
  if (!name) { input?.classList.add('invalid'); return }
  savedLayouts[name] = grid.map(c => ({ ...c }))
  save('layouts', savedLayouts)
  renderLayoutMenu()
}
