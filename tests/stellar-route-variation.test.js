const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');
require('../src/00-runtime.js');
require('../src/00-gameplay-rules.js');
require('../src/00-asset-manifest.js');

const load = Promise.all(['flight', 'catalog'].map((name) => import(`../arcade/${name}.mjs`)));
const seeds = Array.from({ length: 12 }, (_, index) =>
  createHash('sha256').update(`route-test-${index}`).digest('hex').slice(0, 32));

function makeFlight(Flight, stage, seed, mode = 'arcade') {
  return new Flight({ mode, stage, seed, ship:'kestrel', equipment:[], assistance:{} });
}

function lineup(flight) {
  return flight.spawns.splice(0).map(({ kind, lane, at }) => [kind, lane, at - flight.elapsed]);
}

function route(Flight, stage, seed, consumeCombatRandomness = false) {
  const flight = makeFlight(Flight, stage.id, seed);
  return stage.waves.map(([at], index) => {
    if (consumeCombatRandomness) {
      for (let i = 0; i <= index; i++) flight.random();
    }
    flight.elapsed = at;
    flight.updateSchedule();
    return lineup(flight);
  });
}

test('selected Arcade wings can attack from either flank without changing their roster, timing, or scripted neighbors', async () => {
  const [{ Flight }, { STAGES, RULES_VERSION }] = await load;
  assert.equal(RULES_VERSION, 'arcade-9');
  for (const stage of STAGES) {
    const reference = route(Flight, stage, seeds[0]);
    assert.deepEqual(route(Flight, stage, seeds[0], true), reference, `${stage.name} uses an independent route seed`);
    const distinct = seeds.map((seed) => route(Flight, stage, seed));
    const adaptive = stage.waves.filter((beat) => beat[2] === 'flank').length;
    assert.ok(adaptive >= 2 && adaptive <= 4, `${stage.name} keeps a bounded set of variable beats`);
    stage.waves.forEach((beat, index) => {
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
});

test('Vesper tightens measured quiet swaths while preserving the opening power, cruisers, and boss', async () => {
  const [{ Flight }, { STAGES }] = await load;
  const [vesper] = STAGES;
  assert.deepEqual(vesper.waves[0], [.6, 'arrow', 0, 'opening']);
  assert.deepEqual(vesper.waves[1], [6.4, 'column', 1]);
  assert.equal(vesper.waves.find((beat) => beat[1] === 'spear')[0], 12.5);
  assert.equal(vesper.waves.find((beat) => beat[1] === 'break')[0], 71);
  assert.deepEqual(vesper.cruisers, [{ at:46, variant:'patrol' }, { at:82, variant:'heavy' }]);
  assert.equal(vesper.bossAt, 126);
  const flight = makeFlight(Flight, 1, seeds[0]);
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
