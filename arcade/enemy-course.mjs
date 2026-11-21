import { HEIGHT, WIDTH } from './catalog.mjs';

const diveAt = 1.98;
export const diveWarningAt = diveAt - .58;
export const diveSpeed = 332;
export const shardArmTime = .48;
const returnSpeed = 385;
const returnBendY = HEIGHT - 40;
const returnTop = -54;
const returnEntryY = -34;
const returnClimbTime = (returnBendY - returnTop) / returnSpeed;
const courses = {
  scout:   { down: 1.12, sway: 22, frequency: 2.32, crossing: 37 },
  lancer:  { down: .91, sway:  9, frequency: 1.1, crossing: 16, check: 2.0 },
  diver:   { down: .89, sway: 12, frequency: 1.8, crossing:  9 },
  sweeper: { down: .88, sway: 59, frequency: 1.29, crossing: 58 },
  escort:  { down: .83, sway: 10, frequency: 1.2, crossing: 16, check: 2.8 },
  relay:   { down: .83, sway: 12, frequency: 1.1, crossing: 10, check: 1.9 },
  phantom: { down: .93, sway: 29, frequency: 1.4, crossing: 23 },
  splitter: { down: .85, sway: 14, frequency: 1.15, crossing: 22 }
};

export function fliesBack(kind) {
  return kind === 'scout' || kind === 'diver';
}

function cubic(from, first, second, to, t) {
  const s = 1 - t;
  return s ** 3 * from + 3 * s * s * t * first + 3 * s * t * t * second + t ** 3 * to;
}

export function edgeReturnCourse(enemy, edge, entryX, dt) {
  const bendTime = .45 + Math.abs(edge - enemy.x) / 360;
  const entryTime = .52 + Math.abs(entryX - edge) / 460;
  const outgoing = bendTime / (3 * dt);
  return {
    edge, entryX, time: 0, bendTime, entryTime,
    fromX: enemy.x, fromY: enemy.y,
    outgoingX: Math.max(16, Math.min(WIDTH - 16, enemy.x + (enemy.x - enemy.px) * outgoing)),
    outgoingY: enemy.y + (enemy.y - enemy.py) * outgoing
  };
}

export function flyReturning(enemy, dt) {
  const loop = enemy.loop;
  loop.time += dt;
  const aboveTime = loop.time - loop.bendTime - returnClimbTime;
  if (loop.time < loop.bendTime) {
    // Preserve the outgoing dive tangent, then bend around the lower boundary into a vertical climb.
    const t = loop.time / loop.bendTime;
    enemy.x = cubic(loop.fromX, loop.outgoingX, loop.edge, loop.edge, t);
    enemy.y = cubic(loop.fromY, loop.outgoingY, returnBendY + returnSpeed * loop.bendTime / 3, returnBendY, t);
  } else if (aboveTime < 0) {
    enemy.x = loop.edge;
    enemy.y = returnTop - returnSpeed * aboveTime;
  } else {
    // Cross to the next lane above the screen and emerge facing into the arena.
    const t = Math.min(1, aboveTime / loop.entryTime);
    enemy.x = cubic(loop.edge, loop.edge, loop.entryX, loop.entryX, t);
    enemy.y = cubic(returnTop, returnTop - returnSpeed * loop.entryTime / 3, returnEntryY - 180 * loop.entryTime / 3, returnEntryY, t);
  }
  const dx = enemy.x - enemy.px;
  const dy = enemy.y - enemy.py;
  if (dx || dy) enemy.turn = Math.atan2(-dx, dy);
  return aboveTime >= loop.entryTime;
}

