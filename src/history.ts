import type { HistoryEntry } from './types'
import { buildHarmonicAnalysis } from './analyzer'
import { playChord } from './audio'

const MAX_ENTRIES = 200
const QUALITY_COLORS: Record<string, string> = {
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
    if (symbol !== lastAutoAppended && symbol !== 'Unknown') {
      addEntry(symbol, notes)
      lastAutoAppended = symbol
    }
  }, 800)
}

export function getHistoryNotes(): string[] {
  return entries.flatMap(e => e.notes)
}

// ─── Rendering ────────────────────────────────────────────────────────────────

export function renderHistory(
  container: HTMLElement,
  activeKey: string | null,
  onChipClick: (entry: HistoryEntry) => void,
  onSendToSong: (entry: HistoryEntry) => void,
  activeCursorEntryId: string | null
) {
  const strip = document.createElement('div')
  strip.style.cssText = 'display:flex;gap:6px;overflow-x:auto;padding:8px 12px;align-items:center'

  entries.forEach(entry => {
    const analysis = activeKey ? buildHarmonicAnalysis(entry.symbol, activeKey, null) : null
    const roman = analysis?.roman ?? '—'
    const fn = analysis?.function ?? 'unknown'
    const color = QUALITY_COLORS[fn] ?? '#6b7280'

    const chip = document.createElement('div')
    chip.className = 'history-chip'
    chip.dataset.id = entry.id
    chip.style.cssText = `
      display:flex;flex-direction:column;align-items:center;padding:4px 8px;
      border-radius:6px;border:1.5px solid ${activeCursorEntryId === entry.id ? '#fff' : '#3a3a5c'};
      background:#252540;cursor:pointer;min-width:50px;user-select:none;
      border-left:3px solid ${color};
    `
    chip.innerHTML = `
      <span style="font-size:12px;font-weight:600">${entry.symbol}</span>
      <span style="font-size:10px;color:#9ca3af">${roman}</span>
    `

    chip.addEventListener('click', () => onChipClick(entry))
    chip.addEventListener('contextmenu', e => {
      e.preventDefault()
      if (confirm(`Remove ${entry.symbol} from history?`)) removeEntry(entry.id)
    })

    strip.appendChild(chip)
  })

  const captureBtn = document.createElement('button')
  captureBtn.textContent = '⊙ Capture'
  captureBtn.title = 'Add current chord to history (Space)'
  captureBtn.style.cssText = 'padding:4px 10px;border-radius:4px;background:#374151;color:#fff;border:none;cursor:pointer;white-space:nowrap;font-size:12px'
  captureBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('history-capture-requested'))
  })

  const sendBtn = document.createElement('button')
  sendBtn.textContent = '→ song'
  sendBtn.style.cssText = 'padding:4px 10px;border-radius:4px;background:#4f46e5;color:#fff;border:none;cursor:pointer;white-space:nowrap'
  sendBtn.addEventListener('click', () => {
    const active = activeCursorEntryId ? entries.find(e => e.id === activeCursorEntryId) : entries[0]
    if (active) onSendToSong(active)
  })

  const clearBtn = document.createElement('button')
  clearBtn.textContent = 'Clear'
  clearBtn.style.cssText = 'padding:4px 10px;border-radius:4px;background:#374151;color:#fff;border:none;cursor:pointer'
  clearBtn.addEventListener('click', () => {
    if (confirm('Clear all history?')) clearHistory()
  })

  const wrap = document.createElement('div')
  wrap.style.cssText = 'display:flex;gap:8px;align-items:center'
  wrap.appendChild(strip)
  wrap.appendChild(captureBtn)
  wrap.appendChild(sendBtn)
  wrap.appendChild(clearBtn)

  container.innerHTML = ''
  container.appendChild(wrap)
}
