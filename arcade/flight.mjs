import { AIM_PRECISION, ENDLESS_BOSSES, ENEMIES, GHOST, GUNNER_MUZZLES, HEIGHT, INPUT_RESUME, INPUT_SHIFT, PICKUPS, SHIPS, SPECIALS, WIDTH, enemyMuzzle, formation, hardpointAt, stageById, weaponStats } from './catalog.mjs';
import { advanceBoss, bossPartPosition, launchBoss, operatorWarnings } from './bosses.mjs';
import { markPull, markRail, markWall } from './boss-patterns.mjs';
import { VANE_HULL, breakFormation, commandCharge, linkedVolley, vanePosition } from './formations.mjs';
import { PHYSICAL, SPECTRAL, otherRealm, realmLabel } from './wraith.mjs';
import { flightRandom } from './seed.mjs';
import { advanceCruiser, launchCruiser } from './cruiser.mjs';
import { fliesBack, flyEnemy, inFiringRange, separateWing, shardArmTime } from './enemy-course.mjs';
import { bodiesMeet, bossBody, contactTime, coreBody, enemyBody, friendlyBody, hostileBody, moduleBody,
  pickupBody, pilotBody, pilotReceiver, rememberPosition, shieldModules, vaneBody, wraithWingBody } from './collision.mjs';

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const bounds = { left: 17, right: WIDTH - 17, top: 235, bottom: HEIGHT - 37 };
const loopTurn = .27;
const maxReturning = 3;
const maxReturns = 2;
const returnSpeed = 620;
const returnLanes = [.18, .34, .50, .66, .82].map((lane) => lane * WIDTH);
const projectileRadii = { bolt: 4, seed: 4.5, rock: 12, lance: 4.8, blade: 5, pulse: 4.7, orb: 5.1, specter: 5.4 };
const duration = (value) => Math.max(0, value);

function impactAt(shot, time) {
  const x = shot.px ?? shot.x;
  const y = shot.py ?? shot.y;
  return { x:x + (shot.x - x) * time, y:y + (shot.y - y) * time };
}

export class Flight {
  constructor(run, options = {}) {
    this.run = run;
    this.random = flightRandom(run.seed);
    this.recordInput = options.recordInput;
    this.ticks = 0;
    this.inputFlags = 0;
    this.nextResumeGuard = 0;
    this.ship = SHIPS[run.ship] ?? SHIPS.kestrel;
    this.special = run.special === 'ion' ? 'ion' : 'ghost';
    this.stats = weaponStats(run.equipment);
    this.stage = stageById(run.stage) ?? stageById(1);
    this.endless = run.mode === 'endless';
    this.status = 'active';
    this.elapsed = 0;
    this.score = 0;
    this.kills = 0;
    this.movement = 0;
    this.combo = 0;
    this.breaks = 0;
    this.bossDamage = 0;
    this.linkedCombat = options.linkedCombat ?? true;
    this.comboTime = 0;
    this.waveIndex = 0;
    this.dropIndex = 0;
    this.terrainIndex = 0;
    this.fireTimer = .25;
    this.spawns = [];
    this.pickups = [];
    this.supplies = [];
    this.enemies = [];
    this.friendly = [];
    this.hostile = [];
    this.hazards = [];
    this.events = [];
    this.boss = null;
    this.cruiser = null;
    this.cleanRecovery = 0;
    this.pressure = 1;
    this.endlessWave = 0;
    this.endlessNext = 1;
    this.endlessBossCount = 0;
    this.nextEndlessBoss = 79;
    this.xIntent = WIDTH / 2;
    this.yIntent = HEIGHT * .80;
    this.player = {
      x: this.xIntent, y: this.yIntent, hull: this.ship.hull + this.stats.hull, maxHull: this.ship.hull + this.stats.hull,
      guard: 1.6, barrier: 0, barrierTime: 0, power: 0, overdrive: 0, bank: 0,
      realm: PHYSICAL, ghostEnergy: GHOST.start, ghostTime: 0, ghostRecovery: 0, ghostEarnAt: 0
    };
    this.message(this.endless ? 'Survive as long as you can.' : this.stage.brief, 3, 'intro', this.endless ? 'Endless' : this.stage.name);
  }

  setDirection(x, y) {
    const length = Math.max(1, Math.hypot(x, y));
    this.keys = { x: x / length, y: y / length };
  }

  get movementBounds() { return bounds; }

  drag(dx, dy) {
    const area = this.movementBounds;
    this.xIntent = clamp(this.xIntent + dx, area.left, area.right);
    this.yIntent = clamp(this.yIntent + dy, area.top, area.bottom);
  }

