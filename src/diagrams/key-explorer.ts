// Key explorer column: the analysis key's diatonic chords with their degree and function,
// their negative harmony, the chords of the parallel modes and the Coltrane axis. Every
// chord is a button; the chord on screen is outlined wherever it appears. The key's own
// chords sit on the left, the parallel modes in columns beside them.

import type { KeyMap, KeyChord } from '../theory/key-map'
import { sameChord } from '../theory/key-map'
import { chordColor } from '../theory/chord'
import { escapeHtml } from '../ui/html'

export type KeyExplorerOptions = {
  sevenths: boolean
  showNegative: boolean
  showParallel: boolean
  showColtrane: boolean
  fontScale: number
}

const FUNCTION_NAMES: Record<string, string> = { T: 'Tonic', S: 'Subdominant', D: 'Dominant', unknown: 'Unknown function' }

const describe = (c: KeyChord) =>
  [c.roman, c.secondary && `also ${c.secondary}`, FUNCTION_NAMES[c.function]].filter(Boolean).join(' · ')

export function renderKeyExplorer(
  container: HTMLElement,
  map: KeyMap | null,
  keyLabel: string,
  activeChord: string | null,
  onChordClick: (symbol: string) => void,
  opts: KeyExplorerOptions
) {
  container.style.fontSize = opts.fontScale + 'px'
  if (!map) {
    container.innerHTML = `<div class="key-empty">Pick a key, or play: on Auto the detected key shows here.</div>`
    return
  }

  const button = (symbol: string, cls: string, title: string) =>
    `<button class="key-chord ${cls}${sameChord(symbol, activeChord) ? ' active' : ''}" data-chord="${escapeHtml(symbol)}"
      title="${escapeHtml(title)}" style="border-left-color:${chordColor(symbol)}">${escapeHtml(symbol)}</button>`

  const cell = (c: KeyChord) => `
    <div class="key-cell">
      <span class="key-roman">${escapeHtml(c.roman)}</span>
      ${button(c.symbol, '', describe(c))}
      <span class="key-function key-fn-${c.function}" title="${FUNCTION_NAMES[c.function]}">${c.function === 'unknown' ? '·' : c.function}</span>
    </div>`

  let html = `<div class="key-main"><div class="key-title">${escapeHtml(keyLabel)}</div>`
  html += `<div class="key-grid">${map.diatonic.map(cell).join('')}</div>`

  if (opts.showNegative) {
    html += `<div class="key-section-label" title="Each diatonic chord mirrored around the axis between the minor and major 3rd of the tonic (Harmony.getNegativeHarmony)">Negative harmony</div>
      <div class="key-grid">${map.negative.map((n, i) =>
        `<div class="key-cell">${n ? button(n, '', `Negative of ${map.diatonic[i].symbol}`) : '<span class="key-roman">—</span>'}</div>`
      ).join('')}</div>`
  }

  if (opts.showColtrane && map.coltraneAxis) {
    html += `<div class="key-axis" title="Tonics a major third apart (Harmony.getColtraneAxis)">
      <span class="key-section-label">Coltrane axis</span> ${map.coltraneAxis.map(escapeHtml).join(' · ')}</div>`
  }

  html += '</div>'

  if (opts.showParallel && map.parallel.length) {
    html += `<div class="key-parallel"><div class="key-section-label" title="Seventh chords of each mode on the same tonic that use a note outside the key (Harmony.getBorrowedChords)">Parallel modes</div><div class="key-mode-grid">`
    html += map.parallel.map(row => `
      <div class="key-mode-row">
        <span class="key-mode-name">${escapeHtml(row.mode)}</span>
        <div class="key-mode-chords">${row.chords.map(c => `
          <span class="key-mode-chord">
            <span class="key-roman">${escapeHtml(c.roman)}</span>
            ${button(c.symbol, '', `${describe(c)} · from ${row.mode}`)}
          </span>`).join('')}
        </div>
      </div>`).join('') + '</div></div>'
  }

  container.innerHTML = html
  container.querySelectorAll<HTMLElement>('.key-chord').forEach(btn => {
    btn.addEventListener('click', () => onChordClick(btn.dataset.chord!))
  })
}
