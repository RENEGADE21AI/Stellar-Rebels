import { HEIGHT } from './catalog.mjs';
import { spriteBodies } from './silhouettes.mjs';
import { bossPartPosition } from './bosses.mjs';
import { vanePosition } from './formations.mjs';

// The canopy/fuselage takes damage. Wing tips and exhaust leave room for close dodges.
const canopies = {
  kestrel: [[-3, -14, 3, -7], [-6, -7, 6, 9], [-4, 9, 4, 13]],
  needle: [[-2.5, -12, 2.5, -7], [-4.5, -7, 4.5, 7], [-3.5, 7, 3.5, 12]],
  bastion: [[-6, -14, 6, -8], [-9, -8, 9, 8], [-6, 8, 6, 14]]
};

// The Wraith's lit crystal and its supporting cage are the damageable center.
const wraithCore = [[-7,-28,7,-22], [-14,-22,14,-12], [-17,-12,17,10],
  [-14,10,14,20], [-7,20,7,28]];
const wraithWings = spriteBodies.wraith.flatMap(([l,t,r,b]) => {
  const wings = [];
  if (l < -86) wings.push([l,t,Math.min(r,-86),b]);
  if (r > 86) wings.push([Math.max(l,86),t,r,b]);
  return wings;
});

const one = (x, y) => [[-x, -y, x, y]];
const lance = [[-7, -2.25, 6, 2.25]];
const vane = [[-4.5,-8,4.5,8], [-8,-4.5,8,4.5]];
const profileBounds = new WeakMap();
function extent(rects) {
  let result = profileBounds.get(rects);
  if (!result) {
    result = rects.reduce(([l,t,r,b], box) => [Math.min(l,box[0]), Math.min(t,box[1]), Math.max(r,box[2]), Math.max(b,box[3])],
      [Infinity,Infinity,-Infinity,-Infinity]);
    profileBounds.set(rects, result);
  }
  return result;
}

export function rememberPosition(body) {
  body.px = body.x;
  body.py = body.y;
}

function rectAt(rect, body) {
  const cx = (rect[0] + rect[2]) * .5 * body.scale;
  const cy = (rect[1] + rect[3]) * .5 * body.scale;
  const halfX = (rect[2] - rect[0]) * .5 * body.scale;
  const halfY = (rect[3] - rect[1]) * .5 * body.scale;
  const { cos, sin, dx, dy } = body;
  const x = body.x + cx * cos - cy * sin;
  const y = body.y + cx * sin + cy * cos;
  const rx = Math.abs(cos) * halfX + Math.abs(sin) * halfY;
  const ry = Math.abs(sin) * halfX + Math.abs(cos) * halfY;
  return { x, y, halfX, halfY, left: x - rx - Math.max(0, dx), right: x + rx - Math.min(0, dx),
    top: y - ry - Math.max(0, dy), bottom: y + ry - Math.min(0, dy) };
}

function bodyAt(rects, current, turn = 0, scale = 1, parent = current) {
  const body = { rects, scale, turn, x: current.x, y: current.y, cos: Math.cos(turn), sin: Math.sin(turn),
    dx: parent.x - (parent.px ?? parent.x), dy: parent.y - (parent.py ?? parent.y) };
  body.bounds = rectAt(extent(rects), body);
  return body;
}

function overlaps(a, b) {
  return a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;
}

function pieces(body) {
  return body.pieces ??= body.rects.map((rect) => rectAt(rect, body));
}

// Continuous separating-axis test for the translation in this tick. The same
// heading and origin used to draw each sprite also orient its solid pieces.
function pieceContact(a, u, b, v, cosine, sine) {
  const dx = b.dx - a.dx;
  const dy = b.dy - a.dy;
  const startX = v.x - u.x - dx;
  const startY = v.y - u.y - dy;
  let enter = 0;
  let exit = 1;
  for (let i = 0; i < 4; i++) {
    let x, y, radius;
    switch (i) {
      case 0: x = a.cos; y = a.sin; radius = u.halfX + v.halfX * cosine + v.halfY * sine; break;
      case 1: x = -a.sin; y = a.cos; radius = u.halfY + v.halfX * sine + v.halfY * cosine; break;
      case 2: x = b.cos; y = b.sin; radius = v.halfX + u.halfX * cosine + u.halfY * sine; break;
      default: x = -b.sin; y = b.cos; radius = v.halfY + u.halfX * sine + u.halfY * cosine; break;
    }
    const start = startX * x + startY * y;
    const travel = dx * x + dy * y;
    if (Math.abs(travel) < 1e-8) {
      if (Math.abs(start) > radius) return Infinity;
    } else {
      const near = (-radius - start) / travel;
      const far = (radius - start) / travel;
      enter = Math.max(enter, Math.min(near, far));
      exit = Math.min(exit, Math.max(near, far));
      if (enter > exit) return Infinity;
    }
  }
  return enter;
}

