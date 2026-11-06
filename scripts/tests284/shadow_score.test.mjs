/* v91.17.284 · shadow scorer (D:\NIGRAAN\_admin\shadow\shadow_score.mjs) on synthetic runs and synoptic reports.
     C1  fair CRPS equals the brute-force formula
     C2  held-out split: 20 of 55 stations, co-located stations (41780 Jinnah Intl / OPKC) on the same side
     C3  AIFS with half the IFS error over 70 days: T lead 1-3 ELIGIBLE on held-out stations; an AI equal to IFS: no CI-separated improvement
     C4  40 days only: insufficient (the 60-day rule)
     C5  only lead days 1-3 (Pakistan days) are scored; TX/TN once per station day and run, with all four synoptic hours
   usage: node scripts/tests284/shadow_score.test.mjs --scorer <path to shadow_score.mjs> */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { existsSync as _ex } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d != null ? ' :: ' + String(d).slice(0, 400) : '')); } };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/* v283.10 integration: with no --scorer argument the script is looked up where it lives: the cloud tree's _admin\shadow, else the laptop's
   D:\NIGRAAN\_admin\shadow (two folders above nigraan-local); not found = SKIP (exit 77) */
const _pick = (flag, name) => { const a = process.argv.slice(2), i = a.indexOf(flag); if (i >= 0 && a[i + 1]) return a[i + 1];
  for (const p of [join(ROOT, '_admin', 'shadow', name), join(ROOT, '..', '..', '_admin', 'shadow', name)]) if (_ex(p)) return p;
  console.log('SKIP ' + name + ' not found (pass ' + flag + ' <path>)'); process.exit(77); };
const SC = await import(pathToFileURL(_pick('--scorer', 'shadow_score.mjs')).href);
const ST = JSON.parse(readFileSync(join(ROOT, 'data', 'synop-stations.json'), 'utf8')).stations;
const stations = Object.entries(ST).map(([id, m]) => ({ id, lat: m.lat, lon: m.lon }));
let s = 12345; const R = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; const N = () => Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R());
/* C1 */
{ const xs = [1, 3, 4, 8], y = 2.5; let a1 = 0, a2 = 0; for (const x of xs) a1 += Math.abs(x - y); for (const x of xs) for (const z of xs) a2 += Math.abs(x - z); const bf = a1 / 4 - a2 / (2 * 4 * 3);
  ok(Math.abs(SC.crpsFair(xs, y) - bf) < 1e-12, 'C1 fair CRPS', SC.crpsFair(xs, y) + ' vs ' + bf); }
