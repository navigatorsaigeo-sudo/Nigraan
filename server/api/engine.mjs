/* v91.17.106 · THE SERVER ENGINE.
   One body of code decides every hazard level: the page's engine (mask -> day input -> hazard engine -> five-level ladder).
   Before this version that engine ran only while someone had the dashboard open, so the API, the AI answers, the alert list and
   the archive could differ from the map or go silent. Now the server keeps the same engine running on this computer:
     - v91.17.207: it starts server/engine/vmpage.mjs, a Node.js process that runs the served page's scripts with no browser
       (19,006 of 19,008 levels identical to the headless browser on the same inputs); NIGRAAN_ENGINE_RUNNER=browser keeps the
       v91.17.106 runner: a headless browser (Microsoft Edge on Windows, else Chrome / Chromium; NIGRAAN_ENGINE_BROWSER overrides)
       with its own profile folder (data/engine-profile, never the user's browser profile) at http://127.0.0.1:<port>/?engine=1;
     - the page in engine mode (build/engine_ui.html) derives every layer for every tehsil for days 0-3 and posts the result to
       POST /api/engine/report (accepted from this computer only);
     - the server keeps the latest result (data/engine-latest.json), archives each changed result
       (data/archive/engine/engine_YYYY-MM.jsonl.gz, levels only, permanent) and serves it:
         GET /api/levels?layer=&day=     levels per tehsil (customer: levels and words; operator: plus the score)
         GET /api/levels/unit?unit=      one tehsil, every layer and day
         GET /api/ops/engine             the runner's state (operator)
   The browser is restarted once a day (memory), restarted after a crash with a back-off, and stopped with the server. A browser
   left over from a server that was killed is found by its pid file and stopped only if its command line names our profile folder.
   NIGRAAN_ENGINE=0 turns the runner off (the API then serves whatever a dashboard last reported). */
import { STATE_CODES, STATE_LABEL, STATE_TEXT, stateOfCode, codeDict } from './states.mjs';   /* v91.17.283.35 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawn, execFile } from 'node:child_process';
import { setPriority } from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
import { createHash } from 'node:crypto';
import { writeFileAtomicSync } from './store.mjs';   /* v91.17.283 · INTEG (WS3 request) · engine-latest.json written atomically */
import { dedupeAlertRows } from './ops.mjs';          /* v91.17.283 · INTEG (WS3 request) · one alert row per place + hazard + level + window */
import { evidenceDomain, inDomain, OUTSIDE_TESTED } from './evdomain.mjs';   /* v91.17.283.8 · audit 9 */
import { buildIdentity } from './shown.mjs';
import { levelLabelOf } from './served.mjs';   /* v283.24 integration item 4 */
import { appendGzMember } from './gzsafe.mjs';   /* v91.17.283.8 · planned C · whole members only (a torn append is cut back) */          /* v91.17.283 · INTEG (WS4 request) · the server's own build beside the page stamp */

export const STALE_MS = 3 * 3600e3;   /* v91.17.283.7 · exported for the feed-health agent (validUntil = received + STALE_MS) */
// v91.17.270: one client name per hazard (the names every NIGRAAN surface uses)
/* v91.17.283.47 · NIGRAAN 1.0.8 item 1 · the GLOF answer is SITE CONTEXT: the susceptibility of the glacial lakes in or upstream of each
   tehsil (exposure: priority / watch / none = high / moderate / low susceptibility), in a neutral palette on the map, never a level, an alert
   or a hazard count. contextWords are the customer words of the three classes. */
export const GLOF_CONTEXT = Object.freeze({ kind: 'context', context: 'susceptibility', notALevel: true, canAlert: false,
  contextWords: Object.freeze({ priority: 'High-susceptibility glacial lake upstream', watch: 'Moderate-susceptibility glacial lake upstream', none: 'Low-susceptibility glacial lakes only' }),
  contextNote: 'Lake susceptibility (glacial-lake inventory), not a warning level: no outburst level is issued (no outburst trigger has passed its test).' });
export const LAYER_NAME = { comfort: 'Heat discomfort (DI)', heat_index: 'Heat index band (NWS)', rain_hz: 'Heavy rain', heat: 'Heat stress', cold: 'Cold stress (UTCI)', wind: 'Wind and gusts', flood: 'Flood',
  flood_pluvial: 'Flash and urban flooding from rain', flood_riverine: 'River flooding', landslide: 'Landslide', glof: 'Glacial lake outburst flood (GLOF)',
  drought: 'Drought', nss_baseline: 'Runoff retention potential (land)', nss_dynamic: 'Runoff retention with today\'s wetness',
  nss_runoff: 'Rain run-off, last 5 days', drought_rain: 'Meteorological drought (rain shortage)', drought_soil: 'Agricultural drought (soil)',
  drought_crops: 'Agricultural drought (crops)', drought_water: 'Hydrological drought (snow and river water)' };   /* v91.17.283.15 · hazsci.mjs layers */

/* v91.17.273 · FLOOD agent · coverage: river flooding, GLOF, drought and the two retention layers are derived once per issue (the page
   derives them on day 0 only: hzDayCapable). Days 1-3 of the report carried no entry for them, so a tehsil had no level for those
   hazards on three of the four issued days (/api/levels?day=1&layer=drought answered "not derived"). These levels do not change
   within an issue (river flooding: the forecast window's highest flow; GLOF: the lake register and season; drought: the 30-90 day
   index; retention: land and the issue's wetness), so each later day carries the day-0 level, marked held, with the same counts. */
/* ══ v91.17.283 · WS2 C5 · ONLY THE ONCE-PER-ISSUE LAYERS ARE HELD ════════════════════════════════════════════════════════════════
   holdIssueLevels copied EVERY layer missing on a later day from day 0, so a day-1 heat layer that failed to derive was served as
   day 0's level (Severe heat on day 1, held, "covers every issued day"; AUDIT283 C5). The copy is now limited to ISSUE_LAYERS, the
   layers the page derives once per issue: the engine page's day-capable set (HZ_DAY_CAPABLE in the served page: heat, rain_hz, flood,
   flood_pluvial, landslide, wind, cold and the telco twins) is derived for every day, and the layers present on day 0 but outside
   it are exactly these five (engine-latest.json of 20 Oct 2026: day 0 holds 12 layers, days 1-3 hold the 7 day-capable ones).
   Any other missing layer stays missing ("not derived" / not assessed). Heat, cold and rain are never carried forward. */
