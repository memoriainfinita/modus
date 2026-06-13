import { describe, it, expect } from 'vitest'
import {
  createSong, addSection, addMeasure, removeMeasure, addChord,
  removeChord, removeSection, updateSection, transposeSong,
  parseProgressionText, computeMeasureNumbers, duplicateSection,
  insertChordAfter, updateChord, duplicateChord,
  moveChordToPosition, reorderSections, reorderChordInMeasure,
  computeDegree, isBorrowedChord,
} from '../src/song'

// Minimal UMT mock for transpose
;(globalThis as any).UMT = {
  parseChordSymbol: (s: string) => ({
    root: { name: s[0] },
    quality: 'major',
    name: s,
    getNotes: () => [],
  }),
  parseNote: (s: string) => ({ name: s }),
  Harmony: { analyzeProgression: () => ({ analysis: [{ roman: 'I△7', function: 'T', isDiatonic: true, isBorrowed: false, isSecondary: false }], modulations: [], harmonicRhythm: 0 }) },
  FiguredBass: { fromChord: () => '' },
  KeyDetection: { detect: () => [] },
  getSubstitutions: () => [],
  CircleOfFifths: class {},
}

describe('createSong', () => {
  it('creates empty song with schemaVersion 1', () => {
    const s = createSong()
    expect(s.schemaVersion).toBe(1)
    expect(s.sections).toHaveLength(0)
    expect(s.title).toBe('Untitled')
  })
})

describe('addSection', () => {
  it('adds section with one empty measure', () => {
    const s = addSection(createSong(), 'Verse', 'verse')
    expect(s.sections).toHaveLength(1)
    expect(s.sections[0].measures).toHaveLength(1)
    expect(s.sections[0].name).toBe('Verse')
  })
})

describe('addChord / removeChord', () => {
  it('adds chord to measure', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    const sectionId = s.sections[0].id
    const measureId = s.sections[0].measures[0].id
    s = addChord(s, sectionId, measureId, 'Cmaj7')
    expect(s.sections[0].measures[0].chords).toHaveLength(1)
    expect(s.sections[0].measures[0].chords[0].symbol).toBe('Cmaj7')
  })

  it('removes chord by id', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    const sId = s.sections[0].id
    const mId = s.sections[0].measures[0].id
    s = addChord(s, sId, mId, 'Am7')
    const chordId = s.sections[0].measures[0].chords[0].id
    s = removeChord(s, chordId)
    expect(s.sections[0].measures[0].chords).toHaveLength(0)
  })
})

describe('parseProgressionText', () => {
  it('splits on spaces', () => {
    expect(parseProgressionText('Cmaj7 Am7 F G')).toEqual(['Cmaj7','Am7','F','G'])
  })
  it('splits on commas', () => {
    expect(parseProgressionText('Cmaj7,Am7,F,G')).toEqual(['Cmaj7','Am7','F','G'])
  })
  it('handles newlines', () => {
    expect(parseProgressionText('Cmaj7\nAm7')).toEqual(['Cmaj7','Am7'])
  })
  it('keeps slash chords intact', () => {
    expect(parseProgressionText('Am/E G/B')).toEqual(['Am/E','G/B'])
  })
  it('filters empty tokens', () => {
    expect(parseProgressionText('  Cmaj7   G  ')).toEqual(['Cmaj7','G'])
  })
})

