/* v91.17.283.40 (NIGRAAN 1.0.4) · THE HEAT INDEX ON THE ANALYST PAGE. The server serves the heat-index band per tehsil (layer heat_index,
   days 1-3 tested, day 0 not tested); the page draws it from that answer only:
   - "Heat index" is an entry of More layers (beside Temperature and Urban heat); on, every tehsil is filled with the colour of its served
     band (data/map-layer-scales.json heat_index palette) for the day shown; the key names the three bands with their counts
   - day 0: the key and the place line say "not tested"
   - the place panel line (a slot in the markup from the first paint) gives the day's highest heat index, its hour and band: the same number
     as the map's cell (GET /api/levels values) and the unit answer (GET /api/levels/unit facts): one value per place
   - a condition, not a hazard: no hazard-count bar, no alert row; a hazard layer chosen or Temperature switched on turns it off
   - plain words: no internal names, no codes; the Methods tab (operator) has the hours-at-or-above table with its measured error
   usage: node scripts/tests28340/heatpage40.test.mjs [base] */
import { T, browser, BASE } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const J = async (p, h) => { const r = await fetch(BASE + p, { headers: { 'Sec-Fetch-Site': 'same-origin', ...(h || {}) } }); return r.json(); };
/* the area pass that writes the heat index into the issued record (operator, local) */
await J('/api/pointstate/area-heat?run=1');
for (let i = 0; i < 120; i++) { const s = await J('/api/pointstate/area-heat'); if (!s.busy && s.units > 0) break; await new Promise((r) => setTimeout(r, 5000)); }
const L = {}; for (const d of [0, 1, 2, 3]) L[d] = await J('/api/levels?layer=heat_index&day=' + d);
ok(L[0].ready && Object.values(L[0].levels || {}).every((v) => v === -5), 'server: day 0 every tehsil not tested (-5)', JSON.stringify(L[0]).slice(0, 200));
const vd = [1, 2, 3].find((d) => L[d].ready && Object.values(L[d].levels || {}).some((v) => v >= 0));
/* a held record whose days are all behind today (the tree's test record) has no day 1-3 ahead: every tehsil then carries a state with its
   reason; the value checks need a record of the last days (the laptop copy, LAPDB) and are reported as SKIP here, not as a pass */
const recAhead = [1, 2, 3].some((d) => L[d].ready && L[d].date && L[d].date > new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10));
if (vd == null && !recAhead) { ok([1, 2, 3].every((d) => !L[d].ready || Object.values(L[d].levels || {}).every((v) => v < 0 && (L[d].whys || {})[Object.keys(L[d].levels)[0]])), 'server: the held record has no day ahead of today: every tehsil a state with its reason');
  console.log('SKIP the map and place-line value checks: the held record (' + (L[1].date || '?') + ') holds no day 1-3 ahead of today (run against a server holding a recent record)'); }
