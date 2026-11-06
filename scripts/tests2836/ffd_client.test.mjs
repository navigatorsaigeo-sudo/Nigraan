// v91.17.283.6 item 3 · data/model-gate.json names FFD in an entry's `source` (internal: kept). No client path may show it:
//  G1 the internal file keeps the name (operator / internal views are unchanged);
//  G2 the only route that carries `source` is /api/ops/gate (gate.full()): operator scope, and every customer /api answer goes through the
//     response-point agency scrub (server.mjs installAgencyScrub -> customerscrub.mjs agencyBody): the whole gate as a customer answer
//     carries no agency name;
//  G3 the public routes (gate.publicSummary for /api/gate, gate.clientStatus for /api/report/gate-status) carry no `source` and no name;
//  G4 no page file (console, start page, NIGRAAN 3) carries the gate's source string;
//  G5 with the test runner's server: /api/ops/gate, /api/gate, /api/report/gate-status, /api/levels and /api/ai/facts as a customer
//     (x-agn-view: customer) carry no "FFD" / "PMD" / agency name.
// usage: node scripts/tests2836/ffd_client.test.mjs [base url]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), BASE = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : null;
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + String(d).slice(0, 600) : '')); } };
const { createGate } = await import(pathToFileURL(join(APP, 'server/api/gate.mjs')).href);
const { agencyBody, AGENCY_RE } = await import(pathToFileURL(join(APP, 'server/api/customerscrub.mjs')).href);
const NAME = /(?<![\w-])(?:FFD|PMD)(?![\w-])|Flood Forecasting Division|Pakistan Meteorological Department/;
const raw = readFileSync(join(APP, 'data/model-gate.json'), 'utf8');
ok(/FFD daily gauge sheets/.test(raw), 'G1 the internal gate file keeps its source wording (internal views unchanged)');
const G = createGate(join(APP, 'data')); const full = G.full();
const srcs = full.entries.filter((e) => NAME.test(String(e.source || ''))).map((e) => e.id);
const asCustomer = agencyBody(Buffer.from(JSON.stringify(full, null, 2)), 'application/json; charset=utf-8');
ok(srcs.length >= 1 && asCustomer && !NAME.test(asCustomer.toString('utf8')) && !AGENCY_RE.test(asCustomer.toString('utf8')), 'G2 the full gate as a customer /api answer (response-point scrub) carries no agency name', 'entries naming an agency in source: ' + srcs.join(','));
const idx = readFileSync(join(APP, 'server/api/index.mjs'), 'utf8'), srv = readFileSync(join(APP, 'server/server.mjs'), 'utf8');
ok(/p === '\/api\/ops\/gate'[^\n]*localOrSigned\(req\)\) return send\(res, 403/.test(idx) && /installAgencyScrub\(req, res\); await handleRequest/.test(srv), 'G2b /api/ops/gate is operator scope (403 from afar) and every request passes the agency scrub point');
const pub = JSON.stringify(G.publicSummary()), cli = JSON.stringify(G.clientStatus());
ok(!/"source"/.test(pub) && !NAME.test(pub) && !NAME.test(cli), 'G3 /api/gate and /api/report/gate-status carry no source and no agency name');
const pages = ['artefact/AI_GEO_NIGRAAN_v91_17_MACH.html', 'artefact/NIGRAAN_START.html', 'artefact/NIGRAAN_3.html'].map((f) => readFileSync(join(APP, f), 'utf8'));
ok(pages.every((t) => !/FFD daily gauge sheets/.test(t)), 'G4 no page file carries the gate source string');
if (BASE) {
  const get = async (p) => { try { const r = await fetch(BASE + p, { headers: { 'x-agn-view': 'customer' } }); return { s: r.status, t: await r.text() }; } catch (e) { return { s: 0, t: String(e) }; } };
  const R = {}; for (const p of ['/api/ops/gate', '/api/gate', '/api/report/gate-status', '/api/levels', '/api/levels?layer=flood_riverine&day=0', '/api/ai/facts?unit=Punjab%7CLahore%7CLahore%20City']) R[p] = await get(p);
  const bad = Object.entries(R).filter(([, v]) => NAME.test(v.t)).map(([p]) => p);
  ok(!bad.length, 'G5 customer answers of the gate, levels and AI facts routes carry no agency name', JSON.stringify(Object.fromEntries(Object.entries(R).map(([p, v]) => [p, v.s]))) + (bad.length ? ' named in ' + bad.join(',') : ''));
  ok(R['/api/ops/gate'].s === 200 ? /"source"/.test(R['/api/ops/gate'].t) : true, 'G5b the operator route answered the local runner (as a customer view: scrubbed, sources still there)', R['/api/ops/gate'].s);
} else console.log('SKIP G5 (no server URL)');
console.log(`\nffd_client ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
