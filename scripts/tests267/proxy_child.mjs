/* v91.17.267 · test helper: runs <root>/server/server.mjs on <port> with the provider replaced by om_mock.mjs and the clock frozen at
   <nowMs>, so two installs (v266 and v267) answer the same /px forecast requests from the same inputs. Every upstream call is appended
   to <callLog> (one JSON line: host, models, locations). No network: any other outbound host fails.
   usage: node proxy_child.mjs <root> <port> <nowMs> <callLog>   (env passes through, e.g. NIGRAAN_BLEND=0) */
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { omAnswer } from './om_mock.mjs';
const [root, port, nowArg, callLog] = process.argv.slice(2);
const NOW = Number(nowArg);
Object.assign(process.env, { PORT: String(port), MACH_API_KEY: 'test-key-not-a-real-key', NIGRAAN_WORKER: '0', NIGRAAN_AUTO_SCHEDULE: '0', NIGRAAN_ENGINE: '0',
  NIGRAAN_PYJOBS: '0', NIGRAAN_SWEEP_WARM: '0', NIGRAAN_SYNOP: '0', NIGRAAN_MACH_DB_SYNC: '0', NIGRAAN_FLEET_BACKFILL: '0', NIGRAAN_TILES: '0' });
const RealDate = Date;
class FrozenDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
globalThis.Date = FrozenDate;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url));
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return realFetch(url, opts);
  if (/open-meteo\.com$/.test(u.hostname) && u.pathname === '/v1/forecast') {
    try { appendFileSync(callLog, JSON.stringify({ host: u.hostname, models: u.searchParams.get('models') || 'best_match', locations: String(u.searchParams.get('latitude') || '').split(',').length, lats: String(u.searchParams.get('latitude') || ''), hourly: u.searchParams.get('hourly') }) + '\n'); } catch (_) {}
    return new Response(JSON.stringify(omAnswer(u.searchParams, NOW)), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error('offline test: no network for ' + u.hostname);
};
await import(pathToFileURL(join(root, 'server', 'server.mjs')).href);
