import { describe, it, expect, beforeEach } from 'vitest'
import { addSection } from '../src/song/model'
import { listSongs, loadActiveSong, saveSong, openSong, newSong, deleteSong, restoreSong } from '../src/song/library'

beforeEach(() => localStorage.clear())

describe('song library: migration', () => {
  it('the single schema-1 song becomes the first saved song, with the selected key', () => {
    localStorage.setItem('modus-song', JSON.stringify({ schemaVersion: 1, title: 'Old tune', sections: [{ id: 's', name: 'Verse', color: 'verse', measures: [], collapsed: false, repeatCount: 1 }] }))
    localStorage.setItem('active-key', 'Db Minor')
    const song = loadActiveSong()
    expect(song.title).toBe('Old tune')
    expect(song.sections).toHaveLength(1)
    expect(song.key).toBe('C# Minor')   // spelled as the key selector does
    expect(listSongs().map(m => m.title)).toEqual(['Old tune'])
    expect(localStorage.getItem('modus-song')).not.toBeNull()   // left in place
  })

  it('migrates once: a later load does not duplicate it', () => {
    localStorage.setItem('modus-song', JSON.stringify({ schemaVersion: 1, title: 'Old tune', sections: [] }))
    loadActiveSong()
    loadActiveSong()
    expect(listSongs()).toHaveLength(1)
  })

  it('without any saved song, starts with one empty song', () => {
    const song = loadActiveSong()
    expect(song.title).toBe('Untitled')
    expect(listSongs()).toHaveLength(1)
  })
})

describe('song library: several songs', () => {
  it('New keeps the previous song; both are listed, newest change first', () => {
    const first = { ...addSection(loadActiveSong(), 'Verse', 'verse'), title: 'First' }
    saveSong(first)
    const second = newSong()
    expect(loadActiveSong().id).toBe(second.id)
    expect(listSongs().map(m => m.id)).toEqual([second.id, first.id])
  })

  it('opening a song makes it the one loaded next time, with its key', () => {
    const first = { ...loadActiveSong(), title: 'First', key: 'A Minor' }
    saveSong(first)
    newSong()
    expect(openSong(first.id)?.key).toBe('A Minor')
    expect(loadActiveSong().id).toBe(first.id)
  })

  it('opening a song that no longer exists returns null and changes nothing', () => {
    const open = loadActiveSong()
    expect(openSong('missing')).toBeNull()
    expect(loadActiveSong().id).toBe(open.id)
  })

  it('deleting the open song opens the most recent remaining one; restore brings it back', () => {
    const first = { ...loadActiveSong(), title: 'First' }
    saveSong(first)
    const second = { ...newSong(), title: 'Second' }
    saveSong(second)
    const { deleted, open } = deleteSong(second.id)
    expect(deleted?.title).toBe('Second')
    expect(open.id).toBe(first.id)
    expect(listSongs().map(m => m.title)).toEqual(['First'])
    restoreSong(deleted!)
    expect(loadActiveSong().title).toBe('Second')
    expect(listSongs()).toHaveLength(2)
  })

  it('deleting the last song leaves a new empty one', () => {
    const only = loadActiveSong()
    const { open } = deleteSong(only.id)
    expect(open.id).not.toBe(only.id)
    expect(listSongs().map(m => m.id)).toEqual([open.id])
  })

  it('a renamed song shows its new title in the list', () => {
    const song = loadActiveSong()
    saveSong({ ...song, title: 'Renamed' })
    expect(listSongs()[0].title).toBe('Renamed')
  })
})
