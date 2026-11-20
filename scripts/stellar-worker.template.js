const version = '__VERSION__';
const cacheName = `stellar-flight-${version}`;
const files = __PACK__;
const precache = new Set(files);
const generationPath = cacheName.replace('stellar-flight-', '/arcade/') + '/';

async function packReady(cache) {
  const present = new Set((await cache.keys()).map((entry) => new URL(entry.url).pathname));
  return files.every((url) => present.has(url));
}

async function fillPack(cache, home = null) {
  home ??= await fetch('/index.html', { cache: 'reload' });
  if (!home.ok || !(await home.clone().text()).includes(generationPath)) throw Error('Flight pack generation changed');
  await cache.addAll(files.filter((url) => url !== '/index.html').map((url) => new Request(url, { cache: 'reload' })));
  await cache.put('/index.html', home);
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
    const requested = home ? '/index.html' : url.pathname;
    const cached = await cache.match(requested);
    if (home) {
      // A document navigation is a safe update point. Open documents continue using their pinned assets.
      const fresh = await (async () => {
        const response = await fetch('/index.html', { cache: 'no-store', signal: AbortSignal.timeout?.(2200) });
        return response.ok ? { html: await response.text(), headers: new Headers(response.headers) } : null;
      })().catch(() => null);
      if (fresh?.html.includes('data-pack="true"')) {
        // Repair may outlive the fetch timeout. Return the completed document body independently of that request.
        fresh.headers.delete('content-encoding');
        fresh.headers.delete('content-length');
        const document = new Response(fresh.html, { headers: fresh.headers });
        if (fresh.html.includes(generationPath) && !await packReady(cache)) await fillPack(cache, document.clone()).catch(() => {});
        return document;
      }
    }
    if (cached && (!home || await packReady(cache))) return request.headers.has('Range') ? fromRange(request, cached) : cached;
    try {
      if (home) {
        await fillPack(cache).catch(() => {});
        if (await packReady(cache)) return cache.match('/index.html');
      }
      const response = await fetch(request, { cache: 'no-store' });
      if (!home && response.status === 200) await cache.put(url.pathname, response.clone());
      return response;
    } catch {
      if (!home) return Response.error();
      return (await cache.match('/offline.html')) ?? new Response(
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stellar Rebels</title><main><h1>Flight pack missing</h1><p>Reconnect and reload. Your device save is stored separately.</p><a href="/">Reload</a></main>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
  })());
});
