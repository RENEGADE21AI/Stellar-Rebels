const assert = require('node:assert/strict');
const test = require('node:test');
const { chromium, webkit } = require('playwright');

const origin = process.env.STELLAR_WEB_URL;

test('title keeps the call sign, fits its controls, and teaches either first Arcade entry', { skip: !origin, timeout:45000 }, async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width:320, height:568 }, { width:390, height:844 }, { width:844, height:390 }]) {
      const context = await browser.newContext({ viewport, hasTouch:true, isMobile:true, serviceWorkers:'block' });
      try {
        const page = await context.newPage();
        await page.goto(origin);
        const play = page.getByRole('button', { name:'Play', exact:true });
        await play.waitFor();
        const arena = await page.locator('.frame').boundingBox();
        const action = await play.boundingBox();
        const pilot = await page.locator('.title-pilot').boundingBox();
        const ratio = (action.y + action.height / 2 - arena.y) / arena.height;
        const min = viewport.width > viewport.height ? .54 : .63;
        assert.ok(ratio >= min && ratio <= .78, `Play center was at ${ratio}`);
        assert.ok(action.y + action.height <= pilot.y, 'Play should be above the call sign');
        for (const item of await page.locator('.title-actions button').all()) {
          const bounds = await item.boundingBox();
          assert.ok(bounds.width >= 44 && bounds.height >= 44);
        }
        const edit = page.getByRole('button', { name:'Edit call sign' });
        await edit.tap();
        const name = page.getByRole('textbox', { name:'Pilot name' });
        await name.fill('<b>');
        await name.press('Enter');
        assert.equal(await name.getAttribute('aria-invalid'), 'true');
        await name.fill('  Orion   9 ');
        await name.press('Enter');
        await edit.waitFor();
        assert.equal(await edit.evaluate((button) => document.activeElement === button), true);
        await page.reload();
        await page.getByText('Orion 9', { exact:true }).waitFor();
        if (viewport.width === 320) {
          await page.getByRole('button', { name:'Arcade', exact:true }).tap();
          await page.getByRole('button', { name:/01 Vesper Orbit/ }).tap();
        } else await play.tap();
        await page.getByRole('button', { name:'Skip training', exact:true }).waitFor();
        if (viewport.width === 320) {
          await page.getByRole('button', { name:'Skip training', exact:true }).tap();
          await page.locator('#training-actions').waitFor({ state:'hidden' });
          await page.getByRole('button', { name:'Pause', exact:true }).tap();
          const leave = page.getByRole('button', { name:'Leave flight', exact:true });
          await leave.tap();
          await leave.tap();
          await page.getByRole('heading', { name:'Stage Select', exact:true }).waitFor();
        }
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});

test('a returning playfield follows an operating system reduction preference', { skip: !origin, timeout:15000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport:{ width:390, height:844 }, reducedMotion:'no-preference', serviceWorkers:'block' });
    await page.goto(origin);
    const open = () => page.getByRole('button', { name:'Settings', exact:true }).click();
    const motion = page.getByRole('button', { name:'Reduced motion', exact:true });
    await open();
    assert.equal(await motion.getAttribute('aria-pressed'), 'false');
    await page.getByRole('button', { name:'Back', exact:true }).click();
    await page.emulateMedia({ reducedMotion:'reduce' });
    await page.waitForFunction(() => document.querySelector('.frame').dataset.reducedMotion === 'true');
    await page.reload();
    await open();
    assert.equal(await motion.getAttribute('aria-pressed'), 'true');
    assert.equal(await motion.isDisabled(), true);
    await page.emulateMedia({ reducedMotion:'no-preference' });
    await page.waitForFunction(() => document.querySelector('.frame').dataset.reducedMotion === 'false');
    assert.equal(await motion.getAttribute('aria-pressed'), 'false');
    assert.equal(await motion.isEnabled(), true);
  } finally { await browser.close(); }
});

