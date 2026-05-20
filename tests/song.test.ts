import { describe, it, expect } from 'vitest'
import {
  createSong, addSection, addMeasure, addChord,
  removeChord, removeSection, transposeSong,
  parseProgressionText, computeMeasureNumbers, duplicateSection
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
  Harmony: { analyzeProgression: () => ({ analysis: [], modulations: [], harmonicRhythm: 0 }) },
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
