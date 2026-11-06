/* v283.51g3 · ITEM 1 · /api/report/past30 must not hold the event loop.
   A synthetic record the size of the laptop's (108 MACH stations; fleet archive day rows with 144 readings, 1 Sep - 3 Nov; the MACH
   observation record ~3 000 rows a day; 60 satellite-rain Pakistan-day files over all 577 tehsils) is written to /dev/shm. Each module
   (the g2 base past30.mjs and this tree's) runs in its own child process with index.mjs's cacheMs (300 s): 20 new places in a row,
   30-day window, then 10 of them with 60 days; perf_hooks.monitorEventLoopDelay (10 ms resolution) records the longest block.
   PASS: this tree's longest block < 200 ms; the 10 compared answers (30 days) are identical to the base's; the answer cache stays within
   its byte bound. Usage: node scripts/tests28351g3/past30_loop.test.mjs [/path/to/base/tree] */
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { monitorEventLoopDelay } from 'node:perf_hooks';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHM = process.env.P30_FIX || '/dev/shm/p30g3';
const add = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const units = JSON.parse(readFileSync(join(ROOT, 'server/contract/units.json'), 'utf8'));

if (process.argv[2] === '--child') {
  const [, , , modRoot, mode] = process.argv;
  const { createPast30 } = await import(pathToFileURL(join(modRoot, 'server/api/past30.mjs')));
  const { buildUnitIndex } = await import(pathToFileURL(join(modRoot, 'server/api/national.mjs')));
  const FX = JSON.parse(readFileSync(join(SHM, 'fx.json'), 'utf8'));
  const RULE = JSON.parse(readFileSync(join(ROOT, 'data', 'mach-siting.json'), 'utf8')).rule;
  const app = { dataDir: join(ROOT, 'data'), units: buildUnitIndex(units, null),
    fleet: { screenRule: () => RULE, stations: () => FX.stations.map((s) => ({ key: s.key, name: s.name, lat: s.lat, lon: s.lon })), screen: () => ({ verdict: 'trusted', trusted: true }), elevOf: () => null, pollAt: () => '2026-11-03T10:00:00Z', statusAll: () => [], statusReady: () => true },
    climatology: { normals: (u, d) => ({ tm: 20 + (d.charCodeAt(9) % 5), pr: 1.5 }) } };
  const P = createPast30(app, join(SHM, 'data'), { dbDir: join(SHM, 'db'), cacheMs: 300e3 });
  await P.warm(30);
  await new Promise((r) => setTimeout(r, 200));
  const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
  const out = [], per = []; const t0 = Date.now();
  for (const p of FX.places) { const h1 = monitorEventLoopDelay({ resolution: 10 }); h1.enable(); const t = Date.now(); const r = await P.at({ lat: p[0], lon: p[1], days: 30 }); h1.disable(); per.push([Date.now() - t, Math.round(h1.max / 1e6)]); out.push(r); }
  for (const p of FX.places.slice(0, 10)) { await P.at({ lat: p[0], lon: p[1], days: 60 }); }
  await new Promise((r) => setTimeout(r, 50)); h.disable();
  console.log(JSON.stringify({ mode, maxBlockMs: Math.round(h.max / 1e6), p99Ms: Math.round(h.percentile(99) / 1e6), totalMs: Date.now() - t0, per, answers: out.slice(0, 10), ok: out.filter((x) => x.ok).length, heapMB: Math.round(process.memoryUsage().heapUsed / 1048576) }));
  process.exit(0);
}

