/* v91.17.274 · DROUGHT TYPE PER TEHSIL (owner 6 Oct: drought beyond rain, causes in one Drought layer, scientific type names).
   Every indicator NIGRAAN already holds is placed on one ordinal severity scale (0 normal .. 4 extreme) by its own PUBLISHED class
   table, read from data/drought-type.json (U.S. Drought Monitor SPI and percentile ranges, Svoboda et al. 2002; Kogan 1995/2002
   vegetation health classes). Types: meteorological (rain index), agricultural (root-zone soil percentile, vegetation health),
   hydrological (snow water percentile, river flow percentile at the judged gauges inside the tehsil). The 'active' band is the one
   at which the drought level leaves Low, read from data/drought-class.json (categories.Monitor). The level itself is NOT changed.
   15-day: only the meteorological type has a forecast (CHIRPS3-GEFS outlook, passed replay test); the rest are carried as now.
   Light: lookups and comparisons per unit; the gauge-in-tehsil table is built once per drought-water.json change. */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ORDER = ['meteorological', 'agricultural', 'hydrological'];

export function bandOf(v, ind) {
  if (v == null || !isFinite(v) || !ind) return null;
  let b = 0;
  if (Array.isArray(ind.cutsAtMost)) ind.cutsAtMost.forEach((c, i) => { if (v <= c) b = i + 1; });
  else if (Array.isArray(ind.cutsBelow)) ind.cutsBelow.forEach((c, i) => { if (v < c) b = i + 1; });
  return Math.min(4, b);
}

/* main type: most severe at or above `active`; tie -> later in the propagation order */
export function mainOf(types, active) {
  let best = null;
  for (const t of ORDER) { const b = types[t]; if (b == null || b < active) continue; if (!best || b >= types[best]) best = t; }
  return best;
}

function inRing(x, y, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j];
  if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; }
function inGeom(x, y, g) { if (!g) return false; const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some(p => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h))); }

