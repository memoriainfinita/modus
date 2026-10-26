import type { Song, Section, Measure, SongChord, SectionColor } from '../types'
import { playChord, playNoteNames } from '../audio/audio'
import {
  createSong, isBlankSong, addSection, removeSection, updateSection, duplicateSection,
  addMeasure, removeMeasure, addChord, updateChord, removeChord, duplicateChord,
  moveChordToPosition, reorderSections, computeMeasureNumbers, parseProgressionMeasures, appendProgression,
  computeDegree, isBorrowedChord, transposeSong, transposeKey, detectForm,
  replaceSectionProgression, sectionAsText,
} from './model'
import { romanInKey } from '../detector/analyzer'
import { wirePopover, closePopover, isPopoverOpen } from '../ui/popover'
import { saveSong, type SongMeta } from './library'
import { makeActivatable } from '../ui/a11y'
import { escapeHtml } from '../ui/html'
import { showUndo } from '../ui/undo'
import { readTypedChord, isKnownChord, chordNoteNames } from '../theory/chord'
import { songSchedule, playSchedule, stopSong, isSongPlaying, songTempo, songBeats, TEMPO_RANGE, BEATS_RANGE, type SongStep } from './playback'
import { t, chordLabel, keyLabel } from '../i18n/i18n'
import type { StringKey } from '../i18n/en'

// ─── Song UI ─────────────────────────────────────────────────────────────────

const SECTION_COLORS: Record<SectionColor, string> = {
  intro: 'var(--section-intro)', verse: 'var(--section-verse)', prechorus: 'var(--section-prechorus)',
  chorus: 'var(--section-chorus)', bridge: 'var(--section-bridge)', outro: 'var(--section-outro)', custom: 'var(--section-custom)'
}

type SongEventHandlers = {
  onChordClick: (chordId: string, symbol: string, notes?: string[]) => void
  onChordCapture: (chordId: string) => void
  /** The song playing reaches a step: show its chord (the view sounds it) */
  onPlayStep: (step: SongStep, previous: SongStep | null) => void
  activeCursorId: string | null
  captureTargetId: string | null
  activeKey: string | null
  /** The key is read, not chosen: from the song's own chords, or the history */
  keyIsAuto: boolean
  onSongChange: (song: Song) => void
  songs: SongMeta[]
  onOpenSong: (id: string) => void
  onNewSong: () => void
  onDeleteSong: () => void
}

let _song: Song = createSong()
let _handlers: SongEventHandlers | null = null
let _container: HTMLElement | null = null

let _draggedSectionId: string | null = null
let _draggedChordId: string | null = null
let _dropIndicator: HTMLElement | null = null
let _insertBeforeChordId: string | null = null  // null = append to end of measure

function showNotice(msg: string, type: 'info' | 'warn' = 'info') {
  if (!_container) return
  document.querySelectorAll('.song-notice').forEach(el => el.remove())
  const div = document.createElement('div')
  div.className = `song-notice${type === 'warn' ? ' warn' : ''}`
  const span = document.createElement('span')
  span.textContent = msg
  const x = document.createElement('button')
  x.textContent = '×'
  x.className = 'song-notice-close'
  x.addEventListener('click', () => div.remove())
  div.append(span, x)
  _container.insertBefore(div, _container.firstChild)
  window.setTimeout(() => div.remove(), 5000)
}

/** Applies a destructive change at once and offers Undo back to the song before it. */
function applyWithUndo(next: Song, message: string) {
  const before = _song
  _song = next
  saveSong(_song)
  _handlers?.onSongChange(_song)
  showUndo(message, () => {
    _song = before
    saveSong(before)
    _handlers?.onSongChange(before)
  })
}

/** Removes a chord from the song, with Undo. */
export function removeChordWithUndo(chordId: string) {
  const chord = _song.sections.flatMap(s => s.measures.flatMap(m => m.chords)).find(c => c.id === chordId)
  if (chord) applyWithUndo(removeChord(_song, chordId), t('chord.removed', { chord: chord.symbol ? chordLabel(chord.symbol) : t('chord.generic') }))
}

export function mountSong(container: HTMLElement, song: Song, handlers: SongEventHandlers) {
  // Another song opened (or a new one): the one playing stops
  if (song.id !== _song.id && isSongPlaying()) stopSong()
  _song = song
  _handlers = handlers
  _container = container
  rerender()
}

/** Moves the cursor highlight without rebuilding the DOM. */
export function markActiveChord(chordId: string | null) {
  _container?.querySelectorAll<HTMLElement>('.chord-chip').forEach(el => {
    el.classList.toggle('active-cursor', el.dataset.chordId === chordId)
  })
  const section = sectionOf(chordId)
  _container?.querySelectorAll<HTMLElement>('.strip-block').forEach(b => b.classList.toggle('in-play', b.dataset.sectionId === section))
}

function rerender() {
  if (!_container || !_handlers) return
  // Its own menus go with the DOM rebuilt; another panel's open menu (the key's, the input's) stays open
  if ([..._container.querySelectorAll<HTMLElement>('.pop-menu.open')].some(isPopoverOpen)) closePopover()
  _container.innerHTML = ''
  _container.appendChild(buildSongDOM(_song, _handlers))
  markPlaying(_playing)
}

