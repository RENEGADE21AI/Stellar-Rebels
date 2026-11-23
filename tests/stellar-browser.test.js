const assert = require('node:assert/strict');
const test = require('node:test');
const { chromium, webkit } = require('playwright');

const origin = process.env.STELLAR_WEB_URL;
const missionIds = [1,7,2,8,3,9,4,10,11,12,13,5,14,15,6];

async function confirmOpening(page) {
  await page.getByRole('button', { name:'Confirm & continue', exact:true }).click();
  await page.getByRole('button', { name:'Skip', exact:true }).click();
  await page.getByRole('button', { name:'Pause', exact:true }).waitFor();
}

test('Act I banking and native authorization preserve one optional purchase while the browser remains free', { skip: !origin, timeout:90000 }, async () => {
  const browser = await chromium.launch();
  try {
    for (const native of [true, false]) {
      const context = await browser.newContext({
        viewport:{ width:320, height:568 }, isMobile:true, hasTouch:true, reducedMotion:'reduce', serviceWorkers:'block'
      });
      try {
        const page = await context.newPage();
        await page.route(/\/app\.mjs$/, async (route) => {
          const response = await route.fetch();
          await route.fulfill({ response, body:`${await response.text()}\nwindow.commerceFixture = {
            pilot: () => store.load(),
            seed: async () => {
              await store.change((pilot) => {
                for (const {id} of STAGES.slice(0,4)) pilot.clears[id] = 1;
                pilot.callSign = 'Test Pilot'; pilot.settings.skipStory = true; pilot.full_arcade = true;
              });
            },
            stage: () => state.mode === 'playing' ? state.flight.run.stage : undefined,
            clear: () => { state.flight.score = 7490; state.flight.status = 'clear'; }
          };` });
        });
        if (native) {
          const entry = new URL(origin);
          await page.route((url) => url.origin === entry.origin && url.pathname === entry.pathname, async (route) => {
            const response = await route.fetch();
            await route.fulfill({ response, body:(await response.text()).replace('<html ', '<html data-native-flight="true" ') });
          });
        }
        await page.addInitScript(() => {
          const calls = [];
          const store = {
            owned:sessionStorage.getItem('fixture-owned') === 'yes', available:true, pending:false, purchase:'cancelled',
            status() { return { owned:this.owned, price:this.available ? '3,99 €' : '', available:this.available, pending:this.pending }; },
            notify() { window.dispatchEvent(new CustomEvent('stellar-commerce-change', { detail:this.status() })); }
          };
          window.testCommerce = { store, calls };
          window.stellarCommerce = async (op, data) => {
            calls.push([op, data]);
            if (op === 'authorize-stage') return { allowed:store.owned };
            if (op === 'commerce-purchase') {
              if (store.purchase === 'pending') store.pending = true;
              return { ...store.status(), result:store.purchase };
            }
            if (op === 'commerce-restore') {
              store.owned = true;
              store.pending = false;
              sessionStorage.setItem('fixture-owned', 'yes');
              return { ...store.status(), result:'restored' };
            }
            return store.status();
          };
        });
        const button = (name) => page.getByRole('button', { name, exact:typeof name === 'string' });
        const heading = (name) => page.getByRole('heading', { name, exact:true });
        const launch = async (control, stage) => {
          await control.tap();
          await page.waitForFunction((id) => window.commerceFixture.stage() === id, stage);
        };
        const leave = async () => {
          await button('Pause').tap();
          await button('Leave flight').tap();
          await button('Leave flight').tap();
        };
        const show = new URL(origin);
        show.searchParams.set('full_arcade', 'true');
        await page.goto(show.href);
        await button('Play').waitFor();
        await page.evaluate(() => window.commerceFixture.seed());
        await page.reload();
        await launch(button('Play'), 3);
        await page.evaluate(() => window.commerceFixture.clear());
        await heading('Relay offline').waitFor();
        await page.getByText(/Salvage banked/).waitFor();
        await button('Gunship unlocked').waitFor();
        if (!native) {
          await launch(button(/Next Mission/), 9);
          assert.deepEqual(await page.evaluate(() => window.testCommerce.calls), []);
          continue;
        }

        const open = async () => {
          await button(/^06 Border Crossing/).tap();
          await heading('Unlock the Full Game').waitFor();
        };
        assert.equal(await heading('Unlock the Full Game').count(), 0);
        const offer = button('See Full Game Unlock');
        assert.equal(await offer.isVisible(), true);
        assert.equal(await button('Campaign').isVisible(), true);
        assert.equal(await button('Replay mission').isVisible(), true);
        assert.equal(await button('Title Screen').isVisible(), true);
        assert.equal(await page.evaluate(() => window.testCommerce.calls.some(([op]) => op === 'commerce-purchase')), false);
        await offer.tap();
        await heading('Unlock the Full Game').waitFor();
        await page.getByText('3,99 €', { exact:true }).waitFor();
        const viewport = await page.locator('#menu').boundingBox();
        for (const label of ['Unlock Full Game', 'Not Now', 'Restore Purchases']) {
          const bounds = await button(label).boundingBox();
          assert.ok(bounds.width >= 44 && bounds.height >= 44 && bounds.y + bounds.height <= viewport.y + viewport.height);
        }
        await button('Terms of Use').tap();
        await heading(/Terms of [Uu]se/).waitFor();
        await button('Back').tap();
        await heading('Unlock the Full Game').waitFor();
        assert.equal(await button('Terms of Use').evaluate((control) => document.activeElement === control), true);
        await button('Unlock Full Game').tap();
        await page.getByRole('status').filter({ hasText:/cancelled/i }).waitFor();
        await button('Not Now').tap();
        await heading('Relay offline').waitFor();
        assert.equal((await page.evaluate(() => window.commerceFixture.pilot())).clears[3], 1);
        await button('Title Screen').tap();
        await launch(button('Play'), 3);
        await page.evaluate(() => window.commerceFixture.clear());
        await button('Campaign').waitFor();
        assert.equal(await offer.count(), 0);
        await button('Campaign').tap();
        assert.equal(await button('Endless').isDisabled(), true);
        await page.locator('.campaign-act').first().locator('summary').tap();
        await launch(button(/^A3 Supply Intercept/), 18);
        assert.deepEqual(await page.evaluate(() => window.testCommerce.calls.filter(([op]) => op === 'authorize-stage')), []);
        await leave();
        await open();
        await page.evaluate(() => { window.testCommerce.store.purchase = 'pending'; });
        await button('Unlock Full Game').tap();
        await page.getByRole('status').filter({ hasText:/pending/i }).waitFor();
        assert.equal(await button('Unlock Full Game').isDisabled(), true);
        await button('Restore Purchases').tap();
        await page.getByRole('status').filter({ hasText:/restored/i }).waitFor();
        await launch(button(/Launch Border Crossing/), 9);
        assert.deepEqual(await page.evaluate(() => window.testCommerce.calls.filter(([op]) => op === 'authorize-stage')), [['authorize-stage',6]]);
        await page.evaluate(() => window.commerceFixture.clear());
        await launch(button(/Next Mission.*Red Sun/), 4);
        await leave();
        await heading('Campaign').waitFor();
        assert.equal(await button(/^15 The Flagship/).isDisabled(), true);
        assert.equal(await button('Endless').isDisabled(), true);
        await button('Back').tap();
        await page.evaluate(() => {
          // A stale UI status still advertises ownership when the host has revoked it.
          window.testCommerce.store.owned = false;
        });
        await button('Play').tap();
        await heading('Campaign').waitFor();
        await page.evaluate(() => {
          window.testCommerce.store.available = false;
          window.testCommerce.store.notify();
        });
        await open();
        assert.equal(await button('Unlock Full Game').isDisabled(), true);
        assert.equal(await page.getByText('3,99 €', { exact:true }).count(), 0);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});

test('Help and Legal is reachable from compact title and Settings, and rating is manual and native only', { skip: !origin, timeout:40000 }, async () => {
  const browser = await chromium.launch();
  try {
    for (const native of [false, true]) {
      const context = await browser.newContext({ viewport:{ width:320, height:568 }, hasTouch:true, isMobile:true, serviceWorkers:'block' });
      try {
        const page = await context.newPage();
        if (native) {
          const entry = new URL(origin);
          await page.route((url) => url.origin === entry.origin && url.pathname === entry.pathname, async (route) => {
            const response = await route.fetch();
            await route.fulfill({ response, body:(await response.text()).replace('<html ', '<html data-native-flight="true" ') });
          });
        }
        await page.addInitScript(() => {
          const rating = { available:false, result:'failed', calls:[] };
          window.ratingFixture = rating;
          window.stellarCommerce = async (op) => {
            rating.calls.push(op);
            if (op === 'rating-status') return { available:rating.available };
            if (op === 'rate-app') return { result:rating.result };
            return { owned:false };
          };
        });
        const button = (name) => page.getByRole('button', { name, exact:true });
        const heading = (name) => page.getByRole('heading', { name, exact:typeof name === 'string' });
        await page.goto(origin);
        const help = button('Help & Legal');
        await button('More').waitFor();
        assert.equal(await help.count(), 0);
        await button('More').tap();
        await help.waitFor();
        const frame = await page.locator('#frame').boundingBox();
        const titleHelp = await help.boundingBox();
        assert.ok(titleHelp.height >= 44 && titleHelp.y + titleHelp.height <= frame.y + frame.height + 1);
        assert.equal(await page.evaluate(() => window.ratingFixture.calls.includes('rate-app')), false);
        await help.tap();
        await heading('Help & Legal').waitFor();
        const rating = button('Rate the App');
        if (native) {
          await page.getByText('Rating becomes available when the store listing opens.').waitFor();
          assert.equal(await rating.isDisabled(), true);
          assert.equal(await button('Purchases & Restore').isVisible(), true);
        } else {
          assert.equal(await rating.count(), 0);
          assert.equal(await button('Purchases & Restore').count(), 0);
        }
        for (const [label, title] of [['Privacy Policy', /Privacy [Pp]olicy/], ['Terms of Use', /Terms of [Uu]se/], ['Support', /Support/]]) {
          await button(label).tap();
          await heading(title).waitFor();
          assert.ok(await page.locator('.policy-section').count() > 0);
          assert.equal(await page.locator('#menu').evaluate((menu) => menu.scrollWidth <= menu.clientWidth), true);
          await button('Back').tap();
          assert.equal(await button(label).evaluate((control) => document.activeElement === control), true);
        }
        await button('Back').tap();
        assert.equal(await help.evaluate((control) => document.activeElement === control), true);
        await button('Settings').tap();
        assert.equal(await help.isVisible(), true);
        await page.evaluate(() => { window.ratingFixture.available = true; });
        await help.tap();
        if (native) {
          await page.waitForFunction(() => !document.querySelector('#rate-app')?.disabled);
          assert.equal(await page.evaluate(() => window.ratingFixture.calls.includes('rate-app')), false);
          await rating.tap();
          await page.getByText(/Could not open the store/).waitFor();
          await page.evaluate(() => { window.ratingFixture.result = 'opened'; });
          await rating.tap();
          await page.getByText(/Could not open the store/).waitFor({ state:'hidden' });
          assert.equal(await page.evaluate(() => window.ratingFixture.calls.filter((op) => op === 'rate-app').length), 2);
        } else assert.deepEqual(await page.evaluate(() => window.ratingFixture.calls), []);
        await button('Back').tap();
        await heading('Settings').waitFor();
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});

test('first Play saves a call sign, offers an illustrated opening and preserves the title layout', { skip: !origin, timeout:60000 }, async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width:320, height:568 }, { width:390, height:844 }, { width:844, height:390 }]) {
      const context = await browser.newContext({ viewport, hasTouch:true, isMobile:true, serviceWorkers:'block' });
      try {
        const page = await context.newPage();
        const button = (name) => page.getByRole('button', { name, exact:true });
        const heading = (name) => page.getByRole('heading', { name, exact:true });
        await page.goto(origin);
        await button('Play').waitFor();
        const arena = await page.locator('.frame').boundingBox();
        const play = await button('Play').boundingBox();
        const pilot = await page.locator('.title-pilot').boundingBox();
        const ratio = (play.y + play.height / 2 - arena.y) / arena.height;
        assert.ok(ratio >= .53 && ratio <= .78, `Play center was at ${ratio}`);
        assert.ok(play.y + play.height <= pilot.y, 'Play should be above the call sign');
        for (const item of await page.locator('.title-actions button').all()) {
          const bounds = await item.boundingBox();
          assert.ok(bounds.width >= 44 && bounds.height >= 44);
        }
        await button('Play').tap();
        await heading('Call sign').waitFor();
        const name = page.getByRole('textbox', { name:'Pilot call sign' });
        const suggestion = await name.inputValue();
        await button('Reroll').tap();
        assert.notEqual(await name.inputValue(), suggestion);
        await name.fill('<b>');
        await name.press('Enter');
        assert.equal(await name.getAttribute('aria-invalid'), 'true');
        await name.fill('  Orion   9 ');
        await button('Confirm & continue').tap();
        await heading('Neyara under attack').waitFor();
        await page.locator('.story-art img').evaluate((image) => image.decode());
        await button('Skip').tap();
        await button('Pause').waitFor();
        assert.equal(await page.locator('#training-actions').isVisible(), false);
        await page.reload();
        await page.getByText('Orion 9', { exact:true }).waitFor();
        await button('Campaign').tap();
        await button('Story log').tap();
        await button('Neyara under attack').tap();
        await heading('Neyara under attack').waitFor();
        await button('Back to story log').tap();
        await button('Back').tap();
        await button('Back').tap();
        await button('Play').tap();
        await button('Pause').waitFor();
        assert.equal(await heading('Call sign').count(), 0);
        assert.equal(await heading('Neyara under attack').count(), 0);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});

test('a fast touch release preserves pending steering and a canceled touch stops it', { skip: !origin, timeout:25000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true, serviceWorkers:'block' });
    await page.route(/\/app\.mjs$/, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body:`${await response.text()}\nwindow.sampleSteering = () => ({\n        tick:state.flight.ticks, x:state.flight.player.x, aim:state.flight.xIntent,\n        unit:renderer.unit, cap:state.flight.speed * .19 });` });
    });
    await page.clock.install();
    await page.goto(origin);
    await page.getByRole('button', { name:'Play', exact:true }).tap();
    await confirmOpening(page);
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 60)));
    const touch = await page.context().newCDPSession(page);
    const dispatch = (type, x) => touch.send('Input.dispatchTouchEvent', {
      type, touchPoints:x === undefined ? [] : [{ x, y:659, id:1 }]
    });
    const sample = () => page.evaluate(() => window.sampleSteering());
    const before = await sample();
    await dispatch('touchStart', 150);
    await dispatch('touchMove', 182);
    await dispatch('touchEnd');
    const released = await sample();
    assert.equal(released.tick, before.tick);
    assert.ok(Math.abs(released.aim - before.aim - 32 * 1.12 / released.unit) < .2);
    await page.clock.runFor(240);
    const settled = await sample();
    assert.ok(Math.abs(settled.x - released.aim) < .08);

    await dispatch('touchStart', 150);
    await dispatch('touchMove', 200);
    await dispatch('touchCancel');
    const canceled = await sample();
    assert.equal(canceled.aim, canceled.x);
    await page.clock.runFor(240);
    assert.ok(Math.abs((await sample()).x - settled.x) < .08);

    await dispatch('touchStart', 150);
    await dispatch('touchMove', 350);
    await dispatch('touchEnd');
    const flick = await sample();
    assert.ok(Math.abs(flick.aim - flick.x - flick.cap) < .08);
  } finally { await browser.close(); }
});

