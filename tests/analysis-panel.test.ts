import { describe, it, expect, afterEach } from 'vitest'
import { ANALYSIS_FIELD_KEYS, fieldLabel, fieldTooltip } from '../src/detector/analysis-panel'
import { useLang, LANGS } from '../src/i18n/i18n'

describe('ANALYSIS_FIELD_KEYS', () => {
  it('contains exactly 15 keys', () => {
    expect(ANALYSIS_FIELD_KEYS).toHaveLength(15)
  })

  it('contains all expected field identifiers', () => {
    const expected = ['roman','function','figbass','voicing','diatonic','scales','fits','cadence','plr','secondary','subs','upper','forte']
    for (const key of expected) {
      expect(ANALYSIS_FIELD_KEYS).toContain(key)
    }
  })
})

describe('field labels and tooltips', () => {
  afterEach(() => useLang('en'))

  for (const lang of LANGS) {
    it(`has a label and a tooltip for every field in ${lang}`, () => {
      useLang(lang)
      for (const key of ANALYSIS_FIELD_KEYS) {
        expect(fieldLabel(key)).toBeTruthy()
        expect(fieldLabel(key)).not.toContain('field.')
        expect(fieldTooltip(key).length).toBeGreaterThan(fieldLabel(key).length)
      }
    })
  }
})
