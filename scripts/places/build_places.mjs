#!/usr/bin/env node
/* == v91.17.283.18 (283.19: spelling variants, unit names, OSM-listed features) . THE ONE PLACE TABLE (data/geo/places.json.gz) =====================================================================
   Builds NIGRAAN's single place table from the place sources the server read separately up to v91.17.283.17, by one written method, and
   writes a receipt (data/geo/places.meta.json) with the count of every step and the SHA-256 of every input. Re-running it on the same
   inputs gives the same table (rows sorted, ids from name and point). Every consumer of the server reads this table through
   server/api/places.mjs; nothing reads the sources at run time.

   usage: node scripts/places/build_places.mjs [--src <folder of the source files>] [--data <live data folder>] [--out <file.json.gz>]
     --src   the folder that holds the source files under their old names (default: <NIGRAAN root>\inputs\places_src, i.e.
             D:\NIGRAAN\inputs\places_src, where MOVE_UNUSED_V283_18 puts them; env NIGRAAN_PLACES_SRC; else the tree's data folder):
               pk-places.tsv.gz                 GeoNames PK (CC BY 4.0), every feature class
               pk-places-osm.tsv.gz             OpenStreetMap supplement (HDX/HOT populated places + Overpass suburbs, localities, admin 6-10)
               pk-places-extra.tsv              the Islamabad sector / locality supplement
               place-areas/pk-place-areas.json.gz  OpenStreetMap named settlement areas (name, kind, area, label point)
               pk-names-urdu.json               GeoNames Urdu alternate names
     --data  the live data folder (default: the tree's data folder): pk-tehsils-fine.json.gz (official tehsil polygons, bundle 3.3.0),
             tehsil-anchor.json (the populated anchor of every tehsil), feat/p_pop and feat/s_wc_built (the evidence layer)
     inputs kept with this script: scripts/places/inputs/agn-settlements.json (the 3,042-row table that was embedded in the analyst page),
             scripts/places/inputs/place-aliases.json (the alias list that was in server code, and data/place-spellings.json);
             scripts/places/inputs/osm-features.json (283.19: OpenStreetMap features listed by OSM, every named aerodrome in Pakistan,
             Overpass export; its query is in the file);
             server/contract/units.json (the AGN tehsil index).

   METHOD (country-wide; no place is named in this file):
     1 abandoned / destroyed: GeoNames PPLQ, PPLW and PPLH rows are dropped.
     2 admin-unit labels: rows that are labels of an administrative unit are dropped (OSM admin 6-10, OSM 'administrative' areas, and any
       settlement-typed row whose name ends in tehsil / district / division / agency / taluka / tahsil); the AGN unit records (step 9)
       stand for the units.
     3 wrong types: a settlement-typed row whose LAST word names a road, junction, building, market, water work or transport stop
       (list RETYPE below) becomes kind 'landmark' (searchable, never a settlement).
     4 outside: rows outside every official tehsil polygon are dropped; rows inside the IIOJK polygon are dropped (NIGRAAN publishes
       nothing there; the IIOJK unit record answers a search for it, marked disputed).
     5 relabel: province, district, tehsil and unit id of EVERY row from the fine tehsil polygon containing its point
       (server/api/unitresolve.mjs, the resolver the server uses at run time); no source admin text is kept.
     6 merge: rows of the same class (populated place, landmark, or the same natural-feature code) whose name keys are equal and that lie
       within 2 km of each other, or whose straight line runs through urban land only (Degree of Urbanisation classes 1-3, see the
       code), become one record (union of all names, every source kept, largest population, the point of the best
       source: population, then GeoNames seats, OSM areas and OSM features, GeoNames points, OSM points, the page table, the hand supplement).
     6b spelling (283.19): rows of the same class within 2 km whose names are spellings of one name also become one record: the same name
       once the abbreviation words of ABBR are written one way (Cant / Cantt / Cantonment), the same letters without spaces, or one word
       differing by one letter (both words 4+ letters; a name with a digit is never merged this way, so sector and chak numbers stay apart).
     7 confirmed: population > 0 (GeoNames or OSM), or two independent source families in the record (GeoNames; OpenStreetMap incl.
       its areas, its listed features (osm-features.json) and the page table built from OSM place tags; the AGN hand supplement), or a row
       of another family with a similar name (placenorm similar(): equal, extra words, 1-2 edits) within 5 km. A feature OSM lists (an
       aerodrome) is therefore confirmed when OSM and GeoNames both list it, or when OSM alone lists it (one family, but a mapped feature).
     kinds (283.19): a populated record named as its own tehsil or district, or carrying a cantonment word, is never typed 'village'
       (it is a 'town'), and takes the unit's spelling of the name.
     8 no buildings: an UNCONFIRMED populated-place record with no people (WorldPop 2020 constrained, census-2023 scaled, data/feat/p_pop)
       and no built-up land (ESA WorldCover 2021 built share, data/feat/s_wc_built) in the 5 x 5 cells of 250 m around its point
       (about 600 m) is dropped. Natural features and landmarks are not tested.
     9 units: every tehsil (577, IIOJK marked disputed), district and province of the AGN unit index becomes a record standing at its
       populated anchor (tehsil: data/tehsil-anchor.json; district: the anchor of the tehsil carrying the district's name, else of its
       most populous tehsil; province: its most populous anchor), confirmed.
    10 names: Urdu names (GeoNames alternates) join the record of the same name within 2 km; aliases and spellings of
       scripts/places/inputs/place-aliases.json join the record they name. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/* columns: seat = the administrative seat a GeoNames source names (national PPLC, provincial PPLA, district PPLA2); elevM = the GeoNames
   height of the record's point when it has one (the run-time height is the 30 m terrain, server/api/pointheight.mjs) */
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : d; };
/* the source files' home: D:\NIGRAAN\inputs\places_src on the laptop, found from this tree (nigraan-local -> nig -> the NIGRAAN root), or
   NIGRAAN_PLACES_SRC; before MOVE_UNUSED_V283_18 has moved them there they are still in the tree's data folder */
