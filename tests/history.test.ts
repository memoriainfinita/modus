// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../src/audio/audio', () => ({
  playChord: vi.fn(),
  playNoteNames: vi.fn(),
}))
vi.mock('../src/detector/analyzer', () => ({
  romanInKey: vi.fn(() => null),
  analyzeChordProgression: vi.fn((chords: string[], key: string | null) => chords.map(() => ({ key, info: null, cadence: null }))),
}))

import {
  getEntries, addEntry, removeEntry, clearHistory,
  notifyChordDetected, setHistoryChangeCallback, clearHistoryWithUndo, restoreEntries
} from '../src/history/history'

beforeEach(() => {
  clearHistory()
  setHistoryChangeCallback(() => {})
})

describe('getEntries', () => {
  it('returns empty array initially', () => {
    expect(getEntries()).toEqual([])
  })
})

describe('addEntry', () => {
  it('prepends new entry to front', () => {
    addEntry('Cmaj7', ['C4', 'E4', 'G4', 'B4'])
    addEntry('Am7', ['A3', 'C4', 'E4', 'G4'])
    const entries = getEntries()
    expect(entries[0].symbol).toBe('Am7')
    expect(entries[1].symbol).toBe('Cmaj7')
  })

  it('stores notes with entry', () => {
    addEntry('Gmaj7', ['G3', 'B3', 'D4', 'F#4'])
    expect(getEntries()[0].notes).toEqual(['G3', 'B3', 'D4', 'F#4'])
  })

  it('assigns unique id to each entry', () => {
    addEntry('C', [])
    addEntry('G', [])
    const entries = getEntries()
    expect(entries[0].id).toBeTruthy()
    expect(entries[0].id).not.toBe(entries[1].id)
  })

  it('caps at 200 entries', () => {
    for (let i = 0; i < 210; i++) addEntry(`chord${i}`, [])
    expect(getEntries()).toHaveLength(200)
  })
})

describe('removeEntry', () => {
  it('removes entry by id', () => {
    addEntry('Cmaj7', [])
    addEntry('Am7', [])
    const id = getEntries()[1].id
    removeEntry(id)
    expect(getEntries()).toHaveLength(1)
    expect(getEntries()[0].symbol).toBe('Am7')
  })

  it('ignores unknown id', () => {
    addEntry('Cmaj7', [])
    removeEntry('nonexistent-id')
    expect(getEntries()).toHaveLength(1)
  })
})

describe('clearHistory', () => {
  it('removes all entries', () => {
    addEntry('C', [])
    addEntry('G', [])
    clearHistory()
    expect(getEntries()).toHaveLength(0)
  })
})

describe('setHistoryChangeCallback', () => {
  it('fires on addEntry with updated entries', () => {
    const cb = vi.fn()
    setHistoryChangeCallback(cb)
    addEntry('Cmaj7', ['C4'])
    expect(cb).toHaveBeenCalledOnce()
    expect(cb).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ symbol: 'Cmaj7' })])
    )
  })

  it('fires on removeEntry', () => {
    addEntry('Cmaj7', [])
    const id = getEntries()[0].id
    const cb = vi.fn()
    setHistoryChangeCallback(cb)
    removeEntry(id)
    expect(cb).toHaveBeenCalledWith([])
  })

  it('fires on clearHistory', () => {
    addEntry('C', [])
    const cb = vi.fn()
    setHistoryChangeCallback(cb)
    clearHistory()
    expect(cb).toHaveBeenCalledWith([])
  })
})

describe('notifyChordDetected', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds entry after 800ms debounce', () => {
    notifyChordDetected('Cmaj7', ['C4', 'E4', 'G4', 'B4'])
    expect(getEntries()).toHaveLength(0)
    vi.advanceTimersByTime(800)
    expect(getEntries()).toHaveLength(1)
    expect(getEntries()[0].symbol).toBe('Cmaj7')
  })

  it('does not fire before 800ms', () => {
    notifyChordDetected('Cmaj7', [])
    vi.advanceTimersByTime(799)
    expect(getEntries()).toHaveLength(0)
  })

  it('debounces: rapid calls only fire the last one', () => {
    notifyChordDetected('Cmaj7', [])
    vi.advanceTimersByTime(400)
    notifyChordDetected('Am7', [])
    vi.advanceTimersByTime(800)
    expect(getEntries()).toHaveLength(1)
    expect(getEntries()[0].symbol).toBe('Am7')
  })

  it('does not add unknown chord sentinel (?)', () => {
    notifyChordDetected('?', [])
    vi.advanceTimersByTime(800)
    expect(getEntries()).toHaveLength(0)
  })

  it('does not add same chord twice in a row', () => {
    notifyChordDetected('Cmaj7', [])
    vi.advanceTimersByTime(800)
    notifyChordDetected('Cmaj7', [])
    vi.advanceTimersByTime(800)
    expect(getEntries()).toHaveLength(1)
  })

  it('adds different chord after same', () => {
    notifyChordDetected('Cmaj7', [])
    vi.advanceTimersByTime(800)
    notifyChordDetected('Am7', [])
    vi.advanceTimersByTime(800)
    expect(getEntries()).toHaveLength(2)
  })

  it('after removing the newest entry, the same chord can be logged again', () => {
    notifyChordDetected('Cmaj7', [])
    vi.advanceTimersByTime(800)
    removeEntry(getEntries()[0].id)
    notifyChordDetected('Cmaj7', [])
    vi.advanceTimersByTime(800)
    expect(getEntries().map(e => e.symbol)).toEqual(['Cmaj7'])
  })

  it('after removing an entry, dedup compares against the newest remaining one', () => {
    notifyChordDetected('Am7', [])
    vi.advanceTimersByTime(800)
    notifyChordDetected('Cmaj7', [])
    vi.advanceTimersByTime(800)
    removeEntry(getEntries()[0].id)   // removes Cmaj7, newest is now Am7
    notifyChordDetected('Am7', [])
    vi.advanceTimersByTime(800)
    expect(getEntries().map(e => e.symbol)).toEqual(['Am7'])
  })

  it('after clearHistory, same chord can be appended again', () => {
    notifyChordDetected('Cmaj7', [])
    vi.advanceTimersByTime(800)
    clearHistory()
    notifyChordDetected('Cmaj7', [])
    vi.advanceTimersByTime(800)
    expect(getEntries()).toHaveLength(1)
  })
})

describe('clear with undo', () => {
  it('clears at once and Undo puts the entries back', () => {
    addEntry('C', [])
    addEntry('G', [])
    clearHistoryWithUndo()
    expect(getEntries()).toHaveLength(0)
    ;(document.querySelector('.undo-btn') as HTMLButtonElement).click()
    expect(getEntries().map(e => e.symbol)).toEqual(['G', 'C'])
    expect(document.querySelector('.undo-toast')).toBeNull()
  })

  it('restoreEntries re-arms dedup against the newest restored entry', () => {
    vi.useFakeTimers()
    restoreEntries([{ id: '1', symbol: 'Am', notes: [] }])
    notifyChordDetected('Am', [])
    vi.advanceTimersByTime(800)
    expect(getEntries()).toHaveLength(1)
    vi.useRealTimers()
  })
})
