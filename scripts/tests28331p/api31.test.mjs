/* v91.17.283.31 · page lane · the API31 fields the coordinator listed: 5 low-skill rain line, 6 hottest / coldest, 7 place-record rows,
   8 report checksum and 409 record_mismatch, 9 scenario refusal and peak-gust label, 10 comfort input, 11 no modelled river flow,
   1.5 readiness fields. Routed fixtures where the test server cannot produce the state. */
import { readFileSync } from 'node:fs';
import { T, browser, open, consoleReady } from '../tests28328p/lib.mjs';
const t = T();
const MACH = readFileSync(new URL('../../artefact/AI_GEO_NIGRAAN_v91_17_MACH.html', import.meta.url), 'utf8');
const N3 = readFileSync(new URL('../../artefact/NIGRAAN_3.html', import.meta.url), 'utf8');
/* source checks (8, 9): both pages carry the record values and the checksum, and say which values differ on a 409 */
for (const [nm, s] of [['MACH', MACH], ['NIGRAAN_3', N3]]) {
  t.ok(/shown\s*:/.test(s) && /recordChecksum/.test(s) && /record_mismatch/.test(s), '8 ' + nm + ': report sends record.shown + recordChecksum and handles 409 record_mismatch');
  t.ok(/peak gust/i.test(s) && /Not applied: /.test(s), '9 ' + nm + ': gust control is the day’s peak and a refusal is shown');
}
t.ok(/G\.__renderFloodBadge=function\(s\)\{ var el=\$\('aiFloodLine'\)/.test(MACH) && /riverScrub/.test(MACH), '11 MACH: the river line is replaced by the measured gauge');
const now = Date.now();
const br = await browser();
const o = await open(br, '/analyst', { route: async (pg) => {
  await pg.route('**/api/readiness', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ready: false, stale: [{ product: 'Heavy rain', inputAge: 52, why: 'old run' }], checked: [{ product: 'Heavy rain' }, { product: 'Heat' }], at: new Date(now).toISOString() }) }));
} });
const pg = o.pg; await consoleReady(pg); await pg.waitForTimeout(5000);
const wake = async (ms) => { const n = Math.ceil(ms / 1000); for (let k = 0; k < n; k++) { await pg.mouse.move(5 + (k % 7), 5 + (k % 5)); await pg.waitForTimeout(1000); } };
/* 1.5 readiness: inputAge in hours, products checked, time checked in PKT */
const pill = await pg.evaluate(() => { const e = document.getElementById('agnBackendPill'); return e ? e.title : ''; });
t.ok(/52 h/.test(pill) && /2 products checked/.test(pill) && /PKT/.test(pill), '1.5 readiness badge: input age in hours, products checked and when', pill);
/* 7 place-record rows from a fixture */
const pr = await pg.evaluate(() => AGN.placeRecord.rowsOf({ complete: false, modelCheck: { passed: false, why: 'the day-1 forecast failed its check' },
  accuracy: { byLead: { TX: [{ lead: 0, maeC: 1.2, scoredDays: 40 }, { lead: 1, notEnoughDays: true, why: 'not enough days' }, { lead: 2, notMeasured: true, why: 'not measured' }] } },
  river: { assessed: false, measured: [{ station: 'Tarbela', river: 'Indus', status: 'NORMAL', word: 'Normal', flowCusec: 28800, date: '2026-10-28' }] } }).map((r) => r.join(' | ')));
t.ok(pr.some((x) => /Model check/i.test(x) && /failed/i.test(x)), '7 place record: model check failed row', JSON.stringify(pr));
t.ok(pr.some((x) => /River measured/i.test(x) && /Tarbela/.test(x) && /28,?800/.test(x)), '7 place record: measured river row', JSON.stringify(pr));
t.ok(pr.some((x) => /by lead day/i.test(x) && /not enough days/i.test(x) && /not measured/i.test(x)), '7 place record: accuracy by lead with not enough days / not measured', JSON.stringify(pr));
t.ok(!pr.some((x) => /m³\/s|m3\/s/.test(x)), '11 place record: no modelled river flow', JSON.stringify(pr));
/* 10 comfort: the day's highest hourly discomfort index from each hour's own temperature and humidity */
/* v91.17.283.35 · one server value: the day value is the server's (comfort.mjs comfortDays, each hour's own T and RH, all 24 hours); the
   page computes none (agnComfortDay of a row the server does not know gives no value) */
const CFm = await import('../../server/api/comfort.mjs');
const cf = await (async () => { const day = new Date(Date.now() + 5 * 3600e3 + 864e5).toISOString().slice(0, 10); const hours = [];
  for (let h = 0; h < 24; h++) hours.push({ time: day + 'T' + String(h).padStart(2, '0') + ':00', tempC: h === 14 ? 31 : h === 5 ? 15 : 22, rh: h === 14 ? 25 : h === 5 ? 90 : 55 });
  const r = CFm.comfortDays({ hours, days: [{ date: day, lead: 1 }] })[0];
  const di = (t, rh) => t - 0.55 * (1 - 0.01 * rh) * (t - 14.5);
  const pageOwn = await pg.evaluate(() => { const D = window.DISTRICT_IN = window.DISTRICT_IN || {}; D.__t31 = { fc72: { time: [], temp: [30], hum: [50] } }; const x = window.agnComfortDay('__t31', 1); delete D.__t31; return x; });
  return { r: r && r.assessed ? { di: r.diMax } : null, hourly: Math.round(Math.max(di(31, 25), di(15, 90), di(22, 55)) * 10) / 10, wrong: di(31, (25 + 90 + 55 * 22) / 24), pageOwn }; })();
