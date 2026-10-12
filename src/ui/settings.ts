// The Settings dialog (⚙, or its shortcut): every option the user can change, in sections
// with an index on the left and a search across all of them. Changes apply at once and are
// kept; "Reset this section" puts a section's back. Some rows hold controls the app wires
// itself (MIDI ports and channels); the Panels section mirrors the buttons on each panel.
// Data: export and import the settings and layouts to a file, or reset them, with Undo.

import { escapeHtml } from './html'
import { save, loadChoice } from './storage'
import { showUndo } from './undo'
import { t, getLang, getNoteNaming, saveLang, saveNoteNaming, LANGS, LANG_NAMES, NOTE_NAMINGS, cadenceLabel } from '../i18n/i18n'
import type { Lang, NoteNaming } from '../i18n/i18n'
import type { StringKey } from '../i18n/en'
import { getThemeChoice, saveThemeChoice, THEME_CHOICES } from './theme'
import type { ThemeChoice } from './theme'
import { PREFS, getPref, setPref, resetPref, type PrefName, type PrefDef } from '../settings/prefs'
import { ACTIONS, DEFAULT_KEYS, MAX_KEYS, RESERVED, keysOf, isDefaultBinding, keyName, conflictFor, assignKey, removeKey, resetKeys, resetAllKeys, type Action } from '../input/bindings'
import { MIC_MODES, getMicMode, setMicMode } from '../input/mic'
import { startTour } from './tour'
import { carryHistoryOverReload } from '../history/history'

export const SECTIONS = ['general', 'io', 'sound', 'theory', 'detector', 'panels', 'practice', 'mic', 'shortcuts', 'data'] as const
export type Section = typeof SECTIONS[number]

/** The preferences in each section, in the order they are shown. */
const SECTION_PREFS: Partial<Record<Section, PrefName[]>> = {
  general: ['ui-zoom'],
  sound: ['preview-s', 'piano-velocity'],
  theory: ['chord-style', 'key-profile', 'voice-rules', 'movable-do'],
  detector: ['history-hold-ms', 'history-max', 'arpeggio-ms', 'melody-gap-s', 'capture-ms'],
  practice: ['progression-bpm', 'ear-interval-play', 'ear-chords', 'ear-cadences'],
  mic: ['a4-hz', 'mic-sensitivity', 'mic-response'],
}

/** Each panel's own on/off buttons, mirrored in the Panels section (they keep the state). */
const PANEL_BUTTONS: { id: string; label: StringKey }[] = [
  { id: 'btn-staff-prev', label: 'set.panels.prev' },
  { id: 'btn-cof-minor', label: 'set.panels.cofMinor' },
  { id: 'btn-cof-deg', label: 'set.panels.cofDegrees' },
  { id: 'btn-cof-7', label: 'set.panels.cofSevenths' },
  { id: 'btn-key-7', label: 'set.panels.keySevenths' },
  { id: 'btn-key-neg', label: 'set.panels.keyNegative' },
  { id: 'btn-key-par', label: 'set.panels.keyParallel' },
  { id: 'btn-key-colt', label: 'set.panels.keyColtrane' },
]

const CADENCE_UMT: Record<string, string> = {
  authentic: 'Authentic Cadence (V -> I)', plagal: 'Plagal Cadence (IV -> I)',
  deceptive: 'Deceptive Cadence (V -> vi)', half: 'Half Cadence (-> V)',
}

// ─── Rows ────────────────────────────────────────────────────────────────────

const lbl = (name: PrefName) => t(`pref.${name}` as StringKey)
const hint = (name: PrefName) => t(`pref.${name}.hint` as StringKey)

function optionLabel(name: PrefName, option: string): string {
  if (name === 'ear-chords') return t(`ear.chord.${option || 'maj'}` as StringKey)
  if (name === 'ear-cadences') return cadenceLabel(CADENCE_UMT[option], true)
  return t(`pref.${name}.${option}` as StringKey)
}

