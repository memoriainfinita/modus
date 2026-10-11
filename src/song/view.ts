import type { Song, Section, Measure, SongChord, SectionColor } from '../types'
import { playChord, playNoteNames } from '../audio/audio'
import {
  createSong, isBlankSong, addSection, removeSection, updateSection, duplicateSection,
  addMeasure, removeMeasure, addChord, updateChord, removeChord, duplicateChord,
  moveChordToPosition, reorderSections, computeMeasureNumbers, parseProgressionMeasures, appendProgression,
  computeDegree, isBorrowedChord, transposeSong, transposeKey, detectForm,
} from './model'
import { saveSong, type SongMeta } from './library'
import { escapeHtml } from '../ui/html'
import { showUndo } from '../ui/undo'
import { readTypedChord } from '../theory/chord'
import { t, chordLabel, keyLabel } from '../i18n/i18n'
import type { StringKey } from '../i18n/en'

// ─── Song UI ─────────────────────────────────────────────────────────────────

const SECTION_COLORS: Record<SectionColor, string> = {
  intro: 'var(--section-intro)', verse: 'var(--section-verse)', prechorus: 'var(--section-prechorus)',
  chorus: 'var(--section-chorus)', bridge: 'var(--section-bridge)', outro: 'var(--section-outro)', custom: 'var(--section-custom)'
}
const NEUTRAL_BTN = 'var(--btn-neutral)'

type SongEventHandlers = {
  onChordClick: (chordId: string, symbol: string, notes?: string[]) => void
  onChordCapture: (chordId: string) => void
  activeCursorId: string | null
  captureTargetId: string | null
  activeKey: string | null
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
}

function rerender() {
  if (!_container || !_handlers) return
  _container.innerHTML = ''
  _container.appendChild(buildSongDOM(_song, _handlers))
}

