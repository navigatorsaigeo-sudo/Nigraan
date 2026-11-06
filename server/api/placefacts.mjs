/* ══ v91.17.283 · FACTS283 · "THIS PLACE" FACTS FOR ONE POINT (v283.19: the facts part of the place bundle, GET /api/point) ═══════════════════════════
   One fast answer for the start page's "This place" and "Now" sections, built ONLY from data and modules this server already holds; no
   provider or other outbound call is made here (the provider proxy is never touched; every value is read from a local file or from a
   module's in-memory state).

   Every field is { value, unit, source, productType, ... } and is LEFT OUT when the server holds no data for it (the reason is listed in
   `omitted`, in plain words); nothing is null-faked. Sources are client-safe labels (no supplier of a data-sharing arrangement is named).
   The values are the console's own: the same module call the console's route makes for the same point.

     elevation        places.pointRow height (the start card's height: 30 m place height or the 250 m terrain cell; in a rough cell, where the
                      card shows none, the cell mean with its relief)
     terrainPosition  the f_landform band (Weiss 2001 landform classes from the 1 km topographic position index and slope; the class names are
                      read from the band's own method line)
     nearestWater     the w_dist band (distance to JRC Global Surface Water occurring >= 50 % of the time; the band is capped at 20 km)
     riverPoint       the nearest of NIGRAAN's river forecast points (server/contract/riverpoints.json, the list flood.mjs and the site
                      risk use): name, river and straight-line distance
     heightAboveRiver the t_hand band with its mapped-flood share class (data/hand-calibration.json), as the site screening reads it
     floodMap         flooddepth.at (JRC / GloFAS undefended river flood maps): first return period that wets the 90 m cell, else nearest
                      wet ground; left out when the map tile for the point is not on this server (index without the tile = no answer,
                      never "dry")
     floodHistory     the tehsil's share under water in the mapped floods, and pastEvents: the site screening's "What happened here
                      before" lines (data/event-memory.json, the same five lines)
     fault            faults.nearest (GEM Global Active Faults), the /api/faults/nearest answer
     glof             glof.upstream, the /api/glof/upstream answer (level word, lakes on the route, the lead lake)
     station          fleet.nearest with the start card's arguments (15 km, the fleet's own height rule), skipping a station the siting
                      offsets hold out or the station screen marks "not used"; the reading's age is taken at the request
     sun              sunrise / sunset in PKT from the NOAA solar calculator (sunterrain.mjs solarPosition), geometric zenith 90.833 deg,
                      flat horizon
     normals          this month's mean temperature and rain normal of the tehsil (climatology.normals: global reanalysis daily normals)
     landCover        ESA WorldCover 2021 shares of the 3 x 3 cells (about 750 m) around the point (s_wc_* bands) and the tehsil's
                      dominant class (terrain.landcover)

   Cache: the static part per point rounded to 4 decimals (about 11 m) for 10 minutes; the station block is recomputed on every call
   (it follows the fleet's poll and costs well under a millisecond). */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createFeatGrid } from './featgrid.mjs';
import { solarPosition } from './sunterrain.mjs';
import { label } from './refmode.mjs';

const R1 = (x) => x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10;
const R0 = (x) => x == null || !Number.isFinite(x) ? null : Math.round(x);
const kmBetween = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return 6371 * Math.hypot(x, y); };
const PKT_MS = 5 * 3600e3;
const pktHm = (ms) => new Date(ms + PKT_MS).toISOString().slice(11, 16);
const pktText = (ms) => { const d = new Date(ms + PKT_MS); return d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ', ' + pktHm(ms) + ' PKT'; };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* sunrise / sunset of the PKT day holding `ms`: the instants the geometric zenith crosses 90.833 deg (refraction 34' + solar
   semi-diameter 16', the NOAA calculator's convention), found by 10-min scan and bisection to 1 s */
export function sunTimes(lat, lon, ms) {
  const day0 = Math.floor((ms + PKT_MS) / 864e5) * 864e5 - PKT_MS;   /* 00:00 PKT */
  const f = (t) => 90.833 - solarPosition(t / 1000, lat, lon).zenith;   /* > 0: sun up */
  const cross = (a, b) => { let fa = f(a); for (let i = 0; i < 40 && b - a > 1000; i++) { const m = (a + b) / 2, fm = f(m); if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m; } return Math.round((a + b) / 2); };
  let rise = null, set = null, prev = f(day0);
  for (let t = day0 + 600e3; t <= day0 + 864e5; t += 600e3) { const v = f(t); if (prev <= 0 && v > 0 && rise == null) rise = cross(t - 600e3, t); if (prev > 0 && v <= 0 && rise != null) set = cross(t - 600e3, t); prev = v; }
  return { rise, set, date: new Date(day0 + PKT_MS).toISOString().slice(0, 10) };
}