test('a returning playfield follows an operating system reduction preference', { skip: !origin, timeout:45000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport:{ width:390, height:844 }, reducedMotion:'no-preference', serviceWorkers:'block' });
    await page.goto(origin);
    const open = async () => {
      await page.getByRole('button', { name:'More', exact:true }).click();
      await page.getByRole('button', { name:'Settings', exact:true }).click();
    };
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

test('Campaign exposes a direct Special practice drill with stable flight meters', { skip: !origin, timeout:45000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport:{ width:320, height:568 }, isMobile:true, hasTouch:true, serviceWorkers:'block' });
    const button = (name) => page.getByRole('button', { name, exact:true });
    await page.goto(origin);
    await button('Campaign').tap();
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
    await page.getByRole('heading', { name:'Campaign', exact:true }).waitFor();
  } finally { await browser.close(); }
});

test('Specials unlock, persist across reload, and work in practice without rewards', { skip: !origin, timeout:30000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport:{ width:320, height:568 }, isMobile:true, hasTouch:true, serviceWorkers:'block' });
    const button = (name) => page.getByRole('button', { name, exact:true });
    await page.route(/\/app\.mjs(\?|$)/, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body:(await response.text()) + '\nwindow.specialsProbe = { state, store };' });
    });
    await page.goto(origin);
    await button('Hangar').tap();
    await button('Specials').tap();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.hangar-tab').evaluateAll(tabs =>
      tabs.every((tab) => tab.scrollWidth <= tab.clientWidth)), true);
    assert.equal(await button('Equip Ghost Shift').getAttribute('aria-pressed'), 'true');
    await page.getByText('Clear Asteroid Belt to unlock.', { exact:true }).waitFor();
    assert.equal(await button('Equip Ion Burst').count(), 0);
    // Seed progression in a disposable save. The campaign suite clears the route by flying it.
    await page.evaluate(() => window.specialsProbe.store.change((pilot) => { pilot.clears = { 1:1, 7:1, 2:1 }; }));
    await page.reload();
    await button('Hangar').tap();
    await button('Specials').tap();
    const equip = button('Equip Ion Burst');
    await equip.tap();
    await page.locator('button[data-action="special:ion"][aria-pressed="true"]').waitFor();
    assert.equal(await equip.evaluate((control) => document.activeElement === control), true);
    const before = await page.evaluate(() => window.specialsProbe.store.load());
    await page.reload();
    await button('Campaign').tap();
    await button('Practice').tap();
    await button('Flight basics').tap();
    await page.getByText('Steer your Fighter', { exact:true }).waitFor();
    assert.match(await page.locator('#sky').getAttribute('aria-label'), /Space for Ghost Shift/);
    await button('End practice').tap();
    await button('Ion Burst drill').tap();
    const burst = button('Ion Burst');
    await burst.waitFor();
    assert.match(await page.locator('#sky').getAttribute('aria-label'), /Space for Ion Burst/);
    await page.waitForFunction(() => document.getElementById('ghost-shift').getAttribute('aria-disabled') === 'false');
    await burst.tap();
    await page.getByText('Try again', { exact:true }).waitFor();
    await page.getByText('Burst now', { exact:true }).waitFor();
    await burst.tap();
    await button('Done').tap();
    await page.getByRole('heading', { name:'Practice', exact:true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.specialsProbe.store.load()), before);
  } finally { await browser.close(); }
});

