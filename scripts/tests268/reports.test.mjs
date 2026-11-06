import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.268 · SERVER · the reports library (v91.17.270 adds E: the short edition and the logo) (server/api/reports.mjs), the client gate status (gate.mjs clientStatus) and the past-30
   read de-duplication (past30.mjs opts.cacheMs).
     node scripts/tests268/reports.test.mjs [baseUrl]
   With a baseUrl the HTTP checks run against that server (its data folder must be this copy's data/, or NIGRAAN_DATA_DIR); without one
   the test starts its own server on a throw-away data folder (port REPORTS_TEST_PORT, default 8834) with the gate and label files copied.
   Every report this test issues carries the prefix T268- and is archived at the end (archiving moves, nothing is deleted).
   L · library: issue (200, id, at, url), dup (same id → dup:true, stored copy unchanged), bad id / missing html / html over 12 MB /
       bad edition → 400, list newest first, edition filter, html with the CSP and nosniff headers, .json is the record, pack (2..12 ids,
       order kept, one .rk-pb per report, summary table with each stored verdict, kit cover "Report pack", CSP), archive moves both files
       to data/reports/_archive (no file deleted, index line appended), archived reports leave the list and answer 404
   W · write protection: a relayed customer-view POST (proxy header) and a cross-site POST are refused; the customer view never lists,
       opens or packs a report the operator view issued
   G · GET /api/report/gate-status: entries {id, name, status, layers, limitations}, status one of the four gate words, no PMD / FFD,
       no skill figure or internal file in names or limitations, no source / method / skill fields, layer ids map to entries
   P · past 30 days: concurrent calls for one point share one read, an ok answer is kept for cacheMs, an ok:false answer is never kept,
       without cacheMs every call reads; the served route answers two concurrent differently-headed requests with the same body */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && d != null ? ' :: ' + String(d).slice(0, 400) : '')); };

let BASE = (process.argv[2] || '').replace(/\/$/, ''), DATA = process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), srv = null, TMP = null;
if (!BASE) {
  const PORT = Number(process.env.REPORTS_TEST_PORT || await __T.freePort()); BASE = 'http://127.0.0.1:' + PORT;
  TMP = mkdtempSync(join(tmpdir(), 'v268-reports-')); DATA = TMP;
  for (const f of ['model-gate.resolved.json', 'model-gate.json', 'source-labels.json', 'hazard-scale.json']) if (existsSync(join(ROOT, 'data', f))) copyFileSync(join(ROOT, 'data', f), join(DATA, f));
  const env = { ...process.env, PORT: String(PORT), NIGRAAN_DATA_DIR: DATA, NIGRAAN_WORKER: '0', NIGRAAN_AUTO_SCHEDULE: '0', NIGRAAN_ENGINE: '0', NIGRAAN_VCARCHIVE: '0', NIGRAAN_SWEEP_WARM: '0', HOST: '127.0.0.1' };
  srv = spawn(process.execPath, [join(ROOT, 'server', 'server.mjs')], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'ignore'] });
  process.on('exit', () => { try { srv.kill('SIGKILL'); } catch (_) {} try { rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });
}
const req = async (path, { method = 'GET', headers = {}, body } = {}) => {
  /* v91.17.283.12: a loopback caller is the customer view unless it asks for the operator view (x-agn-view: operator) explicitly */
  const r = await fetch(BASE + path, { method, headers: { 'x-agn-view': 'operator', ...(body != null ? { 'content-type': 'application/json' } : {}), ...headers }, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)), signal: AbortSignal.timeout(60000) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {} return { s: r.status, j, t, h: r.headers };
};
const CUST = { 'x-agn-view': 'customer' };
for (let i = 0; i < 90; i++) { try { if ((await fetch(BASE + '/health', { signal: AbortSignal.timeout(3000) })).status === 200) break; } catch (_) {} await new Promise((r) => setTimeout(r, 500)); }

