/* v91.17.283.49 merge · SAME VALUE IN THE REPORT. For the 5 places of samevalue113 the server report (POST /api/report/generate, customer
   view, site report) is made and its 'Now at the site' line (data-shown spans of the stored HTML view, server/api/repengine.mjs) is compared
   string for string with the served place answer read at the same moment (GET /api/point shown: now, nowLabel, todayLow, todayHigh,
   measured). A difference is tried again once (the place answer may have moved to the next hour between the two calls).
   usage: node scripts/tests28349dat/samereport113.test.mjs <base>      exit 0 all pass */
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const PLACES = (process.env.PLACES || '33.66443,73.08339,Islamabad I-8;31.51500,74.38800,Lahore Cantt;24.81380,67.03000,Karachi coast;35.92080,74.30800,Gilgit;30.17980,66.97500,Quetta').split(';').map((x) => { const a = x.split(','); return { lat: +a[0], lon: +a[1], name: a.slice(2).join(',') }; });
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i != null ? ' :: ' + String(i).slice(0, 300) : '')); } };
/* an idle keep-alive socket closed by the server is answered ECONNRESET by Node's fetch: one retry (client side, not a server fault) */
const rfetch = async (u, o) => { try { return await fetch(u, o); } catch (e) { await new Promise((r) => setTimeout(r, 500)); return fetch(u, o); } };
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
async function once(P) {
  const g = await rfetch(BASE + '/api/report/generate', { method: 'POST', headers: { 'content-type': 'application/json', 'x-agn-view': 'customer' }, body: JSON.stringify({ lat: P.lat, lon: P.lon, kind: 'site_assessment', section: 'operations' }) });
  const j = await g.json().catch(() => null); if (!j || !j.ok) return { err: 'generate ' + g.status + ' ' + JSON.stringify(j).slice(0, 200) };
  const html = await (await rfetch(BASE + j.html)).text();
  const B = await (await rfetch(BASE + '/api/point?lat=' + P.lat.toFixed(5) + '&lon=' + P.lon.toFixed(5), { headers: { 'x-agn-view': 'customer' } })).json(); const SH = B.shown;
  const got = (k) => { const m = new RegExp('data-shown="' + k + '"[^>]*>([^<]*)<').exec(html); return m ? norm(unesc(m[1])) : null; };
  const want = { now: SH.now.value, nowLabel: SH.now.label, todayLow: SH.today.low, todayHigh: SH.today.high, measured: norm((SH.measured.value != null ? SH.measured.value + ' °C · ' : '') + SH.measured.label) };
  return { id: j.id, rows: Object.entries(want).map(([k, w]) => [k, norm(w), got(k)]) };
}
for (const P of PLACES) {
  let r = await once(P); if (!r.err && r.rows.some(([, w, g]) => w !== g)) r = await once(P);
  if (r.err) { ok(false, P.name + ': report made', r.err); continue; }
  for (const [k, w, g] of r.rows) ok(w === g, P.name + ' · report ' + r.id + ' · ' + k + ' = served "' + w + '"', g);
}
console.log('samereport113: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
