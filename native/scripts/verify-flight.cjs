const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { unzipSync } = require('fflate');
const { chromium, webkit } = require('playwright');

const generated = path.resolve(__dirname, '../generated');
const output = path.resolve(process.argv[2] ?? 'test-artifacts/native-flight');
const version = require('../generated/version.json');
const proof = path.join(generated, 'local-proof');
const entry = pathToFileURL(path.join(proof, 'index.html')).href;
const zip = fs.readFileSync(path.join(generated, 'flight.zip'));
const files = unzipSync(zip);

assert.equal(createHash('sha256').update(zip).digest('hex'), version.flightDigest);
assert.deepEqual(Object.keys(files).sort(), version.files);
for (const file of version.files) {
  assert.deepEqual(Buffer.from(files[file]), fs.readFileSync(path.join(proof, file)), file);
}
assert.deepEqual(
  fs.readFileSync(path.join(generated, 'loading-wordmark.png')),
  Buffer.from(files[`arcade/${version.assetVersion}/media/brand/title-wordmark.png`]),
  'The native loader and game must share the same wordmark'
);
assert.equal(version.dirty, false);
assert.equal(version.googleSignIn, false);
assert.equal(version.files.some((file) => /google-sign-in|google-auth-vendor/.test(file)), false);
assert.ok(zip.length < 12 * 1024 * 1024);

