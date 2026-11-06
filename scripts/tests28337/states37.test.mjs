/* v91.17.283.37 (NIGRAAN 1.0.1, coordinator 30 Oct) · EVERY STATE CODE HAS ONE WORD ON EVERY CLIENT SURFACE
   -1 Not assessed (data missing: the only code that says "Not assessed"), -2 Outside method range, -3 No gauged river reach, -4 Cannot happen
   here, -5 Not tested, -6 Input not current (server/api/states.mjs STATE_WORD, the one home).
   S1 the server map holds the six codes; the page's copy (START agn-start-js STATE_WORD) is the same map
   S2 the server's code of a site-level state or reason (states.mjs codeOfState) for every code; the place record's bars (GET /api/point part
      hazardCount) carry a code and its word for every hazard without a level, never "Normal"
   S3 browser, every code at once (the place bundle's levels and hazard count set to one code per hazard): the Hazards tab tiles, the 4-day
      table and the state lines, the "At this point" bars, the bottom panel bars and the Now tab heat line print the code's word
   usage: node scripts/tests28337/states37.test.mjs [base] */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { T, browser, BASE, ROOT } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const ST = await import(join(ROOT, 'server', 'api', 'states.mjs'));
const W = ST.STATE_WORD, CODES = ['-1', '-2', '-3', '-4', '-5', '-6'];
ok(CODES.every((c) => typeof W[c] === 'string' && W[c]) && W['-1'] === 'Not assessed' && Object.entries(W).filter(([, w]) => /not assessed/i.test(w)).length === 1, 'S1 server STATE_WORD: six codes, "Not assessed" only for -1', JSON.stringify(W));
const page = readFileSync(join(ROOT, 'artefact', 'NIGRAAN_START.html'), 'utf8'); const m = /var STATE_WORD=(\{[^}]*\});/.exec(page);
let PW = null; try { PW = JSON.parse(m[1].replace(/'/g, '"')); } catch (_) {}
ok(PW && JSON.stringify(PW) === JSON.stringify(Object.fromEntries(CODES.map((c) => [c, W[c]]))), 'S1 the page\'s STATE_WORD equals the server\'s', m && m[1]);
/* S2 codeOfState */
const cases = [[null, 'not assessed: no global forecast model 00 UTC day total held for this point and day', -1], ['missing', null, -1], [null, 'outside the method’s range: not defined here', -2], ['outside_range', null, -2],
  [null, 'no gauged river reach: no river gauge reach links to this tehsil', -3], ['no_reach', null, -3], [null, 'cannot happen here: physically impossible', -4], ['not_applicable', null, -4],
  ['not_tested', 'whatever', -5], [null, 'not tested: no cell of method d passed its test in the coast zone', -5], [null, 'input not current: the drought index is too old', -6], ['input_not_current', null, -6]];
for (const [s, w, c] of cases) ok(ST.codeOfState(s, w) === c, 'S2 codeOfState(' + s + ', "' + String(w).slice(0, 40) + '") = ' + c, ST.codeOfState(s, w));
const C = { 'x-agn-view': 'customer' };
let bad = 0, n = 0; const D = [];
for (const [la, lo] of [[30.1957, 71.4753], [24.86, 67.01], [35.92, 74.31], [33.69421, 73.05242], [27.7, 68.86], [30.18, 66.99]]) {
  const B = await (await fetch(BASE + '/api/point?lat=' + la + '&lon=' + lo + '&complete=1', { headers: C })).json();
  const hc = B.parts && B.parts.hazardCount && B.parts.hazardCount.v; if (!hc) { bad++; D.push(la + ',' + lo + ': no hazardCount'); continue; }
  for (const d of hc.days) for (const b of d.bars) { n++; if (b.state === 'level') continue;
    if (!CODES.includes(String(b.code)) || b.word !== W[String(b.code)] || /normal/i.test(b.word) || ST.STATE_CODES[String(b.code)] !== b.state) { bad++; if (D.length < 10) D.push(la + ',' + lo + ' ' + b.key + ' ' + JSON.stringify(b)); } } }
ok(n > 100 && bad === 0, 'S2 every bar without a level in the place record carries a code (-1..-6), its state name and its one word (' + n + ' bars)', D.join(' | '));
/* S3 browser: one code per hazard */
const FIX = { heat: -1, cold: -2, flood: -3, glof: -4, rain_hz: -5, drought: -6, wind: -5, landslide: -1 };
const BARF = { heat: -1, cold: -2, rain: -5, flood: -3, landslide: -4, wind: -5, drought: -6, air: -5 };
const br = await browser();
const ctx = await br.newContext({ viewport: { width: 1366, height: 900 } }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message)));
await pg.route(/\/api\/point\?/, async (route) => { const r = await route.fetch(); let j = null; try { j = await r.json(); } catch (_) { return route.fulfill({ response: r }); }
  if (j && j.parts) { const lv = j.parts.levels; if (lv && lv.v && Array.isArray(lv.v.days)) { lv.v.stale = false; lv.v.validUntil = new Date(Date.now() + 3 * 3600e3).toISOString(); lv.v.days.forEach((d, i) => { d.date = new Date(Date.now() + 5 * 3600e3 + i * 864e5).toISOString().slice(0, 10); d.day = i; for (const [k, c] of Object.entries(FIX)) d.layers[k] = { name: k, level: c, state: ST.STATE_CODES[String(c)], word: 'x', why: ST.STATE_TEXT[String(c)] }; }); }
    const hc = j.parts.hazardCount; if (hc && hc.v && hc.v.days) hc.v.days.forEach((d) => { d.count = null; d.bars = d.bars.map((b) => { const c = BARF[b.key]; return { key: b.key, name: b.name, state: ST.STATE_CODES[String(c)], code: c, word: W[String(c)], level: null, counted: false }; }); }); }
  return route.fulfill({ response: r, json: j }); });
await pg.goto(BASE + '/#agnplace=33.69421,73.05242,G-8', { waitUntil: 'load' });
await pg.waitForFunction(() => document.getElementById('card').getAttribute('data-ready') === '1', null, { timeout: 120000 }).catch(() => {}); await pg.waitForTimeout(4000);
await pg.evaluate(() => window.AGNSTART.goTab('hz')); await pg.waitForTimeout(1500);
const R = await pg.evaluate(() => ({ tiles: Object.fromEntries([...document.querySelectorAll('.hzt[data-hzk]')].map((b) => [b.getAttribute('data-hzk'), (b.querySelector('.lvl') || {}).textContent || ''])),
  table: [...document.querySelectorAll('#hzTable tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())),
  lines: [...document.querySelectorAll('#hzNoLevel [data-code], #hzSec [data-code]')].map((e) => [e.getAttribute('data-code'), e.textContent]),
  pc: Object.fromEntries([...document.querySelectorAll('#pcSec .pcb')].map((b) => [b.getAttribute('data-hz'), b.querySelector('.bw').textContent.trim()])),
  pill: (document.getElementById('nowPill') || {}).textContent || '' }));
const tileBad = Object.entries(FIX).filter(([k, c]) => R.tiles[k] !== undefined && R.tiles[k] !== W[String(c)]);
ok(Object.keys(R.tiles).length >= 7 && tileBad.length === 0, 'S3 Hazards tab tiles: each code\'s word', JSON.stringify(R.tiles));
const tblWords = R.table.map((r) => r.slice(1)).flat(); const allowed = new Set(CODES.map((c) => W[c]).concat(['Not yet issued', 'Not issued']));
ok(R.table.length >= 7 && tblWords.every((w) => allowed.has(w)) && !tblWords.some((w) => /Normal/.test(w)), 'S3 Hazards tab 4-day table: only the code words, never Normal', JSON.stringify(R.table).slice(0, 400));
ok(R.lines.length >= 1 && R.lines.every(([c, t]) => t.startsWith(W[c] + ':')) && !R.lines.some(([c, t]) => c !== '-1' && /^Not assessed/.test(t)), 'S3 Hazards tab state lines: one line per code in its word ("Not assessed" only for -1)', JSON.stringify(R.lines));
ok(Object.entries(BARF).every(([k, c]) => R.pc[k] === W[String(c)]), 'S3 "At this point" bars: each code\'s word', JSON.stringify(R.pc));
ok(/Heat stress today: Not assessed/.test(R.pill), 'S3 Now tab heat line: the point\'s heat state word (-1 Not assessed)', R.pill);
/* the bottom panel */
await pg.click('#cClose').catch(() => {}); await pg.waitForTimeout(1200); await pg.evaluate(() => window.map.setView([30.2, 71.5], 6, { animate: false })); await pg.waitForTimeout(800);
const p = await pg.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(), q = window.map.latLngToContainerPoint([30.2, 71.5]); return { x: r.left + q.x, y: r.top + q.y }; });
await pg.mouse.click(p.x, p.y); await pg.waitForFunction(() => window.AGNSTART.nat.B, null, { timeout: 90000 }).catch(() => {}); await pg.waitForTimeout(1500);
const BP = await pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('#nvBars .b')].map((b) => [b.getAttribute('data-hz'), [b.getAttribute('data-code'), b.querySelector('.bw').textContent.trim()]])));
ok(Object.entries(BARF).every(([k, c]) => BP[k] && BP[k][0] === String(c) && BP[k][1] === W[String(c)]), 'S3 bottom panel bars: each code and its word', JSON.stringify(BP));
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close(); done();
