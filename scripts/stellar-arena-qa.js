const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const [origin = 'http://127.0.0.1:4183/', output = 'test-artifacts/stellar-arena', type] = process.argv.slice(2);
const viewport = type === 'compact' ? { width: 320, height: 568 } : { width: 390, height: 844 };

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block',
    recordVideo: { dir: output, size: viewport } });
  const page = await context.newPage();
  const touch = await context.newCDPSession(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/\/app\.mjs(\?|$)/, async (route) => {
    const source = await route.fetch();
    await route.fulfill({ response: source, body: (await source.text()) + '\nwindow.arenaQA={state,renderer};' });
  });
  const snapshot = () => page.evaluate(() => {
    const { state, renderer } = window.arenaQA;
    const f = state.flight;
    return { unit: renderer.unit, mix: f.arenaMix, area: f.movementBounds, x: f.player.x, y: f.player.y,
      projectedX: renderer.canvas.clientWidth / 2 + (f.player.x - 192) * renderer.unit,
      outline: getComputedStyle(renderer.canvas).outlineStyle, focused: document.activeElement === renderer.canvas };
  });
  const point = (x) => [{ x, y: Math.round(viewport.height * .69), id: 1 }];
  const moveAcross = async (from, to) => {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from) });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(to) });
    await page.waitForFunction(() => {
      const { flight: f } = window.arenaQA.state;
      return Math.abs(f.player.x - f.xIntent) < 1;
    });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const shot = (name) => page.screenshot({ path: path.join(output, `${name}.png`) });
  try {
    const meta = await (await page.request.get(new URL('/version.json', origin))).json();
    await page.goto(origin);
    await page.getByRole('button', { name: 'Play', exact: true }).tap();
    await page.getByRole('button', { name: /01 Vesper Orbit/ }).tap();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    const normal = await snapshot();
    assert.equal(normal.focused, true);
    assert.equal(normal.outline, 'none');
    assert.equal(normal.mix, 0);

    // Let an actual surviving fighter reach the bottom. No armor, movement, reward or timer is assigned.
    await page.waitForFunction(() => window.arenaQA.state.flight.enemies.some((e) => e.loop && e.y < 640 && e.y > 440));
    const seen = await page.evaluate(() => {
      const f = window.arenaQA.state.flight;
      window.arenaQA.returning = f.enemies.find((e) => e.loop && e.y < 640 && e.y > 440);
      const e = window.arenaQA.returning;
      return { kind: e.kind, edge: e.loop.edge, hull: e.hull, heading: e.turn };
    });
    assert.ok(seen.heading > 3 && seen.hull > 0);
    await shot('edge-return');
    await page.waitForFunction(() => window.arenaQA.returning.returned);
    const reentry = await page.evaluate(() => {
      const e = window.arenaQA.returning;
      return { hull: e.hull, y: e.y, turn: e.turn };
    });
    assert.equal(reentry.hull, seen.hull);
    assert.ok(reentry.y < 0 && Math.abs(reentry.turn) < .3);
    await shot('reentry');

    await page.evaluate(() => {
      const { flight: f } = window.arenaQA.state;
      f.elapsed = f.stage.bossAt - .02;
      f.waveIndex = f.stage.waves.length;
      f.dropIndex = f.stage.drops.length;
    });
    await page.waitForFunction(() => window.arenaQA.state.flight.boss?.age > 1.6);
    const wide = await snapshot();
    assert.equal(wide.mix, 1);
    assert.ok(Math.abs(normal.unit / wide.unit - 1.22) < .005);
    assert.ok(wide.area.left < 0 && wide.area.right > 384 && wide.area.bottom > normal.area.bottom);
    assert.equal(wide.outline, 'none');
    await moveAcross(24, viewport.width - 9);
    const right = await snapshot();
    assert.ok(right.x > normal.area.right && right.projectedX < viewport.width - 8);
    await shot('expanded-right');
    await moveAcross(viewport.width - 16, 13);
    const left = await snapshot();
    assert.ok(left.x < normal.area.left && left.projectedX > 8);
    await shot('expanded-left');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'arena-browser.json'), JSON.stringify({ meta, viewport, normal, wide, left, right, seen, reentry }, null, 2));
    console.log(JSON.stringify({ viewport, before: normal.unit, after: wide.unit, left: left.x, right: right.x, seen, reentry }));
  } finally {
    await context.close();
    await page.video()?.saveAs(path.join(output, 'arena-in-motion.webm'));
    await page.video()?.delete();
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
