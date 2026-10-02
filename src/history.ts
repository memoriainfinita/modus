import type { HistoryEntry } from './types'
import { buildHarmonicAnalysis } from './analyzer'
import { playChord, playNoteNames } from './audio'
import { escapeHtml } from './html'

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

/** Moves the cursor highlight without rebuilding the strip (a rebuild between clicks breaks dblclick). */
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

  entries.forEach(entry => {
    const analysis = activeKey ? buildHarmonicAnalysis(entry.symbol, activeKey, null) : null
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

    chip.addEventListener('click', () => onChipClick(entry))
    chip.addEventListener('dblclick', () => {
      if (entry.notes.length > 0) playNoteNames(entry.notes)
      else playChord(entry.symbol)
    })
    chip.title = `${entry.symbol} — dblclick to play, drag to song, right-click to remove`

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
      removeEntry(entry.id)
    })

    strip.appendChild(chip)
  })

  // Clear button — double-click to confirm
  let _clearPending = false
  let _clearTimer = 0
  const clearBtn = document.createElement('button')
  clearBtn.textContent = 'Clear'
  clearBtn.title = 'Clear history — click twice to confirm'
  clearBtn.className = 'history-clear-btn'
  clearBtn.addEventListener('click', () => {
    if (_clearPending) {
      clearTimeout(_clearTimer)
      _clearPending = false
      clearBtn.textContent = 'Clear'
      clearBtn.style.background = '#374151'
      clearHistory()
    } else {
      _clearPending = true
      clearBtn.textContent = '?'
      clearBtn.style.background = '#991b1b'
      _clearTimer = window.setTimeout(() => {
        _clearPending = false
        clearBtn.textContent = 'Clear'
        clearBtn.style.background = '#374151'
      }, 3000)
    }
  })

  const wrap = document.createElement('div')
  wrap.className = 'history-wrap'
  wrap.appendChild(strip)
  wrap.appendChild(clearBtn)

  container.innerHTML = ''
  container.appendChild(wrap)
}
