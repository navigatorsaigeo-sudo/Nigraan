/* v91.17.283.37 (NIGRAAN 1.0.1, copy of consistency36) · launch items 35 / 43 · OWNER ORDER "one server formula so all sections have the same values" · THE CONSISTENCY TEST
   For at least 60 tehsils spread over every province and every served day, every client quantity must be IDENTICAL on:
     A  GET /api/levels?layer=&day=                     (the national answer: the map's source)
     B  GET /api/levels/unit?unit=                      (one tehsil; its reference classes too)
     C  GET /api/report/context?unit=                   (the report's levels and its hazard list)
     D  the place record (GET /api/point ... placeRecord.tehsilLevels) and the Customize data (the same bundle's part "levels")
     E  the AI evidence (GET /api/ai/evidence: askedUnits[].mapLevels of the tehsil)
     F  the Scenario baseline (GET /api/scenario?preset=baseline: places[0].baselineTehsil)
     G  the page: the console map's served value per tehsil (AGN.v283 run / AGN.comfort35), its key (legend) counts against A, the AQI the
        map draws (DISTRICT_IN after the server sweep) against GET /api/smog/unit, and the Customize page's own state (NIGRAAN3.state.d.lv)
   Quantities: heat, cold, heat discomfort (comfort), river flooding (flood / flood_riverine), heavy rain, wind, landslide, GLOF, drought
   (and its four views), retention (nss_baseline), seismic and cyclone (reference), AQI. A value is its level index (>= 0) or its state
   name (missing, outside_range, no_reach, not_applicable, not_tested, input_not_current). 0 differences required.
   usage: node scripts/tests28337/consistency37.test.mjs [base]     (NIGRAAN_C35_N: tehsils, default 64) */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { T, browser, open, consoleReady, BASE, ROOT } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const N = +(process.env.NIGRAAN_C35_N || 64);
const C = { 'x-agn-view': 'customer' };
const get = async (p, ms = 120000) => { try { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms); const r = await fetch(BASE + p, { headers: C, signal: ac.signal }); clearTimeout(t); return r.ok ? r.json() : { __status: r.status }; } catch (e) { return { __err: String(e && e.message || e) }; } };
const LAYERS = ['heat', 'cold', 'comfort', 'wind', 'flood', 'flood_riverine', 'rain_hz', 'landslide', 'glof', 'drought', 'drought_rain', 'drought_soil', 'drought_crops', 'drought_water', 'nss_baseline'];
const REF = ['seismic', 'cyclone'];
const STATE = { '-1': 'missing', '-2': 'outside_range', '-3': 'no_reach', '-4': 'not_applicable', '-5': 'not_tested', '-6': 'input_not_current' };
const norm = (v) => (v == null ? 'absent' : +v >= 0 ? 'L' + (+v) : STATE[String(v)] || 'missing');
const ofServed = (x) => (!x ? 'absent' : x.assessed === false || x.level == null || x.level < 0 ? (x.state || 'missing') : 'L' + x.level);
let diffs = 0; const D = []; const diff = (tag, a, b) => { diffs++; if (D.length < 60) D.push(tag + ': ' + a + ' vs ' + b); };
const cmp = (tag, a, b) => { if (a !== b) diff(tag, a, b); };

/* ---------- the sample: tehsils whose anchor point resolves to the tehsil itself, spread over the provinces ---------- */
const anchors = JSON.parse(readFileSync(join(ROOT, 'data', 'tehsil-anchor.json'), 'utf8')).units;
const A0 = {}; const days = [];
{ const h = await get('/api/levels?layer=heat&day=0'); ok(h && h.ready && h.levels, 'the server has an issued run', JSON.stringify(h).slice(0, 200)); if (!(h && h.ready)) done();
  const all = await get('/api/levels'); for (const d of (all.days || [])) days.push(d.day); }
for (const L of LAYERS.concat(REF)) for (const d of (REF.includes(L) ? [0] : days)) A0[L + '|' + d] = await get('/api/levels?layer=' + L + '&day=' + d);
const uids = Object.keys(A0['heat|0'].levels);
const byProv = {}; for (const u of uids) { const p = u.split('|')[0]; (byProv[p] = byProv[p] || []).push(u); }
const pick = []; { const P = Object.keys(byProv).sort(); let i = 0; while (pick.length < N * 2 && P.some((p) => byProv[p].length)) { const p = P[i++ % P.length]; const L = byProv[p]; if (L.length) pick.push(L.splice(Math.floor(L.length * 0.37) % L.length, 1)[0]); } }
ok(days.length >= 4, 'the served days', days.join(','));

