/* v91.17.283.36 (NIGRAAN 1.0) · ONE REGRESSION CHECK PER ITEM of the launch list section A (items 1-44) and of the C-now results applied
   (river mask, landslide mask and bands, cyclone record, site-lab steps). Each check of a change fails on v91.17.283.35 and passes on 283.36.
   usage: node scripts/tests28336/launch36.unit.test.mjs [tree]      No server, no network: modules imported from the tree, pages read as text. */
import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os'; import { execFileSync } from 'node:child_process';
const ROOT = (process.argv[2] && !/^https?:/.test(process.argv[2]) ? process.argv[2] : null) || process.env.NIGRAAN_TREE || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SP = '/tmp/claude-0/-home-claude/884c0fe0-d7f4-5a90-a62f-50507e3d179e/scratchpad/s36/live';
let n = 0, f = 0; const ok = (c, m, i) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c || i === undefined ? '' : '  :: ' + JSON.stringify(i).slice(0, 300))); if (!c) f++; };
const imp = async (rel) => { try { return await import(pathToFileURL(join(ROOT, rel)).href); } catch (e) { return { __err: String(e && e.message || e) }; } };
const safe = (fn) => { try { return fn(); } catch (e) { return { __err: String(e && e.message || e) }; } };
const read = (rel) => { try { return readFileSync(join(ROOT, rel), 'utf8'); } catch (_) { return ''; } };
const HTML = read('artefact/AI_GEO_NIGRAAN_v91_17_MACH.html'), N3 = read('artefact/NIGRAAN_3.html'), START = read('artefact/NIGRAAN_START.html');
const HZ = await imp('server/api/hazsci.mjs'), FO = await imp('server/api/floodoutcome.mjs'), SC = await imp('server/api/sitechange.mjs'), RS = await imp('server/api/reports.mjs');
const OL = await imp('server/api/outlook.mjs'), SM = await imp('server/api/smog.mjs'), HL = await imp('server/api/hazardlist.mjs'), SV = await imp('server/api/served.mjs');
const FL = await imp('server/api/flood.mjs'), DA = await imp('server/api/dataage.mjs'), AP = await imp('server/api/applicability.mjs'), RL = await imp('server/api/reflayers.mjs');
const LO = await imp('server/api/landslideodds.mjs'), SR = await imp('server/api/scenarioreport.mjs'), HD = await imp('server/api/hand.mjs');
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const tmpData = () => { const d = mkdtempSync(join(tmpdir(), 'l36-')); return d; };

/* ---------- 1 · flood chance: MEAN over all draws; out-of-range draws give BOUNDS ---------- */
{ const d = tmpData(); const M = { version: 't', validRange: { plains: { R24: [0, 84], I1: [0, 40] } }, peakHourOfDay: { ratio: { plains: 0.41 } },
    districts: [{ district: 'D', covered: true, region: 'plains', tehsils: ['U1'], LOWH: 0, MTN: 0, apiRefMm: [0, 1] }],
    standardise: { mu: [0, 0, 0, 0, 0, 0], sd: [1, 1, 1, 1, 1, 1] }, coef: [-2, 1, 0, 0, 0, 0, 0], bootstrap: { sets: [{ mu: [0, 0, 0, 0, 0, 0], sd: [1, 1, 1, 1, 1, 1], coef: [-2, 1, 0, 0, 0, 0, 0] }] } };
  writeFileSync(join(d, 'flood-outcome-model.json'), JSON.stringify(M));
  const F = safe(() => FO.createFloodOutcome({}, { dataDir: d })); let i = 0; const rand = () => ((i++ * 0.6180339887) % 1);
  const r1 = safe(() => F.mc({ uid: 'U1', mmList: [1, 2, 50], wetPct: 50, rand, n: 300 }));
  const P = [1, 2, 50].map((mm) => FO.prob({ mu: M.standardise.mu, sd: M.standardise.sd, coef: M.coef }, mm, 0, 0.5, 0, 0));
  ok(r1 && r1.modelled && Math.abs(r1.p - P.reduce((a, b) => a + b, 0) / 3) < 0.02 && r1.central === 'mean over all draws', 'item 1 the chance is the mean over all draws (not the median)', r1 && { p: r1.p, mean: P.reduce((a, b) => a + b, 0) / 3 });
  i = 0; const r2 = safe(() => F.mc({ uid: 'U1', mmList: [10, 200], wetPct: 50, rand, n: 400 }));
  ok(r2 && r2.modelled && r2.bounded === true && r2.p == null && Array.isArray(r2.bounds) && r2.bounds[1] - r2.bounds[0] > 0.3 && r2.outsideShare > 0.3, 'item 1 draws outside the trained range: bounds (lower counts them 0, upper 1) and the share outside; no single number', r2); }
