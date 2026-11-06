/* == v91.17.283.8 . AGENT 4: THE FLOOD SHADOW (two candidates, never served) ==========================================================
   Each Pakistan day (first run after 07:00 PKT, or forced) two flood candidates that did not pass their promotion rule
   (/tmp/claude-0/sci2/RULES.md R1 and R2; evidence in data/evidence/flood/) are computed from what NIGRAAN already holds, written as
   daily SHADOW outputs and later scored against flood truth an operator drops in. Nothing here is served: the river flood extent model
   stays served:false (data/flood-extent/fx-model.json); switching it on is the one-line change "served": true in that file, allowed only
   by the RULES.md R2 decision (pooled CSI gain CI above 0 and no year's gain below 0). Operator Health page only.
     C3 (fx_jrc_hand)  JRC / GloFAS river flood depth at the forecast event's return period >= d AND height above the river (30 m HAND,
                       the served extent grid fx_h) <= h, per river reach zone (fx_r), d and h read from data/evidence/flood/fx_rp_test.json
                       (models.C3: fitted on 2010 / 2014 / 2022, never refitted here). The event's return period: the reach's median
                       ensemble peak over forecast days 0-3 (data/flood.json, the river forecast already fetched) on the Gumbel line through
                       the reach's fitted 2- and 20-year flows (flood.json climate levels, the GloFAS reanalysis annual maxima); the JRC map
                       of the nearest return period, never below 10 years (the method as tested: fx_dated_test2.py rp_index).
     D25 (rain_d25)    the days with at least 25 mm in the served tehsil forecast of the morning issue (as-issued archive fc_YYYY-MM,
                       Pakistan days 0-3), per tehsil: the forecast form of the A3 predictor P_d25 (days >= 25 mm).
   Flood truth: drop an outline (GeoJSON, or a zipped shapefile; the date or window in the name as YYYYMMDD or YYYYMMDD_YYYYMMDD) into
   data/flood-truth/drop/. Each run registers new files in data/flood-truth/registry.json (sha256, bytes, window, source name) and, when a
   truth is registered whose window overlaps a shadow day, runs scripts/agents/flood_truth_score.py (Python: geopandas, rasterio) to score
   C3 (CSI per reach zone, against the JRC 1-in-10 map B2 as in R2) and D25 (AUC over tehsils, against the tehsil flooded share). Scores go
   to data/agents/flood/scores.jsonl. Missing inputs are "not assessed" with the reason, never zero.
   Reads only; writes only under data/agents/flood/ and data/flood-truth/ (registry). No network code; no provider call.
   usage: node scripts/agents/flood_shadow.mjs --app <nigraan-local> [--data <dir>] [--day YYYY-MM-DD] [--force] [--truth-only] */
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync, openSync, readSync, closeSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { args, readJson, writeJsonAtomic, appendLine, pktDay, takeLock, agentLog, gzMembers, fin } from './lib.mjs';

const r1 = (x) => Math.round(x * 10) / 10;
/* Gumbel: the return period of flow q on the line through the fitted 2- and 20-year flows (reduced variate y = -ln(-ln(1 - 1/T))) */
export function gumbelRp(q, q2, q20) {
  if (!(q > 0) || !(q2 > 0) || !(q20 > q2)) return null;
  const y2 = -Math.log(-Math.log(1 - 1 / 2)), y20 = -Math.log(-Math.log(1 - 1 / 20)), al = (q20 - q2) / (y20 - y2), xi = q2 - al * y2;
  const F = Math.exp(-Math.exp(-(q - xi) / al)); return 1 / Math.max(1e-9, 1 - F);
}
/* the JRC map used for an event return period: the nearest mapped return period on a log scale, never below 10 years (fx_dated_test2 rp_index) */
export function rpIndex(rp, RPS) { const r = Math.max(10, rp); let b = 0; RPS.forEach((T, i) => { if (Math.abs(Math.log(r) - Math.log(T)) < Math.abs(Math.log(r) - Math.log(RPS[b]))) b = i; }); return b; }
/* window of a truth file from its name: YYYYMMDD or YYYYMMDD_YYYYMMDD */
export function truthWindow(name) { const m = /(20\d{6})(?:[_-](20\d{6}))?/.exec(name); if (!m) return null; const f = (s) => s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); return { from: f(m[1]), to: f(m[2] || m[1]) }; }

