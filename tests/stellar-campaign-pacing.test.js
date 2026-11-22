const { test } = require('node:test');
const assert = require('node:assert/strict');

test('pacing instrumentation is opt-in and restricted to local web development', async () => {
  const { createPacingRecorder } = await import('../arcade/pacing.mjs');
  assert.equal(createPacingRecorder(new URL('https://stellar-rebels.web.app/?pacing=1')), null);
  assert.equal(createPacingRecorder(new URL('http://localhost:4173/')), null);
  assert.equal(createPacingRecorder(new URL('file:///index.html?pacing=1')), null);
  assert.ok(createPacingRecorder(new URL('http://127.0.0.1:4173/?pacing=1')));
});

test('pacing separates active time, retries, upgrades and the ending without collecting a call sign', async () => {
  const { createPacingRecorder } = await import('../arcade/pacing.mjs');
  let now = 0;
  const recorder = createPacingRecorder(new URL('http://localhost:4173/?pacing=1'), () => now);
  const run = { id: 'first', stage: 1, variant: 'standard', mode: 'arcade', ship: 'kestrel', special: 'ghost',
    tiers: { damage: 0, rate: 0, thrusters: 0, energy: 0 }, callSign: 'Private' };
  recorder.start();
  recorder.scene('story');
  now += 4000;
  recorder.scene('flight');
  now += 160_000;
  recorder.attempt({ ...run, duration: 159.9, status: 'defeat', award: 20, xpAward: 78 }, { damageCause: 'debris' });
  recorder.scene('result');
  now += 3000;
  recorder.purchase('damage', 0, { ...run, tiers: { ...run.tiers, damage: 1 }, salvage: 2 });
  recorder.scene('flight');
  now += 300_000;
  const clear = { ...run, id: 'retry', duration: 299.4, status: 'clear', first: true, campaignWon: true };
  recorder.attempt(clear, clear);
  recorder.attempt(clear, clear);
  recorder.scene('story');
  now += 8000;
  recorder.complete();
  now += 60_000;

  const evidence = recorder.snapshot();
  assert.equal(evidence.completed, true);
  assert.equal(evidence.totalSeconds, 475);
  assert.equal(evidence.simulatedSeconds.defeat, 159.9);
  assert.equal(evidence.simulatedSeconds.clear, 299.4);
  assert.equal(evidence.sceneSeconds.story, 12);
  assert.deepEqual(evidence.standardClearOrder, [1]);
  assert.equal(evidence.retries, 1);
  assert.equal(evidence.attempts.length, 2);
  assert.equal(evidence.attempts[0].cause, 'debris');
  assert.equal(evidence.purchases[0].tier, 1);
  assert.ok(!JSON.stringify(evidence).includes('Private'));
});

test('pacing reports optional sorties separately from the mandatory route', async () => {
  const { createPacingRecorder } = await import('../arcade/pacing.mjs');
  const { SIDE_OPERATIONS, STAGES } = await import('../arcade/catalog.mjs');
  const recorder = createPacingRecorder(new URL('http://localhost:4173/?pacing=1'), () => 0);
  recorder.attempt({ id:'mission', mode:'arcade', stage:STAGES[0].id, status:'clear', duration:360, first:true });
  recorder.attempt({ id:'side', mode:'arcade', stage:SIDE_OPERATIONS[0].id, status:'clear', duration:270, first:true });
  const evidence = recorder.snapshot();
  assert.deepEqual(evidence.standardClearOrder, [1]);
  assert.deepEqual(evidence.sideClearOrder, ['A1']);
  assert.equal(evidence.simulatedSeconds.clear, 630);
  assert.equal(evidence.sideFlightSeconds.clear, 270);
  assert.equal(evidence.attempts[1].operation, 'A1');
});
