import { WIDTH } from './catalog.mjs';
import { rememberPosition } from './collision.mjs';

const profile = { size: 214, hit: 25, parts: [[-41.2, 19], [41.2, 19]] };
const transitTime = 14;
const margin = 116;
const speed = (WIDTH + margin * 2) / transitTime;

export function launchCruiser(flight) {
  for (const enemy of flight.enemies) if (enemy.loop) enemy.retreat = true;
  flight.cruiser = { kind:'cruiser', spec:profile, x:-margin, y:226, age:0, hull:1, speed,
    parts: profile.parts.map(([dx, dy], i) => ({ dx, dy, radius:10.2, size:33, muzzle:14.8,
      hull:14, flash:0, cycle:1.2 + i * 1.35, charge:0, aim:0 })) };
  flight.signal('cruiserEnter', 0, 226);
  flight.message('A cruiser is crossing. Target its turrets.', 3.0, 'warning', 'Cruiser crossing');
}

export function advanceCruiser(flight, dt) {
  const craft = flight.cruiser;
  if (!craft) return;
  rememberPosition(craft);
  craft.age += dt;
  if (craft.age >= transitTime) {
    flight.cruiser = null;
    return;
  }
  craft.x = -margin + speed * craft.age;
  craft.y = 226 + 9 * Math.sin(craft.age * .46);
  for (const part of craft.parts) {
    part.flash = Math.max(0, part.flash - dt);
    const x = craft.x + part.dx;
    const y = craft.y + part.dy + part.muzzle;
    if (part.hull <= 0 || x < 23 || x > WIDTH - 23) continue;
    if (part.charge > 0) {
      part.charge = Math.max(0, part.charge - dt);
      if (!part.charge) {
        flight.fan(x, y, part.aim, 3, .20, 169, 'lance');
        flight.signal('bossFire', x, y);
      }
      continue;
    }
    part.cycle -= dt;
    if (part.cycle > 0) continue;
    part.cycle = 2.7;
    part.charge = .62;
    part.aim = flight.angleToPilot(x, y);
    flight.signal('charge', x, y);
  }
}
