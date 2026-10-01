// Loads the real UMT bundle as the `UMT` global, the same way index.html does.
// The devDependency is pinned to the same commit as the CDN tag, so tests run
// against the library the app actually uses.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const umtPath = require.resolve('umt/dist/umt.js')

// Indirect eval runs in global scope, so the bundle's top-level `var UMT` becomes a global.
;(0, eval)(readFileSync(umtPath, 'utf8'))
