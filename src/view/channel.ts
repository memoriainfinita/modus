// Live link between the main window and its view windows (OBS). Both are pages of the
// same origin in the same browser, so a BroadcastChannel carries what is on screen; a view
// that opens asks for the current state.

export type ViewName = 'chord' | 'staff' | 'cof' | 'piano' | 'guitar'
export const VIEW_NAMES: ViewName[] = ['chord', 'staff', 'cof', 'piano', 'guitar']

export const VIEW_BACKGROUNDS = { green: '#00ff00', magenta: '#ff00ff', black: '#000000', dark: '#1a1a2e' } as const
export type ViewBackground = keyof typeof VIEW_BACKGROUNDS

export interface ViewState {
  key: string | null
  kind: 'chord' | 'note' | 'interval' | null
  label: string            // chord symbol, note name or interval name; '' when nothing sounds
  symbol: string | null    // the chord, when there is one
  notes: string[]
  roman: string | null
  function: 'T' | 'S' | 'D' | 'unknown' | null
  guitarVoicing: number
}

type Message = { type: 'state'; state: ViewState } | { type: 'hello' }

const NAME = 'modus-view'

function open(): BroadcastChannel | null {
  try { return new BroadcastChannel(NAME) } catch { return null }
}

/** Main window: sends each new state, and the current one to a view that opens. */
export function createViewPublisher() {
  const channel = open()
  let current: ViewState | null = null
  let last = ''
  channel?.addEventListener('message', (e: MessageEvent<Message>) => {
    if (e.data?.type === 'hello' && current) channel.postMessage({ type: 'state', state: current })
  })
  return (state: ViewState) => {
    current = state
    const sig = JSON.stringify(state)
    if (sig === last) return
    last = sig
    channel?.postMessage({ type: 'state', state } satisfies Message)
  }
}

/** View window: calls back on every state the main window sends. */
export function subscribeView(onState: (s: ViewState) => void) {
  const channel = open()
  channel?.addEventListener('message', (e: MessageEvent<Message>) => {
    if (e.data?.type === 'state') onState(e.data.state)
  })
  channel?.postMessage({ type: 'hello' } satisfies Message)
}

/** URL of a view window: same page, `?view=…&bg=…`. */
export function viewUrl(view: ViewName, bg: ViewBackground, base = location.href): string {
  const url = new URL(base)
  url.search = new URLSearchParams({ view, bg }).toString()
  url.hash = ''
  return url.toString()
}

/** Window size each view opens with; the diagram fills whatever size it is given. */
export const VIEW_WINDOW: Record<ViewName, [number, number]> = {
  chord: [640, 360], staff: [800, 320], cof: [520, 520], piano: [960, 300], guitar: [380, 460],
}