const ROOT_NIGRAAN = resolve(ROOT, '..', '..'), SRC_HOME = process.env.NIGRAAN_PLACES_SRC ? resolve(process.env.NIGRAAN_PLACES_SRC) : join(ROOT_NIGRAAN, 'inputs', 'places_src');
const SRC = arg('src', existsSync(join(SRC_HOME, 'pk-places.tsv.gz')) ? SRC_HOME : join(ROOT, 'data')), DATA = arg('data', join(ROOT, 'data')), OUT = arg('out', join(ROOT, 'data', 'geo', 'places.json.gz'));
const { norm, display, km, similar, editDistance } = await import(pathToFileURL(join(ROOT, 'server', 'api', 'places.mjs')).href);
const { unitsContaining } = await import(pathToFileURL(join(ROOT, 'server', 'api', 'unitresolve.mjs')).href);
const { createFeatGrid } = await import(pathToFileURL(join(ROOT, 'server', 'api', 'featgrid.mjs')).href);

const INPUTS = [];
function input(path, what) { if (!existsSync(path)) throw new Error('input missing: ' + path + ' (' + what + ')'); const b = readFileSync(path);
  INPUTS.push({ file: relative(ROOT, path).split('\\').join('/'), what, bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') }); return b; }
const tsv = (b, gz) => (gz ? gunzipSync(b) : b).toString('utf8').split('\n').map((l) => l.replace(/\r$/, '').split('\t')).filter((c) => c.length >= 10);

/* ---- inputs ---- */
const units = JSON.parse(input(join(ROOT, 'server', 'contract', 'units.json'), 'AGN unit index').toString('utf8'));
const ANCH = JSON.parse(input(join(DATA, 'tehsil-anchor.json'), 'tehsil anchors').toString('utf8')).units || {};
input(join(DATA, 'pk-tehsils-fine.json.gz'), 'official tehsil polygons (bundle 3.3.0)');
for (const b of ['p_pop', 's_wc_built']) input(join(DATA, 'feat', b + '.json'), 'evidence layer index ' + b);
const RAW = [];
const push = (r) => { if (Number.isFinite(r.lat) && Number.isFinite(r.lon) && r.name) RAW.push(r); };
for (const c of tsv(input(join(SRC, 'pk-places.tsv.gz'), 'GeoNames PK'), true))
  push({ src: 'geonames', fam: 'geonames', name: c[0], ascii: c[1], alts: c[2] ? c[2].split(',') : [], lat: +c[3], lon: +c[4], fcode: c[5], pop: +c[6] || 0, srcProv: c[7] || '', srcDist: c[8] || '', dem: +c[9] > -9000 ? +c[9] : null });
for (const c of tsv(input(join(SRC, 'pk-places-osm.tsv.gz'), 'OpenStreetMap supplement'), true))
  push({ src: 'osm', fam: 'osm', name: c[0], ascii: c[1], alts: c[2] ? c[2].split(',') : [], lat: +c[3], lon: +c[4], fcode: c[5], pop: +c[6] || 0, srcProv: c[7] || '', srcDist: c[8] || '' });
for (const c of tsv(input(join(SRC, 'pk-places-extra.tsv'), 'Islamabad sector / locality supplement'), false))
  push({ src: 'extra', fam: 'agn', name: c[0], ascii: c[1], alts: c[2] ? c[2].split(',') : [], lat: +c[3], lon: +c[4], fcode: c[5], pop: 0, srcProv: c[7] || '', srcDist: c[8] || '' });
{ const A = JSON.parse(gunzipSync(input(join(SRC, 'place-areas', 'pk-place-areas.json.gz'), 'OpenStreetMap named areas')).toString('utf8'));
  /* the area outlines: every tile piece of every area (z15 tile coordinates, MVT rings, even-odd) -> lon/lat rings, kept with the record
     so a point is named by the area that CONTAINS it (owner, 19 Oct 2026: the F-11 / G-11 edge) */
  const n2 = 2 ** A.z, E = A.extent || 4096, toLon = (tx, px) => (tx + px / E) / n2 * 360 - 180, toLat = (ty, py) => Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + py / E) / n2))) * 180 / Math.PI;
  const GEOM = new Map();
  for (const [key, flat] of Object.entries(A.tiles)) { const [tx, ty] = key.split('/').map(Number);
    for (let i = 0; i < flat.length;) { const ai = flat[i++], nr = flat[i++]; const piece = [];
      for (let r = 0; r < nr; r++) { const m = flat[i++]; let x = flat[i++], y = flat[i++]; const ring = [[toLon(tx, x), toLat(ty, y)]];
        for (let k = 1; k < m; k++) { x += flat[i++]; y += flat[i++]; ring.push([toLon(tx, x), toLat(ty, y)]); } piece.push(ring); }
      (GEOM.get(ai) || GEOM.set(ai, []).get(ai)).push(piece); } }
  A.areas.forEach((a, ai) => push({ src: 'osm-area', fam: 'osm', name: a[0], ascii: a[0], alts: a[5] && a[5] !== a[0] ? [a[5]] : [], lat: a[3], lon: a[4], fcode: 'AREA', areaKind: A.kinds[a[1]], areaM2: a[2], geom: GEOM.get(ai) || null, pop: 0, srcProv: '', srcDist: '' })); }
{ const T = JSON.parse(input(join(ROOT, 'scripts', 'places', 'inputs', 'agn-settlements.json'), 'settlement table formerly embedded in the analyst page').toString('utf8'));
  for (const r of T.rows) push({ src: 'page-table', fam: 'osm', name: r[0], ascii: r[0], alts: [], lat: +r[1], lon: +r[2], fcode: 'PT', ptype: r[3], pop: 0, srcProv: '', srcDist: '' }); }
