/* v91.17.283.31 · data lane rule: the global river model's FLOWS are never shown to a customer (they read 1.2-7.7x the measured flow).
   Crawls every customer GET the pages call that can carry a river value, as the customer view, and fails on any absolute model flow:
   a key naming discharge / m3/s / cumecs with a number, or a "m³/s" unit next to a number. The model's day-to-day CHANGE
   (river_flow_change*, a ratio) and the measured sheet flows (flowCusec, inflowCusec, outflowCusec) are allowed.
   NIGRAAN_TEST_BASE=http://127.0.0.1:<port> node scripts/tests28331/river_noflow_crawl.mjs */
const B = (process.env.NIGRAAN_TEST_BASE || process.env.NIGRAAN_BASE || process.argv[2] || '').replace(/\/$/, ''); if (!B) { console.log('SKIP no NIGRAAN_TEST_BASE'); process.exit(0); }
let n = 0, f = 0; const ok = (c, m, i) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c || i === undefined ? '' : '  :: ' + JSON.stringify(i).slice(0, 500))); if (!c) f++; };
const P = [[32.4359, 71.3794], [34.9058, 72.8668], [31.5204, 74.3587], [24.86, 67.01], [35.92, 74.31]];
const routes = [];
for (const [la, lo] of P) { const q = 'lat=' + la + '&lon=' + lo, q2 = 'latitude=' + la + '&longitude=' + lo;
  routes.push('/api/flood/point?' + q, '/api/point?' + q, '/api/pointstate/product?name=riverflow&' + q, '/api/pointstate/product?name=riverflow&' + q2, '/api/pointstate/run?' + q,
    '/api/site/operations?' + q, '/api/report/context?' + q, '/api/v1/forecast/point?' + q2, '/api/v1/risk/explain?' + q2, '/api/limits/evaluate?' + q + '&variable=river_discharge&threshold=1000', '/api/hyperlocal/grid?' + q); }
routes.push('/api/flood/gauges', '/api/flood/national', '/api/flood/status', '/api/levels?layer=flood_riverine', '/api/levels?layer=flood_riverine&day=1', '/api/river/measured', '/api/river/measured?station=Chashma',
  '/api/v1/forecast/national', '/api/snapshot', '/api/alerts', '/api/sources', '/api/outlook/national', '/api/map/layers');
const BADKEY = /discharge|m3s|m3_s|cumecs?\b|flowm3|qm3|_q_?m3/i, OKKEY = /river_flow_change|flowCusec|inflowCusec|outflowCusec|change|ratio|rarity|returnPeriod|rp\b|level|prob/i;
const hits = [];
function walk(o, path, route) {
  if (o == null) return;
  if (Array.isArray(o)) { o.forEach((x, i) => walk(x, path + '[' + i + ']', route)); return; }
  if (typeof o === 'object') { const unit = typeof o.unit === 'string' && /m³\/s|m3\/s|cumec/i.test(o.unit);
    for (const [k, v] of Object.entries(o)) { const num = typeof v === 'number' && v !== 0 || (Array.isArray(v) && v.some((x) => typeof x === 'number' && x !== 0));
      if (num && BADKEY.test(k) && !OKKEY.test(k)) hits.push({ route, path: path + '.' + k, v: Array.isArray(v) ? v.slice(0, 3) : v });
      else if (num && unit && /^(value|values|v|q|flow|now|today|median|p\d+|mean|max|min|control)$/i.test(k)) hits.push({ route, path: path + '.' + k, unit: o.unit, v: Array.isArray(v) ? v.slice(0, 3) : v });
      walk(v, path + '.' + k, route); } return; }
  if (typeof o === 'string' && /\b\d[\d,.]*\s*(m³\/s|m3\/s|cumecs)/i.test(o)) hits.push({ route, path, text: o.slice(0, 160) });
}
let got = 0;
for (const r of routes) { try { const res = await fetch(B + r, { headers: { 'x-agn-view': 'customer' } }); const t = await res.text(); let j = null; try { j = JSON.parse(t); } catch (_) { j = t; } if (res.status < 400) got++; walk(j, '', r); } catch (e) { /* unreachable route: nothing shown */ } }
ok(got >= 10, 'crawled ' + routes.length + ' customer routes (' + got + ' answered)');
const by = {}; for (const h of hits) (by[h.route.split('?')[0]] = by[h.route.split('?')[0]] || []).push(h);
ok(hits.length === 0, 'no absolute model river flow in any customer route', Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.slice(0, 2)])));
const pf = await fetch(B + '/v1/flood?latitude=32.4&longitude=71.4&daily=river_discharge', { headers: { 'x-agn-view': 'customer' } }).catch(() => null);
ok(!pf || pf.status === 403 || pf.status === 404, 'the raw river-model pass-through is closed to the customer view', pf && pf.status);
console.log(`\n${n - f} pass, ${f} fail`); process.exit(f ? 1 : 0);
