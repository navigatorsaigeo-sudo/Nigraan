import * as __T from '../lib/testenv.mjs';
/* v91.17.283.11 · ONE CALCULATION POINT · page test: with /api/pointstate, /batch and /near STUBBED (v283.19: /api/point and /api/point/batch) (the browser's requests are answered
   by this test; every point gets a known state, Muzaffarabad "now" = 13.3 C at 00:00 PKT), the analyst console's Overview shows the SAME
   "now" value, printed by the same rule, in: the top bar, the left panel's now box, the current-conditions card, the "Next 24 hours"
   strip (NOW cell), "Temperature now nearby" (This spot), the map chip of the city pin, the city popup, the point record the exact-point
   popup and the office pins read (/api/point/forecast), and AGN.nowAt. Also: the strip's later hours are the state's hours; the left
   panel's Temp max / min / Wind max are the state's day 0; the heat tile and the popup name the UTCI level (no "Below caution", no
   heat index); the popup says "Model forecast" and the confidence in words; no request reaches /api/hyperlocal/area; no page error.
   v91.17.283.12: the point record is AGN.pointState.pf (no /api/point/forecast); the heat tile carries data-agn-ps.
   usage: node scripts/tests28311ps/overview_same_now.test.mjs [http://127.0.0.1:8787]   (a server with this release; the provider can be the mock) */
const BASE = __T.BASE;
const PW = __T.playwrightSync(); if (PW.__missing) __T.skip(PW.__missing);
const exe = __T.chromiumPath();
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 500) : '')); } };
const key = (lat, lon) => (Math.round(+lat * 100) / 100).toFixed(2) + ',' + (Math.round(+lon * 100) / 100).toFixed(2);
const MUZ = key(34.37, 73.4711), NOW_MUZ = 13.3;
/* a deterministic state for any point: now = 13.3 at Muzaffarabad, elsewhere a value from the key */
function nowOf(k) { if (k === MUZ) return NOW_MUZ; const [a, b] = k.split(',').map(Number); return Math.round((8 + ((a * 7.3 + b * 3.1) % 14)) * 10) / 10; }
const pkt = (ms) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 16);
function stateOf(k) {
  const [lat, lon] = k.split(',').map(Number), n = nowOf(k);
  const nowMs = Math.floor(Date.now() / 3600e3) * 3600e3, day0 = Date.parse(pkt(Date.now()).slice(0, 10) + 'T00:00:00Z') - 5 * 3600e3;
  const hours = [], days = [];
  for (let d = 0; d < 4; d++) { const hs = [];
    for (let h = 0; h < 24; h++) { const ms = day0 + (d * 24 + h) * 3600e3; const t = ms === nowMs ? n : Math.round((n + 6 * Math.sin((h - 9) / 24 * 2 * Math.PI) - 6 * Math.sin(((new Date(nowMs + 5 * 3600e3).getUTCHours()) - 9) / 24 * 2 * Math.PI) + d * 0.3) * 10) / 10;
      const u = Math.round((t + 2) * 10) / 10; hs.push({ time: pkt(ms), tempC: t, rawC: t - 0.4, dewC: 4.0, rh: 50, windKmh: 9 + d, gustKmh: 20, rainMm: 0, cloudPct: 20, feelsC: Math.round((t - 1) * 10) / 10, utciShadeC: u, utciClass: u >= 32 ? 'strong heat stress' : u >= 26 ? 'moderate heat stress' : 'no thermal stress', heatLevel: u >= 32 ? 'Moderate' : null, coldLevel: null }); }
    const mx = hs.reduce((a, b) => (b.tempC > a.tempC ? b : a)), mn = hs.reduce((a, b) => (b.tempC < a.tempC ? b : a)), um = hs.reduce((a, b) => (b.utciShadeC > a.utciShadeC ? b : a));
    days.push({ date: hs[0].time.slice(0, 10), lead: d, tmaxC: mx.tempC, tminC: mn.tempC, tmaxAt: mx.time.slice(11), tminAt: mn.time.slice(11), rainMm: 0, windMaxKmh: 9 + d, gustMaxKmh: 20, rhMean: 50,
      heat: { utciMaxC: um.utciShadeC, at: um.time.slice(11), cls: um.utciClass, level: um.utciShadeC >= 32 ? 'Moderate' : 'None' }, cold: { utciMinC: 0, at: '06:00', cls: 'slight cold stress', level: 'None' },
      confidence: { tmax: { words: 'Good', maeC: 1.21, text: 'Good · typical error ±1.2 °C' }, tmin: { words: 'Good', maeC: 1.32, text: 'Good · typical error ±1.3 °C' } } });
    hours.push(...hs); }
  const nh = hours.find((h) => h.time === pkt(nowMs));
  return { ok: true, version: 'stub', key: k, run: 'stub', issuedAt: '2026-10-24T00:00:00Z', point: { lat, lon, elevM: 700, heightBasis: '30 m terrain', zone: 'plains' },
    area: { kind: 'area', tehsil: 'Stub tehsil', district: 'Stub', province: 'Stub' },
    source: { kind: 'Model forecast', label: 'served forecast chain: forecast for the plains zone at 700 m + national temperature model', chain: ['forecast for the plains zone at 700 m', 'national temperature model'], mach: { applied: false, why: 'no live MACH station within 40 km', stations: 0, nearest: null }, national: { applied: true, zone: 'plains', variant: 'pool' } },
    confidence: { now: { words: 'Good', maeC: 1.5, text: 'Good · typical error ±1.5 °C', status: 'validated' }, today: days[0].confidence },
    now: { ...nh, heatLevel: nh.heatLevel || 'None', coldLevel: 'None' }, heat: { now: { utciC: nh.utciShadeC, cls: nh.utciClass, level: 'None' }, today: days[0].heat }, hours, days };
}
const asked = { ps: 0, batch: 0, near: 0, area: 0 };
const br = await __T.launch(PW.chromium, { executablePath: exe, args: ['--no-sandbox'] });
const ctx = await br.newContext({ viewport: { width: 1366, height: 900 } }); const pg = await ctx.newPage(); const errs = [];
pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
pg.on('request', (r) => { if (/\/api\/hyperlocal\/area/.test(r.url())) asked.area++; });
const J = (o) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
/* v91.17.283.19: the page asks one place bundle (GET /api/point: the state plus its parts, the nearby list among them) and the city labels
   as one batch (GET /api/point/batch); both are stubbed */
