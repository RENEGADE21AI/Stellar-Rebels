import { WIDTH } from './catalog.mjs';

export function markWall(flight, slot, options = {}) {
  const gap = globalThis.debrisSafeGap(slot, { slots:5, width:WIDTH, asteroidRadius:12, playerRadius:flight.ship.hit, margin:8 });
  flight.hazards.push({
    kind:'wall', x:gap.center, y:111, width:Math.max(94, gap.width), age:0, windup:options.windup ?? 1.12,
    live:0.10, speed:options.speed ?? 141
  });
  flight.signal('bossFire', gap.center, 112);
}

const gapOrder = [1, 2, 3, 2, 1, 2, 3];

export function harrow(flight, boss, phase) {
  const turn = boss.attack - 1;
  const gap = gapOrder[turn % gapOrder.length];
  const lighter = turn % 3 === 1;
  if (lighter) {
    flight.fan(boss.x - 54, boss.y + 25, 1.16, 4, .14, 134 + phase * 19, 'seed');
    flight.fan(boss.x + 54, boss.y + 25, 1.98, 4, .14, 134 + phase * 19, 'seed');
  } else {
    const speed = globalThis.debrisWardenRowSpeed(boss.hull / boss.spec.hull, 'wall') * 60;
    markWall(flight, gap, { speed });
    if (phase && turn % 2 === 0) markWall(flight, gapOrder[(turn + 1) % gapOrder.length], { speed, windup:2.12 });
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
