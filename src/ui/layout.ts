// Page structure: the toolbar and the panels on the layout grid (layout/grid.ts). Every
// panel is built once and shown where the layout puts it, or hidden; moving and resizing
// snap to the grid. Behaviour inside the panels is wired in app.ts.

import type { AppState } from '../types'
import { ALL_KEYS, CHURCH_MODES } from '../theory/keys'
import type { StringKey } from '../i18n/en'
import { GM_INSTRUMENT_GROUPS, getCurrentInstrument, getVolume } from '../audio/audio'
import { setGuitarControlsVisible } from '../diagrams/guitar'
import { ANALYSIS_FIELD_KEYS, fieldTooltip, fieldLabel } from '../detector/analysis-panel'
import type { AnalysisFieldKey } from '../detector/analysis-panel'
import { loadBool, loadJSON, save } from './storage'
import { escapeHtml } from './html'
import { fitSvg } from './fit'
import { announce } from './a11y'
import { buildSettings } from './settings'
import { ICONS, LOGO } from './icons'
import { wirePopover } from './popover'
import { prefMenuHtml } from './pref-menu'
import { STAFF_CLEFS } from '../diagrams/staff'
import type { Command } from './commands'
import { instrumentLabel } from '../i18n/instruments'
import { VIEW_NAMES, VIEW_BACKGROUNDS } from '../view/channel'
import type { ViewName, ViewBackground } from '../view/channel'
import { t, keyLabel } from '../i18n/i18n'
import { COLS, placeCell, addCell, removeCell, parseGrid, fitGrid } from '../layout/grid'
import type { Cell, Grid } from '../layout/grid'
import { MODULE_IDS, MODULE_SIZE, PRESETS, PRESET_IDS } from '../layout/presets'
import type { ModuleId, PresetId } from '../layout/presets'
import { metronomeMenuHtml } from '../metronome/panel'

export type Panels = AppState['panels']

const viewLabel = (v: ViewName) => t(`view.${v}`)

const $ = (id: string) => document.getElementById(id)!

/** Whether the Strings panel shows its controls, as last left. */
export function loadPanels(): Panels {
  return { guitarControls: loadBool('panel-guitarControls', true) }
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

export function renderLayout(_panels: Panels, fieldsVisible: Record<AnalysisFieldKey, boolean>) {
  $('app').innerHTML =
    buildToolbar() +
    '<div class="workspace">' + buildRail() +
    '<div class="work-main"><div id="midi-banner"></div>' +
    `<main id="grid" class="grid" aria-label="${t('a11y.panels')}">${MODULE_IDS.map(id => moduleFrame(id, fieldsVisible)).join('')}</main>` +
    '</div></div>' +
    buildTabbar() +
    buildSettings()
  applyGrid()
  wireGrid()
  wireLayoutMenu()
  wirePanelMenus()
  watchFittedDiagrams()
  watchFittedPanels()
}

/** The Strings menu's Controls item flips its flag, persists it and re-applies visibility. */
export function wirePanelToggles(panels: Panels) {
  document.querySelectorAll<HTMLButtonElement>('.menu-item[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel as keyof Panels
      panels[panel] = !panels[panel]
      save(`panel-${panel}`, panels[panel])
      applyPanelVisibility(panels)
    })
  })
}

export function applyPanelVisibility(panels: Panels) {
  setGuitarControlsVisible(panels.guitarControls)
  document.getElementById('guitar-container')?.classList.toggle('strings-bare', !panels.guitarControls)
  document.querySelector('.menu-item[data-panel="guitarControls"]')?.setAttribute('aria-pressed', String(panels.guitarControls))
}