export function flyEnemy(flight, enemy, dt) {
  const e = enemy;
  if (e.kind === 'shard') {
    const armed = e.age >= shardArmTime;
    e.y += e.spec.speed * e.pace * (armed ? 1 : .41) * dt;
    const outward = e.splitSide ?? e.side;
    const sweep = Math.max(.15, 1 - (e.age - shardArmTime) * .58);
    e.courseX += outward * (armed ? 126 * sweep : 52) * dt;
    e.courseX = Math.max(16, Math.min(WIDTH - 16, e.courseX));
    return;
  }
  const course = courses[e.kind];
  if (e.kind === 'diver' && e.age >= diveWarningAt && e.diveAim == null) {
    const aim = flight.angleToPilot(e.x, e.y);
    e.diveAim = Math.max(.63, Math.min(Math.PI - .63, aim + (e.returned ? e.side * .25 : 0)));
  }
  if (e.diveAim != null && e.age >= diveAt && !e.dive) {
    e.dive = true;
    e.vector = e.diveAim;
    flight.signal('dash', e.x, e.y);
  }
  if (e.dive) {
    e.courseX += Math.cos(e.vector) * diveSpeed * dt;
    e.y += Math.sin(e.vector) * diveSpeed * dt;
    // Finish the pass on screen even when the pilot moved to the edge during the windup.
    e.courseX = Math.max(16, Math.min(WIDTH - 16, e.courseX));
  } else if (e.group) {
    // Linked wings advance together. Breaking the relay releases the individual craft.
    e.y += 93 * dt;
    e.courseX = e.home + e.side * 11 * Math.sin(e.age * 1.28);
  } else {
    const checking = course.check && e.age > course.check && e.age < course.check + 1.45;
    const speed = e.spec.speed * course.down * e.pace;
    e.y += speed * (checking ? .33 : e.returned ? 1.09 : 1) * dt;
    const sweep = Math.sin(Math.min(e.age / 5.6, 1) * Math.PI / 2);
    const cross = (e.returned ? 83 : course.crossing) * sweep;
    const phase = e.returned ? Math.PI / 2 : 0;
    const weave = course.sway * (Math.sin(e.age * course.frequency + phase) - Math.sin(phase));
    const x = e.home + e.side * (cross + weave);
    if (e.kind === 'lancer' && checking) {
      const offset = e.approachOffset ?? 0;
      const aim = flight.player.x - x - offset;
      const adjustment = Math.max(-27 * dt, Math.min(27 * dt, aim));
      e.approachOffset = Math.max(-32, Math.min(32, offset + adjustment));
    }
    e.courseX = Math.max(18, Math.min(WIDTH - 18, x + (e.approachOffset ?? 0)));
  }
}

export function separateWing(enemies, dt) {
  const offsets = new Array(enemies.length).fill(0);
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.y < -12) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      const spacing = (a.spec.size + b.spec.size) * .42;
      const horizontal = b.courseX - a.courseX;
      const vertical = Math.abs(b.y - a.y);
      if (vertical >= spacing * .79 || Math.abs(horizontal) >= spacing) continue;
      const direction = Math.sign(b.px - a.px || b.home - a.home) || 1;
      const remaining = spacing * Math.sqrt(1 - (vertical / (spacing * .79)) ** 2) - horizontal * direction;
      if (remaining <= 0) continue;
      offsets[i] -= direction * remaining * .55;
      offsets[j] += direction * remaining * .55;
    }
  }
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const goal = Math.max(16 - e.courseX, Math.min(WIDTH - 16 - e.courseX, offsets[i]));
    const step = dt * 96;
    e.laneOffset += Math.max(-step, Math.min(step, goal - e.laneOffset));
    e.x = Math.max(16, Math.min(WIDTH - 16, e.courseX + e.laneOffset));
    const heading = Math.atan2(e.px - e.x, Math.max(.1, e.y - e.py));
    e.turn += (heading - e.turn) * Math.min(1, 9 * dt);
  }
}

export function inFiringRange(enemy, pilot) {
  if (enemy.kind === 'splitter' || enemy.kind === 'shard' && (enemy.age < shardArmTime || enemy.volley > 0)) return false;
  return !enemy.dive && enemy.y > 92 && enemy.y < HEIGHT * .56 && enemy.y < pilot.y - 84;
}
