#!/usr/bin/env node
/* ══ v91.17.72 · NASA FIRMS ACTIVE FIRES → data/fires.json ═══════════════════════════════════════════════════════════
   Crop-residue burning drives the Punjab/KP smog season (Oct-Dec). This pulls the open FIRMS CSV files (no MAP_KEY):
     - NRT: last 7 days, S-NPP / NOAA-20 / NOAA-21 VIIRS (375 m) and MODIS C6.1 (1 km), South Asia files;
     - archive (--archive): S-NPP VIIRS country files, Pakistan + India, 2019-2024, 25 Sep-31 Dec (2025 not published
       as a country file on 26 Sep 2026 [measured: 404]).
   Every row is clipped to data/fires-config.json bbox (Pakistan + the upwind Indian Punjab/Haryana belt), filtered to
   presumed vegetation fires (confidence nominal/high; archive type 0; NRT rows on archive static-source cells dropped;
   cropland share from the feature grid band s_wc_crop when that band exists), de-duplicated across satellites, and
   counted per tehsil (point in polygon, data/pk-tehsils.json) and per upwind sector per local (PKT) day.
   Streams every file line by line; nothing raw is written to disk.
     node scripts/firms_fetch.mjs                  NRT → data/fires.json
     node scripts/firms_fetch.mjs --archive        archive → data/fires-archive.json (sector/tehsil season summaries,
                                                   static-source cells)
     --data <dir>   data directory (default ../data)     --points <file>  also write the archive points (validation)
   Licence: NASA open data, attribution "NASA FIRMS" (header of both output files). */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export function loadFireConfig(dataDir) { return JSON.parse(readFileSync(join(dataDir, 'fires-config.json'), 'utf8')); }

/* ── tehsil polygons: bbox + ray casting, 0.5° bucket index ─────────────────────────────────────────────────────── */
export function tehsilIndex(dataDir) {
  const g = JSON.parse(readFileSync(join(dataDir, 'pk-tehsils.json'), 'utf8'));
  const polys = g.features.map(f => {
    const P = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    let s = 90, n = -90, w = 180, e = -180;
    for (const poly of P) for (const [x, y] of poly[0]) { if (y < s) s = y; if (y > n) n = y; if (x < w) w = x; if (x > e) e = x; }
    const disputed = /Occupied/i.test(f.properties.province || '');
    return { uid: f.properties.uid, province: f.properties.province, disputed, P, s, n, w, e };
  });
  const B = new Map(), k = (i, j) => i + ',' + j;
  polys.forEach((p, idx) => { for (let i = Math.floor(p.s * 2); i <= Math.floor(p.n * 2); i++) for (let j = Math.floor(p.w * 2); j <= Math.floor(p.e * 2); j++) { const kk = k(i, j); if (!B.has(kk)) B.set(kk, []); B.get(kk).push(idx); } });
  const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const inPoly = (x, y, P) => P.some(poly => inRing(x, y, poly[0]) && !poly.slice(1).some(h => inRing(x, y, h)));
  function find(lat, lon) {
    const c = B.get(k(Math.floor(lat * 2), Math.floor(lon * 2))); if (!c) return null;
    for (const idx of c) { const p = polys[idx]; if (lat >= p.s && lat <= p.n && lon >= p.w && lon <= p.e && inPoly(lon, lat, p.P)) return p; }
    return null;
  }
  return { find, polys };
}

