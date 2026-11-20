import { ENDLESS_BOSSES, ENEMIES, GHOST, GUNNER_MUZZLES, HEIGHT, PICKUPS, SHIPS, WIDTH, enemyMuzzle, formation, hardpointAt, stageById, weaponStats } from './catalog.mjs';
import { advanceBoss, bossPartPosition, launchBoss, operatorWarnings } from './bosses.mjs';
import { markPull, markRail, markWall } from './boss-patterns.mjs';
import { VANE_HULL, breakFormation, linkedVolley, vanePosition } from './formations.mjs';
import { PHYSICAL, SPECTRAL, otherRealm, realmLabel } from './wraith.mjs';

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const bounds = { left: 17, right: WIDTH - 17, top: 235, bottom: HEIGHT - 37 };
const projectileRadii = { bolt: 4, seed: 4.5, rock: 12, lance: 4.8, blade: 5, pulse: 4.7, orb: 5.1, specter: 5.4 };
const duration = (value) => Math.max(0, value);

function overlap(x, y, radius, other) {
  return globalThis.hitCirclesOverlap({ x, y, r: radius }, { x: other.x, y: other.y, r: other.radius });
}

function shotHits(shot, x, y, radius) {
  const dx = shot.x - shot.px;
  const dy = shot.y - shot.py;
  const projection = dx * dx + dy * dy;
  const t = projection ? clamp(((x - shot.px) * dx + (y - shot.py) * dy) / projection, 0, 1) : 0;
  return overlap(shot.px + dx * t, shot.py + dy * t, 2.4, { x, y, radius });
}

