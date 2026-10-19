import { describe, it, expect } from 'vitest'
import { songSchedule } from '../src/song/playback'
import type { Song, Section } from '../src/types'

const chord = (id: string, symbol: string, valid = true) => ({ id, symbol, valid })
const section = (id: string, measures: ReturnType<typeof chord>[][], repeatCount = 1): Section =>
  ({ id, name: id, color: 'verse', collapsed: false, repeatCount, measures: measures.map((chords, i) => ({ id: `${id}-m${i}`, chords })) })
const song = (sections: Section[], extra: Partial<Song> = {}): Song =>
  ({ schemaVersion: 2, id: 's', title: '', key: null, updatedAt: 0, sections, ...extra })

const brief = (s: Song, from: string | null = null) => songSchedule(s, from).map(x => `${x.symbol ?? '—'}@${x.start}+${x.beats}`)

describe('songSchedule', () => {
  it('a bar lasts its beats, its chords share it equally', () => {
    const s = song([section('A', [[chord('1', 'C')], [chord('2', 'F'), chord('3', 'G')]])])
    expect(brief(s)).toEqual(['C@0+4', 'F@4+2', 'G@6+2'])
    expect(brief({ ...s, beatsPerBar: 3 })).toEqual(['C@0+3', 'F@3+1.5', 'G@4.5+1.5'])
  })

  it('sections in order, each as many times as its ×N', () => {
    const s = song([section('A', [[chord('1', 'C')]], 2), section('B', [[chord('2', 'G')]])])
    expect(brief(s)).toEqual(['C@0+4', 'C@4+4', 'G@8+4'])
  })

  it('an empty bar or an invalid chord is a rest', () => {
    const s = song([section('A', [[], [chord('1', 'Xyz', false)], [chord('2', 'C')]])])
    expect(brief(s)).toEqual(['—@0+4', '—@4+4', 'C@8+4'])
  })

  it('from a chord: its first time through, counted from there', () => {
    const s = song([section('A', [[chord('1', 'C')], [chord('2', 'F')]], 2)])
    expect(brief(s, '2')).toEqual(['F@0+4', 'C@4+4', 'F@8+4'])
    expect(brief(s, 'nope')).toEqual(brief(s))
  })
})
