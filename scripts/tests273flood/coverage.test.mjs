import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.273 FLOOD · coverage: every tehsil carries a level (or a stated state) for every hazard on every issued day.
   node scripts/tests273flood/coverage.test.mjs   (offline; no server needed) */
import { readFileSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const ROOT = (__T.ROOT + '/');
let pass = 0, fail = 0; const ok = (c, n, x) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); } };
const { createEngine, holdIssueLevels, HELD_NOTE } = await import(ROOT + 'server/api/engine.mjs');
const src = JSON.parse(readFileSync(ROOT + 'data/engine-latest.json', 'utf8'));
/* a report as the page posts it: days 1-3 without the once-per-issue layers */
const body = JSON.parse(JSON.stringify(src)); for (const d of body.days) if (d.day > 0) for (const k of Object.keys(d.layers)) if (d.layers[k].held != null) delete d.layers[k];
const day0 = Object.keys(body.days[0].layers), later = body.days.filter(d => d.day > 0);
ok(later.every(d => Object.keys(d.layers).length < day0.length), 'the page report carries fewer layers on days 1-3 (' + later.map(d => Object.keys(d.layers).length).join('/') + ' of ' + day0.length + ')');
const dir = mkdtempSync(join(tmpdir(), 'cov273-')); const E = createEngine({}, dir, { port: 1 });
const r = E.report(body); ok(r.ok, 'report accepted');
const L = E.latest();
for (const d of L.days) { const miss = day0.filter(k => !d.layers[k]); ok(!miss.length, 'day ' + d.day + ': every hazard present (' + Object.keys(d.layers).length + ')', miss.join(','));
  for (const k of day0) { const v = d.layers[k]; const n = Object.keys(v.L).length, acc = v.counts.reduce((a, b) => a + b, 0) + v.na + v.nd;
    if (n !== 576 || acc !== 576) ok(false, 'day ' + d.day + ' ' + k + ': 576 tehsils accounted for', n + ' / ' + acc); } }
ok(L.days.every(d => d.day === 0 || ['drought', 'glof', 'flood_riverine', 'nss_baseline', 'nss_dynamic'].every(k => d.layers[k].held === 0 && d.layers[k].L === L.days[0].layers[k].L)), 'held layers carry the day-0 level, marked held');
ok(['heat', 'flood_pluvial', 'landslide', 'rain_hz'].every(k => L.days[1].layers[k].held == null), 'day-capable layers are not held (their own day value)');
/* the API */
L.received = new Date().toISOString();
const lv = E.levels('drought', 2, false); ok(lv.ready && lv.held === HELD_NOTE && lv.basis === 'issue' && Object.keys(lv.levels).length === 576, '/api/levels?layer=drought&day=2 answers with the issue level (was: not derived)', JSON.stringify(lv).slice(0, 200));
const lv1 = E.levels('heat', 1, false); ok(lv1.ready && lv1.held == null && lv1.basis === 'peak', 'heat day 1 unchanged (own day, peak)');
const all = E.levels(null, 3, false); ok(all.ready && Object.keys(all.layers).length === day0.length, 'day 3 lists every layer (' + Object.keys(all.layers).length + ')');
const u = E.unit('Sindh|Sujawal|Jati', false); ok(u.ready && u.days.every(d => Object.keys(d.layers).length === day0.length) && u.days[2].layers.drought.held === true && u.days[2].layers.heat.held == null, 'one tehsil: every hazard on every day; held marked', JSON.stringify(u.days && u.days[2]).slice(0, 300));
ok(!/PMD|FFD|Pakistan Meteorological|Flood Forecasting Division/.test(JSON.stringify(u) + JSON.stringify(lv)), 'no PMD/FFD names in the customer answers');
/* archive: held layers not written twice; the record names them */
const af = readdirSync(join(dir, 'archive', 'engine')); const rec = JSON.parse(gunzipSync(readFileSync(join(dir, 'archive', 'engine', af[0]))).toString().trim().split('\n').pop());
ok(rec.days[0].layers.drought && !rec.days[1].layers.drought && rec.days[1].held && rec.days[1].held.includes('drought'), 'archive: day 0 holds drought, later days name it held (no duplicate arrays)');
/* idempotent; a stored latest from before v273 is filled at load */
const twice = holdIssueLevels(JSON.parse(JSON.stringify(L))); ok(JSON.stringify(twice.days.map(d => Object.keys(d.layers).sort())) === JSON.stringify(L.days.map(d => Object.keys(d.layers).sort())), 'filling is idempotent');
writeFileSync(join(dir, 'engine-latest.json'), JSON.stringify(body)); const E2 = createEngine({}, dir, { port: 1 }); ok(E2.latest().days.every(d => Object.keys(d.layers).length === day0.length), 'an engine-latest.json written before v273 is filled when loaded');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
