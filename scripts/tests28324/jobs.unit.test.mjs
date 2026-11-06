/* v91.17.283.24 . JOBS LANE: the agents and the scheduled jobs (self-audit J4 J5 J8 J9 J11 J16-J27, DGX C-1), offline (no server, no
   provider). Fixed clocks simulate the laptop going off and on.
     J4   persistence and the forecast it is compared with are scored on the same station-days (cells fm* / pm*)
     J5   the verification truth is never judged against the forecast it scores; an isolated wind value is kept (not dropped)
     J8   a data copy / sync (scheduler slot 'sync') never waits behind a long compute run or a back-fill
     J9   a diagnosis item names the registered experiment that tests it (suggestedTest.candidate); the weekly run puts it first
     J11  the weekly report lists a standing diagnosis item once (with its days), not once per day
     J16  daily maximum / minimum errors from the same hours on both sides
     J17  a forecast day with a missing rain hour is not scored (never 0)
     J18  the national temperature score uses Pakistan days
     J19  a verification back-fill stopped part-way keeps the days it scored (checkpoint)
     J20  the experiments' weekly minutes survive a stop: a run stopped by the laptop going off is counted to its time limit
     J21  one approval rule: that record, at or after it was written (same millisecond counts)
     J22  the LAMHA copy waits for a settling file and throws away a copy whose source changed while copied
     J23  the diagnostic run that finds its day written leaves no lock behind
     J24  LEARN_ALL: server-reading jobs ask the server first; the skill reload is logged; busy (69) is retried, offline (75) is not
     J26  cand_temp.py: the season from the PKT month (registered as temp-zone-abcs@2)
     J27  river truth: in-sample skill kept apart and labelled; only out-of-sample days give a skill figure
     C-1  the approve / revert commands of a promotion record in the form of the computer that wrote it, and both forms
   usage: node scripts/tests28324/jobs.unit.test.mjs */
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync, utimesSync, appendFileSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api'), AG = join(ROOT, 'scripts', 'agents');
const imp = (d, f) => import(pathToFileURL(join(d, f)).href);
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 400) : '')); } };
const TMP = mkdtempSync(join(tmpdir(), 'jobs28324-')); const sub = (n) => { const d = join(TMP, n); mkdirSync(d, { recursive: true }); return d; };
const V = await imp(AG, 'verify.mjs'), L = await imp(AG, 'lib.mjs'), U = await imp(API, 'utci.mjs');

