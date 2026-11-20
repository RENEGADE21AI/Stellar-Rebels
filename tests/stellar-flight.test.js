const assert = require('node:assert/strict');
const test = require('node:test');
const { chooseFlightPath } = require('../scripts/stellar-qa-pilot.js');
require('../src/00-runtime.js');
require('../src/00-gameplay-rules.js');
require('../src/00-asset-manifest.js');

const load = Promise.all(['flight', 'pilot', 'catalog', 'bosses'].map((name) => import(`../arcade/${name}.mjs`)));
const step = 1 / 60;

function context(which = 1, equipment = []) {
  return { id: 'test-flight', mode: 'arcade', stage: which, ship: 'kestrel', equipment, assistance: {} };
}

test('stock and fully upgraded Fighter can clear every authored Standard stage', async () => {
  const [{ Flight, bounds }, , { STAGES }] = await load;
  for (const stage of STAGES) {
    for (const equipment of [[], ['rails','chamber','cells','hull']]) {
      const f = new Flight(context(stage.id, equipment));
      while (f.status === 'active' && f.elapsed < stage.bossAt + 110) {
        if (Math.round(f.elapsed * 60) % 5 === 0) {
          const target = chooseFlightPath(f, bounds);
          f.drag(target.x - f.xIntent, target.y - f.yIntent);
        }
        f.step(step);
        f.takeEvents();
      }
      const note = `${stage.name} ${equipment.length ? 'max' : 'stock'} · ${f.status} · ${f.elapsed.toFixed(1)}s · ${f.player.hull} hull · ${f.breaks} breaks · ${f.score} score`;
      console.log(note);
      assert.equal(f.status, 'clear', note);
      assert.ok(f.elapsed > stage.bossAt + 7, 'the boss remains an encounter with fully upgraded weapons');
    }
  }
});

test('each earned ship can beat the finale with its stock loadout', async () => {
  const [{ Flight, bounds }, , { STAGES }] = await load;
  const final = STAGES.at(-1);
  for (const ship of ['needle','bastion']) {
    const f = new Flight({ ...context(final.id), ship });
    while (f.status === 'active' && f.elapsed < final.bossAt + 112) {
      if (Math.round(f.elapsed * 60) % 5 === 0) {
        const target = chooseFlightPath(f, bounds, true);
        f.drag(target.x - f.xIntent, target.y - f.yIntent);
      }
      f.step(step);
      f.takeEvents();
    }
    const note = `${ship} · ${f.status} · ${f.elapsed.toFixed(1)}s · ${f.player.hull} hull`;
    console.log(note);
    assert.equal(f.status,'clear',note);
  }
});

test('Arcade progression settles one receipt atomically and Endless pays no Salvage', async () => {
  const [, pilot, { STAGES }] = await load;
  const p = pilot.newPilot();
  assert.equal(pilot.hasStage(p, 1), true);
  assert.equal(pilot.hasStage(p, 2), false);
  assert.equal(pilot.install(p, 'rails'), false);
  assert.equal(pilot.equip(p, 'need' + 'le'), false);
  assert.equal(pilot.beginRun(p, 'early', 'arcade', 2), null);
  const result = { status:'clear', score:9410, duration:183, kills:36, breaks:2 };
  const entry = pilot.beginRun(p, 'first', 'arcade', 1);
  assert.deepEqual(entry.equipment, []);
  const first = pilot.settleRun(p, 'first', result);
  assert.equal(first.award, 78);
  assert.equal(first.breaks, 2);
  assert.equal(first.newStage, STAGES.length > 1 ? 2 : null);
  assert.equal(pilot.settleRun(p, 'first', result), first);
  assert.equal(p.salvage, 78);
  assert.ok(pilot.install(p, 'rails'));
  assert.equal(pilot.install(p, 'rails'), false);
  assert.equal(p.salvage, 8);
  pilot.beginRun(p, 'repeat', 'arcade', 1);
  assert.equal(pilot.settleRun(p, 'repeat', result).award, 16);
  pilot.beginRun(p, 'ongoing', 'arcade', 1);
  pilot.abandonRun(p, 'ongoing');
  assert.equal(pilot.settleRun(p, 'ongoing', result), null);
  pilot.beginRun(p, 'free', 'endless');
  const s = pilot.settleRun(p, 'free', { ...result, status:'defeat' });
  assert.equal(s.award, 0);
  assert.equal(s.ship, 'kestrel');
  assert.equal(p.records.endless.duration, 183);
  assert.equal(p.salvage, 24);
});

