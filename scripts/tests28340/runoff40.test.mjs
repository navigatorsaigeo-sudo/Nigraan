/* v91.17.283.40 · launch item 6 (owner OK 31 Oct 2026) · RUNOFF PER STORM FOR EVERY TEHSIL, end to end, by FIXED REFERENCE CASES only (no
   agreement with the old method is used as proof). Expected values worked by hand from the NRCS equation Q = (P - 0.2 S)^2 / (P + 0.8 S),
   S = 25400 / CN - 254 (CN 80 at AMC II; AMC I / III by the NEH-4 / Chow conversion), AMC from the 5 days before each storm (36 / 53 mm).
   A. the hourly history (landslideodds.mjs mergeHourly / hourlyOf): complete past PKT days only, 11 days kept, a missing hour stays missing
   B. the refresh asks for hourly rain in the SAME request as the daily rain (one call per batch of 50 tehsils), 11 past days the first time
   C. the served cell (hazsci.mjs applySponge nss_runoff), window = the 5 complete days before the run day:
      C1 storm crossing midnight = one storm;  C2 two storms with an 8 h dry gap = two storms;  C3 incomplete hourly data -> -1 data missing
      (never filled, no per-day substitute);  C4 changing wetness (AMC I then II);  C5 no hourly rain held -> per-day method, labelled
   usage: node runoff40.test.mjs [tree] */
import { join } from 'node:path'; import { pathToFileURL } from 'node:url'; import { mkdtempSync, rmSync } from 'node:fs'; import { tmpdir } from 'node:os';
const ROOT = (process.argv[2] && !/^https?:/.test(process.argv[2]) ? process.argv[2] : new URL('../..', import.meta.url).pathname.replace(/\/$/, ''));
const HZ = await import(pathToFileURL(join(ROOT, 'server/api/hazsci.mjs')).href);
const LO = await import(pathToFileURL(join(ROOT, 'server/api/landslideodds.mjs')).href);
let n = 0, f = 0; const ok = (c, m, i) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : '  :: ' + String(JSON.stringify(i)).slice(0, 400))); if (!c) f++; };
const H = 3600e3, DAY = 864e5;
const Q = (P, cn) => { const S = 25400 / cn - 254, ia = 0.2 * S; return P <= ia ? 0 : (P - ia) ** 2 / (P + 0.8 * S); };
const CN = { 1: 80 / (2.281 - 0.01281 * 80), 2: 80, 3: 80 / (0.427 + 0.00573 * 80) };
const r1 = (x) => Math.round(x * 10) / 10;
const lt = (ms) => new Date(ms + 5 * H).toISOString().slice(0, 13) + ':00';   /* local PKT hour label as the provider writes it */

/* ---- A. hourly history ---- */
{ const now = Date.parse('2026-10-31T10:30:00+05:00'), today = '2026-10-31';
  const t = [], v = []; for (let ms = Date.parse('2026-10-15T00:00:00+05:00'); ms < Date.parse('2026-11-02T00:00:00+05:00'); ms += H) { t.push(lt(ms)); v.push(1); }
  v[t.indexOf('2026-10-28T05:00')] = null;
  const h = LO.mergeHourly({}, t, v, today, now); const hr = LO.hourlyOf(h);
  const first = hr[0].t, last = hr[hr.length - 1].t;
  ok(last === Date.parse('2026-10-30T23:00:00+05:00'), 'A1 only complete past PKT days are held (last hour 30 Oct 23:00, none of today or the forecast)', new Date(last).toISOString());
  ok(first === Date.parse('2026-10-20T00:00:00+05:00'), 'A2 HOURLY_KEEP_DAYS = 11: the oldest hour held is 20 Oct 00:00 (window 5 d + AMC 5 d + 1 d)', new Date(first).toISOString());
  ok(!hr.some((x) => x.t === Date.parse('2026-10-28T05:00:00+05:00')) && h.hr.v.includes(null), 'A3 a missing provider hour stays missing (not filled with 0)');
  const h2 = LO.mergeHourly(h, ['2026-10-28T05:00'], [2.5], today, now);
  ok(LO.hourlyOf(h2).find((x) => x.t === Date.parse('2026-10-28T05:00:00+05:00')).mm === 2.5, 'A4 a later refresh fills the hour from the provider (merge keeps the rest)'); }

/* ---- B. the refresh request ---- */
{ const calls = []; const units = { tehsil: Array.from({ length: 60 }, (_, k) => ({ unitId: 'u' + k, key: 'u' + k, lat: 30 + k / 100, lon: 70, elevM: 100 })) };
  const now = Date.now(), today = new Date(now + 5 * H).toISOString().slice(0, 10);
  const provider = { configured: () => true, call: async (_k, _p, q) => { calls.push(q); const lats = q.latitude;
    const days = []; for (let k = -q.past_days; k < q.forecast_days; k++) days.push(new Date(Date.parse(today + 'T00:00:00Z') + k * DAY).toISOString().slice(0, 10));
    const hours = []; for (const d of days) for (let hh = 0; hh < 24; hh++) hours.push(d + 'T' + String(hh).padStart(2, '0') + ':00');
    return lats.map((la, i) => ({ latitude: la, longitude: q.longitude[i], elevation: q.elevation[i], daily: { time: days, rain_sum: days.map(() => 0) }, hourly: { time: hours, rain: hours.map(() => 0) } })); } };
  const TD = mkdtempSync(join(tmpdir(), 'r40_'));
  try { const { copyFileSync } = await import('node:fs'); copyFileSync(join(ROOT, 'data/landslide-odds-model.json'), join(TD, 'landslide-odds-model.json'));
    const L = LO.createLandslideOdds({ provider, units }, TD); const r = await L.run();
    ok(r.started && r.units === 60, 'B1 the refresh ran for 60 tehsils', r);
    ok(calls.length === 2 && calls.every((q) => q.hourly === 'rain' && q.daily === 'rain_sum'), 'B2 hourly rain asked in the same request as the daily rain: 2 calls for 60 tehsils (batches of 50), no extra call', calls.map((q) => [q.hourly, q.daily, q.latitude.length]));
    ok(calls.every((q) => q.past_days >= LO.HOURLY_KEEP_DAYS), 'B3 first refresh asks ' + LO.HOURLY_KEEP_DAYS + '+ past days', calls.map((q) => q.past_days));
    const hr = L.rainHourly.of('u3'); ok(Array.isArray(hr) && hr.length === LO.HOURLY_KEEP_DAYS * 24, 'B4 11 complete days of hourly rain held per tehsil (' + (hr && hr.length) + ' hours)');
    calls.length = 0; await L.run(); ok(calls.length === 2 && calls.every((q) => q.past_days === 3), 'B5 the next refresh asks only the days it lacks (past_days 3, the daily rule of v283.38: the hourly rain adds no past days)', calls.map((q) => q.past_days));
  } finally { rmSync(TD, { recursive: true, force: true }); } }

