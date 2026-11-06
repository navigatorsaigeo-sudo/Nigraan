/* ══ v91.17.216 · ACTIVE FAULTS (REFERENCE LAYER) ══════════════════════════════════════════════════════════════════════════════
   CEO 9 Oct: earthquake stays a reference in NIGRAAN (no house counts); add the fault lines. The layer is the GEM Global Active
   Faults Database (Styron & Pagani 2020, Earthquake Spectra 36; CC BY-SA), clipped to 20-40 N, 58-80 E, held by NIGRAAN in
   data/gem-active-faults-pk.json (v91.17.283.25: the only file read). Three source catalogues are inside: EMME (Middle East model), HimaTibetMap
   and Bird (2003) plate boundaries; a plate boundary is labelled as one, not as a mapped fault.
   GET /api/faults                  the layer (GeoJSON) with its credit
   GET /api/faults/nearest?lat=&lon=  the nearest fault trace to a point: distance, name, slip type, slip rate (best, min, max mm/yr)
   Distance to a mapped trace is a reference fact for a site, not a hazard level: shaking at a site is set by the code values
   (BCP 2021) and, for a real event, by the event's own intensity. */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const D2R = Math.PI / 180, RE = 6371.0088;

export function createFaults(app) {
  let F = null, stamp = null, err = null;
  /* v91.17.275 HAZ2 · /api/faults answered 503 since the v91.17.269 copies: the lake root became the copies mirror (nig/copies/lake),
     which holds the catalogue but not this file, because the file was never in D:\DATA LAKE (12 Oct it was converted into
     nig\agn-lake only, the old root). NIGRAAN now holds its own copy, data/gem-active-faults-pk.json (scripts/faults_gem_convert.py
     from the GEM clip already held; copy, not fetch).
     v91.17.283.25 · NIGRAAN leaves D:\DATA LAKE (owner, 27 Oct 2026): the lake branch is removed; NIGRAAN's own file is the one source. */
  let from = null;
  function where() {
    const own = join(app.dataDir || join(process.cwd(), 'data'), 'gem-active-faults-pk.json');
    try { statSync(own); return { p: own, from: 'nigraan' }; } catch (_) {}
    err = 'NIGRAAN holds no fault file (data/gem-active-faults-pk.json)';
    return null;
  }
  function load() {
    const w = where(); if (!w) return null; const p = w.p; from = w.from;
    let st; try { st = statSync(p); } catch (_) { err = 'the fault file is missing: ' + p; return null; }
    const k = st.mtimeMs + ':' + st.size; if (F && k === stamp) return F;
    const g = JSON.parse(readFileSync(p, 'utf8'));
    const segs = [];
    g.features.forEach((f, fi) => {
      const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const l of lines) for (let i = 0; i < l.length - 1; i++) segs.push([fi, l[i][0], l[i][1], l[i + 1][0], l[i + 1][1]]);
    });
    F = { geo: g, segs, meta: g.metadata || {} }; stamp = k; err = null; return F;
  }
  const kindOf = (p) => /bird/i.test(p.catalog || '') ? 'plate boundary (Bird 2003)' : 'mapped active fault';
  function props(p) {
    return { name: p.name || null, kind: kindOf(p), slipType: p.slipType || null, slipRateMmYr: p.slipRateMmYr || null, dipDeg: p.dipDeg, dipDir: p.dipDir || null,
      catalog: p.catalog || null, lengthKm: p.lengthKm };
  }
  /* point to segment on a local equirectangular plane (error well under 1 % within a few hundred km) */
  function distKm(lat, lon, x1, y1, x2, y2) {
    const k = Math.cos(lat * D2R), ax = (x1 - lon) * k, ay = y1 - lat, bx = (x2 - lon) * k, by = y2 - lat;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; let t = L2 > 0 ? -(ax * dx + ay * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, py = ay + t * dy; return Math.sqrt(px * px + py * py) * D2R * RE;
  }
  function nearest(lat, lon) {
    const G = load(); if (!G) return { ok: false, why: err };
    let best = null; const within = { 10: new Set(), 25: new Set(), 50: new Set() };
    for (const s of G.segs) {
      if (Math.abs(s[2] - lat) > 3 && Math.abs(s[4] - lat) > 3) continue;
      const d = distKm(lat, lon, s[1], s[2], s[3], s[4]);
      if (!best || d < best.d) best = { d, fi: s[0] };
      for (const r of [10, 25, 50]) if (d <= r) within[r].add(s[0]);
    }
    if (!best || best.d > 300) return { ok: true, nearest: null, note: 'no mapped active fault within 300 km', credit: G.meta.credit || null };
    const p = props(G.geo.features[best.fi].properties);
    return { ok: true, nearest: { ...p, distanceKm: Math.round(best.d * 10) / 10 }, faultsWithinKm: { 10: within[10].size, 25: within[25].size, 50: within[50].size },
      credit: G.meta.credit || null, source: G.meta.source || null,
      meaning: 'Distance from the point to the nearest mapped active-fault trace in the GEM Global Active Faults Database. A reference fact, not a hazard level: mapped traces are generalised (small-scale maps), many active faults are unmapped, and shaking is set by the code values and by each event.' };
  }
  function layer() {
    const G = load(); if (!G) return { ok: false, why: err };
    return { ok: true, type: 'FeatureCollection', credit: G.meta.credit || null, citation: G.meta.citation || null, licence: G.meta.licence || null, fetchedUtc: G.meta.fetchedUtc || null,
      features: G.geo.features.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: props(f.properties) })) };
  }
  function status() { const G = load(); return G ? { ok: true, features: G.geo.features.length, segments: G.segs.length, fetchedUtc: G.meta.fetchedUtc || null, file: from } : { ok: false, why: err }; }
  return { nearest, layer, status };
}