function buildSongDOM(song: Song, h: SongEventHandlers): HTMLElement {
  const root = document.createElement('div')
  root.className = 'song-root'

  const header = document.createElement('div')
  header.className = 'song-header'

  const titleInput = document.createElement('input')
  titleInput.value = song.title
  titleInput.className = 'song-title-input'
  titleInput.addEventListener('blur', () => {
    _song = { ..._song, title: titleInput.value }
    h.onSongChange(_song)
  })

  // Saved songs, most recently changed first; the open one may not be saved yet
  const songSelect = document.createElement('select')
  songSelect.className = 'transpose-select song-select'
  songSelect.title = t('song.saved.title')
  const metas = h.songs.some(m => m.id === song.id) ? h.songs : [{ id: song.id, title: song.title, updatedAt: song.updatedAt }, ...h.songs]
  songSelect.innerHTML = metas.map(m =>
    `<option value="${escapeHtml(m.id)}">${escapeHtml(m.id === song.id ? song.title : m.title) || escapeHtml(t('song.untitled'))}</option>`).join('')
  songSelect.value = song.id
  songSelect.addEventListener('change', () => h.onOpenSong(songSelect.value))

  const newBtn = makeBtn(t('song.new'), NEUTRAL_BTN, () => {
    if (isBlankSong(_song)) return   // already on an empty song
    h.onNewSong()
  })
  newBtn.title = t('song.new.title')

  const deleteBtn = makeBtn(t('song.delete'), NEUTRAL_BTN, () => h.onDeleteSong())
  deleteBtn.title = t('song.delete.title')

  // Inline paste area
  const pasteArea = document.createElement('div')
  pasteArea.className = 'paste-area'
  pasteArea.style.display = 'none'
  const pasteTA = document.createElement('textarea')
  pasteTA.placeholder = t('song.paste.placeholder')
  pasteTA.rows = 2
  pasteTA.className = 'paste-textarea'
  const pasteSubmit = makeBtn(t('song.paste.add'), 'var(--accent)', () => {
    const text = pasteTA.value.trim()
    if (!text) return
    // Chords may be written in Do Re Mi: stored in letters
    const measures = parseProgressionMeasures(text).map(m => m.map(readTypedChord))
    if (!measures.length) return
    if (!_song.sections.length) { _song = addSection(_song, t('section.default'), 'verse') }
    const section = _song.sections[_song.sections.length - 1]
    _song = appendProgression(_song, section.id, measures)
    pasteTA.value = ''
    pasteArea.style.display = 'none'
    saveSong(_song); h.onSongChange(_song)
  })
  pasteArea.append(pasteTA, pasteSubmit)

  // A new section is named in the interface language; the name is the user's from then on
  const templates: { label: StringKey; name: StringKey; color: SectionColor }[] = [
    { label: 'section.intro', name: 'section.intro', color: 'intro' },
    { label: 'section.verse', name: 'section.verse', color: 'verse' },
    { label: 'section.pre', name: 'section.prechorus', color: 'prechorus' },
    { label: 'section.chorus', name: 'section.chorus', color: 'chorus' },
    { label: 'section.bridge', name: 'section.bridge', color: 'bridge' },
    { label: 'section.outro', name: 'section.outro', color: 'outro' },
  ]
  const templateWrap = document.createElement('div')
  templateWrap.className = 'template-wrap'
  templates.forEach(tpl => {
    const name = t(tpl.name)
    const btn = makeBtn(`+ ${t(tpl.label)}`, SECTION_COLORS[tpl.color], () => {
      _song = addSection(_song, name, tpl.color); saveSong(_song); h.onSongChange(_song)
    })
    btn.style.fontSize = '11px'
    btn.title = t('song.addSection.title', { name })
    templateWrap.appendChild(btn)
  })

  const transposeSelect = document.createElement('select')
  transposeSelect.title = t('song.transpose.title')
  transposeSelect.className = 'transpose-select'
  transposeSelect.innerHTML = `<option value="">${t('song.transpose')}</option>` +
    Array.from({length:11},(_,i)=>`<option value="${i+1}">${t('song.transpose.step', { n: i + 1 })}</option>`).join('')
  transposeSelect.addEventListener('change', () => {
    const n = parseInt(transposeSelect.value)
    if (n) {
      const targetKey = h.activeKey ? transposeKey(h.activeKey, n) : undefined
      _song = transposeSong(_song, n, targetKey); saveSong(_song); h.onSongChange(_song)
    }
    transposeSelect.value = ''
  })

  const exportBtn = makeBtn(t('song.export'), NEUTRAL_BTN, () => {
    const printWin = window.open('', '_blank')
    if (!printWin) { showNotice(t('song.popupBlocked'), 'warn'); return }
    printWin.document.write(buildPrintHTML(_song, h.activeKey))
    printWin.document.close()
    printWin.print()
  })
  exportBtn.title = t('song.export.title')

  const pasteBtn = makeBtn(t('song.paste'), NEUTRAL_BTN, () => {
    const open = pasteArea.style.display === 'none'
    pasteArea.style.display = open ? 'block' : 'none'
    if (open) pasteTA.focus()
  })
  pasteBtn.title = t('song.paste.title')

  header.append(songSelect, titleInput, newBtn, deleteBtn, templateWrap, transposeSelect, exportBtn, pasteBtn)
  root.appendChild(header)
  root.appendChild(pasteArea)

  // Inline real-time form + key summary
  const formInfo = document.createElement('div')
  formInfo.className = 'song-form-info'
  const form = detectForm(_song.sections.map(s => s.name))
  const keyStr = h.activeKey ? ` · ${t('song.key', { key: keyLabel(h.activeKey) })}` : ''
  formInfo.textContent = _song.sections.length ? t('song.form', { form }) + keyStr : ''
  root.appendChild(formInfo)

  const measureNums = computeMeasureNumbers(song)

  song.sections.forEach(section => {
    root.appendChild(buildSectionDOM(section, h, measureNums))
  })

  return root
}

