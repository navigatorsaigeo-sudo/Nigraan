/* v91.17.283.28 · P20 · start page: a part the server still has not settled after the one completion read is shown as not available
   ("–"), never a "…" that waits for ever; "No active alerts" is never claimed on an alert list the server marks as made by another
   build (stampMismatch, the flag the console also refuses). usage: node scripts/tests28328p/p20.test.mjs [base] */
import { T, src, START, browser, open } from './lib.mjs';
const { ok, done } = T(); const S = src(START);
ok(/function settle\(B\)/.test(S) && /take\(d,B2,f2,true\)/.test(S), 'P20 static: the completion answer settles every still-pending part');
ok(/if\(J\.stampMismatch\)\{ pulseNote\('Alert list not current/.test(S), 'P20 static: the pulse reads the served stampMismatch flag');
const br = await browser();
/* the chance-of-rain part never settles: after the completion read the strip shows "–" with the reason, no "…" */
{ const o = await open(br, '/'); await o.pg.route(/\/api\/point\?/, async (route) => { const r = await route.fetch(); const j = await r.json(); if (j && j.parts) { j.parts.poolHazard = { pending: true }; j.pending = ['poolHazard']; } await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) }); });
  await o.pg.waitForTimeout(4000); await o.pg.click('#q'); await o.pg.keyboard.type('Lahore', { delay: 30 }); await o.pg.waitForSelector('#sr button[data-ac="0"]', { timeout: 30000 }); await o.pg.waitForTimeout(600);
  await o.pg.click('#sr button[data-ac="0"]'); await o.pg.waitForTimeout(15000);
  const r = await o.pg.evaluate(() => { const c = document.getElementById('hsChance'); const t = document.getElementById('h12Table'); return { strip: c ? c.innerText : null, tbl: t ? t.innerText : null }; });
  ok(r.strip != null && !/…/.test(r.strip) && !/…/.test(r.tbl || ''), 'P20 page: no "…" left once the completion read answered (the part is shown as not available)', JSON.stringify(r).slice(0, 300));
  ok(o.errs.length === 0, 'P20 no page error', o.errs.join(' | ')); await o.ctx.close(); }
/* the alert list made by another build */
{ const o = await open(br, '/', { init: () => {} }); await o.pg.route(/\/api\/alerts$/, async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ready: true, at: new Date().toISOString(), stale: false, build: '91.17.259', gate: 'gate-old', serverBuild: '91.17.283.28', stampMismatch: true, rows: [], days: [], ctx: { day: 0 } }) }); });
  await o.pg.reload({ waitUntil: 'load' }); await o.pg.waitForTimeout(12000);
  const p = await o.pg.evaluate(() => (document.getElementById('pulse') || {}).innerText || '');
  ok(/Alert list not current/.test(p) && !/No active alerts/.test(p), 'P20 page: an alert list from another build is not "No active alerts" ("' + p.replace(/\s+/g, ' ').slice(0, 90) + '")');
  await o.ctx.close(); }
await br.close(); done();
