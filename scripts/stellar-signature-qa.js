// Local playtest only. This driver leaves the public application and saves unchanged.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const origin = 'http://127.0.0.1:4182/arcade/index.html';
const out = path.resolve('test-artifacts/stellar/signature');
const viewport = { width: 390, height: 844 };
const ghostPrototype = `
const ghost = {used:0, last:-99, protected:0, counter:0};
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || state.mode !== 'playing') return;
  event.preventDefault();
  const f=state.flight;
  if (f.elapsed-ghost.last<7) return;
  ghost.used++; ghost.last=f.elapsed;
  f.player.guard=Math.max(.84,f.player.guard);
  const start=f.player.x;
  const check=()=>{
    if (state.mode!=='playing' || state.flight!==f) return;
    if (Math.abs(f.player.x-start)>60) { f.player.overdrive=Math.max(1.7,f.player.overdrive); ghost.counter++; }
  };
  setTimeout(check,580);
  f.message('Cross a lane for a counter burst',1.7,'pickup','Ghost Shift');
});
`;

async function trial(browser, variant) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const timeline = [];
  const problems = [];
  page.on('pageerror', error => problems.push(error.message));
  await page.route(/\/app\.mjs(\?|$)/, async (route) => {
    const response = await route.fetch();
    const source = (await response.text()).replace('new Flight(run);', `new Flight(run, {linkedCombat:${variant === 'formation'}});`);
    const experiment = variant === 'ghost' ? ghostPrototype : 'const ghost=null;';
    await route.fulfill({ response, body: `${source}\n${experiment}\nglobalThis.lab={state, ghost};` });
  });
  const cdp = await context.newCDPSession(page);
  const snapshot = () => page.evaluate(() => {
    const { state, ghost } = globalThis.lab;
    const f = state.flight;
    const command = f.enemies.find((e) => e.kind === 'relay' && e.hull > 0);
    return {
      clock: f.elapsed, mode: state.mode, equipped: f.run.equipment, x: f.player.x, y: f.player.y,
      hull: f.player.hull, score: f.score, kills: f.kills, breaks: f.breaks, ghost,
      command: command ? { x: command.x, target: command.x + command.side*30, timer: command.fireTimer, vane: command.vane, shots:command.volley } : null,
      wingJammed: f.enemies.filter((e) => e.jam > 0).length,
      threats: f.hostile.length, boss: f.boss?.kind ?? null
    };
  });

  await page.goto(origin);
  await page.getByRole('button', { name:'Arcade', exact: true }).click();
  await page.getByRole('button', { name: /01 Vesper Orbit/ }).click();
  await page.waitForFunction(() => globalThis.lab.state.mode === 'playing');
  const first = await snapshot();
  assert.deepEqual(first.equipped, [], 'comparison uses stock Kestrel');
  await page.clock.install({ time: new Date('2026-11-20T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-20T00:00:01Z'));
  const advance = (ms) => page.clock.runFor(ms);
  const capture = (tag) => page.screenshot({ path: path.join(out, `${variant}-${tag}.png`), animations: 'disabled' });
  async function until(sec) {
    const current = await snapshot();
    if (current.clock < sec) await advance(Math.round((sec-current.clock)*1000) + 35);
  }
  async function lane(target, duration) {
    const position = await snapshot();
    const x = 193;
    const y = 746;
    const dx = Math.round((target-position.x)*viewport.width/384/1.12);
    const end = Math.max(13, Math.min(viewport.width-13, x+dx));
    await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:end, y }] });
    await advance(duration);
    await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  }

  await until(3.1);
  await lane(133, 1100);
  await lane(258, 900);
  await until(7.2);
  await lane(118, 950);
  await lane(205, 1750);
  await until(14.3);
  await lane(118, 1070);
  await until(15.7);
  const approach = await snapshot();
  assert.ok(approach.command, 'authored relay encounter started in the first minute');
  await capture('approach');
  timeline.push({ label:'approach', ...approach });
  if (variant === 'ghost') await page.keyboard.press('Space');
  const firstAim = variant === 'formation' ? approach.command.target : 211;
  await lane(firstAim, 2100);
  const firstResult = await snapshot();
  timeline.push({ label:'first contact', ...firstResult });
  await capture('contact');
  if (variant === 'formation' && !firstResult.breaks && firstResult.command) {
    await lane(firstResult.command.target + 9, 1100);
  }
  if (variant === 'ghost' && !firstResult.ghost.counter) {
    await until(23.3);
    await page.keyboard.press('Space');
    await lane(119, 810);
  }
  const transition = await snapshot();
  timeline.push({ label:'tactical outcome', ...transition });
  await capture('outcome');
  await lane(261, 900);
  await lane(325, 870);
  await lane(231, 950);
  for (const x of [103,277,135,255,73,207,321,164,290,142,248,117,238,150,254,76]) {
    if ((await snapshot()).mode !== 'playing') break;
    await lane(x, 1800);
  }
  await until(59.5);
  const ending = await snapshot();
  timeline.push({ label:'end of opening', ...ending });
  assert.deepEqual(problems, []);
  await context.close();
  return { variant, timeline };
}

async function run() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    const trials = [];
    for (const variant of process.argv.slice(2).length ? process.argv.slice(2) : ['ordinary','formation','ghost']) {
      trials.push(await trial(browser, variant));
    }
    fs.writeFileSync(path.join(out,'comparison.json'), JSON.stringify({ viewport, trials }, null, 2));
    console.log(JSON.stringify(trials.map(({variant,timeline}) => ({variant,tactical:timeline[2],ending:timeline.at(-1)})), null, 2));
  } finally { await browser.close(); }
}

run().catch((error) => { console.error(error); process.exitCode=1; });
