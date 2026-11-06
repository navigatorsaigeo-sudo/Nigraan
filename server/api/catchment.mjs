/* ══ v91.17.30 · P4-4 / P6-6 · HEAVY RAIN OVER THE ASSET'S OWN CATCHMENT, AGAINST ITS OWN RECORD ══
   The pluvial ladder cut at 2 / 7 / 20 / 50 mm/h while the model's wettest hour in a year was
   7.3 mm/h, so three rungs could not be reached, and point rain from one run has little skill.
   For an asset this module asks a question the forecast can answer:

     what is the chance, member by member, that rain averaged over the HydroBASINS level-7
     catchment holding the asset exceeds that catchment's own 99th-percentile day?

   Both sides are the same model family and resolution: the 51-member ECMWF ensemble (0.25°)
   for the forecast, and the ECMWF IFS 0.25° historical forecasts (2024-02 onward, about 950
   days) for the catchment's record. The record is short: the 99th percentile rests on the
   wettest ten or so days, and the result says so. Catchments are sampled at up to nine points
   inside the polygon. HydroBASINS v1c (Lehner & Grill 2013), clipped to Pakistan.
   ══ v91.17.283.27 · items 1 and 5 · THE CATCHMENT'S OWN RECORD IS THE 25-YEAR SATELLITE RECORD ══════════════════════════════════════════
   The ~950-day IFS record (data/catchment-p99.json, its 99th-percentile day resting on the wettest ten days) is replaced by the one
   home of rain rarity, data/rain-return-levels.json: the catchment's own 24-hour return levels (catchment-mean satellite rain, IMERG V07
   Final Run 2001-2025, annual maxima, GEV by L-moments with the regional shape; temporal hold-out passed). The members' catchment-mean
   day totals are area rain, so they are read against the AREA levels (the 24-h gauge factor is a point-to-pixel factor and does not
   apply to a catchment mean). The class reads the share of members reaching the catchment's 2-year day (its median wettest day of a
   year); the 5- and 10-year shares are facts. A catchment with no satellite pixel inside the clip is NOT ASSESSED (never Low).
   The record store and its sampling tag (`samp`) are gone with it: data/catchment-p99.json, where an install still holds one, is not
   read (records with or without `samp` alike), so no IFS percentile can come back.
   The member-share cuts (Monitor / Watch, and the 'likely' word) are read from data/formula-registry.json catchment.memberShareCuts:
   they have no published source or test, so the output is labelled a screening index. */
