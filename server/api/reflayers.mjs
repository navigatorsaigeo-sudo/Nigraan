/* == v91.17.283.31 · items 1.2 and 1.3 · THE REFERENCE LAYERS (earthquake zone, cyclone exposure) ==================================
   Fixed reference products, not daily hazard levels. Until v283.30 the map asked the issued hazard run for "seismic" and "cyclone";
   the run has no such layer, so all 576 tehsils were shown "No reading" although the reference data is installed. They are served
   here, through GET /api/levels?layer=seismic|cyclone, in the shape of a level answer (levels: { unitId: class index }), with:
     kind: 'reference'          never a forecast, never an alert, no day dimension (every day button answers the same classes)
     words                      the product's OWN classes (code zones; cyclone exposure classes), never Normal..Severe
     code / states              the four map states (item 4.3): a class index (value),
                                -1 missing (the reference file has no record for the tehsil)
   EARTHQUAKE ZONE: Building Code of Pakistan SP-2007 Table 2.2 seismic zone of each tehsil (data/seismic-units.json, built from
   data/seismic-bcp2007.json; the BCP 2021 mapped Ss / S1 band rides along as a fact). The code's own zone words (Table 2.1 PGA bands).
   CYCLONE EXPOSURE: the 46-season Arabian Sea best-track climatology (data/cyclone-climatology.json, IBTrACS v04r01 1980-2025, modified
   Rankine profile, station-fitted land factor): a tehsil whose centroid reached storm force (48 kt) in at least one storm is
   "Storm force reached", gale (34 kt) "Gale reached"; a tehsil where no storm of 46 seasons brought gale-force wind is the class "No gale on
   record 1980-2025" (v283.35: a record, not an impossibility), with its peak wind kept as a fact. Exposure only: no active track is read here. */
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { coastKm } from './outlook.mjs';   /* v91.17.283.47: the build's coastline (Iranian border to Sir Creek) */

export const REF_LAYERS = Object.freeze(['seismic', 'cyclone']);
/* v283.36 · C-now test 3 (Methods): the land factor 0.518 passed leave-one-storm-out (9 storms, 42 station-storms: fold k 0.490-0.556, held-out
   MAE 6.88 kt, beats no factor; not clearly better than climatology); Rm 61.1 km passes as a descriptive fill. The per-tehsil gale decision
   is untested (3 observed gales): the layer stays a historical reference, never a warning. */
export const CYCLONE_CNOW = 'land factor 0.518: leave-one-storm-out passed (9 storms, 42 station-storms; held-out MAE 6.88 kt, beats no factor, not clearly better than climatology); Rm 61.1 km: descriptive fill; gale per tehsil: untested (3 observed gales) - a historical reference, never a warning';
/* v91.17.283.35 · the map states have one home (states.mjs); re-exported for the readers that import them from here */
import { STATE_CODES, STATE_TEXT, stateCounts as stateCounts0 } from './states.mjs';
export { STATE_CODES };
const ZONE_ORDER = ['1', '2A', '2B', '3', '4'];

