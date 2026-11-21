const batchSize = 8;
const assetSegment = /^[a-z0-9][a-z0-9._-]*$/i;

export async function installFlightFiles({ Directory, File, cache, version, loadEntries }) {
  const identity = version.flightDigest ?? version.assetVersion;
  const directory = new Directory(cache, 'stellar-rebels', identity);
  const home = new File(directory, 'index.html');
  // Earlier builds could publish the previous stamp while asset writes were in flight.
  const stamp = new File(directory, 'installed-v2');
  const files = version.files.map((name) => {
    const parts = name.split('/');
    if (!parts.every((part) => assetSegment.test(part))) throw Error('Invalid flight asset path');
    return { name, parts };
  });
  if (stamp.size > 0 && await stamp.text() === identity &&
      files.every(({ parts }) => new File(directory, ...parts).size > 0)) return { home, directory };

  const entries = await loadEntries();
  const script = `arcade/${version.assetVersion}/native-app.js`;
  if (!version.files.includes('index.html') || !version.files.includes(script) ||
      Object.keys(entries).length !== files.length ||
      !files.every(({ name }) => entries[name]?.byteLength > 0)) throw Error('Bundled flight pack is incomplete');

  if (stamp.exists) stamp.delete();
  directory.create({ idempotent: true, intermediates: true });
  const folders = new Set(files.map(({ name }) => name.slice(0, name.lastIndexOf('/') + 1)));
  folders.delete('');
  for (const folder of folders) {
    new Directory(directory, ...folder.slice(0, -1).split('/')).create({ idempotent: true, intermediates: true });
  }
  for (let offset = 0; offset < files.length; offset += batchSize) {
    const batch = files.slice(offset, offset + batchSize);
    const writes = await Promise.allSettled(batch.map(async ({ name, parts }) => {
      await new File(directory, ...parts).write(entries[name]);
    }));
    // Drain the entire batch before a failed installation can be retried.
    const failure = writes.find((write) => write.status === 'rejected');
    if (failure) throw failure.reason;
  }
  await stamp.write(identity);
  return { home, directory };
}