export function createDroughtType(dataDir) {
  const C = {};
  const J = (name) => { try { const f = join(dataDir, name); if (!existsSync(f)) return null; const mt = statSync(f).mtimeMs; const c = C[name];
    if (c && c.mt === mt && Date.now() - c.at < 600e3) return c.v; if (c && c.mt === mt) { c.at = Date.now(); return c.v; }
    const v = JSON.parse(readFileSync(f, 'utf8')); C[name] = { mt, v, at: Date.now() }; return v; } catch (_) { return null; } };
  let GAUGE = null, gaugeKey = null;
  function gaugesByUnit(water) {
    if (!water || !Array.isArray(water.rivers)) return {};
    const k = water.built + '|' + water.asOf; if (GAUGE && gaugeKey === k) return GAUGE;
    const fc = J('pk-tehsils.json'); const out = {};
    if (fc && fc.features) for (const r of water.rivers) { if (r.lat == null || r.lon == null) continue;
      const f = fc.features.find(ft => { const g = ft.geometry; return g && inGeom(r.lon, r.lat, g); });
      if (f) (out[f.properties.uid] = out[f.properties.uid] || []).push(r); }
    GAUGE = out; gaugeKey = k; return out;
  }
  function scheme() { return J('drought-type.json'); }
  /* the band at which the level leaves Low: USDM category of drought-class.json categories.Monitor, on the rain ranges */
  function activeBand() { const S = scheme(), DC = J('drought-class.json'); const m = DC && DC.categories && DC.categories.Monitor;
    return (S && m && m.indexAtMost != null) ? bandOf(m.indexAtMost, S.indicators.rain) : null; }

  /* U: unit map from droughtNational(); idx(rec) -> {name, value} of the rain index the level used */
  const LEVEL_ACTIVE = ['Monitor', 'Watch', 'Act'];
  function attach(U, { water, recent, outlook, outlookOn, idx, levelOf = (u) => (u && u.drought && u.drought.applicable !== false) ? u.drought.class : null }) {
    const S = scheme(); if (!S) return null; const A = activeBand(); if (A == null) return null;
    const WH = (S.withheld && typeof S.withheld === 'object') ? S.withheld : {};
    const I = S.indicators, G = gaugesByUnit(water), counts = { meteorological: 0, agricultural: 0, hydrological: 0, none: 0, noData: 0, heldByLevel: 0 };
    const ocounts = { meteorological: 0, agricultural: 0, hydrological: 0, none: 0 };
    for (const [k, u] of Object.entries(U)) {
      const ix = idx(u); const arid = !!(u.drought && u.drought.applicable === false);
      const rain = arid ? null : bandOf(ix && ix.value, I.rain);
      const soilPct = u.smRoot && u.smRoot.percentile != null ? u.smRoot.percentile : null;
      const soil = bandOf(soilPct, I.soil), crops = bandOf(u.veg && u.veg.vhi, I.crops);
      const r = recent && recent.units ? recent.units[k] : null; const snow = bandOf(r && r.sdPct, I.snow);
      const gs = (G[k] || []).filter(g => g.shown && g.percentile != null);
      const rivB = gs.length ? Math.max(...gs.map(g => bandOf(g.percentile, I.river))) : null;
      const mx = (...a) => { const v = a.filter(x => x != null); return v.length ? Math.max(...v) : null; };
      const typesAll = { meteorological: rain, agricultural: mx(soil, crops), hydrological: mx(snow, rivB) };
      /* v91.17.283.10 · DRYSPONGE · a type listed in drought-type.json withheld (no observed truth to test it: the hydrological type) is
         never named: not main, not active, not in the 15-day view. Its indicator readings stay under indicators, marked untested. */
      const types = Object.fromEntries(Object.entries(typesAll).map(([n, v]) => [n, n in WH ? null : v]));
      const unt = (name, o) => (o && I[name] && I[name].type in WH) ? { ...o, untested: true } : o;
      /* v283 WS5 · audit A10 · ONE RULE FOR LEVEL AND TYPE. The level is the convergence of evidence (the less severe of the rain
         index and the soil percentile, data/drought-class.json); the type took the most severe single indicator, so 173 of 576
         tehsils showed a drought type beside level Low on the 5-9 Oct data (scripts/gen/ws5/drought_type_consistency.mjs). A type is
         now named only where the LEVEL itself is Monitor or above (the same 'active' boundary, USDM D1), and only the types whose
         own band reaches that boundary. Below it the indicator bands are still reported (indicators, bands) as a view, main = null. */
      const lvl = levelOf(u); const levelActive = LEVEL_ACTIVE.includes(lvl);
      const rawActive = ORDER.filter(x => types[x] != null && types[x] >= A);
      const main = levelActive ? mainOf(types, A) : null;
      const none = Object.values(types).every(v => v == null);
      if (none) counts.noData++; else counts[main || 'none']++;
      if (!levelActive && rawActive.length) counts.heldByLevel++;
      const t = { types, main, active: levelActive ? rawActive : [], level: lvl || null,
        heldByLevel: !levelActive && rawActive.length ? 'the drought level is ' + (lvl || 'not assessed') + ': ' + rawActive.join(', ') + ' indicators are dry, but the convergence rule that sets the level does not confirm a drought, so no type is named' : null,
        indicators: { rain: rain == null ? null : { band: rain, index: ix && ix.name, value: ix && ix.value }, soil: soil == null ? null : { band: soil, percentile: soilPct, at: (u.smRoot && u.smRoot.at) || null },   /* v283.24: each reading carries its own date */
          crops: crops == null ? null : { band: crops, vhi: u.veg.vhi, week: u.veg.week }, snow: snow == null ? null : unt('snow', { band: snow, percentile: r.sdPct, at: (recent && recent.to) || null }),
          rivers: gs.length ? gs.map(g => unt('river', { station: g.station, percentile: g.percentile, band: bandOf(g.percentile, I.river), at: g.asOf || (water && water.asOf) || null })) : null },
        ...(Object.keys(WH).length ? { withheld: Object.entries(WH).map(([type, why]) => ({ type, why })) } : {}),
        canalFed: u.veg && u.veg.canalFed != null ? u.veg.canalFed : null };
      /* 15-day: the meteorological type at the outlook's valid-to, the other types carried as now */
      const o = outlookOn && outlook && outlook.units ? outlook.units[k] : null;
      if (o && o.bandOutlook != null && !arid) {
        /* v283 WS5 · the 15-day view follows the same rule: a type is named only where today's level is Monitor or above (the level
           has no 15-day forecast; soil and the hydrological indicators are carried as now) */
        const t15 = { ...types, meteorological: Math.min(4, o.bandOutlook) }; const m15 = levelActive ? mainOf(t15, A) : null; ocounts[m15 || 'none']++;
        t.outlook = { validTo: outlook.validTo, types: t15, main: m15, rainBandNow: Math.min(4, o.bandNow), rainBand15: Math.min(4, o.bandOutlook), carried: ['agricultural', 'hydrological'] };
      }
      u.dtype = t;
    }
    return { activeBand: A, counts, outlookCounts: outlookOn ? ocounts : null, withheld: Object.keys(WH).length ? WH : undefined, scheme: { version: S.version, scale: S.scale, indicators: Object.fromEntries(Object.entries(I).map(([n, v]) => [n, { type: v.type, source: v.source }])), combine: S.combine, outlook: S.outlook, palette: S.palette, plain: S.plain } };
  }
  return { attach, activeBand, scheme, gaugesByUnit };
}
