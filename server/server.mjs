#!/usr/bin/env node
/**
 * NIGRAAN local deployment server.
 *
 * Two jobs, deliberately separated:
 *
 *   1. Serve the sealed artefact BYTE FOR BYTE. The file carries a QA receipt
 *      and a Content-Security-Policy sealed by SHA-256 over every inline
 *      script. Change one byte and the browser silently refuses to execute the
 *      block that changed, and the receipt stops describing the file you are
 *      holding. So this server never rewrites the HTML on the way out. It
 *      prints the hash it is serving at start-up so you can check it against
 *      artefact/MANIFEST.json yourself.
 *
 *   2. Be the backend the browser talks to. The architecture rule is
 *      Browser -> backend -> Open-Meteo, never Browser -> key -> Open-Meteo.
 *      The key lives in this process's environment and never reaches the page.
 *
 * Run:  OPEN_METEO_API_KEY=... node server/server.mjs
 * Then: http://localhost:8787/
 */
import { makeInject } from './api/inproc.mjs';   /* v91.17.283.51 · B2 */
import { openPmtiles } from './api/pmtiles.mjs';
import { secondaryForecast, vcKey, wkPresent } from './api/vcfallback.mjs';   /* v91.17.147; v91.17.269 · INFRA A7: secondaryForecast (first and further secondary forecast) */   /* v91.17.116 · own Pakistan street map */
import http from 'node:http';
import { monitorEventLoopDelay } from 'node:perf_hooks';   /* v91.17.144 · B5 (line ~1422 used it without an import: its health figure was always null) */
import { createReadStream, readFileSync, readdirSync, existsSync, statSync, mkdirSync, writeFileSync, appendFileSync, rmSync, renameSync, utimesSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { extname, join, resolve, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import cp from 'node:child_process';                          /* v91.17.75 · forensics: every child process is logged */
import { syncBuiltinESMExports } from 'node:module';

import os from 'node:os';
import zlib from 'node:zlib';                                 /* v91.17.76 · O · B-25 · gzip/brotli on the wire */
import { createBackend } from './api/index.mjs';
import { dashGate } from './api/dashgate.mjs';
import { agencyBody } from './api/customerscrub.mjs';   /* v91.17.283.1 · customer-view agency scrub at the response point */
import { weightOf } from './api/provider.mjs';
import { createMMBlend42 } from './api/mmblend42.mjs';   /* v91.17.283.42 · C11 multi-model blend in the passed cells only */
import { createBmRows } from './api/bmrows.mjs';   /* v91.17.283.2 · D2 + D4 */   /* v91.17.228 · audit S-36 · one call weight */
import { hourAxisMoved } from './api/sweepaxis.mjs';   /* v91.17.283.10 · budget · a splice that cannot fit is not asked */
import { createPointHeight } from './api/pointheight.mjs';   /* v91.17.72 · 30 m heights at named places */
import { createSpongeTiles } from './api/spongetiles.mjs';   /* v91.17.184 · the 250 m sponge tiles */
import { createRelief } from './api/relief.mjs';
import { als as CB_ALS } from './api/callbudget.mjs';
import { pageEssential } from './api/pagecheck42.mjs';   /* r42 · 1.0.6 */
const HERE_EXP = fileURLToPath(new URL('.', import.meta.url));   /* v91.17.283.10 · server/ (the operator Health card script lives in server/api) */
import { createRunState, keepRecentRuns } from './api/runstate.mjs';   /* v91.17.283.3 · budget cut 2 · no cold starts */
import { unitAtPoint } from './api/unitresolve.mjs';   /* v91.17.283 · WS1 · CMIP6 once per tehsil */   /* v91.17.283 · WS1 · the request class of every provider call (owner decision C) */   /* v91.17.282 · RELIEF282 · painted shaded-relief basemap tiles */

/* Load nigraan-local/.env if present (KEY=VALUE lines). Server-side only. */
try {
  const envFile = new URL('../.env', import.meta.url);
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}
/* Paid Open-Meteo key, server-side only. Order: env var -> nigraan-local/mach.key
   -> the compiled INTERNAL_KEY of the internal build kept in nigraan-local/secrets/
   (that folder is never served; only artefact/ is). */
let KEY_SOURCE = process.env.MACH_API_KEY || process.env.OPEN_METEO_API_KEY ? 'environment' : null;
try {
  if (!KEY_SOURCE) {
    const k = readFileSync(new URL('../mach.key', import.meta.url), 'utf8').trim();
    if (k) { process.env.MACH_API_KEY = k; KEY_SOURCE = 'mach.key'; }
  }
} catch {}
/* The key used to be read out of the compiled INTERNAL build in secrets/ as a last
   resort. A key inside an HTML file is one copy away from leaving the machine, so that
   path is gone: the key comes from the environment or from mach.key, and if neither is
   present the server says so and runs without a provider. v91.17.16 removed the
   NIGRAAN_ALLOW_SECRET_HTML recovery path entirely — see SEC-02 below. */
/* ══ v91.17.16 · SEC-02 · THE RECOVERY PATH AND ITS FILE ARE BOTH GONE ════
   This block read INTERNAL_KEY out of secrets/*INTERNAL*.html behind
   NIGRAAN_ALLOW_SECRET_HTML=1. MEASURED on v91.17.15: that file existed in the
   deployment tree and carried the LIVE paid key in plaintext at line 2350 —
   byte-identical to mach.key — in a 5.8 MB HTML a browser will happily open,
   where the same code puts the key into a URL query string. The file is
   deleted and this branch with it: a recovery path whose input is a credential
   leak is not a recovery path. The key comes from the environment or from
   mach.key, and from nowhere else. */
try {
  const dir = new URL('../secrets/', import.meta.url);
  const found = readdirSync(dir).filter(f => /INTERNAL.*\.html$/i.test(f));
  if (found.length) console.warn('  WARNING  a build carrying the provider key is present in secrets/ (' +
    found.join(', ') + '). Move the key to mach.key, delete the file and rotate the key.');
} catch {}

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ART = join(ROOT, 'artefact');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const KEY = process.env.MACH_API_KEY || process.env.OPEN_METEO_API_KEY || '';
if (KEY_SOURCE) process.env.MACH_KEY_SOURCE = KEY_SOURCE;
/* v91.17.283 · WS1 · C-01 · this server's internal-caller token: made fresh at each start, held in this process's environment only (the
   processes it starts, e.g. the engine runner, inherit it), never written to disk or logged. index.mjs internalCaller() accepts it in
   x-agn-internal-token; the front proxy never forwards that header. */
if (!process.env.NIGRAAN_INTERNAL_TOKEN) process.env.NIGRAAN_INTERNAL_TOKEN = randomBytes(24).toString('hex');
const backend = createBackend({ root: ROOT, dataDir: process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data') });
let MM42 = null; try { MM42 = createMMBlend42(ROOT, { tehsilPoints: () => { try { return (backend.app.units.tehsil || []).filter((u) => !u.disputed).map((u) => ({ lat: u.lat, lon: u.lon, elev: u.elevM != null ? u.elevM : u.elev })); } catch (_) { return null; } },
  /* r42 · 1.0.6 · the sweeps' own blend pools (mmblend42.mjs): their point lists, and the forecast height a point is asked at (places.pointRow) */
  sweeps: { 'hazard-grid': () => { try { return backend.app.hazardGrid && backend.app.hazardGrid.landPoints ? backend.app.hazardGrid.landPoints() : null; } catch (_) { return null; } },
    'pointstate-area': () => { try { return backend.app.areaHeat && backend.app.areaHeat.points ? backend.app.areaHeat.points() : null; } catch (_) { return null; } } },
  elevOf: (a, o) => { try { const r = backend.app.places.pointRow(a, o); return r ? (r.forecastElevM != null ? r.forecastElevM : r.elevM) : null; } catch (_) { return null; } }, zoneOf: (a, o, e) => { try { return backend.app.mos.zoneOfPoint(a, o, e); } catch (_) { return null; } }, weightOf, note: (w, ok) => { try { CB_ALS.run({ cls: 'background', tag: 'mmblend42 members' }, () => backend.app.provider.noteProxyCall(w, ok)); } catch (_) {} } }); } catch (_) { MM42 = null; }   /* v91.17.283.42 */
try { backend.app.mm42 = MM42; } catch (_) {}   /* v91.17.283.40 · GET /api/ops/mm42 (status, call cap counter, one place) */
const CB = () => (backend && backend.app && backend.app.callBudget) || null;
/* v91.17.283.53 · C · N1 (c) · every upstream provider fetch of this proxy takes a pacing slot of the caller's class (callbudget.mjs paced:
   a person's call first, the background yields; nothing refused) */
const pfetch = (u, o) => { const c = CB(); if (!c || !c.paced) return fetch(u, o); const st = CB_ALS.getStore(); return c.paced(st && st.low ? 'background' : c.current(), () => fetch(u, o)); };   /* v91.17.283 · WS1 · owner decision C (api/callbudget.mjs) */
try { backend.app.engineRunRead = () => engineRunRead(); backend.app.pxRunMemoStats = () => ({ ...PX_RUNMEMO_ST, entries: PX_RUNMEMO.size, mb: Math.round(PX_RUNMEMO_BYTES / 1048576 * 10) / 10, spliceSkippedAxisMoved: SPLICE_SKIP.n }); } catch (_) {}   /* v91.17.283 · WS1 · PATCH3 · the run label of the next engine report (index.mjs) */
let POINT_H = null; try { POINT_H = createPointHeight(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data')); } catch { POINT_H = null; }
let SPONGE_T = null; try { SPONGE_T = createSpongeTiles(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data')); } catch { SPONGE_T = null; }
let RELIEF = null; try { RELIEF = createRelief(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data')); setTimeout(() => { RELIEF.warm().catch(() => {}); }, 15000).unref(); } catch { RELIEF = null; }
/* v91.17.154 · the v91.17.80 design switch (artefact/DESIGN.txt, the v79 old design) is retired: one page, the current NIGRAAN. */
const DEFAULT_FILE = process.env.NIGRAAN_ARTEFACT || 'AI_GEO_NIGRAAN_v91_17_MACH.html';
/* v91.17.280 · NEWPAGE · the customer start page (search a place, its site card, My sites) is served at /; the console moves to
   /analyst (the same page, unchanged, operator mode as before). / with ?operator=, ?engine= or ?backend= still opens the console, so the
   operator's link, the browser engine runner (/?engine=1) and an old bookmark with ?backend= behave as before. */
const START_FILE = process.env.NIGRAAN_START || 'NIGRAAN_START.html';
const CONSOLE_Q = ['operator', 'engine', 'backend'];
/* v91.17.256 · ONE MAIN PAGE: the classic console at / (and /classic). The rebuilt console (NIGRAAN_4.html, /next) and its switch
   (data/ui-default.json, USE_NEW_LAYOUT.bat, REVERT_TO_CLASSIC.bat, POST /api/ops/ui/default) are removed: CEO 10 Oct "old is better",
   confirmed 12 Oct ("remove the new layout"). /next answers with a redirect to / so an old bookmark still lands on NIGRAAN. */
function uiPage() { return 'classic'; }
/* The artefact's connector addresses a backend as <base><vendor path>?__omhost=<free host>. */
const BACKEND_PREFIX = '/px';

/* The eleven free Open-Meteo hosts the build knows, mapped to the commercial
   equivalents. The same table the artefact carries as OM_COMMERCIAL_HOST. A
   request arrives naming the free host; if this process holds a key it is
   forwarded to the customer host with the key attached. If it holds no key the
   request is REFUSED (503 no_paid_key): the free host is never used, because a
   proxy that silently downgrades is how a deployment ends up believing it is on
   the paid tier. */
const OM_HOST = {
  'api.open-meteo.com': 'customer-api.open-meteo.com',
  'archive-api.open-meteo.com': 'customer-archive-api.open-meteo.com',
  'air-quality-api.open-meteo.com': 'customer-air-quality-api.open-meteo.com',
  'flood-api.open-meteo.com': 'customer-flood-api.open-meteo.com',
  'ensemble-api.open-meteo.com': 'customer-ensemble-api.open-meteo.com',
  'climate-api.open-meteo.com': 'customer-climate-api.open-meteo.com',
  'historical-forecast-api.open-meteo.com': 'customer-historical-forecast-api.open-meteo.com',
  /* ══ v91.17.13 · REVERTED, BECAUSE THE REASON FOR IT WAS WRONG ══════════
     v91.17.4 pointed geocoding at the free host and justified it with "Open-Meteo
     publishes no commercial geocoding host". The vendor's own geocoding page says
     an API key is "only required to commercial use" and that "the server URL
     requires the prefix customer-". MEASURED: customer-geocoding-api.open-meteo.com
     returns HTTP 200 and the same results with the paid key.
     v91.17.4 was right about one thing and it still holds: there must be ONE host
     map for this decision. There is - this one - and provider.mjs now agrees with
     it rather than contradicting it. */
  /* v91.17.283.18 · the geocoding host is gone: no place name is ever asked of the provider (server/api/places.mjs answers every one) */
  'seasonal-api.open-meteo.com': 'customer-seasonal-api.open-meteo.com',
  'previous-runs-api.open-meteo.com': 'customer-previous-runs-api.open-meteo.com',
  'marine-api.open-meteo.com': 'customer-marine-api.open-meteo.com',
  'satellite-api.open-meteo.com': 'customer-satellite-api.open-meteo.com',
};
/* v91.17.283.2 · D2 + D4 · one best_match superset per tehsil and model run (api/bmrows.mjs): the sweep bodies and the national job's GMT
   batches are cut from it where that is exact; the superset call goes through this proxy's own path (key, weight, budget, per-caller record) */
const BM = (() => { try { let P = null; const isPlace = (la, lo) => { if (!P) { P = new Set(); for (const u of ((backend.app.units && backend.app.units.tehsil) || [])) P.add(String(Number(u.lat)) + ',' + String(Number(u.lon))); } return P.has(la + ',' + lo); };
  const b = createBmRows({ runs: backend.app.modelRuns, isPlace }); backend.app.bmRows = b;
  b.setFetcher(async (q, cls) => {
    const w = weightOf((k) => q.get(k)); const c = CB(); let tier = null; try { const t = c && c.tierOf({ tag: 'sweep refresh', kind: 'forecast', models: null }); tier = t ? t.id : null; } catch (_) {}
    let over = false; try { over = !!(backend.app.provider.overBudget && backend.app.provider.overBudget()); } catch (_) {}
    try { if (!over && c && !c.allow(cls, w, { tag: 'sweep superset', kind: 'forecast', models: null, tier })) over = true; } catch (_) {}
    if (over) throw new Error('budget');
    return CB_ALS.run({ cls, tag: 'sweep superset', tier }, async () => {
      const u = new URLSearchParams(q); u.set('apikey', KEY); let r;
      try { r = await fetch('https://' + OM_HOST['api.open-meteo.com'] + '/v1/forecast?' + u.toString(), { headers: { 'user-agent': 'AI-GEO-NIGRAAN-local/91.17' }, signal: AbortSignal.timeout(60000) }); }
      catch (e) { try { backend.app.provider.noteProxyCall(w, false); } catch (_) {} try { OM_OUTAGE.note('api.open-meteo.com', false); } catch (_) {} throw e; }
      try { backend.app.provider.noteProxyCall(w, r.ok); } catch (_) {} try { OM_OUTAGE.note('api.open-meteo.com', r.status < 500, r.status); } catch (_) {}
      try { const day = new Date().toISOString().slice(0, 10); qbrRoll(day); const tg = 'sweep superset (' + cls + ') · forecast /v1/forecast'; const e = QBR.by[tg] || (QBR.by[tg] = { calls: 0, weighted: 0, locations: 0, failed: 0 });
        e.calls++; e.weighted += w; e.locations += String(q.get('latitude') || '').split(',').filter(Boolean).length; if (!r.ok) e.failed++; } catch (_) {}
      if (!r.ok) throw new Error('upstream ' + r.status);
      const j = await r.json(); const a = Array.isArray(j) ? j : [j]; a.ct = r.headers.get('content-type'); return a; });
  }); return b; } catch (e) { console.log('  bm superset not served: ' + e.message); return null; } })();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.map': 'application/json',
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const json = (res, code, obj) => {
  const b = Buffer.from(JSON.stringify(obj, null, 2));
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': b.length });
  res.end(b);
};

/* ── the backend surface ────────────────────────────────────────────────── */

/* v91.17.34 · AUDIT A14 · health() deleted: /health is answered by the backend first, and this copy said
   'Provider calls go to the free hosts', which the server has refused to do since v91.17.16. */

/* v91.17.16 · SEC-07 · proxyOpenMeteo deleted. It was unreachable — its route
   is swallowed by the /api/v1/ branch, which never declines that prefix — and
   it carried a ReferenceError that would have fired AFTER the paid upstream
   call succeeded (it read `weighted`, which is declared only inside
   proxyConnector) and been reported to the caller as provider_unreachable. It
   also never counted its calls. One proxy, proxyConnector, does this job. */

const PX_CACHE_DIR = join(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), 'cache', 'provider');
const PX_MEM = new Map();
const PX_NATMEM = new Map();   /* v91.17.89 · pool-member temperatures for the national model, 60 min */
const PX_NAT_INFLIGHT = new Map();   /* v91.17.283.22 · per point: the members request a point is waiting for */
/* v91.17.283.22 · the national pool members of some points: one provider call, every location counted; rows per location { time, model: [...] } */
async function natFetch(host, mq, nLoc) {
  const q = new URLSearchParams(mq); q.set('apikey', KEY);
  const r = await pfetch(`https://${OM_HOST[host]}/v1/forecast?${q.toString()}`, { headers: { 'user-agent': 'AI-GEO-NIGRAAN-local/91.17' }, signal: AbortSignal.timeout(20000) });
  try { backend.app.provider.noteProxyCall(1, r.ok); } catch {}
  try { backend.app.provider.noteProxyCall(Math.max(0, nLoc - 1), r.ok); } catch {}   /* every location counts */
  qbrAdd('national pool members', host, '/v1/forecast', Math.max(1, nLoc), nLoc, r.ok);   /* v91.17.283.10 · accounting only */
  if (!r.ok) return null; const j = await r.json();
  return (Array.isArray(j) ? j : [j]).map(L => { const H = L && L.hourly; if (!H || !Array.isArray(H.time)) return null; const o = { time: H.time }; for (const m of ['icon_seamless', 'gfs_seamless', 'meteofrance_seamless']) o[m] = H['temperature_2m_' + m] || null; return o; });
}
const POINT_MEMO = new Map(), PX_CURMEMO = new Map();
/* v91.17.283.24 · self-audit P4 · THE RAW VALUE OF A POINT RECORD COMES FROM THE CALL THAT MADE IT. The point record's "how it is made"
   (pointstate.mjs) asked the proxy a second time with __raw=1; that request differs upstream from the served one (the served request
   carries the national model's added variables and 3 past days), so it was a second paid provider call per place per run. Now the
   point record's own request (header x-agn-keep-raw: 1) leaves the provider's body, before any correction, here for the record to take
   at once: the provider's temperature series of each of its locations. Bounded: 400 entries, 5 minutes; taken entries are removed. */
const PX_RAWKEEP = new Map();
const rawKeyOf = (la, lo) => Number(la).toFixed(5) + ',' + Number(lo).toFixed(5);
function rawKeep(qs, body) { try { const j = JSON.parse(body.toString('utf8')), A = Array.isArray(j) ? j : [j];
  const LA = String(qs.get('latitude') || '').split(','), LO = String(qs.get('longitude') || '').split(','); if (LA.length !== A.length || LO.length !== A.length) return;
  A.forEach((L, i) => { const H = L && L.hourly; if (!H || !Array.isArray(H.time) || !Array.isArray(H.temperature_2m)) return; const k = rawKeyOf(LA[i], LO[i]);
    PX_RAWKEEP.delete(k); PX_RAWKEEP.set(k, { at: Date.now(), time: H.time, t: H.temperature_2m }); });
  const cut = Date.now() - 300e3; for (const [k, v] of PX_RAWKEEP) { if (PX_RAWKEEP.size <= 400 && v.at >= cut) break; PX_RAWKEEP.delete(k); } } catch (_) {} }
try { backend.app.pxRawTake = (la, lo) => { const k = rawKeyOf(la, lo), v = PX_RAWKEEP.get(k); if (!v) return null; PX_RAWKEEP.delete(k); return Date.now() - v.at < 300e3 ? v : null; }; } catch (_) {}
/* ══ v91.17.283 · WS1 · PATCH3 · A REPEATED REQUEST WITHIN ONE MODEL RUN COSTS NOTHING ═══════════════════════════════════════════════
   Every /px request that is not a sweep body and not kept on disk (point forecast, the area card, the point engine, the page's own calls)
   and whose provider domains are known (api/modelruns.mjs) is kept, keyed on the exact upstream request + its run key + the day of its time
   zone (+ the 15-min slot for `current` / `forecast_hours` / `past_hours`, as the backend answer cache): an identical request is answered
   from it until the provider has a newer run. The answer carries the run it came from (x-agn-model-run, UTC). Test mode (callbudget.mjs):
   a person's request is answered from the last answer of the same request that day, whatever its run (x-agn-cache: test-cache-first,
   labelled with its own run). A background tier under main-runs-only keeps its last answer until a new 00/12 UTC run. */
const KIND_OF_HOST = { 'api.open-meteo.com': 'forecast', 'air-quality-api.open-meteo.com': 'airQuality', 'ensemble-api.open-meteo.com': 'ensemble', 'seasonal-api.open-meteo.com': 'seasonal' };
const PX_RUNMEMO = new Map(), PX_RUNLAST = new Map(); let PX_RUNMEMO_BYTES = 0;
const PX_RM_INFLIGHT = new Map();   /* v91.17.283.53 · C · run-memo key -> the answer on its way (single flight) */
const PX_RUNMEMO_ST = { hits: 0, testCacheFirst: 0, keptForMainRun: 0, stored: 0, evicted: 0 };
const SPLICE_SKIP = { n: 0 };   /* v91.17.283.10 · budget · member splices not asked because the body's hour axis had moved (api/sweepaxis.mjs) */
const RUNMEMO_MAX = Math.max(8, Number(process.env.NIGRAAN_PX_RUNMEMO_MB) || 64) * 1048576;
function runMemoPut(k, base, run, body) {
  if (body.length > RUNMEMO_MAX / 8) return; const o = PX_RUNMEMO.get(k); if (o) { PX_RUNMEMO_BYTES -= o.body.length; PX_RUNMEMO.delete(k); }
  PX_RUNMEMO.set(k, { body, run, at: Date.now() }); PX_RUNMEMO_BYTES += body.length; PX_RUNMEMO_ST.stored++;
  PX_RUNLAST.set(base, k); if (PX_RUNLAST.size > 4000) PX_RUNLAST.delete(PX_RUNLAST.keys().next().value);
  while (PX_RUNMEMO_BYTES > RUNMEMO_MAX && PX_RUNMEMO.size) { const [k0, e0] = PX_RUNMEMO.entries().next().value; PX_RUNMEMO.delete(k0); PX_RUNMEMO_BYTES -= e0.body.length; PX_RUNMEMO_ST.evicted++; } }
/* ══ v91.17.283.3 · budget cut 2 · NO COLD STARTS (api/runstate.mjs): the model metadata state, the backend answer cache, this proxy's run
   memo and the tehsil superset rows are written to data/cache/runstate every 5 min when changed (by the writing server only) and when the
   server stops or drains, and read back here at start. Every kept answer is keyed on its run key and day, so it is used only while the
   provider still has that run (see runstate.mjs for the safety rules). NIGRAAN_RUNSTATE=0 turns it off. */
const RUNSTATE = (() => { try {
  const MRx = backend.app.modelRuns;
  /* v91.17.283.22 · the timed save writes a part at most once per model run (the runs of every domain the metadata holds); cap, runs kept
     and settle time from data/runstate-config.json */
  const runKey = () => { try { const a = MRx && MRx.status ? MRx.status() : null; return a && a.domains ? JSON.stringify(Object.keys(a.domains).sort().map((k) => [k, a.domains[k].run || null])) : null; } catch (_) { return null; } };
  const RS = createRunState({ dir: join(PX_CACHE_DIR, '..', 'runstate'), runKey, log: (m) => { console.log('  ' + m); try { logLine('runstate', m); } catch (_) {} },
    config: [join(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), 'runstate-config.json'), join(ROOT, 'data', 'runstate-config.json')] });
  const dayOf = (k) => { const p = String(k).split('#'); return p.length === 3 ? p[2] : null; };
  const today = () => { const t = Date.now(); const U = new Date(t).toISOString().slice(0, 10), K = new Date(t + 5 * 3600e3).toISOString().slice(0, 10); return (d) => d && (d === U || d === K || d === U + '/' + K); };
  /* v91.17.283.24 · P12 · each dump holds itself under its part's cap (the newest answers first): the answer cache (up to 96 MB) and the run
     memo (64 MB, base64 in the file) were larger than the 40 MB cap and were never written */
  if (MRx && MRx.snapshot) RS.register('modelruns', { dump: () => MRx.snapshot(Date.now(), Math.floor(RS.capChars('modelruns') * 0.9)), load: (o) => MRx.restore(o),
    sig: () => { const a = MRx.status(); return JSON.stringify([a.answerCache.stored, Object.values(a.domains).map((d) => d.run)]); } });
  RS.register('pxrunmemo', { dump: () => { const ok = today(), E = [...PX_RUNMEMO.entries()].filter(([k]) => ok(dayOf(k))), out = []; let room = Math.floor(RS.capChars('pxrunmemo') * 0.9);
      for (let i = E.length - 1; i >= 0; i--) { const [k, e] = E[i], c = 4 * Math.ceil(e.body.length / 3) + String(k).length + 64; if (c > room) break; room -= c; out.push([k, e.run, e.at, e.body.toString('base64')]); }
      return out.reverse(); },
    load: (L) => { const ok = today(); let n = 0; for (const [k, run, at, b64] of Array.isArray(L) ? L : []) { if (!ok(dayOf(k)) || PX_RUNMEMO.has(k)) continue; const body = Buffer.from(String(b64), 'base64');
      const parts = String(k).split('#'); runMemoPut(k, parts[0] + '#' + parts[2], run, body); const e = PX_RUNMEMO.get(k); if (e) e.at = at; n++; } return n; },
    sig: () => PX_RUNMEMO_ST.stored + '|' + PX_RUNMEMO.size });
  if (BM && BM.snapshot) RS.register('bmrows', { dump: () => BM.snapshot(), load: (L) => BM.restore(L), sig: () => { const s = BM.status(); return s.supersetCalls + '|' + s.rows; } });
  /* v91.17.283.22 · NO RE-BUY AFTER A RESTART (owner, 26 Oct 2026: the provider budget is spent before the day ends). Measured from
     data/quota-callers 24-26 Oct: each server start fetched again the zone members and the national pool members (PX_NATMEM, about
     3,800 + 3,600 weighted calls a start) and the blend members (blend.mjs, about 4,200), 9-12 starts a day (deploys, restarts): the
     largest single share of the day's spend. They are written with the other run-keyed caches and read back at start. An entry is kept
     with its own fetch time and run key, so the 60-minute / same-run rule decides exactly as in a server that never stopped; only entries
     fetched on the current UTC day are kept (a request's time axis is counted from its day; the zone key also names its PKT day). */
  /* only entries of the current UTC day and of the current or previous run of their kind (zone / national; keepRuns of
     data/runstate-config.json); an entry without a run while it is within its 60 minutes */
  const natDump = () => { const t = Date.now(), d = new Date(t).toISOString().slice(0, 10);
    const L = [...PX_NATMEM.entries()].filter(([, e]) => e && Number.isFinite(e.at) && new Date(e.at).toISOString().slice(0, 10) === d).map(([k, e]) => [k, e.at, e.run || null, e.v]);
    return keepRecentRuns(L, { keepRuns: RS.keepRuns(), ttlMs: 60 * 60e3, now: t, kindOf: (k) => (String(k).startsWith('zone|') ? 'z' : 'n') }); };
  const natLoad = (L) => { const t = Date.now(), d = new Date(t).toISOString().slice(0, 10); let n = 0;
    for (const x of Array.isArray(L) ? L : []) { if (!Array.isArray(x) || x.length !== 4) continue; const [k, at, run, v] = x; if (PX_NATMEM.has(k) || !Number.isFinite(at) || at > t || new Date(at).toISOString().slice(0, 10) !== d || v == null) continue;
      PX_NATMEM.set(k, { at, v, run }); n++; }
    while (PX_NATMEM.size > 2000) PX_NATMEM.delete(PX_NATMEM.keys().next().value); return n; };
  RS.register('pxmembers', { dump: natDump, load: natLoad, sig: () => { let a = 0; for (const e of PX_NATMEM.values()) a = Math.max(a, e.at || 0); return PX_NATMEM.size + '|' + a; } });
  { const BLx = backend.app.blend; if (BLx && BLx.snapshot) RS.register('blendrows', { dump: () => BLx.snapshot(Date.now(), RS.keepRuns()), load: (L) => BLx.restore(L), sig: () => BLx.sig() }); }
  const r = RS.loadAll(); console.log('  runstate   restored ' + JSON.stringify(r));
  /* v91.17.283.22 · a deploy's new server starts (and reads these files) while the old one still works; the old one writes them once more
     when it hands over (drainAndExit: saveAll, then the store is released). The new server reads them again at the hand-over, so what the
     old server fetched in its last minutes is not bought again (25 Oct: the 15-day outlook, 18,885 weighted calls, ran in both servers of
     one swap). A part already held keeps its entries; only missing ones are added. */
  try { const st = backend.app.store; if (st && st.standby && st.standby() && st.onPromoted) st.onPromoted(() => { try { const r2 = RS.loadAll(); console.log('  runstate   re-read at the hand-over ' + JSON.stringify(r2)); } catch (_) {} }); } catch (_) {}
  const save = () => { if (isActiveServer()) RS.saveAllAsync().catch(() => {}); };   /* v91.17.283.5: compressed and written off the event loop */
  const t = setInterval(save, RS.saveEveryMs()); if (t.unref) t.unref();   /* v91.17.283.22 · the period from data/runstate-config.json */
  backend.app.runState = { status: RS.status };   /* v283.24: saveNow removed (no caller; the drain saves through RS) */
  return RS; } catch (e) { console.error('  runstate   off: ' + (e && e.message)); return null; } })();
/* the model runs the engine read (sweep bodies and its other /px calls), for the run label of the levels and alerts it reports next */
const ENGINE_READ = new Map(); let ENGINE_TAKE = 0;
function runKeyNow(q) { try { const MR = backend.app.modelRuns; return MR ? MR.key(MR.specFor('forecast', (k) => q.get(k))) : null; } catch (_) { return null; } }   /* the run key known now (no call) */
function engineRead(id, run) { ENGINE_READ.set(id, { run: run || null, at: Date.now() }); if (ENGINE_READ.size > 2000) ENGINE_READ.delete(ENGINE_READ.keys().next().value); }
function engineRunRead() {
  const since = ENGINE_TAKE; ENGINE_TAKE = Date.now(); const MR = backend && backend.app && backend.app.modelRuns; const by = {}; let n = 0, unknown = 0;
  for (const [, e] of ENGINE_READ) { if (e.at < since) continue; n++; if (!e.run) { unknown++; continue; }
    for (const part of String(e.run).split(',')) { const i = part.lastIndexOf('@'); const d = part.slice(0, i), t = Number(part.slice(i + 1)); if (!Number.isFinite(t)) continue; (by[d] || (by[d] = new Set())).add(t); } }
  if (!n) return null;
  const iso = (t) => new Date(t * 1000).toISOString().slice(0, 16) + 'Z'; const all = Object.values(by).flatMap((x) => [...x]);
  return { runs: Object.fromEntries(Object.entries(by).sort().map(([d, S]) => [d, [...S].sort().map(iso)])), oldest: all.length ? iso(Math.min(...all)) : null, newest: all.length ? iso(Math.max(...all)) : null,
    readsWithKnownRun: n - unknown, readsWithUnknownRun: unknown, basis: 'the provider model runs (UTC initialisation) of the forecast bodies the engine read for this issue (api/modelruns.mjs run keys); a domain with two times was read across a run change' }; }
const PX_SWEEP = new Map(), PX_SWEEP_BUSY = new Set(), PX_SWEEP_STORE = new Map();   /* v91.17.82 · national-sweep cache */
/* v91.17.173 · requests already on their way upstream, by key: an identical request that arrives meanwhile waits for that answer
   instead of sending its own (sweep bodies, and the zone members the sweep reads) */
const PX_SWEEP_INFLIGHT = new Map(), PX_ZONE_INFLIGHT = new Map();
/* ══ v91.17.179 · THE NATIONAL SWEEP KEPT WARM (CEO 6 Oct: "first load is late") ════════════════════════════════════════════════════
   Measured on the laptop: a page opened after the server restarted, or more than an hour after the last visit, waited 45-65 s for the
   national sweep (the provider fetch plus the correction of 576 tehsils). Each sweep request the page sends is remembered here (exact
   URL, kept on disk). Two minutes after start-up, and then every 5 minutes while the page was used in the last 3 hours, each remembered
   request whose body is older than 45 minutes, or whose corrected copy for the current 15-minute slot is not ready, is replayed through
   this same route, one at a time, so the next page load is answered from the warm cache (the correction of a cached body is the
   expensive part: 3-4 s per 120 tehsils on the laptop). Nothing is replayed when the page has not been used for 3 hours or the daily budget is reached. NIGRAAN_SWEEP_WARM=0 stops it. */
/* v91.17.283.51 · memory · the provider answers kept in memory (PX_MEM) were bounded by count only (2000 answers of any size); now also by
   bytes (NIGRAAN_PX_MEM_MB, default 64 MB), oldest first, an entry read is moved to the end (least recently used goes first) */
let PX_MEM_BYTES = 0; const PX_MEM_MAX = Math.max(8, Number(process.env.NIGRAAN_PX_MEM_MB) || 64) * 1048576;
function pxMemPut(k, body) { const o = PX_MEM.get(k); if (o) { PX_MEM_BYTES -= (o.body && o.body.length) || 0; PX_MEM.delete(k); } PX_MEM.set(k, { at: Date.now(), body }); PX_MEM_BYTES += (body && body.length) || 0;
  while ((PX_MEM.size > 2000 || PX_MEM_BYTES > PX_MEM_MAX) && PX_MEM.size > 1) { const [k0, e0] = PX_MEM.entries().next().value; PX_MEM.delete(k0); PX_MEM_BYTES -= (e0.body && e0.body.length) || 0; } }
const PX_SWEEP_SEEN = new Map(), PX_CORRMEMO = new Map(), PX_CORR_INFLIGHT = new Map(), PX_CORR_PREV = new Map();   /* v91.17.182 · in-progress corrections; last corrected copy per key */
let _seenDirty = false, _seenTimer = null;
const SWEEP_SEEN_FILE = join(PX_CACHE_DIR, 'sweep', 'seen.json');
/* v91.17.283.24 · self-audit P3 · A SWEEP IS A SWEEP BY ITS ROUTE, AND THE SWEEP KEYS ARE BOUNDED. Before, any request of 20 or more
   locations was taken for a national sweep: the point records' 40-place batches and the 250 m grid's 49-point views (one key per view)
   were remembered in seen.json, written to data/cache/provider/sweep and replayed by the keep-warm task for 24 h, without bound. Now a
   sweep is a multi-location forecast / air-quality request from the dashboard page itself (no internal tag) or from the engine that
   runs that page (x-agn-internal: engine); the keep-warm task (sweep-warm) replays only keys remembered from such a request (a
   replay of a body not held is answered 204, as before). The remembered keys, the bodies in memory, the corrected copies and their files are held to SWEEP_KEYS_MAX (the newest
   uses); an evicted key's files are removed, and files of keys no longer remembered are pruned at start and on each keep-warm pass. */
const SWEEP_KEYS_MAX = 64;
function sweepSeenSave() { _seenDirty = true; if (_seenTimer) return; _seenTimer = setTimeout(() => { _seenTimer = null; if (!_seenDirty) return; _seenDirty = false;
  try { mkdirSync(join(SWEEP_SEEN_FILE, '..'), { recursive: true }); writeFileSync(SWEEP_SEEN_FILE + '.tmp', JSON.stringify(Object.fromEntries(PX_SWEEP_SEEN))); renameSync(SWEEP_SEEN_FILE + '.tmp', SWEEP_SEEN_FILE); } catch {} }, 5000); _seenTimer.unref && _seenTimer.unref(); }
const SWEEP_CALLERS = new Set(['', 'engine']);
const OPTIONAL_PATHS = new Set(['/api/glof/national', '/api/pool/skill', '/api/landslide/giri', '/api/quake/live', '/api/ext/usgs']);   /* v91.17.283.52 · F3 (below) */
function sweepDrop(sk) { PX_SWEEP.delete(sk); PX_SWEEP_SEEN.delete(sk); PX_CORR_PREV.delete(sk); PX_CURMEMO.delete(sk);
  for (const ext of ['.json', '.json.run', '.corr', '.corr.meta']) { try { rmSync(join(PX_CACHE_DIR, 'sweep', sk + ext), { force: true }); } catch (_) {} } }
function sweepBound() { let n = 0; while (PX_SWEEP_SEEN.size > SWEEP_KEYS_MAX) { let old = null; for (const [k, v] of PX_SWEEP_SEEN) if (!old || v.at < old[1]) old = [k, v.at]; sweepDrop(old[0]); n++; } if (n) sweepSeenSave(); return n; }
/* files of keys not remembered (over 6 h old: a key used just before a restart may not be in seen.json yet; a sibling server's new key is in the shared seen.json) or older than 24 h */
function sweepPrune() { try { const D = join(PX_CACHE_DIR, 'sweep'); if (!existsSync(D)) return 0; let n = 0;
  for (const f of readdirSync(D)) { const m = /^([0-9a-f]{64})\.(json|json\.run|corr|corr\.meta)$/.exec(f); if (!m) continue;
    let age = 0; try { age = Date.now() - statSync(join(D, f)).mtimeMs; } catch (_) { continue; }
    if ((!PX_SWEEP_SEEN.has(m[1]) && age > 6 * 3600e3) || age > 24 * 3600e3) { try { rmSync(join(D, f), { force: true }); n++; } catch (_) {} } }
  return n; } catch (_) { return 0; } }
try { if (existsSync(SWEEP_SEEN_FILE)) { const E = Object.entries(JSON.parse(readFileSync(SWEEP_SEEN_FILE, 'utf8'))).filter(([, v]) => v && v.url && v.route === 'sweep' && Date.now() - v.at < 24 * 3600e3)
  .sort((a, b) => b[1].at - a[1].at).slice(0, SWEEP_KEYS_MAX); for (const [k, v] of E) PX_SWEEP_SEEN.set(k, v); } } catch {}   /* an entry written before v283.24 (no route) is not replayed */
/* v91.17.186 · FIRST LOAD AFTER A RESTART. The last corrected copy of each sweep body was kept in memory only, so after every restart
   (each apply) the first page load waited for four fresh 120-tehsil corrections (58-119 s measured). The copy is now also written to
   disk beside the raw body and read back at start; the same rule serves it (at most one 15-minute slot old, marked
   x-agn-corrected-slot: previous) while the current slot's copy is made. NIGRAAN_CORR_PREV=0 switches the previous copy off entirely. */
const CORR_DIR = join(PX_CACHE_DIR, 'sweep');
function corrPrevSave(sk) { const v = PX_CORR_PREV.get(sk); if (!v || !v.cb || !v.cb.buf) return;
  setImmediate(() => { try { mkdirSync(CORR_DIR, { recursive: true }); const f = join(CORR_DIR, sk + '.corr');
    writeFileSync(f + '.tmp', v.cb.buf); renameSync(f + '.tmp', f); writeFileSync(f + '.meta', JSON.stringify({ at: v.at, slot: v.slot, n: v.cb.n, tag: v.tag || null })); } catch {} }); }
try { if (existsSync(CORR_DIR)) for (const f of readdirSync(CORR_DIR)) { if (!f.endsWith('.corr.meta')) continue; const sk = f.slice(0, -10); if (!PX_SWEEP_SEEN.has(sk)) continue;   /* v283.24 · P3 · only a remembered sweep key */
  try { const m = JSON.parse(readFileSync(join(CORR_DIR, f), 'utf8')); if (Math.floor(Date.now() / 900e3) - m.slot > 1) continue;
    PX_CORR_PREV.set(sk, { at: m.at, slot: m.slot, tag: m.tag || null, cb: { buf: readFileSync(join(CORR_DIR, sk + '.corr')), n: m.n } }); } catch {} } } catch {}
sweepPrune();   /* v91.17.283.24 · P3 · at start: the files of keys no longer remembered */   /* v91.17.267 · tag: the blend state the copy was made with */
let _warmBusy = false;
async function sweepWarm(startup) {
  if (process.env.NIGRAAN_SWEEP_WARM === '0' || process.env.NIGRAAN_SWEEP_CACHE === '0' || _warmBusy) return;
  if (!isActiveServer()) return;   /* v91.17.269 · INFRA A6 · a standby or draining server spends no provider call on keep-warm */
  const lastUse = Math.max(0, ...[...PX_SWEEP_SEEN.values()].map((v) => v.at));
  if (!startup && Date.now() - lastUse > 3 * 3600e3) return;
  _warmBusy = true;
  try {
    sweepBound(); sweepPrune();
    for (const [sk, v] of [...PX_SWEEP_SEEN]) {
      if (Date.now() - v.at > 24 * 3600e3) { sweepDrop(sk); sweepSeenSave(); continue; }
      const hit = PX_SWEEP.get(sk); const age = hit ? Date.now() - hit.at : Infinity;
      const corrWarm = hit && PX_CORRMEMO.has(sk + '|' + hit.at + '|' + Math.floor(Date.now() / 900e3));
      if (!startup && age < 45 * 60e3 && corrWarm) continue;   /* raw body fresh and its corrected copy ready for this 15-min slot */
      try { const r = await fetch(`http://127.0.0.1:${PORT}${v.url}`, { headers: { 'sec-fetch-site': 'same-origin', 'x-agn-internal': 'sweep-warm' }, signal: AbortSignal.timeout(180000) }); await r.arrayBuffer(); } catch {}
    }
  } finally { _warmBusy = false; }
}
setTimeout(() => sweepWarm(true).catch(() => {}), 2 * 60e3).unref?.();
setInterval(() => sweepWarm(false).catch(() => {}), 5 * 60e3).unref?.();
/* v91.17.182 · and 10 s after every 15-minute slot boundary, so each slot's corrected copies are made before a visitor asks for them */
(function slotWarm() { const ms = 900e3 - (Date.now() % 900e3) + 10e3; setTimeout(() => { sweepWarm(false).catch(() => {}); slotWarm(); }, ms).unref?.(); })();
async function proxyConnector(req, res, url) {
  try { const c = backend && backend.app && backend.app.provenance && backend.app.provenance.chain(); if (c && c.id) res.setHeader('x-agn-chain', c.id); } catch (_) {}   /* v91.17.147 · audit F12 */
  // /px/<vendor path>?__omhost=<free host>&...   (the artefact's CONNECTOR.route contract)
  /* ══ v91.17.16 · SEC-01 · THE GATEWAY SPENT THE OPERATOR'S MONEY FOR ANYONE ═
     The CSRF guard in the request handler reads
         req.method !== 'GET' && req.method !== 'HEAD' && !SAFE_ORIGIN(req)
     so GET was exempt by construction, and /px is dispatched before auth and
     before the rate limiter. MEASURED on v91.17.15:

         curl -H 'Origin: https://evil.example' \
              -H 'Referer: https://evil.example/page' \
              '.../px/v1/forecast?__omhost=api.open-meteo.com&latitude=33.7...'
         -> HTTP 200, real forecast, x-agn-provider-tier: commercial,
            x-agn-provider-ms: 448, x-agn-weighted-calls: 1.00

     So any page the operator had open in any other tab could spend the paid
     Open-Meteo quota in a loop, silently. This is a cost-bearing route and it
     is now gated like one.

     The gate is origin-based rather than token-based on purpose: the artefact
     is a static file that calls /px with fetch() and holds no token, so
     requiring a bearer would have meant inventing a token exchange for the
     page. Two independent signals, either of which is decisive:

       Sec-Fetch-Site   sent by every current browser and NOT settable by page
                        script. 'cross-site' and 'same-site' are refused;
                        'same-origin' and 'none' (address bar, curl) pass.
       Origin/Referer   SAFE_ORIGIN already resolves these against this
                        server's own host. A cross-origin fetch always carries
                        Origin, so a browser that sends no Sec-Fetch-Site is
                        still caught here.

     A non-browser client (curl, a script on the operator's own machine) sends
     neither and is allowed, which is the existing posture for this loopback
     server and is not what this defect was about. */
  const _sfs = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (_sfs === 'cross-site' || _sfs === 'same-site') {
    return json(res, 403, { error: 'cross_site_request_blocked', provider: 'MACH forecast',
      why: 'This is a cost-bearing provider route. It answers requests from this '
         + 'dashboard only, and this request came from another site.' });
  }
  if (!SAFE_ORIGIN(req)) {
    return json(res, 403, { error: 'cross_site_request_blocked', provider: 'MACH forecast',
      why: 'This is a cost-bearing provider route and the request declared another origin.' });
  }

  const qs = new URLSearchParams(url.search);
  const host = qs.get('__omhost');
  if (!host || !Object.prototype.hasOwnProperty.call(OM_HOST, host)) {
    return json(res, 400, { error: 'unknown_provider_host', why: '__omhost must name a host this build knows' });
  }
  /* v91.17.58 · __raw=1 asks for the provider's numbers with no station correction applied (the compare scripts use it
     to show raw beside served; nothing in the artefact sends it). The flag never goes upstream. */
  const wantRaw = qs.get('__raw') === '1'; qs.delete('__raw');
  /* v91.17.58 · __mos=1 applies the station correction to a historical-forecast response too (same tables, dated by each
     hour's own timestamp), so a compare script can score the forecast AS SERVED against a station history. Off by
     default: the historical host feeds the verification job, which must see the provider's numbers. Never goes upstream. */
  const wantMos = qs.get('__mos') === '1'; qs.delete('__mos');
  /* v91.17.91 · __nonat=1: the served chain without the national model (the map grid blends the two itself). Never goes upstream. */
  const noNat = qs.get('__nonat') === '1'; qs.delete('__nonat');
  /* v91.17.108 · __nolive=1: no live MACH terms (L2 running bias, L3) - for replays of past hours. Never goes upstream. */
  const noLive = qs.get('__nolive') === '1'; qs.delete('__nolive');
  /* v91.17.187 · __nowx=1: the served chain without the weather MOS (wxmos.mjs) - its own training replays. Never goes upstream. */
  const noWx = qs.get('__nowx') === '1'; qs.delete('__nowx');
  /* v91.17.267 · __noblend=1: the served chain started from best_match instead of the plains multi-model mix (blend.mjs): the v266
     chain, for A/B checks and the point engine. Never goes upstream. */
  const noBlend = qs.get('__noblend') === '1'; qs.delete('__noblend');
  qs.delete('__omhost'); qs.delete('apikey');
  /* ══ SEC-04 · CREDENTIAL-SHAPED PARAMETERS WERE RELAYED VERBATIM ════════
     Only __omhost and apikey were removed; token=, secret=, key= and anything
     else a caller appended went upstream on this server's paid key. Nothing in
     this build sends them, so nothing legitimate is lost by dropping them, and
     a relay that forwards a caller's credentials under its own key is a
     confused deputy. The cap on count and length is there because the URL is
     built by concatenation. */
  for (const k of [...qs.keys()]) {
    if (/(^|[-_])(api[-_]?key|key|token|secret|password|pass|auth|bearer|session|cookie)$/i.test(k)) qs.delete(k);
  }
  if ([...qs.keys()].length > 40 || qs.toString().length > 4000) {
    return json(res, 400, { error: 'provider_query_too_large',
      why: 'This route relays a bounded query. Reduce the number or size of parameters.' });
  }
  /* PAID ONLY. With no key this server refuses instead of using the free hosts:
     the free tier is non-commercial and its daily quota is shared per IP. */
  if (!KEY) {
    return json(res, 503, { error: 'no_paid_key', provider: 'MACH forecast',
      why: 'MACH forecast API key not configured on this server. Put the key in nigraan-local\\mach.key and restart RUN_NIGRAAN.bat.' });
  }
  /* v91.17.13 · every host in this map is a customer host, geocoding included. */
  qs.set('apikey', KEY);
  const target = OM_HOST[host];
  const path = url.pathname.slice(BACKEND_PREFIX.length) || '/';
  /* v91.17.283.31 · data lane · THE GLOBAL MODEL'S RIVER FLOWS ARE NEVER SHOWN TO A CUSTOMER: measured against the river gauge sheet (33
     stations, 18-28 Oct 2026) they read 1.2-7.7x the measured flow (no barrage diversions). A customer request for them is refused; the
     operator view keeps them; the served river levels (hazsci, server side) are unchanged */
  if (path === '/v1/flood' && (String(req.headers['x-agn-view'] || '').toLowerCase() === 'customer' || !operatorDecision(req).operator)) {
    res.writeHead(403, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'model_river_flows_withheld', why: 'model river flows are not shown: they read several times the measured flow; the measured river gauges and the river levels are served instead' })); }
  /* ══ SEC-03 · THE GATEWAY WAS AN OPEN RELAY TO THE VENDOR'S WHOLE API ════
     The remainder of the URL was concatenated into the upstream request with
     the paid key attached and no check at all. MEASURED: a request for
     /px/v1/TOTALLY_MADE_UP_PATH made a real upstream round trip
     (x-agn-provider-ms: 120) and the vendor's 404 was relayed back. Every one
     of those is a billable call against a path this build never uses.

     The list is the paths this build actually requests, counted in the
     artefact and in server/api/*.mjs on v91.17.15: forecast 21+15,
     archive 5+15, flood 5+3, search 4+1, ensemble 2+2, climate 2,
     air-quality 2+1, seasonal 1+4, previous-runs 1, historical-forecast 1.
     Marine, satellite and elevation are listed because OM_HOST carries their
     customer hosts and a future caller would otherwise be refused for the
     wrong reason. Anything else is refused before the money is spent. */
  const PX_PATHS = new Set([
    '/v1/forecast', '/v1/archive', '/v1/ensemble', '/v1/flood', '/v1/air-quality',
    '/v1/seasonal', '/v1/climate', '/v1/marine', '/v1/elevation',
    '/v1/previous-runs', '/v1/historical-forecast', '/v1/satellite-radiation'
  ]);
  if (!PX_PATHS.has(path)) {
    return json(res, 400, { error: 'unknown_provider_path', provider: 'MACH forecast', path,
      why: 'This route relays only the vendor paths this build uses. An unlisted path '
         + 'is refused here rather than paid for upstream.',
      allowed: [...PX_PATHS] });
  }
  /* v91.17.283 · WS1 · CMIP6 ONCE PER TEHSIL (coordinator decision, 21 Oct). The Customize page asks the climate projections (7 CMIP6
     models, 1991-2010 / 2021-2040 / 2041-2050) for the exact place: 1,826 weighted calls per new place, 94 % of a first visit
     (BUDGET_REPORT.md section 3). A one-place climate request with no elevation of its own is now asked for the place's tehsil (the tehsil
     that contains it, unitresolve.mjs) at the tehsil's own representative point: the closed periods are kept on disk as before, so the
     projection is fetched once per tehsil and period and every later place in that tehsil costs nothing. The answer names its basis
     (x-agn-climate-basis: the tehsil). NIGRAAN_CLIMATE_TEHSIL=0 keeps the exact place. */
  if (path === '/v1/climate' && host === 'climate-api.open-meteo.com' && process.env.NIGRAAN_CLIMATE_TEHSIL !== '0' && !qs.has('elevation')) {
    const las = String(qs.get('latitude') || '').split(','), los = String(qs.get('longitude') || '').split(',');
    if (las.length === 1 && los.length === 1) { try { const h = unitAtPoint(backend.app, Number(las[0]), Number(los[0])); const U = h && h.unit;
      if (U && Number.isFinite(U.lat) && Number.isFinite(U.lon)) { qs.set('latitude', U.lat.toFixed(4)); qs.set('longitude', U.lon.toFixed(4));
        res.setHeader('x-agn-climate-basis', 'tehsil ' + encodeURIComponent(String(U.name || U.unitId)) + ' (representative point ' + U.lat.toFixed(4) + ',' + U.lon.toFixed(4) + ')'); } } catch (_) {} }
  }
  /* ══ v91.17.5 · THE INJECTED ELEVATION WAS MAKING POINT FORECASTS WORSE ═══
     v91.17.3 gave every single-point request the NEAREST TEHSIL's bundled DEM
     height, on the reasoning that supplying no elevation leaves Open-Meteo using
     a grid-cell mean. That reasoning does not survive measurement, and the
     substitution had two failure modes that compounded.

     WRONG UNIT. A centroid is not the point. Islamabad F-7 (33.7204, 73.0561)
     sits INSIDE Islamabad tehsil, but Khanpur's centroid is 11.7 km away and
     Islamabad's is 11.9 km, so Khanpur — a tehsil in Haripur district — won by
     200 metres of centroid distance and supplied the height. Any point near the
     edge of a large tehsil is routinely closer to a neighbour's centroid than to
     its own.

     WRONG QUANTITY. Even the correct tehsil has ONE elevation for ground that
     spans hundreds of metres. Islamabad tehsil runs from about 500 m to the
     Margalla ridge; its population-weighted height is 541 m, and the build's own
     comment says that figure "is not town weather". Injecting it into an
     arbitrary point request made every hill point a plains point.

     Measured against the provider's own per-point DEM, same coordinates, same
     hour:

         point            injected tehsil height   provider DEM    T injected   T provider
         F-7 Islamabad    543 m (from Khanpur)         576 m          29.1           28.9
         Pir Sohawa       543 m (from Khanpur)         831 m          29.1           27.0
         Murree           —                          2,135 m            —            18.7

     The provider resolves the point at high resolution and its temperature
     follows the terrain. Ours flattened it: four points spread across Islamabad
     and Rawalpindi, and up onto the Margalla ridge, all came back at essentially
     one temperature because all four were told they were at ~540 m.

     So the injection is withdrawn for point requests. A caller that supplies its
     own elevation is still honoured untouched — the national sweep passes each
     tehsil's population-weighted height explicitly, which is the right quantity
     for a tehsil AGGREGATE and is unaffected by this change. What is removed is
     this server silently answering a question about a point with a number about
     an area, sometimes the wrong area. */
  let elevBasis = null;
  try {
    const wantsElev = ['/v1/forecast', '/v1/archive', '/v1/ensemble', '/v1/previous-runs', '/v1/historical-forecast'].includes(path);
    /* v91.17.72 · A NAMED PLACE IS SERVED AT ITS OWN 30 m HEIGHT. A single-point forecast with no caller elevation at a
       gazetteer place, tehsil settlement anchor or station (within 100 m, data/place-height30.json) is sent with that place's
       GLO-30 height; anywhere else the provider keeps its own point DEM (the v91.17.5 rule: never an area height for a point).
       NIGRAAN_POINT_HEIGHT=0 turns it off. */
    if (path === '/v1/forecast' && !qs.has('elevation') && POINT_H && process.env.NIGRAAN_POINT_HEIGHT !== '0') {
      const la = String(qs.get('latitude') || ''), lo = String(qs.get('longitude') || '');
      if (la && lo && !la.includes(',') && !lo.includes(',')) {
        try { const h = POINT_H.heightAt(Number(la), Number(lo)); if (h && h.ok && h.basis === 'place30' && Number.isFinite(h.elevM)) { qs.set('elevation', String(Math.round(h.elevM))); elevBasis = 'the named place\'s own height on the 30 m terrain model (' + Math.round(h.elevM) + ' m, ' + (h.place && h.place.kind ? h.place.kind : 'place') + ' within ' + (h.place ? h.place.distM : '?') + ' m)'; } } catch { /* the provider keeps its DEM */ }
      }
    }
    if (wantsElev && !elevBasis) {
      elevBasis = qs.has('elevation')
        ? 'caller-supplied elevation, passed through unchanged'
        : 'the provider resolves this point against its own DEM. This server no longer substitutes a tehsil height for a point request: a tehsil centroid is not the point, and the nearest centroid is not always the containing tehsil.';
    }
  } catch { /* the request proceeds unchanged rather than failing */ }
  /* v91.17.89 · the national hyperlocal model reads dew point, cloud, wind speed and direction, shortwave and rain for the hour.
     A corrected temperature request that lacks any of them gets them upstream, and they are removed again before the answer
     leaves (correctResponse strip). The weight below counts them. */
  const qsClient = new URLSearchParams(qs);   /* v91.17.147 · the request as the caller sent it (the fallback answers this, not the widened upstream one) */
  /* ══ v91.17.269 · INFRA A7 · THE SECONDARY FORECAST TAKES OVER ON AN OUTAGE, NOT ONLY ON THE QUOTA ═══════════════════════════════════
     A point forecast (up to 5 locations, no dated window) that the main forecast cannot answer - quota spent (429, as before), a 5xx after
     the retry, no answer or a timeout - is answered by the secondary forecast (server/api/vcfallback.mjs: the first one when vc.key exists,
     then a further one only if its own key file exists), marked agn_fallback, uncorrected, as since v91.17.147. While the main forecast is
     in an outage (OM_OUTAGE: 3 failed calls within 2 min) such requests go straight to the secondary forecast for 2 min instead of
     waiting up to 2 x 45 s on the main one; the first request after that window tries the main forecast again. The internal learners
     (fleet and synop pairs, the pool, the grids, the step variants) never get it (v91.17.147 audit F9); NIGRAAN_FALLBACK=0 turns it off. */
  /* v91.17.283.22 · a multi-model request (models=a,b,...) is never answered by the secondary forecast: it has no per-model columns (the
     place record's pool, now tagged place-record, asks one; so does the models-side-by-side product) */
  const _int = String(req.headers['x-agn-internal'] || ''), _noFb = /^(fleet-pairs|synop-pairs|pool|hyperlocal-grid|ai-local|state|point-engine-variant)$/.test(_int) || String(qs.get('models') || '').includes(',');   /* v91.17.161 · only the step-decomposition variants are kept off the fallback (they must not subtract two models); the point card itself still gets the marked fallback */
  const _fbOk = !_noFb && process.env.NIGRAAN_FALLBACK !== '0' && path === '/v1/forecast' && host === 'api.open-meteo.com' && !qs.has('start_date')
    && String(qs.get('latitude') || '').split(',').filter(Boolean).length <= 5;
  const serveSecondary = async (why, reason) => {
    if (!_fbOk || res.headersSent) return false;
    let fb = null; try { fb = await secondaryForecast(ROOT, qsClient, why); } catch (_) { fb = null; }
    if (!fb || res.headersSent) return false;
    try { const day = new Date().toISOString().slice(0, 10); qbrRoll(day); const tag = 'secondary forecast ' + fb.tier + ' · ' + why;
      const e = QBR.by[tag] || (QBR.by[tag] = { calls: 0, weighted: 0, locations: 0, failed: 0 }); e.calls++; e.locations += String(qsClient.get('latitude') || '').split(',').filter(Boolean).length || 1; } catch (_) {}
    const b2 = Buffer.from(JSON.stringify(fb.body));
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': b2.length, 'x-agn-provider': 'secondary forecast', 'x-agn-fallback': String(fb.tier), 'x-agn-upstream': String(reason).replace(/[^\w .:-]/g, '').slice(0, 80) });
    res.end(b2); return true; };
  if (_fbOk && OM_OUTAGE.active() && (vcKey(ROOT) || wkPresent(ROOT)) && await serveSecondary('outage', 'main forecast outage')) return;
  let natAdded = [], natPast = 0;
  try {
    const corr = !wantRaw && path === '/v1/forecast' && (host === 'api.open-meteo.com' || (wantMos && host === 'historical-forecast-api.open-meteo.com'));
    const NA = backend.app.national;
    /* v91.17.157 · audit: a daily-only temperature request skipped the national model and the zone members (both read the hourly curve),
       so in the mountains the raw daily value was served (bias about -3.7 C). It now gets the hourly curve upstream, removed again
       before the answer leaves, so a daily maximum is the same number as the hourly-request card. */
    if (corr && NA && NA.enabled()) { const hv0 = String(qs.get('hourly') || '').split(',').filter(Boolean), dv0 = String(qs.get('daily') || '').split(',');
      if (!hv0.includes('temperature_2m') && dv0.some((v) => /^temperature_2m_(max|min|mean)$/.test(v))) { qs.set('hourly', [...hv0, 'temperature_2m'].join(',')); natAdded = ['temperature_2m']; } }
    /* v91.17.147 · audit F11 · the no-national variant asks the provider the same request as the served one (then strips the extras),
       so the point engine's step decomposition reads one provider run from the memo, not two */
    if (corr && NA && NA.enabled() && (!noNat || String(qs.get('latitude') || '').split(',').length <= 5)) {   /* v91.17.149 · only point-sized no-national requests share the upstream request (the map grid's large __nonat sweeps grew 3 past days and stalled the server) */
      const hv = String(qs.get('hourly') || '').split(',').filter(Boolean);
      if (hv.includes('temperature_2m')) { const add = NA.needVars().filter(v => !hv.includes(v)); natAdded = [...natAdded, ...add]; if (add.length) qs.set('hourly', [...hv, ...add].join(',')); }
      /* v91.17.90 · the model reads the last 6 h of cloud and wind and the last 72 h of rain: a request with no history gets
         3 past days upstream, cut off again before the answer leaves (correctResponse). Cost: none up to 11 forecast days. */
      if (hv.includes('temperature_2m') && String(qs.get('latitude') || '').split(',').length <= 40 && !qs.has('past_days') && !qs.has('past_hours') && !qs.has('start_date') && !qs.has('start_hour')) { qs.set('past_days', '3'); natPast = 3; }
      /* v91.17.147 · audit data F1 · a request for the last few hours (past_hours, e.g. the area table) got no history, so the
         model's 6 h and 72 h features were built from a cut series and the same hour came out 0.5 C apart from the point card.
         Up to 72 past hours: the proxy asks for 3 past days instead and cuts the answer back to the hours asked for. */
      else if (hv.includes('temperature_2m') && String(qs.get('latitude') || '').split(',').length <= 40 && qs.has('past_hours') && !qs.has('past_days') && !qs.has('forecast_hours') && !qs.has('start_date') && !qs.has('start_hour')) {
        const ph = Number(qs.get('past_hours')); if (Number.isFinite(ph) && ph >= 0 && ph <= 72) { qs.delete('past_hours'); qs.set('past_days', '3'); natPast = { d: 3, h: Math.round(ph) }; } }
    }
  } catch { natAdded = []; }
  /* v91.17.147 · audit data F3 · the mountain rain mapping needs the day's mean temperature (snow vs rain); a rain-only request gets
     temperature upstream, removed again before the answer leaves, so the page's rain and the warnings' rain are the same numbers */
  try { if (!wantRaw && path === '/v1/forecast' && host === 'api.open-meteo.com') { const hv2 = String(qs.get('hourly') || '').split(',').filter(Boolean);
    if (hv2.includes('precipitation') && !hv2.includes('temperature_2m')) { qs.set('hourly', [...hv2, 'temperature_2m'].join(',')); natAdded = [...natAdded, 'temperature_2m']; } } } catch (_) {}
  /* v91.17.89 · the other pool members for a plain request of up to 40 points: one extra temperature-only call (3 models), cached
     60 min, so the national model can use its pool variant (held-out plains MAE 1.29 vs 1.40 °C without the members).
     Multi-location requests (the sweeps) keep the variant without members. NIGRAAN_NATIONAL_POOL=0 turns the extra call off. */
  let natMem = null;
  try {
    const NA = backend.app.national; const mdl = String(qs.get('models') || 'best_match');
    const nLoc = String(qs.get('latitude') || '').split(',').filter(Boolean).length; const one = nLoc >= 1 && nLoc <= 40;   /* points and the area card; not the sweeps */
    const corr = !wantRaw && path === '/v1/forecast' && (host === 'api.open-meteo.com' || (wantMos && host === 'historical-forecast-api.open-meteo.com'));
    if (corr && NA && NA.enabled() && !noNat && one && mdl === 'best_match' && process.env.NIGRAAN_NATIONAL_POOL !== '0'
        && String(qs.get('hourly') || '').split(',').includes('temperature_2m')) {
      /* v91.17.283.22 · ONE FETCH PER POINT AND RUN. The members were keyed on the whole request, so every request shape of a place (7, 8 or
         1 forecast days, with or without past days, the point card, the area card, the record's own inputs) bought them again: 5 calls for
         one place in the mock count of v283.21, and 32,260-42,612 weighted calls a day (data/quota-callers 24-25 Oct). They are now kept per
         point (latitude, longitude, height, time zone, cell rule) for the members' run, on a window that holds every forecast request
         (past_days at least 3, forecast_days 8 or 16): the provider weighs a request of one variable from three models at 1 call per
         location for any window up to 16 days, so the wider window costs nothing and every later request of that point reads it. The
         members are read by their hour strings (verification.mjs), so the hours of each request are exactly the hours it had before. A
         dated window (start_date / start_hour) keeps its own exact request. */
      const dated = qs.has('start_date') || qs.has('end_date') || qs.has('start_hour') || qs.has('end_hour');
      const LA = String(qs.get('latitude') || '').split(','), LO = String(qs.get('longitude') || '').split(','), EL = String(qs.get('elevation') || '').split(',');
      const fdReq = qs.has('forecast_days') ? Number(qs.get('forecast_days')) : qs.has('forecast_hours') ? Math.ceil(Number(qs.get('forecast_hours')) / 24) + 1 : 7;
      const pdReq = qs.has('past_days') ? Number(qs.get('past_days')) : qs.has('past_hours') ? Math.ceil(Number(qs.get('past_hours')) / 24) : 0;
      const fdB = !Number.isFinite(fdReq) ? null : fdReq <= 8 ? 8 : fdReq <= 16 ? 16 : null, pdB = !Number.isFinite(pdReq) ? null : Math.max(3, pdReq);
      const mq0 = new URLSearchParams(); mq0.set('hourly', 'temperature_2m'); mq0.set('models', 'icon_seamless,gfs_seamless,meteofrance_seamless');
      for (const k of ['timezone', 'cell_selection']) if (qs.has(k)) mq0.set(k, qs.get(k));
      const _rkN = runKeyNow(mq0);   /* v91.17.283 · WS1 · PATCH3 · kept while the members have no newer run, as well as 60 min */
      const fresh = (h) => h && (Date.now() - h.at < 60 * 60e3 || (h.run && _rkN && h.run === _rkN));
      if (dated || fdB == null || pdB == null || LA.length !== nLoc || LO.length !== nLoc || (qs.has('elevation') && EL.length !== nLoc && EL.length !== 1)) {
        const mq = new URLSearchParams(mq0);
        for (const k of ['latitude', 'longitude', 'elevation', 'forecast_days', 'past_days', 'start_date', 'end_date', 'past_hours', 'forecast_hours', 'start_hour', 'end_hour']) if (qs.has(k)) mq.set(k, qs.get(k));
        const mk = host + '|' + mq.toString(); const hit = PX_NATMEM.get(mk);
        if (fresh(hit)) natMem = hit.v;
        else if (CB() && !CB().allow(CB().current(), nLoc)) natMem = null;   /* v91.17.283 · WS1 · over this class's budget: no members (the variant without them) */
        else { const rows = await natFetch(host, mq, nLoc); if (rows) { natMem = rows; PX_NATMEM.set(mk, { at: Date.now(), v: natMem, run: _rkN }); if (PX_NATMEM.size > 2000) PX_NATMEM.delete(PX_NATMEM.keys().next().value); } }
      } else {
        const elOf = (i) => (qs.has('elevation') ? String(EL.length === 1 ? EL[0] : EL[i]) : '');
        const pk = (i) => 'nat1|' + host + '|' + LA[i] + '|' + LO[i] + '|' + elOf(i) + '|' + mq0.get('timezone') + '|' + (mq0.get('cell_selection') || '') + '|' + pdB + '|' + fdB;
        const keys = LA.map((_, i) => pk(i)), rows = new Array(nLoc).fill(null), miss = [];
        keys.forEach((k, i) => { const h = PX_NATMEM.get(k); if (fresh(h)) rows[i] = h.v; else miss.push(i); });
        /* a point whose members are already on their way (another request of the same point) waits for them */
        const wait = miss.filter((i) => PX_NAT_INFLIGHT.has(keys[i])), need = miss.filter((i) => !PX_NAT_INFLIGHT.has(keys[i]));
        if (need.length && !(CB() && !CB().allow(CB().current(), need.length))) {
          const mq = new URLSearchParams(mq0); mq.set('latitude', need.map((i) => LA[i]).join(',')); mq.set('longitude', need.map((i) => LO[i]).join(','));
          if (qs.has('elevation')) mq.set('elevation', need.map((i) => elOf(i)).join(',')); mq.set('past_days', String(pdB)); mq.set('forecast_days', String(fdB));
          const pr = natFetch(host, mq, need.length); for (const i of need) PX_NAT_INFLIGHT.set(keys[i], pr);
          let got = null; try { got = await pr; } finally { for (const i of need) if (PX_NAT_INFLIGHT.get(keys[i]) === pr) PX_NAT_INFLIGHT.delete(keys[i]); }
          if (Array.isArray(got) && got.length === need.length) need.forEach((i, k) => { if (got[k]) { rows[i] = got[k]; PX_NATMEM.set(keys[i], { at: Date.now(), v: got[k], run: _rkN }); } });
          while (PX_NATMEM.size > 2000) PX_NATMEM.delete(PX_NATMEM.keys().next().value); }
        for (const i of wait) { try { await PX_NAT_INFLIGHT.get(keys[i]); } catch (_) {} const h = PX_NATMEM.get(keys[i]); if (fresh(h)) rows[i] = h.v; }   /* the request that fetched them stored them first */
        if (rows.some(Boolean)) natMem = rows;
      }
    }
  } catch { natMem = null; }
  /* v91.17.108 · ONE TEMPERATURE CHAIN FOR EVERY PRODUCT (audit v107 F3). The station calibration and the AI terrain residual in
     mountains and hills are fitted on the zone basis (the 3-model mean), and the national blend was evaluated on top of that chain.
     A plain best_match request (the map sweep, the unit card, a point) used to skip both there, so the blend sat on the raw series:
     held-out mountain MAE 2.77 / bias -1.85 C on the map against 1.79 / +0.03 C as evaluated (station-lake/audit108/t3_blend_basis.py).
     For the mountain and hills locations of such a request the zone members are fetched (only those locations, only the variables
     the zone merge and the AI residual read), and correctResponse merges them exactly as for a zone request. Plains are unchanged.
     NIGRAAN_ZONE_ALL=0 turns it off. */
  let zoneMem = null;
  try {
    const mdl = String(qs.get('models') || 'best_match'); const MOS = backend.app.mos;
    const corr = !wantRaw && path === '/v1/forecast' && host === 'api.open-meteo.com';
    const req = MOS && MOS.requestModels ? MOS.requestModels() : null;
    if (corr && req && mdl === 'best_match' && process.env.NIGRAAN_ZONE_ALL !== '0') {
      const las = String(qs.get('latitude') || '').split(',').map(Number), los = String(qs.get('longitude') || '').split(',').map(Number);
      const els = String(qs.get('elevation') || '').split(',').map(x => (x === '' || x === 'nan') ? null : Number(x));
      const members = req.split(',').map(x => x.trim()).filter(m => m && m !== 'best_match');
      const idx = []; for (let i = 0; i < las.length; i++) { if (!Number.isFinite(las[i]) || !Number.isFinite(los[i])) continue;
        /* the height the zone rule reads: the caller's, else the terrain grid's (the provider's own DEM height is only known after the
           answer; a location the two heights place in different zones keeps the old path, it is never merged on a wrong zone) */
        let el = Number.isFinite(els[i]) ? els[i] : null; if (el == null) { try { const fg = backend.app.featGrid; const v = fg ? fg.value('t_elev', las[i], los[i]) : null; if (Number.isFinite(v)) el = v; } catch (_) {} }
        let z = null; try { z = MOS.zoneOfPoint(las[i], los[i], el); } catch (_) {}
        const zm = z ? MOS.zoneModel(z) : null; if (zm && Array.isArray(zm.members) && zm.members.length && !zm.members.includes('best_match')) idx.push(i); }
      const fam = (MOS.temperatureFamily && MOS.temperatureFamily()) || { hourly: ['temperature_2m', 'apparent_temperature', 'dew_point_2m', 'relative_humidity_2m'], daily: ['temperature_2m_max', 'temperature_2m_min', 'temperature_2m_mean'] };
      const want = new Set([...(fam.hourly || []), 'cloud_cover', 'wind_speed_10m', 'precipitation']);
      const hv = String(qs.get('hourly') || '').split(',').filter(v => want.has(v)); const dv = String(qs.get('daily') || '').split(',').filter(v => (fam.daily || []).includes(v));
      if (idx.length && hv.includes('temperature_2m')) {
        const mq = new URLSearchParams(); const pick = (k) => { if (!qs.has(k)) return; const a = String(qs.get(k)).split(','); mq.set(k, a.length === las.length ? idx.map(i => a[i]).join(',') : qs.get(k)); };
        for (const k of ['latitude', 'longitude', 'elevation']) pick(k);
        for (const k of ['forecast_days', 'past_days', 'start_date', 'end_date', 'timezone', 'past_hours', 'forecast_hours', 'start_hour', 'end_hour', 'cell_selection', 'wind_speed_unit', 'temperature_unit']) if (qs.has(k)) mq.set(k, qs.get(k));
        mq.set('hourly', hv.join(',')); if (dv.length) mq.set('daily', dv.join(',')); mq.set('models', members.join(','));
        const mk = 'zone|' + host + '|' + new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10) + '|' + mq.toString(); const hit = PX_NATMEM.get(mk);   /* v91.17.149 · audit D6: keyed on the PKT day, so the members and the sweep body never straddle midnight */
        let rows = null; const _rkZ = runKeyNow(mq);   /* v91.17.283 · WS1 · PATCH3 · as above */
        if (hit && (Date.now() - hit.at < 60 * 60e3 || (hit.run && _rkZ && hit.run === _rkZ))) rows = hit.v;
        /* v91.17.173 · the same member request is already on its way: wait for it (a failed one gives no members, as before) */
        else if (PX_ZONE_INFLIGHT.has(mk)) rows = await PX_ZONE_INFLIGHT.get(mk);
        else if (CB() && !CB().allow(CB().current(), idx.length * Math.max(1, Math.ceil((hv.length + dv.length) * members.length / 10)))) rows = null;   /* v91.17.283 · WS1 · over budget: the old path */
        else { const _zp = (async () => { let rows = null;
          /* v91.17.283.22 · ONCE PER MODEL RUN: when the held members are of an older run, only the members whose own model has a newer
             run are fetched again (api/modelruns.mjs changedModels, the rule of the sweep's changed-member refresh) and merged into the
             held rows; the others are the same run's numbers. Measured (data/quota-callers, 25 Oct): the zone members were fetched again in
             full at every change of any one of their models' runs (51,347 weighted calls that day). A held answer of another UTC day, or
             a run change the model metadata cannot place, is fetched in full as before. */
          let only = null; try { const MR = backend.app.modelRuns; if (hit && hit.run && _rkZ && hit.run !== _rkZ && MR && MR.changedModels && new Date(hit.at).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10) && Array.isArray(hit.v) && hit.v.length === idx.length) {
              const ch = MR.changedModels('forecast', (k) => mq.get(k), hit.run, _rkZ); if (Array.isArray(ch) && ch.length && ch.length < members.length) only = ch; } } catch (_) { only = null; }
          const zget = async (ms) => { const q2 = new URLSearchParams(mq); if (ms) q2.set('models', ms.join(',')); q2.set('apikey', KEY);
            const wZ = idx.length * Math.max(1, Math.ceil((hv.length + dv.length) * (ms ? ms.length : members.length) / 10));
            const r = await pfetch(`https://${OM_HOST[host]}/v1/forecast?${q2.toString()}`, { headers: { 'user-agent': 'AI-GEO-NIGRAAN-local/91.17' }, signal: AbortSignal.timeout(45000) });
            try { backend.app.provider.noteProxyCall(wZ, r.ok); } catch {}
            qbrAdd(ms ? 'zone members (changed members)' : 'zone members', host, '/v1/forecast', wZ, idx.length, r.ok);   /* v91.17.283.10 · accounting only */
            if (!r.ok) return null; const j = await r.json(); return Array.isArray(j) ? j : [j]; };
          /* the held rows with the changed members' series replaced (null when the answer does not line up with them: then a full fetch) */
          const merge = (got) => { if (!got || got.length !== hit.v.length) return null; const sfx = (k) => only.some((m) => k.endsWith('_' + m));
            const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a[0] === b[0] && a[a.length - 1] === b[a.length - 1];
            const out = hit.v.map((old, i) => { const nw = got[i]; if (!old || !nw) return null; const o = { ...old };
              for (const blk of ['hourly', 'daily']) { if (!old[blk] && !nw[blk]) continue; if (!old[blk] || !nw[blk] || !same(old[blk].time, nw[blk].time)) return null;
                o[blk] = { ...old[blk] };
                for (const [k, v] of Object.entries(nw[blk])) { if (k === 'time') continue;   /* one model: the provider names the series without the model suffix */
                  const kk = only.length === 1 ? (sfx(k) ? k : k + '_' + only[0]) : k; if (!(only.length === 1 || sfx(k))) continue; if (!(kk in old[blk])) return null; o[blk][kk] = v; } }
              return o; });
            return out.every(Boolean) ? out : null; };
          if (only) rows = merge(await zget(only));
          if (!rows) rows = await zget(null);
          if (rows) { PX_NATMEM.set(mk, { at: Date.now(), v: rows, run: _rkZ }); if (PX_NATMEM.size > 2000) PX_NATMEM.delete(PX_NATMEM.keys().next().value); }
          return rows; })();
          PX_ZONE_INFLIGHT.set(mk, _zp); try { rows = await _zp; } finally { PX_ZONE_INFLIGHT.delete(mk); }
        }
        if (rows && rows.length === idx.length) { zoneMem = new Array(las.length).fill(null); idx.forEach((i, k) => { zoneMem[i] = { models: req, row: rows[k] }; }); }
      }
    }
  } catch (_) { zoneMem = null; }
  /* ══ v91.17.267 · THE PLAINS START FROM THE MULTI-MODEL MIX (blend.mjs, data/blend-gate.json) ═══════════════════════════════════════
     For the locations of a corrected forecast request whose zone the gate allows (decided as for the zone members above: the caller's
     height, else the terrain grid's; the answer's own height decides again before it is applied), ONE extra call asks the nine global
     models for temperature and dew point only (the same place and height, 8 days ahead, at least 3 past days, GMT): 2 variables x 9
     models = 1.8 weighted calls per location. Rows are cached per place for 90 min (blend.mjs), so the page, the sweeps, the national run
     and the fleet share them. A failed call, the provider's daily budget or the blend's own daily budget (25 % of it) leave the places on
     best_match. NIGRAAN_BLEND=0, __noblend=1, __raw=1 or a dated window (start_date / start_hour): no call, the v266 chain. */
  let blendMem = null;
  try {
    const BL = backend.app.blend, MOS = backend.app.mos; const mdl = String(qs.get('models') || 'best_match'); const zreq = MOS && MOS.requestModels ? MOS.requestModels() : null;
    const corr = !wantRaw && !noBlend && path === '/v1/forecast' && host === 'api.open-meteo.com';
    if (corr && BL && BL.on() && MOS && (mdl === 'best_match' || (zreq && mdl === zreq)) && !qs.has('start_date') && !qs.has('end_date') && !qs.has('start_hour') && !qs.has('end_hour')
        && String(qs.get('hourly') || '').split(',').includes('temperature_2m')) {
      const las = String(qs.get('latitude') || '').split(',').map(Number), los = String(qs.get('longitude') || '').split(',').map(Number);
      const els = String(qs.get('elevation') || '').split(',').map(x => (x === '' || x === 'nan') ? null : Number(x));
      const idx = BL.plan(las, los, els, (a, b, e) => MOS.zoneOfPoint(a, b, e), (a, b) => { const fg = backend.app.featGrid; return fg ? fg.value('t_elev', a, b) : null; });
      if (idx.length) {
        const pd = qs.has('past_days') ? Number(qs.get('past_days')) : (qs.has('past_hours') ? Math.ceil(Number(qs.get('past_hours')) / 24) : 0);
        const places = idx.map(i => ({ lat: las[i], lon: los[i], elev: Number.isFinite(els[i]) ? els[i] : null }));   /* the height the main request carries (none: the provider's DEM for both) */
        const rows = await BL.rowsFor(places, { pastDays: pd }, async (q) => {
          const mq = new URLSearchParams(q); const w = weightOf((k) => q[k]); mq.set('apikey', KEY);
          let r; try { r = await pfetch(`https://${OM_HOST[host]}/v1/forecast?${mq.toString()}`, { headers: { 'user-agent': 'AI-GEO-NIGRAAN-local/91.17' }, signal: AbortSignal.timeout(45000) }); }
          catch (e) { try { CB_ALS.run({ cls: 'background', tag: 'blend members' }, () => backend.app.provider.noteProxyCall(w, false)); } catch {} throw e; }
          try { CB_ALS.run({ cls: 'background', tag: 'blend members' }, () => backend.app.provider.noteProxyCall(w, r.ok)); } catch {}   /* v91.17.283 · WS1 · blend members are budgeted as background (blend.mjs canSpend) */
          try { const day = new Date().toISOString().slice(0, 10); qbrRoll(day); const e = QBR.by['blend members · forecast /v1/forecast'] || (QBR.by['blend members · forecast /v1/forecast'] = { calls: 0, weighted: 0, locations: 0, failed: 0 }); e.calls++; e.weighted += w; e.locations += places.length; if (!r.ok) e.failed++; } catch (_) {}
          if (!r.ok) throw new Error('blend members ' + r.status);
          return r.json(); });
        if (rows.some(Boolean)) { blendMem = new Array(las.length).fill(null); idx.forEach((i, k) => { blendMem[i] = rows[k]; }); }
      }
    }
  } catch (_) { blendMem = null; }
  /* v91.17.283.42 · C11 · the members of the multi-model blend for the passed cells (server/api/mmblend42.mjs); same gate as the corrected forecast */
  let mm42Prep = null;
  try {
    if (MM42 && MM42.on() && !wantRaw && !noBlend && path === '/v1/forecast' && host === 'api.open-meteo.com' && !qs.has('start_date') && !qs.has('end_date') && !qs.has('start_hour') && !qs.has('end_hour')) {
      const las = String(qs.get('latitude') || '').split(',').map(Number), los = String(qs.get('longitude') || '').split(',').map(Number);
      const els = String(qs.get('elevation') || '').split(',').map(x => (x === '' || x === 'nan') ? null : Number(x));
      const _mmTag = String(req.headers['x-agn-internal'] || ''), _mmInt = !!(process.env.NIGRAAN_INTERNAL_TOKEN && req.headers['x-agn-internal-token'] === process.env.NIGRAAN_INTERNAL_TOKEN);   /* r42: sweep pools */
      mm42Prep = await MM42.prepare(las, los, els, async (q) => {
        const mq = new URLSearchParams(q); mq.set('apikey', KEY);
        const r = await pfetch(`https://${OM_HOST[host]}/v1/forecast?${mq.toString()}`, { headers: { 'user-agent': 'AI-GEO-NIGRAAN-local/91.17' }, signal: AbortSignal.timeout(45000) });
        if (!r.ok) throw new Error('mmblend42 members ' + r.status); return r.json(); }, Date.now(), { tag: _mmTag, internal: _mmInt });
    }
  } catch (_) { mm42Prep = null; }
  /* v91.17.283.2 - ECMWF 0.1 deg as the main-forecast source, per variable, only with NIGRAAN_ECMWF010_SERVE=1 and only for variables whose
     switch rule passed at the MACH stations (ecmwf010.mjs substitute; off by default: the answer is unchanged) */
  const _e010 = (b) => { try { const E = backend.app.ecmwf010; return (E && E.serveOn() && host === 'api.open-meteo.com') ? E.substitute(b, qs) : b; } catch (_) { return b; } };
  const _mm42post = mm42Prep && MM42 ? MM42.post(mm42Prep) : null;   /* v91.17.283.42 · applied after the whole chain, only in the passed cells */
  const correctIfForecast = (buf) => { const _r = (!wantRaw && path === '/v1/forecast' && (host === 'api.open-meteo.com' || (wantMos && host === 'historical-forecast-api.open-meteo.com'))) ? (backend.app.verification.correctResponseAsync || backend.app.verification.correctResponse)(_e010(buf), qs, natAdded, natMem, natPast, noNat, zoneMem, noLive, noWx, blendMem, { bg: !!((CB_ALS.getStore() || {}).low) }) : { buf, n: 0 }; return _mm42post ? Promise.resolve(_r).then(_mm42post) : _r; };
  /* v91.17.267 · the blend state a corrected copy is made with (the sweep's per-slot copies are keyed on it) */
  const _bt = (() => { try { return (backend.app.blend ? backend.app.blend.tag() + (noBlend ? ':nb' : '') + (blendMem ? ':m' : '') : '') + (mm42Prep ? ':mm42' : ''); } catch (_) { return ''; } })();   /* v91.17.132 · yields to other requests between places */
  /* Browser traffic is paid traffic. Until now only backend jobs were counted, so the
     daily limit could not see the larger half of the spend. The weight follows the
     provider's own rule: more than 10 variables or more than two weeks per location
     counts as more than one call, and every location counts. */
  const weighOf = () => weightOf((k) => qs.get(k), null, { ensemble: path === '/v1/ensemble' });   /* v91.17.228 · audit S-36 · one weight for proxy and backend (provider.mjs), models counted; v91.17.261 · ensemble members counted */
  /* cache: a closed historical archive window never changes (disk, permanent);
     recent-rain requests (past_days) are reused for 3 h (memory). */
  const endDate = qs.get('end_date');
  /* v91.17.147 · budget: climate projections (CMIP6 runs, fixed) and historical-forecast windows that closed over a week ago never
     change: kept on disk like the archive. Measured: one climate request weighs ~430 calls and the pages asked it on every site visit. */
  const closedWindow = endDate && (Date.now() - Date.parse(endDate)) > 7 * 864e5;
  const immutable = (path === '/v1/archive' && closedWindow) || (path === '/v1/climate' && !!endDate) || (host === 'historical-forecast-api.open-meteo.com' && closedWindow && !wantMos);
  /* v91.17.260 · the pages asked the river forecast (daily GloFAS) and air quality again on every view: 13 Oct to 14:35 PKT, 140 page
     flood calls (992 weighted) and 102 air-quality calls (333). The same request is now answered from memory: river flow for 3 h
     (the provider issues it once a day), air quality for 1 h (hourly model). Counted calls fall; the values are the provider's own. */
  const pageTtlMs = (!immutable && path === '/v1/flood' && host === 'flood-api.open-meteo.com') ? 3 * 3600e3
    : (!immutable && path === '/v1/air-quality' && host === 'air-quality-api.open-meteo.com') ? 3600e3 : 0;
  const shortTtl = !immutable && ((qs.has('past_days') && Number(qs.get('past_days')) >= 30) || pageTtlMs > 0);
  let cacheKey = null, cacheFile = null;
  if (immutable || shortTtl) {
    const norm = [...qs.entries()].filter(([k]) => k !== 'apikey').sort(([a], [b]) => a.localeCompare(b));
    cacheKey = createHash('sha256').update(host + path + JSON.stringify(norm)).digest('hex');
    if (immutable) {
      cacheFile = join(PX_CACHE_DIR, cacheKey.slice(0, 2), cacheKey + '.json');
      if (existsSync(cacheFile)) { const b = readFileSync(cacheFile); res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': b.length, 'x-agn-provider': 'MACH forecast', 'x-agn-cache': 'disk' }); return res.end(b); }
    } else {
      const hit = PX_MEM.get(cacheKey);
      if (hit && Date.now() - hit.at < (pageTtlMs || 3 * 3600e3)) { const cb = await correctIfForecast(hit.body); res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': cb.buf.length, 'x-agn-provider': 'MACH forecast', 'x-agn-cache': 'memory', 'x-agn-bias-corrected': String(cb.n) }); return res.end(cb.buf); }
    }
  }
  /* v91.17.82 · THE NATIONAL SWEEP IS SERVED FROM A 10-MINUTE CACHE (CEO: "green colour loading is too slow").
     Measured on the operator's laptop: the map's national sweep is 5 multi-location forecast requests (96-120 tehsils each);
     each took 6-12 s from the provider, so the last 120 tehsils were painted only at ~36 s. The request strings are identical
     on every page load (no clock in them), so one answer can serve every load for a while:
       - under 10 min old: served from cache (x-agn-cache: sweep-fresh);
       - 10-60 min old: served at once (x-agn-cache: sweep-stale) and refreshed in the background, so the next load is fresh;
       - older than 60 min, or none: fetched as before.
     Only multi-location (20+) /v1/forecast requests to the forecast host are cached; single points are never cached here.
     The cache is kept on disk too (data/cache/provider/sweep), so a restart does not bring the 36 s back.
     NIGRAAN_SWEEP_CACHE=0 turns it off. Every background refresh is counted against the daily budget like any other call. */
  let sweepSettle = () => {};
  let _runLabel = null;   /* v91.17.283 · WS1 · PATCH3 · the run key of the answer this request gets from upstream or the run memo */
  /* v91.17.212 · audit S-17 · when the provider fails, a sweep body from earlier the same Pakistan day (over 60 min old) is served instead
     of a bare 502, marked x-agn-cache: sweep-last-good with its age; the page's live badge then says "last good forecast, as of HH:MM" */
  let sweepLastGood = null;
  const serveLastGood = async (why) => { if (!sweepLastGood || res.headersSent) return false;
    /* the corrected copy already made of this very body is reused (a fresh correction of a 120-tehsil body takes tens of seconds) */
    const pv = PX_CORR_PREV.get(sweepLastGood.sk); const cb = (pv && pv.at === sweepLastGood.at && pv.tag === _bt && pv.cb) ? pv.cb : await correctIfForecast(sweepLastGood.body);   /* v91.17.267 · same blend state */
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': cb.buf.length, 'x-agn-provider': 'MACH forecast', 'x-agn-cache': 'sweep-last-good',
      'x-agn-cache-age-s': String(Math.round((Date.now() - sweepLastGood.at) / 1000)), 'x-agn-upstream': String(why).replace(/[^\w .:-]/g, '').slice(0, 80), 'x-agn-bias-corrected': String(cb.n) });
    res.end(cb.buf); return true; };   /* v91.17.173 · releases the requests waiting on this one (set when this request is a sweep) */
  const _locsN = String(qs.get('latitude') || '').split(',').filter(Boolean).length;
  /* v91.17.283.24 · P3 · a sweep by its route (SWEEP_CALLERS: the page, the engine; the replay only for a key remembered from them) */
  const _swCaller = String(req.headers['x-agn-internal'] || '');
  const _swKey = (() => { const norm = [...qs.entries()].filter(([k]) => k !== 'apikey').sort(([a], [b]) => a.localeCompare(b)); return createHash('sha256').update('sweep|' + host + path + JSON.stringify(norm)).digest('hex'); })();
  const sweepable = process.env.NIGRAAN_SWEEP_CACHE !== '0' && ((path === '/v1/forecast' && host === 'api.open-meteo.com') || (path === '/v1/air-quality' && host === 'air-quality-api.open-meteo.com'))   /* v91.17.147 · the national air-quality sweep too */
    && !immutable && !shortTtl && _locsN >= 20 && !qs.has('start_date') && (SWEEP_CALLERS.has(_swCaller) || _swCaller === 'sweep-warm');
  if (sweepable) {
    const sk = _swKey;
    const sf = join(PX_CACHE_DIR, 'sweep', sk + '.json');
    /* v91.17.179 · remember the page's own sweep requests (exact URL) so the keep-warm task below can replay them */
    if (_swCaller !== 'sweep-warm') { PX_SWEEP_SEEN.set(sk, { url: url.pathname + url.search, at: Date.now(), route: 'sweep' }); sweepBound(); sweepSeenSave(); }
    let hit = PX_SWEEP.get(sk);
    if (!hit) { try { if (existsSync(sf)) { const st = statSync(sf); let run = null; try { run = readFileSync(sf + '.run', 'utf8').trim() || null; } catch (_) {} hit = { at: st.mtimeMs, body: readFileSync(sf), run }; PX_SWEEP.set(sk, hit); } } catch {} }
    /* v91.17.283 · WS1 · FETCH AGAIN ONLY FOR A NEWER MODEL RUN (api/modelruns.mjs, data/provider-models.json). Each body remembers the run key
       of the provider domains it was made from (the provider's own model metadata). While the key is the same the body is served whatever
       its age (same PKT day; the `current` block is re-read from the hourly curve as before) and never fetched again; when a domain has a
       newer run the body is fetched again in the background and the next request gets it. A body whose models are not in the file keeps
       the time rule (served up to 60 min, refreshed from 10 min). Measured before: 73 % of the provider spend (BUDGET_REPORT.md). */
    const MR = backend && backend.app && backend.app.modelRuns;
    const runSpec = MR ? MR.specFor(host === 'air-quality-api.open-meteo.com' ? 'airQuality' : 'forecast', (k) => qs.get(k)) : null;
    let runNow = runSpec ? MR.key(runSpec) : null;
    /* v91.17.283.3 · budget cut 2 · a held body with a run key, asked before this server has read the model metadata (the first minutes after
       a restart): read it now (metadata only), so an unchanged run serves the held body instead of fetching it again (15-29 k a cold start) */
    if (runSpec && !runNow && hit && hit.run) { try { runNow = await MR.poll(runSpec); } catch (_) { runNow = null; } }
    const runSame = !!(hit && hit.run && runNow && hit.run === runNow);
    /* v91.17.283.3 · budget cut 1 · THE KEEP-WARM REPLAY ANSWERS FROM THE CACHE ONLY. A replayed body older than 60 min whose run key had
       changed (or was not known) fell through to the cold path below and was fetched again synchronously under the 'sweep-warm' tag: every
       run change of a 9-model set refetched all nine models (756 per 120 places) instead of splicing the changed member, and a body of
       unknown run went back to the hourly time rule (live: 3-4.7 k weighted an hour). The replay now gets the held body of the same PKT day
       whatever its age or run; a known run change is handed to the run-keyed refresh below (splice or one background fetch, as for any
       reader); no body held: nothing is fetched (204). NIGRAAN_WARM_CACHE_ONLY=0 restores the old replay. */
    const warmReq = String(req.headers['x-agn-internal'] || '') === 'sweep-warm' && process.env.NIGRAAN_WARM_CACHE_ONLY !== '0';
    const pkDay = (ms) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 10);
    const age = hit && pkDay(hit.at) === pkDay(Date.now()) ? Date.now() - hit.at : Infinity;   /* v91.17.149 · audit D6/D7: a body fetched before PKT midnight is not served after it (same file, overwritten) */
    if (hit && Number.isFinite(age)) sweepLastGood = { at: hit.at, body: hit.body, sk };
    const store = (body, run = null, at = Date.now()) => { PX_SWEEP.set(sk, { at, body, run }); if (PX_SWEEP.size > SWEEP_KEYS_MAX) PX_SWEEP.delete(PX_SWEEP.keys().next().value);   /* v91.17.283.2 · D2 · at: when the provider made the answer (a body cut from the superset carries the superset's time) */
      try { mkdirSync(join(sf, '..'), { recursive: true }); writeFileSync(sf + '.tmp', body); renameSync(sf + '.tmp', sf); if (at !== undefined) utimesSync(sf, at / 1000, at / 1000); if (run) writeFileSync(sf + '.run', run); else rmSync(sf + '.run', { force: true }); } catch {} };
    /* v91.17.283.2 · D2 · a best_match sweep body that is exactly a part of the tehsil superset (api/bmrows.mjs) is cut from it instead of fetched */
    const bmKeys = () => [...qs.keys()].filter((k) => k !== 'apikey');   /* the request's own parameters (the key is added by this proxy) */
    const bmOk = !!(BM && host === 'api.open-meteo.com' && path === '/v1/forecast' && BM.parse((k) => qs.get(k), false, bmKeys()));
    if (hit && (age < 60 * 60e3 || (Number.isFinite(age) && (runSame || warmReq)))) {
      /* v91.17.147 · audit data F5 · a cached sweep body is up to 60 min old; its 'current' block was the hour it was fetched, served
         as "now". From 5 min of age the current values are re-read from the body's own hourly curve at the present time (linear
         between the two hours); a current variable with no hourly twin keeps its cached value and is listed as stale. */
      let body0 = hit.body;
      const _cm = PX_CURMEMO.get(sk), _slot = Math.floor(Date.now() / 900e3);
      if (qs.has('current') && age >= 5 * 60e3 && _cm && _cm.slot === _slot && _cm.at === hit.at) body0 = _cm.body;   /* one rebuild per 15-min slot, not per request */
      else if (qs.has('current') && age >= 5 * 60e3) { try { const jj = JSON.parse(body0.toString('utf8')); const now = Date.now();
        for (const L of (Array.isArray(jj) ? jj : [jj])) { const C = L && L.current, H = L && L.hourly; if (!C || !H || !Array.isArray(H.time)) continue;
          const off = (L.utc_offset_seconds || 0) * 1000, ts = H.time.map((t) => Date.parse(t + 'Z') - off); let k = -1; for (let i = 0; i < ts.length - 1; i++) if (ts[i] <= now && ts[i + 1] > now) { k = i; break; }
          if (k < 0) continue; const w = (now - ts[k]) / (ts[k + 1] - ts[k]); const stale = [];
          for (const v of Object.keys(C)) { if (v === 'time' || v === 'interval') continue; const A = H[v];
            if (Array.isArray(A) && A[k] != null && A[k + 1] != null) C[v] = /precipitation|rain|showers|snowfall/.test(v) ? Math.round(A[k + 1] / 4 * 100) / 100 : /direction|weather_code|is_day/.test(v) ? (w < 0.5 ? A[k] : A[k + 1]) : Math.round((A[k] + w * (A[k + 1] - A[k])) * 10) / 10; else stale.push(v); }
          C.time = new Date(Math.floor((now + off) / 900e3) * 900e3).toISOString().slice(0, 16); L.agn_current_from_hourly = { bodyAgeMin: Math.round(age / 60e3), staleVars: stale };   /* review F7: a current variable with no hourly twin keeps the cached value, named here as stale */ }
        body0 = Buffer.from(JSON.stringify(jj)); PX_CURMEMO.set(sk, { slot: _slot, at: hit.at, body: body0 }); if (PX_CURMEMO.size > 64) PX_CURMEMO.delete(PX_CURMEMO.keys().next().value); } catch (_) {} }
      /* v91.17.179 · the CORRECTED body is kept per 15-minute slot too. Measured on the laptop: cached sweep bodies still took 33-39 s each,
         because the corrections (national model, station calibration, humidity, rain) ran again for 120 tehsils on every page load. */
      const _ck = sk + '|' + hit.at + '|' + Math.floor(Date.now() / 900e3) + '|' + _bt;   /* v91.17.267 · + the blend state */
      /* v91.17.182 · measured on the laptop 6 Oct: the first page load in each new 15-minute slot still waited ~60 s (four 120-tehsil
         corrections at once, and the keep-warm replay computing the same ones beside them). Now one correction per key is ever in
         progress (the others wait for it), and while the new slot's copy is being made the page gets the previous slot's corrected copy
         of the same body (at most one slot, 15-30 min, old; marked x-agn-corrected-slot: previous) instead of waiting (also when the raw body was just refreshed: the copy made from the body before it). */
      let cb = PX_CORRMEMO.get(_ck);
      const _mk = () => { let pr = PX_CORR_INFLIGHT.get(_ck); if (!pr) { pr = Promise.resolve(correctIfForecast(body0)).then((c) => {   /* v91.17.185 · correctIfForecast returns a value for non-forecast bodies (air quality): v182 called .then on it and every air-quality sweep failed */ PX_CORRMEMO.set(_ck, c); if (PX_CORRMEMO.size > 32) PX_CORRMEMO.delete(PX_CORRMEMO.keys().next().value); PX_CORR_PREV.set(sk, { at: hit.at, slot: Math.floor(Date.now() / 900e3), cb: c, tag: _bt }); while (PX_CORR_PREV.size > SWEEP_KEYS_MAX) PX_CORR_PREV.delete(PX_CORR_PREV.keys().next().value); corrPrevSave(sk); return c; }).finally(() => PX_CORR_INFLIGHT.delete(_ck)); PX_CORR_INFLIGHT.set(_ck, pr); } return pr; };
      let _prevServed = false;
      if (!cb) { const pv = PX_CORR_PREV.get(sk); const internal = String(req.headers['x-agn-internal'] || '') === 'sweep-warm';
        if (!internal && pv && pv.tag === _bt && Math.floor(Date.now() / 900e3) - pv.slot <= 1 && process.env.NIGRAAN_CORR_PREV !== '0') {   /* v91.17.267 · only a copy made with the same blend state */ cb = pv.cb; _prevServed = true; _mk().catch(() => {}); }
        else cb = await _mk(); }
      /* v91.17.283 · WS1 · PATCH3 · the body's own model run (UTC); a body kept under main-runs-only says so beside it */
      const _runH = hit.run && MR ? MR.headerOf(hit.run) : null; if (String(req.headers['x-agn-internal'] || '') === 'engine') engineRead('sweep:' + sk, hit.run);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': cb.buf.length, 'x-agn-provider': 'MACH forecast',
        'x-agn-cache': age < 10 * 60e3 ? 'sweep-fresh' : 'sweep-stale', 'x-agn-cache-age-s': String(Math.round(age / 1000)), 'x-agn-bias-corrected': String(cb.n), 'x-agn-corrected-slot': _prevServed ? 'previous' : 'current',
        ...(_runH ? { 'x-agn-model-run': _runH } : { 'x-agn-model-run': 'unknown (models not in data/provider-models.json, or metadata not read yet)' }),
        ...(runNow && hit.run && runNow !== hit.run ? { 'x-agn-model-run-latest': MR.headerOf(runNow) } : {}) });   /* the provider already has a newer run: this body is from x-agn-model-run */
      res.end(cb.buf);
      /* v91.17.283 · WS1 · a multi-model body (the 9-model blend set) where only some members have a newer run: only those members' columns
         are fetched and put in place of their old columns (the provider answers each model of a multi-model request independently: the
         same series as a full fetch). Any mismatch (time axis, locations, a missing column) falls back to the full fetch. */
      /* v91.17.283 · WS1 · PATCH3 · this body's tier (callbudget.mjs tierRules: a 9-model set is P4, a best_match or air-quality body P1) */
      const _tierInfo = { tag: 'sweep refresh', kind: runSpec ? runSpec.kind : null, models: qs.get('models') || null };
      const _tierId = (() => { try { const t = CB() && CB().tierOf(_tierInfo); return t ? t.id : null; } catch (_) { return null; } })();
      const spliceRefresh = (run, models, cur) => {
        const q2 = new URLSearchParams(qs); q2.set('models', models.join(','));
        const w2 = weightOf((k) => q2.get(k), null, { ensemble: path === '/v1/ensemble' });
        let over = false; try { over = !!(backend.app.provider.overBudget && backend.app.provider.overBudget()); } catch {}
        try { if (!over && CB() && !CB().allow('background', w2, { ..._tierInfo, tier: _tierId })) over = true; } catch {}
        if (over) return;
        CB_ALS.run({ cls: 'background', tag: 'sweep refresh (changed members)', tier: _tierId }, () => {
          PX_SWEEP_BUSY.add(sk);
          pfetch(`https://${target}${path}?${q2.toString()}`, { headers: { 'user-agent': 'AI-GEO-NIGRAAN-local/91.17' }, signal: AbortSignal.timeout(45000) })
            .then(async (r) => { try { backend.app.provider.noteProxyCall(w2, r.ok); } catch {} qbrAdd('sweep refresh (changed members)', host, path, w2, _locsN, r.ok); if (!r.ok) throw new Error('upstream ' + r.status);
              const part = await r.json(), whole = JSON.parse(cur.body.toString('utf8'));
              const P = Array.isArray(part) ? part : [part], Wh = Array.isArray(whole) ? whole : [whole];
              if (P.length !== Wh.length) throw new Error('locations differ');
              const single = models.length === 1;
              for (let i = 0; i < Wh.length; i++) { const a = P[i], b = Wh[i];
                for (const blk of ['hourly', 'daily', 'current', 'minutely_15']) { if (!a[blk]) continue; const B = b[blk], U = b[blk + '_units'] || {}, AU = a[blk + '_units'] || {};
                  if (!B || (Array.isArray(a[blk].time) && JSON.stringify(a[blk].time) !== JSON.stringify(B.time))) throw new Error('time axis differs');
                  for (const [k, v] of Object.entries(a[blk])) { if (k === 'time' || k === 'interval') continue; const kk = single ? k + '_' + models[0] : k; if (!(kk in B)) throw new Error('no column ' + kk); B[kk] = v; if (k in AU) U[kk] = AU[k]; } } }
              store(Buffer.from(JSON.stringify(Array.isArray(whole) ? Wh : Wh[0])), run); })
            .then(() => false, () => true)
            .then((fallback) => { PX_SWEEP_BUSY.delete(sk); if (fallback) refreshNow(run); });
        });
      };
      const refreshNow = (run) => {
        let over = false; try { over = !!(backend && backend.app && backend.app.provider && backend.app.provider.overBudget && backend.app.provider.overBudget()); } catch {}
        try { if (!over && CB() && !CB().allow('background', weighOf(), { ..._tierInfo, tier: _tierId })) over = true; } catch {}   /* v91.17.283 · WS1 · a background refresh: shed first (PATCH3: by its tier) */
        if (!over) CB_ALS.run({ cls: 'background', tag: 'sweep refresh', tier: _tierId }, () => {
          PX_SWEEP_BUSY.add(sk);
          const url = `https://${target}${path}?${qs.toString()}`;
          const direct = () => pfetch(url, { headers: { 'user-agent': 'AI-GEO-NIGRAAN-local/91.17' }, signal: AbortSignal.timeout(45000) })
            .then(async (r) => { try { backend.app.provider.noteProxyCall(weighOf(), r.ok); } catch {} qbrAdd('sweep refresh', host, path, weighOf(), _locsN, r.ok); if (r.ok) store(Buffer.from(await r.arrayBuffer()), run); })
            .catch(() => { try { backend.app.provider.noteProxyCall(weighOf(), false); } catch {} qbrAdd('sweep refresh', host, path, weighOf(), _locsN, false); });
          (bmOk ? BM.compose((k) => qs.get(k), { keys: bmKeys(), want: run, cls: 'background' }).catch(() => null) : Promise.resolve(null))   /* v91.17.283.2 · D2 */
            .then((c) => { if (c) { store(c.body, run || c.run, c.at); return null; } return direct(); })
            .finally(() => PX_SWEEP_BUSY.delete(sk));
        });
      };
      /* v91.17.283 · WS1 · a known run key: fetch again only when it changed; unknown (models not in the file, metadata never read): the
         time rule, recording the key when it is known */
      if (!PX_SWEEP_BUSY.has(sk)) {
        const decide = (rk) => { if (PX_SWEEP_BUSY.has(sk)) return; const cur = PX_SWEEP.get(sk) || hit;   /* the entry now: another request may have refreshed it meanwhile */
          if (rk && cur.run) { if (rk === cur.run) return;
            /* v91.17.283 · WS1 · PATCH3 · main runs only for this tier (shed pressure or test mode): keep the body until a new 00/12 UTC run;
               then fetch only what that needs (a 9-model set: the members with a new main run, labelled with their new runs) */
            let mo = false; try { mo = !!(_tierId && CB() && CB().mainRunsOnly(_tierId)); } catch (_) {}
            if (mo) { const u = MR.mainUpdate(runSpec.kind, (k) => qs.get(k), cur.run, rk, CB().mainHours()); if (!u) return;
              if (u.models && u.models.length && !hourAxisMoved((k) => qs.get(k), cur.body)) spliceRefresh(u.key, u.models, cur); else if (u.models && u.models.length) { SPLICE_SKIP.n++; refreshNow(u.key); } else refreshNow(rk); return; }   /* v91.17.283.10 · an axis that moved: the full fetch the failed splice fell back to (same run key), without the member call */
            const ch = MR.changedModels(runSpec.kind, (k) => qs.get(k), cur.run, rk); if (ch && ch.length && !hourAxisMoved((k) => qs.get(k), cur.body)) spliceRefresh(rk, ch, cur); else { if (ch && ch.length) SPLICE_SKIP.n++; refreshNow(rk); } }   /* v91.17.283.10 · as above */
          else if (age >= 10 * 60e3 && !warmReq) refreshNow(rk || null); };   /* the replay never starts a time-rule refresh */
        if (runSpec) MR.poll(runSpec).then(decide, () => decide(null)); else decide(null);
      }
      return;
    }
    /* v91.17.173 · ONE UPSTREAM CALL PER SWEEP BODY AT A TIME. Measured on the operator's laptop (5 Oct, after the v172 restart): a cold
       120-tehsil sweep request took 37 s end to end, the page gave up at 12 s and asked again, and every repeat started a second
       upstream call and a second correction for the same body: 4 chunks x 8 tries, all aborted, so the forward days never opened.
       A request identical to one already on its way now waits for that answer; if that call fails it tries once itself. */
    if (warmReq) { res.writeHead(204, { 'x-agn-cache': 'warm-miss', 'x-agn-weighted-calls': '0' }); return res.end(); }   /* cut 1: no body held today: the replay fetches nothing */
    const _pend = PX_SWEEP_INFLIGHT.get(sk);
    if (_pend) {
      const b = await _pend;
      if (b) { const cb = await correctIfForecast(b);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': cb.buf.length, 'x-agn-provider': 'MACH forecast',
          'x-agn-cache': 'sweep-joined', 'x-agn-bias-corrected': String(cb.n) });
        return res.end(cb.buf); }
    }
    let _settle = null; const _mine = new Promise((ok) => { _settle = ok; }); PX_SWEEP_INFLIGHT.set(sk, _mine);
    sweepSettle = (b) => { if (!_settle) return; const f = _settle; _settle = null; if (PX_SWEEP_INFLIGHT.get(sk) === _mine) PX_SWEEP_INFLIGHT.delete(sk); f(b); };
    let runAtFetch = runNow; if (runSpec && !runAtFetch) { try { runAtFetch = await MR.poll(runSpec); } catch (_) { runAtFetch = null; } }   /* v91.17.283 · WS1 · the run this body is made from */
    _runLabel = runAtFetch; if (String(req.headers['x-agn-internal'] || '') === 'engine') engineRead('sweep:' + sk, runAtFetch);
    cacheKey = 'sweep:' + sk; PX_SWEEP_STORE.set(cacheKey, (body) => { store(body, runAtFetch); sweepSettle(body); });
    /* v91.17.283.2 · D2 · no body held: cut it from the superset (fetching the superset rows this run lacks) when that is exact */
    if (bmOk) { let c = null; try { c = await BM.compose((k) => qs.get(k), { keys: bmKeys(), want: runAtFetch, cls: (CB() && CB().current()) || 'user' }); } catch (_) { c = null; }
      if (c) { PX_SWEEP_STORE.delete(cacheKey); store(c.body, runAtFetch || c.run, c.at); sweepSettle(c.body);
        const cb = await correctIfForecast(c.body);
        res.writeHead(200, { 'content-type': c.ct || 'application/json; charset=utf-8', 'content-length': cb.buf.length, 'x-agn-bias-corrected': String(cb.n), 'x-agn-provider': 'MACH forecast', 'x-agn-provider-tier': 'commercial',
          'x-agn-cache': 'sweep-superset', 'x-agn-weighted-calls': '0', 'x-agn-model-run': (() => { try { return _runLabel ? backend.app.modelRuns.headerOf(_runLabel) : 'unknown'; } catch (_) { return 'unknown'; } })(),
          ...(elevBasis ? { 'x-agn-elevation-basis': elevBasis.slice(0, 160) } : {}) });
        return res.end(cb.buf); } }
  }
  const upstream = `https://${target}${path}${qs.toString() ? '?' + qs.toString() : ''}`;
  let retried = false;
  const t0 = Date.now();
  const weighted = weighOf();
  /* v91.17.283 · WS1 · PATCH3 · the call's tier (a background call): its tag, the API kind and its models */
  const _pxInfo = { tag: (CB_ALS.getStore() || {}).tag || null, kind: KIND_OF_HOST[host] || host.replace('-api.open-meteo.com', ''), models: qs.get('models') || null };
  const _pxTier = (() => { try { const c = CB(); if (!c || c.current() === 'user') return null; const t = c.tierOf(_pxInfo); return t ? t.id : null; } catch (_) { return null; } })();
  /* the run memo (see PX_RUNMEMO): not for sweep bodies, disk or short-TTL answers (cacheKey), dated windows or the raw/variant switches the
     key already carries (they are part of the upstream request) */
  let _rmKey = null, _rmBase = null, _rmRun = null, _rmHit = null, _rmWhy = null;
  try { const MR = backend.app && backend.app.modelRuns, kd = KIND_OF_HOST[host];
    if (!cacheKey && MR && kd && process.env.NIGRAAN_PX_RUNMEMO !== '0') { const spec = MR.specFor(kd, (k) => qs.get(k));
      if (spec) { _rmRun = await MR.poll(spec).catch(() => null);
        if (_rmRun) { const P = Object.fromEntries([...qs.entries()].filter(([k]) => k !== 'apikey')); _rmKey = MR.answerKey(kd, path, P, _rmRun);
          if (_rmKey) { const parts = _rmKey.split('#'); _rmBase = parts[0] + '#' + parts[2];   /* the request and its day, without the run and the slot */
            const h = PX_RUNMEMO.get(_rmKey); if (h) { _rmHit = h; _rmWhy = 'run-memo'; PX_RUNMEMO_ST.hits++; }
            else { const lk = PX_RUNLAST.get(_rmBase), l = lk ? PX_RUNMEMO.get(lk) : null; const c = CB();
              if (l && c && c.current() === 'user' && c.userCacheFirst()) { _rmHit = l; _rmWhy = 'test-cache-first'; PX_RUNMEMO_ST.testCacheFirst++; }
              else if (l && c && _pxTier && c.mainRunsOnly(_pxTier) && !MR.mainUpdate(kd, (k) => qs.get(k), l.run, _rmRun, c.mainHours())) { _rmHit = l; _rmWhy = 'kept-until-main-run'; PX_RUNMEMO_ST.keptForMainRun++; } } } } } } } catch (_) { _rmHit = null; }
  if (_rmHit) _runLabel = _rmHit.run; else if (_rmRun) _runLabel = _rmRun;
  if (String(req.headers['x-agn-internal'] || '') === 'engine' && !cacheKey) engineRead('px:' + (_rmKey || upstream), _runLabel);
  /* v91.17.283.53 · C · N1 (a) · ONE PROVIDER CALL PER REQUEST AND RUN, ALSO WHEN TWO ASK AT ONCE. The run memo answered a request only after
     the first answer of that request and run was stored, so requests arriving while it was on its way (the card, its nearby list, a report,
     the area pass asking the same point) each made their own provider call. A request whose run-memo key is already being fetched now waits
     for that answer and is served from it (x-agn-cache: run-memo-joined, no call); if that call fails it fetches itself, as before. */
  let _rmSettle = null;
  if (_rmKey && !_rmHit) { const _pj = PX_RM_INFLIGHT.get(_rmKey);
    if (_pj) { let b = null; try { b = await _pj; } catch (_) { b = null; } if (b) { _rmHit = { body: b, run: _rmRun, at: Date.now() }; _rmWhy = 'run-memo-joined'; PX_RUNMEMO_ST.joined = (PX_RUNMEMO_ST.joined || 0) + 1; } }
    if (!_rmHit) { let _s; const _pr = new Promise((ok) => { _s = ok; }); const _k = _rmKey; PX_RM_INFLIGHT.set(_k, _pr); _rmSettle = (b) => { if (!_s) return; const f = _s; _s = null; if (PX_RM_INFLIGHT.get(_k) === _pr) PX_RM_INFLIGHT.delete(_k); f(b); }; } }
  try {
    if (!_rmHit && backend && backend.app && backend.app.provider && backend.app.provider.overBudget && backend.app.provider.overBudget()) {   /* PATCH3 · a run-memo answer costs no call */
      sweepSettle(null); if (_rmSettle) _rmSettle(null);   /* v91.17.173 · waiters get no answer from a refused call */
      if (await serveLastGood('local daily budget reached')) return;
      return json(res, 429, { error: 'local_daily_budget_reached', provider: 'MACH forecast',
        why: 'The local daily provider budget (MACH_DAILY_CALL_LIMIT) is spent, counting backend and browser traffic together.' });
    }
  } catch {}
  /* v91.17.283 · WS1 · owner decision C · the daily call budget by class: a background caller is refused first (from the shed share), a
     person's request only at the cap; a refused request gets the same answers as a spent quota (last good sweep, else 429) */
  { const cb = CB(); let cls = 'user', ok = true; try { if (cb && !_rmHit) { cls = cb.current(); ok = cb.allow(cls, weighted, { ..._pxInfo, tier: _pxTier }); } } catch (_) { ok = true; }
    if (!ok) { sweepSettle(null); if (_rmSettle) _rmSettle(null); if (await serveLastGood('daily call budget (' + cls + ')')) return;
      return json(res, 429, { error: 'call_budget_reached', budgetClass: cls, provider: 'MACH forecast', why: cb.refusal(cls) }); } }
  try {
    /* v91.17.4 · ONE RETRY ON A TRANSIENT UPSTREAM FAILURE.
       Measured: the first multi-location request of a cold session returned 502
       and the identical request then succeeded five times running. A single
       network hiccup on the first paint is user-visible and is not a reason to
       tell the browser the provider is unreachable. One retry after 400 ms, and
       only on a thrown fetch or a 5xx — a 4xx is the provider answering and is
       passed straight through. The retry is declared on the response header so
       it never hides a provider that is genuinely struggling. */
    /* v91.17.16 · SEC-08 · EVERY ATTEMPT IS BILLABLE, SO EVERY ATTEMPT IS COUNTED.
       Each fetch below is a request the vendor meters. Counting once after both
       had run made two paid calls look like one, and a pair that both threw was
       never counted at all — the quota window simply lost them. _noteAttempt runs
       immediately around each fetch, including the failing ones. */
    const _noteAttempt = (ok) => { try { if (_pxTier) CB_ALS.run({ ...(CB_ALS.getStore() || {}), tier: _pxTier }, () => backend.app.provider.noteProxyCall(weighted, ok)); else backend.app.provider.noteProxyCall(weighted, ok); } catch {}
      /* v91.17.147 · who spends the provider budget: weighted calls by caller (internal job tag, or the page path), per day */
      try { const day = new Date().toISOString().slice(0, 10); qbrRoll(day);
        /* v91.17.283.26 · the pages are served with referrer-policy no-referrer, so a page's call carried no path and was booked as "page ?"
           (live 27-28 Oct: 3,446 weighted in 11 min); it is now named by what it asks: a national sweep (20+ places) or a point */
        let tag = String(req.headers['x-agn-internal'] || ''); if (!tag) { try { tag = 'page ' + new URL(String(req.headers.referer || '')).pathname; } catch (_) { tag = 'page ' + (_locsN >= 20 ? 'sweep (' + _locsN + ' places)' : _locsN > 1 ? 'places (' + _locsN + ')' : 'point'); } }
        tag += ' · ' + host.replace('-api.open-meteo.com', '').replace('api.open-meteo.com', 'forecast') + ' ' + path;
        const e = QBR.by[tag] || (QBR.by[tag] = { calls: 0, weighted: 0, locations: 0, failed: 0 });
        e.calls++; e.weighted += weighted; e.locations += String(qs.get('latitude') || '').split(',').filter(Boolean).length || 1; if (!ok) e.failed++; } catch (_) {} };
    let r;
    /* v91.17.147 · audit data F11 · a point's forecast body is kept 3 min, keyed on the exact upstream request: the point engine's
       re-reads of the same hour (without the live layer, repeat views) are then re-corrections of ONE provider run, not new billed calls */
    const _pm = (path === '/v1/forecast' && host === 'api.open-meteo.com' && !qs.has('start_date') && String(qs.get('latitude') || '').split(',').length <= 5) ? upstream : null;
    const _ph0 = _pm && !_rmKey ? POINT_MEMO.get(_pm) : null,   /* v91.17.283 · WS1 · PATCH3 · the run memo replaces the 3-min memo where the run is known */ _ph = _ph0 && Date.now() - _ph0.at < 180e3 ? _ph0 : null;
    if (_rmHit) r = new Response(_rmHit.body, { status: 200, headers: { 'content-type': 'application/json' } });   /* v91.17.283 · WS1 · PATCH3 · the run memo: no provider call */
    else if (_ph) r = new Response(_ph.body, { status: 200, headers: { 'content-type': 'application/json' } });
    else try {
      try { r = await pfetch(upstream, { headers: { 'user-agent': 'AI-GEO-NIGRAAN-local/91.17' }, signal: AbortSignal.timeout(45000) }); }
      catch (e) { _noteAttempt(false); OM_OUTAGE.note(host, false); throw e; }
      _noteAttempt(r.ok); OM_OUTAGE.note(host, r.status < 500, r.status);
      if (r.status >= 500) throw new Error('upstream ' + r.status);
    } catch (first) {
      await new Promise((ok) => setTimeout(ok, 400));
      try { r = await pfetch(upstream, { headers: { 'user-agent': 'AI-GEO-NIGRAAN-local/91.17' }, signal: AbortSignal.timeout(45000) }); }
      catch (e) { _noteAttempt(false); OM_OUTAGE.note(host, false); throw e; }
      _noteAttempt(r.ok); OM_OUTAGE.note(host, r.status < 500, r.status);
      retried = true;
    }
    const body = Buffer.from(await r.arrayBuffer());
    if (_rmKey && r.ok && !_rmHit) runMemoPut(_rmKey, _rmBase, _rmRun, body);
    if (_rmSettle) _rmSettle(r.ok ? body : null);
    if (r.ok && !wantRaw && path === '/v1/forecast' && host === 'api.open-meteo.com' && String(req.headers['x-agn-keep-raw'] || '') === '1') rawKeep(qs, body);   /* v283.24 · P4 */
    if (_pm && !_rmKey && r.ok && !_ph) { POINT_MEMO.delete(_pm); POINT_MEMO.set(_pm, { at: Date.now(), body }); const _cut = Date.now() - 180e3; for (const [k, v] of POINT_MEMO) { if (v.at >= _cut && POINT_MEMO.size <= 200) break; POINT_MEMO.delete(k); } }
    /* v91.17.147 · the forecast quota is spent (429): a point request is answered from the secondary global forecast, marked
       agn_fallback and left uncorrected (server/api/vcfallback.mjs). NIGRAAN_FALLBACK=0 switches it off. */
    /* v91.17.147 · audit data F9 · internal learners (fleet and synop pairs, the pool, the grids) get the 429, never the fallback:
       residual tables must not learn against another model. The point engine and pages get it, marked. */
    /* (the learners' exclusion _noFb and the eligibility _fbOk are set above, with the outage short-cut) */
    if (r.status === 429 && await serveSecondary('quota', 'upstream 429')) return;
    if (r.status >= 500 && await serveSecondary('outage', 'upstream ' + r.status)) return;   /* v91.17.269 · INFRA A7 */
    if (!r.ok && (r.status >= 500 || r.status === 429) && await serveLastGood('upstream ' + r.status)) return;
    if (r.ok && cacheKey && PX_SWEEP_STORE.has(cacheKey)) { try { PX_SWEEP_STORE.get(cacheKey)(body); } catch {} PX_SWEEP_STORE.delete(cacheKey); }
    else if (r.ok && cacheKey) {
      if (cacheFile) { try { mkdirSync(join(cacheFile, '..'), { recursive: true }); writeFileSync(cacheFile, body); } catch {} }
      else { pxMemPut(cacheKey, body); }   /* v91.17.283.51 · memory: bounded by bytes as well as count */
    }
    if (cacheKey) PX_SWEEP_STORE.delete(cacheKey);
    const cb = r.ok ? await correctIfForecast(body) : { buf: body, n: 0 };
    res.writeHead(r.status, {
      'content-type': r.headers.get('content-type') || 'application/json; charset=utf-8',
      'content-length': cb.buf.length,
      'x-agn-bias-corrected': String(cb.n),
      'x-agn-provider': 'MACH forecast',
      'x-agn-provider-tier': 'commercial',
      'x-agn-provider-ms': String(Date.now() - t0),
      ...(retried ? { 'x-agn-provider-retried': '1' } : {}),
      'x-agn-weighted-calls': _rmHit ? '0' : weighted.toFixed(2),
      /* v91.17.283 · WS1 · PATCH3 · the model run this answer came from (UTC); from the run memo: which rule served it */
      'x-agn-model-run': (() => { try { return _runLabel ? backend.app.modelRuns.headerOf(_runLabel) : 'unknown (models not in data/provider-models.json, or metadata not read yet)'; } catch (_) { return 'unknown'; } })(),
      ...(_rmHit ? { 'x-agn-cache': _rmWhy, 'x-agn-cache-age-s': String(Math.round((Date.now() - _rmHit.at) / 1000)) } : {}),
      ...(_rmHit && _rmRun && _rmHit.run !== _rmRun ? { 'x-agn-model-run-latest': backend.app.modelRuns.headerOf(_rmRun) } : {}),
      /* v91.17.3 · 1.10 · say when this server supplied an elevation the caller did not */
      ...(elevBasis ? { 'x-agn-elevation-basis': elevBasis.slice(0, 160) } : {}),
    });
    res.end(cb.buf);
  } catch (e) {
    if (cacheKey) PX_SWEEP_STORE.delete(cacheKey);
    try { if (await serveSecondary('outage', String(e && (e.name === 'TimeoutError' ? 'timeout' : e.message) || e))) return; } catch (_) {}   /* v91.17.269 · INFRA A7: no answer, a timeout */
    try { if (await serveLastGood(String(e && e.message || e))) return; } catch (_) {}
    json(res, 502, { error: 'provider_unreachable', provider: 'MACH forecast', why: String(e && e.message || e) });
  } finally { sweepSettle(null); if (_rmSettle) _rmSettle(null); }   /* v91.17.173 · a failed or refused call releases its waiters (no-op after a stored answer); v283.53 C: the run-memo joiners too */
}

