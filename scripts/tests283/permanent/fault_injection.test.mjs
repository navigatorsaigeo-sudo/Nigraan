/* v91.17.283 · WS7 · PERMANENT CHECK (a) · PROVIDER FAULTS NEVER BECOME 0 % OR NORMAL.
   Rule (PLAN v283, SPEC v279): missing data -> "not assessed" with a reason, never 0 % / Normal.
   Runs its own server (permanent/lib.mjs ownServer: throw-away data copy WITHOUT the provider cache, mock provider, nothing scheduled)
   and makes the provider fail in five ways through MOCK_CTL, each on its own places (no answer cached from another mode):
     500        every provider call answers HTTP 500
     empty      every provider call answers 200 with an empty body {}
     throw      the provider is unreachable (connection refused)
     timeout    the provider never answers (the server's own time limit fires)
     nomembers  the ensemble answers with its control run only (every _memberNN series missing); everything else answers normally
     partialmembers  half the ensemble members are missing (every odd member's series all null), the rest complete
   For each place it reads the client-facing answers the start page, the console, the report and the AI use (customer view):
     /api/point (v283.19: the place bundle: forecast, facts, site screening), /api/rain/chance, /api/report/context, /api/ai/evidence
   and asserts on every answer:
     F1 no chance / probability field holds 0 (under nomembers: neither 0 nor 100, the one-member signature) while its input is missing
     F2 no hazard word "Normal" and no "0 %" text
     F3 the answer says why: an explicit not-assessed / not-available / no-data style reason, or an error status with a reason
     F4 no raw exception text (TypeError, "Cannot read properties", "is not a function", ECONN..., "fetch failed") reaches the client
     F5 an answer arrives (status > 0 within the client limit), so a failure is reported instead of hanging the page
   and on the asset-limit evaluation (POST /api/limits/evaluate, a limit every member crosses: air temperature above -40 °C):
     F6 partialmembers: a day's chance counts the members that have data (100 %), or the day is not assessed; never the share of all
        members (about 50 %: a missing member counted as "did not cross", audit C1 / S4)
     F7 a partial PKT day (partial: true, only H of 24 hours in the forecast), coordinator decision 21 Oct 2026: the chance is a lower bound.
        (a) hits on the day: "at least N % (based on H of 24 hours)", or 100 % when every member crosses (certain);
        (b) no hit and H < 18: not assessed, "only H hours ... in the forecast", never 0 %;  (c) no hit and H >= 18: the normal value
   Expected to FAIL on base v91.17.282.1 (e.g. report context errors "EC46: Cannot read properties of undefined"); WS2 / WS4 fixes make
   it pass. usage: node scripts/tests283/permanent/fault_injection.test.mjs   (no server argument needed; ~5-10 min) */
import { ownServer, req, counter, T } from './lib.mjs';