// ─── Playing the song ────────────────────────────────────────────────────────

let _playing: SongStep | null = null

/** The chord sounding, outlined in the chart and kept in view; its section marked in the form strip. */
function markPlaying(step: SongStep | null) {
  _playing = step
  if (!_container) return
  _container.querySelectorAll<HTMLElement>('.chord-chip').forEach(c => c.classList.toggle('playing', !!step && c.dataset.chordId === step.chordId))
  if (step) _container.querySelectorAll<HTMLElement>('.strip-block').forEach(b => b.classList.toggle('in-play', b.dataset.sectionId === step.sectionId))
  _container.querySelector<HTMLElement>('.chord-chip.playing')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  const btn = _container.querySelector<HTMLButtonElement>('.song-play')
  if (btn) {
    const on = isSongPlaying()
    btn.textContent = on ? '■' : '▶'
    btn.title = t(on ? 'song.stop.title' : 'song.play.title')
    btn.setAttribute('aria-label', t(on ? 'song.stop' : 'song.play'))
  }
}

/** ▶: the song from the chord selected, or from the top; each chord sounds as long as it lasts. */
function playFromCursor(h: SongEventHandlers) {
  playSchedule(songSchedule(_song, h.activeCursorId), songTempo(_song), {
    step: (s, previous, seconds) => {
      if (s.symbol) playNoteNames(s.notes?.length ? s.notes : chordNoteNames(s.symbol), seconds)
      markPlaying(s)
      h.onPlayStep(s, previous)
    },
    end: () => markPlaying(null),
  })
  markPlaying(_playing)
}

// Sections written as text instead of chips, while the song is open (not stored)
const _textSections = new Set<string>()

// A new section is named in the interface language; the name is the user's from then on
const TEMPLATES: { label: StringKey; name: StringKey; color: SectionColor }[] = [
  { label: 'section.intro', name: 'section.intro', color: 'intro' },
  { label: 'section.verse', name: 'section.verse', color: 'verse' },
  { label: 'section.pre', name: 'section.prechorus', color: 'prechorus' },
  { label: 'section.chorus', name: 'section.chorus', color: 'chorus' },
  { label: 'section.bridge', name: 'section.bridge', color: 'bridge' },
  { label: 'section.outro', name: 'section.outro', color: 'outro' },
]

const FUNCTION_BORDER: Record<string, string> = { T: 'var(--fn-t)', S: 'var(--fn-s)', D: 'var(--fn-d)' }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

function commit(song: Song) {
  _song = song
  saveSong(_song)
  _handlers?.onSongChange(_song)
}

