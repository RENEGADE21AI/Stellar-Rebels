import { HEIGHT, WIDTH } from './catalog.mjs';
import { rememberPosition } from './collision.mjs';

const profile = { size: 214, hit: 25, parts: [[-41.2, 19], [41.2, 19]] };
const margin = 128;
const patterns = {
  patrol: { lane:.33, drift:.06, transit:10.5, turretHull:9, shots:2, roundSpeed:154, cadence:3.1, title:'Patrol cruiser' },
  heavy: { lane:.67, drift:-.06, transit:14, turretHull:14, shots:3, roundSpeed:169, cadence:2.7, title:'Heavy cruiser' }
};

export function launchCruiser(flight, variant = 'heavy') {
  const pattern = patterns[variant];
  const x = WIDTH * pattern.lane;
  for (const enemy of flight.enemies) if (enemy.loop) enemy.retreat = true;
  flight.cruiser = { kind:'cruiser', spec:profile, variant, pattern, x, y:-margin, age:0, hull:1,
    parts: profile.parts.map(([dx, dy], i) => ({ dx, dy, radius:10.2, size:33, muzzle:14.8,
      hull:pattern.turretHull, flash:0, cycle:1.2 + i * 1.35, charge:0, aim:0 })) };
  flight.signal('cruiserEnter', x, 0, variant);
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
  const progress = craft.age / pattern.transit;
  craft.x = WIDTH * (pattern.lane + pattern.drift * Math.sin(progress * Math.PI));
  craft.y = -margin + (HEIGHT + margin * 2) * progress;
  for (const part of craft.parts) {
    part.flash = Math.max(0, part.flash - dt);
    const x = craft.x + part.dx;
    const y = craft.y + part.dy + part.muzzle;
    if (part.hull <= 0 || y < 22 || y > HEIGHT * .62 || y > flight.player.y - 84) {
      part.charge = 0;
      continue;
    }
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
