/* v91.17.266 · interface 1 · GET /api/report/past30 on a synthetic archive (server/api/past30.mjs): the day high and low of the nearest
   checked MACH station within the screen rule with a complete day (>= DAY_MIN_HOURS hours), the tehsil's satellite rain (Pakistan-day
   file first), the normals, the issued levels above Normal, the station list within 25 km, ok:false with a plain reason.
   Part C (v91.17.267) adds a synthetic MACH observation record (mach_db_YYYY-MM.csv): a complete record day wins over the fleet
   archive's day, the record fills a day the archive lacks, a station only in the record is placed from its stations.json, an
   incomplete record day falls back to the fleet archive, and source 'qm', Apple-provider, copied and unusable readings are left out.
   Part B asks the running server (optional): node scripts/tests266/past30.test.mjs [baseUrl] */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); const BASE = process.argv[2] || null;
const { createPast30 } = await import(join(ROOT, 'server/api/past30.mjs'));
const { DAY_MIN_HOURS } = await import(join(ROOT, 'server/api/archive.mjs'));
const { buildUnitIndex } = await import(join(ROOT, 'server/api/national.mjs'));
const { unitAtPoint } = await import(join(ROOT, 'server/api/unitresolve.mjs'));
const { pktDay } = await import(join(ROOT, 'server/api/pktday.mjs'));
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d != null ? ' · ' + String(d).slice(0, 300) : '')); };
const RULE = JSON.parse(readFileSync(join(ROOT, 'data', 'mach-siting.json'), 'utf8')).rule;
const units = buildUnitIndex(JSON.parse(readFileSync(join(ROOT, 'server/contract/units.json'), 'utf8')), null);
const LAT = 33.6844, LON = 73.0479;
const appU = { dataDir: join(ROOT, 'data'), units }; const U = unitAtPoint(appU, LAT, LON).unit; const uid = U.unitId;
const tmp = mkdtempSync(join(tmpdir(), 'v266-p30-')); const D = join(tmp, 'data');
for (const d of ['archive/fleet', 'archive/imerg', 'archive/engine', 'archive/shown', 'imerg/pkt']) mkdirSync(join(D, d), { recursive: true });
copyFileSync(join(ROOT, 'data', 'hazard-scale.json'), join(D, 'hazard-scale.json'));
const add = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const to = add(pktDay(Date.now()), -1), d1 = add(to, -2), d2 = add(to, -1), d3 = to;
/* S1 2.9 km (checked), S2 4 km (bad siting), S3 20 km (checked, beyond the 15 km screen radius), S4 30 km (not listed) */
const ST = { S1: [33.66, 73.03], S2: [33.70, 73.08], S3: [33.86, 73.05], S4: [33.95, 73.05] };
const row = (k, d, hrs, base) => ({ d, k, lat: ST[k][0], lon: ST[k][1], el: 520, n: hrs.length, t: hrs.map((h) => h * 60), T: hrs.map((h) => Math.round((base + 6 * Math.sin((h - 9) / 24 * 2 * Math.PI)) * 10)), ok: hrs.map(() => 1), q: hrs.map(() => '') });
const H24 = Array.from({ length: 24 }, (_, i) => i), H10 = Array.from({ length: 10 }, (_, i) => i);
const fleet = [row('S1', d1, H24, 25), row('S1', d2, H10, 30), row('S1', d3, H24, 22), row('S2', d1, H24, 35), row('S3', d1, H24, 20), row('S3', d2, H24, 21), row('S4', d1, H24, 18)];
writeFileSync(join(D, 'archive/fleet', 'fleet_' + to.slice(0, 7) + '.jsonl.gz'), gzipSync(fleet.map((r) => JSON.stringify(r)).join('\n') + '\n'));
if (d1.slice(0, 7) !== to.slice(0, 7)) writeFileSync(join(D, 'archive/fleet', 'fleet_' + d1.slice(0, 7) + '.jsonl.gz'), gzipSync(fleet.filter((r) => r.d.slice(0, 7) === d1.slice(0, 7)).map((r) => JSON.stringify(r)).join('\n') + '\n'));
const im = [{ d: d1, u: { [uid]: 52 } }, { d: d2, u: { [uid]: 0 } }];
for (const m of new Set([d1.slice(0, 7), d2.slice(0, 7)])) writeFileSync(join(D, 'archive/imerg', 'imerg_' + m + '.jsonl.gz'), gzipSync(im.filter((r) => r.d.slice(0, 7) === m).map((r) => JSON.stringify(r)).join('\n') + '\n'));
writeFileSync(join(D, 'imerg/pkt', d2 + '.json'), JSON.stringify({ date: d2, units: { [uid]: 12.5 } }));   /* the Pakistan-day file wins over the archive's 0 */
writeFileSync(join(D, 'archive/engine', 'engine_' + d3.slice(0, 7) + '.jsonl.gz'), gzipSync(JSON.stringify({ at: d3 + 'T03:00:00Z', days: [{ day: 0, date: d3, layers: { heat: { [uid]: 2 }, rain_hz: { [uid]: 0 }, nss_baseline: { [uid]: 3 } } }, { day: 1, date: add(d3, 1), layers: { heat: { [uid]: 4 } } }] }) + '\n'));
const verdict = { S1: { verdict: 'trusted', trusted: true }, S2: { verdict: 'bad siting', trusted: false }, S3: { verdict: 'trusted', trusted: true }, S4: { verdict: 'trusted', trusted: true } };
const app = { dataDir: join(ROOT, 'data'), units, fleet: { screenRule: () => RULE, stations: () => Object.keys(ST).map((k) => ({ key: k, name: 'Station ' + k })), screen: (k) => verdict[k], elevOf: () => 520 },
  climatology: { normals: () => ({ tm: 20, pr: 2 }) } };
