/* v91.17.283.31 · owner 9.5 · the rain channel of 7 MACH stations held, every other variable kept, one register the owner clears.
   node scripts/tests28331/rainholds.unit.test.mjs */
import { mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { tmpdir } from 'node:os'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let n = 0, f = 0; const ok = (c, m, i) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c || i === undefined ? '' : '  :: ' + JSON.stringify(i).slice(0, 300))); if (!c) f++; };
const RH = await import(pathToFileURL(join(API, 'rainholds.mjs')).href), QC = await import(pathToFileURL(join(API, 'obsqc.mjs')).href);
const SEVEN = ['al_jazari', 'khaplu', 'yarhussain_weath', 'palosa_avenue', 'gsit', 'gw1100c_wifi547f', 'AKZSFWS'];
const H = RH.machRainHolds(join(ROOT, 'data')); ok(SEVEN.every((k) => H.held.has(k)) && H.held.size === 7, 'the register holds exactly the 7 stations', [...H.held.keys()]);
const P = QC.loadParams(join(ROOT, 'data'));
const r = { ms: Date.now(), T: 20, RH: 50, W: 5, PR: 3.2 }; QC.markCheck('mach:khaplu', r, P);
ok(r.f && r.f.PR && r.f.PR.test === 'owner-mark' && !r.f.T && !r.f.RH && !r.f.W, 'khaplu: the rain value fails (owner mark), temperature, humidity and wind stay', r.f);
const r2 = { ms: Date.now(), T: 20, PR: 3.2 }; QC.markCheck('mach:some_other', r2, P); ok(!r2.f, 'another station keeps its rain');
const TD = mkdtempSync(join(tmpdir(), 'rh31_'));
try { const J = JSON.parse(readFileSync(join(ROOT, 'data', 'mach-rain-holds.json'), 'utf8')); J.holds.find((h) => h.key === 'gsit').cleared = '2026-11-02 gauge replaced';
  writeFileSync(join(TD, 'mach-rain-holds.json'), JSON.stringify(J)); const H2 = RH.machRainHolds(TD); ok(!H2.held.has('gsit') && H2.held.size === 6, 'the owner clears one gauge by setting "cleared": no code change'); }
finally { rmSync(TD, { recursive: true, force: true }); }
const V = await import(pathToFileURL(join(ROOT, 'scripts', 'agents', 'verify.mjs')).href).catch((e) => ({ err: e }));
if (V.rainTruthTable) { const st = [{ pid: 'mach:khaplu', net: 'mach', lat: 35.1, lon: 76.3 }, { pid: 'mach:x1', net: 'mach', lat: 33, lon: 73 }];
  const byPid = new Map(st.map((s) => [s.pid, []])); let threw = null; let out = null; try { out = V.rainTruthTable(st, byPid, ['2026-10-28'], { stuck: {}, isolation: {}, flip: {}, counter: {} }); } catch (e) { threw = e; }
  ok(!threw, 'verification rain truth runs with the holds', threw && threw.message); }
else ok(/machRainHolds\(\)/.test(readFileSync(join(ROOT, 'scripts', 'agents', 'verify.mjs'), 'utf8')), 'verification rain truth skips a held gauge (wiring)');
const FS = readFileSync(join(API, 'fleet.mjs'), 'utf8'); ok(/RHOLD\.has\(r\.key\)\) \{ r\.rainHeld = .*r\.precipRateMm = null; r\.precipTotalMm = null;/.test(FS), 'the fleet readings serve no rain for a held gauge (other variables kept)');
console.log(`\n${n - f} pass, ${f} fail`); process.exit(f ? 1 : 0);
