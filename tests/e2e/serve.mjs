// Static server for the e2e tests: serves the repo root on 127.0.0.1 (port 0 = any free one).
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' }

export async function serve(port = 0) {
  const server = createServer(async (req, res) => {
    const path = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)))
    if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return }
    try {
      const file = path.endsWith('\\') || path.endsWith('/') ? join(path, 'index.html') : path
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body)
    } catch { res.writeHead(404).end() }
  })
  await new Promise(r => server.listen(port, '127.0.0.1', r))
  return { server, url: `http://127.0.0.1:${server.address().port}/` }
}
