import * as __T from '../lib/testenv.mjs';
/* v91.17.283.19 · ONE SERVER CALL DRIVES THE PAGE (owner, 25 Oct 2026: F-10 Islamabad made 14 requests on the start page and 154 on the
   analyst page in 18 s, named the place three ways and showed a second temperature). Against a running server (argv[2]):
     B1-B6  server: GET /api/point is one bundle per place and run (place, now/hours/days, ONE station, parts each with ok and at; a failing
            part is ok:false with a reason; the same place again is the cached bundle); the point is computed where asked (no 0.01 deg
            cell); /api/point/batch returns light records for many points in one request and refuses more than 600; retired routes 404
     P1-P3  place table: "Lahore" lists one Lahore and one Lahore Cantt; Sialkot International Airport is confirmed; a cantonment or a
            tehsil-named record is never a 'village'
     S1-S3  start page: selecting a place makes exactly ONE place request (/api/point), every other request of the page is a national one
            asked at most once per page load, and no /px/v1/forecast; the card shows dew point, gusts, pressure, cloud, UV and rain chance and
            the nearest station on its own line
     A1-A6  analyst after the hand-off: 0 place requests when the run matches (1 when the hand-off is of another run); switching every
            main tab makes 0 data requests; no /px/v1/forecast; one place label (header, bar, left card); the same "now" on the start card,
            the bar, the left card and the Forecast tab's first hour; CLS < 0.1 at 1366x768 and 1920x1080
   Prints the request counts of each window.
   usage: node scripts/tests28319/onecall.test.mjs [http://127.0.0.1:8787] [place query, default F-10] */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
const BASE = __T.BASE, ROOT = __T.ROOT, Q = process.argv[3] || 'F-10';
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 900) : '')); } };
const J = async (u) => { const r = await fetch(BASE + u, { headers: { 'x-agn-view': 'customer' } }); return { status: r.status, j: await r.json().catch(() => null) }; };
const COUNTS = [];

/* ---- B · the bundle ---- */
const s0 = (await J('/api/geo/search?q=' + encodeURIComponent(Q) + '&limit=5')).j; const top = s0 && s0.results && s0.results[0];
ok(!!(top && top.id), 'B0 the place table answers "' + Q + '" (' + (top ? top.name + ', ' + top.id : '-') + ')');
const b1 = (await J('/api/point?id=' + encodeURIComponent(top.id))).j;
const parts = b1 && b1.parts ? Object.entries(b1.parts) : [];
ok(b1 && b1.ok && b1.place && b1.place.name === top.name && b1.now && Array.isArray(b1.hours) && Array.isArray(b1.days) && b1.station && b1.station.kind === 'station' && b1.stamp,
  'B1 one bundle: the record\'s name, now, hours, days, ONE station (labelled station), stamp (' + (b1 && [b1.place && b1.place.name, b1.now && b1.now.tempC, b1.stamp].join(' | ')) + ')');
const NEED = ['levels', 'rainChance', 'outlook', 'seasonal', 'smog', 'siteScreening', 'siteRisk', 'river', 'glof', 'climatology', 'past30', 'context'];
ok(NEED.every((k) => b1.parts[k]) && parts.every(([, p]) => typeof p.ok === 'boolean' && p.at && (p.ok || p.why)), 'B2 every part carries ok and its own time; a part that is not available says why (' + parts.length + ' parts; not available here: ' + parts.filter(([, p]) => !p.ok).map(([k]) => k).join(', ') + ')',
  JSON.stringify(parts.filter(([, p]) => !(typeof p.ok === 'boolean' && p.at && (p.ok || p.why))).map(([k]) => k)));
