import { BOSSES, WIDTH, HEIGHT } from './catalog.mjs';

export function launchBoss(flight, kind) {
  const spec = BOSSES[kind];
  flight.boss = {
    kind, spec, x: WIDTH / 2, y: -100, hull: spec.hull, age: 0, timer: 2.9, attack: 0,
    entryTime: 1.55, hitFlash: 0, parts: spec.parts.map(([dx, dy]) => ({ dx, dy, hull: spec.partHull, flash: 0 }))
  };
  flight.signal('boss', flight.boss.x, 125, spec.name);
  flight.message(spec.intro, 4.5, 'warning', spec.name);
}

export function bossPartPosition(boss, part) {
  return { x: boss.x + part.dx, y: boss.y + part.dy, radius: 12.5 };
}

function gatekeeperAttack(flight, boss, phase) {
  const aim = boss.attack % 2 === 1;
  for (const part of boss.parts) {
    if (part.hull <= 0) continue;
    const { x, y } = bossPartPosition(boss, part);
    const angle = aim ? flight.angleToPilot(x, y + 14) : Math.PI/2 + Math.sign(part.dx) * .22;
    flight.fan(x, y + 14, angle, phase ? 5 : 3, .16, 205 + 24 * phase, 'bolt');
  }
  const width = phase ? .19 : .23;
  flight.fan(boss.x, boss.y + 27, Math.PI/2, phase ? 9 : 5, width, phase ? 134 : 119, 'seed');
  boss.timer = phase ? 1.59 : 2.12;
}

function baseAttack(flight, boss, phase) {
  flight.fan(boss.x, boss.y + 26, Math.PI/2, 7 + phase * 2, .18, 154, 'seed');
  boss.timer = 1.9;
}

const attacks = { gatekeeper: gatekeeperAttack };

export function advanceBoss(flight, dt) {
  const b = flight.boss;
  if (!b) return;
  b.age += dt;
  b.hitFlash = Math.max(0, b.hitFlash - dt);
  for (const part of b.parts) part.flash = Math.max(0, part.flash - dt);
  const entry = Math.min(1, b.age / b.entryTime);
  b.y = -100 + 313 * (1 - (1 - entry) ** 2) + 7 * Math.sin(b.age * 1.1) * entry;
  b.x = WIDTH / 2 + b.spec.motion * Math.sin(Math.max(0, b.age - b.entryTime) * .78);
  b.timer -= dt;
  if (b.age < b.entryTime || b.timer > 0) return;
  b.attack++;
  (attacks[b.kind] ?? baseAttack)(flight, b, Number(b.hull <= b.spec.hull * .47));
  flight.signal('bossFire', b.x, b.y + 23);
}

export function operatorWarnings(flight, dt) {
  for (const warning of flight.hazards) {
    warning.age += dt;
    if (warning.age < warning.windup) continue;
    if (!warning.triggered) {
      warning.triggered = true;
      flight.signal('hazard', warning.x, warning.y ?? 150);
      if (warning.kind === 'wall') {
        for (let x = 18; x <= WIDTH - 13; x += 34) {
          if (Math.abs(x - warning.x) < warning.width / 2 + 11) continue;
          flight.projectile(x, 112, Math.PI/2, warning.speed, 'rock');
        }
      }
    }
    if (warning.kind === 'rail' && Math.abs(flight.player.x - warning.x) < warning.width / 2 + flight.ship.hit) {
      flight.damage(warning.x, HEIGHT * .55);
    }
  }
  flight.hazards = flight.hazards.filter((warning) => warning.age < warning.windup + warning.live);
}
