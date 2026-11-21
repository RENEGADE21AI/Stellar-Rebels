function publicKey(value, prefix) {
  return typeof value === 'string' && new RegExp(`^${prefix}[A-Za-z0-9]+$`).test(value) ? value : undefined;
}

function resolveConfig(config, env) {
  const testStore = env.STELLAR_COMMERCE_VARIANT === 'internal-test-store' &&
    (!env.EAS_BUILD_PROFILE || env.EAS_BUILD_PROFILE === 'internal-test-store') &&
    env.EAS_BUILD_PLATFORM !== 'ios';
  const revenueCat = testStore ? {
    mode: 'test-store',
    testKey: publicKey(env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY, 'test_'),
    testProductId: env.EXPO_PUBLIC_REVENUECAT_TEST_PRODUCT_ID
  } : {
    mode: 'platform',
    iosKey: publicKey(env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY, 'appl_'),
    androidKey: publicKey(env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY, 'goog_'),
    iosProductId: env.EXPO_PUBLIC_REVENUECAT_IOS_PRODUCT_ID,
    androidProductId: env.EXPO_PUBLIC_REVENUECAT_ANDROID_PRODUCT_ID
  };
  const storeRatings = {
    ios: !testStore && env.EXPO_PUBLIC_STELLAR_IOS_STORE_LIVE === '1',
    android: !testStore && env.EXPO_PUBLIC_STELLAR_ANDROID_STORE_LIVE === '1'
  };
  return {
    ...config,
    name: testStore ? 'Stellar Rebels Test Store' : config.name,
    android: { ...config.android, package: testStore ? `${config.android.package}.teststore` : config.android.package },
    plugins: [...config.plugins, ['./with-android-commerce', { testStore }]],
    extra: { ...config.extra, revenueCat, storeRatings }
  };
}

module.exports = ({ config }) => resolveConfig(config, process.env);
module.exports.resolveConfig = resolveConfig;