/* ---- J4 / J16 / J17 · one synthetic station day through verify.scoreDay ---- */
{ const D = '2026-06-10', uid = 'Punjab|Lahore|Lahore City', d0 = L.dayStartMs(D);
  const hrs = (day, f) => { const o = []; const s = L.dayStartMs(day); for (let k = 0; k < 24; k++) { const r = f(k, s + k * 3600e3); if (r) o.push({ ms: s + k * 3600e3, ...r }); } return o; };
  /* the airport: observed every hour on D and D-1 (persistence for lead 0), nothing on D-2 (no persistence for lead 1); hour 14 of D missing */
  const obsM = [...hrs(L.addDays(D, -1), () => ({ T: 41, RH: 30, W: 10 })), ...hrs(D, (k) => k === 14 ? null : ({ T: 30, RH: 30, W: 10 }))];
  /* the MACH station: rain total 5 mm over all hours of D */
  const obsR = hrs(D, (k) => ({ T: 30, RH: 30, W: 10, PT: k === 0 ? 0 : 5 }));
  const fc = (issue, rainNullHour) => { const t0 = L.dayStartMs(issue), n = 96; const T = [], RH = [], W = [], P = [];
    for (let i = 0; i < n; i++) { const ms = t0 + i * 3600e3, k = Math.round((ms - d0) / 3600e3); T.push(k === 14 ? 400 : 300); RH.push(30); W.push(10); P.push(rainNullHour != null && k === rainNullHour ? null : 2); }
    return { z: 'plains', t0, n, T, RH, W, P, sel: null }; };
  const FC = new Map(); for (let L0 = 0; L0 <= 4; L0++) FC.set(L.addDays(D, -L0), new Map([[uid, fc(L.addDays(D, -L0), L0 === 1 ? 3 : null)], ['Punjab|Lahore|Model Town', fc(L.addDays(D, -L0), L0 === 1 ? 3 : null)]]));
  const HEAT = new Map(); for (let L0 = 0; L0 <= 3; L0++) HEAT.set(L.addDays(D, -L0), { at: d0, days: new Map([[L0, { [uid]: 3 }]]) });
  const stations = [{ pid: 'metar:OPLA', net: 'metar', key: 'OPLA', uid, urban: true, elevM: null }, { pid: 'mach:1', net: 'mach', key: '1', uid: 'Punjab|Lahore|Model Town', urban: true, elevM: null }];
  const OB = { byPid: new Map([['metar:OPLA', obsM], ['mach:1', obsR]]) };
  const r = await V.scoreDay({ now: d0 + 2 * 864e5 }, D, { stations, FC, PTS: new Map(), HEAT, OB, U, RADAR: {} });
  const C = r.C, S = r.S, k = (L0) => '|metar|plains|' + L0 + '|urban';
  ok(C['heat3' + k(1)] && !C['fm3' + k(1)] && !C['pm3' + k(1)] && C['fm3' + k(0)] && C['pm3' + k(0)] && C['fm3' + k(0)].reduce((a, b) => a + b) === C['pm3' + k(0)].reduce((a, b) => a + b),
    'J4 lead 1 has no persistence (no observation the day before its issue): neither fm nor pm is written; lead 0 has both on the same day', JSON.stringify(Object.keys(C)));
  ok(S['TX' + k(0)] && Math.abs(S['TX' + k(0)][1]) < 1e-9 && S['TN' + k(0)] && Math.abs(S['TN' + k(0)][1]) < 1e-9,
    'J16 the forecast peak at an hour without an observation is not set against the observed peak of the other hours (TX error 0, was +10 C)', JSON.stringify(S['TX' + k(0)]));
  const X = V.dailyExtremes([[1, 2], [3, null], [5, 1]]); ok(X === null, 'J16 fewer than DAY_MIN_HOURS paired hours: the extremes are not scored');
  const kr = (L0) => '|mach|plains|' + L0 + '|urban';
  ok(S['R' + kr(0)] && Math.abs(S['R' + kr(0)][1] - (4.8 - 5)) < 1e-6 && !S['R' + kr(1)] && !C['wet' + kr(1)],
    'J17 rain: the full issued day is scored (4.8 mm vs 5 mm); a day with a missing issued hour (lead 1) is not scored, not summed as 0', JSON.stringify({ L0: S['R' + kr(0)], L1: S['R' + kr(1)] }));
  ok(V.dayRain(fc(D, 3), d0) === null && Math.abs(V.dayRain(fc(D, null), d0) - 4.8) < 1e-9, 'J17 dayRain: null with a missing hour, the 24-hour sum otherwise'); }

