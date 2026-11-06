/* NIGRAAN v91.17.269 · B1 item 3 · JS port of sunterrain.py (nig/ds2/sunterrain.mjs; v91.17.270: copied here for tdown.mjs, read only by it).
   Same algorithms and conventions, per point (the server answers points):
   - solarPosition(tUnixS, lat, lon): NOAA GML solar calculator (gml.noaa.gov/grad/solcalc main.js; Meeus 1991), refraction
     included in `elevation`, azimuth clockwise from north
   - cosIncidence(cosz, azDeg, slopeRad, east, north): Duffie & Beckman eq. 1.6.3 with mean eastness / northness
   - horizonAt(hz16, azDeg): the 16 hz_* bands (deg, azimuth 0, 22.5 ... 337.5) linearly interpolated, circular
   - skyView(hz16, slopeRad, east, north, nsub): Dozier & Frew (1990) isotropic sky-view factor limited by the cell's own plane,
     and svfFlat = 1 - mean(sin gamma) (Zaksek et al. 2011)
   - hourlyFactors(tEndUnixS, lat, lon, slopeRad, east, north, hz16, nsub): hour ending at tEnd (Open-Meteo radiation is the
     past-hour mean): rb, sunlit, coszMean
   - slopeIrradiance(B, D, rb, vd, albedo) = B rb + D vd + albedo (B + D)(1 - vd)
   Tests: tests/sunterrain.test.mjs (NOAA vectors and the Python implementation's vectors). */
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

export function sunTerms(T) {
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * D2R;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C, trueAnom = M + C;
  const R = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(trueAnom * D2R));
  const omega = 125.04 - 1934.136 * T;
  const lam = trueLong - 0.00569 - 0.00478 * Math.sin(omega * D2R);
  const sec = 21.448 - T * (46.8150 + T * (0.00059 - T * 0.001813));
  const eps = 23 + (26 + sec / 60) / 60 + 0.00256 * Math.cos(omega * D2R);
  const decl = Math.asin(Math.sin(eps * D2R) * Math.sin(lam * D2R)) * R2D;
  const y = Math.tan(eps * D2R / 2) ** 2, L0r = L0 * D2R;
  const Et = y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr);
  return { decl, eqtime: Et * R2D * 4, rAu: R };
}

export function refractionDeg(h) {
  if (h > 85) return 0;
  const te = Math.tan(h * D2R);
  const c = h > 5 ? 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5 : h > -0.575 ? 1735 + h * (-518.2 + h * (103.4 + h * (-12.79 + h * 0.711))) : -20.774 / te;
  return c / 3600;
}

export function solarPosition(tUnixS, lat, lon) {
  const T = (tUnixS / 86400 + 2440587.5 - 2451545) / 36525;
  const { decl, eqtime, rAu } = sunTerms(T);
  const minutes = ((tUnixS % 86400) + 86400) % 86400 / 60;
  const tst = (((minutes + eqtime + 4 * lon) % 1440) + 1440) % 1440;
  const ha = tst / 4 - 180;
  const la = lat * D2R, de = decl * D2R;
  const csz = Math.min(1, Math.max(-1, Math.sin(la) * Math.sin(de) + Math.cos(la) * Math.cos(de) * Math.cos(ha * D2R)));
  const zen = Math.acos(csz) * R2D;
  const den = Math.cos(la) * Math.sin(zen * D2R);
  let az;
  if (Math.abs(den) > 0.001) {
    const azr = Math.min(1, Math.max(-1, (Math.sin(la) * Math.cos(zen * D2R) - Math.sin(de)) / den));
    az = 180 - Math.acos(azr) * R2D; if (ha > 0) az = -az;
  } else az = lat > 0 ? 180 : 0;
  az = ((az % 360) + 360) % 360;
  const el = 90 - zen;
  return { zenith: zen, elevation: el + refractionDeg(el), azimuth: az, cosz: csz, decl, eqtime, rAu };
}

export function cosIncidence(cosz, azDeg, slopeRad, east, north) {
  const sinz = Math.sqrt(Math.max(0, 1 - cosz * cosz)), a = azDeg * D2R;
  return cosz * Math.cos(slopeRad) + sinz * Math.sin(slopeRad) * (Math.sin(a) * east + Math.cos(a) * north);
}

export function horizonAt(hz16, azDeg) {
  const x = (((azDeg % 360) + 360) % 360) / 22.5, i0 = Math.floor(x) % 16, i1 = (i0 + 1) % 16, f = x - Math.floor(x);
  const g = (v) => (v == null || Number.isNaN(v) ? 0 : v);
  return g(hz16[i0]) * (1 - f) + g(hz16[i1]) * f;
}

export function skyView(hz16, slopeRad = 0, east = 0, north = 0, nsub = 8) {
  const n = 16 * nsub; let acc = 0, sv = 0;
  for (let k = 0; k < n; k++) {
    const phi = k * 360 / n, p = phi * D2R;
    const g = horizonAt(hz16, phi);
    const gp = -Math.atan(Math.tan(slopeRad) * (Math.sin(p) * east + Math.cos(p) * north)) * R2D;
    const H = Math.PI / 2 - Math.max(g, gp) * D2R;
    acc += Math.cos(slopeRad) * Math.sin(H) ** 2 + Math.sin(slopeRad) * (Math.sin(p) * east + Math.cos(p) * north) * (H - Math.sin(H) * Math.cos(H));
  }
  for (let i = 0; i < 16; i++) { const v = hz16[i]; sv += Math.sin(Math.max(0, v == null || Number.isNaN(v) ? 0 : v) * D2R); }
  return { vd: Math.min(1, Math.max(0, acc / n)), svfFlat: 1 - sv / 16 };
}

export function hourlyFactors(tEndUnixS, lat, lon, slopeRad, east, north, hz16, nsub = 12) {
  let num = 0, den = 0, lit = 0;
  for (let k = 0; k < nsub; k++) {
    const tk = tEndUnixS - 3600 + (k + 0.5) * 3600 / nsub;
    const sp = solarPosition(tk, lat, lon);
    const ci = cosIncidence(sp.cosz, sp.azimuth, slopeRad, east, north);
    const vis = sp.elevation > horizonAt(hz16, sp.azimuth) && sp.elevation > 0 && ci > 0;
    if (vis) { num += ci; lit++; }
    den += Math.max(0, sp.cosz);
  }
  return { rb: den > 1e-6 ? num / den : 0, sunlit: lit / nsub, coszMean: den / nsub };
}

export const slopeIrradiance = (B, D, rb, vd, albedo) => B * rb + D * vd + albedo * (B + D) * (1 - vd);
