// v91.17.283.6 item 2 · the C12 decision (data/urban-heat-c12.json) reaches the operator-only "Urban heat" panel and every page-side use of
// the provisional LCZ microclimate profiles, server and page:
//  P1 GET /api/urban/status carries c12 {applied, reason, rule, releaseWhen} from the file
//  P2 the operator interface (work.mjs urbanHeat.posture / profiles / estimate / compare) answers "not assessed (no tested skill)" with the
//     reason and NO number while C12 is applied; released (no c12), the handlers answer as before
//  P3 the page module (science module 021 = page script 35, run in a VM): AGN.urbanHeat.c12() is withheld with the file's reason (embedded at
//     build time), localizeStation() computes nothing, the local comparison is not assessed, the panel shows "Not assessed (no tested skill)",
//     the decision's reason, rule and release condition and the operator note, and no profile estimate
//  P4 the "Urban heat signal" cell (module 098 uhiText) says "Not assessed" for a withheld answer (it read NaN before) and the profile path
//     (module 028) and the station brief say "not assessed (no tested skill)"
// usage: node scripts/tests2836/c12panel.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + String(d).slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + String(d).slice(0, 600) : '')); } };
const D = join(APP, 'data'); const C12 = JSON.parse(readFileSync(join(D, 'urban-heat-c12.json'), 'utf8'));
const { createUrbanHeat } = await import(pathToFileURL(join(APP, 'server/api/urbanheat.mjs')).href);
const U = createUrbanHeat(null, D); const st = U.status();
ok(st.c12 && st.c12.applied === true && st.c12.reason === C12.reason && st.c12.rule === C12.rule && st.c12.releaseWhen === C12.releaseWhen, 'P1 /api/urban/status carries the C12 decision', JSON.stringify(st.c12).slice(0, 200));
const { createWork } = await import(pathToFileURL(join(APP, 'server/api/work.mjs')).href);
const W = createWork({ urbanHeat: U }).handlers; const body = { name: 'G-9', latitude: 33.68, longitude: 73.03, regional_air_temperature_c: 38, relative_humidity_pct: 45, wind_kmh: 8, solar_wm2: 700 };
const po = (await W['urbanHeat.posture']()).data, pr = await W['urbanHeat.profiles'](), es = (await W['urbanHeat.estimate'](null, { body })).data, cp = (await W['urbanHeat.compare'](null, { body: { ...body, points: [{ latitude: 33.7, longitude: 73 }, { latitude: 33.72, longitude: 73.07 }] } })).data;
const noNum = (o) => !/localAirTemperatureC|adjustmentC|offsetC|heatIndexC|localTemperatureRangeC/.test(JSON.stringify(o));
ok(po.c12 && po.c12.status === 'not assessed (no tested skill)' && po.c12.why === C12.reason && po.profilesStatus === 'not assessed (no tested skill)' && po.operational === false, 'P2a posture carries the decision (operator text)');
ok(Array.isArray(pr.data) && pr.data.length === 0 && pr.meta.why === C12.reason && es.assessed === false && es.why === C12.reason && cp.assessed === false && [pr, es, cp].every(noNum), 'P2b profiles / estimate / compare: not assessed with the reason, no number');
const W0 = createWork({ urbanHeat: createUrbanHeat(null, D, { nationalWithheld: false }) }).handlers; const e0 = (await W0['urbanHeat.estimate'](null, { body })).data;
ok(e0 && e0.microclimate && Number.isFinite(e0.microclimate.localAirTemperatureC), 'P2c released (applied false): the handlers answer as before');
const MOD = join(APP, 'server', 'science', 'modules'); const f = (re) => readFileSync(join(MOD, readdirSync(MOD).find((x) => re.test(x))), 'utf8');
const m021 = f(/^021-page-script-35\.js$/), m028 = f(/^028-page-script-51\.js$/), m098 = f(/^098-agn-levels-js\.js$/);
const els = {}; const mkEl = (id) => { const e = { id, style: {}, children: [], className: '', textContent: '', _html: '', classList: { add() {}, remove() {} }, setAttribute() {}, appendChild(c) { this.children.push(c); if (c.id) els[c.id] = c; return c; }, addEventListener() {}, remove() {}, querySelector: (s) => { if (s === '.agn-urban-heat-close') return mkEl('x'); if (s.startsWith('#')) return els[s.slice(1)] || null; return null; }, querySelectorAll: (s) => s === '[data-uh]' ? (e._html.match(/data-uh="(\w+)"/g) || []).map((m) => ({ dataset: { uh: m.slice(9, -1) } })) : [] };
  Object.defineProperty(e, 'innerHTML', { get() { return e._html; }, set(v) { e._html = v; const m = /id="(agnUrbanHeatStatus)"/.exec(v); if (m) els[m[1]] = mkEl(m[1]); } }); return e; };
