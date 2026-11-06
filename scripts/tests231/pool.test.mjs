/* v91.17.231 · THE WORKER POOL GIVES THE SAME NUMBERS. Two checks, no server and no network:
     trees   every tree model the correction chain hands to the pool (national mean / q05 / q95 for both variants, the dew-point model,
             the weather MOS) evaluated in the pool and here on 400 rows built from the models' own self-check rows, with missing
             values mixed in (null, undefined, NaN): every value identical
     chain   the cached sweep bodies corrected by the chain run to the end here (correctResponse) and by the pooled chain
             (correctResponseAsync), the clock frozen and the live layer off: byte-identical bodies
   usage: node scripts/tests231/pool.test.mjs [--bodies 6] */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = join(APP, 'data');
const a = process.argv.slice(2); const NB = Number(a[a.indexOf('--bodies') + 1]) || 6;
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (info ? ' :: ' + String(info).slice(0, 300) : '')); } };

const FIX = Date.now(); Date.now = () => FIX;
const { lgbEval } = await import('../../server/api/natmodel.mjs');
const { evalBatch, poolStatus } = await import('../../server/api/lgbpool.mjs');

/* ── trees ── */
const rng = (() => { let s = 7; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
const cases = [];
const nat = JSON.parse(readFileSync(join(DATA, 'national-model.json'), 'utf8'));
for (const tag of Object.keys(nat.variants)) for (const k of ['mean', 'q05', 'q95']) cases.push({ name: 'national ' + tag + ' ' + k, file: join(DATA, 'national-model.json'), path: ['variants', tag, k], version: nat.version, P: nat.variants[tag][k], feats: nat.variants[tag].features, sc: nat.variants[tag].selfcheck || [] });
const moist = JSON.parse(readFileSync(join(DATA, 'moist-model.json'), 'utf8'));
if (moist.dew && moist.dew.model) cases.push({ name: 'dew point', file: join(DATA, 'moist-model.json'), path: ['dew', 'model'], version: moist.version, P: moist.dew.model, feats: moist.features, sc: moist.dew.model.selfcheck || [] });
const wx = JSON.parse(readFileSync(join(DATA, 'weather-mos.json'), 'utf8'));
cases.push({ name: 'weather MOS', file: join(DATA, 'weather-mos.json'), path: ['mean'], version: wx.version, P: wx.mean, feats: wx.features, sc: [] });
for (const c of cases) {
  const base = c.sc.length ? c.sc.map((s) => c.feats.map((f) => s.x[f])) : [c.feats.map(() => 0)];
  const rows = [];
  for (let r = 0; r < 400; r++) { const b = base[r % base.length];
    rows.push(b.map((v) => { const u = rng(); if (u < 0.06) return null; if (u < 0.08) return undefined; if (u < 0.10) return NaN; return (v == null ? 0 : v) * (0.7 + 0.6 * rng()) + (rng() - 0.5); })); }
  const here = rows.map((x) => lgbEval(c.P, x));
  const there = await evalBatch({ file: c.file, path: c.path, version: c.version }, rows);
  ok(there && there.length === here.length && here.every((v, i) => Object.is(v, there[i]) || v === there[i]), 'trees · ' + c.name + ': 400 rows identical in the pool', there ? here.find((v, i) => v !== there[i]) : 'pool did not answer');
}
const vb = await evalBatch({ file: cases[0].file, path: cases[0].path, version: 'not-the-version' }, [cases[0].feats.map(() => 0)]);
ok(vb === null, 'trees · a model version the pool does not hold is declined (the caller then evaluates here)');

/* ── chain ── */
const dir = join(DATA, 'cache', 'provider', 'sweep');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^[0-9a-f]+\.json$/.test(f)).sort().slice(0, NB) : [];
if (!files.length) console.log('SKIP chain · no cached sweep bodies in data/cache/provider/sweep');
else {
  process.env.NIGRAAN_WORKER = '0'; process.env.NIGRAAN_AUTO_SCHEDULE = '0'; process.env.NIGRAAN_ENGINE = '0';
  const { createBackend } = await import('../../server/api/index.mjs');
  const B = createBackend({ root: APP, dataDir: DATA }); await new Promise((r) => setTimeout(r, 3000));
  const V = B.app.verification; let same = 0, n = 0; const d0 = poolStatus().declined;   /* the deliberate decline above */
  for (const f of files) {
    const buf = readFileSync(join(dir, f)); let j; try { j = JSON.parse(buf); } catch { continue; }
    const arr = Array.isArray(j) ? j : [j];
    const qs = new URLSearchParams({ latitude: arr.map((l) => l.latitude).join(','), longitude: arr.map((l) => l.longitude).join(','), models: 'best_match' });
    /* pooled first: its national and dew-point results fill the hour's memo, which the run here then reads; the weather MOS has no memo
       and is evaluated by both. scripts/tests231/equality_run.mjs compares separate processes with no shared memo. */
    const p = await V.correctResponseAsync(buf, qs, [], null, 0, false, null, true, false);
    const s = V.correctResponse(buf, qs, [], null, 0, false, null, true, false);
    n++; if (Buffer.compare(s.buf, p.buf) === 0 && s.n === p.n) same++;
  }
  ok(same === n && n > 0, 'chain · ' + n + ' cached sweep bodies corrected on this thread and through the pool: byte-identical (' + same + ')');
  const st = poolStatus(); ok(st.enabled && st.sent > 0 && st.declined === d0, 'chain · the pooled run used the pool (' + st.sent + ' batches, ' + st.rows + ' rows, none declined)', JSON.stringify(st));
}
console.log(`\n${fail ? 'FAIL' : 'PASS'} pool: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