export class Flight {
  constructor(run, options = {}) {
    this.run = run;
    this.ship = SHIPS[run.ship] ?? SHIPS.kestrel;
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
    this.enemies = [];
    this.friendly = [];
    this.hostile = [];
    this.hazards = [];
    this.events = [];
    this.boss = null;
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
      guard: 1.6, barrier: 0, power: 0, overdrive: 0, bank: 0,
      realm: PHYSICAL, ghostEnergy: GHOST.start, ghostTime: 0, ghostRecovery: 0, ghostEarnAt: 0
    };
    this.message(this.endless ? 'Survive as long as you can.' : this.stage.brief, 3, 'intro', this.endless ? 'Endless' : this.stage.name);
  }

  setDirection(x, y) {
    const length = Math.max(1, Math.hypot(x, y));
    this.keys = { x: x / length, y: y / length };
  }

  drag(dx, dy) {
    this.xIntent = clamp(this.xIntent + dx, bounds.left, bounds.right);
    this.yIntent = clamp(this.yIntent + dy, bounds.top, bounds.bottom);
  }

  reanchor() {
    this.keys = null;
    this.xIntent = this.player.x;
    this.yIntent = this.player.y;
  }

  resumeProtection() {
    this.reanchor();
    this.player.guard = Math.max(this.player.guard, .72);
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
  get ghostCost() { return this.realmHop ? GHOST.hop : GHOST.cost; }
  get shiftReady() {
    const p = this.player;
    return this.status === 'active' && p.ghostEnergy >= this.ghostCost && !p.ghostTime && !p.ghostRecovery;
  }

  activateGhost() {
    if (!this.shiftReady) return false;
    const p = this.player;
    p.ghostEnergy -= this.ghostCost;
    if (this.realmHop) {
      p.realm = otherRealm(p.realm);
      p.ghostRecovery = GHOST.hopRecovery;
      this.signal('realmHop', p.x, p.y, p.realm);
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
      p.barrier--;
      p.guard = .58;
      this.signal('barrier', p.x, p.y);
      if (!p.barrier) this.message('Barrier depleted', 2, 'pickup');
      return true;
    }
    p.hull--;
    if (this.boss) this.bossDamage++;
    p.guard = 1.38;
    this.combo = 0;
    this.comboTime = 0;
    this.signal('hurt', p.x, p.y, { x, y });
    if (p.hull <= 0) {
      this.signal('playerDown', p.x, p.y);
      this.status = 'defeat';
    }
    return true;
  }

  pickup(kind, lane) {
    const p = PICKUPS[kind];
    if (!p) return;
    const x = WIDTH * lane;
    this.pickups.push({ kind, x, home: x, y: 163, age: 0 });
    this.signal('drop', x, 163, kind);
  }

  collect(drop) {
    const p = this.player;
    const type = PICKUPS[drop.kind];
    if (drop.kind === 'barrier') p.barrier = type.charges;
    else if (drop.kind === 'repair') {
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

  fan(x, y, direction, count, spacing, speed, kind, extras) {
    for (let i = 0; i < count; i++) this.projectile(x, y, direction + (i - (count - 1) / 2) * spacing, speed, kind, extras);
  }

  queue(name, flip = false) {
    const group = name === 'linked' && this.linkedCombat ? this.elapsed : 0;
    if (group && !this.taughtFormation) {
      this.taughtFormation = true;
      this.message('Shoot the bracketed relay to scatter the wing.', 2.5, 'tactic', 'Break their link');
    }
    for (const e of formation(name, flip)) this.spawns.push({ ...e, group, at: this.elapsed + e.after });
  }

  updateSchedule() {
    if (this.endless) {
      this.pressure = 1 + Math.min(.49, this.elapsed / 570);
      if (!this.boss && this.elapsed >= this.nextEndlessBoss) {
        const boss = ENDLESS_BOSSES[this.endlessBossCount % ENDLESS_BOSSES.length];
        this.endlessBossCount++;
        this.nextEndlessBoss = this.elapsed + 82;
        launchBoss(this, boss);
      }
      if (!this.boss && this.elapsed >= this.endlessNext) {
        const loop = ['arrow','spear','cross','anvil','hook','sweep','escort','break','trap','surge','specters'];
        const unlocked = Math.min(loop.length, 4 + Math.floor(this.elapsed / 23));
        this.queue(loop[this.endlessWave % unlocked], this.endlessWave % 2 === 1);
        this.endlessWave++;
        this.endlessNext = this.elapsed + Math.max(3.5, 6.8 - this.elapsed / 95);
        if (this.endlessWave % 4 === 0) {
          const supply = ['power','barrier','repair','overdrive'][(this.endlessWave / 4 - 1) % 4];
          this.pickup(supply, this.endlessWave % 8 === 0 ? .62 : .36);
        }
      }
    } else {
      const beat = this.stage.waves[this.waveIndex];
      if (beat && this.elapsed >= beat[0]) {
        this.queue(beat[1], Boolean(beat[2]));
        this.waveIndex++;
      }
      const drop = this.stage.drops[this.dropIndex];
      if (drop && this.elapsed >= drop[0]) {
        this.pickup(drop[1], drop[2]);
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
      if (!this.boss && this.elapsed >= this.stage.bossAt) {
        for (const e of this.enemies) e.retreat = true;
        launchBoss(this, this.stage.boss);
      }
    }
  }

  addEnemy(data) {
    if (this.enemies.length >= 35) return;
    const spec = ENEMIES[data.kind];
    const x = WIDTH * data.lane;
    this.enemies.push({
      kind: data.kind, spec, x, home: x, y: -32, age: 0, hull: spec.hull, fireTimer: data.group && data.kind === 'relay' ? 3.1 : 1.55 + data.lane * .8,
      flash: 0, turn: 0, volley: 0, side: x < WIDTH / 2 ? 1 : -1, dive: false, retreat: false,
      group: data.group, vane: data.group && data.kind === 'relay' ? VANE_HULL : 0, jam: 0
    });
  }

  movePilot(dt) {
    const p = this.player;
    if (p.ghostTime) {
      p.ghostTime = duration(p.ghostTime - dt);
      if (!p.ghostTime) {
        p.realm = PHYSICAL;
        this.signal('ghostEnd', p.x, p.y);
      }
    }
    p.ghostRecovery = duration(p.ghostRecovery - dt);
    if (this.keys) {
      this.drag(this.keys.x * this.ship.speed * dt, this.keys.y * this.ship.speed * dt);
    }
    const dx = this.xIntent - p.x;
    const dy = this.yIntent - p.y;
    const distance = Math.hypot(dx, dy);
    const amount = Math.min(1, this.ship.speed * dt / Math.max(.01, distance));
    p.x += dx * amount;
    p.y += dy * amount;
    this.movement += distance * amount;
    p.bank += (clamp(dx / 25, -.22, .22) - p.bank) * Math.min(1, dt * 17);
    p.guard = duration(p.guard - dt);
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
          this.projectile(muzzle.x, muzzle.y, this.angleToPilot(muzzle.x, muzzle.y) + Math.sign(dx) * .095, 207, 'lance');
        }
        break;
      case 'sweeper': this.fan(x, y, Math.PI / 2 + Math.sin(e.volley * 1.52) * .49, 5, .20, 162, 'blade'); break;
      case 'escort': this.fan(x, y, Math.PI / 2, 3, .29, 136, 'seed'); break;
      case 'relay': this.fan(x, y, aim, 2, .27, 157, 'pulse'); break;
      case 'phantom': {
        const physical = e.volley % 2 === 1;
        this.fan(x, y, aim, 3, .24, 151, physical ? 'orb' : 'specter', { realm: physical ? PHYSICAL : SPECTRAL });
        break;
      }
      case 'diver': this.projectile(x, y, aim, 170, 'bolt'); break;
      default: this.projectile(x, y, Math.PI / 2 + e.side * .075, 149, 'bolt'); break;
    }
  }

  moveEnemies(dt) {
    for (const queued of this.spawns) {
      if (queued.at <= this.elapsed) this.addEnemy(queued);
    }
    this.spawns = this.spawns.filter((queued) => queued.at > this.elapsed);
    const wingCommand = new Map(this.enemies.filter((e) => e.group && e.vane > 0 && e.hull > 0).map((e) => [e.group, e]));
    for (const e of this.enemies) {
      e.age += dt;
      e.flash = duration(e.flash - dt);
      e.jam = duration(e.jam - dt);
      if (e.retreat) {
        e.y -= 155 * dt;
        continue;
      }
      const { speed, y: target, drift, cadence } = e.spec;
      const live = e.y > 102;
      if (e.kind === 'diver' && e.age > 2.35 && !e.dive) {
        e.dive = true;
        e.vector = this.angleToPilot(e.x, e.y);
        this.signal('dash', e.x, e.y);
      }
      if (e.dive) {
        e.x += Math.cos(e.vector) * 225 * dt;
        e.y += Math.max(.55, Math.sin(e.vector)) * 225 * dt;
        e.turn = (e.vector - Math.PI / 2) * .62;
      } else if (e.age > (e.group ? 9.1 : 7.1)) {
        e.y += (speed + 13) * dt;
        e.x += e.side * 26 * dt;
      } else {
        e.y += Math.min(speed * dt, (target + Math.sin(e.age * 2.1) * 7 - e.y) * dt * 4);
        const current = e.x;
        const lateral = e.vane > 0 ? Math.min(3, drift) : drift;
        e.x = e.home + lateral * Math.sin(e.age * (e.kind === 'sweeper' ? 1.35 : 1.9)) * e.side;
        e.turn = clamp((e.x - current) * .16, -.16, .16);
      }
      const linked = wingCommand.get(e.group);
      const canFire = live && e.y < HEIGHT * .56 && !e.dive;
      e.fireTimer -= dt;
      if (linked === e && canFire && e.fireTimer <= 0 && e.vane > 0) {
        linkedVolley(this, e);
        e.fireTimer = 3.05;
      } else if (!linked && canFire && e.fireTimer <= 0 && !e.jam) {
        this.enemyFire(e);
        e.fireTimer = cadence / this.pressure;
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
    return enemy.kind === 'escort' && this.enemies.some((ally) =>
      ally.kind === 'relay' && ally.hull > 0 && !ally.retreat && Math.hypot(enemy.x-ally.x, enemy.y-ally.y) < 144);
  }

  hitEnemy(e, s) {
    const protectedEscort = this.escortProtected(e);
    e.hull -= s.strength * (protectedEscort ? .27 : e.jam > 0 ? 1.54 : 1);
    e.flash = .075;
    this.earnGhost(1.5, true);
    this.signal(protectedEscort ? 'shieldHit' : 'hit', s.x, s.y);
    if (e.hull <= 0) {
      this.scoreKill(e.spec.value + (e.jam > 0 ? 125 : 0));
      this.signal('enemyDown', e.x, e.y, e.kind);
      if (e.kind === 'relay') {
        const exposed = this.enemies.filter((wing) => wing.kind === 'escort' && wing.hull > 0 && !wing.retreat &&
          Math.hypot(e.x-wing.x, e.y-wing.y) < 144 && !this.escortProtected(wing));
        for (const wing of exposed) this.signal('escortExposed', wing.x, wing.y);
        if (exposed.length) this.message('Escorts are exposed.', 2.1, 'pickup', 'Shields down');
      }
    }
  }

  hitBoss(s) {
    const b = this.boss;
    if (!b || b.age < b.entryTime - .25 || b.hull <= 0) return false;
    for (const part of b.parts) {
      const { x, y, radius } = bossPartPosition(b, part);
      if (part.hull <= 0 || !shotHits(s, x, y, radius)) continue;
      part.hull -= s.strength;
      part.flash = .13;
      this.earnGhost(2.5, true);
      this.signal('hit', s.x, s.y);
      if (part.hull <= 0) {
        this.scoreKill(460);
        this.signal('moduleDown', x, y, b.kind);
        this.message(b.kind === 'gatekeeper' ? 'Turret offline' : 'Shield node severed', 1.8, 'pickup');
      }
      return true;
    }
    if (!shotHits(s, b.x, b.y + 4, b.spec.hit)) return false;
    if (b.kind === 'wraith' && b.realm !== (s.realm ?? PHYSICAL)) {
      this.signal('veilHit', s.x, s.y, b.realm);
      return true;
    }
    const shielding = b.parts.some((p) => p.hull > 0);
    const protectedCore = (b.kind === 'matron' || b.kind === 'crown') && shielding;
    const factor = protectedCore ? 0 : b.kind === 'gatekeeper' && shielding ? .69 : 1;
    b.hull -= s.strength * factor;
    if (factor) this.earnGhost(b.kind === 'wraith' ? 5.5 : 2.5, true);
    b.hitFlash = .075;
    this.signal(protectedCore ? 'shieldHit' : 'hit', s.x, s.y);
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
    for (const s of this.friendly) {
      s.px = s.x;
      s.py = s.y;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const target = this.enemies.find((e) => {
        if (e.vane <= 0 || e.hull <= 0 || e.retreat) return false;
        const vane = vanePosition(e);
        return shotHits(s, vane.x, vane.y, vane.radius);
      });
      const enemy = !target && this.enemies.find((e) => e.hull > 0 && !e.retreat && shotHits(s, e.x, e.y, e.spec.hit));
      if (target) {
        target.vane -= s.strength;
        this.signal('hit', s.x, s.y);
        if (target.vane <= 0) breakFormation(this, target);
        s.live = false;
      } else if (enemy) {
        this.hitEnemy(enemy, s);
        s.live = false;
      } else if (this.hitBoss(s)) s.live = false;
    }
    this.friendly = this.friendly.filter((s) => s.live && s.y > -35 && s.x > -30 && s.x < WIDTH + 30);
    if (this.status !== 'active') return;
    for (const s of this.hostile) {
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (overlap(s.x, s.y, s.radius, { x: this.player.x, y: this.player.y, radius: this.ship.hit })) {
        if (this.damage(s.x, s.y, s.realm)) s.live = false;
      }
    }
    this.hostile = this.hostile.filter((s) => s.live && s.age < 8 && s.y < HEIGHT + 28 && s.y > -40 && s.x > -42 && s.x < WIDTH + 42);
  }

  step(dt) {
    if (this.status !== 'active') return;
    this.elapsed += dt;
    if (this.notice) this.notice.time -= dt;
    this.movePilot(dt);
    this.updateSchedule();
    this.moveEnemies(dt);
    advanceBoss(this, dt);
    this.shoot(dt);
    this.moveProjectiles(dt);
    if (this.status !== 'active') return;
    operatorWarnings(this, dt);
    if (this.status !== 'active') return;
    const p = this.player;
    for (const e of this.enemies) {
      if (e.hull > 0 && !e.retreat && overlap(e.x, e.y, e.spec.hit, { x: p.x, y: p.y, radius: this.ship.hit })) {
        if (this.damage(e.x, e.y)) e.retreat = true;
      }
    }
    if (this.status !== 'active') return;
    this.enemies = this.enemies.filter((e) => e.hull > 0 && e.y < HEIGHT + 40 && e.y > -55 && e.x > -38 && e.x < WIDTH + 38);
    this.pickups = this.pickups.filter((drop) => {
      drop.age += dt;
      drop.y += 100 * dt;
      drop.x = drop.home + 12 * Math.sin(drop.age * 2.1);
      if (overlap(drop.x, drop.y, 15, { x: p.x, y: p.y, radius: this.ship.hit })) {
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
