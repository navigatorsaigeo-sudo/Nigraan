/* v91.17.283 · WS1 · server/api/modelruns.mjs on its own: request -> provider domains (data/provider-models.json), the run key, the
   metadata asked only when a run is due, and the backend answer cache (same run -> no provider call; newer run, a new day, a
   time-relative request or explicit dates -> as the rule says). Fails on v91.17.282.1 (no module).
   usage: node scripts/tests283/ws1/modelruns.unit.test.mjs */
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d != null ? ' :: ' + String(d).slice(0, 300) : '')); } };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
let MRm = null; try { MRm = await import(pathToFileURL(join(ROOT, 'server', 'api', 'modelruns.mjs')).href); } catch (e) { ok(false, 'M0 server/api/modelruns.mjs loads', e.message); }
if (MRm) {
  const D = mkdtempSync(join(tmpdir(), 'agn-mr-'));
  try {
    writeFileSync(join(D, 'provider-models.json'), readFileSync(join(ROOT, 'data', 'provider-models.json')));
    let T = Date.parse('2026-10-20T12:00:00Z'); const now = () => T;
    const META = {}; const asked = [];
    const mr = MRm.createModelRuns({ dataDir: D, now, metaFetch: async (kind, d) => { asked.push(kind + '|' + d); const m = META[d]; if (!m) throw new Error('404'); return { last_run_initialisation_time: m.init, last_run_availability_time: m.avail, update_interval_seconds: m.interval }; } });
    const g = (o) => (k) => o[k];
    const bm = mr.specFor('forecast', g({ hourly: 'temperature_2m' }));
    ok(bm && bm.regs.join() === 'dwd_icon,ecmwf_ifs,ncep_gfs013,ncep_gfs025', 'M1 best_match in Pakistan = GFS 0.13 + 0.25, ICON, IFS HRES (provider source)', bm && bm.regs.join());
    const bp = mr.specFor('forecast', g({ hourly: 'temperature_2m,precipitation_probability' }));
    ok(bp.regs.includes('ncep_gefs025') && bp.regs.includes('dwd_icon_eps') && bp.regs.includes('ecmwf_ifs025_ensemble'), 'M2 precipitation_probability adds the ensemble domains');
    ok(mr.specFor('forecast', g({ models: 'kma_gdps' })) === null && mr.specFor('ensemble', g({})) === null, 'M3 a model or kind not in the file -> null (caller keeps its time rule)');
    ok(mr.specFor('airQuality', g({ hourly: 'pm2_5' })).regs.join() === 'cams_global', 'M4 air quality outside Europe = CAMS global');
    const s0 = Math.floor(T / 1000);
    for (const d of bm.regs) META[d] = { init: s0 - 6 * 3600, avail: s0 - 3600, interval: 6 * 3600 };   /* next run due in 5 h */
    ok(mr.key(bm) === null, 'M5 no key before the metadata is read');
    const k1 = await mr.poll(bm); const n1 = asked.length;
    ok(k1 && k1.split(',').length === 4 && n1 === 4, 'M6 one metadata call per domain', k1 + ' / ' + n1);
    T += 3600e3; await mr.poll(bm);
    ok(asked.length === n1, 'M7 before a domain\'s next run is due (last availability + update interval) its metadata is not asked again', asked.length - n1);
    T += 4 * 3600e3 + 1000; await mr.poll(bm);
    ok(asked.length === n1 + 4, 'M8 once due, asked again (each domain once)', asked.length - n1);
    T += 60e3; await mr.poll(bm);
    ok(asked.length === n1 + 4, 'M9 due but unchanged: asked at most once per pollSeconds', asked.length - n1);
    /* the answer cache */
    let upstream = 0; const prov = { call: async (kind, path, params) => { upstream++; return { hourly: { temperature_2m: [upstream] }, kind, path }; } };
    mr.cacheProvider(prov);
    const q = { latitude: [33.7], longitude: [73.05], hourly: ['temperature_2m'], forecast_days: 3, past_days: 3, timezone: 'GMT' };
    const a1 = await prov.call('forecast', '/v1/forecast', q), a2 = await prov.call('forecast', '/v1/forecast', { ...q });
    ok(upstream === 1 && a2.hourly.temperature_2m[0] === 1 && a1 !== a2, 'M10 same request, same runs: answered from the cache (a copy), one provider call', upstream);
    a2.hourly.temperature_2m[0] = 99; const a3 = await prov.call('forecast', '/v1/forecast', q);
    ok(a3.hourly.temperature_2m[0] === 1, 'M11 a caller changing its copy does not change the cache');
    META.dwd_icon = { init: s0, avail: Math.floor(T / 1000), interval: 6 * 3600 }; T += 600e3 + 1000;
    const a4 = await prov.call('forecast', '/v1/forecast', q);
    ok(upstream === 2 && a4.hourly.temperature_2m[0] === 2, 'M12 a newer run of one domain: fetched again', upstream);
    await prov.call('forecast', '/v1/forecast', { ...q, current: 'temperature_2m' }); await prov.call('forecast', '/v1/forecast', { ...q, current: 'temperature_2m' }); const u5 = upstream;
    T += 15 * 60e3; await prov.call('forecast', '/v1/forecast', { ...q, current: 'temperature_2m' });
    ok(u5 === 3 && upstream === 4, 'M13 a request with `current` is reused within its 15-minute slot only', u5 + ' ' + upstream);
    await prov.call('forecast', '/v1/forecast', { ...q, start_date: '2026-10-01', end_date: '2026-10-02' }); await prov.call('forecast', '/v1/forecast', { ...q, start_date: '2026-10-01', end_date: '2026-10-02' });
    ok(upstream === 6, 'M14 explicit dates are not cached here', upstream);
    const u7 = upstream; await prov.call('forecast', '/v1/forecast', { ...q, models: 'kma_gdps' }); await prov.call('forecast', '/v1/forecast', { ...q, models: 'kma_gdps' });
    ok(upstream === u7 + 2, 'M15 a model not in the file is never cached', upstream - u7);
    const qk = { ...q, timezone: 'Asia/Karachi' }; await prov.call('forecast', '/v1/forecast', qk); const u8 = upstream;
    T = Date.parse('2026-10-20T19:30:00Z'); await prov.call('forecast', '/v1/forecast', q); await prov.call('forecast', '/v1/forecast', qk);
    ok(upstream === u8 + 1, 'M16 at PKT midnight (19:00 UTC) a Pakistan-time request is fetched again, a GMT one is not', upstream - u8);
    T = Date.parse('2026-10-21T00:10:00Z'); await prov.call('forecast', '/v1/forecast', q);
    ok(upstream === u8 + 2, 'M16b at UTC midnight the GMT request is fetched again', upstream - u8);
    await prov.call('forecast', '/data/dwd_icon/static/meta.json', {}); await prov.call('forecast', '/data/dwd_icon/static/meta.json', {});
    const st = mr.status();
    ok(st.answerCache.hits >= 3 && st.domains['forecast|dwd_icon'].runChanges === 1, 'M17 status: cache hits and run changes', JSON.stringify(st.answerCache));
  } finally { rmSync(D, { recursive: true, force: true }); }
}
console.log(`\nmodelruns unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
