/* v91.17.116 · STREET / PLACE-OF-INTEREST SEARCH, OFFLINE (data/geo/street-index.json, built from the local OpenStreetMap street map by
   scripts/gen/build_street_index.mjs). Answers names the place gazetteer does not hold: roads and avenues, hospitals, schools, markets,
   neighbourhoods. Each hit is resolved to the exact point and its tehsil by polygon (gazetteer.pointRow), so choosing it drops the exact pin.
   Same name within 3 km = one hit (a road is many segments). House numbers: OpenStreetMap holds very few in Pakistan, so none are offered. */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LABEL = { road: 'street', locality: 'locality', neighbourhood: 'neighbourhood', macrohood: 'area', residential: 'residential area', water: 'water',
  hospital: 'hospital', school: 'school', college: 'college', university: 'university', place_of_worship: 'place of worship', park: 'park',
  supermarket: 'market', commercial: 'commercial area', industrial: 'industrial area', aerodrome: 'airport', bus_station: 'bus station', police: 'police',
  fuel: 'fuel station', hotel: 'hotel', peak: 'peak', glacier: 'glacier', primary: 'street', secondary: 'street', tertiary: 'street', trunk: 'street', motorway: 'street' };
const SKIP = new Set(['administrative']);   /* boundary names from the map data are not AGN boundaries */
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9؀-ۿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const km = (a, b, c, d) => { const R = 6371, p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

export function createStreetSearch(dataDir, gazetteer) {
  let IX = null, MT = 0; const CACHE = new Map();
  function load() {
    const f = join(dataDir, 'geo', 'street-index.json'); if (!existsSync(f)) return null;
    const mt = statSync(f).mtimeMs; if (IX && mt === MT) return IX;
    const J = JSON.parse(readFileSync(f, 'utf8')); const rows = [];
    for (const r of J.rows) { const kind = J.kinds[r[1]]; if (SKIP.has(kind)) continue; rows.push({ name: r[0], n: norm(r[0]), local: r[4] || null, nl: r[4] ? norm(r[4]) : null, kind, lat: r[2], lon: r[3] }); }
    IX = { meta: { built: J.built, source: J.source, licence: J.licence, n: rows.length }, rows }; MT = mt; CACHE.clear(); return IX;
  }
  function search(q, limit = 6) {
    const I = load(); if (!I) return { ready: false, rows: [] };
    const qn = norm(q); if (qn.length < 3) return { ready: true, rows: [] };
    const words = qn.split(' ');
    /* v91.17.155 · the same scores as before, without building word lists for each of the 355,000 rows: a row that does not
       contain the query is settled by one indexOf (the old scan took about 0.3 s per call and a search called it two or three
       times, blocking the server for up to a second). The scored list of the last queries is kept, so the pre-check and the
       main search share one scan. */
    const score = (r) => { const t = r.n; let i = t.indexOf(qn);
      if (i < 0) { if (r.nl && r.nl.startsWith(qn)) return r.nl === qn ? 100 : 80; return (words.length > 1 && words.every(w => t.includes(w))) ? 55 : 0; }
      if (t === qn || r.nl === qn) return 100; if (i === 0 || (r.nl && r.nl.startsWith(qn))) return 80;
      while (i >= 0) { if (t[i - 1] === ' ') return 65; i = t.indexOf(qn, i + 1); }
      if (words.length > 1 && words.every(w => t.includes(w))) return 55; return qn.length >= 5 ? 45 : 0; };
    let hits = CACHE.get(qn);
    if (!hits) { hits = []; for (const r of I.rows) { const s = score(r); if (s) hits.push([s, r]); }
      hits.sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length);
      CACHE.set(qn, hits); if (CACHE.size > 64) CACHE.delete(CACHE.keys().next().value); }
    const out = [];
    for (const [s, r] of hits) {
      if (out.some(o => o.hit.n === r.n && o.hit.kind === r.kind && km(o.hit.lat, o.hit.lon, r.lat, r.lon) < 3)) continue;
      out.push({ s, hit: r }); if (out.length >= limit * 3) break;
    }
    const rows = [];
    for (const { s, hit } of out) {
      let row = null; try { row = gazetteer.pointRow(hit.lat, hit.lon, { how: 'street map' }); } catch (_) { row = null; }
      if (!row) continue;
      if (rows.some(o => o.name === hit.name && o.kind === hit.kind && o.unitId && o.unitId === row.unitId)) continue;   /* one hit per name per tehsil */
      Object.assign(row, { name: hit.name, nameLocal: hit.local, level: LABEL[hit.kind] || hit.kind.replace(/_/g, ' '), kind: hit.kind, exact: true, score: s,
        source: 'OpenStreetMap (local street map)', matchedOn: 'street map name' + (s === 100 ? '' : ' (partial)') });
      rows.push(row); if (rows.length >= limit) break;
    }
    return { ready: true, rows, meta: I.meta };
  }
  return { search, status: () => { const I = load(); return I ? { ready: true, ...I.meta } : { ready: false, why: 'data/geo/street-index.json not installed' }; } };
}
