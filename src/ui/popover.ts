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

function openPopover(pop: Pop, trigger: HTMLElement) {
  closePopover()
  const rail = trigger.closest<HTMLElement>('#rail')
  const anchor = rail ?? trigger.closest<HTMLElement>('.pop-anchor') ?? trigger.parentElement!
  anchor.appendChild(pop.menu)
  pop.menu.classList.toggle('pop-side', !!rail)
  pop.menu.classList.add('open')
  pop.menu.style.top = ''
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
