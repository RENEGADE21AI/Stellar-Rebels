const assert = require('node:assert/strict');
const { test } = require('node:test');

const adapter = import('../native/src/commerce.mjs');
const expoConfig = require('../native/app.config.js');
const app = require('../native/app.json').expo;
const eas = require('../native/eas.json');
const productId = 'stellar_rebels_full_arcade';
const iosKey = 'appl_examplePublicIosKey';
const testKey = 'test_examplePublicTestKey';
const codes = {
  PURCHASE_CANCELLED_ERROR: '1',
  PURCHASE_NOT_ALLOWED_ERROR: '3',
  PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: '5',
  PRODUCT_ALREADY_PURCHASED_ERROR: '6',
  NETWORK_ERROR: '10',
  INVALID_CREDENTIALS_ERROR: '11',
  PAYMENT_PENDING_ERROR: '20'
};

function customerInfo(changes = {}, timestamp = '2026-11-01T12:00:00Z') {
  const entitlement = {
    isActive: true,
    expirationDate: null,
    productIdentifier: productId,
    store: 'APP_STORE',
    verification: 'VERIFIED',
    ...changes
  };
  return {
    requestDate: timestamp,
    entitlements: {
      verification: 'VERIFIED',
      active: entitlement.isActive ? { full_arcade: entitlement } : {},
      all: { full_arcade: entitlement }
    }
  };
}

function offering(changes = {}) {
  return {
    current: {
      availablePackages: [{
        product: {
          identifier: productId,
          productCategory: 'NON_SUBSCRIPTION',
          productType: 'NON_CONSUMABLE',
          subscriptionPeriod: null,
          priceString: '2,99 €',
          ...changes
        }
      }]
    }
  };
}

async function setup(overrides = {}, config = { mode: 'platform', iosKey }, platform = 'ios') {
  const { createCommerce } = await adapter;
  const changes = [];
  let listener;
  const sdk = {
    ENTITLEMENT_VERIFICATION_MODE: { INFORMATIONAL: 'INFORMATIONAL' },
    VERIFICATION_RESULT: { VERIFIED: 'VERIFIED', VERIFIED_ON_DEVICE: 'VERIFIED_ON_DEVICE' },
    PURCHASES_ERROR_CODE: codes,
    PRODUCT_CATEGORY: { NON_SUBSCRIPTION: 'NON_SUBSCRIPTION' },
    configure: (options) => { sdk.options = options; },
    isConfigured: async () => true,
    addCustomerInfoUpdateListener: (callback) => { listener = callback; },
    removeCustomerInfoUpdateListener: (callback) => { if (listener === callback) listener = null; },
    getCustomerInfo: async () => customerInfo({ isActive: false }),
    getOfferings: async () => offering(),
    canMakePayments: async () => true,
    purchasePackage: async () => ({ customerInfo: customerInfo(), productIdentifier: productId }),
    restorePurchases: async () => customerInfo(),
    ...overrides
  };
  const commerce = createCommerce(sdk, { platform, config, nativeAvailable: true });
  const unsubscribe = commerce.subscribe((status) => changes.push(status));
  return { commerce, sdk, changes, unsubscribe, emit: (info) => listener?.(info) };
}

test('Expo config isolates the Android-only Test Store APK from all store profiles', () => {
  const env = {
    EXPO_PUBLIC_REVENUECAT_TEST_API_KEY: testKey,
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: iosKey,
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: 'goog_examplePublicGoogleKey'
  };
  const production = expoConfig.resolveConfig(app, { ...env, EAS_BUILD_PROFILE: 'production' });
  const validation = expoConfig.resolveConfig(app, { ...env, EAS_BUILD_PROFILE: 'validation' });
  const testEnv = { ...env, ...eas.build['internal-test-store'].android.env };
  const internal = expoConfig.resolveConfig(app, { ...testEnv, EAS_BUILD_PROFILE: 'internal-test-store', EAS_BUILD_PLATFORM: 'android' });
  assert.equal(production.android.package, app.android.package);
  assert.equal(validation.android.package, app.android.package);
  assert.equal(internal.android.package, app.android.package + '.teststore');
  assert.equal(internal.ios.bundleIdentifier, app.ios.bundleIdentifier);
  assert.equal(production.extra.revenueCat.mode, 'platform');
  assert.equal(production.extra.revenueCat.iosKey, iosKey);
  assert.equal(JSON.stringify(production).includes(testKey), false);
  assert.equal(internal.extra.revenueCat.testKey, testKey);
  assert.equal(internal.extra.revenueCat.iosKey, undefined);
  assert.equal(expoConfig.resolveConfig(app, testEnv).android.package, internal.android.package);
  assert.equal(expoConfig.resolveConfig(app, { ...testEnv, EAS_BUILD_PROFILE: 'production' }).android.package, app.android.package);
  assert.equal(expoConfig.resolveConfig(app, { ...testEnv, EAS_BUILD_PLATFORM: 'ios' }).android.package, app.android.package);
  assert.equal(eas.build['internal-test-store'].distribution, 'internal');
  assert.equal(eas.build['internal-test-store'].android.gradleCommand, ':app:assembleDebug');
  assert.equal(eas.build['internal-test-store'].android.withoutCredentials, true);
});

