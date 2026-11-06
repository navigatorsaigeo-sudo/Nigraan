/* ════════════════════════════════════════════════════════════════════════════
   PAKISTAN GAZETTEER — place-name resolution that answers about Pakistan.

   v91.17.3 · Stage 3.5.

   THE DEFECT. The client called the provider's global geocoder with
   `name=<query>&count=10` and then filtered the results down to
   country_code === 'PK'. Filtering AFTER the cut is the whole problem: the
   provider ranks by population, ten slots fill with the largest matches
   anywhere on earth, and a Pakistani place that is not in the top ten
   globally never reaches the filter.

   Measured on v91.17.2:
     "Astore"     -> Astore, Italy (population 2,800) and nothing in Pakistan
     "Ghizer"     -> nothing
     "Diamer"     -> nothing
     "Neelum"     -> nothing
     "Tharparkar" -> nothing
   Four of those five are districts this build already holds, with coordinates
   and an elevation, in units.json. The system was asking a global service for
   places it had on disk.

   THE ORDER. AGN's own 577 units first — they are authoritative for this
   product, carry a verified elevation and a province, and cost nothing. Then
   an alias table for the romanisations GeoNames indexes under a different
   spelling. Then the provider, scoped with `countryCode=PK` so the cut is made
   before the ranking rather than after it.

   PROVINCE. Gilgit-Baltistan and Azad Kashmir come back from GeoNames with an
   empty admin1, so a provider hit inside either is given its province from the
   nearest AGN unit rather than published blank.

   SOVEREIGNTY. IIOJK units are held in the index so a query can be answered
   honestly — the place exists — but they are returned with scoreable:false and
   never carry a forecast, which is the same rule the rest of the build follows.
   ════════════════════════════════════════════════════════════════════════════ */

/* Romanisation variants GeoNames indexes under one spelling only. Left side is
   what a Pakistani user types, right side is what the index holds. Kept short
   and specific: a general transliteration engine invents matches. */
const ALIASES = {
  'gulkin': 'Ghulkin', 'ghulkin': 'Gulkin',
  'hopper': 'Hoper', 'hoper': 'Hopper',
  'shimshal': 'Shimshal', 'shishper': 'Sishper', 'sishper': 'Shishper',
  'gilgit baltistan': 'Gilgit', 'gb': 'Gilgit',
  'ajk': 'Muzaffarabad', 'azad kashmir': 'Muzaffarabad',
  'pindi': 'Rawalpindi', 'isb': 'Islamabad', 'khi': 'Karachi', 'lhr': 'Lahore',
  'quetta city': 'Quetta', 'peshawar city': 'Peshawar',
  'murree hills': 'Murree', 'naran': 'Naran', 'kaghan': 'Kaghan',
  'skardu city': 'Skardu', 'hunza valley': 'Hunza', 'nagar valley': 'Nagar',
  'swat valley': 'Swat', 'kalam valley': 'Kalam',
  'thar': 'Tharparkar', 'cholistan': 'Bahawalpur',
  /* spellings the unit table holds under one romanisation only. Measured:
     "Diamer" and "Neelum" are the common spellings and returned nothing,
     because units.json holds "Diamir" and "Neelam Valley". */
  'diamer': 'Diamir', 'diamir': 'Diamer',
  'neelum': 'Neelam Valley', 'neelum valley': 'Neelam Valley', 'neelam': 'Neelam Valley',
  'chilas': 'Chilas', 'athmuqam': 'Athmuqam', 'athmuqan': 'Athmuqam',
  'gwadur': 'Gwadar', 'gawadar': 'Gwadar',
  'multaan': 'Multan', 'bahawalnagar': 'Bahawalnagar',
  'di khan': 'Dera Ismail Khan', 'dikhan': 'Dera Ismail Khan', 'd i khan': 'Dera Ismail Khan',
  'dg khan': 'Dera Ghazi Khan', 'dgkhan': 'Dera Ghazi Khan', 'd g khan': 'Dera Ghazi Khan',

  'makran': 'Kech', 'turbat': 'Kech', 'kech turbat': 'Kech',
  /* v91.17.47 · spellings the local place index (GeoNames) holds differently from common use */
  'attabad': 'Atabad', 'attabad lake': 'Atabad', 'atta abad': 'Atabad',
  'shispar': 'Shispare', 'shisper': 'Shispare', 'shishper glacier': 'Shispare', 'shisper glacier': 'Shispare', 'shispar glacier': 'Shispare',
  'batakundi': 'Battakundi', 'bata kundi': 'Battakundi',
};

/* v91.17.283 · WS4 · D19 · the Urdu name index (same normalisation as scripts/gen/gen_urdu_names.py) */
export const urduKey = (s) => String(s || '').replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u200C-\u200F]/g, '')
  .replace(/[\u064A\u0649]/g, '\u06CC').replace(/\u0643/g, '\u06A9').replace(/[\u0647\u06BE\u06C3\u0629]/g, '\u06C1').replace(/\s+/g, ' ').trim();
