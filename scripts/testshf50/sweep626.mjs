/* sweep626: the site report (customer view) for every point of points626.json through the served routes: generate (linted, stored),
   the HTML view opens (200, html, report id), the PDF is there. A failure is re-asked in the operator view for the lint failures.
   usage: node sweep626.mjs <base> <points.json> <out.jsonl> [concurrency] */
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
const [B, PF, OUT, CC] = [process.argv[2], process.argv[3], process.argv[4], +(process.argv[5] || 2)];
const P = JSON.parse(readFileSync(PF, 'utf8'));
const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.ok).map((r) => r.id) : []);
const post = (view, q) => fetch(B + '/api/report/generate', { method: 'POST', headers: { 'content-type': 'application/json', 'x-agn-view': view }, body: JSON.stringify(q), signal: AbortSignal.timeout(240e3) })
  .then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) })).catch((e) => ({ status: 0, j: { why: String(e.message || e) } }));
let i = 0, pass = 0, fail = 0;
async function one(p) {
  const t0 = Date.now(), q = { lat: p.lat, lon: p.lon, kind: 'site_assessment', section: 'assets', edition: 'main' };
  let r = await post('customer', q); if (r.status === 0 || r.status === 503 || r.status === 429) { await new Promise((s) => setTimeout(s, 5000)); r = await post('customer', q); }
  const row = { id: p.id, set: p.set, name: p.name, lat: p.lat, lon: p.lon, status: r.status, ms: Date.now() - t0 };
  if (r.status === 200 && r.j && r.j.ok) {
    const h = await fetch(B + r.j.html).catch(() => null); const ht = h ? await h.text() : '';
    const pd = await fetch(B + r.j.pdf).catch(() => null); const pb = pd ? Buffer.from(await pd.arrayBuffer()) : Buffer.alloc(0);
    row.report = r.j.id; row.pages = r.j.pages; row.summary = r.j.summary;
    row.opens = !!(h && h.status === 200 && /text\/html/.test(h.headers.get('content-type') || '') && ht.includes(r.j.id) && /class="pg"/.test(ht));
    row.pdf = !!(pd && pd.status === 200 && pb.subarray(0, 5).toString() === '%PDF-');
    row.ok = row.opens && row.pdf;
  } else { row.ok = false; row.why = r.j && (r.j.why || r.j.error);
    const o = await post('operator', q); row.opStatus = o.status; row.failures = o.j && (o.j.failures || o.j.why); }
  if (row.ok) pass++; else { fail++; console.log('FAIL', p.id, p.name, row.status, JSON.stringify(row.failures || row.why || '').slice(0, 500)); }
  appendFileSync(OUT, JSON.stringify(row) + '\n');
}
const todo = P.filter((p) => !done.has(p.id)); pass = done.size;
async function worker() { while (i < todo.length) { const p = todo[i++]; await one(p); if ((pass + fail) % 25 === 0) console.log('progress', pass + fail, '/', P.length, 'pass', pass, 'fail', fail, new Date().toISOString()); } }
await Promise.all(Array.from({ length: CC }, worker));
console.log('sweep626: ' + pass + '/' + P.length + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