const URDU = JSON.parse(input(join(SRC, 'pk-names-urdu.json'), 'GeoNames Urdu alternate names').toString('utf8')).names || {};
const ALI = JSON.parse(input(join(ROOT, 'scripts', 'places', 'inputs', 'place-aliases.json'), 'aliases and spellings').toString('utf8'));
{ const F = JSON.parse(input(join(ROOT, 'scripts', 'places', 'inputs', 'osm-features.json'), 'features listed by OpenStreetMap (aerodromes)').toString('utf8'));
  for (const r of F.rows) push({ src: 'osm-feature', fam: 'osm', name: r[0], ascii: r[0], alts: r[1] ? [r[1]] : [], lat: +r[2], lon: +r[3], fcode: r[4], pop: 0, srcProv: '', srcDist: '', listed: true }); }

const C = { rows_in: RAW.length, rows_in_by_source: {} };
for (const r of RAW) C.rows_in_by_source[r.src] = (C.rows_in_by_source[r.src] || 0) + 1;

/* ---- 1 abandoned / destroyed ---- */
let R = RAW.filter((r) => !/^PPL[QWH]$/.test(r.fcode)); C.dropped_abandoned = RAW.length - R.length;
/* ---- 2 admin-unit labels ---- */
const UNITWORD = /\b(tehsil|tahsil|district|division|agency|taluka)$/;
const isPopulated = (r) => /^PPL/.test(r.fcode) || r.fcode === 'AREA' || r.fcode === 'PT';
{ const n = R.length; R = R.filter((r) => !(/^ADM/.test(r.fcode) || (r.fcode === 'AREA' && r.areaKind === 'administrative') || (isPopulated(r) && UNITWORD.test(norm(r.name))))); C.dropped_unit_labels = n - R.length; }
/* ---- 3 wrong types (the last word of the name) ---- */
const RETYPE = /\b(road|rd|street|chowk|chowrangi|interchange|hospital|school|college|university|masjid|mosque|mandir|church|bazar|bazaar|market|plaza|mall|park|stadium|station|stop|bridge|pul|canal|nala|nullah|dam|barrage|headworks|airport|chungi|toll|pump|bank|office|thana|hotel|bypass|motorway|highway)$/;
C.retyped_landmarks = 0;
for (const r of R) if (isPopulated(r) && RETYPE.test(norm(r.ascii || r.name))) { r.landmark = true; C.retyped_landmarks++; }
/* ---- 4 outside + 5 relabel ---- */
const T = units.filter((u) => u && u.unitId); const byId = new Map(T.map((u) => [u.unitId, u]));
const unitAt = (lat, lon) => { const h = unitsContaining(DATA, T, lat, lon).filter((id) => byId.has(id)); return h.length ? byId.get(h[0]) : null; };
{ const n = R.length; let iio = 0, rel = 0; const out = [];
  const bySrc = {};
  for (const r of R) { const u = unitAt(r.lat, r.lon); if (!u) { bySrc[r.src] = (bySrc[r.src] || 0) + 1; continue; } if (u.disputed) { iio++; continue; }
    r.province = u.province; r.district = u.district; r.tehsil = u.tehsil; r.unitId = u.unitId;
    const d0 = norm(String(r.srcDist).replace(/ district$/i, '')), d1 = norm(u.district); if (r.srcDist && d0 !== d1 && !d0.includes(d1) && !d1.includes(d0)) rel++;
    out.push(r); }
  C.dropped_outside_districts = n - out.length - iio; C.dropped_outside_by_source = bySrc; C.dropped_in_iiojk = iio; C.relabelled_from_boundaries = true; C.district_text_changed_by_polygon = rel; R = out; }
