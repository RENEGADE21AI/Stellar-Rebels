import { WIDTH } from './catalog.mjs';

function wallOrigin(flight, emitter) {
  const boss = flight.boss;
  return boss && Number.isFinite(emitter) ? { x:boss.x, y:boss.y + emitter } : { x:WIDTH / 2, y:-20 };
}

export function startWallWarning(flight, warning) {
  warning.origin = wallOrigin(flight, warning.emitter);
  const source = warning.origin.y < 0 ? warning : warning.origin;
  flight.signal('charge', source.x, source.y);
}

export function markWall(flight, slot, options = {}) {
  const gap = globalThis.debrisSafeGap(slot, { slots:5, width:WIDTH, asteroidRadius:12, playerRadius:flight.ship.hit, margin:8 });
  const delay = options.delay ?? 0;
  const y = options.y ?? -86;
  const width = Math.max(68, Math.min(76, gap.width - 24));
  const varied = options.varied ?? (flight.stage.number ?? flight.stage.id) >= 5;
  const rocks = [];
  for (let row = 0; row < 2; row++) {
    for (const side of [-1, 1]) {
      const edge = side < 0 ? 16 : WIDTH - 16;
      const mouth = gap.center + side * (width / 2 + 18 + (1 - row) * 6);
      if ((mouth - edge) * side > 0) continue;
      const steps = Math.max(1, Math.round(Math.abs(mouth - edge) / (row ? 37 : 42)));
      for (let lane = 0; lane <= steps; lane++) {
        const x = edge + (mouth - edge) * lane / steps;
        const rock = { x, y:y + row * 44 };
        if (varied && lane !== steps) {
          const profile = (lane + row * 2 + (side < 0 ? 0 : 1) + slot) % 3;
          rock.size = [34, 42, 48][profile];
          rock.pace = [.91, 1.02, 1.09][profile];
        }
        rocks.push(rock);
      }
    }
  }
  const warning = {
    kind:'wall', x:gap.center, y, width, rocks, age:-delay, windup:1.12,
    emitter:options.emitter, origin:wallOrigin(flight, options.emitter),
    speed:options.speed ?? 141
  };
  flight.hazards.push(warning);
  if (!delay) startWallWarning(flight, warning);
}

export function markRail(flight, x, width = 38, y = 105, emitter = null, emitterX = 0) {
  const warning = { kind:'rail', x, y, width, age:0, windup:1.22, live:.24, emitter };
  if (emitterX) warning.emitterX = emitterX;
  flight.hazards.push(warning);
  flight.signal('charge', x, y);
}

export function markPull(flight, x, y = 111) {
  flight.hazards.push({ kind:'pull', x, y, width:152, age:0, windup:.96, live:1.66 });
  flight.signal('charge', x, y);
}

const gapOrder = [1, 2, 3, 2, 1, 2, 3];

export function harrow(flight, boss, phase) {
  const turn = boss.attack - 1;
  const gap = gapOrder[turn % gapOrder.length];
  const lighter = turn % 3 === 1;
  if (lighter) {
    flight.fan(boss.x - 85 * boss.artScale, boss.y + 20 * boss.artScale, 1.16, 4, .14, 134 + phase * 19, 'seed');
    flight.fan(boss.x + 85 * boss.artScale, boss.y + 20 * boss.artScale, 1.98, 4, .14, 134 + phase * 19, 'seed');
  } else {
    const speed = globalThis.debrisWardenRowSpeed(boss.hull / boss.spec.hull, 'wall') * 60;
    const y = boss.y + 81 * boss.artScale;
    const emitter = 49 * boss.artScale;
    markWall(flight, gap, { speed, y, emitter, varied:Boolean(phase) });
    if (phase && turn % 2 === 0) markWall(flight, gapOrder[(turn + 1) % gapOrder.length], { speed, y, emitter, delay:2.12, varied:true });
  }
  boss.timer = lighter ? 2.32 : phase ? 3.25 : 3.75;
}

