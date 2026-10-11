import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { applyTheme, color } from '../src/ui/theme'
import { renderCircleOfFifths } from '../src/diagrams/cof'

afterEach(() => applyTheme('dark'))

const css = readFileSync(resolve('src/styles.css'), 'utf8')
const block = (selector: string) => {
  const start = css.indexOf(selector)
  return css.slice(start, css.indexOf('}', start))
}
const tokensIn = (text: string) => new Set([...text.matchAll(/--([\w-]+)\s*:/g)].map(m => m[1]))
const dark = tokensIn(block(':root, :root[data-theme="dark"]'))
const light = tokensIn(block(':root[data-theme="light"]'))

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? sources(p) : /\.(ts|css)$/.test(f) ? [p] : []
  })
}
const src = resolve('src')
const code = sources(src).map(p => readFileSync(p, 'utf8')).join('\n')

describe('theme tokens', () => {
  it('both themes define the same tokens', () => {
    expect([...light].sort()).toEqual([...dark].sort())
  })

  it('every token the code uses exists', () => {
    const used = new Set([
      ...[...code.matchAll(/var\(--([\w-]+)\)/g)].map(m => m[1]),
      ...[...code.matchAll(/\bcolor\('([\w-]+)'\)/g)].map(m => m[1]),
    ])
    for (const tok of used) expect(dark.has(tok), tok).toBe(true)
  })

  it('no colour is written outside the theme, but the print view and the chroma backgrounds', () => {
    const rest = css.slice(css.indexOf('/* ─── Reset & base'))
    expect(rest.match(/#[0-9a-f]{3,8}\b/gi)).toBeNull()
  })
})

describe('color', () => {
  it('reads the theme shown, again after a change', () => {
    expect(color('bg')).toBe('#1a1a2e')
    applyTheme('light')
    expect(color('bg')).toBe('#f4f5f9')
  })

  it('the circle is drawn in the theme shown', () => {
    applyTheme('light')
    const el = document.createElement('div')
    renderCircleOfFifths(el, 'C Major', null, () => {}, 200)
    expect(el.querySelector('[data-chord="E"]')!.getAttribute('fill')).toBe(color('cof-segment'))
    // The label on the tonic stays readable on its dark mark
    const label = [...el.querySelectorAll('text')].find(t => t.textContent === 'C')!
    expect(label.getAttribute('fill')).toBe('#ffffff')
  })
})