test('Arcade exposes a direct Special practice drill with stable flight meters', { skip: !origin, timeout:18000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport:{ width:320, height:568 }, isMobile:true, hasTouch:true, serviceWorkers:'block' });
    const button = (name) => page.getByRole('button', { name, exact:true });
    await page.goto(origin);
    await button('Arcade').tap();
    const practice = button('Practice');
    const drillRect = await practice.boundingBox();
    assert.ok(drillRect && drillRect.y < 210 && drillRect.height >= 44);
    await practice.tap();
    await button('Ghost Shift drill').tap();
    await page.getByText('Stay in the shot’s path and wait for the cue.', { exact:true }).waitFor();
    const hull = await page.getByRole('meter', { name:'Hull' }).boundingBox();
    const energy = await page.getByRole('meter', { name:'Energy' }).boundingBox();
    const score = await page.locator('#flight-score').boundingBox();
    const pause = await button('Pause').boundingBox();
    assert.ok(energy.y >= hull.y + hull.height && Math.abs(energy.x - hull.x) < 3);
    assert.ok(score.x + score.width <= pause.x && pause.y <= score.y);
    await button('End practice').tap();
    await page.getByRole('heading', { name:'Practice', exact:true }).waitFor();
    await button('Back').tap();
    await page.getByRole('heading', { name:'Stage Select', exact:true }).waitFor();
  } finally { await browser.close(); }
});

test('Arcade, Hangar and Settings keep their controls inside the landscape frame', { skip: !origin, timeout:15000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport:{ width:844, height:390 }, isMobile:true, hasTouch:true, serviceWorkers:'block' });
    await page.goto(origin);
    const button = (name) => page.getByRole('button', { name, exact:true });
    const fit = async (selector) => {
      const layout = await page.locator('#menu').evaluate((menu, controls) => ({
        width:menu.clientWidth,
        scrollWidth:menu.scrollWidth,
        controls:[...menu.querySelectorAll(controls)].map((el) => [el.offsetWidth, el.scrollWidth])
      }), selector);
      assert.ok(layout.width >= layout.scrollWidth, JSON.stringify(layout));
      assert.ok(layout.controls.length && layout.controls.every(([width, scroll]) => width >= scroll), JSON.stringify(layout));
    };
    await button('Arcade').tap();
    await fit('.stage, .support-actions button');
    await button('Back').tap();
    await button('Hangar').tap();
    await fit('.craft-choice');
    await button('Upgrades').tap();
    await fit('.shop-card');
    await button('Back').tap();
    await button('Settings').tap();
    await fit('.setting, #sensitivity');
  } finally { await browser.close(); }
});

