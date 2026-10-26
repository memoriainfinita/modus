// Layout windows (OBS): Modus itself in a window of its own, in another layout, following
// the main window. The main window sends the state its panels are drawn from and the window
// draws it with the same code, so every panel works there. A layout window opens no MIDI,
// audio or microphone, and writes nothing to storage.

import type { DetectionResult, HistoryEntry, Song } from '../types'
import type { NoteVelocity } from '../diagrams/velocity'
import { VIEW_BACKGROUNDS, type ViewBackground } from './channel'

export interface MirrorState {
  detection: DetectionResult
  fromMidi: boolean                  // spelled in the key, with velocities
  velocities: NoteVelocity[]
  cadencePrev: string | null
  prevNotes: string[] | null
  activeKey: string | null
  melody: string[]
  nextFrom: { symbol: string; notes: string[]; prev: string | null } | null
  history: HistoryEntry[]
  historyActiveCursorId: string | null
  song: Song
  activeCursorId: string | null
  playing: { chordId: string | null; sectionId: string } | null   // the song's step sounding
}

type Message = { type: 'state'; state: MirrorState } | { type: 'hello' }

const NAME = 'modus-mirror'

function open(): BroadcastChannel | null {
  try { return new BroadcastChannel(NAME) } catch { return null }
}

/**
 * Main window: `publish()` sends the state once per task however many changes call it (a
 * note can redraw the detector, the history and the song), and a window that opens gets it.
 */
export function createMirrorPublisher(read: () => MirrorState): () => void {
  const channel = open()
  let queued = false
  let last = ''
  channel?.addEventListener('message', (e: MessageEvent<Message>) => {
    if (e.data?.type === 'hello') { last = ''; send() }
  })
  function send() {
    queued = false
    const state = read()
    const sig = JSON.stringify(state)
    if (sig === last) return
    last = sig
    channel?.postMessage({ type: 'state', state } satisfies Message)
  }
  return () => {
    if (!channel || queued) return
    queued = true
    queueMicrotask(send)
  }
}

/** Layout window: calls back on every state the main window sends. */
export function subscribeMirror(onState: (s: MirrorState) => void) {
  const channel = open()
  channel?.addEventListener('message', (e: MessageEvent<Message>) => {
    if (e.data?.type === 'state') onState(e.data.state)
  })
  channel?.postMessage({ type: 'hello' } satisfies Message)
}

/** The panels of a layout window: their own ground, or none, so a chroma key takes them out with the background. */
export const WINDOW_PANELS = ['solid', 'clear'] as const
export type WindowPanels = typeof WINDOW_PANELS[number]

/** `?window=<layout>&bg=…&panels=…`: the layout (a preset id or "saved:name"), its background and panels; null in the main window. */
export function layoutWindowParams(): { layout: string; background: string; panels: WindowPanels } | null {
  const params = new URLSearchParams(location.search)
  const layout = params.get('window')
  if (!layout) return null
  const bg = params.get('bg') as ViewBackground | null
  return { layout, background: (bg && VIEW_BACKGROUNDS[bg]) || VIEW_BACKGROUNDS.magenta, panels: params.get('panels') === 'clear' ? 'clear' : 'solid' }
}

export function layoutWindowUrl(layout: string, bg: ViewBackground, panels: WindowPanels, base = location.href): string {
  const url = new URL(base)
  url.search = new URLSearchParams({ window: layout, bg, panels }).toString()
  url.hash = ''
  return url.toString()
}
