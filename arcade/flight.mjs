import { AIM_PRECISION, ENDLESS_BOSSES, ENEMIES, GHOST, GUNNER_MUZZLES, HEIGHT, INPUT_RESUME, INPUT_SHIFT, LEGACY_ENDLESS_BOSSES, PICKUPS, PREVIOUS_RULES, RULES_VERSION, SHIPS, SPECIALS, WIDTH, enemyMuzzle, formation, hardpointAt, legacyStageById, stageById, weaponStats } from './catalog.mjs';
import { advanceBoss, bossPartPosition, launchBoss, operatorWarnings } from './bosses.mjs';
import { markPull, markRail, markWall } from './boss-patterns.mjs';
import { VANE_HULL, breakFormation, commandCharge, linkedVolley, vanePosition } from './formations.mjs';
import { PHYSICAL, SPECTRAL, otherRealm, realmLabel } from './wraith.mjs';
import { flightRandom } from './seed.mjs';
import { advanceCruiser, launchCruiser } from './cruiser.mjs';
import { edgeReturnCourse, fliesBack, flyEnemy, flyReturning, inFiringRange, separateWing, shardArmTime } from './enemy-course.mjs';
import { bodiesMeet, bossBody, contactTime, coreBody, enemyBody, exposedCoreBody, friendlyBody, hostileBody, moduleBody,
  pickupBody, pilotBody, pilotReceiver, rememberPosition, shieldModules, vaneBody, wraithWingBody } from './collision.mjs';

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const bounds = { left: 17, right: WIDTH - 17, top: 235, bottom: HEIGHT - 37 };
const maxReturning = 3;
const maxReturns = 2;
const returnLanes = [.18, .34, .50, .66, .82].map((lane) => lane * WIDTH);
const routeStream = 0x9e3779b9;
const endlessFlanks = new Set(['spear', 'anvil', 'hook', 'trap', 'surge', 'specters']);
const armorPerTier = { lancer:.18, sweeper:.21, escort:.18, relay:.14 };
const projectileRadii = { bolt: 4, seed: 4.5, rock: 12, lance: 4.8, blade: 5, pulse: 4.7, orb: 5.1, specter: 5.4 };
const duration = (value) => Math.max(0, value);
const reinforcementWings = ['screen', 'returnPatrol', 'cross'];

function reinforcementSchedule(stage) {
  const encounters = [stage.bossAt, ...(stage.cruisers ?? []).map((ship) => ship.at)];
  const waves = stage.waves.flatMap(([at, , , reward], index) => {
    const after = stage.waves[index + 1];
    const next = after?.[0] ?? stage.bossAt;
    const mid = (at + next) / 2;
    if (reward === 'priority' || after?.[3] === 'priority' || mid < 12 || next - at < 7 ||
        encounters.some((entry) => Math.abs(mid - entry) < 6)) return [];
    const wing = stage.number >= 7 && !stage.side && index % 4 === 2 ? 'specters' : reinforcementWings[index % reinforcementWings.length];
    return [[mid, wing, index % 2]];
  });
  return [...stage.waves, ...waves].sort((a, b) => a[0] - b[0]);
}

function impactAt(shot, time) {
  const x = shot.px ?? shot.x;
  const y = shot.py ?? shot.y;
  return { x:x + (shot.x - x) * time, y:y + (shot.y - y) * time };
}