/** Opens and closes the ⋯ menus of the panels: one at a time; a click outside or Esc closes it. */
function wirePanelMenus() {
  let open: { btn: HTMLElement, menu: HTMLElement } | null = null
  const close = (focus = false) => {
    if (!open) return
    open.menu.hidden = true
    open.btn.setAttribute('aria-expanded', 'false')
    open.btn.closest('.module')?.classList.remove('module-menu-open')
    if (focus) open.btn.focus()
    open = null
  }
  document.addEventListener('click', e => {
    const target = e.target as HTMLElement
    const btn = target.closest<HTMLElement>('.module-more')
    if (btn) {
      const was = open?.btn === btn
      close()
      if (was) return
      const menu = $(`menu-${btn.dataset.menu}`)
      menu.hidden = false
      btn.setAttribute('aria-expanded', 'true')
      btn.closest('.module')?.classList.add('module-menu-open')
      open = { btn, menu }
      // Opened from the keyboard (a click with no pointer: detail 0), the focus goes to its first
      // option: Tab from ⋯ would reach the panel's × first, the menu coming after it
      if ((e as MouseEvent).detail === 0) menu.querySelector<HTMLElement>('button, input, select')?.focus()
      return
    }
    // composedPath: a menu that redraws its items on the click no longer contains the target
    if (open && !e.composedPath().includes(open.menu)) close()
  })
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) { e.stopPropagation(); close(true) } }, true)
}

// The bar: the key, a field for a chord or an order, and two statuses (what comes in, what
// sounds) that open their menus. The rail beside the panels opens the same menus from icons
// and holds the keyboard, the mic and the page (layout, presentation, view windows); it hides.
function buildToolbar(): string {
  return `
    <div id="z1-toolbar" class="toolbar" role="toolbar" aria-label="${t('a11y.toolbar')}">
      <button id="btn-rail" class="ctrl-btn icon-btn ghost" title="${t('rail.title')}" aria-controls="rail">${ICONS.rail}</button>
      <span class="brand" title="Modus">${LOGO}<span class="brand-name">modus</span></span>
      <div class="pop-anchor">
        <button id="btn-key" class="key-btn" title="${t('key.menu.title')}"><span id="key-btn-name"></span><span id="key-btn-auto" class="key-btn-auto"></span></button>
      </div>
      <div class="tb-search pop-anchor">
        ${ICONS.search}
        <input id="typed-chord" class="typed-chord" placeholder="${t('typed.placeholder')}" title="${t('typed.title')}" autocomplete="off" spellcheck="false"
          role="combobox" aria-expanded="false" aria-controls="cmd-results" aria-autocomplete="list">
        <kbd class="tb-kbd" aria-hidden="true">/</kbd>
        <div id="cmd-results" class="cmd-results" role="listbox" aria-label="${t('cmd.results')}" hidden></div>
      </div>
      <div class="tb-status">
        <div class="pop-anchor pop-end">
          <button id="btn-input-status" class="status-btn" title="${t('a11y.group.input')}"><span id="midi-status" class="midi-status">MIDI</span><span id="mode-status" class="status-sub"></span></button>
        </div>
        <div class="pop-anchor pop-end">
          <button id="btn-sound-status" class="status-btn" title="${t('a11y.group.sound')}"><span id="sound-status" class="sound-status"></span></button>
        </div>
        <button id="btn-settings" class="ctrl-btn icon-btn ghost" title="${t('set.title.button')}" aria-haspopup="dialog">${ICONS.settings}</button>
        <button id="btn-help" class="ctrl-btn icon-btn ghost help-q" title="${t('help.title')}">?</button>
      </div>
    </div>`
}

function buildRail(): string {
  return `
    <div class="rail-col">
      <nav id="rail" class="rail" aria-label="${t('a11y.rail')}">
        <button id="rail-input" class="rail-btn" title="${t('a11y.group.input')}">${ICONS.midi}<span id="rail-midi-dot" class="rail-dot"></span></button>
        <button id="rail-sound" class="rail-btn" title="${t('a11y.group.sound')}">${ICONS.sound}</button>
        <button id="btn-keyboard" class="rail-btn" data-act="keyboard" title="${t('keyboard.title')}">${ICONS.keyboard}</button>
        <button id="btn-mic" class="rail-btn" data-act="mic" title="${t('mic.title')}">${ICONS.mic}</button>
        <span class="rail-sep" aria-hidden="true"></span>
        <button id="btn-layout" class="rail-btn" title="${t('layout.title')}">${ICONS.layout}</button>
        <button id="btn-present" class="rail-btn" title="${t('present.title')}">${ICONS.present}</button>
        <button id="btn-views" class="rail-btn" title="${t('views.title')}">${ICONS.views}</button>
        ${buildMenus()}
      </nav>
    </div>`
}