const C = counter('fault injection');
const ONLY = (process.env.FAULT_MODES || '500,empty,throw,timeout,nomembers,partialmembers').split(',').map((s) => s.trim()).filter(Boolean);
/* each mode on its own places: (name searched like the start page does, lat, lon) */
const PLACES = {
  500: [['Multan', 30.1968, 71.4782], ['Quetta', 30.1798, 66.975], ['Gilgit', 35.9208, 74.3089]],
  empty: [['Lahore', 31.5204, 74.3587], ['Sukkur', 27.7052, 68.8574], ['Skardu', 35.2971, 75.6333]],
  throw: [['Peshawar', 34.0151, 71.5249], ['Gwadar', 25.1264, 62.3225], ['Muzaffarabad', 34.37, 73.4711]],
  timeout: [['Faisalabad', 31.4504, 73.135]],
  nomembers: [['Hyderabad', 25.396, 68.3578], ['Chitral', 35.8518, 71.7864], ['Bahawalpur', 29.3956, 71.6836]],
  partialmembers: [['Sialkot', 32.4945, 74.5229], ['Larkana', 27.559, 68.2264]],
};
const CUST = { 'x-agn-view': 'customer' };
const CHANCE_KEY = /(chance|probability|prob|pct|percent|likelihood)$/i;
const RAW = /Cannot read propert|TypeError|ReferenceError|RangeError|SyntaxError|is not a function|is not defined|undefined \(reading|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed|AbortError|TimeoutError|The operation was aborted/;
const REASON = /not assessed|not available|unavailable|no data|withheld|not issued|could not|has not run|not run|not yet|missing|no forecast|no answer|failed|outage|not fetched|input required/i;

/* walk an answer: every [path, key, value] */
function* walk(o, path = '$') {
  if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) yield* walk(o[i], path + '[' + i + ']'); return; }
  if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) { yield [path + '.' + k, k, v]; yield* walk(v, path + '.' + k); } }
}
function inspect(r, mode, ensembleOnly) {
  const bad = { zero: [], normal: [], raw: [] };
  const j = r.json;
  /* v91.17.283.13 · drought is an observation (SPI-3 of the last complete month, CHIRPS), not a forecast: its level stays when the forecast
     is missing, so its "Normal" is not a forecast default. Its rows are found by their hazard key, or by the path .drought */
  const obs = []; if (j) for (const [p, k, v] of walk(j)) if (typeof v === 'string' && /^(key|hazard|layer|id)$/.test(k) && /^drought$/i.test(v)) obs.push(p.slice(0, Math.max(0, p.length - k.length - 1)));
  const observed = (p) => /\.drought(\.|$|\[)/.test(p) || obs.some((q) => q && (p === q || p.startsWith(q + '.')));
  if (j) for (const [p, k, v] of walk(j)) {
    if (typeof v === 'number' && ((CHANCE_KEY.test(k) && !/^cloud/i.test(k)) || (k === 'p' && /events|chance|outlook|rain/i.test(p)))) {   /* v283.19: cloudPct (the bundle's hourly cloud cover) is an amount, not a chance */
      if (v === 0 || (mode === 'nomembers' && v === 100)) bad.zero.push(p + '=' + v);
    }
    if (typeof v === 'string') {
      if (!ensembleOnly && !observed(p) && /^(Normal|normal)$/.test(v.trim()) && /level|word|verdict|class|status|hazard/i.test(p)) bad.normal.push(p + '="' + v + '"');
      if (/(^|[^\d.,])0 ?%/.test(v) && !/\b(0 ?%\s*-|0 ?%\s*to|0 ?–)/.test(v)) bad.normal.push(p + ': "' + v.slice(0, 120) + '"');
      if (RAW.test(v)) bad.raw.push(p + ': "' + v.slice(0, 160) + '"');
    }
  }
  if (!j && RAW.test(r.text || '')) bad.raw.push('(text) ' + (r.text || '').slice(0, 160));
  return bad;
}

const srv = await ownServer({ mode: 'ok' });
try {
  C.ok(srv.up, 'own server up (data copy without the provider cache, mock provider, nothing scheduled)', srv.up ? srv.base : srv.log().slice(-600));
  if (!srv.up) { C.done(); process.exit(); }
  /* resolve the unit of every place while the provider is healthy (the place index is local; no provider call) */
  for (const list of Object.values(PLACES)) for (const P of list) {
    const s = await req(srv.base, '/api/geo/search?q=' + encodeURIComponent(P[0]), { headers: CUST, timeoutMs: 60000 });
    const hit = s.json && (s.json.results || []).find((x) => x.unitId) ; P.unit = hit ? hit.unitId : null;
    if (!P.unit) { const rv = await req(srv.base, '/api/geo/reverse?lat=' + P[1] + '&lon=' + P[2], { headers: CUST }); P.unit = rv.json && (rv.json.unitId || (rv.json.unit && rv.json.unit.unitId)) || null; }
  }
  for (const mode of ONLY) {
    if (!PLACES[mode]) { C.note('unknown fault mode ' + mode); continue; }
    srv.setMode(mode, /members$/.test(mode) ? ['/v1/ensemble'] : undefined);
    const limit = mode === 'timeout' ? 420000 : 200000;
    for (const P of PLACES[mode]) {
      const q = 'lat=' + P[1] + '&lon=' + P[2], u = encodeURIComponent(P.unit || '');
      const EP = [
        /* v91.17.283.19: the point forecast, the place facts and the site screening are parts of the one place bundle (the thermal-state
           route is retired); the bundle is judged as the one answer every page reads */
        ['every page: the place bundle (forecast, facts, site screening, ...)', '/api/point?' + q, true],
        ['start page / console: rain chance', '/api/rain/chance?unit=' + u, true],
        ['report: context', '/api/report/context?unit=' + u, true],
        ['AI answer source', '/api/ai/evidence?prompt=' + encodeURIComponent('What weather hazards are expected in ' + P[0] + ' this week?') + '&location=' + encodeURIComponent(P[0]), false],
      ];
      const rs = await Promise.all(EP.map(([, path]) => req(srv.base, path, { headers: CUST, timeoutMs: limit })));
      EP.forEach(([what, path, ens], i) => {
        const r = rs[i], tag = '[' + mode + '] ' + P[0] + ' · ' + what;
        if (!C.ok(r.status > 0, 'F5 ' + tag + ': an answer arrives (' + (r.status ? r.status + ', ' + r.ms + ' ms' : r.error) + ')', path)) return;
        if (/members$/.test(mode) && !ens) return;   /* only the ensemble failed: deterministic answers are not judged */
        const b = inspect(r, mode, /members$/.test(mode));
        C.ok(!b.zero.length, 'F1 ' + tag + ': no ' + (mode === 'nomembers' ? '0 % / 100 % one-member' : '0 %') + ' chance from missing input', b.zero.slice(0, 8).join(' | '));
        if (!/members$/.test(mode)) C.ok(!b.normal.length, 'F2 ' + tag + ': no "Normal" and no "0 %" while the forecast is missing', b.normal.slice(0, 8).join(' | '));
        C.ok(!b.raw.length, 'F4 ' + tag + ': no raw exception text in the client answer', b.raw.slice(0, 6).join(' | '));
        const J = r.json || {}; const stated = typeof (J.why || J.reason || J.message || J.error) === 'string';
        const why = r.status >= 400 ? stated : (REASON.test(r.text || '') || ((J.ok === false || J.ready === false) && stated));
        if (!/members$/.test(mode)) C.ok(why, 'F3 ' + tag + ': says why (not assessed / not available with a reason)', r.status + ' ' + (r.text || '').slice(0, 300));
      });
      if (mode === 'partialmembers') {
        const ev = await req(srv.base, '/api/limits/evaluate', { method: 'POST', headers: CUST, timeoutMs: limit,
          body: { assets: [{ id: 'ws7-' + P[0], name: P[0] + ' test asset', lat: P[1], lon: P[2], limits: [{ variable: 'temperature_2m', limit: -40, dir: 'above', durationMin: 60 }, { variable: 'temperature_2m', limit: 80, dir: 'above', durationMin: 60 }] }] } });
        const L = ev.json && ev.json.assets && ev.json.assets[0] && (ev.json.assets[0].limits || [])[0];
        if (!C.ok(L && Array.isArray(L.days) && L.days.length, '[partialmembers] ' + P[0] + ' · asset limits: evaluated (' + ev.status + ')', ev.text.slice(0, 300))) continue;
        const full = L.days.filter((d) => !d.partial), wrong = full.filter((d) => d.chance != null && d.chance !== 100);
        C.ok(!wrong.length, 'F6 [partialmembers] ' + P[0] + ' · asset limits: every member with data crosses -> 100 % or not assessed, never the share of all members',
          wrong.slice(0, 5).map((d) => d.date + ' ' + d.chance + ' % (' + d.members + ' of ' + d.of + ')').join(' | '));
        const part = L.days.filter((d) => d.partial);
        C.ok(part.length && part.every((d) => d.chance === 100 && /^100 %/.test(d.chanceText || '') && d.hoursOnRecord < 24), 'F7a [partialmembers] ' + P[0] + ' · asset limits: a partial PKT day where every member crosses reads 100 % (certain), with the hours on record',
          part.map((d) => d.date + ' chance ' + d.chance + ' ' + (d.chanceText || '') + ' H ' + d.hoursOnRecord).join(' | '));
        const L2 = (ev.json.assets[0].limits || [])[1]; const part2 = ((L2 && L2.days) || []).filter((d) => d.partial);
        const bad2 = part2.filter((d) => d.hoursOnRecord < 18 ? !(d.chance == null && d.state === 'not-assessed' && /only \d+ hours of (today remain|this day are) in the forecast/.test(d.why || '')) : !(typeof d.chance === 'number' && !d.chanceIsLowerBound));
        C.ok(part2.length && !bad2.length, 'F7b/c [partialmembers] ' + P[0] + ' · asset limits: a partial day with no crossing is not assessed under 18 of 24 hours ("only H hours ..."), never 0 %; from 18 hours it reads its normal value',
          part2.map((d) => d.date + ' H ' + d.hoursOnRecord + ' chance ' + d.chance + ' ' + (d.why || '')).join(' | '));
      }
    }
  }
} finally { await srv.stop(); }
C.done();