/* ---- 6 merge ---- */
const cls = (r) => r.landmark ? 'landmark' : isPopulated(r) ? 'place' : r.fcode;
const keyOf = (r) => norm(r.ascii || r.name) || norm(r.name);
const CELL = 0.02, gk = (la, lo) => Math.floor(la / CELL) + ',' + Math.floor(lo / CELL);
const parent = R.map((_, i) => i); const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
/* 6b: the abbreviation words written one way (generic words, no place names) and the spelling test */
const ABBR = { cant: 'cantt', cantonment: 'cantt' };
const canon = (k) => String(k || '').split(' ').map((w) => ABBR[w] || w).join(' ');
function spelling(a, b) {
  if (a === b) return false; if (canon(a) === canon(b)) return true; if (/\d/.test(a) || /\d/.test(b)) return false;
  if (a.replace(/ /g, '') === b.replace(/ /g, '')) return true;
  const A = canon(a).split(' '), B = canon(b).split(' '); if (A.length !== B.length) return false;
  let d = -1; for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) { if (d >= 0) return false; d = i; }
  return d >= 0 && A[d].length >= 4 && B[d].length >= 4 && editDistance(A[d], B[d], 1) === 1; }
C.merged_spelling_2km = 0;
{ const G = new Map(); R.forEach((r, i) => { r.key = keyOf(r); r.cls = cls(r); const k = gk(r.lat, r.lon); (G.get(k) || G.set(k, []).get(k)).push(i); });
  R.forEach((r, i) => { const a = Math.floor(r.lat / CELL), b = Math.floor(r.lon / CELL);
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (const j of G.get((a + x) + ',' + (b + y)) || []) { if (j <= i) continue; const o = R[j];
      if (o.cls !== r.cls || km(r.lat, r.lon, o.lat, o.lon) > 2) continue;
      const same = o.key === r.key; if (!same && !spelling(o.key, r.key)) continue;
      const p = find(i), q = find(j); if (p !== q) { parent[Math.max(p, q)] = Math.min(p, q); if (!same) C.merged_spelling_2km++; } } }); }
/* a large place is one place across more than 2 km: two populated rows of the same name are also one place when the straight line between
   them runs through urban land only (Degree of Urbanisation level 2, Dijkstra et al. 2021, data/feat/f_settle: classes 1 city centre,
   2 town, 3 suburb; sampled every 250 m). Searched up to 40 km apart (the width of the largest city), the land decides. */