test('equally good new attempts earn modest Salvage and one attempt cannot pay twice', async () => {
  const [, pilot, { STAGES }] = await load;
  const p = pilot.newPilot();
  p.defeatBank = { 1:20 };
  const attempt = (id, duration, kills, movement = 120, stage = 1) => {
    pilot.beginRun(p, id, 'arcade', stage);
    return pilot.settleRun(p, id, { status:'defeat', duration, kills, movement, score:1000 });
  };
  assert.equal(attempt('quit', 14, 8).award, 0);
  assert.equal(attempt('idle', 80, 12, 0).award, 0);
  assert.equal(attempt('low-combat', 80, 4).award, 0);
  const first = attempt('first', 80, 12);
  assert.equal(first.award, 4);
  assert.equal(pilot.settleRun(p, 'first', { status:'defeat' }), first);
  assert.equal(attempt('equal-as-new-run', 80, 12).award, first.award);
  assert.equal(attempt('better', 111, 24).award, 7);
  assert.equal(p.salvage, 15);
  for (const stage of STAGES) {
    if (stage.id > 1) p.clears[stage.id - 1] = 1;
    for (let t = 24; t <= stage.bossAt + 5; t++) {
      const award = attempt(`bound-${stage.id}-${t}`, t, 300, 200, stage.id).award;
      assert.ok(award / t < stage.repeat / (stage.bossAt + 55), `${stage.name} defeat farming at ${t}s`);
    }
  }
  assert.equal(pilot.settleRun(p, 'first', { status:'defeat' }), null, 'aged-out receipts still have no active run to settle');
});

test('touch intent clamps, reanchors, and moves consistently at different render rates', async () => {
  const [{ Flight, bounds }] = await load;
  function run(hz) {
    const f = new Flight(context());
    f.drag(-4000, 4000);
    assert.equal(f.xIntent, bounds.left);
    assert.equal(f.yIntent, bounds.bottom);
    const clock = globalThis.createFixedStepClock();
    for (let i = 0; i <= hz; i++) globalThis.advanceFixedStep(clock, i * 1000 / hz, (dt) => f.step(dt / 1000));
    f.reanchor();
    assert.equal(f.xIntent, f.player.x);
    assert.equal(f.yIntent, f.player.y);
    return [f.player.x, f.player.y, Math.round(f.elapsed * 60)];
  }
  assert.deepEqual(run(30), run(60));
  assert.deepEqual(run(120), run(60));
});

test('rail and gravity lanes take effect only at the marked place and time', async () => {
  const [{ Flight }, , , { operatorWarnings }] = await load;
  const { markPull, markRail, markWall } = await import('../arcade/boss-patterns.mjs');
  const f = new Flight(context(5));
  f.player.guard = 0;
  markRail(f, f.player.x, 36);
  operatorWarnings(f, 1.18);
  assert.equal(f.player.hull, 5);
  operatorWarnings(f, .05);
  assert.equal(f.player.hull, 4);

  f.hazards.length = 0;
  f.xIntent = f.player.x;
  markPull(f, f.player.x + 35);
  operatorWarnings(f, .95);
  assert.equal(f.xIntent, f.player.x);
  operatorWarnings(f, .03);
  assert.ok(f.xIntent > f.player.x);
  const before = f.xIntent;
  f.player.x = 35;
  operatorWarnings(f, .13);
  assert.equal(f.xIntent, before);

  f.hazards.length = 0;
  markWall(f, 1, { delay:1.25 });
  operatorWarnings(f, 1.18);
  assert.equal(f.hostile.length, 0);
  operatorWarnings(f, 1.20);
  assert.ok(f.hostile.length > 0);
  assert.ok(f.hostile.every((shot) => Math.abs(shot.x - f.hazards[0].x) >= f.hazards[0].width/2+11));
  const wall = f.hazards[0];
  f.hostile.forEach((shot) => { shot.y += shot.vy * .4; });
  operatorWarnings(f, .4);
  assert.ok(f.hostile.every((shot) => Math.abs(shot.y - wall.rowY) < .001));
});

test('linked Gunners launch from both rotated hardware mounts', async () => {
  const [{ Flight }, , { GUNNER_MUZZLES, hardpointAt }] = await load;
  const { linkedVolley } = await import('../arcade/formations.mjs');
  const f = new Flight(context());
  const wing = { kind:'lancer', x:104, y:150, turn:.13, hull:5, group:1 };
  f.enemies.push(wing);
  linkedVolley(f, { x:162, y:120, group:1 });
  assert.deepEqual(f.hostile.map(({ x,y }) => ({ x,y })), GUNNER_MUZZLES.map(([dx,dy]) => hardpointAt(wing,dx,dy,wing.turn)));
});

test('fatal rail damage ends the run before a simultaneous repair', async () => {
  const [{ Flight }] = await load;
  const f = new Flight(context(6));
  f.elapsed = 65.999;
  f.terrainIndex = 1;
  f.dropIndex = 2;
  f.waveIndex = f.stage.waves.length;
  Object.assign(f.player, {x:191, y:308.5, guard:0, hull:1});
  f.reanchor();
  while (f.status === 'active' && f.elapsed < 67.3) f.step(step);
  assert.equal(f.terminal()?.status, 'defeat');
  assert.equal(f.player.hull, 0);
  assert.ok(f.events.some((event) => event.type === 'playerDown'));
  assert.ok(!f.events.some((event) => event.type === 'pickup'));
});

