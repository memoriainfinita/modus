import { describe, it, expect } from 'vitest'
import { spellDetection, spellChordSymbol, spellVoicing } from '../src/theory/spelling'
import { analyzeNotes } from '../src/detector/analyzer'
import { noteNameToMidi, pitchClassOf, nameAtMidi } from '../src/theory/notes'
import { chordNoteNames } from '../src/theory/chord'
import { buildStaffAbc } from '../src/diagrams/staff'

// Runs against the real UMT bundle (tests/setup-umt.ts).

describe('note names with any accidentals', () => {
  it('MIDI numbers follow the letter octave', () => {
    expect(noteNameToMidi('B#3')).toBe(60)
    expect(noteNameToMidi('Cb4')).toBe(59)
    expect(noteNameToMidi('F##4')).toBe(67)
    expect(pitchClassOf('E#')).toBe(5)
    expect(nameAtMidi('B#', 60)).toBe('B#3')
    expect(nameAtMidi('G#', 67)).toBeNull()
  })
})

describe('spellDetection', () => {
  const detect = (midi: number[], key: string | null) => spellDetection(analyzeNotes(midi), key)

  it('a chord from MIDI is written in the key: G#m in E major, not Abm', () => {
    const d = detect([68, 71, 75], 'E Major')   // MIDI spells it Ab4 B4 Eb5
    expect(d?.kind === 'chord' && d.candidates[0]).toBe('G#m')
    expect(d?.kind === 'chord' && d.notes).toEqual(['G#4', 'B4', 'D#5'])
  })

  it('the same pitches stay flat in a flat key', () => {
    const d = detect([68, 72, 75], 'C Minor')
    expect(d?.kind === 'chord' && d.candidates[0]).toBe('Ab')
  })

  it('single notes and intervals follow the key', () => {
    const n = detect([68], 'A Major')
    expect(n?.kind === 'note' && [n.noteName, n.pitchClass]).toEqual(['G#4', 'G#'])
    const i = detect([66, 70], 'B Major')
    expect(i?.kind === 'interval' && i.notes).toEqual(['F#4', 'A#4'])
  })

  it('without a key, MIDI input keeps its flats', () => {
    const d = detect([68, 71, 75], null)
    expect(d?.kind === 'chord' && d.notes).toEqual(['Ab4', 'B4', 'Eb5'])
  })
})

describe('chord spelling', () => {
  it('a symbol is respelled by the key; unknown symbols are left alone', () => {
    expect(spellChordSymbol('Ab7', 'A Major')).toBe('G#7')
    expect(spellChordSymbol('?', 'A Major')).toBe('?')
    expect(spellChordSymbol('Ab7', null)).toBe('Ab7')
  })

  it('a voicing is named as tones of the chord', () => {
    expect(spellVoicing(['C4', 'Eb4', 'F#4', 'Bb4'], 'Cm7b5', null)).toEqual(['C4', 'Eb4', 'Gb4', 'Bb4'])
  })

  it('chord notes from a symbol are named by interval', () => {
    expect(chordNoteNames('Cm7b5')).toEqual(['C4', 'Eb4', 'Gb4', 'Bb4'])
  })
})

describe('staff with double accidentals', () => {
  it('writes ^^ and __ in ABC', () => {
    const abc = buildStaffAbc(['F##4', 'Bbb4'], null)
    expect(abc).toContain('^^F')
    expect(abc).toContain('__B')
  })
})
