const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const [site, prior, output = 'test-artifacts/stellar-update'] = process.argv.slice(2);
if (!site || !prior) throw Error('Usage: node scripts/stellar-update-qa.js SITE PREVIOUS_PACK [OUTPUT]');
const origin = new URL(site).origin;

async function observe() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + '/');
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
    assert.match(await page.evaluate(() => document.baseURI), new RegExp(`/arcade/${prior}/$`));
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    const motion = page.getByRole('button', { name: 'Reduced motion', exact: true });
    if (await motion.getAttribute('aria-pressed') !== 'true') await motion.tap();
    await page.getByRole('button', { name: 'Reduced motion', exact: true, pressed: true }).waitFor();
    await page.getByRole('button', { name: 'Back', exact: true }).tap();
    await page.getByRole('button', { name: 'Play', exact: true }).tap();
    const firstStage = page.getByRole('button', { name: /01 Vesper Orbit/ });
    if (await firstStage.or(page.locator("#flight:not([hidden])")).first().waitFor().then(() => firstStage.isVisible())) await firstStage.tap();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    const touch = await context.newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 185, y: 580 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 265, y: 571 }] });
    await page.waitForFunction(() => document.getElementById('clock')?.textContent === '00:02');
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.getByRole('button', { name: 'Pause', exact: true }).tap();
    await page.getByRole('heading', { name: 'Paused', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'previous-flight.png') });
    console.log(`Keeping a paused flight open on ${prior}.`);
    fs.writeFileSync(path.join(output, 'previous-ready.json'), JSON.stringify({ origin, prior }));

    let latest;
    const until = Date.now() + 600_000;
    while (Date.now() < until) {
      const response = await page.request.get(origin + '/version.json', { headers: { 'cache-control': 'no-cache' }, timeout: 8000 }).catch(() => null);
      const release = response?.ok() ? await response.json() : null;
      if (release && release.assetVersion !== prior) {
        latest = release;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    assert.ok(latest, 'A later live release did not arrive before the test deadline');
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForFunction(async (version) => {
      const worker = navigator.serviceWorker.controller;
      if (!worker) return false;
      const channel = new MessageChannel();
      const result = await new Promise((resolve) => {
        setTimeout(() => resolve(false), 950);
        channel.port1.onmessage = (evt) => resolve(evt.data?.version === version && evt.data.ready);
        worker.postMessage('stellar-pack-status', [channel.port2]);
      });
      channel.port1.close();
      return result;
    }, latest.assetVersion, { timeout: 90000 });
    assert.match(await page.evaluate(() => document.baseURI), new RegExp(`/arcade/${prior}/$`));
    assert.equal(await page.getByRole('heading', { name: 'Paused', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Update browser build' }).isVisible(), false);
    await context.setOffline(true);
    const retained = await page.evaluate(async (old) => {
      const response = await fetch(`/arcade/${old}/media/sprites/kestrel.png`);
      return { status: response.status, bytes: (await response.arrayBuffer()).byteLength };
    }, prior);
    assert.equal(retained.status, 200);
    assert.ok(retained.bytes > 1000);
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Resume', exact: true }).tap();
    await page.locator('#flight-modal').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.getElementById('clock').textContent >= '00:03');
    await page.getByRole('button', { name: 'Pause', exact: true }).tap();
    await page.getByRole('button', { name: 'Leave flight', exact: true }).tap();
    const leave = page.getByRole('button', { name: 'Leave flight', exact: true });
    await leave.tap();
    const update = page.getByRole('button', { name: 'Update browser build' });
    const hasUpdateButton = await update.waitFor({ timeout: 5000 }).then(() => true, () => false);
    if (hasUpdateButton) {
      await update.tap();
    } else {
      await page.goto(origin + '/');
    }
    await page.waitForFunction((version) => document.baseURI.endsWith(`/arcade/${version}/`), latest.assetVersion);
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
    assert.match(await page.evaluate(() => document.baseURI), new RegExp(`/arcade/${latest.assetVersion}/$`));
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    assert.equal(await page.getByRole('button', { name: 'Reduced motion', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByText('Offline flight pack ready.', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'update-verified.json'), JSON.stringify({ origin, prior, retained, latest, hasUpdateButton, errors }, null, 2));
    console.log(`Verified the preserved flight and saved settings across ${prior} → ${latest.assetVersion}.`);
  } finally {
    await browser.close();
  }
}

observe().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
