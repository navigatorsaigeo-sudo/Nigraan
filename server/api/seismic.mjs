/* ══ v91.17.98 · SEISMIC DESIGN VALUES FOR A PLACE ════════════════════════════════════════════════════════════════════
   CEO 30 Sep: "fill all districts from the official BCP SP-2007 Table 2.2 (tehsil level, through a crosswalk), store it as
   bcp2007_zone, add the BCP 2021 layer separately (Ss, S1, site class, SDS, SD1, SDC) from the actual latitude/longitude".
   Two code layers, never mixed:
     bcp2007   legacy categorical zone 1 | 2A | 2B | 3 | 4, Building Code of Pakistan Seismic Provisions 2007, Table 2.2
               (data/seismic-bcp2007.json: the tehsil the point falls in, else its district)
     bcp2021   mapped MCE spectral accelerations Ss and S1, Building Code of Pakistan 2021, Section 1613.2.1, Figures
               1613.2.1(1) and (2) (2 % in 50 years), digitised to a 0.02-deg grid (data/seismic-bcp2021.json). The map is
               banded; the served value is the band's upper edge (the code allows interpolation or "conservatively the higher").
               Site coefficients Fa / Fv: Tables 1613.2.3(1)/(2) with straight-line interpolation; SMS = Fa Ss, SM1 = Fv S1;
               SDS = 2/3 SMS, SD1 = 2/3 SM1; SDC: Tables 1613.2.5(1)/(2), the more severe; S1 >= 0.75 -> E (F for Risk IV).
               Site class unknown -> D (Section 1613.2.2 default, Fa not less than 1.2) and SAID SO; risk category unknown -> II.
   GET /api/seismic/point?lat=&lon=[&siteClass=A..F][&risk=I|II|III|IV]
   GET /api/seismic/units      the per-district / per-tehsil records the map layer uses (data/seismic-units.json)
   Screening and code-lookup only: a design needs the engineer of record and, where the code asks, a site-specific study. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FA = { A: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8], B: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9], C: [1.3, 1.3, 1.2, 1.2, 1.2, 1.2],
             D: [1.6, 1.4, 1.2, 1.1, 1.0, 1.0], E: [2.4, 1.7, 1.3, null, null, null] };
const FA_X = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5];
const FV = { A: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8], B: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8], C: [1.5, 1.5, 1.5, 1.5, 1.5, 1.4],
             D: [2.4, 2.2, 2.0, 1.9, 1.8, 1.7], E: [4.2, 3.3, 2.8, 2.4, 2.2, 2.0] };
const FV_X = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
const SDC_S = [[0.167, 'A', 'A', 'A'], [0.33, 'B', 'B', 'C'], [0.50, 'C', 'C', 'D'], [Infinity, 'D', 'D', 'D']];
const SDC_1 = [[0.067, 'A', 'A', 'A'], [0.133, 'B', 'B', 'C'], [0.20, 'C', 'C', 'D'], [Infinity, 'D', 'D', 'D']];
const ORD = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };

function interp(xs, ys, x) {
  if (ys.some(v => v == null)) {           /* Note b: site-specific (ASCE 7 11.4.8) above the last tabulated value */
    const k = ys.findIndex(v => v == null); if (x >= xs[k - 1] + 1e-9 && x > xs[k - 1]) return null;
  }
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) { if (ys[i] == null) return null; return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]); }
  return ys[ys.length - 1];
}
const r3 = v => v == null ? null : Math.round(v * 1000) / 1000;

