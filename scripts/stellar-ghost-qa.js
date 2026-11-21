const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const [origin = 'http://127.0.0.1:4183/', target = 'test-artifacts/stellar-ghost', size] = process.argv.slice(2);
const viewport = size === 'compact' ? { width: 320, height: 568 } : { width: 390, height: 844 };
const output = path.resolve(target);

async function driveOpening(page, touch, point) {
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  for (let i = 0; i < 43; i++) {
    const shift = await page.evaluate(() => {
      const { flight, mode } = window.ghostQA.state;
      if (mode !== 'playing' || flight.shiftReady) return null;
      const enemy = flight.enemies.filter((e) => e.y > 12 && !e.retreat).sort((a, b) =>
        Math.abs(a.x - flight.player.x) - Math.abs(b.x - flight.player.x))[0];
      return enemy ? (enemy.x - flight.xIntent) * window.ghostQA.renderer.unit / 1.12 : 0;
    });
    if (shift === null) return;
    point.x = Math.max(19, Math.min(viewport.width - 19, point.x + shift));
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
    await page.waitForTimeout(530);
  }
}

async function verify() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block',
    recordVideo: { dir: output, size: viewport } });
  const page = await context.newPage();
  const errors = [];
  const requestFailures = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400 && response.url().startsWith(origin)) requestFailures.push(response.url()); });
  const button = (name) => page.getByRole('button', { name, exact: typeof name === 'string' });
  const shot = (name) => page.screenshot({ path: path.join(output, `${name}.png`) });
  const meter = page.getByRole('meter', { name: 'Energy', exact: true });
  const amount = async () => Number(await meter.getAttribute('aria-valuenow'));
  const ready = () => page.waitForFunction(() => document.getElementById('ghost-shift').getAttribute('aria-disabled') === 'false');
  const active = () => page.waitForFunction(() => document.getElementById('ghost-control').dataset.mode === 'active');
  const flight = () => button('Pause').waitFor();
  const report = { origin, viewport };
  try {
    // Expose a test observer. The literal HTML and all other modules come from the running artifact.
    await page.route(/\/app\.mjs(\?|$)/, async (route) => {
      const source = await route.fetch();
      const observer = `
        window.ghostQA={state,renderer,audio,store};
        function captureCharge(event) {
          const ghostButton = event.target.closest?.('#ghost-shift');
          if ((ghostButton && (event.type === 'click' || !event.isPrimary) || event.key === ' ') &&
              state.mode === 'playing' && state.flight.shiftReady) {
            window.ghostQA.chargeAtInput = Math.floor(state.flight.player.ghostEnergy);
          }
        }
        for (const event of ['pointerdown','click','keydown']) window.addEventListener(event, captureCharge, true);
      `;
      await route.fulfill({ response: source, body: (await source.text()) + observer });
    });
    const touch = await context.newCDPSession(page);
    await page.goto(origin);
    await button('Play').waitFor();
    await page.locator('.brand-lockup img').evaluate((image) => image.decode());
    await shot('title');
    await button('Arcade').tap();
    await button(/01 Vesper Orbit/).tap();
    await page.getByRole('button', { name:'Skip training', exact:true }).tap();
    await flight();
    assert.equal(await amount(), 100);
    const layout = await button('Ghost Shift').boundingBox();
    assert.ok(layout.width >= 44 && layout.height >= 44 && layout.x + layout.width < viewport.width);
    const cadence = page.evaluate(() => new Promise((resolve) => {
      const frames = [];
      let before = performance.now();
      function measure(now) {
        frames.push(now - before);
        before = now;
        if (frames.length < 120) requestAnimationFrame(measure);
        else resolve(frames.sort((a, b) => a - b)[113]);
      }
      requestAnimationFrame(measure);
    }));
    const finger = { x: viewport.width / 2, y: Math.round(viewport.height * .733), id: 1 };
    await driveOpening(page, touch, finger);
    await ready();
    const beforeShift = await page.evaluate(() => ({ hull: window.ghostQA.state.flight.player.hull,
      eliminated: window.ghostQA.state.flight.kills, bank: window.ghostQA.state.flight.player.bank }));
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger,
      { x: layout.x + layout.width / 2, y: layout.y + layout.height / 2, id: 2 }] });
    await active();
    const charging = await page.evaluate(() => window.ghostQA.chargeAtInput);
    assert.equal(await amount(), charging - 38);
    assert.equal(await page.evaluate(() => window.ghostQA.state.pointer !== null), true);
    await page.keyboard.press('Escape');
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.getByRole('heading', { name: 'Paused' }).waitFor();
    const frozen = await page.evaluate(() => window.ghostQA.state.flight.player.ghostTime);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1250);
    assert.ok(frozen > 0);
    assert.equal(await page.evaluate(() => window.ghostQA.state.flight.player.ghostTime), frozen);
    assert.equal(await amount(), charging - 38);
    await button('Resume').tap();
    await page.waitForFunction(() => window.ghostQA.state.mode === 'playing' && window.ghostQA.state.flight.player.ghostTime > 0);
    await shot('ordinary-shift');
    await page.waitForFunction(() => window.ghostQA.state.mode === 'playing' && !window.ghostQA.state.flight.player.ghostTime);
    await shot('ordinary-return');
    const audio = await page.evaluate(() => ({ state: window.ghostQA.audio.ctx?.state, playedShift: 'ghostStart' in window.ghostQA.audio.last,
      playedReturn: 'ghostEnd' in window.ghostQA.audio.last, playingMusic: !window.ghostQA.audio.track?.paused,
      decodedMusic: window.ghostQA.audio.track?.readyState >= 2 }));
    assert.deepEqual(audio, { state: 'running', playedShift: true, playedReturn: true, playingMusic: true, decodedMusic: true });
    report.opening = { ship: 'Fighter', charging, afterShift: charging - 38, ...beforeShift, frozen, p95FrameMs: await cadence, audio };
    assert.ok(report.opening.p95FrameMs < 40);
    await button('Pause').tap();
    await button('Leave flight').tap();
    await button('Leave flight').tap();
    await button(/01 Vesper Orbit/).tap();
    await flight();
    assert.equal(await amount(), 100);
    await button('Pause').tap();
    await button('Leave flight').tap();
    await button('Leave flight').tap();

    // Seed the cleared route on this disposable browser only. The campaign QA unlocks every stage by clearing it.
    await page.evaluate(async () => {
      const { state, store } = window.ghostQA;
      const saved = await store.change((pilot) => { for (const n of [1, 2, 3, 4]) pilot.clears[n] = 1; });
      state.pilot = saved.pilot;
    });
    await page.reload();
    await button('Hangar').tap();
    await button(/^Interceptor/).tap();
    await button('Equip Interceptor').tap();
    await page.locator('.craft-art').evaluate((image) => image.decode());
    await shot('interceptor-hangar');
    await button('Back').tap();
    await button('Arcade').tap();
    await button(/04 Red Sun/).tap();
    await flight();
    const railFinger = { x: viewport.width / 2, y: Math.round(viewport.height * .733), id: 1 };
    await driveOpening(page, touch, railFinger);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await ready();
    await page.evaluate(() => {
      const { flight: f } = window.ghostQA.state;
      f.elapsed = f.stage.terrain[0][0] - .018;
      f.waveIndex = f.stage.waves.length;
      f.dropIndex = f.stage.drops.length;
    });
    await page.waitForFunction(() => window.ghostQA.state.flight.hazards.some((h) => h.kind === 'rail' && h.age >= h.windup - .24));
    const railHull = await page.evaluate(() => window.ghostQA.state.flight.player.hull);
    await page.keyboard.press('Space');
    await active();
    await page.waitForFunction(() => window.ghostQA.state.flight.hazards.some((h) => h.kind === 'rail' && h.triggered));
    await shot('shift-through-rail');
    await page.waitForFunction(() => !window.ghostQA.state.flight.hazards.length && !window.ghostQA.state.flight.player.ghostTime);
    assert.equal(await page.evaluate(() => window.ghostQA.state.flight.player.hull), railHull);
    await page.evaluate(() => {
      const { flight: f } = window.ghostQA.state;
      f.elapsed = f.stage.terrain[1][0] - .018;
    });
    await page.waitForFunction((hull) => window.ghostQA.state.flight.player.hull < hull, railHull);
    report.rail = { ship: 'Interceptor', phasedHull: railHull, unphasedHull: railHull - 1 };
    await button('Pause').tap();
    await button('Leave flight').tap();
    await button('Leave flight').tap();
    await button(/05 Outer Orbit/).tap();
    await flight();
    await shot('outer-orbit');
    await page.waitForFunction(() => window.ghostQA.state.flight.elapsed >= 3.3);
    await shot('phantom-approach');
    // Seek just before the authored boss arrival, then use real-time browser input and the live simulation.
    await page.evaluate(() => {
      const { flight: f } = window.ghostQA.state;
      f.elapsed = f.stage.bossAt - .02;
      f.waveIndex = f.stage.waves.length;
      f.dropIndex = f.stage.drops.length;
      f.terrainIndex = f.stage.terrain.length;
    });
    await page.waitForFunction(() => window.ghostQA.state.flight.boss?.age >= 3.25);
    await shot('wraith-physical');
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(170);
    await page.keyboard.up('ArrowLeft');
    await page.waitForFunction(() => window.ghostQA.state.flight.boss?.shifting === true);
    await shot('wraith-telegraph');
    await page.waitForFunction(() => document.getElementById('boss-meter').dataset.realm === 'ghost');
    const beforeHop = await amount();
    await page.keyboard.press('Space');
    await active();
    assert.ok(await amount() <= beforeHop - 17);
    assert.equal(await page.evaluate(() => window.ghostQA.state.flight.player.ghostTime), 0);
    await shot('wraith-ghost');
    const bossHull = await page.evaluate(() => window.ghostQA.state.flight.boss.hull);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(180);
    await page.keyboard.up('ArrowRight');
    await page.waitForFunction((previous) => window.ghostQA.state.flight.boss.hull < previous, bossHull);
    report.wraith = await page.evaluate(() => {
      const { flight, mode } = window.ghostQA.state;
      return { ship: flight.run.ship, matchedRealm: flight.player.realm === flight.boss.realm, hull: flight.player.hull,
        bossDamageLanded: flight.boss.spec.hull - flight.boss.hull, upgrades: flight.run.equipment, pressure: flight.pressure,
        graphics: ['wraith', 'wraith-ghost', 'phantom', 'outer-playfield'].every((key) => window.ghostQA.renderer.sprites.has(key)), mode };
    });
    assert.equal(report.wraith.matchedRealm, true);
    assert.equal(report.wraith.graphics, true);
    await button('Pause').tap();
    await button('Leave flight').tap();
    await button('Leave flight').tap();
    await button('Change ship').tap();
    await button(/^Gunship/).tap();
    await button('Equip Gunship').tap();
    await shot('gunship-hangar');
    await button('Back').tap();
    await button('Endless').tap();
    await flight();
    assert.equal(await amount(), 100);
    const secondFinger = { x: viewport.width / 2, y: Math.round(viewport.height * .733), id: 1 };
    await driveOpening(page, touch, secondFinger);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await ready();
    await button('Ghost Shift').tap();
    await active();
    const endlessCharge = await page.evaluate(() => window.ghostQA.chargeAtInput);
    assert.equal(await amount(), endlessCharge - 38);
    await shot('endless-shift');
    report.endless = { ship: 'Gunship', charge: endlessCharge, spent: 38 };
    assert.deepEqual(errors, []);
    assert.deepEqual(requestFailures, []);
    fs.writeFileSync(path.join(output, 'ghost-browser.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await context.close();
    await page.video()?.saveAs(path.join(output, 'flight-in-motion.webm'));
    await page.video()?.delete();
    await browser.close();
  }
}

verify().catch((error) => { console.error(error); process.exitCode = 1; });
