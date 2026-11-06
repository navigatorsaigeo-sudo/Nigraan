// audit 1 · the AQI above the top breakpoint continues on the 301-500 slope (EPA-454/B-24-002, May 2024: Table 6 note 4, section VI);
// it is never capped at 500. PM2.5 400 ug/m3 -> 649; PM10 700 ug/m3 -> 607; the category stays Hazardous; the caveat says so.
import { imp, src, ok, done } from './lib.mjs';
const S = await imp('server/api/smog.mjs');
const epa = (c, lo, hi, ilo, ihi) => Math.round((ihi - ilo) / (hi - lo) * (c - lo) + ilo);
const a = S.aqiOf(400, null), b = S.aqiOf(null, 700), c = S.aqiOf(325.4, null), d = S.aqiOf(1000, 30);
ok(a && a.aqi === 649 && a.aqi === epa(400, 225.5, 325.4, 301, 500) && a.category === 'Hazardous', 'PM2.5 400 ug/m3 -> AQI 649 (the 301-500 slope), Hazardous', JSON.stringify(a));
ok(b && b.aqi === epa(700, 425, 604, 301, 500) && b.aqi > 500 && b.category === 'Hazardous', 'PM10 700 ug/m3 -> ' + epa(700, 425, 604, 301, 500) + ' (not 500)', JSON.stringify(b));
ok(c && c.aqi === 500, 'the top breakpoint itself is 500', JSON.stringify(c));
ok(d && d.aqi > a.aqi && d.pollutant === 'PM2.5', 'a higher concentration gives a higher index (no plateau)', JSON.stringify(d));
ok(!/printed as "500\+ \(beyond scale\)"/.test(src('server/api/smog.mjs')) && /continues on the slope of the 301-500 segment/.test(src('server/api/smog.mjs')), 'the caveat describes the extension, not a 500 cap');
done('A01-AQI');
