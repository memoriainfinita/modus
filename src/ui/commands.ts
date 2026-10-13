// The bar's field: a chord to play, or an order found by its name (a mode, a key, a layout,
// a panel, an instrument…). The results drop below it: the arrows move, Enter does the one
// marked (the first unless moved), Esc closes the list and then leaves the field.

import { escapeHtml } from './html'

// keep: the text stays in the field after it runs (a chord played)
export type Command = { label: string; hint?: string; run: () => void; keep?: boolean }

const MAX_RESULTS = 8

/** Lower case and without accents: "Música" is found as "musica". */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const words = (s: string) => fold(s).split(/[^a-z0-9#]+/).filter(Boolean)
/** A plural typed finds the singular name: "sevenths" finds "Seventh chords", "menores" "menor". */
const singular = (w: string) => w.length > 4 ? w.replace(/e?s$/, '') : w

/**
 * The orders whose name (or hint) has a word starting with each word typed: "arp" finds
 * Arpeggio and Harp ("Arpa"), "pan pia" the Piano panel. A match at the start of the name
 * comes first; otherwise the list keeps its order.
 */
export function matchCommands(query: string, commands: Command[]): Command[] {
  const q = words(query)
  if (!q.length) return []
  const scored = commands.flatMap((c, i) => {
    const w = words(`${c.label} ${c.hint ?? ''}`)
    if (!q.every(part => w.some(word => word.startsWith(part) || word.startsWith(singular(part))))) return []
    const first = words(c.label.split(':').pop() ?? c.label)[0] ?? ''
    return [{ c, i, rank: first.startsWith(q[0]) ? 0 : 1 }]
  })
  return scored.sort((a, b) => a.rank - b.rank || a.i - b.i).slice(0, MAX_RESULTS).map(s => s.c)
}

type SearchOptions = {
  input: HTMLInputElement
  list: HTMLElement
  /** The chord the text names, as it is shown, or null. */
  chordOf: (text: string) => string | null
  /** Plays the typed chord, or marks the field when it names none. */
  submitChord: () => void
  commands: () => Command[]
  playLabel: (chord: string) => string
  noneLabel: (query: string) => string
}

export function wireCommandSearch(o: SearchOptions) {
  let items: Command[] = []
  let marked = 0

  const hide = () => { o.list.hidden = true; o.input.setAttribute('aria-expanded', 'false'); o.input.removeAttribute('aria-activedescendant') }

  const render = () => {
    const q = o.input.value.trim()
    if (!q) { items = []; hide(); return }
    const chord = o.chordOf(q)
    items = [
      ...(chord ? [{ label: o.playLabel(chord), run: o.submitChord, keep: true }] : []),
      ...matchCommands(q, o.commands()),
    ]
    marked = 0
    o.list.innerHTML = items.length
      ? items.map((c, i) => `<div id="cmd-${i}" class="cmd-item" role="option" data-i="${i}" aria-selected="${i === marked}"><span>${escapeHtml(c.label)}</span>${c.hint ? `<span class="cmd-hint">${escapeHtml(c.hint)}</span>` : ''}</div>`).join('')
      : `<div class="cmd-none">${escapeHtml(o.noneLabel(q))}</div>`
    o.list.hidden = false
    o.input.setAttribute('aria-expanded', 'true')
    mark(0)
  }

  const mark = (i: number) => {
    if (!items.length) return
    marked = (i + items.length) % items.length
    o.list.querySelectorAll('.cmd-item').forEach((el, j) => el.setAttribute('aria-selected', String(j === marked)))
    o.input.setAttribute('aria-activedescendant', `cmd-${marked}`)
    o.list.querySelector(`#cmd-${marked}`)?.scrollIntoView({ block: 'nearest' })
  }

  const run = (i: number) => {
    const c = items[i]
    if (!c) { o.submitChord(); return }
    if (c.keep) { hide(); c.run(); return }
    o.input.value = ''
    hide()
    o.input.blur()
    c.run()
  }

  o.input.addEventListener('input', () => { o.input.classList.remove('invalid'); render() })
  o.input.addEventListener('focus', render)
  o.input.addEventListener('blur', hide)
  o.input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); mark(marked + 1) }
    else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); mark(marked - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); run(items.length ? marked : -1) }
    else if (e.key === 'Escape') {
      e.stopPropagation()
      if (!o.list.hidden) hide()
      else o.input.blur()
    }
  })
  // pointerdown, not click: the field's blur would hide the list before the click lands
  o.list.addEventListener('pointerdown', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.cmd-item')
    if (!el) return
    e.preventDefault()
    run(Number(el.dataset.i))
  })
}

