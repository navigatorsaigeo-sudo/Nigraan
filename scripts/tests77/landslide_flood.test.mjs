import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.77 · agent X · landslide refit with satellite embeddings (E1) + the dry-month flood rarity fix (Karachi 27 mm)
     node scripts/tests77/landslide_flood.test.mjs [baseUrl]        default http://127.0.0.1:8787
   Part 1 (files + API): data/aef-tehsil-2024.json (576 tehsils, 10 PCA bands, provenance, CC BY 4.0 attribution recorded, no
     Earth Engine, south-up tiles read through the affine); the blocked-CV result in data/landslide-susceptibility30-aef.json;
     the served file and /api/landslide/giri agree with the promotion decision; the Sources page credits the embeddings only if
     they are served.
   Part 2 (browser): v91.17.283.27: the ERA5 rarity table (AGN.rainClim, rain_local) is gone from the page (one home: the server's
     satellite return levels). */
import { createRequire as __agnCR } from 'node:module'; import { pathToFileURL as __agnP2U } from 'node:url'; import { existsSync as __agnEx } from 'node:fs';
/* v91.17.255 · B-7 · Windows: Playwright from the app's node_modules, the bundled browser when the Linux one is absent, file URLs for absolute imports */
const __agnPW = __T.playwrightUrl() || 'playwright';
const __agnChrome = (p) => (p && __agnEx(p)) ? p : undefined;
const __agnImp = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? __agnP2U(String(p)).href : p);
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = process.env.NIGRAAN_DATA_DIR || join(APP, 'data');
const PW = __agnPW;
const CHROME = __agnChrome(__T.chromiumPath());
let fails = 0, passes = 0;
const ok = (c, name, detail) => { if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' · ' + String(detail).slice(0, 400) : '')); };
const J = (f) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));
const ATTR = 'The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind';

/* ── Part 1 · files ─────────────────────────────────────────────────────────────────────────────────────────────── */
let promoted = null;
try {
  const A = J('aef-tehsil-2024.json');
  const n = Object.keys(A.units || {}).length;
  ok(n === 576 && Object.values(A.units).every(u => Array.isArray(u.pc) && u.pc.length === 10 && u.npts > 0), 'E1 tehsil embedding table: 576 tehsils, 10 PCA bands, every tehsil has overview pixels', n + ' units, min pts ' + A.provenance.minPointsPerTehsil);
  const L = (A.licence || [])[0] || {};
  ok(L.licence === 'CC BY 4.0' && L.attribution === ATTR, 'E1 licence CC BY 4.0 with the required attribution text recorded in the header', L.attribution);
  const P = A.provenance || {};
  ok(P.earthEngine === false && P.account === false && P.tiles >= 200 && P.tilesSouthUp === P.tiles && /affine/.test(P.orientation || ''), 'E1 provenance: public anonymous COGs, no Earth Engine, south-up tiles read through the affine', JSON.stringify({ tiles: P.tiles, southUp: P.tilesSouthUp, factor: P.overviewFactor, year: P.year }));
  ok(A.pca && A.pca.components === 10 && Array.isArray(A.pca.basis) && A.pca.basis.length === 10 && A.pca.basis[0].length === 64 && A.pca.mean.length === 64, 'E1 PCA basis saved (10 x 64 + mean) so a later year projects on the same axes', 'explained ' + (A.pca && A.pca.explainedTotal));
  const C = J('landslide-susceptibility30-aef.json'); const R = C.result || {}; const S = R.schemes || {};
  ok(['gkf5-district', 'lodo', 'block1deg', 'block2deg'].every(k => S[k] && S[k].gainCi90Cluster && S[k].gainCi90Cluster.length === 2), 'E1 refit: blocked CV (leave-one-district-out, 1 and 2 degree blocks) with cluster-bootstrap CI90 recorded', Object.entries(S).map(([k, v]) => k + ' ' + v.aucModel30 + '→' + v.aucModel30Aef + ' [' + v.gainCi90Cluster + ']').join('; '));
  ok(Math.abs((S['gkf5-district'] || {}).aucModel30 - 0.907) < 0.002, 'E1 harness reproduces the served model30 AUC 0.907 (T protocol)', (S['gkf5-district'] || {}).aucModel30);
  const ciPass = !!(S.lodo && S.block1deg && S.lodo.gainCi90Cluster[0] > 0 && S.block1deg.gainCi90Cluster[0] > 0);
  promoted = C.status === 'served';
  ok(promoted ? ciPass : true, 'E1 promotion only when the blocked-CV gain CI90 excludes 0', 'CI rule ' + (ciPass ? 'met' : 'not met') + ' · status ' + C.status + ' · ' + (C.verdict || '').slice(0, 160));
  const LS = J('landslide-susceptibility30.json');
  ok(promoted ? /aef/.test(LS.served) : LS.served === 'model30', 'E1 served file matches the decision (' + (promoted ? 'promoted' : 'kept model30') + ')', 'served ' + LS.served);
} catch (e) { ok(false, 'E1 files readable', e.message); }

