/* == v91.17.283.31 · science lane (scratchpad/rain31, rules31.json locked before scoring) · THE MOUNTAIN RAIN AMOUNT ==================
   data/rain-amount-qm-mountain.json: empirical quantile mapping of the IFS 00 UTC PKT-day total to station PKT-day totals, per lead day
   (1-3) x regime (monsoon Jun-Sep / rest), quantiles 1..99, linear between, above q99 scaled by qo99/qf99, 0 maps to 0. Held-out
   (leave-one-year-out 2023-2026) in the MOUNTAIN zone it cut the day-total error from 2.43 to 1.02 mm (lead 1) and the bias from +1.89 to
   -0.07 mm, with the 95 % bound of the change below -1.1 mm at every lead. In the plains and at the coast it made the error worse, in the
   hills it was inconclusive: those zones keep the raw amount. Lead 0 was never tested: today keeps the raw amount. */
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RAIN_ENS_STALE_H, ensAge } from './stale.mjs';   /* v283.35 · B7: the one staleness rule */

let C = null, CM = 0;
export function qmTable(dataDir) { const f = join(dataDir, 'rain-amount-qm-mountain.json'); try { if (!existsSync(f)) return null; const m = statSync(f).mtimeMs; if (C && m === CM) return C; C = JSON.parse(readFileSync(f, 'utf8')); CM = m; return C; } catch (_) { return C; } }
export function qmMap(T, mm, lead, month) {
  if (!T || !T.tables || !Number.isFinite(mm)) return null;
  const t = T.tables[lead + '|mountain|' + (month >= 6 && month <= 9 ? 'monsoon' : 'rest')]; if (!t || !Array.isArray(t.qf) || !Array.isArray(t.qo)) return null;
  if (mm <= 0) return 0;
  const qf = t.qf, qo = t.qo, n = qf.length;
  if (mm >= qf[n - 1]) return qf[n - 1] > 0 ? Math.round(mm * (qo[n - 1] / qf[n - 1]) * 10) / 10 : mm;
  if (mm <= qf[0]) return qf[0] > 0 ? Math.round(mm / qf[0] * qo[0] * 10) / 10 : Math.round(qo[0] * 10) / 10;
  /* the forecast quantiles can hold ties (many zero quantiles): the highest index whose quantile does not exceed mm, then linear */
  let i = 0; for (let k = 0; k < n - 1; k++) if (qf[k] <= mm) i = k;
  const a = qf[i], b = qf[i + 1]; const w = b > a ? (mm - a) / (b - a) : 0;
  return Math.round((qo[i] + w * (qo[i + 1] - qo[i])) * 10) / 10;
}
/* the shown amount of a day: mapped in the mountain zone at lead days 1-3, raw elsewhere; the raw value and the reason kept */
export function shownRainMm(dataDir, mm, { zone, lead, month }) {
  if (!Number.isFinite(mm)) return { mm: null };
  if (zone !== 'mountain') return { mm, mapping: 'raw', mappingWhy: 'raw model amount: the station mapping made ' + (zone || 'this zone') + ' worse or was inconclusive in its held-out test' };
  if (!(lead >= 1 && lead <= 3)) return { mm, mapping: 'raw', mappingWhy: 'raw model amount: lead 0 of the mapping was never tested' };
  const T = qmTable(dataDir); const v = qmMap(T, mm, lead, month);
  return v == null ? { mm, mapping: 'raw', mappingWhy: 'raw model amount: the mountain mapping (data/rain-amount-qm-mountain.json) is not in this install' }
    : { mm: v, rawMm: mm, mapping: 'mountain station mapping', mappingWhy: 'mapped to station day totals (mountain quantile mapping, held-out error 2.4 -> 1.0 mm at lead 1)', version: T.version || null };
}