export function relayCarrier(flight, boss, phase) {
  const linked = boss.parts.filter((part) => part.hull > 0);
  if (linked.length) {
    for (const part of linked) {
      const x = boss.x + part.dx;
      const y = boss.y + part.dy + 11 * boss.artScale;
      const direction = .45 * Math.PI + (part.dx > 0 ? .24 : 0);
      flight.fan(x, y, boss.attack % 2 === 0 ? flight.angleToPilot(x,y) : direction, 4, .15, 162, 'pulse');
    }
    boss.timer = 2.35;
  } else {
    const direction = Math.PI / 2 + (boss.attack % 2 ? .20 : -.20);
    const y = boss.y + 26 * boss.artScale;
    flight.fan(boss.x, y, direction, phase ? 11 : 8, .154, phase ? 172 : 146, 'blade');
    if (phase) flight.fan(boss.x, y, flight.angleToPilot(boss.x, y), 3, .23, 214, 'pulse');
    boss.timer = phase ? 1.77 : 2.21;
  }
}

export function railShip(flight, boss, phase) {
  const y = boss.y + 52;
  const lockedX = flight.player.x;
  if (boss.attack % 3 !== 0) {
    markRail(flight, lockedX, phase ? 44 : 36, boss.y + 116, 79);
    if (phase && boss.attack % 3 === 2) {
      const reserve = lockedX < WIDTH / 2 ? WIDTH - 59 : 59;
      markRail(flight, reserve, 27, boss.y + 116, 79);
    }
    boss.timer = 2.43;
    return;
  }
  for (const side of [-1, 1]) {
    const x = boss.x + side * 42;
    flight.fan(x, y - 16, Math.PI/2 + side * .27, phase ? 5 : 3, .16, phase ? 189 : 169, 'lance');
  }
  boss.timer = phase ? 1.63 : 1.92;
}

export function gravityPlatform(flight, boss, phase) {
  const y = boss.y + 17 * boss.artScale;
  const offset = Math.sin(boss.attack * 1.10);
  flight.fan(boss.x, y, Math.PI/2 + .56 * offset, phase ? 9 : 7, .122, 144 + phase * 26, 'blade');
  if (boss.attack % 2 === 1) {
    const lock = Math.min(WIDTH - 57, Math.max(57, flight.player.x));
    markPull(flight, lock, y);
  } else if (phase) {
    const secondX = boss.x - 61 * boss.artScale * Math.sign(offset);
    flight.fan(secondX, boss.y - 29 * boss.artScale, Math.PI/2 - .53 * offset, 4, .18, 187, 'pulse');
  }
  boss.timer = phase ? 1.82 : 2.13;
}

export function flagship(flight, boss, phase) {
  const active = boss.parts.filter((part) => part.hull > 0);
  const wall = { y:boss.y + 101 * boss.artScale, emitter:26 * boss.artScale };
  if (active.length > 0) {
    for (const part of active) {
      const x = boss.x + part.dx;
      flight.fan(x, boss.y + part.dy + part.muzzle, Math.PI/2 + Math.sign(part.dx) * .38, 4, .128, 177, 'lance');
    }
    if (boss.attack % 2 === 0) markWall(flight, gapOrder[boss.attack % gapOrder.length], { ...wall, speed:147 });
    boss.timer = 2.64;
    return;
  }
  const turn = boss.attack % 3;
  const y = boss.y + 32 * boss.artScale;
  if (turn === 0) {
    markWall(flight, gapOrder[(boss.attack + 1) % gapOrder.length], { ...wall, speed:161 + phase * 16 });
    boss.timer = 2.50;
  } else if (turn === 1) {
    const x = flight.player.x;
    markRail(flight, x, 41, boss.y + 119 * boss.artScale, 115 * boss.artScale);
    flight.fan(boss.x, y, Math.PI/2, 6, .19, 150, 'pulse');
    boss.timer = 2.42;
  } else {
    for (const side of [-1, 1]) {
      flight.fan(boss.x + side * 55 * boss.artScale, y - 7, Math.PI/2 - side * .47, phase ? 6 : 4, .14, 165 + phase * 21, 'blade');
    }
    boss.timer = phase ? 1.72 : 2.10;
  }
}

function activeParts(boss, role) {
  return boss.parts.filter((part) => part.hull > 0 && (!role || part.role === role));
}

function turretFan(flight, boss, part, speed, count = 3, kind = 'lance') {
  const x = boss.x + part.dx;
  const y = boss.y + part.dy + part.muzzle;
  const direction = boss.attack % 2 ? flight.angleToPilot(x, y) : Math.PI / 2 + Math.sign(part.dx) * .28;
  flight.fan(x, y, direction, count, .17, speed, kind);
}

