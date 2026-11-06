/* v91.17.283.3 · W2 · THE POPULATED ANCHOR OF EVERY TEHSIL, for the place search pin (data/tehsil-anchor.json).
   The tehsil search row stood at the unit's shape point (contract/units.json lat/lon) with the unit's settlement height, so a
   mountain tehsil was pinned on a peak (Gojal: 5,292 m terrain at the pin, people live at about 3,050 m). The anchor is a populated
   place (GeoNames PK, data/pk-places.tsv.gz; settlements only, not abandoned or destroyed) INSIDE the tehsil polygon
   (data/pk-tehsils.json), chosen in this order, from data only:
     1. a settlement named as the tehsil (the tehsil town);
     2. else the highest administrative seat (PPLC, PPLA, PPLA2, PPLA3, PPLA4);
     3. else the settlement with the most people around it: WorldPop 2020 (Census 2023 scaled) persons in its 250 m cell and the
        8 cells around it (data/feat p_pop, about 750 m x 750 m); ties by the place index's recorded population;
     4. else the settlement whose terrain height is nearest the tehsil's population-weighted median height
        (data/settlement-elevation.json settlementElevM, GHS-POP x GLO-30).
   Heights are the 9-arc-second GLO-30 cell (data/feat t_elev), the same for the shape point and the anchor.
   usage: node scripts/gen/gen_tehsil_anchor.mjs [dataDir]   (writes <dataDir>/tehsil-anchor.json) */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = process.argv[2] || join(ROOT, 'data');
const { createFeatGrid } = await import(pathToFileURL(join(ROOT, 'server', 'api', 'featgrid.mjs')).href);
const FG = createFeatGrid(DATA); const elev = (la, lo) => { let v = null; try { v = FG.value('t_elev', la, lo); } catch (_) { v = null; } return v == null ? null : Math.round(v); };
const popAround = (la, lo) => { let t = 0; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { let v = null; try { v = FG.value('p_pop', la + i * 0.0025, lo + j * 0.0025); } catch (_) { v = null; } if (v != null && v > 0) t += v; } return Math.round(t); };
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const units = JSON.parse(readFileSync(join(ROOT, 'server', 'contract', 'units.json'), 'utf8'));
const polys = new Map(JSON.parse(readFileSync(join(DATA, 'pk-tehsils.json'), 'utf8')).features.map((f) => [f.properties.uid, f.geometry]));
const SE = JSON.parse(readFileSync(join(DATA, 'settlement-elevation.json'), 'utf8')).units || {};
const places = gunzipSync(readFileSync(join(DATA, 'pk-places.tsv.gz'))).toString('utf8').split('\n').map((l) => l.split('\t')).filter((c) => c.length >= 10)
  .map((c) => ({ name: c[0], ascii: c[1], lat: +c[3], lon: +c[4], fcode: c[5], pop: +c[6] || 0 })).filter((r) => /^PPL/.test(r.fcode) && r.fcode !== 'PPLQ' && r.fcode !== 'PPLW' && r.fcode !== 'PPLH' && Number.isFinite(r.lat));
const grid = new Map(); for (const p of places) { const k = Math.floor(p.lat * 10) + ',' + Math.floor(p.lon * 10); (grid.get(k) || grid.set(k, []).get(k)).push(p); }
const ringsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
function inside(lon, lat, g) { let c = false; for (const poly of ringsOf(g)) for (const r of poly) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } return c; }
const SEAT = { PPLC: 5, PPLA: 4, PPLA2: 3, PPLA3: 2, PPLA4: 1 };
const out = { built: new Date().toISOString().slice(0, 10), version: 'tehsil-anchor-91.17.283.3', method: 'see scripts/gen/gen_tehsil_anchor.mjs header: a populated place inside the tehsil polygon (tehsil town, else highest administrative seat, else most populous, else the settlement nearest the population-weighted median height); heights: GLO-30 9-arc-second cell (data/feat t_elev)',
  sources: 'GeoNames PK (CC BY 4.0) via data/pk-places.tsv.gz; data/pk-tehsils.json; data/settlement-elevation.json (GHS-POP E2025 x GLO-30); Copernicus GLO-30', units: {} };
let nNo = 0, n500 = 0;
for (const u of units) { if (u.disputed) continue; const g = polys.get(u.unitId); if (!g) continue;
  let bb = [180, 90, -180, -90]; for (const poly of ringsOf(g)) for (const r of poly) for (const [x, y] of r) { bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); }
  const C = []; for (let a = Math.floor(bb[1] * 10); a <= Math.floor(bb[3] * 10); a++) for (let b = Math.floor(bb[0] * 10); b <= Math.floor(bb[2] * 10); b++) for (const p of grid.get(a + ',' + b) || []) if (inside(p.lon, p.lat, g)) C.push(p);
  const se = SE[u.unitId] && SE[u.unitId].settlementElevM; const cz = elev(u.lat, u.lon); const tn = norm(u.tehsil);
  let pick = null, rule = null;
  const named = C.filter((p) => norm(p.name) === tn || norm(p.ascii) === tn); if (named.length) { pick = named.sort((a, b) => (SEAT[b.fcode] || 0) - (SEAT[a.fcode] || 0) || b.pop - a.pop)[0]; rule = 'tehsil town (same name)'; }
  if (!pick) { const s = C.filter((p) => SEAT[p.fcode]).sort((a, b) => SEAT[b.fcode] - SEAT[a.fcode] || b.pop - a.pop); if (s.length) { pick = s[0]; rule = 'administrative seat (' + pick.fcode + ')'; } }
  if (!pick) { const s = C.map((p) => ({ p, n: popAround(p.lat, p.lon) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || b.p.pop - a.p.pop); if (s.length) { pick = s[0].p; pick._popAround = s[0].n; rule = 'settlement with the most people around it (WorldPop, 750 m window)'; } }
  if (!pick && se != null && C.length) { const s = C.map((p) => ({ p, z: elev(p.lat, p.lon) })).filter((x) => x.z != null).sort((a, b) => Math.abs(a.z - se) - Math.abs(b.z - se)); if (s.length) { pick = s[0].p; rule = 'settlement nearest the population-weighted median height'; } }
  if (!pick) { nNo++; out.units[u.unitId] = { anchor: null, why: 'no settlement of the place index inside the polygon: the shape point is kept', centre: { lat: u.lat, lon: u.lon, cellElevM: cz } }; continue; }
  const az = elev(pick.lat, pick.lon); const dz = cz != null && az != null ? cz - az : null; if (dz != null && Math.abs(dz) > 500) n500++;
  out.units[u.unitId] = { anchor: { name: pick.name, lat: pick.lat, lon: pick.lon, cellElevM: az, population: pick.pop || null, fcode: pick.fcode, ...(pick._popAround ? { peopleWithin750m: pick._popAround } : {}) }, rule, centre: { lat: u.lat, lon: u.lon, cellElevM: cz }, centreMinusAnchorM: dz, settlementElevM: se ?? null, candidates: C.length };
}
out.counts = { units: Object.keys(out.units).length, noAnchor: nNo, centreVsAnchorOver500m: n500 };
writeFileSync(join(DATA, 'tehsil-anchor.json'), JSON.stringify(out));
console.log(JSON.stringify(out.counts), 'Gojal:', JSON.stringify(out.units['Gilgit Baltistan|Hunza|Gojal']));
