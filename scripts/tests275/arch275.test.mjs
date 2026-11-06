// v91.17.275 · ARCH · tests for the three new test archives (river, rain, drought) and their monthly roll, plus the monthly score file and
// route when a server answers at BASE. Module tests run on a stub app in a temporary folder (nothing written under data/).
// usage: node scripts/tests275/arch275.test.mjs [http://127.0.0.1:PORT]
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createArchive, RAIN_SLOTS, ROLL_KINDS } from '../../server/api/archive.mjs';

process.env.NIGRAAN_WORKER = '0';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), DATA = join(APP, 'data');
const BASE = process.argv[2] || process.env.BASE || null;
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + d : '')); } };
const rd = (f) => gunzipSync(readFileSync(f)).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const tmp = mkdtempSync(join(tmpdir(), 'arch275-'));
const root = join(tmp, 'NIGRAAN', 'nig', 'nigraan-local'), dataDir = join(root, 'data'); mkdirSync(dataDir, { recursive: true });
const FX = join(APP, 'scripts', 'tests275', 'fixtures');

/* a stub store: tehsil runs with hourly rain (the national run's record shape) */
const runs = [], records = [];
function addRun(id, baseIso, units) {
  runs.push({ run_id: id, unit_level: 'tehsil', status: 'complete', base_valid_time: baseIso, completed_at: new Date(Date.parse(baseIso) + 20 * 60e3).toISOString() });
  for (const [k, rain] of Object.entries(units)) {
    const t0 = Date.parse(baseIso), time = rain.map((_, i) => new Date(t0 + i * 3600e3).toISOString().slice(0, 16));
    records.push({ runId: id, unitKey: k, lat: 33, lon: 73, hourly: { time, precipitation: rain, temperature_2m: rain.map(() => 20) } });
  }
}
const store = { all: (k) => (k === 'runs' ? runs : records), filter: (k, f) => (k === 'runs' ? runs : records).filter(f), find: (k, f) => (k === 'runs' ? runs : records).find(f) };
const LV = ['Low', 'Monitor', 'Watch', 'Act'];
const app = { store, flood: { point: (id) => ({ days: FLOOD.forecast.days.map((date, j) => ({ date, class: LV[(j + id.length) % 4] })) }) } };
const FLOOD = JSON.parse(readFileSync(join(FX, 'flood.json'), 'utf8'));
writeFileSync(join(dataDir, 'flood.json'), JSON.stringify(FLOOD));
writeFileSync(join(dataDir, 'drought-outlook.json'), readFileSync(join(FX, 'drought-outlook.json')));
const A = createArchive(app, root, dataDir, { timers: false });

/* ── R · river ── */
{
  const r1 = await A.archiveRiver({}); const r2 = await A.archiveRiver({});
  const f = join(dataDir, 'archive', 'river', 'river_' + r1.day.slice(0, 7) + '.jsonl.gz'); const rows = rd(f);
  ok(r1.reaches === Object.keys(FLOOD.forecast.points).length && r1.leads === FLOOD.forecast.days.length, 'R1 one row with every reach and every lead', r1.reaches + ' reaches x ' + r1.leads + ' leads, ' + r1.bytes + ' bytes');
  ok(/already archived|unchanged/.test(r2.skipped || '') && rows.length === 1, 'R2 the same run is written once a day');
  const id = Object.keys(FLOOD.forecast.points)[0], P = FLOOD.forecast.points[id], row = rows[0].r[id];
  const j = 7, src = P.days.find((x) => x.date === FLOOD.forecast.days[j]);
  ok(row.q50[j] === src.q[1] && row.q10[j] === src.q[0] && row.q90[j] === src.q[2] && row.p2[j] === (src.p ? src.p.rp2 : null), 'R3 lead 7 median / 10 % / 90 % / share > 2-yr equal data/flood.json', id + ' q50 ' + row.q50[j]);
  ok(row.c[j] === (j + id.length) % 4, 'R4 the served class per lead rides along (0 Low .. 3 Act)');
  ok(r1.bytes < 20000, 'R5 small: under 20 KB a day', r1.bytes + ' bytes');
  /* a later run on the same Pakistan day is not written twice */
  const F2 = { ...FLOOD, forecast: { ...FLOOD.forecast, at: new Date(Date.parse(FLOOD.forecast.at) + 60e3).toISOString() } }; writeFileSync(join(dataDir, 'flood.json'), JSON.stringify(F2));
  const r3 = await A.archiveRiver({}); ok(/one run a day/.test(r3.skipped || ''), 'R6 a second run of the same day is skipped (one a day)');
}

