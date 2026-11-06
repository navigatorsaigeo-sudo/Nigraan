/* v91.17.283.33 · Part 2 · FORECAST TIERS on the running server (argv[2] / NIGRAAN_BASE):
     T1  the place record serves outlookTiers: tiers days0to3 / days4to7 / days8to14; days 0-3 stay the place forecast (the record's days and
         its checked values carry no tier field)
     T2  days 4-7: four days (leads 4-7), each range p10 <= p50 <= p90 for high, low and rain; accuracy "not measured"
     T3  days 8-14: hotter + colder = 100, wetter + drier = 100, the chance of a day of 15.6 mm or more 0-100, from >= half the members;
         or a reason; accuracy "not measured"
     T4  the console Forecast tab and the Customize place panel print the tiers ("Further ahead", the ranges, the accuracy)
   usage: node scripts/tests28333/tiers.test.mjs [base] */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { T, browser, open, consoleReady, place, tab, BASE, ROOT } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const C = { 'x-agn-view': 'customer' };
const get = async (p) => { const r = await fetch(BASE + p, { headers: C }); return r.ok ? r.json() : null; };
const PL = JSON.parse(readFileSync(join(ROOT, 'scripts', 'tests28328', 'places.json'), 'utf8')).places.slice(0, 2);
const r5 = (x) => (+x).toFixed(5);
const asc = (r) => !r || (r.p10 <= r.p50 && r.p50 <= r.p90);
let anyReady = false;
for (const P of PL) {
  const B = await get('/api/point?lat=' + r5(P.lat) + '&lon=' + r5(P.lon) + '&complete=1'); const pr = B && B.parts && B.parts.placeRecord && B.parts.placeRecord.v;
  if (!pr) { ok(false, 'T1 ' + P.id + ' place record read'); continue; }
  const TT = pr.outlookTiers; ok(!!TT && (TT.ready === true || typeof TT.why === 'string'), 'T1 ' + P.id + ' outlookTiers served (ready or a reason)', JSON.stringify(TT).slice(0, 300));
  ok(!Object.keys(pr.values || {}).some((k) => /tier/i.test(k)) && (pr.days || []).every((d) => !('tiers' in d)), 'T1 ' + P.id + ' days 0-3 and the checked values unchanged by the tiers');
  if (!TT || !TT.ready) continue; anyReady = true;
  ok(JSON.stringify(TT.tiers.map((x) => x.id)) === JSON.stringify(['days0to3', 'days4to7', 'days8to14']), 'T1 ' + P.id + ' three tiers in order');
  const t2 = TT.tiers[1], t3 = TT.tiers[2];
  ok(t2.days4to7.length === 4 && t2.days4to7.every((d, i) => d.lead === 4 + i && asc(d.tmaxC) && asc(d.tminC) && asc(d.rainMm)), 'T2 ' + P.id + ' days 4-7 ranges p10 <= p50 <= p90', JSON.stringify(t2.days4to7).slice(0, 400));
  ok(/^not measured/.test(t2.accuracy) && /^not measured/.test(t3.accuracy), 'T2/T3 ' + P.id + ' accuracy of both tiers: not measured');
  const w = t3.days8to14;
  if (w.ready) { const h = w.temp, r = w.rain;
    ok((h.why || h.hotterPct + h.colderPct === 100) && (r.why || (r.wetterPct + r.drierPct === 100 && r.heavyDayPct >= 0 && r.heavyDayPct <= 100 && r.n >= Math.ceil(w.members / 2))), 'T3 ' + P.id + ' chances add up and use >= half the members', JSON.stringify(w)); }
  else ok(typeof w.why === 'string' && w.why.length > 5, 'T3 ' + P.id + ' days 8-14 not ready, with a reason', w.why);
}
const br = await browser();
{ const o = await open(br, '/analyst'); await consoleReady(o.pg); const P = PL[0];
  await place(o.pg, r5(P.lat) + ', ' + r5(P.lon)).catch(() => {}); await tab(o.pg, 'livedata', 6000);
  const txt = await o.pg.waitForFunction(() => { const e = document.getElementById('agnFc251Ti'); return e && /Further ahead/.test(e.textContent) ? e.innerText : false; }, null, { timeout: 120000, polling: 1000 }).then((h) => h.jsonValue()).catch(() => null);
  ok(!!txt && (anyReady ? /Days 4.7 · ranges/.test(txt) && /accuracy: not measured/.test(txt) : /Not available/.test(txt)), 'T4 console Forecast tab prints the tiers', txt);
  ok(o.errs.length === 0, 'console: no page error', o.errs.join(' | ')); await o.ctx.close(); }
{ const o = await open(br, '/customize'); await o.pg.waitForTimeout(6000); const P = PL[0];
  await o.pg.evaluate(([a, b, n]) => { NIGRAAN3.setPoint(+a, +b, n); }, [r5(P.lat), r5(P.lon), P.name]);
  const txt = await o.pg.waitForFunction(() => { const e = document.getElementById('ov-left'); return e && /Further ahead/.test(e.textContent) ? e.innerText : false; }, null, { timeout: 180000, polling: 1000 }).then((h) => h.jsonValue()).catch(() => null);
  ok(!!txt && (anyReady ? /Days 4.7 · ranges/.test(txt) && /accuracy: not measured/.test(txt) : /Not available/.test(txt)), 'T4 Customize place panel prints the tiers', txt && txt.slice(-500));
  ok(o.errs.length === 0, 'Customize: no page error', o.errs.join(' | ')); await o.ctx.close(); }
await br.close(); done();