export function createRefLayers(app, dataDir) {
  const C = {};
  const load = (f) => { const p = join(dataDir, f); try { if (!existsSync(p)) return null; const mt = statSync(p).mtimeMs; if (C[f] && C[f].mt === mt) return C[f].v; const v = JSON.parse(readFileSync(p, 'utf8')); C[f] = { mt, v }; return v; } catch (_) { return null; } };
  const tehsils = () => ((app.units && app.units.tehsil) || []).filter((u) => !u.disputed);
  const keyOf = (u) => u.key != null ? u.key : u.unitId;

  function seismic() {
    const S = load('seismic-units.json');
    if (!S || !S.tehsils) return { ready: false, kind: 'reference', layer: 'seismic', why: 'not assessed: data/seismic-units.json (the BCP SP-2007 zone table) is not in this install' };
    const CW = (S.classWords && S.classWords.zone) || {};
    const words = ZONE_ORDER.map((z) => 'Zone ' + z + ((S.pga || {})[z] ? ', PGA ' + S.pga[z] : '') + (CW[z] ? ' (' + CW[z] + ')' : ''));   /* v283.36 item 31: zone code + PGA band beside the word */
    const levels = {}, facts = {}, keys = {}; const counts = words.map(() => 0); let missing = 0;
    for (const u of tehsils()) { const r = S.tehsils[u.unitId]; keys[u.unitId] = keyOf(u);
      const i = r ? ZONE_ORDER.indexOf(String(r.z)) : -1;
      if (i < 0) { levels[u.unitId] = -1; missing++; continue; }
      levels[u.unitId] = i; counts[i]++;
      facts[u.unitId] = { zone: r.z, pga: (S.pga || {})[r.z] || null, text: 'Building Code of Pakistan zone ' + r.z + ((S.pga || {})[r.z] ? ', PGA ' + S.pga[r.z] : '') + (CW[r.z] ? ' (' + CW[r.z] + ')' : ''), zoneBasis: r.zb || null, bcp2021Ss: r.ss || null, bcp2021S1: r.s1 || null }; }
    return { ready: true, kind: 'reference', layer: 'seismic', name: 'Earthquake zone (Building Code of Pakistan)', words, ownScale: true, direction: 'higher zone = stronger design shaking',
      levels, facts, keys, counts, states: stateCounts(levels), code: codeDict(), version: S.version || null,
      basis: 'Building Code of Pakistan SP-2007 Table 2.2 (tehsil zones), PGA bands Table 2.1; BCP 2021 mapped Ss / S1 band as a fact',
      source: (S.sources && S.sources.bcp2007) || 'BCP SP-2007', noDaily: 'a building-code zone: it does not change by day and is not a forecast', canAlert: false, productType: 'Reference' };
  }

  function cyclone() {
    const Y = load('cyclone-climatology.json');
    if (!Y || !Y.units) return { ready: false, kind: 'reference', layer: 'cyclone', why: 'not assessed: data/cyclone-climatology.json is not in this install' };
    const byUid = {}; for (const v of Object.values(Y.units)) if (v && v.uid) byUid[v.uid] = v;
    /* v91.17.283.35 · audit B1 / L6 · "no gale on the 1980-2025 record" is an empirical record, not a physical impossibility (inland remnants
       do bring gales; the record shows gale-force wind beyond 200 km): it is a reference CLASS of its own (index 0), never -4 */
    const yrs = (Y.seasons || [1980, 2025]).join('\u2013');
    const words = ['No gale on record ' + yrs, 'Gale reached', 'Storm force reached'];
    const T = Y.thresholdsKt || { gale: 34, storm: 48 };
    const levels = {}, facts = {}, keys = {}; const counts = [0, 0, 0]; let missing = 0;
    /* v91.17.283.47 · NIGRAAN 1.0.8 · owner rule 2 Nov 2026 01:15 PKT: a tehsil beyond the farthest inland reach of damaging cyclone wind
       on the 46-season record (IBTrACS v04r01 1980-2025, the climatology's own modelled wind at the tehsil centre) cannot have cyclone
       wind: "Cannot happen here" (-4), not "No gale on record". The reach is READ FROM THE RECORD, not set: the largest distance from the
       sea edge (data/hazard-applicability.json coastKm, else the build's coastline) of any tehsil that reached gale force (34 kt). Inside
       that reach a tehsil without a gale on record keeps the class "No gale on record" (it can happen). NIGRAAN_CYCLONE_REACH=0 = 1.0.7. */
    const AP = load('hazard-applicability.json'); const CK = (AP && AP.layers && AP.layers.cyclone && AP.layers.cyclone.units) || {};
    const kmOf = (u) => { const a = CK[u.unitId]; return a && Number.isFinite(+a.coastKm) ? +a.coastKm : coastKm(u.lat, u.lon); };
    let reachKm = null, reachUid = null; if (process.env.NIGRAAN_CYCLONE_REACH !== '0') for (const u of tehsils()) { const r = byUid[u.unitId]; if (!r || !(r.galeStorms > 0)) continue; const k = kmOf(u); if (Number.isFinite(k) && (reachKm == null || k > reachKm)) { reachKm = k; reachUid = u.unitId; } }
    let cannot = 0;
    for (const u of tehsils()) { const r = byUid[u.unitId]; keys[u.unitId] = keyOf(u);
      if (reachKm != null) { const k = kmOf(u); if (Number.isFinite(k) && k > reachKm && !(r && r.galeStorms > 0)) { levels[u.unitId] = -4; cannot++;
        facts[u.unitId] = { coastKm: Math.round(k * 10) / 10, reachKm, why: 'cannot happen here: ' + Math.round(k) + ' km from the sea, beyond the farthest inland reach of gale-force cyclone wind on the ' + (Y.years || 46) + '-season record (' + Math.round(reachKm) + ' km, ' + String(reachUid).split('|')[2] + ')', peakKt: r ? r.peakKt : null }; continue; } }
      if (!r) { levels[u.unitId] = -1; missing++; continue; }
      const f = { galeStorms: r.galeStorms, galeReturnYears: r.galeReturnYears, stormForceStorms: r.stormForceStorms, stormForceReturnYears: r.stormForceReturnYears, peakKt: r.peakKt, peakStorm: r.peakStorm || null };
      facts[u.unitId] = f;
      if (r.stormForceStorms > 0) { levels[u.unitId] = 2; counts[2]++; }
      else if (r.galeStorms > 0) { levels[u.unitId] = 1; counts[1]++; }
      else { levels[u.unitId] = 0; counts[0]++; f.note = 'no tropical cyclone of ' + (Y.years || 46) + ' seasons (' + yrs + ') brought gale-force wind (' + T.gale + ' kt) to this tehsil on the record (highest: ' + r.peakKt + ' kt' + (r.peakStorm ? ', ' + r.peakStorm : '') + '); a record, not a guarantee'; } }
    return { ready: true, kind: 'reference', layer: 'cyclone', name: 'Cyclone wind exposure (' + yrs + ' record)', words, ownScale: true, direction: 'storm force > gale > no gale on record',
      levels, facts, keys, counts, states: stateCounts(levels), code: codeDict(), version: Y.version || null,
      basis: Y.method || null, source: Y.sourceCredit || null, caveat: Y.caveat || null, years: Y.years || null, seasons: Y.seasons || null, thresholdsKt: T,
      noDaily: 'exposure on the ' + (Y.years || 46) + '-season record, not a forecast: an active storm track is not connected', canAlert: false, productType: 'Reference',
      methodsTest: CYCLONE_CNOW,   /* v283.36 C-now 3 */
      ...(reachKm != null ? { inlandReach: { km: reachKm, tehsil: reachUid, cannotHappen: cannot, rule: 'beyond the farthest inland tehsil that reached gale force (34 kt) on the record: cannot happen' } } : {}) };
  }

  function codeDict() { return { '-1': 'missing: the reference file has no record for this tehsil', '-4': 'not assessed: ' + STATE_TEXT['-4'], '0+': 'class index into words' }; }
  function stateCounts(levels) { return stateCounts0(levels); }

  function layer(k) { return k === 'seismic' ? seismic() : k === 'cyclone' ? cyclone() : null; }
  /* one tehsil's reference classes (for /api/levels/unit and the place record) */
  function unit(uid) { const out = {}; for (const k of REF_LAYERS) { const L = layer(k); if (!L || !L.ready) { out[k] = { assessed: false, kind: 'reference', why: L ? L.why : 'unknown' }; continue; }
      const v = L.levels[uid]; out[k] = v >= 0 ? { assessed: true, kind: 'reference', name: L.name, level: v, word: L.words[v], facts: L.facts[uid] || null, basis: L.basis }
        : { assessed: false, kind: 'reference', name: L.name, state: STATE_CODES[String(v)] || 'missing', ...(v === -4 ? { cannotHappen: true } : {}), why: (L.facts[uid] && L.facts[uid].why) || L.code[String(v)] || 'missing' }; }
    return out; }
  return { layer, unit, names: REF_LAYERS };
}
