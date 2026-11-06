/* v91.17.283.28 . S4 · DAILY EXTREMES NEED ALL DAYTIME (MAX) OR NIGHT (MIN) HOURS, offline:
     E1  dayext.mjs: daytime at Islamabad on 28 Oct is the hours with the sun above -0.833 deg (07-17 PKT; sunrise about 06:23, sunset 17:21)
     E2  place record: a day missing its 14:00 temperature: Tmax, feels max and UTCI max null with the reason (hours held), Tmin served
     E3  a day missing its 03:00 values: Tmin and UTCI min null with the reason, Tmax served
     E4  a day missing its 14:00 wind/gust: wind and gust max null with the reason
     E5  a complete day: every extreme served (as before); the day carries its sunrise and sunset
     E6  the asset limits (limits.mjs) read the same rule for members and for the verification day
   usage: node scripts/tests28328/dayextremes.unit.test.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 500) : '')); } };
const DX = await import(pathToFileURL(join(API, 'dayext.mjs')).href);
const dn = DX.dayNight(33.6844, 73.0479, '2026-10-28');
ok(dn.day[0] === 7 && dn.day[dn.day.length - 1] === 17 && dn.sunrise === '06:23' && /^17:2/.test(dn.sunset), 'E1 daytime computed at the point', dn);
const PS = await import(pathToFileURL(join(API, 'pointstate.mjs')).href);
const T0 = Date.parse('2026-10-28T00:00:00Z');
const mk = (q) => { const n = Number(new URLSearchParams(q).get('forecast_days')) * 24; const H = { time: [], temperature_2m: [], relative_humidity_2m: [], wind_speed_10m: [], wind_gusts_10m: [], apparent_temperature: [], precipitation: [] };
  for (let i = 0; i < n; i++) { const t = new Date(T0 + i * 3600e3).toISOString().slice(0, 16), h = i % 24, day = Math.floor(i / 24);
    H.time.push(t); const T = 15 + 10 * Math.sin((h - 8) / 24 * 2 * Math.PI);
    const missT = (day === 1 && h === 14) || (day === 2 && h === 3); const missW = day === 3 && h === 14;
    H.temperature_2m.push(missT ? null : T); H.relative_humidity_2m.push(40); H.wind_speed_10m.push(missW ? null : 10 + h); H.wind_gusts_10m.push(missW ? null : 20 + h); H.apparent_temperature.push(missT ? null : T + 1); H.precipitation.push(0); }
  return { hourly: H }; };
const app = { places: { pointRow: () => ({ administered: true, elevM: 500 }) } };
const S = PS.createPointState(app, { now: () => Date.parse('2026-10-28T05:00:00Z'), dataDir: join(ROOT, 'data'), fetchPx: async (q) => [mk(q)] });
const r = await S.state(33.6844, 73.0479, { noBuild: true }); const D = Object.fromEntries(r.days.map((d) => [d.date, d]));
const d1 = D['2026-10-29'], d2 = D['2026-10-30'], d3 = D['2026-10-31'], d0 = D['2026-10-28'];
/* v91.17.283.31 · owner 3.2 supersedes the daytime / night part rule: a daily high or low needs all 24 hours (completeness.mjs) */
ok(d1 && d1.tmaxC === null && /held for 23 of the 24 hours/.test(d1.tmaxWhy) && d1.feelsMaxC === null && d1.feelsMaxWhy && d1.heat.utciMaxC === null && d1.heat.assessed === false && d1.tminC === null && /23 of the 24/.test(d1.tminWhy), 'E2 (v283.31) a missing hour: no maximum and no minimum, the reason given', d1);
ok(d2 && d2.tminC === null && d2.tmaxC === null && d2.cold.assessed === false && d2.heat.assessed === false, 'E3 (v283.31) a missing night hour: no minimum and no maximum', d2);
ok(d3 && d3.windMaxKmh === null && d3.gustMaxKmh === null && d3.windMaxWhy && d3.gustMaxWhy && d3.tmaxC != null, 'E4 a missing daytime wind hour: no wind or gust maximum', d3);
ok(d0 && d0.tmaxC != null && d0.tminC != null && d0.windMaxKmh === 33 && d0.gustMaxKmh === 43 && d0.heat.assessed && d0.cold.assessed && d0.sun && d0.sun.sunrise === '06:23' && !d0.tmaxWhy, 'E5 a complete day: every extreme and its sunrise/sunset', d0);
const L = readFileSync(join(API, 'limits.mjs'), 'utf8');
ok(/dayNight\(E\.gridLat, E\.gridLon, d\)/.test(L) && /dayNight\(T\.lat, T\.lon, date\)/.test(L), 'E6 the asset limits read the one rule');
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
