/* v91.17.283.37 (NIGRAAN 1.0.1) · THE NATIONAL HAZARD SURFACE (server): GET /api/hazardgrid
   1  the grid is built (the background builder; this test waits for it, or asks for a build on a server where none is due)
   2  SAME VALUE RULE: at >= 200 grid points (edge points of the land mask first, then spread interior points) the grid's count for every
      day (0-3) equals the place record's count at that exact point (GET /api/point part hazardCount: the bundle every page reads), under
      the same point-state stamp (a point compared under another stamp is not counted as compared)
   3  the count is the COUNTED bars at Moderate or above, including river flood, landslide, wind (when a level is issued), drought,
      glacial-lake flood and air quality; the served rule lists those keys as counted
   4  nothing assessed -> no value (never 0): points outside Pakistan-administered territory, at sea and in IIOJK are null in the grid
   5  the client answer carries no run id or code text; a bad day is refused (400)
   usage: node scripts/tests28337/grid37.test.mjs [base]     (NIGRAAN_G37_N: points to compare, default 220) */
import { T, BASE } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const N = +(process.env.NIGRAAN_G37_N || 220);
const C = { 'x-agn-view': 'customer' };
const get = async (p, h = C, ms = 180000) => { try { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms); const r = await fetch(BASE + p, { headers: h, signal: ac.signal }); clearTimeout(t); const j = await r.json().catch(() => null); return { status: r.status, j }; } catch (e) { return { status: 0, j: null, e: String(e) }; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* 1 the build */
let st = (await get('/api/hazardgrid/status', {})).j;
ok(st && st.version && st.grid, 'the hazard grid runs on this server (/api/hazardgrid/status, operator)', JSON.stringify(st).slice(0, 300));
if (st && !st.built && !st.building) { await fetch(BASE + '/api/hazardgrid/build', { method: 'POST' }); await sleep(3000); st = (await get('/api/hazardgrid/status', {})).j; }
const t0 = Date.now(); while (st && !st.built && Date.now() - t0 < 50 * 60e3) { await sleep(15000); st = (await get('/api/hazardgrid/status', {})).j; }
while (st && st.building && st.built && Date.now() - t0 < 50 * 60e3) { await sleep(15000); st = (await get('/api/hazardgrid/status', {})).j; }   /* a rebuild in progress: wait for it */
ok(st && st.built && st.built.points > 0, 'the grid is built (points ' + (st && st.built && st.built.points) + ', ' + (st && st.built && st.built.buildMs) + ' ms)', JSON.stringify(st && st.built));
const P = (await get('/api/hazardgrid/points', {})).j;
ok(P && Array.isArray(P.points) && P.points.length > 200, 'the built grid points are listed (operator check)', P && P.points && P.points.length);
const G = st.grid; const key = (r, c) => r * G.cols + c;
const byI = new Map(P.points.map((p) => [p.i, p])); const assessed = (p) => p && p.v.some((x) => x !== null);
/* edge points: assessed points with a 4-neighbour that is not assessed (the land edge, the frontier, IIOJK) */
const edge = [], inner = [];
for (const p of P.points) { if (!assessed(p)) continue; const r = Math.floor(p.i / G.cols), c = p.i % G.cols;
  const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([a, b]) => a < 0 || b < 0 || a >= G.rows || b >= G.cols || !assessed(byI.get(key(a, b)))); (nb ? edge : inner).push(p); }
