// v91.17.283.6 item 4 · W1 heavy rain day 3 for runs issued 00:00-04:59 PKT (base 19-23 UTC): the national run asks ONE more UTC day only at
// those base hours; the provider weight of every batch is unchanged (provider.mjs weightOf: 9 days < its 14-day unit), the request at every
// other hour is unchanged (forecast_days 5), the record (leads 0-72) is unchanged, and day 3 now has a calibrated rain chance; day 4 is
// still never served. NIGRAAN_W1_DAY3=0 restores the old request. Offline (in-memory store, mock provider), two frozen clocks.
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
if (!process.env.W1_AT) { let bad = 0; for (const [at, off] of [['2026-10-22T06:20:00Z', ''], ['2026-10-22T21:20:00Z', ''], ['2026-10-22T21:20:00Z', '0'], ['2026-10-22T18:40:00Z', '']]) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, W1_AT: at, NIGRAAN_W1_DAY3: off }, encoding: 'utf8' }); process.stdout.write('--- clock ' + at + (off === '0' ? ' (NIGRAAN_W1_DAY3=0)' : '') + '\n' + r.stdout + r.stderr); if (r.status) bad++; }
  process.exit(bad ? 1 : 0); }
if (process.env.NIGRAAN_W1_DAY3 === '') delete process.env.NIGRAAN_W1_DAY3;
process.env.NIGRAAN_AI = '0';
{ const T0 = Date.parse(process.env.W1_AT), R0 = Date.now(), RD = Date; class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(T0 + (RD.now() - R0)); } static now() { return T0 + (RD.now() - R0); } } globalThis.Date = FD; }
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + String(d).slice(0, 400) : '')); } };
const imp = (r) => import(pathToFileURL(join(APP, r)).href);
const N = await imp('server/api/national.mjs'), RC = await imp('server/api/rainchance.mjs'), PK = await imp('server/api/pktday.mjs'), PV = await imp('server/api/provider.mjs');
const C = {}; const store = { find: (c, f) => (C[c] || []).find(f), filter: (c, f) => (C[c] || []).filter(f), all: (c) => C[c] || [], insert: async (c, x) => { (C[c] = C[c] || []).push(x); },
  insertMany: async (c, xs) => { (C[c] = C[c] || []).push(...xs); }, save: async () => {}, removeWhere: async (c, f) => { const a = C[c] || []; const n = a.length; C[c] = a.filter((x) => !f(x)); return n - C[c].length; } };
const units = []; for (let i = 0; i < 420; i++) units.push({ unitId: 'P|D|T' + i, name: 'T' + i, district: 'D', province: 'Punjab', lat: 29 + (i % 30) * 0.1, lon: 70 + Math.floor(i / 30) * 0.1, elevM: 200 });
const calls = []; const H0 = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
/* the provider answers each hour of a run with one value whatever the window (as the d24 mock and the real provider do) */
const val = (v, t) => v === 'precipitation' ? ((Math.floor(t / 3600e3) % 7) === 0 ? 3 : 0.2) : v === 'relative_humidity_2m' ? 60 : 20;
const provider = { call: async (kind, path, P) => { calls.push({ fd: P.forecast_days, pd: P.past_days, n: P.latitude.length, w: PV.weightOf((k) => P[k] == null ? null : P[k]) });
  const n = (P.past_days + P.forecast_days) * 24, s0 = H0 - P.past_days * 864e5; const time = [], ms = []; for (let k = 0; k < n; k++) { ms.push(s0 + k * 3600e3); time.push(new Date(s0 + k * 3600e3).toISOString().slice(0, 16)); }
  return P.latitude.map((la, i) => { const h = { time }; for (const v of P.hourly) h[v] = ms.map((t) => val(v, t)); return { latitude: la, longitude: P.longitude[i], elevation: P.elevation[i], utc_offset_seconds: 0, timezone: 'GMT', hourly: h }; }); } };
const app = { store, provider, units: { tehsil: units }, audit: { record: async () => {} }, raiseAlert: async () => {}, alerts: null, dataDir: join(APP, 'data') };
const run = await N.runNationalIngest(app, { unit_level: 'tehsil', variables: ['temperature_2m', 'relative_humidity_2m', 'precipitation', 'snowfall', 'wind_speed_10m', 'wind_gusts_10m', 'freezing_level_height', 'cape', 'uv_index'], lead_hours: [0, 24, 48, 72] }, { identity: { actorId: 't' } });
ok(run.status === 'complete', 'national run complete', run.status);
const h = new Date(Date.parse(run.base_valid_time)).getUTCHours(), late = h >= 19 && process.env.NIGRAAN_W1_DAY3 !== '0';
const fd = late ? 6 : 5;
ok(calls.length > 0 && calls.every((c) => c.fd === fd && c.pd === 3), 'request: forecast_days ' + fd + ' at base ' + h + ':00 UTC' + (late ? ' (one more UTC day: 00-05 PKT run)' : ' (unchanged)'), JSON.stringify(calls[0]));
const w5 = PV.weightOf((k) => ({ latitude: '1', forecast_days: '5', past_days: '3', hourly: 'a,b,c,d,e,f,g,h,i' })[k] ?? null), w6 = PV.weightOf((k) => ({ latitude: '1', forecast_days: '6', past_days: '3', hourly: 'a,b,c,d,e,f,g,h,i' })[k] ?? null);
ok(w5 === w6 && calls.every((c) => c.w === c.n * w5), '0 extra weighted calls: the weight per location is the same with 8 or 9 days (' + w5 + ')', JSON.stringify(calls.map((c) => c.w)));
const r0 = C.records[0];
ok(r0.hourly.time.length === 73, 'the record stays lead 0-72 (73 hours)', r0.hourly.time.length);
const nat = RC.createRainChance(app, join(APP, 'data')).national(); const u = nat.units && nat.units[units[0].unitId];
const row = (k) => u && u.days.find((x) => x.date === PK.pktDay(Date.now() + k * 864e5)); const assessed = (x) => x && Object.values(x.p || {}).some((v) => v != null);
ok(assessed(row(2)), 'day 2 has a calibrated rain chance');
if (h >= 19 && process.env.NIGRAAN_W1_DAY3 === '0') ok(!assessed(row(3)), 'NIGRAAN_W1_DAY3=0: day 3 stays not assessed at 00-05 PKT (the old behaviour)');
else ok(assessed(row(3)), 'day 3 has a calibrated rain chance (run base ' + h + ':00 UTC)', JSON.stringify(row(3) || null).slice(0, 200));
ok(!row(4), 'day 4 is a neighbour only, never served');
console.log(`\nw1day3 ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
