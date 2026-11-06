/* v91.17.283.10 · budget · server/api/sweepaxis.mjs hourAxisMoved: is a changed-member splice certain to fail on the time axis?
     A1  forecast_hours=6, body fetched this hour (local axis starts at the current local hour): false (the splice is tried)
     A2  the same body one hour later: true (the provider would answer from the new hour; the splice would be thrown away)
     A3  a +05:30 location (IIOJK points resolve to Asia/Kolkata with timezone=auto): aligned to its own offset
     A4  past_hours=2: the axis starts two hours before the current hour
     A5  a day window (forecast_days / past_days only), a dated window, an unreadable body, or the switch off: false (splice tried as before)
     A6  the provider's own rule, from its source: open-meteo Sources/App/Helper/ForecastapiQuery.swift forecastTimeRange2 aligns an hour
         window to (now + utcOffset) / 3600 * 3600 (checked against a cloned copy of the source when OM_SRC is set)
   usage: node scripts/tests28310/budget/sweepaxis.unit.test.mjs */
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { hourAxisMoved } = await import(pathToFileURL(join(ROOT, 'server', 'api', 'sweepaxis.mjs')).href);
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d != null ? ' :: ' + String(d).slice(0, 300) : '')); } };
const q = (o) => (k) => (o[k] == null ? null : String(o[k]));
const now = Date.parse('2026-10-23T22:27:00Z');
const loc = (off, firstLocal) => ({ latitude: 1, longitude: 1, utc_offset_seconds: off, hourly: { time: [firstLocal, 'x'], temperature_2m_jma_seamless: [1, 2] } });
const body = (...L) => Buffer.from(JSON.stringify(L.length === 1 ? L[0] : L));
const FH = { forecast_hours: 6, timezone: 'auto', hourly: 'temperature_2m', models: 'jma_seamless,gfs_seamless' };
ok(hourAxisMoved(q(FH), body(loc(18000, '2026-10-24T03:00'), loc(18000, '2026-10-24T03:00')), now) === false, 'A1 fetched this hour (local 03:00 at 22:27 UTC, +05:00): splice tried');
ok(hourAxisMoved(q(FH), body(loc(18000, '2026-10-24T02:00')), now) === true, 'A2 the body is from the hour before: the splice cannot fit');
ok(hourAxisMoved(q(FH), body(loc(19800, '2026-10-24T03:00')), Date.parse('2026-10-23T22:35:00Z')) === true && hourAxisMoved(q(FH), body(loc(19800, '2026-10-24T03:00')), Date.parse('2026-10-23T22:27:00Z')) === false,
  'A3 a +05:30 location is aligned to its own offset (03:00 local is current from 21:30 to 22:30 UTC)');
ok(hourAxisMoved(q({ ...FH, past_hours: 2 }), body(loc(18000, '2026-10-24T01:00')), now) === false && hourAxisMoved(q({ ...FH, past_hours: 2 }), body(loc(18000, '2026-10-24T03:00')), now) === true, 'A4 past_hours moves the start back');
ok(hourAxisMoved(q({ forecast_days: 8, past_days: 4, timezone: 'GMT', hourly: 'temperature_2m' }), body(loc(0, '2026-10-19T00:00')), now) === false, 'A5a a day window: splice tried as before');
ok(hourAxisMoved(q({ ...FH, start_hour: '2026-10-23T00:00' }), body(loc(18000, '2026-10-20T00:00')), now) === false, 'A5b a dated window: splice tried as before');
ok(hourAxisMoved(q(FH), Buffer.from('not json'), now) === false && hourAxisMoved(q(FH), body({ hourly: {} }), now) === false, 'A5c an unreadable body: splice tried as before');
process.env.NIGRAAN_SPLICE_AXIS_CHECK = '0'; ok(hourAxisMoved(q(FH), body(loc(18000, '2026-10-24T02:00')), now) === false, 'A5d NIGRAAN_SPLICE_AXIS_CHECK=0: splice tried as before'); delete process.env.NIGRAAN_SPLICE_AXIS_CHECK;
const SRC = process.env.OM_SRC && join(process.env.OM_SRC, 'Sources/App/Helper/ForecastapiQuery.swift');
if (SRC && existsSync(SRC)) ok(/start = \(\(currentTime\.timeIntervalSince1970 \+ utcOffset\) \/ dtSeconds\) \* dtSeconds/.test(readFileSync(SRC, 'utf8')), 'A6 the provider aligns an hour window to (now + utcOffset) / dt * dt');
else console.log('SKIP A6 (set OM_SRC to a clone of open-meteo/open-meteo at 5f11eaf)');
console.log((fail ? 'FAIL' : 'PASS') + ' sweepaxis.unit ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
