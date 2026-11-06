// audit 2 (live) · a server started with an UNREADABLE model gate (data/model-gate.resolved.json not JSON) fails closed for a client on every
// served path: /api/levels (one layer and all layers), /api/levels/unit, /api/alerts, /api/report/context and the AI facts. The client never
// receives the raw combined flood level or the local-rain flooding layer. The operator view keeps the engine record. (own server)
import { join } from 'node:path';
import { createServer } from 'node:net';
import { TREE, ok, done } from './lib.mjs';
const { startServer } = await import(new URL('../tests283/ws4/serve.mjs', import.meta.url).href);
const free = () => new Promise((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
async function ownServer() { return startServer(TREE, Number(process.env.A02B_PORT) || await free(), {}, { 'model-gate.resolved.json': 'this is not JSON: the gate is unreadable' }); }
const S = await ownServer(); const C = { 'x-agn-view': 'customer' };
const g = async (p, h = C) => { try { const r = await fetch(S.base + p, { headers: h }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {} return { s: r.status, j, t }; } catch (e) { return { s: 0, t: String(e) }; } };
try {
  const uid = 'Sindh|Sujawal|Jati';
  const a = await g('/api/levels?layer=flood&day=0'), b = await g('/api/levels?day=0'), u = await g('/api/levels/unit?unit=' + encodeURIComponent(uid)), al = await g('/api/alerts'), rc = await g('/api/report/context?unit=' + encodeURIComponent(uid) + '&section=operations'), op = await g('/api/levels/unit?unit=' + encodeURIComponent(uid), { 'x-agn-view': 'operator' });   /* v91.17.283.12: the operator view is asked for explicitly */
  ok(a.j && a.j.ready === false && a.j.gateUnavailable === true && !a.j.levels, '/api/levels?layer=flood: not assessed (model gate unavailable), no levels', a.t.slice(0, 200));
  ok(b.j && b.j.ready === false && b.j.gateUnavailable === true && !b.j.layers, '/api/levels (all layers): not assessed, no layer served', b.t.slice(0, 200));
  const L = u.j && u.j.days && u.j.days[0] && u.j.days[0].layers || {};
  ok(u.j && u.j.gateUnavailable === true && !('flood_pluvial' in L) && Object.values(L).length > 0 && Object.values(L).every((x) => x.assessed === false && /model gate unavailable/.test(x.notAssessedWhy || '')), '/api/levels/unit: every layer "Not assessed: model gate unavailable"; no local-rain flooding', JSON.stringify(L.flood || u.t.slice(0, 200)).slice(0, 200));
  ok(al.j && Array.isArray(al.j.rows) ? al.j.rows.length === 0 : (al.j && al.j.ready === false), '/api/alerts: no row served unchecked', al.t.slice(0, 200));
  const RL = rc.j && rc.j.levels && rc.j.levels.days && rc.j.levels.days[0] && rc.j.levels.days[0].layers || {};
  ok(rc.s === 200 && Object.values(RL).length > 0 && Object.values(RL).every((x) => x.word === 'Not assessed' && /model gate unavailable/.test(x.notAssessedWhy || '')) && !('flood_pluvial' in RL), '/api/report/context: the report prints "Not assessed (model gate unavailable)"', JSON.stringify(RL).slice(0, 200));
  ok(op.j && op.j.days && op.j.days[0].layers && 'flood_pluvial' in op.j.days[0].layers, 'the operator view keeps the engine record');
} finally { S.stop(); }
done('A02B-GATE-LIVE');
