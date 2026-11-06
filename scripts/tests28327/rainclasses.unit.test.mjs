/* v91.17.283.27 . ITEM 3 · THE 24-HOUR RAIN CLASSES HAVE ONE HOME, data/hazard-scale.json rainClasses24h, offline:
     C1  the register entry: 15.6 / 64.5 / 115.6 / 204.5 mm, published, the India Meteorological Department named as the source (the scale's
         real source) once, with the customer wording
     C2  every reader takes it from there: hazsci RAIN_CLASSES, rainprob RAIN_CLASS_MM, outlook RAIN_CLASS_MM equal the register; no server
         module types the four numbers (hazsci, rainprob, outlook, served, maplayers); map-layer-scales.json rain_fell holds no copy
     C3  a changed register changes every reader at once (live read): the member shares, the calibrated class keys and the served
         screening rule follow it; a missing register gives no classes (rain level not assessed, never Normal)
     C4  one source label: no "national service" wording for the classes (model gate, register, code); the customer text keeps the
         India Meteorological Department and never names PMD (customerScrub)
   usage: node scripts/tests28327/rainclasses.unit.test.mjs */
import { mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
const imp = (f) => import(pathToFileURL(join(API, f)).href);
const J = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 500) : '')); } };
const HS = J('data', 'hazard-scale.json'); const E = HS.rainClasses24h;
/* ── C1 ── */
ok(E && JSON.stringify(E.value) === '[15.6,64.5,115.6,204.5]' && E.status === 'published', 'C1a the one home holds the four classes', E && E.value);
ok(/^India Meteorological Department daily rainfall intensity categories/.test(E.source) && /India Meteorological Department/.test(E.customerSource) && !/PMD|Pakistan Meteorological/.test(E.source + E.customerSource), 'C1b the source is the India Meteorological Department scale (source and customer wording)', E.source);
ok(Array.isArray(E.words) && E.words.length === 5, 'C1c the five level words live with the classes');
/* ── C2 ── */
const SC = await imp('scalecuts.mjs'), RP = await imp('rainprob.mjs'), OL = await imp('outlook.mjs'), HZ = await imp('hazsci.mjs');
ok([HZ.RAIN_CLASSES, RP.RAIN_CLASS_MM, OL.RAIN_CLASS_MM, SC.rainClasses24h()].every((x) => JSON.stringify(x) === JSON.stringify(E.value)), 'C2a hazsci, rainprob, outlook and scalecuts all read the register', [HZ.RAIN_CLASSES, RP.RAIN_CLASS_MM, OL.RAIN_CLASS_MM]);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const typed = ['hazsci.mjs', 'rainprob.mjs', 'outlook.mjs', 'served.mjs', 'maplayers.mjs'].filter((f) => /15\.6\s*,\s*64\.5|'64\.5'|\b204\.5\b/.test(strip(readFileSync(join(API, f), 'utf8'))));
ok(!typed.length, 'C2b no server module types the classes', typed);
const RF = J('data', 'map-layer-scales.json').layers.rain_fell;
ok(!RF.cuts && !RF.words && !RF.source && !RF.customerSource && /hazard-scale\.json rainClasses24h/.test(RF.cutsFrom), 'C2c map-layer-scales.json rain_fell holds no copy (it points at the one home)', Object.keys(RF));
/* ── C3 ── */
{
  const T = mkdtempSync(join(tmpdir(), 'rc27-')); const H2 = JSON.parse(JSON.stringify(HS)); H2.rainClasses24h.value = [10, 50, 100, 200];
  writeFileSync(join(T, 'hazard-scale.json'), JSON.stringify(H2));
  const old = process.env.NIGRAAN_DATA_DIR; process.env.NIGRAAN_DATA_DIR = T; await new Promise((r) => setTimeout(r, 1100));
  const sh = OL.rainClassShares([5, 12, 60, 120, 250], 5);
  ok(JSON.stringify(Object.keys(sh.p)) === '["10","50","100","200"]' && sh.p['10'] === 80, 'C3a the member shares follow the register (live read)', sh);
  ok(JSON.stringify(RP.rainClassMm()) === '[10,50,100,200]', 'C3b rainprob reads the live register', RP.rainClassMm());
  const cell = HZ.rainCell({ prc: { n: 51, p: { 10: 60, 50: 55, 100: 10, 200: 0 } } }, 51);
  ok(cell.L === -5 && cell.facts, 'C3c (v283.36 item 22) the member shares are facts; no 50 %-of-members level (the share rule is untested)', cell);
  writeFileSync(join(T, 'hazard-scale.json'), JSON.stringify({ ...HS, rainClasses24h: undefined })); await new Promise((r) => setTimeout(r, 1100));
  const c2 = HZ.rainCell({ prc: { n: 51, p: { '15.6': 90 } } }, 51);
  ok(c2.L === -1 && /not assessed/.test(c2.why) && SC.rainClasses24h() === null, 'C3d no register: no classes, the rain level is not assessed (never Normal)', c2);
  if (old === undefined) delete process.env.NIGRAAN_DATA_DIR; else process.env.NIGRAAN_DATA_DIR = old; rmSync(T, { recursive: true, force: true });
  await new Promise((r) => setTimeout(r, 1100));
}
/* ── C4 ── */
{
  const G = readFileSync(join(ROOT, 'data', 'model-gate.json'), 'utf8'), GR = readFileSync(join(ROOT, 'data', 'model-gate.resolved.json'), 'utf8');
  const rc = J('data', 'model-gate.json').entries.find((e) => e.id === 'rain-classes');
  ok(!/classes of the national service/.test(G + GR) && /India Meteorological Department/.test(rc.source), 'C4a the model gate names the classes\' source as the India Meteorological Department (no "national service")', rc.source);
  const RG = J('data', 'thresholds-register.json').rows; const row = RG.find((r) => r.id === 'hazard-scale.rainClasses24h');
  ok(row && row.source === E.source && !RG.some((r) => r.id === 'hazsci.RAIN_CLASSES') && !RG.some((r) => /rain classes of the national service/.test(r.source || '')), 'C4b the thresholds register carries the one entry with the one source', row);
  const { customerScrub } = await imp('customerscrub.mjs');
  const s = customerScrub('source: ' + E.customerSource);
  ok(/India Meteorological Department/.test(s) && !/PMD|Pakistan Meteorological/.test(s), 'C4c the customer text keeps the India Meteorological Department and names no PMD', s);
  const ml = readFileSync(join(API, 'maplayers.mjs'), 'utf8');
  ok(/rainClassesEntry\(\)/.test(ml) && /RC\.customerSource/.test(ml), 'C4d the rain_fell map layer prints the customer source of the one home');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
