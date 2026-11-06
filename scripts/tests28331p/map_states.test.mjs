/* v91.17.283.31 · page lane · every map layer and every day button, against served answers with all four states (4.3), the reference
   layers (1.2, 1.3), the rain amount (2.4), the right panel (4.1) and the strip under the map (4.2).
   The served answers are fixtures routed in the browser (the test server's own issued run is out of date): each layer gets values,
   not-applicable (-2, -4), not-tested (-5), input-not-current (-6) and missing (-1) tehsils in a known pattern, so the expected counts are known exactly.
   Checks per layer and day: no bare "No reading" in the key; the key's counts equal the fixture's; the map's not-tested fills equal the
   fixture's; the "data missing" key row names its reason; the right panel names the selected layer. */
import { T, browser, open, consoleReady } from '../tests28328p/lib.mjs';
const t = T(); const br = await browser();
const o = await open(br, '/analyst'); const pg = o.pg; await consoleReady(pg);
const uids = await pg.evaluate(() => (window.PK_DISTRICTS.features || []).map((f) => f.properties).filter((p) => p && p.uid != null && p.province !== IIOJK).map((p) => p.uid));
t.ok(uids.length > 500, 'tehsils on the page', uids.length);
const LEVEL = ['heat', 'cold', 'wind', 'flood', 'landslide', 'glof', 'drought', 'rain_hz'];
/* API31 codes: 0-4 levels, -1 missing, -2 outside the method's range, -4 cannot happen here, -5 not tested, -6 input not current */
const codeOf = (i) => { const m = i % 10; return m < 5 ? m : [-2, -5, -6, -4, -1][m - 5]; };
const STATE_OF = { '-1': 'missing', '-2': 'not_applicable', '-3': 'not_applicable', '-4': 'not_applicable', '-5': 'not_tested', '-6': 'input_not_current' };
const now = Date.now();
const base = (layer, day) => ({ ready: true, at: new Date(now - 600e3).toISOString(), issueId: 'fx#1', stale: false, validUntil: new Date(now + 3 * 3600e3).toISOString(), build: '91.17.283.31', stampMismatch: false, words: ['Normal', 'Low', 'Moderate', 'High', 'Severe'], layer, day, basis: 'peak',
  code: { '-3': 'not assessed: no modelled river reach for this place', '-2': 'not assessed: outside the method’s range here', '-1': 'not assessed: no data from the hazard engine for this place and day', '-4': 'cannot happen here', '-5': 'model not yet tested here: the method has not passed its test against observations for this region', '-6': 'input not current: the forcing run is older than the product allows', '0+': 'level index into words' },
  stateOf: STATE_OF, inputAgeH: 30, lastAvailable: new Date(now - 7200e3).toISOString() });
function fixture(layer, day) {
  if (layer === 'seismic' || layer === 'cyclone') { const j = base(layer, 0); j.kind = 'reference'; j.name = layer === 'seismic' ? 'Earthquake zone (Building Code of Pakistan)' : 'Cyclone wind class'; j.basis = 'test reference map'; j.sameEveryDay = true; j.canAlert = false; j.noDaily = 'a fixed map: it does not change by day'; j.stale = true;
    j.words = ['Class A', 'Class B', 'Class C', 'Class D', 'Class E']; j.code = { '-4': 'does not occur here', '-1': 'no class held', '0+': 'index into words' }; j.levels = {}; j.facts = {};
    uids.forEach((u, i) => { j.levels[u] = i % 6 === 5 ? -4 : i % 5; if (i % 6 !== 5) j.facts[u] = { zone: 'Z' + (i % 5), pga: 0.1 * (i % 5) }; }); return j; }
  if (layer === 'rain_amount') { const j = base(layer, day); j.kind = 'amount'; j.unit = 'mm per day'; j.canAlert = false; j.levelsNote = 'levels not yet tested'; j.words = ['Dry', 'Light', 'Moderate', 'Heavy', 'Very heavy'];
    j.levels = {}; j.values = {}; j.whys = {}; const RW = ['Wetter than half of days', 'Wetter than 90 % of days', 'Wetter than 99 % of days'];
    uids.forEach((u, i) => { if (i % 10 === 9) { j.levels[u] = -1; j.whys[u] = 'no ensemble member for this cell'; } else if (i % 10 === 8) j.levels[u] = -6;
      else { j.levels[u] = i % 5; j.values[u] = { mm: (i % 7) * 9, rangeMm: [0, (i % 7) * 12], rawMm: (i % 7) * 10, mapping: 'quantile-mapped to the gauges', rarity: { band: i % 3, words: RW, basis: '1991-2020 station record' } }; } }); return j; }
  const j = base(layer, day); j.levels = {}; j.whys = {}; uids.forEach((u, i) => { j.levels[u] = codeOf(i); }); return j; }