// On a phone the rail gives way to a bar along the bottom, in reach of the thumb, each icon
// with its name; its menus rise from the bottom as sheets (ui/popover.ts). What a phone has no
// use for stays out: the computer keyboard and the view windows for OBS.
function buildTabbar(): string {
  const tab = (id: string, icon: string, label: string, attrs = '') =>
    `<button id="${id}" class="tab-btn"${attrs}>${icon}<span class="tab-label">${escapeHtml(label)}</span></button>`
  return `
    <nav id="tabbar" class="tabbar" aria-label="${t('a11y.tabbar')}">
      ${tab('tab-input', ICONS.midi, t('tab.input'))}
      ${tab('tab-sound', ICONS.sound, t('tab.sound'))}
      ${tab('tab-mic', ICONS.mic, t('tab.mic'), ' data-act="mic"')}
      ${tab('tab-layout', ICONS.layout, t('tab.panels'))}
      ${tab('tab-more', ICONS.more, t('tab.more'))}
    </nav>`
}

// The menus start in the rail, closed; each opens next to the button pressed (ui/popover.ts).
// A list of choices stands for each select, which stays hidden as the value's holder.
function buildMenus(): string {
  return `
    <div id="input-menu" class="view-menu pop-menu" role="group" aria-label="${t('a11y.group.input')}">
      <div class="view-menu-title">${t('input.playWith')}</div>
      <select id="midi-device" class="ctrl-select" hidden aria-label="${t('a11y.midiDevice')}"></select>
      <div id="midi-device-list" class="choice-list" role="group" aria-label="${t('a11y.midiDevice')}"></div>
      <button id="menu-keyboard" class="choice-row" data-act="keyboard" title="${t('keyboard.title')}">${ICONS.keyboard}<span>${t('input.keyboard')}</span><span id="keyboard-status" class="choice-hint"></span></button>
      <button id="menu-mic" class="choice-row" data-act="mic" title="${t('mic.title')}">${ICONS.mic}<span>${t('input.mic')}</span></button>
      <div class="view-menu-title">${t('a11y.group.mode')}</div>
      <div class="seg seg-full" role="group" aria-label="${t('a11y.group.mode')}">
        <button id="btn-normal" class="mode-btn" data-mode="normal" title="${t('mode.normal.title')}">${t('mode.normal')}</button>
        <button id="btn-hold" class="mode-btn" data-mode="hold" title="${t('mode.hold.title')}">${t('mode.hold')}</button>
        <button id="btn-arpeggio" class="mode-btn" data-mode="arpeggio" title="${t('mode.arpeggio.title')}">${t('mode.arpeggio')}</button>
      </div>
      <div id="mode-hint" class="view-menu-hint"></div>
    </div>
    <div id="sound-menu" class="view-menu pop-menu sound-menu" role="group" aria-label="${t('a11y.group.sound')}">
      <div class="sound-row">
        <button id="btn-play-chord" class="play-btn" title="${t('audio.play.title')}">${ICONS.play}</button>
        <input id="audio-volume" type="range" min="0" max="1" step="0.05" value="${getVolume()}" title="${t('audio.volume.title')}" aria-label="${t('audio.volume.title')}" class="volume-slider">
        <span id="volume-value" class="choice-hint"></span>
      </div>
      <div id="audio-progress" class="audio-progress" title="${t('audio.title')}">
        <div id="audio-progress-fill" class="audio-progress-fill"></div>
        <span id="audio-status" class="audio-status">${t('audio.idle')}</span>
      </div>
      <input id="instrument-filter" class="ctrl-select" placeholder="${t('sound.filter')}" aria-label="${t('sound.filter')}" autocomplete="off" spellcheck="false">
      <select id="audio-instrument" hidden title="${t('audio.instrument.title')}">
        ${GM_INSTRUMENT_GROUPS.map(g =>
          `<optgroup label="${t(g.label)}">${g.instruments.map(i =>
            `<option value="${i}"${i === getCurrentInstrument() ? ' selected' : ''}>${escapeHtml(instrumentLabel(i))}</option>`
          ).join('')}</optgroup>`
        ).join('')}
      </select>
      <div id="instrument-list" class="choice-list choice-scroll" role="group" aria-label="${t('audio.instrument.title')}"></div>
    </div>
    <div id="key-menu" class="view-menu pop-menu key-menu" role="group" aria-label="${t('a11y.key')}">
      <select id="key-select" hidden aria-label="${t('a11y.key')}">
        <option value="">${t('key.auto')}</option>
        ${ALL_KEYS.map(k => `<option value="${k}">${keyLabel(k)}</option>`).join('')}
      </select>
      <div class="key-menu-top">
        <button id="key-auto" class="choice-chip" title="${t('key.auto.title')}">${t('key.autoShort')}</button>
        <span id="auto-key-label" class="auto-key-label"></span>
      </div>
      <div class="seg" role="group" aria-label="${t('a11y.key')}">
        <button class="mode-btn" data-keymode="major">${t('key.majorCap')}</button>
        <button class="mode-btn" data-keymode="minor">${t('key.minorCap')}</button>
      </div>
      <div class="key-modes" role="group" aria-label="${t('key.modes')}">
        ${CHURCH_MODES.map(m => `<button class="choice-chip" data-keymode="${m.toLowerCase()}" title="${escapeHtml(t('key.mode.title', { mode: t(`key.mode.${m.toLowerCase()}` as StringKey) }))}">${t(`key.mode.${m.toLowerCase()}` as StringKey)}</button>`).join('')}
      </div>
      <div id="key-grid" class="key-pick-grid"></div>
      <div class="view-menu-hint">${t('key.menu.hint')}</div>
    </div>
    <div id="layout-menu" class="view-menu pop-menu"></div>
    <div id="more-menu" class="view-menu pop-menu">
      <button id="more-present" class="choice-row">${ICONS.present}<span>${t('tab.present')}</span></button>
      <div class="view-menu-title">${t('views.save')}</div>
      ${exportRows()}
    </div>
    <div id="view-menu" class="view-menu pop-menu">
      <div class="view-menu-title">${t('views.open')}</div>
      ${VIEW_NAMES.map(v => `<button class="ctrl-btn" data-view="${v}">${viewLabel(v)}</button>`).join('')}
      <label class="view-menu-bg">${t('views.background')}
        <select id="view-bg" class="ctrl-select">
          ${(Object.keys(VIEW_BACKGROUNDS) as ViewBackground[]).map(b => `<option value="${b}">${t(`views.bg.${b}`)}</option>`).join('')}
        </select>
      </label>
      <div class="view-menu-hint">${t('views.hint')}</div>
      <div class="view-menu-title">${t('views.save')}</div>
      ${exportRows()}
    </div>`
}

