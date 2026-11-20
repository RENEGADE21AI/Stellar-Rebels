import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
import { unzipSync } from 'fflate';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const pack = require('../generated/flight.zip');
const version = require('../generated/version.json');
const profileKey = 'stellar-rebels.profile.v1';
const maxProfileBytes = 512 * 1024;
const maxReplayBytes = 4_000_000;

function sameFlightDocument(url, expected) {
  if (typeof url !== 'string' || !url.startsWith('file:///') || !expected) return false;
  const sandboxPath = (uri) => uri.replace(/^file:\/\/\/private\/var\//, 'file:///var/');
  return sandboxPath(url) === sandboxPath(expected);
}

async function installFlight() {
  const directory = new Directory(Paths.cache, 'stellar-rebels', version.assetVersion);
  const home = new File(directory, 'index.html');
  const stamp = new File(directory, 'installed');
  if (stamp.exists && await stamp.text() === version.assetVersion &&
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
  stamp.write(version.assetVersion);
  return { home, directory };
}

function Game() {
  const [flight, setFlight] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [reload, setReload] = useState(0);
  const browser = useRef(null);
  const transactions = useRef(Promise.resolve());

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
    const subscription = AppState.addEventListener('change', (next) => {
      const event = next === 'active' ? 'stellar-native-foreground' : 'stellar-native-pause';
      browser.current?.injectJavaScript(`window.dispatchEvent(new Event('${event}')); true;`);
    });
    return () => subscription.remove();
  }, []);

  function receive({ nativeEvent }) {
    if (!flight || typeof nativeEvent.data !== 'string' || nativeEvent.data.length > maxReplayBytes) return;
    // Android's WebMessageListener reports an opaque origin for packaged file pages.
    const localOrigin = sameFlightDocument(nativeEvent.url, flight.home.uri) ||
      (Platform.OS === 'android' && nativeEvent.url === 'null');
    if (!localOrigin) return;
    let request;
    try { request = JSON.parse(nativeEvent.data); } catch { return; }
    if (!Number.isSafeInteger(request?.id) || request.id < 1 || !/^[a-f0-9]{32}$/.test(request.client) ||
        !sameFlightDocument(request.documentUrl, flight.home.uri)) return;

    const reply = (ok, value) => browser.current?.injectJavaScript(
      `window.stellarNativeReply?.(${JSON.stringify({ id: request.id, client: request.client, ok, value })}); true;`);
    transactions.current = transactions.current.then(async () => {
      switch (request.op) {
        case 'load': {
          const saved = await AsyncStorage.getItem(profileKey);
          reply(true, saved ? JSON.parse(saved) : null);
          break;
        }
        case 'save': {
          if (!request.data || !Number.isSafeInteger(request.data.schema) || nativeEvent.data.length > maxProfileBytes) throw Error('Invalid profile');
          await AsyncStorage.setItem(profileKey, JSON.stringify(request.data));
          reply(true);
          break;
        }
        case 'share': {
          if (!request.data || request.data.schema !== 1) throw Error('Invalid flight replay');
          const file = new File(Paths.cache, 'stellar-rebels-replay.json');
          file.create({ overwrite: true });
          file.write(JSON.stringify(request.data));
          await shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Share flight replay' });
          reply(true);
          break;
        }
        case 'archive':
          await Linking.openURL('https://star-strike-rush.web.app/');
          reply(true);
          break;
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
    onMessage={receive}
    onContentProcessDidTerminate={() => setReload((n) => n + 1)}
    onRenderProcessGone={() => setReload((n) => n + 1)}
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
