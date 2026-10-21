// Menus that open from a button: one open at a time, closed by a press elsewhere or Esc.
// A menu can have several buttons (the rail's icon and the bar's status); it opens next to
// the one pressed: out to the right of the rail, or below the bar.

type Pop = { menu: HTMLElement; onOpen?: () => void }
let current: { pop: Pop; trigger: HTMLElement } | null = null

export function wirePopover(menu: HTMLElement, triggers: HTMLElement[], onOpen?: () => void) {
  const pop: Pop = { menu, onOpen }
  for (const trigger of triggers) {
    trigger.setAttribute('aria-haspopup', 'true')
    trigger.setAttribute('aria-expanded', 'false')
    trigger.addEventListener('click', e => {
      e.stopPropagation()
      if (current?.pop === pop && current.trigger === trigger) closePopover()
      else openPopover(pop, trigger)
    })
  }
}

// On a phone the menus of the bottom bar, and the same menus from the top bar, rise from the
// bottom as sheets across the screen; a swipe down closes one.
const SHEETS = new Set(['input-menu', 'sound-menu', 'layout-menu', 'more-menu'])
const phone = () => matchMedia('(max-width: 720px)').matches

function openPopover(pop: Pop, trigger: HTMLElement) {
  closePopover()
  const sheet = phone() && SHEETS.has(pop.menu.id)
  const rail = sheet ? null : trigger.closest<HTMLElement>('#rail')
  const anchor = sheet ? document.body : rail ?? trigger.closest<HTMLElement>('.pop-anchor') ?? trigger.parentElement!
  anchor.appendChild(pop.menu)
  pop.menu.classList.toggle('pop-side', !!rail)
  pop.menu.classList.toggle('pop-sheet', sheet)
  pop.menu.classList.add('open')
  pop.menu.style.top = ''
  pop.menu.style.transform = ''
  if (sheet) {
    pop.menu.scrollTop = 0
    if (!pop.menu.querySelector(':scope > .pop-handle')) pop.menu.insertAdjacentHTML('afterbegin', '<div class="pop-handle" aria-hidden="true"></div>')
  }
  if (rail) {
    // Level with its icon, kept inside the rail's height (layout px: zoom does not change them)
    const top = Math.min(trigger.offsetTop, rail.clientHeight - pop.menu.offsetHeight - 8)
    pop.menu.style.top = `${Math.max(8, top)}px`
  }
  trigger.setAttribute('aria-expanded', 'true')
  current = { pop, trigger }
  pop.onOpen?.()
}

export function closePopover() {
  if (!current) return
  current.pop.menu.classList.remove('open')
  current.trigger.setAttribute('aria-expanded', 'false')
  current = null
}

export function isPopoverOpen(menu: HTMLElement): boolean { return current?.pop.menu === menu }

// A finger dragging a sheet down by its handle (which takes no scrolling, so the browser does
// not cancel the pointer) pulls it down; let go past 80 px it closes, short of that it goes back.
let pull: { menu: HTMLElement; y: number; id: number } | null = null
document.addEventListener('pointerdown', e => {
  const handle = (e.target as HTMLElement).closest?.<HTMLElement>('.pop-handle')
  const menu = handle?.closest<HTMLElement>('.pop-sheet.open')
  if (!menu) return
  pull = { menu, y: e.clientY, id: e.pointerId }
  try { handle!.setPointerCapture(e.pointerId) } catch { }   // refused for a pointer the browser no longer tracks
})
document.addEventListener('pointermove', e => {
  if (!pull || e.pointerId !== pull.id) return
  pull.menu.style.transform = `translateY(${Math.max(0, e.clientY - pull.y)}px)`
})
const release = (e: PointerEvent) => {
  if (!pull || e.pointerId !== pull.id) return
  const { menu, y } = pull
  pull = null
  menu.style.transform = ''
  if (e.clientY - y > 80 && current?.pop.menu === menu) closePopover()
}
document.addEventListener('pointerup', release)
document.addEventListener('pointercancel', release)

document.addEventListener('pointerdown', e => {
  if (!current) return
  const target = e.target as Node
  if (current.pop.menu.contains(target) || current.trigger.contains(target)) return
  closePopover()
}, true)

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !current) return
  const trigger = current.trigger
  closePopover()
  trigger.focus()
})