/* ── N · rain by lead ── */
{
  const day = '2026-10-20', s0 = Date.parse(day + 'T00:00:00Z') - 5 * 3600e3;
  /* tehsil a: 1 mm/h for 3 h then a 12 mm hour; tehsil b: dry */
  const rainA = Array.from({ length: 73 }, (_, i) => (i >= 10 && i < 13 ? 1 : i === 13 ? 12 : i === 40 ? 3 : 0)), rainB = Array(73).fill(0);
  for (const sh of RAIN_SLOTS) addRun('run_' + sh, new Date(s0 + sh * 3600e3).toISOString(), { 'P|D|a': rainA, 'P|D|b': rainB });
  addRun('run_6b', new Date(s0 + 7 * 3600e3).toISOString(), { 'P|D|a': rainA });   /* a later run in the 06 slot: not the slot's issue */
  const n1 = await A.archiveRain({ nowMs: s0 + 19 * 3600e3 }); const n2 = await A.archiveRain({ nowMs: s0 + 20 * 3600e3 });
  ok(n1.filter((x) => x.day === day).length === 4 && n2.length === 0, 'N1 four issues a day (00/06/12/18 PKT), each written once', n1.map((x) => x.slot).join(','));
  const rows = rd(join(dataDir, 'archive', 'rain', 'rain_2026-10.jsonl.gz')).filter((r) => r.d === day);
  const r00 = rows.find((r) => r.slot === '00'), r06 = rows.find((r) => r.slot === '06');
  ok(r06.run === 'run_6', 'N2 the slot takes the run whose first hour opens it (not a later run in the slot)');
  const a0 = r00.u['P|D|a'][0];   /* day 1 of the 00 PKT issue: hours 10-13 PKT */
  ok(a0[0] === 120 && a0[1] === 13 && a0[2] === 150 && a0[3] === 13 && a0[4] === 150 && a0[5] === 24, 'N3 wettest hour 12.0 mm at 13 PKT, wettest 6 h 15.0 mm ending 13 PKT, total 15.0 mm, 24 hours', JSON.stringify(a0));
  const a1 = r00.u['P|D|a'][1]; ok(a1[0] === 30 && a1[1] === 16, 'N4 day 2 of the issue (lead 24-47 h): 3.0 mm at 16 PKT', JSON.stringify(a1));
  ok(r00.u['P|D|b'][0][0] === 0 && r00.days[0] === day, 'N5 a dry tehsil is kept with zeros (false-alarm tests need it); days are Pakistan dates');
  const a06 = r06.u['P|D|a'][0]; ok(a06[5] === 18 && a06[1] === 19, 'N6 the 06 PKT issue holds 18 hours of its first day (lead from its own base)', JSON.stringify(a06));
  /* records pruned: nothing written, no error */
  const before = rows.length; runs.forEach((r) => { r.records_pruned = true; }); const n3 = await A.archiveRain({ nowMs: s0 + 30 * 3600e3 });
  ok(n3.length === 0, 'N7 pruned runs are skipped without error');
  const st = A.status(); ok(st.kinds.rain.days >= 1 && st.kinds.rain.medianBytesPerDay < 60000, 'N8 status shows the rain kind and its size per day', st.kinds.rain.medianBytesPerDay + ' bytes/day (2 tehsils)');
}

/* ── D · drought outlook issues ── */
{
  const d1 = await A.archiveDrought({}); const d2 = await A.archiveDrought({});
  const O = JSON.parse(readFileSync(join(FX, 'drought-outlook.json'), 'utf8'));
  ok(d1.tehsils === Object.keys(O.units).length && /already archived|unchanged/.test(d2.skipped || ''), 'D1 one row per issue, written once', d1.tehsils + ' tehsils, ' + d1.bytes + ' bytes');
  const row = rd(join(dataDir, 'archive', 'drought', readdirSync(join(dataDir, 'archive', 'drought'))[0])).pop();
  const k = Object.keys(O.units)[0], x = O.units[k];
  ok(row.u[k][0] === Math.round(x.spi90Now * 100) && row.u[k][1] === Math.round(x.spi90Outlook * 100) && row.u[k][3] === x.bandOutlook && row.u[k][4] === Math.round(x.rainNext15Mm * 10), 'D2 values equal the outlook file (spi x100, rain tenths)', k);
  ok(row.issued === O.issued && row.validTo === O.validTo && row.passed === !!O.passed, 'D3 issue date, valid-to and test verdict kept');
  const O2 = { ...O, issued: '2026-10-06', built: '2026-10-10T00:00Z' }; writeFileSync(join(dataDir, 'drought-outlook.json'), JSON.stringify(O2));
  const d3 = await A.archiveDrought({}); ok(d3.issued === '2026-10-06', 'D4 a new issue is appended');
  rmSync(join(dataDir, 'drought-outlook.json')); const d4 = await A.archiveDrought({}); ok(/no data/.test(d4.skipped || ''), 'D5 no outlook file: skipped, no error');
}

