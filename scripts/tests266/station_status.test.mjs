/* v91.17.266 · interface 2 · station status with the single-station check, on a synthetic fleet (live screen, server/api/fleet.mjs):
   neighbours, reference (synop feed) neighbours, the forecast-residual check against checked stations of the same zone, the history
   'excluded' verdict, too few days, and a silent station. Thresholds come only from the rule block of data/mach-siting.json.
   usage: node scripts/tests266/station_status.test.mjs   (temporary data folder; starts no server) */
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { createFleet } = await import(join(ROOT, 'server/api/fleet.mjs'));
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d != null ? ' · ' + String(d).slice(0, 400) : '')); };
const RULE = JSON.parse(readFileSync(join(ROOT, 'data', 'mach-siting.json'), 'utf8')).rule;
const tmp = mkdtempSync(join(tmpdir(), 'v266-fleet-')); const dataDir = join(tmp, 'data'); mkdirSync(dataDir);
/* positions: a city cluster (A B C D) within a few km; E beside a reference station and one MACH station F 12 km away; G, H, I isolated */
const P = { A: [33.60, 73.00], B: [33.62, 73.02], C: [33.58, 73.03], D: [33.61, 72.99], E: [31.00, 70.00], F: [31.08, 70.05], G: [29.0, 66.0], H: [28.0, 64.0], I: [27.0, 62.0], J: [33.59, 73.01] };
const OFF = { A: 0.2, B: -0.3, C: 0.1, D: 4.0, E: 0.4, F: -0.2, G: 0.3, H: 3.6, I: 0, J: 0 };
const hours = {}; const days = 14; const now = Date.now(); const h0 = Math.floor(now / 3600e3) * 3600e3 - days * 24 * 3600e3;
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const truth = (ms) => 22 + 7 * Math.sin(((new Date(ms).getUTCHours() + 5) % 24 - 9) / 24 * 2 * Math.PI);   /* PKT afternoon peak */
const err = (ms) => 1.5 * Math.sin(ms / 86400e3);   /* the zone-wide forecast error of the hour */
const RB = { version: 'test', stations: {} };
for (const k of Object.keys(P)) { const s = RB.stations[k] = { lat: P[k][0], lon: P[k][1], elevM: 500, basis: { zone: 'plains', model: 'test' }, hours: {} };
  const nd = k === 'I' ? 3 : days;
  for (let t = h0 + (days - nd) * 864e5; t < h0 + days * 864e5; t += 3600e3) { const T = truth(t) + OFF[k] + 0.4 * rnd(); const raw = truth(t) + err(t); s.hours[new Date(t).toISOString().slice(0, 13)] = [Math.round(T * 10) / 10, Math.round((T - raw) * 100) / 100, null, null]; } }
writeFileSync(join(dataDir, 'mach-running-bias.json'), JSON.stringify(RB));
writeFileSync(join(dataDir, 'mach-siting.json'), JSON.stringify({ rule: RULE, stations: { J: { verdict: 'excluded', why: 'one source station under two MACH keys', humidityTrusted: false } } }));
writeFileSync(join(dataDir, 'mach-fleet-stations.json'), JSON.stringify({ stations: Object.keys(P).map((k, i) => ({ key: k, name: 'Station ' + k, no: i + 1, lat: P[k][0], lon: P[k][1] })) }));
/* the reference station beside E: 3-hourly readings of the truth */
const REC = { '41999': {} }; for (let t = h0; t < h0 + days * 864e5; t += 3 * 3600e3) REC['41999'][new Date(t).toISOString().slice(0, 13) + ':00Z'] = { o: Math.round((truth(t) + 0.2 * rnd()) * 10) / 10, s: truth(t) + err(t), td: null };
const app = { synop: { records: () => ({ stations: { '41999': { name: 'Reference', lat: 31.02, lon: 70.01, elevM: 520 } }, records: REC }) } };
const F = createFleet(app, tmp, dataDir);
const st = (k) => F.screen(k), S = (k, row) => F.stationStatus(row || { key: k, qc: [], ageMin: 5, lastUpdated: new Date().toISOString() }, F.screen(k));
for (const k of ['A', 'B', 'C']) ok(S(k).status === 'checked' && S(k).checkedBy === 'neighbours', k + ' city station: checked by neighbours', JSON.stringify(S(k)) + ' ' + JSON.stringify(st(k)));
ok(S('D').status === 'site-problem' && S('D').checkedBy === 'neighbours' && /not used/.test(S('D').statusNote), 'D reads 4 C off its neighbours: site problem', JSON.stringify(S('D')));
ok(S('E').status === 'checked' && S('E').checkedBy === 'reference', 'E: one MACH neighbour + the reference station = two neighbours: checked by reference', JSON.stringify(S('E')) + ' ' + JSON.stringify(st('E')));
ok(!/PMD|synop|41999|Reference/.test(S('E').statusNote), 'E: the client note names no reference network', S('E').statusNote);
ok(S('G').status === 'checked' && S('G').checkedBy === 'forecast', 'G isolated, in step with the zone: checked against the forecast', JSON.stringify(S('G')) + ' ' + JSON.stringify(st('G')));
ok(S('H').status === 'site-problem' && S('H').checkedBy === 'forecast', 'H isolated, 3.6 C off the zone residual: site problem by the forecast check', JSON.stringify(S('H')) + ' ' + JSON.stringify(st('H')));
ok(S('I').status === 'not-yet-checked' && S('I').checkedBy === null, 'I isolated with 3 days: not yet checked', JSON.stringify(S('I')) + ' ' + JSON.stringify(st('I')));
ok(S('J').status !== 'site-problem' || !/repeats another station|not used/.test(S('J').statusNote), 'J an old history-screen "excluded" verdict no longer drops the station (v91.17.283.14: values judged by obsqc.mjs)', JSON.stringify(S('J')));
{ const r = S('A', { key: 'A', qc: ['dead'], ageMin: 300, lastUpdated: '2026-10-14T16:40:00Z' }); ok(r.status === 'silent' && r.statusNote === 'No reading since 14 Oct 2026, 21:40 PKT.' && r.silentSince === '2026-10-14T16:40:00.000Z', 'a dead station is silent, with the time in PKT', JSON.stringify(r)); }
ok(st('G').trusted === true && st('H').trusted === false, 'a station checked on any basis is trusted for the running correction; a rejected one is not');
const peersOfF = Object.keys(P).filter((k) => st(k).trusted && st(k).checkedBy !== 'forecast');
ok(!peersOfF.includes('G'), 'a forecast-checked station is not a peer for another forecast check', peersOfF.join(','));
/* v91.17.278.1 · FIX2781 · no poll has run in this test: statusAll covers every registered station, each pending with no status (it was
   "silent, no reading received" before the first poll; the live past-30-days answer repeated that for 5 min after a start). The
   interface statuses of polled rows are the stationStatus checks above; the warm-up and the first poll: scripts/tests2781/warmup.test.mjs */
const all = F.statusAll(); ok(all.length === Object.keys(P).length && all.every((x) => x.pending === true && x.status === null && x.statusNote === null), 'statusAll covers every registered station; before the first poll each is pending (no status, never silent)', JSON.stringify(all.map((x) => x.key + ':' + x.status)));
ok(JSON.stringify(F.screenRule()) === JSON.stringify(RULE), 'the screen rule is the mach-siting.json rule block');
rmSync(tmp, { recursive: true, force: true });
console.log(`\n${fail ? 'FAIL' : 'PASS'} station_status: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