function manifest(res) {
  const p = join(ART, 'MANIFEST.json');
  if (!existsSync(p)) return json(res, 404, { error: 'no_manifest' });
  const m = JSON.parse(readFileSync(p, 'utf8'));
  for (const [name, entry] of Object.entries(m)) {
    const f = join(ART, name);
    entry.served_sha256 = existsSync(f) ? sha256(readFileSync(f)) : null;
    entry.matches = entry.served_sha256 === entry.sha256;
  }
  json(res, 200, {
    basis: 'sha256 over the DELIVERED BYTES of each file. This is deliberately not the artefact_sha256 inside the QA receipt, which is computed over normalised bytes with the receipt and the CSP hash list replaced. The two answer different questions and confusing them is how an auditor gets a mismatch that is not a defect.',
    files: m,
  });
}

/* ── static ─────────────────────────────────────────────────────────────── */

const FRAME_HEADERS = { 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "frame-ancestors 'self'" };
/* v91.17.283 · WS1 · Customize NIGRAAN (/customize = artefact/NIGRAAN_3.html) carried no CSP (only frame-ancestors). Unlike the sealed
   console it has no meta CSP of its own, so the policy is set here, made from what the page actually loads (checked: its three inline
   scripts, inline style blocks and style attributes, Leaflet's data: tile placeholder and data: images, blob: downloads, and fetch only
   to this origin: /api, /customize, /n3, /tiles). Scripts: 'self' plus the sha256 of each inline script, computed from the file served
   (per file version), so an edited page keeps a matching policy and an injected script never runs. */