test('only app-specific public platform keys or the isolated Android test key can configure the SDK', async () => {
  const { resolveCommerceConfig } = await adapter;
  assert.equal(resolveCommerceConfig('ios', { mode: 'platform', iosKey })?.apiKey, iosKey);
  assert.equal(resolveCommerceConfig('android', { mode: 'platform', androidKey: 'goog_examplePublicGoogleKey' })?.store, 'PLAY_STORE');
  for (const key of [undefined, testKey, 'sk_privilegedSecret', 'goog_wrongPlatform']) {
    assert.equal(resolveCommerceConfig('ios', { mode: 'platform', iosKey: key }), null);
  }
  assert.equal(resolveCommerceConfig('ios', { mode: 'test-store', testKey }), null);
  assert.equal(resolveCommerceConfig('android', { mode: 'test-store', testKey })?.store, 'TEST_STORE');
  const { commerce, sdk } = await setup({}, { mode: 'platform', iosKey: testKey });
  await commerce.refresh();
  assert.equal(sdk.options, undefined);
  assert.deepEqual(await commerce.authorize(1), { allowed: true });
  for (const stage of [4, 5, 6, 0, 7, '3', 3.5]) assert.deepEqual(await commerce.authorize(stage), { allowed: false });
});

test('initial offering provides only the matching non-subscription store price', async () => {
  const { commerce, sdk } = await setup();
  await commerce.refresh();
  assert.equal(sdk.options.appUserID, undefined);
  assert.equal(sdk.options.automaticDeviceIdentifierCollectionEnabled, false);
  assert.equal(sdk.options.entitlementVerificationMode, 'INFORMATIONAL');
  assert.equal(commerce.status().price, '2,99 €');
  assert.equal(commerce.status().available, true);
  for (const invalid of [
    { identifier: 'another-product' }, { subscriptionPeriod: 'P1M' },
    { productCategory: 'SUBSCRIPTION' }, { priceString: ' ' }, { productType: 'CONSUMABLE' }
  ]) {
    sdk.getOfferings = async () => offering(invalid);
    await commerce.refresh();
    assert.equal(commerce.status().price, null);
    assert.equal((await commerce.purchase()).result, 'unavailable');
  }
  assert.equal(commerce.status().restoreAvailable, true);
});

test('RevenueCat Android maps every one-time SDK product to CONSUMABLE, even on Test Store', async () => {
  for (const [config, store] of [
    [{ mode: 'test-store', testKey }, 'TEST_STORE'],
    [{ mode: 'platform', androidKey: 'goog_examplePublicGoogleKey' }, 'PLAY_STORE']
  ]) {
    const { commerce } = await setup({
      getOfferings: async () => offering({ productType: 'CONSUMABLE' }),
      purchasePackage: async () => ({ customerInfo: customerInfo({ store }), productIdentifier: productId })
    }, config, 'android');
    await commerce.refresh();
    assert.equal(commerce.status().price, '2,99 €');
    assert.equal((await commerce.purchase()).result, 'purchased');
    assert.equal((await commerce.authorize(4)).allowed, true);
  }
});

