// Saved songs. Each song lives under its own localStorage key, so editing one never
// rewrites the others; an index lists them and remembers the open one.

import type { Song } from '../types'
import { createSong, isBlankSong, withoutEmptyChords } from './model'
import { normalizeKey } from '../theory/keys'

const INDEX_KEY = 'modus-songs'
const songKey = (id: string) => `modus-song:${id}`
// Single-song storage from before the library (schema 1). Read once to migrate, left in place.
const LEGACY_SONG_KEYS = ['modus-song', 'harmony-companion-song']
const LEGACY_KEY_KEY = 'active-key'

export type SongMeta = { id: string; title: string; updatedAt: number }
type Index = { activeId: string; songs: SongMeta[] }

function readJSON(key: string): any {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch { return null }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

const metaOf = (song: Song): SongMeta => ({ id: song.id, title: song.title, updatedAt: song.updatedAt })

function readSong(id: string): Song | null {
  const s = readJSON(songKey(id))
  return s?.schemaVersion === 2 && s.id === id && Array.isArray(s.sections) ? withoutEmptyChords(s) : null
}

function readIndex(): Index | null {
  const i = readJSON(INDEX_KEY)
  return i && typeof i.activeId === 'string' && Array.isArray(i.songs) ? i : null
}

/** The song from before the library, with the key the app had selected for it. */
function migrateLegacySong(): Song {
  const legacy = LEGACY_SONG_KEYS.map(readJSON).find(s => s?.schemaVersion === 1 && Array.isArray(s.sections))
  if (!legacy) return createSong()
  let key: string | null = null
  try { key = normalizeKey(localStorage.getItem(LEGACY_KEY_KEY)) } catch { }
  return withoutEmptyChords({ ...createSong(), title: legacy.title ?? createSong().title, key, sections: legacy.sections })
}

function ensureIndex(): Index {
  const index = readIndex()
  if (index) return index
  const song = migrateLegacySong()
  write(songKey(song.id), song)
  const created = { activeId: song.id, songs: [metaOf(song)] }
  write(INDEX_KEY, created)
  return created
}

/** Saved songs, most recently changed first. The index keeps save order, which breaks ties. */
export function listSongs(): SongMeta[] {
  return ensureIndex().songs
    .map((meta, order) => ({ meta, order }))
    .sort((a, b) => b.meta.updatedAt - a.meta.updatedAt || b.order - a.order)
    .map(x => x.meta)
}

/** Writes the song and updates its entry in the index. Empty chord slots are not stored. */
export function saveSong(song: Song) {
  const stored: Song = { ...withoutEmptyChords(song), updatedAt: Date.now() }
  write(songKey(stored.id), stored)
  const index = ensureIndex()
  write(INDEX_KEY, { ...index, songs: [...index.songs.filter(m => m.id !== stored.id), metaOf(stored)] })
  if (!isBlankSong(stored)) requestPersistence()
}

// Persistent storage keeps the browser from evicting songs and preferences under storage
// pressure. Firefox asks the user, Chromium decides silently: asked once ever, when there
// is a song worth keeping, never on a first visit.
const PERSIST_ASKED_KEY = 'storage-persist-asked'

function requestPersistence() {
  try {
    if (localStorage.getItem(PERSIST_ASKED_KEY) || !navigator.storage?.persist) return
    localStorage.setItem(PERSIST_ASKED_KEY, '1')
  } catch { return }
  navigator.storage.persisted()
    .then(already => already || navigator.storage.persist())
    .catch(() => { })
}

function setActive(id: string) {
  write(INDEX_KEY, { ...ensureIndex(), activeId: id })
}

/** The open song. A missing or unreadable one falls back to the newest readable song, or a new one. */
export function loadActiveSong(): Song {
  const index = ensureIndex()
  const song = readSong(index.activeId)
    ?? listSongs().map(m => readSong(m.id)).find((s): s is Song => s !== null)
  if (song) { if (song.id !== index.activeId) setActive(song.id); return song }
  return newSong()
}

/** Opens a saved song; null when it no longer exists. */
export function openSong(id: string): Song | null {
  const song = readSong(id)
  if (song) setActive(id)
  return song
}

/** Creates an empty song, stores it and opens it. */
export function newSong(): Song {
  const song = createSong()
  saveSong(song)
  setActive(song.id)
  return song
}

/**
 * Deletes a song. Returns the deleted song (for Undo) and the song open afterwards: the
 * same one when another was deleted, else the most recent remaining, else a new one.
 */
export function deleteSong(id: string): { deleted: Song | null; open: Song } {
  const deleted = readSong(id)
  const index = ensureIndex()
  try { localStorage.removeItem(songKey(id)) } catch { }
  write(INDEX_KEY, { ...index, songs: index.songs.filter(m => m.id !== id) })
  return { deleted, open: loadActiveSong() }
}

/** Puts a deleted song back and opens it. */
export function restoreSong(song: Song) {
  saveSong(song)
  setActive(song.id)
}
