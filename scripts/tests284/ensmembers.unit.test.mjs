/* v91.17.284 · ENS member archive (server/api/ensmembers.mjs, hooked into outlook.mjs runEnsemble). No server, no provider: createOutlook
   with a mock provider that answers the outlook's own /v1/ensemble request with 51 members for three tehsils.
     E1  runEnsemble({target, latest}) writes data/ens_members/<PKT day>/ecmwf_ifs025_<YYYYMMDDHH>.{i16,json}; the header names the run
     E2  the stored values are the RAW members the provider sent (control and member 50, every variable), before any correction
     E3  the file is 3 x 6 x 51 x 15 int16 (55,080 bytes) and its sha256 matches the header
     E4  the same run again: not written twice; no provider call is added by the archive (one ensemble call per batch, as before)
     E5  NIGRAAN_ENS_MEMBERS=0: nothing written
   usage: node scripts/tests284/ensmembers.unit.test.mjs */
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d != null ? ' :: ' + String(d).slice(0, 300) : '')); } };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const D = mkdtempSync(join(tmpdir(), 'agn-em-'));
const VARS = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'wind_gusts_10m_max', 'snowfall_sum', 'apparent_temperature_max'];
const val = (ui, v, m, k) => Math.round((10 + ui * 3 + v * 1.5 + m * 0.1 + k * 0.01) * 100) / 100;   /* distinct per unit/var/member/day */
try {
  const { createOutlook } = await import(pathToFileURL(join(ROOT, 'server', 'api', 'outlook.mjs')).href);
  const { readEnsMembers } = await import(pathToFileURL(join(ROOT, 'server', 'api', 'ensmembers.mjs')).href);
  const T = [{ unitId: 'u1', name: 'A', lat: 33.70, lon: 73.05, elevM: 540 }, { unitId: 'u2', name: 'B', lat: 31.52, lon: 74.35, elevM: 217 }, { unitId: 'u3', name: 'C', lat: 24.86, lon: 67.01, elevM: 10 }];
  const days = Array.from({ length: 15 }, (_, k) => new Date(Date.UTC(2026, 9, 23 + k)).toISOString().slice(0, 10));
  const calls = [];
  const provider = { configured: () => true, call: async (kind, path, params) => { calls.push(kind);
    if (kind !== 'ensemble') throw new Error('not in this test');
    return params.latitude.map((la, i) => { const ui = T.findIndex((u) => u.lat === la); const daily = { time: days };
      VARS.forEach((name, v) => { for (let m = 0; m <= 50; m++) daily[m ? name + '_member' + String(m).padStart(2, '0') : name] = days.map((_, k) => (ui === 1 && m === 7 && k === 3) ? null : val(ui, v, m, k)); });
      return { latitude: la, longitude: params.longitude[i], elevation: T[ui].elevM, daily }; }); } };
  const app = { provider, units: { tehsil: T }, dataDir: D, verification: {} };
  const O = createOutlook(app, D);
  const target = Date.UTC(2026, 9, 23, 0) / 1000, latest = target;
  const r = await O.runEnsemble({ target, latest });
  const dir = join(D, 'ens_members', '2026-10-23'), base = join(dir, 'ecmwf_ifs025_2026102300');
  ok(r && r.started && existsSync(base + '.i16') && existsSync(base + '.json'), 'E1 the run is written under data/ens_members/<PKT day>/', JSON.stringify(r) + ' ' + (existsSync(dir) ? readdirSync(dir) : 'no dir'));
  const { head, get } = readEnsMembers(base);
  ok(head.run === '2026-10-23T00:00Z' && head.members.length === 51 && head.members[0] === 'control' && head.members[50] === 'member50' && head.units.length === 3, 'E1 header: run, 51 members (control first), 3 tehsils', JSON.stringify({ run: head.run, m: head.members.length, u: head.units.length }));
  let bad = 0, n = 0; head.units.forEach((u, iu) => { const ui = T.findIndex((t) => t.unitId === u.id);
    VARS.forEach((_, v) => { for (let m = 0; m <= 50; m++) for (let k = 0; k < 15; k++) { n++; const exp = (ui === 1 && m === 7 && k === 3) ? null : Math.round(val(ui, v, m, k) * 10) / 10; const got = get(iu, v, m, k); if (!(exp === null ? got === null : Math.abs(got - exp) < 1e-9)) bad++; } }); });
  ok(bad === 0 && n === 3 * 6 * 51 * 15, 'E2 every stored value is the raw member at 0.1 (a missing member value stays missing)', bad + ' of ' + n + ' differ');
  const b = readFileSync(base + '.i16');
  ok(b.length === 3 * 6 * 51 * 15 * 2 && createHash('sha256').update(b).digest('hex') === head.sha256, 'E3 size 55,080 bytes and sha256 as in the header', b.length);
  const nCalls = calls.length; await O.runEnsemble({ target, latest });
  ok(calls.length - nCalls === 1 && nCalls === 1, 'E4 one ensemble request per batch, the archive adds none', calls.join(','));
  ok(/already written/.test(JSON.stringify(O.status().memberArchive)), 'E4 the same run is not written twice', JSON.stringify(O.status().memberArchive));
  process.env.NIGRAAN_ENS_MEMBERS = '0';
  const D2 = mkdtempSync(join(tmpdir(), 'agn-em2-')); const O2 = createOutlook({ ...app, dataDir: D2 }, D2); await O2.runEnsemble({ target, latest });
  ok(!existsSync(join(D2, 'ens_members')), 'E5 NIGRAAN_ENS_MEMBERS=0 writes nothing'); rmSync(D2, { recursive: true, force: true }); delete process.env.NIGRAAN_ENS_MEMBERS;
} catch (e) { ok(false, 'test run', e && e.stack || e); }
finally { rmSync(D, { recursive: true, force: true }); }
console.log(`\nens members unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