test('Campaign, Hangar and Settings keep their controls inside the landscape frame', { skip: !origin, timeout:15000 }, async () => {
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
    await button('Campaign').tap();
    await fit('.stage, .campaign-postgame button');
    await button('Back').tap();
    await button('Hangar').tap();
    await fit('.craft-choice');
    await button('Upgrades').tap();
    await fit('.shop-card');
    await button('Specials').tap();
    await fit('.hangar-tab, .special-choice, .special-choice button');
    await button('Back').tap();
    await button('More').tap();
    await button('Settings').tap();
    await fit('.setting, #sensitivity');
  } finally { await browser.close(); }
});

test('Practice teaches steering, targeting and a timed Shift without creating a recorded run', { skip: !origin, timeout:90000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport:{ width:390, height:844 }, serviceWorkers:'block' });
    await page.route(/\/app\.mjs(\?|$)/, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body:(await response.text()) + '\nwindow.trainingProbe = { state, store };' });
    });
    const button = (name) => page.getByRole('button', { name, exact:true });
    await page.goto(origin);
    await button('Campaign').click();
    await button('Practice').click();
    await button('Flight basics').click();
    await page.getByText('Steer your Fighter', { exact:true }).waitFor();
    const exit = button('End practice');
    await exit.focus();
    await page.keyboard.down('ArrowRight');
    await page.getByText('Line up a shot', { exact:true }).waitFor();
    await page.keyboard.up('ArrowRight');
    assert.equal(await exit.evaluate((control) => document.activeElement === control), true);
    await page.locator('#sky').focus();
    for (let attempt = 0; attempt < 80; attempt++) {
      const target = await page.evaluate(() => {
        const { training, flight } = window.trainingProbe.state;
        return training.step === 'fire' && flight.enemies.length ? flight.enemies[0].x - flight.player.x : null;
      });
      if (await page.evaluate(() => window.trainingProbe.state.training.step === 'shift')) break;
      if (target !== null && Math.abs(target) > 8) {
        const key = target < 0 ? 'ArrowLeft' : 'ArrowRight';
        await page.keyboard.down(key);
        await page.waitForTimeout(Math.min(90, Math.abs(target) * 1.6));
        await page.keyboard.up(key);
      } else await page.waitForTimeout(85);
    }
    await page.getByText('Shift now', { exact:true }).waitFor();
    await page.keyboard.press('Space');
    await button('Done').click();
    await page.getByRole('heading', { name:'Practice', exact:true }).waitFor();
    assert.equal(await page.evaluate(() => Object.keys(window.trainingProbe.state.pilot.active).length), 0);
    await page.close();
  } finally { await browser.close(); }
});

