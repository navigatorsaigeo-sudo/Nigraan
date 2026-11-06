/* == v91.17.283.18 . THE ONE PLACE LAYER ==================================================================================================
   Every place question the server answers - the search box of both pages, the point of a name, the name of a point, the places around a
   point, the AI's place words, the report's "where this is", the flood facts' place - is answered here, from ONE table:
     data/geo/places.json.gz   built offline by scripts/places/build_places.mjs (receipt data/geo/places.meta.json): GeoNames PK, the
                               OpenStreetMap supplement and named areas, the Islamabad sector supplement, the settlement table that was
                               embedded in the analyst page, the AGN unit index; cleaned, merged and labelled by the official tehsil
                               polygons at build time (method in the builder's header)
   and the official tehsil polygons (data/pk-tehsils-fine.json.gz, through unitresolve.mjs) for any point. Nothing else is read for a
   place: the GeoNames dump, the OSM supplement, the hand supplement, the OSM area polygons, the street index, the spelling rules, the alias
   list in code, the provider's geocoder and the client-side place tables are gone from the serving path (v283.18 package notes).

   createPlaces(app) -> {
     search(q, { limit, suggest })  the search box: typed coordinates; places, tehsils, districts, provinces by name. One ranking:
                                    match class (exact name or alternate name, start of the name, start of a word, a word of an alternate
                                    name, a spelling within 1-2 edits), then confirmed before 'name not confirmed', then kind, then
                                    population. HISAAB's rule (23 Oct 2026): an unconfirmed record whose name is the name of a confirmed
                                    place or of a tehsil, district or province is not offered (the GeoNames "Sialkot" point in Lower Dir);
                                    every other unconfirmed record IS offered, after the confirmed ones, labelled "name not confirmed".
                                    A tehsil or district row is not listed beside a confirmed town of the same name that lies in it (one
                                    place, one row) unless the query names the unit ("X tehsil", "X district").
     resolvePoint(lat, lon)          the point: tehsil, district, province and unit by polygon (outside every polygon: the shore rule,
                                    else outside), the forecast height, and the named place that names it (the OSM area holding it, else
                                    the nearest confirmed populated place, said as "near" / "km of", never as "at" unless within 100 m)
     byId(id), near(lat, lon, opts), hasName(name), status(), warm()
   }
   Every row any of these returns carries district AND tehsil from the polygons (the builder stored them for every record; a point is
   resolved by the same resolver at run time), so a searched place and the same point clicked on the map name the same tehsil. */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { createPointHeight } from './pointheight.mjs';
import { unitAtPoint } from './unitresolve.mjs';

let TERR = null; import('./territory.mjs').then((m) => { TERR = m; }).catch(() => { TERR = null; });

/* ---- the name key and distances (shared with the builder) ---- */
export function norm(s) {
  return String(s == null ? '' : s).normalize('NFKD').replace(/\p{M}+/gu, '')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[هھۃة]/g, 'ہ').replace(/[ـ‌-‏]/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
export function display(s) {
  const t = String(s == null ? '' : s).trim();
  return /[؀-ۿ]/.test(t) ? t : t.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC');
}
export function km(a, b, c, d) {
  const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, x)));
}
export function editDistance(a, b, cap) {
  if (a === b) return 0; if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; let mn = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < mn) mn = cur[j]; }
    if (mn > cap) return cap + 1; prev = cur; }
  return prev[b.length];
}
/* the corroboration rule of the place audit (25 Oct 2026): equal; one is the other plus words; 1 edit (4+ letters) or 2 (8+) */
export function similar(a, b) {
  if (!a || !b) return false; if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (l.startsWith(s + ' ') || l.endsWith(' ' + s)) return true;
  const cap = s.length >= 8 ? 2 : s.length >= 4 ? 1 : 0;
  return cap > 0 && editDistance(a, b, cap) <= cap;
}
const bearing16 = (lat1, lon1, lat2, lon2) => { const r = Math.PI / 180; const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r); const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  const b = ((Math.atan2(y, x) / r) + 360) % 360; return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(b / 22.5) % 16]; };

/* ---- typed coordinates (CEO, v91.17.77): "33.69, 73.05", "33.69 73.05", "33 41' N 73 03' E", "N33.69 E73.05" ----
   Decimal degrees, degrees-minutes(-seconds), hemisphere letters before or after, comma / semicolon / space between. With no letters the
   first number is the latitude; a pair that can only be read the other way round for Pakistan is swapped and says so. The whole string
   must be consumed, so a name with digits ("E-7", "Chak 42") never parses. */