describe('computeMeasureNumbers', () => {
  it('numbers measures sequentially across sections', () => {
    let s = addSection(createSong(), 'Intro', 'intro')
    s = addMeasure(s, s.sections[0].id)
    s = addSection(s, 'Verse', 'verse')
    const nums = computeMeasureNumbers(s)
    const allIds = s.sections.flatMap(sec => sec.measures.map(m => m.id))
    expect(nums.get(allIds[0])).toBe(1)
    expect(nums.get(allIds[1])).toBe(2)
    expect(nums.get(allIds[2])).toBe(3)
  })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function songWithChords() {
  let s = addSection(createSong(), 'Verse', 'verse')
  const sId = s.sections[0].id
  const mId = s.sections[0].measures[0].id
  s = addChord(s, sId, mId, 'Cmaj7')
  s = addChord(s, sId, mId, 'Am7')
  s = addChord(s, sId, mId, 'F')
  return s
}

// ─── removeSection ────────────────────────────────────────────────────────────

describe('removeSection', () => {
  it('removes section by id', () => {
    let s = addSection(createSong(), 'Intro', 'intro')
    s = addSection(s, 'Verse', 'verse')
    const idToRemove = s.sections[0].id
    s = removeSection(s, idToRemove)
    expect(s.sections).toHaveLength(1)
    expect(s.sections[0].name).toBe('Verse')
  })

  it('returns song unchanged for unknown id', () => {
    let s = addSection(createSong(), 'Intro', 'intro')
    s = removeSection(s, 'no-such-id')
    expect(s.sections).toHaveLength(1)
  })
})

// ─── addMeasure / removeMeasure ───────────────────────────────────────────────

describe('addMeasure', () => {
  it('adds measure to the correct section', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    s = addSection(s, 'Chorus', 'chorus')
    const verseId = s.sections[0].id
    s = addMeasure(s, verseId)
    expect(s.sections[0].measures).toHaveLength(2)
    expect(s.sections[1].measures).toHaveLength(1)
  })
})

describe('removeMeasure', () => {
  it('removes measure by id', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    const sId = s.sections[0].id
    s = addMeasure(s, sId)
    const mIdToRemove = s.sections[0].measures[0].id
    s = removeMeasure(s, sId, mIdToRemove)
    expect(s.sections[0].measures).toHaveLength(1)
  })

  it('does not remove the last measure in a section', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    const sId = s.sections[0].id
    const mId = s.sections[0].measures[0].id
    s = removeMeasure(s, sId, mId)
    expect(s.sections[0].measures).toHaveLength(1)
  })
})

// ─── updateSection ────────────────────────────────────────────────────────────

describe('updateSection', () => {
  it('patches section name', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    s = updateSection(s, s.sections[0].id, { name: 'Bridge' })
    expect(s.sections[0].name).toBe('Bridge')
  })

  it('patches section color', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    s = updateSection(s, s.sections[0].id, { color: 'chorus' })
    expect(s.sections[0].color).toBe('chorus')
  })

  it('leaves other sections unchanged', () => {
    let s = addSection(createSong(), 'Intro', 'intro')
    s = addSection(s, 'Verse', 'verse')
    s = updateSection(s, s.sections[0].id, { name: 'Changed' })
    expect(s.sections[1].name).toBe('Verse')
  })
})

// ─── duplicateSection ─────────────────────────────────────────────────────────

describe('duplicateSection', () => {
  it('inserts copy immediately after original', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    s = addSection(s, 'Chorus', 'chorus')
    const verseId = s.sections[0].id
    s = duplicateSection(s, verseId)
    expect(s.sections).toHaveLength(3)
    expect(s.sections[0].name).toBe('Verse')
    expect(s.sections[1].name).toBe('Verse')
    expect(s.sections[2].name).toBe('Chorus')
  })

  it('assigns new id to duplicated section', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    const origId = s.sections[0].id
    s = duplicateSection(s, origId)
    expect(s.sections[1].id).not.toBe(origId)
  })

  it('deep copies chords with new ids', () => {
    let s = songWithChords()
    const origId = s.sections[0].id
    s = duplicateSection(s, origId)
    const origChords = s.sections[0].measures[0].chords
    const copyChords = s.sections[1].measures[0].chords
    expect(copyChords).toHaveLength(origChords.length)
    expect(copyChords[0].symbol).toBe(origChords[0].symbol)
    expect(copyChords[0].id).not.toBe(origChords[0].id)
  })

  it('returns song unchanged for unknown id', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    s = duplicateSection(s, 'no-such-id')
    expect(s.sections).toHaveLength(1)
  })
})

// ─── insertChordAfter ─────────────────────────────────────────────────────────

