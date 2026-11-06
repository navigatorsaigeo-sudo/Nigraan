/* v91.17.283.23 . FORCED FAILURES: "NOT ASSESSED" IS NEVER A LEVEL, ONE RULE PER THING (external audit of 26 Oct 2026 and the self-audit),
   offline (no server, no provider):
     F1  rain: no tested class -> not assessed with the screening fact, never Normal; a positive screening flag stays; a stale ensemble run
         or a calibrated day whose lead moved is not assessed
     F2  the point record: a day without humidity at some hour -> heat and cold not assessed (reason), never "None"; a day with a missing
         rain or snow hour -> no day total (reason), never a partial sum or 0; "None" only for an assessed UTCI; calm wind flagged
     F3  one UTCI validity rule: 51 C, wind 70 km/h, humidity missing -> null with the reason (point record) and null in the verification
         (no clamp); a measured day with an hour outside the range is not scored
     F4  area heat: a point not assessed is not dropped from the tehsil maximum (not assessed unless the assessed bound is Severe)
     F5  river: each day keeps its own level (holdIssueLevels copies); a linked reach without a score is missing data (-1), not "no river"
         (-3); a reach forecast older than the river stale rule is not used
     F6  a server method that fails, or lacks its inputs, leaves no older level behind (GLOF, river)
     F7  alerts: a tehsil row is matched by its unique name, a district row to the tehsils of that district; the tehsil answer gates the
         full rows (a heat Moderate row passes; the compact row with no index used to be dropped with a false reason)
     F8  the 3-hour rain windows: a value stamped hh is the rain of the hour before (server pktWin and the strip's rainWin agree)
     F9  the point record's run key reads `run` of every model domain; the cache key is the point as asked (5 decimals)
     F10 the place bundle: a part that times out on the first answer fills the bundle when it settles; a temporary failure is retried; a
         batch answer is never retried; no retry flag reaches the client
     F11 feed health: time the computer was off is not a feed gap and does not age a feed
     F12 verification: a day stored without its observations is incomplete, never in the summary, and scored again
   usage: node scripts/tests28323/forced.unit.test.mjs */
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
const imp = (f) => import(pathToFileURL(join(API, f)).href);
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 400) : '')); } };

const HZ = await imp('hazsci.mjs'), PS = await imp('pointstate.mjs'), PE = await imp('pointengine.mjs'), AH0 = await imp('areaheat.mjs'), AH = { ...AH0, aggregate: (P, st, o) => AH0.aggregate(P, st, { share: 0.25, ...(o || {}) }) } /* v283.36 item 16: the rule file's share is passed (no 0.25 fallback) */, EN = await imp('engine.mjs');

/* F1 */
{ const a = HZ.rainNoClear(0, false, 12, { x: 1 }, 'chance 12 %'); ok(a.L === -5 && /screening only/.test(a.why) && a.facts.screeningOnly, 'F1 (v283.31 -5) untested rain, no flag -> not tested', JSON.stringify(a));
  const b = HZ.rainNoClear(2, false, 80, {}, 'x'); ok(b.L === -5 && b.facts && b.facts.screeningOnly, 'F1 (v283.36 item 1/22) a positive screening flag on untested classes is a fact, not a level (not tested)', JSON.stringify(b));
  const c = HZ.rainNoClear(0, true, 3, {}, 'x'); ok(c.L === 0, 'F1 Normal only when every class was tested');
  const row = { prc: { n: 51, p: { '15.6': 4, '64.5': 0, '115.6': 0, '204.5': 0 } } };
  const r = HZ.rainCell(row, 51); ok(r.L === -5, 'F1 (v283.31 -5) share rule below every class -> not tested', JSON.stringify(r));
  const rec = { days: [{ day: 0, date: '2026-10-27', layers: { rain_hz: { L: { u: 0 } } } }, { day: 1, date: '2026-10-28', layers: { rain_hz: { L: { u: 0 } } } }] };
  HZ.applyRain(rec, { at: new Date(Date.now() - 40 * 3600e3).toISOString(), members: 51, days: ['2026-10-27', '2026-10-28'], units: { u: [row, row] } });
  ok(rec.days[0].layers.rain_hz.L.u === -6 && /old/.test(rec.days[0].layers.rain_hz.why.u), 'F1 a 40 h old ensemble run is not served as current', JSON.stringify(rec.days[0].layers.rain_hz));
  const cal = { prc: { calibrated: true, L: 0, lead: 2, n: 51, p: { '15.6': 5 }, status: {} } };
  const rec2 = { days: [{ day: 1, date: '2026-10-28', layers: { rain_hz: { L: { u: 0 } } } }] };
  HZ.applyRain(rec2, { at: new Date().toISOString(), members: 51, days: ['2026-10-27', '2026-10-28'], units: { u: [cal, cal] } });
  ok(rec2.days[0].layers.rain_hz.L.u === -1 && /lead 2/.test(rec2.days[0].layers.rain_hz.why.u), 'F1 a calibrated day computed at another lead is not assessed', JSON.stringify(rec2.days[0].layers.rain_hz.why)); }

