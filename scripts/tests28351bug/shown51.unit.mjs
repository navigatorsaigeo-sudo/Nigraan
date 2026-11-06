/* v91.17.283.51 · C2 / C3: the one "now" rule (server/api/shownplace.mjs), unit checks.  usage: node shown51.unit.mjs */
const { shownOf } = await import(new URL('../../server/api/shownplace.mjs', import.meta.url));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const H = (t, v) => ({ time: t, tempC: v, feelsC: v - 1.5, rh: 60, windKmh: 5, gustKmh: 12, dewC: 10 });
const mk = (st) => ({ ok: true, issuedAt: '2026-11-03T04:00:00Z', now: H('2026-11-03T09:00', 19.5), hours: [H('2026-11-03T09:00', 19.5), H('2026-11-03T10:00', 21.1)], days: [{ lead: 0, date: '2026-11-03', tmaxC: 25, tminC: 14 }], station: st });
const at = Date.parse('2026-11-03T04:47:00Z');   /* 09:47 PKT */
/* the owner's case: 19.5 shown beside "21.8 measured now (E-7, 0.2 km, 12 min ago)" */
let S = shownOf(mk({ ok: true, name: 'E-7', km: 0.2, ageMin: 12, reading: { tempC: 21.8, rh: 50, windKmh: 4, observedAt: '2026-11-03T04:35:00Z' } }), { nowMs: at });
ok(S.now.kind === 'measured' && S.now.value === '21.8', 'a fresher quality-checked reading IS the now value (' + S.now.value + ')');
ok(/^Temperature measured now near /.test(S.now.label) && !/km|min ago|E-7,/.test(S.now.label), 'its label (owner 3 Nov 18:54: by location, no station / km / minutes): ' + S.now.label);
ok(S.measured.value == null && /^forecast for 09:47 PKT: 20\.8 °C$/.test(S.measured.label), 'the forecast of the minute is the second line: ' + S.measured.label);
ok(S.made === '09:47 PKT' && S.madeAt === new Date(at).toISOString(), 'made = when the value was made (' + S.made + ')');
/* a reading older than the forecast hour: the forecast, with one short reason */
S = shownOf(mk({ ok: true, name: 'E-7', km: 0.2, ageMin: 57, reading: { tempC: 21.8, observedAt: '2026-11-03T03:50:00Z' } }), { nowMs: at });
ok(S.now.kind === 'forecast' && S.now.value === '20.8' && S.now.label === 'forecast for 09:47 PKT', 'forecast at the minute, interpolated 19.5 -> 21.1 at :47 = 20.8 (' + S.now.value + ', ' + S.now.label + ')');
/* v91.17.283.52 D (N4, superseded rule): the older reading is still shown as a measurement with its time (place name only, no station / km /
   minutes); the now value stays the forecast, with the plain reason */
ok(/^The latest temperature reading near this place \(08:50 PKT\) was taken before this hour began; the value shown is the forecast for now\.$/.test(S.now.reason) && S.measured.value === '21.8' && S.measured.label === 'Temperature measured near this place at 08:50 PKT' && !/km|min ago|E-7/.test(S.measured.label + S.now.reason), 'one short sentence: ' + S.now.reason + ' | ' + S.measured.label);
/* no station */
S = shownOf(mk({ ok: false, why: 'no AGN station reading within 25 km' }), { nowMs: at });
ok(S.now.kind === 'forecast' && S.now.reason === 'No live temperature measurement near this place right now; the value shown is the forecast.' && S.measured.label === S.now.reason, 'no station: forecast with the reason');
/* the hour is not 09:00 (bundle of another hour): the hour value, labelled with its own hour (no interpolation outside the hour) */
S = shownOf(mk({ ok: false, why: 'x' }), { nowMs: Date.parse('2026-11-03T06:10:00Z') });
ok(S.now.value === '19.5' && S.now.label === 'forecast for 09:00 PKT', 'outside the hour: the hour value with its own time (' + S.now.label + ')');
/* the same rounding for every page: one decimal */
ok(shownOf(mk({ ok: false }), { nowMs: Date.parse('2026-11-03T04:00:00Z') }).now.value === '19.5', 'on the hour: the hour value');
console.log('shown51.unit: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