export function designValues(ss, s1, siteClass, risk) {
  /* v91.17.283.3 · audit C7 · the Fa >= 1.2 floor belongs to the DEFAULT Site Class D (BCP 2021 1613.2.3: class not determined); a
     site class D given from a site investigation takes the table value */
  const defaulted = siteClass == null || String(siteClass).trim() === '';
  const sc = String(siteClass || 'D').toUpperCase(), rc = String(risk || 'II').toUpperCase();
  const col = rc === 'IV' ? 3 : rc === 'III' ? 2 : 1;
  const notes = [];
  if (sc === 'F') return { siteClass: sc, fa: null, fv: null, sds: null, sd1: null, sdc: null, notes: ['Site Class F: site response analysis required (ASCE 7 Section 11.4.8); no code-table value.'] };
  let fa = interp(FA_X, FA[sc], ss), fv = interp(FV_X, FV[sc], s1);
  if (fa == null) notes.push('Site Class E with Ss >= 1.0: Fa by site-specific procedure (ASCE 7 11.4.8).');
  if (defaulted && sc === 'D' && fa != null && fa < 1.2) { fa = 1.2; notes.push('Default Site Class D: Fa not less than 1.2 (BCP 2021 1613.2.3).'); }
  if ((sc === 'D' || sc === 'E') && s1 >= 0.2) notes.push('Site Class ' + sc + ' with S1 >= 0.2: see the site-specific ground motion requirement of ASCE 7 Section 11.4.8 (Table 1613.2.3(2) note c).');
  const sms = fa == null ? null : fa * ss, sm1 = fv == null ? null : fv * s1;
  const sds = sms == null ? null : (2 / 3) * Math.max(sms, sm1 || 0), sd1 = sm1 == null ? null : (2 / 3) * sm1;
  const sdsForSdc = sms == null ? null : (2 / 3) * sms;
  let sdc = null;
  if (s1 >= 0.75) sdc = rc === 'IV' ? 'F' : 'E';
  else if (sdsForSdc != null && sd1 != null) {
    const a = SDC_S.find(r => sdsForSdc < r[0])[col], b = SDC_1.find(r => sd1 < r[0])[col];
    sdc = ORD[a] >= ORD[b] ? a : b;
  }
  return { siteClass: sc, riskCategory: rc, fa: r3(fa), fv: r3(fv), sms: r3(sms), sm1: r3(sm1), sds: r3(sds), sd1: r3(sd1), sdc, notes };
}