/* F2 + F9: the point record from a forced provider answer */
{ const now = Date.parse('2026-10-27T05:30:00Z');   /* 10:30 PKT */
  const time = []; for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) time.push('2026-10-' + String(27 + d).padStart(2, '0') + 'T' + String(h).padStart(2, '0') + ':00');
  const n = time.length, T = time.map((t) => 25 + 8 * Math.sin((+t.slice(11, 13) - 9) / 24 * 2 * Math.PI)), RH = time.map(() => 40), W = time.map(() => 10);
  RH[5] = null;                       /* day 0: humidity missing at 05:00 */
  const P = time.map(() => 0.2); P[24 + 14] = null;   /* day 1: rain missing at 14:00 */
  const answer = [{ hourly: { time, temperature_2m: T, relative_humidity_2m: RH, wind_speed_10m: W, precipitation: P, snowfall: time.map(() => 0), dew_point_2m: T.map((x) => x - 10), weather_code: time.map(() => 1), cloud_cover: time.map(() => 10) }, agn_national: { applied: false } }];
  const app = { places: { pointRow: () => ({ administered: true, elevM: 500, tehsil: 'T', district: 'D', province: 'P', unitId: 'P|D|T' }) },
    modelRuns: { status: () => ({ domains: { 'ecmwf|a': { run: '2026-10-27T00:00:00.000Z' }, 'icon|b': { run: '2026-10-26T18:00:00.000Z' } } }) } };
  const S = PS.createPointState(app, { dataDir: mkdtempSync(join(tmpdir(), 'f2-')), now: () => now, fetchPx: async () => answer });
  const [r] = await S.many([{ lat: 30.123456, lon: 70.654321 }]);
  const d0 = r.days.find((d) => d.lead === 0), d1 = r.days.find((d) => d.lead === 1), d2 = r.days.find((d) => d.lead === 2);
  /* v91.17.283.28 · S4 (owner rule): the day's UTCI maximum needs every DAYTIME hour, its minimum every NIGHT hour; humidity missing at
     05:00 PKT (night) leaves the heat maximum assessed and the cold minimum not assessed with the reason (was: both not assessed) */
  ok(d0 && d0.heat.assessed === false && /humidity missing/.test(d0.heat.why), 'F2 (v283.31 owner 3.2: all 24 hours) humidity missing at a night hour -> the day heat is not assessed, with the reason', JSON.stringify(d0 && d0.heat));
  ok(d0 && d0.cold.level === null && d0.cold.assessed === false && /humidity missing/.test(d0.cold.why), 'F2 ... and the day cold (night minimum) is not assessed with the reason (never "None")', JSON.stringify(d0 && d0.cold));
  ok(d1 && d1.rainMm === null && /rain missing for 1 of 24/.test(d1.rainWhy), 'F2 a missing rain hour -> no day total, with the reason', JSON.stringify(d1 && { r: d1.rainMm, w: d1.rainWhy }));
  ok(d2 && d2.rainMm === 4.8 && d2.heat.assessed === true && d2.heat.level != null, 'F2 a complete day keeps its total and an assessed heat level', JSON.stringify(d2 && { r: d2.rainMm, h: d2.heat }));
  ok(d2 && (d2.heat.level === 'None' || /Moderate|High|Severe/.test(d2.heat.level)), 'F2 "None" only for an assessed UTCI');
  ok(/^2026-10-27T00:00~[0-9a-z]+$/.test(r.run), 'F9 the run key reads `run` of every model domain (newest + hash)', r.run);
  ok(r.key === '30.12346,70.65432', 'F9 the cache key is the point as asked (5 decimals)', r.key);
  const h5 = r.hours.find((h) => h.time.endsWith('T05:00') && h.time.startsWith('2026-10-27')); ok(h5 && h5.utciShadeC === null && h5.heatLevel === null && /humidity/.test(h5.utciNotAssessed || ''), 'F2 the hour itself: no UTCI, no level, the reason', JSON.stringify(h5)); }

