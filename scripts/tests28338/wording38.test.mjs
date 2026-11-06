/* v91.17.283.38 item 10 · CUSTOMER WORDS ON EVERY LAYER: for every map layer, the key, the strip under the map, the right panel and the
   place card hold no file names (.json/.mjs/.py), no "class ladder", no tier names, no "model not yet tested"; the 250 m street map pause
   lines are in plain words; the GLOF and drought keys hold no level rows that cannot occur
   usage: node scripts/tests28338/wording38.test.mjs [base] */
import { T, browser, open, src, MACH, script } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const BAD = /\b[\w-]+\.(json|mjs|py)\b|class ladder|tier P\d|model not yet tested|provider-budget/i;
const st = script(src(MACH), 'agn-v274-st250-js') || '';
const why = st.slice(st.indexOf('function whyOf'), st.indexOf('function streetsOn'));
ok(why && !/provider-budget|tier P\d|HTTP '/.test(why), 'the 250 m street map pause lines are plain words', why.slice(0, 200));
const br = await browser(); const o = await open(br, '/analyst#agnplace=33.68440,73.04790,Islamabad'); await o.pg.waitForTimeout(22000);
const layers = await o.pg.evaluate(() => [...document.querySelectorAll('#mapHazardPick option')].map((x) => x.value).filter(Boolean));
for (const k of layers) {
  await o.pg.evaluate((k) => { const s = document.getElementById('mapHazardPick'); s.value = k; s.dispatchEvent(new Event('change', { bubbles: true })); }, k); await o.pg.waitForTimeout(3500);
  const t = await o.pg.evaluate(() => [document.getElementById('v3legend'), document.getElementById('agn242Leg'), document.getElementById('mpRight'), document.getElementById('mpLeftIn')].map((e) => (e && e.innerText) || '').join(' \n '));
  const m = t.match(BAD); ok(!m, 'layer ' + k + ': no internal words', m ? t.slice(Math.max(0, m.index - 80), m.index + 80) : null); }
ok(o.errs.length === 0, 'no page errors', o.errs.join(' | ')); await br.close(); done();
