/* v91.17.128 · A-03 · ONE PSYCHROMETRIC MODULE for the server, identical to the page's (build/base agnSatVapPressHpa,
   agnPressureAtM, agnWetBulbPsychroC, wetBulbStullC). Before this, the server carried four Magnus constant sets
   (17.27/237.7, 17.62/243.12, 17.625/243.04, 17.67/243.5) and three copies of Stull's (2011) sea-level wet-bulb fit, applied
   at every height. Stull overstates the wet bulb above 1,500 m by 1.2-1.4 C (Gilgit 35 C/25 %: 20.8 vs 19.6; Skardu 32 C/30 %:
   19.9 vs 18.5), because the psychrometric balance depends on air pressure.

   Saturation vapour pressure: Bolton (1980), es = 6.112 exp(17.67 T / (T + 243.5)) hPa, valid -35..35 C to 0.3 %.
   Dew point and relative humidity are its exact inverse, so T -> RH -> Td -> RH returns the input.
   Pressure from height: ICAO standard atmosphere, p = 1013.25 (1 - 2.25577e-5 z)^5.25588 hPa.
   Wet bulb: solve es(Tw) - A p (T - Tw) = e by bisection, A = 6.6e-4 (1 + 0.00115 Tw) per C (the psychrometer constant for a
   ventilated thermometer). With no height or pressure the solution is taken at sea level (1013.25 hPa), the pressure
   Stull's fit was made for; Stull itself is no longer used. */
export const ES_A = 17.67, ES_B = 243.5, ES_0 = 6.112;
export const esatHpa = (t) => ES_0 * Math.exp(ES_A * t / (t + ES_B));
export const pressureAtM = (z) => (Number.isFinite(z) ? 1013.25 * Math.pow(1 - 2.25577e-5 * z, 5.25588) : null);

/* dew point from temperature and relative humidity (RH clamped 1-100 %, never above the air temperature) */
export function dewPointC(t, rh) {
  if (!Number.isFinite(t) || !Number.isFinite(rh) || rh <= 0) return null;
  const g = Math.log(Math.min(100, Math.max(1, rh)) / 100) + ES_A * t / (ES_B + t);
  return Math.min(t, ES_B * g / (ES_A - g));
}
/* relative humidity from temperature and dew point, 1-100 % */
export function rhFromDew(t, td) {
  if (!Number.isFinite(t) || !Number.isFinite(td)) return null;
  return Math.max(1, Math.min(100, 100 * esatHpa(Math.min(td, t)) / esatHpa(t)));
}
/* psychrometric wet bulb at pressure pHpa */
export function wetBulbPsychroC(T, RH, pHpa) {
  if (!Number.isFinite(T) || !Number.isFinite(RH) || !Number.isFinite(pHpa)) return null;
  if (!(pHpa > 0) || RH < 0 || RH > 100) return null;   /* v91.17.283.8 · audit 13 · input contract: pressure > 0 hPa, RH 0-100 % (else not assessed) */
  const e = (RH / 100) * esatHpa(T);
  let lo = Math.min(-40, T - 30), hi = T;   /* v91.17.147 · audit L3 · the bracket reaches below the air temperature at any T */
  for (let i = 0; i < 80; i++) { const Tw = (lo + hi) / 2, A = 6.6e-4 * (1 + 0.00115 * Tw); if (esatHpa(Tw) - A * pHpa * (T - Tw) - e > 0) hi = Tw; else lo = Tw; }
  return (lo + hi) / 2;
}
/* the wet-bulb entry point: opts.pressureHpa, else opts.elevationM, else sea level. Refuses non-physical inputs. */
export function wetBulbC(t, rh, opts) {
  if (!Number.isFinite(t) || !Number.isFinite(rh)) return null;
  if (rh < 0 || rh > 100 || t < -90 || t > 60) return null;
  let p = 1013.25;
  if (opts) { if (opts.pressureHpa != null) p = Number.isFinite(opts.pressureHpa) ? opts.pressureHpa : NaN; else if (Number.isFinite(opts.elevationM)) p = pressureAtM(opts.elevationM); }
  if (!(p > 0)) return null;
  if (rh >= 99.5) return t;   /* saturation: the wet bulb is the dry bulb at any (physical) pressure */   /* v91.17.283.8 · audit 13 · a pressure at or below 0 hPa (or a height above the standard atmosphere's top) is not physical: not assessed */
  return wetBulbPsychroC(t, Math.max(rh, 0.1), p);
}
export const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