describe('insertChordAfter', () => {
  it('inserts after specific chord', () => {
    let s = songWithChords()
    const chords = s.sections[0].measures[0].chords
    const afterId = chords[0].id
    s = insertChordAfter(s, afterId, 'Dm7')
    const updated = s.sections[0].measures[0].chords
    expect(updated[0].symbol).toBe('Cmaj7')
    expect(updated[1].symbol).toBe('Dm7')
    expect(updated[2].symbol).toBe('Am7')
  })

  it('does not insert when afterChordId not found', () => {
    let s = songWithChords()
    const before = s.sections[0].measures[0].chords.length
    s = insertChordAfter(s, 'nonexistent', 'Dm7')
    expect(s.sections[0].measures[0].chords).toHaveLength(before)
  })
})

// ─── updateChord ──────────────────────────────────────────────────────────────

describe('updateChord', () => {
  it('updates chord symbol', () => {
    let s = songWithChords()
    const id = s.sections[0].measures[0].chords[0].id
    s = updateChord(s, id, 'Gmaj7')
    expect(s.sections[0].measures[0].chords[0].symbol).toBe('Gmaj7')
  })

  it('stores provided notes', () => {
    let s = songWithChords()
    const id = s.sections[0].measures[0].chords[0].id
    s = updateChord(s, id, 'Gmaj7', ['G3', 'B3', 'D4', 'F#4'])
    expect(s.sections[0].measures[0].chords[0].notes).toEqual(['G3', 'B3', 'D4', 'F#4'])
  })

  it('clears notes when none provided', () => {
    let s = songWithChords()
    const id = s.sections[0].measures[0].chords[0].id
    s = updateChord(s, id, 'Gmaj7', ['G3'])
    s = updateChord(s, id, 'Am7')
    expect(s.sections[0].measures[0].chords[0].notes).toBeUndefined()
  })
})

// ─── duplicateChord ───────────────────────────────────────────────────────────

describe('duplicateChord', () => {
  it('inserts copy after original', () => {
    let s = songWithChords()
    const id = s.sections[0].measures[0].chords[0].id
    s = duplicateChord(s, id)
    const chords = s.sections[0].measures[0].chords
    expect(chords[0].symbol).toBe('Cmaj7')
    expect(chords[1].symbol).toBe('Cmaj7')
    expect(chords[1].id).not.toBe(id)
  })

  it('total chord count increases by one', () => {
    let s = songWithChords()
    const id = s.sections[0].measures[0].chords[0].id
    const before = s.sections[0].measures[0].chords.length
    s = duplicateChord(s, id)
    expect(s.sections[0].measures[0].chords).toHaveLength(before + 1)
  })
})

// ─── moveChordToPosition ──────────────────────────────────────────────────────

describe('moveChordToPosition', () => {
  it('moves chord from one measure to another', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    const sId = s.sections[0].id
    s = addMeasure(s, sId)
    const m1Id = s.sections[0].measures[0].id
    const m2Id = s.sections[0].measures[1].id
    s = addChord(s, sId, m1Id, 'Cmaj7')
    s = addChord(s, sId, m1Id, 'Am7')
    const chordId = s.sections[0].measures[0].chords[0].id
    s = moveChordToPosition(s, chordId, sId, m2Id)
    expect(s.sections[0].measures[0].chords).toHaveLength(1)
    expect(s.sections[0].measures[1].chords).toHaveLength(1)
    expect(s.sections[0].measures[1].chords[0].symbol).toBe('Cmaj7')
  })
})

// ─── reorderSections ─────────────────────────────────────────────────────────

describe('reorderSections', () => {
  it('moves section before target', () => {
    let s = addSection(createSong(), 'A', 'intro')
    s = addSection(s, 'B', 'verse')
    s = addSection(s, 'C', 'chorus')
    const cId = s.sections[2].id
    const bId = s.sections[1].id
    s = reorderSections(s, cId, bId, true)
    expect(s.sections.map(x => x.name)).toEqual(['A', 'C', 'B'])
  })

  it('moves section after target', () => {
    let s = addSection(createSong(), 'A', 'intro')
    s = addSection(s, 'B', 'verse')
    s = addSection(s, 'C', 'chorus')
    const aId = s.sections[0].id
    const bId = s.sections[1].id
    s = reorderSections(s, aId, bId, false)
    expect(s.sections.map(x => x.name)).toEqual(['B', 'A', 'C'])
  })
})

