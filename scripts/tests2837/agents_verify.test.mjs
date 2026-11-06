// v91.17.283.7 · agent 2, verification (scripts/agents/verify.mjs), on a synthetic data folder:
//  V1 scores the as-issued tehsil forecast against the station readings (forecast - observed): MAE and bias exact
//  V2 the exclusion lists are honoured: a station on data/nonrepresentative-stations.json and a held station (data/station-holds.json)
//     are never scored (their large errors would show), and the ledger lists them as excluded
//  V3 lead days come from the issue day (0, 1, 2); day 3 is not in the tehsil archive's 73 hours and says so
//  V4 the tehsil temperature is moved to the station height at 6.5 C/km (a station 1,000 m above the served height)
//  V5 MACH forecast rows (source qm / provider apple*) are never taken as observations
//  V6 drift: a synthetic +0.9 C warm shift of the plains night minimum at rural stations over the last 7 days is flagged with a plain
//     sentence; the same ledger without the shift raises no flag (Benjamini-Hochberg over the family)
//  V7 the client heat sentence: below 30 days of live heat scores the current text stays (and says why); from 30 days with the interval
//     stated it is replaced (evidence.mjs), and only the first heat sentence
//     (v91.17.283.8 HEATSKILL: the live line rests on the client domain only - synoptic and airport stations in Sindh and Punjab,
//     forecast days 1 and 2 - so the synthetic ledger now carries those cells; scripts/tests2838 tests the domain itself)
//  V8 the ledger keeps 400 days
// usage: node scripts/tests2837/agents_verify.test.mjs     (fails on v91.17.283.6: there is no agent)
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), D0 = join(APP, 'data');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + String(d).slice(0, 400) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + String(d).slice(0, 900) : '')); } };
let V; try { V = await import(pathToFileURL(join(APP, 'scripts', 'agents', 'verify.mjs')).href); } catch (e) { ok(false, 'V0 scripts/agents/verify.mjs loads', e.message); console.log(`\nagents_verify ${pass} passed, ${fail} failed`); process.exit(1); }
const { DAY_MIN_HOURS } = await import(pathToFileURL(join(APP, 'server', 'api', 'archive.mjs')).href);
ok(V.DAY_MIN_HOURS === DAY_MIN_HOURS, 'V0 the complete-day rule is the archive\'s own (DAY_MIN_HOURS ' + DAY_MIN_HOURS + ')');
const tmp = mkdtempSync(join(tmpdir(), 'vf-')), data = join(tmp, 'data'), cop = join(tmp, 'copies'), db = join(cop, 'data', 'mach', 'db');   /* v91.17.283.28: the own folder's layout */
mkdirSync(join(data, 'archive', 'forecast'), { recursive: true }); mkdirSync(db, { recursive: true });
for (const f of ['pk-tehsils.json', 'urban.meta.json', 'urban.idx', 'urban.f16']) copyFileSync(join(D0, f), join(data, f));
/* four stations in Islamabad tehsil: a good one, a high one (1,000 m above the served height), a nonrepresentative one, a held one */
/* v91.17.283.14 · no station list: 'nonrep' and 'held' read 10 C off and lose those values to the buddy check of obsqc.mjs (seven more
   sound stations around 'good' give them buddies); they are not excluded as stations */
const ST = [{ key: 'good', lat: 33.66467, lon: 73.08307 }, { key: 'high', lat: 33.70, lon: 73.05 }, { key: 'nonrep', lat: 33.69, lon: 73.06 }, { key: 'held', lat: 33.68, lon: 73.04 },
  ...[1, 2, 3, 4, 5, 6, 7].map((i) => ({ key: 'g' + i, lat: 33.66467 + 0.01 * Math.cos(i), lon: 73.08307 + 0.01 * Math.sin(i) }))];
writeFileSync(join(data, 'mach-fleet-stations.json'), JSON.stringify({ stations: ST }));
writeFileSync(join(data, 'mach-siting.json'), JSON.stringify({ stations: { good: { elevM: 500 }, high: { elevM: 1500 }, nonrep: { elevM: 500 }, held: { elevM: 500 }, ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((i) => ['g' + i, { elevM: 500 }])) } }));
writeFileSync(join(data, 'nonrepresentative-stations.json'), JSON.stringify({ stations: [{ pid: 'mach:nonrep', reason: 'test: slope site' }] }));
writeFileSync(join(data, 'station-holds.json'), JSON.stringify({ holds: [{ key: 'held', why: 'test: frozen packets', permanent: true }] }));
const UID = 'Federal Capital|Islamabad|Islamabad', PKT = 5 * 3600e3;
const obsT = (ms) => 20 + 8 * Math.sin((ms / 3600e3 + 5 - 9) / 24 * 2 * Math.PI);   /* a smooth day cycle (PKT) */
/* the tehsil forecast as issued for 18-21 Oct: served height 500 m; T = observed + 1.0 at 500 m (the 'high' station reads 6.5 C cooler) */
const fc = []; for (const d of ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']) { const t0 = Date.parse(d + 'T00:00:00Z') - PKT + 3600e3; const T = [], RH = [], P = [], W = [];
  for (let i = 0; i < 73; i++) { const ms = t0 + i * 3600e3; T.push(Math.round((obsT(ms) + 1) * 10)); RH.push(50); P.push(0); W.push(10); }
  fc.push(JSON.stringify({ d, iss: new Date(t0).toISOString(), t0: new Date(t0).toISOString().slice(0, 19) + 'Z', u: UID, z: 'plains', el: 500, sel: 500, n: 73, T, RH, P, W })); }
