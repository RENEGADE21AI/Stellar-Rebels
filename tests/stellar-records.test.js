const assert = require('node:assert/strict');
const test = require('node:test');

const pilot = import('../arcade/pilot.mjs');
const catalog = import('../arcade/catalog.mjs');
const clear = { status:'clear', score:3000, duration:420, kills:82, mastery:true };
const defeat = { status:'defeat', score:2100, duration:66, kills:16, movement:650 };

async function completedPilot() {
  const [{ newPilot }, { STAGES }] = await Promise.all([pilot, catalog]);
  const saved = newPilot();
  saved.clears = Object.fromEntries(STAGES.map(({ id }) => [id, 1]));
  return saved;
}

test('a loadout best follows the run snapshot and compares canonical upgrade tiers', async () => {
  const { beginRun, loadoutBest, settleRun } = await pilot;
  const saved = await completedPilot();
  saved.ship = 'needle';
  saved.special = 'ion';
  saved.tiers = { damage:15, rate:12, thrusters:4, energy:3 };
  beginRun(saved, 'maxed', 'arcade', 6);

  saved.ship = 'bastion';
  saved.tiers.damage = 11;
  const receipt = settleRun(saved, 'maxed', clear);
  assert.equal(receipt.ship, 'needle');
  assert.equal(receipt.tiers.damage, 15);
  assert.deepEqual(receipt.loadout, { improved:true, previous:null });
  assert.equal(loadoutBest(saved, 6), null);
  saved.ship = 'needle';
  saved.special = 'ghost';
  assert.equal(loadoutBest(saved, 6), null);
  saved.special = 'ion';
  saved.tiers = { energy:3, thrusters:4, rate:12, damage:15 };
  assert.deepEqual(loadoutBest(saved, 6), { score:3000, duration:clear.duration, status:'clear' });
  assert.equal(loadoutBest(saved, 5), null);
  assert.equal(loadoutBest(saved, null), null);
  saved.tiers.thrusters = 5;
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
  const { beginRun, loadoutBest, migratePilot, settleRun } = await pilot;
  const legacy = { ...clear, score:10000, rules:'arcade-1', mode:'arcade', stage:1, ship:'kestrel', equipment:[] };
  const legacyLoadout = { score:10000, duration:clear.duration, status:'clear' };
  const saved = migratePilot({ schema:1, clears:{ 1:1 }, records:{ arcade:{ 1:legacy }, loadouts:{ 'arcade-1/1/kestrel/ghost/stock':legacyLoadout } } });
  assert.equal(loadoutBest(saved, 1), null);
  const old = beginRun(saved, 'old-flight', 'arcade', 1);
  old.rules = 'arcade-1';
  assert.equal(settleRun(saved, 'old-flight', clear), null);

  beginRun(saved, 'new-flight', 'arcade', 1);
  const receipt = settleRun(saved, 'new-flight', clear);
  assert.equal(receipt.best, true);
  assert.equal(receipt.loadout.previous, null);
  assert.equal(loadoutBest(saved, 1).score, 3000);
  assert.equal(saved.records.arcade[1].score, 3000);
  assert.deepEqual(saved.records.history['arcade-1/1'], legacy);
  assert.deepEqual(saved.records.loadouts['arcade-1/1/kestrel/ghost/stock'], legacyLoadout);
});

test('Endless compares time first and score at equal time without awarding Salvage', async () => {
  const { beginRun, loadoutBest, settleRun } = await pilot;
  const saved = await completedPilot();
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
  const { beginRun, loadoutBest, migratePilot, settleRun } = await pilot;
  const { stageById } = await catalog;
  const stage = stageById(5);
  const masteryKey = stage.mastery.key ?? stage.id;
  const original = { mode:'arcade', stage:5, ship:'kestrel', rules:'arcade-1', equipment:[],
    status:'clear', score:12340, duration:218, kills:31, breaks:0 };
  const saved = migratePilot({ schema:1, clears:{ 1:1, 2:1, 3:1, 4:1, 5:1 }, mastery:{ 5:true }, records:{ arcade:{ 5:original } } });
  beginRun(saved, 'earlier-flight', 'arcade', 5).rules = 'arcade-1';
  beginRun(saved, 'wraith-clear', 'arcade', 5);
  const first = settleRun(saved, 'wraith-clear', { ...clear, score:32664, mastery:false });
  assert.equal(first.masteryMet, false);
  assert.equal(saved.records.arcade[5].score, 32664);
  assert.deepEqual(saved.records.history['arcade-1/5'], original);
  assert.equal(saved.legacy.mastery[5], true);
  assert.equal(saved.mastery[masteryKey], undefined);

  const salvage = saved.salvage;
  assert.equal(settleRun(saved, 'earlier-flight', { ...clear, score:15300 }), null);
  assert.equal(saved.salvage, salvage);
  assert.equal(saved.records.history['arcade-1/5'].score, original.score);
  assert.equal(loadoutBest(saved, 5).score, 32664);

  beginRun(saved, 'new-high', 'arcade', 5);
  const newHigh = settleRun(saved, 'new-high', { ...clear, score:37000 });
  assert.equal(saved.records.arcade[5].score, 37000);
  assert.equal(newHigh.mastery, true);
  assert.equal(saved.mastery[masteryKey], true);
  assert.deepEqual(saved.records.history['arcade-1/5'], original);
  assert.equal(loadoutBest(saved, 5).score, 37000);
});

test('Endless keeps an earlier rules best by duration and fills the current loadout record', async () => {
  const { beginRun, hasEndless, hasVeteran, loadoutBest, migratePilot, settleRun } = await pilot;
  const original = { mode:'endless', stage:null, ship:'kestrel', rules:'arcade-8', equipment:[],
    status:'defeat', score:9500, duration:150 };
  const saved = migratePilot({ schema:1, records:{ endless:original } });
  assert.equal(hasEndless(saved), true);
  assert.equal(hasVeteran(saved), false);
  assert.equal(loadoutBest(saved, null), null);
  beginRun(saved, 'new-survival', 'endless', null);
  const current = settleRun(saved, 'new-survival', { ...defeat, score:4300, duration:130 });
  assert.equal(current.award, 0);
  assert.deepEqual(saved.records.history['arcade-8/endless'], original);
  assert.equal(current.best, true);
  assert.equal(saved.records.endless.duration, 130);
  assert.equal(loadoutBest(saved, null).duration, 130);
  assert.deepEqual(Object.keys(saved.records.history), ['arcade-8/endless']);
  assert.equal(saved.salvage, 0);
});

test('Veteran and Standard compare tiers and mastery independently on the same mission', async () => {
  const { beginRun, loadoutBest, settleRun } = await pilot;
  const saved = await completedPilot();
  const now = 1_720_000_000_000;
  beginRun(saved, 'standard', 'arcade', 1, now);
  beginRun(saved, 'veteran', 'arcade', 1, now, '', 'veteran');
  const standard = settleRun(saved, 'standard', clear);
  const veteran = settleRun(saved, 'veteran', { ...clear, score:2500 });
  assert.equal(standard.mastery, true);
  assert.equal(veteran.mastery, true);
  assert.equal(veteran.loadout.previous, null);
  assert.equal(loadoutBest(saved, 1).score, 3000);
  assert.equal(loadoutBest(saved, 1, 'veteran').score, 2500);
});