const nearOf = (la, lo) => { const places = [[0.03, 0.01, 'Stub East'], [-0.02, 0.02, 'Stub South'], [0.01, -0.04, 'Stub West']].map(([a, b, nm]) => { const k = key(la + a, lo + b), s = stateOf(k);
    return { name: nm, lat: la + a, lon: lo + b, kind: 'settlement', district: 'Stub', km: 3.1, elevM: 700, tempC: s.now.tempC, time: s.now.time, live: false, liveC: 0, liveStations: 0, national: false }; });
  return { lat: la, lon: lo, radiusKm: 12, places: places.sort((a, b) => b.tempC - a.tempC), liveLayer: 0 }; };
await pg.route(/\/api\/point(\/batch)?\?/, async (route) => { const u = new URL(route.request().url());
  if (u.pathname === '/api/point') { asked.ps++; const k = u.searchParams.get('lat') ? key(u.searchParams.get('lat'), u.searchParams.get('lon')) : MUZ, [la, lo] = k.split(',').map(Number), st = stateOf(k); asked.near++;
    return route.fulfill(J({ ...st, stamp: 'stub#-', place: { id: u.searchParams.get('id') || null, name: k === MUZ ? 'Muzaffarabad' : 'Stub place', lat: la, lon: lo, tehsil: 'Stub tehsil', district: 'Stub', province: 'Stub', unitId: 'Stub|Stub|Stub tehsil' },
      station: { ok: false, kind: 'station', why: 'no AGN station reading within 25 km (stub)' }, parts: { near: { ok: true, at: new Date().toISOString(), v: nearOf(la, lo) } } })); }
  asked.batch++; const st = String(u.searchParams.get('pts')).split(';').map((p) => ({ ...stateOf(key(...p.split(','))), light: true, stamp: 'stub#-' })); return route.fulfill(J({ ok: true, n: st.length, states: st })); });
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForTimeout(25000);
await pg.evaluate(() => { selectCity('muz', true); });
await pg.waitForFunction(() => document.querySelector('#hscroll .nowtag'), null, { timeout: 60000 }).catch(() => {});   /* v91.17.283.12: the strip is drawn when the place's record is in */
await pg.waitForTimeout(15000);
const R = await pg.evaluate(async () => { const q = (s) => document.querySelector(s), t = (e) => (e ? e.textContent.trim() : null), num = (x) => { const m = /-?\d+(\.\d+)?/.exec(String(x || '')); return m ? +m[0] : null; };
  const s0 = STATIONS.filter((x) => x.id === 'muz')[0], s = effStation(s0);
  const pop = document.createElement('div'); pop.innerHTML = popHtml(s);
  const pf = await AGN.pointState.pf(34.37, 73.4711);   /* v91.17.283.12: the point record in its old shape, read from the point state (the page no longer asks /api/point/forecast) */
  const na = await AGN.nowAt.get(34.37, 73.4711);
  const pin = (() => { const m = markers.muz && markers.muz.getElement && markers.muz.getElement(); return m ? t(m.querySelector('.pt')) : null; })();
  const side = q('.agn-hl88-side'), spot = side ? [...side.querySelectorAll('.rows button')].map((b) => [t(b.querySelector('.n')), t(b.querySelector('.t'))]).find((r) => /This spot/.test(r[0])) : null;
  const strip = [...document.querySelectorAll('#hscroll .hcell')].filter((c) => !c.classList.contains('agn-early198'));
  const tile = (re) => { const c = [...document.querySelectorAll('#mpLeftIn .mp-c')].find((c) => re.test(t(c.querySelector('.k')) || '')); return c ? num(t(c.querySelector('.v'))) : null; };
  return { top: num(t(q('#agnLive84 .t'))), left: num(t(q('#agnLvNow .t'))), cc: num(t(q('#ccTemp'))), strip: num(t(strip[0] && strip[0].querySelector('.t'))), stripNowTag: !!(strip[0] && strip[0].querySelector('.nowtag')),
    strip2: strip.slice(1, 4).map((c) => [t(c.querySelector('.hr')), num(t(c.querySelector('.t')))]), spot: spot ? num(spot[1]) : null, pin: num(pin), pinTxt: pin,
    popT: num(t(pop.querySelector('.tt'))), popTxt: pop.textContent.replace(/\s+/g, ' '), pfNow: pf && pf.now ? pf.now.tempC : null, nowAt: na ? na.tempC : null,
    tmax: tile(/^Temp max/i), tmin: tile(/^Temp min/i), wmax: tile(/^Wind max/i), hsTile: t(q('#mpLeftIn .mp-hs')), hsPs: !!(q('#mpLeftIn .mp-hs') && q('#mpLeftIn .mp-hs').getAttribute('data-agn-ps')), fmt: AGN.pointState.fmt(13.3) }; });