C.merged_same_name_urban = 0;
{ const FG = createFeatGrid(DATA); const urban = (la, lo) => { const v = FG.value('f_settle', la, lo); return v != null && v >= 1 && v <= 3; };
  const byK = new Map(); R.forEach((r, i) => { if (r.cls !== 'place') return; (byK.get(r.key) || byK.set(r.key, []).get(r.key)).push(i); });
  for (const idx of byK.values()) { if (idx.length < 2) continue;
    for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) { const i = idx[x], j = idx[y]; if (find(i) === find(j)) continue; const a = R[i], b = R[j]; const d = km(a.lat, a.lon, b.lat, b.lon);
      if (d <= 2 || d > 40) continue; const n = Math.ceil(d / 0.25); let ok = true;
      for (let k = 0; k <= n && ok; k++) ok = urban(a.lat + (b.lat - a.lat) * k / n, a.lon + (b.lon - a.lon) * k / n);
      if (ok) { const p = find(i), q = find(j); parent[Math.max(p, q)] = Math.min(p, q); C.merged_same_name_urban++; } } } }
const groups = new Map(); R.forEach((r, i) => { const g = find(i); (groups.get(g) || groups.set(g, []).get(g)).push(r); });
C.merged_same_name_2km = R.length - groups.size - C.merged_same_name_urban - C.merged_spelling_2km;
const srcRank = (r) => (r.src === 'geonames' && /^PPL(C|A|A2)$/.test(r.fcode)) ? 0 : (r.src === 'osm-area' || r.src === 'osm-feature') ? 1 : r.src === 'geonames' ? 2 : r.src === 'osm' ? 3 : r.src === 'page-table' ? 4 : 5;
let REC = [];
for (const g of groups.values()) {
  g.sort((a, b) => (b.pop - a.pop) || (srcRank(a) - srcRank(b)) || (a.lat - b.lat) || (a.lon - b.lon));
  const b = g[0]; const names = new Map();
  for (const r of g) for (const n of [r.name, r.ascii, ...r.alts]) { const t = String(n || '').trim(); if (t && !names.has(norm(t))) names.set(norm(t), t); }
  const area = g.filter((r) => r.src === 'osm-area' && r.geom).sort((x, y) => x.areaM2 - y.areaM2)[0] || null;
  REC.push({ name: display(b.name), key: b.key, names, lat: b.lat, lon: b.lon, fcode: b.fcode, cls: b.cls, rep: b, pop: Math.max(...g.map((r) => r.pop || 0)),
    fams: new Set(g.map((r) => r.fam)), listed: g.some((r) => r.listed), srcs: [...new Set(g.map((r) => r.src))].sort(), province: b.province, district: b.district, tehsil: b.tehsil, unitId: b.unitId,
    geom: area ? area.geom : null, areaM2: area ? area.areaM2 : 0, elevM: b.dem != null ? b.dem : null,
    seat: g.some((r) => r.src === 'geonames' && r.fcode === 'PPLC') ? 'national' : g.some((r) => r.src === 'geonames' && r.fcode === 'PPLA') ? 'provincial' : g.some((r) => r.src === 'geonames' && r.fcode === 'PPLA2') ? 'district' : null, ptype: (g.find((r) => r.ptype) || {}).ptype || null, areaKind: area ? area.areaKind : null, members: g });
}
/* ---- 7 confirmed ---- */
{ const G = new Map(); R.forEach((r) => { const k = Math.floor(r.lat / 0.05) + ',' + Math.floor(r.lon / 0.05); (G.get(k) || G.set(k, []).get(k)).push(r); });
  let byPop = 0, byFam = 0, byNear = 0, byListed = 0;
  for (const x of REC) {
    if (x.pop > 0) { x.confirmed = 'population'; byPop++; continue; }
    if (x.fams.size >= 2) { x.confirmed = 'two sources'; byFam++; continue; }
    if (x.listed) { x.confirmed = 'listed by OpenStreetMap'; byListed++; continue; }
    const keys = [...x.names.keys()]; const a = Math.floor(x.lat / 0.05), b = Math.floor(x.lon / 0.05); let hit = false;
    for (let i = -1; i <= 1 && !hit; i++) for (let j = -1; j <= 1 && !hit; j++) for (const o of G.get((a + i) + ',' + (b + j)) || []) {
      if (x.fams.has(o.fam) || km(x.lat, x.lon, o.lat, o.lon) > 5) continue; const ok = keyOf(o); if (keys.some((k) => similar(k, ok))) { hit = true; break; } }
    if (hit) { x.confirmed = 'second source within 5 km'; byNear++; } else x.confirmed = null;
  }
  C.confirmed_by_population = byPop; C.confirmed_by_two_sources_merged = byFam; C.confirmed_by_second_source_within_5km = byNear; C.confirmed_listed_by_osm = byListed; }
