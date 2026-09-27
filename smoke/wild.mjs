import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const errors = [], failed = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('response', r => { if (r.status() >= 400) failed.push(r.url() + ' :: ' + r.status()); });
let allOk = true;
const check = (n, ok, x = '') => { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + n + (x ? ' | ' + x : '')); if (!ok) allOk = false; };

await page.goto('http://127.0.0.1:8000/?test=1', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__booted === true && window.forestDiagnostics?.()?.texturesReady, null, { timeout: 240000 });
await page.evaluate(() => { simTest.pauseRender(true); simTest.start(); simTest.day(); });
await page.waitForFunction(() => window.forestDiagnostics().wildlife.deerLoaded && window.forestDiagnostics().wildlife.foxLoaded, null, { timeout: 120000 });
const w = (await page.evaluate(() => window.forestDiagnostics())).wildlife;
check('deer herd loaded (5, no error)', w.deer === 5 && w.loadError === '', JSON.stringify(w));
check('more animals (fox/rabbit/squirrel/frog)', w.foxes === 2 && w.foxLoaded && w.foxError === '' && w.rabbits === 4 && w.squirrels === 3 && w.frogs === 3, JSON.stringify({ foxes: w.foxes, rabbits: w.rabbits, squirrels: w.squirrels, frogs: w.frogs }));
check('bird flock (12, 3 species)', w.birds === 12 && w.birdSpecies === 3);
// Forage: teleport to nearest forageable and pick it
await page.evaluate(() => { const p = simTest.foragePoint(); simTest.setCamera(p[0] + 1.2, p[1] + 1.7, p[2] + 1.2); simTest.cameraLook(p[0], p[1] + 0.5, p[2]); });
await page.waitForTimeout(400);
await page.keyboard.press('e');
await page.waitForTimeout(400);
const fx = (await page.evaluate(() => window.forestDiagnostics())).effects;
check('forage pick -> basket 1', fx.basket === 1 && fx.picked === 1, JSON.stringify(fx));
// Deer flight: teleport next to deer0, run frames, expect flee displacement.
// NOTE: SwiftShader ~1fps x dt-clamp 0.05 => game time runs ~20x slow; allow 75s.
const flee = await page.evaluate(() => {
  const d0 = window.forestDiagnostics().wildlife.deerPos;
  simTest.setCamera(d0[0] + 3, simTest.sampleHeight(d0[0] + 3, d0[1] + 3) + 1.7, d0[1] + 3);
  return new Promise(res => {
    const p0 = window.forestDiagnostics().wildlife.deerPos;
    setTimeout(() => {
      const w = window.forestDiagnostics().wildlife;
      res({ moved: Math.hypot(w.deerPos[0] - p0[0], w.deerPos[1] - p0[1]), state: w.deerState });
    }, 75000);
  });
});
check('deer flees approaching player', flee.moved > 2 || flee.state === 'flee', `displacement=${flee.moved.toFixed(1)}m state=${flee.state}`);
// Regression: base systems still green
const d = await page.evaluate(() => window.forestDiagnostics());
check('base intact (cabins/monkeys/trees)', d.cabins === 2 && d.monkeys === 6 && d.trees > 1000);
console.log('ERRORS:', JSON.stringify(errors.slice(0, 10)));
console.log('FAILED_REQ:', JSON.stringify(failed.slice(0, 10)));
console.log(allOk && errors.length === 0 && failed.length === 0 ? 'WILD_RESULT: PASS' : 'WILD_RESULT: FAIL');
await browser.close();
