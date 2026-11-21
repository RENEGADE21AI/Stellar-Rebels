import { WIDTH } from './catalog.mjs';
import { rememberPosition } from './collision.mjs';

const profile = { size: 214, hit: 25, parts: [[-41.2, 19], [41.2, 19]] };
const margin = 116;
const patterns = {
  patrol: { direction:-1, y:196, transit:10.5, turretHull:9, shots:2, roundSpeed:154, cadence:3.1, title:'Patrol cruiser' },
  heavy: { direction:1, y:226, transit:14, turretHull:14, shots:3, roundSpeed:169, cadence:2.7, title:'Cruiser crossing' }
};

export function launchCruiser(flight, variant = 'heavy') {
  const pattern = patterns[variant];
  const fromX = pattern.direction === -1 ? WIDTH + margin : -margin;
  const speed = (WIDTH + margin * 2) / pattern.transit * pattern.direction;
  for (const enemy of flight.enemies) if (enemy.loop) enemy.retreat = true;
  flight.cruiser = { kind:'cruiser', spec:profile, variant, pattern, fromX, x:fromX, y:pattern.y, age:0, hull:1, speed,
    parts: profile.parts.map(([dx, dy], i) => ({ dx, dy, radius:10.2, size:33, muzzle:14.8,
      hull:pattern.turretHull, flash:0, cycle:1.2 + i * 1.35, charge:0, aim:0 })) };
  flight.signal('cruiserEnter', pattern.direction === -1 ? WIDTH : 0, pattern.y, variant);
  flight.message('Target its turrets.', 3.0, 'warning', pattern.title);
}

export function advanceCruiser(flight, dt) {
  const craft = flight.cruiser;
  if (!craft) return;
  const { pattern } = craft;
  rememberPosition(craft);
  craft.age += dt;
  if (craft.age >= pattern.transit) {
    flight.cruiser = null;
    return;
  }
  craft.x = craft.fromX + craft.speed * craft.age;
  craft.y = pattern.y + 9 * Math.sin(craft.age * .46);
  for (const part of craft.parts) {
    part.flash = Math.max(0, part.flash - dt);
    const x = craft.x + part.dx;
    const y = craft.y + part.dy + part.muzzle;
    if (part.hull <= 0 || x < 23 || x > WIDTH - 23) continue;
    if (part.charge > 0) {
      part.charge = Math.max(0, part.charge - dt);
      if (!part.charge) {
        flight.fan(x, y, part.aim, pattern.shots, .20, pattern.roundSpeed, 'lance');
        flight.signal('bossFire', x, y);
      }
      continue;
    }
    part.cycle -= dt;
    if (part.cycle > 0) continue;
    part.cycle = pattern.cadence;
    part.charge = .62;
    part.aim = flight.angleToPilot(x, y);
    flight.signal('charge', x, y);
  }
}
