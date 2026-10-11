import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/audio/audio', () => ({ playChord: vi.fn(), playNoteNames: vi.fn() }))

import { analyzeChordProgression } from '../src/detector/analyzer'

const progressionCadences = (chords: string[], key: string | null) => analyzeChordProgression(chords, key).map(s => s.cadence)
import { addEntry, clearHistory, renderHistory, setHistoryChangeCallback, shortCadence } from '../src/history/history'

describe('progressionCadences', () => {
  it('cadence from each chord to the next, in playing order', () => {
    expect(progressionCadences(['F', 'G7', 'C', 'Am'], 'C Major')).toEqual([
      'Half Cadence (-> V)', 'Authentic Cadence (V -> I)', null, null,
    ])
  })

  it('minor key: deceptive to VI', () => {
    expect(progressionCadences(['E7', 'F'], 'A Minor')[0]).toBe('Deceptive Cadence (V -> VI)')
  })

  it('none without a key or a second chord', () => {
    expect(progressionCadences(['G7', 'C'], null)).toEqual([null, null])
    expect(progressionCadences(['G7'], 'C Major')).toEqual([null])
  })

  it('an unreadable symbol only breaks its own pairs', () => {
    expect(progressionCadences(['?', 'G7', 'C'], 'C Major')).toEqual([null, 'Authentic Cadence (V -> I)', null])
  })
})

describe('analyzeChordProgression: modulations', () => {
  const keys = (chords: string, key: string) => analyzeChordProgression(chords.split(' '), key).map(s => s.key)
  const romans = (chords: string, key: string) => analyzeChordProgression(chords.split(' '), key).map(s => s.info?.roman)

  it('a modulation by pivot: the chords after it are read in the new key', () => {
    const k = keys('C F G C Am D7 G Em Am D7 G', 'C Major')
    expect(k.slice(0, 5).every(x => x === 'C Major')).toBe(true)
    expect(k.slice(5).every(x => x === 'G Major')).toBe(true)
    expect(romans('C F G C Am D7 G Em Am D7 G', 'C Major').slice(5)).toEqual(['V7', 'I', 'vi', 'ii', 'V7', 'I'])
  })

  it('to the relative minor', () => {
    expect(keys('C F G C Am Dm E7 Am Dm E7 Am', 'C Major')[6]).toBe('A Minor')
  })

  it('two chords out of the key are a tonicization, not a modulation', () => {
    expect(new Set(keys('C Am Dm G7 C E7 Am D7 G', 'C Major'))).toEqual(new Set(['C Major']))
  })

  it('the cadence is read in the key of the chord it reaches', () => {
    const steps = analyzeChordProgression('C F G C Am D7 G Em Am D7 G'.split(' '), 'C Major')
    expect(steps[9].cadence).toBe('Authentic Cadence (V -> I)')
  })

  it('the numeral follows the letter written: Gb in C is bV, F# is #IV', () => {
    expect(romans('Gb', 'C Major')).toEqual(['bV'])
    expect(romans('F#', 'C Major')).toEqual(['#IV'])
  })
})

describe('shortCadence', () => {
  it('keeps the name, drops "Cadence" and the numerals', () => {
    expect(shortCadence('Authentic Cadence (V -> I)')).toBe('Authentic')
    expect(shortCadence('Phrygian Half Cadence (iv -> V)')).toBe('Phrygian Half')
    expect(shortCadence('Tritone Sub Resolution (subV7 -> I)')).toBe('Tritone Sub')
    expect(shortCadence('Picardy Third (i -> I)')).toBe('Picardy Third')
  })
})

describe('history strip cadences', () => {
  beforeEach(() => { clearHistory(); setHistoryChangeCallback(() => {}) })

  const render = (key: string | null) => {
    const el = document.createElement('div')
    renderHistory(el, key, () => {}, null)
    return [...el.querySelector('.history-strip')!.children].map(c =>
      c.classList.contains('history-cadence') ? `[${c.textContent}]` : c.querySelector('.history-chip-symbol')!.textContent)
  }

  it('a tag between the two chips, newest on the left', () => {
    for (const s of ['F', 'G7', 'C']) addEntry(s, [])
    expect(render('C Major')).toEqual(['C', '[Authentic]', 'G7', '[Half]', 'F'])
  })

  it('marks where the key changes, next to the first chord in the new key, and reads it there', () => {
    for (const s of 'C F G C Am D7 G Em'.split(' ')) addEntry(s, [])
    const el = document.createElement('div')
    renderHistory(el, 'C Major', () => {}, null)
    const items = [...el.querySelector('.history-strip')!.children].map(c =>
      c.classList.contains('history-modulation') ? `<${c.textContent}>` :
      c.classList.contains('history-cadence') ? null : c.querySelector('.history-chip-roman')!.textContent).filter(Boolean)
    expect(items).toEqual(['vi', 'I', 'V7', '<→ G Major>', 'vi', 'I', 'V', 'IV', 'I'])
  })

  it('no tags without a key', () => {
    for (const s of ['G7', 'C']) addEntry(s, [])
    expect(render(null)).toEqual(['C', 'G7'])
  })
})
