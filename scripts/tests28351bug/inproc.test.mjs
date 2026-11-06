/* v91.17.283.51 · B2: the place answer assembled IN-PROCESS by the server (GET /api/place/answer: its parts read through the request listener,
   server/api/inproc.mjs) is the same object as the place answer assembled from the SAME parts read over HTTP (placeanswer.mjs with no
   in-process listener: the 1.0.10 path), for every place of the list, in both views. Timing: cold (first ask), warm (second ask).
   usage: PORT=<port> node inproc.test.mjs <places.json> [n]   (the server on PORT runs the tree under test) */
import { readFileSync } from 'node:fs';
const { createPlaceAnswer } = await import(new URL('../../server/api/placeanswer.mjs', import.meta.url));
const P = JSON.parse(readFileSync(process.argv[2], 'utf8')).slice(0, Number(process.argv[3] || 50)), B = 'http://127.0.0.1:' + process.env.PORT;
const { agencyBody } = await import(new URL('../../server/api/customerscrub.mjs', import.meta.url));
const HTTP = createPlaceAnswer({});
/* the route's answer passes the customer response scrub (server.mjs installAgencyScrub) like every customer /api answer: the object assembled
   here is put through the same function before the comparison; provenance.digest is made per request by /api/report/context (two calls of
   that route in a row differ), so it is left out on both sides */
const asServed = (A, view) => { const t = JSON.stringify(A); if (view !== 'customer') return JSON.parse(t); const o = agencyBody(Buffer.from(t), 'application/json'); return JSON.parse(o ? o.toString('utf8') : t); };
const strip = (A) => { const x = JSON.parse(JSON.stringify(A)); if (x.provenance) delete x.provenance.digest; return x; };   /* no app.inject: every part over the port, as 1.0.10 */
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const diff = (a, b, p = '') => { if (JSON.stringify(a) === JSON.stringify(b)) return []; if (a && b && typeof a === 'object' && typeof b === 'object') { const ks = new Set([...Object.keys(a), ...Object.keys(b)]); return [...ks].flatMap((k) => diff(a[k], b[k], p + '.' + k)).slice(0, 6); } return [p]; };
const cold = [], warm = [];
for (const p of P) for (const view of ['customer', 'operator']) {
  const q = 'lat=' + p.lat + '&lon=' + p.lon;
  let t0 = Date.now(); const r1 = await fetch(B + '/api/place/answer?' + q, { headers: { 'x-agn-view': view } }); const A1 = await r1.json(); const tc = Date.now() - t0;
  t0 = Date.now(); const A1b = await (await fetch(B + '/api/place/answer?' + q, { headers: { 'x-agn-view': view } })).json(); const tw = Date.now() - t0;
  if (view === 'customer') { cold.push(tc); warm.push(tw); }
  const A2 = await HTTP.answer({ lat: p.lat, lon: p.lon }, { customer: view === 'customer' });
  const d = diff(strip(A1), strip(asServed(A2, view))); ok(d.length === 0 && A1.answerId === A1b.answerId, p.id + ' ' + view + ': in-process = over HTTP' + (d.length ? ' differ at ' + d.join(', ') : ''));
}
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
console.log('place answer customer: cold p50 ' + q(cold, .5) + ' ms, p90 ' + q(cold, .9) + ' ms, max ' + q(cold, 1) + ' ms; warm p50 ' + q(warm, .5) + ' ms, max ' + q(warm, 1) + ' ms');
console.log('inproc: ' + pass + ' pass, ' + fail + ' fail (' + P.length + ' places x 2 views)'); process.exit(fail ? 1 : 0);