export function contactTime(a, b) {
  if (!overlaps(a.bounds, b.bounds)) return Infinity;
  const cosine = Math.abs(a.cos * b.cos + a.sin * b.sin);
  const sine = Math.abs(a.sin * b.cos - a.cos * b.sin);
  let earliest = Infinity;
  for (const u of pieces(a)) {
    for (const v of pieces(b)) {
      if (!overlaps(u, v)) continue;
      const time = pieceContact(a, u, b, v, cosine, sine);
      if (time === 0) return 0;
      earliest = Math.min(earliest, time);
    }
  }
  return earliest;
}

export const bodiesMeet = (a, b) => contactTime(a, b) !== Infinity;

export function pilotBody(flight) {
  return bodyAt(canopies[flight.run.ship] ?? canopies.kestrel, flight.player, flight.player.bank);
}

function spriteBody(key, body, size, turn = 0, parent = body) {
  return bodyAt(spriteBodies[key], body, turn, size * .001, parent);
}

export function enemyBody(e) {
  return spriteBody(e.kind, e, e.spec.size, e.turn);
}

export function vaneBody(e) {
  return bodyAt(vane, vanePosition(e), 0, 1, e);
}

export function bossBody(b) {
  return spriteBody(b.spec.body ?? b.kind, b, b.spec.size);
}

export const exposedCoreBody = (b) => bodyAt(b.spec.coreHit, b);

export function coreBody(b) {
  return bodyAt(wraithCore, b);
}

export function wraithWingBody(b) {
  return bodyAt(wraithWings, b, 0, b.spec.size * .001);
}

export const shieldModules = (b) => b.spec.shielded ?? (b.kind === 'matron' || b.kind === 'crown');

export const moduleSprite = (b, part) => ['turret', 'rail'].includes(part.role) ||
  (!part.role && !shieldModules(b)) ? 'turret' : 'shield-node';

export function moduleBody(b, part) {
  return spriteBody(moduleSprite(b, part), bossPartPosition(b, part), part.size ?? 43, 0, b);
}

const gunProfiles = new Map();
export function friendlyBody(s) {
  const speed = Math.hypot(s.vx ?? 0, s.vy ?? 0);
  const reach = Math.max(1, Math.round(speed * .019 * .365 * 100) / 100);
  if (!gunProfiles.has(reach)) gunProfiles.set(reach, one(reach, 1.38));
  const tip = { x: s.x + (s.vx ?? 0) * .00045, y: s.y + (s.vy ?? 0) * .00045 };
  return bodyAt(gunProfiles.get(reach), tip, Math.atan2(s.vy ?? 0, s.vx ?? 0), 1, s);
}

const projectileProfile = new Map();
function shotProfile(kind, radius) {
  const key = kind + radius;
  if (projectileProfile.has(key)) return projectileProfile.get(key);
  let rects;
  if (kind === 'lance') rects = lance;
  else if (kind === 'specter' || kind === 'blade' || kind === 'seed') {
    const r = radius + (kind === 'specter' ? 1 : 0);
    rects = [[-r-1.25,-r*.25,r+1.25,r*.25], ...one(r*.62,r*.61), ...one(r*.27,r)];
  } else {
    const tall = kind === 'orb' ? radius + 1 : radius - .4;
    const wide = radius + 1.05;
    rects = [...one(wide,tall*.44), ...one(wide*.80,tall*.80), ...one(wide*.46,tall)];
  }
  projectileProfile.set(key, rects);
  return rects;
}

export function hostileBody(s) {
  if (s.kind === 'rock') return spriteBody('rock', s, s.size ?? 42, s.age * .7);
  const turn = Math.atan2(s.vy, s.vx);
  return bodyAt(shotProfile(s.kind, s.radius ?? 4), s, Number.isFinite(turn) ? turn : 0);
}

const supply = [[-12,-8,12,8], [-8,-12,8,12], [-9.5,-9.5,9.5,9.5]];
const receiver = one(6, 7);
export const pilotReceiver = (flight) => bodyAt(receiver, flight.player, flight.player.bank);
export function pickupBody(drop) {
  // The supply halo catches the receiver below the nose of the craft.
  const scale = Math.min(1, drop.age * 3.4);
  return bodyAt(supply, drop, 0, scale);
}

export function railBody(rail) {
  return bodyAt([[-rail.width / 2,0,rail.width / 2,HEIGHT - rail.y]], rail);
}