export const ISSUE_LAYERS = Object.freeze(['flood_riverine', 'glof', 'drought', 'nss_baseline', 'nss_dynamic']);
export const HELD_NOTE = 'assessed once per issue: the level covers every issued day';
/* v91.17.283.3 · audit A9 · a per-layer held note. GLOF downstream is a susceptibility product (standing lakes, season, observed
   precursors): it is a standing condition, not a day forecast, and its held days say so. The other issue layers keep HELD_NOTE. */
export const HELD_NOTES = Object.freeze({ glof: 'susceptibility, not a day forecast: a standing condition from the lakes, the season and observed lake signals, assessed once per issue; the same level is shown on every issued day' });   /* v91.17.283.8: one GLOF wording on every surface */
export const heldNoteOf = (k) => HELD_NOTES[k] || HELD_NOTE;
/* v91.17.283.23 · self-audit H10 · THE UNITS AN ALERT ROW BELONGS TO, by the unique unit names the page sent (unitKeys: uid -> name;
   same-named tehsils carry their district, e.g. "Khanpur (Shikarpur)"). A tehsil row: the one unit with that exact name (or its uid).
   A district row (district: true): every tehsil of the district named, in the driving tehsil's province when that is known. */
/* ══ v91.17.283.38 · item 9 · DROUGHT AS A RANK AGAINST THE PLACE'S OWN RECORD (owner decision 30 Oct 2026: no drought classes) ══════
   Each drought type is served with "drier than X % of past years" per tehsil, computed only from what the server already holds:
     rain   SPI-3 of the month (CHIRPS v3, gamma fitted per calendar month on 1991-2020; WMO-No. 1090, 2012): the SPI is the standard-normal
            quantile of the fitted non-exceedance probability, so drier than = 100 x (1 - Phi(SPI)) of the 1991-2020 record for this month;
     soil   root-zone soil moisture percentile of the tehsil's own ERA5 record for this time of year (15 years, +/-10 days): drier than = 100 - p;
     water  30-day mean river flow (modelled natural flow) as a percentile of the same 30-day window in 1991-2020 at a judged gauge: 100 - p;
     crops  the Vegetation Health Index is a scaled index, not a rank against the place's own record: not available (never Normal);
     all    the driest of rain, soil and water where they are held, naming which.
   A cell without a value keeps its state (not assessed, input not current, ...), never a rank. */
const DROUGHT_PCT_LAYERS = new Set(['drought', 'drought_rain', 'drought_soil', 'drought_crops', 'drought_water']);
const PCT_BASIS = { rain: 'rain over the last 3 months (SPI-3, CHIRPS), against the fitted 1991-2020 record for the same months', soil: 'root-zone soil moisture, against the place’s own record for this time of year (ERA5, the last 15 years)', water: 'river flow over the last 30 days at the gauge, against the same 30 days of 1991-2020 (modelled natural flow)' };
const PCT_NA = { crops: 'not available: the vegetation health index is not a rank against the place’s own record' };
function phi(z) { const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2); return z >= 0 ? (1 + y) / 2 : (1 - y) / 2; }   /* Abramowitz & Stegun 7.1.26 */
const r1 = (x) => Math.round(x * 10) / 10;
function pctOf(d, kind, uid) {
  const lay = d.layers[kind === 'rain' ? 'drought_rain' : kind === 'soil' ? 'drought_soil' : kind === 'water' ? 'drought_water' : 'drought_crops'];
  if (!lay || !lay.L || !(lay.L[uid] >= 0)) return null; const S = lay.S ? lay.S[uid] : null; if (S == null || !Number.isFinite(Number(S))) return null;
  if (kind === 'rain') return r1(100 * (1 - phi(Number(S))));
  if (kind === 'soil' || kind === 'water') { const p = Number(S); return p >= 0 && p <= 100 ? r1(100 - p) : null; }
  return null;
}
function droughtPct(d, layer) {
  const out = {}, type = {}, na = {};
  const kinds = layer === 'drought' ? ['rain', 'soil', 'water'] : [layer === 'drought_rain' ? 'rain' : layer === 'drought_soil' ? 'soil' : layer === 'drought_water' ? 'water' : 'crops'];
  const base = d.layers[layer]; if (!base || !base.L) return {};
  for (const uid of Object.keys(base.L)) {
    if (kinds[0] === 'crops') { na[uid] = PCT_NA.crops; continue; }
    let best = null, bk = null; for (const k of kinds) { const p = pctOf(d, k, uid); if (p != null && (best == null || p > best)) { best = p; bk = k; } }
    if (best != null) { out[uid] = best; type[uid] = bk; } }
  return { drierThan: out, drierType: type, ...(Object.keys(na).length ? { drierNa: na } : {}), drierBasis: PCT_BASIS, drierWord: 'Drier than X % of past years' };
}

export function rowUnits(rec, r) {
  if (!rec || !r) return []; const K = rec.unitKeys || {};
  if (r.uid || r.unitId) return [r.uid || r.unitId];
  const byName = rec.__byName || Object.defineProperty(rec, '__byName', { value: Object.fromEntries(Object.entries(K).map(([u, n]) => [String(n), u])), enumerable: false }).__byName;
  if (r.district === true) { const dt = r.drivingTehsil != null ? byName[String(r.drivingTehsil)] : null, prov = dt ? dt.split('|')[0] : null, dn = String(r.name || '');
    /* v91.17.283.51 · speed (B1): the district's tehsils are looked up in an index made once per engine report (the scan of every unit key
       for every alert row of every place request held the event loop 0.4-1.8 s per request on real data); same units, same order */
    const byDist = rec.__byDist || Object.defineProperty(rec, '__byDist', { value: new Map(), enumerable: false }).__byDist;
    const ck = dn + '\u0000' + (prov || ''); let hit = byDist.get(ck);
    if (!hit) { hit = Object.keys(K).filter((u) => { const q = u.split('|'); return q[1] === dn && (!prov || q[0] === prov); }); byDist.set(ck, hit); }
    return hit.slice(); }
  const u = byName[String(r.name || '')]; return u ? [u] : [];
}
/* v91.17.283.23 · self-audit H14 · the client view of a cell's facts: the model's internal scores and weights stay operator-only (the
   level, its reason and the physical facts are kept) */
