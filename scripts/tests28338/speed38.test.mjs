/* v91.17.283.38 (NIGRAAN 1.0.2) · SPEED SUITE (owner's live findings of 30 Oct, items 1-5)
   S1  a place click (GET /api/point, the analyst page's request) is under 250 KB, and ?parts=hazardCount is a small answer (the filter works)
   S2  the parts left out (cmip6 ...) are served on demand from the same bundle with the same values (?parts=cmip6 == ?parts=all's cmip6)
   S3  one /analyst open asks the place once: at most 1 plain /api/point and at most 1 completion read of that place
   S4  the district batch (/api/point/batch?with=inputs) is not asked on an /analyst open (Overview); it is asked when Operations opens,
       and the server answers it from its kept answer the second time in ~1 s
   S5  tab switches (Operations, Forecast, Overview): the longest main-thread task, reported; target < 200 ms
   S6  cumulative layout shift of the open (target < 0.05), the shifting elements named
   S7  server stalls (event loop blocked) during the run, read from the server log when NIGRAAN_SERVER_LOG names it
   usage: node scripts/tests28338/speed38.test.mjs [base]   (env NIGRAAN_SERVER_LOG=<run>/nigraan-local/data/server.log; SPEED38_STRICT=1 fails S5/S6 on target) */
import { readFileSync, existsSync } from 'node:fs';
import { T, browser, BASE } from '../tests28328p/lib.mjs';
const { ok, done } = T(); const STRICT = process.env.SPEED38_STRICT === '1';
const LOG = process.env.NIGRAAN_SERVER_LOG || null; const stalls0 = (() => { try { return LOG && existsSync(LOG) ? (readFileSync(LOG, 'utf8').match(/ stall event loop blocked/g) || []).length : null; } catch (_) { return null; } })();
const P = [30.19570, 71.47530];
const get = async (u) => { const t = performance.now(); const r = await fetch(BASE + u); const b = Buffer.from(await r.arrayBuffer()); return { ms: Math.round(performance.now() - t), bytes: b.length, j: (() => { try { return JSON.parse(b.toString('utf8')); } catch (_) { return null; } })() }; };
/* S1 */
await get('/api/point?lat=' + P[0] + '&lon=' + P[1] + '&complete=1');
const a = await get('/api/point?lat=' + P[0] + '&lon=' + P[1] + '&complete=1'), h = await get('/api/point?lat=' + P[0] + '&lon=' + P[1] + '&parts=hazardCount');
console.log('INFO place click ' + a.bytes + ' bytes ' + a.ms + ' ms; parts=hazardCount ' + h.bytes + ' bytes');
ok(a.j && a.j.ok && a.bytes < 250 * 1024, 'S1 a place click answer is under 250 KB (' + Math.round(a.bytes / 1024) + ' KB)');
ok(h.j && h.j.ok && Object.keys(h.j.parts || {}).join() === 'hazardCount' && h.bytes < a.bytes / 2, 'S1 ?parts=hazardCount sends that part only (' + Math.round(h.bytes / 1024) + ' KB)');
/* S2 */
const all = await get('/api/point?lat=' + P[0] + '&lon=' + P[1] + '&parts=all&complete=1'), od = await get('/api/point?lat=' + P[0] + '&lon=' + P[1] + '&parts=cmip6&complete=1');
ok(Array.isArray(a.j.omitted) && a.j.omitted.includes('cmip6') && !('cmip6' in (a.j.parts || {})), 'S2 cmip6 is left out of the first answer and named in omitted[]');
ok(all.j && od.j && JSON.stringify(all.j.parts.cmip6) === JSON.stringify(od.j.parts.cmip6) && all.j.stamp === od.j.stamp, 'S2 ?parts=cmip6 gives the same cmip6 as ?parts=all (same bundle stamp)');
ok(all.j && Object.keys(all.j.parts).every((n) => n in a.j.parts || (a.j.omitted || []).includes(n)), 'S2 every part is either sent or named as omitted');
/* S3-S6 in the browser */
const br = await browser();
const ctx = await br.newContext({ viewport: { width: 1440, height: 731 } });
await ctx.addInitScript(() => { window.__LS = []; window.__LT = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__LS.push({ v: e.value, t: Math.round(e.startTime), src: (e.sources || []).map((s) => { const n = s.node; return n ? ((n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.split(' ')[0] : '') || n.nodeName) : '?'; }) }); }).observe({ type: 'layout-shift', buffered: true }); } catch (_) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__LT.push({ d: Math.round(e.duration), t: Math.round(e.startTime) }); }).observe({ type: 'longtask', buffered: true }); } catch (_) {} });
const pg = await ctx.newPage(); const req = []; const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
pg.on('request', (r) => { const u = r.url(); if (u.startsWith(BASE + '/api/point')) req.push({ u: u.replace(BASE, ''), t: Date.now() }); });
await pg.goto(BASE + '/analyst#agnplace=' + P[0].toFixed(5) + ',' + P[1].toFixed(5) + ',Multan', { waitUntil: 'load', timeout: 180000 });
await pg.waitForTimeout(25000);
const same = req.filter((r) => /^\/api\/point\?/.test(r.u) && r.u.includes('lat=' + P[0].toFixed(5)));
const plain = same.filter((r) => !/complete=1/.test(r.u) && !/parts=/.test(r.u)), comp = same.filter((r) => /complete=1/.test(r.u) && !/parts=/.test(r.u)), ond = same.filter((r) => /parts=/.test(r.u));
console.log('INFO place requests on open: ' + same.map((r) => r.u).join(' | '));
ok(plain.length === 1, 'S3 one /analyst open asks the place once (' + plain.length + ' plain reads)');
ok(comp.length <= 1, 'S3 at most one completion read of the place (' + comp.length + ')');
ok(ond.length <= 2, 'S3 parts read on demand at open: ' + ond.length + ' request(s) (coalesced)');
const db0 = req.filter((r) => /\/api\/point\/batch\?with=inputs/.test(r.u)).length;
ok(db0 === 0, 'S4 no district batch on an /analyst open (' + db0 + ')');
const cls = await pg.evaluate(() => { let s = 0; const by = {}; for (const e of window.__LS) { s += e.v; for (const n of e.src) by[n] = (by[n] || 0) + e.v; } return { cls: s, by: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ' ' + v.toFixed(3)) }; });
console.log('INFO CLS ' + cls.cls.toFixed(3) + ' :: ' + cls.by.join(', '));
(STRICT ? ok : (c, n, i) => ok(true, n + (c ? '' : ' [over target, reported]'), i))(cls.cls < 0.05, 'S6 layout shift of the open ' + cls.cls.toFixed(3) + ' (target < 0.05)');
const tabs = {}; for (const v of ['operations', 'livedata', 'overview']) { const n0 = await pg.evaluate(() => window.__LT.length); const t0 = Date.now();
  await pg.click('#machNav [data-goto="' + v + '"]').catch(() => {}); await pg.waitForTimeout(6000);
  tabs[v] = await pg.evaluate((n0) => { const L = window.__LT.slice(n0); return { max: L.reduce((a, b) => Math.max(a, b.d), 0), sum: L.reduce((a, b) => a + b.d, 0), n: L.length }; }, n0); }
