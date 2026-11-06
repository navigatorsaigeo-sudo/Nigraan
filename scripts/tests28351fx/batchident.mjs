/* v91.17.283.52 · F1 · a place's served record is independent of what it is asked with. Run against FRESH servers (mock provider, frozen
   clock: MOCK_FREEZE), one mode per server start, so no record is read from a cache filled by another mode:
     node batchident.mjs save <base> <places.json> <mode> <out.json>     mode: single | b5 | b36 | b100 (b100 pads the list with places.json's extra[])
     node batchident.mjs compare <single.json> <other.json>...            every record identical to the last digit (whole record, both views)
   places.json: { places: [{name, lat, lon}] (40), extra: [{name, lat, lon}] (>= 60) } */
import { readFileSync, writeFileSync } from 'node:fs';
const [mode, ...a] = process.argv.slice(2);
if (mode === 'save') { const [B, F, m, OUT] = a; const J = JSON.parse(readFileSync(F, 'utf8')), P = J.places;
  const g = async (pts, view) => { const r = await fetch(B + '/api/point/batch?pts=' + pts.map((p) => (+p.lat).toFixed(5) + ',' + (+p.lon).toFixed(5)).join(';'), { headers: { 'sec-fetch-site': 'same-origin', 'x-agn-view': view }, signal: AbortSignal.timeout(900000) }); if (r.status !== 200) throw new Error('batch ' + r.status); return (await r.json()).states; };
  const out = { customer: {}, operator: {} };
  if (m === 'single') { let i = 0; await Promise.all([0, 1, 2, 3].map(async () => { while (i < P.length) { const p = P[i++]; out.operator[p.name] = (await g([p], 'operator'))[0]; } })); }
  else { const n = m === 'b5' ? 5 : m === 'b36' ? 36 : 100; const L = m === 'b100' ? [...J.extra.slice(0, 30), ...P, ...J.extra.slice(30, 60)] : P;
    for (let i = 0; i < L.length; i += n) { const part = L.slice(i, i + n); const st = await g(part, 'operator'); part.forEach((p, k) => { if (P.includes(p)) out.operator[p.name] = st[k]; }); } }
  for (const p of P) out.customer[p.name] = (await g([p], 'customer'))[0];   /* the customer view of the same records (served from the same store) */
  writeFileSync(OUT, JSON.stringify(out)); console.log(m, Object.keys(out.operator).length, 'records'); process.exit(0); }
if (mode === 'compare') { const [base, ...others] = a.map((f) => [f, JSON.parse(readFileSync(f, 'utf8'))]); let pass = 0, fail = 0;
  for (const [f, o] of others) for (const view of ['operator', 'customer']) for (const k of Object.keys(base[1][view])) {
    const x = JSON.stringify(base[1][view][k]), y = JSON.stringify(o[view][k]);
    const okRec = base[1][view][k] && base[1][view][k].ok;
    if (x === y && okRec) pass++; else { fail++; let i = 0; while (i < x.length && x[i] === y[i]) i++; console.log('FAIL', f, view, k, okRec ? '' : '(no record: ' + (base[1][view][k] || {}).why + ')', '...' + x.slice(Math.max(0, i - 60), i + 40), ' vs ', String(y).slice(Math.max(0, i - 60), i + 40)); } }
  console.log('batchident: ' + pass + ' identical, ' + fail + ' different'); process.exit(fail ? 1 : 0); }
