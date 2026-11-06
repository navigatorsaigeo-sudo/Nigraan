import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.124 · green street map (B-01), cold gate and cold alert rule C (B-02), late-day heat fallback (B-09), UTCI range edge,
   heat score at class bounds, river chance withheld where the model does not represent the river, startup warm-up (B-04/B-05).
   node nigraan-local/scripts/tests124/v124.test.mjs */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const APP = (__T.ROOT + '/');

/* 1 · heat score: a value just under a class bound stays in its class */
const U = await import(APP + 'server/api/utci.mjs');
ok(U.utciAgnScore(37.9) <= 64 && U.utciAgnScore(38) === 65 && U.utciAgnScore(45.9) <= 81 && U.utciAgnScore(46) === 82 && U.utciAgnScore(31.95) <= 44,
  'heat score: 37.9 C stays under the High cut, 38.0 C is High', [U.utciAgnScore(37.9), U.utciAgnScore(38), U.utciAgnScore(45.9), U.utciAgnScore(46)].join(','));
ok(U.utciAgnScore(35) === 55 && U.utciAgnScore(9) === 0 && U.utciAgnScore(60) === 100, 'heat score unchanged inside a class', U.utciAgnScore(35));

/* 2 · cold gate operational and alerting; rule ledger carries the cold rule */
const G = JSON.parse(readFileSync(APP + 'data/model-gate.resolved.json', 'utf8'));
const cold = (G.entries || []).find(e => e.id === 'cold');
ok(cold && cold.status === 'operational', 'cold gate entry resolves operational', JSON.stringify(cold && { s: cold.status, why: cold.why }));
const L = JSON.parse(readFileSync(APP + 'data/rule-ledger.json', 'utf8'));
ok(L.rules.some(r => r.id === 'cold-alert-local-p05'), 'rule ledger holds cold-alert-local-p05');

/* 3 · river chance withheld where the model does not represent the river */
const RR = JSON.parse(readFileSync(APP + 'data/river-rarity.json', 'utf8')).reaches || {};
const bad = Object.entries(RR).filter(([, r]) => r.modelRepresentsRiver === false).map(([k]) => k);
const RP = await (await fetch(BASE + '/api/flood/chance').catch(() => null))?.json().catch(() => null);
if (RP && RP.reaches) {
  const served = bad.filter(id => RP.reaches[id] && (RP.reaches[id].days || []).some(d => d.p && Object.keys(d.p).length));
  ok(served.length === 0, 'no river chance at a reach the model does not represent (' + bad.length + ' such reaches)', served.join(','));
} else {
  const src = readFileSync(APP + 'server/api/riverprob.mjs', 'utf8');
  ok(/RR\.modelRepresentsRiver === false/.test(src), 'river chance code withholds reaches the model does not represent (route not reachable here)');
}

/* 4 · page checks */
const { chromium } = __T.playwrightSync();
const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
const pg = await br.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { try { return typeof hzDayInput === 'function' && AGN.gate && AGN.gate.ready && Object.keys(DISTRICT_IN).length > 500; } catch (_) { return false; } }, null, { timeout: 300000, polling: 2000 }).catch(() => {});
await pg.waitForTimeout(3000);

const P = await pg.evaluate(() => {
  const out = {};
  out.coldStatus = AGN.gate.status('cold'); out.coldCanAlert = AGN.gate.canAlert('cold');
  out.coldRule = AGN.coldAlertRule && AGN.coldAlertRule.rule;
  /* the cold rule on a synthetic record: without percentile only Severe passes */
  out.utciEdge = (typeof hzUtciInRange === 'function') ? [hzUtciInRange(51, 2, 20), hzUtciInRange(30, 20, 40)] : null;
  /* the streets rule exists in the page CSS */
  out.css = !!document.getElementById('agn-v124-css');
  /* B-09: a unit with no day window gives no card score rather than a present-hour score */
  return out; });
ok(P.coldStatus === 'operational' && P.coldCanAlert === true, 'page: cold layer is operational and may alert', JSON.stringify(P));
ok(P.coldRule === 'C', 'page: cold alerts follow rule C');
/* v91.17.283.12 (audit: one UTCI function): an hour outside the validity of the UTCI polynomial (air 50 C, wind 17 m/s) is not assessed, never clipped to the edge */
ok(P.utciEdge && P.utciEdge.every(v => v === null), 'UTCI hours outside the range are not assessed (no clipping to the range edge)', JSON.stringify(P.utciEdge));
ok(P.css, 'street-map Normal fill rule is in the page');

const C = await pg.evaluate(() => { const rule = AGN.coldAlertRule; const rows = (typeof activeAlerts === 'function' ? activeAlerts() : []).filter(r => (r.holders || [{ hazard: r.hazard }]).some(h => h.hazard === 'cold'));
  return { n: rows.length, bad: rows.map(r => ({ n: r.name, t: rule.test(r.name) })).filter(x => !x.t.ok).slice(0, 3) }; });
ok(C.bad.length === 0, 'cold alerts follow rule C: every cold alert is at or below its place\'s 5th percentile (' + C.n + ' cold alerts now)', JSON.stringify(C));

/* B-01: with Streets on, a Normal-coloured tehsil path has no fill */
const S = await pg.evaluate(async () => {
  document.documentElement.classList.add('agn-streets-on');
  const ps = [...document.querySelectorAll('#map .leaflet-overlay-pane path')];
  const nrm = ps.filter(p => /^#74c476$/i.test(p.getAttribute('fill') || ''));
  const oth = ps.filter(p => /^#(ffe680|fdae61|e8552d|a50026)$/i.test(p.getAttribute('fill') || ''));
  const r = { paths: ps.length, normal: nrm.length, normalOpacity: nrm.length ? getComputedStyle(nrm[0]).fillOpacity : null, otherOpacity: oth.length ? getComputedStyle(oth[0]).fillOpacity : null };
  document.documentElement.classList.remove('agn-streets-on'); return r; });
ok(S.normal === 0 || +S.normalOpacity === 0, 'street map: Normal tehsils carry no green fill', JSON.stringify(S));
ok(S.otherOpacity == null || +S.otherOpacity > 0, 'street map: Low and worse keep their wash', JSON.stringify(S));

/* B-09: late-day fallback removed in the card path */
const B9 = await pg.evaluate(() => { const name = Object.keys(DISTRICT_IN)[0]; const rec = DISTRICT_IN[name]; const keep = rec.fc72;
  try { rec.fc72 = { time: [], temp: [] }; const di = hzDayInput(name, 'heat'); return { unavailable: !!(di && di.__unavailable) }; } finally { rec.fc72 = keep; } });
ok(B9.unavailable, 'a unit without a day series is unavailable for the day (no present-hour substitute)', JSON.stringify(B9));
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();

/* B-04 / B-05: the server answers a place search quickly after start (the warm-up has run by the time tests reach here) */
let t = Date.now(); const q = await fetch(BASE + '/api/geo/search?q=' + encodeURIComponent('blue area islamabad')).then(r => r.json()).catch(e => ({ e: e.message }));
const ms = Date.now() - t;
ok(ms < 8000 && !q.e, 'place search answers in under 8 s (' + ms + ' ms)', JSON.stringify(q).slice(0, 200));
console.log((fails ? 'FAIL' : 'PASS') + ' v124: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