/* ---- 8 no buildings ---- */
{ const FG = createFeatGrid(DATA); const any = (band, la, lo) => { for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const v = FG.value(band, la + i * 0.0025, lo + j * 0.0025); if (v != null && v > 0) return true; } return false; };
  const n = REC.length; REC = REC.filter((x) => x.confirmed || x.cls !== 'place' || any('p_pop', x.lat, x.lon) || any('s_wc_built', x.lat, x.lon)); C.dropped_no_buildings = n - REC.length; }
/* ---- kinds ---- */
const FKIND = { STM: 'stream', LK: 'lake', LKI: 'seasonal lake', RSV: 'reservoir', GLCR: 'glacier', MT: 'mountain', MTS: 'mountains', PK: 'peak', PASS: 'pass', VAL: 'valley', AIRP: 'airport', DAM: 'dam' };
for (const x of REC) {
  const f = x.fcode, p = x.pop;
  x.kind = x.cls === 'landmark' ? 'landmark' : f === 'PPLC' ? 'capital' : (f === 'PPLA' || (x.cls === 'place' && p >= 100000)) ? 'city' : f === 'PPLA2' ? 'town'
    : x.cls === 'place' ? (p >= 10000 ? 'town'
      : (/^PPL(X|L)$/.test(f) || (f === 'AREA' && x.areaKind === 'residential') || /^(suburb|neighbourhood)$/.test(x.ptype || '') || x.rep.src === 'extra') ? 'locality'
      : (x.ptype === 'city' || x.ptype === 'town') ? 'town' : 'village')
    : (FKIND[f] || 'feature');
}
/* 283.19: a populated record named as its own tehsil or district, or carrying a cantonment word, is a town (never 'village'), and is
   written as the unit writes it (Lahore Cant -> Lahore Cantt) */
C.unit_named_not_village = 0; C.unit_spelling_applied = 0;
for (const x of REC) { if (x.cls !== 'place') continue; const k = canon(x.key);
  const unit = [x.tehsil, x.district].filter(Boolean).find((u) => canon(norm(u)) === k);
  if (x.kind === 'village' && (unit || /\bcantt\b/.test(k))) { x.kind = 'town'; C.unit_named_not_village++; }
  if (unit && norm(unit) !== x.key) { x.names.set(norm(unit), display(unit)); x.name = display(unit); x.key = norm(unit); C.unit_spelling_applied++; } }
/* ---- 9 units ---- */
const anchorOf = (u) => { const a = ANCH[u.unitId] && ANCH[u.unitId].anchor; return a && Number.isFinite(a.lat) && Number.isFinite(a.lon) ? a : null; };
const anchorPeople = (u) => { const a = anchorOf(u); return a ? (a.population || a.peopleWithin750m || 0) : -1; };
const UREC = []; C.unit_anchor_outside_own_polygon = 0;
function unitRec(level, name, id, lat, lon, labels, disputed, standsAt) {
  const at = unitAt(lat, lon);
  return { id, level, name, key: norm(name), names: new Map([[norm(name), name]]), lat, lon, kind: level, pop: 0, confirmed: 'AGN unit index', srcs: ['agn-units'],
    province: labels.province, district: labels.district, tehsil: labels.tehsil != null ? labels.tehsil : (at ? at.tehsil : null), unitId: labels.unitId != null ? labels.unitId : (at ? at.unitId : null),
    disputed: !!disputed, standsAt: standsAt || null };
}
for (const u of T) {
  let a = anchorOf(u), lat = a ? a.lat : u.lat, lon = a ? a.lon : u.lon, standsAt = a ? display(a.name) : null;
  const at = unitAt(lat, lon); if (!u.disputed && (!at || at.unitId !== u.unitId)) { C.unit_anchor_outside_own_polygon++; if ((unitAt(u.lat, u.lon) || {}).unitId === u.unitId) { lat = u.lat; lon = u.lon; standsAt = null; } }
  UREC.push(unitRec('tehsil', u.tehsil, 'T:' + u.unitId, lat, lon, { province: u.province, district: u.district, tehsil: u.tehsil, unitId: u.unitId }, u.disputed, standsAt));
}
{ const D = new Map(); for (const u of T) { const k = u.province + '|' + u.district; (D.get(k) || D.set(k, []).get(k)).push(u); }
  for (const [k, ts] of D) { const dn = norm(ts[0].district).replace(/ district$/, '');
    const own = ts.find((t) => norm(t.tehsil) === dn) || ts.filter((t) => norm(t.tehsil).startsWith(dn + ' ')).sort((x, y) => anchorPeople(y) - anchorPeople(x))[0]; const best = own || ts.slice().sort((x, y) => anchorPeople(y) - anchorPeople(x))[0];
    const tr = UREC.find((r) => r.id === 'T:' + best.unitId);
    if (ts[0].disputed) continue;   /* IIOJK: one record (its tehsil record) */
    UREC.push(unitRec('district', ts[0].district, 'D:' + k, tr.lat, tr.lon, { province: ts[0].province, district: ts[0].district, tehsil: tr.tehsil, unitId: tr.unitId }, false, tr.standsAt)); }
  const P = new Map(); for (const u of T) { if (u.disputed) continue; (P.get(u.province) || P.set(u.province, []).get(u.province)).push(u); }
  for (const [pv, ts] of P) { const best = ts.slice().sort((x, y) => anchorPeople(y) - anchorPeople(x))[0]; const tr = UREC.find((r) => r.id === 'T:' + best.unitId);
    UREC.push(unitRec('province', pv, 'V:' + pv, tr.lat, tr.lon, { province: pv, district: tr.district, tehsil: tr.tehsil, unitId: tr.unitId }, false, tr.standsAt)); } }
