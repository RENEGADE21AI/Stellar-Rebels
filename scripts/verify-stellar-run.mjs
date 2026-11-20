import { readFileSync, statSync } from 'node:fs';
import '../src/00-runtime.js';
import '../src/00-gameplay-rules.js';
import '../src/00-asset-manifest.js';
import { verifyReplay } from '../arcade/replay.mjs';

try {
  const [file] = process.argv.slice(2);
  if (!file) throw Error('Usage: node scripts/verify-stellar-run.mjs REPLAY.json');
  if (statSync(file).size > 4_000_000) throw Error('Replay file exceeds the 4 MB size limit');
  const started = performance.now();
  const result = verifyReplay(JSON.parse(readFileSync(file, 'utf8')));
  console.log(JSON.stringify({ ...result, verificationMs: Math.round(performance.now() - started) }, null, 2));
  process.exitCode = result.valid ? 0 : 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
