/* v91.17.283.2 · D2/D4 · the tehsil superset (server/api/bmrows.mjs) gives, for every request it serves, the provider's own answer byte for
   byte. No server: the module with a deterministic provider (mock_tz.mjs), the five best_match sweep sets of the engine page and the national
   job's GMT batches as the page / national.mjs ask them (shapes read from the call log of 21 Oct), at three frozen times (midday, 23:50 PKT,
   00:10 PKT = the UTC day before), with two sweep points resolving `auto` to Asia/Kolkata.
   node scripts/tests283/d24/bm.unit.test.mjs        exit 0 = PASS */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..', '..');
const UNITS = JSON.parse(readFileSync(join(ROOT, 'server', 'contract', 'units.json'), 'utf8'));
const SW = UNITS.filter((u) => !u.disputed);
const KOL = [SW[0], SW[5]].map((u) => u.lat + ',' + u.lon).join(';');
const TIMES = ['2026-10-21T07:00:00Z', '2026-10-21T18:50:00Z', '2026-10-21T19:10:00Z'];
if (!process.env.BM_CHILD) {   /* parent: one child per frozen time (the mock's clock is fixed at import) */
  let bad = 0;
  for (const t of TIMES) { let out = '';
    try { out = execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, BM_CHILD: '1', MOCK_FREEZE: String(Date.parse(t)), MOCK_KOLKATA: KOL }, encoding: 'utf8', maxBuffer: 1e8, timeout: 900e3 }); }
    catch (e) { out = String(e.stdout || '') + '\nFAIL child exited: ' + String(e.message).slice(0, 200); }
    for (const l of out.split('\n').filter(Boolean)) { console.log(l.replace(/^(PASS|FAIL)/, '$1 [' + t + ']')); if (/^FAIL/.test(l)) bad++; } }
  console.log((bad ? 'FAIL' : 'PASS') + ' bm superset identity: ' + bad + ' failures over ' + TIMES.length + ' frozen times');
  process.exit(bad ? 1 : 0);
}
await import(join(HERE, 'mock_tz.mjs'));
const { createModelRuns } = await import(join(ROOT, 'server', 'api', 'modelruns.mjs'));
const { createBmRows } = await import(join(ROOT, 'server', 'api', 'bmrows.mjs'));
let INIT = 1760000000, OFF = 0;
const MR = createModelRuns({ dataDir: join(ROOT, 'data'), now: () => Date.now() + OFF, metaFetch: async () => ({ last_run_initialisation_time: INIT, last_run_availability_time: INIT + 3600, update_interval_seconds: 1 }) });
const PL = new Set(UNITS.map((u) => String(Number(u.lat)) + ',' + String(Number(u.lon))));
const BM = createBmRows({ runs: MR, isPlace: (a, b) => PL.has(a + ',' + b) });
let calls = 0, locs = 0; const byGT = {};
BM.setFetcher(async (q) => { calls++; const gt = (q.has('daily') && q.get('daily').split(',').length === 1 ? 'prob' : 'main') + ' ' + q.get('timezone'); byGT[gt] = (byGT[gt] || 0) + q.get('latitude').split(',').length; locs += q.get('latitude').split(',').length; const r = await fetch('https://customer-api.open-meteo.com/v1/forecast?' + q); const j = await r.json(); return Array.isArray(j) ? j : [j]; });
const direct = async (q) => Buffer.from(await (await fetch('https://customer-api.open-meteo.com/v1/forecast?' + q)).arrayBuffer());
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const el = (u) => String(Math.round(u.elevM));
const mk = (us, rest, fix4 = false) => { const q = new URLSearchParams(); q.set('latitude', us.map((u) => fix4 ? u.lat.toFixed(4) : String(u.lat)).join(',')); q.set('longitude', us.map((u) => fix4 ? u.lon.toFixed(4) : String(u.lon)).join(','));
  q.set('elevation', us.map(el).join(',')); for (const [k, v] of new URLSearchParams(rest)) q.set(k, v); return q; };