/* ── the fixture ── */
rmSync(SHM, { recursive: true, force: true });
const D = join(SHM, 'data'), DB = join(SHM, 'db');
for (const d of ['archive/fleet', 'archive/imerg', 'archive/engine', 'archive/shown', 'imerg/pkt']) mkdirSync(join(D, d), { recursive: true }); mkdirSync(DB, { recursive: true });
copyFileSync(join(ROOT, 'data', 'hazard-scale.json'), join(D, 'hazard-scale.json'));
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10), first = add(today, -63);
const days = []; for (let d = first; d < today; d = add(d, 1)) days.push(d);
/* 108 stations, clustered around the fleet's cities */
const C = [[33.68, 73.05], [24.86, 67.01], [31.52, 74.35], [30.19, 71.47], [34.01, 71.58], [35.92, 74.31], [35.29, 76.36], [32.93, 72.05]];
const stations = Array.from({ length: 108 }, (_, i) => { const c = C[i % C.length]; return { key: 'M' + (1000 + i), name: 'MACH ' + (i + 1), lat: +(c[0] + (rnd() - 0.5) * 0.3).toFixed(4), lon: +(c[1] + (rnd() - 0.5) * 0.3).toFixed(4) }; });
const places = Array.from({ length: 20 }, (_, i) => { const c = C[i % C.length]; return [+(c[0] + (rnd() - 0.5) * 0.2).toFixed(4), +(c[1] + (rnd() - 0.5) * 0.2).toFixed(4)]; });
/* fleet archive day rows: 144 readings a day (10-minute poll); every 5th station day incomplete */
const byMonth = new Map();
for (const d of days) for (const [si, s] of stations.entries()) { if ((si + d.charCodeAt(9)) % 7 === 0) continue; const n = (si + d.charCodeAt(8)) % 5 === 0 ? 50 : 144;
  const t = Array.from({ length: n }, (_, k) => k * 10), T = t.map((m) => Math.round((22 + si % 9 + 7 * Math.sin((m / 60 - 9) / 24 * 2 * Math.PI) + rnd()) * 10));
  const r = { d, k: s.key, lat: s.lat, lon: s.lon, el: 500, n, t, T, ok: t.map(() => 1), q: t.map(() => '') };
  const m = d.slice(0, 7); (byMonth.get(m) || byMonth.set(m, []).get(m)).push(JSON.stringify(r)); }
for (const [m, L] of byMonth) writeFileSync(join(D, 'archive/fleet', 'fleet_' + m + '.jsonl.gz'), gzipSync(L.join('\n') + '\n'));
/* the MACH observation record: ~29 readings per station a day (the laptop's 188 000 rows in two months) */
const HEAD = 'time,station_key,source,temperature_c,dew_point_c,humidity_pct,wind_dir_deg,wind_dir_text,wind_speed_kmh,wind_gust_kmh,pressure_hpa,uv_index,solar_wm2,precip_rate_mmhr,precip_total_mm,provider';
const files = new Map();
for (const d of days) for (const [si, s] of stations.entries()) { if ((si + d.charCodeAt(9)) % 3 === 0) continue;
  for (let k = 0; k < 29; k++) { const min = Math.round(k * 49.6); const ms = Date.parse(d + 'T00:00:00Z') + min * 60e3 - 5 * 3600e3; const iso = new Date(ms).toISOString().slice(0, 19) + 'Z';
    const T = 21 + si % 9 + 7 * Math.sin((min / 60 - 9) / 24 * 2 * Math.PI) + rnd();
    const f = 'mach_db_' + iso.slice(0, 7) + '.csv'; (files.get(f) || files.set(f, []).get(f)).push([iso, s.key, 'sheet_import', T.toFixed(1), '', (40 + si % 30), '', '', '', '', (950 + si / 10 + k / 100).toFixed(2), '', '', 0, 0, 'wu'].join(',')); } }
