/* ══ v91.17.283 · WS1 · FETCH AGAIN ONLY WHEN THE PROVIDER HAS A NEWER MODEL RUN ══════════════════════════════════════════════════
   Measured (BUDGET_REPORT.md): 73 % of the provider spend was the sweep cache fetching the same national bodies again every 10-12 min,
   the national job fetched the same 577-tehsil forecast every hour, and the season outlook fetched EC46/SEAS5 again on every tick while
   it could not complete. The provider publishes, per model, when its latest run was made and became available
   (GET <host>/data/<domain>/static/meta.json: last_run_initialisation_time, last_run_availability_time, update_interval_seconds;
   open-meteo Sources/App/Helper/File/ModelMetaJson.swift). This module:
     - maps a request (API kind + models + variables) to the provider domains it is built from (data/provider-models.json, with the
       provider source lines it was read from); a model not in the file -> null, and the caller keeps its old time rule;
     - keeps each domain's metadata and asks for it again only once its next run is due (last availability + update_interval_seconds,
       the provider's own numbers) and then at most once per pollSeconds until the run changes; one metadata call per domain;
     - gives a request's RUN KEY (every domain's run time), so an answer fetched for one key is reused until a key changes;
     - wraps the backend provider.call() with an answer cache keyed on (request, run key, the request's dates): the national job and
       every other backend caller get the same bytes until a newer run exists. A request asking for `current`, `minutely_15` or a
       `forecast_hours`/`past_hours` window is time-relative and is keyed on the 15-minute slot as well; one with explicit dates is not
       cached here. The metadata call itself counts as one weighted call (as report.mjs already counts it). */
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DATA_AGE } from './dataage.mjs';   /* v283.36 item 29 */
import { gunzipSync, gzip } from 'node:zlib';
import { writeFile as writeFileP, rename as renameP, mkdir as mkdirP } from 'node:fs/promises';