t.ok(cf.r && Math.abs(cf.r.di - cf.hourly) < 1e-6 && cf.pageOwn == null, '10 comfort uses each hour’s own temperature and humidity (day 1, server); the page computes none', JSON.stringify(cf));
for (let k = 0; k < 40; k++) { const live = await pg.evaluate(() => { const D = window.DISTRICT_IN || {}, ks = Object.keys(D); return ks.length && ks.filter((x) => D[x] && D[x].weatherLive).length > ks.length / 2; }); if (live) break; await wake(1500); }
const share = await pg.evaluate(() => { const D = window.DISTRICT_IN || {}; let n = 0, ok = 0; Object.keys(D).forEach((k) => { let c = null; try { c = window.districtComfortByName(k); } catch (_) {} if (c && c.di != null && isFinite(c.di)) { n++; if (c.di < 24) ok++; } }); return { n, ok, month: new Date().getMonth() }; });
if (share.n > 20) t.ok(share.ok / share.n >= 0.5, '10 comfort "Current" in late October is mostly Normal / Low', JSON.stringify(share)); else console.log('SKIP 10 comfort share: no current inputs on this server ' + JSON.stringify(share));
/* 5 and 6: the right panel for the place's tehsil, with routed heat / cold / rain_hz answers */
const pt = await pg.evaluate(() => { const p = AGN.data && AGN.data.activePoint ? AGN.data.activePoint() : null; const u = p && AGN.siteUnit ? AGN.siteUnit(+p.lat, +p.lon) : null; return u && u.uid != null ? { uid: u.uid, lat: p.lat, lon: p.lon } : null; });
if (!pt) console.log('SKIP 5/6: no place is active on this page');
else {
  const base = (layer, day) => ({ ready: true, at: new Date(now - 600e3).toISOString(), issueId: 'fx#2', stale: false, validUntil: new Date(now + 3 * 3600e3).toISOString(), words: ['Normal', 'Low', 'Moderate', 'High', 'Severe'], layer, day, basis: 'peak', code: { '-1': 'no data', '0+': 'index' }, levels: { [pt.uid]: 2 } });
  await pg.route('**/api/levels?layer=*', (route) => { const u = new URL(route.request().url()); const l = u.searchParams.get('layer'), d = +(u.searchParams.get('day') || 0);
    if (!['heat', 'cold', 'rain_hz'].includes(l)) return route.continue(); const j = base(l, d);
    if (l === 'heat') j.hottest = { [pt.uid]: { utciC: 41.3, at: '14:00', name: 'Test bazaar', point: 'p1' } };
    if (l === 'cold') j.coldest = { [pt.uid]: { utciC: 3.4, at: '06:00', name: 'Test ridge', point: 'p2' } };
    if (l === 'rain_hz') j.facts = { [pt.uid]: { method: 'd-z', lowSkill: true, skill: { pod: 0.42, far: 0.61 }, fromPreviousRun: true } };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) }); });
  await pg.evaluate(() => document.dispatchEvent(new CustomEvent('agn:levels-run', { detail: {} })));
  const pick = async (l) => { await pg.evaluate((l) => { const s = document.getElementById('mapHazardPick'); s.value = l; s.dispatchEvent(new Event('change', { bubbles: true })); try { AGN.day.set(1); } catch (_) {} }, l); await wake(4000); };
  const pane = () => pg.evaluate(() => { const b = document.querySelector('#agn31Tabs button[data-t="layer"]'); if (b) b.click(); return ((document.getElementById('agn31Layer') || {}).textContent || '').replace(/\s+/g, ' '); });
  await pick('heat'); let p = ''; for (let k = 0; k < 6 && !/Hottest/.test(p); k++) { p = await pane(); if (!/Hottest/.test(p)) await wake(1500); }
  t.ok(/Hottest point in the tehsil: Test bazaar/.test(p) && /41\.3/.test(p), '6 heat: hottest point of the tehsil in the right panel', p.slice(0, 400));
  await pick('cold'); p = ''; for (let k = 0; k < 6 && !/Coldest/.test(p); k++) { p = await pane(); if (!/Coldest/.test(p)) await wake(1500); }
  t.ok(/Coldest point in the tehsil: Test ridge/.test(p) && /3\.4/.test(p), '6 cold: coldest point of the tehsil in the right panel', p.slice(0, 400));
  await pick('rain_hz'); p = ''; for (let k = 0; k < 6 && !/low-skill/i.test(p); k++) { p = await pane(); if (!/low-skill/i.test(p)) await wake(1500); }
  t.ok(/low-skill warning/i.test(p) && /42 %/.test(p) && /61 %/.test(p), '5 rain level: low-skill warning with hit rate and false-alarm share', p.slice(0, 500));
}
/* 11: no modelled river flow printed anywhere on the page */
await pg.evaluate(() => { const p = AGN.data && AGN.data.activePoint ? AGN.data.activePoint() : null; if (p && window.__renderFloodBadge) window.__renderFloodBadge({ lat: p.lat, lon: p.lon }); });
await wake(4000);
const fl = await pg.evaluate(() => { const el = document.getElementById('aiFloodLine'); const all = document.body.innerText; return { line: el ? el.textContent : null, m3: /\d\s*m³\/s/.test(all) }; });
t.ok(!fl.m3, '11 no modelled river flow (m³/s) shown on the page', JSON.stringify(fl).slice(0, 300));
if (fl.line) t.ok(/River \(measured\)/.test(fl.line) && !/m³\/s/.test(fl.line), '11 the place river line is the measured gauge (or says why not)', fl.line);
t.ok(o.errs.length === 0, 'no page errors', o.errs.join(' | '));
await br.close(); t.done();
