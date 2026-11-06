import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.277 · MTN · mountain stations (Khaplu, Gilgit, Skardu, Chilas): the one change is a registry exclusion of MACH 106 (khaplu,
   indoor or enclosed sensor). Checks: the record, that the live screen / live layer / accuracy monitor honour it, the height used at
   the mountain MACH sites, and (when the upload copies are present) the measured evidence re-computed from the data.
   usage: node scripts/tests277mtn/mtn.test.mjs [LAMHA MACH db folder] [synop-recent.json]   (temporary data folder; starts no server) */
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARGS = process.argv.slice(2).filter((a) => !/^https?:\/\//.test(a));   /* a server address (the suite runner passes one) is not a folder */
const DB = ARGS[0] || __T.uploads('LAMHA/data/mach/db');
const SY = ARGS[1] || __T.uploads('NIGRAAN/nig/nigraan-local/data/cache/synop-recent.json');
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d != null ? ' · ' + String(d).slice(0, 300) : '')); };
const REG = JSON.parse(readFileSync(join(ROOT, 'data', 'mach-fleet-stations.json'), 'utf8')); const S = Object.fromEntries(REG.stations.map((s) => [s.key, s]));

/* 1 · the record */
const X = S.khaplu && (S.khaplu.exclude || S.khaplu.excludeWithdrawn);   /* v91.17.278 · FIX278 5: the exclusion is withdrawn (kept with its evidence); the outdoor-array screen holds the console state out */
ok(X && X.kind === 'indoor' && /indoor or enclosed/.test(X.why) && /6-16 Oct 2026/.test(X.evidence) && /2026-10-17/.test(X.decided), 'M1 khaplu (MACH 106): the v91.17.277 indoor exclusion is kept on record with window and date' + (S.khaplu.exclude ? '' : ' and marked withdrawn (v91.17.278: power-supply fault, outdoor-array screen)'), X && X.why);
ok(S.khaplu.no === 106 && S.khaplu.lat === 35.171 && S.khaplu.lon === 76.324, 'M1 position and number unchanged');
ok(['gilgit', 'danyore', 'Talg'].every((k) => S[k] && !S[k].exclude), 'M1 MACH 105, 107, 108 kept (Gilgit rooftop: a stable offset the live layer removes against the Gilgit synoptic station)');
ok(REG.stations.filter((s) => s.identity || s.qcHistory || s.excludeWithdrawn).length === 16 && !REG.stations.some((s) => s.exclude) && /v91\.17\.277 MTN/.test(REG.source), 'M1 16 former exclusions on record (v91.17.283.14: identity records and history; none excludes a station)');
ok(!/\bPMD\b|\bFFD\b|\bMAE\b|Brier|skill/i.test(JSON.stringify(S.khaplu)), 'M1 record text is client-safe');

/* 2 · the live screen and its client note */
const tmp = mkdtempSync(join(tmpdir(), 'v277-mtn-')); const dataDir = join(tmp, 'data'); mkdirSync(dataDir);
{ const R0 = JSON.parse(readFileSync(join(ROOT, 'data', 'mach-fleet-stations.json'), 'utf8')); for (const s of R0.stations) if (s.key === 'khaplu' && !s.exclude && s.excludeWithdrawn) { const { withdrawn, ...ex } = s.excludeWithdrawn; s.exclude = ex; }   /* v91.17.278: the exclusion mechanism, on the recorded Khaplu exclusion */
  writeFileSync(join(dataDir, 'mach-fleet-stations.json'), JSON.stringify(R0)); }
const RULE = JSON.parse(readFileSync(join(ROOT, 'data', 'mach-siting.json'), 'utf8')).rule;
writeFileSync(join(dataDir, 'mach-siting.json'), JSON.stringify({ rule: RULE, stations: {} }));
writeFileSync(join(dataDir, 'mach-running-bias.json'), JSON.stringify({ version: 'test', stations: {} }));
const { createFleet } = await import(join(ROOT, 'server/api/fleet.mjs'));
const F = createFleet({}, tmp, dataDir);
/* v91.17.283.14 · owner decision 24 Oct 2026: no station is excluded; Khaplu's values are judged one by one by obsqc.mjs */
ok(F.excluded === undefined && F.screen('khaplu').verdict !== 'excluded', 'M2 no station exclusion (Khaplu is judged value by value)', JSON.stringify(F.screen('khaplu')).slice(0, 160));
const fsrc = readFileSync(join(ROOT, 'server/api/fleet.mjs'), 'utf8'), asrc = readFileSync(join(ROOT, 'server/api/accmon.mjs'), 'utf8');
ok(!/EXCL\.has/.test(fsrc) && !/app\.fleet\.excluded/.test(asrc) && /QC\.qcCross/.test(asrc), 'M3 the live MACH layer and the accuracy monitor take values that pass obsqc.mjs (no station list)');
rmSync(tmp, { recursive: true, force: true });

