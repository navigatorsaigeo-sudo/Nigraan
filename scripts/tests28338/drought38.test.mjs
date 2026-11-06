/* v91.17.283.38 item 9 · DROUGHT WITHOUT CLASSES: "drier than X % of past years" against each place's own record
   D1 the server serves drierThan (0-100) for the drought layer and its rain / soil / water views, only where the cell has a reading
      (never for a not-assessed cell), and the computation from what the server holds: rain 100 x (1 - Phi(SPI-3)), soil and water 100 - p
   D2 crops: no rank (the vegetation health index is not a rank against the place's own record): drierNa, never a rank, never Normal
   D3 the page: the key says "Drier than X % of past years", no Normal / Low / Moderate / High / Severe rows; the type buttons stay;
      the right panel names the rank; the class pills, the peak line and the High/Severe count are not shown
   usage: node scripts/tests28338/drought38.test.mjs [base] */
import { T, browser, open, BASE } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const g = (k) => fetch(BASE + '/api/levels?layer=' + k + '&day=0').then((r) => r.json());
const phi = (z) => { const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2); return z >= 0 ? (1 + y) / 2 : (1 - y) / 2; };
const A = await g('drought'), Rn = await g('drought_rain'), So = await g('drought_soil'), Cr = await g('drought_crops'), Wa = await g('drought_water');
for (const [k, x] of [['drought', A], ['drought_rain', Rn], ['drought_soil', So], ['drought_water', Wa]]) {
  const dt = x.drierThan || {}; const bad = Object.keys(dt).filter((u) => !(dt[u] >= 0 && dt[u] <= 100));
  ok(bad.length === 0, 'D1 ' + k + ': ' + Object.keys(dt).length + ' ranks in 0-100', bad.slice(0, 3));
  ok(k === 'drought' || Object.keys(dt).every((u) => x.levels[u] >= 0), 'D1 ' + k + ': a rank only where the cell has a reading'); }
ok(Object.keys(Rn.drierThan || {}).length > 0, 'D1 rain view ranked (' + Object.keys(Rn.drierThan || {}).length + ')');
/* the rain rank from the SPI held by the server (the operator view carries the score) */
const RnO = await fetch(BASE + '/api/levels?layer=drought_rain&day=0', { headers: { 'x-agn-view': 'operator' } }).then((r) => r.json());
const sc = RnO.scores || {}; const u0 = Object.keys(Rn.drierThan || {}).find((u) => sc[u] != null);
if (u0) ok(Math.abs(Rn.drierThan[u0] - Math.round(1000 * (1 - phi(+sc[u0]))) / 10) < 0.11, 'D1 rain rank = 100 x (1 - Phi(SPI)) at ' + u0, { spi: sc[u0], rank: Rn.drierThan[u0] });
ok(!Object.keys(Cr.drierThan || {}).length && Object.keys(Cr.drierNa || {}).length > 0, 'D2 crops: not available (no rank), ' + Object.keys(Cr.drierNa || {}).length + ' tehsils');
const br = await browser(); const o = await open(br, '/analyst#agnplace=30.19570,71.47530,Multan'); await o.pg.waitForTimeout(20000);
await o.pg.evaluate(() => { const s = document.getElementById('mapHazardPick'); s.value = 'drought'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await o.pg.waitForTimeout(6000);
const rd = () => o.pg.evaluate(() => ({ leg: (document.getElementById('v3legend') || {}).innerText || '', pane: (document.getElementById('agn31Layer') || {}).innerText || '', peak: (() => { const e = document.getElementById('agnPeakLine'); return e ? getComputedStyle(e).display : 'none'; })(), btns: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /^(All types|Meteorological|Agricultural · soil|Agricultural · crops|Hydrological)$/.test(t)) }));
let r = await rd();
ok(/Drier than X % of past years/.test(r.leg) && !/\b(Normal|Low|Moderate|High|Severe)\b\s*\d/.test(r.leg), 'D3 key: drier than X % of past years, no class rows', r.leg.slice(0, 260));
ok(r.btns.length === 5, 'D3 the five type buttons stay', r.btns);
ok(r.peak === 'none', 'D3 no "Today\'s peak" class line on drought');
ok(/drier than \d+ % of years|Not assessed|Not available/i.test(r.pane), 'D3 the right panel names the rank (or the state)', r.pane.slice(0, 300));
await o.pg.evaluate(() => AGN.droughtView.set('crops')); await o.pg.waitForTimeout(3000); r = await rd();
ok(/Not available/.test(r.leg) && !/\bNormal\b/.test(r.leg), 'D3 crops: "Not available", never Normal', r.leg.slice(0, 260));
ok(o.errs.length === 0, 'no page errors', o.errs.join(' | ')); await br.close(); done();
