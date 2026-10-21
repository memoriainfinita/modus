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
import type { Command } from './commands'
import { getThemeChoice, saveThemeChoice, THEME_CHOICES } from './theme'
import type { ThemeChoice } from './theme'
import { PREFS, getPref, setPref, resetPref, onPrefChange, type PrefName, type PrefDef } from '../settings/prefs'
import { ACTIONS, DEFAULT_KEYS, MAX_KEYS, RESERVED, keysOf, isDefaultBinding, keyName, conflictFor, assignKey, removeKey, resetKeys, resetAllKeys, type Action } from '../input/bindings'
import { MIC_MODES, getMicMode, setMicMode } from '../input/mic'
import { startTour } from './tour'
import { carryHistoryOverReload } from '../history/history'
import { ICONS } from './icons'

export const SECTIONS = ['general', 'io', 'sound', 'theory', 'detector', 'panels', 'practice', 'mic', 'shortcuts', 'data'] as const
export type Section = typeof SECTIONS[number]

/** The preferences in each section, in the order they are shown. */
const SECTION_PREFS: Partial<Record<Section, PrefName[]>> = {
  general: ['ui-zoom'],
  sound: ['preview-s', 'piano-velocity'],
  theory: ['chord-style', 'key-profile', 'auto-modes', 'voice-rules', 'movable-do'],
  detector: ['history-hold-ms', 'history-max', 'history-bpm', 'history-beats', 'arpeggio-ms', 'melody-gap-s', 'capture-ms'],
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
export const prefLabel = lbl
const hint = (name: PrefName) => t(`pref.${name}.hint` as StringKey)

export function prefOptionLabel(name: PrefName, option: string): string { return optionLabel(name, option) }
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

// A row: the setting's name with its value under it, its explanation behind ⓘ (a tooltip, or
// shown under the row when pressed), and its control on the right. A choice is the row itself:
// it opens a list to pick from (the picker below), its select hidden as the holder of the value.

const info = (hintText: string) => hintText
  ? `<button type="button" class="set-info" title="${escapeHtml(hintText)}" aria-label="${escapeHtml(hintText)}" aria-expanded="false">ⓘ</button>`
  : ''

const row = (labelHtml: string, hintText: string, control: string, search: string, extra = '') => `
  <div class="set-row" data-search="${escapeHtml(search.toLowerCase())}">
    <div class="set-text">${labelHtml}</div>${info(hintText)}
    ${control ? `<div class="set-control">${control}</div>` : ''}${extra}
    ${hintText ? `<div class="set-hint" hidden>${escapeHtml(hintText)}</div>` : ''}
  </div>`

/** A row that opens the picker on `holder` (a select's id, or a group of hidden checkboxes). */
const pickRow = (holder: string, label: string, value: string, hintText: string, search: string, holderHtml: string) => `
  <div class="set-row" data-search="${escapeHtml(search.toLowerCase())}">
    <button type="button" class="set-text set-pick" data-pick="${holder}" aria-haspopup="dialog">
      <span class="set-label">${escapeHtml(label)}</span><span class="set-value" data-shows="${holder}">${escapeHtml(value)}</span>
    </button>${info(hintText)}${holderHtml}
    ${hintText ? `<div class="set-hint" hidden>${escapeHtml(hintText)}</div>` : ''}
  </div>`

/** A choice as a picker row over its hidden select. */
function selectRow(id: string, label: string, options: { value: string; label: string }[], value: string, hintText: string, search: string, attrs = ''): string {
  const select = `<select id="${id}" class="set-holder" hidden${attrs}>${options.map(o =>
    `<option value="${escapeHtml(o.value)}"${o.value === value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select>`
  return pickRow(id, label, options.find(o => o.value === value)?.label ?? '', hintText, search, select)
}

function prefRow(name: PrefName): string {
  const def = PREFS[name] as PrefDef
  const id = `pref-${name}`
  const v = getPref(name)
  const search = `${lbl(name)} ${hint(name)}`
  switch (def.kind) {
    case 'choice':
      return selectRow(id, lbl(name), def.options.map(o => ({ value: o, label: optionLabel(name, o) })), v as string, hint(name), search, ` data-pref="${name}"`)
    case 'bool':
      return row(`<label class="set-label" for="${id}">${escapeHtml(lbl(name))}</label>`, hint(name),
        `<input type="checkbox" id="${id}" class="set-check" role="switch" data-pref="${name}"${v ? ' checked' : ''}>`, search)
    case 'number':
      return row(`<label class="set-label" for="${id}">${escapeHtml(lbl(name))}</label><output class="set-value" for="${id}">${escapeHtml(formatPrefValue(def, v as number))}</output>`, hint(name),
        `<input type="range" id="${id}" class="set-range" data-pref="${name}" min="${def.min}" max="${def.max}" step="${def.step}" value="${v}">`, search)
    case 'set': {
      const holder = `pref-set-${name}`
      const boxes = `<div id="${holder}" class="set-holder" hidden aria-label="${escapeHtml(lbl(name))}">${def.options.map(o =>
        `<input type="checkbox" data-pref-set="${name}" value="${escapeHtml(o)}" data-label="${escapeHtml(optionLabel(name, o))}"${(v as string[]).includes(o) ? ' checked' : ''}>`).join('')}</div>`
      return pickRow(holder, lbl(name), setSummary(name, v as string[]), hint(name),
        search + ' ' + def.options.map(o => optionLabel(name, o)).join(' '), boxes)
    }
  }
}

function setSummary(name: PrefName, chosen: string[]): string {
  return chosen.length ? chosen.map(o => optionLabel(name, o)).join(', ') : '—'
}

/** What a picker row shows under its name: the option chosen, or the boxes ticked. */
function holderValue(holder: HTMLElement): string {
  // A port that would loop back to the input says so (app.ts marks its select)
  if (holder instanceof HTMLSelectElement) return (holder.selectedOptions[0]?.textContent ?? '') + (holder.classList.contains('invalid') ? ` · ${holder.title}` : '')
  const on = [...holder.querySelectorAll<HTMLInputElement>('input:checked')].map(b => b.dataset.label ?? b.value)
  return on.length ? on.join(', ') : '—'
}

/** Every picker row shows its holder's value again: a select may be changed by the app without an event. */
function refreshValues() {
  root()?.querySelectorAll<HTMLElement>('[data-shows]').forEach(out => {
    const holder = document.getElementById(out.dataset.shows!)
    if (holder) out.textContent = holderValue(holder)
  })
  refreshSummaries()
}

/** A preference changed elsewhere (a panel's ⋯ menu): its control here shows the new value. */
function syncPrefControl(name: PrefName) {
  const el = root()
  if (!el) return
  const def = PREFS[name] as PrefDef
  const v = getPref(name)
  el.querySelectorAll<HTMLElement>(`[data-pref="${name}"]`).forEach(c => {
    if (c instanceof HTMLInputElement && c.type === 'range') {
      c.value = String(v)
      const out = el.querySelector(`output[for="${c.id}"]`)
      if (out) out.textContent = formatPrefValue(def as { unit: string }, v as number)
    } else if (c instanceof HTMLInputElement && c.type === 'checkbox') c.checked = v as boolean
    else if (c instanceof HTMLSelectElement) c.value = v as string
  })
  el.querySelectorAll<HTMLInputElement>(`input[data-pref-set="${name}"]`).forEach(box => { box.checked = (v as string[]).includes(box.value) })
  refreshValues()
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
      ${selectRow('help-lang', t('help.language'), LANGS.map(l => ({ value: l, label: LANG_NAMES[l] })), getLang(), t('set.reloads'), `${t('help.language')} idioma language`)}
      ${selectRow('help-note-names', t('help.noteNames'), NOTE_NAMINGS.map(n => ({ value: n, label: t(`help.noteNames.${n}`) })), getNoteNaming(), t('set.noteNames.hint'), `${t('help.noteNames')} solfeo solfège`)}
      ${selectRow('help-theme', t('help.theme'), THEME_CHOICES.map(c => ({ value: c, label: t(`help.theme.${c}`) })), getThemeChoice(), '', `${t('help.theme')} theme`)}
      ${prefs}
      ${row(`<div class="set-label">${escapeHtml(t('tour.start'))}</div>`, t('tour.start.title'),
        `<button type="button" id="set-tour" class="ctrl-btn">${escapeHtml(t('tour.start'))}</button>`, `${t('tour.start')} tour`)}`
    case 'io': return `
      ${selectRow('midi-in-ch', t('set.io.inChannel'), [{ value: '0', label: t('midi.inChannel.all') }, ...Array.from({ length: 16 }, (_, i) => ({ value: String(i + 1), label: t('midi.inChannel.one', { n: i + 1 }) }))], '0', t('midi.inChannel.title'), `${t('set.io.inChannel')} midi`)}
      ${selectRow('midi-out', t('set.io.out'), [{ value: '', label: t('midi.out.off') }], '', t('midi.out.title'), `${t('set.io.out')} midi daw`)}
      ${selectRow('midi-out-ch', t('set.io.outChannel'), Array.from({ length: 16 }, (_, i) => ({ value: String(i + 1), label: t('midi.outChannel.one', { n: i + 1 }) })), '1', t('midi.outChannel.title'), `${t('set.io.outChannel')} midi`)}
      ${row(`<div class="set-label">${escapeHtml(t('set.io.thru'))}</div>`, t('midi.thru.title'),
        `<button type="button" id="btn-thru" class="set-switch" role="switch" aria-checked="false" aria-label="${escapeHtml(t('set.io.thru'))}"></button>`, `${t('set.io.thru')} thru midi`)}`
    case 'panels': return PANEL_BUTTONS.map(b => row(`<label class="set-label" for="mirror-${b.id}">${escapeHtml(t(b.label))}</label>`, '',
        `<input type="checkbox" id="mirror-${b.id}" class="set-check" role="switch" data-mirror="${b.id}">`, t(b.label))).join('')
    case 'practice': return `${prefs}
      ${row(`<div class="set-label">${escapeHtml(t('set.ear.reset'))}</div>`, t('set.ear.reset.hint'),
        `<button type="button" class="ctrl-btn" data-ear-reset>${escapeHtml(t('set.ear.reset.button'))}</button>`, `${t('set.ear.reset')}`)}`
    case 'mic': return `
      ${selectRow('set-mic-mode', t('set.mic.mode'), MIC_MODES.map(m => ({ value: m, label: t(`mic.mode.${m}`) })), getMicMode(), t('set.mic.mode.hint'), `${t('set.mic.mode')} micrófono microphone`)}
      ${prefs}`
    case 'shortcuts': return `<div id="set-shortcuts">${shortcutsHtml()}</div>`
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

const SECTION_ICONS: Record<Section, string> = {
  general: ICONS.sliders, io: ICONS.midi, sound: ICONS.sound, theory: ICONS.note, detector: ICONS.clock,
  panels: ICONS.layout, practice: ICONS.ear, mic: ICONS.mic, shortcuts: ICONS.keyboard, data: ICONS.file,
}

/** Sections whose ⋮ menu offers to put their settings back. */
const resettable = (s: Section) => s !== 'panels' && s !== 'data' && s !== 'io'

/** A section's head: ← back to the list (on a phone), its name, ⓘ, and ⋮ with Reset this section. */
function sectionHead(s: Section): string {
  const intro = s === 'panels' ? t('set.panels.intro') : s === 'shortcuts' ? t('set.keys.intro') : ''
  return `<div class="set-section-head">
    <button type="button" class="set-back" aria-label="${escapeHtml(t('set.back'))}">←</button>
    <h2 class="set-section-title">${escapeHtml(t(`set.section.${s}`))}</h2>
    ${info([t(`set.section.${s}.hint` as StringKey), intro].filter(Boolean).join('. '))}
    <span class="set-gap"></span>
    ${resettable(s) ? `<div class="set-more-wrap">
      <button type="button" class="set-more" aria-haspopup="true" aria-expanded="false" aria-label="${escapeHtml(t('menu.options'))}">⋮</button>
      <div class="set-more-menu" hidden><button type="button" class="menu-item" data-reset-section><span class="menu-label">${escapeHtml(t('set.resetSection'))}</span></button></div>
    </div>` : ''}
    <div class="set-hint" hidden>${escapeHtml([t(`set.section.${s}.hint` as StringKey), intro].filter(Boolean).join('. '))}</div>
  </div>`
}

/** The dialog's markup: built with the page, hidden until opened (its MIDI controls are wired at start). */
export function buildSettings(): string {
  return `
  <div id="settings" class="set-backdrop" hidden>
    <section class="set-dialog" role="dialog" aria-modal="true" aria-labelledby="set-title">
      <header class="set-header">
        <h1 id="set-title" class="set-title" title="${escapeHtml(t('set.footnote'))}">${escapeHtml(t('set.title'))}</h1>
        <input id="set-search" class="set-search" type="search" placeholder="${escapeHtml(t('set.search.placeholder'))}" aria-label="${escapeHtml(t('set.search'))}" autocomplete="off">
        <span class="set-gap"></span>
        <button type="button" class="set-close" aria-label="${escapeHtml(t('help.close'))}">×</button>
      </header>
      <div class="set-main">
        <nav class="set-nav" aria-label="${escapeHtml(t('set.sections'))}">
          ${SECTIONS.map(s => `<button type="button" class="set-nav-item" data-section="${s}">
            <span class="set-nav-icon">${SECTION_ICONS[s]}</span>
            <span class="set-nav-text"><span class="set-nav-name">${escapeHtml(t(`set.section.${s}`))}</span><span class="set-nav-sum" data-summary="${s}"></span></span>
          </button>`).join('')}
        </nav>
        <div class="set-content">
          ${SECTIONS.map(s => `<div class="set-section" data-section="${s}" hidden>
            ${sectionHead(s)}
            ${sectionBody(s)}
          </div>`).join('')}
          <p class="set-nothing" hidden>${escapeHtml(t('set.nothing'))}</p>
        </div>
      </div>
      <div class="set-pick-layer" hidden>
        <div class="set-pick-card" role="dialog" aria-modal="true" aria-labelledby="set-pick-title">
          <h3 id="set-pick-title" class="set-pick-title"></h3>
          <div class="set-pick-list"></div>
          <div class="set-pick-foot"><button type="button" class="ctrl-btn" data-pick-done>${escapeHtml(t('set.pick.done'))}</button></div>
        </div>
      </div>
    </section>
  </div>`
}

/** Under each section's name in the list (on a phone): the values of its first settings. */
function sectionSummary(s: Section): string {
  const el = root()!
  const sec = el.querySelector<HTMLElement>(`.set-section[data-section="${s}"]`)!
  if (s === 'panels') {
    const boxes = [...sec.querySelectorAll<HTMLInputElement>('[data-mirror]')]
    return t('set.summary.on', { n: boxes.filter(b => b.checked).length, total: boxes.length })
  }
  if (s === 'shortcuts') {
    const changed = ACTIONS.filter(a => !isDefaultBinding(a)).length
    return changed ? t('set.summary.keys.changed', { n: changed }) : t('set.summary.keys.default')
  }
  if (s === 'data') return t('set.summary.data')
  return [...sec.querySelectorAll<HTMLElement>('.set-row .set-value')].slice(0, 3).map(v => v.textContent ?? '').join(' · ')
}

function refreshSummaries() {
  root()?.querySelectorAll<HTMLElement>('[data-summary]').forEach(el => { el.textContent = sectionSummary(el.dataset.summary as Section) })
}

// ─── The picker ──────────────────────────────────────────────────────────────

let picking: { holder: HTMLElement; from: HTMLElement } | null = null

/** A list over Settings to pick one option of a select, or tick the boxes of a group. */
function openPicker(from: HTMLElement) {
  const holder = document.getElementById(from.dataset.pick!)
  const layer = root()!.querySelector<HTMLElement>('.set-pick-layer')!
  if (!holder) return
  picking = { holder, from }
  layer.querySelector('.set-pick-title')!.textContent = from.querySelector('.set-label')?.textContent ?? ''
  const list = layer.querySelector<HTMLElement>('.set-pick-list')!
  const single = holder instanceof HTMLSelectElement
  list.setAttribute('role', single ? 'radiogroup' : 'group')
  list.innerHTML = single
    ? [...holder.options].map(o => `<button type="button" class="set-pick-option" role="radio" aria-checked="${o.selected}" data-pick-value="${escapeHtml(o.value)}"${o.disabled ? ' disabled' : ''}><span class="set-radio" aria-hidden="true"></span>${escapeHtml(o.textContent ?? '')}</button>`).join('')
    : [...holder.querySelectorAll<HTMLInputElement>('input')].map(b => `<label class="set-pick-option"><input type="checkbox" data-pick-check="${escapeHtml(b.value)}"${b.checked ? ' checked' : ''}>${escapeHtml(b.dataset.label ?? b.value)}</label>`).join('')
  layer.querySelector<HTMLElement>('.set-pick-foot')!.hidden = single
  layer.hidden = false
  ;(list.querySelector<HTMLElement>('[aria-checked="true"], input') ?? list.querySelector<HTMLElement>('button'))?.focus()
}

function closePicker(): boolean {
  if (!picking) return false
  root()!.querySelector<HTMLElement>('.set-pick-layer')!.hidden = true
  picking.from.focus()
  picking = null
  refreshValues()
  return true
}

let section = loadChoice<Section>('settings-section', SECTIONS, 'general')
let returnFocus: HTMLElement | null = null
const root = () => document.getElementById('settings')

export function isSettingsOpen(): boolean { return !!root() && !root()!.hidden }

// On a phone Settings fills the screen: first the search and the list of sections, then a
// section's page with ← back. On a wider screen both show side by side.
const phone = () => matchMedia('(max-width: 720px)').matches
const dialog = () => root()!.querySelector<HTMLElement>('.set-dialog')!
const isPaged = () => dialog().classList.contains('set-paged')

function showSection(s: Section, paged = true) {
  section = s
  save('settings-section', s)
  const el = root()!
  el.querySelectorAll<HTMLElement>('.set-nav-item').forEach(b => b.setAttribute('aria-current', String(b.dataset.section === s)))
  el.querySelectorAll<HTMLElement>('.set-section').forEach(sec => { sec.hidden = sec.dataset.section !== s })
  dialog().classList.toggle('set-paged', paged)
  closeMoreMenus()
}

/** From a section's page back to the list of sections (a phone's ←, Esc). */
function backToList() {
  dialog().classList.remove('set-paged')
  root()!.querySelector<HTMLElement>(`.set-nav-item[data-section="${section}"]`)?.focus()
}

function closeMoreMenus() {
  root()?.querySelectorAll<HTMLElement>('.set-more-menu').forEach(m => { m.hidden = true })
  root()?.querySelectorAll<HTMLElement>('.set-more').forEach(b => b.setAttribute('aria-expanded', 'false'))
}

/** Search: every row whose words match, in every section; empty shows the section picked. */
function applySearch(q: string) {
  const el = root()!
  const query = q.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  dialog().classList.toggle('set-searching', !!query)
  if (!query) {
    el.querySelectorAll<HTMLElement>('.set-row').forEach(r => { r.hidden = false })
    ;(el.querySelector('.set-nothing') as HTMLElement).hidden = true
    showSection(section, isPaged())
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
  // A phone opens on the list of sections, unless a section was asked for
  const paged = !!at || !phone()
  ;(el.querySelector('#set-search') as HTMLInputElement).value = ''
  showSection(at ?? section, paged)
  applySearch('')
  refreshValues()
  if (paged && phone()) el.querySelector<HTMLElement>(`.set-section[data-section="${section}"] .set-back`)?.focus()
  else el.querySelector<HTMLElement>(`.set-nav-item[data-section="${section}"]`)?.focus()
}

/** Settings opened on what a search finds: the row asked for, and any other that matches. */
export function openSettingsAt(query: string) {
  openSettings()
  const search = root()!.querySelector('#set-search') as HTMLInputElement
  search.value = query
  applySearch(query)
}

/** Each row of Settings as an order for the bar's field: it opens Settings on that row. */
export function settingsCommands(): Command[] {
  const el = root()
  if (!el) return []
  return [...el.querySelectorAll<HTMLElement>('.set-section')].flatMap(sec => {
    const hint = sec.querySelector('.set-section-title')?.textContent ?? ''
    return [...sec.querySelectorAll<HTMLElement>('.set-row .set-label')].map(label => {
      const name = label.textContent?.trim() ?? ''
      return { label: t('cmd.setting', { name }), hint, run: () => openSettingsAt(name) }
    })
  })
}

export function closeSettings(): boolean {
  const el = root()
  if (!el || el.hidden) return false
  if (capturing) { capturing = null; redrawShortcuts(); return true }
  if (closePicker()) return true
  if (el.querySelector('.set-more-menu:not([hidden])')) { closeMoreMenus(); return true }
  // On a phone Esc (or the system's back) leaves the page for the list first
  if (phone() && isPaged() && !dialog().classList.contains('set-searching')) { backToList(); return true }
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
  onPrefChange(syncPrefControl)
  el.addEventListener('mousedown', e => { if (e.target === el) closeSettings() })
  el.querySelector('.set-close')!.addEventListener('click', () => closeSettings())
  el.querySelectorAll<HTMLElement>('.set-nav-item').forEach(b => b.addEventListener('click', () => {
    ;(el.querySelector('#set-search') as HTMLInputElement).value = ''
    applySearch('')
    showSection(b.dataset.section as Section)
  }))
  el.querySelector('#set-search')!.addEventListener('input', e => applySearch((e.target as HTMLInputElement).value))
  // The MIDI ports come and go while Settings may be open: their rows follow
  const holders = new MutationObserver(() => refreshValues())
  el.querySelectorAll('select.set-holder').forEach(s => holders.observe(s, { childList: true, attributes: true }))

  // Rows: ⓘ, the pickers, ← and ⋮
  el.addEventListener('click', e => {
    const target = e.target as HTMLElement
    const infoBtn = target.closest<HTMLElement>('.set-info')
    if (infoBtn) {
      const hintEl = infoBtn.parentElement!.querySelector<HTMLElement>(':scope > .set-hint')
      if (hintEl) {
        hintEl.hidden = !hintEl.hidden
        infoBtn.setAttribute('aria-expanded', String(!hintEl.hidden))
      }
      return
    }
    const pick = target.closest<HTMLElement>('[data-pick]')
    if (pick) { openPicker(pick); return }
    if (target.closest('.set-back')) { backToList(); return }
    const more = target.closest<HTMLElement>('.set-more')
    if (more) {
      const menu = more.parentElement!.querySelector<HTMLElement>('.set-more-menu')!
      const open = menu.hidden
      closeMoreMenus()
      menu.hidden = !open
      more.setAttribute('aria-expanded', String(open))
      return
    }
    if (!target.closest('.set-more-menu')) closeMoreMenus()
    if (target.closest('[data-ear-reset]')) opts.resetEarScore()
  })

  // The picker: a choice is set at once and closes the list; boxes stay until Done
  const layer = el.querySelector<HTMLElement>('.set-pick-layer')!
  layer.addEventListener('click', e => {
    const target = e.target as HTMLElement
    e.stopPropagation()
    if (target === layer || target.closest('[data-pick-done]')) { closePicker(); return }
    const option = target.closest<HTMLElement>('[data-pick-value]')
    if (option && picking?.holder instanceof HTMLSelectElement) {
      const sel = picking.holder
      sel.value = option.dataset.pickValue!
      closePicker()
      sel.dispatchEvent(new Event('input', { bubbles: true }))
      sel.dispatchEvent(new Event('change', { bubbles: true }))
      refreshValues()
    }
  })
  layer.addEventListener('change', e => {
    const box = (e.target as HTMLElement).closest<HTMLInputElement>('[data-pick-check]')
    if (!box || !picking) return
    const holderBox = [...picking.holder.querySelectorAll<HTMLInputElement>('input')].find(b => b.value === box.dataset.pickCheck)
    if (!holderBox) return
    holderBox.checked = box.checked
    holderBox.dispatchEvent(new Event('input', { bubbles: true }))
    refreshValues()
  })
  // Arrows move through the options of a list
  layer.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = [...layer.querySelectorAll<HTMLElement>('.set-pick-option:not([disabled]), .set-pick-option input')].filter(i => i.tagName !== 'LABEL')
    const i = items.indexOf(document.activeElement as HTMLElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
    e.preventDefault()
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
      const out = el.querySelector(`output[for="${input.id}"]`)
      if (out) out.textContent = formatPrefValue(def, Number(input.value))
      // Rescaling the page while dragging moves the slider under the pointer: on release only
      if (name !== 'ui-zoom') setPref(name, Number(input.value) as never)
    } else if (def.kind === 'bool') setPref(name, input.checked as never)
    else if (def.kind === 'choice') setPref(name, input.value as never)
  })

  // Language, note names, theme and the microphone's mode, by their holders' change (they are
  // drawn again by Reset this section); a panel's switch presses the panel's own button
  const reloadWith = (apply: () => void) => { apply(); carryHistoryOverReload(); location.reload() }
  el.addEventListener('change', e => {
    const input = e.target as HTMLInputElement
    if (input.dataset.pref === 'ui-zoom') setPref('ui-zoom', Number(input.value))
    else if (input.id === 'help-theme') saveThemeChoice(input.value as ThemeChoice)
    else if (input.id === 'help-lang') reloadWith(() => saveLang(input.value as Lang))
    else if (input.id === 'help-note-names') reloadWith(() => saveNoteNaming(input.value as NoteNaming))
    else if (input.id === 'set-mic-mode') setMicMode(input.value as typeof MIC_MODES[number])
    else if (input.dataset.mirror) {
      document.getElementById(input.dataset.mirror)?.click()
      syncMirrors()
    }
    refreshSummaries()
  })
  el.addEventListener('click', e => { if ((e.target as HTMLElement).closest('#set-tour')) { closeSettings(); startTour() } })


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

  // Reset this section, from its ⋮ menu
  el.addEventListener('click', e => {
    if (!(e.target as HTMLElement).closest('[data-reset-section]')) return
    closeMoreMenus()
    if (section === 'shortcuts') { resetAllKeys(); capturing = null; pendingConflict = null; redrawShortcuts(); refreshSummaries(); return }
    if (section === 'general') saveThemeChoice('system')
    for (const name of SECTION_PREFS[section] ?? []) resetPref(name)
    if (section === 'mic') setMicMode('notes')
    const sec = el.querySelector<HTMLElement>(`.set-section[data-section="${section}"]`)!
    // Drawn again with the values put back
    const tmp = document.createElement('div')
    tmp.innerHTML = buildSettings()
    const fresh = tmp.querySelector<HTMLElement>(`.set-section[data-section="${section}"]`)
    if (fresh) sec.innerHTML = fresh.innerHTML
    refreshValues()
    sec.querySelector<HTMLElement>('.set-more')?.focus()
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
}
