const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const origin = process.argv[2] ?? 'http://127.0.0.1:4182/arcade/index.html';
const output = path.resolve(process.argv[3] ?? 'test-artifacts/stellar/art-treatment');

async function compare(browser, viewport, prefix) {
  const context = await browser.newContext({ viewport, deviceScaleFactor:1, isMobile:true, hasTouch:true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/\/app\.mjs(\?|$)/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()) + '\nwindow.capture = { state, renderer };' });
  });
  const save = (key) => page.screenshot({ path:path.join(output, `${prefix}-${key}.png`) });
  try {
    await page.clock.install({ time:new Date('2026-11-20T00:00:00Z') });
    await page.goto(origin);
    await page.locator('.title-craft').evaluate((image) => image.decode());
    await save('title');
    await page.getByRole('button', { name:'Play', exact:true }).tap();
    await save('stages');
    await page.getByRole('button', { name:/01 Vesper Orbit/ }).tap();
    await page.waitForFunction(() => window.capture.state.mode === 'playing');
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 250)));
    await page.clock.runFor(16050);
    const input = await context.newCDPSession(page);
    const x = Math.round(viewport.width * .5);
    const y = Math.round(viewport.height * .82);
    await input.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x,y}] });
    await input.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:x-Math.round(viewport.width*.14),y:y+12}] });
    await page.clock.runFor(660);
    await input.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    const encounter = () => page.evaluate(() => {
      const { state, renderer } = window.capture;
      const f = state.flight;
      return { elapsed:f.elapsed, moveX:f.player.x, hull:f.player.hull, enemies:f.enemies.length,
        shots:f.hostile.length, pickups:f.pickups.length, visibleDrop:f.pickups.some((drop) => drop.age >= .38),
        fit:renderer.unit, fx:renderer.sparks.length };
    });
    let sample = await encounter();
    while (sample.elapsed < 22 && !(sample.enemies && sample.shots && sample.visibleDrop && sample.fx)) {
      await page.clock.runFor(85);
      sample = await encounter();
    }
    assert.ok(sample.moveX < 165, 'browser touch was used in the scene');
    assert.ok(sample.enemies && sample.shots && sample.visibleDrop, JSON.stringify(sample));
    for (const [key, raw] of [['full-light', true], ['combat-grade',false]]) {
      await page.evaluate((raw) => {
        const { state, renderer } = window.capture;
        renderer.fullStrengthBackground = raw;
        renderer.draw(state.flight, state.flight.run.assistance);
      }, raw);
      await save(key);
    }
    await page.evaluate(() => {
      const f = window.capture.state.flight;
      f.elapsed = f.stage.bossAt - .03;
      f.waveIndex = f.stage.waves.length;
      f.dropIndex = f.stage.drops.length;
    });
    await page.clock.runFor(3120);
    assert.equal(await page.locator('#flight-tip').isVisible(), false, 'the HUD returns to the clock for the first boss volley');
    await save('first-boss-volley-fixture');
    await page.clock.resume();
    const measure = (raw) => page.evaluate((raw) => new Promise((resolve) => {
      const { state, renderer } = window.capture;
      renderer.fullStrengthBackground = raw;
      const intervals = [];
      let last;
      function frame(t) {
        if (state.mode !== 'playing') {
          resolve({ status:state.mode, samples:intervals.length });
          return;
        }
        if (last !== undefined) intervals.push(t - last);
        last = t;
        if (intervals.length < 150) requestAnimationFrame(frame);
        else {
          const values = [...intervals].sort((a,b) => a-b);
          resolve({ samples:values.length, p50:values[74], p95:values[142], framesOver34:values.filter(v => v>34).length });
        }
      }
      requestAnimationFrame(frame);
    }), raw);
    const gradedMetrics = await measure(false);
    const fullMetrics = await measure(true);
    assert.deepEqual(errors, []);
    return { viewport, sample, gradedMetrics, fullMetrics, notes:'Same live simulation frame for grade pair. Last screenshot seeks into a live boss via a visual fixture. Timing windows are consecutive during combat. Host Chromium only.' };
  } finally { await context.close(); }
}

async function main() {
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch();
  try {
    const report=[];
    for (const [size,key] of [[{width:320,height:568},'compact'],[{width:390,height:844},'tall']]) {
      report.push(await compare(browser,size,key));
    }
    fs.writeFileSync(path.join(output,'treatment.json'), JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error); process.exitCode=1; });
