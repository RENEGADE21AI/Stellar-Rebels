const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { chooseFlightPath } = require('./stellar-qa-pilot.js');

const origin = process.argv[2] ?? 'http://127.0.0.1:4182/arcade/index.html';
const folder = path.resolve(process.argv[3] ?? 'test-artifacts/stellar/campaign');
const viewport = process.argv[4] === 'compact' ? {width:320,height:568} : {width:390,height:844};
const highContrast = process.argv.includes('--high-contrast');

async function bossHeadroom(page, entry = false) {
  return page.evaluate((useEntryPosition) => {
    const { state, renderer } = window.campaign;
    const b = state.flight.boss;
    const image = renderer.sprites.get(b.realm === 'ghost' ? 'wraith-ghost' : b.kind);
    const mask = new OffscreenCanvas(image.naturalWidth, image.naturalHeight).getContext('2d');
    mask.drawImage(image, 0, 0);
    const pixels = mask.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data;
    const firstOpaque = pixels.findIndex((value, index) => index % 4 === 3 && value >= 180);
    const spriteTop = Math.floor(firstOpaque / 4 / image.naturalWidth) / image.naturalHeight;
    const sky = renderer.canvas.getBoundingClientRect();
    const y = useEntryPosition ? b.y : (b.spec.arrivalY ?? 230) - 7;
    const bobbingTop = y + (spriteTop - .5) * b.spec.size;
    const canvasTop = sky.top + (sky.height - renderer.unit * 768) / 2;
    return Math.round(canvasTop + bobbingTop * renderer.unit - document.getElementById('boss-meter').getBoundingClientRect().bottom);
  }, entry);
}

async function seekBossEntry(page) {
  await page.evaluate(async () => {
    const { state } = window.campaign;
    const f = state.flight;
    if (f.endless) {
      const { ENDLESS_BOSSES } = await import(new URL('catalog.mjs', document.baseURI).href);
      f.endlessBossCount = ENDLESS_BOSSES.indexOf('siphon');
      f.elapsed = f.nextEndlessBoss - .009;
    } else {
      f.elapsed = f.stage.bossAt - .009;
      f.waveIndex = f.stage.waves.length;
      f.dropIndex = f.stage.drops.length;
      f.terrainIndex = f.stage.terrain?.length ?? 0;
    }
    for (let i = 0; i < 130 && f.status === 'active'; i++) {
      if (f.boss && f.boss.age >= f.boss.entryTime - .25) return;
      f.step(1 / 60);
    }
    throw Error('The boss did not enter its hittable window');
  });
  await page.locator('#boss-meter').waitFor();
  return bossHeadroom(page, true);
}

async function clearBossOnly(page) {
  // Exercise the real boss in the page after seeking the wave timer. No hull,
  // loadout, score, damage or terminal result is assigned by this fixture.
  return page.evaluate(async () => {
    const { state, pilot } = window.campaign;
    const f = state.flight;
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
    await page.getByRole('button',{name:'Arcade',exact:true}).tap();
    const count=await page.locator('.stage').count();
    assert.ok(count>=3);
    assert.equal(await page.locator('.stage:disabled').count(), count-1);
    await shot('stage-select');
    await page.getByRole('button',{name:/01 Vesper Orbit/}).tap();
    await page.getByRole('button', { name:'Skip training', exact:true }).tap();
    for(let i=1;i<=count;i++) {
      await page.waitForFunction(id=>window.campaign.state.mode==='playing'&&window.campaign.state.flight.stage.id===id,i);
      await page.keyboard.down(i%2?'ArrowLeft':'ArrowRight');
      await page.waitForTimeout(480);
      await page.keyboard.up(i%2?'ArrowLeft':'ArrowRight');
      await page.waitForTimeout(2760);
      await shot(`${i}-opening`);
      const entryHeadroom = await seekBossEntry(page);
      assert.ok(entryHeadroom >= 6, `Stage ${i}: hittable boss hull has ${entryHeadroom}px beneath its introductory HUD`);
      if (i === 2) await shot('2-boss-entry');
      const seek=await clearBossOnly(page);
      assert.equal(seek.status,'sample-ready');
      await shot(`${i}-boss-fixture`);
      const headroom = await bossHeadroom(page);
      assert.ok(headroom >= 6, `Stage ${i}: steady-state boss hull has ${headroom}px between it and the HUD`);
      const finished=await finishFixture(page);
      assert.equal(finished.status,'clear', JSON.stringify(finished));
      await page.locator('.result-card').waitFor();
      await page.getByText(/Salvage banked/).waitFor();
      await shot(`${i}-clear`);
      report.push({stage:i,cue:seek.cue,entryHeadroom,headroom,...finished});
      if (i === 1) {
        await page.getByRole('button',{name:'Upgrades',exact:true}).tap();
        assert.equal(await page.getByRole('button',{name:'Upgrades',exact:true}).getAttribute('aria-pressed'),'true');
        await page.getByRole('button',{name:'Back'}).tap();
        await page.getByRole('button',{name:/^Next Flight/}).waitFor();
      }
      if(i===2 || i===4) {
        const craft = i === 2 ? 'Interceptor' : 'Gunship';
        await page.getByRole('button',{name:`${craft} unlocked`}).tap();
        await page.locator('.craft-art').evaluate(image=>image.decode());
        await shot(craft.toLowerCase());
        await page.getByRole('button',{name:`Equip ${craft}`}).tap();
        await page.getByRole('button',{name:'Back'}).tap();
      }
      if(i<count) await page.getByRole('button',{name:/^Next Flight/}).tap();
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
    await page.getByRole('button',{name:'Back',exact:true}).tap();
    await page.getByRole('button',{name:'Arcade',exact:true}).tap();
    await page.getByRole('button',{name:'Endless',exact:true}).tap();
    await page.waitForFunction(() => window.campaign.state.mode === 'playing' && window.campaign.state.flight.endless);
    const gravityEntry = await seekBossEntry(page);
    assert.ok(gravityEntry >= 6, `Gravity Platform has ${gravityEntry}px between its hittable hull and the introductory HUD`);
    await page.getByText('Gravity Platform', { exact:true }).waitFor();
    await shot('endless-gravity-entry');
    await page.waitForFunction(() => window.campaign.state.flight.boss.age >= 4.3);
    const gravityHeadroom = await bossHeadroom(page);
    assert.ok(gravityHeadroom >= 6, `Gravity Platform has ${gravityHeadroom}px between its hull and the HUD`);
    await shot('endless-gravity');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(folder,'playthrough.json'),JSON.stringify({origin,viewport,highContrast,wallet,report,gravityHeadroom,gravityEntry,
      coverage:'Actual title and keyboard inputs through the stage openings. The wave timer is advanced for deterministic boss fixtures. Damage, clearing, settlements, equip, upgrade, Next and records run through their normal paths.'},null,2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
}

verify().catch((error)=>{console.error(error);process.exitCode=1;});