const pick = []; const step = (a, n) => { const s = Math.max(1, Math.floor(a.length / n)); for (let i = 0; i < a.length && pick.length < N; i += s) pick.push(a[i]); };
step(edge, Math.min(edge.length, Math.round(N * 0.4))); step(inner, N - pick.length);
ok(pick.length >= 200, 'at least 200 grid points to compare (' + edge.length + ' edge points, ' + inner.length + ' interior)', pick.length);
/* 2 / 3 the same value at each point */
let cmp = 0, diffs = 0, stampSkip = 0, uncountedBad = 0, ruleBad = 0; const D = [];
const NOW = ['flood', 'landslide', 'wind', 'drought', 'glof', 'air'];
const dates = P.dates;
async function one(p) {
  let B = (await get('/api/point?lat=' + p.lat.toFixed(5) + '&lon=' + p.lon.toFixed(5))).j;
  let hc = B && B.parts && B.parts.hazardCount; if (hc && hc.pending) { B = (await get('/api/point?lat=' + p.lat.toFixed(5) + '&lon=' + p.lon.toFixed(5) + '&complete=1')).j; hc = B && B.parts && B.parts.hazardCount; }
  if (!B || B.ok !== true || !hc || !hc.ok) { diffs++; if (D.length < 30) D.push(p.lat + ',' + p.lon + ': no place record (' + (B && B.why) + ')'); return; }
  const stamp = String(B.stamp || '').split('#')[0];
  if (P.stamps && P.stamps.length && !P.stamps.includes(stamp)) { stampSkip++; return; }
  cmp++; const V = hc.v;
  for (let d = 0; d < 4; d++) { const day = V.days.find((x) => x.lead === d); const rec = day ? day.count : null, grid = p.v[d];
    if (day && dates[d] && day.date !== dates[d]) { diffs++; if (D.length < 30) D.push(p.lat + ',' + p.lon + ' day ' + d + ': record date ' + day.date + ' vs grid ' + dates[d]); continue; }
    if (rec !== grid) { diffs++; if (D.length < 30) D.push(p.lat + ',' + p.lon + ' day ' + d + ': grid ' + grid + ' vs place record ' + rec); }
    if (day) { const counted = day.bars.filter((b) => b.counted && b.state === 'level' && b.level >= 2).length; const anyCounted = day.bars.some((b) => b.counted && b.state === 'level');
      if ((anyCounted ? counted : null) !== day.count) uncountedBad++;
      if (day.bars.some((b) => NOW.includes(b.key) && b.state === 'level' && b.level >= 2 && !b.counted)) uncountedBad++;
      if (day.bars.some((b) => b.state !== 'level' && /normal/i.test(b.word))) uncountedBad++; } }
  if (!NOW.every((k) => (V.counted || []).some((x) => x.key === k)) || (V.notCounted || []).some((x) => NOW.includes(x.key))) ruleBad++;
}
for (let i = 0; i < pick.length; i += 4) await Promise.all(pick.slice(i, i + 4).map(one));
ok(cmp >= 200, 'compared at >= 200 grid points under the grid\'s own stamp (' + cmp + ' compared, ' + stampSkip + ' under another stamp)', cmp);
ok(diffs === 0, 'grid count == place record count at every compared point and day (' + (cmp * 4) + ' values, ' + diffs + ' differences)', D.join(' | '));
ok(uncountedBad === 0, 'the count is the counted bars at Moderate or above, including flood, landslide, drought, GLOF and air when they have a level; no "Normal" without a level', uncountedBad);
ok(ruleBad === 0, 'the served rule counts river flood, landslide, wind, drought, glacial-lake flood and air quality', ruleBad);
/* 4 nothing assessed -> null, never 0 */
const probe = [[33.0, 76.0, 'IIOJK'], [24.0, 64.0, 'Arabian Sea'], [34.0, 69.0, 'Afghanistan'], [30.0, 76.5, 'India'], [29.0, 60.95, 'Iran']];
const day0 = (await get('/api/hazardgrid?day=0')).j;
ok(day0 && day0.ok && day0.ready && Array.isArray(day0.v) && day0.v.length === G.rows * G.cols, 'GET /api/hazardgrid?day=0 answers the grid (client view)', day0 && day0.why);
for (const [la, lo, nm] of probe) { const r = Math.round((la - G.s) / G.dLat), c = Math.round((lo - G.w) / G.dLon); const v = day0 && day0.v ? day0.v[key(r, c)] : 'x';
  ok(v === null, nm + ' (' + la + ', ' + lo + '): no value in the grid (uncoloured, never 0)', v); }
const nulls = day0 && day0.v ? day0.v.filter((x) => x === null).length : 0, zeros = day0 && day0.v ? day0.v.filter((x) => x === 0).length : 0;
ok(nulls > 0 && P.points.filter((p) => !assessed(p)).every((p) => p.v.every((x) => x === null)), 'points with nothing assessed are null on every day (' + nulls + ' null, ' + zeros + ' zero)', nulls);
/* 5 the client answer */
const txt = JSON.stringify(Object.fromEntries(Object.entries(day0 || {}).filter(([k]) => k !== 'v')));
ok(!/stamp|slot\d|run[ _-]?id|\.mjs|\.json|91\.17/.test(txt), 'the client answer carries no run id, stamp, build number or code text', txt.slice(0, 400));
ok(day0 && /Moderate or above/.test(day0.threshold) && (day0.counted || []).length >= 1 && day0.scale && day0.scale.min === 0 && day0.scale.max === (day0.counted || []).length, 'the answer names the threshold, the counted hazards and the scale 0 to the number of counted hazards (' + (day0 && day0.scale && day0.scale.max) + ', no fixed 6)', txt.slice(0, 300));
const bad = await get('/api/hazardgrid?day=7'); ok(bad.status === 400, 'a day outside 0-3 is refused (400)', bad.status);
for (const d of [1, 2, 3]) { const x = (await get('/api/hazardgrid?day=' + d)).j; ok(x && x.ready && x.date === dates[d], 'day ' + d + ' is served by its date (' + (x && x.date) + ')', x && x.why); }
done();
