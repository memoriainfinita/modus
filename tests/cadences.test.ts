import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/audio/audio', () => ({ playChord: vi.fn(), playNoteNames: vi.fn() }))

import { progressionCadences } from '../src/detector/analyzer'
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

  it('no tags without a key', () => {
    for (const s of ['G7', 'C']) addEntry(s, [])
    expect(render(null)).toEqual(['C', 'G7'])
  })
})
