const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = Promise.all([import('../arcade/pilot.mjs'), import('../arcade/catalog.mjs')]);
const aClear = { status: 'clear', duration: 210, score: 26_000, kills: 78, breaks: 4, movement: 1800 };

function clearMission(api, pilot, id, variant = 'standard') {
  const run = api.beginRun(pilot, `${variant}-${id}-${Object.keys(pilot.receipts).length}`, 'arcade', id,
    1_720_000_000_000, '1234567890abcdef1234567890abcdef', variant);
  assert.ok(run);
  return api.settleRun(pilot, run.id, aClear);
}

test('all 60 finite purchases are bounded by consecutive standard clears and retain their stated benefits', async () => {
  const [api, { STAGES, UPGRADES, weaponStats }] = await load;
  const pilot = api.newPilot();
  pilot.salvage = 5000;
  pilot.lifetimeXp = 50_000;
  const tracks = Object.keys(UPGRADES);
  assert.deepEqual(tracks, ['damage', 'rate', 'thrusters', 'energy']);
  assert.deepEqual(weaponStats(pilot.tiers), { damage: 1, rate: 1, speed: 1, recharge: 1, hull: 0 });
  for (let index = 0; index < 15; index++) {
    const stage = STAGES[index];
    assert.equal(api.nextMission(pilot).id, stage.id);
    for (const track of tracks) {
      const status = api.upgradeStatus(pilot, track);
      assert.equal(status.limit, index + 1);
      assert.equal(status.tier, index);
      const before = pilot.salvage;
      assert.ok(api.install(pilot, track));
      assert.equal(before - pilot.salvage, status.nextCost);
      assert.equal(api.install(pilot, track), false);
    }
    clearMission(api, pilot, stage.id);
  }
  assert.deepEqual(pilot.tiers, { damage: 15, rate: 15, thrusters: 15, energy: 15 });
  assert.deepEqual(weaponStats(pilot.tiers), { damage: 1.25, rate: 1.15, speed: 1.12, recharge: 1.2, hull: 0 });
  assert.equal(api.nextMission(pilot), null);
  assert.equal(api.install(pilot, 'hull'), false);
});

test('postgame unlocks on the fifteenth standard clear and Veteran results stay separate', async () => {
  const [api, { STAGES }] = await load;
  const pilot = api.newPilot();
  assert.equal(api.hasEndless(pilot), false);
  assert.equal(api.hasVeteran(pilot), false);
  assert.equal(api.beginRun(pilot, 'too-early', 'endless'), null);
  for (const stage of STAGES.slice(0, -1)) clearMission(api, pilot, stage.id);
  assert.equal(api.hasEndless(pilot), false);
  const ending = clearMission(api, pilot, STAGES.at(-1).id);
  assert.equal(ending.campaignWon, true);
  assert.equal(api.hasEndless(pilot), true);
  assert.equal(api.hasVeteran(pilot), true);
  assert.ok(api.beginRun(pilot, 'endless', 'endless'));
  const first = STAGES[0].id;
  const veteran = clearMission(api, pilot, first, 'veteran');
  assert.equal(veteran.variant, 'veteran');
  assert.equal(pilot.clears[first], 1);
  assert.equal(pilot.veteranClears[first], 1);
  assert.equal(pilot.records.arcade[first].variant, 'standard');
  assert.equal(pilot.records.veteran[first].variant, 'veteran');
  assert.equal(api.nextMission(pilot, 'veteran').id, STAGES[1].id);
});

