/* v91.17.283.10 · budget · test helper: runs <root>/server/server.mjs with the provider replaced by scripts/tests267/om_mock.mjs (no network)
   and a movable server clock. Like scripts/tests283/ws1/child.mjs (controllable model metadata WS1_META_FILE, one log line per upstream call
   WS1_CALL_LOG, agn_run columns per model so a test sees which run each model's columns came from), plus:
     - CLOCK_FILE: a number of milliseconds added to the server's clock (Date.now and new Date()), re-read on every reading, so a test can
       move the server into the next clock hour without waiting;
     - forecast_hours / past_hours are answered as the provider does (open-meteo ForecastapiQuery.swift forecastTimeRange2): the hourly axis
       starts at the current hour of the location's own UTC offset (om_mock answers whole local days only).
   usage: node child_clock.mjs <root> */
import { join, dirname } from 'node:path';
import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RD = Date, realNow = RD.now.bind(RD);
let offLast = 0; const off = () => { if (!process.env.CLOCK_FILE) return 0; try { offLast = Number(readFileSync(process.env.CLOCK_FILE, 'utf8')) || 0; } catch (_) {} return offLast; };
class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(realNow() + off()); } static now() { return realNow() + off(); } }
globalThis.Date = FD;
const { omAnswer } = await import(pathToFileURL(join(root, 'scripts', 'tests267', 'om_mock.mjs')).href);
const realFetch = globalThis.fetch;
let metaLast = null; const metaOf = () => { if (!process.env.WS1_META_FILE) return null; try { metaLast = JSON.parse(readFileSync(process.env.WS1_META_FILE, 'utf8')); } catch (_) {} return metaLast; };
const runMark = () => { const M = metaOf(); return M ? Object.values(M).reduce((a, e) => a + (Number(e && e.init) || 0), 0) : 0; };
const logCall = (u) => { if (process.env.WS1_CALL_LOG) try { const q = new URLSearchParams(u.search); q.delete('apikey'); appendFileSync(process.env.WS1_CALL_LOG, JSON.stringify({ t: realNow(), path: u.pathname, q: q.toString() }) + '\n'); } catch (_) {} };
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
const pad = (n) => String(n).padStart(2, '0'); const iso = (s) => { const d = new RD(s * 1000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); };
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url && url.url ? url.url : url));
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]') return realFetch(url, opts);
  if (/open-meteo\.com$/.test(u.hostname) && /\/static\/meta\.json$/.test(u.pathname)) {
    logCall(u); const d = u.pathname.split('/')[2]; const M = metaOf(); const e = M && (M[d] || M['*']);
    if (!e) return new Response('{"error":true,"reason":"Not Found"}', { status: 404 });
    return json({ last_run_initialisation_time: e.init, last_run_availability_time: e.avail, update_interval_seconds: e.interval });
  }
  if (/open-meteo\.com$/.test(u.hostname) && u.pathname === '/v1/forecast') {
    logCall(u); const q = new URLSearchParams(u.searchParams); const fh = q.get('forecast_hours'), ph = q.get('past_hours');
    if (fh != null || ph != null) { q.delete('forecast_hours'); q.delete('past_hours'); q.set('past_days', '1'); q.set('forecast_days', '2'); }
    const a = omAnswer(q, Date.now()), r = runMark(); const ms = String(q.get('models') || '').split(',').filter(Boolean);
    for (const L of (Array.isArray(a) ? a : [a])) { if (!L) continue; L.agn_mock_run = r;
      if (L.hourly && Array.isArray(L.hourly.time)) {
        if (ms.length > 1) for (const m of ms) L.hourly['agn_run_' + m] = L.hourly.time.map(() => r); else L.hourly.agn_run = L.hourly.time.map(() => r);
        if (fh != null || ph != null) { const o = L.utc_offset_seconds || 0; const s = Math.floor((Math.floor(Date.now() / 1000) + o) / 3600) * 3600 - Number(ph || 0) * 3600;
          const i0 = L.hourly.time.indexOf(iso(s)), n = Number(ph || 0) + Number(fh == null ? 24 : fh);
          for (const k of Object.keys(L.hourly)) L.hourly[k] = L.hourly[k].slice(i0, i0 + n); } } }
    return json(a); }
  throw new Error('offline test: no network for ' + u.hostname);
};
await import(pathToFileURL(join(root, 'server', 'server.mjs')).href);
