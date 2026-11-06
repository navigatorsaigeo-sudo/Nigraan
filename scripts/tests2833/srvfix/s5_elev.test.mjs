// S5 · thunderstorm and fog chance at an UNKNOWN elevation: null (not the 0 m plains zone); a known height still answers.
import { join } from 'node:path';
import { imp, ok, done, TREE } from './lib.mjs';
const { createWxHaz } = await imp('server/api/wxhaz.mjs');
const W = createWxHaz({ dataDir: join(TREE, 'data') });
const time = [], H = { time, cape: [], lifted_index: [], convective_inhibition: [], precipitation: [], weather_code: [], cloud_cover_low: [], relative_humidity_2m: [], temperature_2m: [], wind_speed_10m: [], visibility: [], dew_point_2m: [] };
for (let h = 0; h < 48; h++) { time.push(new Date(Date.UTC(2026, 6, 10, h)).toISOString().slice(0, 16)); H.cape.push(1500); H.lifted_index.push(-4); H.convective_inhibition.push(-10); H.precipitation.push(1); H.weather_code.push(95); H.cloud_cover_low.push(40); H.relative_humidity_2m.push(70); H.temperature_2m.push(32); H.wind_speed_10m.push(5); H.visibility.push(10000); H.dew_point_2m.push(25); }
const known = W.tsChance(H, 31.5, 74.3, 210, { force: true }), unk = W.tsChance(H, 31.5, 74.3, null, { force: true }), unkU = W.tsChance(H, 31.5, 74.3, undefined, { force: true });
ok(Array.isArray(known) && known.length > 0 && known.every((d) => Number.isFinite(d.chance)), 'known height (210 m): thunderstorm chance answered');
ok(unk === null && unkU === null, 'S5: unknown height -> null (not the 0 m zone)', JSON.stringify(unk && unk[0]));
ok(W.fogChance(H, 31.5, 74.3, null, { force: true }) === null, 'S5: fog chance at unknown height -> null');
done('S5-ELEV');
