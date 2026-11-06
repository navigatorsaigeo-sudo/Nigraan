// full flag history under the old rule (no noise margin) and the v277 rule, both from the same recomputed windows (laptop accmon record)
import { readFileSync } from 'node:fs';
const APP = process.argv[2], ACCDIR = process.argv[3];
const { createAccMon, loadCities } = await import(APP + '/server/api/accmon.mjs');
const { createMos } = await import(APP + '/server/api/mos.mjs');
const DATA = APP + '/data'; const mos = createMos({ dataDir: DATA, log: () => {} }); const H = 3600e3;
const CIT = loadCities(DATA); const km = (a, b, c, d) => { const p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const acc = createAccMon({ mos }, APP, DATA, { noSchedule: true, noLoad: true, noWrite: true, cities: CIT, now: () => Date.parse('2026-10-17T08:00:00Z') });
const P = acc._pairs, S = acc._snap, M = acc._meta; const Bfile = new Map();
for (const f of ['2026-09.jsonl', '2026-10.jsonl']) for (const l of readFileSync(ACCDIR + '/' + f, 'utf8').split('\n')) { if (!l) continue; const j = JSON.parse(l);
  if (j.ty === 'm') M.set(j.id, { name: j.name, lat: j.lat, lon: j.lon, kind: j.kind, zone: j.zone, cities: CIT.filter((c) => km(j.lat, j.lon, c.lat, c.lon) <= 40).map((c) => c.name) });
  else if (j.ty === 'h') { const ms = Date.parse(j.t); const X = P.get(ms) || P.set(ms, new Map()).get(ms); for (const [id, o, s] of j.p) if (!X.has(id)) X.set(id, [o / 10, s / 10]); }
  else if (j.ty === 's') S.set(Date.parse(j.t), j.c); else if (j.ty === 'b') Bfile.set(Date.parse(j.t), j.c); }
/* the hourly record recomputed from the pairs (with the sd the v277 records carry); SO = the same without sd (the old rule) */
const SO = new Map(); { const hs = [...P.keys()].sort((a, b) => a - b); S.clear();
  for (let hk = hs[0]; hk <= hs.at(-1); hk += H) { const w = acc.windowStats(hk + H - 1, 24); const c = {}, c3 = {}; for (const [k, v] of Object.entries(w.city)) if (v.n >= 6) { c[k] = [v.mae, v.bias, v.n, v.sdAbs, v.sdE]; c3[k] = c[k].slice(0, 3); } S.set(hk, c); SO.set(hk, c3); } }
const strip = (w) => ({ city: Object.fromEntries(Object.entries(w.city).map(([k, v]) => [k, { ...v, sdAbs: null, sdE: null }])) });
const res = { old24: [], new24: [], oldB: [], newB: [], judged24: 0, judgedB: 0 };
const hrs = [...S.keys()].sort((a, b) => a - b);
for (const hk of hrs) { const t = hk + H - 1; const w = acc.windowStats(t, 24); res.judged24 += Object.values(w.city).filter((v) => v.n >= 6).length;
  for (const f of acc.flagsAt(t, strip(w), SO)) res.old24.push({ t: new Date(hk).toISOString().slice(0, 13), city: f.city, mae: f.mae, bias: f.bias, n: f.n });
  for (const f of acc.flagsAt(t, w)) res.new24.push({ t: new Date(hk).toISOString().slice(0, 13), city: f.city, mae: f.mae, bias: f.bias, n: f.n, why: f.why, noise: f.noise }); }
/* blocks: recompute every block from the pairs (with sd), judge with and without the margin against the same block record */
const BN = new Map(), BO = new Map(); const bks = [...Bfile.keys()].sort((a, b) => a - b);
for (const bs of bks) { acc.bsnapshot(bs, P, BN); BO.set(bs, Object.fromEntries(Object.entries(BN.get(bs)).map(([k, v]) => [k, v.slice(0, 3)]))); }
for (const bs of bks) { res.judgedB += Object.keys(BN.get(bs)).length;
  for (const f of acc.blockFlags(bs, BO)) res.oldB.push({ t: new Date(bs).toISOString().slice(0, 13), city: f.city, block: f.block, mae: f.mae, bias: f.bias, n: f.n });
  for (const f of acc.blockFlags(bs, BN)) res.newB.push({ t: new Date(bs).toISOString().slice(0, 13), city: f.city, block: f.block, mae: f.mae, bias: f.bias, n: f.n, why: f.why }); }
res.hours = hrs.length; res.blocks = bks.length;
process.stdout.write(JSON.stringify(res));
