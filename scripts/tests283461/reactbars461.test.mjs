/* v91.17.283.46 (NIGRAAN 1.0.8.1) · the React start page draws no "Cannot happen here" bar (server state code -4), as the classic start
   page since 1.0.8: the day chart (.b[data-hz]) and the place panel's "At this point" bars (.pcb) leave such hazards out; the place still
   has them in its served hazard count (precondition). usage: FREEZE_MS=<ms> node scripts/tests283461/reactbars461.test.mjs BASE */
const T = await import(new URL('../lib/testenv.mjs', import.meta.url).href); const PW = T.playwrightSync();
const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, ''); const F0 = Number(process.env.FREEZE_MS || Date.now());
let fails = 0; const ok = (c, m, i) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (!c && i != null ? ' :: ' + String(i).slice(0, 400) : '')); if (!c) fails++; };
const PL = { lat: 33.6686, lon: 73.0752 };
const j = await (await fetch(BASE + '/api/point?lat=' + PL.lat + '&lon=' + PL.lon, { headers: { 'x-agn-view': 'customer' } })).json();
const hc = j && j.parts && j.parts.hazardCount; const hv = hc && (hc.v || hc); const d0 = hv && hv.days && hv.days[0];
const cn = d0 ? (d0.bars || []).filter((b) => b.code === -4).map((b) => b.key) : [];
ok(cn.length > 0, 'precondition: the served hazard count of I-8/3 holds hazards that cannot happen here (code -4): ' + cn.join(', '), JSON.stringify(d0 || hc).slice(0, 300));
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-gpu', '--renderer-process-limit=2', '--disable-extensions'] });
const ctx = await br.newContext({ viewport: { width: 1440, height: 800 }, geolocation: { latitude: PL.lat, longitude: PL.lon }, permissions: ['geolocation'] });
const pg = await ctx.newPage(); await pg.clock.install({ time: new Date(F0) }); await pg.clock.resume();
await pg.route(/\/tiles\/|\/api\/hazardgrid|\/api\/map\/layer\b/, (r) => r.abort());
await pg.goto(BASE + '/app/', { waitUntil: 'load', timeout: 120000 }); await pg.waitForTimeout(25000);
const r = await pg.evaluate((cn) => { const bars = [...document.querySelectorAll('.b[data-hz]')], pcb = [...document.querySelectorAll('.pcb[data-hz]')];
  return { bars: bars.length, barsCn: bars.filter((b) => b.getAttribute('data-code') === '-4' || cn.includes(b.getAttribute('data-hz')) && !b.getAttribute('data-level')).map((b) => b.getAttribute('data-hz')),
    hatch: document.querySelectorAll('.b .hatchl, .pcb .hatch').length, pcb: pcb.length, pcbCn: pcb.filter((b) => cn.includes(b.getAttribute('data-hz'))).map((b) => b.getAttribute('data-hz')),
    txt: [...document.querySelectorAll('.b[data-hz], .pcb[data-hz]')].map((b) => b.textContent).join(' | ').slice(0, 600) }; }, cn);
ok(r.bars > 0, 'the start page day chart is drawn (' + r.bars + ' bars)', JSON.stringify(r));
ok(r.barsCn.length === 0 && r.hatch === 0, 'no day-chart bar for a hazard that cannot happen here, no hatched bar', JSON.stringify(r));
ok(r.pcbCn.length === 0, 'no "At this point" bar for a hazard that cannot happen here (' + r.pcb + ' bars drawn)', JSON.stringify(r));
ok(!/Cannot happen here/.test(r.txt), 'no bar reads "Cannot happen here"', r.txt);
await br.close(); console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
