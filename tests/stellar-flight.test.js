const assert = require('node:assert/strict');
const test = require('node:test');
const { chooseFlightPath } = require('../scripts/stellar-qa-pilot.js');
require('../src/00-runtime.js');
require('../src/00-gameplay-rules.js');
require('../src/00-asset-manifest.js');

const load = Promise.all(['flight', 'pilot', 'catalog', 'bosses'].map((name) => import(`../arcade/${name}.mjs`)));
const step = 1 / 60;

function context(which = 1, equipment = []) {
  return { id: 'test-flight', mode: 'arcade', stage: which, ship: 'kestrel', rules: 'arcade-11', equipment, assistance: {} };
}

test('stock and fully upgraded Fighter can clear every arcade-11 route', async () => {
  const [{ Flight, bounds }, , { legacyStageById }] = await load;
  for (const stage of Array.from({ length: 6 }, (_, index) => legacyStageById(index + 1))) {
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

test('each earned ship can beat arcade-11 Wraith and Crown with its stock loadout', async () => {
  const [{ Flight, bounds }, , { legacyStageById }] = await load;
  for (const stage of [legacyStageById(5), legacyStageById(6)]) {
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
  const [opening, pursuit] = STAGES;
  assert.equal(pilot.hasStage(p, opening.id), true);
  assert.equal(pilot.hasStage(p, pursuit.id), false);
  assert.equal(pilot.install(p, 'damage'), false);
  assert.equal(pilot.equip(p, 'needle'), false);
  assert.equal(pilot.beginRun(p, 'early', 'arcade', pursuit.id), null);
  const result = { status:'clear', score:9410, duration:438, kills:78, breaks:2, movement:2460 };
  const entry = pilot.beginRun(p, 'first', 'arcade', opening.id);
  assert.deepEqual(entry.tiers, { damage:0, rate:0, thrusters:0, energy:0 });
  const first = pilot.settleRun(p, 'first', result);
  assert.equal(first.award, opening.first);
  assert.equal(first.breaks, 2);
  assert.equal(first.newStage, pursuit.id);
  assert.equal(pilot.settleRun(p, 'first', result), first);
  assert.equal(p.salvage, opening.first);
  assert.ok(pilot.install(p, 'damage'));
  assert.equal(p.salvage, opening.first - 20);
  pilot.beginRun(p, 'repeat', 'arcade', opening.id);
  assert.equal(pilot.settleRun(p, 'repeat', result).award, Math.round(.62 * opening.first));
  pilot.beginRun(p, 'ongoing', 'arcade', opening.id);
  pilot.abandonRun(p, 'ongoing');
  assert.equal(pilot.settleRun(p, 'ongoing', result), null);
  for (const stage of STAGES.slice(1)) {
    const run = pilot.beginRun(p, `clear-${stage.id}`, 'arcade', stage.id);
    pilot.settleRun(p, run.id, result);
  }
  const balance = p.salvage;
  pilot.beginRun(p, 'survival', 'endless');
  const s = pilot.settleRun(p, 'survival', { ...result, status:'defeat' });
  assert.equal(s.award, 0);
  assert.ok(s.xpAward > 0);
  assert.equal(s.ship, 'kestrel');
  assert.equal(p.records.endless.duration, result.duration);
  assert.equal(p.salvage, balance);
});

test('Ion Burst unlocks at Asteroid Belt and freezes in each attempt and result', async () => {
  const [, pilot, { STAGES }] = await load;
  const p = pilot.newPilot();
  delete p.special;
  assert.equal(pilot.beginRun(p, 'opening', 'arcade', STAGES[0].id).special, 'ghost');
  assert.equal(pilot.equipSpecial(p, 'ion'), false);
  assert.equal(pilot.equipSpecial(p, 'constructor'), false);
  const terminal = { status:'clear', score:2500, duration:460, kills:28 };
  assert.equal(pilot.settleRun(p, 'opening', terminal).newSpecial, null);
  pilot.beginRun(p, 'pursuit', 'arcade', STAGES[1].id);
  assert.equal(pilot.settleRun(p, 'pursuit', terminal).newSpecial, null);
  pilot.beginRun(p, 'belt', 'arcade', STAGES[2].id);
  assert.equal(pilot.settleRun(p, 'belt', terminal).newSpecial, 'ion');
  assert.equal(pilot.equipSpecial(p, 'ion'), true);
  assert.equal(pilot.beginRun(p, 'repeat', 'arcade', 1).special, 'ion');
  assert.equal(pilot.equipSpecial(p, 'ghost'), true);
  const receipt = pilot.settleRun(p, 'repeat', { ...terminal, score:3500 });
  assert.equal(receipt.special, 'ion');
  assert.equal(p.records.arcade[1].special, 'ion');
  assert.equal(receipt.newSpecial, null);
  delete p.special;
  assert.equal(pilot.hasSpecial(p, 'ion'), true);
  assert.equal(pilot.beginRun(p, 'saved', 'arcade', STAGES[2].id).special, 'ghost');
});

test('free clear progression earns both ships and keeps a previously earned Gunship', async () => {
  const [, pilot, { STAGES }] = await load;
  const progress = pilot.newPilot();
  const terminal = { status:'clear', score:2500, duration:170, kills:28 };
  const clear = (stage, id = String(stage)) => {
    assert.ok(pilot.beginRun(progress, id, 'arcade', stage));
    return pilot.settleRun(progress, id, terminal);
  };
  assert.equal(pilot.hasShip(progress, 'kestrel'), true);
  assert.equal(pilot.hasShip(progress, 'bastion'), false);
  assert.equal(clear(STAGES[0].id).newShip, null);
  assert.equal(clear(STAGES[1].id).newShip, null);
  const belt = clear(STAGES[2].id);
  assert.equal(belt.newShip, 'needle');
  assert.equal(belt.newSpecial, 'ion');
  assert.equal(pilot.hasShip(progress, 'bastion'), false);
  assert.equal(clear(STAGES[3].id).newShip, null);
  assert.equal(clear(STAGES[4].id).newShip, 'bastion');
  assert.equal(clear(STAGES[4].id, 'repeat').newShip, null);
  assert.ok(pilot.equip(progress, 'bastion'));
  assert.equal(pilot.beginRun(progress, 'relay-again', 'arcade', STAGES[4].id).ship, 'bastion');

  const existing = pilot.migratePilot({ schema:1, clears:{ 4:1 }, ship:'bastion' });
  assert.ok(pilot.equip(existing, 'bastion'));
});

test('old settled receipts stay idempotent and interrupted flights cannot mint cross-rules payouts', async () => {
  const [, pilot] = await load;
  const saved = { schema:1, salvage:31, receipts:{ old:{ award:31 } }, active:{ running:{ rules:'arcade-11', stage:1 } } };
  const p = pilot.migratePilot(saved);
  assert.equal(pilot.settleRun(p, 'old', { status:'defeat' }).award, 31);
  assert.equal(pilot.settleRun(p, 'running', { status:'clear' }), null);
  assert.equal(p.salvage, 31);
  assert.equal(p.lifetimeXp, 0);
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
  assert.ok(active.award > 0);
  assert.equal(pilot.settleRun(p, 'active-minute', { status:'defeat' }), active);
  assert.equal(attempt('another-minute', 'defeat', 60, 15, 900).award, active.award);
  assert.equal(p.salvage, 2 * active.award);
  for (const stage of STAGES) {
    p.clears[stage.id] = 1;
    const expectedClearTime = stage.bossAt + 55;
    const clear = attempt(`clear-${stage.id}`, 'clear', expectedClearTime, 50, 3100, stage.id);
    for (const duration of [24, 45, 60, 90, expectedClearTime, expectedClearTime + 90]) {
      const loss = attempt(`defeat-${stage.id}-${duration}`, 'defeat', duration, 70, 100 + duration * 5, stage.id);
      assert.ok(loss.award / duration < clear.award / expectedClearTime, `${stage.name} defeat farming at ${duration}s`);
      assert.ok(loss.award <= clear.award * .6);
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
  markWall(f, 1, { delay:1.25, varied:false });
  operatorWarnings(f, 1.18);
  assert.equal(f.hostile.length, 0);
  operatorWarnings(f, 1.20);
  assert.ok(f.hostile.length > 0);
  assert.ok(f.hostile.every((shot) => Math.abs(shot.x - f.hazards[0].x) >= f.hazards[0].width/2+11));
  const wall = f.hazards[0];
  f.hostile.forEach((shot) => { shot.y += shot.vy * .4; });
  operatorWarnings(f, .4);
  const rows = [...new Set(f.hostile.map((shot) => Math.round(shot.y - wall.rowY)))].sort((a, b) => a - b);
  assert.deepEqual(rows, [0, 44]);
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
  assert.ok(wall.width < 94);
  assert.ok(wall.rocks.every(({ x, y }) => Math.abs(x - wall.x) >= wall.width / 2 + 17.9 && [wall.y, wall.y + 44].includes(y)));

  operatorWarnings(f, wall.windup - .04);
  assert.equal(f.hostile.length, 0);
  operatorWarnings(f, .05);
  assert.deepEqual(f.hostile.map(({ x,y }) => ({ x,y })), wall.rocks.map(({ x,y }) => ({ x,y })));
  assert.ok(new Set(f.hostile.map((rock) => rock.vy)).size >= 3);
  assert.ok(new Set(f.hostile.map((rock) => rock.size).filter(Boolean)).size >= 3);

  boss.x = 193;
  operatorWarnings(f, -second.age + .01);
  assert.equal(second.origin.x, boss.x);
  assert.equal(f.hostile.length, wall.rocks.length);
});

test('the debris seam fits every ship and asteroids stop fire without breaking', async () => {
  const [{ Flight }, , { SHIPS }, { operatorWarnings }] = await load;
  const { markWall } = await import('../arcade/boss-patterns.mjs');
  for (const ship of Object.keys(SHIPS)) {
    const flight = new Flight({ ...context(2), ship });
    markWall(flight, 2, { varied:true });
    const field = flight.hazards[0];
    flight.player.guard = 0;
    flight.player.x = field.x;
    const hull = flight.player.hull;
    operatorWarnings(flight, field.windup);
    const entering = [...flight.hostile];
    assert.deepEqual([...new Set(entering.map((rock) => rock.y))], [-86, -42]);
    for (let tick = 0; tick < 100; tick++) flight.moveProjectiles(step);
    assert.ok(entering.every((rock) => flight.hostile.includes(rock) && rock.y > 0), 'Both rows enter from above');
    for (let tick = 0; tick < 330; tick++) flight.moveProjectiles(step);
    assert.equal(flight.player.hull, hull, `${ship} remains safe through both rows`);
  }

  const flight = new Flight(context(2));
  flight.player.x = 192;
  flight.player.y = 520;
  flight.player.guard = 0;
  const target = flight.addEnemy({ kind:'scout', lane:.5 });
  target.y = 340;
  flight.projectile(192, 420, Math.PI / 2, 80, 'rock', { size:48 });
  const rock = flight.hostile[0];
  flight.projectile(192, 360, Math.PI / 2, 1700, 'bolt');
  flight.friendly.push({ x:192, y:490, vx:0, vy:-1800, strength:20, live:true });
  const hull = flight.player.hull;
  const targetHull = target.hull;
  flight.moveProjectiles(.11);
  assert.deepEqual(flight.hostile, [rock]);
  assert.equal(flight.friendly.length, 0);
  assert.equal(flight.player.hull, hull);
  assert.equal(target.hull, targetHull);
  assert.equal(flight.events.filter((event) => event.type === 'rockHit').length, 2);

  flight.player.y = rock.y;
  flight.moveProjectiles(step);
  assert.equal(flight.player.hull, hull - 1);
  assert.deepEqual(flight.hostile, [rock]);
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
  f.movePilot(f.ghostDuration);
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

test('short Ghost Shift, movement and damage Specials, and one-point repairs follow the current rules', async () => {
  const [{ Flight }, , { PREVIOUS_RULES, RULES_VERSION, SPECIALS }, { launchBoss }] = await load;
  const make = (special, rules = RULES_VERSION) => new Flight({ ...context(), rules, tiers:{}, special });
  const ghost = make('ghost');
  assert.ok(ghost.ghostDuration < make('ghost', PREVIOUS_RULES).ghostDuration);
  const original = ghost.player.x;
  ghost.setDirection(1, 0);
  ghost.activateGhost();
  ghost.movePilot(step);
  assert.ok(Math.abs(ghost.player.x - original - ghost.ship.speed * ghost.stats.speed * step) < .04);
  ghost.player.hull = 2;
  ghost.collect({ kind:'repair' });
  assert.equal(ghost.player.hull, 3);

  const boosted = make('afterburner');
  boosted.setDirection(1, 0);
  assert.equal(boosted.activateGhost(), true);
  boosted.movePilot(step);
  assert.ok(Math.abs(boosted.player.x - original - boosted.ship.speed * boosted.stats.speed * SPECIALS.afterburner.speed * step) < .04);
  assert.equal(boosted.player.realm, 'physical');
  assert.equal(boosted.activateGhost(), false);

  const charged = make('overcharge');
  assert.equal(charged.activateGhost(), true);
  charged.shoot(.25);
  assert.equal(charged.friendly[0].strength, charged.ship.guns[0][3] * charged.stats.damage * SPECIALS.overcharge.damage);
  launchBoss(charged, 'wraith');
  assert.equal(charged.player.specialTime, 0);
  assert.equal(charged.activateGhost(), true);
  assert.equal(charged.player.realm, 'ghost');
});

test('a Phantom fades briefly and only shots in its current realm can damage it', async () => {
  const [{ Flight }, , { RULES_VERSION }] = await load;
  const f = new Flight({ ...context(), rules:RULES_VERSION, tiers:{} });
  const e = f.addEnemy({ kind:'phantom', lane:.33 });
  Object.assign(e, { x:150, y:240, age:2.4, pace:0, fireTimer:Infinity });
  f.moveEnemies(step);
  assert.equal(e.phaseCue, true);
  assert.equal(e.realm, 'physical');
  e.age = 3;
  f.moveEnemies(step);
  assert.equal(e.realm, 'ghost');
  const fire = (realm) => {
    f.friendly = [{ x:e.x, y:e.y + 24, vx:0, vy:-690, strength:2, live:true, realm }];
    f.moveProjectiles(.05);
  };
  const hull = e.hull;
  fire('physical');
  assert.equal(e.hull, hull);
  fire('ghost');
  assert.equal(e.hull, hull - 2);
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

test('Ghost Shift practice requires phasing through the shot and safely repeats a miss', async () => {
  const [{ Flight }, , { GHOST }] = await load;
  const { advanceTraining, startTraining } = await import('../arcade/training.mjs');
  const f = new Flight(context());
  const training = startTraining(f);
  f.player.x += 44;
  f.reanchor();
  advanceTraining(f, training, []);
  advanceTraining(f, training, [{ type:'enemyDown' }]);
  const tick = () => {
    f.step(step);
    advanceTraining(f, training, f.takeEvents());
  };
  const advanceUntil = (check) => {
    for (let i = 0; i < 240 && !check(); i++) tick();
    assert.ok(check(), 'expected a training milestone within four seconds');
  };

  assert.equal(f.activateGhost(), true);
  tick();
  assert.equal(training.step, 'shift', 'pressing Shift before the bolt reaches the cockpit cannot pass');
  advanceUntil(() => f.notice.title === 'Try again');
  assert.equal(f.player.hull, f.player.maxHull);

  advanceUntil(() => f.notice.title === 'Shift now');
  assert.ok(f.player.ghostEnergy >= GHOST.cost);
  assert.equal(f.activateGhost(), true);
  tick();
  assert.equal(training.step, 'shift', 'even a successful activation must wait for the shot to cross');
  advanceUntil(() => training.step === 'complete');
  assert.equal(f.player.hull, f.player.maxHull);
  assert.ok(f.player.ghostTime > 0);
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

test('migration keeps original Outer Orbit mastery and awards new Wraith mastery separately', async () => {
  const [, { migratePilot, beginRun, settleRun }, { stageById }] = await load;
  const pilot = migratePilot({ schema:1, clears:{ 1:1, 2:1, 3:1, 4:1, 5:1 }, mastery:{ 5:true, wraith:true } });
  const wraith = stageById(5);
  const run = beginRun(pilot, 'fresh-wraith', 'arcade', 5);
  const result = settleRun(pilot, run.id, { status:'clear', score:5000, duration:480, kills:68, mastery:true });
  assert.equal(result.first, false);
  assert.equal(result.award, Math.round(.62 * wraith.first));
  assert.equal(result.mastery, true);
  assert.deepEqual(pilot.mastery, { [wraith.mastery.key ?? wraith.id]:true });
  assert.deepEqual(pilot.legacy.mastery, { 5:true, wraith:true });
});

test('ordinary flight, cruisers and bosses share the same arena boundaries', async () => {
  const [{ Flight, bounds }, , { WIDTH }] = await load;
  const { launchBoss, operatorWarnings } = await import('../arcade/bosses.mjs');
  const { markWall } = await import('../arcade/boss-patterns.mjs');
  const { launchCruiser } = await import('../arcade/cruiser.mjs');
  const f = new Flight(context());
  assert.deepEqual(f.movementBounds, bounds);
  launchCruiser(f);
  const craft = f.cruiser;
  craft.x = 190;
  craft.y = 196;
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

test('arcade-11 Vesper stages two forward cruiser encounters in offset lanes with lighter patrol guns', async () => {
  const [{ Flight, bounds }, , { WIDTH, HEIGHT }] = await load;
  const f = new Flight({ ...context(), seed:'4288578730338ed3aecc03a02e15645c' });
  f.player.guard = Infinity;
  f.fireTimer = Infinity;
  const visits = [];
  let seen = null;
  while (!f.boss && f.elapsed < f.stage.bossAt + 1) {
    f.step(step);
    const craft = f.cruiser;
    if (craft && craft !== seen) {
      visits.push({ variant:craft.variant, entry:f.elapsed, x:craft.x, y:craft.y,
        turretHull:craft.parts[0].hull, mountCount:craft.parts.length, min:craft.x, max:craft.x });
    }
    if (craft) {
      const visit = visits.at(-1);
      visit.min = Math.min(visit.min, craft.x);
      visit.max = Math.max(visit.max, craft.x);
      visit.lastY = craft.y;
      if (seen === craft) assert.ok(craft.y > craft.py);
    } else if (seen) visits.at(-1).exit = f.elapsed;
    seen = craft;
    f.takeEvents();
  }
  assert.deepEqual(visits.map((visit) => visit.variant), ['patrol','heavy']);
  const [patrol, heavy] = visits;
  assert.ok(Math.abs(patrol.entry - 46) <= step && Math.abs(heavy.entry - 82) <= step);
  assert.ok(patrol.x < WIDTH * .45 && heavy.x > WIDTH * .55);
  assert.ok(patrol.turretHull < heavy.turretHull);
  assert.ok(patrol.exit < heavy.entry - 20 && heavy.exit < f.stage.bossAt - 29);
  for (const visit of visits) {
    assert.ok(visit.y < -100 && visit.lastY > HEIGHT + 100);
    assert.ok(visit.min >= 96 && visit.max <= WIDTH - 96 && visit.max - visit.min < WIDTH * .15);
    assert.equal(visit.mountCount, 2);
  }
  assert.equal(f.boss.kind, 'gatekeeper');
  assert.equal(f.cruiser, null);
  assert.deepEqual(f.movementBounds, bounds);
});

test('fighter return paths stay clear for either scheduled cruiser approach', async () => {
  const [{ Flight }, , { HEIGHT }] = await load;
  const f = new Flight(context());
  const diver = f.addEnemy({ kind:'diver', lane:.31 });
  for (const [index, crossing] of f.stage.cruisers.entries()) {
    f.cruiserIndex = index;
    f.elapsed = crossing.at - 2.95;
    diver.y = HEIGHT + 2;
    f.moveEnemies(step);
    assert.equal(diver.loop, null);
  }
});

test('a surviving fighter rounds the bottom edge and returns at most twice through a different lane', async () => {
  const [{ Flight }, , { HEIGHT, WIDTH }] = await load;
  const f = new Flight(context());
  const enemy = f.addEnemy({ kind:'scout', lane:.2 });
  for (let count = 1; count <= 2; count++) {
    const previousLane = enemy.home;
    Object.assign(enemy, { y:HEIGHT - enemy.spec.size * .5, age:9, hull:1.25 });
    f.moveEnemies(step);
    assert.equal(enemy.loop, null, 'the fighter completes its downward pass');
    while (enemy.y < HEIGHT && !enemy.loop) f.moveEnemies(step);
    f.moveEnemies(step);
    assert.equal(enemy.returnCount, count);
    let edgeTicks = 0;
    let previousX = enemy.x;
    let previousY = enemy.y;
    for (let i = 0; i < 300 && enemy.loop; i++) {
      f.moveEnemies(step);
      const dx = enemy.x - previousX;
      const dy = enemy.y - previousY;
      const distance = Math.hypot(dx, dy);
      assert.ok(distance <= 12, 'the fighter travels continuously through both turns');
      if (enemy.loop && distance > .1) {
        assert.ok((-Math.sin(enemy.turn) * dx + Math.cos(enemy.turn) * dy) / distance > .98,
          'the hull follows the same direction as the visible movement');
      }
      if (enemy.y > 0 && enemy.y < HEIGHT && dy < 0) {
        assert.ok(enemy.x > 19 && enemy.x < WIDTH - 19, 'the target stays visible');
        if (Math.abs(dx) < .1) edgeTicks++;
      }
      previousX = enemy.x;
      previousY = enemy.y;
    }
    assert.ok(edgeTicks >= 85, 'the return lane stays visible long enough to follow');
    assert.equal(f.kills, 0);
    assert.equal(f.hostile.length, 0);
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

test('friendly fire can hit a returning fighter on the visible edge without risking a ram', async () => {
  const [{ Flight }, , { HEIGHT }] = await load;
  const f = new Flight(context());
  const enemy = f.addEnemy({ kind:'scout', lane:.17 });
  enemy.y = HEIGHT + 2;
  f.moveEnemies(step);
  assert.ok(enemy.loop);
  for (let i = 0; i < 100 && enemy.y > HEIGHT - 155; i++) f.moveEnemies(step);
  assert.ok(enemy.loop && enemy.y <= HEIGHT - 155);
  f.xIntent = f.player.x = enemy.x;
  f.yIntent = f.player.y = enemy.y;
  f.player.guard = 0;
  f.step(step);
  assert.equal(f.player.hull, f.player.maxHull);
  f.friendly.push({ x:enemy.x, y:enemy.y + 8, vx:0, vy:-685, strength:10, live:true });
  f.moveProjectiles(step);
  assert.ok(enemy.hull <= 0);
  assert.equal(f.kills, 1);
});

test('only three eligible fighters can return at once and a set piece clears the returning lane', async () => {
  const [{ Flight }, , { HEIGHT }] = await load;
  const f = new Flight(context());
  for (const [index, kind] of ['scout','diver','scout','diver','scout','lancer'].entries()) {
    const e = f.addEnemy({ kind, lane:.13 + index * .14 });
    e.y = HEIGHT + 2;
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

test('an independent Gunner tracks the pilot only during its slow approach', async () => {
  const [{ Flight }] = await load;
  const left = new Flight(context());
  const right = new Flight(context());
  left.player.x = 54;
  right.player.x = 330;
  const a = left.addEnemy({ kind:'lancer', lane:.48 });
  const b = right.addEnemy({ kind:'lancer', lane:.48 });
  const progress = (count) => {
    for (let i = 0; i < count; i++) {
      left.moveEnemies(step);
      right.moveEnemies(step);
    }
  };
  progress(115);
  assert.equal(a.x, b.x);
  progress(100);
  const offset = b.x - a.x;
  assert.ok(offset >= 46 && offset <= 65, 'both ships bank toward their pilot without leaving their lane');
  [left.player.x, right.player.x] = [right.player.x, left.player.x];
  progress(48);
  assert.ok(Math.abs((b.x - a.x) - offset) < .001, 'the tracked lane is held after the approach');
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

test('long Endless attempts keep one unclaimed supply per kind', async () => {
  const [{ Flight }] = await load;
  const f = new Flight({ ...context(), mode:'endless', stage:null });
  f.nextEndlessBoss = Infinity;
  for (let i = 0; i < 48; i++) {
    f.elapsed = f.endlessNext;
    f.updateSchedule();
    f.spawns.length = 0;
  }
  assert.equal(f.supplies.length, 4);
  assert.deepEqual(f.supplies.map((supply) => supply.kind), ['power','barrier','repair','overdrive']);
  assert.deepEqual(f.pickups, []);
});

test('fast beams hit rotated bodies, clear empty margins, and ignore retreating aircraft', async () => {
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
  target.retreat = true;
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

test('a current replay preserves the seed, upgrade tiers and score', async () => {
  const [{ Flight, bounds }, , { RULES_VERSION, STAGES }] = await load;
  const { captureReplay, verifyReplay } = await import('../arcade/replay.mjs');
  const seed = '4288578730338ed3aecc03a02e15645c';
  const stage = STAGES[0];
  const run = { ...context(stage.id), seed, rules:RULES_VERSION, special:'ion', variant:'standard',
    tiers:{ damage:3, rate:2, thrusters:1, energy:4 } };
  const lanes = (value) => {
    const f = new Flight({ ...run, seed:value });
    for (let i = 0; i < 10; i++) {
      f.addEnemy({ kind:'scout', lane:.34 });
      f.startReturn(f.enemies.at(-1));
    }
    return f.enemies.map((enemy) => enemy.loop.entryX);
  };
  assert.deepEqual(lanes(seed), lanes(seed));
  assert.notDeepEqual(lanes(seed), lanes('264d04d251dd434a82254d6a3f5409eb'));

  const capture = captureReplay(run);
  const f = new Flight(run, { recordInput:capture.recordInput });
  while (f.status === 'active' && f.elapsed < stage.bossAt + 120) {
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
  assert.notEqual(f.status, 'active');
  const replay = JSON.parse(JSON.stringify(capture.finish(f.ticks, f.terminal())));
  assert.ok(replay.commands.length < f.ticks);
  const start = performance.now();
  const checked = verifyReplay(replay);
  console.log(`Replay ${JSON.stringify(replay).length} bytes verified in ${Math.round(performance.now() - start)} ms`);
  assert.equal(checked.valid, true, JSON.stringify(checked));
  assert.equal(checked.result.score, f.score);
  assert.equal(checked.board, `${RULES_VERSION}/arcade/${stage.id}/kestrel/3-2-1-4/ion`);
  assert.equal(verifyReplay({ ...replay, run:{ ...replay.run, tiers:{ ...replay.run.tiers, damage:16 } } }).valid, false);
  assert.equal(verifyReplay({ ...replay, run:{ ...replay.run, variant:'hard' } }).valid, false);
  assert.equal(verifyReplay({ ...replay, run:{ ...replay.run, special:'unknown' } }).valid, false);
  assert.equal(verifyReplay({ ...replay, run:{ ...replay.run, special:['ion'] } }).valid, false);
  assert.equal(verifyReplay({ ...replay, result:{ ...replay.result, score:f.score + 1 } }).valid, false);
  const [, x, y] = replay.commands[0];
  replay.commands[0][3] = 1;
  const replace = replay.commands[1]?.[0] === 1 ? 1 : 0;
  replay.commands.splice(1, replace, [1, x, y, 1]);
  assert.match(verifyReplay(replay).reason, /Special was unavailable/);
});

test('an exact build 3 replay retains its four installed legacy upgrades and outcome', async () => {
  const { verifyReplay } = await import('../arcade/replay.mjs');
  // Captured from d864499 with an untouched aim, before the campaign migration.
  const replay = {
    schema:1,
    run:{ seed:'4288578730338ed3aecc03a02e15645c', rules:'arcade-11', mode:'arcade', stage:1,
      ship:'kestrel', equipment:['rails', 'chamber', 'cells', 'hull'], special:'ion' },
    ticks:1408, commands:[[0, 3072, 9830, 0]],
    result:{ status:'defeat', score:2075, kills:15, breaks:0, mastery:false }
  };
  const checked = verifyReplay(replay);
  assert.equal(checked.valid, true, JSON.stringify(checked));
  assert.equal(checked.board, 'arcade-11/arcade/1/kestrel/cells,chamber,hull,rails/ion');
  assert.deepEqual(checked.result, replay.result);
});

test('all current ships keep the five-HP cap after maximum upgrades and repair pickups', async () => {
  const [{ Flight }, , { RULES_VERSION, SHIPS }] = await load;
  for (const [ship, expected] of [['kestrel', 5], ['needle', 4], ['bastion', 5]]) {
    const f = new Flight({ ...context(), rules:RULES_VERSION, ship, tiers:{ damage:15, rate:15, thrusters:15, energy:15 } });
    assert.equal(SHIPS[ship].hull, expected);
    assert.equal(f.player.maxHull, expected);
    f.player.hull = 1;
    for (let i = 0; i < 6; i++) f.collect({ kind:'repair' });
    assert.equal(f.player.hull, expected);
  }
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
