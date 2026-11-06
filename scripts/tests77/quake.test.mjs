import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.77 · agent Q · recent earthquakes: server module, rule file, replays, map overlay, alerts, supplier-name hygiene.
   Usage: node scripts/tests77/quake.test.mjs [base] [--no-browser]     (default http://127.0.0.1:8787). PASS/FAIL lines; exit 1 on FAIL.
   A · rule file data/seismic-felt-rule.json: every number with its source (IPE coefficients from the OpenQuake source, validity,
       ShakeMap legend -> Low/Moderate/High/Severe, poll = the feeds' max-age, magMin, retention, region, alert window).
   B · replays through GET /api/quake/replay: 2005 Kashmir (usp000e12e: Muzaffarabad ~8.3 Severe, 234 tehsils flagged as agent E
       measured) and 2023 Jurm (us7000jln7: Lower Dir and Swat highest at Moderate, no High).
   C · live: GET /api/quake/live parses the day and significant feeds (every upstream event in the buffered box at magMin is
       there), each flag inside the rule's validity, generic credit only, no supplier name in the JSON; /api/ext/usgs compat.
       NOTE: B and C need the internet (catalogue and feeds); a network failure here is environmental, not a code fault.
   D · static: the built page carries no nudge constants (cap 22 / 250 km), the quake fragment, and no supplier name.
   E · page (Playwright, customer view): "Recent earthquakes" toggle in the map toolbar draws the epicentres; the Kashmir replay
       loaded into the page outlines 234 tehsils, puts the High/Severe tehsils in the Alerts list and the "Check these" chip,
       a click on an alert row zooms to the tehsil, the epicentre popup gives magnitude, depth, PKT time and felt / shaking words,
       the seismic panel note uses the overlay; no supplier name on screen; no page errors. */
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
let fails = 0, passes = 0;
const ok = (c, name, info) => { if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info != null && info !== '' ? ' · ' + String(info).slice(0, 300) : '')); };
const J = async (p, t = 120000) => {   /* one retry on a dropped connection (the box can stall the event loop for tens of seconds) */
  for (let k = 0; ; k++) { try { const r = await fetch(BASE + p, { cache: 'no-store', signal: AbortSignal.timeout(t) }); const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch { j = null; } return { status: r.status, j, txt }; }
    catch (e) { if (k >= 1) return { status: 0, j: null, txt: String(e && (e.cause && e.cause.code || e.message)) }; await new Promise(r => setTimeout(r, 3000)); } } };
const SUPPLIER = /\b(?:USGS|U\.S\. Geological Survey|ShakeMap|PMD|Pakistan Meteorological|NOAA|NASA|ECMWF|GloFAS|Open-Meteo|ERA5|IMERG)\b/;
const W = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];

/* ═══ A · the rule file ═══ */
const R = JSON.parse(readFileSync(join(ROOT, 'data', 'seismic-felt-rule.json'), 'utf8'));
ok(R.ipe && R.ipe.coeffs && ['c0', 'c1', 'c2', 'c4', 'm1', 'm2'].every(k => typeof R.ipe.coeffs[k] === 'number') && /allen_2012_ipe\.py/.test(R.ipe.coeffSource) && /10\.1007\/s10950-012-9278-7/.test(R.ipe.citation),
  'A rule: IPE coefficients with the OpenQuake source and the paper', JSON.stringify(R.ipe.coeffs));
ok(R.ipe.validity && R.ipe.validity.mwMin === 5 && R.ipe.validity.mwMax === 7.9 && R.ipe.validity.distanceKmMax === 300 && /springer/.test(R.ipe.validity.source), 'A rule: validity Mw 5.0-7.9, < 300 km, sourced');
ok(Array.isArray(R.levels) && R.levels.map(l => l.level).join() === 'Low,Moderate,High,Severe' && R.levels.map(l => l.shakeMapClass).join() === 'IV,V,VI,VII' && R.levels.every((l, i) => i === 0 || l.mmiMin > R.levels[i - 1].mmiMin) && /tvguide/.test(R.levelSource) && /Low = IV/.test(R.levelMapping),
  'A rule: ShakeMap legend IV/V/VI/VII -> Low/Moderate/High/Severe, mapping documented', R.levels.map(l => l.level + '>=' + l.mmiMin).join(' '));