// The song's head: its name (the list of songs beside it), what it is (key, bars, form), and
// three ways in: + Section, Paste chords and ⋯ (new song, transpose, export, delete)
function buildSongDOM(song: Song, h: SongEventHandlers): HTMLElement {
  const root = el('div', 'song-root')
  const header = el('div', 'song-header')

  const titleInput = el('input', 'song-title-input')
  titleInput.value = song.title
  titleInput.setAttribute('aria-label', t('song.saved.title'))
  titleInput.addEventListener('blur', () => {
    if (titleInput.value === _song.title) return
    _song = { ..._song, title: titleInput.value }
    h.onSongChange(_song)
  })
  titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') titleInput.blur() })

  // The songs as tabs, in the order they were made; the open one may not be saved yet.
  // A double click renames (the name in the head), + starts a new song
  const tabs = el('div', 'song-tabs')
  tabs.setAttribute('role', 'tablist')
  tabs.setAttribute('aria-label', t('song.list'))
  const metas = h.songs.some(m => m.id === song.id) ? h.songs : [...h.songs, { id: song.id, title: song.title, updatedAt: song.updatedAt }]
  for (const m of metas) {
    const tab = el('button', 'song-tab', (m.id === song.id ? song.title : m.title) || t('song.untitled'))
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-selected', String(m.id === song.id))
    tab.dataset.songId = m.id
    tab.addEventListener('click', () => { if (m.id !== _song.id) h.onOpenSong(m.id) })
    tab.addEventListener('dblclick', () => { titleInput.focus(); titleInput.select() })
    tabs.appendChild(tab)
  }
  const newTab = el('button', 'song-tab song-tab-new', '+')
  newTab.title = t('song.new.title')
  newTab.setAttribute('aria-label', t('song.newSong'))
  newTab.addEventListener('click', () => { if (!isBlankSong(_song)) h.onNewSong() })
  tabs.appendChild(newTab)
  root.appendChild(tabs)
  requestAnimationFrame(() => tabs.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))

  const bars = song.sections.reduce((n, s) => n + s.measures.length * Math.max(1, s.repeatCount), 0)
  const summary = el('span', 'song-form-info')
  summary.textContent = song.sections.length ? [
    h.activeKey ? `${keyLabel(h.activeKey)}${h.keyIsAuto ? ` · ${t('song.auto')}` : ''}` : '',
    t('song.bars', { n: bars }),
    detectForm(song.sections.map(s => s.name)),
  ].filter(Boolean).join(' · ') : ''

  // + Section: the templates, as named rows with their colour
  const addAnchor = el('div', 'pop-anchor pop-end')
  const addBtn = el('button', 'song-btn', t('song.addSection'))
  const addMenu = buildSectionMenu(h)
  addAnchor.append(addBtn, addMenu)

  const pasteBtn = el('button', 'song-btn', t('song.paste'))
  pasteBtn.title = t('song.paste.title')

  const moreAnchor = el('div', 'pop-anchor pop-end')
  const moreBtn = el('button', 'song-more-btn', '⋯')
  moreBtn.title = t('song.more')
  moreBtn.setAttribute('aria-label', t('song.more'))
  const moreMenu = el('div', 'view-menu pop-menu song-menu')
  moreMenu.innerHTML = `
    <button class="choice-row" data-act="new" title="${escapeHtml(t('song.new.title'))}">${escapeHtml(t('song.newSong'))}</button>
    <div class="view-menu-title">${escapeHtml(t('song.transposeBy'))}</div>
    <div class="menu-chips">${Array.from({ length: 11 }, (_, i) =>
      `<button class="menu-chip" data-transpose="${i + 1}" title="${escapeHtml(t('song.transpose.title'))}">${escapeHtml(t('song.transpose.step', { n: i + 1 }))}</button>`).join('')}</div>
    <button class="choice-row" data-act="export" title="${escapeHtml(t('song.export.title'))}">${escapeHtml(t('song.export'))}</button>
    <button class="choice-row song-danger" data-act="delete" title="${escapeHtml(t('song.delete.title'))}">${escapeHtml(t('song.delete'))}</button>`
  moreMenu.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!b) return
    closePopover()
    const n = Number(b.dataset.transpose)
    if (n) commit(transposeSong(_song, n, h.activeKey ? transposeKey(h.activeKey, n) : undefined))
    else if (b.dataset.act === 'new') { if (!isBlankSong(_song)) h.onNewSong() }
    else if (b.dataset.act === 'delete') h.onDeleteSong()
    else if (b.dataset.act === 'export') {
      const printWin = window.open('', '_blank')
      if (!printWin) { showNotice(t('song.popupBlocked'), 'warn'); return }
      printWin.document.write(buildPrintHTML(_song, h.activeKey))
      printWin.document.close()
      printWin.print()
    }
  })
  moreAnchor.append(moreBtn, moreMenu)
  wirePopover(moreMenu, [moreBtn])

  // ▶ / ■, and the tempo and bar it plays at, edited in a small menu
  const playBtn = el('button', 'song-btn song-play', '▶')
  playBtn.disabled = !song.sections.some(s => s.measures.length)
  playBtn.addEventListener('click', () => { if (isSongPlaying()) stopSong(); else playFromCursor(h) })

  const tempoAnchor = el('div', 'pop-anchor pop-end')
  const tempoBtn = el('button', 'song-btn song-tempo', `♩ ${songTempo(song)} · ${songBeats(song)}/4`)
  tempoBtn.title = t('song.tempo.title')
  const tempoMenu = el('div', 'view-menu pop-menu song-menu')
  const numberRow = (field: 'tempo' | 'beats', label: string, value: number, [min, max]: readonly [number, number], unit: string) =>
    `<label class="song-tempo-row">${escapeHtml(label)}<input type="number" class="song-tempo-input" data-field="${field}" min="${min}" max="${max}" step="1" value="${value}">${escapeHtml(unit)}</label>`
  tempoMenu.innerHTML = numberRow('tempo', t('song.tempo'), songTempo(song), TEMPO_RANGE, 'bpm') +
    numberRow('beats', t('song.beats'), songBeats(song), BEATS_RANGE, '/4')
  tempoMenu.querySelectorAll<HTMLInputElement>('input').forEach(input => input.addEventListener('change', () => {
    const [min, max] = input.dataset.field === 'tempo' ? TEMPO_RANGE : BEATS_RANGE
    const v = Math.round(Number(input.value))
    if (!Number.isFinite(v)) return
    const n = Math.min(max, Math.max(min, v))
    commit(input.dataset.field === 'tempo' ? { ..._song, tempo: n } : { ..._song, beatsPerBar: n })
  }))
  tempoAnchor.append(tempoBtn, tempoMenu)
  wirePopover(tempoMenu, [tempoBtn])

  const titleWrap = el('div', 'song-title-wrap')
  titleWrap.append(titleInput)
  header.append(titleWrap, summary, el('span', 'song-gap'), playBtn, tempoAnchor, addAnchor, pasteBtn, moreAnchor)
  root.appendChild(header)

  // Paste: a line of chords as text, added to the last section
  const pasteArea = el('div', 'paste-area')
  pasteArea.hidden = true
  const pasteTA = el('textarea', 'paste-textarea')
  pasteTA.placeholder = t('song.paste.placeholder')
  pasteTA.rows = 2
  const pasteSubmit = el('button', 'song-btn song-btn-main', t('song.paste.add'))
  pasteSubmit.addEventListener('click', () => {
    const text = pasteTA.value.trim()
    if (!text) return
    // Chords may be written in Do Re Mi: stored in letters
    const measures = parseProgressionMeasures(text).map(m => m.map(readTypedChord))
    if (!measures.length) return
    if (!_song.sections.length) _song = addSection(_song, t('section.default'), 'verse')
    const section = _song.sections[_song.sections.length - 1]
    commit(appendProgression(_song, section.id, measures))
  })
  pasteArea.append(pasteTA, pasteSubmit)
  pasteBtn.addEventListener('click', () => {
    pasteArea.hidden = !pasteArea.hidden
    if (!pasteArea.hidden) pasteTA.focus()
  })
  root.appendChild(pasteArea)

  if (song.sections.length > 1) root.appendChild(buildFormStrip(song, h))
  if (!song.sections.length) root.appendChild(el('p', 'song-empty', t('song.empty')))

  const measureNums = computeMeasureNumbers(song)
  song.sections.forEach(section => root.appendChild(buildSectionDOM(section, h, measureNums)))
  return root
}