// ─── reorderChordInMeasure ────────────────────────────────────────────────────

describe('reorderChordInMeasure', () => {
  it('moves chord before target', () => {
    let s = songWithChords() // Cmaj7 Am7 F
    const chords = s.sections[0].measures[0].chords
    const fId = chords[2].id
    const am7Id = chords[1].id
    s = reorderChordInMeasure(s, fId, am7Id, true)
    const updated = s.sections[0].measures[0].chords
    expect(updated.map(c => c.symbol)).toEqual(['Cmaj7', 'F', 'Am7'])
  })

  it('moves chord after target', () => {
    let s = songWithChords() // Cmaj7 Am7 F
    const chords = s.sections[0].measures[0].chords
    const cmaj7Id = chords[0].id
    const am7Id = chords[1].id
    s = reorderChordInMeasure(s, cmaj7Id, am7Id, false)
    const updated = s.sections[0].measures[0].chords
    expect(updated.map(c => c.symbol)).toEqual(['Am7', 'Cmaj7', 'F'])
  })
})

// ─── transposeSong ────────────────────────────────────────────────────────────

describe('transposeSong', () => {
  it('transposes chord root up by semitones', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    const sId = s.sections[0].id
    const mId = s.sections[0].measures[0].id
    s = addChord(s, sId, mId, 'Cmaj7')
    s = transposeSong(s, 2)
    expect(s.sections[0].measures[0].chords[0].symbol).toBe('Dmaj7')
  })

  it('transposes multiple chords', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    const sId = s.sections[0].id
    const mId = s.sections[0].measures[0].id
    s = addChord(s, sId, mId, 'Cmaj7')
    s = addChord(s, sId, mId, 'Am7')
    s = transposeSong(s, 2)
    const chords = s.sections[0].measures[0].chords
    expect(chords[0].symbol).toBe('Dmaj7')
    expect(chords[1].symbol).toBe('Bm7')
  })

  it('uses flats for flat target keys', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    const sId = s.sections[0].id
    const mId = s.sections[0].measures[0].id
    s = addChord(s, sId, mId, 'Cmaj7')
    s = transposeSong(s, 1, 'Db Major')
    expect(s.sections[0].measures[0].chords[0].symbol).toBe('Dbmaj7')
  })

  it('uses sharps for sharp target keys', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    const sId = s.sections[0].id
    const mId = s.sections[0].measures[0].id
    s = addChord(s, sId, mId, 'Cmaj7')
    s = transposeSong(s, 1, 'D Major')
    expect(s.sections[0].measures[0].chords[0].symbol).toBe('C#maj7')
  })

  it('transposes slash chord bass note too', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    const sId = s.sections[0].id
    const mId = s.sections[0].measures[0].id
    s = addChord(s, sId, mId, 'C/G')
    s = transposeSong(s, 2)
    expect(s.sections[0].measures[0].chords[0].symbol).toBe('D/A')
  })
})

// ─── computeDegree ────────────────────────────────────────────────────────────

describe('computeDegree', () => {
  it('returns — when no key provided', () => {
    expect(computeDegree('Cmaj7', null)).toBe('—')
  })

  it('returns roman from UMT when key provided', () => {
    expect(computeDegree('Cmaj7', 'C Major')).toBe('I△7')
  })
})

// ─── isBorrowedChord ─────────────────────────────────────────────────────────

describe('isBorrowedChord', () => {
  it('returns false when no key provided', () => {
    expect(isBorrowedChord('Cmaj7', null)).toBe(false)
  })

  it('returns false for diatonic chord', () => {
    expect(isBorrowedChord('Cmaj7', 'C Major')).toBe(false)
  })
})