/* F3 */
{ ok(/50 C/.test(PE.comfortOf(51, 20, 10).utciNotAssessed || ''), 'F3 point: 51 C -> not assessed (extreme heat beyond the method)');
  ok(/wind 70/.test(PE.comfortOf(30, 50, 70).utciNotAssessed || ''), 'F3 point: wind 70 km/h -> not assessed');
  ok(/humidity missing/.test(PE.comfortOf(30, null, 10).utciNotAssessed || ''), 'F3 point: humidity missing -> not assessed with that reason');
  const V = await import(pathToFileURL(join(ROOT, 'scripts', 'agents', 'verify.mjs')).href); const U = await imp('utci.mjs');
  ok(V.utciInRange(U, 51, 3, 20) === null && V.utciInRange(U, 30, 3, 50) === U.utci(30, 30, 3, 50), 'F3 verification: no clamp (null outside the range, the polynomial inside)'); }

/* F4 */
{ const P = [{ uid: 'a', kind: 'main settlement', lat: 1, lon: 1 }, { uid: 'a', kind: 'town', lat: 2, lon: 2, pop: 1 }];   /* v283.31 owner 2.2: a populated point (a centre is reported, not weighted) */
  const ok40 = { ok: true, days: [{ lead: 0, date: 'd', heat: { utciMaxC: 40 } }] }, na = { ok: true, days: [{ lead: 0, date: 'd', heat: { utciMaxC: null, why: 'not assessed: air temperature 51 C is at or above 50 C' } }] };
  const U1 = AH.aggregate(P, [ok40, na]); ok(U1.a.days.d.level === null && /town point/.test(U1.a.days.d.why), 'F4 a point not assessed makes a High lower bound not assessed', JSON.stringify(U1.a.days.d));
  const U2 = AH.aggregate(P, [{ ok: true, days: [{ lead: 0, date: 'd', heat: { utciMaxC: 47 } }] }, na]); ok(U2.a.days.d.level === 4, 'F4 a Severe lower bound is final');
  const rec = { days: [{ day: 0, date: 'd', layers: { heat: { L: { a: 2 }, S: { a: 50 } } } }], unitKeys: { a: 'A' }, alerts: [], alertsFull: [] };
  AH.applyTo(rec, U1); ok(rec.days[0].layers.heat.L.a === -1 && rec.days[0].layers.heat.why.a && rec.days[0].layers.heat.src.a === 'area (not assessed)', 'F4 the issued heat cell is not assessed with the reason (never the engine’s older value)', JSON.stringify(rec.days[0].layers.heat)); }

