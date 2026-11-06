/* v91.17.283.39 (NIGRAAN 1.0.3) · ONE SERVER VALUE PER PLACE: the start page's bottom panel == the place record == the map colour.
   For the grid point nearest each of Gilgit (a GB mountain tehsil), Karachi, Lahore, Quetta, Islamabad and Multan, on day 0 and day 2:
     panel bars (level / state word)  == GET /api/point part hazardCount bars of that point and day
     point-level bars (heat, cold, heavy rain) == part siteLevels (the place record's site levels) of that point and day
     panel data-count                 == the hazard surface's value at that grid point (GET /api/hazardgrid?day=N, the map colour)
   usage: node scripts/tests28339/consistency39.test.mjs [base] */
import { T, browser, BASE } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const C = { 'x-agn-view': 'customer' };
const getJ = async (p) => { const r = await fetch(BASE + p, { headers: C }); return r.json(); };
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
const PL = [['Gilgit (GB mountains)', 35.92, 74.31], ['Karachi', 24.86, 67.01], ['Lahore', 31.55, 74.35], ['Quetta', 30.18, 66.99], ['Islamabad', 33.69, 73.05], ['Multan', 30.2, 71.47]];
/* the surface must be ready (it is built after the server starts) */
let G = {}; for (let i = 0; i < 90; i++) { G[0] = await getJ('/api/hazardgrid?day=0'); G[2] = await getJ('/api/hazardgrid?day=2'); if (G[0].ready && G[2].ready) break; await new Promise((r) => setTimeout(r, 10000)); }
ok(G[0].ready && G[2].ready, 'the hazard surface is ready for day 0 and day 2', JSON.stringify({ d0: G[0].why || G[0].ready, d2: G[2].why || G[2].ready }));
const br = await browser();
const ctx = await br.newContext({ viewport: { width: 1440, height: 731 } }); await ctx.addInitScript(() => { navigator.geolocation.getCurrentPosition = function (s, e) { e({ code: 1, message: 'denied' }); }; });
const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await pg.goto(BASE + '/', { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(5000);
let n = 0, good = 0;
for (const day of [0, 2]) { const g = G[day].grid;
  await pg.evaluate((d) => window.AGNSTART.nat.setDay(d), day); await pg.waitForTimeout(800);
  for (const [nm, la, lo] of PL) {
    const r = Math.round((la - g.s) / g.dLat), c = Math.round((lo - g.w) / g.dLon), lat = Math.round((g.s + r * g.dLat) * 1e5) / 1e5, lon = Math.round((g.w + c * g.dLon) * 1e5) / 1e5;
    const gv = G[day].v[r * g.cols + c];
    await pg.evaluate(([a, b]) => window.AGNSTART.nat.read(a, b, {}), [lat, lon]);
    await pg.waitForFunction(([a, b]) => { const N = window.AGNSTART.nat; return N.B && N.sel && N.sel.lat === a && N.sel.lon === b && document.querySelectorAll('#nvBars .b').length > 0; }, [lat, lon], { timeout: 90000 }).catch(() => {});
    await pg.waitForTimeout(400);
    const P = await pg.evaluate(() => ({ count: document.getElementById('nvPanel').getAttribute('data-count'), bars: Object.fromEntries([...document.querySelectorAll('#nvBars .b')].map((b) => [b.getAttribute('data-hz'), [b.getAttribute('data-level'), b.querySelector('.bw').textContent.trim()]])) }));
    const B = await getJ('/api/point?lat=' + lat.toFixed(5) + '&lon=' + lon.toFixed(5) + '&parts=hazardCount,siteLevels&complete=1');
    const hc = B.parts.hazardCount.v.days[day], sl = B.parts.siteLevels.v.hazards;
    const want = Object.fromEntries(hc.bars.map((b) => [b.key, [b.state === 'level' ? String(b.level) : null, b.state === 'level' ? (b.label || WORDS[b.level]) : b.word]]));
    const recOk = ['heat', 'cold', 'rain'].every((k) => { const d = sl[k].days.find((x) => x.lead === day); const lv = d && d.assessed ? d.level : null; return (want[k][0] == null ? null : +want[k][0]) === lv; });
    const srt = (o) => JSON.stringify(Object.entries(o).sort((a, b) => a[0] < b[0] ? -1 : 1)); const panelOk = srt(P.bars) === srt(want);
    const mapOk = (gv == null ? '' : String(gv)) === P.count && P.count === (hc.count == null ? '' : String(hc.count));
    n++; if (panelOk && recOk && mapOk) good++;
    ok(panelOk && recOk && mapOk, nm + ' day ' + day + ' (' + lat + ', ' + lon + '): panel == place record == map colour (' + P.count + ')', JSON.stringify({ panelOk, recOk, mapOk, gv, count: P.count, hcCount: hc.count, P: P.bars, want }).slice(0, 900));
  } }
ok(n === 12 && good === n, 'all ' + n + ' place-days agree', good + ' of ' + n);
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close(); done();
