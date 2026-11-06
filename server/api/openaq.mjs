/* ══ v91.17.199 · OPENAQ LOW-COST SENSORS IN PAKISTAN (OpenAQ v3 API, key in openaq.key) ════════════════════════════════
   OpenAQ republishes about 270 active Pakistan locations (AirGradient devices of the Urban Unit network and others, and the
   Pakistan Air Quality Initiative's Hawanama sensors): PM2.5, PM1, and at AirGradient sites temperature, humidity and a
   particle count. Every hour (about 7 past) this module lists the Pakistan locations, reads the latest values of every location
   heard in the last 48 hours (one request each, paced at about one a second: ~270 of the key's 2,000 calls an hour), keeps 14 days
   in data/cache/openaq-recent.json and appends new readings to station-lake/archive/aq/openaq_YYYY-MM.jsonl.
   Use: INTERNAL until the low-cost sensors are calibrated (humidity correction against reference monitors). The data are CC BY 4.0
   (attribution: OpenAQ and the data provider), so they may be shown with credit once calibrated.
   The key is read from openaq.key next to the server folder, sent only in the X-API-Key header, never logged or served.
   NIGRAAN_OPENAQ=0 switches it off.
   v91.17.283.25 · the hourly poll is NIGRAAN's own OpenAQ call only (key needed): the AGN data lake copy (v91.17.269-283.24, dataset
   aq_openaq, the same two calls and 48-hour filter, parity 127 of 127 on 9 Oct 2026) is no longer read (owner, 27 Oct 2026: NIGRAAN
   leaves D:\DATA LAKE). Readings taken from that copy before stay in the 14-day cache and the archive (marked via 'lake copy'). */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.openaq.org/v3';
const num = (v) => { const x = v == null || v === '' ? NaN : Number(v); return Number.isFinite(x) ? x : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createOpenAq(app, dataDir) {
  const root = join(dataDir, '..');
  const keyOf = () => { try { const f = join(root, 'openaq.key'); if (!existsSync(f)) return null; const v = readFileSync(f, 'utf8').trim(); return /^[A-Za-z0-9]{20,128}$/.test(v) ? v : null; } catch (_) { return null; } };
  const on = () => process.env.NIGRAAN_OPENAQ !== '0' && !!keyOf();
  const recFile = join(dataDir, 'cache', 'openaq-recent.json'); const lake = join(dataDir, '..', '..', 'station-lake', 'archive', 'aq');
  let REC = { locations: {}, obs: {} }; try { REC = JSON.parse(readFileSync(recFile, 'utf8')); } catch (_) {}
  const state = { lastPoll: null, lastError: null, listed: 0, active: 0, newReadings: 0, calls: 0, running: false, source: null };

  async function get(path, key) {
    for (let a = 0; a < 4; a++) {
      try {
        const r = await fetch(API + path, { headers: { 'X-API-Key': key, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
        state.calls++;
        if (r.status === 401) throw new Error('key rejected (401)');
        if (r.status === 429 || r.status >= 500) { await sleep(Math.min(65, Number(r.headers.get('x-ratelimit-reset')) || 30) * 1000); continue; }
        if (!r.ok) throw new Error('http ' + r.status);
        const rem = Number(r.headers.get('x-ratelimit-remaining'));
        if (Number.isFinite(rem) && rem <= 2) await sleep((Math.min(65, Number(r.headers.get('x-ratelimit-reset')) || 60) + 1) * 1000);
        return await r.json();
      } catch (e) { if (/401/.test(e.message) || a === 3) throw e; await sleep(5000 * (a + 1)); }
    }
    return null;
  }

  function keep(arch) {
    const cut = Date.now() - 14 * 864e5; for (const O of Object.values(REC.obs)) for (const t of Object.keys(O)) if (Date.parse(t) < cut) delete O[t];
    mkdirSync(join(dataDir, 'cache'), { recursive: true }); writeFileSync(recFile + '.tmp', JSON.stringify(REC)); renameSync(recFile + '.tmp', recFile);
    if (arch.length) { mkdirSync(lake, { recursive: true }); appendFileSync(join(lake, 'openaq_' + new Date().toISOString().slice(0, 7) + '.jsonl'), arch.join('\n') + '\n'); }
  }
  async function poll() {
    if (!on() || state.running) return;
    const key = keyOf(); if (!key) { state.source = null; return; }
    state.source = 'OpenAQ API';
    state.running = true; state.calls = 0;
    try {
      const L = ((await get('/locations?iso=PK&limit=1000', key)) || {}).results || [];
      const now = Date.now();
      const act = L.filter((l) => l && l.datetimeLast && l.datetimeLast.utc && now - Date.parse(l.datetimeLast.utc) < 48 * 3600e3 && l.coordinates);
      let fresh = 0; const arch = [];
      for (const l of act) {
        const id = String(l.id), sens = {};
        for (const s of l.sensors || []) sens[s.id] = s.parameter || {};
        REC.locations[id] = { name: l.name || null, provider: (l.provider || {}).name || null, owner: (l.owner || {}).name || null,
          lat: num(l.coordinates.latitude), lon: num(l.coordinates.longitude), reference: !!l.isMonitor };
        const res = ((await get(`/locations/${id}/latest`, key)) || {}).results || [];
        for (const r of res) {
          const p = sens[r.sensorsId] || {}; const t = r.datetime && r.datetime.utc ? new Date(r.datetime.utc).toISOString().slice(0, 16) + ':00Z' : null;
          const v = num(r.value); if (!t || v == null || !p.name) continue;
          const val = p.name === 'temperature' && /^f$/i.test(p.units || '') ? (v - 32) * 5 / 9 : v;
          const O = REC.obs[id] || (REC.obs[id] = {}); const row = O[t] || (O[t] = {});
          if (row[p.name] == null) { fresh++; arch.push(JSON.stringify({ id, t, parameter: p.name, unit: p.units || null, value: val })); }
          row[p.name] = val;
        }
        await sleep(1050);
      }
      keep(arch);
      state.lastPoll = new Date().toISOString(); state.listed = L.length; state.active = act.length; state.newReadings = fresh; state.lastError = null;
    } catch (e) { state.lastError = String(e.message || e).replace(/[A-Za-z0-9]{40,}/g, '[key]'); }
    finally { state.running = false; }
  }
  function status() { return { on: on(), keyPresent: !!keyOf(), ...state, held: Object.keys(REC.locations).length, use: 'internal until calibrated; CC BY 4.0 (OpenAQ and providers)' }; }
  function start() {
    if (!on()) return;
    const next = () => { const d = new Date(); const ms = ((67 - d.getUTCMinutes()) % 60 || 60) * 60e3 - d.getUTCSeconds() * 1e3; return Math.max(60e3, ms); };
    const loop = () => { poll().finally(() => { const t = setTimeout(loop, next()); if (t.unref) t.unref(); }); };
    const t0 = setTimeout(loop, 120e3); if (t0.unref) t0.unref();
  }
  return { poll, status, start, recent: () => REC };
}