test('legacy migration is idempotent and preserves real progress without filling new mission gaps', async () => {
  const [api, { STAGES }] = await load;
  const oldRecord = { stage: 5, score: 18_920, duration: 151, rules: 'arcade-11', ship: 'bastion', special: 'ion', status: 'clear' };
  const oldEndless = { score: 17_000, duration: 404, rules: 'arcade-11', status: 'defeat' };
  const legacy = { schema: 1, callSign: 'ORBIT-7', salvage: 19, clears: { 1: 1, 2: 2, 4: 1, 5: 1, 6: 1 },
    mastery: { 5: true, wraith: true }, equipment: ['rails', 'chamber', 'cells', 'hull'], ship: 'bastion', special: 'ion',
    records: { arcade: { 5: oldRecord }, endless: oldEndless, loadouts: { 'arcade-11/5/bastion/ion/stock': oldRecord } },
    settings: { music: false, specialSize: 71 }, receipts: { settledBeforeUpgrade: { award: 62 } } };
  const pilot = api.migratePilot(legacy);
  assert.equal(pilot.schema, 2);
  assert.equal(pilot.callSign, 'ORBIT-7');
  assert.equal(pilot.salvage, 114);
  assert.deepEqual(pilot.tiers, { damage: 12, rate: 9, thrusters: 0, energy: 0 });
  assert.equal(pilot.settings.music, false);
  assert.equal(pilot.settings.specialSize, 71);
  assert.equal(pilot.settings.skipStory, false);
  assert.ok(api.hasShip(pilot, 'bastion'));
  assert.ok(api.hasSpecial(pilot, 'ion'));
  assert.deepEqual(pilot.clears, { 1: 1, 2: 2, 4: 1, 5: 1 });
  assert.deepEqual(pilot.legacy.clears, legacy.clears);
  assert.equal(api.nextMission(pilot).id, STAGES[1].id);
  assert.equal(api.hasStage(pilot, 5), true, 'previous clears can still be replayed');
  assert.equal(api.campaignComplete(pilot), false);
  assert.equal(api.hasVeteran(pilot), false);
  assert.equal(api.hasEndless(pilot), true);
  assert.deepEqual(pilot.legacy.mastery, legacy.mastery);
  assert.equal(pilot.records.history['arcade-11/5'].score, oldRecord.score);
  assert.equal(pilot.records.history['arcade-11/endless'].duration, oldEndless.duration);
  assert.deepEqual(pilot.records.loadouts, legacy.records.loadouts);
  assert.deepEqual(pilot.receipts, legacy.receipts);
  assert.deepEqual(api.migratePilot(structuredClone(pilot)), pilot);
  assert.equal(legacy.salvage, 19, 'migration leaves the persisted input intact until it commits');
});

test('native reopen after a lost migration acknowledgement preserves an atomic one-time refund', async (t) => {
  globalThis.location = new URL('file:///stellar-rebels/index.html');
  globalThis.stellarNativeSession = 'fixture';
  let saved = { schema:1, callSign:'RAVEN-4', salvage:19, equipment:['hull'], records:{ arcade:{} } };
  let loseReply = true;
  globalThis.ReactNativeWebView = { postMessage(message) {
    const { id, client, op, data } = JSON.parse(message);
    const ok = op === 'load' || !loseReply;
    if (op === 'save') {
      saved = structuredClone(data);
      loseReply = false;
    }
    queueMicrotask(() => globalThis.stellarNativeReply({ id, client, ok, value: op === 'load' ? structuredClone(saved) : undefined }));
  } };
  t.after(() => {
    for (const name of ['location', 'stellarNativeSession', 'ReactNativeWebView', 'stellarNativeReply', 'stellarNativeReady', 'stellarCommerce']) delete globalThis[name];
  });

  const { NativePilotStore } = await import('../native/src/pilot-store.mjs');
  await assert.rejects(new NativePilotStore().open(), /Device storage is unavailable/);
  assert.equal(saved.schema, 2);
  assert.equal(saved.salvage, 114);
  const reopened = await new NativePilotStore().open();
  assert.equal(reopened.callSign, 'RAVEN-4');
  assert.equal(reopened.salvage, 114);
  assert.equal(saved.salvage, 114);
});

test('XP reflects played performance, respects receipts and has no purchase or loadout effect', async () => {
  const [api, { STAGES }] = await load;
  const pilot = api.newPilot();
  const id = STAGES[0].id;
  const stalled = api.beginRun(pilot, 'idle', 'arcade', id);
  assert.equal(api.settleRun(pilot, stalled.id, { status: 'defeat', duration: 3, kills: 1, movement: 20 }).xpAward, 0);
  const run = api.beginRun(pilot, 'first', 'arcade', id);
  const first = api.settleRun(pilot, run.id, { ...aClear, mastery: true });
  assert.ok(first.xpAward > 0);
  assert.equal(pilot.lifetimeXp, first.xpAward);
  assert.equal(api.settleRun(pilot, run.id, { ...aClear, score: 99999 }), first);
  assert.equal(pilot.lifetimeXp, first.xpAward);
  const repeat = clearMission(api, pilot, id);
  assert.ok(repeat.xpAward > 0 && repeat.xpAward < first.xpAward);
  assert.equal(api.upgradeStatus(pilot, 'damage').limit, 2);
  assert.ok(api.install(pilot, 'damage'));
  assert.equal(run.tiers.damage, 0, 'a purchased tier cannot change an in-flight or historic build');
  assert.equal(api.beginRun(pilot, 'after-upgrade', 'arcade', id).tiers.damage, 1);
  assert.equal(api.pilotRank(40_000).level > api.pilotRank(0).level, true);
});