const b2 = (await J('/api/point?id=' + encodeURIComponent(top.id))).j;
ok(b2 && b2.assembledAt === b1.assembledAt && b2.stamp === b1.stamp, 'B3 the same place again is the cached bundle of the run (assembled ' + b1.assembledAt + ')');
const p1 = (await J('/api/point?lat=31.52040&lon=74.35870')).j, p2 = (await J('/api/point?lat=31.51950&lon=74.36120')).j;
ok(p1 && p2 && p1.ok && p2.ok && p1.place.lat === 31.5204 && p2.place.lat === 31.5195 && p1.key !== p2.key, 'B4 a point is computed where it is asked (no 0.01 deg cell: ' + (p1 && p1.key) + ' / ' + (p2 && p2.key) + ')');
const pts = []; for (let i = 0; i < 12; i++) pts.push((30 + i * 0.37).toFixed(4) + ',' + (70 + i * 0.29).toFixed(4));
const bb = await J('/api/point/batch?pts=' + pts.join(';')); const many = []; for (let i = 0; i < 601; i++) many.push('30,70');
const bx = await J('/api/point/batch?pts=' + many.join(';'));
ok(bb.status === 200 && bb.j && Array.isArray(bb.j.states) && bb.j.states.length === 12 && bb.j.states.filter((x) => x.ok).every((x) => x.light && x.now && !x.parts) && bx.status >= 400, 'B5 /api/point/batch: 12 points, one request, light records without parts; 601 points refused (' + bx.status + ')', JSON.stringify(bb.j && Object.keys(bb.j)));
const GONE = ['/api/point/forecast?lat=31.52&lon=74.35', '/api/pointstate?lat=31.52&lon=74.35', '/api/pointstate/batch?pts=31.52,74.35', '/api/pointstate/near?lat=31.52&lon=74.35', '/api/hyperlocal/point?lat=31.52&lon=74.35',
  '/api/fleet/nearest?lat=31.52&lon=74.35', '/api/mos/point?lat=31.52&lon=74.35', '/api/state/point?lat=31.52&lon=74.35', '/api/site/risk?lat=31.52&lon=74.35', '/api/site/screening?lat=31.52&lon=74.35', '/api/report/pointrun?lat=31.52&lon=74.35',
  '/api/place/facts?lat=31.52&lon=74.35', '/api/glof/upstream?lat=31.52&lon=74.35', '/api/flood/riverlink?lat=31.52&lon=74.35', '/api/climatology/baseline?lat=31.52&lon=74.35', '/api/ai/local?lat=31.52&lon=74.35', '/api/pool/hazard?lat=31.52&lon=74.35'];
const alive = []; for (const u of GONE) { const r = await fetch(BASE + u); if (r.status !== 404) alive.push(u.split('?')[0] + ' ' + r.status); }
ok(!alive.length, 'B6 the ' + GONE.length + ' retired place routes answer 404 (their logic is a part of the bundle)', alive.join(', '));

/* ---- P · the place table ---- */
{ const { norm } = await import(new URL('file://' + join(ROOT, 'server', 'api', 'places.mjs')).href);
  const L = (await J('/api/geo/search?q=Lahore&limit=12')).j; const names = (L && L.results || []).map((x) => norm(x.name));
  ok(names.filter((n) => n === 'lahore').length === 1 && names.filter((n) => /^lahore cantt?$/.test(n)).length === 1, 'P1 "Lahore": one Lahore and one Lahore Cantt (' + (L && L.results || []).slice(0, 5).map((x) => x.name + ' [' + x.kind + ']').join(', ') + ')');
  const T = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'geo', 'places.json.gz'))).toString('utf8')); const ci = Object.fromEntries(T.columns.map((c, i) => [c, i]));
  const ap = T.rows.filter((r) => r[ci.name] === 'Sialkot International Airport');
  const sa = (await J('/api/geo/search?q=' + encodeURIComponent('Sialkot airport') + '&limit=5')).j; const s1 = sa && sa.results && sa.results[0];
  ok(ap.length === 1 && ap[0][ci.confirmed] === 1 && s1 && s1.name === 'Sialkot International Airport' && s1.confirmed !== false, 'P2 Sialkot International Airport: one record, confirmed (sources ' + (ap[0] && ap[0][ci.sources]) + ')');
  const bad = T.rows.filter((r) => r[ci.level] === 'place' && r[ci.kind] === 'village' && (/\bcantt?\b|\bcantonment\b/i.test(r[ci.name]) || [r[ci.tehsil], r[ci.district]].filter(Boolean).map(norm).includes(norm(r[ci.name])))).slice(0, 8);
  ok(!bad.length, 'P3 no cantonment or record named as its own tehsil or district is typed village', bad.map((r) => r[ci.name] + ' (' + r[ci.tehsil] + ')').join(', ')); }

