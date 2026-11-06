/* ══ v91.17.283.2 · D2 + D4 · ONE BEST_MATCH FETCH PER TEHSIL AND MODEL RUN (provider-call cuts) ══════════════════════════════════════
   Before: the engine page asked five overlapping best_match sets for the same tehsils (two 120-place sets, one with time zone `auto` and
   one with Asia/Karachi, and three 36-place sets with `auto`), and the national job asked the same tehsils again in GMT. Each set was
   fetched again on every newer model run.

   Now one SUPERSET per tehsil and model run is fetched (time zone `auto`, 7 past days + 6 forecast days, the union of the variables the
   five sets and the national job ask) and every request whose answer is exactly a part of it is rebuilt from it:
     - the provider answers each location of a multi-location request on its own, and each variable on its own; a series at a timestamp
       does not depend on the window asked (the window only chooses which local days are listed);
     - so a request with the same location, height and model, the same time zone, a window inside the superset's and variables inside
       its variables is the superset's location row cut to the request's local days and variables, in the request's order;
     - time zone: `auto` is resolved by the provider per location. A row fetched with `auto` that came back as Asia/Karachi is also the row
       of a request with timezone=Asia/Karachi (the same zone). A row that resolved to any other zone (a point in the IIOJK polygons gives
       Asia/Kolkata) serves `auto` requests only; an Asia/Karachi request for that place gets its own Asia/Karachi superset row;
     - GMT (the national job): an Asia/Karachi row (UTC+5, no daylight saving) holds the same hourly values at the same instants; the GMT
       answer is those hours relabelled in UTC, for the request's UTC days. Rows in any other zone are never converted;
     - a row is used only for the run key the provider has now (modelruns.mjs) and only on the Pakistan day it was fetched (the sweep
       cache's own day rule). Anything else (another model, another parameter, a window outside the superset, a missing row that cannot
       be fetched) returns null and the caller fetches as before;
     - only the tehsil points (contract/units.json, the places the five sets and the national job ask) are kept in the superset: a request
       with any other location (the area grid, a point) is never widened to it (that would cost more, not less).
   Two supersets per place: `main` (every variable but the precipitation probabilities) and `prob` (precipitation_probability and its
   daily maximum): a probability variable makes the provider's answer depend on the ensemble domains too (data/provider-models.json), so
   keeping it apart means a new ensemble run fetches 2 variables again, not 44. NIGRAAN_BM_SUPERSET=0 turns all of it off. */

const GROUPS = [
  { id: 'main',
    hourly: ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'dew_point_2m', 'precipitation', 'snowfall', 'snow_depth', 'cloud_cover',
      'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'shortwave_radiation', 'surface_pressure', 'pressure_msl', 'temperature_850hPa', 'wind_speed_850hPa',
      'freezing_level_height', 'cape', 'uv_index', 'soil_moisture_9_to_27cm', 'soil_moisture_27_to_81cm'],
    daily: ['temperature_2m_max', 'temperature_2m_min', 'temperature_2m_mean', 'apparent_temperature_max', 'relative_humidity_2m_mean', 'dew_point_2m_mean',
      'precipitation_sum', 'precipitation_hours', 'wind_speed_10m_max', 'wind_gusts_10m_max', 'uv_index_max', 'shortwave_radiation_sum', 'et0_fao_evapotranspiration', 'snowfall_sum'],
    current: ['temperature_2m', 'relative_humidity_2m', 'precipitation', 'wind_speed_10m', 'wind_gusts_10m', 'soil_moisture_0_to_1cm', 'soil_moisture_1_to_3cm',
      'soil_moisture_9_to_27cm', 'soil_moisture_27_to_81cm'] },
  { id: 'prob', hourly: ['precipitation_probability'], daily: ['precipitation_probability_max'], current: [] },
];
const BLOCKS = ['hourly', 'daily', 'current'];
const SUPER_PAST = 7, SUPER_FC = 6;
const ALLOWED = new Set(['latitude', 'longitude', 'elevation', 'hourly', 'daily', 'current', 'forecast_days', 'past_days', 'timezone', 'models']);
const PKT = 5 * 3600e3;
const pkDay = (ms) => new Date(ms + PKT).toISOString().slice(0, 10);
const list = (v) => (v == null ? [] : String(v).split(',')).map((x) => x.trim()).filter(Boolean);
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? String(n) : null; };

