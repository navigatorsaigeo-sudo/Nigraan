/* v91.17.283.51 · every report kind through the served route (POST /api/report/generate) on a real-data server: 30 places (quiet all-Normal
   places, mountains, coast, desert, cities, LoC), customer view for every kind, operator view for the five 1.0.10 kinds on 6 places; a saved
   Scenario Lab result per place (GET /api/scenario) and its scenario report; portfolio and network of all 30 sites. Each report: 200, linted,
   stored (PDF and HTML read back), customer part <= 2 pages.  usage: node kinds30.live.mjs <base> <places.json> <out.jsonl> */
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';
const [B, PF, OUT] = process.argv.slice(2); const P = JSON.parse(readFileSync(PF, 'utf8')); writeFileSync(OUT, '');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const gen = async (q, view) => { const t0 = Date.now(); const r = await fetch(B + '/api/report/generate', { method: 'POST', headers: { 'content-type': 'application/json', 'x-agn-view': view }, body: JSON.stringify(q), signal: AbortSignal.timeout(600000) }).catch((e) => ({ status: 0, json: async () => ({ why: e.message }) }));
  const j = await r.json().catch(() => ({})); return { status: r.status, j, ms: Date.now() - t0 }; };
const check = async (tag, q, view) => { const { status, j, ms } = await gen(q, view); let pdfOk = false, htmlOk = false;
  if (j.ok) { const a = await fetch(B + j.pdf + (view === 'operator' ? '?view=operator' : ''), { headers: { 'x-agn-view': view } }); const b = Buffer.from(await a.arrayBuffer()); pdfOk = a.status === 200 && b.subarray(0, 5).toString() === '%PDF-';
    const h = await fetch(B + j.html + (view === 'operator' ? '?view=operator' : ''), { headers: { 'x-agn-view': view } }); const t = await h.text(); htmlOk = h.status === 200 && /<section class="pg/.test(t); }
  ok(status === 200 && j.ok && pdfOk && htmlOk && j.customerPages <= 2, tag + ' ' + view + ': ' + status + ' ' + (j.ok ? j.id + ' ' + j.pages + 'p' : JSON.stringify(j).slice(0, 300)));
  appendFileSync(OUT, JSON.stringify({ tag, view, status, ms, id: j.id, pages: j.pages, customerPages: j.customerPages, summary: j.summary, why: j.ok ? null : (j.why || j.failures) }) + '\n'); return j; };
const KINDS = ['site_assessment', 'situation_report', 'readiness_72h', 'executive_brief', 'assurance_pack', 'weather_impact', 'data_gap', 'engineering_note'];
for (const [i, p] of P.entries()) {
  for (const k of KINDS) await check(p.id + ' ' + k, { lat: p.lat, lon: p.lon, kind: k, section: 'test' }, 'customer');
  if (i % 5 === 0) for (const k of KINDS.slice(0, 5)) await check(p.id + ' ' + k, { lat: p.lat, lon: p.lon, kind: k, section: 'test' }, 'operator');
  const sc = await fetch(B + '/api/scenario?lat=' + p.lat + '&lon=' + p.lon + '&rainMm=' + (40 + i * 3) + '&wetPct=' + (50 + i % 40), { headers: { 'x-agn-view': 'customer' }, signal: AbortSignal.timeout(300000) }).then((r) => r.json()).catch(() => null);
  if (sc && sc.ok && sc.id) await check(p.id + ' scenario', { kind: 'scenario', scenario: sc.id, section: 'scenario' }, 'customer'); else ok(false, p.id + ' scenario run: ' + JSON.stringify(sc).slice(0, 200));
  console.log(p.id, 'done', pass, fail);
}
const sites = P.map((p) => ({ lat: p.lat, lon: p.lon, name: p.name.split('|').pop(), sector: p.set }));
for (const k of ['portfolio', 'network']) for (const v of ['customer', 'operator']) await check(k + ' 30', { kind: k, sites, title: 'Thirty test places' }, v);
await check('portfolio 1', { kind: 'portfolio', sites: sites.slice(0, 1) }, 'customer');
console.log('kinds30.live: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
