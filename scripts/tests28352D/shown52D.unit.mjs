/* v91.17.283.52 D · N4 / N6 / I-8: ONE station decision (shownplace.mjs). A place whose station rule has a reading never says "No live
   measurement"; "(corrected with live station readings)" only where a reading is near.  usage: node shown52D.unit.mjs */
const { shownOf } = await import(new URL('../../server/api/shownplace.mjs', import.meta.url));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const H = (t, v) => ({ time: t, tempC: v, feelsC: v - 1.5, rh: 60, windKmh: 5, gustKmh: 12, dewC: 10 });
const mk = (st, live = true) => ({ ok: true, issuedAt: '2026-11-03T16:00:00Z', place: { name: 'Lahore Cantt' }, now: { ...H('2026-11-03T21:00', 22.3), live }, hours: [H('2026-11-03T21:00', 22.3), H('2026-11-03T22:00', 21.5)], days: [{ lead: 0, date: '2026-11-03', tmaxC: 29.2, tminC: 18.6 }], station: st });
const at = Date.parse('2026-11-03T16:04:00Z');   /* 21:04 PKT: the live test's minute */
/* the live-test case: MACH Lahore Cantt 0.8 km, reading 20:57 PKT (7 min ago), before the 21:00 hour began */
let S = shownOf(mk({ ok: true, name: 'MACH Lahore Cantt', km: 0.8, ageMin: 7, reading: { tempC: 22.3, observedAt: '2026-11-03T15:57:00Z' } }), { nowMs: at });
ok(S.now.kind === 'forecast' && !/No live temperature measurement/.test(S.now.reason || '') && /20:57 PKT/.test(S.now.reason || ''), 'reading before the hour: forecast is now, reason names the reading time: ' + S.now.reason);
ok(S.measured.value === '22.3' && /^Temperature measured near Lahore Cantt at 20:57 PKT$/.test(S.measured.label), 'the measured line carries the reading: ' + S.measured.value + ' · ' + S.measured.label);
ok(S.measured.station == null && S.measured.km == null && S.measured.minutesAgo == null, 'no station name / km / minutes in the shown strings (owner 3 Nov 18:54)');
ok(/corrected with live station readings/.test(S.now.label), 'live correction named where a reading is near: ' + S.now.label);
/* no station: no live-correction claim next to "No live measurement" */
S = shownOf(mk({ ok: false, why: 'no AGN station reading within 25 km' }), { nowMs: at });
ok(/^No live temperature measurement near Lahore Cantt/.test(S.measured.label) && !/corrected with live/.test(S.now.label), 'no reading: "No live measurement", no "(corrected with live station readings)": ' + S.now.label + ' | ' + S.measured.label);
/* a reading after the hour began is the now value (C2 unchanged) */
S = shownOf(mk({ ok: true, name: 'X', km: 0.8, ageMin: 2, reading: { tempC: 22.9, observedAt: '2026-11-03T16:02:00Z' } }), { nowMs: at });
ok(S.now.kind === 'measured' && S.now.value === '22.9', 'reading after the hour began = now (' + S.now.value + ')');
/* I-8 vs I-8/3 (1 km apart, same station rule, same reading): the same measured line whatever the minute inside the hour */
const st = { ok: true, name: 'MACH I-8', km: 0.3, ageMin: 7, reading: { tempC: 24.1, observedAt: '2026-11-03T15:57:00Z' } };
const a = shownOf(mk(st), { nowMs: at }), b = shownOf(mk({ ...st, km: 1.2 }), { nowMs: at + 9 * 60e3 });
ok(a.measured.value === b.measured.value && a.measured.label.replace(/near \S+/, '') === b.measured.label.replace(/near \S+/, ''), 'two points of one station: the same measured line (' + a.measured.label + ' / ' + b.measured.label + ')');
console.log('shown52D.unit: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