export function createBmRows({ runs, isPlace = () => true, now = () => Date.now(), enabled = () => process.env.NIGRAAN_BM_SUPERSET !== '0' }) {
  let fetcher = null;                       /* (URLSearchParams, cls) -> Promise<rows[]>; set by server.mjs (its own provider path and accounting) */
  const ROWS = new Map();                   /* group|tz|lat|lon|elev -> { run, at, day, row, usedAt } */
  const INFL = new Map();                   /* same key -> Promise (a superset fetch on its way that will hold this row) */
  const st = { composed: 0, composedGmt: 0, gmtLocations: 0, fallback: 0, supersetCalls: 0, supersetLocations: 0, failed: 0, why: {} };
  const miss = (w) => { st.fallback++; st.why[w] = (st.why[w] || 0) + 1; return null; };
  const gspec = (g) => runs && runs.specFor('forecast', (k) => (k === 'hourly' ? g.hourly.join(',') : k === 'daily' ? g.daily.join(',') : k === 'current' ? g.current.join(',') : null));
  const keyOf = (g, tz, l) => g.id + '|' + tz + '|' + l.la + '|' + l.lo + '|' + l.el;
  const parseRun = (k) => Object.fromEntries(String(k || '').split(',').filter(Boolean).map((x) => { const i = x.lastIndexOf('@'); return [x.slice(0, i), x.slice(i + 1)]; }));
  /* a row is current when its run key is the provider's run now for its group and (when the caller names the run it wants) agrees with it */
  const agrees = (run, want) => { if (!want) return true; const W = parseRun(want), R = parseRun(run); for (const d of Object.keys(R)) if (d in W && W[d] !== R[d]) return false; return true; };
  /* v91.17.283.26 · a row of the same run is used on the next Pakistan day too, cut to that day's window (daysOf finds today in the row):
     live 26 Oct the whole superset (3,110 weighted calls) was fetched again 15 minutes after PKT midnight with no new run; the values of a
     run at an hour do not depend on the day the row was fetched. A row older than that (two days) is never used. */
  const dayOk = (e) => { const t = now(); return e.day === pkDay(t) || e.day === pkDay(t - 864e5); };
  function fresh(e, g, want) {
    if (!e || !dayOk(e)) return false;
    const k = runs.key(gspec(g)); if (!k || e.run !== k) return false;
    return agrees(e.run, want);
  }
  /* the request: its locations, groups, blocks; null when it is not exactly a part of the superset */
  function parse(get, gmt, keys) {
    if (!enabled() || !runs) return null;
    if (!Array.isArray(keys) || keys.some((k) => !ALLOWED.has(k))) return null;   /* any other parameter changes the answer */
    const m = list(get('models')); if (m.length > 1 || (m.length === 1 && m[0] !== 'best_match')) return null;
    const tz = String(get('timezone') || 'GMT');
    if (gmt ? tz !== 'GMT' : !(tz === 'auto' || tz === 'Asia/Karachi')) return null;
    const pd = get('past_days') == null || get('past_days') === '' ? 0 : Number(get('past_days')), fd = get('forecast_days') == null || get('forecast_days') === '' ? 7 : Number(get('forecast_days'));
    if (!Number.isInteger(pd) || !Number.isInteger(fd) || pd < 0 || fd < 1 || pd > SUPER_PAST || fd > SUPER_FC) return null;
    const la = list(get('latitude')), lo = list(get('longitude')), el = list(get('elevation'));
    if (!la.length || la.length !== lo.length || el.length !== la.length) return null;
    const locs = []; for (let i = 0; i < la.length; i++) { const a = num(la[i]), b = num(lo[i]), c = el[i] === 'nan' ? 'nan' : num(el[i]); if (a == null || b == null || c == null || !isPlace(a, b)) return null; locs.push({ la: a, lo: b, el: c }); }
    const want = {}; const need = new Set();
    for (const b of BLOCKS) { const v = list(get(b)); if (new Set(v).size !== v.length) return null; want[b] = v;
      for (const x of v) { const g = GROUPS.find((G) => G[b].includes(x)); if (!g) return null; need.add(g); } }
    if (gmt && (want.daily.length || want.current.length)) return null;
    if (!need.size) return null;
    return { tz, pd, fd, locs, want, groups: GROUPS.filter((g) => need.has(g)) };
  }
  /* fetch the superset of group g in time zone tz for these locations (each location once per run, concurrent callers share the call) */
  function fetchRows(g, tz, locs, cls) {
    const out = []; const todo = [];
    for (const l of locs) { const k = keyOf(g, tz, l); if (INFL.has(k)) out.push(INFL.get(k)); else todo.push(l); }
    if (todo.length) {
      const seen = new Set(); const uniq = todo.filter((l) => { const k = keyOf(g, tz, l); if (seen.has(k)) return false; seen.add(k); return true; });
      const p = (async () => {
        if (!fetcher) throw new Error('no superset fetcher');
        const spec = gspec(g); const run = await runs.poll(spec); if (!run) throw new Error('run not known');
        const q = new URLSearchParams();
        q.set('latitude', uniq.map((l) => l.la).join(',')); q.set('longitude', uniq.map((l) => l.lo).join(',')); q.set('elevation', uniq.map((l) => l.el).join(','));
        if (g.hourly.length) q.set('hourly', g.hourly.join(',')); if (g.daily.length) q.set('daily', g.daily.join(',')); if (g.current.length) q.set('current', g.current.join(','));
        q.set('past_days', String(SUPER_PAST)); q.set('forecast_days', String(SUPER_FC)); q.set('timezone', tz); q.set('models', 'best_match');
        const at = now(); st.supersetCalls++; st.supersetLocations += uniq.length;
        const rows = await fetcher(q, cls || 'background');
        if (!Array.isArray(rows) || rows.length !== uniq.length) throw new Error('superset answer has ' + (rows && rows.length) + ' rows for ' + uniq.length + ' places');
        if (runs.key(spec) !== run) throw new Error('run changed during the fetch');
        uniq.forEach((l, i) => { const row = rows[i]; if (!row || !row.hourly) return; const e = { run, at, day: pkDay(at), row, usedAt: 0, ct: rows.ct || null };
          ROWS.set(keyOf(g, tz, l), e);
          if (tz === 'auto' && row.timezone === 'Asia/Karachi') ROWS.set(keyOf(g, 'Asia/Karachi', l), e); });   /* the same zone: the same answer */
      })();
      const pp = p.catch((e) => { st.failed++; throw e; }).finally(() => { for (const l of uniq) if (INFL.get(keyOf(g, tz, l)) === pp) INFL.delete(keyOf(g, tz, l)); });
      for (const l of uniq) INFL.set(keyOf(g, tz, l), pp);
      out.push(pp);
    }
    return Promise.all(out.map((x) => x.catch(() => null)));
  }
  /* make sure every row of the request is held for the run now (fetching what is missing), or say why not */
  let lastDay = null;
  async function ensure(P, want, cls, canFetch = true) {
    const d = pkDay(now()); if (d !== lastDay) { lastDay = d; prune(); }
    for (const g of P.groups) {
      const cur = runs.key(gspec(g)); if (cur && !agrees(cur, want)) return 'the caller wants another run than the provider has now';
      const lacking = (tz) => P.locs.filter((l) => !fresh(ROWS.get(keyOf(g, tz, l)), g, want));
      let m = lacking(P.tz); if (!m.length) continue;
      if (!canFetch) return 'rows not held';
      /* `auto` first (it may also give the Asia/Karachi rows); an Asia/Karachi row that `auto` resolved elsewhere is fetched in that zone */
      const ma = m.filter((l) => !fresh(ROWS.get(keyOf(g, 'auto', l)), g, want));   /* a fresh `auto` row that resolved elsewhere is not asked again */
      if (ma.length) await fetchRows(g, 'auto', ma, cls);
      if (P.tz !== 'auto') { m = lacking(P.tz); if (m.length) await fetchRows(g, P.tz, m, cls); }
      if (lacking(P.tz).length) return 'superset rows missing after the fetch';
    }
    return null;
  }
  const dateOf = (t) => String(t).slice(0, 10);
  /* the local days of a superset row for a window of pd past and fd forecast days (the row's own "today" is its 8th day) */
  function daysOf(row, pd, fd) {
    const T = row.hourly && row.hourly.time; if (!Array.isArray(T) || !T.length) return null;
    const D = []; for (const t of T) { const d = dateOf(t); if (D[D.length - 1] !== d) D.push(d); }
    if (D.length !== SUPER_PAST + SUPER_FC) return null;
    /* v91.17.283.26 · "today" is the row's own local date now (its 8th day on the day it was fetched, its 9th after the local midnight);
       the window must lie inside the row */
    const k = D.indexOf(dateOf(new Date(now() + (Number(row.utc_offset_seconds) || 0) * 1000).toISOString()));
    if (k < 0 || k - pd < 0 || k + fd > D.length) return null;
    return new Set(D.slice(k - pd, k + fd));
  }
  const BASE = ['latitude', 'longitude', 'generationtime_ms', 'utc_offset_seconds', 'timezone', 'timezone_abbreviation', 'elevation'];
  /* one location of a local-time request, from its group rows */
  function rowFor(P, l) {
    const R = {}; for (const g of P.groups) R[g.id] = ROWS.get(keyOf(g, P.tz, l)).row;
    const first = R[P.groups[0].id];
    for (const g of P.groups.slice(1)) for (const k of BASE) if (k !== 'generationtime_ms' && JSON.stringify(R[g.id][k]) !== JSON.stringify(first[k])) return null;
    const days = daysOf(first, P.pd, P.fd); if (!days) return null;
    for (const g of P.groups.slice(1)) { const d2 = daysOf(R[g.id], P.pd, P.fd); if (!d2 || [...d2].join() !== [...days].join()) return null; }
    const src = (b, v) => R[P.groups.find((g) => g[b].includes(v)).id];
    const o = {};
    /* the block order of the provider's own answer (the main row holds every block) */
    const order = Object.keys(R.main || first);
    for (const k of order) {
      if (BASE.includes(k)) { o[k] = first[k]; continue; }
      const bm = /^(hourly|daily|current)(_units)?$/.exec(k); if (!bm) continue;
      const b = bm[1], units = !!bm[2], V = P.want[b]; if (!V.length) continue;
      const S0 = (R.main && R.main[k]) || first[k]; if (!S0) return null;
      if (b === 'current') {
        const C = {}; for (const kk of Object.keys(S0)) if (kk === 'time' || kk === 'interval') C[kk] = S0[kk];
        for (const v of V) { const s = src(b, v)[k]; if (!s || !(v in s)) return null; C[v] = s[v]; }
        o[k] = C; continue;
      }
      if (units) { const U = {}; for (const kk of Object.keys(S0)) if (kk === 'time') U[kk] = S0[kk];
        for (const v of V) { const s = src(b, v)[k]; if (!s || !(v in s)) return null; U[v] = s[v]; } o[k] = U; continue; }
      const T = S0.time; if (!Array.isArray(T)) return null; const idx = []; for (let i = 0; i < T.length; i++) if (days.has(dateOf(T[i]))) idx.push(i);
      if (!idx.length || idx[idx.length - 1] - idx[0] !== idx.length - 1) return null;
      const B = { time: T.slice(idx[0], idx[0] + idx.length) };
      for (const v of V) { const s = src(b, v)[k]; if (!s || !Array.isArray(s[v]) || s[v].length !== T.length || (s !== S0 && JSON.stringify(s.time) !== JSON.stringify(T))) return null; B[v] = s[v].slice(idx[0], idx[0] + idx.length); }
      o[k] = B;
    }
    for (const b of BLOCKS) if (P.want[b].length && !(b in o)) return null;
    return o;
  }
  /* a sweep request (local time zone): the body the provider would give for it, from the superset; null = fetch as before */
  async function compose(get, { keys, want = null, cls = 'background', mark = true } = {}) {
    const P = parse(get, false, keys); if (!P) return miss('not a part of the superset');
    const why = await ensure(P, want, cls); if (why) return miss(why);
    const out = []; let at = Infinity, ct = null;
    for (const l of P.locs) { const o = rowFor(P, l); if (!o) return miss('row does not cut to the request');
      out.push(o); for (const g of P.groups) { const e = ROWS.get(keyOf(g, P.tz, l)); at = Math.min(at, e.at); ct = ct || e.ct; if (mark) e.usedAt = now(); } }
    const run = runs.key(gspec(P.groups[P.groups.length - 1]));
    st.composed++;
    return { body: Buffer.from(JSON.stringify(out.length === 1 ? out[0] : out)), at, run, ct };
  }
  /* the national job (GMT, hourly only): the rows held for this run in Asia/Karachi relabelled in UTC; per location, null where not held.
     A location whose row a sweep used in the last 3 hours is fetched into the superset when missing (the sweeps then reuse it); others are not. */
  async function composeGmt(params, { cls = 'background' } = {}) {
    const get = (k) => { const v = params[k]; return v == null ? null : Array.isArray(v) ? v.join(',') : String(v); };
    const P = parse(get, true, Object.keys(params).filter((k) => params[k] != null && params[k] !== '')); if (!P || P.groups.length !== 1 || P.groups[0].id !== 'main') return null;
    const g = P.groups[0]; const K = (l) => ROWS.get(keyOf(g, 'Asia/Karachi', l));
    const active = (l) => { const e = ROWS.get(keyOf(g, 'auto', l)) || K(l); return e && now() - e.usedAt < 3 * 3600e3; };
    const fetchFor = P.locs.filter((l) => !fresh(K(l), g, null) && active(l));
    if (fetchFor.length) await fetchRows(g, 'auto', fetchFor, cls);
    const t = now(), d0 = Date.parse(new Date(t).toISOString().slice(0, 10) + 'T00:00:00Z') - P.pd * 864e5, n = (P.pd + P.fd) * 24;
    const out = P.locs.map((l) => {
      const e = K(l); if (!fresh(e, g, null)) return null; const r = e.row;
      if (r.utc_offset_seconds !== 18000 || r.timezone !== 'Asia/Karachi') return null;
      const H = r.hourly, T = H && H.time; if (!Array.isArray(T) || !T.length) return null;
      const s0 = Date.parse(T[0] + 'Z') - 18000e3; const i0 = Math.round((d0 - s0) / 3600e3);
      if (i0 < 0 || i0 + n > T.length) return null;
      for (const k of [i0, i0 + n - 1]) if (Date.parse(T[k] + 'Z') - 18000e3 !== d0 + (k - i0) * 3600e3) return null;   /* an hourly axis without gaps */
      const iso = (ms) => new Date(ms).toISOString().slice(0, 16);
      const o = {}; for (const k of BASE) o[k] = r[k]; o.utc_offset_seconds = 0; o.timezone = 'GMT'; o.timezone_abbreviation = 'GMT';
      const U = { time: r.hourly_units ? r.hourly_units.time : 'iso8601' }; const B = { time: [] };
      for (let k = 0; k < n; k++) B.time.push(iso(d0 + k * 3600e3));
      for (const v of P.want.hourly) { if (!Array.isArray(H[v]) || H[v].length !== T.length) return null; U[v] = r.hourly_units ? r.hourly_units[v] : undefined; B[v] = H[v].slice(i0, i0 + n); }
      const oo = {}; for (const k of Object.keys(r)) { if (BASE.includes(k)) oo[k] = o[k]; else if (k === 'hourly_units') oo[k] = U; else if (k === 'hourly') oo[k] = B; }
      return structuredClone(oo);
    });
    const held = out.filter(Boolean).length; if (held) { st.composedGmt++; st.gmtLocations += held; }
    return out;
  }
  function status() { return { on: enabled(), rows: ROWS.size, inflight: INFL.size, superset: { pastDays: SUPER_PAST, forecastDays: SUPER_FC, groups: GROUPS.map((g) => ({ id: g.id, variables: g.hourly.length + g.daily.length + g.current.length })) }, ...st }; }
  function prune() { for (const [k, e] of ROWS) if (!dayOk(e)) ROWS.delete(k); }
  /* v91.17.283.3 · budget cut 2 · the rows survive a restart (runstate.mjs): only today's rows (PKT day), each with its run key; fresh() still
     uses a row only while that key is the provider's run now, so a run that changed while the server was down is fetched again */
  function snapshot() { return [...ROWS.entries()].filter(([, e]) => dayOk(e)).map(([k, e]) => [k, { run: e.run, at: e.at, day: e.day, row: e.row, usedAt: e.usedAt, ct: e.ct || null }]); }
  function restore(list) { let n = 0; for (const [k, e] of Array.isArray(list) ? list : []) { if (!e || !dayOk(e) || !e.row || !e.run || ROWS.has(k)) continue; ROWS.set(k, { ...e }); n++; } return n; }
  return { setFetcher: (f) => { fetcher = f; }, compose, composeGmt, parse, status, prune, snapshot, restore, GROUPS, _rows: ROWS };
}
