const assert = require('node:assert/strict');
const test = require('node:test');
require('../src/00-runtime.js');
require('../src/00-gameplay-rules.js');
require('../src/00-asset-manifest.js');

const load = Promise.all(['catalog','collision','flight'].map((name) => import(`../arcade/${name}.mjs`)));

test('each act has five ordered missions, with compatible legacy IDs and complete authored schedules', async () => {
  const [{ ACTS, FREE_MISSIONS, BOSSES, STAGES, formation, legacyStageById, stageById, nextStage }] = await load;
  const ids = [1,7,2,8,3,9,4,10,11,12,13,5,14,15,6];
  const encounterTimes = [245,335,355,368,382,388,398,410,420,427,434,446,462,474,500];
  assert.deepEqual(STAGES.map((stage) => stage.id), ids);
  assert.deepEqual(STAGES.map((stage) => stage.bossAt), encounterTimes);
  assert.equal(FREE_MISSIONS,5);
  assert.deepEqual(ACTS.map((act) => STAGES.filter((stage) => stage.act === act.id).length),[5,5,5]);
  assert.deepEqual([1,2,3,4,5,6].map((id) => legacyStageById(id).bossAt),[126,152,156,152,154,158]);

  for (const [index, stage] of STAGES.entries()) {
    assert.equal(stage.number,index + 1,stage.name);
    assert.equal(stageById(stage.id),stage,stage.name);
    assert.equal(nextStage(stage.id)?.id,ids[index + 1],stage.name);
    assert.ok(stage.objective && stage.resolution && stage.mastery?.detail,stage.name);
    assert.ok(BOSSES[stage.boss],stage.name);
    const veteran = stageById(stage.id,'veteran');
    assert.equal(veteran.bossAt,stage.bossAt,stage.name);
    assert.ok(veteran.waves.length >= stage.waves.length + 7,stage.name);
    assert.ok(veteran.waves.some(([at, wing]) => at > 150 && !stage.waves.some(([t, w]) => t === at && w === wing)),stage.name);
    for (const route of [stage,veteran]) {
      for (const beats of [route.waves,route.terrain,route.drops,route.chapters]) {
        const time = beats.map(([at]) => at);
        assert.deepEqual(time,[...time].sort((a,b) => a - b),stage.name);
        assert.ok(time.every((at) => at >= 0 && at < stage.bossAt),stage.name);
      }
      assert.ok(route.cruisers.every(({ at }) => at < stage.bossAt - 15),stage.name);
      const combatTimes = route.waves.map(([at]) => at).concat(stage.bossAt);
      assert.ok(combatTimes.every((at,i) => i === 0 || at - combatTimes[i-1] <= 15),stage.name);
      for (const [,wing] of route.waves) assert.ok(formation(wing).length >= 3,wing);
    }
  }
});

test('authored climaxes enter and attack in order and their part positions remain reachable', async () => {
  const [{ SIDE_OPERATIONS, STAGES, RULES_VERSION }, { bossBody, contactTime, exposedCoreBody, friendlyBody, moduleBody }, { Flight, bounds }] = await load;
  for (const stage of [...STAGES, ...SIDE_OPERATIONS]) {
    const mode = 'arcade';
    const f = new Flight({ id:'boss-entry', rules:RULES_VERSION, mode, stage:stage.id, ship:'kestrel', tiers:{} });
    f.waveIndex = stage.waves.length;
    f.dropIndex = stage.drops.length;
    f.terrainIndex = stage.terrain.length;
    f.cruiserIndex = stage.cruisers.length;
    f.intercepts = stage.operation?.required ?? 0;
    f.elapsed = stage.bossAt - .05;
    f.player.guard = 30;
    for (let tick = 0; tick < 960; tick++) {
      f.step(1/60);
      f.takeEvents();
    }
    const boss = f.boss;
    assert.equal(boss?.kind,stage.boss,stage.name);
    assert.ok(boss.attack >= 3 || boss.kind === 'wraith',stage.name);
    const body = bossBody(boss);
    assert.ok(Number.isFinite(body.bounds.bottom),stage.name);
    assert.ok(body.bounds.bottom < bounds.bottom - 90,stage.name);
    for (const part of boss.parts) {
      assert.ok(Number.isFinite(part.hull),stage.name);
      const module = moduleBody(boss,part);
      const { left, right } = module.bounds;
      assert.ok(right > bounds.left && left < bounds.right,stage.name);
      if (boss.spec.shielded && part.hull > 0) {
        const shot = friendlyBody({ x:module.x, px:module.x, y:boss.y - 40, py:bounds.bottom, vx:0, vy:-685 });
        assert.ok(contactTime(shot,module) <= contactTime(shot,body) + .025,`${stage.name}: ${part.role} behind armor`);
      }
    }
    if (boss.spec.coreHit) {
      const shot = friendlyBody({ x:boss.x, px:boss.x, y:boss.y - 40, py:bounds.bottom, vx:0, vy:-685 });
      assert.ok(contactTime(shot,exposedCoreBody(boss)) <= contactTime(shot,body),stage.name);
    }
  }
});

test('optional operations preserve act order, authored objective inputs and the independent Standard sequence', async () => {
  const [{ ACTS, BOSSES, SIDE_OPERATIONS, STAGES, formation, nextStage, stageById }] = await load;
  assert.deepEqual(SIDE_OPERATIONS.map((stage) => stage.code),['A1','A2','A3','B1','B2','B3','C1','C2','C3']);
  assert.deepEqual(SIDE_OPERATIONS.map((stage) => stage.requires),[1,2,4,6,8,9,11,12,13]);
  assert.deepEqual(ACTS.map((act) => SIDE_OPERATIONS.filter((stage) => stage.act === act.id).length),[3,3,3]);
  assert.equal(STAGES.at(-1).id,6);
  assert.equal(nextStage(6),undefined);
  for (const [index, stage] of SIDE_OPERATIONS.entries()) {
    assert.equal(stage.id,index + 16,stage.name);
    assert.equal(stageById(stage.id),stage,stage.name);
    assert.equal(stageById(stage.id,'veteran'),undefined,stage.name);
    assert.equal(nextStage(stage.id),undefined,stage.name);
    assert.ok(stage.side && stage.objective && stage.resolution && stage.mastery,stage.name);
    if (stage.operation?.type === 'priority') {
      const targets = stage.waves.filter(([, , , tag]) => tag === 'priority');
      assert.ok(targets[0]?.[0] > 0,stage.name);
      assert.ok(targets.at(-1)[0] + 20 < stage.bossAt,stage.name);
      const count = targets.flatMap(([, wing]) => formation(wing)).filter(({ kind }) => kind === stage.operation.kind).length;
      assert.equal(count,stage.operation.required + stage.operation.maxEscapes,stage.name);
    } else if (stage.operation?.type === 'transmission') {
      assert.equal(BOSSES[stage.boss].parts.filter(([, , role]) => role === stage.operation.role).length,2,stage.name);
    }
  }
});