const OPERATOR_FACTS = ['reachScore', 'handFactor', 'handWhy', 'modelChannelCells', 'disputedChannelCells', 'zone', 'regime', 'equivalentCN', 'score', 'run', 'runLead', 'cut', 'hoursAtOrAbove', 'hoursErrorMAE'];   /* v283.40: heat-index hours at or above a band and their measured error: Methods only */   /* v283.24: + the heavy-rain method d run id, run lead and cut */
export function clientFacts(f) { if (!f || typeof f !== 'object') return f; const o = { ...f }; for (const k of OPERATOR_FACTS) delete o[k]; return o; }
export function holdIssueLevels(rec) {
  try {
    const d0 = rec && Array.isArray(rec.days) && rec.days.find(d => d.day === 0); if (!d0 || !d0.layers) return rec;
    for (const d of rec.days) { if (d === d0 || !d.layers) continue;
      for (const k of ISSUE_LAYERS) { const v = d0.layers[k]; if (!d.layers[k] && v && v.L) d.layers[k] = { L: { ...v.L }, S: { ...(v.S || {}) }, counts: v.counts, na: v.na, nd: v.nd, coverage: v.coverage, held: 0 }; } }   /* v283.23 self-audit H1: each day its own copy (a shared object let a per-day method write day 3 into day 0) */
  } catch (_) {}
  return rec;
}

/* ══ v91.17.283 · WS2 B-01 / owner decision A · THE SERVER RE-GATES EVERY ALERT ROW IT SERVES ═════════════════════════════════════
   The alert rows come from the page (POST /api/engine/report). The console's gateRows() dropped a non-alerting holder (flood,
   screening index) from a row but kept the row's band, severity and class rank, so a Watch-66 rain lane was published as
   "Heavy rain · Act", sev 5 (SELF-B R1). The server now re-gates each row before it is served:
     a holder may raise an alert only if the gate lets its layer alert (app.gate.canAlert) AND, where the gate's per-level lists (gatePolicy below) name
     the layer, its level is one of that layer's alertLevels (owner decision A, 20 Oct 2026: heat High / Severe and every cold level
     are Indicative and raise no alert; heat Moderate keeps alerts).
   A row whose holders all pass is served unchanged. Otherwise its severity fields are rebuilt from the holders that remain, each placed
   on the one hazard scale (data/hazard-scale.json screeningCuts; the ladder word by its operationalLadder): Act (rank 4, sev 5) at
   Severe, Watch (rank 3, sev 4) at High. A row left with no holder, or whose remaining holders sit below High, is not an alert and is
   not served (a compact row with no index cannot be placed and is not served either: fail closed). Nothing of a dropped holder survives
   on the row except its name in gateDropped. */
export function alertGate({ canAlert, scale, policy, names, domainOk, minRank = null }) {
  /* v91.17.283.24 · the general alert minimum is the gate register's (data/model-gate.json alert_min_class_rank, gate.mjs alertMinRank); without
     it a hazard with no per-level policy raises no alert (fail closed), never a typed default */
  if (!(Number.isInteger(minRank) && minRank >= 1 && minRank <= 4)) minRank = Infinity;
  /* v91.17.283.8 · audit 3 · EACH HOLDER IS JUDGED BY ITS OWN POLICY. A holder may alert when the gate lets its layer alert and, where the
     gate's per-level lists name the layer, its own level is one of that layer's alertLevels (and, v91.17.283.8 audit 9, an evidence-based
     level is inside its tested domain: domainOk). A row whose holders all pass is served unchanged. Otherwise the row is rebuilt from the
     holders that pass, each at its own permitted level: the row's level is the highest surviving holder's level; a surviving holder with a
     per-level policy is already at a level its policy permits (heat Moderate keeps alerting when a non-alerting flood holder is dropped from
     the same row), and a holder with no per-level policy keeps the general alert threshold (minRank: the gate register's alert_min_class_rank, High; the page's ALERT_MIN_CLASS_RANK).
     The row is never judged by another holder's policy, and nothing of a dropped holder survives except its name in gateDropped. */
  const cuts = ((scale && scale.screeningCuts) || []).slice().sort((a, b) => b.min - a.min);
  const levelOf = (x) => { if (x == null || !isFinite(x)) return null; const c = cuts.find(c => x >= c.min); return c ? c.level : null; };
  const ladder = Object.fromEntries(Object.entries((scale && scale.operationalLadder) || {}).filter(([k]) => k !== 'none').map(([w, lv]) => [lv, w]));
  const RANK = { Severe: 4, High: 3, Moderate: 2, Low: 1 };
  const P = (policy && policy.layers) || {};
  const verdict = (h, r) => { if (!h || !h.hazard) return { ok: false, why: 'no hazard named' }; if (!canAlert(h.hazard)) return { ok: false, why: 'the model gate does not let this hazard raise alerts' };
    const q = P[h.hazard]; if (!q) { const lv0 = levelOf(h.index); if (lv0 != null && (RANK[lv0] || 0) < minRank) return { ok: false, why: lv0 + ' ' + (names && names[h.hazard] || h.hazard) + ' is below the alert threshold (' + (Object.keys(RANK).find((w) => RANK[w] === minRank) || 'High') + ')' }; return { ok: true, lv: lv0, own: false }; }   /* v91.17.283.12: the one alert rule (the page's agnAlertLevelOk): a hazard without per-level lists alerts from High */
    const lv = levelOf(h.index); if (lv == null || !Array.isArray(q.alertLevels) || !q.alertLevels.includes(lv)) return { ok: false, why: (lv || 'this level') + ' ' + (names && names[h.hazard] || h.hazard) + ' is ' + (q.productType || 'Indicative') + ' and raises no alert (owner decision A)' };
    if (domainOk && Array.isArray(q.evidenceLevels) && q.evidenceLevels.includes(lv)) { const d = domainOk(h.hazard, lv, r); if (d && d.ok === false) return { ok: false, why: d.why }; }
    return { ok: true, lv, own: true }; };
  return function gateRows(rows, dropped = null) {
    const out = [];
    for (const r of rows || []) { if (!r) continue;
      if (r.agnQuake) { if (canAlert('quake')) out.push(r); continue; }
      /* full rows carry holders with their index; the compact rows of the report (alerts) carry only the hazard names */
      const H0 = (Array.isArray(r.holders) && r.holders.length) ? r.holders : (Array.isArray(r.hazards) && r.hazards.length) ? r.hazards.map(h => ({ hazard: h, index: h === r.hazard ? r.index : undefined })) : [{ hazard: r.hazard, index: r.index }];
      const V = H0.map((h) => verdict(h, r)); const ok = H0.filter((_, i) => V[i].ok);
      if (ok.length === H0.length) { out.push(r); continue; }
      if (!ok.length) { if (dropped) dropped.push({ hazard: r.hazard, name: r.name, district: r.district, why: V[0].why }); continue; }
      /* each surviving holder at its own level; a holder without a per-level policy counts only at or above the general threshold */
      const live = ok.map((h) => ({ h, v: V[H0.indexOf(h)] })).filter((x) => x.v.lv != null && (x.v.own || (RANK[x.v.lv] || 0) >= minRank));
      if (!live.length) { if (dropped) dropped.push({ hazard: r.hazard, name: r.name, district: r.district, why: 'below the alert threshold once the hazards that may not alert are left out' }); continue; }
      const topX = live.reduce((a, b) => ((RANK[b.v.lv] || 0) > (RANK[a.v.lv] || 0) || ((RANK[b.v.lv] || 0) === (RANK[a.v.lv] || 0) && b.h.index > a.h.index) ? b : a), live[0]);
      const top = topX.h, lv = topX.v.lv, rank = RANK[lv];
      const band = ladder[lv] || lv, kept = live.map((x) => x.h);
      out.push({ ...r, holders: kept.map(h => ({ hazard: h.hazard, index: h.index })), hazard: top.hazard, index: top.index, coEqual: kept.filter((h) => levelOf(h.index) === lv).length > 1, classRank: rank, sev: rank + 1, band,
        alert: kept.filter((h) => levelOf(h.index) === lv).map(h => (names && names[h.hazard]) || h.hazard).join(' + ') + ' · ' + band, gateDropped: H0.filter(h => !kept.includes(h)).map(h => h.hazard), regatedBy: 'server', levelBasis: 'each holder at its own permitted level' });
    }
    return out;
  };
}