export function createSeismic(app, dataDir) {
  const J = f => { try { return JSON.parse(readFileSync(join(dataDir, f), 'utf8')); } catch { return null; } };
  let Z = null, G = null, U = null, polys = null, grids = null;
  function load() {
    if (Z) return;
    Z = J('seismic-bcp2007.json'); G = J('seismic-bcp2021.json'); U = J('seismic-units.json');
    const T = J('pk-tehsils.json'); polys = [];
    for (const f of (T && T.features) || []) {
      const p = f.properties; if (/^Indian/.test(p.province)) continue;
      const g = f.geometry, cs = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
      for (const poly of cs) {
        const ring = poly[0]; let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
        for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        polys.push({ p, ring, bb: [x0, y0, x1, y1] });
      }
    }
    grids = {};
    if (G) for (const k of ['ss', 's1']) {
      const dec = rows => rows.map(r => { const a = new Uint8Array(G.grid.nx); let i = 0; for (const [v, n] of r) { a.fill(v, i, i + n); i += n; } return a; });
      grids[k] = { v: dec(G.maps[k].rows), f: dec(G.maps[k].filledRows || []) };
    }
  }
  const inRing = (x, y, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; };
  function tehsilAt(lat, lon) {
    const at = (la, lo) => { for (const P of polys) { const b = P.bb; if (lo < b[0] || lo > b[2] || la < b[1] || la > b[3]) continue; if (inRing(lo, la, P.ring)) return P.p; } return null; };
    const hit = at(lat, lon); if (hit) return hit;
    /* a coastal or border point just outside the tehsil polygons (the boundary file is generalised): the nearest tehsil
       within ~5 km, searched on rings of 0.015 deg */
    for (let r = 1; r <= 3; r++) for (let k = 0; k < 8 * r; k++) {
      const a = 2 * Math.PI * k / (8 * r), h = at(lat + 0.015 * r * Math.sin(a), lon + 0.015 * r * Math.cos(a)); if (h) return Object.assign({ nearestWithinKm: Math.round(1.67 * r * 10) / 10 }, h);
    }
    return null;
  }
  function cellAt(k, lat, lon) {
    const g = G.grid, M = G.maps[k]; const i0 = Math.floor((g.lat1 - lat) / g.step), j0 = Math.floor((lon - g.lon0) / g.step);
    /* a coastal or border point whose own cell falls outside the digitised land: the nearest land cell within 3 cells (~6 km) */
    for (let r = 0; r <= 3; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= g.ny || j >= g.nx) continue;
      const v = grids[k].v[i][j]; if (v === 255) continue;
      const band = M.bands[v];
      return { cls: M.classes[v], lower: band[0], upper: band[1], openTop: band[1] == null, offsetCells: r,
               fromMapLineOrLabel: !!(grids[k].f[i] && grids[k].f[i][j]) };
    }
    return null;
  }
  function point(lat, lon, siteClass, risk) {
    load();
    const out = { ok: true, lat, lon };
    const t = tehsilAt(lat, lon);
    if (!t) return { ok: false, why: 'the point is outside Pakistan\'s mapped tehsils (or in IIOJK, which is not scored)' };
    const tz = Z && Z.tehsils[t.uid], dz = Z && Z.districts[t.district];
    out.place = { tehsil: t.tehsil, district: t.district, province: t.province, ...(t.nearestWithinKm ? { note: 'the point is just outside the generalised tehsil boundary; the nearest tehsil (within ' + t.nearestWithinKm + ' km) is used' } : {}) };
    out.bcp2007 = tz && tz.bcp2007_zone ? {
      zone: tz.bcp2007_zone, pga: Z.zones[tz.bcp2007_zone], basis: tz.basis, rows: tz.rows,
      basisWords: { direct: 'this tehsil\'s own row in Table 2.2', district: 'no row of its own; every 2007 row of its district carries this zone', districtMax: 'no row of its own; the highest zone among its district\'s 2007 rows', parent: 'district created after 2007 (or omitted in Table 2.2): the zone of the unit it was carved from' }[tz.basis],
      districtZone: dz && dz.bcp2007_zone, districtRange: dz && dz.range,
      source: 'Building Code of Pakistan, Seismic Provisions 2007, Table 2.2 (legacy zone)' } : null;
    if (G) {
      const ss = cellAt('ss', lat, lon), s1 = cellAt('s1', lat, lon);
      const sc = siteClass ? String(siteClass).toUpperCase() : null, rc = risk ? String(risk).toUpperCase() : null;
      const dv = ss && s1 ? designValues(ss.openTop ? ss.lower : ss.upper, s1.openTop ? s1.lower : s1.upper, sc, rc || 'II') : null;
      out.bcp2021 = {
        ss_g: ss && (ss.openTop ? null : ss.upper), ssBand: ss && ss.cls, s1_g: s1 && (s1.openTop ? null : s1.upper), s1Band: s1 && s1.cls,
        siteClass: dv && dv.siteClass, siteClassAssumed: !sc, riskCategory: dv && dv.riskCategory, riskCategoryAssumed: !rc,
        sds_g: dv && dv.sds, sd1_g: dv && dv.sd1, fa: dv && dv.fa, fv: dv && dv.fv, seismic_design_category: dv && dv.sdc,
        notes: [].concat(dv ? dv.notes : [],
          (ss && ss.openTop) || (s1 && s1.openTop) ? ['The point lies in the code map\'s open top band (' + [ss && ss.openTop ? 'Ss ' + ss.cls : null, s1 && s1.openTop ? 'S1 ' + s1.cls : null].filter(Boolean).join(', ') + '): the map gives no upper value, the values above use the band\'s lower edge, and a site-specific hazard study is needed.'] : [],
          !sc ? ['Site class not given: Site Class D assumed (BCP 2021 Section 1613.2.2 default). Give siteClass=A..F from a site investigation.'] : [],
          !rc ? ['Risk category not given: Risk Category II assumed (ordinary buildings). Give risk=I..IV.'] : [],
          (ss && ss.fromMapLineOrLabel) || (s1 && s1.fromMapLineOrLabel) ? ['At this point the code map is covered by a line or label; the value is taken from the nearest clear map pixel (within a few km).'] : []),
        valueRule: 'Ss and S1 are the upper edge of the code map\'s band at the point (the code: interpolate between contours, or conservatively take the higher)',
        mapResolutionKm: 2.2,
        source: 'Building Code of Pakistan 2021 (Pakistan Engineering Council), Section 1613.2.1, Figures 1613.2.1(1) and 1613.2.1(2); MCE, 2% in 50 years',
        method: 'code maps digitised by AGN (graticule georeferencing, legend-colour classes, 0.02-deg grid); not an official PEC dataset'
      };
    }
    out.screening = 'Code look-up for screening. Design needs the engineer of record, a site investigation for the site class, and a site-specific study where the code asks for one.';
    return out;
  }
  function route(p, url) {
    const q = url.searchParams;
    if (p === '/api/seismic/point') {
      const lat = +q.get('lat'), lon = +q.get('lon');
      if (!isFinite(lat) || !isFinite(lon) || q.get('lat') == null || q.get('lon') == null) return { status: 400, body: { ok: false, why: 'lat and lon are required' } };
      const sc = /^[A-F]$/i.test(q.get('siteClass') || '') ? q.get('siteClass') : null;
      const rc = /^(I|II|III|IV)$/i.test(q.get('risk') || '') ? q.get('risk') : null;
      const r = point(lat, lon, sc, rc); return { status: r.ok ? 200 : 404, body: r };
    }
    if (p === '/api/seismic/units') { load(); return { status: U ? 200 : 503, body: U || { ok: false, why: 'data/seismic-units.json missing' } }; }
    return null;
  }
  return { point, designValues, route };
}