/* ---- J5 · no forecast background; an isolated wind value stays ---- */
{ const Q = await imp(API, 'obsqc.mjs'); const P = Q.loadParams(join(ROOT, 'data')); const t = Date.parse('2026-06-10T07:00:00Z');
  const st = [{ pid: 'mach:iso', net: 'mach', lat: 36.3, lon: 74.6, elev: 1500, zone: 'mountain' }];
  const rows = new Map([['mach:iso', [{ ms: t, T: 20, RH: 50, W: 60 }]]]);
  const res = Q.qcBatch(st, rows, P, { nearestMin: 15, bgAt: null }); const r = rows.get('mach:iso')[0];
  ok(!(r.f && r.f.W) && !(r.f && r.f.T), 'J5 an isolated station (no neighbours, no forecast background): its wind and temperature are kept, counted unchecked', JSON.stringify({ f: r.f, sp: res.counts.spatial }));
  const src = readFileSync(join(AG, 'verify.mjs'), 'utf8');
  ok(/qcBatch\(qs, byPid, P, \{ nearestMin: NEAREST_MIN, bgAt: null,/.test(src) && !/bgAt: bgAt|const bgAt = FC \? backgroundOf/.test(src), 'J5 the verification (and the diagnostic, through loadObs) never passes the scored forecast as the QC background'); }

/* ---- J8 · the scheduler: a data sync never waits behind a long run or a back-fill ---- */
{ const { createScheduler } = await imp(API, 'scheduler.mjs'); const sc = createScheduler(); const order = []; let releaseLong, releaseBulk;
  sc.every('long', 3600e3, () => new Promise((res) => { order.push('long'); releaseLong = res; }), { firstMs: 0, heavy: 'long' });
  sc.every('bulk', 3600e3, () => new Promise((res) => { order.push('bulk'); releaseBulk = res; }), { firstMs: 0, heavy: 'bulk' });
  await new Promise((r) => setTimeout(r, 30));
  sc.every('lamha', 3600e3, async () => { order.push('lamha'); }, { firstMs: 0, heavy: 'sync' });
  sc.every('machdb', 3600e3, async () => { order.push('machdb'); }, { firstMs: 0, heavy: 'sync' });
  await new Promise((r) => setTimeout(r, 50));
  const ls = sc.list(); ok(order.includes('lamha') && order.includes('machdb') && ls.slots.sync && ls.slots.long && ls.jobs.find((j) => j.id === 'lamha').heavy === 'sync',
    'J8 with the long slot and the bulk slot held, the LAMHA copy and the MACH sync start at once (their own sync slot)', JSON.stringify({ order, slots: ls.slots }));
  releaseLong && releaseLong(); releaseBulk && releaseBulk();
  const A = readFileSync(join(API, 'agents.mjs'), 'utf8'), X = readFileSync(join(API, 'agents_exp.mjs'), 'utf8');
  ok(/'agentLamhaCopy'[\s\S]{0,400}heavy: 'sync'/.test(A) && /'agentFloodShadow'[\s\S]{0,400}heavy: 'long'/.test(A) && /'agentExperiments'[\s\S]{0,400}heavy: 'long'/.test(X), 'J8 LAMHA copy in the sync slot; experiments and flood shadow in the long slot'); }

/* ---- J9 / J20 / C-1 · the weekly experimentation run (fake registry and child, fixed clocks) ---- */
const REG = await imp(AG, 'exp_registry.mjs'), XP = await imp(AG, 'experiments.mjs');
{ ok(REG.candidateFor({ kind: 'step', responsible: 'start', where: { var: 'TN', zone: 'plains', urb: 'rural' } }) === 'blendr@1' && REG.candidateFor({ kind: 'step', responsible: 'national', where: { var: 'T', zone: 'hills' } }) === 'temp-zone-abcs@2'
    && REG.candidateFor({ kind: 'station', where: { var: 'T' } }) === null && REG.candidateFor({ kind: 'step', responsible: 'start', where: { var: 'RH', zone: 'plains' } }) === null,
    'J9 candidateFor: a responsible blend start -> BLEND-R; a zone step -> zone/time calibration; a station or a humidity item -> none');
  const dsrc = readFileSync(join(AG, 'diagnose.mjs'), 'utf8'); ok(/it\.suggestedTest = \{ kind:/.test(dsrc) && /candidateFor\(it\)/.test(dsrc), 'J9 the diagnostic writes suggestedTest { kind, candidate, text } on every item'); }
{ const data = sub('exp'), E = join(data, 'agents', 'experiments'); mkdirSync(join(data, 'agents', 'diagnose'), { recursive: true });
  const nowMs = Date.parse('2026-10-25T03:00:00Z'), week = XP.weekKey(nowMs);
  REG.DECIDE.fake28324 = () => ({ rulePassed: true, variant: 'V', strata: [{ name: 'all', ok: true }], agree: true, headline: [{ label: 'x', value: 1 }], reasons: [], scriptSays: 'pass' });
  const mk = (id) => ({ id, title: id, sourceRule: { file: 'test', key: id, text: 'test rule' }, script: 'cand_temp.py', decide: 'fake28324', estimateMin: 15, inputs: () => [], args: (c, out) => [out],
    pointer: { target: 'fx-model-served', file: 'flood-fx-model.json', what: 'test' } });
  const reg = [mk('a@1'), mk('b@1')];
  writeFileSync(join(data, 'agents', 'diagnose', '2026-10-24.json'), JSON.stringify({ items: [{ id: 'X', kind: 'step', rank: 1, suggestedTest: { kind: 'registered_experiment', candidate: 'b@1', text: 'test' } }] }));
  mkdirSync(E, { recursive: true }); writeFileSync(join(E, 'last.json'), JSON.stringify({ 'a@1': { week: '2026-10-18', status: 'done', mode: 'run', fingerprint: 'old' }, 'b@1': { week: '2026-10-18', status: 'done', mode: 'run', fingerprint: 'old' } }));
  /* the laptop went off at 01:00 UTC while a@1 ran (limit 60 min); it is on again at 03:00 */
  writeFileSync(join(E, 'budget.json'), JSON.stringify({ week, usedMin: 20, runs: [], pending: { id: 'a@1', limitMin: 60, at: '2026-10-25T01:00:00Z' } }));
  const ran = []; const fakeChild = async (outDir, a) => { ran.push(outDir.split(/[\\/]/).pop()); writeFileSync(a[1], JSON.stringify({ ok: true })); return { code: 0, killed: false, wallS: 900, meter: { wallS: 900, peakRssMb: 10, cpuS: 1 } }; };
  const S1 = await XP.runWeek({ app: ROOT, dataDir: data, nowMs, budgetMin: 100, registry: reg, runChild: fakeChild, clock: () => nowMs, platform: 'linux', lake: join(TMP, 'nolake'), retrain: join(TMP, 'none') });
  const B = JSON.parse(readFileSync(join(E, 'budget.json'), 'utf8'));
  ok(B.runs[0] && B.runs[0].id === 'a@1' && B.runs[0].min === 60 && /stopped/.test(B.runs[0].stopped) && !B.pending, 'J20 the candidate running when the laptop went off is counted to its time limit (60 min), on disk', JSON.stringify(B.runs));
  ok(Math.abs(S1.usedMin - 95) < 1e-6 && ran.length === 1 && S1.results.some((r) => r.id === 'a@1' && r.status === 'queued'), 'J20 20 + 60 used before, 20 left: one 15-min candidate runs, the other (15 min, 5 left) is queued; used 95 of 100', JSON.stringify({ used: S1.usedMin, ran, st: S1.results.map((r) => r.id + ':' + r.status) }));
  ok(ran[0] === 'b_1', 'J9 the candidate a diagnosis asks for (b@1) runs before the plain re-run (a@1)', ran.join(','));
  const P = JSON.parse(readFileSync(join(E, 'runs', week, 'b_1', 'promotion.json'), 'utf8'));
  ok(P.approve && P.approve.platform === 'linux' && /^cd "/.test(P.approve.command[0]) && /scripts\/gen\/exp_approve\.mjs approve "data\/agents\/experiments\/runs\//.test(P.approve.command[1])
    && /^cd \/d "/.test(P.approve.commandWin[0]) && /scripts\\gen\\exp_approve\.mjs/.test(P.approve.commandWin[1]) && /^cd "/.test(P.approve.revertLinux[0]) && /^cd \/d "/.test(P.approve.revertWin[0]),
    'C-1 a record written on Linux carries the Linux command as command, and both forms with their own cd line', JSON.stringify(P.approve));
  /* the same week, a second start (laptop on again): nothing is counted twice */
  const S2 = await XP.runWeek({ app: ROOT, dataDir: data, nowMs: nowMs + 3600e3, budgetMin: 100, registry: reg, runChild: fakeChild, clock: () => nowMs + 3600e3, platform: 'win32', lake: join(TMP, 'nolake'), retrain: join(TMP, 'none') });
  ok(Math.abs(S2.usedMin - 95) < 1e-6 && ran.length === 1, 'J20 a second start the same week has no budget again (was the whole 180 min at every start)', JSON.stringify({ used: S2.usedMin, ran }));
  const B2 = JSON.parse(readFileSync(join(E, 'budget.json'), 'utf8')); const nextWeek = await XP.runWeek({ app: ROOT, dataDir: data, nowMs: nowMs + 7 * 864e5, budgetMin: 100, registry: [mk('c@1')], runChild: fakeChild, clock: () => nowMs + 7 * 864e5, platform: 'win32', lake: join(TMP, 'nolake'), retrain: join(TMP, 'none') });
  const P3 = JSON.parse(readFileSync(join(E, 'runs', XP.weekKey(nowMs + 7 * 864e5), 'c_1', 'promotion.json'), 'utf8'));
  ok(B2.week === week && nextWeek.usedMin === 15 && P3.approve.platform === 'windows' && /^cd \/d "/.test(P3.approve.command[0]) && /^cd "/.test(P3.approve.commandLinux[0]), 'J20 a new week starts with its full budget; C-1 a Windows record gives the Windows command first', JSON.stringify({ used: nextWeek.usedMin, p: P3.approve.platform }));
  delete REG.DECIDE.fake28324; }

/* ---- J21 · one approval rule ---- */
{ const Ptr = await imp(AG, 'exp_pointer.mjs'); const at = '2026-10-25T03:00:00.000Z', rec = 'data/agents/experiments/runs/2026-10-25/b_1/promotion.json';
  const same = [{ action: 'approve', result: 'done', record: '2026-10-25/b_1/promotion.json', at }], before = [{ action: 'approve', result: 'done', record: '2026-10-25/b_1/promotion.json', at: '2026-10-25T02:59:59.999Z' }];
  const other = [{ action: 'approve', result: 'done', record: '2026-10-18/b_1/promotion.json', at: '2026-10-26T00:00:00Z', id: 'b@1' }];
  ok(Ptr.approvedFor(same, rec, at) && !Ptr.approvedFor(before, rec, at) && !Ptr.approvedFor(other, rec, at) && Ptr.approvedFor(same, 'D:\\x\\runs\\2026-10-25\\b_1\\promotion.json', at),
    'J21 approved = an approval of THAT record at or after it was written (same millisecond counts; an older approval or another week\'s record does not)');
  const ps = readFileSync(join(AG, 'proposals.mjs'), 'utf8'), ax = readFileSync(join(API, 'agents_exp.mjs'), 'utf8');
  ok(/approvedFor\(appr, /.test(ps) && /Ptr\.approvedFor\(apprAll, /.test(ax) && !/Date\.parse\(x\.at\) > Date\.parse\(P\.at\)/.test(ps) && !/Date\.parse\(x\.at\) >= Date\.parse\(r\.P\.at\)/.test(ax), 'J21 the report and the operator page use that one rule'); }

/* ---- J11 · a standing diagnosis item once a week ---- */
{ const PR = await imp(AG, 'proposals.mjs'); const data = sub('prop'); mkdirSync(join(data, 'agents', 'diagnose'), { recursive: true });
  for (let i = 1; i <= 7; i++) writeFileSync(join(data, 'agents', 'diagnose', '2026-10-' + String(18 + i).padStart(2, '0') + '.json'), JSON.stringify({ items: [{ id: 'S1', kind: 'station', rank: 1, title: 'Station X reads warm', where: { var: 'T', station: 'synop:1' }, responsible: 'synop:1', suggestedTest: { kind: 'site_check', candidate: null, text: 'visit the site' } }] }));
  const R = PR.buildReport({ dataDir: data, day: '2026-10-26' }); const own = R.owner.filter((o) => o.kind === 'sensor check');
  ok(own.length === 1 && /found on 7 days, 2026-10-19 to 2026-10-25/.test(own[0].text) && R.found.diagnoses.length === 1, 'J11 the same item found on 7 days is one owner item (with its days), not 7', JSON.stringify(R.owner)); }

/* ---- J18 · Pakistan days in the national score ---- */
{ const root = sub('ns/nigraan-local'), lake = join(TMP, 'ns', 'station-lake', 'archive', 'fleet'); mkdirSync(lake, { recursive: true }); const data = sub('ns/data');
  const H = 'paired_utc,key,lat,lon,model_elev_m,obs_utc,hour_utc,lead_h,temp_c,rh_pct,dew_c,wind_kmh,fc_raw_c,fc_served_c,fc_rh_pct,fc_served_rh_pct\n';
  const row = (h, key) => ['x', key, 31.5, 74.3, 200, h, h, 1, 30, '', '', '', 31, 30.5, '', ''].join(',') + '\n';
  let sep = H, oct = H; for (let i = 0; i < 25; i++) { sep += row('2026-09-30T19:00:00Z'.replace('19:', String(19 + (i % 5)).padStart(2, '0') + ':'), 'k' + i); oct += row('2026-10-01T' + String(19 + (i % 5)).padStart(2, '0') + ':00:00Z', 'k' + i); }
  writeFileSync(join(lake, 'fleet_pairs_2026-09.csv'), sep); writeFileSync(join(lake, 'fleet_pairs_2026-10.csv'), oct);
  const { createNatScore } = await imp(API, 'natscore.mjs'); const N = createNatScore({}, root, data); const s = N.scoreDay('2026-10-01');
  /* PKT 1 Oct = 30 Sep 19:00 UTC .. 1 Oct 19:00 UTC: the 25 September-file rows (19-23 UTC on 30 Sep), none of the 1 Oct 19-23 UTC rows */
  ok(s.all && s.all.n === 25, 'J18 the national score day is the Pakistan day (19:00-19:00 UTC; the rows of 30 Sep 19-23 UTC belong to 1 Oct PKT)', JSON.stringify(s.all)); }

/* ---- J19 · verification back-fill checkpoint ---- */
{ const data = sub('vf/data'); const copies = sub('vf/copies'); let n = 0; const stop = new Error('stopped (the 45-min kill / the laptop off)');
  const now = Date.parse('2026-10-27T03:00:00Z');
  let threw = null; try { await V.run({ dataDir: data, copiesDir: copies, lake: join(TMP, 'none'), backfill: 10, now, onDay: () => { if (++n === 3) throw stop; } }); } catch (e) { threw = e; }
  const led = V.readLedger(join(data, 'agents', 'verify'));
  ok(threw === stop && led.length === 3 && led[0].day === '2026-10-17', 'J19 a back-fill stopped after 3 of 10 days keeps those 3 in the ledger (written after each day)', JSON.stringify({ threw: threw && threw.message, days: led.map((r) => r.day) })); }

/* ---- J22 · LAMHA copy: settle and stability ---- */
/* v91.17.283.28 · retired: lamha_copy.mjs copies nothing (NIGRAAN independent of LAMHA); J22 kept for the record, not run */
if (false) { const LC = await imp(AG, 'lamha_copy.mjs'); const lam = sub('lc/LAMHA'), dest = sub('lc/NIG/from_lamha'); const ews = join(lam, 'data', 'pmd', 'ews_live'); mkdirSync(ews, { recursive: true });
  const f = join(ews, 'ews_live_hourly.parquet'); writeFileSync(f, 'A'.repeat(1000)); const now = Date.now();
  const r1 = LC.copyOnce({ lamha: lam, dest, now, settleMs: 120e3 });
  ok(r1.settling.includes('ews_live/ews_live_hourly.parquet') && !existsSync(join(dest, 'ews_live', 'ews_live_hourly.parquet')), 'J22 a file written seconds ago is left for the next run (settling)', JSON.stringify(r1));
  utimesSync(f, new Date(now - 600e3), new Date(now - 600e3));
  const r2 = LC.copyOnce({ lamha: lam, dest, now, settleMs: 120e3, duringCopy: (s) => appendFileSync(s, 'BBBB') });
  ok(r2.unstable.includes('ews_live/ews_live_hourly.parquet') && !existsSync(join(dest, 'ews_live', 'ews_live_hourly.parquet')) && !require_parts(join(dest, 'ews_live')), 'J22 a source that changed while it was copied: the copy is thrown away (no torn file, no .part left)', JSON.stringify(r2));
  utimesSync(f, new Date(now - 600e3), new Date(now - 600e3));
  const r3 = LC.copyOnce({ lamha: lam, dest, now, settleMs: 120e3 });
  ok(r3.copied.length === 1 && statSync(join(dest, 'ews_live', 'ews_live_hourly.parquet')).size === 1004, 'J22 settled and unchanged: copied whole', JSON.stringify(r3.copied)); }
function require_parts(d) { try { return readdirSync(d).some((n) => /\.part\d+$/.test(n)); } catch (_) { return false; } }

/* ---- J23 · the diagnostic that finds its day written leaves no lock ---- */
{ const data = sub('dg/data'); mkdirSync(join(data, 'agents', 'diagnose'), { recursive: true }); writeFileSync(join(data, 'agents', 'diagnose', '2026-10-26.json'), '{}');
  const r = spawnSync(process.execPath, [join(AG, 'diagnose.mjs'), '--data', data, '--day', '2026-10-26'], { encoding: 'utf8' });
  ok(r.status === 0 && /already written/.test(r.stdout) && !existsSync(join(data, 'agents', 'diagnose.lock')), 'J23 "already written": exit 0 and no lock left (the next run is not refused)', r.stdout + r.stderr); }

/* ---- J24 / J25 · LEARN_ALL.bat ---- */
{ const b = readFileSync(join(ROOT, 'LEARN_ALL.bat')); const t = b.toString('latin1');
  ok(![...b].some((x) => x > 127) && !/[^\r]\n/.test(t), 'J24 LEARN_ALL.bat stays ASCII / CRLF');
  ok(/call :jobs rainprob /.test(t) && /call :jobs national /.test(t) && /call :jobs droughtchirps /.test(t) && /\r\n:jobs\r\n[\s\S]*?call :health\r\nif not "%HC%"=="200" \(\r\n  echo \[%DATE% %TIME%\] skip  %JS%: skipped, server not running/.test(t),
    'J24 the three jobs that read the server ask its health first and are logged "skipped, server not running" when it does not answer');
  ok(/call :putskill/.test(t) && !/curl -s -X PUT http:\/\/127\.0\.0\.1:8787\/api\/pool\/skill >nul 2>&1/.test(t) && /skill reload PUT \/api\/pool\/skill: HTTP %PC%/.test(t), 'J24 the skill reload PUT is logged with its HTTP answer (was sent blind)');
  /* v91.17.283.25: the busy retry moved into :job (every job, not only :jobr ones); :jobr returns on 69 so it is not retried twice */
  ok(/\r\n:job\r\n[\s\S]*?\r\n:job_again\r\n[\s\S]*?if "%RC%"=="69" \([\s\S]*?server busy[\s\S]*?goto job_again/.test(t) && /if "%RC%"=="75" exit \/b 0\r\nif "%RC%"=="69" exit \/b 0/.test(t),
    'J25 a provider busy end (69) is logged "server busy" and retried by :job itself (up to 3 tries); offline (75) is not retried'); }

/* ---- J26 · cand_temp.py season ---- */
{ const t = readFileSync(join(AG, 'exp', 'cand_temp.py'), 'utf8');
  ok(/P\['sea'\] = pkt\.dt\.month\.map\(SEAS\)/.test(t) && !/P\.t\.dt\.month/.test(t) && REG.REGISTRY.some((c) => c.id === 'temp-zone-abcs@2') && !REG.REGISTRY.some((c) => c.id === 'temp-zone-abcs@1'), 'J26 the season from the PKT month, registered as a new id (temp-zone-abcs@2)'); }

/* ---- J27 · river truth labelled ---- */
{ const t = readFileSync(join(AG, 'river_truth.mjs'), 'utf8');
  ok(/fittedThrough: '2026-10-31'/.test(t) && /outOfSample: skillOf\(season\.filter\(\(r\) => r\.date > S\.fittedThrough\)\)/.test(t) && /IN-SAMPLE \(fitted on these days\): not a skill figure/.test(t) && !/^\s*chanceLow: \{ vsPersistence/m.test(t), 'J27 river truth: skill out of sample only; the in-sample figures are labelled'); }

rmSync(TMP, { recursive: true, force: true });
console.log('\n' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
