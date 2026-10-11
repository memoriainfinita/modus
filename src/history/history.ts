import type { HistoryEntry } from '../types'
import { analyzeChordProgression } from '../detector/analyzer'
import { playChord, playNoteNames } from '../audio/audio'
import { escapeHtml } from '../ui/html'
import { showUndo } from '../ui/undo'
import { spellChordSymbol } from '../theory/spelling'
import { t, chordLabel, keyLabel, cadenceLabel } from '../i18n/i18n'
import { explainCadence } from '../detector/explain'
import { makeActivatable } from '../ui/a11y'

const MAX_ENTRIES = 200
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
  showUndo(t('history.cleared', { n: before.length }), () => restoreEntries(before))
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
    chip.title = `${chordLabel(entry.symbol)}${inKey} — ${t('history.chip.actions')}`

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
  wrap.appendChild(clearBtn)

  container.innerHTML = ''
  container.appendChild(wrap)
}
