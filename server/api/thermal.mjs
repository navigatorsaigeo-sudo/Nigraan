import { utciClass as utciClassOne } from './utci.mjs';
/* ══ v91.17.60 · THERMAL: LILJEGREN WBGT, MEAN RADIANT TEMPERATURE, UTCI ═══════════════════════════════════════
   Established formulations only, ported from ECMWF thermofeel 2.3.0 (Apache-2.0) and verified against it in
   scripts/thermal-verify.mjs (max |diff| < 0.05 °C over 2,000 random cases). This file is pure functions with no
   imports; build.sh inlines the same source into the client so the card and the server agree to the digit.

   WBGT   Liljegren et al. (2008): globe and natural wet-bulb temperatures solved from their energy balances by fixed-point
          iteration; WBGT = 0.7·Tnwb + 0.2·Tg + 0.1·Ta. Inputs: 2 m T (°C), RH (%), surface pressure (hPa), 10 m wind
          (m/s, scaled to 2 m with the Pasquill-Gifford profile), downward shortwave (W/m²), direct-beam fraction, cos(zenith).
          Replaces the v91.17.x shortcut 0.7·Twb(psychrometric) + 0.3·Tmax + solar term, which had no globe temperature.
   Tmrt   Di Napoli et al. (2020), the ERA5-HEAT method, from the radiation budget. The provider gives shortwave (global,
          direct, diffuse, DNI) but no longwave, so the two longwave terms are ESTIMATED: sky emissivity by Prata (1996)
          with the Crawford & Duchon (1999) cloud correction, surface temperature taken as air temperature, surface albedo
          0.20 for the reflected shortwave. The card must say "Tmrt basis: modelled shortwave, estimated longwave".
   UTCI   Bröde et al. (2012) 6th-order polynomial (211 terms, generated from the reference source). Inputs 2 m T, Tmrt,
          10 m wind (NOT 2 m), vapour pressure. Valid −50…+50 °C, wind 0.5…17 m/s, Tmrt −30…+70 K from Ta, e ≤ 50 hPa;
          the result carries a flag when an input is outside that box. Categories: the official UTCI stress scale. */

const STEFANB = 5.6696e-8, CP = 1003.5, M_AIR = 28.97, M_H2O = 18.015, R_GAS = 8314.34;
const R_AIR = R_GAS / M_AIR, PR = CP / (CP + 1.25 * R_AIR), RATIO = CP * M_AIR / M_H2O;
const EMIS_WICK = 0.95, ALB_WICK = 0.4, D_WICK = 0.007, L_WICK = 0.0254, EMIS_GLOBE = 0.95, ALB_GLOBE = 0.05, D_GLOBE = 0.0508;
const EMIS_SFC = 0.999, ALB_SFC = 0.45, CZA_MIN = 0.00873, MIN_SPEED = 0.13, CONVERGENCE = 0.02, MAX_ITER = 500, MIN_WIND_10M = 0.62;
const LSRDT = [[1, 1, 2, 4, 0, 5, 6, 0], [1, 2, 3, 4, 0, 5, 6, 0], [2, 2, 3, 4, 0, 4, 4, 0], [3, 3, 4, 4, 0, 0, 0, 0], [3, 4, 4, 4, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]];
const URBAN_EXP = [0.15, 0.15, 0.20, 0.25, 0.30, 0.30];