writeFileSync(join(data, 'archive', 'forecast', 'fc_2026-10.jsonl.gz'), gzipSync(fc.join('\n') + '\n'));
/* readings every 10 min, 17-22 Oct UTC days; the excluded stations read 10 C off; a forecast row (qm) 15 C off */
for (const d of ['20261017', '20261018', '20261019', '20261020', '20261021', '20261022']) { const day = d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6); const L = ['stationKey,time,source,temperatureC,dewPointC,humidityPct,windSpeedKmh,windGustKmh,pressureHpa,solarWm2,precipTotalMm'];
  for (let m = 0; m < 1440; m += 10) { const ms = Date.parse(day + 'T00:00:00Z') + m * 6e4; const t = obsT(ms), iso = new Date(ms).toISOString().slice(0, 19) + 'Z', sol = Math.max(0, 600 * Math.sin((ms / 3600e3 + 5 - 6) / 12 * Math.PI));
    for (const s of ST) { const j = /^g\d$/.test(s.key) ? Number(s.key.slice(1)) : 0;   /* the added stations carry their own small departures: no two records are identical (obsqc's copy check) */
      const T = (s.key === 'high' ? t - 6.5 : (s.key === 'good' || j ? t : t + 10)) + (j ? 0.06 * (j - 4) : 0); L.push([s.key, iso, 'ecowitt', (Math.round(T * 100) / 100 + (m % 20 ? 0.01 : 0)).toFixed(2), 10 + 0.3 * j, 40 + (m % 30) / 10 + j, 8 + (m % 40) / 10, 12, 1000 + (m % 50) / 100 + 0.7 * j, sol.toFixed(1), 0].join(',')); }
    L.push(['good', new Date(ms + 5 * 6e4).toISOString().slice(0, 19) + 'Z', 'qm', (t + 15).toFixed(2), 10, 40, 8, 12, 1000, 0, 0].join(',')); }
  writeFileSync(join(db, 'obs_' + d + '.csv'), L.join('\n') + '\n'); }
const R = await V.run({ dataDir: data, copiesDir: cop, lake: join(tmp, 'nolake'), backfill: 3, now: Date.parse('2026-10-22T02:00:00Z') });
const r21 = R.done.find((r) => r.day === '2026-10-21'); const cell = (k) => Object.entries(r21.S).filter(([kk]) => kk.startsWith(k)).reduce((a, [, x]) => [a[0] + x[0], a[1] + x[1], a[2] + x[2]], [0, 0, 0]);
const T0 = cell('T|mach|plains|0|'); ok(T0[0] >= 40 && Math.abs(T0[1] / T0[0] - 1) < 0.02 && Math.abs(T0[2] / T0[0] - 1) < 0.02, 'V1 + V4 + V5 day 0 temperature: bias +1.0, MAE 1.0 (the high station moved 6.5 C by height; the qm rows left out)', JSON.stringify({ n: T0[0], bias: T0[1] / T0[0], mae: T0[2] / T0[0] }));
ok(r21.stations.mach === 8 && r21.excluded === undefined && r21.qc && r21.qc.failed && r21.qc.failed.T > 0, 'V2 no station is excluded (8 scored: g3 lies in Rawalpindi tehsil, no forecast row); the two stations reading 10 C off lose their temperature values (value level, obsqc.mjs; here they also carry one identical record: the copy check)', JSON.stringify({ mach: r21.stations.mach, failed: r21.qc && r21.qc.failed, tests: r21.qc && r21.qc.tests }));
const leads = [0, 1, 2, 3].map((L) => cell('T|mach|plains|' + L + '|')[0]); const tab = R.summary.table.find((x) => x.var === 'T' && x.zone === 'plains' && x.lead === 3);
ok(leads[0] > 0 && leads[1] > 0 && leads[2] > 0 && leads[3] === 0 && tab.n === 0 && /73 hours/.test(tab.why), 'V3 leads 0-2 scored from the issue day, day 3 not assessed (the 73-hour archive)', JSON.stringify({ leads, why: tab.why }));
const TX = cell('TX|mach|plains|1|'); ok(TX[0] === 8 && Math.abs(TX[1] / TX[0] - 1) < 0.05, 'V1b daily maximum on the hourly series (like for like): bias +1.0', JSON.stringify(TX));
/* V6 drift on a synthetic ledger */
const mk = (shift) => { const recs = []; for (let i = 0; i < 37; i++) { const day = new Date(Date.parse('2026-09-15T00:00:00Z') + i * 864e5).toISOString().slice(0, 10); const S = {};
    for (const urb of ['urban', 'rural']) for (const zone of ['plains', 'hills']) for (const v of ['T', 'TX', 'TN', 'RH', 'W']) { const b = (v === 'TN' && zone === 'plains' && urb === 'rural' && i >= 30 ? shift : 0) + 0.2 * Math.sin(i * 1.7 + v.length + zone.length);
      const n = 20; S[v + '|mach|' + zone + '|1|' + urb] = [n, b * n, Math.abs(b) * n + n, (b * b + 1) * n]; }
    recs.push({ day, S, C: {}, V: {} }); } return recs; };