const CSP_CACHE = new Map();
function pageCsp(file, st) {
  const k = file + '|' + st.size + '|' + Math.floor(st.mtimeMs), hit = CSP_CACHE.get(file); if (hit && hit.k === k) return hit.v;
  const txt = readFileSync(file, 'utf8'), hs = new Set();
  for (const m of txt.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) { if (/\ssrc\s*=/i.test(m[1] || '')) continue; hs.add("'sha256-" + createHash('sha256').update(m[2], 'utf8').digest('base64') + "'"); }
  const v = ["default-src 'self'", "script-src 'self' " + [...hs].join(' '), "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
    "connect-src 'self'", "media-src 'self'", "worker-src 'none'", "frame-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'self'"].join('; ');   /* v91.17.283.50 · the report viewer frames the report's own HTML view (same origin) */
  CSP_CACHE.set(file, { k, v }); return v;
}
const CSP_PAGES = new Set(['NIGRAAN_3.html']);
function serveFile(res, file, req) {
  if (typeof res.agnBypass === 'function') res.agnBypass();   /* static files compress here, from a cache, not in the response wrapper */
  const st = statSync(file);
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  const etag = '"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
  /* ══ v91.17.76 · O · B-25 · THE 7 MB PAGE WENT OUT UNCOMPRESSED ══════════════════════════════════════════════
     MEASURED (UX audit B, v91.17.75): the HTML was served as 7.09 MB on every load; gzip takes it to about a third.
     The FILE is untouched: the bytes on disk, the manifest sha256 and verify.mjs are exactly as before, and a client
     that decodes the transfer gets those bytes back (harness "served bytes match" hashes the decoded body). Only the
     transfer is encoded, and only when the client says it accepts it. The encoded copy is made once per file version
     (etag) off the event loop and kept in memory; the artefact is pre-encoded at start-up so the first visitor does
     not wait for it. */
  const enc = COMPRESSIBLE(type) && st.size >= 1024 && req.method !== 'HEAD' ? pickEncoding(req) : null;
  const vtag = enc ? etag.slice(0, -1) + '-' + enc + '"' : etag;
  const inm = String(req.headers['if-none-match'] || '');
  if (inm === vtag || inm === etag) { res.writeHead(304, { etag: vtag, vary: 'Accept-Encoding' }); return res.end(); }
  const head = {
    'content-type': type, etag,
    /* No CSP header is set here on purpose. The artefact carries its own,
       sealed by hash over every inline block. A header added in transit would
       either duplicate it or, worse, relax it. */
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...(COMPRESSIBLE(type) ? { vary: 'Accept-Encoding' } : {}),
    /* v91.17.212 · audit S-26 · no other site may frame these pages (clickjacking). frame-ancestors is the one directive a meta
       CSP cannot carry; a header holding only it adds a restriction and relaxes nothing in the sealed page CSP. */
    ...(type.startsWith('text/html') ? FRAME_HEADERS : {}),
    ...(type.startsWith('text/html') && CSP_PAGES.has(file.split(/[\\/]/).pop()) ? { 'content-security-policy': pageCsp(file, st) } : {}),   /* v91.17.283 · WS1 */
  };
  if (!enc) {
    res.writeHead(200, { ...head, 'content-length': st.size });
    return createReadStream(file).pipe(res);
  }
  return encodedFile(file, etag, enc).then((buf) => {
    res.writeHead(200, { ...head, etag: vtag, 'content-encoding': enc, 'content-length': buf.length, 'x-agn-identity-length': String(st.size) });
    res.end(buf);
  }, () => {
    res.writeHead(200, { ...head, 'content-length': st.size });
    createReadStream(file).pipe(res);
  });
}

