// audit 7 · a report's levels carry held and heldNote (report.mjs projection) and the report kit prints them in its 4-day table.
// Live part (node a07_report_held.test.mjs <server>): /api/report/context for a tehsil whose GLOF level is held from the issue.
import { src, BASE, get, CUST, ok, done } from './lib.mjs';
const R = src('server/api/report.mjs'), K = src('artefact/AI_GEO_NIGRAAN_v91_17_MACH.html');
ok(/\.\.\.\(v\.held \? \{ held: true, heldNote: v\.heldNote \|\| null \} : \{\}\)/.test(R), 'report.mjs: the level projection keeps held and heldNote');
ok(/x\.held\?' <span class="small" title="'\+esc\(x\.heldNote\|\|''\)\+'">held/.test(K) && /<b>Held:<\/b> /.test(K), 'report kit: the 4-day table marks held days and prints the held notes under it');
if (BASE) {
  const r = await get('/api/report/context?unit=' + encodeURIComponent('Sindh|Sujawal|Jati') + '&section=operations', CUST);
  const D = r.j && r.j.levels && r.j.levels.days; const later = D ? D.filter((d) => d.day > 0) : [];
  const g = later.map((d) => d.layers && d.layers.glof).filter(Boolean);
  ok(r.s === 200 && g.length > 0 && g.every((x) => x.held === true && /not a day forecast/.test(x.heldNote || '')), 'GET /api/report/context: the held GLOF days carry held and the note', JSON.stringify(g[0] || r.j && r.j.levels || r.s).slice(0, 300));
  const d0 = D && D.find((d) => d.day === 0); ok(d0 && d0.layers && d0.layers.glof && !d0.layers.glof.held, 'day 0 (the issue day itself) is not marked held');
} else console.log('     (live part skipped: no server address)');
done('A07-REPORT-HELD');
