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
    size:depth.size * between(.78, 1.23), members:Math.floor(between(1, depth.members + 1)) };
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
  const aft = friendly ? size * .40 : -size * .24;
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
  lamp(c, 0, -sign * size * .04, Math.max(.65, size * .026), friendly ? '#dffffe' : '#ffd0b5');
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

  function paint() {
    if (!width || !height) return;
    c.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    c.clearRect(0, 0, width, height);
    const launchPhase = started === null ? 0 : clamp((time - started) / .46);
    for (const speck of specks) {
      const y = (speck.y * height + time * speck.depth * 7 + launchPhase * 92 * speck.depth) % height;
      const x = speck.x * width;
      const length = 1 + (speck.lit ? 1.2 : 0) + launchPhase * 33 * speck.depth;
      c.fillStyle = speck.lit ? '#d3e7ff8a' : '#9ab4cc51';
      c.fillRect(x, y, speck.lit ? 1.4 : 1, length);
    }
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
      for (let i = patrol.members - 1; i >= 0; i--) {
        const wing = i === 0 ? 0 : i % 2 === 1 ? -1 : 1;
        drawCraft(c, images.get(patrol.ship), x - sign * i * size * .75, y + wing * size * .39,
          i === 0 ? size : size * .88, turn, alpha);
      }
    }
    const launchProgress = launchPhase ** 1.7;
    const hover = reduce ? 0 : Math.sin(time * 1.3);
    const heroOrigin = width <= 239 ? .40 : .44;
    const heroScale = width <= 239 ? .49 : .60;
    const heroY = height * (heroOrigin - (heroOrigin + .25) * launchProgress) + hover * (1 - launchPhase) * 3.2;
    const heroSize = width * (heroScale + (.26 - heroScale) * launchProgress);
    const bank = (.12 + hover * .027) * (1 - launchPhase);
    if (images.has(ship)) drawCraft(c, images.get(ship), width * .5, heroY, heroSize, bank,
      1, ship, .13 + hover * .021 + launchPhase * .91);
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
      if (reduce) paint();
    });
  }

  if (!reduce) handle = requestAnimationFrame(frame);
  return {
    launch() { if (!reduce && started === null) started = time; },
    stop
  };
}
