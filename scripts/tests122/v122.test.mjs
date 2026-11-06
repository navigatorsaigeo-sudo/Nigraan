import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.122 · one temperature per place (Overview, Current conditions, AI) and heat alert rule C. node nigraan-local/scripts/tests122/v122.test.mjs */
import { createRequire as __agnCR } from 'node:module'; import { pathToFileURL as __agnP2U } from 'node:url'; import { existsSync as __agnEx } from 'node:fs';
/* v91.17.255 · B-7 · Windows: Playwright from the app's node_modules, the bundled browser when the Linux one is absent, file URLs for absolute imports */
const __agnPW = __T.playwrightUrl() || 'playwright';
const __agnChrome = (p) => (p && __agnEx(p)) ? p : undefined;
const __agnImp = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? __agnP2U(String(p)).href : p);
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const { chromium } = __T.playwrightSync();
const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __agnChrome(__T.chromiumPath()) });
const pg = await br.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { try { const p = AGN.data.activePoint(); return p && p.lat != null && AGN.nowAt && AGN.nowAt.peek(p.lat, p.lon) && document.querySelector('#agnLive84 .t') && document.getElementById('agnCcNow122'); } catch (_) { return false; } }, null, { timeout: 300000, polling: 2000 }).catch(() => {});
await pg.waitForTimeout(5000);
const V = await pg.evaluate(() => { const p = AGN.data.activePoint(), v = AGN.nowAt.peek(p.lat, p.lon); const ov = document.querySelector('#agnLive84 .t'); const src = document.querySelector('#agnLive84 .src');
  return { p: [p.lat, p.lon, p.name], pe: v && v.tempC, ov: ov ? parseFloat(ov.textContent) : null, cc: parseFloat((document.getElementById('ccTemp') || {}).textContent), src: src ? src.textContent : '', note: (document.getElementById('agnCcNow122') || {}).textContent }; });
ok(V.pe != null && Math.abs(V.ov - V.pe) < 0.05 && Math.abs(V.cc - V.pe) < 0.05, 'Overview and Current conditions print the same corrected value as the point engine', JSON.stringify(V));
ok(/measured at MACH|no MACH station/.test(V.src) && /corrected for this place/.test(V.src), 'a station reading is labelled as a measurement at its own spot', V.src);
const AI = await (await fetch(BASE + '/api/ai/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'temperature in ' + String(V.p[2] || 'Islamabad').split(/[\/·,]/)[0].trim() + ' now', context: { location: V.p[2], point: { lat: V.p[0], lon: V.p[1] } } }) })).json().catch(e => ({ e: e.message }));
const txt = JSON.stringify(AI); const m = txt.match(/now: ([\d.]+) °C/);
ok(m && Math.abs(+m[1] - V.pe) < 0.05, 'the AI says the same "now" (' + (m && m[1]) + ' against ' + V.pe + ')', txt.slice(0, 400));
const H = await pg.evaluate(() => { const rule = AGN.heatAlertRule; const rows = (typeof activeAlerts === 'function' ? activeAlerts() : []).filter(r => (r.holders || [{ hazard: r.hazard }]).some(h => h.hazard === 'heat'));
  return { rule: rule && rule.rule, n: rows.length, bad: rows.map(r => ({ n: r.name, t: rule.test(r.name) })).filter(x => !x.t.ok).slice(0, 3) }; });
ok(H.rule === 'C' && H.bad.length === 0, 'heat alerts follow rule C: every heat alert is above its place\'s 95th percentile (' + H.n + ' heat alerts now)', JSON.stringify(H));
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v122: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