/* ── L · library ── */
const RUN = 'T268-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const doc = (n, extra = '') => '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>R' + n + '</title><style>.rk{color:#1F2A24}.rk-pb{break-before:page}' + (n === 3 ? '.only3{color:#4F5D55}' : '') + '</style></head><body>'
  + '<div class="rk"><section class="rk-cover"><div class="kind">Situation report</div><h1>Place ' + n + '</h1></section><h2 id="body-' + RUN + '-' + n + '">Report body ' + n + '</h2>' + extra + '</div><script>alert(1)</script></body></html>';
const issueOf = (n, o = {}) => ({ section: 'operations', record: { report_id: RUN + '-' + n, kind: 'Situation report', run: '2026-10-15T00:00Z', inputs: { n }, record_version: '1', lat: 31.5204, lon: 74.3587 /* v283.28 S9: a report is issued from a place record */ }, html: doc(n), title: 'Situation report ' + n,   /* v91.17.283.8 · audit 15: every kind needs its section */
  
  place: n === 3 ? 'Gilgit' : 'Lahore', edition: n === 4 ? 'customize' : 'main', verdict: 'Verdict ' + n + ': rule-built sentence.', ...o });
const ids = [];
for (const n of [1, 2, 3, 4]) { const r = await req('/api/reports/issue', { method: 'POST', body: issueOf(n), headers: n === 4 ? CUST : {} }); ids.push(RUN + '-' + n);
  ok(r.s === 200 && r.j && r.j.ok === true && r.j.id === RUN + '-' + n && r.j.url === '/api/reports/' + RUN + '-' + n && !Number.isNaN(Date.parse(r.j.at)) && !r.j.dup, 'L issue ' + n + ' → 200 {ok, id, at, url}', r.s + ' ' + r.t);
  await new Promise((x) => setTimeout(x, 15)); }
{ const r = await req('/api/reports/issue', { method: 'POST', body: { ...issueOf(1), html: doc(1, '<p>CHANGED</p>') } });
  const h = await req('/api/reports/' + ids[0]);
  ok(r.s === 200 && r.j.ok === true && r.j.dup === true && r.j.id === ids[0] && !h.t.includes('CHANGED'), 'L the same id again → 200 dup:true, the stored copy is not rewritten', r.t); }
for (const [name, body, code] of [['bad id (too short)', { ...issueOf(9), record: { report_id: 'ab' } }, 'bad_id'], ['bad id (characters)', { ...issueOf(9), record: { report_id: 'NIGRAAN-SIT/../x-123' } }, 'bad_id'],
  ['missing html', { ...issueOf(9), html: '' }, 'missing_html'], ['bad edition', { ...issueOf(9), edition: 'other' }, 'bad_edition'], ['no record', { html: doc(9) }, 'bad_record']]) {
  const r = await req('/api/reports/issue', { method: 'POST', body }); ok(r.s === 400 && r.j && r.j.ok === false && r.j.error === code, 'L ' + name + ' → 400 ' + code, r.s + ' ' + r.t); }
{ const big = issueOf(8, { html: doc(8, 'x'.repeat(12 * 1048576)) }); const r = await req('/api/reports/issue', { method: 'POST', body: big });
  ok(r.s === 400 && r.j && r.j.error === 'html_too_large', 'L html over 12 MB → 400 html_too_large', r.s + ' ' + r.t.slice(0, 200));
  const l = await req('/api/reports?limit=1000'); ok(!(l.j.reports || []).some((x) => x.id === RUN + '-8'), 'L the oversize report is not stored'); }
{ const r = await req('/api/reports?limit=1000'); const mine = (r.j.reports || []).filter((x) => x.id.startsWith(RUN));
  ok(r.s === 200 && r.j.ok === true && mine.map((x) => x.id).join() === [ids[3], ids[2], ids[1], ids[0]].join(), 'L list newest first', JSON.stringify(mine.map((x) => x.id)));
  const x = mine.find((y) => y.id === ids[0]);
  ok(x && ['id', 'kind', 'title', 'place', 'edition', 'verdict', 'at', 'atPkt', 'run', 'bytes'].every((k) => k in x) && /^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} PKT$/.test(x.atPkt) && x.bytes === Buffer.byteLength(doc(1)) && x.run === '2026-10-15T00:00Z' && x.verdict === 'Verdict 1: rule-built sentence.',
    'L list row: id, kind, title, place, edition, verdict, at (ISO), atPkt (PKT), run, bytes', JSON.stringify(x));
  const m = await req('/api/reports?edition=main&limit=1000'), c = await req('/api/reports?edition=customize&limit=1000');
  ok(m.j.reports.filter((y) => y.id.startsWith(RUN)).length === 3 && m.j.reports.every((y) => y.edition === 'main') && c.j.reports.filter((y) => y.id.startsWith(RUN)).map((y) => y.id).join() === ids[3] && c.j.reports.every((y) => y.edition === 'customize'), 'L edition filter (main 3, customize 1)');
  const l2 = await req('/api/reports?limit=2'); ok(l2.j.reports.length <= 2, 'L limit honoured');
  const bad = await req('/api/reports?edition=x'); ok(bad.s === 400, 'L an unknown edition in the list → 400'); }
{ const r = await req('/api/reports/' + ids[0]);
  ok(r.s === 200 && /^text\/html/.test(r.h.get('content-type')) && r.h.get('content-security-policy') === "default-src 'none'; style-src 'unsafe-inline'; img-src data:" && r.h.get('x-content-type-options') === 'nosniff' && r.t === doc(1),
    'L GET /api/reports/<id> → the stored HTML, text/html, CSP and nosniff', r.s + ' ' + r.h.get('content-security-policy'));
  const d = await req('/api/reports/' + ids[0] + '?download=1'); ok(/attachment; filename="T268-/.test(d.h.get('content-disposition') || ''), 'L ?download=1 sends it as a file');
  const j = await req('/api/reports/' + ids[0] + '.json'); ok(j.s === 200 && j.j && j.j.report_id === ids[0] && j.j.inputs && j.j.inputs.n === 1 && j.j.record_version === '1', 'L GET /api/reports/<id>.json → the record', j.t);
  const n = await req('/api/reports/' + RUN + '-77'); ok(n.s === 404 && n.j.error === 'report_not_found', 'L an unknown id → 404'); }
{ const order = [ids[2], ids[0], ids[1]]; const r = await req('/api/reports/pack?ids=' + order.join(','));
  const pos = order.map((id) => r.t.indexOf('id="body-' + id + '"'));
  ok(r.s === 200 && /^text\/html/.test(r.h.get('content-type')) && r.h.get('content-security-policy') === "default-src 'none'; style-src 'unsafe-inline'; img-src data:" && r.h.get('x-content-type-options') === 'nosniff', 'L pack → text/html with the CSP and nosniff', r.s + ' ' + r.t.slice(0, 200));
  ok(pos.every((p) => p > 0) && pos[0] < pos[1] && pos[1] < pos[2], 'L pack keeps the order asked', JSON.stringify(pos));
  ok((r.t.match(/<div class="rk-pb">/g) || []).length === 3, 'L pack: each report starts on a new page (.rk-pb ×3)');
  ok(/<section class="rk-cover">.*?<div class="kind">Report pack<\/div>/.test(r.t) && /<style>\.rk\{color:#1F2A24\}/.test(r.t), 'L pack: kit cover kind "Report pack"; the kit CSS of the stored reports');
  const css = (/<style>([\s\S]*?)<\/style>/.exec(r.t) || [])[1] || '';
  ok((css.match(/\.rk\{color:#1F2A24\}/g) || []).length === 2 && css.includes('.only3{color:#4F5D55}') && (r.t.match(/<style/g) || []).length === 1, 'L pack: each distinct stylesheet of the stored reports once, in one <style>', css.slice(0, 300));
  ok(/\.rk-pb \.rk-cover\{page:rkcover\}@page rkcover\{@top-left\{content:none\}/.test(css), 'L pack: the cover of each report prints without the running header and footer (named page)');
  const rows = [...r.t.matchAll(/<tr><td>(Situation report \d)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)].map((m) => m.slice(1));
  ok(rows.length === 3 && rows.map((x) => x[0]).join() === 'Situation report 3,Situation report 1,Situation report 2' && rows[0][1] === 'Gilgit' && rows[0][3] === 'Verdict 3: rule-built sentence.' && rows.every((x) => / PKT$/.test(x[2])),
    'L pack summary table: report, place, issued (PKT), each stored verdict, in order', JSON.stringify(rows));
  ok(!/<script/i.test(r.t), 'L pack carries no script');
  for (const [what, q, s] of [['one id', ids[0], 400], ['13 ids', ids.concat(ids, ids, ids).slice(0, 13).join(','), 400], ['a repeated id', ids[0] + ',' + ids[0], 400], ['an unknown id', ids[0] + ',' + RUN + '-77', 404], ['a malformed id', ids[0] + ',bad id!', 400]])
    { const x = await req('/api/reports/pack?ids=' + encodeURIComponent(q).replace(/%2C/g, ',')); ok(x.s === s, 'L pack with ' + what + ' → ' + s, x.s + ' ' + x.t.slice(0, 120)); } }

/* ── W · write protection and audience ── */
{ const r = await req('/api/reports/issue', { method: 'POST', body: issueOf(5), headers: { ...CUST, 'x-forwarded-for': '203.0.113.9' } });
  ok(r.s === 403, 'W a relayed customer-view POST (proxy header) is refused', r.s + ' ' + r.t);
  const x = await req('/api/reports/issue', { method: 'POST', body: issueOf(5), headers: { origin: 'http://evil.example' } });
  ok(x.s === 403 && /cross_site/.test(x.t), 'W a cross-site POST is refused', x.s + ' ' + x.t);
  const a = await req('/api/reports/' + ids[0] + '/archive', { method: 'POST', headers: { ...CUST, 'x-forwarded-for': '203.0.113.9' } }); ok(a.s === 403, 'W a relayed archive POST is refused', a.s);
  const cl = await req('/api/reports?limit=1000', { headers: CUST }); const mine = cl.j.reports.filter((y) => y.id.startsWith(RUN)).map((y) => y.id);
  ok(mine.join() === ids[3], 'W the customer view lists only the report the customer view issued (operator reports stay out)', JSON.stringify(mine));
  const ch = await req('/api/reports/' + ids[0], { headers: CUST }), cj = await req('/api/reports/' + ids[0] + '.json', { headers: CUST }), cp = await req('/api/reports/pack?ids=' + ids[3] + ',' + ids[0], { headers: CUST });
  ok(ch.s === 404 && cj.s === 404 && cp.s === 404, 'W the customer view cannot open, read or pack an operator report', [ch.s, cj.s, cp.s].join());
  const ca = await req('/api/reports/' + ids[0] + '/archive', { method: 'POST', headers: CUST }); ok(ca.s === 404, 'W the customer view cannot archive an operator report', ca.s);
  const oh = await req('/api/reports/' + ids[3]); ok(oh.s === 200, 'W the operator view opens a customer-issued report'); }

/* ── L · archive ── */
{ const e = ids[1]; const month = readdirSync(join(DATA, 'reports')).filter((d) => /^\d{4}-\d{2}$/.test(d)).find((d) => existsSync(join(DATA, 'reports', d, e + '.html')));
  ok(!!month, 'L storage: data/reports/<YYYY-MM>/<id>.html + .json', month);
  const before = month ? [existsSync(join(DATA, 'reports', month, e + '.html')), existsSync(join(DATA, 'reports', month, e + '.json'))] : [];
  const r = await req('/api/reports/' + e + '/archive', { method: 'POST' });
  const after = month ? [existsSync(join(DATA, 'reports', month, e + '.html')), existsSync(join(DATA, 'reports', month, e + '.json'))] : [];
  const arch = [existsSync(join(DATA, 'reports', '_archive', e + '.html')), existsSync(join(DATA, 'reports', '_archive', e + '.json'))];
  ok(r.s === 200 && r.j.ok === true && before.join() === 'true,true' && after.join() === 'false,false' && arch.join() === 'true,true' && readFileSync(join(DATA, 'reports', '_archive', e + '.html'), 'utf8') === doc(2),
    'L archive moves both files to data/reports/_archive (nothing deleted)', JSON.stringify({ s: r.s, before, after, arch }));
  const ix = readFileSync(join(DATA, 'reports', 'index.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  ok(ix.some((x) => x.id === e && !x.op) && ix.some((x) => x.id === e && x.op === 'archive'), 'L the index keeps the issue line and appends an archive line');
  const l = await req('/api/reports?limit=1000'), g = await req('/api/reports/' + e), p = await req('/api/reports/pack?ids=' + ids[0] + ',' + e), again = await req('/api/reports/' + e + '/archive', { method: 'POST' });
  ok(!l.j.reports.some((x) => x.id === e) && g.s === 404 && p.s === 404 && again.s === 200 && again.j.already === true, 'L an archived report leaves the list, answers 404, cannot be packed; archiving again is a no-op', [g.s, p.s, again.t].join(' ')); }

/* ── G · gate status ── */
{ const r = await req('/api/report/gate-status'), c = await req('/api/report/gate-status', { headers: CUST });
  const E = (r.j && r.j.entries) || [];
  ok(r.s === 200 && r.j.ok === true && typeof r.j.version === 'string' && E.length > 10, 'G gate-status answers {ok, version, entries}', r.s + ' ' + r.t.slice(0, 200));
  ok(E.every((e) => typeof e.id === 'string' && typeof e.name === 'string' && ['operational', 'provisional', 'reference', 'experimental'].includes(e.status) && Array.isArray(e.layers) && Array.isArray(e.limitations)), 'G each entry: id, name, status (one of the four gate words), layers, limitations');
  ok(E.every((e) => Object.keys(e).sort().join() === 'id,layers,limitations,name,status'), 'G no source, method, calibration, test or skill field leaves the route', JSON.stringify(Object.keys(E[0] || {})));
  const txt = JSON.stringify(E.map((e) => [e.name, e.limitations]));
  ok(!/(?<![\w-])(PMD|FFD)(?![\w-])|Pakistan Meteorological|Flood Forecasting Division/i.test(r.t) && !/(?<![\w-])(PMD|FFD)(?![\w-])/.test(c.t), 'G no PMD or FFD in either view');
  ok(!/\b(MAE|RMSE|FAR|POD|CSI|Brier|AUC|bias|hit rate)\b|held-out|\.py\b|\.md\b|audit\d|station-lake|v91\.17/i.test(txt), 'G no skill figure, internal file, audit or build number in names or limitations', txt.match(/.{40}\b(MAE|RMSE|FAR|POD|CSI|Brier|AUC|bias|hit rate)\b.{20}|held-out.{20}|.{20}\.py\b|audit\d.{10}/i));
  const g = JSON.parse(readFileSync(join(ROOT, 'data', 'model-gate.resolved.json'), 'utf8')); const w = g.entries.find((e) => e.id === 'wind'); const ew = E.find((e) => e.id === 'wind');
  ok(w && ew && w.known_limitations.some((l) => /FAR/.test(l)) && ew.limitations.includes('withheld above 1,500 m'), 'G a score in brackets is cut, the limitation kept ("withheld above 1,500 m")', JSON.stringify(ew && ew.limitations));
  const dr = E.find((e) => e.id === 'drought'); /* v91.17.279 · CLAIMS279 S-03/P1: a limitation is never dropped; the score is rewritten in plain words (model-gate.json client_limitations) */
  ok(dr && !dr.limitations.some((l) => /POD|0\.41/.test(l)) && dr.limitations.length === g.entries.find((e) => e.id === 'drought').known_limitations.length && dr.limitations.some((l) => /4 in 10 dry months/.test(l)), 'G a limitation that is a score ("POD only 0.41") reaches the client in plain words, none left out');
  const own = r.j.layerOwner || {}; ok(own.rain_hz && E.some((e) => e.id === own.rain_hz && e.layers.includes('rain_hz')) && own.heat && own.rainfall === own.rain_hz, 'G layerOwner maps a layer id (rain_hz, heat, the rainfall alias) to its entry', JSON.stringify({ rain_hz: own.rain_hz, heat: own.heat, rainfall: own.rainfall }));
  ok(E.every((e) => e.layers.every((x) => x)), 'G no empty layer id'); }

/* ── P · past 30 days ── */
{
  const { createPast30 } = await import(join(ROOT, 'server/api/past30.mjs'));
  const { buildUnitIndex } = await import(join(ROOT, 'server/api/national.mjs'));
  const units = buildUnitIndex(JSON.parse(readFileSync(join(ROOT, 'server/contract/units.json'), 'utf8')), null);
  const RULE = JSON.parse(readFileSync(join(ROOT, 'data', 'mach-siting.json'), 'utf8')).rule;
  const T = mkdtempSync(join(tmpdir(), 'v268-p30-')); const D = join(T, 'data'); mkdirSync(join(D, 'imerg', 'pkt'), { recursive: true });
  const { pktDay } = await import(join(ROOT, 'server/api/pktday.mjs')); const y = new Date(Date.parse(pktDay(Date.now()) + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
  const { unitAtPoint } = await import(join(ROOT, 'server/api/unitresolve.mjs')); const uid = unitAtPoint({ dataDir: join(ROOT, 'data'), units }, 33.6844, 73.0479).unit.unitId;
  (await import('node:fs')).writeFileSync(join(D, 'imerg', 'pkt', y + '.json'), JSON.stringify({ date: y, units: { [uid]: 4.2 } }));
  let reads = 0; const app = { dataDir: join(ROOT, 'data'), units, fleet: { screenRule: () => RULE, stations: () => { reads++; return []; }, screen: () => null, elevOf: () => null }, climatology: { normals: () => null } };
  const P = createPast30(app, D, { cacheMs: 60000 }); const q = { lat: 33.6844, lon: 73.0479, days: 30 };
  const [a, b] = await Promise.all([P.at(q), P.at(q)]);
  ok(a.ok === true && a === b && reads === 1, 'P two concurrent calls for one point share one read', 'reads=' + reads + ' ok=' + a.ok);
  const c = await P.at({ ...q }); ok(c === a && reads === 1, 'P a later call within cacheMs is answered from the kept answer (no read)', 'reads=' + reads);
  const d = await P.at({ ...q, days: 10 }); ok(d.ok === true && d.days === 10 && reads === 2, 'P another window is another key (one more read)', 'reads=' + reads);
  const e1 = await P.at({ lat: 27.0, lon: 62.5 }), e2 = await P.at({ lat: 27.0, lon: 62.5 }); ok(e1.ok === false && e2.ok === false && reads === 4, 'P an ok:false answer is never kept (each call reads again)', 'reads=' + reads);
  const P0 = createPast30(app, D); reads = 0; await Promise.all([P0.at(q), P0.at(q)]); ok(reads === 2, 'P without cacheMs every call reads (the unit tests and the old behaviour)', 'reads=' + reads);
  rmSync(T, { recursive: true, force: true });
  const u = '/api/report/past30?lat=31.5204&lon=74.3587&days=30'; const t0 = Date.now();
  const [s1, s2] = await Promise.all([req(u), req(u, { headers: CUST })]);
  ok(s1.s === s2.s && s1.j && s2.j && typeof s1.j.ok === 'boolean' && JSON.stringify(s1.j.daily || s1.j.reason) === JSON.stringify(s2.j.daily || s2.j.reason), 'P the served route: two concurrent differently-headed requests get the same answer (' + (Date.now() - t0) + ' ms)', s1.s + ' ' + s2.s);
}

/* ── v91.17.270 · E · the short edition and the logo: a 2-page brief is its own document (its own id, kind "… (short edition)") beside the
   full report; a report carrying the AGN logo as a data: image is stored as sent and served under img-src data: (no other source) ── */
{ const logo = '<img class="rk-logo" src="data:image/png;base64,iVBORw0KGgo=" alt="AI Geo Navigators">';
  const full = issueOf(5, { html: doc(5, logo) }), brief = issueOf(6, { html: doc(6, logo), title: 'Situation report (short) 6' }); brief.record = { ...brief.record, kind: 'Situation report (short edition)', edition: 'short' };
  const a = await req('/api/reports/issue', { method: 'POST', body: full }), b = await req('/api/reports/issue', { method: 'POST', body: brief }); ids.push(RUN + '-5', RUN + '-6');
  const h = await req('/api/reports/' + RUN + '-6'), j = await req('/api/reports/' + RUN + '-6.json'), l = await req('/api/reports?limit=1000');
  ok(a.s === 200 && b.s === 200 && !b.j.dup && h.t === doc(6, logo) && /img-src data:/.test(h.h.get('content-security-policy') || '') && !/img-src [^;]*(https?:|\*)/.test(h.h.get('content-security-policy') || ''),
    'E short edition issued as its own document; the logo travels as a data: image under img-src data: only', [a.s, b.s, h.h.get('content-security-policy')].join(' '));
  ok(j.j && j.j.kind === 'Situation report (short edition)' && j.j.edition === 'short' && l.j.reports.some((x) => x.id === RUN + '-6' && /\(short\)/.test(x.title)), 'E the record and the list carry the short edition', JSON.stringify(j.j).slice(0, 200)); }

/* clean-up: every report this run issued is archived (moved, not deleted) */
for (const id of ids) await req('/api/reports/' + id + '/archive', { method: 'POST' });
{ const l = await req('/api/reports?limit=1000'); ok(!l.j.reports.some((x) => x.id.startsWith(RUN)), 'clean-up: this run\'s reports are archived'); }
console.log(`\n${fail ? 'FAIL' : 'PASS'} reports268: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
