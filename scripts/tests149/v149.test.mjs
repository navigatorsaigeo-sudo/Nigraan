/* v91.17.149 · the remaining audit items: the AI reads the served chain, the GLOF weather trigger has an age limit, the customer-screen
   rules carry the licence and wording fixes */
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787', H = { 'Sec-Fetch-Site': 'same-origin' };
let passes = 0, fails = 0; const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' :: ' + (d || ''))); c ? passes++ : fails++; };
const J = async (p) => (await fetch(BASE + p, { headers: H })).json();
{ const e = await J('/api/ai/evidence?prompt=' + encodeURIComponent('temperature Lahore now')); const f = e.facts && e.facts.askedPlace && e.facts.askedPlace.forecast;
  const p = f ? await J('/api/point?lat=' + e.facts.askedPlace.lat + '&lon=' + e.facts.askedPlace.lon) : null;
  ok(f && p && f.now && f.now.time === p.now.time && Math.abs(f.now.temperature_c - p.now.tempC) < 0.25, 'D4: the AI quotes the point card\'s hour and value (served chain)', JSON.stringify({ ai: f && f.now && [f.now.time, f.now.temperature_c], card: p && [p.now.time, p.now.tempC] })); }
{ const g = await J('/api/glof/national'); const s = JSON.stringify(g); const m = s.match(/"weatherRunAt":"([^"]+)"/); const st = s.match(/"weatherStale":(null|"[^"]*")/);
  const age = m ? (Date.now() - Date.parse(m[1])) / 3600e3 : null;
  ok(m && st && ((age > 12) === (st[1] !== 'null')), 'D8: the GLOF melt and rain modifier is off when its forecast run is older than 12 h, and says so', JSON.stringify({ age: age && Math.round(age), stale: st && st[1].slice(0, 80) })); }
{ const L = await J('/api/source-labels'); const R = (L.screenRules.rules || []).map((r) => [new RegExp(r[0], r[1] || 'g'), String(r[2]).replace(/\{(\w+)\}/g, (_, k) => L.labels[k] || k)]);
  const run = (s) => { for (const [re, rep] of R) s = s.replace(re, rep); return s; };
  const a = run('Sources and licences. Weather data by Open-Meteo.com (CC BY 4.0); Contains modified Copernicus Emergency Management Service information 2026. Neither the European Commission nor ECMWF is responsible (Copernicus licence)');
  const b = run('see the the river-basin network and a an open lake inventory'), c = run('how often satellite record satellite rainfall satellite rain is wet');
  ok(/Methods & Verification page/.test(a) && !/Open-Meteo|ECMWF|international forecast centre/.test(a) && b === 'see the river-basin network and an open lake inventory' && c === 'how often satellite rainfall is wet', 'UI 13-15: licence block points to the Sources page; doubled words collapse', JSON.stringify([a.slice(0, 90), b, c])); }
console.log((fails ? 'FAIL' : 'PASS') + ' v149: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
