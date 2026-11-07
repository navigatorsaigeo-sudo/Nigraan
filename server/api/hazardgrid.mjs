/* == v91.17.283.37 · NIGRAAN 1.0.1 · THE NATIONAL HAZARD SURFACE (start page, Pakistan view) ===========================================
   GET /api/hazardgrid?day=N (N = 0..3: today PKT and the next three days) -> the number of hazards at Moderate or above at every point of
   a regular grid over Pakistan land, from the SERVER's point science: at each grid point the place record's site levels
   (placerecord.mjs siteLevels on the point state of that exact point, pointstate.mjs) and the one counting function (hazardcount.mjs
   countOf), the same code the place bundle (GET /api/point part hazardCount) runs for a place. A point with no counted hazard assessed
   (outside Pakistan-administered territory, at sea, IIOJK, or nothing assessed) is null: the page leaves it uncoloured, never 0.
   The page only draws it (no tehsil fill, no page arithmetic on levels).

   COST (measured 30 Oct 2026, BUILD_NOTES_37.md): a point costs about 0.1 s of server CPU (the served correction chain of its point state)
   and about 6.4 weighted provider calls (one 40-location request per call kind). The grid is therefore built ONCE per forecast cycle in the
   background, throttled to a duty cycle so the pages' own requests keep their speed, and cached in data/hazard-grid.json (written
   atomically: temporary file, then rename) keyed by the cycle; a request never computes it.
     cycle      PKT date + half-day: built after 00:30 PKT (the new PKT day; the 12 UTC runs are in) and after 11:30 PKT (the 00 UTC runs are
                in) - two builds a day (NIGRAAN_HAZGRID_CYCLE_HOURS_PKT overrides the start hours)
     spacing    NIGRAAN_HAZGRID_KM (default GRID_KM below, chosen from the measurement); lat step = km / 111.0, lon step = km / 96.4
                (the km of a degree at 30 N), over the Pakistan box
     duty       NIGRAAN_HAZGRID_DUTY (default 0.35): after each chunk the builder rests (1 - duty) / duty of the chunk's own time
   Days are served by DATE: until the new cycle is built, the previous build's day for today's date is served (never another day's). */
import { readFileSync, writeFileSync, renameSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { countOf, countRule, HAZARD_COUNT_VERSION } from './hazardcount.mjs';
export const HAZGRID_VERSION = 'hazard-grid-1 (v91.17.283.37)';
export const GRID_KM = 25;   /* measured choice (BUILD_NOTES_37.md, 30 Oct 2026): 25 km = 1,412 land points, 8.5 min at duty 0.35 (cloud test server); 20 km = 2,209 points, 13 min; 10 km = ~8,900 points, ~55 min: too heavy */
const BOX = { s: 23.6, n: 37.1, w: 60.8, e: 77.9 };
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); });
const pktDate = (ms) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 10);

export function gridDef(km) {
  const dLat = km / 111.0, dLon = km / 96.4;
  const rows = Math.floor((BOX.n - BOX.s) / dLat) + 1, cols = Math.floor((BOX.e - BOX.w) / dLon) + 1;
  return { km, s: BOX.s, w: BOX.w, dLat: +dLat.toFixed(6), dLon: +dLon.toFixed(6), rows, cols };
}
export const pointOf = (G, i) => { const r = Math.floor(i / G.cols), c = i % G.cols; return { lat: Math.round((G.s + r * G.dLat) * 1e5) / 1e5, lon: Math.round((G.w + c * G.dLon) * 1e5) / 1e5 }; };