test('Ghost Shift spends earned charge and phases through physical danger without spending a barrier', async () => {
  const [{ Flight }, , { GHOST }] = await load;
  const f = new Flight(context());
  const p = f.player;
  assert.equal(f.activateGhost(), false);
  p.guard = 0;
  f.collect({ kind:'barrier' });
  for (let i = 0; i < 4; i++) f.scoreKill(100);
  assert.equal(p.ghostEnergy, GHOST.cost);
  assert.equal(f.activateGhost(), true);
  assert.equal(p.ghostEnergy, 0);
  assert.equal(f.damage(p.x, p.y), false);
  assert.equal(p.barrier, 2);
  for (let i = 0; i < 50; i++) { f.scoreKill(100); f.earnGhost(5, true); }
  assert.equal(p.ghostEnergy, 0);
  while (p.ghostTime) f.movePilot(step);
  assert.equal(p.realm, 'physical');
  assert.equal(f.damage(p.x, p.y), true);
  assert.equal(p.barrier, 1);
  f.earnGhost(500);
  assert.equal(p.ghostEnergy, GHOST.capacity);
  assert.equal(f.activateGhost(), false);
  while (p.ghostRecovery) f.movePilot(step);
  assert.equal(f.activateGhost(), true);
  assert.equal(new Flight(context()).player.ghostEnergy, GHOST.start);
});

test('Wraith realm hops alternate actual vulnerability and a charged volley keeps its telegraphed target', async () => {
  const [{ Flight }, , { GHOST }] = await load;
  const { launchBoss } = await import('../arcade/bosses.mjs');
  const { advanceWraith } = await import('../arcade/wraith.mjs');
  const f = new Flight(context(5));
  const p = f.player;
  launchBoss(f, 'wraith');
  const b = f.boss;
  Object.assign(b, { age:5, x:192, y:242, attack:2, timer:0 });
  advanceWraith(f, b, step);
  assert.equal(b.charge.realm, 'physical');
  const lockedAngle = b.charge.aim;
  assert.equal(f.activateGhost(), true);
  assert.equal(p.ghostEnergy, GHOST.start - GHOST.hop);
  assert.equal(p.realm, 'ghost');
  assert.equal(p.ghostTime, 0);
  p.guard = 0;
  assert.equal(f.damage(p.x, p.y, 'physical'), false);
  assert.equal(f.damage(p.x, p.y, 'ghost'), true);
  const hit = { x:b.x, y:b.y, px:b.x, py:b.y + 7, strength:2, realm:'ghost' };
  assert.equal(f.hitBoss(hit), true);
  assert.equal(b.hull, b.spec.hull);
  assert.equal(f.hitBoss({ ...hit, realm:'physical' }), true);
  assert.equal(b.hull, b.spec.hull - 2);
  assert.ok(p.ghostEnergy > GHOST.start - GHOST.hop);
  p.x = 45;
  b.age = b.charge.fireAt;
  advanceWraith(f, b, step);
  const volley = f.hostile.filter((s) => s.realm === 'physical');
  assert.equal(volley.length, 5);
  assert.ok(Math.abs(Math.atan2(volley[2].vy, volley[2].vx) - lockedAngle) < .0001);
  b.age = b.shiftAt;
  advanceWraith(f, b, step);
  assert.equal(b.realm, 'ghost');
  assert.equal(f.hitBoss(hit), true);
  assert.equal(b.hull, b.spec.hull - 4);
});

test('a returning Outer Orbit pilot keeps the original mastery and earns Wraith mastery separately', async () => {
  const [, { newPilot, beginRun, settleRun }] = await load;
  const pilot = newPilot();
  for (const stage of [1, 2, 3, 4, 5]) pilot.clears[stage] = 1;
  pilot.mastery[5] = true;
  const run = beginRun(pilot, 'fresh-wraith', 'arcade', 5);
  const result = settleRun(pilot, run.id, { status:'clear', score:5000, duration:190, kills:18, mastery:true });
  assert.equal(result.first, false);
  assert.equal(result.award, 40);
  assert.equal(result.mastery, true);
  assert.deepEqual(pilot.mastery, { 5:true, wraith:true });
});

test('reduced effects preserve shot origins and combat outcomes', async () => {
  const [{ Flight }] = await load;
  const standard = new Flight(context());
  const reduced = new Flight({ ...context(), assistance:{reduced:true} });
  for (const f of [standard,reduced]) {
    f.drag(-123,-14);
    f.player.bank = -.18;
    f.shoot(.25);
  }
  assert.deepEqual(standard.friendly,reduced.friendly);
});

test('legacy decoding preserves all device save keys and reads nested historical records', async () => {
  const [, { legacyArchive }] = await load;
  const values = new Map([
    ['star_strike_rush_meta_v1','{"totalGlory":624320,"lifetime":{"bestScore":9520}}'],
    ['star_strike_rush_high_score_v1','8123'],
    ['star_strike_rush_settings_v1','{"musicEnabled":false,"effectsEnabled":true}']
  ]);
  const saved = [...values];
  assert.deepEqual(legacyArchive({ getItem:key=>values.get(key) }), {
    visible:true, glory:624320, prestige:2, score:9520, settings:{ music:false, effects:true }
  });
  assert.deepEqual([...values], saved);
});