test('purchase, restart offline, and confirmed revocation use verified SDK CustomerInfo', async () => {
  const { commerce, changes, emit, sdk } = await setup();
  await commerce.refresh();
  for (const stage of [1, 2, 3]) assert.deepEqual(await commerce.authorize(stage), { allowed: true });
  assert.deepEqual(await commerce.authorize(4), { allowed: false });
  assert.equal((await commerce.purchase()).result, 'purchased');
  assert.equal(commerce.status().owned, true);
  assert.ok(changes.some((status) => status.busy));
  assert.equal((await commerce.authorize(6)).allowed, true);
  sdk.getCustomerInfo = async () => { throw Error('offline'); };
  await commerce.refresh();
  assert.equal((await commerce.authorize(5)).allowed, true);
  const restarted = await setup({
    getCustomerInfo: async () => customerInfo(),
    getOfferings: async () => { throw Error('offline'); }
  });
  await restarted.commerce.refresh();
  assert.equal(restarted.commerce.status().owned, true);
  assert.equal(restarted.commerce.status().available, false);
  emit(customerInfo({ isActive: false }, '2026-11-03T12:00:00Z'));
  emit(customerInfo());
  assert.equal((await commerce.authorize(4)).allowed, false);
  assert.ok(changes.every((status, index) => index === 0 || status.revision > changes[index - 1].revision));
});

test('wrong store, wrong product, non-permanent and failed verification never unlock stages', async () => {
  for (const changes of [
    { store: 'PLAY_STORE' }, { store: 'TEST_STORE' }, { productIdentifier: 'another-product' },
    { expirationDate: '2026-11-08T12:00:00Z' }, { verification: 'FAILED' }, { verification: 'NOT_REQUESTED' }
  ]) {
    const { commerce } = await setup({ getCustomerInfo: async () => customerInfo(changes) });
    await commerce.refresh();
    assert.equal((await commerce.authorize(4)).allowed, false);
  }
});

test('cancel, failure, outage, pending and later confirmation have distinct results', async () => {
  const { commerce, sdk, emit } = await setup();
  await commerce.refresh();
  for (const [code, result] of [
    [codes.PURCHASE_CANCELLED_ERROR, 'cancelled'], ['unknown', 'failed'], [codes.NETWORK_ERROR, 'unavailable'],
    [codes.PAYMENT_PENDING_ERROR, 'pending']
  ]) {
    sdk.purchasePackage = async () => { throw { code }; };
    assert.equal((await commerce.purchase()).result, result);
    assert.equal((await commerce.authorize(4)).allowed, false);
  }
  assert.equal(commerce.status().pending, true);
  assert.equal((await commerce.purchase()).result, 'pending');
  emit(customerInfo({}, '2026-11-03T12:00:00Z'));
  assert.equal(commerce.status().pending, false);
  assert.equal((await commerce.authorize(4)).allowed, true);
});

test('restore is independent of offerings and uses store confirmation on a fresh install', async () => {
  const { commerce, sdk, unsubscribe, emit } = await setup({
    getOfferings: async () => ({ current: null }),
    restorePurchases: async () => customerInfo({ isActive: false })
  });
  await commerce.refresh();
  assert.equal((await commerce.restore()).result, 'nothing');
  sdk.restorePurchases = async () => customerInfo({}, '2026-11-02T12:00:00Z');
  assert.equal((await commerce.restore()).result, 'restored');
  unsubscribe();
  emit(customerInfo({ isActive: false }, '2026-11-03T12:00:00Z'));
  assert.equal(commerce.status().owned, true);
});

test('bridge accepts only the activated packaged document, capability and numeric stage', async () => {
  const { readBridgeRequest } = await import('../native/src/bridge.mjs');
  const home = 'file:///var/mobile/cache/index.html';
  const origin = 'file:///private/var/mobile/cache/index.html';
  const session = '6023022a-dc97-4359-817a-707926d7c001';
  const request = { documentUrl: home, session, client: 'ab'.repeat(16), id: 1, op: 'authorize-stage', data: 4 };
  const decode = (url = origin, data = request, platform = 'ios', token = session) =>
    readBridgeRequest({ url, data: JSON.stringify(data) }, home, token, platform);
  assert.deepEqual(decode(), request);
  assert.deepEqual(decode('null', request, 'android'), request);
  assert.equal(decode('null'), null);
  assert.equal(decode('https://stellar-rebels.web.app/'), null);
  assert.equal(decode(origin, request, 'ios', null), null);
  assert.equal(decode(origin, { ...request, session: 'wrong' }), null);
  assert.equal(decode(origin, { ...request, documentUrl: home + '?paid=true' }), null);
  assert.equal(decode(origin, { ...request, data: '4' }), null);
  assert.equal(decode(origin, { ...request, op: 'set-entitlement' }), null);
  assert.equal(decode(origin, { ...request, op: 'commerce-purchase', data: productId }), null);
});
