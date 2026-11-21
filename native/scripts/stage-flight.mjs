import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { PNG } from 'pngjs';

const native = fileURLToPath(new URL('../', import.meta.url));
const repo = path.resolve(native, '..');
const web = path.resolve(process.argv[2] ?? path.join(repo, 'dist-stellar'));
const generated = path.join(native, 'generated');
const proof = path.join(generated, 'local-proof');
const utf8 = (value) => Buffer.from(value, 'utf8');
const read = (file) => fs.readFileSync(file, 'utf8');
const webVersion = JSON.parse(read(path.join(web, 'version.json')));
if (webVersion.dirty || webVersion.hostingSite !== 'stellar-rebels' || !/^[a-f0-9]{40}$/.test(webVersion.commitSha) ||
    !/^[a-f0-9]{15}$/.test(webVersion.assetVersion)) throw Error('Use a clean tested Stellar Rebels web artifact');
if (webVersion.googleSignIn !== false) throw Error('Build the offline source pack with Google sign-in disabled');
const generation = `arcade/${webVersion.assetVersion}`;
const source = path.join(web, generation);

function replaceRequired(text, from, to) {
  if (!text.includes(from)) throw Error(`Flight packaging template changed at ${from}`);
  return text.replace(from, to);
}

const pack = {};
function addAssets(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) addAssets(file);
    else if (entry.isFile() && !/\.mjs$/.test(file)) pack[`${generation}/${path.relative(source, file).split(path.sep).join('/')}`] = fs.readFileSync(file);
  }
}
addAssets(source);

const bridgeModule = path.join(native, 'src', 'pilot-store.mjs');
const built = await build({
  entryPoints: [path.join(source, 'app.mjs')], bundle: true, format: 'iife', minifyWhitespace: true, write: false,
  platform: 'browser', target: ['safari16.4', 'chrome115'], define: { 'import.meta.url': 'document.baseURI' },
  plugins: [{ name: 'stellar-native-host', setup(api) {
    api.onLoad({ filter: /[/\\]app\.mjs$/ }, (args) => {
      let body = `import { NativePilotStore, nativeRequest } from ${JSON.stringify(bridgeModule)};\n` + read(args.path);
      body = replaceRequired(body, 'new PilotStore(globalThis.indexedDB)', 'new NativePilotStore()');
      const start = body.indexOf("  if (type === 'save-replay') {");
      const end = body.indexOf("  if (type === 'update-web') {", start);
      if (start < 0 || end < 0) throw Error('Replay action was moved');
      body = body.slice(0, start) + "  if (type === 'save-replay') {\n    if (state.pending?.replay) await nativeRequest('share', state.pending.replay);\n    return;\n  }\n" + body.slice(end);
      body += `\nwindow.addEventListener('stellar-native-pause', () => { pause(true); audio.quiet(); });\n`;
      body += `window.addEventListener('stellar-native-foreground', () => { if (state.mode === 'menu') audio.play('hangar'); });\n`;
      body += `window.addEventListener('stellar-native-haptic', (event) => { void nativeRequest('haptic', event.detail).catch(() => {}); });\n`;
      return { contents: body, loader: 'js', resolveDir: source };
    });
  } }]
});
pack[`${generation}/native-app.js`] = built.outputFiles[0].contents;

let html = read(path.join(web, 'index.html'));
html = replaceRequired(html, '<html lang="en" data-pack="true">', '<html lang="en" data-pack="true" data-native-flight="true">');
html = replaceRequired(html, `<base href="/${generation}/">`, `<base href="./${generation}/">`);
html = replaceRequired(html, '<link rel="manifest" href="/site.webmanifest">',
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src file:; style-src file: 'unsafe-inline'; img-src file: data:; font-src file:; media-src file:; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'">`);
html = html.replaceAll(`src="/${generation}/shared/`, 'src="shared/');
html = replaceRequired(html, '<script type="module" src="app.mjs"></script>', '<script defer src="native-app.js"></script>');
pack['index.html'] = utf8(html);
const archive = zipSync(pack, { level: 6, mtime: new Date(2000, 0, 1) });
if (archive.length > 12 * 1024 * 1024) throw Error('Bundled flight assets exceed the 12 MiB ceiling');
const flightDigest = createHash('sha256').update(archive).digest('hex');
const version = { ...webVersion, flightDigest, files: Object.keys(pack).sort() };

fs.mkdirSync(generated, { recursive: true });
for (const [file, content] of Object.entries(pack)) {
  const target = path.join(proof, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}
fs.copyFileSync(path.join(repo, 'source-art/stellar/brand/png/icon-1024.png'), path.join(generated, 'icon.png'));
fs.copyFileSync(path.join(repo, 'source-art/stellar/brand/png/emblem-light.png'), path.join(generated, 'launch.png'));
fs.copyFileSync(path.join(source, 'media/brand/loading.jpg'), path.join(generated, 'loading.jpg'));
fs.copyFileSync(path.join(repo, 'source-art/stellar/brand/png/stacked-light.png'), path.join(generated, 'loading-wordmark.png'));
const emblem = PNG.sync.read(fs.readFileSync(path.join(generated, 'launch.png')));
const adaptive = new PNG({ width: 896, height: 896 });
PNG.bitblt(emblem, adaptive, 0, 0, emblem.width, emblem.height,
  Math.floor((adaptive.width - emblem.width) / 2), Math.floor((adaptive.height - emblem.height) / 2));
fs.writeFileSync(path.join(generated, 'adaptive.png'), PNG.sync.write(adaptive));
fs.writeFileSync(path.join(generated, 'version.json'), JSON.stringify(version, null, 2) + '\n');
fs.writeFileSync(path.join(generated, 'flight.zip'), archive);
console.log(`${webVersion.commitSha} / ${webVersion.assetVersion}: ${version.files.length} files, ${archive.length} bytes, app source staged.`);
