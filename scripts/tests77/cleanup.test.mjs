import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.77 · U2 · customer-screen cleanup (02 Forecast, 03 Operations, 04 Assets, 05 Spatial, 07 Financial, 08 Sustainability),
   the two 404s on load and on district selection, and one name per step.
     node scripts/tests77/cleanup.test.mjs [baseUrl]            default http://127.0.0.1:8787
     --no-browser   skip section C (Playwright)
   A · server: /api/report/context answers a DISTRICT name ("East Karachi", "Karachi East", "Tharparkar") with 200 and says which
       tehsil stands in (unitResolvedFrom); a name that is neither still answers 404; /api/case/project lists projects (the
       client asks for a portfolio only for a listed project).
   B · data: data/financial-worked-example.json is marked illustrative, every input carries a provenance, the damage curve
       is the published JRC 2017 Asia industrial curve (0.4816 at 1.0 m) with its source and licence; the copy inside
       build/cleanup_ui.html is the same object; the fold note CSS uses six-digit escapes (no U+0A0F).
   C · page (Playwright, customer view, 1440x900): no 404 for /api/case/portfolio or /api/report/context during load;
       02 opens on current conditions → 72-hour meteogram → 15-day outlook → levels, the input diagnostics / archive
       diagnostic / correction line are hidden, the pooled interval and CMIP6 sit in a closed fold, and no "Not run",
       "pending" or "Not loaded" is visible; 03 shows no experimental horizon chip and no contract button; 04 hides the
       legacy-delete and Sync buttons and shows "Open case document" and a plain subject prompt; 05 hides the planned /
       partial source rows and the GeoLibre view the fragment sends is centred inside Pakistan's boundary box; 07 shows
       the labelled example with a direct-damage figure equal to value × curve ratio, editable (changing the depth
       changes the result); 08: the S2 figure uses the table's words and agrees with its counts, the project badge and
       readiness line agree with the context bar, "Pakistan position" printed once and no raw "Value:"/"Share:" objects,
       no Gurmukhi letter in any fold note; every page heading starts with its tab name and Prev/Next use tab names;
       ?operator=1 (loopback) shows the diagnostics again; zero page errors.
   PASS/FAIL lines; exit 1 on any FAIL. */
import { createRequire as __agnCR } from 'node:module'; import { pathToFileURL as __agnP2U } from 'node:url'; import { existsSync as __agnEx } from 'node:fs';
/* v91.17.255 · B-7 · Windows: Playwright from the app's node_modules, the bundled browser when the Linux one is absent, file URLs for absolute imports */
const __agnPW = __T.playwrightUrl() || 'playwright';
const __agnChrome = (p) => (p && __agnEx(p)) ? p : undefined;
const __agnImp = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? __agnP2U(String(p)).href : p);
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const BASE = (process.argv.slice(2).find(a => /^https?:/.test(a)) || 'http://127.0.0.1:8787').replace(/\/$/, '');
const NO_BROWSER = process.argv.includes('--no-browser');
const PW = process.env.PW_MODULE || __agnPW;
const CHROME = process.env.PW_CHROME || __agnChrome(__T.chromiumPath());
let fails = 0, passes = 0;
const ok = (c, name, detail) => { if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' · ' + String(detail).slice(0, 300) : '')); };
async function get(p) { try { const r = await fetch(BASE + p, { cache: 'no-store' }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, json: j }; } catch (e) { return { status: 0, error: e.message }; } }

/* ── A · server ─────────────────────────────────────────────────────────────────────────────────────────────── */
{
  const a = await get('/api/report/context?unit=' + encodeURIComponent('East Karachi'));
  ok(a.status === 200 && a.json && a.json.unitResolvedFrom && a.json.unitResolvedFrom.district === 'East Karachi', 'A · report context answers the district "East Karachi" (was 404)', a.status + ' ' + JSON.stringify(a.json && a.json.unitResolvedFrom));
  const b = await get('/api/report/context?unit=' + encodeURIComponent('Karachi East'));
  ok(b.status === 200 && b.json && b.json.unitResolvedFrom && b.json.unitResolvedFrom.district === 'East Karachi', 'A · word order ignored ("Karachi East")', b.status);
  const c = await get('/api/report/context?unit=Tharparkar');
  ok(c.status === 200 && c.json && c.json.unitResolvedFrom && c.json.unitResolvedFrom.district === 'Tharparkar' && c.json.unit && c.json.unit.name, 'A · report context answers the district "Tharparkar" (was 404)', c.status + ' · stands in: ' + (c.json && c.json.unit && c.json.unit.name));
  const d = await get('/api/report/context?unit=Islamabad');
  ok(d.status === 200 && d.json && !d.json.unitResolvedFrom, 'A · a tehsil name resolves as before (no district note)', d.status);
  const e = await get('/api/report/context?unit=NoSuchPlaceXyz');
  ok(e.status === 404, 'A · a name that is neither tehsil nor district still answers 404', e.status);
  const f = await get('/api/case/project');
  ok(f.status === 200 && f.json && Array.isArray(f.json.projects), 'A · /api/case/project lists the server projects (the portfolio guard reads it)', f.status);
}

