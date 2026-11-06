/* v91.17.283 · WS1 · test helper: runs <root>/server/server.mjs with the provider replaced by scripts/tests267/om_mock.mjs (no network:
   /v1/forecast on *.open-meteo.com (single runs included) and a model's static meta.json are answered from the mock, every other outbound
   host fails at once). The clock is real (the call budget's day window is today's). Environment passes through (port, data folder, limits).
   Model metadata: WS1_META_FILE (JSON {"<domain>": {"init": s, "avail": s, "interval": s}, "*": {...}}), re-read on every request, so a
   test can publish a "new run"; without it every domain reports the 6-hourly run before the last. Each forecast answer carries
   agn_mock_run (the sum of the runs in the metadata file) and an hourly column agn_run (agn_run_<model> per model of a multi-model request) so a test can see which run a served body, or one model's columns, was made from. WS1_CALL_LOG: one
   line per upstream call ({path, q}). /v1/climate (CMIP6) is answered with a deterministic series of the asked coordinates.
   usage: node child.mjs <root> */
import { join, dirname } from 'node:path';
import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { omAnswer } from '../../tests267/om_mock.mjs';
const root = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const realFetch = globalThis.fetch;
let metaLast = null; const metaOf = () => { if (!process.env.WS1_META_FILE) return null; try { metaLast = JSON.parse(readFileSync(process.env.WS1_META_FILE, 'utf8')); } catch (_) {} return metaLast; };   /* a read during the test's rewrite keeps the last good one */
const runMark = () => { const M = metaOf(); return M ? Object.values(M).reduce((a, e) => a + (Number(e && e.init) || 0), 0) : 0; };
const logCall = (u) => { if (process.env.WS1_CALL_LOG) try { const q = new URLSearchParams(u.search); q.delete('apikey'); appendFileSync(process.env.WS1_CALL_LOG, JSON.stringify({ t: Date.now(), path: u.pathname, q: q.toString() }) + '\n'); } catch (_) {} };
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url && url.url ? url.url : url));
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]') return realFetch(url, opts);
  if (/open-meteo\.com$/.test(u.hostname) && /\/static\/meta\.json$/.test(u.pathname)) {
    logCall(u); const d = u.pathname.split('/')[2]; const M = metaOf();
    if (M) { const e = M[d] || M['*']; if (!e) return new Response('{"error":true,"reason":"Not Found"}', { status: 404 }); return json({ last_run_initialisation_time: e.init, last_run_availability_time: e.avail, update_interval_seconds: e.interval }); }
    return json({ last_run_initialisation_time: Math.floor(Date.now() / 21600e3) * 21600 - 21600, last_run_availability_time: Math.floor(Date.now() / 21600e3) * 21600 - 3600, update_interval_seconds: 21600 });
  }
  if (/open-meteo\.com$/.test(u.hostname) && u.pathname === '/v1/forecast') { logCall(u); const a = omAnswer(u.searchParams, Date.now()), r = runMark();
    const ms = String(u.searchParams.get('models') || '').split(',').filter(Boolean);
    for (const L of (Array.isArray(a) ? a : [a])) { if (!L) continue; L.agn_mock_run = r;
      if (metaOf() && L.hourly && Array.isArray(L.hourly.time)) { if (ms.length > 1) for (const m of ms) L.hourly['agn_run_' + m] = L.hourly.time.map(() => r); else L.hourly.agn_run = L.hourly.time.map(() => r); } }
    return json(a); }
  if (/open-meteo\.com$/.test(u.hostname) && u.pathname === '/v1/climate') { logCall(u); const q = u.searchParams; const s0 = Date.parse(q.get('start_date') + 'T00:00:00Z'), e0 = Date.parse(q.get('end_date') + 'T00:00:00Z');
    const time = []; for (let t = s0; t <= e0 && time.length < 40000; t += 864e5) time.push(new Date(t).toISOString().slice(0, 10)); const la = Number(q.get('latitude')), lo = Number(q.get('longitude'));
    const daily = { time }; for (const m of String(q.get('models') || '').split(',').filter(Boolean)) for (const v of String(q.get('daily') || '').split(',').filter(Boolean)) daily[v + '_' + m] = time.map((t, i) => Math.round((20 + la - 30 + (lo - 70) * 0.1 + Math.sin(i / 58)) * 10) / 10);
    return json({ latitude: la, longitude: lo, elevation: 500, generationtime_ms: 1, utc_offset_seconds: 18000, timezone: 'Asia/Karachi', daily }); }
  throw new Error('offline test: no network for ' + u.hostname);
};
await import(pathToFileURL(join(root, 'server', 'server.mjs')).href);