test('Play resumes the campaign with the equipped ship and replays the finale after completion', { skip: !origin, timeout:45000 }, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{ width:320, height:568 }, hasTouch:true, isMobile:true, serviceWorkers:'block' });
  try {
    await page.route(/\/app\.mjs(\?|$)/, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body:(await response.text()) + '\nwindow.quickPlay = { state, store };' });
    });
    const play = page.getByRole('button', { name:'Play', exact:true });
    for (const [cleared, expected] of [[3,8], [15,6]]) {
      await page.goto(origin);
      await play.waitFor();
      await page.evaluate((ids) => window.quickPlay.store.change((pilot) => {
        for (const id of ids) pilot.clears[id] = 1;
        pilot.ship = 'needle';
        pilot.callSign = 'Test Pilot'; pilot.settings.skipStory = true;
      }), missionIds.slice(0, cleared));
      await page.reload();
      await play.tap();
      await page.waitForFunction((stage) => {
        const { state } = window.quickPlay;
        return state.mode === 'playing' && state.flight.run.stage === stage && state.flight.run.ship === 'needle';
      }, expected);
    }
  } finally { await browser.close(); }
});

test('Side Operations unlock independently and never interrupt the main mission route or its ending', { skip: !origin, timeout:100000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport:{ width:320, height:568 }, isMobile:true, hasTouch:true,
      reducedMotion:'reduce', serviceWorkers:'block' });
    await page.route(/\/app\.mjs$/, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body:`${await response.text()}
        window.campaignProbe = {
          store, state,
          prepare: (ids) => store.change((pilot) => {
            pilot.callSign = 'Test Pilot'; pilot.settings.skipStory = true;
            for (const id of ids) pilot.clears[id] = 1;
          }),
          clear: () => Object.assign(state.flight, { status:'clear', score:38000, kills:64, elapsed:240, movement:4000 })
        };` });
    });
    const button = (name) => page.getByRole('button', { name, exact:typeof name === 'string' });
    const heading = (name) => page.getByRole('heading', { name, exact:true });
    const launch = async (control, id) => {
      await control.tap();
      await page.waitForFunction((stage) => window.campaignProbe.state.mode === 'playing' && window.campaignProbe.state.flight.run.stage === stage, id);
    };
    await page.goto(origin);
    await button('Play').waitFor();
    await page.evaluate(() => window.campaignProbe.prepare([]));
    await page.reload();
    await button('Campaign').tap();
    const actOne = page.locator('.campaign-act').first();
    assert.equal(await page.locator('.campaign-act > ol > li').count(), 15);
    assert.equal(await page.locator('.side-operations li').count(), 9);
    await actOne.locator('summary').tap();
    assert.equal(await button(/^A1 Evacuation Corridor/).isDisabled(), true);
    await launch(button(/^01 Neyara Orbit/), 1);
    await page.evaluate(() => window.campaignProbe.clear());
    await heading('Mission clear').waitFor();
    await page.getByText('Side Operation unlocked · Evacuation Corridor', { exact:true }).waitFor();
    assert.equal(await button(/Next Mission · The Pursuit/).isEnabled(), true);
    await button('Title Screen').tap();
    await button('Campaign').tap();
    await actOne.locator('summary').tap();
    assert.equal(await button(/^A2 Wreckage Sweep/).isDisabled(), true);
    await launch(button(/^A1 Evacuation Corridor/), 16);
    await page.locator('#operation-objective').getByText('Bombers', { exact:true }).waitFor();
    await page.evaluate(() => window.campaignProbe.clear());
    await heading('Operation clear').waitFor();
    assert.equal(await button(/Next Mission/).count(), 0);
    await button('Title Screen').tap();
    await button('More').tap();
    await button('Records').tap();
    await page.getByText('1 / 15', { exact:true }).waitFor();
    await page.getByText('1 / 9', { exact:true }).waitFor();
    await page.getByText('2 / 24', { exact:true }).waitFor();
    await button('Back').tap();
    await button('Back').tap();
    await launch(button('Play'), 7);
    await page.evaluate((ids) => window.campaignProbe.prepare(ids), missionIds.slice(0, 14));
    await page.reload();
    await launch(button('Play'), 6);
    await page.evaluate(() => window.campaignProbe.clear());
    await heading('Fleet defeated').waitFor();
    await page.getByText('Veteran Campaign and Endless unlocked', { exact:true }).waitFor();
    const counts = await page.evaluate(async () => {
      const pilot = await window.campaignProbe.store.load();
      return [Object.keys(pilot.clears).length, Object.keys(pilot.sideClears).length];
    });
    assert.deepEqual(counts, [15, 1]);
    await button('Return to Campaign').tap();
    assert.equal(await button('Endless').isEnabled(), true);
    await button('Veteran').tap();
    await heading('Veteran Campaign').waitFor();
    assert.equal(await page.locator('.side-operations').count(), 0);
    await page.close();
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
      await a.change((p) => { p.callSign = 'Test Pilot'; p.settings.skipStory = true; beginRun(p, 'same', 'arcade', 1); });
      const [first, second] = await Promise.all([a.change((p) => settleRun(p,'same',result)), b.change((p) => settleRun(p,'same',result))]);
      await a.change((p) => { p.salvage = 28; });
      const [buy1,buy2] = await Promise.all([a.change((p) => install(p,'damage')), b.change((p) => install(p,'damage'))]);
      const failedWrite = await a.change((p) => { p.salvage += 999; throw Error('synthetic abort'); }).then(() => false, () => true);
      const current = await b.load();
      a.db.close();
      b.db.close();
      return { duplicate1:first.result.award, duplicate2:second.result.award, buys:[buy1.result,buy2.result], failedWrite,
        salvage:current.salvage, clears:current.clears[1], tier:current.tiers.damage };
    });
    assert.equal(report.duplicate1, report.duplicate2);
    assert.ok(report.duplicate1 > 0);
    assert.equal(report.buys.filter(Boolean).length, 1);
    assert.ok(report.salvage >= 0 && report.salvage < 28);
    assert.equal(report.failedWrite, true);
    assert.equal(report.clears, 1);
    assert.equal(report.tier, 1);

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
    await page.getByRole('button', { name:'More', exact:true }).tap();
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
    await page.getByRole('button', { name:'More', exact:true }).tap();
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
    await page.getByRole('button', { name:'More', exact:true }).tap();
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
    await confirmOpening(page);
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
          if (state === 'stages') await page.getByRole('button', { name:'Campaign', exact:true }).tap();
          const box = await banner.boundingBox();
          assert.ok(box.y >= 0 && box.y + box.height < 568, JSON.stringify(box));
        }
        await page.getByRole('button', { name:/01 Neyara Orbit/ }).tap();
        await confirmOpening(page);
        // Only the storage path is under test here. The real campaign tests clear by play.
        await page.evaluate(() => {
          window.storageFixture.flight.score = 7451;
          window.storageFixture.flight.status = 'clear';
        });
        const recap = page.getByRole('button', { name:'Skip', exact:true });
        await recap.tap();
        const awardText = await page.getByText(/Salvage this session/).textContent();
        const advance = /\d+/.exec(awardText)[0];
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
          assert.equal(await page.getByText(/Salvage banked|The Pursuit unlocked/).count(),0);
        } else {
          await page.getByText(/Salvage banked/).waitFor();
          await page.getByText('The Pursuit unlocked').waitFor();
        }
        await page.reload();
        await page.getByRole('button', { name:'Campaign', exact:true }).tap();
        assert.equal(await page.getByRole('button', {name:/02 The Pursuit/}).isEnabled(), !existing);
        await page.getByText(existing ? '0 Salvage' : `${advance} Salvage`, {exact:true}).waitFor();
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});