export function parseCoords(text) {
  let s = String(text || '').trim();
  if (!s || s.length > 80 || !/\d/.test(s)) return null;
  s = s.replace(/[′’´`]/g, "'").replace(/[″”]|''/g, '"').replace(/º|˚/g, '°').replace(/\s+/g, ' ');
  if (/^-?\d{1,3},\d+\s+-?\d{1,3},\d+$/.test(s)) s = s.replace(/,/g, '.');
  const H = '([NSEW])?', HT = '([NSEW])?';
  const RX = [
    [new RegExp('^\\s*' + H + '\\s*(\\d{1,3})\\s*(?:°|deg\\b|d\\b)\\s*(?:(\\d{1,2}(?:\\.\\d+)?)\\s*(?:\'|min\\b|m\\b)?\\s*(?:(\\d{1,2}(?:\\.\\d+)?)\\s*(?:"|sec\\b|s\\b)?)?)?\\s*' + HT, 'i'), 'dms'],
    [new RegExp('^\\s*' + H + '\\s*(\\d{1,3})\\s+(\\d{1,2}(?:\\.\\d+)?)(?:\\s+(\\d{1,2}(?:\\.\\d+)?))?\\s*' + HT, 'i'), 'spaced'],
    [new RegExp('^\\s*' + H + '\\s*(-?\\d{1,3}(?:\\.\\d+)?)\\s*(?:°)?\\s*' + HT, 'i'), 'dec'],
  ];
  const RXN = RX.map(([rx, kind]) => [new RegExp(rx.source.replace(/\(\[NSEW\]\)\?$/, '(?:([NSEW])(?!\\s*-?\\d))?'), 'i'), kind]);
  function one(str, noTrail) {
    for (const [rx, kind] of (noTrail ? RXN : RX)) {
      const m = rx.exec(str); if (!m || !m[0].trim()) continue;
      const h1 = m[1] ? m[1].toUpperCase() : null, h2 = (kind === 'dec' ? m[3] : m[5]) ? (kind === 'dec' ? m[3] : m[5]).toUpperCase() : null;
      if (h1 && h2) continue;
      const h = h1 || h2;
      if (kind === 'spaced' && !h) continue;
      let v;
      if (kind === 'dec') { v = Number(m[2]); const marked = !!h || /°/.test(m[0]); if (!/\./.test(m[2]) && !marked) continue; }
      else { const mi = m[3] != null ? Number(m[3]) : 0, se = m[4] != null ? Number(m[4]) : 0; if (mi >= 60 || se >= 60) continue; v = Number(m[2]) + mi / 60 + se / 3600; }
      if (h === 'S' || h === 'W') v = -Math.abs(v);
      return { v, h, rest: str.slice(m[0].length), dms: kind !== 'dec' && (m[3] != null) };
    }
    return null;
  }
  let a = null, b = null;
  for (const nt of [false, true]) {
    const a1 = one(s, nt); if (!a1) continue;
    const rest = a1.rest.replace(/^\s*[,;/]\s*|^\s+/, ''); if (!rest) continue;
    const b1 = one(rest, false); if (!b1 || b1.rest.trim()) continue;
    a = a1; b = b1; break;
  }
  if (!a || !b) return null;
  let lat, lon, swapped = false;
  const latH = (h) => h === 'N' || h === 'S', lonH = (h) => h === 'E' || h === 'W';
  if (a.h || b.h) {
    if (a.h && b.h) { if (latH(a.h) && lonH(b.h)) { lat = a.v; lon = b.v; } else if (lonH(a.h) && latH(b.h)) { lat = b.v; lon = a.v; } else return null; }
    else if (a.h) { if (latH(a.h)) { lat = a.v; lon = b.v; } else { lon = a.v; lat = b.v; } }
    else { if (lonH(b.h)) { lat = a.v; lon = b.v; } else { lat = b.v; lon = a.v; } }
  } else {
    lat = a.v; lon = b.v;
    if (!(lat >= 23 && lat <= 38) && (lon >= 23 && lon <= 38) && (lat >= 60 && lat <= 80)) { lat = b.v; lon = a.v; swapped = true; }
  }
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) return null;
  return { lat: +lat.toFixed(6), lon: +lon.toFixed(6), how: a.dms || b.dms ? 'degrees, minutes and seconds' : 'decimal degrees', swapped };
}
export function coordLabel(lat, lon) {
  return Math.abs(lat).toFixed(5) + '° ' + (lat >= 0 ? 'N' : 'S') + ', ' + Math.abs(lon).toFixed(5) + '° ' + (lon >= 0 ? 'E' : 'W');
}

export const PLACES_FILE = join('geo', 'places.json.gz');
const POPULATED = new Set(['capital', 'city', 'town', 'village', 'locality']);
const KIND_RANK = { capital: 0, city: 1, town: 2, province: 3, district: 3, tehsil: 3, village: 4, locality: 5, landmark: 7 };
const kindRank = (r) => (KIND_RANK[r.kind] != null ? KIND_RANK[r.kind] : 8);
const UNIT_WORD = /\s+(tehsil|tahsil|taluka|district|province)$/;

/* the table, parsed into records with their name keys; indexes: by name key, by the first two letters of every word of every name
   (HISAAB's index: a key matches only at the start of a word), and a 0.1 degree grid for points */
function* loadSteps(dataDir) {
  const f = join(dataDir, PLACES_FILE);
  if (!existsSync(f)) return { error: 'no place table (data/geo/places.json.gz): run scripts/places/build_places.mjs' };
  const T = JSON.parse(gunzipSync(readFileSync(f)).toString('utf8')); yield 0;
  const ci = Object.fromEntries(T.columns.map((c, i) => [c, i]));
  const rec = [], byKey = new Map(), heads = new Map(), grid = new Map(), byId = new Map(), first = new Map();
  const addKey = (k, i) => { let a = byKey.get(k); if (!a) byKey.set(k, (a = [])); a.push(i); };
  const addHead = (h, i) => { let a = heads.get(h); if (!a) heads.set(h, (a = [])); if (a[a.length - 1] !== i) a.push(i); };
  let n = 0;
  for (const row of T.rows) {
    if (++n % 5000 === 0) yield n;
    const r = { id: row[ci.id], name: row[ci.name], alt: row[ci.alt] ? String(row[ci.alt]).split('|') : [], lat: row[ci.lat], lon: row[ci.lon], kind: row[ci.kind], level: row[ci.level],
      pop: row[ci.pop] || 0, province: row[ci.province], district: row[ci.district], tehsil: row[ci.tehsil], unitId: row[ci.unitId], sources: row[ci.sources],
      confirmed: !!row[ci.confirmed], disputed: !!row[ci.disputed], standsAt: row[ci.standsAt] || null, seat: row[ci.seat] || null, elevM: row[ci.elevM] != null ? row[ci.elevM] : null };
    r.key = norm(r.name); r.altKeys = [...new Set(r.alt.map(norm).filter((k) => k && k !== r.key))];
    const i = rec.push(r) - 1; byId.set(r.id, i);
    addKey(r.key, i); for (const k of r.altKeys) addKey(k, i);
    for (const k of [r.key, ...r.altKeys]) for (const w of k.split(' ')) if (w.length >= 2) addHead(w.slice(0, 2), i); else if (w) addHead(w, i);
    if (r.key) { const c = r.key[0]; let a = first.get(c); if (!a) first.set(c, (a = new Set())); a.add(r.key); }
    if (r.level === 'place') { const g = Math.floor(r.lat * 10) + ',' + Math.floor(r.lon * 10); let a = grid.get(g); if (!a) grid.set(g, (a = [])); a.push(i); }
  }
  /* the outlines of the records built from OpenStreetMap named areas, in a 0.05 degree grid by their bounding box */
  const outl = new Map(), ogrid = new Map(); let no = 0;
  for (const [id, o] of Object.entries(T.outlines || {})) { const i = byId.get(id); if (i == null) continue; if (++no % 500 === 0) yield n + no;
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    const pieces = o.p.map((piece) => piece.map((d) => { const a = new Float64Array(d.length); let x = 0, y = 0; for (let k = 0; k < d.length; k += 2) { x += d[k]; y += d[k + 1]; a[k] = x / 1e5; a[k + 1] = y / 1e5;
      if (a[k] < x0) x0 = a[k]; if (a[k] > x1) x1 = a[k]; if (a[k + 1] < y0) y0 = a[k + 1]; if (a[k + 1] > y1) y1 = a[k + 1]; } return a; }));
    outl.set(i, { m2: o.m2, pieces, bbox: [x0, y0, x1, y1] });
    for (let gy = Math.floor(y0 * 20); gy <= Math.floor(y1 * 20); gy++) for (let gx = Math.floor(x0 * 20); gx <= Math.floor(x1 * 20); gx++) { const k = gy + ',' + gx; let a = ogrid.get(k); if (!a) ogrid.set(k, (a = [])); a.push(i); } }
  const towns = []; rec.forEach((r, i) => { if (r.level === 'place' && r.confirmed && POPULATED.has(r.kind) && r.pop >= 20000) towns.push(i); });   /* the towns of 20,000 people or more */
  /* the taken names: confirmed places and every tehsil, district and province */
  const taken = new Set(); for (const r of rec) if (r.confirmed || r.level !== 'place') { taken.add(r.key); if (r.level !== 'place') taken.add(r.key.replace(/ district$/, '')); }
  /* the qualifier vocabulary: every tehsil, district and province name (a trailing "Lahore" in "Gulberg Lahore") */
  const qual = new Set(); for (const r of rec) if (r.level !== 'place' && !r.disputed) { qual.add(r.key); qual.add(r.key.replace(/ district$/, '')); }
  return { T: { built: T.built, schema: T.schema, cleaning: T.cleaning, columns: T.columns }, rec, byKey, heads, grid, byId, taken, qual, first: new Map([...first].map(([c, s]) => [c, [...s]])), outl, ogrid, towns, mtime: statSync(f).mtimeMs };
}

/* v91.17.283.20 · item B7 · the one point a provider reachability probe asks (governance AT05, the failover test, the providers probe):
   the place table's first town, else the first undisputed unit of the AGN unit index; no coordinate written in code */
export function probePointOf(app) {
  let t = null; try { t = app.places && app.places.towns ? app.places.towns()[0] : null; } catch (_) { t = null; }
  if (!t) { try { t = (app.units && app.units.tehsil || []).find((u) => u && !u.disputed && Number.isFinite(u.lat) && Number.isFinite(u.lon)) || null; } catch (_) { t = null; } }
  return t && Number.isFinite(t.lat) && Number.isFinite(t.lon) ? { latitude: t.lat, longitude: t.lon } : null;
}

export function createPlaces(app) {
  const dataDir = app.dataDir;
  let P = undefined, GEN = null, err = null;
  const PL = () => { if (P === undefined) { try { if (!GEN) GEN = loadSteps(dataDir); let r = GEN.next(); while (!r.done) r = GEN.next(); P = r.value && r.value.rec ? r.value : null; err = r.value && r.value.error || null; } catch (e) { P = null; err = 'place table unreadable: ' + e.message; } GEN = null;
    if (P) console.log('  places     one place table: ' + P.rec.length + ' records (' + P.rec.filter((r) => r.level === 'place').length + ' places, ' + P.rec.filter((r) => r.level !== 'place').length + ' units), built ' + P.T.built);
    else console.log('  places     ' + (err || 'no place table')); } return P; };
  let PH = null; const ph = () => { if (PH === null) { try { PH = createPointHeight(dataDir); } catch (_) { PH = false; } } return PH || null; };

  /* ---- a point ---- */
  function pointRow(lat, lon, parsed) {
    const row = { name: coordLabel(lat, lon), lat, lon, level: 'coordinates', source: 'typed coordinates', score: 100, fuzzy: false,
      matchedOn: 'read as ' + (parsed && parsed.how || 'decimal degrees') + (parsed && parsed.swapped ? ' (longitude first: the first number cannot be a Pakistan latitude)' : '') };
    let u = null; try { u = unitAtPoint(app, lat, lon); } catch (_) { u = null; }
    const unit = u && u.by === 'polygon' ? u.unit : null;
    if (unit && !unit.disputed) Object.assign(row, { administered: true, unitId: unit.unitId, tehsil: unit.tehsil || unit.name, district: unit.district, province: unit.province, by: 'polygon' });
    else if (unit && unit.disputed) Object.assign(row, { administered: false, disputed: true, unitId: unit.unitId, province: unit.province, tehsil: null, district: null,
      why: 'this point is in Indian Illegally Occupied Jammu & Kashmir (disputed territory). NIGRAAN publishes no forecast or hazard level there.' });
    else {
      let c = null; try { c = TERR && TERR.classifyOutside ? TERR.classifyOutside(dataDir, (app.units && app.units.tehsil) || [], lat, lon) : null; } catch (_) { c = null; }
      if (c && c.kind === 'snapped' && c.unit) Object.assign(row, { administered: true, unitId: c.unit.unitId, tehsil: c.unit.tehsil || c.unit.name, district: c.unit.district, province: c.unit.province, snapped: { km: c.km }, by: 'shore rule' });
      else if (c && c.kind === 'sea') Object.assign(row, { administered: false, atSea: true, tehsil: null, district: null, why: TERR.SEA_WHY });
      else Object.assign(row, { administered: false, outside: true, tehsil: null, district: null,
        why: 'this point is outside Pakistan-administered territory' + (u && u.unit ? ' (the nearest tehsil, ' + (u.unit.tehsil || u.unit.name) + ', is ' + u.km + ' km away)' : '') + '. NIGRAAN publishes no forecast or hazard level there.' });
    }
    let h = null; try { h = ph() && ph().heightAt(lat, lon); } catch (_) { h = null; }
    if (h && h.ok && h.basis === 'place30' && h.elevM != null) Object.assign(row, { elevM: Math.round(h.elevM), forecastElevM: Math.round(h.elevM), heightBasis: '30 m terrain',
      elevSource: 'height from 30 m terrain (the named place ' + (h.place && h.place.distM != null ? h.place.distM + ' m away' : 'at this point') + ')' });
    else if (h && h.ok && h.basis === 'cell30' && h.cellElevM != null) {
      const rough = !h.sendElevation;
      Object.assign(row, { elevM: rough ? null : Math.round(h.cellElevM), cellElevM: Math.round(h.cellElevM), forecastElevM: rough ? null : Math.round(h.cellElevM), heightBasis: rough ? 'forecast provider terrain' : '250 m terrain', reliefM: h.cell ? h.cell.reliefM : null,
        elevSource: rough ? ('height from 250 m terrain (cell mean ' + Math.round(h.cellElevM) + ' m; the cell spans ' + (h.cell && h.cell.reliefM) + ' m of relief, so the forecast is asked at the forecast provider’s own terrain height for the point)')
                          : 'height from 250 m terrain (cell mean)' });
    } else Object.assign(row, { elevM: null, forecastElevM: null, heightBasis: null, elevSource: 'no terrain height held for this point: the forecast provider’s own terrain height is used' });
    return row;
  }
  /* the populated place records within r km of a point, nearest first */
  function around(lat, lon, rKm, f) {
    const p = PL(); if (!p) return [];
    const dLa = Math.ceil(rKm / 11.1) + 1, dLo = Math.ceil(rKm / (11.1 * Math.max(0.2, Math.cos(lat * Math.PI / 180)))) + 1, la0 = Math.floor(lat * 10), lo0 = Math.floor(lon * 10), out = [];
    for (let a = -dLa; a <= dLa; a++) for (let b = -dLo; b <= dLo; b++) for (const i of p.grid.get((la0 + a) + ',' + (lo0 + b)) || []) {
      const r = p.rec[i]; if (f && !f(r)) continue; const d = km(lat, lon, r.lat, r.lon); if (d <= rKm) out.push({ r, d }); }
    return out.sort((x, y) => x.d - y.d);
  }
  /* the record whose outline holds the point (even-odd over the rings of a piece); the smallest such area wins (F-11/1 inside F-11) */
  const inRing = (x, y, a) => { let c = false; for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) { const xi = a[i], yi = a[i + 1], xj = a[j], yj = a[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  function containing(lat, lon) {
    const p = PL(); if (!p) return null; let best = null;
    for (const i of p.ogrid.get(Math.floor(lat * 20) + ',' + Math.floor(lon * 20)) || []) { const o = p.outl.get(i); const b = o.bbox; if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      if (!o.pieces.some((piece) => { let c = false; for (const ring of piece) if (inRing(lon, lat, ring)) c = !c; return c; })) continue;
      if (!best || o.m2 < best.m2) best = { r: p.rec[i], m2: o.m2 }; }
    return best ? { r: best.r, d: km(lat, lon, best.r.lat, best.r.lon), m2: best.m2 } : null;
  }
  const brief = (r, extra) => ({ id: r.id, name: r.name, kind: r.kind, level: r.level, lat: r.lat, lon: r.lon, tehsil: r.tehsil, district: r.district, province: r.province, unitId: r.unitId, population: r.pop || null, confirmed: r.confirmed, ...(extra || {}) });
  /* the one point resolver: the polygon labels, the height, and the place that names the point */
  function resolvePoint(lat, lon) {
    lat = Number(lat); lon = Number(lon); if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const row = pointRow(lat, lon, { how: 'point' });
    const popd = (r) => POPULATED.has(r.kind) && r.confirmed;
    const area = containing(lat, lon);
    const nearest = around(lat, lon, 25, popd)[0] || null;
    let town = null; for (const i of PL() ? PL().towns : []) { const r = PL().rec[i]; const d = km(lat, lon, r.lat, r.lon); if (d <= 60 && (!town || d < town.d)) town = { r, d }; }
    const unit = row.administered || row.disputed ? { tehsil: row.tehsil, district: row.district, province: row.province, unitId: row.unitId, by: row.by || 'polygon' } : null;
    let place = null, label = null;
    const twn = unit && unit.district ? unit.district : (town ? town.r.name : null);
    if (area) place = { id: area.r.id, name: area.r.name, area: twn && twn !== area.r.name ? twn : null, km: Math.round(area.d * 100) / 100, kind: 'area', contained: true, alt: area.r.alt, source: 'the named area whose outline holds the point (OpenStreetMap)' };
    else if (nearest) { const d = nearest.d, dk = Math.round(d * 10) / 10, dir = bearing16(nearest.r.lat, nearest.r.lon, lat, lon);
      place = d < 0.1 ? { id: nearest.r.id, name: nearest.r.name, near: nearest.r.name, area: twn && twn !== nearest.r.name ? twn : null, km: Math.round(d * 100) / 100, kind: 'place point', contained: false }
        : d < 0.8 ? { id: nearest.r.id, name: 'Near ' + nearest.r.name + ' (' + dk + ' km)', near: nearest.r.name, area: twn && twn !== nearest.r.name ? twn : null, km: dk, kind: 'near', contained: false }
        : { id: nearest.r.id, name: dk + ' km ' + dir + ' of ' + nearest.r.name, near: nearest.r.name, area: twn && twn !== nearest.r.name ? twn : null, km: dk, kind: 'offset', contained: false }; }
    const nr = area ? area : nearest;
    if (nr) { const dk = Math.round(nr.d * 10) / 10, dir = bearing16(nr.r.lat, nr.r.lon, lat, lon);
      label = (area ? 'in ' + area.r.name : nr.d < 0.1 ? 'at ' + nr.r.name + ' (its point)' : nr.d < 0.8 ? 'near ' + nr.r.name + ' (' + dk + ' km ' + dir + ')' : dk + ' km ' + dir + ' of ' + nr.r.name)
        + (unit && unit.tehsil ? ' (' + unit.tehsil + ' tehsil, ' + (unit.district || unit.province) + ')' : ''); }
    else if (unit && unit.tehsil) label = unit.tehsil + ' tehsil, ' + (unit.district || unit.province);
    return { ...row, name: row.name, label, place, unit,
      near: nr ? brief(nr.r, { elevM: null }) : null, distanceKm: nr ? Math.round(nr.d * 10) / 10 : null, bearing: nr ? bearing16(nr.r.lat, nr.r.lon, lat, lon) : null,
      town: town && (!nr || town.r !== nr.r) ? { id: town.r.id, name: town.r.name, distanceKm: Math.round(town.d * 10) / 10, bearing: bearing16(town.r.lat, town.r.lon, lat, lon) } : null,
      area: area ? { id: area.r.id, name: area.r.name, kind: area.r.kind, areaM2: area.m2 } : null,
      source: 'NIGRAAN place table (data/geo/places.json.gz) + official tehsil polygons' };
  }
  function withHeight(x) {
    if (!x || x.lat == null) return x; let h = null; try { h = ph() && ph().heightAt(x.lat, x.lon); } catch (_) { h = null; }
    if (!h || !h.ok) return x;
    if (h.basis === 'place30' && h.elevM != null) return { ...x, elevM: Math.round(h.elevM), elevSource: 'Copernicus GLO-30 (30 m) at the place' };
    const e = h.elevM != null ? h.elevM : h.cellElevM; return e == null ? x : { ...x, elevM: Math.round(e), elevSource: 'Copernicus GLO-30, 250 m cell mean' };
  }
  const LEVEL = (r) => (r.level !== 'place' ? r.level : POPULATED.has(r.kind) ? (r.kind === 'locality' ? 'locality' : 'settlement') : r.kind);
  function rowOf(r, sc, how) {
    const level = LEVEL(r);
    const unitLabel = r.level !== 'place' ? r.name + ' ' + r.level + (r.standsAt ? ' · main settlement ' + r.standsAt : '') : null;
    return { id: r.id, name: r.name, level, kind: r.kind, lat: r.lat, lon: r.lon, tehsil: r.tehsil, district: r.district, province: r.province, unitId: r.unitId,
      population: r.pop || null, confirmed: r.confirmed, note: r.confirmed ? null : 'name not confirmed', score: Math.round(sc * 100) / 100, matchedOn: how,
      sources: r.sources, disputed: r.disputed, scoreable: !r.disputed, standsAt: r.standsAt,
      ...(unitLabel ? { resolvedAs: r.level + ' main settlement', resolvedLabel: unitLabel } : { resolvedAs: 'settlement', resolvedLabel: r.name }),
      source: 'NIGRAAN place table' };
  }
  /* score one record against a name key: 3 the name or an alternate name, 2 the start of the name, 1.2 the start of a word of it,
     0.8 a whole word of an alternate name; 0 no match */
  function scoreOf(r, n) {
    if (r.key === n || r.altKeys.includes(n)) return [3, r.key === n ? 'name' : 'alternate name'];
    if (r.key.startsWith(n)) return [2, 'start of the name'];
    if ((' ' + r.key).includes(' ' + n)) return [1.2, 'start of a word of the name'];
    if (r.altKeys.some((a) => a.startsWith(n) || (' ' + a + ' ').includes(' ' + n + ' '))) return [0.8, 'an alternate name'];
    return [0, null];
  }
  function match(n, spelling) {
    const p = PL(); const out = [];
    const h = n.split(' ')[0]; const idx = p.heads.get(h.length >= 2 ? h.slice(0, 2) : h) || [];
    for (const i of idx) { const r = p.rec[i]; const [sc, how] = scoreOf(r, n); if (sc) out.push({ r, sc, how }); }
    if (!out.length && spelling && n.length >= 4) {   /* a spelling within 1 (short) or 2 edits of a name or alternate name of the same first letter */
      const cap = n.length < 6 ? 1 : 2; const keys = (p.first.get(n[0]) || []).filter((k) => Math.abs(k.length - n.length) <= cap).map((k) => [k, editDistance(k, n, cap)]).filter(([, d]) => d <= cap).sort((a, b) => a[1] - b[1]).slice(0, 40);
      for (const [k, d] of keys) for (const i of p.byKey.get(k) || []) out.push({ r: p.rec[i], sc: 0.6 - 0.1 * d, how: 'spelling within ' + d + ' of a name', fuzzy: true });
    }
    return out;
  }
  /* v91.17.283.53 · C · N8 (live: suggestions 6-15 s) · the answer of a query is kept (the table is fixed until it is rebuilt: keyed on its
     load and the query, limit and suggest flag; at most 600 answers; a copy is handed out), so a repeated or retyped prefix costs nothing.
     The 6-15 s were the event loop busy with other requests; the search itself takes milliseconds. */
  const SQ = new Map();
  async function search(q, opts = {}) {
    const p0 = P || null, sk = (p0 ? p0.mtime : 'x') + '|' + String(q || '').trim() + '|' + (Number(opts.limit) || 8) + '|' + (opts.suggest ? 1 : 0);
    const hit = p0 ? SQ.get(sk) : null; if (hit) { SQ.delete(sk); SQ.set(sk, hit); return structuredClone(hit); }
    const r = await search0(q, opts);
    if (p0 && r && Array.isArray(r.results) && r.results.length) { SQ.set(sk, structuredClone(r)); while (SQ.size > 600) SQ.delete(SQ.keys().next().value); }
    return r;
  }
  async function search0(q, opts = {}) {
    const limit = Math.min(20, Math.max(1, Number(opts.limit) || 8));
    const query = String(q || '').trim();
    if (!query) return { query, results: [], why: 'empty query' };
    const pc = parseCoords(query);
    if (pc) { const row = pointRow(pc.lat, pc.lon, pc);
      return { query, parsed: { coordinates: { lat: pc.lat, lon: pc.lon, how: pc.how, swapped: pc.swapped } }, results: [row],
        chosen: { name: row.name, tehsil: row.tehsil || null, district: row.district || null, province: row.province || null, lat: row.lat, lon: row.lon },
        autoSelect: !!row.administered, ambiguous: false, qualifierSatisfied: true, ambiguityWhy: row.administered ? null : row.why, resolution: 'coordinates', source: 'typed coordinates + official tehsil polygons' }; }
    const p = PL(); if (!p) return { query, results: [], why: err || 'the place table is not loaded' };
    let n = norm(query); if (n.length < 2) return { query, results: [], why: 'type at least two letters' };
    const uw = n.match(UNIT_WORD); const wantLevel = uw ? (/^(tehsil|tahsil|taluka)$/.test(uw[1]) ? 'tehsil' : uw[1]) : null; if (uw) n = n.replace(UNIT_WORD, '');
    const spelling = !opts.suggest;
    let hits = match(n, spelling); let how = 'name', qualifier = null, qualSat = true;
    /* "<place> <unit>" or "<unit> <place>": the tail (else the head) that names a tehsil, district or province is a filter */
    const toks = n.split(' ');
    if (toks.length >= 2) for (const [place, qk] of [...Array(toks.length - 1)].map((_, i) => [toks.slice(0, i + 1).join(' '), toks.slice(i + 1).join(' ')]).reverse().concat([...Array(toks.length - 1)].map((_, i) => [toks.slice(i + 1).join(' '), toks.slice(0, i + 1).join(' ')]))) {
      if (!p.qual.has(qk) || !place) continue;
      const inQ = (r) => [r.district, r.tehsil, r.province].some((v) => { const k = norm(v); return k === qk || k.replace(/ district$/, '') === qk || (' ' + k + ' ').includes(' ' + qk + ' '); });
      const sub = match(place, spelling).filter((x) => inQ(x.r));
      qualifier = qk; qualSat = sub.length > 0;
      if (sub.length) { const seen = new Set(hits.map((x) => x.r)); for (const x of sub) if (!seen.has(x.r)) hits.push({ ...x, sc: x.sc + 0.5, how: x.how + ', in ' + qk }); else { const y = hits.find((z) => z.r === x.r); y.sc = Math.max(y.sc, x.sc + 0.5); } }
      break;
    }
    /* a query longer than every name ("e 7 4"): the longest leading words that name something */
    if (!hits.length && toks.length >= 2) for (let k = toks.length - 1; k >= 1 && !hits.length; k--) { const sub = toks.slice(0, k).join(' '); if (sub.length < 2) break; hits = match(sub, false).filter((x) => x.sc >= 2).map((x) => ({ ...x, sc: x.sc - 1, how: x.how + ' (the first words, "' + sub + '")' })); how = 'leading words'; }
    /* HISAAB's rule: an unconfirmed record carrying a taken name is not offered */
    hits = hits.filter((x) => x.r.confirmed || x.r.level !== 'place' || !p.taken.has(x.r.key));
    if (wantLevel) hits = hits.filter((x) => x.r.level === wantLevel).concat(hits.filter((x) => x.r.level !== wantLevel && x.r.level !== 'place'));
    else {   /* one place, one row: a unit of the same name that holds a confirmed town listed here is that town */
      const towns = hits.filter((x) => x.r.level === 'place' && x.r.confirmed && POPULATED.has(x.r.kind));
      hits = hits.filter((x) => { if (x.r.level === 'place' || x.r.level === 'province') return true; const k = x.r.key.replace(/ district$/, '');
        return !towns.some((t) => t.r.key === k && (x.r.level === 'tehsil' ? t.r.unitId === x.r.unitId : (norm(t.r.district) === norm(x.r.district) && t.r.province === x.r.province))); });
    }
    hits.sort((a, b) => (b.sc - a.sc) || ((a.r.confirmed ? 0 : 1) - (b.r.confirmed ? 0 : 1)) || (wantLevel ? ((a.r.level === wantLevel ? 0 : 1) - (b.r.level === wantLevel ? 0 : 1)) : 0) || (kindRank(a.r) - kindRank(b.r)) || (b.r.pop - a.r.pop) || (a.r.name.length - b.r.name.length) || (a.r.id < b.r.id ? -1 : 1));
    const seen = new Set(), res = [];
    for (const x of hits) { const k = x.r.level + '|' + x.r.key + '|' + x.r.lat.toFixed(1) + '|' + x.r.lon.toFixed(1); if (seen.has(k)) continue; seen.add(k); res.push(rowOf(x.r, x.sc, x.how + (x.fuzzy ? '' : ''))); if (x.fuzzy) res[res.length - 1].fuzzy = true; if (res.length >= limit) break; }
    const results = opts.suggest ? res : res.map(withHeight);
    const top = results[0] || null, second = results[1] || null;
    const rival = !!(top && second && second.score === top.score && second.confirmed && norm(second.name) === norm(top.name) && km(top.lat, top.lon, second.lat, second.lon) > 25 && !((top.population || 0) >= 10 * ((second.population || 0) + 1)));   /* a town ten times the size of its namesake is the one meant */
    const autoSelect = !!(top && top.score >= 3 && (top.confirmed || top.level !== 'settlement') && !rival && qualSat && !top.disputed);
    return { query, parsed: { name: n, qualifier, unit: wantLevel }, results, chosen: top ? { id: top.id, name: top.name, tehsil: top.tehsil, district: top.district, province: top.province, lat: top.lat, lon: top.lon, score: top.score, matchedOn: top.matchedOn } : null,
      autoSelect, ambiguous: !!top && !autoSelect, qualifierSatisfied: qualSat,
      ambiguityWhy: !top ? 'nothing matched' : !qualSat ? 'no place called "' + n + '" was found in ' + qualifier + '; the rows are places of that name elsewhere' : rival ? 'two confirmed places carry this name; naming the district or province resolves it' : top.score < 3 ? 'no place carries exactly this name' : !top.confirmed ? 'the name of this place is not confirmed by a second source' : null,
      resolution: top ? top.resolvedAs : null, scope: 'Pakistan only. Azad Kashmir and Gilgit-Baltistan are included. Indian Illegally Occupied Jammu & Kashmir is listed as one disputed record and never scored.',
      source: 'NIGRAAN place table (data/geo/places.json.gz), built ' + p.T.built };
  }
  /* the named populated places around a point (the place list of a coarse browser fix and the area table): confirmed only; towns and
     cities first, then by population and distance; at least minKm apart and one per name */
  function near(lat, lon, o = {}) {
    const R = Math.min(150, Math.max(0.5, Number(o.km) || 12)), max = Math.max(1, Math.min(500, Number(o.limit) || 36)), minKm = o.minKm != null ? Number(o.minKm) : 1.2;
    const c = around(lat, lon, R, (r) => POPULATED.has(r.kind) && r.confirmed && /\p{L}/u.test(r.name));
    c.sort((a, b) => (kindRank(a.r) - kindRank(b.r)) || (b.r.pop - a.r.pop) || (a.d - b.d));
    const out = [];
    for (const x of c) { if (out.length >= max) break; if (out.some((o2) => o2.key === x.r.key || km(o2.lat, o2.lon, x.r.lat, x.r.lon) < minKm)) continue;
      out.push({ ...brief(x.r), key: x.r.key, km: Math.round(x.d * 10) / 10, distanceKm: Math.round(x.d * 10) / 10 }); }
    return out.map(({ key, ...r }) => (o.height ? withHeight(r) : r));
  }
  function byId(id) { const p = PL(); if (!p) return null; const i = p.byId.get(String(id)); return i == null ? null : brief(p.rec[i], { standsAt: p.rec[i].standsAt, sources: p.rec[i].sources, alt: p.rec[i].alt }); }
  /* the nearest record of the table to a point within maxKm (populated places only when asked) */
  function nearestRecord(lat, lon, o = {}) { const x = around(lat, lon, Number(o.km) || 1, o.populated ? (r) => POPULATED.has(r.kind) : null)[0]; return x ? brief(x.r, { km: Math.round(x.d * 100) / 100 }) : null; }
  /* the confirmed capital, cities and towns (report map labels): {text, lat, lon, rank}, largest first */
  let TOWNS = null;
  function towns() { const p = PL(); if (!p) return []; if (TOWNS) return TOWNS;
    TOWNS = p.rec.filter((r) => r.level === 'place' && r.confirmed && (r.kind === 'capital' || r.kind === 'city' || r.kind === 'town'))
      .map((r) => ({ id: r.id, text: r.name, lat: r.lat, lon: r.lon, kind: r.kind, rank: (r.kind === 'town' ? 0 : 2e9) + (r.pop || 0) })).sort((a, b) => b.rank - a.rank); return TOWNS; }
  const hasName = (s) => { const p = PL(); return !!(p && p.byKey.has(norm(s))); };
  function status() { const p = PL(); return p ? { ready: true, built: p.T.built, records: p.rec.length, places: p.rec.filter((r) => r.level === 'place').length, units: p.rec.filter((r) => r.level !== 'place').length, unconfirmed: p.rec.filter((r) => !r.confirmed).length, cleaning: p.T.cleaning } : { ready: false, why: err || 'not loaded' }; }
  async function warm() { if (P === undefined) { try { if (!GEN) GEN = loadSteps(dataDir); for (;;) { const t = Date.now(); let r = GEN.next(); while (!r.done && Date.now() - t < 40) r = GEN.next();
    if (r.done) { const v = r.value; GEN = { next: () => ({ done: true, value: v }) }; break; } await new Promise((ok) => setImmediate(ok)); } } catch (_) { GEN = null; } } return !!PL(); }
  return { search, resolvePoint, pointRow, byId, near, nearestRecord, towns, hasName, status, warm };
}