test('first Play teaches steering, targeting and Shift before starting a recorded flight', { skip: !origin, timeout:45000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport:{ width:390, height:844 }, serviceWorkers:'block' });
    await page.route(/\/app\.mjs(\?|$)/, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body:(await response.text()) + '\nwindow.trainingProbe = { state, store };' });
    });
    await page.goto(origin);
    await page.getByRole('button', { name:'Play', exact:true }).click();
    await page.getByText('Steer your Fighter', { exact:true }).waitFor();
    await page.keyboard.down('ArrowRight');
    await page.getByText('Line up a shot', { exact:true }).waitFor();
    await page.keyboard.up('ArrowRight');
    const move = () => page.evaluate(() => {
      const { training, flight } = window.trainingProbe.state;
      return training.step === 'fire' && flight.enemies.length ? flight.enemies[0].x - flight.player.x : null;
    });
    for (let attempt = 0; attempt < 160; attempt++) {
      const dx = await move();
      if (await page.getByText('Ghost Shift', { exact:true }).first().isVisible() && await page.locator('#flight-name').textContent() === 'Ghost Shift') break;
      if (dx !== null && Math.abs(dx) > 6) {
        const key = dx < 0 ? 'ArrowLeft' : 'ArrowRight';
        await page.keyboard.down(key);
        const delay = Math.min(90, Math.abs(dx) * 1.6);
        await page.waitForTimeout(delay);
        await page.keyboard.up(key);
      } else await page.waitForTimeout(85);
    }
    await page.waitForFunction(() => window.trainingProbe.state.training.step === 'shift');
    await page.keyboard.press('Space');
    const launch = page.getByRole('button', { name:'Start arcade', exact:true });
    await page.waitForFunction(() => window.trainingProbe.state.flight.player.ghostTime > 0);
    assert.equal(await launch.count(), 0);
    await page.getByText('Try again', { exact:true }).waitFor();
    assert.ok(await page.evaluate(() => {
      const { player } = window.trainingProbe.state.flight;
      return player.hull === player.maxHull;
    }));
    await page.getByText('Shift now', { exact:true }).waitFor();
    await page.keyboard.press('Space');
    await launch.waitFor();
    assert.equal(await page.evaluate(() => Object.keys(window.trainingProbe.state.pilot.active).length), 0);
    await launch.click();
    await page.waitForFunction(() => window.trainingProbe.state.mode === 'playing' && !window.trainingProbe.state.training);
    assert.ok(await page.evaluate(() => window.trainingProbe.state.pilot.settings.trainingDone));
  } finally { await browser.close(); }
});

test('Play resumes the Arcade route with the equipped ship and replays the finale after completion', { skip: !origin, timeout:45000 }, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{ width:320, height:568 }, hasTouch:true, isMobile:true, serviceWorkers:'block' });
  try {
    await page.route(/\/app\.mjs(\?|$)/, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body:(await response.text()) + '\nwindow.quickPlay = { state, store };' });
    });
    const play = page.getByRole('button', { name:'Play', exact:true });
    for (const [cleared, expected] of [[2,3], [6,6]]) {
      await page.goto(origin);
      await play.waitFor();
      await page.evaluate((count) => window.quickPlay.store.change((pilot) => {
        for (let stage = 1; stage <= count; stage++) pilot.clears[stage] = 1;
        pilot.ship = 'needle';
      }), cleared);
      await page.reload();
      await play.tap();
      await page.waitForFunction((stage) => {
        const { state } = window.quickPlay;
        return state.mode === 'playing' && state.flight.run.stage === stage && state.flight.run.ship === 'needle';
      }, expected);
    }
  } finally { await browser.close(); }
});

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
    await page.getByRole('button', { name:'Skip training', exact:true }).tap();
    await page.locator('#training-actions').waitFor({ state:'hidden' });
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
          if (state === 'stages') await page.getByRole('button', { name:'Arcade', exact:true }).tap();
          const box = await banner.boundingBox();
          assert.ok(box.y >= 0 && box.y + box.height < 568, JSON.stringify(box));
        }
        await page.getByRole('button', { name:/01 Vesper Orbit/ }).tap();
        await page.getByRole('button', { name:'Skip training', exact:true }).tap();
        await page.locator('#training-actions').waitFor({ state:'hidden' });
        await page.getByRole('button', { name:'Pause', exact:true }).waitFor();
        // Only the storage path is under test here. The real campaign tests clear by play.
        await page.evaluate(() => {
          window.storageFixture.flight.score = 7451;
          window.storageFixture.flight.status = 'clear';
        });
        await page.getByText(/78 Salvage this session/).waitFor();
        const captionsFit = await page.locator('.result-facts .caption').evaluateAll((labels) =>
          labels.every((label) => label.scrollWidth <= label.clientWidth));
        assert.equal(captionsFit, true);
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
        await page.getByRole('button', { name:'Arcade', exact:true }).tap();
        assert.equal(await page.getByRole('button', {name:/02 Asteroid Belt/}).isEnabled(), !existing);
        await page.getByText(existing ? '0 Salvage' : '78 Salvage', {exact:true}).waitFor();
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});

