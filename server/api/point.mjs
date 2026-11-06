/* == v91.17.283.19 . ONE SERVER CALL DRIVES THE PAGE: THE PLACE BUNDLE =================================================================
   Owner, 25 Oct 2026 (F-10 Islamabad, live v283.18 in Chrome): opening a place made 14 requests on the start page and 154 on the analyst
   page in 18 s; the sections named the place three ways and showed a second temperature. Now a page asks ONE thing per place:

     GET /api/point?id=<place id>                 a record of the place table (server/api/places.mjs), computed at its own point
     GET /api/point?lat=<lat>&lon=<lon>[&name=]   any point, computed where it is asked (no 0.01 deg cell); a name carried by a link is
                                                  kept only when it agrees with the place table at that point
     GET /api/point/batch?pts=lat,lon;...         the map's city labels and other national lists: the same corrected records (no parts),
                                                  at most 600 points, one request

   The answer is ONE bundle per place and forecast run, assembled here once and cached until the run stamp changes:
     place      the place table's record: name (the one label every section shows), tehsil, district, province, unit, kind, confirmed
     now / hours / days / heat / source / confidence / point / area / urban
                the point state (server/api/pointstate.mjs: the served correction chain, MOS included); corrected values only
     station    ONE nearest AGN station by ONE rule (pointstate.mjs), its latest reading labelled as an observation, apart from "now"
     parts      levels (the tehsil's issued hazard levels), rainChance, outlook, seasonal, smog, siteScreening, siteRisk (every sector),
                river (river link), glof (lakes upstream), climatology (baseline), past30, context (report context), pointrun (the
                frozen model run of the report), facts ("This place"), near (places around, each from its own record), land (the
                land-surface inputs of the place)
   Each part carries its own source and age (at); a part that fails or is not ready in time is { ok:false, unavailable:true, why } and the
   bundle is still served. The parts are the server's existing functions (index.mjs hands them in): their routes are retired, their logic
   is not copied.
   v91.17.283.20 . FIRST ANSWER AT ONCE (owner, 25 Oct 2026: a new place took 18-30 s, the bundle waited for its slowest part). The first
   answer of a place carries the place, now / hours / days and the station as soon as the point state is computed, with every part that is
   ready within NIGRAAN_POINT_FIRST_MS (default 1.5 s); the others are { ok:false, pending:true } and named in B.pending. They keep running
   and fill the SAME cached bundle. The page then makes at most ONE completion read of the same bundle: GET /api/point?...&complete=1
   waits until every pending part has settled (each within its own NIGRAAN_POINT_PART_MS) and answers the whole bundle (complete:true).
   Operator view only: part state (the physical state of the point: Liljegren WBGT, mean radiant temperature, wind pressure, freezing
   degree-hours, snow load; server/api/state.mjs) and part mos (the station-calibration adjustment of the hour at the point).
   v91.17.283.21 . operator part pool (the forecast pool of the place, server/api/pool.mjs point(): the operator Overview's products card,
   which was the page's own GET /api/pool/point per place). */
export const POINT_VERSION = 'point-5 (v91.17.283.28)';
import { PS_TTL_MS, pktHourOf } from './pointstate.mjs';
import { shownShared as shownOf, placeSpelling } from './shownplace.mjs';   /* v283.49 · 1.0.10 item 6: the display strings every page prints; v283.52 D: one decision for both views, one spelling */
import { servedUnit } from './served.mjs';
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const PART_MS = Number(process.env.NIGRAAN_POINT_PART_MS || 25000);   /* a part not ready in this time is served as not ready (it keeps running) */
const FIRST_MS = Number(process.env.NIGRAAN_POINT_FIRST_MS || 1500);
const STATE_MS = Number(process.env.NIGRAAN_POINT_STATE_MS || 6000);   /* v91.17.283.53 · C · N1: the longest a place card waits for its point state */   /* v91.17.283.20 · the first answer waits at most this long for the parts */
const normName = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();

