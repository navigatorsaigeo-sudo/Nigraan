/* v91.17.283.28 . S1 · THE PLACE BUNDLE NEVER OUTLIVES ITS PKT HOUR OR ITS POINT STATE'S AGE, offline:
     H1  same run stamp, the clock moves past the PKT hour: /api/point answers the new hour's "now" (it kept the previous hour's before)
     H2  same hour, same run stamp: a bundle older than the point state's own age (PS_TTL_MS) is rebuilt, a younger one is served from cache
     H3  the point state's own cache: a record built at 10:55 PKT is not served at 11:05 PKT under the same run key
   usage: node scripts/tests28328/bundlehour.unit.test.mjs */
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 500) : '')); } };
const PT = await import(pathToFileURL(join(API, 'point.mjs')).href), PS = await import(pathToFileURL(join(API, 'pointstate.mjs')).href);
let T = Date.parse('2026-10-28T05:55:00Z');   /* 10:55 PKT */
const clock = () => T; let builds = 0;
const hourOf = () => new Date(T + 5 * 3600e3).toISOString().slice(0, 16).replace(/:\d\d$/, ':00');
const app = { places: { byId: () => ({ id: 'x', name: 'X', lat: 33.6844, lon: 73.0479 }) },
  pointState: { runStamp: () => ({ ok: true, run: 'R1', stamp: 'R1|a' }), state: async () => { builds++; return { ok: true, point: { elevM: 500 }, area: {}, source: {}, now: { time: hourOf(), tempC: 20 } }; }, rawBuild: async () => null } };
const P = PT.createPoint(app, { now: clock, parts: {} });
const a = await P.bundle({ id: 'x' }); T += 10 * 60e3; const b = await P.bundle({ id: 'x' });
ok(a.now.time.endsWith('10:00') && b.now.time.endsWith('11:00') && a.stamp !== b.stamp, 'H1 a new PKT hour gives the new hour\'s now and a new stamp', [a.now.time, b.now.time, a.stamp, b.stamp]);
const n0 = builds; T += 5 * 60e3; await P.bundle({ id: 'x' }); const n1 = builds; T += PS.PS_TTL_MS; await P.bundle({ id: 'x' });
ok(n1 === n0 && builds === n0 + 1, 'H2 a bundle is served from cache within the point state\'s age and rebuilt after it', [n0, n1, builds]);
/* H3: the point state's cache */
T = Date.parse('2026-10-28T05:55:00Z'); let calls = 0;
const mk = () => ({ hourly: { time: Array.from({ length: 48 }, (_, i) => new Date(Date.parse('2026-10-28T00:00:00Z') + i * 3600e3).toISOString().slice(0, 16)), temperature_2m: Array(48).fill(20) } });
const app2 = { places: { pointRow: () => ({ administered: true, elevM: 500 }) }, modelRuns: { status: () => ({ domains: { a: { run: '2026-10-28T00:00' } } }) } };
const S = PS.createPointState(app2, { now: clock, dataDir: join(ROOT, 'data'), fetchPx: async () => { calls++; return [mk()]; } });
const r1 = await S.state(33.6844, 73.0479, { noBuild: true }); T += 10 * 60e3 - 1000; const r2 = await S.state(33.6844, 73.0479, { noBuild: true });
ok(r1.now.time.endsWith('10:00') && r2.now.time.endsWith('11:00') && calls === 2, 'H3 the point state is rebuilt at the PKT hour under the same run key', [r1.now && r1.now.time, r2.now && r2.now.time, calls]);
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