test('flight instructions stay in the HUD during real touch and a rail strike', { skip: !origin, timeout:60000 }, async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{width:320,height:568},{width:390,height:844}]) {
      const context = await browser.newContext({viewport,isMobile:true,hasTouch:true,serviceWorkers:'block'});
      try {
        const page = await context.newPage();
        const touch = await context.newCDPSession(page);
        await page.route(/\/app\.mjs(\?|$)/, async (route) => {
          const response = await route.fetch();
          await route.fulfill({response, body:(await response.text())+'\nwindow.hudProbe = {state,renderer,store};'});
        });
        const dragHigh = async () => {
          const x = viewport.width / 2;
          await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:viewport.height*.82}]});
          await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:viewport.height*.36}]});
          await page.waitForFunction(() => window.hudProbe.state.flight.player.y < 341);
          await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        };
        const verifyClearance = async () => {
          const frame = await page.locator('#sky').boundingBox();
          assert.ok(Math.abs(frame.height / frame.width - 2) < .006, JSON.stringify(frame));
          const tip = await page.locator('#flight-tip').boundingBox();
          if (tip) assert.ok(tip.x + tip.width / 2 > viewport.width / 2 && Math.abs(tip.y - viewport.height / 2) < 95);
        };

        await page.goto(origin);
        await page.getByRole('button',{name:'Arcade',exact:true}).tap();
        await page.getByRole('button',{name:/01 Vesper Orbit/}).tap();
        await page.getByRole('button', { name:'Skip training', exact:true }).tap();
        await page.getByText('Fight through the blockade.',{exact:true}).waitFor();
        await page.keyboard.down('ArrowDown');
        await page.waitForFunction(() => window.hudProbe.state.flight.player.y >= 729);
        await page.keyboard.up('ArrowDown');
        await dragHigh();
        await verifyClearance();
        await page.evaluate(() => {
          const f = window.hudProbe.state.flight;
          f.collect({ kind:'barrier' });
        });
        await page.locator('#flight-name').filter({ hasText:'Shield' }).waitFor();
        await page.evaluate(async () => {
          await window.hudProbe.store.change((pilot) => { pilot.clears = {1:1,2:1,3:1,4:1}; });
        });

        await page.reload();
        await page.getByRole('button',{name:'Arcade',exact:true}).tap();
        const redSun = page.getByRole('button',{name:/04 Red Sun/});
        assert.match(await redSun.innerText(),/Keep hull intact in the boss fight/);
        assert.equal(await page.getByRole('button',{name:'Endless',exact:true}).getAttribute('aria-describedby'),'endless-note');
        assert.match(await page.locator('#endless-note').innerText(),/0 Salvage/);
        await redSun.tap();
        await page.locator('#flight-tip').waitFor();
        await dragHigh();
        await page.evaluate(() => {
          const f = window.hudProbe.state.flight;
          f.elapsed = 44.98;
          f.waveIndex = f.stage.waves.length;
          f.dropIndex = f.stage.drops.length;
          f.player.guard = 0;
          f.player.hull = f.player.maxHull;
        });
        await page.getByText('Leave the striped lane.',{exact:true}).waitFor();
        await verifyClearance();
        await page.waitForFunction(() => window.hudProbe.state.flight.player.hull === 4);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});

test('keyboard focus follows hangar controls and an upgrade detail return', { skip: !origin, timeout:30000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.goto(origin);
    await page.getByRole('button',{name:'Hangar',exact:true}).press('Enter');
    const activate = async (button) => {
      await button.press('Enter');
      assert.equal(await button.evaluate((node) => document.activeElement === node),true);
    };
    await activate(page.getByRole('button',{name:/^Interceptor/}));
    await activate(page.getByRole('button',{name:'Upgrades',exact:true}));
    const chamber = page.getByRole('button',{name:/^Cycling Chamber/});
    await chamber.press('Enter');
    await page.getByRole('heading',{name:'Cycling Chamber'}).waitFor();
    await page.getByRole('button',{name:'Back',exact:true}).press('Enter');
    assert.equal(await chamber.evaluate((node) => document.activeElement === node),true);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button',{name:/^Resonant Cells/}).evaluate((node) => document.activeElement === node),true);
  } finally { await browser.close(); }
});