else ok(vd != null, 'server: a day 1-3 with heat index values (day ' + vd + ')');
const SC = (await J('/api/map/layer?id=scales:map')).layers.heat_index;
ok(SC && SC.words.join('|') === 'Below Extreme Caution|Extreme Caution|Danger or higher' && SC.palette.length === 3, 'scale: the three NWS band words and colours', SC && SC.words);
const br = await browser();
const ctx = await br.newContext({ viewport: { width: 1440, height: 731 }, geolocation: { latitude: 31.5204, longitude: 74.3587, accuracy: 25 }, permissions: ['geolocation'] });
const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
await pg.goto(BASE + '/analyst', { waitUntil: 'load', timeout: 240000 });
const slot0 = await pg.evaluate(() => { const e = document.getElementById('agnHi40'); return e ? e.getBoundingClientRect().height : -1; });
ok(slot0 >= 30, 'place line slot is in the page from the first paint (' + slot0 + ' px)');
await pg.waitForTimeout(25000);
const uid = await pg.evaluate(() => (AGN.siteUnit(31.5204, 74.3587) || {}).uid);
ok(!!uid, 'the place has a tehsil: ' + uid);
ok(await pg.evaluate(() => !!document.querySelector('#agnLayersPop80 #agnHi40Btn') && !!document.querySelector('#agnLayersPop80 #agnTmap91Btn')), 'Heat index is an entry of More layers beside Temperature');
ok(await pg.evaluate(() => ![...document.querySelectorAll('#mapHazardPick option')].some((o) => /heat_index|heat index/i.test(o.value + o.textContent))), 'not in the hazard picker (a condition, not a hazard)');
const setDay = async (d) => { await pg.evaluate((d) => { const b = [...document.querySelectorAll('#v3days button')].find((x) => x.textContent.trim() === (d === 0 ? 'Today’s peak' : '+' + d + 'd')); if (b) b.click(); }, d); await pg.waitForTimeout(3500); };
await setDay(0);
await pg.click('#agnLayersMenu80 > button'); await pg.click('#agnHi40Btn'); await pg.waitForTimeout(3500);
const s0 = await pg.evaluate(() => ({ leg: (document.getElementById('agnHi40Leg') || {}).innerText || '', line: document.getElementById('agnHi40').innerText, on: AGN.heatIndex40.state() }));
ok(s0.on && /Not tested for this day/.test(s0.leg), 'day 0: the key says not tested', s0.leg);
ok(/not tested/.test(s0.line), 'day 0: the place line says not tested', s0.line);
if (vd != null) {
await setDay(vd);
const s1 = await pg.evaluate((uid) => { const fills = {}; document.querySelectorAll('#mpMapWrap path.leaflet-interactive').forEach((p) => { const f = p.getAttribute('fill'); fills[f] = (fills[f] || 0) + 1; });
  const U = AGN.heatIndex40.unit(), ud = U && U.days.find((x) => x.day === AGN.day.get()); return { fills, leg: (document.getElementById('agnHi40Leg') || {}).innerText || '', line: document.getElementById('agnHi40').innerText, unit: ud && ud.layers.heat_index, day: AGN.day.get() }; }, uid);
const cnt = [0, 0, 0]; for (const v of Object.values(L[vd].levels)) if (v >= 0) cnt[v]++;
ok(SC.palette.every((c, i) => (s1.fills[c] || 0) === cnt[i]), 'map: tehsils filled in the served band colours (' + cnt.join('/') + ')', JSON.stringify(s1.fills));
ok(cnt.every((n, i) => new RegExp(SC.words[i] + '\\s*' + n).test(s1.leg)), 'key: the three bands with the served counts', s1.leg);
const mv = L[vd].values && L[vd].values[uid];
ok(s1.unit && s1.unit.facts && s1.unit.facts.heatIndexMaxC === mv, 'one value per place: unit answer ' + (s1.unit && s1.unit.facts && s1.unit.facts.heatIndexMaxC) + ' = map cell ' + mv);
ok(mv != null && s1.line.includes((+mv).toFixed(1) + ' °C') && s1.line.includes(SC.words[L[vd].levels[uid]]) && /at \d\d:00 PKT/.test(s1.line), 'place line: the value, its hour and band', s1.line);
const bad = /\b(lead|heat_index|ownScale|SR 90-23|Rothfusz|-5|not_tested|NWS)\b/;
ok(!bad.test(s0.leg + s1.leg + s0.line + s1.line), 'plain words on the key and the place line', (s1.leg + s1.line).match(bad));
} else { const bad0 = /\b(lead|heat_index|ownScale|SR 90-23|Rothfusz|-5|not_tested|NWS)\b/; ok(!bad0.test(s0.leg + s0.line), 'plain words on the key and the place line (day 0)', (s0.leg + s0.line).match(bad0)); }
/* a condition: no hazard bar, no alert */
const ph = await J('/api/point?lat=31.52040&lon=74.35870&parts=hazardCount');
const bars = ((ph.parts && ph.parts.hazardCount && ph.parts.hazardCount.v && ph.parts.hazardCount.v.days) || []).flatMap((d) => (d.bars || []).map((b) => b.key));
ok(bars.length > 0 && !bars.includes('heat_index'), 'no heat-index bar in the place hazard count (' + [...new Set(bars)].join(',') + ')');
const al = await J('/api/alerts'); ok(!(al.rows || []).some((r) => r.hazard === 'heat_index' || (r.hazards || []).includes('heat_index')), 'no alert row from the heat index');
/* switches */
await pg.evaluate(() => { if (!AGN.heatIndex40.state()) document.getElementById('agnHi40Btn').click(); document.getElementById('agnTmap91Btn').click(); }); await pg.waitForTimeout(2500);
ok(await pg.evaluate(() => !AGN.heatIndex40.state() && !document.getElementById('agnHi40Leg')), 'Temperature switched on turns the heat index off');
await pg.evaluate(() => { document.getElementById('agnTmap91Btn').click(); document.getElementById('agnHi40Btn').click(); }); await pg.waitForTimeout(1500);
await pg.selectOption('#mapHazardPick', 'cold'); await pg.waitForTimeout(1500);
ok(await pg.evaluate(() => !AGN.heatIndex40.state()), 'a hazard layer chosen turns the heat index off');
/* Methods (operator) */
await pg.evaluate(() => AGN.operator.set(true)); await pg.waitForTimeout(1000);
await pg.evaluate(() => { const b = document.querySelector('#machNav [data-goto="modelab"]'); if (b) b.click(); }); await pg.waitForTimeout(6000);
const mt = await pg.evaluate(() => (document.getElementById('agnMethods36') || {}).innerText || '');
ok(/Heat index by day/.test(mt) && /Hours error \(mean absolute\)/.test(mt) && /Extreme Caution \(32\.2/.test(mt) && /Danger \(40\.6/.test(mt), 'Methods: the hours-at-or-above table with its measured error', mt.slice(mt.indexOf('Heat index'), mt.indexOf('Heat index') + 300));
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close(); done();
