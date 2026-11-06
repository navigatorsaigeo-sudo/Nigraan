// W1 · heavy rain days 2-3: the national run keeps the precipitation after lead 72 h to the end of PKT day 4 (from the same provider
// answer: the request is unchanged, 0 extra calls), and the calibrated rain chance then has days 2 and 3 (day 4 is a neighbour only).
// Offline: runNationalIngest on an in-memory store with a mock provider, then createRainChance on the same store.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { imp, ok, done, TREE } from './lib.mjs';
process.env.NIGRAAN_AI = '0';
/* frozen clock: W1_AT (default: run twice, 06:00 UTC = 11:00 PKT and 21:00 UTC = 02:00 PKT) */
if (!process.env.W1_AT) { let bad = 0; for (const at of ['2026-10-22T06:20:00Z', '2026-10-22T21:20:00Z']) { const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, W1_AT: at }, encoding: 'utf8' }); process.stdout.write('--- clock ' + at + '\n' + r.stdout); if (r.status) bad++; } process.exit(bad ? 1 : 0); }
{ const T0 = Date.parse(process.env.W1_AT), R0 = Date.now(), RD = Date; class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(T0 + (RD.now() - R0)); } static now() { return T0 + (RD.now() - R0); } } globalThis.Date = FD; }
const N = await imp('server/api/national.mjs'), RC = await imp('server/api/rainchance.mjs'), PK = await imp('server/api/pktday.mjs');
const C = {}; const store = {
  find: (c, f) => (C[c] || []).find(f), filter: (c, f) => (C[c] || []).filter(f), all: (c) => C[c] || [], insert: async (c, x) => { (C[c] = C[c] || []).push(x); },
  insertMany: async (c, xs) => { (C[c] = C[c] || []).push(...xs); }, save: async () => {}, removeWhere: async (c, f) => { const a = C[c] || []; const n = a.length; C[c] = a.filter((x) => !f(x)); return n - C[c].length; } };
const units = []; for (let i = 0; i < 420; i++) units.push({ unitId: 'P|D|T' + i, name: 'T' + i, district: 'D', province: 'Punjab', lat: 29 + (i % 30) * 0.1, lon: 70 + Math.floor(i / 30) * 0.1, elevM: 200 });
const calls = []; const H0 = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const provider = { call: async (kind, path, P, o) => { calls.push({ fd: P.forecast_days, pd: P.past_days, n: P.latitude.length });
  const n = (P.past_days + P.forecast_days) * 24, s0 = H0 - P.past_days * 864e5; const time = []; for (let k = 0; k < n; k++) time.push(new Date(s0 + k * 3600e3).toISOString().slice(0, 16));
  return P.latitude.map((la, i) => { const h = { time }; for (const v of P.hourly) h[v] = time.map((t, k) => (v === 'precipitation' ? ((k % 7) === 0 ? 3 : 0.2) : v === 'relative_humidity_2m' ? 60 : 20));
    return { latitude: la, longitude: P.longitude[i], elevation: P.elevation[i], utc_offset_seconds: 0, timezone: 'GMT', hourly: h }; }); } };
const dir = mkdtempSync(join(tmpdir(), 'w1-'));
const app = { store, provider, units: { tehsil: units }, audit: { record: async () => {} }, raiseAlert: async () => {}, alerts: null, dataDir: join(TREE, 'data') };
const run = await N.runNationalIngest(app, { unit_level: 'tehsil', variables: ['temperature_2m', 'relative_humidity_2m', 'precipitation', 'snowfall', 'wind_speed_10m', 'wind_gusts_10m', 'freezing_level_height', 'cape', 'uv_index'], lead_hours: [0, 24, 48, 72] }, { identity: { actorId: 't' } });
ok(run.status === 'complete', 'national run complete (' + run.returned_units + ')', run.status + ' ' + JSON.stringify(run.errors).slice(0, 200));
/* v91.17.283.6 item 4 (intended change, proven on the 60-place capture at 20:00 UTC: 0 extra weighted calls, only rain_hz day 3 differs):
   runs based 19-23 UTC ask one more UTC day (forecast_days 6, same provider weight); every other hour is unchanged (forecast_days 5) */
const late = new Date(Date.parse(run.base_valid_time)).getUTCHours() >= 19 && process.env.NIGRAAN_W1_DAY3 !== '0' && process.env.NIGRAAN_RAIN_EXT !== '0';
ok(calls.every((c) => c.fd === (late ? 6 : 5) && c.pd === 3), 'W1: the provider request is ' + (late ? 'forecast_days 6 at 00-05 PKT (item 4, same weight)' : 'unchanged (forecast_days 5, past_days 3)') + ': 0 extra weighted calls', JSON.stringify(calls[0]));
const r0 = C.records[0];
ok(r0.hourly.time.length === 73, 'W1: the record hourly stays lead 0-72 (73 hours)', r0.hourly.time.length);
const d0 = Date.parse(new Date(Date.parse(run.base_valid_time) + 5 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00Z') - 5 * 3600e3;
ok(r0.rainExt && r0.rainExt.time.length > 0 && Date.parse(r0.rainExt.time[r0.rainExt.time.length - 1]) <= d0 + 5 * 864e5, 'W1: rainExt holds the hours after lead 72 up to the end of PKT day 4', r0.rainExt && r0.rainExt.time.length);
const R = RC.createRainChance(app, join(TREE, 'data')); const nat = R.national();
ok(nat.ready, 'rain chance ready', nat.why);
const today = PK.pktDay(Date.now()), dPlus = (k) => PK.pktDay(Date.now() + k * 864e5);
const u = nat.units && nat.units[units[0].unitId]; const row = (d) => u && u.days.find((x) => x.date === d);
const assessed = (x) => x && Object.values(x.p || {}).some((v) => v != null);
const h = new Date(Date.parse(run.base_valid_time)).getUTCHours();
ok(assessed(row(dPlus(2))), 'W1: day 2 has a calibrated rain chance (was withheld: next day not held)', JSON.stringify(row(dPlus(2)) && row(dPlus(2)).why));
/* v91.17.283.6 item 4: day 3 is now assessed at every base hour (00-05 PKT runs too) */
ok(assessed(row(dPlus(3))), 'W1: day 3 has a calibrated rain chance (run base ' + h + ':00 UTC' + (h >= 19 ? ', one more UTC day asked' : '') + ')', JSON.stringify(row(dPlus(3)) || null).slice(0, 200));
ok(!row(dPlus(4)), 'W1: day 4 is a neighbour only, never served');
ok(nat.days.indexOf(today) === 0, 'days start today');
rmSync(dir, { recursive: true, force: true });
done('W1-RAINEXT');
