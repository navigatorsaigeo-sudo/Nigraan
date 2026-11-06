/* ERA5 daily climatology per tehsil, so ensemble events are judged against what is
   unusual for that place and season (a 38 °C day is ordinary in Jacobabad in June and extreme
   in Murree). Built once from the paid archive (about 24 requests), kept in data/climatology.json.
   For each calendar day (±7-day window, 30 years = ~450 samples):
     tx90  90th percentile of daily max temperature
     tn90  90th percentile of daily min temperature
     tn10  10th percentile of daily min temperature
     pr3_99  99th percentile of 3-day rain totals ending that day
   v91.17.78 · C · TWO PERIODS FROM ONE SWEEP. The percentiles above (tx90, tn90, tn10, pr3_99) are an operational
   normal over the most recent thirty complete years, 1996-2025 (NORMAL_PERIOD): WMO-No. 1203, WMO Guidelines on the
   Calculation of Climate Normals (2017) — the 1991-2020 standard normal is kept for long-term climate-change
   comparison, and a most-recent-30-year normal is the recommended base for operational products whose users
   compare "now" with "recently normal". Measured: against 1991-2020, 2021-2025 ERA5 days crossed tx90 on more than
   10 % of days (the base was cool for the 2020s; check.* in the file). The SPI and SPEI fits stay on the 1991-2020
   standard normal (SPI_PERIOD): data/spi-pentad.json, the primary drought fit, is 1991-2020 and the monthly fits
   here must match it. One archive sweep over 1991-2025 serves both. NIGRAAN_CLIM_PERIOD overrides the normal. */
const NORMAL_PERIOD = process.env.NIGRAAN_CLIM_PERIOD || '1996-2025';
const SPI_PERIOD = '1991-2020';
const yrs = (p) => p.split('-').map(Number);
const sliceYears = (daily, y0, y1) => { const T = daily.time; let a = 0, b = T.length; while (a < b && +T[a].slice(0, 4) < y0) a++; while (b > a && +T[b - 1].slice(0, 4) > y1) b--; const o = {}; for (const [k, v] of Object.entries(daily)) o[k] = Array.isArray(v) ? v.slice(a, b) : v; return o; };
import { stationData, label } from './refmode.mjs';
import { readFileSync, writeFileSync, renameSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { weightOf } from './provider.mjs';
import { createDroughtType } from './droughttype.mjs';   /* v91.17.274 · drought type per tehsil (meteorological / agricultural / hydrological) */   /* v91.17.270 · OPS A8 · the rebuild's cost, by the provider's own rule, before anything is asked */

const doyOf = (iso) => { const d = new Date(iso + 'T00:00:00Z'); const y = d.getUTCFullYear(); const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; let n = Math.floor((d - Date.UTC(y, 0, 1)) / 86400e3); if (!leap && n >= 59) n++; return n; }; // 0..365, Feb 29 = 59
/* v91.17.4 · r1(null) was Math.round(0)/10 = 0, so an empty percentile window
   wrote a 0 °C / 0 mm THRESHOLD rather than a missing one — and a 0 °C tx90 is
   a threshold every day crosses. Checked against the shipped table: no nulls
   today, so this is a guard, not a repair. It stays because the window can
   empty whenever an archive fetch comes back short. */
const r1 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 10) / 10;
/* ══ v91.17.9 · SPI BASELINES, FITTED FROM RECORDS THIS BUILD ALREADY READS ══
   The drought hazard's primary engine wants SPI-30/90. Until now the only way
   to get a baseline was a 30-year archive pull per district from the browser —
   about 783 weighted calls each, roughly 128,000 for the country — so it ran
   lazily for one selected district and, in practice, never.

   The national sweep below already reads 1991-2020 daily precipitation_sum for
   every tehsil to build the rainfall percentile. SPI needs nothing more than a
   second statistic over those same records: zero new archive calls.

   Method: McKee et al. (1993) with the Thom (1958) mixed distribution, which is
   the standard treatment for a variable with a non-zero probability of zero.
   For each calendar month, the accumulation ending on the last day of that
   month is taken once per year (30 samples), which is the textbook construction
   — sliding daily windows would give 900 heavily autocorrelated samples and a
   falsely confident fit.

     q      = P(accumulation is exactly zero)
     A      = ln(mean of non-zero) - mean of ln(non-zero)
     alpha  = (1 + sqrt(1 + 4A/3)) / (4A)          Thom's approximation
     beta   = mean(non-zero) / alpha
     H(x)   = q + (1-q) * GammaCDF(x; alpha, beta)
     SPI    = standard-normal quantile of H(x)

   Stored per calendar month, not per day of year: SPI is defined on monthly
   accumulations, and 12 bins x 3 parameters x 2 windows is 72 numbers a unit
   rather than 2,196. */
function gammaLn(x) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += g[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
/* lower regularised incomplete gamma P(a,x) — series below the crossover, continued
   fraction above it, which is the standard split and keeps both branches convergent. */
function gammaP(a, x) {
  if (!(x > 0) || !(a > 0)) return 0;
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-12) break; }
    return sum * Math.exp(-x + a * Math.log(x) - gammaLn(a));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i <= 500; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - gammaLn(a)) * h;
}
/* Acklam's inverse standard normal — max relative error about 1.15e-9, which is
   far inside anything an SPI value is read to. */
function invNorm(p) {
  if (!(p > 0) || !(p < 1)) return null;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425;
  let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
/* Thom fit on one month's samples. Returns null where the record is too thin to
   fit — a refusal, never a default shape. */
function fitGamma(samples) {
  const v = samples.filter((x) => x != null && isFinite(x) && x >= 0);
  if (v.length < 15) return null;
  const nz = v.filter((x) => x > 0);
  const q = (v.length - nz.length) / v.length;
  if (nz.length < 8) return { q: Math.round(q * 1000) / 1000, a: null, b: null, why: 'fewer than 8 non-zero accumulations in 30 years' };
  const mean = nz.reduce((s, x) => s + x, 0) / nz.length;
  const A = Math.log(mean) - nz.reduce((s, x) => s + Math.log(x), 0) / nz.length;
  if (!(A > 0)) return null;
  const a = (1 + Math.sqrt(1 + 4 * A / 3)) / (4 * A);
  const b = mean / a;
  if (!(a > 0) || !(b > 0)) return null;
  return { q: Math.round(q * 1000) / 1000, a: Math.round(a * 1e4) / 1e4, b: Math.round(b * 1e3) / 1e3 };
}
/* ══ SPEI · Vicente-Serrano, Begueria & Lopez-Moreno (2010) ════════════════
   SPI answers "is the rain unusual". It says nothing about how hard the
   atmosphere is pulling water back out, so a hot dry spell and a cool dry
   spell of equal rainfall score identically. SPEI runs the same machinery on
   the climatic water balance D = P - ET0 (FAO-56 Penman-Monteith, which the
   archive returns), which can be negative, so the gamma is replaced by a
   three-parameter log-logistic fitted by probability-weighted moments:

     w_s   = (1/N) * SUM (1 - F_i)^s * x_i,   F_i = (i - 0.35)/N, x ascending
     beta  = (2*w1 - w0) / (6*w1 - w0 - 6*w2)
     alpha = (w0 - 2*w1) * beta / (G(1 + 1/beta) * G(1 - 1/beta))
     gamma = w0 - alpha * G(1 + 1/beta) * G(1 - 1/beta)
     F(x)  = [1 + (alpha / (x - gamma))^beta]^-1
     SPEI  = standard-normal quantile of F(x)

   The two gamma functions only exist for beta > 1; below that the distribution
   has no mean and the fit is refused rather than clamped. */
function fitLogLogistic(samples) {
  const v = samples.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b);
  const N = v.length;
  if (N < 15) return null;
  let w0 = 0, w1 = 0, w2 = 0;
  for (let i = 0; i < N; i++) {
    const F = (i + 1 - 0.35) / N, u = 1 - F;
    w0 += v[i]; w1 += u * v[i]; w2 += u * u * v[i];
  }
  w0 /= N; w1 /= N; w2 /= N;
  const den = 6 * w1 - w0 - 6 * w2;
  if (!isFinite(den) || Math.abs(den) < 1e-12) return null;
  const beta = (2 * w1 - w0) / den;
  if (!(beta > 1) || !isFinite(beta)) return null;
  let gg;
  try { gg = Math.exp(gammaLn(1 + 1 / beta) + gammaLn(1 - 1 / beta)); } catch { return null; }
  if (!isFinite(gg) || gg <= 0) return null;
  const alpha = (w0 - 2 * w1) * beta / gg;
  if (!(alpha > 0) || !isFinite(alpha)) return null;
  const gamma = w0 - alpha * gg;
  if (!isFinite(gamma)) return null;
  /* v91.17.69 · a fit whose lower bound sits above part of the record it was fitted to does not describe that record.
     On arid units (Pasni, Pishin, Huramzai, Kirdgap, Khaliqabad) the PWM fit put gamma above observed water balances,
     so an ordinary year fell "below the support" and printed SPEI -3.00 (extreme drought) beside SPI near 0; the drought
     layer painted them Watch/Act [measured 25 Sep]. Such a fit is refused, as a beta <= 1 fit is; SPI stands alone there. */
  if (v[0] <= gamma) return null;
  return { a: Math.round(alpha * 1e3) / 1e3, b: Math.round(beta * 1e4) / 1e4, g: Math.round(gamma * 1e3) / 1e3 };
}
export function speiFrom(fit, x) {
  if (!fit || x == null || !isFinite(x)) return null;
  if (fit.a == null || fit.b == null || fit.g == null) return null;
  const d = x - fit.g;
  /* v91.17.69 · a value at or below the fitted lower bound is outside what the fit describes. It returned -3 (extreme),
     which on arid units printed SPEI -3.00 beside SPI near 0; without the fitted record it cannot be told from a bad fit,
     so it is refused (null) and SPI carries the unit. */
  if (!(d > 0)) return null;
  const F = 1 / (1 + Math.pow(fit.a / d, fit.b));
  const z = invNorm(Math.min(0.999999, Math.max(0.000001, F)));
  return z == null ? null : Math.round(Math.min(3, Math.max(-3, z)) * 100) / 100;
}
export function spiFrom(fit, x) {
  if (!fit || x == null || !isFinite(x) || x < 0) return null;
  if (fit.a == null || fit.b == null) return null;
  const G = x > 0 ? gammaP(fit.a, x / fit.b) : 0;
  /* v91.17.93 · science audit: a window with no rain takes the centre-of-mass probability of the zero class (Stagge et al.
     2015, Int. J. Climatol. 35: 4027), (n0 + 1) / (2 (n + 1)), not q itself: with q = 0 (every one of the 30 base windows
     had rain) a dry window read H = 1e-6, SPI -3, "extreme drought", in a place where one dry month is not extreme. */
  const N = fit.n || 30;
  let H = x > 0 ? fit.q + (1 - fit.q) * G : (Math.round(fit.q * N) + 1) / (2 * (N + 1));
  H = Math.min(0.999999, Math.max(0.000001, H));
  const z = invNorm(H);
  /* Capped at +/-3, as SPEI is. Beyond three standard deviations the gamma is
     being asked about a tail that thirty samples never observed: the clamp on H
     alone would let the value run to +/-4.75, which reads as a precision the
     fit cannot carry. WMO's own drought classification ends at "extreme" below
     -2, so nothing downstream distinguishes -3 from -4.75 anyway. */
  return z == null ? null : Math.round(Math.min(3, Math.max(-3, z)) * 100) / 100;
}
function pct(sorted, p) { if (!sorted.length) return null; const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }

