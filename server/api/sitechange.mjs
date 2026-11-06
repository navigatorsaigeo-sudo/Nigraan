/* == v91.17.283.34 · SCENARIO LAB B · SITE CHANGE: RUNOFF, PEAK FLOW AND STORAGE BEFORE / AFTER A PLANNED LAND CHANGE ==================
   A client draws a site (the Draw-your-site tool) and describes a planned change: built/sealed share, trees removed or added, green
   roof, permeable paving, a storage pond or tank, a cut/fill face. The server reads what the ground is now and answers BEFORE vs AFTER
   at the place's own 2-, 10- and 25-year design rain:
     runoff depth and volume (USDA NRCS curve numbers, NEH-630 ch. 9/10, lambda 0.2, pixel first: curve numbers never averaged),
     peak flow (rational method; time of concentration Kirpich 1940 with a sealed-share factor; Bell 1969 below 60 min, log-log
     interpolation of the 1/3/6/24 h area levels above), storage needed (max of the extra volume and the TR-55 1986 peak-attenuation
     storage), a slope screening flag for the cut/fill face, and the vegetation index now (Sentinel-2) and its estimated "after".
   The pure functions below are a line-by-line port of the reference sitechange.py of the specification (29 Oct 2026) and reproduce
   its test vectors exactly (scripts/tests28334/sitechange.unit.test.mjs), including Python's rounding.
   INPUTS READ FOR THE SITE (no new data):
     cover shares now   ESA WorldCover 2021 shares of the 250 m feature-grid cells under the site (data/feat s_wc_*; water, snow and
                        wetland left out and the rest renormalised, as the sponge layer does)
     slope, HAND        the cells' mean 30 m slope (data/feat t_slope, degrees -> %) and height above the nearest major drainage (t_hand)
     soil group         the hydrologic soil group shares of the tehsil's 250 m cells (data/sponge-tehsil.v2.json hsgShare; HYSOGs250m)
     design rain        data/rain-return-levels.json of the tehsil: 24 h POINT level for volume, 1/3/6/24 h AREA levels for peak
     slope class        data/landslide-susceptibility30.json served class of the tehsil (screening flag only)
     vegetation index   Sentinel-2 L2A through the Planetary Computer, read at request time by scripts/s2site.py, cached 7 days
   Surface heat: the direction only (no number: the size failed its locked test). Air temperature / heat stress: not modelled.
   Valid: site area 100 m2 to 80 ha; slope 0-60 %. Larger: not modelled (use a catchment model). Display only; never an alert. */
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createFeatGrid } from './featgrid.mjs';
import { unitAtPoint } from './unitresolve.mjs';
import { checksumOf, compareShown } from './placerecord.mjs';
import { scenarioStore } from './scenariostore.mjs';
import { runJob } from './jobrun.mjs';

export const SITECHANGE_VERSION = 'sitechange-1 (v91.17.283.34)';
export const LABEL = 'Engineering estimate by standard method for the place’s own design rainfall — not a forecast and not a design approval.';
/* v91.17.283.35 · audit C6 · the constants below change the served runoff, peak and storage but have no published source in this build:
   labelled on every client surface (they are kept, so the tested vectors still hold) */
export const UNTESTED_ADJUST = 'indicative \u2014 thresholds not tested: the slope factor on the retention S (1.0 to 0.6), the green-roof curve number (86), the permeable-paving curve number (85) and the sealed-share shortening of the Kirpich time (x (1 - 0.6 x sealed)) are adjustments without a published source in this build';
export const HEAT_DIRECTION = 'Replacing trees or crops with buildings or paving makes the daytime surface hotter; replacing bare ground with buildings does not (measured on Landsat in 8 Pakistani cities). No temperature figure: the size did not pass its test.';
export const AIR_HEAT = 'Air temperature and heat stress: not modelled.';
export const AREA_RAIN_NOTE = 'area rain: may under-read a cloudburst at the site';
export const SLOPE_LABEL = 'screening flag from slope bins; not a stability analysis; the landslide model ranks tehsils, not sites';
export const AFTER_INDEX_LABEL = 'estimated from nearby ground of the same cover — not a measurement';
export const AREA_MIN_M2 = 100, AREA_MAX_M2 = 800000, SLOPE_MAX_PCT = 60;   /* kept for the reference port only; v283.36: not applied to served runs (item 4: no area cutoff) */
/* v283.36 · NIGRAAN 1.0 · launch items 3, 4, 26 · the served Lab B answer is RUNOFF DEPTH AND VOLUME BEFORE vs AFTER by the NRCS curve
   number method only (NEH-630 ch. 9/10, lambda 0.2, CN2 by cover and soil group, no slope factor). Withheld for launch: storage size and
   "pond enough", peak flow (the Kirpich sealed-share blend and the slope factor on S are untested), green roof (CN 86) and permeable
   paving (CN 85): not modelled. The inputs actually used are stated: the 250 m WorldCover cells (or the cover the client entered), the
   tehsil's soil-group shares (HYSOGs250m) and the source year. */
