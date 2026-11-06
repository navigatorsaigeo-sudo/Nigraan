/* v91.17.98 · seismic: BCP SP-2007 Table 2.2 zones for every unit, BCP 2021 Ss / S1 / SDC at a point, no terrain proxy.
   node nigraan-local/scripts/tests98/seismic.test.mjs  (server running) */
import { readFileSync } from 'node:fs';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 300) : '')); } };
const get = async p => { const r = await fetch(BASE + p); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, json: j }; };
const D = f => JSON.parse(readFileSync(new URL('../../data/' + f, import.meta.url)));

/* 1 · the code table and the crosswalk */
const Z = D('seismic-bcp2007.json');
const csv = readFileSync(new URL('../../data/bcp-sp2007-table2-2.csv', import.meta.url), 'utf8').trim().split('\n').slice(1);
ok(csv.length === 446, 'Table 2.2 transcription has 446 rows (445 zoned + Talhar)', csv.length);
const dists = Object.entries(Z.districts);
ok(dists.length === 163 && dists.every(([, v]) => ['1', '2A', '2B', '3', '4'].includes(v.bcp2007_zone)), 'every one of 163 districts has a code zone (1/2A/2B/3/4)', dists.filter(([, v]) => !v.bcp2007_zone).map(([d]) => d).join(','));
ok(Object.values(Z.tehsils).every(t => t.bcp2007_zone), 'every tehsil has a code zone');
ok(!Z.unplaced2007.length, 'every 2007 row is placed on a current district', Z.unplaced2007.join(','));
const want = { Lahore: '2A', Faisalabad: '2A', Multan: '2A', Bahawalpur: '2A', Islamabad: '2B', Muzaffarabad: '4', Quetta: '3', Peshawar: '2B', 'South Karachi': '2B' };
for (const [d, z] of Object.entries(want)) ok(Z.districts[d] && Z.districts[d].bcp2007_zone === z, d + ' is zone ' + z + ' (Table 2.2)', Z.districts[d] && Z.districts[d].bcp2007_zone);
ok(Z.districts.Rawalpindi.bcp2007_zone === '3' && Z.districts.Rawalpindi.range.join('-') === '2B-3', 'Rawalpindi district: highest of its tehsils (Murree, Kotli Sattian zone 3), range 2B-3 kept');
ok(/SP-2007|Seismic Provisions 2007/.test(Z.source) && Z.field === 'bcp2007_zone', 'stored as bcp2007_zone with the 2007 source');

/* 2 · the 2021 grid */
const G = D('seismic-bcp2021.json');
ok(G.maps.ss && G.maps.s1 && /1613\.2\.1/.test(G.source), 'BCP 2021 Ss and S1 grids carry the Section 1613.2.1 source');
ok(G.checks.ss.onMapLineWithin1px >= 0.9 && G.checks.s1.onMapLineWithin1px >= 0.9, 'georeferencing: >= 90% of province-line vertices on the map\'s own lines', JSON.stringify(G.checks));

/* 3 · the point API */
const I = await get('/api/seismic/point?lat=33.69&lon=73.05');
const b = I.json && I.json.bcp2021;
ok(I.status === 200 && I.json.bcp2007 && I.json.bcp2007.zone === '2B', 'Islamabad point: BCP 2007 legacy zone 2B');
ok(b && b.ss_g > 0 && b.s1_g > 0 && b.siteClassAssumed === true && b.siteClass === 'D' && ['A', 'B', 'C', 'D', 'E', 'F'].includes(b.seismic_design_category), 'Islamabad point: Ss, S1, default Site Class D said, an SDC', JSON.stringify(b).slice(0, 300));
ok(b && Math.abs(b.sds_g - (2 / 3) * b.fa * b.ss_g) < 0.01, 'SDS = 2/3 Fa Ss');
const C = await get('/api/seismic/point?lat=33.69&lon=73.05&siteClass=B&risk=IV');
ok(C.json && C.json.bcp2021.fa === 0.9 && C.json.bcp2021.siteClassAssumed === false && C.json.bcp2021.riskCategory === 'IV', 'site class and risk category given: used and not flagged as assumed');
const L = await get('/api/seismic/point?lat=31.55&lon=74.34');
ok(L.json && L.json.bcp2007.zone === '2A' && L.json.bcp2021.ss_g <= 0.8, 'Lahore point: zone 2A, low Ss');
const X = await get('/api/seismic/point?lat=28&lon=90');
ok(X.status === 404, 'outside Pakistan: refused, not guessed');
const Q = await get('/api/seismic/point?lat=abc&lon=1');
ok(Q.status === 400, 'bad input: 400');
const U = await get('/api/seismic/units');
ok(U.status === 200 && Object.keys(U.json.districts).length === 163, 'units table served');

/* 4 · the page: no terrain proxy, data-driven table */
const page = readFileSync(new URL('../../artefact/AI_GEO_NIGRAAN_v91_17_MACH.html', import.meta.url), 'utf8');
ok(!/__SEISMIC_PROXY===true/.test(page) && !/basis='terrain proxy \(no BCP zone\)'/.test(page), 'page: terrain-elevation seismic proxy removed');
ok(!/hand-entered for 92 of 164/.test(page), 'page: no "92 of 164 districts" text left');
ok(/"classWords"/.test(page) && !/\/\*__SEISMIC_UNITS__\*\/null/.test(page), 'page: seismic unit table inlined at build');
console.log((fails ? 'FAIL' : 'PASS') + ' seismic: ' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