function buildSectionMenu(h: SongEventHandlers): HTMLElement {
  const menu = el('div', 'view-menu pop-menu song-menu')
  for (const tpl of TEMPLATES) {
    const name = t(tpl.name)
    const b = el('button', 'choice-row')
    b.innerHTML = `<span class="section-dot" style="background:${SECTION_COLORS[tpl.color]}"></span>${escapeHtml(t(tpl.label))}`
    b.title = t('song.addSection.title', { name })
    b.addEventListener('click', () => { closePopover(); commit(addSection(_song, name, tpl.color)) })
    menu.appendChild(b)
  }
  queueMicrotask(() => {
    const trigger = menu.parentElement?.querySelector<HTMLElement>(':scope > button')
    if (trigger) wirePopover(menu, [trigger])
  })
  void h
  return menu
}

/** The section the chord is in. */
const sectionOf = (chordId: string | null) =>
  chordId ? _song.sections.find(s => s.measures.some(m => m.chords.some(c => c.id === chordId)))?.id ?? null : null

// The form above the chart: a block per section, as long as its bars; a click goes to it,
// dragging reorders, ×N is set on the block, + adds a section
function buildFormStrip(song: Song, h: SongEventHandlers): HTMLElement {
  const strip = el('div', 'song-strip')
  strip.setAttribute('role', 'list')
  strip.setAttribute('aria-label', t('song.strip'))
  strip.title = t('song.strip')
  const inPlay = sectionOf(h.captureTargetId ?? h.activeCursorId)
  for (const section of song.sections) {
    const bars = Math.max(1, section.measures.length) * Math.max(1, section.repeatCount)
    const block = el('div', 'strip-block')
    block.setAttribute('role', 'listitem')
    block.dataset.sectionId = section.id
    block.style.flexGrow = String(bars)
    block.style.borderTopColor = SECTION_COLORS[section.color]
    block.classList.toggle('in-play', section.id === inPlay)
    const go = el('button', 'strip-go')
    go.innerHTML = `<b>${escapeHtml(section.name || t('section.default'))}</b><span>${section.measures.length}${section.repeatCount > 1 ? ` ×${section.repeatCount}` : ''}</span>`
    go.addEventListener('click', () => {
      const target = _container?.querySelector<HTMLElement>(`.section-wrap[data-section-id="${section.id}"]`)
      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      target?.classList.add('section-flash')
      setTimeout(() => target?.classList.remove('section-flash'), 900)
    })
    block.append(go)
    // Dragging a block reorders the sections
    block.draggable = true
    block.addEventListener('dragstart', e => {
      _draggedSectionId = section.id
      _draggedChordId = null
      e.dataTransfer!.effectAllowed = 'move'
      requestAnimationFrame(() => block.classList.add('dragging'))
    })
    block.addEventListener('dragend', () => { _draggedSectionId = null; block.classList.remove('dragging') })
    block.addEventListener('dragover', e => {
      if (!_draggedSectionId || _draggedSectionId === section.id) return
      e.preventDefault()
      const r = block.getBoundingClientRect()
      block.classList.toggle('drop-before', e.clientX < r.left + r.width / 2)
      block.classList.toggle('drop-after', e.clientX >= r.left + r.width / 2)
    })
    block.addEventListener('dragleave', () => block.classList.remove('drop-before', 'drop-after'))
    block.addEventListener('drop', e => {
      if (!_draggedSectionId || _draggedSectionId === section.id) return
      e.preventDefault()
      const before = block.classList.contains('drop-before')
      block.classList.remove('drop-before', 'drop-after')
      const dragged = _draggedSectionId
      _draggedSectionId = null
      commit(reorderSections(_song, dragged, section.id, before))
    })
    strip.appendChild(block)
  }
  const addAnchor = el('div', 'pop-anchor pop-end')
  const add = el('button', 'strip-add', '+')
  add.title = t('song.strip.add')
  add.setAttribute('aria-label', t('song.strip.add'))
  addAnchor.append(add, buildSectionMenu(h))
  strip.appendChild(addAnchor)
  return strip
}