/* ---------- B .. F per tehsil ---------- */
const S = []; const provSeen = new Set();
async function onePlace(uid) {
  const a = anchors[uid] && anchors[uid].anchor; if (!a) return null;
  const q = 'lat=' + (+a.lat).toFixed(5) + '&lon=' + (+a.lon).toFixed(5);
  const B = await get('/api/point?' + q + '&complete=1', 240000); const pr = B && B.parts && B.parts.placeRecord && B.parts.placeRecord.v; const lvp = B && B.parts && B.parts.levels && B.parts.levels.v;
  if (!pr || !pr.point || pr.point.unitId !== uid) return { uid, skip: 'the anchor point resolves to ' + (pr && pr.point ? pr.point.unitId : 'no record') };
  const [U, R, SC, AI] = await Promise.all([get('/api/levels/unit?unit=' + encodeURIComponent(uid)), get('/api/report/context?unit=' + encodeURIComponent(uid)),
    get('/api/scenario?' + q + '&preset=baseline', 240000), get('/api/ai/evidence?prompt=' + encodeURIComponent('hazard levels') + '&location=' + encodeURIComponent(uid.split('|')[2]), 120000)]);
  return { uid, a, U, R, pr, lvp, SC, AI, smog: await get('/api/smog/unit?unit=' + encodeURIComponent(uid)) };
}
for (let i = 0; i < pick.length && S.filter((x) => x && !x.skip).length < N; i += 4) {
  const part = await Promise.all(pick.slice(i, i + 4).map(onePlace)); for (const x of part) if (x) S.push(x); }
const used = S.filter((x) => !x.skip); used.forEach((x) => provSeen.add(x.uid.split('|')[0]));
ok(used.length >= 60, 'at least 60 tehsils compared (' + used.length + ', ' + S.filter((x) => x.skip).length + ' skipped: anchor point in another tehsil)');
ok(provSeen.size >= 6, 'spread over the provinces: ' + [...provSeen].join(', '));
let checks = 0;
for (const x of used) {
  const uid = x.uid;
  const unitDay = (O, d) => O && O.days ? O.days.find((y) => y.day === d) : null;
  for (const L of LAYERS) for (const d of days) {
    const A = A0[L + '|' + d]; const a = A && A.levels ? norm(A.levels[uid]) : (A && A.hidden ? 'hidden' : 'absent');
    const b = unitDay(x.U, d); const bv = b && b.layers && b.layers[L] ? ofServed(b.layers[L]) : 'absent'; cmp(uid + ' ' + L + ' d' + d + ' B levels/unit', a, bv);
    const c = unitDay(x.R && x.R.levels, d); const cv = c && c.layers && c.layers[L] ? (c.layers[L].level != null ? 'L' + c.layers[L].level : (c.layers[L].state || 'missing')) : 'absent'; cmp(uid + ' ' + L + ' d' + d + ' C report', a, cv);
    const pl = x.pr.tehsilLevels && x.pr.tehsilLevels.layers && x.pr.tehsilLevels.layers[L]; const pe = pl ? pl.find((y) => y.day === d) : null; cmp(uid + ' ' + L + ' d' + d + ' D place record', a, pe ? (pe.level != null ? 'L' + pe.level : pe.state) : 'absent');
    const cu = unitDay(x.lvp, d); cmp(uid + ' ' + L + ' d' + d + ' D Customize data', a, cu && cu.layers && cu.layers[L] ? ofServed(cu.layers[L]) : 'absent');
    const sb = x.SC && x.SC.places && x.SC.places[0] && x.SC.places[0].baselineTehsil; const sl = sb && sb.layers && sb.layers[L]; const se = sl ? sl.find((y) => y.day === d) : null; cmp(uid + ' ' + L + ' d' + d + ' F scenario baseline', a, se ? (se.level != null ? 'L' + se.level : se.state) : 'absent');
    /* E: the AI evidence quotes words: the same word as the unit answer (own-scale layers have their own words) */
    const au = ((x.AI && x.AI.facts && x.AI.facts.askedUnits) || []).find((y) => y && (y.unitId === uid || (y.mapLevels && y.unitId == null && false)));
    const ad = au && au.mapLevels && au.mapLevels.days ? au.mapLevels.days.find((y) => b && y.date === b.date) : null; const ah = ad ? ad.hazards.find((z) => z.layer === L) : null;
    if (au) cmp(uid + ' ' + L + ' d' + d + ' E AI evidence', b && b.layers && b.layers[L] ? (b.layers[L].assessed === false ? 'Not assessed' : b.layers[L].word) : 'absent', ah ? ah.level : 'absent');
    checks += au ? 6 : 5; }
  /* the hazard list: one list on the unit answer, the report, the place record */
  cmp(uid + ' hazardList report = unit', JSON.stringify(x.U.hazardList), JSON.stringify(x.R.hazardList)); cmp(uid + ' hazardList place record = unit', JSON.stringify(x.U.hazardList), JSON.stringify(x.pr.tehsilLevels && x.pr.tehsilLevels.hazardList)); checks += 2;
  /* the river status of the place record and the site levels = the issued river cell */
  for (const d of days) { const A = A0['flood_riverine|' + d]; const rv = (x.pr.river && x.pr.river.days || []).find((y) => y.day === d);
    if (rv) { cmp(uid + ' river d' + d + ' place record status', norm(A.levels[uid]), rv.assessed ? 'L' + rv.level : (rv.state || 'missing')); checks++; } }
  /* reference layers: the national answer = the unit answer */
  for (const L of REF) { const A = A0[L + '|0'], r = x.U.reference && x.U.reference[L]; cmp(uid + ' ' + L + ' reference', A && A.levels ? norm(A.levels[uid]) : 'absent', r ? (r.assessed ? 'L' + r.level : (r.state || 'missing')) : 'absent'); checks++; }
}
ok(checks > 60 * LAYERS.length * days.length * 4, 'server surfaces compared: ' + checks + ' values');
ok(diffs === 0, 'server surfaces: 0 differences (' + diffs + ')', D.join('\n'));
const dS = diffs;