const mem = (a, b) => ({ rssBefore: Math.round(a.rss / 1048576), rssAfter: Math.round(b.rss / 1048576), heapUsedBefore: Math.round(a.heapUsed / 1048576), heapUsedAfter: Math.round(b.heapUsed / 1048576) });
export function createHazardGrid(app, opts = {}) {
  const dataDir = opts.dataDir || app.dataDir || 'data';
  const now = opts.now || (() => Date.now());
  const file = join(dataDir, 'hazard-grid.json');
  const KM = Number(process.env.NIGRAAN_HAZGRID_KM || opts.km || GRID_KM);
  const DUTY = Math.min(1, Math.max(0.05, Number(process.env.NIGRAAN_HAZGRID_DUTY || opts.duty || 0.35)));
  const CHUNK = Math.max(1, Number(process.env.NIGRAAN_HAZGRID_CHUNK || 20));
  const STARTS = String(process.env.NIGRAAN_HAZGRID_CYCLE_HOURS_PKT || '0.5,11.5').split(',').map(Number).filter((h) => h >= 0 && h < 24).sort((a, b) => a - b);
  const G = gridDef(KM);
  const S = { building: false, progress: null, lastError: null, cur: null, land: null, builds: 0, lastBuild: null, timer: null, aborted: false };

  /* the cycle a moment belongs to: its PKT date and the latest start hour passed (before the first start: the previous day's last) */
  function cycleOf(ms) { const p = new Date(ms + 5 * 3600e3), h = p.getUTCHours() + p.getUTCMinutes() / 60; let k = -1; STARTS.forEach((s, i) => { if (h >= s) k = i; });
    if (k < 0) return pktDate(ms - 24 * 3600e3) + '#' + (STARTS.length - 1); return pktDate(ms) + '#' + k; }
  function load() { if (S.cur) return S.cur; try { if (existsSync(file)) { const j = JSON.parse(readFileSync(file, 'utf8')); if (j && j.version === HAZGRID_VERSION && j.grid && j.grid.km === KM) S.cur = j; } } catch (_) { S.cur = null; } return S.cur; }
  function writeAtomic(obj) { const tmp = file + '.tmp-' + process.pid; writeFileSync(tmp, JSON.stringify(obj)); renameSync(tmp, file); }

  /* the land points: inside Pakistan-administered territory and not at sea (the point state's own placement rule, places.pointRow) */
  async function landOf() { if (S.land) return S.land; const out = [], n = G.rows * G.cols; let t = performance.now();
    for (let i = 0; i < n; i++) { const p = pointOf(G, i); let row = null; try { row = app.places.pointRow(p.lat, p.lon); } catch (_) { row = null; }
      if (row && !row.atSea && row.administered) out.push(i);
      if (performance.now() - t > 40) { await sleep(10); t = performance.now(); } }
    S.land = out; return out; }

  async function build(why) {
    if (S.building) return { ok: false, why: 'already building' };
    S.building = true; S.aborted = false; const t0 = performance.now(), started = new Date(now()).toISOString(), cyc = cycleOf(now()), m0 = process.memoryUsage();
    let cpuMs = 0, stamps = new Set(), errors = 0;
    try {
      const land = await landOf(), rule = countRule(app.gate);
      const vals = [0, 1, 2, 3].map(() => new Array(G.rows * G.cols).fill(null)), dates = [null, null, null, null];
      S.progress = { done: 0, of: land.length, started, why };
      for (let k = 0; k < land.length && !S.aborted; k += CHUNK) {
        const idx = land.slice(k, k + CHUNK), pts = idx.map((i) => pointOf(G, i)), t = performance.now(), c0 = process.cpuUsage();
        let st = []; try { stamps.add(app.pointState.runStamp().stamp); st = await app.pointState.many(pts, { tag: 'hazard-grid', noCache: true }); } catch (_) { st = []; errors++; }
        idx.forEach((i, j) => { const ps = st[j]; if (!ps || !ps.ok) return;
          const c = app.point.siteCtx(pts[j].lat, pts[j].lon, ps, 'customer');
          let n = null; try { n = countOf(app.placeRecord.siteLevels(c), app.gate, rule); } catch (_) { n = null; errors++; }
          if (!n || !n.ok) return; n.days.forEach((d) => { if (d.lead >= 0 && d.lead <= 3) { vals[d.lead][i] = isN(d.count) ? d.count : null; if (d.date && !dates[d.lead]) dates[d.lead] = d.date; } }); });
        /* the rest after a chunk is set by the CPU the chunk used (process.cpuUsage), not its wall time: waiting for the provider costs no rest */
        const cu = process.cpuUsage(c0), cpu = (cu.user + cu.system) / 1000, el = performance.now() - t; cpuMs += cpu; S.progress.done = Math.min(land.length, k + CHUNK);
        await sleep(Math.round(Math.min(cpu, el) * (1 - DUTY) / DUTY));
      }
      if (S.aborted) return { ok: false, why: 'aborted' };
      const out = { version: HAZGRID_VERSION, countVersion: HAZARD_COUNT_VERSION, cycle: cyc, builtAt: new Date(now()).toISOString(), startedAt: started,
        stamps: [...stamps], buildMs: Math.round(performance.now() - t0), cpuMs: Math.round(cpuMs), duty: DUTY, points: land.length, errors, memMB: mem(m0, process.memoryUsage()),
        grid: G, rule, days: [0, 1, 2, 3].map((l) => ({ lead: l, date: dates[l], v: vals[l] })) };
      writeAtomic(out); S.cur = out; S.builds++; S.lastBuild = { at: out.builtAt, ms: out.buildMs, cpuMs: out.cpuMs, points: out.points, why };
      return { ok: true, cycle: cyc, points: land.length, ms: out.buildMs };
    } catch (e) { S.lastError = String(e && e.message || e).slice(0, 200); return { ok: false, why: S.lastError };
    } finally { S.building = false; S.progress = null; }
  }
  /* due: no build yet, or the build is of an earlier cycle */
  function due() { const c = load(); return !c || c.cycle !== cycleOf(now()); }
  function tick() { if (!S.building && due()) build('cycle').catch(() => {}); }
  function start(delayMs = 60e3) { if (S.timer || process.env.NIGRAAN_HAZGRID === '0') return; const t = setTimeout(() => { tick(); S.timer = setInterval(tick, 5 * 60e3); if (S.timer.unref) S.timer.unref(); }, delayMs); if (t.unref) t.unref(); S.timer = t; }
  function stop() { S.aborted = true; if (S.timer) { clearTimeout(S.timer); clearInterval(S.timer); S.timer = null; } }

  /* the day N of today (PKT), by date */
  function serve(day) {
    const d = Number(day); if (!(Number.isInteger(d) && d >= 0 && d <= 3)) return { ok: false, status: 400, why: 'day must be 0, 1, 2 or 3' };
    const c = load(), want = pktDate(now() + d * 864e5);
    if (!c) return { ok: true, ready: false, why: S.building ? 'the hazard surface is being computed for the first time' : 'the hazard surface has not been computed yet', ...(S.progress ? { progress: { done: S.progress.done, of: S.progress.of } } : {}) };
    const D = c.days.find((x) => x.date === want);
    if (!D) return { ok: true, ready: false, date: want, why: 'the hazard surface for this day is being computed', ...(S.progress ? { progress: { done: S.progress.done, of: S.progress.of } } : {}) };
    /* v91.17.283.41 · item 26: the forecast run the surface was built from (the newest model run of its point states), for the start page's time label */
    const runAt = (c.stamps || []).map((x) => String(x).split('|')[0]).filter((x) => Number.isFinite(Date.parse(x))).sort().pop() || null;
    return { ok: true, ready: true, day: d, date: D.date, builtAt: c.builtAt, runAt, grid: c.grid, threshold: c.rule.threshold, counted: c.rule.counted.map((x) => x.name), notCounted: c.rule.notCounted.map((x) => ({ name: x.name, why: x.why })),
      scale: { min: 0, max: c.rule.scaleMax != null ? c.rule.scaleMax : c.rule.counted.length }, v: D.v };   /* the top of the scale = every counted hazard at Moderate or above */
  }
  function status() { const c = load(); return { version: HAZGRID_VERSION, km: KM, duty: DUTY, chunk: CHUNK, grid: G, cycleNow: cycleOf(now()), built: c ? { cycle: c.cycle, at: c.builtAt, points: c.points, buildMs: c.buildMs, cpuMs: c.cpuMs, errors: c.errors, stamps: c.stamps, memMB: c.memMB || null } : null, memNowMB: (() => { const m = process.memoryUsage(); return { rss: Math.round(m.rss / 1048576), heapUsed: Math.round(m.heapUsed / 1048576) }; })(),
    building: S.building, progress: S.progress, lastError: S.lastError, builds: S.builds, lastBuild: S.lastBuild }; }
  /* the grid as built, with the point coordinates (operator checks and the tests): i -> { lat, lon, v[0..3] } for the land points */
  function points() { const c = load(); if (!c) return null; const out = []; const n = c.grid.rows * c.grid.cols;
    for (let i = 0; i < n; i++) { const vv = c.days.map((d) => d.v[i]); if (vv.every((x) => x === null) && !(S.land && S.land.includes(i))) continue; const p = pointOf(c.grid, i); out.push({ i, lat: p.lat, lon: p.lon, v: vv }); }
    return { cycle: c.cycle, builtAt: c.builtAt, stamps: c.stamps, dates: c.days.map((d) => d.date), points: out }; }
  return { build, serve, status, points, start, stop, cycleOf, grid: G, landPoints: () => (S.land ? S.land.map((i) => pointOf(G, i)) : null) };   /* r42: the land points (the blend's grid pool is sized from them) */
}