/* 4 · heights: registry/provider height at the mountain MACH sites agrees with the 30 m terrain (no wrong elevation in the chain) */
const { createPointHeight } = await import(join(ROOT, 'server/api/pointheight.mjs'));
const PH = createPointHeight(join(ROOT, 'data'));
const PROV = { gilgit: 1496, danyore: 1543, khaplu: 2471 };   /* model_elev_m of the fleet pairs (provider height), 14-15 Oct 2026 */
for (const [k, e] of Object.entries(PROV)) { const h = PH.heightAt(S[k].lat, S[k].lon); ok(h && h.ok && Math.abs(h.elevM - e) <= 10, 'M4 ' + k + ': provider height ' + e + ' m vs 30 m terrain ' + (h && h.elevM) + ' m (within 10 m)'); }

/* 5 · the evidence, re-computed from the copies (skipped when absent) */
if (existsSync(DB) && existsSync(SY)) {
  const rows = new Map();   /* key -> [[ms, T, Td]] */
  for (const f of readdirSync(DB).filter((f) => /^obs_202610\d\d\.csv$/.test(f)).sort()) {
    const L = readFileSync(join(DB, f), 'utf8').split('\n'); const hd = L[0].split(','); const ik = hd.indexOf('stationKey'), it = hd.indexOf('time'), iT = hd.indexOf('temperatureC'), iD = hd.indexOf('dewPointC');
    for (let i = 1; i < L.length; i++) { const c = L[i].split(','); if (!['khaplu', 'gilgit', 'danyore'].includes(c[ik])) continue; const t = Date.parse(c[it]), T = parseFloat(c[iT]);
      if (Number.isFinite(t) && Number.isFinite(T)) (rows.get(c[ik]) || rows.set(c[ik], []).get(c[ik])).push([t, T, parseFloat(c[iD])]); } }
  const SYN = JSON.parse(readFileSync(SY, 'utf8'));
  const day = (ms) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 10);
  const vsSynop = (k, sid) => { const R = rows.get(k) || [], out = new Map();
    for (const [iso, v] of Object.entries(SYN[sid] || {})) { const t = Date.parse(iso); const w = R.filter((r) => Math.abs(r[0] - t) <= 1800e3); if (!w.length || !Number.isFinite(v.o)) continue;
      const m = w.reduce((s, r) => s + r[1], 0) / w.length; const d = day(t); (out.get(d) || out.set(d, []).get(d)).push([v.o, m]); }
    const ratio = [], mean = []; for (const [d, a] of [...out.entries()].sort()) { if (a.length < 6) continue; const so = a.map((x) => x[0]), mo = a.map((x) => x[1]);
      const sr = Math.max(...so) - Math.min(...so); if (sr > 0) ratio.push((Math.max(...mo) - Math.min(...mo)) / sr); mean.push([so.reduce((s, x) => s + x, 0) / so.length, mo.reduce((s, x) => s + x, 0) / mo.length]); }
    return { ratio, mean }; };
  const med = (a) => { const q = a.slice().sort((x, y) => x - y); return q.length ? (q.length % 2 ? q[q.length >> 1] : (q[q.length / 2 - 1] + q[q.length / 2]) / 2) : null; };
  const slope = (y) => { const n = y.length, xm = (n - 1) / 2, ym = y.reduce((s, v) => s + v, 0) / n; let a = 0, b = 0; y.forEach((v, i) => { a += (i - xm) * (v - ym); b += (i - xm) ** 2; }); return a / b; };
  const K = vsSynop('khaplu', '41517'), G = vsSynop('gilgit', '41516'), D = vsSynop('danyore', '41516');
  ok(K.ratio.length >= 6 && Math.max(...K.ratio) < Math.min(...G.ratio, ...D.ratio), 'M5 khaplu daily range / Skardu synop range (' + K.ratio.map((x) => x.toFixed(2)).join(' ') + ') below every MACH 105 / 108 day against Gilgit synop (min ' + Math.min(...G.ratio, ...D.ratio).toFixed(2) + ')');
  const ks = slope(K.mean.map((x) => x[1])), ss = slope(K.mean.map((x) => x[0]));
  ok(ss < -0.3 && Math.abs(ks) < 0.2, 'M5 Skardu cools ' + ss.toFixed(2) + ' C a day over the window, khaplu ' + ks.toFixed(2) + ' (no seasonal cooling)');
  ok(med(G.ratio) > 0.5 && med(D.ratio) > 0.5, 'M5 the comparison itself is sound: MACH 105 / 108 track the Gilgit synop daily range (median ' + med(G.ratio).toFixed(2) + ' / ' + med(D.ratio).toFixed(2) + ')');
} else console.log('SKIP M5 (no LAMHA db / synop copy at ' + DB + ', ' + SY + ')');

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