import { STATE_WORD } from './states.mjs';   /* v91.17.283.37 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function createCatchment(app) {
  const { provider } = app;
  let HB = null;
  const dataDir = () => app.dataDir || join(process.cwd(), 'data');
  function basins() { if (HB === null) { try { HB = JSON.parse(readFileSync(join(dataDir(), 'hybas_pk_lev07.json'), 'utf8')); } catch (_) { HB = false; } } return HB; }
  /* the data files, re-read when they change */
  const FC = new Map();
  const dataFile = (f) => { const p = join(dataDir(), f); try { const m = statSync(p).mtimeMs, c = FC.get(f); if (c && c.m === m) return c.v; const v = JSON.parse(readFileSync(p, 'utf8')); FC.set(f, { m, v }); return v; } catch (_) { return null; } };
  const returnLevels = () => dataFile('rain-return-levels.json');
  const shareCuts = () => { const R = dataFile('formula-registry.json'); const e = R && R.catchment && R.catchment.memberShareCuts; const v = e && e.value;
    return v && [v.Monitor, v.Watch, v.likely].every((x) => typeof x === 'number' && Number.isFinite(x)) ? { ...v, status: e.calibrationStatus || null, basis: e.basis || null } : null; };
  const inRing = (x, y, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; };
  const inPoly = (x, y, g) => { const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    return polys.some(p => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h))); };
  function basinAt(lat, lon) {
    const B = basins(); if (!B) return null;
    for (const f of B.features) if (inPoly(lon, lat, f.geometry)) return f;
    return null;
  }
  /* ══ v283 WS5 · audit C4 · EVEN SAMPLING, ONE COVERAGE RULE ══════════════════════════════════════════════════════════
     The 4 x 4 lattice was walked column by column (x outer) and cut to the first 9 inside points, so in the 169 of 699 level-7
     basins with more than 9 inside points the kept points were the western columns. Every inside lattice point is now kept
     (at most 16), so the sample is spread over the whole polygon. The record mean and the member mean use ONE coverage rule:
     at least half of the sampled points must answer (the record needed half, the forecast accepted one point).
     The lattice size is unchanged (4 x 4): the ensemble grid is 0.25 deg, and the median level-7 basin (1,780 km2) holds
     about 2-3 grid cells, so 16 points already over-sample the grid; the change is which points are kept, not how many.
     (v283.27: the record is the satellite return-level file now; no record is cached here, so no `samp` tag is needed.) */
  const SAMPLING = 'lattice4x4-all-inside-v283';
  function latticeInside(geoms, n) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const g of geoms) { const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map(p => p[0]); rings.forEach(r => r.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); })); }
    const pts = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * (i + 0.5) / n, y = y0 + (y1 - y0) * (j + 0.5) / n; if (geoms.some(g => inPoly(x, y, g))) pts.push([+y.toFixed(3), +x.toFixed(3)]); }
    return pts;
  }
  function samplePoints(f, lat, lon) {
    const pts = latticeInside([f.geometry], 4);
    if (!pts.length) pts.push([lat, lon]);
    return pts;
  }
  /* ══ v283 WS5 · UPSTREAM CATCHMENT (gated OFF) ═══════════════════════════════════════════════════════════════════════
     For river hazards the rain that matters falls on the whole area draining to the asset, not on its own level-7 basin. The
     upstream set is traced through HydroBASINS `down` pointers. NOT SERVED: no held-out test of upstream-rain chance against
     river flow exists in this build (it needs the ensemble re-forecast archive and gauge flows; see WS5 CHANGES.md), so it runs
     only when NIGRAAN_CATCHMENT_UPSTREAM=1 and every answer carries upstream:true. */
  let UP = null;
  function upstreamOf(id) {
    const B = basins(); if (!B) return [];
    if (!UP) { UP = new Map(); for (const f of B.features) { const d = String(f.properties.down); if (!UP.has(d)) UP.set(d, []); UP.get(d).push(f); } }
    const out = [], stack = [String(id)], seen = new Set();
    while (stack.length) { const k = stack.pop(); if (seen.has(k)) continue; seen.add(k); for (const f of (UP.get(k) || [])) { out.push(f); stack.push(String(f.properties.id)); } }
    return out;
  }
  const upstreamOn = () => process.env.NIGRAAN_CATCHMENT_UPSTREAM === '1';
  function samplePointsUpstream(f, lat, lon) {
    const geoms = [f.geometry, ...upstreamOf(f.properties.id).map(u => u.geometry)];
    /* the lattice grows with the drained area so its spacing stays near the 0.25 deg ensemble grid, capped by the request budget
       (16 x 16 points): rain sampled finer than the model grid adds no information */
    const side = Math.sqrt(Math.max(1, Number(f.properties.up) || Number(f.properties.area) || 1)) / 27.8;   /* km per 0.25 deg ~ 27.8 */
    const pts = latticeInside(geoms, Math.min(16, Math.max(4, Math.ceil(side))));
    if (!pts.length) pts.push([lat, lon]);
    return pts;
  }
  const enough = (v, n) => v.length >= Math.ceil(n / 2);
  const list = (b) => Array.isArray(b) ? b : [b];
  const q = (a, p) => { const s = a.filter(v => v != null && isFinite(v)).sort((x, y) => x - y); if (!s.length) return null; const k = (s.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k); return s[lo] + (s[hi] - s[lo]) * (k - lo); };
  const cache = new Map();
  async function heavyRain(lat, lon) {
    const f = basinAt(lat, lon);
    if (!f) return { ok: false, why: 'no HydroBASINS catchment holds this coordinate (offshore or outside the clipped set)' };
    const up = upstreamOn(); const cid = String(f.properties.id), id = cid + (up ? ':up' : '');
    const info = { id: cid, areaKm2: f.properties.area, upstreamKm2: f.properties.up };
    /* the catchment's own record: its 24-hour area return levels (data/rain-return-levels.json) */
    const RL = returnLevels();
    if (!RL || !RL.catchments) return { ok: false, notAssessed: true, catchment: info, why: 'not assessed: the rain return levels (data/rain-return-levels.json) are not in this install' };
    if (up) return { ok: false, notAssessed: true, catchment: info, upstream: true, why: 'not assessed: the return levels are per level-7 catchment; none is held for the whole upstream area' };
    const C = RL.catchments[cid];
    if (!C || C.assessed === false) return { ok: false, notAssessed: true, catchment: info, why: 'not assessed: ' + ((C && C.why) || 'this catchment has no rain return levels') };
    const E = C['24h'], T = RL.returnPeriods || [];
    const at = (yrs) => { const k = T.indexOf(yrs); return E && Array.isArray(E.areaRl) && k >= 0 && Number.isFinite(E.areaRl[k]) ? E.areaRl[k] : null; };
    const L2 = at(2), L5 = at(5), L10 = at(10);
    if (L2 == null) return { ok: false, notAssessed: true, catchment: info, why: 'not assessed: no 24-hour return level for this catchment' };
    /* v91.17.283.37 · launch item A4 (live check 30 Oct): the member-share cuts (Monitor / Watch) have no published source or test, so no class is
       given from them: the answer is the facts (the share of members reaching the 2-year day, the day, the level, the area, the basis), state not tested */
    const hit = cache.get(id); if (hit && Date.now() - hit.at < 3 * 3600e3) return hit.v;
    const pts = samplePoints(f, lat, lon);
    const lats = pts.map(p => p[0]), lons = pts.map(p => p[1]);
    const e = list(await provider.call('ensemble', '/v1/ensemble', { latitude: lats, longitude: lons, models: 'ecmwf_ifs025', daily: 'precipitation_sum', forecast_days: 15, timezone: 'Asia/Karachi' }, { locations: pts.length, timeoutMs: 90000 }));
    const D0 = (e[0] && e[0].daily) || {}, dates = D0.time || [], keys = Object.keys(D0).filter(k => k === 'precipitation_sum' || k.startsWith('precipitation_sum_member'));
    const share = (means, lv) => (lv == null || !means.length ? null : Math.round(100 * means.filter(v => v >= lv).length / means.length));
    const days = dates.map((d, di) => {
      const means = keys.map(k => { const v = e.map(x => ((x && x.daily && x.daily[k]) || [])[di]).filter(y => y != null); return enough(v, pts.length) ? v.reduce((a, b) => a + b, 0) / v.length : null; }).filter(v => v != null);
      return { date: d, members: means.length, chance2y: share(means, L2), chance5y: share(means, L5), chance10y: share(means, L10),
               medianMm: means.length ? Math.round(10 * q(means, 0.5)) / 10 : null, p90Mm: means.length ? Math.round(10 * q(means, 0.9)) / 10 : null };
    });
    const peak = days.reduce((b, d) => (d.chance2y != null && (!b || d.chance2y > b.chance2y)) ? d : b, null);
    if (!peak) return { ok: false, why: 'the ensemble returned no member values for this catchment' };
    const c = peak.chance2y;
    const v = { ok: true, catchment: { ...info, points: pts.length, sampling: SAMPLING, upstream: up, coverageRule: 'at least half of the sampled points, for each member' },
      record: { source: 'satellite rain estimate, catchment mean, wettest day of each year 2001-2025 (' + (E.years || '?') + ' years)', years: E.years ?? null, scale: 'area rain (catchment mean)',
        levelsMm: { 2: L2, 5: L5, 10: L10 }, against: 'the catchment\'s 2-year wettest day (' + L2 + ' mm, its median wettest day of a year)',
        caution: 'the forecast members are read against satellite rain levels; this pairing has not been tested against recorded floods, so the class is a screening index' },
      days, peakDay: peak.date, peakChance: c,
      /* v91.17.283.37 · no class (A4): the cuts are untested; state -5 not tested (states.mjs), the facts stay */
      class: null, level: 'heavy rain', state: 'not_tested', code: -5, word: STATE_WORD['-5'],
      testStatus: 'not tested: no class is given from the share of members (the cuts have no published source or test)',
      screening: true, productType: 'Screening index',
      actRule: 'Act needs an observed flood signal (rising river or observed flood water) in addition to the rain; none is wired for this catchment, so this level stops at Watch.',
      basis: 'share of ' + (peak.members || 51) + ' ECMWF members whose catchment-mean daily rain reaches the catchment\'s own 2-year wettest day (satellite record 2001-2025), highest over days 0-14' };
    cache.set(id, { at: Date.now(), v });
    return v;
  }
  return { heavyRain, basinAt, samplePoints, samplePointsUpstream, upstreamOf };
}