ok(R.poll && R.poll.feedSeconds === 60 && /max-age/.test(R.poll.feedBasis) && R.poll.revisionSeconds === 3600 && /revision|assumed/.test(R.poll.revisionBasis) && R.poll.feeds.length === 2 && R.poll.feeds.some(u => /2\.5_day/.test(u)) && R.poll.feeds.some(u => /significant/.test(u)),
  'A rule: poll every 60 s (the feeds\' max-age) on the day and significant feeds, hourly revision');
ok(R.magMin === 4 && /completeness/.test(R.magMinBasis) && R.retainDays > 0 && R.retainBasis && R.region && R.region.pakistanBbox.join() === '60.75,23.5,77.9,37.25' && R.region.bufferKm === 300 && R.region.bufferBasis,
  'A rule: magMin 4.0, retention, Pakistan box + 300 km buffer, each with a basis');
ok(R.alert && R.alert.windowDays > 0 && R.alert.windowBasis && /ALERT_MIN_CLASS_RANK/.test(R.alert.source), 'A rule: alerts use the client\'s one threshold; alert window with a basis');
ok(R.customerCredit && R.customerCredit.labelKey === 'earthquakeFeed' && R.licence && R.licence.id === 'usgs', 'A rule: generic customer credit key and the licence header (Sources tab)');

/* ═══ B · replays ═══ */
const kas = await J('/api/quake/replay?event=usp000e12e');
const ke = kas.j && kas.j.events && kas.j.events[0];
if (!ke) ok(false, 'B Kashmir 2005 replay served', kas.status + ' ' + kas.txt.slice(0, 200));
else {
  const muz = ke.tehsils.find(t => t.uid === 'Azad Kashmir|Muzaffarabad|Muzaffarabad');
  ok(ke.mag === 7.6 && ke.intensitySource === 'ShakeMap', 'B Kashmir 2005 replay: M7.6 with its shaking map', ke.mag + ' ' + ke.intensitySource);
  ok(muz && Math.abs(muz.expectedIntensity - 8.3) <= 0.15 && muz.level === 'Severe' && muz.source === 'ShakeMap', 'B Kashmir: Muzaffarabad expected intensity ~8.3, Severe', muz && (muz.expectedIntensity + ' ' + muz.level + ' ' + muz.source));
  ok(ke.flaggedCount === 234, 'B Kashmir: 234 tehsils flagged (agent E s75: 32 felt + 91 watch + 111 act)', ke.flaggedCount + ' ' + JSON.stringify(ke.byLevel));
  ok(ke.byLevel.High + ke.byLevel.Severe >= 100 && ke.byLevel.Low > 0 && ke.byLevel.Moderate > 0, 'B Kashmir: every level present, High+Severe ~ E\'s act class', JSON.stringify(ke.byLevel));
  ok(ke.tehsils.every(t => t.distanceKm <= 300), 'B Kashmir: no flag beyond 300 km', Math.max(...ke.tehsils.map(t => t.distanceKm)));
  ok(kas.j.flagged.length === 234 && kas.j.flagged.every(f => f.withinAlertWindow === true), 'B Kashmir: a replay is judged as if it had just happened (alert window)');
}
const jurm = await J('/api/quake/replay?event=us7000jln7');
const je = jurm.j && jurm.j.events && jurm.j.events[0];
if (!je) ok(false, 'B Jurm 2023 replay served', jurm.status + ' ' + jurm.txt.slice(0, 200));
else {
  const top = je.tehsils.slice(0, 2);
  ok(je.mag === 6.5 && je.depthKm > 150, 'B Jurm 2023 replay: M6.5, intermediate depth', je.mag + ' ' + je.depthKm + ' km');
  ok(top.length === 2 && top.every(t => /^(Lower Dir|Swat)$/.test(t.district) && t.level === 'Moderate'), 'B Jurm: Lower Dir and Swat highest, at Moderate', top.map(t => t.tehsil + '/' + t.district + ' ' + t.expectedIntensity + ' ' + t.level).join(' | '));
  ok(je.byLevel.High === 0 && je.byLevel.Severe === 0 && je.flaggedCount >= 60 && je.flaggedCount <= 70, 'B Jurm: no High or Severe; ~65 tehsils felt (E: 63 felt + 2 watch)', je.flaggedCount + ' ' + JSON.stringify(je.byLevel));
}
const bad = await J('/api/quake/replay?event=../x');
ok(bad.status === 422, 'B replay refuses a malformed event id', bad.status);