const vals = { 'top bar': R.top, 'left now box': R.left, 'current-conditions card': R.cc, 'strip NOW cell': R.strip, 'nearby This spot': R.spot, 'map chip': R.pin, 'city popup': R.popT, 'point record (AGN.pointState.pf)': R.pfNow, 'AGN.nowAt': R.nowAt };
for (const [k, v] of Object.entries(vals)) ok(v === NOW_MUZ, 'N ' + k + ' shows ' + v + ' (the state: ' + NOW_MUZ + ')');
ok(R.fmt === '13.3' && R.stripNowTag && /^13\.3°C air now$/.test(R.pinTxt || ''), 'N one print rule: fmt(13.3) = "13.3", the chip reads "' + R.pinTxt + '"');
const S = stateOf(MUZ), next = R.strip2.map(([h, v]) => { const hh = S.hours.find((x) => x.time.slice(0, 10) === S.now.time.slice(0, 10) && x.time.slice(11, 13) === String(h).slice(0, 2)) || S.hours.find((x) => x.time.slice(11, 13) === String(h).slice(0, 2) && x.time > S.now.time); return [h, v, hh ? Math.round(hh.tempC) : null]; });
ok(next.length === 3 && next.every(([h, v, w]) => v === w), 'H the strip’s next hours are the state’s hours (' + JSON.stringify(next) + ')');
ok(R.tmax === S.days[0].tmaxC && R.tmin === S.days[0].tminC && R.wmax === S.days[0].windMaxKmh, 'D left panel Temp max / min / Wind max = the state’s day 0 (' + [R.tmax, R.tmin, R.wmax].join(' / ') + ')');
ok(/^Heat stress\s*Normal\s*UTCI/.test(R.hsTile || '') && R.hsPs,   /* v91.17.283.12: the tile is written at its source from the point state (data-agn-ps) */ 'U the heat tile is the state’s UTCI level ("' + R.hsTile + '")');
ok(/Heat stress\s*Normal/.test(R.popTxt) && !/Below caution|Heat risk|heat index/i.test(R.popTxt), 'U the city popup names the UTCI heat level, no Heat Index wording ("' + R.popTxt.slice(0, 260) + '")');
ok(/Model forecast/.test(R.popTxt) && !/· MACH\b/.test(R.popTxt) && /Good confidence/.test(R.popTxt) && !/High confidence/.test(R.popTxt), 'S the popup says "Model forecast" and the measured confidence in words');
ok(asked.ps + asked.batch > 0 && asked.near > 0 && asked.area === 0, 'R the page read the place bundle (' + asked.ps + ' /api/point with its nearby part, ' + asked.batch + ' batch) and never /api/hyperlocal/area (' + asked.area + ')');
ok(!errs.length, 'E no page error', errs.join(' | '));
await br.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
