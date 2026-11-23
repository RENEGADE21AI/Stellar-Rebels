const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');
require('../src/00-runtime.js');
require('../src/00-gameplay-rules.js');
require('../src/00-asset-manifest.js');

const load = Promise.all(['flight', 'catalog'].map((name) => import(`../arcade/${name}.mjs`)));
const seeds = Array.from({ length: 12 }, (_, index) =>
  createHash('sha256').update(`route-test-${index}`).digest('hex').slice(0, 32));
const legacyRules = 'arcade-11';

function makeFlight(Flight, stage, seed, mode = 'arcade', rules) {
  return new Flight({ mode, stage, seed, rules, ship:'kestrel', equipment:[], assistance:{} });
}

function lineup(flight) {
  return flight.spawns.splice(0).map(({ kind, lane, at }) => [kind, lane, at - flight.elapsed]);
}

function route(Flight, stage, seed, rules, consumeCombatRandomness = false) {
  const flight = makeFlight(Flight, stage.id, seed, 'arcade', rules);
  return flight.waves.map(([at], index) => {
    if (consumeCombatRandomness) {
      for (let i = 0; i <= index; i++) flight.random();
    }
    flight.elapsed = at;
    flight.updateSchedule();
    return lineup(flight);
  });
}

test('selected Arcade wings can attack from either flank without changing their roster, timing, or scripted neighbors', async () => {
  const [{ Flight }, { RULES_VERSION, SIDE_OPERATIONS, STAGES, legacyStageById }] = await load;
  const historical = Array.from({ length:6 }, (_, index) => legacyStageById(index + 1));
  for (const [stages, rules] of [[historical, legacyRules], [[...STAGES, ...SIDE_OPERATIONS], RULES_VERSION]]) {
    for (const stage of stages) {
      const reference = route(Flight, stage, seeds[0], rules);
      assert.deepEqual(route(Flight, stage, seeds[0], rules, true), reference, `${stage.name} uses an independent route seed`);
      const distinct = seeds.map((seed) => route(Flight, stage, seed, rules));
      const waves = makeFlight(Flight, stage.id, seeds[0], 'arcade', rules).waves;
      const adaptive = waves.filter((beat) => beat[2] === 'flank').length;
      const variableLimit = rules === legacyRules ? 4 : Math.floor(waves.length / 3);
      assert.ok(adaptive >= 2 && adaptive <= variableLimit, `${stage.name} keeps a bounded set of variable beats`);
      waves.forEach((beat, index) => {
        const lineups = distinct.map((result) => result[index]);
        if (beat[2] !== 'flank') {
          assert.ok(lineups.every((wing) => JSON.stringify(wing) === JSON.stringify(reference[index])));
          return;
        }
        assert.equal(new Set(lineups.map(JSON.stringify)).size, 2, `${stage.name} varies the ${beat[1]} at ${beat[0]}s`);
        for (const wing of lineups) {
          assert.deepEqual(wing.map(([kind, , after]) => [kind, after]), reference[index].map(([kind, , after]) => [kind, after]));
          assert.ok(wing.every(([, lane]) => lane >= .10 && lane <= .90));
        }
      });
    }
  }
});

test('arcade-11 Vesper keeps its exact opening beats, cruiser approaches, and Warden start', async () => {
  const [{ Flight }, { legacyStageById }] = await load;
  const vesper = legacyStageById(1);
  assert.deepEqual(vesper.waves[0], [.6, 'arrow', 0, 'opening']);
  assert.deepEqual(vesper.waves[1], [6.4, 'column', 1]);
  assert.equal(vesper.waves.find((beat) => beat[1] === 'spear')[0], 12.5);
  assert.equal(vesper.waves.find((beat) => beat[1] === 'break')[0], 71);
  assert.deepEqual(vesper.cruisers, [{ at:46, variant:'patrol' }, { at:82, variant:'heavy' }]);
  assert.equal(vesper.bossAt, 126);
  const flight = makeFlight(Flight, 1, seeds[0], 'arcade', legacyRules);
  flight.elapsed = vesper.bossAt;
  flight.updateSchedule();
  assert.equal(flight.boss.kind, 'gatekeeper');
});