export function createPlaceFacts(app, dataDir) {
  const fg = () => app.featGrid || (app.featGrid = createFeatGrid(dataDir));
  const json = (() => { const C = new Map(); return (name) => { const f = join(dataDir, name); try { const mt = statSync(f).mtimeMs; const c = C.get(name); if (c && c.mt === mt) return c.j; const j = JSON.parse(readFileSync(f, 'utf8')); C.set(name, { mt, j }); return j; } catch (_) { return null; } }; })();
  const band = (b, lat, lon) => { try { const v = fg().value(b, lat, lon); return v == null || !Number.isFinite(v) ? null : v; } catch (_) { return null; } };
  const bandMeta = (b) => { try { const f = join(dataDir, 'feat', b + '.json'); return existsSync(f) ? json(join('feat', b + '.json')) : null; } catch (_) { return null; } };
  const productType = (gateId, dflt) => { try { return (app.gate && app.gate.productTypeOf ? app.gate.productTypeOf(gateId) : null) || dflt; } catch (_) { return dflt; } };

  /* ── terrain position: the class names come from the band's own method line ("1 canyon 2 shallow valley ... 10 high ridge") ── */
  /* v91.17.283.3 · W2 · classes 1-3 are drainage lines, not valley floors (Weiss 2001: canyons / deeply incised streams; midslope drainages /
     shallow valleys; upland drainages / headwaters); only class 4 (U-shaped valley) is a valley floor */
  const LF_GROUP = { 1: 'canyon or deeply cut stream', 2: 'shallow valley (drainage on a slope)', 3: 'headwater drainage', 4: 'valley floor', 5: 'plain', 6: 'slope', 7: 'upper slope', 8: 'ridge', 9: 'ridge', 10: 'ridge' };
  function landformNames() { const m = bandMeta('f_landform'); const s = m && m.method ? String(m.method) : ''; const out = {}; const re = /(\d+) ([a-z][a-z ]*?)(?= \d+ |$)/g; let x; const tail = s.slice(s.indexOf(': ') + 2); while ((x = re.exec(tail))) out[x[1]] = x[2].trim(); return out; }
  /* ── the height above the nearest river: the site screening's class of mapped-flood shares (hand-calibration.json) ── */
  function handClass(h) { const B = json('hand-calibration.json'), b = B && B.bands && B.bands.t_hand; if (h == null || !b) return null;
    const c = b.classes.find((x) => h >= x.fromM && (x.toM == null || h < x.toM)); if (!c) return null;
    const fl = Object.entries(c.floodedShare).filter(([k, v]) => b.events[k] && b.events[k].fitted && v != null).map(([k, v]) => ({ year: k.slice(-4), pct: R1(100 * v) }));
    return fl.length ? { fromM: c.fromM, toM: c.toM, flooded: fl } : null; }
  /* ── the flood map tile must be on disk: an index entry without its file reads as dry in flooddepth.mjs ── */
  function floodTileHere(lat, lon) { const IX = json(join('flood-depth', 'index.json')); const G = IX && IX.grid; if (!G) return false;
    const N = G.cellsPerDegree, row = Math.floor((G.top - lat) * N), col = Math.floor((lon - G.left) * N), cr = Math.floor(row / N), cc = Math.floor(col / N);
    const name = 'jrc_N' + (G.top - cr) + '_E' + (G.left + cc) + '.bin';
    if (!(IX.files && IX.files[name])) return 'unpacked';   /* not packed: flooddepth.mjs reads it dry by design (no wet cell in that degree) */
    return existsSync(join(dataDir, 'flood-depth', name)) ? 'file' : false; }

  function staticFacts(lat, lon) {
    const F = {}, omitted = [];
    const miss = (field, why) => omitted.push({ field, why });
    let row = null; try { row = app.places.pointRow(lat, lon); } catch (_) { row = null; }
    if (!row) return { ok: false, why: 'the point could not be placed' };
    if (!row.administered) return { ok: false, outside: true, why: row.why || 'outside Pakistan-administered territory' };
    const unitId = row.unitId;
    const point = { lat, lon, tehsil: row.tehsil || null, district: row.district || null, province: row.province || null };

    /* elevation */
    if (row.elevM != null) F.elevation = { value: row.elevM, unit: 'm', source: 'terrain model (Copernicus DEM, 30 m)', productType: 'Reference', basis: row.heightBasis };
    else if (row.cellElevM != null) F.elevation = { value: row.cellElevM, unit: 'm', source: 'terrain model (Copernicus DEM, 30 m)', productType: 'Reference', basis: '250 m terrain cell mean', reliefM: row.reliefM ?? null, note: 'mean of the 250 m cell, which spans ' + row.reliefM + ' m of relief' };
    else miss('elevation', 'no terrain height held for this point');

    /* terrain position */
    const lf = band('f_landform', lat, lon);
    if (lf != null && LF_GROUP[lf]) { const nm = landformNames()[lf]; F.terrainPosition = { value: LF_GROUP[lf], unit: null, landform: nm || null, source: 'terrain model (Copernicus DEM, 30 m; landform classes of Weiss 2001)', productType: 'Reference', cellM: 250 }; }
    else miss('terrainPosition', 'no landform class held for this point');

    /* nearest persistent surface water */
    const wd = band('w_dist', lat, lon); const wm = bandMeta('w_dist'); const cap = wm && Number.isFinite(wm.cap_km) ? wm.cap_km : null;
    if (wd != null) F.nearestWater = { value: R1(wd), unit: 'km', ...(cap != null && wd >= cap ? { atLeast: true } : {}), what: 'river, lake or reservoir water present at least ' + ((wm && wm.threshold_pct) || 50) + ' % of the time since 1984', source: 'satellite surface water record (JRC Global Surface Water)', productType: 'Reference' };
    else miss('nearestWater', 'no surface water distance held for this point');

    /* nearest river forecast point (named) */
    try { const P = (app.flood && app.flood.POINTS) || []; let best = null;
      for (const p of P) { if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue; const d = kmBetween(lat, lon, p.lat, p.lon); if (!best || d < best.d) best = { p, d }; }
      if (best) F.riverPoint = { value: R1(best.d), unit: 'km', name: best.p.name, river: best.p.river, what: 'straight-line distance to the nearest NIGRAAN river forecast point', source: 'NIGRAAN river forecast points', productType: 'Reference' };
      else miss('riverPoint', 'no river forecast points on this server'); } catch (_) { miss('riverPoint', 'no river forecast points on this server'); }

    /* height above the nearest river (HAND) */
    const hand = band('t_hand', lat, lon);
    if (hand != null) { const c = handClass(R1(hand)); F.heightAboveRiver = { value: R1(hand), unit: 'm', ...(c ? { mappedFloods: c.flooded.map((x) => ({ year: x.year, pctOfSuchGround: x.pct })) } : {}), source: 'terrain model (height above nearest drainage)', productType: 'Reference' }; }
    else miss('heightAboveRiver', 'the height-above-river grid is not on this server');

    /* mapped river flood extent at the point */
    try { const tile = floodTileHere(lat, lon); const FD = tile && app.floodDepth ? app.floodDepth.at(lat, lon, null) : null;
      if (FD && FD.ready) { const wet = FD.firstWetReturnPeriod; const nearRp = (FD.rows.find((r) => r.within270mM > 0) || {}).returnPeriod;
        F.floodMap = { value: wet != null ? 'in the mapped flood extent' : nearRp ? 'beside the mapped flood extent' : 'outside the mapped flood extent', unit: null,
          ...(wet != null ? { wetFromReturnPeriod: wet, depthM: FD.rows[FD.returnPeriods.indexOf(wet)].depthM } : {}), ...(wet == null && nearRp ? { within270mFromReturnPeriod: nearRp } : {}),
          ...(wet == null && !nearRp && FD.nearestWet ? { nearestWetKm: FD.nearestWet.km, nearestWetFromReturnPeriod: FD.nearestWet.firstWetReturnPeriod } : {}),
          summary: FD.summary, source: 'global river flood maps (JRC / Copernicus GloFAS, undefended, 1-in-10 to 1-in-500 years)', productType: 'Reference' }; }
      else miss('floodMap', tile === false ? 'the river flood map tile for this point is not on this server' : (FD && FD.why) || 'the river flood maps are not on this server'); } catch (_) { miss('floodMap', 'the river flood maps could not be read'); }
    /* v91.17.283.15 · the river flood facts of the v2 science at the named place (floodfacts.mjs: the native 90 m pixel with the coverage
       record and the channel review, the observed flood history; an observed flood leads where the maps say dry) replace the line's
       text where the table holds the place; the hill-torrent corridor (1-in-100) beside it. Facts, never a level. */
    try { const X = app.floodFacts ? app.floodFacts.at(lat, lon) : null;
      if (X && X.found) {
        F.floodMap = { ...(F.floodMap || { value: null, unit: null }), summary: X.river.words, riverFacts: { ...X.river, observed: X.observed, here: X.here, km: X.km },
          source: 'river flood maps (JRC / Copernicus GloFAS, undefended, 1-in-10 to 1-in-500 years) and satellite flood observations (UNOSAT, government outlines, Sentinel-1, MODIS)', productType: 'Reference' };
        for (let i = omitted.length - 1; i >= 0; i--) if (omitted[i].field === 'floodMap') omitted.splice(i, 1);
        F.flashCorridor = { value: X.flash.status, unit: null, summary: X.flash.words, returnPeriod: 100, handM: X.flash.handM, here: X.here, km: X.km,
          source: 'terrain height above the nearest stream (GLO-30 HAND) and mapped streams', productType: 'Susceptibility' }; }
      else miss('flashCorridor', (X && X.why) || 'the flood facts table is not on this server'); } catch (_) { miss('flashCorridor', 'the flood facts table could not be read'); }

    /* past events of the tehsil: the site screening's "What happened here before" record (data/event-memory.json), the same five lines */
    { const M = json('event-memory.json'); const ev = M && M.units ? M.units[unitId] : null;
      if (ev && ev.length) { const fl = ev.filter((e) => e.type === 'flood' && Number.isFinite(e.value)).map((e) => ({ year: e.year, pctOfTehsil: Math.round(e.value * 100) })).sort((a, b) => a.year - b.year);
        if (fl.length) F.floodHistory = { value: fl, unit: '% of tehsil under water', scope: 'tehsil', what: 'mapped floods of 2010, 2014, 2022 and 2025: share of the tehsil under water (the larger of two satellite maps)', source: 'satellite flood extents', productType: 'Reference' };
        else miss('floodHistory', 'no mapped flood covered this tehsil');
        F.pastEvents = { value: ev.slice(0, 5).map((e) => e.text), unit: null, scope: 'tehsil', source: 'satellite flood extents, a global landslide catalogue, documented glacial lake outbursts, AGN stations', productType: 'Reference' }; }
      else miss('floodHistory', M ? 'no recorded past event in this tehsil' : 'the past-event record is not on this server'); }

    /* nearest active fault */
    try { const nf = app.faults ? app.faults.nearest(lat, lon) : null;
      if (nf && nf.ok && nf.nearest) { const n = nf.nearest; F.fault = { value: n.distanceKm, unit: 'km', ...(n.name ? { name: n.name } : {}), kind: n.kind, slipType: n.slipType || null, faultsWithin50Km: nf.faultsWithinKm ? nf.faultsWithinKm[50] : null, source: 'GEM Global Active Faults Database', productType: productType('seismic', 'Reference') }; }
      else if (nf && nf.ok) F.fault = { value: null, unit: 'km', note: nf.note, source: 'GEM Global Active Faults Database', productType: 'Reference' };
      else miss('fault', (nf && nf.why) || 'the active fault map is not on this server'); } catch (_) { miss('fault', 'the active fault map could not be read'); }
    if (F.fault && F.fault.value == null) { miss('fault', F.fault.note || 'no mapped active fault within 300 km'); delete F.fault; }

    /* GLOF upstream */
    try { const g = app.glof ? app.glof.upstream(lat, lon, { limit: 1 }) : null;
      if (g && g.ok && g.applicable === false) F.glof = { value: 'No glacial lake upstream', unit: null, applicable: false, routeKm: g.routeKm, source: label('lakeInventory'), productType: productType('glof', 'Susceptibility') };
      else if (g && g.ok) { const L = (g.lakes || [])[0]; F.glof = { value: g.word, unit: null, applicable: true, level: g.level, lakesOnRoute: g.counts ? g.counts.lakes : (g.lakes || []).length, ...(g.counts ? { priorityLakes: g.counts.priority, elevatedLakes: g.counts.elevated } : {}), routeKm: g.routeKm,
          ...(L ? { leadLake: { name: L.name, kmAlong: R1(L.kmAlong), tier: L.tierLabel } } : {}), source: label('lakeInventory'), productType: productType('glof', 'Susceptibility') }; }
      else miss('glof', (g && g.why) || 'the glacial lake register is not on this server'); } catch (_) { miss('glof', 'the glacial lake register could not be read'); }

    /* this month's normals of the tehsil */
    try { const C = app.climatology; const now = Date.now() + PKT_MS; const d = new Date(now); const y = d.getUTCFullYear(), m = d.getUTCMonth();
      const nd = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); let tm = 0, nt = 0, pr = 0, np = 0;
      for (let k = 1; k <= nd; k++) { const iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(k).padStart(2, '0'); const n = C && C.normals ? C.normals(unitId, iso) : null; if (!n) continue; if (Number.isFinite(n.tm)) { tm += n.tm; nt++; } if (Number.isFinite(n.pr)) { pr += n.pr; np++; } }
      if (nt === nd) { const per = C.anomalyPeriod ? C.anomalyPeriod() : null;
        F.normals = { value: { meanTempC: R1(tm / nt), ...(np === nd ? { rainMm: R0(pr) } : {}) }, unit: { meanTempC: '°C', rainMm: 'mm' }, month: MONTHS[m], scope: 'tehsil',
          what: 'normal daily mean temperature and total rain of ' + MONTHS[m] + ' for the tehsil (at its settlement height); daily maximum and minimum normals are not held', source: label('reanalysis') + ' daily normals' + (per ? ' ' + per : ''), productType: 'Reference' }; }
      else miss('normals', 'no climate normal held for this tehsil'); } catch (_) { miss('normals', 'the climate normals could not be read'); }

    /* land cover around the point (3 x 3 cells of 250 m) and the tehsil's dominant class */
    { const meta = bandMeta('s_wc_tree'); const cell = meta && meta.grid ? meta.grid.cell : null; const K = ['tree', 'crop', 'built', 'bare']; const acc = { tree: 0, crop: 0, built: 0, bare: 0 }; let n = 0;
      if (cell) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const v = K.map((k) => band('s_wc_' + k, lat + i * cell, lon + j * cell)); if (v.some((x) => x == null)) continue; K.forEach((k, q) => { acc[k] += v[q]; }); n++; }
      if (n) { const sh = {}; let s = 0; for (const k of K) { sh[k] = Math.round(acc[k] / n * 100); s += acc[k] / n; } sh.other = Math.max(0, Math.round((1 - s) * 100));
        let tehsil = null; try { const t = app.terrain && app.terrain.landcover ? app.terrain.landcover(unitId) : null; if (t && t.shares) { const top = Object.entries(t.shares).filter(([, v]) => Number.isFinite(v)).sort((a, b) => b[1] - a[1])[0]; if (top) tehsil = { dominant: top[0], pct: Math.round(top[1] * (top[1] <= 1 ? 100 : 1)) }; } } catch (_) {}
        F.landCover = { value: sh, unit: '% of ground', around: 'about 750 m around the point', other: 'grass, shrub, water, snow, wetland', ...(tehsil ? { tehsil } : {}), source: 'ESA WorldCover 2021 (10 m)', productType: 'Reference' }; }
      else miss('landCover', 'no land cover held for this point'); }

    /* sun */
    { const s = sunTimes(lat, lon, Date.now()); if (s.rise != null && s.set != null) F.sun = { value: { sunrise: pktHm(Math.round(s.rise / 60e3) * 60e3), sunset: pktHm(Math.round(s.set / 60e3) * 60e3) }, unit: 'PKT', date: s.date, what: 'on a flat horizon; hills and valley sides delay sunrise and advance sunset', source: 'computed (NOAA solar calculator)', productType: 'Reference' }; else miss('sun', 'no sunrise or sunset this day'); }

    return { ok: true, point, unitId, fields: F, omitted };
  }

  const cache = new Map(); const TTL = 10 * 60e3;
  const counters = { calls: 0, hits: 0 };
  function facts(lat, lon) {
    counters.calls++;
    const la = Math.round(lat * 1e4) / 1e4, lo = Math.round(lon * 1e4) / 1e4, key = la + ',' + lo; let hit = cache.get(key), cached = true;
    if (!hit || Date.now() - hit.at > TTL) { cached = false; hit = { at: Date.now(), v: staticFacts(la, lo) }; cache.set(key, hit); if (cache.size > 2000) cache.delete(cache.keys().next().value); } else counters.hits++;
    const S = hit.v; if (!S.ok) return S;
    /* v91.17.283.19 · no station field here: the place bundle (GET /api/point) carries the ONE nearest station of the place */
    const fields = { ...S.fields }, omitted = S.omitted.slice();
    return { ok: true, point: S.point, at: new Date().toISOString(), staticAt: new Date(hit.at).toISOString(), cached, fields, omitted,
      note: 'Facts about this place from data NIGRAAN holds; a field with no data is left out and listed under omitted. Reference values are not forecasts.' };
  }
  return { facts, stats: () => ({ ...counters, cached: cache.size }) };
}
