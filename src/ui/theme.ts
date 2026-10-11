// The page's colours. The tokens live in styles.css, one block per theme, and the page takes
// them through var(). The SVG diagrams write their colours into the drawing, so they read
// the same tokens here and are drawn again when the theme changes.

import { loadChoice, save } from './storage'

// Dark and light, and colour themes on either ground: high contrast (dark) and paper (light)
export type Theme = 'dark' | 'light' | 'contrast' | 'paper'
export type ThemeChoice = 'system' | Theme
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'dark', 'light', 'contrast', 'paper']

const KEY = 'theme'

export function getThemeChoice(): ThemeChoice {
  return loadChoice(KEY, THEME_CHOICES, 'system')
}

function systemPrefersLight(): boolean {
  try { return matchMedia('(prefers-color-scheme: light)').matches } catch { return false }
}

/** The theme shown for a choice; "system" follows the operating system. The script in index.html does the same before the first paint. */
export function resolveTheme(choice: ThemeChoice = getThemeChoice()): Theme {
  return choice === 'system' ? (systemPrefersLight() ? 'light' : 'dark') : choice
}

const cache = new Map<string, string>()

/** A token's value in the theme shown ('cof-tonic' → '#4f46e5'), for colours written into an SVG. */
export function color(token: string): string {
  let v = cache.get(token)
  if (v === undefined) {
    v = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim()
    cache.set(token, v)
  }
  return v
}

export function applyTheme(theme: Theme = resolveTheme()) {
  document.documentElement.dataset.theme = theme
  cache.clear()
}

const listeners: (() => void)[] = []

/** Calls `onChange` after the theme shown changes: a new choice, or the system's while the choice follows it. */
export function onThemeChange(onChange: () => void) {
  listeners.push(onChange)
}

function changed() {
  applyTheme()
  listeners.forEach(f => f())
}

export function saveThemeChoice(choice: ThemeChoice) {
  save(KEY, choice)
  changed()
}

/** Follows the system's theme while the choice is "system". */
export function followSystemTheme() {
  try {
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (getThemeChoice() === 'system') changed()
    })
  } catch { }
}
