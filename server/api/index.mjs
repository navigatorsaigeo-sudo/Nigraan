/* NIGRAAN local backend: all 89 endpoints the artefact declares in
   AGN.backendInterfaces, served from one Node process with no dependencies. */
import { readFileSync, existsSync, statSync, writeFileSync, renameSync, readdirSync } from 'node:fs';   /* v283.47: readdirSync (/api/ops/wn3shadow) */
import { timingSafeEqual } from 'node:crypto';
import { join, resolve, relative } from 'node:path';
import { createStore, newId, nowIso, hashStable } from './store.mjs';
import { ApiError, createIdentity, authorize, validate, success, failure, paginate, createAudit, API_VERSION, SERVICE_VERSION } from './core.mjs';
import { createProvider, weightOf } from './provider.mjs';
import { createCallBudget, gateProvider, callerModule, als as budgetAls } from './callbudget.mjs';
import { createModelRuns } from './modelruns.mjs';   /* v91.17.283 · WS1 · fetch again only for a newer model run */
import { createFloodExtent } from './floodextent.mjs';   /* v283 WS9 · river flood extent (Indicative; served only if fx-model.json passed) */
import { createGlofasCal } from './glofascal.mjs';       /* v283 WS9 · river flow corrected to the gauge sheet (operator only) */   /* v91.17.283 · WS1 · owner decision C: the daily provider call budget */
import { buildUnitIndex, handlers as nationalHandlers } from './national.mjs';
import { createIngestion } from './ingestion.mjs';
import { createQuality } from './quality.mjs';
import { createGovernance } from './governance.mjs';
import { createWork } from './work.mjs';
import { createVerification } from './verification.mjs';
import { createBlend } from './blend.mjs';   /* v91.17.267 · the plains start from the multi-model mix (data/blend-gate.json) */
import { createAI } from './ai.mjs';
import { createOutlook } from './outlook.mjs';
import { createHand } from './hand.mjs';
import { createHazSci } from './hazsci.mjs';
import { airDays } from './placesummary.mjs';   /* v283.49 · 1.0.10 item 1 */   /* v91.17.283.13 · hazard science on the server (river link, rain classes, landslide, drought, sponge, GLOF) */
import { createTerrain } from './terrain.mjs';
import { createWetness } from './wetness.mjs';     /* v91.17.42 · catchment wetness: the state half of the sponge */     /* v91.17.40 · lithology per tehsil, landslide back-test */           /* v91.17.39 · HAND floodplain share per tehsil */
import { createClimatology } from './climatology.mjs';
import { createUrbanHeat } from './urbanheat.mjs';
import { createEnsVerify } from './ensverify.mjs';
import { createStations } from './stations.mjs';
import { createReport } from './report.mjs';
import { createPast30 } from './past30.mjs';   /* v91.17.266 · interface 1: the past 30 days at a place */
import { createReportService } from './repservice.mjs';   /* v91.17.283.49 · 1.0.10 · the one report engine (place answer, server PDF, HTML view) */
import { createReports } from './reports.mjs';   /* v91.17.268 · interface 1: the reports library (issue, list, html, json, pack, archive) */
import { createLimits } from './limits.mjs';
import { createCatchment } from './catchment.mjs';
import { createGlof } from './glof.mjs';
import { createPlaceFacts } from './placefacts.mjs';   /* v91.17.283 · FACTS283 */
import { createFloodFacts } from './floodfacts.mjs';   /* v91.17.283.15 */
import { createImerg } from './imerg.mjs';
import { createSmog } from './smog.mjs';
import { createMos } from './mos.mjs';
import { createMlMos } from './mlmos.mjs';   /* v91.17.59 · the learned correction, trees evaluated in Node */
import { createState } from './state.mjs';   /* v91.17.283.20 · the physical state of a point (WBGT, Tmrt, wind pressure, FDH, snow load): the operator part state of the place bundle */
import { createPool } from './pool.mjs';
import { downscaleFor } from './downscale.mjs';   /* v91.17.84 · the AI local correction for one point (/api/ai/local) */     /* v91.17.61 · the family-aware forecast pool: consensus, probability, agreement, confidence */
import { createOps } from './ops.mjs';
import { createFleet } from './fleet.mjs';   /* v91.17.57 */
import { createFleetHistory } from './fleethistory.mjs';   /* v91.17.63 */
import { createHyperlocal } from './hyperlocal.mjs';
import { createEwsAnchor } from './ewsshadow.mjs';   /* v91.17.283.25 · the EWS live anchor, SHADOW only (never served) */
import { createSynop } from './synop.mjs';   /* v91.17.147 */
import { createEpdAq } from './epdaq.mjs';
import { createDosAq } from './dosaq.mjs';   /* v91.17.283.52 E · the four US Department of State monitors, live */
import { createAqNow } from './aqnow.mjs';   /* v91.17.283.52 E · air quality measured now near a place */
import { createOpenAq } from './openaq.mjs';   /* v91.17.199 */
import { createVcArchive } from './vcarchive.mjs';   /* v91.17.199 */
import { createFloodObs } from './floodobs.mjs';
import { createSmap } from './smapfeed.mjs';   /* v91.17.163 · SMAP near-surface soil moisture */   /* v91.17.152 · observed flood water */   /* v91.17.147 */   /* v91.17.88 · L3 live hyperlocal temperature */
import { createNational } from './natmodel.mjs';   /* v91.17.89 · national hyperlocal model */
import { createNatScore } from './natscore.mjs';
import { createDropImport } from './dropimport.mjs';
import { createEnsArchive } from './ensarchive.mjs';   /* v91.17.178 · ensemble forecast archive */
import { createAccMon } from './accmon.mjs';   /* v91.17.273 · ACC · accuracy monitor: served vs observed (operator only) */
import { createMachDbSync } from './machdb.mjs';   /* v91.17.182 · the MACH record from AGN's observation database */
import { createEcmwf010 } from './ecmwf010.mjs';
import { createIfsRetrain } from './ifsretrain.mjs';
import { createAgents } from './agents.mjs';   /* v91.17.283.7 - in-product agents: feed health (10 min) and verification (daily 06:30 PKT), child processes */   /* v91.17.283.2 - ECMWF IFS 0.1 deg open data: ingestion, point series, shadow (serving off by default) */
import { createDriveFetch } from './drivefetch.mjs';
import { createCopies } from './copies.mjs';
import { createCopiesRetention } from './copiesretention.mjs';   /* v91.17.272 · OPS 2 · monthly move of old copies to _admin/archive/copies */   /* v91.17.269 · copy, not fetch: LAMHA's MACH, METAR and PMD-EWS copied into nig/copies (D:\NIGRAAN\nig\copies), validated (v91.17.283.25: no data-lake datasets) */
import { createPyJobs } from './pyjobs.mjs';   /* v91.17.260 · EWS append, satellite sunshine and previous-runs archives, scheduled */
import { createOmArchive } from './omarchive.mjs';   /* v91.17.283.24 · the one-time Open-Meteo past-forecast archive for the retrain */
import { createHumWind } from './humwind.mjs';
import { createMoist } from './moist.mjs';   /* v91.17.177 · national dew point and wind */   /* v91.17.92 · mountain humidity / wind */   /* v91.17.92 · the drop folder */   /* v91.17.91 · daily temperature check */
import { createNatGrid } from './natgrid.mjs';   /* v91.17.91 · hyperlocal temperature map */
import { createFeatGrid } from './featgrid.mjs';
import { createWxMos } from './wxmos.mjs';   /* v91.17.187 · weather MOS */
import { createTdown } from './tdown.mjs';   /* v91.17.270 · B2/B5 downscaling (off by default) */
import { createT2final } from './t2final.mjs';   /* v91.17.271 · B2 v2 final correction of the served temperature (off by default) */
import { createCloudT } from './cloudt.mjs';   /* v91.17.273 · forecast-cloud final correction of the served temperature (zone-gated; no zone passed) */
import { createDewFix } from './dewfix.mjs';   /* v91.17.275 · DEW · final dew-point offset of the served chain (zone-gated: mountain, Sep-Oct) */
import { createArchive } from './archive.mjs';   /* v91.17.76 · the permanent training archive (data/archive) */
import { createCasebook } from './casebook.mjs';   /* v91.17.66 */
import { createSeasVerify } from './seasverify.mjs';
import { createMapLayers } from './maplayers.mjs';
import { createSkill } from './skill.mjs';
import { createPlaces } from './places.mjs';   /* v91.17.283.18 · the one place layer (data/geo/places.json.gz) */
import { createObsBias } from './obsbias.mjs';   /* v91.17.10 · measured station bias */
import { createFlood } from './flood.mjs';
import { createRiverCal, gaugeAge, gaugeCurrent } from './rivercal.mjs';   /* v91.17.274 · RIVER · v91.17.283.13 per-gauge age */
import { createQuake } from './quake.mjs';   /* v91.17.77 · Q · recent earthquakes: felt tehsils by level */
import { createSeismic } from './seismic.mjs';
import { createPlaceRecord } from './placerecord.mjs';
import { countOf } from './hazardcount.mjs';   /* v91.17.283.37 · the hazard count of a point (one function: the place bundle and the national grid) */
import { createHazardGrid } from './hazardgrid.mjs';   /* v91.17.283.37 · the national hazard surface (start page) */   /* v91.17.283.28 · S5 / S6 */
import { createScenario } from './scenario.mjs';   /* v91.17.283.28 · S10 */
import { createSiteChange } from './sitechange.mjs';   /* v91.17.283.34 · Scenario Lab B */
import { scenarioReport } from './scenarioreport.mjs';   /* v91.17.283.34 · compare + export */
import { scenarioStore } from './scenariostore.mjs';
import { createFloodOutcome } from './floodoutcome.mjs';
import { fcArchiveStatus } from './fcarchive.mjs';   /* v91.17.283.33 · forecast archive status */   /* v91.17.283.33 · Scenario Lab flood outcome */
import { createFaults } from './faults.mjs';   /* v91.17.216 · GEM active faults (reference) */
import { createRainChance } from './rainchance.mjs';   /* v91.17.101 · audit #11 · calibrated rain chances */   /* v91.17.98 · BCP SP-2007 zone + BCP 2021 Ss/S1/SDC at a point */
import { createVegetation } from './vegetation.mjs';
import { createGate } from './gate.mjs';
import { createRiverProb } from './riverprob.mjs';
import { readiness } from './readiness.mjs';   /* v283.31 · 1.5 */
import { createRefLayers, REF_LAYERS } from './reflayers.mjs';
import { STATE_CODES, STATE_LABEL, stateCounts, codeDict } from './states.mjs';   /* v91.17.283.35 */
import { createRainAmountLayer } from './rainamount.mjs';   /* v283.31 · item 2.4 */
import { ownPath as ownPath31 } from './ownpaths.mjs';
import { createRiverSheet, flowChangeOnly } from './river31.mjs';   /* v283.31 · data lane: measured river flows; no raw model flow */
import { dayRarity as rainDayRarity } from './hazsci.mjs';
import { hazardScaleRegister as hsReg31 } from './scalecuts.mjs';
const STATE_CODE_TEXT = { '-4': 'not assessed: cannot happen here', '-5': 'not tested: the model has not passed its test here (no level is issued)', '-6': 'input not current: an input does not cover this day or is too old (its age is in the reason)' };   /* v91.17.283.31 · items 1.2, 1.3 */
import { createLandslideOdds } from './landslideodds.mjs';
import { createProvenance } from './provenance.mjs';
import { createSnapshot } from './snapshot.mjs';   /* v91.17.207 */
import { createFloodDepth } from './flooddepth.mjs';
import { createDiag } from './diagprof.mjs';   /* v91.17.232 */   /* v91.17.207 */
import { createPointState } from './pointstate.mjs';
import { createPointProducts } from './pointprod.mjs';
import { createPoint } from './point.mjs';   /* v91.17.283.19 · ONE server call per place: GET /api/point (the place bundle) */   /* v91.17.283.15 · item 3: the provider products of a place, held on the server */
import { serverFile } from '../engine/serverfiles.mjs';   /* v91.17.283.12 */
import { createAreaHeat } from './areaheat.mjs';   /* v91.17.283.12 */   /* v91.17.283.11 · one calculation point per place (the Overview reads it) */
import { createPointEngine } from './pointengine.mjs';   /* v91.17.118 · the full temperature chain at an exact point */   /* v91.17.116 · offline street search */   /* v91.17.112 · landslide likelihood vs an ordinary day */   /* v91.17.105 · river flood as a probability of the official class */
import { createEngine } from './engine.mjs';
import { capReport } from './capcount.mjs';   /* v91.17.108 */   /* v91.17.106 · the server engine */
import { createShown, buildIdentity } from './shown.mjs';
/* r42: the build this process started with (read once at load: after a swap package.json on disk names the new build for every process) */
const START_BUILD42 = (() => { try { return buildIdentity(null).build; } catch (_) { return null; } })();   /* v91.17.104 · shown-level archive + self-check */   /* v91.17.103 · model gate */   /* v91.17.101 · C1/C3 */
import { createSources } from './sources.mjs';   /* v91.17.70 · the customer Sources page, from the data files' licence headers */
import { unitAtPoint } from './unitresolve.mjs';
import { applicabilityRows } from './applicability.mjs';   /* v91.17.283.35 · audit B3 */
import { createGuidance, guidanceRoute, inProcessGet, GUIDANCE_ON } from './guidance.mjs';   /* v91.17.283.48 · "What to do here" (GUIDANCE_PANEL=1) */
import { createSiteRisk } from './siterisk.mjs';   /* v91.17.79 · what could affect this site in the next 15 days; engineering screening values */   /* v91.17.70 · point → tehsil by polygon */
import { stationData, internalNames, label } from './refmode.mjs';   /* v91.17.71 · data use vs naming */
import { scrubNames, namesRegex } from './ai.mjs';   /* v91.17.71 · the same supplier-name scrub the AI facts use */
import { customerScrub, agencyBody } from './customerscrub.mjs';
import { servedUnit, levelTag, clientRules, NOT_ASSESSED, alertLevelWord, NO_CLIENT_ALERT, riverAlertWhy, tehsilLevelsOf } from './served.mjs';
/* v91.17.283.8 · science audit · the client words for the withheld river flood chance (data/river-prob-model.json: Brier skill against persistence below 0 in both tested monsoons) */
export const RIVER_CHANCE_WITHHELD = 'River flood chance: not yet verified; worse than persistence in tests (in both tested monsoons it scored worse than carrying the day\u2019s measured flow forward). The river flood level is shown instead.';   /* v91.17.283 · WS4 module, routed by WS1: the served levels for clients */
import { createScheduler, schedule } from './scheduler.mjs';
import { cleanTestRecords } from './testclean.mjs';   /* v91.17.255 · B-2 · test-backend cleans up after itself */
import { createCaseSetAside } from './casesetaside.mjs';   /* v283.44 · test projects moved off the customer list (never deleted) */
import { createTables } from './tables.mjs';   /* v91.17.221 · audit S-21 */   /* v91.17.218 · audit S-11 · one scheduler */   /* v91.17.172 · audit E-3/E-14/O-9 · role words for supplier names in customer JSON */
import { clientWhy } from './clientwhy.mjs';   /* v91.17.283 · INTEG (F4): plain reasons, never raw exception text */
import { dashGate } from './dashgate.mjs';

