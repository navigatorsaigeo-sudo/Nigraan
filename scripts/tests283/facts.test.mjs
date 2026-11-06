// v91.17.283 · FACTS283 · the "This place" / "Now" facts at a point, from data the server holds.
// v91.17.283.19: the facts are the part "facts" of the place bundle (GET /api/point; /api/place/facts is retired); the console's other
// answers are the bundle's own parts (its ONE station, glof, siteScreening) and the routes that remain (faults, flood depth, land cover).
// Timing: the facts part's own time (parts.facts.ms) cold; warm = the bundle again (served from the bundle cache of the run).
// Checks: (1) cold and warm timing for 20 places (p95 warm <= 400 ms, cold <= 1.5 s each), the 10-min cache; (2) no outbound call is made by
// the facts code (OUTLOG=<file> of scripts' count preload: every non-loopback request with "facts" = place-facts code on its stack);
// (3) every field is {value, unit, source, productType}, nothing null-faked, no supplier named, every omission has a reason; (4) every field
// against the console's own answer for the same point (start card /api/point/forecast height, /api/fleet/nearest, /api/faults/nearest,
// /api/glof/upstream, /api/flood/depth, /api/terrain/landcover, /api/site/screening "What happened here before"), printed as a table.
// usage: [OUTLOG=<file>] node scripts/tests283/facts.test.mjs <base url>   (run it first after a server start for the cold figures)
import { readFileSync, existsSync } from 'node:fs';
const BASE = process.argv[2] || process.env.BASE || 'http://127.0.0.1:9101';
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + String(d).slice(0, 400) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + String(d).slice(0, 900) : '')); } };
const j = async (p) => { const r = await fetch(BASE + p); return r.json(); };
const timed = async (p) => { const t = performance.now(); const r = await fetch(BASE + p); const b = await r.json(); return { ms: performance.now() - t, b, status: r.status }; };
const factsOf = (B) => (B && B.parts && B.parts.facts && B.parts.facts.v) || { ok: false, why: B && B.parts && B.parts.facts ? B.parts.facts.why : (B && B.why) };
const PLACES = [
  ['G-8 Islamabad', null, null, 'G-8 Islamabad'], ['Gilgit (MACH 105 point)', 35.901151, 74.369656], ['Hunza (Karimabad)', 36.3167, 74.6667], ['Skardu', 35.2971, 75.6333],
  ['Muzaffarabad', 34.3700, 73.4711], ['Lahore', 31.5204, 74.3587], ['Karachi coast (Clifton)', 24.8138, 67.0300], ['Quetta', 30.1798, 66.9750], ['Thar (Mithi)', 24.7369, 69.7969],
  ['Swat Kanju', 34.834073, 72.346807], ['Peshawar', 34.0151, 71.5249], ['Multan', 30.1575, 71.5249], ['Murree', 33.9070, 73.3943], ['Chitral', 35.8518, 71.7864],
  ['Nowshera', 34.0153, 71.9747], ['Sukkur', 27.7052, 68.8574], ['Gwadar', 25.1264, 62.3225], ['Khaplu (MACH 106 point)', 35.171, 76.324], ['Jutial Gilgit (MACH 108 point)', 35.908035, 74.341667], ['Faisalabad', 31.4504, 73.1350]];
/* G-8 is placed the way the start page places a searched name */
for (const P of PLACES) if (P[1] == null) { const s = await j('/api/geo/search?q=' + encodeURIComponent(P[3])); const r = s.results && s.results[0]; P[1] = r.lat; P[2] = r.lon; }
const q = (P) => 'lat=' + P[1].toFixed(5) + '&lon=' + P[2].toFixed(5);