test('Space activates Pause on focus and uses the indicated ability from the playfield', { skip: !origin, timeout:60000 }, async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width:320, height:568 }, { width:390, height:844 }]) {
      const context = await browser.newContext({ viewport, isMobile:true, hasTouch:true, serviceWorkers:'block' });
      try {
        const page = await context.newPage();
        await page.route(/\/app\.mjs(\?|$)/, async (route) => {
          const response = await route.fetch();
          await route.fulfill({ response, body:(await response.text()) + '\nwindow.controlProbe = { state, store };' });
        });
        const button = (name) => page.getByRole('button', { name, exact:typeof name === 'string' });
        const playing = () => page.waitForFunction(() => document.activeElement?.id === 'sky');
        await page.goto(origin);
        await button('Play').press('Enter');
        await button('Skip training').press('Enter');
        await playing();
        assert.match(await page.locator('#sky').getAttribute('aria-label'), /Space for Ghost Shift/);
        await page.evaluate(() => { window.controlProbe.state.flight.player.ghostEnergy = 100; });
        await page.waitForFunction(() => document.getElementById('ghost-meter').getAttribute('aria-valuenow') === '100');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'pause');
        await page.keyboard.press('Space');
        await page.getByRole('heading', { name:'Paused' }).waitFor();
        assert.equal(await page.locator('#ghost-meter').getAttribute('aria-valuenow'), '100');
        await button('Resume').press('Enter');
        await playing();
        await page.keyboard.press('Space');
        await page.waitForFunction(() => window.controlProbe.state.flight.player.realm === 'ghost');
        await button('Pause').press('Enter');
        await page.getByRole('heading', { name:'Paused' }).waitFor();
        await page.evaluate(() => window.controlProbe.store.change((pilot) => {
          pilot.clears = { 1:1, 2:1, 3:1, 4:1 };
          pilot.ship = 'bastion';
          pilot.equipment = ['hull'];
        }));

        await page.reload();
        await button('Arcade').tap();
        await button(/^05 Outer Orbit/).tap();
        await playing();
        await page.evaluate(() => {
          const f = window.controlProbe.state.flight;
          f.elapsed = f.stage.bossAt - .02;
          f.waveIndex = f.stage.waves.length;
          f.dropIndex = f.stage.drops.length;
          f.player.ghostEnergy = 100;
        });
        await page.getByText('Hop to match realms. Shoot the core.', { exact:true }).waitFor();
        assert.match(await page.locator('#sky').getAttribute('aria-label'), /Space to Hop between realms/);
        await page.evaluate(() => { const { flight } = window.controlProbe.state;
          flight.score = 38640;
          flight.boss.shifting = true; });
        const incoming = page.locator('#boss-realm').filter({ hasText:'Physical → Ghost' });
        await incoming.waitFor();
        const visible = await incoming.evaluate((cue) => {
          const band = cue.parentElement.getBoundingClientRect();
          const bounds = cue.getBoundingClientRect();
          return bounds.left >= band.left && bounds.right <= band.right && cue.scrollWidth <= cue.clientWidth;
        });
        assert.equal(visible, true);
        await page.evaluate(() => { window.controlProbe.state.flight.boss.shifting = false; });
        const toGhost = button('Hop to Ghost realm');
        const toPhysical = button('Hop to Physical realm');
        assert.match(await page.locator('#ghost-status').textContent(), /Current realm is Physical/);
        assert.equal(await page.locator('#flight-progress').textContent(), 'You · Physical');
        await toGhost.tap();
        await toPhysical.waitFor();
        assert.match(await page.locator('#ghost-status').textContent(), /Current realm is Ghost/);
        assert.equal(await page.locator('#flight-progress').textContent(), 'You · Ghost');
        await page.waitForFunction(() => document.querySelector('#ghost-shift').getAttribute('aria-disabled') === 'false');
        await page.evaluate(() => {
          const f = window.controlProbe.state.flight;
          f.boss.age = Math.max(f.boss.entryTime, f.boss.age);
          f.boss.attack = 2;
          f.boss.timer = 0;
        });
        await page.locator('#flight-tip').filter({ hasText:'Ghost fire. Dodge or Hop.' }).waitFor();
        await toPhysical.press('Space');
        await toGhost.waitFor();
        await page.evaluate(() => {
          const f = window.controlProbe.state.flight;
          f.boss.charge = null;
          f.boss.age = Math.max(f.boss.entryTime, f.boss.age);
          f.boss.attack = 2;
          f.boss.timer = 0;
          f.player.ghostEnergy = 0;
        });
        await page.locator('#flight-tip').filter({ hasText:'Physical fire. Dodge.' }).waitFor();
        assert.equal(await toGhost.getAttribute('aria-disabled'), 'true');
        await toGhost.press('Space');
        assert.match(await page.locator('#ghost-status').textContent(), /Current realm is Physical/);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});

