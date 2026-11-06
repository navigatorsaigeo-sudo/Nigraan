// C11 · an AQ day with fewer than 18 of 24 hours of PM2.5 has no daily mean, AQI or class ("not assessed"); a complete day is unchanged.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imp, ok, done } from './lib.mjs';
const { createSmog } = await imp('server/api/smog.mjs');
const dir = mkdtempSync(join(tmpdir(), 'c11-'));
process.env.NIGRAAN_PMC = '0'; process.env.NIGRAAN_PMN = '0';
const S = createSmog({ dataDir: dir }, dir);
const time = [], pm = [], pm10 = [];
for (let h = 0; h < 24; h++) { time.push('2026-11-01T' + String(h).padStart(2, '0') + ':00'); pm.push(80); pm10.push(150); }
for (let h = 0; h < 5; h++) { time.push('2026-11-02T' + String(h).padStart(2, '0') + ':00'); pm.push(300); pm10.push(400); }
const aq = { time, pm2_5: pm, pm10, us_aqi: pm.map(() => null), dust: pm.map(() => 10) };
const met = { time, boundary_layer_height: time.map(() => 500), wind_speed_10m: time.map(() => 3), wind_direction_10m: time.map(() => 90), relative_humidity_2m: time.map(() => 60), temperature_2m: time.map(() => 15), temperature_925hPa: time.map(() => 10), visibility: time.map(() => 5000) };
const D = S._dailies({ unitId: 'x', lat: null, lon: null, elevM: 200 }, aq, met);
const d1 = D.find((d) => d.date === '2026-11-01'), d2 = D.find((d) => d.date === '2026-11-02');
ok(d1 && d1.pm25 === 80 && d1.aqi != null && d1.pmClass != null && !d1.aqNotAssessed, 'complete day: mean, AQI and class as before', JSON.stringify({ pm: d1 && d1.pm25, aqi: d1 && d1.aqi }));
ok(d2 && d2.pm25 == null && d2.aqi == null && d2.pmClass == null && d2.smogDay == null, 'C11: a 5-hour day has no mean, AQI or class', JSON.stringify({ pm: d2 && d2.pm25, aqi: d2 && d2.aqi, cls: d2 && d2.pmClass }));
ok(d2 && /not assessed: 5 of 24 hours of PM2\.5/.test(d2.aqNotAssessed || ''), 'C11: the day says not assessed, with the hours', d2 && d2.aqNotAssessed);
rmSync(dir, { recursive: true, force: true });
done('C11-AQDAY');