/** ×N: a click turns it into a field; Enter keeps it, Esc leaves it. */
function repeatControl(section: Section): HTMLElement {
  const badge = el('button', 'section-repeat-badge', `×${section.repeatCount}`)
  badge.title = t('section.repeat.title')
  badge.addEventListener('click', e => {
    e.stopPropagation()
    const input = el('input', 'section-repeat-input')
    input.type = 'number'; input.min = '1'; input.max = '16'
    input.value = String(section.repeatCount)
    badge.replaceWith(input)
    input.focus(); input.select()
    let done = false
    const keep = () => {
      if (done) return
      done = true
      const n = parseInt(input.value)
      if (n >= 1 && n <= 16 && n !== section.repeatCount) commit(updateSection(_song, section.id, { repeatCount: n }))
      else _handlers?.onSongChange(_song)
    }
    input.addEventListener('blur', keep)
    input.addEventListener('keydown', ke => {
      if (ke.key === 'Enter') input.blur()
      if (ke.key === 'Escape') { input.value = String(section.repeatCount); input.blur() }
    })
  })
  return badge
}

// A section: its name and controls in a margin on the left, its bars as a chord chart
function buildSectionDOM(section: Section, h: SongEventHandlers, measureNums: Map<string, number>): HTMLElement {
  const color = SECTION_COLORS[section.color]
  const wrap = el('div', 'section-wrap')
  wrap.dataset.sectionId = section.id

  const side = el('div', 'section-header')
  side.style.borderLeftColor = color

  const nameRow = el('div', 'section-name-row')
  const toggle = el('button', 'section-toggle', section.collapsed ? '▸' : '▾')
  toggle.title = t('section.collapse.title')
  toggle.addEventListener('click', () => commit(updateSection(_song, section.id, { collapsed: !section.collapsed })))
  const nameInput = el('input', 'section-name-input')
  nameInput.value = section.name
  nameInput.setAttribute('aria-label', t('section.default'))
  nameInput.addEventListener('blur', () => {
    if (nameInput.value !== section.name) commit(updateSection(_song, section.id, { name: nameInput.value }))
  })
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameInput.blur() })
  nameRow.append(toggle, nameInput)

  // Its tools, quiet until the section is pointed at: colour, ×N, duplicate, delete
  const tools = el('div', 'section-tools')
  const swatch = el('button', 'section-swatch')
  swatch.style.background = color
  swatch.title = t('section.color.title')
  swatch.setAttribute('aria-label', t('section.color.title'))
  swatch.addEventListener('click', e => { e.stopPropagation(); openColorPicker(swatch, section) })
  const dupBtn = makeSmallBtn('⧉', () => commit(duplicateSection(_song, section.id)))
  dupBtn.title = t('section.duplicate.title')
  const delBtn = makeSmallBtn('×', () => applyWithUndo(removeSection(_song, section.id), t('section.deleted', { name: section.name })))
  delBtn.title = t('section.delete.title')
  delBtn.classList.add('song-danger')
  tools.append(swatch, repeatControl(section), dupBtn, delBtn)

  // Chips or text: how the section is written
  const textMode = _textSections.has(section.id)
  const mode = el('div', 'section-write')
  mode.setAttribute('role', 'group')
  mode.setAttribute('aria-label', t('section.write'))
  for (const [m, label] of [['chips', t('section.chips')], ['text', t('section.text')]] as const) {
    const b = el('button', 'section-write-btn', label)
    b.setAttribute('aria-pressed', String((m === 'text') === textMode))
    b.addEventListener('click', () => {
      if (m === 'text') _textSections.add(section.id); else _textSections.delete(section.id)
      rerender()
      if (m === 'text') _container?.querySelector<HTMLInputElement>(`.section-wrap[data-section-id="${section.id}"] .section-text-input`)?.focus()
    })
    mode.appendChild(b)
  }
  side.append(nameRow, tools, mode)
  wrap.appendChild(side)

  const body = el('div', 'section-body')
  if (!section.collapsed) {
    if (textMode) body.appendChild(buildSectionText(section))
    else {
      const measuresWrap = el('div', 'measures-wrap')
      section.measures.forEach((measure, i) =>
        measuresWrap.appendChild(buildMeasureDOM(measure, section, h, measureNums.get(measure.id) ?? 0, i === section.measures.length - 1)))
      body.appendChild(measuresWrap)
      const addMeasureBtn = el('button', 'section-add-bar', t('section.addBar'))
      addMeasureBtn.title = t('section.addBar.title')
      addMeasureBtn.addEventListener('click', () => commit(addMeasure(_song, section.id)))
      body.appendChild(addMeasureBtn)
    }
  }
  wrap.appendChild(body)
  return wrap
}

