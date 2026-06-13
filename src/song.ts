import type { Song, Section, Measure, SongChord, SectionColor } from './types'
import { playChord, playNoteNames, initAudioOnGesture } from './audio'
import { PITCH_NAMES_FLAT } from './midi'

export function createSong(): Song {
  return { schemaVersion: 1, title: 'Untitled', sections: [] }
}

function newId(): string { return crypto.randomUUID() }

function newMeasure(): Measure { return { id: newId(), chords: [] } }

export function addSection(song: Song, name: string, color: SectionColor): Song {
  const section: Section = {
    id: newId(), name, color,
    measures: [newMeasure()],
    collapsed: false,
    repeatCount: 1,
  }
  return { ...song, sections: [...song.sections, section] }
}

export function removeSection(song: Song, sectionId: string): Song {
  return { ...song, sections: song.sections.filter(s => s.id !== sectionId) }
}

export function updateSection(song: Song, sectionId: string, patch: Partial<Section>): Song {
  return {
    ...song,
    sections: song.sections.map(s => s.id === sectionId ? { ...s, ...patch } : s)
  }
}

export function duplicateSection(song: Song, sectionId: string): Song {
  const src = song.sections.find(s => s.id === sectionId)
  if (!src) return song
  const copy: Section = {
    ...src,
    id: newId(),
    measures: src.measures.map(m => ({
      id: newId(),
      chords: m.chords.map(c => ({ ...c, id: newId() }))
    }))
  }
  const idx = song.sections.findIndex(s => s.id === sectionId)
  const sections = [...song.sections]
  sections.splice(idx + 1, 0, copy)
  return { ...song, sections }
}

export function addMeasure(song: Song, sectionId: string): Song {
  return {
    ...song,
    sections: song.sections.map(s =>
      s.id === sectionId ? { ...s, measures: [...s.measures, newMeasure()] } : s
    )
  }
}

export function removeMeasure(song: Song, sectionId: string, measureId: string): Song {
  return {
    ...song,
    sections: song.sections.map(s => {
      if (s.id !== sectionId || s.measures.length <= 1) return s
      return { ...s, measures: s.measures.filter(m => m.id !== measureId) }
    })
  }
}

export function addChord(song: Song, sectionId: string, measureId: string, symbol: string, notes?: string[]): Song {
  const valid = isValidChordSymbol(symbol)
  const chord: SongChord = { id: newId(), symbol, valid, ...(notes?.length ? { notes } : {}) }
  return {
    ...song,
    sections: song.sections.map(s => s.id !== sectionId ? s : {
      ...s,
      measures: s.measures.map(m => m.id !== measureId ? m : {
        ...m, chords: [...m.chords, chord]
      })
    })
  }
}

export function insertChordAfter(song: Song, afterChordId: string, symbol: string, notes?: string[]): Song {
  const valid = isValidChordSymbol(symbol)
  const newChord: SongChord = { id: newId(), symbol, valid, ...(notes?.length ? { notes } : {}) }
  return {
    ...song,
    sections: song.sections.map(s => ({
      ...s,
      measures: s.measures.map(m => {
        const idx = m.chords.findIndex(c => c.id === afterChordId)
        if (idx === -1) return m
        const chords = [...m.chords]
        chords.splice(idx + 1, 0, newChord)
        return { ...m, chords }
      })
    }))
  }
}

export function updateChord(song: Song, chordId: string, symbol: string, notes?: string[]): Song {
  const valid = isValidChordSymbol(symbol)
  return {
    ...song,
    sections: song.sections.map(s => ({
      ...s,
      measures: s.measures.map(m => ({
        ...m,
        chords: m.chords.map(c => c.id === chordId
          ? { ...c, symbol, valid, ...(notes?.length ? { notes } : { notes: undefined }) }
          : c)
      }))
    }))
  }
}

