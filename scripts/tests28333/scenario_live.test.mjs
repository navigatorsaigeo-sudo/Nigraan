/* v91.17.283.33 · scenario live-check items (A1, A2, A3, A6) on the running server (argv[2] / NIGRAAN_BASE):
     L1  heat and cold use the register Low band everywhere: siteLevels, placeRecord, scenario baseline give the band level of the day's UTCI
         (heat: <26 Normal, 26-32 Low, 32-38 Moderate, 38-46 High, >=46 Severe; cold mirrored at 0 / -13 / -27 / -40)
     L2  a rain-day preset: the rain level of the selected date = the rain class of the assumed amount (data/hazard-scale.json rainClasses24h),
         labelled "rain class of the assumed amount"; the other days are not changed by the preset; default date = lead 0
     L3  no file or function names in customer text: every string of the customer scenario answers, the site-level methods and the
         readiness answer, and the visible text of the console tabs and the Customize sections, has no match of /\.mjs|\.json|server\/|data\//
     L5  the Scenario Lab flood outcome block (console and Customize): label, ground-wetness control
     L4  readiness right after a restart: "starting up: rebuilding area heat and cold (about 5 min)" while the first area-heat run is in progress
   usage: node scripts/tests28333/scenario_live.test.mjs [base] */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { T, browser, open, consoleReady, place, tab, BASE, ROOT } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const C = { 'x-agn-view': 'customer' };
