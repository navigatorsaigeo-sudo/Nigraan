/* v91.17.283 · WS7 · PERMANENT CHECK (c) · ONE PLACE, ONE SET OF HAZARD LEVELS, ON EVERY SURFACE (40 places).
   Runs its own server (permanent/lib.mjs ownServer: throw-away data copy, mock provider, nothing scheduled). The server's own engine
   record in the cloud tree is days old (every level "no data"), so a FRESH ENGINE RUN IS A FIXTURE: the stored engine record is taken as
   it is (its units, layers, not-applicable masks, unit keys), re-dated to today (PKT) and given levels 0-4 / no data by a fixed hash per
   unit, layer and day, and posted to the server's own /api/engine/report from this computer. Every check below is about the surfaces
   agreeing with each other on that one run; none judges the levels themselves.
   40 tehsils, spread evenly over the engine's unit list (every province / region), each read from:
     start page   GET /api/levels/unit?unit=   (x-agn-view: customer, what NIGRAAN_START.html reads)
     console      GET /api/levels/unit?unit=   (operator, this computer) and the map layer GET /api/levels?layer=&day= (both views)
     report       GET /api/report/context?unit=   (the run it quotes: provenance.levels)
     AI           GET /api/ai/evidence?location=<tehsil>, <district>   (askedUnits[].mapLevels: the words the AI is told to quote)
   Checks: L1 the same level on the start page, the console unit answer and the console map, every layer and day both carry;
   L2 the customer map shows no layer the start page hides; L3 the AI is told the same word for the same hazard and date as the start page,
   and no hazard the start page hides; L4 the AI resolves "<tehsil>, <district>" to that tehsil; L5 the report quotes the same engine run (time, build,
   gate) and the same freshness. usage: node scripts/tests283/permanent/consistency40.test.mjs   (no server argument; ~3-6 min) */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ownServer, req, counter, PKT_TODAY, plusDays } from './lib.mjs';

