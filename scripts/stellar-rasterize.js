const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const source = path.join(root, 'source-art', 'stellar');
const runtime = path.join(root, 'arcade', 'media', 'brand');
const production = process.argv.includes('--production');

async function main() {
  const browser = await chromium.launch(process.env.ARCADE_CHROMIUM ? { executablePath: process.env.ARCADE_CHROMIUM } : {});
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    async function exportPng(svg, output, width, height) {
      await page.setViewportSize({ width, height });
      await page.setContent(`<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>` + fs.readFileSync(svg, 'utf8'));
      fs.mkdirSync(path.dirname(output), { recursive: true });
      await page.screenshot({ path: output, omitBackground: true });
    }
    const brand = path.join(source, production ? 'brand' : 'brand-concepts');
    for (const file of fs.readdirSync(brand).filter((name) => name.endsWith('.svg'))) {
      const sourcePath = path.join(brand, file);
      const name = path.basename(file, '.svg');
      const dims = name.startsWith('horizontal') ? [1208, 192] : name.includes('stacked') ? [672, 402] : [512, 512];
      await exportPng(sourcePath, path.join(brand, 'png', `${name}.png`), ...dims);
      if (production && name === 'emblem-light') {
        fs.mkdirSync(runtime, { recursive: true });
        fs.copyFileSync(sourcePath, path.join(runtime, file));
      }
    }
    if (production) {
      for (const size of [32, 180, 192, 512, 1024]) {
        const target = size === 1024 ? path.join(brand, 'png') : runtime;
        await exportPng(path.join(brand, 'app-icon.svg'), path.join(target, `icon-${size}.png`), size, size);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
