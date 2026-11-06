// v91.17.283.10 · the diagnostic agent, part 2: stations and sensors (synthetic fleet of one zone; real data in d5_replay_proof)
//  Q1 a station whose error is persistent and isolated (it reads 2.6 C warm: forecast - observed -2.6 C, like Warisabad ARG_1) is a candidate
//     non-representative; a small offset (-0.5 C, inside the zone's own error) and the ordinary stations are not
//  Q2 a network whose hygrometers read 8 points more humid than the standard networks under the same forecast is found, with its size
//  Q3 a time-stamp offset of 3 h is found; a 1 h phase difference is only listed (a slope or valley can do that), never a candidate
//  Q4 a shrunk diurnal range (a shielded sensor) and a frozen day are found
//  Q5 leave-one-station-out: a cell bias carried by one station is attributed to it
//  Q6 nothing is acted on: the candidates are data; the agent never writes the non-representative list or the holds
import { ok, done, need, gauss, days, src } from './lib.mjs';
const D = await need('scripts/agents/diagnose.mjs', 'D2-STATIONS');
const DAYS = days('2026-09-25', 21); const g = gauss(7);
function station(pid, net, lat, lon, o = {}) { const st = { pid, net, name: pid, lat, lon, zone: 'hills', uid: 'X', urban: false, elevM: 1000, excluded: null, days: new Map(), bad: 0, readings: 100 };
  for (const day of DAYS) { const rec = { T: [0, 0], RH: [0, 0], Tabs: 0, RHabs: 0, obsT: [], fcT: [], obsRH: [], fcRH: [], byBlock: new Map() }; const dayNoise = 0.8 * g();
    for (let k = 0; k < 24; k++) { const cyc = (h) => 20 + 6 * Math.sin(2 * Math.PI * (h - 9) / 24); const truth = cyc(k) + dayNoise;
      const obs = cyc(k - (o.lag || 0)) * (o.ampl || 1) + (1 - (o.ampl || 1)) * 20 + dayNoise + (o.off || 0) + 0.4 * g(); const fc = truth + 0.6 * g();
      const orh = 50 + 10 * Math.cos(2 * Math.PI * (k - 4) / 24) + (o.rh || 0) + 2 * g(), frh = 50 + 10 * Math.cos(2 * Math.PI * (k - 4) / 24) + 3 * g();
      rec.obsT[k] = o.frozen && day === DAYS[3] ? 12 : obs; rec.fcT[k] = fc; rec.obsRH[k] = orh; rec.fcRH[k] = frh;
      rec.T[0] += fc - rec.obsT[k]; rec.T[1]++; rec.Tabs += Math.abs(fc - rec.obsT[k]); rec.RH[0] += frh - orh; rec.RH[1]++; rec.RHabs += Math.abs(frh - orh); }
    rec.obsTN = Math.min(...rec.obsT); rec.obsTX = Math.max(...rec.obsT); rec.dtr = rec.obsTX - rec.obsTN; rec.frozenT = rec.dtr === 0; rec.TN = Math.min(...rec.fcT) - rec.obsTN; rec.TX = Math.max(...rec.fcT) - rec.obsTX;
    st.days.set(day, rec); }
  return st; }
const SE = new Map(); const add = (s) => SE.set(s.pid, s);
let i = 0; for (const r of [0, 1, 2]) for (const c of [0, 1, 2, 3]) { const pid = ['synop:', 'metar:', 'mach:', 'mach:'][c] + 's' + (i++); add(station(pid, pid.split(':')[0], 34 + r * 0.1, 72 + c * 0.1, pid.startsWith('mach:') ? { rh: 8 } : {})); }
add(station('aws:Warisabad_like_ARG_1', 'aws', 34.05, 72.05, { off: 2.6 }));
add(station('aws:small_offset', 'aws', 34.15, 72.25, { off: 0.5 }));
add(station('aws:clock_3h', 'aws', 34.12, 72.12, { lag: 3 }));
add(station('aws:phase_1h', 'aws', 34.18, 72.18, { lag: 1 }));
add(station('aws:shielded', 'aws', 34.08, 72.28, { ampl: 0.3 }));
add(station('aws:frozen', 'aws', 34.02, 72.32, { frozen: true }));
const iso = D.isolationTest(SE, 'T'); const cand = iso.rows.filter((r) => r.candidate).map((r) => r.st.pid); const w = iso.rows.find((r) => r.st.pid === 'aws:Warisabad_like_ARG_1');
ok(cand.includes('aws:Warisabad_like_ARG_1') && w && w.nb.v < -2 && w.nb.ci[1] < 0 && w.zn.ci[1] < 0, 'Q1 the persistent, isolated -2.6 C station is a candidate (against neighbours and zone, 95 % intervals)', JSON.stringify({ nb: w && w.nb.v, ci: w && w.nb.ci, zn: w && w.zn.v }));
ok(!cand.includes('aws:small_offset') && !cand.some((p) => /^(synop|metar|mach):/.test(p)), 'Q1 a -0.5 C offset (inside the zone\'s own error) and the ordinary stations are not candidates', cand.join(', '));
const NH = D.networkHumidity(SE, ['mach']); const m = NH.mach.day.diff;
ok(m && m.v < -6 && m.v > -10 && m.ci[1] < 0, 'Q2 MACH hygrometers: 8 points more humid than the synoptic and airport stations under the same forecast', JSON.stringify(m));
const LG = D.lagTest(SE); const c3 = LG.rows.find((r) => r.st.pid === 'aws:clock_3h'), c1 = LG.rows.find((r) => r.st.pid === 'aws:phase_1h');
ok(c3 && c3.candidate && c3.lag === 3, 'Q3 a 3 h time-stamp offset is found in at least 95 % of day resamples', JSON.stringify(c3 && { lag: c3.lag, stable: c3.stable }));
ok(c1 && !c1.candidate && c1.phaseOnly, 'Q3 a 1 h phase difference is listed, never a candidate', JSON.stringify(c1 && { lag: c1.lag, candidate: c1.candidate }));
const DT = D.dtrTest(SE); ok(DT.rows.some((r) => r.st.pid === 'aws:shielded' && r.candidate) && DT.rows.filter((r) => r.candidate).length === 1, 'Q4 a diurnal range at 30 % of the neighbours\' is a shielded-sensor candidate (and only it)', JSON.stringify(DT.rows.filter((r) => r.candidate).map((r) => r.st.pid)));
ok(SE.get('aws:frozen').days.get(DAYS[3]).frozenT === true, 'Q4 a day with one temperature all day is frozen');
const L = D.leaveOneOut(SE, 'T', 'hills', 'all');
ok(L && L.top && L.top.pid === 'aws:Warisabad_like_ARG_1', 'Q5 leave-one-station-out names the station that moves the cell most', JSON.stringify(L && { all: L.all.v, top: L.top.pid, without: L.top.without.v, drives: L.top.drives }));
const S = src('scripts/agents/diagnose.mjs');
ok(S && !/writeJsonAtomic\([^)]*nonrepresentative/.test(S) && !/station-holds\.json['"]?\s*\)\s*,\s*[^)]*write/.test(S) && !/writeFileSync|appendFileSync/.test(S.replace(/import[^;]+;/g, '')) && /never acts|changes nothing/.test(S), 'Q6 the agent writes only its own diagnosis (writeJsonAtomic under data/agents/diagnose); never the non-representative list or the holds');
done('D2-STATIONS');
