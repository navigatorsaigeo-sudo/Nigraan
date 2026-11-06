/* ══ v91.17.199 · DAILY ARCHIVE OF THE SECOND PROVIDER'S FORECASTS (Visual Crossing, vc.key) ══════════════════════════════
   The plan on vc.key does not serve past forecasts ("historical forecast requests are not permitted", tested 7 Oct 2026), so a
   second-provider input can only be trained on forecasts NIGRAAN saves itself. Once a day (about 00:40 UTC, after the 00Z runs
   are in the provider's blend) this module requests the 7-day hourly forecast at each point of data/vc-archive-points.json (the
   national model's training stations) and writes one gzip file per day to station-lake/archive/vc/vc_YYYY-MM-DD.json.gz:
   { issued, points: [{ pid, start, temp[], dew[], wind[], cloud[], rain[], solar[] }] } (hourly from 00 UTC of the issue day).
   Cost: about 7 records per point, ~1,900 a day. Nothing is served from this archive; after 3-6 months it is scored against the
   stations and used only if it improves the held-out score. NIGRAAN_VCARCHIVE=0 switches it off. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { schedule } from './scheduler.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (x) => (x == null || !Number.isFinite(Number(x)) ? null : Math.round(Number(x) * 10) / 10);

export function createVcArchive(app, dataDir) {
  const root = join(dataDir, '..');
  const keyOf = () => { try { const f = join(root, 'vc.key'); if (!existsSync(f)) return null; const v = readFileSync(f, 'utf8').trim(); return /^[A-Za-z0-9]{16,64}$/.test(v) ? v : null; } catch (_) { return null; } };
  const on = () => process.env.NIGRAAN_VCARCHIVE !== '0' && !!keyOf();
  const out = join(dataDir, '..', '..', 'station-lake', 'archive', 'vc');
  const state = { lastRun: null, lastFile: null, points: 0, saved: 0, failed: 0, queryCost: 0, lastError: null, running: false };

  async function run(force = false) {
    const key = keyOf(); if (!key || state.running) return;
    const day = new Date().toISOString().slice(0, 10), file = join(out, `vc_${day}.json.gz`);
    if (!force && existsSync(file)) return;
    let P = []; try { P = JSON.parse(readFileSync(join(dataDir, 'vc-archive-points.json'), 'utf8')).points || []; } catch (_) {}
    if (!P.length) { state.lastError = 'no points file'; return; }
    state.running = true; state.saved = 0; state.failed = 0; state.queryCost = 0; state.points = P.length;
    const end = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10); const rows = [];
    try {
      for (const p of P) {
        const u = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${p.lat},${p.lon}/${day}/${end}` +
          `?unitGroup=metric&include=hours&timezone=Z&elements=datetimeEpoch,temp,dew,windspeed,cloudcover,precip,solarradiation&key=${key}`;
        let j = null;
        for (let a = 0; a < 3 && !j; a++) {
          try { const r = await fetch(u, { signal: AbortSignal.timeout(60000) }); if (r.status === 429) { await sleep(30000 * (a + 1)); continue; } if (!r.ok) break; j = await r.json(); }
          catch (_) { await sleep(5000 * (a + 1)); }
        }
        if (!j || !Array.isArray(j.days)) { state.failed++; continue; }
        state.queryCost += Number(j.queryCost) || 0;
        const H = []; for (const d of j.days) for (const h of d.hours || []) H.push(h);
        rows.push({ pid: p.pid, start: H.length ? H[0].datetimeEpoch : null, temp: H.map((h) => r1(h.temp)), dew: H.map((h) => r1(h.dew)), wind: H.map((h) => r1(h.windspeed)),
          cloud: H.map((h) => r1(h.cloudcover)), rain: H.map((h) => r1(h.precip)), solar: H.map((h) => r1(h.solarradiation)) });
        state.saved++; await sleep(250);
      }
      mkdirSync(out, { recursive: true });
      writeFileSync(file + '.tmp', gzipSync(Buffer.from(JSON.stringify({ issued: new Date().toISOString(), provider: 'Visual Crossing timeline (forecast)', points: rows }))));
      renameSync(file + '.tmp', file);
      state.lastFile = file; state.lastRun = new Date().toISOString(); state.lastError = null;
    } catch (e) { state.lastError = String(e.message || e).replace(/key=[^&\s]+/g, 'key=[key]'); }
    finally { state.running = false; }
  }
  function status() { return { on: on(), keyPresent: !!keyOf(), ...state, use: 'internal archive; not served' }; }
  function start() {
    if (!on()) return;
    const tick = () => { const d = new Date(); if (d.getUTCHours() >= 0 && (d.getUTCHours() > 0 || d.getUTCMinutes() >= 40)) run(); };
    schedule(app, 'vcArchive', 15 * 60e3, tick, { firstMs: 180e3, label: 'second-provider forecast archive' });
  }
  return { run, status, start };
}
