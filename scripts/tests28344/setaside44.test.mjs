/* v91.17.283.44 (NIGRAAN 1.0.7.1) . test projects off the Client Risk list (server/api/casesetaside.mjs). Run against a TEST server that
   holds a copy of the laptop store (it moves projects and puts them back):  node scripts/tests28344/setaside44.test.mjs <base url>
   1 the operator test namespace (_test-...) is stored and read by id but never listed; 2 set-aside by id refuses ids outside the
   namespace (422) and a relayed / customer-view request (403); 3 the test-clutter rule moves only the exact test names and keeps
   demo-indus; the rows leave the store with their fields, interventions and snapshots; a second run moves nothing; 4 restore puts every
   moved project back (same list as before); 5 the rule again (the state DEPLOY leaves). Exit 1 on any FAIL. */
const B = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
let pass = 0, fail = 0; const ok = (c, n, x) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); } };
const J = async (p, m = 'GET', body, h = {}) => { const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, json: j }; };
const list = async () => ((await J('/api/case/project')).json || {}).projects || [];
const L0 = await list(); const ids0 = L0.map((p) => p.projectId).sort();
console.log('projects listed at start: ' + L0.length);
const TID = '_test-sa44-' + Date.now().toString(36);
const put = await J('/api/case/project', 'PUT', { manifest: { project_schema_version: 3, project_id: TID, client_name: 'SA44 test (not a client)' }, assets: [{ asset_id: 'S1', name: 'sa44', latitude: 33.7, longitude: 73.0 }] });
ok(put.status === 200 && put.json && put.json.projectId === TID, '1 a project in the test namespace is stored', JSON.stringify(put.json));
ok(!(await list()).some((p) => p.projectId === TID), '1 the test-namespace project is not on the customer list');
ok(((await J('/api/case/project?id=' + TID)).json || {}).projectId === TID, '1 it is read by id');
const bad = await J('/api/ops/case/set-aside', 'POST', { ids: ['demo-indus'] });
ok(bad.status === 422, '2 set-aside by id refuses an id outside the test namespace (422)', bad.status + ' ' + JSON.stringify(bad.json));
const relay = await J('/api/ops/case/set-aside?rule=test-clutter', 'POST', {}, { 'x-forwarded-for': '203.0.113.9' });
ok(relay.status === 403, '2 a relayed request is refused (403)', relay.status);
const cust = await J('/api/ops/case/set-aside?rule=test-clutter', 'POST', {}, { 'x-agn-view': 'customer' });
ok(cust.status === 403, '2 a customer-view request is refused (403)', cust.status);
const own = await J('/api/ops/case/set-aside', 'POST', { ids: [TID], why: 'sa44' });
ok(own.status === 200 && own.json && own.json.ok && own.json.projects.length === 1 && own.json.removed.projects === 1 && /set-aside-.*\.json$/.test(own.json.file || ''), '2 a test sets its own project aside by id (moved to a file)', JSON.stringify(own.json).slice(0, 300));
ok(((await J('/api/case/project?id=' + TID)).json || {}).projectId !== TID, '2 the test project is no longer on the server');
const dry = await J('/api/ops/case/set-aside?rule=test-clutter&dryRun=1', 'POST', {});
const D = (dry.json && dry.json.projects) || [];
const NAMES = /^(HARNESS DEMO \(not a client\)|DEMONSTRATION [—-] .*\(not a real client\)|DR39|test|D71 test|Indus Demo Industries \(Pvt\) Ltd — DEMONSTRATION DATA|)$/;
ok(dry.status === 200 && D.every((p) => NAMES.test(p.clientName || '')) && !D.some((p) => p.projectId === 'demo-indus'), '3 dry run: only exact test names, demo-indus kept (' + D.length + ' would move)', JSON.stringify(D.map((p) => p.projectId + '|' + p.clientName)).slice(0, 400));
ok(L0.length === (await list()).length, '3 a dry run changes nothing');
const mv = await J('/api/ops/case/set-aside?rule=test-clutter&why=sa44', 'POST', {});
const L1 = await list();
ok(mv.status === 200 && mv.json.ok && mv.json.projects.length === D.length && L1.length === L0.length - D.length, '3 the rule moves them (' + (mv.json && mv.json.projects.length) + '), with ' + JSON.stringify(mv.json && mv.json.removed), JSON.stringify(mv.json).slice(0, 300));
ok(L1.some((p) => p.projectId === 'demo-indus') === L0.some((p) => p.projectId === 'demo-indus'), '3 demo-indus stays listed', JSON.stringify(L1.map((p) => p.projectId)));
console.log('listed after the move: ' + L1.map((p) => p.projectId + ' | ' + p.clientName).join('; '));
const again = await J('/api/ops/case/set-aside?rule=test-clutter', 'POST', {});
ok(again.status === 200 && again.json.projects.length === 0 && !again.json.file, '3 a second run moves nothing (idempotent)');
const fn = String(mv.json.file || '').split(/[\\/]/).pop();
const rs = await J('/api/ops/case/restore?file=' + encodeURIComponent(fn), 'POST', {});
const L2 = await list();
ok(rs.status === 200 && rs.json.restored.length === D.length && JSON.stringify(L2.map((p) => p.projectId).sort()) === JSON.stringify(ids0), '4 restore puts every moved project back (list equal to the start)', JSON.stringify(rs.json).slice(0, 300));
const mv2 = await J('/api/ops/case/set-aside?rule=test-clutter&why=sa44-final', 'POST', {});
ok(mv2.status === 200 && mv2.json.projects.length === D.length, '5 the rule again (the state DEPLOY leaves): ' + (mv2.json && mv2.json.projects.length) + ' moved');
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