const C = counter('40-place consistency');
const N = Number(process.env.CONSIST_PLACES || 40);
const CUST = { 'x-agn-view': 'customer' };
const srv = await ownServer({ mode: 'ok', keepProviderCache: true });
try {
  C.ok(srv.up, 'own server up (data copy, mock provider, nothing scheduled)', srv.up ? srv.base : srv.log().slice(-600));
  if (!srv.up) { C.done(); process.exit(); }
  /* ── the fixture run ── */
  const E = JSON.parse(readFileSync(join(srv.data, 'engine-latest.json'), 'utf8'));
  const h = (s) => createHash('sha1').update(s).digest().readUInt32BE(0);
  const today = PKT_TODAY(), units = Object.keys(E.unitKeys || {}).sort();
  const days = E.days.map((d, i) => ({ day: d.day, date: plusDays(today, i), basis: d.basis || 'peak', layers: Object.fromEntries(Object.entries(d.layers).map(([k, v]) => {
    const L = {}; const counts = [0, 0, 0, 0, 0]; let na = 0, nd = 0;
    for (const [u, lv] of Object.entries(v.L)) { if (lv === -2) { L[u] = -2; na++; continue; } const x = h(u + '|' + k + '|' + i); if (x % 11 === 10) { L[u] = -1; nd++; } else { L[u] = x % 5; counts[L[u]]++; } }
    return [k, { L, S: {}, counts, na, nd, coverage: v.coverage }]; })) }));
  const body = { at: new Date().toISOString(), build: E.build, gate: E.gate, words: E.words, units: E.units, unitKeys: E.unitKeys, ms: 1, days, alerts: [], alertsFull: [], alertsCtx: { day: 0, basis: 'peak', lead: 24 }, fc: 'fixture', fcc: 'fixture' };
  const post = await req(srv.base, '/api/engine/report', { method: 'POST', body, timeoutMs: 60000 });
  C.ok(post.status === 200 && post.json && post.json.ok, 'FIXTURE engine run posted (re-dated to ' + today + ', levels by a fixed hash)', post.status + ' ' + post.text.slice(0, 200));

  const pick = Array.from({ length: Math.min(N, units.length) }, (_, i) => units[Math.floor(i * units.length / Math.min(N, units.length))]);
  const mapCache = {};
  const mapLv = async (layer, day, cust) => { const k = layer + '|' + day + '|' + (cust ? 'c' : 'o'); if (!mapCache[k]) mapCache[k] = req(srv.base, '/api/levels?layer=' + encodeURIComponent(layer) + '&day=' + day, { headers: cust ? CUST : {}, timeoutMs: 60000 }); return (await mapCache[k]).json; };
  let n1 = 0, b1 = [], b2 = [], n3 = 0, b3 = [], b4 = [], b5 = [];
  for (const uid of pick) {
    const name = E.unitKeys[uid]; const [, district] = uid.split('|');
    const S = (await req(srv.base, '/api/levels/unit?unit=' + encodeURIComponent(uid), { headers: CUST })).json;
    const O = (await req(srv.base, '/api/levels/unit?unit=' + encodeURIComponent(uid), { headers: CUST })).json;   /* v283 INTEG: the console in the client's view (decision B: the operator view keeps the raw flood level on purpose) */
    if (!S || !S.days || !O || !O.days) { b1.push(uid + ': no unit answer (' + JSON.stringify(S || {}).slice(0, 120) + ')'); continue; }
    for (const sd of S.days) {
      const od = O.days.find((x) => x.day === sd.day) || { layers: {} };
      for (const [k, v] of Object.entries(sd.layers)) {
        const ov = od.layers[k];
        if (ov) { n1++; if (ov.level !== v.level) b1.push(uid + ' day ' + sd.day + ' ' + k + ': start ' + v.level + ' / console ' + ov.level); }
        const M = await mapLv(k, sd.day, true); if (M && M.levels && uid in M.levels) { n1++; if (M.levels[uid] !== v.level) b1.push(uid + ' day ' + sd.day + ' ' + k + ': start ' + v.level + ' / console map ' + M.levels[uid]); }
      }
      for (const k of Object.keys(od.layers)) { const Mc = await mapLv(k, sd.day, true); if (Mc && Mc.levels && uid in Mc.levels && !(k in sd.layers)) b2.push(uid + ' day ' + sd.day + ' ' + k + ': on the customer map, hidden on the start page'); }
    }
    /* AI */
    const loc = name + ', ' + district;   /* as a client writes a place: the tehsil and its district (several tehsils share a name) */
    const A = (await req(srv.base, '/api/ai/evidence?prompt=' + encodeURIComponent('What hazards are expected in ' + loc + ' in the next days?') + '&location=' + encodeURIComponent(loc), { timeoutMs: 180000 })).json;
    const au = A && A.facts && (A.facts.askedUnits || []).find((x) => (x.name === name || x.key === name) && x.district === district);   /* v283 INTEG: the unit's tehsil name or its page key ("Khanpur (Haripur)") */
    if (!au) b4.push(uid + ' -> ' + JSON.stringify(((A && A.facts && A.facts.askedUnits) || []).map((x) => x.name + '/' + x.district)).slice(0, 160));
    else if (au.mapLevels && Array.isArray(au.mapLevels.days)) {
      for (const ad of au.mapLevels.days) { const sd = S.days.find((x) => x.date === ad.date); if (!sd) { b3.push(uid + ' ' + ad.date + ': AI has a day the start page does not'); continue; }
        for (const hz of ad.hazards || []) { const sv = Object.values(sd.layers).find((x) => x.name === hz.hazard);
          if (!sv) { b3.push(uid + ' ' + ad.date + ' ' + hz.hazard + ': told to the AI, hidden on the start page'); continue; }
          n3++; if (String(sv.word) !== String(hz.level)) b3.push(uid + ' ' + ad.date + ' ' + hz.hazard + ': start "' + sv.word + '" / AI "' + hz.level + '"'); } }
    } else b3.push(uid + ': the AI evidence carries no map levels (' + JSON.stringify(au.mapLevels || null).slice(0, 120) + ')');
    /* report */
    const R = (await req(srv.base, '/api/report/context?unit=' + encodeURIComponent(uid), { timeoutMs: 180000 })).json;
    const pv = R && R.provenance && R.provenance.levels;
    if (!pv || pv.publishedAt !== S.at || pv.build !== S.build || pv.gate !== S.gate) b5.push(uid + ': report quotes ' + JSON.stringify(pv || null) + ' / start page run ' + S.at + ' ' + S.build + ' ' + S.gate);
    if (A && au && au.mapLevels && !!au.mapLevels.stale !== !!S.stale) b5.push(uid + ': AI stale=' + au.mapLevels.stale + ' / start page stale=' + S.stale);
  }
  C.ok(!b1.length && n1 > 0, 'L1 start page = console unit = console map, ' + pick.length + ' tehsils (' + n1 + ' layer-days compared)', b1.slice(0, 12).join(' | '));
  C.ok(!b2.length, 'L2 the customer map shows no layer the start page hides', b2.slice(0, 8).join(' | '));
  C.ok(!b3.length && n3 > 0, 'L3 the AI is told the start page\'s word for every hazard and date (' + n3 + ' compared)', b3.slice(0, 12).join(' | '));
  C.ok(!b4.length, 'L4 the AI resolves "<tehsil>, <district>" to that tehsil', b4.slice(0, 8).join(' | '));
  C.ok(!b5.length, 'L5 the report and the AI quote the same engine run and freshness as the start page', b5.slice(0, 8).join(' | '));
} finally { await srv.stop(); }
C.done();
