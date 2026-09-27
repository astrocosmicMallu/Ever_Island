import { chromium } from 'playwright';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const logs = [];
  p.on('console', m => logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
  p.on('pageerror', e => logs.push(`[PAGEERROR] ${String(e && e.message || e).slice(0, 500)}`));
  p.on('requestfailed', r => logs.push(`[REQFAIL] ${r.url().slice(0, 160)} :: ${r.failure()?.errorText}`));
  await p.goto('http://127.0.0.1:8000/?test=1', { waitUntil: 'load' }).catch(e => logs.push('[GOTO] ' + e.message.slice(0, 200)));
  await p.waitForTimeout(45000);
  const state = await p.evaluate(() => ({
    booted: window.__booted,
    bootErrors: (window.__bootErrors || []).map(e => String(e && e.message || e).slice(0, 300)),
    hasDiag: typeof window.forestDiagnostics,
    wildlife: (() => { try { return window.forestDiagnostics ? window.forestDiagnostics().wildlife : 'no-diag'; } catch (e) { return 'diag-threw: ' + e.message; } })(),
  })).catch(e => ({ evalFail: e.message.slice(0, 200) }));
  console.log('STATE ' + JSON.stringify(state, null, 1));
  console.log('LOGS (' + logs.length + '):');
  logs.slice(0, 40).forEach(l => console.log('  ' + l));
  await b.close();
})().catch(e => { console.error('FATAL', e.message.slice(0, 300)); process.exit(1); });
