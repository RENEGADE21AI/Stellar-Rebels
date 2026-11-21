const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { spriteColliderDigests } = require('../arcade/silhouettes.mjs');
const helpPages = require('./stellar-help-pages.js');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'arcade');
const target = path.join(root, 'dist-stellar');
const release = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirty = Boolean(execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim());
const files = new Map();
const googleSignIn = process.env.STELLAR_ENABLE_GOOGLE_SIGN_IN === '1';
const lazyFiles = new Map();

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isFile()) return [full];
    if (entry.isDirectory()) return walk(full);
    throw new Error(`Unexpected artifact source ${full}`);
  });
}

for (const file of walk(source)) {
  const local = path.relative(source, file).split(path.sep).join('/');
  if (local === 'index.html') continue;
  if (local === 'media/brand/google-sign-in.png' && !googleSignIn) continue;
  if (!local.startsWith('media/') && !/^[a-z-]+\.(?:mjs|css)$/.test(local)) throw Error(`Unexpected runtime file: ${local}`);
  if (!/\.(mjs|css|jpg|png|webp|svg|woff2|txt)$/.test(local)) throw Error(`Unsupported build asset: ${local}`);
  files.set(local, /\.(mjs|css|svg|txt)$/.test(local) ? readText(file) : fs.readFileSync(file));
}
for (const [sprite, expected] of Object.entries(spriteColliderDigests)) {
  const art = files.get(`media/sprites/${sprite}.png`);
  if (!art || crypto.createHash('sha256').update(art).digest('hex') !== expected) {
    throw Error(`Collision geometry is stale for ${sprite}. Run scripts/prepare-stellar-colliders.py and check its overlay.`);
  }
}
const shared = ['00-runtime.js', '00-input-actions.js', '00-gameplay-rules.js', '00-asset-manifest.js'];
for (const name of shared) files.set(`shared/${name}`, readText(path.join(root, 'src', name)));
const audio = ['hangar-bay-seven.mp3', 'gravitys-edge.mp3'];
for (const name of audio) files.set(`audio/${name}`, fs.readFileSync(path.join(root, 'assets', 'audio', name)));
if (googleSignIn) {
  const bundle = require('esbuild').buildSync({
    entryPoints: [path.join(__dirname, 'stellar-google-auth.mjs')],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: ['es2020'],
    minify: true,
    legalComments: 'inline',
    write: false
  });
  lazyFiles.set('google-auth-vendor.mjs', bundle.outputFiles[0].contents);
}
const packAttributes = googleSignIn ? ' data-pack="true" data-google-sign-in="true"' : ' data-pack="true"';
const template = readText(path.join(source, 'index.html')).replace('<html lang="en">', `<html lang="en"${packAttributes}>`);
const workerTemplate = readText(path.join(__dirname, 'stellar-worker.template.js'));
const hash = crypto.createHash('sha256').update(template).update(workerTemplate);
for (const [name, body] of files) hash.update(name).update(body);
for (const [name, body] of lazyFiles) hash.update(name).update(body);
for (const [name, body] of helpPages) hash.update(name).update(body);
const fingerprint = hash.digest('hex');
const version = fingerprint.slice(0, 15);
const base = `/arcade/${version}/`;

function emit(url, content) {
  const file = path.resolve(target, '.' + url);
  if (!file.startsWith(target + path.sep)) throw Error(`Unexpected artifact path ${file}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

if (path.relative(root, target) !== 'dist-stellar') throw Error('Refusing to replace unrelated files');
fs.rmSync(target, { recursive: true, force: true });
for (const [name, body] of files) emit(base + name, body);
for (const [name, body] of lazyFiles) emit(base + name, body);
for (const [name, body] of helpPages) emit(name, body);

const html = template.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <base href="${base}">\n  <link rel="manifest" href="/site.webmanifest">`)
  .replace(/src="\/src\/(00-[\w-]+\.js)"/g, (_, name) => `src="${base}shared/${name}"`);
emit('/index.html', html);
emit('/site.webmanifest', JSON.stringify({
  id: '/', name: 'Stellar Rebels', short_name: 'Stellar Rebels', description: 'Portrait arcade spaceship combat',
  start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait', background_color: '#080f19', theme_color: '#080f19',
  icons: [192, 512].map((size) => ({ src: `${base}media/brand/icon-${size}.png`, type: 'image/png', sizes: `${size}x${size}`, purpose: 'any maskable' }))
}, null, 2) + '\n');
emit('/offline.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#080f19"><title>Stellar Rebels</title><style>html{color-scheme:dark;background:#080f19;color:#fff0db;font-family:system-ui}main{width:min(88vw,420px);margin:20vh auto;line-height:1.5}a{display:inline-block;padding:12px 21px;background:#ff8b57;color:#161719;font-weight:700}</style></head><body><main><h1>Flight pack missing</h1><p>Reconnect and reload to download Stellar Rebels. Your device save is stored separately.</p><a href="/">Reload</a></main></body></html>`);
const pack = ['/index.html', '/site.webmanifest', '/offline.html', ...[...files.keys()].map((name) => base + name)];
emit('/sw.js', workerTemplate.replace('__VERSION__', version).replace('__PACK__', JSON.stringify(pack)));
const bytes = pack.reduce((size, url) => size + fs.statSync(path.join(target, url.slice(1))).size, 0);
emit('/version.json', JSON.stringify({ commitSha: release, assetVersion: version, fingerprint, dirty, packBytes: bytes, googleSignIn, title: 'Stellar Rebels', hostingSite: 'stellar-rebels' }, null, 2) + '\n');
console.log(`Local Stellar Rebels web artifact ${version}, ${pack.length} cached files, ${(bytes / 1048576).toFixed(2)} MiB${dirty ? ', working changes included' : ''}.`);
