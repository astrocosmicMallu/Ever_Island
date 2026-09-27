import { chromium } from 'playwright';

// Wildlife screenshots: fresh page per shot (SwiftShader compositor freezes on reuse).
// Usage: node shots-wild.mjs <shot-dir>
const dir = process.argv[2] || '/home/user/EverWood/tests';
async function shot(b, name, setup) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('http://127.0.0.1:8000/?test=1', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(
    () => window.__booted && window.forestDiagnostics && window.forestDiagnostics().texturesReady,
    null, { timeout: 240000 });
  await p.evaluate(() => { simTest.start(); simTest.day(); });
  await p.waitForFunction(
    () => window.forestDiagnostics().wildlife.deerLoaded === true,
    null, { timeout: 240000 });
  await p.evaluate(setup);
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `${dir}/shot-${name}.png`, timeout: 120000 });
  console.log('SHOT', name);
  await p.close();
}
const only = process.argv[3] || 'both';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--no-sandbox'] });
if (only !== 'forage') await shot(b, 'deer', () => {
  const d = simTest.deerSpot ? simTest.deerSpot() : null;
  const dx = d ? d.pos[0] : 20, dz = d ? d.pos[2] : 80;
  simTest.setCamera(dx + 5.5, simTest.sampleHeight(dx + 5.5, dz + 5.5) + 2.2, dz + 5.5);
  simTest.cameraLook(dx, simTest.sampleHeight(dx, dz) + 1.2, dz);
});
if (only !== 'deer') await shot(b, 'forage', () => {
  const f = simTest.foragePoint();
  simTest.setCamera(f[0] + 2.2, f[1] + 1.6, f[2] + 2.2);
  simTest.cameraLook(f[0], f[1] + 0.3, f[2]);
});
await b.close();
console.log('SHOTS_DONE');