const esat = (tk) => { const y = (tk - 273.15) / (tk - 32.18); return 1.004 * 6.1121 * Math.exp(17.502 * y); };           /* hPa, Buck 1981 */
const dewPoint = (e) => { const z = Math.log(e / (6.1121 * 1.004)); return 273.15 + 240.97 * z / (17.502 - z); };
const viscosity = (tk) => { const tr = tk / 97.0, omega = (tr - 2.9) / 0.4 * (-0.034) + 1.048; return 2.6693e-6 * Math.sqrt(M_AIR * tk) / (3.617 * 3.617 * omega); };
const thermalCond = (tk) => (CP + 1.25 * R_AIR) * viscosity(tk);
function diffusivity(tk, pair) {
  const pcrit13 = Math.pow(36.4 * 218.0, 1 / 3), tcrit512 = Math.pow(132.0 * 647.3, 5 / 12), tcrit12 = Math.sqrt(132.0 * 647.3), mmix = Math.sqrt(1 / M_AIR + 1 / M_H2O);
  return 3.640e-4 * Math.pow(tk / tcrit12, 2.334) * pcrit13 * tcrit512 * mmix / (pair / 1013.25) * 1e-4;
}
const evap = (tk) => (313.15 - tk) / 30.0 * (-71100.0) + 2.4073e6;
const emisAtm = (tk, rhFrac) => 0.575 * Math.pow(rhFrac * esat(tk), 0.143);
function hSphere(tk, pair, speed) { const density = pair * 100 / (R_AIR * tk); const re = Math.max(speed, MIN_SPEED) * density * D_GLOBE / viscosity(tk); const nu = 2 + 0.6 * Math.sqrt(re) * Math.pow(PR, 0.3333); return nu * thermalCond(tk) / D_GLOBE; }
function hCylinder(tk, pair, speed) { const density = pair * 100 / (R_AIR * tk); const re = Math.max(speed, MIN_SPEED) * density * D_WICK / viscosity(tk); const nu = 0.281 * Math.pow(re, 1 - 0.4) * Math.pow(PR, 1 - 0.56); return nu * thermalCond(tk) / D_WICK; }

function solveGlobe(ta, rhFrac, pair, speed, solar, fdir, cza) {
  const tsfc = ta, emis = emisAtm(ta, rhFrac), czaSafe = cza > CZA_MIN ? cza : 1.0, beam = fdir > 0 ? fdir * (1 / (2 * czaSafe) - 1) : 0;
  let tgPrev = ta;
  for (let i = 0; i < MAX_ITER; i++) {
    const tref = 0.5 * (tgPrev + ta), h = hSphere(tref, pair, speed);
    const tgNew = Math.pow(0.5 * (emis * ta ** 4 + EMIS_SFC * tsfc ** 4) - h / (STEFANB * EMIS_GLOBE) * (tgPrev - ta) + solar / (2 * STEFANB * EMIS_GLOBE) * (1 - ALB_GLOBE) * (beam + 1 + ALB_SFC), 0.25);
    if (Math.abs(tgNew - tgPrev) < CONVERGENCE) return tgNew - 273.15;
    tgPrev = 0.9 * tgPrev + 0.1 * tgNew;
  }
  return NaN;
}
function solveWetbulb(ta, rhFrac, pair, speed, solar, fdir, cza, rad) {
  const tsfc = ta, czaSafe = cza > CZA_MIN ? cza : 1.0, sza = Math.acos(Math.max(-1, Math.min(1, czaSafe))), emis = emisAtm(ta, rhFrac), eair = rhFrac * esat(ta);
  let twPrev = dewPoint(eair);
  for (let i = 0; i < MAX_ITER; i++) {
    const tref = 0.5 * (twPrev + ta), h = hCylinder(tref, pair, speed);
    const fatm = STEFANB * EMIS_WICK * (0.5 * (emis * ta ** 4 + EMIS_SFC * tsfc ** 4) - twPrev ** 4) + (1 - ALB_WICK) * solar * ((1 - fdir) * (1 + 0.25 * D_WICK / L_WICK) + fdir * ((Math.tan(sza) / Math.PI) + 0.25 * D_WICK / L_WICK) + ALB_SFC);
    const ewick = esat(twPrev), density = pair * 100 / (R_AIR * tref), sc = viscosity(tref) / (density * diffusivity(tref, pair));
    const twNew = ta - evap(tref) / RATIO * (ewick - eair) / (pair - ewick) * Math.pow(PR / sc, 0.56) + (fatm / h) * rad;
    if (Math.abs(twNew - twPrev) < CONVERGENCE) return twNew - 273.15;
    twPrev = 0.9 * twPrev + 0.1 * twNew;
  }
  return NaN;
}
/* 10 m → 2 m wind, Pasquill-Gifford stability from solar elevation, radiation and wind (Liljegren 2008; Kong & Huber 2022) */
function windSpeed2m(va, cossza, ssrd) {
  const daytime = cossza > 0;
  const col = daytime ? (ssrd >= 925 ? 0 : ssrd >= 675 ? 1 : ssrd >= 175 ? 2 : 3) : 5;
  const row = daytime ? (va >= 6 ? 4 : va >= 5 ? 3 : va >= 3 ? 2 : va >= 2 ? 1 : 0) : (va >= 2.5 ? 2 : va >= 2 ? 1 : 0);
  const cls = LSRDT[row][col]; const exponent = URBAN_EXP[Math.max(0, cls - 1)];
  return Math.max(va * Math.pow(2 / 10, exponent), MIN_SPEED);
}
/* Liljegren WBGT (°C). tC 2 m temperature, rhPct, pressureHpa surface pressure, wind10 m/s at 10 m, ssrd W/m² downward
   shortwave, fdirFrac direct-beam fraction of ssrd (0-1), cossza cos(solar zenith). Returns { wbgt, tg, tnwb, speed2m } or nulls. */
