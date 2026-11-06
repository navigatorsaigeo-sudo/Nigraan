/* ══ v91.17.163 · SMAP NEAR-SURFACE SOIL MOISTURE, LIVE ═══════════════════════════════════════════════════════════════════════
   What   NASA SMAP L3 Enhanced 9 km (SPL3SMP_E v006), AM and PM retrievals, top ~5 cm, read for Pakistan through NASA's OPeNDAP
          (CSV subset, the user's Earthdata token, sent only to NASA hosts). Per tehsil: the mean of the 3x3 pixels at the tehsil
          point on the newest day that has a retrieval there (swaths leave gaps; up to 3 days back), and its percentile against
          the same pentad of year 2015-2025 (data/smap-clim.json, built in the cloud from 4,120 days).
   Why    Triple collocation (SMAP, ERA5-Land layer 1, a CHIRPS rain index; 563 tehsils, 2015-2026 pentad anomalies): SMAP tracks
          the true near-surface anomaly better than the model in KP (78 % of tehsils), GB (76 %), AJK (69 %) and 500-3,000 m; the
          model is better in Sindh (98 %) and below 500 m. Each tehsil carries that verdict as `preferred`.
   Limits Near-surface only (not the root zone the drought and curve-number rules read); retrievals are degraded over dense
          vegetation, frozen ground, standing water and radio interference; the token expires (status shows when).
   Served /api/smap, /api/smap?unit=..., and wetness.of(...).nearSurface. Nothing else reads it.
   v91.17.169 · TESTED AS A PREDICTOR, NOT ADDED TO THE WETNESS LEVEL. Rule fixed before the runs: SMAP enters only if it adds
          skill beyond rain and the model soil water with a 90 % interval above zero.
          Landslides (scripts/smap_check/landslide_skill.py; NASA catalogue 2015-17, 79 cases, 19,434 controls, leave-one-year-out):
            AUC rain 0.712, rain+model 0.709, rain+model+SMAP 0.707; SMAP gain -0.002 [-0.008, +0.005]. The ground is wetter
            before a landslide day (SMAP percentile 0.53 vs 0.40 on ordinary days) but the rain windows already carry that.
          Floods (scripts/smap_check/flood_skill.py; June state vs the mapped 2022 and 2025 flooded share, partial Spearman over
            floodplain x season rain and the model): viirs2022 -0.003 [-0.08, +0.08], pk2022 +0.014 [-0.06, +0.08], pk2025 -0.065
            [-0.14, +0.005]. Result files data/smap-landslide-skill.json, data/smap-flood-skill.json. It stays a reading. */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { schedule } from './scheduler.mjs';

const COLL = 'C2938664763-NSIDC_CPRD';
const TRUSTED = /^https:\/\/([\w-]+\.)*(eosdis\.nasa\.gov|earthdata\.nasa\.gov)\//i;
const extractToken = (s) => { const m = String(s || '').match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g); return m ? m.sort((a, b) => b.length - a.length)[0] : null; };
const tokenExp = (t) => { try { const p = JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); return p.exp ? new Date(p.exp * 1000).toISOString().slice(0, 10) : null; } catch (_) { return null; } };