/* ── v91.17.76 · O · B-25 · response compression ─────────────────────────────────────────────────────────── */
const COMPRESSIBLE = (type) => /^(text\/|application\/(json|javascript|xml|vnd\.agn\+json|geo\+json)|image\/svg\+xml)/i.test(String(type || ''));
/* brotli is preferred where the client offers it (browsers offer it over HTTPS; over plain http they offer gzip) */
function pickEncoding(req) {
  if (process.env.NIGRAAN_COMPRESS === '0') return null;
  /* v91.17.234 · the server's own internal calls (sweep warm-up, fleet and synop pairs, point engine, AI, grids: x-agn-internal) are
     answered uncompressed: compressing here and decompressing in the caller on the same thread was pure cost (9 s of 150 s in the
     laptop profile went to decompressing). Only on a loopback socket. */
  if (req.headers['x-agn-internal'] && LOOPBACK_ADDR(req.socket && req.socket.remoteAddress)) return null;
  const ae = String(req.headers['accept-encoding'] || '').toLowerCase();
  const q = {};
  for (const part of ae.split(',')) {
    const [name, ...params] = part.trim().split(';');
    if (!name) continue;
    const qp = params.map(x => x.trim()).find(x => x.startsWith('q='));
    q[name] = qp ? Number(qp.slice(2)) : 1;
  }
  const ok = (n) => (q[n] != null ? q[n] > 0 : (q['*'] != null && q['*'] > 0));
  if (ok('br')) return 'br';
  if (ok('gzip')) return 'gzip';
  return null;
}
const ENC_FILES = new Map();   /* file|enc -> { etag, promise } ; one version per file */
function encodedFile(file, etag, enc) {
  const k = file + '|' + enc, hit = ENC_FILES.get(k);
  if (hit && hit.etag === etag) return hit.promise;
  const promise = new Promise((ok, bad) => {
    const buf = readFileSync(file);
    const done = (e, out) => (e ? bad(e) : ok(out));
    if (enc === 'br') zlib.brotliCompress(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }, done);
    else zlib.gzip(buf, { level: 9 }, done);
  });
  ENC_FILES.set(k, { etag, promise });
  promise.catch(() => ENC_FILES.delete(k));
  return promise;
}
/* API and proxy responses are written as writeHead(code, headers) + end(body) in one call; the wrapper holds the
   head until end() and encodes the body there. Anything that streams (write()) is passed through unencoded. */
function installCompression(req, res) {
  const enc = req.method === 'HEAD' ? null : pickEncoding(req);
  if (!enc) return;
  const raw = { writeHead: res.writeHead, write: res.write, end: res.end };
  let held = null;
  const restore = () => { res.writeHead = raw.writeHead; res.write = raw.write; res.end = raw.end; };
  const flushHead = () => { if (held) { const h = held; held = null; raw.writeHead.apply(res, h); } };
  res.agnBypass = () => { flushHead(); restore(); };
  res.writeHead = function (code, a, b) { held = [code, a, b].filter((x) => x !== undefined); return res; };
  res.write = function (...args) { flushHead(); restore(); return raw.write.apply(res, args); };
  res.end = function (body, ...rest) {
    restore();
    if (!held) return raw.end.call(res, body, ...rest);
    const [code, a, b] = held; held = null;
    const hdrs = Object.assign({}, typeof a === 'object' && a ? a : (typeof b === 'object' && b ? b : {}));
    const lk = (n) => Object.keys(hdrs).find((x) => x.toLowerCase() === n);
    const type = hdrs[lk('content-type')] || res.getHeader('content-type');
    const buf = body == null ? null : (Buffer.isBuffer(body) ? body : (typeof body === 'string' ? Buffer.from(body) : null));
    if (!buf || buf.length < 1024 || !COMPRESSIBLE(type) || lk('content-encoding') || code === 204 || code === 304) {
      raw.writeHead.call(res, code, ...(typeof a === 'string' ? [a, hdrs] : [hdrs]));
      return raw.end.call(res, body, ...rest);
    }
    const done = (e, out) => {
      if (e || !out || out.length >= buf.length) { raw.writeHead.call(res, code, hdrs); return raw.end.call(res, buf); }
      const cl = lk('content-length'); if (cl) delete hdrs[cl];
      const v = lk('vary'); hdrs[v || 'vary'] = v ? hdrs[v] + ', Accept-Encoding' : 'Accept-Encoding';
      Object.assign(hdrs, { 'content-encoding': enc, 'content-length': out.length });
      raw.writeHead.call(res, code, hdrs);
      raw.end.call(res, out);
    };
    if (enc === 'br') zlib.brotliCompress(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }, done);
    else zlib.gzip(buf, { level: 6 }, done);
    return res;
  };
}

/* ══ v91.17.76 · O · OPERATOR MODE: THE ENGINEERING VIEW IS FOR THIS MACHINE ONLY ════════════════════════════════
   CEO decision 4 (26 Sep 2026): engineering consoles, QA output, version tags, internal notes and code identifiers
   are operator-only. The page turns operator mode on only after asking this route, and this route says yes only to a
   request that arrived on the loopback interface, addressed to a loopback host name, with no proxy in between:
     · the SOCKET address decides, never a header: X-Forwarded-For / Forwarded / X-Real-IP cannot make a remote
       client local. A forwarding header on a loopback socket means a proxy or tunnel on this machine is relaying
       someone else's request, so it turns the answer to NO (a header can only take operator mode away).
     · the Host (and Origin, when sent) must be a loopback name: a tunnel that connects from 127.0.0.1 carries the
       public host name and is refused.
     · NIGRAAN_OPERATOR=off disables it outright (a deployment behind a local reverse proxy that strips headers).
   Default everywhere, localhost included, is the customer view; ?operator=1 asks, ?operator=0 leaves. */
const LOOPBACK_ADDR = (a) => { a = String(a || '').toLowerCase(); return a === '::1' || /^(::ffff:)?127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a); };
const LOOPBACK_NAME = (host) => {
  const h = String(host || '').trim().toLowerCase(); if (!h) return false;
  const name = h.startsWith('[') ? h.slice(1, h.indexOf(']')) : h.replace(/:\d+$/, '');
  return name === 'localhost' || name === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name);
};
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-server', 'forwarded', 'x-real-ip', 'via',
  'cf-connecting-ip', 'cf-ray', 'true-client-ip', 'x-client-ip', 'x-cluster-client-ip', 'fastly-client-ip', 'x-original-forwarded-for', 'x-azure-clientip'];
function operatorDecision(req) {
  if (String(process.env.NIGRAAN_OPERATOR || '').toLowerCase() === 'off') return { operator: false, basis: 'disabled on this server (NIGRAAN_OPERATOR=off)' };
  const addr = req.socket && req.socket.remoteAddress;
  if (!LOOPBACK_ADDR(addr)) return { operator: false, basis: 'request did not come from this machine' };
  /* v91.17.283 · INTEG (S1b) · relayed by the front proxy from another computer (proxy.mjs x-agn-proxy-client) */
  if (req.headers['x-agn-via-proxy'] != null && req.headers['x-agn-proxy-client'] != null && !LOOPBACK_ADDR(String(req.headers['x-agn-proxy-client']))) return { operator: false, basis: 'request was relayed by the front proxy from another computer' };
  if (!LOOPBACK_NAME(req.headers.host)) return { operator: false, basis: 'host name is not a loopback name' };
  const fwd = PROXY_HEADERS.filter((h) => req.headers[h] != null);
  if (fwd.length) return { operator: false, basis: 'request was relayed by a proxy (' + fwd.join(', ') + ')' };
  const o = req.headers.origin;
  if (o && o !== 'null') { let ok = false; try { ok = LOOPBACK_NAME(new URL(o).host); } catch {} if (!ok) return { operator: false, basis: 'origin is not a loopback origin' }; }
  return { operator: true, basis: 'loopback request on this machine' };
}
/* v91.17.76 · O · the page words supplier names generically on customer screens (UX audit A-16/B-16); the words and the
   matching rules live in data/source-labels.json with their provenance, and this is the only route that hands them out.
   Read per request (the file is 6 kB) so an edit to the labels needs no restart. */
