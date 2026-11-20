const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const [origin = 'http://127.0.0.1:4183/', output = 'test-artifacts/stellar-replays'] = process.argv.slice(2);

async function verifyIn(engine, label) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width:390, height:844 }, acceptDownloads: true, serviceWorkers:'block' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(/\/app\.mjs(\?|$)/, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()) + '\nwindow.replayQA={renderer};' });
    });
    await page.clock.install();
    await page.goto(origin);
    await page.getByRole('button', { name:'Settings', exact:true }).click();
    for (const name of ['Music', 'Sound effects']) {
      await page.getByRole('button', { name, exact:true, pressed:true }).click();
      await page.getByRole('button', { name, exact:true, pressed:false }).waitFor();
    }
    await page.getByRole('button', { name:'Back', exact:true }).click();
    await page.getByRole('button', { name:'Arcade', exact:true }).click();
    await page.getByRole('button', { name:'Endless', exact:true }).click();
    await page.getByRole('button', { name:'Pause', exact:true }).waitFor();
    await page.keyboard.down('ArrowRight');
    await page.clock.runFor(440);
    await page.keyboard.up('ArrowRight');
    // Accelerate the presentation only. Run every scheduled fixed physics tick with the real input handlers.
    await page.evaluate(() => { window.replayQA.renderer.draw = () => {}; });
    const save = page.getByRole('button', { name:'Save flight replay', exact:true });
    for (let i = 0; i < 24 && !await save.isVisible(); i++) await page.clock.runFor(16000);
    await save.waitFor();
    const download = page.waitForEvent('download');
    await save.click();
    const file = path.resolve(output, `${label}-flight.json`);
    await (await download).saveAs(file);
    const result = JSON.parse(execFileSync(process.execPath, [path.resolve(__dirname, 'verify-stellar-run.mjs'), file], { encoding:'utf8' }));
    assert.equal(result.valid, true);
    assert.deepEqual(errors, []);
    return { browser:label, bytes:fs.statSync(file).size, ...result };
  } finally {
    await browser.close();
  }
}

async function main() {
  fs.mkdirSync(output, { recursive:true });
  const result = await Promise.all([verifyIn(chromium, 'chromium'), verifyIn(webkit, 'webkit')]);
  assert.notEqual(result[0].seed, result[1].seed);
  fs.writeFileSync(path.join(output, 'verified.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