/** A number as the row writes it: milliseconds as seconds, with its unit. */
export function formatPrefValue(def: { unit: string }, v: number): string {
  const n = (x: number) => x.toLocaleString(getLang(), { maximumFractionDigits: 2 })
  if (def.unit === 'ms') return `${n(v / 1000)} s`
  return def.unit ? `${n(v)} ${def.unit}` : n(v)
}

const row = (labelHtml: string, hintText: string, control: string, search: string, wide = false) => `
  <div class="set-row${wide ? ' set-row-wide' : ''}" data-search="${escapeHtml(search.toLowerCase())}">
    <div class="set-text">${labelHtml}${hintText ? `<div class="set-hint">${escapeHtml(hintText)}</div>` : ''}</div>
    <div class="set-control">${control}</div>
  </div>`

function segmented(group: string, options: { value: string; label: string; on: boolean }[], attrs: string): string {
  return `<div class="set-seg" role="group" aria-label="${escapeHtml(group)}">${options.map(o =>
    `<button type="button" ${attrs} data-value="${escapeHtml(o.value)}" aria-pressed="${o.on}">${escapeHtml(o.label)}</button>`).join('')}</div>`
}

function prefRow(name: PrefName): string {
  const def = PREFS[name] as PrefDef
  const id = `pref-${name}`
  const v = getPref(name)
  const search = `${lbl(name)} ${hint(name)}`
  switch (def.kind) {
    case 'choice': {
      const opts = def.options.map(o => ({ value: o, label: optionLabel(name, o), on: v === o }))
      const control = def.options.length <= 3
        ? segmented(lbl(name), opts, `data-pref="${name}"`)
        : `<select id="${id}" class="ctrl-select set-select" data-pref="${name}">${opts.map(o => `<option value="${o.value}"${o.on ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select>`
      const label = def.options.length <= 3 ? `<div class="set-label">${escapeHtml(lbl(name))}</div>` : `<label class="set-label" for="${id}">${escapeHtml(lbl(name))}</label>`
      return row(label, hint(name), control, search)
    }
    case 'bool':
      return row(`<label class="set-label" for="${id}">${escapeHtml(lbl(name))}</label>`, hint(name),
        `<input type="checkbox" id="${id}" class="set-check" data-pref="${name}"${v ? ' checked' : ''}>`, search)
    case 'number':
      return row(`<label class="set-label" for="${id}">${escapeHtml(lbl(name))}</label>`, hint(name),
        `<input type="range" id="${id}" class="set-range" data-pref="${name}" min="${def.min}" max="${def.max}" step="${def.step}" value="${v}">
         <output class="set-value" for="${id}">${escapeHtml(formatPrefValue(def, v as number))}</output>`, search)
    case 'set':
      return row(`<div class="set-label">${escapeHtml(lbl(name))}</div>`, hint(name),
        `<div class="set-checks">${def.options.map(o => `<label class="set-check-label"><input type="checkbox" data-pref-set="${name}" value="${escapeHtml(o)}"${(v as string[]).includes(o) ? ' checked' : ''}> ${escapeHtml(optionLabel(name, o))}</label>`).join('')}</div>`,
        search + ' ' + def.options.map(o => optionLabel(name, o)).join(' '), true)
  }
}

// ─── Shortcuts ───────────────────────────────────────────────────────────────

/** A key as printed on a chip. */
export function keyLabel(key: string): string {
  const named: Record<string, StringKey> = { Space: 'kbd.space', Delete: 'kbd.del', Escape: 'kbd.esc' }
  if (named[key]) return t(named[key])
  return ({ ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Backspace: '⌫' } as Record<string, string>)[key] ?? key
}

let capturing: { action: Action; slot: number } | null = null
let pendingConflict: { action: Action; slot: number; key: string; other: Action } | null = null

function shortcutsHtml(): string {
  const conflictCard = () => pendingConflict ? `<div class="set-conflict" role="alert">
      <span>${escapeHtml(t('set.keys.conflict', { key: keyLabel(pendingConflict.key), other: t(`action.${pendingConflict.other}` as StringKey), action: t(`action.${pendingConflict.action}` as StringKey) }))}</span>
      <button type="button" class="ctrl-btn set-primary" data-conflict-take>${escapeHtml(t('set.keys.take'))}</button>
      <button type="button" class="ctrl-btn" data-conflict-other>${escapeHtml(t('set.keys.other'))}</button>
    </div>` : ''
  const rows = ACTIONS.map(a => {
    const keys = keysOf(a)
    const waiting = capturing?.action === a
    const chips = keys.map((k, slot) => waiting && capturing!.slot === slot
      ? `<kbd class="set-kbd set-kbd-wait">${escapeHtml(t('set.keys.press'))}</kbd>`
      : `<span class="set-kbd-wrap"><kbd class="set-kbd${DEFAULT_KEYS[a].includes(k) ? '' : ' set-kbd-custom'}">${escapeHtml(keyLabel(k))}</kbd><button type="button" class="set-kbd-x" data-key-remove="${a}" data-key="${escapeHtml(k)}" aria-label="${escapeHtml(t('set.keys.remove', { key: keyLabel(k) }))}">×</button></span>`).join('')
    const adding = waiting && capturing!.slot >= keys.length ? `<kbd class="set-kbd set-kbd-wait">${escapeHtml(t('set.keys.press'))}</kbd>` : ''
    const buttons = waiting
      ? `<button type="button" class="ctrl-btn" data-key-cancel>${escapeHtml(t('set.keys.cancel'))}</button>`
      : `${keys.length ? `<button type="button" class="ctrl-btn" data-key-change="${a}">${escapeHtml(t('set.keys.change'))}</button>` : ''}
         ${keys.length < MAX_KEYS ? `<button type="button" class="ctrl-btn" data-key-add="${a}" aria-label="${escapeHtml(t('set.keys.add.title'))}">+</button>` : ''}
         ${isDefaultBinding(a) ? '' : `<button type="button" class="ctrl-btn" data-key-reset="${a}" title="${escapeHtml(t('set.keys.reset'))}" aria-label="${escapeHtml(t('set.keys.reset'))}">↺</button>`}`
    return `<div class="set-row set-key-row${waiting ? ' set-key-waiting' : ''}" data-search="${escapeHtml(`${t(`action.${a}` as StringKey)} ${keys.join(' ')}`.toLowerCase())}">
      <div class="set-text"><div class="set-label">${escapeHtml(t(`action.${a}` as StringKey))}</div></div>
      <div class="set-control set-keys">${chips}${adding || (keys.length ? '' : `<span class="set-hint">${escapeHtml(t('set.keys.none'))}</span>`)}</div>
      <div class="set-key-buttons">${buttons}</div>
      ${pendingConflict?.action === a ? conflictCard() : ''}
    </div>`
  }).join('')
  const fixed = `<div class="set-row" data-search="${escapeHtml(`${t('set.keys.fixed')} esc 1 9`.toLowerCase())}"><div class="set-text"><div class="set-label">${escapeHtml(t('set.keys.fixed'))}</div><div class="set-hint">${escapeHtml(t('set.keys.fixed.hint'))}</div></div>
    <div class="set-control set-keys"><kbd class="set-kbd">${escapeHtml(t('kbd.esc'))}</kbd><kbd class="set-kbd">1–9</kbd><kbd class="set-kbd">Tab</kbd></div></div>`
  return rows + fixed
}

function redrawShortcuts() {
  const el = document.getElementById('set-shortcuts')
  if (el) el.innerHTML = shortcutsHtml()
}

/** While a key is being set, the next key press is the key: Esc cancels. */
function onCaptureKey(e: KeyboardEvent) {
  if (!capturing) return
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') { capturing = null; redrawShortcuts(); focusShortcut(); return }
  const key = keyName(e)
  if (RESERVED.has(key)) return
  const { action, slot } = capturing
  capturing = null
  const other = conflictFor(key, action)
  if (other) pendingConflict = { action, slot, key, other }
  else assignKey(action, key, slot)
  redrawShortcuts()
  focusShortcut(action)
}

function focusShortcut(action?: Action) {
  const sel = pendingConflict ? '[data-conflict-take]' : action ? `[data-key-change="${action}"], [data-key-add="${action}"]` : '[data-key-change]'
  document.querySelector<HTMLElement>(`#set-shortcuts ${sel}`)?.focus()
}

function startCapture(action: Action, slot: number) {
  capturing = { action, slot }
  pendingConflict = null
  redrawShortcuts()
  document.querySelector<HTMLElement>('#set-shortcuts [data-key-cancel]')?.focus()
}

// ─── Data ────────────────────────────────────────────────────────────────────

/** Songs, history and the like are the user's work, not settings: never exported or reset here. */
export function isDataKey(key: string): boolean {
  return key.startsWith('modus-song') || key.startsWith('harmony-companion-song') ||
    ['active-key', 'storage-persist-asked', 'e2e', 'tour-done', 'ear-score'].includes(key)
}

function settingsSnapshot(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      if (!isDataKey(k)) out[k] = localStorage.getItem(k)!
    }
  } catch { }
  return out
}

/** Replaces every setting with `next` and reloads; the page that loads offers Undo. */
function replaceSettings(next: Record<string, string>, message: StringKey) {
  try {
    sessionStorage.setItem('settings-undo', JSON.stringify({ before: settingsSnapshot(), message }))
    for (const k of Object.keys(settingsSnapshot())) localStorage.removeItem(k)
    for (const [k, v] of Object.entries(next)) if (!isDataKey(k)) localStorage.setItem(k, v)
  } catch { }
  carryHistoryOverReload()
  location.reload()
}

/** After an import or a reset: Undo puts the settings of before back. */
export function offerSettingsUndo() {
  let pending: { before: Record<string, string>; message: StringKey } | null = null
  try { pending = JSON.parse(sessionStorage.getItem('settings-undo') ?? 'null'); sessionStorage.removeItem('settings-undo') } catch { }
  if (!pending) return
  const before = pending.before
  showUndo(t(pending.message), () => {
    try {
      for (const k of Object.keys(settingsSnapshot())) localStorage.removeItem(k)
      for (const [k, v] of Object.entries(before)) localStorage.setItem(k, v)
    } catch { }
    carryHistoryOverReload()
    location.reload()
  })
}

function exportSettings() {
  const body = JSON.stringify({ app: 'modus', kind: 'settings', version: 1, data: settingsSnapshot() }, null, 2)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
  a.download = 'modus-settings.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** The settings a file holds, or null when it is not a Modus settings file. */
export function readSettingsFile(text: string): Record<string, string> | null {
  try {
    const f = JSON.parse(text)
    if (f?.app !== 'modus' || f?.kind !== 'settings' || typeof f.data !== 'object' || !f.data) return null
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(f.data)) if (typeof v === 'string' && !isDataKey(k)) out[k] = v
    return out
  } catch { return null }
}

// ─── The dialog ──────────────────────────────────────────────────────────────

function sectionBody(s: Section): string {
  const prefs = (SECTION_PREFS[s] ?? []).map(prefRow).join('')
  switch (s) {
    case 'general': return `
      ${row(`<label class="set-label" for="help-lang">${escapeHtml(t('help.language'))}</label>`, t('set.reloads'),
        `<select id="help-lang" class="ctrl-select set-select">${LANGS.map(l => `<option value="${l}"${l === getLang() ? ' selected' : ''}>${LANG_NAMES[l]}</option>`).join('')}</select>`, `${t('help.language')} idioma language`)}
      ${row(`<label class="set-label" for="help-note-names">${escapeHtml(t('help.noteNames'))}</label>`, t('set.noteNames.hint'),
        `<select id="help-note-names" class="ctrl-select set-select">${NOTE_NAMINGS.map(n => `<option value="${n}"${n === getNoteNaming() ? ' selected' : ''}>${t(`help.noteNames.${n}`)}</option>`).join('')}</select>`, `${t('help.noteNames')} solfeo solfège`)}
      ${row(`<label class="set-label" for="help-theme">${escapeHtml(t('help.theme'))}</label>`, '',
        `<select id="help-theme" class="ctrl-select set-select">${THEME_CHOICES.map(c => `<option value="${c}"${c === getThemeChoice() ? ' selected' : ''}>${t(`help.theme.${c}`)}</option>`).join('')}</select>`, `${t('help.theme')} theme`)}
      ${prefs}
      ${row(`<div class="set-label">${escapeHtml(t('tour.start'))}</div>`, t('tour.start.title'),
        `<button type="button" id="set-tour" class="ctrl-btn">${escapeHtml(t('tour.start'))}</button>`, `${t('tour.start')} tour`)}`
    case 'io': return `
      ${row(`<label class="set-label" for="midi-in-ch">${escapeHtml(t('set.io.inChannel'))}</label>`, t('midi.inChannel.title'),
        `<select id="midi-in-ch" class="ctrl-select set-select"><option value="0">${t('midi.inChannel.all')}</option>${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">${t('midi.inChannel.one', { n: i + 1 })}</option>`).join('')}</select>`, `${t('set.io.inChannel')} midi`)}
      ${row(`<label class="set-label" for="midi-out">${escapeHtml(t('set.io.out'))}</label>`, t('midi.out.title'),
        `<select id="midi-out" class="ctrl-select set-select"><option value="">${t('midi.out.off')}</option></select>`, `${t('set.io.out')} midi daw`)}
      ${row(`<label class="set-label" for="midi-out-ch">${escapeHtml(t('set.io.outChannel'))}</label>`, t('midi.outChannel.title'),
        `<select id="midi-out-ch" class="ctrl-select set-select">${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">${t('midi.outChannel.one', { n: i + 1 })}</option>`).join('')}</select>`, `${t('set.io.outChannel')} midi`)}
      ${row(`<div class="set-label">${escapeHtml(t('set.io.thru'))}</div>`, t('midi.thru.title'),
        `<button type="button" id="btn-thru" class="mode-btn">${t('midi.thru')}</button>`, `${t('set.io.thru')} thru midi`)}`
    case 'panels': return `
      <p class="set-intro">${escapeHtml(t('set.panels.intro'))}</p>
      ${PANEL_BUTTONS.map(b => row(`<label class="set-label" for="mirror-${b.id}">${escapeHtml(t(b.label))}</label>`, '',
        `<input type="checkbox" id="mirror-${b.id}" class="set-check" data-mirror="${b.id}">`, t(b.label))).join('')}`
    case 'practice': return `${prefs}
      ${row(`<div class="set-label">${escapeHtml(t('set.ear.reset'))}</div>`, t('set.ear.reset.hint'),
        `<button type="button" class="ctrl-btn" data-ear-reset>${escapeHtml(t('set.ear.reset'))}</button>`, `${t('set.ear.reset')}`)}`
    case 'mic': return `
      ${row(`<div class="set-label">${escapeHtml(t('set.mic.mode'))}</div>`, t('set.mic.mode.hint'),
        segmented(t('set.mic.mode'), MIC_MODES.map(m => ({ value: m, label: t(`mic.mode.${m}`), on: getMicMode() === m })), 'data-mic-mode'), `${t('set.mic.mode')} micrófono microphone`)}
      ${prefs}`
    case 'shortcuts': return `
      <div class="set-section-actions"><p class="set-intro">${escapeHtml(t('set.keys.intro'))}</p></div>
      <div id="set-shortcuts">${shortcutsHtml()}</div>`
    case 'data': return `
      ${row(`<div class="set-label">${escapeHtml(t('set.data.export'))}</div>`, t('set.data.export.hint'),
        `<button type="button" class="ctrl-btn" data-export-settings>${escapeHtml(t('set.data.export.button'))}</button>`, t('set.data.export'))}
      ${row(`<div class="set-label">${escapeHtml(t('set.data.import'))}</div>`, t('set.data.import.hint'),
        `<label class="ctrl-btn set-file">${escapeHtml(t('set.data.import.button'))}<input type="file" accept="application/json,.json" data-import-settings hidden></label>`, t('set.data.import'))}
      ${row(`<div class="set-label">${escapeHtml(t('set.data.reset'))}</div>`, t('set.data.reset.hint'),
        `<button type="button" class="ctrl-btn set-danger" data-reset-settings>${escapeHtml(t('set.data.reset.button'))}</button>`, t('set.data.reset'))}
      <p class="set-error" role="alert" hidden></p>`
    default: return prefs
  }
}

/** The dialog's markup: built with the page, hidden until opened (its MIDI controls are wired at start). */
export function buildSettings(): string {
  return `
  <div id="settings" class="set-backdrop" hidden>
    <section class="set-dialog" role="dialog" aria-modal="true" aria-labelledby="set-title">
      <header class="set-header">
        <h1 id="set-title" class="set-title">${escapeHtml(t('set.title'))}</h1>
        <label for="set-search" class="set-search-label">${escapeHtml(t('set.search'))}</label>
        <input id="set-search" class="set-search" type="search" placeholder="${escapeHtml(t('set.search.placeholder'))}" autocomplete="off">
        <span class="set-gap"></span>
        <button type="button" class="set-close" aria-label="${escapeHtml(t('help.close'))}">×</button>
      </header>
      <div class="set-main">
        <nav class="set-nav" aria-label="${escapeHtml(t('set.sections'))}">
          ${SECTIONS.map(s => `<button type="button" class="set-nav-item" data-section="${s}">${escapeHtml(t(`set.section.${s}`))}</button>`).join('')}
        </nav>
        <div class="set-content">
          ${SECTIONS.map(s => `<div class="set-section" data-section="${s}" hidden>
            <h2 class="set-section-title">${escapeHtml(t(`set.section.${s}`))}</h2>
            <p class="set-section-hint">${escapeHtml(t(`set.section.${s}.hint`))}</p>
            ${sectionBody(s)}
          </div>`).join('')}
          <p class="set-nothing" hidden>${escapeHtml(t('set.nothing'))}</p>
        </div>
      </div>
      <footer class="set-footer">
        <span class="set-footnote">${escapeHtml(t('set.footnote'))}</span>
        <span class="set-gap"></span>
        <button type="button" class="ctrl-btn" data-reset-section>${escapeHtml(t('set.resetSection'))}</button>
      </footer>
    </section>
  </div>`
}

let section = loadChoice<Section>('settings-section', SECTIONS, 'general')
let returnFocus: HTMLElement | null = null
const root = () => document.getElementById('settings')

export function isSettingsOpen(): boolean { return !!root() && !root()!.hidden }

function showSection(s: Section) {
  section = s
  save('settings-section', s)
  const el = root()!
  el.querySelectorAll<HTMLElement>('.set-nav-item').forEach(b => b.setAttribute('aria-current', String(b.dataset.section === s)))
  el.querySelectorAll<HTMLElement>('.set-section').forEach(sec => { sec.hidden = sec.dataset.section !== s })
  ;(el.querySelector('[data-reset-section]') as HTMLElement).hidden = s === 'panels' || s === 'data' || s === 'io'
}

/** Search: every row whose words match, in every section; empty shows the section picked. */
function applySearch(q: string) {
  const el = root()!
  const query = q.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  if (!query) {
    el.querySelectorAll<HTMLElement>('.set-row').forEach(r => { r.hidden = false })
    ;(el.querySelector('.set-nothing') as HTMLElement).hidden = true
    showSection(section)
    return
  }
  let any = false
  el.querySelectorAll<HTMLElement>('.set-section').forEach(sec => {
    let shown = 0
    sec.querySelectorAll<HTMLElement>('.set-row').forEach(r => {
      const text = (r.dataset.search ?? '').normalize('NFD').replace(/\p{M}/gu, '')
      r.hidden = !text.includes(query)
      if (!r.hidden) shown++
    })
    sec.hidden = shown === 0
    any ||= shown > 0
  })
  el.querySelectorAll<HTMLElement>('.set-nav-item').forEach(b => b.setAttribute('aria-current', 'false'))
  ;(el.querySelector('.set-nothing') as HTMLElement).hidden = any
}

function syncMirrors() {
  root()!.querySelectorAll<HTMLInputElement>('[data-mirror]').forEach(box => {
    const b = document.getElementById(box.dataset.mirror!)
    box.checked = b?.getAttribute('aria-pressed') === 'true'
    box.disabled = !b
  })
}

export function openSettings(at?: Section) {
  const el = root()
  if (!el) return
  returnFocus = document.activeElement as HTMLElement | null
  el.hidden = false
  syncMirrors()
  showSection(at ?? section)
  ;(el.querySelector('#set-search') as HTMLInputElement).value = ''
  applySearch('')
  el.querySelector<HTMLElement>(`.set-nav-item[data-section="${section}"]`)?.focus()
}

export function closeSettings(): boolean {
  const el = root()
  if (!el || el.hidden) return false
  if (capturing) { capturing = null; redrawShortcuts(); return true }
  el.hidden = true
  pendingConflict = null
  returnFocus?.focus()
  returnFocus = null
  return true
}

/** The handlers of the controls Settings owns; `resetEarScore` comes from the ear panel. */
export function wireSettings(opts: { resetEarScore: () => void }) {
  const el = root()
  if (!el) return
  document.addEventListener('keydown', onCaptureKey, true)
  el.addEventListener('mousedown', e => { if (e.target === el) closeSettings() })
  el.querySelector('.set-close')!.addEventListener('click', () => closeSettings())
  el.querySelectorAll<HTMLElement>('.set-nav-item').forEach(b => b.addEventListener('click', () => {
    ;(el.querySelector('#set-search') as HTMLInputElement).value = ''
    applySearch('')
    showSection(b.dataset.section as Section)
  }))
  el.querySelector('#set-search')!.addEventListener('input', e => applySearch((e.target as HTMLInputElement).value))

  // Preferences
  el.addEventListener('click', e => {
    const target = e.target as HTMLElement
    const seg = target.closest<HTMLElement>('[data-pref][data-value]')
    if (seg) {
      setPref(seg.dataset.pref as PrefName, seg.dataset.value as never)
      seg.parentElement!.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === seg)))
    }
    if (target.closest('[data-ear-reset]')) opts.resetEarScore()
    const mic = target.closest<HTMLElement>('[data-mic-mode]')
    if (mic) {
      setMicMode(mic.dataset.value as typeof MIC_MODES[number])
      mic.parentElement!.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === mic)))
    }
  })
  el.addEventListener('input', e => {
    const input = e.target as HTMLInputElement
    const name = input.dataset.pref as PrefName | undefined
    if (input.dataset.prefSet) {
      const set = input.dataset.prefSet as PrefName
      const chosen = [...el.querySelectorAll<HTMLInputElement>(`[data-pref-set="${set}"]`)].filter(b => b.checked).map(b => b.value)
      setPref(set, chosen as never)
      return
    }
    if (!name) return
    const def = PREFS[name] as PrefDef
    if (def.kind === 'number') {
      const out = input.parentElement!.querySelector('output')
      if (out) out.textContent = formatPrefValue(def, Number(input.value))
      // Rescaling the page while dragging moves the slider under the pointer: on release only
      if (name !== 'ui-zoom') setPref(name, Number(input.value) as never)
    } else if (def.kind === 'bool') setPref(name, input.checked as never)
    else if (def.kind === 'choice') setPref(name, input.value as never)
  })

  el.addEventListener('change', e => {
    const input = e.target as HTMLInputElement
    if (input.dataset.pref === 'ui-zoom') setPref('ui-zoom', Number(input.value))
  })

  // Language, note names, theme, tour
  el.querySelector<HTMLSelectElement>('#help-theme')!.addEventListener('change', e => saveThemeChoice((e.target as HTMLSelectElement).value as ThemeChoice))
  const reloadWith = (apply: () => void) => { apply(); carryHistoryOverReload(); location.reload() }
  el.querySelector<HTMLSelectElement>('#help-lang')!.addEventListener('change', e => reloadWith(() => saveLang((e.target as HTMLSelectElement).value as Lang)))
  el.querySelector<HTMLSelectElement>('#help-note-names')!.addEventListener('change', e => reloadWith(() => saveNoteNaming((e.target as HTMLSelectElement).value as NoteNaming)))
  el.querySelector('#set-tour')!.addEventListener('click', () => { closeSettings(); startTour() })

  // Panels: the checkbox presses the panel's own button
  el.querySelectorAll<HTMLInputElement>('[data-mirror]').forEach(box => box.addEventListener('change', () => {
    document.getElementById(box.dataset.mirror!)?.click()
    syncMirrors()
  }))


  // Shortcuts
  el.querySelector('#set-shortcuts')!.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!b) return
    if (b.dataset.keyChange) startCapture(b.dataset.keyChange as Action, 0)
    else if (b.dataset.keyAdd) startCapture(b.dataset.keyAdd as Action, keysOf(b.dataset.keyAdd as Action).length)
    else if (b.hasAttribute('data-key-cancel')) { capturing = null; redrawShortcuts(); focusShortcut() }
    else if (b.dataset.keyRemove) { removeKey(b.dataset.keyRemove as Action, b.dataset.key!); redrawShortcuts() }
    else if (b.dataset.keyReset) { resetKeys(b.dataset.keyReset as Action); redrawShortcuts() }
    else if (b.hasAttribute('data-conflict-take') && pendingConflict) {
      const c = pendingConflict
      pendingConflict = null
      assignKey(c.action, c.key, c.slot)
      redrawShortcuts()
      focusShortcut(c.action)
    } else if (b.hasAttribute('data-conflict-other') && pendingConflict) {
      const c = pendingConflict
      startCapture(c.action, c.slot)
    }
  })

  // Reset this section
  el.querySelector('[data-reset-section]')!.addEventListener('click', () => {
    if (section === 'shortcuts') { resetAllKeys(); capturing = null; pendingConflict = null; redrawShortcuts(); return }
    if (section === 'general') saveThemeChoice('system')
    for (const name of SECTION_PREFS[section] ?? []) resetPref(name)
    if (section === 'mic') setMicMode('notes')
    const sec = el.querySelector<HTMLElement>(`.set-section[data-section="${section}"]`)!
    // Drawn again with the values put back
    const tmp = document.createElement('div')
    tmp.innerHTML = buildSettings()
    const fresh = tmp.querySelector<HTMLElement>(`.set-section[data-section="${section}"]`)
    if (fresh) sec.innerHTML = fresh.innerHTML
    if (section === 'general') rewireGeneral(el)
  })

  // Data
  const error = el.querySelector<HTMLElement>('.set-error')!
  el.querySelector('[data-export-settings]')!.addEventListener('click', exportSettings)
  el.querySelector<HTMLInputElement>('[data-import-settings]')!.addEventListener('change', async e => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const next = readSettingsFile(await file.text())
    if (!next) { error.hidden = false; error.textContent = t('set.data.import.bad'); return }
    replaceSettings(next, 'set.data.imported')
  })
  el.querySelector('[data-reset-settings]')!.addEventListener('click', () => replaceSettings({}, 'set.data.wasReset'))

  function rewireGeneral(container: HTMLElement) {
    container.querySelector<HTMLSelectElement>('#help-theme')!.addEventListener('change', e => saveThemeChoice((e.target as HTMLSelectElement).value as ThemeChoice))
    container.querySelector<HTMLSelectElement>('#help-lang')!.addEventListener('change', e => reloadWith(() => saveLang((e.target as HTMLSelectElement).value as Lang)))
    container.querySelector<HTMLSelectElement>('#help-note-names')!.addEventListener('change', e => reloadWith(() => saveNoteNaming((e.target as HTMLSelectElement).value as NoteNaming)))
    container.querySelector('#set-tour')!.addEventListener('click', () => { closeSettings(); startTour() })
  }
}
