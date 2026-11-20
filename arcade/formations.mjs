import { GUNNER_MUZZLES, enemyMuzzle, hardpointAt } from './catalog.mjs';

export const VANE_HULL = 4.1;

export function vanePosition(command) {
  return { x: command.x + command.side * 30, y: command.y + 3, radius: 10.5 };
}

export function commandCharge(command) {
  return command.vane > 0 && command.fireTimer < 1.15;
}

export function linkedVolley(flight, command) {
  const line = flight.enemies.filter((e) => e.group === command.group && e.hull > 0 && e.y > 37);
  for (const wing of line) {
    const off = Math.sign(wing.x - command.x) * .11;
    const direction = Math.PI / 2 + off;
    if (wing.kind === 'lancer') {
      for (const [dx, dy] of GUNNER_MUZZLES) {
        const { x, y } = hardpointAt(wing, dx, dy, wing.turn);
        flight.projectile(x, y, direction + Math.sign(dx) * .13, 195, 'pulse');
      }
    } else {
      const { x, y } = enemyMuzzle(wing);
      flight.projectile(x, y, direction, 195, 'pulse');
    }
  }
  flight.signal('linkedFire', command.x, command.y);
}

export function breakFormation(flight, command) {
  const duringCharge = commandCharge(command) || command.fireTimer < 1.15;
  const vane = vanePosition(command);
  const wing = flight.enemies.filter((e) => e !== command && e.group === command.group && e.hull > 0);
  if (!wing.length) return;
  flight.breaks++;
  flight.score += duringCharge ? 650 : 350;
  for (const e of wing) {
    e.jam = 3.2;
    e.fireTimer = Math.max(e.fireTimer, 3.35);
    e.home += Math.sign(e.x - command.x) * 24;
    flight.signal('unlinked', e.x, e.y);
  }
  flight.signal('formationBreak', vane.x, vane.y, { charging: duringCharge, wing: wing.length });
  flight.message(duringCharge ? 'Volley stopped · Wing ships exposed' : 'Wing ships jammed · Sweep the formation', 2.7, 'pickup',
    'Formation Break', duringCharge ? 'Volley stopped' : 'Wings jammed');
}