/** A diagram saved as SVG or PNG: in the view menu, and in More on a phone. */
const exportRows = () => (['staff', 'cof', 'guitar', 'piano'] as const).map(v => `
  <div class="view-menu-export"><span>${viewLabel(v)}</span>
    <button class="ctrl-btn" data-export="${v}" data-format="svg">SVG</button>
    <button class="ctrl-btn" data-export="${v}" data-format="png">PNG</button>
  </div>`).join('')

// ─── Panels ──────────────────────────────────────────────────────────────────

// A panel's options live in a ⋯ menu of its header, out of sight until asked for
const item = (id: string, label: string, title = '', on?: boolean) =>
  `<button type="button" id="${id}" class="menu-item"${on !== undefined ? ` aria-pressed="${on}"` : ''}${title ? ` title="${escapeHtml(title)}"` : ''}><span class="menu-check" aria-hidden="true"></span><span class="menu-label">${escapeHtml(label)}</span></button>`
const steps = (minus: string, plus: string) =>
  `<div class="menu-row"><span class="menu-label">${t('menu.size')}</span>
    <button type="button" id="${minus}" class="menu-step" title="${t('ctrl.smaller')}">−</button>
    <button type="button" id="${plus}" class="menu-step" title="${t('ctrl.larger')}">+</button></div>`
const heading = (text: string) => `<div class="menu-heading">${escapeHtml(text)}</div>`

/** The options in a panel's ⋯ menu, then its preferences (also in Settings); '' for a panel without any. */
function panelMenu(id: ModuleId, fieldsVisible: Record<AnalysisFieldKey, boolean>): string {
  const own = ownMenu(id, fieldsVisible)
  const prefs = prefMenuHtml(id)
  return own && prefs ? `${own}<div class="menu-sep"></div>${prefs}` : own || prefs
}