function buildSectionDOM(
  section: Section,
  h: SongEventHandlers,
  measureNums: Map<string, number>
): HTMLElement {
  const color = SECTION_COLORS[section.color]
  const wrap = document.createElement('div')
  wrap.className = 'section-wrap'
  wrap.style.borderLeft = `3px solid ${color}`

  const secHeader = document.createElement('div')
  secHeader.className = 'section-header'

  const toggle = document.createElement('span')
  toggle.textContent = section.collapsed ? '▶' : '▼'
  toggle.className = 'section-toggle'
  toggle.addEventListener('click', () => {
    _song = updateSection(_song, section.id, { collapsed: !section.collapsed })
    saveSong(_song); h.onSongChange(_song)
  })

  const nameInput = document.createElement('input')
  nameInput.value = section.name
  nameInput.className = 'section-name-input'
  nameInput.style.color = color
  nameInput.addEventListener('focus', () => nameInput.style.borderBottomColor = color)
  nameInput.addEventListener('blur', () => {
    nameInput.style.borderBottomColor = 'transparent'
    _song = updateSection(_song, section.id, { name: nameInput.value })
    saveSong(_song); h.onSongChange(_song)
  })

  // Colour swatch — inline picker
  const PRESET_COLORS: SectionColor[] = ['intro','verse','prechorus','chorus','bridge','outro','custom']
  const swatchEl = document.createElement('button')
  swatchEl.className = 'section-swatch'
  swatchEl.style.background = color
  swatchEl.title = t('section.color.title')
  swatchEl.addEventListener('click', (e) => {
    e.stopPropagation()
    document.querySelector('.color-picker-popup')?.remove()
    const picker = document.createElement('div')
    picker.className = 'color-picker-popup'
    PRESET_COLORS.forEach(c => {
      const dot = document.createElement('button')
      dot.title = t(`section.${c}`)
      dot.className = 'color-picker-dot'
      dot.style.background = SECTION_COLORS[c]
      dot.style.borderColor = c === section.color ? 'var(--cursor)' : 'transparent'
      dot.addEventListener('click', (ev) => {
        ev.stopPropagation()
        picker.remove()
        _song = updateSection(_song, section.id, { color: c })
        saveSong(_song); h.onSongChange(_song)
      })
      picker.appendChild(dot)
    })
    const rect = swatchEl.getBoundingClientRect()
    picker.style.top = `${rect.bottom + 4}px`
    picker.style.left = `${rect.left}px`
    document.body.appendChild(picker)
    setTimeout(() => {
      const close = (ev: MouseEvent) => { if (!picker.contains(ev.target as Node)) { picker.remove(); document.removeEventListener('click', close) } }
      document.addEventListener('click', close)
    }, 0)
  })

  // Repeat count badge — click to edit inline
  const repeatBadge = document.createElement('span')
  repeatBadge.textContent = `×${section.repeatCount}`
  repeatBadge.title = t('section.repeat.title')
  repeatBadge.className = 'section-repeat-badge'
  repeatBadge.addEventListener('click', (e) => {
    e.stopPropagation()
    const input = document.createElement('input')
    input.type = 'number'; input.min = '1'; input.max = '16'
    input.value = String(section.repeatCount)
    input.className = 'section-repeat-input'
    repeatBadge.replaceWith(input)
    input.focus(); input.select()
    const commit = () => {
      const n = parseInt(input.value)
      if (n >= 1 && n <= 16) { _song = updateSection(_song, section.id, { repeatCount: n }); saveSong(_song) }
      h.onSongChange(_song)
    }
    input.addEventListener('blur', commit)
    input.addEventListener('keydown', (ke) => { if (ke.key === 'Enter') input.blur(); if (ke.key === 'Escape') { input.value = String(section.repeatCount); input.blur() } })
  })

  const dragHandle = document.createElement('span')
  dragHandle.textContent = '⠿'
  dragHandle.title = t('section.drag.title')
  dragHandle.className = 'section-drag-handle'

  const dupBtn = makeSmallBtn('⧉', () => { _song = duplicateSection(_song, section.id); saveSong(_song); h.onSongChange(_song) })
  dupBtn.title = t('section.duplicate.title')
  const delBtn = makeSmallBtn('×', () => {
    applyWithUndo(removeSection(_song, section.id), t('section.deleted', { name: section.name }))
  })
  delBtn.style.color = 'var(--danger-soft)'
  delBtn.title = t('section.delete.title')

  secHeader.append(dragHandle, toggle, nameInput, swatchEl, repeatBadge, dupBtn, delBtn)

  const addMeasureBtn = makeSmallBtn(t('section.addBar'), () => {
    _song = addMeasure(_song, section.id); saveSong(_song); h.onSongChange(_song)
  })
  addMeasureBtn.title = t('section.addBar.title')
  secHeader.appendChild(addMeasureBtn)

  wrap.appendChild(secHeader)

  // Section drag & drop — header is drag source, wrap is drop target
  secHeader.draggable = true
  secHeader.style.cursor = 'grab'
  secHeader.addEventListener('dragstart', e => {
    _draggedSectionId = section.id
    _draggedChordId = null
    e.dataTransfer!.effectAllowed = 'move'
    requestAnimationFrame(() => { wrap.style.opacity = '0.5' })
  })
  secHeader.addEventListener('dragend', () => {
    _draggedSectionId = null
    wrap.style.opacity = '1'
    wrap.style.borderTop = ''
    wrap.style.borderBottom = ''
  })
  wrap.addEventListener('dragover', e => {
    if (!_draggedSectionId || _draggedSectionId === section.id) return
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'move'
    const rect = wrap.getBoundingClientRect()
    const before = e.clientY < rect.top + rect.height / 2
    wrap.style.borderTop = before ? '2px solid var(--accent)' : ''
    wrap.style.borderBottom = !before ? '2px solid var(--accent)' : ''
  })
  wrap.addEventListener('dragleave', e => {
    if (!wrap.contains(e.relatedTarget as Node)) {
      wrap.style.borderTop = ''
      wrap.style.borderBottom = ''
    }
  })
  wrap.addEventListener('drop', e => {
    if (!_draggedSectionId || _draggedSectionId === section.id) return
    e.preventDefault()
    const rect = wrap.getBoundingClientRect()
    const before = e.clientY < rect.top + rect.height / 2
    wrap.style.borderTop = ''
    wrap.style.borderBottom = ''
    _song = reorderSections(_song, _draggedSectionId, section.id, before)
    _draggedSectionId = null
    saveSong(_song); h.onSongChange(_song)
  })

  if (!section.collapsed) {
    const measuresWrap = document.createElement('div')
    measuresWrap.className = 'measures-wrap'

    section.measures.forEach(measure => {
      measuresWrap.appendChild(buildMeasureDOM(measure, section, h, measureNums.get(measure.id) ?? 0))
    })

    wrap.appendChild(measuresWrap)
  }

  return wrap
}

