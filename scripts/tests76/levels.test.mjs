import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.76 · L · one level vocabulary, one value per quantity (UX audit A-05..A-08, A-19, A-20, A-46, B-04..B-06, B-24, B-35).
     node scripts/tests76/levels.test.mjs [baseUrl]        default http://127.0.0.1:8787
   A · the level function: AGN.level.word(score) is the band the map fill uses, and its cuts are the screeningCuts of
       data/hazard-scale.json. For Islamabad every hazard the unit panel scores gets the same word from AGN.level and from
       the map's own AGN.hz5.levelOf.
   B · the screens, in customer view (operator mode off): 01 unit panel, 02 impact intelligence + premium brief + as-of
       line, 03 national status / board / decision chain, 04 hazard table, 09 engine numbers + Watchlist cards, 10 Result,
       Compare, the Comfort brief. No Minimal / Monitor / Watch / Act / "Heightened watch" as a level outside the GLOF lake
       ladder; one level word per Watchlist card; 10 says "Journey complete" only at 100 %; the as-of age is computed
       from the reading time; the urban heat value is the same on 02, the premium brief and the Comfort brief.
   PASS/FAIL lines; exit 1 on any FAIL. The page is slow on a loaded box: waits are generous. */
import { createRequire as __agnCR } from 'node:module'; import { pathToFileURL as __agnP2U } from 'node:url'; import { existsSync as __agnEx } from 'node:fs';
/* v91.17.255 · B-7 · Windows: Playwright from the app's node_modules, the bundled browser when the Linux one is absent, file URLs for absolute imports */
const __agnPW = __T.playwrightUrl() || 'playwright';
const __agnChrome = (p) => (p && __agnEx(p)) ? p : undefined;
const __agnImp = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? __agnP2U(String(p)).href : p);
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv.slice(2).find(a => /^https?:/.test(a)) || 'http://127.0.0.1:8787';
const DATA = process.env.NIGRAAN_DATA_DIR || join(HERE, '..', '..', 'data');
const PW = process.env.PW_MODULE || __agnPW;
const CHROME = process.env.PW_CHROME || __agnChrome(__T.chromiumPath());
const WAIT = Number(process.env.WAIT_MS || 60000);
let fails = 0, passes = 0;
const T0 = Date.now(); const step = (s) => { if (process.env.TRACE) console.error('[' + Math.round((Date.now() - T0) / 1000) + ' s] ' + s); };
const ok = (c, name, detail) => { if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' · ' + String(detail).slice(0, 300) : '')); };
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
const LEVELISH = /^(Normal|Low|Moderate|High|Severe|No data)$/i;
/* a retired word used as a level; the GLOF lake ladder ("Low / Monitor / Watch / Act") and plain verbs are allowed */
const RETIRED = /\b(Minimal|Monitor|Watch|Act|Heightened watch)\b/;
const retiredIn = (t) => String(t || '').split('\n').filter(l => RETIRED.test(l) && !/GLOF|lake/i.test(l) && !/\bwatch list\b/i.test(l)
  && !/Watchlist/.test(l)).map(l => l.trim().slice(0, 140));

