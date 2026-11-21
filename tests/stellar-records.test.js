const assert = require('node:assert/strict');
const test = require('node:test');

const pilot = import('../arcade/pilot.mjs');
const clear = { status:'clear', score:3000, duration:175, kills:30, mastery:true };
const defeat = { status:'defeat', score:2100, duration:66, kills:16, movement:650 };

test('a loadout best follows the run snapshot and compares canonical upgrade sets', async () => {
  const { beginRun, loadoutBest, newPilot, settleRun } = await pilot;
  const saved = newPilot();
  saved.clears = { 1:1, 2:1, 3:1, 4:1, 5:1, 6:1 };
  saved.ship = 'needle';
  saved.special = 'ion';
  saved.equipment = ['hull','cells','chamber','rails'];
  beginRun(saved, 'maxed', 'arcade', 6);

  saved.ship = 'bastion';
  const receipt = settleRun(saved, 'maxed', clear);
  assert.equal(receipt.ship, 'needle');
  assert.deepEqual(receipt.loadout, { improved:true, previous:null });
  assert.equal(loadoutBest(saved, 6), null);
  saved.ship = 'needle';
  saved.special = 'ghost';
  assert.equal(loadoutBest(saved, 6), null);
  saved.special = 'ion';
  saved.equipment = ['rails','hull','chamber','cells'];
  assert.deepEqual(loadoutBest(saved, 6), { score:3000, duration:175, status:'clear' });
  assert.equal(loadoutBest(saved, 5), null);
  assert.equal(loadoutBest(saved, null), null);
  saved.equipment = ['hull','chamber','rails'];
  assert.equal(loadoutBest(saved, 6), null);
});

test('a clear beats a failed attempt once, and later clears recognize mastery without re-awarding it', async () => {
  const { beginRun, loadoutBest, newPilot, settleRun } = await pilot;
  const saved = newPilot();
  beginRun(saved, 'first-attempt', 'arcade', 1);
  const attempt = settleRun(saved, 'first-attempt', { ...defeat, score:4000 });
  assert.equal(attempt.loadout.improved, true);

  beginRun(saved, 'first-clear', 'arcade', 1);
  const first = settleRun(saved, 'first-clear', clear);
  assert.equal(first.loadout.previous.status, 'defeat');
  assert.equal(first.loadout.improved, true);
  assert.equal(first.mastery, true);
  assert.equal(first.masteryMet, true);
  const banked = saved.salvage;
  assert.deepEqual(settleRun(saved, 'first-clear', { ...clear, score:9999 }), first);
  assert.equal(saved.salvage, banked);
  assert.equal(saved.clears[1], 1);

  beginRun(saved, 'late-defeat', 'arcade', 1);
  const failed = settleRun(saved, 'late-defeat', { ...defeat, score:5000 });
  assert.equal(failed.loadout.improved, false);
  assert.equal(failed.loadout.previous.status, 'clear');
  assert.equal(loadoutBest(saved, 1).score, 3000);

  beginRun(saved, 'master-again', 'arcade', 1);
  const replay = settleRun(saved, 'master-again', { ...clear, score:3700 });
  assert.equal(replay.mastery, false);
  assert.equal(replay.masteryMet, true);
  assert.equal(replay.loadout.previous.score, 3000);
  assert.equal(loadoutBest(saved, 1).score, 3700);
});

test('earlier career results stay visible without becoming current loadout targets', async () => {
  const { beginRun, loadoutBest, newPilot, settleRun } = await pilot;
  const saved = newPilot();
  saved.clears[1] = 1;
  const legacy = { ...clear, score:10000, rules:'arcade-1', mode:'arcade', stage:1, ship:'kestrel', equipment:[] };
  saved.records.arcade[1] = legacy;
  assert.equal(loadoutBest(saved, 1), null);
  const old = beginRun(saved, 'old-flight', 'arcade', 1);
  old.rules = 'arcade-1';
  assert.equal(settleRun(saved, 'old-flight', clear).loadout, null);

  beginRun(saved, 'new-flight', 'arcade', 1);
  const receipt = settleRun(saved, 'new-flight', clear);
  assert.equal(receipt.best, false);
  assert.equal(receipt.loadout.previous, null);
  assert.equal(loadoutBest(saved, 1).score, 3000);
  assert.deepEqual(saved.records.arcade[1], legacy);
});