console.log('INFO tab switches (longest task ms): ' + JSON.stringify(tabs));
for (const [v, x] of Object.entries(tabs)) (STRICT ? ok : (c, n, i) => ok(true, n + (c ? '' : ' [over target, reported]'), i))(x.max < 200, 'S5 ' + v + ': longest task ' + x.max + ' ms (target < 200)');
const db1 = req.filter((r) => /\/api\/point\/batch\?with=inputs/.test(r.u));
ok(db1.length >= 1, 'S4 the district batch is asked when a view that shows district rows opens (' + db1.length + ')');
if (db1.length) { const u = db1[0].u; const t1 = await get(u); const t2 = await get(u); console.log('INFO district batch ' + Math.round(t2.bytes / 1024) + ' KB: ' + t1.ms + ' ms then ' + t2.ms + ' ms'); ok(t2.j && t2.j.ok && t2.ms < 3000, 'S4 the kept district answer returns in ' + t2.ms + ' ms'); }
ok(errs.length === 0, 'no page errors', errs.join(' | '));
/* S8 (item 7) the place card's hyperlocal line: shown with the server's value where the live correction applies (the answer is given to the
   page here: the cloud test server polls no live station), absent where it does not */
for (const ap of [true, false]) { const c2 = await br.newContext({ viewport: { width: 1440, height: 731 } }); const p2 = await c2.newPage();
  await p2.route('**/api/hyperlocal/point**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ap ? { ok: true, applies: true, tempC: 25.4, stations: 3, nearestKm: 2.1, radiusKm: 40, hourUtc: '2026-10-31T09:00Z', cellM: 250 } : { ok: true, applies: false, radiusKm: 40, stations: 0 }) }));
  await p2.goto(BASE + '/analyst#agnplace=33.68440,73.04790,Islamabad', { waitUntil: 'load', timeout: 180000 }); await p2.waitForTimeout(20000);
  const t = await p2.evaluate(() => { const e = document.getElementById('agnHl38'); return e ? e.innerText : null; });
  ok(ap ? /25\.4 °C at your street, from 3 MACH stations within 40 km/.test(t || '') : t == null, 'S8 place card hyperlocal line ' + (ap ? 'shown where it applies' : 'absent where it does not'), t); await c2.close(); }
await br.close();
/* S7 */
if (stalls0 != null) { const s1 = (readFileSync(LOG, 'utf8').match(/ stall event loop blocked/g) || []).length; console.log('INFO server stalls during the run: ' + (s1 - stalls0)); ok(true, 'S7 server stalls during the run: ' + (s1 - stalls0) + ' (reported)'); }
done();
