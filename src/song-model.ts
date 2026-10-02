import type { Song, Section, Measure, SongChord, SectionColor } from './types'
import { PITCH_NAMES_FLAT, noteNameToMidi } from './midi'
import { isKnownChord } from './chord'
import { romanInKey } from './analyzer'
import { keyPrefersSharps } from './keys'
export { transposeKey } from './keys'

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

/** Adds a chord to a measure — at the end, or before `beforeChordId` when given and found. */
export function addChord(song: Song, sectionId: string, measureId: string, symbol: string, notes?: string[], beforeChordId?: string): Song {
  const valid = isValidChordSymbol(symbol)
  const chord: SongChord = { id: newId(), symbol, valid, ...(notes?.length ? { notes } : {}) }
  return {
    ...song,
    sections: song.sections.map(s => s.id !== sectionId ? s : {
      ...s,
      measures: s.measures.map(m => {
        if (m.id !== measureId) return m
        const chords = [...m.chords]
        const at = beforeChordId ? chords.findIndex(c => c.id === beforeChordId) : -1
        chords.splice(at === -1 ? chords.length : at, 0, chord)
        return { ...m, chords }
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
  return text.split(/[\s,\n|]+/).map(t => t.trim()).filter(Boolean)
}

/**
 * Splits a pasted progression into measures: `|` marks bar lines, as in a chord chart
 * ("Am G | C F" → two measures). Without bars, each chord gets its own measure.
 */
export function parseProgressionMeasures(text: string): string[][] {
  if (!text.includes('|')) return parseProgressionText(text).map(sym => [sym])
  return text.split('|').map(parseProgressionText).filter(m => m.length > 0)
}

/** Appends measures of chords to a section. An empty last measure is filled first. */
export function appendProgression(song: Song, sectionId: string, measures: string[][]): Song {
  return {
    ...song,
    sections: song.sections.map(s => {
      if (s.id !== sectionId) return s
      const kept = [...s.measures]
      const last = kept[kept.length - 1]
      const reuse = last && last.chords.length === 0
      if (reuse) kept.pop()
      const added: Measure[] = measures.map((syms, i) => ({
        id: i === 0 && reuse ? last.id : newId(),
        chords: syms.map(symbol => ({ id: newId(), symbol, valid: isValidChordSymbol(symbol) })),
      }))
      return { ...s, measures: [...kept, ...added] }
    })
  }
}

export function computeDegree(chordSymbol: string, activeKey: string | null): string {
  if (!activeKey || !chordSymbol) return '—'
  return romanInKey(chordSymbol, activeKey)?.roman ?? '?'
}

export function isBorrowedChord(chordSymbol: string, activeKey: string | null): boolean {
  return romanInKey(chordSymbol, activeKey)?.isBorrowed ?? false
}

export const isValidChordSymbol = isKnownChord

const SEMITONE_NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

function transposeRoot(root: string, semitones: number, preferSharps: boolean): string {
  const names = preferSharps ? SEMITONE_NAMES_SHARP : PITCH_NAMES_FLAT
  const all = [...SEMITONE_NAMES_SHARP, ...PITCH_NAMES_FLAT]
  const idx = all.indexOf(root)
  if (idx === -1) return root
  return names[((idx % 12 + semitones) % 12 + 12) % 12]
}

export function transposeSong(song: Song, semitones: number, targetKey?: string): Song {
  const preferSharps = keyPrefersSharps(targetKey)
  const names = preferSharps ? SEMITONE_NAMES_SHARP : PITCH_NAMES_FLAT
  const transposePart = (part: string): string => {
    const m = part.match(/^([A-G][b#]?)/)
    if (!m) return part
    return transposeRoot(m[1], semitones, preferSharps) + part.slice(m[1].length)
  }
  const transposeSymbol = (symbol: string): string =>
    symbol.split('/').map(transposePart).join('/')
  // Stored voicings move with the symbol, keeping their octave layout.
  const transposeNote = (note: string): string => {
    const midi = noteNameToMidi(note)
    if (midi === null) return note
    const t = midi + semitones
    return names[((t % 12) + 12) % 12] + (Math.floor(t / 12) - 1)
  }
  return {
    ...song,
    sections: song.sections.map(s => ({
      ...s,
      measures: s.measures.map(m => ({
        ...m,
        chords: m.chords.map(c => {
          const symbol = transposeSymbol(c.symbol)
          return {
            ...c, symbol, valid: isValidChordSymbol(symbol),
            ...(c.notes ? { notes: c.notes.map(transposeNote) } : {}),
          }
        })
      }))
    }))
  }
}

/** Drops chord slots still being typed (empty symbol): they live only in the open editor. */
export function withoutEmptyChords(song: Song): Song {
  return {
    ...song,
    sections: song.sections.map(s => ({
      ...s,
      measures: s.measures.map(m => ({ ...m, chords: m.chords.filter(c => c.symbol) }))
    }))
  }
}

export function saveSong(song: Song) {
  localStorage.setItem('modus-song', JSON.stringify(withoutEmptyChords(song)))
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
    return withoutEmptyChords(parsed as Song)
  } catch { return createSong() }
}

export function detectForm(sectionNames: string[]): string {
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
