/* v91.17.283.52 E · unit tests: QC, the measured line, nearest-of-two-sources, the shared shown decision, the embassy feed parsers and the
   daily-mean archive.   usage: node scripts/tests28352E/aqnow52E.unit.mjs <tree> */
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { resolve } from 'node:path'; import { pathToFileURL } from 'node:url';
const T = resolve(process.argv[2] || process.cwd()); const S = (f) => import(pathToFileURL(join(T, 'server', 'api', f)).href);
const { readingFault, judgeSeries, airNowLabel, createAqNow, STUCK_RUN, pm25Text } = await S('aqnow.mjs');
const { aqiOf, nowcastPm } = await S('smog.mjs');
const { parseAirNow, parseDosRss, createDosAq, DOS_SITES } = await S('dosaq.mjs');
const { shownOf, shownShared } = await S('shownplace.mjs');
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i !== undefined ? ' :: ' + JSON.stringify(i).slice(0, 400) : '')); } };
const NOW = Date.parse('2026-11-03T18:40:00Z');
const H = (k) => new Date(Date.parse('2026-11-03T18:00:00Z') - k * 3600e3).toISOString().slice(0, 13) + ':00:00Z';
const ser = (vals, f = (v) => ({ pm25: v })) => vals.map((v, i) => [H(vals.length - 1 - i), v == null ? null : f(v)]);
const serD = (vals) => vals.map((v, i) => [H(vals.length - i), v == null ? null : { pm25: v }]);   /* embassy: hour-beginning, the 17:00Z hour ends 18:00Z */

/* QC of one reading */
ok(readingFault({ pm25: 71.35, pm10: 234 }) === null, 'a plausible reading passes');
ok(readingFault({ pm25: -999 }) === 'missing' && readingFault({ pm25: null }) === 'missing' && readingFault(null) === 'missing', '-999 / null = missing');
ok(readingFault({ pm25: 0 }) === 'zero or negative' && readingFault({ pm25: -3 }) === 'zero or negative', 'zero and negative rejected');
ok(readingFault({ pm25: 1600 }) === 'out of range' && readingFault({ pm25: 90, pm10: 60 }) === 'out of range' && readingFault({ pm25: 50, pm25bad: true }) === 'out of range', 'out of range (> 1,500, PM2.5 > 1.1 x PM10, epdaq flag)');
ok(readingFault({ pm25: 50, flags: { pm10: 'M', no2: 'D' } }) === null, 'a flag on another pollutant does not stop PM2.5');
ok(/flagged/.test(readingFault({ pm25: 50, flags: { pm25: 'C' } }) || ''), 'a PM2.5 flag stops the reading');

/* the series: age, stuck, NowCast */
const good = ser([60, 62, 65, 66, 70, 71, 72, 69, 70, 71.43, 71.35]);
const j = judgeSeries(good, 'epd', NOW, false);
ok(j.ok && j.aqi === aqiOf(nowcastPm(good.map(([, r]) => r.pm25).slice(-12)), null).aqi && j.category === aqiOf(nowcastPm(good.map(([, r]) => r.pm25)), null).category, 'AQI = smog.mjs aqiOf of the EPA NowCast (the forecast function)', j);
ok(judgeSeries(good, 'epd', NOW + 49 * 60e3, false).ok && !judgeSeries(good, 'epd', NOW + 51 * 60e3, false).ok, 'younger than 90 min only (89 min ok, 91 min refused)');
ok(judgeSeries(good, 'epd', NOW, false, 80).ok && !judgeSeries(good, 'epd', NOW + 41 * 60e3, false, 80).ok, 'the decision limit (80 min) is applied when asked');
ok(/stuck/.test(judgeSeries(ser([60, 61, 70.1, 70.1, 70.1]), 'epd', NOW).why || ''), 'Punjab: 3 equal hours = stuck (STUCK_RUN.epd ' + STUCK_RUN.epd + ')');
ok(judgeSeries(ser([60, 61, 62, 70.1, 70.1]), 'epd', NOW).ok, 'Punjab: 2 equal hours pass');
ok(judgeSeries(serD([60, 61, 70, 70, 70]), 'dos', NOW, true).ok, 'embassy: 3 equal hours are not stuck');
ok(/stuck/.test(judgeSeries(serD([60, 70, 70, 70, 70]), 'dos', NOW, true).why || ''), 'embassy: 4 equal hours = stuck (STUCK_RUN.dos ' + STUCK_RUN.dos + ')');
ok(/zero/.test(judgeSeries(ser([0, 0, 0, 0]), 'epd', NOW).why || ''), 'a zero reading is refused');
ok(/NowCast/.test(judgeSeries(ser([60, null, null, 70]), 'epd', NOW).why || ''), 'no NowCast with 1 of the 3 latest hours -> no line');
ok(judgeSeries(serD([60, 61, 62, 63]), 'dos', NOW, true).ageMin === 40 && /future/.test(judgeSeries(ser([60, 61, 62, 63]), 'dos', NOW, true).why), 'embassy hours are hour-beginning (the 17:00Z hour ends 18:00Z; an hour not yet over is refused)');

