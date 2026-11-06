/* v91.17.283.45 (NIGRAAN 1.0.8) · IMERG past rain is SHADOW: logged daily beside the served model rain, never read by a served path.
   usage: node scripts/tests28345/imergshadow45.test.mjs */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join, dirname } from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const I = await import(pathToFileURL(join(ROOT, 'server', 'api', 'imergpastrain.mjs')).href);
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 300) : '')); } };
const mk = () => { const D = mkdtempSync(join(tmpdir(), 'v45imerg-')); mkdirSync(join(D, 'imerg', 'pkt'), { recursive: true });
  writeFileSync(join(D, 'imerg-past-rain.json'), JSON.stringify({ version: 't', units: { A: { cell: [1, 2], testedGauges: 3 }, B: { cell: [3, 4], testedGauges: 1 } } }));
  for (const d of ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']) writeFileSync(join(D, 'imerg', 'pkt', d + '.json'), JSON.stringify({ units: {}, points: { A: 1.5, B: 0 } }));
  return D; };
const NOW = Date.parse('2026-11-02T04:00:00Z');   /* 09:00 PKT, 2 Nov */
const model = (uid, date) => ({ mm: 7.2, basis: 'model rain', date });
const env0 = {}, envS = { NIGRAAN_IMERG_PAST_RAIN: 'shadow' }, envOff = { NIGRAAN_IMERG_PAST_RAIN: '0' }, envOn = { NIGRAAN_IMERG_PAST_RAIN: '1' };
ok(I.imergMode(env0) === 'shadow' && I.imergMode(envS) === 'shadow' && I.imergMode(envOff) === 'off' && I.imergMode(envOn) === 'on', 'switch states: unset/shadow = SHADOW, 0 = off, 1 = served');
{ const D = mk(); ok(I.imergRain5(D, 'A', '2026-11-02', env0) === null && I.imergRain5(D, 'A', '2026-11-02', envS) === null, 'shadow: the served reader (sponge rain5Of) gets null, so the model rain is served as in 1.0.7.1');
  const r = I.imergRain5Raw(D, 'A', '2026-11-02'); ok(r && r.mm === 7.5 && r.daily.length === 5, 'the shadow reader sums the 5 days of the cell', JSON.stringify(r)); }
{ const D = mk(); const s = I.imergShadow(D, model, NOW, env0); const f = join(D, 'archive', 'imergshadow', '2026-11-02.json'); const J = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  ok(s && s.complete && J && J.shadow === true && J.served === false && J.values.A.imergMm === 7.5 && J.values.A.modelMm === 7.2 && J.values.B.imergMm === 0 && J.values.A.testedGauges === 3, 'shadow: one file per Pakistan day with satellite and served model 5-day rain per scope tehsil', JSON.stringify(J));
  const m1 = readFileSync(f, 'utf8'); I.imergShadow(D, () => ({ mm: 99 }), NOW + 3600e3, env0); ok(readFileSync(f, 'utf8') === m1, 'a complete day is written once'); }
{ const D = mk(); writeFileSync(join(D, 'imerg', 'pkt', '2026-11-01.json'), JSON.stringify({ units: {} })); const s = I.imergShadow(D, model, NOW + 7 * 864e5 * 0, env0);
  const J = JSON.parse(readFileSync(join(D, 'archive', 'imergshadow', '2026-11-02.json'), 'utf8')); ok(s && s.complete === false && J.values.A.imergMm === null && J.values.A.modelMm === 7.2, 'a day without satellite points is logged incomplete (retried later), never mixed', JSON.stringify(s)); }
{ const D = mk(); ok(I.imergShadow(D, model, NOW, envOff) === null && !existsSync(join(D, 'archive')), 'off (=0): no shadow file'); ok(I.imergShadow(D, model, NOW, envOn) === null, 'served (=1): no shadow log (not set by 1.0.8)'); }
{ const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); const API = join(ROOT, 'server', 'api');
  const readers = readdirSync(API).filter((f) => /\.mjs$/.test(f)).filter((f) => /imergshadow|imergShadow\b/.test(strip(readFileSync(join(API, f), 'utf8')))).sort();
  const hz = strip(readFileSync(join(API, 'hazsci.mjs'), 'utf8')); const callLine = hz.split('\n').find((l) => /imergShadow\(/.test(l)) || '';
  ok(JSON.stringify(readers) === JSON.stringify(['hazsci.mjs', 'imergpastrain.mjs']) && !/step\(/.test(callLine) && !/rec\b/.test(callLine), 'only hazsci calls the logger, outside step() and without the record; no served module reads data/archive/imergshadow', readers.join(',') + ' | ' + callLine.slice(0, 200)); }
console.log('imergshadow45: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