/* F5 */
{ const rec = { days: [0, 1, 2, 3].map((d) => ({ day: d, date: ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'][d], layers: d === 0 ? { flood_riverine: { L: { u1: 0 }, S: {} } } : {} })) };
  EN.holdIssueLevels(rec);
  const link = { gauges: { g1: {} }, units: { u1: { reaches: { g1: { river: 'Indus' } } } } }, sc = { '2026-10-27': 88, '2026-10-28': 10, '2026-10-29': 10, '2026-10-30': 10 };
  HZ.applyRiver(rec, { link, signalOf: (g, date) => ({ level: sc[date] >= 82 ? 4 : 0, score: sc[date], basis: 'x' }) /* v283.35 A1: a signal carries its level */, handOf: () => ({ factor: 1, floodplainShare: 0.5 }) });
  ok(rec.days[0].layers.flood_riverine.L.u1 === 4 && rec.days[3].layers.flood_riverine.L.u1 === 0, 'F5 each day keeps its own river level (day 0 Severe, day 3 Normal)', rec.days.map((d) => d.layers.flood_riverine.L.u1).join(','));
  const c = HZ.riverCell('u1', link, { g1: { score: null, why: 'no river forecast' } }, null); ok(c.L === -1 && /linked to g1/.test(c.why), 'F5 a linked reach without a score is missing data (-1), not "no river here"', JSON.stringify(c));
  const s = HZ.reachSignal('g1', '2026-10-27', { gauges: {}, dayView: () => ({ classWhy: 'the river forecast of this reach is 120 h old (more than 30 h): not used' }) });
  ok((s.score == null && s.level == null) && /120 h old/.test(s.why), 'F5 a stale reach forecast gives no score, with its age'); }

/* F6 */
{ const rec = { days: [{ day: 0, date: 'd', layers: { glof: { L: { a: 3, b: -2 } }, flood_riverine: { L: { a: 4 } } } }] };
  HZ.applyGlof(rec, { nat: null, ladder: null }); ok(Object.values(rec.days[0].layers.glof.L).every((v) => v < 0) && rec.days[0].layers.glof.why.a && !/\.json|data\//.test(rec.days[0].layers.glof.why.a), 'F6 GLOF without its record (v283.36 item 18: facts only, applicability from drainage): no older class left, a reason in plain words', JSON.stringify(rec.days[0].layers.glof));
  HZ.applyRiver(rec, { link: null }); ok(rec.days[0].layers.flood_riverine.L.a === -1, 'F6 river without its link table: not assessed (the page engine’s Severe is not left)'); }

/* F7 */
{ const rec = { unitKeys: { 'Punjab|Rahim Yar Khan|Khanpur': 'Khanpur', 'Sindh|Shikarpur|Khanpur': 'Khanpur (Shikarpur)', 'Punjab|Sahiwal|Sahiwal': 'Sahiwal', 'Punjab|Sahiwal|Chichawatni': 'Chichawatni', 'Punjab|Sargodha|Sahiwal': 'Sahiwal (Sargodha)' } };
  ok(EN.rowUnits(rec, { name: 'Khanpur (Shikarpur)' })[0] === 'Sindh|Shikarpur|Khanpur', 'F7 a same-named tehsil is matched by its unique name');
  ok(EN.rowUnits(rec, { name: 'Sahiwal', district: true, drivingTehsil: 'Chichawatni' }).sort().join(';') === 'Punjab|Sahiwal|Chichawatni;Punjab|Sahiwal|Sahiwal', 'F7 a district row belongs to the tehsils of that district only');
  const F = EN.clientFacts({ reachScore: 88, handFactor: 0.7, river: 'Indus', probability: { '15.6': 20 } }); ok(!('reachScore' in F) && !('handFactor' in F) && F.river === 'Indus' && F.probability, 'F7 client facts carry no internal scores'); }

/* F8 */
{ /* v91.17.283.28 · S2: pool.mjs pktWin is the one rule of pktday.mjs (hourEndingWindow on UTC stamps) */
  const src = readFileSync(join(API, 'pool.mjs'), 'utf8'); ok(/const pktWin = \(utc\) => hourEndingWindow\(utc, \{ utc: true \}\)/.test(src), 'F8 pool.mjs pktWin is the shared rule');
  const PKD = await import(pathToFileURL(join(API, 'pktday.mjs')).href); const pktWin = (t) => PKD.hourEndingWindow(t, { utc: true });
  ok(pktWin('2026-10-27T22:00') === '2026-10-28T00:00' && pktWin('2026-10-27T21:00') === '2026-10-28T00:00' && pktWin('2026-10-27T19:00') === '2026-10-27T21:00', 'F8 server (UTC stamps): 03:00 and 02:00 PKT belong to 00-03; 00:00 PKT to 21-24 of the day before', [pktWin('2026-10-27T22:00'), pktWin('2026-10-27T21:00'), pktWin('2026-10-27T19:00')].join(' '));
  const hs = readFileSync(join(API, 'hourstrip_ui.js'), 'utf8'); const fin = (x) => x != null && isFinite(+x);
  const hsWin = eval('(' + /function hsWin\(t\) \{[^\n]+\}/.exec(hs)[0] + ')'); const rainWin = eval('(function(hsWin){ return ' + /function rainWin\(t\) \{[^\n]+\}/.exec(hs)[0] + '})')(hsWin);
  ok(rainWin('2026-10-28T03:00') === '2026-10-28T00:00' && rainWin('2026-10-28T01:00') === '2026-10-28T00:00' && rainWin('2026-10-28T00:00') === '2026-10-27T21:00' && rainWin('2026-10-28T04:00') === '2026-10-28T03:00', 'F8 strip: the same rule (hh+1..hh+3 sum into hh..hh+3)'); }

/* F10 */
{ const P = await imp('point.mjs'); let n = 0, slow = null;
  const app = { places: { resolvePoint: () => ({ unit: { tehsil: 'T', unitId: 'u' }, place: null }) },
    pointState: { state: async () => ({ ok: true, point: { lat: 30, lon: 70, elevM: 100 }, area: {}, source: { mach: {} }, now: { tempC: 20 } }), rawBuild: async () => null, runStamp: () => ({ stamp: 's1' }), many: async (pts) => pts.map(() => ({ ok: true, point: { lat: 30, lon: 70, elevM: 1 } })) } };
  process.env.NIGRAAN_POINT_PART_MS = '300'; process.env.NIGRAAN_POINT_FIRST_MS = '50'; process.env.NIGRAAN_PART_RETRY_S = '1';
  const P2 = await import(pathToFileURL(join(API, 'point.mjs')).href + '?t=' + Date.now());
  const B = P2.createPoint(app, { parts: { slow: () => new Promise((r) => setTimeout(() => r({ ok: true, v: 7 }), 600)), flaky: () => { n++; if (n === 1) throw new Error('read ECONNRESET'); return { ok: true }; }, lim: () => ({ ok: false, why: 'HTTP 429 quota' }) } });
  const a = await B.bundle({ lat: 30, lon: 70 }); ok(a.parts.flaky && a.parts.flaky.limited && a.parts.flaky.transient && a.parts.flaky.retryAt, 'F10 a temporary failure is answered "retrying" with a retry time', JSON.stringify(a.parts.flaky));
  ok(!Object.keys(a).some((k) => /^__retry/.test(k)), 'F10 no retry flag reaches the client');
  await new Promise((r) => setTimeout(r, 2600));
  const b = await B.bundle({ lat: 30, lon: 70 }); ok(b.parts.slow && b.parts.slow.ok, 'F10 a part that timed out on the first answer fills the bundle when it settles', JSON.stringify(b.parts.slow));
  ok(b.parts.flaky && b.parts.flaky.ok && n === 2, 'F10 the temporary failure was retried once and filled', 'calls ' + n);
  let lc = 0; const B3 = P2.createPoint(app, { parts: { levels: () => { lc++; return { ok: false, why: 'HTTP 429 quota' }; } } });
  const bt = await B3.batch([{ lat: 30, lon: 70 }], { with: ['levels'] }); await new Promise((r) => setTimeout(r, 2500));
  ok(lc === 1, 'F10 a batch answer (already sent) is never retried', 'calls ' + lc); }

/* F11 */
{ const FH = await import(pathToFileURL(join(ROOT, 'scripts', 'agents', 'feed_health.mjs')).href); const H = 3600e3;
  const ev = []; for (let t = 0; t < 30 * 24 * H; t += H) ev.push(t); const off = [0, 10 * 24 * H]; const ev2 = ev.filter((t) => t < 10 * 24 * H || t > 13 * 24 * H);
  const iv = [[0, 10 * 24 * H], [13 * 24 * H, 30 * 24 * H]]; const s = FH.cadenceStatus(ev2, 30 * 24 * H, { awake: iv, windowDays: 31 });
  ok(s.downAfterMin != null && s.downAfterMin < 3 * 60, 'F11 a 3-day laptop-off gap is not learnt as a feed gap', JSON.stringify({ down: s.downAfterMin, gaps: s.gaps }));
  const s2 = FH.cadenceStatus(ev.filter((t) => t <= 10 * 24 * H), 13 * 24 * H + 0.5 * H, { awake: iv, windowDays: 31 }); ok(s2.status === 'ok', 'F11 right after waking the feed is not LATE (age counted in awake time)', JSON.stringify({ st: s2.status, age: s2.ageMin })); }

/* F12 */
{ const src = readFileSync(join(ROOT, 'scripts', 'agents', 'verify.mjs'), 'utf8');
  ok(/r\.incomplete = 'no matched observations for this day yet'/.test(src) && /filter\(\(r\) => !r\.incomplete\)/.test(src) && /incomplete && young\(r\.day\)/.test(src), 'F12 incomplete days are marked, left out of the summary and scored again (7 days)');
  const AG = readFileSync(join(API, 'agents.mjs'), 'utf8'); ok(/for \(let i = 30; i >= 1; i--\)/.test(AG) && /'gaps'/.test(AG), 'F12 the verification asks every missing day of the last 30, not only yesterday'); }

console.log('\n' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
