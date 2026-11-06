// v91.17.283.9 · item 5 · "No 250 m value here" at Rawalpindi (owner screenshot, 22 Oct). FOUND on the laptop (live server, 22 Oct 23:05 PKT):
// /api/hyperlocal/grid answered 502 {"error":"grid_failed","message":"px 429"} for every new 0.25 degree tile: the provider call budget
// (data/provider-budget.json, shed mode, owner PATCH3) sheds the hyperlocal grid as background tier P6 once the day's background use
// passes 60 % of the background allowance. No cell is masked, no tile is missing, the grid has no hole: the cells are not computed
// today ON PURPOSE (the owner's budget rule), so the page now says that instead of a bare "no value". Nothing about the budget changes.
//  G1 a refused grid answers reason "budget", the refusal's own words and the budget class (background)
//  G2 a grid that is not refused is unchanged: 100 x 100 cells, no empty cell over the Rawalpindi plains near the M2 (33.5-33.75 N, 73.0-73.25 E)
//  G3 the page's read-out text for that answer
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { TREE, ok, done, src } from './lib.mjs';
const free = () => new Promise((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const { startServer } = await import(new URL('../tests283/ws4/serve.mjs', import.meta.url).href);
const USERTAG = ((JSON.parse(readFileSync(join(TREE, 'data', 'provider-budget.json'), 'utf8')).userTags) || []).includes('hyperlocal-grid');
const F = JSON.parse(readFileSync(join(TREE, 'scripts', 'tests2838', 'fixtures', 'engine_ws8_2026-10-12.json'), 'utf8'));
const q = (s, w) => '/api/hyperlocal/grid?s=' + s.toFixed(4) + '&w=' + w.toFixed(4) + '&n=' + (s + 0.25).toFixed(4) + '&e=' + (w + 0.25).toFixed(4) + '&nx=100&ny=100&q=moist';
const get = async (b, p) => { const r = await fetch(b + p); let j = null; try { j = await r.json(); } catch (_) {} return { s: r.status, j }; };
/* G2 · budget off (the mock provider answers): the tile at the owner's place has every cell */
let S = await startServer(TREE, await free(), { NIGRAAN_CALL_BUDGET: 'off' }, { 'engine-latest.json': F });
try { const a = await get(S.base, q(33.5, 73.0)); const t = a.j && a.j.t;
  ok(a.s === 200 && a.j.ok && t && t.length === 10000 && t.every((v) => v != null), 'G2 budget not spent: the Rawalpindi / M2 tile has all 10,000 cells (no mask, no hole)', a.s + ' ' + (t ? t.filter((v) => v == null).length + ' empty' : JSON.stringify(a.j)).slice(0, 200)); }
finally { S.stop(); }
/* G1 · the day's budget spent (cap 1 weighted call, shed mode): the grid is refused and says why */
S = await startServer(TREE, await free(), { NIGRAAN_CALL_BUDGET: '1', NIGRAAN_CALL_BUDGET_MODE: 'shed' }, { 'engine-latest.json': F });
try { const r = []; for (const [s, w] of [[33.5, 73.0], [33.25, 73.0], [33.5, 72.75]]) r.push(await get(S.base, q(s, w)));
  const ref = r.filter((x) => x.s === 502);
  /* v91.17.283.10 integration item 11 (owner may veto): with 'hyperlocal-grid' in userTags the grid is a user call: shed mode never sheds it */
  if (USERTAG) ok(ref.length === 0 && r.every((x) => x.s === 200), 'G1 (hyperlocal-grid is a user tag) shed mode serves the tile; only the whole cap refuses it', JSON.stringify(r.map((x) => x.s)));
  else ok(!r.some((x) => x.j && x.j.reason === 'budget'), 'G1 overage allowed: no tile is refused for the budget', JSON.stringify(ref.map((x) => x.j)).slice(0, 400)); }
finally { S.stop(); }
if (USERTAG) { S = await startServer(TREE, await free(), { NIGRAAN_CALL_BUDGET: '1', NIGRAAN_CALL_BUDGET_MODE: 'enforce' }, { 'engine-latest.json': F });
  try { const r = []; for (const [s, w] of [[33.5, 73.0], [33.25, 73.0], [33.5, 72.75]]) r.push(await get(S.base, q(s, w))); const ref = r.filter((x) => x.s === 502);
    /* v91.17.283.31 · owner 29 Oct 2026: overage allowed: enforce is read as monitor, the tile is not refused for the budget */
    ok(!r.some((x) => x.j && x.j.reason === 'budget'), 'G1 (user tag) overage allowed: a file or env asking for enforce at the cap refuses no tile for the budget', JSON.stringify(r.map((x) => [x.s, x.j && x.j.reason])).slice(0, 400)); }
  finally { S.stop(); } }
/* G3 · the page */
const page = src('artefact/AI_GEO_NIGRAAN_v91_17_MACH.html');
const i = page.indexOf('function whyOf(e,st){'); let whyOf = null; try { const j = page.indexOf('\n  function streetsOn()', i); whyOf = new Function(page.slice(i, j) + '; return whyOf;')(); } catch (_) { whyOf = null; }
const t = whyOf ? whyOf({ reason: 'budget' }, 502) : '';
ok(/paused for today/.test(t) && /05:00 PKT/.test(t) && /not affected/.test(t), 'G3 the read-out: paused for today, back at 05:00 PKT, point and tehsil values not affected', t);
{ const tu = whyOf ? whyOf({ reason: 'budget', budgetClass: 'user' }, 502) : ''; ok(/paused for today/.test(tu) && /provider call budget is used up/.test(tu) && !/background tier/.test(tu), 'G3 a user-class refusal (the whole cap) is not called a background refusal', tu); }
ok(whyOf && /HTTP 502/.test(whyOf({}, 502)) && /quota/.test(whyOf({ reason: 'quota' }, 502)), 'G3 other failures are named too (provider quota, HTTP status)');
done('D3-GRID-REASON-2839');
