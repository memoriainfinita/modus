// Modus service worker: the app works offline once it has been opened.
// The page and its files (same origin): from the network when there is one, so a new build
// is seen at once, and from the cache without it. Instrument samples from the soundfont's
// host: from the cache once fetched, so an instrument played once plays offline.

const CACHE = 'modus-v1'
const SHELL = [
  './', 'index.html', 'dist/app.js', 'dist/app.css', 'manifest.webmanifest',
  'vendor/umt.js', 'vendor/notae.js', 'vendor/abcjs-basic-min.js', 'vendor/soundfont-player.min.js',
  'vendor/soundfonts/FluidR3_GM/acoustic_grand_piano-mp3.js', 'icons/icon.svg', 'icons/icon-192.png',
]
const SAMPLE_HOST = 'https://gleitz.github.io/'

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()))
})

async function networkFirst(req) {
  const cache = await caches.open(CACHE)
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
  } catch {
    // A view window (?view=…) is the same page
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' })
    if (hit) return hit
    throw new Error('offline and not cached')
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) cache.put(req, res.clone())
  return res
}

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  if (req.url.startsWith(self.location.origin)) e.respondWith(networkFirst(req))
  else if (req.url.startsWith(SAMPLE_HOST)) e.respondWith(cacheFirst(req))
})