  reanchor() {
    this.keys = null;
    this.xIntent = this.player.x;
    this.yIntent = this.player.y;
  }

  resumeProtection() {
    this.reanchor();
    if (this.elapsed < this.nextResumeGuard) return false;
    this.nextResumeGuard = this.elapsed + 18;
    this.player.guard = Math.max(this.player.guard, .72);
    this.inputFlags |= INPUT_RESUME;
    return true;
  }

  signal(type, x, y, detail) {
    this.events.push({ type, x, y, detail });
  }

  message(copy, time = 2, kind = 'note', title = '', brief = title || copy) {
    this.notice = { copy, time, kind, title, brief };
  }

  takeEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  get realmHop() { return this.boss?.kind === 'wraith'; }
  get ghostCost() { return this.realmHop ? GHOST.hop : SPECIALS[this.special].cost; }
  get shiftReady() {
    const p = this.player;
    return this.status === 'active' && p.ghostEnergy >= this.ghostCost && !p.ghostTime && !p.ghostRecovery;
  }

  activateGhost() {
    if (!this.shiftReady) return false;
    this.inputFlags |= INPUT_SHIFT;
    const p = this.player;
    p.ghostEnergy -= this.ghostCost;
    if (this.realmHop) {
      p.realm = otherRealm(p.realm);
      p.ghostRecovery = GHOST.hopRecovery;
      this.signal('realmHop', p.x, p.y, p.realm);
    } else if (this.special === 'ion') {
      const { radius, recovery } = SPECIALS.ion;
      const count = this.hostile.length;
      this.hostile = this.hostile.filter((shot) => !shot.live || shot.kind === 'rock' ||
        (shot.realm ?? PHYSICAL) !== PHYSICAL || (shot.x - p.x) ** 2 + (shot.y - p.y) ** 2 > radius ** 2);
      p.ghostRecovery = recovery;
      this.signal('ionBurst', p.x, p.y, { radius, cleared: count - this.hostile.length });
    } else {
      p.realm = SPECTRAL;
      p.ghostTime = GHOST.duration;
      p.ghostRecovery = GHOST.duration + GHOST.recovery;
      this.signal('ghostStart', p.x, p.y);
    }
    return true;
  }

  earnGhost(amount, fromHit = false) {
    const p = this.player;
    if (p.ghostTime || (fromHit && this.elapsed < p.ghostEarnAt)) return;
    if (fromHit) p.ghostEarnAt = this.elapsed + .72;
    p.ghostEnergy = Math.min(GHOST.capacity, p.ghostEnergy + amount);
  }

  damage(x, y, realm = PHYSICAL) {
    const p = this.player;
    if (p.realm !== realm || p.guard || this.status !== 'active') return false;
    if (p.barrier) {
      p.barrier = 0;
      p.barrierTime = 0;
      p.guard = .58;
      this.signal('barrier', p.x, p.y);
      this.message('One hit blocked.', 1.6, 'pickup', 'Shield spent');
      return true;
    }
    p.hull--;
    if (this.boss) this.bossDamage++;
    p.guard = 1.04;
    this.combo = 0;
    this.comboTime = 0;
    this.signal('hurt', p.x, p.y, { x, y });
    if (p.hull <= 0) {
      this.signal('playerDown', p.x, p.y);
      this.status = 'defeat';
    }
    return true;
  }

  pickup(kind, lane, y = 163) {
    const p = PICKUPS[kind];
    if (!p) return;
    const x = WIDTH * lane;
    this.pickups.push({ kind, x, home: x, y, age: 0 });
    this.signal('drop', x, y, kind);
  }

  assignSupplies() {
    for (const supply of this.supplies) {
      const previous = supply.carrier;
      if (previous && !previous.retreat && (previous.loop || previous.y < HEIGHT + 24)) continue;
      if (previous) previous.carrying = null;
      supply.carrier = null;
      let distance = Infinity;
      for (const enemy of this.enemies) {
        if (enemy.hull <= 0 || enemy.retreat || enemy.loop || enemy.carrying || enemy.y < -28 ||
            enemy.kind === 'shard' || enemy.y > Math.min(HEIGHT * .52, this.player.y - 62) ||
            supply.opening && enemy.supplyWing) continue;
        const offset = Math.abs(enemy.x - supply.lane * WIDTH);
        if (offset >= distance) continue;
        distance = offset;
        supply.carrier = enemy;
      }
      if (supply.carrier) supply.carrier.carrying = supply.kind;
    }
  }

