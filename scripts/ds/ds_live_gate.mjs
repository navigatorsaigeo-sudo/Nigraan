/* v91.17.259 · D2/D3 · GATE FROM THE LIVE HELD-OUT CHECK (D:\NIGRAAN\_admin\ds\live_check.jsonl)
   Per zone where the point dew model is applied (moist-model.json dew.zones[z].applied): the 250 m cell against the tehsil value
   (and the point value, for the record), on the SAME station-hours, stations never used to fit the dew model.
     D2 dew point and RH: the cell passes in a zone when it matches the tehsil value's held-out error or beats it
        (mean of the station MAE gain tehsil - cell >= 0) with at least 5 held-out stations (fewer give no usable station
        bootstrap); 90 % interval of the gain from 2000 station-bootstrap draws reported.
     D3 shade UTCI: the same rule on UTCI (observed UTCI = observed temperature and humidity with the candidate's own wind),
        and only in a zone where D2 passed (UTCI is built on the cell dew point).
   Writes data/natgrid-moist-gate.json (read by natgrid.mjs) and D:\NIGRAAN\_admin\ds\live_gate.json.
   node scripts\ds\ds_live_gate.mjs */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..'), DATA = process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data');
const OUTD = join(ROOT, '..', '..', '_admin', 'ds'), F = join(OUTD, 'live_check.jsonl');
const M = JSON.parse(readFileSync(join(DATA, 'moist-model.json'), 'utf8'));
const rows = existsSync(F) ? readFileSync(F, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const dewOf = (T, RH) => { if (T == null || RH == null || RH <= 0) return null; const g = Math.log(Math.min(100, RH) / 100) + 17.67 * T / (243.5 + T); return 243.5 * g / (17.67 - g); };
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const r2 = (x) => x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100;
function compare(R, getA, getB, getO) {   /* station MAEs on station-hours where both candidates and the observation exist */
  const by = new Map(); for (const r of R) { const a = getA(r), b = getB(r), o = getO(r); if (a == null || b == null || o == null) continue; const e = by.get(r.key) || { a: [], b: [] }; e.a.push(Math.abs(a - o)); e.b.push(Math.abs(b - o)); by.set(r.key, e); }
  const st = [...by.entries()].map(([k, e]) => ({ k, a: e.a.reduce((x, y) => x + y, 0) / e.a.length, b: e.b.reduce((x, y) => x + y, 0) / e.b.length, n: e.a.length }));
  if (!st.length) return { stations: 0 };
  const mean = (v) => v.reduce((x, y) => x + y, 0) / v.length; const gain = (S) => mean(S.map((s) => s.b - s.a));
  const g0 = gain(st), bs = []; for (let i = 0; i < 2000; i++) { const S = st.map(() => st[Math.floor(rnd() * st.length)]); bs.push(gain(S)); } bs.sort((x, y) => x - y);
  return { stations: st.length, pairs: st.reduce((x, s) => x + s.n, 0), maeCell: r2(mean(st.map((s) => s.a))), maeOther: r2(mean(st.map((s) => s.b))), gain: r2(g0), gain90: [r2(bs[100]), r2(bs[1899])] };
}
const zones = Object.entries(M.dew.zones).filter(([, v]) => v.applied).map(([z]) => z);
const out = { built: new Date().toISOString(), source: 'D:\\NIGRAAN\\_admin\\ds\\live_check.jsonl', hours: [...new Set(rows.map((r) => r.hourUtc))].sort(), rule: 'a zone passes when the 250 m cell matches or beats the tehsil value on held-out fleet stations (mean station MAE gain >= 0, at least 5 stations); UTCI only where the dew point passed', zones: {} };
for (const z of ['mountain', 'hills', 'plains', 'coast']) {
  const R = rows.filter((r) => r.cell && r.cell.zone === z);
  const oTD = (r) => r.obs.TD != null ? r.obs.TD : dewOf(r.obs.T, r.obs.RH);
  const dewT = compare(R, (r) => r.cell.td, (r) => r.tehsil && r.tehsil.td, oTD), dewP = compare(R, (r) => r.cell.td, (r) => r.point && r.point.td, oTD);
  const rhT = compare(R, (r) => r.cell.rh, (r) => r.tehsil && r.tehsil.rh, (r) => r.obs.RH);
  const uT = compare(R, (r) => r.cell.utci == null || r.cell.utciObs == null ? null : r.cell.utci - r.cell.utciObs, (r) => r.tehsil && r.tehsil.utci != null && r.tehsil.utciObs != null ? r.tehsil.utci - r.tehsil.utciObs : null, () => 0);
  const tT = compare(R, (r) => r.cell.T, (r) => r.tehsil && r.tehsil.T, (r) => r.obs.T), tNL = compare(R, (r) => r.cell.Tnl, (r) => r.tehsilNoLive && r.tehsilNoLive.T, (r) => r.obs.T);
  const cons = (() => { const d = R.filter((r) => r.cell.td != null && r.point && r.point.td != null).map((r) => Math.abs(r.cell.td - r.point.td)); return d.length ? r2(d.reduce((x, y) => x + y, 0) / d.length) : null; })();
  const applied = zones.includes(z);
  const dewPass = applied && dewT.stations >= 5 && dewT.gain >= 0;
  const utciPass = dewPass && uT.stations >= 5 && uT.gain >= 0;
  out.zones[z] = { pointModelApplied: applied, dew: dewPass, utci: utciPass,
    why: !applied ? 'the point dew model is not applied in this zone (it failed its own held-out gate)' : dewT.stations < 5 ? 'fewer than 5 held-out stations with readings (' + (dewT.stations || 0) + ')' : !dewPass ? 'the 250 m dew point is worse than the tehsil value on held-out stations' : !utciPass ? 'dew point passed; UTCI worse than the tehsil value or too few stations' : 'passed',
    dewVsTehsil: dewT, dewVsPoint: dewP, rhVsTehsil: rhT, utciVsTehsil: uT, temperatureVsTehsil: tT, temperatureNoLiveVsTehsilNoLive: tNL, meanAbsCellMinusPointDew: cons };
}
writeFileSync(join(OUTD, 'live_gate.json'), JSON.stringify(out, null, 1));
const gf = join(DATA, 'natgrid-moist-gate.json'); if (existsSync(gf)) copyFileSync(gf, gf + '.' + new Date().toISOString().slice(0, 10) + '.bak');
writeFileSync(gf, JSON.stringify({ version: 'nmg-' + new Date().toISOString().slice(0, 10), built: out.built, rule: out.rule, hours: out.hours.length, zones: Object.fromEntries(Object.entries(out.zones).map(([z, v]) => [z, { dew: v.dew, utci: v.utci, why: v.why, dewVsTehsil: v.dewVsTehsil, utciVsTehsil: v.utciVsTehsil }])) }, null, 1));
for (const [z, v] of Object.entries(out.zones)) console.log(`${z.padEnd(9)} dew ${v.dew ? 'PASS' : 'fail'} utci ${v.utci ? 'PASS' : 'fail'} · dew cell/tehsil ${v.dewVsTehsil.maeCell}/${v.dewVsTehsil.maeOther} (${v.dewVsTehsil.stations || 0} st) · utci ${v.utciVsTehsil.maeCell}/${v.utciVsTehsil.maeOther} · ${v.why}`);
