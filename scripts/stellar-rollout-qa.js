const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const [installedDir, nextDir, output = 'test-artifacts/stellar-rollout'] = process.argv.slice(2);
if (!installedDir || !nextDir) throw Error('Usage: node scripts/stellar-rollout-qa.js INSTALLED_DIST NEXT_DIST [OUTPUT]');

const types = {
  '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png',
  '.webp':'image/webp', '.woff2':'font/woff2', '.mp3':'audio/mpeg', '.txt':'text/plain'
};

async function manifest(dir) {
  return JSON.parse(await fs.readFile(path.join(dir, 'version.json'), 'utf8'));
}

async function controllerReady(page, pack) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(async (expected) => {
      const worker = navigator.serviceWorker.controller;
      if (!worker) return false;
      const channel = new MessageChannel();
      const current = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 500);
        channel.port1.onmessage = ({ data }) => { clearTimeout(timeout); resolve(data); };
        worker.postMessage('stellar-pack-status', [channel.port2]);
      });
      channel.port1.close();
      if (current?.ready !== true || current.version !== expected) return false;
      const cache = await caches.open(`stellar-flight-${expected}`);
      return Boolean(await cache.match('/index.html'));
    }, pack);
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error(`Flight pack ${pack} did not become ready`);
}

async function main() {
  const installed = await manifest(installedDir);
  const incoming = await manifest(nextDir);
  assert.notEqual(installed.assetVersion, incoming.assetVersion);
  const absent = `/arcade/${incoming.assetVersion}/app.mjs`;
  let served = path.resolve(installedDir);
  let withholdModule = false;
  let unavailable = 0;
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (withholdModule && pathname === absent) {
      unavailable++;
      response.writeHead(503, { 'Cache-Control':'no-store' }).end('Flight module temporarily unavailable');
      return;
    }
    const file = path.resolve(served, `.${pathname === '/' ? '/index.html' : pathname}`);
    try {
      if (!file.startsWith(served + path.sep)) throw Error('Outside fixture directory');
      const body = await fs.readFile(file);
      const policy = pathname.startsWith('/arcade/') ? 'public, max-age=31536000, immutable' : 'no-store';
      response.writeHead(200, { 'Content-Type':types[path.extname(file)] ?? 'application/octet-stream',
        'Cache-Control':policy,
        'Content-Security-Policy':"default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" }).end(body);
    } catch {
      response.writeHead(404, { 'Cache-Control':'no-store' }).end('Missing');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  try {
    await fs.mkdir(output, { recursive:true });
    const context = await browser.newContext({ viewport:{ width:320,height:568 }, hasTouch:true, isMobile:true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const button = (name) => page.getByRole('button', { name, exact:typeof name === 'string' });
    const checkBase = async (pack) => assert.equal(await page.evaluate(() => document.baseURI), `${url}arcade/${pack}/`);
    const refresh = () => page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());

    await page.goto(url);
    await button('Play').waitFor();
    await controllerReady(page, installed.assetVersion);
    await button('Settings').tap();
    await button('High contrast hazards').tap();
    await page.getByRole('button', { name:'High contrast hazards', pressed:true }).waitFor();
    await page.reload();
    await button('Play').waitFor();

    served = path.resolve(nextDir);
    withholdModule = true;
    const interrupted = await page.goto(`${url}?rollout=interrupted`, { waitUntil:'domcontentloaded' });
    assert.equal(interrupted.fromServiceWorker(), true, 'The interrupted rollout must exercise the installed worker');
    await button('Play').waitFor({ timeout:5000 });
    await checkBase(installed.assetVersion);
    await refresh().catch(() => {});
    await page.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration()).installing);
    await controllerReady(page, installed.assetVersion);
    assert.ok(unavailable > 0, 'Replacement install must encounter the withheld app module');
    await page.screenshot({ path:path.join(output,'installed-menu.png') });
    await button('Play').tap();
    await button(/^01 Vesper Orbit/).tap();
    await page.waitForFunction(() => document.querySelector('#clock')?.textContent === '00:02');
    await button('Pause').tap();
    await page.getByRole('heading', { name:'Paused' }).waitFor();

    withholdModule = false;
    await refresh();
    await controllerReady(page, incoming.assetVersion);
    await checkBase(installed.assetVersion);
    assert.equal(await button('Update browser build').isVisible(), false);
    await context.setOffline(true);
    const audio = await page.evaluate(async (pack) => {
      const old = await fetch(`/arcade/${pack}/audio/gravitys-edge.mp3`, { headers:{ Range:'bytes=0-511' } });
      return { status:old.status, bytes:(await old.arrayBuffer()).byteLength };
    }, installed.assetVersion);
    assert.deepEqual(audio, { status:206,bytes:512 });
    await context.setOffline(false);
    await button('Resume').tap();
    await page.waitForFunction(() => document.querySelector('#clock')?.textContent >= '00:03');
    await button('Pause').tap();
    await button('Leave flight').tap();
    await button('Leave flight').tap();
    await page.getByRole('heading', { name:'Stage Select' }).waitFor();
    const update = button('Update browser build');
    const menuUpdateOffered = await update.waitFor({ timeout:3500 }).then(() => true, () => false);
    if (menuUpdateOffered) await update.tap();
    else await page.reload();
    await button('Play').waitFor();
    await checkBase(incoming.assetVersion);
    await button('Settings').tap();
    await page.getByRole('button', { name:'High contrast hazards', pressed:true }).waitFor();
    await page.getByText('Offline flight pack ready.', { exact:true }).waitFor();
    assert.deepEqual(errors, []);
    const result = { installed, incoming, fromServiceWorker:interrupted.fromServiceWorker(), failedModuleRequests:unavailable, playableWhileWithheld:true,
      pausedFlightPreserved:true, oldAudioOffline:audio, menuUpdateOffered, fullReplacementActivated:true, settingsPreserved:true };
    await fs.writeFile(path.join(output,'rollout.json'), JSON.stringify(result,null,2) + '\n');
    console.log(JSON.stringify(result));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
