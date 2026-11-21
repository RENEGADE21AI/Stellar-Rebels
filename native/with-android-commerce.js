const { AndroidConfig, withAndroidManifest, withAppBuildGradle, withMainApplication } = require('expo/config-plugins');

function replaceTemplate(contents, original, replacement) {
  if (!contents.includes(original)) throw Error(`The Expo Android template changed at ${original}`);
  return contents.replace(original, replacement);
}

module.exports = function withAndroidCommerce(config, { testStore }) {
  config = withAndroidManifest(config, (mod) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    activity.$['android:launchMode'] = 'singleTop';
    return mod;
  });
  if (!testStore) return config;

  // Test Store requires a debuggable native APK. Bundle JS and disable Metro
  // support so this isolated debug build is installable and can start offline.
  config = withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = replaceTemplate(mod.modResults.contents, '    bundleCommand = "export:embed"',
      '    bundleCommand = "export:embed"\n    debuggableVariants = []');
    return mod;
  });
  return withMainApplication(config, (mod) => {
    mod.modResults.contents = replaceTemplate(mod.modResults.contents, '      context = applicationContext,',
      '      context = applicationContext,\n      useDevSupport = false,');
    return mod;
  });
};
