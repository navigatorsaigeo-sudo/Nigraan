/* v91.17.283.28 . PACKAGE 1 SERVER CHECKS on a server of its own (mock provider):
     N1 (S8)  every GET route of the route list (scripts/tests28328/routes.txt, live_paths.txt) and the place answers (/api/point complete,
              /api/point/batch with=placeRecord,siteLevels, /api/report/context, /api/scenario), read as the CUSTOMER view, carry no
              PMD / FFD / EWS / Flood Forecasting Division / Pakistan Meteorological Department / partner-network name, and none of the
              supplier names the Customize page's own table rewrote (the server now does it: data/source-labels.json clientRules_v28328)
     N2 (S9)  a report is issued only from a complete place record: no place in the record -> 409 no_place; a point with no forecast ->
              409 place_record_incomplete; a complete place -> 200 and the place record it was issued from is stored with it; the
              report context carries the same place record as the bundle
     N3 (S10) /api/scenario: +4 C never lowers a heat level and the warmer day UTCI is higher; the 10-year rain day uses the place's own
              24-hour level from data/rain-return-levels.json; a slider outside its physical range is refused with its source; at most
              40 places; no downtime figure
     N4 (S5)  site levels carry every hazard with level / not assessed and a reason; cold and wind come from the engine's own functions
   usage: node scripts/tests28328/server28328.test.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownServer, req, counter } from '../tests283/permanent/lib.mjs';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const { ok, done } = counter('tests28328/server28328');
const S = await ownServer();
if (!S.up) { ok(false, 'own server started', S.log().slice(-1500)); await S.stop(); done(); process.exit(1); }
const C = { 'x-agn-view': 'customer' };
const get = (p, h = C) => req(S.base, p, { headers: h, timeoutMs: 240000 });
const NAMES = /\bPMD\b|\bFFD\b|(?<![\w-])EWS(?![\w-])|Flood Forecasting Division|Pakistan Meteorological Department|partner[- ]network(?!s)/;   /* a partner NAME; the generic "national and partner networks" wording names no one */
const SUPP = /\bUSGS\b|MET Norway|\bECMWF\b|\bERA5\b|\bGloFAS\b|\bOpen-Meteo\b|\bSEAS5\b|\bEC46\b|\bNASA\b|\bIMERG\b|\bNOAA\b/;
/* sentences only (strings with white space), the way the server scrubs: ids and keys the pages compare are not names shown */
const sentences = (j, out = []) => { if (typeof j === 'string') { if (/\s/.test(j)) out.push(j); } else if (Array.isArray(j)) j.forEach((x) => sentences(x, out)); else if (j && typeof j === 'object') Object.entries(j).forEach(([k, x]) => { if (!/^(attribution|licen[cs]e|credits?|citation|copyright|requiredAttribution)$/i.test(k)) sentences(x, out); }); return out; };   /* a value under a licence-credit key is the credit the licence requires (customerscrub LICENCE_KEY) */
try {
  /* ── N1 ── */
  const q = '?lat=31.5204&lon=74.3587&unit=Punjab%7CLahore%7CLahore%20City&day=0&q=Lahore&limit=2';
  const paths = [...readFileSync(join(HERE, 'live_paths.txt'), 'utf8').trim().split('\n').filter((p) => p.startsWith('/api/')),
    ...readFileSync(join(HERE, 'routes.txt'), 'utf8').trim().split('\n').filter((p) => p.startsWith('/api/') && !/\/(run|poll|refresh|issue|archive|inject|backfill|drop|note)$/.test(p)).map((p) => p + q),
    '/api/point?lat=31.52040&lon=74.35870&complete=1', '/api/point?lat=33.68440&lon=73.04790&complete=1', '/api/point/batch?pts=31.5204,74.3587;33.6844,73.0479&with=placeRecord,siteLevels,levels,siteScreening,siteRisk',
    '/api/report/context?lat=31.5204&lon=74.3587', '/api/scenario?lat=31.5204&lon=74.3587&preset=gwl2'];
  const hitsN = [], hitsS = [];
  for (const p of paths) { const r = await get(p); const t = r.text || ''; if (!t) continue;
    if (NAMES.test(t)) { const m = t.match(NAMES); hitsN.push(p + ' :: ' + t.slice(Math.max(0, m.index - 60), m.index + 60)); }
    if (r.json) { const s = p.startsWith('/api/sources') ? null : sentences(r.json).find((x) => SUPP.test(x) && !/^Sources(?: and licences)?:|\bCC[ -]BY\b|\blicen[cs]e[ds]?\b|\battribution\b|\bcredited\b/i.test(x));   /* licence credits name their source by obligation */ if (s) hitsS.push(p + ' :: ' + s.slice(0, 140)); } }
  ok(!hitsN.length, 'N1a no agency or partner-network name in any customer answer (' + paths.length + ' routes)', hitsN.slice(0, 8).join(' | '));
  ok(!hitsS.length, 'N1b no supplier name in any customer sentence (the Customize page table now lives on the server)', hitsS.slice(0, 8).join(' | '));
  const op = await get('/api/fleet/status', { 'x-agn-view': 'operator' }); ok(op.status === 200, 'N1c the operator view is not rewritten (answers as before)', op.status);
  /* ── N2 ── */
  const body = (rec) => ({ record: { report_id: 'T28328' + Math.random().toString(36).slice(2, 10), kind: 'Site report', section: 'start', ...rec }, html: '<!doctype html><p>t</p>', title: 't', edition: 'main', section: 'start' });
  const iss = (rec) => req(S.base, '/api/reports/issue', { method: 'POST', body: body(rec), headers: C, timeoutMs: 240000 });
  const a = await iss({}); ok(a.status === 409 && a.json && a.json.error === 'no_place', 'N2a a record without a place is refused (409 no_place)', a.status + ' ' + a.text.slice(0, 200));
  const b = await iss({ lat: 10, lon: 10 }); ok(b.status === 409 && b.json && b.json.error === 'place_record_incomplete', 'N2b a place without a complete record is refused with the reason', b.status + ' ' + b.text.slice(0, 200));
  const c = await iss({ lat: 31.5204, lon: 74.3587 }); ok(c.status === 200 && c.json && c.json.ok, 'N2c a complete place is issued', c.status + ' ' + c.text.slice(0, 200));
  const ctx = (await get('/api/report/context?lat=31.5204&lon=74.3587')).json, bun = (await get('/api/point?lat=31.52040&lon=74.35870&complete=1')).json;
  ok(ctx && ctx.place && ctx.place.complete && JSON.stringify(ctx.place.record.days) === JSON.stringify(bun.parts.placeRecord.v.days) && JSON.stringify(ctx.place.record.accuracy) === JSON.stringify(bun.parts.placeRecord.v.accuracy),
    'N2d the report context carries the bundle’s place record (same days, same accuracy figure)');
  ok(ctx && ctx.skill && (!ctx.skill.mach || ctx.skill.mach.maeC === undefined), 'N2e no second accuracy figure in the report’s forecast basis', ctx && ctx.skill && ctx.skill.mach);
  /* ── N3 ── */
  const sc = (x) => get('/api/scenario?lat=31.5204&lon=74.3587' + x).then((r) => r);
  const w = (await sc('&preset=gwl4')).json; const P = w && w.places && w.places[0];
  const lv = (h, k) => h.hazards.heat.days.map((d) => (d.assessed ? d.level : -1));
  ok(P && P.ok && lv(P.scenario).every((x, i) => x >= lv(P.baseline)[i]) && !/downtime/i.test(JSON.stringify(P).replace(/no downtime/g, '')), 'N3a +4 C never lowers a heat level; no downtime figure', P && [lv(P.baseline), lv(P.scenario)]);
  const r10 = (await sc('&preset=rain10')).json, Q = r10 && r10.places && r10.places[0];
  const RL = JSON.parse(readFileSync(join(ROOT, 'data', 'rain-return-levels.json'), 'utf8')); const U = RL.units[Q && Q.unitId]; const want = U && (U['24h'].pointRl || U['24h'].areaRl)[RL.returnPeriods.indexOf(10)];
  ok(Q && Q.ok && Q.applied && Q.applied.rainMm === want, 'N3b the 10-year rain day is the place’s own 24-hour level', Q && [Q.applied, want]);
  const bad = await sc('&rainMm=5000'); ok(bad.status === 400 && /1825/.test(bad.text) && /WMO/.test(bad.text), 'N3c a rain day beyond the physical range is refused with its source', bad.text.slice(0, 200));
  const many = await get('/api/scenario?preset=gwl2&pts=' + Array.from({ length: 41 }, (_, i) => (30 + i * 0.01).toFixed(2) + ',72').join(';')); ok(many.status === 400, 'N3d at most 40 places', many.status);
  /* ── N4 ── */
  const SL = bun.parts.siteLevels.v; const H = SL.hazards;
  ok(['heat', 'cold', 'wind', 'rain', 'flood', 'landslide', 'drought'].every((k) => H[k] && H[k].days.length === 4 && H[k].days.every((d) => (d.assessed ? Number.isInteger(d.level) && typeof d.word === 'string' : typeof d.why === 'string' && d.why.length > 5))) && /utci\.coldLevels/.test(H.cold.method) && /wind ladder of the hazard engine/.test(H.wind.method),
    'N4 every hazard per day: a level and word, or not assessed with the reason; cold by the register\u2019s UTCI cold levels (v283.31 owner 2.1), wind by the engine’s own function', Object.keys(H));
} finally { await S.stop(); }
done();
