// A1 · point UTCI: outside the polynomial's validity (air >= 50 C or <= -50 C, wind >= 17 m/s) "not assessed", never the clipped value.
import { imp, ok, done } from './lib.mjs';
const P = await imp('server/api/pointengine.mjs');
ok(typeof P.comfortOf === 'function', 'comfortOf is exported for test');
const c = P.comfortOf || (() => ({}));
const hot = c(51.5, 20, 10);
ok(hot.utciShadeC === null && hot.utciClass === null && /not assessed: outside the UTCI range/.test(hot.utciNotAssessed || ''), '51.5 C: not assessed (was 49.1 Extreme, the 49.9 C value)', JSON.stringify(hot));
const gale = c(30, 40, 90);   // 25 m/s
ok(gale.utciShadeC === null && /not assessed/.test(gale.utciNotAssessed || ''), '90 km/h wind: not assessed (was the 16.9 m/s value)', JSON.stringify(gale));
const cold = c(-52, 50, 5);
ok(cold.utciShadeC === null && /not assessed/.test(cold.utciNotAssessed || ''), '-52 C: not assessed', JSON.stringify(cold));
const inR = c(35, 40, 10);
ok(typeof inR.utciShadeC === 'number' && inR.utciClass && !inR.utciNotAssessed, 'inside the range: value and class unchanged', JSON.stringify(inR));
const calm = c(20, 50, null);
ok(typeof calm.utciShadeC === 'number' && calm.utciCalmWind === true, 'no wind: the 0.5 m/s calm reference still applies');
done('A1-UTCI');
