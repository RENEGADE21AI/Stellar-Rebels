const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const origin = process.argv[2] ?? 'http://127.0.0.1:4182/arcade/index.html';
const out = path.resolve(process.argv[3] ?? 'test-artifacts/stellar');
const read = (page) => page.evaluate(() => {
  const { state } = globalThis.capture;
  const f = state.flight;
  return { mode: state.mode, x: f?.player.x, y: f?.player.y, hull: f?.player.hull, elapsed: f?.elapsed, score: f?.score, stage: f?.stage.id };
});

async function open(browser, viewport, prefix) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.route(/\/app\.mjs(\?|$)/, async (route) => {
    const response = await route.fetch();
    const code = await response.text();
    await route.fulfill({ response, body: `${code}\nglobalThis.capture = { state, renderer, store };\n` });
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const save = (scene) => page.screenshot({ path: path.join(out, `${prefix}-${scene}.png`), animations: 'disabled' });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await save('title');
  await page.getByRole('button', { name: 'Hangar', exact: true }).click();
  await page.locator('img.craft-art').evaluate((img) => img.decode());
  await save('hangar');
  await page.getByRole('button', { name: 'Back', exact: false }).click();
  await page.getByRole('button', { name: 'Stage Select', exact: true }).click();
  await save('stages');
  await page.getByRole('button', { name: /01 Vesper Orbit/ }).click();
  await page.waitForFunction(() => globalThis.capture?.state.mode === 'playing');
  const before = await read(page);
  const touch = await context.newCDPSession(page);
  const x = Math.round(viewport.width * .52);
  const y = Math.round(viewport.height * .88);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 55, y: y - 27 }] });
  await page.waitForTimeout(450);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const moved = await read(page);
  assert.ok(moved.x < before.x - 30 && moved.y < before.y - 10, 'relative touch drag moved both axes');
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x + 60, y: y - 113 }] });
  await page.waitForTimeout(100);
  const reanchored = await read(page);
  assert.ok(Math.hypot(reanchored.x - moved.x, reanchored.y - moved.y) < 2, 'new touch anchor did not teleport the ship');
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('heading', { name: 'Paused' }).waitFor();
  const pause = await read(page);
  await page.waitForTimeout(220);
  assert.deepEqual(await read(page), pause, 'pause freezes position, time and hull');
  assert.equal(pause.hull, moved.hull);
  await save('pause');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(() => globalThis.capture.state.mode === 'playing');
  await page.waitForFunction(() => globalThis.capture.state.flight.elapsed >= 5.6);
  await save('opening-gameplay');
  // Seek a local replay fixture to the boss. Assets, warnings, attacks and Canvas are the game runtime.
  await page.evaluate(() => {
    const f = globalThis.capture.state.flight;
    f.elapsed = f.stage.bossAt - .07;
    f.waveIndex = f.stage.waves.length;
    f.dropIndex = f.stage.drops.length;
  });
  await page.waitForFunction(() => globalThis.capture.state.flight.boss?.attack >= 2);
  await save('gatekeeper-fixture');
  assert.deepEqual(errors, []);
  await context.close();
  return { viewport, openingScore: (await Promise.resolve(moved)).score, movement: { from: before.x, to: moved.x }, pauseHull: pause.hull };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(process.env.ARCADE_CHROMIUM ? { executablePath: process.env.ARCADE_CHROMIUM } : {});
  try {
    const result = [];
    for (const [viewport, prefix] of [[{ width: 390, height: 844 }, 'tall'], [{ width: 320, height: 568 }, 'compact']]) {
      result.push(await open(browser, viewport, prefix));
    }
    fs.writeFileSync(path.join(out, 'slice-browser.json'), JSON.stringify({ origin, result, bossCapture: 'state-seeded visual fixture' }, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
