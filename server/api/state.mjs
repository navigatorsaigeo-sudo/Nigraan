/* ══ v91.17.60 · THE PHYSICAL STATE QUANTITIES FOR A POINT ═══════════════════════════════════════════════════════════
   One route, one served forecast (through this server's own /px, so the correction is on every temperature), and the
   established formulations of the formula book applied hour by hour:

     thermal   Liljegren WBGT, mean radiant temperature, UTCI            thermal.mjs (verified against ECMWF thermofeel)
     FDH       freezing degree-hours below an asset threshold τ:         Σ max(0, τ − T_served,t) · 1 h, over 72 h and 7 d
     wind      dynamic pressure q = ½ρV² with ρ from surface pressure,   V = 10 m gust in m/s; kPa. Screening: the load
               temperature and humidity (no 1.225 constant)             ratio needs the asset's C_d·A or design pressure
     snow      WITHHELD (v91.17.68): the model snow depth failed its own check (310 cm vs 36 cm observed, r −0.10) and
               is not an input anywhere in this build; a ground load from it was a fabricated number

   Every quantity carries its scientific status (formula book): Physical for the formulations, Screening for the class. */
import { thermalHour, utci as utciOf, FIXED_ALBEDO_BASIS, wbgtBand as wbgtBandOf } from './thermal.mjs';   /* v91.17.283.3 · C3: wbgtBand */

const RD = 287.058, RV = 461.495;
/* v91.17.68 · a missing pressure or humidity is a missing density, not ISA / 50 % (audit A1: the platform never fills an input) */
function airDensity(pHpa, tC, rhPct) {
  if (pHpa == null || tC == null || rhPct == null) return null;
  const tk = tC + 273.15; const es = 6.1121 * Math.exp((18.678 - tC / 234.5) * (tC / (257.14 + tC)));   /* Buck, hPa */
  const e = Math.max(0, Math.min(1, rhPct / 100)) * es; const pd = pHpa - e;
  return (pd * 100) / (RD * tk) + (e * 100) / (RV * tk);
}
const col = (H, k) => Array.isArray(H[k]) ? H[k] : [];   /* a variable the provider did not return is null per hour, not a TypeError (A13) */