/* ── L · monthly roll (move, never delete) ── */
{
  const arch = join(dataDir, 'archive');
  mkdirSync(join(arch, 'forecast'), { recursive: true }); writeFileSync(join(arch, 'forecast', 'fc_2026-07.jsonl.gz'), 'keep');
  for (const k of ROLL_KINDS) for (const mo of ['2026-07', '2026-08', '2026-09', '2026-10']) { const f = join(arch, k, k + '_' + mo + '.jsonl.gz'); if (!existsSync(f)) writeFileSync(f, Buffer.from('x' + mo)); }
  const r = await A.rollOld({ nowMs: Date.parse('2026-10-20T00:00:00Z') });
  const left = (k) => readdirSync(join(arch, k)).sort();
  /* on 20 Oct: July ended 81 days ago -> moved; August ended 50 days ago -> moved; September is last month -> kept; October kept */
  ok(r.moved.length === 6 && left('river').join() === 'river_2026-09.jsonl.gz,river_2026-10.jsonl.gz', 'L1 on 20 Oct July and August move, September (last month) and October stay', r.moved.join(' '));
  const dst = join(tmp, 'NIGRAAN', '_admin', 'archive', 'forecast-archive');
  ok(existsSync(join(dst, 'rain', 'rain_2026-07.jsonl.gz')) && readFileSync(join(dst, 'rain', 'rain_2026-07.jsonl.gz'), 'utf8') === 'x2026-07', 'L2 moved to <NIGRAAN>/_admin/archive/forecast-archive/<kind>/ intact');
  ok(/moved, nothing deleted/.test(readFileSync(join(dst, 'MOVED.txt'), 'utf8')), 'L3 MOVED.txt logs every move');
  const r2 = await A.rollOld({ nowMs: Date.parse('2026-10-25T00:00:00Z') }); ok(/rolled this month/.test(r2.skipped || ''), 'L4 once a month');
  ok(existsSync(join(arch, 'forecast', 'fc_2026-07.jsonl.gz')) && A.status().retention === 'permanent (never pruned)' && A.status().rollRetention.kinds.join() === 'river,rain,drought', 'L5 forecast / fleet / imerg / issued are not rolled (permanent; the v76 status string unchanged)', A.status().rollRetention.rule);
}

/* ── S · monthly score file + route ── */
{
  const S = JSON.parse(readFileSync(join(DATA, 'score-monthly.json'), 'utf8'));
  ok(S.window && S.window.from === '2026-09-26' && S.window.to === '2026-10-16', 'S1 score window 26 Sep -> 16 Oct', JSON.stringify(S.window));
  const zs = Object.keys(S.zones || {}); ok(['plains', 'hills', 'mountain', 'coast'].every((z) => zs.includes(z)), 'S2 every zone present', zs.join(','));
  ok(S.variables && ['temperature', 'dewPoint', 'wind', 'rainDay'].every((v) => S.variables.includes(v)), 'S3 temperature, dew point, wind, rain day');
  let leadsOk = true; for (const z of zs) for (const v of S.variables) for (const L of ['0', '1', '2', '3']) if (!S.zones[z][v] || !(L in S.zones[z][v])) leadsOk = false;
  ok(leadsOk, 'S4 every zone x variable carries leads 0-3 (a value or the reason it is missing)');
  ok(typeof S.ownerSummary === 'string' && S.ownerSummary.length > 50 && S.audience === 'operator', 'S5 owner summary present; operator only');
}
/* ── M · mountain dew point: the decision is recorded and the served data matches it ── */
{
  const R = JSON.parse(readFileSync(join(APP, 'scripts', 'arch275', 'out', 'mountain_dew.json'), 'utf8'));
  const MM = JSON.parse(readFileSync(join(DATA, 'moist-model.json'), 'utf8'));
  ok(R.decision && typeof R.decision.switch === 'boolean', 'M1 the mountain dew check carries a decision', JSON.stringify(R.decision));
  ok(MM.dew.zones.mountain.applied === !R.decision.switch, 'M2 data/moist-model.json mountain applied = ' + MM.dew.zones.mountain.applied + ' agrees with the decision');
  const f = R.fleet && R.fleet.since13Oct; ok(f && f.served_vs_raw && f.served_vs_off && f.served_vs_raw.stations === 3, 'M3 fleet since 13 Oct: served vs raw and vs the switched-off chain, 3 stations', f ? f.served_vs_raw.maeA + ' raw / ' + f.served_vs_raw.maeB + ' served / ' + f.served_vs_off.maeA + ' off' : '');
}
if (BASE) {
  const get = async (p, h = {}) => { const r = await fetch(BASE + p, { headers: h }); let j = null; try { j = await r.json(); } catch (_) {} return { s: r.status, j }; };
  const op = await get('/api/score/monthly'); ok(op.s === 200 && op.j && op.j.zones, 'H1 /api/score/monthly answers the operator (local)', 'status ' + op.s);
  const cu = await get('/api/score/monthly', { 'x-agn-view': 'customer' });
  ok(cu.s === 403 || cu.s === 401 || (cu.j && !cu.j.zones), 'H2 not for customers', 'status ' + cu.s);
  const ar = await get('/api/ops/archive'); ok(ar.s === 200 && ar.j && ar.j.kinds && ar.j.kinds.river && ar.j.kinds.rain && ar.j.kinds.drought, 'H3 /api/ops/archive lists river, rain, drought');
  const pg = await fetch(BASE + '/analyst'); const html = await pg.text(); ok(/Forecast score/.test(html), 'H4 the page carries the operator "Forecast score" panel');
}
rmSync(tmp, { recursive: true, force: true });
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
