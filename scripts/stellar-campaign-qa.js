const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { chooseFlightPath } = require('./stellar-qa-pilot.js');

const origin = process.argv[2] ?? 'http://127.0.0.1:4182/arcade/index.html';
const folder = path.resolve(process.argv[3] ?? 'test-artifacts/stellar/campaign');
const viewport = process.argv[4] === 'compact' ? {width:320,height:568} : {width:390,height:844};
const highContrast = process.argv.includes('--high-contrast');

async function clearBossOnly(page) {
  // Exercise the real boss in the page after seeking the wave timer. No hull,
  // loadout, score, damage or terminal result is assigned by this fixture.
  return page.evaluate(async () => {
    const { state, pilot } = window.campaign;
    const f = state.flight;
    f.elapsed = f.stage.bossAt - .009;
    f.waveIndex = f.stage.waves.length;
    f.dropIndex = f.stage.drops.length;
    f.terrainIndex = f.stage.terrain?.length ?? 0;
    let commands = 0;
    const frame = 1/60;
    const cue = {2:'wall',4:'rail',5:'realm',6:'wall'}[f.stage.id];
    while (f.status === 'active' && f.elapsed - f.stage.bossAt < 105) {
      const b = f.boss;
      if (b && commands % 6 === 0) {
        const desired = pilot(f,{left:17,right:367,top:235,bottom:731});
        f.drag(desired.x-f.xIntent, desired.y-f.yIntent);
      }
      f.step(frame);
      commands++;
      const pattern = cue === 'realm' ? b?.realm === 'ghost' : cue
        ? f.hazards.some((hazard) => hazard.kind === cue && hazard.age < hazard.windup) : b?.attack === 2;
      if (b && pattern) {
        window.campaign.firstVolley = { kind:b.kind, elapsed:f.elapsed, hull:f.player.hull };
        return { status:'sample-ready', commands, elapsed:f.elapsed, cue };
      }
    }
    return { status:f.status, commands, elapsed:f.elapsed };
  });
}

async function finishFixture(page) {
  return page.evaluate(() => {
    const { state, pilot } = window.campaign;
    const f=state.flight;
    let steps=0;
    while (f.status==='active' && steps<97*60) {
      if (steps%5===0) {
        const desired = pilot(f,{left:17,right:367,top:235,bottom:731});
        f.drag(desired.x-f.xIntent, desired.y-f.yIntent);
      }
      f.step(1/60);
      steps++;
    }
    return { status:f.status, clock:f.elapsed, score:f.score, damage:f.bossDamage, hull:f.player.hull,
      bossHull:f.boss?.hull, modules:f.boss?.parts.map((part)=>part.hull), mastery:f.terminal()?.mastery, ship:f.run.ship };
  });
}

async function verify() {
  fs.mkdirSync(folder,{recursive:true});
  const browser=await chromium.launch();
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,serviceWorkers:'block',deviceScaleFactor:1});
  const page=await context.newPage();
  const errors=[];
  const report=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/\/app\.mjs(\?|$)/,async(route)=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text())+'\nwindow.campaign={state,renderer,store,pilot:'+String(chooseFlightPath)+'};'});
  });
  const shot=(name)=>page.screenshot({path:path.join(folder,`${name}.png`)});
  try {
    await page.goto(origin);
    if (highContrast) {
      await page.getByRole('button',{name:'Settings',exact:true}).tap();
      await page.getByRole('button',{name:'High contrast hazards'}).tap();
      await page.getByRole('button',{name:'Back'}).tap();
    }
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
      report.push({stage:i,cue:seek.cue,...finished});
      if (i === 1) {
        await page.getByRole('button',{name:'Upgrades',exact:true}).tap();
        assert.equal(await page.getByRole('button',{name:'Upgrades',exact:true}).getAttribute('aria-pressed'),'true');
        await page.getByRole('button',{name:'Back'}).tap();
        await page.getByRole('button',{name:/^Next ·/}).waitFor();
      }
      if(i===2 || i===4) {
        const craft = i === 2 ? 'Interceptor' : 'Gunship';
        await page.getByRole('button',{name:`${craft} unlocked`}).tap();
        await page.locator('.craft-art').evaluate(image=>image.decode());
        await shot(craft.toLowerCase());
        await page.getByRole('button',{name:`Equip ${craft}`}).tap();
        await page.getByRole('button',{name:'Back'}).tap();
      }
      if(i<count) await page.getByRole('button',{name:/^Next ·/}).tap();
    }
    await page.getByRole('button',{name:'Upgrades',exact:true}).tap();
    const items = [['Calibrated Rails',70],['Cycling Chamber',125],['Resonant Cells',210],['Ablative Hull',95]];
    for (const [key,cost] of items) {
      await page.getByRole('button',{name:new RegExp(`^${key}`)}).tap();
      await page.getByRole('button',{name:`Install for ${cost} Salvage`}).tap();
      await page.getByText('Installed on every ship.').waitFor();
      await page.getByRole('button',{name:'Back'}).tap();
    }
    const wallet = await page.locator('.balance').innerText();
    if (count === 6) assert.equal(wallet.trim(),'257 Salvage');
    await shot('upgrades-installed');
    await page.getByRole('button',{name:'Back'}).tap();
    const replay = page.getByRole('button',{name:'Replay stage',exact:true});
    await replay.tap();
    await page.getByRole('meter',{name:'Hull',exact:true}).waitFor();
    assert.equal(await page.locator('#hull').getAttribute('aria-valuenow'),count === 6 ? '7' : '5');
    await shot('upgraded-replay');
    await page.reload();
    await page.getByRole('button',{name:'Records',exact:true}).tap();
    await page.getByLabel('Stellar Rebels').getByText('Vesper Orbit', { exact:true }).waitFor();
    await shot('records');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(folder,'playthrough.json'),JSON.stringify({origin,viewport,highContrast,wallet,report,
      coverage:'Actual title and keyboard inputs through the stage openings. The wave timer is advanced for deterministic boss fixtures. Damage, clearing, settlements, equip, upgrade, Next and records run through their normal paths.'},null,2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
}

verify().catch((error)=>{console.error(error);process.exitCode=1;});