export const WC_SOURCE = 'ESA WorldCover 2021 (10 m, aggregated to 250 m cells)', HSG_SOURCE = 'HYSOGs250m hydrologic soil groups (ORNL DAAC 2018), shares of the tehsil’s 250 m cells';
export const NOT_MODELLED_SITE = 'not modelled: green roof and permeable paving have no tested curve number in this release';
export const WITHHELD_SITE = 'storage size, “pond enough” and peak flow are not given in this release (their timing and slope steps are untested); runoff depth and volume are given';
/* v283.36 · C-now test 4 (site-lab chain) · the runoff depth that remains uses only steps the test supported: the NRCS runoff equation
   (Ia = 0.2 S) on the TR-55 AREA-WEIGHTED curve number (TR-55 ch. 2, composite CN, connected impervious area), sealed ground at the TR-55
   impervious CN 98 (not 100 % runoff), cover CNs of TR-55 Tables 2-2a/c. Removed: sealed Q = P, the pixel-first per-cover composite (+0.9 %
   on TR-55 Example 2-1), the slope factor on S. */
export const IMPERVIOUS_CN = 98;
export const SITE_STEPS = { supported: ['NRCS runoff equation, Ia = 0.2 S (TR-55 Table 2-1, Example 2-1)', 'cover curve numbers (TR-55 Tables 2-2a/b/c; shrub read as woods fair)', 'impervious CN 98 (TR-55)', 'TR-55 area-weighted curve number', 'Kirpich SI constant 0.0195, Bell 1969 ratio, TR-55 storage polynomial (not used: peak and storage are withheld)'],
  unsupported: ['sealed ground as 100 % runoff (replaced by CN 98)', 'pixel-first per-cover composite (replaced by the weighted CN)', 'slope factor on S (removed)', 'Kirpich sealed-share blend', 'permeable paving as half sealed', 'rational C = Q / P', 'TR-55 storage fed with rational peaks', 'green roof CN 86', 'permeable paving CN 85'],
  notVerified: ['Tc floor 5 min'], test: 'C-now test 4, 30 Oct 2026: the chain FAILED (9 unsupported steps); peak flow and storage stay withheld' };
export function weightedCN(shares, hsgShares) { let cn = 0, w = 0;
  for (const [cov, a] of Object.entries(shares || {})) { if (!(a > 0)) continue; for (const [h, b] of Object.entries(hsgShares || {})) { if (!(b > 0)) continue;
    const c = cov === 'built' ? IMPERVIOUS_CN : (CN2[cov] ? CN2[cov][HSG.indexOf(h)] : null); if (c == null) return null; cn += a * b * c; w += a * b; } }
  return w > 0 ? cn / w : null; }
export function nrcsRunoffCalc(A_m2, hsgShares, before, after, rl) {
  const out = {};
  for (const [T, lv] of Object.entries(rl)) { const P = lv['24h_point'] != null ? lv['24h_point'] : lv['24h']; const res = {};
    for (const [name, sh] of [['before', before], ['after', after]]) { const CN = weightedCN(sh, hsgShares); const q = CN == null ? null : runoffMm(P, CN, 1.0);
      res[name] = { P_mm: pyRound(P, 1), CN: CN == null ? null : pyRound(CN, 1), runoff_mm: q == null ? null : pyRound(q, 2), volume_m3: q == null ? null : pyRound(q * A_m2 / 1000, 1) }; }
    res.extra_volume_m3 = pyRound(Math.max(0, res.after.volume_m3 - res.before.volume_m3), 1); out[T] = res; }
  return out;
}
const COVER_KEYS = ['trees', 'shrub', 'grass', 'crops', 'bare', 'built'];
export function coverEntered(c) { if (!c || typeof c !== 'object') return null; const o = {}; let t = 0;
  for (const k of COVER_KEYS) { const v = c[k] == null || c[k] === '' ? 0 : Number(c[k]); if (!Number.isFinite(v) || v < 0 || v > 1) return { ok: false, why: 'cover ' + k + ' must be a share from 0 to 1' }; if (v > 0) { o[k] = v; t += v; } }
  if (!(t > 0)) return null; if (Math.abs(t - 1) > 0.02) return { ok: false, why: 'the cover shares you entered add up to ' + Math.round(t * 100) + ' %, not 100 %' };
  for (const k of Object.keys(o)) o[k] = Math.round(o[k] / t * 1000) / 1000; return { ok: true, before: o }; }

/* ---- the reference functions (sitechange.py), ported exactly ---- */
export const CN2 = { trees: [30, 55, 70, 77], shrub: [36, 60, 73, 79], grass: [49, 69, 79, 84], crops: [67, 78, 85, 89], bare: [77, 86, 91, 94], built: [98, 98, 98, 98],
  green_roof: [86, 86, 86, 86], permeable_paving: [85, 85, 85, 85] };