function ownMenu(id: ModuleId, fieldsVisible: Record<AnalysisFieldKey, boolean>): string {
  switch (id) {
    case 'staff': return `
      ${heading(t('menu.clef'))}
      <div class="menu-chips" role="group" aria-label="${t('menu.clef')}" title="${t('staff.clef.title')}">${STAFF_CLEFS.map(c =>
        `<button type="button" class="menu-chip" data-clef="${c}" data-label="${escapeHtml(`${t('menu.clef')}: ${t(`staff.clef.${c}`)}`)}" aria-pressed="false">${t(`staff.clef.${c}`)}</button>`).join('')}</div>
      ${item('btn-staff-prev', t('menu.prev'), t('staff.prev.title'))}`
    case 'piano': return item('btn-piano-prev', t('menu.prev'), t('piano.prev.title')) + item('btn-piano-scale', t('menu.scale'), t('piano.scale.title'))
    case 'analysis': return `
      ${steps('btn-analysis-minus', 'btn-analysis-plus')}
      ${heading(t('menu.fields'))}
      <div class="menu-grid">${ANALYSIS_FIELD_KEYS.map(f =>
        `<button type="button" id="btn-field-${f}" class="menu-item${fieldsVisible[f] ? ' active' : ''}" aria-pressed="${fieldsVisible[f]}" data-label="${escapeHtml(fieldLabel(f))}"><span class="menu-check" aria-hidden="true"></span><span class="menu-label">${escapeHtml(fieldTooltip(f))}</span></button>`
      ).join('')}</div>`
    case 'cof': return `
      ${item('btn-cof-flat', t('menu.flat'), t('cof.flat.title'))}
      ${item('btn-cof-sharp', t('menu.sharp'), t('cof.sharp.title'))}
      <div class="menu-sep"></div>
      ${item('btn-cof-minor', t('menu.minor'), t('cof.minor.title'))}
      ${item('btn-cof-deg', t('menu.degrees'), t('cof.degrees.title'))}
      ${item('btn-cof-7', t('menu.sevenths'), t('cof.sevenths.title'))}`
    case 'key': return `
      ${steps('btn-key-minus', 'btn-key-plus')}
      ${item('btn-key-7', t('menu.sevenths'), t('keyPanel.sevenths.title'))}
      ${item('btn-key-neg', t('menu.negative'), t('keyPanel.neg.title'))}
      ${item('btn-key-par', t('menu.parallel'), t('keyPanel.par.title'))}
      ${item('btn-key-usual', t('menu.usualBorrowings'), t('keyPanel.usual.title'))}
      ${item('btn-key-colt', t('menu.coltrane'), t('keyPanel.colt.title'))}`
    case 'metronome': return metronomeMenuHtml()
    case 'guitar': return `<div id="strings-menu"></div><div class="menu-sep"></div><button type="button" class="menu-item" data-panel="guitarControls"><span class="menu-check" aria-hidden="true"></span><span class="menu-label">${t('menu.controls')}</span></button>`
    default: return ''
  }
}

function moduleBody(id: ModuleId): string {
  switch (id) {
    case 'chord': return '<div id="chord-summary"></div>'
    case 'staff': return '<div id="staff-container" class="fit"></div>'
    case 'analysis': return '<div id="analysis-content"></div>'
    case 'cof': return '<div id="cof-container" class="fit"></div>'
    case 'guitar': return '<div id="guitar-container"></div>'
    case 'key': return '<div id="key-container"></div>'
    case 'explain': return '<div id="explain-container"></div>'
    case 'next': return '<div id="next-container"></div>'
    case 'metronome': return '<div id="metronome-container"></div>'
    case 'progressions': return '<div id="progressions-container"></div>'
    case 'ear': return '<div id="ear-container"></div>'
    case 'player': return '<div id="player-container"></div>'
    case 'tuner': return '<div id="tuner-container"></div>'
    case 'piano': return '<div id="piano-container" class="fit"></div>'
    case 'velocity': return '<div id="velocity-container"></div>'
    case 'history': return '<div id="zone2-content"></div>'
    case 'song': return '<div id="zone3-content"></div>'
  }
}

