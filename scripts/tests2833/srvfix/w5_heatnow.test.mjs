// W5 · nearby list: the heat index comes from the corrected hourly row shown as the temperature (hourly[kH]), not the uncorrected current.
import { src, lift, ok, done } from './lib.mjs';
import { imp } from './lib.mjs';
const S = src('server/api/index.mjs'); const t = lift(S, 'heatNow');
ok(!!t, 'heatNow found');
const HI = await imp('server/api/heatindex.mjs');
const heatIndexC = HI.heatIndexC, heatIndexDetail = HI.heatIndexDetail, HIC = [{ fromC: 26.7, label: 'Caution', id: 1 }, { fromC: 32.2, label: 'Extreme caution', id: 2 }, { fromC: 39.4, label: 'Danger', id: 3 }, { fromC: 51.7, label: 'Extreme danger', id: 4 }];
const heatNow = new Function('heatIndexC', 'heatIndexDetail', 'HIC', t + '\nreturn heatNow;')(heatIndexC, heatIndexDetail, HIC);
const L = { current: { temperature_2m: 40, relative_humidity_2m: 60 }, hourly: { time: ['2026-10-22T14:00'], temperature_2m: [33], relative_humidity_2m: [40] } };
const a = heatNow(L, 0), b = heatNow(L, -1);
ok(a.heatIndexC === heatIndexC(33, 40) && a.rh === 40, 'W5: with the hour present the index is from the corrected row (33 C, 40 %)', JSON.stringify(a));
ok(b.heatIndexC === heatIndexC(40, 60), 'W5: without the hour, the current block as before');
ok(/\.\.\.heatNow\(L, kH\)/.test(S), 'W5: the list passes the shown hour');
done('W5-HEATNOW');