function wbgtLiljegren(tC, rhPct, pressureHpa, wind10, ssrd, fdirFrac, cossza) {
  if ([tC, rhPct, pressureHpa, wind10, ssrd, fdirFrac, cossza].some(v => v == null || !Number.isFinite(v))) return { wbgt: null, tg: null, tnwb: null, speed2m: null };
  const va = Math.max(wind10, MIN_WIND_10M), speed = windSpeed2m(va, cossza, ssrd);
  let fdir = Math.max(0, Math.min(0.9, fdirFrac)); if (cossza < CZA_MIN) fdir = 0;
  const tk = tC + 273.15, rhFrac = Math.max(0.005, Math.min(1, rhPct / 100));
  const tg = solveGlobe(tk, rhFrac, pressureHpa, speed, Math.max(0, ssrd), fdir, cossza);
  const tnwb = solveWetbulb(tk, rhFrac, pressureHpa, speed, Math.max(0, ssrd), fdir, cossza, 1.0);
  if (!Number.isFinite(tg) || !Number.isFinite(tnwb)) return { wbgt: null, tg: null, tnwb: null, speed2m: speed };
  return { wbgt: Math.round((0.1 * tC + 0.2 * tg + 0.7 * tnwb) * 10) / 10, tg: Math.round(tg * 10) / 10, tnwb: Math.round(tnwb * 10) / 10, speed2m: Math.round(speed * 100) / 100 };
}