/* "/Group/soil_moisture[i], v0, v1, ..." -> rows of numbers (fill -9999 -> null) */
export function parseDapCsv(txt) {
  const rows = [];
  for (const line of String(txt).split(/\r?\n/)) {
    const m = line.match(/^\/[^[]+\[(\d+)\],\s*(.*)$/); if (!m) continue;
    rows[Number(m[1])] = m[2].split(',').map((x) => { const v = Number(x); return Number.isFinite(v) && v >= 0 && v <= 1 ? v : null; });
  }
  return rows;
}

/* v283 WS5 · audit C6 · the retrieval quality flag (uint16) of the same rows; fill (65534/65535) and unparsable -> null */
export function parseDapCsvFlags(txt) {
  const rows = [];
  for (const line of String(txt).split(/\r?\n/)) {
    const m = line.match(/^\/[^[]+\[(\d+)\],\s*(.*)$/); if (!m) continue;
    rows[Number(m[1])] = m[2].split(',').map((x) => { const v = Number(x); return Number.isInteger(v) && v >= 0 && v < 65534 ? v : null; });
  }
  return rows;
}
/* SMAP L3 (SPL3SMP_E) retrieval_qual_flag bit 0 = 0: "retrieval has recommended quality" (O'Neill et al., SMAP L3 Enhanced
   Product Specification / Data Fields, NSIDC). The recommended bit already folds in the surface conditions (frozen ground, open
   water, dense vegetation, RFI) that degrade a retrieval. A value whose flag is missing is NOT used: quality unknown = not shown. */
export const recommended = (flag) => flag != null && (flag & 1) === 0;
export function keepRecommended(sm, flags) {
  return sm.map((row, r) => row ? row.map((v, c) => (v != null && recommended(flags[r] && flags[r][c])) ? v : null) : row);
}

export function createSmap(app, dataDir) {
  const root = new URL('../../', import.meta.url);
  const on = () => process.env.NIGRAAN_SMAP !== '0';
  const latestFile = join(dataDir, 'smap-latest.json');
  let CL = null, LATEST = null; const state = { lastCheck: null, lastError: null, busy: false };
  try { LATEST = JSON.parse(readFileSync(latestFile, 'utf8')); } catch (_) {}
  const clim = () => { if (CL === null) { try { CL = JSON.parse(readFileSync(join(dataDir, 'smap-clim.json'), 'utf8')); } catch (_) { CL = false; } } return CL || null; };
  function token() {
    if (process.env.EARTHDATA_TOKEN) return extractToken(process.env.EARTHDATA_TOKEN);
    for (const n of ['earthdata.key', 'earthdata.key.txt']) { try { const t = extractToken(readFileSync(new URL(n, root), 'utf8')); if (t) return t; } catch (_) {} }
    return null;
  }
  async function get(url, auth) {
    let u = url;
    for (let hop = 0; hop < 5; hop++) {   /* redirects by hand: the token goes only to NASA hosts */
      if (auth && !TRUSTED.test(u)) throw new Error('refused to send the token to ' + new URL(u).host);
      const r = await fetch(u, { headers: auth ? { Authorization: 'Bearer ' + auth } : {}, redirect: 'manual', signal: AbortSignal.timeout(180000) });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u).href; continue; }
      if (!r.ok) throw new Error('http ' + r.status + ' from ' + new URL(u).host);
      return await r.text();
    }
    throw new Error('too many redirects');
  }
  const pentOf = (iso) => { const m = Number(iso.slice(5, 7)), d = Number(iso.slice(8, 10)); return (m - 1) * 6 + Math.min(5, Math.floor((d - 1) / 5)); };
  function pct(q, v) {   /* linear interpolation in the 11 quantiles (0, 10, ..., 100) */
    if (!q || v == null) return null; if (v <= q[0]) return 0; if (v >= q[10]) return 100;
    for (let i = 1; i < 11; i++) if (v <= q[i]) { const f = (q[i] - q[i - 1]) > 0 ? (v - q[i - 1]) / (q[i] - q[i - 1]) : 0.5; return Math.round(10 * (i - 1 + f)); }
    return null;
  }
  async function refresh() {
    if (!on() || state.busy) return { started: false };
    const C = clim(); if (!C) { state.lastError = 'data/smap-clim.json missing'; return { started: false, why: state.lastError }; }
    const T = token(); if (!T) { state.lastError = 'no Earthdata token: put it in nigraan-local/earthdata.key'; return { started: false, why: state.lastError }; }
    state.busy = true; state.lastCheck = new Date().toISOString();
    try {
      const end = new Date(), start = new Date(Date.now() - 6 * 864e5);
      const cmr = 'https://cmr.earthdata.nasa.gov/search/granules.json?short_name=SPL3SMP_E&version=006&page_size=10&sort_key=-start_date&temporal=' + start.toISOString().slice(0, 10) + 'T00:00:00Z,' + end.toISOString().slice(0, 10) + 'T23:59:59Z';
      const q = JSON.parse(await (await fetch(cmr, { signal: AbortSignal.timeout(60000) })).text());
      const grans = (q.feed && q.feed.entry || []).filter((e) => /\.h5/.test(e.title)).map((e) => ({ title: e.title, day: (e.time_start || '').slice(0, 10) })).filter((g) => g.day).slice(0, 4);
      if (!grans.length) { state.lastError = 'no SMAP granule in the last 6 days'; return { started: true, units: 0 }; }
      const S = C.subset, sl = `[${S.r0}:1:${S.r1}][${S.c0}:1:${S.c1}]`;
      const grids = []; let qualityErr = null, dropped = 0, kept = 0;
      for (const g of grans) {
        const base = 'https://opendap.earthdata.nasa.gov/collections/' + COLL + '/granules/' + encodeURIComponent(g.title) + '.dap.csv?dap4.ce=';
        const am0 = parseDapCsv(await get(base + encodeURIComponent('/Soil_Moisture_Retrieval_Data_AM/soil_moisture' + sl), T));
        const pm0 = parseDapCsv(await get(base + encodeURIComponent('/Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm' + sl), T));
        /* v283 WS5 · C6 · only retrievals flagged "recommended quality" are kept; a flag grid that cannot be read drops that pass */
        let fa = [], fp = [];
        try { fa = parseDapCsvFlags(await get(base + encodeURIComponent('/Soil_Moisture_Retrieval_Data_AM/retrieval_qual_flag' + sl), T)); } catch (e) { qualityErr = 'AM quality flag: ' + e.message; }
        try { fp = parseDapCsvFlags(await get(base + encodeURIComponent('/Soil_Moisture_Retrieval_Data_PM/retrieval_qual_flag_pm' + sl), T)); } catch (e) { qualityErr = 'PM quality flag: ' + e.message; }
        const am = keepRecommended(am0, fa), pm = keepRecommended(pm0, fp);
        const cnt = (A) => A.reduce((n, row) => n + (row ? row.filter((v) => v != null).length : 0), 0);
        dropped += (cnt(am0) - cnt(am)) + (cnt(pm0) - cnt(pm)); kept += cnt(am) + cnt(pm);
        grids.push({ day: g.day, am, pm });
      }
      const units = {};
      for (const [uid, u] of Object.entries(C.units)) {
        for (const G of grids) {   /* newest day first; the first with any retrieval in the 3x3 wins */
          let s = 0, n = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) for (const A of [G.am, G.pm]) { const v = A[u.r + dr] && A[u.r + dr][u.c + dc]; if (v != null) { s += v; n++; } }
          if (n) { const v = s / n; units[uid] = { v: Math.round(v * 1000) / 1000, day: G.day, retrievals: n, percentile: pct(u.q[pentOf(G.day)], v), preferred: !!u.preferred, tc: u.tc || null }; break; }
        }
      }
      LATEST = { at: new Date().toISOString(), days: grans.map((g) => g.day), product: 'SMAP L3 Enhanced 9 km (SPL3SMP_E v006)', quality: { rule: 'retrieval_qual_flag bit 0 = recommended quality (AM and PM); others not used', kept, dropped, error: qualityErr }, units };
      try { writeFileSync(latestFile + '.tmp', JSON.stringify(LATEST)); renameSync(latestFile + '.tmp', latestFile); } catch (_) {}
      state.lastError = qualityErr; console.log('  smap       ' + Object.keys(units).length + ' tehsils, newest ' + grans[0].day);
      return { started: true, units: Object.keys(units).length };
    } catch (e) { state.lastError = e.message; return { started: true, error: e.message }; }
    finally { state.busy = false; }
  }
  const ageH = () => LATEST && LATEST.at ? (Date.now() - Date.parse(LATEST.at)) / 3600e3 : Infinity;
  function unit(uid) {
    const r = LATEST && LATEST.units && LATEST.units[uid]; if (!r) return null;
    const dayAge = Math.round((Date.now() - Date.parse(r.day + 'T12:00:00Z')) / 864e5);
    return { ...r, dayAgeDays: dayAge, stale: dayAge > 4, state: r.percentile == null ? null : r.percentile >= 80 ? 'wet for the season' : r.percentile <= 20 ? 'dry for the season' : 'usual for the season',
      depth: 'top ~5 cm (not the root zone)', inLevel: false,
      levelWhy: 'tested as a predictor: no added landslide or flood skill beyond rain and the model soil water (data/smap-landslide-skill.json, data/smap-flood-skill.json); shown as a reading',
      use: r.preferred ? 'satellite tracks this tehsil better than the model (triple collocation)' : 'the model tracks this tehsil better; shown for context' };
  }
  function national() { if (!LATEST) return { ready: false, why: state.lastError || 'not fetched yet' }; return { ready: true, at: LATEST.at, ageH: Math.round(ageH() * 10) / 10, days: LATEST.days, product: LATEST.product, units: Object.fromEntries(Object.keys(LATEST.units).map((k) => [k, unit(k)])) }; }
  function status() { const T = token(); return { on: on(), token: T ? { present: true, expires: tokenExp(T) } : { present: false }, latest: LATEST ? { at: LATEST.at, days: LATEST.days, tehsils: Object.keys(LATEST.units || {}).length } : null, climatology: clim() ? clim().version : null, ...state }; }
  function start() { if (!on()) return; schedule(app, 'smapfeed', 3600e3, (why) => (why === 'first' || why === 'manual' || ageH() >= 12) ? refresh() : null, { firstMs: 120000, heavy: true, label: 'SMAP soil moisture' }); }
  return { refresh, unit, national, status, start };
}