async function check(engine, viewport) {
  const browser = await engine.launch();
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  await context.route(/^https?:/, (route) => route.abort());
  const page = await context.newPage();
  const diagnostics = { webRequests: [], failedFiles: [], scriptErrors: [], bridge: new Set() };
  let saved;
  const clients = new Set();
  const haptics = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) diagnostics.webRequests.push(request.url());
  });
  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText.includes('ABORTED')) return;
    diagnostics.failedFiles.push([request.url(), request.failure()?.errorText]);
  });
  page.on('pageerror', (error) => diagnostics.scriptErrors.push(error.message));
  await page.exposeBinding('pilotHost', (_source, request) => {
    assert.equal(request.documentUrl, entry);
    assert.match(request.client, /^[a-f0-9]{32}$/);
    assert.equal(request.session, '6023022a-dc97-4359-817a-707926d7c001');
    clients.add(request.client);
    diagnostics.bridge.add(request.op);
    const reply = { id: request.id, client: request.client, ok: true };
    if (request.op === 'load') reply.value = saved;
    else if (request.op === 'save') saved = structuredClone(request.data);
    else if (request.op === 'haptic') haptics.push(request.data);
    else if (request.op === 'commerce-status') reply.value = { owned: false, price: null, available: false };
    else if (request.op === 'authorize-stage') reply.value = { allowed: request.data <= 3 };
    else if (request.op === 'rating-status') reply.value = { available: false };
    else throw Error(`Unexpected native request: ${request.op}`);
    return reply;
  });
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      window.stellarNativeSession = '6023022a-dc97-4359-817a-707926d7c001';
      window.stellarNativeReady?.();
    }, { once: true });
    window.ReactNativeWebView = {
      postMessage: (text) => {
        const request = JSON.parse(text);
        return window.pilotHost(request).then((reply) => {
          if (request.op === 'haptic') window.lastNativePulse = request.data;
          window.stellarNativeReply(reply);
        });
      }
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.src) window.lastStellarTrack = this;
      return play.call(this);
    };
  });

  try {
    await page.goto(entry);
    const settings = page.getByRole('button', { name: 'Settings', exact: true });
    await settings.tap();
    await page.getByText('Bundled flight assets ready.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Account', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Full Game Unlock', exact: true }).tap();
    await page.getByRole('heading', { name: 'Unlock the Full Game' }).waitFor();
    await page.getByText('The purchase price is unavailable right now.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Unlock Full Game' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Not Now', exact: true }).tap();
    const back = page.getByRole('button', { name: 'Back', exact: true });
    await page.getByRole('button', { name: 'Help & Legal', exact: true }).tap();
    await page.getByText('Rating becomes available when the store listing opens.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Rate the App' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Privacy Policy', exact: true }).tap();
    await page.getByRole('heading', { name: 'Privacy Policy', exact: true }).waitFor();
    await page.getByText('Replay sharing', { exact: true }).waitFor();
    await back.tap();
    await page.getByRole('button', { name: 'Terms of Use', exact: true }).tap();
    await page.getByRole('heading', { name: 'Terms of Use', exact: true }).waitFor();
    await page.getByText('Free play and the mobile unlock', { exact: true }).waitFor();
    await back.tap();
    await page.getByRole('button', { name: 'Support', exact: true }).tap();
    await page.getByText('renegade21ai@gmail.com', { exact: true }).waitFor();
    await back.tap();
    await back.tap();
    const contrast = page.getByRole('button', { name: 'High contrast hazards' });
    const vibration = page.getByRole('button', { name: 'Vibration', exact: true });
    assert.equal(await vibration.getAttribute('aria-pressed'), 'true');
    const desired = (await contrast.getAttribute('aria-pressed')) !== 'true';
    await contrast.tap();
    await page.waitForFunction((expected) => document.querySelector('[aria-label="High contrast hazards"]')?.getAttribute('aria-pressed') === String(expected), desired);
    assert.equal(saved.settings.contrast, desired);
    await page.reload();
    await settings.tap();
    assert.equal(await contrast.getAttribute('aria-pressed'), String(desired));
    assert.equal(clients.size, 2);
    await page.getByRole('button', { name: 'Back', exact: true }).tap();
    await page.getByRole('button', { name: 'Play', exact: true }).tap();
    await page.getByRole('button', { name: 'Skip training', exact: true }).tap();
    await page.locator('#training-actions').waitFor({ state: 'hidden' });
    await page.locator('#sky').waitFor();
    await page.waitForFunction(() => document.querySelector('#clock').textContent === '00:02', null, { timeout: 9000 });
    const special = page.getByRole('button', { name:'Ghost Shift', exact:true });
    await special.tap();
    await page.waitForFunction(() => window.lastNativePulse === 'light');
    assert.ok(haptics.includes('light'), 'A touch-activated Shift reaches the native haptic bridge');
    await page.waitForFunction(() => window.lastStellarTrack?.src.endsWith('/audio/gravitys-edge.mp3'), null, { timeout: 9000 });
    await page.waitForFunction(() => window.lastStellarTrack?.currentTime > .1 && !window.lastStellarTrack.paused);
    const track = await page.evaluate(() => ({ source: new URL(window.lastStellarTrack.src).protocol, ready: window.lastStellarTrack.readyState,
      audiblePlaybackStarted: window.lastStellarTrack.currentTime > .1 && !window.lastStellarTrack.paused }));
    assert.equal(track.source, 'file:');
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(450);
    await page.keyboard.up('ArrowLeft');
    await page.evaluate(() => window.dispatchEvent(new Event('stellar-native-pause')));
    await page.getByText('Flight paused while you were away.').waitFor();
    assert.equal(await page.evaluate(() => window.lastStellarTrack.paused), true);
    await page.getByRole('button', { name: 'Resume' }).tap();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.title(), 'Stellar Rebels');
    assert.equal(Object.values(saved.active).at(0)?.stage, 1);

    assert.deepEqual(diagnostics.webRequests, []);
    assert.deepEqual(diagnostics.failedFiles, []);
    assert.deepEqual(diagnostics.scriptErrors, []);
    assert.deepEqual([...diagnostics.bridge].sort(), ['commerce-status', 'haptic', 'load', 'rating-status', 'save']);
    await page.screenshot({ path: path.join(output, `${engine.name()}.png`) });
    return { engine: engine.name(), viewport, audio: track, helpPagesOpen: true, unpublishedRatingDisabled: true, settingsPersisted: true, interruptionPaused: true, hapticBridge: haptics, offlineRequests: 0 };
  } finally {
    await browser.close();
  }
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const checks = [];
  checks.push(await check(chromium, { width: 390, height: 844 }));
  checks.push(await check(webkit, { width: 320, height: 568 }));
  const result = { commit: version.commitSha, pack: version.assetVersion, assets: version.files.length, bytes: zip.length, checks };
  fs.writeFileSync(path.join(output, 'verified.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