export class Flight {
  constructor(run, options = {}) {
    this.run = run;
    this.legacy = run.rules === 'arcade-11';
    this.rebalanced = !this.legacy && run.rules !== PREVIOUS_RULES;
    this.random = flightRandom(run.seed);
    this.flankRandom = flightRandom(run.seed, routeStream);
    this.recordInput = options.recordInput;
    this.ticks = 0;
    this.inputFlags = 0;
    this.nextResumeGuard = 0;
    this.ship = SHIPS[run.ship] ?? SHIPS.kestrel;
    this.special = Object.hasOwn(SPECIALS, run.special) ? run.special : 'ghost';
    this.stats = weaponStats(this.legacy ? run.equipment : run.tiers ?? {}, this.rebalanced);
    const getStage = this.legacy ? legacyStageById : stageById;
    this.stage = getStage(run.stage, run.variant ?? run.mode) ?? getStage(1);
    this.mission = this.legacy ? this.stage.id : this.stage.number;
    this.difficultyMission = this.stage.side ? this.stage.requires + 1 : this.mission;
    this.veteran = !this.legacy && (run.variant === 'veteran' || run.mode === 'veteran');
    this.endless = run.mode === 'endless';
    this.waves = this.rebalanced && !this.endless ? reinforcementSchedule(this.stage) : this.stage.waves;
    this.status = 'active';
    this.elapsed = 0;
    this.score = 0;
    this.kills = 0;
    this.movement = 0;
    this.combo = 0;
    this.breaks = 0;
    this.bossDamage = 0;
    this.hullHits = 0;
    this.suppliesCollected = 0;
    this.cruiserTurrets = 0;
    this.operation = this.stage.operation ?? null;
    this.intercepts = 0;
    this.escapes = 0;
    this.transmissionStoppedAt = null;
    this.linkedCombat = options.linkedCombat ?? true;
    this.comboTime = 0;
    this.waveIndex = 0;
    this.dropIndex = 0;
    this.terrainIndex = 0;
    this.cruiserIndex = 0;
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
    this.endlessBridgeStarted = false;
    this.nextEndlessBoss = 79;
    this.xIntent = WIDTH / 2;
    this.yIntent = HEIGHT * .80;
    const maxHull = this.legacy ? (run.ship === 'bastion' ? 6 : this.ship.hull) + this.stats.hull : Math.min(5, this.ship.hull);
    this.player = {
      x: this.xIntent, y: this.yIntent, hull: maxHull, maxHull,
      guard: 1.6, barrier: 0, barrierTime: 0, power: 0, overdrive: 0, bank: 0,
      realm: PHYSICAL, ghostEnergy: GHOST.start, ghostTime: 0, specialTime: 0, ghostRecovery: 0, ghostEarnAt: 0
    };
    this.message(this.endless ? 'Survive as long as you can.' : this.stage.brief, 3, 'intro', this.endless ? 'Endless' : this.stage.name);
  }

  setDirection(x, y) {
    const length = Math.max(1, Math.hypot(x, y));
    this.keys = { x: x / length, y: y / length };
  }

