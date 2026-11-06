/* ══ v91.17.32 · IMERG · SATELLITE RAIN AS A SECOND JUDGE OF THE RAIN FORECAST ═══════════════════
   Rain skill was measured against gauges (PMD city AWS, the PMD mountain AWS). Gauges are points,
   and most tehsils have none. NASA GPM IMERG (0.1°, daily) covers every tehsil. This module fetches
   IMERG Late Run daily precipitation for Pakistan, averages it over each tehsil, and scores the
   logged ensemble forecasts (ensemble-log/) against it: error of the median, and Brier score and
   detection for the ≥10, ≥25 and ≥50 mm chances, by lead day, plains and mountains apart.

   IMERG is itself an estimate. It is known to under-read orographic rain and to miss or misplace
   short convective bursts; over snow and ice its microwave inputs are withheld. It is a second
   judge with its own errors, not the truth, and every result says so.

   Access: NASA Earthdata Login. The user token is read on this computer from the environment
   (EARTHDATA_TOKEN) or from nigraan-local/earthdata.key. Only the part that is a token is used;
   any other text in the file is ignored. The token is sent only to NASA Earthdata and GES DISC
   hosts, is never logged, never written anywhere else, and never sent to the browser. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { schedule } from './scheduler.mjs';

const HOST = 'https://gpm1.gesdisc.eosdis.nasa.gov';
const COLL = '/opendap/GPM_L3/GPM_3IMERGDL.07';
/* v91.17.211 · PAKISTAN DAYS. The ensemble log holds Pakistan days (00-24 PKT = 19:00 UTC the day before to 19:00 UTC); the daily
   files run 00-24 UTC, so 5 of every 24 hours were judged against the wrong day. The half-hourly Late Run (precipitation in mm/hr,
   one file per 30-minute slot) is summed over the 48 slots of the Pakistan day instead; all 48 are required. Measured on the
   18-28 Sep 2026 log (station-lake/reports/imerg_pkt_day_verify.json): the correlation of the forecast median with the judge rose
   from 0.14 to 0.32 in the plains on the same tehsil-days, so the UTC judge was hiding skill the forecast has. */
const HHCOLL = '/opendap/GPM_L3/GPM_3IMERGHHL.07';
const TRUSTED = /(^|\.)(earthdata\.nasa\.gov|gesdisc\.eosdis\.nasa\.gov|eosdis\.nasa\.gov)$/i;
/* Pakistan box on the 0.1° IMERG grid: centres at -179.95 + 0.1 i and -89.95 + 0.1 j */
const BOX = { lon0: 60.5, lon1: 78.0, lat0: 23.5, lat1: 37.5 };
const iLon = (x) => Math.round((x + 179.95) / 0.1), iLat = (y) => Math.round((y + 89.95) / 0.1);
const LEADS = [1, 2, 3, 5, 7, 10], TH = [10, 25, 50];

/* token: a JWT (three base64url parts). Everything else in the file is ignored. */
export function extractToken(text) { const m = String(text || '').match(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/); return m ? m[0] : null; }
function tokenInfo(tok) {
  try { const p = JSON.parse(Buffer.from(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return { expires: p.exp ? new Date(p.exp * 1000).toISOString().slice(0, 10) : null, expired: p.exp ? p.exp * 1000 < Date.now() : null }; } catch (_) { return { expires: null, expired: null }; }
}
/* OPeNDAP ASCII: value rows look like "[0][12], 0.1, 0, 3.2" (sometimes prefixed with the variable name) */
/* v91.17.35 · Hyrax writes the row label either as integer indexes "[0][12]" or, for a Grid, as map values
   "[precipitation.time=1.7E9][precipitation.lon=60.55]". Only the order of the rows matters, because the
   request names a contiguous index range: row k of the reply is index i0 + k. A row is any line whose label
   ends in "]" followed by a comma list of numbers of the expected length (when known). */
export function parseAsciiGrid(text, expectLen) {
  const rows = new Map(); let k = 0;
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^\s*(?:[\w.]+)?((?:\[[^\]]*\])+)\s*,\s*(.+)$/); if (!m) continue;
    const vals = m[2].split(',').map(s => Number(s.trim())); if (!vals.length || vals.some(v => !Number.isFinite(v))) continue;
    if (expectLen && vals.length !== expectLen) continue;
    const idx = m[1].match(/^\[(\d+)\]\[(\d+)\]$/);
    rows.set(idx ? Number(idx[2]) : k, vals); k++;
  }
  return rows;
}
export function parseDds(text) {
  const m = String(text).match(/Float32\s+precipitation\s*((?:\[\s*\w+\s*=\s*\d+\s*\])+)/); if (!m) return null;
  return [...m[1].matchAll(/\[\s*(\w+)\s*=\s*(\d+)\s*\]/g)].map(x => ({ name: x[1], size: Number(x[2]) }));
}

