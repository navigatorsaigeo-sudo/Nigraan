/* v91.17.283.36 (NIGRAAN 1.0) · CLIENT CRAWL OF EVERY TAB (items 37, 39, 43; items 8, 12, 14, 15, 24 on screen):
     every client page (start /, console /analyst on every tab, Customize /customize) shows no code text, no agency name, no code identifier,
     no page error, no "cannot happen" for a landslide, no run id, no coordinates, no "not held" row, no internal build number, no
     "v91.17"; the console opened without a place shows no default Islamabad; with every live answer held back no number is shown.
   usage: node scripts/tests28336/crawl36.test.mjs [base] */
import { T, browser, open, tab } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const CODE_RE = /[\w-]+\.(?:mjs|json|py)\b|\b(?:server|data|scripts|station-lake)\/[\w./-]+/;
const AGENCY_RE = /\bPMD\b|Pakistan Meteorological Department|\bFFD\b|Flood Forecasting Division|(?<![\w-])EWS(?![\w-])|\bIRSA\b/;
const IDENT_RE = /\b(?:districtComfortByName|agnComfortDay|notAssessedWhy|hazardList|tehsilLevels|stateOf|STATE_DEF|undefined|NaN)\b/;
const RUNID_RE = /\b(?:pr1-[0-9a-f]{8}|sc[0-9a-f]{24}|run[ _-]?id)\b|\b91\.17\.283\.\d+\b|\bv91\.17\b/i;
const COORD_RE = /\b(?:2[3-9]|3[0-7])\.\d{3,}\s*(?:°\s*N)?\s*[,/]\s*(?:6[0-9]|7[0-9])\.\d{3,}\b/;
const NOTHELD_RE = /\bnot held\b/i;
const LS_CANNOT_RE = /landslide[^|]{0,80}cannot happen|cannot happen[^|]{0,80}landslide|too flat for landslides/i;
const br = await browser();
const visible = (pg) => pg.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode, p = n.parentElement; if (!p) continue; const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || !p.getClientRects().length) continue;
    const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t) out.push(t); } return out.join(' | '); });
const at = (txt, m, a = 120, b = 80) => m && txt.slice(Math.max(0, m.index - a), m.index + b);
const check = (where, txt, errs) => {
  const c = CODE_RE.exec(txt), g = AGENCY_RE.exec(txt), i = IDENT_RE.exec(txt), r = RUNID_RE.exec(txt), xy = COORD_RE.exec(txt), nh = NOTHELD_RE.exec(txt), ls = LS_CANNOT_RE.exec(txt);
  ok(!c, where + ': no code text', at(txt, c)); ok(!g, where + ': no agency name', at(txt, g)); ok(!i, where + ': no code identifier, "undefined" or "NaN"', at(txt, i));
  ok(!r, where + ': no run id, checksum or internal build number', at(txt, r)); ok(!xy, where + ': no coordinates', at(txt, xy)); ok(!nh, where + ': no empty "not held" row', at(txt, nh));
  ok(!ls, where + ': no "cannot happen" for a landslide', at(txt, ls)); if (errs) ok(errs.length === 0, where + ': no page errors', errs.join(' | ')); };
/* the start page and Customize */
for (const path of ['/', '/customize']) { const o = await open(br, path); await o.pg.waitForTimeout(12000); check(path, await visible(o.pg), o.errs);
  if (path === '/customize') { const t = await visible(o.pg); ok(!/\bIslamabad\b/.test(t.slice(0, 4000)) || /AJG/.test(t), '/customize: no default Islamabad start point (the site list or "choose a place")', t.slice(0, 300)); }
  await o.ctx.close(); }
