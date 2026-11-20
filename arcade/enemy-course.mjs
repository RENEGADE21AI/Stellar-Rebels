import { HEIGHT, WIDTH } from './catalog.mjs';

const diveAt = 2.15;
export const diveWarningAt = diveAt - .54;
const courses = {
  scout:   { down: 1.12, sway: 19, frequency: 1.9, crossing: 35 },
  lancer:  { down: .91, sway:  9, frequency: 1.1, crossing: 16, check: 2.0 },
  diver:   { down: .89, sway: 12, frequency: 1.8, crossing:  9 },
  sweeper: { down: .88, sway: 51, frequency: 1.12, crossing: 45 },
  escort:  { down: .83, sway: 10, frequency: 1.2, crossing: 16, check: 2.8 },
  relay:   { down: .83, sway: 12, frequency: 1.1, crossing: 10, check: 1.9 },
  phantom: { down: .93, sway: 29, frequency: 1.4, crossing: 23 }
};

export function fliesBack(kind) {
  return kind === 'scout' || kind === 'diver';
}

export function flyEnemy(flight, enemy, dt) {
  const e = enemy;
  const course = courses[e.kind];
  const previousX = e.x;
  const previousY = e.y;
  if (e.kind === 'diver' && e.age >= diveAt && !e.dive) {
    e.dive = true;
    const aim = flight.angleToPilot(e.x, e.y);
    e.vector = Math.max(.63, Math.min(Math.PI - .63, aim + (e.returned ? e.side * .25 : 0)));
    flight.signal('dash', e.x, e.y);
  }
  if (e.dive) {
    e.x += Math.cos(e.vector) * 225 * dt;
    e.y += Math.max(.55, Math.sin(e.vector)) * 225 * dt;
    // Finish the pass on screen even when the pilot moved to the edge during the windup.
    e.x = Math.max(16, Math.min(WIDTH - 16, e.x));
  } else if (e.group) {
    // Linked wings advance together. Breaking the relay releases the individual craft.
    e.y += 81 * dt;
    e.x = e.home + e.side * 11 * Math.sin(e.age * 1.28);
  } else {
    const checking = course.check && e.age > course.check && e.age < course.check + 1.45;
    const speed = e.spec.speed * course.down * e.pace;
    e.y += speed * (checking ? .33 : e.returned ? 1.09 : 1) * dt;
    const sweep = Math.sin(Math.min(e.age / 5.6, 1) * Math.PI / 2);
    const cross = (e.returned ? 83 : course.crossing) * sweep;
    const phase = e.returned ? Math.PI / 2 : 0;
    const weave = course.sway * (Math.sin(e.age * course.frequency + phase) - Math.sin(phase));
    const x = e.home + e.side * (cross + weave);
    e.x = Math.max(18, Math.min(WIDTH - 18, x));
  }
  const heading = Math.atan2(previousX - e.x, Math.max(.1, e.y - previousY));
  e.turn += (heading - e.turn) * Math.min(1, 9 * dt);
}

export function inFiringRange(enemy, pilot) {
  return !enemy.dive && enemy.y > 92 && enemy.y < HEIGHT * .56 && enemy.y < pilot.y - 84;
}
