const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const origin = process.argv[2] ?? 'http://127.0.0.1:4182/arcade/index.html';
const folder = path.resolve(process.argv[3] ?? 'test-artifacts/stellar/campaign');

async function clearBossOnly(page) {
  // Exercise the real boss in the page after seeking the wave timer. No hull,
  // loadout, score, damage or terminal result is assigned by this fixture.
  return page.evaluate(async () => {
    const { state } = window.campaign;
    const f = state.flight;
    f.elapsed = f.stage.bossAt - .009;
    f.waveIndex = f.stage.waves.length;
    f.dropIndex = f.stage.drops.length;
    f.terrainIndex = f.stage.terrain?.length ?? 0;
    let drawn = false;
    let commands = 0;
    const frame = 1/60;
    while (f.status === 'active' && f.elapsed - f.stage.bossAt < 105) {
      const b = f.boss;
      if (b && commands % 6 === 0) {
        const p = f.player;
        const predict = (p.y - b.y) / (f.run.ship === 'needle' ? 782 : 685);
        const centroid = 192 + b.spec.motion * Math.sin(Math.max(0,b.age+predict-b.entryTime)*.78);
        const positions = b.parts.filter((part) => part.hull>0).map((part) => centroid+part.dx);
        const target = positions.length ? positions.sort((a,c)=>Math.abs(a-p.x)-Math.abs(c-p.x))[0] : centroid;
        const future = f.hostile.filter((s)=>s.y>p.y-140 && s.y<p.y+12);
        const measure = (candidate) => Math.abs(candidate-target)*.42+Math.abs(candidate-p.x)*.17+future.reduce((risk,s)=>{
          const t=(p.y-s.y)/s.vy;
          if (t<0 || t>.69) return risk;
          const x=p.x + (candidate-p.x)*Math.min(1, f.ship.speed*t/Math.max(1, Math.abs(candidate-p.x)));
          const distance=Math.abs(s.x+s.vx*t-x);
          return risk+Math.max(0,(s.radius+f.ship.hit+8)-distance)*16;
        },0);
        const x = [target,...Array.from({length:23},(_,i)=>26+i*15)].sort((a,c)=>measure(a)-measure(c))[0];
        f.drag(x-f.xIntent,610-f.yIntent);
      }
      f.step(frame);
      commands++;
      if (b?.attack === 2 && !drawn) {
        drawn = true;
        window.campaign.firstVolley = { kind:b.kind, elapsed:f.elapsed, hull:f.player.hull };
        return { status:'sample-ready', commands, elapsed:f.elapsed };
      }
    }
    return { status:f.status, commands, elapsed:f.elapsed };
  });
}

async function finishFixture(page) {
  return page.evaluate(() => {
    const f=window.campaign.state.flight;
    let steps=0;
    while (f.status==='active' && steps<78*60) {
      if (steps%5===0) {
        const b=f.boss,p=f.player;
        const lead=(p.y-b.y)/(f.run.ship==='needle'?782:685);
        const root=192+b.spec.motion*Math.sin(Math.max(0,b.age+lead-b.entryTime)*.78);
        const parts=b.parts.filter(part=>part.hull>0);
        const desired=root+(parts.sort((a,c)=>Math.abs(a.dx+root-p.x)-Math.abs(c.dx+root-p.x))[0]?.dx ?? 0);
        const candidates=[];
        for (const y of [p.y,540,620,690]) {
          for (const x of [desired,...Array.from({length:24},(_,i)=>27+14.2*i)]) {
            const travel=Math.hypot(x-p.x,y-p.y);
            let cost=Math.abs(x-desired)*.34+travel*.19+Math.abs(y-607)*.08;
            for (const s of f.hostile) {
              if(s.y>Math.max(y,p.y)+13 || s.y+s.vy*.95<Math.min(y,p.y)-20) continue;
              for (let t=.06;t<.90;t+=.07) {
                const fraction=Math.min(1,f.ship.speed*t/Math.max(1,travel));
                const xx=p.x+(x-p.x)*fraction-(s.x+s.vx*t);
                const yy=p.y+(y-p.y)*fraction-(s.y+s.vy*t);
                cost+=Math.max(0,s.radius+f.ship.hit+7-Math.hypot(xx,yy))*15;
              }
            }
            if (f.hazards.some(w=>w.kind==='rail' && w.age>w.windup-.5 && Math.abs(x-w.x)<w.width/2+f.ship.hit+8)) cost+=310;
            candidates.push({x,y,cost});
          }
        }
        candidates.sort((a,c)=>a.cost-c.cost);
        f.drag(candidates[0].x-f.xIntent,candidates[0].y-f.yIntent);
      }
      f.step(1/60);
      steps++;
    }
    return { status:f.status, clock:f.elapsed, score:f.score, damage:f.bossDamage, hull:f.player.hull, mastery:f.terminal()?.mastery, ship:f.run.ship };
  });
}

