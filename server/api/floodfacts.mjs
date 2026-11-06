/* == v91.17.283.15 . RIVER FLOOD AND FLASH-FLOOD FACTS AT A PLACE (data/flood-facts.json, scripts/v28315/build_flood_facts.py) ============
   The cloud v2 science (HISAAB's native-pixel method on the JRC / GloFAS river flood maps, the coverage record, the national channel review,
   the observed-flood store, the 1-in-100 hill-torrent corridor) computed once per named place of the gazetteer and read here as FACTS: no
   level, no alert. The river level stays the issued flood_riverine (hazsci.mjs); these sentences are added to the river flood fact line.
   Rule (23 Oct 2026): when satellites saw flood water at the place but the model maps say dry, the observed fact leads the sentence.
   A point is given the facts of the named place it stands on (within 0.1 km: "here"), else of the nearest named place within 1 km, named
   by its name and distance; beyond 1 km no facts are given (the facts are pixel facts, not area facts). v91.17.283.20: the row is chosen by
   location only (as v283.16); the one place table (server/api/places.mjs) only names it. */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KM = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return 6371 * Math.hypot(x, y); };
export const HERE_KM = 0.1, NEAR_KM = 1;   /* the place's own pixel neighbourhood (90 m pixels) and the largest distance a fact is lent over */
const yrs = (ys) => (ys.length > 3 && ys[ys.length - 1] - ys[0] === ys.length - 1 ? ys[0] + '-' + ys[ys.length - 1] : ys.join(', '));

/* one table row -> the facts and their words (the v2 sentences) */
export function factsOf(T, i, where = 'this place') {
  const bits = (m) => T.years.filter((_, k) => Math.floor(m / 2 ** k) % 2 === 1);
  const rs = T.rs[i], fw = T.fw[i] || null, f5 = T.f5[i] || null, d100 = T.d100[i] >= 0 ? T.d100[i] / 100 : null;
  const fy = bits(T.fy[i]), sy = bits(T.sy[i]), mf = T.mf[i], mo = T.mo[i];
  const modis = mo ? 'MODIS: flooded in ' + mf + ' of ' + mo + ' monsoons 2002-2024' : null;
  let river, observedLeads = false;
  if (rs === 0 && fy.length) {   /* the observation outranks the map's "does not reach" */
    observedLeads = true;
    river = 'Satellites saw flood water at ' + where + ' in ' + (sy.length ? fy.length + ' of ' + sy.length + ' years observed (' + fy.join(', ') + ')' : fy.join(', ')) + (modis ? '; ' + modis : '') + '; the river flood model maps do not reach ' + where + ' (model scenarios up to 1 in 500 years)';
  } else {
    if (rs === 0) river = 'River flood water does not reach ' + where + ' in any mapped flood up to 1 in 500 years (model scenarios; not a guarantee of safety)';
    else if (rs === 1) { const p = []; if (fw) p.push('Mapped river flood water first reaches ' + where + ' in the 1-in-' + fw + '-year flood'); if (f5) p.push('0.5 m deep from the 1-in-' + f5 + '-year flood');
      if (d100 != null) p.push(d100 >= 0.05 ? d100.toFixed(1) + ' m in the 1-in-100-year flood' : 'dry in the 1-in-100-year flood'); river = p.join('; ') + ' (model scenarios, not a chance for any one year)'; }
    else if (rs === 2) river = 'The river flood maps hold ' + where + ' for some return periods only: no complete facts';
    else if (rs === 4) river = 'The flood map and a satellite review of the river channel disagree at ' + where + ': no river flood facts are given until it is resolved';
    else river = 'River flood maps do not establish ' + where + ': unknown, not dry';
    river += fy.length ? '. Satellites saw flood water at ' + where + ' in ' + fy.join(', ') + (modis ? ' (' + modis + ')' : '')
      : sy.length ? '. Satellites looked in ' + yrs(sy) + ' and saw no flood water at ' + where + ' (not a guarantee of safety)' : '. No satellite flood map covers ' + where;
  }
  const fl = T.fl[i], fh = T.fh[i] === 255 ? null : T.fh[i] / 10;
  const flash = fl === 4 ? 'In a hill-torrent corridor: ' + (fh != null ? fh.toFixed(1) + ' m' : 'close') + ' above the nearest stream, within the depth a 1-in-100-year storm can raise a torrent (a screening map, not a chance for any one year)'
    : fl === 3 ? 'Outside the hill-torrent corridor of a 1-in-100-year storm (' + (fh != null ? fh.toFixed(1) + ' m' : 'well') + ' above the nearest stream); not a guarantee of safety'
    : fl === 2 ? 'Hill-torrent corridors are mapped only in hilly ground away from the big rivers; no claim is made here'
    : fl === 1 ? 'Outside the mapped area for hill torrents: unknown, not safe' : 'Hill-torrent corridors are not mapped for this place: unknown, not safe';
  return { river: { status: ['dry', 'wet', 'partial', 'unknown', 'withheld'][rs], firstWetReturnPeriod: fw, first0p5mReturnPeriod: f5, depth100M: d100, words: river, observedLeadsMap: observedLeads },
    observed: { floodYears: fy, observedYears: sy, modisFlooded: mo ? mf : null, modisObserved: mo || null },
    flash: { status: ['not mapped', 'outside the mapped area', 'outside the flash domain', 'outside the corridor', 'in the corridor'][fl], returnPeriod: 100, handM: fh, words: flash } };
}

