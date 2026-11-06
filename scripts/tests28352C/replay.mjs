/* test only: a replay of 20 place-page loads against one server: the place card (GET /api/point, first answer, then the completion read),
   a place search as typed (3 prefixes), the hazard surface, and every 5th load the 10-site portfolio batch. A new place every 4 s (a person
   clicking through places while the previous card still completes). Prints card / search / hazardgrid / portfolio times, the event-loop
   delay (/api/loop, reset at the start) and the provider calls the mock counted for this server's port.
   usage: node replay.mjs <base> <places.json> <out.json> [mockPort=8969] [n=20] [gapMs=4000] */
import { readFileSync, writeFileSync } from 'node:fs';
const [B, PF, OUT, MP = '8969', N = '20', GAP = '4000'] = process.argv.slice(2);
const P = JSON.parse(readFileSync(PF, 'utf8')).slice(0, Number(N)); const port = new URL(B).port;
const H = { 'sec-fetch-site': 'same-origin', 'x-agn-view': 'customer' };
const get = async (path, to = 180000) => { const t = Date.now(); try { const r = await fetch(B + path, { headers: H, signal: AbortSignal.timeout(to) }); const b = await r.text(); let j = null; try { j = JSON.parse(b); } catch (_) {} return { ms: Date.now() - t, st: r.status, j, n: b.length }; } catch (e) { return { ms: Date.now() - t, st: 0, err: String(e.message || e).slice(0, 80) }; } };
const ms0 = await (await fetch('http://127.0.0.1:' + MP + '/stats')).json(); const c0 = ms0[port] || { calls: 0, locs: 0 };
await get('/api/loop?reset=1');
const SAMPLE = P.slice(0, 10).map((p) => (+p.lat).toFixed(5) + ',' + (+p.lon).toFixed(5)).join(';');
const res = { card: [], complete: [], search: [], hazard: [], portfolio: [], cardFail: [], stale: 0 };
const jobs = [];
for (let i = 0; i < P.length; i++) { const p = P[i];
  jobs.push((async () => {
    const ll = 'lat=' + p.lat + '&lon=' + p.lon;
    const pre = String(p.name).replace(/^[A-Z]\d+ /, '').slice(0, 5);
    const s = []; for (const k of [3, 4, 5]) s.push(get('/api/geo/search?suggest=1&limit=8&q=' + encodeURIComponent(pre.slice(0, k))));
    const hz = get('/api/hazardgrid?day=0');
    const pf = i % 5 === 0 ? get('/api/point/batch?pts=' + SAMPLE + '&with=place,siteLevels') : null;
    const c = await get('/api/point?' + ll); res.card.push(c.ms); if (!(c.j && c.j.ok)) res.cardFail.push({ name: p.name, ms: c.ms, why: c.j && c.j.why || c.err || c.st }); if (c.j && c.j.stale) res.stale++;
    const cc = await get('/api/point?' + ll + '&complete=1'); res.complete.push(c.ms + cc.ms);
    for (const x of await Promise.all(s)) res.search.push(x.ms);
    res.hazard.push((await hz).ms);
    if (pf) { const x = await pf; const ok = x.j && Array.isArray(x.j.states) ? x.j.states.filter((s) => s && s.ok).length : 0; res.portfolio.push({ ms: x.ms, ok }); }
  })());
  await new Promise((r) => setTimeout(r, Number(GAP)));
}
await Promise.all(jobs);
const loop = (await get('/api/loop')).j; const ms1 = await (await fetch('http://127.0.0.1:' + MP + '/stats')).json(); const c1 = ms1[port] || { calls: 0, locs: 0, byPath: {} };
const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : null; };
const out = { base: B, places: P.length, cardMs: { p50: q(res.card, 0.5), p90: q(res.card, 0.9), max: Math.max(...res.card) }, completeMs: { p50: q(res.complete, 0.5), max: Math.max(...res.complete) },
  searchMs: { p50: q(res.search, 0.5), p90: q(res.search, 0.9), max: Math.max(...res.search) }, hazardMs: { p50: q(res.hazard, 0.5), max: Math.max(...res.hazard) },
  portfolio: res.portfolio, cardFail: res.cardFail, staleCards: res.stale, loop, provider: { calls: c1.calls - c0.calls, locations: c1.locs - c0.locs, byPath: c1.byPath } };
writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out));
