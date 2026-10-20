import { describe, it, expect, afterEach } from 'vitest'
import { explainDetection, explainCadence } from '../src/detector/explain'
import { buildHarmonicAnalysis } from '../src/detector/analyzer'
import { useLang } from '../src/i18n/i18n'
import type { ChordResult } from '../src/types'
import { setPref } from '../src/settings/prefs'

// Runs against the real UMT bundle (tests/setup-umt.ts).

const chord = (symbol: string, notes: string[]): ChordResult => ({ kind: 'chord', notes, candidates: [symbol], selectedIndex: 0 })
const explain = (symbol: string, key: string, notes: string[], prev: string | null = null, prevNotes: string[] | null = null) =>
  explainDetection(chord(symbol, notes), buildHarmonicAnalysis(symbol, key, prev, notes, prevNotes), key, prev)
const text = (items: { term: string; text: string }[]) => items.map(i => `${i.term}: ${i.text}`).join('\n')

afterEach(() => useLang('en'))

describe('explainDetection', () => {
  it('names the degree and the function of a diatonic chord', () => {
    const out = text(explain('G7', 'C Major', ['G3', 'B3', 'D4', 'F4']))
    expect(out).toContain('G7 is V7 in C Major: the chord on the 5th degree, the dominant.')
    expect(out).toContain('Dominant function')
    expect(out).toContain('Diatonic: every note of G7 is in the scale of C Major.')
  })

  it('movable do, when asked for: the root\'s syllable in the key (G in G major is do; E in A minor, la-based, is mi)', () => {
    setPref('movable-do', true)
    try {
      expect(text(explain('G', 'G Major', ['G3', 'B3', 'D4']))).toContain('In movable do: do.')
      expect(text(explain('E7', 'A Minor', ['E3', 'G#3', 'B3', 'D4']))).toContain('In movable do: mi.')
    } finally { setPref('movable-do', false) }
  })

  it('a secondary dominant names the chord it tonicizes', () => {
    expect(text(explain('D7', 'C Major', ['D3', 'F#3', 'A3', 'C4']))).toContain('D7 is V7/V: a secondary dominant, the dominant of G (V).')
  })

  it('a secondary leading-tone chord too', () => {
    expect(text(explain('F#dim7', 'C Major', ['F#3', 'A3', 'C4', 'Eb4']))).toContain('the vii° of G (V)')
  })

  it('a borrowed chord names its mode and the notes from outside the key', () => {
    const out = text(explain('Fm', 'C Major', ['F3', 'Ab3', 'C4']))
    expect(out).toContain('Fm is borrowed from C minor (modal interchange)')
    expect(out).toContain('(Ab)')
  })

  it('a lowered degree is said to be outside the scale; the subtonic of a minor key is named', () => {
    expect(text(explain('Bb', 'C Major', ['Bb2', 'D3', 'F3']))).toContain('on the lowered 7th degree (♭7), a note outside the scale')
    expect(text(explain('G', 'A Minor', ['G2', 'B2', 'D3']))).toContain('the 7th degree, the subtonic')
  })

  it('a tritone substitute is explained as one', () => {
    expect(text(explain('Db7', 'C Major', ['Db3', 'F3', 'Ab3', 'Cb4']))).toContain('tritone substitute for the dominant')
  })

  it('the cadence from the chord before, the inversion, P/L/R and substitution types', () => {
    // The detector names E G C as C/E: the figures come from the symbol
    const out = text(explain('C/E', 'C Major', ['E3', 'G3', 'C4'], 'G', ['D3', 'G3', 'B3']))
    expect(out).toContain('From the dominant to the tonic, the strongest close')
    expect(out).toContain('First inversion: the third in the bass')
    expect(out).toMatch(/comes from G by /)
    expect(out).toContain('vi or iii for I')
  })

  it('a broken voice-leading rule is explained', () => {
    const out = text(explain('Dm', 'C Major', ['D3', 'A3', 'D4', 'F4'], 'C', ['C3', 'G3', 'C4', 'E4']))
    expect(out).toContain('parallel fifths: Two voices a fifth apart move to another fifth')
  })

  it('an interval gives its size and its inversion', () => {
    const out = explainDetection({ kind: 'interval', notes: ['C4', 'E4'], intervalName: 'Major 3rd', semitones: 4, inversionName: 'Minor 6th' }, null, null, null)
    expect(text(out)).toBe('Major 3rd: 4 semitones. Its inversion, with the lower note an octave up, is a Minor 6th: together they make an octave.')
  })

  it('nothing for a single note or nothing on screen', () => {
    expect(explainDetection(null, null, 'C Major', null)).toEqual([])
    expect(explainDetection({ kind: 'note', noteName: 'C4', midiNumber: 60, pitchClass: 'C' }, null, 'C Major', null)).toEqual([])
  })

  it('in Spanish, with Do Re Mi', () => {
    useLang('es')
    const out = text(explain('D7', 'C Major', ['D3', 'F#3', 'A3', 'C4']))
    expect(out).toContain('Re7 es V7/V: dominante secundaria, la dominante de Sol (V).')
  })
})

describe('explainCadence', () => {
  it('knows every cadence UMT names', () => {
    for (const c of ['Authentic Cadence (V -> I)', 'Plagal Cadence (IV -> I)', 'Minor Plagal Cadence (iv -> i)', 'Deceptive Cadence (V -> vi)',
      'Half Cadence (-> V)', 'Phrygian Half Cadence (iv -> V)', 'Phrygian Cadence (bII -> I)', 'Backdoor Cadence (bVII7 -> I)', 'Picardy Third (i -> I)']) {
      expect(explainCadence(c), c).toBeTruthy()
    }
    expect(explainCadence('Phrygian Half Cadence (iv -> V)')).toContain('iv in first inversion')
    expect(explainCadence('Half Cadence (-> V)')).toContain('stops on the dominant')
  })
})
