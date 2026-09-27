import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errors = [], failed = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('response', r => { if (r.status() >= 400) failed.push(r.url() + ' :: ' + r.status()); });
await page.goto('http://127.0.0.1:8000/?test=1', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__booted === true && window.forestDiagnostics?.()?.texturesReady, null, { timeout: 240000 });
await page.evaluate(() => { window.simTest.start(); window.simTest.pauseRender(true); });
const res = [];
const s0 = await page.evaluate(() => window.simTest.surv());
res.push(['boot: npcs=4 wolves>=2 nodes>=60 vitals=100', s0.npcs.length === 4 && s0.wolves >= 2 && s0.nodes >= 60 && s0.hp === 100 && s0.hun === 100, JSON.stringify({ npcs: s0.npcs.length, wolves: s0.wolves, nodes: s0.nodes })]);
// craft spear via simTest
await page.evaluate(() => { const t = window.simTest; t.svgive('wood', 2); t.svgive('sharp_stone', 3); t.svgive('vine', 2); });
const crafted = await page.evaluate(() => window.simTest.svcraft('spear'));
const s1 = await page.evaluate(() => window.simTest.surv());
res.push(['craft spear: ok pack.spear=1 quest2', crafted === true && s1.pack.spear === 1 && s1.quests[1] === true, JSON.stringify(s1.pack)]);
// hunger decay over ~2.5s of fast ticks
await page.evaluate(() => window.__f0 = window.forestDiagnostics().frames);
await page.waitForFunction(() => window.forestDiagnostics().frames > window.__f0 + 40, null, { timeout: 180000 });
const s2 = await page.evaluate(() => window.simTest.surv());
res.push(['decay: hun<100', s2.hun < 100, 'hun=' + s2.hun]);
// night cold
await page.evaluate(() => { window.simTest.night(); window.__f1 = window.forestDiagnostics().frames; });
await page.waitForFunction(() => window.forestDiagnostics().frames > window.__f1 + 30, null, { timeout: 180000 });
const s3 = await page.evaluate(() => window.simTest.surv());
res.push(['night: tmp<100 npcs resting', s3.tmp < 100 && s3.npcs.every(n => n[1] === 'RESTING'), 'tmp=' + s3.tmp + ' ' + JSON.stringify(s3.npcs)]);
await page.evaluate(() => window.simTest.day());
// turret via Digit6
await page.evaluate(() => { window.simTest.svgive('wood', 5); window.simTest.svgive('stone', 4); });
await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit6', bubbles: true })));
await page.waitForTimeout(400);
const s4 = await page.evaluate(() => window.simTest.surv());
res.push(['turret placed', s4.turrets === 1, 'turrets=' + s4.turrets]);
// wall via Digit4 + click
await page.evaluate(() => { window.simTest.svgive('wood', 4); });
await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit4', bubbles: true })));
await page.waitForTimeout(400);
await page.evaluate(() => document.body.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })));
await page.waitForTimeout(400);
const s5 = await page.evaluate(() => window.simTest.surv());
res.push(['wall placed', s5.walls === 1, 'walls=' + s5.walls]);
// F-chain near camp (chop or workshop or ride — any true)
await page.evaluate(() => window.simTest.svpos());
await page.waitForTimeout(300);
const fnear = await page.evaluate(() => window.simTest.svchop());
res.push(['F-chain consumes near camp', fnear === true, 'chop=' + fnear]);
let pass = 0;
for (const [name, ok, extra] of res) { if (ok) pass++; console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + ' | ' + extra); }
console.log('ERRORS:', JSON.stringify(errors), 'FAILED:', JSON.stringify(failed));
console.log(pass === res.length && errors.length === 0 ? 'SURV: PASS' : 'SURV: FAIL');
await browser.close();
