import { WIDTH } from './catalog.mjs';

export function markWall(flight, slot, options = {}) {
  const gap = globalThis.debrisSafeGap(slot, { slots:5, width:WIDTH, asteroidRadius:12, playerRadius:flight.ship.hit, margin:8 });
  const delay = options.delay ?? 0;
  const y = options.y ?? 176;
  flight.hazards.push({
    kind:'wall', x:gap.center, y, width:Math.max(94, gap.width), age:-delay, windup:1.12,
    speed:options.speed ?? 141
  });
  if (!delay) flight.signal('charge', gap.center, y);
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
    flight.fan(boss.x - 85, boss.y + 20, 1.16, 4, .14, 134 + phase * 19, 'seed');
    flight.fan(boss.x + 85, boss.y + 20, 1.98, 4, .14, 134 + phase * 19, 'seed');
  } else {
    const speed = globalThis.debrisWardenRowSpeed(boss.hull / boss.spec.hull, 'wall') * 60;
    const y = boss.y + 53;
    markWall(flight, gap, { speed, y });
    if (phase && turn % 2 === 0) markWall(flight, gapOrder[(turn + 1) % gapOrder.length], { speed, y, delay:2.12 });
  }
  boss.timer = lighter ? 2.32 : phase ? 3.25 : 3.75;
}

export function relayCarrier(flight, boss, phase) {
  const linked = boss.parts.filter((part) => part.hull > 0);
  if (linked.length) {
    for (const part of linked) {
      const x = boss.x + part.dx;
      const y = boss.y + part.dy + 11;
      const direction = .45 * Math.PI + (part.dx > 0 ? .24 : 0);
      flight.fan(x, y, boss.attack % 2 === 0 ? flight.angleToPilot(x,y) : direction, 4, .15, 162, 'pulse');
    }
    boss.timer = 2.35;
  } else {
    const direction = Math.PI / 2 + (boss.attack % 2 ? .20 : -.20);
    flight.fan(boss.x, boss.y + 26, direction, phase ? 11 : 8, .154, phase ? 172 : 146, 'blade');
    if (phase) flight.fan(boss.x, boss.y + 31, flight.angleToPilot(boss.x, boss.y + 31), 3, .23, 214, 'pulse');
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
  const y = boss.y + 17;
  const offset = Math.sin(boss.attack * 1.10);
  flight.fan(boss.x, y, Math.PI/2 + .56 * offset, phase ? 9 : 7, .122, 144 + phase * 26, 'blade');
  if (boss.attack % 2 === 1) {
    const lock = Math.min(WIDTH - 57, Math.max(57, flight.player.x));
    markPull(flight, lock, y);
  } else if (phase) {
    const secondX = boss.x - 61 * Math.sign(offset);
    flight.fan(secondX, boss.y - 29, Math.PI/2 - .53 * offset, 4, .18, 187, 'pulse');
  }
  boss.timer = phase ? 1.82 : 2.13;
}

export function flagship(flight, boss, phase) {
  const active = boss.parts.filter((part) => part.hull > 0);
  if (active.length > 0) {
    for (const part of active) {
      const x = boss.x + part.dx;
      flight.fan(x, boss.y + part.dy + 14, Math.PI/2 + Math.sign(part.dx) * .38, 4, .128, 177, 'lance');
    }
    if (boss.attack % 2 === 0) markWall(flight, gapOrder[boss.attack % gapOrder.length], { speed:147, y:boss.y + 80 });
    boss.timer = 2.64;
    return;
  }
  const turn = boss.attack % 3;
  const y = boss.y + 32;
  if (turn === 0) {
    markWall(flight, gapOrder[(boss.attack + 1) % gapOrder.length], { speed:161 + phase * 16, y:boss.y + 80 });
    boss.timer = 2.50;
  } else if (turn === 1) {
    const x = flight.player.x;
    markRail(flight, x, 41, boss.y + 119, 82);
    flight.fan(boss.x, y, Math.PI/2, 6, .19, 150, 'pulse');
    boss.timer = 2.42;
  } else {
    for (const side of [-1, 1]) {
      flight.fan(boss.x + side * 55, y - 7, Math.PI/2 - side * .47, phase ? 6 : 4, .14, 165 + phase * 21, 'blade');
    }
    boss.timer = phase ? 1.72 : 2.10;
  }
}
