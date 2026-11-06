/* v91.17.283.24 · PAGES LANE (offline, no server): the analyst console, the start page and Customize NIGRAAN after the self-audit items
     U1  W1  the hazard engine runs on the server only: hzScore, hzHeat, hzWind, hzCold refuse outside the engine host (first statement);
             the site level, the map's tehsil level and the AI tab read served levels (no page score); no "page estimate" left on the map
     U2  W1  the science modules (the server's engine host) still score: hzScore answers a level there, and refuses when the same code runs
             as a browser (no engine flag)
     U3  W5 W6 W7 W19 W20  the undefined names are gone (report-cleared listener, identity check, point intake, stress flag, tehsil note)
     U4  W16 W21 W22  start page chip without a class is not Low; place search takes the server's own first row only; no typed city list
     U5  dead code removed (secRight, soilMoistBasis, CONF_TIER_PCT, #blendBadge, .v2832-est); the UTCI chart bands read the register
   usage: node scripts/tests28324/pages.unit.test.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 400) : '')); } };
const M = rd('artefact/AI_GEO_NIGRAAN_v91_17_MACH.html'), S = rd('artefact/NIGRAAN_START.html'), N = rd('artefact/NIGRAAN_3.html'), PS = rd('server/api/placesearch_ui.js');
const code = (h) => [...h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter((m) => !/application\/json|\bsrc=/.test(m[1])).map((m) => ({ id: (m[1].match(/id="([^"]+)"/) || [])[1] || null, code: m[2] }));
const MS = code(M);
const body = (name) => { const i = M.indexOf('function ' + name + '('); if (i < 0) return ''; return M.slice(i, M.indexOf('\n', M.indexOf('{', i) + 1) + 200); };

/* U1 */
for (const f of ['hzScore', 'hzHeat', 'hzWind', 'hzCold']) { const b = body(f); ok(/\{\s*\n\s*if\(!agnEngineHost\(\)\) return agnPageRefusal\(/.test(b), 'U1 ' + f + ' refuses outside the engine host (its first statement)', b.slice(0, 200)); }
const site = MS.find((s) => s.id === 'agn-r272-site');
ok(site && !/hzScore|hzDayInput|hzHeat|hzCold|hzWind/.test(site.code.replace(/\/\*[\s\S]*?\*\//g, '')) && /part\('siteLevels'/.test(site.code), 'U1 (v283.29 W2) the site level is the server\'s siteLevels part (no page scoring code in agn-r272-site)');
ok(/function districtHazardInfoRaw\(name\)\{[\s\S]{0,400}if\(!agnEngineHost\(\)\)\{ var q=null; try\{ q=\(window\.AGN&&AGN\.v283&&AGN\.v283\.issuedFor\)/.test(M), 'U1 the map tehsil level in a browser is the issued run (districtHazardInfoRaw -> AGN.v283.issuedFor)');
ok(/function aiDistrictRisk\(input,hazard,lead,name\)\{\s*\n\s*if\(!agnEngineHost\(\)\)/.test(M) && /function aiStationRisk\(s,hazard,lead\)\{\s*\n\s*if\(!agnEngineHost\(\)\)/.test(M), 'U1 the AI tab and the AI context read served levels (aiDistrictRisk, aiStationRisk)');
const codeOnly = MS.map((s) => s.code.replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
ok(!/page estimate/.test(codeOnly), 'U1 no "page estimate" left on the map, its chip or the run chip', (codeOnly.match(/.{60}page estimate.{40}/) || [''])[0]);
ok(/if\(!G\.agnEngineHost\|\|!G\.agnEngineHost\(\)\) return;/.test(M), 'U1 the hourly self-check (it re-derives every level) runs in the engine host only');

/* U2: the science modules in the engine host score, and the same code refuses as a browser */
{ const { createScience } = await import(pathToFileURL(join(ROOT, 'server', 'science', 'loader.mjs')).href);
  const sci = createScience({ port: 1, fetch: async () => { throw new Error('offline'); }, log: () => {} }); sci.boot();
  const q = (e) => vm.runInContext(e, sci.ctx);
  const r = JSON.parse(q(`(function(){ var k=Object.keys(DISTRICT_IN||{})[0]; var r=hzScore(k, Object.assign({}, DISTRICT_IN[k], {t:44, hum:20, wind:5, weatherLive:true, fcSource:'test'}), 'heat', 24, k); return JSON.stringify({host:agnEngineHost(), refusal:!!(r&&r.pageRefusal), score:r&&r.score}); })()`));
  ok(r.host === true && r.refusal === false && typeof r.score === 'number', 'U2 the engine host (server/science, ?engine=1) still scores: heat ' + r.score);
  const b = JSON.parse(q(`(function(){ var P=navigator.platform, S=location.search; try{ Object.defineProperty(navigator,'platform',{value:'Linux',configurable:true}); }catch(_){ navigator.platform='Linux'; }
    try{ Object.defineProperty(location,'search',{value:'',configurable:true}); }catch(_){ try{ location.search=''; }catch(__){} }
    var h=agnEngineHost(), k=Object.keys(DISTRICT_IN)[0], r=hzScore(k, DISTRICT_IN[k], 'heat', 24, k), w=hzWind({wind:50,gust:90},{tri:200});
    try{ Object.defineProperty(navigator,'platform',{value:P,configurable:true}); }catch(_){} try{ Object.defineProperty(location,'search',{value:S,configurable:true}); }catch(_){}
    return JSON.stringify({host:h, refusal:!!(r&&r.pageRefusal), score:r&&r.score, why:r&&r.noDataWhy, wind:!!(w&&w.pageRefusal)}); })()`));
  ok(b.host === false && b.refusal && b.score === null && b.wind && /not assessed/i.test(b.why || ''), 'U2 the same code as a browser refuses: "Not assessed" with the reason, no score', JSON.stringify(b)); }

/* U3 */
ok(/document\.dispatchEvent\(new CustomEvent\('agn:report-cleared'/.test(M) && !/[^.\w]D\.dispatchEvent\(new CustomEvent\('agn:report-cleared'/.test(M), 'U3 W5 the report-cleared event is dispatched on document (D was undefined there)');
ok(!/CLASSES\.demo/.test(M), 'U3 W6 the identity_incomplete check no longer reads the undefined CLASSES');
ok(!/PK_BOX/.test(codeOnly) && /outside_national_grid: outside/.test(M) && /AGN\.siteUnit\(lat, lon\)/.test(M), 'U3 W7 the point intake decides inside / outside from the tehsil polygons (PK_BOX was undefined)');
ok(/renderEngStress\(\{byUser:engByUser\}\)/.test(M) && /function renderEngStress\(o\)\{\s*\n\s*const engByUser=/.test(M), 'U3 W19 the stress table receives the user flag');
ok(!/note\.textContent='No tehsil is above the/.test(M), 'U3 W20 the listener that re-scored every tehsil into an undefined note is removed');

/* U4 */
ok(!/COL\[Math\.max\(1,Math\.min\(4,g\.rank\|\|1\)\)\]/.test(S) && /g\.rank>=1\?COL\[Math\.min\(4,g\.rank\)\]/.test(S), 'U4 W16 a pulse chip without a class has no Low colour');
ok(/j\.autoSelect && j\.results && R\[0\] === j\.results\[0\]/.test(PS), 'U4 W21 the place search auto-selects the server\'s own first row only');
ok(!/\['Gilgit',35\.92,74\.31\]/.test(N) && /api\('\/api\/geo\/towns'/.test(N), 'U4 W22 the city labels are the server\'s place table (no typed city list)');

/* U5 */
ok(!/function secRight\(/.test(S) && !/soilMoistBasis/.test(M) && !/CONF_TIER_PCT/.test(M) && !/#blendBadge/.test(M) && !/\.v2832-est/.test(M), 'U5 dead code removed (secRight, soilMoistBasis, CONF_TIER_PCT, #blendBadge, .v2832-est)');
ok(!/\[\[26,32,1\],\[32,38,2\],\[38,46,3\],\[46,99,4\]\]/.test(M) && /function heatBands\(\)\{ var L=G\.AGN&&G\.AGN\.levelLegends/.test(M), 'U5 the UTCI chart bands read the thresholds register (no typed 26/32/38/46)');
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