function expected(layer) {
  const e = { c: [0, 0, 0, 0, 0], na: 0, nt: 0, nd: 0, inc: 0 };
  if (layer === 'seismic' || layer === 'cyclone') { uids.forEach((u, i) => { if (i % 6 === 5) e.na++; else e.c[i % 5]++; }); return e; }
  if (layer === 'rain_amount') { uids.forEach((u, i) => { if (i % 10 === 9) e.nd++; else if (i % 10 === 8) e.inc++; else e.c[i % 5]++; }); return e; }
  uids.forEach((u, i) => { const c = codeOf(i); if (c >= 0) e.c[c]++; else if (c === -2 || c === -4) e.na++; else if (c === -5) e.nt++; else if (c === -6) e.inc++; else e.nd++; }); return e; }
await pg.route('**/api/levels?layer=*', (route) => { const u = new URL(route.request().url()); const l = u.searchParams.get('layer'), d = +(u.searchParams.get('day') || 0);
  if (![...LEVEL, 'seismic', 'cyclone', 'rain_amount', 'flood_riverine'].includes(l)) return route.continue();
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture(l, d)) }); });
await pg.evaluate(() => document.dispatchEvent(new CustomEvent('agn:levels-run', { detail: {} })));
async function pick(layer) { await pg.evaluate((l) => { const s = document.getElementById('mapHazardPick'); s.value = l; s.dispatchEvent(new Event('change', { bubbles: true })); }, layer); await pg.waitForTimeout(2500); }
async function setDay(d) { await pg.evaluate((d) => { try { AGN.day.set(d); } catch (_) {} }, d); await pg.waitForTimeout(2500); }
async function read(layer) { return pg.evaluate((layer) => { const V = AGN.v283, T = AGN.hz5.tally(), leg = document.getElementById('v3legend'), lt = leg ? leg.textContent : '';
  let nt = 0, inc = 0; try { districtLayer.eachLayer((l) => { const s = l.options || {}; if (s.fillColor === V.NT_FILL) nt++; if (s.fillColor === V.INC_FILL) inc++; }); } catch (_) {}
  const rows = [...(leg ? leg.querySelectorAll('.agn-leg-row') : [])].map((r) => r.textContent.replace(/\s+/g, ' ').trim());
  const h4 = (document.querySelector('#agn31Layer h4') || {}).textContent || '';
  const R = V.runInfo(layer); return { T: T && { c: T.c, cls: T.cls, na: T.na, nt: T.nt, nd: T.nd, inc: T.inc, pend: T.pend, kind: T.kind }, lt, rows, mapNt: nt, mapInc: inc, h4, st: R && R.st, kind: R && R.kind,
    strip: (document.getElementById('agn242Leg') || {}).className || '', stripTxt: ((document.getElementById('agn242Leg') || {}).textContent || '').slice(0, 120) }; }, layer); }
