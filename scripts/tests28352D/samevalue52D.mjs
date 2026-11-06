/* v91.17.283.52 D · the same served value in every view and product:
   1. GET /api/point, customer vs operator: shown now / nowLabel / measured / today identical (one served station decision, N4)
   2. air quality: the worst served AQ category and AQI of the next 3 days is the same in the Ask answer (N14), the executive brief's
      "In brief" and key messages (N15) and the report summary banner
   usage: node samevalue52D.mjs <base> [places "lat,lon,name;..."] */
const [B, PL] = process.argv.slice(2);
const P = (PL || '31.51000,74.38000,Lahore;24.85468,67.02071,Karachi;33.66443,73.08339,Islamabad I-8;35.92080,74.30890,Gilgit;30.17980,66.97500,Quetta;31.71000,73.98000,Sheikhupura').split(';').map((x) => { const a = x.split(','); return { lat: +a[0], lon: +a[1], name: a.slice(2).join(',') }; });
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i != null ? ' :: ' + String(i).slice(0, 500) : '')); } };
const H = (v) => ({ 'sec-fetch-site': 'same-origin', ...(v ? { 'x-agn-view': v } : {}) });
const j = async (u, v) => (await fetch(B + u, { headers: H(v), signal: AbortSignal.timeout(600000) })).json();
const post = async (u, body, v) => (await fetch(B + u, { method: 'POST', headers: { ...H(v), 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(900000) })).json();
const f5 = (x) => (+x).toFixed(5);
for (const p of P) {
  const c = await j('/api/point?lat=' + f5(p.lat) + '&lon=' + f5(p.lon) + '&complete=1', 'customer'), o = await j('/api/point?lat=' + f5(p.lat) + '&lon=' + f5(p.lon) + '&complete=1', 'operator');
  const k = (s) => s && JSON.stringify({ now: s.now && [s.now.value, s.now.label, s.now.kind, s.now.dew, s.now.rh], measured: s.measured && [s.measured.value, s.measured.label], today: s.today && [s.today.high, s.today.low], made: s.made });
  ok(c.shown && k(c.shown) === k(o.shown), p.name + ': customer and operator print the same shown values', k(c.shown) + ' vs ' + k(o.shown));
  ok(!(o.station && o.station.ok && c.shown && /^No live temperature measurement/.test(c.shown.measured.label)), p.name + ': no "No live measurement" where the operator view has a station reading');
  /* air quality across products */
  const ask = await post('/api/ai/chat', { prompt: 'What is the weather risk in ' + p.name + ' in the next 3 days?', context: { location: p.name, place: { lat: p.lat, lon: p.lon, name: p.name } } });
  const ex = await post('/api/report/generate', { lat: p.lat, lon: p.lon, kind: 'executive_brief', section: 'test' }, 'customer');
  if (!ex.ok) { ok(false, p.name + ': executive brief made', JSON.stringify(ex).slice(0, 200)); continue; }
  const html = await (await fetch(B + ex.html, { headers: H('customer') })).text(); const txt = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
  const aqA = /Air quality: ([a-z ]+?)(?: \(AQI up to (\d+)\))? on/.exec(ask.answer || '');
  const aqB = /air quality ([a-z ]+?) \(AQI up to (\d+)\)/i.exec(txt);
  const aqI = /In brief:.*?air quality up to ([a-z ]+?) \(AQI (\d+)\)/i.exec(txt);
  if (aqB) { ok(aqA && aqA[1].trim() === aqB[1].trim().toLowerCase(), p.name + ': Ask names the air quality the report names (' + (aqA && aqA[1]) + ' / ' + aqB[1] + ')', ask.answer);
    ok(aqI && aqI[1].toLowerCase() === aqB[1].toLowerCase() && aqI[2] === aqB[2], p.name + ': executive "In brief" carries the air quality of the summary (' + (aqI && aqI[1] + ' ' + aqI[2]) + ' / ' + aqB[1] + ' ' + aqB[2] + ')');
    if (aqA && aqA[2]) ok(aqA[2] === aqB[2], p.name + ': the same peak AQI in Ask and the report (' + aqA[2] + ' / ' + aqB[2] + ')'); }
  else ok(!aqA || /good|moderate/.test(aqA[1]), p.name + ': no air-quality line in the report summary, none raised in Ask', aqA && aqA[0]);
}
console.log('samevalue52D: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
