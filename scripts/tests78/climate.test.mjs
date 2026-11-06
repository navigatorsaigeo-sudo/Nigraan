/* v91.17.78 · C · climate normals refresh and land-reanalysis soil water / snow.
     node scripts/tests78/climate.test.mjs [baseUrl]        default http://127.0.0.1:8787
   A · data/climatology.json: percentiles on the operational normal 1996-2025 (WMO-No. 1203), SPI/SPEI fits still on the
       1991-2020 standard normal, provenance with the Copernicus attribution, the 2021-2025 exceedance check recorded and
       lower than under the previous table.
   B · data/outlook-event-climate.json on the same period, its percentiles reproducing data/climatology.json.
   C · the served thresholds name the period of the file, not a typed one.
   D · data/era5land-cells.json + data/era5land-climatology.json: every tehsil, 1996-2025, licence record (CC BY 4.0).
   E · data/era5land-recent.json (LEARN_ALL job "era5land"): the rolling window, fresh, every tehsil, licence record.
   F · the wetness record carries the land antecedent block, with no supplier name in it; no CDS key is served.
   PASS/FAIL lines; exit 1 on any FAIL. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv.slice(2).find(a => /^https?:/.test(a)) || 'http://127.0.0.1:8787';
const DATA = process.env.NIGRAAN_DATA_DIR || join(HERE, '..', '..', 'data');
let fails = 0, passes = 0;
const ok = (c, name, detail) => { if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' · ' + String(detail).replace(/\s+/g, ' ').slice(0, 300) : '')); };
const getJ = async (p) => { try { const r = await fetch(BASE + p, { headers: { 'Sec-Fetch-Site': 'same-origin' } }); return r.ok ? r.json() : null; } catch (_) { return null; } };
const readJ = (f) => { try { return JSON.parse(readFileSync(join(DATA, f), 'utf8')); } catch (_) { return null; } };
const SUP = /ERA5|ECMWF|Copernicus|Open-Meteo|PMD|NOAA|NASA/;

/* A */
const C = readJ('climatology.json');
ok(!!C && C.period === '1996-2025' && C.periods && C.periods.tx90 === '1996-2025' && C.periods.tn10 === '1996-2025' && C.periods.pr3_99 === '1996-2025', 'A1 percentiles on the operational normal 1996-2025', C && JSON.stringify(C.periods));
ok(!!C && C.periods && C.periods.spi === '1991-2020' && C.periods.spei === '1991-2020', 'A2 SPI/SPEI fits stay on the 1991-2020 standard normal (matches data/spi-pentad.json)');
ok(!!C && C.normal && /WMO-No\. 1203/.test(C.normal.reference), 'A3 the normal cites WMO-No. 1203 (2017)', C && C.normal && C.normal.reference);
ok(!!C && C.provenance && /Copernicus Climate Change Service information/.test(C.provenance.attribution) && /CC-BY-4\.0/.test(C.provenance.licence), 'A4 provenance carries the licence and the Copernicus attribution');
const U = C ? Object.values(C.units) : [];
ok(U.length >= 570 && U.every(u => u.tx90.length === 366 && u.tx90.every(x => x != null) && u.tn10.every(x => x != null)), 'A5 every tehsil has 366 non-null tx90 / tn10', U.length + ' units');
const ck = C && C.check;
ok(!!ck && ck.previous && ck.current && ck.previous.TX90p > ck.current.TX90p && ck.previous.TX90p > 10, 'A6 2021-2025 TX90p exceedance recorded and lower on the new normal', ck && ('TX90p ' + ck.previous.TX90p + ' % -> ' + ck.current.TX90p + ' %, TN90p ' + ck.previous.TN90p + ' -> ' + ck.current.TN90p));
ok(U.length > 0 && U.every(u => u.spi && u.spi.m90 && u.spi.m90.length === 12), 'A7 SPI fits present on every unit');

