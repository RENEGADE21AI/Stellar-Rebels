const assert = require('node:assert/strict');
const test = require('node:test');
const { chromium } = require('playwright');

const origin = process.env.STELLAR_WEB_URL;

test('pause touch settings update the same flight and persist on the device', { skip: !origin, timeout: 60000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block'
    });
    await page.route(/\/app\.mjs$/, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}
        window.controlsProbe = {
          seedIdentity: () => store.change((pilot) => { pilot.callSign = 'Test Pilot'; pilot.settings.skipStory = true; }),
          flight: () => ({ id: state.flight?.run.id, ticks: state.flight?.ticks, mode: state.mode }),
          saved: async () => (await store.load()).settings,
          usesStick: () => Boolean(state.pointer?.stick)
        };
      ` });
    });
    await page.goto(origin);
    const button = (name) => page.getByRole('button', { name, exact: true });
    await button('Play').waitFor();
    await page.evaluate(() => window.controlsProbe.seedIdentity());
    await page.reload();
    await button('Play').tap();
    const ghost = page.locator('#ghost-control');
    await ghost.waitFor();
    const originalGhost = await ghost.boundingBox();
    await button('Pause').tap();
    const paused = await page.evaluate(() => window.controlsProbe.flight());
    assert.equal(paused.mode, 'paused');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'pause-title');
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Settings', exact: true }).count(), 1);
    await button('Settings').tap();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'pause-title');
    await page.getByLabel('Drag sensitivity').selectOption('direct');
    await page.waitForFunction(async () => (await window.controlsProbe.saved()).sensitivity === 'direct');
    await page.getByLabel('Touch steering').selectOption('stick');
    assert.equal(await page.getByLabel('Drag sensitivity').isVisible(), false);
    await page.getByLabel('Joystick size').press('End');
    await page.getByLabel('Ability button size').press('End');
    await page.getByLabel('Ability button horizontal position').press('Home');
    await page.getByLabel('Ability button height').press('End');
    await page.waitForFunction(async () => {
      const prefs = await window.controlsProbe.saved();
      return prefs.steering === 'stick' && prefs.stickSize === 112 && prefs.specialSize === 84 &&
        prefs.specialHorizontal === 0 && prefs.specialVertical === 100;
    });
    assert.equal(await page.locator('.controls-preview').getAttribute('data-steering'), 'stick');
    assert.deepEqual(await page.evaluate(() => window.controlsProbe.flight()), paused);
    await button('Back to pause').tap();
    await button('Resume').tap();
    await page.waitForFunction(() => window.controlsProbe.flight().mode === 'playing');
    assert.equal((await page.evaluate(() => window.controlsProbe.flight())).id, paused.id);
    const movedGhost = await ghost.boundingBox();
    assert.equal(Math.round(movedGhost.width), 84);
    assert.ok(movedGhost.x < originalGhost.x && movedGhost.y < originalGhost.y);
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 160, y: 620 }] });
    assert.equal(await page.evaluate(() => window.controlsProbe.usesStick()), true);
    assert.equal(Math.round((await page.locator('#flight-stick').boundingBox()).width), 112);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.reload();
    await button('More').tap();
    await button('Settings').tap();
    assert.equal(await page.getByLabel('Touch steering').inputValue(), 'stick');
    assert.equal(await page.getByLabel('Joystick size').inputValue(), '112');
    assert.equal(await page.getByLabel('Ability button horizontal position').inputValue(), '0');
  } finally {
    await browser.close();
  }
});

test('only the visible title ship opens Hangar and the Upgrades badge reflects what can be bought', { skip: !origin, timeout: 30000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, reducedMotion:'reduce', serviceWorkers: 'block'
    });
    await page.route(/\/app\.mjs$/, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}
        window.grantUpgradeSalvage = () => store.change((pilot) => { pilot.salvage = 20; });
        window.hitsTitleCraft = (x, y) => state.titlePatrol?.hitsShip(x, y);
      ` });
    });
    await page.goto(origin);
    const button = (name) => page.getByRole('button', { name, exact: true });
    const badge = page.locator('.hangar-upgrade-badge');
    await button('Play').waitFor();
    assert.equal(await badge.count(), 0);
    await page.evaluate(() => window.grantUpgradeSalvage());
    await page.reload();
    await badge.waitFor();
    assert.equal(await button('Upgrades').getAttribute('aria-describedby'), 'hangar-upgrade-notice');
    const field = await page.locator('.title-patrol').boundingBox();
    const ship = { x:field.x + field.width * .5, y:field.y + field.height * .44 };
    await page.waitForFunction(({ x, y }) => window.hitsTitleCraft(x, y), ship);
    await page.touchscreen.tap(ship.x - field.width * .19, ship.y - field.width * .16);
    assert.equal(await button('Play').isVisible(), true);
    await page.touchscreen.tap(ship.x, ship.y);
    await page.getByRole('heading', { name: 'Hangar', exact: true }).waitFor();
    assert.equal(await button('Ship bay').getAttribute('aria-pressed'), 'true');
    await button('Upgrades').tap();
    await page.getByRole('button', { name: /^Weapon Damage/ }).tap();
    await button('Install Tier 1 · 20 Salvage').tap();
    await page.getByText('Tier 1/15', { exact:true }).waitFor();
    await button('Back').tap();
    await button('Back').tap();
    await button('Play').waitFor();
    assert.equal(await badge.count(), 0);
  } finally {
    await browser.close();
  }
});

