#!/usr/bin/env node
/* v91.17.283.51 fix · the deploy of 3 Nov 18:31 PKT was rolled back: on the laptop's live MACH feed every site report failed linter L13
   ("p1 outside the page: no measured value: MACH 1 I-8 ... not reporting since ...; MACH 33 ... not yet compared with the forecast"): g1's
   held-back station reasons were printed in the one-line "Now at the site" of page 1. This test, no server:
   (1) 6 held-back stations with long names and long reasons + the short "now" line and the OLD long line: page 1 never has text outside the
       page or overlapping (L13), every lint rule passes, in customer and operator view;
   (2) owner decision 3 Nov 18:54 PKT: no station name in any report (the per-station list is NOT printed);
   (3) the canvas backstop: a single over-long text line is drawn inside the page. */
import { lint } from '../../server/api/replint.mjs';
import { buildReport } from '../../server/api/repengine.mjs';
import { pdf, html, Canvas, A4 } from '../../server/api/repdraw.mjs';
import { shownOf } from '../../server/api/shownplace.mjs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const days = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ date: '2026-11-0' + (3 + i), lead: i, tmaxC: 24 + i * 0.2, tminC: 11, rainMm: 0, gustMaxKmh: 18, rainProbMax: 4, utciMaxC: 21 }));
const hz = (key, name, tier) => ({ key, layer: key, name, tier, days: days.slice(0, 4).map((d) => ({ date: d.date, level: 0, word: 'Normal', state: 'value' })) });
const held = [0, 1, 2, 3, 4, 5].map((i) => ({ station: 'MACH ' + (101 + i) + ' Sector ' + 'ABCDEFGHIJ'[i] + '-' + (10 + i) + ' Markaz, Islamabad Capital Territory (rooftop of a very long named building)', km: 0.4 + i * 3.1,
  reason: ['no reading received from the MACH database since 30 Oct, 11:02', 'reading still being checked', 'reading failed a quality check', 'station identity under review (its device reports another site)', 'siting check: reads off, not used', 'reading not shown (display checks)'][i] }));
const OLD = 'no measured value: ' + held.map((h) => h.station + ' (' + h.km + ' km): ' + h.reason).join('; ') + '. No reading from these stations is shown for this place.';
const NEW = 'no measured value: no usable station reading within 25 km right now (6 stations nearby; details in the station list)';
for (const label of [NEW, OLD]) for (const view of ['customer', 'operator']) {
  const A = { ok: true, view, issuedAt: '2026-11-03T05:04:00Z', run: '2026-11-03T00:00~x', levelsAt: '2026-11-03T05:00:00Z',
    place: { lat: 33.66443, lon: 73.08339, name: 'I-8', kind: 'near', near: { name: 'I-8', km: 0.1 }, tehsil: 'Islamabad', district: 'Islamabad', province: 'Islamabad Capital Territory' },
    days, levels: { days: days.slice(0, 4).map((d) => d.date), hazards: [hz('heat', 'Heat', 2), hz('landslide', 'Landslide', 2), hz('drought', 'Drought', 2), hz('flood', 'Flood', 1)] },
    air: null, actions: [], standing: [], cannotHappen: [],
    shown: { now: { value: 21.4, label: 'forecast for 18:31 PKT', reason: label }, today: { low: 11, high: 24.6 }, measured: { kind: 'measured', value: null, text: null, label, held } } };
  const tag = (label === NEW ? 'short line' : 'old long line') + ', ' + view;
  let R = null, err = null; try { R = buildReport(A, { kind: 'site_assessment', view, id: 'NGR-TEST-HELD6', dataDir: new URL('../../data', import.meta.url).pathname }); } catch (e) { err = e; }
  ok(R && !err, tag + ': did not build: ' + (err && err.stack || '').slice(0, 300)); if (!R) continue;
  const P = pdf(R.cv, { title: R.title, subject: 's', date: A.issuedAt }), H = html(R.cv, { title: R.title, id: 'NGR-TEST-HELD6' });
  const r = lint({ cv: R.cv, manifest: R.manifest, pdf: P, html: H, answer: A });
  ok(!r.failures.some((f) => f.code === 'L13'), tag + ': L13 fired: ' + r.failures.filter((f) => f.code === 'L13').map((f) => f.what).join(' | ').slice(0, 400));
  ok(r.ok, tag + ': linter failed: ' + r.failures.slice(0, 4).map((f) => f.code + ' ' + f.what).join(' | ').slice(0, 400));
  const all = R.cv.pages.map((p) => p.ops.filter((o) => o.k === 'text').map((o) => o.s).join(' ')).join(' ');
  if (label === NEW) ok(!/MACH\s*\d/.test(all), tag + ': the report names a station (owner rule 3 Nov 18:54: never in reports)');   /* (2) no per-station list in reports */
  ok(R.cv.pages.every((p) => p.ops.every((o) => o.k !== 'text' || !o.s || o.anchor !== 'start' || o.x + R.cv.measure(o.s, o.size, o.b) <= A4.w + 0.5)), tag + ': a text line runs past the page edge');
}
{ const c = new Canvas(); c.page(); const s = 'MACH 1 I-8, Islamabad (0 km): no reading received from the MACH database since 30 Oct, 11:02; '.repeat(2); const o = c.text(40, 100, s, { size: 9 }); ok(o.x + c.measure(o.s, o.size, o.b) <= A4.w - 19, 'backstop: an over-long line still runs off the page'); }
/* (4) owner 3 Nov 18:54: one sentence by location, no station name / km / minutes */
{ const now = Date.parse('2026-11-03T13:40:00Z'); const base = { ok: true, now: { tempC: 21.3, time: '2026-11-03T18:00' }, hours: [{ time: '2026-11-03T18:00', tempC: 21.3 }, { time: '2026-11-03T19:00', tempC: 20.5 }], days: [{ lead: 0, tmaxC: 25, tminC: 10 }], place: { name: 'Near E-7 (0.3 km)', tehsil: 'Islamabad' } };
  const live = shownOf({ ...base, station: { ok: true, name: 'MACH 31 E-7, Islamabad', km: 0.2, ageMin: 4, reading: { tempC: 20.9, observedAt: '2026-11-03T13:36:00Z' } } }, { nowMs: now });
  ok(live.now.label === 'Temperature measured now near E-7' && !/MACH|km|min/.test(JSON.stringify(live.now.label)), 'measured label: ' + live.now.label);
  ok(live.now.station == null && live.now.km == null && live.now.minutesAgo == null, 'measured value still carries station / km / minutes');
  const none = shownOf({ ...base, station: { ok: false, why: 'x', held: [{ station: 'MACH 1 I-8', km: 0, reason: 'r' }] } }, { nowMs: now });
  ok(none.measured.label === 'No live temperature measurement near E-7 right now; the value shown is the forecast.' && !none.measured.held, 'no-live label: ' + none.measured.label);
  const urdu = shownOf({ ...base, place: { name: '1 km SSW of \u0639\u06cc\u0633\u06cc', tehsil: 'Quetta City' }, station: { ok: false } }, { nowMs: now });
  ok(/near Quetta City right now/.test(urdu.measured.label), 'a non-Latin place name: ' + urdu.measured.label); }
console.log('\nheld6: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