export function removeChord(song: Song, chordId: string): Song {
  return {
    ...song,
    sections: song.sections.map(s => ({
      ...s,
      measures: s.measures.map(m => ({
        ...m, chords: m.chords.filter(c => c.id !== chordId)
      }))
    }))
  }
}

export function duplicateChord(song: Song, chordId: string): Song {
  for (const s of song.sections)
    for (const m of s.measures) {
      const c = m.chords.find(ch => ch.id === chordId)
      if (c) return insertChordAfter(song, chordId, c.symbol, c.notes)
    }
  return song
}

export function moveChordToPosition(
  song: Song, chordId: string,
  targetSectionId: string, targetMeasureId: string,
  beforeChordId?: string
): Song {
  let movedChord: SongChord | undefined
  const without = {
    ...song,
    sections: song.sections.map(s => ({
      ...s,
      measures: s.measures.map(m => {
        const idx = m.chords.findIndex(c => c.id === chordId)
        if (idx === -1) return m
        movedChord = m.chords[idx]
        return { ...m, chords: m.chords.filter(c => c.id !== chordId) }
      })
    }))
  }
  if (!movedChord) return song
  return {
    ...without,
    sections: without.sections.map(s => {
      if (s.id !== targetSectionId) return s
      return {
        ...s,
        measures: s.measures.map(m => {
          if (m.id !== targetMeasureId) return m
          const chords = [...m.chords]
          const at = beforeChordId ? chords.findIndex(c => c.id === beforeChordId) : -1
          chords.splice(at === -1 ? chords.length : at, 0, movedChord!)
          return { ...m, chords }
        })
      }
    })
  }
}

export function reorderSections(song: Song, draggedId: string, targetId: string, before: boolean): Song {
  const sections = [...song.sections]
  const fromIdx = sections.findIndex(s => s.id === draggedId)
  if (fromIdx === -1) return song
  const [moved] = sections.splice(fromIdx, 1)
  const toIdx = sections.findIndex(s => s.id === targetId)
  if (toIdx === -1) return song
  sections.splice(before ? toIdx : toIdx + 1, 0, moved)
  return { ...song, sections }
}

export function reorderChordInMeasure(song: Song, draggedId: string, targetId: string, before: boolean): Song {
  return {
    ...song,
    sections: song.sections.map(s => ({
      ...s,
      measures: s.measures.map(m => {
        const fromIdx = m.chords.findIndex(c => c.id === draggedId)
        if (fromIdx === -1) return m
        const targetIdx = m.chords.findIndex(c => c.id === targetId)
        if (targetIdx === -1) return m
        const chords = [...m.chords]
        const [moved] = chords.splice(fromIdx, 1)
        const insertAt = chords.findIndex(c => c.id === targetId)
        chords.splice(before ? insertAt : insertAt + 1, 0, moved)
        return { ...m, chords }
      })
    }))
  }
}

export function computeMeasureNumbers(song: Song): Map<string, number> {
  const map = new Map<string, number>()
  let n = 1
  for (const section of song.sections) {
    for (const measure of section.measures) {
      map.set(measure.id, n++)
    }
  }
  return map
}

export function parseProgressionText(text: string): string[] {
  return text.split(/[\s,\n]+/).map(t => t.trim()).filter(Boolean)
}

export function computeDegree(chordSymbol: string, activeKey: string | null): string {
  if (!activeKey || !chordSymbol) return '—'
  try {
    const chord = UMT.parseChordSymbol(chordSymbol)
    const { analysis } = UMT.Harmony.analyzeProgression([chord], activeKey)
    const a = analysis[0]
    if (!a) return '?'
    return a.roman ?? '?'
  } catch { return '?' }
}

export function isBorrowedChord(chordSymbol: string, activeKey: string | null): boolean {
  if (!activeKey) return false
  try {
    const chord = UMT.parseChordSymbol(chordSymbol)
    const { analysis } = UMT.Harmony.analyzeProgression([chord], activeKey)
    return analysis[0]?.isBorrowed ?? false
  } catch { return false }
}

