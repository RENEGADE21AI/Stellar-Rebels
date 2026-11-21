import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, Image, Linking, NativeModules, Platform, Pressable, StatusBar, StyleSheet, Text,
  useWindowDimensions, View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { AndroidHaptics, ImpactFeedbackStyle, impactAsync, performAndroidHapticsAsync } from 'expo-haptics';
import { unzipSync } from 'fflate';
import { initialWindowMetrics, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Purchases from 'react-native-purchases';
import { WebView } from 'react-native-webview';
import { openStoreRating, readBridgeRequest, sameFlightDocument, storeRatingAvailable } from './bridge.mjs';
import { createCommerce } from './commerce.mjs';
import { installFlightFiles } from './flight-install.mjs';

const pack = require('../generated/flight.zip');
const version = require('../generated/version.json');
const loadingArtwork = require('../generated/loading.jpg');
const loadingWordmark = require('../generated/loading-wordmark.png');
const profileKey = 'stellar-rebels.profile.v1';
const ratingAvailable = storeRatingAvailable(Platform.OS, Constants.expoConfig?.extra?.storeRatings);
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

async function loadFlightEntries() {
  const asset = Asset.fromModule(pack);
  if (!asset.localUri) await asset.downloadAsync();
  if (!asset.localUri) throw Error('Bundled flight pack is unavailable');
  return unzipSync(await new File(asset.localUri).bytes());
}

function FlightLoading({ failed, onRetry }) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wordmarkWidth = Math.min(window.width - insets.left - insets.right - 36, 365);

  return <View style={style.loading}>
    <Image source={loadingArtwork} style={style.loadingArtwork} resizeMode="cover" fadeDuration={0} accessible={false} />
    <Image source={loadingWordmark} style={[style.loadingWordmark, {
      top: Math.max(insets.top + 18, window.height * .09), width: wordmarkWidth, height: wordmarkWidth * .42
    }]} resizeMode="contain" fadeDuration={0} accessible={false} />
    <View style={[style.loadingStatus, { bottom: Math.max(insets.bottom + 16, window.height * .06) }]}>
      {!failed && <ActivityIndicator size="small" color="#a9edf6" accessible={false} />}
      <Text accessibilityLiveRegion="polite" style={style.message}>
        {failed ? 'Flight assets could not be opened.' : 'Preparing flight…'}
      </Text>
      {failed && <Pressable accessibilityRole="button" onPress={onRetry} style={style.retry}>
        <Text style={style.retryLabel}>Try again</Text>
      </Pressable>}
    </View>
  </View>;
}

function Game() {
  const { top, right, bottom, left } = useSafeAreaInsets();
  const setFlightInsets = `
    document.documentElement.style.setProperty('--native-safe-top', ${JSON.stringify(`${top}px`)});
    document.documentElement.style.setProperty('--native-safe-right', ${JSON.stringify(`${right}px`)});
    document.documentElement.style.setProperty('--native-safe-bottom', ${JSON.stringify(`${bottom}px`)});
    document.documentElement.style.setProperty('--native-safe-left', ${JSON.stringify(`${left}px`)});
  `;
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
    installFlightFiles({ Directory, File, cache: Paths.cache, version, loadEntries: loadFlightEntries }).then((installed) => {
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

  useEffect(() => { sendToFlight(setFlightInsets); }, [setFlightInsets]);

  function activateFlight({ nativeEvent }) {
    if (!sameFlightDocument(nativeEvent.url, flight.home.uri)) return;
    const token = randomUUID();
    session.current = token;
    browser.current?.injectJavaScript(`(() => {
      const flightUrl = location.href.replace(/^file:\\/\\/\\/private\\/var\\//, 'file:///var/');
      if (window.top === window && flightUrl === ${JSON.stringify(flight.home.uri.replace('file:///private/var/', 'file:///var/'))}) {
        ${setFlightInsets}
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
    if (request.op === 'rating-status') {
      reply(true, { available: ratingAvailable });
      return;
    }
    if (request.op === 'rate-app') {
      void openStoreRating(Platform.OS, {
        available: ratingAvailable,
        isForeground: () => AppState.currentState === 'active',
        openURL: (url) => Linking.openURL(url)
      }).then((value) => reply(true, value));
      return;
    }
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
        default: reply(false);
      }
    }).catch(() => reply(false));
  }

  if (!flight) return <FlightLoading failed={failed} onRetry={() => { setFailed(false); setAttempt((n) => n + 1); }} />;

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
    allowsLinkPreview={false}
    mediaPlaybackRequiresUserAction={false}
    automaticallyAdjustContentInsets={false}
    contentInsetAdjustmentBehavior="never"
    bounces={false}
    overScrollMode="never"
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
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <View style={style.webview}>
      <StatusBar hidden />
      <Game />
    </View>
  </SafeAreaProvider>;
}

const style = StyleSheet.create({
  webview: { flex: 1, backgroundColor: '#080f19' },
  loading: { flex: 1, alignItems: 'center', overflow: 'hidden', backgroundColor: '#080f19' },
  loadingArtwork: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  loadingWordmark: { position: 'absolute' },
  loadingStatus: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 10 },
  message: {
    fontSize: 17, color: '#fff0db', textAlign: 'center',
    textShadowColor: '#02050a', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5
  },
  retry: { minHeight: 44, minWidth: 96, padding: 10, alignItems: 'center', justifyContent: 'center' },
  retryLabel: { fontSize: 16, fontWeight: '700', color: '#ff9a65' }
});
