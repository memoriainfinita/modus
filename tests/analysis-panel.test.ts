import { describe, it, expect, vi } from 'vitest'

;(globalThis as any).UMT = {
  parseChordSymbol: vi.fn((s: string) => ({
    quality: 'major seventh',
    name: s,
    getNotes: () => [{ _name: 'C4' }],
  })),
}

import {
  ANALYSIS_FIELD_KEYS,
  ANALYSIS_FIELD_LABELS,
  ANALYSIS_FIELD_TOOLTIPS,
  getChordQuality,
} from '../src/analysis-panel'

describe('ANALYSIS_FIELD_KEYS', () => {
  it('contains exactly 10 keys', () => {
    expect(ANALYSIS_FIELD_KEYS).toHaveLength(10)
  })

  it('contains all expected field identifiers', () => {
    const expected = ['roman','function','figbass','diatonic','scales','cadence','secondary','coltrane','negharm','subs']
    for (const key of expected) {
      expect(ANALYSIS_FIELD_KEYS).toContain(key)
    }
  })
})

describe('ANALYSIS_FIELD_LABELS', () => {
  it('has a non-empty label for every field key', () => {
    for (const key of ANALYSIS_FIELD_KEYS) {
      expect(ANALYSIS_FIELD_LABELS[key]).toBeTruthy()
    }
  })
})

describe('ANALYSIS_FIELD_TOOLTIPS', () => {
  it('has a non-empty tooltip for every field key', () => {
    for (const key of ANALYSIS_FIELD_KEYS) {
      expect(ANALYSIS_FIELD_TOOLTIPS[key]).toBeTruthy()
    }
  })
})

describe('getChordQuality', () => {
  it('returns lowercase quality from UMT', () => {
    expect(getChordQuality('Cmaj7')).toBe('major seventh')
  })

  it('returns empty string when UMT throws', () => {
    ;(globalThis as any).UMT.parseChordSymbol.mockImplementationOnce(() => {
      throw new Error('parse error')
    })
    expect(getChordQuality('???')).toBe('')
  })

  it('returns empty string when quality is null', () => {
    ;(globalThis as any).UMT.parseChordSymbol.mockImplementationOnce((s: string) => ({
      quality: null,
      name: s,
    }))
    expect(getChordQuality('Csus')).toBe('')
  })
})
