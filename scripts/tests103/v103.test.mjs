import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.103 · scientific cleanup + enforceable model gate: the acceptance table agreed on 1 Oct 2026.
   node nigraan-local/scripts/tests103/v103.test.mjs  (server running) */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); } };
const rd = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ROOT = (__T.ROOT + '/');
const get = async (p, h = {}) => { const r = await fetch(BASE + p, { headers: h, signal: AbortSignal.timeout(180000) }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, json: j }; };
const CUST = { 'x-agn-view': 'customer' };

/* ── static: the source says what it does ── */
const B = rd('../../build/base/AI_GEO_NIGRAAN_v91_17_BASE80.html');
const ART = rd('../../artefact/AI_GEO_NIGRAAN_v91_17_MACH.html');
ok(/const score=Math\.round\(hzClamp\(_gatedStress,0,100\)\);/.test(B) && /elevAmp:1, elevAmpDiagnostic:/.test(B), 'cold: the elevation amplifier is out of the score (diagnostic only)');
ok(/the local cold baseline \(this unit\\'s 10th-percentile night minimum for the date\) has not loaded, so cold is not scored/.test(B), 'cold: no national fallback shift when the local baseline is missing');
ok(/severityQuantity:'UTCI in shade'/.test(B) && /score = _agnU;/.test(B) && /could not be placed on the AGN level mapping/.test(B), 'heat: severity is the AGN mapping of shade UTCI');
ok(/const utciClass=agnUtciClass\(utci\);/.test(B) && /const _uS=utci;/.test(B), 'comfort: class and score from shade UTCI');
const SC = JSON.parse(rd('../../data/map-layer-scales.json'));
const nb = SC.layers.nss_baseline, nd = SC.layers.nss_dynamic;
ok(nb.palette && nd.palette && nb.value === 'physical' && nb.unit === 'mm' && !nb.cuts.some(c => c.level) && !/Normal|Severe/.test(JSON.stringify(nb.words)), 'sponge: Runoff Retention Potential has its own palette and words, no hazard levels');
const GATE = JSON.parse(rd('../../data/model-gate.json'));
const REQ = GATE.classes.calibrated_model.required;
ok(['source', 'method', 'calibration', 'independent_test', 'skill_metrics', 'operational_threshold', 'known_limitations'].every(f => REQ.includes(f)), 'gate: calibrated_model requires the seven fields');
ok(GATE.entries.filter(e => e.class === 'published_standard').every(e => (e.known_limitations || []).length), 'gate: every published standard carries known limitations');
ok(GATE.entries.filter(e => e.class === 'convention').every(e => e.maps && e.label), 'gate: every convention is labelled and names the quantity it maps');
const LED = JSON.parse(rd('../../data/rule-ledger.json'));
ok(['cold-elevation-double-count', 'cold-no-fallback', 'heat-wetbulb-ramp-withdrawn', 'heat-utci-shade', 'sun-utci-estimated', 'sponge-retention', 'rain-current-chance', 'model-gate'].every(id => LED.rules.some(r => r.id === id && r.old && r.new && r.reason && r.evidence && r.effective)), 'rule ledger: every v103 change has old rule, new rule, reason, evidence and version');
ok(/gate: gateV, \.\.\.o/.test(rd('../../server/api/archive.mjs')), 'archive: issued rows are stamped with the gate version');

/* ── the gate resolver ── */
const tmp = mkdtempSync(join(tmpdir(), 'gate-'));
const dry = (g) => { const f = join(tmp, 'g.json'); writeFileSync(f, JSON.stringify(g)); try { return JSON.parse(execFileSync(__T.PYTHON, [ROOT + 'scripts/gen/gen_gate.py', '--in', f, '--dry'], { encoding: 'utf8' })); } catch (e) { try { return JSON.parse(e.stdout); } catch (_) { return { ok: false, errors: [String(e.message).slice(0, 200)] }; } } };
const clone = () => JSON.parse(JSON.stringify(GATE));
const R0 = dry(clone());
ok(R0.ok && R0.resolved['rain-chance'].status === 'operational' && R0.resolved.flood.status === 'experimental' && R0.resolved.retention.status === 'reference', 'gate resolves: rain chance operational, flood experimental, retention reference');
{ const g = clone(); delete g.entries.find(e => e.id === 'rain-chance').independent_test; const r = dry(g);
  ok(r.ok && r.resolved['rain-chance'].status === 'experimental' && !r.resolved['rain-chance'].canAlert && /independent_test/.test(r.resolved['rain-chance'].why.join(' ')), 'a calibrated model missing a gate field becomes experimental', JSON.stringify(r.resolved && r.resolved['rain-chance'])); }
{ const g = clone(); g.entries.find(e => e.id === 'utci').dependencies.push('sun-utci'); const r = dry(g);
  ok(r.ok && r.resolved.utci.status === 'experimental' && /sun-utci is experimental/.test(r.resolved.utci.why.join(' ')), 'an experimental dependency in an operational formula downgrades the composite'); }
{ const g = clone(); const c = g.entries.find(e => e.id === 'cold'); c.layers = []; const r = dry(g);
  ok(!r.ok && (r.errors || []).some(x => /map layer 'cold' has no gate entry/.test(x)), 'a map layer without a gate entry fails the build', JSON.stringify(r.errors)); }
ok(R0.ok && R0.resolved.seismic.canAlert === false && R0.resolved.retention.canAlert === false, 'reference layers cannot alert');

/* ── the server ── */
const PG = await get('/api/gate', CUST);
ok(PG.status === 200 && PG.json.ready && PG.json.entries.length === GATE.entries.length && !/ECMWF|GloFAS|IMERG|ERA5|NOAA|USGS|CHIRPS|WeatherNext/.test(JSON.stringify(PG.json)), 'public gate summary: statuses only, no suppliers');
const OG = await get('/api/ops/gate', CUST), OG2 = await get('/api/ops/gate');
ok(OG.status === 403 && OG2.status === 200 && OG2.json.entries.every(e => e.method && e.source && e.version && e.resolved) && OG2.json.entries.filter(e => e.class !== 'experimental' && e.class !== 'convention').every(e => (e.known_limitations || []).length) && OG2.json.ledger, 'audit: the operator gate shows method, source, version and limitations');
ok(/c\.id='agnGateCard'/.test(ART) && /if\(!isOp\(\)\)\{ if\(c\) c\.remove\(\); return; \}/.test(ART), 'audit card is built only in operator mode');

/* ── the page ── */
const { chromium } = __T.playwrightSync();
const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
const pg = await br.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => window.DISTRICT_IN && Object.keys(window.DISTRICT_IN).length > 300 && window.AGN && AGN.gate && AGN.gate.ready, null, { timeout: 180000 }).catch(() => {});
await pg.waitForTimeout(20000);
const R = await pg.evaluate(() => {
  const o = {};
  /* cold: the same anchor and stress at 500 m and at 3,500 m give the same score */
  try { const i = { t: -8, tmin: -8, tminDay: -8, hum: 70, wind: 8, tn10: -6, elev: 500 };   /* v111: cold is UTCI, so humidity and wind are inputs */ const a = hzCold(Object.assign({}, i), { zone: 'high_mountain', emin: 400, elev: 600 }); const b = hzCold(Object.assign({}, i, { elev: 3500 }), { zone: 'high_mountain', emin: 3200, elev: 4200 });
    o.cold = { a: a.score, b: b.score, ea: a.elevAmp, eb: b.elevAmp, un: a.unavailable, ub: b.unavailable }; } catch (e) { o.cold = 'err ' + e.message; }
  /* heat: wet bulb below 31 C, the withdrawn ramp does not move the score */
  try { const inp = { t: 30, hum: 80, wind: 10, heatDryTemp: 30 }; const h1 = hzHeat(inp, { zone: 'irrigated_plains', elev: 200 });
    const P = FORMULA_REGISTRY.heat.wetBulbLadder.value.points, keep = JSON.stringify(P); P.forEach(p => { p[1] = p[1] * 0.5; });
    FORMULA_REGISTRY.heat.dryOnsetC.value = 20; const h2 = hzHeat(inp, { zone: 'irrigated_plains', elev: 200 });
    FORMULA_REGISTRY.heat.wetBulbLadder.value.points = JSON.parse(keep); FORMULA_REGISTRY.heat.dryOnsetC.value = 42;
    const u = agnUtci(30, 30, 10 / 3.6, 80);
    o.heat = { wb: h1.wb, s1: h1.score, s2: h2.score, expect: agnUtciAgnScore(u), utci: h1.utciShade, cls: h1.utciClass, legacy: h1.legacyIndex, sev: h1.severityQuantity }; } catch (e) { o.heat = 'err ' + e.message; }
  /* heat: radiation does not move the level (shade controls) */
  try { const a = hzHeat({ t: 40, hum: 30, wind: 8, radToday: 0 }, { zone: 'arid_plains' }), b = hzHeat({ t: 40, hum: 30, wind: 8, radToday: 30 }, { zone: 'arid_plains' }); o.rad = [a.score, b.score]; } catch (e) { o.rad = 'err ' + e.message; }
  /* no humidity: not scored */
  try { const h = hzHeat({ t: 40, wind: 8 }, { zone: 'arid_plains' }); o.nohum = { score: h.score, un: h.unavailable }; } catch (e) { o.nohum = 'err ' + e.message; }
  /* comfort: sunshine present, shade controls; sun is labelled estimated */
  const _now = Date.now; Date.now = () => Date.UTC(2026, 5, 15, 7, 0, 0);   /* v108: noon PKT, so the sun is up whatever hour the suite runs */
  try { const c = stationComfort({ t: 38, hum: 40, wind: 7, lat: 31.5, lon: 74.3, shortwave: 850 }); const d = discomfortLevel(c.di, c);
    o.sun = { utci: c.utci, sun: c.utciSun, cls: c.utciClass, shadeCls: agnUtciClass(c.utci), est: c.utciSunEstimated, dlU: d.utci, note: d.note }; } catch (e) { o.sun = 'err ' + e.message; } finally { Date.now = _now; }
  /* retention: S = 25400/CN - 254 */
  try { const keys = Object.keys(DISTRICT_IN).slice(0, 40); let n = 0, bad = 0, ex = null;
    for (const k of keys) { const r = hzScore(k, DISTRICT_IN[k], 'nss_baseline', 24, k); const cn = (String(r.notes && r.notes[0]).match(/(?:at CN|curve number) ([\d.]+)/) || [])[1];   /* v91.17.228 · the note now reads "curve number 82.1" */
      if (r.physicalValue == null || cn == null) continue; n++; const S = 25400 / +cn - 254; if (Math.abs(S - r.physicalValue) > 0.3) { bad++; ex = [k, cn, S, r.physicalValue]; } }
    o.ret = { n, bad, ex }; } catch (e) { o.ret = 'err ' + e.message; }
  /* the gate in the page */
  try { o.gate = { seismicAlert: AGN.gate.canAlert('seismic'), retAlert: AGN.gate.canAlert('nss_baseline'), heatAlert: AGN.gate.canAlert('heat'), floodAlert: AGN.gate.canAlert('flood'), rainAlert: AGN.gate.canAlert('rain_hz'), unknown: AGN.gate.status('nope') };
    const al = (typeof activeAlerts === 'function') ? activeAlerts() : []; o.alerts = al.map(a => (a.holders || [{ hazard: a.hazard }]).map(h => h.hazard).join('+') + (a.agnQuake ? ':quake' : ''));
    o.badAlerts = al.filter(a => !a.agnQuake && (a.holders || [{ hazard: a.hazard }]).some(h => !AGN.gate.canAlert(h.hazard))).length; } catch (e) { o.gate = 'err ' + e.message; }
  /* the registry perturbation check: superseded (diagnostic) entries report INFO, nothing FAILs as decorative */
  try { o.sup = ['wetBulbLadder', 'dryOnsetC', 'airStressSlope'].map(k => FORMULA_REGISTRY.heat[k].calibrationStatus).concat([FORMULA_REGISTRY.cold.elevAmpBands.calibrationStatus]); } catch (e) { o.sup = 'err ' + e.message; }
  return o; });
ok(R.cold && R.cold.a != null && R.cold.a === R.cold.b, 'Phandar cold: no elevation double count (same anchor, 500 m vs 3,500 m: same score)', JSON.stringify(R.cold));
ok(R.heat && R.heat.s1 === R.heat.expect && R.heat.s1 === R.heat.s2 && R.heat.wb < 31 && R.heat.sev === 'UTCI in shade', 'wet bulb below 31 °C: no legacy ramp (halving the ladder and moving dry onset leave the score)', JSON.stringify(R.heat));
ok(Array.isArray(R.rad) && R.rad[0] === R.rad[1], 'sunshine present: radiation does not move the heat level', JSON.stringify(R.rad));
ok(R.nohum && R.nohum.score == null && R.nohum.un === true, 'heat with no humidity is not scored (no assumed humidity)', JSON.stringify(R.nohum));
ok(R.sun && R.sun.sun != null && R.sun.cls === R.sun.shadeCls && R.sun.dlU === R.sun.utci && /estimated/.test(R.sun.note) && R.sun.est === true, 'sun UTCI is shown as Estimated and never drives the class', JSON.stringify(R.sun));
ok(R.ret && R.ret.n >= 20 && R.ret.bad === 0, 'retention: S = 25400/CN − 254 reproduced (' + (R.ret && R.ret.n) + ' units)', JSON.stringify(R.ret));
ok(R.gate && R.gate.seismicAlert === false && R.gate.retAlert === false && R.gate.floodAlert === false && R.gate.heatAlert === true && R.gate.rainAlert === true && R.gate.unknown === 'experimental', 'page gate: reference and experimental cannot alert, operational can, unknown fails closed', JSON.stringify(R.gate));
ok(R.badAlerts === 0, 'no alert row carries a hazard the gate forbids (' + JSON.stringify(R.alerts) + ')');
ok(Array.isArray(R.sup) && R.sup.every(x => x === 'superseded'), 'diagnostic components are marked superseded (zero weight)', JSON.stringify(R.sup));

/* sponge on the map: own palette, no hazard colours; the key carries the status tag (customer view) */
await pg.evaluate(() => { const s = document.getElementById('mapHazardPick'); s.value = 'nss_baseline'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await pg.waitForTimeout(12000);
const SP = await pg.evaluate(() => { const n = document.getElementById('v3legend'); const t = AGN.hz5.tally(); const sc = AGN.hz5.scaleOf('nss_baseline');
  return { txt: n ? n.textContent : '', tag: (n && n.querySelector('.agn-gate-tag') || {}).textContent || '', placed: t.c.reduce((a, b) => a + b, 0), pal: sc && sc.palette,
    sw: [].map.call(n ? n.querySelectorAll('.agn-leg-row i') : [], i => i.style.background).slice(0, 5) }; });
ok(SP.placed > 300 && /retention/i.test(SP.txt) && !/Severe|High or Severe/.test(SP.txt), 'sponge layer: retention words, no hazard red/orange/green (' + SP.placed + ' placed)', SP.txt.slice(0, 300));
ok(/^Reference/.test(SP.tag), 'reference layer displays with its status tag', SP.tag);
await pg.evaluate(() => { const s = document.getElementById('mapHazardPick'); s.value = 'wind'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await pg.waitForTimeout(6000);
const CT = await pg.evaluate(() => ((document.querySelector('#v3legend .agn-gate-tag') || {}).textContent || '') + ' | ' + ((document.querySelector('#mapHazardPick option[value="wind"]') || {}).textContent || ''));
ok(/^Experimental/.test(CT) && /\(experimental\)/.test(CT), 'customer view shows the experimental tag on the key and in the picker', CT);
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();

/* installer: a second run changes nothing */
const AP = (() => { try { return readFileSync(ROOT + '../deploy_pkg_v103/APPLY_V103.bat', 'utf8'); } catch (_) { try { return readFileSync('/mnt/user-data/outputs/v103_pkg/APPLY_V103.bat', 'utf8'); } catch (__) { return ''; } } })();
if (AP) ok(/if exist "%LOCK%"/.test(AP) && /> "%LOCK%"/.test(AP) && /if exist "%HERE%station-lake"/.test(AP) && !/start ""/.test(AP), 'APPLY_V103: lock at start refuses a second run; station-lake copied only if shipped; no browser');
else ok(true, 'installer not packaged yet - skipped');

console.log((fails ? 'FAIL' : 'PASS') + ' v103: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