const P = createPast30(app, D);
const r = await P.at({ lat: LAT, lon: LON, days: 3 });
ok(r.ok === true && r.from === d1 && r.to === d3 && r.days === 3 && r.daily.length === 3, 'A the window is the last 3 complete Pakistan days', JSON.stringify({ from: r.from, to: r.to }));
const by = Object.fromEntries(r.daily.map((x) => [x.date, x]));
ok(by[d1].tmaxC === 31 && by[d1].tminC === 19 && /Station S1/.test(by[d1].src), 'A day 1: S1 (nearest checked, complete day)', JSON.stringify(by[d1]));
ok(by[d2].tmaxC == null && by[d2].tminC == null, 'A day 2: S1 has ' + H10.length + ' hours (< ' + DAY_MIN_HOURS + '), S3 is beyond the screen radius: no high or low', JSON.stringify(by[d2]));
ok(by[d1].rainMm === 5.2 && by[d2].rainMm === 12.5 && by[d3].rainMm == null, 'A rain: archive tenths -> mm; the Pakistan-day file wins; a missing day is null', JSON.stringify(r.daily.map((x) => x.rainMm)));
ok(r.summary.tmaxC === 31 && r.summary.tmaxDate === d1 && r.summary.tminC === 16 && r.summary.tminDate === d3, 'A summary extremes', JSON.stringify(r.summary));
ok(r.summary.rainMm === 17.7 && r.summary.wetDays === 2 && r.summary.wettestDate === d2 && r.summary.wettestMm === 12.5, 'A summary rain, wet days (>= 1 mm), wettest day', JSON.stringify(r.summary));
ok(r.summary.rainNormalMm === 4 && r.summary.tmeanAnomC === 3.5, 'A normals: rain normal over the rain days, mean anomaly over the temperature days', JSON.stringify(r.summary));
ok(r.levels.length === 1 && r.levels[0].date === d3 && r.levels[0].hazard === 'Heat stress' && r.levels[0].level === 'Moderate', 'A levels: day 0 only, above Normal only, reference layers left out', JSON.stringify(r.levels));
ok(r.stations.map((s) => s.name).join() === 'Station S1,Station S3' && r.stations[0].days === 2 && r.stations[1].days === 2 && r.stations.every((s) => s.rainMm === null), 'A stations within 25 km, the rejected one left out, complete days counted', JSON.stringify(r.stations));
ok(r.sources.length >= 2 && !r.sources.some((s) => /PMD|FFD|IMERG|NASA/.test(s)), 'A client-safe source labels', JSON.stringify(r.sources));
const bad = await P.at({ lat: 51.5, lon: -0.1 }); ok(bad.ok === false && /not a valid point/.test(bad.reason), 'A a point outside Pakistan: ok:false with a plain reason', JSON.stringify(bad));
const empty = await createPast30({ ...app, fleet: null }, join(tmp, 'nothing')).at({ lat: 27.0, lon: 62.5 }); ok(empty.ok === false && /holds no observed record/.test(empty.reason), 'A no record at all: ok:false', JSON.stringify(empty));
/* ── C · the MACH observation record (v91.17.267) ── */
{
  const DB = join(tmp, 'db'); mkdirSync(DB, { recursive: true });
  const HEAD = 'time,station_key,source,temperature_c,dew_point_c,humidity_pct,wind_dir_deg,wind_dir_text,wind_speed_kmh,wind_gust_kmh,pressure_hpa,uv_index,solar_wm2,precip_rate_mmhr,precip_total_mm,provider';
  const files = new Map();
  /* one reading at PKT day d, hour h, minute m; the file is the reading's UTC month, like the sync writes it */
  const put = (k, d, h, m, T, o = {}) => { const ms = Date.parse(d + 'T00:00:00Z') + (h * 60 + m) * 60e3 - 5 * 3600e3; const iso = new Date(ms).toISOString().slice(0, 19) + 'Z';
    const line = [iso, k, o.source || 'sheet_import', T.toFixed(1), o.td ?? '', o.rh ?? 55, '', '', '', '', o.p ?? 952.0, '', '', 0, o.rain ?? 0, o.provider || 'wu'].join(',');
    const f = 'mach_db_' + iso.slice(0, 7) + '.csv'; (files.get(f) || files.set(f, []).get(f)).push(line); };
  const day = (k, d, hrs, base) => { for (const h of hrs) for (const m of [0, 30]) put(k, d, h, m, base + 6 * Math.sin((h - 9) / 24 * 2 * Math.PI), { p: 950 + h / 10 + (k === 'S5' ? 1 : 0) }); };
  const H15 = Array.from({ length: 15 }, (_, i) => i);
  day('S1', d1, H24, 27);                      /* complete: 33 / 21 beats the fleet archive's 31 / 19 */
  day('S1', d2, H24, 28);                      /* the fleet archive holds only 10 hours of this day */
  day('S5', d2, H24, 24);                      /* S5 is only in the record, 2.1 km away, placed from stations.json: 30 / 18 */
  day('S5', d3, H15, 40);                      /* 15 hours: incomplete, so d3 keeps S1's fleet archive day (28 / 16) */
  put('S1', d1, 14, 10, 45, { source: 'qm' });                              /* source qm: left out */
  put('S1', d1, 14, 20, 44, { provider: 'apple_qm' });                      /* Apple provider: left out */
  put('S1', d1, 14, 40, 38, { td: 33, rh: '' });                            /* dew point above 32 C: the history screen drops it */
  put('S1', d1, 13, 5, 40, { rh: 20, p: 950.0 }); put('S3', d1, 13, 15, 40, { rh: 20, p: 950.0 });   /* one reading on two stations in one hour: both left out */
  for (const [f, L] of files) writeFileSync(join(DB, f), HEAD + '\r\n' + L.join('\r\n') + '\r\n');
  writeFileSync(join(DB, 'stations.json'), JSON.stringify({ read: 'test', stations: [{ station_key: 'S5', lat: 33.70, lng: 73.06 }] }));
  const vC = { ...verdict, S5: { verdict: 'trusted', trusted: true } };
  const appC = { ...app, fleet: { ...app.fleet, stations: () => [...Object.keys(ST), 'S5'].map((k) => ({ key: k, name: 'Station ' + k })), screen: (k) => vC[k] } };
  const c = await createPast30(appC, D, { dbDir: DB }).at({ lat: LAT, lon: LON, days: 3 });
  const cb = Object.fromEntries((c.daily || []).map((x) => [x.date, x]));
  ok(c.ok === true && cb[d1].tmaxC === 33 && cb[d1].tminC === 21 && /Station S1/.test(cb[d1].src), 'C day 1: the complete record day wins over the fleet archive; qm, Apple, copied and unusable readings left out', JSON.stringify(cb[d1]));
  ok(cb[d2].tmaxC === 30 && cb[d2].tminC === 18 && /Station S5 \(2\.1 km\)/.test(cb[d2].src), 'C day 2: the record fills the day; a record-only station is placed from stations.json', JSON.stringify(cb[d2]));
  ok(cb[d3].tmaxC === 28 && cb[d3].tminC === 16 && /Station S1/.test(cb[d3].src), 'C day 3: an incomplete record day (15 of 24 hours) falls back to the fleet archive', JSON.stringify(cb[d3]));
  ok(c.summary.tmaxC === 33 && c.summary.tmaxDate === d1 && c.summary.tminC === 16 && c.summary.tminDate === d3 && c.summary.tempDays === 3, 'C summary over the three days', JSON.stringify(c.summary));
  ok(c.stations.map((x) => x.name + ':' + x.days).join() === 'Station S5:1,Station S1:3,Station S3:2' && c.stations.every((x) => x.rainMm === null), 'C stations: S5 1 complete day, S1 3, S3 2 (its copied reading left out); station rain null', JSON.stringify(c.stations));
  ok(c.notes.some((x) => /2 of the 3 days from the MACH observation record, 1 from the live station feed/.test(x)) && c.notes.some((x) => /running rain total/.test(x)), 'C notes: record and fallback days counted; why station rain is not shown', JSON.stringify(c.notes));
  ok(c.daily.map((x) => x.rainMm).join() === r.daily.map((x) => x.rainMm).join(), 'C rain stays the satellite tehsil total', JSON.stringify(c.daily.map((x) => x.rainMm)));
}
rmSync(tmp, { recursive: true, force: true });
if (BASE) {
  const j = await (await fetch(BASE + '/api/report/past30?lat=' + LAT + '&lon=' + LON, { headers: { 'x-agn-view': 'customer' } })).json();
  ok(j.ok === true && j.days === 30 && Array.isArray(j.daily) && j.daily.length === 30 && j.summary && Array.isArray(j.levels) && Array.isArray(j.stations) && Array.isArray(j.sources) && Array.isArray(j.notes), 'B the served route answers interface 1 (customer view)', JSON.stringify(Object.keys(j)));
  ok(!/PMD|FFD/.test(JSON.stringify(j)), 'B no PMD or FFD in the customer body');
  const e = await (await fetch(BASE + '/api/report/past30?lat=x&lon=73')).json(); ok(e.ok === false && typeof e.reason === 'string', 'B a bad point answers ok:false with a reason', JSON.stringify(e));
}
console.log(`\n${fail ? 'FAIL' : 'PASS'} past30: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