for (const [f, L] of files) writeFileSync(join(DB, f), HEAD + '\r\n' + L.join('\r\n') + '\r\n');
writeFileSync(join(DB, 'stations.json'), JSON.stringify({ read: 'test', stations: stations.map((s) => ({ station_key: s.key, lat: s.lat, lng: s.lon })) }));
/* 60 satellite-rain Pakistan-day files (units + points of every tehsil, the laptop's layout) */
for (const d of days.slice(-60)) { const u = {}, pt = {}; for (const x of units) { u[x.unitId] = +(rnd() < 0.2 ? rnd() * 30 : 0).toFixed(2); pt[x.unitId] = +(rnd() * 10).toFixed(2); }
  writeFileSync(join(D, 'imerg/pkt', d + '.json'), JSON.stringify({ date: d, units: u, points: pt, slots: 48, product: 'test' })); }
writeFileSync(join(SHM, 'fx.json'), JSON.stringify({ stations, places }));
const sz = spawnSync('du', ['-sh', SHM]).stdout.toString().trim(); console.log('fixture', sz, 'db rows', [...files.values()].reduce((a, b) => a + b.length, 0));

/* ── run both ── */
const BASE = process.argv[2] || '/tmp/claude-0/v28351g2';
const run = (root, mode) => { const r = spawnSync(process.execPath, ['--max-old-space-size=400', fileURLToPath(import.meta.url), '--child', root, mode], { encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, P30_FIX: SHM } });
  const line = (r.stdout || '').trim().split('\n').pop(); try { return JSON.parse(line); } catch (_) { console.log(r.stdout, r.stderr); return null; } };
const A = run(BASE, 'base'), B = run(ROOT, 'g3');
if (process.env.P30_DUMP) writeFileSync(process.env.P30_DUMP, JSON.stringify(B.answers[0], null, 1));
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d != null ? ' · ' + d : '')); };
console.log('base: longest block ' + A.maxBlockMs + ' ms, p99 ' + A.p99Ms + ' ms, 20+10 calls ' + A.totalMs + ' ms, per place [ms, block ms] ' + JSON.stringify(A.per));
console.log('g3:   longest block ' + B.maxBlockMs + ' ms, p99 ' + B.p99Ms + ' ms, 20+10 calls ' + B.totalMs + ' ms, per place [ms, block ms] ' + JSON.stringify(B.per));
ok(B.ok === 20 && A.ok === 20, '20 new places answered ok:true by both', A.ok + ' / ' + B.ok);
ok(B.maxBlockMs < 200, 'g3: no event-loop block of 200 ms or more over 20 new places + 10 60-day windows', B.maxBlockMs + ' ms (base ' + A.maxBlockMs + ' ms)');
const same = A.answers.map((a, i) => JSON.stringify(a) === JSON.stringify(B.answers[i]));
ok(same.every(Boolean), '10 places: the answer is identical to the base module\'s', same.join(','));
ok(B.answers.every((a) => a.daily.some((x) => x.rainMm != null) && a.daily.some((x) => x.tmaxC != null)), 'the compared answers carry rain and station days (not empty answers)');
/* the bounded cache (boundcache.mjs) */
{ const { boundedCache } = await import(pathToFileURL(join(ROOT, 'server/api/boundcache.mjs')));
  const c = boundedCache({ ttlMs: 50, maxBytes: 1000, maxItems: 100 });
  for (let i = 0; i < 50; i++) c.set('k' + i, { s: 'x'.repeat(90) });
  ok(c.bytes() <= 1000 && c.size() < 50 && c.get('k49') && !c.get('k0'), 'boundedCache: bytes stay under maxBytes, oldest dropped first', c.size() + ' entries, ' + c.bytes() + ' B');
  ok(c.set('big', { s: 'x'.repeat(2000) }) === false && !c.get('big'), 'boundedCache: an entry larger than the bound is not kept');
  await new Promise((r) => setTimeout(r, 60)); ok(c.get('k49') === undefined, 'boundedCache: an entry older than ttlMs is not served'); c.set('n', 1); ok(c.size() === 1, 'boundedCache: expired entries swept on set', c.size()); }
rmSync(SHM, { recursive: true, force: true });
console.log(`\n${fail ? 'FAIL' : 'PASS'} past30_loop: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