export function rearGuard(flight, boss, phase) {
  if (boss.attack % 4 === 1) {
    flight.queue('returnPatrol', boss.attack % 8 === 1);
  } else {
    for (const part of activeParts(boss)) turretFan(flight, boss, part, 172 + 12 * phase);
  }
  flight.fan(boss.x, boss.y + 50, Math.PI / 2, phase ? 5 : 3, .32, 134, 'seed');
  boss.timer = phase ? 2.04 : 2.49;
}

export function supplyTender(flight, boss, phase) {
  const couplers = activeParts(boss, 'shield');
  const battery = activeParts(boss, 'turret')[0];
  for (const part of couplers) turretFan(flight, boss, part, 153, 2, 'pulse');
  if (battery) turretFan(flight, boss, battery, 174, 3);
  if (couplers.length) {
    if (boss.attack % 3 === 1) flight.queue('convoyWing', boss.attack % 6 === 1);
  } else {
    const direction = Math.PI / 2 + (boss.attack % 2 ? .19 : -.19);
    flight.fan(boss.x, boss.y + 25, direction, phase ? 9 : 7, .18, 143 + phase * 18, 'blade');
  }
  boss.timer = phase ? 2.10 : 2.65;
}

export function borderBastion(flight, boss, phase) {
  const rails = activeParts(boss, 'rail');
  const turn = boss.attack % 3;
  if (turn !== 0 && rails.length) {
    const part = rails[boss.attack % rails.length];
    const y = boss.y + part.dy + part.muzzle;
    const lane = turn === 1 ? flight.player.x : WIDTH * (part.dx > 0 ? .73 : .27);
    markRail(flight, lane, phase ? 40 : 33, y + 32, y - boss.y, part.dx);
  }
  if (turn !== 1) {
    for (const part of activeParts(boss, 'turret')) turretFan(flight, boss, part, 172, phase ? 4 : 2);
  }
  if (!rails.length || turn === 0) {
    flight.fan(boss.x, boss.y + 71, Math.PI / 2, phase ? 9 : 6, .16, 148, 'seed');
  }
  boss.timer = phase ? 2.05 : 2.44;
}

const scrapSeams = [1, 3, 2, 3, 1, 2];

export function salvagePlatform(flight, boss, phase) {
  const turn = boss.attack % 3;
  const slot = scrapSeams[boss.attack % scrapSeams.length];
  const y = boss.y + 77;
  if (turn === 1) {
    markWall(flight, slot, { y, emitter:44, speed:137 + 19 * phase, varied:true });
  } else if (turn === 2) {
    const x = WIDTH * (slot < 2 ? .69 : .30);
    markPull(flight, x, y);
    flight.fan(boss.x, y - 16, Math.PI / 2 + .22 * Math.sign(boss.x - x), 6, .16, 155, 'seed');
  } else {
    flight.queue(phase ? 'wreckGuard' : 'splitWing', boss.attack % 2 === 0);
    flight.fan(boss.x, y - 16, flight.angleToPilot(boss.x, y), 4, .18, 172, 'pulse');
  }
  boss.timer = phase ? 2.56 : 3.05;
}

export function spectralBeacon(flight, boss, phase) {
  const direction = Math.PI / 2 + (boss.attack % 2 ? -.23 : .23);
  const y = boss.y + 34;
  if (boss.attack % 2 === 0) {
    for (const part of activeParts(boss)) turretFan(flight, boss, part, 159, 4, 'orb');
    if (!activeParts(boss).length) flight.fan(boss.x, y, direction, 8, .15, 171, 'orb');
  } else {
    flight.fan(boss.x, y, direction, 7, .15, 151, 'specter', { realm:'ghost' });
    flight.fan(boss.x, y, Math.PI - direction, phase ? 6 : 4, .21, 178, 'orb');
  }
  if (boss.attack % 4 === 1) flight.queue('specters', boss.attack % 8 === 1);
  boss.timer = phase ? 1.93 : 2.43;
}

