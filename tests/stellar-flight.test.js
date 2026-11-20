const assert = require('node:assert/strict');
const test = require('node:test');
require('../src/00-runtime.js');
require('../src/00-gameplay-rules.js');
require('../src/00-asset-manifest.js');

const load = Promise.all(['flight', 'pilot', 'catalog', 'bosses'].map((name) => import(`../arcade/${name}.mjs`)));
const step = 1 / 60;

function context(which = 1, equipment = []) {
  return { id: 'test-flight', mode: 'arcade', stage: which, ship: 'kestrel', equipment, assistance: {} };
}

function proximitySquared(dx, dy, vx, vy, width) {
  const velocity = vx * vx + vy * vy;
  const time = velocity ? Math.max(0, Math.min(width, -(dx * vx + dy * vy) / velocity)) : 0;
  return (dx + vx * time) ** 2 + (dy + vy * time) ** 2;
}

function routeRisk(player, ship, target, threat, buffer) {
  const travel = Math.hypot(target.x - player.x, target.y - player.y);
  const moving = Math.min(.88, travel / ship.speed);
  const ux = travel > .1 ? (target.x - player.x) * ship.speed / travel : 0;
  const uy = travel > .1 ? (target.y - player.y) * ship.speed / travel : 0;
  const dx = player.x - threat.x;
  const dy = player.y - threat.y;
  let distance = proximitySquared(dx, dy, ux - threat.vx, uy - threat.vy, moving);
  if (moving < .88) {
    distance = Math.min(distance, proximitySquared(target.x - threat.x - moving * threat.vx,
      target.y - threat.y - moving * threat.vy, -threat.vx, -threat.vy, .88 - moving));
  }
  const pad = threat.radius + ship.hit + buffer;
  return distance < pad * pad ? 15 + Math.max(0, pad - Math.sqrt(distance)) * 20 : 0;
}

// The same simple pilot evaluates paths every five frames. It avoids predicted
// projectile positions and aims ahead of a priority target using legal movement.
function steer(f, bounds) {
  const p = f.player;
  const b = f.boss;
  const timeToTarget = (p.y - (b?.y ?? 120)) / 685;
  const rootX = b ? 192 + b.spec.motion * Math.sin(Math.max(0, b.age + timeToTarget - b.entryTime) * .78) : 192;
  const module = b?.parts.filter((part) => part.hull > 0).sort((a, c) => Math.abs(rootX + a.dx - p.x) - Math.abs(rootX + c.dx - p.x))[0];
  const enemy = f.enemies.filter((e) => !e.retreat && e.y > 18 && e.y < p.y - 38).sort((a, c) => {
    const priority = (e) => Math.abs(e.x - p.x) - (e.vane > 0 ? 105 : e.kind === 'relay' ? 53 : 0);
    return priority(a) - priority(c);
  })[0];
  let targetX = b ? rootX + (module?.dx ?? 0) : enemy ? enemy.x + (enemy.vane > 0 ? enemy.side * 30 : 0) : 192;
  const pickup = f.pickups.find((d) => d.kind === 'repair' && p.hull < p.maxHull - 1 && Math.abs(p.y - d.y) < 65);
  if (pickup) targetX = pickup.x;

  const chargedHazard = f.hazards.find((w) => w.kind === 'rail' && w.age > w.windup - .30);
  const optionsX = [p.x, targetX, ...Array.from({ length: 22 }, (_, i) => bounds.left + 15 + i * 15.2)];
  const optionsY = [p.y, 530, 599, 668, 710];
  const divers = f.enemies.filter((e) => e.dive && e.hull > 0).map((e) => ({
    x: e.x, y: e.y, vx: Math.cos(e.vector) * 225, vy: Math.max(.55, Math.sin(e.vector)) * 225, radius: e.spec.hit
  }));
  const threats = [...f.hostile, ...divers];
  let best;
  for (const rawX of optionsX) {
    const x = Math.min(bounds.right - 4, Math.max(bounds.left + 4, rawX));
    for (const y of optionsY) {
      const travel = Math.hypot(x - p.x, y - p.y);
      let cost = Math.abs(x - targetX) * .29 + travel * .20 + Math.abs(y - (pickup?.y ?? 594)) * .07;
      if (chargedHazard && Math.abs(x - chargedHazard.x) < chargedHazard.width / 2 + f.ship.hit + 6) cost += 180;
      for (const s of threats) {
        if (s.y > Math.max(p.y, y) + 22 || s.y + s.vy * 1.08 < Math.min(p.y, y) - 34) continue;
        cost += routeRisk(p, f.ship, { x, y }, s, 7);
      }
      if (!best || cost < best.cost) best = { x, y, cost };
    }
  }
  f.drag(best.x - f.xIntent, best.y - f.yIntent);
}

test('stock and fully upgraded Kestrel can clear every authored Standard stage', async () => {
  const [{ Flight, bounds }, , { STAGES }] = await load;
  for (const stage of STAGES) {
    for (const equipment of [[], ['rails','chamber','cells','hull']]) {
      const f = new Flight(context(stage.id, equipment));
      while (f.status === 'active' && f.elapsed < stage.bossAt + 110) {
        if (Math.round(f.elapsed * 60) % 5 === 0) steer(f, bounds);
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

test('a missed or repeated failed attempt cannot be farmed for the same payout', async () => {
  const [, pilot] = await load;
  const p = pilot.newPilot();
  const attempt = (id, duration, kills) => {
    pilot.beginRun(p, id, 'arcade', 1);
    return pilot.settleRun(p, id, { status:'defeat', duration, kills, score:1000 }).award;
  };
  assert.equal(attempt('quit', 14, 2), 0);
  assert.equal(attempt('first', 80, 12), 10);
  assert.equal(attempt('same', 80, 12), 0);
  assert.equal(attempt('better', 111, 19), 5);
  assert.equal(p.salvage, 15);
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
