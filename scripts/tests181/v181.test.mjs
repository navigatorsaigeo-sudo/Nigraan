/* v91.17.181 · rain amount range: served only where it passed (plains; P50/P90 to day 3, P10 to day 1; mountains withheld), exported
   trees reproduce Python, quantiles ordered, withheld after validUntil.  usage: node scripts/tests181/v181.test.mjs (from nigraan-local) */
import { createRainChance } from '../../server/api/rainchance.mjs';
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url'; import { tmpdir } from 'node:os';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
function store(units) {
  const run = { run_id: 'r1', status: 'complete', unit_level: 'tehsil', completed_at: new Date().toISOString(), base_valid_time: new Date().toISOString() };
  const t0 = Date.parse(new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00+05:00') - 864e5;   /* yesterday 00 PKT */
  const recs = [];
  for (let k = 0; k < 420; k++) { const u = units[k % units.length]; const time = [], precipitation = [];
    for (let h = 0; h < 24 * 6; h++) { time.push(new Date(t0 + h * 3600e3).toISOString().slice(0, 16)); precipitation.push(u.rain); }
    recs.push({ runId: 'r1', unitKey: u.uid + (k >= units.length ? '#' + k : ''), lat: u.lat + (k >= units.length ? (k % 7) * 0.01 : 0), lon: u.lon, resolvedElevationM: u.el, hourly: { time, precipitation } }); }
  return { filter: (c, f) => (c === 'runs' ? [run] : recs).filter(f) };
}
const units = [{ uid: 'plainsA', lat: 31.5, lon: 74.3, el: 210, rain: 0.8 }, { uid: 'mtnB', lat: 35.9, lon: 74.3, el: 1500, rain: 0.8 }];
const rc = createRainChance({ store: store(units) }, join(APP, 'data'));
ok(rc.amountSelfcheck() < 1e-3, 'exported trees reproduce Python (' + rc.amountSelfcheck().toExponential(1) + ')');
const n = rc.national(); ok(n.ready && n.days.length >= 3, 'national rain chance built (' + (n.days || []).length + ' days)');
const P = n.units.plainsA, M = n.units.mtnB;
const served = P.days.filter((d) => d.amt && d.amt.p50 != null);
ok(served.length >= 1 && served.every((d) => d.lead <= 3), 'plains: range served, only to day 3 (' + served.map((d) => d.lead).join(',') + ')');
ok(P.days.every((d) => !d.amt || d.amt.p10 == null || d.lead <= 1), 'plains: P10 only today and tomorrow');
ok(served.every((d) => (d.amt.p10 == null || d.amt.p10 <= d.amt.p50) && d.amt.p50 <= d.amt.p90), 'quantiles ordered P10 <= P50 <= P90');
ok(M.days.every((d) => !d.amt || (d.amt.p50 == null && /withheld/.test(d.amt.why || ''))), 'mountains: withheld with the reason');
/* after validUntil: copy the model with an old date */
const tmp = mkdtempSync(join(tmpdir(), 'ram-')); const m = JSON.parse(readFileSync(join(APP, 'data', 'rain-amount-model.json'), 'utf8')); m.validUntil = '2020-01-01';
writeFileSync(join(tmp, 'rain-amount-model.json'), JSON.stringify(m)); copyFileSync(join(APP, 'data', 'rain-chance-model.json'), join(tmp, 'rain-chance-model.json'));
const rc2 = createRainChance({ store: store(units) }, tmp); const n2 = rc2.national(); if (!n2.units) console.log('n2', JSON.stringify(n2).slice(0, 300)); else console.log('    e.g.', JSON.stringify(n2.units.plainsA.days[1].amt));
ok(n2.units.plainsA.days.every((d) => !d.amt || d.amt.p50 == null) && n2.units.plainsA.days.some((d) => d.amt && /monthly/.test(d.amt.why || '')), 'withheld after validUntil, with the reason');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