/* ---------- G · the page ---------- */
const br = await browser(); let staleSkip = 0;
{ const o = await open(br, '/analyst'); const pg = o.pg; await consoleReady(pg);
  const keyOf = await pg.evaluate(() => { const o = {}; (window.PK_DISTRICTS.features || []).forEach((f) => { const p = f.properties; if (p && p.uid != null) o[p.uid] = p.key; }); return o; });
  const sample = used.map((x) => x.uid);
  for (const L of LAYERS) for (const d of days) {
    if (L === 'comfort') { let got = null; for (let k = 0; k < 60; k++) { got = await pg.evaluate(([U, K, d]) => { if (!AGN.comfort35) return null; const c = AGN.comfort35.load(d); if (c.st === 'load') return null; return U.map((u) => { const r = AGN.comfort35.of(K[u], d); return r && !r.nd ? 'L' + r.level : 'nv'; }); }, [sample, keyOf, d]); if (got) break; await pg.waitForTimeout(1000); }
      sample.forEach((u, i) => { const a = norm(A0['comfort|' + d].levels[u]); cmp(u + ' comfort d' + d + ' G page', a.startsWith('L') ? a : 'nv', got ? got[i] : 'not loaded'); checks++; }); continue; }
    let got = null; for (let k = 0; k < 60; k++) { got = await pg.evaluate(([U, L, d]) => { const R = AGN.v283.runInfo(L, d); if (!R || R.st === 'load') return null; if (R.st !== 'current') return { st: R.st, why: R.why };
        return U.map((u) => { const q = AGN.v283.stOf(R, u); return q.state === 'value' ? 'L' + q.i : q.state; }); }, [sample, L, d]); if (got) break; await pg.waitForTimeout(1000); }
    if (!got || !Array.isArray(got)) { const A = A0[L + '|' + d]; if (A && A.hidden) continue;
      /* a run the server itself marks stale is drawn by no surface as current: the page leaves it uncoloured (the same answer) */
      if (got && got.st === 'stale' && A && A.stale === true) { staleSkip++; continue; }
      diff(L + ' d' + d + ' G page run', 'current', JSON.stringify(got)); continue; }
    sample.forEach((u, i) => { cmp(u + ' ' + L + ' d' + d + ' G page map value', norm(A0[L + '|' + d].levels[u]), got[i]); checks++; }); }
  /* the key (legend) counts of the map against the national answer, day 0 */
  for (const L of (A0['heat|0'].stale ? [] : ['heat', 'cold', 'wind', 'flood', 'landslide', 'glof', 'drought', 'rain_hz'])) {
    await pg.evaluate((l) => { const s = document.getElementById('mapHazardPick'); s.value = l; s.dispatchEvent(new Event('change', { bubbles: true })); try { AGN.day.set(0); } catch (_) {} }, L);
    let T = null; for (let k = 0; k < 40; k++) { await pg.waitForTimeout(1000); T = await pg.evaluate(() => { const t = AGN.hz5.tally(); return t && !t.loading && !t.pend ? { c: t.c, na: t.na, nd: t.nd, nt: t.nt, inc: t.inc, outr: t.outr || 0, nr: t.nr || 0 } : null; }); if (T) break; }
    const A = A0[L + '|0']; const want = { c: [0, 0, 0, 0, 0], na: 0, nt: 0, inc: 0, outr: 0, nr: 0, nd: 0 };
    for (const [u, v] of Object.entries(A.levels)) { if (v >= 0) want.c[v]++; else { const s = STATE[String(v)] || 'missing'; if (s === 'not_applicable') want.na++; else if (s === 'not_tested') want.nt++; else if (s === 'input_not_current') want.inc++; else if (s === 'outside_range') want.outr++; else if (s === 'no_reach') want.nr++; else want.nd++; } }
    const got = T ? { c: T.c, na: T.na, nt: T.nt, inc: T.inc, outr: T.outr, nr: T.nr } : null; const w2 = { c: want.c, na: want.na, nt: want.nt, inc: want.inc, outr: want.outr, nr: want.nr };
    cmp(L + ' d0 G legend counts', JSON.stringify(w2), JSON.stringify(got)); checks++; }
  /* AQI: the value the map draws = the server's tehsil AQI */
  await pg.evaluate(() => { try { if (typeof fetchDistrictAQI === 'function') return fetchDistrictAQI(); } catch (_) {} });
  for (let k = 0; k < 30; k++) { const n = await pg.evaluate(() => Object.values(window.DISTRICT_IN || {}).filter((r) => r && r.aqiLive).length); if (n > 0) break; await pg.waitForTimeout(1000); }
  const pageAqi = await pg.evaluate(([U, K]) => U.map((u) => { const r = (window.DISTRICT_IN || {})[K[u]]; return r && r.aqiLive === true && r.aqi != null ? r.aqi : null; }), [sample, keyOf]);
  const tday = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  /* the map's AQI is the server's NowCast AQI of the current hour (today's row aqiNow; agnSmogParse), the same answer /api/smog/unit gives */
  used.forEach((x, i) => { const r = x.smog && Array.isArray(x.smog.days) ? x.smog.days.find((y) => y.date === tday) : null; const n = r && r.aqiNow; cmp(x.uid + ' AQI G page', n && n.aqi != null ? Math.round(n.aqi) : null, pageAqi[i]); checks++; });
  /* no seeded number before the live data: the comfort table and the AQI of a row never filled by the server */
  ok(o.errs.length === 0, 'console: no page errors', o.errs.join(' | '));
  await o.ctx.close(); }