function openColorPicker(anchor: HTMLElement, section: Section) {
  const PRESET_COLORS: SectionColor[] = ['intro', 'verse', 'prechorus', 'chorus', 'bridge', 'outro', 'custom']
  document.querySelector('.color-picker-popup')?.remove()
  const picker = el('div', 'color-picker-popup')
  PRESET_COLORS.forEach(c => {
    const dot = el('button', 'color-picker-dot')
    dot.title = t(`section.${c}`)
    dot.style.background = SECTION_COLORS[c]
    dot.style.borderColor = c === section.color ? 'var(--cursor)' : 'transparent'
    dot.addEventListener('click', ev => { ev.stopPropagation(); picker.remove(); commit(updateSection(_song, section.id, { color: c })) })
    picker.appendChild(dot)
  })
  const rect = anchor.getBoundingClientRect()
  picker.style.top = `${rect.bottom + 4}px`
  picker.style.left = `${rect.left}px`
  document.body.appendChild(picker)
  setTimeout(() => {
    const close = (ev: MouseEvent) => { if (!picker.contains(ev.target as Node)) { picker.remove(); document.removeEventListener('click', close) } }
    document.addEventListener('click', close)
  }, 0)
}

// A section as text: "Am F | C G", in the note names chosen; what is understood shows below
function buildSectionText(section: Section): HTMLElement {
  const box = el('div', 'section-text')
  const input = el('input', 'section-text-input')
  const original = sectionAsText(section, chordLabel)
  input.value = original
  input.spellcheck = false
  input.autocomplete = 'off'
  input.setAttribute('aria-label', t('section.text'))
  const hint = el('div', 'section-text-hint', t('section.text.hint'))
  const status = el('div', 'section-text-status')
  const read = () => {
    const measures = parseProgressionMeasures(input.value).map(m => m.map(readTypedChord))
    const bad = measures.flat().filter(s => !isKnownChord(s))
    return { measures, bad }
  }
  const show = () => {
    const { measures, bad } = read()
    status.classList.toggle('bad', bad.length > 0)
    status.textContent = bad.length
      ? t('section.text.bad', { names: bad.join(', ') })
      : input.value.trim() ? t('section.text.ok', { bars: measures.length, chords: measures.flat().length }) : ''
  }
  let left = false
  const keep = () => {
    if (left || input.value === original) return
    const { measures } = read()
    left = true
    commit(replaceSectionProgression(_song, section.id, measures))
  }
  input.addEventListener('input', show)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); keep() }
    if (e.key === 'Escape') { left = true; input.value = original; rerender() }
  })
  input.addEventListener('blur', keep)
  show()
  box.append(input, status, hint)
  return box
}

// A bar of the chart: its chords, then + (shown when pointed at); a thin bar line on its
// right, a double one on the section's last bar; its number small above
function buildMeasureDOM(measure: Measure, section: Section, h: SongEventHandlers, measureNum: number, last: boolean): HTMLElement {
  const wrap = el('div', 'measure-row')
  wrap.classList.toggle('measure-last', last)
  wrap.appendChild(el('span', 'measure-num', String(measureNum)))

  const chordsRow = el('div', 'chords-row')
  measure.chords.forEach(chord => chordsRow.appendChild(buildChordChip(chord, section, measure, h)))

  const addBtn = el('button', 'chord-add-btn', '+')
  addBtn.title = t('chord.add.title')
  addBtn.addEventListener('click', () => {
    _song = addChord(_song, section.id, measure.id, '')
    saveSong(_song); h.onSongChange(_song)
    setTimeout(() => {
      const inputs = _container?.querySelectorAll<HTMLInputElement>('.chord-input')
      inputs?.[inputs.length - 1]?.focus()
    }, 50)
  })
  chordsRow.appendChild(addBtn)

  // Drop zone: accepts history chip drags and chord drags from any bar
  chordsRow.addEventListener('dragover', e => {
    const hasHistory = e.dataTransfer!.types.includes('application/x-history-chord')
    if (!hasHistory && !_draggedChordId) return
    e.preventDefault()
    e.dataTransfer!.dropEffect = hasHistory ? 'copy' : 'move'
    chordsRow.classList.add('drop-target')
  })
  chordsRow.addEventListener('dragleave', e => {
    if (!chordsRow.contains(e.relatedTarget as Node)) {
      chordsRow.classList.remove('drop-target')
      _dropIndicator?.remove()
      _insertBeforeChordId = null
    }
  })
  chordsRow.addEventListener('drop', e => {
    chordsRow.classList.remove('drop-target')
    _dropIndicator?.remove()
    const histData = e.dataTransfer!.getData('application/x-history-chord')
    if (histData) {
      e.preventDefault()
      const { symbol, notes } = JSON.parse(histData)
      _song = addChord(_song, section.id, measure.id, symbol, notes, _insertBeforeChordId ?? undefined)
      _insertBeforeChordId = null
      saveSong(_song); h.onSongChange(_song)
    } else if (_draggedChordId) {
      e.preventDefault()
      e.stopPropagation()
      _song = moveChordToPosition(_song, _draggedChordId, section.id, measure.id, _insertBeforeChordId ?? undefined)
      _draggedChordId = null
      _insertBeforeChordId = null
      saveSong(_song); h.onSongChange(_song)
    }
  })
  wrap.appendChild(chordsRow)

  const sectionObj = _song.sections.find(s => s.id === section.id)
  if (sectionObj && sectionObj.measures.length > 1) {
    const delMBtn = makeSmallBtn('×', () => applyWithUndo(removeMeasure(_song, section.id, measure.id), t('measure.deleted', { n: measureNum })))
    delMBtn.title = t('measure.delete.title')
    delMBtn.classList.add('measure-del', 'song-danger')
    wrap.appendChild(delMBtn)
  }
  return wrap
}