export function createFloodFacts(dataDir, places) {
  let T = null, mt = 0, IX = null;
  function table() { const f = join(dataDir, 'flood-facts.json'); let m = 0; try { m = statSync(f).mtimeMs; } catch (_) { T = null; return null; }
    if (T && m === mt) return T; try { T = JSON.parse(readFileSync(f, 'utf8')); mt = m; IX = new Map(); for (let i = 0; i < T.lat.length; i++) { const k = Math.floor(T.lat[i] / 1000) + ',' + Math.floor(T.lon[i] / 1000); let a = IX.get(k); if (!a) IX.set(k, (a = [])); a.push(i); } } catch (_) { T = null; } return T; }
  /* v91.17.283.20 · item A1 · the facts are lent BY LOCATION exactly as v283.15/16 did: the nearest row of the table within 1 km of the
     point (0.01 deg buckets, as many around it as cover 1 km at its latitude: v283.24 H18), "here" within 0.1 km. The one place table is used only to NAME that row's place (the
     nearest populated record within 0.1 km of the row point); a row with no such record keeps the v283.16 words "the nearest named place". */
  function at(lat, lon) {
    const t = table(); if (!t) return { ready: false, why: 'the flood facts table (data/flood-facts.json) is not on this server' };
    const r = Math.floor(lat * 100), c = Math.floor(lon * 100); let best = -1, bk = Infinity;
    /* v91.17.283.24 · self-audit H18 · the buckets searched cover NEAR_KM in distance: a 0.01 deg longitude bucket is under 1 km wide at high
       latitude (0.89 km at 37 N), so the fixed 3 x 3 missed a row within 1 km two buckets away */
    const di = Math.ceil(NEAR_KM / (111.2 * 0.01)), dj = Math.ceil(NEAR_KM / (111.2 * 0.01 * Math.max(0.1, Math.cos(lat * Math.PI / 180))));
    for (let i = -di; i <= di; i++) for (let j = -dj; j <= dj; j++) for (const k of IX.get((r + i) + ',' + (c + j)) || []) { const d = KM(lat, lon, t.lat[k] / 1e5, t.lon[k] / 1e5); if (d < bk) { bk = d; best = k; } }
    if (best < 0 || bk > NEAR_KM) return { ready: true, found: false, why: 'no named place within ' + NEAR_KM + ' km: the flood facts are held per named place' };
    const here = bk <= HERE_KM, plat = t.lat[best] / 1e5, plon = t.lon[best] / 1e5;
    let rec = null; try { rec = places && places.nearestRecord ? places.nearestRecord(plat, plon, { km: HERE_KM, populated: true }) : null; } catch (_) { rec = null; }
    const where = here ? 'this place' : (rec ? rec.name : 'the nearest named place') + ' (' + (Math.round(bk * 10) / 10) + ' km away)';
    return { ready: true, found: true, here, km: Math.round(bk * 100) / 100, place: { ...(rec ? { id: rec.id, name: rec.name } : {}), lat: plat, lon: plon }, ...factsOf(t, best, where),
      version: t.version, sources: t.sources };
  }
  return { at, table };
}