export function createState(app) {
  const port = Number(process.env.PORT || 8787);
  async function forecast(lat, lon, elevM) {
    const q = new URLSearchParams({ __omhost: 'api.open-meteo.com', latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: 'UTC', forecast_days: '8',   /* v91.17.125 · 8 days so [now, now + 168 h) is covered */ wind_speed_unit: 'ms',
      hourly: 'temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m,wind_gusts_10m,surface_pressure,shortwave_radiation,direct_radiation,direct_normal_irradiance,cloud_cover,snow_depth,snowfall,precipitation' });
    if (elevM != null) q.set('elevation', String(Math.round(elevM)));
    const r = await fetch(`http://127.0.0.1:${port}/px/v1/forecast?` + q.toString(), { headers: { 'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': 'state' } });
    if (!r.ok) throw new Error('px ' + r.status);
    return r.json();
  }
  async function point({ lat, lon, elevM = null, tauC = 0, cdA = null, designPressureKpa = null }) {
    const j = await forecast(lat, lon, elevM); const H = j.hourly || {}; const T = H.time || []; const n = T.length;
    const corrected = !!(j.agn_bias_correction && j.agn_bias_correction.applied);
    const modelElev = j.elevation; const siteElev = elevM != null ? elevM : modelElev;
    const hours = [];
    /* v91.17.125 · external audit A04/A05 · every statistic has an explicit UTC window: next72h = [start, start + 72 h), 7 days =
       [start, start + 168 h), start = the current UTC hour; 'now' is the row at start, with its valid time. Before, maxima scanned all
       7 days while counts used the first 72 rows and 'now' was 00:00 UTC. Missing temperature is not 'no freezing': FDH counts the
       valid hours and is null when none are held, partial when some are missing. */
    const H1 = 3600e3, start = Math.floor(Date.now() / H1) * H1, end72 = start + 72 * H1, end7d = start + 168 * H1;
    let fdhValid72 = 0, fdhValid7d = 0, albBasis = null;
    let fdh72 = 0, fdh7d = 0, qMax = null, qMaxAt = null, wbgtMax = null, wbgtMaxAt = null, utciMax = null, utciMaxAt = null, utciMin = null, utciShMax = null, utciShMaxAt = null, swMax = null, gustMax = null, thermalMissing = 0;
    const cT = col(H, 'temperature_2m'), cRH = col(H, 'relative_humidity_2m'), cP = col(H, 'surface_pressure'), cW = col(H, 'wind_speed_10m'), cG = col(H, 'wind_gusts_10m'), cS = col(H, 'shortwave_radiation'), cD = col(H, 'direct_radiation'), cN = col(H, 'direct_normal_irradiance'), cC = col(H, 'cloud_cover'), cSn = col(H, 'snow_depth');
    for (let i = 0; i < n; i++) {
      const tC = cT[i] ?? null, rh = cRH[i] ?? null, p = cP[i] ?? null, w10 = cW[i] ?? null, g = cG[i] ?? null, ssrd = cS[i] ?? null, fdir = cD[i] ?? null, cloud = cC[i] ?? null;
      const ts = Date.parse(T[i] + 'Z');
      if (!(ts >= start) || !(ts < end7d)) continue;
      const in72 = ts < end72;
      /* v91.17.68 · every thermal input has to be present: a missing wind is not 1 m/s, missing radiation is not night, missing
         cloud is not clear (audit A1). The solar position is taken at the middle of the hour the provider's radiation means
         cover (H−1, H], not at the hour label (A7). */
      const thIn = (tC != null && rh != null && p != null && w10 != null && ssrd != null && fdir != null && cloud != null);
      if (!thIn && tC != null && rh != null) thermalMissing++;
      if (thIn) albBasis = FIXED_ALBEDO_BASIS;   /* v91.17.277 · measured albedo retired; Tmrt uses the fixed 0.20 */
      const th = thIn ? thermalHour({ tC, rhPct: rh, pressureHpa: p, wind10: w10, ssrd, fdir, dsrp: cN[i] ?? null, cloudFrac: cloud / 100, lat, lon, whenMs: ts - 1800e3 }) : null;
      const rho = airDensity(p, tC, rh); const qKpa = (rho != null && g != null) ? 0.5 * rho * g * g / 1000 : null;
      if (in72 && g != null && (gustMax == null || g > gustMax)) gustMax = g;
      /* v91.17.68 · the model snow depth was measured at 310 cm against 36 cm observed (correlation −0.10, index.mjs) and is
         dropped as an input everywhere else in this build; a ground load from it is not served as a number (A2) */
      const swe = null, qs = null;
      if (typeof tC === 'number' && Number.isFinite(tC)) { fdhValid7d++; if (in72) fdhValid72++; if (tC < tauC) { const d = tauC - tC; if (in72) fdh72 += d; fdh7d += d; } }
      if (in72 && qKpa != null && (qMax == null || qKpa > qMax)) { qMax = qKpa; qMaxAt = T[i]; }
      if (in72 && th && th.wbgt != null && (wbgtMax == null || th.wbgt > wbgtMax)) { wbgtMax = th.wbgt; wbgtMaxAt = T[i]; }
      if (in72 && th && th.utci != null) { if (utciMax == null || th.utci > utciMax) { utciMax = th.utci; utciMaxAt = T[i]; } if (utciMin == null || th.utci < utciMin) utciMin = th.utci; }
      /* v91.17.147 · audit H1 · UTCI IN SHADE (mean radiant temperature = air temperature), the quantity the heat level uses; the value above is
         in sun (the radiation budget). Both are served, each under its own name. */
      const uSh = (tC != null && rh != null && w10 != null) ? utciOf(tC, tC, w10, rh).utci : null;
      if (in72 && uSh != null && (utciShMax == null || uSh > utciShMax)) { utciShMax = uSh; utciShMaxAt = T[i]; }
      if (qs != null && (swMax == null || qs > swMax)) swMax = qs;
      if (in72) hours.push({ t: T[i], tC, rh, wind10: w10, gust: g, wbgt: th && th.wbgt, tg: th && th.tg, tnwb: th && th.tnwb, tmrt: th && th.tmrt, utci: th && th.utci, utciClass: th && th.utciClass, utciShade: (tC != null && rh != null && w10 != null) ? utciOf(tC, tC, w10, rh).utci : null, qKpa: qKpa == null ? null : Math.round(qKpa * 1000) / 1000, rho: rho == null ? null : Math.round(rho * 1000) / 1000, sweMm: swe == null ? null : Math.round(swe), snowLoadKpa: qs == null ? null : Math.round(qs * 1000) / 1000 });
    }
    const first = hours[0] || {};
    const hoursAbove = (th, key) => hours.filter(h => h[key] != null && h[key] >= th).length;
    return {
      at: T[0] || null, windowStartUtc: new Date(start).toISOString(), nowValidTime: first.t ? first.t + ':00Z' : null, lat, lon, siteElevM: siteElev, modelElevM: modelElev, elevationMismatchM: (elevM != null && modelElev != null) ? Math.round(modelElev - elevM) : null, correctedTemperature: corrected,
      thermal: { status: 'Physical', now: { wbgt: first.wbgt, wbgtBand: wbgtBandOf(first.wbgt), tg: first.tg, tnwb: first.tnwb, tmrt: first.tmrt, utci: first.utci, utciClass: first.utciClass },
        next72h: { wbgtMax, wbgtMaxAt, utciMax, utciMaxAt, utciMin, hoursWbgtGe28: hoursAbove(28, 'wbgt'), hoursWbgtGe31: hoursAbove(31, 'wbgt'), hoursUtciGe32: hoursAbove(32, 'utci'), hoursUtciGe38: hoursAbove(38, 'utci'),
          utciBasis: 'utciMax / hoursUtci*: in sun (radiation budget); utciShade*: in shade (mean radiant = air temperature), the heat level\'s quantity',
          utciShadeMax: utciShMax, utciShadeMaxAt: utciShMaxAt, hoursUtciShadeGe32: hoursAbove(32, 'utciShade'), hoursUtciShadeGe38: hoursAbove(38, 'utciShade') },
        method: 'WBGT: Liljegren et al. 2008 (globe and natural wet-bulb solved from their energy balances; 10 m wind scaled to 2 m by the Pasquill-Gifford profile). Tmrt: Di Napoli et al. 2020 / ERA5-HEAT from the provider shortwave (global, direct, DNI); longwave estimated (Prata 1996 emissivity, Crawford-Duchon cloud term), surface = air temperature, surface albedo fixed at 0.20 everywhere (the measured per-place, per-season albedo of v199 was retired in v91.17.277: no shipped grid holds it). UTCI: Bröde et al. 2012 polynomial on 2 m T, Tmrt, 10 m wind, vapour pressure. Ported from ECMWF thermofeel 2.3.0 and verified against it (max 0.05 °C, 2,000 cases).',
        albedo: albBasis,
        caveat: 'the wind is the model 10 m wind at grid scale; the radiation is modelled; WBGT is the environmental value only: ISO 7243 reference values depend on workload, acclimatisation and clothing (no rest schedule is derived); not a site assessment' },
      freezing: { status: fdhValid72 === 0 ? 'Unavailable' : (fdhValid72 < 72 || fdhValid7d < 168 ? 'Physical (partial)' : 'Physical'), tauC,
        fdh72: fdhValid72 ? Math.round(fdh72 * 10) / 10 : null, fdh7d: fdhValid7d ? Math.round(fdh7d * 10) / 10 : null,
        validHours72: fdhValid72, expectedHours72: 72, validHours7d: fdhValid7d, expectedHours7d: 168, partial: fdhValid72 < 72 || fdhValid7d < 168, hoursBelowTau72: hours.filter(h => h.tC != null && h.tC < tauC).length, method: 'FDH_τ = Σ max(0, τ − T_served,t) · Δt on the served, corrected temperature (MOS, elevation, all hours)', caveat: 'τ is the asset’s own threshold; 0 °C is a freeze-exposure default, not a design value' },
      wind: { status: 'Physical (q), Screening (class)', now: { gustMs: first.gust, rho: first.rho, qKpa: first.qKpa }, next72h: { qMaxKpa: qMax == null ? null : Math.round(qMax * 1000) / 1000, qMaxAt, gustMaxMs: gustMax, gustMaxWhy: gustMax == null ? 'no gust in the served hours' : null },
        loadRatio: (cdA != null && qMax != null) ? { demandKn: Math.round(qMax * cdA * 100) / 100, note: 'F = q·Cd·A with the caller’s Cd·A (m²); capacity is the asset’s, not held here' } : (designPressureKpa != null && qMax != null ? { ratio: Math.round(qMax / designPressureKpa * 100) / 100, note: 'q_max / design pressure supplied by the caller' } : null),
        method: 'q = ½ρV², ρ = P_d/(R_d T) + P_v/(R_v T) from the model surface pressure, temperature and humidity; V = 10 m gust', caveat: 'wind load screening, not a structural check: height, exposure, terrain, pressure coefficients and dynamic response belong to the applicable standard' },
      snow: { status: 'Withheld', now: { sweMm: null, groundLoadKpa: null }, next7d: { groundLoadMaxKpa: null }, method: 'q_s = 0.00980665 × SWE_mm would need a snow depth this build can defend; the model snow depth measured 310 cm against 36 cm observed at the check station (correlation −0.10) and is not used as an input anywhere in this build',
        why: 'Data not available: no defensible snow depth for this point. A ground snow load needs a measured or reanalysis-verified SWE; the provider grid value is withheld', modelSnowDepthGridM: cSn.length ? (cSn.slice(0, 72).filter(x => x != null).length ? Math.max(...cSn.slice(0, 72).filter(x => x != null)) : null) : null, modelSnowNote: 'the grid value is shown for reference only and is not a load' },
      hours, thermalHoursWithoutFullInputs: thermalMissing, source: 'served forecast through /px (corrected where a table or model applies), 7 days hourly'
    };
  }
  return { point };
}
