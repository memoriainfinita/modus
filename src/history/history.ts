import type { HistoryEntry } from '../types'
import { romanInKey, progressionCadences } from '../detector/analyzer'
import { playChord, playNoteNames } from '../audio/audio'
import { escapeHtml } from '../ui/html'
import { showUndo } from '../ui/undo'
import { spellChordSymbol } from '../theory/spelling'

const MAX_ENTRIES = 200
// Chip accent by harmonic function (T/S/D), not by chord quality
const FUNCTION_COLORS: Record<string, string> = {
  'T': '#f59e0b', 'S': '#3b82f6', 'D': '#ef4444', 'unknown': '#6b7280'
}

let entries: HistoryEntry[] = []
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let lastAutoAppended: string | null = null

type HistoryChangeCallback = (entries: HistoryEntry[]) => void
let onChange: HistoryChangeCallback = () => {}

export function setHistoryChangeCallback(cb: HistoryChangeCallback) { onChange = cb }

export function getEntries(): HistoryEntry[] { return entries }

export function addEntry(symbol: string, notes: string[]) {
  const entry: HistoryEntry = { id: crypto.randomUUID(), symbol, notes }
  entries = [entry, ...entries].slice(0, MAX_ENTRIES)
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
  entries = list.slice(0, MAX_ENTRIES)
  lastAutoAppended = entries[0]?.symbol ?? null
  onChange(entries)
}

/** Clears the strip at once and offers Undo. */
export function clearHistoryWithUndo() {
  if (!entries.length) return
  const before = entries
  clearHistory()
  showUndo(`History cleared (${before.length})`, () => restoreEntries(before))
}

export function clearHistory() {
  entries = []
  lastAutoAppended = null
  onChange(entries)
}

export function notifyChordDetected(symbol: string, notes: string[]) {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (symbol !== lastAutoAppended && symbol !== '?') {
      addEntry(symbol, notes)
      lastAutoAppended = symbol
    }
  }, 800)
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/** "Authentic Cadence (V -> I)" → "Authentic"; the full name goes in the tooltip. */
export function shortCadence(name: string): string {
  return name.replace(/\s*\(.*\)$/, '').replace(/ Cadence$/, '').replace(/ Resolution$/, '')
}

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
  activeCursorEntryId: string | null
) {
  const strip = document.createElement('div')
  strip.className = 'history-strip'

  // Written in the current key: an entry keeps the spelling it was captured with
  const shown = entries.map(e => ({ ...e, symbol: spellChordSymbol(e.symbol, activeKey) }))
  // The strip is newest first; cadences run in playing order, from each chip to the one on its left.
  const cadences = progressionCadences(shown.map(e => e.symbol).reverse(), activeKey).reverse()

  shown.forEach((entry, i) => {
    // cadences[i + 1]: from the chip on the right (older) to this one
    const cadence = i + 1 < shown.length ? cadences[i + 1] : null
    const analysis = romanInKey(entry.symbol, activeKey)
    const roman = analysis?.roman ?? '—'
    const fn = analysis?.function ?? 'unknown'
    const color = FUNCTION_COLORS[fn] ?? '#6b7280'

    const chip = document.createElement('div')
    chip.className = 'history-chip'
    chip.dataset.id = entry.id
    chip.classList.toggle('active-cursor', activeCursorEntryId === entry.id)
    chip.style.borderLeft = `3px solid ${color}`
    chip.innerHTML = `
      <span class="history-chip-symbol">${escapeHtml(entry.symbol)}</span>
      <span class="history-chip-roman">${escapeHtml(roman)}</span>
    `

    chip.addEventListener('click', () => {
      onChipClick(entry)
      if (entry.notes.length > 0) playNoteNames(entry.notes)
      else playChord(entry.symbol)
    })
    chip.title = `${entry.symbol} — click to play, drag to song, right-click to remove`

    // Drag to song
    chip.draggable = true
    chip.addEventListener('dragstart', e => {
      e.dataTransfer!.setData('application/x-history-chord', JSON.stringify({ id: entry.id, symbol: entry.symbol, notes: entry.notes }))
      e.dataTransfer!.effectAllowed = 'copy'
      chip.style.opacity = '0.5'
    })
    chip.addEventListener('dragend', () => { chip.style.opacity = '1' })

    // Right-click to remove
    chip.addEventListener('contextmenu', e => {
      e.preventDefault()
      const before = entries
      removeEntry(entry.id)
      showUndo(`Removed ${entry.symbol}`, () => restoreEntries(before))
    })

    strip.appendChild(chip)

    if (cadence) {
      const tag = document.createElement('span')
      tag.className = 'history-cadence'
      tag.textContent = shortCadence(cadence)
      tag.title = `${cadence}: ${shown[i + 1].symbol} → ${entry.symbol}`
      strip.appendChild(tag)   // between this chip and the older one on its right
    }
  })

  const clearBtn = document.createElement('button')
  clearBtn.textContent = 'Clear'
  clearBtn.title = 'Clear history (C) — can be undone'
  clearBtn.className = 'history-clear-btn'
  clearBtn.addEventListener('click', clearHistoryWithUndo)

  const wrap = document.createElement('div')
  wrap.className = 'history-wrap'
  wrap.appendChild(strip)
  wrap.appendChild(clearBtn)

  container.innerHTML = ''
  container.appendChild(wrap)
}
