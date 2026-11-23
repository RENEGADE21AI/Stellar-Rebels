import { loadSprite } from './scene.mjs';

const depths = [
  { ships:['scout','diver','escort','phantom'], y:.39, size:.047, speed:23, rest:5, light:.55, warm:.49, members:4 },
  { ships:['scout','diver','sweeper','escort'], y:.51, size:.081, speed:17, rest:6, light:.73, warm:.27, members:3 },
  { ships:['lancer','sweeper','phantom','escort'], y:.61, size:.143, speed:13, rest:10, light:.92, warm:.17, members:2 }
];
const between = (low, high) => low + Math.random() * (high - low);

function crossing(depth, now, previous) {
  const ships = depth.ships.filter((ship) => ship !== previous?.ship);
  const duration = depth.speed * between(.88, 1.48);
  const start = previous ? now : now - duration * depth.warm;
  return { depth, start, duration, next:start + duration + depth.rest * between(.55, 1.65),
    ship:ships[Math.floor(Math.random() * ships.length)], direction:Math.random() < .5 ? -1 : 1,
    y:depth.y + between(-.043, .041), drift:between(-.095, .095), bow:between(-.029, .064),
    size:depth.size * between(.78, 1.23), members:Math.floor(between(1, depth.members + 1)), destroyed:new Set() };
}
const specks = Array.from({ length:49 }, (_, index) => ({
  x: ((index * 73 + 31) % 223) / 223,
  y: ((index * 59 + 17) % 191) / 191,
  lit: index % 8 === 0,
  depth: .45 + (index % 6) * .20
}));
const clamp = (value) => Math.min(1, Math.max(0, value));

function lamp(c, x, y, size, color) {
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, size, 0, Math.PI * 2);
  c.fill();
}

function drawCraft(c, image, x, y, size, turn, luminosity, ship = '', thrust = 1) {
  c.save();
  c.translate(x, y);
  c.rotate(turn);
  c.globalAlpha = luminosity;
  const friendly = Boolean(ship);
  const sign = friendly ? -1 : 1;
  const aft = friendly ? size * (ship === 'kestrel' ? .333 : .40) : -size * .24;
  const tail = aft - size * .67 * sign * thrust;
  const jet = c.createLinearGradient(0, aft, 0, tail);
  jet.addColorStop(0, friendly ? '#c4fffb' : '#fff3be');
  jet.addColorStop(.23, friendly ? '#61c9ff89' : '#ff7957a8');
  jet.addColorStop(1, friendly ? '#4e7af900' : '#ff875100');
  c.fillStyle = jet;
  const mounts = friendly ? ship === 'bastion' ? [-.27, 0, .27] : [0] : [-.105,.105];
  for (const mount of mounts) {
    const engine = mount * size;
    c.beginPath();
    const radius = size * (friendly ? .023 : .04);
    c.moveTo(engine - radius, aft);
    c.lineTo(engine + radius, aft);
    c.quadraticCurveTo(engine + size * .015, tail, engine, tail);
    c.closePath();
    c.fill();
  }
  if (image) c.drawImage(image, -size / 2, -size / 2, size, size);
  else {
    c.fillStyle = friendly ? '#ceefed' : '#9e513b';
    c.beginPath();
    c.moveTo(0, size * .37 * sign);
    c.lineTo(-size * .30, -size * .26 * sign);
    c.lineTo(0, -size * .15 * sign);
    c.lineTo(size * .30, -size * .26 * sign);
    c.closePath();
    c.fill();
  }
  if (!friendly) lamp(c, 0, -sign * size * .04, Math.max(.65, size * .026), '#ffd0b5');
  c.restore();
}