const get = async (p) => { const r = await fetch(BASE + p, { headers: C }); return r.ok ? r.json() : null; };
const CODE = /\.mjs|\.json|server\/|data\//;
const REG = JSON.parse(readFileSync(join(ROOT, 'data', 'thresholds-register.json'), 'utf8'));
const regVal = (id) => { const f = (o) => { if (Array.isArray(o)) { for (const x of o) { const r = f(x); if (r) return r; } } else if (o && typeof o === 'object') { if (o.id === id) return o.value; for (const v of Object.values(o)) { const r = f(v); if (r) return r; } } return null; }; return f(REG); };
const HB = regVal('utci.heatLevels'), CB = regVal('utci.coldLevels');
const heatLv = (u) => { if (u < HB.normalBelowC) return 0; let L = 0; HB.bandsC.forEach(([a], i) => { if (u >= a) L = i + 1; }); return L; };
const coldLv = (u) => { if (u >= CB.normalFromC) return 0; let L = 0; CB.bandsC.forEach(([a], i) => { if (u < a) L = i + 1; }); return L; };
ok(heatLv(25.9) === 0 && heatLv(26) === 1 && heatLv(31.9) === 1 && heatLv(32) === 2 && heatLv(46) === 4, 'L1 register heat bands read (26 / 32 / 38 / 46)');
ok(coldLv(0) === 0 && coldLv(-0.1) === 1 && coldLv(-13) === 1 && coldLv(-13.1) === 2 && coldLv(-40.1) === 4, 'L1 register cold bands read (0 / -13 / -27 / -40)');
const HS = JSON.parse(readFileSync(join(ROOT, 'data', 'hazard-scale.json'), 'utf8'));
const RC = HS.rainClasses24h && (HS.rainClasses24h.value || HS.rainClasses24h.thresholdsMm || HS.rainClasses24h);
const RCT = Array.isArray(RC) ? RC : (RC && (RC.thresholdsMm || RC.mm || RC.value)) || [15.6, 64.5, 115.6, 204.5];
const rainLv = (mm) => { let L = 0; RCT.forEach((t, i) => { if (mm >= t) L = i + 1; }); return L; };
const PL = JSON.parse(readFileSync(join(ROOT, 'scripts', 'tests28328', 'places.json'), 'utf8')).places.slice(0, +(process.env.NIGRAAN_SL_N || 3));
const r5 = (x) => (+x).toFixed(5);
const utciOf = (basis) => { const m = /UTCI (-?[\d.]+) °C/.exec(String(basis || '')); return m ? +m[1] : null; };
const codeHits = (o, p = '', out = []) => { if (typeof o === 'string') { if (CODE.test(o)) out.push(p + ': ' + o.slice(0, 120)); } else if (Array.isArray(o)) o.forEach((x, i) => codeHits(x, p + '[' + i + ']', out)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) codeHits(v, p + '.' + k, out); return out; };
for (const P of PL) {
  const la = r5(P.lat), lo = r5(P.lon);
  const B = await get('/api/point?lat=' + la + '&lon=' + lo + '&complete=1'); const sl = B && B.parts && B.parts.siteLevels && B.parts.siteLevels.v, pr = B && B.parts && B.parts.placeRecord && B.parts.placeRecord.v;
  if (!sl || !pr) { ok(false, P.id + ' served record read'); continue; }
  for (const [k, fn] of [['heat', heatLv], ['cold', coldLv]]) {
    const H = sl.hazards[k]; if (!H) continue;
    const bad = H.days.filter((d) => d.assessed && utciOf(d.basis) != null && d.level !== fn(utciOf(d.basis)));
    ok(!bad.length, 'L1 ' + P.id + ' siteLevels ' + k + ' = register band of the day UTCI', JSON.stringify(bad).slice(0, 400));
    ok(!CODE.test(H.method || ''), 'L3 ' + P.id + ' siteLevels ' + k + ' method has no file or function name', H.method);
  }
  const prd = (pr.heat && pr.heat.days) || [];
  const W = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
  const badPr = prd.filter((d) => d.assessed && d.utciMaxC != null && d.level !== W[heatLv(d.utciMaxC)]);
  ok(prd.length > 0 && !badPr.length, 'L1 ' + P.id + ' placeRecord heat days = register band of utciMaxC', JSON.stringify(badPr).slice(0, 400));
  const slByDate = Object.fromEntries((sl.hazards.heat ? sl.hazards.heat.days : []).map((d) => [d.date, d.level]));
  const prMis = prd.filter((d) => d.assessed && slByDate[d.date] != null && W[slByDate[d.date]] !== d.level);
  ok(!prMis.length, 'L1 ' + P.id + ' placeRecord heat = siteLevels heat per day', JSON.stringify(prMis).slice(0, 300));
  const SB = await get('/api/scenario?lat=' + la + '&lon=' + lo + '&preset=baseline'); const sb = SB && SB.places && SB.places[0] && SB.places[0].baseline;
  for (const k of ['heat', 'cold']) { const a = sb && sb.hazards[k] && sb.hazards[k].days.map((d) => d.level), b = sl.hazards[k] && sl.hazards[k].days.map((d) => d.level);
    ok(JSON.stringify(a) === JSON.stringify(b), 'L1 ' + P.id + ' scenario baseline ' + k + ' = siteLevels', JSON.stringify({ a, b })); }
  /* L2 rain-day presets, default date and an explicit date */
  const days = sl.hazards.rain ? sl.hazards.rain.days : [];
  const d0 = (days.find((d) => d.lead === 0) || {}).date, d1 = (days.find((d) => d.lead === 1) || {}).date;
  for (const [pre, day] of [['rain10', null], ['rain2', d1]]) {
    const S = await get('/api/scenario?lat=' + la + '&lon=' + lo + '&preset=' + pre + (day ? '&rainDay=' + day : '')); const pl = S && S.places && S.places[0];
    if (!pl || !pl.applied || pl.applied.rainMm == null) { ok(!!(pl && (pl.refused || pl.ok === false || (pl.applied && !pl.applied.rainDay))), 'L2 ' + P.id + ' ' + pre + ': no return level here, nothing assumed', JSON.stringify(pl && pl.applied)); continue; }
    const want = day || d0; ok(pl.applied.rainDay === want, 'L2 ' + P.id + ' ' + pre + ' applies to ' + (day ? 'the selected date' : 'lead 0'), pl.applied.rainDay + ' vs ' + want);
    const sd = pl.scenario.hazards.rain.days.find((d) => d.date === want);
    ok(!!sd && sd.assumed === true && sd.level === rainLv(pl.applied.rainMm) && /rain class of the assumed amount/.test(sd.levelLabel || ''), 'L2 ' + P.id + ' ' + pre + ' ' + pl.applied.rainMm + ' mm -> rain class ' + W[rainLv(pl.applied.rainMm)], JSON.stringify(sd).slice(0, 300));
    const other = pl.scenario.hazards.rain.days.filter((d) => d.date !== want).map((d) => d.level), base = pl.baseline.hazards.rain.days.filter((d) => d.date !== want).map((d) => d.level);
    ok(JSON.stringify(other) === JSON.stringify(base), 'L2 ' + P.id + ' ' + pre + ' other days unchanged', JSON.stringify({ other, base }));
    const hits = codeHits(S); ok(!hits.length, 'L3 ' + P.id + ' scenario ' + pre + ' answer has no file or function name', hits.join(' | '));
  }
}
ok(rainLv(190.8) === 3 && rainLv(204.5) === 4 && rainLv(15.5) === 0, 'L2 rain classes: 190.8 mm is High');
const RD = await get('/api/readiness'); ok(!!RD && !codeHits(RD).length, 'L3 readiness answer has no file or function name', JSON.stringify(RD && codeHits(RD)));
/* L4: the readiness rule itself (the server under test has finished its first run by now) */
{ const { readiness, STARTING_AREA_HEAT } = await import(join(ROOT, 'server', 'api', 'readiness.mjs'));
  const mk = (s) => ({ areaHeat: { status: () => s } });
  const a = readiness(mk({ on: true, at: null, busy: true })).stale.find((x) => x.product === 'area heat and cold');
  ok(!!a && a.why === 'starting up: rebuilding area heat and cold (about 5 min)' && STARTING_AREA_HEAT === a.why, 'L4 first area-heat run in progress -> starting up', JSON.stringify(a));
  const b = readiness(mk({ on: true, at: new Date().toISOString(), busy: true })).stale.find((x) => x.product === 'area heat and cold');
  ok(!b, 'L4 a later run in progress with a fresh result is ready', JSON.stringify(b)); }