/* v91.17.283 · INTEG (WS2 R2 / WS4 request) · the alert policy now comes from the model gate (model-gate.resolved.json: an entry's
   resolved.alertLevels / indicativeLevels, derived by gen_gate.py from the evidence and owner decision A). It replaces
   data/alert-policy.json, which was retired after the gate was checked to carry exactly the same lists for heat and cold (MERGE.md).
   Every layer the entry owns gets the rule (heat and its telecom twin telco_heat; cold). Product type of the non-alerting levels: the
   entry's resolved productType, else 'Indicative'. A gate without per-level lists gives no policy (the gate's canAlert alone decides). */
export function gatePolicy(G) {
  if (!G || !Array.isArray(G.entries)) return null;
  const layers = {};
  for (const e of G.entries) { const r = e && e.resolved; if (!r || !Array.isArray(r.alertLevels) || !Array.isArray(r.indicativeLevels)) continue;
    /* v91.17.283.8 · audit 9 · the alerting levels whose permission rests on evidence (not an owner decision): they alert only inside the tested domain */
    const ev = r.levels ? r.alertLevels.filter((w) => r.levels[w] && r.levels[w].canAlert && !r.levels[w].ownerDecision) : [];
    for (const l of (e.layers || [])) if (typeof l === 'string' && l) layers[l] = { alertLevels: r.alertLevels.slice(), indicativeLevels: r.indicativeLevels.slice(), evidenceLevels: ev, productType: r.productType || 'Indicative' }; }
  return Object.keys(layers).length ? { version: G.version || null, source: 'model-gate.resolved.json', layers } : null;
}

