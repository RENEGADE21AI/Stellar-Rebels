const version = '__VERSION__';
const cacheName = `stellar-flight-${version}`;
const files = __PACK__;
const precache = new Set(files);
const generationPath = cacheName.replace('stellar-flight-', '/arcade/') + '/';

async function packReady(cache) {
  const present = new Set((await cache.keys()).map((entry) => new URL(entry.url).pathname));
  return files.every((url) => present.has(url));
}

async function fillPack(cache, signal) {
  const home = await fetch('/index.html', { cache: 'reload', signal });
  if (!home.ok) throw Error('Flight document unavailable');
  const html = await home.text();
  if (!html.includes(generationPath)) throw Error('Flight pack generation changed');
  const headers = new Headers(home.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  const assets = files.filter((url) => url !== '/index.html');
  await cache.addAll(assets.map((url) => new Request(url, { cache: 'reload', signal })));
  await cache.put('/index.html', new Response(html, { headers }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then(fillPack).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // A newer controller also serves the pinned asset paths of still-open pages.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (!windows.length) {
      for (const key of await caches.keys()) {
        if (key.startsWith('stellar-flight-') && key !== cacheName) await caches.delete(key);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data !== 'stellar-pack-status' || !event.ports[0]) return;
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    event.ports[0].postMessage({ ready: await packReady(cache), version });
  })());
});

async function fromRange(request, cached) {
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') ?? '');
  if (!range || (!range[1] && !range[2])) return new Response(null, { status: 416 });
  const body = await cached.arrayBuffer();
  const length = body.byteLength;
  const start = range[1] ? Number(range[1]) : Math.max(0, length - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(length - 1, Number(range[2])) : length - 1;
  if (start >= length || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${length}` } });
  return new Response(body.slice(start, end + 1), { status: 206, headers: {
    'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${length}`,
    'Content-Type': cached.headers.get('Content-Type') ?? 'audio/mpeg', 'Content-Length': String(end - start + 1)
  } });
}

async function flightDocument(cache) {
  // Keep the installed document pinned until a replacement worker finishes installing.
  const installed = await cache.match('/index.html');
  if (installed && await packReady(cache)) return installed;

  const recovery = new AbortController();
  const timeout = setTimeout(() => recovery.abort(), 12_000);
  try {
    await fillPack(cache, recovery.signal);
    return await cache.match('/index.html');
  } catch {
    return (await cache.match('/offline.html')) ?? new Response(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stellar Rebels</title><main><h1>Flight pack missing</h1><p>Reconnect and reload. Your device save is stored separately.</p><a href="/">Reload</a></main>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const home = request.mode === 'navigate' && ['/', '/index.html'].includes(url.pathname);
  const requestedVersion = /^\/arcade\/([a-f0-9]{15})\//.exec(url.pathname)?.[1];
  if (!home && !precache.has(url.pathname)) {
    if (requestedVersion && requestedVersion !== version) {
      event.respondWith((async () => {
        const previous = `stellar-flight-${requestedVersion}`;
        if (await caches.has(previous)) {
          const cached = await (await caches.open(previous)).match(url.pathname);
          if (cached) return request.headers.has('Range') ? fromRange(request, cached) : cached;
        }
        return fetch(request);
      })());
    }
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    if (home) return flightDocument(cache);
    const cached = await cache.match(url.pathname);
    if (cached) return request.headers.has('Range') ? fromRange(request, cached) : cached;
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response.status === 200) await cache.put(url.pathname, response.clone());
      return response;
    } catch {
      return Response.error();
    }
  })());
});