const S1 = V.summarize(mk(0.9)), S0 = V.summarize(mk(0));
const flag = S1.drift.find((f) => f.var === 'TN' && f.zone === 'plains' && f.urb === 'rural' && f.metric === 'bias');
ok(flag && /^Plains night minimum running \+0\.(8|9)\d? °C warm at rural stations for at least 7 days \(the 30 days before: /.test(flag.text) && flag.worse === true, 'V6a the +0.9 C rural plains night-minimum shift is flagged in plain words', flag ? flag.text : JSON.stringify(S1.drift.map((f) => f.text)));
ok(S0.drift.length === 0 && S0.driftAssessed === true, 'V6b the same ledger without the shift: no drift flag (' + S0.driftFamily.tests + ' tests, BH at 5 %)', JSON.stringify(S0.drift.map((f) => f.text)));
/* V7 the client heat line */
const heatRecs = (n) => { const recs = []; for (let i = 0; i < n; i++) { const day = new Date(Date.parse('2026-09-15T00:00:00Z') + i * 864e5).toISOString().slice(0, 10); recs.push({ day, S: {}, C: { 'heat2sp|synop|plains|1|rural': [8 + (i % 3), 1 + (i % 2), 2, 30], 'heat2|synop|plains|1|rural': [8 + (i % 3), 1 + (i % 2), 2, 30] }, V: {} }); } return recs; };
const H29 = V.summarize(heatRecs(29)).client, H30 = V.summarize(heatRecs(30)).client;
ok(H29.eligible === false && /29 days of live heat verification \(30 needed\): the current client text stays/.test(H29.why) && H29.line === null, 'V7a 29 days: the current client text stays, and the file says why', H29.why);
ok(H30.eligible === true && /95 % interval \d+–\d+ %/.test(H30.line) && H30.pod.ci && H30.far.ci, 'V7b 30 days with the interval stated: a live line is offered', H30.line);
const ev = mkdtempSync(join(tmpdir(), 'ev-')); copyFileSync(join(D0, 'skill-evidence.json'), join(ev, 'skill-evidence.json')); mkdirSync(join(ev, 'agents', 'verify'), { recursive: true });
const E = await import(pathToFileURL(join(APP, 'server', 'api', 'evidence.mjs')).href); const base = E.evidenceLines(D0, ['heat']);
writeFileSync(join(ev, 'agents', 'verify', 'client-lines.json'), JSON.stringify(H29)); const l29 = E.evidenceLines(ev, ['heat']);
await new Promise((r) => setTimeout(r, 20)); writeFileSync(join(ev, 'agents', 'verify', 'client-lines.json'), JSON.stringify(H30)); const l30 = E.evidenceLines(ev, ['heat']);
ok(JSON.stringify(l29) === JSON.stringify(base) && l30[0] === H30.line && l30[1] === base[1] && l30.length === base.length, 'V7c evidence.mjs: unchanged below 30 days; from 30 days only the first heat sentence is the live one', l30[0]);
/* V8 400 days */
const big = []; for (let i = 0; i < 410; i++) big.push({ day: new Date(Date.parse('2025-09-01T00:00:00Z') + i * 864e5).toISOString().slice(0, 10), S: {}, C: {}, V: {} });
const L8 = join(tmp, 'l8'); V.writeLedger(L8, big); const back = V.readLedger(L8); ok(back.length === 400 && back[0].day === big[10].day, 'V8 the ledger keeps the last 400 days', back.length);
console.log(`\nagents_verify ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