/* -- the packed extent grid (fx_h / fx_r): every cell of every block -- */
function bandReader(dir, name) {
  const j = readJson(join(dir, name + '.json')); if (!j) return null; const fd = openSync(join(dir, name + '.p0.bin'), 'r');
  return { j, block(key) { const e = j.blocks[key]; if (!e) return null; const buf = Buffer.alloc(e[2]); readSync(fd, buf, 0, e[2], e[1]); const raw = inflateSync(buf); return new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2); }, close() { try { closeSync(fd); } catch (_) {} } };
}

export async function shadowDay(o) {
  const { app, dataDir, day } = o; const out = { day, at: new Date().toISOString(), candidates: {} };
  /* ---- C3 ---- */
  const C3 = { id: 'fx_jrc_hand', what: 'JRC river flood depth at the forecast event return period >= d and height above the river <= h, per reach zone', served: false };
  try {
    const P = readJson(join(dataDir, 'evidence', 'flood', 'fx_rp_test.json')); const pm = P && P.models && P.models.C3;
    const Mo = readJson(join(dataDir, 'flood-extent', 'fx-model.json')); const FL = readJson(join(dataDir, 'flood.json')); const IX = readJson(join(dataDir, 'flood-depth', 'index.json'));
    const miss = []; if (!pm || !fin(pm.d) || !fin(pm.h)) miss.push('the C3 parameters (data/evidence/flood/fx_rp_test.json)'); if (!Mo) miss.push('the extent grid model (data/flood-extent/fx-model.json)');
    if (!FL || !FL.forecast || !FL.forecast.points) miss.push('the river forecast (data/flood.json)'); if (!IX) miss.push('the JRC depth maps index (data/flood-depth/index.json)');
    if (miss.length) throw Object.assign(new Error('not assessed: ' + miss.join('; ') + ' not on this computer'), { na: true });
    const { createFloodDepth } = await import(new URL('../../server/api/flooddepth.mjs', import.meta.url).href); const FD = createFloodDepth(dataDir); const RPS = IX.returnPeriods;
    const RR = (readJson(join(dataDir, 'river-rarity.json')) || {}).reaches || {};
    const reaches = {}; const kOf = {};
    (Mo.reachOrder || []).forEach((rid, k) => { kOf[k] = rid;
      const r = RR[rid] || {}; if (r.fitRefused || r.modelRepresentsRiver === false || /under-call/.test(String((r.gaugeCheck || {}).verdict || ''))) { reaches[rid] = { why: 'the river model does not represent this reach well enough' }; return; }
      const F = FL.forecast.points[rid]; const L = FL.climate && FL.climate.points && FL.climate.points[rid] && FL.climate.points[rid].levels;
      if (!F || !Array.isArray(F.days) || !F.days.length) { reaches[rid] = { why: 'no river forecast for this reach' }; return; }
      if (!L || !(L.rp2 > 0) || !(L.rp20 > 0)) { reaches[rid] = { why: 'no fitted 2- and 20-year flows for this reach' }; return; }
      const d0 = F.days.findIndex((x) => x && x.date >= day); const win = (d0 < 0 ? [] : F.days.slice(d0, d0 + 4)).filter((x) => x && Array.isArray(x.q) && fin(x.q[1]));
      if (!win.length) { reaches[rid] = { why: 'the river forecast holds no day from ' + day }; return; }
      const peak = Math.max(...win.map((x) => x.q[1])), rp = gumbelRp(peak, L.rp2, L.rp20), ri = rpIndex(rp, RPS);
      reaches[rid] = { peakM3s: r1(peak), peakDate: win.find((x) => x.q[1] === peak).date, rp: rp == null ? null : r1(rp), mapRp: RPS[ri], ri, cells: 0, flooded: 0 }; });
    const ext = join(dataDir, 'flood-extent'); const H = bandReader(ext, 'fx_h'), R = bandReader(ext, 'fx_r'); if (!H || !R) throw Object.assign(new Error('not assessed: the extent grid bands fx_h / fx_r are not on this computer'), { na: true });
    const g = H.j.grid, bits = Buffer.alloc(Math.ceil((g.rows * g.cols) / 8)); let missingTiles = new Set(), unknown = 0;
    const dM = pm.d / 10, hM = pm.h;   /* d is in decimetres (the JRC encoding), h in metres */
    for (const key of Object.keys(H.j.blocks).sort()) { const [br, bc] = key.split(',').map(Number); const hb = H.block(key), rb = R.block(key); if (!hb || !rb) continue;
      for (let k = 0; k < hb.length; k++) { if (hb[k] === -32768 || rb[k] === -32768) continue; const rid = kOf[rb[k]]; const RX = rid && reaches[rid]; if (!RX || RX.why) continue;
        const row = br * g.block + Math.floor(k / g.block), col = bc * g.block + (k % g.block); RX.cells++;
        if (hb[k] / 10 > hM) continue;
        const lat = g.north - (row + 0.5) * g.cell, lon = g.west + (col + 0.5) * g.cell; const D = FD.cellDepths ? FD.cellDepths(lat, lon) : null;
        if (!D) { unknown++; continue; } if (D.missing) { missingTiles.add(D.missing); unknown++; continue; }
        if (D.depths[RX.ri] >= dM) { RX.flooded++; const idx = row * g.cols + col; bits[idx >> 3] |= (1 << (idx & 7)); } } }
    H.close(); R.close();
    const cellKm2 = (lat) => (g.cell * 111.32) * (g.cell * 111.32 * Math.cos(lat * Math.PI / 180));
    for (const RX of Object.values(reaches)) if (!RX.why) RX.floodedKm2 = Math.round(RX.flooded * cellKm2(30));
    mkdirSync(join(dataDir, 'agents', 'flood', 'shadow'), { recursive: true }); writeFileSync(join(dataDir, 'agents', 'flood', 'shadow', day + '.c3.bits.deflate'), deflateSync(bits));
    Object.assign(C3, { status: missingTiles.size ? 'partial' : 'ok', params: { dM, hM, source: 'data/evidence/flood/fx_rp_test.json models.C3' }, grid: { rows: g.rows, cols: g.cols, cell: g.cell, west: g.west, north: g.north },
      reaches, unknownCells: unknown, missingTiles: [...missingTiles].sort(), bitmap: 'agents/flood/shadow/' + day + '.c3.bits.deflate' });
  } catch (e) { Object.assign(C3, { status: 'not assessed', why: e.na ? e.message : 'not assessed: ' + e.message }); }
  out.candidates.fx_jrc_hand = C3;
  /* ---- D25 ---- */
  const D = { id: 'rain_d25', what: 'days with at least 25 mm in the served tehsil forecast of the morning issue (Pakistan days 0-3)', served: false };
  try { const f = join(dataDir, 'archive', 'forecast', 'fc_' + day.slice(0, 7) + '.jsonl.gz'); const M = gzMembers(f); if (!M) throw Object.assign(new Error('not assessed: no as-issued forecast archive for ' + day.slice(0, 7)), { na: true });
    const units = {}; let rows = 0;
    for (const t of M.texts) for (const l of t.split('\n')) { if (!l || l.indexOf('"d":"' + day + '"') < 0) continue; let r; try { r = JSON.parse(l); } catch (_) { continue; } if (r.d !== day) continue; rows++;
      const days = (r.D || []).filter((x) => x[0] >= day).slice(0, 4); if (!days.length) continue; const tot = days.map((x) => x[3] == null ? null : x[3] / 10);
      units[r.u] = { d25: tot.filter((v) => v != null && v >= 25).length, maxDayMm: tot.some((v) => v != null) ? Math.max(...tot.filter((v) => v != null)) : null, days: days.length }; }
    if (!rows) throw Object.assign(new Error('not assessed: the morning issue of ' + day + ' is not in the as-issued archive yet'), { na: true });
    Object.assign(D, { status: 'ok', units, tehsils: Object.keys(units).length, withSignal: Object.values(units).filter((x) => x.d25 > 0).length, damagedMembers: M.damaged.length });
  } catch (e) { Object.assign(D, { status: 'not assessed', why: e.na ? e.message : 'not assessed: ' + e.message }); }
  out.candidates.rain_d25 = D;
  return out;
}

