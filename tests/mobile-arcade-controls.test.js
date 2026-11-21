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
          finishTraining: () => store.change((pilot) => { pilot.settings.trainingDone = true; }),
          flight: () => ({ id: state.flight?.run.id, ticks: state.flight?.ticks, mode: state.mode }),
          saved: async () => (await store.load()).settings,
          usesStick: () => Boolean(state.pointer?.stick)
        };
      ` });
    });
    await page.goto(origin);
    const button = (name) => page.getByRole('button', { name, exact: true });
    await button('Play').waitFor();
    await page.evaluate(() => window.controlsProbe.finishTraining());
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
    await page.getByLabel('Touch steering').selectOption('stick');
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
    await button('Settings').tap();
    assert.equal(await page.getByLabel('Touch steering').inputValue(), 'stick');
    assert.equal(await page.getByLabel('Joystick size').inputValue(), '112');
    assert.equal(await page.getByLabel('Ability button horizontal position').inputValue(), '0');
  } finally {
    await browser.close();
  }
});

test('the equipped title ship opens Hangar and its upgrade badge reflects what can be bought', { skip: !origin, timeout: 30000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, serviceWorkers: 'block'
    });
    await page.route(/\/app\.mjs$/, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}
        window.grantUpgradeSalvage = () => store.change((pilot) => { pilot.salvage = 70; });
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
    assert.equal(await button('Hangar').getAttribute('aria-describedby'), 'hangar-upgrade-notice');
    await page.getByRole('button', { name: /Change ship.*equipped/ }).tap();
    await page.getByRole('heading', { name: 'Hangar', exact: true }).waitFor();
    assert.equal(await button('Ship bay').getAttribute('aria-pressed'), 'true');
    await button('Upgrades').tap();
    await page.getByRole('button', { name: /^Calibrated Rails/ }).tap();
    await button('Install for 70 Salvage').tap();
    await button('Installed').waitFor();
    await button('Back').tap();
    await button('Back').tap();
    await button('Play').waitFor();
    assert.equal(await badge.count(), 0);
  } finally {
    await browser.close();
  }
});
