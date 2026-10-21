import type { HistoryEntry } from '../types'
import { analyzeChordProgression } from '../detector/analyzer'
import { playChord, playNoteNames } from '../audio/audio'
import { escapeHtml } from '../ui/html'
import { showUndo } from '../ui/undo'
import { spellChordSymbol } from '../theory/spelling'
import { t, chordLabel, keyLabel, cadenceLabel, getLang } from '../i18n/i18n'
import { entrySeconds, harmonicRhythm } from './rhythm'
import { runningMeter } from '../metronome/engine'
import { explainCadence } from '../detector/explain'
import { makeActivatable, onLongPress } from '../ui/a11y'
import { getPref } from '../settings/prefs'
import { newId } from '../id'

// Chip accent by harmonic function (T/S/D), not by chord quality: the key panel's colours
const FUNCTION_COLORS: Record<string, string> = {
  'T': 'var(--fn-t)', 'S': 'var(--fn-s)', 'D': 'var(--fn-d)', 'unknown': 'var(--text-dim)'
}

let entries: HistoryEntry[] = []
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let lastAutoAppended: string | null = null

type HistoryChangeCallback = (entries: HistoryEntry[]) => void
let onChange: HistoryChangeCallback = () => {}

export function setHistoryChangeCallback(cb: HistoryChangeCallback) { onChange = cb }

export function getEntries(): HistoryEntry[] { return entries }

// A reload for a language change keeps the strip: it waits in sessionStorage for the new page.
const CARRY_KEY = 'modus-history-carry'

export function carryHistoryOverReload() {
  try { sessionStorage.setItem(CARRY_KEY, JSON.stringify(entries)) } catch { }
}

/** Puts back the strip carried over a reload, once. */
export function restoreCarriedHistory() {
  let carried: unknown = null
  try {
    carried = JSON.parse(sessionStorage.getItem(CARRY_KEY) ?? 'null')
    sessionStorage.removeItem(CARRY_KEY)
  } catch { }
  const list = Array.isArray(carried) ? carried as HistoryEntry[] : []
  if (list.length && list.every(e => e && typeof e.id === 'string' && typeof e.symbol === 'string' && Array.isArray(e.notes))) restoreEntries(list)
}

export function addEntry(symbol: string, notes: string[], time?: { at: number; until?: number }) {
  const entry: HistoryEntry = { id: newId(), symbol, notes, ...time }
  entries = [entry, ...entries].slice(0, getPref('history-max'))
  onChange(entries)
}

export function removeEntry(id: string) {
  entries = entries.filter(e => e.id !== id)
  // Dedup compares against the newest entry still in the strip, not a removed one.
  lastAutoAppended = entries[0]?.symbol ?? null
  onChange(entries)
}

/** Puts back a previous list (undo). Dedup re-arms against its newest entry. */
export function restoreEntries(list: HistoryEntry[]) {
  entries = list.slice(0, getPref('history-max'))
  lastAutoAppended = entries[0]?.symbol ?? null
  onChange(entries)
}

/** Clears the strip at once and offers Undo. */
export function clearHistoryWithUndo() {
  if (!entries.length) return
  const before = entries
  clearHistory()
  showUndo(t('history.cleared', { n: before.length }), () => restoreEntries(before))
}

export function clearHistory() {
  entries = []
  lastAutoAppended = null
  onChange(entries)
}

// The chord being held before it goes to the history: when it started, and its release if
// that came first (a chord shorter than the hold still has its time)
let pending: { symbol: string; at: number; until?: number } | null = null

export function notifyChordDetected(symbol: string, notes: string[], at = Date.now()) {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (pending?.symbol !== symbol) pending = { symbol, at }
  else delete pending.until
  // The newest chord struck again: it sounds on, its release is still to come
  if (symbol === lastAutoAppended && entries[0]) delete entries[0].until
  debounceTimer = setTimeout(() => {
    if (symbol !== lastAutoAppended && symbol !== '?') {
      const p = pending?.symbol === symbol ? pending : null
      addEntry(symbol, notes, p ? { at: p.at, until: p.until } : undefined)
      lastAutoAppended = symbol
    }
  }, getPref('history-hold-ms'))
}