export function createClimatology(app, dataDir) {
  const { provider, units } = app;
  const file = join(dataDir, 'climatology.json');
  let C = null, building = false, lastError = null, progress = { done: 0, total: 0 };
  try { if (existsSync(file)) C = JSON.parse(readFileSync(file, 'utf8')); } catch { C = null; }
  /* v91.17.110 · the heat-stress climate of each place (data/utci-climatology.json, scripts/gen/build_utci_climatology.mjs): daily max
     shade UTCI percentiles per calendar day. Moved onto the served basis with the same daily-maximum shift as tx90 (UTCI follows air
     temperature about one for one at fixed humidity and wind). Context only. */
  let UC = null, ucAt = 0; const ucFile = join(dataDir, 'utci-climatology.json');
  const utciClim = () => { if (UC && Date.now() - ucAt < 600e3) return UC; ucAt = Date.now(); try { UC = JSON.parse(readFileSync(ucFile, 'utf8')); } catch { UC = null; } return UC; };
  /* v91.17.111 · the cold half: daily MINIMUM shade UTCI percentiles (data/utci-cold-climatology.json), moved by the night shift as tn10 */
  let UCC = null, uccAt = 0; const uccFile = join(dataDir, 'utci-cold-climatology.json');
  const utciColdClim = () => { if (UCC && Date.now() - uccAt < 600e3) return UCC; uccAt = Date.now(); try { UCC = JSON.parse(readFileSync(uccFile, 'utf8')); } catch { UCC = null; } return UCC; };
  const uccOf = (unitId, d, shift) => { const U = utciColdClim(); const u = U && U.units && U.units[unitId]; if (!u) return {};
    const f = (x) => x == null ? null : Math.round((x + (shift || 0)) * 10) / 10; return { c05: f(u.p05[d]), c10: f(u.p10[d]), c50: f(u.p50[d]) }; };
  const ucOf = (unitId, d, shift) => { const U = utciClim(); const u = U && U.units && U.units[unitId]; if (!u) return {};
    const f = (x) => x == null ? null : Math.round((x + (shift || 0)) * 10) / 10; return { u50: f(u.p50[d]), u90: f(u.p90[d]), u95: f(u.p95[d]) }; };

  function reduce(dailyAll) {
    const [n0, n1] = yrs(NORMAL_PERIOD), [s0, s1] = yrs(SPI_PERIOD);
    const daily = sliceYears(dailyAll, n0, n1);
    const tx = Array.from({ length: 366 }, () => []), tn = Array.from({ length: 366 }, () => []), p3 = Array.from({ length: 366 }, () => []);
    { const T = daily.time, X = daily.temperature_2m_max, N = daily.temperature_2m_min, P = daily.precipitation_sum;
    for (let i = 0; i < T.length; i++) {
      const d = doyOf(T[i]);
      if (X[i] != null) tx[d].push(X[i]); if (N[i] != null) tn[d].push(N[i]);
      if (i >= 2 && P[i] != null && P[i - 1] != null && P[i - 2] != null) p3[d].push(P[i] + P[i - 1] + P[i - 2]);
    } }
    /* the drought fits on the standard normal (SPI_PERIOD), from the same sweep */
    const sd = sliceYears(dailyAll, s0, s1);
    const T = sd.time, P = sd.precipitation_sum, E = sd.et0_fao_evapotranspiration || null;
    /* ══ SPI baselines · McKee et al. (1993), Thom (1958) mixed distribution ═══
       One accumulation per year per calendar month: the 30-day (and 90-day)
       rainfall total ending on the last day of that month. Thirty years of
       ERA5 gives thirty samples per month — the textbook sample size. The
       fitted (q, alpha, beta) travel with the unit; the live SPI is computed
       from them at request time against the current accumulation. */
    const acc = (span) => {
      const bym = Array.from({ length: 12 }, () => []);
      let run = 0;
      for (let i = 0; i < T.length; i++) {
        run += (P[i] != null && isFinite(P[i])) ? P[i] : 0;
        if (i >= span) run -= (P[i - span] != null && isFinite(P[i - span])) ? P[i - span] : 0;
        if (i < span - 1) continue;
        const cur = T[i].slice(0, 7), nxt = (i + 1 < T.length) ? T[i + 1].slice(0, 7) : null;
        if (nxt === cur) continue;                    // not the month's last day
        let miss = 0; for (let k = i - span + 1; k <= i; k++) if (P[k] == null || !isFinite(P[k])) miss++;
        if (miss > span * 0.1) continue;              // >10% of the window absent
        bym[Number(T[i].slice(5, 7)) - 1].push(run);
      }
      return bym;
    };
    /* the same month-ending windows on the water balance D = P - ET0 */
    const accD = (span) => {
      if (!E) return null;
      const D = new Array(T.length);
      for (let i = 0; i < T.length; i++) {
        const p = (P[i] != null && isFinite(P[i])) ? P[i] : null;
        const e = (E[i] != null && isFinite(E[i])) ? E[i] : null;
        D[i] = (p == null || e == null) ? null : p - e;
      }
      const bym = Array.from({ length: 12 }, () => []);
      let run = 0;
      for (let i = 0; i < T.length; i++) {
        run += D[i] == null ? 0 : D[i];
        if (i >= span) run -= D[i - span] == null ? 0 : D[i - span];
        if (i < span - 1) continue;
        const cur = T[i].slice(0, 7), nxt = (i + 1 < T.length) ? T[i + 1].slice(0, 7) : null;
        if (nxt === cur) continue;
        let miss = 0; for (let k = i - span + 1; k <= i; k++) if (D[k] == null) miss++;
        if (miss > span * 0.1) continue;
        bym[Number(T[i].slice(5, 7)) - 1].push(run);
      }
      return bym;
    };
    const a30 = acc(30), a90 = acc(90), d30 = accD(30), d90 = accD(90);
    const out = {
      tx90: [], tn90: [], tn10: [], pr3_99: [],
      spi: { m30: a30.map(fitGamma), m90: a90.map(fitGamma) },
      spei: d30 ? { m30: d30.map(fitLogLogistic), m90: d90.map(fitLogLogistic) } : null,
    };
    for (let d = 0; d < 366; d++) {
      const w = (arr) => { const s = []; for (let k = -7; k <= 7; k++) { const j = (d + k + 366) % 366; for (const v of arr[j]) s.push(v); } return s.sort((a, b) => a - b); };
      const a = w(tx), b = w(tn), c = w(p3);
      out.tx90.push(r1(pct(a, 0.9))); out.tn90.push(r1(pct(b, 0.9))); out.tn10.push(r1(pct(b, 0.1))); out.pr3_99.push(r1(pct(c, 0.99)));
    }
    /* v91.17.101 · EHF's T95 (Nairn & Fawcett 2015): the 95th percentile of daily mean temperature ((tmax + tmin) / 2) over every day
       of the normal period, one number per unit */
    { const X = daily.temperature_2m_max, N = daily.temperature_2m_min, m = []; for (let i = 0; i < daily.time.length; i++) if (X[i] != null && N[i] != null) m.push((X[i] + N[i]) / 2);
      m.sort((a, b) => a - b); out.tm95 = m.length >= 3650 ? r1(pct(m, 0.95)) : null; }
    return out;
  }

  async function build() {
    if (building) return { started: false, why: 'already building' };
    if (!provider.configured()) return { started: false, why: 'no paid provider key' };
    building = true; const t0 = Date.now();
    const pool = units.tehsil.filter(u => !u.disputed && u.lat != null);
    const [n0, n1] = yrs(NORMAL_PERIOD), [s0, s1] = yrs(SPI_PERIOD); const f0 = Math.min(n0, s0), f1 = Math.max(n1, s1);
    const next = { built: null, period: NORMAL_PERIOD, source: 'ERA5 daily, tehsil elevation', windowDays: 15,
      periods: { tx90: NORMAL_PERIOD, tn90: NORMAL_PERIOD, tn10: NORMAL_PERIOD, pr3_99: NORMAL_PERIOD, spi: SPI_PERIOD, spei: SPI_PERIOD },
      normal: { type: 'operational normal over the most recent 30 complete years (percentiles); 1991-2020 standard normal (SPI/SPEI fits)', reference: 'WMO-No. 1203, WMO Guidelines on the Calculation of Climate Normals (2017)', previousPeriod: (C && C.period) || null },
      provenance: { dataset: 'ERA5 hourly reanalysis aggregated to daily (Copernicus Climate Change Service / ECMWF), model "era5", read through the paid reanalysis archive API at each tehsil settlement height (units.json elevM; the provider moves the grid value to that height by its lapse rate)', records: f0 + '-01-01..' + f1 + '-12-31, Asia/Karachi days', licence: 'CC-BY-4.0 (Copernicus Climate Data Store, reanalysis-era5-single-levels)', attribution: 'Contains modified Copernicus Climate Change Service information ' + new Date().getUTCFullYear() + '. Hersbach, H. et al. (2023): ERA5 hourly data on single levels from 1940 to present. Copernicus Climate Change Service (C3S) Climate Data Store (CDS), DOI: 10.24381/cds.adbb2d47. Neither the European Commission nor ECMWF is responsible for any use that may be made of the Copernicus information or data it contains.', builder: 'server/api/climatology.mjs build() (POST /api/checks/run?what=climatology)' },
      units: {} };
    /* the ETCCDI exceedance check on the years after the standard normal: TX90p (tx > tx90), TN90p (tn > tn90), TN10p (tn < tn10),
       against the table in force before this build and against the new one, on the same ERA5 days at the same height */
    const CK = { from: s1 + 1, to: f1, prev: { tx: [0, 0], tn90: [0, 0], tn10: [0, 0] }, next: { tx: [0, 0], tn90: [0, 0], tn10: [0, 0] }, unitsPrev: 0, unitsNext: 0 };
    const tally = (daily, tab, acc) => { if (!tab || !tab.tx90) return false; const T = daily.time, X = daily.temperature_2m_max, N = daily.temperature_2m_min; for (let i = 0; i < T.length; i++) { const y = +T[i].slice(0, 4); if (y < CK.from || y > CK.to) continue; const d = doyOf(T[i]);
      if (X[i] != null && tab.tx90[d] != null) { acc.tx[1]++; if (X[i] > tab.tx90[d]) acc.tx[0]++; }
      if (N[i] != null && tab.tn90[d] != null) { acc.tn90[1]++; if (N[i] > tab.tn90[d]) acc.tn90[0]++; }
      if (N[i] != null && tab.tn10[d] != null) { acc.tn10[1]++; if (N[i] < tab.tn10[d]) acc.tn10[0]++; } } return true; };
    progress = { done: 0, total: pool.length };
    try {
      for (let i = 0; i < pool.length; i += 25) {
        const b = pool.slice(i, i + 25);
        /* ══ v91.17.9 · A SHORT BATCH USED TO COST 25 UNITS SILENTLY ══════════
           Measured on the 19 September rebuild: two of the 24 batches came back
           as ONE object instead of 25, and the sweep dropped 50 tehsils without
           a word. The provider occasionally answers a multi-location archive
           request with a single location's payload; there is nothing to do
           about that except notice it and ask again. Retried once as a batch,
           then location by location, so a malformed response costs one extra
           request rather than a twenty-fifth of the country. */
        const ask = (units) => provider.call('archive', '/v1/archive', {
          latitude: units.map(u => u.lat), longitude: units.map(u => u.lon), elevation: units.map(u => u.elevM ?? 'nan'),
          daily: ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'et0_fao_evapotranspiration'],
          start_date: f0 + '-01-01', end_date: f1 + '-12-31', timezone: 'Asia/Karachi', models: 'era5',
        }, { locations: units.length, timeoutMs: 300000 });
        let arr = null;
        for (let attempt = 0; attempt < 2 && arr == null; attempt++) {
          try {
            const body = await ask(b);
            const a = Array.isArray(body) ? body : [body];
            if (a.length === b.length) { arr = a; break; }
            console.error(`  climatology: batch at ${i} asked ${b.length} locations and got ${a.length}${attempt ? '' : ' — retrying'}`);
          } catch (e) { lastError = e.message; console.error(`  climatology: batch at ${i} failed: ${e.message}${attempt ? '' : ' — retrying'}`); }
        }
        if (arr == null) {
          arr = [];
          for (const u of b) {
            try {
              const one = await ask([u]);
              const a = Array.isArray(one) ? one : [one];
              arr.push(a.length === 1 ? a[0] : null);
            } catch (e) { lastError = e.message; arr.push(null); }
          }
          console.error(`  climatology: batch at ${i} recovered ${arr.filter(Boolean).length} of ${b.length} one at a time`);
        }
        arr.forEach((loc, k) => {
          if (!b[k]) { console.error(`  climatology: response index ${k} has no matching unit in the batch at ${i}`); return; }
          if (!loc || !loc.daily) { console.error(`  climatology: no daily block for ${b[k].unitId} in the batch at ${i}`); return; }
          try { const r = { ...reduce(loc.daily), zM: b[k].elevM ?? null }; next.units[b[k].unitId] = r;
            const old = C && C.units && C.units[b[k].unitId];
            if (CK.from <= CK.to) { if (old && old.zM === r.zM && tally(loc.daily, old, CK.prev)) CK.unitsPrev++; if (tally(loc.daily, r, CK.next)) CK.unitsNext++; } }
          catch (e) { console.error(`  climatology: reduce failed for ${b[k].unitId}: ${e.message}`); }
        });
        progress.done = Math.min(pool.length, i + 25);
      }
      /* ══ v91.17.9 · A BUILD THAT DISCARDS ITSELF MUST SAY SO ═══════════════
         Measured: a 25-minute sweep of the paid archive completed, the gate
         below rejected the result, and nothing was written and nothing was
         logged. The dashboard still reported the PREVIOUS climatology as
         ready, with its old timestamp, so from every surface the rebuild had
         simply not happened. A silent discard of paid data is worse than a
         failure, because a failure is visible. */
      const gotUnits = Object.keys(next.units).length;
      if (gotUnits <= pool.length * 0.9) {
        lastError = `climatology rebuild kept only ${gotUnits} of ${pool.length} units (the 90% gate needs more than ${Math.floor(pool.length * 0.9)}); the previous table from ${C && C.built} is unchanged`;
        console.error('  climatology: ' + lastError);
        return { started: true, kept: gotUnits, of: pool.length, written: false, why: lastError };
      }
      {
        next.built = new Date().toISOString(); next.seconds = Math.round((Date.now() - t0) / 1000);
        if (CK.from <= CK.to) { const pc = (a) => a[1] ? Math.round(1000 * a[0] / a[1]) / 10 : null;
          next.check = { what: 'share of ERA5 days ' + CK.from + '-' + CK.to + ' beyond each percentile (ETCCDI TX90p, TN90p, TN10p; 10 % by construction inside a base period)', note: (CK.to <= n1 && CK.from >= n0) ? 'these years are inside the new base period (in-sample), so the new rates sit near 10 % partly by construction; the previous table was built without them (out-of-sample)' : null,
            previous: { period: (C && C.period) || null, units: CK.unitsPrev, TX90p: pc(CK.prev.tx), TN90p: pc(CK.prev.tn90), TN10p: pc(CK.prev.tn10), days: CK.prev.tx[1] },
            current: { period: NORMAL_PERIOD, units: CK.unitsNext, TX90p: pc(CK.next.tx), TN90p: pc(CK.next.tn90), TN10p: pc(CK.next.tn10), days: CK.next.tx[1] } };
          console.log('  climatology: exceedance ' + CK.from + '-' + CK.to + ' ' + JSON.stringify(next.check.previous) + ' -> ' + JSON.stringify(next.check.current)); }
        const tmp = file + '.tmp'; writeFileSync(tmp, JSON.stringify(next)); try { renameSync(tmp, file); } catch { writeFileSync(file, JSON.stringify(next)); }
        C = next; SH = null; lastError = null;
        const nSpi = Object.values(next.units).filter(u => u.spi && u.spi.m90 && u.spi.m90.some(Boolean)).length;
        const nSpei = Object.values(next.units).filter(u => u.spei && u.spei.m90 && u.spei.m90.some(Boolean)).length;
        console.log(`  climatology: ${gotUnits} tehsils built in ${next.seconds}s · SPI fits on ${nSpi}, SPEI fits on ${nSpei}`);
        return { started: true, kept: gotUnits, written: true, spiUnits: nSpi, speiUnits: nSpei };
      }
    } finally { building = false; }
  }
  /* Anomaly climate for scoring weeks-ahead and seasonal forecasts: ERA5 1993-2016 (the SEAS5
     hindcast period; EC46 re-forecasts cover a similar span), daily mean temperature and rain,
     smoothed over ±7 days. Kept in data/anomaly-climate.json. */
  const aFile = join(dataDir, 'anomaly-climate.json');
  let AC = null, aBuilding = false;
  try { if (existsSync(aFile)) AC = JSON.parse(readFileSync(aFile, 'utf8')); } catch { AC = null; }
  async function buildAnomaly() {
    if (aBuilding || !provider.configured()) return { started: false };
    aBuilding = true; const t0 = Date.now();
    const pool = units.tehsil.filter(u => !u.disputed && u.lat != null);
    const next = { built: null, period: '1993-2016', units: {} };
    try {
      for (let i = 0; i < pool.length; i += 25) {
        const b = pool.slice(i, i + 25);
        let body;
        try { body = await provider.call('archive', '/v1/archive', { latitude: b.map(u => u.lat), longitude: b.map(u => u.lon), elevation: b.map(u => u.elevM ?? 'nan'), daily: ['temperature_2m_mean', 'precipitation_sum'], start_date: '1993-01-01', end_date: '2016-12-31', timezone: 'Asia/Karachi', models: 'era5' }, { locations: b.length, timeoutMs: 300000 }); }
        catch (e) { lastError = 'anomaly climate: ' + e.message; continue; }
        (Array.isArray(body) ? body : [body]).forEach((loc, k) => {
          const d = loc && loc.daily; if (!d) return;
          const ts = Array.from({ length: 366 }, () => [0, 0]), ps = Array.from({ length: 366 }, () => [0, 0]);
          d.time.forEach((t, j) => { const q = doyOf(t); if (d.temperature_2m_mean[j] != null) { ts[q][0] += d.temperature_2m_mean[j]; ts[q][1]++; } if (d.precipitation_sum[j] != null) { ps[q][0] += d.precipitation_sum[j]; ps[q][1]++; } });
          const sm = (arr) => Array.from({ length: 366 }, (_, q) => { let s = 0, n = 0; for (let w = -7; w <= 7; w++) { const x = arr[(q + w + 366) % 366]; s += x[0]; n += x[1]; } return n ? Math.round(100 * s / n) / 100 : null; });
          next.units[b[k].unitId] = { tm: sm(ts), pr: sm(ps), zM: b[k].elevM ?? null };
        });
      }
      if (Object.keys(next.units).length > pool.length * 0.9) { next.built = new Date().toISOString(); writeFileSync(aFile, JSON.stringify(next)); AC = next; SH = null; console.log('  climatology: anomaly climate built in ' + Math.round((Date.now() - t0) / 1000) + 's'); }
      return { started: true };
    } finally { aBuilding = false; }
  }
  /* v91.17.37 · B · the climatology was built at the anchor height; a unit the sweep now serves at its
     settlement height (national.mjs, data/settlement-elevation.json) gets its temperature normals and
     percentiles moved by the same standard lapse the provider applies (-6.5 C/km), so an anomaly is a
     departure from the normal AT THE SERVED HEIGHT and a 2,000 m lower valley does not read as a heat
     wave against the ridge's climatology. Rain fields are not shifted. */
  let SH = null;
  function heightShiftC(unitId) {
    /* the height the climatology was built at is recorded per unit (zM, v91.17.37); older files
       without it were built at the anchor height. The shift is zero once the file is rebuilt at the
       height the sweep serves. */
    if (SH === null) { SH = new Map(); CBS = null; CB = null; try { for (const u of (app.units && app.units.tehsil) || []) { const cu = C && C.units && C.units[u.unitId]; const z0 = cu && cu.zM != null ? cu.zM : u.anchorElevM; const g = z0 != null && u.elevM != null ? u.elevM - z0 : 0; if (g) SH.set(u.unitId, Math.round(-6.5 * g / 1000 * 10) / 10); } } catch (_) {} }
    return SH.get(unitId) || 0;
  }
  const shT = (v, s) => (v == null || !s) ? v : Math.round((v + s) * 10) / 10;
  /* v91.17.38 · THE MOUNTAIN CLIMATOLOGY ON THE BASIS OF THE VALUE IT IS COMPARED WITH. The
     1991-2020 percentiles are ERA5 at the tehsil point, and ERA5 runs cold against the PMD
     mountain stations. The served forecast is not on that basis: by day it carries the station
     correction (about right), by night it is the raw model. An anomaly is a comparison, so:
       tx90, tn90  + (obs - ERA5) daily maximum      tn10  + (model - ERA5) daily minimum
       tm          + half of each
     by height band (of the served height) and month, regional month fallback, from the station
     lake pairs (station-lake/scripts/clim_bias.py -> data/climatology-bias.json). Leave-one-station-
     out on 10,316 station days: ERA5 daily maximum bias -4.85 -> -0.08 C, MAE 5.28 -> 3.28.
     Mountain units only (the MOS box, 1,000 m and above). NIGRAAN_CLIM_BIAS=0 turns it off. */
  let CB = null, CBS = null;
  const bandOf = (z) => z < 2000 ? '<2000' : z < 2750 ? '2000-2750' : z < 3250 ? '2750-3250' : z < 3750 ? '3250-3750' : z < 4250 ? '3750-4250' : '>4250';
  function basisShift(unitId, doy) {
    if (process.env.NIGRAAN_CLIM_BIAS === '0') return null;
    /* v91.17.70 · climatology-bias.json is fitted to station pairs (clim_bias.py) and was internal-only under option 2.
       v91.17.71 · station data feeds customer values again (refmode.mjs stationData(), CEO decision 25 Sep 2026): this is a
       data-use gate, so it follows stationData(). The served mountain value is now station-calibrated by day AND by night
       (mos.mjs calibrationAt), so the night percentiles move by the OBSERVED night difference (nightObsMinusEra5) where the
       file has it, no longer by the model's. NIGRAAN_STATION_DATA=0 restores the open-only path. */
    if (!stationData()) return null;
    if (CB === null) { try { const f = join(dataDir, 'climatology-bias.json'); CB = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : false; } catch (_) { CB = false; } CBS = new Map(); }
    if (!CB) return null;
    const month = String(new Date(Date.UTC(2024, 0, 1) + doy * 86400e3).getUTCMonth() + 1);   /* v91.17.68 · doy is 0-based and leap-inclusive (doyOf), so a leap-year origin and no −1 (audit B18: Jan 1 and Feb 1 read the previous month) */
    const key = unitId + '|' + month; if (CBS.has(key)) return CBS.get(key);
    let v = null;
    try { const u = ((app.units && app.units.tehsil) || []).find(x => x.unitId === unitId);
      if (u && u.elevM != null && u.elevM >= 1000 && app.mos && app.mos.inDomain(u.lat, u.lon, u.elevM)) {
        const row = ((CB.bands || {})[bandOf(u.elevM)] || {})[month] || (CB.regional || {})[month];
        if (row) { const night = row.nightObsMinusEra5 != null ? row.nightObsMinusEra5 : row.nightModelMinusEra5; v = { day: row.dayObsMinusEra5, night, mean: Math.round(((row.dayObsMinusEra5 || 0) + (night || 0)) / 2 * 10) / 10, source: ((CB.bands || {})[bandOf(u.elevM)] || {})[month] ? 'band ' + bandOf(u.elevM) : 'regional', stations: row.stations }; }
      } } catch (_) { v = null; }
    CBS.set(key, v); return v;
  }
  /* ══ v91.17.139 · THE STATION BASIS FROM THE BALOCHISTAN SYNOP RECORD (data/clim-bias-sites.json, scripts/gen/balo_synop_calib.py)
     A tehsil whose served value carries a synop site's calibration (same reach as mos.mjs calibrationAt) gets its ERA5 percentiles
     moved onto the station basis per calendar day: tx90 by the p90 difference at 09 UTC, tn90 / tn10 by the p90 / p10 difference
     at 00 UTC, the normals and heat / cold stress percentiles by the mean day / night difference. Test (fit 1996-2015, score
     2016-2025, per cent of station days beyond the threshold, against the station's own threshold as benchmark): ERA5 alone is
     off by up to 36 points (Dalbandin hot days 38 % vs 8 %), the station basis by at most 3.3 points at all 18 site-thresholds (9 adopted sites).
     Units outside the mountain shift only (the two never stack). stationData() gate; NIGRAAN_CLIM_SITES=0 turns it off. */
  /* v91.17.144 · C9/C11 · the v139 file (built from the gridded provincial record read as 05/14 PKT readings: a wrong basis) is
     discarded. data/clim-bias-sites.json is now built from NOAA ISD synop 2017-2025 (daily max / min from the eight synoptic reports,
     ERA5 sampled at the same hours; balo2/c9thr.py), only for the sites whose served value passed leave-one-year-out against the
     current chain, tehsil points within 15 km / 300 m. Test fit 2017-2021, score 2022-2025: within 0.5-4.7 points of the station's
     own threshold, against up to 36 points for ERA5 alone. */
  let CBX = null, cbxAt = 0, CBXU = null;
  const cbxFile = () => { if (CBX === null || Date.now() - cbxAt > 10 * 60e3) { try { const f = join(dataDir, 'clim-bias-sites.json'); CBX = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : false; } catch (_) { CBX = false; } cbxAt = Date.now(); CBXU = new Map(); if (CBX) for (const x of CBX.sites || []) for (const u of x.units || []) if (!CBXU.has(u)) CBXU.set(u, x); } return CBX; };
  function siteShift(unitId, doy) {
    if (!stationData() || process.env.NIGRAAN_CLIM_SITES === '0') return null;
    if (!cbxFile()) return null; const x = CBXU.get(unitId); if (!x) return null; const d = Math.max(0, Math.min(365, doy));
    const v = (k) => Array.isArray(x[k]) && x[k][d] != null ? x[k][d] : 0;
    return { tx90: v('tx90'), tn90: v('tn90'), tn10: v('tn10'), day: v('day'), night: v('night'), mean: Math.round((v('day') + v('night')) / 2 * 100) / 100, source: 'site', site: x.id };
  }
  const siteInfo = () => { const F = cbxFile(); return F ? { version: F.version, built: F.built, units: CBXU ? CBXU.size : 0, test: F.test } : null; };
  const mosShiftC = (unitId, doy) => { const b = basisShift(unitId, doy); return b ? b.day : 0; };
  const nightShiftC = (unitId, doy) => { const b = basisShift(unitId, doy); return b ? b.night : 0; };
  /* opts.raw (v91.17.68): the ERA5 normal on its own basis, no station shift — for an anomaly of an ERA5 observation series (seasverify) */
  /* ══ v91.17.71 · STATION-ANCHORED NORMALS (data/normal-anchor.json, station-lake/scripts/normal_anchor.py) ══════════
     A Gilgit-Baltistan / Chitral tehsil that holds stations gets its monthly temperature normal anchored to them: the
     served ERA5 normal + offset(tehsil, month). Leave-one-station-out [measured, internal]: median absolute error 1.22 C
     against 7.88 C for the ERA5 normal (676 station-months, 20 tehsils); the file is served only while its own test passes
     (serve: true). Such a normal replaces the band basisShift for the mean; the outlook then shows the absolute month
     there (outlook.mjs localMonth). stationData() gate; NIGRAAN_NORMAL_ANCHOR=0 turns it off. */
  let NA = null, naAt = 0;
  const naFile = () => { if (NA === null || Date.now() - naAt > 10 * 60e3) { try { const f = join(dataDir, 'normal-anchor.json'); NA = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : false; } catch (_) { NA = false; } naAt = Date.now(); } return NA; };
  function anchorC(unitId, iso) {
    if (!stationData() || process.env.NIGRAAN_NORMAL_ANCHOR === '0') return null;
    const F = naFile(); if (!F || !F.serve || !F.units) return null; const u = F.units[unitId]; if (!u || !u.tm) return null;
    const v = u.tm[Number(String(iso).slice(5, 7)) - 1]; return v == null ? null : v;
  }
  const anchorInfo = () => { const F = naFile(); return F && F.serve ? { tier: F.tier || 'B', label: label(F.calibrationLabel || 'calibration'), source: label(F.creditLabel || 'network'), version: F.version, built: F.built } : null; };
  function normals(unitId, iso, opts = {}) { const u = AC && AC.units[unitId]; if (!u) return null; const q = doyOf(iso); const s = heightShiftC(unitId); const a = opts.raw ? null : anchorC(unitId, iso); const b = (opts.raw || a != null) ? null : (basisShift(unitId, q) || siteShift(unitId, q)); const m = a != null ? a : (b ? b.mean : 0); return { tm: shT(u.tm[q], s + m), pr: u.pr[q], heightShiftC: s || undefined, basisShiftC: (a == null && m) ? m : undefined, anchorC: a != null ? a : undefined, anchored: a != null, raw: !!opts.raw }; }
  const anomalyReady = () => !!(AC && AC.built);
  function thresholds(unitId, iso, opts = {}) {
    /* opts.raw: no MOS shift — the outlook compares UNCORRECTED ensemble members against percentiles it
       moves onto the IFS basis itself (ensBias), so it must not receive the station correction here */
    const u = C && C.units[unitId]; if (!u) return null; const d = doyOf(iso); const s = heightShiftC(unitId);
    const q = (opts.raw || basisShift(unitId, d)) ? null : siteShift(unitId, d);   /* v91.17.139 · synop station basis, percentile by percentile */
    const m = opts.raw ? 0 : (q ? q.day : mosShiftC(unitId, d)); const n = opts.raw ? 0 : (q ? q.night : nightShiftC(unitId, d));
    return { ...ucOf(unitId, d, s + m), ...uccOf(unitId, d, s + n), tx90: shT(u.tx90[d], s + (q ? q.tx90 : m)), tn90: shT(u.tn90[d], s + (q ? q.tn90 : m)), tn10: shT(u.tn10[d], s + (q ? q.tn10 : n)), pr3_99: u.pr3_99[d], tm95: u.tm95 != null ? shT(u.tm95, s + (m + n) / 2) : null, heightShiftC: s || undefined, basisShiftC: (m || n) ? { day: m, night: n } : undefined };
  }
  /* ══ v91.17.5 · THE LOCAL COLD THRESHOLD HAD NOWHERE TO GO ════════════════
     tn10 — the 10th percentile of daily minimum temperature for this unit on
     this day of year, over the 1991-2020 archive — has existed here since the
     climatology was built, and exactly one consumer used it: the outlook's
     coldSpell. The hazard engine in the browser never saw it, so the cold
     hazard had no local anchor and fell back to one national ramp with a
     seasonal fudge on top. Measured on 18 September: all 576 units scored 0 and
     the layer carried no information at all.

     "Cold" is not an absolute temperature, it is a departure from what is normal
     for that place on that date, and that number is right here. This returns the
     whole national set in one response so the client can join it once. */
  function thresholdsNational(iso) {
    if (!C || !C.built) return { ready: false, why: 'the climatology has not been built yet; POST /api/checks/run?what=climatology' };
    const date = iso || new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);   /* v91.17.34 · the Pakistan day, as every other module */
    const d = doyOf(date);
    const out = {};
    let shifted = 0, mosShifted = 0, siteShifted = 0;
    for (const [unitId, u] of Object.entries(C.units)) {
      const s = heightShiftC(unitId); if (s) shifted++; const q = basisShift(unitId, d) ? null : siteShift(unitId, d); if (q) siteShifted++;   /* v91.17.139 · synop station basis */
      const m = q ? q.day : mosShiftC(unitId, d), n = q ? q.night : nightShiftC(unitId, d); if ((m || n) && !q) mosShifted++;
      out[unitId] = { ...ucOf(unitId, d, s + m), ...uccOf(unitId, d, s + n), tx90: shT(u.tx90[d], s + (q ? q.tx90 : m)), tn90: shT(u.tn90[d], s + (q ? q.tn90 : m)), tn10: shT(u.tn10[d], s + (q ? q.tn10 : n)), pr3_99: u.pr3_99[d], ...(u.tm95 != null ? { tm95: shT(u.tm95, s + (m + n) / 2) } : {}), ...(s ? { heightShiftC: s } : {}), ...((m || n) ? { basisShiftC: { day: m, night: n } } : {}) };
    }
    return {
      ready: true, date, dayOfYear: d, units: Object.keys(out).length,
      basis: ((C.periods && C.periods.tx90) || C.period || '1991-2020') + ' daily archive, percentile taken over a 15-day window centred on this day of year',
      siteShift: siteShifted ? { units: siteShifted, rule: 'percentiles moved onto the station basis where the served value carries the synoptic station calibration: tx90, tn90 and tn10 by the observed-minus-reanalysis percentile difference of the daily maximum / minimum, both from the same eight synoptic hours, 2017-2025 (station calibration, tier B; v91.17.144)' + label('calibration') + ', tier B; v91.17.139)', ...(siteInfo() ? { version: siteInfo().version } : {}) } : null,
      heightShift: shifted ? { units: shifted, rule: 'temperature percentiles moved by -6.5 C/km from the anchor height to the settlement height the sweep now serves (v91.17.37); heightShiftC on each shifted unit' } : null,
      basisShift: mosShifted ? { units: mosShifted, rule: 'mountain percentiles moved onto the basis of the served (station-calibrated) value: tx90/tn90 by the observed-minus-reanalysis daily maximum, tn10 by the observed-minus-reanalysis night, by height band and month (' + label('calibration') + ', tier B; v91.17.71); basisShiftC on each unit' } : null,
      fields: {
        tx90: '90th percentile of daily maximum temperature (°C)',
        tn90: '90th percentile of daily minimum temperature (°C)',
        tn10: '10th percentile of daily minimum temperature (°C) — the local cold anchor',
        pr3_99: '99th percentile of 3-day precipitation total (mm)',
        tm95: '95th percentile of daily mean temperature over every day of the normal period (°C): the T95 of the Excess Heat Factor (Nairn & Fawcett 2015); one value per unit',
        u50: 'median daily maximum shade UTCI for this place and date (°C), 1996-2025 (data/utci-climatology.json)', u90: '90th percentile of daily maximum shade UTCI (°C)', u95: '95th percentile of daily maximum shade UTCI (°C)', c50: 'median daily MINIMUM shade UTCI for this place and date (°C), 1996-2025 (data/utci-cold-climatology.json)', c10: '10th percentile of daily minimum shade UTCI (°C)', c05: '5th percentile of daily minimum shade UTCI (°C)',
      },
      caveat: 'these are climatological percentiles for the place and date, not forecasts and not records. A temperature below tn10 is colder than about nine nights in ten are at this unit at this time of year.',
      thresholds: out,
    };
  }
  /* ══ v91.17.9 · THE DROUGHT LAYER HAD NO NATIONAL INPUT ═══════════════════
     The browser already carries a complete SPI implementation, and it fetches
     a 30-year daily archive per POINT to use it. That runs only when a
     district is selected, so DISTRICT_SPI held at most one entry and the
     national drought layer read null for every unit — the "input missing"
     message the user saw. 576 per-point archive fetches from the browser was
     never going to happen.

     The fits now travel with the climatology (one archive sweep, already paid
     for). What remains is the CURRENT accumulation: 92 days of rain and FAO-56
     ET0 per unit, which is one batched sweep of the forecast endpoint. SPI-30,
     SPI-90, SPEI-30 and SPEI-90 for all 576 units come back in one response.

     A unit whose fit was refused (thin record, too few wet months) returns the
     refusal, not a number. */
  /* ══ v91.17.12 · SOIL WATER PER UNIT, NOT ONE PAIR OF CONSTANTS ══════════
     The browser's FAO-56 root-zone stress ran on SOIL_FC = 0.30 and
     SOIL_WP = 0.10 m3/m3 for the whole country. Measured against the root-zone
     soil moisture this sweep returns: 70 units held MORE water than the
     declared field capacity, which is impossible if 0.30 were field capacity
     there, and 65% of units scored a stress of exactly zero on a term weighted
     0.50 in the drought composite.

     Replaced with ISRIC SoilGrids sand, clay and organic carbon at 15-30 cm
     and 30-60 cm - the depths the root-zone soil moisture is actually measured
     over - through the Saxton & Rawls (2006) pedotransfer, for all 577
     tehsils. Measured across them: field capacity runs 0.198 to 0.401 with a
     median of 0.301, and wilting point 0.089 to 0.273 with a median of 0.163.
     The national field capacity was about right; the national WILTING POINT
     was 63% below the median, which made available water look larger than it
     is and the stress look like zero.

     It travels in this payload so the browser gets it in a fetch it already
     makes, rather than a second request. */
  let SOILW = null;
  try { SOILW = JSON.parse(readFileSync(join(dataDir, 'soil-water.json'), 'utf8')); } catch { SOILW = null; }

  const DTYPE = createDroughtType(dataDir);
  const dFile = join(dataDir, 'drought-national.json');
  let D = null, dBuilding = false, dError = null;
  try { if (existsSync(dFile)) D = JSON.parse(readFileSync(dFile, 'utf8')); } catch { D = null; }

  const SPI_CLASS = (v) => v == null ? null
    : v <= -2 ? 'extreme drought' : v <= -1.5 ? 'severe drought' : v <= -1 ? 'moderate drought'
    : v < -0.5 ? 'mild dry' : v < 0.5 ? 'near normal' : v < 1 ? 'mild wet'
    : v < 1.5 ? 'moderately wet' : v < 2 ? 'very wet' : 'extremely wet';

  /* ══ v91.17.70 · Sprint 1 · SPI / SPEI READ AGAINST THE FIT FOR THE SAME END-PENTAD ═════════════════════════
     The month fits above were fitted to windows ending on the LAST day of the month, and the live window ends on the
     last ERA5 day (mid-month in general): a climatologically normal 30-day window ending mid-June scored SPI -0.73
     [seat_statistics W1]. data/spi-pentad.json (station-lake/scripts/spi_pentad.py) holds a fit per END-PENTAD
     (73 per year, n = 30 each, 1991-2020 ERA5); the live window is read against the fit of the pentad its last day
     falls in. [measured, spi_pentad.py: worst monthly |median bias| of a normal window, see CHANGES_flood_rain.md]
     The month fit remains the fallback where the pentad table is absent. */
  let SPP = null, sppAt = 0;
  function pentadTable() {
    if (Date.now() - sppAt > 10 * 60e3) { sppAt = Date.now(); try { const f = join(dataDir, 'spi-pentad.json'); SPP = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; } catch { SPP = null; } }
    return SPP;
  }
  /* 0-based day of a 365-day year (Feb 29 folds onto Feb 28): the script's calendar. Pentad k fits the windows ending on
     day 5k+2; a live window ending on day e is read against the two pentads whose middle days bracket e, the two CDFs
     mixed linearly by day distance (spi_pentad.py spi_interp, the method its bias test scores). */
  const doy365 = (iso) => { const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z'); if (isNaN(d)) return null; const y = d.getUTCFullYear();
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; let n = Math.floor((d - Date.UTC(y, 0, 1)) / 86400e3); if (leap && n >= 59) n--; return n; };
  const bracket = (e) => { const c = e - 2; if (c < 0) return [72, 0, (c + 365 - 360) / 5]; const k = Math.floor(c / 5); if (k >= 72) return [72, 0, (c - 360) / 5]; return [k, k + 1, (c - 5 * k) / 5]; };
  const gammaH = (f, x) => (!f || f[1] == null || f[2] == null || x == null || !isFinite(x) || x < 0) ? null : f[0] + (1 - f[0]) * (x > 0 ? gammaP(f[1], x / f[2]) : 0);
  const llF = (g, x) => { if (!g || x == null || !isFinite(x)) return null; const d = x - g[2]; if (!(d > 0)) return null; return 1 / (1 + Math.pow(g[0] / d, g[1])); };
  const zOf = (H) => { if (H == null) return null; const z = invNorm(Math.min(0.999999, Math.max(0.000001, H))); return z == null ? null : Math.round(Math.min(3, Math.max(-3, z)) * 100) / 100; };
  function pentadFits(unitId, iso) {
    const T = pentadTable(), u = T && T.units && T.units[unitId], e = doy365(iso); if (!u || e == null) return null;
    const [k0, k1, w] = bracket(e);
    const mix = (arr, fn) => (x) => { if (!arr) return null; const a = fn(arr[k0], x), b = fn(arr[k1], x); return (a == null || b == null) ? null : zOf((1 - w) * a + w * b); };
    const rain = (arr) => { if (!arr || !arr[k0] || !arr[k1] || arr[k0][1] == null || arr[k1][1] == null) return null; const m = (f) => (1 - f[0]) * f[1] * f[2]; return (1 - w) * m(arr[k0]) + w * m(arr[k1]); };
    const fitted = (arr) => !!(arr && arr[k0] && arr[k1] && arr[k0][1] != null && arr[k1][1] != null);
    return { k0, k1, w: Math.round(w * 100) / 100, spi30: mix(u.s30, gammaH), spi90: mix(u.s90, gammaH), spei30: mix(u.e30, llF), spei90: mix(u.e90, llF),
      rm30: rain(u.s30), rm90: rain(u.s90), ok: { s30: fitted(u.s30), s90: fitted(u.s90), e30: !!(u.e30 && u.e30[k0] && u.e30[k1]), e90: !!(u.e90 && u.e90[k0] && u.e90[k1]) } };
  }
  /* ══ v91.17.70 · THE COMBINED DROUGHT CLASS: SPI/SPEI AND SOIL MOISTURE MUST AGREE ══════════════════════════════
     The browser's composite (0.5 x rain-index stress + 0.5 x soil stress, renormalised over the terms that arrived)
     let soil moisture alone carry a class wherever the rain index was refused: under climatology that path fired Act
     1 in 14 windows [seat_statistics W3]. Retired. The class is now the LESS severe of the two indicators' categories
     (US Drought Monitor convergence of evidence, data/drought-class.json): soil alone never sets a class above Low,
     the index alone is capped at Monitor. Climatological firing, both present: Act 1 in 38 to 1 in 368 depending on
     the index-soil correlation [measured, Monte Carlo, drought-class.json]. */
  let DC = null;
  let CHD = null, chdAt = 0;
  function chirpsDrought() {
    if (Date.now() - chdAt > 600e3) { chdAt = Date.now(); try { CHD = JSON.parse(readFileSync(join(dataDir, 'drought-chirps.json'), 'utf8')); } catch { CHD = null; } }
    if (!CHD || !CHD.asOf) return null;
    return (Date.now() - Date.parse(CHD.asOf + 'T00:00:00Z')) / 86400e3 <= 20 ? CHD : null;   /* stale: fall back to the ERA5 indices */
  }
  function droughtTable() { if (DC === null) { try { DC = JSON.parse(readFileSync(join(dataDir, 'drought-class.json'), 'utf8')); } catch { DC = false; } } return DC; }
  const knotScore = (K, x) => { if (x == null || !isFinite(x) || !K || !K.length) return null; const dec = K[0][0] > K[K.length - 1][0];
    if (dec ? x >= K[0][0] : x <= K[0][0]) return K[0][1]; for (let i = 0; i < K.length - 1; i++) { const [a, sa] = K[i], [b, sb] = K[i + 1];
      if (dec ? (x <= a && x >= b) : (x >= a && x <= b)) return Math.round(sa + (sb - sa) * (x - a) / (b - a)); } return K[K.length - 1][1]; };
  function droughtClassOf(rec) {
    const T = droughtTable(); if (!T) return null;
    const v = (x) => x && x.value != null && isFinite(x.value) ? x.value : null;
    /* v91.17.70 · the 90-day index first, then the 30-day one where the 90-day fit is refused (hyper-arid Chagai/Washuk) */
    /* v91.17.101 · audit A1 · the index order is read from data/drought-class.json (indexOrder). SPI-90 now leads: the ERA5 ET0 in the
       water balance runs about +26 mm per 90 days above its 1991-2020 base, so SPEI-90 sat ~0.5 sigma drier than SPI-90 and drove
       26 of 29 alerts. SPEI returns to the front when ET0 comes from the hyperlocal temperature (B3) and passes its check. */
    const ORD = (Array.isArray(T.indexOrder) && T.indexOrder.length) ? T.indexOrder : ['SPI-90', 'SPEI-90', 'SPI-30', 'SPEI-30'];
    const REC = { 'SPEI-90': rec.spei90, 'SPI-90': rec.spi90, 'SPEI-30': rec.spei30, 'SPI-30': rec.spi30 };
    const cand = ORD.map(k => [k, REC[k]]).find(c => v(c[1]) != null);
    const idx = cand ? v(cand[1]) : null, idxName = cand ? cand[0] : null;
    /* v91.17.71 (agent G) · ARID: NO INDEX, NO CLASS. Where every standardised index is refused and the refusal is aridity (the window's
       1991-2020 mean rain under the arid floor, or a record too dry to fit), a drought index has no distribution to stand on
       (McKee et al. 1993; the WMO SPI user guide warns against SPI where the normal is near zero). v91.17.70 gave these units
       class 'Low', which reads as "assessed, no drought"; the defensible answer is that the index is not defined in this climate.
       Measured on the 19 Sep 2026 table: 11 of 576 units (all in Balochistan's hyper-arid belt), every one carrying the arid flag;
       the 18 other arid-flagged units keep a class because another index (SPEI-90, SPEI-30) is defined for them. The soil
       percentile alone never set a class (v91.17.70), so it does not rescue these units either. */
    if (!cand) {
      const W = [rec.spi90, rec.spei90, rec.spi30, rec.spei30];
      const aridWhy = W.some(x => x && (x.arid || /too dry/i.test(String(x.why || ''))));
      if (aridWhy) {
        const T0 = droughtTable() || {};
        const text = (T0.notApplicable && T0.notApplicable.text) || 'Arid climate: drought index not defined';
        return { applicable: false, class: null, score: null, indexScore: null, soilScore: null, index: null, text,
                 rule: text + ': the 1991-2020 record has too little rain in this window for a standardised index' + (rec.spi90 && rec.spi90.climMm != null ? ' (90-day normal ' + rec.spi90.climMm + ' mm)' : ''),
                 scheme: 'data/drought-class.json (USDM convergence of evidence)' };
      }
    }
    const pct = rec.smRoot && rec.smRoot.percentile != null ? rec.smRoot.percentile : null;
    /* v283.36 · NIGRAAN 1.0 · launch item 25 · NO SCORE KNOTS: the class is the published US Drought Monitor category of the index itself
       (data/drought-class.json categories: D1 at -0.8, D2 at -1.3, D3/D4 at -1.6; Svoboda et al. 2002). The soil percentile is a fact beside it
       and never moves the class (the "less severe of two scores" rule ran through untested knots). */
    const CAT = T.categories || {}, b = (c) => (CAT[c] && Number.isFinite(CAT[c].indexAtMost) ? CAT[c].indexAtMost : null);
    const bM = b('Monitor'), bW = b('Watch'), bA = b('Act'); if (bM == null || bW == null || bA == null) return null;
    if (idx == null || !Number.isFinite(idx)) return { applicable: true, class: null, score: null, noData: true, indexScore: null, soilScore: null, index: null, soilPercentile: pct,
      rule: 'no data: no standardised rain index for this unit and window' + (pct != null ? ' (soil percentile ' + pct + ' is a fact; soil alone does not set a drought class)' : ''), scheme: 'data/drought-class.json (US Drought Monitor categories)' };
    const cls = idx <= bA ? 'Act' : idx <= bW ? 'Watch' : idx <= bM ? 'Monitor' : 'Low';
    return { applicable: true, class: cls, score: null, indexScore: null, soilScore: null, index: idxName, indexValue: idx, soilPercentile: pct, usdm: cls === 'Low' ? (idx <= -0.5 ? 'D0 abnormally dry' : 'none') : CAT[cls].usdm,
      rule: idxName + ' ' + idx + ' on the US Drought Monitor categories' + (pct != null ? '; soil percentile ' + pct + ' (a fact)' : ''), scheme: 'data/drought-class.json (US Drought Monitor categories)' };
  }
  /* re-score one stored unit against the pentad fits (the stored `mm` is the window accumulation) and attach the class */
  function rescoreUnit(unitId, rec, asOf) {
    if (!rec) return rec;
    const P = asOf ? pentadFits(unitId, asOf) : null; let out = rec;
    if (P) {
      const ARID_MM = 10, tag = { fit: 'end-pentad', pentads: [P.k0, P.k1], weight: P.w };
      const re = (x, ok, fn, rm, isSpei) => { if (!x || x.mm == null) return x;
        if (!ok) return { value: null, mm: x.mm, ...tag, why: isSpei ? 'SPEI refused for this pentad (no log-logistic fit with beta > 1 that covers the record); SPI carries the unit' : 'the 30-year record is too dry to fit a distribution for this pentad' };
        if (rm != null && rm < ARID_MM) return { value: null, arid: true, mm: x.mm, climMm: Math.round(rm * 10) / 10, ...tag,
          why: 'arid: this window\'s 1991-2020 climatological mean is ' + (Math.round(rm * 10) / 10) + ' mm, under the ' + ARID_MM + ' mm at which a standardised index has a distribution to stand on. Not a drought reading — the index is not defined here.' };
        const val = fn(x.mm);
        if (val == null) return { value: null, mm: x.mm, ...tag, why: isSpei ? 'this water balance lies below the fitted support of the SPEI fit; SPI carries the unit' : 'no SPI for this value' };
        return { value: val, mm: x.mm, class: SPI_CLASS(val), ...tag }; };
      out = { ...rec, spi30: re(rec.spi30, P.ok.s30, P.spi30, P.rm30), spi90: re(rec.spi90, P.ok.s90, P.spi90, P.rm90),
        spei30: re(rec.spei30, P.ok.e30, P.spei30, P.rm30, true), spei90: re(rec.spei90, P.ok.e90, P.spei90, P.rm90, true) };
    }
    return { ...out, drought: droughtClassOf(out) };
  }

  /* ══ v91.17.13 · THREE SOURCES WERE ANSWERING ONE QUESTION ═══════════════
     Measured, and it explains the incoherence this layer has been showing all
     day. The drought score was built from:

       SPI, SPEI      ERA5, 1991-2020, this backend
       soil moisture  the FORECAST model, soil_moisture_9_to_27cm and
                      27_to_81cm - a different model entirely
       field capacity SoilGrids, which describes the real soil

     Three descriptions of the same ground, and the FAO-56 stress is a ratio
     between two of them. That is why 110 units came out below their own
     wilting point and why the relative extractable water ran from -1.13 to
     +1.81 when it is bounded to 0 and 1.

     ERA5 has its own soil layers - 7-28 cm and 28-100 cm - and the archive
     returns them. Measured: 504 hourly values per 21-day request, none null,
     two seconds for three locations. So the current soil moisture and its
     history can both come from ERA5, the same model the precipitation indices
     are fitted on, and the answer becomes a PERCENTILE of that unit's own
     ERA5 record for this time of year.

     A percentile needs no field capacity and no wilting point. It is immune to
     both mismatches, it is what operational soil-moisture drought products
     report, and it sits on the same footing as SPI and SPEI: all three are
     anomalies of ERA5 against ERA5.

     The baseline is a +/-10 day window around the day being scored, over 15
     years - 315 daily values per unit. It is rebuilt when the target day has
     moved more than ten days from the one it was built for. */
  const smFile = join(dataDir, 'soil-moisture-climatology.json');
  let SMC = null, smBuilding = false;
  try { if (existsSync(smFile)) SMC = JSON.parse(readFileSync(smFile, 'utf8')); } catch { SMC = null; }
  const SM_YEARS = 15, SM_WIN = 10;
  const ERA5_SM = ['soil_moisture_7_to_28cm', 'soil_moisture_28_to_100cm'];
  /* depth-weighted to the root zone: 21 cm of the upper layer, 72 cm of the lower */
  const rootZone = (a, b) => (a == null || b == null || !isFinite(a) || !isFinite(b)) ? null : (a * 21 + b * 72) / 93;

  function smcFresh(doy) {
    if (!SMC || !SMC.built || SMC.units == null) return false;
    const d = Math.abs(((SMC.doy - doy + 183 + 366) % 366) - 183);
    return d <= SM_WIN;
  }

  async function buildSoilClimatology(targetIso) {
    if (smBuilding) return { started: false, why: 'already building' };
    if (!provider.configured()) return { started: false, why: 'no paid provider key' };
    const target = targetIso || new Date(Date.now() - 6 * 86400e3).toISOString().slice(0, 10);
    const doy = doyOf(target);
    if (smcFresh(doy)) return { started: false, why: 'the soil-moisture baseline is within ten days of this date', built: SMC.built };
    smBuilding = true; const t0 = Date.now();
    const pool = units.tehsil.filter(u => !u.disputed && u.lat != null);
    const acc = new Map();           /* unitId -> array of daily root-zone means */
    const thisYear = Number(target.slice(0, 4));
    const md = target.slice(4);      /* -MM-DD */
    let requests = 0, failed = 0;
    try {
      for (let i = 0; i < pool.length; i += 25) {
        const b = pool.slice(i, i + 25);
        for (let y = thisYear - SM_YEARS; y < thisYear; y++) {
          const centre = new Date(y + md + 'T00:00:00Z');
          if (isNaN(centre)) continue;
          const start = new Date(centre.getTime() - SM_WIN * 86400e3).toISOString().slice(0, 10);
          const end = new Date(centre.getTime() + SM_WIN * 86400e3).toISOString().slice(0, 10);
          let body;
          try {
            body = await provider.call('archive', '/v1/archive', {
              latitude: b.map(u => u.lat), longitude: b.map(u => u.lon), elevation: b.map(u => u.elevM ?? 'nan'),
              hourly: ERA5_SM, start_date: start, end_date: end, timezone: 'Asia/Karachi', models: 'era5',
            }, { locations: b.length, timeoutMs: 180000 });
            requests++;
          } catch (e) { failed++; lastError = 'soil climatology: ' + e.message; continue; }
          const arr = Array.isArray(body) ? body : [body];
          arr.forEach((loc, k) => {
            const h = loc && loc.hourly; if (!h || !h.time || !b[k]) return;
            const A = h[ERA5_SM[0]], B = h[ERA5_SM[1]];
            const days = new Map();
            for (let j = 0; j < h.time.length; j++) {
              const v = rootZone(A ? A[j] : null, B ? B[j] : null);
              if (v == null) continue;
              const d = h.time[j].slice(0, 10);
              const e = days.get(d) || { s: 0, n: 0 }; e.s += v; e.n++; days.set(d, e);
            }
            let list = acc.get(b[k].unitId); if (!list) { list = []; acc.set(b[k].unitId, list); }
            for (const e of days.values()) if (e.n >= 12) list.push(e.s / e.n);
          });
        }
        if ((i / 25) % 4 === 0) console.log(`  soil climatology: ${i + b.length}/${pool.length} units, ${requests} requests, ${Math.round((Date.now() - t0) / 1000)}s`);
      }
      const out = { built: new Date().toISOString(), builtFor: target, doy, years: SM_YEARS, windowDays: SM_WIN,
        variables: ERA5_SM, depthWeighting: '21 cm of 7-28 and 72 cm of 28-100, so the mean is over 7-100 cm',
        source: 'ERA5 hourly soil moisture, daily-averaged, the same reanalysis the SPI and SPEI baselines are fitted on',
        units: {} };
      for (const [unitId, list] of acc) {
        if (list.length < 100) continue;
        list.sort((a, b2) => a - b2);
        const q = (f) => +list[Math.min(list.length - 1, Math.round((list.length - 1) * f))].toFixed(4);
        out.units[unitId] = { n: list.length, p: [q(0), q(0.02), q(0.05), q(0.1), q(0.2), q(0.3), q(0.4), q(0.5),
                                                 q(0.6), q(0.7), q(0.8), q(0.9), q(0.95), q(0.98), q(1)] };
      }
      out.percentileBreaks = [0, 2, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 100];
      out.seconds = Math.round((Date.now() - t0) / 1000);
      const kept = Object.keys(out.units).length;
      if (kept < pool.length * 0.9) {
        lastError = `soil-moisture baseline kept only ${kept} of ${pool.length} units; not written`;
        console.error('  ' + lastError);
        return { started: true, kept, written: false, why: lastError };
      }
      writeFileSync(smFile, JSON.stringify(out)); SMC = out;
      console.log(`  soil climatology: ${kept} units, ${requests} requests, ${failed} failed, ${out.seconds}s`);
      return { started: true, kept, requests, failed, seconds: out.seconds, written: true };
    } finally { smBuilding = false; }
  }

  /* percentile of a value against that unit's own ERA5 record, linear between
     the stored breakpoints. Returns null rather than a guess outside them. */
  function soilPercentile(unitId, value) {
    if (!SMC || !SMC.units || value == null || !isFinite(value)) return null;
    const u = SMC.units[unitId]; if (!u) return null;
    const P = u.p, B = SMC.percentileBreaks;
    /* ══ v91.17.36 · A TIE IS NOT AN EXTREME ═══════════════════════════════════
       MEASURED: Chagai's September baseline is [0,0,0,0,0,0.0015,...] — ERA5 holds
       zero soil moisture for the 0th to 20th percentile of the record, Taftan to
       the 60th. A live 0.000 fell on `value <= P[0]` and read "percentile 0",
       the driest the unit has ever been, when it is the most ordinary state the
       record holds. A value inside a tied block takes the block's mid-rank; a
       block wider than 20 percentile points has no resolution to offer and the
       percentile is refused rather than reported. */
    if (value <= P[0]) {
      let j = 0; while (j + 1 < P.length && P[j + 1] <= P[0]) j++;
      if (j === 0) return 0;
      if (B[j] - B[0] > 20) return null;
      return Math.round((B[0] + B[j]) / 2);
    }
    if (value >= P[P.length - 1]) return 100;
    for (let i = 0; i < P.length - 1; i++) {
      if (value >= P[i] && value <= P[i + 1]) {
        const span = P[i + 1] - P[i];
        const f = span > 0 ? (value - P[i]) / span : 0;
        return Math.round(B[i] + f * (B[i + 1] - B[i]));
      }
    }
    return null;
  }
  const soilClimStatus = () => ({ ready: !!(SMC && SMC.built), built: SMC && SMC.built, builtFor: SMC && SMC.builtFor,
    years: SMC && SMC.years, windowDays: SMC && SMC.windowDays, units: SMC ? Object.keys(SMC.units).length : 0,
    building: smBuilding });

  async function buildDroughtNational(force) {
    if (dBuilding) return { started: false, why: 'already building' };
    if (!ready()) return { started: false, why: 'the 1991-2020 climatology has not been built yet' };
    if (!provider.configured()) return { started: false, why: 'no paid provider key' };
    const fresh = D && D.built && (Date.now() - Date.parse(D.built) < 6 * 3600e3);
    if (fresh && !force) return { started: false, why: 'current table is less than 6 hours old', built: D.built };
    dBuilding = true; const t0 = Date.now();
    const pool = units.tehsil.filter(u => !u.disputed && u.lat != null);
    const next = { built: null, asOf: null, units: {} };
    let got = 0;
    try {
      for (let i = 0; i < pool.length; i += 25) {
        const b = pool.slice(i, i + 25);
        /* ══ v91.17.9 · THE CURRENT WINDOW COMES FROM THE SAME MODEL AS THE FIT ══
           First attempt used /v1/forecast with past_days: 92. Measured: that
           endpoint returns nulls for the first 41 of those 93 days — it holds
           about 52 days of past data — so SPI-90 and SPEI-90 refused for all
           576 units while SPI-30 worked. The 90-day window is not available
           there at all.

           The archive is, and it is also the RIGHT source: the baselines were
           fitted on ERA5 1991-2020, and an index is only meaningful when the
           current accumulation is measured the same way the distribution was.
           'best_match' would fill the last five days from the IFS and close the
           lag, at the cost of mixing two reanalyses inside one index — which is
           the exact reason this build's own client code excluded SPEI from the
           drought composite ("needs log-logistic + consistent ET0 source to
           trust"). ERA5 it is, and the window ends on the last day ERA5 holds,
           about five days back. A five-day lag on a 90-day drought index is not
           a limitation worth trading model consistency for. */
        const isoAgo = (n) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);
        let body;
        try {
          body = await provider.call('archive', '/v1/archive', {
            latitude: b.map(u => u.lat), longitude: b.map(u => u.lon), elevation: b.map(u => u.elevM ?? 'nan'),
            daily: ['precipitation_sum', 'et0_fao_evapotranspiration'],
            start_date: isoAgo(104), end_date: isoAgo(1), timezone: 'Asia/Karachi', models: 'era5',
          }, { locations: b.length, timeoutMs: 240000 });
        } catch (e) { dError = e.message; continue; }
        /* ── root-zone soil moisture, the field the national sweep never asked for ──
           The browser's own field registry carries this as an HONEST GAP:
           "sweep requests soil_moisture 0-1cm and 1-3cm only; root zone needs
           9-27cm and 27-81cm". FAO-56 root-zone stress is weighted 0.60 in the
           drought composite and had no national input because of it. Two
           hourly variables for one day is a cheap second call, so it is made
           here rather than left as a gap. A failure leaves smRoot null and the
           composite falls back to the precipitation indices alone. */
        /* ══ v91.17.13 · ERA5, LIKE EVERYTHING ELSE ON THIS SCORE ═════════════
           This asked the FORECAST model for soil_moisture_9_to_27cm and
           27_to_81cm while SPI and SPEI were fitted on ERA5. Two models on one
           score, and the FAO-56 stress was a ratio between the forecast
           model's water content and SoilGrids' field capacity - a third
           description again. ERA5's own layers are 7-28 and 28-100 cm and the
           archive returns them, so the current value now comes from the same
           reanalysis as its own history and as the rain indices beside it.
           The window ends where the precipitation window ends, about five days
           back, which is the price of consistency and is nothing on a
           soil-moisture anomaly. */
        let smBody = null;
        try {
          smBody = await provider.call('archive', '/v1/archive', {
            latitude: b.map(u => u.lat), longitude: b.map(u => u.lon), elevation: b.map(u => u.elevM ?? 'nan'),
            hourly: ERA5_SM, start_date: isoAgo(12), end_date: isoAgo(1),
            timezone: 'Asia/Karachi', models: 'era5',
          }, { locations: b.length, timeoutMs: 180000 });
        } catch (e) { dError = 'root-zone soil moisture: ' + e.message; smBody = null; }
        const smArr = smBody ? (Array.isArray(smBody) ? smBody : [smBody]) : [];
        (Array.isArray(body) ? body : [body]).forEach((loc, k) => {
          const d = loc && loc.daily; if (!d || !d.time) return;
          const unitId = b[k].unitId, fit = C.units[unitId]; if (!fit) return;
          /* the last day ERA5 actually holds BOTH fields for: the request runs to
             yesterday and the tail comes back null until the reanalysis catches
             up, so the window end is found rather than assumed. */
          let end = d.time.length - 1;
          while (end >= 0 && (d.precipitation_sum[end] == null || !isFinite(d.precipitation_sum[end])
                           || d.et0_fao_evapotranspiration[end] == null || !isFinite(d.et0_fao_evapotranspiration[end]))) end--;
          if (end < 89) return;
          const mo = Number(d.time[end].slice(5, 7)) - 1;
          const sum = (span, arr) => {
            if (end - span + 1 < 0) return null;
            let t = 0, miss = 0;
            for (let j = end - span + 1; j <= end; j++) {
              const v = arr ? arr[j] : null;
              if (v == null || !isFinite(v)) miss++; else t += v;
            }
            /* v91.17.157 · audit: up to 10 % missing days are infilled at the window's own daily mean (sum x span / present), not read as 0 mm,
               which put a 90-day total with 9 missing monsoon days ~36 mm low and the index drier than it was */
            return miss > span * 0.1 ? null : t * span / (span - miss);
          };
          const p30 = sum(30, d.precipitation_sum), p90 = sum(90, d.precipitation_sum);
          const e30 = sum(30, d.et0_fao_evapotranspiration), e90 = sum(90, d.et0_fao_evapotranspiration);
          /* v91.17.38 · ANTECEDENT PRECIPITATION INDEX. API_tau = sum_k P(end-k) e^(-k/tau), k >= 1: the wetness
             the ground carries into today, decaying with tau (5 d for a slope, 15 d for a catchment). A shared
             derived variable for landslide, pluvial and drought engines; nothing reads it as a hazard by itself.
             Also the 7-day total, the plain antecedent figure the WMO flash-flood guidance uses. */
          const apiOf = (tau) => { let t = 0, n = 0, wAll = 0, wHave = 0; for (let k = 1; k <= 60; k++) { const w = Math.exp(-k / tau); wAll += w; if (end - k < 0) continue; const v = d.precipitation_sum[end - k]; if (v == null || !isFinite(v)) continue; t += v * w; wHave += w; n++; } return (n >= 54 && wHave > 0) ? Math.round(t * wAll / wHave * 10) / 10 : null; };   /* v91.17.161 · >= 90 % of the 60 days, infilled by weight (a missing recent day weighs most) */
          const api = { api5Mm: apiOf(5), api15Mm: apiOf(15), p7Mm: sum(7, d.precipitation_sum), asOf: d.time[end], basis: 'ERA5 daily rain at the tehsil point; API_tau = sum over the 60 days before asOf of P(k) e^(-k/tau)' };
          const fS = fit.spi || null, fE = fit.spei || null;
          /* ══ v91.17.36 · ARID MASK · AN INDEX NEEDS A DISTRIBUTION TO BE INSIDE OF ══
             MEASURED on 2026-09-22: Chagai's September 90-day baseline is a gamma with
             shape 0.136 and scale 22.3 mm — a climatological mean of 3 mm. ERA5 gave
             0.0 mm for the 91 days to 16 September (and 0.0 for the same window of
             2025). Zero against a 3 mm mean sits at H = 1e-6 and clamps to SPI -3,
             "extreme drought"; SPEI fell below its fitted support and clamped the same
             way; the composite reached 100 and the priority board put a desert at Act.
             20 tehsils had 0 mm over 90 days and 72 had SPEI clamped at -3, all in the
             western arid belt. WMO's SPI guidance (Svoboda, Hayes & Wood 2012) and
             Wu et al. (2007) both say the index is not defined where the window's
             climatology is near zero: the gamma has no body to measure against. The
             rule here: where the fitted climatological mean of the window — (1-q) x
             shape x scale — is under ARID_MM, SPI and SPEI for that window are refused
             and say why. The rain mean governs SPEI too, because where rain is
             negligible SPEI is only ET0 with a minus sign, and a hot September is not
             a drought. The refusal renormalises the client composite over the terms
             that remain; where none remain the unit reads "arid — index not
             defined" instead of Act. */
          const ARID_MM = 10;
          const rainMean = (f) => (f && f.a != null && f.b != null) ? (1 - (f.q || 0)) * f.a * f.b : null;
          const pack = (val, f, acc, rm) => {
            if (acc == null) return { value: null, why: 'the 92-day window is more than 10% incomplete for this unit' };
            if (!f) return { value: null, why: 'no baseline fit for this unit and month' };
            if (f.a == null) return { value: null, why: f.why || 'the 30-year record is too dry to fit a distribution for this month' };
            if (rm != null && rm < ARID_MM) return { value: null, arid: true, mm: Math.round(acc * 10) / 10, climMm: Math.round(rm * 10) / 10,
              why: 'arid: this window\'s 1991-2020 climatological mean is ' + (Math.round(rm * 10) / 10) + ' mm, under the ' + ARID_MM
                 + ' mm at which a standardised index has a distribution to stand on. Not a drought reading — the index is not defined here.' };
            return { value: val, mm: Math.round(acc * 10) / 10, class: SPI_CLASS(val) };
          };
          /* v91.17.70 · stored against the month fit as before; droughtNational() re-scores every unit against the two
             end-pentad fits that bracket asOf (rescoreUnit), which is what is served */
          const f30 = fS && fS.m30 ? fS.m30[mo] : null, f90 = fS && fS.m90 ? fS.m90[mo] : null;
          const rm30 = rainMean(f30), rm90 = rainMean(f90);
          const g30 = fE && fE.m30 ? fE.m30[mo] : null, g90 = fE && fE.m90 ? fE.m90[mo] : null;
          const d30 = (p30 == null || e30 == null) ? null : p30 - e30;
          const d90 = (p90 == null || e90 == null) ? null : p90 - e90;
          /* root zone = depth-weighted mean of the 9-27 cm (18 cm) and
             27-81 cm (54 cm) layers, taken at the current hour. Both are m3/m3. */
          /* the daily mean of the last complete ERA5 day, not one hour: a
             single hour of a reanalysis soil field is noise against a
             percentile built from daily means. */
          let smRoot = null, smAt = null;
          const sh = smArr[k] && smArr[k].hourly;
          if (sh && sh.time) {
            const days = new Map();
            for (let j = 0; j < sh.time.length; j++) {
              const v = rootZone(sh[ERA5_SM[0]] ? sh[ERA5_SM[0]][j] : null, sh[ERA5_SM[1]] ? sh[ERA5_SM[1]][j] : null);
              if (v == null) continue;
              const d = sh.time[j].slice(0, 10);
              const e = days.get(d) || { s: 0, n: 0 }; e.s += v; e.n++; days.set(d, e);
            }
            const dates = [...days.keys()].sort();
            for (let j = dates.length - 1; j >= 0; j--) {
              const e = days.get(dates[j]);
              if (e.n >= 20) { smRoot = Math.round(e.s / e.n * 1000) / 1000; smAt = dates[j]; break; }
            }
          }
          next.units[unitId] = {
            api,
            spi30: pack(spiFrom(f30, p30), f30, p30, rm30),
            spi90: pack(spiFrom(f90, p90), f90, p90, rm90),
            spei30: pack(speiFrom(g30, d30), g30, d30, rm30),
            spei90: pack(speiFrom(g90, d90), g90, d90, rm90),
            smRoot: smRoot == null
              ? { value: null, why: 'the root-zone soil moisture request did not return for this unit' }
              : { value: smRoot, at: smAt, layers: 'ERA5 7-28 cm and 28-100 cm, depth-weighted, daily mean', unit: 'm3/m3',
                  percentile: soilPercentile(unitId, smRoot),
                  percentileWhy: (soilPercentile(unitId, smRoot) == null && SMC && SMC.units && SMC.units[unitId])
                    ? 'refused: ERA5 holds this same value for more than 20 percentile points of this unit\'s seasonal record (a tied block, typically zero soil moisture in the arid belt), so no rank can be assigned. The soil term is dropped from the composite rather than read as an extreme.'
                    : undefined,
                  percentileBasis: SMC && SMC.built
                    ? ('percentile of this unit\'s own ERA5 record for this time of year: ' + SMC.years
                       + ' years, a +/-' + SMC.windowDays + ' day window around ' + SMC.builtFor
                       + '. No field capacity and no wilting point enter it, so neither soil-description mismatch can.')
                    : 'the soil-moisture baseline has not been built yet; POST /api/checks/run?what=soil-climatology' },
            soilWater: (SOILW && SOILW.d && SOILW.d[unitId]) ? SOILW.d[unitId]
              : { fc: null, wp: null, why: 'no SoilGrids texture for this unit; the national constants apply and the stress here is the least local part of the drought score' },
          };
          next.asOf = d.time[end];
          got++;
        });
      }
      if (got > pool.length * 0.9) {
        next.built = new Date().toISOString(); next.seconds = Math.round((Date.now() - t0) / 1000);
        const tmp = dFile + '.tmp';
        writeFileSync(tmp, JSON.stringify(next)); try { renameSync(tmp, dFile); } catch { writeFileSync(dFile, JSON.stringify(next)); }
        D = next; dError = null;
        console.log(`  drought: SPI/SPEI for ${got} tehsils as of ${next.asOf} in ${next.seconds}s`);
        return { started: true, units: got, asOf: next.asOf, seconds: next.seconds };
      }
      return { started: true, units: got, why: `only ${got} of ${pool.length} units returned; table not replaced`, lastError: dError };
    } finally { dBuilding = false; }
  }

  const _J176c = {};
  function droughtNational() {
    if (!ready()) return { ready: false, why: 'the 1991-2020 climatology has not been built yet; POST /api/checks/run?what=climatology' };
    if (!D || !D.built) return { ready: false, building: dBuilding, why: 'the national SPI/SPEI table has not been built yet; POST /api/checks/run?what=drought', lastError: dError };
    /* v91.17.70 · every unit re-scored against its end-pentad fit, with the combined drought class attached */
    const U = {}; for (const [k, rec] of Object.entries(D.units)) U[k] = rescoreUnit(k, rec, D.asOf);
    /* v91.17.100 · the rain behind the index is CHIRPS v3 (data/drought-chirps.json, station-lake/scripts/drought_chirps.py), not ERA5:
       tested against gauges first (reports/drought_source_test.json: plains SPI-3 r 0.48 ERA5 -> 0.67 CHIRPS; 2026 monsoon ERA5 read
       0.27-0.58x the satellite rain in Balochistan, Sindh, Punjab and Islamabad). The ERA5 indices are kept beside it (era5) for the
       operator. Units above the provisional height carry provisional: no rain product was verified there. */
    const CH = chirpsDrought();
    /* v91.17.167 · MONTH TO MONTH (CEO 5 Oct): the drought class reads the latest complete CALENDAR month - SPI-3 / SPEI-3 in the 90-day
       slot, SPI-1 / SPEI-1 in the 30-day slot, each fitted on the 30 same-month values of 1991-2020 - the basis the source test was run
       on (calendar-month totals and SPI-3 against gauges) and the one monthly bulletins use (WMO-No. 1090). The month before is carried
       with its rain-index category, so the change from last month is stated. The rolling 30/90-day pentad indices stay under `rolling`. */
    const MB = CH && CH.monthBasis;
    const MLAB = { 'SPI-90': 'SPI-3', 'SPEI-90': 'SPEI-3', 'SPI-30': 'SPI-1', 'SPEI-30': 'SPEI-1' };
    const monName = (ym) => { const [y, m] = String(ym).split('-').map(Number); return ['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1] + ' ' + y; };
    const idxCat = (m) => { const T = droughtTable(); if (!T || !m) return null; const ORD = (Array.isArray(T.indexOrder) && T.indexOrder.length) ? T.indexOrder : ['SPI-90', 'SPEI-90', 'SPI-30', 'SPEI-30'];
      const R = { 'SPI-90': m.spi3, 'SPEI-90': m.spei3, 'SPI-30': m.spi1, 'SPEI-30': m.spei1 }; const c = ORD.map(k => [k, R[k]]).find(x => x[1] && x[1].value != null); if (!c) return null;
      const v = c[1].value, C = T.categories || {}; const cls = v <= C.Act.indexAtMost ? 'Act' : v <= C.Watch.indexAtMost ? 'Watch' : v <= C.Monitor.indexAtMost ? 'Monitor' : 'Low';
      return { index: MLAB[c[0]], value: v, class: cls }; };
    const RANK = { Low: 0, Monitor: 1, Watch: 2, Act: 3 };
    if (CH) for (const [k, u] of Object.entries(U)) { const c = CH.units[k]; if (!c) continue;
      const mm = MB && c.monthly && c.monthly.month, pm = MB && c.monthly && c.monthly.prev;
      const rec2 = mm ? { ...u, spi30: mm.spi1, spi90: mm.spi3, spei30: mm.spei1, spei90: mm.spei3, rainSource: 'CHIRPS v3', rainAsOf: CH.asOf, rainPrelim: !!MB.prelim,
          month: { basis: 'calendar month', month: MB.month, label: monName(MB.month), prelim: !!MB.prelim, prev: MB.prev, prevLabel: monName(MB.prev) },
          rolling: { spi30: c.spi30, spi90: c.spi90, spei30: c.spei30, spei90: c.spei90, asOf: CH.asOf },
          era5: { spi30: u.spi30, spi90: u.spi90, spei30: u.spei30, spei90: u.spei90, drought: u.drought } }
        : { ...u, spi30: c.spi30, spi90: c.spi90, spei30: c.spei30, spei90: c.spei90, rainSource: 'CHIRPS v3', rainAsOf: CH.asOf, rainPrelim: CH.prelim,
          era5: { spi30: u.spi30, spi90: u.spi90, spei30: u.spei30, spei90: u.spei90, drought: u.drought } };
      let dc = droughtClassOf(rec2);
      if (dc && mm) { dc = { ...dc, index: dc.index ? MLAB[dc.index] || dc.index : dc.index, rule: String(dc.rule || '').replace(/\b(SPEI|SPI)-(90|30)\b/g, (x) => MLAB[x] || x).replace(/^/, monName(MB.month) + ': ').replace(/soil percentile/g, 'soil percentile today') };
        const now = idxCat(mm), before = idxCat(pm);
        if (now && before) dc.change = { from: before.class, to: now.class, fromIndex: before.index + ' ' + before.value, toIndex: now.index + ' ' + now.value, month: monName(MB.month), prevMonth: monName(MB.prev),
          word: RANK[now.class] > RANK[before.class] ? 'rainfall drier than last month' : RANK[now.class] < RANK[before.class] ? 'rainfall wetter than last month' : 'rainfall in the same category as last month', basis: 'rain-index category (the soil percentile is not held for last month)' }; } rec2.drought = dc && c.provisional ? { ...dc, provisional: true, provisionalWhy: 'high valley: no rain record verified against gauges here (' + CH.provisionalRule + ')' } : dc;
      U[k] = rec2; }
    /* v91.17.176 · THE DROUGHT LAYER'S OTHER VIEWS travel beside the class, they never change it (data/drought-backtest.json: vegetation
       did not improve the class against rain-fed wheat yields and documented droughts, so it is a view, not a term).
       veg     weekly vegetation health per tehsil (app.vegetation, Kogan classes)
       snow    30-day snow water percentile (data/era5land-recent.json sdPct; null where the season holds no snow)
       outlook rain-index band at the end of the next three pentads (data/drought-outlook.json), only if its replay test passed */
    const J176 = (name) => { try { const f = join(dataDir, name); if (!existsSync(f)) return null; const mt = statSync(f).mtimeMs; const c = J176.c[name];
      if (c && c.mt === mt) return c.v; const v = JSON.parse(readFileSync(f, 'utf8')); J176.c[name] = { mt, v }; return v; } catch (_) { return null; } };
    J176.c = _J176c;   /* v91.17.283.51 · B1: the parsed files are kept between calls (same file mtime: same object; each call parsed four files, 0.8 MB) */
    const OUTL = J176('drought-outlook.json'), REC = J176('era5land-recent.json'), WATER = J176('drought-water.json'), BT = J176('drought-backtest.json');
    /* v91.17.274 · the outlook is gated PER ISSUE MONTH (scripts/drought274/outlook_months.py, data/drought-outlook-test-months.json):
       v270 gate per calendar month, held-out windows 2015-2019 and 2021-2025 against persistence. Where the CHIRPS3-GEFS monthly score is
       held (laptop run), its passed months decide; until then the pooled GEFS pass AND the month's climatology-fill pass are both required
       (the fill is the GEFS forecast's own baseline, which it beat pooled; months where even the fill loses to persistence are not shown). */
    const OM = J176('drought-outlook-test-months.json');
    const issueMonth = OUTL && OUTL.issued ? String(OUTL.issued).slice(5, 7) : null;
    const monthGate = !OM ? { basis: 'pooled replay only (no monthly gate file)', passed: true }
      : Array.isArray(OM.passedMonths) ? { basis: 'CHIRPS3-GEFS monthly replay', month: issueMonth, passed: OM.passedMonths.includes(issueMonth) }
      : { basis: 'pooled CHIRPS3-GEFS replay + climatology-fill monthly replay (GEFS monthly score pending)', month: issueMonth, passed: Array.isArray(OM.passedMonthsClimFill) && OM.passedMonthsClimFill.includes(issueMonth) };
    /* v91.17.274 · an outlook whose valid-to day has passed is not an outlook: it is not shown (the 1 Oct issue was still served on 17 Oct) */
    const todayPk = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
    const outlookStale = !!(OUTL && OUTL.validTo && String(OUTL.validTo) < todayPk);
    const outlookOn = !!(OUTL && OUTL.passed && monthGate.passed && !outlookStale);
    for (const [k, u] of Object.entries(U)) {
      try { const v = app.vegetation ? app.vegetation.unit(k) : null; if (v && v.vhi != null) u.veg = { vhi: v.vhi, level: v.level, word: v.word, week: v.week, canalFed: v.canal ? !!v.canal.canalFed : null }; } catch (_) {}
      const r = REC && REC.units ? REC.units[k] : null; if (r && r.sdPct != null) u.snow = { sdPct: r.sdPct, sdMmNow: r.sdMmNow, asOf: REC.to };
      const o = outlookOn && OUTL.units ? OUTL.units[k] : null; if (o) u.outlook = { trend: o.trend, spi90Now: o.spi90Now, spi90Outlook: o.spi90Outlook, bandNow: o.bandNow, bandOutlook: o.bandOutlook, rainNext15Mm: o.rainNext15Mm, normalNext15Mm: o.normalNext15Mm, validTo: OUTL.validTo };
    }
    /* v91.17.274 · drought type per tehsil, from the index the level used (same order and month basis) */
    let types = null;
    try {
      const T0 = droughtTable(); const ORD = (T0 && Array.isArray(T0.indexOrder) && T0.indexOrder.length) ? T0.indexOrder : ['SPI-90', 'SPEI-90', 'SPI-30', 'SPEI-30'];
      const idx = (u) => { const R = { 'SPI-90': u.spi90, 'SPEI-90': u.spei90, 'SPI-30': u.spi30, 'SPEI-30': u.spei30 };
        const c = ORD.map(k => [k, R[k]]).find(x => x[1] && x[1].value != null && isFinite(x[1].value)); return c ? { name: (u.month && MLAB[c[0]]) || c[0], value: c[1].value } : null; };
      types = DTYPE.attach(U, { water: WATER, recent: REC, outlook: OUTL, outlookOn, idx });
    } catch (_) { types = null; }
    const views = {
      types,
      outlook: OUTL ? { shown: outlookOn, issued: OUTL.issued, validTo: OUTL.validTo, lastObservedPentad: OUTL.lastObservedPentad, counts: OUTL.counts, test: OUTL.test, method: OUTL.method, source: OUTL.source,
        monthGate: OM ? { ...monthGate, rule: OM.rule, passedMonths: OM.passedMonths, passedMonthsClimFill: OM.passedMonthsClimFill, gefsIssues: OM.gefsIssues } : monthGate,
        stale: outlookStale,
        why: outlookOn ? null : outlookStale ? 'the latest 15-day outlook (issued ' + OUTL.issued + ') ran to ' + OUTL.validTo + ', which has passed; a new issue is awaited' : !OUTL.passed ? 'the 15-day outlook did not pass its replay test (data/drought-outlook-test.json), so it is not shown'
          : 'the 15-day outlook did not pass its replay test for issues in this calendar month (data/drought-outlook-test-months.json), so it is not shown' } : { shown: false, why: 'no outlook file yet (station-lake/scripts/drought_outlook.py)' },
      water: WATER ? { asOf: WATER.asOf, method: WATER.method, check: WATER.check, caveat: WATER.caveat, source: WATER.source, rivers: WATER.rivers } : null,
      snow: REC ? { asOf: REC.to, method: (REC.fields || {}).sdPct || null } : null,
      backtest: BT ? { T1: BT.T1, T2: BT.T2, decision: BT.decision, rule: BT.rule } : null,
      bands: { rain: 'U.S. Drought Monitor SPI ranges: D0 -0.5, D1 -0.8, D2 -1.3, D3 -1.6, D4 -2.0 (Svoboda et al. 2002)', soil: 'U.S. Drought Monitor percentiles: D0 30, D1 20, D2 10, D3 5, D4 2', crops: 'Kogan (1995, 2002) vegetation health classes: under 40 mild, 30 moderate, 20 severe, 10 extreme', water: 'river flow and snow water percentiles on the U.S. Drought Monitor bands' },
    };
    const covered = Object.values(U).filter(u => u.spi90 && u.spi90.value != null).length;
    const byClass = { Act: 0, Watch: 0, Monitor: 0, Low: 0, noData: 0 }; Object.values(U).forEach(u => { if (u.drought && u.drought.noData) byClass.noData++; else if (u.drought && byClass[u.drought.class] != null) byClass[u.drought.class]++; });
    return {
      ready: true, built: D.built, asOf: CH ? CH.asOf : D.asOf, month: CH && CH.monthBasis ? { ...CH.monthBasis, label: monName(CH.monthBasis.month), prevLabel: monName(CH.monthBasis.prev) } : null, era5AsOf: D.asOf, rainSource: CH ? { name: 'CHIRPS v3.0', asOf: CH.asOf, lastPentad: CH.lastPentad, prelim: CH.prelim, source: CH.source, method: CH.method, test: CH.test, provisionalRule: CH.provisionalRule } : { name: 'ERA5', why: 'data/drought-chirps.json missing or older than 20 days' }, units: Object.keys(D.units).length, withSpi90: covered,
      method: {
        spi: 'McKee, Doesken & Kleist (1993). Two-parameter gamma fitted by Thom (1958) maximum likelihood to the 30 accumulations of 1991-2020 ending on the same end-pentad as the live window (v91.17.70; month-ending windows only where data/spi-pentad.json is absent) for this unit and calendar month, mixed with the zero-rain probability q: H(x) = q + (1-q)G(x). SPI is the standard-normal quantile of H.',
        spei: 'Vicente-Serrano, Begueria & Lopez-Moreno (2010). Three-parameter log-logistic fitted by probability-weighted moments to the same accumulations of the climatic water balance P - ET0, with ET0 from FAO-56 Penman-Monteith. SPEI is the standard-normal quantile of its CDF.',
        baseline: '1991-2020 ERA5 daily, one accumulation per year per calendar month (30 samples per month, per window).',
        current: 'ERA5 daily rainfall and FAO-56 ET0 over the 104 days ending yesterday, truncated to the last day the reanalysis holds both fields - about five days back. The same model and the same variables the 1991-2020 fits were built from; the alternative, closing the five-day lag with a different model for the tail, would put two reanalyses inside one index.',
        soilWater: (SOILW ? (SOILW.src + '. ' + SOILW.method + '. Coverage: ' + SOILW.coverage + '.') : 'not present in this build'),
        soilWaterCaveat: 'A KNOWN INCONSISTENCY, stated rather than hidden. The root-zone soil moisture is ERA5, which carries its own soil texture and its own hydraulics, so its volumetric water content is strictly comparable only with ITS field capacity and wilting point. These come from SoilGrids, which describes the real soil. Pairing the two is better grounded than the single pair of constants it replaces - 0.30 and 0.10 m3/m3 nationally, which describe no soil anywhere and which 70 units exceeded - but it is not the same soil description on both sides, and the stress can therefore be biased where the two disagree most. Closing it properly needs ERA5 field capacity and wilting point per grid cell, which this build does not hold. Measured effect of the change: units scoring exactly zero stress fell from 360 to 311, and the severe band went from 10 units to 44.',
        smRoot: 'root-zone volumetric soil moisture at the current hour, the depth-weighted mean of the 9-27 cm and 27-81 cm model layers. This is the input FAO-56 root-zone stress needs; the national forecast sweep requests only 0-1 cm and 1-3 cm, which is why the browser carried it as an unavailable field.',
        refusals: 'a unit is returned with value null and a stated reason where the 30-year record is too thin or too dry to fit, or where more than 10% of the current window is absent. No default is substituted.',
      },
      classes: '<= -2 extreme, <= -1.5 severe, <= -1 moderate drought; -1 to -0.5 mild dry; -0.5 to 0.5 near normal',
      fit: pentadTable() ? 'end-pentad (data/spi-pentad.json, built ' + pentadTable().built + '): the live window is read against the fits of the two end-pentads that bracket its last day (30 windows of 1991-2020 each), their CDFs mixed by day distance' : 'calendar month (month-end windows); data/spi-pentad.json absent',
      droughtClass: { levels: ['Low', 'Monitor', 'Watch', 'Act'], byClass, rule: droughtTable() ? droughtTable().method : null, scheme: droughtTable() ? droughtTable().categories : null, firing: droughtTable() ? droughtTable().firingFrequency : null },
      caveat: 'SPI and SPEI are meteorological drought indices. They describe the rainfall and water-balance anomaly, not soil moisture, crop condition, reservoir storage or water supply, and a -2 on a 30-day window in a dry month can be a small absolute deficit.',
      views,
      spi: U,
    };
  }
  const droughtStatus = () => ({ ready: !!(D && D.built), built: D && D.built, asOf: D && D.asOf, units: D ? Object.keys(D.units).length : 0, building: dBuilding, lastError: dError });

  /* v91.17.270 · OPS A8 · what a rebuild would spend (weighted calls), from the same request shape build() / buildAnomaly() send */
  function estimateWeight(what) {
    const pool = units.tehsil.filter(u => !u.disputed && u.lat != null);
    const [n0, n1] = yrs(NORMAL_PERIOD), [s0, s1] = yrs(SPI_PERIOD); const f0 = Math.min(n0, s0), f1 = Math.max(n1, s1);
    const q = what === 'anomaly' ? { daily: 'temperature_2m_mean,precipitation_sum', start_date: '1993-01-01', end_date: '2016-12-31' }
      : { daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration', start_date: f0 + '-01-01', end_date: f1 + '-12-31' };
    return Math.round(weightOf((k) => q[k], pool.length));
  }
  const ready = () => !!(C && C.built);
  const status = () => ({ ready: ready(), built: C && C.built, period: C && C.period, tehsils: C ? Object.keys(C.units).length : 0, building, progress, lastError });
  /* v91.17.266 · the period of the daily normals normals() serves (data/anomaly-climate.json), for the past-30-days source line */
  const anomalyPeriod = () => (AC && AC.period) || null;
  return { estimateWeight, utciClim, utciColdClim, build, thresholds, thresholdsNational, ready, status, buildAnomaly, normals, anchorInfo, anomalyReady, anomalyPeriod, anomalyBuilding: () => aBuilding, buildDroughtNational, droughtNational, droughtStatus, buildSoilClimatology, soilPercentile, soilClimStatus };
}