/* L3 page crawl: visible text of the console tabs and the Customize sections */
const br = await browser();
{ const o = await open(br, '/analyst'); await consoleReady(o.pg); const P = PL[0];
  await place(o.pg, r5(P.lat) + ', ' + r5(P.lon)).catch(() => {}); await o.pg.waitForTimeout(8000);
  const views = await o.pg.evaluate(() => [...document.querySelectorAll('#machNav [data-goto]')].map((b) => b.getAttribute('data-goto')));
  for (const v of views) { await tab(o.pg, v, 4000); const txt = await o.pg.evaluate(() => document.body.innerText); const m = txt.split('\n').filter((l) => /\.mjs|\.json|server\/|data\//.test(l));
    ok(!m.length, 'L3 console tab ' + v + ': no file or function name in the visible text', m.slice(0, 5).join(' | ')); }
  /* L5 · the flood outcome in the console Scenario Lab: shown after a stress test, with the label; the ground-wetness control re-runs it */
  await tab(o.pg, 'hybridlab', 3000);
  await o.pg.evaluate(() => { const b = document.querySelector('#agnScn button[data-scn-load]'); if (b) b.click(); });
  await o.pg.waitForFunction(() => !!document.querySelector('#agnScnPresets button[data-preset="rain2"]'), null, { timeout: 180000, polling: 500 }).catch(() => {});
  await o.pg.evaluate(() => { const b = document.querySelector('#agnScnPresets button[data-preset="rain2"]'); if (b) b.click(); });
  const f1 = await o.pg.waitForFunction(() => { const e = document.getElementById('agnScnFlood'); return e && /Local-rain flooding in the district/.test(e.textContent) ? e.innerText : false; }, null, { timeout: 180000, polling: 500 }).then((h) => h.jsonValue()).catch(() => null);
  ok(!!f1 && /District-level chance, not a site forecast; river floods and lake bursts not included/.test(f1) && !/\.mjs|\.json|server\/|data\//.test(f1), 'L5 console Scenario Lab shows the flood outcome with its label', f1);
  await o.pg.evaluate(() => { const s = document.querySelector('#agnScnFlood select[data-wet]'); if (s) { s.value = '90'; s.dispatchEvent(new Event('change', { bubbles: true })); } });
  const f2 = await o.pg.waitForFunction(() => { const e = document.getElementById('agnScnFlood'); return e && /set by you: 90th percentile/.test(e.textContent) ? e.innerText : false; }, null, { timeout: 180000, polling: 500 }).then((h) => h.jsonValue()).catch(() => null);
  ok(!!f2 && (/about 1 day in \d+/.test(f2) || /Not modelled: /.test(f2)), 'L5 the ground-wetness control re-runs it (90th percentile)', f2);
  ok(o.errs.length === 0, 'console: no page error', o.errs.join(' | '));
  await o.ctx.close(); }
{ const o = await open(br, '/customize'); await o.pg.waitForTimeout(6000); const P = PL[0];
  await o.pg.evaluate(([a, b, n]) => { NIGRAAN3.setPoint(+a, +b, n); }, [r5(P.lat), r5(P.lon), P.name]);
  await o.pg.waitForFunction(() => { const S = NIGRAAN3.state; return S.d && S.d.sl && S.d.prec; }, null, { timeout: 180000, polling: 1000 }).catch(() => {});
  const secs = await o.pg.evaluate(() => [...document.querySelectorAll('[data-s]')].map((b) => b.getAttribute('data-s')).filter((x, i, a) => a.indexOf(x) === i));
  for (const s of secs) { await o.pg.evaluate((x) => { const b = document.querySelector('[data-s="' + x + '"]'); if (b) b.click(); }, s); await o.pg.waitForTimeout(2500);
    const txt = await o.pg.evaluate(() => document.body.innerText); const m = txt.split('\n').filter((l) => /\.mjs|\.json|server\/|data\//.test(l));
    ok(!m.length, 'L3 Customize ' + s + ': no file or function name in the visible text', m.slice(0, 5).join(' | ')); }
  /* L5 · the Customize Scenario section prints the same flood outcome block */
  await o.pg.evaluate(() => { const b = document.querySelector('[data-s="lab"]'); if (b) b.click(); });
  const f3 = await o.pg.waitForFunction(() => { const e = document.getElementById('l-body'); return e && document.getElementById('l-flood') ? e.innerText : false; }, null, { timeout: 180000, polling: 1000 }).then((h) => h.jsonValue()).catch(() => null);
  ok(!!f3 && /Local-rain flooding in the district/.test(f3) && /District-level chance, not a site forecast/.test(f3), 'L5 Customize Scenario shows the flood outcome with its label', f3 && f3.slice(-600));
  ok(o.errs.length === 0, 'Customize: no page error', o.errs.join(' | '));
  await o.ctx.close(); }
await br.close(); done();