function buildChordChip(chord: SongChord, section: Section, measure: Measure, h: SongEventHandlers): HTMLElement {
  const isActive = h.activeCursorId === chord.id
  const isCapture = h.captureTargetId === chord.id
  const degree = chord.valid && chord.symbol ? computeDegree(chord.symbol, h.activeKey) : '—'
  const borrowed = chord.valid && chord.symbol ? isBorrowedChord(chord.symbol, h.activeKey) : false
  const fn = chord.valid && chord.symbol ? romanInKey(chord.symbol, h.activeKey)?.function : undefined

  const wrap = document.createElement('div')
  wrap.className = 'chord-chip'
  wrap.dataset.chordId = chord.id
  wrap.classList.toggle('capture-target', isCapture)
  wrap.classList.toggle('active-cursor', isActive)
  wrap.classList.toggle('invalid', chord.valid === false)
  if (fn && FUNCTION_BORDER[fn]) wrap.style.borderLeftColor = FUNCTION_BORDER[fn]

  const isEditing = !chord.symbol
  if (isEditing) {
    const input = document.createElement('input')
    input.className = 'chord-input'
    input.placeholder = 'Am7'

    const prevValue = chord.symbol

    const confirmInput = () => {
      const val = readTypedChord(input.value)
      if (val) {
        _song = updateChord(_song, chord.id, val)
      } else {
        _song = removeChord(_song, chord.id)
      }
      saveSong(_song); h.onSongChange(_song)
    }

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); confirmInput() }
      if (e.key === 'Escape') {
        if (!prevValue) _song = removeChord(_song, chord.id)
        saveSong(_song); h.onSongChange(_song)
      }
      if (e.key === 'Backspace' && input.value === '') {
        _song = removeChord(_song, chord.id); saveSong(_song); h.onSongChange(_song)
      }
    })
    input.addEventListener('blur', confirmInput)
    wrap.appendChild(input)
    return wrap
  }

  const symbolEl = document.createElement('div')
  symbolEl.textContent = chordLabel(chord.symbol)
  symbolEl.className = 'chord-chip-symbol'
  if (!chord.valid) symbolEl.style.color = 'var(--danger)'

  const degreeEl = document.createElement('div')
  degreeEl.textContent = degree
  degreeEl.className = 'chord-chip-degree'
  if (borrowed) degreeEl.style.color = 'var(--warn)'

  wrap.appendChild(symbolEl)
  wrap.appendChild(degreeEl)

  const controls = document.createElement('div')
  controls.className = 'chord-chip-controls'

  const editBtn = makeSmallBtn('✎', () => {
    let notesState: string[] | undefined = chord.notes ? [...chord.notes] : undefined
    const prevVal = chord.symbol

    const editWrap = document.createElement('div')
    editWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;padding:2px'

    const input = document.createElement('input')
    input.className = 'chord-input'
    input.value = chord.symbol

    const commit = () => {
      const symbol = readTypedChord(input.value) || prevVal
      // A stored voicing belongs to the old symbol — drop it when the symbol changes.
      _song = updateChord(_song, chord.id, symbol, symbol === prevVal ? notesState : undefined)
      saveSong(_song); h.onSongChange(_song)
    }
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') commit()
      if (e.key === 'Escape') h.onSongChange(_song)
    })
    input.addEventListener('blur', commit)
    editWrap.appendChild(input)

    if (notesState?.length) {
      const notesRow = document.createElement('div')
      notesRow.style.cssText = 'display:flex;align-items:center;gap:3px;font-size:9px;color:var(--text-muted);white-space:nowrap;overflow:hidden'
      const notesText = document.createElement('span')
      notesText.textContent = '♩ ' + notesState.join(' ')
      notesText.style.overflow = 'hidden'
      notesText.style.textOverflow = 'ellipsis'
      const clearBtn = document.createElement('button')
      clearBtn.textContent = '×'
      clearBtn.title = t('chord.clearVoicing.title')
      clearBtn.style.cssText = 'background:none;border:none;color:var(--text-dim);cursor:pointer;padding:0 2px;font-size:10px;flex-shrink:0'
      clearBtn.addEventListener('mousedown', e => {
        e.preventDefault()
        notesState = undefined
        notesRow.remove()
      })
      notesRow.append(notesText, clearBtn)
      editWrap.appendChild(notesRow)
    }

    wrap.innerHTML = ''
    wrap.appendChild(editWrap)
    input.focus()
  })
  editBtn.title = t('chord.edit.title')
  const dupBtn = makeSmallBtn('⧉', () => { _song = duplicateChord(_song, chord.id); saveSong(_song); h.onSongChange(_song) })
  dupBtn.title = t('chord.duplicate.title')
  const delBtn = makeSmallBtn('×', () => removeChordWithUndo(chord.id))
  delBtn.title = t('chord.remove.title')
  const captureBtn = makeSmallBtn('⊙', () => h.onChordCapture(chord.id))
  captureBtn.title = t('chord.capture.title')
  if (isCapture) { captureBtn.style.color = 'var(--accent-text)'; captureBtn.style.fontWeight = '700' }

  controls.append(editBtn, dupBtn, captureBtn, delBtn)
  wrap.appendChild(controls)

  wrap.addEventListener('mouseenter', () => controls.style.display = 'flex')
  wrap.addEventListener('mouseleave', () => controls.style.display = 'none')

  makeActivatable(wrap)
  wrap.addEventListener('focus', () => controls.style.display = 'flex')
  // No hover on a touch screen: a tap shows the buttons, leaving the chip hides them
  wrap.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') controls.style.display = 'flex' })
  wrap.addEventListener('focusout', e => { if (!wrap.contains(e.relatedTarget as Node | null)) controls.style.display = 'none' })
  wrap.addEventListener('click', () => {
    h.onChordClick(chord.id, chord.symbol, chord.notes)
    if (chord.notes?.length) playNoteNames(chord.notes)
    else playChord(chord.symbol)
  })

  // Chord drag & drop within measure
  wrap.draggable = true
  wrap.addEventListener('dragstart', e => {
    e.stopPropagation()
    _draggedChordId = chord.id
    _draggedSectionId = null
    e.dataTransfer!.effectAllowed = 'move'
    controls.style.display = 'none'
    requestAnimationFrame(() => { wrap.style.opacity = '0.2' })
  })
  wrap.addEventListener('dragend', () => {
    _draggedChordId = null
    wrap.style.opacity = '1'
    controls.style.display = 'none'
    _dropIndicator?.remove()
    _insertBeforeChordId = null
  })
  wrap.addEventListener('dragover', e => {
    const isHistory = e.dataTransfer!.types.includes('application/x-history-chord')
    if (!isHistory && (!_draggedChordId || _draggedChordId === chord.id)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer!.dropEffect = isHistory ? 'copy' : 'move'
    if (!_dropIndicator) {
      _dropIndicator = document.createElement('div')
      _dropIndicator.className = 'chord-drop-indicator'
    }
    const rect = wrap.getBoundingClientRect()
    const before = e.clientX < rect.left + rect.width / 2
    if (before) {
      _insertBeforeChordId = chord.id
      wrap.parentNode!.insertBefore(_dropIndicator, wrap)
    } else {
      const targetMeasure = _song.sections.find(s => s.id === section.id)?.measures.find(m => m.id === measure.id)
      const chordIdx = targetMeasure?.chords.findIndex(c => c.id === chord.id) ?? -1
      _insertBeforeChordId = targetMeasure?.chords[chordIdx + 1]?.id ?? null
      wrap.parentNode!.insertBefore(_dropIndicator, wrap.nextSibling)
    }
  })
  wrap.addEventListener('drop', e => {
    // History chips are not song-chord drags: let the drop bubble to the measure row.
    if (!_draggedChordId) return
    e.preventDefault()
    e.stopPropagation()
    if (_draggedChordId === chord.id) return
    _dropIndicator?.remove()
    _song = moveChordToPosition(_song, _draggedChordId, section.id, measure.id, _insertBeforeChordId ?? undefined)
    _draggedChordId = null
    _insertBeforeChordId = null
    saveSong(_song); h.onSongChange(_song)
  })

  return wrap
}