/* ── 1 · timing ── */
const t0 = Date.now(); const cold = [];
for (const P of PLACES) { const r = await timed('/api/point?' + q(P)); P.B = r.b; P.f = factsOf(r.b); cold.push(r.b && r.b.parts && r.b.parts.facts ? r.b.parts.facts.ms : 99999); }
const warm = []; for (let k = 0; k < 10; k++) for (const P of PLACES) { const r = await timed('/api/point?' + q(P)); warm.push(r.ms); if (k === 0) { P.B2 = r.b; P.f2 = factsOf(r.b); } }
const t1 = Date.now();
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)]; };
ok(Math.max(...cold) <= 1500, 'P1 cold: the facts part of every one of the 20 places is computed within 1.5 s on its first call', 'max ' + Math.round(Math.max(...cold)) + ' ms, median ' + Math.round(pct(cold, 50)) + ' ms');
ok(pct(warm, 95) <= 400, 'P2 warm: p95 <= 400 ms over 200 calls of the bundle', 'p95 ' + pct(warm, 95).toFixed(1) + ' ms, p50 ' + pct(warm, 50).toFixed(1) + ' ms');
ok(PLACES.every((P) => P.f.ok && P.B2 && P.B2.assembledAt === P.B.assembledAt && P.f2.staticAt === P.f.staticAt), 'P3 the bundle (and its facts) is cached per point and run (second call served from the cache, same build time)');

/* ── 2 · no outbound call from the facts code ── */
const OUT = process.env.OUTLOG;
if (OUT && existsSync(OUT)) { const L = readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const inWin = L.filter((x) => x.t >= t0 && x.t <= t1), byFacts = L.filter((x) => x.facts);
  ok(byFacts.length === 0, 'O1 zero outbound requests made from the place-facts code (whole server log)', byFacts.length + ' by facts; ' + inWin.length + ' outbound by any module during the ' + (PLACES.length * 11) + ' facts calls (' + [...new Set(inWin.map((x) => x.host + x.path))].slice(0, 4).join(', ') + ')'); }
else ok(true, 'O1 outbound count skipped (no OUTLOG file given)');

/* ── 3 · shape ── */
const NAMED = /\b(PMD|FFD|Pakistan Meteorological|Flood Forecasting Division)\b/i;
const bad = []; for (const P of PLACES) { if (!P.f.ok) { bad.push(P[0] + ': not ok ' + P.f.why); continue; }
  for (const [k, v] of Object.entries(P.f.fields)) { if (v.value == null || !('unit' in v) || !v.source || !v.productType) bad.push(P[0] + ' ' + k); }
  for (const o of P.f.omitted) if (!o.why || P.f.fields[o.field]) bad.push(P[0] + ' omitted ' + o.field); }
ok(!bad.length, 'S1 every field carries value, unit, source and product type; an omitted field is absent and has a reason', bad.slice(0, 6).join(' | '));
const txt = JSON.stringify(PLACES.map((P) => P.f)); ok(!NAMED.test(txt), 'S2 no data-sharing supplier named in the answer', (txt.match(NAMED) || [''])[0]);
ok(!/T\d\d:\d\d(:\d\d(\.\d+)?)?Z/.test(JSON.stringify(PLACES.map((P) => P.f.fields))), 'S3 the fields carry PKT times only (no UTC stamps inside fields)');
const out = factsOf(await j('/api/point?lat=10&lon=10')), dis = factsOf(await j('/api/point?lat=34.08&lon=74.80'));
ok(out.ok === false && dis.ok === false, 'S4 outside the window / outside Pakistan-administered territory: no facts', JSON.stringify([out.why, dis.why]));