/* ---- the pages ---- */
const PW = __T.playwrightSync(); if (PW.__missing) __T.skip(PW.__missing);
const br = await __T.launch(PW.chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
/* a place request: a route answering for a point, a unit or a place (the rest are national lists, asked once per page load) */
const PLACE = /^\/(api\/(point\?|pointstate(\?|\/(batch|near|product)\?)|levels\/unit\?|geo\/(reverse|near|resolve|place)\?|report\/(context|past30)\?|outlook\/(unit|seasonal)\?|smog\/unit\?|flood\/point\?|pool\/(point|rank)\?|fleet\/nearest\?|mos\/point\?|state\/point\?|site\/(risk|screening)\?|place\/facts\?|glof\/upstream\?|flood\/riverlink\?|climatology\/baseline\?|ai\/local\?|pool\/hazard\?|hyperlocal\/(point|area)\?)|px\/v1\/forecast)/;
const isPlace = (p) => PLACE.test(p) || (/^\/api\/rain\/chance\?.*lat=/.test(p));
/* v91.17.283.20 (B8): the first answer of a new place is served before its slow parts; the page then reads the SAME place once more
   with &complete=1 (at most one completion read). It is not a second place request. */
const isDone = (p) => /^\/api\/point\?.*[?&]complete=1/.test(p);
const TELE = /^\/api\/(shown|selfcheck)\/report/;   /* the page's own telemetry posts (what was shown), not data */
const path = (u) => u.replace(BASE, '');
const tally = (a) => { const m = {}; a.forEach((x) => { const k = x.split('?')[0]; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => n + ' ' + k).join(', '); };
const INIT = () => { window.__ls = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__ls.push(e.value); }).observe({ type: 'layout-shift', buffered: true }); } catch (_) {} };
async function journey(W, H, stale) {
  const ctx = await br.newContext({ viewport: { width: W, height: H } }); await ctx.addInitScript(INIT); const pg = await ctx.newPage();
  const log = []; ctx.on('request', (r) => { const u = r.url(); if (u.startsWith(BASE) && /^\/(api|px)\//.test(path(u))) log.push({ u: path(u), t: Date.now(), m: r.method() }); });
  /* national answers that failed (HTTP error, ok:false or ready:false): the page may ask them again later (its own retry of a failure) */
  const failed = new Set(); ctx.on('response', async (r) => { const u = r.url(); if (!u.startsWith(BASE)) return; const p = path(u); if (!/^\/(api|px)\//.test(p)) return;
    if (r.status() >= 400) { failed.add(p); return; } try { const j = await r.json(); if (j && (j.ok === false || j.ready === false)) failed.add(p); } catch (_) {} });
  await pg.goto(BASE + '/', { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(15000);
  const tLoad = Date.now(); const loadReqs = log.filter((x) => x.t < tLoad).map((x) => x.u);
  await pg.click('#q'); await pg.keyboard.type(Q, { delay: 30 }); await pg.waitForSelector('#sr button[data-ac="0"]', { timeout: 30000 }); await pg.waitForTimeout(600);
  const tSel = Date.now(); await pg.click('#sr button[data-ac="0"]');
  await pg.waitForFunction(() => { const e = document.getElementById('nowT'); return e && /\d/.test(e.textContent); }, null, { timeout: 60000 }).catch(() => {}); await pg.waitForTimeout(10000);
  const sel = log.filter((x) => x.t >= tSel && !/^\/api\/geo\/search/.test(x.u)).map((x) => x.u);
  const st = await pg.evaluate(() => ({ name: (document.getElementById('cName') || {}).textContent, now: (document.getElementById('nowT') || {}).textContent, st: (document.getElementById('stLine') || {}).textContent,
    nums: [...document.querySelectorAll('#nowStats [data-num]')].map((b) => b.getAttribute('data-num')) }));
  const tHand = Date.now();
  await Promise.all([pg.waitForURL(/analyst/, { timeout: 60000 }), pg.evaluate((stale) => { const a = document.getElementById('btnAnalyst'); a.click();
    if (stale) { try { const h = JSON.parse(sessionStorage.getItem('agn.handoff')); h.stamp = 'stale-run-for-the-test#-'; h.ps.stamp = h.stamp; sessionStorage.setItem('agn.handoff', JSON.stringify(h)); } catch (_) {} } }, stale)]);
  await pg.waitForTimeout(18000);
  const an = log.filter((x) => x.t >= tHand).map((x) => x.u);
  const A = await pg.evaluate(() => { const t = (s) => { const e = [...document.querySelectorAll(s)].find((x) => x.offsetParent !== null); return e ? e.textContent.trim().replace(/\s+/g, ' ') : null; };
    const left = document.getElementById('mpLeftIn'); const lt = left ? left.innerText : ''; const m = /(-?\d+(?:\.\d)?)\s*°C/.exec(lt);
    return { city: t('#cityLabel'), bar: t('#agnLive84 .agn-place span'), barV: t('#agnLive84 .t .v'), left: left ? (lt.split('\n')[0] || '').trim() : null, leftV: m ? m[1] : null, cls: (window.__ls || []).reduce((a, v) => a + v, 0) }; });
  /* the tab window opens 45 s after the hand-off and when the page is idle (no request for 8 s, at most 90 s): the page's staggered
     national loads are not the tabs' */
  for (const t1 = Date.now(); Date.now() - t1 < 90000;) { const last = log.length ? log[log.length - 1].t : 0; if (Date.now() - last >= 8000 && Date.now() - tHand >= 45000) break; await pg.waitForTimeout(500); }
  const tTabs = Date.now(); const tabs = await pg.evaluate(() => [...document.querySelectorAll('#machNav [data-goto]')].map((b) => b.getAttribute('data-goto')));
  for (const g of tabs.concat(['overview'])) { await pg.click('#machNav [data-goto="' + g + '"]').catch(() => {}); await pg.waitForTimeout(5000); }
  const tabReqs = log.filter((x) => x.t >= tTabs && !TELE.test(x.u) && !failed.has(x.u)).map((x) => x.u);   /* a retry of a failed national answer is the page's own, not the tab's */
  await pg.click('#machNav [data-goto="livedata"]').catch(() => {}); await pg.waitForTimeout(3000);
  await pg.getByText('Show the hourly table').first().click().catch(() => {}); await pg.waitForTimeout(1500);
  const fc = await pg.evaluate(() => { const v = document.querySelector('.view[data-view="livedata"]'); const tb = v && [...v.querySelectorAll('table')].find((x) => x.offsetParent && /°C/.test(x.innerText));
    const r = tb && [...tb.querySelectorAll('tr')].find((x) => x.querySelector('td')); return r ? [...r.querySelectorAll('td')].map((d) => d.textContent.trim()).slice(0, 2) : null; });
  await ctx.close();
  return { loadReqs, sel, st, an, A, tabs, tabReqs, fc, all: log.map((x) => x.u) };
}
const num = (s) => { const m = /-?\d+(\.\d+)?/.exec(String(s == null ? '' : s).replace('−', '-')); return m ? +m[0] : null; };
for (const [W, H, stale] of [[1366, 768, false], [1920, 1080, false], [1366, 768, true]]) {
  const R = await journey(W, H, stale), tag = W + 'x' + H + (stale ? ' (hand-off of another run)' : '');
  const selDone = R.sel.filter(isDone), selPlace = R.sel.filter((u) => isPlace(u) && !isDone(u)), selNat = R.sel.filter((u) => !isPlace(u) && !TELE.test(u));
  COUNTS.push(['start load', tag, R.loadReqs.length, tally(R.loadReqs)], ['start selection', tag, R.sel.length, tally(R.sel)], ['analyst first 18 s', tag, R.an.length, tally(R.an)], ['analyst ' + R.tabs.length + ' tab switches', tag, R.tabReqs.length, tally(R.tabReqs)]);
  if (!stale) {
    ok(selPlace.length === 1 && /^\/api\/point\?/.test(selPlace[0]) && selDone.length <= 1, 'S1 ' + tag + ': the selection makes exactly 1 place request, GET /api/point, and ' + selDone.length + ' completion read (' + selPlace.concat(selDone).join(', ') + ')', JSON.stringify(selPlace.concat(selDone)));
    const twice = selNat.filter((u) => R.loadReqs.includes(u) || selNat.indexOf(u) !== selNat.lastIndexOf(u));
    ok(!twice.length, 'S2 ' + tag + ': the other ' + selNat.length + ' requests after the selection are national, each asked once per page load (' + tally(selNat) + ')', JSON.stringify(twice));
    ok(['dew', 'gust', 'pres', 'cloud', 'uv', 'rainProb'].every((k) => R.st.nums.includes(k)) && /^Nearest station: /.test(R.st.st || ''), 'S3 ' + tag + ': the card shows dew point, gusts, pressure, cloud, UV, rain chance, and "' + R.st.st + '" on its own line', JSON.stringify(R.st));
  }
  const anDone = R.an.filter(isDone), anPlace = R.an.filter((u) => isPlace(u) && !isDone(u));
  ok(stale ? anPlace.length === 1 && /^\/api\/point\?/.test(anPlace[0]) && anDone.length <= 1 : anPlace.length === 0 && anDone.length <= 1, 'A1 ' + tag + ': the analyst makes ' + (stale ? '1 place request (the bundle of the new run)' : '0 place requests (the handed-over bundle of the run)') + ' (' + (anPlace.join(', ') || 'none') + ')', JSON.stringify(anPlace));
  /* after a run change the page drops its national lists once (owner rule: refresh only when the run stamp changes); a tab then reads
     the ones it shows again, each once, and still no place request */
  if (!stale) ok(R.tabReqs.length === 0, 'A2 ' + tag + ': switching all ' + R.tabs.length + ' main tabs makes 0 data requests', tally(R.tabReqs));
  else ok(!R.tabReqs.filter(isPlace).length && new Set(R.tabReqs).size === R.tabReqs.length, 'A2 ' + tag + ': switching all ' + R.tabs.length + ' main tabs makes 0 place requests; the national lists dropped by the run change are read again once each (' + (tally(R.tabReqs) || 'none') + ')', tally(R.tabReqs));
  const px = R.all.filter((u) => /^\/px\/v1\/forecast/.test(u) || /api\.open-meteo\.com\/v1\/forecast/.test(u));
  ok(!px.length, 'A3 ' + tag + ': no /px/v1/forecast from either page', px.slice(0, 4).join(', '));
  const nm = R.st.name; ok(nm && R.A.city === nm && R.A.bar === nm && R.A.left === nm, 'A4 ' + tag + ': one place label: start card, header, bar and left card all "' + nm + '" (' + JSON.stringify([R.A.city, R.A.bar, R.A.left]) + ')');
  if (!stale) ok(num(R.st.now) != null && num(R.st.now) === num(R.A.barV) && num(R.A.barV) === num(R.A.leftV) && R.fc && num(R.fc[1]) === num(R.A.barV), 'A5 ' + tag + ': the same now on the start card ' + num(R.st.now) + ', the bar ' + num(R.A.barV) + ', the left card ' + num(R.A.leftV) + ' and the Forecast tab\'s first hour ' + (R.fc && R.fc.join(' ')), JSON.stringify([R.st.now, R.A, R.fc]));
  ok(R.A.cls < 0.1, 'A6 ' + tag + ': analyst CLS ' + (Math.round(R.A.cls * 10000) / 10000) + ' (< 0.1) from the hand-off');
}
await br.close();
console.log('\nCOUNTS'); COUNTS.forEach((r) => console.log('  ' + r[0] + ' · ' + r[1] + ' · ' + r[2] + ' requests: ' + r[3]));
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