export const HSG = ['A', 'B', 'C', 'D'];
export const F_SLOPE = [[2, 1.00], [5, 0.95], [10, 0.90], [20, 0.80], [30, 0.70], [1e9, 0.60]];
const LAMBDA = 0.2;
export function fSlope(slopePct) { for (const [edge, f] of F_SLOPE) if (slopePct <= edge) return f; return null; }
export const S_mm = (cn) => 25400.0 / cn - 254.0;
function q_(P, cn, f) { const s = S_mm(cn) * f, ia = LAMBDA * s; return P <= ia ? 0.0 : (P - ia) ** 2 / (P + (1 - LAMBDA) * s); }
export const runoffMm = (P, cn, f = 1.0) => q_(P, cn, f);
/* Python iterates dicts in insertion order: the same order is kept here (Object.entries keeps it for these string keys) */
export function siteRunoffMm(P, shares, hsgShares, slopePct) {
  const f = fSlope(slopePct); let q = 0.0;
  for (const [cov, a] of Object.entries(shares)) { if (!(a > 0)) continue;
    for (const [h, b] of Object.entries(hsgShares)) { if (!(b > 0)) continue;
      q += a * b * (cov === 'built' ? P : q_(P, CN2[cov][HSG.indexOf(h)], (cov === 'green_roof' || cov === 'permeable_paving') ? 1.0 : f)); } }
  return q;
}
export function kirpichMin(L_m, S_mpm, sealedShare) { let tc = 0.0195 * (L_m ** 0.77) * (Math.max(S_mpm, 1e-4) ** -0.385); tc *= (1.0 - 0.6 * sealedShare); return Math.max(tc, 5.0); }
export const bellRatio = (D) => 0.54 * D ** 0.25 - 0.50;
export function depthMm(D, lv) {
  if (D < 60) return lv['1h'] * bellRatio(Math.max(D, 5));
  const pts = [[60, lv['1h']], [180, lv['3h']], [360, lv['6h']], [1440, lv['24h']]];
  for (let k = 0; k + 1 < pts.length; k++) { const [d0, x0] = pts[k], [d1, x1] = pts[k + 1];
    if (D <= d1) { const t = (Math.log(D) - Math.log(d0)) / (Math.log(d1) - Math.log(d0)); return Math.exp(Math.log(x0) + t * (Math.log(x1) - Math.log(x0))); } }
  return lv['24h'];
}
export const rationalPeakM3s = (C, i, A) => C * i * A / 3.6e6;
export function tr55StorageRatio(alpha) { const a = Math.min(Math.max(alpha, 0.1), 0.8); return 0.682 - 1.43 * a + 1.64 * a * a - 0.804 * a ** 3; }
/* Python round(x, n): the exact binary value rounded half to even (the correctly rounded decimal of a double is never exactly .5 unless
   the double is); toPrecision(17) is enough to see a true tie */
export function pyRound(x, n = 0) {
  if (!Number.isFinite(x)) return x;
  const s = Math.abs(x).toFixed(n + 60), cut = s.indexOf('.') + 1 + n, tie = s.charAt(cut) === '5' && /^0*$/.test(s.slice(cut + 1));
  let r = Number(Math.abs(x).toFixed(n));   /* toFixed: the exact value, a tie to the larger */
  if (tie) { const lo = Number(s.slice(0, cut).replace(/\.$/, '')), last = Number(s.charAt(cut - 1) === '.' ? s.charAt(cut - 2) : s.charAt(cut - 1)); if (last % 2 === 0) r = lo; }
  r = Math.sign(x) * r; return Object.is(r, -0) ? 0 : r;
}
/* the worked case of the reference: { T: { before, after, extra_volume_m3, alpha, ... } } with the reference's own key names and rounding */
export function scenarioCalc(A_m2, L_m, slopePct, hsgShares, before, after, rl, pondM3 = 0.0) {
  const out = {}; const S = slopePct / 100.0;
  for (const [T, lv] of Object.entries(rl)) {
    const P = lv['24h_point'] != null ? lv['24h_point'] : lv['24h']; const res = {};
    for (const [name, sh] of [['before', before], ['after', after]]) {
      const q = siteRunoffMm(P, sh, hsgShares, slopePct);
      const sealed = (sh.built || 0) + (sh.permeable_paving || 0) * 0.5;
      const tc = kirpichMin(L_m, S, sealed); const d = depthMm(tc, lv), i = d / (tc / 60.0); const C = P > 0 ? q / P : 0;
      res[name] = { P_mm: pyRound(P, 1), runoff_mm: pyRound(q, 2), volume_m3: pyRound(q * A_m2 / 1000, 1), C: pyRound(C, 3), tc_min: pyRound(tc, 1), i_mmph: pyRound(i, 1), peak_m3s: pyRound(rationalPeakM3s(C, i, A_m2), 4) };
    }
    const b = res.before, a = res.after;
    const dV = Math.max(0.0, a.volume_m3 - b.volume_m3);
    const alpha = a.peak_m3s > 0 ? b.peak_m3s / a.peak_m3s : 1;
    const vs = alpha < 1 ? tr55StorageRatio(alpha) * a.volume_m3 : 0.0;
    res.extra_volume_m3 = pyRound(dV, 1); res.alpha = pyRound(alpha, 3); res.alpha_in_chart_range = alpha >= 0.1 && alpha <= 0.8;
    res.storage_peak_m3 = pyRound(vs, 1); res.storage_needed_m3 = pyRound(Math.max(dV, vs), 1);
    res.pond_m3 = pondM3; res.pond_enough = pondM3 >= res.storage_needed_m3;
    out[T] = res;
  }
  return out;
}