test('a steering thumb and a second Special touch do not zoom or cancel steering', { skip: !origin, timeout: 75000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width:390, height:844 }, isMobile:true, hasTouch:true, reducedMotion:'reduce', serviceWorkers:'block'
    });
    await page.route(/\/app\.mjs$/, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}
        window.touchProbe = {
          seed: () => store.change((pilot) => { pilot.callSign = 'Test Pilot'; pilot.settings.skipStory = true; }),
          sample: () => ({ x:state.flight.player.x, realm:state.flight.player.realm, steering:Boolean(state.pointer),
            scale:visualViewport.scale, scrollX:window.scrollX, scrollY:window.scrollY })
        };
      ` });
    });
    await page.goto(origin);
    const button = (name) => page.getByRole('button', { name, exact:true });
    await button('Play').waitFor();
    const touch = await page.context().newCDPSession(page);
    const pinch = async () => {
      const before = await page.evaluate(() => window.visualViewport.scale);
      await touch.send('Input.synthesizePinchGesture', { x:190, y:330, scaleFactor:1.7, gestureSourceType:'touch' });
      assert.equal(await page.evaluate(() => window.visualViewport.scale), before);
    };
    await pinch();
    await page.evaluate(() => window.touchProbe.seed());
    await page.reload();
    await button('Play').tap();
    const special = button('Ghost Shift');
    await special.waitFor();
    const control = await special.boundingBox();
    const dispatch = (type, touchPoints) => touch.send('Input.dispatchTouchEvent', { type, touchPoints });
    const thumb = { id:1, x:150, y:639 };
    const ability = { id:2, x:control.x + control.width / 2, y:control.y + control.height / 2 };
    const initial = await page.evaluate(() => window.touchProbe.sample());
    await dispatch('touchStart', [thumb]);
    await dispatch('touchStart', [thumb, ability]);
    await page.waitForFunction(() => window.touchProbe.sample().realm === 'ghost');
    await dispatch('touchMove', [{ ...thumb, x:218, y:628 }, { ...ability, x:ability.x + 9 }]);
    await page.waitForFunction((x) => window.touchProbe.sample().x > x + 15, initial.x);
    const moved = await page.evaluate(() => window.touchProbe.sample());
    assert.equal(moved.steering, true);
    assert.deepEqual([moved.scale, moved.scrollX, moved.scrollY], [initial.scale, 0, 0]);
    await dispatch('touchEnd', []);
    assert.equal(await page.evaluate(() => window.touchProbe.sample().steering), false);
    await button('Pause').tap();
    await pinch();
    await page.close();
  } finally { await browser.close(); }
});
