// Loads the real UMT bundle as the `UMT` global, the same way index.html does.
// The devDependency is pinned to the same release tag as the CDN, so tests run
// against the library the app actually uses.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const umtPath = require.resolve('umt/iife')   // the IIFE build, exported as ./iife

// Indirect eval runs in global scope, so the bundle's top-level `var UMT` becomes a global.
// The bundle starts with "use strict", and a strict eval keeps its vars to itself: without
// a DOM environment nothing else puts UMT on the global object, so the bundle does.
;(0, eval)(readFileSync(umtPath, 'utf8') + '\n;globalThis.UMT = UMT')

// Without a DOM, Node's own navigator says the system's language (Spanish on this machine);
// the tests read English, as jsdom's navigator says. The Spanish tests switch on their own.
if (typeof document === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US', languages: ['en-US'] }, configurable: true })
}