function sourceLabels(res, req) {
  try {
    const d = JSON.parse(readFileSync(join(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), 'source-labels.json'), 'utf8'));
    /* v91.17.283 · INTEG (permanent N2) · the customer view never carries the two agency names, not even inside a screening pattern: those
       alternatives are taken out of the rules it gets (the server's own customer answers are already scrubbed, customerscrub.mjs, and the
       pages carry no such name: permanent N1); the operator on this computer gets the file's rules unchanged */
    let rules = d.screenRules_v76 || null;
    const cust = String((req && req.headers['x-agn-view']) || '').toLowerCase() === 'customer' || !(req && operatorDecision(req).operator);
    if (cust && rules && Array.isArray(rules.rules)) { const AG = /(?:PMD|FFD|Pakistan Meteorological Department|Flood Forecasting Division)/;
      rules = { ...rules, rules: rules.rules.map((r) => { if (!Array.isArray(r) || typeof r[0] !== 'string' || !AG.test(r[0])) return r;
        const pat = r[0].replace(/(?:PMD|FFD|Pakistan Meteorological Department|Flood Forecasting Division)\|/g, '').replace(/\|(?:PMD|FFD|Pakistan Meteorological Department|Flood Forecasting Division)(?=[)]|$)/g, '');
        return AG.test(pat) ? null : [pat, ...r.slice(1)]; }).filter(Boolean) }; }
    const b = Buffer.from(JSON.stringify({ version: d.version, labels: d.labels || {}, provenance: d.labelsProvenance_v76 || null, screenRules: rules }));
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': b.length, 'cache-control': 'no-cache' });
    return res.end(b);
  } catch (e) { return json(res, 503, { error: 'source_labels_unavailable', why: String(e && e.message || e).slice(0, 120) }); }
}
function operatorStatus(req, res) {
  const d0 = operatorDecision(req);
  const d = d0.operator && !dashGate().open(req)
    ? { operator: false, locked: true, basis: 'locked until a dashboard token is entered' }
    : d0;
  const b = Buffer.from(JSON.stringify(d));
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': b.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(b);
}
function dashComputer(req) {
  const addr = req.socket && req.socket.remoteAddress;
  if (!LOOPBACK_ADDR(addr)) return false;
  if (req.headers['x-agn-via-proxy'] != null && req.headers['x-agn-proxy-client'] != null && !LOOPBACK_ADDR(String(req.headers['x-agn-proxy-client']))) return false;
  if (!LOOPBACK_NAME(req.headers.host)) return false;
  if (PROXY_HEADERS.some((h) => req.headers[h] != null)) return false;
  return true;
}
function dashJson(res, code, obj, extra) {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, Object.assign({ 'content-type': 'application/json; charset=utf-8', 'content-length': b.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, extra || {}));
  res.end(b);
}
function dashSetCookie(name, token, clear) {
  if (clear) return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`;
}
async function readDashBody(req) {
  let body = '';
  for await (const ch of req) {
    body += ch;
    if (body.length > 4000) return null;
  }
  try { return JSON.parse(body || '{}'); } catch { return null; }
}
function lockedDocument(res) {
  const html = '<!doctype html><meta charset="utf-8"><title>Locked</title><body style="font:16px/1.45 system-ui,sans-serif;background:#f4f7f7;color:#163033;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:440px;background:#fff;border-top:3px solid #e07b24;border-left:3px solid #e07b24;border-bottom:3px solid #e07b24;border-right:1px solid rgba(21,74,78,.12);border-radius:16px;padding:22px"><h1 style="margin:0 0 8px;font-size:22px">Locked</h1><p style="margin:0">Customize and operator mode stay closed until a dashboard token is entered. A typed address does not open them.</p></main>';
  const b = Buffer.from(html);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': b.length, 'cache-control': 'no-store' });
  res.end(b);
}

/* ══ basemap tiles, same-origin (the artefact CSP allows images from 'self' only) ══
   ── v91.17.4 · THE WATERMARK CAME BACK, SO THE KEYED SERVICE GOES ─────────────
   History of this defect, because it has now bitten twice:

     v91.16  tiles came from basemaps.cartocdn.com with no key. CARTO began
             stamping "API KEY REQUIRED" across keyless tiles, so the map read
             as broken.
     v91.17  switched to Esri World_Light_Gray_Base, which needs no key — and
             the watermark still appeared, because the fix changed the SOURCE
             but the on-disk cache under data/tiles/light/ still held the
             stamped CARTO PNGs and serveTile hands a cached file straight
             back without ever asking who made it.

   Two things are therefore wrong with "just point at a different host":
   a cache keyed only by z/x/y cannot tell one provider's tile from another's,
   and any provider that can introduce a key later can reintroduce this.

   What this version does:

   1. THE CACHE IS VERSIONED AND PROVENANCE-STAMPED. Every cached tile is
      written under a directory carrying the source name and TILE_CACHE_VERSION,
      and a `.src` sidecar records which upstream produced it. Change the source
      and old tiles are unreachable rather than silently reused. Legacy
      directories from earlier versions are deleted at startup; they are a
      cache, so deleting them costs a re-fetch and nothing else.

   2. THE DEFAULT SOURCE NEEDS NO KEY AND NEVER WILL. OpenStreetMap standard
      tiles are ODbL-licensed community infrastructure with no key, no account
      and no watermark. They are colourful rather than grey, which is wrong
      under a choropleth, so the config ships a CSS filter that renders them as
      a light grey canvas in the browser — the Positron look without the
      Positron account. The filter costs nothing: it is applied to the tile
      pane by the GPU, not by this server.

      OSM's tile usage policy asks for a real identifying User-Agent and no
      bulk downloading. This server sends one and caches every tile on disk, so
      a single analyst panning over Pakistan re-requests almost nothing.

   3. ESRI STAYS AS A FALLBACK, NOT AS THE DEFAULT. If OSM fails or is blocked,
      the chain falls through to Esri light grey and the response says which
      one served it. Esri's basemaps are free to call but their terms want an
      agreement for commercial client-facing use, which is exactly the kind of
      condition that turns into a watermark later. It is the reserve, not the
      primary.

   4. NOTHING SILENTLY DEGRADES. /tiles/status reports the source, the cache
      counts and the last upstream error per style, and the config carries
      `keyRequired:false` so a surface can state it. */
/* v91.17.4 · the cache version is a kill switch, not a decoration.
   Bumping it makes every tile written by an earlier build unreadable and
   unreachable: the directory name changes, the old one is deleted at startup,
   and nothing can serve a tile this build has not judged. It is bumped
   whenever the chain, the judging rules or the refusal list change, because a
   tile cached under the old rules was cached under rules that let a refusal
   image through. */
const TILE_CACHE_VERSION = 'v5';
const TILE_MODULE = 'v91.17.5 key-free chain + content judging + self-healing disk cache + versioned client URLs';
const TILE_UA = 'AI-GEO-NIGRAAN-local/91.17 (offline Pakistan hazard dashboard; contact: aigeo360.com)';
const ESRI = (svc) => (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/${z}/${y}/${x}`;
const TILE_SOURCES = {
  light: {
    dir: 'basemap-' + TILE_CACHE_VERSION,
    type: 'image/png',
    /* ordered: the first that answers wins, and the winner is recorded */
    /* ── ORDER MATTERS, AND IT WAS TESTED, NOT GUESSED ─────────────────────
       The first draft of this fix put OpenStreetMap standard first, on the
       reasoning that ODbL with no key beats a free-tier commercial service.
       Measured from a server IP, tile.openstreetmap.org answered:

           HTTP 200, 6,987 bytes, a PNG reading
           "403 · Access blocked · App is not following the tile usage policy
            of OpenStreetMap's volunteer-run servers"

       A 200 carrying a refusal image is the CARTO watermark again in different
       clothes, and this one is deserved: OSM's policy asks that distributed
       apps not use the volunteer servers as their default basemap. Putting it
       first would have shipped the same defect a third time.

       Esri World_Light_Gray_Base is therefore the default. It needs no key, no
       account and no referrer, it is natively grey so the choropleth reads
       over it without a filter, and it returned distinct real tiles on every
       test. Its terms want an agreement for commercial client-facing use —
       which is stated in the licence field and in the handover notes, and is a
       commercial question, not a broken map.

       OSM stays as the fallback because on a normal home or office connection
       with the identifying User-Agent below it usually answers correctly, and
       ODbL is the cleaner licence when it does. It is guarded by the refusal
       detector below, so a blocked tile is never cached and never drawn. */
    chain: [
      { name: 'esri-light-gray', type: 'image/jpeg', filter: null,
        licence: 'Esri basemap — no key or account required. Esri terms ask for an agreement before commercial client-facing use.',
        attribution: 'Basemap © Esri, HERE, Garmin, © OpenStreetMap contributors',
        url: ESRI('Canvas/World_Light_Gray_Base') },
      { name: 'openstreetmap', type: 'image/png',
        /* OSM standard is full colour, so it is greyed in the browser when it serves */
        filter: 'grayscale(1) brightness(1.07) contrast(0.86) saturate(0)',
        licence: 'ODbL — OpenStreetMap contributors. No key and no account, but the tile usage policy asks that distributed apps not use the volunteer servers as a default.',
        attribution: '© OpenStreetMap contributors (ODbL)',
        url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png` },
    ],
  },
  imagery: {
    dir: 'imagery-' + TILE_CACHE_VERSION,
    type: 'image/jpeg',
    chain: [
      { name: 'esri-world-imagery', type: 'image/jpeg', licence: 'Esri World Imagery — commercial agreement required for client-facing use.',
        attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
        url: ESRI('World_Imagery') },
    ],
  },
};
const TILE_DIR = join(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), 'tiles');
const TILE_STATE = {};
for (const k of Object.keys(TILE_SOURCES)) TILE_STATE[k] = { served: null, hits: 0, fetched: 0, failures: 0, lastError: null };

/* Old cache folders held provider-stamped tiles. They are a cache; drop them. */
(function purgeLegacyTileCache() {
  const keep = new Set([...Object.values(TILE_SOURCES).map(s => s.dir), 'hillshade', 'last-good.json']);   /* v91.17.283.50 · the source that served last (warmTileChain) */   /* v91.17.75 · T: data/tiles/hillshade is built data, not a cache */
  try {
    if (!existsSync(TILE_DIR)) return;
    let gone = 0;
    for (const name of readdirSync(TILE_DIR)) {
      if (keep.has(name)) continue;
      try { rmSync(join(TILE_DIR, name), { recursive: true, force: true }); gone++; } catch {}
    }
    if (gone) console.log('  tiles      cleared ' + gone + ' legacy cache folder(s); they may have held watermarked tiles');
  } catch {}
})();

/* ══ v91.17.4 · A 200 IS NOT A TILE ═══════════════════════════════════════════
   Both failures this defect has produced came back as HTTP 200 with a picture
   saying no: CARTO stamped "API KEY REQUIRED" across the map, and OSM returns
   a "403 Access blocked" PNG with a 200 status. Checking r.ok cannot see
   either, so the tile has to be judged on its content.

   Two guards, one exact and one general.

   EXACT. Refusal images observed from these providers are hashed and listed.
   A tile whose sha256 matches is never drawn and never cached.

   GENERAL, and the one that will catch the next provider nobody has met yet:
   a refusal image is the SAME image for every coordinate. Real basemap tiles
   differ. So each source keeps the set of distinct hashes it has returned and
   the number of distinct coordinates it has answered; when a source has served
   three or more different coordinates and produced exactly one distinct image,
   it is serving a placard, not a map. It is marked blocked for the life of the
   process, the chain falls through to the next source, and /tiles/status says
   which source was dropped and why.

   The false positive this could have — a genuinely uniform area such as open
   ocean — is handled by the three-coordinate threshold plus the fact that the
   first tiles this dashboard ever requests are over Pakistan, which is land. */
const TILE_REFUSALS = new Map([
  ['b02c44252dac5a5e820ecef1e9bf9200e9407c042df668a466a1aa81a9ecca7a',
   'OpenStreetMap "403 Access blocked — App is not following the tile usage policy" image, served with HTTP 200'],
]);
const TILE_GUARD = {};   /* per source: { hashes:Set, coords:Set, blocked:string|null } */
function guardOf(name) { return TILE_GUARD[name] || (TILE_GUARD[name] = { hashes: new Set(), coords: new Set(), blocked: null }); }
function judgeTile(sourceName, buf, coordKey) {
  const g = guardOf(sourceName);
  if (g.blocked) return { ok: false, why: g.blocked };
  const h = createHash('sha256').update(buf).digest('hex');
  const known = TILE_REFUSALS.get(h);
  if (known) { g.blocked = known; return { ok: false, why: known }; }
  g.hashes.add(h); g.coords.add(coordKey);
  if (g.coords.size >= 3 && g.hashes.size === 1) {
    g.blocked = 'this source returned the SAME image for ' + g.coords.size
      + ' different tile coordinates, which is a placard rather than a map';
    return { ok: false, why: g.blocked };
  }
  return { ok: true, hash: h };
}

/* The cache holds whatever the source returned, and the sources in one chain
   do not agree on a format (Esri light grey is JPEG, OSM is PNG), so the
   content type of a replayed tile is read from its own bytes, not from the
   style's nominal type. */
function sniffType(b) {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.length > 12 && b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

async function serveTile(res, style, z, x, y, opt) {
  const _versioned = !!(opt && opt.versioned);
  const src = Object.prototype.hasOwnProperty.call(TILE_SOURCES, style) ? TILE_SOURCES[style] : null;   /* v91.17.68 · an inherited name (constructor, __proto__) is not a style (audit C16) */
  if (!src || ![z, x, y].every(v => /^\d+$/.test(v)) || Number(z) > 19) return json(res, 404, { error: 'unknown_tile' });
  const st = TILE_STATE[style];
  const dir = join(TILE_DIR, src.dir, z, x), file = join(dir, y);
  const send = (b, type, from, cached) => {
    /* A versioned URL is safe to cache hard: the version is part of the path, so
       the next source or judging change gives the browser a URL it has never
       seen. An UNVERSIONED URL is the legacy shape and must never be stored,
       because a stored copy of it is exactly what kept a watermark on screen
       through two server-side fixes. */
    res.writeHead(200, { 'content-type': type, 'content-length': b.length,
      'cache-control': _versioned ? 'public, max-age=604800, immutable' : 'no-store, must-revalidate',
      'x-agn-tile-url': _versioned ? 'versioned' : 'legacy-unversioned',
      'x-agn-tile-source': from, 'x-agn-tile-cache': cached ? 'disk' : 'miss' });
    res.end(b);
  };
  /* v91.17.4 — A CACHED TILE IS JUDGED TOO.
     The first run of this chain cached OpenStreetMap's "403 Access blocked"
     placard as if it were a map. The refusal guard only ran on the network
     path, so every later request replayed the placard from disk and the guard
     never saw it. A poisoned cache has to heal itself: the sidecar source is
     re-checked against the block list and the bytes against the refusal
     hashes, and anything that fails is deleted and re-fetched. */
  if (existsSync(file)) {
    let from = ''; try { from = readFileSync(file + '.src', 'utf8').trim(); } catch {}
    const b = (() => { try { return readFileSync(file); } catch { return null; } })();
    const known = src.chain.some(c => c.name === from);
    const bad = !b || !b.length ? 'empty or unreadable cache entry'
      : !known ? 'cached by "' + (from || 'an unrecorded source') + '", which is not in this style\'s chain'
      : guardOf(from).blocked ? 'its source is blocked: ' + guardOf(from).blocked
      : TILE_REFUSALS.get(createHash('sha256').update(b).digest('hex')) || null;
    if (bad) {
      guardOf(from).blocked = guardOf(from).blocked || (typeof bad === 'string' && known ? bad : null);
      st.purged = (st.purged || 0) + 1;
      st.lastError = 'discarded a cached tile: ' + bad;
      try { rmSync(file, { force: true }); rmSync(file + '.src', { force: true }); } catch {}
    } else {
      st.hits++;
      return send(b, sniffType(b) || src.type, from, true);
    }
  }
  for (const up of src.chain) {
    if (guardOf(up.name).blocked) continue;
    try {
      const r = await fetch(up.url(z, x, y), { headers: {
        /* OSM's usage policy asks for a real identifying agent, not a browser string */
        'user-agent': TILE_UA,
        'accept': 'image/png,image/jpeg,image/*;q=0.8',
      }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) { st.failures++; st.lastError = up.name + ' HTTP ' + r.status; continue; }
      const b = Buffer.from(await r.arrayBuffer());
      if (!b.length) { st.failures++; st.lastError = up.name + ' returned an empty tile'; continue; }
      const verdict = judgeTile(up.name, b, z + '/' + x + '/' + y);
      if (!verdict.ok) {
        st.failures++; st.lastError = up.name + ' refused: ' + verdict.why;
        st.dropped = st.dropped || {}; st.dropped[up.name] = verdict.why;
        continue;   /* not cached, not drawn — the next source gets the request */
      }
      try { mkdirSync(dir, { recursive: true }); writeFileSync(file, b); writeFileSync(file + '.src', up.name); } catch {}
      st.fetched++; if (st.served !== up.name) tileLastGood(style, up.name); st.served = up.name;
      return send(b, r.headers.get('content-type') || up.type || src.type, up.name, false);
    } catch (e) { st.failures++; st.lastError = up.name + ': ' + (e && e.message || e); }
  }
  res.writeHead(502); res.end();
}

/* Ask each style for one tile at startup so /tiles/config can name the source
   that will actually serve and the filter that source needs, instead of naming
   the first entry in the chain and being wrong the moment it is blocked. */
/* v91.17.283.50 (1.0.10.1) · START WITH THE SOURCE THAT WORKED LAST. Laptop 3 Nov 2026 09:31 PKT (server-console.log): right after the
   laptop woke, the start probe of esri-light-gray did not get its three tiles (network and event loop not settled), openstreetmap
   refused (a placard), so the basemap was UNAVAILABLE until the 10-minute re-probe, while esri-light-gray served every tile before and
   after. The source that last served is now kept in data/tiles/last-good.json: at start it is served at once and probed first; a probe
   that fails by time-out, network or HTTP error keeps it (re-probed in 2 min); only a content refusal drops it. A source that refused
   at the last probe is probed after the others. */
const TILE_LASTGOOD_FILE = join(TILE_DIR, 'last-good.json');
function tileLastGoodRead() { try { return JSON.parse(readFileSync(TILE_LASTGOOD_FILE, 'utf8')) || {}; } catch { return {}; } }
function tileLastGood(style, name, refused) {
  try { const j = tileLastGoodRead(); j[style] = j[style] || {};
    if (refused) { j[style].refused = { name, at: new Date().toISOString() }; if (j[style].name === name) delete j[style].name; }
    else { j[style].name = name; j[style].at = new Date().toISOString(); if (j[style].refused && j[style].refused.name === name) delete j[style].refused; }
    mkdirSync(TILE_DIR, { recursive: true }); writeFileSync(TILE_LASTGOOD_FILE + '.tmp', JSON.stringify(j)); renameSync(TILE_LASTGOOD_FILE + '.tmp', TILE_LASTGOOD_FILE); } catch {}
}
async function warmTileChain() {
  if (process.env.NIGRAAN_TILES === '0') return;
  const LG = tileLastGoodRead(); let kept = false;
  /* Three coordinates, not one: the general guard needs three distinct tiles
     before it can say a source is serving the same picture for every request,
     and startup is the right place to find that out — not the first time a
     user pans the map. All three are over land in Pakistan. */
  const PROBE = [[6, 44, 26], [6, 45, 26], [6, 44, 27]];
  for (const [style, src] of Object.entries(TILE_SOURCES)) {
    const lg = LG[style] || {}, known = (n) => src.chain.some((c) => c.name === n);
    const order = src.chain.slice().sort((a, b) => ((b.name === lg.name) - (a.name === lg.name)) || (!!(lg.refused && a.name === lg.refused.name) - !!(lg.refused && b.name === lg.refused.name)));
    if (lg.name && known(lg.name) && !TILE_STATE[style].served) TILE_STATE[style].served = lg.name;   /* served at once; the probe below confirms or drops it */
    for (const up of order) {
      if (guardOf(up.name).blocked) continue;
      let ok = 0, refused = false;
      for (const [z, x, y] of PROBE) {
        try {
          const r = await fetch(up.url(z, x, y), { headers: { 'user-agent': TILE_UA, accept: 'image/*' }, signal: AbortSignal.timeout(6000) });
          if (!r.ok) { TILE_STATE[style].failures++; TILE_STATE[style].lastError = up.name + ' HTTP ' + r.status; break; }
          const b = Buffer.from(await r.arrayBuffer());
          const verdict = judgeTile(up.name, b, z + '/' + x + '/' + y);
          if (!verdict.ok) {
            TILE_STATE[style].lastError = up.name + ' refused: ' + verdict.why;
            TILE_STATE[style].dropped = TILE_STATE[style].dropped || {};
            TILE_STATE[style].dropped[up.name] = verdict.why;
            refused = true;
            break;
          }
          ok++;
        } catch (e) { TILE_STATE[style].failures++; TILE_STATE[style].lastError = up.name + ': ' + (e && e.message || e); break; }
      }
      if (ok === PROBE.length) { TILE_STATE[style].served = up.name; tileLastGood(style, up.name); break; }
      if (refused) { tileLastGood(style, up.name, true); if (TILE_STATE[style].served === up.name) TILE_STATE[style].served = null; continue; }
      if (up.name === lg.name && TILE_STATE[style].served === up.name) { kept = true; TILE_STATE[style].keptWhy = 'the start probe did not answer (' + (TILE_STATE[style].lastError || 'no answer') + '); kept as the source that served last'; break; }
    }
  }
  if (kept && !warmTileChain._reprobe) { warmTileChain._reprobe = setTimeout(() => { warmTileChain._reprobe = null; warmTileChain().catch(() => {}); }, 120e3); warmTileChain._reprobe.unref && warmTileChain._reprobe.unref(); }
  const l = TILE_STATE.light.served;
  /* v91.17.59 · say why EACH source failed, not only the last one, and try again in 10 minutes while nothing serves:
     a 6 s timeout at boot on a laptop that is still connecting is not a blocked provider */
  const why = l ? '' : ' \u00b7 ' + Object.entries(TILE_STATE.light.dropped || {}).map(([k, v]) => k + ' refused: ' + v).concat(TILE_STATE.light.lastError && !/refused/.test(TILE_STATE.light.lastError) ? [TILE_STATE.light.lastError] : []).join('; ') || ' \u00b7 no source answered';
  console.log('  tiles      basemap ' + (l || 'UNAVAILABLE (re-probing every 10 min)') + (l ? ' \u00b7 no API key required' + (TILE_STATE.light.keptWhy && kept ? ' \u00b7 ' + TILE_STATE.light.keptWhy : '') : why));
  if (!l && !warmTileChain._retry) { warmTileChain._retry = setInterval(() => { if (TILE_STATE.light.served) { clearInterval(warmTileChain._retry); return; } warmTileChain().catch(() => {}); }, 600e3); warmTileChain._retry.unref && warmTileChain._retry.unref(); }
  console.log('             %s \u00b7 cache %s \u00b7 selftest /tiles/selftest', TILE_MODULE, TILE_CACHE_VERSION);
}

function activeLightSource() {
  const want = TILE_STATE.light.served;
  return TILE_SOURCES.light.chain.find(c => c.name === want)
      || TILE_SOURCES.light.chain.find(c => !guardOf(c.name).blocked)
      || TILE_SOURCES.light.chain[0];
}

const STREETS_FILE = join(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), 'basemap', 'pk-streets.pmtiles');
let STREETS = null, STREETS_ERR = null, STREETS_AT = 0;
function streets() {
  if (STREETS || Date.now() - STREETS_AT < 60e3) return STREETS; STREETS_AT = Date.now();
  try { STREETS = openPmtiles(STREETS_FILE); STREETS_ERR = STREETS ? null : 'data/basemap/pk-streets.pmtiles is not installed'; } catch (e) { STREETS = null; STREETS_ERR = e.message; }
  return STREETS;
}
function streetsStatus(res) {
  const P = streets();
  if (!P) return json(res, 200, { ready: false, why: STREETS_ERR });
  json(res, 200, { ready: true, template: '/tiles/streets/{z}/{x}/{y}.mvt', minZoom: P.header.minZoom, maxDataZoom: P.header.maxZoom, bounds: P.header.bounds,
    tiles: P.header.addressed, bytes: P.size, built: P.meta['planetiler:buildtime'] || null, name: P.meta.name || null,
    attribution: '\u00a9 OpenStreetMap contributors (ODbL) \u00b7 Protomaps', licence: 'ODbL 1.0 (OpenStreetMap data); Protomaps basemap schema, BSD-3 renderer',
    note: 'served from this computer; national and disputed boundaries from the map data are not drawn: the map draws AGN boundaries' });
}
/* v91.17.283.4 · item 1 · BUILDINGS ON THE STREET MAP: Overture Maps building footprints from one local archive
   (data/basemap/pk-buildings.pmtiles, built offline by scripts/gen/overture_buildings.py), no runtime call to any outside host. The page
   draws them at zoom 15 and closer only. Not installed: status says so and the page draws nothing. */
const BUILDINGS_FILE = join(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), 'basemap', 'pk-buildings.pmtiles');
let BUILDINGS = null, BUILDINGS_ERR = null, BUILDINGS_AT = 0;
function buildingsArchive() {
  if (BUILDINGS || Date.now() - BUILDINGS_AT < 60e3) return BUILDINGS; BUILDINGS_AT = Date.now();
  try { BUILDINGS = existsSync(BUILDINGS_FILE) ? openPmtiles(BUILDINGS_FILE) : null; BUILDINGS_ERR = BUILDINGS ? null : 'data/basemap/pk-buildings.pmtiles is not installed'; } catch (e) { BUILDINGS = null; BUILDINGS_ERR = e.message; }
  return BUILDINGS;
}
function buildingsStatus(res) {
  const P = buildingsArchive();
  if (!P) return json(res, 200, { ready: false, why: BUILDINGS_ERR });
  json(res, 200, { ready: true, template: '/tiles/buildings/{z}/{x}/{y}.mvt', layer: (P.meta && P.meta.vector_layers && P.meta.vector_layers[0] && P.meta.vector_layers[0].id) || 'building',
    minZoom: P.header.minZoom, maxDataZoom: P.header.maxZoom, bounds: P.header.bounds, tiles: P.header.addressed, bytes: P.size,
    attribution: 'Buildings \u00a9 Overture Maps Foundation (ODbL; includes OpenStreetMap and other open sources)', licence: 'ODbL 1.0 / CDLA-Permissive-2.0 per source',
    release: (P.meta && P.meta.overture_release) || null, drawFromZoom: 15 });
}
function buildingsTile(res, z, x, y) {
  const P = buildingsArchive(); if (!P) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('buildings not installed'); }
  let b = null; try { b = P.tile(z, x, y); } catch (_) { b = null; }
  if (!b) { res.writeHead(204, { 'cache-control': 'public, max-age=86400' }); return res.end(); }
  const h = { 'content-type': 'application/x-protobuf', 'cache-control': 'public, max-age=604800' };
  if (P.tileEncoding === 'gzip') h['content-encoding'] = 'gzip';
  res.writeHead(200, h); res.end(b);
}
function streetsTile(res, z, x, y) {
  const P = streets(); if (!P) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('streets not installed'); }
  let b = null; try { b = P.tile(z, x, y); } catch (_) { b = null; }
  if (!b) { res.writeHead(204, { 'cache-control': 'public, max-age=86400' }); return res.end(); }
  const h = { 'content-type': 'application/x-protobuf', 'cache-control': 'public, max-age=604800' };
  if (P.tileEncoding === 'gzip') h['content-encoding'] = 'gzip';
  res.writeHead(200, h); res.end(b);
}

function tileConfig(res) {
  if (process.env.NIGRAAN_TILES === '0') return json(res, 404, { error: 'tiles_disabled' });
  const primary = activeLightSource();
  json(res, 200, {
    template: '/tiles/' + TILE_CACHE_VERSION + '/light/{z}/{x}/{y}',
    templates: { radar: '/tiles/' + TILE_CACHE_VERSION + '/light/{z}/{x}/{y}', satellite: '/tiles/' + TILE_CACHE_VERSION + '/imagery/{z}/{x}/{y}', temperature: '/tiles/' + TILE_CACHE_VERSION + '/light/{z}/{x}/{y}', rainfall: '/tiles/' + TILE_CACHE_VERSION + '/light/{z}/{x}/{y}', wind: '/tiles/' + TILE_CACHE_VERSION + '/light/{z}/{x}/{y}', comfort: '/tiles/' + TILE_CACHE_VERSION + '/light/{z}/{x}/{y}' },
    urlVersion: TILE_CACHE_VERSION,
    urlVersionWhy: 'the cache version is part of the tile path. A browser that cached tiles from an earlier source cannot serve them here, because it has never requested this URL. The unversioned /tiles/<style>/... shape still answers for an open tab but is sent with no-store.',
    source: primary.name,
    keyRequired: false,
    /* the filter belongs to the SOURCE, not to the config: Esri light grey is
       already grey and must not be filtered twice; OSM standard is full colour
       and is greyed on the tile pane in the browser. */
    filter: primary.filter || null,
    filterWhy: primary.filter
      ? 'This source serves full-colour tiles. The filter is applied to the Leaflet tile pane only, so the basemap reads as a light grey canvas under the choropleth. No tile is altered on the server and no styled-tile account is involved.'
      : 'This source is already a light grey canvas, so no filter is applied.',
    attribution: primary.attribution + ' · Imagery © Esri, Maxar, Earthstar Geographics',
    licence: primary.licence,
    fallbacks: TILE_SOURCES.light.chain.filter(c => c.name !== primary.name).map(c => ({ name: c.name, blocked: guardOf(c.name).blocked || null })),
  });
}
/* v91.17.4 · SELF-TEST. The watermark defect was invisible to every check the
   build had, because every check asked the server what it INTENDED to serve
   rather than looking at what came back. This asks for three real tiles through
   the real serve path, hashes them, and fails if any is a known refusal image
   or if all three are the same picture. It is the check that would have caught
   the original defect, so it ships. */
async function tileSelfTest(res) {
  if (process.env.NIGRAAN_TILES === '0') return json(res, 404, { error: 'tiles_disabled' });
  const PROBE = [[6, 44, 26], [6, 45, 26], [6, 44, 27]];
  const out = { schema: 'agn.tiles.selftest.v1', module: TILE_MODULE, cacheVersion: TILE_CACHE_VERSION, styles: {} };
  for (const style of Object.keys(TILE_SOURCES)) {
    const seen = [], problems = [];
    for (const [z, x, y] of PROBE) {
      const cap = { head: null, chunks: [], writeHead(c, h) { this.head = { code: c, h: h || {} }; }, end(b) { if (b) this.chunks.push(b); } };
      try { await serveTile(cap, style, String(z), String(x), String(y)); } catch (e) { problems.push(z + '/' + x + '/' + y + ': ' + (e && e.message || e)); continue; }
      const buf = Buffer.concat(cap.chunks.map((c) => Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
      if (!cap.head || cap.head.code !== 200 || !buf.length) { problems.push(z + '/' + x + '/' + y + ': no tile (' + (cap.head && cap.head.code) + ')'); continue; }
      const h = createHash('sha256').update(buf).digest('hex');
      if (TILE_REFUSALS.has(h)) problems.push(z + '/' + x + '/' + y + ': REFUSAL IMAGE \u2014 ' + TILE_REFUSALS.get(h));
      seen.push({ tile: z + '/' + x + '/' + y, bytes: buf.length, sha256: h.slice(0, 16),
                  source: cap.head.h['x-agn-tile-source'], cache: cap.head.h['x-agn-tile-cache'], type: cap.head.h['content-type'] });
    }
    const distinct = new Set(seen.map((t) => t.sha256)).size;
    if (seen.length >= 3 && distinct === 1) problems.push('all three coordinates returned the SAME image, which is a placard rather than a map');
    out.styles[style] = { tiles: seen, distinctImages: distinct, pass: problems.length === 0 && seen.length === PROBE.length, problems };
  }
  /* v91.17.5 · the client-facing URL must carry the cache version, or a browser
     that cached tiles from an earlier source keeps serving them out of its own
     cache and never asks this server anything. That defect survived two
     server-side fixes and every server-side check, because a server cannot see
     a client cache. The structural guarantee is checked here instead. */
  out.urlVersion = TILE_CACHE_VERSION;
  out.clientTemplate = '/tiles/' + TILE_CACHE_VERSION + '/light/{z}/{x}/{y}';
  out.urlVersioned = /^\/tiles\/v\d+\//.test(out.clientTemplate);
  if (!out.urlVersioned) out.styles.light.problems.push('the client tile template carries no cache version, so a browser holding tiles from an earlier source would never re-request them');
  out.pass = Object.values(out.styles).every((v) => v.pass) && out.urlVersioned;
  out.keyRequired = false;
  out.why = out.pass
    ? 'every probe tile came back from a key-free source, all three distinct, none matching a known refusal image, and the client URL carries the cache version so no browser can replay a tile from an earlier source'
    : 'at least one probe failed; see problems. The basemap must not be presented as working until this passes.';
  json(res, out.pass ? 200 : 503, out);
}

function tileStatus(res) {
  const count = (d) => { try { let n = 0; const walk = (p) => { for (const e of readdirSync(p, { withFileTypes: true })) { if (e.isDirectory()) walk(join(p, e.name)); else if (!e.name.endsWith('.src')) n++; } }; walk(join(TILE_DIR, d)); return n; } catch { return 0; } };
  json(res, 200, {
    schema: 'agn.tiles.status.v1', cacheVersion: TILE_CACHE_VERSION, dir: 'data/tiles',
    styles: Object.fromEntries(Object.entries(TILE_SOURCES).map(([k, s]) => [k, {
      chain: s.chain.map(c => c.name), ...TILE_STATE[k], cachedTiles: count(s.dir),
    }])),
    keyRequired: false,
    note: 'No basemap source in the chain needs an API key or account, so no tile can ever carry a key watermark. The chain is tried in order and the source that answered is named in served. Cached tiles record which upstream produced them, so a source change can never reuse the previous provider tiles.',
  });
}

/* A browser on this machine can reach a localhost server from any page it has open, so
   "it only listens on loopback" is not by itself a control. Requests must arrive with a
   Host header naming this server, and anything that changes state must not be a plain
   cross-site form post. */
const HOST_OK = (req) => {
  const h = String(req.headers.host || '').toLowerCase();
  if (!h) return false;
  const name = h.startsWith('[') ? h.slice(1, h.indexOf(']') > 0 ? h.indexOf(']') : h.length) : h.replace(/:\d+$/, '');   /* v91.17.279 · OPS-09 · [::1]:8787 was cut to "[" (421) */
  return name === 'localhost' || name === '127.0.0.1' || name === '::1' || name === HOST.toLowerCase()
    || process.env.NIGRAAN_ALLOW_HOSTS === '*'
    || String(process.env.NIGRAAN_ALLOW_HOSTS || '').split(',').map(x => x.trim().toLowerCase()).includes(name);
};
const SAFE_ORIGIN = (req) => {
  const o = req.headers.origin || req.headers.referer;
  if (!o) return true;                    /* same-origin fetches and curl send none */
  try { const u = new URL(o); return HOST_OK({ headers: { host: u.host } }); } catch { return false; }
};

/* v91.17.34 · AUDIT A1/A2 · the gate that protected /px now covers every /api route, GET included:
   /api/geo/search and /api/limits/catchment (and then /api/report/pointrun, since a part of the place record: point.mjs) each spend paid provider calls and
   answered a cross-site GET. And the handler body is wrapped: a malformed percent-escape or a
   non-JSON POST body used to throw past the handler, the rejection went to process.on('unhandledRejection'),
   and the socket hung open until the client gave up. */
const CROSS_SITE = (req) => { const sfs = String(req.headers['sec-fetch-site'] || '').toLowerCase(); return sfs === 'cross-site' || sfs === 'same-site' || !SAFE_ORIGIN(req); };
/* ══ v91.17.144 · B5 · IDENTICAL REQUESTS IN FLIGHT ARE ANSWERED ONCE ══════════════════════════════════════════════════
   The laptop log showed the event loop blocked for 2 s or more about a thousand times a day, nearly always while several copies of
   the same forecast or national-layer request were being corrected at once (two pages, the engine and the map asking for the same
   thing within a second). A GET that is already being answered is now not computed again: the second caller waits for the first
   answer and receives the same bytes (status, headers, body). The key carries everything that can change the answer: the full URL,
   the compression asked for, the conditional tag, the origin signals and whether the socket is this machine. Nothing is kept after
   the answer is sent (no cache is added); an answer larger than 32 MB, a streamed or failed answer, sends the waiters through the
   normal path instead. NIGRAAN_DEDUPE=0 switches it off. */

const LOOP_H = monitorEventLoopDelay({ resolution: 10 }); LOOP_H.enable(); let LOOP_SINCE = new Date().toISOString();
const QBR = { day: null, by: {} };
/* ══ v91.17.270 · OPS A8 · THE PER-CALLER DAILY RECORD IS KEPT ON DISK ═══════════════════════════════════════════════════════════════
   QBR (who spends the provider budget: weighted calls per caller tag, per UTC day, the provider's quota day) lived in memory only and
   started again from zero at every restart and every deploy swap, so the laptop's split between the page sweeps, the server's own jobs
   and the learning scripts was never seen for a whole day (PERF A8: the /px route is ~90 % of the budget on a median day).
   Now each server appends what it counted since its last write to data/quota-callers/qbr-YYYY-MM-DD.jsonl (one line: at, pid, port, and
   per caller [calls, weighted, locations, failed]): every 15 minutes when something changed, at the day's end (before the counts start
   again) and when the server stops or is retired by a deploy (drain). Append only: the old and the new server of a swap never overwrite
   each other's lines. /api/quota/breakdown adds the day's file to what this server has not written yet (?day=YYYY-MM-DD for an earlier
   day). The backend's own provider calls are in it too now ('backend <module> · <host> <path>', provider.mjs hooks). Measured size:
   CHANGES.md (OPS A8). A standby server (before the hand-over) writes nothing. */
const QBR_DIR = join(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), 'quota-callers');
const QBR_DONE = { day: null, by: {} };   /* what this process has already written for QBR.day */
const qbrFile = (day) => join(QBR_DIR, 'qbr-' + day + '.jsonl');
const r2q = (x) => Math.round(x * 100) / 100;
function qbrFlush(why) {
  if (!QBR.day) return 0;
  try { const st = backend.app.store; if (st.standby && st.standby() && !backend.app.draining) return 0; } catch (_) {}
  if (QBR_DONE.day !== QBR.day) { QBR_DONE.day = QBR.day; QBR_DONE.by = {}; }
  const out = {}; let n = 0;
  for (const [k, e] of Object.entries(QBR.by)) { const d = QBR_DONE.by[k] || [0, 0, 0, 0];
    const x = [e.calls - d[0], r2q(e.weighted - d[1]), e.locations - d[2], e.failed - d[3]];
    if (x[0] || x[1] || x[2] || x[3]) { out[k] = x; n++; } }
  if (!n) return 0;
  try { mkdirSync(QBR_DIR, { recursive: true });
    appendFileSync(qbrFile(QBR.day), JSON.stringify({ at: new Date().toISOString(), pid: process.pid, port: Number(PORT), why, by: out }) + '\n');
    for (const [k, e] of Object.entries(QBR.by)) QBR_DONE.by[k] = [e.calls, e.weighted, e.locations, e.failed];
  } catch (e) { logLine('quota', 'per-caller record not written', e && e.message); return 0; }
  return n;
}
/* the day changed: what is left of the old day is written first, then the counts start again (each of the four counting places calls this) */
/* v91.17.283.10 · budget · the per-caller record (data/quota-callers) missed the proxy's own billed calls made outside the request path: the
   sweep refresh and its changed-member splice, the zone members and the national-pool members. They were counted in the day's total
   (noteProxyCall) but not by caller, so the per-caller file summed to a fraction of the bill (21 Oct: 'sweep refresh' 64.5 k in the store's
   per-tag counter, absent from the file). Accounting only: no request or answer changes. */
function qbrAdd(tag, host, path, w, locs, ok) { try { const day = new Date().toISOString().slice(0, 10); qbrRoll(day);
  const t = tag + ' · ' + String(host).replace('-api.open-meteo.com', '').replace('api.open-meteo.com', 'forecast') + ' ' + path;
  const e = QBR.by[t] || (QBR.by[t] = { calls: 0, weighted: 0, locations: 0, failed: 0 }); e.calls++; e.weighted += w; e.locations += locs || 1; if (!ok) e.failed++; } catch (_) {} }
function qbrRoll(day) { if (QBR.day === day) return; if (QBR.day) qbrFlush('day end'); QBR.day = day; QBR.by = {}; }
/* the day's record: every line of the file (all servers) plus what this server counted and has not written yet */
function qbrDay(day) {
  const by = {}; const add = (k, c, w, l, f) => { const e = by[k] || (by[k] = { calls: 0, weighted: 0, locations: 0, failed: 0 }); e.calls += c; e.weighted += w; e.locations += l; e.failed += f; };
  let lines = 0, bad = 0, servers = new Set();
  try { if (existsSync(qbrFile(day))) for (const ln of readFileSync(qbrFile(day), 'utf8').split('\n')) { if (!ln.trim()) continue; let o = null; try { o = JSON.parse(ln); } catch (_) { bad++; continue; }
    lines++; servers.add(o.pid); for (const [k, x] of Object.entries(o.by || {})) add(k, x[0] || 0, x[1] || 0, x[2] || 0, x[3] || 0); } } catch (_) {}
  if (day === QBR.day) { const D = QBR_DONE.day === day ? QBR_DONE.by : {}; for (const [k, e] of Object.entries(QBR.by)) { const d = D[k] || [0, 0, 0, 0]; add(k, e.calls - d[0], e.weighted - d[1], e.locations - d[2], e.failed - d[3]); } }
  return { by, lines, unreadable: bad, servers: servers.size };
}
{ const t = setInterval(() => qbrFlush('15 min'), 15 * 60e3); t.unref?.(); }
try { backend.app.provider.hooks.onCall = (c) => { qbrRoll(new Date().toISOString().slice(0, 10));
  const tag = 'backend ' + String(c.caller || '?').replace(/\.m?js$/, '') + ' · ' + c.kind + ' ' + c.path;
  const e = QBR.by[tag] || (QBR.by[tag] = { calls: 0, weighted: 0, locations: 0, failed: 0 }); e.calls++; e.weighted += c.weighted; e.locations += c.locations || 1; if (!c.ok) e.failed++; }; } catch (_) {}
/* v91.17.269 · INFRA A7 · one reported call of a learning script (see /api/quota/note) */
function noteLearnCall(o) {
  let u; try { u = new URL(String(o && o.url || '')); } catch (_) { return null; }
  if (u.protocol !== 'https:' || !/(^|\.)open-meteo\.com$/.test(u.hostname)) return null;
  u.searchParams.delete('apikey');   /* never kept, never logged */
  const n = Math.max(1, Math.min(1000, Math.floor(Number(o.n) || 1))), ok = o.ok !== false;
  const w1 = weightOf((k) => u.searchParams.get(k), null, { ensemble: u.pathname === '/v1/ensemble' });
  let win = null; try { const P = backend.app.provider; for (let i = 0; i < n; i++) win = P.noteProxyCall(w1, ok);
    if (win) { win.learnCalls = (win.learnCalls || 0) + n; win.learnWeighted = Math.round((win.learnWeighted || 0) + w1 * n); } } catch (_) {}
  try { const day = new Date().toISOString().slice(0, 10); qbrRoll(day);
    const caller = String(o.caller || 'script').replace(/[^\w .:-]/g, '').slice(0, 40) || 'script';
    const tag = 'learn ' + caller + ' · ' + u.hostname.replace('-api.open-meteo.com', '').replace('api.open-meteo.com', 'forecast').replace(/^customer-/, '') + ' ' + u.pathname;
    const e = QBR.by[tag] || (QBR.by[tag] = { calls: 0, weighted: 0, locations: 0, failed: 0 }); e.calls += n; e.weighted += w1 * n;
    e.locations += n * ((u.searchParams.get('latitude') || '').split(',').filter(Boolean).length || 1); if (!ok) e.failed += n; } catch (_) {}
  let over = false; try { over = !!backend.app.provider.overBudget(); } catch (_) {}
  return { ok: true, weighted: Math.round(w1 * n * 100) / 100, calls: n, day: win ? win.day : null, usedToday: win ? (win.backendWeighted || 0) + (win.browserWeighted || 0) : null,
    dailyLimit: (() => { try { return backend.app.provider.dailyLimit || null; } catch (_) { return null; } })(), overBudget: over };
}
/* the calls a learning script could not report while this server was down (data/run/learn-calls.pending.jsonl), added once */
let _learnPendingBusy = false;
function learnPendingIngest() {
  if (_learnPendingBusy || !isActiveServer()) return; _learnPendingBusy = true;
  const f = join(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), 'run', 'learn-calls.pending.jsonl'), t = f + '.' + process.pid + '.ingesting';
  try { if (!existsSync(f)) return; renameSync(f, t); let n = 0, bad = 0;
    for (const line of readFileSync(t, 'utf8').split(/\r?\n/)) { if (!line.trim()) continue; let o = null; try { o = JSON.parse(line); } catch (_) {} if (o && noteLearnCall(o)) n++; else bad++; }
    rmSync(t, { force: true }); logLine('quota', 'learn calls added from the pending file', n, 'lines', bad ? bad + ' unreadable' : '');
  } catch (e) { logLine('quota', 'pending learn calls not read', e && e.message); }
  finally { _learnPendingBusy = false; }
}
setInterval(learnPendingIngest, 60e3).unref?.();
/* v91.17.269 · INFRA A7 · the main forecast's outage state (see serveSecondary in the provider proxy). Only the forecast host counts: 3 failed
   calls (no answer, timeout, 5xx) within 2 minutes with no answer between them open a 2-minute window; any answer below 500 closes it. */
const OM_OUTAGE = { fails: [], until: 0, opened: 0, lastOpen: null,
  note(host, ok, status) { if (host !== 'api.open-meteo.com') return; const t = Date.now();
    if (ok) { if (this.fails.length || this.until) { if (this.until) logLine('provider', 'main forecast answers again (status ' + status + '); outage window closed'); this.fails.length = 0; this.until = 0; } return; }
    this.fails = this.fails.filter((x) => t - x < 120e3); this.fails.push(t);
    if (this.fails.length >= 3 && t >= this.until) { const win = Math.max(1, Number(process.env.NIGRAAN_OUTAGE_WINDOW_S) || 120) * 1000;   /* env: tests only */
      this.until = t + win; this.opened++; this.lastOpen = new Date(t).toISOString(); logLine('provider', 'main forecast outage (' + this.fails.length + ' failed calls in 2 min): point requests use the secondary forecast for ' + Math.round(win / 1000) + ' s'); } },
  active() { return Date.now() < this.until; } };
const INFLIGHT = new Map();
function dedupeKey(req) {
  if (req.method !== 'GET' || process.env.NIGRAAN_DEDUPE === '0') return null;
  const u = String(req.url || ''); if (!/^\/(px|api)\//.test(u)) return null;
  if (/^\/api\/(health|v1\/health|operator\/|events|selftest)/.test(u)) return null;
  const h = req.headers; const loop = LOOPBACK_ADDR(req.socket && req.socket.remoteAddress) ? 'L' : 'R';
  return [u, h['accept-encoding'] || '', h['if-none-match'] || '', h['sec-fetch-site'] || '', h.origin || '', h.referer || '', h.host || '', h['x-agn-internal'] || '',
          h.authorization ? 'A' : '', h.cookie ? 'C' : '', String(h['x-agn-view'] || ''), String(h['x-agn-qa'] || ''), PROXY_HEADERS.filter((x) => h[x] != null).join(','), loop,
          String(h['x-agn-via-proxy'] || ''), String(h['x-agn-proxy-client'] || '')].join('\u0001');   /* v283.23 self-audit P5: a relayed request never shares a local operator's answer */
}
function dedupeLead(key, res) {
  const e = { waiters: [], status: 0, headers: null, chunks: [], size: 0, ok: true };
  INFLIGHT.set(key, e);
  const raw = { writeHead: res.writeHead, write: res.write, end: res.end };
  const grab = () => { if (!e.headers) { e.status = res.statusCode; e.headers = res.getHeaders(); } };
  const keep = (c, enc) => { if (c == null || !e.ok) return; const b = Buffer.isBuffer(c) ? c : (typeof c === 'string' ? Buffer.from(c, typeof enc === 'string' ? enc : 'utf8') : (c instanceof Uint8Array ? Buffer.from(c) : null));
    if (!b) { e.ok = false; return; } e.size += b.length; if (e.size > 32 * 1048576) { e.ok = false; e.chunks = []; return; } e.chunks.push(b); };
  res.writeHead = function (code, a, b) { const before = res.getHeaders(); const r = raw.writeHead.apply(res, arguments); e.status = code;
    const h = (a && typeof a === 'object') ? a : ((b && typeof b === 'object') ? b : null); const m = { ...before };
    if (Array.isArray(h)) { for (let i = 0; i + 1 < h.length; i += 2) m[String(h[i]).toLowerCase()] = h[i + 1]; } else if (h) for (const k of Object.keys(h)) m[k.toLowerCase()] = h[k];
    e.headers = m; return r; };
  res.write = function (c, enc) { grab(); keep(c, enc); return raw.write.apply(res, arguments); };
  res.end = function (c, enc) { grab(); if (typeof c !== 'function') keep(c, enc); return raw.end.apply(res, arguments); };
  const settle = () => { if (INFLIGHT.get(key) !== e) return; INFLIGHT.delete(key);
    const done = res.writableFinished && e.ok && e.headers;
    for (const w of e.waiters) { if (done) { try { const hd = { ...e.headers, 'x-agn-shared': '1' }; w.res.writeHead(e.status, hd); w.res.end(Buffer.concat(e.chunks)); } catch (_) {} } else w.retry(); } };
  res.on('finish', settle); res.on('close', settle);
}
/* ══ v91.17.283.1 · NO AGENCY NAME IN A CUSTOMER /api ANSWER, WHATEVER ROUTE OR DATA FILE IT COMES FROM ══════════════════════════════
   Owner rule: PMD and FFD are never named to clients (internal only). The permanent lint (N2) found them on the laptop in answers that pass
   data-file text through (site operations, drought map, pool rule / point). Every /api answer of a customer request (backend customerView:
   x-agn-view customer, or neither the operator on this computer nor a signed operator nor internal naming) goes through agencyBody
   (customerscrub.mjs) here, the same writeHead + end point the wire compression uses; this wrapper sits outside it, so the body is
   rewritten before it is encoded. A body without a name is sent byte for byte; a streamed answer (write()) passes through as before and
   the routes that stream keep their own customerScrub. Operator and internal answers are never touched. */
function installAgencyScrub(req, res) {
  let p = ''; try { p = new URL(req.url, 'http://localhost').pathname; } catch (_) { return; }
  if (!p.startsWith('/api/') || req.method === 'HEAD') return;
  let cust = true; try { cust = backend.customerView ? !!backend.customerView(req) : true; } catch (_) { cust = true; }
  if (!cust) return;
  const raw = { writeHead: res.writeHead, write: res.write, end: res.end, bypass: res.agnBypass };
  let held = null;
  const restore = () => { res.writeHead = raw.writeHead; res.write = raw.write; res.end = raw.end; res.agnBypass = raw.bypass; };
  const flushHead = () => { if (held) { const h = held; held = null; raw.writeHead.apply(res, h); } };
  res.agnBypass = () => { flushHead(); restore(); if (typeof raw.bypass === 'function') raw.bypass(); };
  res.writeHead = function (code, a, b) { held = [code, a, b].filter((x) => x !== undefined); return res; };
  res.write = function (...args) { flushHead(); restore(); return raw.write.apply(res, args); };
  res.end = function (body, ...rest) {
    restore();
    const buf = body == null || typeof body === 'function' ? null : (Buffer.isBuffer(body) ? body : (typeof body === 'string' ? Buffer.from(body) : null));
    const h0 = held; held = null;
    const code = h0 ? h0[0] : res.statusCode, a = h0 ? h0[1] : undefined, b = h0 ? h0[2] : undefined;
    if (res.__agnClean) { if (h0) raw.writeHead.apply(res, h0); return raw.end.call(res, body, ...rest); }   /* v283.38 item 4: bytes already scrubbed for the customer (the kept district answer) */
    const hdrs = Object.assign({}, typeof a === 'object' && a && !Array.isArray(a) ? a : (typeof b === 'object' && b && !Array.isArray(b) ? b : {}));
    const lk = (n) => Object.keys(hdrs).find((x) => x.toLowerCase() === n);
    const type = String(hdrs[lk('content-type')] || res.getHeader('content-type') || '');
    const enc = hdrs[lk('content-encoding')] || res.getHeader('content-encoding');
    let out = null;
    if (buf && buf.length && !enc && /json|^text\//i.test(type)) { try { out = agencyBody(buf, type, { licence: p === '/api/sources' || p.startsWith('/api/sources/') }); } catch (_) { out = null; } }   /* v283.28 S8: the licence register keeps its credits */
    if (!out) { if (h0) raw.writeHead.apply(res, h0); return raw.end.call(res, body, ...rest); }
    const cl = lk('content-length'); if (cl) hdrs[cl] = out.length; else if (res.getHeader('content-length') != null) res.setHeader('content-length', out.length);
    if (h0) raw.writeHead.call(res, code, ...(typeof a === 'string' ? [a, hdrs] : [hdrs]));
    return raw.end.call(res, out, ...rest.filter((x) => typeof x === 'function'));
  };
}
function serve(req, res) { return (async () => {
  try { try { edgeCacheWrap(req, res, String(req.url || '').split('?')[0]); } catch (_) {}   /* before installCompression, so agnBypass() restores THIS wrapper, not the bare socket (static files call agnBypass) */
    installCompression(req, res); installAgencyScrub(req, res); await handleRequest(req, res); }
  catch (e) {
    logLine('request error', req.method, String(req.url).slice(0, 120), e && e.message);
    if (!res.headersSent) json(res, e && e.status >= 400 && e.status < 600 ? e.status : 500, { error: e && e.code ? String(e.code).toLowerCase() : 'request_failed', why: e && e.message ? String(e.message).slice(0, 200) : 'the request could not be handled' });
    else try { res.end(); } catch {}
  }
})(); }
/* ══ v91.17.269 · PERF A2 · NO CUSTOMER BEFORE THE SERVER IS WARM ═══════════════════════════════════════════════════════════════════
   From the moment the port is open until the warm-up has finished (listen callback below), /health (and /api/health, /api/v1/health)
   answers at once with status "starting" and warm:false, and every other request waits for the warm-up and is then answered as usual
   (nothing is refused). A front proxy or a deploy script switches to this server when /health says warm:true. A warm-up that has not
   finished after NIGRAAN_WARM_MAX_S (default 120 s) lets the waiting requests through anyway. */
const WARM = { ready: false, t0: Date.now(), ms: null, waiting: [] };
const HEALTH_PATHS = new Set(['/health', '/api/health', '/api/v1/health', '/api/api/v1/health']);
function startingHealth(res) { const b = Buffer.from(JSON.stringify({ status: 'starting', warm: false, service: 'nigraan-local', startedMsAgo: Date.now() - WARM.t0, steps: (backend.app.warm && backend.app.warm.steps) || {}, time: new Date().toISOString() }));
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': b.length, 'cache-control': 'no-store' }); res.end(b); }
setTimeout(() => { if (!WARM.ready) { WARM.ready = true; WARM.ms = Date.now() - WARM.t0; for (const go of WARM.waiting.splice(0)) go(); logLine('warm-up not finished after the limit; customers taken'); } }, Math.max(10, Number(process.env.NIGRAAN_WARM_MAX_S) || 120) * 1000).unref();
/* ══ v91.17.279 · OPS-06 · NAMED ESSENTIALS BEFORE warm:true ═════════════════════════════════════════════════════════════════════
   warm:true used to mean "every warm-up step was tried" (errors swallowed), and a build without the provider key was promoted. Now /health
   says warm:true only when these pass, asked through this server's own port before customers are taken: the provider is configured; the
   store is the writer (or a standby that will take over; not read-only for a broken database); the main page is served; a point forecast
   answers (Islamabad); a levels layer answers. A failure keeps warm:false with warmFailed naming it, so the supervisor never switches to it. */
const WARMCHECK_TOKEN = randomBytes(16).toString('hex');
function selfGet(path, ms) {
  return new Promise((resolve) => { const r = http.get({ host: '127.0.0.1', port: PORT, path, agent: false, timeout: ms, headers: { host: 'localhost:' + PORT, 'x-agn-internal': 'warmcheck', 'x-agn-warmcheck': WARMCHECK_TOKEN, 'accept-encoding': 'identity' } }, (x) => {
    const b = []; x.on('data', (c) => b.push(c)); x.on('end', () => resolve({ status: x.statusCode, body: Buffer.concat(b), location: x.headers.location || null })); x.on('error', () => resolve({ status: 0 })); });
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, why: 'timeout' }); }); r.on('error', (e) => resolve({ status: 0, why: e && e.code })); });
}
async function warmEssentials() {
  const A = backend.app, checks = {}, MS = Math.max(5, Number(process.env.NIGRAAN_WARM_CHECK_S) || 90) * 1000;
  let tk = Date.now(); const put = (k, ok, why) => { const ms = Date.now() - tk; tk = Date.now(); checks[k] = ok ? { ok: true, ms } : { ok: false, ms, why: String(why || 'failed').slice(0, 200) }; };
  try { const c = A.provider && A.provider.configured && A.provider.configured(); put('provider', !!c, 'no forecast provider key is configured'); } catch (e) { put('provider', false, e.message); }
  try { const st = A.store, ro = st.readOnly && st.readOnly(), sb = st.standby && st.standby(); put('writer', !ro || !!sb, 'the store is read-only: ' + ro); } catch (e) { put('writer', false, e.message); }
  /* r42 · 1.0.6 · the page check knows the React index (server/api/pagecheck42.mjs); the classic rule is unchanged */
  let pc = null; try { pc = await pageEssential(selfGet, MS, { react: reactSwitch(true) }); } catch (e) { pc = { ok: false, why: 'page check: ' + e.message }; }
  put('page', pc.ok, pc.why);
  const jsonOk = (r) => { if (r.status !== 200) return false; try { const j = JSON.parse(r.body.toString('utf8')); return !!j && typeof j === 'object' && !j.error; } catch (_) { return false; } };
  /* v91.17.283.19 · the corrected record the pages read (GET /api/point/batch, the record of the place bundle) at the place table's first
     town (no coordinate written in code) */
  let town = null; try { town = A.places && A.places.towns ? A.places.towns()[0] : null; } catch (_) { town = null; }
  /* a server without a place table (a throw-away test data folder): the first undisputed unit of the AGN unit index (server/contract) */
  if (!town) { try { town = JSON.parse(readFileSync(join(ROOT, 'server', 'contract', 'units.json'), 'utf8')).find((u) => u && !u.disputed && Number.isFinite(u.lat) && Number.isFinite(u.lon)) || null; } catch (_) { town = null; } }
  const pt = town ? await selfGet('/api/point/batch?pts=' + town.lat + ',' + town.lon, MS) : { status: 0, why: 'the place table has no town' };
  put('point', jsonOk(pt), 'GET /api/point/batch answered ' + (pt.status || pt.why || 'nothing'));
  const lv = await selfGet('/api/levels?layer=heat&day=0', MS);
  put('levels', jsonOk(lv), 'GET /api/levels answered ' + (lv.status || lv.why || 'nothing'));
  return { ok: Object.values(checks).every((c) => c.ok), checks, at: new Date().toISOString() };
}
const server = http.createServer((req, res) => {
  /* v91.17.273.1 · the last customer request (not /health, not the server's own internal calls): the accuracy monitor's first-start backfill waits for 5 quiet minutes */
  try { if (!req.headers['x-agn-internal'] && !HEALTH_PATHS.has(String(req.url || '').split('?')[0]) && backend.app) backend.app.lastCustomerAt = Date.now(); } catch (_) {}
  if (!WARM.ready) { if (HEALTH_PATHS.has(String(req.url || '').split('?')[0])) return startingHealth(res);
    if (req.headers['x-agn-warmcheck'] === WARMCHECK_TOKEN && LOOPBACK_ADDR(req.socket && req.socket.remoteAddress)) return onRequest(req, res);   /* v91.17.279 · OPS-06 · the essentials check's own requests */
    /* v91.17.283.19 · and the provider requests this server makes for them (the point state's own /px call carries the runtime token):
       they were held behind the warm-up they are part of until the check timed out */
    if (process.env.NIGRAAN_INTERNAL_TOKEN && req.headers['x-agn-internal-token'] === process.env.NIGRAAN_INTERNAL_TOKEN && LOOPBACK_ADDR(req.socket && req.socket.remoteAddress)) return onRequest(req, res);
    WARM.waiting.push(() => onRequest(req, res)); return; }
  return onRequest(req, res);
});
function onRequest(req, res) {
  /* v91.17.283 · WS1 · owner decision C · the budget class of every provider call this request makes: its x-agn-internal tag (no tag = a
     person's page = user; data/provider-budget.json userTags names the internal callers that serve a person) */
  let cls = 'user', tag = null; try { const cb = CB(); if (cb) cls = cb.classOfTag(req.headers['x-agn-internal']); const it = String(req.headers['x-agn-internal'] || '').slice(0, 40);
    if (it) tag = it; else { let rp = '?'; try { rp = new URL(String(req.headers.referer || '')).pathname; } catch (_) {} tag = 'page ' + rp; } } catch (_) {}   /* the tag as in the per-caller record (QBR) */
  /* v91.17.283.53 · C · x-agn-priority: low (the point state's nearby lists and sweeps, loopback only): this request's provider calls are paced
     as background and its correction waits behind a person's (the budget class and every value are unchanged) */
  const low = String(req.headers['x-agn-priority'] || '') === 'low' && LOOPBACK_ADDR(req.socket && req.socket.remoteAddress);
  return CB_ALS.run({ cls, tag, ...(low ? { low: true } : {}) }, () => onRequest0(req, res));
}
function onRequest0(req, res) {
  const key = dedupeKey(req);
  if (key) { const e = INFLIGHT.get(key); if (e) { e.waiters.push({ res, retry: () => serve(req, res) }); return; } dedupeLead(key, res); }
  return serve(req, res);
}
/* The built React app (web/dist) is the page at /, /analyst, /customize and /dashboard.
   /ui/* redirects onto those addresses. /n3 stays the sealed Customize document
   the React route frames, and /classic plus /?operator stay the old console. */
function serveBuiltReact(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const UI = join(ROOT, 'web', 'dist');
  const index = join(UI, 'index.html');
  if (!existsSync(index)) return false;
  const p = url.pathname;
  let path = p;
  if (path === '/ui') path = '/';
  else if (path.startsWith('/ui/')) path = path.slice(3) || '/';
  const consoleHome = path === '/' && CONSOLE_Q.some((k) => url.searchParams.has(k));
  const bare = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  const page = !consoleHome && (bare === '/' || bare === '/analyst' || bare === '/customize' || bare === '/dashboard');
  if (p !== path && page) {
    res.writeHead(302, { location: bare + (url.search || '') });
    res.end();
    return true;
  }
  if (page) return serveFile(res, index, req);
  if (path.startsWith('/assets/') || path === '/agn-logo.png') {
    let rel;
    try { rel = decodeURIComponent(path.slice(1)); }
    catch { json(res, 400, { error: 'bad_request_uri' }); return true; }
    const f = join(UI, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!(f === UI || f.startsWith(UI + sep)) || !existsSync(f) || !statSync(f).isFile()) {
      json(res, 404, { error: 'not_found', path: p, why: 'web/dist is not built' });
      return true;
    }
    return serveFile(res, f, req);
  }
  return false;
}
/* v91.17.283.54 · production edge cache · the public page is served from Vercel, whose rewrites relay every API call through the
   Oracle edge and a Tailscale link (~0.6 s per request). A public GET answer carries s-maxage so the Vercel CDN serves repeats
   from its own edge: the browser still revalidates (max-age=0), and a tokened (operator) or non-GET request is never cached. */
const EDGE_TTL_RULES = [
  [/^\/n3\/[^/]+\.(json|geojson)$/, [3600, 86400]],      // sealed geo tables (tehsils, rivers): change only on a data release
  [/^\/agn-[a-z0-9.-]+\.(js|css)$/, [3600, 86400]],      // hour-strip / place-search UI scripts served by the Node process
  [/^\/tiles\//, [86400, 604800]],                       // basemap and overlay tiles
  [/^\/api\/levels$/, [240, 900]],                       // issued hazard levels (published on a schedule)
  [/^\/api\/registry\/levels$/, [3600, 86400]],          // the legend registry
  [/^\/api\/alerts$/, [60, 300]],
  [/^\/api\/hazardgrid$/, [300, 900]],
  [/^\/api\/(outlook|smog|flood|glof)\/[a-z/]*$/, [300, 1800]],   // GET status/national/seasonal reads
  [/^\/api\/geo\/search$/, [3600, 86400]],               // the place table is static between releases
  [/^\/api\/ai\/status$/, [300, 900]],
  [/^\/api\/(skill|checks|verdicts)$/, [120, 600]],
  [/^\/health$/, [30, 120]],
  [/^\/api\/(point|point\/batch|pool\/point|pointstate\/product|ecmwf010\/point)$/, [120, 600]],   // keyed by full query (place), short so the page stays near-live
];
function edgeCacheWrap(req, res, path) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return;
  if (req.headers.authorization || req.headers.cookie || String(req.headers['x-agn-view'] || '') === 'operator') return;
  let ttl = null; for (const [re, t] of EDGE_TTL_RULES) if (re.test(path)) { ttl = t; break; }
  if (!ttl) return;
  const cc = 'public, max-age=0, s-maxage=' + ttl[0] + ', stale-while-revalidate=' + ttl[1];
  const orig = res.writeHead;
  res.writeHead = function (status, a, b) {
    if (status === 200) {
      const headers = (a && typeof a === 'object' && !Array.isArray(a)) ? a : (b && typeof b === 'object' && !Array.isArray(b)) ? b : null;
      if (headers) { for (const k of Object.keys(headers)) if (String(k).toLowerCase() === 'cache-control') delete headers[k]; headers['cache-control'] = cc; }
      else { try { res.setHeader('cache-control', cc); } catch (_) {} }
    }
    return orig.call(this, status, a, b);
  };
}
async function handleRequest(req, res) {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch { return json(res, 400, { error: 'bad_request_uri' }); }
  if (!HOST_OK(req)) return json(res, 421, { error: 'host_not_allowed', why: 'This server answers only to its own host name. Set NIGRAAN_ALLOW_HOSTS to add one.' });
  if (req.method !== 'GET' && req.method !== 'HEAD' && !SAFE_ORIGIN(req)) {
    return json(res, 403, { error: 'cross_site_request_blocked', why: 'A state-changing request arrived from another origin.' });
  }
  const p = url.pathname;
  if ((req.method === 'GET' || req.method === 'HEAD') && (p === '/customize' || p === '/customize/' || p === '/n3' || p === '/n3/') && !dashGate().open(req)) return lockedDocument(res);
  const built = serveBuiltReact(req, res, url);
  if (built !== false) return built;
  /* v91.17.283.51 g2 · live test 51: a stored report link (/api/reports/<id>, .pdf, .json) opened in its own tab, or from a mail or chat
     message, answered 403 cross_site_request_blocked. A top-level navigation (Sec-Fetch-Mode navigate, Sec-Fetch-Dest document) to a stored
     report is a read of a stored file: it spends no provider call, and another site cannot read the answer of a navigation, so it is let
     through. Every other cross-site request, every POST (the state-changing check above) and every fetch() from another site stay blocked. */
  const REPORT_NAV = (req.method === 'GET' || req.method === 'HEAD') && /^\/api\/reports\/[A-Za-z0-9_-]{6,80}(?:\.pdf|\.json)?$/.test(p)
    && String(req.headers['sec-fetch-mode'] || '').toLowerCase() === 'navigate' && /^(?:document|)$/.test(String(req.headers['sec-fetch-dest'] || '').toLowerCase());
  if (p.startsWith('/api/') && p !== '/api/health' && p !== '/api/v1/health' && p !== '/api/api/v1/health' && !REPORT_NAV && CROSS_SITE(req)) {
    return json(res, 403, { error: 'cross_site_request_blocked', provider: 'MACH forecast', why: 'This server answers its own dashboard only, and this request came from another site.' });
  }

  /* v91.17.207 · phase B · every API answer names the analysis snapshot it was made in (code + tables + forecast inputs, snapshot.mjs) */
  if (p.startsWith('/api/') || p.startsWith('/px/')) { try { const sn = backend.app.snapshot && backend.app.snapshot.current(); if (sn && sn.id) res.setHeader('x-agn-snapshot', sn.id); } catch (_) {} }
  /* v91.17.283.52 · F3 · AN OPTIONAL LAYER THAT IS NOT IN THIS INSTALL IS NOT A FAILED REQUEST. The analyst page reads five optional layers on
     load (the GLOF national routing, the forecast-pool skill table, the GIRI landslide second opinion, the earthquake overlay and its feed);
     when a layer's data is not installed or its rule is not the built one, the route answers 404 / 503 with its reason, and every such
     answer was a red "Failed to load resource" line in the console on every load. A request that says the layer is optional
     (x-agn-optional: 1, sent only by those page reads) gets the SAME body ({ok:false, why}) with 200 and x-agn-optional-absent: <status>;
     the page already treats ok:false as "not available here". Other callers (monitoring, tests, the React app) keep the status. */
  if (req.method === 'GET' && OPTIONAL_PATHS.has(p) && req.headers['x-agn-optional'] === '1') { const wh = res.writeHead;
    res.writeHead = function (st, ...rest) { if (st === 404 || st === 503) { try { this.setHeader('x-agn-optional-absent', String(st)); } catch (_) {} st = 200; } return wh.call(this, st, ...rest); }; }
  if (p === '/api/snapshot' && req.method === 'GET') { try { const S = backend.app.snapshot; const id = url.searchParams.get('id');
      const rid = url.searchParams.get('report'); if (rid) { const r = S.lookupReport ? S.lookupReport(String(rid).slice(0, 80)) : { found: false }; return json(res, r.found ? 200 : 404, r.found ? r : { error: 'snapshot_not_found', ...r }); }
      if (!id) return json(res, 200, S.current()); const hit = S.lookup(id); return hit ? json(res, 200, hit) : json(res, 404, { error: 'snapshot_not_found', id, why: 'not in the snapshot archive (every month held is searched)' }); }
    catch (e) { return json(res, 500, { error: String(e.message || e) }); } }
  /* v91.17.143 · CEO 3 Oct: NIGRAAN 2 (the five-tab page) is dropped: /v5 goes to NIGRAAN. Two pages remain: NIGRAAN (/) and
     Customize NIGRAAN for AJG Supplies (/customize; /n3 is the same page). */
  if (p === '/v5' || p === '/v5/') { res.writeHead(302, { location: '/' }); return res.end(); }
  /* the AJG Supplies site list: data/clients/ajg/sites.csv on this computer (never inside the page); saved from the page on this machine only */
  if (p === '/customize/sites.json' && req.method === 'GET') { if (!dashGate().open(req)) return json(res, 403, { error: 'dashboard_token_required' }); return ajgSites(res); }
  if (p === '/customize/sites' && req.method === 'POST') { if (!dashGate().open(req)) return json(res, 403, { error: 'dashboard_token_required' }); return ajgSave(req, res); }
  /* v91.17.144 · B5 · the longest event-loop block since the last call (perf_hooks histogram, 10 ms resolution); ?reset=1 starts a window */
  /* ══ v91.17.269 · INFRA A7 · THE LEARNING SCRIPTS GO THROUGH THIS SERVER'S CALL COUNTER ══════════════════════════════════════════
     The weekly LEARN scripts that call the forecast provider themselves (rank_models, mach_history_*, landslide_backtest, soil_model_range,
     via station-lake/scripts/nigraan_calls.py) report every call here: the request URL (the key parameter is dropped unread), ok, and how
     many identical calls. The weight is computed here with the same rule as the proxy (provider.mjs weightOf) and added to today's quota
     window (browser bucket, so every existing total and MACH_DAILY_CALL_LIMIT see it; also learnCalls / learnWeighted) and to the
     breakdown (/api/quota/breakdown, "learn <script>"). When this server is down the helper appends the same line to
     data/run/learn-calls.pending.jsonl and the server adds it on its next minute. This computer only. */
  if (p === '/api/quota/note' && req.method === 'POST') {
    if (!operatorDecision(req).operator) return json(res, 403, { error: 'only from this computer' });
    let body = ''; for await (const ch of req) { body += ch; if (body.length > 64e3) return json(res, 413, { error: 'too large' }); }
    let o = null; try { o = JSON.parse(body); } catch (_) { return json(res, 422, { error: 'bad_json' }); }
    const r = noteLearnCall(o); learnPendingIngest();
    return r ? json(res, 200, r) : json(res, 422, { error: 'url must be a provider request (https://...open-meteo.com/...)' });
  }
  /* v91.17.270 · OPS A8 · the whole day from the per-caller record (all servers of the day), ?day=YYYY-MM-DD for an earlier day */
  if (p === '/api/quota/breakdown' && req.method === 'GET') { const qd = url.searchParams.get('day'); const day = /^\d{4}-\d{2}-\d{2}$/.test(qd || '') ? qd : (QBR.day || new Date().toISOString().slice(0, 10));
    const D = qbrDay(day); const rows = Object.entries(D.by).map(([k, v]) => ({ caller: k, ...v, weighted: Math.round(v.weighted) })).sort((a, b) => b.weighted - a.weighted);
    return json(res, 200, { day, rows, totalWeighted: rows.reduce((a, r) => a + r.weighted, 0), record: { file: 'data/quota-callers/qbr-' + day + '.jsonl', lines: D.lines, servers: D.servers, unreadable: D.unreadable } }); }
  if (p === '/api/loop' && req.method === 'GET') { const h = LOOP_H; const out = { maxMs: Math.round(h.max / 1e6), p99Ms: Math.round(h.percentile(99) / 1e6), meanMs: Math.round(h.mean / 1e6 * 10) / 10, since: LOOP_SINCE };
    if (url.searchParams.get('reset') === '1') { h.reset(); LOOP_SINCE = new Date().toISOString(); }
    /* v91.17.283.51 · the heap beside the loop delay (the speed and memory tests read both); ?gc=1 collects first when the server runs with --expose-gc (tests only) */
    try { if (url.searchParams.get('gc') === '1' && typeof globalThis.gc === 'function') globalThis.gc(); const m = process.memoryUsage(); out.heapMB = Math.round(m.heapUsed / 1048576); out.rssMB = Math.round(m.rss / 1048576); } catch (_) {}
    return json(res, 200, out); }
  if (p === '/favicon.ico') { res.writeHead(204, { 'cache-control': 'max-age=86400' }); return res.end(); }   /* v91.17.154 · no 404 in the console on every load */
  if (p === '/agn-ops-exp.js') { let js = ''; try { js = readFileSync(join(HERE_EXP, 'api', 'agents_exp_ui.js'), 'utf8'); } catch (_) {} res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(js); }   /* v91.17.283.10 · agents 6 and 7: the operator Health card (operator-only requests; the page file is unchanged) */
  /* v91.17.283.20 · B5: the one place search and my-location control of every page (server/api/placesearch_ui.js) */
  /* v91.17.283.22 · item 4: the one hour-by-hour strip of every page (server/api/hourstrip_ui.js and its look hourstrip_ui.css) */
  if (p === '/agn-hour-strip.js' || p === '/agn-hour-strip.css') { const css = p.endsWith('.css'); let tx = ''; try { tx = readFileSync(join(HERE_EXP, 'api', css ? 'hourstrip_ui.css' : 'hourstrip_ui.js'), 'utf8'); } catch (_) {} res.writeHead(200, { 'content-type': (css ? 'text/css' : 'text/javascript') + '; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(tx); }
  if (p === '/agn-place-search.js') { let js = ''; try { js = readFileSync(join(HERE_EXP, 'api', 'placesearch_ui.js'), 'utf8'); } catch (_) {} res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(js); }
  /* == BEGIN v91.17.283.48 · GUIDANCE ("What to do here", GUIDANCE_PANEL=1; OFF: an empty script, the page is unchanged) == */
  if (p === '/agn-guidance.css') { let tx = ''; if (process.env.GUIDANCE_PANEL === '1') { try { tx = readFileSync(join(HERE_EXP, 'api', 'guidance_ui.css'), 'utf8'); } catch (_) {} }
    res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(tx); }
  if (p === '/agn-guidance.js') { let js = '/* the "What to do here" panel is off (GUIDANCE_PANEL=1 to enable) */\n'; if (process.env.GUIDANCE_PANEL === '1') { try { js = readFileSync(join(HERE_EXP, 'api', 'guidance_ui.js'), 'utf8'); } catch (_) {} }
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(js); }
  if (process.env.GUIDANCE_PANEL === '1' && (p === '/api/guidance' || p.startsWith('/api/guidance/'))) { if (await backend.handle(req, res, url) !== false) return; }
  /* == END v91.17.283.48 · GUIDANCE == */
  if (p === '/agn-switch.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(SWITCH_JS); }
  if (p === '/agn-switch.css') { res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(SWITCH_CSS); }
  /* r41 · items 41-48 · THE REACT FRONTEND, SERVED BY THIS ONE SERVER: the built static files of the React pages (artefact/app/, made by
     `vite build`, no separate server). /app/ is the start page, /app/analyst the analyst view (one index.html, the page picks itself by
     path); a path with a file extension that is not there is a 404, any other path under /app/ gets index.html. Static files only: no
     API, no data, nothing else changes. */
  if (p === '/frontend.json' && (req.method === 'GET' || req.method === 'HEAD')) return json(res, 200, reactSwitch(true));   /* r42 · 1.0.6 */
  if (p === '/app' || p.startsWith('/app/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' });
    if (p === '/app') { res.writeHead(302, { location: '/app/' + (url.search || '') + '' }); return res.end(); }
    const APP = join(ART, 'app'); let rel = '';
    try { rel = decodeURIComponent(p.slice(5)); } catch { return json(res, 400, { error: 'bad_request_uri' }); }
    let f = join(APP, normalize(rel || 'index.html').replace(/^(\.\.[/\\])+/, ''));
    if (!(f === APP || f.startsWith(APP + sep))) return json(res, 404, { error: 'not_found', path: p });
    if (!existsSync(f) || !statSync(f).isFile()) { if (/\.[a-z0-9]{1,8}$/i.test(rel)) return json(res, 404, { error: 'not_found', path: p }); f = join(APP, 'index.html'); }
    if (!existsSync(f)) return json(res, 404, { error: 'not_found', path: p, why: 'the React build (artefact/app) is not installed' });
    return serveFile(res, f, req);
  }
  /* r42 · 1.0.6 · THE REACT PAGES AT THE OLD ADDRESSES: with NIGRAAN_REACT on (the default of this release) / , /analyst and /customize
     answer artefact/app/index.html (the page picks itself by path). The old pages stay installed and untouched: NIGRAAN_REACT=0 (the
     line in data/react.switch, read every 2 s, no restart; or the environment) serves them exactly as 1.0.5 did. / with ?operator /
     ?engine / ?backend keeps the classic console as in 1.0.5 (/classic always does). No React build installed -> the old pages. */
  if ((req.method === 'GET' || req.method === 'HEAD') && ((p === '/' && !CONSOLE_Q.some((k) => url.searchParams.has(k))) || p === '/analyst' || p === '/analyst/' || p === '/customize' || p === '/customize/') && reactSwitch().on)
    return serveFile(res, join(ART, 'app', 'index.html'), req);
  /* first load: point the artefact's connector at this same origin. It reads
     ?backend= once and remembers it; the HTML bytes are never rewritten. */
  const startHere = p === '/' && !CONSOLE_Q.some((k) => url.searchParams.has(k)) && existsSync(join(ART, START_FILE));   /* v91.17.280 · NEWPAGE */
  if (((p === '/' && uiPage() === 'classic' && !startHere) || p === '/classic' || p === '/analyst' || p === '/analyst/') && !url.searchParams.has('backend')) {   /* v91.17.134 · first-load backend; v240 · the classic console only (the new page needs none) */
    const origin = `http://${req.headers.host || HOST + ':' + PORT}`;
    /* v91.17.76 · O · the first-load redirect dropped every other parameter, so ?operator=1 never reached the page */
    /* v91.17.225 · keep every other parameter (?alerts=page, ?droughtfallback=1 and the test flags were dropped too) */
    const keep = new URLSearchParams(url.searchParams); keep.delete('integration');
    const rest = keep.toString();
    res.writeHead(302, { location: `${p}?backend=${encodeURIComponent(origin + BACKEND_PREFIX)}&integration=auto` + (rest ? '&' + rest : '') });
    return res.end();
  }
  if (p.startsWith(BACKEND_PREFIX + '/')) return proxyConnector(req, res, url);
  if (p === '/api/operator/status') return operatorStatus(req, res);
  if (p === '/api/dashboard/session' && req.method === 'GET') {
    const open = dashGate().open(req);
    if (open) try { dashGate().touch(req); } catch (_) {}
    return dashJson(res, 200, { open });
  }
  if (p === '/api/dashboard/gate' && req.method === 'GET') { if (!dashComputer(req)) return dashJson(res, 403, { error: 'this_computer_only' }); return dashJson(res, 200, dashGate().view(req)); }
  if (p === '/api/dashboard/password' && req.method === 'POST') return dashJson(res, 410, { error: 'password_is_in_env' });
  if (p === '/api/dashboard/login' && req.method === 'POST') {
    if (!dashComputer(req)) return dashJson(res, 403, { error: 'this_computer_only' });
    const body = await readDashBody(req);
    const admin = dashGate().login(body && body.password);
    if (!admin) return dashJson(res, 403, { error: 'password_rejected' });
    return dashJson(res, 200, { authed: true }, { 'set-cookie': dashSetCookie(dashGate().adminCookie, admin) });
  }
  if (p === '/api/dashboard/gate' && req.method === 'POST') {
    if (!dashComputer(req)) return dashJson(res, 403, { error: 'this_computer_only' });
    if (!dashGate().admin(req)) return dashJson(res, 401, { error: 'dashboard_password_required' });
    const body = await readDashBody(req);
    if (!body) return dashJson(res, 400, { error: 'bad_json' });
    if (body.action === 'lock') {
      const out = dashGate().lock();
      return dashJson(res, 200, out, { 'set-cookie': [dashSetCookie(dashGate().cookie, '', true), dashSetCookie(dashGate().sessionCookie, '', true)] });
    }
    if (body.action === 'issue') return dashJson(res, 200, dashGate().issue());
    return dashJson(res, 400, { error: 'bad_action' });
  }
  if (p === '/api/dashboard/unlock' && req.method === 'POST') {
    const body = await readDashBody(req);
    const token = body && String(body.token || '').trim();
    if (!token || !dashGate().accepts(token)) return dashJson(res, 403, { open: false, error: 'token_rejected' });
    const session = dashGate().recordUnlock(req);
    const cookies = [dashSetCookie(dashGate().cookie, token)];
    if (session && session.id) cookies.push(dashSetCookie(dashGate().sessionCookie, session.id));
    return dashJson(res, 200, { open: true }, { 'set-cookie': cookies });
  }
  if ((req.method === 'GET' || req.method === 'HEAD') && (p === '/customize' || p === '/customize/' || p === '/n3' || p === '/n3/') && !dashGate().open(req)) return lockedDocument(res);
  /* v91.17.256 · the page switch endpoint is removed with the rebuilt console (one main page) */
  if (p === '/api/ops/ui/default') return json(res, 410, { error: 'gone', why: 'one main page: the classic console at /' });
  /* v91.17.76 · O · loopback-only operator mode */
  if (p === '/api/source-labels') return sourceLabels(res, req);            /* v91.17.76 · O · generic credits for customer screens */
  /* v91.17.116 · OWN STREET MAP: OpenStreetMap vector tiles for Pakistan from one local archive (data/basemap/pk-streets.pmtiles),
     no third-party tile host. /tiles/streets/status says whether it is installed; tiles are gzip MVT. */
  if (RELIEF && RELIEF.handle(req, res, p)) return;   /* v91.17.282 · RELIEF282 · /tiles/relief/... (server/api/relief.mjs) */
  if (p === '/tiles/streets/status') return streetsStatus(res);
  if (p === '/tiles/buildings/status') return buildingsStatus(res);   /* v91.17.283.4 · Overture buildings, local archive */
  { const m = p.match(/^\/tiles\/buildings\/(\d+)\/(\d+)\/(\d+)\.mvt$/); if (m) return buildingsTile(res, +m[1], +m[2], +m[3]); }
  { const m = p.match(/^\/tiles\/streets\/(\d+)\/(\d+)\/(\d+)\.mvt$/); if (m) return streetsTile(res, +m[1], +m[2], +m[3]); }
  if (p === '/tiles/config') return tileConfig(res);
  if (p === '/tiles/status') return tileStatus(res);
  if (p === '/tiles/selftest') return tileSelfTest(res);
  /* ══ v91.17.5 · THE BROWSER CACHE WAS THE LAST COPY OF THE WATERMARK ══════
     v91.17.4 changed the tile SOURCE and kept the client-facing URL identical:
     /tiles/light/{z}/{x}/{y}, served with `cache-control: public,
     max-age=604800`. So every browser that had loaded the dashboard while CARTO
     was the source held a WEEK of watermarked tiles under exactly the URLs the
     corrected server answers — and never asked for them again. The server disk
     cache was versioned and purged; the browser's was not, because nothing in
     the URL told it anything had changed.

     Measured the wrong way, too: every check ran in a fresh headless browser
     with an empty cache, which is the one condition that cannot reproduce a
     returning user. A server-side self-test cannot see this class of defect.

     The cache version is now IN THE PATH. /tiles/v5/light/... is a URL no
     browser has ever held, so a version bump invalidates every client cache in
     the world at once, and the long max-age stays safe because a source change
     always changes the URL. The old unversioned shape still answers — an open
     tab mid-session must not break — but with `no-store`, so it can never write
     another entry that outlives a fix. */
  /* v91.17.75 · T: the 30 m hillshade overlay (station-lake/scripts/terrain30_shade.py), z 5-12, black with alpha; a flat or
     outside tile has no file and answers a 1x1 transparent PNG so the overlay never shows a broken tile */
  { const m = /^\/tiles\/hillshade\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(p);
    if (m) { const z = +m[1]; if (z < 5 || z > 12) return json(res, 404, { error: 'zoom_out_of_range', minZoom: 5, maxZoom: 12 });
      const f = join(TILE_DIR, 'hillshade', m[1], m[2], m[3] + '.png'); const has = existsSync(f);
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400', 'x-hillshade': has ? 'tile' : 'empty' });
      return res.end(has ? readFileSync(f) : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGBgAAAABQABeqhXUAAAAABJRU5ErkJggg==', 'base64')); } }
  /* v91.17.184 · the 250 m sponge (server/api/spongetiles.mjs), z 4-13; outside the grid a transparent tile */
  { const m = /^\/tiles\/sponge\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(p);
    if (m) { let b = null; try { b = SPONGE_T ? SPONGE_T.tile(+m[1], +m[2], +m[3]) : null; } catch { b = null; }
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600', 'x-sponge': b ? 'tile' : 'empty' });
      return res.end(b || Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGBgAAAABQABeqhXUAAAAABJRU5ErkJggg==', 'base64')); } }
  { const m = /^\/tiles\/(v\d+)\/(\w+)\/(\d+)\/(\d+)\/(\d+)$/.exec(p);
    if (m) return serveTile(res, m[2], m[3], m[4], m[5], { versioned: m[1] === TILE_CACHE_VERSION }); }
  { const m = /^\/tiles\/(\w+)\/(\d+)\/(\d+)\/(\d+)$/.exec(p);
    if (m) return serveTile(res, m[1], m[2], m[3], m[4], { versioned: false }); }
  if (p === '/health' || p === '/api/loop' || p === '/api/quota/breakdown' || p === '/api/synop/status' || p === '/api/synop/poll' || p === '/api/epd/status' || p === '/api/epd/poll' || p === '/api/dos/status' || p === '/api/gate' || p === '/api/registry/formula' || p === '/api/registry/gate' || p === '/api/registry/levels' || p === '/api/shown/report' || p === '/api/engine/report' || p === '/api/levels' || p === '/api/levels/unit' || p === '/api/levels/units' || p === '/api/alerts' || p === '/api/verdicts' || p === '/api/selfcheck/report' || p === '/api/sources' || p === '/api/sources/scorecard' || p.startsWith('/api/v1/') || p.startsWith('/api/api/v1/') || p === '/api/health' || p.startsWith('/api/verification/') || p.startsWith('/api/ai/') || p.startsWith('/api/outlook/') || p === '/api/report/context' || p === '/api/place/answer' || p === '/api/report/generate' || p === '/api/report/pdf' || p === '/api/report/html' || p === '/api/scenario' || p.startsWith('/api/scenario/') || p === '/api/sitechange' || p === '/api/hazards/applicability' || p === '/api/report/past30' || p === '/api/report/gate-status' || p === '/api/reports' || p.startsWith('/api/reports/') || p.startsWith('/api/limits/') || p.startsWith('/api/glof/') || p.startsWith('/api/imerg/') || p.startsWith('/api/ext/') || p.startsWith('/api/quake/') || p.startsWith('/api/seismic/') || p === '/api/faults' || p.startsWith('/api/faults/') || p === '/api/floodobs' || p.startsWith('/api/floodobs/') || p === '/api/smap' || p.startsWith('/api/smap/') || p.startsWith('/api/rain/') || p.startsWith('/api/river/') || p === '/api/readiness' || p === '/api/ready/products' || p.startsWith('/api/vegetation/') || p.startsWith('/api/smog/') || p.startsWith('/api/map/') || p === '/api/ops/health' || p.startsWith('/api/ops/') || p === '/api/score/monthly' || p === '/api/ops/score' || p === '/api/accuracy' || p.startsWith('/api/mos/') || p.startsWith('/api/hyperlocal/') || p.startsWith('/api/fleet/') || p.startsWith('/api/pool/') || p.startsWith('/api/site/') || p.startsWith('/api/case/') || p === '/api/checks' || p.startsWith('/api/checks/') || p === '/api/skill' || p.startsWith('/api/geo/') || p.startsWith('/api/flood/') || p === '/api/idf' || p.startsWith('/api/climatology/') || p.startsWith('/api/urban/') || p.startsWith('/api/obs/') || p.startsWith('/api/terrain/') || p.startsWith('/api/landslide/') || p === '/api/point' || p.startsWith('/api/point/') || p.startsWith('/api/pointstate/') || p.startsWith('/api/ecmwf010/') || p === '/api/hazardgrid' || p.startsWith('/api/hazardgrid/') || p.startsWith('/api/methods/')) { if (await backend.handle(req, res, url) !== false) return; }   /* v91.17.40 · terrain, landslide */
  if (p === '/api/manifest') return manifest(res);
  if (p.startsWith('/api/')) return json(res, 404, { error: 'not_found', path: p, note: 'the contract lives under /api/v1/ (89 endpoints); see /api/v1/... or GET /health' });

  let name;
  /* v91.17.134 · /v5 = the five-tab layout (CEO 3 Oct), kept beside the 12-tab page at / for comparison */
  /* v91.17.136 · /n3 = NIGRAAN 3, the client page (weather -> hazard -> impact -> proof); it reads the tehsil outlines and the Line of
     Control from the data folder, nothing from outside this computer */
  /* v91.17.282 · START282 · the river centre-lines of the start page (data/pk-rivers.json, built by scripts/gen/build_rivers.py from the DEM,
     JRC water and the river forecast points) */
  if (p === '/n3/rivers.json' && (req.method === 'GET' || req.method === 'HEAD')) { const f = join(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), 'pk-rivers.json');
    if (!existsSync(f)) return json(res, 404, { error: 'not_found', why: 'data/pk-rivers.json is not installed' }); return serveFile(res, f, req); }
  if (p === '/n3/tehsils.json' || p === '/n3/loc.json') { const f = join(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), p === '/n3/loc.json' ? 'loc-line.json' : 'pk-tehsils.json');
    /* v91.17.283.45 · the Customize map draws data/pk-tehsils-n3.json when present: the same tehsils by a coverage simplification of the
       official full-resolution file (shared edges once: no white slivers between neighbours at zoom 10+). Display only. */
    const f3 = p === '/n3/tehsils.json' ? join(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), 'pk-tehsils-n3.json') : null; if (f3 && existsSync(f3)) return serveFile(res, f3, req);
    if (!existsSync(f)) return json(res, 404, { error: 'not_found', path: p }); return serveFile(res, f, req); }
  /* v91.17.256 · the rebuilt console is removed: /next and /NIGRAAN_4.html go to the one main page */
  if (p === '/next' || p === '/next/' || p === '/NIGRAAN_4.html') { res.writeHead(302, { location: '/' }); return res.end(); }
  if (startHere && (req.method === 'GET' || req.method === 'HEAD')) return serveFile(res, join(ART, START_FILE), req);   /* v91.17.280 · NEWPAGE */
  const classic = p === '/' || p === '/classic' || p === '/classic/' || p === '/analyst' || p === '/analyst/';
  try { name = classic ? DEFAULT_FILE : (p === '/n3' || p === '/n3/' || p === '/customize' || p === '/customize/') ? 'NIGRAAN_3.html' : decodeURIComponent(p.slice(1)); }
  catch { return json(res, 400, { error: 'bad_request_uri', why: 'malformed percent-encoding in the path' }); }
  const file = join(ART, normalize(name).replace(/^(\.\.[/\\])+/, ''));
  /* v91.17.212 · audit S-26 · containment needs the separator: a sibling folder named artefact* passed startsWith(ART) */
  if (!(file === ART || file.startsWith(ART + sep)) || !existsSync(file) || !statSync(file).isFile()) {
    return json(res, 404, { error: 'not_found', path: p });
  }
  /* v91.17.139 · CEO 3 Oct ("from NIGRAAN 3 I can go to the 5 tabs and the analyst tool but cannot come back"): the frozen pages
     (/ and /v5) are served with one link back to NIGRAAN 3 added before </body>. The files on disk, their manifest hashes and their
     CSP are untouched: the link is plain HTML with an inline style attribute, which their CSP allows (style-src-attr). */
  if (classic && req.method === 'GET' && process.env.NIGRAAN_BACKLINK !== '0') return serveWithBack(res, file, req, p.startsWith('/analyst') ? '/analyst' : p === '/' ? '/' : '/classic');
  serveFile(res, file, req);
}
const BACK_CACHE = new Map();
/* v91.17.143 · the page switch (NIGRAAN | Customize NIGRAAN) and the shared hour-strip style, served as one stylesheet from this origin
   (the page's CSP allows style-src 'self') plus plain HTML; the page file itself is unchanged */
const BACK_HTML = '<link rel="stylesheet" href="/agn-switch.css"><nav id="agn-switch" aria-label="Switch page"><a href="/" class="on" aria-current="page">NIGRAAN</a><a href="/customize">Customize NIGRAAN</a></nav><script src="/agn-switch.js" defer></script><script src="/agn-ops-exp.js" defer></script>';
/* v91.17.280 · NEWPAGE · the console (/analyst) names three pages: the start page, the analyst view (this one) and Customize NIGRAAN */
const BACK_HTML_ANALYST = '<link rel="stylesheet" href="/agn-switch.css"><nav id="agn-switch" aria-label="Switch page"><a href="/">Start</a><a href="/analyst" class="on" aria-current="page">Analyst view</a><a href="/customize" title="Customize NIGRAAN">Customize</a></nav><script src="/agn-switch.js" defer></script><script src="/agn-ops-exp.js" defer></script>';
/* v91.17.256 · one main page: /classic is the same page and carries the same switch */
/* r42 · 1.0.6 · the React switch. Order: data/react.switch (one line NIGRAAN_REACT=0 or =1; the operator's live choice, read at most every
   2 s, no restart), else the environment NIGRAAN_REACT, else ON. The React pages need the shipped folder artefact/app (index.html, assets/,
   data/, protomaps-leaflet.js and artefact/app/logo.png); without its index.html the switch reads off and the old pages are served. */
const REACT_APP_DIR = 'artefact/app', REACT_APP_LOGO = 'artefact/app/logo.png', REACT_SWITCH_FILE = 'react.switch';
let REACT_SW = { t: 0, v: null };
function reactSwitch(fresh) {
  const now = Date.now(); if (!fresh && REACT_SW.v && now - REACT_SW.t < 2000) return REACT_SW.v;
  const f = join(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), REACT_SWITCH_FILE); let want = null, source = 'default';
  try { if (existsSync(f)) { const m = /^\s*NIGRAAN_REACT\s*=\s*([01])\s*$/m.exec(readFileSync(f, 'utf8')); if (m) { want = m[1] === '1'; source = 'data/' + REACT_SWITCH_FILE; } } } catch (_) { want = null; }
  if (want === null && process.env.NIGRAAN_REACT !== undefined && process.env.NIGRAAN_REACT !== '') { want = process.env.NIGRAAN_REACT !== '0'; source = 'environment'; }
  if (want === null) want = true;
  const built = existsSync(join(ROOT, REACT_APP_DIR, 'index.html'));
  const v = { on: want && built, wanted: want, source, built, dir: REACT_APP_DIR, logo: existsSync(join(ROOT, REACT_APP_LOGO)), pages: want && built ? 'react' : 'classic' };
  REACT_SW = { t: now, v }; return v;
}
function backHtml(at) { return existsSync(join(ART, START_FILE)) ? BACK_HTML_ANALYST : BACK_HTML; }
/* v91.17.144 · D13 · the switch keeps the place: the page that is left writes {lat, lon, name, t} to localStorage 'agn.switchPlace'
   (same origin), the page that opens reads it once if it is under 2 minutes old and opens there. Served as a file from this origin
   because the NIGRAAN page's CSP allows script-src 'self' and seals its own inline scripts. */
const SWITCH_JS = `/* v91.17.147 · audit H3 · the page's heat label said "Unavailable" when the heat index ran past the top of the published table
   (58.3 C, e.g. 38 C at 70 %) and when the air was above 43.3 C but the caller gave no air temperature. The page's own refusal
   detail (computed for the same reading just before the label) now decides: above the table is extreme danger, as the page
   already says for air above 43.3 C. The page file is unchanged; this wraps its two global functions. */
(function(){ var n=0; (function sci(){ try{ var P=window.AGN&&AGN.physics; if(!P||typeof P.heatIndexDetail!=='function'||typeof window.heatRiskLabel!=='function'){ if(++n<120) setTimeout(sci,500); return; }
  if(P.__agnSci) return; P.__agnSci=1; var d0=P.heatIndexDetail, lastD=null;
  P.heatIndexDetail=function(){ var d=d0.apply(this,arguments); lastD=d; Promise.resolve().then(function(){ lastD=null; }); return d; };
  var h0=window.heatRiskLabel; window.heatRiskLabel=function(f,a){ var r=h0(f,a);
    if(r&&r.risk==='Unavailable'&&lastD&&lastD.refused&&(lastD.bound==='maxIndexC'||lastD.bound==='maxAirTempC'))
      return lastD.bound==='maxIndexC'?{risk:'Extreme danger',note:'Heat index above the top of the published table (58.3 °C)',pct:98,basis:'index'}:{risk:'Extreme danger',note:'Air temperature is above the heat-index range: extreme heat',pct:98,basis:'air'};
    return r; };
  if(window.G&&G.heatRiskLabel===h0) G.heatRiskLabel=window.heatRiskLabel; }catch(_){} })(); })();
/* v91.17.147 · audit hazard F3 / F13 · missing input is no data, never the lowest level, in the engine that sets every tehsil's level:
   - landslide: a forecast rain series with no valid hour gave exceedance 0 and score 0 (Normal); it is now unavailable;
   - heat: a UTCI value the level table could not place gave score 0 (Normal); it is now unavailable.
   Wrappers around the page's own functions; the computations themselves are unchanged. */
(function(){ var n=0; (function hz(){ try{ var C=window.AGN&&AGN.cascade; if(!C||typeof C.landslide!=='function'||typeof window.hzHeat!=='function'){ if(++n<240) setTimeout(hz,500); return; }
  if(C.__agnHz) return; C.__agnHz=1; var l0=C.landslide;
  C.landslide=function(k,inp,tr){ var r=l0.apply(this,arguments);
    try{ if(r&&!r.unavailable&&r.score===0&&r.governingDurationH==null){ var rec=(window.DISTRICT_IN||{})[k], ra=rec&&rec.fc72&&rec.fc72.rain;
      if(Array.isArray(ra)&&!ra.slice(Math.max(0,rec.fc72.nowIdx||0)).some(function(x){ return x!=null&&isFinite(x); }))
        return {score:null,unavailable:true,noData:true,kind:r.kind||'Rainfall-triggered landslide (screening)',reason:'no valid forecast rain hour for this unit: the landslide screen is not scored (missing rain is not a dry day)'}; } }catch(_){}
    return r; };
  var h0=window.hzHeat; window.hzHeat=function(inp,terr){ var r=h0.apply(this,arguments);
    try{ if(r&&!r.unavailable&&r.score===0&&r.utciShade!=null&&typeof window.agnUtciAgnScore==='function'&&window.agnUtciAgnScore(r.utciShade)==null)
      return Object.assign({},r,{score:null,unavailable:true,noData:true,reason:'the UTCI value could not be placed on the level table: not scored'}); }catch(_){}
    return r; }; }catch(_){} })(); })();
(function(){ var K='agn.switchPlace', last=null;
/* v91.17.280 · NEWPAGE · the start page opens the console at a view: #agnview=<livedata|report|assessments|...> (with #agnplace for its
   place) and #agnproject=<id> loads that portfolio from this server's casebook (GET /api/case/project) with the page's own loader */
var HV=null, HP=null, HR=null, HE=null; try{ var hh=location.hash||''; var mv=/[#&]agnview=([a-z]+)/.exec(hh); if(mv) HV=mv[1]; var mr=/[#&]agnreport=([a-z]+)/.exec(hh); if(mr) HR=mr[1]; if(/[#&]agnedition=short(?![a-z])/.test(hh)) HE='short'; var mp=/[#&]agnproject=([A-Za-z0-9_.-]+)/.exec(hh); if(mp) HP=mp[1];
  if((HV||HP)&&!/agnplace=/.test(hh)) history.replaceState(null,'',location.pathname+location.search); }catch(_){}
function goView(){ if(!HV) return; var n=0; (function t(){ var b=document.querySelector('#machNav button[data-goto="'+HV+'"]'); if(b&&window.AGN&&AGN.flow){ b.click(); if(HR) setTimeout(goReport,2500); return; } if(++n<120) setTimeout(t,500); })(); }
function goReport(){ var n=0; (function t(){ var b=document.querySelector('.view.active [data-r268-report="'+HR+'"]'); if(b&&window.AGN&&AGN.reports268){ b.click(); if(HE==='short') goShort(); return; } if(++n<60) setTimeout(t,500); })(); }
/* v91.17.281 · INTEG281 · #agnedition=short (the start page's "2-page brief"): once the report is built, its reader's own "Short edition (2 pages)" button is pressed */
function goShort(){ var n=0; (function t(){ var b=null; Array.prototype.some.call(document.querySelectorAll('.rk-overlay button, button'),function(x){ if(String(x.textContent||'').trim()==='Short edition (2 pages)'){ b=x; return true; } return false; }); if(b){ b.click(); return; } if(++n<240) setTimeout(t,500); })(); }
function goProject(){ var n=0; (function t(){ var P=window.AGN&&AGN.project; if(P&&P.load&&window.AGN.flow){ fetch('/api/case/project?id='+encodeURIComponent(HP),{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){ try{ if(j&&j.document) P.load(j.document); }catch(_){} setTimeout(goView,600); }).catch(goView); return; } if(++n<120) setTimeout(t,500); })(); }
/* v91.17.283.17 · a place handed over in the link (#agnplace) is read by the page itself before anything is drawn (head script agn-boot,
   AGN_BOOT.place: the page opens there, under that label, with no search or reverse look-up); here the hash is only cleared */
var BOOTED=!!(window.AGN_BOOT&&window.AGN_BOOT.place);
function rd(){ try{ var m=/[#&]agnplace=([-0-9.]+),([-0-9.]+)(?:,([^&]*))?/.exec(location.hash||''); if(m){ try{ history.replaceState(null,'',location.pathname+location.search); }catch(_){} if(BOOTED) return null; return {lat:+m[1],lon:+m[2],name:m[3]?decodeURIComponent(m[3]):null}; } }catch(_){}
  try{ var v=JSON.parse(localStorage.getItem(K)||'null'); if(v&&isFinite(v.lat)&&isFinite(v.lon)&&Date.now()-v.t<120000){ localStorage.removeItem(K); return v; } }catch(_){} return null; }
/* v91.17.283.20 · B7: the place handed to Customize is the place the page was last driven to (AGN.drivenPoint, recorded by the one
   driveFromPoint), else its selected point; the save-and-wrap of driveFromPoint that remembered it is deleted */
function selected(){ try{ var a=(window.AGN&&AGN.drivenPoint)||(window.AGN&&AGN.data&&AGN.data.activePoint?AGN.data.activePoint():null); if(a&&isFinite(+a.lat)&&isFinite(+a.lon)) return {lat:+a.lat,lon:+a.lon,name:a.name||null}; }catch(_){} return null; }
/* v91.17.195 · the bar's station line and place name are now written by the bar itself (build/v84_ui.html); the two loops that
   re-inserted them every 1-1.5 s (tidy, placeTick) are gone: they fought the bar's own repaint and showed the previous place's name */
document.addEventListener('click',function(e){ var a=e.target.closest&&e.target.closest('#agn-switch a[href="/customize"]'); if(!a) return; var p=selected()||last; try{ var st=window.AGN&&AGN.point&&AGN.point.state&&AGN.point.state(); if(st&&st.row&&isFinite(st.row.lat)) p={lat:+st.row.lat,lon:+st.row.lon,name:st.label||st.row.name}; }catch(_){}
  if(p) try{ localStorage.setItem(K,JSON.stringify({lat:p.lat,lon:p.lon,name:p.name||null,t:Date.now()})); }catch(_){} },true);
var v=rd(); if(HP) goProject(); else if(HV&&!v) goView();
/* v91.17.146 · CEO 4 Oct ("basic rule: use the current location at the start"): with no place handed over by the switch, the page
   asks the browser for this computer's position and opens there; refused or unavailable, it stays on the page's own default */
/* v91.17.283.20 · B5: this computer's position is asked through the page's one my-location (AGNPlaceSearch.locate, /agn-place-search.js) */
if(!v){ if(BOOTED) return; if(window.AGNAutoLoc||window.AGNSTART) return;   /* v91.17.283.37 R4: the page asks itself on open (agn-v37-autoloc / the start page), with the pick-wins rule; no second request here */
  try{ if(window.AGNPlaceSearch&&!sessionStorage.getItem('agn.geoDone')){ sessionStorage.setItem('agn.geoDone','1');
  window.AGNPlaceSearch.locate().then(function(c){ if(!c||!(c.accuracyM<=20000)) return; v={lat:c.lat,lon:c.lon,name:null,geo:true}; go(); },function(){}); } }catch(_){} return; }
go(); function go(){ var n=0; (function tryGo(){ var P=window.AGN&&AGN.point; if(P&&P.goText&&typeof window.driveFromPoint==='function'&&window.map){ setTimeout(function(){ last={lat:v.lat,lon:v.lon,name:v.name}; P.goText(v.lat.toFixed(5)+', '+v.lon.toFixed(5),{label:v.name||undefined,quiet:true,startup:!!v.geo}); if(HV&&!HP) setTimeout(goView,1500);   /* v91.17.195 · a start from this computer's position selects the place quietly: no popup, the national view stays */ },1200); return; } if(++n<120) setTimeout(tryGo,500); })(); }
})();
/* v154 · CEO 4 Oct screenshot: the fixed NIGRAAN / Customize switch at the bottom left covered panel text (the left card and the
   "Temperature now" strip). It now sits in the page's top bar, in the flow, beside the freshness line; fixed at the bottom left
   only on a page that has no top bar. */
(function(){ var n=0; (function mv(){ var sw=document.getElementById('agn-switch'), tb=document.querySelector('header.topbar');
  if(!sw||!tb){ if(++n<120) setTimeout(mv,250); return; } if(sw.parentElement===tb) return;
  var fr=tb.querySelector('.freshness'); tb.insertBefore(sw, fr||null); sw.classList.add('in-top'); })(); })();`;
const SWITCH_CSS = `#agn-switch{position:fixed;left:8px;bottom:8px;z-index:2147483000;display:flex;border-radius:999px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.22);border:1px solid #fff;font:800 11.5px/1 system-ui,Segoe UI,Arial,sans-serif;opacity:.9}
#agn-switch:hover,#agn-switch:focus-within{opacity:1}
#agn-switch.in-top{position:static;left:auto;bottom:auto;z-index:auto;box-shadow:none;border:1px solid #d5dde3;opacity:1;flex:0 0 auto;margin:0 10px 0 auto}
/* v91.17.147 · audit UI 59: the switch covered panel text at the bottom left; it is now about half the size */
#agn-switch a{padding:6px 10px;text-decoration:none;color:#fff;background:#2b3138}#agn-switch a.on{background:linear-gradient(135deg,#d9893a,#f2b46a);color:#1b1f24}#agn-switch a:hover{filter:brightness(1.12)}
#hscroll .hcell{flex:0 0 84px!important;border:1px solid #e3e6ea!important;border-radius:14px!important;background:#fff!important;padding:8px 6px!important;box-shadow:none!important}
#hscroll .hcell.now{border:2px solid #e8a64b!important;background:#fff7ec!important}
#hscroll .hcell .hr,#hscroll .hcell .pp{display:inline-block;background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:6px 10px;font-weight:500;color:#3d4650;box-shadow:0 1px 2px rgba(0,0,0,.04)}
#hscroll .hcell .t{font-size:19px!important;font-weight:900!important;color:#1f2a33!important;margin:6px 0}
/* v91.17.144 · CEO 4 Oct: the map's day bar is one slim strip (Current · Today's peak · +1d · +2d · +3d on one row), like the overview strip */
#v3days{flex-wrap:nowrap!important;width:auto!important;max-width:none!important;min-width:0!important;gap:4px!important;padding:4px!important;border-radius:999px!important;height:auto!important}
#v3days button{min-width:0!important;padding:4px 11px!important;border-radius:999px!important;font-size:11.5px!important;line-height:1.2!important;white-space:nowrap!important;flex:0 0 auto!important}
#v3legend.agn-leg-compact{padding:5px 10px!important;border-radius:999px!important}
/* v91.17.146 · CEO 4 Oct: every section's top strip is one slim, light strip with the Pakistan flag; only what the section needs
   (the question line, the number and the long sentences go; "how the number is made" folds out on hover / focus) */
.agn-v91-story-head{background:#f4f0e6!important;color:#1f2a33!important;border:1px solid #e2dac6!important;box-shadow:none!important;padding:6px 12px!important;margin:0 0 8px!important;border-radius:12px!important;display:flex!important;flex-wrap:nowrap!important;align-items:center!important;gap:12px!important;min-height:0!important}
.agn-v91-story-head:has(.agn-hd85){flex-direction:row!important;align-items:center!important}
.agn-v91-story-head .agn-v91-head-line{flex:0 0 auto;width:auto!important;align-items:center!important;gap:8px!important}
.agn-v91-story-head .agn-v91-head-line b{color:#0b3d2e!important;font-size:15px!important}
.agn-v91-story-head .agn-v91-head-line b::before{content:'';display:inline-block;width:24px;height:16px;margin-right:7px;vertical-align:-2px;border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.12);background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 20'%3E%3Crect width='30' height='20' fill='%2301411C'/%3E%3Crect width='7.5' height='20' fill='%23fff'/%3E%3Ccircle cx='19.6' cy='10' r='5.6' fill='%23fff'/%3E%3Ccircle cx='21.1' cy='8.7' r='4.9' fill='%2301411C'/%3E%3Cpath fill='%23fff' d='M22.6 5.4l.6 1.7 1.8.0-1.5 1.1.6 1.7-1.5-1.1-1.5 1.1.6-1.7-1.5-1.1 1.8 0z'/%3E%3C/svg%3E") center/cover no-repeat}
.agn-v91-story-head .agn-v91-head-line .q,.agn-v91-story-head .agn-v91-head-line .n,.agn-v91-story-head .eyebrow,.agn-v91-story-head .agn-hd85,.agn-v91-story-head>p{display:none!important}
.agn-v91-story-head h2{color:#0b3d2e!important;margin:0!important;font-size:15px!important}
.agn-v91-story-head .agn-tourbtn87{padding:3px 10px!important;font-size:12px!important;border:1px solid #d9cfb6!important;background:#fbf8f1!important;color:#0b3d2e!important;border-radius:999px!important}
#agnContextBar{display:none!important}`;
/* the page with the switch, as sent (identity and gzip), one entry per file version; v91.17.269 · PERF A2 · also built by the warm-up
   before the server takes customers (it was built by the first page request: 0.9 s for the first visitor, measured) */
async function backEntry(file, at = '/') {
  const st = statSync(file); const key = file + '|' + st.size + '|' + Math.floor(st.mtimeMs) + '|' + at; let c = BACK_CACHE.get(file + '|' + at);
  if (!c || c.key !== key) {
    const body = Buffer.from(withSwitch(readFileSync(file, 'utf8'), backHtml(at)), 'utf8');
    const gz = await new Promise((ok, no) => zlib.gzip(body, { level: 6 }, (e, b) => e ? no(e) : ok(b)));
    c = { key, body, gz, etag: '"b' + createHash('sha1').update(body).digest('hex').slice(0, 16) + '"' }; BACK_CACHE.set(file + '|' + at, c);
  }
  return c;
}
/* v91.17.283.17 · the page switch is part of the page as it is first drawn: its stylesheet in <head>, the switch itself in the top bar
   before the freshness line (where the switch script used to move it after load, a layout shift of the whole header), the scripts
   before </body>. A page without a top bar keeps the switch fixed at the bottom left, as before. */
function withSwitch(txt, BH) {
  const link = (BH.match(/<link [^>]*>/) || [''])[0], nav = (BH.match(/<nav id="agn-switch"[\s\S]*?<\/nav>/) || [''])[0], rest = BH.replace(link, '').replace(nav, '');
  const h = txt.indexOf('</head>'), tb = txt.indexOf('<header class="topbar">'), fr = tb >= 0 ? txt.indexOf('<div class="freshness">', tb) : -1, hEnd = tb >= 0 ? txt.indexOf('</header>', tb) : -1;
  const navTop = nav.replace('<nav id="agn-switch"', '<nav id="agn-switch" class="in-top"');
  let out = txt, tail = rest;
  if (link && h >= 0) out = out.slice(0, h) + link + out.slice(h); else tail = link + tail;
  const fr2 = fr >= 0 && fr < hEnd ? fr + (link && h >= 0 && h < fr ? link.length : 0) : -1;
  if (nav && fr2 >= 0) out = out.slice(0, fr2) + navTop + out.slice(fr2); else tail = nav + tail;
  const i = out.lastIndexOf('</body>'); return i >= 0 ? out.slice(0, i) + tail + out.slice(i) : out + tail;
}
async function serveWithBack(res, file, req, at = '/') {
  try {
    if (typeof res.agnBypass === 'function') res.agnBypass();
    const c = await backEntry(file, at);
    const gzOk = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    const vtag = gzOk ? c.etag.slice(0, -1) + '-gzip"' : c.etag;
    if (String(req.headers['if-none-match'] || '') === vtag) { res.writeHead(304, { etag: vtag, vary: 'Accept-Encoding' }); return res.end(); }
    const out = gzOk ? c.gz : c.body;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', etag: vtag, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...FRAME_HEADERS, vary: 'Accept-Encoding', 'content-length': out.length, ...(gzOk ? { 'content-encoding': 'gzip' } : {}) });
    res.end(out);
  } catch (e) { serveFile(res, file, req); }
}

/* v91.17.143 · AJG Supplies site list */
const AJG_DIR = join(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), 'clients', 'ajg'), AJG_FILE = join(AJG_DIR, 'sites.csv');
function parseSitesCsv(t) {
  const L = String(t).replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim()); if (!L.length) return [];
  const h = L[0].toLowerCase().split(',').map(x => x.trim()); const ix = (k) => h.indexOf(k);
  return L.slice(1).map(l => { const c = l.split(',').map(x => x.trim()); const n = (k) => { if (ix(k) < 0) return null; const t = c[ix(k)]; if (t == null || String(t).trim() === '') return null; const v = Number(t); return Number.isFinite(v) ? v : null; };   /* v91.17.283.29 · W5 · an empty cell is no value (Number('') was 0) */
    return { name: c[ix('name')] || 'Site', lat: n('lat'), lon: n('lon'), province: ix('province') >= 0 ? c[ix('province')] : '', city: ix('city') >= 0 ? c[ix('city')] : '', type: ix('type') >= 0 ? (c[ix('type')] || 'warehouse') : 'warehouse', value: n('value'), dc: n('dc'), floor: n('floor') }; })   /* v91.17.207 · floor: height of the ground floor above the ground (m), optional */
    .filter(s => s.lat > 23 && s.lat < 37.5 && s.lon > 60.5 && s.lon < 78).slice(0, 300); }
function ajgSites(res) { try { if (!existsSync(AJG_FILE)) return json(res, 200, { client: 'AJG Supplies', sites: [], file: false });
  const st = statSync(AJG_FILE); return json(res, 200, { client: 'AJG Supplies', sites: parseSitesCsv(readFileSync(AJG_FILE, 'utf8')), updated: new Date(st.mtimeMs).toISOString(), provisional: /provisional/i.test(readFileSync(AJG_FILE + '.status', { encoding: 'utf8', flag: 'a+' }) || '') }); }
  catch (e) { return json(res, 500, { error: String(e.message || e) }); } }
async function ajgSave(req, res) { if (!operatorDecision(req).operator) return json(res, 403, { error: 'only from this computer' });
  let body = ''; for await (const ch of req) { body += ch; if (body.length > 2e6) return json(res, 413, { error: 'too large' }); }
  const sites = parseSitesCsv(body); if (!sites.length) return json(res, 422, { error: 'no site with name, lat and lon inside Pakistan' });
  try { mkdirSync(AJG_DIR, { recursive: true }); if (existsSync(AJG_FILE)) writeFileSync(AJG_FILE + '.prev', readFileSync(AJG_FILE)); writeFileSync(AJG_FILE, body); writeFileSync(AJG_FILE + '.status', 'saved from the page ' + new Date().toISOString()); }
  catch (e) { return json(res, 500, { error: String(e.message || e) }); }
  return json(res, 200, { saved: sites.length }); }

const LOG_FILE = join(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), 'server.log');
/* v91.17.75 · server.log is rotated at 5 MB (one old copy, server.log.1): the heartbeat below writes a line a minute */
let logWrites = 0;
function logLine(...a) { try { mkdirSync(join(LOG_FILE, '..'), { recursive: true });
  if (++logWrites % 200 === 1) { try { if (statSync(LOG_FILE).size > 5 * 1048576) { rmSync(LOG_FILE + '.1', { force: true }); writeFileSync(LOG_FILE + '.1', readFileSync(LOG_FILE)); writeFileSync(LOG_FILE, ''); } } catch {} }
  appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + a.map(x => x && x.stack ? x.stack : String(x)).join(' ') + '\n'); } catch {} }
process.on('uncaughtException', (e) => { console.error('  ERROR (server kept running):', e && e.message); logLine('uncaughtException', e); });
process.on('unhandledRejection', (e) => { console.error('  ERROR (server kept running):', e && e.message); logLine('unhandledRejection', e); });
/* v91.17.75 · a server that cannot bind its port EXITS (code 98) instead of living on without one. MEASURED on the
   operator's machine (26 Sep, 07:17 local): the watchdog's server hit EADDRINUSE and then ran for three hours with no
   port - fleet polling on, the watchdog waiting on it forever, two processes writing one data directory. The watchdog
   reads 98 as "another server already holds the port" (scripts/watchdog.cmd). */
server.on('error', (e) => { console.error('  SERVER ERROR:', e.message, e.code === 'EADDRINUSE' ? '- port ' + PORT + ' is already in use (another server window open?); this process exits (code 98)' : ''); logLine('server error', e);
  if (e && e.code === 'EADDRINUSE') { process.exitCode = 98; setTimeout(() => process.exit(98), 300).unref?.(); } });
logLine('start', 'port', PORT);
/* v91.17.39 · the process died three times in a day with nothing in this log: a SIGKILL (out of memory, or the host)
   leaves no trace unless the signals that CAN be caught are logged and the memory is logged before it happens. */
/* ══ v91.17.75 · FORENSICS: THE NEXT STOP EXPLAINS ITSELF ══════════════════════════════════════════════════════════
   MEASURED on the operator's machine (26 Sep 2026): "server exited with code -1" twice, 46 s apart, the first while
   scripts/ai-bench.mjs was in its grounding phase; no error, no stack, no signal line, no exit line in this log. On
   Windows -1 (0xFFFFFFFF) is the code .NET's Process.Kill passes to TerminateProcess, i.e. PowerShell Stop-Process -
   the same call RESTART_NIGRAAN.bat / INSTALL_AUTOSTART.bat / REMOVE_AUTOSTART.bat make [inference]. A process killed
   that way runs no handler, so everything that can be known must already be in the log when it happens:
     proc        pid, parent pid, node version, argv, cwd, whether a watchdog started it (at start)
     child*      every child process this server starts (spawn/exec/execFile/fork and the Sync forms): pid, command,
                 detached/hidden flags, its exit code or its error - `ollama serve`, `ollama create` (server/api/ai.mjs)
     beat        every 60 s: uptime, rss/heap/external, system free memory, event-loop delay p50/p99/max over the
                 minute, requests in the minute, requests in flight (oldest path and age), live children
     stall       the event loop was blocked for more than 2 s (logged when it unblocks, with the length)
     beforeExit / exit / signal   with uptime
   A process that dies with no exit line after this was killed from outside; the watchdog's crash file
   (data/crash-*.log) then shows which processes were running at that moment. */
const FORENSIC = { started: Date.now(), children: new Map(), reqs: 0, inflight: new Map(), seq: 0 };
/* v283.51g3 · item 2 · background jobs that overrun their limit are logged here (server/api/jobrun.mjs: job-timeout lines) */
import('./api/jobrun.mjs').then((m) => m.setJobLog(logLine)).catch(() => {});
const upS = () => Math.round((Date.now() - FORENSIC.started) / 1000) + 's';
logLine('proc', 'pid', process.pid, 'ppid', process.ppid, 'node', process.version, process.platform + '/' + process.arch, 'argv', process.argv.slice(1).join(' '), 'cwd', process.cwd(), 'watchdog', process.env.NIGRAAN_WATCHDOG || 'no');
try {
  const short = (x) => String(x == null ? '' : x).replace(/\s+/g, ' ').slice(0, 240);
  const whatOf = (name, a) => name === 'exec' || name === 'execSync' ? short(a[0]) : short([a[0]].concat(Array.isArray(a[1]) ? a[1] : []).join(' '));
  const optsOf = (a) => a.slice(1).find((x) => x && typeof x === 'object' && !Array.isArray(x)) || {};
  for (const name of ['spawn', 'execFile', 'exec', 'fork']) {
    const orig = cp[name]; if (typeof orig !== 'function') continue;
    cp[name] = function (...a) {
      const ch = orig.apply(this, a);
      try {
        const o = optsOf(a), what = whatOf(name, a), pid = ch && ch.pid != null ? ch.pid : '-';
        FORENSIC.children.set(ch, what);
        logLine('child', name, 'pid', pid, 'ppid', process.pid, what, o.detached ? 'detached' : 'attached', o.windowsHide ? 'hidden' : '', o.stdio ? 'stdio=' + JSON.stringify(o.stdio) : '');
        ch.once('error', (e) => { FORENSIC.children.delete(ch); logLine('child-error', name, 'pid', pid, what, e && e.message); });
        ch.once('exit', (code, sig) => { FORENSIC.children.delete(ch); logLine('child-exit', 'pid', pid, 'code', code, 'signal', sig || '-', what); });
      } catch {}
      return ch;
    };
  }
  for (const name of ['spawnSync', 'execSync', 'execFileSync']) {
    const orig = cp[name]; if (typeof orig !== 'function') continue;
    cp[name] = function (...a) {
      const what = whatOf(name, a), t0 = Date.now(); logLine('child-sync', name, what);
      try { const r = orig.apply(this, a); logLine('child-sync-done', name, (Date.now() - t0) + 'ms', r && r.status != null ? 'status ' + r.status : '', what); return r; }
      catch (e) { logLine('child-sync-fail', name, (Date.now() - t0) + 'ms', e && e.message, what); throw e; }
    };
  }
  syncBuiltinESMExports();   /* `await import('node:child_process')` in api/*.mjs now returns the logged functions */
} catch (e) { logLine('forensic', 'child_process hook not installed', e && e.message); }
/* v91.17.270 · OPS A13 · when a person was last served: a request that is not the server's own (x-agn-internal) and not a health check.
   The national run keeps one place in flight while someone is using the server (the last 3 s), several when nobody is (national.mjs). */
let LAST_CUSTOMER = 0;
backend.app.customerActive = () => Date.now() - LAST_CUSTOMER < 3000;
server.on('request', (req, res) => {
  if (!req.headers['x-agn-internal']) { const u0 = String(req.url || ''); if (!(u0 === '/health' || u0.startsWith('/health?') || u0.startsWith('/api/health') || u0.startsWith('/api/v1/health'))) LAST_CUSTOMER = Date.now(); }
  const id = ++FORENSIC.seq; FORENSIC.reqs++;
  FORENSIC.inflight.set(id, { at: Date.now(), what: req.method + ' ' + String(req.url || '').split('?')[0].slice(0, 80) });
  res.once('close', () => FORENSIC.inflight.delete(id));
});
const loopDelay = (() => { try { const h = monitorEventLoopDelay({ resolution: 20 }); h.enable(); return h; } catch { return null; } })();
const STALL_MS = Number(process.env.NIGRAAN_STALL_MS || 2000);
{ let last = Date.now(); setInterval(() => { const now = Date.now(), late = now - last - 1000; last = now; if (late > STALL_MS) logLine('stall', 'event loop blocked ' + late + ' ms', 'inflight', [...FORENSIC.inflight.values()].map(x => x.what).slice(0, 3).join(' | ') || '-'); }, 1000).unref?.(); }
setInterval(() => {
  const m = process.memoryUsage(), MB = (x) => Math.round(x / 1048576);
  const lag = loopDelay ? [loopDelay.percentile(50), loopDelay.percentile(99), loopDelay.max].map(x => Math.round(x / 1e6)).join('/') + 'ms' : '-';
  if (loopDelay) loopDelay.reset();
  const inf = [...FORENSIC.inflight.values()].sort((x, y) => x.at - y.at);
  logLine('beat', 'up', upS(), 'rss', MB(m.rss) + 'MB', 'heap', MB(m.heapUsed) + '/' + MB(m.heapTotal) + 'MB', 'ext', MB(m.external) + 'MB',
    'sysfree', (os.freemem() / 1073741824).toFixed(1) + '/' + (os.totalmem() / 1073741824).toFixed(1) + 'GB', 'lag p50/p99/max', lag,
    'req/min', FORENSIC.reqs, 'inflight', inf.length + (inf.length ? ' (oldest ' + inf[0].what + ' ' + Math.round((Date.now() - inf[0].at) / 1000) + 's)' : ''),
    'children', FORENSIC.children.size);
  FORENSIC.reqs = 0;
}, Math.max(1, Number(process.env.NIGRAAN_HEARTBEAT_S) || 60) * 1000).unref?.();   /* 60 s; NIGRAAN_HEARTBEAT_S for tests */
process.on('beforeExit', (code) => logLine('beforeExit', 'code', code, 'up', upS()));
process.on('exit', (code) => logLine('exit', 'code', code, 'up', upS(), 'pid', process.pid));
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'].concat(process.platform === 'win32' ? ['SIGBREAK'] : [])) process.on(sig, () => { logLine('signal', sig, 'up', upS(), 'pid', process.pid); console.error('  ' + sig + ' received; stopping'); try { if (!backend.app.store.readOnly()) backend.app.store.flushNow(); } catch (_) {} try { qbrFlush('stopped (' + sig + ')'); } catch (_) {} try { if (RUNSTATE && isActiveServer()) RUNSTATE.saveAll(true); } catch (_) {} process.exit(0); });   /* v91.17.269 · the counters of the last minute are written first */

/* ══ v91.17.269 · INFRA A6 · ZERO-DOWNTIME DEPLOY: STANDBY, HAND-OVER, DRAIN ═══════════════════════════════════════════════════
   The supervisor (scripts/wd/supervisor.mjs) keeps the front proxy (server/proxy.mjs) on 8787 and this server on 8791 or 8792. A deploy
   starts the new server on the free port; it opens the data folder in standby (api/store.mjs) and serves reads. The proxy is switched
   to it, then the supervisor writes data/run/stop-<old port>.req. The old server, seeing that file:
     1. stops starting background work (scheduler gate, engine browser, keep-warm),
     2. waits until the requests it already holds are answered (at most NIGRAAN_HANDOVER_S, default 15 s),
     3. writes the database one last time and releases the lock: the new server re-reads it and becomes the writer,
     4. keeps answering what still arrives directly (its own children) until nothing is in flight and no child runs, at most
        NIGRAAN_DRAIN_S (default 120 s), then exits with code 0.
   A file, not a signal: on Windows a signal to another process is TerminateProcess (no handler runs, the last writes are lost). */
const RUN_DIR = join(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), 'run');
const STOP_REQ = join(RUN_DIR, 'stop-' + PORT + '.req');
const STARTED_AT = Date.now();
function isActiveServer() { try { const s = backend.app.store; return !backend.app.draining && !(s.standby && s.standby()); } catch (_) { return true; } }
function whenWriter(f) { try { const s = backend.app.store; if (s.onPromoted) return s.onPromoted(() => { if (!backend.app.draining) f(); }); } catch (_) {} f(); }
try { const st = statSync(STOP_REQ); if (st.mtimeMs < STARTED_AT) rmSync(STOP_REQ, { force: true }); } catch (_) {}   /* a request left for an earlier process on this port */
let drainStarted = false;
async function drainAndExit(why) {
  if (drainStarted) return; drainStarted = true;
  const t0 = Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  backend.app.draining = true;
  logLine('drain', 'start', why, 'pid', process.pid, 'port', PORT, 'inflight', FORENSIC.inflight.size, 'children', FORENSIC.children.size);
  console.log('  drain      ' + why + ': no new background work; handing the data folder over');
  try { if (backend.app.engine) backend.app.engine.stop(); } catch (_) {}
  const handoverMs = Math.max(0, Number(process.env.NIGRAAN_HANDOVER_S ?? 15)) * 1000;
  while (FORENSIC.inflight.size > 0 && Date.now() - t0 < handoverMs) await sleep(100);
  try { qbrFlush('retired by a deploy'); } catch (_) {}   /* v91.17.270 · OPS A8 */
  try { if (RUNSTATE) RUNSTATE.saveAll(true); } catch (_) {}   /* v91.17.283.3 · cut 2: the run-keyed caches for the next server */
  let rel = null; try { rel = await backend.app.store.release(); } catch (e) { rel = { released: false, why: e && e.message }; }
  logLine('drain', 'store', JSON.stringify(rel), 'after', (Date.now() - t0) + 'ms', 'inflight', FORENSIC.inflight.size);
  const drainMs = Math.max(0, Number(process.env.NIGRAAN_DRAIN_S ?? 120)) * 1000;
  while ((FORENSIC.inflight.size > 0 || FORENSIC.children.size > 0) && Date.now() - t0 < drainMs) await sleep(250);
  logLine('drain', 'done', 'after', (Date.now() - t0) + 'ms', 'inflight left', FORENSIC.inflight.size, 'children left', FORENSIC.children.size);
  try { server.close(); } catch (_) {}
  setTimeout(() => process.exit(0), 50);
}
{ const t = setInterval(() => { if (drainStarted) return clearInterval(t); if (existsSync(STOP_REQ)) { try { rmSync(STOP_REQ, { force: true }); } catch (_) {} drainAndExit('the supervisor retired this server').catch((e) => { logLine('drain', 'error', e); process.exit(0); }); } }, 500); t.unref?.(); }

