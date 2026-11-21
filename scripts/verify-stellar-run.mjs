import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import '../src/00-runtime.js';
import '../src/00-gameplay-rules.js';
import '../src/00-asset-manifest.js';
import { verifyReplay } from '../arcade/replay.mjs';

const commonModules = ['catalog', 'routes', 'seed', 'flight', 'bosses', 'boss-patterns', 'formations', 'cruiser', 'wraith', 'replay'];
const collisionModules = [...commonModules, 'collision', 'enemy-course', 'silhouettes'];
const sharedModules = ['src/00-runtime.js', 'src/00-gameplay-rules.js', 'src/00-asset-manifest.js'];
const snapshots = {
  'arcade-5': { commit: 'b34b16ab9ffa383c0fd7ee6d9614a3ea35588324', modules: commonModules },
  'arcade-6': {
    commit: 'aa2b02f489bdf025e5b7de78774dae2cf4f047dc',
    modules: collisionModules
  },
  'arcade-7': {
    commit: '5c358f0d3a57d6eda7c89337891120a6a2b6064c',
    modules: collisionModules
  },
  'arcade-8': {
    commit: '2fc36c248ff136c26d37a30d7afe8d375dfc3856',
    modules: collisionModules
  },
  'arcade-9': {
    commit: '77cf1303d979d21e6497616be8f83e6255ef002c',
    modules: collisionModules
  }
};

async function checkReplay(replay) {
  const rules = replay?.run?.rules;
  if (!Object.hasOwn(snapshots, rules)) return verifyReplay(replay);
  // Use the released simulation for old files. Restoring today's collision and
  // movement rules must never change the verdict for an earlier replay.
  const base = mkdtempSync(join(tmpdir(), 'stellar-verify-'));
  const snapshot = snapshots[rules];
  const directories = [];
  const written = [];
  try {
    for (const name of ['arcade', 'src']) {
      const directory = join(base, name);
      mkdirSync(directory);
      directories.push(directory);
    }
    const cwd = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
    const files = [...sharedModules, ...snapshot.modules.map((name) => `arcade/${name}.mjs`)];
    for (const path of files) {
      const file = join(base, path);
      const bytes = execFileSync('git', ['show', `${snapshot.commit}:${path}`], { cwd });
      writeFileSync(file, bytes);
      written.push(file);
    }
    for (const path of sharedModules) await import(pathToFileURL(join(base, path)).href);
    const archive = await import(pathToFileURL(join(base, 'arcade', 'replay.mjs')).href);
    return archive.verifyReplay(replay);
  } finally {
    for (const file of written) unlinkSync(file);
    for (const folder of directories) rmdirSync(folder);
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