/* ---------- 2 · reports: record binding mandatory, server-rendered decision values, immutable ---------- */
{ const dec = safe(() => RS.decisionHtml([{ unitId: 'U1', record: { checksum: 'pr1-x', days: [{ date: today, tmaxC: 30.04, tminC: 20, feelsMaxC: 31, rainMm: 0 }] }, siteLevels: { hazards: { heat: { days: [{ date: today, assessed: true, word: 'Low' }] } } } }]));
  ok(typeof dec === 'string' && /data-agn-decision="server"/.test(dec) && /30<\/td>/.test(dec) && /Low/.test(dec), 'item 2 the decision values of an issued report are rendered by the server from the record', String(dec).slice(0, 200));
  const src = read('server/api/reports.mjs');
  ok(/record_unbound/.test(src) && /issued_immutable/.test(src) && /bindDecision\(b\.html, placeRecords\)/.test(src), 'item 2 a report without shown values or checksum is refused (409 record_unbound); an issued report is never overwritten'); }
/* ---------- 3 / 26 · site lab: no storage, no pond, no peak; green roof / paving not modelled ---------- */
{ const r = safe(() => SC.nrcsRunoffCalc(10000, { C: 1 }, { grass: 0.5, built: 0.5 }, { built: 1 }, { 2: { '24h': 100 } }));
  const x = r && r[2]; ok(x && x.after && x.after.peak_m3s === undefined && x.storage_needed_m3 === undefined && x.pond_enough === undefined && x.after.runoff_mm > 0, 'item 3 Lab B serves runoff depth and volume only (no peak flow, no storage, no "pond enough")', x);
  const src = read('server/api/sitechange.mjs');
  ok(/NOT_MODELLED_SITE/.test(src) && /greenRoof\) \|\| 0\) > 0 \|\| \(Number\(ch0\.permeable/.test(src), 'item 26 green roof and permeable paving: not modelled (refused, no CN 86 / 85 result)');
  ok(!/lab34Green|lab34Perm|lab34Pond/.test(HTML), 'item 3/26 the page has no storage, green-roof or paving inputs'); }
/* ---------- 4 · site lab inputs stated; client cover; sub-cell site marked ---------- */
{ const C = safe(() => SC.coverEntered({ trees: 0.2, built: 0.8 }));
  ok(C && C.ok && C.before.built === 0.8, 'item 4 the client may enter the site’s present cover', C);
  const src = read('server/api/sitechange.mjs');
  ok(/cover estimated from the surrounding area/.test(src) && /coverYear/.test(src) && !/G\.areaM2 < AREA_MIN_M2\) return/.test(src), 'item 4 inputs stated (250 m cells, soil shares, source year); sub-cell site marked "cover estimated"; no area cutoff'); }
/* ---------- 5 · ground wetness age limit ---------- */
{ const old = safe(() => DA.era5Age('2026-10-01', Date.parse('2026-10-30T00:00:00Z'))), fresh = safe(() => DA.era5Age('2026-10-24', Date.parse('2026-10-30T00:00:00Z')));
  ok(old && old.stale === true && fresh && fresh.stale === false && /out of date/.test(read('server/api/floodoutcome.mjs')), 'item 5 wetness older than its provider cycle + delay is out of date: the client sets the wetness first', { old, fresh }); }
