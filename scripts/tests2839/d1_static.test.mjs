// v91.17.283.9 · display build, static and unit checks (no browser). Each check FAILS on the v91.17.283.8 tree (T2839_TREE=<283.8 srv>).
//  S1 the fill factor by zoom (console agn-p2839-js fadeOf, start page hzFade): 1 to zoom 9, smooth to 0.25 at zoom 11, 0 from zoom 12;
//     both pages use the same numbers; the console wrapper scales the fill and draws thin outlines where the factor is 0
//  S2 the street map keeps its own colours at street zoom (streets-js hzOn) and the 250 m raster is not drawn over a hazard level
//  S3 the 250 m read-out has a reason: the server's refusal reason travels (natgrid.mjs -> index.mjs) and the page prints it
//  S4 the pin: the console pin is above every marker and joins the label fit; the start page pin is on top and says "Selected point"
//  S5 the laptop layout: the map block is one screen (100vh minus the info bar's offset), a snap point, the fit button, folding panels
//     remembered with try/catch; the header and tab row are not merged or resized (no rule changes their height)
//  S6 the terrain shading: the console layer's opacity rises at street zoom; the start page draws /tiles/hillshade above the street map
//  S7 the build stamp is 91.17.283.9 on both pages; the CSP covers the new blocks
import { createHash } from 'node:crypto';
import { src, ok, done, lift } from './lib.mjs';
const page = src('artefact/AI_GEO_NIGRAAN_v91_17_MACH.html'), start = src('artefact/NIGRAAN_START.html');
const blk = (t, id) => { const i = t.indexOf('id="' + id + '"'); if (i < 0) return ''; const tag = t.lastIndexOf('<script', i) > t.lastIndexOf('<style', i) ? '</script>' : '</style>'; const a = t.indexOf('>', i) + 1, b = t.indexOf(tag, a); return t.slice(a, b); };
const js = blk(page, 'agn-p2839-js'), css = blk(page, 'agn-p2839-css');
/* S1 */
let fadeOf = null, hzFade = null;
try { const f = lift(js, 'fadeOf'); const pre = 'var Z_FULL=9, Z_LIGHT=11, Z_NONE=12, LIGHT=0.25;'; ok(js.indexOf(pre) >= 0, 'S1 the console zoom constants (9 / 11 / 12, light 0.25)'); fadeOf = new Function(pre + f + '; return fadeOf;')(); } catch (e) { ok(false, 'S1 console fadeOf loads', e.message); }
try { hzFade = new Function(lift(start, 'hzFade') + '; return hzFade;')(); } catch (e) { ok(false, 'S1 start page hzFade loads', e.message); }
if (fadeOf) {
  const v = (z) => fadeOf(z);
  ok(v(5) === 1 && v(9) === 1, 'S1 full fill up to zoom 9', [v(5), v(9)].join(' '));
  ok(Math.abs(v(10) - 0.625) < 1e-9 && Math.abs(v(11) - 0.25) < 1e-9, 'S1 smooth fade to 0.25 by zoom 11 (smoothstep: 0.625 at zoom 10)', [v(10), v(11)].join(' '));
  ok(Math.abs(v(11.5) - 0.125) < 1e-9 && v(12) === 0 && v(15) === 0 && v(18) === 0, 'S1 no fill from zoom 12', [v(11.5), v(12), v(15)].join(' '));
  let mono = true; for (let z = 4; z <= 13; z += 0.05) if (v(z + 0.05) > v(z) + 1e-12) mono = false; ok(mono, 'S1 the factor never rises with zoom');
  if (hzFade) { let same = true, worst = 0; for (let z = 5; z <= 14; z += 0.1) { const d = Math.abs(hzFade(z) - fadeOf(z)); worst = Math.max(worst, d); if (d > 0.0011) same = false; } ok(same, 'S1 the start page uses the same factor (max difference ' + worst.toFixed(4) + ', rounding only)'); }
}
try { const so = lift(js, 'styleOf'); const mk = new Function('V', 'zNow', so + '; return styleOf;');
  const S0 = mk({ fade: 0, uid: 'A' }, () => 13), S5 = mk({ fade: 0.5, uid: 'A' }, () => 10), S1 = mk({ fade: 1, uid: 'A' }, () => 6);
  const base = { fillColor: '#ffe680', fillOpacity: 0.9, color: '#ffffff', weight: 0.7, opacity: 1 };
  const a = S0({ properties: { uid: 'B' } }, base), b = S0({ properties: { uid: 'A' } }, base), c = S5({ properties: { uid: 'B' } }, base), d = S1({ properties: { uid: 'B' } }, base);
  ok(a.fillOpacity === 0 && a.weight < 1 && (a.color === '#0C3851' || a.color === '#154A4E'), 'S1 street zoom: no fill, a thin navy outline', JSON.stringify(a));
  ok(b.fillOpacity === 0 && b.weight > a.weight && b.opacity > a.opacity, 'S1 street zoom: the selected tehsil has the stronger outline', JSON.stringify(b));
  ok(Math.abs(c.fillOpacity - 0.45) < 1e-9, 'S1 fading: the fill opacity is scaled by the factor (0.9 x 0.5)', c.fillOpacity);
  ok(d === base, 'S1 full fill: the style is left as the issued-run wrapper made it', JSON.stringify(d)); } catch (e) { ok(false, 'S1 styleOf', e.message); }
