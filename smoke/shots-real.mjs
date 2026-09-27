import { chromium } from 'playwright';

// Living-realism screenshots: fresh page per shot, 800x500 (SwiftShader-safe).
// Usage: node shots-real.mjs <shot-dir> [pond|npc|ice|grass|both...] (default: all)
const dir = process.argv[2] || '/home/user/EverWood/tests';
const only = (process.argv[3] || 'all').split(',');
async function shot(b, name, setup) {
  if (!only.includes('all') && !only.includes(name)) return;
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  await p.goto('http://127.0.0.1:8000/?test=1', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(
    () => window.__booted && window.forestDiagnostics && window.forestDiagnostics().texturesReady,
    null, { timeout: 240000 });
  await p.evaluate(() => { simTest.start(); simTest.day(); });
  await p.evaluate(setup);
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `${dir}/shot-${name}.png`, timeout: 120000 });
  console.log('SHOT', name);
  await p.close();
}
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--no-sandbox'] });
await shot(b, 'pond', () => {
  simTest.setCamera(45 + 15, simTest.sampleHeight(45 + 15, 60 + 7) + 2.4, 60 + 7);
  simTest.cameraLook(45, 0.4, 60);
});
await shot(b, 'npc', () => {
  simTest.nearGardener();
  const p = window.forestDiagnostics().position;
  simTest.cameraLook(p[0], p[1] - 0.35, p[2] - 1);
});
await shot(b, 'ice', () => {
  simTest.setSeason(3); simTest.climateStep(1);
  simTest.setCamera(45 + 15, simTest.sampleHeight(45 + 15, 60 + 7) + 2.4, 60 + 7);
  simTest.cameraLook(45, 0.4, 60);
});
await shot(b, 'rabbit', () => {
  const r = simTest.rabbitSpot().pos;
  simTest.setCamera(r[0] + 2.2, r[1] + 1.1, r[2] + 2.2);
  simTest.cameraLook(r[0], r[1] + 0.25, r[2]);
});
await shot(b, 'grass', () => {
  simTest.setCamera(45, simTest.sampleHeight(45, 86) + 2.2, 86);
  simTest.cameraLook(45, simTest.sampleHeight(45, 60) + 1, 60);
});
await b.close();
console.log('SHOTS_DONE');
