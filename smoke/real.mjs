import { chromium } from 'playwright';

// Living-realism regression: ice, petals, leaves, fish, swim, dive, fireflies, NPC brains.
let allOk = true;
const check = (n, ok, x = '') => { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + n + (x ? ' | ' + x : '')); if (!ok) allOk = false; };
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 640, height: 360 } });
const errors = [], failed = [];
page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text().slice(0, 200)); });
page.on('requestfailed', r => failed.push(r.url().slice(0, 120)));
await page.goto('http://127.0.0.1:8000/?test=1', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__booted === true && window.forestDiagnostics?.()?.texturesReady, null, { timeout: 240000 });
await page.evaluate(() => { simTest.start(); simTest.day(); });
await page.waitForFunction(() => window.forestDiagnostics().wildlife.deerLoaded, null, { timeout: 120000 });
const diag = () => page.evaluate(() => window.forestDiagnostics());

// Winter ice
await page.evaluate(() => { simTest.setSeason(3); simTest.climateStep(1); });
let d = await diag();
check('winter freezes pond (ice on)', d.climate.ice === true, JSON.stringify({ ice: d.climate.ice }));
// Spring sakura
await page.evaluate(() => { simTest.setSeason(0); simTest.climateStep(1); });
d = await diag();
check('spring sakura petals fall', d.climate.petals === true, JSON.stringify({ petals: d.climate.petals }));
// Autumn canopy leaves
await page.evaluate(() => { simTest.setSeason(2); simTest.climateStep(1); });
d = await diag();
check('autumn leaves fall', d.climate.autumnLeaves === true, JSON.stringify({ leaves: d.climate.autumnLeaves }));
await page.evaluate(() => { simTest.setSeason(1); simTest.climateStep(1); });
// Fish school
d = await diag();
check('fish school alive (9)', d.fishSchool === 9, JSON.stringify({ fish: d.fishSchool }));
// Fireflies (summer night)
await page.evaluate(() => { simTest.night(); });
await page.waitForTimeout(2500);
d = await diag();
check('fireflies at summer night', d.flies === true, JSON.stringify({ flies: d.flies }));
await page.evaluate(() => { simTest.day(); });
// NPC brains (exercise greet/behavior/speak paths without throwing)
await page.evaluate(() => { simTest.nearGardener(); for (let i = 0; i < 5; i++) simTest.stepNPC(0.5, false); });
check('NPC behavior machine runs', true);
// Swim: drop into pond, expect float at surface (pauseRender => fast logic frames)
await page.evaluate(() => { simTest.pauseRender(true); simTest.setCamera(45, 2, 60); });
await page.waitForTimeout(8000);
const swimY = await page.evaluate(() => window.forestDiagnostics().position[1]);
check('player floats when swimming', Math.abs(swimY - 0.12) < 0.6, `y=${swimY.toFixed(2)}`);
// Dive tint: below surface -> overlay fades in (read fast before float lifts camera)
await page.evaluate(() => { simTest.setCamera(45, -1.5, 60); });
await page.waitForTimeout(400);
const tint = await page.evaluate(() => parseFloat(document.getElementById('diveTint').style.opacity || '0'));
check('underwater tint fades in', tint > 0.3, `opacity=${tint}`);
await page.evaluate(() => { simTest.pauseRender(false); });
console.log('ERRORS: ' + JSON.stringify(errors));
console.log('FAILED_REQ: ' + JSON.stringify(failed));
console.log('REAL_RESULT: ' + (allOk && errors.length === 0 && failed.length === 0 ? 'PASS' : 'FAIL'));
await b.close();
if (!(allOk && errors.length === 0 && failed.length === 0)) process.exit(1);