C.units_added = { tehsil: UREC.filter((r) => r.level === 'tehsil').length, district: UREC.filter((r) => r.level === 'district').length, province: UREC.filter((r) => r.level === 'province').length };
/* ---- 10 names: Urdu, aliases, spellings ---- */
{ const G = new Map(); REC.forEach((x) => { const k = Math.floor(x.lat * 10) + ',' + Math.floor(x.lon * 10); (G.get(k) || G.set(k, []).get(k)).push(x); });
  let joined = 0, none = 0;
  for (const [u, v] of Object.entries(URDU)) { if (!v || !Number.isFinite(v.lat)) continue; const k = norm(v.name), a = Math.floor(v.lat * 10), b = Math.floor(v.lon * 10); let best = null, bd = 2;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const x of G.get((a + i) + ',' + (b + j)) || []) { if (!x.names.has(k)) continue; const d = km(v.lat, v.lon, x.lat, x.lon); if (d <= bd) { bd = d; best = x; } }
    if (best) { if (!best.names.has(norm(u))) best.names.set(norm(u), u); joined++; } else none++; }
  C.urdu_names_joined = joined; C.urdu_names_without_record = none; }
{ const ALL = REC.concat(UREC); const byName = new Map(); for (const x of ALL) for (const k of x.names.keys()) (byName.get(k) || byName.set(k, []).get(k)).push(x);
  let a1 = 0, a0 = 0;
  for (const { alias, of } of ALI.aliases || []) { const c = (byName.get(norm(of)) || []).filter((x) => x.key === norm(of));
    const place = c.filter((x) => !x.level && x.confirmed).sort((x, y) => (y.pop - x.pop))[0];
    const unit = c.filter((x) => x.level).sort((x, y) => ['province', 'district', 'tehsil'].indexOf(x.level) - ['province', 'district', 'tehsil'].indexOf(y.level))[0];
    const t = place || unit; if (!t) { a0++; continue; } if (!t.names.has(norm(alias))) t.names.set(norm(alias), alias); a1++; }
  let s1 = 0;
  for (const s of ALI.spellings || []) { for (const x of REC) { if (s.near && km(x.lat, x.lon, s.near[0], s.near[1]) > (s.km || 1)) continue;
    if (x.key === norm(s.from)) { x.names.set(norm(s.to), s.to); x.name = s.to; x.key = norm(s.to); s1++; }
    else if (x.key === norm(s.to) && !x.names.has(norm(s.from))) { x.names.set(norm(s.from), s.from); s1++; } } }
  C.aliases_joined = a1; C.aliases_without_record = a0; C.spellings_applied = s1; }