/* C2 */
const held = SC.heldOutSet(stations);
ok(held.size === 20 && held.has('41780') === held.has('OPKC') && held.has('41675') === held.has('OPMT'), 'C2 held-out 20 of 55, clusters kept together', held.size);
function build(nDays, aiSd, ifsSd) {
  const D = mkdtempSync(join(tmpdir(), 'agn-sc-')); const runs = join(D, 'runs'), lake = join(D, 'lake'); mkdirSync(join(lake, 'archive', 'synop'), { recursive: true });
  const obs = new Map(); const lines = new Map();
  const oAt = (sid, ms) => { const k = sid + '|' + ms; if (!obs.has(k)) { const o = { T: 20 + 8 * Math.sin(ms / 864e5 * 2 * Math.PI) + N(), W: 3 + Math.abs(N()), P6: Math.max(0, N()) };
    obs.set(k, o); const m = new Date(ms).toISOString().slice(0, 7); (lines.get(m) || lines.set(m, []).get(m)).push(JSON.stringify({ sid, t: new Date(ms).toISOString().slice(0, 16) + ':00Z', t_c: Math.round(o.T * 10) / 10, wspd: Math.round(o.W * 10) / 10, rain_mm: Math.round(o.P6 * 10) / 10, rain_h: 6 })); }
    const o = obs.get(k); return { T: Math.round(o.T * 10) / 10, W: Math.round(o.W * 10) / 10, P6: Math.round(o.P6 * 10) / 10 }; };
  for (let d = 0; d < nDays; d++) for (const h of [0, 12]) {
    const init = Date.UTC(2026, 10, 1) + d * 864e5 + h * 3600e3; const tag = new Date(init).toISOString().slice(0, 13).replace(/[-T]/g, '');
    const steps = Array.from({ length: 16 }, (_, k) => init + (k + 1) * 6 * 3600e3);
    const mk = (model, sd, ens) => { const E = new Map(); const ee = (id, t) => { const k = id + '|' + t; if (!E.has(k)) E.set(k, sd * N()); return E.get(k); }; return ({ model, kind: ens ? 'ensemble' : 'forecast', run: new Date(init).toISOString().slice(0, 16) + 'Z', steps: steps.map((t) => new Date(t).toISOString().slice(0, 16) + 'Z'),
      stations: stations.map((x) => ({ id: x.id })), members: ens ? Array.from({ length: 8 }, (_, i) => 'm' + i) : null,
      T: stations.map((x) => ens ? Array.from({ length: 8 }, () => steps.map((t) => oAt(x.id, t).T + ee(x.id + 'T', t) + 0.3 * N())) : steps.map((t) => oAt(x.id, t).T + sd * N())),
      W: stations.map((x) => ens ? Array.from({ length: 8 }, () => steps.map((t) => oAt(x.id, t).W + ee(x.id + 'W', t) + 0.3 * N())) : steps.map((t) => oAt(x.id, t).W + sd * N())),
      P6: stations.map((x) => ens ? Array.from({ length: 8 }, () => steps.map((t) => Math.max(0, oAt(x.id, t).P6 + sd * N()))) : steps.map((t) => Math.max(0, oAt(x.id, t).P6 + sd * N()))) }); };
    mkdirSync(join(runs, tag), { recursive: true });
    for (const [m, sd, e] of [['ecmwf_ifs', ifsSd, false], ['ecmwf_aifs025_single', aiSd, false], ['google_weathernext2_ensemble', ifsSd, true]]) writeFileSync(join(runs, tag, m + '.json'), JSON.stringify(mk(m, sd, e)));
  }
  for (const [m, ls] of lines) writeFileSync(join(lake, 'archive', 'synop', 'synop_' + m + '.jsonl'), ls.join('\n') + '\n');
  return { D, runs, lake, months: [...lines.keys()] };
}
const cell = (res, model, v, L) => (res.cells[model] || []).find((c) => c.set === 'heldOut' && c.var === v && c.lead === L);
{ const X = build(70, 1, 2); const res = SC.score({ runsDir: X.runs, truth: SC.loadTruth(X.lake, X.months), heldOut: held, B: 500, Bd: 4000 });
  const t = [1, 2, 3].map((L) => cell(res, 'ecmwf_aifs025_single', 'T', L));
  ok(t.every((c) => c && /^ELIGIBLE/.test(c.verdict) && c.days >= 60), 'C3 AIFS half the IFS error: T lead 1-3 eligible', JSON.stringify(t.map((c) => c && [c.days, c.dMae, c.decisionCi, c.verdict])));
  const w = cell(res, 'google_weathernext2_ensemble', 'T', 1); ok(w && /no CI-separated/.test(w.verdict) && w.crps != null, 'C3 an ensemble with the IFS error: no CI-separated improvement; CRPS reported', JSON.stringify(w && [w.dMae, w.decisionCi, w.crps, w.verdict]));
  const tx = cell(res, 'ecmwf_aifs025_single', 'TX', 1); ok(tx && tx.cases > 0 && tx.cases <= 2 * 20 * 70, 'C5 TX formed once per station day with all four hours', tx && tx.cases);
  const l0 = (res.cells.ecmwf_aifs025_single || []).filter((c) => c.lead === 0 || c.lead > 3); ok(!l0.length, 'C5 only lead days 1-3 scored');
  rmSync(X.D, { recursive: true, force: true }); }
{ const X = build(40, 1, 2); const res = SC.score({ runsDir: X.runs, truth: SC.loadTruth(X.lake, X.months), heldOut: held, B: 300, Bd: 1000 });
  const c = cell(res, 'ecmwf_aifs025_single', 'T', 1); ok(c && /^insufficient/.test(c.verdict), 'C4 40 days: insufficient', c && c.verdict); rmSync(X.D, { recursive: true, force: true }); }
console.log(`\nshadow scorer: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
