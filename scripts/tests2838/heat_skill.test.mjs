// v91.17.283.8 · HEATSKILL: the client heat line and the verification agent's heat truth, reconciled (data/evidence/heat2838)
//  H1 the observed heat level uses the HOURLY values (the reading nearest each hour), never the maximum of 10-minute readings
//  H2 UTCI takes the 10 m wind: a MACH / AWS hour uses the served 10 m wind of the tehsil (its low mast reads calm); a synoptic or
//     airport hour uses its own wind; without a served wind a MACH hour is not scored
//  H3 coverage: synoptic stations need 6 of 8 reports, hourly networks DAY_MIN_HOURS hours
//  H4 utciInRange is the page's hzUtciInRange (the polynomial, clamped into its range outside it)
//  H5 synoptic reports are read from the station lake: numeric ids only, one report per station and time, wind m/s -> km/h,
//     the forecast value stored with a report (served_c) never read
//  H6 the client line rests on synoptic / airport stations in Sindh and Punjab at forecast days 1 and 2 only: MACH cells, lead 0 and
//     other provinces never enter it; it states the domain, the period, the interval and "not yet verified" elsewhere
//  H7 the headline heat rows use the standard networks; MACH heat is shown apart (byNetwork)
//  H8 data/skill-evidence.json regenerates from the evidence files; the heat sentences carry exactly the table's numbers, the domain,
//     the period, the intervals and "not yet verified"; no network or agency name enters a client sentence; the heat2838 files are hashed
//  H9 the gate's alert decisions are unchanged (Moderate alerts, High / Severe indicative): only the sentences changed
// usage: node scripts/tests2838/heat_skill.test.mjs     (fails on v91.17.283.7: no heatObserved, no heat2838 evidence)
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), D0 = join(APP, 'data');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + String(d).slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + String(d).slice(0, 900) : '')); } };
const done = () => { console.log(`\nheat_skill ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
let V; try { V = await import(pathToFileURL(join(APP, 'scripts', 'agents', 'verify.mjs')).href); } catch (e) { ok(false, 'H0 verify.mjs loads', e.message); done(); }
if (typeof V.heatObserved !== 'function') { ok(false, 'H0 verify.mjs exports heatObserved (v283.8)'); done(); }
const U = await import(pathToFileURL(join(APP, 'server', 'api', 'utci.mjs')).href);
const DAY = '2026-10-10', d0 = Date.parse(DAY + 'T00:00:00Z') - 5 * 3600e3;
/* a hot dry day: T 24 + 10 sin, RH 40 %, every 10 minutes, station wind 0 (a calm low mast) */
const tOf = (ms) => { const hp = (ms - d0) / 3600e3; return 24 + 10 * Math.max(0, Math.sin(Math.PI * (hp - 6) / 14)); };
const rows10 = []; for (let m = 0; m < 24 * 60; m += 10) { const ms = d0 + m * 6e4; rows10.push({ ms, T: Math.round(tOf(ms) * 10) / 10, RH: 40, W: 0 }); }
/* H1: a 13:10 reading 6 C above the curve (sun on the sensor between two hours) */
const spike = rows10.map((r) => ({ ...r })); const k = spike.findIndex((r) => r.ms === d0 + (13 * 60 + 10) * 6e4); spike[k].T += 6;
const fw = () => 18;   /* served 10 m wind 18 km/h */
const a = V.heatObserved(rows10, DAY, 'mach', fw, U), b = V.heatObserved(spike, DAY, 'mach', fw, U);
let hrMax = -1e9; for (let h = 0; h < 24; h++) { const r = rows10.find((x) => x.ms === d0 + h * 3600e3); hrMax = Math.max(hrMax, V.utciInRange(U, r.T, 5, r.RH)); }
ok(a && b && a.u === b.u && a.u === hrMax && a.hours === 24, 'H1 hourly values only: a 10-minute spike between hours does not lift the observed peak', JSON.stringify({ a, b, hrMax }));
/* H2 */
const calm = V.heatObserved(rows10, DAY, 'synop', null, U);   // synop: own wind (0 -> 0.5 m/s reference); 24 hourly rows here
let calmMax = -1e9; for (let h = 0; h < 24; h++) { const r = rows10.find((x) => x.ms === d0 + h * 3600e3); calmMax = Math.max(calmMax, V.utciInRange(U, r.T, 0.5, r.RH)); }
ok(calm && calm.u === calmMax && a.u < calm.u, 'H2a a MACH hour takes the served 10 m wind, a synoptic hour its own wind (calm reads warmer: ' + (a && a.u) + ' vs ' + (calm && calm.u) + ' C)');
ok(V.heatObserved(rows10, DAY, 'mach', null, U) === null && V.heatObserved(rows10, DAY, 'aws', () => null, U) === null, 'H2b without a served 10 m wind a MACH / AWS day is not scored (never the mast wind)');
ok(V.TEN_M_WIND_NETS.has('synop') && V.TEN_M_WIND_NETS.has('metar') && !V.TEN_M_WIND_NETS.has('mach') && !V.TEN_M_WIND_NETS.has('aws'), 'H2c 10 m exposures: synoptic and airport only');
/* H3 */
const syn = (n) => [0, 3, 6, 9, 12, 15, 18, 21].slice(0, n).map((h) => ({ ms: d0 + (h + 2) * 3600e3, T: 33, RH: 40, W: 7.2 }));
const hourlyN = (n) => rows10.filter((r) => (r.ms - d0) % 3600e3 === 0).slice(0, n);
ok(V.heatObserved(syn(6), DAY, 'synop', null, U) && V.heatObserved(syn(5), DAY, 'synop', null, U) === null && V.heatObserved(hourlyN(V.DAY_MIN_HOURS), DAY, 'metar', null, U) && V.heatObserved(hourlyN(V.DAY_MIN_HOURS - 1), DAY, 'metar', null, U) === null,
  'H3 coverage: synoptic 6 of 8 reports, hourly networks ' + V.DAY_MIN_HOURS + ' hours');
/* H4 */
ok(V.utciInRange(U, 30, 3, 50) === U.utci(30, 30, 3, 50) && U.utci(51, 51, 3, 20) == null && V.utciInRange(U, 51, 3, 20) === null && V.utciInRange(U, 30, 20, 50) === null,
  'H4 utciInRange = the served rule since v283.23 (in range: the polynomial; outside: not assessed, no clamp)');
/* H5 synoptic reports from the lake */
const tmp = mkdtempSync(join(tmpdir(), 'hs-')), lake = join(tmp, 'lake'); mkdirSync(join(lake, 'archive', 'synop'), { recursive: true });
const rep = (sid, h, extra = {}) => JSON.stringify({ sid, t: new Date(d0 + h * 3600e3).toISOString().replace('.000', ''), t_c: 33, td_c: 15, wspd: 2, served_c: 40, ...extra });
writeFileSync(join(lake, 'archive', 'synop', 'synop_2026-10.jsonl'), [rep('41571', 5), rep('41571', 5, { t_c: 99 }), rep('41571', 8), rep('OPRN', 5), rep('41640', 8)].join('\n') + '\n');
const stations = [{ pid: 'synop:41571', net: 'synop', key: '41571', lat: 33.6, lon: 73.1 }, { pid: 'metar:OPRN', net: 'metar', key: 'OPRN', lat: 33.6, lon: 73.1 }];
const OB = await V.loadObs({ dataDir: join(tmp, 'data'), copiesDir: join(tmp, 'copies'), lake }, [DAY], stations);
const s1 = OB.byPid.get('synop:41571') || [];
ok(s1.length === 2 && s1[0].T === 33 && Math.abs(s1[0].W - 7.2) < 1e-9 && !OB.byPid.has('synop:OPRN') && !OB.byPid.has('metar:OPRN') && !OB.byPid.has('synop:41640') && OB.src.synop === 2 && s1.every((r) => r.T !== 40),
  'H5 synoptic reports: numeric ids of listed stations only, one per station and time (first kept), wind m/s -> km/h, served_c never read', JSON.stringify({ s1, src: OB.src }));
/* H6 / H7 the client line and the headline rows */
const recs = (n, cells) => { const out = []; for (let i = 0; i < n; i++) out.push({ day: new Date(Date.parse('2026-09-15T00:00:00Z') + i * 864e5).toISOString().slice(0, 10), S: {}, C: cells(i), V: {} }); return out; };
const machOnly = V.summarize(recs(30, () => ({ 'heat2sp|mach|plains|1|urban': [5, 0, 5, 20], 'heat2|mach|plains|1|urban': [5, 0, 5, 20] })));
ok(machOnly.client.eligible === false && machOnly.client.days === 0 && machOnly.heat.moderatePlus.every((x) => !x.n) && machOnly.heat.byNetwork.mach.moderatePlus[1].n === 30 * 30,
  'H6a/H7 MACH heat never enters the client line or the headline rows; it is shown apart (byNetwork.mach)', JSON.stringify(machOnly.client));
const lead0 = V.summarize(recs(30, () => ({ 'heat2sp|synop|plains|0|rural': [9, 1, 1, 20], 'heat2sp|synop|plains|3|rural': [9, 1, 1, 20] })));
ok(lead0.client.eligible === false && lead0.client.days === 0, 'H6b forecast days 0 and 3 never enter the client line (the evidence covers days 1 and 2)');
const other = V.summarize(recs(30, () => ({ 'heat2|synop|plains|1|rural': [9, 1, 1, 20] })));
ok(other.client.eligible === false, 'H6c stations outside Sindh and Punjab (heat2 cells without the domain cell) never enter the client line');
const good = V.summarize(recs(30, (i) => ({ 'heat2sp|synop|plains|1|rural': [9 + (i % 2), 1, 1, 20], 'heat2sp|metar|coast|2|urban': [4, i % 2, 1, 6], 'heat2sp|mach|plains|1|urban': [0, 0, 50, 0] })));
const L = good.client.line || '';
ok(good.client.eligible === true && /forecast days 1 and 2, Sindh and Punjab/.test(L) && /95 % interval \d+–\d+ %/.test(L) && /not yet verified/.test(L) && /2026-09-15 to 2026-10-14/.test(L) && good.client.pod.v > 0.8 && !/MACH|synop|PMD|METAR/i.test(L),
  'H6d with 30 days in the domain: the line states domain, period, interval and "not yet verified" elsewhere; the MACH cell (all misses) is ignored', L);
/* H8 the generated sentences */
const T = mkdtempSync(join(tmpdir(), 'hs8-'));
execFileSync('python3', [join(APP, 'scripts', 'gen', 'gen_evidence.py'), join(D0, 'evidence', 'sci2821'), join(T, 'e.json'), join(D0, 'evidence', 'heat2838')], { encoding: 'utf8' });
const G = JSON.parse(readFileSync(join(T, 'e.json'), 'utf8')), E = JSON.parse(readFileSync(join(D0, 'skill-evidence.json'), 'utf8'));
const rows = readFileSync(join(D0, 'evidence', 'heat2838', 'heat_issued_vs_standard.csv'), 'utf8').trim().split('\n'); const head = rows[0].match(/("[^"]*"|[^,]+)/g);
const row = (lvl) => { for (const r of rows.slice(1)) { const c = r.match(/("[^"]*"|[^,]+)/g); const o = Object.fromEntries(head.map((h, i) => [h, (c[i] || '').replace(/"/g, '')])); if (o.region === 'Sindh+Punjab' && o.leads === '1-2' && o.level === lvl) return o; } return null; };
const m = row('Moderate+'), h = row('High+'), P = (x) => Math.round(100 * Number(x)), ci = (s) => s.replace(/[[\]]/g, '').split(',').map(Number);
const want = `caught ${P(m.POD)} % of the observed Moderate-or-higher days (95 % interval ${P(ci(m.POD_ci95)[0])}–${P(ci(m.POD_ci95)[1])} %), and ${P(m.FAR)} % of its Moderate-or-higher forecasts were false alarms (${P(ci(m.FAR_ci95)[0])}–${P(ci(m.FAR_ci95)[1])} %)`;
const hl = G.lines.heat;
ok(JSON.stringify(G.lines) === JSON.stringify(E.lines) && JSON.stringify(G.evidence) === JSON.stringify(E.evidence), 'H8a data/skill-evidence.json regenerates exactly from the evidence files');
ok(hl[0].includes(want) && /forecast days 1 and 2, Sindh and Punjab \(2–18 Oct 2026/.test(hl[0]) && /did better than carrying the last observed level forward/.test(hl[0]) && /not yet verified/.test(hl[0]) && hl[1].includes(P(h.FAR) + ' %') && /indicative and raise no alerts/.test(hl[1]),
  'H8b the heat sentences carry the table\'s numbers with their intervals, the domain and period, and "not yet verified" outside it', hl[0]);
const all = [...G.lines.temperature, ...G.lines.heat, ...G.lines.cold].join(' ');
ok(!/PMD|MACH|synop|METAR|Ogimet|WMO|ISD|Meteo/i.test(all) && Object.keys(G.evidence).some((p) => /heat2838\/summary\.json$/.test(p)) && Object.keys(G.evidence).some((p) => /heat2838\/heat_issued_vs_standard\.csv$/.test(p)),
  'H8c no network or agency name in a client sentence; the heat2838 files are hashed into the evidence');
/* H9 the gate: decisions unchanged */
let D = null; try { D = JSON.parse(execFileSync('python3', [join(APP, 'scripts', 'gen', 'gen_gate.py'), '--dry'], { encoding: 'utf8' })); } catch (e) { D = null; }
const lv = D && D.resolved && D.resolved.utci && D.resolved.utci.levels || {};
ok(lv.Moderate && lv.Moderate.canAlert === true && lv.High && lv.High.canAlert === false && lv.Severe && lv.Severe.canAlert === false, 'H9 gate unchanged: heat Moderate alerts, High and Severe indicative', JSON.stringify(lv).slice(0, 300));
done();
