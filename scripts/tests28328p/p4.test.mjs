/* v91.17.283.28 · P4 · the asset evidence profile lists what the server holds (the place facts of GET /api/point and GET /api/sources) as
   available, a field not held with the server's reason, and nothing "planned". usage: node scripts/tests28328p/p4.test.mjs [base] */
import { T, src, MACH, browser, open, consoleReady, place, tab } from './lib.mjs';
const { ok, done } = T(); const S = src(MACH);
ok(!/planned HydroSHEDS|planned JRC|planned WorldCover|planned OSM dependency/.test(S), 'P4 static: no "planned" enrichment row in the profile code');
ok(/\{id:'worldcover',provider:'ESA WorldCover',role:'landcover',status:'integrated'/.test(S) && /status:'integrated',use:'catchment, river reach/.test(S) && /\{id:'jrc_water',provider:'JRC Global Surface Water',role:'historical water',status:'integrated'/.test(S), 'P4 static: land cover, HydroRIVERS and JRC water are integrated (held by the server)');
ok(!/function spatial\(\)\{/.test(S), 'P4 static: the sweep that hid "planned" rows is deleted (nothing to hide)');
const br = await browser(); const o = await open(br, '/analyst'); await consoleReady(o.pg, true); await place(o.pg); await tab(o.pg, 'assessments', 6000);
const r = await o.pg.evaluate(() => [...document.querySelectorAll('#agnAssetEvidenceProfileBody .agn-v9116-oef > span')].map((s) => s.textContent));
ok(r.length >= 6 && !r.some((t) => /\bplanned\b|\bpartial\b/i.test(t)), 'P4 page: ' + r.length + ' rows, none planned or partial', JSON.stringify(r));
ok(r.some((t) => /^Land cover\s*available/.test(t)) && r.some((t) => /^Historical water.*available/.test(t)) && r.some((t) => /^Catchment \/ river reach\s*available/.test(t)), 'P4 page: land cover, historical water and the river reach are listed as available sources', JSON.stringify(r));
ok(r.some((t) => /^Population.*available/.test(t)) && r.some((t) => /^Buildings.*available/.test(t)), 'P4 page: population and buildings come from the server\'s sources page', JSON.stringify(r));
ok(o.errs.length === 0, 'P4 no page error', o.errs.join(' | ')); await br.close(); done();
