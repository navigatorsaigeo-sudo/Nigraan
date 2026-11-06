/* v91.17.283.20: land takes forecast_days (the compound-flood inputs: 7 past days and all of today); new product inputs (the district
   rows' model inputs, 40 points per request). */
/* == v91.17.283.15 . POINT PRODUCTS: THE SERVER HOLDS EVERY PROVIDER PRODUCT A PAGE SHOWS AT A PLACE ===================================
   v91.17.283.19: the land-surface inputs of a place (current, the 7 past days and the hourly inputs the point state does not hold) are a
   part of the place bundle (server/api/point.mjs: index.mjs asks this product); the page no longer asks the land product itself.
   Item 3 of v283.15 (the v283.12 gate exceptions): the ensemble outlook, the multi-model card, the 15-minute nowcast, the skill archive,
   the river-flow reaches and gauges, the CMIP6 projection and the land-surface inputs were asked of the provider by the page itself (each
   viewer, each card, its own request). They are now asked here, once per product, place and run, and every page reads them through its one
   in-page store (AGN.pointState.product): GET /api/pointstate/product?name=<product>&latitude=&longitude=[&...].
     - the host, path and allowed keys of each product are fixed here (PRODUCTS); any other key is refused, values are checked
     - coordinates are rounded to 0.001 deg (about 100 m, inside one 0.05 deg river cell) so one place gives one record
     - a record is kept until its stamp changes: the model run of the point state (forecast products), the 15-minute slot (nowcast), the
       PKT day (archives, previous runs), or 6 h (the CMIP6 projection, kept on disk by the proxy); in memory, at most 4,000 records and 64 MB
     - the request goes through this server's own provider route (/px, the same budget, quota and key handling as before)
   These values are the provider's products, labelled as such on their cards (ensemble shares, models side by side, a projection): they
   are not the point's corrected weather, which is the point state's alone. */
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const LIST = (re, max) => (v) => { const a = String(v).split(','); return a.length <= max && a.every((x) => re.test(x)) ? a.join(',') : null; };
const INT = (lo, hi) => (v) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? String(n) : null; };
const ENUM = (...a) => (v) => (a.includes(String(v)) ? String(v) : null);
const DATE = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) && Number.isFinite(Date.parse(String(v))) ? String(v) : null);
const VARP = /^[a-z][a-z0-9_]{1,40}(_\d{3,4}hPa)?$/;   /* v91.17.283.20 · a pressure-level variable (temperature_850hPa) */
const VAR = /^[a-z][a-z0-9_]{1,60}$/, MODEL = /^[A-Za-z][A-Za-z0-9_]{1,40}$/, ELEV = /^(-?\d{1,4}(\.\d+)?|nan)$/;
const TZ = ENUM('UTC', 'auto', 'GMT', 'Asia/Karachi');
export const PRODUCTS = {
  nowcast:   { host: 'api.open-meteo.com', path: '/v1/forecast', fresh: 'slot15', keys: { minutely_15: LIST(VAR, 12), hourly: LIST(VAR, 12), past_minutely_15: INT(0, 192), forecast_minutely_15: INT(0, 192), timezone: TZ } },
  models:    { host: 'api.open-meteo.com', path: '/v1/forecast', fresh: 'run', multi: 40, keys: { elevation: LIST(ELEV, 40), hourly: LIST(VAR, 8), forecast_hours: INT(1, 96), models: LIST(MODEL, 12), timezone: TZ } },
  land:      { host: 'api.open-meteo.com', path: '/v1/forecast', fresh: 'run', keys: { elevation: LIST(ELEV, 1), current: LIST(VAR, 12), hourly: LIST(VAR, 12), forecast_hours: INT(1, 168), past_hours: INT(0, 168), forecast_days: INT(1, 16), daily: LIST(VAR, 8), past_days: INT(0, 7), models: ENUM('best_match'), timezone: TZ } },
  ensemble:  { host: 'ensemble-api.open-meteo.com', path: '/v1/ensemble', fresh: 'run', keys: { models: LIST(MODEL, 4), hourly: LIST(VAR, 4), forecast_days: INT(1, 16), temporal_resolution: ENUM('native') } },
  prevruns:  { host: 'previous-runs-api.open-meteo.com', path: '/v1/forecast', fresh: 'day', keys: { hourly: LIST(VAR, 12), past_days: INT(0, 60), forecast_days: INT(0, 2), models: LIST(MODEL, 4), timezone: TZ } },
  archive:   { host: 'archive-api.open-meteo.com', path: '/v1/archive', fresh: 'day', keys: { start_date: DATE, end_date: DATE, hourly: LIST(VAR, 8), models: ENUM('era5'), timezone: TZ } },
  histfc:    { host: 'historical-forecast-api.open-meteo.com', path: '/v1/forecast', fresh: 'day', keys: { start_date: DATE, end_date: DATE, hourly: LIST(VAR, 4), models: LIST(MODEL, 12), timezone: TZ } },
  cmip6:     { host: 'climate-api.open-meteo.com', path: '/v1/climate', fresh: 'static', keys: { start_date: DATE, end_date: DATE, models: LIST(MODEL, 12), daily: ENUM('temperature_2m_max,precipitation_sum'), timezone: TZ } },
  /* v91.17.283.20 · item A5: the model inputs of the page's district rows (40 points per request, their forecast heights, 4 days hourly) */
  inputs:    { host: 'api.open-meteo.com', path: '/v1/forecast', fresh: 'run', multi: 40, keys: { elevation: LIST(ELEV, 40), hourly: LIST(VARP, 12), forecast_days: INT(1, 7), models: ENUM('best_match'), timezone: TZ } },
  riverflow: { host: 'flood-api.open-meteo.com', path: '/v1/flood', fresh: 'run', multi: 60, keys: { daily: LIST(VAR, 6), past_days: INT(0, 92), forecast_days: INT(1, 92), ensemble: ENUM('true'), timezone: TZ } },
};
export function requestOf(name, q) {
  const P = PRODUCTS[name]; if (!P) return { error: 'unknown product ' + String(name).slice(0, 40) };
  const lat = String(q.latitude ?? q.lat ?? '').split(','), lon = String(q.longitude ?? q.lon ?? '').split(',');
  if (!lat.length || lat.length !== lon.length || lat.length > (P.multi || 1)) return { error: 'latitude / longitude: ' + (P.multi || 1) + ' point(s) at most, as many of each' };
  const la = lat.map(Number), lo = lon.map(Number);
  if (!la.every((x) => isN(x) && x >= 20 && x <= 40) || !lo.every((x) => isN(x) && x >= 58 && x <= 80)) return { error: 'the point is outside the Pakistan region' };
  const r3 = (x) => (Math.round(x * 1000) / 1000).toFixed(3);
  const out = [['latitude', la.map(r3).join(',')], ['longitude', lo.map(r3).join(',')]];
  for (const [k, v] of Object.entries(q)) { if (k === 'latitude' || k === 'longitude' || k === 'lat' || k === 'lon' || k === 'name') continue;
    const f = P.keys[k]; if (!f) return { error: 'key ' + String(k).slice(0, 30) + ' is not part of the ' + name + ' product' };
    const val = f(v); if (val == null) return { error: 'value of ' + k + ' is not allowed for the ' + name + ' product' }; out.push([k, val]); }
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { P, qs: out.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&') };
}

export function createPointProducts(app, opts = {}) {
  const now = opts.now || (() => Date.now());
  const port = () => Number(opts.port || process.env.PORT || 8787);
  /* v91.17.283.22 · the caller's tag goes with the request: the place record's products are tagged 'place-record' (a user tag of
     data/provider-budget.json: essential, never shed as background); every other caller keeps 'point-product' */
  const fetchPx = opts.fetchPx || (async (P, qs, tag = 'point-product') => { const r = await fetch(`http://127.0.0.1:${port()}/px${P.path}?__omhost=${P.host}&` + qs, { headers: { 'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': tag }, signal: AbortSignal.timeout(90000) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) { j = null; } return { status: r.status, j, bytes: t.length, basis: r.headers.get('x-agn-climate-basis') || null }; });
  /* v91.17.283.24 · self-audit P7 · the records are held by SIZE and AGE, not only by count: a CMIP6 projection (decades of daily values,
     several models) is megabytes, and 4,000 of them were held for good. Now at most MAX_BYTES (NIGRAAN_POINTPROD_MB, default 64 MB) in
     memory, least recently used first out, and a projection ('static') at most STATIC_MS in memory (the proxy keeps the closed climate
     window on disk, so a projection asked again later costs no provider call); a record of an old stamp is dropped when met. */
  const MAX_BYTES = Math.max(8, Number(process.env.NIGRAAN_POINTPROD_MB) || 32) * 1048576   /* v91.17.283.51 · memory: 32 MB of answer text (was 64; the parsed records are about twice the text on the heap, measured: 131 MB live for 64 MB) */, STATIC_MS = 6 * 3600e3;
  let bytes = 0; const drop = (k) => { const e = cache.get(k); if (e) { bytes -= e.bytes; cache.delete(k); } };
  const cache = new Map(), inflight = new Map();
  function stampOf(P) {
    if (P.fresh === 'static') return 'static';
    if (P.fresh === 'day') return new Date(now() + 5 * 3600e3).toISOString().slice(0, 10);
    if (P.fresh === 'slot15') return 'q' + Math.floor(now() / 900e3);
    try { const s = app.pointState && app.pointState.runStamp ? app.pointState.runStamp() : null; if (s && s.run) return s.run; } catch (_) {}
    return 'h' + Math.floor(now() / 3600e3);
  }
  /* the moment a record of this freshness turns old (the page store keeps it until then, or until the run stamp changes) */
  function validUntil(P) { const t = now(); if (P.fresh === 'slot15') return new Date((Math.floor(t / 900e3) + 1) * 900e3).toISOString();
    if (P.fresh === 'day') { const d = Math.floor((t + 5 * 3600e3) / 864e5) + 1; return new Date(d * 864e5 - 5 * 3600e3).toISOString(); } return null; }
  async function get(name, q, o = {}) {
    const R = requestOf(name, q); if (R.error) { return { status: 400, body: { ok: false, error: R.error } }; }
    const key = name + '?' + R.qs, st = stampOf(R.P); let c = cache.get(key);
    if (c && (c.st !== st || (c.st === 'static' && now() - c.at > STATIC_MS))) { drop(key); c = null; }
    if (c) { cache.delete(key); cache.set(key, c); }   /* most recently used last */
    if (c && c.st === st) { return { status: 200, body: c.j, cached: true, validUntil: validUntil(R.P), basis: c.basis }; }
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => { try { const r = await fetchPx(R.P, R.qs, o.tag);
        if (r.status === 200 && r.j) { const b = Number.isFinite(r.bytes) ? r.bytes : JSON.stringify(r.j).length; drop(key);
          if (b <= MAX_BYTES / 4) { cache.set(key, { st, j: r.j, basis: r.basis, bytes: b, at: now() }); bytes += b; while ((bytes > MAX_BYTES || cache.size > 4000) && cache.size) drop(cache.keys().next().value); }
          return { status: 200, body: r.j, validUntil: validUntil(R.P), basis: r.basis }; }   /* basis: the climate route's x-agn-climate-basis */
        return { status: r.status || 502, body: r.j || { ok: false, error: 'the product did not arrive' } }; }
      catch (e) { return { status: 502, body: { ok: false, error: 'the product did not arrive: ' + String(e && e.message || e).slice(0, 120) } }; }
      finally { inflight.delete(key); } })();
    inflight.set(key, p); return p;
  }
  return { get, products: Object.keys(PRODUCTS) };   /* v283.24: stats removed (never read) */
}