/* the console, opened WITHOUT a place: no default Islamabad; then every tab */
{ const o = await open(br, '/analyst'); await o.pg.waitForTimeout(25000);
  const head = await o.pg.evaluate(() => ({ city: (document.getElementById('cityLabel') || {}).textContent || '', sel: typeof selectedId !== 'undefined' ? selectedId : null, title: document.title, build: (document.getElementById('agnProvBuild') || {}).textContent || '' }));
  ok(head.sel == null && !/Islamabad/.test(head.city), '/analyst without a place: no default Islamabad ("choose a place")', JSON.stringify(head));
  ok(/^NIGRAAN 1\.0/.test(head.title) && !/91\.17/.test(head.build), '/analyst: the client name is NIGRAAN 1.0 (no build number)', JSON.stringify(head));
  for (const v of ['overview', 'livedata', 'airisk', 'assessments', 'hybridlab', 'observations', 'operations', 'sources']   /* v283.39: no Reports tab (the library is under My reports) */) { await tab(o.pg, v, 4000); check('/analyst#' + v, await visible(o.pg), null); }
  /* v283.39 item B: no Reports tab; "My reports" in the header opens the library list; the place panel has "Full report" */
  { const R = await o.pg.evaluate(() => ({ tab: !!document.querySelector('#machNav [data-goto="report"]'), view: !!document.querySelector('.view[data-view="report"]'), my: !!document.getElementById('agnMyReports'), full: !!document.querySelector('#mpLeft [data-r268-report="site"]') }));
    ok(!R.tab && !R.view && R.my && R.full, '/analyst: no Reports tab or view; "My reports" in the header; "Full report" in the place panel', JSON.stringify(R));
    await o.pg.click('#agnMyReports'); await o.pg.waitForTimeout(4000);
    const D = await o.pg.evaluate(() => { const d = document.getElementById('agnRepDlg'); return { open: !!(d && d.open), txt: d ? d.innerText : '' }; });
    ok(D.open && /Reports library/.test(D.txt) && !/Opening the reports library/.test(D.txt), '/analyst My reports: the library list opens and is read', D.txt.slice(0, 300));
    check('/analyst My reports', D.txt, null); await o.pg.keyboard.press('Escape'); await o.pg.waitForTimeout(500); }
  ok(o.errs.length === 0, '/analyst (all tabs): no page errors', o.errs.join(' | ')); await o.ctx.close(); }
/* the console with a place handed over by the start page: every tab */
{ const o = await open(br, '/analyst#agnplace=30.19570,71.47530,Multan'); await o.pg.waitForTimeout(25000);
  for (const v of ['overview', 'livedata', 'airisk', 'assessments', 'hybridlab']) { await tab(o.pg, v, 4000); check('/analyst(Multan)#' + v, await visible(o.pg), null); }
  ok(o.errs.length === 0, '/analyst (Multan, all tabs): no page errors', o.errs.join(' | ')); await o.ctx.close(); }
/* before live data: every live answer held back -> no number */
{ const hold = async (pg) => { await pg.route(/\/api\/(levels|smog|point|outlook|ai|report|scenario|pointstate|fleet|mos|national|hyperlocal|natgrid|mach)/, (r) => r.abort()); await pg.route(/\/v1\/|open-meteo|\/px\//, (r) => r.abort()); };
  const o = await open(br, '/analyst#agnplace=30.19570,71.47530,Multan', { route: hold }); await o.pg.waitForTimeout(20000);
  const S = await o.pg.evaluate(() => { const ids = ['ccTemp', 'ccFeels', 'ccHum', 'ccWind', 'ccRain', 'ccUV', 'comfortScore', 'aqAqi', 'aqUv', 'aqRain', 'wetBulbVal', 'heatIndexVal'];
    return ids.map((k) => [k, (document.getElementById(k) || {}).textContent || '']).filter(([, t]) => /\d/.test(t)); });
  ok(S.length === 0, 'before live data: no static or demo number on the panels', JSON.stringify(S));
  const st = await o.pg.evaluate(() => (window.STATIONS || []).filter((s) => ['t', 'feels', 'hum', 'aqi', 'pm25', 'uv'].some((f) => s[f] != null && s[f] !== '')).length);
  ok(st === 0, 'before live data: the city list holds no value', st); await o.ctx.close(); }
await br.close(); done();