/* v91.17.283 · WS2 request R4 · server/api/territory.mjs (WS2) is loaded when it is installed; without it the outside branch is unchanged */
let TERR = null; import('./territory.mjs').then((m) => { TERR = m; }).catch(() => { TERR = null; });
let URDU = null;
function urduNames() {
  if (URDU !== null) return URDU || null;
  try { const f = join(process.env.NIGRAAN_DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data'), 'pk-names-urdu.json');
    URDU = JSON.parse(readFileSync(f, 'utf8')).names || false; } catch (_) { URDU = false; }
  return URDU || null;
}
/* v91.17.283 · WS4 · D17 · one server naming function: canonical spellings from data/place-spellings.json, with a locality guard */
let SPELL = null;
function spellRules() {
  if (SPELL) return SPELL;
  try { const f = join(process.env.NIGRAAN_DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data'), 'place-spellings.json');
    SPELL = (JSON.parse(readFileSync(f, 'utf8')).rules || []).map((r) => ({ ...r, re: new RegExp('(?<![A-Za-z])' + String(r.from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z])', 'g') })); } catch (_) { SPELL = []; }
  return SPELL;
}
const kmApprox = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return 6371 * Math.hypot(x, y); };
export function canonName(s, lat, lon) {
  if (typeof s !== 'string' || !s) return s;
  let t = s; for (const r of spellRules()) { if (r.near && !(Number.isFinite(lat) && Number.isFinite(lon) && kmApprox(lat, lon, r.near[0], r.near[1]) <= (r.km || 1))) continue; r.re.lastIndex = 0; t = t.replace(r.re, r.to); }
  return t;
}
/* every string field of an answer about a point, canonicalised at that point (two levels deep: label, place.name, near.name, town.name ...) */
function canonAt(o, lat, lon, depth = 0) {
  if (typeof o === 'string') return canonName(o, lat, lon);
  if (!o || typeof o !== 'object' || depth > 2) return o;
  if (Array.isArray(o)) return o.map((x) => canonAt(x, lat, lon, depth + 1));
  const out = {}; for (const [k, v] of Object.entries(o)) out[k] = (k === 'source' || k === 'why') ? v : canonAt(v, lat, lon, depth + 1); return out;
}
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/* ══ v91.17.47 · THE LOCAL PLACE INDEX ═══════════════════════════════════════════════════
   167,214 named places of Pakistan (every populated place, the glaciers, lakes, named
   streams, peaks, passes, airports and dams) from the GeoNames country dump, built by
   station-lake/scripts/place_index.py into data/pk-places.tsv.gz and loaded here once.
   A place name now resolves on the machine itself; the paid provider's gazetteer is asked
   only when the index holds nothing of that name. The same index answers the reverse
   question: what is this coordinate near ("7.4 km NE of Kalam"). */
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';   /* v91.17.283 · WS4 · D19 */
import { createPointHeight } from './pointheight.mjs';   /* v91.17.75 · M · every result carries a 30 m height */
import { unitAtPoint } from './unitresolve.mjs';
import { createPlaceAreas } from './placeareas.mjs';   /* v91.17.281 GEO281 · the named OSM area that CONTAINS a point */   /* v91.17.77 · G · a typed coordinate is resolved to the tehsil that contains it */

/* ══ v91.17.77 · G · TYPED COORDINATES (CEO: "33.69, 73.05", "33.69 73.05", "33°41'N 73°03'E", "N33.69 E73.05") ══════════
   parseCoords(text) -> { lat, lon, how, swapped } | null. Decimal degrees, degrees-minutes(-seconds) with ° ' " (or ′ ″, or
   plain spaces when a hemisphere letter follows), hemisphere letters before or after the number (N/S/E/W), comma, semicolon or
   space between the pair. With no letters the first number is the latitude; a pair that can only be read the other way round
   for Pakistan (first 60-80, second 23-38) is swapped and says so. Nothing else in a query is a coordinate: a place name
   containing digits ("E-7", "Chak 42") never parses, because the whole string must be consumed. */
export function parseCoords(text) {
  let s = String(text || '').trim();
  if (!s || s.length > 80 || !/\d/.test(s)) return null;
  s = s.replace(/[\u2032\u2019\u00b4`]/g, "'").replace(/[\u2033\u201d]|''/g, '"').replace(/\u00ba|\u02da/g, '\u00b0').replace(/\s+/g, ' ');
  if (/^-?\d{1,3},\d+\s+-?\d{1,3},\d+$/.test(s)) s = s.replace(/,/g, '.');   /* decimal commas: "33,69 73,05" */
  const H = '([NSEW])?', HT = '([NSEW])?';
  /* marked D°M'S" ; spaced D M S with a hemisphere letter ; decimal (with an optional degree mark) */
  const RX = [
    [new RegExp('^\\s*' + H + '\\s*(\\d{1,3})\\s*(?:\u00b0|deg\\b|d\\b)\\s*(?:(\\d{1,2}(?:\\.\\d+)?)\\s*(?:\'|min\\b|m\\b)?\\s*(?:(\\d{1,2}(?:\\.\\d+)?)\\s*(?:"|sec\\b|s\\b)?)?)?\\s*' + HT, 'i'), 'dms'],
    [new RegExp('^\\s*' + H + '\\s*(\\d{1,3})\\s+(\\d{1,2}(?:\\.\\d+)?)(?:\\s+(\\d{1,2}(?:\\.\\d+)?))?\\s*' + HT, 'i'), 'spaced'],
    [new RegExp('^\\s*' + H + '\\s*(-?\\d{1,3}(?:\\.\\d+)?)\\s*(?:\u00b0)?\\s*' + HT, 'i'), 'dec'],
  ];
  /* the same patterns with the trailing letter forbidden when a number follows it ("N33.69 E73.05": the E opens the second angle) */
  const RXN = RX.map(([rx, kind]) => [new RegExp(rx.source.replace(/\(\[NSEW\]\)\?$/, '(?:([NSEW])(?!\\s*-?\\d))?'), 'i'), kind]);
  function one(str, noTrail) {
    for (const [rx, kind] of (noTrail ? RXN : RX)) {
      const m = rx.exec(str); if (!m || !m[0].trim()) continue;
      const h1 = m[1] ? m[1].toUpperCase() : null, h2 = (kind === 'dec' ? m[3] : m[5]) ? (kind === 'dec' ? m[3] : m[5]).toUpperCase() : null;
      if (h1 && h2) continue;
      const h = h1 || h2;
      if (kind === 'spaced' && !h) continue;   /* "33 41 73 03" without letters is not read as an angle */
      let v, marked;
      if (kind === 'dec') { v = Number(m[2]); marked = !!h || /\u00b0/.test(m[0]); if (!/\./.test(m[2]) && !marked) continue; }
      else { const mi = m[3] != null ? Number(m[3]) : 0, se = m[4] != null ? Number(m[4]) : 0; if (mi >= 60 || se >= 60) continue; v = Number(m[2]) + mi / 60 + se / 3600; marked = true; }
      if (h === 'S' || h === 'W') v = -Math.abs(v);
      return { v, h, rest: str.slice(m[0].length), dms: kind !== 'dec' && (m[3] != null), marked };
    }
    return null;
  }
  let a = null, b = null;
  for (const nt of [false, true]) {   /* "33.69 N 73.05 E" (letters after) first, then "N33.69 E73.05" (letters before) */
    const a1 = one(s, nt); if (!a1) continue;
    const rest = a1.rest.replace(/^\s*[,;/]\s*|^\s+/, ''); if (!rest) continue;
    const b1 = one(rest, false); if (!b1 || b1.rest.trim()) continue;
    a = a1; b = b1; break;
  }
  if (!a || !b) return null;
  /* decimal commas are allowed only when the pair is separated by something other than a comma */
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
  return Math.abs(lat).toFixed(5) + '\u00b0 ' + (lat >= 0 ? 'N' : 'S') + ', ' + Math.abs(lon).toFixed(5) + '\u00b0 ' + (lon >= 0 ? 'E' : 'W');
}

/* v91.17.269 · PERF A2 · the index is built in slices (a yield every 4000 rows / 20000 names): the server's warm-up runs one slice per
   turn of the event loop, so /health keeps answering while it builds; a caller that needs it at once (PL) runs every slice
   now. The slices are the same loop in the same order, so the index is the one the single pass built. (v91.17.283 · the unused
   loadPlaces() wrapper is removed.) */
function* loadPlacesSteps(dataDir) {
  const f = dataDir ? join(dataDir, 'pk-places.tsv.gz') : null;
  if (!f || !existsSync(f)) return null;
  let meta = null; try { meta = JSON.parse(readFileSync(join(dataDir, 'pk-places.meta.json'), 'utf8')); } catch {}
  let text = gunzipSync(readFileSync(f)).toString('utf8');
  /* v91.17.62 · the supplement: Islamabad sectors (centroids on the CDA grid fitted to our own MACH station positions,
     ±1 km) and named localities at measured fleet-station coordinates; same ten columns; kind PPLX, no elevation
     (the provider's cell height is used). GeoNames carries none of the sector names, which is why "E-7" was "not found". */
  const extra = join(dataDir, 'pk-places-extra.tsv'); let extraRows = 0;
  if (existsSync(extra)) { const t = readFileSync(extra, 'utf8'); extraRows = t.split('\n').filter(Boolean).length; text += '\n#SRC extra\n' + t; }
  /* v91.17.62 · the OpenStreetMap supplement (station-lake/scripts/place_index_osm.py): named localities, housing
     schemes, sectors, union councils — the names GeoNames does not carry. Same columns; © OpenStreetMap contributors, ODbL. */
  const osm = join(dataDir, 'pk-places-osm.tsv.gz'); let osmRows = 0, osmMeta = null;
  if (existsSync(osm)) { const t = gunzipSync(readFileSync(osm)).toString('utf8'); osmRows = t.split('\n').filter(Boolean).length; text += '\n#SRC osm\n' + t; try { osmMeta = JSON.parse(readFileSync(join(dataDir, 'pk-places-osm.meta.json'), 'utf8')); } catch {} }
  const rows = []; const byName = new Map();
  const add = (k, i) => { if (!k) return; let a = byName.get(k); if (!a) { a = []; byName.set(k, a); } if (a.length < 400) a.push(i); };
  let src = 'geonames'; let n = 0;
  for (const line of text.split('\n')) {
    if (++n % 4000 === 0) yield n;
    if (!line) continue; if (line.startsWith('#SRC ')) { src = line.slice(5).trim(); continue; } const c = line.split('\t'); if (c.length < 10) continue;
    const r = { name: c[0], ascii: c[1], lat: +c[3], lon: +c[4], fcode: c[5], pop: +c[6] || 0, province: c[7] || null, district: c[8] || null, elevM: +c[9] > -9000 ? +c[9] : null, src };
    const i = rows.push(r) - 1;
    /* v91.17.269 · PERF · the row's own name is normalised once (it was normalised again for every comparison: 2 + alternates times) */
    const nn = norm(r.name); add(nn, i); const an = norm(r.ascii); if (an !== nn) add(an, i);
    if (c[2]) for (const alt of c[2].split(',')) { const k = norm(alt); if (k && k !== nn) add(k, i); }
  }
  /* v91.17.62 · prefix and spelling lookups: the sorted key list and a trigram index over every indexed name */
  const KEYS = [...byName.keys()].sort();
  const TRI = new Map(); const tri = (k) => { const t = new Set(); const x = ' ' + k + ' '; for (let i = 0; i + 3 <= x.length; i++) t.add(x.slice(i, i + 3)); return t; };
  n = 0; for (const k of KEYS) { if (++n % 20000 === 0) yield n; for (const g of tri(k)) { let a = TRI.get(g); if (!a) { a = []; TRI.set(g, a); } if (a.length < 20000) a.push(k); } }
  /* a coarse grid for the reverse lookup (0.1° cells) */
  const grid = new Map(); const gk = (la, lo) => (Math.floor(la * 10) + ',' + Math.floor(lo * 10));
  rows.forEach((r, i) => { if (Number.isFinite(r.lat) && Number.isFinite(r.lon)) { const k = gk(r.lat, r.lon); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(i); } });
  return { rows, byName, grid, gk, meta, extraRows, osmRows, osmMeta, KEYS, TRI, tri };
}
const KIND = { ADM6: 'admin area', ADM7: 'admin area', ADM8: 'union council / ward', ADM9: 'ward', ADM10: 'ward', PPL: 'settlement', PPLX: 'locality', PPLQ: 'abandoned settlement', PPLW: 'destroyed settlement', PPLA: 'provincial capital', PPLA2: 'district seat', PPLL: 'locality', PPLF: 'farm village', STM: 'stream', LK: 'lake', LKI: 'intermittent lake', RSV: 'reservoir', GLCR: 'glacier', MT: 'mountain', MTS: 'mountains', PK: 'peak', PASS: 'pass', VAL: 'valley', AIRP: 'airport', DAM: 'dam' };
const kmBetween = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const bearing16 = (lat1, lon1, lat2, lon2) => { const r = Math.PI / 180; const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r); const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  const b = ((Math.atan2(y, x) / r) + 360) % 360; return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(b / 22.5) % 16]; };

/* v91.17.62 · "E-7", "E7", "E-7/4", "sector e-7", "e-7 islamabad" -> the sector key "e 7" (Islamabad's CDA grid) */
const SECTOR_RE = /^(?:sector\s+)?([a-i])\s*(\d{1,2})(?:\s+\d)?(?:\s+(?:islamabad|isb))?$/;
const sectorKey = (k) => { const m = String(k || '').match(SECTOR_RE); return m ? m[1] + ' ' + m[2] : null; };

/* ══ v91.17.75 · M · ONE PLACE, ONE ROW, AND ALWAYS A HEIGHT (CEO, 26 Sep) ═══════════════════════════════════════════
   "i-8" listed "I-8 Markaz Ground · 519 m" and "I-8 · elev n/a": one place from two sources, and the sector row carried no
   height. Two rules, applied to every result list:
   1. SAME PLACE. Two rows are one place when their names are the same, or one name is the other followed by more WORDS
      ("I-8" / "I-8 Markaz Ground"; a numeric tail is a sub-unit and stays apart: "I-8" / "I-8/3"), they lie within
      SAME_PLACE_KM of each other, and their admin names agree (Federal Capital = Islamabad = ICT). The richer row is kept
      (more of: elevation, district, province, population, tehsil; ties go to the row named exactly as asked) and its
      missing fields are filled from the other.
   2. HEIGHT. data/place-height30.json holds Copernicus GLO-30 (30 m) bilinear at the exact coordinate of every gazetteer
      place, tehsil anchor and station (pointheight.mjs, 100 m match). A local-index row takes that 30 m height (it was
      sampled at this very coordinate); any row still without one takes the 30 m value, else the 250 m cell mean of the
      same DEM. AGN unit rows keep their own verified height and are only filled when it is missing. [measured: "i-8"
      returned elevM null on v91.17.74] */
const SAME_PLACE_KM = 1.5;
const ADMIN_EQ = { 'federal capital': 'islamabad', 'islamabad capital territory': 'islamabad', 'ict': 'islamabad', 'federal capital territory': 'islamabad', 'islamabad district': 'islamabad' };
const adminN = (s) => { const n = norm(s).replace(/ district$/, ''); return ADMIN_EQ[n] || n; };
function relatedNames(a, b) {
  const x = norm(a), y = norm(b); if (!x || !y) return false; if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  if (!l.startsWith(s + ' ')) return false;
  const tail = l.slice(s.length + 1).split(' ');
  return /[a-z]/.test(tail[0]) && !/^\d/.test(tail[0]);   /* "markaz ground" joins; "3" (I-8/3) is a sub-unit */
}
function sameAdmin(a, b) {   /* provinces agree when both are named, districts agree when both are named */
  if (a.province && b.province && adminN(a.province) !== adminN(b.province)) return false;
  if (a.district && b.district && adminN(a.district) !== adminN(b.district)) return false;
  return true;
}
const richness = (r) => (r.elevM != null ? 1 : 0) + (r.district ? 1 : 0) + (r.province ? 1 : 0) + (r.population ? 1 : 0) + (r.tehsil ? 1 : 0);
export function mergeSamePlace(rows, askedN) {
  const out = [];
  for (const x of rows) {
    const j = out.findIndex((m) => m.lat != null && x.lat != null && relatedNames(m.name, x.name)
      && kmBetween(m.lat, m.lon, x.lat, x.lon) <= SAME_PLACE_KM && sameAdmin(m, x));
    if (j < 0) { out.push(x); continue; }
    const m = out[j]; const rx = richness(x), rm = richness(m);
    const xWins = rx > rm || (rx === rm && askedN && norm(x.name) === askedN && norm(m.name) !== askedN);
    const keep = Object.assign({}, xWins ? x : m), other = xWins ? m : x;
    for (const k of ['elevM', 'district', 'province', 'population', 'tehsil']) if (keep[k] == null && other[k] != null) keep[k] = other[k];
    keep.score = Math.max(Number(m.score) || 0, Number(x.score) || 0) || keep.score;
    keep.mergedWith = (keep.mergedWith || []).concat([{ name: other.name, source: other.source, km: Math.round(kmBetween(m.lat, m.lon, x.lat, x.lon) * 100) / 100 }]);
    out[j] = keep;
  }
  return out;
}

export function createGazetteer(app) {
  const { units, provider } = app;
  let PA_ = null; const PA = () => { if (!PA_) PA_ = createPlaceAreas(app.dataDir); return PA_; };   /* GEO281 */
  let PH = null;   /* v91.17.75 · M · the 30 m point heights, built on first use */
  const ph = () => { if (PH === null) { try { PH = createPointHeight(app.dataDir); } catch { PH = false; } } return PH || null; };
  function withHeight(x) {
    if (!x || x.lat == null || x.lon == null) return x;
    const localIndex = /local place index/.test(String(x.source || ''));
    if (x.elevM != null && !localIndex) return x;
    let h = null; try { h = ph() && ph().heightAt(x.lat, x.lon); } catch { h = null; }
    if (!h || !h.ok) return x;
    if (h.basis === 'place30' && h.elevM != null) return Object.assign({}, x, { elevM: Math.round(h.elevM), elevSource: 'Copernicus GLO-30 (30 m) at the place' });
    if (x.elevM != null) return x;
    const e = h.elevM != null ? h.elevM : h.cellElevM;
    return e == null ? x : Object.assign({}, x, { elevM: Math.round(e), elevSource: 'Copernicus GLO-30, 250 m cell mean' });
  }
  /* v91.17.124 · B-05 · the 205,000-row place index took 2.4 s to parse and blocked server start. It now loads on first use and
     is warmed in the background, once the server is already listening (v91.17.269 · PERF A2: by the server's warm-up, before it takes
     customers, through warm() below; the 1.5 s timer is gone). */
  let PLACES_ = undefined, GEN = null;
  const PL = () => { if (PLACES_ === undefined) { let P = null; try { if (!GEN) GEN = loadPlacesSteps(app.dataDir); let r = GEN.next(); while (!r.done) r = GEN.next(); P = r.value; } catch (e) { console.log('  gazetteer  local place index not loaded: ' + e.message); P = null; } GEN = null;
    if (P) console.log('  gazetteer  local place index: ' + P.rows.length + ' places (' + (P.meta && P.meta.source || 'GeoNames PK') + (P.extraRows ? ' + ' + P.extraRows + ' supplement rows: Islamabad sectors and fleet-sited localities' : '') + (P.osmRows ? ' + ' + P.osmRows + ' OpenStreetMap localities' : '') + ')');
    PLACES_ = P; } return PLACES_; };

  /* candidates from the local index, shaped like provider rows */
  function localPlaces(name, limit) {
    if (!PL()) return { rows: [], why: 'no local place index (data/pk-places.tsv.gz)' };
    let k = norm(name);
    const sec = sectorKey(k); if (sec) k = sec;   /* v91.17.62 · E-7, E7, E-7/4, sector e-7 */
    let idx = PL().byName.get(k) || []; let how = 'exact'; let SPELL = null;
    if (!idx.length && k.length >= 3) {
      /* prefix: "gulsh" -> Gulshan-e-Iqbal; binary search into the sorted key list */
      const K = PL().KEYS; let lo = 0, hi = K.length; while (lo < hi) { const m = (lo + hi) >> 1; if (K[m] < k) lo = m + 1; else hi = m; }
      const pref = []; for (let i = lo; i < K.length && K[i].startsWith(k) && pref.length < 40; i++) pref.push(K[i]);
      if (pref.length) { idx = pref.flatMap((key) => PL().byName.get(key) || []).slice(0, 400); how = 'prefix'; }
    }
    /* exact hits that are all minor places ("Lahor", three villages) do not hide a spelling match on a city ("Lahore") */
    const minorOnly = idx.length > 0 && !idx.some((i) => (PL().rows[i].pop || 0) >= 100000 || /^PPLA/.test(PL().rows[i].fcode));
    if (!sec && (!idx.length || minorOnly) && k.length >= 4) {
      /* spelling: trigram candidates, then Damerau-Levenshtein within 1 (short) or 2 */
      const qt = PL().tri(k); const cnt = new Map();
      for (const g of qt) { const a = PL().TRI.get(g); if (a) for (const key of a) cnt.set(key, (cnt.get(key) || 0) + 1); }
      const need = Math.max(2, Math.ceil(qt.size * 0.5)); const maxD = k.length < 6 ? 1 : 2;
      const dl = (a, b) => { if (Math.abs(a.length - b.length) > maxD) return 9; const d = []; for (let i = 0; i <= a.length; i++) { d[i] = [i]; } for (let j = 1; j <= b.length; j++) d[0][j] = j;
        for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) { const c = a[i - 1] === b[j - 1] ? 0 : 1; d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c); if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); } return d[a.length][b.length]; };
      const near = [...cnt.entries()].filter(([key, c]) => c >= need).map(([key]) => [key, dl(k, key)]).filter(([, dist]) => dist <= maxD).sort((a, b) => a[1] - b[1]).slice(0, 30);
      if (near.length) { const extraIdx = near.flatMap(([key]) => PL().byName.get(key) || []).filter((i) => !idx.includes(i)).slice(0, 400); if (idx.length) { SPELL = new Set(extraIdx.map((i) => PL().rows[i])); idx = idx.concat(extraIdx); } else { idx = extraIdx; how = 'spelling'; } }
    }
    const primary = (r) => norm(r.name) === k || norm(r.ascii) === k;
    const rows = idx.map((i) => PL().rows[i]).sort((a, b) => ((primary(b) ? 1 : 0) - (primary(a) ? 1 : 0)) || (b.pop - a.pop) || ((a.fcode === 'PPL' ? 0 : 1) - (b.fcode === 'PPL' ? 0 : 1))).slice(0, Math.max(10, limit)).map((r) => ({
      via: (SPELL && SPELL.has(r)) ? 'spelling match' : how !== 'exact' ? how + ' match' : (primary(r) ? 'name' : 'alternate name'),
      name: r.name, level: /^PPL/.test(r.fcode) ? 'settlement' : (KIND[r.fcode] || 'feature'), kind: KIND[r.fcode] || r.fcode,
      tehsil: null, district: r.district, province: r.province || (provinceNear(r.lat, r.lon) || {}).province || null, provinceInferred: !r.province,
      lat: r.lat, lon: r.lon, elevM: r.elevM, population: r.pop || null, disputed: false, scoreable: true,
      source: r.src === 'osm' ? 'local place index (OpenStreetMap supplement, offline; © OpenStreetMap contributors, ODbL)' : r.src === 'extra' ? 'local place index supplement (Islamabad sector grid fitted to MACH station positions, ±1 km; offline)' : 'local place index (GeoNames PK, offline)',
    }));
    return { rows, why: null };
  }

  /* the reverse question: what is this coordinate near. Populated places first (a town over 1,000 people within
     25 km, else any settlement within 15 km), then any named feature within 10 km. */
  function reverse(lat, lon) { const r = reverseRaw(lat, lon); return r ? canonAt(r, lat, lon) : r; }   /* v91.17.283 · D17 */
  function reverseRaw(lat, lon) {
    if (!PL() || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const cand = []; const la0 = Math.floor(lat * 10), lo0 = Math.floor(lon * 10);
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) { const arr = PL().grid.get((la0 + a) + ',' + (lo0 + b)); if (arr) for (const i of arr) cand.push(PL().rows[i]); }
    const withD = cand.map((r) => ({ r, km: kmBetween(lat, lon, r.lat, r.lon) }));
    const pick = (f, maxKm) => withD.filter((x) => f(x.r) && x.km <= maxKm).sort((a, b) => a.km - b.km)[0] || null;
    const settled = (r) => /^PPL/.test(r.fcode) && r.fcode !== 'PPLQ' && r.fcode !== 'PPLW';
    /* the place itself when the coordinate sits in one; else a town within 25 km; else the nearest settlement; else any named feature */
    const best = pick(settled, 1.5) || pick((r) => r.pop >= 1000 && settled(r), 25) || pick(settled, 15) || pick(() => true, 10);
    if (!best) return { label: null, why: 'no named place within 25 km in the local index' };
    const { r, km } = best; const dir = bearing16(r.lat, r.lon, lat, lon);
    /* GEO281 · the AGN tehsil that CONTAINS the point (polygon, unitresolve.mjs) — it was the tehsil whose centre is nearest, which names
       the neighbour near an edge; the nearest centre is used only for a point inside no tehsil polygon, and `by` says which */
    let unit = null; try { const u = unitAtPoint(app, lat, lon); if (u && u.unit && u.by === 'polygon') { const t = u.unit; unit = { tehsil: t.tehsil || t.name, district: t.district, province: t.province, unitId: t.unitId, centreKm: t.lat != null ? Math.round(kmBetween(lat, lon, t.lat, t.lon) * 10) / 10 : null, by: 'polygon' }; } } catch {}
    if (!unit) try { let bd = Infinity; for (const u of units.tehsil) { if (u.lat == null) continue; const d = kmBetween(lat, lon, u.lat, u.lon); if (d < bd) { bd = d; unit = { tehsil: u.tehsil, district: u.district, province: u.province, unitId: u.unitId, centreKm: Math.round(d * 10) / 10, by: 'nearest centre' }; } } } catch {}
    /* GEO281 · the named OSM area holding the point (smallest first); none → the nearest place, phrased as near, never as "at" */
    let area = null; try { area = PA().lookup(lat, lon); } catch (_) { area = null; }
    const kmR = Math.round(km * 10) / 10;
    const label = (area ? ('in ' + area.name) : km < 0.1 ? ('at ' + r.name + ' (its point)') : km < 0.8 ? ('near ' + r.name + ' (' + kmR + ' km ' + dir + ')') : (kmR + ' km ' + dir + ' of ' + r.name)) + (unit ? ' (' + unit.tehsil + ' tehsil, ' + (unit.district || unit.province) + ')' : '');
    const town = pick((x) => x.pop >= 20000 && /^PPL/.test(x.fcode), 60);
    /* v91.17.146 · CEO 4 Oct ("we claim hyperlocal: name the right place"): the display name of the point itself. An Islamabad
       sector (supplement grid) within 1.2 km first, then a named neighbourhood or settlement within 1.5 km, then the nearest
       settlement with its distance; with the town (or tehsil) it belongs to. */
    /* GEO281 (owner, 19 Oct: 33.680860, 72.992720 is in F-11 but was named "G-11"): the name is the smallest named OSM AREA that
       contains the point (data/place-areas, build_place_areas.mjs). Only when no area contains it is the nearest settlement used, and
       then the name says "Near X (d km)" and contained:false — a nearest point is never presented as the place itself. The old rule
       (a hand-fitted sector centroid within 1.2 km, else any settlement point within 1.5 km, shown bare) is gone. */
    let place = null; try {
      const twn = unit && unit.district ? unit.district : (town ? town.r.name : null);
      const loc = area ? null : pick((x) => /^PPL/.test(x.fcode) && x.fcode !== 'PPLQ' && x.fcode !== 'PPLW', 1.5);
      if (area) place = { name: area.name, area: twn && twn !== area.name ? twn : null, km: 0, kind: 'area', contained: true, areaKind: area.kind,
        within: area.within.map((w) => w.name), localName: area.localName, source: 'OpenStreetMap area containing the point' };
      /* a coordinate within 100 m of a place's own point is that place's reference point (e.g. a searched place handed on by its
         coordinates): it keeps the bare name, still contained:false and kind 'place point' */
      else if (loc && loc.km < 0.1) place = { name: loc.r.name, near: loc.r.name, area: twn && twn !== loc.r.name ? twn : null, km: Math.round(loc.km * 100) / 100, kind: 'place point', contained: false };
      else if (loc) place = { name: 'Near ' + loc.r.name + ' (' + (Math.round(loc.km * 10) / 10) + ' km)', near: loc.r.name, area: twn && twn !== loc.r.name ? twn : null, km: Math.round(loc.km * 10) / 10, kind: 'near', contained: false };
      else place = { name: kmR + ' km ' + dir + ' of ' + r.name, area: twn && twn !== r.name ? twn : null, km: kmR, kind: 'offset', contained: false };
    } catch (_) { place = null; }
    return { label, place, unit, near: { name: r.name, kind: KIND[r.fcode] || r.fcode, district: r.district, province: r.province, lat: r.lat, lon: r.lon, elevM: r.elevM, population: r.pop || null }, distanceKm: Math.round(km * 10) / 10, bearing: dir,
      town: town && town.r !== r ? { name: town.r.name, distanceKm: Math.round(town.km * 10) / 10, bearing: bearing16(town.r.lat, town.r.lon, lat, lon) } : null,
      area: area ? { name: area.name, kind: area.kind, within: area.within.map((w) => w.name) } : null,
      source: area ? 'OpenStreetMap containing area + local place index (offline)' : 'local place index (GeoNames PK, offline)' };
  }

  /* v91.17.69 · the places inside a coarse browser fix. A desktop without GPS gets a network position (±50 km on the
     operator's machine); rather than drive the whole dashboard to a guessed point, the client lists the settlements
     inside that circle and the operator picks one. Settlements only, most populous first, then nearest. */
  function near(lat, lon, km, limit = 12) {
    if (!PL() || !Number.isFinite(lat) || !Number.isFinite(lon) || !(km > 0)) return [];
    const R = Math.min(150, km), dLa = Math.ceil(R / 11.1) + 1, dLo = Math.ceil(R / (11.1 * Math.max(0.2, Math.cos(lat * Math.PI / 180)))) + 1;
    const la0 = Math.floor(lat * 10), lo0 = Math.floor(lon * 10), out = [];
    const settled = (r) => /^PPL/.test(r.fcode) && r.fcode !== 'PPLQ' && r.fcode !== 'PPLW';
    for (let a = -dLa; a <= dLa; a++) for (let b = -dLo; b <= dLo; b++) { const arr = PL().grid.get((la0 + a) + ',' + (lo0 + b)); if (!arr) continue;
      for (const i of arr) { const r = PL().rows[i]; if (!settled(r)) continue; const d = kmBetween(lat, lon, r.lat, r.lon); if (d <= R) out.push({ r, d }); } }
    const seen = new Set();
    return out.sort((x, y) => ((y.r.pop || 0) - (x.r.pop || 0)) || (x.d - y.d)).filter((x) => { const k = norm(x.r.name) + '|' + (x.r.district || ''); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit)
      .map(({ r, d }) => withHeight({ name: r.name, district: r.district || null, province: r.province || null, lat: r.lat, lon: r.lon, elevM: r.elevM ?? null, population: r.pop || null, distanceKm: Math.round(d * 10) / 10, source: 'local place index' }));   /* v91.17.75 · M · 30 m height */
  }

  /* v91.17.283.3 · W2 · A TEHSIL ROW STANDS AT ITS POPULATED ANCHOR. It stood at the unit's shape point with the unit's settlement
     height, so a mountain tehsil was pinned on a peak (Gojal: 5,292 m terrain at the pin). data/tehsil-anchor.json
     (scripts/gen/gen_tehsil_anchor.mjs) holds a populated place inside each tehsil (its town, else its seat, else the settlement with
     the most people around it) with its own terrain height. A unit without an anchor keeps its shape point. The unit table itself
     (forecast and sweep points) is not changed. */
  const ANCH = (() => { try { return JSON.parse(readFileSync(join(app.dataDir, 'tehsil-anchor.json'), 'utf8')).units || {}; } catch (_) { return {}; } })();
  const anchorOf = (u) => { const a = ANCH[u.unitId] && ANCH[u.unitId].anchor; return a && Number.isFinite(a.lat) && Number.isFinite(a.lon) ? a : null; };
  /* one flat searchable index over tehsils and their districts */
  const INDEX = (() => {
    const rows = [], seen = new Set();
    for (const u of units.tehsil) {
      const push = (name, level) => {
        const k = norm(name) + '|' + level;
        if (!name || seen.has(k)) return;
        seen.add(k);
        rows.push({
          name, level, key: u.key, unitId: u.unitId,
          tehsil: u.tehsil, district: u.district, province: u.province,
          lat: u.lat, lon: u.lon, elevM: u.elevM,
          ...(level === 'tehsil' && anchorOf(u) ? { lat: anchorOf(u).lat, lon: anchorOf(u).lon, elevM: anchorOf(u).cellElevM ?? u.elevM, standsAt: anchorOf(u).name } : {}),
          disputed: !!u.disputed, scoreable: !u.disputed,
          source: 'AGN unit index',
          n: norm(name),
        });
      };
      push(u.tehsil, 'tehsil');
      push(u.district, 'district');
    }
    /* v91.17.255 · C-26 · A DISTRICT ROW STOOD AT ITS FIRST TEHSIL (CEO 12 Oct, "sialkot": "district · tehsil Daska"): the district row
       took the coordinate and the tehsil of whichever tehsil came first in the table, so choosing Sialkot district drove the page to
       Daska. A district row now stands at the tehsil that carries the district's own name (the district town), else at the middle of
       its tehsils, and names no tehsil. */
    const byD = new Map(); for (const u of units.tehsil) { if (u.lat == null || u.lon == null) continue; const k = norm(u.district || '') + '|' + norm(u.province || ''); if (!byD.has(k)) byD.set(k, []); byD.get(k).push(u); }
    for (const r of rows) { if (r.level !== 'district') continue; const ts = byD.get(norm(r.district || '') + '|' + norm(r.province || '')) || [];
      const dn = norm(r.district || '').replace(/ district$/, ''); const own = ts.find((t) => norm(t.tehsil || '') === dn) || ts.find((t) => norm(t.tehsil || '').startsWith(dn + ' '));
      if (own) { const A = anchorOf(own); r.lat = A ? A.lat : own.lat; r.lon = A ? A.lon : own.lon; r.elevM = A ? (A.cellElevM ?? own.elevM) : own.elevM; r.key = own.key; r.unitId = own.unitId; r.standsAt = 'the tehsil named ' + own.tehsil + (A ? ' (' + A.name + ')' : ''); }
      else if (ts.length) { r.lat = Math.round(ts.reduce((a, t) => a + t.lat, 0) / ts.length * 1e5) / 1e5; r.lon = Math.round(ts.reduce((a, t) => a + t.lon, 0) / ts.length * 1e5) / 1e5; r.elevM = null; r.standsAt = 'the middle of its ' + ts.length + ' tehsils'; }
      r.tehsil = null; }
    return rows;
  })();

  const provinceNear = (lat, lon) => {
    let best = null, bd = Infinity;
    for (const u of units.tehsil) {
      if (u.lat == null || u.lon == null) continue;
      const d = (u.lat - lat) ** 2 + ((u.lon - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
      if (d < bd) { bd = d; best = u; }
    }
    /* about 55 km; beyond that the nearest unit is not this point's province */
    return (best && bd <= 0.25) ? { province: best.province, km: Math.round(Math.sqrt(bd) * 111), from: best.name } : null;
  };

  /* ══ v91.17.9 · THE RESOLUTION STEP WAS THE WHOLE DEFECT ══════════════════
     MEASURED on v91.17.8, against the shipped build:

       "Gulberg"            -> Gulberg Town, Central KARACHI   (meant Lahore, ~1,000 km)
       "Johar Town"         -> Johar Town, SIALKOT             (meant Lahore, ~100 km)
       "Hayatabad"          -> Hayatabad, CHARSADDA            (meant Peshawar)
       "Gulshan-e-Iqbal"    -> Gulshan-e-Iqbal, ABBOTTABAD     (meant Karachi, ~1,100 km)
       "DHA"                -> Dhadar, Kachhi, BALOCHISTAN     (edit distance, ~700 km)
       "Faizabad"           -> Fyzabad, OKARA                  (edit distance, ~240 km)
       "Saddar"             -> Saddar Town, KARACHI            (meant Rawalpindi)

     Three separate faults, all of them here and none of them in the forecast:

     1. NO QUALIFIER PARSING. The query was treated as one atomic name, so the
        one correction a reader can make — naming the city — took a working
        search to zero: "Gulberg" returned 7 candidates and "Gulberg Lahore"
        returned NONE. A search that punishes the user for adding information
        is worse than one that guesses.

     2. RANKING BY SHAPE, NOT BY EVIDENCE. local() ordered exact -> startsWith
        -> contains and, inside each group, district before tehsil and then
        ALPHABETICALLY. Provider rows were then appended wholesale behind every
        AGN row. So for "Gulberg" the correct Lahore settlement was present all
        along, at position 4, and position 1 went to a Karachi tehsil whose name
        merely began with the same word. The right answer was in the data and
        the ordering threw it away.

     3. A FUZZY MATCH WAS RETURNED AS AN ANSWER. GeoNames matches on edit
        distance, so "DHA" reached "Dhadar" and "Faizabad" reached "Fyzabad",
        each in a different province. Those arrived with the same shape as an
        exact hit and the card printed them under a green "High confidence"
        chip, which makes a 700 km error indistinguishable from a correct one.

     The replacement scores every candidate on evidence and merges the two
     sources into ONE ranked list. Nothing about any particular place is written
     into this file: the qualifier vocabulary is derived from the district and
     province names already in the 577-unit index, so it covers Pakistan
     wherever the index does, and grows when the index does. */

  /* every district and province name in the index, as a qualifier vocabulary */
  const QUALIFIER = (() => {
    const set = new Set();
    for (const u of units.tehsil) {
      for (const v of [u.district, u.province]) {
        const n = norm(v);
        if (n) { set.add(n); set.add(n.replace(/ district$/, '')); }
      }
    }
    /* v91.17.62 · a word that sits inside two or more district names is a split city ("karachi" in South/East/West/
       Central Karachi and Karachi South District) and is a qualifier in its own right; the word-match in scoreRow /
       qualHit accepts it. Also the big cities by plain name where the district carries "District". */
    const words = new Map();
    for (const u of units.tehsil) { const d = norm(u.district || ''); for (const w of new Set(d.split(' '))) if (w.length >= 4 && w !== 'district') words.set(w, (words.get(w) || 0) + 1); }
    const perDistrict = new Map(); for (const u of units.tehsil) { const d = norm(u.district || ''); perDistrict.set(d, true); }
    const cnt = new Map(); for (const d of perDistrict.keys()) for (const w of new Set(d.split(' '))) if (w.length >= 4 && w !== 'district') cnt.set(w, (cnt.get(w) || 0) + 1);
    for (const [w, n] of cnt) if (n >= 2) set.add(w);
    set.delete('');
    return set;
  })();

  /* "Gulberg Lahore", "Gulberg, Lahore", "Hayatabad Peshawar" — split the query
     at every boundary and keep the LONGEST part that names a district or a
     province. The remainder is the place. Both orders are tried, because
     "Lahore Gulberg" is as natural as the reverse. */
  function parseQuery(q) {
    /* v91.17.9a · the split is decided on the NORMALISED tokens and the name is
       then cut from the RAW query. Normalising the name before handing it to the
       provider silently broke every hyphenated place: "Gulshan-e-Iqbal" became
       "gulshan e iqbal", which GeoNames indexes under neither, so a query that
       used to return the wrong city started returning nothing at all. The
       qualifier stays normalised, because it is only ever compared to the index. */
    let raw = String(q || '').trim();
    /* v91.17.15 · G2 · "Mirpur District" and "Hyderabad District" both answered
       "nothing matched". The administrative noun is not part of any name in the
       index, so it was carried into the match and defeated it. It is dropped
       before the split; what is left is the name the index holds. */
    raw = raw.replace(/[\s,]+(district|districts|tehsil|tahsil|taluka|division|agency)\s*$/i, '').trim() || raw;
    const rawToks = raw.split(/[\s,]+/).filter(Boolean);
    const toks = rawToks.map(norm).filter(Boolean);
    if (toks.length < 2 || rawToks.length !== toks.length) return { name: raw, qualifier: null };
    /* ══ v91.17.15 · G1 · THE SPLIT WAS DECIDED BY STRING LENGTH ═══════════
       Both halves of a two-word query can be qualifiers — "Hyderabad" is a
       district and "Sindh" is a province — and the tie was broken by whichever
       matched string was LONGER. So "Hyderabad Sindh" was read as the place
       "Sindh" inside the district "hyderabad", and answered with Sindhi,
       Sindhu and Sindhri, at score −11. Pakistan's second city was not in the
       result at all. The rule bites whenever the place name is longer than the
       qualifier after it, which is most of Punjab and Sindh: Faisalabad Punjab,
       Rawalpindi Punjab, Bahawalpur Punjab, Hyderabad Sindh.

       Length is not evidence. Position is: in "<place> <where it is>" the
       qualifier is written last. So the longest qualifying TAIL wins, and a
       head is only read as the qualifier when no tail qualifies at all — which
       is what keeps "Lahore Gulberg" resolving to Gulberg. */
    let best = null;
    for (let i = 1; i < toks.length; i += 1) {
      const tail = toks.slice(i).join(' ');
      if (QUALIFIER.has(tail) && (!best || tail.length > best.qualifier.length)) best = { name: rawToks.slice(0, i).join(' '), qualifier: tail };
    }
    if (!best || !best.name) {
      for (let i = 1; i < toks.length; i += 1) {
        const head = toks.slice(0, i).join(' ');
        if (QUALIFIER.has(head) && (!best || head.length > best.qualifier.length)) best = { name: rawToks.slice(i).join(' '), qualifier: head };
      }
    }
    /* a query that is ONLY a qualifier ("Lahore") stays a place name */
    return best && best.name ? best : { name: raw, qualifier: null };
  }

  /* bounded Levenshtein — enough to tell a romanisation apart from a coincidence */
  function editDistance(a, b, cap) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i += 1) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j += 1) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > cap) return cap + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  /* How well does one candidate answer this query? Every term is evidence the
     row carries, never a fact about a named place. */
  function scoreRow(row, nameN, qual) {
    const rn = norm(row.name);
    let s = 0, fuzzy = false, why = [];

    if (rn === nameN) { s += 100; why.push('exact name match'); }
    else if (rn.startsWith(nameN + ' ')) { s += 58; why.push('name begins with the query'); }
    else if (rn.startsWith(nameN)) { s += 50; why.push('name begins with the query'); }
    else if (rn.includes(nameN)) { s += 26; why.push('name contains the query'); }
    else {
      const d = editDistance(rn, nameN, 3);
      if (d <= 2 && nameN.length >= 5) { s += 8; fuzzy = true; why.push('spelling within ' + d + ' of the query'); }
      else { s -= 55; fuzzy = true; why.push('name does not match the query; matched on spelling distance only'); }
    }

    if (qual) {
      const d = norm(row.district || ''), p = norm(row.province || '');
      const dPlain = d.replace(/ district$/, '');
      const qw = new RegExp('(^|\\s)' + qual.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)');   /* v91.17.62 · "South Karachi" is in "karachi" */
      if (d === qual || dPlain === qual || p === qual || qw.test(d)) { s += 90; why.push('in ' + (row.district || row.province)); }
      else { s -= 65; why.push('NOT in ' + qual); }
    }

    /* v91.17.9a · was capped at 12, which could not separate Lahore (11 million)
       from a hamlet of the same name, so every major city was reported ambiguous
       against its own namesakes. Population is the strongest evidence there is
       about which of two identically-named places a person means. */
    if (row.population != null && row.population > 0) s += Math.min(32, Math.log10(row.population + 1) * 4.5);
    if (row.level === 'settlement') s += 4;   /* a person usually types a locality, not an admin unit */
    if (row.disputed) s -= 5;

    return { score: Math.round(s * 10) / 10, fuzzy, why };
  }

  function local(q, limit) {

    const n = norm(q);
    if (!n) return [];
    const exact = [], starts = [], contains = [];
    for (const r of INDEX) {
      if (r.n === n) exact.push(r);
      else if (r.n.startsWith(n)) starts.push(r);
      else if (n.length >= 3 && r.n.includes(n)) contains.push(r);
    }
    /* v91.17.9 · candidates only. The ordering used to happen here, by level and
       then alphabetically, which is what put a Karachi tehsil above the Lahore
       settlement a reader was asking for. Ranking is now done once, in search(),
       over BOTH sources together, so an AGN row no longer outranks a provider
       row merely by arriving first. */
    return [...exact, ...starts, ...contains].slice(0, Math.max(limit, 40));
  }

  async function remote(q, limit) {
    if (!provider || !provider.configured || !provider.configured()) return { rows: [], why: 'no paid provider key' };
    try {
      /* countryCode=PK cuts BEFORE the ranking. That one parameter is the whole
         fix for "Astore returns Italy". */
      const body = await provider.call('geocoding', '/v1/search',
        { name: q, count: Math.max(5, limit), language: 'en', format: 'json', countryCode: 'PK' },
        { locations: 1, timeoutMs: 15000 });
      const res = (body && body.results) || [];
      return {
        rows: res.map((r) => {
          const prov = r.admin1 || (r.latitude != null ? (provinceNear(r.latitude, r.longitude) || {}).province : null) || null;
          return {
            name: r.name, level: 'settlement',
            tehsil: null, district: r.admin2 || null,
            province: prov,
            provinceInferred: !r.admin1 && !!prov,
            lat: r.latitude, lon: r.longitude, elevM: r.elevation != null ? Math.round(r.elevation) : null,
            population: r.population != null ? r.population : null,
            disputed: false, scoreable: true,
            source: 'MACH gazetteer (GeoNames), countryCode=PK',
          };
        }),
        why: null,
      };
    } catch (e) { return { rows: [], why: e.message }; }
  }

  /* v91.17.77 · G · a coordinate is a place: the tehsil that contains it (by polygon, never a nearest centroid), whether it is
     inside Pakistan-administered territory, and the height a point forecast there should be asked at. */
  function pointRow(lat, lon, parsed) {
    const row = { name: coordLabel(lat, lon), lat, lon, level: 'coordinates', source: 'typed coordinates', score: 100, fuzzy: false,
      matchedOn: 'read as ' + (parsed && parsed.how || 'decimal degrees') + (parsed && parsed.swapped ? ' (longitude first: the first number cannot be a Pakistan latitude)' : '') };
    let u = null; try { u = unitAtPoint(app, lat, lon); } catch (_) { u = null; }
    const unit = u && u.by === 'polygon' ? u.unit : null;
    if (unit && !unit.disputed) {
      Object.assign(row, { administered: true, unitId: unit.unitId, tehsil: unit.tehsil || unit.name, district: unit.district, province: unit.province });
    } else if (unit && unit.disputed) {
      Object.assign(row, { administered: false, disputed: true, unitId: unit.unitId, province: unit.province,
        why: 'this point is in Indian Illegally Occupied Jammu & Kashmir (disputed territory). NIGRAAN publishes no forecast or hazard level there.' });
    } else {
      /* v91.17.283 · WS2 request R4 / D18 · outside every polygon: the shore rule of territory.mjs (the one the point engine uses) snaps a coastal
         point (Ormara town, Kemari port) into its tehsil and names the sea "at sea"; a land-border point stays outside */
      let c = null; try { c = TERR && TERR.classifyOutside ? TERR.classifyOutside(app.dataDir, (app.units && app.units.tehsil) || [], lat, lon) : null; } catch (_) { c = null; }
      if (c && c.kind === 'snapped' && c.unit) Object.assign(row, { administered: true, unitId: c.unit.unitId, tehsil: c.unit.tehsil || c.unit.name, district: c.unit.district, province: c.unit.province, snapped: { km: c.km } });
      else if (c && c.kind === 'sea') Object.assign(row, { administered: false, atSea: true, why: TERR.SEA_WHY });
      else Object.assign(row, { administered: false, outside: true,
        why: 'this point is outside Pakistan-administered territory' + (u && u.unit ? ' (the nearest tehsil, ' + (u.unit.tehsil || u.unit.name) + ', is ' + u.km + ' km away)' : '') + '. NIGRAAN publishes no forecast or hazard level there.' });
    }
    /* the height: a named place within 100 m keeps its 30 m height; otherwise the 250 m terrain cell mean where the cell is
       smooth enough (pointheight.mjs rule, data/terrain30-rules.json); in a rough cell the forecast provider's own point terrain
       is kept, as the rule measured it misses a point by less than the cell mean does */
    let h = null; try { h = ph() && ph().heightAt(lat, lon); } catch (_) { h = null; }
    if (h && h.ok && h.basis === 'place30' && h.elevM != null) Object.assign(row, { elevM: Math.round(h.elevM), forecastElevM: Math.round(h.elevM), heightBasis: '30 m terrain',
      elevSource: 'height from 30 m terrain (the named place ' + (h.place && h.place.distM != null ? h.place.distM + ' m away' : 'at this point') + ')' });
    else if (h && h.ok && h.basis === 'cell30' && h.cellElevM != null) {
      const rough = !h.sendElevation;
      Object.assign(row, { elevM: rough ? null : Math.round(h.cellElevM), cellElevM: Math.round(h.cellElevM), forecastElevM: rough ? null : Math.round(h.cellElevM), heightBasis: rough ? 'forecast provider terrain' : '250 m terrain', reliefM: h.cell ? h.cell.reliefM : null,
        elevSource: rough ? ('height from 250 m terrain (cell mean ' + Math.round(h.cellElevM) + ' m; the cell spans ' + (h.cell && h.cell.reliefM) + ' m of relief, so the forecast is asked at the forecast provider\u2019s own terrain height for the point)')
                          : 'height from 250 m terrain (cell mean)' });
    } else Object.assign(row, { elevM: null, forecastElevM: null, heightBasis: null, elevSource: 'no terrain height held for this point: the forecast provider\u2019s own terrain height is used' });
    return row;
  }

  async function search(q, opts) {
    const limit = Math.min(20, Math.max(1, Number((opts && opts.limit) || 10)));
    const query = String(q || '').trim();
    if (!query) return { query, results: [], why: 'empty query' };
    const pc = parseCoords(query);
    if (pc) {
      const row = pointRow(pc.lat, pc.lon, pc);
      return { query, parsed: { coordinates: { lat: pc.lat, lon: pc.lon, how: pc.how, swapped: pc.swapped } }, aliasUsed: null, results: [row],
        chosen: { name: row.name, district: row.district || null, province: row.province || null, lat: row.lat, lon: row.lon, score: 100, fuzzy: false, matchedOn: row.matchedOn },
        autoSelect: !!row.administered, ambiguous: false, qualifierSatisfied: true, ambiguityWhy: row.administered ? null : row.why,
        resolution: [{ step: 'coordinates parsed from the query', how: pc.how, swapped: pc.swapped }, { step: 'tehsil by polygon', unit: row.unitId || null }],
        scope: 'a typed coordinate: the exact point, its terrain height and the tehsil that contains it. Outside Pakistan-administered territory nothing is scored.',
        providerError: null };
    }

    /* v91.17.283 · WS4 · D19 · a query in Urdu (Arabic script) is looked up in the GeoNames Urdu alternate names (data/pk-names-urdu.json,
       scripts/gen/gen_urdu_names.py) and then searched by the ASCII name, so "لاہور" resolves to the same place as "Lahore" */
    if (/[\u0600-\u06FF]/.test(query) && !(opts && opts._urdu)) {
      const parts = query.split(/[\u060C,]/).map((x) => x.trim()).filter(Boolean);
      const hit = (x) => { const U = urduNames(); return U ? U[urduKey(x)] || null : null; };
      const whole = hit(query), first = whole || hit(parts[0] || '');
      if (first) {
        const q2 = whole ? first.name : [first.name, ...parts.slice(1).map((x) => (hit(x) || { name: x }).name)].join(', ');
        const r = await search(q2, { ...(opts || {}), _urdu: true });
        return { ...r, query, urduName: { asked: query, searchedAs: q2, source: 'GeoNames Urdu alternate names (CC BY 4.0)' }, resolution: [{ step: 'Urdu name -> ' + q2 }, ...(r.resolution || [])] };
      }
      return { query, results: [], why: 'no place of this Urdu name is in the Urdu name index (GeoNames alternate names); try the English spelling', urduName: { asked: query, searchedAs: null } };
    }
    const tried = [];
    const parsed = parseQuery(query);
    /* v91.17.9b · TWO FORMS OF THE SAME NAME, AND THEY ARE NOT INTERCHANGEABLE.
       The provider must be asked in the reader's own spelling ("Gulshan-e-Iqbal"),
       because GeoNames indexes the hyphen; the index, the alias table and the
       scorer must all be given the normalised form, because that is what they
       hold. Handing the raw string to the scorer made every comparison fail on
       case alone, so every row in the country came back flagged as a spelling
       match, and the alias table stopped resolving Diamer and Neelum. */
    const secQ = sectorKey(norm(parsed.name));
    const nameRaw = secQ ? secQ.toUpperCase().replace(' ', '-') : parsed.name;
    const nameN = secQ || norm(parsed.name);
    const qual = parsed.qualifier;
    if (qual) tried.push({ step: 'qualifier parsed from the query', name: nameRaw, qualifier: qual });

    /* the place part only — the qualifier is a FILTER, never part of the name.
       This is the whole of fault 1: the old code searched for the literal
       string "gulberg lahore", which is the name of nothing. */
    let rows = local(nameRaw, limit);
    tried.push({ step: 'AGN unit index', hits: rows.length });

    let aliasUsed = null;
    if (!rows.length) {
      const a = ALIASES[nameN];
      if (a) { aliasUsed = a; rows = local(a, limit); tried.push({ step: 'alias table (' + nameRaw + ' -> ' + a + ')', hits: rows.length }); }
    }

    /* the provider is always asked, not only when the index came up short: the
       index holds admin units, the provider holds localities, and the answer to
       "Gulberg" lives in the second while the first has a same-named tehsil. */
    let providerWhy = null;
    /* v91.17.47 · the local place index holds the localities; the provider is asked only when it holds nothing */
    const lp = localPlaces(aliasUsed || nameRaw, Math.max(10, limit));
    tried.push({ step: 'local place index (offline)', hits: lp.rows.length, error: lp.why || undefined });
    let r = { rows: [], why: null };
    const qualWord = qual ? new RegExp('(^|\\s)' + qual.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)') : null;
    const qualHit = (x) => { if (!qual) return true; const d = norm(x.district || ''), pv = norm(x.province || ''); return d === qual || d.replace(/ district$/, '') === qual || pv === qual || qualWord.test(d); };   /* v91.17.62 · "South Karachi" satisfies "karachi" */
    const localAnswers = (lp.rows.length || rows.length) && (!qual || lp.rows.some(qualHit) || rows.some(qualHit));
    if (!localAnswers && opts && opts.skipRemote) tried.push({ step: 'MACH gazetteer with countryCode=PK', hits: 0, skipped: opts.skipRemote });   /* v91.17.116 */
    else if (!localAnswers) { r = await remote(aliasUsed || nameRaw, Math.max(10, limit)); providerWhy = r.why; tried.push({ step: 'MACH gazetteer with countryCode=PK', hits: r.rows.length, error: r.why || undefined, because: qual ? 'nothing local satisfied the qualifier "' + qual + '"' : 'nothing local' }); }
    else tried.push({ step: 'MACH gazetteer with countryCode=PK', hits: 0, skipped: 'the local index answered' });
    r = { rows: lp.rows.concat(r.rows), why: r.why };

    /* de-duplicate on name AND coordinate, so three different Gulbergs all
       survive and the same place from two sources does not appear twice */
    const seenRow = new Set();
    const merged = [];
    for (const x of rows.concat(r.rows)) {
      const k = norm(x.name) + '|' + (x.lat == null ? '?' : x.lat.toFixed(2)) + ',' + (x.lon == null ? '?' : x.lon.toFixed(2));
      if (seenRow.has(k)) continue;
      /* v91.17.62 · the same locality from two sources (a GeoNames point, an OSM area centre) a few hundred metres apart is one place */
      if (x.lat != null && merged.some((m) => norm(m.name) === norm(x.name) && m.lat != null && kmBetween(m.lat, m.lon, x.lat, x.lon) < 3)) continue;
      seenRow.add(k);
      merged.push(x);
    }

    const scored = merged.map((x) => {
      const sc = scoreRow(x, aliasUsed ? norm(aliasUsed) : nameN, qual);
      /* v91.17.47 · a row that matched only through one of its alternate spellings ranks below a row whose own
         name matched: "Passu" is the Hunza village, not the Gwadar hamlet indexed under that spelling as an alias */
      const pen = x.via === 'alternate name' ? 30 : x.via === 'prefix match' ? 20 : x.via === 'spelling match' ? 40 : 0;
      return Object.assign({}, x, { score: Math.max(x.via === 'spelling match' ? ((x.population || 0) >= 100000 ? 60 : 30 + Math.min(20, Math.log10((x.population || 1)) * 3)) : x.via === 'prefix match' ? 35 : 0, sc.score - pen), fuzzy: sc.fuzzy || x.via === 'spelling match', matchedOn: sc.why.join(' · ') + (pen ? ' · alternate spelling (−30)' : '') });
    }).sort((a, b) => b.score - a.score);

    /* v91.17.255 · C-26 · SAME-NAME CLUTTER (CEO 12 Oct, HISAAB review point 1 checked on NIGRAAN: "sialkot" listed two villages called
       Sialkot, in Lower Dir and Jhang, with no population on record, above the Sialkot tehsil and district, and road names in between).
       When the query names a real town (a place of this name with a population of 10,000 or more, or a tehsil or district of this
       name), a same-name settlement with no population on record is listed after the town, its tehsil and its district; and streets,
       buildings and water features are listed after places. Nothing is removed: a reader who means the village still finds it. */
    {
      const PLACE = new Set(['settlement', 'locality', 'tehsil', 'district', 'province', 'admin area', 'union council / ward', 'ward', 'sector', 'neighbourhood', 'area']);
      const exactN = aliasUsed ? norm(aliasUsed) : nameN;
      const town = scored.some((x) => norm(x.name) === exactN && ((x.population || 0) >= 10000 || x.level === 'tehsil' || x.level === 'district'));
      let moved = false;
      for (const x of scored) {
        if (town && x.level === 'settlement' && !((x.population || 0) > 0) && norm(x.name) === exactN) { x.score = Math.round((x.score - 30) * 10) / 10; x.matchedOn = (x.matchedOn || '') + ' · a small place of the same name with no population on record, listed after the town (-30)'; moved = true; }
        else if (x.level && !PLACE.has(x.level)) { x.score = Math.round((x.score - 25) * 10) / 10; x.matchedOn = (x.matchedOn || '') + ' · a ' + x.level + ', listed after places (-25)'; moved = true; }
      }
      if (moved) scored.sort((a, b) => b.score - a.score);
    }

    /* v91.17.62 · "lahor": four hamlets called Lahor match the name exactly and the city matches only as an alternate
       spelling. A city of millions found through a near spelling goes first, but never silently: the close-rival rule
       below then lists both instead of auto-selecting. */
    if (scored.length > 1 && (scored[0].population || 0) < 100000) {
      const big = scored.findIndex((x) => (x.population || 0) >= 100000 && x.score >= 40 && x.via === 'alternate name');   /* a recorded alternate spelling, not a guess */
      if (big > 0) { scored[big].score = scored[0].score + 4; scored[big].matchedOn += ' · major place found by near spelling (+)'; scored.sort((a, b) => b.score - a.score); }
    }
    /* v91.17.75 · M · one row per place (a sector point and the Markaz ground 1 km away), and a 30 m height on every row */
    /* v91.17.228 · a place outside Pakistan-administered territory (the street map holds the neighbours' streets too) is listed after
       every place inside it: an exact foreign match ("E-7", Gurgaon) ranked second for a Pakistan search and could make a clear query
       look ambiguous. It is still listed, with the reason NIGRAAN gives no forecast there. */
    const ranked = mergeSamePlace(scored, nameN).slice(0, limit + 8).map(withHeight);
    const results = ranked.filter((r) => !r.outside).concat(ranked.filter((r) => r.outside)).slice(0, limit);
    const top = results[0] || null;
    const second = results[1] || null;

    /* ── WHEN NOT TO ANSWER ────────────────────────────────────────────────
       A single result printed on a card is a claim that the question had one
       answer. "Gulberg" has at least four in Pakistan and "Bahria Town" has
       three, so a build that silently picks one is wrong most of the time and
       never says so. autoSelect is the flag the interface reads: false means
       show the list and let a person choose. */
    /* ── WHEN A QUALIFIER IS NAMED AND NOTHING SATISFIES IT ────────────────
       v91.17.9a. "Johar Town Lahore" and "Faizabad Rawalpindi" are the test:
       neither source holds a place of that name in that district, and the old
       scoring still surfaced the Sialkot and Sindh rows, one of them with
       autoSelect TRUE at a score of 39. A row that FAILS the filter the reader
       supplied is not a weaker answer to their question — it is an answer to a
       different question, and offering it silently is how the wrong city gets
       printed under a confidence chip. */
    const qualSatisfied = !qual || results.some(qualHit);

    /* Dominance, not mere plurality. Several places share a name across Pakistan;
       that only makes the query ambiguous when no candidate clearly wins.
       Population settles most of them — Lahore against a hamlet called Lahore is
       not a close call, and reporting it as one is noise. */
    const dominant = !top ? false
      : (!second ? true
        : ((top.score - second.score) >= 25
           || ((top.population || 0) >= 10 * ((second.population || 0) + 1) && (top.score - second.score) > 0)));

    const provinces = new Set(results.filter((x) => x.score > 0).map((x) => x.province || '?'));
    const closeRival = !!(top && second && (top.score - second.score) < 25 && second.score > 0);
    const ambiguous = !!(top && (!dominant || !qualSatisfied));
    const autoSelect = !!(top && dominant && qualSatisfied && !top.fuzzy && top.score > 0);

    const ambiguityWhy = !top ? 'nothing matched'
      : (!qualSatisfied
          ? ('no place called "' + nameRaw + '" was found in ' + qual
             + '. The rows below are places of that name ELSEWHERE in Pakistan and none of them '
             + 'answers the question that was asked.')
        : (closeRival
            ? ('"' + top.name + '" in ' + (top.district || top.province || 'an unnamed unit')
               + ' scores ' + top.score + ' against "' + second.name + '" in '
               + (second.district || second.province || 'an unnamed unit') + ' at ' + second.score
               + '; that gap is too small to choose between them'
               + (provinces.size > 1 ? '. Naming the district or province resolves it.' : ''))
          : (top.fuzzy
              ? 'no place of this name was found; the best row matched on spelling distance only'
              : (!dominant ? 'no candidate clearly outranks the others' : null))));

    return {
      query,
      parsed: { name: nameRaw, qualifier: qual },
      aliasUsed,
      results: results.map((x) => (x && typeof x.name === 'string') ? { ...x, name: canonName(x.name, x.lat, x.lon) } : x),   /* v91.17.283 · D17 */
      /* the reason the top row is the top row, in words, so a wrong pick is
         readable rather than inferred */
      chosen: top ? {
        name: canonName(top.name, top.lat, top.lon), district: top.district, province: top.province,
        lat: top.lat, lon: top.lon, score: top.score, fuzzy: top.fuzzy,
        matchedOn: top.matchedOn,
      } : null,
      autoSelect,
      ambiguous,
      qualifierSatisfied: qualSatisfied,
      ambiguityWhy,
      resolution: tried,
      scope: 'Pakistan only. Azad Kashmir and Gilgit-Baltistan are included and scored as Pakistan. Indian Illegally Occupied Jammu & Kashmir is listed where the unit index holds it, marked disputed, and is never scored.',
      providerError: providerWhy,
    };
  }

  /* v91.17.88 · the named neighbourhoods around a point for the hyperlocal area table: Islamabad sectors (supplement) first,
     then OSM neighbourhoods (PPLX), then settlements by population; at least minKm apart, at most `max` */
  function placesNear(lat, lon, radiusKm = 12, max = 36, minKm = 1.2) {
    if (!PL()) return [];
    const k = (a, b, c, d) => { const p = Math.PI / 180; const x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
    const dLat = radiusKm / 111, dLon = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
    const rank = (r) => (r.src === 'extra' ? 0 : r.fcode === 'PPLX' ? 1 : /^PPLA/.test(r.fcode) ? 2 : r.fcode === 'PPL' ? 3 : 9);
    const cand = [];
    for (const r of PL().rows) {
      if (Math.abs(r.lat - lat) > dLat || Math.abs(r.lon - lon) > dLon || rank(r) > 3) continue;
      const d = k(lat, lon, r.lat, r.lon); if (d <= radiusKm) cand.push({ r, d });
    }
    cand.sort((a, b) => rank(a.r) - rank(b.r) || (b.r.pop || 0) - (a.r.pop || 0) || a.d - b.d);
    const out = [];
    for (const c of cand) {
      if (out.length >= max) break;
      if (!/\p{L}/u.test(c.r.name) || /^(site|plot|block)\b/i.test(c.r.name)) continue;
      if (out.some(o => k(o.lat, o.lon, c.r.lat, c.r.lon) < minKm || o.name.toLowerCase() === String(c.r.ascii || c.r.name).toLowerCase())) continue;
      const nm = /[A-Za-z]/.test(c.r.name) ? c.r.name : (c.r.ascii && /[A-Za-z]/.test(c.r.ascii) ? c.r.ascii : null); if (!nm) continue;
      out.push({ name: nm, lat: c.r.lat, lon: c.r.lon, kind: c.r.src === 'extra' ? 'sector' : c.r.fcode === 'PPLX' ? 'neighbourhood' : 'settlement', district: c.r.district, province: c.r.province, km: Math.round(c.d * 10) / 10 });
    }
    return out;
  }
  /* v91.17.266 · an exact name (or alternate name) in the local place index: the AI's typo rule never reads such a token as a mistyped word */
  const hasName = (n) => { try { const P = PL(); return !!(P && P.byName.has(norm(n))); } catch (_) { return false; } };
  return { search, pointRow, parseCoords, reverse, near, placesNear, hasName, aliases: () => ({ ...ALIASES }), size: () => INDEX.length, places: () => PL() ? { rows: PL().rows.length, meta: PL().meta } : null,
    /* the server's warm-up: one slice per turn of the event loop, then PL() finishes and logs as before */
    warm: async () => { if (PLACES_ === undefined) { try { if (!GEN) GEN = loadPlacesSteps(app.dataDir); while (PLACES_ === undefined && GEN) { const t = Date.now(); let r = GEN.next(); while (!r.done && Date.now() - t < 40) r = GEN.next(); if (r.done) { const v = r.value; GEN = { next: () => ({ done: true, value: v }) }; break; } await new Promise((ok) => setImmediate(ok)); } } catch (_) { GEN = null; } } try { PA().ready(); } catch (_) {} return !!PL(); },
    placeAreas: () => PA().meta() };   /* GEO281 · the named-area index (OpenStreetMap), loaded with the warm-up */
}