const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
/* the five sets (query text as the engine page sends it upstream, 21 Oct log) */
const A = 'current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,precipitation&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,precipitation,precipitation_probability,snowfall,soil_moisture_9_to_27cm,surface_pressure,pressure_msl,cloud_cover,temperature_850hPa,wind_speed_850hPa,dew_point_2m,wind_direction_10m,shortwave_radiation&forecast_days=4&models=best_match&timezone=auto';
const B = 'current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_9_to_27cm,soil_moisture_27_to_81cm&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,apparent_temperature_max,relative_humidity_2m_mean,dew_point_2m_mean,precipitation_sum,precipitation_hours,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max,shortwave_radiation_sum,et0_fao_evapotranspiration,snowfall_sum&past_days=7&forecast_days=4&timezone=Asia/Karachi&hourly=temperature_2m,dew_point_2m,cloud_cover,wind_speed_10m,wind_direction_10m,shortwave_radiation,precipitation';
const C = 'hourly=snow_depth,snowfall,freezing_level_height,temperature_2m,dew_point_2m,cloud_cover,wind_speed_10m,wind_direction_10m,shortwave_radiation,precipitation&forecast_days=3&timezone=auto&models=best_match&past_days=3';
const D = 'hourly=soil_moisture_27_to_81cm,precipitation,temperature_2m&forecast_days=3&timezone=auto&models=best_match';
const E = 'hourly=cape&forecast_days=3&timezone=auto&models=best_match';
const N = 'hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m,freezing_level_height,cape,uv_index,snowfall,cloud_cover,dew_point_2m,wind_direction_10m,shortwave_radiation&forecast_days=5&past_days=3&timezone=GMT&models=best_match';
const sets = [['A (120, auto)', chunks(SW, 120).map((c) => mk(c, A))], ['B (120, Asia/Karachi)', chunks(SW, 120).map((c) => mk(c, B, true))],
  ['C (36, auto, mountains)', chunks(SW.filter((u) => u.elevM > 1000), 36).map((c) => mk(c, C))], ['D (36, auto)', chunks(SW.filter((_, i) => i % 2 === 0), 36).map((c) => mk(c, D))],
  ['E (36, auto)', chunks(SW.filter((_, i) => i % 8 !== 3), 36).map((c) => mk(c, E))]];
for (const g of BM.GROUPS) await MR.poll(MR.specFor('forecast', (k) => (k === 'hourly' ? g.hourly.join(',') : k === 'daily' ? g.daily.join(',') : k === 'current' ? g.current.join(',') : null)));
await MR.poll(MR.specFor('forecast', (k) => new URLSearchParams(A).get(k)));
/* T1 every sweep body of the five sets: composed = the provider's answer, byte for byte (requests in the page's order: all sets at once) */
const res = await Promise.all(sets.flatMap(([name, qs]) => qs.map(async (q) => ({ name, q, c: await BM.compose((k) => q.get(k), { keys: [...q.keys()],}) }))));
for (const [name] of sets) { const R = res.filter((r) => r.name === name); let same = 0;
  for (const r of R) if (r.c && Buffer.compare(r.c.body, await direct(r.q)) === 0) same++;
  ok(same === R.length, 'T1 ' + name + ': ' + same + ' of ' + R.length + ' bodies cut from the superset are byte-identical to the provider\'s answer'); }
/* T2 one fetch per place, group and zone: 576 main + 576 probability rows with `auto`, and the two Kolkata places again in Asia/Karachi */
ok(locs === 2 * SW.length + 2 * 2, 'T2 superset rows fetched: ' + locs + ' (expected ' + (2 * SW.length + 4) + ': each place once per group, the 2 Asia/Kolkata places once more in Asia/Karachi), in ' + calls + ' calls ' + JSON.stringify(byGT));
/* T3 the Kolkata places: their `auto` row is Asia/Kolkata and is never used for Asia/Karachi or GMT */
{ const k0 = SW[0]; const q = mk([k0, ...SW.slice(1, 25)], A); const c = await BM.compose((k) => q.get(k), { keys: [...q.keys()],}); const j = JSON.parse(c.body.toString());
  ok(j[0].timezone === 'Asia/Kolkata' && j[1].timezone === 'Asia/Karachi' && Buffer.compare(c.body, await direct(q)) === 0, 'T3 an `auto` body with an Asia/Kolkata place: that row is Asia/Kolkata, the body is the provider\'s'); }