ok(/st\.__v283\) return false;/.test(js) && /g\.__p2839=true/.test(js), 'S1 the console wrapper sits after the issued-run wrapper (it scales the opacity that one sets)');
/* S2 */
ok(page.indexOf("return c.contains('agn-hz-on')&&!c.contains('agn-p2839-street');") >= 0, 'S2 the street map keeps its own colours at street zoom');
ok(page.indexOf("function rasterOK(){ if(D.documentElement.classList.contains('agn-hz-on')) return false;") >= 0, 'S2 no 250 m raster over a hazard level (the read-out stays)');
/* S3 */
const ng = src('server/api/natgrid.mjs'), ix = src('server/api/index.mjs');
ok(/e\.reason = b && \/budget\/\.test/.test(ng) && /e\.why = /.test(ng), 'S3 natgrid keeps the refusal reason of a provider call');
ok(/grid_failed', message: err\.message, reason: err\.reason \|\| null, why: err\.why \|\| null/.test(ix), 'S3 the grid answer carries reason and why');
ok(page.indexOf("function whyOf(e,st){") >= 0 && page.indexOf("if(v&&v.why) return '<span class=\"h\">No 250 m value here</span><div class=\"w\">'") >= 0, 'S3 the read-out prints the reason under "No 250 m value here"');
ok(/resets at 05:00 PKT/.test(page) && /background tier P6/.test(page), 'S3 the budget reason names the rule (P6) and when it returns (05:00 PKT = 00 UTC, the budget day)');
/* S4 */
ok(/zIndexOffset:20000/.test(js) && /pn\.style\.zIndex=645/.test(js) && /class="agn-pt-lab agn-p2839-lab"/.test(js) && /AGN\.v2832Labels\.fit/.test(js) && page.indexOf(".leaflet-agnP2839-pane .agn-pt-lab'),function(e){") >= 0, 'S4 console pin: its own pane above the markers and the office badges (645), its labels join the v283.2 label fit');
ok(/interactive:false/.test(js) && /#map\.agn-p2839-has \.agn-pt-marker \.agn-pt-lab\{display:none!important\}/.test(css), 'S4 one marker: the pin lets clicks through; the exact-point label is left to the pin (its draggable dot stays)');
ok(/zIndexOffset:20000/.test(start) && /p\.name\|\|'Selected point'/.test(start), 'S4 start page pin: on top, "Selected point" until the name arrives');
/* S5 */
ok(/height:calc\(100vh - var\(--p2839-off,46px\) - 2px\)!important/.test(css), 'S5 the map panel is one screen minus the info bar offset');
ok(/scroll-snap-type:y proximity/.test(css) && /scroll-snap-align:start/.test(css), 'S5 the info bar is a (proximity) snap point');
ok(/id='agnP2839Fit'|b\.id='agnP2839Fit'/.test(js), 'S5 the fit button');
ok(/G\.localStorage\.getItem\(KEY\)/.test(js) && /try\{ G\.localStorage\.setItem\(KEY/.test(js), 'S5 the folds are remembered in this browser, inside try/catch');
ok(!/header\.topbar[^{]*\{[^}]*(height|padding-top|padding-bottom|font-size)/.test(css) && !/#machNav[^{]*\{[^}]*(height|padding)/.test(css), 'S5 no rule resizes the header or the tab row (owner: keep them)');
/* S6 */
ok(/var op=z>=Z_NONE\?0\.45:z>=Z_LIGHT\?0\.38:0\.32;/.test(js), 'S6 console terrain shading: 0.32, 0.38 from zoom 11, 0.45 from zoom 12');
ok(/createPane\('agnHill30'\)\.style\.zIndex=240/.test(start) && /'\/tiles\/hillshade\/'\+z/.test(start) && /if\(z>12\)\{ k=Math\.pow\(2,z-12\)/.test(start), 'S6 start page: the 30 m shading above the street tiles (pane 240 > 200), enlarged past zoom 12');
/* S7 */
/* v91.17.283.10 integration: the stamp follows the release (package.json), 91.17.283.9 or later */
{ const V = JSON.parse(src('package.json')).version; const esc = V.replace(/\./g, '\\.');
  ok(/^91\.17\.283\.(9|[1-9]\d)$/.test(V) && new RegExp("G\\.AGN_BUILD\\.patch='" + esc + "'").test(page) && new RegExp('content="' + esc + '" name="agn-version"').test(start), 'S7 build stamp ' + V + ' (package.json) on both pages'); }
const csp = (/http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i.exec(page) || /content="([^"]+)"[^>]*http-equiv="Content-Security-Policy"/i.exec(page) || [])[1] || '';
const h = (t) => "'sha256-" + createHash('sha256').update(t, 'utf8').digest('base64') + "'";
ok(js && css && csp.indexOf(h(js)) >= 0 && csp.indexOf(h(css)) >= 0, 'S7 the CSP holds the hashes of the new script and style');
done('D1-STATIC-2839');
