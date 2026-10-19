// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { getPref, setPref, resetPref, isDefault, clearPrefCache, PREFS } from '../src/settings/prefs'
import { keysOf, actionFor, keyName, assignKey, conflictFor, setKeys, resetAllKeys, reloadBindings, removeKey, MAX_KEYS } from '../src/input/bindings'
import { isDataKey, readSettingsFile, formatPrefValue } from '../src/ui/settings'
import { en } from '../src/i18n/en'
import { es } from '../src/i18n/es'

beforeEach(() => { localStorage.clear(); clearPrefCache(); reloadBindings() })

describe('preferences', () => {
  it('a default until set; kept, and read back after a reload', () => {
    expect(getPref('history-hold-ms')).toBe(800)
    setPref('history-hold-ms', 1200)
    expect(getPref('history-hold-ms')).toBe(1200)
    clearPrefCache()
    expect(getPref('history-hold-ms')).toBe(1200)
    expect(isDefault('history-hold-ms')).toBe(false)
    resetPref('history-hold-ms')
    expect(getPref('history-hold-ms')).toBe(800)
  })

  it('a value out of range or unknown is refused, and a stored one falls back', () => {
    setPref('history-hold-ms', 99999)
    expect(getPref('history-hold-ms')).toBe(800)
    setPref('chord-style', 'fancy' as never)
    expect(getPref('chord-style')).toBe('standard')
    localStorage.setItem('pref-a4-hz', '"loud"')
    clearPrefCache()
    expect(getPref('a4-hz')).toBe(440)
  })

  it('every preference and option has its text in both languages', () => {
    for (const [name, def] of Object.entries(PREFS)) {
      for (const table of [en, es] as Record<string, string>[]) {
        expect(table[`pref.${name}`], name).toBeTruthy()
        expect(table[`pref.${name}.hint`], name).toBeTruthy()
        if (def.kind === 'choice') for (const o of def.options) expect(table[`pref.${name}.${o}`], `${name}.${o}`).toBeTruthy()
      }
    }
  })
})

describe('shortcuts', () => {
  it('the factory keys run their actions', () => {
    expect(actionFor(keyName({ key: ' ' }))).toBe('play')
    expect(actionFor(keyName({ key: 'h' }))).toBe('hold')
    expect(actionFor('ArrowLeft')).toBe('stepPrev')
    expect(actionFor(',')).toBe('settings')
  })

  it('a key given to another action leaves the one that had it', () => {
    expect(conflictFor('P', 'hold')).toBe('present')
    assignKey('hold', 'P', 0)
    expect(keysOf('hold')).toEqual(['P'])
    expect(keysOf('present')).toEqual([])
    expect(actionFor('P')).toBe('hold')
  })

  it('two keys at most; a second added; removed; Esc and 1–9 can never be taken', () => {
    assignKey('hold', 'J', 1)
    expect(keysOf('hold')).toEqual(['H', 'J'])
    setKeys('hold', ['H', 'J', 'K'])
    expect(keysOf('hold')).toHaveLength(MAX_KEYS)
    removeKey('hold', 'H')
    expect(keysOf('hold')).toEqual(['J'])
    setKeys('clear', ['Escape', '5'])
    expect(keysOf('clear')).toEqual([])
  })

  it('kept across a reload; reset brings the factory keys back', () => {
    assignKey('hold', 'J', 0)
    reloadBindings()
    expect(keysOf('hold')).toEqual(['J'])
    resetAllKeys()
    reloadBindings()
    expect(keysOf('hold')).toEqual(['H'])
  })
})

describe('settings data', () => {
  it('songs and the like are not settings', () => {
    expect(isDataKey('modus-songs')).toBe(true)
    expect(isDataKey('modus-song:abc')).toBe(true)
    expect(isDataKey('ear-score')).toBe(true)
    expect(isDataKey('pref-a4-hz')).toBe(false)
    expect(isDataKey('layout')).toBe(false)
  })

  it('a settings file is read back; anything else is refused; songs in it are left out', () => {
    const file = JSON.stringify({ app: 'modus', kind: 'settings', version: 1, data: { 'pref-a4-hz': '442', 'modus-song:x': '{}' } })
    expect(readSettingsFile(file)).toEqual({ 'pref-a4-hz': '442' })
    expect(readSettingsFile('{"app":"other"}')).toBeNull()
    expect(readSettingsFile('not json')).toBeNull()
  })

  it('numbers as the rows write them', () => {
    expect(formatPrefValue({ unit: 'ms' }, 800)).toBe('0.8 s')
    expect(formatPrefValue({ unit: 'bpm' }, 100)).toBe('100 bpm')
    expect(formatPrefValue({ unit: '' }, 90)).toBe('90')
  })
})
