import { BOSSES, WIDTH, HEIGHT } from './catalog.mjs';
import { ambushLeader, arrayStabilizer, borderBastion, communicationPost, defenseCitadel, flagship, fleetVanguard,
  gravityPlatform, gridControl, harrow, hunterLeader, imperialFlagship, railShip, rearGuard, relayCarrier,
  salvagePlatform, siegeCruiser, spectralBeacon, startWallWarning, supplyTender } from './boss-patterns.mjs';
import { advanceWraith, enterWraith } from './wraith.mjs';
import { bodiesMeet, pilotBody, railBody, rememberPosition } from './collision.mjs';
import { flightApproach, pursuitPosition } from './travel.mjs';

const reversedHulls = new Set(['wraith','crown','emperor','hunterLead']);
const longHulls = new Set(['interdictor','convoy','siegeShip']);

function pursuitHull(kind, spec) {
  if (longHulls.has(kind)) {
    const size = kind === 'siegeShip' ? 424 : kind === 'convoy' ? 350 : 316;
    const sockets = kind === 'siegeShip' ? [[-.161,.27],[.161,.27],[-.057,.431],[.057,.431]]
      : [[-.161,.27],[.161,.27],[0,.437]];
    return { ...spec, size, artSize:size, art:'cruiser-long', body:'cruiser-long',
      parts:spec.parts.map(([, , role, hull], i) => [sockets[i][0] * size, sockets[i][1] * size, role, hull]) };
  }
  if (kind === 'emperor') {
    return { ...spec, coreY:91, coreHit:[[-27,72,27,111]], parts:spec.parts.map(([x, y, role, hp]) => [x, y - 6, role, hp]) };
  }
  return spec;
}

export function launchBoss(flight, kind) {
  const spec = flight.pursuit ? pursuitHull(kind, BOSSES[kind]) : BOSSES[kind];
  const artScale = spec.size / (spec.artSize ?? spec.size);
  const entryY = -Math.ceil(spec.size / 2) - 8;
  const arrivalY = spec.arrivalY ?? 230;
  const approach = flight.pursuit ? flightApproach(kind, arrivalY - entryY) : null;
  const entryTime = approach?.entryTime ?? 1.55;
  for (const enemy of flight.enemies) enemy.retreat = true;
  flight.spawns.length = 0;
  flight.boss = {
    kind, spec, artScale, x: WIDTH / 2, y:entryY, entryY, arrivalY, approach,
    turn:approach && reversedHulls.has(kind) ? Math.PI : 0, hull:spec.hull, age:0, timer:approach ? entryTime + 1.35 : 2.9, attack:0,
    entryTime, hitFlash: 0, parts: spec.parts.map(([dx, dy, role, hull]) => ({
      dx:dx * artScale, dy:dy * artScale, size:43 * artScale,
      radius:12.5 * artScale, muzzle:14 * artScale, hull:hull ?? spec.partHull, flash:0,
      ...(role ? { role } : {})
    }))
  };
  if (kind === 'wraith') enterWraith(flight, flight.boss);
  flight.signal('boss', flight.boss.x, 125, spec.name);
  flight.message(spec.intro, 2.25, 'warning', spec.name);
}

export function bossPartPosition(boss, part) {
  return { x: boss.x + part.dx, y: boss.y + part.dy, radius: part.radius ?? 12.5 };
}

function gatekeeperAttack(flight, boss, phase) {
  const aim = boss.attack % 2 === 1;
  for (const part of boss.parts) {
    if (part.hull <= 0) continue;
    const { x, y } = bossPartPosition(boss, part);
    const muzzleY = y + part.muzzle;
    const angle = aim ? flight.angleToPilot(x, muzzleY) : Math.PI/2 + Math.sign(part.dx) * .22;
    flight.fan(x, muzzleY, angle, phase ? 5 : 3, .16, 205 + 24 * phase, 'bolt');
  }
  const width = phase ? .19 : .23;
  flight.fan(boss.x, boss.y + 27 * boss.artScale, Math.PI/2, phase ? 9 : 5, width, phase ? 134 : 119, 'seed');
  boss.timer = phase ? 1.59 : 2.12;
}