/* ── Part 1 · API ───────────────────────────────────────────────────────────────────────────────────────────────── */
try {
  const r = await fetch(BASE + '/api/landslide/giri', { signal: AbortSignal.timeout(60000) }); const j = await r.json();
  const s = j.susceptibility30 || {};
  ok(r.ok && s.ready && (promoted ? /aef/.test(s.served) : s.served === 'model30'), 'E1 /api/landslide/giri susceptibility30 serves the decided model', 'served ' + s.served + ' · auc ' + JSON.stringify(s.auc));
  const q = await fetch(BASE + '/api/sources', { signal: AbortSignal.timeout(60000) }); const sj = await q.json();
  const e = (sj.entries || []).find(x => x.id === 'aef_embeddings');
  if (promoted) ok(!!e && e.attribution === ATTR && !e.internalOnly, 'E1 Sources page credits the embeddings with the required attribution', e ? e.attribution : 'no entry');
  else ok(!e || e.internalOnly, 'E1 embeddings not served: not credited as a customer source', e ? 'entry present, internalOnly ' + e.internalOnly : 'absent');
  ok(!/AlphaEarth|DeepMind/.test(JSON.stringify(s)), 'E1 no supplier name in the landslide API payload (generic outside Sources)');
} catch (e) { ok(false, 'E1 API reachable', e.message); }

/* ── Part 2 · browser ───────────────────────────────────────────────────────────────────────────────────────────── */
const _pw = await __T.playwright(); const chromium = _pw.chromium || (_pw.default && _pw.default.chromium);
const browser = await __T.launch(chromium, { executablePath: CHROME, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const perr = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => perr.push(String(e && e.message).slice(0, 200)));
  await page.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
  /* v91.17.283.27 · item 1 · the ERA5 wet-day table this part tested (AGN.rainClim, rain_local.monthMinWetDays) is replaced by the
     25-year satellite return levels on the server (data/rain-return-levels.json, scripts/tests28327/rainrarity.unit.test.mjs): the page
     carries no rarity table and no rarity rank of its own */
  await page.waitForFunction(() => !!(window.AGN && window.FORMULA_REGISTRY), null, { timeout: 180000 });
  const C = await page.evaluate(() => ({ rc: !!(window.AGN && AGN.rainClim), rl: !!(FORMULA_REGISTRY.rain_local), block: !!document.getElementById('agn-rain-clim') }));
  ok(!C.rc && !C.rl && !C.block, 'F the page holds no ERA5 rain rarity table, reader or rank (one home: the server\'s return levels)', JSON.stringify(C));
  ok(!perr.length, 'no page errors', perr.join(' | '));
} catch (e) { ok(false, 'browser checks ran', e.message); }
finally { await browser.close(); }
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
