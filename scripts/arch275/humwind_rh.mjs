// v91.17.275 ARCH · the served mountain humidity step (server/api/humwind.mjs, data/humwind-model.json) evaluated on given rows, exactly as
// apply(): RH = clamp(round(rawRH + lgb([elev, lat, lon, UTC hour, month, rawRH])), 1, 100), only inside its domain (34.7-36.9 N,
// 71.4-76.6 E, 1000-5000 m; the caller passes mountain-zone rows). stdin: [[elev, lat, lon, utcHour, month, rawRH], ...]; stdout: [RH|null, ...]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lgbEval } from '../../server/api/natmodel.mjs';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const M = JSON.parse(readFileSync(join(APP, 'data', 'humwind-model.json'), 'utf8'));
const rows = JSON.parse(readFileSync(0, 'utf8'));
const inDomain = (lat, lon, elev) => lat >= 34.7 && lat <= 36.9 && lon >= 71.4 && lon <= 76.6 && elev != null && elev >= 1000 && elev <= 5000;
process.stdout.write(JSON.stringify(rows.map(([el, la, lo, h, mo, x]) => (x == null || !inDomain(la, lo, el)) ? null : Math.max(1, Math.min(100, Math.round(x + lgbEval(M.models.rh, [el, la, lo, h, mo, x])))))));