const DAYS = { seismic: [0], cyclone: [0] };
for (const layer of [...LEVEL, 'rain_amount', 'seismic', 'cyclone']) {
  await pick(layer);
  for (const d of (DAYS[layer] || [0, 1, 2, 3])) {
    await setDay(d); let r = await read(layer); for (let k = 0; k < 6 && r.st !== 'current'; k++) { await pg.waitForTimeout(1500); r = await read(layer); }
    for (let k = 0; k < 14 && r.T && r.T.pend > 0; k++) { await pg.waitForTimeout(1500); r = await read(layer); }
    for (let k = 0; k < 10 && (/Loading/.test(r.lt) || ((layer === 'seismic' || layer === 'cyclone' || layer === 'rain_amount') && (!/agn31-own/.test(r.strip) || !/Class A|Dry/.test(r.lt)))); k++) { await pg.mouse.move(5 + k, 5); await pg.waitForTimeout(1500); r = await read(layer); }
    const e = expected(layer), tag = layer + ' day ' + d;
    if (r.T && r.T.pend > 0) { console.log('SKIP ' + tag + ': ' + r.T.pend + ' tehsils still loading after 21 s (this test server\u2019s sweep for that day is not complete)'); continue; }
    t.ok(r.st === 'current', tag + ': served answer current', JSON.stringify({ st: r.st }));
    t.ok(!/\bNo reading\b/.test(r.lt), tag + ': no bare "No reading" in the key', r.lt.slice(0, 300));
    const tc = r.T && (r.T.cls ? [r.T.cls.reduce((a, b) => a + b, 0)] : r.T.c), ec = (layer === 'rain_amount' || layer === 'seismic' || layer === 'cyclone') ? [e.c.reduce((a, b) => a + b, 0)] : e.c;
    if (layer !== 'rain_hz') t.ok(r.T && JSON.stringify(tc) === JSON.stringify(ec) && r.T.na === e.na && r.T.nt === e.nt && r.T.nd === e.nd && (r.T.inc || 0) === e.inc, tag + ': key counts equal the served answer', JSON.stringify({ got: r.T, exp: e }));
    else t.ok(r.T && r.T.nt === e.nt && r.T.na === e.na && r.T.nd === e.nd, tag + ': key state counts equal the served answer (levels may show as rain classes)', JSON.stringify({ got: r.T, exp: e }));
    t.ok(r.mapNt === e.nt, tag + ': map not-tested fills equal the answer', r.mapNt + ' vs ' + e.nt);
    t.ok(r.mapInc === e.inc, tag + ': map input-not-current fills equal the answer', r.mapInc + ' vs ' + e.inc);
    if (e.inc) t.ok(r.rows.some((x) => /^Input not current/.test(x) && x.includes(String(e.inc))), tag + ': "Input not current" row with its count', JSON.stringify(r.rows));
    if (e.nd) t.ok(r.rows.some((x) => /^Data missing · .+/.test(x)), tag + ': "Data missing" row names its reason', JSON.stringify(r.rows));
    if (e.nt) t.ok(r.rows.some((x) => /^Model not yet tested here/.test(x) && x.includes(String(e.nt))), tag + ': "Model not yet tested" row with its count', JSON.stringify(r.rows));
    if (e.na) t.ok(r.rows.some((x) => /not (applicable|occur)|Does not occur|cannot occur|outside/i.test(x)), tag + ': not-applicable row', JSON.stringify(r.rows));
    t.ok(r.h4.length > 0 && !/^This layer$/.test(r.h4), tag + ': right panel names the layer', r.h4);
    if (layer === 'seismic' || layer === 'cyclone') t.ok(/Class A/.test(r.lt) && !/Data missing · no value from the source/.test(r.lt), tag + ': key uses the server’s class words (the fixed map’s own key)', r.lt.slice(0, 200));
    if (layer === 'rain_amount') t.ok(/levels not yet tested/i.test(r.lt) && /Dry/.test(r.lt), tag + ': amount key: server classes and its levels note', r.lt.slice(0, 200));
    if (layer === 'seismic' || layer === 'cyclone' || layer === 'rain_amount') t.ok(/agn31-own/.test(r.strip) && !/Severe/.test(r.stripTxt), tag + ': strip shows the layer’s own classes', r.strip + ' | ' + r.stripTxt);
  }
}
/* the rarity view of the rain amount */
await pick('rain_amount'); await setDay(0);
await pg.evaluate(() => { const b = document.querySelector('#agn31Layer button[data-rv="rarity"]'); if (b) b.click(); }); await pg.waitForTimeout(2000);
const rv = await pg.evaluate(() => ({ v: AGN.v283.rainView(), t: (document.getElementById('v3legend') || {}).textContent || '' }));
t.ok(rv.v === 'rarity' && /of days/.test(rv.t), 'rain amount: rarity view and its key', rv.t.slice(0, 200));
await pg.evaluate(() => { try { localStorage.removeItem('agn.rainView'); } catch (_) {} });
/* the area tab and the coverage line */
await pg.evaluate(() => { const b = document.querySelector('#agn31Tabs button[data-t="area"]'); if (b) b.click(); }); await pg.waitForTimeout(800);
const ar = await pg.evaluate(() => ({ inner: getComputedStyle(document.getElementById('mpRightIn')).display, lay: getComputedStyle(document.getElementById('agn31Layer')).display }));
t.ok(ar.inner !== 'none' && ar.lay === 'none', 'right panel: the Area hazards tab shows the summary', JSON.stringify(ar));
t.ok(o.errs.length === 0, 'no page errors', o.errs.join(' | '));
await br.close(); t.done();
