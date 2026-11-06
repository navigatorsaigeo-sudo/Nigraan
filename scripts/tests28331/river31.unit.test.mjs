/* v91.17.283.31 · data lane · the river gauge sheet: irsa_sync.py parse and de-duplication (seed + daily read), the served stations,
   days 1-3 (the measured flow carried forward with the model's CHANGE, status carried with its skill), the reach -> station match, the
   model-flow purge (flowChangeOnly). STATION_LAKE_SCRIPTS=<dir with irsa_sync.py> (default: ../station-lake/scripts, else the
   packaging source scratchpad/int/sl/scripts).  node scripts/tests28331/river31.unit.test.mjs */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, copyFileSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url'; import { spawnSync } from 'node:child_process';
const HERE = dirname(fileURLToPath(import.meta.url)); const APP = join(HERE, '..', '..');
let n = 0, f = 0; const ok = (c, m, i) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c || i === undefined ? '' : '  :: ' + JSON.stringify(i).slice(0, 400))); if (!c) f++; };
const cands = [process.env.STATION_LAKE_SCRIPTS, join(APP, '..', 'station-lake', 'scripts'), join(APP, 'station-lake', 'scripts')].filter(Boolean);
const SCR = cands.map((d) => join(d, 'irsa_sync.py')).find((x) => existsSync(x));
const PY = process.platform === 'win32' ? 'python' : 'python3';
const TD = mkdtempSync(join(tmpdir(), 'r31_'));
const dd = (k) => new Date(Date.now() + 5 * 3600e3 - k * 864e5).toISOString().slice(0, 10);
const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const raw = (iso) => { const [y, m, d] = iso.split('-'); return Number(d) + '-' + mon[Number(m) - 1] + '-' + y.slice(2); };
try {
  const R = await import(pathToFileURL(join(APP, 'server', 'api', 'river31.mjs')).href);
  if (!SCR) ok(false, 'irsa_sync.py not found (set STATION_LAKE_SCRIPTS)', cands);
  else {
    const lake = join(TD, 'lake'), app = join(TD, 'app'); mkdirSync(join(app, 'data'), { recursive: true }); copyFileSync(join(APP, 'data', 'river-sheet-source.json'), join(app, 'data', 'river-sheet-source.json'));
    const seed = join(TD, 'seed.csv');
    writeFileSync(seed, 'date,station,river,height_m,lat,lon,inflow_cusec,inflow_trend,outflow_cusec,outflow_trend,status,last_reading,max_peak_cusec,max_peak_word,current_level_ft\n'
      + dd(2) + ',Chashma,Indus River,191.0,32.4359,71.3794,90000.0,rising,80000.0,rising,NORMAL,x,495435.0,MEDIUM,\n'
      + dd(1) + ',Chashma,Indus River,191.0,32.4359,71.3794,95000.0,rising,85000.0,rising,NORMAL,x,495435.0,MEDIUM,\n');
    const H = '"Date","Station","River","Height","Lat","Lon","Outflow","Inflow","Status","Last Reading","Max Peak","Current Level"\n';
    const sheet = join(TD, 'sheet.csv');
    writeFileSync(sheet, H + '"' + raw(dd(1)) + '","Chashma","Indus River","191 m","32.4359","71.3794","86,000 (Rising Trend)","96,000 (Rising Trend)","Normal","x","495,435 (MEDIUM 2010)",""\n'
      + '"' + raw(dd(0)) + '","Chashma","Indus River","191 m","32.4359","71.3794","120,000 (Rising Trend)","130,500 (Rising Trend)","Low","y","495,435 (MEDIUM 2010)",""\n'
      + '"' + raw(dd(0)) + '","","","","","","","","","","",""\n'
      + '"' + raw(dd(0)) + '","Taunsa","Indus River","140 m","30.51","70.85","50,000 (Falling Trend)","51,000 (Falling Trend)","N/A","z","",""\n');
    const run = () => spawnSync(PY, [SCR, '--lake', lake, '--app', app, '--seed', seed, '--csv', sheet], { encoding: 'utf8' });
    const r1 = run(); const st1 = JSON.parse(readFileSync(join(lake, 'archive', 'irsa', 'sync_status.json'), 'utf8'));
    ok(r1.status === 0 && st1.ok && st1.seeded === 2, 'first run seeds the archive from the clean history (2 rows)', { code: r1.status, err: r1.stderr, st1 });
    ok(st1.added === 2 && st1.changed === 1 && st1.rows === 4, 'the sheet: 2 new rows, 1 changed (same station and day: the later read wins), blank station dropped', st1);
    const r2 = run(); const st2 = JSON.parse(readFileSync(join(lake, 'archive', 'irsa', 'sync_status.json'), 'utf8'));
    ok(r2.status === 0 && st2.added === 0 && st2.changed === 0 && st2.rows === 4, 'a second read of the same sheet adds nothing (de-duplicated on station + date)', st2);
    const csv = readFileSync(join(lake, 'archive', 'irsa', 'irsa_daily.csv'), 'utf8');
    const lines = csv.trim().split(/\r?\n/); ok(lines.length === 5 && new Set(lines.slice(1).map((l) => l.split(',').slice(0, 2).join())).size === 4, 'one row per station and date in the archive', lines);
    ok(/,130500\.0,rising,120000\.0,rising,LOW,/.test(csv), 'parsed as clean.py: thousands commas dropped, the trend word kept apart, status upper-case', lines[lines.length - 1]);
    ok(lines.some((l) => /,Taunsa,Indus River,/.test(l) && /,,z,/.test(l)), '"N/A" status read as blank', lines);
    const P = R.parseSheet(csv); ok(P.length === 4 && P.find((x) => x.station === 'Chashma' && x.date === dd(1)).inflowCusec === 96000, 'the server parses the archive (the later read of ' + dd(1) + ' kept: 96,000)');
    /* the served stations and days 1-3 */
    const fake = { pointProducts: { get: async () => ({ status: 200, body: { daily: { time: [dd(1), dd(0), dd(-1), dd(-2), dd(-3)], river_discharge: [900, 1000, 1100, 1210, 1000] } } }) } };
    const RS = R.createRiverSheet(fake, { lakeDir: lake, dataDir: join(APP, 'data') });
    const S = RS.stations(); const ch = S.stations.find((s) => s.station === 'Chashma');
    ok(S.ready && S.n === 2 && ch.date === dd(0) && ch.flowCusec === 130500 && ch.level === 1 && ch.word === 'Low', 'today: the measured flow (inflow) and the official status as a level', ch);
    const F = await RS.forecast(ch);
    ok(F.days[0].observed && F.days[0].flowCusec === 130500, 'day 0 is the measured value, marked observed');
    ok(F.days[1].flowCusec === 143550 && F.days[2].flowCusec === 157905 && F.days[3].flowCusec === 130500 && F.days.slice(1).every((d) => d.changeApplied), 'days 1-3: measured flow x the model’s change (1.1, 1.21, 1.0)', F.days.map((d) => d.flowCusec));
    ok(F.days.slice(1).every((d) => d.status === 'LOW' && d.carried) && F.days[1].statusSkill.pod === 0.80 && F.days[2].statusSkill.far === 0.32 && F.days[3].statusSkill.pod === 0.57, 'days 1-3: status carried forward with its tested POD / FAR (0.80/0.20, 0.68/0.32, 0.57/0.43)');
    ok(!JSON.stringify(F).match(/"(river_discharge|discharge)"|1210|1100\b/), 'the model’s flows never appear in the station forecast (its change only)', F);
    const F0 = await R.createRiverSheet({ pointProducts: { get: async () => ({ status: 500 }) } }, { lakeDir: lake, dataDir: join(APP, 'data') }).forecast(ch);
    ok(F0.days.slice(1).every((d) => d.flowCusec === 130500 && !d.changeApplied), 'no model answer: plain persistence (the flow carried unchanged)');
    const M = RS.measuredFor('chashma'); ok(M && M.station === 'Chashma' && M.level === 1 && M.ageDays <= 1, 'reach gauge chashma -> the measured Chashma station', M);
    ok(RS.measuredFor('attock') === null, 'a reach gauge with no sheet station (Attock): none');
  }
  /* flowChangeOnly */
  const C = R.flowChangeOnly({ time: ['a', 'b', 'c'], river_discharge: [0, 200, 300], river_discharge_median: [100, 150, null] });
  ok(C && !('river_discharge' in C) && !('river_discharge_median' in C) && C.river_flow_change[2] === 1.5 && C.river_flow_change_median[1] === 1.5 && C.river_flow_change_median[2] === null, 'flowChangeOnly: the change (ratio to the first non-zero day), no absolute flow kept', C);
  ok(R.flowChangeOnly(null) === null && R.flowChangeOnly({ time: [] }) === null, 'flowChangeOnly: nothing in, nothing out');
} catch (e) { ok(false, 'crashed: ' + (e && e.stack || e)); }
finally { try { rmSync(TD, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n${n - f} pass, ${f} fail`); process.exit(f ? 1 : 0);
