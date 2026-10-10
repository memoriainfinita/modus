import { describe, it, expect } from 'vitest'
import {
  ANALYSIS_FIELD_KEYS,
  ANALYSIS_FIELD_LABELS,
  ANALYSIS_FIELD_TOOLTIPS,
} from '../src/detector/analysis-panel'

describe('ANALYSIS_FIELD_KEYS', () => {
  it('contains exactly 8 keys', () => {
    expect(ANALYSIS_FIELD_KEYS).toHaveLength(8)
  })

  it('contains all expected field identifiers', () => {
    const expected = ['roman','function','figbass','diatonic','scales','cadence','secondary','subs']
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
