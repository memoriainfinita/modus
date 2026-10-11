import { describe, it, expect, afterEach } from 'vitest'
import { en } from '../src/i18n/en'
import { es } from '../src/i18n/es'
import { t, useLang, noteLabel, chordLabel, keyLabel, scaleLabel } from '../src/i18n/i18n'
import { readTypedChord } from '../src/theory/chord'
import { analyzeNotes, describeVoicing } from '../src/detector/analyzer'
import { detectForm, createSong, isBlankSong } from '../src/song/model'

afterEach(() => useLang('en'))

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

describe('string tables', () => {
  it('Spanish has every English key, none empty', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort())
    for (const [k, v] of Object.entries(es)) expect(v, k).toBeTruthy()
  })

  it('each Spanish string fills the same values as the English one', () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(es[k]), k).toEqual(placeholders(en[k]))
    }
  })
})

describe('t', () => {
  it('fills values and follows the language', () => {
    expect(t('history.cleared', { n: 3 })).toBe('History cleared (3)')
    useLang('es')
    expect(t('history.cleared', { n: 3 })).toBe('Historial borrado (3)')
  })
})

describe('note, chord and key names', () => {
  it('letters pass unchanged', () => {
    expect(noteLabel('F#4')).toBe('F#4')
    expect(chordLabel('Bbm7/D')).toBe('Bbm7/D')
    expect(keyLabel('C Major')).toBe('C Major')
  })

  it('solfège names notes, chord roots and slash basses', () => {
    useLang('es', 'solfege')
    expect(noteLabel('F#4')).toBe('Fa#4')
    expect(noteLabel('B')).toBe('Si')
    expect(chordLabel('Bbm7/D')).toBe('Sibm7/Re')
    expect(chordLabel('?')).toBe('?')
    expect(keyLabel('A Minor')).toBe('La menor')
    expect(scaleLabel('D dorian')).toBe('Re dorian')
  })

  it('Spanish with letters keeps C D E and translates the mode', () => {
    useLang('es', 'letters')
    expect(chordLabel('Am7')).toBe('Am7')
    expect(keyLabel('G Major')).toBe('G mayor')
  })

  it('leaves what is not a note alone', () => {
    useLang('es', 'solfege')
    expect(noteLabel('V7/V')).toBe('V7/V')
  })
})

describe('readTypedChord', () => {
  it('reads chords typed in Do Re Mi as letters', () => {
    expect(readTypedChord('Lam7')).toBe('Am7')
    expect(readTypedChord('Sib/Re')).toBe('Bb/D')
    expect(readTypedChord(' Do ')).toBe('C')
    expect(readTypedChord('Do7')).toBe('C7')   // UMT alone reads D°7
  })

  it('keeps chords already in letters, even when they start like a syllable', () => {
    expect(readTypedChord('Fadd9')).toBe('Fadd9')
    expect(readTypedChord('Am7')).toBe('Am7')
  })

  it('returns unknown text as typed', () => {
    expect(readTypedChord('xyz')).toBe('xyz')
  })
})

describe('analysis text in Spanish', () => {
  it('names intervals', () => {
    useLang('es')
    const r = analyzeNotes([60, 67])
    expect(r?.kind === 'interval' && r.intervalName).toBe('5ª justa')
    expect(r?.kind === 'interval' && r.inversionName).toBe('4ª justa')
  })

  it('describes the voicing', () => {
    useLang('es')
    const v = describeVoicing(['E3', 'C4', 'G4'], UMT.parseChordSymbol('C'))
    expect(v).toContain('1.ª inversión')
  })

  it('names the song form', () => {
    useLang('es')
    expect(detectForm(['Estrofa', 'Estribillo'])).toBe('Estrofa-estribillo (AB)')
  })

  it('a new song is untitled in its language, and blank in any', () => {
    useLang('es')
    const song = createSong()
    expect(song.title).toBe('Sin título')
    expect(isBlankSong(song)).toBe(true)
    useLang('en')
    expect(isBlankSong(song)).toBe(true)
  })
})