export function fleetVanguard(flight, boss, phase) {
  const batteries = activeParts(boss, 'turret');
  const rails = activeParts(boss, 'rail');
  const turn = boss.attack % 3;
  if (turn === 1) {
    flight.queue('watch', boss.attack % 2 === 0);
  } else if (turn === 2 && rails.length) {
    const part = rails[boss.attack % rails.length];
    const y = boss.y + part.dy + part.muzzle;
    markRail(flight, flight.player.x, phase ? 43 : 37, y + 32, y - boss.y, part.dx);
  } else {
    for (const part of batteries) turretFan(flight, boss, part, 182, 4);
  }
  flight.fan(boss.x, boss.y + 44, Math.PI / 2, phase ? 7 : 5, .18, 142 + phase * 19, 'blade');
  boss.timer = phase ? 2.14 : 2.47;
}

export function defenseCitadel(flight, boss, phase) {
  const nodes = activeParts(boss);
  const turn = boss.attack % 3;
  if (nodes.length) {
    if (turn === 1) flight.queue('linked', boss.attack % 2 === 0);
    for (const part of nodes) turretFan(flight, boss, part, 157, 3, 'pulse');
    if (turn === 0) markRail(flight, flight.player.x, 33, boss.y + 106, 59);
  } else {
    for (const side of [-1, 1]) {
      flight.fan(boss.x + side * 55, boss.y + 42, Math.PI / 2 - side * .34, phase ? 6 : 4, .14, 162 + phase * 23, 'blade');
    }
  }
  boss.timer = phase ? 1.83 : 2.55;
}

export function arrayStabilizer(flight, boss, phase) {
  const arms = activeParts(boss, 'stabilizer');
  const turn = boss.attack % 3;
  const y = boss.y + 59;
  if (arms.length && turn === 1) {
    const arm = arms[boss.attack % arms.length];
    const x = Math.min(WIDTH - 75, Math.max(75, boss.x + arm.dx));
    markPull(flight, x, y);
    flight.fan(x, y, Math.PI / 2, 5, .21, 150, 'pulse');
  } else if (turn === 2) {
    const slot = scrapSeams[boss.attack % scrapSeams.length];
    markWall(flight, slot, { y:y + 20, emitter:40, speed:142 + phase * 16, varied:true });
  } else {
    const direction = Math.PI / 2 + .22 * Math.sin(boss.attack * 1.6);
    flight.fan(boss.x, y - 19, direction, phase ? 9 : 7, .16, phase ? 182 : 151, 'blade');
  }
  boss.timer = phase ? 2.24 : 2.80;
}

export function imperialFlagship(flight, boss, phase) {
  const rails = activeParts(boss, 'rail');
  const stabilizers = activeParts(boss, 'stabilizer');
  const turn = boss.attack % 3;
  const y = boss.y + boss.spec.coreY;
  if (rails.length + stabilizers.length) {
    if (turn === 1 && rails.length) {
      const rail = rails[boss.attack % rails.length];
      const muzzleY = boss.y + rail.dy + rail.muzzle;
      markRail(flight, flight.player.x, 40, muzzleY + 32, muzzleY - boss.y, rail.dx);
    } else if (turn === 2 && stabilizers.length) {
      const support = stabilizers[boss.attack % stabilizers.length];
      const x = boss.x + support.dx;
      markPull(flight, x, boss.y + support.dy);
      turretFan(flight, boss, support, 158, 4, 'pulse');
    } else {
      for (const rail of rails) turretFan(flight, boss, rail, 184, 3);
      for (const support of stabilizers) turretFan(flight, boss, support, 149, 2, 'seed');
    }
    boss.timer = 2.63;
    return;
  }

  if (!boss.coreArmed) {
    boss.coreArmed = true;
    flight.signal('charge', boss.x, y);
    flight.message('The protective systems are down. Aim for the Array!', 2.7, 'warning', 'Core exposed');
  }
  if (turn === 0) {
    markWall(flight, scrapSeams[boss.attack % scrapSeams.length], { y:y + 99, emitter:boss.spec.coreY, speed:phase ? 169 : 152, varied:true });
  } else if (turn === 1) {
    markRail(flight, flight.player.x, phase ? 45 : 39, y + 61, boss.spec.coreY);
    flight.fan(boss.x, y, Math.PI / 2, 6, .20, 151, 'pulse');
  } else {
    for (const side of [-1, 1]) {
      flight.fan(boss.x + side * 23, y, Math.PI / 2 - side * .37, phase ? 6 : 4, .17, 165 + phase * 23, 'blade');
    }
  }
  boss.timer = phase ? 1.93 : 2.32;
}