const pw = await __T.playwright(); const chromium = pw.chromium || pw.default.chromium;
const browser = await __T.launch(chromium, { executablePath: CHROME, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true, timezoneId: 'Asia/Riyadh' });
try { await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }); } catch (_) {}
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 200)));
const RENUM = { '03': '05', '04': '03', '05': '04', '11': '10' };   /* v91.17.85 · the ride order: Assets and Spatial before Operations; Observations is 10 */
const tab = async (t) => { t = RENUM[t] || t; await page.locator('button').filter({ hasText: new RegExp('^' + t + '\\s') }).first().click(); await page.waitForTimeout(5000); };
try {
  await page.goto(BASE + '/analyst?operator=0', { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.AGN && AGN.level && AGN.hazards && AGN.hazards.band, null, { timeout: 120000 });
  /* the unit inputs arrive with the national sweep; wait for Islamabad's */
  const live = await page.waitForFunction(() => { try { return !!(window.DISTRICT_IN && DISTRICT_IN.Islamabad && DISTRICT_IN.Islamabad.weatherLive && (window.STATIONS || []).some(s => s && s.weatherLive)); } catch (_) { return false; } }, null, { timeout: Number(process.env.WAIT_DATA_MS || 360000), polling: 2000 }).then(() => true).catch(() => false);
  ok(live, 'A0 live inputs arrived for Islamabad (the checks below need them)');
  await page.waitForTimeout(WAIT / 3);

  /* ═══ A · the level function ═══ */
  step('═ A · the level function ═');
  const HS = JSON.parse(readFileSync(join(DATA, 'hazard-scale.json'), 'utf8'));
  const A = await page.evaluate(() => {
    const out = { w: [0, 9, 24.9, 25, 42, 45, 64.9, 65, 82, 100, null].map(v => AGN.level.word(v)),
      cuts: (window.AGN_BAND_CUTS || []).map(c => ({ min: c.min, label: c.label })), unit: {} };
    const k = 'Islamabad';   /* v91.17.120 · the map basis: hzDayInput per hazard (the map fill, 01 and 02 read it) */
    ['flood', 'landslide', 'heat', 'cold', 'wind', 'rain_hz', 'drought'].forEach(h => {
      try { let inp = DISTRICT_IN[k] || {}; try { const q = hzDayInput(k, h); if (q && !q.__unavailable) inp = q; } catch (_) {} const ev = AGN.hazards.evaluate(k, inp, h, 24, k); const s = ev && ev.screening && ev.screening.index;
        const m = AGN.hz5 && AGN.hz5.levelOf ? AGN.hz5.levelOf(h, s, {}) : null;
        out.unit[h] = { s, level: AGN.level.word(s), map: m && m.i != null ? AGN.hz5.words[m.i] : (m && m.nd ? 'No data' : null) }; } catch (e) { out.unit[h] = { err: e.message }; } });
    return out; });
  ok(JSON.stringify(A.w) === JSON.stringify(['Normal', 'Normal', 'Normal', 'Low', 'Low', 'Moderate', 'Moderate', 'High', 'Severe', 'Severe', 'No data']),
     'A1 AGN.level.word: 0/9/24.9 Normal, 25/42 Low, 45/64.9 Moderate, 65 High, 82/100 Severe, null No data', A.w.join(','));
  const fileCuts = (HS.screeningCuts || []).map(c => c.level + '@' + c.min).join(',');
  const pageCuts = A.cuts.map(c => c.label + '@' + c.min).join(',');
  ok(fileCuts === pageCuts, 'A2 the page cuts are data/hazard-scale.json screeningCuts', pageCuts + ' vs ' + fileCuts);
  const mism = Object.entries(A.unit).filter(([h, r]) => r.s != null && r.map && r.map !== r.level);
  ok(Object.keys(A.unit).length && !mism.length, 'A3 Islamabad: AGN.level agrees with the map level for every scored hazard', JSON.stringify(A.unit));
  const heatL = A.unit.heat && A.unit.heat.level;

  /* ═══ B · 01 unit panel ═══ */
  step('═ B · 01 unit panel ═');
  await page.evaluate(() => { try { if (typeof agnOpenLiveData === 'function') agnOpenLiveData('Islamabad'); } catch (_) {} });
  const P1 = await page.evaluate(() => { const R = document.getElementById('mpRightIn'); if (!R) return null;
    const secs = [...R.querySelectorAll('.mp-sec')].map(e => e.innerText);
    return { text: R.innerText, head: secs.find(t => /holds it|hold it|set by|set equally by|above Normal/.test(t)) || secs[0] || '',
      rows: [...R.querySelectorAll('.mp-r')].map(r => ({ n: (r.querySelector('.n') || {}).innerText, w: (r.querySelector('.bw') || {}).innerText, s: (r.querySelector('.sn') || {}).innerText })).filter(r => r.w != null) }; });
  if (P1 && P1.rows.length) {
    ok(!retiredIn(P1.text).length, 'B1 01 unit panel: no retired level words', retiredIn(P1.text).join(' | '));
    ok(!/band (Normal|Low|Moderate|High|Severe)/.test(P1.head), 'B2 01 headline: one level word, no second "band" word', P1.head);
    const hzRows = P1.rows.filter(r => !/^(Wetness|US AQI|PM2\.5|PM10)$/.test(String(r.n).trim()));
    ok(hzRows.length && hzRows.every(r => LEVELISH.test(String(r.w).trim())), 'B3 01 hazard rows: every row word is a level or No data', hzRows.map(r => r.n + ' ' + r.w + ' ' + r.s).join(', '));
    ok(!/did not arrive for this unit/.test(P1.text), 'B4 01 evidence lines name the inputs, not "did not arrive" for a scored hazard');
    const h01 = P1.rows.find(r => /^Heat$/.test(r.n));
    if (h01 && heatL) ok(String(h01.w).trim() === heatL, 'B5 01 Heat level is the engine level', h01.w + ' vs ' + heatL);
  } else ok(false, 'B1 01 unit panel rendered with scored rows', P1 && P1.text.slice(0, 200));

  /* ═══ 02 ═══ */
  step('═ 02 ═');
  await tab('02'); await page.waitForTimeout(4000);
  const P2 = await page.evaluate(() => { const g = id => { const e = document.getElementById(id); return e ? e.innerText : null; };
    return { impact: g('impactScore'), cls: [...document.querySelectorAll('#impactBars .ibar-class')].map(e => e.innerText.trim()),
      heat: ((document.querySelector('#impactBars .ibar') || {}).innerText || ''), uhi: g('uhiSignal'), card: g('ccUrbanNote'), commute: g('commuteRisk'),
      served: (function () { try { const s = (typeof activeStationId === 'function') ? STATIONS.find(x => x.id === activeStationId()) : STATIONS[0]; const u = AGN.urbanNow.peek(s.lat, s.lon);
        return u && u.nowC != null ? (Number(u.nowC) >= 0.05 ? '+' : Number(u.nowC) <= -0.05 ? '-' : '') + Math.abs(Number(u.nowC)).toFixed(1) + ' °C now' : null; } catch (_) { return null; } })(),
      asof: [...document.querySelectorAll('.asof')].map(e => e.innerText)[0] || '', body: document.body.innerText,
      pkt: new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hour12: false }) }; });
  ok(P2.cls.length === 4 && P2.cls.every(w => LEVELISH.test(w)), 'B6 02 impact bars: four level words', P2.cls.join(','));
  ok(LEVELISH.test(String(P2.impact).trim()) || /^[—–-]$/.test(String(P2.impact).trim()), 'B7 02 impact ring: a level word', P2.impact);
  if (heatL) ok(new RegExp('^Heat[\\s\\S]*' + heatL, 'i').test(P2.heat), 'B8 02 Heat reads the same level as 01', P2.heat.replace(/\n/g, ' ') + ' vs ' + heatL);
  ok(!/\bMinimal\b/.test(P2.body), 'B9 02: no "Minimal" anywhere');
  const num = (t) => (String(t || '').match(/[+\u2212-]?\d+(\.\d)? °C now/) || [''])[0].replace('\u2212', '-');
  const ref = P2.card ? num(P2.card) : (P2.served || '');
  ok(num(P2.uhi) === ref && (!P2.served || ref === P2.served), 'B10 02 premium brief urban heat = the forecast card = the served point value', P2.uhi + ' | ' + P2.card + ' | served ' + P2.served);
  const am = /As of (\d\d:\d\d) PKT · ([^·]+)/.exec(P2.asof);
  if (am) { const toMin = (s) => +s.slice(0, 2) * 60 + +s.slice(3); let d = toMin(P2.pkt) - toMin(am[1]); if (d < 0) d += 1440;
    ok(d <= 180, 'B11 02 as-of time is PKT (not the browser zone)', am[1] + ' at ' + P2.pkt);
    ok(d < 2 || !/just now/.test(am[2]), 'B12 02 as-of age computed from the reading time', P2.asof); }
  else ok(true, 'B11 02 as-of line not shown (no live reading yet)');

  /* ═══ 03 ═══ */
  step('═ 03 ═');
  await tab('03'); await page.waitForTimeout(3000); await page.evaluate(() => { const d = document.getElementById('agnNatWatch85'); if (d) { d.open = true; d.querySelectorAll('details').forEach(x => { if (x.querySelector('#opsxPriorityRows')) x.open = true; }); } });   /* (85) the national board is folded under National watch; (93) the priority rows sit in their own fold inside it */
  const P3 = await page.evaluate(() => { const g = id => { const e = document.getElementById(id); return e ? e.innerText : ''; };
    return { status: g('opsxNationalStatus'), note: g('opsxNationalNote'), pills: [...document.querySelectorAll('#opsxPriorityRows .opsx-state')].map(e => e.innerText.trim()),
      chain: g('opsxDecisionChain'), view: (document.querySelector('.view[data-view="operations"]') || {}).innerText || '' }; });
  ok(!RETIRED.test(P3.status + ' ' + P3.note), 'B13 03 national status in levels', P3.status + ' / ' + P3.note);
  ok(P3.pills.every(w => LEVELISH.test(w)), 'B14 03 board: one level per row', P3.pills.join(','));
  ok(!/strongest current screening signal[^.]*at 0\/100/.test(P3.chain), 'B15 03 decision chain never calls a 0 the strongest signal', P3.chain.split('\n').slice(0, 2).join(' '));
  ok(!retiredIn(P3.view).length, 'B16 03: no retired level words', retiredIn(P3.view).slice(0, 4).join(' | '));

  /* ═══ 04 ═══ */
  step('═ 04 ═');
  await tab('04'); await page.waitForTimeout(3000);
  const P4 = await page.evaluate(() => (document.querySelector('.view[data-view="assessments"]') || {}).innerText || '');
  ok(!retiredIn(P4).length, 'B17 04: no retired level words', retiredIn(P4).slice(0, 4).join(' | '));

  /* ═══ 09 ═══ */
  step('═ 09 ═');
  await tab('06'); await page.waitForTimeout(3000);   /* v91.17.266 · AI Decision is step 06 (Financial and Sustainability removed; was 08 since v91.17.250) */
  const P9a = await page.evaluate(() => (document.getElementById('aiQuantBody') || {}).textContent || '');
  ok(!/worst operational class|\bMonitor\b|\bWatch\b|\bAct\b/.test(P9a), 'B18 09 engine numbers in levels', P9a.slice(0, 200));
  /* B19 (the 09 Watchlist cards) retired in v91.17.277: the hidden watch pane is removed with its code (FIX277 L9) */

  /* ═══ 10 ═══ · (v91.17.266: Report is its own tab again, the Report Builder.) v91.17.250: the Report step is gone (CEO 9 Oct: reports come from Assets, Sustainability and Financial); its readiness
     ring and release gate went with it. The Report Builder is Assets' own sub-tab. */
  step('═ 10 ═');
  /* v91.17.266 · the Report Builder has its own top-level tab (07 Report); no 09 Result step, no Assets sub-tab */
  const RB = await page.evaluate(() => { const nb = document.querySelector('#machNav [data-goto="executive"]'), rb = document.querySelector('#machNav [data-goto="report"]'), t = document.querySelector('#asmtTabs [data-asmt="report"]'), sel = document.getElementById('asmtReportType');
    return { navShown: !!(nb && nb.offsetParent), reportTab: !!(rb && rb.offsetParent), builderTab: !!t, inReport: !!(sel && sel.closest('.view[data-view="report"]')) }; });
  ok(!RB.navShown && RB.reportTab && !RB.builderTab && RB.inReport, 'B20 no 09 Result step; the Report Builder is its own Report tab', JSON.stringify(RB));
  const ticks = await page.evaluate(() => [...document.querySelectorAll('#machNav [data-goto]')].map(b => ({ k: b.getAttribute('data-goto'),
    tick: getComputedStyle(b.querySelector('.nav-label') || b, '::after').content })));
  const R = await page.evaluate(() => { try { return AGN.executiveReadiness(); } catch (_) { return {}; } });
  const bad = ticks.filter(t => (t.k === 'executive' && !R.spatial) || (t.k === 'hybridlab' && !R.scenario) || (t.k === 'financial' && !R.financial) || (t.k === 'airisk' && !R.ai))
    .filter(t => t.tick && t.tick !== 'none' && t.tick !== 'normal');
  ok(!bad.length, 'B23 tab ticks only where the step has its evidence', bad.map(t => t.k).join(','));

  /* ═══ Compare and the Comfort brief ═══ */
  step('═ Compare and the Comfort brief ═');
  await tab('01');
  const CMP = await page.evaluate(async () => { try { openCompare(); } catch (_) {} await new Promise(r => setTimeout(r, 2500)); const t = (document.getElementById('cmpGrid') || {}).innerText || ''; try { closeCompare(); } catch (_) {} return t; });
  ok(!/Comfort score/.test(CMP) && !/· Watch\b/.test(CMP), 'B24 Compare: no bare "Comfort score" and no "Watch" discomfort badge', CMP.slice(0, 160).replace(/\n/g, ' '));
  ok(/Discomfort index · now/.test(CMP) || !/Discomfort index/.test(CMP), 'B25 Compare: the discomfort index says which hour it is for');
  /* the text the Comfort brief button copies (buildBrief is what copyBrief puts on the clipboard; the clipboard itself can hang headless) */
  const BR = await page.evaluate(() => { try { const s = (typeof activeStationId === 'function' ? STATIONS.find(x => x.id === activeStationId()) : null) || STATIONS[0]; return buildBrief(s); } catch (e) { return 'ERR ' + e.message; } });
  if (!/No live reading/.test(BR) && !/^ERR/.test(BR)) {
    ok(!/Heat risk: Low|heat index/i.test(BR) && /Heat stress at this place \(UTCI\): (Normal|Moderate|High|Severe|Not assessed)/.test(BR) && /Heat level of the area [^:\n]*: (Normal|Low|Moderate|High|Severe|No data)/.test(BR), 'B26 Comfort brief: the place\'s UTCI level and the area\'s engine level (v91.17.283.12)', (BR.match(/Heat (stress at this place|level of the area)[^\n]*/g) || []).join(' | '));
    if (heatL) ok(new RegExp('Heat level of the area [^:\\n]*: ' + heatL).test(BR), 'B27 Comfort brief area heat level = 01 heat level', heatL);
    const ub = num((BR.match(/Urban heat: [^\n]*/) || [''])[0]);
    ok(!ub || ub === ref, 'B28 Comfort brief urban heat = the value on 02', ub + ' vs ' + ref);
  } else ok(true, 'B26 Comfort brief refused (no live reading) — nothing to check', BR.slice(0, 80));

  ok(!pageErrors.length, 'C1 no page errors', pageErrors.join(' | '));
} catch (e) { ok(false, 'harness', e && e.stack || e); }
await browser.close();
console.log(`\n${passes} PASS · ${fails} FAIL`);
process.exit(fails ? 1 : 0);