/* v91.17.193 · RUN_NIGRAAN.bat opens http://localhost:8787. Windows can resolve "localhost" to ::1 before 127.0.0.1, and a
   server bound to 127.0.0.1 alone refuses that first attempt, so the page sometimes did not open. With the default host the
   same request handler also answers on ::1 (loopback is already recognised as ::1 everywhere). A machine with IPv6 turned off
   only logs it; a second server on ::1 is impossible because the main listener exits first on EADDRINUSE. */
if (!process.env.HOST) {
  try {
    const s6 = http.createServer(server.listeners('request')[0]);
    for (const k of ['keepAliveTimeout', 'headersTimeout', 'requestTimeout']) if (server[k] != null) s6[k] = server[k];
    s6.on('error', (e) => { try { logLine('ipv6 listener not started', e && (e.code || e.message)); } catch {} });
    server.on('listening', () => s6.listen(PORT, '::1'));
    server.on('close', () => { try { s6.close(); } catch {} });
  } catch (e) { try { logLine('ipv6 listener not started', e && e.message); } catch {} }
}
server.listen(PORT, HOST, async () => {
  /* v91.17.283.51 · B2 · the place answer reads its parts through this listener in-process (server/api/inproc.mjs), not over the port */
  try { backend.app.inject = makeInject(server.listeners('request')[0], { port: PORT }); } catch (_) {}
  const f = join(ART, DEFAULT_FILE);
  /* v91.17.269 · PERF A2 · the warm-up (index.mjs warmUp: place and street indexes, the national trees (v91.17.155: were a 3 s timer
     here), the national builders, the MACH record months) and the main page's sent copy; customers are taken when both are done */
  Promise.all([backend.warmUp({ essentials: warmEssentials }), existsSync(f) && process.env.NIGRAAN_BACKLINK !== '0' ? backEntry(f, existsSync(join(ART, START_FILE)) ? '/analyst' : '/').catch(() => null) : null])
    .finally(() => { WARM.ready = true; WARM.ms = Date.now() - WARM.t0; for (const go of WARM.waiting.splice(0)) go(); console.log('  warm       ready for customers ' + WARM.ms + ' ms after start (' + Object.entries(backend.app.warm.steps || {}).map(([k, v]) => k + ' ' + v + ' ms').join(', ') + ')');
      try { const E = backend.app.warm.essentials; if (E) console.log('  warm       essentials ' + (E.ok ? 'passed' : 'FAILED') + ' (' + Object.entries(E.checks || {}).map(([k, v]) => k + (v.ok ? '' : ' FAILED') + ' ' + v.ms + ' ms').join(', ') + ')'); } catch (_) {} });
  const h = existsSync(f) ? sha256(readFileSync(f)) : 'MISSING';
  console.log('');
  console.log('  AI GEO NIGRAAN . local deployment');
  console.log('  ---------------------------------------------------------------');
  console.log('  url        http://%s:%d/', HOST, PORT);
  try { console.log('  build      %s (package.json; the terminal shows this on every start)', JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')).version); } catch {}
  console.log('  artefact   %s', DEFAULT_FILE);
  console.log('  sha256     %s', h);
  /* v91.17.76 · O · B-25 · pre-encode the artefact off the event loop so the first visitor does not wait.
     v91.17.269 · PERF · only where the page is served as a plain file (NIGRAAN_BACKLINK=0): the main route sends the page with the
     switch (serveWithBack), whose gzip copy the warm-up above builds; the plain-file gzip-9 and brotli-9 copies made here for every
     start were never sent there (about 10 s of compression on the thread pool at each start, measured in CHANGES.md). */
  try { if (existsSync(f) && process.env.NIGRAAN_BACKLINK === '0') { const st = statSync(f); const et = '"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"'; encodedFile(f, et, 'gzip').catch(() => {}); encodedFile(f, et, 'br').catch(() => {}); } } catch {}
  console.log('             (delivered bytes; check against artefact/MANIFEST.json)');
  console.log('  provider   %s', KEY
    ? 'Open-Meteo PAID (customer-api) - key from ' + KEY_SOURCE + ', held in this process, never sent to the browser'
    : '*** NO OPEN-METEO PAID KEY *** - weather requests REFUSED (free tier disabled). Add nigraan-local\\mach.key');
  await warmTileChain();
  console.log('  backend    %d contract endpoints under /api/v1  ·  /health  ·  worker %s', backend.endpointCount, backend.app.backgroundWorker.enabled ? 'on' : 'off');
  whenWriter(() => backend.startWorker());   /* v91.17.269 · INFRA A6 · a standby starts its worker and engine at the hand-over */
  try { if (backend.app.engine) { whenWriter(() => backend.app.engine.start(Math.max(20, Number(process.env.NIGRAAN_ENGINE_DELAY_S || 240)) * 1000));   /* v91.17.121 · the engine browser loads the full page; started with the server it competed with the reader's first load (page ready in 30 s instead of 5 s, measured). It waits 4 minutes; the last report is served meanwhile */ console.log('  engine     %s', backend.app.engine.status().enabled ? (backend.app.engine.status().runner === 'browser' ? 'the hazard engine runs in a headless browser on this computer (/api/levels)' : 'the hazard engine runs in Node.js on this computer, no browser (/api/levels)') : 'off (NIGRAAN_ENGINE=0)'); } } catch (e) { console.log('  engine     not started: ' + e.message); }   /* v91.17.106 */
  console.log('  ---------------------------------------------------------------');
  console.log('');
});