/* the line */
const L = airNowLabel('Lahore Cantt', { aqi: 160, category: 'Unhealthy', pm25: 71.35 });
ok(L === 'Air quality measured now near Lahore Cantt: AQI 160 · Unhealthy (PM2.5 71.3 µg/m³, hourly)', 'the sentence (PM2.5 truncated to 0.1, as EPA)', L);

/* nearest of the two sources, the distance rule, stale / stuck stations skipped */
const epd = { stations: { near: { name: 'Town Hall', lat: 31.5400, lon: 74.3500 }, stale: { name: 'Old', lat: 31.5205, lon: 74.3587 }, stuck: { name: 'Stuck', lat: 31.5210, lon: 74.3590 }, far: { name: 'Far', lat: 32.2, lon: 74.9 } },
  obs: { near: Object.fromEntries(good), stale: Object.fromEntries(ser([80, 81, 82]).map(([t, r]) => [new Date(Date.parse(t) - 5 * 3600e3).toISOString().slice(0, 13) + ':00:00Z', r])), stuck: Object.fromEntries(ser([40, 41, 55.5, 55.5, 55.5])), far: Object.fromEntries(good) } };
const dos = { stations: { L: { name: 'Lahore', city: 'Lahore', lat: 31.560078, lon: 74.33589 } }, obs: { L: Object.fromEntries(serD([90, 92, 95, 99])) } };
const app = { epd: { recent: () => epd }, dos: { recent: () => dos }, fleet: { screenRule: () => ({ dz_m: 150 }) } };
const AQ = createAqNow(app, '/nonexistent');
const at = AQ.near(31.5204, 74.3587, 215, NOW);   /* Lahore point: stale and stuck stations at 0.1 km, Town Hall 2.4 km, the embassy monitor 4.9 km */
ok(at.ok && at.detail.monitor === 'Punjab EPD station Town Hall', 'nearest VALID monitor wins (stale and stuck nearer ones skipped)', at);
ok(at.held.some((h) => /older than/.test(h.why)) && at.held.some((h) => /stuck/.test(h.why)), 'the held monitors carry their reasons (operator)', at.held);
const isl = AQ.near(33.7, 73.1, 540, NOW); ok(!isl.ok && /no air-quality monitor within 25 km/.test(isl.why), 'no monitor within 25 km -> no line', isl);
const dosOnly = createAqNow({ epd: { recent: () => ({ stations: {}, obs: {} }) }, dos: { recent: () => dos } }, '/nonexistent').near(31.55, 74.34, null, NOW);
ok(dosOnly.ok && dosOnly.detail.monitor === 'US Dept of State monitor, Lahore' && dosOnly.src === 'dos', 'an embassy monitor is used like a Punjab station (operator name "US Dept of State monitor, Lahore")', dosOnly);
const both = createAqNow({ epd: { recent: () => epd }, dos: { recent: () => dos } }, '/nonexistent').near(31.5601, 74.3358, null, NOW);
ok(both.ok && both.src === 'dos', 'both qualify: the nearer one (the embassy monitor at 0 km) is used', both.detail);

/* the shown decision: one sentence, no monitor / agency / distance / age; none without a reading; both views the same */
const B = { ok: true, key: 'k52E', issuedAt: 'i1', place: { name: 'Lahore Cantt' }, now: { time: '2026-11-03T23:00', tempC: 21 }, days: [{ lead: 0, tmaxC: 26, tminC: 14 }], hours: [], station: { ok: false } };
const sh = shownOf(B, { nowMs: NOW, air: at });
ok(sh.airNow.kind === 'measured' && sh.airNow.label === airNowLabel('Lahore Cantt', at), 'shown.airNow carries the sentence', sh.airNow);
ok(!/EPD|Punjab|Department|State|Embassy|consulate|Town Hall|\bkm\b|min ago|minutes/i.test(JSON.stringify(sh.airNow)), 'no monitor, agency, distance or age in the shown block');
ok(shownOf(B, { nowMs: NOW, air: { ok: false, why: 'x' } }).airNow.label === null && shownOf(B, { nowMs: NOW }).airNow.kind === 'none', 'no qualifying reading -> no measured line');
const c1 = shownShared(B, { nowMs: NOW, air: at }), c2 = shownShared(B, { nowMs: NOW + 60e3, air: null });
ok(JSON.stringify(c1.airNow) === JSON.stringify(c2.airNow), 'customer and operator bundles of one point state print the same sentence');
const c3 = shownShared(B, { nowMs: Date.parse(at.observedAt) + 91 * 60e3, air: null }); ok(c3.airNow.label === null, 'a shared reading is dropped once 90 minutes old');

