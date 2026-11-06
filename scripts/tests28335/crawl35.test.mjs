/* v91.17.283.35 · CLIENT CRAWL: the client pages (start page /, console /analyst in the client view, Customize /customize) show
     1  no code text (file names, server / data paths, function names) and no agency name
     2  no page error
     3  no number before live data: with every live answer held back (the levels, the air quality, the place bundle, the provider), the
        map's comfort and AQI values, the comfort data table, the station cards and the key show no value (audit A4 / L1: the page shipped
        demo values for 576 tehsils and drew 366 tehsils "Severe" from them at 00:45 PKT)
     4  the map key names the states truthfully: no "cannot occur here" for a row that is not physical impossibility
   usage: node scripts/tests28335/crawl35.test.mjs [base] */
import { T, browser, open, BASE } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const CODE_RE = /[\w-]+\.(?:mjs|json|py)\b|\b(?:server|data|scripts|station-lake)\/[\w./-]+/;
const AGENCY_RE = /\bPMD\b|Pakistan Meteorological Department|\bFFD\b|Flood Forecasting Division|(?<![\w-])EWS(?![\w-])|\bIRSA\b/;
const IDENT_RE = /\b(?:districtComfortByName|agnComfortDay|notAssessedWhy|hazardList|tehsilLevels|stateOf|STATE_DEF|undefined|NaN)\b/;
const br = await browser();
const visible = (pg) => pg.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode, p = n.parentElement; if (!p) continue; const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || !p.getClientRects().length) continue;   /* rendered text only (an operator card inside a hidden section is not shown) */ if (p.closest('script,style,noscript,[hidden]')) continue;
    const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t) out.push(t); } return out.join(' | '); });
for (const path of ['/', '/analyst', '/customize']) {
  const o = await open(br, path); await o.pg.waitForTimeout(path === '/analyst' ? 25000 : 12000);
  const txt = await visible(o.pg);
  const c = CODE_RE.exec(txt), a = AGENCY_RE.exec(txt), i = IDENT_RE.exec(txt);
  ok(!c, path + ': no code text on the page', c && txt.slice(Math.max(0, c.index - 120), c.index + 80));
  ok(!a, path + ': no agency name', a && txt.slice(Math.max(0, a.index - 80), a.index + 60));
  ok(!i, path + ': no code identifier, "undefined" or "NaN"', i && txt.slice(Math.max(0, i.index - 120), i.index + 60));
  ok(o.errs.length === 0, path + ': no page errors', o.errs.join(' | '));
  if (path === '/analyst') {
    const leg = await o.pg.evaluate(() => { const L = document.getElementById('v3legend'); return L ? L.textContent.replace(/\s+/g, ' ') : ''; });
    ok(!/cannot occur here/i.test(leg), '/analyst: the key never says "cannot occur here" (only "Cannot happen here" for physical impossibility)', leg.slice(0, 300)); }
  await o.ctx.close(); }
/* 3 · before live data: every live answer held back */
{ const hold = async (pg) => { await pg.route(/\/api\/(levels|smog|point|outlook|ai|report|scenario|pointstate|fleet|mos|national)/, (r) => r.abort()); await pg.route(/\/v1\/|open-meteo|\/px\//, (r) => r.abort()); };
  const o = await open(br, '/analyst', { route: hold }); await o.pg.waitForTimeout(20000);
  const S = await o.pg.evaluate(() => { const D = window.DISTRICT_IN || {}; const keys = Object.keys(D);
    const withNum = keys.filter((k) => { const r = D[k] || {}; return ['t', 'hum', 'aqi', 'pm25', 'uv', 'wind', 'rain', 'cloud'].some((f) => typeof r[f] === 'number'); }).length;
    const comfort = keys.filter((k) => { try { return districtComfortByName(k) != null; } catch (_) { return false; } }).length;
    const day1 = keys.filter((k) => { try { return window.agnComfortDay(k, 1) != null; } catch (_) { return false; } }).length;
    const tbl = document.getElementById('mapTable'); const cells = tbl ? [...tbl.querySelectorAll('tbody td')].map((td) => td.textContent).filter((t) => /\d/.test(t)).length : 0;
    const st = (window.STATIONS || []).filter((s) => ['t', 'feels', 'hum', 'aqi', 'pm25', 'uv', 'sev', 'alert'].some((f) => s[f] != null && s[f] !== '')).length;
    return { keys: keys.length, withNum, comfort, day1, cells, st }; });
  ok(S.keys > 500 && S.withNum === 0, 'before live data: no tehsil row holds a number (no seed)', JSON.stringify(S));
  ok(S.comfort === 0 && S.day1 === 0, 'before live data: no comfort value on the map, day 0 or day 1', JSON.stringify(S));
  ok(S.cells === 0, 'before live data: the comfort data table holds no number', JSON.stringify(S));
  ok(S.st === 0, 'before live data: the station seeds hold no value (sev and alert included)', JSON.stringify(S));
  await o.pg.evaluate(() => { const s = document.getElementById('mapHazardPick'); s.value = 'aqi'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await o.pg.waitForTimeout(3000);
  const aq = await o.pg.evaluate(() => { let n = 0; try { districtLayer.eachLayer((l) => { const p = l.feature && l.feature.properties; if (!p || p.dq === true) return; const s = l.options || {}; if (s.fillColor && !/e5ebf0|c8d2da/i.test(s.fillColor) && s.fillOpacity > 0.8) n++; }); } catch (_) {} return n; });
  ok(aq === 0, 'before live data: the AQI map draws no class', aq);
  await o.ctx.close(); }
await br.close(); done();
