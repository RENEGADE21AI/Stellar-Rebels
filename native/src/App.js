import React, { useEffect, useRef, useState } from 'react';
import { AppState, NativeModules, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { AndroidHaptics, ImpactFeedbackStyle, impactAsync, performAndroidHapticsAsync } from 'expo-haptics';
import { shareAsync } from 'expo-sharing';
import { unzipSync } from 'fflate';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Purchases from 'react-native-purchases';
import { WebView } from 'react-native-webview';
import { readBridgeRequest, sameFlightDocument } from './bridge.mjs';
import { createCommerce } from './commerce.mjs';

const pack = require('../generated/flight.zip');
const version = require('../generated/version.json');
const profileKey = 'stellar-rebels.profile.v1';
const commerce = createCommerce(Purchases, {
  platform: Platform.OS,
  nativeAvailable: Boolean(NativeModules.RNPurchases),
  config: Constants.expoConfig?.extra?.revenueCat
});
const impacts = {
  light: { ios: ImpactFeedbackStyle.Light, android: AndroidHaptics.Keyboard_Tap },
  medium: { ios: ImpactFeedbackStyle.Medium, android: AndroidHaptics.Context_Click },
  heavy: { ios: ImpactFeedbackStyle.Heavy, android: AndroidHaptics.Long_Press }
};

async function installFlight() {
  const flightIdentity = version.flightDigest ?? version.assetVersion;
  const directory = new Directory(Paths.cache, 'stellar-rebels', flightIdentity);
  const home = new File(directory, 'index.html');
  const stamp = new File(directory, 'installed');
  if (stamp.exists && await stamp.text() === flightIdentity &&
      version.files.every((name) => new File(directory, ...name.split('/')).exists)) return { home, directory };

  const asset = Asset.fromModule(pack);
  if (!asset.localUri) await asset.downloadAsync();
  if (!asset.localUri) throw Error('Bundled flight pack is unavailable');
  const entries = unzipSync(await new File(asset.localUri).bytes());
  if (!entries['index.html'] || !entries[`arcade/${version.assetVersion}/native-app.js`]) throw Error('Bundled flight pack is incomplete');
  directory.create({ idempotent: true, intermediates: true });
  for (const [name, bytes] of Object.entries(entries)) {
    if (!name.split('/').every((part) => /^[a-z0-9][a-z0-9._-]*$/i.test(part))) throw Error('Invalid flight asset path');
    const file = new File(directory, ...name.split('/'));
    file.create({ overwrite: true, intermediates: true });
    file.write(bytes);
  }
  stamp.create({ overwrite: true });
  stamp.write(flightIdentity);
  return { home, directory };
}

function Game() {
  const [flight, setFlight] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [reload, setReload] = useState(0);
  const browser = useRef(null);
  const session = useRef(null);
  const transactions = useRef(Promise.resolve());
  const lastFeedback = useRef(0);

  useEffect(() => {
    let active = true;
    installFlight().then((installed) => {
      if (active) setFlight(installed);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    const unsubscribe = commerce.subscribe((status) => {
      sendToFlight(`window.dispatchEvent(new CustomEvent('stellar-commerce-change', { detail: ${JSON.stringify(status)} }));`);
    });
    void commerce.refresh();
    const subscription = AppState.addEventListener('change', (next) => {
      const event = next === 'active' ? 'stellar-native-foreground' : 'stellar-native-pause';
      sendToFlight(`window.dispatchEvent(new Event('${event}'));`);
      if (next === 'active') void commerce.refresh();
    });
    const shade = Platform.OS === 'android' && AppState.addEventListener('blur', () => {
      sendToFlight("window.dispatchEvent(new Event('stellar-native-pause'));");
    });
    return () => { unsubscribe(); subscription.remove(); if (shade) shade.remove(); };
  }, [flight]);

  function sendToFlight(script, token = session.current) {
    if (!flight || !token || token !== session.current) return;
    browser.current?.injectJavaScript(
      `if (window.top === window && window.stellarNativeSession === ${JSON.stringify(token)}) { ${script} } true;`);
  }

  function activateFlight({ nativeEvent }) {
    if (!sameFlightDocument(nativeEvent.url, flight.home.uri)) return;
    const token = randomUUID();
    session.current = token;
    browser.current?.injectJavaScript(`(() => {
      const flightUrl = location.href.replace(/^file:\\/\\/\\/private\\/var\\//, 'file:///var/');
      if (window.top === window && flightUrl === ${JSON.stringify(flight.home.uri.replace('file:///private/var/', 'file:///var/'))}) {
        Object.defineProperty(window, 'stellarNativeSession', { value: ${JSON.stringify(token)}, configurable: true });
        window.stellarNativeReady?.(window.stellarNativeSession);
        window.dispatchEvent(new CustomEvent('stellar-commerce-change', { detail: ${JSON.stringify(commerce.status())} }));
      }
    })();
      true;
    `);
  }

  function receive({ nativeEvent }) {
    const token = session.current;
    const request = readBridgeRequest(nativeEvent, flight?.home.uri, token, Platform.OS);
    if (!request) return;

    const reply = (ok, value) => sendToFlight(
      `window.stellarNativeReply?.(${JSON.stringify({ id: request.id, client: request.client, ok, value })});`, token);
    if (request.op === 'commerce-status') {
      reply(true, commerce.status());
      void commerce.refresh();
      return;
    }
    if (request.op === 'authorize-stage') {
      void commerce.authorize(request.data).then((value) => reply(true, value), () => reply(false));
      return;
    }
    if (request.op === 'commerce-purchase' || request.op === 'commerce-restore') {
      if (AppState.currentState !== 'active') { reply(true, commerce.unavailable()); return; }
      const order = request.op === 'commerce-purchase' ? commerce.purchase() : commerce.restore();
      void order.then((value) => reply(true, value), () => reply(false));
      return;
    }
    if (request.op === 'haptic') {
      const strength = request.data;
      if (!Object.hasOwn(impacts, strength)) { reply(false); return; }
      const now = Date.now();
      if (AppState.currentState === 'active' && now - lastFeedback.current >= 125) {
        lastFeedback.current = now;
        const effect = impacts[strength];
        const feedback = Platform.OS === 'android' ? performAndroidHapticsAsync(effect.android) : impactAsync(effect.ios);
        void feedback.catch(() => {});
      }
      reply(true);
      return;
    }
    transactions.current = transactions.current.then(async () => {
      switch (request.op) {
        case 'load': {
          const saved = await AsyncStorage.getItem(profileKey);
          reply(true, saved ? JSON.parse(saved) : null);
          break;
        }
        case 'save': {
          await AsyncStorage.setItem(profileKey, JSON.stringify(request.data));
          reply(true);
          break;
        }
        case 'share': {
          const file = new File(Paths.cache, 'stellar-rebels-replay.json');
          file.create({ overwrite: true });
          file.write(JSON.stringify(request.data));
          await shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Share flight replay' });
          reply(true);
          break;
        }
        default: reply(false);
      }
    }).catch(() => reply(false));
  }

  if (!flight) return <View style={style.center}>
    <Text style={style.message}>{failed ? 'Flight assets could not be opened.' : 'Loading Stellar Rebels…'}</Text>
    {failed && <Pressable accessibilityRole="button" onPress={() => { setFailed(false); setAttempt((n) => n + 1); }}>
      <Text style={style.retry}>Try again</Text>
    </Pressable>}
  </View>;

  return <WebView
    key={reload}
    ref={browser}
    style={style.webview}
    source={{ uri: flight.home.uri }}
    originWhitelist={['*']}
    allowingReadAccessToURL={flight.directory.uri}
    allowFileAccess
    allowFileAccessFromFileURLs={false}
    allowUniversalAccessFromFileURLs={false}
    mixedContentMode="never"
    mediaCapturePermissionGrantType="deny"
    allowsInlineMediaPlayback
    mediaPlaybackRequiresUserAction={false}
    contentInsetAdjustmentBehavior="never"
    setSupportMultipleWindows={false}
    webviewDebuggingEnabled={false}
    onLoadStart={() => { session.current = null; }}
    onLoad={activateFlight}
    onMessage={receive}
    onContentProcessDidTerminate={() => { session.current = null; setReload((n) => n + 1); }}
    onRenderProcessGone={() => { session.current = null; setReload((n) => n + 1); }}
    onShouldStartLoadWithRequest={(request) => sameFlightDocument(request.url, flight.home.uri)}
  />;
}

export default function App() {
  return <SafeAreaProvider>
    <SafeAreaView style={style.webview}>
      <StatusBar hidden />
      <Game />
    </SafeAreaView>
  </SafeAreaProvider>;
}

const style = StyleSheet.create({
  webview: { flex: 1, backgroundColor: '#080f19' },
  center: { flex: 1, gap: 16, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#080f19' },
  message: { fontSize: 17, color: '#fff0db', textAlign: 'center' },
  retry: { minHeight: 44, padding: 10, fontWeight: '700', color: '#ff9a65' }
});
