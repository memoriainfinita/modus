import type { Song, Section, Measure, SongChord, SectionColor } from './types'

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

export function moveSectionUp(song: Song, sectionId: string): Song {
  const idx = song.sections.findIndex(s => s.id === sectionId)
  if (idx <= 0) return song
  const sections = [...song.sections]
  ;[sections[idx - 1], sections[idx]] = [sections[idx], sections[idx - 1]]
  return { ...song, sections }
}

export function moveSectionDown(song: Song, sectionId: string): Song {
  const idx = song.sections.findIndex(s => s.id === sectionId)
  if (idx < 0 || idx >= song.sections.length - 1) return song
  const sections = [...song.sections]
  ;[sections[idx], sections[idx + 1]] = [sections[idx + 1], sections[idx]]
  return { ...song, sections }
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

export function addChord(song: Song, sectionId: string, measureId: string, symbol: string): Song {
  const valid = isValidChordSymbol(symbol)
  const chord: SongChord = { id: newId(), symbol, valid }
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

export function insertChordAfter(song: Song, afterChordId: string, symbol: string): Song {
  const valid = isValidChordSymbol(symbol)
  const newChord: SongChord = { id: newId(), symbol, valid }
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

export function updateChord(song: Song, chordId: string, symbol: string): Song {
  const valid = isValidChordSymbol(symbol)
  return {
    ...song,
    sections: song.sections.map(s => ({
      ...s,
      measures: s.measures.map(m => ({
        ...m,
        chords: m.chords.map(c => c.id === chordId ? { ...c, symbol, valid } : c)
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

export function moveChord(song: Song, chordId: string, direction: 'left' | 'right'): Song {
  return {
    ...song,
    sections: song.sections.map(s => ({
      ...s,
      measures: s.measures.map(m => {
        const idx = m.chords.findIndex(c => c.id === chordId)
        if (idx === -1) return m
        const chords = [...m.chords]
        const swapIdx = direction === 'left' ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= chords.length) return m
        ;[chords[idx], chords[swapIdx]] = [chords[swapIdx], chords[idx]]
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
const SEMITONE_NAMES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const SHARP_KEYS = ['G','D','A','E','B','F#','C#']

function transposeRoot(root: string, semitones: number, preferSharps: boolean): string {
  const names = preferSharps ? SEMITONE_NAMES_SHARP : SEMITONE_NAMES_FLAT
  const all = [...SEMITONE_NAMES_SHARP, ...SEMITONE_NAMES_FLAT]
  const idx = all.indexOf(root)
  if (idx === -1) return root
  const pc = all.indexOf(root) % 12
  return names[((pc + semitones) % 12 + 12) % 12]
}

export function transposeSong(song: Song, semitones: number, targetKey?: string): Song {
  const preferSharps = targetKey ? SHARP_KEYS.includes(targetKey.split(' ')[0]) : false
  const transposeSymbol = (symbol: string): string => {
    try {
      const chord = UMT.parseChordSymbol(symbol)
      const root = chord.root?.name ?? ''
      const newRoot = transposeRoot(root, semitones, preferSharps)
      return symbol.replace(root, newRoot)
    } catch { return symbol }
  }
  return {
    ...song,
    sections: song.sections.map(s => ({
      ...s,
      measures: s.measures.map(m => ({
        ...m,
        chords: m.chords.map(c => ({ ...c, symbol: transposeSymbol(c.symbol), valid: true }))
      }))
    }))
  }
}

export function saveSong(song: Song) {
  localStorage.setItem('harmony-companion-song', JSON.stringify(song))
}

export function loadSong(): Song {
  try {
    const raw = localStorage.getItem('harmony-companion-song')
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

import { playChord } from './audio'

const SECTION_COLORS: Record<SectionColor, string> = {
  intro: '#7c3aed', verse: '#2563eb', prechorus: '#0891b2',
  chorus: '#16a34a', bridge: '#d97706', outro: '#6b7280', custom: '#4b5563'
}

type SongEventHandlers = {
  onChordClick: (chordId: string, symbol: string) => void
  onChordCapture: (chordId: string) => void
  activeCursorId: string | null
  captureTargetId: string | null
  activeKey: string | null
  onSongChange: (song: Song) => void
}

let _song: Song = createSong()
let _handlers: SongEventHandlers | null = null
let _container: HTMLElement | null = null

export function mountSong(container: HTMLElement, song: Song, handlers: SongEventHandlers) {
  _song = song
  _handlers = handlers
  _container = container
  rerender()
}

export function updateSongState(song: Song) {
  _song = song
  if (_container && _handlers) rerender()
}

function rerender() {
  if (!_container || !_handlers) return
  _container.innerHTML = ''
  _container.appendChild(buildSongDOM(_song, _handlers))
}

function buildSongDOM(song: Song, h: SongEventHandlers): HTMLElement {
  const root = document.createElement('div')
  root.style.cssText = 'padding:12px;display:flex;flex-direction:column;gap:8px'

  const header = document.createElement('div')
  header.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap'

  const titleInput = document.createElement('input')
  titleInput.value = song.title
  titleInput.style.cssText = 'font-size:16px;font-weight:700;background:transparent;border:none;border-bottom:1px solid #4a4a6a;color:#e0e0e0;padding:2px 4px;min-width:120px'
  titleInput.addEventListener('blur', () => {
    _song = { ..._song, title: titleInput.value }
    h.onSongChange(_song)
  })

  const newBtn = makeBtn('New', '#374151', () => {
    if (confirm('Start a new song? Current song will be lost.')) {
      _song = createSong(); saveSong(_song); h.onSongChange(_song)
    }
  })

  const templates: { label: string; name: string; color: SectionColor }[] = [
    { label: 'Intro', name: 'Intro', color: 'intro' },
    { label: 'Verse', name: 'Verse', color: 'verse' },
    { label: 'Pre', name: 'Pre-Chorus', color: 'prechorus' },
    { label: 'Chorus', name: 'Chorus', color: 'chorus' },
    { label: 'Bridge', name: 'Bridge', color: 'bridge' },
    { label: 'Outro', name: 'Outro', color: 'outro' },
  ]
  const templateWrap = document.createElement('div')
  templateWrap.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap'
  templates.forEach(t => {
    const btn = makeBtn(`+ ${t.label}`, SECTION_COLORS[t.color], () => {
      _song = addSection(_song, t.name, t.color); saveSong(_song); h.onSongChange(_song)
    })
    btn.style.fontSize = '11px'
    templateWrap.appendChild(btn)
  })

  const transposeSelect = document.createElement('select')
  transposeSelect.style.cssText = 'background:#252540;color:#e0e0e0;border:1px solid #4a4a6a;border-radius:4px;padding:3px'
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

  const pasteBtn = makeBtn('Paste', '#374151', () => {
    const text = prompt('Paste chord progression (space/comma/newline separated):')
    if (!text) return
    const symbols = parseProgressionText(text)
    if (!_song.sections.length) { _song = addSection(_song, 'Section', 'verse') }
    const section = _song.sections[_song.sections.length - 1]
    const measure = newPasteMeasure(symbols)
    _song = {
      ..._song,
      sections: _song.sections.map(s => s.id !== section.id ? s : {
        ...s, measures: [...s.measures, measure]
      })
    }
    if (symbols.length > 8) alert('All chords added to one measure — split as needed.')
    saveSong(_song); h.onSongChange(_song)
  })

  const analyzeFormBtn = makeBtn('🔍 Form', '#374151', () => {
    const names = _song.sections.map(s => s.name)
    const form = detectForm(names)
    alert(`Form analysis: ${form}`)
  })

  header.append(titleInput, newBtn, templateWrap, transposeSelect, exportBtn, pasteBtn, analyzeFormBtn)
  root.appendChild(header)

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
      valid: isValidChordSymbolPublic(sym)
    }))
  }
}

function isValidChordSymbolPublic(symbol: string): boolean {
  if (!symbol) return false
  try { UMT.parseChordSymbol(symbol); return true } catch { return false }
}

function buildSectionDOM(
  section: Section, song: Song,
  h: SongEventHandlers,
  measureNums: Map<string, number>
): HTMLElement {
  const color = SECTION_COLORS[section.color]
  const wrap = document.createElement('div')
  wrap.style.cssText = `border-left:3px solid ${color};border-radius:4px;background:#1e1e35;overflow:hidden`

  const secHeader = document.createElement('div')
  secHeader.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 10px;background:#252540'

  const toggle = document.createElement('span')
  toggle.textContent = section.collapsed ? '▶' : '▼'
  toggle.style.cssText = 'cursor:pointer;font-size:11px;color:#9ca3af'
  toggle.addEventListener('click', () => {
    _song = updateSection(_song, section.id, { collapsed: !section.collapsed })
    saveSong(_song); h.onSongChange(_song)
  })

  const nameInput = document.createElement('input')
  nameInput.value = section.name
  nameInput.style.cssText = `font-size:13px;font-weight:600;color:${color};background:transparent;border:none;border-bottom:1px dashed transparent;padding:1px 2px`
  nameInput.addEventListener('focus', () => nameInput.style.borderBottomColor = color)
  nameInput.addEventListener('blur', () => {
    nameInput.style.borderBottomColor = 'transparent'
    _song = updateSection(_song, section.id, { name: nameInput.value })
    saveSong(_song); h.onSongChange(_song)
  })

  // Colour swatch
  const PRESET_COLORS: SectionColor[] = ['intro','verse','prechorus','chorus','bridge','outro','custom']
  const swatchEl = document.createElement('button')
  swatchEl.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:none;cursor:pointer;flex-shrink:0`
  swatchEl.title = 'Change section colour'
  swatchEl.addEventListener('click', () => {
    const options = PRESET_COLORS.map((c, i) => `${i}: ${c}`).join('\n')
    const choice = prompt(`Choose colour:\n${options}`, String(PRESET_COLORS.indexOf(section.color)))
    const idx = parseInt(choice ?? '-1')
    if (idx >= 0 && idx < PRESET_COLORS.length) {
      _song = updateSection(_song, section.id, { color: PRESET_COLORS[idx] })
      saveSong(_song); h.onSongChange(_song)
    }
  })

  // Repeat count badge — always shown
  const repeatBadge = document.createElement('span')
  repeatBadge.textContent = `×${section.repeatCount}`
  repeatBadge.title = 'Click to edit repeat count'
  repeatBadge.style.cssText = 'font-size:10px;color:#9ca3af;cursor:pointer;background:#374151;border-radius:3px;padding:1px 4px'
  repeatBadge.addEventListener('click', () => {
    const n = parseInt(prompt('Repeat count (1-16):', String(section.repeatCount)) ?? '1')
    if (n >= 1 && n <= 16) {
      _song = updateSection(_song, section.id, { repeatCount: n })
      saveSong(_song); h.onSongChange(_song)
    }
  })

  const upBtn = makeSmallBtn('↑', () => { _song = moveSectionUp(_song, section.id); saveSong(_song); h.onSongChange(_song) })
  const downBtn = makeSmallBtn('↓', () => { _song = moveSectionDown(_song, section.id); saveSong(_song); h.onSongChange(_song) })
  const dupBtn = makeSmallBtn('⧉', () => { _song = duplicateSection(_song, section.id); saveSong(_song); h.onSongChange(_song) })
  const delBtn = makeSmallBtn('×', () => {
    if (confirm(`Delete section "${section.name}"?`)) {
      _song = removeSection(_song, section.id); saveSong(_song); h.onSongChange(_song)
    }
  })
  delBtn.style.color = '#f87171'

  secHeader.append(toggle, nameInput, swatchEl, repeatBadge, upBtn, downBtn, dupBtn, delBtn)

  const addMeasureBtn = makeSmallBtn('+ Bar', () => {
    _song = addMeasure(_song, section.id); saveSong(_song); h.onSongChange(_song)
  })
  secHeader.appendChild(addMeasureBtn)

  wrap.appendChild(secHeader)

  if (!section.collapsed) {
    const measuresWrap = document.createElement('div')
    measuresWrap.style.cssText = 'padding:8px;display:flex;flex-direction:column;gap:6px'

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
  wrap.style.cssText = 'display:flex;align-items:flex-start;gap:4px'

  const numLabel = document.createElement('span')
  numLabel.textContent = String(measureNum)
  numLabel.style.cssText = 'font-size:10px;color:#6b7280;min-width:18px;padding-top:8px'
  wrap.appendChild(numLabel)

  const chordsRow = document.createElement('div')
  chordsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:flex-start'

  measure.chords.forEach(chord => {
    chordsRow.appendChild(buildChordChip(chord, section, measure, h))
  })

  const addBtn = document.createElement('button')
  addBtn.textContent = '+'
  addBtn.style.cssText = 'width:32px;height:40px;border-radius:4px;background:#252540;color:#9ca3af;border:1px dashed #4a4a6a;cursor:pointer;font-size:18px'
  addBtn.addEventListener('click', () => {
    _song = addChord(_song, section.id, measure.id, '')
    saveSong(_song); h.onSongChange(_song)
    setTimeout(() => {
      const inputs = _container?.querySelectorAll<HTMLInputElement>('.chord-input')
      inputs?.[inputs.length - 1]?.focus()
    }, 50)
  })
  chordsRow.appendChild(addBtn)

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
  if (isCapture) wrap.classList.add('capture-target')
  wrap.style.cssText = `
    position:relative;display:flex;flex-direction:column;align-items:center;
    min-width:52px;padding:4px 6px;border-radius:6px;
    background:#252540;cursor:pointer;
    border:1.5px solid ${isActive ? '#fff' : chord.valid === false ? '#ef4444' : '#3a3a5c'};
  `

  const isEditing = !chord.symbol
  if (isEditing) {
    const input = document.createElement('input')
    input.className = 'chord-input'
    input.style.cssText = 'width:52px;background:transparent;border:none;color:#e0e0e0;font-size:12px;font-weight:600;text-align:center;outline:none'
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
  symbolEl.style.cssText = `font-size:12px;font-weight:600;color:${chord.valid ? '#e0e0e0' : '#ef4444'}`

  const degreeEl = document.createElement('div')
  degreeEl.textContent = degree
  degreeEl.style.cssText = `font-size:9px;color:${borrowed ? '#f59e0b' : '#6b7280'};margin-top:2px`

  wrap.appendChild(symbolEl)
  wrap.appendChild(degreeEl)

  const controls = document.createElement('div')
  controls.style.cssText = 'display:none;position:absolute;top:-20px;left:0;gap:2px;background:#1a1a2e;border-radius:3px;padding:1px 2px'

  const editBtn = makeSmallBtn('✎', () => {
    const input = document.createElement('input')
    input.className = 'chord-input'
    input.value = chord.symbol
    input.style.cssText = 'width:52px;background:transparent;border:none;color:#e0e0e0;font-size:12px;font-weight:600;text-align:center;outline:none'
    const prevVal = chord.symbol
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { _song = updateChord(_song, chord.id, input.value.trim() || prevVal); saveSong(_song); h.onSongChange(_song) }
      if (e.key === 'Escape') { h.onSongChange(_song) }
    })
    input.addEventListener('blur', () => { _song = updateChord(_song, chord.id, input.value.trim() || prevVal); saveSong(_song); h.onSongChange(_song) })
    wrap.innerHTML = ''; wrap.appendChild(input); input.focus()
  })
  const delBtn = makeSmallBtn('×', () => { _song = removeChord(_song, chord.id); saveSong(_song); h.onSongChange(_song) })
  const leftBtn = makeSmallBtn('←', () => { _song = moveChord(_song, chord.id, 'left'); saveSong(_song); h.onSongChange(_song) })
  const rightBtn = makeSmallBtn('→', () => { _song = moveChord(_song, chord.id, 'right'); saveSong(_song); h.onSongChange(_song) })
  const captureBtn = makeSmallBtn('⊕', () => h.onChordCapture(chord.id))

  controls.append(leftBtn, rightBtn, editBtn, captureBtn, delBtn)
  wrap.appendChild(controls)

  wrap.addEventListener('mouseenter', () => controls.style.display = 'flex')
  wrap.addEventListener('mouseleave', () => controls.style.display = 'none')

  wrap.addEventListener('click', () => h.onChordClick(chord.id, chord.symbol))
  wrap.addEventListener('dblclick', () => playChord(chord.symbol))

  return wrap
}

function makeBtn(label: string, bg: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.textContent = label
  btn.style.cssText = `padding:4px 10px;border-radius:4px;background:${bg};color:#fff;border:none;cursor:pointer;font-size:12px`
  btn.addEventListener('click', onClick)
  return btn
}

function makeSmallBtn(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.textContent = label
  btn.style.cssText = 'padding:2px 5px;border-radius:3px;background:#374151;color:#e0e0e0;border:none;cursor:pointer;font-size:11px'
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
  if (/^(AB)+$/.test(pattern) || pattern === 'ABAB') return `Verse-Chorus (${pattern})`
  if (/^AABA/.test(pattern)) return `AABA (${pattern})`
  if (/^(A+B+A+)$/.test(pattern)) return `Ternary (${pattern})`
  if (/^A+$/.test(pattern)) return `Through-composed — single section (${pattern})`
  return `${pattern}`
}