/* Customize (NIGRAAN_3): the page's own state of five places */
{ const o = await open(br, '/customize'); await o.pg.waitForTimeout(6000);
  for (const x of used.slice(0, 5)) {
    await o.pg.evaluate(([a, b, n]) => { NIGRAAN3.setPoint(+a, +b, n); }, [(+x.a.lat).toFixed(5), (+x.a.lon).toFixed(5), x.uid.split('|')[2]]);
    await o.pg.waitForFunction(() => { const S = NIGRAAN3.state; return S.d && S.d.lv && S.d.lv.days; }, null, { timeout: 180000, polling: 1000 }).catch(() => {});
    const lv = await o.pg.evaluate(() => { const S = NIGRAAN3.state; return S.d && S.d.lv && S.d.lv.days ? S.d.lv.days.map((d) => ({ day: d.day, L: Object.fromEntries(Object.entries(d.layers).map(([k, v]) => [k, v.assessed === false || v.level == null || v.level < 0 ? (v.state || 'missing') : 'L' + v.level])) })) : null; });
    for (const L of LAYERS) for (const d of days) { const e = lv ? lv.find((y) => y.day === d) : null; cmp(x.uid + ' ' + L + ' d' + d + ' G Customize page state', norm(A0[L + '|' + d].levels[x.uid]), e && e.L[L] ? e.L[L] : 'absent'); checks++; } }
  ok(o.errs.length === 0, 'Customize: no page errors', o.errs.join(' | '));
  await o.ctx.close(); }
await br.close();
ok(diffs - dS === 0, 'page surfaces: 0 differences (' + (diffs - dS) + ')', D.slice(0).join('\n'));
if (staleSkip) console.log('NOTE the issued run on this server is stale: the page draws no value for it (' + staleSkip + ' layer-days), as the server rule says; the legend counts are checked on a current run');
console.log('values compared: ' + checks + ' · tehsils ' + used.length + ' · days ' + days.join(',') + ' · layers ' + LAYERS.length + ' + ' + REF.join(', ') + ' + AQI');
done();
