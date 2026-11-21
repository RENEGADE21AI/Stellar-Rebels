import { ENDLESS_BOSSES, ENEMIES, GUNNER_MUZZLES, HEIGHT, PICKUPS, WIDTH, enemyMuzzle, hardpointAt } from './catalog.mjs';
import { bossPartPosition } from './bosses.mjs';
import { commandCharge, vanePosition } from './formations.mjs';
import { SPECTRAL, WRAITH_EMITTER, otherRealm, realmTint } from './wraith.mjs';
import { diveWarningAt, shardArmTime } from './enemy-course.mjs';
import { shieldModules } from './collision.mjs';
import { spriteBodies } from './silhouettes.mjs';

export function spriteUrl(key) {
  return new URL(`./media/sprites/${key}.png`, import.meta.url).href;
}

export function loadSprite(key, signal, wait = 3200) {
  if (signal?.aborted || wait <= 0) return Promise.resolve(null);
  const url = key.endsWith('-playfield') ? new URL(`./media/environment/${key}.webp`, import.meta.url).href : spriteUrl(key);
  const image = new Image();
  return new Promise((resolve) => {
    const cancel = () => finish(null);
    const timer = setTimeout(cancel, wait);
    function finish(sprite) {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      image.onload = image.onerror = null;
      if (!sprite) image.removeAttribute('src');
      resolve(sprite);
    }
    signal?.addEventListener('abort', cancel, { once: true });
    image.onload = () => finish(image);
    image.onerror = cancel;
    image.src = url;
  });
}

const regular = [...Object.keys(ENEMIES), 'turret', 'shield-node', 'rock', ...Object.keys(PICKUPS).map((name) => `pickup-${name}`)];
const playfields = { breach:'vesper', belt:'belt', relay:'relay', sun:'sun', outer:'outer', flagship:'fleet' };
const fallbackEnvironments = new Set(['breach','belt','relay']);
const lerp = (a, b, t) => a + (b - a) * t;
const saturate = (value) => Math.max(0, Math.min(1, value));
const arrivalDuration = .57;
const rockSize = 42;

function seededNoise(i) {
  const n = Math.sin(i * 191.472 + 7.3) * 45784.621;
  return n - Math.floor(n);
}

const stars = Array.from({ length: 102 }, (_, index) => {
  const i = index + 1;
  const streak = i % 11 === 0;
  return { x: seededNoise(i) * WIDTH, y: seededNoise(i + 205) * HEIGHT, streak,
    speed: streak ? 59 : i % 3 === 0 ? 22 : 9, alpha: streak ? .56 : .14 + seededNoise(i + 430) * .27,
    color: i % 5 === 0 ? '#acd9ff' : '#d3dbea' };
});

function line(c, x, y, dx, dy, color, width) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + dx, y + dy);
  c.stroke();
}

function ring(c, x, y, radius, color, width = 1.5) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.arc(x, y, radius, 0, 2 * Math.PI);
  c.stroke();
}

function filled(c, x, y, radius, color) {
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, radius, 0, 2 * Math.PI);
  c.fill();
}

const fighterExhaust = [[0, 22]];

function exhaustTexture(core, flame) {
  const texture = document.createElement('canvas');
  texture.width = 20;
  texture.height = 64;
  const c = texture.getContext('2d');
  const fill = c.createLinearGradient(0, 0, 0, 64);
  fill.addColorStop(0, core);
  fill.addColorStop(.22, flame);
  fill.addColorStop(1, '#286cbc00');
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(1, 0);
  c.quadraticCurveTo(2, 36, 10, 64);
  c.quadraticCurveTo(18, 36, 19, 0);
  c.closePath();
  c.fill();
  return texture;
}