test('Endless compares time first and score at equal time without awarding Salvage', async () => {
  const { beginRun, loadoutBest, newPilot, settleRun } = await pilot;
  const saved = newPilot();
  beginRun(saved, 'endless-one', 'endless', null);
  const first = settleRun(saved, 'endless-one', defeat);
  beginRun(saved, 'endless-two', 'endless', null);
  const short = settleRun(saved, 'endless-two', { ...defeat, score:3300, duration:65 });
  beginRun(saved, 'endless-three', 'endless', null);
  const tiedTime = settleRun(saved, 'endless-three', { ...defeat, score:2500 });
  beginRun(saved, 'endless-four', 'endless', null);
  const longer = settleRun(saved, 'endless-four', { ...defeat, score:1900, duration:77 });

  assert.equal(first.loadout.previous, null);
  assert.equal(short.loadout.improved, false);
  assert.equal(tiedTime.loadout.improved, true);
  assert.equal(longer.loadout.previous.score, 2500);
  assert.equal(loadoutBest(saved, null).duration, 77);
  assert.equal(saved.salvage, 0);
});

test('new Outer Orbit highs preserve the original Gravity Platform score and its independent mastery', async () => {
  const { beginRun, loadoutBest, newPilot, settleRun } = await pilot;
  const { RULES_VERSION } = await import('../arcade/catalog.mjs');
  const saved = newPilot();
  saved.clears = { 1:1, 2:1, 3:1, 4:1, 5:1 };
  saved.mastery[5] = true;
  const original = { mode:'arcade', stage:5, ship:'kestrel', rules:'arcade-1', equipment:[],
    status:'clear', score:12340, duration:218, kills:31, breaks:0 };
  saved.records.arcade[5] = original;
  beginRun(saved, 'earlier-flight', 'arcade', 5).rules = 'arcade-1';
  beginRun(saved, 'wraith-clear', 'arcade', 5);
  const first = settleRun(saved, 'wraith-clear', { ...clear, score:32664, duration:186, mastery:false });
  assert.equal(first.masteryMet, false);
  assert.equal(saved.records.arcade[5].score, 32664);
  assert.deepEqual(saved.records.history['arcade-1/5'], original);
  assert.equal(saved.mastery[5], true);
  assert.equal(saved.mastery.wraith, undefined);

  const earlier = settleRun(saved, 'earlier-flight', { ...clear, score:15300 });
  assert.equal(earlier.best, false);
  assert.equal(earlier.loadout, null);
  assert.equal(earlier.mastery, false);
  assert.equal(saved.records.history['arcade-1/5'].score, 15300);
  const salvage = saved.salvage;
  assert.deepEqual(settleRun(saved, 'earlier-flight', { ...clear, score:99999 }), earlier);
  assert.equal(saved.salvage, salvage);
  assert.equal(saved.records.history['arcade-1/5'].score, 15300);
  assert.equal(loadoutBest(saved, 5).score, 32664);

  beginRun(saved, 'earlier-high', 'arcade', 5).rules = 'arcade-1';
  settleRun(saved, 'earlier-high', { ...clear, score:37000 });
  assert.equal(saved.records.arcade[5].score, 37000);
  assert.deepEqual(Object.keys(saved.records.history), [`${RULES_VERSION}/5`]);
  assert.equal(saved.records.history[`${RULES_VERSION}/5`].score, 32664);
  assert.equal(loadoutBest(saved, 5).score, 32664);
});

test('Endless keeps an earlier rules best by duration and fills the current loadout record', async () => {
  const { beginRun, loadoutBest, newPilot, settleRun } = await pilot;
  const saved = newPilot();
  const original = { mode:'endless', stage:null, ship:'kestrel', rules:'arcade-8', equipment:[],
    status:'defeat', score:9500, duration:150 };
  saved.records.endless = original;
  beginRun(saved, 'old-survival', 'endless', null).rules = 'arcade-8';
  beginRun(saved, 'new-survival', 'endless', null);
  const current = settleRun(saved, 'new-survival', { ...defeat, score:4300, duration:190 });
  assert.equal(current.award, 0);
  assert.deepEqual(saved.records.history['arcade-8/endless'], original);
  const earlier = settleRun(saved, 'old-survival', { ...defeat, score:6400, duration:170 });
  assert.equal(earlier.best, false);
  assert.equal(saved.records.history['arcade-8/endless'].duration, 170);
  assert.equal(saved.records.endless.duration, 190);
  assert.equal(loadoutBest(saved, null).duration, 190);
  assert.deepEqual(Object.keys(saved.records.history), ['arcade-8/endless']);
  assert.equal(saved.salvage, 0);
});
