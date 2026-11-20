import { loadSprite } from './scene.mjs';

const patrols = [
  { ship:'diver', direction:-1, duration:28, period:38, offset:13, y:.39, drift:.02, bow:.015, size:.055, light:.57, members:3 },
  { ship:'scout', direction:1, duration:23, period:32, offset:8, y:.52, drift:-.06, bow:.058, size:.090, light:.82, members:3 },
  { ship:'lancer', direction:-1, duration:14, period:35, offset:5.5, y:.65, drift:-.14, bow:.068, size:.173, light:.95, members:1 },
  { ship:'sweeper', direction:1, duration:29, period:45, offset:32, y:.43, drift:.13, bow:.052, size:.095, light:.63, members:2 }
];
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

function drawCraft(c, image, x, y, size, turn, luminosity, friendly = false, thrust = 1) {
  c.save();
  c.translate(x, y);
  c.rotate(turn);
  c.globalAlpha = luminosity;
  const sign = friendly ? -1 : 1;
  const aft = -size * .24 * sign;
  const tail = aft - size * .67 * sign * thrust;
  const jet = c.createLinearGradient(0, aft, 0, tail);
  jet.addColorStop(0, friendly ? '#c4fffb' : '#fff3be');
  jet.addColorStop(.23, friendly ? '#61c9ff89' : '#ff7957a8');
  jet.addColorStop(1, friendly ? '#4e7af900' : '#ff875100');
  c.fillStyle = jet;
  for (const edge of [-1, 1]) {
    const engine = edge * size * .105;
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
    for (const patrol of patrols) {
      const phase = (time * (1 + launchPhase * .075) + patrol.offset) % patrol.period / patrol.duration;
      if (phase >= 1) continue;
      const size = width * patrol.size;
      const sign = patrol.direction;
      const x = width * (.5 + sign * 1.6 * (phase - .5));
      const y = height * (patrol.y + patrol.drift * phase + patrol.bow * Math.sin(Math.PI * phase)) + launchPhase * height * .17;
      const slope = height * (patrol.drift + Math.PI * patrol.bow * Math.cos(Math.PI * phase));
      const turn = Math.atan2(slope, width * sign * 1.6) - Math.PI / 2;
      const alpha = patrol.light * (1 - launchPhase * .65);
      for (let i = patrol.members - 1; i >= 0; i--) {
        const wing = i === 0 ? 0 : i % 2 === 1 ? -1 : 1;
        drawCraft(c, images.get(patrol.ship), x - sign * i * size * .75, y + wing * size * .39,
          i === 0 ? size : size * .88, turn, alpha);
      }
    }
    const launchProgress = launchPhase ** 1.7;
    const hover = reduce ? 0 : Math.sin(time * 1.3);
    const heroY = height * (.44 - .69 * launchProgress) + hover * (1 - launchPhase) * 3.2;
    const heroSize = width * (.60 - .34 * launchProgress);
    const bank = (.12 + hover * .027) * (1 - launchPhase);
    drawCraft(c, images.get(ship), width * .5, heroY, heroSize, bank,
      images.has(ship) ? 1 : .28, true, .175 + launchPhase * .9);
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

  for (const key of new Set([ship, ...patrols.map((patrol) => patrol.ship)])) {
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