/* == v91.17.283.31 · item 2.4 · THE RAIN AMOUNT LAYER (layer=rain_amount, days 0-3) ======================================================
   What the forecast says will fall, for every tehsil, without a warning level: the ensemble median day total with its 10-90 % range
   (the outlook's ensemble rows, liquid rain), the mountain station mapping at lead days 1-3 (raw elsewhere), the amount class in the
   24-hour rain classes' own words (data/hazard-scale.json rainClasses24h: an amount class, NOT a hazard level) and how rare that amount
   is at the tehsil (its return-period band from data/rain-return-levels.json, 25 years of satellite rain; hazsci.mjs dayRarity). Labelled
   "levels not yet tested" where the tehsil's warning level has not passed its test. */
export function createRainAmountLayer(app, dataDir, { dayRarity, rainClasses, zoneOf }) {
  let RL = null, RLm = 0; const rl = () => { try { const f = join(dataDir, 'rain-return-levels.json'), m = statSync(f).mtimeMs; if (m !== RLm) { RL = JSON.parse(readFileSync(f, 'utf8')); RLm = m; } } catch (_) {} return RL; };
  function layer(day) {
    const E = app.outlook && app.outlook.dayRows ? app.outlook.dayRows() : null; const k0 = Number(day) || 0;
    const cls = rainClasses() || {}; const cut = Array.isArray(cls.value) ? cls.value : [15.6, 64.5, 115.6, 204.5]; const words = Array.isArray(cls.words) ? cls.words : null;
    if (!E || !E.units || !Array.isArray(E.days)) return { ready: false, kind: 'amount', layer: 'rain_amount', why: 'missing: no ensemble run held' };
    const ageH = ensAge(E).ageH;   /* v283.36 item 29 */
    const pkt = (ms) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 10); const date = pkt(Date.now() + k0 * 864e5);
    const k = E.days.indexOf(date); const levels = {}, values = {}, whys = {}, keys = {};
    const T = ((app.units && app.units.tehsil) || []).filter((u) => !u.disputed);
    for (const u of T) { keys[u.unitId] = u.key != null ? u.key : u.unitId;
      if (k < 0 || !(ageH <= RAIN_ENS_STALE_H)) { levels[u.unitId] = -6; whys[u.unitId] = 'input not current: the ensemble run held (' + (isFinite(ageH) ? Math.round(ageH) + ' h old' : 'age unknown') + ')' + (k < 0 ? ' does not cover ' + date : ' is too old'); continue; }
      const row = E.units[u.unitId] && E.units[u.unitId][k]; const pr = row && Array.isArray(row.pr) ? row.pr : null;
      if (!pr || pr.some((x) => x == null)) { levels[u.unitId] = -1; whys[u.unitId] = 'missing: no ensemble rain for this tehsil and day'; continue; }
      let zone = null; try { zone = zoneOf(u); } catch (_) { zone = null; }
      const month = Number(date.slice(5, 7));
      const m = shownRainMm(dataDir, pr[1], { zone, lead: k0, month }), lo = shownRainMm(dataDir, pr[0], { zone, lead: k0, month }), hi = shownRainMm(dataDir, pr[2], { zone, lead: k0, month });
      let i = 0; cut.forEach((c, j) => { if (m.mm >= c) i = j + 1; });
      levels[u.unitId] = i;
      let rar = null; try { rar = dayRarity(rl(), u.unitId, m.mm); } catch (_) { rar = null; }
      values[u.unitId] = { mm: m.mm, rangeMm: [lo.mm, hi.mm], ...(m.rawMm != null ? { rawMm: m.rawMm } : {}), mapping: m.mapping, zone,
        rarity: rar && rar.assessed ? { band: rar.band, words: rar.words, basis: rar.basis } : { assessed: false, why: rar ? rar.why : 'not assessed' } }; }
    const counts = cut.concat([null]).map(() => 0); for (const v of Object.values(levels)) if (v >= 0) counts[v]++;
    return { ready: true, kind: 'amount', layer: 'rain_amount', name: 'Forecast rain amount (day total)', day: k0, date, ownScale: true,
      words: words || ['under ' + cut[0] + ' mm'].concat(cut.map((c, j) => c + (cut[j + 1] ? '-' + cut[j + 1] : '+') + ' mm')), direction: 'more rain to the right',
      levels, values, whys, keys, counts, levelsNote: 'levels not yet tested: an amount class in the rain classes’ own words, not a warning level',
      basis: 'ensemble median day total (liquid rain) with its 10-90 % member range; mountain tehsils at lead days 1-3 mapped to station day totals (held-out test); rarity: the tehsil’s 24-hour return-period band (25 years of satellite rain)',
      at: E.at, inputAgeH: isFinite(ageH) ? Math.round(ageH * 10) / 10 : null, canAlert: false, productType: 'Forecast amount' };
  }
  /* == v91.17.283.41 (NIGRAAN 1.0.5) · item 4 · THE GUST VALUE LAYER (layer=wind_gust, days 0-3) =========================================
     The forecast day's highest gust per tehsil in km/h (the ensemble median of the daily maximum 10 m gust, the value the place panel prints as
     the gust p50), for the wind map. NO wind level: the gust levels stay withheld (hazsci.mjs applyWind; alerts and reports unchanged). The map
     colours the value in DISPLAY BINS, not levels: the WMO Beaufort force boundaries in km/h (force 6 = 39, force 8 = 62, force 10 = 89, force
     12 = 118; WMO-No. 8 / the Beaufort table) - display only, documented in data/map-layer-scales.json wind_gust. */
  function gustLayer(day) {
    const E = app.outlook && app.outlook.dayRows ? app.outlook.dayRows() : null; const k0 = Number(day) || 0;
    let SC = null; try { SC = JSON.parse(readFileSync(join(dataDir, 'map-layer-scales.json'), 'utf8')).layers.wind_gust || null; } catch (_) { SC = null; }
    if (!SC || !Array.isArray(SC.bins)) return { ready: false, kind: 'amount', layer: 'wind_gust', why: 'missing: the gust display bins (data/map-layer-scales.json wind_gust) are not in this install' };
    if (!E || !E.units || !Array.isArray(E.days)) return { ready: false, kind: 'amount', layer: 'wind_gust', why: 'missing: no ensemble run held' };
    const ageH = ensAge(E).ageH; const pkt = (ms) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 10); const date = pkt(Date.now() + k0 * 864e5);
    const k = E.days.indexOf(date); const levels = {}, values = {}, whys = {}, keys = {};
    const T = ((app.units && app.units.tehsil) || []).filter((u) => !u.disputed);
    for (const u of T) { keys[u.unitId] = u.key != null ? u.key : u.unitId;
      if (k < 0 || !(ageH <= RAIN_ENS_STALE_H)) { levels[u.unitId] = -6; whys[u.unitId] = 'input not current: the ensemble run held (' + (isFinite(ageH) ? Math.round(ageH) + ' h old' : 'age unknown') + ')' + (k < 0 ? ' does not cover ' + date : ' is too old'); continue; }
      const row = E.units[u.unitId] && E.units[u.unitId][k]; const g = row && Array.isArray(row.gu) ? row.gu : null;
      if (!g || g.some((x) => x == null)) { levels[u.unitId] = -1; whys[u.unitId] = 'missing: no ensemble gust for this tehsil and day'; continue; }
      let i = 0; SC.bins.forEach((c, j) => { if (g[1] >= c) i = j + 1; });
      levels[u.unitId] = i; values[u.unitId] = { kmh: Math.round(g[1] * 10) / 10, rangeKmh: [Math.round(g[0] * 10) / 10, Math.round(g[2] * 10) / 10] }; }
    const counts = SC.bins.concat([null]).map(() => 0); for (const v of Object.values(levels)) if (v >= 0) counts[v]++;
    return { ready: true, kind: 'amount', layer: 'wind_gust', name: SC.title || 'Forecast gust, km/h', unit: 'km/h', day: k0, date, ownScale: true, words: SC.words, direction: 'stronger gusts to the right',
      levels, values, whys, keys, counts, levelsNote: 'display bins, not warning levels: the gust levels are withheld (not tested)', basis: SC.measure, binsSource: SC.binsSource,
      at: E.at, inputAgeH: isFinite(ageH) ? Math.round(ageH * 10) / 10 : null, canAlert: false, productType: 'Forecast value' };
  }
  return { layer, gustLayer };
}
