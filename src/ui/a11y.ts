// Keyboard and screen-reader support shared by the panels: a polite live region for what
// the detector shows, names for the buttons that only carry an icon, and Enter / Space on
// anything clickable that is not a button.

let live: HTMLElement | null = null
let pending: ReturnType<typeof setTimeout> | null = null
let lastSaid = ''

/** Says `text` to a screen reader, once it has held for `delay` ms (a chord arrives note by note). */
export function announce(text: string, delay = 350) {
  if (typeof document === 'undefined') return
  if (!live) {
    live = document.createElement('div')
    live.id = 'sr-live'
    live.className = 'sr-only'
    live.setAttribute('aria-live', 'polite')
    live.setAttribute('aria-atomic', 'true')
    document.body.appendChild(live)
  }
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => {
    pending = null
    if (text === lastSaid) return
    lastSaid = text
    live!.textContent = text
  }, delay)
}

const HAS_WORD = /\p{L}{2,}/u

/** Buttons whose text is an icon (▶, ×, ⇠) get their tooltip as their name. */
export function labelIconButtons(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('button[title]:not([aria-label]), [role="button"][title]:not([aria-label])').forEach(b => {
    if (!HAS_WORD.test(b.textContent ?? '')) b.setAttribute('aria-label', b.title)
  })
}

/** Keeps naming icon buttons as panels draw new ones. */
export function watchIconButtons(root: HTMLElement) {
  labelIconButtons(root)
  new MutationObserver(() => labelIconButtons(root)).observe(root, { childList: true, subtree: true })
}

/** An element that is clicked becomes reachable with Tab and pressed with Enter or Space. */
export function makeActivatable(el: Element, label?: string) {
  el.setAttribute('role', 'button')
  el.setAttribute('tabindex', '0')
  if (label) el.setAttribute('aria-label', label)
  el.addEventListener('keydown', e => {
    const k = (e as KeyboardEvent).key
    if (k !== 'Enter' && k !== ' ') return
    e.preventDefault()
    e.stopPropagation()
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/** A menu button tells whether its menu is open (the menu opens and closes by its `open` class). */
export function syncExpanded(button: HTMLElement, menu: HTMLElement) {
  const sync = () => button.setAttribute('aria-expanded', String(menu.classList.contains('open')))
  sync()
  new MutationObserver(sync).observe(menu, { attributes: true, attributeFilter: ['class'] })
}

/** Whether a key press belongs to the focused control (a button takes Enter and Space). */
export function keyBelongsToControl(e: KeyboardEvent): boolean {
  // Element, not HTMLElement: the circle's segments are SVG
  const t = e.target
  if (!(t instanceof Element)) return false
  if ((e.key === ' ' || e.key === 'Enter') && t.closest('button, a[href], [role="button"], summary')) return true
  // A focused panel header moves the panel with the arrows
  if (e.key.startsWith('Arrow') && t.classList.contains('module-header')) return true
  return false
}
