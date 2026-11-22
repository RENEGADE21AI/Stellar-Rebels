import { stageById } from './catalog.mjs';
import { UPGRADES, normalizeTiers, tierCost } from './progression.mjs';

const developmentHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const scenes = ['menu', 'story', 'launch', 'flight', 'paused', 'result'];
const outcomes = ['clear', 'defeat', 'abandoned'];

export function createPacingRecorder(location, clock = () => performance.now()) {
  if (!developmentHosts.has(location?.hostname) || !['http:', 'https:'].includes(location.protocol) ||
      new URLSearchParams(location.search).get('pacing') !== '1') return null;

  const sceneTimes = Object.fromEntries(scenes.map((key) => [key, 0]));
  const simulatedSeconds = Object.fromEntries(outcomes.map((key) => [key, 0]));
  const attempts = [];
  const purchases = [];
  const standardClearOrder = [];
  const sideClearOrder = [];
  const sideFlightSeconds = Object.fromEntries(outcomes.map((key) => [key, 0]));
  const seen = new Set();
  const priorOutcomes = new Map();
  let startedAt = null;
  let clearedAt = null;
  let finishedAt = null;
  let scene = 'menu';
  let enteredAt = null;
  let retries = 0;

  function start() {
    if (startedAt !== null) return;
    startedAt = clock();
    enteredAt = startedAt;
  }

  function setScene(next) {
    if (scene === next || !scenes.includes(next) || finishedAt !== null) return;
    if (enteredAt !== null) {
      const now = clock();
      sceneTimes[scene] += now - enteredAt;
      enteredAt = now;
    }
    scene = next;
  }

  function attempt(record, terminal) {
    if (!outcomes.includes(record?.status) || (record.id && seen.has(record.id)) || finishedAt !== null) return;
    start();
    if (record.id) seen.add(record.id);
    const { mode, variant = 'standard', status, ship, special } = record;
    const stage = stageById(record.stage, variant);
    const flightSeconds = terminal?.duration ?? record.duration ?? 0;
    const chapter = stage?.chapters?.findLast(([at]) => at <= flightSeconds)?.[1];
    const route = `${mode}/${variant}/${stage?.id ?? 'endless'}`;
    const previous = priorOutcomes.get(route);
    if (previous && previous !== 'clear') retries += 1;
    priorOutcomes.set(route, status);
    simulatedSeconds[status] += flightSeconds;
    if (stage?.side) sideFlightSeconds[status] += flightSeconds;
    attempts.push({ mode, variant, mission: stage?.number ?? null, operation: stage?.code ?? null, status, flightSeconds,
      phase: stage && flightSeconds >= stage.bossAt ? 'Final encounter' : chapter ?? null,
      cause: status === 'defeat' ? terminal?.damageCause ?? null : null,
      ship, special, tiers: normalizeTiers(record.tiers), salvage: record.award ?? 0, xp: record.xpAward ?? 0 });

    if (mode === 'arcade' && variant === 'standard' && status === 'clear') {
      if (stage && record.first) {
        if (stage.side) sideClearOrder.push(stage.code);
        else standardClearOrder.push(stage.number);
      }
      if (!stage?.side && record.campaignWon) clearedAt = clock();
    }
  }

  function purchase(key, beforeTier, pilot) {
    if (!Object.hasOwn(UPGRADES, key) || startedAt === null || finishedAt !== null) return;
    const tier = pilot.tiers[key];
    if (tier <= beforeTier) return;
    purchases.push({ track: key, tier, cost: tierCost(tier), balance: pilot.salvage,
      afterSeconds: (clock() - startedAt) / 1000 });
  }

  function complete() {
    if (clearedAt === null || finishedAt !== null) return;
    finishedAt = clock();
    sceneTimes[scene] += finishedAt - enteredAt;
  }

  return {
    start,
    scene: setScene,
    attempt,
    abandon(run, elapsedSeconds) { attempt({ ...run, duration: elapsedSeconds, status: 'abandoned' }); },
    purchase,
    complete,
    snapshot() {
      const now = finishedAt ?? clock();
      const durations = { ...sceneTimes };
      if (enteredAt !== null && finishedAt === null) durations[scene] += now - enteredAt;
      return structuredClone({
        completed: finishedAt !== null, totalSeconds: startedAt === null ? 0 : (now - startedAt) / 1000,
        campaignClearedSeconds: clearedAt === null ? null : (clearedAt - startedAt) / 1000,
        sceneSeconds: Object.fromEntries(Object.entries(durations).map(([key, ms]) => [key, ms / 1000])),
        simulatedSeconds, sideFlightSeconds, standardClearOrder, sideClearOrder, retries, attempts, purchases
      });
    }
  };
}
