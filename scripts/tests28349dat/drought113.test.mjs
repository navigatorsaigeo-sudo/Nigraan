// v91.17.283.49 · 1.0.10 data item 2 · "Drought index not defined (arid climate) · SPI-90 1.02 · 865.2 mm in 90 days" for Islamabad.
// Root cause: NOT the arid mask. The site screening row (siterisk.mjs) took its level from levelOfScore(drought.score); the drought class has
// carried score: null since v283.36 (the USDM category of the index, no score knots), so EVERY tehsil with a drought record fell through to
// the "index not defined (arid climate)" text. The arid mask itself (the window's 1991-2020 CHIRPS mean under 10 mm) flags 10 tehsils this
// month, all Koppen-Geiger B (Beck et al. 2023, 1 km, 1991-2020); Islamabad is Cwa, never arid in any month.
// Checks: (1) the map's drought cell of a tehsil (hazsci droughtAt) for Islamabad = Normal, SPI-3 1.02 on the laptop data; (2) the site
// screening row uses that cell (one rule with the map), names the index SPI-3; (3) every tehsil: the row's answer = the map's cell, and the
// arid state only where the mask fires; (4) with a server (BASE), the I-8 site screening row reads Normal, SPI-3 1.02.
// Fails on 1.0.9 (no droughtAt; the row reads the dead score). usage: node scripts/tests28349dat/drought113.test.mjs [base url] [laptop data dir]
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const end = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
const imp = (rel) => import(pathToFileURL(join(APP, rel)).href);
const BASE = process.argv.slice(2).find((a) => /^https?:/.test(a)) || null;
const LD = [process.argv.slice(2).find((a) => !/^https?:/.test(a)), '/mnt/user-data/uploads/NIGRAAN/nig/nigraan-local/data', join(APP, 'data')].find((d) => d && existsSync(join(d, 'drought-chirps.json')));
const ISB = 'Federal Capital|Islamabad|Islamabad';
const { createHazSci } = await imp('server/api/hazsci.mjs');
const HS = createHazSci({}, { dataDir: LD });
ok(typeof HS.droughtAt === 'function', 'hazsci serves the map\'s drought cell of a tehsil (droughtAt)');
if (typeof HS.droughtAt !== 'function') end();
const CH = JSON.parse(readFileSync(join(LD, 'drought-chirps.json'), 'utf8'));
const c = HS.droughtAt(ISB);
const v = CH.units[ISB].monthly.month.spi3;
ok(c.L === 0 && c.facts && c.facts.spi3 === v.value && !v.arid, 'Islamabad: the map\'s cell is Normal on SPI-3 ' + v.value + ' (' + v.mm + ' mm, normal ' + v.climMm + ' mm), not arid', JSON.stringify({ L: c.L, spi3: c.facts && c.facts.spi3 }));
const SR = readFileSync(join(APP, 'server/api/siterisk.mjs'), 'utf8');
ok(!/lv = levelOfScore\(t\.drought\.score\)/.test(SR) && /app\.hazSci\.droughtAt\(u\.unitId\)/.test(SR) && /' · SPI-3 '/.test(SR), 'the site screening row reads the map\'s cell (no dead score) and names SPI-3');
/* every tehsil: the state is the map's; arid only where the window's climatological mean is under the floor */
const states = {}; let aridOk = 0, aridBad = [];
for (const uid of Object.keys(CH.units)) { const x = HS.droughtAt(uid); states[x.L] = (states[x.L] || 0) + 1; const m = CH.units[uid].monthly && CH.units[uid].monthly.month && CH.units[uid].monthly.month.spi3;
  if (x.L === -2) { if (m && m.arid && m.climMm < 10) aridOk++; else aridBad.push(uid); } }
ok(aridBad.length === 0 && aridOk > 0, 'arid state only where the mask fires (' + aridOk + ' tehsils, window normal under 10 mm)', aridBad.join(', '));
ok(Object.entries(states).filter(([k]) => +k >= 0).reduce((a, [, n]) => a + n, 0) >= 500, 'most tehsils carry a drought level now (states ' + JSON.stringify(states) + ')');
/* the Koppen-Geiger cross-check of the arid mask, when its result is held (build/v113/drought_koppen_576.json) */
const KF = join(APP, 'build', 'v113', 'drought_koppen_576.json');
if (existsSync(KF)) { const K = JSON.parse(readFileSync(KF, 'utf8')); const notB = K.rows.filter((r) => r.nowArid && r.aridShare < 0.5);
  ok(notB.length === 0, 'every tehsil flagged arid this month is Koppen-Geiger B (arid) on Beck et al. 2023', notB.map((r) => r.uid).join(', '));
  const isb = K.rows.find((r) => r.uid === ISB); ok(isb && isb.koppen === 'Cwa' && isb.aridMonths.length === 0, 'Islamabad: Cwa, ' + (isb && isb.annualMm) + ' mm a year (CHIRPS 1991-2020), arid in no month'); }
if (BASE) {
  const B = await (await fetch(BASE + '/api/point?lat=33.66443&lon=73.08339&parts=siteScreening&complete=1', { headers: { 'x-agn-view': 'customer' } })).json();
  const row = ((B.parts && B.parts.siteScreening && B.parts.siteScreening.v && B.parts.siteScreening.v.rows) || []).find((r) => /^Drought/.test(r.parameter));
  ok(row && /^Normal · SPI-3 1\.02/.test(row.values) && row.verdict === 'Normal' && !/arid/i.test(row.values), 'server: I-8 site screening reads "' + (row && row.values) + '"');
}
end();
