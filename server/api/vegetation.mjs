/* v91.17.101 · C1/N8 + C3 · VEGETATION HEALTH AND CANAL-FED TEHSILS beside the rain-based drought index.
   data/vegetation-health.json (station-lake/scripts/vhi_fetch.py): weekly satellite vegetation health (VHI = VCI + TCI, 4 km) per tehsil,
   median over vegetated pixels. data/canal-fed.json (canal_density.py): canal length per 100 km2 from the national irrigation network.
   A rain deficit in a canal-fed tehsil is not by itself crop stress; the vegetation index is what says whether the crops feel it.
   Classes: data/vegetation-health-scale.json (Kogan 1995/2002). Neither file changes the drought class; both travel beside it. */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function createVegetation(app, dataDir) {
  const F = { vh: join(dataDir, 'vegetation-health.json'), cf: join(dataDir, 'canal-fed.json'), sc: join(dataDir, 'vegetation-health-scale.json') };
  const C = {}; const M = {}; const T = {};
  /* v91.17.233 · the file is checked on disk at most every 30 s (the laptop profile: existsSync/statSync on every call, 8 s in 150 s) */ 
  const load = (k) => { const now = Date.now(); if (T[k] && now - T[k] < 30e3) return C[k]; T[k] = now; try { if (!existsSync(F[k])) { C[k] = null; return null; } const m = statSync(F[k]).mtimeMs; if (M[k] !== m) { C[k] = JSON.parse(readFileSync(F[k], 'utf8')); M[k] = m; } } catch (_) { C[k] = null; } return C[k]; };
  function levelOf(vhi) { const S = load('sc'); if (!S || vhi == null) return null; for (const c of S.cuts) if (c.max == null || vhi < c.max) return c; return null; }
  function weeks() { const V = load('vh'); return V ? V.weeks.slice().reverse() : []; }
  function unit(uid, weekIdx = 0) {
    const V = load('vh'), CF = load('cf'); const W = weeks(); const w = W[Math.min(weekIdx, W.length - 1)];
    const cf = CF && CF.units ? CF.units[uid] : null;
    const canal = cf ? { canalFed: cf.canalFed, kmPer100Km2: cf.kmPer100Km2, cut: CF.cut } : null;
    if (!V || !w) return { ready: false, why: 'no vegetation-health weeks on this computer yet (station-lake/scripts/vhi_fetch.py)', canal };
    const r = (V.units[uid] || {})[w.week];
    if (!r) return { ready: true, week: w.week, mid: w.mid, why: 'no vegetation value for this unit in ' + w.week, canal };
    if (r.vhi == null) return { ready: true, week: w.week, mid: w.mid, why: r.why, canal };
    const L = levelOf(r.vhi);
    return { ready: true, week: w.week, mid: w.mid, vhi: r.vhi, vci: r.vci, tci: r.tci, stressShare: r.stressShare, level: L ? L.level : null, word: L ? L.word : null, canal };
  }
  /* the plain-language cross-reading of rain deficit and vegetation for one unit, given the served drought class */
  function reading(uid, droughtClass) {
    const v = unit(uid); if (!v || v.vhi == null) return v && v.canal && v.canal.canalFed ? 'canal-fed tehsil (' + v.canal.kmPer100Km2 + ' km of canal per 100 km2): a rain deficit here is not by itself crop stress' : null;
    const dry = droughtClass && !/^(Low|Normal)/i.test(droughtClass), stressed = v.vhi < 40, canal = v.canal && v.canal.canalFed;
    if (dry && canal && !stressed) return 'rain deficit, but the vegetation is healthy (VHI ' + v.vhi + ', ' + v.week + '): a canal-fed tehsil, the crops are irrigated';
    if (dry && stressed) return 'rain deficit and stressed vegetation (VHI ' + v.vhi + ', ' + v.week + '): the drought reaches the crops';
    if (!dry && stressed) return 'rain near normal but the vegetation is stressed (VHI ' + v.vhi + ', ' + v.week + '): heat, water supply or pests, not the rain';
    return 'vegetation healthy (VHI ' + v.vhi + ', ' + v.week + ')' + (canal ? '; canal-fed tehsil' : '');
  }
  function status() { const V = load('vh'), CF = load('cf'); return { ready: !!V, built: V && V.built, weeks: V ? V.weeks.map((w) => w.week) : [], canal: CF ? CF.counts : null }; }
  return { unit, reading, weeks, status, levelOf, scale: () => load('sc') };
}
