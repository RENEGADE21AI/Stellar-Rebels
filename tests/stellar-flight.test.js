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

test('each earned ship can beat Wraith and the finale with its stock loadout', async () => {
  const [{ Flight, bounds }, , { STAGES }] = await load;
  for (const stage of STAGES.slice(-2)) {
    for (const ship of ['needle','bastion']) {
      const f = new Flight({ ...context(stage.id), ship });
      while (f.status === 'active' && f.elapsed < stage.bossAt + 100) {
        if (Math.round(f.elapsed * 60) % 5 === 0) {
          const target = chooseFlightPath(f, bounds, true);
          f.drag(target.x - f.xIntent, target.y - f.yIntent);
        }
        f.step(step);
        f.takeEvents();
      }
      const note = `${ship} · ${stage.name} · ${f.status} · ${f.elapsed.toFixed(1)}s · ${f.player.hull} hull`;
      console.log(note);
      assert.equal(f.status,'clear',note);
    }
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
  assert.equal(pilot.settleRun(p, 'repeat', result).award, 62);
  pilot.beginRun(p, 'ongoing', 'arcade', 1);
  pilot.abandonRun(p, 'ongoing');
  assert.equal(pilot.settleRun(p, 'ongoing', result), null);
  pilot.beginRun(p, 'free', 'endless');
  const s = pilot.settleRun(p, 'free', { ...result, status:'defeat' });
  assert.equal(s.award, 0);
  assert.equal(s.ship, 'kestrel');
  assert.equal(p.records.endless.duration, 183);
  assert.equal(p.salvage, 70);
});

test('Ion Burst unlocks at Stage 2 and freezes in each attempt and result', async () => {
  const [, pilot] = await load;
  const p = pilot.newPilot();
  delete p.special;
  assert.equal(pilot.beginRun(p, 'legacy', 'arcade', 1).special, 'ghost');
  assert.equal(pilot.equipSpecial(p, 'ion'), false);
  assert.equal(pilot.equipSpecial(p, 'constructor'), false);
  const terminal = { status:'clear', score:2500, duration:160, kills:28 };
  assert.equal(pilot.settleRun(p, 'legacy', terminal).newSpecial, null);
  pilot.beginRun(p, 'second', 'arcade', 2);
  assert.equal(pilot.settleRun(p, 'second', terminal).newSpecial, 'ion');
  assert.equal(pilot.equipSpecial(p, 'ion'), true);
  assert.equal(pilot.beginRun(p, 'repeat', 'arcade', 1).special, 'ion');
  assert.equal(pilot.equipSpecial(p, 'ghost'), true);
  const receipt = pilot.settleRun(p, 'repeat', { ...terminal, score:3500 });
  assert.equal(receipt.special, 'ion');
  assert.equal(p.records.arcade[1].special, 'ion');
  assert.equal(receipt.newSpecial, null);
  delete p.special;
  assert.equal(pilot.hasSpecial(p, 'ion'), true, 'earlier Stage 2 clears still unlock Ion Burst');
  assert.equal(pilot.beginRun(p, 'saved', 'endless').special, 'ghost');
});

test('an active attempt from the previous release retains its payout rules', async () => {
  const [, pilot, { STAGES }] = await load;
  const p = pilot.newPilot();
  p.defeatBank = { 1:20 };
  const attempt = (id, duration, kills, movement = 120, stage = 1) => {
    const active = pilot.beginRun(p, id, 'arcade', stage);
    active.rules = 'arcade-6';
    delete active.rewardVersion;
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

test('an active minute pays useful Salvage while clears earn more per minute', async () => {
  const [, pilot, { STAGES }] = await load;
  const p = pilot.newPilot();
  assert.equal(p.settings.trainingDone, false);
  const attempt = (id, status, duration, kills, movement, stage = 1) => {
    pilot.beginRun(p, id, 'arcade', stage);
    return pilot.settleRun(p, id, { status, duration, kills, movement, score:2500 });
  };
  assert.equal(attempt('early', 'defeat', 16, 15, 800).award, 0);
  assert.equal(attempt('idle', 'defeat', 60, 15, 0).award, 0);
  assert.equal(attempt('idle-then-steer', 'defeat', 60, 15, 80).award, 0);
  assert.equal(attempt('no-combat', 'defeat', 60, 4, 1200).award, 0);
  const active = attempt('active-minute', 'defeat', 60, 15, 900);
  assert.equal(active.award, 18);
  assert.equal(pilot.settleRun(p, 'active-minute', { status:'defeat' }), active);
  assert.equal(attempt('another-minute', 'defeat', 60, 15, 900).award, 18);
  assert.equal(p.salvage, 36);
  for (const stage of STAGES) {
    p.clears[stage.id] = 1;
    const expectedClearTime = stage.bossAt + 55;
    const clear = attempt(`clear-${stage.id}`, 'clear', expectedClearTime, 50, 2400, stage.id);
    for (const duration of [24, 45, 60, 90, expectedClearTime, expectedClearTime + 90]) {
      const loss = attempt(`defeat-${stage.id}-${duration}`, 'defeat', duration, 70, 2400, stage.id);
      assert.ok(loss.award / duration < clear.award / expectedClearTime, `${stage.name} defeat farming at ${duration}s`);
      assert.ok(loss.award <= clear.award * .65);
    }
  }
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

test('Harrow marks the actual asteroid launch origin and exact collidable positions', async () => {
  const [{ Flight }, , , { launchBoss, operatorWarnings }] = await load;
  const { harrow, markWall } = await import('../arcade/boss-patterns.mjs');
  const f = new Flight(context(2));
  markWall(f, 2);
  assert.ok(f.hazards[0].origin.y < 0);
  f.hazards.length = 0;

  launchBoss(f, 'warden');
  const boss = f.boss;
  Object.assign(boss, { x:241, y:225, attack:1 });
  harrow(f, boss, 1);
  const [wall, second] = f.hazards;
  assert.equal(wall.origin.x, boss.x);
  assert.ok(wall.origin.y > boss.y && wall.origin.y < wall.y);
  assert.ok(wall.rocks.length >= 5);
  assert.ok(wall.rocks.every(({ x, y }) => Math.abs(x - wall.x) >= wall.width/2 + 15 && y === wall.y));

  operatorWarnings(f, wall.windup - .04);
  assert.equal(f.hostile.length, 0);
  operatorWarnings(f, .05);
  assert.deepEqual(f.hostile.map(({ x,y }) => ({ x,y })), wall.rocks);

  boss.x = 193;
  operatorWarnings(f, -second.age + .01);
  assert.equal(second.origin.x, boss.x);
  assert.equal(f.hostile.length, wall.rocks.length);
});

test('every mounted boss target is reachable from the pilot side of its hull', async () => {
  const [{ Flight }, , , { launchBoss }] = await load;
  const f = new Flight(context());
  for (const kind of ['gatekeeper', 'matron', 'crown']) {
    launchBoss(f, kind);
    const b = f.boss;
    Object.assign(b, { x:192, y:230, age:b.entryTime });
    for (const part of b.parts) {
      const x = b.x + part.dx;
      const y = b.y + part.dy + 78;
      f.friendly.push({ x, y, px:x, py:y, vx:0, vy:-685, strength:part.hull, live:true });
      for (let i = 0; i < 10; i++) f.moveProjectiles(step);
      assert.ok(part.hull <= 0, `${kind} module ${Math.sign(part.dx)} is shielded by its own silhouette`);
    }
    assert.equal(b.hull, b.spec.hull);
  }
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

test('a linked volley locks adjacent lanes and interrupting the Command Ship jams its wings', async () => {
  const [{ Flight }] = await load;
  const f = new Flight(context());
  const command = f.addEnemy({ kind:'relay', lane:.5, group:1 });
  const wings = [.25,.75].map((lane) => f.addEnemy({ kind:'scout', lane, group:1 }));
  for (const enemy of [command, ...wings]) Object.assign(enemy, { y:180, fireTimer:4 });
  f.player.x = 165;
  f.player.y = 590;
  command.fireTimer = .81;
  f.moveEnemies(step);
  assert.deepEqual(command.volleyTarget, { x:165, y:590 });
  f.player.x = 340;
  command.fireTimer = 0;
  f.moveEnemies(step);
  assert.equal(command.volleyTarget, null);
  const landing = f.hostile.map((s) => Math.round(s.x + s.vx * (590 - s.y) / s.vy)).sort((a,b) => a - b);
  assert.deepEqual(landing, [139,165,191]);
  assert.ok(landing.every((lane) => Math.abs(lane - f.player.x) > 100), 'moving off the locked lanes avoids the volley');
  f.hostile.length = 0;
  command.fireTimer = .3;
  f.hitEnemy(command, { strength:100, x:command.x, y:command.y });
  assert.equal(f.breaks, 1);
  assert.ok(wings.every((wing) => wing.jam > 3));
  f.moveEnemies(step);
  assert.equal(f.hostile.length, 0);
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

test('Ghost Shift spends earned charge and phases through physical danger without consuming the Shield', async () => {
  const [{ Flight }, , { GHOST }] = await load;
  const f = new Flight(context());
  const p = f.player;
  p.ghostEnergy = GHOST.cost - 12;
  assert.equal(f.activateGhost(), false);
  p.guard = 0;
  f.collect({ kind:'barrier' });
  for (let i = 0; i < 4; i++) f.scoreKill(100);
  assert.equal(p.ghostEnergy, GHOST.cost);
  assert.equal(f.activateGhost(), true);
  assert.equal(p.ghostEnergy, 0);
  assert.equal(f.damage(p.x, p.y), false);
  assert.equal(p.barrier, 1);
  for (let i = 0; i < 50; i++) { f.scoreKill(100); f.earnGhost(5, true); }
  assert.equal(p.ghostEnergy, 0);
  while (p.ghostTime) f.movePilot(step);
  assert.equal(p.realm, 'physical');
  assert.equal(f.damage(p.x, p.y), true);
  assert.equal(p.barrier, 0);
  assert.equal(p.barrierTime, 0);
  f.earnGhost(500);
  assert.equal(p.ghostEnergy, GHOST.capacity);
  assert.equal(f.activateGhost(), false);
  while (p.ghostRecovery) f.movePilot(step);
  assert.equal(f.activateGhost(), true);
  assert.equal(new Flight(context()).player.ghostEnergy, GHOST.start);
});

test('ordinary charge starts full and recharges at three per second while practice controls its charge', async () => {
  const [{ Flight }, , { GHOST }] = await load;
  const f = new Flight(context());
  const p = f.player;
  assert.equal(p.ghostEnergy, GHOST.capacity);
  assert.equal(f.activateGhost(), true);
  const afterShift = p.ghostEnergy;
  f.movePilot(GHOST.duration);
  assert.equal(p.ghostEnergy, afterShift);
  f.movePilot(2);
  assert.equal(p.ghostEnergy, afterShift + 6);
  for (let i = 0; i < 60; i++) f.movePilot(step);
  assert.ok(Math.abs(p.ghostEnergy - afterShift - 9) < 1e-8);
  f.movePilot(50);
  assert.equal(p.ghostEnergy, GHOST.capacity);
  f.practice = true;
  p.ghostEnergy = 0;
  f.movePilot(2);
  assert.equal(p.ghostEnergy, 0);
});

test('Ion Burst clears local physical shots and leaves other threats and rewards intact', async () => {
  const [{ Flight }, , { GHOST, SPECIALS }] = await load;
  const { launchBoss } = await import('../arcade/bosses.mjs');
  const f = new Flight({ ...context(2), special:'ion' });
  const p = f.player;
  const { radius, cost, recovery } = SPECIALS.ion;
  f.projectile(p.x + radius, p.y, 0, 0);
  f.projectile(p.x, p.y - 24, 0, 0, 'lance');
  f.projectile(p.x + radius + 1, p.y, 0, 0);
  f.projectile(p.x, p.y, 0, 0, 'rock');
  f.projectile(p.x, p.y, 0, 0, 'specter', { realm:'ghost' });
  const preserved = f.hostile.slice(-3);
  const hazard = { type:'rail' };
  f.hazards.push(hazard);
  p.guard = 0;
  assert.equal(f.ghostCost, cost);
  assert.equal(f.activateGhost(), true);
  assert.deepEqual(f.hostile, preserved);
  assert.deepEqual(f.hazards, [hazard]);
  assert.equal(p.ghostEnergy, GHOST.start - cost);
  assert.equal(p.ghostRecovery, recovery);
  assert.equal(p.ghostTime, 0);
  assert.equal(p.realm, 'physical');
  assert.equal(p.guard, 0);
  assert.equal(f.score, 0);
  assert.equal(f.kills, 0);
  assert.deepEqual(f.takeEvents(), [{ type:'ionBurst', x:p.x, y:p.y, detail:{ radius, cleared:2 } }]);
  assert.equal(f.activateGhost(), false);
  f.movePilot(recovery);
  assert.equal(f.shiftReady, true);
  launchBoss(f, 'wraith');
  assert.equal(f.ghostCost, GHOST.hop);
  assert.equal(f.activateGhost(), true);
  assert.equal(p.realm, 'ghost');
  assert.equal(f.takeEvents().filter((event) => event.type === 'ionBurst').length, 0);
  assert.equal(f.special, 'ion');
});

test('Shield refreshes one hit and expires when active flight time runs out', async () => {
  const [{ Flight }, , { PICKUPS }] = await load;
  const f = new Flight(context());
  const pilot = f.player;
  f.collect({ kind:'barrier' });
  assert.equal(pilot.barrier, 1);
  assert.equal(pilot.barrierTime, PICKUPS.barrier.duration);
  f.movePilot(PICKUPS.barrier.duration / 2);
  assert.equal(pilot.barrier, 1);
  assert.equal(pilot.barrierTime, PICKUPS.barrier.duration / 2);
  f.collect({ kind:'barrier' });
  assert.equal(pilot.barrier, 1);
  assert.equal(pilot.barrierTime, PICKUPS.barrier.duration);
  f.movePilot(PICKUPS.barrier.duration);
  assert.equal(pilot.barrier, 0);
  assert.equal(pilot.barrierTime, 0);
  assert.equal(f.damage(pilot.x, pilot.y), true);
  assert.equal(pilot.hull, pilot.maxHull - 1);
});

test('interactive practice uses authored encounters without scheduling Arcade waves or supplies', async () => {
  const [{ Flight }] = await load;
  const f = new Flight(context());
  f.practice = true;
  f.elapsed = f.stage.bossAt + 1;
  f.updateSchedule();
  assert.deepEqual(f.spawns, []);
  assert.deepEqual(f.pickups, []);
  assert.equal(f.boss, null);
  assert.equal(f.cruiser, null);
});

test('Wraith realm hops alternate actual vulnerability and a charged volley keeps its telegraphed target', async () => {
  const [{ Flight }, , { GHOST }] = await load;
  const { launchBoss } = await import('../arcade/bosses.mjs');
  const { advanceWraith, WRAITH_ARMOR } = await import('../arcade/wraith.mjs');
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
  for (const realm of ['physical', 'ghost']) {
    b.realm = realm;
    f.takeEvents();
    for (const [dx, dy] of WRAITH_ARMOR) {
      const wing = { ...hit, realm, x:b.x + dx, px:b.x + dx, y:b.y + dy };
      assert.equal(f.hitBoss(wing), true);
      assert.equal(f.hitBoss({ ...wing, realm:realm === 'physical' ? 'ghost' : 'physical' }), false);
    }
    assert.equal(b.hull, b.spec.hull - 4);
    assert.deepEqual(f.takeEvents().map((event) => event.type), WRAITH_ARMOR.map(() => 'shieldHit'));
  }
});

test('a returning Outer Orbit pilot keeps the original mastery and earns Wraith mastery separately', async () => {
  const [, { newPilot, beginRun, settleRun }] = await load;
  const pilot = newPilot();
  for (const stage of [1, 2, 3, 4, 5]) pilot.clears[stage] = 1;
  pilot.mastery[5] = true;
  const run = beginRun(pilot, 'fresh-wraith', 'arcade', 5);
  const result = settleRun(pilot, run.id, { status:'clear', score:5000, duration:190, kills:18, mastery:true });
  assert.equal(result.first, false);
  assert.equal(result.award, 124);
  assert.equal(result.mastery, true);
  assert.deepEqual(pilot.mastery, { 5:true, wraith:true });
});

test('ordinary flight, the crossing cruiser and bosses share the same arena boundaries', async () => {
  const [{ Flight, bounds }, , { WIDTH }] = await load;
  const { launchBoss, operatorWarnings } = await import('../arcade/bosses.mjs');
  const { markWall } = await import('../arcade/boss-patterns.mjs');
  const { launchCruiser } = await import('../arcade/cruiser.mjs');
  const f = new Flight(context());
  assert.deepEqual(f.movementBounds, bounds);
  launchCruiser(f);
  const craft = f.cruiser;
  craft.x = 190;
  const [left, right] = craft.parts;
  const partX = craft.x + left.dx;
  const partY = craft.y + left.dy;
  f.friendly.push({ x:partX, y:partY + 53, px:partX, py:partY + 53, vx:0, vy:-685, strength:15, live:true });
  for (let i = 0; i < 8; i++) f.moveProjectiles(step);
  assert.ok(left.hull <= 0 && right.hull === 14);
  assert.equal(f.status, 'active');
  assert.deepEqual(f.movementBounds, bounds);
  f.cruiser = null;
  launchBoss(f, 'warden');
  for (let i = 0; i < 60; i++) {
    f.drag(-400, 400);
    f.movePilot(step);
  }
  assert.equal(f.player.x, bounds.left);
  assert.equal(f.player.y, bounds.bottom);
  markWall(f, 2);
  const seam = f.hazards[0];
  operatorWarnings(f, seam.windup);
  assert.ok(f.hostile.some((s) => s.kind === 'rock' && s.x <= bounds.left + 2));
  assert.ok(f.hostile.some((s) => s.kind === 'rock' && s.x >= WIDTH - bounds.left - 2));
  assert.ok(f.hostile.every((s) => Math.abs(seam.x - s.x) > seam.width / 2 + 11));
  launchBoss(f, 'wraith');
  assert.equal(f.activateGhost(), true);
  assert.deepEqual(f.movementBounds, bounds);
});

test('a surviving fighter visibly banks, climbs fast, and returns at most twice with its hull intact', async () => {
  const [{ Flight }, , { HEIGHT, WIDTH }] = await load;
  const f = new Flight(context());
  const enemy = f.addEnemy({ kind:'scout', lane:.2 });
  for (let count = 1; count <= 2; count++) {
    const previousLane = enemy.home;
    Object.assign(enemy, { y:HEIGHT - enemy.spec.size * .5, age:9, hull:1.25 });
    f.moveEnemies(step);
    assert.equal(enemy.returnCount, count);
    assert.ok(enemy.loop?.fromY < HEIGHT, 'bank starts where the ship is still visible');
    for (let i = 0; i < 40; i++) f.moveEnemies(step);
    assert.ok(enemy.y > 0 && enemy.y < HEIGHT && Math.abs(enemy.turn) > 3);
    const before = enemy.y;
    f.moveEnemies(step);
    assert.ok(Math.abs((before - enemy.y) / step - 620) < .01);
    assert.equal(f.kills, 0);
    assert.equal(f.hostile.length, 0);
    for (let i = 0; i < 80 && enemy.loop; i++) f.moveEnemies(step);
    assert.equal(enemy.returned, true);
    assert.equal(enemy.loop, null);
    assert.equal(enemy.hull, 1.25);
    assert.ok(Math.abs(enemy.home - previousLane) >= WIDTH / 4);
  }
  Object.assign(enemy, { y:HEIGHT + 42, age:9 });
  f.step(step);
  assert.equal(f.enemies.includes(enemy), false);
  assert.equal(f.kills, 0);
  assert.equal(f.score, 0);
});

test('only three eligible fighters can return at once and a set piece clears the returning lane', async () => {
  const [{ Flight }, , { HEIGHT }] = await load;
  const f = new Flight(context());
  for (const [index, kind] of ['scout','diver','scout','diver','scout','lancer'].entries()) {
    const e = f.addEnemy({ kind, lane:.13 + index * .14 });
    e.y = HEIGHT - 10;
  }
  f.moveEnemies(step);
  assert.equal(f.enemies.filter((e) => e.loop).length, 3);
  assert.ok(f.enemies.some((e) => e.kind === 'diver' && e.loop));
  assert.equal(f.enemies.find((e) => e.kind === 'lancer').loop, null);
  const { launchCruiser } = await import('../arcade/cruiser.mjs');
  launchCruiser(f);
  assert.ok(f.enemies.filter((e) => e.loop).every((e) => e.retreat));
  f.moveEnemies(step);
  assert.equal(f.enemies.filter((e) => e.loop && !e.retreat).length, 0);
});

test('Scouts close space quickly while a Diver can be baited during its warning', async () => {
  const [{ Flight }] = await load;
  const { diveWarningAt } = await import('../arcade/enemy-course.mjs');
  const f = new Flight(context());
  f.addEnemy({ kind:'scout', lane:.1 });
  f.addEnemy({ kind:'diver', lane:.3 });
  const [scout, diver] = f.enemies;
  f.player.x = 350;
  for (let i = 0; i < 60; i++) f.moveEnemies(step);
  assert.ok(scout.y > 125, 'travel more than 157 units in the first second');
  while (diver.age < diveWarningAt + step) f.moveEnemies(step);
  assert.equal(diver.dive, false);
  f.player.x = 20;
  while (!diver.dive && diver.age < 3) f.moveEnemies(step);
  assert.equal(diver.dive, true);
  assert.ok(diver.vector < Math.PI / 2, 'locked its dive toward the original right-side pilot');
});

test('overlapping ships give one another space and hostile projectiles never deal friendly fire', async () => {
  const [{ Flight }] = await load;
  const f = new Flight(context());
  for (let i = 0; i < 2; i++) f.addEnemy({ kind:'scout', lane:.5 });
  const [first, second] = f.enemies;
  for (const enemy of [first, second]) {
    Object.assign(enemy, { y:160, pace:1, fireTimer:99 });
  }
  for (let i = 0; i < 18; i++) {
    const previous = first.x;
    f.moveEnemies(step);
    assert.ok(Math.abs(first.x - previous) < 3, 'separation is steered without a teleport');
  }
  assert.ok(Math.abs(first.x - second.x) > 17, 'ships no longer share one silhouette');
  f.player.x = first.x;
  first.turn = 0;
  second.x = first.x;
  second.y = first.y + 45;
  f.enemyFire(first);
  assert.equal(f.hostile.length, 0, 'a Scout holds its shot through a wingmate');
  second.x += 38;
  f.enemyFire(first);
  assert.equal(f.hostile.length, 1);
  f.hostile.length = 0;
  f.projectile(first.x, first.y - 25, Math.PI / 2, 180, 'bolt');
  const hostile = f.hostile[0];
  f.moveProjectiles(.3);
  assert.ok(hostile.y > first.y + 20);
  assert.equal(hostile.live, true);
  assert.equal(first.hull, first.spec.hull);
  assert.equal(second.hull, second.spec.hull);
});

test('a Splitter releases one pair of telegraphed Shards with one volley each', async () => {
  const [{ Flight }] = await load;
  const { shardArmTime } = await import('../arcade/enemy-course.mjs');
  const f = new Flight(context(2));
  f.addEnemy({ kind:'splitter', lane:.5 });
  const body = f.enemies[0];
  body.y = 225;
  f.hitEnemy(body, { strength:100, x:body.x, y:body.y });
  f.hitEnemy(body, { strength:100, x:body.x, y:body.y });
  const shards = f.enemies.filter((e) => e.kind === 'shard');
  assert.equal(shards.length, 2);
  assert.equal(f.kills, 1);
  assert.ok(shards[0].x < body.x && shards[1].x > body.x);
  for (let i = 0; i < Math.floor(shardArmTime / step) - 1; i++) f.moveEnemies(step);
  assert.equal(f.hostile.length, 0);
  assert.ok(shards.every((e) => e.y < body.y + 56));
  for (let i = 0; i < 95; i++) f.moveEnemies(step);
  assert.ok(shards.every((e) => e.volley === 1));
  assert.equal(f.hostile.length, 2);
  f.hitEnemy(shards[0], { strength:100, x:shards[0].x, y:shards[0].y });
  assert.equal(f.enemies.filter((e) => e.kind === 'shard').length, 2);
  assert.equal(f.kills, 2);
});

test('the opening Multi-Shot comes from a destroyed wing or one later marked carrier', async () => {
  const [{ Flight }] = await load;
  for (const clearWing of ['early','marked','late-wing']) {
    const f = new Flight(context());
    f.queue('arrow', false, 'opening');
    f.elapsed = 2;
    f.moveEnemies(step);
    const opening = [...f.enemies];
    assert.ok(opening.every((enemy) => enemy.returns));
    const destroy = (e) => f.hitEnemy(e, { strength:100, x:e.x, y:e.y });
    opening.forEach((e) => { e.y = 105; });
    if (clearWing === 'early') opening.forEach(destroy);
    assert.equal(f.pickups.length, Number(clearWing === 'early'));
    f.elapsed = 14.01;
    f.updateSchedule();
    const carrier = f.addEnemy({ kind:'diver', lane:.68 });
    carrier.y = 151;
    f.assignSupplies();
    assert.equal(f.pickups.length, Number(clearWing === 'early'), 'schedule must not drop supply in midair');
    assert.equal(carrier.carrying, clearWing === 'early' ? undefined : 'power');
    if (clearWing === 'late-wing') {
      opening.forEach(destroy);
      assert.equal(carrier.carrying, null);
    }
    destroy(carrier);
    assert.deepEqual(f.pickups.map((drop) => drop.kind), ['power']);
    const source = clearWing === 'marked' ? carrier : opening.at(-1);
    assert.deepEqual({ x:f.pickups[0].x, y:f.pickups[0].y }, { x:source.x, y:source.y });
  }
});

test('Arcade and Endless supplies transfer from missed carriers and drop at a real defeat', async () => {
  const [{ Flight }, , { HEIGHT }] = await load;
  for (const mode of ['arcade','endless']) {
    const f = new Flight({ ...context(2), mode, stage:mode === 'endless' ? null : 2 });
    if (mode === 'arcade') f.elapsed = 16.1;
    else { f.elapsed = 21; f.endlessWave = 3; }
    f.updateSchedule();
    const first = f.addEnemy({ kind:'lancer', lane:.38 });
    first.y = 230;
    f.assignSupplies();
    assert.equal(first.carrying, 'power');
    assert.equal(f.pickups.length, 0);
    first.y = HEIGHT + 35;
    const second = f.addEnemy({ kind:'scout', lane:.49 });
    second.y = 211;
    f.assignSupplies();
    assert.equal(first.carrying, null);
    assert.equal(second.carrying, 'power');
    const shot = { strength:100, x:second.x, y:second.y };
    f.hitEnemy(second, shot);
    f.hitEnemy(second, shot);
    assert.deepEqual(f.pickups.map(({kind,x,y}) => ({kind,x,y})), [{ kind:'power', x:second.x, y:second.y }]);
    assert.equal(f.supplies.length, 0);
  }
});

test('fast beams hit rotated bodies, clear empty margins, and ignore an aircraft on its return path', async () => {
  const [{ Flight }] = await load;
  const f = new Flight(context());
  f.addEnemy({ kind:'scout', lane:.5 });
  const target = f.enemies[0];
  Object.assign(target, { y:308, turn:.8, px:197, py:305 });
  const shoot = (x) => {
    f.friendly.push({ x, y:364, vx:0, vy:-6500, live:true, strength:1 });
    f.moveProjectiles(step);
  };
  const hp = target.hull;
  shoot(target.x + 27);
  assert.equal(target.hull, hp);
  shoot(target.x);
  assert.equal(target.hull, hp - 1);
  target.loop = {};
  shoot(target.x);
  assert.equal(target.hull, hp - 1);
});

test('a fast lance hits the center of each banked pilot and clears their wing tips in either realm', async () => {
  const [{ Flight }] = await load;
  for (const ship of ['kestrel', 'needle', 'bastion']) {
    const f = new Flight({ ...context(), ship });
    const p = f.player;
    Object.assign(p, { guard:0, bank:.22, px:p.x - 6, py:p.y });
    const launch = (dx, realm) => {
      f.hostile.length = 0;
      f.projectile(p.x + dx, p.y - 60, Math.PI / 2, 7000, 'lance', { realm });
      f.moveProjectiles(step);
    };
    launch(20, 'physical');
    assert.equal(p.hull, p.maxHull, ship);
    p.realm = 'ghost';
    launch(-3, 'physical');
    assert.equal(p.hull, p.maxHull, ship);
    launch(-3, 'ghost');
    assert.equal(p.hull, p.maxHull - 1, ship);
  }
});

test('the seed controls return lanes and the replay verifier rebuilds the score from inputs', async () => {
  const [{ Flight, bounds }, , { RULES_VERSION }] = await load;
  const { captureReplay, verifyReplay } = await import('../arcade/replay.mjs');
  const seed = '4288578730338ed3aecc03a02e15645c';
  const lanes = (value) => {
    const f = new Flight({ ...context(), seed:value });
    for (let i = 0; i < 10; i++) {
      f.addEnemy({ kind:'scout', lane:.34 });
      f.startReturn(f.enemies.at(-1));
    }
    return f.enemies.map((enemy) => enemy.loop.entryX);
  };
  assert.deepEqual(lanes(seed), lanes(seed));
  assert.notDeepEqual(lanes(seed), lanes('264d04d251dd434a82254d6a3f5409eb'));

  const run = { ...context(), seed, rules:RULES_VERSION, special:'ion' };
  const capture = captureReplay(run);
  const f = new Flight(run, { recordInput:capture.recordInput });
  while (f.status === 'active' && f.elapsed < 250) {
    if (f.ticks % 5 === 0) {
      const desired = chooseFlightPath(f, bounds);
      f.drag(desired.x - f.xIntent, desired.y - f.yIntent);
    }
    if (f.ticks === 900) assert.equal(f.resumeProtection(), true);
    if (f.ticks === 901) assert.equal(f.resumeProtection(), false);
    if (f.ticks > 400 && f.ticks % 180 === 0 && f.shiftReady) f.activateGhost();
    f.step(step);
    f.takeEvents();
  }
  assert.equal(f.status, 'clear');
  const replay = JSON.parse(JSON.stringify(capture.finish(f.ticks, f.terminal())));
  assert.ok(replay.commands.length < f.ticks);
  const start = performance.now();
  const checked = verifyReplay(replay);
  console.log(`Replay ${JSON.stringify(replay).length} bytes verified in ${Math.round(performance.now() - start)} ms`);
  assert.equal(checked.valid, true, JSON.stringify(checked));
  assert.equal(checked.result.score, f.score);
  assert.equal(checked.board, `${RULES_VERSION}/arcade/1/kestrel/stock/ion`);
  assert.equal(verifyReplay({ ...replay, run:{ ...replay.run, special:'unknown' } }).valid, false);
  assert.equal(verifyReplay({ ...replay, run:{ ...replay.run, special:['ion'] } }).valid, false);
  assert.equal(verifyReplay({ ...replay, result:{ ...replay.result, score:f.score + 1 } }).valid, false);
  const [, x, y] = replay.commands[0];
  replay.commands[0][3] = 1;
  const replace = replay.commands[1]?.[0] === 1 ? 1 : 0;
  replay.commands.splice(1, replace, [1, x, y, 1]);
  assert.match(verifyReplay(replay).reason, /Special was unavailable/);
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