const doc = { body: mkEl('body'), head: mkEl('head'), getElementById: (id) => els[id] || null, createElement: () => mkEl(''), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, readyState: 'complete' };
doc.body.appendChild = function (c) { if (c.id) els[c.id] = c; return c; };
const G = { document: doc, AGN: {}, STATIONS: [{ id: 's1', name: 'Islamabad', lat: 33.68, lon: 73.04, t: 31, hum: 40, wind: 8 }], selectedId: 's1', location: { protocol: 'file:', origin: 'null' }, setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {}, console, fetch: () => Promise.reject(new Error('offline')), MutationObserver: function () { this.observe = () => {}; } };
G.window = G; G.globalThis = G; G.self = G; const ctx = vm.createContext(G);
let err = null; try { vm.runInContext(m021, ctx, { timeout: 10000 }); } catch (e) { err = e; }
const UH = G.AGN.urbanHeat;
ok(UH && typeof UH.c12 === 'function' && UH.c12().withheld === true && UH.c12().why === C12.reason && UH.c12().rule === C12.rule, 'P3a the page module holds the C12 decision from the file (build time)', err ? String(err).slice(0, 200) : '');
ok(UH && UH.localizeStation(G.STATIONS[0]) === null && G.STATIONS[0].localAirTemperatureC === undefined, 'P3b localizeStation computes no provisional estimate');
const dg = UH && UH.diagnostics().comparison; ok(dg && dg.assessed === false && dg.status === 'not assessed (no tested skill)' && dg.why === C12.reason && noNum(dg), 'P3c the local comparison is not assessed, no number', JSON.stringify(dg).slice(0, 200));
let back = null; try { UH.open(); back = els.agnUrbanHeatBack; } catch (e) { err = e; }
const html = back ? back.innerHTML : ''; const r1 = C12.reason.replace(/^not assessed:\s*/i, '').replace(/^./, (c) => c.toUpperCase());
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
ok(/<b>Not assessed \(no tested skill\)\.<\/b>/.test(html) && html.includes(esc(r1)) && html.includes(esc(C12.rule)) && html.includes(esc(C12.releaseWhen)) && /Operator note/.test(html) && /NOT ASSESSED/.test(html), 'P3d the panel: not assessed, reason, rule, release condition, operator note', err ? String(err) : html.slice(0, 160));
ok(!/data-uh="(local|profiles|estimate|compare)"/.test(html) && !/provisional demonstrations/.test(html), 'P3e the panel offers no local comparison / profile / estimate action and no provisional text');
const uhiText = new Function('return ' + /function uhiText\(u\)\{[\s\S]*?\n  \}/.exec(m098)[0])();
const t = uhiText({ withheld: true, why: C12.reason }); ok(t.sig === 'Not assessed' && t.note.startsWith('No tested skill: ') && !/NaN/.test(JSON.stringify(t)), 'P4a urban heat signal cell: a withheld answer reads "Not assessed" (no NaN)', JSON.stringify(t).slice(0, 160));
ok(/AGN\.urbanHeat\.c12\(\)\.withheld\)\)\{ set\('uhiSignal','Not assessed'\)/.test(m028) && /return 'not assessed \(no tested skill\)';/.test(m028), 'P4b the profile path and the station brief say not assessed under C12');
console.log(`\nc12panel ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