test('slow flight art can be canceled and failed art has a bounded fallback', { skip: !origin, timeout:40000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport:{ width:320, height:568 }, isMobile:true, hasTouch:true, serviceWorkers:'block' });
    const target = '**/vesper-playfield.webp';
    let hold;
    const stalled = new Promise((resolve) => { hold = resolve; });
    const routeHandler = (route) => { hold(route); };
    await page.route(target, routeHandler);
    await page.goto(origin);
    await page.getByRole('button', { name:'Play', exact:true }).waitFor();
    await page.evaluate(async () => {
      const main = document.querySelector('script[type=module]').src;
      const { PilotStore } = await import(new URL('pilot.mjs', main));
      const store = new PilotStore(indexedDB);
      await store.open();
      await store.change((pilot) => { pilot.settings.trainingDone = true; });
      store.db.close();
    });
    await page.reload();
    const button = (name) => page.getByRole('button', { name, exact:typeof name === 'string' });
    await button('Arcade').tap();
    const stage = button(/^01 Vesper Orbit/);
    await stage.tap();
    const image = await stalled;
    await page.getByRole('status').filter({ hasText:'Loading flight assets' }).waitFor();
    await button('Cancel launch').tap();
    await stage.waitFor();
    assert.equal(await stage.evaluate((node) => node === document.activeElement), true);
    await button('Change ship').tap();
    await page.getByRole('heading', { name:'Hangar' }).waitFor();
    await image.continue().catch(() => {});
    await page.unroute(target, routeHandler);
    await page.waitForFunction(async () => {
      const main = document.querySelector('script[type=module]').src;
      const { PilotStore } = await import(new URL('pilot.mjs', main));
      const store = new PilotStore(indexedDB);
      const pilot = await store.open();
      store.db.close();
      return Object.keys(pilot.active).length === 0;
    });
    assert.equal(await button('Pause').count(), 0);
    await button('Back').tap();
    let second;
    await page.route(target, (route) => { second = route; });
    await stage.tap();
    await page.getByRole('heading', { name:'Preparing flight' }).waitFor();
    const deadline = 5600;
    await button('Pause').waitFor({ timeout:deadline });
    assert.ok(second, 'The launch completed while the image response was still held');
    await second.abort().catch(() => {});
    await page.getByText('Fight through the blockade.', { exact:true }).waitFor();
    await button('Pause').tap();
    await page.getByRole('heading', { name:'Paused' }).waitFor();
  } finally { await browser.close(); }
});