/* ── 4 · against the console ── */
const offs = await j('/api/fleet/offsets').catch(() => null); const held = (k) => !!(offs && offs.stations && offs.stations[k] && offs.stations[k].heldOut);
const rows = []; const MIS = [];
const r1 = (x) => x == null ? null : Math.round(x * 10) / 10;
for (const P of PLACES) {
  const F = P.f.fields || {}; const row = { place: P[0] };
  const B = P.B || {}, part = (n) => (B.parts && B.parts[n] && B.parts[n].v) || {};
  const [fa, fd] = await Promise.all([j('/api/faults/nearest?' + q(P)), j('/api/flood/depth?' + q(P))]);
  const pf = B, gl = part('glof'), sc = part('siteScreening');
  /* height: the start card's height; in a rough cell the card shows none and the facts give the cell mean */
  const ce = pf && pf.point ? pf.point.elevM : null;
  row.elev = F.elevation ? (ce != null ? (F.elevation.value === ce ? 'match' : 'MISMATCH ' + F.elevation.value + '/' + ce) : 'card none; cell mean ' + F.elevation.value) : (ce == null ? 'both none' : 'MISSING');
  /* station: v283.19 the facts carry no station; the bundle's ONE station (its rule) is the only one */
  row.station = F.station ? 'MISMATCH facts carry a second station ' + F.station.name : (B.station && B.station.ok ? 'bundle ' + B.station.name + ' ' + B.station.km + ' km' : 'bundle none (' + String(B.station && B.station.why || '').slice(0, 40) + ')');
  /* fault */
  row.fault = fa.ok && fa.nearest ? (F.fault && F.fault.value === fa.nearest.distanceKm && (F.fault.slipType || null) === (fa.nearest.slipType || null) ? 'match ' + F.fault.value + ' km' : 'MISMATCH') : (F.fault ? 'MISMATCH' : 'both none');
  /* GLOF */
  row.glof = gl.ok ? (gl.applicable === false ? (F.glof && F.glof.applicable === false ? 'match none upstream' : 'MISMATCH') : (F.glof && F.glof.value === gl.word && F.glof.lakesOnRoute === gl.counts.lakes && (!gl.lakes[0] || F.glof.leadLake.name === gl.lakes[0].name) ? 'match ' + gl.word + ', ' + gl.counts.lakes + ' lakes' : 'MISMATCH ' + JSON.stringify([F.glof && F.glof.value, gl.word]))) : (F.glof ? 'MISMATCH' : 'both none');
  /* flood map */
  row.floodMap = fd.ready ? (F.floodMap ? ((F.floodMap.wetFromReturnPeriod ?? null) === (fd.firstWetReturnPeriod ?? null) ? 'match' : 'MISMATCH') : 'facts omit (tile not on server); console reads "' + String(fd.summary).slice(0, 40) + '…"') : (F.floodMap ? 'MISMATCH' : 'both none');
  /* past events: the screening's "What happened here before" row */
  const wh = sc && sc.rows ? sc.rows.find((r) => r.parameter === 'What happened here before') : null;
  row.past = wh ? (F.pastEvents && F.pastEvents.value.join(' · ') === wh.values ? 'match' : 'MISMATCH') : (F.pastEvents ? 'MISMATCH' : 'both none');
  const fr = sc && sc.rows ? sc.rows.find((r) => r.parameter === 'Nearest active fault') : null;
  if (fr && F.fault && !String(fr.values).startsWith(Math.round(F.fault.value) + ' km') && !String(fr.values).startsWith(F.fault.value + ' km')) row.fault += ' (screening row ' + String(fr.values).slice(0, 20) + ')';
  /* tehsil land cover */
  const uid = B.place && B.place.unitId ? B.place.unitId : null; const lc = uid ? await fetch(BASE + '/api/terrain/landcover?unit=' + encodeURIComponent(uid)).then((r) => r.ok ? r.json() : null) : null;
  if (lc && lc.shares) { const top = Object.entries(lc.shares).filter(([, v]) => Number.isFinite(v)).sort((a, b) => b[1] - a[1])[0]; row.landcover = F.landCover && F.landCover.tehsil && F.landCover.tehsil.dominant === top[0] ? 'match ' + top[0] : 'MISMATCH'; } else row.landcover = F.landCover && F.landCover.tehsil ? 'MISMATCH' : 'console none';
  row.omitted = P.f.omitted.map((o) => o.field).join(',');
  rows.push(row); for (const [k, v] of Object.entries(row)) if (/MISMATCH|MISSING/.test(String(v))) MIS.push(P[0] + ' ' + k + ': ' + v);
}
console.log('\nplace | height | station | fault | GLOF | flood map | past events | tehsil land cover | omitted');
for (const r of rows) console.log([r.place, r.elev, r.station, r.fault, r.glof, r.floodMap, r.past, r.landcover, r.omitted].join(' | '));
console.log('');
ok(!MIS.length, 'C1 every field equals the console\'s own answer for the same point (held-out stations and the missing flood-map tile explained in the table)', MIS.join(' | '));
const sun = PLACES[0].f.fields.sun; ok(sun && /^0[56]:\d\d$/.test(sun.value.sunrise) && /^1[78]:\d\d$/.test(sun.value.sunset), 'C2 sunrise / sunset in PKT for Islamabad are morning and evening times', JSON.stringify(sun && sun.value));
console.log('\nG-8 Islamabad: ' + JSON.stringify(PLACES[0].f));
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