/* ── CSV streaming ───────────────────────────────────────────────────────────────────────────────────────────────── */
export async function streamCsv(url, onRow, opts = {}) {
  /* FIRMS answers a transient 503 now and then [measured, 26 Sep 2026]: up to three tries before a file counts as failed */
  let st = null, seen = 0; const count = (o) => { seen++; onRow(o); };
  for (let t = 0; t < 3; t++) {
    try { st = await streamOnce(url, count, opts); } catch (e) { st = { ok: false, error: e.message, rows: seen }; }
    if (st.ok || (st.status && st.status < 500) || seen > 0) return st;   /* a cut after rows were counted is not retried (no double count) */
    await new Promise(z => setTimeout(z, 2000 * (t + 1)));
  }
  return st;
}
async function streamOnce(url, onRow, { timeoutMs = 600000 } = {}) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { 'user-agent': 'NIGRAAN firms_fetch (AI Geo Navigators)' } });
    if (!r.ok) { try { await r.body?.cancel(); } catch {} return { ok: false, status: r.status, rows: 0 }; }
    const dec = new TextDecoder(); let buf = '', head = null, rows = 0;
    const line = (s) => { if (!s) return; const a = s.split(','); if (!head) { head = a.map(x => x.trim()); return; } const o = {}; for (let i = 0; i < head.length; i++) o[head[i]] = a[i]; rows++; onRow(o); };
    for await (const chunk of r.body) { buf += dec.decode(chunk, { stream: true }); let i; while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i).replace(/\r$/, '')); buf = buf.slice(i + 1); } }
    line(buf.replace(/\r$/, ''));
    return { ok: true, status: r.status, rows };
  } finally { clearTimeout(t); }
}

/* acq_date/acq_time are UTC; the day a customer means is the local (PKT) day */
export function localDate(acqDate, acqTime, tzH = 5) {
  const t = String(acqTime || '0').padStart(4, '0');
  const ms = Date.parse(acqDate + 'T' + t.slice(0, 2) + ':' + t.slice(2) + ':00Z') + tzH * 3600e3;
  return new Date(ms).toISOString().slice(0, 10);
}

/* ── shared filter / classify ────────────────────────────────────────────────────────────────────────────────────── */
async function cropProbe(dataDir, C) {
  const band = C.filters.cropBand;
  if (!band || !existsSync(join(dataDir, 'feat', band + '.json'))) return { use: null, note: 'skipped: feature-grid band ' + band + ' not present in data/feat when this ran' };
  try {
    const { createFeatGrid } = await import(pathToFileURL(join(HERE, '..', 'server', 'api', 'featgrid.mjs')).href);
    const G = createFeatGrid(dataDir);
    const min = C.filters.cropShareMin;
    /* the band is a share; accept 0-1 or 0-100 storage */
    return { use: (lat, lon) => { const v = G.value(band, lat, lon); if (v == null) return true; const s = v > 1 ? v / 100 : v; return s >= min; }, note: 'applied: ' + band + ' share >= ' + min + ' (cells outside the national grid kept)' };
  } catch (e) { return { use: null, note: 'skipped: ' + e.message }; }
}

export function classifier(C, T) {
  const sectors = C.sectors;
  return function where(lat, lon) {
    const p = T.find(lat, lon);
    if (p && !p.disputed) return { tehsil: p.uid, province: p.province, sector: 'pakistan' };
    if (p && p.disputed) return { tehsil: null, province: p.province, sector: 'iiojk' };
    for (const s of sectors) if (lat >= s.south && lat <= s.north && lon >= s.west && lon <= s.east) return { tehsil: null, sector: s.id };
    return { tehsil: null, sector: 'other' };
  };
}
export function sectorLabels(C, T) {
  const o = { pakistan: 'Pakistan' }; for (const s of C.sectors) o[s.id] = s.label;
  const d = T.polys.find(p => p.disputed); o.iiojk = d ? d.province + ' (disputed)' : 'IIOJK (disputed)';
  return o;
}

function accept(row, kind, C, isArchive) {
  const lat = +row.latitude, lon = +row.longitude, b = C.bbox;
  if (!(lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east)) return null;
  const conf = String(row.confidence || '').trim();
  if (kind === 'viirs' ? !C.filters.viirsConfidence.includes(conf) : !(+conf >= C.filters.modisConfidenceMin)) return null;
  if (isArchive && row.type != null && row.type !== '' && +row.type !== C.filters.archiveType) return null;
  return { lat, lon, frp: +row.frp || 0, dn: String(row.daynight || 'D').trim(), date: localDate(row.acq_date, row.acq_time, C.tz_offset_hours) };
}

const cellKey = (lat, lon, d) => Math.round(lat / d) + ',' + Math.round(lon / d);