test('Endless preserves its opening and varies selected later wings independently of combat', async () => {
  const [{ Flight }] = await load;
  const waves = (seed) => {
    const flight = makeFlight(Flight, null, seed, 'endless');
    flight.nextEndlessBoss = Infinity;
    return Array.from({ length: 30 }, () => {
      flight.elapsed = flight.endlessNext;
      flight.updateSchedule();
      return lineup(flight);
    });
  };
  const reference = waves(seeds[0]);
  assert.deepEqual(waves(seeds[0]), reference);
  const candidates = seeds.map(waves);
  assert.ok(candidates.every((route) => JSON.stringify(route.slice(0, 8)) === JSON.stringify(reference.slice(0, 8))));
  assert.ok(candidates.some((route) => JSON.stringify(route.slice(8)) !== JSON.stringify(reference.slice(8))));
  for (const candidate of candidates) {
    assert.deepEqual(candidate.map((wing) => wing.map(([kind, , after]) => [kind, after])),
      reference.map((wing) => wing.map(([kind, , after]) => [kind, after])));
  }
});

test('Endless repeats wings, cruiser bridge, and boss with time for each handoff', async () => {
  const [{ Flight }, { FIXED_TICK }] = await load;
  const flight = makeFlight(Flight, null, seeds[0], 'endless');
  // Keep the pilot alive and let the encounters run until the explicit boss clear.
  flight.fireTimer = 1_000;
  const waves = [];
  const encounters = [];
  const departures = [];
  const cruiserShots = [];
  let clearAt;
  while (flight.elapsed < 180 && flight.endlessBossCount < 2) {
    const previousWave = flight.endlessWave;
    const previousCruiser = flight.cruiser;
    flight.player.guard = 2;
    flight.step(FIXED_TICK);
    const events = flight.takeEvents();
    const crossing = events.some((event) => event.type === 'cruiserEnter');
    if (flight.endlessWave !== previousWave && !crossing) waves.push(flight.elapsed);
    if (previousCruiser && !flight.cruiser) departures.push(flight.elapsed);
    for (const event of events) {
      if (event.type === 'cruiserEnter' || event.type === 'boss') {
        encounters.push({ kind:event.detail, at:flight.elapsed });
      }
      if (event.type === 'cruiserEnter' && event.detail === 'patrol') {
        assert.ok(flight.supplies.some((supply) => supply.kind === 'repair'));
        assert.deepEqual(flight.pickups, []);
      }
      if (event.type === 'bossFire' && flight.cruiser) cruiserShots.push(flight.elapsed);
      if (event.type === 'boss') {
        assert.equal(flight.cruiser, null);
        assert.equal(flight.spawns.length, 0);
        assert.ok(flight.enemies.every((enemy) => enemy.retreat));
        assert.equal(flight.hostile.length, 0);
      }
    }
    if (flight.boss?.kind === 'gatekeeper' && flight.boss.age >= 50) {
      const { x, y } = flight.boss;
      assert.ok(flight.hitBoss({ x, y, strength:1_000 }));
      assert.equal(flight.boss, null);
      clearAt = flight.elapsed;
    }
  }

  assert.deepEqual(encounters.map(({ kind }) => kind), ['patrol', 'Warden', 'heavy', 'Harrow']);
  const [patrol, firstBoss, heavy, secondBoss] = encounters;
  assert.ok(Math.abs(firstBoss.at - 79) <= FIXED_TICK + 1e-8);
  assert.ok(waves.filter((at) => at < patrol.at).length >= 10);
  assert.ok(!waves.some((at) => at >= patrol.at && at < clearAt));
  const recoveryWaves = waves.filter((at) => at > clearAt && at < heavy.at);
  assert.ok(recoveryWaves.length >= 4);
  assert.ok(recoveryWaves[0] - clearAt >= 2.5 - FIXED_TICK);
  assert.ok(secondBoss.at - clearAt >= 44 - FIXED_TICK);
  assert.ok(!waves.some((at) => at >= heavy.at && at <= secondBoss.at));
  assert.equal(departures.length, 2);
  assert.ok(firstBoss.at - departures[0] >= 3.9);
  assert.ok(secondBoss.at - departures[1] >= 3.9);
  assert.ok(cruiserShots.some((at) => at > patrol.at && at < departures[0]));
  assert.ok(cruiserShots.some((at) => at > heavy.at && at < departures[1]));
  assert.deepEqual(flight.pickups, []);
});