  dropEnemySupply(enemy) {
    const slot = this.supplies.findIndex((supply) => supply.carrier === enemy);
    if (slot < 0) return;
    const [supply] = this.supplies.splice(slot, 1);
    enemy.carrying = null;
    if (supply.opening) this.openingPowerGranted = true;
    this.pickup(supply.kind, enemy.x / WIDTH, enemy.y);
  }

  collect(drop) {
    const p = this.player;
    const type = PICKUPS[drop.kind];
    if (drop.kind === 'barrier') {
      p.barrier = 1;
      p.barrierTime = type.duration;
    } else if (drop.kind === 'repair') {
      const add = Math.min(type.hull, p.maxHull - p.hull);
      p.hull += add;
      this.message(add ? `+${add} hull restored` : 'Hull already full', 2, 'pickup', type.name, add ? `+${add} hull` : 'Hull full');
    } else p[drop.kind] = type.duration;
    if (drop.kind !== 'repair') this.message(type.hint, 2.2, 'pickup', type.name);
    this.signal('pickup', p.x, p.y, drop.kind);
  }

  angleToPilot(x, y) {
    return Math.atan2(this.player.y - y, this.player.x - x);
  }

  projectile(x, y, angle, speed, kind = 'bolt', extras = {}) {
    if (this.hostile.length >= 210) return;
    const velocity = speed * this.pressure;
    this.hostile.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
      kind, radius: projectileRadii[kind], age: 0, live: true, ...extras });
  }

  enemyProjectile(source, x, y, angle, speed, kind, extras) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const blocked = this.enemies.some((ally) => {
      if (ally === source || ally.hull <= 0 || ally.retreat || ally.loop) return false;
      const dx = ally.x - x;
      const dy = ally.y - y;
      const depth = dx * cos + dy * sin;
      return depth > 1 && depth < 84 && Math.abs(dx * sin - dy * cos) < ally.spec.hit + 4;
    });
    if (!blocked) this.projectile(x, y, angle, speed, kind, extras);
  }

  fan(x, y, direction, count, spacing, speed, kind, extras, source) {
    for (let i = 0; i < count; i++) {
      const angle = direction + (i - (count - 1) / 2) * spacing;
      if (source) this.enemyProjectile(source, x, y, angle, speed, kind, extras);
      else this.projectile(x, y, angle, speed, kind, extras);
    }
  }

  queue(name, flip = false, reward) {
    const group = name === 'linked' && this.linkedCombat ? this.elapsed : 0;
    if (group && !this.taughtFormation) {
      this.taughtFormation = true;
      this.message('Shoot the bracketed relay to scatter the wing.', 2.5, 'tactic', 'Break their link');
    }
    const wing = formation(name, flip);
    const supplyWing = reward ? { remaining: wing.length } : null;
    for (const e of wing) this.spawns.push({ ...e, group, supplyWing, at: this.elapsed + e.after });
  }

  updateSchedule() {
    if (this.practice) return;
    if (this.endless) {
      this.pressure = 1.08 + Math.min(.45, this.elapsed / 485);
      if (!this.boss && this.elapsed >= this.nextEndlessBoss) {
        const boss = ENDLESS_BOSSES[this.endlessBossCount % ENDLESS_BOSSES.length];
        this.endlessBossCount++;
        this.nextEndlessBoss = this.elapsed + 82;
        launchBoss(this, boss);
      }
      if (!this.boss && this.elapsed >= this.endlessNext) {
        const loop = ['arrow','spear','cross','anvil','hook','splitWing','sweep','escort','break','trap','surge','specters'];
        const unlocked = Math.min(loop.length, 4 + Math.floor(this.elapsed / 23));
        this.queue(loop[this.endlessWave % unlocked], this.endlessWave % 2 === 1);
        this.endlessWave++;
        this.endlessNext = this.elapsed + Math.max(3.25, 6.1 - this.elapsed / 95);
        if (this.endlessWave % 4 === 0) {
          const supply = ['power','barrier','repair','overdrive'][(this.endlessWave / 4 - 1) % 4];
          this.supplies.push({ kind:supply, lane:this.endlessWave % 8 === 0 ? .62 : .36 });
        }
      }
    } else {
      this.pressure = 1.08 + .035 * (this.stage.id - 1) + Math.min(.075, this.elapsed / 1400);
      const beat = this.stage.waves[this.waveIndex];
      if (beat && this.elapsed >= beat[0]) {
        this.queue(beat[1], Boolean(beat[2]), beat[3]);
        this.waveIndex++;
      }
      const drop = this.stage.drops[this.dropIndex];
      if (drop && this.elapsed >= drop[0]) {
        const [, kind, lane, opening] = drop;
        if (!opening || !this.openingPowerGranted) this.supplies.push({ kind, lane, opening });
        this.dropIndex++;
      }
      const terrain = this.stage.terrain?.[this.terrainIndex];
      if (terrain && this.elapsed >= terrain[0]) {
        const [, kind, lane] = terrain;
        if (kind === 'wall') markWall(this, lane);
        if (kind === 'rail') markRail(this, this.player.x, 34);
        if (kind === 'pull') markPull(this, WIDTH * lane);
        if (this.terrainIndex === 0) {
          const cue = { wall:['Follow the open seam.', 'Debris ahead'], rail:['Leave the striped lane.', 'Rail lock'],
            pull:['Move clear of the arrows.', 'Gravity lane'] }[kind];
          this.message(cue[0], 1.8, 'tactic', cue[1]);
        }
        this.terrainIndex++;
      }
      if (!this.sawCruiser && this.stage.cruiserAt && this.elapsed >= this.stage.cruiserAt && this.elapsed < this.stage.bossAt - 15) {
        this.sawCruiser = true;
        launchCruiser(this);
      }
      if (!this.boss && this.elapsed >= this.stage.bossAt) {
        launchBoss(this, this.stage.boss);
      }
    }
  }

  addEnemy(data) {
    if (this.enemies.length >= 35 && this.enemies.filter((enemy) => enemy.hull > 0).length >= 35) return;
    const spec = ENEMIES[data.kind];
    const x = WIDTH * data.lane;
    const enemy = {
      kind: data.kind, spec, x, home: x, courseX: x, laneOffset: 0, y: -32, age: 0, hull: spec.hull,
      fireTimer: data.group && data.kind === 'relay' ? 2.83 : data.kind === 'scout' ? 1.13 + data.lane * .6 : 1.41 + data.lane * .7,
      flash: 0, turn: 0, volley: 0, side: x < WIDTH / 2 ? 1 : -1, dive: false, retreat: false,
      group: data.group, vane: data.group && data.kind === 'relay' ? VANE_HULL : 0, jam: 0,
      supplyWing: data.supplyWing,
      pace: .94 + this.random() * .12,
      loop: null, returnCount: 0, returned: false, returns: data.returns ?? fliesBack(data.kind)
    };
    this.enemies.push(enemy);
    return enemy;
  }

  movePilot(dt, recordedAim = null) {
    const p = this.player;
    rememberPosition(p);
    if (p.ghostTime) {
      p.ghostTime = duration(p.ghostTime - dt);
      if (!p.ghostTime) {
        p.realm = PHYSICAL;
        this.signal('ghostEnd', p.x, p.y);
      }
    } else if (!this.practice && p.ghostEnergy < GHOST.capacity) {
      this.earnGhost(GHOST.recharge * dt);
    }
    p.ghostRecovery = duration(p.ghostRecovery - dt);
    if (this.keys) {
      this.drag(this.keys.x * this.ship.speed * dt, this.keys.y * this.ship.speed * dt);
    }
    const area = this.movementBounds;
    const aimX = recordedAim ? recordedAim[0] : Math.round(this.xIntent * AIM_PRECISION);
    const aimY = recordedAim ? recordedAim[1] : Math.round(this.yIntent * AIM_PRECISION);
    this.recordInput?.(this.ticks, aimX, aimY, this.inputFlags);
    this.inputFlags = 0;
    const dx = clamp(aimX / AIM_PRECISION, area.left, area.right) - p.x;
    const dy = clamp(aimY / AIM_PRECISION, area.top, area.bottom) - p.y;
    const distance = Math.hypot(dx, dy);
    const amount = Math.min(1, this.ship.speed * dt / Math.max(.01, distance));
    p.x += dx * amount;
    p.y += dy * amount;
    this.movement += distance * amount;
    p.bank += (clamp(dx / 25, -.22, .22) - p.bank) * Math.min(1, dt * 17);
    p.guard = duration(p.guard - dt);
    if (p.barrier) {
      p.barrierTime = duration(p.barrierTime - dt);
      if (!p.barrierTime) p.barrier = 0;
    }
    p.power = duration(p.power - dt);
    p.overdrive = duration(p.overdrive - dt);
    this.comboTime = duration(this.comboTime - dt);
    if (!this.comboTime) this.combo = 0;
  }

  shoot(dt) {
    const p = this.player;
    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;
    const boosted = p.overdrive > 0;
    this.fireTimer += Math.max(.095, this.ship.interval / this.stats.rate / (boosted ? 1.56 : 1));
    const emit = ([dx, dy, angle, value], powered = false) => {
      const { x, y } = hardpointAt(p, dx, dy, p.bank);
      const speed = this.run.ship === 'needle' ? 782 : 685;
      this.friendly.push({ x, y, px: x, py: y, vx: Math.sin(angle) * speed, vy: -Math.cos(angle) * speed,
        strength: value * this.stats.damage * (boosted ? 1.21 : 1), powered, live: true, realm: p.realm });
    };
    this.ship.guns.forEach((gun) => emit(gun));
    if (p.power) {
      emit([-13, -5, -.33, .62], true);
      emit([13, -5, .33, .62], true);
    }
    this.signal('shot', p.x, p.y - 12, boosted ? 'boost' : this.run.ship);
  }

  enemyFire(e) {
    const { x, y } = enemyMuzzle(e);
    const aim = this.angleToPilot(x, y);
    e.volley++;
    switch (e.kind) {
      case 'lancer':
        for (const [dx, dy] of GUNNER_MUZZLES) {
          const muzzle = hardpointAt(e, dx, dy, e.turn);
          this.enemyProjectile(e, muzzle.x, muzzle.y, this.angleToPilot(muzzle.x, muzzle.y) + Math.sign(dx) * .095, 218, 'lance');
        }
        break;
      case 'sweeper': this.fan(x, y, Math.PI / 2 + Math.sin(e.volley * 1.52) * .49, 5, .20, 170, 'blade', undefined, e); break;
      case 'escort': this.fan(x, y, Math.PI / 2, 3, .29, 136, 'seed', undefined, e); break;
      case 'relay': this.fan(x, y, aim, 2, .27, 165, 'pulse', undefined, e); break;
      case 'phantom': {
        const physical = e.volley % 2 === 1;
        this.fan(x, y, aim, 3, .24, 158, physical ? 'orb' : 'specter', { realm: physical ? PHYSICAL : SPECTRAL }, e);
        break;
      }
      case 'diver': this.enemyProjectile(e, x, y, aim, 179, 'bolt'); break;
      case 'shard':
        if (e.volley === 1) this.enemyProjectile(e, x, y, clamp(aim, 1.03, 2.11), 183, 'bolt');
        break;
      default: this.enemyProjectile(e, x, y, clamp(aim, 1.13, 2.01), 168, 'bolt'); break;
    }
  }

  startReturn(e) {
    const edge = e.x < WIDTH / 2 ? 15 : WIDTH - 15;
    const newLanes = returnLanes.filter((lane) => Math.abs(lane - e.home) >= WIDTH / 4);
    const distantLanes = newLanes.filter((lane) => Math.abs(lane - e.x) >= WIDTH / 8);
    const candidates = distantLanes.length ? distantLanes : newLanes;
    const entryX = candidates[Math.floor(this.random() * candidates.length)];
    e.loop = { edge, fromX: e.x, fromY: e.y, fromTurn: e.turn, entryX, time: 0, across: 0 };
    e.returnCount++;
    e.group = 0;
    e.vane = 0;
    e.jam = 0;
    e.dive = false;
    this.signal('returnFlyby', edge, e.y);
    if (!this.taughtReturn && !this.endless && this.stage.id === 1 && !(this.notice?.time > 0)) {
      this.taughtReturn = true;
      this.message('Escaping fighters can loop back along the sides.', 2.35, 'tactic', 'Watch the edges');
    }
  }

  moveReturning(e, dt) {
    const loop = e.loop;
    loop.time += dt;
    const heading = loop.edge < WIDTH / 2 ? Math.PI : -Math.PI;
    if (loop.time < loopTurn) {
      const turn = loop.time / loopTurn;
      const eased = turn * turn * (3 - 2 * turn);
      e.x = loop.fromX + (loop.edge - loop.fromX) * eased;
      e.y = loop.fromY + Math.sin(turn * Math.PI) * 10;
      e.turn = loop.fromTurn + (heading - loop.fromTurn) * eased;
      return;
    }
    e.x = loop.edge;
    e.turn = heading;
    if (!loop.across) e.y = Math.max(-34, e.y - returnSpeed * dt);
    if (e.y > -34) return;
    loop.across = Math.min(1, loop.across + dt / .21);
    e.x = loop.edge + (loop.entryX - loop.edge) * loop.across;
    if (loop.across < 1) return;
    const home = loop.entryX;
    Object.assign(e, { x: home, home, courseX: home, laneOffset: 0, y: -34, age: 0, turn: 0,
      fireTimer: 1.58, side: home < WIDTH / 2 ? 1 : -1, diveAim: null, returned: true, loop: null });
    rememberPosition(e);
  }

  moveEnemies(dt) {
    for (const queued of this.spawns) {
      if (queued.at <= this.elapsed) this.addEnemy(queued);
    }
    this.spawns = this.spawns.filter((queued) => queued.at > this.elapsed);
    const wingCommand = new Map(this.enemies.filter((e) => e.group && e.vane > 0 && e.hull > 0 && !e.retreat).map((e) => [e.group, e]));
    const timeToSetPiece = this.endless ? this.nextEndlessBoss - this.elapsed
      : Math.min(this.stage.bossAt, this.sawCruiser ? Infinity : this.stage.cruiserAt ?? Infinity) - this.elapsed;
    const canReturn = !this.boss && !this.cruiser && timeToSetPiece > 3;
    let returning = this.enemies.filter((e) => e.loop && !e.retreat).length;
    const active = [];
    for (const e of this.enemies) {
      if (e.hull <= 0) continue;
      rememberPosition(e);
      e.age += dt;
      e.flash = duration(e.flash - dt);
      e.jam = duration(e.jam - dt);
      if (e.retreat) {
        e.y -= 155 * dt;
        continue;
      }
      if (e.loop) {
        this.moveReturning(e, dt);
        if (!e.loop) returning--;
        continue;
      }
      if (e.group && !wingCommand.has(e.group)) e.group = 0;
      flyEnemy(this, e, dt);
      active.push(e);
    }
    separateWing(active, dt);
    for (const e of active) {
      if (canReturn && e.returns && e.returnCount < maxReturns && returning < maxReturning &&
          e.y >= HEIGHT - e.spec.size * .55 && e.y < HEIGHT + 24) {
        this.startReturn(e);
        returning++;
        continue;
      }
      const linked = wingCommand.get(e.group);
      const canFire = inFiringRange(e, this.player);
      e.fireTimer -= dt;
      if (linked === e && canFire && commandCharge(e)) {
        e.volleyTarget ??= { x:this.player.x, y:this.player.y };
        if (e.fireTimer <= 0) {
          linkedVolley(this, e);
          e.volleyTarget = null;
          e.fireTimer = 2.94 / this.pressure;
        }
      } else if (!linked && canFire && e.fireTimer <= 0 && !e.jam) {
        this.enemyFire(e);
        e.fireTimer = e.spec.cadence / this.pressure;
      }
    }
  }

  scoreKill(value) {
    this.kills++;
    this.earnGhost(3);
    this.combo = this.comboTime > 0 ? this.combo + 1 : 1;
    this.comboTime = 3.6;
    this.score += Math.round(value * (1 + Math.min(8, this.combo - 1) * .08));
  }

  escortProtected(enemy) {
    return enemy.kind === 'escort' && !enemy.loop && this.enemies.some((ally) =>
      ally.kind === 'relay' && ally.hull > 0 && !ally.retreat && !ally.loop && Math.hypot(enemy.x-ally.x, enemy.y-ally.y) < 144);
  }

  splitEnemy(parent) {
    if (this.enemies.filter((enemy) => enemy.hull > 0).length > 33) return;
    const center = clamp(parent.x, 27, WIDTH - 27);
    this.signal('splitterSplit', parent.x, parent.y);
    for (const side of [-1, 1]) {
      const lane = (center + side * 11) / WIDTH;
      const child = this.addEnemy({ kind:'shard', lane });
      Object.assign(child, { y:parent.y - 5, splitSide:side, fireTimer:.91 + side * .045, turn:-side * .16 });
    }
    if (!this.taughtSplit && this.notice?.kind !== 'warning') {
      this.taughtSplit = true;
      this.message('Two Shards fan out when its hull breaks.', 2.4, 'tactic', 'Splitter');
    }
  }

  hitEnemy(e, s) {
    if (e.hull <= 0) return;
    const protectedEscort = this.escortProtected(e);
    e.hull -= s.strength * (protectedEscort ? .27 : e.jam > 0 ? 1.54 : 1);
    e.flash = .075;
    this.earnGhost(1.5, true);
    this.signal(protectedEscort ? 'shieldHit' : 'hit', s.x, s.y);
    if (e.hull <= 0) {
      this.scoreKill(e.spec.value + (e.jam > 0 ? 125 : 0));
      this.signal('enemyDown', e.x, e.y, e.kind);
      this.dropEnemySupply(e);
      if (e.kind === 'splitter') this.splitEnemy(e);
      if (e.supplyWing && !this.openingPowerGranted && --e.supplyWing.remaining === 0) {
        this.openingPowerGranted = true;
        const fallback = this.supplies.findIndex((supply) => supply.opening);
        if (fallback >= 0) {
          const [supply] = this.supplies.splice(fallback, 1);
          if (supply.carrier) supply.carrier.carrying = null;
        }
        this.pickup('power', e.x / WIDTH, e.y);
      }
      if (e.kind === 'relay') {
        if (e.group && e.vane > 0) breakFormation(this, e);
        const exposed = this.enemies.filter((wing) => wing.kind === 'escort' && wing.hull > 0 && !wing.retreat &&
          Math.hypot(e.x-wing.x, e.y-wing.y) < 144 && !this.escortProtected(wing));
        for (const wing of exposed) this.signal('escortExposed', wing.x, wing.y);
        if (exposed.length) this.message('Escorts are exposed.', 2.1, 'pickup', 'Shields down');
      }
    }
  }

  hitModules(b, s, beam) {
    for (const part of b.parts) {
      if (part.hull <= 0) continue;
      const time = contactTime(beam, moduleBody(b, part));
      if (time === Infinity) continue;
      const { x, y } = bossPartPosition(b, part);
      const impact = impactAt(s, time);
      part.hull -= s.strength;
      part.flash = .13;
      this.earnGhost(2.5, true);
      this.signal('hit', impact.x, impact.y);
      if (part.hull <= 0) {
        this.scoreKill(b.kind === 'cruiser' ? 280 : 460);
        this.signal('moduleDown', x, y, b.kind);
        this.message(['cruiser','gatekeeper'].includes(b.kind) ? 'Turret offline' : 'Shield node severed', 1.8, 'pickup');
      }
      return true;
    }
    return false;
  }

  hitCruiser(s, beam = friendlyBody(s)) {
    const b = this.cruiser;
    if (!b) return false;
    if (this.hitModules(b, s, beam)) return true;
    const time = contactTime(beam, bossBody(b));
    if (time === Infinity) return false;
    const impact = impactAt(s, time);
    this.signal('shieldHit', impact.x, impact.y);
    return true;
  }

  hitBoss(s, beam = friendlyBody(s)) {
    const b = this.boss;
    if (!b || b.age < b.entryTime - .25 || b.hull <= 0) return false;
    if (this.hitModules(b, s, beam)) return true;
    const time = contactTime(beam, b.kind === 'wraith' ? coreBody(b) : bossBody(b));
    const hitsCore = time !== Infinity;
    const impact = hitsCore ? impactAt(s, time) : null;
    if (b.kind === 'wraith') {
      const sameRealm = b.realm === (s.realm ?? PHYSICAL);
      if (hitsCore && !sameRealm) {
        this.signal('veilHit', impact.x, impact.y, b.realm);
        return true;
      }
      if (!hitsCore && sameRealm) {
        const armorTime = contactTime(beam, wraithWingBody(b));
        if (armorTime !== Infinity) {
          const armor = impactAt(s, armorTime);
          this.signal('shieldHit', armor.x, armor.y);
          return true;
        }
      }
    }
    if (!hitsCore) return false;
    const shielding = b.parts.some((p) => p.hull > 0);
    const protectedCore = shieldModules(b) && shielding;
    const factor = protectedCore ? 0 : b.kind === 'gatekeeper' && shielding ? .69 : 1;
    b.hull -= s.strength * factor;
    if (factor) this.earnGhost(b.kind === 'wraith' ? 5.5 : 2.5, true);
    b.hitFlash = .075;
    this.signal(protectedCore ? 'shieldHit' : 'hit', impact.x, impact.y);
    if (b.hull <= 0) {
      if (b.kind === 'wraith') this.player.realm = PHYSICAL;
      this.scoreKill(2400 + 750 * this.stage.id);
      this.signal('bossDown', b.x, b.y, b.kind);
      this.hazards = [];
      this.hostile = [];
      if (this.endless) {
        this.boss = null;
        this.nextEndlessBoss = Math.max(this.elapsed + 44, this.nextEndlessBoss);
        this.message(`${b.spec.name} destroyed`, 2.5, 'pickup', 'Threat cleared');
      } else {
        this.status = 'clear';
      }
    }
    return true;
  }

  moveProjectiles(dt) {
    const targets = this.enemies.filter((e) => e.hull > 0 && !e.retreat && !e.loop)
      .map((e) => ({ enemy:e, body:enemyBody(e), relay:e.vane > 0 ? vaneBody(e) : null }));
    for (const s of this.friendly) {
      if (!s.live) continue;
      rememberPosition(s);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const beam = friendlyBody(s);
      let earliest = Infinity;
      let target = null;
      let hitsVane = false;
      for (const entry of targets) {
        if (entry.enemy.hull <= 0) continue;
        const bodyHit = contactTime(beam, entry.body);
        const vaneHit = entry.relay && entry.enemy.vane > 0 ? contactTime(beam, entry.relay) : Infinity;
        const time = Math.min(bodyHit, vaneHit);
        if (time >= earliest) continue;
        earliest = time;
        target = entry.enemy;
        hitsVane = vaneHit <= bodyHit;
      }
      if (target && hitsVane) {
        target.vane -= s.strength;
        const impact = impactAt(s, earliest);
        this.signal('hit', impact.x, impact.y);
        if (target.vane <= 0) breakFormation(this, target);
        s.live = false;
      } else if (target) {
        this.hitEnemy(target, { ...impactAt(s, earliest), strength:s.strength });
        s.live = false;
      } else if (this.hitCruiser(s, beam) || this.hitBoss(s, beam)) s.live = false;
    }
    this.friendly = this.friendly.filter((s) => s.live && s.y > -35 && s.x > -30 && s.x < WIDTH + 30);
    if (this.status !== 'active') return;
    const cockpit = pilotBody(this);
    for (const s of this.hostile) {
      rememberPosition(s);
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.live && (s.realm ?? PHYSICAL) === this.player.realm && !this.player.guard && bodiesMeet(hostileBody(s), cockpit)) {
        if (this.damage(s.x, s.y, s.realm)) s.live = false;
      }
    }
    this.hostile = this.hostile.filter((s) => s.live && s.age < 8 && s.y < HEIGHT + 28 && s.y > -40 && s.x > -42 && s.x < WIDTH + 42);
  }

  step(dt, recordedAim = null) {
    if (this.status !== 'active') return;
    this.elapsed += dt;
    if (this.notice) this.notice.time -= dt;
    this.movePilot(dt, recordedAim);
    this.ticks++;
    this.updateSchedule();
    this.moveEnemies(dt);
    if (this.supplies.length) this.assignSupplies();
    advanceCruiser(this, dt);
    advanceBoss(this, dt);
    this.shoot(dt);
    this.moveProjectiles(dt);
    if (this.status !== 'active') return;
    operatorWarnings(this, dt);
    if (this.status !== 'active') return;
    const p = this.player;
    const cockpit = pilotBody(this);
    for (const e of this.enemies) {
      if (e.kind === 'shard' && e.age < shardArmTime) continue;
      if (p.realm === PHYSICAL && !p.guard && e.hull > 0 && !e.retreat && !e.loop && bodiesMeet(enemyBody(e), cockpit)) {
        if (this.damage(e.x, e.y)) e.retreat = true;
      }
    }
    for (const ship of [this.cruiser, this.boss]) {
      if (!ship || ship.hull <= 0 || p.guard || p.realm !== (ship.realm ?? PHYSICAL)) continue;
      if (bodiesMeet(cockpit, bossBody(ship)) || ship.parts.some((part) => part.hull > 0 && bodiesMeet(cockpit, moduleBody(ship, part)))) {
        this.damage(ship.x, ship.y, ship.realm);
      }
    }
    if (this.status !== 'active') return;
    this.enemies = this.enemies.filter((e) => e.hull > 0 && (e.loop && !e.retreat ||
      e.y < HEIGHT + 40 && e.y > -55 && e.x > -38 && e.x < WIDTH + 38));
    const receiver = pilotReceiver(this);
    this.pickups = this.pickups.filter((drop) => {
      rememberPosition(drop);
      drop.age += dt;
      drop.y += 100 * dt;
      drop.x = drop.home + 12 * Math.sin(drop.age * 2.1);
      if (bodiesMeet(pickupBody(drop), receiver)) {
        this.collect(drop);
        return false;
      }
      return drop.y < HEIGHT + 30;
    });
  }

  terminal() {
    if (this.status === 'active') return null;
    const condition = this.stage.mastery?.condition;
    const met = condition === 'parts' ? this.boss?.parts.every((p) => p.hull <= 0) : condition === 'cleanBoss' && this.bossDamage === 0;
    return { status: this.status, score: this.score, duration: this.elapsed, kills: this.kills, breaks: this.breaks, movement: this.movement,
      mastery: Boolean(!this.endless && this.status === 'clear' && met) };
  }
}
