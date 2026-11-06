/* v91.17.283.36 (NIGRAAN 1.0) · launch item 41 · FINAL-DECISION TESTS: a withheld wind, GLOF or heavy-rain level never makes the Overview
   (the served unit), the alerts, the AI or the reports say "no hazard"; an official warning (an official gauge class) is never hidden.
   Part 1 (pure): the hazard list, the river alert rule. Part 2 (server, argv[2] / NIGRAAN_BASE): every sampled tehsil's served unit,
   report context and AI evidence, and the client alert list.
   usage: node scripts/tests28336/decision36.test.mjs [base] */
import { join, dirname } from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = process.env.NIGRAAN_TREE || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = (process.argv[2] && /^https?:/.test(process.argv[2]) ? process.argv[2] : process.env.NIGRAAN_BASE || 'http://127.0.0.1:8836').replace(/\/$/, '');
let n = 0, f = 0; const ok = (c, m, i) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : '  :: ' + String(JSON.stringify(i)).slice(0, 400))); if (!c) f++; };
const HL = await import(pathToFileURL(join(ROOT, 'server/api/hazardlist.mjs')).href), SV = await import(pathToFileURL(join(ROOT, 'server/api/served.mjs')).href);
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const ALLCLEAR = /no hazard|nothing above normal\.|all clear|all-clear|every assessed hazard normal\.$/i;
/* ---------- part 1 ---------- */
for (const k of ['wind', 'glof', 'rain_hz']) {
  const L = { ready: true, days: [{ day: 0, date: today, layers: { heat: { name: 'Heat stress', word: 'Normal' }, cold: { name: 'Cold', word: 'Normal' }, [k]: { name: k, word: 'Not assessed', assessed: false, state: 'not_tested', notAssessedWhy: 'not tested' } } }] };
  const h = HL.hazardListOf(L); ok(h.none == null && (h.notAssessed.some((x) => x.key === k) || (h.standing || []).some((x) => x.key === k && x.word === 'Not assessed')), 'withheld ' + k + ': the hazard list gives no all-clear and names it not assessed', h); }
{ const app = (off) => ({ engine: { latest: () => ({ days: [{ day: 0, layers: { flood_riverine: { facts: { U: { official: off } } } } }] }) } });
  ok(SV.riverAlertWhy(app(true), { hazard: 'flood_riverine', day: 0 }, 'U', 0) === null, 'an official gauge-class river alert is kept (never hidden)');
  ok(typeof SV.riverAlertWhy(app(false), { hazard: 'flood_riverine', day: 0 }, 'U', 0) === 'string', 'a model-ladder river level raises no alert'); }
/* ---------- part 2 (server) ---------- */
const get = async (p) => { try { const r = await fetch(BASE + p, { headers: { 'x-agn-view': 'customer' }, signal: AbortSignal.timeout(120000) }); return r.ok ? await r.json() : null; } catch (_) { return null; } };
const W = await get('/api/levels?layer=wind&day=0'), G = await get('/api/levels?layer=glof&day=0'), R = await get('/api/levels?layer=rain_hz&day=0');
if (!W || !W.levels) { ok(false, 'server reachable at ' + BASE); }
else {
  const uids = Object.keys(W.levels).filter((u) => W.levels[u] < 0 || (G && G.levels && G.levels[u] < 0) || (R && R.levels && R.levels[u] < 0));
  const pick = uids.filter((_, i) => i % Math.max(1, Math.floor(uids.length / 40)) === 0).slice(0, 40);
  let bad = [], badRep = [], badAi = [], checked = 0;
  for (const u of pick) { checked++;
    const U = await get('/api/levels/unit?unit=' + encodeURIComponent(u)); const hl = U && U.hazardList;
    if (!hl || hl.none != null) bad.push(u + ': ' + (hl && hl.none));
    const C = await get('/api/report/context?unit=' + encodeURIComponent(u)); const ch = C && (C.hazardList || (C.levels && C.levels.hazardList));
    const txt = JSON.stringify(C || {}); if (ch && ch.none != null) badRep.push(u + ': ' + ch.none); else if (/No hazard at this site/.test(txt)) badRep.push(u + ': text');
    const A = await get('/api/ai/evidence?prompt=' + encodeURIComponent('is it safe here') + '&location=' + encodeURIComponent(u.split('|')[2]));
    const at = JSON.stringify(A || {}); if (/nothing above Normal\.|No hazard at this site|every assessed hazard Normal\."/.test(at) && !/not assessed/i.test(at)) badAi.push(u); }
  ok(checked >= 20 && bad.length === 0, 'Overview / served unit: ' + checked + ' tehsils with a withheld wind, GLOF or rain level: no "no hazard"', bad.slice(0, 5));
  ok(badRep.length === 0, 'reports: no "no hazard" for those tehsils', badRep.slice(0, 5));
  ok(badAi.length === 0, 'AI evidence: no all-clear for those tehsils', badAi.slice(0, 5));
  const AL = await get('/api/alerts?day=0') || await get('/api/engine/alerts');
  const rows = AL && (AL.rows || AL.alerts) || [];
  ok(!rows.some((a) => a && (a.hazard === 'wind' || a.hazard === 'glof')), 'alerts: no alert from a withheld wind or GLOF level', rows.filter((a) => a && (a.hazard === 'wind' || a.hazard === 'glof')).slice(0, 3));
  const wd = (AL && AL.alertsWithheld) || []; ok(!wd.some((w) => w && /official/.test(String(w.why || '')) && !/model-flow ladder/.test(String(w.why || ''))), 'alerts: an official gauge-class alert is never in the withheld list', wd.slice(0, 3)); }
console.log('\n' + (n - f) + '/' + n + ' passed'); process.exit(f ? 1 : 0);
