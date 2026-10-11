// Loads the real UMT bundle as the `UMT` global, the same way index.html does.
// The devDependency is pinned to the same release tag as the CDN, so tests run
// against the library the app actually uses.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const umtPath = require.resolve('umt/iife')   // the IIFE build, exported as ./iife

// Indirect eval runs in global scope, so the bundle's top-level `var UMT` becomes a global.
;(0, eval)(readFileSync(umtPath, 'utf8'))
