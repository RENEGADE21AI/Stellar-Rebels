const assert = require('node:assert/strict');
const test = require('node:test');
const { chromium, webkit } = require('playwright');

const origin = process.env.STELLAR_WEB_URL;

test('production web artifact uses touch, atomic saves, and a recoverable offline pack', { skip: !origin, timeout: 60000 }, async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(origin);
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
    await page.locator('.brand-lockup img').evaluate((image) => image.decode());
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    const manifest = await (await page.request.get(`${origin}site.webmanifest`)).json();
    assert.equal(manifest.name, 'Stellar Rebels');
    assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ['192x192', '512x512']);
    const report = await page.evaluate(async () => {
      const main = document.querySelector('script[type=module]').src;
      const { PilotStore, beginRun, settleRun, install } = await import(new URL('pilot.mjs', main));
      const a = new PilotStore(indexedDB);
      const b = new PilotStore(indexedDB);
      await Promise.all([a.open(), b.open()]);
      const result = { status:'clear', score:8200, duration:180, kills:27, mastery:true };
      await a.change((p) => beginRun(p, 'same', 'arcade', 1));
      const [first, second] = await Promise.all([a.change((p) => settleRun(p,'same',result)), b.change((p) => settleRun(p,'same',result))]);
      const [buy1,buy2] = await Promise.all([a.change((p) => install(p,'rails')), b.change((p) => install(p,'rails'))]);
      const failedWrite = await a.change((p) => { p.salvage += 999; throw Error('synthetic abort'); }).then(() => false, () => true);
      const current = await b.load();
      a.db.close();
      b.db.close();
      return { duplicate1:first.result.award, duplicate2:second.result.award, buys:[buy1.result,buy2.result], failedWrite,
        salvage:current.salvage, clears:current.clears[1], mastered:current.mastery[1] };
    });
    assert.deepEqual(report, { duplicate1:78, duplicate2:78, buys:[true,false], failedWrite:true, salvage:8, clears:1, mastered:true });

    await page.reload();
    await page.getByRole('button', { name:'Play', exact:true }).tap();
    await page.getByRole('button', { name:/01 Vesper Orbit/ }).tap();
    await page.getByRole('button', { name:'Pause', exact:true }).waitFor();
    const hp = await page.getByRole('meter', { name:'Hull' }).getAttribute('aria-valuenow');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.getByRole('heading', { name:'Paused' }).waitFor();
    assert.equal(await page.locator('#hull').getAttribute('aria-valuenow'), hp);
    const dimensions = await page.locator('#pause').boundingBox();
    assert.ok(dimensions.width >= 44 && dimensions.height >= 44);
    await page.getByRole('button', { name:'Resume', exact:true }).tap();
    await page.getByRole('heading', { name:/Resuming in/ }).waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.getByRole('heading', { name:'Paused' }).waitFor();
    assert.equal(await page.locator('#hull').getAttribute('aria-valuenow'), hp);

    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name:'Settings', exact:true }).tap();
    await page.getByText('Offline. Flight pack available.').waitFor();
    const audio = await page.evaluate(async () => {
      const main = document.querySelector('script[type=module]').src;
      const response = await fetch(new URL('audio/gravitys-edge.mp3', main), { headers:{Range:'bytes=0-63'} });
      return { status:response.status, bytes:(await response.arrayBuffer()).byteLength };
    });
    assert.deepEqual(audio,{status:206,bytes:64});
    await page.evaluate(async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('stellar-flight-')) await caches.delete(key);
      }
    });
    await page.reload();
    await page.getByRole('heading', { name:'Flight pack missing' }).waitFor();
    await context.setOffline(false);
    await page.reload();
    await page.getByRole('button', { name:'Play', exact:true }).waitFor();
    await page.getByRole('button', { name:'Settings', exact:true }).tap();
    await page.getByText('Offline flight pack ready.').waitFor();
    await page.getByRole('button', { name:'Back' }).tap();
    await page.evaluate(async () => {
      const key = (await caches.keys()).find((name) => name.startsWith('stellar-flight-'));
      const cache = await caches.open(key);
      const part = (await cache.keys()).find((file) => file.url.endsWith('/gatekeeper.png'));
      await cache.delete(part);
    });
    await page.getByRole('button', { name:'Settings', exact:true }).tap();
    await page.getByText('Offline flight pack incomplete. Reload to download missing files.').waitFor();
    await page.reload();
    await page.getByRole('button', { name:'Settings', exact:true }).tap();
    await page.getByText('Offline flight pack ready.').waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('mobile WebKit can launch, pause and resume the production artifact', { skip: !origin, timeout: 60000 }, async () => {
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true, deviceScaleFactor:1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByRole('button', { name:'Play', exact:true }).tap();
    await page.getByRole('button', { name:/01 Vesper Orbit/ }).tap();
    await page.getByRole('button', { name:'Pause', exact:true }).tap();
    await page.getByRole('heading', { name:'Paused' }).waitFor();
    await page.getByRole('button', { name:'Resume', exact:true }).tap();
    await page.locator('#flight-modal').waitFor({ state:'hidden' });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('restoring IndexedDB reconciles temporary results with the actual saved receipt', { skip: !origin, timeout:60000 }, async () => {
  const browser = await chromium.launch();
  try {
    for (const existing of [true,false]) {
      const context = await browser.newContext({ viewport:{ width:320, height:568 }, isMobile:true, hasTouch:true, serviceWorkers:'block' });
      try {
        const page = await context.newPage();
        await page.route(/\/app\.mjs(\?|$)/, async (route) => {
          const response = await route.fetch();
          await route.fulfill({response, body:(await response.text())+'\nwindow.storageFixture = state;'});
        });
        if (existing) {
          await page.goto(origin);
          await page.getByRole('button', { name:'Play', exact:true }).waitFor();
        }
        await page.addInitScript(() => {
          const open = indexedDB.open.bind(indexedDB);
          window.failOpen = sessionStorage.getItem('fixture-storage-restored') !== 'yes';
          indexedDB.open = (...args) => {
            if (window.failOpen) throw Error('IndexedDB test fixture');
            return open(...args);
          };
        });
        await page.goto(origin);
        const banner = page.getByText('Progress is temporary until device saving returns.');
        const play = page.getByRole('button', { name:'Play', exact:true });
        await play.waitFor();
        for (const state of ['home','stages']) {
          if (state === 'stages') await play.tap();
          const box = await banner.boundingBox();
          assert.ok(box.y >= 0 && box.y + box.height < 568, JSON.stringify(box));
        }
        await page.getByRole('button', { name:/01 Vesper Orbit/ }).tap();
        await page.getByRole('button', { name:'Pause', exact:true }).waitFor();
        // Only the storage path is under test here. The real campaign tests clear by play.
        await page.evaluate(() => { window.storageFixture.flight.status = 'clear'; });
        await page.getByText(/78 Salvage this session/).waitFor();
        await page.evaluate(() => {
          window.failOpen = false;
          sessionStorage.setItem('fixture-storage-restored','yes');
        });
        await page.getByRole('button', { name:'Retry storage', exact:true }).tap();
        if (existing) {
          await page.getByText('This flight was temporary. Your existing device save is active.').waitFor();
          assert.equal(await page.getByText(/Salvage banked|Asteroid Belt unlocked/).count(),0);
        } else {
          await page.getByText(/78 Salvage banked/).waitFor();
          await page.getByText('Asteroid Belt unlocked').waitFor();
        }
        await page.reload();
        await page.getByRole('button', { name:'Play', exact:true }).tap();
        assert.equal(await page.getByRole('button', {name:/02 Asteroid Belt/}).isEnabled(), !existing);
        await page.getByText(existing ? '0 Salvage' : '78 Salvage', {exact:true}).waitFor();
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});