/* ── B · data and static ────────────────────────────────────────────────────────────────────────────────────── */
/* v91.17.266 · the financial worked example (data/financial-worked-example.json) left NIGRAAN with the Financial tab: its data checks are retired */
{
  let frag = '';
  try { frag = readFileSync(join(ROOT, 'build', 'cleanup_ui.html'), 'utf8'); } catch (_) {}
  ok(/content:"\\0000a0\\0000b7\\0000a0form folded/.test(frag) && !/content:"[^"]*\\00a0f/.test(frag), 'B · the fold-note CSS uses six-digit escapes (no \\00a0f → U+0A0F)');
}

/* ── C · page ───────────────────────────────────────────────────────────────────────────────────────────────── */
if (!NO_BROWSER) {
  const pw = await __T.playwright(); const chromium = pw.chromium || pw.default.chromium;
  const browser = await __T.launch(chromium, { executablePath: CHROME, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-zygote', '--renderer-process-limit=1'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const bad = [], perr = [];
    page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, '')); });
    page.on('pageerror', e => perr.push(String(e).slice(0, 200)));
    await page.goto(BASE + '/analyst?operator=0', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(22000);
    const tab = async (v) => { await page.evaluate((v) => { const b = document.getElementById('agn-tab-' + v); if (b) b.click(); }, v); await page.waitForTimeout(3500); };
    const isOp = await page.evaluate(() => document.documentElement.classList.contains('agn-operator'));
    ok(!isOp, 'C · customer view by default');
    const p404 = bad.filter(x => /^404 \/api\/case\/portfolio/.test(x)), c404 = bad.filter(x => /^404 \/api\/report\/context/.test(x));
    ok(p404.length === 0, 'C · no 404 for /api/case/portfolio during load (A-49)', p404.join(' | '));

    /* 02 */
    await tab('livedata');
    const f = await page.evaluate(() => {
      const v = document.getElementById('agn-panel-livedata'), vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
      const order = [...v.children].filter(vis).map(e => e.id || e.className.split(' ')[0]);
      const t = v.innerText;
      const fold = document.getElementById('agnFcMore');
      return { order, hidden: ['omLiveSection', 'synbar', 'mverifyCard', 'agnMosLine', 'agnUrbanHeatStrip', 'agnStateRows', 'agnLczCell'].filter(id => document.getElementById(id) && vis(document.getElementById(id))),
        idleVisible: (t.match(/\b(Not run|status pending|Not loaded|not measured)\b/g) || []), diag: /850 hPa|modelled point input|Archive agreement diagnostic/i.test(t),
        fold: !!fold && !fold.open && !!fold.querySelector('#agnEnsSection') && !!fold.querySelector('#agnV91CmipCard') };
    });
    /* v91.17.87 · F-1 · the page is laid out by horizon: Now · 72 h · 15 days and weeks · season · 2030s/2050s, each card under its horizon */
    const hz = await page.evaluate(() => { const at = (sel) => { const e = document.querySelector(sel); const s = e && e.closest('.agn-hz87-sec'); return s ? s.id.replace('agnHz87-', '') : null; };
      const secs = [...document.querySelectorAll('#agnHz87 > .agn-hz87-sec')].map(s => s.id.replace('agnHz87-', ''));
      return { secs, cc: at('.live-summary-row'), met: at('.premium-deck'), ens: at('#agnEnsSection'), out: at('#agnOutlookInline'), sea: at('#susSeasonCard'), cmip: at('#agnV91CmipCard'), foot: [...document.getElementById('agn-panel-livedata').children].filter(e => e.getClientRects().length).pop().className }; });
    ok(hz.secs.join() === 'now,h72,d15,season,clim' && hz.cc === 'now' && hz.met === 'h72' && hz.out === 'd15', 'C · 02 opens on the forecast by horizon: now → 72 h → 15 days → season → 2050s (A-42, F-1)', JSON.stringify(hz));
    ok(f.hidden.length === 0 && !f.diag, 'C · 02 input diagnostics, archive diagnostic, correction line and calibration strips hidden for customers', f.hidden.join(',') || (f.diag ? 'diagnostic text visible' : ''));
    ok(f.idleVisible.length === 0, 'C · 02 shows no "Not run / pending / Not loaded / not measured" state nobody asked for (A-44)', f.idleVisible.join(','));
    ok(hz.ens === 'd15' && hz.cmip === 'clim' && hz.sea === null && hz.out === 'd15' && /agn-obs-sec/.test(hz.foot), 'C · 02 pooled interval and the Outlook (which carries the season) under 15 days, no second season card (v91.17.244), CMIP6 under 2050s; the Stations table last (v91.17.266: no story footer)', JSON.stringify(hz));

    /* 03 */
    await tab('operations');
    const o = await page.evaluate(() => { const vis = (e) => !!e && e.getClientRects().length > 0; const v = document.getElementById('agn-panel-operations');
      return { chips: [...v.querySelectorAll('#opsxHorizon button')].filter(vis).map(b => b.textContent.trim()), contract: [...v.querySelectorAll('button,span')].filter(vis).filter(b => /Production contract|Backend ready contracts/.test(b.textContent)).length,
        notConnected: /Data not connected/.test(v.innerText), idle: (v.innerText.match(/^(Not run\.|Not evaluated yet\.|No register loaded\.)/mg) || []) }; });
    ok(o.chips.length > 0 && !o.chips.some(c => /exp\b|2030|2050|Seasonal/.test(c)), 'C · 03 horizon chips: only the working ones (A-45)', o.chips.join(' | '));
    ok(o.contract === 0 && !o.notConnected, 'C · 03 no contract button, no "Data not connected" tile');
    ok(o.idle.length === 0, 'C · 03 no idle "Not run / Not evaluated / No register" lines', o.idle.join(','));

    /* 04 */
    await tab('assessments');
    const a = await page.evaluate(() => { const vis = (e) => !!e && e.getClientRects().length > 0;
      return { legacy: vis(document.getElementById('agnLegacyClientDelete')), sync: vis(document.getElementById('agnCaseSync')), open: vis(document.getElementById('agnCaseOpen')),
        contracts: vis(document.getElementById('agnV9116Contracts')), prompt: [...document.querySelectorAll('.agn-subj-cust')].filter(vis).map(e => e.textContent)[0] || '',
        missingVisible: [...document.querySelectorAll('[id^="agnSubjectStrip-"]')].filter(vis).some(e => /missing: active asset/.test(e.textContent)) }; });
    ok(!a.legacy && !a.sync && !a.contracts && !a.open, 'C · 04 housekeeping buttons hidden; "Open case document" removed with the Casebook going operator-only (v91.17.266)', JSON.stringify(a).slice(0, 200));
    ok(!a.missingVisible && (/^Pick an asset/.test(a.prompt) || a.prompt === ''),   /* (93) the desktop build hides the customer prompt (desktop_ui); the engineering line must still not show */
       'C · 04 plain-language subject prompt instead of "missing: active asset, decision case id"', a.prompt);
    const k = await page.evaluate(() => { const b = document.getElementById('asmtConfidence'); const s = b.textContent; b.textContent = 'high · live weather, live features, model run live'; return s; });
    await page.waitForTimeout(2200);   /* (93) the sweep is throttled to 1.5 s since v91.17.80 PF-03 */
    const k2 = await page.evaluate(() => { const b = document.getElementById('asmtConfidence'); const r = b.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(b).lineHeight) || 20; const d = b.parentNode.querySelector('small.agn-kpi-detail'); return { t: b.textContent, lines: Math.round(r.height / lh), d: d && d.textContent }; });
    ok(k2.t === 'high' && /live weather/.test(k2.d || '') && k2.lines <= 2, 'C · 04 evidence-readiness KPI keeps the word big and the detail underneath (was ~9 lines)', JSON.stringify(k2));

    /* 05 (v242: the Spatial tab is removed; its asset evidence profile is on Assets › Site Assessment) */
    await tab('assessments');
    const s = await page.evaluate(() => { const vis = (e) => !!e && e.getClientRects().length > 0;
      const rows = [...document.querySelectorAll('#agnAssetEvidenceProfileBody .agn-v9116-oef > span')];
      return { n: rows.length, planned: rows.filter(vis).filter(r => /\b(planned|partial)\b/.test(r.textContent)).length, hiddenRows: rows.filter(r => !vis(r)).length,
        tab: !!document.querySelector('#machNav [data-goto="spatiallab"]'), frame: !!document.getElementById('agnGeoFrame'),
        geom: !![...document.querySelectorAll('.view[data-view="assessments"] input[type="file"]')].find(i => /\.geojson/.test(i.accept || '')) }; });   /* v91.17.266 · geometry comes in through Add sites (CSV / XLSX / GeoJSON) */
    ok(s.n > 0 && s.planned === 0 && s.hiddenRows >= 6, 'C · 05 the asset evidence profile is on Assets and its planned / partial rows are hidden (A-48)', JSON.stringify(s));
    ok(!s.tab && !s.frame && s.geom, 'C · 05 no Spatial tab, no GeoLibre frame; client geometry import is on Assets (Add sites takes GeoJSON)', JSON.stringify(s));

    /* 07 · v91.17.266 · the Financial tab and its worked example are retired */

    /* 08 · v91.17.266 · the Sustainability tab (S2 figure, project badge, transition register) left NIGRAAN (owner decision): its checks are retired;
       the fold-note check below still runs on every remaining sub-heading */
    const su = await page.evaluate(() => { const afters = [...document.querySelectorAll('.asmt-sub')].map(e => getComputedStyle(e, '::after').content).filter(c => c && c !== 'none');
      return { gurmukhi: afters.some(c => /ਏ/.test(c)), afters: afters.length, sustain: !!document.querySelector('#machNav [data-goto="sustainability"]') }; });
    ok(!su.sustain, 'C · 08 no Sustainability tab (v91.17.266)');
    ok(!su.gurmukhi, 'C · no Gurmukhi letter in the fold notes (B-32)', su.afters + ' notes checked');

    /* B-34 */
    const hn = await page.evaluate(() => {
      const tabs = {}; document.querySelectorAll('#machNav button[id^="agn-tab-"]').forEach(b => { tabs[b.id.slice(8)] = (b.getAttribute('data-agn-full') || (b.querySelector('.nav-label') || b).textContent).trim().replace(/^\d+\s*/, '');   /* v91.17.153 · a label shortened to fit the row keeps its full name in data-agn-full */ });
      const heads = [...document.querySelectorAll('.view .agn-v91-story-head .agn-v91-head-line > b')].map(b => { const v = b.closest('.view').id.replace(/^agn-panel-/, ''); return { v, h: b.textContent.trim(), t: tabs[v] }; });
      const tabNames = Object.values(tabs).concat([...document.querySelectorAll('#machNav button:not([id^="agn-tab-"])')].map(b => (b.getAttribute('data-agn-full') || b.textContent).trim()));   /* v91.17.153 · Sources and Evidence & Methods are nav destinations without an agn-tab id */
      const navs = [...document.querySelectorAll('.agn-v91-story-nav button')].map(b => b.textContent.trim()).filter(t => /[←→]/.test(t)).map(t => t.replace(/^←\s*|\s*→$/g, ''));
      return { bad: heads.filter(x => x.t && x.h.toLowerCase().indexOf(x.t.toLowerCase()) !== 0), heads: heads.length, navs: navs.length, badNav: navs.filter(n => tabNames.indexOf(n) < 0) };
    });
    ok(hn.heads >= 6 && hn.bad.length === 0, 'C · every page heading starts with its tab name (B-34; fewer tabs since v91.17.266)', hn.bad.map(x => x.t + '≠' + x.h).join('; '));
    ok(hn.navs === 0, 'C · no ← / → story buttons at the foot of the tabs (v91.17.266)', hn.badNav.join('; '));
    ok(c404.length === 0, 'C · no 404 for /api/report/context during the session', c404.join(' | '));
    ok(perr.length === 0, 'C · zero page errors', perr.join(' | '));

    /* operator view keeps everything */
    const opp = await ctx.newPage();
    await opp.goto(BASE + '/analyst?operator=1', { waitUntil: 'domcontentloaded' }); await opp.waitForTimeout(16000);
    const st = await opp.evaluate(async () => { try { return (await (await fetch('/api/operator/status')).json()).operator; } catch (_) { return null; } });
    if (st) {
      await opp.evaluate(() => document.getElementById('agn-tab-livedata').click()); await opp.waitForTimeout(3000);
      const shown = await opp.evaluate(() => { const e = document.getElementById('omLiveSection'); return document.documentElement.classList.contains('agn-operator') && !!e && e.getClientRects().length > 0; });
      ok(shown, 'C · operator view (?operator=1 on loopback) still shows the input diagnostics');
    } else console.log('SKIP operator view: /api/operator/status says this client is not loopback');
    await opp.close();
  } finally { await browser.close(); }
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