  get movementBounds() { return bounds; }
  get speed() {
    const boost = this.player.specialTime && this.special === 'afterburner' ? SPECIALS.afterburner.speed : 1;
    return this.ship.speed * this.stats.speed * boost;
  }

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
  get ghostDuration() { return this.rebalanced ? GHOST.duration : GHOST.previousDuration; }
  get shiftReady() {
    const p = this.player;
    return this.status === 'active' && p.ghostEnergy >= this.ghostCost &&
      (this.realmHop ? !p.ghostRecovery : !p.ghostTime && !p.specialTime && !p.ghostRecovery);
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
    } else if (this.special === 'ghost') {
      p.realm = SPECTRAL;
      p.ghostTime = this.ghostDuration;
      p.ghostRecovery = this.ghostDuration + GHOST.recovery;
      this.signal('ghostStart', p.x, p.y);
    } else {
      const { duration: activeTime, recovery } = SPECIALS[this.special];
      p.specialTime = activeTime;
      p.ghostRecovery = activeTime + recovery;
      this.signal(this.special, p.x, p.y);
    }
    return true;
  }

  earnGhost(amount, fromHit = false) {
    const p = this.player;
    if (p.ghostTime || (fromHit && this.elapsed < p.ghostEarnAt)) return;
    if (fromHit) p.ghostEarnAt = this.elapsed + .72;
    p.ghostEnergy = Math.min(GHOST.capacity, p.ghostEnergy + amount);
  }

  damage(x, y, realm = PHYSICAL, cause = 'collision') {
    const p = this.player;
    if (p.realm !== realm || p.guard || this.status !== 'active') return false;
    if (p.barrier) {
      p.barrier = 0;
      p.barrierTime = 0;
      p.guard = .58;
      this.signal('barrier', p.x, p.y, { x, y, realm, cause });
      this.message('One hit blocked.', 1.6, 'pickup', 'Shield spent');
      return true;
    }
    p.hull--;
    this.hullHits++;
    if (this.boss) this.bossDamage++;
    p.guard = 1.04;
    this.combo = 0;
    this.comboTime = 0;
    this.signal('hurt', p.x, p.y, { x, y, realm, cause });
    if (p.hull <= 0) {
      this.damageCause = cause;
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
      const add = Math.min(this.rebalanced ? type.hull : 2, p.maxHull - p.hull);
      p.hull += add;
      this.message(add ? `+${add} hull restored` : 'Hull already full', 2, 'pickup', type.name, add ? `+${add} hull` : 'Hull full');
    } else p[drop.kind] = type.duration;
    if (drop.kind !== 'repair') this.message(type.hint, 2.2, 'pickup', type.name);
    this.signal('pickup', p.x, p.y, drop.kind);
    this.suppliesCollected++;
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
    const priorityWave = reward === 'priority' && this.operation?.type === 'priority';
    const supplyWing = reward && !priorityWave ? { remaining: wing.length } : null;
    for (const e of wing) {
      const priority = priorityWave && e.kind === this.operation.kind;
      this.spawns.push({ ...e, group, supplyWing, priority, at: this.elapsed + e.after });
    }
  }

  operationStatus() {
    const operation = this.operation;
    if (operation?.type === 'priority' && !this.boss) {
      return { label:operation.targetName, value:`${Math.min(this.intercepts, operation.required)} / ${operation.required}` };
    }
    if (operation?.type === 'transmission' && this.boss && this.transmissionStoppedAt === null) {
      const charge = Math.max(0, this.boss.age - this.boss.entryTime);
      const left = Math.max(0, Math.ceil(operation.seconds - charge));
      return { label:'Transmission', value:`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` };
    }
    return null;
  }

  failObjective(reason) {
    this.status = 'defeat';
    this.damageCause = reason;
  }

  get nextEndlessBridge() {
    return this.nextEndlessBoss - (this.endlessBossCount ? 18 : 15);
  }

  updateEndlessSchedule() {
    this.pressure = 1.08 + Math.min(.45, this.elapsed / 485);
    if (this.boss) return;
    if (this.elapsed >= this.nextEndlessBoss && !this.cruiser) {
      const roster = this.legacy ? LEGACY_ENDLESS_BOSSES : ENDLESS_BOSSES;
      const boss = roster[this.endlessBossCount % roster.length];
      this.endlessBossCount++;
      this.nextEndlessBoss = this.elapsed + 82;
      this.endlessBridgeStarted = false;
      launchBoss(this, boss);
      return;
    }
    if (this.elapsed >= this.nextEndlessBridge) {
      if (!this.endlessBridgeStarted) {
        this.endlessBridgeStarted = true;
        launchCruiser(this, this.endlessBossCount ? 'heavy' : 'patrol');
        this.queue('screen', this.endlessBossCount % 2 === 0);
        this.countEndlessWing();
      }
      return;
    }
    if (this.elapsed < this.endlessNext || this.nextEndlessBridge - this.elapsed < 4) return;
    const loop = ['arrow','spear','cross','anvil','hook','splitWing','sweep','escort','break','trap','surge','specters'];
    const unlocked = Math.min(loop.length, 4 + Math.floor(this.elapsed / 23));
    const wing = loop[this.endlessWave % unlocked];
    const flip = this.endlessWave >= 8 && endlessFlanks.has(wing) ? this.flankRandom() < .5 : this.endlessWave % 2 === 1;
    this.queue(wing, flip);
    const interval = Math.max(3.25, 6.1 - this.elapsed / 95);
    this.endlessNext = this.elapsed + (this.rebalanced ? interval * .83 : interval);
    this.countEndlessWing();
  }

  countEndlessWing() {
    this.endlessWave++;
    if (this.endlessWave % 4 === 0) {
      const kind = ['power','barrier','repair','overdrive'][(this.endlessWave / 4 - 1) % 4];
      if (!this.supplies.some((supply) => supply.kind === kind)) {
        this.supplies.push({ kind, lane:this.endlessWave % 8 === 0 ? .62 : .36 });
      }
    }
  }

  updateSchedule() {
    if (this.practice) return;
    if (this.endless) {
      this.updateEndlessSchedule();
    } else {
      this.pressure = 1.08 + (this.legacy ? .035 : .013) * (this.difficultyMission - 1) +
        Math.min(.075, this.elapsed / 1400) + (this.veteran ? .055 : 0);
      const beat = this.waves[this.waveIndex];
      if (beat && this.elapsed >= beat[0]) {
        const [, wing, flank, reward] = beat;
        this.queue(wing, flank === 'flank' ? this.flankRandom() < .5 : Boolean(flank), reward);
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
      const encounter = this.stage.cruisers?.[this.cruiserIndex];
      if (encounter && !this.cruiser && this.elapsed >= encounter.at) {
        this.cruiserIndex++;
        if (this.elapsed < this.stage.bossAt - 15) launchCruiser(this, encounter.variant);
      }
      if (!this.boss && this.elapsed >= this.stage.bossAt) {
        if (this.operation?.type === 'priority' && this.intercepts < this.operation.required) {
          this.failObjective('objective-escaped');
          return;
        }
        launchBoss(this, this.stage.boss);
      }
    }
  }

  addEnemy(data) {
    if (this.enemies.length >= 35 && this.enemies.filter((enemy) => enemy.hull > 0).length >= 35) return;
    const spec = ENEMIES[data.kind];
    const x = WIDTH * data.lane;
    const tier = this.endless ? Math.min(3, this.endlessBossCount) :
      this.legacy ? Math.max(0, this.mission - 3) : Math.max(0, (this.difficultyMission - 4) / 3);
    const hull = spec.hull + tier * (armorPerTier[data.kind] ?? 0);
    const enemy = {
      kind: data.kind, spec, x, home: x, courseX: x, laneOffset: 0, y: -32, age: 0, hull,
      fireTimer: data.group && data.kind === 'relay' ? 2.83 : data.kind === 'scout' ? 1.13 + data.lane * .6 : 1.41 + data.lane * .7,
      flash: 0, turn: 0, volley: 0, side: x < WIDTH / 2 ? 1 : -1, dive: false, retreat: false,
      group: data.group, vane: data.group && data.kind === 'relay' ? VANE_HULL : 0, jam: 0,
      supplyWing: data.supplyWing,
      pace: .94 + this.random() * .12,
      loop: null, returnCount: 0, returned: false, priority: Boolean(data.priority), unarmed:Boolean(data.priority && this.operation.unarmed),
      returns: !data.priority && (data.returns ?? fliesBack(data.kind))
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
      this.earnGhost(GHOST.recharge * (this.stats.recharge ?? 1) * dt);
    }
    p.specialTime = duration(p.specialTime - dt);
    p.ghostRecovery = duration(p.ghostRecovery - dt);
    const speed = this.speed;
    if (this.keys) this.drag(this.keys.x * speed * dt, this.keys.y * speed * dt);
    const area = this.movementBounds;
    const aimX = recordedAim ? recordedAim[0] : Math.round(this.xIntent * AIM_PRECISION);
    const aimY = recordedAim ? recordedAim[1] : Math.round(this.yIntent * AIM_PRECISION);
    this.recordInput?.(this.ticks, aimX, aimY, this.inputFlags);
    this.inputFlags = 0;
    const dx = clamp(aimX / AIM_PRECISION, area.left, area.right) - p.x;
    const dy = clamp(aimY / AIM_PRECISION, area.top, area.bottom) - p.y;
    const distance = Math.hypot(dx, dy);
    const amount = Math.min(1, speed * dt / Math.max(.01, distance));
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
    const damageBoost = p.specialTime && this.special === 'overcharge' ? SPECIALS.overcharge.damage : 1;
    this.fireTimer += Math.max(.095, this.ship.interval / this.stats.rate / (boosted ? 1.56 : 1));
    const emit = ([dx, dy, angle, value], powered = false) => {
      const { x, y } = hardpointAt(p, dx, dy, p.bank);
      const speed = this.run.ship === 'needle' ? 782 : 685;
      this.friendly.push({ x, y, px: x, py: y, vx: Math.sin(angle) * speed, vy: -Math.cos(angle) * speed,
        strength: value * this.stats.damage * damageBoost * (boosted ? 1.21 : 1), powered, charged:damageBoost > 1, live: true, realm: p.realm });
    };
    this.ship.guns.forEach((gun) => emit(gun));
    if (p.power) {
      emit([-13, -5, -.33, .62], true);
      emit([13, -5, .33, .62], true);
    }
    this.signal('shot', p.x, p.y - 12, boosted || damageBoost > 1 ? 'boost' : this.run.ship);
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
        const physical = this.rebalanced ? e.realm !== SPECTRAL : e.volley % 2 === 1;
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

  startReturn(e, dt) {
    const edgeInset = e.spec.size * .5 + 8;
    const edge = e.x < WIDTH / 2 ? edgeInset : WIDTH - edgeInset;
    const newLanes = returnLanes.filter((lane) => Math.abs(lane - e.home) >= WIDTH / 4);
    const distantLanes = newLanes.filter((lane) => Math.abs(lane - e.x) >= WIDTH / 8);
    const candidates = distantLanes.length ? distantLanes : newLanes;
    const entryX = candidates[Math.floor(this.random() * candidates.length)];
    e.loop = edgeReturnCourse(e, edge, entryX, dt);
    e.returnCount++;
    e.group = 0;
    e.vane = 0;
    e.jam = 0;
    e.dive = false;
    this.signal('returnFlyby', edge, e.y);
    if (!this.taughtReturn && !this.endless && this.mission === 1 && !(this.notice?.time > 0)) {
      this.taughtReturn = true;
      this.message('Escaping fighters can loop back along the sides.', 2.35, 'tactic', 'Watch the edges');
    }
  }

  moveReturning(e, dt) {
    if (!flyReturning(e, dt)) return;
    const home = e.loop.entryX;
    Object.assign(e, { home, courseX: home, laneOffset: 0, age: 0, turn: 0,
      fireTimer: 1.58, side: home < WIDTH / 2 ? 1 : -1, diveAim: null, returned: true, loop: null });
    rememberPosition(e);
  }

  moveEnemies(dt) {
    for (const queued of this.spawns) {
      if (queued.at <= this.elapsed) this.addEnemy(queued);
    }
    this.spawns = this.spawns.filter((queued) => queued.at > this.elapsed);
    const wingCommand = new Map(this.enemies.filter((e) => e.group && e.vane > 0 && e.hull > 0 && !e.retreat).map((e) => [e.group, e]));
    const timeToSetPiece = this.endless ? this.nextEndlessBridge - this.elapsed
      : Math.min(this.stage.bossAt, this.stage.cruisers?.[this.cruiserIndex]?.at ?? Infinity) - this.elapsed;
    const canReturn = !this.boss && !this.cruiser && timeToSetPiece > 4.2;
    let returning = this.enemies.filter((e) => e.loop && !e.retreat).length;
    const active = [];
    for (const e of this.enemies) {
      if (e.hull <= 0) continue;
      rememberPosition(e);
      e.age += dt;
      if (this.rebalanced && e.kind === 'phantom') {
        const shift = (e.age + (e.side === 1 ? 0 : .37)) % 4.2;
        e.realm = shift >= 2.6 && shift < 3.45 ? SPECTRAL : PHYSICAL;
        e.phaseCue = shift >= 2.34 && shift < 2.6;
      }
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
          e.y >= HEIGHT && e.y < HEIGHT + 24) {
        this.startReturn(e, dt);
        returning++;
        continue;
      }
      if (e.unarmed) continue;
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
    const children = [];
    for (const side of [-1, 1]) {
      const lane = (center + side * 11) / WIDTH;
      const child = this.addEnemy({ kind:'shard', lane });
      Object.assign(child, { y:parent.y - 5, splitSide:side, fireTimer:.91 + side * .045, turn:-side * .16 });
      children.push(child);
    }
    this.signal('splitterSplit', parent.x, parent.y, { parent, children });
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
      if (e.priority) this.intercepts++;
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

  hitModules(b, s, beam, before = Infinity) {
    for (const part of b.parts) {
      if (part.hull <= 0) continue;
      const time = contactTime(beam, moduleBody(b, part));
      if (time >= before) continue;
      const { x, y } = bossPartPosition(b, part);
      const impact = impactAt(s, time);
      part.hull -= s.strength;
      part.flash = .13;
      this.earnGhost(2.5, true);
      this.signal('hit', impact.x, impact.y);
      if (part.hull <= 0) {
        if (b.kind === 'cruiser') this.cruiserTurrets++;
        this.scoreKill(b.kind === 'cruiser' ? 280 : 460);
        this.signal('moduleDown', x, y, b.kind);
        const partName = { turret:'Turret', rail:'Rail battery', shield:'Shield node', stabilizer:'Stabilizer', transmitter:'Transmitter' }[part.role] ??
          (['cruiser','gatekeeper'].includes(b.kind) ? 'Turret' : 'Shield node');
        if (b === this.boss && this.operation?.type === 'transmission' && part.role === this.operation.role &&
            b.parts.every((module) => module.role !== part.role || module.hull <= 0)) {
          this.transmissionStoppedAt = Math.max(0, b.age - b.entryTime);
        }
        const exposed = b.spec.coreHit && b.parts.every((module) => module.hull <= 0);
        this.message(exposed ? 'Core exposed' : `${partName} offline`, 1.8, 'pickup');
      }
      return true;
    }
    return false;
  }

  hitCruiser(s, beam = friendlyBody(s), before = Infinity) {
    const b = this.cruiser;
    if (!b) return false;
    if (this.hitModules(b, s, beam, before)) return true;
    const time = contactTime(beam, bossBody(b));
    if (time >= before) return false;
    const impact = impactAt(s, time);
    this.signal('shieldHit', impact.x, impact.y);
    return true;
  }

  hitBoss(s, beam = friendlyBody(s), before = Infinity) {
    const b = this.boss;
    if (!b || b.age < b.entryTime - .25 || b.hull <= 0) return false;
    if (this.hitModules(b, s, beam, before)) return true;
    const time = contactTime(beam, b.kind === 'wraith' ? coreBody(b) : b.spec.coreHit ? exposedCoreBody(b) : bossBody(b));
    const hitsCore = time < before;
    const impact = hitsCore ? impactAt(s, time) : null;
    if (b.kind === 'wraith') {
      const sameRealm = b.realm === (s.realm ?? PHYSICAL);
      if (hitsCore && !sameRealm) {
        this.signal('veilHit', impact.x, impact.y, b.realm);
        return true;
      }
      if (!hitsCore && sameRealm) {
        const armorTime = contactTime(beam, wraithWingBody(b));
        if (armorTime < before) {
          const armor = impactAt(s, armorTime);
          this.signal('shieldHit', armor.x, armor.y);
          return true;
        }
      }
    }
    if (!hitsCore) {
      if (b.spec.coreHit) {
        const armorTime = contactTime(beam, bossBody(b));
        if (armorTime < before) {
          const armor = impactAt(s, armorTime);
          this.signal('shieldHit', armor.x, armor.y);
          return true;
        }
      }
      return false;
    }
    const shielding = b.parts.some((p) => p.hull > 0);
    const protectedCore = shieldModules(b) && shielding;
    const factor = protectedCore ? 0 : b.kind === 'gatekeeper' && shielding ? .69 : 1;
    b.hull -= s.strength * factor;
    if (factor) this.earnGhost(b.kind === 'wraith' ? 5.5 : 2.5, true);
    b.hitFlash = .075;
    this.signal(protectedCore ? 'shieldHit' : 'hit', impact.x, impact.y);
    if (b.hull <= 0) {
      if (b.kind === 'wraith') this.player.realm = PHYSICAL;
      this.scoreKill(2400 + 750 * this.mission);
      this.signal('bossDown', b.x, b.y, b.kind);
      this.hazards = [];
      this.hostile = [];
      if (this.endless) {
        this.boss = null;
        this.nextEndlessBoss = Math.max(this.elapsed + 44, this.nextEndlessBoss);
        this.endlessNext = this.elapsed + 2.5;
        this.message(`${b.spec.name} destroyed`, 2.5, 'pickup', 'Threat cleared');
      } else {
        this.status = 'clear';
      }
    }
    return true;
  }

  moveProjectiles(dt) {
    const targets = this.enemies.filter((e) => e.hull > 0 && !e.retreat)
      .map((e) => ({ enemy:e, body:enemyBody(e), relay:e.vane > 0 ? vaneBody(e) : null }));
    // Both sides test against the same rock positions for this simulation step.
    const rocks = this.hostile.filter((shot) => shot.live && shot.kind === 'rock').map((shot) => hostileBody({ ...shot,
      px:shot.x, py:shot.y, x:shot.x + shot.vx * dt, y:shot.y + shot.vy * dt, age:shot.age + dt }));
    const rockContact = (body) => {
      let first = Infinity;
      for (const rock of rocks) first = Math.min(first, contactTime(body, rock));
      return first;
    };
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
        if (entry.enemy.hull <= 0 || this.rebalanced && entry.enemy.kind === 'phantom' &&
            (entry.enemy.realm ?? PHYSICAL) !== (s.realm ?? PHYSICAL)) continue;
        const bodyHit = contactTime(beam, entry.body);
        const vaneHit = entry.relay && entry.enemy.vane > 0 ? contactTime(beam, entry.relay) : Infinity;
        const time = Math.min(bodyHit, vaneHit);
        if (time >= earliest) continue;
        earliest = time;
        target = entry.enemy;
        hitsVane = vaneHit <= bodyHit;
      }
      const rock = rockContact(beam);
      if (target && earliest < rock && hitsVane) {
        target.vane -= s.strength;
        const impact = impactAt(s, earliest);
        this.signal('hit', impact.x, impact.y);
        if (target.vane <= 0) breakFormation(this, target);
        s.live = false;
      } else if (target && earliest < rock) {
        this.hitEnemy(target, { ...impactAt(s, earliest), strength:s.strength });
        s.live = false;
      } else if (!target && (this.hitCruiser(s, beam, rock) || this.hitBoss(s, beam, rock))) {
        s.live = false;
      } else if (rock !== Infinity) {
        const impact = impactAt(s, rock);
        this.signal('rockHit', impact.x, impact.y);
        s.live = false;
      }
    }
    this.friendly = this.friendly.filter((s) => s.live && s.y > -35 && s.x > -30 && s.x < WIDTH + 30);
    if (this.status !== 'active') return;
    const cockpit = pilotBody(this);
    for (const s of this.hostile) {
      rememberPosition(s);
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (!s.live) continue;
      const canHitPilot = (s.realm ?? PHYSICAL) === this.player.realm && !this.player.guard;
      if (!canHitPilot && !s.trainingShot && (!rocks.length || s.kind === 'rock')) continue;
      const body = hostileBody(s);
      const contact = canHitPilot ? contactTime(body, cockpit) : Infinity;
      const rock = s.kind === 'rock' ? Infinity : rockContact(body);
      if (rock !== Infinity && rock <= contact) {
        const impact = impactAt(s, rock);
        this.signal('rockHit', impact.x, impact.y);
        s.live = false;
      } else if (this.practice && s.trainingShot) {
        if (!s.trainingContact && bodiesMeet(body, cockpit)) {
          s.trainingContact = this.player.ghostTime > 0 ? 'phased' : 'missed';
        }
      } else if (contact !== Infinity) {
        const { x, y } = impactAt(s, contact);
        const cause = s.kind === 'rock' ? 'debris' : s.realm === SPECTRAL ? 'spectral' : 'fire';
        if (this.damage(x, y, s.realm, cause) && s.kind !== 'rock') s.live = false;
      }
    }
    this.hostile = this.hostile.filter((s) => s.live && s.age < 8 && s.y < HEIGHT + 28 &&
      (s.y > -40 || (s.kind === 'rock' && s.vy > 0)) && s.x > -42 && s.x < WIDTH + 42);
  }

  step(dt, recordedAim = null) {
    if (this.status !== 'active') return;
    this.elapsed += dt;
    if (this.notice) this.notice.time -= dt;
    this.movePilot(dt, recordedAim);
    this.ticks++;
    this.updateSchedule();
    if (this.status !== 'active') return;
    this.moveEnemies(dt);
    if (this.supplies.length) this.assignSupplies();
    advanceCruiser(this, dt);
    advanceBoss(this, dt);
    if (this.operation?.type === 'transmission' && this.boss && this.transmissionStoppedAt === null &&
        this.boss.age - this.boss.entryTime >= this.operation.seconds) {
      this.failObjective('objective-transmitted');
      return;
    }
    this.shoot(dt);
    this.moveProjectiles(dt);
    if (this.status !== 'active') return;
    operatorWarnings(this, dt);
    if (this.status !== 'active') return;
    const p = this.player;
    const cockpit = pilotBody(this);
    for (const e of this.enemies) {
      if (e.kind === 'shard' && e.age < shardArmTime) continue;
      const realm = e.realm ?? PHYSICAL;
      if (p.realm === realm && !p.guard && e.hull > 0 && !e.retreat && !e.loop && bodiesMeet(enemyBody(e), cockpit)) {
        if (this.damage(e.x, e.y, realm)) e.retreat = true;
      }
    }
    for (const ship of [this.cruiser, this.boss]) {
      if (!ship || ship.hull <= 0 || p.guard || p.realm !== (ship.realm ?? PHYSICAL)) continue;
      if (bodiesMeet(cockpit, bossBody(ship)) || ship.parts.some((part) => part.hull > 0 && bodiesMeet(cockpit, moduleBody(ship, part)))) {
        this.damage(ship.x, ship.y, ship.realm);
      }
    }
    if (this.status !== 'active') return;
    this.enemies = this.enemies.filter((e) => {
      if (e.hull <= 0) return false;
      const onCourse = e.loop && !e.retreat || e.y < HEIGHT + 40 && e.y > -55 && e.x > -38 && e.x < WIDTH + 38;
      if (!onCourse && e.priority) this.escapes++;
      return onCourse;
    });
    if (this.operation?.type === 'priority' && this.escapes > this.operation.maxEscapes) {
      this.failObjective('objective-escaped');
      return;
    }
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
    const { condition, target } = this.stage.mastery ?? {};
    const met = {
      parts: () => this.boss?.parts.every((part) => part.hull <= 0),
      bossParts: () => this.boss?.parts.every((part) => part.hull <= 0),
      cleanBoss: () => this.bossDamage === 0,
      integrity: () => this.hullHits <= target,
      links: () => this.breaks >= target,
      turrets: () => this.cruiserTurrets >= target,
      supply: () => this.suppliesCollected >= target,
      priorityFlawless: () => this.escapes === 0,
      transmissionFast: () => this.transmissionStoppedAt !== null && this.transmissionStoppedAt <= target
    }[condition]?.();
    return { status: this.status, score: this.score, duration: this.elapsed, kills: this.kills, breaks: this.breaks, movement: this.movement,
      mastery: Boolean(!this.endless && this.status === 'clear' && met), damageCause: this.damageCause,
      ...(this.run.rules === RULES_VERSION && { bossesDefeated: this.endless ? this.endlessBossCount - Number(Boolean(this.boss)) : Number(this.status === 'clear') }) };
  }
}