function moduleFrame(id: ModuleId, fieldsVisible: Record<AnalysisFieldKey, boolean>): string {
  const menu = panelMenu(id, fieldsVisible)
  return `
    <section id="mod-${id}" class="module module-${id}" data-module="${id}" aria-labelledby="mod-${id}-title">
      <header class="module-header" title="${t('module.drag')}" tabindex="0" aria-label="${t('a11y.panelKeys', { name: t(`module.${id}`) })}">
        <span class="module-title" id="mod-${id}-title">${t(`module.${id}`)}</span>
        ${menu ? `<button class="module-more" data-menu="${id}" title="${t('menu.options')}" aria-haspopup="true" aria-expanded="false" aria-controls="menu-${id}">${ICONS.more}</button>` : ''}
        <button class="module-close" data-close="${id}" title="${t('module.hide')}">×</button>
      </header>
      ${menu ? `<div id="menu-${id}" class="module-menu" role="group" aria-label="${t('menu.optionsOf', { name: t(`module.${id}`) })}" hidden>${menu}</div>` : ''}
      <div class="module-body">${moduleBody(id)}</div>
      <div class="module-resize" title="${t('module.resize')}"></div>
    </section>`
}

const byPosition = (a: Cell, b: Cell) => a.y - b.y || a.x - b.x

// Text and list panels take the height of their content, at most their size in the layout;
// diagrams, the player and the metronome keep their size. Rows measured, by panel.
const FITTED: readonly ModuleId[] = ['key', 'explain', 'history', 'song', 'tuner', 'progressions', 'ear', 'next']
let contentRows: Record<string, number> = {}
let dragging = false

/**
 * The grid as drawn: fitted to content, except while a panel is dragged or the layout presented,
 * and on a phone, where the panels keep their rows (styles.css says why).
 */
function shownGrid(): Grid {
  return dragging || document.body.classList.contains('presenting') || narrow() ? grid : fitGrid(grid, contentRows)
}

/** Draws the layout again, as after presentation starts or ends. */
export function refreshLayout() { applyGrid() }