export function createImerg(app, dataDir) {
  const root = new URL('../../', import.meta.url);
  const dir = join(dataDir, 'imerg'); mkdirSync(dir, { recursive: true });
  const verFile = join(dataDir, 'imerg-verification.json'), cellFile = join(dataDir, 'imerg-cells.json');
  const st = { running: false, lastRunAt: null, lastError: null, lastFetched: null, dimOrder: null };
  const write = (f, o) => { const t = f + '.tmp'; writeFileSync(t, JSON.stringify(o)); try { renameSync(t, f); } catch { writeFileSync(f, JSON.stringify(o)); } };
  const read = (f, d) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d; } catch { return d; } };

  function token() {
    if (process.env.EARTHDATA_TOKEN) { const t = extractToken(process.env.EARTHDATA_TOKEN); if (t) return { tok: t, source: 'environment' }; }
    /* Notepad saves as earthdata.key.txt unless told otherwise; both are read */
    for (const n of ['earthdata.key', 'earthdata.key.txt']) { try { const t = extractToken(readFileSync(new URL(n, root), 'utf8')); if (t) return { tok: t, source: n }; } catch (_) {} }
    return null;
  }
  const scrub = (s) => { const T = token(); let x = String(s || ''); if (T) x = x.split(T.tok).join('[token]'); return x.replace(/eyJ[A-Za-z0-9_.-]{20,}/g, '[token]').slice(0, 300); };

  /* fetch with the token on trusted hosts only; follow redirects by hand and keep session cookies */
  async function edlFetch(url, want = 'text') {
    const T = token(); if (!T) throw new Error('no Earthdata token: put it in nigraan-local/earthdata.key');
    const jar = new Map(); let u = url;
    for (let hop = 0; hop < 8; hop++) {
      const host = new URL(u).hostname; if (!TRUSTED.test(host)) throw new Error('refused to follow a redirect to ' + host);
      const h = { 'User-Agent': 'MACH-NIGRAAN/91.17.35 (IMERG verification)', Authorization: 'Bearer ' + T.tok };
      const ck = [...jar.entries()].map(([k, v]) => k + '=' + v).join('; '); if (ck) h.Cookie = ck;
      const r = await fetch(u, { headers: h, redirect: 'manual', signal: AbortSignal.timeout(90000) });
      const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : (r.headers.get('set-cookie') ? [r.headers.get('set-cookie')] : []);
      sc.forEach(c => { const kv = c.split(';')[0]; const i = kv.indexOf('='); if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u).href; continue; }
      if (r.status === 401 || r.status === 403) throw new Error('Earthdata refused the token (HTTP ' + r.status + '): check it has not expired and that the NASA GESDISC DATA ARCHIVE application is authorised in your Earthdata profile');
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + new URL(u).hostname);
      return want === 'text' ? r.text() : r.arrayBuffer();
    }
    throw new Error('too many redirects');
  }

  /* tehsil -> IMERG cells whose centre lies inside it (nearest cell for tehsils smaller than a cell) */
  function cells() {
    const c = read(cellFile, null); if (c && c.version === 1) return c.units;
    const fc = read(join(dataDir, 'pk-tehsils.json'), null); if (!fc) return {};
    const inRing = (x, y, ring) => { let q = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) q = !q; } return q; };
    const units = {};
    for (const f of fc.features) {
      const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, sx = 0, sy = 0, n = 0;
      polys.forEach(p => p[0].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); sx += x; sy += y; n++; }));
      const list = [];
      for (let i = iLon(x0); i <= iLon(x1); i++) for (let j = iLat(y0); j <= iLat(y1); j++) {
        const x = -179.95 + 0.1 * i, y = -89.95 + 0.1 * j;
        if (polys.some(p => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h)))) list.push([i, j]);
      }
      if (!list.length) list.push([iLon(sx / n), iLat(sy / n)]);
      units[f.properties.uid] = list;
    }
    write(cellFile, { version: 1, grid: 'IMERG 0.1°', units });
    return units;
  }

  async function fileFor(date) {
    const [y, m] = date.split('-'); const d = date.replace(/-/g, '');
    const idx = await edlFetch(`${HOST}${COLL}/${y}/${m}/contents.html`); if (!idx) return null;
    const f = (idx.match(new RegExp('3B-DAY-L\\.MS\\.MRG\\.3IMERG\\.' + d + '-S000000-E235959\\.V\\w+\\.nc4', 'g')) || []).sort().pop();
    return f ? `${HOST}${COLL}/${y}/${m}/${f}` : null;
  }

  async function fetchDay(date) {
    const out = join(dir, date + '.json'); if (existsSync(out)) return { date, cached: true };
    const url = await fileFor(date); if (!url) return { date, available: false };
    if (!st.dimOrder) { const dds = await edlFetch(url + '.dds'); st.dimOrder = parseDds(dds); if (!st.dimOrder) throw new Error('could not read the IMERG variable layout'); }
    const names = st.dimOrder.map(d => d.name.toLowerCase());
    const i0 = iLon(BOX.lon0), i1 = iLon(BOX.lon1), j0 = iLat(BOX.lat0), j1 = iLat(BOX.lat1);
    const rng = names.map(n => n === 'time' ? '[0:0]' : n === 'lon' ? `[${i0}:${i1}]` : `[${j0}:${j1}]`).join('');
    const txt = await edlFetch(url + '.ascii?precipitation.precipitation' + rng) || '';
    const lonFirst = names.indexOf('lon') < names.indexOf('lat');
    const rows = parseAsciiGrid(txt, lonFirst ? (j1 - j0 + 1) : (i1 - i0 + 1));
    if (!rows.size) { try { writeFileSync(join(dir, '_last_reply_head.txt'), String(txt.slice(0, 3000)).replace(/eyJ[A-Za-z0-9_.-]{20,}/g, '[token]') + '\n...\n' + txt.length + ' bytes'); } catch (_) {} }
    const val = (i, j) => { const r = rows.get(lonFirst ? i - i0 : j - j0); if (!r) return null; const v = r[lonFirst ? j - j0 : i - i0]; return v == null || v < 0 ? null : v; };
    if (rows.size < (lonFirst ? (i1 - i0) : (j1 - j0)) * 0.9) throw new Error('IMERG subset came back short: ' + rows.size + ' rows');
    const U = cells(), units = {};
    for (const [uid, cl] of Object.entries(U)) { const v = cl.map(([i, j]) => val(i, j)).filter(x => x != null); if (v.length) units[uid] = Math.round(10 * v.reduce((a, b) => a + b, 0) / v.length) / 10; }
    write(out, { date, product: 'GPM IMERG Late Run daily V07 (GPM_3IMERGDL)', file: url.split('/').pop(), fetchedAt: new Date().toISOString(), units });
    st.lastFetched = date; return { date, units: Object.keys(units).length };
  }

  const hhIndex = new Map();
  async function hhList(ymd) {
    const c0 = hhIndex.get(ymd); if (c0 && (c0.files.size >= 48 || Date.now() - c0.at < 20 * 60e3)) return c0;   /* a day still filling is re-listed at most every 20 min */
    const t = Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)), doy = String(Math.floor((t - Date.UTC(+ymd.slice(0, 4), 0, 1)) / 86400e3) + 1).padStart(3, '0');
    const idx = await edlFetch(`${HOST}${HHCOLL}/${ymd.slice(0, 4)}/${doy}/contents.html`); if (!idx) return null;
    const m = new Map(); for (const f of idx.match(/3B-HHR-L\.MS\.MRG\.3IMERG\.\d{8}-S\d{6}-E\d{6}\.\d{4}\.V\w+\.HDF5/g) || []) { const k = f.match(/\.(\d{8}-S\d{6})-/)[1]; if (!m.has(k) || f > m.get(k)) m.set(k, f); }
    const v = { doy, files: m, at: Date.now() }; hhIndex.set(ymd, v); if (hhIndex.size > 60) hhIndex.delete(hhIndex.keys().next().value); return v;
  }
  /* one Pakistan day from 48 half-hourly slots; nothing is written unless every slot of every used cell is present */
  async function fetchPktDay(date) {
    const pdir = join(dir, 'pkt'); mkdirSync(pdir, { recursive: true });
    const out = join(pdir, date + '.json'); if (existsSync(out)) return { date, cached: true };
    const t0 = Date.parse(date + 'T00:00:00Z') - 5 * 3600e3, urls = [];
    for (let k = 0; k < 48; k++) {
      const t = new Date(t0 + k * 1800e3), ymd = t.toISOString().slice(0, 10), key = ymd.replace(/-/g, '') + '-S' + t.toISOString().slice(11, 19).replace(/:/g, '');
      const L = await hhList(ymd); const f = L && L.files.get(key); if (!f) return { date, available: false, slots: k };
      urls.push(`${HOST}${HHCOLL}/${ymd.slice(0, 4)}/${L.doy}/${f}`);
    }
    const i0 = iLon(BOX.lon0), i1 = iLon(BOX.lon1), j0 = iLat(BOX.lat0), j1 = iLat(BOX.lat1);
    const U = cells(), need = new Map(); for (const cl of Object.values(U)) for (const [i, j] of cl) need.set(i + ',' + j, [i, j]);
    /* sci43 · B1b: the 0.1 deg cell at the served point of each tehsil in data/imerg-past-rain.json (the tested quantity: a cell, not a
       tehsil mean) is summed too and written as `points`; read only by imergpastrain.mjs, which is OFF unless NIGRAAN_IMERG_PAST_RAIN=1 */
    const PS = read(join(dataDir, 'imerg-past-rain.json'), null), PT = {};
    if (PS && PS.units) for (const [uid, p] of Object.entries(PS.units)) if (Array.isArray(p.cell)) { PT[uid] = p.cell; need.set(p.cell[0] + ',' + p.cell[1], p.cell); }
    const sum = new Map([...need.keys()].map(k => [k, 0]));
    for (const u of urls) {
      if (!st.hhDimOrder) { const dds = await edlFetch(u + '.dds'); st.hhDimOrder = parseDds(dds); if (!st.hhDimOrder) throw new Error('could not read the half-hourly IMERG layout'); }
      const names = st.hhDimOrder.map(d => d.name.toLowerCase()), lonFirst = names.indexOf('lon') < names.indexOf('lat');
      const rng = names.map(n => n === 'time' ? '[0:0]' : n === 'lon' ? `[${i0}:${i1}]` : `[${j0}:${j1}]`).join('');
      const txt = await edlFetch(u + '.ascii?precipitation' + rng) || '';
      const rows = parseAsciiGrid(txt, lonFirst ? (j1 - j0 + 1) : (i1 - i0 + 1));
      if (rows.size < (lonFirst ? (i1 - i0) : (j1 - j0)) * 0.9) throw new Error('IMERG half-hourly subset came back short: ' + rows.size + ' rows (' + u.split('/').pop() + ')');
      for (const [k, [i, j]] of need) { const prev = sum.get(k); if (prev == null) continue; const r = rows.get(lonFirst ? i - i0 : j - j0); const v = r ? r[lonFirst ? j - j0 : i - i0] : null;
        sum.set(k, v == null || v < 0 ? null : prev + v * 0.5); }   /* mm/hr over a 30-minute slot */
    }
    const units = {};
    for (const [uid, cl] of Object.entries(U)) { const v = cl.map(([i, j]) => sum.get(i + ',' + j)).filter(x => x != null); if (v.length === cl.length && v.length) units[uid] = Math.round(10 * v.reduce((a, b) => a + b, 0) / v.length) / 10; }
    const points = {}; for (const [uid, [i, j]] of Object.entries(PT)) { const v = sum.get(i + ',' + j); if (v != null) points[uid] = Math.round(10 * v) / 10; }
    write(out, { date, day: 'PKT (19:00 UTC the day before to 19:00 UTC)', product: 'GPM IMERG Late Run half-hourly V07 (GPM_3IMERGHHL), 48 of 48 slots', fetchedAt: new Date().toISOString(), units, ...(Object.keys(PT).length ? { points } : {}) });
    return { date, units: Object.keys(units).length };
  }

  function verify() {
    const logDir = join(dataDir, 'ensemble-log'); if (!existsSync(logDir)) return null;
    const elev = new Map((app.units && app.units.tehsil || []).map(u => [u.unitId, u.elevM]));
    const obs = new Map(readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => [f.slice(0, 10), read(join(dir, f), {}).units || {}]));
    const pdir = join(dir, 'pkt'), obsP = new Map(existsSync(pdir) ? readdirSync(pdir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => [f.slice(0, 10), read(join(pdir, f), {}).units || {}]) : []);
    const judged = { pktDay: 0, utcDay: 0 };
    const acc = {}; const add = (k, L) => (acc[k + '|' + L] = acc[k + '|' + L] || { n: 0, ae: 0, bias: 0, th: Object.fromEntries(TH.map(t => [t, { n: 0, bs: 0, obsYes: 0, hit: 0, miss: 0, fa: 0, clim: 0 }])) });
    let pairs = 0; const issues = new Set();
    for (const f of readdirSync(logDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
      const rec = read(join(logDir, f), null); if (!rec) continue;
      for (const [uid, days] of Object.entries(rec.units || {})) for (const L of LEADS) {
        const d = days[L]; if (!d || !d.pr) continue; const OP = obsP.get(d.date), O = obs.get(d.date); const usePkt = !!(OP && OP[uid] != null); if (!usePkt && (!O || O[uid] == null)) continue;
        const o = usePkt ? OP[uid] : O[uid], med = d.pr[1]; judged[usePkt ? 'pktDay' : 'utcDay']++;
        for (const grp of ['all', (elev.get(uid) || 0) >= 1000 ? 'mountains' : 'plains']) {
          const a = add(grp, L); a.n++; a.ae += Math.abs(med - o); a.bias += med - o;
          TH.forEach(t => { const pp = d.p && d.p['pr' + t] != null ? d.p['pr' + t] / 100 : null; if (pp == null) return; const y = o >= t ? 1 : 0, T = a.th[t];
            T.n++; T.bs += (pp - y) ** 2; T.obsYes += y; T.clim += pp; if (pp >= 0.5 && y) T.hit++; else if (pp < 0.5 && y) T.miss++; else if (pp >= 0.5 && !y) T.fa++; });
        }
        pairs++; issues.add(rec.issue);
      }
    }
    const r2 = (x) => Math.round(x * 100) / 100, out = {};
    for (const [k, a] of Object.entries(acc)) { const [g, L] = k.split('|');
      out[g] = out[g] || {}; out[g][L] = { pairs: a.n, maeMedianMm: r2(a.ae / a.n), biasMedianMm: r2(a.bias / a.n),
        thresholds: Object.fromEntries(TH.map(t => { const T = a.th[t]; if (!T.n) return [t, null]; const base = T.obsYes / T.n, bsc = base * (1 - base);
          return [t, { n: T.n, observedDays: T.obsYes, brier: r2(T.bs / T.n * 1000) / 1000, brierSkill: bsc > 0 ? r2(1 - (T.bs / T.n) / bsc) : null,
            detection: T.hit + T.miss ? r2(T.hit / (T.hit + T.miss)) : null, falseAlarms: T.hit + T.fa ? r2(T.fa / (T.hit + T.fa)) : null,
            meanChancePct: r2(100 * T.clim / T.n), observedPct: r2(100 * base) }]; })) }; }
    const V = { updated: new Date().toISOString(), pairs, issues: [...issues].sort(), imergDays: [...obs.keys()].sort(), byGroup: out,
      judge: judged.utcDay ? (judged.pktDay ? 'GPM IMERG Late Run V07, tehsil mean of 0.1° cells: Pakistan days from the half-hourly files where all 48 slots exist, otherwise the UTC daily file' : 'GPM IMERG Late Run daily V07, tehsil mean of 0.1° cells') : 'GPM IMERG Late Run half-hourly V07 summed over the Pakistan day, tehsil mean of 0.1° cells', judged,
      cautions: [...(judged.utcDay ? ['Day boundaries differ on ' + judged.utcDay + ' of ' + (judged.utcDay + judged.pktDay) + ' pairs: those are judged by the IMERG daily file (00:00-23:59 UTC) because the half-hourly Pakistan day was not complete, so 5 of 24 hours fall on the neighbouring day.'] : []),
        'meanChancePct against observedPct is reliability in the large: a forecast whose mean chance sits far below the observed frequency under-forecasts that threshold (measured 18-28 Sep 2026, plains, 10 mm: 0.5 % against 6.7 %).',
        'IMERG is an estimate with its own errors: it under-reads orographic rain and can miss or misplace short convective bursts; over snow and ice its microwave inputs are withheld.',
        'Chances are forecast shares of 51 members; detection counts a forecast chance of 50 % or more as a "yes".',
        'The record starts with the first logged ensemble run; scores on fewer than 30 issue days are indicative only.'],
      sufficient: issues.size >= 30 };
    write(verFile, V); return V;
  }

  async function run() {
    if (st.running) return { ok: false, why: 'already running' };
    if (!token()) return { ok: false, why: 'no Earthdata token: put it in nigraan-local/earthdata.key' };
    st.running = true; st.lastRunAt = new Date().toISOString();
    try {
      /* every valid date the ensemble log covers, plus the last 10 days; Late Run appears about a day after the date */
      const want = new Set(); const today = new Date();
      for (let k = 1; k <= 10; k++) want.add(new Date(today - k * 86400e3).toISOString().slice(0, 10));
      const logDir = join(dataDir, 'ensemble-log');
      if (existsSync(logDir)) readdirSync(logDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).forEach(f => { const r = read(join(logDir, f), null); const u = r && Object.values(r.units || {})[0]; if (u) LEADS.forEach(L => u[L] && want.add(u[L].date)); });
      const yday = new Date(today - 86400e3).toISOString().slice(0, 10);
      const res = [];
      for (const d of [...want].filter(d => d <= yday).sort()) { try { res.push(await fetchDay(d)); } catch (e) { res.push({ date: d, error: scrub(e.message) }); if (/refused the token|no Earthdata token/.test(e.message)) break; } }
      /* v91.17.283.25 · Pakistan days come from the server's own half-hourly fetch only: the AGN data lake branch (v91.17.216, dataset
         imerg_late_hh through station-lake/scripts/imerg_pkt_from_lake.py) is removed (owner, 27 Oct 2026: NIGRAAN leaves D:\DATA LAKE).
         At most 3 new days per run (48 small requests each), oldest first, then retried until complete. */
      let newP = 0, triedP = 0; for (const d of [...want].filter(d => d <= yday).sort()) { if (newP >= 3 || triedP >= 6) break; if (existsSync(join(dir, 'pkt', d + '.json'))) continue; triedP++;
        try { const r = await fetchPktDay(d); res.push({ ...r, pkt: true }); if (r.units) newP++; } catch (e) { res.push({ date: d, pkt: true, error: scrub(e.message) }); if (/refused the token|no Earthdata token/.test(e.message)) break; } }
      const errs = res.filter(r => r.error); st.lastError = errs.length ? errs[0].date + ': ' + errs[0].error : null;
      const V = verify();
      return { ok: !errs.length || res.some(r => r.units || r.cached), fetched: res.filter(r => r.units && !r.pkt).length, pktDays: res.filter(r => r.units && r.pkt).length, cached: res.filter(r => r.cached).length, notYet: res.filter(r => r.available === false).map(r => r.date), errors: errs.slice(0, 3), pairs: V ? V.pairs : 0 };
    } catch (e) { st.lastError = scrub(e.message); return { ok: false, why: st.lastError }; }
    finally { st.running = false; }
  }

  function status() {
    const T = token(); const days = readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 10)).sort();
    const V = read(verFile, null);
    return { token: T ? { present: true, source: T.source, ...tokenInfo(T.tok) } : { present: false, how: 'save your Earthdata user token as nigraan-local/earthdata.key' },
      product: 'GPM IMERG Late Run daily V07; half-hourly summed over Pakistan days', days: days.length, pktDays: (() => { try { return readdirSync(join(dir, 'pkt')).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).length; } catch (_) { return 0; } })(), first: days[0] || null, last: days[days.length - 1] || null,
      running: st.running, lastRunAt: st.lastRunAt, lastError: st.lastError, verification: V ? { updated: V.updated, pairs: V.pairs, issueDays: V.issues.length, sufficient: V.sufficient } : null };
  }
  if (!process.env.MACH_OFFLINE) {
    schedule(app, 'imerg', 6 * 3600e3, () => (token() ? run() : null), { firstMs: 120e3, heavy: true, label: 'IMERG satellite rain check' });
  }
  return { run, status, verify, verification: () => read(verFile, null), fetchDay, fetchPktDay };
}