/* ---- the planned change: AFTER shares from the BEFORE shares and the client's controls (all shares of the whole site, 0-1) ----
   built      the sealed share after (roofs, roads, paving; green roof and permeable paving are given separately); not set: the present share
   greenRoof  the share under extensive green roof;  permeable  the share under permeable paving
   treesDelta trees added (+) or removed (-), as a share of the site
   The rest of the site keeps its present natural covers in their present proportions. Refused (never rescaled) when the parts exceed 1. */
export const NATURAL = ['trees', 'shrub', 'grass', 'crops', 'bare'];
export function afterShares(before, c) {
  const n = (x) => (x == null || x === '' ? 0 : Number(x));
  const keep = (x) => x == null || x === '';   /* a control not set keeps the present ground (built: its present share) */
  const built = keep(c.built) ? (before.built || 0) : Number(c.built), gr = n(c.greenRoof), pp = n(c.permeable), dT = n(c.treesDelta);
  for (const [k, v] of [['built', built], ['greenRoof', gr], ['permeable', pp]]) if (!Number.isFinite(v) || v < 0 || v > 1) return { ok: false, why: k + ' must be a share from 0 to 1' };
  if (!Number.isFinite(dT) || dT < -1 || dT > 1) return { ok: false, why: 'treesDelta must be a share from -1 to 1' };
  const sealed = built + gr + pp; if (sealed > 1 + 1e-9) return { ok: false, why: 'built, green roof and permeable paving together exceed the whole site (' + Math.round(sealed * 100) + ' %)' };
  const natBefore = NATURAL.reduce((s, k) => s + (before[k] || 0), 0), free = 1 - sealed;
  /* the natural part left after the sealing keeps the present natural mix, scaled to the free share */
  const nat = {}; for (const k of NATURAL) nat[k] = natBefore > 0 ? (before[k] || 0) / natBefore * free : (k === 'grass' ? free : 0);
  let trees = nat.trees + dT;
  if (trees < -1e-9) return { ok: false, why: 'more trees removed (' + Math.round(-dT * 100) + ' %) than the unsealed ground still holds (' + Math.round(nat.trees * 100) + ' %)' };
  trees = Math.max(0, trees);
  const others = NATURAL.filter((k) => k !== 'trees'), oSum = others.reduce((s, k) => s + nat[k], 0), oNew = free - trees;
  if (oNew < -1e-9) return { ok: false, why: 'the trees added (' + Math.round(dT * 100) + ' %) do not fit on the unsealed ground left (' + Math.round(free * 100) + ' %)' };
  const after = {}; if (built > 0) after.built = built; if (gr > 0) after.green_roof = gr; if (pp > 0) after.permeable_paving = pp; if (trees > 1e-9) after.trees = trees;
  for (const k of others) { const v = oSum > 0 ? nat[k] / oSum * Math.max(0, oNew) : (k === 'grass' ? Math.max(0, oNew) : 0); if (v > 1e-9) after[k] = v; }
  return { ok: true, after };
}

/* the slope screening flag (SPEC section 3) */
export function slopeFlag(faceDeg, tehsilClass) {
  if (faceDeg == null || faceDeg === '' || !Number.isFinite(Number(faceDeg))) return { flag: false, text: 'no cut or fill face given', label: SLOPE_LABEL };
  const f = Number(faceDeg), hi = tehsilClass != null && Number(tehsilClass) >= 4;
  const flag = f >= 25 || (hi && f >= 15);
  return { flag, faceDeg: f, tehsilHigh: hi, text: flag ? 'steep cut/fill — needs a geotechnical check' : 'no screening flag',
    why: flag ? (f >= 25 ? 'the planned face is 25° or steeper' : 'the planned face is 15° or steeper in a tehsil of high or very high landslide susceptibility') : 'the planned face is below 25°' + (hi ? '' : '') + (hi ? ' and below 15°' : ''), label: SLOPE_LABEL };
}