/* T4 national GMT batches: every held place relabelled in UTC = the provider's GMT answer; a place with another height, or resolving to
   Asia/Kolkata, is not held (the batch asks the provider for it) */
{ const NU = UNITS.map((u, i) => (i % 25 === 7 ? { ...u, elevM: u.elevM + 37 } : u)); let held = 0, same = 0, notHeld = 0, wrong = 0;
  for (const c of chunks(NU, 50)) { const q = mk(c, N); const P = Object.fromEntries([...q.entries()].map(([k, v]) => [k, ['latitude', 'longitude', 'elevation', 'hourly'].includes(k) ? v.split(',') : v]));
    const part = await BM.composeGmt(P); const d = JSON.parse((await direct(q)).toString());
    part.forEach((x, i) => { const u = c[i]; const expectHeld = !u.disputed && u.elevM === UNITS.find((v) => v.unitId === u.unitId).elevM;   /* the Kolkata places too: their Asia/Karachi rows (fetched for set B) are true Asia/Karachi answers */
      if (x) { held++; if (JSON.stringify(x) === JSON.stringify(d[i])) same++; if (!expectHeld) wrong++; } else { notHeld++; if (expectHeld) wrong++; } }); }
  ok(held > 500 && same === held && wrong === 0, 'T4 national GMT: ' + same + ' of ' + held + ' held places identical to the provider\'s GMT answer; ' + notHeld + ' not held (another height, or the disputed unit no sweep asks); misplaced ' + wrong); }
/* T5 not a part of the superset: another place, another variable, a window past it, another model, UTC -> null (fetched as before) */
{ const base = mk(SW.slice(0, 30), E); const t = (f) => { const q = new URLSearchParams(base); f(q); return BM.parse((k) => q.get(k), false, [...q.keys()]); };
  ok(t(() => {}) && !t((q) => q.set('latitude', '33.7,' + q.get('latitude').split(',').slice(1).join(','))) && !t((q) => q.set('hourly', 'boundary_layer_height'))
    && !t((q) => q.set('forecast_days', '7')) && !t((q) => q.set('past_days', '8')) && !t((q) => q.set('models', 'icon_seamless')) && !t((q) => q.set('timezone', 'UTC')) && !t((q) => q.set('cell_selection', 'land')),
    'T5 a request with any other place, variable, window, model, time zone or parameter is not served from the superset'); }
/* T6 a newer run: rows are stale, the next request fetches the superset again and the cut body is the new answer; a caller asking for the
   old run gets null (its caller fetches as before) */
{ const before = calls; const q = mk(SW.slice(0, 120), E); const old = MR.key(MR.specFor('forecast', (k) => q.get(k)));
  INIT += 21600; OFF += 700e3; for (const g of BM.GROUPS) await MR.poll(MR.specFor('forecast', (k) => (k === 'hourly' ? g.hourly.join(',') : k === 'daily' ? g.daily.join(',') : null)));
  const c = await BM.compose((k) => q.get(k), { keys: [...q.keys()],}); ok(c && calls > before && Buffer.compare(c.body, await direct(q)) === 0 && c.run !== old, 'T6 after a newer run the superset is fetched again (' + (calls - before) + ' call) and the body is the provider\'s answer');
  const after = calls; const c2 = await BM.compose((k) => q.get(k), { keys: [...q.keys()], want: old }); ok(c2 === null && calls === after, 'T6b a refresh that wants the previous run is not served from rows of the newer run, and fetches nothing'); }
process.exit(fails ? 1 : 0);