export function createModelRuns({ dataDir, metaFetch, now = () => Date.now(), log = null }) {
  const file = join(dataDir, 'provider-models.json');
  let M = null, mt = null, err = null;
  function load() {
    try { if (!existsSync(file)) { M = null; err = 'data/provider-models.json is not installed'; return M; }
      const m = statSync(file).mtimeMs; if (m === mt && M) return M;
      const j = JSON.parse(readFileSync(file, 'utf8')); const poll = Number(j.pollSeconds);
      if (!(poll > 0) || !j.kinds || typeof j.kinds !== 'object') throw new Error('pollSeconds and kinds are required');
      M = { poll: poll * 1000, kinds: j.kinds }; mt = m; err = null; } catch (e) { M = null; err = String(e.message || e); }
    return M;
  }
  const S = new Map();          /* kind|domain -> { init, avail, interval, checkedAt, error, polls, changes } */
  const inflight = new Map();
  const list = (v) => (v == null ? [] : Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim()).filter(Boolean);
  /* the domains a request is built from; null when any model is not in the file */
  function specFor(kind, get) {
    const c = load(); const K = c && c.kinds[kind]; if (!K) return null;
    const models = list(get('models')); const ms = models.length ? models : [kind === 'airQuality' ? (get('domains') || 'auto') : 'best_match'];
    const vars = ['hourly', 'daily', 'current', 'minutely_15'].flatMap((k) => list(get(k)));
    const prob = vars.some((v) => /precipitation_probability/.test(v)); const regs = new Set();
    /* v91.17.283.26 · a request of probability variables only reads the model's probability domains (data/provider-models.json: the
       probability readers are used "only for precipitation_probability"; ForecastapiController.swift L2143-2150): its answer does not
       change when a deterministic run does, so its key holds those domains only. Live 27 Oct: the tehsil superset's probability part (576
       weighted calls) was fetched again at every GFS / ICON / IFS run change with the main part, its answer unchanged. */
    const probOnly = vars.length > 0 && vars.every((v) => /precipitation_probability/.test(v));
    for (const m of ms) { const e = K[m]; if (!e || !Array.isArray(e.domains)) return null;
      if (probOnly && Array.isArray(e.probability) && e.probability.length) { for (const d of e.probability) regs.add(d); continue; }
      for (const d of e.domains) regs.add(d); if (prob) for (const d of (e.probability || [])) regs.add(d); }
    return { kind, regs: [...regs].sort() };
  }
  const id = (kind, d) => kind + '|' + d;
  /* the run key now (from what is known; no call): null until every domain's metadata has been read once */
  function key(spec) {
    if (!spec) return null; const parts = [];
    for (const d of spec.regs) { const e = S.get(id(spec.kind, d)); if (!e || e.init == null) return null; parts.push(d + '@' + e.init); }
    return parts.join(',');
  }
  function due(e, t) {
    const c = load(); const poll = c ? c.poll : 600e3;
    if (!e || e.init == null) return !e || t - e.checkedAt >= poll;                                   /* never read, or the last read failed */
    const next = ((e.avail != null ? e.avail : e.init) + (e.interval || 0)) * 1000;                    /* the next run cannot be there before this */
    return t >= next && t - e.checkedAt >= poll;
  }
  async function readOne(kind, d) {
    const k = id(kind, d); if (inflight.has(k)) return inflight.get(k);
    const p = (async () => {
      const e = S.get(k) || { init: null, avail: null, interval: null, checkedAt: 0, error: null, polls: 0, changes: 0 }; S.set(k, e);
      e.checkedAt = now(); e.polls++;
      try { const j = await metaFetch(kind, d); const init = Number(j && j.last_run_initialisation_time);
        if (!Number.isFinite(init) || init <= 0) throw new Error('no last_run_initialisation_time');
        if (e.init != null && init !== e.init) e.changes++;
        e.init = init; e.avail = Number(j.last_run_availability_time) || null; e.interval = Number(j.update_interval_seconds) || null; e.error = null;
      } catch (x) { e.error = String((x && x.message) || x).slice(0, 160); }
      return e;
    })();
    inflight.set(k, p); try { return await p; } finally { inflight.delete(k); }
  }
  /* read the metadata of the request's domains that are due (in parallel); resolves to the key after */
  async function poll(spec) {
    if (!spec) return null; const t = now();
    await Promise.all(spec.regs.filter((d) => due(S.get(id(spec.kind, d)), t)).map((d) => readOne(spec.kind, d)));
    return key(spec);
  }
  function status() {
    load(); const out = {};
    for (const [k, e] of S) out[k] = { run: e.init ? new Date(e.init * 1000).toISOString() : null, available: e.avail ? new Date(e.avail * 1000).toISOString() : null,
      intervalH: e.interval ? e.interval / 3600 : null, checkedAt: e.checkedAt ? new Date(e.checkedAt).toISOString() : null, polls: e.polls, runChanges: e.changes, error: e.error };
    return { ready: !!M, why: err, pollSeconds: M ? M.poll / 1000 : null, domains: out, answerCache: CACHE.stats(), closedCache: { ...CST } };
  }
  /* ── v91.17.283 · WS1 · PATCH3 · new runs at the main hours only (00/12 UTC; the hours come from data/provider-budget.json) ──
     floorMain(t): the latest main-hour time at or before t. A domain has a NEW MAIN RUN against a held run h when floorMain(latest) > h: the
     00/12 run after the one held has been made (a fetch then gets the provider's latest run, which may be a later 06/18 one, and is labelled
     with it). mainUpdate(kind, get, heldKey, newKey) -> null (keep the held answer) or { key, models }: models null = fetch it all (best_match
     or single model, labelled newKey); else the members to fetch again, and the key with those members' domains moved to newKey's runs. */
  function floorMain(t, hours) { const day = Math.floor(t / 86400) * 86400; let best = -Infinity;
    for (const h of hours) for (const d of [day, day - 86400]) { const x = d + h * 3600; if (x <= t && x > best) best = x; } return best; }
  const parseKey = (k) => Object.fromEntries(String(k || '').split(',').filter(Boolean).map((x) => { const i = x.lastIndexOf('@'); return [x.slice(0, i), Number(x.slice(i + 1))]; }));
  const joinKey = (o) => Object.keys(o).sort().map((d) => d + '@' + o[d]).join(',');
  function mainUpdate(kind, get, heldKey, newKey, hours) {
    if (!heldKey || !newKey || heldKey === newKey) return null;
    const A = parseKey(heldKey), B = parseKey(newKey), H = hours && hours.length ? hours : [0, 12];
    const newMain = (d) => !(d in A) || !(d in B) || floorMain(B[d], H) > A[d];
    const c = load(); const K = c && c.kinds[kind]; const ms = list(get('models'));
    const vars = ['hourly', 'daily', 'current', 'minutely_15'].flatMap((k) => list(get(k))); const prob = vars.some((v) => /precipitation_probability/.test(v));
    if (K && ms.length >= 2 && !ms.includes('best_match')) {
      const pick = []; const out = { ...A };
      for (const m of ms) { const e = K[m]; if (!e) return Object.keys(B).some(newMain) ? { key: newKey, models: null } : null;
        const regs = [...e.domains, ...(prob ? (e.probability || []) : [])]; if (regs.some(newMain)) { pick.push(m); for (const d of regs) if (d in B) out[d] = B[d]; } }
      return pick.length ? { key: joinKey(out), models: pick } : null;
    }
    return Object.keys(B).some(newMain) ? { key: newKey, models: null } : null;
  }
  /* the label of a run key: each domain's run time, UTC */
  function label(k) { const o = parseKey(k); const runs = Object.fromEntries(Object.entries(o).map(([d, t]) => [d, Number.isFinite(t) ? new Date(t * 1000).toISOString().slice(0, 16) + 'Z' : null]));
    const ts = Object.values(o).filter(Number.isFinite); return { runs, oldest: ts.length ? new Date(Math.min(...ts) * 1000).toISOString().slice(0, 16) + 'Z' : null, newest: ts.length ? new Date(Math.max(...ts) * 1000).toISOString().slice(0, 16) + 'Z' : null }; }
  const headerOf = (k) => (k ? Object.entries(parseKey(k)).map(([d, t]) => d + '=' + new Date(t * 1000).toISOString().slice(0, 16) + 'Z').join(';') : null);
  /* the caller's policy (index.mjs: the call budget): { mainRunsOnly, hours, cacheFirst } for a backend request */
  let policy = () => null; const setPolicy = (fn) => { policy = typeof fn === 'function' ? fn : () => null; };
  /* ── the answer cache for backend calls ── */
  const CACHE = (() => { const m = new Map(); let bytes = 0; const st = { hits: 0, misses: 0, stored: 0, evicted: 0, bypass: 0, keptForMainRun: 0, adoptedUnknownRun: 0 };
    const MAX = Math.max(8, Number(process.env.NIGRAAN_RUN_CACHE_MB) || 96) * 1048576;
    return { get(k) { const e = m.get(k); if (!e) return null; m.delete(k); m.set(k, e); return e; },
      put(k, body, size) { if (size > MAX / 4) return; const o = m.get(k); if (o) { bytes -= o.size; m.delete(k); } m.set(k, { body, size }); bytes += size; st.stored++;
        while (bytes > MAX && m.size) { const [k0, e0] = m.entries().next().value; m.delete(k0); bytes -= e0.size; st.evicted++; } },
      st, stats: () => ({ entries: m.size, mb: Math.round(bytes / 1048576 * 10) / 10, ...st }), _all: () => [...m.entries()] }; })();
  const CACHED_PATHS = { forecast: '/v1/forecast', airQuality: '/v1/air-quality', seasonal: '/v1/seasonal', ensemble: '/v1/ensemble' };
  /* ── v91.17.283.26 · AN ANSWER FETCHED WHILE ITS RUN WAS NOT KNOWN IS NOT BOUGHT AGAIN ─────────────────────────────────────────────
     Live 27 Oct 2026 (data/quota-callers, server-console.log): the ensemble model's metadata read failed at start, so the run key was
     unknown and the answer cache was bypassed; the 15-day outlook's 24 ensemble batches were fetched, 6 failed, the run was kept aside
     as partial (426 of 576 tehsils) and the retry 15 minutes later fetched all 24 batches again (18,885 weighted calls, twice in one hour).
     Now such an answer is kept (UNK, keyed on the request and its day, no run) with the time its call started. Once the metadata is read,
     the answer is the run the key names exactly when every domain of the request had that run available (last_run_availability_time,
     the provider's own number) before the call started: the provider answers with its latest available run, and the key is the latest
     run now, so no newer run existed in between. Then it is filed under that run key (as if fetched with the key known) and served from
     there; otherwise it is never used and the request is fetched as before. Bounded: 6 hours, a quarter of the answer cache's bytes. */
  const UNKNOWN_RUN = 'run-unknown';
  const UNK = (() => { const m = new Map(); let bytes = 0; const MAXU = Math.max(8, Number(process.env.NIGRAAN_RUN_CACHE_MB) || 96) * 1048576 / 4;
    const drop = (k) => { const e = m.get(k); if (e) { bytes -= e.size; m.delete(k); } };
    return { get(k) { const e = m.get(k); if (!e) return null; if (now() - e.at > 6 * 3600e3) { drop(k); return null; } return e; },
      put(k, body, size, at) { if (size > MAXU) return; drop(k); m.set(k, { body, size, at }); bytes += size; while (bytes > MAXU && m.size) drop(m.keys().next().value); },
      del: drop, size: () => m.size }; })();
  function adoptable(spec, atMs) {
    if (!spec || !Number.isFinite(atMs)) return false;
    for (const d of spec.regs) { const e = S.get(id(spec.kind, d)); if (!e || e.init == null || e.avail == null || !(e.avail * 1000 <= atMs)) return false; }
    return true;
  }
  const LAST = new Map();   /* PATCH3 · request (no run) -> { key, run }: the last answer held, for main-runs-only and cache-first */
  function answerKey(kind, path, params, runKey) {
    const q = params || {}; const get = (k) => q[k];
    if (get('start_date') || get('end_date') || get('start_hour') || get('end_hour')) return null;
    /* the day the request's window is counted from: its time zone's date (GMT / absent = UTC; Pakistan or auto = PKT, UTC+5; any other
       zone: both dates, so the window can never be served from the wrong day) */
    const t = now(), tz = String(get('timezone') || 'GMT'), U = new Date(t).toISOString().slice(0, 10), K = new Date(t + 5 * 3600e3).toISOString().slice(0, 10);
    const day = /^(GMT|UTC)$/i.test(tz) ? U : /^(Asia\/Karachi|auto)$/i.test(tz) ? K : U + '/' + K;
    const rel = ['current', 'minutely_15', 'forecast_hours', 'past_hours', 'forecast_minutely_15', 'past_minutely_15'].some((k) => get(k) != null && get(k) !== '');
    const norm = Object.keys(q).filter((k) => q[k] != null && q[k] !== '').sort().map((k) => k + '=' + (Array.isArray(q[k]) ? q[k].join(',') : String(q[k])));
    return kind + path + '?' + norm.join('&') + '#' + runKey + '#' + day + (rel ? '#' + Math.floor(t / 900e3) : '');
  }
  /* wrap provider.call; compiled with the Function constructor so the per-caller record (provider.mjs callerOf) still names the module
     that asked, not this wrapper */
  /* ── v91.17.283.3 · budget cut 3 · CLOSED-PERIOD ANSWERS ARE KEPT ON DISK ──────────────────────────────────────────────────────────────
     A dated request (start_date and end_date) to the reanalysis archive, the satellite archive, the historical forecast or the previous-runs
     endpoint whose end date is over before the request's own day (its time zone) asks about a closed period. It was asked again on every run:
     the site screen's 1940-2025 record (673 weighted per place), the ensemble verification's observed days (2,880 a pass), the climatology
     archive, and the dated outlook-radiation, verification and ensemble-bias windows. Such an answer is kept, keyed on the exact request
     (data/cache/closed/<sha256>.json.gz), and only when it is COMPLETE: every series of every location without a missing value (a window
     whose last days the provider has not filled yet is never kept, so it is asked again until it is). A window that closed over 7 days ago
     is kept for good (the rule the proxy already applies to archive windows); a more recent closed window for 36 h, after which it is asked
     again (the reanalysis's preliminary days may still be revised). NIGRAAN_CLOSED_CACHE=0 turns it off. */
  const CLOSED_PATHS = { archive: '/v1/archive', satellite: '/v1/archive', historicalForecast: '/v1/forecast', previousRuns: '/v1/forecast' };
  const CDIR = join(dataDir, 'cache', 'closed'); const CST = { hits: 0, stored: 0, incomplete: 0, open: 0, errors: 0 };
  function closedOf(kind, path, params) {
    if (process.env.NIGRAAN_CLOSED_CACHE === '0' || CLOSED_PATHS[kind] !== path) return null;
    const q = params || {}; const sd = q.start_date, ed = q.end_date; if (!sd || !ed || !/^\d{4}-\d{2}-\d{2}$/.test(String(ed))) return null;
    const t = now(), tz = String(q.timezone || 'GMT'), off = /^(Asia\/Karachi|auto)$/i.test(tz) ? 5 * 3600e3 : /^(GMT|UTC)$/i.test(tz) ? 0 : null; if (off == null) return null;
    const today = new Date(t + off).toISOString().slice(0, 10); if (!(String(ed) < today)) { CST.open++; return null; }
    const perm = Date.parse(String(ed) + 'T00:00:00Z') <= Date.parse(today + 'T00:00:00Z') - 7 * 864e5;
    const norm = Object.keys(q).filter((k) => q[k] != null && q[k] !== '').sort().map((k) => k + '=' + (Array.isArray(q[k]) ? q[k].join(',') : String(q[k])));
    return { file: join(CDIR, createHash('sha256').update(kind + path + '?' + norm.join('&')).digest('hex') + '.json.gz'), perm, kind, endMs: Date.parse(String(ed) + 'T00:00:00Z') + 864e5 - off };
  }
  function complete(body) {
    const L = Array.isArray(body) ? body : [body]; if (!L.length) return false;
    for (const loc of L) { if (!loc || typeof loc !== 'object' || loc.error) return false; let any = false;
      for (const b of ['hourly', 'daily', 'weekly', 'monthly']) { const B = loc[b]; if (!B) continue; for (const [k, v] of Object.entries(B)) { if (k === 'time') continue; if (!Array.isArray(v) || !v.length || v.some((x) => x == null)) return false; any = true; } }
      if (!any) return false; }
    return true;
  }
  /* v91.17.283.5 · the write is off the event loop (async gzip and file write): the synchronous gzip of up to ~80 large closed windows
     in the first minutes after a start blocked the server long enough for the hazard engine's own forecast batches to time out (measured:
     480 tehsils lost their wetness input and their dynamic runoff retention in the 60-place run). Until its write lands, a stored answer
     is served from memory (PEND), so a repeat in the same seconds still costs no call. */
  const PEND = new Map(), PENDW = new Set();
  const closedFlush = async () => { while (PENDW.size) await Promise.all([...PENDW]); };   /* every closed write in flight has landed (a test, or a drain) */
  /* v283.36 item 29 · a recent closed window expires when a newer run exists (before: 36 h whatever the runs did): a reanalysis or satellite
     window after one ERA5 daily cycle (data-age table); a forecast-archive window as soon as a run that covers the window became available after the answer was stored */
  const newerRunCovers = (at, endMs) => { for (const e of S.values()) if (e && e.init && (e.avail || e.init) * 1000 > at && e.init * 1000 < endMs) return true; return false; };
  const closedOld = (c, at) => { if (c.perm) return false; if (c.kind === 'archive' || c.kind === 'satellite') return now() - at > DATA_AGE.era5.cycleH * 3600e3; return newerRunCovers(at, c.endMs); };
  function closedGet(c) { const pm = PEND.get(c.file); if (pm) { if (closedOld(c, pm.at)) return null; return JSON.parse(pm.json).body; }
    try { if (!existsSync(c.file)) return null; const o = JSON.parse(gunzipSync(readFileSync(c.file)).toString('utf8'));
      if (!o || !Number.isFinite(o.at) || !('body' in o)) return null; if (closedOld(c, o.at)) return null; return o.body; } catch (_) { CST.errors++; return null; } }
  function closedPut(c, body) { try { if (!complete(body)) { CST.incomplete++; return; } const f = c.file, at = now(); const json = JSON.stringify({ at, body }); PEND.set(f, { at, json });
      const g = new Promise((res) => gzip(Buffer.from(json), (err, gz) => { try { if (err) { CST.errors++; PEND.delete(f); return; }
        const w = mkdirP(CDIR, { recursive: true }).then(() => writeFileP(f + '.tmp', gz)).then(() => renameP(f + '.tmp', f)).then(() => { CST.stored++; }, () => { CST.errors++; }).finally(() => { if (PEND.get(f) && PEND.get(f).json === json) PEND.delete(f); PENDW.delete(w); }); PENDW.add(w); } finally { res(); } })); PENDW.add(g); g.then(() => PENDW.delete(g));
    } catch (_) { CST.errors++; } }
  function cacheProvider(provider) {
    const call0 = provider.call;
    const pre = async (kind, path, params) => {
      /* v91.17.283.5 · a closed-period request that is not on disk takes the same path as before cut 3 (the run-key poll and answer cache
         below) and is ALSO kept on disk when complete: going around that path changed when the model metadata was first read and so
         which run the engine's forecast rows carried at its first report (60-place run: landslide antecedent and retention inputs moved) */
      const cl = closedOf(kind, path, params); if (cl) { const h = closedGet(cl); if (h != null) { CST.hits++; return { hit: h }; } }
      const by = () => (cl ? { closed: cl } : null);
      if (CACHED_PATHS[kind] !== path) { CACHE.st.bypass++; return by(); }
      const spec = specFor(kind, (k) => (params || {})[k]); if (!spec) { CACHE.st.bypass++; return by(); }
      const t0 = now(); const rk = await poll(spec);
      /* v91.17.283.26 · run not known (metadata not read yet, or its read failed): fetched as before, and the answer is kept as UNKNOWN-RUN */
      if (!rk) { CACHE.st.bypass++; const uk = answerKey(kind, path, params, UNKNOWN_RUN); return { ...(by() || {}), ...(uk ? { unk: uk, at: t0 } : {}) }; }
      const k = answerKey(kind, path, params, rk); if (!k) { CACHE.st.bypass++; return by(); }
      const e = CACHE.get(k); if (e) { CACHE.st.hits++; return { hit: structuredClone(e.body) }; }
      { const uk = answerKey(kind, path, params, UNKNOWN_RUN), u = uk ? UNK.get(uk) : null;
        if (u && adoptable(spec, u.at)) { UNK.del(uk); CACHE.put(k, u.body, u.size); CACHE.st.hits++; CACHE.st.adoptedUnknownRun++; return { hit: structuredClone(u.body) }; } }
      /* PATCH3 · main runs only (shed pressure or test mode) / cache first: the last answer of the same request is kept while no new
         00/12 run exists for its domains (cache first: whatever run it is); it carries its own run (never relabelled) */
      const base = k.slice(0, k.indexOf('#')) + '#' + k.split('#').slice(2).join('#'); const last = LAST.get(base);
      let P = null; try { P = policy(kind, params); } catch (_) { P = null; }
      if (last && P && (P.cacheFirst || (P.mainRunsOnly && !mainUpdate(kind, (x) => (params || {})[x], last.run, rk, P.hours)))) { const e2 = CACHE.get(last.key); if (e2) { CACHE.st.hits++; CACHE.st.keptForMainRun++; return { hit: structuredClone(e2.body) }; } }
      CACHE.st.misses++; return { key: k, base, run: rk, ...(cl ? { closed: cl } : {}) };
    };
    const post = (c, body) => { if (c && c.closed && body != null) closedPut(c.closed, body);
      if (c && c.unk && body != null) { let size = 0; try { size = JSON.stringify(body).length; } catch (_) { size = 0; } if (size) UNK.put(c.unk, structuredClone(body), size, c.at); return; }
      const k = c && c.key; if (!k || body == null) return; let size = 0; try { size = JSON.stringify(body).length; } catch (_) { return; } CACHE.put(k, structuredClone(body), size); LAST.set(c.base, { key: k, run: c.run }); if (LAST.size > 4000) LAST.delete(LAST.keys().next().value); };
    provider.call = new Function('pre', 'post', 'call0', 'self', 'return async function cachedCall(kind, path, params, opts = {}) { const c = await pre(kind, path, params); if (c && c.hit !== undefined) return c.hit; const body = await call0.call(self, kind, path, params, opts); post(c, body); return body; }')(pre, post, call0, provider);
    return provider;
  }
  /* the models of a multi-model request whose domains have a newer run between two keys (null: cannot tell, fetch everything) */
  function changedModels(kind, get, oldKey, newKey) {
    const c = load(); const K = c && c.kinds[kind]; if (!K || !oldKey || !newKey) return null;
    const ms = list(get('models')); if (ms.length < 2 || ms.includes('best_match')) return null;
    const P = (k) => Object.fromEntries(String(k).split(',').map((x) => x.split('@')));
    const A = P(oldKey), Bk = P(newKey);
    const vars = ['hourly', 'daily', 'current', 'minutely_15'].flatMap((k) => list(get(k))); const prob = vars.some((v) => /precipitation_probability/.test(v));
    const out = [];
    for (const m of ms) { const e = K[m]; if (!e) return null; const regs = [...e.domains, ...(prob ? (e.probability || []) : [])];
      if (regs.some((d) => !(d in A) || !(d in Bk))) return null; if (regs.some((d) => A[d] !== Bk[d])) out.push(m); }
    return out;
  }
  /* ── v91.17.283.3 · budget cut 2 · NO COLD START: the metadata state and the answer cache survive a restart (runstate.mjs writes them).
     Only answers of the current day and without a 15-min slot are kept (their key carries the run key and the day, so an answer is never
     used for another run or day: a newer run changes the key); the metadata is read again as soon as its next run is due, as always. ── */
  const keyDay = (k) => { const p = String(k).split('#'); return p.length === 3 ? p[2] : null; };   /* null: slot-keyed or unknown form: not kept */
  function snapshot(t = now(), maxChars = Infinity) {
    const U = new Date(t).toISOString().slice(0, 10), K = new Date(t + 5 * 3600e3).toISOString().slice(0, 10), ok = (d) => d && (d === U || d === K || d === U + '/' + K);
    const meta = [...S.entries()].filter(([, e]) => e.init != null).map(([k, e]) => [k, { init: e.init, avail: e.avail, interval: e.interval, checkedAt: e.checkedAt, polls: e.polls, changes: e.changes }]);
    /* v91.17.283.24 · P12 · held under maxChars (the runstate part's cap): the most recently used answers first, so the cache is written
       (cut to what fits) instead of refused whole */
    const all = CACHE._all().filter(([k]) => ok(keyDay(k))), answers = []; let room = maxChars - JSON.stringify(meta).length;
    for (let i = all.length - 1; i >= 0; i--) { const [k, e] = all[i], c = e.size + String(k).length + 32; if (c > room) break; room -= c; answers.push([k, e.body, e.size]); }
    answers.reverse();
    const keep = new Set(answers.map((a) => a[0]));
    const last = [...LAST.entries()].filter(([, v]) => keep.has(v.key));
    return { meta, answers, last };
  }
  function restore(o, t = now()) {
    if (!o || typeof o !== 'object') return { meta: 0, answers: 0 };
    let nm = 0, na = 0;
    for (const [k, e] of o.meta || []) { if (S.has(k) || !e || !Number.isFinite(e.init)) continue; S.set(k, { init: e.init, avail: e.avail ?? null, interval: e.interval ?? null, checkedAt: Number(e.checkedAt) || 0, error: null, polls: e.polls || 0, changes: e.changes || 0, restored: true }); nm++; }
    const U = new Date(t).toISOString().slice(0, 10), K = new Date(t + 5 * 3600e3).toISOString().slice(0, 10), ok = (d) => d && (d === U || d === K || d === U + '/' + K);
    for (const [k, body, size] of o.answers || []) { if (!ok(keyDay(k)) || CACHE.get(k)) continue; CACHE.put(k, body, size); na++; }
    for (const [b, v] of o.last || []) if (v && CACHE.get(v.key)) LAST.set(b, v);
    return { meta: nm, answers: na };
  }
  return { specFor, key, poll, status, cacheProvider, closedFlush, changedModels, load, mainUpdate, floorMain, label, headerOf, setPolicy, answerKey, snapshot, restore, _state: S };
}