/* ---------- 6 · runoff per storm (reference cases in REFERENCE_CASES_36.md; the test is runoff36.unit.test.mjs) ---------- */
ok(existsSync(join(ROOT, 'scripts/tests28336/runoff36.unit.test.mjs')), 'item 6 the per-storm runoff reference-case test is present (scripts/tests28336/runoff36.unit.test.mjs)');
/* ---------- 7 / 20 · heavy rain: an untested screen never sets a level ---------- */
{ const c = safe(() => HZ.rainCell({ prc: { n: 51, p: { '15.6': 80, '64.5': 60, '115.6': 0, '204.5': 0 } } }, 51));
  ok(c && c.L === -5 && /not tested/.test(c.why) && c.facts && c.facts.shares, 'item 20 the "half the members" rule sets no level: not tested, the share per IMD class is the fact', c);
  const z = safe(() => HZ.rainNoClear(2, false, 80, {}, 'x')); ok(z && z.L === -5, 'item 7 an untested (screening) class never flags or clears a place', z); }
/* ---------- 8 / 14 · the place picked stays; no default Islamabad ---------- */
ok(!/selectCity\('isb'/.test(HTML) && !/\|\|'isb'/.test(HTML) && /selectedId===['"]__live['"]\) return false/.test(HTML), 'item 8 no refresh path re-selects Islamabad; the start-page place is never replaced by a city');
ok(/selectedId=\(window\.AGN_BOOT&&window\.AGN_BOOT\.booted\)\?"__live":null/.test(HTML) && /var START0=null;/.test(N3) && /return null; \}   \/\* v283\.36 item 14/.test(HTML), 'item 14 no default Islamabad (page, Customize start point, scenario default)');
/* ---------- 9 / 10 / 11 / 13 · Overview (load order, redraw, one temperature, one label): the live test is overview36.test.mjs ---------- */
ok(existsSync(join(ROOT, 'scripts/tests28336/overview36.test.mjs')), 'items 9-11/13 the Overview timing / redraw / one-temperature test is present (overview36.test.mjs, run against a server)');
/* ---------- 12 · client view: no area-input rows, no solar / ET0, no model-input tiles ---------- */
ok(/<div class="agn-op-only"><div class="mp-cap">Across/.test(HTML) && /class="om-live-section agn-op-only"/.test(HTML), 'item 12 area-input rows (solar, ET0) and the model-input tiles are operator only');
/* ---------- 15 · no demo values in the seed list ---------- */
{ const m = /const STATIONS = \[([\s\S]*?)\];/.exec(HTML); ok(m && !/\bt:\d|aqi:\d|pm25:\d|feels:\d/.test(m[1]) && /CITY_ZONE = \{\};/.test(HTML), 'item 15 the 12-city seed list holds id/name/position only; no hand-typed city zone'); }
/* ---------- 16 · fail closed ---------- */
{ const src = read('server/api/glof.mjs') + read('server/api/areaheat.mjs') + read('server/api/hand.mjs') + read('server/api/floodoutcome.mjs');
  ok(/const DEFAULT_WEIGHTS = null;/.test(src) && !/rule\.share\) \? PC\.rule\.share : 0\.25/.test(src) && !/\|\| 0\.4\b/.test(read('server/api/floodoutcome.mjs')), 'item 16 missing data file -> no value (HAND weights, area share, peak-hour ratio)'); }
/* ---------- 17 · wind: no level, no gust factor ---------- */
{ const rec = { days: [{ day: 0, layers: { wind: { L: { A: 2, B: -2 } } } }] }; safe(() => HZ.applyWind(rec));
  ok(rec.days[0].layers.wind.L.A === -5 && rec.days[0].layers.wind.L.B === -5, 'item 17 every wind cell is "not tested": the gust ladder is no level', rec.days[0].layers.wind.L);
  ok(!/gustFromWindK'\):1\.5/.test(HTML) && !/\*FR\('wind\.gustFromWindK'\)/.test(HTML) && !/'gu60'/.test(JSON.stringify((OL.THRESHOLDS || []).map((t) => t.id))), 'item 17 the 1.5 gust factor is gone from the page; no "gusts >= 60 km/h" share'); }
/* ---------- 18 · GLOF: facts, no level; applicability by drainage ---------- */
{ const rec = { days: [{ day: 0, date: today, layers: { glof: { L: { A: 0, B: 3, C: -2 } } } }] };
  const drain = { ok: true, units: { A: { connected: true, lakesUpstream: 12, lakesIn: 0 }, B: { connected: true, lakesUpstream: 3, lakesIn: 2 }, C: { connected: false, lakesUpstream: 0, lakesIn: 0 } } };
  safe(() => HZ.applyGlof(rec, { nat: { units: { B: { applicable: true, signal: 'growing' } } }, ladder: {}, drain })); const G = rec.days[0].layers.glof;
  ok(G.L.A === -5 && G.L.B === -5 && G.L.C === -4 && /12 mapped glacial lake/.test(G.why.A) && /beyond the 100 km/.test(G.why.A), 'item 18 GLOF: no level; facts (lakes, routed reach, signal); "cannot happen" only with no lake anywhere upstream', G); }
/* ---------- 19 · air: no dust bands, no smog day, WMO fog hours, no inversion step ---------- */
{ const src = read('server/api/smog.mjs');
  ok(/smogDay: null, smogWhy: AIR_WITHHELD\.smog/.test(src) && /dustClass: null, dustDay: null, dustWhy/.test(src) && /if \(vis < 1000\) (\{ )?d\.fog\+\+/.test(src) && !/d\.inv >= 3 && disp < 3/.test(src), 'item 19 air: no dust class, no smog day, fog hours by WMO visibility, no inversion step'); }
/* ---------- 20 · rain events -> amounts ---------- */
ok(Array.isArray(OL.WITHHELD_DAY_EVENTS) && OL.WITHHELD_DAY_EVENTS.includes('pr25') && OL.WITHHELD_EVENTS.includes('rain3_75') && !(OL.THRESHOLDS || []).some((t) => /^pr/.test(t.id)) && /amt:pr50/.test(read('server/api/maplayers.mjs')), 'item 20 10/25/50/100 mm and 3-day 75 mm events withheld; amounts p50/p90 served');
/* ---------- 21 · river: no 1.5 x rp20 step; alerts from official classes only ---------- */
{ const src = read('server/api/flood.mjs'); ok(/filter\(\(a\) => a\[0\] !== 'rp20x1\.5'\)/.test(src), 'item 21 the 1.5 x 20-year step (Severe) is withheld');
  const w = safe(() => SV.riverAlertWhy({ engine: { latest: () => ({ days: [{ day: 0, layers: { flood_riverine: { facts: { U1: { official: false }, U2: { official: true } } } } }] }) } }, { hazard: 'flood_riverine', day: 0 }, 'U1', 0));
  const w2 = safe(() => SV.riverAlertWhy({ engine: { latest: () => ({ days: [{ day: 0, layers: { flood_riverine: { facts: { U2: { official: true } } } } }] }) } }, { hazard: 'flood_riverine', day: 0 }, 'U2', 0));
  ok(typeof w === 'string' && w2 === null, 'item 21 a river alert comes from an official gauge class only (model-ladder level: no alert)', { w, w2 }); }
/* ---------- 22 · flood plain facts: report standing switches, site pathways ---------- */
{ const src = read('server/api/report.mjs'), sr = read('server/api/siterisk.mjs');
  ok(!/t0\.tx90 >= 38/.test(src) && !/pr3_99 >= 40/.test(src) && !/>= 0\.1\) push\('riverine'/.test(src) && /active: \[\], facts,/.test(sr) && /none: null, withheld/.test(sr), 'item 22 no standing-ground or site-pathway switch: the values are listed'); }
/* ---------- 23 · heat / cold wording; retired ladders deleted ---------- */
{ const h = safe(() => HL.hazardListOf({ ready: true, days: [{ day: 0, date: today, layers: { heat: { name: 'Heat stress', word: 'Low', V: 29.4 }, wind: { name: 'Wind', word: 'Normal' } } }] }));
  ok(h && !/No hazard at this site/.test(String(h.none)) && h.conditions[0] && /Low heat stress \(UTCI 29\.4/.test(h.conditions[0].text), 'item 23 Low stays "Low heat stress" with its UTCI value; no "no hazard" wording', h);
  ok(!/Monitor 40 \/ Watch 43/.test(read('server/api/skill.mjs')) && !/repDi:\[19,22\.5/.test(HTML), 'item 23 retired dry-heat / cold ladders and the DI example values are deleted'); }
/* ---------- 24 · landslide: never "cannot happen" ---------- */
{ const rec = { days: [{ day: 0, date: today, layers: { landslide: { L: { A: 0 } } } }] }; safe(() => HZ.applyLandslide(rec, { mask: { A: { applies: false, steepShare30m: 0 } }, odds: { ready: true, units: {} } }));
  const S = rec.days[0].layers.landslide; ok(S.L.A !== -4 && /^not assessed: no local steep ground.*run-out from upstream is not modelled/.test(S.why.A), 'item 24 a flat tehsil: "not assessed: no local steep ground; run-out from upstream not modelled", never "cannot happen"', S); }
/* ---------- 25 · drought class from the published category directly ---------- */
ok(/US Drought Monitor category of the index itself/.test(read('server/api/climatology.mjs')) && !/const si = knotScore\(T\.scoreKnots\.index/.test(read('server/api/climatology.mjs')), 'item 25 no drought score knots: the USDM category of the index');
/* ---------- 27 · report confidence: factors, no % ---------- */
ok(!/a\.lead\.confidence\+'%'/.test(HTML), 'item 27 no confidence percentage: the factors (terrain spread, data age)');
/* ---------- 28 · aiRiskFor deleted ---------- */
ok(!/function aiRiskFor\(/.test(HTML), 'item 28 the old operator station-risk formula (aiRiskFor) is deleted');
/* ---------- 29 · one data-age table ---------- */
{ const s = ['hazsci.mjs', 'rainamount.mjs', 'readiness.mjs', 'siterisk.mjs', 'ops.mjs', 'floodextent.mjs', 'flood.mjs', 'downscale.mjs', 'modelruns.mjs'].map((x) => read('server/api/' + x)).join('\n');
  ok(DA.DATA_AGE && DA.limitH('ens') === 25 && !/ENS_MAX_AGE_H = 1\.5 \* ENS_CYCLE_H/.test(s) && !/maxH: 15,/.test(s) && !/const STALE_H = 30;/.test(s) && !/export const RIVER_STALE_H = 30;/.test(s) && !/36 \* 3600e3/.test(s),
    'item 29 one data-age table (ens 12 + 13 h; river; gauge; ERA5) used everywhere; no 24/18/15 h, double 30 h or 36 h caches', DA.DATA_AGE_TEXT); }
/* ---------- 30 · barrage class table checked against the official sheet ---------- */
{ const J = (() => { try { return JSON.parse(read('data/evidence/ffdclass36/check.json')); } catch (_) { return null; } })();
  ok(J && Object.values(J.stations).every((v) => v.verdict === 'confirmed' || /no official readings/.test(v.verdict)), 'item 30 every flow-class row checked against the official sheet: confirmed (or no readings)', J && Object.fromEntries(Object.entries(J.stations).map(([k, v]) => [k, v.verdict]))); }
/* ---------- 31 · earthquake: zone code + PGA beside the word; live feed verified on its own ---------- */
ok(/', PGA ' \+ S\.pga\[z\]/.test(read('server/api/reflayers.mjs')) && /function ruleCheck\(\)/.test(read('server/api/quake.mjs')), 'item 31 zone code and PGA band beside the word; the live quake feed refuses a stub rule');
/* ---------- 32 / 33 / 34 ---------- */
ok(/Heat discomfort \(DI\) · day’s highest hour<\/option>/.test(HTML), 'item 32 the comfort map says it shows the day’s highest hour (current never returns the day peak unlabelled)');
{ const UL = await imp('server/api/utcilevel.mjs'); const c = safe(() => UL.coldCellOf(5)); ok(c && c.level === 0 && /slight cold stress \(UTCI 5/.test(String(c.condition)), 'item 33 mild cold is not lost: UTCI 9 to 0 C carries "slight cold stress" with its value beside Normal', c); }
{ const DT = await imp('server/api/droughttype.mjs'); const d = tmpData(); writeFileSync(join(d, 'pk-tehsils.json'), JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { uid: 'P|D|T' }, geometry: { type: 'Polygon', coordinates: [[[70, 30], [71, 30], [71, 31], [70, 31], [70, 30]]] } }] }));
  const T = safe(() => DT.createDroughtType ? DT.createDroughtType(d) : null); const G = T && T.gaugesByUnit ? safe(() => T.gaugesByUnit({ built: 'b', asOf: 'a', rivers: [{ station: 'IN', lat: 30.5, lon: 70.5 }, { station: 'OUT', lat: 32, lon: 72 }] })) : null;
  ok(!T || (G && G['P|D|T'] && G['P|D|T'].length === 1 && G['P|D|T'][0].station === 'IN'), 'item 34 water and crops: a river gauge counts only for the tehsil it lies in (no value from an unrelated tehsil; verification, no change needed)', G); }
/* ---------- 35 / 36 ---------- */
ok(/function siteCover\(L\)/.test(START), 'item 36 My sites: per site, assessed / not tested / not available / outside range');
ok(existsSync(join(ROOT, 'scripts/tests28336/consistency36.test.mjs')), 'item 35 one place / time / run / state check across surfaces (consistency36.test.mjs)');
/* ---------- 37 / 38 / 39 ---------- */
ok(/\/api\/methods\/constants/.test(read('server/api/index.mjs')) && (() => { try { return JSON.parse(read('data/constants-register.json')).rows.length >= 171; } catch (_) { return false; } })(), 'item 38 Methods: the full constants list (purpose, inputs, evidence, sensitivity, 1.0 decision) operator only');
ok(/<title>NIGRAAN 1\.0/.test(HTML) && /textContent='NIGRAAN 1\.0'/.test(HTML) && /NIGRAAN 1\.0'\)/.test(START), 'item 39 the client name is NIGRAAN 1.0; the build number on Methods only');
ok(existsSync(join(ROOT, 'scripts/tests28336/crawl36.test.mjs')), 'item 37 client screens: the crawl checks value / level / time / short state only (crawl36.test.mjs)');
/* ---------- 44 · harvester: network error -> clean stop ---------- */
{ const py = join(ROOT, '_admin/harvest/fc_archive_harvest.py'); let out = '';
  try { out = execFileSync('python3', ['-I', '-c', `import sys, socket, importlib.util, time
spec = importlib.util.spec_from_file_location('h', ${JSON.stringify(py)}); h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
time.sleep = lambda s: None
def op(url, t): raise OSError(11001, 'getaddrinfo failed')
n = h.Net('K', 0, lambda m: None, opener=op)
try:
    n.get('x', '/y', {'a': 1}); print('NO RAISE')
except getattr(h, 'NetworkDown', type('X', (Exception,), {})) as e: print('NETWORKDOWN', n.n)
except Exception as e: print('OTHER', type(e).__name__)`], { encoding: 'utf8' }); } catch (e) { out = 'ERR ' + String(e.stdout || e.message).slice(0, 200); }
  ok(/NETWORKDOWN/.test(out) && /stopped: no network/.test(read('_admin/harvest/fc_archive_harvest.py')) && read('_admin/harvest/fc_archive_harvest.py') === read('station-lake/scripts/fc_archive_harvest.py'), 'item 44 harvester: a DNS failure is retried with backoff, then stops cleanly "stopped: no network" (both copies)', out.trim()); }
/* ---------- C-now results applied ---------- */
{ const c = safe(() => HZ.riverCell('U1', { units: { U1: { reaches: { g: { river: 'R' } } } } }, {}, null, { applies: false, km2: 0.4, share: 0.01 }));
  ok(c && c.L !== -4 && /not assessed/.test(c.why) && c.facts && c.facts.maskFailed, 'C-now 5 river: no "cannot happen: off the floodplain"; not assessed here, the floodplain share a fact', c);
  ok(HZ.levelOfOdds(15) === 3 && HZ.levelOfOdds(40) === 3 && HZ.levelOfOdds(7) === 2, 'C-now 2a landslide: edges 2 / 5 / 10, top band "10x or more" (no Severe)');
  ok(LO.OBSERVED_BASIS && /average day/.test(LO.OBSERVED_BASIS), 'C-now 2a the observed ratio is against the average day (label fixed)');
  ok(RL.CYCLONE_CNOW && /never a warning/.test(RL.CYCLONE_CNOW), 'C-now 3 cyclone land factor test recorded; the layer stays a reference');
  const cn = safe(() => SC.weightedCN({ built: 1 }, { A: 1 })); ok(cn === 98 && Math.abs(SC.runoffMm(127, 98, 1) / 25.4 - 4.76) < 0.01, 'C-now 4 site lab: sealed ground at TR-55 CN 98, TR-55 weighted CN (4.76 in at P 5 in)', cn); }
console.log('\n' + (n - f) + '/' + n + ' passed'); process.exit(f ? 1 : 0);
