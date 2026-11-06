import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.274 PLUVIAL · tests: Keti Bunder land cover, every other tehsil unchanged, client wording, seal, study outputs and the
   no-serve decision. node scripts/tests274pluv/pluvial.test.mjs [baseRoot]   (offline; no server needed; ~30 s)
   baseRoot default /tmp/claude-0/v273/srv_flood (the tree this one was copied from). */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const ROOT = __T.ROOT;   /* v283 WS7: URL.pathname gave /D:/... on Windows */
const BASE = (process.argv[2] && !/^https?:/.test(process.argv[2])) ? process.argv[2] : __T.needPath('NIGRAAN_CMP_TREE_V273', '/tmp/claude-0/v273/srv_flood', 'the v273 comparison tree') /* v276: a server URL (suite runner) is not a tree */;
const PAGE = join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), BPAGE = join(BASE, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html');
let pass = 0, fail = 0; const ok = (c, n, x) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); } };
const html = readFileSync(PAGE, 'utf8');
const KB = 'Sindh|Sujawal|Keti Bunder', NB = ['Sindh|Sujawal|Kharo Chan', 'Sindh|Sujawal|Jati', 'Sindh|Thatta|Ghorabari'];

/* 1 · the land-cover record */
const lcz = JSON.parse(html.match(/<script id="agn-lcz" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const rec = lcz.tehsils[KB];
ok(rec && rec.status === 'no_built_area' && /WorldCover/.test(rec.statusBasis || ''), 'Keti Bunder LCZ record: no_built_area with its measured basis', JSON.stringify(rec));
ok(Object.values(lcz.tehsils).every(r => r.status !== 'no_lcz_coverage'), 'no tehsil left without a land-cover record in agn-lcz');
const lc25 = JSON.parse(readFileSync(__T.needPath('NIGRAAN_LANDCOVER_2025', __T.uploads('NIGRAAN/nig/nigraan-local/data/landcover-2025-tehsil.json'), 'the uploaded landcover-2025-tehsil.json'), 'utf8')).units[KB];
ok(lc25 && lc25.worldcoverBuilt10m === 0 && lc25.footprintShare === 0, 'the basis holds in the source: WorldCover 10 m built 0 and no footprints for Keti Bunder', JSON.stringify(lc25));
const grid = JSON.parse(readFileSync(join(ROOT, 'data', 'lcz-grid.json'), 'utf8'));
ok(grid.tehsils[KB].status === 'no_built_area', 'server copy data/lcz-grid.json agrees');
const blcz = JSON.parse(readFileSync(BPAGE, 'utf8').match(/<script id="agn-lcz" type="application\/json">([\s\S]*?)<\/script>/)[1]);
ok(Object.keys(blcz.tehsils).filter(k => JSON.stringify(blcz.tehsils[k]) !== JSON.stringify(lcz.tehsils[k])).join() === KB, 'only Keti Bunder changed in agn-lcz');

/* 2 · the engine on the standard heavy storm (page in a Node VM) */
const probe = (page) => JSON.parse(execFileSync(process.execPath, [join(ROOT, 'scripts/tests274pluv/vmprobe.mjs'), page, [KB, ...NB].join(',')], { encoding: 'utf8', timeout: 300000 }).trim().split('\n').pop());
const A = probe(BPAGE), B = probe(PAGE);
ok(A[KB].flood_pluvial.level === 4 && /zone lookup fallback/.test(A[KB].flood_pluvial.rcBasis), 'base reproduces the defect: Keti Bunder Severe on the zone fallback', JSON.stringify(A[KB]));
ok(/^NSS/.test(B[KB].flood_pluvial.rcBasis), 'new: Keti Bunder runoff from the NSS chain', B[KB].flood_pluvial.rcBasis);
const nbS = NB.map(u => B[u].flood_pluvial.score), nbL = NB.map(u => B[u].flood_pluvial.level);
ok(B[KB].flood_pluvial.score >= Math.min(...nbS) - 2 && B[KB].flood_pluvial.score <= Math.max(...nbS) + 2 && nbL.includes(B[KB].flood_pluvial.level), 'new: Keti Bunder scores with its neighbours (' + B[KB].flood_pluvial.score + ' vs ' + nbS.join('/') + ')');
ok(!B[KB].nss_baseline.nd && !B[KB].nss_dynamic.nd, 'new: Keti Bunder retention layers have a value (were no data)', JSON.stringify(B[KB]));
ok(A[KB].nss_baseline.nd, 'base: Keti Bunder retention was no data');
ok(NB.every(u => JSON.stringify(A[u]) === JSON.stringify(B[u])), 'neighbours unchanged');

/* 3 · every other tehsil unchanged on both standard storms (scripts/flood273/land_storm.mjs, both pages) */
const storm = (root, page, out) => { execFileSync(process.execPath, [join(ROOT, 'scripts/flood273/land_storm.mjs'), root, out], { env: { ...process.env, NIGRAAN_ENGINE_ARTEFACT: page }, timeout: 600000 }); return JSON.parse(readFileSync(out, 'utf8')); };
const STO = __T.tmpDir('pluv274-');   /* v283 WS7: was /tmp/claude-0/v274/srv_pluv/data/pluv274 */
const sa = storm(ROOT, BPAGE, join(STO, 'land_storm_base.json')), sb = storm(ROOT, PAGE, join(STO, 'land_storm_new.json'));
const diff = Object.keys(sa).filter(u => JSON.stringify(sa[u]) !== JSON.stringify(sb[u]));
ok(Object.keys(sa).length === 576 && diff.join() === KB, '576 tehsils x 2 storms: only Keti Bunder differs', diff.join());

/* 4 · client wording */
const info = html.match(/flood:\{t:'Flood',w:'Risk of inundation[^\n]*?,l:'([^\n]*?)'\},?\n/);
ok(info && /rain-based screening level, not a flood observation/.test(info[1]), 'flood info panel states what the local-rain level is');
const note = html.match(/flood_pluvial:\{label:'[^']*', unit:'\/100',[\s\S]{0,200}?note:'([\s\S]*?)'\},/);
ok(note && /Rain-based screening, not a flood observation/.test(note[0]), 'local-rain layer note states it');
ok(info && !/\bPMD\b|\bFFD\b|\d+\s?%|AUC|hit rate/i.test(info[1] + (note ? note[0] : '')), 'client wording: no PMD/FFD names, no skill numbers');
ok(/var AGN_BAND_CUTS=\[\s*\{min:82, key:'severe'[\s\S]{0,80}\{min:65, key:'high'[\s\S]{0,80}\{min:45, key:'moderate'[\s\S]{0,80}\{min:25, key:'low'/.test(html), 'level cuts unchanged (no refit served)');
const bh = readFileSync(BPAGE, 'utf8'); const fr = (s) => s.match(/rainBands:\s*\{ value:\[[^\]]*\]/)[0] + s.match(/rainAnchors:\s*\{ value:\[[^\]]*\]/)[0];
ok(fr(html) === fr(bh), 'rain rungs and anchors unchanged');

/* 5 · seal and manifest */
const man = JSON.parse(readFileSync(join(ROOT, 'artefact', 'MANIFEST.json'), 'utf8'));
const sha = createHash('sha256').update(readFileSync(PAGE)).digest('hex');
ok(JSON.stringify(man).includes(sha), 'MANIFEST holds the page sha256');
const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/i) || html.match(/content="([^"]*script-src[^"]*)"/);
const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(m => !/\bsrc=/.test(m[1]) && !/application\/json/.test(m[1]));
const miss = blocks.filter(m => !csp[1].includes("'sha256-" + createHash('sha256').update(m[2], 'utf8').digest('base64') + "'")).length;
ok(csp && miss === 0, 'every inline script hashed in the CSP (' + blocks.length + ' blocks)', miss + ' unsealed');

/* 6 · study outputs and the decision */
/* v91.17.276 · the analysis records ship in _admin/docs/v274/pluv (the integration left data/pluv274 out); either place */
const PV = (f) => existsSync(join(ROOT, 'data/pluv274', f)) ? join(ROOT, 'data/pluv274', f) : join(ROOT, '_admin/docs/v274/pluv', f);
const gv = JSON.parse(readFileSync(PV('gauge-verify.json'), 'utf8'));
const rg = JSON.parse(readFileSync(PV('refit-gate.json'), 'utf8')), rgf = JSON.parse(readFileSync(PV('refit-gate_front.json'), 'utf8'));
ok(gv.served.main_even.tehsilDays > 1000 && gv.served.main_even['gauge>=20mm/h'].events > 50, 'gauge verification holds > 1000 tehsil-days and > 50 events at 20 mm/h');
const passAll = (o) => ['periods', 'regions'].every(s => ['1', '2', '3'].every(k => o[s].gate[k].pass));
const anyLevelBoth = ['1', '2', '3'].some(k => ['A_rainDrive', 'B_servedScore'].some(c => [rg, rgf].every(o => ['periods', 'regions'].every(s => o[c][s].gate[k].pass))));
ok(!anyLevelBoth, 'no refit level passes both held-out splits under both bounds of the forecast hour -> nothing served (consistent with the page)');
ok(!/pluvRefit|NIGRAAN_PLUV/.test(html), 'no refit code shipped in the page');
console.log(`\n${pass} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0);
