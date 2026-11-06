// v91.17.283.28 · INDEPENDENCE FROM LAMHA · feed health on NIGRAAN's own feeds (scripts/agents/feed_health.mjs with indep_others.patch):
//  H1 mach / metar / ews_weather / ews_hydro / radar_* read from the own folder nig/own (no LAMHA copy, no copy job)
//  H2 isd_lite from station-lake/archive/isd/raw; official_aws is 'not assessed' - hand-supplied, no live feed (never an alert)
//  H3 no lamha_copy feed any more
// usage: node scripts/tests28328/indep_feedhealth.test.mjs   (passes once the patch for feed_health.mjs is applied)
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + String(d).slice(0, 500) : '')); } };
const FH = await import(pathToFileURL(join(ROOT, 'scripts', 'agents', 'feed_health.mjs')).href);
const T = mkdtempSync(join(tmpdir(), 'indep-fh-')), NIG = join(T, 'NIGRAAN', 'nig'), app = join(NIG, 'nigraan-local'), data = join(app, 'data'), OWN = join(NIG, 'own'), adm = join(T, '_admin');
for (const d of [data, adm, join(OWN, 'data', 'mach', 'db'), join(OWN, 'data', 'obs_other', 'metar_live'), join(OWN, 'data', 'pmd', 'ews_live'), join(OWN, 'data', 'radar', 'netcdf', 'islamabad', 'sri'), join(NIG, 'station-lake', 'archive', 'isd', 'raw', '2026'), join(NIG, 'station-lake', 'archive', 'pmd_aws')]) mkdirSync(d, { recursive: true });
const now = Date.parse('2026-10-28T06:00:00Z'), M = 6e4; const z = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + 'Z';
const pkt = (ms) => new Date(ms + 5 * 3600e3).toISOString().replace('T', ' ').slice(0, 16) + ' PKT';
const L = []; for (let t = now - 30 * 864e5; t <= now - 5 * M; t += 10 * M) L.push(z(t).replace('Z', 'Z') + ' fetched 300 readings, 80 new; record +80'); writeFileSync(join(OWN, 'data', 'mach', 'db', 'sync_log.txt'), L.join('\n') + '\n');
writeFileSync(join(OWN, 'data', 'mach', 'db', 'obs_20261028.csv'), 'stationKey,time,source,temperatureC\n' + ['mach1', 'mach8'].map((k) => k + ',' + new Date(now - 15 * M).toISOString().slice(0, 19) + 'Z,wu_api,20').join('\n') + '\n');
const E = []; for (let t = now - 30 * 864e5; t <= now - 10 * M; t += 30 * M) E.push(pkt(t) + '  [https] 500 element requests, 700 new readings, 650 new hydro readings; 60 stations with temperature in the last 2 h (40 s)'); writeFileSync(join(OWN, 'data', 'pmd', 'ews_live', 'sync_log.txt'), E.join('\n') + '\n');
const mt = ['station,time_utc,t_c,td_c,type,received_utc,raw']; for (let t = now - 30 * 864e5; t <= now - 3 * M; t += 30 * M) mt.push('OPIS,' + new Date(t - 2 * M).toISOString().slice(0, 16).replace('T', ' ') + ',20,10,METAR,' + new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ',X');
writeFileSync(join(OWN, 'data', 'obs_other', 'metar_live', 'metar_202610.csv'), mt.join('\n') + '\n'); writeFileSync(join(OWN, 'data', 'obs_other', 'metar_live', 'metar_202609.csv'), 'station,time_utc,t_c,td_c,type,received_utc,raw\n');
const nc = join(OWN, 'data', 'radar', 'netcdf', 'islamabad', 'sri', 'islamabad_sri_2026-10-28.nc'); writeFileSync(nc, 'x'); utimesSync(nc, new Date(now - 60 * M), new Date(now - 60 * M));
const isd = join(NIG, 'station-lake', 'archive', 'isd', 'raw', '2026', '415710-99999-2026.gz'); writeFileSync(isd, 'x'); utimesSync(isd, new Date(now - 864e5), new Date(now - 864e5));
const r = FH.run({ app, dataDir: data, copiesDir: join(NIG, 'copies'), adminDir: adm, now }); const F = r.state.feeds;
ok(F.mach && F.mach.status !== 'not assessed' && F.mach.stationsReporting === 2, 'H1 mach from the own MACH window (sync_log + day file)', JSON.stringify(F.mach).slice(0, 300));
ok(F.metar && F.metar.status === 'ok', 'H1 metar from the own METAR record', JSON.stringify(F.metar).slice(0, 300));
ok(F.ews_weather && F.ews_weather.status === 'ok' && F.ews_hydro && F.ews_hydro.status === 'ok' && !F.ews_weather.series, 'H1 EWS weather / hydrology from the own fetch\'s run log (no copy lag series)', JSON.stringify(F.ews_weather).slice(0, 300));
ok(F.radar_islamabad_sri && /islamabad_sri_2026-10-28/.test(F.radar_islamabad_sri.detail || ''), 'H1 radar from the own radar pull', JSON.stringify(F.radar_islamabad_sri));
ok(F.isd_lite && /station-year files/.test(F.isd_lite.detail || ''), 'H2 isd_lite from station-lake/archive/isd/raw', JSON.stringify(F.isd_lite));
ok(F.official_aws && F.official_aws.status === 'not assessed' && F.official_aws.handSupplied && /hand-supplied, no live feed/.test(F.official_aws.why), 'H2 official AWS: hand-supplied, no live feed, not an alert', JSON.stringify(F.official_aws));
ok(!('lamha_copy' in F) && !r.alerts.some((a) => a.feed === 'official_aws'), 'H3 no lamha_copy feed; no alert for the official AWS');
console.log(`\nindep_feedhealth ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
