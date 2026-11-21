const assert = require('node:assert/strict');
const { test } = require('node:test');

const bridge = import('../native/src/bridge.mjs');
const { resolveConfig } = require('../native/app.config.js');
const app = require('../native/app.json').expo;

test('published rating links require each platform’s exact opt-in and stay off in Test Store builds', () => {
  const flags = (env) => resolveConfig(app, env).extra.storeRatings;
  assert.deepEqual(flags({}), { ios: false, android: false });
  assert.deepEqual(flags({ EXPO_PUBLIC_STELLAR_IOS_STORE_LIVE: '1' }), { ios: true, android: false });
  assert.deepEqual(flags({ EXPO_PUBLIC_STELLAR_ANDROID_STORE_LIVE: '1', EXPO_PUBLIC_STELLAR_IOS_STORE_LIVE: 'true' }),
    { ios: false, android: true });
  assert.deepEqual(flags({
    STELLAR_COMMERCE_VARIANT: 'internal-test-store', EXPO_PUBLIC_STELLAR_IOS_STORE_LIVE: '1',
    EXPO_PUBLIC_STELLAR_ANDROID_STORE_LIVE: '1'
  }), { ios: false, android: false });
});

test('only the activated packaged page can request ratings, and it cannot supply a destination', async () => {
  const { readBridgeRequest } = await bridge;
  const url = 'file:///var/mobile/cache/index.html';
  const session = '8a40feec-4991-46a7-95ef-165c64c83735';
  for (const op of ['rating-status', 'rate-app']) {
    const request = { op, id: 8, session, documentUrl: url, client: 'ab'.repeat(16) };
    const read = (message, origin = url, platform = 'ios') =>
      readBridgeRequest({ url: origin, data: JSON.stringify(message) }, url, session, platform);
    assert.deepEqual(read(request), request);
    assert.deepEqual(read(request, 'null', 'android'), request);
    assert.equal(read(request, 'https://stellar-rebels.web.app/'), null);
    assert.equal(read({ ...request, session: 'stale' }), null);
    assert.equal(read({ ...request, documentUrl: `${url}?open=external` }), null);
    assert.equal(read({ ...request, data: 'https://example.com/' }), null);
    assert.equal(read({ ...request, data: null }), null);
  }
});

test('rating opens only fixed store destinations while the app is in the foreground', async () => {
  const { openStoreRating, storeRatingAvailable } = await bridge;
  assert.equal(storeRatingAvailable('android', { ios: true }), false);
  assert.equal(storeRatingAvailable('web', { web: true }), false);
  assert.equal(storeRatingAvailable('android', { android: true }), true);
  let foreground = true;
  const attempts = [];
  const options = {
    available: true,
    isForeground: () => foreground,
    openURL: async (url) => { attempts.push(url); }
  };
  assert.deepEqual(await openStoreRating('web', options), { result: 'unavailable' });
  assert.deepEqual(await openStoreRating('ios', { ...options, available: false }), { result: 'unavailable' });
  foreground = false;
  assert.deepEqual(await openStoreRating('android', options), { result: 'unavailable' });
  assert.equal(attempts.length, 0);

  foreground = true;
  assert.deepEqual(await openStoreRating('ios', options), { result: 'opened' });
  assert.deepEqual(await openStoreRating('android', options), { result: 'opened' });
  assert.deepEqual(attempts, [
    'https://apps.apple.com/app/id6837596687?action=write-review',
    'market://details?id=com.renegade21ai.stellarrebels&showAllReviews=true'
  ]);
});

test('Android falls back to the Play web listing and handles backgrounding and link failure', async () => {
  const { openStoreRating } = await bridge;
  let foreground = true;
  const attempts = [];
  const options = {
    available: true,
    isForeground: () => foreground,
    openURL: async (url) => {
      attempts.push(url);
      if (url.startsWith('market:')) throw Error('Play Store app unavailable');
    }
  };
  assert.deepEqual(await openStoreRating('android', options), { result: 'opened' });
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1], 'https://play.google.com/store/apps/details?id=com.renegade21ai.stellarrebels&showAllReviews=true');

  const closedBeforeFallback = await openStoreRating('android', {
    ...options,
    openURL: async (url) => {
      attempts.push(url);
      foreground = false;
      throw Error('App left the foreground');
    }
  });
  assert.deepEqual(closedBeforeFallback, { result: 'unavailable' });
  assert.equal(attempts.length, 3);

  foreground = true;
  const alwaysFail = { ...options, openURL: async () => { throw Error('No supported activity'); } };
  assert.deepEqual(await openStoreRating('android', alwaysFail), { result: 'failed' });
  assert.deepEqual(await openStoreRating('ios', alwaysFail), { result: 'failed' });
});
