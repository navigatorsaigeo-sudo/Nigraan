/* v91.17.100 · drought on CHIRPS v3 rainfall (tested against gauges first: station-lake/reports/drought_source_test.json).
   node nigraan-local/scripts/tests100/drought.test.mjs  (server running) */
import { readFileSync, existsSync } from 'node:fs';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 300) : '')); } };
const F = new URL('../../data/drought-chirps.json', import.meta.url);
ok(existsSync(F), 'data/drought-chirps.json present');
const C = JSON.parse(readFileSync(F, 'utf8'));
ok(/CHIRPS v3/.test(C.source) && /CC BY 4\.0/.test(C.source), 'source and licence stated');
ok(Object.keys(C.units).length >= 570, 'a record per tehsil (' + Object.keys(C.units).length + ')');
const age = (Date.now() - Date.parse(C.asOf + 'T00:00:00Z')) / 864e5;
ok(age <= 20, 'rain window is current (as of ' + C.asOf + ', ' + age.toFixed(1) + ' days)');
ok(Object.values(C.units).some(u => u.provisional) && Object.values(C.units).filter(u => u.provisional).length < 100, 'high valleys flagged provisional, not the whole country');
ok(existsSync(new URL('../../data/chirps-tehsil.npz', import.meta.url)), 'the tehsil pentad table the nightly update extends is present');
const r = await fetch(BASE + '/api/climatology/drought', { signal: AbortSignal.timeout(180000) }); const D = await r.json();
ok(D.ready && D.rainSource && D.rainSource.name === 'CHIRPS v3.0', 'drought table served on CHIRPS v3', JSON.stringify(D.rainSource).slice(0, 200));
const U = Object.values(D.spi || {});
ok(U.filter(u => u.rainSource === 'CHIRPS v3').length >= 560, 'units carry the CHIRPS indices');
ok(U.every(u => !u.rainSource || (u.era5 && 'spi90' in u.era5)), 'the ERA5 indices are kept beside them for the operator');
const prov = U.filter(u => u.drought && u.drought.provisional); ok(prov.length > 0 && prov.every(u => /high valley/.test(u.drought.provisionalWhy || '')), 'provisional units say why (' + prov.length + ')');
const isb = D.spi['Federal Capital|Islamabad|Islamabad'];
ok(isb && isb.spi90 && isb.spi90.mm > 500, 'Islamabad 90-day rain reads the monsoon it had (' + (isb && isb.spi90 && isb.spi90.mm) + ' mm; ERA5 read 302)');
console.log((fails ? 'FAIL' : 'PASS') + ' drought: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