test('arcade-11 heavy fighters retain their historical armor and shot counts', async () => {
  const [{ Flight }, { ENEMIES }] = await load;
  const upgrades = ['rails', 'chamber', 'cells', 'hull'];
  const fighter = (stage, equipment = []) => new Flight({
    mode:'arcade', rules:legacyRules, stage, seed:seeds[0], ship:'kestrel', equipment, assistance:{}
  });
  const intro = fighter(3);
  const midRoute = fighter(4);
  const lateStock = fighter(6);
  const lateUpgraded = fighter(6, upgrades);
  const spawn = (flight, kind) => flight.addEnemy({ kind, lane:.5 });
  for (const kind of ['lancer', 'sweeper', 'escort', 'relay']) {
    const base = spawn(intro, kind).hull;
    const mid = spawn(midRoute, kind).hull;
    const later = spawn(lateStock, kind).hull;
    assert.equal(base, ENEMIES[kind].hull, `${kind} keeps its early-route hull`);
    assert.ok(mid > base && later > mid && later <= base * 1.1, `${kind} has a capped increase`);
    assert.equal(later, spawn(lateUpgraded, kind).hull, `${kind} does not respond to pilot upgrades`);
  }
  for (const kind of ['scout', 'diver', 'splitter', 'shard', 'phantom']) {
    assert.equal(spawn(lateUpgraded, kind).hull, ENEMIES[kind].hull, `${kind} keeps its tuned hull`);
  }

  const shotsToDestroy = (flight, kind) => {
    const enemy = spawn(flight, kind);
    const strength = flight.ship.guns[0][3] * flight.stats.damage;
    let hits = 0;
    while (enemy.hull > 0) {
      flight.hitEnemy(enemy, { x:enemy.x, y:enemy.y, strength });
      hits++;
    }
    return hits;
  };
  assert.equal(shotsToDestroy(fighter(3, upgrades), 'sweeper'), 7);
  assert.equal(shotsToDestroy(lateUpgraded, 'sweeper'), 8);
  assert.equal(shotsToDestroy(lateStock, 'sweeper'), 9);
  assert.equal(shotsToDestroy(lateUpgraded, 'scout'), 3);
});

test('current heavy fighter armor follows mission order and stays independent of pilot tiers', async () => {
  const [{ Flight }, { ENEMIES, RULES_VERSION, STAGES }] = await load;
  const fighter = (number, tiers) => new Flight({ mode:'arcade', rules:RULES_VERSION, variant:'standard',
    stage:STAGES[number - 1].id, seed:seeds[0], ship:'kestrel', tiers });
  const opening = fighter(4);
  const middle = fighter(7);
  const finale = fighter(15);
  const improved = fighter(15, { damage:15, rate:15, thrusters:15, energy:15 });
  const spawn = (flight, kind) => flight.addEnemy({ kind, lane:.5 });
  for (const kind of ['lancer', 'sweeper', 'escort', 'relay']) {
    const base = spawn(opening, kind).hull;
    const mid = spawn(middle, kind).hull;
    const later = spawn(finale, kind).hull;
    assert.equal(base, ENEMIES[kind].hull);
    assert.ok(mid > base && later > mid && later <= base * 1.13, `${kind} gains modest route-based armor`);
    assert.equal(later, spawn(improved, kind).hull);
  }
  for (const kind of ['scout', 'diver', 'splitter', 'shard', 'phantom']) {
    assert.equal(spawn(improved, kind).hull, ENEMIES[kind].hull);
  }
  assert.ok(improved.stats.damage > finale.stats.damage);
});
