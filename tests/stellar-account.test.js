const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require('playwright');

const dist = process.env.STELLAR_ACCOUNT_DIST;
const origin = 'https://stellar-rebels.web.app';
const contentTypes = {
  '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json'
};
const fixture = `
export async function connectGoogleAuth() {
  return {
    ready: async () => {},
    signedIn: () => localStorage.getItem('fixture-signed-in') === 'true',
    observe: () => {},
    complete: async () => {
      if (sessionStorage.getItem('fixture-google-outcome') === 'cancel') return null;
      localStorage.setItem('fixture-signed-in', 'true');
      return {};
    },
    signIn: async () => {
      if (!sessionStorage.getItem('fixture-google-outcome')) throw { code: 'auth/network-request-failed' };
      location.reload();
      return new Promise(() => {});
    },
    signOut: async () => { localStorage.removeItem('fixture-signed-in'); }
  };
}
`;

async function pilotFingerprint(page, initialize = false) {
  return page.evaluate(async (initialize) => {
    const script = document.querySelector('script[type=module]');
    const { PilotStore } = await import(new URL('pilot.mjs', script.src));
    const save = new PilotStore(indexedDB);
    const before = await save.open();
    if (!initialize) return { salvage:before.salvage, stage:before.clears[1], music:before.settings.music };
    const { pilot } = await save.change((pilot) => {
      pilot.salvage = 89;
      pilot.clears[1] = 1;
      pilot.settings.music = false;
    });
    return { salvage:pilot.salvage, stage:pilot.clears[1], music:pilot.settings.music };
  }, initialize);
}

for (const [name, browserType, viewport] of [
  ['Chromium', chromium, { width:320, height:568 }],
  ['WebKit', webkit, { width:390, height:844 }]
]) {
  test(`${name} account redirect recovery keeps the actual guest save independent`, { skip:!dist, timeout:45000 }, async () => {
    const version = JSON.parse(await fs.readFile(path.resolve(dist, 'version.json'), 'utf8'));
    assert.ok(version.googleSignIn, 'Build with STELLAR_ENABLE_GOOGLE_SIGN_IN=1 first');
    const cspFile = JSON.parse(await fs.readFile(path.resolve(__dirname, '../firebase.stellar.json'), 'utf8'));
    const csp = cspFile.hosting.headers[0].headers.find((header) => header.key === 'Content-Security-Policy').value;
    const browser = await browserType.launch();
    try {
      const context = await browser.newContext({ viewport, isMobile:true, hasTouch:true, serviceWorkers:'block' });
      const vendorRequests = [];
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname.endsWith('/google-auth-vendor.mjs')) {
          vendorRequests.push(url.search);
          return vendorRequests.length === 1 ? route.fulfill({ status:503, body:'Temporary failure' }) :
            route.fulfill({ contentType:'text/javascript', body:fixture });
        }
        const file = path.resolve(dist, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
        if (!file.startsWith(path.resolve(dist) + path.sep)) return route.abort();
        try {
          return await route.fulfill({
            body:await fs.readFile(file),
            contentType:contentTypes[path.extname(file)],
            headers:{ 'Content-Security-Policy':csp }
          });
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          return route.fulfill({ status:404, body:'Unavailable' });
        }
      });

      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      const button = (label) => page.getByRole('button', { name:label, exact:true });
      const status = (copy) => page.locator('#account-status').getByText(copy);
      await page.goto(origin);
      await button('Play').waitFor();
      const original = await pilotFingerprint(page, true);
      await button('More').tap();
      assert.deepEqual(vendorRequests, []);

      await context.setOffline(true);
      await page.waitForFunction(() => !navigator.onLine);
      await button('Account').tap();
      await status('Reconnect to manage Google sign-in. Guest play is available offline.').waitFor();
      assert.deepEqual(vendorRequests, []);

      await context.setOffline(false);
      await page.waitForFunction(() => navigator.onLine);
      await button('Retry connection').tap();
      await status('Could not check Google sign-in. Try again or keep playing as a guest.').waitFor();
      await button('Retry connection').tap();
      const signIn = button('Sign in with Google');
      await signIn.waitFor();
      assert.deepEqual(vendorRequests, ['', '?retry=1']);
      assert.ok((await signIn.boundingBox()).height >= 44);
      if (name === 'Chromium') {
        await page.setViewportSize({ width:844, height:390 });
        const control = await signIn.boundingBox();
        const panel = await page.locator('.account-panel').boundingBox();
        assert.ok(control.height >= 44);
        assert.ok(control.x >= panel.x && control.x + control.width <= panel.x + panel.width);
        await page.setViewportSize(viewport);
      }

      await signIn.tap();
      await status('Could not reach Google. Check your connection and try again.').waitFor();
      assert.equal(await page.evaluate(() => sessionStorage.getItem('stellar.google-return')), null);

      await page.evaluate(() => sessionStorage.setItem('fixture-google-outcome', 'cancel'));
      await signIn.tap();
      await status('Sign-in was canceled. You can keep playing as a guest.').waitFor();
      assert.equal(await page.evaluate(() => sessionStorage.getItem('stellar.google-return')), null);

      await page.evaluate(() => sessionStorage.setItem('fixture-google-outcome', 'success'));
      await signIn.tap();
      await status('Signed in with Google.').waitFor();
      const beforeRefresh = vendorRequests.length;
      await page.reload();
      await button('More').tap();
      assert.equal(vendorRequests.length, beforeRefresh);
      await button('Account').tap();
      await status('Signed in with Google.').waitFor();
      await button('Sign out').tap();
      await status('Signed out. Your Arcade progress is still on this device.').waitFor();
      assert.deepEqual(await pilotFingerprint(page), original);

      await button('Back').tap();
      await button('Back').tap();
      await button('Play').tap();
      const callSign = page.getByRole('textbox', { name:'Pilot call sign' });
      const story = page.locator('[data-story] h1');
      const pause = page.locator('#pause');
      await callSign.or(story).or(pause).first().waitFor();
      if (await callSign.isVisible()) {
        await callSign.fill('REBEL-7');
        await button('Confirm & continue').tap();
        await story.waitFor();
      }
      if (await story.isVisible()) await button('Skip').tap();
      await pause.waitFor();
      assert.deepEqual(pageErrors, []);
    } finally { await browser.close(); }
  });
}
