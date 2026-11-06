/* v91.17.283.28 · P9 · Customize: the past-30-day key and the same-point test use the point as asked (5 decimals); a stale saved start point
   outside Pakistan (a Saudi point) is never opened: the page opens on its Pakistan start place at once (no /api/point for the Saudi point)
   and says why. usage: node scripts/tests28328p/p9.test.mjs [base] */
import { T, src, N3, browser, open } from './lib.mjs';
const { ok, done } = T(); const S = src(N3);
ok(/function p30Url\(la,lo\)\{ return 'p30:'\+\(\+la\)\.toFixed\(5\)\+','\+\(\+lo\)\.toFixed\(5\); \}/.test(S), 'P9 static: the past-30-day key is the 5-decimal point');
ok(/function samePt\(a,b\)/.test(S) && !/<1e-4/.test(S), 'P9 static: "the same point" is the 5-decimal identity (no 1e-4 tolerance left)');
const br = await browser();
const o = await open(br, '/customize', { init: () => { try { localStorage.setItem('agn.switchPlace', JSON.stringify({ lat: 26.98783, lon: 49.65707, name: null, t: Date.now() })); } catch (_) {} } });
await o.pg.waitForTimeout(12000);
const r = await o.pg.evaluate(() => ({ place: (document.getElementById('place') || {}).textContent || '', bar: (document.getElementById('failbar') || {}).textContent || '', p: NIGRAAN3.state.p }));
const saudi = o.log.filter((x) => /^\/api\/point\?/.test(x.u) && /lat=26\.98|49\.65/.test(x.u));
ok(saudi.length === 0, 'P9 page: the Saudi point is never asked of the server', saudi.map((x) => x.u).join(', '));
ok(r.p && r.p.lat > 23 && r.p.lat < 37.5 && !/26\.98|49\.65/.test(r.place) && /outside the NIGRAAN area/.test(r.bar) && /opened on/.test(r.bar), 'P9 page: the page opened on a Pakistan place and says why ("' + r.place + '")', JSON.stringify(r).slice(0, 400));
ok(o.errs.length === 0, 'P9 no page error', o.errs.join(' | ')); await br.close(); done();
