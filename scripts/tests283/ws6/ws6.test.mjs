/* v91.17.283 · WS6 · static checks of the three pages (no server): node scripts/tests283/ws6/ws6.test.mjs [tree]
   Every check fails on the v91.17.282.1 base and passes on this tree. Browser checks (screenshots, scenarios) are in WS6/work/scen.py;
   the engine identity in identity_ws6.mjs. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const ROOT = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const A = (f) => readFileSync(join(ROOT, 'artefact', f), 'utf8');
const C = A('AI_GEO_NIGRAAN_v91_17_MACH.html'), S = A('NIGRAAN_START.html'), N = A('NIGRAAN_3.html'), M = JSON.parse(A('MANIFEST.json'));
let pass = 0, fail = 0; const t = (id, ok, what) => { if (ok) pass++; else { fail++; console.log('FAIL ' + id + ' · ' + what); } };
const blk = (h, id) => { const m = new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>').exec(h); return m ? m[1] : ''; };
const V = blk(C, 'agn-v283-js');
t('W1', /box\.id='agnView283'/.test(V) && /data-v="pk"[^>]*>Pakistan/.test(V) && /data-v="prov"/.test(V) && /data-v="teh"/.test(V) && /#geoLevelTab\{display:none!important\}/.test(C), '1 one view control Pakistan / Province / Tehsil, the old switch hidden');
t('W2', /\/n3\/rivers\.json/.test(V) && /createPane\('v283River'\)/.test(V) && /lineDashOffset=-t/.test(V), '2 flowing OSM rivers on the console map');
t('W3', /--agn242-top/.test(V) && /fitTick/.test(V), '3 the Overview main block measured to fill the screen');
t('W4', /#hero\{position:absolute;left:16px;top:114px;width:min\(384px/.test(S) && /search, or click the map/.test(S), '4 compact search card (v91.17.283.1: a top-left floating panel, owner)');
t('W5', /ZMIN=12/.test(C) && /rasterOK:rasterOK, hour:function\(\)\{ return hour; \} \};/.test(C) && /minor_road/.test(V) && /createPane\('v283Vals'\)/.test(V), '5 250 m values and every road on the street map');
t('W6', !/return;\s*\n\s*\n\s*var _meas=null;/.test(C) && !/var _meas=null;/.test(C), '6 unreachable urban-heat block removed');
t('W7', !/<[a-z]+[^>]*\bdata-(view|goto)="(financial|sustainability|executive)"/.test(C) && /Monte Carlo: 10,000 random draws/.test(C), '7 no Financial / ESG surface; Monte Carlo in one clear line');
t('W8a', /OWNER_A=\{heat:\{3:1,4:1\}, cold:\{1:1,2:1,3:1,4:1\}\}/.test(V) && /OWNER_A=\{heat:\{3:1,4:1\}, cold:\{1:1,2:1,3:1,4:1\}\}/.test(S), '8 heat High / Severe and cold Indicative on both pages (gate per-level rule first)');
t('W8b', (/option\[value="flood_pluvial"\]/.test(V) || /var H=\(clientRules\(\)\|\|\{\}\)\.hidden_layers\|\|\{flood_pluvial:1\}/.test(V)) &&   /* v91.17.283.10: pickTick hides every client-hidden layer */
  !/'flood_pluvial','Flash and urban flooding'/.test(N), '8 local-rain flood not offered on client screens');
t('W8c', /gTested\(gateE\(G,h\[0\]\)\)/.test(N) && /GOWNER=\{utci:\{Moderate:'t',High:'i',Severe:'i'\}/.test(N), '8 Customize "tested" labels per level');
t('W8d', !/\bPMD\b|\bFFD\b/.test(S), '8 no PMD / FFD on the start page (out-of-sample lines inlined without the source names)');
t('W8e', /engine=1\(&\|\$\)/.test(V), '8 the display module is inert in engine mode');
t('D1', /function runStyle/.test(V) && /\/api\/levels\?layer=/.test(V) && /panelFromRun/.test(V), 'D1 issued run on the map and the panel when current');
t('D2', /if\(busy&&busy===key\) return; busy=key;/.test(C) && /if\(lastKey!==key\) return;/.test(C), 'D2 / D8 nearby list never shows an older place');
t('D3', /fillOpacity:0,color:'rgba\((?:12,56,81|21,74,78),\.30\)'/.test(V) && /Forecast updated /.test(V), 'D3 no colours when the levels do not load; the freshness line names what was updated');
t('D4', /assessed no area: no level was issued/.test(S) && /if\(asd\) o\.push\('<div class="ns'\+\(hc\.glof\|\|hc\.drought\?' ns2':''\)\+'" id="nsHigh"/.test(S), 'D4 a current run with no assessed area');
t('D5', /Levels did not load/.test(V) && /data-v283-retry/.test(V), 'D5 levels time out after 30 s with Retry');
t('D15', /body\.v-card:not\(\.v-tuck\) \.leaflet-bottom\.leaflet-right\{right:min\(var\(--dw\),100vw\)\}/.test(S), 'D15 credits beside the drawer');
t('D16', /function claimOk/.test(S) && /claimed:nm, src:'link'/.test(S), 'D16 a shared link name is a claim');
t('D20', /history\.pushState\(\{agn:1/.test(S) && /addEventListener\('popstate'/.test(S), 'D20 Back / Forward');
t('D21', /fetch\('\/health'/.test(S), 'D21 failed sections come back when the server answers');
t('D22', /id','agnDots'/.test(S) && /#lvBar\{display:none!important\}/.test(S), 'D22 one legend, does-not-occur dotted');
t('D27', /No place is named exactly/.test(S), 'D27 no automatic pick without an exact name');
t('D29', /e\.key!=='Escape'/.test(S), 'D29 Escape');
t('D31', /function clean\(n\)/.test(S), 'D31 stray quotes');
t('R3', /regatedBy:'page'/.test(C) && /G\.agnBandOf\(\+top\.index\)/.test(C), 'WS2 R3 gateRows rebuilds band / severity / class rank');
/* sealed and listed */
const csp = /<meta content="([^"]*)" http-equiv="Content-Security-Policy"\/>/.exec(C)[1], h = (x) => "'sha256-" + createHash('sha256').update(x, 'utf8').digest('base64') + "'";
const inl = [...C.matchAll(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/g)].filter(m => !(m[1] === 'script' && /\bsrc\s*=/.test(m[2])));
t('SEAL', inl.every(m => csp.includes(h(m[3]))), 'console CSP holds every inline block');
for (const f of ['AI_GEO_NIGRAAN_v91_17_MACH.html', 'NIGRAAN_START.html', 'NIGRAAN_3.html']) { const b = readFileSync(join(ROOT, 'artefact', f)); t('MAN ' + f, M[f] && M[f].sha256 === createHash('sha256').update(b).digest('hex') && M[f].bytes === b.length, 'MANIFEST entry matches'); }
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