function makeSmallBtn(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.textContent = label
  btn.className = 'song-btn-small'
  btn.addEventListener('click', e => { e.stopPropagation(); onClick() })
  return btn
}

function buildPrintHTML(song: Song, activeKey: string | null): string {
  const measureNums = computeMeasureNumbers(song)
  let html = `<html><head><style>
    body{font-family:sans-serif;padding:24px} h1{margin-bottom:4px} .key{color:#555;margin-bottom:16px}
    .section{margin-bottom:20px} .section-name{font-weight:700;font-size:14px;border-bottom:2px solid #333;margin-bottom:8px;padding-bottom:4px}
    .measures{display:flex;flex-wrap:wrap;gap:8px} .measure{border:1px solid #ccc;border-radius:4px;padding:6px 8px;min-width:80px}
    .bar-num{font-size:10px;color:#999;margin-bottom:4px} .chord{font-size:13px;font-weight:600} .degree{font-size:10px;color:#666}
  </style></head><body>
    <h1>${escapeHtml(song.title)}</h1>
    <div class="key">${activeKey ? escapeHtml(t('song.key', { key: keyLabel(activeKey) })) : ''}</div>`
  for (const section of song.sections) {
    html += `<div class="section"><div class="section-name">${escapeHtml(section.name)}${section.repeatCount > 1 ? ` ×${section.repeatCount}` : ''}</div><div class="measures">`
    for (const measure of section.measures) {
      const num = measureNums.get(measure.id) ?? ''
      html += `<div class="measure"><div class="bar-num">${num}</div>`
      for (const chord of measure.chords) {
        const degree = activeKey ? computeDegree(chord.symbol, activeKey) : '—'
        html += `<div class="chord">${escapeHtml(chordLabel(chord.symbol))}</div><div class="degree">${degree}</div>`
      }
      html += '</div>'
    }
    html += '</div></div>'
  }
  html += '</body></html>'
  return html
}