const attacks = {
  gatekeeper:gatekeeperAttack, warden:harrow, matron:relayCarrier, tyrant:railShip, siphon:gravityPlatform, crown:flagship,
  interdictor:rearGuard, convoy:supplyTender, bulwark:borderBastion, scavenger:salvagePlatform, beacon:spectralBeacon,
  vanguard:fleetVanguard, citadel:defenseCitadel, stabilizer:arrayStabilizer, emperor:imperialFlagship,
  gridControl, ambushLead:ambushLeader, hunterLead:hunterLeader, signalPost:communicationPost, siegeShip:siegeCruiser
};

export function advanceBoss(flight, dt) {
  const b = flight.boss;
  if (!b) return;
  rememberPosition(b);
  b.age += dt;
  b.hitFlash = Math.max(0, b.hitFlash - dt);
  for (const part of b.parts) part.flash = Math.max(0, part.flash - dt);
  const entry = Math.min(1, b.age / b.entryTime);
  const arrivalY = b.arrivalY ?? b.spec.arrivalY ?? 230;
  if (b.approach) {
    b.y = pursuitPosition(b, b.age);
    flight.forwardSpeed = Math.max(0, b.approach.speed + (b.y - b.py) / dt);
  } else {
    b.y = b.entryY + (arrivalY - b.entryY) * (1 - (1 - entry) ** 2) + 7 * Math.sin(b.age * 1.1) * entry;
  }
  b.x = b.approach?.fixed ? WIDTH / 2 : WIDTH / 2 + b.spec.motion * Math.sin(Math.max(0, b.age - b.entryTime) * .78);
  if (b.kind === 'wraith') {
    advanceWraith(flight, b, dt);
    return;
  }
  b.timer -= dt;
  if (b.age < b.entryTime || b.timer > 0) return;
  b.attack++;
  attacks[b.kind](flight, b, Number(b.hull <= b.spec.hull * .47));
  if (flight.veteran) {
    b.timer *= .91;
    if (b.attack % 3 === 0) {
      const x = WIDTH * (b.attack % 2 ? .18 : .82);
      flight.fan(x, b.y + 60, Math.PI / 2, 3, .15, 133, 'seed');
    }
  }
  flight.signal('bossFire', b.x, b.y + 23);
}

export function operatorWarnings(flight, dt) {
  for (const warning of flight.hazards) {
    const delayed = warning.age < 0;
    warning.age += dt;
    if (delayed && warning.age >= 0) startWallWarning(flight, warning);
    if (warning.age < warning.windup) continue;
    if (warning.kind === 'wall' && warning.triggered) warning.rowY += warning.rowSpeed * dt;
    if (!warning.triggered) {
      warning.triggered = true;
      flight.signal('hazard', warning.x, warning.y ?? 150);
      if (warning.kind === 'wall') {
        warning.rowY = warning.y;
        warning.rowSpeed = warning.speed * flight.pressure;
        for (const { x, y, size, pace, art } of warning.rocks) {
          flight.projectile(x, y, Math.PI / 2, warning.speed * (pace ?? 1), 'rock',
            { size, ...(flight.pursuit && { art:art ?? 'rock', corridor:warning.corridor }) });
        }
      }
    }
    if (warning.kind === 'rail' && bodiesMeet(pilotBody(flight), railBody(warning))) {
      flight.damage(warning.x, flight.player.y, undefined, 'rail');
    }
    if (warning.kind === 'pull' && flight.player.y >= warning.y) {
      const offset = warning.x - flight.player.x;
      const falloff = 1 - Math.abs(offset) / (warning.width / 2);
      if (falloff > 0) flight.drag(Math.sign(offset) * Math.min(Math.abs(offset), (48 + 60 * falloff) * dt), 0);
    }
  }
  flight.hazards = flight.hazards.filter((warning) => warning.kind === 'wall'
    ? !warning.triggered || warning.rowY < HEIGHT + 17
    : warning.age < warning.windup + warning.live);
}
