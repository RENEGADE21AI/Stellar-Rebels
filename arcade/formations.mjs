import { GUNNER_MUZZLES, WIDTH, enemyMuzzle, hardpointAt } from './catalog.mjs';

export const VANE_HULL = 4.1;
const chargeLead = 1.15;

export function vanePosition(command) {
  return { x: command.x + command.side * 30, y: command.y + 3, radius: 10.5 };
}

export function commandCharge(command) {
  return command.vane > 0 && command.fireTimer < chargeLead;
}

export function linkedVolley(flight, command) {
  const line = flight.enemies.filter((e) => e.group === command.group && e.hull > 0 && e.y > 37 && !e.dive &&
    !e.retreat && !e.loop && e.y < flight.player.y - 84).sort((a, b) => a.x - b.x);
  const aim = command.volleyTarget ?? flight.player;
  const half = (line.length - 1) / 2;
  const span = Math.max(0, half * 26);
  const center = Math.max(17 + span, Math.min(WIDTH - 17 - span, aim.x));
  for (let index = 0; index < line.length; index++) {
    const wing = line[index];
    const lane = center + (index - half) * 26;
    if (wing.kind === 'lancer') {
      for (const [dx, dy] of GUNNER_MUZZLES) {
        const { x, y } = hardpointAt(wing, dx, dy, wing.turn);
        const direction = Math.atan2(Math.max(70, aim.y - y), lane + Math.sign(dx) * 13 - x);
        flight.enemyProjectile(wing, x, y, direction, 195, 'pulse');
      }
    } else {
      const { x, y } = enemyMuzzle(wing);
      const direction = Math.atan2(Math.max(70, aim.y - y), lane - x);
      flight.enemyProjectile(wing, x, y, direction, 195, 'pulse');
    }
  }
  flight.signal('linkedFire', command.x, command.y);
}

export function breakFormation(flight, command) {
  const duringCharge = command.fireTimer < chargeLead;
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