/* the vegetation index after: the cover-weighted typical index of nearby ground (green roof = grass, permeable paving = built) */
export function afterIndex(after, typical, key) {
  const map = { trees: 'trees', shrub: 'shrub', grass: 'grass', crops: 'crops', bare: 'bare', built: 'built', green_roof: 'grass', permeable_paving: 'built' };
  let s = 0, w = 0; const missing = [];
  for (const [k, a] of Object.entries(after)) { if (!(a > 0)) continue; const t = typical && typical[map[k]]; if (!t || !Number.isFinite(t[key])) { missing.push(k); continue; } s += a * t[key]; w += a; }
  if (w < 0.999 * Object.values(after).reduce((x, y) => x + (y > 0 ? y : 0), 0)) return { value: null, why: 'no nearby ground of cover ' + missing.join(', ') + ' in the scenes' };
  return { value: Math.round(s / w * 1000) / 1000 };
}

/* ---- geometry: the drawn ring [[lat, lon], ...] ---- */
const R_E = 6371008.8;
export function ringGeometry(ring) {
  const n = ring.length, lat0 = ring.reduce((s, p) => s + p[0], 0) / n, k = Math.cos(lat0 * Math.PI / 180);
  const xy = ring.map(([la, lo]) => [lo * Math.PI / 180 * R_E * k, la * Math.PI / 180 * R_E]);
  let a = 0; for (let i = 0; i < n; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % n]; a += x1 * y2 - x2 * y1; }
  let L = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) L = Math.max(L, Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]));
  return { areaM2: Math.abs(a) / 2, lengthM: L, centre: [lat0, ring.reduce((s, p) => s + p[1], 0) / n] };
}
export function inRing(lat, lon, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [yi, xi] = ring[i], [yj, xj] = ring[j];
  if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) c = !c; } return c; }

const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const COVER_BANDS = { trees: 's_wc_tree', shrub: 's_wc_shrub', grass: 's_wc_grass', crops: 's_wc_crop', bare: 's_wc_bare', built: 's_wc_built' };
const TS = [2, 10, 25];

