// Line icons of the toolbar, drawn in the text colour (currentColor) at 18 px.

const line = (body: string) =>
  `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const ICONS = {
  keyboard: line('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h1M10 10h1M14 10h1M18 10h0M7 14h10"/>'),
  mic: line('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  play: '<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>',
  layout: line('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>'),
  present: line('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  views: line('<rect x="3" y="7" width="14" height="13" rx="1.5"/><path d="M7 4h14v13"/>'),
  settings: line('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  more: '<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
}

/** The app's mark (icons/icon.svg): three beamed eighth notes, as written with a pen. */
export const LOGO = `<svg class="logo-mark" width="26" height="26" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="124" fill="var(--logo-bg)"/><g fill="var(--logo-ink)"><path d="M146 206 Q272 152 398 142 L398 93.1 Q272 101.6 146 154 Z"/><path d="M155 186.6 L155 376.2 M273 147.1 L273 338.2 M389 127.2 L389 302.2" fill="none" stroke="var(--logo-ink)" stroke-width="18" stroke-linecap="round"/><path d="M94 384 C94 367.1 110.1 358 130 358 C153.5 358 166 369.6 166 384 C166 395.8 149.9 411.9 130 410 C106.5 410 94 398.4 94 384 Z" transform="rotate(-24 130 384)"/><path d="M212 346 C212 329.1 228.1 320 248 320 C271.5 320 284 331.6 284 346 C284 357.8 267.9 373.9 248 372 C224.5 372 212 360.4 212 346 Z" transform="rotate(-24 248 346)"/><path d="M328 310 C328 293.1 344.1 284 364 284 C387.5 284 400 295.6 400 310 C400 321.8 383.9 337.9 364 336 C340.5 336 328 324.4 328 310 Z" transform="rotate(-24 364 310)"/></g></svg>`