export function createBackend({ root, dataDir }) {
  const gate = dashGate(dataDir);
  const contractDir = join(root, 'server', 'contract');
  const endpointList = JSON.parse(readFileSync(join(contractDir, 'endpoints.json'), 'utf8'));
  const endpoints = new Map(endpointList.map(e => [e.id, e]));
  const routes = endpointList.map(e => ({ e, re: new RegExp('^' + e.path.replace(/\{(\w+)\}/g, '(?<$1>[^/]+)') + '$') }));
  const store = createStore(dataDir);
  const identity = createIdentity(dataDir);
  const audit = createAudit(store);
  const provider = createProvider(store);
  /* v91.17.283 · WS1 · owner decision C · every provider call passes the daily budget (callbudget.mjs, data/provider-budget.json) at the
     two places where calls are made and counted: call() (backend jobs) and noteProxyCall() (each proxy fetch in server.mjs). The class of
     the call (user-facing / background) comes from the request it runs in; background is shed first. provider.mjs is not changed. */
  const callBudget = createCallBudget({ dataDir, provider, store, alert: (...a) => app.raiseAlert(...a) });   /* app is defined below; the alert runs later */
  gateProvider(provider, callBudget, weightOf, (cls) => new ApiError(429, 'PROVIDER_QUOTA_EXHAUSTED', callBudget.refusal(cls), { retryable: false, details: { budgetClass: cls } }));
  /* v91.17.283 · WS1 · the provider's model metadata (one call per domain when its next run is due) and the backend answer cache keyed on it:
     the national job and every backend forecast / air-quality / seasonal caller get the same answer until a newer run exists (modelruns.mjs) */
  const modelRuns = createModelRuns({ dataDir, metaFetch: (kind, d) => callBudget.runAs('background', () => provider.call(kind, '/data/' + d + '/static/meta.json', {}, { locations: 0, timeoutMs: 15000 }), 'model metadata') });
  if (process.env.NIGRAAN_RUN_CACHE !== '0') modelRuns.cacheProvider(provider);
  /* v91.17.283 · WS1 · PATCH3 · the answer cache follows the budget: a background tier under main-runs-only (shed pressure, test mode) keeps
     its last answer until a new 00/12 UTC run; a person's request in test mode is cache first */
  modelRuns.setPolicy((kind, params) => { const cls = callBudget.current();
    if (cls === 'user') return { cacheFirst: callBudget.userCacheFirst() };
    const t = callBudget.tierOf({ tag: callBudget.currentTag(), tier: (budgetAls.getStore() || {}).tier || null, module: callerModule(new Error().stack), kind, models: (params || {}).models });
    return t ? { mainRunsOnly: callBudget.mainRunsOnly(t.id), hours: callBudget.mainHours() } : null; });
  let settle = null; try { const sf = join(dataDir, 'settlement-elevation.json'); if (existsSync(sf)) settle = JSON.parse(readFileSync(sf, 'utf8')); } catch (_) { settle = null; }
  const units = buildUnitIndex(JSON.parse(readFileSync(join(contractDir, 'units.json'), 'utf8')), settle);
  if (settle) console.log('  units      settlement heights from data/settlement-elevation.json: ' + units.tehsil.filter(u => u.elevSource !== 'anchor point').length + ' tehsils served at the population-weighted height (gap > 150 m)');
  /* v91.17.3 · 2A.5 · IDF curves, optional: a build without the station lake still runs */
  let IDF = null; try { IDF = JSON.parse(readFileSync(join(contractDir, 'idf.json'), 'utf8')); } catch { IDF = null; }

  const app = { store, identity, audit, provider, callBudget, modelRuns, units, endpoints, contractDir, backgroundWorker: { enabled: process.env.NIGRAAN_WORKER !== '0', intervalSeconds: 20, lastTickAt: null, lastError: null } };
  app.scheduler = createScheduler();   /* before any module registers a job */
  app.draining = false;   /* v91.17.269 · INFRA A6 · set by server.mjs when a deploy retires this server */
  app.scheduler.setGate(() => !app.draining && !(store.standby && store.standby()));
  app.tables = createTables(app, dataDir);
  /* v91.17.283 · WS1 · the plan check: the 30-day projection against the monthly plan, an ops alert when it exceeds it (any mode) */
  { const t0 = setTimeout(() => { callBudget.checkPlan().catch(() => {}); setInterval(() => { callBudget.checkPlan().catch(() => {}); }, 30 * 60e3).unref(); }, Math.max(1, Number(process.env.NIGRAAN_BUDGET_CHECK_S) || 60) * 1000); t0.unref(); }
  app.raiseAlert = async (type, severity, message, details = {}) => {
    const open = store.find('alerts', a => a.status === 'open' && a.type === type && hashStable(a.details) === hashStable(details));
    if (open) { open.count++; open.last_seen_at = nowIso(); await store.save(); return open; }
    return store.insert('alerts', { alert_id: newId('alr'), type, severity, message, details, status: 'open', count: 1, raised_at: nowIso(), last_seen_at: nowIso() });
  };
  const ingestion = createIngestion(app);
  app.blend = createBlend({ dataDir, provider, budget: callBudget, runs: modelRuns, log: (m) => console.log('  ' + m) });   /* v91.17.267 · read by verification.servedChainSteps (o.blend), server.mjs, national.mjs and fleet.mjs */
  app.verification = createVerification(app);
  app.climatology = createClimatology(app, dataDir);
  app.urbanHeat = createUrbanHeat(app, dataDir);
  app.ensVerify = createEnsVerify(app, dataDir);
  app.stations = createStations(app, dataDir);
  app.outlook = createOutlook(app, dataDir);
  /* v91.17.45 · the station-lake meteorological checks, re-read every 10 minutes so a LEARN run updates the notes without a restart */
  { let _mc = null, _at = 0; app.metCorrections = () => { if (Date.now() - _at > 600e3) { _at = Date.now(); try { const f = join(dataDir, 'met-corrections.json'); _mc = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; } catch { _mc = null; } } return _mc; }; }
  app.provenance = createProvenance(app);   /* v91.17.126 · stage 7 */
  app.report = createReport(app);
  app.past30 = createPast30(app, dataDir, { dbDir: join(root, '..', 'station-lake', 'archive', 'fleet', 'db'), cacheMs: Math.max(0, Number(process.env.NIGRAAN_PAST30_CACHE_S ?? 300)) * 1000 });   /* v91.17.266 · reads the archives, the fleet screen and the normals at call time; v91.17.267 · and the MACH observation record; v91.17.268 · one read per point and Pakistan day in flight, an ok answer kept 5 min (NIGRAAN_PAST30_CACHE_S, 0 = off) */
  app.reports = createReports(dataDir, app);
  app.reportEngine = createReportService(app, dataDir);   /* v91.17.283.49 · 1.0.10 */   /* v91.17.268 · data/reports; v91.17.283.8: app for the snapshot id each report records */
  app.catchment = createCatchment(app);   /* v91.17.30 · catchment heavy rain against its own record */
  app.glof = createGlof(app);             /* v91.17.31 · P6-10 · named glacial lakes upstream of an asset */
  app.imerg = createImerg(app, dataDir);   /* v91.17.32 · IMERG satellite rain as a second judge of the rain forecast */
  app.limits = createLimits(app);   /* v91.17.26 · P1-2 / P1-3 · limits now to 15 days */
  app.smog = createSmog(app, dataDir);
  app.seasVerify = createSeasVerify(app, dataDir);
  app.mapLayers = createMapLayers(app);
  app.skill = createSkill(dataDir, app);          /* v91.17.3 · 1.12 · the measured skill sheet */
  app.sources = createSources(dataDir);           /* v91.17.70 · /api/sources */
  app.dataDir = dataDir;
  app.places = createPlaces(app);   /* v91.17.283.18 · every place question: search, the point of a name, the name of a point, places around a point */
  app.obsBias = createObsBias(app);       /* v91.17.10 · model error measured at 41 NOAA stations */
  app.flood = createFlood(app, dataDir);  /* v91.17.3 · 2A.1 · riverine on snapped GloFAS reaches */
  app.riverCal = createRiverCal(dataDir);
  app.floodExtent = createFloodExtent(app, dataDir); app.glofasCal = createGlofasCal(dataDir);   /* v283 WS9 · wired by WS1 */   /* v91.17.274 · RIVER · stale-sheet switch + operator gauge-equivalent flow (data/river-cal.json) */
  app.quake = createQuake(app, dataDir);
  app.rainChance = createRainChance(app, dataDir);   /* v91.17.101 · data/rain-chance-model.json */
  app.vegetation = createVegetation(app, dataDir);
  app.gate = createGate(dataDir);   /* v91.17.103 */
  app.riverProb = createRiverProb(dataDir);   /* v91.17.105 */
  app.landslideOdds = createLandslideOdds(app, dataDir);   /* v91.17.112 */
  app.rainHistory = app.landslideOdds.rainHistory;
  app.rainHourly = app.landslideOdds.rainHourly;   /* v91.17.283.40 · item 6: hourly tehsil rain (same refresh) -> runoff per storm */
  app.refLayers = createRefLayers(app, dataDir);
  app.riverSheet = createRiverSheet(app, { lakeDir: process.env.NIGRAAN_STATION_LAKE_DIR || process.env.NIGRAAN_STATION_LAKE || join(root, '..', 'station-lake'), dataDir });   /* v283.31 · data lane */
  app.rainAmount = createRainAmountLayer(app, dataDir, { dayRarity: rainDayRarity, rainClasses: () => { const H = hsReg31(); return H && H.rainClasses24h ? H.rainClasses24h : null; }, zoneOf: (u) => (app.mos && app.mos.zoneOfPoint ? app.mos.zoneOfPoint(u.lat, u.lon, u.elevM ?? null) : null) });   /* v283.31 · item 2.4 · the rain amount layer */   /* v91.17.283.31 · items 1.2, 1.3 · earthquake zone and cyclone exposure as reference layers */   /* v91.17.283.31 · item 1.1 · one shared rain history for all 576 tehsils (runoff, retention, rain rarity) */
  /* v91.17.118 · load the street index before the first search asks for it. v91.17.124 · B-04: the first place search after a restart
     took about 15 s because the street index, the 30 m point heights and the tehsil polygon lookup all loaded on that search.
     v91.17.144 · B5 · the national builders that ran for 0.6-1 s on a user's first request (urban heat cells, rain chance, the
     sources list behind every report) are built while nobody waits; the GLOF national layer warms itself in slices. Each one is cached
     by its own module afterwards.
     ══ v91.17.269 · PERF A2 · ONE WARM-UP, BEFORE THE FIRST CUSTOMER ══════════════════════════════════════════════════════════════════
     These used to be five timers (place index 1.5 s, street search 3 s, national trees 3 s, the three builders 8-10 s after start)
     that fired while the page's first requests were already arriving: each one held the event loop (the place index 3.6 s, the urban
     heat cells 0.7 s) under a customer's request. warmUp() runs them in order, one per turn of the event loop, together with the
     MACH record months of the past-30-days interface (parsed in a worker thread); server.mjs calls it right after it starts listening
     and takes customers (anything but /health) only when it has finished. Each step's time is kept for /health (warm.steps). */
  app.warm = { ready: false, at: null, ms: null, steps: {}, errors: {}, essentials: null, failed: null };
  /* v91.17.279 · OPS-06 · a warm-up step that throws is logged and kept (warm.errors), not swallowed; warm (ready) is set only when the
     essentials passed (opts.essentials, server.mjs: provider configured, writer or standby, the page, a point forecast, a levels layer) */
  async function warmUp(opts = {}) {
    const t0 = Date.now(), turn = () => new Promise((r) => setImmediate(r));
    const fail = (name, e) => { const m = String((e && e.message) || e).slice(0, 300); app.warm.errors[name] = m; console.error('  warm: step ' + name + ' failed: ' + m); };
    const step = async (name, f) => { const t = Date.now(); try { await f(); } catch (e) { fail(name, e); } app.warm.steps[name] = Date.now() - t; await turn(); };
    const p30 = (async () => { const t = Date.now(); try { await app.past30.warm(); } catch (e) { fail('past30Record', e); } app.warm.steps.past30Record = Date.now() - t; })();   /* worker thread, beside the steps below */
    await turn();   /* the first /health ("starting") is answered before the first step */
    await step('placeIndex', () => app.places.warm());
    await step('nationalTrees', () => app.national && app.national.warm && app.national.warm());
    await step('urbanHeatCells', () => app.urbanHeat && app.urbanHeat.national && app.urbanHeat.national());
    await step('rainChance', () => app.rainChance && app.rainChance.national());
    /* v91.17.283.51 · B3 · the Sources page's licence headers are read ahead in the background (sources.mjs prewarm), not inside the warm-up */
    if (app.sources && app.sources.prewarm) { const t = Date.now(); app.sources.prewarm().then(() => { app.warm.steps.sourcesBackground = Date.now() - t; }).catch((e) => fail('sources', e)); }
    else await step('sources', () => app.sources && app.sources.list && app.sources.list());
    await p30;
    let ess = null; if (typeof opts.essentials === 'function') { try { ess = await opts.essentials(); } catch (e) { ess = { ok: false, checks: {}, error: String((e && e.message) || e) }; } }
    app.warm.essentials = ess; app.warm.failed = ess && !ess.ok ? Object.entries(ess.checks || {}).filter(([, v]) => !v.ok).map(([k, v]) => k + ': ' + (v.why || 'failed')).concat(ess.error ? [ess.error] : []) : null;
    if (app.warm.failed) console.error('  warm: NOT READY, essentials failed: ' + app.warm.failed.join('; '));
    Object.assign(app.warm, { ready: !app.warm.failed, at: new Date().toISOString(), ms: Date.now() - t0 });
    try { if (app.hazardGrid) app.hazardGrid.start(Number(process.env.NIGRAAN_HAZGRID_DELAY_MS || 60e3)); } catch (_) {}   /* v91.17.283.37 · the national hazard surface, in the background */
    return app.warm;
  }
  app.pointEngine = createPointEngine(app);   /* v91.17.118; v283.24 P13: the daily point archive of the served record */
  app.pointState = createPointState(app, { dataDir });
  app.pointProducts = createPointProducts(app);   /* v91.17.283.15 · GET /api/pointstate/product */
  /* v91.17.283.15 · item 3: the urban heat-island field of a point, ONE function: the urban estimate with the fleet's measured urban term
     beside it (was the /api/urban/point route's own code); the point state carries it in its record (pointstate.mjs urban), the route
     answers the same object */
  app.urbanPoint = (lat, lon, opts = {}) => {
    const o = { ...opts }; if (!o.at && o.hoursFromSunset == null) o.at = new Date().toISOString();
    const est = app.urbanHeat.estimate(lat, lon, o);   /* v91.17.64 · the fleet's measurement beside the model */
    if (est && est.urban && app.fleetHistory && app.fleetHistory.ready()) { const at = o.at ? Date.parse(o.at) : Date.now(); const elv = Number.isFinite(o.elev) ? o.elev : app.fleetHistory.proxyElevM(lat, lon); const mosA = !!(app.mos && elv != null && app.mos.adjust(lat, lon, elv, at, 25).applied); const u = app.fleetHistory.urbanTerm(lat, lon, at, mosA); const uc = app.fleetHistory.uhiCheck(); est.fleet = { ...u, check: uc && uc.verdict ? { stations: uc.verdict.stations, spearman: uc.verdict.spearman, meanResidualC: uc.verdict.meanResidualC, modelMeanMaxC: uc.verdict.modelMeanMaxC, observedMeanMaxC: uc.verdict.observedMeanMaxC } : null }; }
    return est; };
  try { app.areaHeat = createAreaHeat(app, { dataDir }); } catch (e) { app.areaHeat = null; console.log('  area heat  not running: ' + e.message); }   /* v91.17.283.12 */   /* v91.17.283.11 · GET /api/pointstate, /batch, /near */
  app.engine = createEngine(app, dataDir, { port: Number(process.env.PORT || 8787) });   /* v91.17.106 */
  app.diag = createDiag(dataDir, () => ({ store: app.store && app.store.writeStats ? app.store.writeStats() : null }));   /* v91.17.232 · CPU profile and GC pauses of this server, on request (operator) */
  app.floodDepth = createFloodDepth(dataDir);   /* v91.17.207 · JRC / GloFAS river flood depth at an asset (data/flood-depth) */
  app.snapshot = createSnapshot(app, dataDir);   /* v91.17.207 · analysis snapshot (code + tables + forecast inputs) */
  app.shown = createShown(app, dataDir);   /* v91.17.104 */   /* v91.17.101 · C1/C3 */
  try { app.copies = createCopies(app, root, dataDir); const cs = app.copies.status(); console.log('  copies     ' + (cs.on ? Object.entries(cs.sources).map(([k, v]) => k + (v.found ? ' ' + v.dir : ' not found (' + v.dir + ')')).join('; ') + ' -> ' + cs.copiesDir + ' every ' + cs.config.everyMin + ' min; own fetch when a copy is stale or fails its checks' : 'off: own fetches only')); } catch (e) { app.copies = null; console.log('  copies     not started: ' + e.message); }
  try { app.copiesRetention = createCopiesRetention(app, root, dataDir); const rs = app.copiesRetention.status(); console.log('  copies     retention ' + (rs.on ? 'monthly (keepDays ' + rs.keepDays + '; older files moved to _admin\\archive\\copies, never deleted); last run ' + (rs.lastRun || 'none yet') : 'off (NIGRAAN_COPIES_RETENTION=0)')); } catch (e) { app.copiesRetention = null; console.log('  copies     retention not started: ' + e.message); }
  /* v91.17.283.25 · the AGN data lake reader (lake.mjs, app.lake, GET /api/lake/status) is removed: NIGRAAN leaves D:\DATA LAKE (owner, 27 Oct 2026) */
  app.faults = createFaults(app);
  app.seismic = createSeismic(app, dataDir);   /* v91.17.98 · data/seismic-bcp2007.json, seismic-bcp2021.json, seismic-units.json */   /* v91.17.77 · Q · data/seismic-felt-rule.json */
  app.terrain = createTerrain(dataDir, units); /* v91.17.40 */
  app.wetness = createWetness(app, dataDir);   /* v91.17.42 */
  { const w = app.wetness.status(); console.log('  wetness    ' + (w.ready ? w.units + ' tehsils, ' + w.ageH + ' h old' : 'not yet run') + (w.sponge ? '; sponge table ' + w.sponge.units + ' tehsils' : '; no sponge table (LEARN_NIGRAAN.bat sponge)')); }
  { const ts = app.terrain.status(); console.log('  terrain    lithology ' + (ts.lithology.ready ? ts.lithology.units + ' tehsils' : 'not served') + '; landslide back-test ' + (ts.landslideCalibration.ready ? ts.landslideCalibration.events + ' events' : 'not served')); }
  app.hand = createHand(dataDir, units);  /* v91.17.39 · where the river spreads: the riverine 'where' factor */
  app.hazSci = createHazSci(app, { dataDir });   /* v91.17.283.13 · applied to every engine report (engine.mjs report) */
  { const hs = app.hand.status(); console.log('  hand       ' + (hs.ready ? hs.units + ' tehsils with HAND bands (data/hand-tehsil.json, built ' + hs.built + '); riverine factor floor ' + hs.factor.floor : 'not served: ' + hs.why)); }
  app.mos = createMos({ dataDir, log: app.log });
  app.mlMos = createMlMos({ dataDir, log: (k, m) => console.log('  ' + k.padEnd(10) + ' ' + m) }); app.mos.setMl(app.mlMos);
  app.verification.setMos(app.mos);          /* station correction outranks ERA5 in the north */
  app.ops = createOps(app, dataDir);
  app.fleet = createFleet(app, root, dataDir);   /* v91.17.57 · the MACH fleet, polled and screened */
  app.archive = createArchive(app, root, dataDir);   /* v91.17.76 · after app.fleet: it samples the fleet's screened readings */
  app.fleetHistory = createFleetHistory(app, dataDir);   /* v91.17.63 · the fleet's multi-year record paired with the forecast */
  /* v91.17.89 · the national hyperlocal model (data/national-model.json), inside correctLocation; one feature grid shared */
  try { if (!app.featGrid) app.featGrid = createFeatGrid(dataDir); app.national = createNational({ dataDir, featGrid: app.featGrid }); app.national.setZoneOf((la, lo, e) => app.mos.zoneOfPoint(la, lo, e));
    const ns = app.national.status(); console.log('  national   ' + (ns.ok ? ns.version + (ns.enabled ? '' : ' (off: NIGRAAN_NATIONAL=0)') : 'not served: ' + ns.why)); } catch (e) { app.national = null; console.log('  national   not served: ' + e.message); }
  try { app.humWind = createHumWind({ dataDir, zoneOf: (la, lo, e) => app.mos.zoneOfPoint(la, lo, e) }); const hs = app.humWind.status(); console.log('  humwind    ' + (hs.ok ? hs.version + ' (mountain humidity / wind; self-check ' + app.humWind.selfcheck().toExponential(1) + ')' : 'not served: ' + hs.why)); } catch (e) { app.humWind = null; console.log('  humwind    not served: ' + e.message); }   /* v91.17.92 */
  try { app.moist = app.national ? createMoist({ dataDir, national: app.national, zoneOf: (la, lo, e) => app.mos.zoneOfPoint(la, lo, e) }) : null; const ms = app.moist && app.moist.status(); console.log('  moist      ' + (ms && ms.ok ? ms.version + ' (national dew point / wind; self-check ' + app.moist.selfcheck().toExponential(1) + ')' : 'not served: ' + (ms ? ms.why : 'no national model'))); } catch (e) { app.moist = null; console.log('  moist      not served: ' + e.message); }   /* v91.17.177 */
  app.synop = createSynop(app, dataDir); app.synop.start();
  app.epd = createEpdAq(app, dataDir); app.epd.start();
  app.dos = createDosAq(app, dataDir); app.dos.start();   /* v91.17.283.52 E · every 30 min, 48 h kept, daily means to station-lake/archive/aq */
  app.aqNow = createAqNow(app, dataDir);   /* v91.17.283.52 E · nearest QC-passed monitor within 25 km, reading < 90 min (point.mjs) */
  app.vcarch = createVcArchive(app, dataDir); app.vcarch.start();   /* v91.17.199 · daily archive of the second provider's forecasts (not served) */
  app.openaq = createOpenAq(app, dataDir); app.openaq.start();   /* v91.17.199 · OpenAQ low-cost sensors, internal until calibrated */
  app.smap = createSmap(app, dataDir); app.smap.start();   /* v91.17.163 */
  app.floodobs = createFloodObs(app, dataDir); app.floodobs.start();   /* v91.17.152 · satellite standing flood water, 3-day composite */   /* v91.17.147 · EPD Punjab stations, internal calibration */   /* v91.17.147 · synoptic station running correction */
  app.tdown = createTdown({ dataDir, featGrid: app.featGrid || null });   /* v91.17.270 · B2/B5 downscaling module (OFF by default: NIGRAAN_TDOWN=1) */
  app.t2final = createT2final({ dataDir, tdown: app.tdown });   /* v91.17.271 · B2 v2 final correction (OFF by default: NIGRAAN_T2FINAL=1; data/t2final-b2v2.json servedZones) */
  app.cloudt = createCloudT({ dataDir });   /* v91.17.273 · forecast-cloud final correction (on by default for gate-passing zones only: data/cloudt.json servedZones; NIGRAAN_CLOUDT=0 off) */
  app.dewfix = createDewFix({ dataDir, consistency: (loc) => app.humWind && app.humWind.consistency(loc) });   /* v91.17.275 · DEW · final dew-point offset (data/dew-final.json; NIGRAAN_DEWFIX=0 off) */
  /* v91.17.283.24 · self-audit D3 · app.wxhaz (wxhaz.mjs, off since v271: no served hazard) was created and never read: no longer created.
     v283.51g3 · the module (and pluvialtrigger.mjs, never imported) is removed; data/wx-hazards.json and data/pluvial-trigger.json stay (offline studies). */
  app.wxmos = createWxMos(app, dataDir);   /* v91.17.187 · weather MOS, applied in verification.correctSteps after the static chain */
  app.hyperlocal = createHyperlocal(app, dataDir);   /* v91.17.88 · L3: live MACH (siting-corrected against PMD), kriged onto any point */
  try { app.ewsAnchor = createEwsAnchor(app, dataDir); } catch (e) { app.ewsAnchor = null; console.log('  ews shadow not started: ' + e.message); }   /* v91.17.283.25 · hourly, archived, scored by the verification agent; never in a served value */
  try { app.natGrid = createNatGrid(app); } catch (_) { app.natGrid = null; }
  try { app.natScore = createNatScore(app, root, dataDir); } catch (e) { app.natScore = null; console.log('  natscore   not running: ' + e.message); }   /* v91.17.91 · daily temperature check */
  try { app.dropImport = createDropImport(app, root, dataDir); console.log('  drop       ' + app.dropImport.folder + ' (checked every 30 min)'); } catch (e) { app.dropImport = null; console.log('  drop       not running: ' + e.message); }   /* v91.17.92 */
  try { app.ensArchive = createEnsArchive(app, root, dataDir); console.log('  ensarchive ' + (app.ensArchive.status().on ? 'ensemble rain archive checked hourly (first check in 5 min)' : 'switched off (NIGRAAN_ENS_ARCHIVE=0)')); } catch (e) { app.ensArchive = null; console.log('  ensarchive not running: ' + e.message); }   /* v91.17.178 */
  try { app.accMon = createAccMon(app, root, dataDir); console.log('  accmon     ' + (app.accMon.status().on ? 'accuracy monitor hourly (bulk slot; first run in 10 min; backfill from the copied MACH database when empty)' : 'switched off (NIGRAAN_ACCMON=0)')); } catch (e) { app.accMon = null; console.log('  accmon     not running: ' + e.message); }   /* v91.17.273 */
  try { app.machDb = createMachDbSync(app, root, dataDir); console.log('  machdb     ' + (app.machDb.status().on ? 'MACH database record copied every 6 h (first in 3 min)' : 'off (no obs.key, or NIGRAAN_MACH_DB_SYNC=0)')); } catch (e) { app.machDb = null; console.log('  machdb     not running: ' + e.message); }   /* v91.17.182 */
  try { app.ecmwf010 = createEcmwf010(app, root, dataDir); const _e = app.ecmwf010.status(); console.log('  ecmwf010   ' + (_e.on ? 'ECMWF 0.1 deg open data checked every 30 min (first in 7 min); shadow at MACH stations; serving ' + (_e.serve.on ? 'ON for ' + (_e.serve.passed.join(', ') || 'no variable yet') : 'off') : 'switched off (NIGRAAN_ECMWF010=0)')); } catch (e) { app.ecmwf010 = null; console.log('  ecmwf010   not running: ' + e.message); }   /* v91.17.283.2 */
  /* 28 Oct 2026 · the owner-approved IFS bias-removal set of the automatic monthly retrain, on the IFS-basis hours only (ifsretrain.mjs; data/ifs-mos-retrain-active.json) */
  try { app.ifsRetrain = createIfsRetrain({ dataDir, ecmwf010: () => app.ecmwf010, zoneOf: (la, lo, e) => app.mos.zoneOfPoint(la, lo, e), featGrid: () => app.featGrid, moist: () => app.moist, humWind: () => app.humWind }); const _r = app.ifsRetrain.status(); console.log('  ifs-retrain ' + (_r.active ? 'approved set ' + _r.version + ' (IFS-basis hours only)' : 'no approved set: nothing served')); } catch (e) { app.ifsRetrain = null; console.log('  ifs-retrain not running: ' + e.message); }
  try { app.agents = createAgents(app, root, dataDir); console.log('  agents     ' + (app.agents.status().on ? 'feed health every 10 min (first in 2 min); verification daily from 06:30 PKT (first check in 4 min); partner-network copy every 30 min (first in 3 min, read only on the source); child processes, data/agents' : 'off (NIGRAAN_AGENTS=0)')); } catch (e) { app.agents = null; console.log('  agents     not running: ' + e.message); }   /* v91.17.283.7 */
  try { app.driveFetch = app.dropImport ? createDriveFetch(app, root, dataDir, app.dropImport.folder) : null; const ds = app.driveFetch && app.driveFetch.status(); console.log('  drive      daily river sheet from Google Drive: ' + (ds && ds.configured ? ds.kind + ' link set, checked every ' + ds.every : 'no link set (data/ffd-drive.json)')); } catch (e) { app.driveFetch = null; console.log('  drive      not started: ' + e.message); }
  try { app.pyJobs = createPyJobs(app, root, dataDir); console.log('  pyjobs     ' + (app.pyJobs.status().on ? 'PMD-EWS append every 6 h, sunshine and previous-runs archives daily' : 'off (NIGRAAN_PYJOBS=0)')); } catch (e) { app.pyJobs = null; console.log('  pyjobs     not started: ' + e.message); }
  /* v91.17.283.24 · the one-time Open-Meteo past-forecast archive for the retrain (omarchive.mjs): background tier, its own daily share, resumes, stops when complete */
  try { app.omArchive = createOmArchive({ dataDir, provider, budget: callBudget, log: (m) => console.log('  ' + m), schedule: (id, ms, fn, o) => schedule(app, id, ms, fn, o) }); const _o = app.omArchive.status(); console.log('  omarchive  ' + (!_o.on ? 'off (NIGRAAN_OM_ARCHIVE=0)' : !_o.ready ? 'not ready: ' + _o.why : _o.complete ? 'complete' : 'past-forecast archive for the retrain: ' + _o.done + ' of ' + _o.total + ' source runs held')); } catch (e) { app.omArchive = null; console.log('  omarchive  not started: ' + e.message); }
  app.state = createState(app);                  /* v91.17.283.20 · state.mjs back on the serving path: the operator part state of GET /api/point (its route /api/state/point stays retired) */
  app.pool = createPool(app);                    /* v91.17.61 */
  app.siteRisk = createSiteRisk(app, dataDir);   /* v91.17.79 */
  app.placeFacts = createPlaceFacts(app, dataDir);   /* v91.17.283 · FACTS283 · the "This place" facts part of the place bundle (GET /api/point) */
  /* == v91.17.283.48 · GUIDANCE: the "What to do here" library and matching (server/api/guidance.mjs), only with GUIDANCE_PANEL=1; its applicability
     states are the server's own GET /api/hazards/applicability, read in process (never re-derived) == */
  if (GUIDANCE_ON()) app.guidance = createGuidance(app, dataDir, { applicability: (uid) => inProcessGet(handle, '/api/hazards/applicability?uid=' + encodeURIComponent(uid)).then((r) => r.json) });
  app.floodFacts = createFloodFacts(dataDir, app.places);   /* v91.17.283.15 · river flood and hill-torrent facts per named place (data/flood-facts.json) */
  app.casebook = createCasebook(app);            /* v91.17.66 · one case document per asset; the records it stands on */
  const ai = createAI(app, root);
  const H = Object.assign({}, nationalHandlers, ingestion.handlers, createQuality(app).handlers, createGovernance(app).handlers, createWork(app).handlers);
  const missing = endpointList.filter(e => !H[e.id]).map(e => e.id);
  if (missing.length) throw new Error('backend: no handler for ' + missing.join(', '));

  let healthJobs = null; const CRITICAL_JOBS = ['national', 'flood', 'verification'];
  const rate = new Map(); let ratePruned = 0;
  /* v91.17.283 · WS1 · two limits, in this order: a cheap per-client-address limit before any token work (NIGRAAN_RATE_IP_PER_MIN, default
     4 x the per-user rate: one address can carry several people, an office or a tunnel), then authentication, then the per-user limit
     (NIGRAAN_RATE_PER_MIN). Separate key spaces (ip: / user: / anon:), so a flood of unauthenticated requests never spends a signed
     user's budget, and an unauthenticated flood is now limited at all (it was 401 + an audit write per request, never 429). */
  const ratePerMin = () => Number(process.env.NIGRAAN_RATE_PER_MIN || 600);
  const ipPerMin = () => Number(process.env.NIGRAAN_RATE_IP_PER_MIN) || 4 * ratePerMin();
  function limit(key, perMin = ratePerMin()) {
    const now = Date.now();
    /* v91.17.212 · audit S-29 · windows older than 2 minutes are dropped (at most once a minute), so the map cannot grow for the life of the process */
    if (now - ratePruned > 60e3) { ratePruned = now; for (const [k, v] of rate) if (now - v.t > 120e3) rate.delete(k); }
    const w = rate.get(key) || { t: now, n: 0 };
    if (now - w.t > 60e3) { w.t = now; w.n = 0; }
    w.n++; rate.set(key, w);
    if (w.n > perMin) throw new ApiError(429, 'RATE_LIMITED', 'Request rate exceeded.', { retryable: true });
  }
  async function readBody(req) {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 5 * 1024 * 1024) throw new ApiError(413, 'CONTRACT_INVALID', 'Request body exceeds 5 MB.'); chunks.push(c); }
    if (!size) return {};
    let j; try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(422, 'CONTRACT_INVALID', 'Body is not valid JSON.'); }
    const ENV_KEYS = ['data', 'apiVersion', 'contract', 'requestId', 'traceId', 'tenantId', 'actor'];
    return j && typeof j === 'object' && !Array.isArray(j) && j.data && typeof j.data === 'object' && Object.keys(j).every(k => ENV_KEYS.includes(k)) ? j.data : j;
  }
  /* v91.17.283 · INTEG (permanent S2) · the operator boards that name folders (accuracy log, copies, drop folder, engine archive) give each
     folder relative to the folder that holds nigraan-local, never as an absolute install path */
  const INSTALL_PARENT = resolve(dataDir, '..', '..');
  const ABS = /^(?:[A-Za-z]:[\\/]|\/)/;
  const relPaths = (x, d = 0) => { if (d > 12 || x == null) return x; if (typeof x === 'string') { const n = x.split('\\').join('/'), ip = INSTALL_PARENT.split('\\').join('/');
      return ABS.test(x) && (n === ip || n.toLowerCase().startsWith(ip.toLowerCase() + '/')) ? relative(INSTALL_PARENT, x).split('\\').join('/') || '.' : x; }
    if (Array.isArray(x)) return x.map((v) => relPaths(v, d + 1)); if (typeof x === 'object') { const o = {}; for (const [k, v] of Object.entries(x)) o[k] = relPaths(v, d + 1); return o; } return x; };
  const REL_PATH_ROUTES = new Set(['/api/accuracy', '/api/ops/accuracy', '/api/ops/copies', '/api/ops/drive', '/api/ops/engine']);
  /* ══ v91.17.283.38 · item 4 · THE DISTRICT ANSWER IS KEPT READY ═════════════════════════════════════════════════════════════════
     Live 30 Oct: every analyst open asked /api/point/batch?with=inputs for all district points: 24.4 s and 1.9 MB, then scrubbed for the
     customer on the server's one thread. The answer is the same for every page of the same bundle stamp, so it is kept: per place list
     (the page sends the same district points each time) and view, the final bytes of the answer of the current stamp. A stamp change
     (each PKT hour, a new run, new issued levels) is followed by a rebuild in the background (checked every 2 minutes) so the next page
     gets it at once; a request that arrives during a rebuild waits for it (never an answer of another stamp). The last list is kept in
     data/cache/district-batch.json so a restarted server builds it 2 minutes after start. At most 4 lists are kept. */
  const DIST = new Map(), DIST_FILE = join(dataDir, 'cache', 'district-batch.json');
  const distKey = (q, view) => view + '|' + q;
  async function districtBuild(q, pts, view) {
    const k = distKey(q, view); let e = DIST.get(k); if (!e) { if (DIST.size >= 4) DIST.delete(DIST.keys().next().value); DIST.set(k, e = { q, pts, view, stamp: null, bytes: null, building: null, at: 0, ms: 0 }); }
    if (e.building) return e.building;
    const stamp = app.point.stamp(), t0 = Date.now();
    e.building = (async () => { const r = await app.point.batch(pts, { with: ['inputs'], view }); const obj = { ok: true, n: r.length, states: r };
      let b; if (view === 'operator') b = Buffer.from(JSON.stringify(obj)); else { const b0 = Buffer.from(JSON.stringify(customerScrub(obj))); let b1 = null; try { b1 = agencyBody(b0, 'application/json'); } catch (_) { b1 = null; } b = b1 || b0; }
      e.stamp = stamp; e.bytes = b; e.at = Date.now(); e.ms = Date.now() - t0; return e; })().finally(() => { e.building = null; });
    return e.building;
  }
  async function districtServe(res, q, pts, view) {
    const k = distKey(q, view); let e = DIST.get(k);
    try { if (!e || !e.bytes || e.stamp !== app.point.stamp()) e = await districtBuild(q, pts, view); } catch (err) { return send(res, 200, { ok: false, why: 'the district records are not available: ' + clientWhy(err) }); }
    try { if (view === 'customer') writeFileSync(DIST_FILE, JSON.stringify({ at: new Date().toISOString(), q })); } catch (_) {}
    res.__agnClean = view === 'customer';   /* the bytes are already the customer answer (server.mjs installAgencyScrub leaves them) */
    res.writeHead(200, { 'content-type': 'application/vnd.agn+json; charset=utf-8', 'content-length': e.bytes.length, 'cache-control': 'no-store', 'x-agn-api-version': API_VERSION, 'x-agn-district-cache': e.stamp === app.point.stamp() ? 'ready' : 'built' });
    res.end(e.bytes);
  }
  const districtTick = () => { try { if (!app.point) return; const st = app.point.stamp(); for (const e of DIST.values()) if (e.stamp !== st && !e.building) districtBuild(e.q, e.pts, e.view).catch(() => {}); } catch (_) {} };
  if (process.env.NIGRAAN_DISTRICT_CACHE !== '0') {
    const t1 = setInterval(districtTick, 120e3); if (t1.unref) t1.unref();
    const t2 = setTimeout(() => { try { const j = JSON.parse(readFileSync(DIST_FILE, 'utf8')); const q = String(j.q || ''); const pts = q.split(';').map((x) => x.trim()).filter(Boolean).map((x) => { const [a, b] = x.split(',').map(Number); return { lat: a, lon: b, floor: null }; });
      if (pts.length && pts.length <= 600 && pts.every((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon)) && app.point && !DIST.size) districtBuild(q, pts, 'customer').catch(() => {}); } catch (_) {} }, Number(process.env.NIGRAAN_DISTRICT_WARM_MS || 120e3)); if (t2.unref) t2.unref();
  }
  function send(res, status, obj, extra = {}) {
    if (res.__relPaths && obj && typeof obj === 'object') obj = relPaths(obj);
    const b = Buffer.from(JSON.stringify(obj));
    res.writeHead(status, Object.assign({ 'content-type': 'application/vnd.agn+json; charset=utf-8', 'content-length': b.length, 'cache-control': 'no-store', 'x-agn-api-version': API_VERSION }, extra));
    res.end(b);
  }

  /* v91.17.34 · AUDIT A8 · a missing lat or lon was Number(null) = 0 and passed isFinite, so
     /api/mos/point and /api/glof/upstream (both retired in v283.19) answered for the point (0, 0). The coordinate must be
     present, finite and inside the window this build covers. */
  const coord = (q) => { if (!q.has('lat') || !q.has('lon')) return { error: 'lat and lon required' };
    const lat = Number(q.get('lat')), lon = Number(q.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { error: 'lat and lon must be numbers' };
    if (lat < 20 || lat > 40 || lon < 58 || lon > 82) return { error: 'coordinate outside the window this build covers (20-40 N, 58-82 E)', outside: true };
    return { lat, lon }; };
  /* loopback, or a signed token that carries an operator scope: a viewer token must not start paid jobs */
  /* v91.17.283 · WS1 · the forwarding headers that mark a relayed request (the same list as server.mjs PROXY_HEADERS): a loopback request
     carrying any of them was relayed for someone else and is neither the operator nor an internal caller */
  const FWD_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-server', 'forwarded', 'x-real-ip', 'via',
    'cf-connecting-ip', 'cf-ray', 'true-client-ip', 'x-client-ip', 'x-cluster-client-ip', 'fastly-client-ip', 'x-original-forwarded-for', 'x-azure-clientip'];
  let SCORE_M = { mt: 0, v: null };   /* v91.17.275 · the monthly score file, re-read when it changes */
  /* v91.17.283 · INTEG (S1b) · a request the front proxy relayed from an address that is not this computer (x-agn-proxy-client, set by
     proxy.mjs) is never local, whatever Host header it carries */
  const viaProxyFromAfar = (req) => req.headers['x-agn-via-proxy'] != null && req.headers['x-agn-proxy-client'] != null && !/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(String(req.headers['x-agn-proxy-client']));
  const localOrSigned = (req) => { const remote = req.socket.remoteAddress || ''; if (viaProxyFromAfar(req)) return false; /* v91.17.101 · audit L5 · the page in customer mode marks every API call (x-agn-view: customer): on a one-computer install the customer view is ALSO loopback, and loopback alone must not unlock operator data */ if (String(req.headers['x-agn-view'] || '').toLowerCase() === 'customer') return false; if (/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(remote) && !FWD_HEADERS.some(h => req.headers[h] != null) && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(String(req.headers.host || ''))) return true;   /* v91.17.126 · S-22 · a loopback request relayed by a proxy, or addressed to a non-loopback host name, is not the operator */ try { const who = identity.resolve(req); const sc = (who && who.scopes) || [], rl = (who && who.roles) || []; return !!who && (sc.includes('*') || sc.some(x => /^(ops|admin)/.test(String(x)) || /^ingest[a-z-]*:(write|run|admin)/.test(String(x))) || rl.some(x => /admin|operator|ops/i.test(String(x)))); } catch { return false; } };
  /* v91.17.172 · audit O-2 · the page on this computer, whatever its view: a loopback socket, a loopback Host and no proxy header.
     Used where the customer view of the local page must work (the asset-limit check on Operations); a relayed request is not it. */
  const loopbackDirect = (req) => { const remote = req.socket.remoteAddress || ''; if (viaProxyFromAfar(req)) return false; return /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(remote) && !FWD_HEADERS.some(h => req.headers[h] != null) && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(String(req.headers.host || '')); };
  /* v91.17.283 · WS1 · C-01 · a forged engine report was accepted through the front proxy: the route checked only that the SOCKET was
     loopback, and every request the proxy (8787) relays, a tunnel's included, arrives from 127.0.0.1. An internal caller is now either
       - a caller holding this server's runtime token (x-agn-internal-token = NIGRAAN_INTERNAL_TOKEN, made fresh by server.mjs at each
         start and inherited only by the processes it starts; never written to disk), or
       - a direct loopback connection to this server's own port: loopback socket, loopback Host, no forwarding header, and NOT relayed by
         the front proxy (proxy.mjs marks every request it relays with x-agn-via-proxy and drops any such header a client sent).
     The engine runner (server/engine/vmpage.mjs, or the headless browser at http://127.0.0.1:<PORT>/?engine=1) talks to the server's own
     port, never to the proxy, so it is unaffected. */
  const internalCaller = (req) => {
    const tok = String(process.env.NIGRAAN_INTERNAL_TOKEN || ''), h = String(req.headers['x-agn-internal-token'] || '');
    if (tok && h && h.length === tok.length && timingSafeEqual(Buffer.from(h), Buffer.from(tok))) return true;
    return loopbackDirect(req) && req.headers['x-agn-via-proxy'] == null; };
  /* the client address for the per-IP request limit: the socket, or, on a loopback socket (the front proxy, a tunnel on this machine),
     the address the nearest relay put in its header (cf-connecting-ip, true-client-ip, x-real-ip, the last x-forwarded-for hop) */
  /* v91.17.283.54 · the public edge (Oracle nginx over Tailscale) is a trusted front proxy too: without this every Vercel visitor
     shared ONE rate-limit bucket keyed by the edge's Tailscale address, and busy hours answered 429 for everyone. The trusted set is
     loopback plus NIGRAAN_TRUSTED_PROXIES (comma-separated addresses; default: the Tailnet 100.64.0.0/10, this installation's own). */
  const TRUSTED_PROXY = (() => { const extra = String(process.env.NIGRAAN_TRUSTED_PROXIES || '').split(',').map((x) => x.trim()).filter(Boolean);
    return (a) => { const ip = String(a || '').replace(/^::ffff:/, ''); if (/^(127\.0\.0\.1|::1)$/.test(ip)) return true; if (extra.includes(ip)) return true;
      const m = /^100\.(\d+)\./.exec(ip); return !!m && Number(m[1]) >= 64 && Number(m[1]) <= 127; }; })();
  const clientIp = (req) => { const remote = req.socket.remoteAddress || ''; if (!TRUSTED_PROXY(remote)) return remote;
    const h = req.headers; const xf = String(h['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    /* xf[0] before x-real-ip: the Oracle edge writes x-real-ip as the Vercel relay's own egress address (shared by every visitor);
       the first x-forwarded-for hop is the visitor Vercel saw. */
    return String(h['cf-connecting-ip'] || h['true-client-ip'] || xf[0] || h['x-real-ip'] || remote).slice(0, 64); };
  /* v91.17.283 · WS1 · the public AI status: whether the assistant runs, how (language model or data look-up), whether data leaves this
     machine, and the customer descriptions of the models. No provider or model name, no firewall, model store or key-file detail. */
  const publicAiStatus = (s) => { s = s || {}; const M = s.models || {}, T = M.temperature, A = M.analyst, llm = s.mode === 'llm';
    return { configured: !!s.configured, mode: llm ? 'llm' : 'retrieval', provider: llm ? (s.local === false ? 'cloud language model' : 'local language model') : 'retrieval', model: null,
      local: s.local !== false, dataLeavesMachine: !!s.dataLeavesMachine, reachable: s.reachable !== false,
      models: { temperature: T ? { name: T.name, live: !!T.live, does: T.does, where: T.where, badge: T.badge } : null,
        analyst: A ? { name: A.name, mode: A.mode, local: A.local !== false, runs: A.runs } : null, planned: Array.isArray(M.planned) ? M.planned : [] },
      scope: 'public' }; };
  /* v91.17.283 · WS1 for WS4 · GET /api/levels and /api/alerts as served (server/api/served.mjs rules, the gate's client_rules): for a
     client a hidden layer (owner decision B: local-rain flooding) is not served, a substituted layer (client "flood" = river flooding)
     is served from its source layer with the note, every answer names its product type, the missing-level codes carry their reasons
     (-2 is "not assessed (outside the method's range)", never "not applicable"), and an alert on a level that may not alert is withheld
     with the reason. The operator view is the engine's record, annotated the same way. */
  /* v91.17.283 · WS1 · PATCH3 · FRESHNESS LABEL: every served level and alert names the provider model runs (UTC) it was derived from: the run
     keys of the forecast bodies the engine read before its report (server.mjs engineRunRead), kept with that report (data/engine-latest-run.json).
     A report the label was not recorded for says so; it is never given a newer run than it was made from. */
  const RUNF = join(dataDir, 'engine-latest-run.json'); let ENGINE_RUN = null; try { ENGINE_RUN = JSON.parse(readFileSync(RUNF, 'utf8')); } catch (_) { ENGINE_RUN = null; }
  const engineRunNote = () => { try { const L = app.engine && app.engine.latest(); if (!L) return; const lab = app.engineRunRead ? app.engineRunRead() : null;
    ENGINE_RUN = { received: L.received, ...(lab || { runs: null, why: 'the engine read no forecast body through this server since its last report' }) }; writeFileSync(RUNF, JSON.stringify(ENGINE_RUN)); } catch (_) {} };
  const modelRunOf = () => { const L = app.engine && app.engine.latest(); if (!L) return null;
    if (ENGINE_RUN && ENGINE_RUN.received === L.received) { const { received, ...r } = ENGINE_RUN; return staleRuns(r); }
    return { runs: null, why: 'not recorded for this report (made before v91.17.283 PATCH3, or posted by a page)' }; };
  /* v91.17.283.47 · NIGRAAN 1.0.8 item 3 · a model in the label whose provider published no new run for two of its own update intervals (meta.json
     update_interval_seconds) is named as stale: the provider stopped that model (2 Nov: dwd_icon_eps, ICON-EPS, last run 2026-10-06, a
     probability member of best_match) and the label must not read as current. "newest" / "oldest" are kept; "staleDomains" lists them. */
  const staleRuns = (r) => { try { const MS = app.modelRuns && app.modelRuns.status ? app.modelRuns.status() : null; if (!r || !r.runs || !MS || !MS.domains) return r;
      const st = []; for (const [d, runs] of Object.entries(r.runs)) { const e = MS.domains['forecast|' + d] || MS.domains['ensemble|' + d]; const t = e ? Date.parse(e.available || e.run || '') : NaN;
        if (e && e.intervalH && Number.isFinite(t) && Date.now() - t > 2 * e.intervalH * 3600e3) st.push({ domain: d, run: e.run, available: e.available, intervalH: e.intervalH, sinceH: Math.round((Date.now() - t) / 3600e3) }); }
      return st.length ? { ...r, staleDomains: st, staleWhy: 'the provider has published no new run of ' + st.map((x) => x.domain + ' (last ' + String(x.run).slice(0, 16) + ' UTC)').join(', ') + ' for more than two of its own update intervals' } : r; } catch (_) { return r; } };
  const withRun = (r) => (r && typeof r === 'object' && r.ready !== false ? { ...r, modelRun: modelRunOf() } : r);
  const servedLevels = (layer, day, op) => withRun(servedLevels0(layer, day, op));
  /* v91.17.283.47 · NIGRAAN 1.0.8 item 4 · AIR QUALITY ON /api/levels. The map offered "Air quality" but /api/levels had no 'aqi' layer
     (the engine issues no air-quality level), so the coverage line and the key read "none". The answer here is the SERVED value of every
     tehsil (smog.mjs: the US EPA AQI 2024 of the day's served mean PM2.5 / PM10, the value /api/smog/unit serves), in the levels shape the
     map reads: each cell is the EPA AQI category index of that value (the published US EPA classes, never Normal..Severe), kind 'value',
     no alert, not counted as a hazard anywhere (never part of the all-layer answer). A tehsil without a served value is -1 with the reason. */
  let AQC = null;
  const aqiLayer = (day) => { const d = Math.max(0, Math.min(6, Number(day) || 0)); const date = new Date(Date.now() + 5 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
    let st = null; try { st = app.smog && app.smog.status ? app.smog.status() : null; } catch (_) { st = null; }
    const key = date + '|' + (st && st.at); if (AQC && AQC.key === key && Date.now() - AQC.t < 5 * 60e3) return AQC.v;
    const W = ['Good', 'Moderate', 'Unhealthy for sensitive groups', 'Unhealthy', 'Very unhealthy', 'Hazardous'];
    const levels = {}, values = {}, facts = {}, why = {}, keys = {}; let at = null, stale = null, n = 0;
    for (const u of ((app.units && app.units.tehsil) || []).filter((x) => !x.disputed)) { keys[u.unitId] = u.key != null ? u.key : u.unitId; let r = null; try { r = app.smog.unit(u.unitId); } catch (_) { r = null; }
      if (r && r.at) { at = r.at; stale = r.stale ?? stale; } const row = r && Array.isArray(r.days) ? r.days.find((x) => x && x.date === date) : null;
      const c = row && row.aqiCategory ? W.indexOf(row.aqiCategory) : -1;
      if (!row || !Number.isFinite(+row.aqi) || c < 0) { levels[u.unitId] = -1; why[u.unitId] = 'not available: no served air-quality value for this tehsil on ' + date + (r ? '' : ' (the air-quality run has not covered it)'); continue; }
      levels[u.unitId] = c; values[u.unitId] = +row.aqi; facts[u.unitId] = { aqi: +row.aqi, category: row.aqiCategory, pollutant: row.aqiPollutant || null, pm25: row.pm25 ?? null, pm10: row.pm10 ?? null, basis: row.pm25Basis || null }; n++; }
    const tot = Object.keys(levels).length;
    const v = { ready: tot > 0, layer: 'aqi', kind: 'value', name: 'Air quality (US EPA AQI)', words: W, ownScale: true, direction: 'higher index = worse air', date, day: d,
      levels, values, facts, why, keys, states: stateCounts(levels), stateOf: STATE_CODES, stateLabel: STATE_LABEL, code: codeDict(), at, stale,
      coverage: { withValue: n, tehsils: tot, line: n + ' of ' + tot + ' tehsils have an air-quality value' + (tot - n ? ' \u00b7 ' + (tot - n) + ' not available' : '') },
      basis: 'US EPA AQI (2024 breakpoints) of the served daily mean PM2.5 and PM10 (composition forecast with the station correction where held)', canAlert: false, productType: 'Value',
      noLevel: 'a value with its US EPA class, not a hazard level: it raises no alert and is not counted as a hazard' };
    if (!tot) v.why = 'not assessed: the air-quality run has not been made yet';
    AQC = { key, t: Date.now(), v }; return v; };
  /* v91.17.283.47 · NIGRAAN 1.0.8 item 5 · A LAYER WHOSE INPUTS ARE NOT CURRENT says so as a whole: when none of its tehsils has a current
     value (every assessable cell "input not current", -6), the answer carries availability { state: 'temporarily_unavailable', lastGood }
     (the issue time of the last answer that had current values, kept in data/layer-lastgood.json over a restart); the customer gets the
     state and the last good run time, the operator also the full reason. A layer with some current cells is 'current'. */
  const LGF = join(dataDir, 'layer-lastgood.json'); let LG = null; const lgRead = () => { if (LG) return LG; try { LG = JSON.parse(readFileSync(LGF, 'utf8')) || {}; } catch (_) { LG = {}; } return LG; };
  let LGW = 0; const lgNote = (layer, at) => { const G = lgRead(); if (!at || G[layer] === at) return; G[layer] = at; if (Date.now() - LGW < 60e3) return; LGW = Date.now(); try { writeFileSync(LGF + '.tmp', JSON.stringify(G)); renameSync(LGF + '.tmp', LGF); } catch (_) {} };
  const availability = (layer, r, states, op) => { try { const L = r && r.levels ? Object.values(r.levels) : []; if (!L.length) return {};
      const nc = L.filter((c) => c === -6).length, cur = L.filter((c) => c >= 0 || c === -5).length;
      if (cur > 0) { lgNote(layer, r.received || r.at || null); return { availability: { state: 'current' } }; }
      if (!nc) return {};
      const W = Object.entries(r.whys || {}).filter(([u]) => r.levels[u] === -6).map(([, w]) => w); const top = W.length ? Object.entries(W.reduce((a, w) => { a[w] = (a[w] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1])[0][0] : null;
      const lastGood = lgRead()[layer] || null;
      /* no answer with current values seen by this server yet: the date of the last complete result the cells themselves carry (facts.asOf) */
      const asOfs = Object.entries(r.facts || {}).filter(([u]) => r.levels[u] === -6).map(([, f]) => f && f.asOf).filter(Boolean); const asOf = asOfs.length ? asOfs.sort().slice(-1)[0] : null;
      return { availability: { state: 'temporarily_unavailable', words: 'Temporarily unavailable', lastGood, ...(asOf ? { lastCompleteResult: asOf } : {}), lastGoodText: lastGood ? 'last good run ' + new Date(Date.parse(lastGood) + 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' PKT' : asOf ? 'last complete result ' + asOf : 'no good run held since this server started', notCurrent: nc, of: L.length, ...(op ? { reason: top } : {}) } }; } catch (_) { return {}; } };
  /* v91.17.283.47 · owner rule 2 Nov 01:15 PKT · the hazards that physically cannot happen at the place, in ONE short line for the place card
     ("Not relevant here: river flood, landslide, cyclone, GLOF") instead of rows: every day-0 layer of the tehsil at -4 and every reference
     layer marked cannotHappen. Never counted anywhere else. */
  const NR_NAME = { flood_riverine: 'river flood', flood: 'flood', flood_pluvial: 'local-rain flood', landslide: 'landslide', glof: 'GLOF', cyclone: 'cyclone' };
  const notRelevantOf = (U, ref) => { try { const d0 = (U.days || []).find((d) => d.day === 0) || (U.days || [])[0]; const ks = [];
      for (const [k, v] of Object.entries((d0 && d0.layers) || {})) if (v && v.level === -4 && NR_NAME[k]) ks.push(k);
      for (const [k, v] of Object.entries(ref || {})) if (v && v.cannotHappen && NR_NAME[k]) ks.push(k);
      const names = [...new Set(ks.filter((k) => !(k === 'flood' && ks.includes('flood_riverine'))).map((k) => NR_NAME[k]))];
      return names.length ? { notRelevant: { layers: ks, names, line: 'Not relevant here: ' + names.join(', ') } } : { notRelevant: { layers: [], names: [], line: null } }; } catch (_) { return {}; } };
  const servedLevels0 = (layer, day, op) => {
    const R = op ? { ready: true, hidden_layers: {}, substitute: {} } : clientRules(app), H = R.hidden_layers || {}, SUB = R.substitute || {};
    /* v91.17.283.8 · audit 10 · the code dictionary names -3 (no modelled river reach), as the engine's own and the unit answer do */
    const code = codeDict();   /* v91.17.283.35 · D1: every code -1 .. -6 with its text (states.mjs) */
    /* v91.17.283.8 · audit 2 · gate missing or unreadable: no client level (fail closed), never the raw layer */
    if (!R.ready) return { ready: false, gateUnavailable: true, ...(layer ? { layer } : {}), day: Number(day) || 0, why: 'not assessed (' + NOT_ASSESSED.gate + ')', code };
    /* v91.17.283.31 · items 1.2, 1.3 · the reference layers: fixed products with their own classes, never an issued daily level */
    /* the issued run's envelope rides along (issueId, revision, stale, validUntil...) so a page keyed on the issued run treats these answers
       like any layer answer; the classes themselves are not from the run (kind says so) */
    const runEnv = () => { try { const r = app.engine.levels(null, day, op); if (!r || !r.ready) return {}; const o = {}; for (const k of ['issueId', 'revision', 'received', 'stale', 'validUntil', 'build', 'gate', 'serverBuild', 'serverGate']) if (k in r) o[k] = r[k]; return { ...o, issuedRun: { at: r.at, issueId: r.issueId } }; } catch (_) { return {}; } };
    if (layer && REF_LAYERS.includes(layer)) { const L = app.refLayers.layer(layer); return { ...runEnv(), ...L, day: Number(day) || 0, sameEveryDay: true }; }
    if (layer === 'rain_amount') return { ...runEnv(), ...app.rainAmount.layer(day) };   /* v283.31 · item 2.4 */
    if (layer === 'wind_gust') return { ...runEnv(), ...app.rainAmount.gustLayer(day) };
    if (layer === 'aqi') return { ...runEnv(), ...aqiLayer(day) };   /* v91.17.283.47 · item 4: the served air quality values (no hazard level) */   /* v91.17.283.41 · item 4: the gust value map (display bins, no level) */
    if (!layer) { const r = app.engine.levels(null, day, op); if (!r || !r.ready || !r.layers) return r;
      const L = {}; for (const [k, v] of Object.entries(r.layers)) { if (k in H) continue; L[k] = v; }
      for (const [k, sv] of Object.entries(SUB)) if (r.layers[sv.from]) L[k] = { ...r.layers[sv.from], from: sv.from, basis: sv.note };
      try { const A = app.rainAmount.layer(day); L.rain_amount = A && A.ready ? { kind: 'amount', counts: A.counts, words: A.words } : { kind: 'amount', ready: false, why: A && A.why }; } catch (_) {}
      for (const k of REF_LAYERS) { const Rf = app.refLayers.layer(k); L[k] = Rf && Rf.ready ? { kind: 'reference', counts: Rf.counts, states: Rf.states, words: Rf.words } : { kind: 'reference', ready: false, why: Rf && Rf.why }; }
      const days = Array.isArray(r.days) ? r.days.map((d) => (d && Array.isArray(d.layers) ? { ...d, layers: [...new Set(d.layers.concat(REF_LAYERS, ['rain_amount']))] } : d)) : r.days;
      return { ...r, days, layers: L, reference: REF_LAYERS, ...(Object.keys(H).length ? { hidden: Object.entries(H).map(([k, why]) => ({ layer: k, why })) } : {}) }; }
    if (layer in H) return { ready: false, hidden: true, layer, why: H[layer] };
    const sv = SUB[layer], r = app.engine.levels(sv ? sv.from : layer, day, op); if (!r || !r.ready) return r;
    let pt = null; try { pt = levelTag(app, layer, null).productType; } catch (_) {}
    /* v91.17.283.31 · item 4.3 · FOUR MAP STATES, one per cell, never Normal for unknown: value (a level), not_applicable (-2 outside the
       hazard's mask or the method's range, -3 no modelled river reach, -4 cannot happen here), not_tested (-5 the model has not passed its
       test here), missing (-1 the data failed), input_not_current (-6 an input does not cover the day or is too old; its age in the reason) */
    const states = stateCounts(r.levels);
    /* Heat and cold levels are ranks. The number beside each rank is the same UTCI the place card prints
       (the tehsil's hottest or coldest shade hour), which the national list had not been carrying. */
    const shadeValues = () => {
      if (layer !== 'heat' && layer !== 'cold') return {};
      try {
        const latest = app.engine.latest();
        const d = latest && Array.isArray(latest.days) ? latest.days.find((x) => x.day === (Number(day) || 0)) : null;
        const X = d && d.layers && d.layers[sv ? sv.from : layer];
        const bag = X && (layer === 'heat' ? X.hottest : X.coldest);
        if (!bag || typeof bag !== 'object') return {};
        const values = {};
        for (const [uid, point] of Object.entries(bag)) {
          if (point && Number.isFinite(point.utciC)) values[uid] = Math.round(point.utciC * 10) / 10;
        }
        return Object.keys(values).length ? { values, valueUnit: '°C' } : {};
      } catch (_) { return {}; }
    };
    return { ...r, layer, ...(sv ? { from: sv.from, basisNote: sv.note } : {}), productType: pt, code, states, stateOf: STATE_CODES, stateLabel: STATE_LABEL, ...shadeValues(), ...availability(layer, r, states, op) };
  };
  const servedAlerts = (A, op) => withRun(servedAlerts0(A, op));
  const servedAlerts0 = (A, op) => {
    if (!A || !A.ready || !Array.isArray(A.rows)) return A;
    const CR = op ? { ready: true, hidden_layers: {} } : clientRules(app);
    /* v91.17.283.8 · audit 2 · gate missing or unreadable: every row withheld with the reason (fail closed) */
    if (!CR.ready) { const { gateDropped, ...A2 } = A; return { ...A2, count: 0, rows: [], gateUnavailable: true, alertsWithheld: A.rows.map((a) => ({ hazard: a && a.hazard, name: a && a.name, why: NOT_ASSESSED.gate })) }; }
    const H = CR.hidden_layers || {}, keep = [], withheld = [];
    const aDay = A.ctx && Number.isInteger(A.ctx.day) ? A.ctx.day : 0, keyOfName = (n) => { try { const L = app.engine.latest(); const K = (L && L.unitKeys) || {}; const hit = Object.keys(K).find((u) => u.split('|').slice(1).includes(String(n))); return hit || null; } catch (_) { return null; } };
    for (const a of A.rows) { const hz = a && a.hazard; const W = ['Normal', 'Low', 'Moderate', 'High', 'Severe']; const lvl = alertLevelWord(a, W);
      let t = null; try { t = hz ? levelTag(app, hz, lvl, { day: a.day != null ? a.day : aDay, uid: a.uid || a.unitId || keyOfName(a.name) }) : null; } catch (_) {}
      const rw = riverAlertWhy(app, a, a.uid || a.unitId || keyOfName(a.name), a.day != null ? a.day : aDay);   /* v283.36 item 21 */
      const why = hz && hz in H ? H[hz] : (hz && NO_CLIENT_ALERT[hz]) ? NO_CLIENT_ALERT[hz] : rw ? rw : (t && t.model && !t.canAlert) ? (t.why || (t.productType || 'this level') + ': display only, raises no alerts') : null;
      if (why) withheld.push({ ...a, withheldWhy: why }); else keep.push(a); }
    if (op) return { ...A, rows: A.rows.map((a) => withheld.some((w) => w.name === a.name && w.hazard === a.hazard && w.sev === a.sev) ? { ...a, clientWithheld: true } : a) };
    const gd = (A.gateDropped || []).map((w) => ({ hazard: w.hazard, name: w.name, why: w.why }));   /* v91.17.283 · INTEG: rows the engine's re-gate left out */
    const { gateDropped, ...A2 } = A;
    return { ...A2, count: keep.length, rows: keep, ...(withheld.length || gd.length ? { alertsWithheld: withheld.map((w) => ({ hazard: w.hazard, name: w.name, why: w.withheldWhy })).concat(gd) } : {}) };
  };
  /* v91.17.172 · audit E-3/E-14 · a customer response: the page says so (x-agn-view: customer), or the caller is neither the operator
     on this machine nor a signed operator and internal QA naming is off. Operator and internal views keep the supplier names. */
  /* v91.17.283.12 · client view by default (audit C4): what a page SHOWS is the operator's only on explicit opt-in. A loopback request is
     still allowed to run operator actions (localOrSigned), but operator CONTENT needs the operator capability AND the page's explicit
     operator view (x-agn-view: operator, sent only in operator mode); no header is the client view */
  const viewOp = (req) => localOrSigned(req) && String(req.headers['x-agn-view'] || '').toLowerCase() === 'operator' && gate.open(req);
  const customerView = (req) => String(req.headers['x-agn-view'] || '').toLowerCase() === 'customer' || !(internalNames() || viewOp(req));
  /* v283.10 · the AI weather models in the pool are shadow-only (pool.mjs AI_SHADOW): the full pool only on an operator's explicit
     ai=1 and never in the customer view; otherwise undefined, so pool.mjs serves its default (non-AI unless NIGRAAN_POOL_AI=1) */
  const poolAi = (req, url) => (url.searchParams.get('ai') === '1' && !customerView(req)) ? true : undefined;
  /* v91.17.71 · internal QA on this machine: loopback AND the machine's own token secret in x-agn-qa. One rule, used by
     /api/skill (the full sheet) and by /api/ai/chat (the A/B model hook of scripts/ai-bench.mjs). */
  const qaOkOf = (req) => { try { const remote = req.socket.remoteAddress || ''; if (!/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(remote)) return false; const h = String(req.headers['x-agn-qa'] || ''); if (!h) return false; const sec = readFileSync(join(dataDir, 'token-secret'), 'utf8').trim(); return !!sec && h === sec; } catch { return false; } };
  const intIn = (v, lo, hi, dflt) => { if (v == null || v === '') return dflt; const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
  /* v91.17.283.19 · the climatology baseline of a point (was the /api/climatology/baseline route, now a part of the place bundle,
     GET /api/point): the unit the point lies in, its hot-season 90th-percentile daily maximum, cold-season minimum and engineering readiness */
  function climBaseline(c) {
    /* v91.17.70 · the unit the point lies IN (unitresolve.mjs), not the nearest centroid (Hattar SEZ used to read Taxila's baseline) */
    let best = null, bd = Infinity, _by = null; try { const _r = unitAtPoint(app, c.lat, c.lon); if (_r) { best = _r.unit; _by = _r.by; bd = ((_r.km || 0) / 111) ** 2; } } catch (_) {}
    if (!best) for (const u of app.units.tehsil) { if (u.lat == null) continue; const d = (u.lat - c.lat) ** 2 + ((u.lon - c.lon) * Math.cos(c.lat * Math.PI / 180)) ** 2; if (d < bd) { bd = d; best = u; _by = 'nearest centroid'; } }
    if (!best || !app.climatology.ready()) return { ready: false, why: best ? 'climatology not built' : 'no unit near this point' };
    let hot = null, hotDoy = null, cold = null, coldDoy = null, pr = null, shifted = false;
    for (let doy = 1; doy <= 366; doy++) { const iso = new Date(Date.UTC(2021, 0, doy)).toISOString().slice(0, 10); const t = app.climatology.thresholds(best.unitId, iso); if (!t) continue;
      if (t.tx90 != null && (hot == null || t.tx90 > hot)) { hot = t.tx90; hotDoy = iso.slice(5); } if (t.tn10 != null && (cold == null || t.tn10 < cold)) { cold = t.tn10; coldDoy = iso.slice(5); } if (t.pr3_99 != null && (pr == null || t.pr3_99 > pr)) pr = t.pr3_99; if (t.basisShiftC) shifted = true; }
    if (hot == null) return { ready: false, why: 'no climatology row for ' + best.unitId };
    return { ready: true, source: 'climatology baseline (data/climatology.json)', unit: best.unitId, name: best.name || best.tehsil || best.unitId, km: Math.round(Math.sqrt(bd) * 111 * 10) / 10, resolvedBy: _by,
      t95: hot, t95Basis: { statistic: '90th percentile of daily maximum temperature in the hottest 15-day window of the year (around ' + hotDoy + ')', measurand: 'daily maximum air temperature', unit: '\u00b0C', n: 30, nUnit: 'years', windowFrom: '1991-01-01', windowTo: '2020-12-31',
        source: 'ERA5 ' + ((app.climatology && app.climatology.status && (app.climatology.status().periods||{}).tx90) || (app.climatology && app.climatology.status && app.climatology.status().period) || '1991-2020') + ' daily archive at the tehsil elevation' + (shifted ? ', moved onto the served basis by ' + label('calibration') + ' (tier B, ' + label('network') + ')' : '') + ' (data/climatology.json)', tier: shifted ? 'B' : null, isClimatology: true,   /* v91.17.71 · "station basis" only when the shift was applied */ why: 'a multi-decadal percentile for this unit: the baseline a scenario offset belongs on. A 90th-percentile daily maximum, not a 95th-percentile daily mean - the rated limit of an asset is a maximum-temperature limit, so this is the comparable statistic' },
      tn10min: cold, tn10minDoy: coldDoy, pr3_99max: pr, stationCalibrated: shifted, caveat: 'ERA5 is a reanalysis; in the northern valleys it runs cold' + (shifted ? ' and the ' + label('calibration') + ' corrects the level, not the shape' : '') + '. A design value still needs the extremes analysis on the station record.',
      engineering: engineeringReadiness({ hot, hotDoy, cold, coldDoy, shifted }) };
  }
  /* v91.17.71 · the Engineering climate conditions readiness at this unit, from what this build holds. Each row is keyed by
     the client's row name (engineeringRows() in the page); status is Blocked / Partial, never a design value. */
  function engineeringReadiness(c) {
    const R = (() => { try { return JSON.parse(readFileSync(join(dataDir, 'engineering-references.json'), 'utf8')); } catch (_) { return null; } })();
    const wb = R && R.references && R.references.wet_bulb_temperature_2m;
    const wbLv = wb && Array.isArray(wb.levels) ? wb.levels.map((l) => l.level + ' ' + l.atOrAbove + ' \u00b0C').join(' / ') : null;
    const idfWhy = (() => { if (!stationData()) return 'station data is off on this install (NIGRAAN_STATION_DATA=0)'; if (!IDF) return 'the intensity-duration-frequency table is not bundled with this build';
      if (Object.keys(IDF.stations || {}).length) return null;
      return internalNames() ? String(IDF.why || 'no gauge fitted') : scrubNames(idfCustomerWhy(), namesRegex(dataDir), label('network')); })();
    const cal = c.shifted ? ', ' + label('calibration') + ' (tier B)' : '';
    return { note: 'NIGRAAN numbers are indicative, not engineering design values.', source: 'climatology baseline of the place (GET /api/point)', stationData: stationData(),
      rows: {
        'Extreme rainfall / IDF': idfWhy ? { status: 'Blocked', gate: idfWhy } : { status: 'Partial', context: 'rain-gauge IDF table (' + label('mountainNetwork') + '), /api/idf', gate: 'Gauge IDF levels beyond the record length are extrapolations; GEV/POT analysis still required' },
        'Extreme temperature': (c.hot != null && c.cold != null) ? { status: 'Partial', context: 'Hot-season 90th-percentile daily maximum ' + c.hot + ' \u00b0C (around ' + c.hotDoy + '), cold-season 10th-percentile minimum ' + c.cold + ' \u00b0C (around ' + c.coldDoy + '); 1991\u20132020 at the settlement height' + cal,
          gate: 'Design percentiles are held for this unit; annual-extreme series and return levels still need an extremes analysis' } : { status: 'Blocked', gate: 'no 1991\u20132020 climatology row for this unit' },
        'Basic wind speed': { status: 'Blocked', gate: 'No gust record long enough for a return-period wind speed: the station gust records this build reads are a few years long, and a code-compatible design wind speed needs decades of validated annual maxima with exposure correction' },
        'Flood design level': { status: 'Blocked', gate: 'A design flood level needs a hydraulic model of the site; the river class is a rarity screen on the model\u2019s own record, not a level or a depth' },
        'Heat stress design': { status: 'Partial', ...(wbLv ? { context: 'Wet-bulb references ' + wbLv + ' (' + String(wb.source || '').split(',')[0] + ' et al.), checked against the forecast at every asset' } : {}), gate: 'Worker and equipment design thresholds are the client\u2019s; register them as limits' },
        'Future climate factor': { status: 'Blocked', gate: 'No downscaled CMIP6 ensemble in this build; the planning offsets are uniform screening constants' },
      } };
  }
  /* v91.17.71 · the customer reason an IDF table is withheld: the rule and the date, without the per-gauge verification
     figures of the internal note (station-measured figures stay internal) */
  function idfCustomerWhy() {
    if (!IDF) return 'the intensity-duration-frequency table is not bundled with this build';
    const w = String(IDF.why || ''); const earliest = (w.match(/Earliest[^.]*\([^)]*\)[^.]*\.[^.]*\./) || w.match(/Earliest[^.]*\./) || [''])[0];
    return 'WITHHELD: no rain gauge of the ' + label('mountainNetwork') + ' holds ' + (IDF.minYears || 3) + ' complete annual maxima yet (' + (IDF.rule || 'a year counts only when most of its record is present') + ').' + (earliest ? ' ' + earliest : '');
  }
  /* v91.17.283.19 · THE PLACE BUNDLE (server/api/point.mjs). Each part is the function its route ran (the routes are retired; a page asks
     GET /api/point once per place and every section reads that one answer). ctx: { lat, lon, place, uid, elevM, view, ps } */
  const rainChanceView = (o, customer) => { if (!customer || !o || typeof o !== 'object') return o; const c = Object.assign({}, o);
    c.target = 'chance that the satellite day rain total (about 10 km, PKT day) reaches the threshold'; c.note = 'Chance of a day rain total at or above the threshold, calibrated against satellite rain and tested on a held-out year.'; delete c.test; c.customerView = true; return c; };
  const unitInfo = (u) => (u ? { unitId: u.unitId, name: u.name, district: u.district, province: u.province, elevM: u.elevM } : null);
  const noUnit = { ready: false, why: 'the place has no tehsil (outside the tehsil polygons)' };
  const LAND_INPUTS = 'soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_9_to_27cm,soil_moisture_27_to_81cm,et0_fao_evapotranspiration,vapour_pressure_deficit';
  /* the Forecast tab's models side by side (its default view) and the AI ensemble beside them */
  const LAB_MODELS = ['ecmwf_ifs025', 'ecmwf_aifs025_single', 'gfs_seamless', 'ncep_aigfs025', 'icon_seamless', 'meteofrance_seamless', 'ukmo_seamless', 'jma_seamless', 'gem_seamless', 'knmi_seamless'], LAB_ENSEMBLE = 'google_weathernext2_ensemble';
  const LAND_HOURLY = 'soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_9_to_27cm,boundary_layer_height,et0_fao_evapotranspiration,vapour_pressure_deficit,precipitation';
  /* v91.17.283.22 · the place record is essential (owner, 26 Oct 2026: essential = the issued levels and the place record): every provider
     call its parts make carries the tag 'place-record', a user tag of data/provider-budget.json, so it is never shed as background */
  const PLACE_TAG = 'place-record', PLACE = { tag: PLACE_TAG };
  /* a product that did not arrive says why when the provider limit refused it (the place bundle then retries the part, point.mjs) */
  const notArrived = (what, ...rs) => ({ ok: false, why: what + ' did not arrive' + (rs.some((r) => r && r.status === 429) ? ' (provider limit, HTTP 429)' : '') });
  /* v91.17.283.28 · S5 / S6 · the place record (one home of the shared values) and the site levels (every hazard at the site's own point) */
  app.placeRecord = createPlaceRecord(app, { dataDir });
  app.floodOutcome = createFloodOutcome(app, { dataDir });   /* v91.17.283.33 · Scenario Lab only */
  app.scenario = createScenario(app, { dataDir });
  app.siteChange = createSiteChange(app, { dataDir, root });   /* v91.17.283.34 · Scenario Lab B: site change */
  /* v91.17.283.39 · the GLOF value of the point's tehsil as the map serves it (the served unit's glof layer, one value per tehsil-day, the
     Analyst map's own value): the bottom panel of the start page lists it beside the point's hazards; it is not counted */
  const glofOfUnit = (c) => { try { const T = c.uid ? tehsilLevelsOf(app, c.uid) : null; return T && T.ready && T.layers && T.layers.glof ? T.layers.glof : null; } catch (_) { return null; } };
  /* v91.17.283.49 · 1.0.10 item 1 · the served air-quality class of the point's tehsil by lead 0-3 (the hazard count's day summary) */
  const airLeads = (c) => { try { if (!c.uid || !app.smog) return null; const u = app.smog.unit(c.uid); const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
    return airDays(u, today).map((d) => ({ ...d, lead: Math.round((Date.parse(d.date) - Date.parse(today)) / 864e5) })).filter((d) => d.lead >= 0 && d.lead <= 3); } catch (_) { return null; } };
  const POINT_PARTS = {
    placeRecord: (c) => app.placeRecord.record(c),
    siteLevels: (c) => app.placeRecord.siteLevels(c),
    hazardCount: (c) => countOf(app.placeRecord.siteLevels(c), app.gate, null, { glof: glofOfUnit(c), air: airLeads(c) }),   /* v283.49 item 1: + the served air quality of the tehsil (summary only) */   /* v91.17.283.37 · the count the national surface shows at this point; v283.39: + the tehsil's GLOF state (an area value, not counted) */
    levels: (c) => (c.uid ? withRun(servedUnit(app, c.uid, c.view === 'operator')) : noUnit),
    rainChance: (c) => (c.uid && app.rainChance ? rainChanceView(app.rainChance.unit(c.uid), c.view !== 'operator') : noUnit),
    outlook: (c) => { const u = c.uid && app.outlook.findUnit(c.uid); const r = u && app.outlook.unit(u.unitId, { lat: c.lat, lon: c.lon }); return r ? { ...r, resolvedBy: 'point' } : { ready: false, why: u ? 'the outlook of this tehsil is not ready' : noUnit.why }; },
    seasonal: (c) => { const u = c.uid && app.outlook.findUnit(c.uid); const r = u && app.outlook.seasonalUnit(u.unitId); return r ? { unit: unitInfo(u), ...r } : { ready: false, why: u ? 'not ready' : noUnit.why }; },
    smog: (c) => { const u = c.uid && app.outlook.findUnit(c.uid); const r = u && app.smog.unit(u.unitId); return r ? { unit: unitInfo(u), ...r } : { ready: false, why: u ? 'not ready' : noUnit.why }; },
    siteScreening: async (c) => app.siteRisk.screening(c.lat, c.lon, Number.isFinite(c.floor) && c.floor >= 0 && c.floor <= 20 ? c.floor : null),   /* c.floor: a site's floor height (m), a batch of sites only */
    siteRisk: (c) => { const out = { ready: true, bySector: {} }; for (const sec of app.siteRisk.sectors()) out.bySector[sec] = app.siteRisk.risk(c.lat, c.lon, sec); return out; },
    river: (c) => (!app.hazSci ? { ready: false, why: 'not running' } : c.uid ? { ...app.hazSci.riverLink(c.uid), resolvedBy: 'point' } : noUnit),
    /* v91.17.283.27 · item 1 · the tehsil's rain return levels from their one home (data/rain-return-levels.json; hazsci.mjs rainLevels): 1-6 h
       labelled area rain, 24 h with the point level. The analyst page's scenario presets read it (the ERA5 table agn-rain-clim is gone) */
    rainRarity: (c) => (!app.hazSci || !app.hazSci.rainLevels ? { ready: false, why: 'not running' } : c.uid ? { ...app.hazSci.rainLevels(c.uid), resolvedBy: 'point' } : noUnit),
    glof: (c) => app.glof.upstream(c.lat, c.lon, { trigger: null }),
    climatology: (c) => climBaseline({ lat: c.lat, lon: c.lon }),
    past30: async (c) => { const r = await app.past30.at({ lat: c.lat, lon: c.lon, days: 30 }); return c.view !== 'operator' ? customerScrub(r) : r; },
    context: async (c) => app.report.context(c.uid ? { unit: c.uid, lat: c.lat, lon: c.lon } : { lat: c.lat, lon: c.lon }, { customer: c.view !== 'operator' }),
    pointrun: async (c) => { const r = await app.report.pointRun({ lat: c.lat, lon: c.lon, elev: Number.isFinite(c.elevM) ? c.elevM : null }); return c.view !== 'operator' ? customerScrub(r) : r; },   /* v91.17.283.20 · item A4: the frozen run at the site's height (as v283.16) */
    facts: (c) => app.placeFacts.facts(c.lat, c.lon),
    near: async (c) => app.pointState.near(c.lat, c.lon, 12),
    aiLocal: async (c) => aiLocalAt({ lat: c.lat, lon: c.lon }, c.ps && c.ps.source && c.ps.source.mach ? c.ps.source.mach.nearest : null),
    poolRank: (c) => poolRankOf(Number.isFinite(c.elevM) ? c.elevM : NaN, 'temperature_2m', 1),
    poolHazard: async (c) => app.pool.hazard({ lat: c.lat, lon: c.lon, elevM: Number.isFinite(c.elevM) ? c.elevM : null, mm: null, ai: undefined, tag: PLACE_TAG }),
    /* v91.17.283.21 · OPERATOR ONLY: the forecast pool of the place (the operator Overview's "NIGRAAN products" card: family-weighted
       consensus, ensemble rain, agreement, regime; server/api/pool.mjs point(), 5 days, at the place's height). It was the page's own
       per-place request (GET /api/pool/point); the route stays for the operator's tools and the tests, the page reads this part */
    pool: async (c) => app.pool.point({ lat: c.lat, lon: c.lon, elevM: Number.isFinite(c.elevM) ? c.elevM : null, days: app.pool.POOL_DAYS, ai: undefined, tag: PLACE_TAG }),
    /* the land-surface inputs the point state does not hold: now (soil moisture, ET0, VPD), the model grid height, and the hourly inputs and
       the 7 past days the strip and the water panel read (soil, boundary layer, ET0, VPD, past rain; day highs, lows and rain) */
    land: async (c) => { const q = { latitude: c.lat, longitude: c.lon, models: 'best_match', timezone: 'auto' }, el = Number.isFinite(c.elevM) ? { elevation: Math.round(c.elevM) } : {};
      /* v91.17.283.20 · item A4: the compound-flood inputs exactly as v283.16 read them (one request: the provider's 15-minute "rain now",
         soil moisture now, and the hourly rain of the 7 past days plus ALL of today, forecast hours included; no elevation, auto time zone) */
      const W0 = { latitude: c.lat, longitude: c.lon, current: 'precipitation,soil_moisture_0_to_1cm,soil_moisture_1_to_3cm', hourly: 'precipitation', past_days: 7, forecast_days: 1, timezone: 'auto' };
      const [a, g, h, w] = await Promise.all([app.pointProducts.get('land', { ...q, current: LAND_INPUTS, ...el }, PLACE),
        app.pointProducts.get('land', { ...q, current: 'temperature_2m', elevation: 'nan' }, PLACE),
        app.pointProducts.get('land', { ...q, ...el, hourly: LAND_HOURLY, past_hours: 168, forecast_hours: 168, daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum', past_days: 7 }, PLACE),
        app.pointProducts.get('land', W0, PLACE)]);
      if (a.status !== 200 && h.status !== 200 && w.status !== 200) return notArrived('the land-surface inputs', a, h, w);
      const A = a.status === 200 ? a.body || {} : {}, Hb = h.status === 200 ? h.body || {} : {}, Wb = w.status === 200 ? w.body || {} : null;
      return { ok: true, current: A.current || {}, gridElevM: g.status === 200 && g.body && g.body.elevation != null ? g.body.elevation : null,
        water: Wb ? { current: Wb.current || {}, hourly: Wb.hourly || {}, utcOffsetSeconds: Wb.utc_offset_seconds != null ? Wb.utc_offset_seconds : null, source: 'the provider\u2019s 15-minute rain now and soil moisture now; the hourly rain of the 7 past days and all of today (forecast hours included)' } : null,
        gridLat: typeof A.latitude === 'number' ? A.latitude : null, gridLon: typeof A.longitude === 'number' ? A.longitude : null,
        hourly: Hb.hourly || null, daily: Hb.daily || null, utcOffsetSeconds: Hb.utc_offset_seconds != null ? Hb.utc_offset_seconds : null,
        source: 'land-surface model inputs at the place (soil moisture, boundary layer, reference evapotranspiration, vapour pressure deficit, the 7 past days); the model grid height beside the place height' }; },
    /* the models side by side of the Forecast tab at the place, its default view (temperature, the next 72 hours), and the AI ensemble's
       control run beside them: provider products, labelled as such on the card (another variable or lead is asked of the product route) */
    models: async (c) => { const q = { latitude: c.lat, longitude: c.lon, hourly: 'temperature_2m', forecast_hours: 72, models: LAB_MODELS.join(','), timezone: 'auto', ...(Number.isFinite(c.elevM) ? { elevation: String(Math.round(c.elevM)) } : {}) };
      const r = await app.pointProducts.get('models', q, PLACE); return r.status === 200 ? { ok: true, body: r.body, source: 'forecast models side by side at the place (provider product)' } : notArrived('the models side by side', r); },
    ensemble: async (c) => { const r = await app.pointProducts.get('ensemble', { latitude: c.lat, longitude: c.lon, hourly: 'temperature_2m', models: LAB_ENSEMBLE, forecast_days: 4 }, PLACE);
      return r.status === 200 ? { ok: true, body: r.body, source: 'AI ensemble control run at the place (provider product)' } : notArrived('the ensemble', r); },
    /* the CMIP6 projection at the place: the formula registry's models, baseline and windows (data/formula-registry.json cmip6), one
       provider product per window, held for good (a projection does not change) */
    cmip6: async (c) => { let R = null; try { R = JSON.parse(readFileSync(join(dataDir, 'formula-registry.json'), 'utf8')).cmip6; } catch (_) { R = null; }
      const val = (k) => (R && R[k] && typeof R[k] === 'object' && 'value' in R[k] ? R[k].value : R && R[k]);
      const M = val('models'), Bw = val('baseline'), Wn = val('windows'); if (!Array.isArray(M) || !Array.isArray(Bw) || !Wn) return { ok: false, why: 'the climate-model settings are not on this server' };
      const wins = [['baseline', Bw]].concat(Object.keys(Wn).sort().map((k) => [k, Wn[k]]));
      const got = await Promise.all(wins.map(([, w]) => app.pointProducts.get('cmip6', { latitude: c.lat, longitude: c.lon, start_date: w[0], end_date: w[1], models: M.join(','), daily: 'temperature_2m_max,precipitation_sum', timezone: 'Asia/Karachi' }, PLACE)));
      const out = { ok: got.every((g) => g.status === 200), models: M, windows: {}, basis: (got[0] && got[0].basis) || null, source: 'CMIP6 high-resolution models at the place (provider product)' };
      wins.forEach(([k, w], i) => { out.windows[k] = { start: w[0], end: w[1], status: got[i].status, body: got[i].status === 200 ? got[i].body : null }; });
      return out; },
    /* v91.17.283.20 · item A3 · OPERATOR ONLY: the physical state of the point (server/api/state.mjs, the v283.16 calculation unchanged:
       Liljegren WBGT, globe and natural wet-bulb, mean radiant temperature, UTCI in sun and shade, wind pressure q, freezing degree-hours,
       the withheld snow load) on the served forecast at the point's height, tau 0 C */
    state: async (c) => app.state.point({ lat: c.lat, lon: c.lon, elevM: Number.isFinite(c.elevM) ? c.elevM : null, tauC: 0, cdA: null, designPressureKpa: null }),
    /* v91.17.283.20 · item A4 · OPERATOR ONLY: the station-calibration (MOS) adjustment of this hour at the point (the v283.16 /api/mos/point
       answer: app.mos.adjust and its table), apart from the whole raw-to-served change of the record (B.build) */
    /* v91.17.283.24 · self-audit P8 · a point without a height is not assessed (the calibration table is chosen by height); it was read at 0 m */
    mos: (c) => { const when = Date.now(); const e = Number.isFinite(c.elevM) ? c.elevM : null; let r;
      if (e == null) return { ok: false, notAssessed: true, lat: c.lat, lon: c.lon, elevM: null, why: 'not assessed: the point has no forecast height, and the station calibration is chosen by height' };
      r = app.mos.adjust(c.lat, c.lon, e, when, null, { rh: null, windKmh: null });
      const t = app.mos.adjustTable(c.lat, c.lon, e, when, null);
      return { ready: true, lat: c.lat, lon: c.lon, elevM: e, tModelC: null, when: new Date(when).toISOString(), ...r, table: { adj: t.adj, source: t.source, applied: t.applied } }; },
    /* the river flow of the place's reach: the global river-flow model's daily discharge and its ensemble spread, the 30 past and next days */
    riverflow: async (c) => { const r = await app.pointProducts.get('riverflow', { latitude: c.lat, longitude: c.lon, daily: 'river_discharge,river_discharge_median,river_discharge_p25,river_discharge_p75', past_days: 30, forecast_days: 30, ensemble: 'true', timezone: 'Asia/Karachi' }, PLACE);
      /* v91.17.283.31 · data lane · the model's FLOWS are never shown (1.2-7.7x the measured flow): its day-to-day change only, and the nearest measured station */
      if (r.status !== 200) return notArrived('the river flow', r);
      let meas = null; try { const S = app.riverSheet.stations(); if (S.ready) { let best = null, bd = Infinity; for (const s of S.stations) { if (s.lat == null) continue; const d = Math.hypot((s.lat - c.lat) * 111, (s.lon - c.lon) * 111 * Math.cos(c.lat * Math.PI / 180)); if (d < bd) { bd = d; best = s; } } if (best && bd <= 60) meas = { ...best, distanceKm: Math.round(bd) }; } } catch (_) { meas = null; }
      return { ok: true, daily: null, change: flowChangeOnly(r.body && r.body.daily), flowsWithheld: 'the global river model\u2019s flows are not shown: against the measured gauges they read 1.2-7.7 times the measured flow; its day-to-day change is kept', measured: meas, source: 'global river-flow model at the place (day-to-day change only) and the nearest measured river station (within 60 km)' }; },
  };
  /* the issued levels' stamp (engine report + server hazard science + area heat): part of a bundle's stamp, so a new issue makes new bundles */
  function levelsStampOf() { try { const L = app.engine && app.engine.latest ? app.engine.latest() : null; return L ? [L.received, L.hazSci && L.hazSci.at, L.areaHeat && L.areaHeat.at].map((x) => x || '-').join('|') : null; } catch (_) { return null; } }
  /* v91.17.283.22 · the day's provider budget is spent for a place record's retry only where a person's call would be refused: the local
     hard limit (MACH_DAILY_CALL_LIMIT) or enforce mode at the cap (shed mode never refuses a person, callbudget.mjs) */
  const budgetSpent = () => { try { if (provider.overBudget && provider.overBudget()) return true; const st = callBudget.status(); return !!(st && st.configured && st.mode === 'enforce' && st.usedWeighted >= st.dailyWeightedCap); } catch (_) { return false; } };
  app.hazardGrid = createHazardGrid(app, { dataDir });   /* v91.17.283.37 */
  app.point = createPoint(app, { parts: POINT_PARTS, operatorParts: ['state', 'mos', 'pool'], levelsStamp: levelsStampOf, inputsOf: districtInputsOf, budgetSpent });
  /* v91.17.283.20 · item A5 · the model inputs of the page's district rows that the corrected record does not hold (soil moisture 9-27 cm,
     MSL and surface pressure, 850 hPa temperature and wind, reference evapotranspiration, vapour pressure deficit, short-wave radiation):
     one provider product per 40 points, at the points' forecast heights, 4 days hourly (the v283.16 district sweep's variables) */
  const INPUT_HOURLY = 'soil_moisture_9_to_27cm,pressure_msl,surface_pressure,temperature_850hPa,wind_speed_850hPa,et0_fao_evapotranspiration,vapour_pressure_deficit,shortwave_radiation';
  async function districtInputsOf(pts) {
    const out = new Array(pts.length).fill(null);
    for (let s = 0; s < pts.length; s += 40) { const part = pts.slice(s, s + 40).map((p, k) => ({ ...p, i: s + k })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      for (const grp of [part.filter((p) => Number.isFinite(p.elevM)), part.filter((p) => !Number.isFinite(p.elevM))]) { if (!grp.length) continue;
        const q = { latitude: grp.map((p) => p.lat).join(','), longitude: grp.map((p) => p.lon).join(','), hourly: INPUT_HOURLY, forecast_days: 4, models: 'best_match', timezone: 'Asia/Karachi', ...(Number.isFinite(grp[0].elevM) ? { elevation: grp.map((p) => String(Math.round(p.elevM))).join(',') } : {}) };
        const r = await app.pointProducts.get('inputs', q); const arr = r.status === 200 ? (Array.isArray(r.body) ? r.body : [r.body]) : [];
        grp.forEach((p, k) => { const L = arr[k]; out[p.i] = L && L.hourly ? { hourly: L.hourly, elevation: L.elevation != null ? L.elevation : null, source: 'model inputs at the point (provider product): soil moisture, pressure, 850 hPa, reference evapotranspiration' } : { ok: false, why: 'the model inputs did not arrive' }; }); } }
    return out; }
  /* v91.17.283.19 · the NIGRAAN AI local temperature correction at a point (was GET /api/ai/local; now the aiLocal part of the place
     bundle): its station is the bundle's one nearest station, not a second station rule */
  async function aiLocalAt(c, station) {
      const port = Number(process.env.PORT || 8787), D = downscaleFor(app);
      const q = new URLSearchParams({ __omhost: 'api.open-meteo.com', __raw: '1', latitude: c.lat.toFixed(4), longitude: c.lon.toFixed(4), timezone: 'UTC', forecast_days: '6',
        hourly: 'temperature_2m,cloud_cover,wind_speed_10m,shortwave_radiation,precipitation', models: 'best_match' });
      const r = await fetch(`http://127.0.0.1:${port}/px/v1/forecast?` + q.toString(), { headers: { 'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': 'ai-local' } });
      if (!r.ok) throw new Error('forecast ' + r.status);
      const j = await r.json(), H = j.hourly || {}, T = H.time || [], tMs = T.map(t => Date.parse(t + 'Z'));
      const elev = Number.isFinite(j.elevation) ? j.elevation : null;
      let zone = null; try { zone = app.mos && app.mos.zoneOfPoint ? app.mos.zoneOfPoint(c.lat, c.lon, elev) : null; } catch (_) {}
      const byDay = D ? D.dayInputs(tMs, H) : new Map(), days = [];
      for (const d of [...byDay.values()].slice(0, 5)) {
        let term = null, src = null;
        try { const s0 = D.servedTerm ? D.servedTerm(c.lat, c.lon, d.date) : null; if (s0) { term = { dTx: s0.dTx, dTn: s0.dTn, applied: true }; src = 'served'; } } catch (_) {}
        if (!term && D) { const rr = D.residualDay(c.lat, c.lon, { date: d.date, zone, servedElevM: elev, tmax: d.tmax, tmin: d.tmin, cloudDay: d.cloudDay, cloudNight: d.cloudNight, windDay: d.windDay, windNight: d.windNight, sw: d.sw, precip: d.precip });
          term = { dTx: rr.applied ? rr.dTx : 0, dTn: rr.applied ? rr.dTn : 0, applied: !!rr.applied, why: rr.basis && rr.basis.why || null, shadow: !!rr.shadow }; src = 'model'; }
        days.push({ date: d.date, rawTx: Math.round(d.tmax * 10) / 10, rawTn: Math.round(d.tmin * 10) / 10, dTx: term ? term.dTx : 0, dTn: term ? term.dTn : 0, applied: !!(term && term.applied), why: term && term.why || null, source: src,
          cloudDay: d.cloudDay != null ? Math.round(d.cloudDay) : null, windDay: d.windDay != null ? Math.round(d.windDay * 10) / 10 : null, precip: d.precip != null ? Math.round(d.precip * 10) / 10 : null });
      }
      const dayMap = new Map(days.map(d => [d.date, d])), now = Date.now(), hourly = [];
      for (let i = 0; i < T.length; i++) { if (tMs[i] < now - 3600e3 || tMs[i] > now + 72 * 3600e3) continue; const t0 = H.temperature_2m && H.temperature_2m[i]; if (t0 == null) continue;
        const pk = new Date(tMs[i] + 5 * 3600e3), key = pk.toISOString().slice(0, 10), h = pk.getUTCHours(), dd = dayMap.get(key);
        let w = 0.5; if (h >= 9 && h <= 18) w = 1; else if (h >= 21 || h <= 7) w = 0; else if (h < 9) w = (h - 7) / 2; else w = (21 - h) / 3;
        const dT = dd ? (w * dd.dTx + (1 - w) * dd.dTn) : 0;
        hourly.push({ t: T[i], raw: Math.round(t0 * 10) / 10, ai: Math.round((t0 + dT) * 10) / 10, dT: Math.round(dT * 100) / 100 }); }
      const M = D && D.status ? D.status() : null;
      return { ok: true, lat: c.lat, lon: c.lon, servedElevM: elev, zone, model: M ? { label: M.label || null, version: M.version || null, built: M.built || null, on: !!M.on, shadow: !!M.shadow, switchedOff: !!M.switchedOff } : null,
        days, hourly, station: station && station.station ? { name: station.station, km: station.km, tempC: station.reading ? station.reading.tempC : null, ageMin: station.ageMin } : null };
  }
  /* v91.17.283.19 · the model ranking of the forecast pool for a height zone, season, lead and variable (GET /api/pool/rank, and the
     poolRank part of the place bundle at the place's height) */
  function poolRankOf(elev, variable, lead) {
    const sk = app.pool.skill();
    const SEAS = ['DJF', 'DJF', 'MAM', 'MAM', 'MAM', 'JJA', 'JJA', 'JJA', 'SON', 'SON', 'SON', 'DJF'];
    const zone = isFinite(elev) && elev >= 1000 ? 'mountain' : 'plains'; const key = zone + '|' + SEAS[new Date(Date.now() + 5 * 3600e3).getUTCMonth()] + '|' + lead + '|' + variable;
    const c = sk && sk.cells ? sk.cells[key] : null;
    if (!c || !c.models) return { ok: false, cell: key, why: sk ? 'no scored models in this cell' : 'model-skill registry not installed' };
    const ranked = Object.entries(c.models).filter(([, m]) => m && m.mae != null && m.n >= 50).sort((a, b) => a[1].mae - b[1].mae);
    return { ok: true, cell: key, stations: c.stations ?? null, built: sk.built, models: Object.fromEntries(ranked.map(([k], i) => [k, { rank: i + 1, weight: c.weights && c.weights[k] ? Math.round((c.weights[k].w ?? c.weights[k]) * 1000) / 1000 : null }])), of: ranked.length };
  }
  /* v91.17.283.20 · item B4 · the legends of the level words from the thresholds register (read on change): the UTCI classes (Blazejczyk et
     al. 2013) and the level of each class (utci.levels, the rule of server/api/pointstate.mjs); outside the polynomial's valid range a value
     is "not assessed" */
  let LEG = null;
  function levelLegends() {
    const f = join(dataDir, 'thresholds-register.json'); let m = 0; try { m = statSync(f).mtimeMs; } catch (_) { return { ok: false, why: 'the thresholds register is not on this server' }; }
    if (LEG && LEG.m === m) return LEG.v;
    let R = null; try { R = JSON.parse(readFileSync(f, 'utf8')); } catch (_) { return { ok: false, why: 'the thresholds register could not be read' }; }
    const row = (id) => (R.rows || []).find((r) => r.id === id) || null, C = row('utci.classes'), LV = row('utci.levels');
    if (!C || !Array.isArray(C.value) || !LV || !LV.value) return { ok: false, why: 'the thresholds register holds no utci.classes / utci.levels row' };
    const words = LV.value.words, lv = LV.value, deg = (x) => (x < 0 ? '\u2212' + Math.abs(x) : String(x));
    /* range [lower, upper] (null = open); a cold band is read from its warmer bound (-13 to -27) */
    const band = (r, k) => (r[1] == null ? 'UTCI ' + deg(r[0]) + ' \u00b0C or more' : r[0] == null ? 'UTCI below ' + deg(r[1]) + ' \u00b0C' : k === 'cold' ? 'UTCI ' + deg(r[1]) + ' to ' + deg(r[0]) + ' \u00b0C' : 'UTCI ' + deg(r[0]) + ' to ' + deg(r[1]) + ' \u00b0C');
    const legend = (k) => { const L = lv[k] || {}; return words.map((w, i) => { if (i === 0) return lv.none[k]; const b = L[w]; return b ? band(b.range, k) + ', ' + (b.words ? b.words + (String(b.words).toLowerCase() === String(b.cls).toLowerCase() ? '' : ' (UTCI ' + String(b.cls).toLowerCase() + ')') + ', never an alert' : String(b.cls).toLowerCase()) : lv.unused; }); };   /* v91.17.283.32 · the Low row (mild heat / cold stress) */
    /* v91.17.283.22 · item 6: per map hazard the classes its rule can issue and where its alerts start (register rows legend.<layer>); every
       legend and colour bar draws only these classes; item 8: the one label of the chance of rain (register row rainChance.label) */
    const layers = {}; for (const r of (R.rows || [])) { if (!/^legend\./.test(r.id) || !r.value || !Array.isArray(r.value.classes)) continue; const k = r.id.slice(7), x = r.value;
      layers[k] = { classes: x.classes.filter((w) => words.includes(w)), alertsFrom: x.alertsFrom || null, alertClasses: x.alertClasses || [], status: r.status,
        alertLine: x.alertsFrom ? 'Alerts start at ' + x.alertsFrom + (x.alertClasses && x.alertClasses.length < x.classes.length - x.classes.indexOf(x.alertsFrom) ? ' (' + x.classes.filter((w) => !x.alertClasses.includes(w) && x.classes.indexOf(w) > x.classes.indexOf(x.alertsFrom)).join(', ') + ': shown, no alert)' : '') : 'No alerts for this hazard (levels shown, not alerted)' }; }
    const rc = row('rainChance.label'), rcv = rc && rc.value ? rc.value : null;
    const v = { ok: true, version: R.rowsSha256 || null, source: 'data/thresholds-register.json (' + C.source + ')', words, classes: C.value, levels: { heat: lv.heat, cold: lv.cold }, validRange: lv.validRange,
      outside: lv.outside, legends: { heat: legend('heat'), cold: legend('cold') }, layers,
      rainChance: rcv ? { label: rcv.label, windows: rcv.windows, productType: rcv.productType || null, gateEntries: rcv.gateEntries || [], status: rc.status, why: rc.source } : { label: 'screening', windows: 'screening', productType: null, gateEntries: [], status: 'screening', why: 'the thresholds register holds no rainChance.label row' } };
    LEG = { m, v }; return v; }
  async function handle(req, res, url) {
    let p = url.pathname;
    if (REL_PATH_ROUTES.has(p)) res.__relPaths = true;   /* v91.17.283 · INTEG (S2) */
    /* v91.17.34 · AUDIT A15 · the /api/api/v1 rewrite ran after the exact health check, so /api/api/v1/health was a 404 */
    if (p.startsWith('/api/api/v1/')) p = p.slice(4);
    if (p === '/health' || p === '/api/health' || p === '/api/v1/health') {
      const b = governance().securityBlockers();
      /* v91.17.212 · audit S-16 · /health said "ok" while the national run was 54 h stale. The job board's verdict now travels with it:
         a stale CRITICAL job (national run, river flood, verification) makes the service "degraded" and names itself; other stale
         jobs are listed without changing the status. Cached 30 s (the board reads files). */
      const J = (() => { try { const now = Date.now(); if (!healthJobs || now - healthJobs.at > 30e3) { const h = app.ops && app.ops.health ? app.ops.health() : null;
        const stale = h ? (h.stale || []).map(x => typeof x === 'string' ? x : (x && (x.id || x.job)) || String(x)) : null;
        /* v91.17.270 · OPS · why each stale job is stale, in the same words as the ops board's alert (ops.mjs tick): the v269 deploy check
           saw stale ["ensArchive"] with no reason (it was the ensemble-mean run the archive could not save, not the swap) */
        const staleWhy = h ? Object.fromEntries((h.jobs || []).filter(j => j && j.state === 'stale').map(j => [j.id, j.missed && !(j.ageH > j.maxH) ? j.missed : 'has not completed for ' + j.ageH + ' h (limit ' + j.maxH + ' h)'])) : null;
        healthJobs = { at: now, v: h ? { ok: !!h.ok, stale, staleWhy, critical: (h.jobs || []).filter(j => j && CRITICAL_JOBS.includes(j.id) && (j.state === 'stale' || j.state === 'never')).map(j => j.id + (j.state === 'never' ? ' (never run)' : '')), notConfigured: h.notConfigured || [] } : null }; } return healthJobs.v; } catch (_) { return null; } })();
      /* v91.17.269 · INFRA A6 · role: active (the writer), standby (a deploy's new server before the hand-over; a standby alone does not
         make the service degraded) or draining (the old server after the switch); the supervisor waits on it */
      const role = app.draining ? 'draining' : (store.standby && store.standby()) ? 'standby' : 'active';
      /* v91.17.279 · OPS-12 · a disk under the critical free space, or durable writes failing for over 10 s, make the service degraded */
      const DSK = (() => { try { return app.ops && app.ops.disk ? app.ops.disk() : null; } catch (_) { return null; } })(), SW = (() => { try { return store.writeHealth ? store.writeHealth() : null; } catch (_) { return null; } })();
      return send(res, 200, { status: (provider.configured() && !(store.readOnly && store.readOnly() && role === 'active') && !(J && J.critical.length) && !(DSK && DSK.level === 'critical') && !(SW && SW.failing)) ? 'ok' : 'degraded', role, disk: DSK, storeWrites: SW, pid: process.pid, bmSuperset: (() => { try { return app.bmRows ? app.bmRows.status() : null; } catch (_) { return null; } })(),   /* v91.17.283.2 · D2/D4 */ runState: (() => { try { return app.runState ? app.runState.status() : null; } catch (_) { return null; } })(),   /* v91.17.283.3 · cut 2 */ port: Number(process.env.PORT || 8787), jobs: J, copiesRetention: (() => { try { return app.copiesRetention ? app.copiesRetention.status() : null; } catch (_) { return null; } })(), accMon: (() => { try { return app.accMon ? app.accMon.health() : null; } catch (_) { return null; } })(), service: 'nigraan-local', serviceVersion: SERVICE_VERSION, chain: (() => { try { return app.provenance.chain(); } catch (_) { return null; } })(), apiVersion: API_VERSION, endpoints: endpointList.length,
        provider: { tier: provider.configured() ? 'commercial' : 'none', label: provider.label }, callMode: (() => { try { const m = callBudget.limits() ? callBudget.mode() : 'no budget'; return callBudget.testMode() ? 'TEST MODE (background: test tiers on new 00/12 UTC runs only; people: cache first) · ' + m : m; } catch (_) { return null; } })(), providerBudget: (() => { try { return callBudget.status(); } catch (_) { return null; } })(),   /* v91.17.283 · WS1 · PATCH3 · the mode in one line */ modelRuns: (() => { try { return modelRuns.status(); } catch (_) { return null; } })(),   /* v91.17.283 · WS1 · owner decision C: use against the daily cap (no secrets) */ store: { engine: 'json-file', collections: store.counts(), readOnly: store.readOnly ? store.readOnly() : null, recoveredFrom: store.recoveredFrom ? store.recoveredFrom() : null,
        /* v91.17.283 · INTEG (WS3 request) · which copy the store loaded at start, the last final write (stop / exit), and the build on disk;
           a non-operator gets the outcome only (a failure reason can name a folder) */
        recovery: (() => { try { return store.recovery ? store.recovery() : null; } catch (_) { return null; } })(),
        lastFinalFlush: (() => { try { const f = store.lastFinalFlush ? store.lastFinalFlush() : null; return f && !localOrSigned(req) ? { ok: f.ok, ms: f.ms ?? null, at: f.at ?? null } : f; } catch (_) { return null; } })(),
        buildState: (() => { try { const b = JSON.parse(readFileSync(join(dataDir, 'run', 'build-state.json'), 'utf8')); return { version: b.version ?? null, state: b.state ?? null, at: b.at ?? null }; } catch (_) { return null; } })() }, productionReady: b.length === 0, warm: !!app.warm.ready, warmMs: app.warm.ms, warmFailed: app.warm.failed || null, warmErrors: Object.keys(app.warm.errors || {}).length ? app.warm.errors : null, time: nowIso() });
    }
    /* v91.17.70 · the Sources page. /api/v1/sources answers too: server.mjs forwards /api/v1/* to this handler today, and
       /api/sources needs one prefix added to its forward list (integrator note in s70/CHANGES_ai_reports.md) */
    if ((p === '/api/sources' || p === '/api/v1/sources') && req.method === 'GET') return send(res, 200, app.sources.page());
    if (p === '/api/verification/grades' && req.method === 'GET') return viewOp(req) ? send(res, 200, app.verification.grades()) : send(res, 403, { error: 'operator_only', why: 'verification scores are shown in the operator view only' });   /* v283.23 self-audit W10 */
    /* v91.17.206 · the customer page reads the national model's held-out test summary here: /api/ops/models is operator-only (it carries the
       whole registry), and since the page marks itself as the customer view (v205) the Proof step lost its national accuracy figures. Only
       aggregate scores of the served temperature model leave this route. */
    if (p === '/api/verification/models' && req.method === 'GET') { let j = null; try { j = JSON.parse(readFileSync(join(dataDir, 'model-registry.json'), 'utf8')); } catch { j = null; }
      const pick = (r) => r ? { mae: r.mae, n: r.n, stations: r.stations } : null;
      const models = ((j && j.models) || []).filter(m => m.id === 'national-temperature').map(m => { const a = m.live && m.live.results && m.live.results.all; return { id: m.id, train: m.train || null, test: m.test || null, live: a ? { results: { all: { raw: pick(a.raw), model: pick(a.model) } } } : null }; });
      return send(res, 200, { models, ready: models.length > 0 }); }
    if (p === '/api/ai/status' && req.method === 'GET') { const op = viewOp(req); const s = await ai.status({ loopback: op });   /* v91.17.76 · held-out figures never leave the machine */   /* v283.23 self-audit P10: content shown is operator-view only (viewOp), as every other operator detail */
      /* v91.17.283 · WS1 · the full status (provider, model, firewall, local model store, key file hints) is for the operator on this computer
         or a signed operator; everyone else gets what the page needs to describe the assistant, nothing about how it is wired */
      return send(res, 200, op ? s : publicAiStatus(s)); }
    /* v91.17.27 · P5-4 · the number firewall, callable on its own so it can be tested without a model */
    if (p === '/api/ai/firewall' && req.method === 'POST') { let b; try { b = await readBody(req); } catch (e) { return send(res, e.status || 422, { ok: false, error: e.code || 'CONTRACT_INVALID', message: e.message }); } return send(res, 200, ai.firewall(String(b.answer || ''), b.facts || {})); }
    if (p === '/api/smog/unit' && req.method === 'GET') { const _la = Number(url.searchParams.get('lat')), _lo = Number(url.searchParams.get('lon')); let _pu = null;   /* v91.17.69 · the point first, as the outlook */
      if (url.searchParams.get('lat') != null && Number.isFinite(_la) && Number.isFinite(_lo) && app.urbanHeat && app.urbanHeat.unitAt) { try { const f = app.urbanHeat.unitAt(_la, _lo); _pu = f && f.uid ? app.outlook.findUnit(f.uid) : null; } catch (_) {} }
      const u = _pu || app.outlook.findUnit(url.searchParams.get('unit')); const r = u && app.smog.unit(u.unitId); return r ? send(res, 200, { unit: { unitId: u.unitId, name: u.name, district: u.district, province: u.province, elevM: u.elevM }, ...r }) : send(res, 404, { error: u ? 'not_ready' : 'unit_not_found' }); }
    if (p === '/api/smog/units' && req.method === 'GET') {   /* v91.17.283.12 · the server AQI of many points in one request (the map's district sweep and the 12 cities):
         for each point the same answer as /api/smog/unit, cut to today's row (PKT); at most 200 points */
      const raw = String(url.searchParams.get('pts') || '').split(';').map((x) => x.trim()).filter(Boolean);
      if (!raw.length || raw.length > 200) return send(res, 400, { error: 'pts=lat,lon;... (1 to 200 points) required' });
      const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10), out = [];
      for (const x of raw) { const [la, lo] = x.split(',').map(Number); let u = null;
        try { if (Number.isFinite(la) && Number.isFinite(lo) && app.urbanHeat && app.urbanHeat.unitAt) { const f = app.urbanHeat.unitAt(la, lo); u = f && f.uid ? app.outlook.findUnit(f.uid) : null; } } catch (_) { u = null; }
        const r = u && app.smog.unit(u.unitId);
        out.push(r ? { unit: { unitId: u.unitId, name: u.name }, at: r.at, stale: r.stale, days: (r.days || []).filter((d) => d && d.date === today) } : { error: u ? 'not_ready' : 'unit_not_found' }); }
      return send(res, 200, { ok: true, n: out.length, units: out }); }
    if (p === '/api/smog/national' && req.method === 'GET') { const d = intIn(url.searchParams.get('day'), 0, 6, 1); if (d == null) return send(res, 400, { error: 'day must be an integer 0-6' }); return send(res, 200, app.smog.national(d)); }
    if (p === '/api/map/layers' && req.method === 'GET') return send(res, 200, app.mapLayers.catalogue());
    if (p === '/api/map/layer' && req.method === 'GET') {
      /* v91.17.15 · F4 · a layer name this build does not publish is a 404, not a
         200 carrying an empty result. The body still says why, so the map can
         print it. */
      const _i = intIn(url.searchParams.get('i'), 0, 30, 0); if (_i == null) return send(res, 400, { error: 'i must be an integer 0-30' });
      /* v91.17.283.8 · science audit · the river flood CHANCE (rv:*) had negative Brier skill against persistence in both tested monsoons
         (data/river-prob-model.json validation): no number reaches a client; the operator view keeps it */
      if (/^rv:/.test(String(url.searchParams.get('id') || '')) && customerView(req)) return send(res, 200, { ready: false, withheld: true, id: url.searchParams.get('id'), why: RIVER_CHANCE_WITHHELD });
      const _l = app.mapLayers.layer(url.searchParams.get('id'), _i);
      return send(res, _l && _l.error === 'unknown layer' ? 404 : 200, _l);
    }
    /* v91.17.126 · S-23 · job internals, store sizes, backups and held-out skill are operator data; the customer view gets the states only */
    /* v91.17.255 · B-2 · remove the rows test-backend.mjs made (test identities only; audit untouched). This computer only, and only
       with a signed admin token (issue-token.mjs on this machine): body { dryRun, backup }. */
    /* v283.44 · test projects off the Client Risk list: moved to data/_to_delete/case-projects (casesetaside.mjs); this computer only */
    if ((p === '/api/ops/case/set-aside' || p === '/api/ops/case/restore') && req.method === 'POST') {
      if (!localOrSigned(req) || !loopbackDirect(req)) return send(res, 403, { error: 'operator_on_this_computer_required' });
      let b = {}; try { b = (await readBody(req)) || {}; } catch { b = {}; } if (b && b.data) b = b.data;
      const CS = app.caseSetAside || (app.caseSetAside = createCaseSetAside(store, dataDir));
      try { if (p === '/api/ops/case/restore') return send(res, 200, { ok: true, ...(await CS.restore(b.file || url.searchParams.get('file'))) });
        return send(res, 200, { ok: true, ...(await CS.setAside({ rule: b.rule || url.searchParams.get('rule') || undefined, ids: Array.isArray(b.ids) ? b.ids : undefined, dryRun: !!b.dryRun || url.searchParams.get('dryRun') === '1', why: b.why || url.searchParams.get('why') || '' })) }); }
      catch (e) { return send(res, e.status || 500, { ok: false, error: e.message }); } }
    if (p === '/api/ops/test-cleanup' && req.method === 'POST') { let who = null; try { who = identity.resolve(req); } catch {}
      const admin = !!who && (((who.roles || []).includes('admin')) || ((who.scopes || []).includes('*')));
      if (!loopbackDirect(req) || !admin) return send(res, 403, { error: 'admin_on_this_computer_required' });
      let b = {}; try { b = (await readBody(req)) || {}; } catch { return send(res, 422, { error: 'bad_json' }); } if (b && b.data) b = b.data;
      return send(res, 200, await cleanTestRecords(store, { root, dryRun: !!b.dryRun, backup: !!b.backup })); }
    if (p === '/api/ops/health' && req.method === 'GET') { const H = app.ops.health(); if (localOrSigned(req)) return send(res, 200, H);
      return send(res, 200, { ok: H && H.ok, stale: H && H.stale, jobs: ((H && H.jobs) || []).map(j => ({ id: j.id, label: j.label, state: j.state, ageH: j.ageH })), view: 'customer' }); }
    if (p === '/api/ops/archive' && req.method === 'GET') return send(res, 200, app.archive.status());   /* v91.17.76 */
    if (p === '/api/ops/archive/run' && req.method === 'POST') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); let body = {}; try { body = await readBody(req); } catch { return send(res, 422, { error: 'bad_json' }); } return send(res, 200, await app.archive.run(body || {})); }
    if (p === '/api/mos/status' && req.method === 'GET') return send(res, 200, app.mos.status());
    if (p === '/api/fleet/status' && req.method === 'GET') return send(res, 200, app.fleet.status());
    if (p === '/api/fleet/latest' && req.method === 'GET') return send(res, 200, app.fleet.latest({ customer: !viewOp(req) }));   /* v91.17.283.26 · customers: checked readings only */
    if (p === '/api/fleet/stations' && req.method === 'GET') return send(res, 200, { stations: app.fleet.stations() });
    if (p === '/api/fleet/poll' && req.method === 'POST') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); await app.fleet.poll(); await app.fleet.pairLatest(); return send(res, 200, app.fleet.status()); }
    if (p === '/api/fleet/offsets' && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); return send(res, 200, app.fleet.offsets ? app.fleet.offsets() : { error: 'not available' }); }   /* v91.17.186 · live-layer siting offsets (internal) */
    if (p === '/api/fleet/offsets' && req.method === 'POST') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); return send(res, 200, app.fleet.refreshOffsets ? await app.fleet.refreshOffsets() : { error: 'not available' }); }
    if (p === '/api/fleet/backfill' && req.method === 'POST') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); return send(res, 200, await app.fleet.backfill()); }   /* v91.17.182 */
    if (p === '/api/fleet/pairs' && req.method === 'GET') return send(res, 200, app.fleet.pairs());   /* v91.17.59 */
    /* v91.17.266 · interface 2 · every registered station's status (checked / not-yet-checked / site-problem / silent), polled or not */
    if (p === '/api/fleet/check' && req.method === 'GET') return send(res, 200, { rule: app.fleet.screenRule(), stations: app.fleet.statusAll() });
    /* ══ v91.17.88 · L3 live hyperlocal temperature ══ */
    if (p === '/api/hyperlocal/status' && req.method === 'GET') { const st = app.hyperlocal.status(); return send(res, 200, customerView(req) ? customerScrub(st) : st); }   /* v91.17.283 · INTEG (N2): the customer view names no agency */
    if (p === '/api/synop/status' && req.method === 'GET') return send(res, 200, app.synop.status());
    if (p === '/api/epd/status' && req.method === 'GET') return send(res, 200, viewOp(req) ? { ...app.epd.status(), latest: app.epd.latest() } : app.epd.status());
    if (p === '/api/dos/status' && req.method === 'GET' && app.dos) return send(res, 200, viewOp(req) ? { ...app.dos.status(), latest: app.dos.latest() } : { on: app.dos.status().on, lastOk: app.dos.status().lastOk });   /* v91.17.283.52 E · operator: the monitors; customer: only whether it reads */
    /* v91.17.283.24 · self-audit D2 · /api/vcarchive/status and /api/openaq/status|poll removed: no page, script or job calls them and the gateway blocks them (the two jobs keep running) */
    if (p === '/api/epd/daily' && req.method === 'GET') { if (!viewOp(req)) return send(res, 403, { error: 'operator_scope_required' }); return send(res, 200, app.epd.daily({ district: url.searchParams.get('district'), from: url.searchParams.get('from'), to: url.searchParams.get('to'), full: url.searchParams.get('partial') !== '1' })); }   /* v91.17.283.30 · internal */
    if (p === '/api/epd/history' && req.method === 'POST') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); await app.epd.pollHistory({ force: true }); return send(res, 200, app.epd.status()); }   /* v91.17.283.30 */
    if (p === '/api/epd/poll' && req.method === 'POST') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); await app.epd.poll(); return send(res, 200, app.epd.status()); }
    if (p === '/api/synop/poll' && req.method === 'POST') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); await app.synop.poll(); return send(res, 200, app.synop.status()); }
    /* v91.17.89 · national model status (held-out numbers are operator-only: the page shows them only in operator mode) */
    /* v91.17.91 · the daily temperature check (INTERNAL: operator views only) */
    /* v91.17.283.38 · item 7 · the place card's hyperlocal line: the temperature-map value at the place (the 250 m cell centred on it, the same
       value the Temperature layer colours there) and whether the live MACH correction applies here (hyperlocal.at: the radius and station
       rule of data/hyperlocal-model.json). applies false: the card shows no line (the reason is given for the operator view only). */
    if (p === '/api/hyperlocal/point' && req.method === 'GET') {
      const c = coord(url.searchParams); if (c.outside) return send(res, 200, { ok: false, outside: true }); if (c.error) return send(res, 400, { ok: false, why: c.error });
      const la = +url.searchParams.get('lat'), lo = +url.searchParams.get('lon'), d = 0.0025, h = 5.5 * d;
      let at = null; try { at = app.hyperlocal && app.hyperlocal.at ? app.hyperlocal.at(la, lo) : null; } catch (_) { at = null; }
      const R = (() => { try { const st = app.hyperlocal.status(); return st && st.rule ? st.rule.radius_km : null; } catch (_) { return null; } })();
      if (!at || !at.applied) return send(res, 200, { ok: true, applies: false, radiusKm: R, stations: at ? at.stations || 0 : 0, ...(viewOp(req) ? { why: at && at.why } : {}) });
      try { const g = await app.natGrid.grid({ s: la - h, w: lo - h, n: la + h, e: lo + h, nx: 11, ny: 11, port: Number(process.env.PORT || 8787), q: 'moist', shadow: false });
        if (!g || !g.ok || g.nx !== 11 || g.ny !== 11 || !Array.isArray(g.t)) return send(res, 200, { ok: true, applies: false, radiusKm: R, why: g && g.preparing ? 'preparing' : 'the temperature map is not available here' });
        const v = g.t[5 * 11 + 5]; if (!Number.isFinite(v)) return send(res, 200, { ok: true, applies: false, radiusKm: R });
        return send(res, 200, { ok: true, applies: true, tempC: v, stations: at.stations, nearestKm: at.nearestKm, radiusKm: R, hourUtc: g.hourUtc, cellM: 250 }); }
      catch (err) { return send(res, 200, { ok: true, applies: false, radiusKm: R, why: 'the temperature map is not available right now' }); }
    }
    if (p === '/api/hyperlocal/grid' && req.method === 'GET') {   /* v91.17.91 · the temperature map over a view */
      const q = url.searchParams; const s0 = +q.get('s'), w0 = +q.get('w'), n0 = +q.get('n'), e0 = +q.get('e');
      if (![s0, w0, n0, e0].every(Number.isFinite) || n0 <= s0 || e0 <= w0 || n0 - s0 > 15 || e0 - w0 > 18) return send(res, 400, { error: 'bad_bbox', why: 's,w,n,e within Pakistan-sized bounds' });
      try { return send(res, 200, await app.natGrid.grid({ s: s0, w: w0, n: n0, e: e0, nx: +q.get('nx') || 120, ny: +q.get('ny') || 120, port: Number(process.env.PORT || 8787), q: q.get('q') === 'moist' ? 'moist' : '', shadow: q.get('shadow') === '1' && viewOp(req) })); }
      catch (err) { return send(res, 502, { error: 'grid_failed', message: err.message, reason: err.reason || null, why: err.why || null, budgetClass: err.budgetClass || null }); }   /* v91.17.283.9 · the reason travels to the page */
    }
    if (p === '/api/hyperlocal/score' && req.method === 'GET') { if (!app.natScore) return send(res, 200, { ok: false }); if (url.searchParams.get('run') === '1' && localOrSigned(req)) app.natScore.run(); return send(res, 200, { ...app.natScore.status(), history: app.natScore.history(Number(url.searchParams.get('days') || 60)).days }); }
    /* v91.17.93 · the daily river sheet from AGN's Google Drive (drivefetch.mjs): GET status (?run=1 fetch now), POST {url} sets the link; this computer only */
    /* v91.17.283 · INTEG (permanent S2 / N2) · the copy-folder and drop-folder boards name install folders and the copies' sources: operator
       only; anyone else is told that, with nothing else */
    if ((p === '/api/ops/copies' || p === '/api/ops/drive') && req.method === 'GET' && (!localOrSigned(req) || customerView(req))) return send(res, 200, { ok: true, operatorOnly: true, why: 'shown to the operator on this computer' });
    if (p === '/api/ops/drive' && req.method === 'GET') { if (!app.driveFetch) return send(res, 200, { ok: false }); if (url.searchParams.get('run') === '1' && localOrSigned(req)) { const r = await app.driveFetch.run(); return send(res, 200, { ok: true, run: r, ...app.driveFetch.status() }); } return send(res, 200, { ok: true, ...app.driveFetch.status() }); }
    if (p === '/api/ops/drive' && req.method === 'POST') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); if (!app.driveFetch) return send(res, 200, { ok: false }); let b; try { b = await readBody(req); } catch (e) { return send(res, e.status || 422, { ok: false, error: e.message }); } const r = app.driveFetch.setUrl(b && b.url); if (r.ok) { const x = await app.driveFetch.run(); return send(res, 200, { ...r, run: x }); } return send(res, 422, r); }
    if (p === '/api/ops/mach-db' && req.method === 'GET') { if (!app.machDb) return send(res, 200, { ok: false }); if (url.searchParams.get('run') === '1' && localOrSigned(req)) app.machDb.run(); return send(res, 200, { ok: true, ...app.machDb.status() }); }   /* v91.17.182 */
    if (p === '/api/ops/fcarchive' && req.method === 'GET') { if (customerView(req)) return send(res, 404, { ok: false, why: 'not found' }); return send(res, 200, fcArchiveStatus(root)); }   /* v91.17.283.33 · operator status of the forecast archive */
    if (p === '/api/ops/pyjobs' && req.method === 'GET') { if (!app.pyJobs) return send(res, 200, { ok: false }); const id = url.searchParams.get('run'); if (id && localOrSigned(req)) { if (id === 'omArchive') { if (app.omArchive) app.omArchive.tick('manual'); } else app.pyJobs.run(id); } return send(res, 200, { ok: true, ...app.pyJobs.status(), omArchive: app.omArchive ? app.omArchive.status() : null }); }   /* v91.17.260 */
    if (p === '/api/ops/copies' && req.method === 'GET') { if (!app.copies) return send(res, 200, { ok: false }); if (url.searchParams.get('run') === '1' && localOrSigned(req)) await app.copies.run(); return send(res, 200, { ok: true, ...app.copies.status(), fleet: app.fleet && app.fleet.status ? (() => { try { const f = app.fleet.status(); return { copy: f.copy || null, copyPolls: f.copyPolls || 0, polls: f.polls }; } catch { return null; } })() : null, metarSource: app.synop && app.synop.status ? app.synop.status().metarSource || null : null, openaqSource: app.openaq && app.openaq.status ? app.openaq.status().source || null : null, ewsAppend: app.pyJobs && app.pyJobs.status ? (app.pyJobs.status().jobs || []).find((j) => j.id === 'ewsAppend') || null : null }); }   /* v91.17.269 (was /api/ops/lamha) */
    /* v91.17.273 · ACC · the accuracy monitor, operator only (skill numbers never reach the client view): ?run=1 runs it now, ?selftest=1
       replays the copied MACH database days with the live layer from every reading (as served before the stuck-reading hotfix) and
       from the screened readings, by city and PKT part of day */
    /* v91.17.275 · ARCH (V-01) · the monthly forecast score (data/score-monthly.json, scripts/arch275/score_monthly.py): operator only */
    if ((p === '/api/score/monthly' || p === '/api/ops/score') && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' });
      try { const f = join(dataDir, 'score-monthly.json'); if (!existsSync(f)) return send(res, 200, { ok: false, why: 'no monthly score yet (scripts/arch275/score_monthly.py)' });
        const mt = statSync(f).mtimeMs; if (!SCORE_M.v || SCORE_M.mt !== mt) SCORE_M = { mt, v: JSON.parse(readFileSync(f, 'utf8')) }; return send(res, 200, { ok: true, ...SCORE_M.v }); }
      catch (e) { return send(res, 200, { ok: false, why: 'score file unreadable: ' + e.message }); } }
    if ((p === '/api/accuracy' || p === '/api/ops/accuracy') && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); if (!app.accMon) return send(res, 200, { ok: false, why: 'accuracy monitor not running' });
      if (url.searchParams.get('backfill') === '1') await app.accMon.backfill({ force: url.searchParams.get('force') === '1' });
      if (url.searchParams.get('run') === '1') await app.accMon.run();
      if (url.searchParams.get('selftest') === '1') return send(res, 200, { ok: true, selftest: await app.accMon.selftest({ basis: url.searchParams.get('basis') || undefined, detailAt: url.searchParams.get('at') || undefined, detailCity: url.searchParams.get('city') || undefined, fromMs: url.searchParams.get('from') ? Date.parse(url.searchParams.get('from')) : undefined }) });
      return send(res, 200, { ok: true, ...app.accMon.status() }); }
    if (p === '/api/ops/ens-archive' && req.method === 'GET') { if (!app.ensArchive) return send(res, 200, { ok: false }); if (url.searchParams.get('run') === '1' && localOrSigned(req)) app.ensArchive.run(); return send(res, 200, { ok: true, ...app.ensArchive.status() }); }   /* v91.17.178 */
    /* v91.17.283.31 · data lane · the EWS register (internal, operator): posts placed, held, down, the down posts' last valid reading */
    /* v91.17.283.41 · item 36 · the EWS live anchor's state for the operator and the deploy check: shadow, hook, live pointer, serving (read only) */
    /* v91.17.283.47 (NIGRAAN 1.0.9) · the WN3 shadow (operator): the verification agent's summary and look (data/agents/verify/wn3-shadow-promotion.json)
       and the runs held (data/archive/wn3); NIGRAAN_WN3_SHADOW=0: { on: false } and nothing is read. Never served. */
    if (p === '/api/ops/wn3shadow' && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' });
      if (process.env.NIGRAAN_WN3_SHADOW === '0') return send(res, 200, { ok: true, on: false, why: 'NIGRAAN_WN3_SHADOW=0' });
      let P = null, runs = []; try { P = JSON.parse(readFileSync(join(dataDir, 'agents', 'verify', 'wn3-shadow-promotion.json'), 'utf8')); } catch (_) { P = null; }
      try { runs = readdirSync(join(dataDir, 'archive', 'wn3')).filter((f) => /^wn3_\d{8}_00\.json\.gz$/.test(f)).sort().slice(-14).map((f) => f.slice(4, 12)); } catch (_) { runs = []; }
      return send(res, 200, { ok: true, on: existsSync(join(dataDir, 'wn3-shadow.json')), served: false, runsHeld: runs, summary: P }); }
    /* v91.17.283.48 (NIGRAAN 1.0.9) · item 6 · THE PAKISTAN MODEL SCORECARD: which model is best where (ECMWF 9 km, WeatherNext 3, NIGRAAN served)
       by variable x zone x day 1-3, from the locked scorers' outputs (data/model-scorecard.json, built and refreshed monthly by the pyjob
       modelScorecard, station-lake/scripts/model_scorecard.py). Operator: the whole table, the caveat (the served comparison gave WN3 an
       information advantage) and the live shadow summary; customer: one line and the attribution. Read only; nothing served reads it. */
    if (p === '/api/ops/scorecard' && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' });
      let S = null, P = null; try { S = JSON.parse(readFileSync(join(dataDir, 'model-scorecard.json'), 'utf8')); } catch (_) { S = null; }
      try { P = JSON.parse(readFileSync(join(dataDir, 'agents', 'verify', 'wn3-shadow-promotion.json'), 'utf8')); } catch (_) { P = null; }
      if (!S) return send(res, 200, { ok: false, why: 'no scorecard yet (data/model-scorecard.json): the monthly job modelScorecard builds it' });
      return send(res, 200, { ok: true, ...S, liveShadow: process.env.NIGRAAN_WN3_SHADOW === '0' ? { on: false } : { on: existsSync(join(dataDir, 'wn3-shadow.json')), summary: P } }); }
    if (p === '/api/sources/scorecard' && req.method === 'GET') {   /* under /api/sources/: the licence register keeps its credits (server.mjs agency scrub exemption) */
      let S = null; try { S = JSON.parse(readFileSync(join(dataDir, 'model-scorecard.json'), 'utf8')); } catch (_) { S = null; }
      if (!S || !S.customerLine) return send(res, 200, { ok: false, why: 'not available' });
      return send(res, 200, { ok: true, line: S.customerLine, attribution: S.attribution || [], built: S.refresh && S.refresh.at || S.built || null }); }
    if (p === '/api/ops/ewsanchor' && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); try { return send(res, 200, app.ewsAnchor ? { ok: true, ...app.ewsAnchor.status() } : { ok: false, why: 'not started' }); } catch (e) { return send(res, 200, { ok: false, why: String(e.message).slice(0, 120) }); } }
    if (p === '/api/ops/ews-register' && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' });
      let R = null, st = null; try { R = JSON.parse(readFileSync(join(dataDir, 'ews-register.json'), 'utf8')); } catch (_) {} try { st = JSON.parse(readFileSync(ownPath31(root, 'data', 'pmd', 'ews_live', 'register_status.json'), 'utf8')); } catch (_) {}
      return send(res, 200, { ok: !!R, register: R, status: st || { why: 'written by the EWS fetch at its next run' } }); }
    if (p === '/api/ops/drop' && req.method === 'GET') { if (!app.dropImport) return send(res, 200, { ok: false }); if (url.searchParams.get('run') === '1' && localOrSigned(req)) app.dropImport.run(); return send(res, 200, { ok: true, ...app.dropImport.status() }); }   /* v91.17.92 */
    if (p === '/api/hyperlocal/moist' && req.method === 'GET') { if (!app.moist) return send(res, 200, { ok: false }); const st = app.moist.status(); if (!viewOp(req) && st.ok) { for (const k of ['dew', 'wind']) for (const z of Object.values(st[k].zones)) { delete z.heldOut; delete z.events; delete z.synop; delete z.leads; delete z.why; } } return send(res, 200, { ...st, selfcheck: app.moist.selfcheck() }); }   /* v91.17.177 */
    if (p === '/api/hyperlocal/humwind' && req.method === 'GET') { if (!app.humWind) return send(res, 200, { ok: false }); const st = app.humWind.status(); if (!viewOp(req)) delete st.heldOut; return send(res, 200, { ...st, selfcheck: app.humWind.selfcheck() }); }   /* v91.17.92 */
    if (p === '/api/hyperlocal/national' && req.method === 'GET' && !viewOp(req)) { /* v91.17.101 · audit L5 · networks, station ids and held-out scores are operator-only */ const st = app.national ? app.national.status() : null; return send(res, 200, st ? { ok: st.ok, enabled: st.enabled, version: st.version, built: st.built } : { ok: false }); }
    if (p === '/api/hyperlocal/national' && req.method === 'GET') return send(res, 200, app.national ? { ...app.national.status(), selfcheck: app.national.selfcheck() } : { ok: false, why: 'not loaded' });
    /* v91.17.283.11 · ONE CALCULATION POINT (pointstate.mjs): the state of a point computed once per (0.01 deg point, model run) and read
       by every Overview widget: the popup, the 24-hour strip, "Temperature now nearby", the map chips and the left-panel cards */
    if (p === '/api/pointstate/sweep-near' && req.method === 'GET') {   /* r42 · 1.0.6 · temperature now nearby from the tehsil sweep (areaheat.mjs nearNow): no new provider call */
      const la = Number(url.searchParams.get('lat')), lo = Number(url.searchParams.get('lon')), kq = Number(url.searchParams.get('km') || 12), lq = Number(url.searchParams.get('limit') || 40);
      if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return send(res, 400, { ok: false, error: 'bad_point' });
      if (!app.areaHeat || !app.areaHeat.nearNow) return send(res, 200, { ok: false, why: 'the tehsil sweep is not running on this server', places: [] });
      return send(res, 200, app.areaHeat.nearNow(la, lo, Math.min(30, Math.max(1, Number.isFinite(kq) ? kq : 12)), Math.min(60, Math.max(1, Number.isFinite(lq) ? Math.round(lq) : 40)))); }
    if (p === '/api/pointstate/sweep-labels' && req.method === 'GET') {   /* r43 · 1.0.7 · the Overview map's "°C air now" labels (areaheat.mjs labelsNow): read only */
      if (!app.areaHeat || !app.areaHeat.labelsNow) return send(res, 200, { ok: false, why: 'the tehsil sweep is not running on this server', places: [] });
      return send(res, 200, app.areaHeat.labelsNow()); }
    if (p === '/api/pointstate/area-heat' && req.method === 'GET') {   /* v91.17.283.12 · status of the area heat (?run=1 operator: recompute now) */
      if (!app.areaHeat) return send(res, 200, { on: false });
      if (url.searchParams.get('run') === '1' && localOrSigned(req)) app.areaHeat.refresh(true).catch(() => {});
      const u = url.searchParams.get('unit'); return send(res, 200, { ...app.areaHeat.status(), ...(u ? { unit: u, value: app.areaHeat.unit(u) } : {}) }); }
    if (p === '/api/pointstate/product' && req.method === 'GET') {   /* v91.17.283.15 · item 3: one record per product, place and run (pointprod.mjs) */
      if (!app.pointProducts) return send(res, 503, { ok: false, why: 'point products not running' });
      const r = await app.pointProducts.get(url.searchParams.get('name'), Object.fromEntries(url.searchParams)); if (r.validUntil) res.setHeader('x-agn-valid-until', r.validUntil); if (r.basis) res.setHeader('x-agn-climate-basis', r.basis);
      /* v91.17.283.31 · data lane · the model's river FLOWS never leave this server: the change only (every view) */
      if (url.searchParams.get('name') === 'riverflow' && r.status === 200 && r.body) { const b = Array.isArray(r.body) ? r.body : [r.body];
        const tr = b.map((x) => ({ ...x, daily: null, change: flowChangeOnly(x && x.daily), flowsWithheld: 'model river flows are not shown (they read 1.2-7.7x the measured flow); the day-to-day change only' }));
        return send(res, 200, Array.isArray(r.body) ? tr : tr[0]); }
      return send(res, r.status, r.body); }
    /* v91.17.283.31 · owner 1.5 · readiness for the page's backend badge */
    if ((p === '/api/readiness' || p === '/api/ready/products') && req.method === 'GET') return send(res, 200, readiness(app));
    /* v91.17.283.31 · data lane · the measured river stations (observed fact) and their days 1-3 (flow carried forward with the model's change) */
    if (p === '/api/river/measured' && req.method === 'GET') { const S = app.riverSheet.stations(); const st = url.searchParams.get('station');
      if (st) { const one = S.ready ? S.stations.find((x) => x.station.toLowerCase() === st.toLowerCase()) : null; if (!one) return send(res, 404, { ok: false, why: S.ready ? 'no such station' : S.why }); return send(res, 200, { ok: true, ...(await app.riverSheet.forecast(one)) }); }
      return send(res, 200, { ok: S.ready, ...S, skill: S.ready ? { days13: 'status carried forward: POD / FAR 0.80 / 0.20 (day 1), 0.68 / 0.32 (day 2), 0.57 / 0.43 (day 3)' } : undefined }); }
    if (p === '/api/pointstate/run' && req.method === 'GET') {   /* v91.17.283.12 · the run stamp the page store watches */
      if (!app.pointState || !app.pointState.runStamp) return send(res, 503, { ok: false, why: 'point state not running' });
      /* v91.17.283.15 · item 4: the issued levels' own stamp (engine report + server hazard science + area heat), so the page's levels
         caches refresh when it changes and never on a timer. v91.17.283.19: bundleStamp, the stamp of the place bundles (GET /api/point:
         model run + live-station read + issued levels); a page keeps a bundle while it is the same */
      return send(res, 200, { ...app.pointState.runStamp(), levels: levelsStampOf(), bundleStamp: app.point ? app.point.stamp() : null }); }
    /* v91.17.283.19 · ONE SERVER CALL DRIVES THE PAGE (server/api/point.mjs): the place bundle, and the corrected records of many points
       (the map's city labels) in one request. They replace /api/pointstate (single, /batch, /near), /api/fleet/nearest, /api/place/facts,
       /api/site/risk and /screening, /api/flood/riverlink, /api/glof/upstream, /api/climatology/baseline, /api/report/pointrun and the
       per-place reads of the levels, outlook, smog, rain chance, past 30 days and report context. */
    if ((p === '/api/point' || p === '/api/point/batch') && req.method === 'GET') {
      if (!app.point || !app.pointState) return send(res, 503, { ok: false, why: 'the place bundle is not running' });
      const view = viewOp(req) ? 'operator' : 'customer', out = (b) => send(res, 200, view === 'operator' ? b : customerScrub(b));
      try {
        if (p === '/api/point') { const q = Object.fromEntries(url.searchParams);
          if (q.id == null || q.id === '') { const c = coord(url.searchParams);   /* v283.24: a point outside the window is outside the NIGRAAN area (outside: true, as the record of an outside point inside it) */
            if (c.outside) return send(res, 200, { ok: false, outside: true, why: 'outside Pakistan-administered territory: no forecast or hazard level is computed here' });   /* v283.24 integration: the words of pointstate.mjs for an outside point */
            if (c.error) return send(res, 400, { ok: false, why: c.error }); }
          return out(await app.point.bundle(q, { view, fresh: q.fresh === '1', complete: q.complete === '1' })); }
        const raw = String(url.searchParams.get('pts') || '').split(';').map((x) => x.trim()).filter(Boolean);
        /* with=place,siteScreening,siteRisk,levels,outlook,past30: those parts for every point too (a portfolio of sites: one request, at most 60 sites);
           a site may carry its floor height as a third number (lat,lon,floor) */
        const withP = String(url.searchParams.get('with') || '').split(',').map((x) => x.trim()).filter(Boolean);
        if (withP.some((x) => !app.point.batchParts.includes(x))) return send(res, 400, { error: 'with: ' + app.point.batchParts.join(', ') + ' only' });
        if (!raw.length) return send(res, 400, { error: 'pts=lat,lon;lat,lon... required' });
        const heavy = withP.filter((x) => x !== 'inputs').length;   /* v91.17.283.20 · inputs (the district rows' model inputs) is light: 600 points */
        if (raw.length > (heavy ? 60 : 600)) return send(res, 400, { error: 'at most ' + (heavy ? 60 : 600) + ' points per batch' });   /* the map's national lists in one request (the server asks the provider 40 locations at a time) */
        const pts = raw.map((x) => { const [a, b, f] = x.split(',').map(Number); return { lat: a, lon: b, floor: Number.isFinite(f) ? f : null }; });
        if (pts.some((q) => !Number.isFinite(q.lat) || !Number.isFinite(q.lon))) return send(res, 400, { error: 'each point is lat,lon in decimal degrees' });
        /* v91.17.283.38 · item 4: the district rows (with=inputs only, the analyst page's one district batch) are served from the answer kept
           for this place list and bundle stamp: built once, rebuilt in the background when the stamp changes (each hour and each run) */
        if (withP.length === 1 && withP[0] === 'inputs') return districtServe(res, url.searchParams.get('pts'), pts, view);
        const r = await app.point.batch(pts, { with: withP, view });
        return out({ ok: true, n: r.length, states: r });
      } catch (e) { return send(res, 200, { ok: false, why: 'the place bundle is not available: ' + clientWhy(e) }); }
    }
    /* v91.17.283.37 · the national hazard surface (hazardgrid.mjs): built in the background once per forecast cycle; a request only reads it.
       /api/hazardgrid/status and /points are operator checks */
    if (p === '/api/hazardgrid' && req.method === 'GET') { if (!app.hazardGrid) return send(res, 503, { ok: false, why: 'the hazard surface is not running' });
      const r = app.hazardGrid.serve(url.searchParams.get('day') ?? '0'); return send(res, r.status || 200, r); }
    if (p === '/api/hazardgrid/status' && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); return send(res, 200, app.hazardGrid ? app.hazardGrid.status() : { on: false }); }
    if (p === '/api/hazardgrid/points' && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); return send(res, 200, (app.hazardGrid && app.hazardGrid.points()) || { ready: false }); }
    if (p === '/api/hazardgrid/build' && req.method === 'POST') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); if (!app.hazardGrid) return send(res, 503, { ok: false });
      const r = app.hazardGrid.build('operator'); return send(res, 202, { ok: true, started: true, note: 'building in the background: see /api/hazardgrid/status' }); }
    if (p === '/api/hyperlocal/inject' && req.method === 'POST') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); let b = ''; for await (const ch of req) b += ch; let j = null; try { j = JSON.parse(b || '{}'); } catch { return send(res, 400, { error: 'bad_json' }); } return send(res, 200, app.hyperlocal.inject(j.rows)); }
    if (p === '/api/fleet/history' && req.method === 'GET') { const st = url.searchParams.get('station'); const ap = url.searchParams.get('city'); return send(res, 200, st ? app.fleetHistory.station(st) : ap ? app.fleetHistory.city(ap) : app.fleetHistory.summary()); }   /* v91.17.63 */
    if (p === '/api/fleet/uhi-check' && req.method === 'GET') return send(res, 200, app.fleetHistory.uhiCheck());   /* v91.17.63 */
    if (p === '/api/fleet/urban' && req.method === 'GET') {   /* v91.17.64 · the fleet urban term at a point */
      if (!url.searchParams.get('lat')) return send(res, 200, app.fleetHistory.urbanStatus());
      const c = coord(url.searchParams); if (c.error) return send(res, 400, { error: c.error });
      const at = url.searchParams.get('at') ? Date.parse(url.searchParams.get('at')) : Date.now(); const elev = url.searchParams.get('elev') != null ? Number(url.searchParams.get('elev')) : app.fleetHistory.proxyElevM(c.lat, c.lon);
      const mosA = !!(app.mos && elev != null && app.mos.adjust(c.lat, c.lon, elev, at, 25).applied);
      return send(res, 200, { lat: c.lat, lon: c.lon, at: new Date(at).toISOString(), airportCorrectionOnPoint: mosA, ...app.fleetHistory.urbanTerm(c.lat, c.lon, at, mosA) });
    }
    if (p === '/api/fleet/history' && req.method === 'PUT') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); app.fleetHistory.reload(); return send(res, 200, { reloaded: app.fleetHistory.ready() }); }
    if (p === '/api/mos/blend' && req.method === 'GET') return send(res, 200, app.blend ? app.blend.status() : { on: false });   /* v91.17.267 · operator: the plains multi-model start (gate, weights, budget) */
    if (p === '/api/mos/weather' && req.method === 'GET') return send(res, 200, app.wxmos ? app.wxmos.status() : { on: false });   /* v91.17.187 */
    if (p === '/api/mos/learned' && req.method === 'GET') return send(res, 200, app.mlMos.status());   /* v91.17.59 */
    /* v91.17.61 · the pool for a point: ?lat&lon[&elev][&days=7] */
    if (p === '/api/pool/point' && req.method === 'GET') {
      const c = coord(url.searchParams); if (c.error) return send(res, 400, { error: c.error });
      const elev = url.searchParams.get('elev') == null ? null : Number(url.searchParams.get('elev')); if (elev != null && !Number.isFinite(elev)) return send(res, 400, { error: 'elev must be a number' });
      const days = intIn(url.searchParams.get('days'), 1, 10, 7); if (days == null) return send(res, 400, { error: 'days must be an integer 1-10' });
      try { return send(res, 200, await app.pool.point({ lat: c.lat, lon: c.lon, elevM: elev, days, ai: poolAi(req, url) })); }
      catch (e) { return send(res, 502, { error: 'pool_failed', message: e.message }); }
    }
    /* v91.17.84 · CEO: "put our own AI model" in the Predictions pane. The NIGRAAN AI local temperature correction for one point:
       per Pakistan day the served basis (best_match or the zone model, raw) daily high / low and the AI term, and the next 72 h
       hourly raw vs corrected (the day / night weighting the served path uses). The term is the one the served card took
       (servedTerm) when held, else the model's residual on this response's own day inputs. No skill figure is returned here. */
    if (p === '/api/pool/rule' && req.method === 'GET') { const sk = app.pool.skill(); return send(res, 200, { models: app.pool.MODELS, families: app.pool.FAMILY, notPooled: app.pool.NOT_POOLED, aiShadow: app.pool.AI_SHADOW, aiInPoolByDefault: app.pool.aiDefault(), aiSwitch: { file: 'data/pool-ai.json', restoredBy: app.pool.aiSource() }, pooledByDefault: app.pool.modelsFor(app.pool.aiDefault()), skillRegistry: sk ? { built: sk.built, window: sk.window, cellsWithWeights: sk.cellsWithWeights, cellsWithout: sk.cellsWithout, rule: sk.rule, zones: sk.zones } : null }); }
    /* v91.17.79 · CEO: rank the model list by MEASURED accuracy at this zone | season | lead, not by agreement with the mean.
       Rank order and pool weight only: the error figures themselves stay internal (CEO decision 1). */
    /* v91.17.79 · CEO: one site card instead of the standing sector matrix, the fixed pathway chains and the blocked engineering table */
    /* v91.17.207 · river flood depth of return period 10-500 years at a point (JRC / GloFAS v2.1.2, undefended), with the floor test when floor= is given */
    if (p === '/api/flood/depth' && req.method === 'GET') { const c = coord(url.searchParams); if (c.error) return send(res, 400, { error: c.error }); const fl = url.searchParams.get('floor');
      return send(res, 200, app.floodDepth.at(c.lat, c.lon, fl != null && fl !== '' && Number.isFinite(Number(fl)) ? Number(fl) : null)); }
    /* v91.17.207 · phase B · the default operating limits of an asset type (data/asset-operations.json): each from a published scale or standard,
       ready for POST /api/limits/evaluate; the client confirms or replaces them */
    if (p === '/api/site/operations' && req.method === 'GET') { let O = null; try { O = JSON.parse(readFileSync(join(dataDir, 'asset-operations.json'), 'utf8')); } catch (_) { O = null; }
      if (!O) return send(res, 404, { error: 'asset_operations_missing' }); const t = String(url.searchParams.get('type') || '').toLowerCase().trim();
      const key = O.types[t] ? t : Object.keys(O.types).find((k) => t.includes(k) || k.includes(t)) || null;
      return send(res, 200, { version: O.version, type: key, asked: t, limits: key ? O.types[key].map((x) => ({ ...x, sourceText: O.sources[x.source] || x.source, default: true })) : [], types: Object.keys(O.types), what: O.what }); }
    if (p === '/api/pool/rank' && req.method === 'GET') { const elev = Number(url.searchParams.get('elev')); const lead = Math.min(3, Math.max(1, Number(url.searchParams.get('lead')) || 1));
      const variable = /^(precipitation|wind_speed_10m|temperature_2m)$/.test(url.searchParams.get('var') || '') ? url.searchParams.get('var') : 'temperature_2m';
      return send(res, 200, poolRankOf(elev, variable, lead)); }
    if (p === '/api/pool/skill' && req.method === 'GET') { const sk = app.pool.skill(); if (!sk) return send(res, 404, { ok: false, why: 'data/model-skill.json missing (LEARN_NIGRAAN.bat skill)' }); const cell = url.searchParams.get('cell'); return send(res, 200, cell ? { cell, ...(sk.cells[cell] || { missing: true }) } : { built: sk.built, window: sk.window, rule: sk.rule, cells: Object.fromEntries(Object.entries(sk.cells).map(([k, c]) => [k, { stations: c.stations, weights: c.weights ? Object.fromEntries(Object.entries(c.weights).map(([m, w]) => [m, w.w])) : null, why: c.why }])) }); }
    /* v91.17.68 · the gauge check behind the hourly rain probability: the grid's wet-hour frequency against 46 gauges,
       the frequency-matched threshold per group, the skill that remains after matching */
    if (p === '/api/verification/wet-hours' && req.method === 'GET') {
      /* v91.17.71 · per-gauge and per-group scores against partner rain gauges are station-measured skill figures: internal
         (NIGRAAN_INTERNAL_REF=1, or internal QA on this machine with x-agn-qa). The customer chance of rain is matched to
         IMERG (pool.mjs, v91.17.70) and does not read this file. */
      if (!internalNames() && !qaOkOf(req)) return send(res, 200, { ok: false, internal: true, why: 'the rain-gauge check behind the hourly rain chance is an internal verification record; the served chance of rain is matched to NASA IMERG satellite rain' });
      try { const f = join(dataDir, 'ens-wet-reliability.json'); if (!existsSync(f)) return send(res, 404, { ok: false, why: 'no gauge check on this install: run station-lake/scripts/ens_wet_reliability.py (LEARN_NIGRAAN.bat rainprob)' }); return send(res, 200, { ok: true, ...JSON.parse(readFileSync(f, 'utf8')) }); } catch (e) { return send(res, 500, { ok: false, why: e.message }); }
    }
    /* ══ v91.17.66 · THE CASEBOOK ═══════════════════════════════════════════════════════════════════════════ */
    if (p.startsWith('/api/case/')) {
      const q = url.searchParams; const who = (function () { try { const id = identity.resolve(req); if (id && (id.actorId || id.subject)) return String(id.actorId || id.subject).slice(0, 80); } catch {} return /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || '') ? ('local' + (req.headers['x-agn-actor'] ? ':' + String(req.headers['x-agn-actor']).slice(0, 60) : '')) : 'unsigned'; })();   /* v91.17.68 · a signed actor, or 'local:<name>' on loopback where the header is the operator's own note; never a bare remote header as identity (C27) */
      const guard = () => { if (!localOrSigned(req)) { send(res, 401, { error: 'auth_required' }); return false; } return true; };
      try {
        if (p === '/api/case/status' && req.method === 'GET') return send(res, 200, app.casebook.status());
        if (p === '/api/case/project' && req.method === 'GET') { const id = q.get('id'); if (!id) return send(res, 200, { projects: app.casebook.listProjects() }); const P = app.casebook.getProject(id); return P ? send(res, 200, P) : send(res, 404, { ok: false, why: 'no project ' + id }); }
        if (p === '/api/case/project' && req.method === 'PUT') { if (!guard()) return; const body = await readBody(req); return send(res, 200, await app.casebook.putProject(body, who)); }
        if (p === '/api/case/asset' && req.method === 'GET') { const P = app.casebook.getProject(q.get('project') || ''); if (!P) return send(res, 404, { ok: false, why: 'no project' }); const A = (P.document.assets || []).find(a => String(a.asset_id || a.name) === String(q.get('asset'))); if (!A) return send(res, 404, { ok: false, why: 'no asset' }); return send(res, 200, app.casebook.assetWithProvenance(P, A)); }
        if (p === '/api/case/asset/fields' && req.method === 'PUT') { if (!guard()) return; const body = await readBody(req); return send(res, 200, { fields: await app.casebook.setFields(String(body.projectId || ''), String(body.assetId || ''), body.fields, who) }); }
        if (p === '/api/case/interventions' && req.method === 'GET') return send(res, 200, { interventions: app.casebook.interventions(q.get('project') || '', q.get('asset') || null) });
        if (p === '/api/case/interventions' && (req.method === 'POST' || req.method === 'PUT')) { if (!guard()) return; const body = await readBody(req); return send(res, req.method === 'POST' ? 201 : 200, await app.casebook.upsertIntervention(body, who)); }
        if (p === '/api/case/interventions' && req.method === 'DELETE') { if (!guard()) return; return send(res, 200, { removed: await app.casebook.removeIntervention(q.get('id') || '') }); }
        if (p === '/api/case/document' && req.method === 'GET') { const d = await app.casebook.document({ projectId: q.get('project') || '', assetId: q.get('asset') || '' }); return send(res, d.ok ? 200 : 404, d); }
        if (p === '/api/case/snapshot' && req.method === 'POST') { if (!guard()) return; const body = await readBody(req); return send(res, 201, await app.casebook.snapshot({ projectId: String(body.projectId || ''), assetId: String(body.assetId || ''), label: body.label }, who)); }
        if (p === '/api/case/history' && req.method === 'GET') return send(res, 200, app.casebook.history(q.get('project') || '', q.get('asset') || ''));
        /* v91.17.67 · the portfolio over every asset of a project, and the report families with their gates */
        if (p === '/api/case/portfolio' && req.method === 'GET') { const d = await app.casebook.portfolio(q.get('project') || ''); return send(res, d.ok ? 200 : 404, d); }
        if (p === '/api/case/families' && req.method === 'GET') return send(res, 200, app.casebook.families());
        return send(res, 404, { ok: false, why: 'no such casebook route' });
      } catch (e) { return send(res, e.status || 422, { ok: false, why: e.message }); }
    }
    if (p === '/api/pool/skill' && req.method === 'PUT') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); app.pool.reloadSkill(); return send(res, 200, { reloaded: !!app.pool.skill() }); }
    if (p === '/api/mos/learned' && req.method === 'PUT') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); app.mlMos.reload(); return send(res, 200, app.mlMos.status()); }
    /* v91.17.27 · P4-11 · USGS reached through this server, so the browser talks only to localhost (v91.17.269: met.no is no longer used) */
    if ((p.startsWith('/api/quake/') || p === '/api/ext/usgs') && app.quake) { const r = await app.quake.route(p, url, req); if (r) return send(res, r.status, r.body, r.headers); }   /* v91.17.77 · Q */
    /* v91.17.103 · the model gate: public summary (no sources or skill), and the full gate with the rule ledger for the operator */
    /* v91.17.104 · the page's hourly record of what it showed, and its self-check (this computer only); operator reads */
    if ((p === '/api/shown/report' || p === '/api/selfcheck/report') && req.method === 'POST' && app.shown) { /* a write-only record of what this computer's page showed: loopback is enough, customer view included (it is what customers saw); never readable without operator scope */ if (!loopbackDirect(req) && !localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' });   /* v91.17.283 · WS1 · C-01 · a relayed request (forwarding header, non-loopback Host) is not this computer's page */
      let body = null; try { body = await readBody(req); } catch { return send(res, 422, { error: 'bad_json' }); }
      return send(res, 200, p === '/api/shown/report' ? app.shown.reportShown(body) : app.shown.reportSelfcheck(body)); }
    if (p === '/api/engine/report' && req.method === 'POST' && app.engine) { /* v91.17.106 · from the engine page on this computer only; v91.17.283 · WS1 · C-01 · an internal caller, never a request relayed by the proxy */ if (!internalCaller(req)) return send(res, 403, { error: 'internal_only', why: 'engine reports are accepted only from this server\'s own engine runner' });
      let body = null; try { body = await readBody(req); } catch { return send(res, 422, { error: 'bad_json' }); } const out = app.engine.report(body); if (out && out.ok) engineRunNote(); return send(res, 200, out); }   /* v91.17.283 · WS1 · PATCH3 · the run label */
    if (p === '/api/alerts' && req.method === 'GET' && app.engine) { const op = viewOp(req); return send(res, 200, servedAlerts(app.engine.alerts(), op)); }   /* v91.17.224 · audit D-27 · the one alert list; v91.17.283 · WS1 for WS4: client rules (served.mjs) */
    if (p === '/api/verdicts' && req.method === 'GET' && app.engine) return send(res, 200, app.engine.verdicts());   /* v91.17.226 · the district board, as the engine derived it */
    if (p === '/api/levels' && req.method === 'GET' && app.engine) { const op = viewOp(req);
      /* v91.17.283.20 · item B6: layers=a,b,c answers every named layer in one response ({ layers: { a: <the layer answer> ... } }) */
      const many = url.searchParams.get('layers'); if (many != null) { const ks = many.split(',').map((x) => x.trim()).filter(Boolean); if (!ks.length || ks.length > 40 || ks.some((k) => !/^[a-z0-9_]{1,40}$/.test(k))) return send(res, 400, { error: 'layers=<layer>,<layer>... (at most 40)' });
        const day = url.searchParams.get('day'); const L = {}; for (const k of ks) L[k] = servedLevels(k, day, op); return send(res, 200, { ok: true, day: Number(day) || 0, layers: L }); }
      return send(res, 200, servedLevels(url.searchParams.get('layer'), url.searchParams.get('day'), op)); }   /* v91.17.283 · WS1 for WS4 */
    /* v91.17.283.20 · item B4 · the level words and the heat and cold legends, generated from the thresholds register (data/thresholds-register.json:
       utci.classes, utci.levels); every legend of the pages is drawn from this answer, read once per page load */
    if (p === '/api/registry/levels' && req.method === 'GET') return send(res, 200, levelLegends());
    /* v91.17.283.15 · item 8: the served levels of many tehsils in ONE request (Customize's site portfolio asked once per site: 32 requests):
       ?units=<uid>;<uid>;... (at most 200), each answer exactly what /api/levels/unit answers for it */
    if (p === '/api/levels/units' && req.method === 'GET' && app.engine) { const op = viewOp(req); const ids = [...new Set(String(url.searchParams.get('units') || '').split(';').map((x) => x.trim()).filter(Boolean))].slice(0, 200);
      return send(res, 200, { ok: true, units: Object.fromEntries(ids.map((u) => [u, withRun(servedUnit(app, u, op))])) }); }
    if (p === '/api/levels/unit' && req.method === 'GET' && app.engine) { const op = viewOp(req); const U = withRun(servedUnit(app, url.searchParams.get('unit') || '', op)); if (!(U && U.ready !== false && U.unit)) return send(res, 200, U); const ref = app.refLayers.unit(U.unit); return send(res, 200, { ...U, reference: ref, ...notRelevantOf(U, ref) }); }   /* v283.31 · 1.2/1.3 the reference classes of the tehsil */   /* v91.17.283 · WS1 for WS4: served.mjs (hidden layers, substitutes, product type per level, alert gate, reasons) */
    if (p === '/api/ops/diag/profile' && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); return send(res, 200, app.diag.start(url.searchParams.get('seconds'), { heap: url.searchParams.get('heap') === '1' })); }   /* v91.17.232 · v236 heap=1 */
    if (p === '/api/ops/diag/status' && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); return send(res, 200, app.diag.status()); }   /* v91.17.232 */
    if (p === '/api/ops/caps' && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); return send(res, 200, capReport()); }   /* v91.17.108 · audit F8 */
    if (p === '/api/ops/budget' && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' });   /* v91.17.283 · WS1 · PATCH3 · today's use by tier, what was shed, test mode, the 30-day projection */
      return send(res, 200, { budget: callBudget.status(), answerCache: modelRuns.status().answerCache, proxyRunMemo: app.pxRunMemoStats ? app.pxRunMemoStats() : null, levelsModelRun: modelRunOf() }); }
    /* v91.17.283.40 · C11 multi-model blend (mmblend42.mjs): status, the day's call cap counter, and for ?lat&lon one place (zone, served / shadow cells, last application) */
    if (p === '/api/ops/mm42' && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); const M = app.mm42; if (!M) return send(res, 200, { ok: true, on: false, why: 'not loaded' });
      const la = Number(url.searchParams.get('lat')), lo = Number(url.searchParams.get('lon')); const el = url.searchParams.get('elev'); /* r42: the counters are this process's own (in memory, never a file): pid, start and the build it started with say which process answered */
      return send(res, 200, { ok: true, ...M.status(), server: { pid: process.pid, startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(), build: START_BUILD42 }, ...(Number.isFinite(la) && Number.isFinite(lo) && url.searchParams.get('lat') ? { place: M.place(la, lo, el == null || el === '' ? null : Number(el)) } : {}) }); }
    if (p === '/api/ops/engine' && req.method === 'GET' && app.engine) { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); return send(res, 200, app.engine.status()); }
    if (p === '/api/ops/selfcheck' && req.method === 'GET' && app.shown) { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); return send(res, 200, app.shown.latest() || { ready: false }); }
    if (p === '/api/ops/shown/score' && req.method === 'GET' && app.shown) { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); return send(res, 200, await app.shown.score()); }
    if (p === '/api/gate' && req.method === 'GET' && app.gate) return send(res, 200, app.gate.publicSummary());
    if ((p === '/api/registry/formula' || p === '/api/registry/gate') && req.method === 'GET') {   /* v91.17.283.12 · the formula register and the model gate the page reads as it loads (server/engine/serverfiles.mjs) */
      const t = serverFile(dataDir, p); if (t == null) return send(res, 503, { error: 'not_available', why: 'the server file for ' + p + ' is not in this install' });
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(t); }
    if (p === '/api/ops/gate' && req.method === 'GET' && app.gate) { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); return send(res, 200, app.gate.full()); }
    if (p === '/api/ops/verify' && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' });   /* v91.17.101 · what we said vs what happened (operator-only) */
      let v = null, r = null; try { v = JSON.parse(readFileSync(join(dataDir, 'verify-issued.json'), 'utf8')); } catch (_) {} try { r = JSON.parse(readFileSync(join(dataDir, 'model-registry.json'), 'utf8')); } catch (_) {}
      return send(res, 200, { ok: !!v, verify: v, registry: r ? { built: r.built, summary: r.summary, models: (r.models || []).map(m => ({ id: m.id, predicts: m.predicts, served: m.served, clean: m.clean, findings: m.findings, test: m.test, split: m.split, mitigated: m.mitigated || null, fix: m.fix || null })) } : null,
        why: v ? null : 'no verification report yet (LEARN_ALL runs verify_issued.py nightly)' }); }
    if (p === '/api/ops/models' && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); let j = null; try { j = JSON.parse(readFileSync(join(dataDir, 'model-registry.json'), 'utf8')); } catch { j = null; } return send(res, 200, j || { ready: false, why: 'station-lake/scripts/model_registry.py has not run' }); }   /* v91.17.101 · audit #68 */
    if (p === '/api/vegetation/unit' && req.method === 'GET' && app.vegetation) return send(res, 200, app.vegetation.unit(url.searchParams.get('unit') || '', Number(url.searchParams.get('i')) || 0));   /* v91.17.101 */
    /* v91.17.245 · the Scenario page's rain day on the calibrated landslide likelihood (landslideodds.scenario) */
    if (p === '/api/landslide/odds/scenario' && req.method === 'GET' && app.landslideOdds) {
      const key = String(url.searchParams.get('key') || ''), date = String(url.searchParams.get('date') || ''), mm = Number(url.searchParams.get('mm'));
      if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(mm >= 0 && mm <= 2000)) return send(res, 400, { error: 'key, date (YYYY-MM-DD) and mm (0-2000) are required' });
      return send(res, 200, app.landslideOdds.scenario(key, date, mm)); }
    if (p === '/api/landslide/odds' && req.method === 'GET' && app.landslideOdds) { /* v91.17.112 · customer: the ratio; operator: plus the held-out validation */
      const u = url.searchParams.get('unit'); const N = u ? app.landslideOdds.unit(u) : app.landslideOdds.national(); if (!N.ready) return send(res, 200, N);
      const op = viewOp(req); const out = { ...N };
      out.method = 'a ranking of rain-triggered landslide likelihood on the day against an ordinary day here at this time of year, from the day\u2019s and the 3-day rain (v283 monotone model: more rain never lowers the odds); the number to read is observedRatio: how often slides happened on days in the same model class in the held-out test on recorded landslides 2007-2017 (each year scored by a model that had not seen it); the model\u2019s own ratio overstates it';   /* ratio stays in the answer: it is the ranking score the page places the level on (unchanged) */
      if (op) { out.validation = app.landslideOdds.validation(); out.status = app.landslideOdds.status(); }
      return send(res, 200, out); }
    if (p === '/api/flood/chance' && req.method === 'GET' && app.riverProb) { /* v91.17.105 · customer: chances only; operator: plus the held-out validation */
      const N = app.riverProb.national(); const op = viewOp(req);
      if (!N.ready && op) return send(res, 200, N);
      if (!N.ready) return send(res, 200, { ready: false, withheld: true, why: RIVER_CHANCE_WITHHELD, served: [] });   /* v91.17.283.8 · a client gets the same withheld answer whether or not the job has run */
      const out = { ...N };
      if (op) { try { const M = JSON.parse(readFileSync(join(dataDir, 'river-prob-model.json'), 'utf8')); out.validation = M.validation; out.limits = M.limits; out.gate = M.gate; } catch (_) {} }
      else { /* v91.17.283.8 · science audit · no chance number reaches a client (worse than persistence in both tested monsoons) */
        return send(res, 200, { ready: true, withheld: true, why: RIVER_CHANCE_WITHHELD, version: N.version, forecastAt: N.forecastAt || null, served: [], method: 'chance that the official observed flow class reaches Low / Medium at the reach that day, from the river forecast flow: not shown to clients until it beats persistence' }); }
      return send(res, 200, out); }
    if (p === '/api/rain/chance' && req.method === 'GET' && app.rainChance) { const u = url.searchParams.get('unit'); const _o = u ? app.rainChance.unit(u) : app.rainChance.national();
      if (String(req.headers['x-agn-view'] || '') === 'customer' && _o && typeof _o === 'object') { const c = Object.assign({}, _o); c.target = 'chance that the satellite day rain total (about 10 km, PKT day) reaches the threshold'; c.note = 'Chance of a day rain total at or above the threshold, calibrated against satellite rain and tested on a held-out year.'; delete c.test; c.customerView = true; return send(res, 200, c); }
      return send(res, 200, _o); }   /* v91.17.101 */
    if ((p === '/api/smap' || p.startsWith('/api/smap/')) && app.smap) { if (p === '/api/smap/refresh' && req.method === 'POST') { if (!localOrSigned(req)) return send(res, 401, { error: 'auth_required' }); return send(res, 200, await app.smap.refresh()); } if (p === '/api/smap/status') return send(res, 200, app.smap.status()); if (p === '/api/smap') { const u = url.searchParams.get('unit'); return send(res, 200, u ? (app.smap.unit(u) || { ready: false, unit: u }) : app.smap.national()); } }   /* v91.17.163 */
    if (p === '/api/ops/agents' && req.method === 'GET' && app.agents) { const r = app.agents.route(p, url, { operator: localOrSigned(req) }); if (r) return send(res, r.status, r.body); }   /* v91.17.283.7 · operator only */
    /* v91.17.283.10 · agents 6 and 7: experiments and the weekly proposals (operator only; approve / revert: loopback operator only, typed confirmation, logged) */
    if ((p === '/api/ops/experiments' || p.startsWith('/api/ops/experiments/')) && app.agents && app.agents.exp) { const X = app.agents.exp;
      const customer = String(req.headers['x-agn-view'] || '').toLowerCase() === 'customer';
      if (req.method === 'GET' && (p === '/api/ops/experiments' || p === '/api/ops/experiments/page')) { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' });
        if (p === '/api/ops/experiments/page') { const html = await X.page(); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'; base-uri 'none'" }); return res.end(html); }
        const run = url.searchParams.get('run'); let started = null; if (run === 'exp') { X.runExp(true).catch(() => {}); started = 'exp'; } else if (run === 'proposals') { X.runProposals(true).catch(() => {}); started = 'proposals'; }
        return send(res, 200, app.agents.scrubPaths({ ok: true, started, ...(await X.report()) })); }
      if (req.method === 'POST' && (p === '/api/ops/experiments/approve' || p === '/api/ops/experiments/revert')) {
        const origin = String(req.headers.origin || ''), sfs = String(req.headers['sec-fetch-site'] || '');
        const sameOrigin = (!origin || origin === 'null' ? !origin : /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin) && origin.replace(/^https?:\/\//i, '').toLowerCase() === String(req.headers.host || '').toLowerCase()) && (!sfs || sfs === 'same-origin' || sfs === 'none');
        const raw = await (async () => { const ch = []; let n = 0; for await (const c of req) { n += c.length; if (n > 65536) break; ch.push(c); } return Buffer.concat(ch).toString('utf8'); })();
        const form = /application\/x-www-form-urlencoded/i.test(String(req.headers['content-type'] || ''));
        let body = {}; try { body = form ? Object.fromEntries(new URLSearchParams(raw)) : (raw ? JSON.parse(raw) : {}); } catch { body = {}; }
        const r = await X.act(p.endsWith('/approve') ? 'approve' : 'revert', body, { loopbackOperator: loopbackDirect(req) && localOrSigned(req) && !customer && sameOrigin, customer, remote: req.socket.remoteAddress || '', who: req.headers['x-agn-actor'] ? String(req.headers['x-agn-actor']).slice(0, 60) : 'local' });
        if (form) { res.writeHead(r.status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" }); return res.end('<!doctype html><meta charset="utf-8"><title>NIGRAAN</title><p style="font:15px system-ui,sans-serif">' + (r.body.ok ? 'Done: ' + String(r.body.target || '') + ' now ' + String((r.body.to && (r.body.to.version || r.body.to.file)) || '') : 'Refused: ' + String(r.body.why || r.body.error || '')).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';') + '. The attempt is logged.</p><p><a href="/api/ops/experiments/page">Back to the weekly proposals</a></p>'); }
        return send(res, r.status, app.agents.scrubPaths(r.body)); }
      return send(res, 405, { error: 'method_not_allowed' }); }
    if (p === '/api/ecmwf010/retrain' && req.method === 'GET') { if (!viewOp(req)) return send(res, 403, { ok: false, error: 'operator view only' }); return send(res, 200, { ok: true, ...(app.ifsRetrain ? app.ifsRetrain.status() : { active: false, why: 'not running' }) }); }   /* 28 Oct 2026 · ifsretrain.mjs */
    if (p.startsWith('/api/ecmwf010/') && req.method === 'GET' && app.ecmwf010) { const r = app.ecmwf010.route(p, url, { canRun: localOrSigned(req) }); if (r) return send(res, r.status, r.body); }   /* v91.17.283.2 */
    if ((p === '/api/floodobs' || p.startsWith('/api/floodobs/')) && app.floodobs) { if (p === '/api/floodobs/refresh' && req.method === 'POST') { if (!localOrSigned(req)) return send(res, 401, { error: 'auth_required' }); return send(res, 200, await app.floodobs.refresh(url.searchParams.get('force') === '1')); } const r = app.floodobs.route(p, url); if (r) return send(res, r.status, r.body); }   /* v91.17.152 */
    /* v91.17.216 · active faults (reference layer, public with its credit) */
    if (p === '/api/faults' && req.method === 'GET') { const r = app.faults.layer(); return send(res, r.ok ? 200 : 503, r); }
    if (p === '/api/faults/nearest' && req.method === 'GET') { const la = Number(url.searchParams.get('lat')), lo = Number(url.searchParams.get('lon'));
      if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return send(res, 422, { ok: false, why: 'lat and lon are required' });
      const r = app.faults.nearest(la, lo); return send(res, r.ok ? 200 : 503, r); }
    if (p === '/api/ops/schedule' && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); return send(res, 200, app.scheduler.list()); }   /* v91.17.218 · audit S-11 */
    if (p.startsWith('/api/seismic/') && app.seismic && req.method === 'GET') { const r = app.seismic.route(p, url); if (r) return send(res, r.status, r.body); }   /* v91.17.98 */
    /* v91.17.26 · P1-2 / P1-3 · client operating limits against the named run and the ensemble */
    /* v91.17.32 · IMERG: status (never the token), verification scores, run now */
    if (p === '/api/imerg/status' && req.method === 'GET') return send(res, 200, app.imerg.status());
    if (p === '/api/imerg/verification' && req.method === 'GET') { const v = app.imerg.verification(); return send(res, v ? 200 : 404, v || { ok: false, why: 'no IMERG verification yet' }); }
    if (p === '/api/imerg/run' && req.method === 'POST') { if (!localOrSigned(req)) return send(res, 401, { error: 'auth_required' }); return send(res, 200, await app.imerg.run()); }
    /* v91.17.31 · P6-10 · glacial lakes: register for the map, lakes upstream of a point, SUPARCO bulletin feed */
    if (p === '/api/glof/map' && req.method === 'GET') { const r = app.glof.mapLayer(); return send(res, r.ok ? 200 : 503, r); }
    /* v91.17.37 · A · the Sentinel-2 lake monitor: every measured lake, the expanding ones first */
    /* v91.17.40 · lithology per tehsil and the landslide back-test */
    if (p === '/api/terrain/sponge' && req.method === 'GET') return send(res, 200, app.terrain.sponge());   /* v91.17.184 */
    if (p === '/api/terrain/landcover' && req.method === 'GET') { const id = url.searchParams.get('unit'); if (id) { const r = app.terrain.landcover(id); return r ? send(res, 200, r) : send(res, 404, { error: 'no_landcover', unit: id }); } return send(res, 200, app.terrain.landcoverNational()); }   /* v91.17.48 */
    if (p === '/api/terrain/lithology' && req.method === 'GET') { const id = url.searchParams.get('unit'); if (id) { const r = app.terrain.lithology(id); return r ? send(res, 200, r) : send(res, 404, { error: 'no_lithology', unit: id }); } return send(res, 200, app.terrain.lithologyNational()); }
    if (p === '/api/landslide/calibration' && req.method === 'GET') { const r = app.terrain.calibration(); return send(res, r.ready ? 200 : 404, r); }
    if (p === '/api/landslide/giri' && req.method === 'GET') { const r = app.terrain.giri(url.searchParams.get('unit') || null); return send(res, r.ready ? 200 : 404, r); }   /* v91.17.64 */
    if (p === '/api/landslide/giri' && req.method === 'PUT') { if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required' }); return send(res, 200, { reloaded: app.terrain.reload() }); }   /* v91.17.68 */
    /* v91.17.41 · GLOF trigger outlook per lake and nationally */
    if (p === '/api/glof/outlook' && req.method === 'GET') { const id = url.searchParams.get('lake'); if (id) { const R = app.glof.register(); const L = R && R.lakes.find(x => x.id === id); return L ? send(res, 200, app.glof.triggerOutlook(L)) : send(res, 404, { ok: false, why: 'no such lake' }); } const r = app.glof.outlookNational(); return send(res, r.ok ? 200 : 503, r); }
    if (p === '/api/ai/evidence' && req.method === 'GET') { const r = await ai.evidence({ prompt: url.searchParams.get('prompt') || '', context: { location: url.searchParams.get('location') || '' }, compact: url.searchParams.get('compact') === '1' }); return send(res, r.status, r.json); }   /* v91.17.43 */
    if (p === '/api/glof/live' && req.method === 'GET') { const r = app.glof.liveSummary(); return send(res, r.ok ? 200 : 404, r); }
    if (p === '/api/glof/national' && req.method === 'GET') { const r = app.glof.national(url.searchParams.get('force') === '1'); return send(res, r.ok ? 200 : 503, r); }
    if (p === '/api/glof/lake' && req.method === 'GET') { const r = app.glof.lake(String(url.searchParams.get('id') || '')); return send(res, r.ok ? 200 : 404, r); }
    if (p === '/api/glof/bulletins' && req.method === 'GET') return send(res, 200, app.glof.bulletins());
    if (p === '/api/glof/events' && req.method === 'GET') { const id = url.searchParams.get('lake'); if (id) { const e = app.glof.eventsFor(id); return send(res, e ? 200 : 404, e ? { ok: true, lake: id, ...e } : { ok: false, why: 'no documented outburst for ' + id }); } const r = app.glof.eventsNational(); return send(res, r.ok ? 200 : 503, r); }   /* v91.17.64 */
    if (p === '/api/glof/refresh' && req.method === 'POST') { if (!localOrSigned(req)) return send(res, 401, { error: 'auth_required' }); return send(res, 200, await app.glof.refresh()); }
    if (p === '/api/limits/catchment' && req.method === 'GET') { const c = coord(url.searchParams); if (c.error) return send(res, 422, { ok: false, why: c.error }); try { const r = await app.catchment.heavyRain(c.lat, c.lon); return send(res, r.ok ? 200 : 422, r); } catch (e) { return send(res, 502, { ok: false, error: e.message }); } }
    if (p === '/api/limits/vars' && req.method === 'GET') return send(res, 200, { vars: app.limits.LIMIT_VARS, aliases: app.limits.LIMIT_ALIASES });
    if (p === '/api/limits/ledger' && req.method === 'GET') return send(res, 200, app.limits.ledgerSummary(Object.fromEntries(url.searchParams)));
    if (p === '/api/limits/ledger/verify' && req.method === 'POST') { if (!localOrSigned(req)) return send(res, 401, { error: 'auth_required' }); let body = {}; try { body = await readBody(req); } catch (_) {}
      try { const r = await app.limits.ledgerVerify(body || {}); return send(res, 200, { ok: true, ...r }); } catch (e) { return send(res, 502, { ok: false, error: 'ledger_verify_failed', message: e.message }); } }
    if (p === '/api/limits/evaluate' && req.method === 'POST') { /* v91.17.172 · audit O-2 · the local page in customer view evaluates its own asset limits (Operations never did: 403); a relayed or remote viewer still may not. The 25-asset cap per call and the per-minute rate guard stay. */
      if (!localOrSigned(req) && !loopbackDirect(req)) return send(res, 403, { error: 'operator_scope_required', why: 'up to 25 paid point runs per call (audit C15)' });
      try { limit('limits:' + (req.socket.remoteAddress || '')); } catch (e) { return send(res, 429, { ok: false, error: 'RATE_LIMITED', message: e.message }); }
      const _cv = customerView(req); let body; try { body = await readBody(req); } catch (e) { return send(res, e.status || 422, { ok: false, error: e.code || 'CONTRACT_INVALID', message: e.message }); }
      /* v91.17.34 · AUDIT A10 · shape checked up front: a null asset used to surface as a 502 TypeError */
      const A = body && Array.isArray(body.assets) ? body.assets : null;
      if (!A) return send(res, 422, { ok: false, error: 'CONTRACT_INVALID', message: 'assets must be an array' });
      const bad = A.map((a, i) => !a || typeof a !== 'object' ? i + ': not an object' : !Number.isFinite(Number(a.lat ?? a.latitude)) || !Number.isFinite(Number(a.lon ?? a.longitude)) ? i + ': lat and lon must be numbers' : (a.limits != null && !Array.isArray(a.limits)) ? i + ': limits must be an array' : null).filter(Boolean);
      if (bad.length) return send(res, 422, { ok: false, error: 'CONTRACT_INVALID', message: 'asset ' + bad.slice(0, 5).join('; '), fieldErrors: bad });
      try { const r = await app.limits.evaluate(body); return send(res, r.ok ? 200 : 422, _cv ? customerScrub(r) : r); } catch (e) { return send(res, 502, { ok: false, error: 'limits_failed', message: _cv ? customerScrub(String(e.message)) : e.message }); } }
    /* v91.17.266 · interface 1 · GET /api/report/past30?lat=&lon=[&days=30]: the last complete days at a point from the archives this server
       holds (past30.mjs); { ok:false, reason } when it holds none. The customer view is scrubbed of supplier names like the report context. */
    if (p === '/api/report/past30' && req.method === 'GET') { const q = Object.fromEntries(url.searchParams); try { const r = await app.past30.at(q); return send(res, r.ok ? 200 : (r.reason && /not a valid point/.test(r.reason) ? 400 : 200), customerView(req) ? customerScrub(r) : r); } catch (e) { return send(res, 500, { ok: false, reason: 'The past 30 days could not be read: ' + (customerView(req) ? customerScrub(String(e.message)) : e.message) }); } }
    /* v91.17.268 · interface 2 · the model-gate status a client report prints (names and limitations scrubbed, no skill figures; gate.mjs clientStatus) */
    if (p === '/api/report/gate-status' && req.method === 'GET' && app.gate) { const r = app.gate.clientStatus(); return send(res, r.ok ? 200 : 503, r); }
    /* v91.17.268 · interface 1 · the reports library (reports.mjs); writes need the operator scope or the page on this computer (the rule of the other page POSTs) */
    /* v91.17.283.49 · 1.0.10 · the place answer and the report engine (repservice.mjs) */
    /* a link a page opens or downloads cannot carry the view header: ?view=operator stands for it, under the same rule (this computer or a
       signed operator) as the header */
    const repView = (rq) => customerView(rq) && !(url.searchParams.get('view') === 'operator' && localOrSigned(rq));
    if ((p === '/api/place/answer' || p === '/api/report/generate' || p === '/api/report/pdf' || p === '/api/report/html') && app.reportEngine) { if (await app.reportEngine.route(req, res, p, url, { send, customerView: repView }) !== false) return; }
    if ((p === '/api/reports' || p.startsWith('/api/reports/')) && app.reports) { if (await app.reports.route(req, res, p, url, { send, client: repView(req), canWrite: localOrSigned(req) || loopbackDirect(req) }) !== false) return; return send(res, 404, { ok: false, error: 'not_found', path: p }); }
    /* v91.17.283.34 · Scenario Lab B (site change), the kept results (compare) and the report of 1-3 saved scenarios (same server result) */
    if (p === '/api/sitechange' && req.method === 'POST') { let b; try { b = (await readBody(req)) || {}; } catch (e) { return send(res, 422, { ok: false, why: 'bad request body' }); }
      try { const r = await app.siteChange.run(b, { vegWait: b.vegetation !== 'later' }); return send(res, r.status, customerView(req) ? customerScrub(r.body) : r.body); } catch (e) { return send(res, 500, { ok: false, why: 'the site change could not be computed' }); } }
    /* v283.36 · launch item 38 · THE METHODS TAB: the full constants list (purpose, inputs, evidence, sensitivity, the 1.0 decision), the one
       data-age table, the C-now test records and the internal build number. Operator view only (it names sources and file lines). */
    if (p === '/api/methods/constants' && req.method === 'GET') {
      if (!viewOp(req)) return send(res, 403, { ok: false, why: 'operator view only' });
      let C = null; try { C = JSON.parse(readFileSync(join(dataDir, 'constants-register.json'), 'utf8')); } catch (_) { C = null; }
      const DA = await import('./dataage.mjs'), SCm = await import('./sitechange.mjs'), RLm = await import('./reflayers.mjs'), LOm = await import('./landslideodds.mjs');
      let ffd = null; try { ffd = JSON.parse(readFileSync(join(dataDir, 'evidence', 'ffdclass36', 'check.json'), 'utf8')); } catch (_) { ffd = null; }
      return send(res, 200, { ok: true, build: '91.17.283.52', name: 'NIGRAAN 1.0.10.3', constants: C, heatIndexBands: (() => { try { return JSON.parse(readFileSync(join(dataDir, 'heat-index-bands.json'), 'utf8')); } catch (_) { return null; } })(),   /* v283.40: bands, test, hours-at-or-above error (Methods only) */
        dataAge: DA.DATA_AGE, dataAgeText: DA.DATA_AGE_TEXT, siteLabSteps: SCm.SITE_STEPS,
        ...(process.env.NIGRAAN_WN3_SHADOW !== '0' && existsSync(join(dataDir, 'wn3-shadow.json')) ? { shadowMembers: [{ id: 'wn3-shadow@1', name: 'WeatherNext 3 (shadow member of the blend, not served)', attribution: 'WeatherNext 3, Google DeepMind (CC BY 4.0)', terms: 'forecast values for times later than 1 hour ago: GDM Real-Time Weather Forecasting Experimental Data Terms of Use, (c) 2024-6 Google LLC (internal use)', rules: 'RULES_WN3_LIVE_SHADOW_20261102' }] } : {}),   /* v91.17.283.47 */
        tests: { cyclone: RLm.CYCLONE_CNOW, landslideBands: LOm.CNOW_2A, landslideObservedBasis: LOm.OBSERVED_BASIS, landslideMask: 'C-now 2b FAILED: the 25 deg steep-ground mask declared an observed test event impossible; masked tehsils are not assessed, never "cannot happen"',
          riverMask: 'C-now 5 FAILED: 10 of 97 off-floodplain tehsils had >= 1 km2 of observed flood water in held-out years; no "cannot happen" for river flooding', glofTiers: 'C-now 1: insufficient data (4 test outbursts); GLOF stays facts only',
          barrageClasses: ffd ? Object.fromEntries(Object.entries(ffd.stations || {}).map(([k, v]) => [k, (v.verdict || '') + (v.agree != null ? ' (' + v.agree + ' of ' + v.readings + ' official readings classed the same)' : '')])) : null } }); }
    /* == v91.17.283.48 · GUIDANCE: GET /api/guidance (GUIDANCE_PANEL=1 only; off: the route does not exist, as before) == */
    if (GUIDANCE_ON() && app.guidance && (p === '/api/guidance' || p.startsWith('/api/guidance/'))) return guidanceRoute(app.guidance, req, res, url, { send, customerView });
    /* v91.17.283.34 · the hazards that can and cannot happen at a place (data/hazard-applicability.json): "cannot happen here" with the reason */
    if (p === '/api/hazards/applicability' && req.method === 'GET') { const la = Number(url.searchParams.get('lat')), lo = Number(url.searchParams.get('lon'));
      let uid = url.searchParams.get('uid'); if (!uid && Number.isFinite(la) && Number.isFinite(lo)) { try { const r = unitAtPoint(app, la, lo); uid = r && r.unit ? r.unit.unitId : null; } catch (_) { uid = null; } }
      let A = null; try { A = JSON.parse(readFileSync(join(dataDir, 'hazard-applicability.json'), 'utf8')); } catch (_) { A = null; }
      if (!A || !A.layers) return send(res, 200, { ok: false, why: 'the hazard applicability table is not in this install' });
      if (!uid) return send(res, 200, { ok: false, why: 'the place lies in no tehsil' });
      /* v91.17.283.35 · audit B3: one reader (applicability.mjs), the map mask's reading of the file, the cyclone record of the map */
      let gn = null; try { gn = app.glof && app.glof.national ? app.glof.national() : null; } catch (_) { gn = null; }
      let cu = null; try { cu = app.refLayers.unit(uid).cyclone; } catch (_) { cu = null; }
      const rj41 = (f) => { try { return JSON.parse(readFileSync(join(dataDir, f), 'utf8')); } catch (_) { return null; } };   /* v91.17.283.41 · river network + landslide groups */
      const rows = applicabilityRows(A, uid, { glofNational: gn && gn.ok ? gn : null, cycloneUnit: cu, riverLink: rj41('river-link.json'), lsGroups: rj41('landslide-groups.json'), glofDrain: (() => { try { return app.hazSci && app.hazSci.glofDrain ? app.hazSci.glofDrain() : null; } catch (_) { return null; } })() });
      return send(res, 200, { ok: true, unitId: customerView(req) ? null : uid, hazards: rows }); }
    if (p === '/api/scenario/result' && req.method === 'GET') { const r = scenarioStore(dataDir).get(url.searchParams.get('id')); return r ? send(res, 200, customerView(req) ? customerScrub(r) : r) : send(res, 404, { ok: false, why: 'this saved scenario is not held on this server (run it again)' }); }
    if (p === '/api/scenario/report' && req.method === 'POST') { let b; try { b = (await readBody(req)) || {}; } catch (e) { return send(res, 422, { ok: false, why: 'bad request body' }); }
      const [st, o] = scenarioReport((id) => scenarioStore(dataDir).get(id), b); if (o && o.html && customerView(req)) o.html = customerScrub(o.html); return send(res, st, o); }
    if (p === '/api/scenario' && req.method === 'GET') { const q = Object.fromEntries(url.searchParams); try { const r = await app.scenario.run(q, customerView(req) ? 'customer' : 'operator'); return send(res, r.status, customerView(req) ? customerScrub(r.body) : r.body); } catch (e) { console.error('  scenario run failed:', e && (e.stack || e.message || e)); return send(res, 500, { ok: false, why: 'the scenario could not be run' }); } }   /* v91.17.283.28 · S10 */
    if (p === '/api/report/context' && req.method === 'GET') { const q = Object.fromEntries(url.searchParams); try { const r = await app.report.context(q, { customer: customerView(req) }); return r ? send(res, 200, r) : send(res, 404, { error: 'unit_not_found' }); } catch (e) { return send(res, 500, { error: 'report_context_failed', message: e.message }); } }
    /* ══ v91.17.3 · 1.12 · THE SKILL SHEET ═══════════════════════════════════
       A number a client acts on and the number that says how good it is have to
       travel together, or the second one does not exist as far as the client is
       concerned. Every parameter, every threshold, and every withheld product,
       with its measurand, its reference, its sample and what the platform does
       about it. /api/skill for the sheet, ?parameter= or ?threshold= for one. */
    /* v91.17.10 · what the model gets wrong, measured, rather than assumed.
       /point refuses beyond 250 km instead of extrapolating in silence. */
    if (p.startsWith('/api/obs/bias') && req.method === 'GET') {
      if (p === '/api/obs/bias') return send(res, 200, app.obsBias.status());
      if (p === '/api/obs/bias/table') return send(res, 200, app.obsBias.table() || { ready: false, internal: true, why: 'the per-station table is an internal verification record; the bias at a point is served at /api/obs/bias/point' });   /* v91.17.71 */
      if (p === '/api/obs/bias/point') {
        const q = url.searchParams; const c = coord(q); if (c.error) return send(res, 400, { ok: false, why: c.error });
        const mk = q.get('maxKm') == null ? null : Number(q.get('maxKm')), kk = q.get('k') == null ? null : Number(q.get('k'));
        return send(res, 200, app.obsBias.pointBias(c.lat, c.lon, q.get('elev'),
          { maxKm: Number.isFinite(mk) && mk > 0 ? mk : undefined, k: Number.isInteger(kk) && kk > 0 ? kk : undefined }));
      }
      return send(res, 404, { error: 'not_found', have: ['/api/obs/bias', '/api/obs/bias/table', '/api/obs/bias/point'] });
    }
    /* v91.17.283.18 · THE PLACE ROUTES: one module (server/api/places.mjs), one table (data/geo/places.json.gz).
       GET /api/geo/search?q=&limit=&suggest=1   the search box of every page: the server's order is final (no page re-ranks)
       GET /api/geo/resolve?q=                   the one point a name stands for: the first result of the same search
       GET /api/geo/place?id=                    one record of the table (a page that holds a record id)
       GET /api/geo/towns                        the confirmed capital, cities and towns (the report map's labels) */
    if (p === '/api/geo/search' && req.method === 'GET') {
      const q = url.searchParams.get('q') || url.searchParams.get('name') || '';
      try { return send(res, 200, await app.places.search(q, { limit: url.searchParams.get('limit'), suggest: url.searchParams.get('suggest') === '1' })); }
      catch (e) { return send(res, 500, { error: 'place_search_failed', message: e.message }); }
    }
    if (p === '/api/geo/resolve' && req.method === 'GET') {
      const q = url.searchParams.get('q') || '';
      if (!q.trim()) return send(res, 400, { ok: false, error: 'q required' });
      try { const G = await app.places.search(q, { limit: 8 });
        const r = (G.results || []).find((x) => x && Number.isFinite(x.lat) && Number.isFinite(x.lon) && !x.disputed && x.administered !== false);
        return send(res, 200, r ? { ok: true, q, id: r.id || null, lat: r.lat, lon: r.lon, name: r.name, label: r.resolvedLabel || r.name, level: r.level || null, rule: r.resolvedAs || null,
          tehsil: r.tehsil || null, district: r.district || null, province: r.province || null, confirmed: r.confirmed !== false, elevM: r.elevM ?? null } : { ok: false, q, why: 'no place in Pakistan matches' }); }
      catch (e) { return send(res, 500, { ok: false, error: 'place_search_failed', message: e.message }); }
    }
    if (p === '/api/geo/towns' && req.method === 'GET') return send(res, 200, { towns: app.places.towns() });   /* report map labels */
    if (p === '/api/geo/place' && req.method === 'GET') { const r = app.places.byId(url.searchParams.get('id') || ''); return r ? send(res, 200, { ok: true, place: r }) : send(res, 404, { ok: false, error: 'no place of this id' }); }
    /* v91.17.3 · 2A.1 / 3.1 · riverine flood on snapped main stems */
    /* v283 WS9 (wired by WS1) · river flood extent and the gauge-calibrated river flow: OPERATOR ONLY (coordinator, 21 Oct) until the
       registry marks the extent served; a relayed, customer-view or unsigned caller gets 401 before the module is touched */
    if ((p.startsWith('/api/flood/extent') || p === '/api/flood/glofascal') && req.method === 'GET') { if (!localOrSigned(req)) return send(res, 401, { error: 'auth_required', why: 'operator only' }); }
    if (p.startsWith('/api/flood/extent') && req.method === 'GET' && app.floodExtent) { const r = app.floodExtent.route(p, url);
      if (r) { if (r.type === 'image/png') { res.writeHead(r.status, { 'content-type': 'image/png', 'content-length': r.body.length, 'cache-control': 'private, max-age=600', 'x-product-type': 'Indicative' }); return res.end(r.body); }
        return send(res, r.status, r.body); } }
    if (p === '/api/flood/glofascal' && req.method === 'GET' && app.glofasCal) { const id = url.searchParams.get('id'); if (!id) return send(res, 200, app.glofasCal.status());
      const F = app.flood.forecastDays(id); return send(res, 200, F ? app.glofasCal.gaugeEquivalent(id, F.days) || { ready: false, why: 'no calibration record' } : { ready: false, why: 'no river forecast for this reach' }); }
    if (p.startsWith('/api/flood/') && req.method === 'GET') {
      const q = url.searchParams;
      /* v91.17.92 · the big-river gauge outlook (station-lake/scripts/river_outlook.py, re-issued when the daily river sheet
         arrives in the drop folder). Held-out skill is operator-only; stale after 2 days without a new reading day. */
      if (p === '/api/flood/gauges') { let j = null; try { j = JSON.parse(readFileSync(join(dataDir, 'river-outlook.json'), 'utf8')); } catch { j = null; }
        if (!j) return send(res, 200, { ready: false, why: 'No daily river sheet has been loaded yet (drop folder).' });
        /* v91.17.283.13 · audit B5 · AGE AND STALENESS PER GAUGE (gaugeAge in api/rivercal.mjs): each gauge carries its own reading day, age and
           stale flag; a gauge more than 2 days without a reading is "last measured <date>", not current, and gives no class (the river
           layer then reads the model reach for it); the sheet is stale only when every gauge is. Before, the sheet's basedOn decided for
           all: a gauge whose own reading was old stayed current inside a fresh sheet, and one stale sheet dropped every gauge. */
        const ageD = (Date.now() - Date.parse(j.basedOn + 'T01:00:00Z')) / 864e5; const out = { ready: true, ...j, ageDays: Math.floor(ageD), gauges: (j.gauges || []).map((g) => gaugeAge(g, j.basedOn)) };
        /* v91.17.274 · RIVER · when the river sheet stops: the last reading stays (it matched the gauge class better than the model on
           held-out data for days); from the per-gauge age at which the reach model level matched better (data/river-cal.json), that
           gauge shows the reach model level instead. Operator view also carries the gauge-equivalent model flow where it passed. */
        const isOp = viewOp(req);
        try { if (app.riverCal && app.riverCal.enabled()) {
          const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10); const MW = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
          const ages = app.riverCal.switchAges() || {};
          out.gauges = (out.gauges || []).map((g) => {
            const F = app.flood.forecastDays(g.id); let r = g;
            const a = ages[g.id] ?? null, last = g.lastReading || j.basedOn;
            const gAge = last ? Math.floor((Date.now() - Date.parse(last + 'T01:00:00Z')) / 864e5) : null;
            if (F && a != null && gAge != null && gAge >= a) {
              const fd = F.days.filter((d) => d.date >= today).slice(0, Math.max(1, (g.days || []).length + 1)).map((d) => ({ d, v: app.flood.dayView(g.id, d) }));
              if (fd.length && fd.every((x) => x.v && x.v.levelIndex != null)) {
                /* v91.17.283.13 · audit B5 · one scale: the model ladder is on the five AGN levels (level / levelWord); its rungs were set as the
                   official class most often observed on them (river-level-scale.json decisionRule), so cls (official six-class index) =
                   the same index and clsName the official class name, never an AGN word in the official field */
                const lv = (x) => ({ date: x.d.date, kcusecs: null, m3s: null, cls: x.v.levelIndex, clsName: (j.classes || [])[x.v.levelIndex] || null, level: x.v.levelIndex, levelWord: MW[x.v.levelIndex] });
                r = { ...g, kcusecs: null, m3s: null, cls: fd[0].v.levelIndex, clsName: (j.classes || [])[fd[0].v.levelIndex] || null, level: fd[0].v.levelIndex, levelWord: MW[fd[0].v.levelIndex], stale: false, date: fd[0].d.date, days: fd.slice(1).map((x, k) => ({ k: k + 1, ...lv(x) })),
                  method: 'model-reach', switchedAfterDays: a, lastSheet: { date: g.lastReading || null, cls: g.cls } };
              }
            }
            const eq = F && isOp ? app.riverCal.gaugeEquivalent(g.id, F.days) : null; if (eq) r = { ...r, modelEq: eq };   /* operator only: not computed for a customer */
            return r;
          });
          out.modelSwitch = out.gauges.filter((g) => g.method === 'model-reach').map((g) => g.id);
        } } catch (_) { /* the panel keeps the sheet as it was */ }
        out.gauges = (out.gauges || []).map((g) => g.method === 'model-reach' ? g : gaugeCurrent(g));
        out.stale = out.gauges.length > 0 && out.gauges.every((g) => g.stale && g.method !== 'model-reach');
        if (!isOp) { delete out.heldOut; out.gauges = (out.gauges || []).map((g) => { const { modelEq, lastSheet, ...rest } = g; return rest; });
          /* v91.17.101 · audit L5 · the gauge sheet is internal: customers get AGN's level words, not the supplier's flow figures,
             class names or limits */
          const W = ['Normal', 'Low', 'Moderate', 'High', 'Severe', 'Severe'];
          const cut = (g) => ({ ...g, kcusecs: null, m3s: null, limits: undefined, clsName: g.cls == null ? null : W[g.cls] || null, ...(g.lastMeasured ? { lastMeasured: { date: g.lastMeasured.date, cls: g.lastMeasured.cls, clsName: g.lastMeasured.cls == null ? null : W[g.lastMeasured.cls] || null } } : {}) });
          out.classes = W; out.gauges = (out.gauges || []).map(g => ({ ...cut(g), days: (g.days || []).map(cut) })); out.customerView = true; }
        return send(res, 200, out); }
      /* v91.17.93 · job 3 · snow on the ground in the northern valleys (station-lake/scripts/snow_status.py). Customers get the
         area words; the station figures (internal) only on this computer or a signed request. */
      if (p === '/api/flood/snow') { let j = null; try { j = JSON.parse(readFileSync(join(dataDir, 'snow-status.json'), 'utf8')); } catch { j = null; }
        if (!j) return send(res, 200, { ready: false, why: 'No snow-depth export has been loaded yet (drop folder).' });
        const ageD = j.asOf ? (Date.now() - Date.parse(j.asOf + 'T01:00:00Z')) / 864e5 : null; const out = { ready: true, ...j, ageDays: ageD == null ? null : Math.floor(ageD), stale: ageD == null || ageD > 3 };
        if (!viewOp(req)) { delete out.stations; delete out.note; } return send(res, 200, out); }
      if (p === '/api/flood/status') return send(res, 200, { ...app.flood.status(), hand: app.hand.status(), riverCal: app.riverCal ? app.riverCal.status() : null, ...(viewOp(req) ? { floodExtent: app.floodExtent ? app.floodExtent.status() : null, glofasCal: app.glofasCal ? app.glofasCal.status() : null } : {}) });   /* v283 WS9 · operator only */   /* v91.17.274 · RIVER */
      if (p === '/api/flood/wetness') { const id = q.get('unit'); if (id) { const u = app.outlook.findUnit ? app.outlook.findUnit(id) : null; const r = app.wetness.of(u ? u.unitId : id); return r ? send(res, 200, { ok: true, unit: u ? { unitId: u.unitId, name: u.name, district: u.district, province: u.province } : { unitId: id }, ...r }) : send(res, 404, { ok: false, why: app.wetness.status().ready ? 'no wetness record for that unit' : 'the wetness job has not run' }); } const r = app.wetness.national(); return send(res, r.ready ? 200 : 503, r); }   /* v91.17.42 */
      /* v91.17.60 · curve-number runoff for a unit and a rain total: ?unit=<uid or name>&p=<mm>[&ws=0..1] */
      if (p === '/api/flood/runoff') {
        const id = q.get('unit'); const pMm = Number(q.get('p')); const ws = q.get('ws') == null ? null : Number(q.get('ws'));
        if (!id || !Number.isFinite(pMm) || pMm < 0) return send(res, 400, { error: 'unit and p (mm, >= 0) are required' });
        const u = app.outlook.findUnit ? app.outlook.findUnit(id) : null; const uid = u ? u.unitId : id;
        const live = app.wetness.of(uid); const wsUse = ws != null ? ws : (live && live.now ? live.now.ws : null);
        const r = app.wetness.cnAt(uid, pMm, wsUse);
        if (!r) return send(res, 404, { ok: false, why: 'no curve-number row for this unit (data/sponge-tehsil.v2.json)' });
        return send(res, 200, { ok: true, unit: u ? { unitId: u.unitId, name: u.name, district: u.district, province: u.province } : { unitId: uid }, wsUsed: wsUse, ...r });
      }
      /* v91.17.60 · the catchment context for a unit: primary catchment, shares, upstream set and area (data/catchments.json) */
      if (p === '/api/flood/catchment') {
        const id = q.get('unit'); if (!id) return send(res, 400, { error: 'unit is required' });
        const CT = app.catchments || (app.catchments = (() => { try { return JSON.parse(readFileSync(join(dataDir, 'catchments.json'), 'utf8')); } catch { return null; } })());
        if (!CT) return send(res, 404, { ok: false, why: 'data/catchments.json missing (LEARN_NIGRAAN.bat geo)' });
        const u = app.outlook.findUnit ? app.outlook.findUnit(id) : null; const uid = u ? u.unitId : id; const t = CT.tehsils[uid];
        if (!t) return send(res, 404, { ok: false, why: 'unit not assigned to a catchment (share under 1 %)' });
        const c = CT.catchments[String(t.primary)] || {};
        return send(res, 200, { ok: true, unit: u ? { unitId: u.unitId, name: u.name, district: u.district, province: u.province } : { unitId: uid }, primary: t.primary, shares: t.catchments, primaryAreaKm2: c.areaKm2, upstream: c.upstream || [], upstreamAreaKm2: t.upstreamAreaKm2, downstream: c.downstream ?? null, centroid: c.centroid || null,
          status: 'Physical (topology), Screening (use)', source: CT.source, note: 'context only: the flood class does not use the upstream term (cn_backtest.py upstream rule not passed); the tree stops at the border' });
      }
      if (p === '/api/flood/hand') { const id = q.get('unit'); if (id) { const r = app.hand.of(id); return r ? send(res, 200, r) : send(res, 404, { error: 'no_hand', unit: id, why: app.hand.on() ? 'unit outside the HAND domain or not a tehsil unitId (Province|District|Tehsil)' : app.hand.status().why }); } return send(res, 200, app.hand.national()); }
      if (p === '/api/flood/point') { const r = app.flood.point(q.get('id')); return r ? send(res, 200, r) : send(res, 404, { error: 'point_not_found', id: q.get('id'), have: app.flood.POINTS.map(x => x.id) }); }
      if (p === '/api/flood/national') { const d = intIn(q.get('day'), 0, 30, 0); if (d == null) return send(res, 400, { error: 'day must be an integer 0-30' }); return send(res, 200, app.flood.national(d)); }
      if (p === '/api/flood/snapped') return send(res, 200, app.flood.snapped() || { ready: false, why: 'the snap job has not run' });
      if (p === '/api/flood/climate') return send(res, 200, app.flood.climate() || { ready: false, why: 'return periods have not been fitted' });
      return send(res, 404, { error: 'not_found' });
    }
    /* v91.17.3 · 2A.5 · rainfall intensity-duration-frequency from the station record */
    /* v91.17.5 · the local cold/heat anchors, nationally, in one response. The
       browser hazard engine had no local climatology and was scoring "cold"
       against a single national ramp. */
    if (p === '/api/climatology/thresholds' && req.method === 'GET') {
      const d = url.searchParams.get('date');
      if (d != null && !(/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d)) return send(res, 400, { error: 'date must be YYYY-MM-DD' });
      return send(res, 200, app.climatology.thresholdsNational(d));
    }
    /* v91.17.9 · national SPI-30/90 and SPEI-30/90. The drought layer read
       DISTRICT_SPI, which only the per-district browser loader ever filled, so
       575 of 576 units had no input. */
    /* v91.17.59 · THE ENGINEERING BASELINE THE CLIMATE PANEL COULD NEVER FIND. The 1991-2020 ERA5 climatology has been
       in data/climatology.json for every tehsil since v91.17.x, but the Engineering Conditions panel only ever saw the
       forecast API's week-long past_days sample and refused to project (rightly). This route gives it the unit's
       climatological hot-season baseline: the 90th percentile of daily maximum temperature in the hottest 15-day
       window of the year, height- and station-shifted like every other threshold, with its basis spelled out. */
    if (p === '/api/climatology/drought' && req.method === 'GET') {
      { const dn = app.climatology.droughtNational(); return send(res, 200, dn && typeof dn === 'object' ? { ...dn, observed: true, basis: 'observed: computed from the observed drought index (rain SPI / SPEI over the last 30-90 days, with the soil and vegetation readings), not a forecast' } : dn); }   /* v91.17.283.2 */
    }
    /* v91.17.11 · urban heat island at a point, from measured morphology.
       Replaces three hand-typed demonstration profiles in Islamabad and
       Rawalpindi with 1.4 million measured cells covering Pakistan. */
    if (p === '/api/urban/point' && req.method === 'GET') {
      const q = url.searchParams;
      const cq = coord(q); if (cq.error) return send(res, 400, { error: cq.error });
      const opts = {};
      if (q.get('hoursFromSunset') != null) opts.hoursFromSunset = Number(q.get('hoursFromSunset'));
      if (q.get('at')) opts.at = q.get('at');
      if (q.get('windMs') != null) opts.windMs = Number(q.get('windMs'));
      if (q.get('cloudFraction') != null) opts.cloudFraction = Number(q.get('cloudFraction'));
      if (q.get('elev') != null) opts.elev = Number(q.get('elev'));
      return send(res, 200, app.urbanPoint(cq.lat, cq.lon, opts));
    }
    if (p === '/api/urban/status' && req.method === 'GET') return send(res, 200, app.urbanHeat.status());
    if (p === '/api/urban/national' && req.method === 'GET') return send(res, 200, app.urbanHeat.national());
    if (p === '/api/urban/cells' && req.method === 'GET') {
      const q = url.searchParams, N = (k) => q.has(k) ? Number(q.get(k)) : NaN;
      if (![N('w'), N('s'), N('e'), N('n')].every(Number.isFinite) || N('w') >= N('e') || N('s') >= N('n'))
        return send(res, 400, { error: 'w, s, e and n are required, with w < e and s < n' });
      const opts = {};
      if (q.get('hoursFromSunset') != null) { opts.hoursFromSunset = Number(q.get('hoursFromSunset')); if (!Number.isFinite(opts.hoursFromSunset)) return send(res, 400, { error: 'hoursFromSunset must be a number' }); }
      if (q.get('zoom') != null) { opts.zoom = Number(q.get('zoom')); if (!Number.isFinite(opts.zoom) || opts.zoom < 0 || opts.zoom > 19) return send(res, 400, { error: 'zoom must be a number 0-19' }); opts.zoom = Math.floor(opts.zoom); }   /* v91.17.82 · the map snaps to quarter zooms (5.75 at open); floor, never refuse */
      return send(res, 200, app.urbanHeat.cellsIn(N('w'), N('s'), N('e'), N('n'),
        Math.min(40000, Number(q.get('max')) || 20000), opts));
    }
    if (p === '/api/idf' && req.method === 'GET') {
      const st = url.searchParams.get('station');
      /* v91.17.70 · the retracted IDF table (chair_crossexam S17) was not a customer output.
         v91.17.71 · station data is used by default again (stationData()): the table the station record supports is served,
         with its supplier credited generically; the names stay internal. NIGRAAN_STATION_DATA=0 gives the open-only answer.
         The table itself is still WITHHELD on this record (v91.17.68 rule: three complete annual maxima, 80 % of 10-minute
         slots, rain-trusted gauge): measured 26 Sep 2026, 0 of 20 rain-trusted gauges pass under calendar, Oct-Sep or Sep-Aug
         years [measured: station-lake Accumulated_Rainfall.parquet, reports/station_trust.csv]. */
      if (!stationData()) return send(res, 200, { ok: false, published: false, stations: {}, why: 'no rainfall intensity-duration-frequency table is published by NIGRAAN on this install (station data off: NIGRAAN_STATION_DATA=0)' });
      if (!IDF) return send(res, 503, { error: 'idf_unavailable', why: 'the intensity-duration-frequency table is not bundled with this build' });
      const pub = (o) => internalNames() ? o : scrubNames({ ...o, why: o.why ? idfCustomerWhy() : o.why, source: label('mountainNetwork') }, namesRegex(dataDir), label('network'));
      if (!Object.keys(IDF.stations || {}).length) return send(res, 200, pub({ ok: false, withheld: true, published: true, why: IDF.why || 'no gauge fitted', rule: IDF.rule || null, method: IDF.method || null, durationsMin: IDF.durationsMin || null, returnYears: IDF.returnYears || null, minYears: IDF.minYears || null, builtAt: IDF.builtAt || null, stations: {} }));   /* v91.17.68 · the table is withheld with its reason, never served from partial years */
      if (st) { const r = IDF.stations[st]; return r ? send(res, 200, pub({ station: st, ...r })) : send(res, 404, { error: 'station_not_fitted', have: Object.keys(IDF.stations) }); }
      return send(res, 200, pub({ ...IDF, published: true }));
    }
    /* v91.17.72 · WHERE THE PEOPLE OF AN AREA LIVE. A click on a district or tehsil used to fetch the forecast at the
       polygon's bounding-box centre with the DISTRICT'S MEAN TERRAIN HEIGHT (Hunza: 4,726 m, a glacier height), so the
       card and the 24-hour strip read -5 C on a 20 C day in Karimabad. An area click now asks for the settlement point:
       the tehsil's anchor point at its population-weighted settlement height (data/settlement-elevation.json); for a
       district, the most populous of its tehsils. */
    if (p === '/api/geo/settlement' && req.method === 'GET') {   /* v91.17.283.18 · the point of a unit is its record in the place table (its populated anchor) */
      const q = url.searchParams; const key = String(q.get('key') || ''), uid = String(q.get('unit') || ''), dist = String(q.get('district') || '').toLowerCase(), prov = String(q.get('province') || '').toLowerCase();
      const T = app.units.tehsil || [];
      let t = uid ? T.find(x => x.unitId === uid) : null;
      if (!t && key) { const m = T.filter(x => x.key === key || x.tehsil === key); t = m.length === 1 ? m[0] : (m.find(x => !dist || String(x.district).toLowerCase() === dist) || null); }
      let rec = t ? app.places.byId('T:' + t.unitId) : null;
      if (!rec && dist) { const d = T.find(x => String(x.district).toLowerCase() === dist && (!prov || String(x.province).toLowerCase() === prov) && !x.disputed); rec = d ? app.places.byId('D:' + d.province + '|' + d.district) : null; }
      if (!rec) return send(res, 404, { error: 'no tehsil or district matches', key, unit: uid, district: dist });
      const pr = app.places.pointRow(rec.lat, rec.lon);
      return send(res, 200, { id: rec.id, unitId: rec.unitId, tehsil: rec.tehsil, district: rec.district, lat: rec.lat, lon: rec.lon, elevM: pr && (pr.forecastElevM ?? pr.elevM ?? null), standsAt: rec.standsAt || null, basis: 'the unit\'s populated anchor (place table), height from the 30 m terrain' });
    }
    if (p === '/api/geo/near' && req.method === 'GET') { const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon')), km = Number(url.searchParams.get('km')), lim = Math.max(1, Math.min(500, Number(url.searchParams.get('limit')) || 12));   /* the settlements inside a coarse fix */
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !(km > 0)) return send(res, 422, { error: 'lat, lon and km (> 0) required' });
      return send(res, 200, { lat, lon, km, places: app.places.near(lat, lon, { km, limit: lim, minKm: 0, height: true }) }); }
    if (p === '/api/geo/reverse' && req.method === 'GET') { const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon')); if (!Number.isFinite(lat) || !Number.isFinite(lon)) return send(res, 422, { error: 'lat and lon required' }); return send(res, 200, app.places.resolvePoint(lat, lon) || { label: null, why: 'the point could not be resolved' }); }
    if (p === '/api/skill' && req.method === 'GET') {
      const q = url.searchParams;
      /* v91.17.70 · customers read the methods sheet; the station-measured entries are internal. Internal QA (the harness on
         this machine) reads them on loopback with the machine's own token secret in x-agn-qa; nothing else does. */
      const qaOk = qaOkOf(req);
      const ext = internalNames() || qaOk;   /* v91.17.71 · station-measured skill figures: a naming/skill gate, not a data gate */
      if (!ext && (q.get('parameter') || q.get('threshold'))) { const id = q.get('parameter') || q.get('threshold'); const cs = app.skill.customerSheet(); const r = [...cs.parameters, ...cs.thresholds].find((x) => x.id === id); return r ? send(res, 200, r) : send(res, 404, { error: 'unknown_entry', have: [...cs.parameters, ...cs.thresholds].map((x) => x.id) }); }
      if (q.get('parameter')) { const r = app.skill.parameter(q.get('parameter')); return r ? send(res, 200, r) : send(res, 404, { error: 'unknown_parameter', have: app.skill.ids().parameters }); }
      if (q.get('threshold')) { const r = app.skill.threshold(q.get('threshold')); return r ? send(res, 200, r) : send(res, 404, { error: 'unknown_threshold', have: app.skill.ids().thresholds }); }
      return send(res, 200, ext ? app.skill.sheet() : app.skill.customerSheet());   /* v91.17.70 · the station-measured sheet is an internal diagnostic */
    }
    if (p === '/api/checks' && req.method === 'GET') return send(res, 200, { stations: app.stations.summary(), ensemble: app.ensVerify.summary(), seasonalRecord: app.seasVerify.summary(), health: app.ops.health(), smog: app.smog.status(), climatology: app.climatology.status(), rebuildHeld: app.rebuildHeld ? app.rebuildHeld() : {}, drought: app.climatology.droughtStatus(), soilMoistureBaseline: app.climatology.soilClimStatus(), urbanHeat: app.urbanHeat.status(), mountainCorrection: app.mos.status(), montecarlo: { method: 'Each of the 51 ensemble members is one sampled future; hazard events are counted member by member.', events: app.outlook.EVENTS }, skill: { version: app.skill.sheet().version, measuredOn: app.skill.sheet().measuredOn, at: '/api/skill', ...app.skill.ids() } });
    if (p.startsWith('/api/outlook/') && req.method === 'GET') {
      const O = app.outlook, q = url.searchParams;
      if (p === '/api/outlook/status') return send(res, 200, O.status());
      /* v91.17.69 · a place is resolved by its POINT first (the tehsil polygon it falls in), then by name. The outlook was
         asked by the place name ("Passu"), found no tehsil, and the floating panel fell back to Islamabad's outlook. */
      const outlookUnitOf = () => { const la = Number(q.get('lat')), lo = Number(q.get('lon'));
        if (q.get('lat') != null && q.get('lon') != null && Number.isFinite(la) && Number.isFinite(lo) && app.urbanHeat && app.urbanHeat.unitAt) { try { const f = app.urbanHeat.unitAt(la, lo); const u = f && f.uid ? O.findUnit(f.uid) : null; if (u) return { u, by: 'point', pt: { lat: la, lon: lo } }; } catch (_) {} }
        const u = O.findUnit(q.get('unit')); return u ? { u, by: 'name' } : null; };
      if (p === '/api/outlook/unit') { const hit = outlookUnitOf(); const r = hit && O.unit(hit.u.unitId, hit.pt || null);   /* W3: by point, at the point's height */ return r ? send(res, 200, { ...r, resolvedBy: hit.by }) : send(res, 404, { error: 'unit_not_found', unit: q.get('unit'), why: 'no tehsil contains this point and no tehsil has this name' }); }
      if (p === '/api/outlook/national') { const d = intIn(q.get('day'), 0, 15, 1); if (d == null) return send(res, 400, { error: 'day must be an integer 0-15' }); return send(res, 200, O.national(d)); }
      if (p === '/api/outlook/seasonal') { const hit = outlookUnitOf(); const u = hit && hit.u; const r = u && O.seasonalUnit(u.unitId); return r ? send(res, 200, { unit: { unitId: u.unitId, name: u.name, district: u.district, province: u.province }, ...r }) : u ? send(res, 200, { error: 'not_ready', ready: false }) : send(res, 404, { error: 'unit_not_found' }); }   /* v91.17.155 · not ready is a state, not a missing resource (no 404 in the console every load) */
      if (p === '/api/outlook/seasonal/national') return send(res, 200, O.seasonalNational(q.get('week') ?? 2, q.get('month') ?? 1));
      return send(res, 404, { error: 'not_found' });
    }
    if (p === '/api/verification/run' || p === '/api/ai/chat' || p === '/api/outlook/run' || p === '/api/checks/run' || p === '/api/flood/run') {
      if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
      try { limit('ip:' + clientIp(req), ipPerMin()); } catch (e) { return send(res, 429, { error: 'RATE_LIMITED', message: e.message }, { 'retry-after': '30' }); }   /* v91.17.283 · WS1 · before the token */
      const remote = req.socket.remoteAddress || ''; const loop = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(remote);
      let who = null; try { who = identity.resolve(req); } catch {}
      /* Ask NIGRAAN is a public product feature (customer page on Vercel included). Rate-limited above; HOST_OK/CROSS_SITE still apply.
         Other paid jobs still need loopback or a signed operator token. */
      if (p !== '/api/ai/chat') {
        if (!loop && !who) return send(res, 401, { error: 'auth_required' });
        if (!localOrSigned(req)) return send(res, 403, { error: 'operator_scope_required', why: 'a viewer token cannot start a paid job (audit C15)' });   /* v91.17.68 */
      }
      if (p === '/api/checks/run') { const what = url.searchParams.get('what') || 'all'; const r = {}; if (what === 'wetness') { r.wetness = 'started'; app.wetness.run().catch(e => console.error('  wetness run', e.message)); return send(res, 200, r); } if (what === 'landslide' && app.landslideOdds) { r.landslide = 'started'; app.landslideOdds.run().catch(e => console.error('  landslide run', e.message)); return send(res, 200, r); }   /* v91.17.112 */ if (what === 'points' && app.pointEngine) { r.points = 'started'; app.pointEngine.archiveDaily(dataDir).then(x => console.log('  points archive', JSON.stringify(x))).catch(e => console.error('  points archive', e.message)); return send(res, 200, r); }   /* v91.17.120 · operator trigger: today's forward-test points (once a day; the marker stops a repeat) */ const bg = (fn, name) => { r[name] = 'started'; fn().catch(e => console.error('  ' + name + ' error', e.message)); };
        if (what === 'all' || what === 'stations') bg(app.stations.run, 'stations');
        if (what === 'all' || what === 'ensemble-score') bg(app.ensVerify.score, 'ensembleScore');
        if (what === 'climatology') bg(async () => { delete HELD.climatology; await app.climatology.build(); await app.outlook.runEnsemble(); }, 'climatology');
        if (what === 'drought') bg(() => app.climatology.buildDroughtNational(url.searchParams.get('force') === '1'), 'drought');
        /* v91.17.37 · the anomaly climate (daily mean normals) is rebuildable on demand: the copy built on
           17 September had 10 mountain units at ERA5 grid height (Ali Abad July mean -0.4 C), so every
           anomaly there read +10 to +20 C */
        if (what === 'anomaly') bg(() => { delete HELD.anomaly; return app.climatology.buildAnomaly(); }, 'anomaly');
        if (what === 'soil-climatology') bg(async () => { await app.climatology.buildSoilClimatology(); await app.climatology.buildDroughtNational(true); }, 'soilClimatology');
        return send(res, 202, { ...r, note: 'running in background; poll /api/checks' }); }
      if (p === '/api/flood/run') { const what = url.searchParams.get('what') || 'forecast'; const force = url.searchParams.get('force') === '1';
        const bg = (fn, name) => { fn().catch(e => console.error('  flood ' + name + ' error', e.message)); };
        if (what === 'snap') { bg(() => app.flood.runSnap(force), 'snap'); return send(res, 202, { snap: 'started', note: 'poll /api/flood/status' }); }
        if (what === 'climate') { bg(() => app.flood.runClimate(force), 'climate'); return send(res, 202, { climate: 'started', note: 'poll /api/flood/status' }); }
        if (what === 'all') { bg(async () => { await app.flood.runSnap(force); await app.flood.runClimate(force); await app.flood.runForecast(); }, 'all'); return send(res, 202, { all: 'started', note: 'poll /api/flood/status' }); }
        bg(() => app.flood.runForecast(), 'forecast'); return send(res, 202, { forecast: 'started', note: 'poll /api/flood/status' }); }
      if (p === '/api/outlook/run') { const what = url.searchParams.get('what') || 'all'; const r = {};
        if (what === 'smog') { app.smog.run().catch(e => console.error('  smog error', e.message)); return send(res, 202, { smog: 'started' }); }
        if (what === 'backup') { try { return send(res, 200, app.ops.backup()); } catch (e) { return send(res, 500, { error: e.message }); } }
        if (what === 'seasonal') { app.outlook.runSeasonal().catch(e => console.error('  outlook error', e.message)); return send(res, 202, { seasonal: 'started' }); }
        if (what === 'bias') { r.bias = 'started'; app.outlook.runEnsembleBias().then(() => app.outlook.runEnsemble()).catch(e => console.error('  outlook error', e.message)); return send(res, 202, r); }
        if (what !== 'radiation') r.ensemble = app.outlook.status().running.ensemble ? 'already running' : (app.outlook.runEnsemble().catch(e => console.error('  outlook error', e.message)), 'started');
        if (what !== 'ensemble') r.radiation = app.outlook.status().running.radiation ? 'already running' : (app.outlook.runRadiation().catch(e => console.error('  outlook error', e.message)), 'started');
        return send(res, 202, { ...r, note: 'running in background; poll /api/outlook/status' }); }
      if (p === '/api/verification/run') { const already = app.verification.isRunning(); if (!already) app.verification.run().catch(e => console.error('  verify error', e.message)); return send(res, 202, { started: !already, note: 'running in background; poll /api/verification/grades' }); }
      limit('ai:' + (who ? 'user:' + who.actorId : 'anon:' + clientIp(req)));
      let body = {}; try { body = await readBody(req); } catch { return send(res, 422, { error: 'bad_json' }); }   /* v91.17.34 · the 5 MB cap applies here too */
      const out = await ai.chat(body, { identity: who, qa: qaOkOf(req) });   /* v91.17.71 · body.model only for internal QA (A/B bench) */
      /* v91.17.126 · stage 7 · an AI answer names the model, rule and run identity of the facts it was written from */
      try { if (out && out.json && typeof out.json === 'object' && !Array.isArray(out.json) && app.provenance) out.json.provenance = { ...app.provenance.block(), operatorOnly: true }; } catch (_) {}   /* v91.17.266 · interface 3 */
      /* v91.17.283.34 · AI Assistant · the one grounding line: the place and the time of the checked forecast the answer was written from */
      try { if (out && out.json && typeof out.json === 'object' && out.json.answer) { const B = out.json.basis || {}, PV = out.json.provenance || {};
        out.json.basis = { place: B.place || (body.context && (body.context.location || body.context.place)) || null, at: B.at || (PV.levels && PV.levels.publishedAt) || (PV.nationalRun && PV.nationalRun.completed) || null };
        if (!Array.isArray(out.json.chips)) out.json.chips = []; } } catch (_) {}
      /* == v91.17.283.48 · GUIDANCE (GUIDANCE_PANEL=1): a "what should I do" answer is library text that cites the issuing authorities (NDMA, PDMAs)
         and their helplines; ai.mjs applied the agency rule (PMD / FFD never named), so the role-word rewrite is not applied to it == */
      if (GUIDANCE_ON() && out && out.json && out.json.kind === 'guidance') { res.__agnClean = true; return send(res, out.status, out.json); }
      /* v91.17.172 · audit E-14 · the answer is customer text on the default path (the facts pack already is): role words, not suppliers */
      if (!internalNames() || customerView(req)) return send(res, out.status, customerScrub(out.json));
      return send(res, out.status, out.json);
    }
    if (p.startsWith('/api/api/v1/')) p = p.slice(4);            // integration console default base '/api'
    if (!p.startsWith('/api/v1/')) return false;
    const ctx = { requestId: req.headers['x-request-id'] || newId('req'), traceId: req.headers['x-trace-id'] || newId('trace'), remote: req.socket.remoteAddress, req };
    let endpoint = null;
    try {
      limit('ip:' + clientIp(req), ipPerMin());   /* v91.17.283 · WS1 · before routing and before the token is read */
      let match = null;
      for (const r of routes) { if (r.e.method !== req.method) continue; const m = r.re.exec(p); if (m) { match = { e: r.e, params: m.groups || {} }; break; } }
      if (!match) {
        const other = routes.find(r => r.re.test(p));
        throw other ? new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use ' + other.e.method + ' for ' + p + '.') : new ApiError(404, 'NOT_FOUND', 'No endpoint ' + req.method + ' ' + p + ' in contract 1.0.');
      }
      endpoint = match.e; ctx.endpointId = endpoint.id;
      const v = req.headers['x-agn-api-version']; if (v && v !== API_VERSION) throw new ApiError(409, 'VERSION_CONFLICT', 'Server speaks API ' + API_VERSION + ', client sent ' + v + '.');
      ctx.identity = identity.resolve(req);
      const tenant = req.headers['x-agn-tenant-id']; if (ctx.identity && tenant && tenant !== ctx.identity.tenantId) throw new ApiError(403, 'TENANT_REQUIRED', 'Tenant header does not match the token tenant.');
      authorize(endpoint, ctx.identity);
      limit(ctx.identity ? 'user:' + ctx.identity.actorId : 'anon:' + clientIp(req));
      const query = {}; for (const k of new Set(url.searchParams.keys())) { const all = url.searchParams.getAll(k); query[k] = all.length > 1 ? all : all[0]; }
      const body = req.method === 'GET' ? {} : await readBody(req);
      const params = validate(endpoint, { pathParams: Object.fromEntries(Object.entries(match.params).map(([k, x]) => [k, decodeURIComponent(x)])), query, body });

      let idemRow = null;
      if (endpoint.idempotency.required) {
        const key = req.headers[endpoint.idempotency.header.toLowerCase()];
        if (!key) throw new ApiError(422, 'CONTRACT_INVALID', endpoint.idempotency.header + ' header is required for this write.');
        const reqHash = hashStable({ path: params.path, body: params.body });
        idemRow = store.find('idempotency', r => r.key === key && r.endpoint === endpoint.id && r.actorId === ctx.identity.actorId);
        if (idemRow) {
          if (idemRow.requestHash !== reqHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This Idempotency-Key was already used with a different request.');
          if (idemRow.response) return send(res, idemRow.status, { ...idemRow.response, requestId: ctx.requestId, traceId: ctx.traceId }, { 'idempotent-replayed': 'true' });
          throw new ApiError(409, 'IDEMPOTENCY_IN_PROGRESS', 'A request with this Idempotency-Key is still being processed.', { retryable: true });
        }
        idemRow = await store.insert('idempotency', { key, endpoint: endpoint.id, actorId: ctx.identity.actorId, requestHash: reqHash, createdAt: nowIso(), response: null, status: null });
      }
      let out;
      try { out = await H[endpoint.id](app, params, ctx); }
      catch (e) { if (idemRow) await store.removeWhere('idempotency', r => r === idemRow); throw e; }
      let data = out.data, pagination = null;
      if (endpoint.response.collection) { const pg = paginate(data || [], params.query, endpoint); data = pg.page; pagination = pg.pagination; }
      const status = out.status || 200;
      const env = success(endpoint, ctx, data, { meta: out.meta || {}, pagination });
      if (idemRow) { idemRow.response = env; idemRow.status = status; if (store.allForWrite) store.allForWrite('idempotency'); await store.save(); }   /* v91.17.235 · marked: changed in place */
      if (req.method !== 'GET') await audit.record('api.' + endpoint.id, 'success', ctx, { status });
      return send(res, status, env);
    } catch (err) {
      const e = err instanceof ApiError ? err : (err && err.code === 'STORE_READ_ONLY') ? new ApiError(503, 'STORE_READ_ONLY', err.message) : new ApiError(500, 'INTERNAL_ERROR', 'Internal error: ' + (err && err.message || err));
      if (!(err instanceof ApiError)) console.error('  backend error', endpoint && endpoint.id, err);
      if (e.status === 401 || e.status === 403 || (req.method !== 'GET' && endpoint)) { try { await audit.record('api.' + (endpoint ? endpoint.id : 'unmatched'), 'denied:' + e.code, ctx, { status: e.status, message: e.message }); } catch { } }
      return send(res, e.status, failure(e, ctx), e.status === 429 ? { 'retry-after': '30' } : {});
    }
  }
  let gov = null; const governance = () => gov || (gov = createGovernance(app));

  async function ensureDefaultSchedule() {
    if (process.env.NIGRAAN_AUTO_SCHEDULE === '0') return;
    /* v91.17.3 · 3.2 · a deployment that already has the default schedule keeps
       its old five-variable payload forever, because this function returns as
       soon as any schedule exists. The server-created schedule is upgraded in
       place — only that one, only by adding variables, never removing any and
       never touching a schedule a person made. */
    {
      const mine = store.find('schedules', x => x.created_by === 'server-startup' && x.name === 'national-hourly (default)');
      if (mine && mine.payload && Array.isArray(mine.payload.variables)) {
        const want = ['freezing_level_height', 'cape', 'uv_index', 'snowfall'];   /* v91.17.161 · existing schedules gain snowfall (liquid-rain triggers) */
        const add = want.filter(v => !mine.payload.variables.includes(v));
        if (add.length) {
          mine.payload.variables = mine.payload.variables.concat(add);
          await store.save();
          console.log('  schedule   national-hourly upgraded: added ' + add.join(', ') + ' (no extra provider cost at this variable count)');
        }
      }
    }
    if (store.all('schedules').length) return;
    await store.insert('schedules', { schedule_id: newId('sch'), name: 'national-hourly (default)', cadence_minutes: 60, enabled: true, next_run_at: nowIso(),
      /* ══ v91.17.3 · 3.2 · THREE VARIABLES THE HAZARD ENGINE ASKS FOR ═══════
         The hourly national job fetched five variables and the hazard engine
         wanted eight. freezing_level_height governs where snow becomes rain
         and is the routing term for every melt and rain-on-snow rule; cape is
         the only convective-instability field on this plan and the lightning
         proxy was built from rain and gust because nothing supplied it;
         uv_index is needed for outdoor-work guidance the heat actions already
         give without it.
         They are added here, not in a second job, because the provider weights
         a call as locations x max(1, vars/10) x max(1, days/14): five
         variables and eight variables cost EXACTLY THE SAME. This is free.
         snow_depth is deliberately NOT added — measured at 310 cm against
         36 cm observed with correlation −0.10, it is dropped as an input
         everywhere else in this build and adding it here would reintroduce it. */
      payload: { unit_level: 'tehsil', variables: ['temperature_2m', 'relative_humidity_2m', 'precipitation', 'snowfall', 'wind_speed_10m', 'wind_gusts_10m', 'freezing_level_height', 'cape', 'uv_index'], lead_hours: [0, 24, 48, 72] },
      created_at: nowIso(), created_by: 'server-startup' });
    console.log('  schedule   national-hourly created: 577 tehsils every 60 min (NIGRAAN_AUTO_SCHEDULE=0 to disable)');
  }
  /* v91.17.270 · OPS A8 · a heavy table that is missing waits for the operator: one alert a day (open until the table is back), one log
     line a day, and the state on /api/checks (rebuildHeld) and the ops board's climatology row */
  const HELD = {}; app.rebuildHeld = () => ({ ...HELD });
  async function holdRebuild(what, file, estW) {
    const day = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
    const cmd = 'curl -X POST "http://127.0.0.1:8787/api/checks/run?what=' + what + '"';
    const prev = HELD[what]; HELD[what] = { since: (prev && prev.since) || nowIso(), day: prev && prev.day, file, estimatedWeightedCalls: estW, operatorAction: cmd, why: file + ' is missing or not ready: the rebuild is not started by itself (about ' + (estW ? Math.round(estW).toLocaleString('en-US') : 'many') + ' weighted provider calls)' };
    if (HELD[what].day === day) return; HELD[what].day = day;
    console.error('  ALERT ' + HELD[what].why + '. Operator, on this computer: ' + cmd + ' (or set NIGRAAN_CLIM_AUTOBUILD=1)');
    try { await app.raiseAlert('rebuild_held', 'warning', HELD[what].why + '. Operator action on the server computer: ' + cmd + '.', { table: what }); } catch (_) {}
  }
  function startWorker() {
    if (!app.backgroundWorker.enabled) return;
    if (provider.configured()) ensureDefaultSchedule().catch(e => console.error('  schedule error', e.message));
    const verifyTick = () => { app.verification.scoreLedger().catch(() => {}); if (provider.configured() && app.verification.due() && !app.verification.isRunning() && store.all('runs').some(r => r.status === 'complete')) app.verification.run().catch(e => console.error('  verify error', e.message)); };
    schedule(app, 'verification', 30 * 60e3, verifyTick, { firstMs: 60e3, label: 'forecast verification and ledger' });
    const checksTick = async () => {
      if (!provider.configured() || process.env.NIGRAAN_OUTLOOK === '0') return;
      try {
        /* v91.17.157 · audit: each step runs on its own, so one rejection (e.g. climatology.build) no longer skips the smog, outlook and
           wetness refreshes on every cycle, which left 2-day-old air quality on the card with nothing flagged */
        const kick = (name, f) => { try { const r = f(); if (r && typeof r.catch === 'function') r.catch((e) => console.error('  checks error [' + name + ']', e && e.message)); } catch (e) { console.error('  checks error [' + name + ']', e && e.message); } };   /* started, not awaited, as before */
        const step = async (name, f) => { try { await f(); } catch (e) { console.error('  checks error [' + name + ']', e && e.message); } };
        /* v91.17.270 · OPS A8 · NO SILENT REBUILD. A missing or unreadable data/climatology.json used to start the 30-year ERA5 rebuild
           here by itself: about 292,600 weighted provider calls in one go (PERF A8, measured), nearly a third of a heavy day's budget,
           with nothing shown to anyone. Now the tick raises an operator alert (once a day, open until the table is back) and the
           rebuild waits for the operator's own request (POST /api/checks/run?what=climatology from this computer, as before), or for
           NIGRAAN_CLIM_AUTOBUILD=1. The anomaly climate (data/anomaly-climate.json, the same kind of archive sweep) follows the same rule. */
        await step('climatology', async () => { if (!app.climatology.ready() && !app.climatology.status().building) { if (process.env.NIGRAAN_CLIM_AUTOBUILD === '1') { await app.climatology.build(); if (app.climatology.ready()) await app.outlook.runEnsemble(); } else await holdRebuild('climatology', 'data/climatology.json', app.climatology.estimateWeight ? app.climatology.estimateWeight('climatology') : null); } });
        kick('outlook', () => app.outlook.tick());
        kick('smog', () => app.smog.tick());
        kick('wetness', () => app.wetness.tick());   /* v91.17.42 */
        kick('landslide', () => app.landslideOdds.tick());   /* v91.17.112 */
        try { app.pointEngine.archiveDaily(dataDir).catch(() => {}); } catch (_) {}   /* v91.17.120 · forward-test points */
        await step('anomaly', async () => { if (app.climatology.ready() && !app.climatology.anomalyReady() && !app.climatology.anomalyBuilding()) { if (process.env.NIGRAAN_CLIM_AUTOBUILD === '1') await app.climatology.buildAnomaly(); else await holdRebuild('anomaly', 'data/anomaly-climate.json', app.climatology.estimateWeight ? app.climatology.estimateWeight('anomaly') : null); } });
        /* the soil baseline follows the calendar (+/-10 day window; a no-op on most ticks) */
        await step('soilClim', async () => { if (app.climatology.ready()) await app.climatology.buildSoilClimatology(); });
        await step('drought', async () => { if (app.climatology.ready()) await app.climatology.buildDroughtNational(false); });
        await step('seasVerify', () => app.seasVerify.score());
        await step('ops', () => app.ops.tick());
        await step('ensVerify', () => app.ensVerify.score());
        await step('stations', async () => { if (app.stations.due() && app.verification.grades().summary) await app.stations.run(); });
      } catch (e) { console.error('  checks error', e.message); }
    };
    setTimeout(() => app.outlook.tick(), 90e3); setTimeout(() => app.smog.tick(), 100e3); setTimeout(() => app.wetness.tick(), 110e3); setTimeout(() => { try { app.landslideOdds.tick(); } catch (_) {} }, 125e3); schedule(app, 'checks', 10 * 60e3, checksTick, { firstMs: 150e3, label: 'outlook, smog, wetness, landslide, climatology, drought, scores' });
    const ctx = { identity: { actorId: 'background-worker', tenantId: 'agn-local' }, requestId: 'worker', traceId: 'worker' };
    schedule(app, 'worker', app.backgroundWorker.intervalSeconds * 1000, async () => {
      try { await ingestion.recover(ctx); await ingestion.tick(ctx); const r = await ingestion.runOnce('background-worker', ctx); app.backgroundWorker.lastTickAt = nowIso(); app.backgroundWorker.lastError = null;
        if (r.processed) { const run = r.job.run_id && store.find('runs', x => x.run_id === r.job.run_id); console.log('  worker     ' + new Date().toLocaleTimeString() + '  job ' + r.job.status + (run ? '  ' + run.returned_units + '/' + run.requested_units + ' units, ' + run.coverage + '%' : '') + (r.job.last_error ? '  ' + r.job.last_error.message : '')); } }
      catch (e) { app.backgroundWorker.lastError = e.message; }
    }, { label: 'national run worker (ingestion queue)' });   /* the scheduler never overlaps a job, so the old busy flag is gone */
  }
  /* v91.17.283.1 · the one customer-view test (header, operator on this computer, signed operator, internal naming), for server.mjs installAgencyScrub */
  return { handle, startWorker, warmUp, app, endpointCount: endpointList.length, customerView };
}