export class FlightScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.sprites = new Map();
    this.sparks = [];
    this.shocks = [];
    this.cameraPulse = 0;
    this.hurtPulse = 0;
    this.arrival = 0;
    this.death = null;
    this.backdrop = document.createElement('canvas');
    this.backdropContext = this.backdrop.getContext('2d', { alpha: false });
    this.resize();
  }

  async prepare(flight, signal) {
    const environment = flight.stage.environment;
    const illustration = `${playfields[environment]}-playfield`;
    const fallback = `env-${environment}`;
    const keyList = new Set([...regular, flight.run.ship, flight.stage.boss, illustration]);
    if (flight.stage.cruiserAt && !flight.endless) keyList.add('cruiser');
    if (flight.endless) for (const boss of ENDLESS_BOSSES) keyList.add(boss);
    if (keyList.has('wraith')) keyList.add('wraith-ghost');
    const sprites = new Map([...this.sprites].filter(([key]) => keyList.has(key) || key === fallback));
    const deadline = performance.now() + 3200;
    const preload = async (key) => {
      if (sprites.has(key)) return;
      const image = await loadSprite(key, signal, deadline - performance.now());
      if (image) sprites.set(key, image);
    };
    await Promise.all([...keyList].map(preload));
    if (!sprites.has(illustration) && fallbackEnvironments.has(environment)) await preload(fallback);
    if (signal?.aborted) return false;
    this.sprites = sprites;
    this.illustration = illustration;
    this.backdropReady = false;
    this.sparks = [];
    this.shocks = [];
    this.cameraPulse = 0;
    this.hurtPulse = 0;
    this.arrival = 0;
    this.death = null;
    return true;
  }

  beginArrival(reduced) {
    this.arrival = reduced ? 0 : arrivalDuration;
  }

  resize() {
    const { clientWidth, clientHeight } = this.canvas;
    const dpr = globalThis.effectiveCanvasDpr(clientWidth, clientHeight, window.devicePixelRatio, 1.45, 1_000_000);
    this.canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
    this.canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
    this.unit = Math.min(clientWidth / WIDTH, clientHeight / HEIGHT) || 1;
    this.backdropReady = false;
  }

  accept(events, reduce) {
    for (const e of events) {
      switch (e.type) {
        case 'hit': this.burst(e.x, e.y, '#adfff1', reduce ? 2 : 5, 84, .18); break;
        case 'shieldHit': this.burst(e.x, e.y, '#a0bfff', 3, 52, .25); break;
        case 'enemyDown': this.explode(e.x, e.y, '#ff8a5c', 17, 13); break;
        case 'splitterSplit': this.burst(e.x, e.y, '#ffc88e', 14, 138, .42); break;
        case 'formationBreak':
          this.explode(e.x, e.y, '#ac91fd', 22, 38);
          this.burst(e.x, e.y, '#a1fff1', 16, 182, .57);
          break;
        case 'unlinked': this.explode(e.x, e.y, '#90ead9', 7, 11); break;
        case 'escortExposed': this.explode(e.x, e.y, '#86c8ff', 11, 19); break;
        case 'moduleDown': this.explode(e.x, e.y, '#ffd478', 25, 21); break;
        case 'bossDown':
          this.explode(e.x, e.y, '#ffa257', 58, 49);
          this.explode(e.x - 71, e.y + 11, '#ff6453', 28, 32);
          this.explode(e.x + 75, e.y - 8, '#ffd6a3', 31, 34);
          break;
        case 'pickup': this.explode(e.x, e.y, PICKUPS[e.detail].color, 16, 19); break;
        case 'barrier': this.explode(e.x, e.y, '#7ad5ff', 15, 26); break;
        case 'ghostStart': this.phaseFlash(e.x, e.y, '#bbceff'); break;
        case 'ghostEnd': this.burst(e.x, e.y, '#e4c3ff', 12, 91, .43); break;
        case 'realmHop': case 'wraithShift': this.phaseFlash(e.x, e.y, realmTint(e.detail)); break;
        case 'veilHit': this.burst(e.x, e.y, '#b6a0db', 2, 37, .28); break;
        case 'hurt':
          this.hurtPulse = reduce ? .13 : .47;
          this.explode(e.x, e.y, '#ff705d', 17, 15);
          break;
        case 'playerDown':
          this.death = { x:e.x, y:e.y, reduced:reduce, age:0, burst:false };
          this.explode(e.x, e.y, '#fff0c3', reduce ? 12 : 30, reduce ? 16 : 30);
          break;
        default: break;
      }
      if (reduce) this.cameraPulse = 0;
    }
  }

  explode(x, y, color, count, radius) {
    this.burst(x, y, color, count, 167 + radius, .53 + radius * .014);
    this.shocks.push({ x, y, color, life: 0, total: .42 + radius * .006, radius });
    if (radius > 25) this.cameraPulse = Math.min(1, radius * .023);
  }

  phaseFlash(x, y, color) {
    this.burst(x, y, color, 15, 128, .43);
    this.shocks.push({ x, y, color, life: 0, total: .32, radius: 23, hollow: true });
  }

  burst(x, y, color, count, velocity, life) {
    for (let i = 0; i < count && this.sparks.length < 340; i++) {
      const angle = Math.random() * 2 * Math.PI;
      const power = lerp(.22, 1, Math.random()) * velocity;
      this.sparks.push({ x, y, color: i % 5 ? color : '#fff3da', vx: Math.cos(angle) * power, vy: Math.sin(angle) * power,
        life: 0, total: life * lerp(.4, 1, Math.random()), size: lerp(1.2, 3.8, Math.random()), shape: i % 3 });
    }
  }

  advanceEffects(dt) {
    this.arrival = Math.max(0, this.arrival - dt);
    if (this.death) {
      const death = this.death;
      death.age += dt;
      if (!death.reduced && !death.burst && death.age >= .20) {
        death.burst = true;
        this.explode(death.x + 6, death.y + 8, '#ff9d58', 37, 38);
        this.burst(death.x, death.y + 11, '#cad9e4', 15, 132, .94);
      }
    }
    this.cameraPulse = Math.max(0, this.cameraPulse - dt * 2.2);
    this.hurtPulse = Math.max(0, this.hurtPulse - dt * 1.7);
    this.shocks = this.shocks.filter((p) => (p.life += dt) < p.total);
    for (const p of this.sparks) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.9;
      p.vy *= 1 - dt * 1.9;
    }
    this.sparks = this.sparks.filter((p) => p.life < p.total);
  }

  draw(flight, prefs) {
    const c = this.ctx;
    this.background(flight, prefs.reduced);
    const scale = Math.min(this.canvas.width / WIDTH, this.canvas.height / HEIGHT);
    const left = (this.canvas.width - scale * WIDTH) / 2;
    const top = (this.canvas.height - scale * HEIGHT) / 2;
    c.setTransform(scale, 0, 0, scale, left, top);
    c.save();
    c.beginPath();
    c.rect(0, 0, WIDTH, HEIGHT);
    c.clip();
    if (!prefs.reduced && this.cameraPulse) {
      c.translate(Math.sin(flight.elapsed * 169 + this.cameraPulse * 7) * this.cameraPulse * 3.4,
        Math.sin(flight.elapsed * 126 + this.cameraPulse * 5) * this.cameraPulse * 3.4);
    }
    for (const warning of flight.hazards) this.warning(warning, prefs, flight.boss);
    if (flight.cruiser) this.boss(flight.cruiser, prefs);
    this.drawLinks(flight);
    for (const enemy of flight.enemies) this.enemy(enemy, flight.elapsed);
    if (flight.boss) this.boss(flight.boss, prefs);
    for (const warning of flight.hazards) {
      if (warning.kind === 'wall' && warning.age >= 0 && warning.age < warning.windup) {
        this.debrisWindup(warning, prefs, flight.boss);
      }
    }
    for (const drop of flight.pickups) this.drop(drop, prefs);
    for (const shot of flight.friendly) this.playerShot(shot);
    for (const shot of flight.hostile) this.enemyShot(shot, prefs.contrast, flight.player.realm);
    if (flight.status !== 'defeat') this.pilot(flight, prefs);
    else if (this.death) this.wreck(flight);
    this.effects();
    if (this.arrival) this.arrivalSweep(flight);
    this.collisionOverlay?.(c, flight);
    c.restore();
    if (this.hurtPulse > 0) {
      c.globalAlpha = this.hurtPulse * .65;
      const rail = c.createLinearGradient(0, 0, 38, 0);
      rail.addColorStop(0, '#ff664f');
      rail.addColorStop(1, '#ff664f00');
      c.fillStyle = rail;
      c.fillRect(0, 0, 38, HEIGHT);
      c.save();
      c.translate(WIDTH, 0);
      c.scale(-1, 1);
      c.fillRect(0, 0, 38, HEIGHT);
      c.restore();
      c.globalAlpha = 1;
    }
    if (this.death) {
      const death = this.death;
      const fadeAt = death.reduced ? .12 : .56;
      const endAt = death.reduced ? .40 : 1.14;
      const fade = saturate((death.age - fadeAt) / (endAt - fadeAt));
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = `rgba(8,15,25,${fade * fade * (3 - 2 * fade)})`;
      c.fillRect(0, 0, this.canvas.width, this.canvas.height);
      c.restore();
    }
  }

  arrivalSweep(flight) {
    const c = this.ctx;
    const bloom = this.arrival / arrivalDuration;
    c.save();
    c.globalAlpha = bloom * .34;
    const light = c.createRadialGradient(flight.player.x, HEIGHT, 10, flight.player.x, HEIGHT, 292);
    light.addColorStop(0, '#59beed9b');
    light.addColorStop(1, '#59beed00');
    c.fillStyle = light;
    c.fillRect(0, HEIGHT - 290, WIDTH, 290);
    for (let i = 0; i < 15; i++) {
      const star = stars[i * 4];
      const y = (star.y + (1 - bloom) * 165) % HEIGHT;
      line(c, star.x, y, .1, 24 + bloom * 45, '#b0e8ffcc', .9);
    }
    c.restore();
  }

  wreck(flight) {
    const c = this.ctx;
    const death = this.death;
    const size = flight.ship.size;
    const age = death.age;
    const roll = (flight.player.bank || .07) * 2.6;
    if (death.reduced || age < .20) {
      const y = death.y + (death.reduced ? 0 : 57 * age);
      this.sprite(flight.run.ship, death.x, y, size, flight.player.bank + (death.reduced ? 0 : age * roll), saturate(1 - age * 2), '#ffa764');
      return;
    }
    const t = age - .20;
    const pivotY = death.y + 11.4;
    const joint = size * .135;
    const alpha = saturate(.87 - t * .83);
    for (const [side, left, right] of [[-1, -size, -joint], [1, joint, size], [0, -joint, joint]]) {
      c.save();
      c.translate(death.x + side * t * (69 - 13 * t), pivotY + t * (48 + Math.abs(side) * 27));
      c.rotate(flight.player.bank + .20 * roll + t * (side * 2.4 + roll));
      c.beginPath();
      c.rect(left, -size / 2, right - left, size);
      c.clip();
      this.sprite(flight.run.ship, 0, 0, size, 0, alpha, '#ff8455');
      c.restore();
    }
  }

  background(flight, reduce) {
    const c = this.ctx;
    if (!this.backdropReady || this.backdropFull !== this.fullStrengthBackground) this.paintBackdrop(flight);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.backdrop, 0, 0);
    c.setTransform(this.canvas.width / WIDTH, 0, 0, this.canvas.height / HEIGHT, 0, 0);
    const t = reduce ? 0 : flight.elapsed;
    for (const star of stars) {
      const y = (star.y + t * star.speed) % HEIGHT;
      c.globalAlpha = star.alpha;
      c.fillStyle = star.color;
      c.fillRect(star.x, y, star.streak ? 1.6 : 1, star.streak && !reduce ? 5 : 1.3);
    }
    c.globalAlpha = 1;
  }

  paintBackdrop(flight) {
    this.backdrop.width = this.canvas.width;
    this.backdrop.height = this.canvas.height;
    const c = this.backdropContext;
    const illustrated = this.sprites.get(this.illustration);
    const env = illustrated || this.sprites.get(`env-${flight.stage.environment}`);
    c.setTransform(this.canvas.width / WIDTH, 0, 0, this.canvas.height / HEIGHT, 0, 0);
    c.fillStyle = '#040811';
    c.fillRect(0, 0, WIDTH, HEIGHT);
    if (env) {
      if (illustrated) {
        const ratio = this.canvas.width / this.canvas.height;
        const width = Math.min(env.width, env.height * ratio);
        const height = Math.min(env.height, env.width / ratio);
        c.drawImage(env, (env.width - width) * .5, (env.height - height) * .24, width, height, 0, 0, WIDTH, HEIGHT);
      } else c.drawImage(env, 0, 0, WIDTH, HEIGHT);
      if (illustrated && this.fullStrengthBackground !== true) {
        const grade = c.createLinearGradient(0, 0, WIDTH, HEIGHT * .61);
        grade.addColorStop(0, '#02091266');
        grade.addColorStop(.49, '#0209129e');
        grade.addColorStop(1, '#0209129e');
        c.fillStyle = grade;
        c.fillRect(0, 0, WIDTH, HEIGHT);
      }
    }
    else {
      c.save();
      c.globalAlpha = .08;
      ring(c, -160, 154, 280, flight.stage.accent, 90);
      c.restore();
    }
    this.backdropReady = true;
    this.backdropFull = this.fullStrengthBackground;
  }

  sprite(key, x, y, size, turn = 0, alpha = 1, glow = '') {
    const c = this.ctx;
    const image = this.sprites.get(key);
    c.save();
    c.translate(x, y);
    if (turn) c.rotate(turn);
    c.globalAlpha = alpha;
    if (glow) {
      c.shadowColor = glow;
      c.shadowBlur = 10;
    }
    const silhouette = spriteBodies[key === 'wraith-ghost' ? 'wraith' : key];
    if (image) {
      c.drawImage(image, -size / 2, -size / 2, size, size);
    } else if (silhouette) {
      const unit = size * .001;
      const light = c.createLinearGradient(0, -size / 2, 0, size / 2);
      light.addColorStop(0, '#a0adb9');
      light.addColorStop(.54, '#697d93');
      light.addColorStop(1, '#3f5270');
      c.fillStyle = light;
      c.beginPath();
      for (const [left, top, right, bottom] of silhouette) {
        c.rect(left * unit, top * unit, (right - left) * unit, (bottom - top) * unit);
      }
      c.fill();
    } else {
      c.fillStyle = '#60728a';
      c.strokeStyle = '#d5edeb';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(0, -size * .42);
      c.lineTo(size * .33, size * .22);
      c.lineTo(0, size * .15);
      c.lineTo(-size * .33, size * .22);
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.restore();
  }

  pilot(flight, prefs) {
    const c = this.ctx;
    const p = flight.player;
    const ghost = p.realm === SPECTRAL;
    const fighter = flight.run.ship === 'kestrel';
    this.exhaust ??= {
      normal: exhaustTexture('#9ffdf1', '#3fade0a6'),
      boost: exhaustTexture('#ffe1ac', '#f48950ae'),
      ghost: exhaustTexture('#ebe0ff', '#afa0fdba')
    };
    const image = this.exhaust[ghost ? 'ghost' : p.overdrive ? 'boost' : 'normal'];
    const plume = prefs.reduced ? 10 : 10 + (Math.sin(flight.elapsed * 22) + 1) * 2 + this.arrival * 38;
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.bank);
    for (const [dx, dy] of fighter ? fighterExhaust : flight.ship.engines) {
      const width = fighter ? 6 : dx === 0 ? 9 : 6;
      c.drawImage(image, dx - width / 2, dy, width, plume + (dx === 0 && !fighter ? 6 : 0));
    }
    c.restore();
    this.sprite(flight.run.ship, p.x, p.y, flight.ship.size, p.bank,
      ghost ? .64 : p.guard && !prefs.reduced ? .74 + .25 * Math.abs(Math.sin(flight.elapsed * 24)) : 1, ghost ? '#beaeff' : '');
    if (ghost) {
      const turn = prefs.reduced ? 0 : flight.elapsed * 2.2;
      c.beginPath();
      for (const angle of [turn, turn + Math.PI]) {
        c.moveTo(p.x + 24 * Math.cos(angle), p.y + 24 * Math.sin(angle));
        c.arc(p.x, p.y, 24, angle, angle + .92);
      }
      c.strokeStyle = '#dbceff';
      c.lineWidth = 1.6;
      c.stroke();
    }
    if (p.barrier) {
      const charge = saturate(p.barrierTime / PICKUPS.barrier.duration);
      c.save();
      c.globalAlpha = charge;
      ring(c, p.x, p.y, 28, '#296a9d', 3.4);
      ring(c, p.x, p.y, 28, '#b2eaff', 1.15);
      c.restore();
    }
    if (p.guard && prefs.reduced) ring(c, p.x, p.y, 22, '#b7d5dd99', 1.5);
  }

  enemy(e, clock) {
    const c = this.ctx;
    if (e.loop) {
      line(c, e.x - 5, e.y + 13, 0, 29, '#bd886ea6', 1.7);
      line(c, e.x + 5, e.y + 13, 0, 29, '#bd886ea6', 1.7);
      this.sprite(e.kind, e.x, e.y, e.spec.size, e.turn, .62);
      return;
    }
    if (e.kind === 'diver' && Number.isFinite(e.diveAim) && !e.retreat) {
      const charge = saturate((e.age - diveWarningAt) * 2.5);
      const nozzle = hardpointAt(e, 0, -e.spec.size * .39, e.turn);
      const length = e.dive ? 29 : 8 + 13 * charge;
      const width = e.dive ? 5 : 3.1 + 1.5 * charge;
      c.save();
      c.translate(nozzle.x, nozzle.y);
      c.rotate(e.dive ? e.vector - Math.PI / 2 : e.turn);
      const flame = c.createLinearGradient(0, 1, 0, -length);
      flame.addColorStop(0, '#fff4d1');
      flame.addColorStop(.35, '#ffac58e6');
      flame.addColorStop(1, '#ff693c00');
      c.fillStyle = flame;
      c.beginPath();
      c.moveTo(-width, 1);
      c.quadraticCurveTo(-width, -length * .57, 0, -length);
      c.quadraticCurveTo(width, -length * .57, width, 1);
      c.closePath();
      c.fill();
      c.restore();
    }
    this.sprite(e.kind, e.x, e.y, e.spec.size, e.turn, e.retreat ? .66 : 1);
    const arming = e.kind === 'shard' && e.age < shardArmTime;
    if (arming) {
      const progress = e.age / shardArmTime;
      ring(c, e.x, e.y, 15 - 7 * progress, '#ffc78f9b', 1.15);
    }
    const canTelegraph = e.kind !== 'splitter' && !(e.kind === 'shard' && (arming || e.volley > 0));
    if (canTelegraph && e.fireTimer < .26 && e.y > 102 && !e.dive && !e.retreat) {
      const points = e.kind === 'lancer' ? GUNNER_MUZZLES.map(([dx, dy]) => hardpointAt(e, dx, dy, e.turn)) : [enemyMuzzle(e)];
      for (const muzzle of points) {
        filled(this.ctx, muzzle.x, muzzle.y, 2.2 + Math.sin(clock * 19) * .7, '#fff1c9');
      }
    }
    if (e.flash > 0) ring(this.ctx, e.x, e.y, 7, '#fff4cf99');
    if (e.jam > 0 && !e.retreat) {
      const c = this.ctx;
      line(c, e.x - 12, e.y - 13, 5, 0, '#8ffff0', 1.6);
      line(c, e.x + 7, e.y + 13, 5, 0, '#8ffff0', 1.6);
    }
  }

  drawLinks(flight) {
    const c = this.ctx;
    for (const relay of flight.enemies.filter((e) => e.kind === 'relay' && e.y > 0 && !e.retreat && !e.loop)) {
      for (const ally of flight.enemies.filter((e) => e.kind === 'escort' && !e.retreat && !e.loop && Math.hypot(e.x - relay.x, e.y - relay.y) < 144)) {
        line(c, relay.x, relay.y, ally.x - relay.x, ally.y - relay.y, '#8dcaff75', 2);
        ring(c, ally.x, ally.y, 19, '#74bdcaad');
      }
      if (!relay.group || relay.vane <= 0) continue;
      const { x, y } = vanePosition(relay);
      const charge = commandCharge(relay);
      c.save();
      c.setLineDash(charge ? [] : [5, 6]);
      for (const wing of flight.enemies) {
        if (wing === relay || wing.group !== relay.group || wing.y < 12 || wing.retreat) continue;
        line(c, x, y, wing.x - x, wing.y - y, charge ? '#d398efb8' : '#927dba8a', charge ? 2.2 : 1.35);
      }
      c.restore();
      line(c, relay.x, relay.y, x - relay.x, y - relay.y, '#abc7d8', 2.8);
      filled(c, x, y, 8.2, '#342b5c');
      filled(c, x, y, charge ? 5.2 : 3.8, charge ? '#ffd1fb' : '#ba9dff');
      for (const [offset, dir] of [[-13, 1], [13, -1]]) {
        line(c, x + offset, y - 9, 5 * dir, 0, '#b8fff0', 1.7);
        line(c, x + offset, y - 9, 0, 18, '#b8fff0', 1.7);
        line(c, x + offset, y + 9, 5 * dir, 0, '#b8fff0', 1.7);
      }
    }
  }

  boss(b, prefs) {
    const c = this.ctx;
    const ghost = b.realm === SPECTRAL;
    const look = ghost ? 'wraith-ghost' : b.kind;
    this.sprite(look, b.x, b.y, b.spec.size, 0, b.hull > 0 ? 1 : .35, ghost ? '#8262e3' : '');
    if (b.kind === 'wraith' && b.hull > 0 && b.age >= b.entryTime - .25) this.wraithCue(b, prefs);
    const hasShields = shieldModules(b);
    for (const part of b.parts) {
      const { x, y, radius } = bossPartPosition(b, part);
      if (part.hull > 0 && hasShields) line(c, b.x, b.y + 3, x - b.x, y - b.y, '#86cfef9d', 2);
      if (part.hull > 0) this.sprite(hasShields ? 'shield-node' : 'turret', x, y, part.size ?? 43);
      if (part.hull <= 0) {
        line(c, x - 5, y - 5, 10, 10, '#9eaac5', 1.6);
        line(c, x + 5, y - 5, -10, 10, '#9eaac5', 1.6);
        continue;
      }
      if (part.charge > 0) {
        const muzzleY = y + part.muzzle;
        const tint = prefs.contrast ? '#fff2c1' : '#ffae63';
        ring(c, x, muzzleY, 5, tint, 1.7);
        line(c, x, muzzleY, Math.cos(part.aim) * 25, Math.sin(part.aim) * 25, tint, 1.65);
      }
      const tint = part.flash > 0 || prefs.contrast ? '#ffffff' : '#7dfce3';
      const r = radius + 3;
      for (const sign of [-1, 1]) {
        line(c, x + sign * r, y + sign * r, -sign * 6, 0, tint, 1.9);
        line(c, x + sign * r, y + sign * r, 0, -sign * 6, tint, 1.9);
      }
      if (b.timer < .32 && b.age > b.entryTime) filled(c, x, y + part.muzzle, 2.8, '#fff4d2');
    }
    if (hasShields && b.parts.some((part) => part.hull > 0)) ring(c, b.x, b.y + 4, b.spec.hit, '#80caec78', 2);
    if (b.hitFlash > 0) ring(c, b.x, b.y + 4, 9, '#fff6dc88');
  }

  wraithCue(b, prefs) {
    const c = this.ctx;
    const tint = realmTint(b.realm);
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        const x = b.x + side * 16;
        const y = b.y + end * 24;
        c.beginPath();
        c.moveTo(x - side * 6, y);
        c.lineTo(x, y);
        c.lineTo(x, y - end * 8);
        c.strokeStyle = '#140c1d';
        c.lineWidth = 4;
        c.stroke();
        c.strokeStyle = prefs.contrast ? '#fff5df' : tint;
        c.lineWidth = 1.6;
        c.stroke();
      }
    }
    if (b.shifting) {
      const incoming = realmTint(otherRealm(b.realm));
      const amount = Math.max(0, 1 - (b.shiftAt - b.age) / 1.06);
      for (const side of [-1, 1]) line(c, b.x + side * 97, b.y + 31, -21 * side * amount, 0, incoming, 2.4);
    }
    if (!b.charge) return;
    const y = b.y + WRAITH_EMITTER;
    const color = realmTint(b.charge.realm);
    const reach = prefs.reduced ? 58 : 42 + 32 * Math.max(0, 1 - (b.charge.fireAt - b.age) / 1.04);
    ring(c, b.x, y, 10, '#22172f', 6);
    ring(c, b.x, y, 10, color, 2.6);
    c.save();
    c.setLineDash(b.charge.realm === SPECTRAL ? [4, 4] : []);
    line(c, b.x, y, Math.cos(b.charge.aim) * reach, Math.sin(b.charge.aim) * reach, color, 2.3);
    c.restore();
  }

  warning(w, prefs, boss, bottom = HEIGHT) {
    if (w.age < 0) return;
    const c = this.ctx;
    const solid = w.age >= w.windup;
    const color = prefs.contrast ? '#fff4b7' : '#ffae63';
    c.save();
    if (w.kind === 'rail') {
      const left = w.x - w.width / 2;
      const start = w.y;
      if (Number.isFinite(w.emitter) && boss) {
        const muzzleY = boss.y + w.emitter;
        c.save();
        c.setLineDash(solid ? [] : [5,4]);
        line(c, boss.x, muzzleY, w.x - boss.x, start - muzzleY, solid ? '#eb9d77b8' : '#caa6a278', 1.8);
        c.restore();
        ring(c, w.x, start, Math.min(12, w.width * .29), solid ? '#fff2ca' : color, 2);
        if (solid) filled(c, w.x, start, 4.6, '#fff7da');
      }
      c.globalAlpha = solid ? .7 : .17;
      c.fillStyle = solid ? '#ff702c' : color;
      c.fillRect(left, start, w.width, bottom - start);
      c.globalAlpha = 1;
      if (solid) {
        line(c, w.x, start, 0, bottom - start, '#fffdf1', w.width * .32);
      } else {
        c.beginPath();
        c.rect(left, start, w.width, bottom - start);
        c.clip();
        for (let y = start + 11; y < bottom + 25; y += 24) line(c, left, y, w.width, -w.width * .76, color, 1.4);
        line(c, left, start, 0, bottom - start, color, 2.7);
        line(c, left + w.width, start, 0, bottom - start, color, 2.7);
      }
    } else if (w.kind === 'wall') {
      const l = w.x - w.width / 2;
      const r = w.x + w.width / 2;
      const y = solid ? w.rowY : w.y;
      const seamColor = solid ? '#bfffe6' : color;
      if (!solid) {
        c.setLineDash([8,5]);
        const left = w.left ?? 0;
        const right = w.right ?? WIDTH;
        line(c, left, y, l - 5 - left, 0, color, 2.1);
        line(c, r + 5, y, right - (r + 5), 0, color, 2.1);
        c.setLineDash([]);
      }
      for (const [x, sign] of [[l, 1], [r, -1]]) {
        line(c, x, y - 10, 11 * sign, 10, seamColor, 2.5);
        line(c, x, y + 10, 11 * sign, -10, seamColor, 2.5);
      }
    } else if (w.kind === 'pull') {
      c.globalAlpha = solid ? .12 : .07;
      c.fillStyle = '#b395f9';
      c.fillRect(w.x - w.width/2, w.y, w.width, bottom - w.y);
      c.globalAlpha = solid ? .80 : .52;
      for (const side of [-1,1]) {
        const edge = w.x + side * w.width / 2;
        line(c, edge, w.y, 0, bottom - w.y, '#cbacfe', 1);
        for (let y = w.y + 26; y < bottom; y += 52) {
          const drift = solid && !prefs.reduced ? Math.sin(y * .07 - w.age * 6) * 4 : 0;
          const x = edge - side * (19 + drift);
          line(c, x, y - 8, -side * 9, 8, '#e2d0ff', 2.4);
          line(c, x, y + 8, -side * 9, -8, '#e2d0ff', 2.4);
        }
      }
    }
    c.restore();
  }

  debrisWindup(w, prefs, boss) {
    if (!w.origin || !w.rocks?.length) return;
    const c = this.ctx;
    const phase = saturate(w.age / w.windup);
    const spread = 1 - (1 - phase) ** 2;
    const { reduced, contrast } = prefs;
    const color = contrast ? '#fff4b7' : '#ffae63';
    const followsBoss = !reduced && boss && Number.isFinite(w.emitter);
    const originX = followsBoss ? boss.x : w.origin.x;
    const originY = followsBoss ? boss.y + w.emitter : w.origin.y;
    c.save();
    c.globalAlpha = (1 - phase) * .60;
    ring(c, originX, originY, 4 + (reduced ? 0 : 10 * phase), color, 2);
    c.setLineDash([3, 5]);
    for (const rock of w.rocks) {
      const x = reduced ? rock.x : lerp(originX, rock.x, spread);
      const y = reduced ? rock.y : lerp(originY, rock.y, spread) - Math.sin(Math.PI * phase) * 15;
      const size = reduced ? rockSize : lerp(9, rockSize, phase);
      const turn = reduced ? 0 : Math.sign(rock.x - originX) * (1 - phase) * .8;
      line(c, originX, originY, x - originX, y - originY, color, 1.25);
      this.sprite('rock', x, y, size, turn, lerp(reduced ? .14 : .27, 1, phase));
    }
    c.restore();
  }

  drop(d, prefs) {
    const c = this.ctx;
    const size = Math.min(33, d.age * 90);
    const turn = prefs.reduced ? 0 : Math.sin(d.age * 2.3) * .13;
    this.sprite(`pickup-${d.kind}`, d.x, d.y, size, turn);
    if (d.age > .18) ring(c, d.x, d.y, 14 + (prefs.reduced ? 0 : Math.sin(d.age * 7) * 1.8), `${PICKUPS[d.kind].color}76`, 1);
  }

  playerShot(s) {
    const c = this.ctx;
    const x = s.vx * .019;
    const y = s.vy * .019;
    const ghost = s.realm === SPECTRAL;
    line(c, s.x - x * .58, s.y - y * .58, x, y, ghost ? '#b591e7' : s.powered ? '#8847efac' : '#3bb5bba3', s.powered ? 5.2 : 4.7);
    line(c, s.x - x * .34, s.y - y * .34, x * .73, y * .73, ghost || s.powered ? '#f1ddff' : '#d5fff6', 2.0);
  }

  enemyShot(s, contrast, pilotRealm) {
    const c = this.ctx;
    if (s.kind === 'rock') {
      this.sprite('rock', s.x, s.y, rockSize, s.age * .7);
      if (contrast) ring(c, s.x, s.y, s.radius + 1, '#ffcc93', 2);
      return;
    }
    const color = contrast ? '#ff8c6e' : s.kind === 'pulse' ? '#d796ff' : '#ff6047';
    c.save();
    c.translate(s.x, s.y);
    c.rotate(Math.atan2(s.vy, s.vx));
    if (s.kind === 'specter' || s.kind === 'orb') {
      this.realmShot(s, contrast, s.realm === pilotRealm);
      c.restore();
      return;
    }
    if (s.kind === 'lance') {
      line(c, -10, 0, 16, 0, '#431d25', 8);
      line(c, -7, 0, 13, 0, contrast ? '#ffb684' : '#ff7e4d', 4.5);
      line(c, -3, 0, 9, 0, '#fff2cd', 1.8);
      c.restore();
      return;
    }
    c.fillStyle = '#34151c';
    c.beginPath();
    c.ellipse(0, 0, s.radius + 2.6, s.radius + 1.0, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = color;
    c.beginPath();
    if (s.kind === 'blade' || s.kind === 'seed') {
      c.moveTo(s.radius + 1.4, 0);
      c.lineTo(-.5, s.radius);
      c.lineTo(-s.radius - 1.4, 0);
      c.lineTo(-.5, -s.radius);
      c.closePath();
    } else c.ellipse(.4, 0, s.radius + 1.1, Math.max(3.3, s.radius - .4), 0, 0, Math.PI * 2);
    c.fill();
    line(c, -1.65, 0, 4.4, 0, '#fff2c4', contrast ? 2.7 : 1.9);
    c.restore();
  }

  realmShot(s, contrast, harmful) {
    const c = this.ctx;
    const r = s.radius + 1;
    if (s.kind === 'orb') {
      filled(c, 0, 0, r + 1.8, '#39171e');
      filled(c, 0, 0, r, harmful || contrast ? '#ff995b' : '#c87559');
      filled(c, 0, 0, 2.3, '#ffedc0');
      return;
    }
    c.beginPath();
    c.moveTo(r + 1.3, 0);
    c.lineTo(0, r);
    c.lineTo(-r - 1.3, 0);
    c.lineTo(0, -r);
    c.closePath();
    c.fillStyle = '#1b1229';
    c.fill();
    c.lineWidth = 4.5;
    c.strokeStyle = '#241535';
    c.stroke();
    c.lineWidth = harmful || contrast ? 2.3 : 1.7;
    c.strokeStyle = harmful || contrast ? '#edcdff' : '#af8bdd';
    c.stroke();
  }

  effects() {
    const c = this.ctx;
    for (const p of this.shocks) {
      const fraction = p.life / p.total;
      c.globalAlpha = (1 - fraction) * .83;
      ring(c, p.x, p.y, p.radius * (.35 + fraction * 1.42), p.color, 1 + 2 * (1 - fraction));
      if (!p.hollow && fraction < .21) filled(c, p.x, p.y, p.radius * (.79 + fraction), p.color);
    }
    for (const p of this.sparks) {
      c.globalAlpha = Math.min(1, (1 - p.life / p.total) * 1.4);
      if (p.shape === 0) filled(c, p.x, p.y, p.size / 2, p.color);
      else line(c, p.x, p.y, -p.vx * .039, -p.vy * .039, p.color, p.size / 1.6);
    }
    c.globalAlpha = 1;
  }
}
