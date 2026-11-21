const assert = require('node:assert/strict');
const test = require('node:test');

const runtime = import('../native/src/flight-install.mjs');
const home = 'index.html';
const script = 'arcade/flight/native-app.js';
const image = 'arcade/flight/ships/fighter.webp';
const version = { assetVersion: 'flight', flightDigest: 'digest', files: [home, script, image] };
const base = 'cache/stellar-rebels/digest/';
const stamp = `${base}installed-v2`;
const entries = Object.fromEntries(version.files.map((name) => [name, new Uint8Array([9, 7])]));
const flush = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((pass, fail) => { resolve = pass; reject = fail; });
  return { promise, resolve, reject };
}

async function mock() {
  const { installFlightFiles } = await runtime;
  const stored = new Map();
  const folders = new Set(['cache']);
  const pending = new Map();
  let archiveLoads = 0;
  const uri = (first, parts) => [first.uri ?? first, ...parts].join('/');
  class Directory {
    constructor(first, ...parts) { this.uri = uri(first, parts); }
    create() { folders.add(this.uri); }
  }
  class File {
    constructor(first, ...parts) { this.uri = uri(first, parts); }
    get exists() { return stored.has(this.uri); }
    get size() { return stored.get(this.uri)?.length ?? 0; }
    async text() { return stored.get(this.uri); }
    delete() { stored.delete(this.uri); }
    async write(bytes) {
      assert.ok(folders.has(this.uri.slice(0, this.uri.lastIndexOf('/'))));
      const write = deferred();
      pending.set(this.uri, write);
      try { await write.promise; stored.set(this.uri, bytes); }
      finally { pending.delete(this.uri); }
    }
  }
  const install = () => installFlightFiles({ Directory, File, cache: 'cache', version, loadEntries: async () => {
    archiveLoads++;
    return entries;
  } });
  const finish = (name) => pending.get(base + name).resolve();
  return { install, stored, pending, finish, loads: () => archiveLoads };
}

test('flight cache ignores legacy stamps and returns only after every asset and the new stamp finish', async () => {
  const { install, stored, pending, finish, loads } = await mock();
  stored.set(`${base}installed`, 'digest');
  for (const name of version.files) stored.set(base + name, new Uint8Array(0));

  let mounted = false;
  const installResult = install().then((flight) => { mounted = true; return flight; });
  await flush();
  finish(script);
  finish(image);
  await flush();
  assert.equal(pending.has(stamp), false);
  assert.equal(mounted, false);
  finish(home);
  await flush();
  assert.equal(pending.has(stamp), true);
  assert.equal(mounted, false);
  assert.equal(stored.has(stamp), false);
  finish('installed-v2');
  assert.equal((await installResult).home.uri, base + home);
  assert.equal(stored.get(stamp), 'digest');
  assert.equal((await install()).home.uri, base + home);
  assert.equal(loads(), 1);
});

test('a failed batch drains in-flight writes before retry and treats zero-byte cache files as invalid', async () => {
  const { install, stored, pending, finish, loads } = await mock();
  stored.set(stamp, 'digest');
  for (const name of version.files) stored.set(base + name, name === script ? new Uint8Array(0) : entries[name]);
  const outcome = install().then(() => 'unexpected success', (error) => error.message);
  let completed = false;
  void outcome.then(() => { completed = true; });
  await flush();
  assert.equal(stored.has(stamp), false);
  pending.get(base + script).reject(new Error('disk full'));
  await flush();
  assert.equal(completed, false);
  finish(home);
  finish(image);
  assert.equal(await outcome, 'disk full');
  assert.equal(pending.size, 0);
  assert.equal(stored.has(stamp), false);

  const retry = install();
  await flush();
  for (const name of version.files) finish(name);
  await flush();
  finish('installed-v2');
  await retry;
  assert.equal(stored.get(base + script).length, 2);
  assert.equal(stored.get(stamp), 'digest');
  assert.equal(loads(), 2);
});
