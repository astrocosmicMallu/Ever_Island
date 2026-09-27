import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
await page.goto('http://127.0.0.1:8000/?test=1', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__booted === true && window.forestDiagnostics?.()?.texturesReady, null, { timeout: 240000 });
await page.evaluate(() => {
  const t = window.simTest; t.start(); t.day(); t.svpos();
  const y = t.sampleHeight(102, 22);
  t.setCamera(102, y + 1.7, 22);
  t.cameraLook(99, t.sampleHeight(99, 25) + 1.2, 25);
  document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));
  t.svgive('wood', 3); t.svgive('sharp_stone', 2);
});
await page.waitForTimeout(4000);
await page.evaluate(() => { window.simTest.pauseRender(true); window.simTest.finishFrame(); });
await page.waitForTimeout(500);
await page.screenshot({ path: '/home/user/EverWood/tests/shot-surv.png' });
await browser.close();