/* the embassy feed */
const an = parseAirNow([{ Latitude: 33.725614, Longitude: 73.11602, UTC: '2026-11-03T17:00', Parameter: 'PM2.5', Unit: 'UG/M3', Value: 63.4, RawConcentration: 56.0, AQI: 155, SiteName: 'Islamabad', AgencyName: 'U.S. Department of State Pakistan - Islamabad', FullAQSCode: '586PK1010001', IntlAQSCode: '586PK1010001' },
  { Latitude: 28.63576, Longitude: 77.22445, UTC: '2026-11-03T17:00', Parameter: 'PM2.5', Value: 134.5, RawConcentration: 143.0, AgencyName: 'U.S. Department of State India - New Delhi', IntlAQSCode: '356DS1010001' },
  { Latitude: 31.560078, Longitude: 74.33589, UTC: '2026-11-03T17:00', Parameter: 'PM2.5', Value: -999, RawConcentration: -999, AgencyName: 'U.S. Department of State Pakistan - Lahore', IntlAQSCode: '586PK3010003' }]);
ok(an.length === 2 && an[0].id === '586PK1010001' && an[0].pm25 === 56 && an[0].t === '2026-11-03T17:00:00Z' && an[1].pm25 === null, 'AirNow rows: Pakistan monitors only, RawConcentration hourly, -999 = missing', an);
const rss = '<rss><channel><item><title>Lahore</title><Param>PM2.5</Param><ReadingDateTime>11/03/2026 10:00:00 PM</ReadingDateTime><Conc>95.0</Conc><AQI>171</AQI><Desc>Unhealthy</Desc></item>'
  + '<item><description>11-03-2026 21:00; PM2.5; 92.0; 170; Unhealthy</description></item><item><Param>PM2.5</Param><ReadingDateTime>11/03/2026 12:00:00 AM</ReadingDateTime><Conc>-999</Conc></item></channel></rss>';
const rr = parseDosRss(rss, DOS_SITES[1]);
ok(rr.length === 3 && rr[0].t === '2026-11-03T17:00:00Z' && rr[0].pm25 === 95 && rr[1].t === '2026-11-03T16:00:00Z' && rr[1].pm25 === 92 && rr[2].t === '2026-11-02T19:00:00Z' && rr[2].pm25 === null, 'DoS RSS: local time -> UTC, tags or the description line, -999 = missing', rr);

/* poll (mocked fetch, no key -> the public feed), 48 h kept, the key never in a message, daily means archived */
const tmp = mkdtempSync('/dev/shm/e52u-'); const dd = join(tmp, 'nig', 'nigraan-local', 'data');
process.env.NIGRAAN_AIRNOW_KEY = 'SECRET-KEY-123'; let urls = [];
const fakeFetch = async (u) => { urls.push(String(u)); if (/airnowapi/.test(u)) throw new Error('getaddrinfo ENOTFOUND www.airnowapi.org ' + u); const city = /RSS\/(\w+)\//.exec(u)[1];
  let items = ''; for (let k = 0; k < 40; k++) { const ms = Date.parse('2026-11-03T18:00:00Z') - k * 3600e3 + 5 * 3600e3, d = new Date(ms); const hh = d.getUTCHours();
    items += '<item><Param>PM2.5</Param><ReadingDateTime>' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '/' + d.getUTCFullYear() + ' ' + ((hh % 12) || 12) + ':00:00 ' + (hh < 12 ? 'AM' : 'PM') + '</ReadingDateTime><Conc>' + (50 + k % 7) + '</Conc><AQI>140</AQI></item>'; }
  return { ok: true, status: 200, text: async () => '<rss>' + items + '</rss>', json: async () => [] }; };
const D = createDosAq({}, dd, { fetch: fakeFetch }); const st = await D.poll(NOW);
ok(st.lastOk && st.via['dos-rss'] > 0 && !JSON.stringify(st).includes('SECRET') && /AirNow/.test(st.lastError || ''), 'poll: the public feed answers when AirNow fails; the key never appears in the status', st);
const rec = JSON.parse(readFileSync(join(dd, 'cache', 'dos-recent.json'), 'utf8')); const n48 = Object.keys(rec.obs['586PK3010003']).length;
ok(n48 <= 49 && n48 >= 38, '48 h kept (' + n48 + ' hours of 40 offered, older dropped)');
const dl = join(tmp, 'nig', 'station-lake', 'archive', 'aq', 'dos_daily_2026-11.jsonl'); const days = existsSync(dl) ? readFileSync(dl, 'utf8').trim().split('\n').map((x) => JSON.parse(x)) : [];
ok(days.length === 4 && days.every((x) => x.date === '2026-11-02' && x.kind === 'dos_daily' && x.hours === 16 && x.complete === false && x.pm25Mean > 49), 'daily mean of the finished Pakistan day (2 Nov, 16 of 24 h held -> complete false) archived once per monitor in station-lake/archive/aq', days.slice(0, 1));
await D.poll(NOW + 10 * 60e3); const days2 = readFileSync(dl, 'utf8').trim().split('\n'); ok(days2.length === 4, 'a day is written once');
delete process.env.NIGRAAN_AIRNOW_KEY; rmSync(tmp, { recursive: true, force: true });
console.log('aqnow52E: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