/* ── NRT: last 7 days → data/fires.json ──────────────────────────────────────────────────────────────────────────── */
export async function fetchFires({ dataDir = join(HERE, '..', 'data'), log = console.log } = {}) {
  const C = loadFireConfig(dataDir), T = tehsilIndex(dataDir), where = classifier(C, T);
  let staticCells = new Set(), staticNote = 'no archive file: static-source screen not applied';
  const af = join(dataDir, 'fires-archive.json');
  if (existsSync(af)) { try { const A = JSON.parse(readFileSync(af, 'utf8')); staticCells = new Set(A.staticCells || []); staticNote = staticCells.size + ' static-source cells from the 2019-2024 archive (type ' + C.filters.staticType + ')'; } catch {} }
  const crop = await cropProbe(dataDir, C);
  const viirs = new Map(), modis = [], sensors = [];
  for (const s of C.nrt) {
    let kept = 0, dropStatic = 0, dropCrop = 0;
    const st = await streamCsv(s.url, (row) => {
      const f = accept(row, s.kind, C, false); if (!f) return;
      if (staticCells.has(cellKey(f.lat, f.lon, C.filters.staticCellDeg))) { dropStatic++; return; }
      if (crop.use && !crop.use(f.lat, f.lon)) { dropCrop++; return; }
      f.sat = s.id; kept++;
      if (s.kind === 'modis') { modis.push(f); return; }
      /* same cell → one fire; a neighbouring cell (3×3) seen by ANOTHER VIIRS satellite on the same local day and pass
         is the same fire re-geolocated about 50 min later (adjacent pixels of one satellite stay separate fires) */
      const dd = C.filters.dedupCellDeg, i0 = Math.round(f.lat / dd), j0 = Math.round(f.lon / dd), tail = '|' + f.date + '|' + f.dn;
      let o = viirs.get(i0 + ',' + j0 + tail);
      for (let a = -1; a <= 1 && !o; a++) for (let b = -1; b <= 1 && !o; b++) { const q = viirs.get((i0 + a) + ',' + (j0 + b) + tail); if (q && !q.sats.includes(s.id)) o = q; }
      if (!o) viirs.set(i0 + ',' + j0 + tail, { ...f, sats: [s.id] }); else { if (!o.sats.includes(s.id)) o.sats.push(s.id); if (f.frp > o.frp) Object.assign(o, { frp: f.frp }); }
    }).catch(e => ({ ok: false, error: e.message, rows: 0 }));
    sensors.push({ id: s.id, sat: s.sat, res_m: s.res_m, url: s.url, ok: st.ok, status: st.status, error: st.error, rows: st.rows, kept, droppedStatic: dropStatic, droppedCrop: dropCrop });
  }
  if (!sensors.some(s => s.ok)) throw new Error('no FIRMS file could be read: ' + sensors.map(s => s.id + ' ' + (s.status || s.error)).join('; '));
  /* MODIS 1 km: dropped where VIIRS already has a fire in the 3×3 0.01° neighbourhood on the same date and pass */
  const vN = new Set(); const nd = C.filters.modisNeighbourDeg;
  for (const f of viirs.values()) vN.add(cellKey(f.lat, f.lon, nd) + '|' + f.date + '|' + f.dn);
  let modisKept = 0;
  const all = [...viirs.values()];
  for (const f of modis) {
    const i0 = Math.round(f.lat / nd), j0 = Math.round(f.lon / nd); let dup = false;
    for (let a = -1; a <= 1 && !dup; a++) for (let b = -1; b <= 1 && !dup; b++) if (vN.has((i0 + a) + ',' + (j0 + b) + '|' + f.date + '|' + f.dn)) dup = true;
    if (!dup) { all.push({ ...f, sats: [f.sat] }); modisKept++; }
  }
  const days = [...new Set(all.map(f => f.date))].sort();
  const dayIdx = new Map(days.map((d, i) => [d, i]));
  const tehsils = {}, sectors = {}, satCode = { viirs_snpp: 1, viirs_noaa20: 2, viirs_noaa21: 3, modis: 4 };
  const rows = [], secList = []; const secIdx = (id) => { let i = secList.indexOf(id); if (i < 0) { secList.push(id); i = secList.length - 1; } return i; };
  for (const f of all) {
    const w = where(f.lat, f.lon), di = dayIdx.get(f.date);
    if (w.tehsil) { const t = tehsils[w.tehsil] = tehsils[w.tehsil] || {}; const e = t[f.date] = t[f.date] || [0, 0]; e[0]++; e[1] += f.frp; }
    const s = sectors[w.sector] = sectors[w.sector] || {}; const e = s[f.date] = s[f.date] || [0, 0]; e[0]++; e[1] += f.frp;
    rows.push([Math.round(f.lat * 1000) / 1000, Math.round(f.lon * 1000) / 1000, di, Math.round(f.frp * 10) / 10, f.sats.map(x => satCode[x]).reduce((a, b) => a * 10 + b, 0), f.dn === 'N' ? 1 : 0, secIdx(w.sector)]);
  }
  const series = (o) => Object.entries(o).sort().map(([d, [n, frp]]) => [d, n, Math.round(frp)]);
  const L = sectorLabels(C, T);
  const out = {
    licence: C.licence,
    built: new Date().toISOString(), at: new Date().toISOString(),
    method: 'NASA FIRMS 7-day NRT files, clipped to the config bbox, presumed vegetation fires (VIIRS confidence nominal/high, MODIS >= ' + C.filters.modisConfidenceMin + '), static-source cells removed, de-duplicated across satellites (one fire per ' + C.filters.dedupCellDeg + '-degree cell, local day and pass, merged with a neighbouring cell seen by another VIIRS satellite, largest FRP kept; MODIS kept only where no VIIRS fire is within one 0.01-degree cell), then counted per tehsil (point in polygon) and per upwind sector per PKT day. FRP in MW summed per day.',
    source: 'scripts/firms_fetch.mjs; settings data/fires-config.json',
    n: all.length,
    window: { from: days[0] || null, to: days[days.length - 1] || null }, days,
    /* the validation and the thresholds use S-NPP alone (the only sensor with a 2019-2024 archive); the share of today's
       fires S-NPP also saw converts the multi-satellite count back to S-NPP equivalents (null when S-NPP was not read) */
    snppShare: sensors.find(x => x.id === 'viirs_snpp' && x.ok) && all.length ? Math.round(all.filter(f => f.sats.includes('viirs_snpp')).length / all.length * 1000) / 1000 : null,
    sensors, cropMask: crop.note, staticScreen: staticNote, modisKept, modisDroppedAsDuplicate: modis.length - modisKept,
    sectorLabels: L,
    points: { cols: ['lat', 'lon', 'dayIndex', 'frpMW', 'satellites (1 S-NPP, 2 NOAA-20, 3 NOAA-21, 4 MODIS; digits)', 'night (1) / day (0)', 'sector (index into points.sectors)'], sectors: secList, rows },
    tehsils: Object.fromEntries(Object.entries(tehsils).map(([k, v]) => [k, series(v)])),
    sectors: Object.fromEntries(Object.entries(sectors).map(([k, v]) => [k, { label: L[k] || k, days: series(v) }])),
  };
  const file = join(dataDir, 'fires.json'), tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify(out)); renameSync(tmp, file);
  log && log(`  fires: ${all.length} fires (${viirs.size} VIIRS, ${modisKept} MODIS-only) ${days[0] || ''}..${days[days.length - 1] || ''}, ${Object.keys(out.tehsils).length} tehsils with fires`);
  return out;
}