function buildMeasureDOM(
  measure: Measure, section: Section,
  h: SongEventHandlers, measureNum: number
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'measure-row'

  const numLabel = document.createElement('span')
  numLabel.textContent = String(measureNum)
  numLabel.className = 'measure-num'
  wrap.appendChild(numLabel)

  const chordsRow = document.createElement('div')
  chordsRow.className = 'chords-row'

  measure.chords.forEach(chord => {
    chordsRow.appendChild(buildChordChip(chord, section, measure, h))
  })

  const addBtn = document.createElement('button')
  addBtn.textContent = '+'
  addBtn.className = 'chord-add-btn'
  addBtn.addEventListener('click', () => {
    _song = addChord(_song, section.id, measure.id, '')
    saveSong(_song); h.onSongChange(_song)
    setTimeout(() => {
      const inputs = _container?.querySelectorAll<HTMLInputElement>('.chord-input')
      inputs?.[inputs.length - 1]?.focus()
    }, 50)
  })
  chordsRow.appendChild(addBtn)

  // Drop zone: accepts history chip drags and cross-section chord drags
  chordsRow.addEventListener('dragover', e => {
    const hasHistory = e.dataTransfer!.types.includes('application/x-history-chord')
    const hasChord = !!_draggedChordId
    if (!hasHistory && !hasChord) return
    e.preventDefault()
    e.dataTransfer!.dropEffect = hasHistory ? 'copy' : 'move'
    chordsRow.style.outline = '1px dashed var(--accent)'
  })
  chordsRow.addEventListener('dragleave', e => {
    if (!chordsRow.contains(e.relatedTarget as Node)) {
      chordsRow.style.outline = ''
      _dropIndicator?.remove()
      _insertBeforeChordId = null
    }
  })
  chordsRow.addEventListener('drop', e => {
    chordsRow.style.outline = ''
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

  const delMBtn = makeSmallBtn('×', () => {
    applyWithUndo(removeMeasure(_song, section.id, measure.id), t('measure.deleted', { n: measureNum }))
  })
  delMBtn.title = t('measure.delete.title')
  delMBtn.style.color = 'var(--danger-soft)'
  delMBtn.style.alignSelf = 'center'
  const sectionObj = _song.sections.find(s => s.id === section.id)
  if (!sectionObj || sectionObj.measures.length <= 1) delMBtn.style.display = 'none'
  wrap.appendChild(delMBtn)

  return wrap
}

function buildChordChip(chord: SongChord, section: Section, measure: Measure, h: SongEventHandlers): HTMLElement {
  const isActive = h.activeCursorId === chord.id
  const isCapture = h.captureTargetId === chord.id
  const degree = chord.valid && chord.symbol ? computeDegree(chord.symbol, h.activeKey) : '—'
  const borrowed = chord.valid && chord.symbol ? isBorrowedChord(chord.symbol, h.activeKey) : false

  const wrap = document.createElement('div')
  wrap.className = 'chord-chip'
  wrap.dataset.chordId = chord.id
  wrap.classList.toggle('capture-target', isCapture)
  wrap.classList.toggle('active-cursor', isActive)
  wrap.classList.toggle('invalid', chord.valid === false)

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

function makeBtn(label: string, bg: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.textContent = label
  btn.className = 'song-btn'
  btn.style.background = bg
  btn.addEventListener('click', onClick)
  return btn
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

