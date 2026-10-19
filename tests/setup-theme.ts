// The page's stylesheet in the test document: the theme tokens the diagrams read (ui/theme.ts).
// Only in files that run with a DOM (// @vitest-environment jsdom).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = readFileSync(resolve('src/styles.css'), 'utf8')
  document.head.appendChild(style)
}