test('results scope record comparisons and link back to the Title Screen', { skip: !origin, timeout:45000 }, async () => {
  const browser = await chromium.launch();
  try {
    for (const [mode, name, status, viewport] of [
      ['arcade', 'Mission clear', 'clear', { width:390, height:844 }],
      ['arcade', 'Flight lost', 'defeat', { width:320, height:568 }],
      ['endless', 'Run complete', 'defeat', { width:844, height:390 }]
    ]) {
      const context = await browser.newContext({ viewport, isMobile:true, hasTouch:true, serviceWorkers:'block' });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route(/\/app\.mjs(\?|$)/, async (route) => {
          const response = await route.fetch();
          await route.fulfill({ response, body:(await response.text()) + '\nwindow.resultFixture = { state, store };' });
        });
        await page.goto(origin);
        const button = (name) => page.getByRole('button', { name, exact:true });
        const seedOlderBest = status === 'clear' || mode === 'endless';
        if (seedOlderBest) {
          await button('Play').waitFor();
          await page.evaluate(async (mode) => {
            await window.resultFixture.store.change((pilot) => {
              pilot.settings.skipStory = true;
              pilot.callSign = 'Test Pilot';
              pilot.clears = { 1:1 };
              if (mode === 'endless') pilot.legacy = { ...pilot.legacy, endlessQualified:true };
              const prior = { mode, rules:'arcade-8', ship:'kestrel', special:'ghost', equipment:[], score:150000, duration:200, kills:90 };
              if (mode === 'endless') pilot.records.endless = { ...prior, status:'defeat', stage:null };
              else pilot.records.arcade[1] = { ...prior, status:'clear', stage:1 };
            });
          }, mode);
          await page.reload();
          await button('Campaign').tap();
          if (mode === 'endless') await button('Endless').tap();
          else await page.getByRole('button', { name:/^01 Neyara Orbit/ }).tap();
        } else {
          await button('Play').tap();
          await confirmOpening(page);
        }
        await button('Pause').waitFor();
        // This fixture exercises a real settlement and result transition without playing three full flights.
        await page.evaluate((status) => Object.assign(window.resultFixture.state.flight, {
          score:128394, status, elapsed:168, kills:67, movement:2300
        }), status);
        await page.getByRole('heading', { name, exact:true }).waitFor();
        const title = button('Title Screen');
        await title.waitFor();
        if (status === 'defeat') {
          const afterFlight = page.getByRole('navigation', { name:'After the flight' });
          assert.deepEqual(await afterFlight.getByRole('button').allTextContents(), ['Upgrades', 'Title Screen']);
          assert.equal(await button(mode === 'endless' ? 'Fly again' : 'Retry').isVisible(), true);
        }
        const comparison = page.locator('.result-comparison');
        if (seedOlderBest) {
          await comparison.waitFor();
          assert.match(await comparison.innerText(), mode === 'endless' ? /First survival result/ : /First clear with this loadout/);
        } else assert.equal(await comparison.count(), 0);
        const fit = await page.locator('.result-card').evaluate((card) => card.scrollWidth <= card.clientWidth);
        assert.equal(fit, true);
        const target = await title.boundingBox();
        assert.ok(target.width >= 44 && target.height >= 44);
        await title.tap();
        await button('Play').waitFor();
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});

test('flight instructions stay in the HUD during real touch and a rail strike', { skip: !origin, timeout:100000 }, async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{width:320,height:568},{width:390,height:844}]) {
      const context = await browser.newContext({viewport,isMobile:true,hasTouch:true,serviceWorkers:'block'});
      try {
        const page = await context.newPage();
        const touch = await context.newCDPSession(page);
        await page.route(/\/app\.mjs(\?|$)/, async (route) => {
          const response = await route.fetch();
          await route.fulfill({response, body:(await response.text())+'\nwindow.hudProbe = {state,renderer,store,stages:STAGES};'});
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
        await page.getByRole('button',{name:'Campaign',exact:true}).tap();
        await page.getByRole('button',{name:/01 Neyara Orbit/}).tap();
        await confirmOpening(page);
        await page.getByText('Hold the line at Neyara and break the enemy command ship.',{exact:true}).waitFor();
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
          await window.hudProbe.store.change((pilot) => {
            for (const { id } of window.hudProbe.stages.slice(0,6)) pilot.clears[id] = 1;
          });
        });

        await page.reload();
        await page.getByRole('button',{name:'Campaign',exact:true}).tap();
        const redSun = page.getByRole('button',{name:/07 Red Sun/});
        assert.equal(await page.getByRole('button',{name:'Endless',exact:true}).getAttribute('aria-describedby'),'endless-note');
        assert.match(await page.locator('#endless-note').innerText(),/Unlocks after the Standard campaign/);
        await redSun.tap();
        await page.locator('#flight-tip').waitFor();
        await dragHigh();
        await page.evaluate(() => {
          const f = window.hudProbe.state.flight;
          f.terrainIndex = f.stage.terrain.findIndex((entry) => entry[1] === 'rail');
          f.elapsed = f.stage.terrain[f.terrainIndex][0] - .02;
          f.waveIndex = f.stage.waves.length;
          f.dropIndex = f.stage.drops.length;
          f.cruiserIndex = f.stage.cruisers.length;
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

test('keyboard focus stays on an in-place upgrade after installation', { skip: !origin, timeout:75000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.goto(origin);
    await page.getByRole('button',{name:'Hangar',exact:true}).waitFor();
    await page.evaluate(async () => {
      const main = document.querySelector('script[type=module]').src;
      const { PilotStore } = await import(new URL('pilot.mjs', main));
      const store = new PilotStore(indexedDB);
      await store.open();
      await store.change((pilot) => { pilot.salvage = 40; });
      store.db.close();
    });
    await page.reload();
    await page.getByRole('button',{name:'Hangar',exact:true}).press('Enter');
    const activate = async (button) => {
      await button.press('Enter');
      assert.equal(await button.evaluate((node) => document.activeElement === node),true);
    };
    await activate(page.getByRole('button',{name:/^Interceptor/}));
    await activate(page.getByRole('button',{name:'Upgrades',exact:true}));
    const chamber = page.getByRole('button',{name:/^Fire Rate/});
    await chamber.press('Enter');
    await chamber.getByText(/^Tier 1\/15/).waitFor();
    await page.getByRole('heading',{name:'Upgrades'}).waitFor();
    assert.equal(await chamber.getAttribute('data-installed'), 'true');
    assert.equal(await chamber.evaluate((node) => document.activeElement === node),true);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button',{name:/^Thrusters/}).evaluate((node) => document.activeElement === node),true);
    await page.close();
  } finally { await browser.close(); }
});

test('Space activates Pause on focus and uses the indicated ability from the playfield', { skip: !origin, timeout:105000 }, async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width:320, height:568 }, { width:390, height:844 }]) {
      const context = await browser.newContext({ viewport, isMobile:true, hasTouch:true, serviceWorkers:'block' });
      try {
        const page = await context.newPage();
        await page.route(/\/app\.mjs(\?|$)/, async (route) => {
          const response = await route.fetch();
          await route.fulfill({ response, body:(await response.text()) + '\nwindow.controlProbe = { state, store, stages:STAGES };' });
        });
        const button = (name) => page.getByRole('button', { name, exact:typeof name === 'string' });
        const playing = () => page.waitForFunction(() => document.activeElement?.id === 'sky');
        await page.goto(origin);
        await button('Play').press('Enter');
        await confirmOpening(page);
        await playing();
        assert.match(await page.locator('#sky').getAttribute('aria-label'), /Space for Ghost Shift/);
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
          for (const { id } of window.controlProbe.stages.slice(0,11)) pilot.clears[id] = 1;
          pilot.ship = 'bastion';
          pilot.special = 'ion';
        }));

        await page.reload();
        await button('Campaign').tap();
        await button(/^12 Wraith/).tap();
        await playing();
        assert.match(await page.locator('#sky').getAttribute('aria-label'), /Space for Ion Burst/);
        await page.evaluate(() => {
          const f = window.controlProbe.state.flight;
          f.elapsed = f.stage.bossAt - .02;
          f.waveIndex = f.stage.waves.length;
          f.dropIndex = f.stage.drops.length;
          f.terrainIndex = f.stage.terrain.length;
          f.cruiserIndex = f.stage.cruisers.length;
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

test('launch commits to flight and slow art has a bounded fallback', { skip: !origin, timeout:90000 }, async () => {
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
      await store.change((pilot) => { pilot.callSign = 'Test Pilot'; pilot.settings.skipStory = true; });
      store.db.close();
    });
    await page.reload();
    const button = (name) => page.getByRole('button', { name, exact:typeof name === 'string' });
    await button('Campaign').tap();
    const stage = button(/^01 Neyara Orbit/);
    await stage.tap();
    const image = await stalled;
    await page.getByRole('status').filter({ hasText:'Loading flight assets' }).waitFor();
    assert.equal(await button('Cancel launch').count(), 0);
    await page.keyboard.press('Escape');
    const deadline = 5600;
    await button('Pause').waitFor({ timeout:deadline });
    await image.abort().catch(() => {});
    await page.getByText('Hold the line at Neyara and break the enemy command ship.', { exact:true }).waitFor();
    await button('Pause').tap();
    await page.getByRole('heading', { name:'Paused' }).waitFor();
    await page.close();
  } finally { await browser.close(); }
});
