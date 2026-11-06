/* == v91.17.283.12 . ONE PLACE RESOLUTION FOR EVERY PAGE ==============================================================================
   Owner 24 Oct 2026: "Muzaffarabad" was 34.26, 73.61 on the start page (a point inside the tehsil polygon, drawn by the page) and 34.37,
   73.47 on the analyst (the town). One rule, applied by the server's own search (/api/geo/search, results[0]) and served on its own as
   /api/geo/resolve; every page takes results[0] or the resolve answer, never its own polygon point.
     - a town or settlement name resolves to the settlement point. A tehsil or district row whose point already IS the town of the same
       name (data/tehsil-anchor.json: rule "tehsil town (same name)") is that settlement; otherwise a settlement of the same name among the
       results goes first;
     - only an explicit "X tehsil" / "X district" query (or a tehsil pick, which the pages send as "X tehsil") resolves to the unit, and
       then the point is the unit's main settlement (its anchor; a district: the anchor of its most populous tehsil), with a label saying so.
   Pure apart from reading the anchor file once. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
let ANCH = null;
function anchors() {
  if (ANCH) return ANCH;
  try { ANCH = JSON.parse(readFileSync(join(process.env.NIGRAAN_DATA_DIR || join(HERE, '..', '..', 'data'), 'tehsil-anchor.json'), 'utf8')).units || {}; } catch (_) { ANCH = {}; }
  return ANCH;
}
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const UNIT_WORD = /\b(tehsil|district|taluka|tahsil)\b/i;

/* the most populous tehsil anchor of a district (province optional) */
function districtAnchor(district, province) {
  const A = anchors(), d = norm(String(district || '').replace(/ District$/i, '')); let best = null;
  for (const [id, u] of Object.entries(A)) { const [pv, ds] = id.split('|'); if (norm(ds) !== d || (province && norm(pv) !== norm(province))) continue;
    const a = u && u.anchor; if (a && Number.isFinite(a.lat) && (!best || (a.population || 0) > (best.population || 0))) best = a; }
  return best;
}
function sameTown(r) { return !!(r && r.standsAt && norm(r.standsAt) === norm(r.name)); }
const isUnit = (r) => r && (r.level === 'tehsil' || r.level === 'district');
const isSettlement = (r) => r && (r.level === 'settlement' || r.level === 'locality' || /^(settlement|locality|neighbourhood|sector|town|city|village)$/.test(String(r.kind || r.level || '')));

export function placeRule(q, G) {
  const R = (G && Array.isArray(G.results)) ? G.results : null; if (!R || !R.length) return G;
  if (G.parsed && G.parsed.coordinates) return G;
  const explicit = UNIT_WORD.test(String(q || ''));
  const base = norm(String(q || '').replace(UNIT_WORD, ' ').split(',')[0]);
  const top = R[0];
  if (!isUnit(top)) { if (isSettlement(top)) { top.resolvedAs = 'settlement'; top.resolvedLabel = top.name; }
    for (const r of R) if (r !== top && isUnit(r)) { if (r.level === 'district' && !(r.standsAt && /tehsil named/.test(r.standsAt))) { const a = districtAnchor(r.district || r.name, r.province); if (a) { r.lat = a.lat; r.lon = a.lon; if (Number.isFinite(a.cellElevM)) r.elevM = a.cellElevM; r.standsAt = a.name; } } r.resolvedAs = r.level + ' main settlement'; r.resolvedLabel = r.name + ' ' + r.level + ' · main settlement ' + (r.standsAt || 'not named'); }
    G.resolution = top.resolvedAs || null; return G; }
  /* every district row standing at "the middle of its tehsils" stands at its main settlement instead, and every unit row says which point
     it stands at (a pick of any row, not only the first, gives the same point the resolve answer gives) */
  for (const r of R) { if (!isUnit(r)) continue;
    if (r.level === 'district' && !(r.standsAt && /tehsil named/.test(r.standsAt))) {
      const a = districtAnchor(r.district || r.name, r.province);
      if (a) { r.lat = a.lat; r.lon = a.lon; if (Number.isFinite(a.cellElevM)) r.elevM = a.cellElevM; r.standsAt = a.name; } }
    if (r !== top) { r.resolvedAs = r.level + ' main settlement'; r.resolvedLabel = r.name + ' ' + r.level + ' · main settlement ' + (r.standsAt || 'not named'); } }
  if (!explicit) {
    if (sameTown(top) || (top.standsAt && /tehsil named/.test(top.standsAt) && norm(top.name) === base)) {
      top.resolvedAs = 'settlement (the town of that name, which is also its ' + top.level + '’s main settlement)'; top.resolvedLabel = top.name;
    } else {
      const k = R.findIndex((r, i) => i > 0 && isSettlement(r) && norm(r.name) === norm(top.name) && Number.isFinite(r.lat));
      if (k > 0) { const s = R.splice(k, 1)[0]; s.resolvedAs = 'settlement (a town named "' + s.name + '"; the ' + top.level + ' of that name is the next result)'; s.resolvedLabel = s.name; R.unshift(s); }
      else { top.resolvedAs = top.level + ' main settlement (no town of that name)'; top.resolvedLabel = top.name + ' ' + top.level + ' · main settlement ' + (top.standsAt || 'not named'); }
    }
  } else {
    top.resolvedAs = top.level + ' main settlement'; top.resolvedLabel = top.name + ' ' + top.level + ' · main settlement ' + (top.standsAt || 'not named');
  }
  G.resolution = R[0].resolvedAs || null;
  return G;
}
