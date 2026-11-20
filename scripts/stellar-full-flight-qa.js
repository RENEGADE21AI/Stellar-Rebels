const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { chooseFlightPath } = require('./stellar-qa-pilot.js');

const origin = process.argv[2] ?? 'http://127.0.0.1:4185/';
const output = path.resolve(process.argv[3] ?? 'test-artifacts/stellar/full-flight');
const endless = process.argv.includes('--endless');
const stages = endless ? 1 : Number(process.argv[4]) || 1;
const requestedSurvival = 300;
const viewport = { width:390, height:844 };
const stepWait = 77;

async function main() {
  fs.mkdirSync(output, { recursive:true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, deviceScaleFactor:1, isMobile:true, hasTouch:true, serviceWorkers:'block' });
  const page = await context.newPage();
  const input = await context.newCDPSession(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/\/app\.mjs(\?|$)/, async (route) => {
    const response = await route.fetch();
    const probe = [
      'window.fullFlight = { state, renderer, target:' + String(chooseFlightPath) + ' };',
      'let lastFrame;',
      'const recordFrame = time => {',
      '  if (state.mode === "playing" && window.fullFlight.intervals) {',
      '    if (lastFrame) window.fullFlight.intervals.push(time - lastFrame);',
      '    lastFrame = time;',
      '  } else lastFrame = undefined;',
      '  requestAnimationFrame(recordFrame);',
      '};',
      'requestAnimationFrame(recordFrame);'
    ].join('\n');
    await route.fulfill({ response, body:(await response.text()) + '\n' + probe });
  });
  const shot = (name) => page.screenshot({ path:path.join(output, name + '.png') });
  const dispatch = (type, position) => input.send('Input.dispatchTouchEvent', {
    type, touchPoints:position ? [{...position,id:1}] : []
  });
  const sample = () => page.evaluate(() => {
    const { state, renderer, target } = window.fullFlight;
    const f = state.flight;
    if (!f || state.mode !== 'playing') return { status:f?.status, mode:state.mode };
    const desired = target(f,{left:17,right:367,top:235,bottom:731},true);
    const scale = renderer.unit / 1.12;
    return { status:f.status, mode:state.mode, elapsed:f.elapsed, stage:f.stage.id, attack:f.boss?.attack ?? 0,
      boss:Boolean(f.boss), hull:f.player.hull, score:f.score, kills:f.kills, pickup:f.notice?.kind === 'pickup' ? f.notice.title : '',
      dx:(desired.x-f.xIntent)*scale, dy:(desired.y-f.yIntent)*scale };
  });

  try {
    const manifest = await (await page.request.get(new URL('/version.json', origin).href)).json();
    await page.goto(origin);
    await page.getByRole('button',{name:'Play',exact:true}).tap();
    await page.getByRole('button',{name:endless ? 'Endless' : /01 Vesper Orbit/}).tap();
    const report = [];
    for (let stage = 1; stage <= stages; stage++) {
      await page.waitForFunction((id) => window.fullFlight.state.mode === 'playing' && window.fullFlight.state.flight.stage.id === id, stage);
      await page.evaluate(() => { window.fullFlight.intervals = []; });
      let finger = { x:195, y:567 };
      let moves = 0;
      let reanchors = 0;
      let firstBoss = false;
      let nextSample = 30;
      const supplies = new Set();
      const marks = [];
      const started = Date.now();
      await dispatch('touchStart', finger);
      while (Date.now() - started < (endless ? 350000 : 260000)) {
        const current = await sample();
        if (current.status && current.status !== 'active') break;
        assert.equal(current.mode,'playing',JSON.stringify(current));
        if (current.elapsed >= nextSample) {
          marks.push({ time:current.elapsed, hull:current.hull, kills:current.kills, score:current.score });
          console.log(`Stage ${stage} · ${Math.round(current.elapsed)}s · hull ${current.hull} · score ${current.score}`);
          nextSample += 30;
        }
        if (current.pickup) supplies.add(current.pickup);
        if (!firstBoss && current.attack > 0) {
          await shot(`stage-${stage}-first-boss-volley`);
          firstBoss = true;
        }
        if (endless && current.elapsed >= requestedSurvival) break;
        if (Math.hypot(current.dx, current.dy) > 1) {
          const move = { x:finger.x+current.dx, y:finger.y+current.dy };
          if (move.x < 9 || move.x > viewport.width-9 || move.y < 135 || move.y > viewport.height-9) {
            await dispatch('touchEnd');
            finger = { x:195, y:567 };
            await dispatch('touchStart', finger);
            reanchors++;
          } else {
            finger = move;
            await dispatch('touchMove', finger);
            moves++;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, stepWait));
      }
      await dispatch('touchEnd');
      if (!endless) await page.locator('.result-card').waitFor({timeout:6000});
      const result = await page.evaluate(() => {
        const { state, intervals } = window.fullFlight;
        const sorted = intervals.slice().sort((a,b) => a-b);
        return { terminal:state.pending?.terminal, receipt:state.pending?.receipt, hull:state.flight.player.hull,
          elapsed:state.flight.elapsed, currentScore:state.flight.score,
          frames:{ count:sorted.length, p50:sorted[Math.floor(sorted.length*.5)], p95:sorted[Math.floor(sorted.length*.95)],
            over34:sorted.filter(v=>v>34).length } };
      });
      await shot(endless ? 'endless-soak' : `stage-${stage}-result`);
      report.push({ stage, wallMs:Date.now()-started, moves, reanchors, supplies:[...supplies], marks, ...result });
      fs.writeFileSync(path.join(output,'flight.json'),JSON.stringify({origin,manifest,viewport,report,
        coverage:'Stock runs at wall-clock speed in the running browser. Strategy read telemetry and sent Chromium touch inputs. No game state injection, seeking, artificial clock or assigned result.'},null,2));
      if (endless) assert.ok(result.elapsed >= requestedSurvival && result.hull > 0, JSON.stringify(result));
      else {
        assert.equal(result.terminal.status,'clear',JSON.stringify(result));
        assert.ok(moves > 80 && result.receipt?.award > 0);
      }
      if (stage < stages) await page.getByRole('button',{name:/^Next ·/}).tap();
    }
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
}

main().catch((error)=>{ console.error(error); process.exitCode=1; });