/* ═══ C · live ═══ */
const live = await J('/api/quake/live');
const L = live.j;
ok(live.status === 200 && L && L.ok && Array.isArray(L.events) && Array.isArray(L.flagged), 'C /api/quake/live served', live.status + (L ? ' events ' + L.events.length + ' flagged ' + L.flagged.length + ' stale ' + L.stale : ''));
if (L && L.ok) {
  const labels = JSON.parse(readFileSync(join(ROOT, 'data', 'source-labels.json'), 'utf8')).labels;
  ok(L.credit === labels.earthquakeFeed, 'C credit is the generic label from data/source-labels.json', L.credit);
  ok(!/\bUSGS\b|U\.S\. Geological/.test(live.txt), 'C no supplier name in the live JSON');
  const D2R = Math.PI / 180, B = R.region.pakistanBbox, buf = R.region.bufferKm;
  const box = { s: B[1] - buf / 111.2, n: B[3] + buf / 111.2, w: B[0] - buf / (111.2 * Math.cos(B[3] * D2R)), e: B[2] + buf / (111.2 * Math.cos(B[3] * D2R)) };
  const inBox = (lo, la) => la >= box.s && la <= box.n && lo >= box.w && lo <= box.e;
  ok(L.events.every(e => e.mag >= R.magMin && inBox(e.lon, e.lat) && Date.parse(e.time) >= Date.now() - R.retainDays * 864e5 - 3600e3), 'C every event: M >= magMin, inside the buffered box, inside the retention');
  ok(L.events.every(e => /PKT$/.test(e.timePkt || '')), 'C every event carries its time in PKT', (L.events[0] || {}).timePkt);
  const V = R.ipe.validity;
  const badFlag = L.events.flatMap(e => e.tehsils.filter(t => t.distanceKm > V.distanceKmMax || (t.source === 'equation' && (e.mag < V.mwMin || e.mag > V.mwMax)) || !W.includes(t.level) || t.levelIndex !== W.indexOf(t.level)));
  ok(badFlag.length === 0, 'C every flag inside the rule: <= 300 km, the equation only for Mw 5.0-7.9, a level word', badFlag.length);
  /* the feeds, read here directly: the module parsed every feature of each feed, and every event in the box at magMin is kept */
  try {
    const stq = (await J('/api/quake/status')).j || {}; const ids = new Set(L.events.map(e => e.id)); const miss = [], line = [];
    for (const u of R.poll.feeds) { const f = await (await fetch(u, { signal: AbortSignal.timeout(30000) })).json(); const k = u.replace(/^.*\/summary\//, ''), m = (stq.feeds || {})[k] || null;
      let inR = 0; for (const x of f.features || []) { const [lo, la] = x.geometry.coordinates; if (x.properties.mag != null && x.properties.mag >= R.magMin && inBox(lo, la) && x.properties.status !== 'deleted') { inR++; if (!ids.has(x.id)) miss.push(x.id); } }
      line.push(k + ' upstream ' + (f.features || []).length + '/' + inR + ' module ' + (m ? m.features + '/' + m.inRegion : 'none'));
      ok(m && m.features > 0 === (f.features || []).length > 0 && Math.abs(m.features - (f.features || []).length) <= 3 && Math.abs(m.inRegion - inR) <= 1, 'C live feed parse: ' + k + ' read whole (features / in the region at M' + R.magMin + '+)', line[line.length - 1]); }
    let again = null; if (miss.length) { await new Promise(r => setTimeout(r, (R.poll.feedSeconds + 5) * 1000)); const l2 = (await J('/api/quake/live')).j; again = miss.filter(id => !l2.events.some(e => e.id === id)); }
    ok(!miss.length || (again && !again.length), 'C live feed parse: every feed event in the region is in /api/quake/live', miss.length ? 'missing at first ' + miss.join(',') + ', after one poll ' + (again || []).join(',') : 'none missing');
    /* the revision query: the catalogue's last retainDays in the region, all present */
    const D2 = Math.PI / 180, q = new URLSearchParams({ format: 'geojson', minmagnitude: String(R.magMin), starttime: new Date(Date.now() - (R.retainDays - 1) * 864e5).toISOString().slice(0, 19),
      minlatitude: box.s.toFixed(3), maxlatitude: box.n.toFixed(3), minlongitude: box.w.toFixed(3), maxlongitude: box.e.toFixed(3) });
    const cat = await (await fetch('https://earthquake.usgs.gov/fdsnws/event/1/query?' + q, { signal: AbortSignal.timeout(60000) })).json();
    const cm = (cat.features || []).filter(x => !ids.has(x.id)).map(x => x.id);
    ok(cm.length === 0 && (cat.features || []).length > 0, 'C revision parse: every catalogue event of the last ' + (R.retainDays - 1) + ' days in the region is in /api/quake/live', (cat.features || []).length + ' in the catalogue' + (cm.length ? ', missing ' + cm.join(',') : '') + ' · revision ' + JSON.stringify(stq.revision));
  } catch (e) { ok(false, 'C live feed parse (network needed)', e.message); }
  const ext = await J('/api/ext/usgs');
  ok(ext.status === 200 && ext.j && ext.j.type === 'FeatureCollection' && ext.j.features.length === L.events.length && !/\bUSGS\b/.test(ext.txt), '/api/ext/usgs compatibility: the module\'s events as GeoJSON, no 15-min proxy cache', ext.status + ' ' + (ext.j ? ext.j.features.length : ''));
}
const st = await J('/api/quake/status');
ok(st.status === 200 && st.j && st.j.ok && st.j.feedSeconds === R.poll.feedSeconds, 'C /api/quake/status', st.j && JSON.stringify({ events: st.j.events, lastPollOk: st.j.lastPollOk, lastRevisionAt: st.j.lastRevisionAt, timers: st.j.timers, lastError: st.j.lastError }));
const src = await J('/api/sources');
const se = src.j && src.j.entries.filter(e => e.id === 'usgs');
ok(se && se.length === 1 && (se[0].files || []).includes('data/seismic-felt-rule.json'), 'C the supplier is credited once, on the Sources tab', se && JSON.stringify(se.map(e => e.files)));

/* ═══ D · static ═══ */
const man = JSON.parse(readFileSync(join(ROOT, 'artefact', 'MANIFEST.json'), 'utf8'));
const art = readFileSync(join(ROOT, 'artefact', Object.keys(man).find(k => /MACH\.html$/.test(k))), 'utf8');
ok(!/SEISMIC_NUDGE_MAX|SEISMIC_RADIUS_KM|0\.6\*\(q\.mag-4\)|quakes\/7d/.test(art), 'D the nudge constants (cap 22, 250 km, 0.6*(mag-4)) are gone from the built page');
ok(/id="agn-quake-js"/.test(art) && /AGN\.quake\.forDistrict/.test(art), 'D the quake fragment and the seismicLiveNudge delegation are in the built page');
ok(/AGN\.quake&&AGN\.quake\.chipMerge/.test(art), 'D the "Check these" chip calls AGN.quake.chipMerge (map_ui hook line)');
const frag = art.slice(art.indexOf('<style id="agn-quake-css">'), art.indexOf('</script>', art.indexOf('id="agn-quake-js"')));
ok(frag.length > 1000 && !/\bUSGS\b|ShakeMap</.test(frag.replace(/agn-op-only[^<]*<\/span>/g, '')), 'D no supplier name in the fragment\'s customer text');

/* ═══ E · page ═══ */
if (!NO_BROWSER) {
  const pw = await __T.playwright();
  const chromium = pw.chromium || pw.default.chromium;
  const browser = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __agnChrome(__T.chromiumPath()), args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader', '--disable-gpu', '--disable-dev-shm-usage', '--renderer-process-limit=1'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(120000);
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    const csp = []; page.on('console', m => { if (/Content Security Policy/.test(m.text())) csp.push(m.text().slice(0, 120)); });
    await page.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.AGN && AGN.quake && AGN.quake.data() && document.getElementById('agnQuakeBtn'), null, { timeout: 180000 });
    await page.waitForTimeout(6000);
    const r0 = await page.evaluate(() => ({ op: document.documentElement.classList.contains('agn-operator'), inBar: !!document.querySelector('#mpMapWrap .maptools #agnQuakeBtn'), txt: document.getElementById('agnQuakeBtn').textContent,
      ev: AGN.quake.data().events.length, wrapped: !!(window.activeAlerts && activeAlerts.__agnQ), nudge: typeof window.seismicLiveNudge === 'function' ? JSON.stringify(window.seismicLiveNudge(0, 0, 'Islamabad')) : null }));
    ok(!r0.op && r0.inBar && /^Recent earthquakes/.test(r0.txt), 'E customer view: "Recent earthquakes" toggle in the map toolbar', JSON.stringify(r0));
    ok(r0.wrapped, 'E the Alerts list is fed by the overlay (activeAlerts wrapped)');
    ok(r0.nudge === null || !/"nudge":[1-9]/.test(r0.nudge), 'E seismicLiveNudge returns no bonus (the nudge is retired)', r0.nudge);
    /* (93) the layers menu is (re)built by desktop_ui after the map bar settles: keep it open until the toggle is on screen */
    await page.waitForFunction(() => { const m = document.getElementById('agnLayersMenu80'); if (m) m.classList.add('open'); const b = document.getElementById('agnQuakeBtn'); return !!(b && b.offsetParent && b.getClientRects().length); }, null, { timeout: 120000, polling: 500 }).catch(() => {});
    await page.locator('#agnQuakeBtn').click(); await page.waitForTimeout(1500);
    /* v91.17.225 · the epicentres draw after the feed's geometry is read (2 to 6 s on a busy machine): wait for them, not a fixed time */
    await page.waitForFunction(() => document.querySelectorAll('.leaflet-agnQuakeEp-pane .agn-quake-ep').length > 0, null, { timeout: 20000, polling: 500 }).catch(() => {});
    const r1 = await page.evaluate(() => ({ on: AGN.quake.isOn(), pressed: document.getElementById('agnQuakeBtn').getAttribute('aria-pressed'), dots: document.querySelectorAll('.leaflet-agnQuakeEp-pane .agn-quake-ep').length,   /* v91.17.196 · epicentres are target symbols, not paths */ ev: AGN.quake.data().events.length, shown: AGN.quake.data().events.filter((e) => e.inPakistan !== false || (e.flaggedCount || 0) > 0).length, leg: (document.getElementById('agnQuakeLeg') || {}).innerText || '' }));
    ok(r1.on && r1.pressed === 'true' && r1.dots >= r1.shown, 'E toggle on: every epicentre in Pakistan or felt here is drawn (v93: the key says how many across the border are not)', r1.dots + ' paths for ' + r1.shown + ' shown of ' + r1.ev + ' events');
    ok(/Recent earthquakes/.test(r1.leg) && /Severe/.test(r1.leg) && /never added to the design-basis/.test(r1.leg), 'E key: levels and "never added to the design-basis zone"', r1.leg.replace(/\n/g, ' | ').slice(0, 200));
    /* the Kashmir replay, loaded into the page as if it had just happened */
    await page.evaluate(() => AGN.quake.load('/api/quake/replay?event=usp000e12e&geom=1')); await page.waitForTimeout(3500);
    const r2 = await page.evaluate(() => { const q = AGN.quake.flagged(); const rank = window.ALERT_MIN_CLASS_RANK;
      const al = activeAlerts().filter(a => a.agnQuake); const chip = document.getElementById('agnCheckChip');
      return { outlined: AGN.quake.data().flagged.length, paths: document.querySelectorAll('.leaflet-agnQuake-pane path').length, q: q.length, rank, qOk: q.every(f => f.levelIndex >= rank),
               al: al.length, chip: chip && !chip.hidden ? +chip.getAttribute('data-count') : null, note: hzSeismic('Muzaffarabad').note }; });
    ok(r2.outlined === 234 && r2.paths >= 2 * 234, 'E replay: 234 tehsils outlined in the level colour', r2.outlined + ' tehsils, ' + r2.paths + ' paths');
    ok(r2.q > 0 && r2.qOk && r2.al === r2.q, 'E replay: every High/Severe tehsil is in the Alerts list', r2.al + ' rows, ' + r2.q + ' flagged at rank >= ' + r2.rank);
    ok(r2.chip != null && r2.chip >= r2.q, 'E replay: the "Check these" chip counts them', 'chip ' + r2.chip);
    ok(/M7\.6 earthquake on .*PKT: Severe here/.test(r2.note) && /never added/.test(r2.note), 'E the seismic panel note uses the overlay', r2.note.slice(0, 200));
    await page.locator('#alertBtn > button').click(); await page.waitForTimeout(400);
    const rowTxt = await page.evaluate(() => [...document.querySelectorAll('#alertList .alertrow')].map(r => r.innerText.replace(/\n+/g, ' | ')).find(t => /Earthquake M7\.6/.test(t)) || '');
    ok(/Earthquake M7\.6 · (High|Severe)/.test(rowTxt), 'E the alert row reads "Earthquake M7.6 · <level>"', rowTxt);
    await page.locator('#alertList .alertrow', { has: page.locator('p', { hasText: /^Muzaffarabad · / }) }).first().click(); await page.waitForTimeout(2500);
    await page.waitForFunction(() => !!document.querySelector('.leaflet-popup .agn-quake-pop'), null, { timeout: 10000 }).catch(() => {});   /* (93) the popup opens after the fly-to ends */
    const r3 = await page.evaluate(() => { const p = document.querySelector('.leaflet-popup .agn-quake-pop'); const c = map.getCenter(); return { z: map.getZoom(), lat: c.lat, lon: c.lng, pop: p ? p.innerText : '' }; });
    ok(r3.z >= 8 && Math.abs(r3.lat - 34.35) < 0.5 && Math.abs(r3.lon - 73.5) < 0.6, 'E a click on the alert row zooms to the tehsil', JSON.stringify({ z: r3.z, lat: r3.lat.toFixed(2), lon: r3.lon.toFixed(2) }));
    ok(/Muzaffarabad/.test(r3.pop) && /Severe/.test(r3.pop) && /km from the epicentre|inside this tehsil/.test(r3.pop) && /PKT/.test(r3.pop), 'E tehsil popup: level, shaking words, distance, PKT time', r3.pop.replace(/\n/g, ' | ').slice(0, 220));
    /* the epicentre popup, by a real click on the marker */
    /* the map fully in view and focused first: a mousedown that focuses a half-visible map scrolls the page between down and up */
    await page.evaluate(() => { document.querySelector('#map').scrollIntoView({ block: 'start' }); try { map.getContainer().focus({ preventScroll: true }); } catch (_) {}
      map.closePopup(); map.__agnRecentred = Date.now(); map.setView([34.2, 73.0], 8, { animate: false }); }); await page.waitForTimeout(3000);   /* __agnRecentred: the map is not re-fitted to Pakistan under the reader */
    await page.evaluate(() => { const a = document.getElementById('alertBtn'); if (a) a.classList.remove('open'); const c = document.getElementById('agnCheckList'); if (c) c.hidden = true; });
    const pt = await page.evaluate(() => { const e = AGN.quake.data().events[0]; const p = map.latLngToContainerPoint([e.lat, e.lon]); const r = map.getContainer().getBoundingClientRect(); const x = r.left + p.x, y = r.top + p.y;
      const el = document.elementFromPoint(x, y); return [x, y, 'zoom ' + map.getZoom() + ' r ' + (el && el.getAttribute('d') ? el.getAttribute('d').length : '-') + ' ' + (el ? el.tagName + '.' + (el.getAttribute('class') || '') + ' in ' + ((el.closest('.leaflet-pane') || el.parentElement || {}).className || '') : 'none')]; });
    await page.mouse.click(pt[0], pt[1]);
    let ep = ''; for (let i = 0; i < 10 && !/Magnitude/.test(ep); i++) { await page.waitForTimeout(500); ep = await page.evaluate(() => { const p = document.querySelector('.leaflet-popup .agn-quake-pop'); return p ? p.innerText : ''; }); }
    if (!ep) ep = 'no epicentre popup; element at the marker: ' + pt[2] + '; popup: ' + await page.evaluate(() => { const p = document.querySelector('.leaflet-popup'); return p ? p.innerText.slice(0, 120) : 'none'; });
    ok(/Magnitude 7\.6/.test(ep) && /depth 26 km/.test(ep) && /8 Oct 2005, \d\d:\d\d PKT/.test(ep) && /Felt in \d+ tehsils/.test(ep) && /very strong shaking/.test(ep), 'E epicentre popup: magnitude, depth, PKT time, "felt" and the shaking in plain words', ep.replace(/\n/g, ' | ').slice(0, 260));
    /* the chip list: a quake entry zooms to its tehsil */
    await page.evaluate(() => { map.closePopup(); map.fitBounds([[23.6, 60.8], [37.1, 77.9]]); }); await page.waitForTimeout(800);
    const hasChip = await page.evaluate(() => { const c = document.getElementById('agnCheckChip'); return !!(c && !c.hidden); });
    if (hasChip) { await page.locator('#agnCheckChip').click(); await page.waitForTimeout(500);
      const b = page.locator('#agnCheckList button[data-k="Azad Kashmir|Muzaffarabad|Muzaffarabad"]');
      if (await b.count()) { await b.first().click(); await page.waitForTimeout(2000); }
      const z = await page.evaluate(() => ({ z: map.getZoom(), c: map.getCenter() }));
      ok(z.z >= 8 && Math.abs(z.c.lat - 34.35) < 0.5, 'E a quake entry in "Check these" zooms to its tehsil', JSON.stringify(z)); }
    else ok(false, 'E a quake entry in "Check these" zooms to its tehsil', 'chip hidden');
    /* no supplier name anywhere on the customer screen (visible text; the Sources tab is not opened) */
    await page.locator('#alertBtn > button').click(); await page.waitForTimeout(300);
    const vis = await page.evaluate(() => {
      return ['#agnQuakeLeg', '#agnQuakeBtn', '#alertList', '#agnCheckList', '#railAlerts'].map(s => { const n = document.querySelector(s); return n ? n.innerText : ''; }).join(' \n ')
; });
    const pv = ep + ' \n ' + r3.pop;
    const m = (vis + ' \n ' + pv).match(SUPPLIER) || null;
    ok(!m, 'E no supplier name on the customer screen (toggle, key, popups, Alerts list, rail alerts, chip list)', m ? m[0] : (vis.length + pv.length) + ' chars checked');
    ok(errs.length === 0, 'E no page errors', errs.slice(0, 3).join(' | '));
    ok(csp.length === 0, 'E no CSP violations', csp.slice(0, 2).join(' | '));
    /* back to live */
    await page.evaluate(() => AGN.quake.load('/api/quake/live?geom=1'));
  } finally { await browser.close(); }
}
console.log((fails ? 'FAIL' : 'PASS') + ' quake · ' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