export function gridControl(flight, boss, phase) {
  const batteries = activeParts(boss, 'rail');
  const nodes = activeParts(boss, 'shield');
  const side = boss.attack % 2 ? -1 : 1;
  for (const battery of batteries) {
    if (Math.sign(battery.dx) !== side) continue;
    const y = boss.y + battery.dy + battery.muzzle;
    const lane = boss.attack % 3 ? flight.player.x : WIDTH / 2 + side * 103;
    markRail(flight, lane, 33, y + 19, y - boss.y, battery.dx);
  }
  for (const node of nodes) turretFan(flight, boss, node, 155, 3, 'pulse');
  if (!nodes.length) {
    const direction = Math.PI / 2 + side * .21;
    flight.fan(boss.x, boss.y + 50, direction, phase ? 9 : 7, .15, 148 + phase * 24, 'blade');
  }
  boss.timer = phase ? 1.98 : 2.68;
}

export function ambushLeader(flight, boss, phase) {
  const side = boss.attack % 2 ? -1 : 1;
  if (boss.attack % 4 === 1) flight.queue('voidPatrol', side > 0);
  else {
    const x = boss.x + side * 70;
    const direction = Math.PI / 2 - side * .48;
    flight.fan(x,boss.y + 36,direction,phase ? 7 : 5,.15,172,'lance');
  }
  for (const part of activeParts(boss)) {
    if (Math.sign(part.dx) === side) turretFan(flight, boss, part, 156, 3, 'pulse');
  }
  boss.timer = phase ? 1.75 : 2.34;
}

export function hunterLeader(flight, boss, phase) {
  const y = boss.y + 22;
  const aim = flight.angleToPilot(boss.x,y);
  if (boss.attack % 3 === 1) flight.queue('scissor', boss.x > WIDTH / 2);
  if (boss.attack % 2 === 0) {
    flight.fan(boss.x,y,aim,phase ? 6 : 4,.19,198 + phase * 16,'lance');
  } else {
    for (const offset of [-.39,.39]) flight.fan(boss.x,y,Math.PI / 2 + offset,3,.17,164,'blade');
  }
  boss.timer = phase ? 1.43 : 1.82;
}

export function communicationPost(flight, boss, phase) {
  const transmitters = activeParts(boss, 'transmitter');
  for (const transmitter of transmitters) turretFan(flight, boss, transmitter, 147, 3, 'pulse');
  for (const part of activeParts(boss, 'turret')) turretFan(flight, boss, part, 174, 4);
  if (!transmitters.length) {
    const side = boss.attack % 2 ? -1 : 1;
    flight.fan(boss.x,boss.y + 60,Math.PI / 2 + side * .26,phase ? 9 : 7,.16,172,'blade');
  }
  boss.timer = phase ? 1.98 : 2.58;
}

export function siegeCruiser(flight, boss, phase) {
  const rails = activeParts(boss, 'rail');
  const turrets = activeParts(boss, 'turret');
  if (rails.length && boss.attack % 3 !== 0) {
    const rail = rails[boss.attack % rails.length];
    const x = boss.attack % 3 === 1 ? flight.player.x : WIDTH / 2 + Math.sign(rail.dx) * 94;
    const y = boss.y + rail.dy + rail.muzzle;
    markRail(flight, x, 42, y + 30, y - boss.y, rail.dx);
  }
  if (boss.attack % 3 !== 1) {
    for (const turret of turrets) turretFan(flight, boss, turret, 178, 4);
  }
  if (!rails.length && !turrets.length) {
    const y = boss.y + 47;
    const side = boss.attack % 2 ? -1 : 1;
    flight.fan(boss.x + 38 * side,y,Math.PI / 2 - side * .24,phase ? 11 : 8,.14,156 + phase * 19,'lance');
    if (phase) flight.fan(boss.x - 37 * side,y,flight.angleToPilot(boss.x,y),3,.20,180,'pulse');
  }
  boss.timer = phase ? 1.84 : 2.55;
}