/* cos(solar zenith angle) at a UTC instant; NOAA solar position (low-precision, ±0.01 in cossza) */
function cosSolarZenith(lat, lon, whenMs) {
  const d = new Date(whenMs); const doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1;
  const hourUtc = d.getUTCHours() + d.getUTCMinutes() / 60;
  const g = 2 * Math.PI / 365 * (doy - 1 + (hourUtc - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const tst = (hourUtc * 60 + eqt + 4 * lon) % 1440; const ha = ((tst / 4) - 180) * Math.PI / 180; const phi = lat * Math.PI / 180;
  return Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
}
/* downward longwave (W/m²) estimated from T, RH and cloud: Prata (1996) clear-sky emissivity, Crawford & Duchon (1999) cloud term */
function longwaveDown(tC, rhPct, cloudFrac) {
  const tk = tC + 273.15, e = Math.max(0.05, rhPct / 100) * esat(tk); const w = 46.5 * e / tk;
  const epsClear = 1 - (1 + w) * Math.exp(-Math.sqrt(1.2 + 3 * w)); const c = Math.max(0, Math.min(1, cloudFrac || 0));
  const eps = Math.min(1, epsClear * (1 - c) + c);   /* Crawford-Duchon: clouds radiate as a black body at air temperature */
  return eps * STEFANB * tk ** 4;
}
/* Mean radiant temperature (°C), Di Napoli et al. 2020 / ERA5-HEAT. ssrd global shortwave, fdir direct on the horizontal,
   dsrp direct normal (DNI); when dsrp is null it is approximated as fdir / cossza (cossza > 0.1). albedo: surface shortwave albedo. */
function meanRadiantTemperature(tC, rhPct, cloudFrac, ssrd, fdir, dsrp, cossza, albedo = 0.20) {
  if ([tC, rhPct, ssrd, fdir, cossza].some(v => v == null || !Number.isFinite(v))) return { tmrt: null };
  const strd = longwaveDown(tC, rhPct, cloudFrac), tk = tC + 273.15, lur = EMIS_SFC * STEFANB * tk ** 4;   /* surface upward longwave, T_sfc = T_air */
  const ssr = ssrd * (1 - albedo), rsw = ssrd - ssr, dsw = Math.max(0, ssrd - fdir);
  const dsrpV = dsrp != null && Number.isFinite(dsrp) ? dsrp : (cossza > 0.1 ? fdir / cossza : fdir);
  const gamma = Math.asin(Math.max(-1, Math.min(1, cossza))) * 180 / Math.PI;   /* solar elevation, degrees */
  const fp = 0.308 * Math.cos(Math.PI / 180 * gamma * (0.998 - gamma * gamma / 50000));
  const mrtK = Math.pow((1 / 0.0000000567) * (0.5 * strd + 0.5 * lur + (0.7 / 0.97) * (0.5 * dsw + 0.5 * rsw + fp * (cossza > 0 ? dsrpV : 0))), 0.25);
  return { tmrt: Math.round((mrtK - 273.15) * 10) / 10, strd: Math.round(strd), lur: Math.round(lur), basis: 'modelled shortwave (global, direct, DNI) from the provider; longwave estimated (Prata 1996 clear-sky emissivity, Crawford-Duchon cloud term); surface temperature taken as air temperature; albedo ' + albedo };
}

/* generated from thermofeel 2.3.0 calculate_utci_polynomial (ECMWF, Apache-2.0); Bröde et al. 2012 */
function utciPolynomial(t2m, mrt, va, wvp) {
  const e_mrt=mrt-t2m;
  const t2m2=t2m*t2m;
  const t2m3=t2m2*t2m;
  const t2m4=t2m3*t2m;
  const t2m5=t2m4*t2m;
  const t2m6=t2m5*t2m;
  const va2=va*va;
  const va3=va2*va;
  const va4=va3*va;
  const va5=va4*va;
  const va6=va5*va;
  const e_mrt2=e_mrt*e_mrt;
  const e_mrt3=e_mrt2*e_mrt;
  const e_mrt4=e_mrt3*e_mrt;
  const e_mrt5=e_mrt4*e_mrt;
  const e_mrt6=e_mrt5*e_mrt;
  const wvp2=wvp*wvp;
  const wvp3=wvp2*wvp;
  const wvp4=wvp3*wvp;
  const wvp5=wvp4*wvp;
  const wvp6=wvp5*wvp;
  const varh2=va*wvp2;
  const va2_rh=va2*wvp;
  const va2_e_mrt=va2*e_mrt;
  const e_mrt_rh=e_mrt*wvp;
  const e_mrt_rh2=e_mrt*wvp2;
  const e_mrt2_rh=e_mrt2*wvp;
  const e_mrt2_rh2=e_mrt2*wvp2;
  const e_mrt_rh3=e_mrt*wvp3;
  const va_e_mrt=va*e_mrt;
  const va_e_mrt2=va*e_mrt2;
  const va_rh=va*wvp;
  const t2m_va=t2m*va;
  const e_mrt3_rh=e_mrt3*wvp;
  const e_mrt4_rh=e_mrt4*wvp;
  const utci = (
t2m
        + 6.07562052e-01
        + -2.27712343e-02 * t2m
        + 8.06470249e-04 * t2m2
        + -1.54271372e-04 * t2m3
        + -3.24651735e-06 * t2m4
        + 7.32602852e-08 * t2m5
        + 1.35959073e-09 * t2m6
        + -2.25836520e00 * va
        + 8.80326035e-02 * t2m * va
        + 2.16844454e-03 * t2m2 * va
        + -1.53347087e-05 * t2m3 * va
        + -5.72983704e-07 * t2m4 * va
        + -2.55090145e-09 * t2m5 * va
        + -7.51269505e-01 * va2
        + -4.08350271e-03 * t2m * va2
        + -5.21670675e-05 * t2m2 * va2
        + 1.94544667e-06 * t2m3 * va2
        + 1.14099531e-08 * t2m4 * va2
        + 1.58137256e-01 * va3
        + -6.57263143e-05 * t2m * va3
        + 2.22697524e-07 * t2m2 * va3
        + -4.16117031e-08 * t2m3 * va3
        + -1.27762753e-02 * va4
        + 9.66891875e-06 * t2m * va4
        + 2.52785852e-09 * t2m2 * va4
        + 4.56306672e-04 * va5
        + -1.74202546e-07 * t2m * va5
        + -5.91491269e-06 * va6
        + 3.98374029e-01 * e_mrt
        + 1.83945314e-04 * t2m * e_mrt
        + -1.73754510e-04 * t2m2 * e_mrt
        + -7.60781159e-07 * t2m3 * e_mrt
        + 3.77830287e-08 * t2m4 * e_mrt
        + 5.43079673e-10 * t2m5 * e_mrt
        + -2.00518269e-02 * va_e_mrt
        + 8.92859837e-04 * t2m * va_e_mrt
        + 3.45433048e-06 * t2m2 * va_e_mrt
        + -3.77925774e-07 * t2m3 * va_e_mrt
        + -1.69699377e-09 * t2m4 * va_e_mrt
        + 1.69992415e-04 * va2_e_mrt
        + -4.99204314e-05 * t2m * va2_e_mrt
        + 2.47417178e-07 * t2m2 * va2_e_mrt
        + 1.07596466e-08 * t2m3 * va2_e_mrt
        + 8.49242932e-05 * va3 * e_mrt
        + 1.35191328e-06 * t2m * va3 * e_mrt
        + -6.21531254e-09 * t2m2 * va3 * e_mrt
        + -4.99410301e-06 * va4 * e_mrt
        + -1.89489258e-08 * t2m * va4 * e_mrt
        + 8.15300114e-08 * va5 * e_mrt
        + 7.55043090e-04 * e_mrt2
        + -5.65095215e-05 * t2m * e_mrt2
        + -4.52166564e-07 * t2m2 * e_mrt2
        + 2.46688878e-08 * t2m3 * e_mrt2
        + 2.42674348e-10 * t2m4 * e_mrt2
        + 1.54547250e-04 * va_e_mrt2
        + 5.24110970e-06 * t2m * va_e_mrt2
        + -8.75874982e-08 * t2m2 * va_e_mrt2
        + -1.50743064e-09 * t2m3 * va_e_mrt2
        + -1.56236307e-05 * va2 * e_mrt2
        + -1.33895614e-07 * t2m * va2 * e_mrt2
        + 2.49709824e-09 * t2m2 * va2 * e_mrt2
        + 6.51711721e-07 * va3 * e_mrt2
        + 1.94960053e-09 * t2m * va3 * e_mrt2
        + -1.00361113e-08 * va4 * e_mrt2
        + -1.21206673e-05 * e_mrt3
        + -2.18203660e-07 * t2m * e_mrt3
        + 7.51269482e-09 * t2m2 * e_mrt3
        + 9.79063848e-11 * t2m3 * e_mrt3
        + 1.25006734e-06 * va * e_mrt3
        + -1.81584736e-09 * t2m_va * e_mrt3
        + -3.52197671e-10 * t2m2 * va * e_mrt3
        + -3.36514630e-08 * va2 * e_mrt3
        + 1.35908359e-10 * t2m * va2 * e_mrt3
        + 4.17032620e-10 * va3 * e_mrt3
        + -1.30369025e-09 * e_mrt4
        + 4.13908461e-10 * t2m * e_mrt4
        + 9.22652254e-12 * t2m2 * e_mrt4
        + -5.08220384e-09 * va * e_mrt4
        + -2.24730961e-11 * t2m_va * e_mrt4
        + 1.17139133e-10 * va2 * e_mrt4
        + 6.62154879e-10 * e_mrt5
        + 4.03863260e-13 * t2m * e_mrt5
        + 1.95087203e-12 * va * e_mrt5
        + -4.73602469e-12 * e_mrt6
        + 5.12733497e00 * wvp
        + -3.12788561e-01 * t2m * wvp
        + -1.96701861e-02 * t2m2 * wvp
        + 9.99690870e-04 * t2m3 * wvp
        + 9.51738512e-06 * t2m4 * wvp
        + -4.66426341e-07 * t2m5 * wvp
        + 5.48050612e-01 * va_rh
        + -3.30552823e-03 * t2m * va_rh
        + -1.64119440e-03 * t2m2 * va_rh
        + -5.16670694e-06 * t2m3 * va_rh
        + 9.52692432e-07 * t2m4 * va_rh
        + -4.29223622e-02 * va2_rh
        + 5.00845667e-03 * t2m * va2_rh
        + 1.00601257e-06 * t2m2 * va2_rh
        + -1.81748644e-06 * t2m3 * va2_rh
        + -1.25813502e-03 * va3 * wvp
        + -1.79330391e-04 * t2m * va3 * wvp
        + 2.34994441e-06 * t2m2 * va3 * wvp
        + 1.29735808e-04 * va4 * wvp
        + 1.29064870e-06 * t2m * va4 * wvp
        + -2.28558686e-06 * va5 * wvp
        + -3.69476348e-02 * e_mrt_rh
        + 1.62325322e-03 * t2m * e_mrt_rh
        + -3.14279680e-05 * t2m2 * e_mrt_rh
        + 2.59835559e-06 * t2m3 * e_mrt_rh
        + -4.77136523e-08 * t2m4 * e_mrt_rh
        + 8.64203390e-03 * va * e_mrt_rh
        + -6.87405181e-04 * t2m_va * e_mrt_rh
        + -9.13863872e-06 * t2m2 * va * e_mrt_rh
        + 5.15916806e-07 * t2m3 * va * e_mrt_rh
        + -3.59217476e-05 * va2 * e_mrt_rh
        + 3.28696511e-05 * t2m * va2 * e_mrt_rh
        + -7.10542454e-07 * t2m2 * va2 * e_mrt_rh
        + -1.24382300e-05 * va3 * e_mrt_rh
        + -7.38584400e-09 * t2m * va3 * e_mrt_rh
        + 2.20609296e-07 * va4 * e_mrt_rh
        + -7.32469180e-04 * e_mrt2_rh
        + -1.87381964e-05 * t2m * e_mrt2_rh
        + 4.80925239e-06 * t2m2 * e_mrt2_rh
        + -8.75492040e-08 * t2m3 * e_mrt2_rh
        + 2.77862930e-05 * va * e_mrt2_rh
        + -5.06004592e-06 * t2m_va * e_mrt2_rh
        + 1.14325367e-07 * t2m2 * va * e_mrt2_rh
        + 2.53016723e-06 * va2 * e_mrt2_rh
        + -1.72857035e-08 * t2m * va2 * e_mrt2_rh
        + -3.95079398e-08 * va3 * e_mrt2_rh
        + -3.59413173e-07 * e_mrt3_rh
        + 7.04388046e-07 * t2m * e_mrt3_rh
        + -1.89309167e-08 * t2m2 * e_mrt3_rh
        + -4.79768731e-07 * va * e_mrt3_rh
        + 7.96079978e-09 * t2m_va * e_mrt3_rh
        + 1.62897058e-09 * va2 * e_mrt3_rh
        + 3.94367674e-08 * e_mrt4_rh
        + -1.18566247e-09 * t2m * e_mrt4_rh
        + 3.34678041e-10 * va * e_mrt4_rh
        + -1.15606447e-10 * e_mrt5 * wvp
        + -2.80626406e00 * wvp2
        + 5.48712484e-01 * t2m * wvp2
        + -3.99428410e-03 * t2m2 * wvp2
        + -9.54009191e-04 * t2m3 * wvp2
        + 1.93090978e-05 * t2m4 * wvp2
        + -3.08806365e-01 * varh2
        + 1.16952364e-02 * t2m * varh2
        + 4.95271903e-04 * t2m2 * varh2
        + -1.90710882e-05 * t2m3 * varh2
        + 2.10787756e-03 * va2 * wvp2
        + -6.98445738e-04 * t2m * va2 * wvp2
        + 2.30109073e-05 * t2m2 * va2 * wvp2
        + 4.17856590e-04 * va3 * wvp2
        + -1.27043871e-05 * t2m * va3 * wvp2
        + -3.04620472e-06 * va4 * wvp2
        + 5.14507424e-02 * e_mrt_rh2
        + -4.32510997e-03 * t2m * e_mrt_rh2
        + 8.99281156e-05 * t2m2 * e_mrt_rh2
        + -7.14663943e-07 * t2m3 * e_mrt_rh2
        + -2.66016305e-04 * va * e_mrt_rh2
        + 2.63789586e-04 * t2m_va * e_mrt_rh2
        + -7.01199003e-06 * t2m2 * va * e_mrt_rh2
        + -1.06823306e-04 * va2 * e_mrt_rh2
        + 3.61341136e-06 * t2m * va2 * e_mrt_rh2
        + 2.29748967e-07 * va3 * e_mrt_rh2
        + 3.04788893e-04 * e_mrt2_rh2
        + -6.42070836e-05 * t2m * e_mrt2_rh2
        + 1.16257971e-06 * t2m2 * e_mrt2_rh2
        + 7.68023384e-06 * va * e_mrt2_rh2
        + -5.47446896e-07 * t2m_va * e_mrt2_rh2
        + -3.59937910e-08 * va2 * e_mrt2_rh2
        + -4.36497725e-06 * e_mrt3 * wvp2
        + 1.68737969e-07 * t2m * e_mrt3 * wvp2
        + 2.67489271e-08 * va * e_mrt3 * wvp2
        + 3.23926897e-09 * e_mrt4 * wvp2
        + -3.53874123e-02 * wvp3
        + -2.21201190e-01 * t2m * wvp3
        + 1.55126038e-02 * t2m2 * wvp3
        + -2.63917279e-04 * t2m3 * wvp3
        + 4.53433455e-02 * va * wvp3
        + -4.32943862e-03 * t2m_va * wvp3
        + 1.45389826e-04 * t2m2 * va * wvp3
        + 2.17508610e-04 * va2 * wvp3
        + -6.66724702e-05 * t2m * va2 * wvp3
        + 3.33217140e-05 * va3 * wvp3
        + -2.26921615e-03 * e_mrt_rh3
        + 3.80261982e-04 * t2m * e_mrt_rh3
        + -5.45314314e-09 * t2m2 * e_mrt_rh3
        + -7.96355448e-04 * va * e_mrt_rh3
        + 2.53458034e-05 * t2m_va * e_mrt_rh3
        + -6.31223658e-06 * va2 * e_mrt_rh3
        + 3.02122035e-04 * e_mrt2 * wvp3
        + -4.77403547e-06 * t2m * e_mrt2 * wvp3
        + 1.73825715e-06 * va * e_mrt2 * wvp3
        + -4.09087898e-07 * e_mrt3 * wvp3
        + 6.14155345e-01 * wvp4
        + -6.16755931e-02 * t2m * wvp4
        + 1.33374846e-03 * t2m2 * wvp4
        + 3.55375387e-03 * va * wvp4
        + -5.13027851e-04 * t2m_va * wvp4
        + 1.02449757e-04 * va2 * wvp4
        + -1.48526421e-03 * e_mrt * wvp4
        + -4.11469183e-05 * t2m * e_mrt * wvp4
        + -6.80434415e-06 * va * e_mrt * wvp4
        + -9.77675906e-06 * e_mrt2 * wvp4
        + 8.82773108e-02 * wvp5
        + -3.01859306e-03 * t2m * wvp5
        + 1.04452989e-03 * va * wvp5
        + 2.47090539e-04 * e_mrt * wvp5
        + 1.48348065e-03 * wvp6
  );
  return utci;
}

/* saturation vapour pressure over water, Hardy (1998) ITS-90 formulation (hPa) — the one the UTCI reference chain uses */
function esatHardy(tk) { const g = [-2.8365744e3, -6.028076559e3, 1.954263612e1, -2.737830188e-2, 1.6261698e-5, 7.0229056e-10, -1.8680009e-13, 2.7150305]; let ess = g[7] * Math.log(tk); for (let i = 0; i < 7; i++) ess += g[i] * Math.pow(tk, i - 2); return Math.exp(ess) * 0.01; }
/* UTCI (°C) with the official stress class. wind10 in m/s at 10 m (do not pass a 2 m wind); vapour pressure from T and RH. */
function utci(tC, tmrtC, wind10, rhPct) {
  if ([tC, tmrtC, wind10, rhPct].some(v => v == null || !Number.isFinite(v))) return { utci: null };
  const e_hPa = Math.max(0, rhPct / 100) * esatHardy(tC + 273.15); const wvp = e_hPa / 10;   /* Hardy (1998), as ERA5-HEAT uses for UTCI */
  const flags = [];
  if (tC < -50 || tC > 50) flags.push('air temperature outside -50..50 C'); if (wind10 < 0.5 || wind10 > 17) flags.push('10 m wind outside 0.5..17 m/s');
  if (tmrtC - tC < -30 || tmrtC - tC > 70) flags.push('Tmrt - Ta outside -30..70 K'); if (e_hPa > 50) flags.push('vapour pressure above 50 hPa');
  const v = utciPolynomial(tC, tmrtC, Math.max(0.5, Math.min(17, wind10)), wvp);
  const u = Math.round(v * 10) / 10;
  const cls = utciClassOne(u) ? utciClassOne(u).toLowerCase() : null;   /* v91.17.157 · audit: the one class table (utci.mjs; lower bounds inclusive): 9.0 was slight cold here and no stress there */
  return { utci: u, stressClass: cls, vapourPressureHpa: Math.round(e_hPa * 10) / 10, outsideValidity: flags.length ? flags : null };
}
/* v91.17.283.3 · audit C3 · no work/rest phrases: the ISO 7243 reference values depend on workload, acclimatisation and clothing, which
   the forecast does not know. The answer is the environmental value with that statement, never a rest ratio or a stop instruction. */
const WBGT_REF = 'ISO 7243 reference values depend on workload, acclimatisation and clothing; no rest schedule is derived from it';
function wbgtBand(w) { return w == null || !Number.isFinite(w) ? null : 'WBGT ' + (Math.round(w * 10) / 10) + ' °C (environmental value; ' + WBGT_REF + ')'; }
/* one hour, all three from the provider fields: T (°C), RH (%), surface pressure (hPa), wind10 (m/s), shortwave global / direct /
   DNI (W/m²), cloud cover (0-1), lat, lon, whenMs. Returns everything the card and the sheet need, with the bases stated. */
/* v91.17.277 · the measured surface albedo (v91.17.199 M04, feature-grid bands a_alb_*) is retired: no shipped feature grid holds the
   band, so every answer used the fixed 0.20; Tmrt keeps the fixed surface albedo 0.20 (Di Napoli et al. 2020 / ERA5-HEAT). */
const FIXED_ALBEDO = 0.20, FIXED_ALBEDO_BASIS = 'fixed 0.20 (no measured albedo at this place)';
function thermalHour({ tC, rhPct, pressureHpa, wind10, ssrd, fdir, dsrp, cloudFrac, lat, lon, whenMs }) {
  const cossza = cosSolarZenith(lat, lon, whenMs);
  const fdirFrac = ssrd > 0 ? Math.max(0, Math.min(1, fdir / ssrd)) : 0;
  const w = wbgtLiljegren(tC, rhPct, pressureHpa, wind10, ssrd, fdirFrac, cossza);
  const m = meanRadiantTemperature(tC, rhPct, cloudFrac, ssrd, fdir, dsrp, cossza, FIXED_ALBEDO);
  const u = utci(tC, m.tmrt, wind10, rhPct);
  return { cossza: Math.round(cossza * 1000) / 1000, wbgt: w.wbgt, wbgtBand: wbgtBand(w.wbgt), tg: w.tg, tnwb: w.tnwb, wind2m: w.speed2m, tmrt: m.tmrt, tmrtBasis: m.basis || null, utci: u.utci, utciClass: u.stressClass || null, utciFlags: u.outsideValidity || null };
}
export { wbgtLiljegren, meanRadiantTemperature, utci, utciPolynomial, cosSolarZenith, longwaveDown, windSpeed2m, wbgtBand, thermalHour, esat, esatHardy, FIXED_ALBEDO, FIXED_ALBEDO_BASIS };