/* ---- output ---- */
const FNV = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
const ids = new Set(); const rows = [];
const all = REC.map((x) => ({ ...x, level: 'place' })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || (a.lat - b.lat) || (a.lon - b.lon)).concat(UREC);
for (const x of all) {
  let id = x.id || ('P' + FNV(x.key + '|' + x.lat.toFixed(4) + '|' + x.lon.toFixed(4))); let s = id, n = 1; while (ids.has(s)) s = id + '.' + (++n); ids.add(s);
  const alt = [...x.names.values()].filter((t) => norm(t) !== x.key && t !== x.name).join('|');
  rows.push([s, x.name, alt, +x.lat.toFixed(5), +x.lon.toFixed(5), x.kind, x.level, x.pop || 0, x.province || null, x.district || null, x.tehsil || null, x.unitId || null,
    x.srcs.join('+'), x.confirmed ? 1 : 0, x.disputed ? 1 : 0, x.standsAt || null, x.seat || null, x.elevM != null ? x.elevM : null]);
}
const OUTLINES = {}; let nOut = 0;
all.forEach((x, k) => { if (!x.geom || x.level !== 'place') return; nOut++;
  OUTLINES[rows[k][0]] = { m2: Math.round(x.areaM2), p: x.geom.map((piece) => piece.map((ring) => { const o = []; let px = 0, py = 0; for (const [lo, la] of ring) { const X = Math.round(lo * 1e5), Y = Math.round(la * 1e5); o.push(X - px, Y - py); px = X; py = Y; } return o; })) }; });
C.area_outlines = nOut;
C.rows_out = rows.length; C.places_out = REC.length; C.unconfirmed = rows.filter((r) => !r[13]).length;
C.kinds = rows.reduce((m, r) => (m[r[5]] = (m[r[5]] || 0) + 1, m), {});
const HISAAB = { rows_in: 195667, dropped_abandoned: 1063, dropped_unit_labels: 499, dropped_no_buildings: 9709, merged_same_name_2km: 3233, dropped_outside_districts: 1440, rows_out: 179723, unconfirmed: 128365 };
const TABLE = { schema: 'agn.places.v1', what: 'NIGRAAN\'s one place table: every name the place search offers, the point every name stands for, and the tehsil, district and province of that point from the official tehsil polygons. Built by scripts/places/build_places.mjs; read only by server/api/places.mjs.',
  built: new Date().toISOString().slice(0, 10),
  columns: ['id', 'name', 'alt', 'lat', 'lon', 'kind', 'level', 'pop', 'province', 'district', 'tehsil', 'unitId', 'sources', 'confirmed', 'disputed', 'standsAt', 'seat', 'elevM'],
  licences: ['GeoNames (CC BY 4.0)', 'OpenStreetMap contributors (ODbL 1.0)', 'AI Geo Navigators boundary data (2026), bundle 3.3.0'], cleaning: C, rows,
  outlines: OUTLINES, outlinesNote: 'outlines of the records built from OpenStreetMap named areas: {id: {m2: area, p: [piece: [ring: [lon, lat in 1e-5 degrees, first absolute then differences]]]}}; a point is in a record when it is inside a piece (even-odd over its rings)' };
mkdirSync(dirname(OUT), { recursive: true });
const body = gzipSync(Buffer.from(JSON.stringify(TABLE), 'utf8'), { level: 9 });
writeFileSync(OUT, body);
const META = { schema: 'agn.places-receipt.v1', built: TABLE.built, table: relative(ROOT, OUT).split('\\').join('/'), tableSha256: createHash('sha256').update(body).digest('hex'), tableBytes: body.length,
  builder: 'scripts/places/build_places.mjs', method: 'see the header of the builder (steps 1-10)', inputs: INPUTS, cleaning: C, hisaab: HISAAB,
  hisaabComparison: [
    'HISAAB (sister platform, 23 Oct 2026) built its search store from the same NIGRAAN gazetteer (GeoNames PK + OSM supplement) by a script that is not available; its counts are its own receipt.',
    'rows_in: NIGRAAN also reads the OSM named areas, the Islamabad sector supplement and the page settlement table (' + RAW.length + ' rows in, HISAAB 195,667).',
    'outside / IIOJK: NIGRAAN tests the official tehsil polygons (bundle 3.3.0, 11 m) and drops IIOJK separately; HISAAB tested its district polygons.',
    'merge: NIGRAAN merges by name key within 2 km inside a class (populated place, landmark, one natural-feature code) across and within sources, which includes the three extra sources.',
    'no buildings: NIGRAAN drops only UNCONFIRMED populated places with no people and no built land within ~600 m (WorldPop 2020 constrained + ESA WorldCover 2021); a confirmed place is never dropped for want of buildings at its point. HISAAB\'s evidence layer and order are not recorded.',
    'confirmed: NIGRAAN also counts a similar name of another source family within 5 km (HISAAB: population or an OSM match), so fewer records are unconfirmed.',
    'units: NIGRAAN adds its 577 tehsils, districts and provinces as records of the same table; HISAAB keeps units in separate boundary files.'] };
writeFileSync(join(dirname(OUT), 'places.meta.json'), JSON.stringify(META, null, 1));
console.log(JSON.stringify(C, null, 1));