export function createEngine(app, dataDir, opts = {}) {
  const port = opts.port || 8787;
  const prof = join(dataDir, 'engine-profile'), pidFile = join(dataDir, 'engine-browser.pid'), adir = join(dataDir, 'archive', 'engine');
  mkdirSync(adir, { recursive: true });
  let latest = null; try { latest = holdIssueLevels(JSON.parse(readFileSync(join(dataDir, 'engine-latest.json'), 'utf8'))); } catch (_) { latest = null; }
  let lastSig = null;
  const st = { enabled: process.env.NIGRAAN_ENGINE !== '0', browser: null, pid: null, startedAt: null, starts: 0, exits: [], why: null, note: null, reports: 0, lastReportAt: latest ? latest.received : null };
  let child = null, timer = null, stopping = false;

  function findBrowser() {
    if (process.env.NIGRAAN_ENGINE_BROWSER && existsSync(process.env.NIGRAAN_ENGINE_BROWSER)) return process.env.NIGRAAN_ENGINE_BROWSER;
    const c = [];
    if (process.platform === 'win32') {
      for (const v of ['ProgramFiles(x86)', 'ProgramFiles']) if (process.env[v]) c.push(join(process.env[v], 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
      for (const v of ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA']) if (process.env[v]) c.push(join(process.env[v], 'Google', 'Chrome', 'Application', 'chrome.exe'));
    } else {
      if (process.env.PW_CHROME) c.push(process.env.PW_CHROME);
      try { for (const d of readdirSync('/opt/pw-browsers').filter(d => /^chromium-\d+$/.test(d)).sort().reverse()) c.push(join('/opt/pw-browsers', d, 'chrome-linux', 'chrome')); } catch (_) {}
      c.push('/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
    }
    return c.find(f => existsSync(f)) || null;
  }
  /* a browser left by a server that was killed: stop it only if it is ours (its command line names our profile folder) */
  /* v91.17.144 · B5 · the Windows check ran powershell synchronously: about 1 s with the whole server stopped at every start (laptop log,
     child-sync 550-994 ms). It now runs in the background; the browser is launched 20 s later, after it has answered. */
  function killLeftover() {
    let pid = null; try { pid = Number(readFileSync(pidFile, 'utf8').trim()); } catch (_) { return; }
    if (!(pid > 0)) return;
    const done = (ours) => { if (ours) { try { process.kill(pid); } catch (_) {} st.note = 'stopped a leftover engine browser (pid ' + pid + ')'; } try { unlinkSync(pidFile); } catch (_) {} };
    if (process.platform === 'win32') {
      try { execFile('powershell', ['-NoProfile', '-Command', "(Get-CimInstance Win32_Process -Filter 'ProcessId=" + pid + "').CommandLine"], { encoding: 'utf8', windowsHide: true, timeout: 15000 },
        (err, out) => done(!err && /engine-profile|vmpage\.mjs|science[\\/]loader\.mjs/.test(String(out || '')))); } catch (_) { done(false); }
    } else { let ours = false; try { ours = /engine-profile|vmpage\.mjs|science[\\/]loader\.mjs/.test(readFileSync('/proc/' + pid + '/cmdline', 'utf8')); } catch (_) { ours = false; } done(ours); }
  }
  /* v91.17.207 · phase B · the runner is Node.js itself (server/engine/vmpage.mjs runs the served page's scripts with no browser);
     NIGRAAN_ENGINE_RUNNER=browser keeps the headless Edge / Chrome runner of v91.17.106-206 */
  const RUNNER = String(process.env.NIGRAAN_ENGINE_RUNNER || 'vm').toLowerCase() === 'browser' ? 'browser' : 'vm';
  st.runner = RUNNER;
  function launch() {
    if (!st.enabled || stopping || child) return;
    let exe, args;
    if (RUNNER === 'vm') {
      const SCIENCE = process.env.NIGRAAN_ENGINE_SCIENCE === '1';   /* v91.17.283 · WS8: run the hazard science from server/science (default off) */
      exe = process.execPath; args = ['--max-old-space-size=1536', join(ROOT, 'server', SCIENCE ? 'science/loader.mjs' : 'engine/vmpage.mjs')];
      st.browser = SCIENCE ? 'none: science modules (server/science/loader.mjs)' : 'none: Node.js runner (server/engine/vmpage.mjs)';
    } else {
    exe = findBrowser(); st.browser = exe;
    if (!exe) { st.why = 'no Edge or Chrome found on this computer; the levels API serves what a dashboard last reported'; return; }
    mkdirSync(prof, { recursive: true });
    args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--user-data-dir=' + prof, '--window-size=1500,1000', 'http://127.0.0.1:' + port + '/?engine=1'];
    if (process.platform !== 'win32' && process.getuid && process.getuid() === 0) args.unshift('--no-sandbox');
    }
    try {
      child = spawn(exe, args, { stdio: 'ignore', windowsHide: true, env: { ...process.env, NIGRAAN_ENGINE_PORT: String(port), NIGRAAN_DATA_DIR: dataDir } });
      try { setPriority(child.pid, 10); } catch (_) {}   /* below normal: a sweep never takes the computer from LAMHA or the server */
      st.pid = child.pid; st.startedAt = new Date().toISOString(); st.starts++; st.why = null;
      try { writeFileSync(pidFile, String(child.pid)); } catch (_) {}
      child.on('error', (e) => { st.why = 'could not start ' + exe + ': ' + e.message; });
      child.on('exit', (code, sig) => {
        st.exits.push({ at: new Date().toISOString(), code, sig }); if (st.exits.length > 20) st.exits.shift();
        child = null; st.pid = null; try { unlinkSync(pidFile); } catch (_) {}
        if (stopping) return;
        const recent = st.exits.filter(x => Date.now() - Date.parse(x.at) < 3600e3).length;   /* back-off: 1, 2, 4 ... up to 60 min */
        setTimeout(launch, Math.min(3600e3, 60e3 * 2 ** Math.max(0, recent - 1)));
      });
    } catch (e) { child = null; st.why = 'start failed: ' + e.message; }
  }
  function stop() { stopping = true; if (timer) clearInterval(timer); if (child) { try { child.kill(); } catch (_) {} } try { unlinkSync(pidFile); } catch (_) {} }
  function start(delayMs = 20000) {
    if (!st.enabled) { st.why = 'turned off (NIGRAAN_ENGINE=0)'; return; }
    killLeftover();
    setTimeout(launch, delayMs);
    /* a fresh browser once a day (memory); and if no report has come for 3 hours although the browser runs, restart it */
    timer = setInterval(() => {
      if (!child) return;
      const age = st.startedAt ? Date.now() - Date.parse(st.startedAt) : 0, rep = st.lastReportAt ? Date.now() - Date.parse(st.lastReportAt) : age;
      if (age > 24 * 3600e3 || (age > STALE_MS && rep > STALE_MS)) { st.note = age > 24 * 3600e3 ? 'daily restart' : 'no report for 3 hours: restarted'; try { child.kill(); } catch (_) {} }
    }, 10 * 60e3);
    if (timer.unref) timer.unref();
    process.on('exit', () => { if (child) { try { child.kill(); } catch (_) {} } });
  }

  function report(b) {
    if (!b || !Array.isArray(b.days) || !b.days.length || !b.days[0].layers) return { ok: false, error: 'bad_body' };
    const rec = { received: new Date().toISOString(), at: b.at, build: b.build || null, gate: b.gate || null, words: Array.isArray(b.words) ? b.words.slice(0, 5) : null,
      units: b.units, unitKeys: b.unitKeys || {}, ms: b.ms, days: [], alerts: Array.isArray(b.alerts) ? b.alerts.slice(0, 500) : [],
      /* v91.17.224 · audit D-27 · the whole alert rows, their context and the forecast generation they were derived from */
      alertsFull: Array.isArray(b.alertsFull) ? b.alertsFull.slice(0, 500) : null, alertsCtx: (b.alertsCtx && typeof b.alertsCtx === 'object') ? b.alertsCtx : null,
      fc: typeof b.fc === 'string' ? b.fc.slice(0, 40) : null, fcc: typeof b.fcc === 'string' ? b.fcc.slice(0, 40) : null,
      /* v91.17.226 · the district board (every district's verdict, in board order) with the same context as the alert list */
      verdictsFull: (b.verdictsFull && Array.isArray(b.verdictsFull.rows)) ? { rows: b.verdictsFull.rows.slice(0, 1000), orderBasis: b.verdictsFull.orderBasis || null,
        unitLevel: b.verdictsFull.unitLevel || null, coverage: (b.verdictsFull.coverage && typeof b.verdictsFull.coverage === 'object') ? b.verdictsFull.coverage : null } : null };
    for (const d of b.days) {
      const o = { day: d.day, date: d.date, basis: d.basis || 'peak', layers: {} };
      for (const [k, v] of Object.entries(d.layers || {})) if (v && v.L) o.layers[k] = { L: v.L, S: v.S || {}, counts: v.counts, na: v.na, nd: v.nd, coverage: v.coverage };
      rec.days.push(o);
    }
    holdIssueLevels(rec);
    try { if (app.hazSci) app.hazSci.apply(rec); } catch (_) {}   /* v91.17.283.13 · server hazard science (hazsci.mjs): river, rain, landslide, drought, sponge, GLOF */
    try { if (app.areaHeat) app.areaHeat.apply(rec); } catch (_) {}   /* v91.17.283.12 · tehsil heat = highest point state (areaheat.mjs) */
    rec.revision = 0; rec.issueId = issueIdOf(rec);
    latest = rec; st.reports++; st.lastReportAt = rec.received;
    try { writeFileAtomicSync(join(dataDir, 'engine-latest.json'), JSON.stringify(rec)); } catch (_) {}
    return archiveRec(rec);
  }
  /* v91.17.283.23 · audit 1 · ONE ISSUE IDENTITY: an issue is (engine time, revision). Any change to the held record after it was issued
     (new area heat values, the server science applied to a record held from before a restart) is a new revision: written to
     engine-latest.json AND to the archive, with what changed it, so a shown value and its later verification name the same record. */
  function issueIdOf(rec) { return String(rec.at || rec.received) + '#r' + (rec.revision || 0); }
  function revise(what, f) {
    if (!latest) return null; let r = null;
    try { r = f(latest); } catch (_) { return null; }
    latest.revision = (latest.revision || 0) + 1; latest.revisedAt = new Date().toISOString(); latest.revisedBy = String(what || 'revision').slice(0, 120); latest.issueId = issueIdOf(latest);
    try { writeFileAtomicSync(join(dataDir, 'engine-latest.json'), JSON.stringify(latest)); } catch (_) {}
    archiveRec(latest); return r;
  }
  function archiveRec(rec) {
    /* archive the levels when they change (scores stay in engine-latest.json only) */
    /* held issue levels (v91.17.273) are not written again per day: the archive keeps day 0's and names the held layers */
    const lv = rec.days.map(d => { const held = Object.keys(d.layers).filter(k => d.layers[k].held != null);
      return { day: d.day, date: d.date, layers: Object.fromEntries(Object.entries(d.layers).filter(([, v]) => v.held == null).map(([k, v]) => [k, v.L])), ...(held.length ? { held } : {}) }; });
    const sig = createHash('sha1').update(JSON.stringify(lv) + JSON.stringify(rec.alerts)).digest('hex');
    if (sig !== lastSig) {
      lastSig = sig;
      try { appendGzMember(join(adir, 'engine_' + rec.received.slice(0, 7) + '.jsonl.gz'), gzipSync(Buffer.from(JSON.stringify({ at: rec.at, issueId: rec.issueId || null, revision: rec.revision || 0, ...(rec.revision ? { revisedAt: rec.revisedAt, revisedBy: rec.revisedBy } : {}), build: rec.build, gate: rec.gate, chain: (() => { try { return app.provenance ? app.provenance.chain().id : null; } catch (_) { return null; } })(), days: lv, alerts: rec.alerts }) + '\n'))); } catch (_) {}
      return { ok: true, archived: true };
    }
    return { ok: true, archived: false };
  }
  const fresh = () => latest && (Date.now() - Date.parse(latest.received) < STALE_MS);
  /* v91.17.283 · INTEG · build / gate above are the stamps the page that ran the engine sent; serverBuild / serverGate are this server's own
     (package.json version, served gate version), so a stale page stamp is visible beside them (stampMismatch) */
  function serverStamp() { let id = { build: null, gate: null }; try { id = buildIdentity(app); } catch (_) {}
    const mis = (id.build && latest.build && String(latest.build) !== String(id.build)) || (id.gate && latest.gate && String(latest.gate) !== String(id.gate));
    return { serverBuild: id.build, serverGate: id.gate, stampMismatch: !!mis }; }
  function head(operator) {
    if (!latest) return { ready: false, why: st.enabled ? (st.why || 'the engine has not reported yet (it reports once the national sweep has placed every unit, a few minutes after start)') : 'the engine runner is off and no dashboard has reported' };
    /* v91.17.282.1 · FIX2821 C · validUntil: the moment this run turns stale by the server's own rule (received + STALE_MS), so a page knows
       when to ask again from the server's field, not from a typed interval of its own */
    return { ready: true, at: latest.at, issueId: latest.issueId || issueIdOf(latest), revision: latest.revision || 0, ...(latest.revision ? { revisedAt: latest.revisedAt, revisedBy: latest.revisedBy } : {}), received: latest.received, stale: !fresh(), validUntil: new Date(Date.parse(latest.received) + STALE_MS).toISOString(), build: latest.build, gate: latest.gate, ...serverStamp(), words: latest.words,
      days: latest.days.map(d => ({ day: d.day, date: d.date, layers: Object.keys(d.layers) })), ...(operator ? { ms: latest.ms } : {}) };
  }
  /* v91.17.283.24 · integration item 4: the served label of a level that differs from its word (served.mjs levelLabelOf), per tehsil, so the
     map, its key and its popups say what the unit answer says ("Low or heavier") from this one national read */
  function labelsOf(layer, v) { const out = {}; let n = 0;
    for (const [uid, f] of Object.entries((v && v.facts) || {})) { const lb = levelLabelOf(layer, v.L ? v.L[uid] : null, f); if (lb) { out[uid] = lb; n++; } }
    return n ? { labels: out } : {}; }
  function levels(layer, day, operator) {
    const h = head(operator); if (!h.ready) return h;
    const d = latest.days.find(x => x.day === (Number(day) || 0)); if (!d) return { ...h, ready: false, why: 'no such day; days: ' + latest.days.map(x => x.day).join(', ') };
    if (!layer) return { ...h, layers: Object.fromEntries(Object.entries(d.layers).map(([k, v]) => [k, { counts: v.counts, na: v.na, nd: v.nd, coverage: v.coverage }])) };
    const v = d.layers[layer]; if (!v) return { ...h, ready: false, why: 'layer ' + layer + ' is not derived (unknown layer); layers: ' + Object.keys(d.layers).join(', ') };
    let tag = null; try { tag = app.gate ? app.gate.tagOf(layer) : null; } catch (_) {}
    /* v91.17.283 · owner decision A · the levels of this layer that raise no alert and read as Indicative (from the gate, gatePolicy) */
    try { const q = alertPolicy() && alertPolicy().layers && alertPolicy().layers[layer]; if (tag && q) tag = { ...tag, canAlert: !!tag.canAlert && Array.isArray(q.alertLevels) && q.alertLevels.length > 0, alertLevels: q.alertLevels, indicativeLevels: q.indicativeLevels, ...(q.alertLevels && q.alertLevels.length ? {} : { productType: q.productType || 'Indicative' }) }; } catch (_) {}
    return { ...h, layer, day: d.day, date: d.date, basis: v.held != null ? 'issue' : d.basis, ...(v.held != null ? { held: heldNoteOf(layer) } : {}), gateTag: tag, counts: v.counts, na: v.na, nd: v.nd, coverage: v.coverage,
      code: codeDict(),   /* v91.17.283.35 · D1: every code -1 .. -6 (states.mjs) */
      levels: v.L, ...(v.V ? { values: v.V, valueUnit: layer === 'comfort' ? 'discomfort index (deg C)' : null } : {}), ...labelsOf(layer, v), ...(operator ? { scores: v.S } : {}), whys: Object.fromEntries(Object.entries(v.L).filter(([, l]) => l < 0).map(([u, l]) => [u, (v.why && v.why[u]) || STATE_TEXT[String(l)] || STATE_TEXT['-1']])),
      ...(layer === 'glof' && v.facts ? { exposure: Object.fromEntries(Object.entries(v.facts).filter(([, f]) => f && f.exposure).map(([u, f]) => [u, f.exposure])), ...GLOF_CONTEXT } : {}),   /* v91.17.283.47 item 1: context, not a level */   /* v283.38 item 8: the GLOF map shades the lakes upstream (facts, not a level) */
      ...(DROUGHT_PCT_LAYERS.has(layer) ? droughtPct(d, layer) : {}) };   /* v283.38 item 9: drought shown as a rank against the place's own record, not a class */   /* v283.31 · 4.3 the reason of every unassessed cell; v283.35 · L5: every one, the generic reason of its state where the method gave none */
  }
  /* v91.17.283.13 · the rain layer reads the ensemble rain classes (hazsci.mjs); a day the ensemble run does not cover says so in its reason */
  /* v91.17.283.3 · W6 · RIVER FLOODING WITHOUT A MODELLED REACH. The page levels flood_riverine only where a modelled river reach
     (a gauge reach of the global river-flow model, within its reach of the tehsil) scores; elsewhere its engine line (selfcheck unitOn ->
     hz5 levelOf: no score, not provisional) gives -1, which was served as "no data from the hazard engine" for every such tehsil (283 on
     the live check). Code -3 (requested of the page) says "no modelled river reach" exactly. Until the page sends it, a -1 on
     flood_riverine in an issue where the layer scored other tehsils (so the river feed worked) is served with the reason "no modelled
     river reach scored here"; a layer with no tehsil scored keeps "no data" (the feed failed). */
  const riverNoReach = (k, v, lv) => (k !== 'flood_riverine' ? {} : lv === -3 ? { noRiverReach: true } : (lv === -1 && Array.isArray(v.counts) && v.counts.some((c) => c > 0)) ? { noRiverReachScored: true } : {});
  function unit(uid, operator) {
    const h = head(operator); if (!h.ready) return h;
    let id = uid; if (!(id in (latest.days[0].layers.heat || latest.days[0].layers[Object.keys(latest.days[0].layers)[0]] || { L: {} }).L)) {
      const hit = Object.entries(latest.unitKeys || {}).find(([u, k]) => k === uid || u.toLowerCase() === String(uid).toLowerCase()); if (hit) id = hit[0]; }
    const W = latest.words || [], LW = layerWords();
    const days = latest.days.map(d => ({ day: d.day, date: d.date, layers: Object.fromEntries(Object.entries(d.layers).filter(([, v]) => id in v.L).map(([k, v]) => {
      const lv = v.L[id]; const pq = policyOf(k, lv); return [k, { name: LAYER_NAME[k] || k, level: lv, ...riverNoReach(k, v, lv), ...(v.held != null ? { held: true, heldNote: heldNoteOf(k) } : {}), ...(pq || {}), word: lv >= 0 ? ((LW[k] || W)[lv] || null) : (STATE_LABEL[STATE_CODES[String(lv)]] || 'Data missing'), state: stateOfCode(lv),   /* v91.17.283.35 · D1: the state label of every code */ ...(v.why && v.why[id] ? { why: v.why[id] } : {}), ...(v.facts && v.facts[id] ? { facts: operator ? v.facts[id] : clientFacts(v.facts[id]) } : {}), ...(operator && v.S && v.S[id] != null ? { score: v.S[id] } : {}) }]; })) }));   /* v91.17.283.13 · the reason and facts of hazsci.mjs */
    if (!days[0] || !Object.keys(days[0].layers).length) return { ...h, ready: false, why: 'unknown unit ' + uid };
    const mine = (a) => rowUnits(latest, a).includes(id);   /* v283.23 self-audit H10: a tehsil row is its own unit; a district row every tehsil of that district */
    const G = gatedAll(); const alerts = G.rows.filter(mine).map((r) => ({ ...r })); const gd = G.dropped.filter(mine).map((r) => ({ ...r }));   /* v91.17.283.51 · B1: gated once per report and gate state, not once per place request (same rows) */   /* v283.23 self-audit H2: the full rows (they carry each holder's index; the compact rows have none, so the gate dropped every heat row with a false reason) */
    return { ...h, unit: id, key: latest.unitKeys[id] || null, days, alerts, alertsDay: latest.alertsCtx && Number.isInteger(latest.alertsCtx.day) ? latest.alertsCtx.day : 0, ...(gd.length ? { alertsGateDropped: gd } : {}) };
  }
  /* v91.17.283.51 · B1 · the gated, de-duplicated alert rows of the current engine report: the gate and the policy are read as before; the
     result is kept while the report, the gate's answers and the policy object are the same (checked on every call), so a place request no
     longer re-gates every alert row of Pakistan on the main thread */
  let _ga = null;
  function gatedAll() {
    const src = Array.isArray(latest.alertsFull) && (latest.alertsFull.length || !(latest.alerts || []).length) ? latest.alertsFull : (latest.alerts || []);
    let canSig = ''; try { canSig = app.gate ? Object.keys(LAYER_NAME).concat(['quake']).map((k) => { try { return app.gate.canAlert(k) ? 1 : 0; } catch (_) { return 0; } }).join('') + '|' + (app.gate.alertMinRank ? app.gate.alertMinRank() : '') : 'nogate'; } catch (_) { canSig = 'err'; }
    const pol = alertPolicy(), hs = hazardScale();
    if (_ga && _ga.latest === latest && _ga.src === src && _ga.canSig === canSig && _ga.pol === pol && _ga.hs === hs && Date.now() - _ga.at < 60e3) return _ga;
    const dropped = []; const rows = dedupeRows(gateServed(src, dropped));
    _ga = { latest, src, canSig, pol, hs, at: Date.now(), rows, dropped }; return _ga;
  }
  /* a layer with its own scale (retention) has its own words: data/map-layer-scales.json, the file the map reads */
  let _lw = null, _lwAt = 0;
  function layerWords() { if (_lw && Date.now() - _lwAt < 600e3) return _lw; _lw = {}; _lwAt = Date.now();
    try { const L = JSON.parse(readFileSync(join(dataDir, 'map-layer-scales.json'), 'utf8')).layers || {}; for (const [k, v] of Object.entries(L)) if (Array.isArray(v.words) && v.palette) _lw[k] = v.words; } catch (_) {}
    return _lw; }
  /* v91.17.224 · audit D-27 · GET /api/alerts: the one alert list (the engine's), with what a page needs to know it is the same data */
  function alerts() {
    const h = head(false); if (!h.ready) return h;
    if (!latest.alertsFull) return { ...h, ready: false, why: 'the engine report predates full alert rows (v91.17.224); the next report carries them' };
    const dropped = []; const rows = dedupeRows(gateServed(latest.alertsFull, dropped));
    return { ...h, fc: latest.fc || null, fcc: latest.fcc || null, ctx: latest.alertsCtx || null, count: rows.length, rows, ...(dropped.length ? { gateDropped: dropped } : {}) };
  }
  /* v91.17.283 · INTEG (WS3 request) · one row per place (tehsil or district) + hazard + band + day; a merged row carries count and
     dedupeKey, a row with no twin is served exactly as before */
  function dedupeRows(rows) {
    const keyOf = (r) => [(r.district ? 'district:' : 'unit:') + (r.uid ?? r.unitId ?? r.name), r.hazard, r.band ?? r.level, r.day ?? r.date ?? r.window].map((x) => String(x == null || x === '' ? '-' : x)).join('|');
    return dedupeAlertRows(rows, keyOf).map((r) => { if (r.count > 1) return r; const { dedupeKey, count, ...o } = r; return o; });
  }
  /* v91.17.283 · WS2 B-01 / A · the re-gate (alertGate above) with the gate, the one hazard scale and the alert policy of this server
     (INTEG: the policy is read from the gate, gatePolicy above; data/alert-policy.json is retired) */
  let _pol = undefined, _polAt = 0, _hs = undefined;
  function alertPolicy() { if (_pol !== undefined && Date.now() - _polAt < 600e3) return _pol; _polAt = Date.now();
    try { const G = app.gate && typeof app.gate.full === 'function' ? app.gate.full() : null; _pol = G && G.ready !== false ? gatePolicy(G) : null; } catch (_) { _pol = null; } return _pol; }
  function hazardScale() { if (_hs !== undefined) return _hs; try { _hs = JSON.parse(readFileSync(join(dataDir, 'hazard-scale.json'), 'utf8')); } catch (_) { _hs = null; } return _hs; }
  function gateServed(rows, dropped = null) {
    /* v91.17.283.8 · audit 2 · no gate on this server: fail closed (no row is served unchecked) */
    if (!app.gate) { if (dropped) for (const r of rows || []) if (r) dropped.push({ hazard: r.hazard, name: r.name, district: r.district, why: 'model gate unavailable: no alert is served unchecked' }); return []; }
    const day = latest && latest.alertsCtx && Number.isInteger(latest.alertsCtx.day) ? latest.alertsCtx.day : 0;
    const uidOf = (r) => rowUnits(latest, r)[0] || null;   /* v283.23 self-audit H10: by the unit's own unique key, never the first same name */
    const domainOk = (hz, lv, r) => { try { return inDomain(evidenceDomain(dataDir, hz), { day: r.day != null ? r.day : day, uid: uidOf(r) }); } catch (_) { return { ok: false, why: OUTSIDE_TESTED }; } };
    return alertGate({ canAlert: (k) => { try { return app.gate.canAlert(k); } catch (_) { return false; } }, scale: hazardScale(), policy: alertPolicy(), names: LAYER_NAME, domainOk, minRank: (() => { try { return app.gate && app.gate.alertMinRank ? app.gate.alertMinRank() : null; } catch (_) { return null; } })() })(rows, dropped);
  }
  /* the policy's product type for one level of a layer (owner decision A: heat High / Severe and cold are Indicative, raise no alert) */
  function policyOf(layer, lv) { const q = alertPolicy() && alertPolicy().layers && alertPolicy().layers[layer]; if (!q) return null;
    const L5 = (hazardScale() && hazardScale().levels) || []; const word = lv >= 0 && Array.isArray(q.indicativeLevels) ? (L5[lv] || null) : null;   /* level code = index into the one scale's level words */
    return word && q.indicativeLevels.includes(word) ? { productType: q.productType || 'Indicative', canAlert: false } : null; }
  /* v91.17.226 · GET /api/verdicts: the district board the engine derived (the page's most expensive step on load), with the context
     it was derived in; a page on the same build, day, basis and lead shows it instead of scoring every district again */
  function verdicts() {
    const h = head(false); if (!h.ready) return h;
    if (!latest.verdictsFull) return { ...h, ready: false, why: 'the engine report predates the district board (v91.17.226); the next report carries it' };
    const V = latest.verdictsFull;
    return { ...h, ctx: latest.alertsCtx || null, count: V.rows.length, orderBasis: V.orderBasis, unitLevel: V.unitLevel, coverage: V.coverage, rows: V.rows };
  }
  function status() { return { ...st, running: !!child, latest: head(true), archive: adir }; }
  /* v91.17.283.12 · a new set of area heat values lands: the held report takes them at once (the next engine report applies them too) */
  function reapply() { if (!latest || !app.areaHeat) return null; let run = null; try { run = app.areaHeat.status().run; } catch (_) {}
    return revise('area heat values of run ' + (run || '?'), (rec) => app.areaHeat.apply(rec)); }
  return { start, stop, report, levels, unit, alerts, verdicts, status, reapply, revise, layerWords: (k) => layerWords()[k] || null, latest: () => latest };
}
