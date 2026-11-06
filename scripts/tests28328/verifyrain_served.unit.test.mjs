/* v91.17.283.28 . THE RAIN-TRUTH FIX CHANGES NO SERVED VALUE (verification only), offline:
     S1  the one shared file it touches, data/obs-qc-params.json, gains a "rain" section only: the value-level quality control every served
         module runs (server/api/obsqc.mjs qcBatch / seriesRows / readingQc) gives identical flags and counts with and without that section
         on a synthetic set (gross, step, persistence, internal and buddy failures in it), and its version is unchanged
     S2  no served module reads the section or imports the verification agent: no server/ file names P.rain / rainTruth / RAIN_TRUTH, and none
         imports scripts/agents/verify.mjs (the server runs it as a child process, agents.mjs)
     S3  verify.mjs writes only under data/agents/verify (ledger, summary, client-lines, drift, ews-anchor-promotion) and the agent log
   usage: node scripts/tests28328/verifyrain_served.unit.test.mjs */
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 600) : '')); } };
const Q = await import(pathToFileURL(join(API, 'obsqc.mjs')).href);

/* S1 */
{ const full = JSON.parse(readFileSync(join(ROOT, 'data', 'obs-qc-params.json'), 'utf8')); const without = { ...full }; delete without.rain;
  const A = mkdtempSync(join(tmpdir(), 'vr-a-')), B = mkdtempSync(join(tmpdir(), 'vr-b-'));
  writeFileSync(join(A, 'obs-qc-params.json'), JSON.stringify(full)); writeFileSync(join(B, 'obs-qc-params.json'), JSON.stringify(without));
  for (const f of ['fleet-range-screen.json', 'obs-qc-marks.json']) if (existsSync(join(ROOT, 'data', f))) { copyFileSync(join(ROOT, 'data', f), join(A, f)); copyFileSync(join(ROOT, 'data', f), join(B, f)); }
  const PA = Q.loadParams(A), PB = Q.loadParams(B); const pa = { ...PA }; delete pa.rain;
  ok(JSON.stringify(pa) === JSON.stringify(PB) && PA.version === PB.version && PA.rain && !PB.rain, 'S1a the parameters the QC reads are identical apart from the added "rain" section (version ' + PA.version + ')');
  const t0 = Date.parse('2026-10-14T00:00:00Z'); const st = []; const mk = () => { const rows = new Map(); let s = 1;
    for (let i = 0; i < 6; i++) { const pid = 'mach:s' + i; if (!st.find((x) => x.pid === pid)) st.push({ pid, net: 'mach', lat: 31.5 + i * 0.03, lon: 74.3 + i * 0.03, elev: 210, zone: 'plains' }); const a = [];
      for (let h = 0; h < 24; h++) { s = (s * 16807) % 2147483647; const n = (s / 2147483647 - 0.5) * 0.6; a.push({ ms: t0 + h * 3600e3, T: 22 + 6 * Math.sin(h / 24 * 6.283) + n + (i === 3 && h === 12 ? 9 : 0), RH: i === 4 ? 1 : 60 - n * 10, Td: 14 + n, W: 8 + n, P: 990 + n, PT: h / 10, RR: 0 }); }
      rows.set(pid, a); } return rows; };
  const RA = mk(), RB = mk(); const ra = Q.qcBatch(st, RA, PA, { nearestMin: 15, bgAt: null }), rb = Q.qcBatch(st, RB, PB, { nearestMin: 15, bgAt: null });
  const flags = (R) => JSON.stringify([...R].map(([p, a]) => [p, a.map((r) => r.f || null)]));
  ok(flags(RA) === flags(RB) && JSON.stringify(ra.counts) === JSON.stringify(rb.counts) && /T|RH/.test(JSON.stringify(ra.counts.failed || ra.counts)), 'S1b qcBatch: identical flags and counts with and without the section (failures present in the set)', ra.counts);
  const sr = (P) => JSON.stringify([...Q.seriesRows([...RA.get('mach:s3')].map((r) => ({ ...r, id: 's3' })), (r) => r.id, (r) => ({ ms: r.ms, T: r.T }), () => ({ lat: 31.5, lon: 74.3, elev: 210, net: 'mach' }), P)]);
  ok(sr(PA) === sr(PB), 'S1c seriesRows: identical with and without the section'); }

/* S2 */
{ const files = readdirSync(API).filter((f) => /\.(mjs|js)$/.test(f)).map((f) => [f, readFileSync(join(API, f), 'utf8')]); const srv = readFileSync(join(ROOT, 'server', 'server.mjs'), 'utf8');
  const reads = files.filter(([, s]) => /\bP\.rain\b|QCP\.rain\b|rainTruth|RAIN_TRUTH|rain-truth-28328/.test(s)).map(([f]) => f);
  const imports = [...files, ['server.mjs', srv]].filter(([, s]) => /import[^;]*agents\/verify\.mjs|import\([^)]*agents\/verify\.mjs/.test(s)).map(([f]) => f);
  ok(!reads.length, 'S2a no served module reads the rain section or the rain-truth fields', reads);
  ok(!imports.length, 'S2b no served module imports scripts/agents/verify.mjs (it runs as a child process)', imports); }

/* S3 */
{ const src = readFileSync(join(ROOT, 'scripts', 'agents', 'verify.mjs'), 'utf8'); const w = [...src.matchAll(/writeJsonAtomic\((join\([^)]*\))/g)].map((m) => m[1].trim());
  ok(w.length >= 4 && w.every((x) => /^join\(dir, |^join\(dataDir, 'agents', 'verify'/.test(x)) && !/writeFileSync\(join\(o\.dataDir, '(?!agents)/.test(src), 'S3 verify.mjs writes only under data/agents/verify', w); }

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