/* new truth files in the drop folder -> registry */
export function registerTruth(dataDir, now = Date.now()) {
  const root = join(dataDir, 'flood-truth'), drop = join(root, 'drop'); mkdirSync(drop, { recursive: true });
  const regF = join(root, 'registry.json'); const reg = readJson(regF, { schema: 'agn.flood-truth.v1', about: 'flood truth outlines dropped by the operator (data/flood-truth/drop/): one entry per file, never edited by hand', entries: [] }) || { entries: [] };
  const have = new Set(reg.entries.map((e) => e.sha256)); let added = 0;
  for (const n of readdirSync(drop).sort()) { if (!/\.(geojson|json|zip)$/i.test(n)) continue; const p = join(drop, n); let b; try { b = readFileSync(p); } catch (_) { continue; }
    const h = createHash('sha256').update(b).digest('hex'); if (have.has(h)) continue; const w = truthWindow(n);
    reg.entries.push({ id: 'T' + h.slice(0, 10), file: 'drop/' + n, sha256: h, bytes: b.length, registeredAt: new Date(now).toISOString(), window: w, status: w ? 'registered, not yet scored' : 'not scorable: no date (YYYYMMDD) in the file name' });
    have.add(h); added++; }
  if (added) writeJsonAtomic(regF, reg);
  return { registry: reg, added };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const A = args(); const app = A.app || join(dirname(fileURLToPath(import.meta.url)), '..', '..'); const dataDir = A.data || join(app, 'data');
  const rel = takeLock(join(dataDir, 'agents', 'flood-shadow.lock'), 50 * 60e3); if (!rel) { console.log('another flood-shadow run is going'); process.exit(5); }
  try {
    const day = A.day || pktDay(Date.now()); const dir = join(dataDir, 'agents', 'flood'); mkdirSync(join(dir, 'shadow'), { recursive: true });
    const f = join(dir, 'shadow', day + '.json');
    /* --truth-only (v91.17.283.24): the server's hourly tick that is not due registers and scores the truth drop folder only */
    if (!A['truth-only'] && (!existsSync(f) || A.force)) { const S = await shadowDay({ app, dataDir, day }); writeJsonAtomic(f, S);
      agentLog(dataDir, 'flood-shadow', 'shadow ' + day + ': C3 ' + S.candidates.fx_jrc_hand.status + ', D25 ' + S.candidates.rain_d25.status, {}, Date.now()); console.log('flood-shadow ' + day + ': C3 ' + S.candidates.fx_jrc_hand.status + (S.candidates.fx_jrc_hand.why ? ' (' + S.candidates.fx_jrc_hand.why + ')' : '') + '; D25 ' + S.candidates.rain_d25.status + (S.candidates.rain_d25.why ? ' (' + S.candidates.rain_d25.why + ')' : '')); }
    const T = registerTruth(dataDir); const pending = T.registry.entries.filter((e) => e.window && /not yet scored/.test(e.status));
    /* v91.17.283.23 · self-audit J7 · the scorer runs when the pending truth set changed or once a day, not every hour (a truth file no
       shadow day covers, or a Python without geopandas, kept it running up to 40 minutes every hour) */
    const prevS = readJson(join(dir, 'state.json'), {}) || {}, ids = pending.map((e) => e.id).sort().join(','), lastTry = prevS.scoreTriedAt ? Date.parse(prevS.scoreTriedAt) : 0;
    const tryNow = pending.length && (ids !== (prevS.scoreTriedIds || '') || !(Date.now() - lastTry < 24 * 3600e3));
    if (tryNow) { const py = process.env.NIGRAAN_PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
      const r = spawnSync(py, (py === 'py' ? ['-3'] : []).concat([join(app, 'scripts', 'agents', 'flood_truth_score.py'), '--data', dataDir]), { encoding: 'utf8', timeout: 40 * 60e3, windowsHide: true });
      console.log('flood truth scoring: ' + (r.status === 0 ? 'done' : 'not scored (' + ((r.stderr || r.stdout || String(r.error || '')).trim().split('\n').slice(-1)[0] || 'exit ' + r.status) + ')')); }
    writeJsonAtomic(join(dir, 'state.json'), { at: new Date().toISOString(), lastDay: existsSync(f) ? day : (prevS.lastDay || null), truthFiles: T.registry.entries.length, truthAdded: T.added, pendingScore: pending.length,
      scoreTriedAt: tryNow ? new Date().toISOString() : (prevS.scoreTriedAt || null), scoreTriedIds: tryNow ? ids : (prevS.scoreTriedIds || '') });
  } finally { rel(); }
}