/* ---- C. served cell ---- */
const v2 = { edgesCN: [90, 80, 70, 60], covers: ['crop'], cn2: { crop: [80] }, fSlope: [1], units: { U1: { uid: 'U1', bins: [[0, 0, 0, 1]] } } };
const runDay = '2026-10-26', T0 = Date.parse('2026-10-21T00:00:00+05:00');   /* window = 21-25 Oct (the 5 complete days before 26 Oct) */
const series = (spec, drop = []) => { const a = []; for (let k = -120; k < 5 * 24; k++) a.push({ t: T0 + k * H, mm: 0 }); for (const [h, mm] of spec) a[h + 120].mm = mm; return a.filter((x, i) => !drop.includes(i)); };
const cuts = [{ min: 50, idx: 4 }, { min: 20, idx: 3 }, { min: 5, idx: 2 }, { min: 0.5, idx: 1 }, { min: null, idx: 0 }];
const daily = (uid, date) => { const d = []; let s = 0; for (let k = 5; k >= 1; k--) { const t = new Date(Date.parse(date + 'T00:00:00Z') - k * DAY).toISOString().slice(0, 10); d.push({ date: t, mm: 0 }); } return { mm: s, daily: d }; };
const cell = (hours) => { const rec = { days: [{ date: runDay, layers: { nss_baseline: { L: { U1: 0 }, S: {} } } }] };
  HZ.applySponge(rec, { v2, rain5Of: daily, runoffCuts: cuts, hourlyOf: hours === undefined ? null : () => hours });
  const N = rec.days[0].layers.nss_runoff; return { L: N.L.U1, S: N.S && N.S.U1, why: N.why && N.why.U1, fact: N.facts && N.facts.U1, basis: N.basis, method: N.method }; };
{ const c = cell(series([[22, 10], [23, 10], [24, 10], [25, 10]])), want = r1(Q(40, CN[1]));
  ok(c.fact && c.fact.storms && c.fact.storms.length === 1 && c.S === want, 'C1 storm crossing midnight (21/22 Oct): one storm of 40 mm, runoff ' + want + ' mm (per day: 2 x Q(20) = ' + r1(2 * Q(20, CN[1])) + ')', c); }
{ const c = cell(series([[2, 10], [3, 10], [4, 10], [13, 10], [14, 10], [15, 10]])), want = r1(Q(30, CN[1]) + Q(30, CN[1]));
  ok(c.fact && c.fact.storms.length === 2 && c.S === want, 'C2 two storms with an 8 h dry gap on one day: two storms, runoff ' + want + ' mm (one day of 60 mm: ' + r1(Q(60, CN[1])) + ')', c); }
{ const c = cell(series([[30, 20]], [140]));
  ok(c.L === -1 && /hourly rain incomplete/.test(c.why || '') && /1 hours missing/.test(c.why) && c.S == null, 'C3 incomplete hourly data (one hour missing): fail closed -1 "data missing", no value, no per-day substitute', c); }
{ const c = cell(series([[10, 20], [11, 20], [58, 20], [59, 20]])), want = r1(Q(40, CN[1]) + Q(40, CN[2]));
  ok(c.fact && c.fact.storms[0].amc === 1 && c.fact.storms[1].amc === 2 && c.S === want, 'C4 changing wetness: storm 1 AMC I, storm 2 AMC II (40 mm in its 5 days before), runoff ' + want + ' mm', c && c.fact); }
{ const c = cell(series([[-3, 30], [-2, 30]]));
  ok(c.fact && c.fact.storms.length === 0 && c.S === 0, 'C4b a storm that started before the window is not counted in it (its rain still sets the next storm\'s moisture)', c); }
{ const c = cell(undefined);
  ok(c.fact && /hourly rain not held: per day/.test(c.fact.method) && c.L === 0, 'C5 no hourly rain held (hourly off / before the first refresh): the per-day method, labelled', c); }
{ const c = cell(series([[22, 10], [23, 10], [24, 10], [25, 10]]));
  ok(c.method && c.method.perStorm === 1 && /each storm/.test(c.basis) && c.fact.window.from === new Date(T0).toISOString() && c.fact.window.to === new Date(T0 + 5 * DAY).toISOString(), 'C6 the layer states the method and the window (21-25 Oct, the 5 complete days before the run day)', { m: c.method, w: c.fact && c.fact.window }); }
console.log('\nrunoff40: ' + (n - f) + '/' + n + ' passed'); process.exit(f ? 1 : 0);
