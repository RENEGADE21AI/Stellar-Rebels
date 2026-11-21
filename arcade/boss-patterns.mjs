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
  const varied = options.varied ?? flight.stage.id >= 5;
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

export function markRail(flight, x, width = 38, y = 105, emitter = null) {
  flight.hazards.push({ kind:'rail', x, y, width, age:0, windup:1.22, live:.24, emitter });
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
