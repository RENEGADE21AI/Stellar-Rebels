import { WIDTH } from './catalog.mjs';

export const debrisStyles = ['rock', 'rock-alt', 'rock-alt-2'];
const spacing = 169;
const routeWidth = 38;
const rows = 5;
const fieldClearance = 14;

export function scheduleDebris(stage) {
  const safeTime = (t) => t >= 0 && t + fieldClearance <= stage.bossAt &&
    !stage.cruisers.some(({ at }) => t < at + 15 && t + fieldClearance > at);
  const boundaries = [0, stage.bossAt - fieldClearance,
    ...stage.cruisers.flatMap(({ at }) => [at - fieldClearance, at + 15])].filter(safeTime);
  return stage.terrain.flatMap((beat) => {
    const [at, kind, lane] = beat;
    if (kind !== 'wall' || safeTime(at)) return [beat];
    const nearest = boundaries.reduce((best, candidate) => Math.abs(candidate - at) < Math.abs(best - at) ? candidate : best, Infinity);
    return Number.isFinite(nearest) ? [[nearest, kind, lane]] : [];
  }).sort((a, b) => a[0] - b[0]);
}

export function debrisRouteX(route, y) {
  const index = route.findIndex((point) => point.y <= y);
  if (index < 0) return route.at(-1).x;
  if (!index) return route[0].x;
  const behind = route[index - 1];
  const ahead = route[index];
  return behind.x + (ahead.x - behind.x) * (behind.y - y) / (behind.y - ahead.y);
}

export function createDebrisField(random, slot) {
  const between = (low, high) => low + (high - low) * random();
  const west = between(88,107);
  const east = west + between(159,170);
  const startEast = slot === 2 ? random() < .5 : slot > 2;
  const first = startEast ? east : west;
  const route = [{ x:first, y:-66 }];
  let onEast = startEast;
  const hold = random() < .4 ? 1 + Math.floor(random() * 3) : 0;
  for (let row = 1; row < rows; row++) {
    if (row !== hold) onEast = !onEast;
    const bank = onEast ? east : west;
    const trim = row === 4 && random() < .45 ? (WIDTH / 2 - bank) * .28 : between(-7,7);
    route.push({ x:bank + trim, y:-66 - row * spacing });
  }
  const rocks = [];
  function keepClear(x, y, size) {
    // Reserve the part of the moving route swept while the pilot and rock can meet.
    const reach = Math.ceil(size * .48) + 11;
    const edge = [y - reach,y,y + reach].map((depth) => debrisRouteX(route, depth));
    return x < Math.min(...edge) - reach - routeWidth / 2 || x > Math.max(...edge) + reach + routeWidth / 2;
  }
  function addRock(x, y, size) {
    rocks.push({ x, y, size, art:debrisStyles[Math.floor(random() * debrisStyles.length)] });
  }
  for (const point of route) {
    for (let lane = 0; lane < 11; lane++) {
      const x = Math.round(14 + lane * 35.6 + between(-10,10));
      const y = Math.round(point.y + between(-27,27));
      const size = Math.round(between(28,54));
      if (keepClear(x, y, size)) addRock(x, y, size);
    }
  }
  // Close incidental straight lanes using a handful of rocks away from the reserved turns.
  const offset = between(0,9);
  for (let x = 20 + offset; x < WIDTH - 16; x += 10) {
    if (rocks.some((rock) => Math.abs(rock.x - x) < rock.size * .34 + 6)) continue;
    const point = route.reduce((far, row) => Math.abs(row.x - x) > Math.abs(far.x - x) ? row : far);
    const y = Math.round(point.y + between(-19,19));
    const size = Math.round(between(37,48));
    if (keepClear(x, y, size)) addRock(x, y, size);
  }
  return { kind:'wall', x:first, y:route[0].y, width:routeWidth, route, rocks, age:0, windup:1.12,
    origin:{ x:first, y:-20 }, speed:between(121,141), corridor:true };
}
