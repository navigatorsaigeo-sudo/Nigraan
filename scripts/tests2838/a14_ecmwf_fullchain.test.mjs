// audit 14 · the ECMWF 9 km promotion is scored on the FULL served chain: the 9 km values substituted where serving substitutes them,
// then the existing corrections (fleet.mjs writes c_<var>_served_e beside c_<var>_served), against the value served now; and the
// 25 Oct rule adds stratification: no zone and no lead bucket may be worse.
//  E1 a raw 9 km value that beats the served value does NOT pass when the chain with it substituted is worse (v283.7: it passed)
//  E2 the chain better overall but worse in one zone: no pass ("worse in zone ...")
//  E3 the chain better overall and in every zone and lead: pass
//  E4 serving and the shadow share one substitution (ecmwf010.substituteLoc); the fleet runs the same chain on the substituted copy
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { TREE, src, ok, done } from './lib.mjs';
const py = process.env.NIGRAAN_PYTHON || 'python3';
function run(chainErr) {   /* chainErr(zone) -> the candidate chain's error; served error 1.0 everywhere; raw 9 km error 0.2 everywhere */
  const T = mkdtempSync(join(tmpdir(), 'e10-')), sh = join(T, 'shadow', '2026-10'), ob = join(T, 'obs'); mkdirSync(sh, { recursive: true }); mkdirSync(ob, { recursive: true }); mkdirSync(join(T, 'app', 'data'), { recursive: true });
  const head = 'shadow_utc,run_utc,valid_utc,lead_h,interval_h,key,zone,excluded,lat,lon,point_elev_m,model_elev_m,e_t2m,e_t2m_raw,e_d2m,e_wind_kmh,e_gust_kmh,e_tp_mm,c_at_utc,c_lead_h,c_t2m_start,c_t2m_served,c_d2m,c_wind_kmh,c_tp_mm,c_tp_hours,c_t2m_served_e,c_d2m_served,c_d2m_served_e,c_wind_served,c_wind_served_e,c_e_substituted';
  const obs = {}; const runs = ['2026-10-10T00Z', '2026-10-11T00Z', '2026-10-12T00Z'];
  for (const run of runs) { const lines = [head]; const d0 = Date.parse(run.replace('Z', ':00Z'));
    for (let s = 0; s < 8; s++) { const zone = s < 4 ? 'plains' : 'mountain', key = 'st' + s;
      for (const lead of [6, 12, 18, 30, 36, 42, 54, 60, 66]) { const v = new Date(d0 + lead * 3600e3), vt = v.toISOString().slice(0, 16) + 'Z', o = 20 + s;
        (obs[vt.slice(0, 10)] ||= []).push([key, v.toISOString(), o]);
        lines.push([run, run, vt, lead, 6, key, zone, 0, 30, 70, '', '', o + 0.2, o + 0.2, '', '', '', '', run, lead, o + 1, o + 1, '', '', '', '', o + chainErr(zone, lead), '', '', '', '', 1].join(',')); } }
    writeFileSync(join(sh, run.replace(/[-:TZ]/g, '').slice(0, 10) + '.csv'), lines.join('\n') + '\n'); }
  for (const [d, rows] of Object.entries(obs)) writeFileSync(join(ob, 'obs_' + d.replace(/-/g, '') + '.csv'), 'stationKey,time,temperatureC,dewPointC,windSpeedKmh,precipTotalMm\n' + rows.map((r) => r[0] + ',' + r[1] + ',' + r[2] + ',,,').join('\n') + '\n');
  const out = join(T, 'score.json'); const r = spawnSync(py, [join(TREE, 'scripts', 'ecmwf', 'score_shadow.py'), '--app', join(T, 'app'), '--shadow', join(T, 'shadow'), '--obs', ob, '--out', out, '--min-pairs', '50', '--min-stratum', '20'], { encoding: 'utf8' });
  let j = null; try { j = JSON.parse(readFileSync(out, 'utf8')); } catch (_) {} rmSync(T, { recursive: true, force: true }); return { j, err: r.stderr };
}
const E1 = run(() => 1.5), E2 = run((z) => (z === 'mountain' ? 1.2 : 0.3)), E3 = run(() => 0.4);
const t = (R) => R.j && R.j.decision && R.j.decision.t2m;
ok(t(E1) && t(E1).pass === false && /full chain with ecmwf010 MAE 1\.500 > served MAE 1\.000/.test(t(E1).why), 'E1 raw 9 km better (0.2 vs 1.0) but the chain with it worse (1.5): no pass', JSON.stringify(t(E1) || E1.err).slice(0, 300));
ok(t(E2) && t(E2).pass === false && /worse in zone mountain/.test(t(E2).why), 'E2 better overall, worse in the mountains: no pass', JSON.stringify(t(E2) || E2.err).slice(0, 300));
ok(t(E3) && t(E3).pass === true && t(E3).strata && Object.keys(t(E3).strata).some((k) => /^lead /.test(k)), 'E3 better overall and in every zone and lead: pass, with the strata listed', JSON.stringify(t(E3) || E3.err).slice(0, 300));
ok(E3.j && /25 Oct 2026 rule/.test(E3.j.rule || '') && E3.j.decision.tp && E3.j.decision.tp.pass === false, 'the rule text is the 25 Oct full-chain rule; rain never passes (no full-chain column)');
const EC = src('server/api/ecmwf010.mjs'), FL = src('server/api/fleet.mjs');
ok(/function substituteLoc\(/.test(EC) && /substituteLoc\(loc, want, wf, now\)/.test(EC) && /E10\.substituteLoc\(rawE, /.test(FL) && /servedChainAsync\(sv, st\.lat, st\.lon/.test(FL) && /c_t2m_served_e/.test(EC),
  'E4 serving and the shadow share substituteLoc; the fleet runs the same chain on the substituted copy; the shadow writes c_t2m_served_e');
done('A14-ECMWF-FULLCHAIN');