/** Puts each panel in its cells; on a narrow screen they stack in the same order. */
function applyGrid() {
  const shown = shownGrid()
  const order = [...shown].sort(byPosition).map(c => c.id)
  for (const id of MODULE_IDS) {
    const el = document.getElementById(`mod-${id}`)
    if (!el) continue
    const c = shown.find(cell => cell.id === id)
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
  // A focused header: arrows move the panel a cell, Shift + arrows resize it
  gridEl.addEventListener('keydown', e => {
    const header = e.target as HTMLElement
    if (!header.classList?.contains('module-header') || !e.key.startsWith('Arrow') || narrow()) return
    const id = header.closest<HTMLElement>('.module')!.dataset.module as ModuleId
    const cell = grid.find(c => c.id === id)
    if (!cell) return
    e.preventDefault()
    const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
    const next = e.shiftKey ? { ...cell, w: cell.w + dx, h: cell.h + dy } : { ...cell, x: cell.x + dx, y: cell.y + dy }
    setGrid(placeCell(grid, next), true)
    const now = grid.find(c => c.id === id)!
    announce(t('a11y.moved', { name: t(`module.${id}`), x: now.x + 1, y: now.y + 1, w: now.w, h: now.h }), 0)
  })
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
    let last = `${start.x},${start.y},${start.w},${start.h}`
    el.classList.add('module-moving')
    const move = (ev: PointerEvent) => {
      const dx = Math.round((ev.clientX - e.clientX) / stepX)
      const dy = Math.round((ev.clientY - e.clientY) / stepY)
      const cell = resize ? { ...start, w: start.w + dx, h: start.h + dy } : { ...start, x: start.x + dx, y: start.y + dy }
      const sig = `${cell.x},${cell.y},${cell.w},${cell.h}`
      if (sig === last) return
      last = sig
      // Once it moves, the layout is drawn at its own sizes, the ones being arranged
      dragging = true
      setGrid(placeCell(base, cell), false)
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      el.classList.remove('module-moving')
      if (dragging) {
        dragging = false
        applyGrid()
        save('layout', grid)
      }
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
    const svgs = el.id === 'guitar-container' ? el.querySelectorAll('.strings-drawing svg') : el.querySelectorAll(':scope > svg')
    svgs.forEach(svg => fitSvg(svg as SVGSVGElement, el.id === 'staff-container'))
  }
  const containers = [...document.querySelectorAll<HTMLElement>('.fit, #guitar-container')]
  const observer = new MutationObserver(records => {
    const touched = new Set(records.map(r => (r.target as HTMLElement).closest<HTMLElement>('.fit, #guitar-container')))
    touched.forEach(el => el && fitAll(el))
  })
  containers.forEach(el => observer.observe(el, { childList: true, subtree: true }))
}

/** Rows each fitted panel needs for its header and all its content, at the grid's row height. */
function measureContentRows(): Record<string, number> {
  const cs = getComputedStyle($('grid'))
  const row = parseFloat(cs.gridAutoRows) || 30
  const gap = parseFloat(cs.rowGap) || 0
  const out: Record<string, number> = {}
  for (const id of FITTED) {
    const el = document.getElementById(`mod-${id}`)
    if (!el || el.classList.contains('module-hidden')) continue
    const body = el.querySelector<HTMLElement>('.module-body')!
    const bs = getComputedStyle(body)
    const kids = [...body.children] as HTMLElement[]
    // scrollHeight: a child that scrolls (Explanation) is as tall as the body, its content is not
    const content = kids.reduce((s, k) => s + k.scrollHeight, 0) + (parseFloat(bs.rowGap) || 0) * Math.max(0, kids.length - 1)
    const px = el.querySelector<HTMLElement>('.module-header')!.offsetHeight + parseFloat(bs.paddingTop) + parseFloat(bs.paddingBottom) + content
    out[id] = (px + gap) / (row + gap)
  }
  return out
}

// Content changes (a chord, a key chosen, the song filled) and width changes redraw the layout
// when a fitted panel needs other rows; once drawn, the same rows come back and it stops.
function watchFittedPanels() {
  let queued = false
  const refit = () => {
    queued = false
    if (dragging || document.body.classList.contains('presenting')) return
    const before = fitGrid(grid, contentRows)
    contentRows = measureContentRows()
    const after = fitGrid(grid, contentRows)
    if (after.some((c, i) => c.y !== before[i]?.y || c.h !== before[i]?.h) || after.length !== before.length) applyGrid()
  }
  // A timer, not a frame: a page out of sight gets no frames and would keep the old rows
  const schedule = () => { if (!queued) { queued = true; setTimeout(refit) } }
  const mutations = new MutationObserver(schedule)
  const sizes = new ResizeObserver(schedule)
  for (const id of FITTED) {
    const body = document.querySelector<HTMLElement>(`#mod-${id} .module-body`)
    if (!body) continue
    mutations.observe(body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] })
    sizes.observe(body)
  }
  onLayoutChange(schedule)
  // Into or out of a phone's width: fitted on one side, the layout's rows on the other
  matchMedia('(max-width: 720px)').addEventListener('change', () => applyGrid())
  schedule()
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
  wirePopover(menu, [$('btn-layout'), $('tab-layout')])
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

/** The layouts and the panels as orders for the bar's field. */
export function layoutCommands(): Command[] {
  const hint = t('layout.presets')
  return [
    ...PRESET_IDS.map(p => ({ label: t('cmd.layout', { name: t(`layout.preset.${p}`) }), hint, run: () => applyPreset(p) })),
    ...Object.keys(savedLayouts).map(n => ({ label: t('cmd.layout', { name: n }), hint, run: () => setGrid(savedLayouts[n].map(c => ({ ...c }))) })),
    ...MODULE_IDS.map(id => {
      const shown = isModuleShown(id)
      const name = t(`module.${id}`)
      return { label: t(shown ? 'cmd.hide' : 'cmd.show', { name }), hint: t('layout.panels'), run: () => showModule(id, !shown) }
    }),
  ]
}

/** The options in the ⋯ menus of the panels shown, as orders: each presses its item. */
export function panelMenuCommands(): Command[] {
  return grid.flatMap(({ id }) => {
    const menu = document.getElementById(`menu-${id}`)
    if (!menu) return []
    const panel = t(`module.${id as ModuleId}`)
    return [...menu.querySelectorAll<HTMLElement>('.menu-item, .menu-step, .menu-chip')].map(el => {
      const text = el.classList.contains('menu-step') ? `${t('menu.size')} ${el.textContent}` : el.dataset.label ?? (el.querySelector('.menu-label') ?? el).textContent ?? ''
      return { label: `${panel}: ${text.trim()}`, hint: el.getAttribute('aria-pressed') === 'true' ? t('cmd.on') : t('cmd.menu'), run: () => el.click() }
    })
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
