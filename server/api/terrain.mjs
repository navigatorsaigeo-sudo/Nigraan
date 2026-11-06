/* v91.17.40 · TERRAIN TABLES THE ENGINES READ: lithology per tehsil and the landslide back-test.
   lithology-tehsil.json  station-lake/scripts/lithology.py: shares of the 15 classes of the 250 m
                          global lithology map (Hengl 2018 / USGS Global Ecosystems / GLiM) inside each
                          tehsil, a dominant class and a MATERIAL class (crystalline, sedimentary,
                          volcanic, unconsolidated). The browser landslide screen reads the material for
                          its transferability caveat instead of a district-name list.
   landslide-calibration.json  station-lake/scripts/landslide_backtest.py: the Dahal & Hasegawa
                          intensity-duration curve against the NASA Global Landslide Catalog events in
                          Pakistan on ERA5 rain: AUC per predictor, event-day and control-day
                          percentiles, the share of events under the slope gate. A measurement of the
                          curve, published on the skill sheet; the browser engine reads its anchor from the registry
                          (landslide.gridAnchorRatio 0.3), which this file justifies. */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function createTerrain(dataDir, units) {
  const load = (f) => { try { const p = join(dataDir, f); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch { return null; } };
  const L = load('lithology-tehsil.json'), C = load('landslide-calibration.json'), R = load('rain-intensity-scale.json');
  /* v91.17.48 · ESA WorldCover 2021 class shares per tehsil (station-lake/scripts/landcover.py): the measured natural cover
     for the curve-number runoff engine, replacing the zone's assumed pervious class. Keyed by unitId. */
  const W = load('landcover-tehsil.json');
  /* v91.17.70 · WorldCover read at the native 10 m grid (the 1/16 overview erased scattered hill houses), and the impervious
     share the curve number uses (cn.py: WorldCover 10 m built bounded by Google Open Buildings footprints, 1x-3x the roof share) */
  const CNT = load('cn-tehsil.json');
  const imperviousOf = (unitId) => { const c = CNT && CNT.units && CNT.units[unitId]; return c && c.impervious_share != null ? { share: c.impervious_share, basis: c.impervious_basis, worldcoverBuilt10m: c.worldcover_built_10m, footprintShare: c.footprint_share } : null; };
  function landcover(unitId) { const r = W && W.units && W.units[unitId]; if (!r) return null; return { unitId, key: keyOf.get(unitId) || null, cells: r.cells, cellM: r.cellM, shares: { tree: r.tree, shrub: r.shrub, grass: r.grass, crop: r.crop, built: r.built, bare: r.bare, snow: r.snow, water: r.water, wetland: r.wetland }, cn: r.cn, impervious: imperviousOf(unitId), source: W.source, licence: W.licence || null }; }
  function landcoverNational() {
    if (!W || !W.units) return { ready: false, why: 'data/landcover-tehsil.json is not in this install (LEARN_NIGRAAN.bat landcover reads the WorldCover tiles)' };
    return { ready: true, built: W.built, source: W.source, licence: W.licence || null, attribution: W.attribution || null, method: W.method || null, classes: W.classes, cnClasses: W.cnClasses, caveat: W.caveat, count: Object.keys(W.units).length, units: W.units };
  }
  const keyOf = new Map(); for (const u of (units && units.tehsil) || []) keyOf.set(u.unitId, u.key);
  function lithology(unitId) {
    if (!L || !L.units) return null;
    const r = L.units[unitId]; if (!r) return null;
    return { unitId, key: r.key || keyOf.get(unitId) || null, material: r.material, materialShare: r.materialShare, dominant: r.dominant, dominantShare: r.dominantShare, materials: r.materials, classes: r.classes };
  }
  function lithologyNational() {
    if (!L || !L.units) return { ready: false, why: 'data/lithology-tehsil.json is not in this install (LEARN_NIGRAAN.bat lithology builds it from the 250 m class map)' };
    const out = {}, count = {};
    for (const uid of Object.keys(L.units)) { const r = lithology(uid); if (!r || !r.key) continue; out[r.key] = r; count[r.material] = (count[r.material] || 0) + 1; }
    return { ready: true, built: L.built, source: L.source, materials: L.materials, caveat: L.caveat, counts: count, units: out };
  }
  /* v91.17.64 · GIRI (UNEP-GRID / NGI) landslide susceptibility per tehsil, station-lake/scripts/giri_landslide.py. An
     independent static ranking beside NIGRAAN's own; the event check (NASA GLC vs random land) is published with it. */
  let G = load('giri-landslide-tehsil.json');
  function giri(unitId) {
    if (!G || !G.units || !G.source) return { ready: false, why: G ? 'data/giri-landslide-tehsil.json is malformed (no units/source)' : 'data/giri-landslide-tehsil.json is not in this install (LEARN_NIGRAAN.bat giri)' };   /* v91.17.68 · malformed is not a 500 (audit C28) */
    if (!unitId) return { ready: true, built: G.built, source: G.source, national: G.national, eventCheck: G.eventCheck, units: Object.keys(G.units).length, susceptibility30: susceptibility(null) };
    const u = G.units[unitId]; const s30 = susceptibility(unitId);
    return u ? { ready: true, unit: unitId, ...u, classNames: G.source.classes, source: G.source.name, licence: G.source.licence, susceptibility30: s30 } : { ready: true, unit: unitId, why: 'no GIRI summary for this tehsil (no cells)', susceptibility30: s30 };
  }
  /* v91.17.75 · THE LANDSLIDE SUSCEPTIBILITY THAT IS SERVED: a 30 m model per tehsil (station-lake/scripts/terrain30_landslide.py):
     GLO-30 slope-class shares, relief, lithology material, JJA NDVI and tree cover, steep ground within 500 m of the 30 m drainage;
     an L2 logistic fit of the NASA catalogue events (Pakistan-administered) against random land, compared with GIRI on the same
     points by district-grouped out-of-fold AUC. The file names the served candidate (`served`: model30, model30+giri or giri), its
     weights (`fits`), the class cut points on the relative event density and every AUC; nothing here is a constant. */
  let LS = load('landslide-susceptibility30.json');
  function susceptibility(unitId) {
    if (!LS || !LS.units) return { ready: false, why: 'data/landslide-susceptibility30.json is not in this install (station-lake/scripts/terrain30_landslide.py)' };
    const head = { ready: true, built: LS.built, served: LS.served, servedWhy: LS.servedWhy, auc: Object.fromEntries(Object.entries(LS.auc || {}).map(([k, v]) => [k, v.aucTehsilOof != null ? v.aucTehsilOof : v.aucTehsil])), aucBasis: 'tehsil-level; fitted candidates out-of-fold (5 district-grouped folds)', events: LS.labels && LS.labels.events, classNames: (LS.params || {}).classNames, classCuts: (LS.params || {}).classCutsRelDensity, caveat: LS.caveat };
    if (!unitId) return { ...head, classFactor: (LS.params || {}).classFactor || null, classFactorBasis: (LS.params || {}).classFactorBasis || null, classUnits: LS.classUnits, classAreaShare: LS.classAreaShare,
      units: Object.fromEntries(Object.entries(LS.units).map(([k, v]) => [keyOf.get(k) || k, v.served ? [v.served.class, v.served.relDensity ?? null] : null])), unitsKey: 'unit key (as /api/terrain/lithology)', unitsFields: ['class 1-5', 'relative event density'] };
    const u = LS.units[unitId]; if (!u) return { ...head, unit: unitId, why: 'no 30 m susceptibility for this tehsil (the disputed polygon is not scored)' };
    return { ...head, unit: unitId, key: keyOf.get(unitId) || null, classFactor: ((LS.params || {}).classFactor || {})[String(u.served.class)] ?? null, class: u.served.class, label: u.served.label, relDensity: u.served.relDensity ?? null, source: u.served.source, terms: { s25: u.s25, s35: u.s35, reliefKm: u.reliefKm, crystalline: u.crystalline, sedimentary: u.sedimentary, unconsolidated: u.unconsolidated, ndviJja: u.ndviJja, tree: u.tree, s25NearRiver500m: u.s25NearRiver500m }, giriMeanClass: u.giriMeanClass };
  }
  /* v91.17.72 · 30 m elevation and slope statistics per tehsil (Copernicus GLO-30; station-lake/scripts/terrain30_*.py): mean and
     percentiles, the area shares steeper than 15/25/30/35 deg. The landslide, snow and melt masks of hazard-applicability.json
     read the same file. */
  let T30 = load('terrain30-tehsil.json');
  function relief(unitId) {
    if (!T30 || !T30.units) return { ready: false, why: 'data/terrain30-tehsil.json is not in this install (station-lake/scripts/terrain30_finish.py builds it from the GLO-30 sweep)' };
    if (!unitId) return { ready: true, built: T30.built, method: T30.method, source: T30.source, licence: T30.licence || null, fields: T30.fields, crossCheck: T30.crossCheck || null, units: Object.keys(T30.units).length };
    const u = T30.units[unitId]; return u ? { ready: true, unit: unitId, key: keyOf.get(unitId) || null, ...u, source: T30.source } : { ready: true, unit: unitId, why: 'no 30 m statistics for this tehsil (disputed polygon or outside the tile set)' };
  }
  /* v91.17.184 · the 250 m sponge per tehsil (station-lake/scripts/sponge250.py): shares of cover x HYSOGs soil group x slope factor,
     pixel first, keyed by the tehsil key the browser uses */
  let SP = load('sponge-tehsil.v2.json');
  function sponge() {
    if (!SP || !SP.units) return { ready: false, why: 'data/sponge-tehsil.v2.json is not in this install (station-lake/scripts/sponge250.py)' };
    return { ready: true, version: SP.version, built: SP.built, covers: SP.covers, hsg: SP.hsg, fSlope: SP.fSlope, cn2: SP.cn2, classes: SP.classes, edgesCN: SP.edgesCN, sources: SP.sources,
      units: Object.fromEntries(Object.entries(SP.units).map(([k, v]) => [k, { bins: v.bins, classShare: v.classShare, built: v.built, hsgShare: v.hsgShare }])) };
  }
  const reload = () => { SP = load('sponge-tehsil.v2.json'); G = load('giri-landslide-tehsil.json'); T30 = load('terrain30-tehsil.json'); LS = load('landslide-susceptibility30.json'); return !!G; };   /* v91.17.68 · a LEARN run no longer needs a restart (C28) */
  function calibration() { return C ? { ready: true, ...C, rainIntensityScale: R || null } : { ready: false, why: 'data/landslide-calibration.json is not in this install (LEARN_NIGRAAN.bat landslide runs the back-test; it needs the provider key and the NASA catalogue)' }; }
  function status() { return { lithology: L ? { ready: true, built: L.built, units: Object.keys(L.units || {}).length } : { ready: false }, landslideCalibration: C ? { ready: true, built: C.built, events: C.counts && C.counts.scored } : { ready: false }, landcover: W ? { ready: true, built: W.built, units: Object.keys(W.units || {}).length } : { ready: false }, rainIntensityScale: R ? { ready: true, built: R.built, stations: R.stations } : { ready: false }, terrain30: T30 ? { ready: true, built: T30.built, units: Object.keys(T30.units || {}).length } : { ready: false }, landslideSusceptibility30: LS ? { ready: true, built: LS.built, served: LS.served, units: Object.keys(LS.units || {}).length } : { ready: false } }; }
  return { sponge, lithology, lithologyNational, landcover, landcoverNational, calibration, giri, susceptibility, relief, reload, status };
}