function isValidChordSymbol(symbol: string): boolean {
  if (!symbol) return false
  try { UMT.parseChordSymbol(symbol); return true } catch { return false }
}

const SEMITONE_NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const SHARP_KEYS = ['G','D','A','E','B','F#','C#']

function transposeRoot(root: string, semitones: number, preferSharps: boolean): string {
  const names = preferSharps ? SEMITONE_NAMES_SHARP : PITCH_NAMES_FLAT
  const all = [...SEMITONE_NAMES_SHARP, ...PITCH_NAMES_FLAT]
  const idx = all.indexOf(root)
  if (idx === -1) return root
  return names[((idx % 12 + semitones) % 12 + 12) % 12]
}

export function transposeSong(song: Song, semitones: number, targetKey?: string): Song {
  const preferSharps = targetKey ? SHARP_KEYS.includes(targetKey.split(' ')[0]) : false
  const transposePart = (part: string): string => {
    const m = part.match(/^([A-G][b#]?)/)
    if (!m) return part
    return transposeRoot(m[1], semitones, preferSharps) + part.slice(m[1].length)
  }
  const transposeSymbol = (symbol: string): string =>
    symbol.split('/').map(transposePart).join('/')
  return {
    ...song,
    sections: song.sections.map(s => ({
      ...s,
      measures: s.measures.map(m => ({
        ...m,
        chords: m.chords.map(c => {
          const symbol = transposeSymbol(c.symbol)
          return { ...c, symbol, valid: isValidChordSymbol(symbol) }
        })
      }))
    }))
  }
}

export function saveSong(song: Song) {
  localStorage.setItem('modus-song', JSON.stringify(song))
}

export function loadSong(): Song {
  try {
    const raw = localStorage.getItem('modus-song') ?? localStorage.getItem('harmony-companion-song')
    if (!raw) return createSong()
    const parsed = JSON.parse(raw)
    if (parsed.schemaVersion !== 1) {
      console.warn('Song schema version mismatch — resetting')
      return createSong()
    }
    return parsed as Song
  } catch { return createSong() }
}

// ─── Song UI ─────────────────────────────────────────────────────────────────

const SECTION_COLORS: Record<SectionColor, string> = {
  intro: '#7c3aed', verse: '#2563eb', prechorus: '#0891b2',
  chorus: '#16a34a', bridge: '#d97706', outro: '#6b7280', custom: '#4b5563'
}

type SongEventHandlers = {
  onChordClick: (chordId: string, symbol: string, notes?: string[]) => void
  onChordCapture: (chordId: string) => void
  activeCursorId: string | null
  captureTargetId: string | null
  activeKey: string | null
  onSongChange: (song: Song) => void
}

let _song: Song = createSong()
let _handlers: SongEventHandlers | null = null
let _container: HTMLElement | null = null

let _draggedSectionId: string | null = null
let _draggedChordId: string | null = null
let _pendingConfirmEl: { el: HTMLButtonElement; timer: number } | null = null
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

function confirmOnce(btn: HTMLButtonElement, action: () => void) {
  if (_pendingConfirmEl?.el === btn) {
    clearTimeout(_pendingConfirmEl.timer)
    _pendingConfirmEl = null
    btn.textContent = btn.dataset.orig!
    btn.style.background = '#374151'
    action()
    return
  }
  if (_pendingConfirmEl) {
    clearTimeout(_pendingConfirmEl.timer)
    _pendingConfirmEl.el.textContent = _pendingConfirmEl.el.dataset.orig!
    _pendingConfirmEl.el.style.background = '#374151'
    _pendingConfirmEl = null
  }
  btn.dataset.orig = btn.textContent!
  btn.textContent = '?'
  btn.style.background = '#991b1b'
  const timer = window.setTimeout(() => {
    btn.textContent = btn.dataset.orig!
    btn.style.background = '#374151'
    _pendingConfirmEl = null
  }, 3000)
  _pendingConfirmEl = { el: btn, timer }
}

export function mountSong(container: HTMLElement, song: Song, handlers: SongEventHandlers) {
  _song = song
  _handlers = handlers
  _container = container
  rerender()
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

  const newBtn = makeBtn('New', '#374151', () => {
    confirmOnce(newBtn, () => { _song = createSong(); saveSong(_song); h.onSongChange(_song) })
  })
  newBtn.title = 'Start new song — click twice to confirm'

  // Inline paste area
  const pasteArea = document.createElement('div')
  pasteArea.className = 'paste-area'
  pasteArea.style.display = 'none'
  const pasteTA = document.createElement('textarea')
  pasteTA.placeholder = 'Am G C F  (space, comma or newline separated)'
  pasteTA.rows = 2
  pasteTA.className = 'paste-textarea'
  const pasteSubmit = makeBtn('Add chords', '#4f46e5', () => {
    const text = pasteTA.value.trim()
    if (!text) return
    const symbols = parseProgressionText(text)
    if (!_song.sections.length) { _song = addSection(_song, 'Section', 'verse') }
    const section = _song.sections[_song.sections.length - 1]
    const measure = newPasteMeasure(symbols)
    _song = { ..._song, sections: _song.sections.map(s => s.id !== section.id ? s : { ...s, measures: [...s.measures, measure] }) }
    if (symbols.length > 8) showNotice('All chords added to one measure — split as needed.')
    pasteTA.value = ''
    pasteArea.style.display = 'none'
    saveSong(_song); h.onSongChange(_song)
  })
  pasteArea.append(pasteTA, pasteSubmit)

  const templates: { label: string; name: string; color: SectionColor }[] = [
    { label: 'Intro', name: 'Intro', color: 'intro' },
    { label: 'Verse', name: 'Verse', color: 'verse' },
    { label: 'Pre', name: 'Pre-Chorus', color: 'prechorus' },
    { label: 'Chorus', name: 'Chorus', color: 'chorus' },
    { label: 'Bridge', name: 'Bridge', color: 'bridge' },
    { label: 'Outro', name: 'Outro', color: 'outro' },
  ]
  const templateWrap = document.createElement('div')
  templateWrap.className = 'template-wrap'
  templates.forEach(t => {
    const btn = makeBtn(`+ ${t.label}`, SECTION_COLORS[t.color], () => {
      _song = addSection(_song, t.name, t.color); saveSong(_song); h.onSongChange(_song)
    })
    btn.style.fontSize = '11px'
    btn.title = `Add ${t.name} section`
    templateWrap.appendChild(btn)
  })

  const transposeSelect = document.createElement('select')
  transposeSelect.title = 'Transpose all chords up by semitones'
  transposeSelect.className = 'transpose-select'
  transposeSelect.innerHTML = '<option value="">⇄ Transpose</option>' +
    Array.from({length:11},(_,i)=>`<option value="${i+1}">+${i+1} st</option>`).join('')
  transposeSelect.addEventListener('change', () => {
    const n = parseInt(transposeSelect.value)
    if (n) { _song = transposeSong(_song, n); saveSong(_song); h.onSongChange(_song) }
    transposeSelect.value = ''
  })

  const exportBtn = makeBtn('⎙ Export', '#374151', () => {
    const printWin = window.open('', '_blank')!
    printWin.document.write(buildPrintHTML(_song, h.activeKey))
    printWin.document.close()
    printWin.print()
  })
  exportBtn.title = 'Print / export song to PDF'

  const pasteBtn = makeBtn('Paste', '#374151', () => {
    const open = pasteArea.style.display === 'none'
    pasteArea.style.display = open ? 'block' : 'none'
    if (open) pasteTA.focus()
  })
  pasteBtn.title = 'Paste a chord progression as text'

  header.append(titleInput, newBtn, templateWrap, transposeSelect, exportBtn, pasteBtn)
  root.appendChild(header)
  root.appendChild(pasteArea)

  // Inline real-time form + key summary
  const formInfo = document.createElement('div')
  formInfo.className = 'song-form-info'
  const form = detectForm(_song.sections.map(s => s.name))
  const keyStr = h.activeKey ? ` · Key: ${h.activeKey}` : ''
  formInfo.textContent = _song.sections.length ? `Form: ${form}${keyStr}` : ''
  root.appendChild(formInfo)

  const measureNums = computeMeasureNumbers(song)

  song.sections.forEach(section => {
    root.appendChild(buildSectionDOM(section, song, h, measureNums))
  })

  return root
}

function newPasteMeasure(symbols: string[]): Measure {
  return {
    id: crypto.randomUUID(),
    chords: symbols.map(sym => ({
      id: crypto.randomUUID(),
      symbol: sym,
      valid: isValidChordSymbol(sym)
    }))
  }
}

function buildSectionDOM(
  section: Section, song: Song,
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
  swatchEl.title = 'Change section color'
  swatchEl.addEventListener('click', (e) => {
    e.stopPropagation()
    document.querySelector('.color-picker-popup')?.remove()
    const picker = document.createElement('div')
    picker.className = 'color-picker-popup'
    PRESET_COLORS.forEach(c => {
      const dot = document.createElement('button')
      dot.title = c
      dot.className = 'color-picker-dot'
      dot.style.background = SECTION_COLORS[c]
      dot.style.borderColor = c === section.color ? '#fff' : 'transparent'
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
  repeatBadge.title = 'Repeat count — click to edit'
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
  dragHandle.title = 'Drag to reorder section'
  dragHandle.className = 'section-drag-handle'

  const dupBtn = makeSmallBtn('⧉', () => { _song = duplicateSection(_song, section.id); saveSong(_song); h.onSongChange(_song) })
  dupBtn.title = 'Duplicate section'
  const delBtn = makeSmallBtn('×', () => {
    confirmOnce(delBtn, () => { _song = removeSection(_song, section.id); saveSong(_song); h.onSongChange(_song) })
  })
  delBtn.style.color = '#f87171'
  delBtn.title = 'Delete section — click twice to confirm'

  secHeader.append(dragHandle, toggle, nameInput, swatchEl, repeatBadge, dupBtn, delBtn)

  const addMeasureBtn = makeSmallBtn('+ Bar', () => {
    _song = addMeasure(_song, section.id); saveSong(_song); h.onSongChange(_song)
  })
  addMeasureBtn.title = 'Add a measure to this section'
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
    wrap.style.borderTop = before ? '2px solid #4f46e5' : ''
    wrap.style.borderBottom = !before ? '2px solid #4f46e5' : ''
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
    chordsRow.style.outline = '1px dashed #4f46e5'
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
      _song = addChord(_song, section.id, measure.id, symbol, notes)
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
    _song = removeMeasure(_song, section.id, measure.id); saveSong(_song); h.onSongChange(_song)
  })
  delMBtn.style.color = '#f87171'
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
  wrap.className = `chord-chip${isCapture ? ' capture-target' : ''}`
  wrap.style.borderColor = isActive ? '#fff' : chord.valid === false ? '#ef4444' : '#3a3a5c'

  const isEditing = !chord.symbol
  if (isEditing) {
    const input = document.createElement('input')
    input.className = 'chord-input'
    input.placeholder = 'Am7'

    const prevValue = chord.symbol

    const confirmInput = () => {
      const val = input.value.trim()
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
  symbolEl.textContent = chord.symbol
  symbolEl.className = 'chord-chip-symbol'
  if (!chord.valid) symbolEl.style.color = '#ef4444'

  const degreeEl = document.createElement('div')
  degreeEl.textContent = degree
  degreeEl.className = 'chord-chip-degree'
  if (borrowed) degreeEl.style.color = '#f59e0b'

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
      _song = updateChord(_song, chord.id, input.value.trim() || prevVal, notesState)
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
      notesRow.style.cssText = 'display:flex;align-items:center;gap:3px;font-size:9px;color:#9ca3af;white-space:nowrap;overflow:hidden'
      const notesText = document.createElement('span')
      notesText.textContent = '♩ ' + notesState.join(' ')
      notesText.style.overflow = 'hidden'
      notesText.style.textOverflow = 'ellipsis'
      const clearBtn = document.createElement('button')
      clearBtn.textContent = '×'
      clearBtn.title = 'Clear stored voicing'
      clearBtn.style.cssText = 'background:none;border:none;color:#6b7280;cursor:pointer;padding:0 2px;font-size:10px;flex-shrink:0'
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
  editBtn.title = 'Edit chord symbol'
  const dupBtn = makeSmallBtn('⧉', () => { _song = duplicateChord(_song, chord.id); saveSong(_song); h.onSongChange(_song) })
  dupBtn.title = 'Duplicate chord'
  const delBtn = makeSmallBtn('×', () => { _song = removeChord(_song, chord.id); saveSong(_song); h.onSongChange(_song) })
  delBtn.title = 'Remove chord'
  const captureBtn = makeSmallBtn('⊙', () => h.onChordCapture(chord.id))
  captureBtn.title = 'MIDI fill: next chord played on MIDI keyboard replaces this slot'
  if (isCapture) { captureBtn.style.color = '#818cf8'; captureBtn.style.fontWeight = '700' }

  controls.append(editBtn, dupBtn, captureBtn, delBtn)
  wrap.appendChild(controls)

  wrap.addEventListener('mouseenter', () => controls.style.display = 'flex')
  wrap.addEventListener('mouseleave', () => controls.style.display = 'none')

  wrap.addEventListener('click', () => h.onChordClick(chord.id, chord.symbol, chord.notes))
  wrap.addEventListener('dblclick', () => {
    initAudioOnGesture()
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
    if (!_draggedChordId || _draggedChordId === chord.id) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer!.dropEffect = 'move'
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
    e.preventDefault()
    e.stopPropagation()
    if (!_draggedChordId || _draggedChordId === chord.id) return
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
    <h1>${song.title}</h1>
    <div class="key">${activeKey ? 'Key: ' + activeKey : ''}</div>`
  for (const section of song.sections) {
    html += `<div class="section"><div class="section-name">${section.name}${section.repeatCount > 1 ? ` ×${section.repeatCount}` : ''}</div><div class="measures">`
    for (const measure of section.measures) {
      const num = measureNums.get(measure.id) ?? ''
      html += `<div class="measure"><div class="bar-num">${num}</div>`
      for (const chord of measure.chords) {
        const degree = activeKey ? computeDegree(chord.symbol, activeKey) : '—'
        html += `<div class="chord">${chord.symbol}</div><div class="degree">${degree}</div>`
      }
      html += '</div>'
    }
    html += '</div></div>'
  }
  html += '</body></html>'
  return html
}

function detectForm(sectionNames: string[]): string {
  if (sectionNames.length === 0) return 'Empty'
  const map = new Map<string, string>()
  let letter = 65
  const letters = sectionNames.map(name => {
    const key = name.trim().toLowerCase()
    if (!map.has(key)) map.set(key, String.fromCharCode(letter++))
    return map.get(key)!
  })
  const pattern = letters.join('')
  if (/^(AB)+$/.test(pattern)) return `Verse-Chorus (${pattern})`
  if (/^AABA/.test(pattern)) return `AABA (${pattern})`
  if (/^(A+B+A+)$/.test(pattern)) return `Ternary (${pattern})`
  if (pattern === 'A') return 'Single section (A)'
  if (/^A+$/.test(pattern)) return `Strophic (${pattern})`
  return `${pattern}`
}
