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
    return { unit: renderer.unit, playerSize: f.ship.size * renderer.unit, area: f.movementBounds, x: f.player.x, y: f.player.y,
      projectedX: renderer.canvas.clientWidth / 2 + (f.player.x - 192) * renderer.unit,
      outline: getComputedStyle(renderer.canvas).outlineStyle, focused: document.activeElement === renderer.canvas };
  });
  const point = (x) => [{ x, y: Math.round(viewport.height * .69), id: 1 }];
  const moveAcross = async (from, to) => {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from) });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(to) });
    await page.waitForFunction(() => {
      const { flight: f } = window.arenaQA.state;
      return Math.abs(f.player.x - f.xIntent) < .01;
    });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const shot = (name) => page.screenshot({ path: path.join(output, `${name}.png`) });
  try {
    const meta = await (await page.request.get(new URL('/version.json', origin).href)).json();
    await page.goto(origin);
    await page.getByRole('button', { name:'Arcade', exact: true }).tap();
    await page.getByRole('button', { name: /01 Vesper Orbit/ }).tap();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    const normal = await snapshot();
    assert.equal(normal.focused, true);
    assert.equal(normal.outline, 'none');

    // Let an actual surviving fighter reach the bottom. No armor, movement, reward or timer is assigned.
    await moveAcross(24, viewport.width - 9);
    await page.waitForFunction(() => {
      const { flight } = window.arenaQA.state;
      return flight.enemies.some((e) => e.loop && e.y < 640 && e.y > 440);
    }, null, { timeout:60000 });
    const seen = await page.evaluate(() => {
      const f = window.arenaQA.state.flight;
      window.arenaQA.returning = f.enemies.find((e) => e.loop && e.y < 640 && e.y > 440);
      const e = window.arenaQA.returning;
      return { kind: e.kind, edge: e.loop.edge, hull: e.hull, heading: e.turn, originalLane: e.home };
    });
    assert.ok(seen.heading > 3 && seen.hull > 0);
    await shot('edge-return');
    const returned = await page.waitForFunction(() => {
      const e = window.arenaQA.returning;
      return e.returned && { hull: e.hull, x: e.home, y: e.y, turn: e.turn };
    });
    const reentry = await returned.jsonValue();
    assert.equal(reentry.hull, seen.hull);
    assert.ok(Math.abs(reentry.x - seen.originalLane) >= 95);
    assert.ok(reentry.y < 90 && Math.abs(reentry.turn) < .3);
    await shot('reentry');
    await page.waitForFunction(() => window.arenaQA.state.flight.pickups.some((pickup) => pickup.y > 255 && pickup.y < 470));
    await shot('field-pickup');

    await page.evaluate(() => {
      const { flight: f } = window.arenaQA.state;
      f.elapsed = f.stage.cruiserAt - .02;
      f.waveIndex = f.stage.waves.findIndex((wave) => wave[0] > f.elapsed);
      f.dropIndex = f.stage.drops.findIndex((drop) => drop[0] > f.elapsed);
    });
    await page.waitForFunction(() => window.arenaQA.state.flight.cruiser?.age >= 5);
    const crossing = await snapshot();
    assert.equal(crossing.unit, normal.unit);
    assert.equal(crossing.playerSize, normal.playerSize);
    assert.deepEqual(crossing.area, normal.area);
    await shot('cruiser-crossing');

    await page.evaluate(() => {
      const { flight: f } = window.arenaQA.state;
      f.elapsed = f.stage.bossAt - .02;
      f.cruiser = null;
      f.waveIndex = f.stage.waves.length;
      f.dropIndex = f.stage.drops.length;
    });
    await page.waitForFunction(() => window.arenaQA.state.flight.boss?.age > 1.6);
    const boss = await snapshot();
    assert.equal(boss.unit, normal.unit);
    assert.equal(boss.playerSize, normal.playerSize);
    assert.deepEqual(boss.area, normal.area);
    assert.equal(boss.outline, 'none');
    await moveAcross(24, viewport.width - 9);
    const right = await snapshot();
    assert.equal(right.x, normal.area.right);
    assert.ok(right.projectedX < viewport.width - 8);
    await shot('boss-right');
    await moveAcross(viewport.width - 16, 13);
    const left = await snapshot();
    assert.equal(left.x, normal.area.left);
    assert.ok(left.projectedX > 8);
    await shot('boss-left');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'arena-browser.json'), JSON.stringify({ meta, viewport, normal, crossing, boss, left, right, seen, reentry }, null, 2));
    console.log(JSON.stringify({ viewport, scale: normal.unit, playerSize: normal.playerSize, left: left.x, right: right.x, seen, reentry }));
  } finally {
    await context.close();
    await page.video()?.saveAs(path.join(output, 'arena-in-motion.webm'));
    await page.video()?.delete();
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
