/* v91.17.283.28 · P19 · the Forecast chart's "now" label carries the value of the current hour (the served hour at the now line), never the
   day's highest; the highest is labelled "highest". usage: node scripts/tests28328p/p19.test.mjs [base] */
import { T, browser, open, consoleReady, place, tab } from './lib.mjs';
const { ok, done } = T(); const br = await browser(); const o = await open(br, '/analyst'); await consoleReady(o.pg); await place(o.pg); await tab(o.pg, 'livedata', 8000);
const r = await o.pg.evaluate(() => { const svg = document.getElementById('agnFc251C'); if (!svg) return null; const t = [...svg.querySelectorAll('text')].map((x) => x.textContent);
  const a = AGN.data.activePoint(), B = AGN.pointState.peek(a.lat, a.lon), now = B && B.now; return { t, nowC: now && now.tempC }; });
const nowL = r && r.t.find((x) => /^now/.test(x)), hi = r && r.t.find((x) => /^highest/.test(x));
const nv = nowL && +(/^now (-?\d+(?:\.\d)?) ?°C$/.exec(nowL) || [])[1];
ok(nowL && isFinite(nv) && (r.nowC == null || Math.abs(nv - r.nowC) < 0.06), 'P19 the now label carries the current hour\'s value ("' + nowL + '", now ' + r.nowC + ')', JSON.stringify(r).slice(0, 300));
ok(hi && /^highest /.test(hi), 'P19 the day\'s highest is labelled as such ("' + hi + '")');
ok(o.errs.length === 0, 'P19 no page error', o.errs.join(' | ')); await br.close(); done();