export function mountTitlePatrol(canvas, reduce = false, ship = 'kestrel') {
  if (!canvas) return null;
  const c = canvas.getContext('2d');
  if (!c) return null;
  const controller = new AbortController();
  const images = new Map();
  const patrols = depths.map((depth) => crossing(depth, 0));
  let time = 0;
  let lastFrame = 0;
  let started = null;
  let patrolCraft = [];
  let hero = null;
  let heroMask = null;
  let shot = null;
  let spark = null;
  let shotAt = -Infinity;
  let handle;
  let width = 0;
  let height = 0;

  function resize() {
    width = Math.round(canvas.clientWidth);
    height = Math.round(canvas.clientHeight);
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.65, Math.sqrt(725000 / (width * height)));
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
  }

  function paintPatrolShot() {
    if (shot) {
      const target = patrolCraft.find(({ patrol, member }) => patrol === shot.patrol && member === shot.member);
      if (!target) shot = null;
      else {
        const progress = clamp((time - shotAt) / .24);
        const fromX = width * .5;
        const fromY = height * 1.08;
        const x = fromX + (target.x - fromX) * progress;
        const y = fromY + (target.y - fromY) * progress;
        c.lineCap = 'round';
        const tail = .08 * (1 - progress) + .045;
        c.strokeStyle = '#a0eaff9a';
        c.lineWidth = 2.7 - progress * 1.8;
        c.beginPath();
        c.moveTo(x - (target.x - fromX) * tail, y - (target.y - fromY) * tail);
        c.lineTo(x, y);
        c.stroke();
        lamp(c, x, y, 1.7 - progress * .95, '#d4f7ff');
        c.lineCap = 'butt';
        if (progress === 1) {
          target.patrol.destroyed.add(target.member);
          spark = { x:target.x, y:target.y, size:Math.min(9, target.size * .19), at:time };
          shot = null;
        }
      }
    }
    if (!spark) return;
    const age = (time - spark.at) / .23;
    if (age >= 1) { spark = null; return; }
    c.globalAlpha = .8 * (1 - age);
    lamp(c, spark.x, spark.y, spark.size * (.34 + age * .76), '#ff9469');
    lamp(c, spark.x, spark.y, spark.size * .31 * (1 - age), '#fff4d7');
    for (const [dx, dy] of [[-.7,-.55],[.82,-.24],[.26,.8]]) {
      lamp(c, spark.x + dx * spark.size * (1 + age * 1.5), spark.y + dy * spark.size * (1 + age * 1.5), 1.05, '#ffc58a');
    }
    c.globalAlpha = 1;
  }

  function paint() {
    if (!width || !height) return;
    c.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    c.imageSmoothingQuality = 'high';
    c.clearRect(0, 0, width, height);
    const launchPhase = started === null ? 0 : clamp((time - started) / .46);
    for (const speck of specks) {
      const y = (speck.y * height + time * speck.depth * 7 + launchPhase * 92 * speck.depth) % height;
      const x = speck.x * width;
      const length = 1 + (speck.lit ? 1.2 : 0) + launchPhase * 33 * speck.depth;
      c.fillStyle = speck.lit ? '#d3e7ff8a' : '#9ab4cc51';
      c.fillRect(x, y, speck.lit ? 1.4 : 1, length);
    }
    patrolCraft = [];
    for (let i = 0; i < patrols.length; i++) {
      if (time >= patrols[i].next) patrols[i] = crossing(patrols[i].depth, time, patrols[i]);
      const patrol = patrols[i];
      const phase = (time - patrol.start) / patrol.duration;
      if (phase >= 1) continue;
      const size = width * patrol.size;
      const sign = patrol.direction;
      const x = width * (.5 + sign * 1.6 * (phase - .5));
      const y = height * (patrol.y + patrol.drift * phase + patrol.bow * Math.sin(Math.PI * phase)) + launchPhase * height * .17;
      const slope = height * (patrol.drift + Math.PI * patrol.bow * Math.cos(Math.PI * phase));
      const turn = Math.atan2(slope, width * sign * 1.6) - Math.PI / 2;
      const alpha = patrol.depth.light * (1 - launchPhase * .65);
      for (let member = patrol.members - 1; member >= 0; member--) {
        if (patrol.destroyed.has(member)) continue;
        const wing = member === 0 ? 0 : member % 2 === 1 ? -1 : 1;
        const craft = { patrol, member, x:x - sign * member * size * .75, y:y + wing * size * .39,
          size:member === 0 ? size : size * .88 };
        drawCraft(c, images.get(patrol.ship), craft.x, craft.y, craft.size, turn, alpha);
        if (craft.x > 0 && craft.x < width) patrolCraft.push(craft);
      }
    }
    paintPatrolShot();
    const launchProgress = launchPhase ** 1.7;
    const hover = reduce ? 0 : Math.sin(time * 1.3);
    const heroOrigin = width <= 239 ? .40 : .44;
    const heroScale = width <= 239 ? .49 : .60;
    const heroY = height * (heroOrigin - (heroOrigin + .25) * launchProgress) + hover * (1 - launchPhase) * 3.2;
    const heroSize = width * (heroScale + (.26 - heroScale) * launchProgress);
    const bank = (.12 + hover * .027) * (1 - launchPhase);
    if (images.has(ship)) {
      hero = { x:width * .5, y:heroY, size:heroSize, bank };
      drawCraft(c, images.get(ship), hero.x, hero.y, hero.size, hero.bank, 1, ship, .13 + hover * .021 + launchPhase * .91);
    }
  }

  function frame(timestamp) {
    if (!canvas.isConnected || controller.signal.aborted) {
      stop();
      return;
    }
    if (lastFrame) time += Math.min(.04, (timestamp - lastFrame) / 1000);
    lastFrame = timestamp;
    paint();
    handle = requestAnimationFrame(frame);
  }

  function stop() {
    controller.abort();
    observer.disconnect();
    if (handle !== undefined) cancelAnimationFrame(handle);
  }

  const observer = new ResizeObserver(() => {
    if (!canvas.isConnected) {
      stop();
      return;
    }
    resize();
    paint();
  });
  observer.observe(canvas);
  resize();
  paint();

  for (const key of new Set([ship, ...depths.flatMap((depth) => depth.ships)])) {
    void loadSprite(key, controller.signal, 4500).then((image) => {
      if (!image || controller.signal.aborted) return;
      images.set(key, image);
      if (key === ship) {
        const sample = document.createElement('canvas');
        sample.width = sample.height = 128;
        const probe = sample.getContext('2d');
        probe.drawImage(image, 0, 0, 128, 128);
        heroMask = probe.getImageData(0, 0, 128, 128).data;
      }
      if (reduce) paint();
    });
  }

  if (!reduce) handle = requestAnimationFrame(frame);
  return {
    hitsShip(clientX, clientY) {
      if (!hero || !heroMask || started !== null) return false;
      const bounds = canvas.getBoundingClientRect();
      const dx = clientX - bounds.left - hero.x;
      const dy = clientY - bounds.top - hero.y;
      const cos = Math.cos(hero.bank);
      const sin = Math.sin(hero.bank);
      const x = Math.floor(128 * (.5 + (dx * cos + dy * sin) / hero.size));
      const y = Math.floor(128 * (.5 + (dy * cos - dx * sin) / hero.size));
      return x >= 0 && x < 128 && y >= 0 && y < 128 && heroMask[(y * 128 + x) * 4 + 3] >= 110;
    },
    shootAt(clientX, clientY) {
      if (reduce || started !== null || shot || time - shotAt < .75) return;
      const bounds = canvas.getBoundingClientRect();
      const x = clientX - bounds.left;
      const y = clientY - bounds.top;
      let nearest = Infinity;
      for (const craft of patrolCraft) {
        const distance = Math.hypot(craft.x - x, craft.y - y);
        if (distance < nearest && distance <= Math.min(19, Math.max(10, craft.size * .43))) {
          nearest = distance;
          shot = craft;
        }
      }
      if (shot) shotAt = time;
    },
    launch() {
      if (reduce || started !== null) return;
      shot = spark = null;
      started = time;
    },
    stop
  };
}
