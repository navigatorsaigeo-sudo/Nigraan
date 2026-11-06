/* ══ v91.17.72 · UPWIND FIRE LOAD (one definition for the server and the validation script) ════════════════════════
   fires: [{ lat, lon, frp }] (already restricted to the window of observed days).
   wind: daily vector-mean 10 m wind at the tehsil, direction it blows FROM (deg) and speed (m/s).
   P (data/fires-config.json params): radiusKm, conePower, decayKm, calmMs, isotropicWeight, localKm, countConeDeg.
   weight = dirTerm × exp(-d / decayKm) for d ≤ radiusKm, dirTerm = max(0, cos(Δ))^conePower with Δ the angle between
   the bearing tehsil→fire and the wind-from direction (isotropicWeight when the wind is calm or unknown); a fire
   within localKm counts with dirTerm 1. upwind = count of fires with d ≤ radiusKm and Δ ≤ countConeDeg (or local).
   A plume proxy, not a dispersion model [inference]. */
const R = 6371, rad = Math.PI / 180;
export function kmBearing(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * rad, p2 = lat2 * rad, dl = (lon2 - lon1) * rad;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const d = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  const b = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / rad;
  return [d, (b + 360) % 360];
}
export function fireLoadAt(lat, lon, windFromDeg, windMs, fires, P) {
  const calm = windFromDeg == null || windMs == null || !(windMs >= P.calmMs);
  const dLat = P.radiusKm / 111, dLon = P.radiusKm / (111 * Math.max(0.2, Math.cos(lat * rad)));
  let load = 0, frpLoad = 0, upwind = 0, within = 0, local = 0; const bySector = {};
  for (const f of fires) {
    if (Math.abs(f.lat - lat) > dLat || Math.abs(f.lon - lon) > dLon) continue;
    const [d, b] = kmBearing(lat, lon, f.lat, f.lon); if (d > P.radiusKm) continue;
    within++;
    let dir, inCone;
    if (d <= P.localKm) { dir = 1; inCone = true; local++; }
    else if (calm) { dir = P.isotropicWeight; inCone = false; }
    else { const D = Math.abs(((b - windFromDeg + 540) % 360) - 180); dir = D >= 90 ? 0 : Math.cos(D * rad) ** P.conePower; inCone = D <= P.countConeDeg; }
    const w = dir * Math.exp(-d / P.decayKm);
    load += w; frpLoad += w * (f.frp || 0); if (inCone) upwind++; if (f.sector && w > 0) bySector[f.sector] = (bySector[f.sector] || 0) + w;
  }
  return { load: Math.round(load * 10) / 10, frpLoad: Math.round(frpLoad), upwind, within, local, calm, bySector };
}
/* daily vector mean of hourly 10 m wind (speed km/h as the provider returns it, direction FROM in degrees) */
export function vectorWind(speedsKmh, dirsDeg) {
  let u = 0, v = 0, s = 0, n = 0;
  for (let i = 0; i < speedsKmh.length; i++) { const w = speedsKmh[i], d = dirsDeg[i]; if (w == null || d == null) continue; const ms = w / 3.6; u += ms * Math.sin(d * rad); v += ms * Math.cos(d * rad); s += ms; n++; }
  if (!n) return { fromDeg: null, ms: null, scalarMs: null };
  u /= n; v /= n; const ms = Math.hypot(u, v);
  return { fromDeg: ms > 0 ? Math.round(((Math.atan2(u, v) / rad) + 360) % 360) : null, ms: Math.round(ms * 10) / 10, scalarMs: Math.round(s / n * 10) / 10 };
}
export function loadClass(load, C) { const m = C.loadMin; let k = 0; for (let i = 0; i < m.length; i++) if (load >= m[i]) k = i; return k; }