async function verify() {
  fs.mkdirSync(folder,{recursive:true});
  const browser=await chromium.launch();
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const errors=[];
  const report=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/\/app\.mjs(\?|$)/,async(route)=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text())+'\nwindow.campaign={state,renderer,store};'});
  });
  const shot=(name)=>page.screenshot({path:path.join(folder,`${name}.png`)});
  try {
    await page.goto(origin);
    await page.getByRole('button',{name:'Play',exact:true}).tap();
    const count=await page.locator('.stage').count();
    assert.ok(count>=3);
    assert.equal(await page.locator('.stage:disabled').count(), count-1);
    await shot('stage-select');
    await page.getByRole('button',{name:/01 Vesper Orbit/}).tap();
    for(let i=1;i<=count;i++) {
      await page.waitForFunction(id=>window.campaign.state.mode==='playing'&&window.campaign.state.flight.stage.id===id,i);
      await page.keyboard.down(i%2?'ArrowLeft':'ArrowRight');
      await page.waitForTimeout(480);
      await page.keyboard.up(i%2?'ArrowLeft':'ArrowRight');
      await page.waitForTimeout(2760);
      await shot(`${i}-opening`);
      const seek=await clearBossOnly(page);
      assert.equal(seek.status,'sample-ready');
      await shot(`${i}-boss-fixture`);
      const finished=await finishFixture(page);
      assert.equal(finished.status,'clear', JSON.stringify(finished));
      await page.locator('.result-card').waitFor();
      await page.getByText(/Salvage banked/).waitFor();
      await shot(`${i}-clear`);
      report.push({stage:i,...finished});
      if(i===2) {
        await page.getByRole('button',{name:'Interceptor unlocked'}).tap();
        await page.locator('.craft-art').evaluate(image=>image.decode());
        await shot('interceptor');
        await page.getByRole('button',{name:'Equip Interceptor'}).tap();
        await page.getByRole('button',{name:'Back'}).tap();
      }
      if(i<count) await page.getByRole('button',{name:/^Next ·/}).tap();
    }
    await page.getByRole('button',{name:/Stages|Return to stages/}).first().tap();
    await page.getByRole('button',{name:/Change ship/}).tap();
    await page.getByRole('button',{name:'Upgrades',exact:true}).tap();
    await page.getByRole('button',{name:/^Calibrated Rails/}).tap();
    await page.getByRole('button',{name:/Install for 70 Salvage/}).tap();
    await page.getByText('Installed on every ship.').waitFor();
    await shot('upgrade-installed');
    await page.reload();
    await page.getByRole('button',{name:'Records',exact:true}).tap();
    await page.getByLabel('Stellar Rebels').getByText('Vesper Orbit', { exact:true }).waitFor();
    await shot('records');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(folder,'playthrough.json'),JSON.stringify({origin,report,coverage:'Actual title, real keyboard navigation/combat and first opening for each stage. Deterministic boss-only fixtures using the normal update, state settlement and result routes. No complete browser campaign win is claimed from this script.'},null,2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
}

verify().catch((error)=>{console.error(error);process.exitCode=1;});
