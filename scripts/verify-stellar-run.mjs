import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import '../src/00-runtime.js';
import '../src/00-gameplay-rules.js';
import '../src/00-asset-manifest.js';
import { verifyReplay } from '../arcade/replay.mjs';

const snapshots = { 'arcade-5': 'b34b16ab9ffa383c0fd7ee6d9614a3ea35588324' };
const archiveFiles = ['catalog', 'routes', 'seed', 'flight', 'bosses', 'boss-patterns', 'formations', 'cruiser', 'wraith', 'replay'];

async function checkReplay(replay) {
  const rules = replay?.run?.rules;
  if (!Object.hasOwn(snapshots, rules)) return verifyReplay(replay);
  // Use the released simulation for old files. Restoring today's collision and
  // movement rules must never change the verdict for an earlier replay.
  const base = mkdtempSync(join(tmpdir(), 'stellar-verify-'));
  const folder = join(base, 'arcade');
  const written = [];
  try {
    mkdirSync(folder);
    const cwd = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
    for (const name of archiveFiles) {
      const file = join(folder, name + '.mjs');
      const bytes = execFileSync('git', ['show', snapshots[rules] + ':arcade/' + name + '.mjs'], { cwd });
      writeFileSync(file, bytes);
      written.push(file);
    }
    const archive = await import(pathToFileURL(join(folder, 'replay.mjs')).href);
    return archive.verifyReplay(replay);
  } finally {
    for (const file of written) unlinkSync(file);
    rmdirSync(folder);
    rmdirSync(base);
  }
}

try {
  const [file] = process.argv.slice(2);
  if (!file) throw Error('Usage: node scripts/verify-stellar-run.mjs REPLAY.json');
  if (statSync(file).size > 4_000_000) throw Error('Replay file exceeds the 4 MB size limit');
  const started = performance.now();
  const result = await checkReplay(JSON.parse(readFileSync(file, 'utf8')));
  console.log(JSON.stringify({ ...result, verificationMs: Math.round(performance.now() - started) }, null, 2));
  process.exitCode = result.valid ? 0 : 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
