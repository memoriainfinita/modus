// localStorage access for UI preferences. A corrupt or missing value falls back to the
// default instead of breaking startup; storage being unavailable is not an error.

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : JSON.parse(raw) as T
  } catch { return fallback }
}

export function loadBool(key: string, fallback: boolean): boolean {
  const v = loadJSON<unknown>(key, fallback)
  return typeof v === 'boolean' ? v : fallback
}

export function loadNumber(key: string, fallback: number, min = -Infinity, max = Infinity): number {
  const raw = loadString(key, '')
  const v = Number(raw)
  return raw !== '' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
}

export function loadString(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

/** String restricted to a known set of values. */
export function loadChoice<T extends string>(key: string, choices: readonly T[], fallback: T): T {
  const v = loadString(key, fallback)
  return (choices as readonly string[]).includes(v) ? v as T : fallback
}

// A layout window reads the main window's preferences and writes none: its layout, songs and
// settings are the main window's, never overwritten from it
let readOnly = false
export function setStorageReadOnly() { readOnly = true }
export const isStorageReadOnly = () => readOnly

export function save(key: string, value: string | number | boolean | object | null) {
  if (readOnly) return
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
  } catch { }
}
