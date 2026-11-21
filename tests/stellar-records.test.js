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
