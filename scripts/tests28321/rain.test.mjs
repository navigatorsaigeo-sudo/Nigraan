import * as __T from '../lib/testenv.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
/* v91.17.283.21 · RAIN IN 3-HOUR WINDOWS (owner, 26 Oct 2026). Against a running server (argv[2]) and the code itself:
     W1  rainWindows (server/api/pool.mjs) on made-up members: a window's chance is the equal-system share of members whose WINDOW SUM
         reaches tau (a direct count), never a combination of hourly chances; a window the members do not cover in full takes the
         screening value (share of the deterministic models, one vote per family) and says so; a window neither covers is null
     W2  the server: for three points the bundle's windows3h equals a direct count over the ensemble members the server reads (the same
         provider request through /px), at the same tau; the windows are 3-hour PKT windows
     W3  the place record's day rain equals the sum of its hours ending 01:00-24:00 PKT (v283.28 one day rule) (the strip's day header and its windows add up to it)
     W4  no hour-exact rain wording in the pages (rain timing is said as the 3-hour window)
   usage: node scripts/tests28321/rain.test.mjs [http://127.0.0.1:8787] */
const BASE = __T.BASE, ROOT = __T.ROOT;
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 900) : '')); } };
const { createPool } = await import(new URL('file://' + join(ROOT, 'server', 'api', 'pool.mjs')).href);
const P = createPool(null);
/* W1 · made-up members: the 3 hours of one window (values stamped 05, 06, 07 UTC = 10, 11, 12 PKT: the rain of 09-12 PKT, v283.23) and one more
   hour (08 UTC = 13 PKT, a window not covered in full) */
{
  const time = ['2026-10-26T05:00', '2026-10-26T06:00', '2026-10-26T07:00', '2026-10-26T08:00'];
  /* system A, 3 members: each wet in a DIFFERENT hour (0.6 mm each); member 3 dry. Hourly chance at tau 0.5 is 1/3 in each hour, so a
     max would say 0.33 and independent hours 1-(2/3)^3 = 0.70; the window sums are 0.6, 0.6, 0.6 -> 3 of 3 at tau 0.5, 0 of 3 at tau 1 */
  const A = [[0.6, 0, 0, 0], [0, 0.6, 0, 0], [0, 0, 0.6, 0]];
  const B = [[0.2, 0.2, 0.2, 0], [0, 0, 0, 0]];   /* system B, 2 members: sum 0.6 and 0 */
  const PE = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const sysH = { a: { time, members: A }, b: { time, members: B } };
  const det = { time, models: [{ model: 'ecmwf_ifs025', x: [0, 0, 0, 0.7] }, { model: 'gfs_seamless', x: [0, 0, 0, 0] }] };
  const r = P.rainWindows(PE, sysH, time, { ok: true, tauMm: 0.5 }, det);
  const w = r.windows.find((x) => x.start === '2026-10-26T09:00');
  /* direct count, equal system weight: A 3/3 = 1, B 1/2 = 0.5 -> (1 + 0.5) / 2 = 0.75 */
  ok(r.ok && w && w.basis === 'members' && Math.abs(w.pRain - 0.75) < 1e-9 && w.members === 5, 'W1 the window chance is the equal-system share of members whose window sum reaches tau (0.75; hourly max would be 0.33)', JSON.stringify(w));
  const r1 = P.rainWindows(PE, sysH, time, { ok: true, tauMm: 1 }, det); const w1 = r1.windows.find((x) => x.start === '2026-10-26T09:00');
  ok(w1 && w1.pRain === 0, 'W1 no member reaches 1 mm in the window: 0', JSON.stringify(w1));
  const w2 = r.windows.find((x) => x.start === '2026-10-26T12:00');
  ok(w2 && w2.pRain == null && w2.why, 'W1 a window covered by one hour only is null with the reason (members and models alike)', JSON.stringify(w2));
  /* screening: no member series, the models cover the window in full */
  const r2 = P.rainWindows(PE, {}, [], { ok: true, tauMm: 0.5 }, { time: time.slice(0, 3), models: [{ model: 'ecmwf_ifs025', x: [0.3, 0.3, 0] }, { model: 'ecmwf_aifs025_single', x: [0, 0, 0] }, { model: 'gfs_seamless', x: [0, 0, 0] }] });
  const w3 = r2.windows.find((x) => x.start === '2026-10-26T09:00');
  /* families: ecmwf (2 models, 1 wet) 0.5 * 0.5 = 0.25, noaa (1 model, dry) 0 -> 0.25 */
  ok(w3 && w3.screening === true && w3.basis === 'screening' && Math.abs(w3.pRain - 0.25) < 1e-9, 'W1 without members the window takes the screening value (share of the models, one vote per family: 0.25) and is labelled screening', JSON.stringify(w3));
  const r3 = P.rainWindows(PE, sysH, time, { ok: false, why: 'no calibration' }, det);
  ok(r3.ok === false && !r3.windows.length && /calibration/.test(r3.why), 'W1 without the chance-of-rain threshold no window chance is served', JSON.stringify(r3).slice(0, 200));
  ok(P.pktWin('2026-10-26T20:00') === '2026-10-27T00:00' && P.pktWin('2026-10-26T22:00') === '2026-10-27T00:00' && P.pktWin('2026-10-26T23:00') === '2026-10-27T03:00' && P.pktWin('2026-10-26T19:00') === '2026-10-26T21:00', 'W1 3-hour PKT windows: a value stamped hh is the hour before (20-22 UTC stamps = 00-03 PKT next day; v283.23)');
}
/* W2 · the server */
const J = async (u, h) => { const r = await fetch(BASE + u, { headers: h || {} }); return r.ok ? r.json() : null; };
for (const [la, lo] of [[33.69182, 73.00668], [31.5204, 74.3587], [35.9208, 74.3083]]) {
  const B = await J('/api/point?lat=' + la + '&lon=' + lo + '&complete=1');
  const ph = B && B.parts && B.parts.poolHazard, W = ph && ph.v && ph.v.windows3h;
  if (!W || !W.ok) { ok(false, 'W2 ' + la + ',' + lo + ': the bundle carries windows3h', JSON.stringify(ph && ph.v ? ph.v.windows3h : ph).slice(0, 300)); continue; }
  const q = new URLSearchParams({ latitude: la.toFixed(4), longitude: lo.toFixed(4), timezone: 'UTC', forecast_days: '4', models: 'ecmwf_ifs025', hourly: 'precipitation', __omhost: 'ensemble-api.open-meteo.com' });
  const E = await J('/px/v1/ensemble?' + q.toString(), { 'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': 'pool' });
  const H = E && E.hourly || {}, T = H.time || [], M = Object.keys(H).filter((k) => k.startsWith('precipitation')).map((k) => H[k]);
  const idx = {}; T.forEach((t, i) => { const d = new Date(Date.parse(t + 'Z') + 5 * 3600e3 - 3600e3); const h = d.getUTCHours(); const k = d.toISOString().slice(0, 11) + String(h - (h % 3)).padStart(2, '0') + ':00'; (idx[k] = idx[k] || []).push(i); });
  const bad = []; let n = 0;
  for (const w of W.windows.filter((x) => x.basis === 'members')) { const ii = idx[w.start]; if (!ii || ii.length !== 3) { bad.push(w.start + ' not 3 hours'); continue; }
    const sums = M.map((m) => ii.every((i) => m[i] != null) ? ii.reduce((a, i) => a + m[i], 0) : null).filter((x) => x != null);
    const p = Math.round(1000 * sums.filter((x) => x >= W.tauMm).length / sums.length) / 1000; n++;
    if (Math.abs(p - w.pRain) > 0.0011 || sums.length !== w.members) bad.push(w.start + ' ' + p + ' vs ' + w.pRain + ' (' + sums.length + '/' + w.members + ')'); }
  ok(n >= 20 && !bad.length && W.windows.every((w) => /T(00|03|06|09|12|15|18|21):00$/.test(w.start)), 'W2 ' + la + ',' + lo + ': ' + n + ' window chances equal a direct count over ' + M.length + ' members at tau ' + W.tauMm + ' mm', bad.slice(0, 4).join(', '));
  /* W3 */
  const hd = (h) => new Date(Date.parse(String(h.time).slice(0, 16) + 'Z') - 3600e3).toISOString().slice(0, 10);   /* v91.17.283.28 S2: hour-ending day (01:00-24:00 PKT) */
  const dd = (B.days || []).filter((d) => (B.hours || []).filter((h) => hd(h) === d.date).length === 24).map((d) => { const s = (B.hours || []).filter((h) => hd(h) === d.date).reduce((a, h) => a + (+h.rainMm || 0), 0); return Math.abs(Math.round(10 * s) / 10 - d.rainMm) <= 0.11 ? null : d.date + ' ' + d.rainMm + ' vs ' + s; }).filter(Boolean);
  ok(!dd.length, 'W3 ' + la + ',' + lo + ': the day rain of the record is the sum of its hours', dd.join(', '));
}
/* W4 · wording */
const pages = ['NIGRAAN_START.html', 'AI_GEO_NIGRAAN_v91_17_MACH.html', 'NIGRAAN_3.html'].map((f) => [f, readFileSync(join(ROOT, 'artefact', f), 'utf8')]);
const RX = [/last wet hour/i, /(rain|wet|shower)[^'"`\n]{0,40}\b(at|until|from|by|around)\s*'\s*\+[^+\n]{1,40}\+\s*':00'/i, /(rain|shower)s? (likely |expected )?at [0-2]\d:00/i];
const hits = []; for (const [f, s] of pages) for (const r of RX) { const m = s.match(r); if (m) hits.push(f + ': ' + m[0].slice(0, 80)); }
ok(!hits.length, 'W4 no hour-exact rain wording in the pages', hits.join(' | '));
ok(/agnRainWindow/.test(pages[1][1]) && /last rain '\+sp\.lastWetWindow/.test(pages[1][1]), 'W4 the analyst says the last rain of the day as its 3-hour window');
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
