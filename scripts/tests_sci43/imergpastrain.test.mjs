/* sci43 · B1b hook tests: node scripts/tests_sci43/imergpastrain.test.mjs */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path'; import { tmpdir } from 'node:os';
import { imergRain5, IMERG_RAIN5_BASIS } from '../../server/api/imergpastrain.mjs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const d = mkdtempSync(join(tmpdir(), 'sci43-')); mkdirSync(join(d, 'imerg', 'pkt'), { recursive: true });
const scope = JSON.parse(readFileSync(new URL('../../data/imerg-past-rain.json', import.meta.url))); writeFileSync(join(d, 'imerg-past-rain.json'), JSON.stringify(scope));
const uid = Object.keys(scope.units)[0], other = 'Punjab|Lahore|Lahore City';
for (const [t, v] of [['2026-10-27', 1.2], ['2026-10-28', 0], ['2026-10-29', 3.4], ['2026-10-30', 0.5], ['2026-10-31', 0]]) writeFileSync(join(d, 'imerg', 'pkt', t + '.json'), JSON.stringify({ date: t, units: {}, points: { [uid]: v } }));
ok(imergRain5(d, uid, '2026-11-01', {}) === null, 'switch off -> null (1.0.6 behaviour)');
ok(imergRain5(d, uid, '2026-11-01', { NIGRAAN_IMERG_PAST_RAIN: '0' }) === null, 'switch 0 -> null');
const on = { NIGRAAN_IMERG_PAST_RAIN: '1' }, r = imergRain5(d, uid, '2026-11-01', on);
ok(r && r.mm === 5.1 && r.days === 5 && r.daily.length === 5 && r.basis === IMERG_RAIN5_BASIS && r.source === 'imerg-late', 'switch on -> 5-day IMERG sum');
ok(imergRain5(d, other, '2026-11-01', on) === null, 'tehsil outside the tested scope -> null');
ok(imergRain5(d, uid, '2026-11-02', on) === null, 'a missing day -> null (never mixed with model days)');
writeFileSync(join(d, 'imerg', 'pkt', '2026-10-29.json'), JSON.stringify({ date: '2026-10-29', units: {} }));
ok(imergRain5(d, uid, '2026-11-01', on) === null, 'an old day file without points -> null');
console.log(`imergpastrain: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