test('nine Side Operations follow their main clearance and settle optional progress only once', async () => {
  const [api, { STAGES, SIDE_OPERATIONS }] = await load;
  const pilot = api.newPilot();
  const expected = [1, 2, 4, 6, 8, 9, 11, 12, 13];
  assert.deepEqual(SIDE_OPERATIONS.map(({ requires }) => requires), expected);
  assert.deepEqual(SIDE_OPERATIONS.map(({ act }) => act), [1, 1, 1, 2, 2, 2, 3, 3, 3]);
  assert.deepEqual(api.completionCounts(pilot), { main:0, side:0, total:0, mainLimit:15, sideLimit:9, totalLimit:24 });
  for (const stage of STAGES) {
    const operation = SIDE_OPERATIONS.find(({ requires }) => requires === stage.number);
    if (operation) {
      assert.equal(api.hasStage(pilot, operation.id), false);
      assert.equal(api.beginRun(pilot, 'too-early', 'arcade', operation.id), null);
    }
    const mainReceipt = clearMission(api, pilot, stage.id);
    assert.deepEqual(mainReceipt.newOperations, operation ? [operation.id] : []);
    if (!operation) continue;
    assert.equal(api.hasStage(pilot, operation.id), true);
    const limit = api.upgradeStatus(pilot, 'damage').limit;
    const next = api.nextMission(pilot)?.id;
    const balance = pilot.salvage;
    const beforeXp = pilot.lifetimeXp;
    const run = api.beginRun(pilot, `operation-${operation.code}`, 'arcade', operation.id);
    const result = api.settleRun(pilot, run.id, { ...aClear, mastery:true });
    assert.equal(result.side, true);
    assert.equal(result.campaignWon, false);
    assert.equal(result.newShip, null);
    assert.equal(result.newSpecial, null);
    assert.equal(result.newStage, null);
    assert.equal(result.award, operation.first);
    assert.ok(result.xpAward > 0);
    assert.equal(api.settleRun(pilot, run.id, { ...aClear, score:999_999 }), result);
    assert.equal(pilot.salvage, balance + result.award);
    assert.equal(pilot.lifetimeXp, beforeXp + result.xpAward);
    assert.equal(pilot.sideClears[operation.id], 1);
    assert.ok(pilot.sideMastery[operation.mastery.key ?? operation.id]);
    assert.ok(pilot.records.side[operation.id]);
    assert.ok(api.loadoutBest(pilot, operation.id));
    assert.equal(api.upgradeStatus(pilot, 'damage').limit, limit);
    assert.equal(api.nextMission(pilot)?.id, next);
    assert.equal(api.hasStage(pilot, operation.id, 'veteran'), false);
  }
  assert.deepEqual(api.completionCounts(pilot), { main:15, side:9, total:24, mainLimit:15, sideLimit:9, totalLimit:24 });
  assert.deepEqual(api.migratePilot(structuredClone(pilot)), pilot);
});

test('the main-only economy buys a competitive build and operations accelerate purchases within the same cap', async () => {
  const [api, { STAGES, SIDE_OPERATIONS, UPGRADES }] = await load;
  const stockBudget = 2760;
  const mainSalvage = STAGES.reduce((sum, stage) => sum + stage.first, 0);
  assert.ok(mainSalvage >= .82 * stockBudget && mainSalvage < stockBudget);
  assert.ok(SIDE_OPERATIONS.reduce((sum, stage) => sum + stage.first, 0) < .32 * mainSalvage);
  const tracks = Object.keys(UPGRADES);

  function spend(pilot) {
    const shops = tracks.map((key) => [key, api.upgradeStatus(pilot, key)]);
    const eligible = shops.filter(([, line]) => line.affordable && line.available).sort((a, b) => a[1].nextCost - b[1].nextCost);
    return eligible.length > 0 && api.install(pilot, eligible[0][0]);
  }

  for (const includeSide of [false, true]) {
    const pilot = api.newPilot();
    for (const stage of STAGES) {
      clearMission(api, pilot, stage.id);
      if (includeSide) {
        for (const operation of SIDE_OPERATIONS.filter(({ requires }) => requires === stage.number)) clearMission(api, pilot, operation.id);
      }
      while (spend(pilot)) { /* Spend only earned balance at the live campaign gate. */ }
      assert.ok(tracks.every((key) => pilot.tiers[key] <= stage.number + 1));
      if (stage.number === 5) assert.ok(Math.min(...Object.values(pilot.tiers)) >= 4);
    }
    assert.equal(api.campaignComplete(pilot), true);
    assert.equal(api.hasEndless(pilot), true);
    if (includeSide) assert.ok(tracks.every((key) => pilot.tiers[key] === 15));
    else assert.ok(tracks.every((key) => pilot.tiers[key] >= 13));
  }
});