export function createSiteChange(app, { dataDir, root }) {
  const fg = () => app.featGrid || createFeatGrid(dataDir);
  const JS = new Map();
  const json = (name) => { const f = join(dataDir, name); try { const m = statSync(f).mtimeMs, c = JS.get(name); if (c && c.m === m) return c.v; const v = JSON.parse(readFileSync(f, 'utf8')); JS.set(name, { m, v }); return v; } catch (_) { return null; } };
  let hsgBy = null, hsgAt = 0;
  const hsgOf = (uid) => { const V = json('sponge-tehsil.v2.json'); if (!V || !V.units) return null; if (!hsgBy || hsgAt !== V) { hsgBy = new Map(); for (const u of Object.values(V.units)) if (u && u.uid) hsgBy.set(u.uid, u.hsgShare); hsgAt = V; } return hsgBy.get(uid) || null; };
  /* the 250 m cells under the site: every cell whose centre lies inside; a site smaller than a cell reads the cell under its centre */
  function cellsOf(ring) {
    const g = fg(); const meta = g.meta && g.meta('s_wc_tree'); const cell = meta && meta.grid ? meta.grid.cell : 0.0025, W = meta && meta.grid ? meta.grid.west : 60.75, N = meta && meta.grid ? meta.grid.north : 37.25;
    const lats = ring.map((p) => p[0]), lons = ring.map((p) => p[1]); const out = [];
    const r0 = Math.floor((N - Math.max(...lats)) / cell), r1 = Math.floor((N - Math.min(...lats)) / cell), c0 = Math.floor((Math.min(...lons) - W) / cell), c1 = Math.floor((Math.max(...lons) - W) / cell);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const la = N - (r + 0.5) * cell, lo = W + (c + 0.5) * cell; if (inRing(la, lo, ring)) out.push([la, lo]); }
    const inside = out.length;
    if (!out.length) { const G = ringGeometry(ring).centre; out.push([N - (Math.floor((N - G[0]) / cell) + 0.5) * cell, W + (Math.floor((G[1] - W) / cell) + 0.5) * cell]); }
    return { cells: out, cellDeg: cell, inside };
  }
  function ground(ring) {
    const g = fg(); const { cells, inside } = cellsOf(ring); const v = (b, la, lo) => { try { return g.value(b, la, lo); } catch (_) { return null; } };
    const sum = Object.fromEntries(Object.keys(COVER_BANDS).map((k) => [k, 0])); let used = 0, sl = 0, nsl = 0; const hand = [];
    for (const [la, lo] of cells) {
      const s = {}; let tot = 0; for (const [k, b] of Object.entries(COVER_BANDS)) { const x = v(b, la, lo); s[k] = isN(x) ? Math.max(0, x) : 0; tot += s[k]; }
      if (tot > 0.01) { for (const k of Object.keys(s)) sum[k] += s[k] / tot; used++; }
      const d = v('t_slope', la, lo); if (isN(d)) { sl += Math.tan(d * Math.PI / 180) * 100; nsl++; }
      const h = v('t_hand', la, lo); if (isN(h)) hand.push(h);
    }
    if (!used) return { ok: false, insideCells: inside, centreOnly: inside === 0, slopePct: nsl ? Math.round(sl / nsl * 10) / 10 : null, handM: hand.length ? Math.round(Math.min(...hand) * 10) / 10 : null, why: 'the land cover under this site is not held (the 250 m feature grid has no cover here): enter the present cover' };
    const before = {}; for (const k of Object.keys(sum)) { const x = sum[k] / used; if (x > 0.0005) before[k] = Math.round(x * 1000) / 1000; }
    const t = Object.values(before).reduce((a, b) => a + b, 0); for (const k of Object.keys(before)) before[k] = Math.round(before[k] / t * 1000) / 1000;
    return { ok: true, cells: cells.length, coverCells: used, insideCells: inside, centreOnly: inside === 0, before, slopePct: nsl ? Math.round(sl / nsl * 10) / 10 : null,
      handM: hand.length ? Math.round(Math.min(...hand) * 10) / 10 : null };
  }
  function designRain(uid) {
    let RL = null; try { RL = app.hazSci && app.hazSci.rainLevels ? app.hazSci.rainLevels(uid) : null; } catch (_) { RL = null; }
    if (!RL) { const F = json('rain-return-levels.json'); const U = F && F.units && F.units[uid]; if (U) RL = { ready: true, returnPeriods: F.returnPeriods, durations: Object.fromEntries(['1h', '3h', '6h', '24h'].filter((k) => U[k]).map((k) => [k, { areaRl: U[k].areaRl, pointRl: U[k].pointRl }])) }; }
    if (!RL || !RL.ready) return { ok: false, why: 'the design rain of this place is not held (' + ((RL && RL.why) || 'data/rain-return-levels.json') + ')' };
    const D = RL.durations || {}, T = RL.returnPeriods || []; const rl = {};
    for (const t of TS) { const k = T.indexOf(t); if (k < 0) continue; const g = (d, f) => D[d] && Array.isArray(D[d][f]) ? D[d][f][k] : null;
      const lv = { '1h': g('1h', 'areaRl'), '3h': g('3h', 'areaRl'), '6h': g('6h', 'areaRl'), '24h': g('24h', 'areaRl') }; const p = g('24h', 'pointRl'); if (isN(p)) lv['24h_point'] = p;
      if (Object.values(lv).every(isN)) rl[String(t)] = lv; }
    if (!Object.keys(rl).length) return { ok: false, why: 'the 1, 3, 6 and 24-hour design rain of this place is not complete' };
    return { ok: true, rl, basis: 'the tehsil’s rain return levels (satellite rain 2001-2025, 25 years): the 24-hour point level for the volume; the 1, 3, 6 and 24-hour area levels for the peak (' + AREA_RAIN_NOTE + ')' };
  }
  function slopeClassOf(uid) { const L = json('landslide-susceptibility30.json'); const u = L && L.units && L.units[uid]; return u && u.served ? { class: u.served.class, label: u.served.label } : null; }
  /* ---- the vegetation index: Sentinel-2 now, through scripts/s2site.py; cached 7 days per site ---- */
  const VEG_TTL = 7 * 86400e3, running = new Map();
  function python() { const c = []; if (process.env.NIGRAAN_PYTHON) c.push(process.env.NIGRAAN_PYTHON); if (process.env.LOCALAPPDATA) c.push(join(process.env.LOCALAPPDATA, 'Python', 'bin', 'python.exe'));
    for (const p of c) if (existsSync(p)) return p; return process.platform === 'win32' ? 'py' : 'python3'; }
  const keyOfRing = (ring) => createHash('sha256').update(JSON.stringify(ring.map((p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]))).digest('hex').slice(0, 24);
  async function vegetation(ring, { wait = true } = {}) {
    const key = keyOfRing(ring), dir = join(dataDir, 'cache', 's2site'), f = join(dir, key + '.json');
    try { const c = JSON.parse(readFileSync(f, 'utf8')); if (Date.now() - Date.parse(c.at) < VEG_TTL && (c.ok || Date.now() - Date.parse(c.at) < 3600e3)) return { ...c, cached: true }; } catch (_) {}
    if (process.env.NIGRAAN_S2SITE === '0') return { ok: false, unreachable: true, why: 'the satellite image reading is switched off on this server' };
    if (!running.has(key)) running.set(key, (async () => {
      const exe = python(), script = join(root, 'scripts', 's2site.py');
      if (!existsSync(script)) return { ok: false, why: 'the satellite reader is not in this install' };
      const args = (exe === 'py' ? ['-3'] : []).concat([script, JSON.stringify({ poly: ring, days: 60, scenes: 3, bufferKm: 2 })]);
      /* v283.51g3 · item 2 · runJob (jobrun.mjs): an interactive read, its 120 s limit kept; the process tree is ended on overrun and logged */
      const r = await (async () => { const x = await runJob('s2site.py', exe, args, { limitMin: 2, keepStderr: false, keepChars: 200000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
        if (x.code === -2) return { ok: false, unreachable: true, why: 'the satellite image service did not answer within 120 s' };
        if (x.code === -1) return { ok: false, why: 'the satellite reader could not be started on this computer' };
        let j = null; try { j = JSON.parse(x.out.trim().split('\n').pop()); } catch (_) { j = null; } return j && typeof j === 'object' ? j : { ok: false, why: 'the satellite reader gave no answer' }; })();
      const rec = { ...r, at: new Date().toISOString() };
      if (rec.ok || !rec.unreachable) { try { mkdirSync(dir, { recursive: true }); writeFileSync(f + '.part', JSON.stringify(rec)); renameSync(f + '.part', f); } catch (_) {} }
      return rec; })().finally(() => setTimeout(() => running.delete(key), 1000)));
    if (!wait) return { ok: false, pending: true, why: 'reading the satellite image (about 20 s)' };
    return running.get(key);
  }
  const store = scenarioStore(dataDir), keep = store.keep, get = store.get;
  /* POST /api/sitechange { ring:[[lat,lon],...], change:{ built, greenRoof, permeable, treesDelta }, pondM3, faceDeg, faceHeightM, lengthM, name } */
  async function run(b, { vegWait = true } = {}) {
    const ring = Array.isArray(b && b.ring) ? b.ring.map((p) => [Number(p[0]), Number(p[1])]) : null;
    if (!ring || ring.length < 3 || ring.length > 500 || ring.some((p) => !isN(p[0]) || !isN(p[1]) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180)) return { status: 400, body: { ok: false, why: 'draw the site first: a ring of 3 to 500 points [lat, lon]' } };
    const G = ringGeometry(ring);
    const ch0 = (b && b.change) || {};
    if ((Number(ch0.greenRoof) || 0) > 0 || (Number(ch0.permeable) || 0) > 0) return { status: 200, body: { ok: false, notModelled: true, state: 'not modelled', why: NOT_MODELLED_SITE } };   /* item 26 */
    let U = null; try { U = unitAtPoint(app, G.centre[0], G.centre[1]); } catch (_) { U = null; }
    const uid = U && U.unit ? U.unit.unitId : null;
    if (!uid) return { status: 200, body: { ok: false, why: 'the site lies in no tehsil this server holds' } };
    const CE = coverEntered(b && b.coverNow); if (CE && !CE.ok) return { status: 400, body: { ok: false, why: CE.why } };
    const gr0 = ground(ring); if (!gr0.ok && !CE) return { status: 200, body: { ok: false, why: gr0.why } };
    const gr = CE ? { ...gr0, ok: true, before: CE.before, entered: true } : gr0;
    const subCell = (gr0.coverCells != null && gr0.insideCells === 0) || !!gr0.centreOnly;   /* smaller than one 250 m cell: no cell centre inside the site */
    const coverNote = CE ? 'cover entered by you' : subCell ? 'cover estimated from the surrounding area (the site is smaller than one 250 m cell)' : 'cover read from ' + gr0.cells + ' cell(s) of 250 m under the site';
    const lengthM = isN(Number(b.lengthM)) && Number(b.lengthM) > 0 && b.lengthM !== '' && b.lengthM != null ? Number(b.lengthM) : Math.round(G.lengthM);
    const slopePct = isN(gr.slopePct) ? gr.slopePct : null;   /* stated only: the NRCS runoff of this release takes no slope factor */
    const hs = hsgOf(uid); if (!hs) return { status: 200, body: { ok: false, why: 'the soil group of this tehsil is not held' } };
    const hsg = {}; HSG.forEach((h, i) => { if (hs[i] > 0) hsg[h] = hs[i]; });
    const hsum = Object.values(hsg).reduce((a, x) => a + x, 0); for (const k of Object.keys(hsg)) hsg[k] = hsg[k] / hsum;
    const DR = designRain(uid); if (!DR.ok) return { status: 200, body: { ok: false, why: DR.why } };
    const ch = b.change || {}; const A = afterShares(gr.before, ch); if (!A.ok) return { status: 400, body: { ok: false, why: A.why } };
    const pond = isN(Number(b.pondM3)) && b.pondM3 !== '' && b.pondM3 != null ? Math.max(0, Number(b.pondM3)) : 0;
    const calc = nrcsRunoffCalc(G.areaM2, hsg, gr.before, A.after, DR.rl);   /* v283.36 items 3/26 */
    const SC = slopeClassOf(uid), face = slopeFlag(b.faceDeg, SC ? SC.class : null);
    const rp = {}; for (const [T, r] of Object.entries(calc)) rp[T] = { ...r };
    const veg = await vegetation(ring, { wait: vegWait });
    const vegOut = veg && veg.ok ? { ok: true, now: { ndvi: veg.ndvi, ndmi: veg.ndmi, scenes: (veg.scenes || []).map((s) => s.date), pixels: veg.pixels, basis: veg.source },
        after: { ndvi: afterIndex(A.after, veg.typical, 'ndvi'), ndmi: afterIndex(A.after, veg.typical, 'ndmi'), label: AFTER_INDEX_LABEL }, context: 'shown as context only: it does not enter the runoff result' }
      : { ok: false, ...(veg && veg.pending ? { pending: true } : {}), why: (veg && veg.why) || 'the vegetation index could not be read', ...(veg && veg.unreachable ? { unreachable: true } : {}) };
    const inputs = { areaM2: Math.round(G.areaM2), areaHa: Math.round(G.areaM2 / 1e3) / 10, lengthM, lengthBasis: isN(Number(b.lengthM)) && b.lengthM ? 'set by you' : 'the longest straight line across the drawn site', slopePct,
      hsg: Object.fromEntries(Object.entries(hsg).map(([k, v]) => [k, Math.round(v * 1000) / 1000])), hsgBasis: HSG_SOURCE, hsgScope: 'tehsil shares (not the site’s own soil)',
      before: gr.before, beforeBasis: CE ? 'the present cover you entered' : WC_SOURCE + ': shares of the ' + gr0.cells + ' grid cell(s) of 250 m ' + (subCell ? 'nearest the site' : 'under the site') + ' (water and snow left out)', coverNote, coverEstimated: !CE && subCell, coverSource: CE ? 'entered' : WC_SOURCE, coverYear: CE ? null : 2021, after: Object.fromEntries(Object.entries(A.after).map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
      change: { built: ch.built == null || ch.built === '' ? (gr.before.built || 0) : Number(ch.built), greenRoof: Number(ch.greenRoof) || 0, permeable: Number(ch.permeable) || 0, treesDelta: Number(ch.treesDelta) || 0 }, pondM3: pond,
      handM: gr.handM, handBasis: 'height above the nearest major drainage, lowest ground of the site’s cells (30 m terrain)', designRain: DR.rl, designRainBasis: DR.basis, tehsil: uid };
    const body = { ok: true, version: SITECHANGE_VERSION, lab: 'site', at: new Date().toISOString(), name: String(b.name || '').slice(0, 80) || null, label: LABEL, withheld: WITHHELD_SITE, inputs, returnPeriods: rp,
      slope: { ...face, tehsilClass: SC ? SC.label : null, siteMeanSlopePct: slopePct, faceHeightM: isN(Number(b.faceHeightM)) && b.faceHeightM !== '' && b.faceHeightM != null ? Number(b.faceHeightM) : null },
      vegetation: vegOut, surfaceHeat: { direction: HEAT_DIRECTION, figure: null }, airHeat: AIR_HEAT,
      methods: 'NRCS runoff equation on the TR-55 area-weighted curve number (lambda 0.2; sealed ground CN 98; no slope factor): runoff depth and volume', steps: SITE_STEPS, valid: 'any site area; the cover is read from 250 m cells unless you enter it' };
    body.values = siteValues(body); body.checksum = checksumOf(body.values);
    body.id = 'sc' + createHash('sha256').update(JSON.stringify({ ring, ch, pond, lengthM, face: b.faceDeg ?? null, v: body.values })).digest('hex').slice(0, 24);
    keep(body);
    return { status: 200, body };
  }
  return { run, get, keep, vegetation, ground, designRain, status: () => ({ ready: true, version: SITECHANGE_VERSION, kept: store.size() }) };
}
/* the values a screen shows and a report prints, by path (the checksum binding of the report: placerecord.mjs checksumOf/compareShown) */
export function siteValues(r) { const v = {};
  for (const [T, x] of Object.entries(r.returnPeriods || {})) { for (const s of ['before', 'after']) for (const k of ['P_mm', 'runoff_mm', 'volume_m3']) v['rp.' + T + '.' + s + '.' + k] = x[s][k];
    for (const k of ['extra_volume_m3']) v['rp.' + T + '.' + k] = x[k]; }
  if (r.vegetation && r.vegetation.ok) { v['veg.now.ndvi'] = r.vegetation.now.ndvi; v['veg.now.ndmi'] = r.vegetation.now.ndmi; v['veg.after.ndvi'] = r.vegetation.after.ndvi.value; v['veg.after.ndmi'] = r.vegetation.after.ndmi.value; }
  v['slope.flag'] = r.slope ? r.slope.text : null;
  return v; }
export { compareShown };