/* ── archive: 2019-2024 Oct-Dec S-NPP → data/fires-archive.json ──────────────────────────────────────────────────── */
export async function fetchArchive({ dataDir = join(HERE, '..', 'data'), pointsFile = null, log = console.log } = {}) {
  const C = loadFireConfig(dataDir), T = tehsilIndex(dataDir), where = classifier(C, T), A = C.archive;
  const staticCells = new Set(), years = {}, files = [], pts = [];
  for (const y of A.years) {
    const from = y + '-' + A.season.from, to = y + '-' + A.season.to;
    const Y = years[y] = { sectors: {}, tehsilSeason: {}, provinces: {} };
    for (const country of A.countries) {
      const url = A.urlPattern.replace(/\{year\}/g, y).replace('{country}', country);
      let kept = 0, stat = 0;
      const st = await streamCsv(url, (row) => {
        const lat = +row.latitude, lon = +row.longitude, b = C.bbox;
        if (!(lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east)) return;
        if (+row.type === C.filters.staticType) { staticCells.add(cellKey(lat, lon, C.filters.staticCellDeg)); stat++; return; }
        const f = accept(row, 'viirs', C, true); if (!f || f.date < from || f.date > to) return;
        kept++;
        const w = where(f.lat, f.lon);
        const s = Y.sectors[w.sector] = Y.sectors[w.sector] || {}; const e = s[f.date] = s[f.date] || [0, 0]; e[0]++; e[1] += f.frp;
        if (w.tehsil) { const t = Y.tehsilSeason[w.tehsil] = Y.tehsilSeason[w.tehsil] || [0, 0]; t[0]++; t[1] += f.frp;
          const p = Y.provinces[w.province] = Y.provinces[w.province] || {}; const q = p[f.date] = p[f.date] || [0, 0]; q[0]++; q[1] += f.frp; }
        if (pointsFile && y >= 2023) pts.push([Math.round(f.lat * 1000) / 1000, Math.round(f.lon * 1000) / 1000, f.date, Math.round(f.frp * 10) / 10, f.dn === 'N' ? 1 : 0]);
      }).catch(e => ({ ok: false, error: e.message, rows: 0 }));
      files.push({ year: y, country, url, ok: st.ok, status: st.status, error: st.error, rows: st.rows, kept, staticRows: stat });
      log && log(`  archive ${y} ${country}: ${st.ok ? st.rows + ' rows, ' + kept + ' kept, ' + stat + ' static' : 'FAILED ' + (st.status || st.error)}`);
    }
  }
  const series = (o) => Object.entries(o).sort().map(([d, [n, frp]]) => [d, n, Math.round(frp)]);
  const L = sectorLabels(C, T);
  const out = {
    licence: C.licence, built: new Date().toISOString(),
    method: 'NASA FIRMS S-NPP VIIRS country archive (' + A.countries.join(', ') + '), ' + A.years[0] + '-' + A.years[A.years.length - 1] + ', ' + A.season.from + ' to ' + A.season.to + ' each year, clipped to the config bbox; type 0 (presumed vegetation fire) with confidence nominal/high; counted per PKT day per sector and per province, and per tehsil over the season. staticCells: 0.01-degree cells holding any type-2 (static land source) detection in any year, used by the NRT fetch to drop kilns/flares/industry.',
    source: 'scripts/firms_fetch.mjs --archive; ' + A.why,
    n: files.reduce((a, f) => a + (f.kept || 0), 0),
    files, sectorLabels: L,
    years: Object.fromEntries(Object.entries(years).map(([y, Y]) => [y, {
      sectors: Object.fromEntries(Object.entries(Y.sectors).map(([k, v]) => [k, series(v)])),
      provinces: Object.fromEntries(Object.entries(Y.provinces).map(([k, v]) => [k, series(v)])),
      tehsilSeason: Object.fromEntries(Object.entries(Y.tehsilSeason).map(([k, [n, frp]]) => [k, [n, Math.round(frp)]])) }])),
    staticCells: [...staticCells].sort(),
  };
  const file = join(dataDir, 'fires-archive.json'), tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify(out)); renameSync(tmp, file);
  if (pointsFile) writeFileSync(pointsFile, JSON.stringify(pts));
  log && log(`  archive: ${out.n} fires kept, ${staticCells.size} static cells`);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2), arg = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const dataDir = arg('--data') || join(HERE, '..', 'data');
  (a.includes('--archive') ? fetchArchive({ dataDir, pointsFile: arg('--points') }) : fetchFires({ dataDir }))
    .then(() => process.exit(0)).catch(e => { console.error('firms_fetch:', e.message); process.exit(1); });
}
