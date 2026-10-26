// Keyboard and screen-reader support shared by the panels: a polite live region for what
// the detector shows, names for the buttons that only carry an icon, and Enter / Space on
// anything clickable that is not a button.

let live: HTMLElement | null = null
let pending: ReturnType<typeof setTimeout> | null = null
let pendingSounding = false
let lastSaid = ''
let lastId = ''

/**
 * Says `text` to a screen reader, once it has held for `delay` ms (a chord arrives note by note).
 * `sounding` names what is sounding (a chord, a note): said once while it sounds, even when its
 * text grows (the key found after the chord, its numeral read anew); while it waits to be said,
 * the newer text replaces it.
 */
export function announce(text: string, delay = 350, sounding?: string) {
  if (typeof document === 'undefined') return
  if (!live) {
    live = document.createElement('div')
    live.id = 'sr-live'
    live.className = 'sr-only'
    live.setAttribute('aria-live', 'polite')
    live.setAttribute('aria-atomic', 'true')
    document.body.appendChild(live)
  }
  if (sounding !== undefined) {
    if (sounding === lastId && !(pending && pendingSounding)) return
    lastId = sounding
  }
  if (pending) clearTimeout(pending)
  pendingSounding = sounding !== undefined
  pending = setTimeout(() => {
    pending = null
    if (text === lastSaid) return
    lastSaid = text
    live!.textContent = text
  }, delay)
}

/** Nothing sounding, or notes being lifted: what waits to be said of it is dropped, and the same chord played again is said again. */
export function silence() {
  if (pending && pendingSounding) { clearTimeout(pending); pending = null }
  lastId = ''
  lastSaid = ''
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

const LONG_PRESS_MS = 600

/**
 * A finger held still on `el` for 600 ms: what a right click does with a mouse. The click
 * that follows the lift is swallowed. Android also fires contextmenu, which is not counted twice.
 */
export function onLongPress(el: HTMLElement, fn: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let fired = false
  const cancel = () => { if (timer) clearTimeout(timer); timer = null }
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return
    fired = false
    cancel()
    timer = setTimeout(() => { timer = null; fired = true; fn() }, LONG_PRESS_MS)
  })
  el.addEventListener('pointerup', cancel)
  el.addEventListener('pointercancel', cancel)
  el.addEventListener('pointermove', e => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) cancel() })
  el.addEventListener('contextmenu', e => { if (fired) { e.preventDefault(); e.stopImmediatePropagation() } }, true)
  el.addEventListener('click', e => { if (fired) { e.preventDefault(); e.stopImmediatePropagation(); fired = false } }, true)
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
  // A focused panel header moves the panel with the arrows and hides it with Delete
  if ((e.key.startsWith('Arrow') || e.key === 'Delete') && t.classList.contains('module-header')) return true
  // A focused circle segment moves the focus round the circle
  if ((e.key.startsWith('Arrow') || e.key === 'Home') && t.closest('#cof-container')) return true
  return false
}
