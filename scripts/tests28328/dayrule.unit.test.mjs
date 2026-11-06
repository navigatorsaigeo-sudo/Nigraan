/* v91.17.283.28 . S2 · ONE RULE "HOUR-ENDING INTERVAL -> PKT DAY" FOR RAIN AND SNOW, offline:
     D1  pktday.mjs: the value stamped 00:00 PKT belongs to the day before; 01:00 to the day; windows 00-03 hold the values stamped 01, 02, 03
     D2  the place record's day rain and snow (pointstate.mjs) == the sum of the day's eight 3-hour windows (pool.mjs pktWin, the strip's
         windows), for every complete day; the day 7 of the record is complete (8 days asked)
     D3  a served answer's day total (verification.mjs correctLocation) is re-made from its hours by the same rule; the provider's own total is
         kept as *_provider; a day the hours do not cover in full keeps the provider's total and is named partial
     D4  no module groups hour-ending amounts by the stamp's own date any more (the old copies are gone)
   usage: node scripts/tests28328/dayrule.unit.test.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 500) : '')); } };
const K = await import(pathToFileURL(join(API, 'pktday.mjs')).href);
ok(K.hourEndingDay('2026-10-28T00:00') === '2026-10-27' && K.hourEndingDay('2026-10-28T01:00') === '2026-10-28' && K.hourEndingWindow('2026-10-28T03:00') === '2026-10-28T00:00' && K.hourEndingWindow('2026-10-28T04:00') === '2026-10-28T03:00'
  && K.hourEndingDay('2026-10-27T19:00', { utc: true }) === '2026-10-27' && K.hourEndingDay('2026-10-27T20:00', { utc: true }) === '2026-10-28', 'D1 the rule on PKT and UTC stamps');
/* D2: a record whose rain is 1 mm at every hour stamped 00:00 (so the stamp-date rule and the hour-ending rule differ) plus a ramp */
const PS = await import(pathToFileURL(join(API, 'pointstate.mjs')).href);
const T0 = Date.parse('2026-10-28T00:00:00Z'); let asked = null;
const mk = (q) => { const nd = Number(new URLSearchParams(q).get('forecast_days')); asked = nd; const n = nd * 24; const time = [], pr = [], sn = [], tt = [];
  for (let i = 0; i < n; i++) { const t = new Date(T0 + i * 3600e3).toISOString().slice(0, 16); time.push(t); const h = (i % 24); pr.push(h === 0 ? 1 : Math.round((i % 7) * 0.3 * 10) / 10); sn.push(h === 3 ? 0.4 : 0); tt.push(20); }
  return { hourly: { time, temperature_2m: tt, precipitation: pr, snowfall: sn } }; };
const app = { places: { pointRow: () => ({ administered: true, elevM: 500 }) } };
const S = PS.createPointState(app, { now: () => Date.parse('2026-10-28T05:00:00Z'), dataDir: join(ROOT, 'data'), fetchPx: async (q) => [mk(q)] });
const r = await S.state(31.5, 74.3, { noBuild: true });
const L = mk('forecast_days=' + asked).hourly; const POOL = readFileSync(join(API, 'pool.mjs'), 'utf8');
ok(/const pktWin = \(utc\) => hourEndingWindow\(utc, \{ utc: true \}\)/.test(POOL), 'D2a the strip windows (pool.mjs pktWin) are the one rule');
const win = new Map(); L.time.forEach((t, i) => { const w = K.hourEndingWindow(t); const e = win.get(w) || { r: 0, s: 0, n: 0 }; e.r += L.precipitation[i]; e.s += L.snowfall[i]; e.n++; win.set(w, e); });
const bad = []; for (const d of r.days) { const ws = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => win.get(d.date + 'T' + String(h).padStart(2, '0') + ':00')); if (ws.some((w) => !w || w.n !== 3)) { bad.push([d.date, 'windows']); continue; }
  const rs = Math.round(ws.reduce((a, w) => a + w.r, 0) * 10) / 10, ss = Math.round(ws.reduce((a, w) => a + w.s, 0) * 10) / 10; if (d.rainMm !== rs || d.snowCm !== ss) bad.push([d.date, d.rainMm, rs, d.snowCm, ss]); }
ok(r.ok && r.days.length === 7 && !bad.length, 'D2b every day total of the record == the sum of its eight 3-hour windows (7 days)', { n: r.days.length, bad });
ok(asked === 8 && r.days[6] && r.days[6].rainMm != null, 'D2c day 7 is complete (the record asks 8 days)', [asked, r.days[6]]);
/* D3: verification's served answer */
const PD = readFileSync(join(API, 'verification.mjs'), 'utf8');
ok(/Dd0\[dv \+ '_provider'\] = Dd0\[dv\]\.slice\(\)/.test(PD) && /labelDayEnding\(t\)/.test(PD) && /loc\.agn_daybasis = \{ rule: HOUR_ENDING_RULE/.test(PD), 'D3 the served answer\'s day totals are re-made by the rule (provider kept, partial days named)');
/* D4: the old copies */
const files = ['pool.mjs', 'rainchance.mjs', 'archive.mjs', 'pointstate.mjs'].map((f) => [f, readFileSync(join(API, f), 'utf8')]);
const old = files.filter(([f, s]) => (f === 'pool.mjs' && /Date\.parse\(t \+ 'Z'\) \+ 5 \* 3600e3\)\.toISOString\(\)\.slice\(0, 10\); \(dayIdx/.test(s)) || (f === 'pool.mjs' && /Date\.parse\(utc \+ 'Z'\) \+ 5 \* 3600e3 - 3600e3/.test(s))
  || (f === 'rainchance.mjs' && /const d = pktDay\(ms\); const e = by/.test(s)) || (f === 'pointstate.mjs' && /nums\('rainMm'\)\.reduce/.test(s)) || (f === 'archive.mjs' && /const d = pktDay\(ms\); \(byDay/.test(s))).map(([f]) => f);
ok(!old.length, 'D4 no stamp-date grouping of amounts left', old);
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
