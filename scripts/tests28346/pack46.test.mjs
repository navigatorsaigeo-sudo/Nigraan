/* v91.17.283.46 · the report pack carries the dashboards. usage: node pack46.test.mjs BASE DATA_DIR REPORT1.html REPORT2.html
   Stores two downloaded dashboard reports in the test server's reports library (DATA_DIR/reports, the layout reports.mjs reads), asks
   GET /api/reports/pack for both and checks that every dashboard and chart (inline SVG, inline styles) is in the pack. Test data dirs only. */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
const [BASE, DATA, A, B] = process.argv.slice(2); let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const month = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 7); const dir = join(DATA, 'reports', month); mkdirSync(dir, { recursive: true });
const ids = [A, B].map((f, i) => { const id = 'rep46test-' + Date.now() + '-' + i; const h = readFileSync(f, 'utf8'); writeFileSync(join(dir, id + '.html'), h);
  writeFileSync(join(dir, id + '.json'), JSON.stringify({ report_id: id, kind: 'Site report' }));
  appendFileSync(join(DATA, 'reports', 'index.jsonl'), JSON.stringify({ id, kind: 'Site report', title: 'Site report · rep46 test ' + i, place: 'I-8/3', edition: 'main', verdict: 'test', at: new Date().toISOString(), atPkt: 'test', month, audience: 'client', bytes: h.length }) + '\n');
  return { id, svg: (h.match(/<svg/g) || []).length, figs: (h.match(/data-rk46="/g) || []).length }; });
const r = await fetch(BASE + '/api/reports/pack?ids=' + ids.map((x) => x.id).join(','), { headers: { 'x-agn-view': 'customer' } }); const t = await r.text();
ok(r.status === 200, 'pack answered ' + r.status + (r.status !== 200 ? ' ' + t.slice(0, 200) : ''));
ok((t.match(/data-rk46="dashboard"/g) || []).length === 2, 'both dashboards are in the pack');
ok((t.match(/<svg/g) || []).length >= ids[0].svg + ids[1].svg, 'every chart is in the pack (' + (t.match(/<svg/g) || []).length + ' SVG, reports hold ' + (ids[0].svg + ids[1].svg) + ')');
ok(!/<script/i.test(t), 'no script in the pack');
writeFileSync('/tmp/claude-0/r2/rep46/pack_test.html', t); console.log('RESULT', fails ? 'FAIL' : 'PASS'); process.exit(fails ? 1 : 0);