export function createPoint(app, opts = {}) {
  const PARTS = opts.parts || {};
  const now = opts.now || (() => Date.now());
  const cache = new Map(), inflight = new Map(), stats = { asked: 0, built: 0, served: 0, batch: 0, completed: 0 };
  const BUNDLES_MAX = Math.max(8, Number(process.env.NIGRAAN_POINT_BUNDLES) || 48);
  /* v91.17.283.51 · B (memory) · a bundle past its point state's age is never served again (fresh() above); it was dropped only when the
     same place was asked again, so up to 400 whole bundles (1-2 MB each with the climate windows) stayed on the heap: the laptop server sat
     at 2 GB and spent seconds in garbage collection. Expired bundles are now removed once a minute (served values unchanged). */
  { const t = setInterval(() => { for (const [k, B] of cache) if (!fresh(B)) cache.delete(k); }, 60e3); t.unref?.(); }
  /* the stamp of a bundle: the point state's run stamp (model run + live-station read) and the issued levels' stamp */
  /* v91.17.283.28 · S1 · the PKT hour is part of the stamp (the bundle's "now" is that hour's), so a bundle never outlives its hour and a page
     watching bundleStamp refreshes once at the hour; a cached bundle is also served only within its point state's own age (PS_TTL_MS) */
  const stampOf = () => { let a; try { a = app.pointState.runStamp().stamp; } catch (_) { a = 'run?'; } let b = null; try { b = opts.levelsStamp ? opts.levelsStamp() : null; } catch (_) { b = null; } return a + '#' + (b || '-') + '@' + pktHourOf(now()); };
  const fresh = (B) => !!(B && B.__builtMs != null && now() - B.__builtMs < PS_TTL_MS);

  /* the place: the table's record (id) or the point's own resolution (lat, lon) */
  function placeOf(q) {
    const P = app.places;
    if (q.id != null && q.id !== '') {
      const r = P.byId(String(q.id)); if (!r || !isN(r.lat) || !isN(r.lon)) return { ok: false, why: 'no place with that id' };
      return { ok: true, lat: r.lat, lon: r.lon, place: { id: r.id, name: r.name, kind: r.kind || null, level: r.level || null, confirmed: r.confirmed !== false,
        tehsil: r.tehsil || null, district: r.district || null, province: r.province || null, unitId: r.unitId || null, lat: r.lat, lon: r.lon, by: 'place id', source: 'NIGRAAN place table' } };
    }
    const lat = Number(q.lat), lon = Number(q.lon);
    if (!isN(lat) || !isN(lon)) return { ok: false, why: 'id, or lat and lon, required' };
    const la = Math.round(lat * 1e5) / 1e5, lo = Math.round(lon * 1e5) / 1e5;
    let R = null; try { R = P.resolvePoint(la, lo); } catch (_) { R = null; }
    const u = (R && R.unit) || {}, pl = R && R.place;
    let name = pl && pl.name ? pl.name : (u.tehsil ? u.tehsil + ' tehsil' : 'Selected point');
    /* a name carried by a shared link (#agnplace=lat,lon,name) is kept when it is, or contains, a name the table gives for this point */
    const claim = q.name != null ? String(q.name).split(',')[0].trim().slice(0, 80) : '';
    if (claim) { const a = normName(claim); const names = [pl && pl.near, pl && pl.name, R && R.area && R.area.name, u.tehsil, u.district].filter(Boolean).map(normName);
      if (a.length >= 3 && names.some((b) => b.length >= 3 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0))) name = String(q.name).trim().slice(0, 120); }
    return { ok: true, lat: la, lon: lo, place: { id: pl && pl.id || null, name, kind: pl ? pl.kind : 'point', level: 'point', confirmed: !!pl,
      tehsil: u.tehsil || null, district: u.district || null, province: u.province || null, unitId: u.unitId || null, lat: la, lon: lo, by: 'point', label: R && R.label || null,
      near: pl ? { name: pl.near || pl.name, km: pl.km } : null, source: 'NIGRAAN place table + official tehsil polygons' } };
  }
  /* one part: its function, its time limit, its meta. v91.17.283.20: o.firstMs set (the first answer of a bundle): a part not settled by then
     is answered { ok:false, pending:true } and fills ctx.bundle.parts[name] when it settles (or when its own limit runs out); B.wait holds
     the settling promises the completion read waits on */
  const OPERATOR_PARTS = new Set(opts.operatorParts || []);
  /* == v91.17.283.22 . A PART THE PROVIDER LIMIT REFUSED IS RETRIED ON ITS OWN ===========================================================
     Owner, 26 Oct 2026: the place's rain chance (part poolHazard) failed with "429" and the strip showed "-" in every window for the rest of
     the run. A part whose provider call was refused for the provider limit (HTTP 429: the provider's quota or this server's daily call
     budget) is answered { ok:false, unavailable:true, limited:true, retryAt, why: 'not available right now (provider limit) - retrying' }
     and is computed again on its own, later, with a growing wait (NIGRAAN_PART_RETRY_S, default 120 s, doubled each time, at most
     NIGRAAN_PART_RETRIES, default 5, about one hour): within the budget (no try while the day's provider budget is spent: opts.budgetSpent),
     never more than one try of a part of a bundle at a time. The result fills the SAME cached bundle; the page reads it once at retryAt. */
  const RETRY_MS = Math.max(1, Number(process.env.NIGRAAN_PART_RETRY_S || 120)) * 1000, RETRIES = Math.max(0, Number(process.env.NIGRAAN_PART_RETRIES ?? 5));
  const LIMIT_RE = /\b429\b|provider limit|quota|call_budget|daily (call )?budget|budget_reached/i;
  const LIMIT_WHY = 'not available right now (provider limit) - retrying';
  /* v91.17.283.23 · self-audit P2 · a TEMPORARY failure (connection reset, timeout, 5xx, provider unreachable) is retried the same way;
     before, it stayed in the cached bundle for the whole run stamp */
  const TRANSIENT_RE = /ECONN|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|fetch failed|socket|timed? ?out|did not answer|could not be reached|\b50[0234]\b|answered with an error|did not arrive/i;
  const TRANSIENT_WHY = 'not available right now (temporary failure) - retrying';
  stats.retried = 0; stats.retryFilled = 0; stats.retryHeld = 0; stats.retryDropped = 0;
  function limited(name, r, n, transient) { return { ok: false, unavailable: true, limited: true, ...(transient ? { transient: true } : {}), at: r.at, retry: n, retryAt: new Date(now() + RETRY_MS * Math.pow(2, n)).toISOString(), why: transient ? TRANSIENT_WHY : LIMIT_WHY, cause: String(r.why || '').slice(0, 160) }; }
  /* v91.17.283.23 · self-audit P1 / P11 · a retry runs only for a bundle that is still the cached, current one (a batch answer already sent,
     or a bundle whose run stamp has moved on, is never retried: its result would go nowhere); the retry state is kept here, not on the
     bundle the client receives */
  const RETRY_ON = new WeakMap();
  const live = (B) => { if (!B || !B.__ck) return false; return cache.get(B.__ck) === B && B.stamp === stampOf() && fresh(B); };
  function scheduleRetry(name, ctx, n) {
    const B = ctx.bundle; if (!B || n >= RETRIES || !B.__ck) return; let on = RETRY_ON.get(B); if (!on) { on = new Set(); RETRY_ON.set(B, on); } if (on.has(name)) return; on.add(name);
    const t = setTimeout(async () => {
      on.delete(name);
      try {
        if (!live(B)) { stats.retryDropped++; return; }
        let spent = false; try { spent = !!(opts.budgetSpent && opts.budgetSpent()); } catch (_) { spent = false; }
        if (spent) { stats.retryHeld++; const cur = B.parts && B.parts[name]; if (cur && cur.limited) B.parts[name] = { ...cur, retry: n + 1, retryAt: new Date(now() + RETRY_MS * Math.pow(2, n + 1)).toISOString() }; return scheduleRetry(name, ctx, n + 1); }
        stats.retried++;   /* a try that fails again schedules the next one itself (runPart -> limitOf) */
        const r = await runPart(name, ctx, { retry: n + 1 });
        if (B.parts && live(B)) B.parts[name] = r; if (r && r.ok) stats.retryFilled++;
      } catch (_) {}
    }, RETRY_MS * Math.pow(2, n)); if (t.unref) t.unref();
  }
  async function runPart(name, ctx, o = {}) {
    const f = PARTS[name]; const t0 = now();
    const wrap = (v) => { const ok = !(v && (v.ok === false || v.ready === false || v.error)); const r = { ok, at: new Date(now()).toISOString(), ms: now() - t0, v: v == null ? null : v };
    if (!ok) r.why = String((v && (v.why || v.reason || v.error)) || name + ': not available for this point').slice(0, 200); return r; };
    const limitOf = (r) => { if (!r || r.ok) return r; const w = String(r.why || ''), lim = LIMIT_RE.test(w), tr = !lim && TRANSIENT_RE.test(w); if (!lim && !tr) return r;
      const n = o.retry || 0; const x = limited(name, r, n, tr); if (n < RETRIES && ctx.bundle && ctx.bundle.__ck) scheduleRetry(name, ctx, n); else { x.retryAt = null; x.why = tr ? 'not available right now (temporary failure)' : 'not available right now (provider limit)'; } return x; };
    const p = (async () => f(ctx))().then(wrap, (e) => ({ ok: false, unavailable: true, at: new Date(now()).toISOString(), why: name + ' could not be computed: ' + String(e && e.message || e).replace(/https?:\S+/g, '').slice(0, 160) })).then(limitOf);
    let to; const lim = new Promise((r) => { to = setTimeout(() => r({ ok: false, unavailable: true, at: new Date(now()).toISOString(), why: name + ' was not ready within ' + Math.round(PART_MS / 1000) + ' s' }), PART_MS); });
    const settled = Promise.race([p, lim]).then((v) => { clearTimeout(to); return v; });
    const B = ctx.bundle;
    /* v91.17.283.23 · audit 5 · ONE late-fill rule on both paths: a part answered "not ready within" is written into the bundle when its
       own work settles later (it was missing on the first-answer path, so a slow part stayed unavailable after it finished) */
    const lateFill = (v) => { if (v && v.why && /was not ready within/.test(v.why) && B) p.then((x) => { if (B.parts && (!B.__ck || live(B))) B.parts[name] = x; }).catch(() => {}); return v; };
    if (o.firstMs != null) {
      let tf; const first = new Promise((r) => { tf = setTimeout(() => r(null), o.firstMs); });
      const out = await Promise.race([settled, first]); clearTimeout(tf);
      if (out) return lateFill(out);
      /* still running: the part is pending in the first answer and fills the cached bundle when it settles */
      if (B) { B.pending = (B.pending || []).concat(name); const w = settled.then((v) => { if (B.parts) B.parts[name] = v; lateFill(v); B.pending = (B.pending || []).filter((x) => x !== name);
        if (!B.pending.length) { B.complete = true; B.completedAt = new Date(now()).toISOString(); } return v; }); (B.wait = B.wait || []).push(w);
        /* v283.38 item 2: the settling of each part by name (a completion read of named parts waits for those only) */
        if (!B.waitBy) Object.defineProperty(B, 'waitBy', { value: {}, enumerable: false, configurable: true }); B.waitBy[name] = w; }
      return { ok: false, pending: true, at: new Date(now()).toISOString(), why: name + ' is being computed (the page reads it once more when it is ready)' };
    }
    return lateFill(await settled);
  }
  async function build(q, view, ck = null, skip = null) {
    const P = placeOf(q); if (!P.ok) return { ok: false, why: P.why };
    /* v91.17.283.53 · C · N1 (b) · the card never waits more than STATE_MS for the point state: past it, the point's last good record (its own run
       and time) or the tehsil's area record is served with a plain line (B.stale, shown.now.label), and the bundle is not cached, so the
       next read gets the current record as soon as it is made */
    let ps = null; try { ps = await app.pointState.state(P.lat, P.lon, { noBuild: true, deadlineMs: STATE_MS }); } catch (e) { ps = { ok: false, why: 'the point state is not available: ' + String(e && e.message || e).slice(0, 120) }; }
    if (!ps || !ps.ok) return { ok: false, outside: !!(ps && ps.outside), atSea: !!(ps && ps.atSea), ...(ps && ps.slow ? { slow: true } : {}), why: (ps && ps.why) || 'the forecast for this point is not available', place: P.place };
    const a = ps.area || {}, place = { ...P.place, tehsil: P.place.tehsil || a.tehsil || null, district: P.place.district || a.district || null, province: P.place.province || a.province || null, unitId: P.place.unitId || a.unitId || null, elevM: ps.point && ps.point.elevM };
    const st = ps.source && ps.source.mach && ps.source.mach.nearest || null;
    let chainId = null; try { chainId = app.provenance ? app.provenance.chain().id : null; } catch (_) { chainId = null; }   /* the code-and-table identity that made it (as /health) */
    placeSpelling(place);   /* v91.17.283.52 D · N20: Shekhupura -> Sheikhupura (the tehsil / district spelling) in the place's name, label and nearby name */
    const B = { ...ps, version: POINT_VERSION, pointState: ps.version, view, stamp: stampOf(), chainId, place,
      station: st && st.station ? { ok: true, kind: 'station', name: st.station, id: st.id, no: st.no, km: st.km, ageMin: st.ageMin, status: st.status, stationElevM: st.stationElevM, pointElevM: st.pointElevM, reading: st.reading, rule: st.rule, source: 'AGN station network (MACH)' }
        : { ok: false, kind: 'station', why: (st && st.why) || 'no AGN station reading within 25 km', ...(st && Array.isArray(st.held) && st.held.length ? { held: st.held } : {}), rule: st && st.rule || null },   /* v91.17.283.51 fix: the stations held back, with their reasons */
      parts: {}, pending: [] };
    /* v91.17.283.49 · 1.0.10 item 6 · the shown place answer (shownplace.mjs): one rounding rule, measured vs forecast labels, the place summary */
    try { let sm = null; if (place.unitId) { const SU = servedUnit(app, place.unitId, view === 'operator'); sm = SU && SU.summary ? SU.summary : null; }
      let feed = null; try { const c = app.fleet && app.fleet.counts ? app.fleet.counts({}) : null; feed = c && c.unavailable ? c.feed : null; } catch (_) { feed = null; }
      /* v91.17.283.52 E · air quality measured now near the place (aqnow.mjs: the nearest QC-passed Punjab station or US Department of State
         monitor within 25 km and the height rule, reading younger than 90 min); one decision for both views (shownShared); the monitor detail
         only in the operator view */
      let air = null; try { air = app.aqNow ? app.aqNow.near(P.lat, P.lon, ps.point && ps.point.elevM, Date.now(), { maxAgeMin: 90 - PS_TTL_MS / 60e3 }) : null; } catch (_) { air = null; }
      B.shown = shownOf(B, { summary: sm, feed, air });
      if (view === 'operator') B.airStation = air && air.ok ? air.detail : air ? { none: air.why, held: air.held || [] } : null; } catch (_) { B.shown = null; }
    if (ps.stale) { B.notice = ps.stale.line; try { if (B.shown && B.shown.now && B.shown.now.label) B.shown.now = { ...B.shown.now, label: B.shown.now.label + ' · ' + ps.stale.line }; if (B.shown) B.shown.notice = ps.stale.line; } catch (_) {} }
    /* v91.17.283.51 fix · OWNER DECISION 3 Nov 18:54 PKT: no station name, number, distance, age or hold reason reaches a customer page; the
       reading's values stay (the "now" may be the measured value), its wording is the shown sentence by location. Operator view unchanged. */
    if (view !== 'operator') { const strip = (x) => (x && typeof x === 'object' ? { ok: !!x.ok, kind: x.kind || 'station', ...(x.reading ? { reading: { ...x.reading, note: undefined } } : {}), label: B.shown && B.shown.measured ? B.shown.measured.label : null } : x);
      B.station = strip(B.station);
      if (B.source && B.source.mach && B.source.mach.nearest) B.source = { ...B.source, mach: { ...B.source.mach, nearest: strip(B.source.mach.nearest) } }; }
    if (ck) Object.defineProperty(B, '__ck', { value: ck, enumerable: false, configurable: true });
    Object.defineProperty(B, '__builtMs', { value: now(), enumerable: false, configurable: true });   /* v283.23: the cache key this bundle will live under (retries check it) */
    const ctx = { lat: P.lat, lon: P.lon, place, uid: place.unitId, elevM: ps.point && ps.point.elevM, view, ps, bundle: B };
    /* the parts (operator parts only in the operator view) and the record's "how it is made" (the raw value of this hour), all at once;
       the first answer waits FIRST_MS at most, the rest fill the bundle */
    const names = Object.keys(PARTS).filter((n) => (view === 'operator' || !OPERATOR_PARTS.has(n)) && !(skip && skip.has(n)));
    const rb = Promise.race([app.pointState.rawBuild(ps).catch(() => null), new Promise((r) => setTimeout(() => r(null), PART_MS))]);
    const [res, b0] = await Promise.all([Promise.all(names.map((n) => runPart(n, ctx, { firstMs: FIRST_MS }))), Promise.race([rb, new Promise((r) => setTimeout(() => r(undefined), FIRST_MS))])]);
    names.forEach((n, i) => { if (!(B.parts[n] && !B.parts[n].pending && res[i].pending)) B.parts[n] = res[i]; });
    if (b0) B.build = b0; else if (b0 === undefined) { B.pending.push('build'); (B.wait = B.wait || []).push(rb.then((v) => { if (v) B.build = v; B.pending = B.pending.filter((x) => x !== 'build'); if (!B.pending.length) { B.complete = true; B.completedAt = new Date(now()).toISOString(); } return v; })); }
    B.complete = !B.pending.length; if (B.complete) B.completedAt = new Date(now()).toISOString();
    B.assembledAt = new Date(now()).toISOString(); stats.built++;
    return B;
  }
  /* the bundle as answered: a copy without the settling promises, with the parts as they stand */
  /* ══ v91.17.283.38 · item 2 · THE PARTS A PAGE ASKS FOR, NOT EVERY PART ═══════════════════════════════════════════════════════════
     Live 30 Oct (laptop): a place click answered 1.8 MB, 69 % of it the CMIP6 windows that no page section reads from the bundle, and
     ?parts=hazardCount answered 1.58 MB (no filter existed). A place open no longer buys the on-demand parts (CMIP6 and the other names in
     ON_DEMAND). They are computed on the same bundle when a request asks for them (?parts=cmip6 or ?parts=all). What is SENT is chosen per request:
       ?parts=a,b,c   exactly those parts (the start page's bottom panel asks parts=hazardCount);   ?parts=all   every part (the Customize page);
       ?parts=default,x   the default set and x (the start page's place panel: default,context);
       no parts=      every part except ON_DEMAND (the large parts read only when a section opens, through the page store's part(), which
                      asks ?parts=<names> of the same bundle once). The answer names what it left out in omitted[] so a store can ask for it.
     B.pending lists only the parts sent (and 'build'). */
  const ON_DEMAND = new Set(String(process.env.NIGRAAN_POINT_ON_DEMAND || 'cmip6,context,pointrun,poolRank,aiLocal,rainRarity,siteRisk,poolHazard').split(',').map((x) => x.trim()).filter(Boolean));
  const pickOf = (q) => { const raw = q && q.parts != null ? String(q.parts) : null; if (raw == null || raw === '') return null; if (raw === 'all') return 'all'; return new Set(raw.split(',').map((x) => x.trim()).filter(Boolean)); };
  const answer = (B, pick) => { if (!B || !B.ok) return B; const { wait, ...o } = B; const parts = {}, omitted = [];
    for (const n of Object.keys(B.parts || {})) { const send = pick === 'all' ? true : pick ? (pick.has(n) || (pick.has('default') && !ON_DEMAND.has(n))) : !ON_DEMAND.has(n); if (send) parts[n] = B.parts[n]; else omitted.push(n); }
    for (const n of ON_DEMAND) if (!(B.parts && Object.prototype.hasOwnProperty.call(B.parts, n)) && (B.view === 'operator' || !OPERATOR_PARTS.has(n))) omitted.push(n);
    const pending = (B.pending || []).filter((n) => n === 'build' || Object.prototype.hasOwnProperty.call(parts, n));
    const out = { ...o, parts, pending }; if (omitted.length) out.omitted = omitted; return out; };
  /* GET /api/point: the cached bundle of the place and run, or one assembly shared by every request that arrives meanwhile;
     o.complete (the completion read): when parts are pending, wait for them to settle, then answer the whole bundle */
  async function bundle(q, o = {}) {
    stats.asked++;
    const view = o.view === 'operator' ? 'operator' : 'customer';
    const base = q.id != null && q.id !== '' ? 'id:' + String(q.id) : (isN(Number(q.lat)) && isN(Number(q.lon)) ? Number(q.lat).toFixed(5) + ',' + Number(q.lon).toFixed(5) : null);   /* v283.23 audit 18: the point as asked */
    if (!base) return { ok: false, why: 'id, or lat and lon, required' };
    /* one bundle per point and run: a name carried by a link (q.name) changes only the label, which placeOf decides per request */
    /* v91.17.283.20 · B8: self is the query of this answer (id, or the point and the name a link carried): a page's one completion read
       repeats it with &complete=1, so it reads the SAME bundle under the SAME label */
    const self = () => { const s = new URLSearchParams(); if (q.id != null && q.id !== '') s.set('id', String(q.id)); else { s.set('lat', String(q.lat)); s.set('lon', String(q.lon)); if (q.name != null && q.name !== '') s.set('name', String(q.name)); } if (q.parts != null && q.parts !== '') s.set('parts', String(q.parts)); return '/api/point?' + s.toString(); };   /* v283.38 item 2: the completion read keeps the parts asked */
    const pick = pickOf(q);
    /* an on-demand part (CMIP6 and the rest of ON_DEMAND) is bought only when this request asks for it, then kept on the bundle */
    async function ensure(B) {
      if (!B || !B.ok || pick == null) return B;
      const want = pick === 'all' ? [...ON_DEMAND] : [...pick].filter((n) => ON_DEMAND.has(n));
      const missing = want.filter((n) => PARTS[n] && (view === 'operator' || !OPERATOR_PARTS.has(n)) && !(B.parts && Object.prototype.hasOwnProperty.call(B.parts, n)));
      if (!missing.length) return B;
      if (!B._ens) Object.defineProperty(B, '_ens', { value: new Map(), enumerable: false });
      const ctx = { lat: B.point && B.point.lat, lon: B.point && B.point.lon, place: B.place, uid: B.place && B.place.unitId, elevM: B.point && B.point.elevM, view, ps: B, bundle: B };
      await Promise.all(missing.map((n) => { let p = B._ens.get(n); if (!p) { p = runPart(n, ctx).then((r) => { if (B.parts) B.parts[n] = r; return r; }); B._ens.set(n, p); } return p; }));
      return B;
    }
    const named = (B) => { B = answer(B, pick); if (!B || !B.ok) return B; B = { ...B, self: self() }; if (q.name == null || q.name === '' || (q.id != null && q.id !== '')) return B; const P = placeOf(q);
      return P.ok && B.place && P.place.name !== B.place.name ? { ...B, place: { ...B.place, name: P.place.name } } : B; };
    const settle = async (B) => { if (o.complete && B && B.wait && B.pending && B.pending.length) { stats.completed++; const pk = pickOf(q);
        /* v283.38 item 2: ?parts=a,b&complete=1 waits for those parts only (an on-demand read is not held up by the slowest other part) */
        if (pk && pk !== 'all' && !pk.has('default') && B.waitBy) await Promise.all([...pk].map((n) => B.waitBy[n]).filter(Boolean)); else await Promise.all(B.wait); } return B; };
    const qq = { ...q }; delete qq.name; delete qq.complete; delete qq.fresh; delete qq.parts;
    const stamp = stampOf(), ck = base + '|' + view + '|' + stamp;
    const hit = cache.get(ck); if (hit && !fresh(hit)) cache.delete(ck);
    else if (hit && !o.fresh) { stats.served++; cache.delete(ck); cache.set(ck, hit); return named(await ensure(await settle(hit))); }   /* LRU: a bundle read moves to the end */
    if (inflight.has(ck)) return inflight.get(ck).then(settle).then(ensure).then(named);
    /* v91.17.283.51 · memory · a bundle holds every part (1-2 MB with the climate windows): at most NIGRAAN_POINT_BUNDLES (default 48) are kept,
       least recently used first out (400 whole bundles were 0.5-1 GB of heap after a sweep of new places) */
    const job = build(qq, view, ck, new Set(ON_DEMAND)).then((B) => { if (B && B.ok && !B.stale) { cache.set(ck, B); while (cache.size > BUNDLES_MAX) cache.delete(cache.keys().next().value); } return B; }).finally(() => inflight.delete(ck));
    inflight.set(ck, job); return job.then(settle).then(ensure).then(named);
  }
  /* GET /api/point/batch: the corrected records of many points (the map's city labels), one request, no parts; with o.with, the named
     cheap parts of each point too (a portfolio of sites: its place, its site screening and risk, its tehsil levels, its 15-day outlook,
     its past 30 days) */
  /* v91.17.283.20 · item A5: with=inputs adds the model inputs of each point that the record does not hold (soil moisture, pressure,
     850 hPa, reference evapotranspiration: the page's district rows), one provider product per 40 points (opts.inputsOf, index.mjs) */
  const BATCH_PARTS = ['place', 'siteScreening', 'siteRisk', 'levels', 'outlook', 'past30', 'inputs', 'placeRecord', 'siteLevels'];   /* v283.28 S5/S6: a portfolio reads each site's place record and site levels */
  async function batch(pts, o = {}) {
    stats.batch++;
    const r = await app.pointState.many(pts.map((x) => ({ lat: x.lat, lon: x.lon })));
    let INP = null; if ((o.with || []).includes('inputs') && opts.inputsOf) { try { INP = await opts.inputsOf(r.map((s, i) => ({ lat: s && s.ok ? s.point.lat : pts[i].lat, lon: s && s.ok ? s.point.lon : pts[i].lon, elevM: s && s.ok ? s.point.elevM : null }))); } catch (_) { INP = null; } }
    const W = (o.with || []).filter((x) => BATCH_PARTS.includes(x) && x !== 'inputs'), view = o.view === 'operator' ? 'operator' : 'customer';
    return Promise.all(r.map(async (s, i) => { const out = s && s.ok ? { ...s, light: true, stamp: stampOf() } : { ...(s || { ok: false }) };
      if (INP) out.inputs = INP[i] || { ok: false, why: 'the model inputs did not arrive' };
      if (!W.length) return out;
      const P = placeOf({ lat: pts[i].lat, lon: pts[i].lon }); out.place = P.ok ? P.place : null; out.parts = {};
      const ctx = { lat: P.ok ? P.lat : pts[i].lat, lon: P.ok ? P.lon : pts[i].lon, place: out.place, uid: out.place && out.place.unitId, elevM: s && s.point ? s.point.elevM : null, view, ps: s, floor: pts[i].floor, bundle: out };
      for (const n of W) if (n !== 'place') out.parts[n] = await runPart(n, ctx);
      return out; }));
  }
  function status() { return { version: POINT_VERSION, parts: Object.keys(PARTS), operatorParts: [...OPERATOR_PARTS], cached: cache.size, stats: { ...stats }, partMs: PART_MS, firstMs: FIRST_MS, stateMs: STATE_MS, retry: { firstS: RETRY_MS / 1000, tries: RETRIES } }; }
  /* v91.17.283.37 · the context the parts of a point read (the place table's unit of the point, else the point state's area): the national
     hazard grid (hazardgrid.mjs) builds its site levels with it, so a grid point is scored as the place bundle scores that point */
  function siteCtx(lat, lon, ps, view = 'customer') { const P = placeOf({ lat, lon }); const a = (ps && ps.area) || {}; const uid = (P.ok && P.place.unitId) || a.unitId || null;
    return { lat: P.ok ? P.lat : lat, lon: P.ok ? P.lon : lon, place: P.ok ? P.place : null, uid, elevM: ps && ps.point ? ps.point.elevM : null, view, ps }; }
  return { bundle, batch, batchParts: BATCH_PARTS, status, stamp: stampOf, siteCtx, onDemand: [...ON_DEMAND] };   /* v283.24 D: placeOf and _cache were exported and never read */
}
