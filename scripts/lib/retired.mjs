/* v91.17.283.19 · the place routes retired in v283.19 and the part of the place bundle (GET /api/point) that answers each now.
   For the older test suites that read one of those routes: retiredMap(path) gives the bundle request of the same point and the part
   to read; partOf(bundle, part) the value in the route's old place. Parameters other than the point (trigger=, km=, elev=, radius=,
   floor=, tau=) are not part of a bundle and are dropped: the part answers the place as every page now shows it. */
export const RETIRED = { '/api/glof/upstream': 'glof', '/api/climatology/baseline': 'climatology', '/api/pool/hazard': 'poolHazard',
  '/api/site/screening': 'siteScreening', '/api/site/risk': 'siteRisk', '/api/fleet/nearest': 'station', '/api/hyperlocal/area': 'near',
  '/api/pointstate/near': 'near', '/api/place/facts': 'facts', '/api/report/pointrun': 'pointrun', '/api/flood/riverlink': 'river', '/api/ai/local': 'aiLocal',
  '/api/point/forecast': '', '/api/pointstate': '', '/api/hyperlocal/point': '' };
export function retiredMap(p) {
  const u = new URL(p, 'http://x'); const part = RETIRED[u.pathname]; if (part == null) return null;
  const la = u.searchParams.get('lat') || u.searchParams.get('latitude'), lo = u.searchParams.get('lon') || u.searchParams.get('longitude');
  if (la == null || lo == null) return null;
  return { path: '/api/point?lat=' + la + '&lon=' + lo, part };
}
export function partOf(B, part) {
  if (!part) return B;   /* the point forecast / point state: the bundle itself (it carries now, hours, days, point, area) */
  if (!B || !B.parts) return B && B.ok === false ? B : null;
  if (part === 'station') { const s = B.station; return { station: s && s.ok ? { name: s.name, key: s.id, no: s.no, km: s.km, ageMin: s.ageMin, status: s.status, tempC: s.reading ? s.reading.tempC : null, rh: s.reading ? s.reading.rh : null } : null, why: s && !s.ok ? s.why : undefined }; }
  const x = B.parts[part]; return x ? (x.v != null ? x.v : { ok: false, why: x.why }) : null;
}
/* wrap a suite's own get(path, ...) helper whose answer is { status, json, text } */
export const viaBundle = (get) => async (p, ...a) => { const m = retiredMap(p); if (!m) return get(p, ...a); const r = await get(m.path, ...a); const v = partOf(r && r.json, m.part); return { ...r, json: v, text: JSON.stringify(v) }; };