/* B */
const EVC = readJ('outlook-event-climate.json');
ok(!!EVC && C && EVC.period === C.periods.tx90, 'B1 event base rates on the same period as the percentiles', EVC && EVC.period);
if (EVC) { const ch = Object.values(EVC.units).map(u => u.checkVsClimatology && u.checkVsClimatology.maxAbsDiffC).filter(x => x != null);
  ok(ch.length > 400 && Math.max(...ch) <= 0.1, 'B2 its percentiles reproduce data/climatology.json', ch.length + ' units, max |diff| ' + Math.max(...ch)); }

/* C */
const th = await getJ('/api/climatology/thresholds');
ok(!!th && th.ready && typeof th.basis === 'string' && th.basis.startsWith(C ? C.period : '?'), 'C1 /api/climatology/thresholds names the period of the file', th && th.basis);

/* D */
const CE = readJ('era5land-cells.json'), CL = readJ('era5land-climatology.json');
ok(!!CE && Object.keys(CE.units).length >= 570 && Object.values(CE.units).every(u => u.cells.length >= 1), 'D1 every tehsil mapped to land-reanalysis cells', CE && (Object.keys(CE.units).length + ' units, ' + CE.nearestOnly + ' by nearest cell'));
ok(!!CL && CL.period === '1996-2025' && CL.years === 30 && Object.keys(CL.units).length >= 570, 'D2 soil/snow climatology 1996-2025 for every tehsil', CL && (CL.period + ', ' + Object.keys(CL.units).length + ' units'));
const lic = (x) => !!x && Array.isArray(x.licence) && x.licence.some(l => /CC BY 4\.0/.test(l.licence) && /Copernicus Climate Change Service information/.test(l.attribution)) && x.provenance && /10\.24381\/cds\.68d2bb30/.test(JSON.stringify(x.provenance));
ok(lic(CL), 'D3 licence record and CDS citation in the climatology file');
const vals = CL ? Object.values(CL.units).flatMap(u => u.rz.mean).filter(x => x != null) : [];
ok(vals.length > 6000 && Math.min(...vals) > 0 && Math.max(...vals) < 0.7, 'D4 root-zone monthly means physical (0 - 0.7 m3/m3)', vals.length ? Math.min(...vals) + '..' + Math.max(...vals) : 'none');

/* E */
const RE = readJ('era5land-recent.json');
const ageD = RE && RE.to ? (Date.now() - Date.parse(RE.to + 'T00:00:00Z')) / 864e5 : null;
ok(!!RE && Object.keys(RE.units).length >= 570 && RE.days >= 20, 'E1 rolling land-reanalysis window for every tehsil', RE ? RE.from + '..' + RE.to + ', ' + RE.days + ' days, ' + Object.keys(RE.units).length + ' units' : 'missing: run LEARN_ALL job era5land');
ok(ageD != null && ageD <= 21, 'E2 the window is fresh (last day within 21 days; the laptop job refreshes it)', ageD == null ? 'no file' : Math.round(ageD) + ' days old');
ok(lic(RE) || (RE && Array.isArray(RE.licence) && RE.licence.some(l => /CC BY 4\.0/.test(l.licence))), 'E3 licence record in the rolling file');

/* F */
const w = await getJ('/api/flood/wetness?unit=Islamabad');
const L = w && w.antecedentLand;
ok(!!L && (L.rootZonePct != null || L.snowWaterMm != null), 'F1 the wetness record carries the land antecedent block', L ? JSON.stringify({ through: L.through, rootZonePct: L.rootZonePct, snowWaterMm: L.snowWaterMm }) : (w ? 'no block' : 'no wetness record (the wetness job needs the paid key)'));
ok(!L || !SUP.test(JSON.stringify(L)), 'F2 no supplier name in the served block');
const k = await fetch(BASE + '/cds.key').then(r => r.status).catch(() => 0);
ok(k !== 200, 'F3 the CDS key file is not served', 'GET /cds.key -> ' + k);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