/** The chord played was released: the newest entry (or the one still being held) stops sounding. */
export function notifyChordReleased(at = Date.now()) {
  if (pending && pending.until === undefined) pending.until = at
  const e = entries[0]
  if (e?.at !== undefined && e.until === undefined && e.symbol === pending?.symbol) {
    e.until = at
    onChange(entries)
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/** Moves the cursor highlight without rebuilding the strip. */
export function markActiveHistoryEntry(container: HTMLElement, entryId: string | null) {
  container.querySelectorAll<HTMLElement>('.history-chip').forEach(el => {
    el.classList.toggle('active-cursor', el.dataset.id === entryId)
  })
}

export function renderHistory(
  container: HTMLElement,
  activeKey: string | null,
  onChipClick: (entry: HistoryEntry) => void,
  activeCursorEntryId: string | null,
  /** With the Song panel shown: → Song puts the chord marked (or the newest) in it */
  onSend?: () => void,
) {
  const strip = document.createElement('div')
  strip.className = 'history-strip'

  // Written in the current key: an entry keeps the spelling it was captured with
  const shown = entries.map(e => ({ ...e, symbol: spellChordSymbol(e.symbol, activeKey) }))
  // The strip is newest first; the progression runs in playing order, from each chip to the
  // one on its left. Numerals are read in the key in force at each chip.
  const steps = analyzeChordProgression(shown.map(e => e.symbol).reverse(), activeKey).reverse()

  shown.forEach((entry, i) => {
    // steps[i + 1]: the chip on the right (older), whose cadence leads to this one
    const older = i + 1 < shown.length ? steps[i + 1] : null
    const cadence = older?.cadence ?? null
    const modulation = older && steps[i].key && steps[i].key !== older.key ? steps[i].key : null
    const analysis = steps[i].info
    const roman = analysis?.roman ?? '—'
    const fn = analysis?.function ?? 'unknown'
    const color = FUNCTION_COLORS[fn] ?? FUNCTION_COLORS.unknown

    const chip = document.createElement('div')
    chip.className = 'history-chip'
    chip.dataset.id = entry.id
    chip.classList.toggle('active-cursor', activeCursorEntryId === entry.id)
    chip.style.borderLeft = `3px solid ${color}`
    chip.innerHTML = `
      <span class="history-chip-symbol">${escapeHtml(chordLabel(entry.symbol))}</span>
      <span class="history-chip-roman">${escapeHtml(roman)}</span>
    `

    chip.addEventListener('click', () => {
      onChipClick(entry)
      if (entry.notes.length > 0) playNoteNames(entry.notes)
      else playChord(entry.symbol)
    })
    const inKey = steps[i].key ? ` (${t('history.chip.inKey', { roman, key: keyLabel(steps[i].key!) })})` : ''
    const secs = entrySeconds(entries, i)
    const lasted = secs !== null ? ` · ${t('history.chip.duration', { s: decimal(secs) })}` : ''
    chip.title = `${chordLabel(entry.symbol)}${inKey}${lasted} — ${t('history.chip.actions')}`

    // Drag to song
    chip.draggable = true
    chip.addEventListener('dragstart', e => {
      e.dataTransfer!.setData('application/x-history-chord', JSON.stringify({ id: entry.id, symbol: entry.symbol, notes: entry.notes }))
      e.dataTransfer!.effectAllowed = 'copy'
      chip.style.opacity = '0.5'
    })
    chip.addEventListener('dragend', () => { chip.style.opacity = '1' })

    // Right-click (or Delete on the focused chip) to remove
    const remove = () => {
      const before = entries
      removeEntry(entry.id)
      showUndo(t('history.removed', { chord: chordLabel(entry.symbol) }), () => restoreEntries(before))
    }
    chip.addEventListener('contextmenu', e => { e.preventDefault(); remove() })
    onLongPress(chip, remove)
    makeActivatable(chip, t('a11y.chip', { chord: chordLabel(entry.symbol), roman }))
    chip.addEventListener('keydown', e => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      e.preventDefault()
      e.stopPropagation()
      remove()
    })

    strip.appendChild(chip)

    // Between this chip and the older one on its right: the new key when this chip is where
    // UMT finds a modulation (next to it), and the cadence that leads here.
    if (modulation) {
      const tag = document.createElement('span')
      tag.className = 'history-modulation'
      tag.textContent = `→ ${keyLabel(modulation)}`
      tag.title = t('history.modulation', { key: keyLabel(modulation) })
      strip.appendChild(tag)
    }
    if (cadence) {
      const tag = document.createElement('span')
      tag.className = 'history-cadence'
      // The short name on the strip ("Authentic"), the full one in the tooltip
      tag.textContent = cadenceLabel(cadence, true)
      tag.title = `${cadenceLabel(cadence)}: ${chordLabel(shown[i + 1].symbol)} → ${chordLabel(entry.symbol)}` +
        (explainCadence(cadence) ? `\n${explainCadence(cadence)}` : '')
      strip.appendChild(tag)
    }
  })

  const clearBtn = document.createElement('button')
  clearBtn.textContent = t('history.clear')
  clearBtn.title = t('history.clear.title')
  clearBtn.className = 'history-clear-btn'
  clearBtn.addEventListener('click', clearHistoryWithUndo)

  const wrap = document.createElement('div')
  wrap.className = 'history-wrap'
  wrap.appendChild(strip)
  if (onSend && entries.length) {
    const sendBtn = document.createElement('button')
    sendBtn.textContent = t('history.send')
    sendBtn.title = t('history.send.title')
    sendBtn.className = 'history-send-btn'
    sendBtn.addEventListener('click', onSend)
    wrap.appendChild(sendBtn)
  }
  wrap.appendChild(clearBtn)

  container.innerHTML = ''
  container.appendChild(wrap)

  const rhythm = rhythmText()
  if (rhythm) {
    const line = document.createElement('div')
    line.className = 'history-rhythm'
    line.textContent = rhythm
    line.title = t('history.rhythm.title')
    container.appendChild(line)
  }
}

const decimal = (n: number) => n.toLocaleString(getLang(), { maximumFractionDigits: 1 })

/** The history's harmonic rhythm in one line, or null with fewer than two timed chords. */
export function rhythmText(): string | null {
  // The metronome, while it runs, says the tempo and the bar; otherwise the History's own setting
  const running = runningMeter()
  const bpm = running?.bpm ?? getPref('history-bpm'), beats = running?.beatsPerBar ?? getPref('history-beats')
  const r = harmonicRhythm(entries, bpm, beats)
  if (!r) return null
  return r.kind === 'per-bar'
    ? t('history.rhythm.perBar', { n: decimal(r.changes), bpm: r.bpm, beats: r.beatsPerBar })
    : t('history.rhythm.seconds', { s: decimal(r.secondsPerChange) })
}
