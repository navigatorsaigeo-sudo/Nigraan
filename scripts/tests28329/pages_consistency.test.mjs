/* v91.17.283.29 · W7 · PAGE CONSISTENCY: the values the pages PRINT equal the served record. For the first N places of
   scripts/tests28328/places.json (NIGRAAN_PC_N, default 3; the server-side guard tests28328/consistency covers all 20), on the running
   server (argv[2] / NIGRAAN_BASE):
     K1  Customize (NIGRAAN_3) · Sites: the "Hazard levels at this site" table = the bundle's siteLevels (word per hazard and day)
     K2  Customize · Place record: the seismic code class and the 24-hour 2-year rain return level = placeRecord
     K3  Customize · Outlook note: the highest day maximum of the next 3 days = max of placeRecord.days[0..2].tmaxC
     K4  Customize · Scenario baseline (preset baseline) = /api/scenario baseline peaks; the site report prints the same site levels
     K5  console · Client Risk "At the site" word per hazard = the siteLevels peak word (heat, cold, wind)
     K6  console · Scenario panel "Now" = /api/scenario baseline peaks
     K7  console · Forecast tab (livedata) KPI "High, next 3 days" = max of placeRecord.days[0..2].tmaxC
   usage: node scripts/tests28329/pages_consistency.test.mjs [base] */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { T, browser, open, consoleReady, place, tab, BASE, ROOT } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const N = +(process.env.NIGRAAN_PC_N || 3);
const PL = JSON.parse(readFileSync(join(ROOT, 'scripts', 'tests28328', 'places.json'), 'utf8')).places.slice(0, N);
const C = { 'x-agn-view': 'customer' };
const get = async (p) => { const r = await fetch(BASE + p, { headers: C }); return r.ok ? r.json() : null; };
const r5 = (x) => (+x).toFixed(5);
const HZ = ['heat', 'cold', 'wind', 'rain', 'flood', 'landslide', 'drought'];
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
const cellWord = (x) => !x ? '—' : x.assessed && x.level != null ? (x.word || WORDS[x.level]) : x.tehsilValue && x.tehsilValue.level != null ? x.tehsilValue.word : 'not assessed';
const peakWord = (H) => H && H.peak && H.peak.level != null ? (H.peak.word || WORDS[H.peak.level]) : 'Not assessed';
const hi3 = (pr) => { const v = (pr.days || []).filter((d) => d.lead >= 0 && d.lead <= 2 && d.tmaxC != null).map((d) => d.tmaxC); return v.length ? Math.max(...v) : null; };
const br = await browser();
/* ---------- Customize ---------- */
{ const o = await open(br, '/customize'); await o.pg.waitForTimeout(6000);
  for (const P of PL) {
    const la = r5(P.lat), lo = r5(P.lon);
    const B = await get('/api/point?lat=' + la + '&lon=' + lo + '&complete=1'); const sl = B && B.parts && B.parts.siteLevels && B.parts.siteLevels.v, pr = B && B.parts && B.parts.placeRecord && B.parts.placeRecord.v;
    const SC = await get('/api/scenario?lat=' + la + '&lon=' + lo + '&preset=baseline'); const sb = SC && SC.places && SC.places[0] && SC.places[0].baseline;
    if (!sl || !pr) { ok(false, P.id + ' the served record was read', JSON.stringify(B && B.parts && Object.keys(B.parts))); continue; }
    await o.pg.evaluate(([a, b, n]) => { NIGRAAN3.setPoint(+a, +b, n); }, [la, lo, P.name]);
    await o.pg.waitForFunction(() => { const S = NIGRAAN3.state; return S.d && S.d.sl && S.d.prec; }, null, { timeout: 180000, polling: 1000 }).catch(() => {});
    await o.pg.evaluate(() => { const b = document.querySelector('[data-s="sites"]'); if (b) b.click(); }); await o.pg.waitForTimeout(2500);
    const shown = await o.pg.evaluate(() => { const t = document.querySelector('#i-levels-b table'); if (!t) return null; const dd = [...t.querySelectorAll('thead th')].slice(1).map((x) => x.textContent);
      return [...t.querySelectorAll('tbody tr')].map((tr) => ({ hz: tr.querySelector('td b').textContent, cells: [...tr.querySelectorAll('td')].slice(1).map((td) => { const p = td.querySelector('.pill'); return p ? p.textContent.trim() : td.textContent.trim(); }) })); });
    const names = { heat: 'Heat stress', cold: 'Cold stress (UTCI)', wind: 'Wind and gusts', rain: 'Heavy rain', flood: 'Flood', landslide: 'Landslide', drought: 'Drought' };
    const want = HZ.filter((k) => sl.hazards[k]).map((k) => ({ hz: names[k], cells: sl.hazards[k].days.map(cellWord) }));
    ok(!!shown && JSON.stringify(shown) === JSON.stringify(want), 'K1 ' + P.id + ' Customize site levels = served siteLevels', JSON.stringify({ shown, want }).slice(0, 700));
    const prt = await o.pg.evaluate(() => (document.getElementById('i-prec-b') || {}).innerText || '');
    const S2 = pr.seismic && pr.seismic.bcp2021, R24 = pr.rainReturn && pr.rainReturn.ready && pr.rainReturn.durations['24h'], T = pr.rainReturn && pr.rainReturn.returnPeriods;
    const rv2 = R24 && T ? (R24.pointRl || R24.areaRl)[T.indexOf(2)] : null;
    ok((!S2 || prt.indexOf(': ' + S2.codeClass) >= 0) && (rv2 == null || prt.indexOf('2-year ' + String(rv2).replace(/\.0$/, '') + ' mm') >= 0), 'K2 ' + P.id + ' Customize place record = served seismic class and 2-year 24 h rain level', prt.slice(0, 400) + ' | want ' + (S2 && S2.codeClass) + ' / ' + rv2);
    await o.pg.evaluate(() => { const b = document.querySelector('[data-s="outlook"]'); if (b) b.click(); }); await o.pg.waitForTimeout(2500);
    const note = await o.pg.evaluate(() => (document.getElementById('o-72-note') || {}).textContent || ''); const h = hi3(pr);
    ok(h == null ? /not available/.test(note) : note.indexOf(h.toFixed(1) + ' °C') >= 0, 'K3 ' + P.id + ' Customize highest day maximum = placeRecord (' + h + ')', note.slice(0, 200));
    await o.pg.evaluate(() => { const b = document.querySelector('[data-s="lab"]'); if (b) b.click(); });
    await o.pg.waitForFunction(() => { const L = NIGRAAN3.lab.state; return L.last && L.last.j; }, null, { timeout: 180000, polling: 1000 }).catch(() => {}); await o.pg.waitForTimeout(800);
    const lab = await o.pg.evaluate(() => { const L = NIGRAAN3.lab.state, P = L.last && L.last.j && L.last.j.places && L.last.j.places[0]; return P ? NIGRAAN3.lab.rows(P).map((r) => [r.k, r.b && r.b.level != null ? r.b.word : 'Not assessed']) : null; });
    const wl = sb ? HZ.map((k) => [k, peakWord(sb.hazards[k])]) : null;
    ok(!!lab && JSON.stringify(lab) === JSON.stringify(wl), 'K4 ' + P.id + ' Customize scenario baseline = /api/scenario baseline', JSON.stringify({ lab, wl }).slice(0, 500));
    const rep = await o.pg.evaluate(() => { const d = document.createElement('div'); d.innerHTML = NIGRAAN3.siteLv(); const t = d.querySelector('table'); return t ? [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((x) => x.textContent.trim())) : null; });
    const wr = HZ.filter((k) => sl.hazards[k]).map((k) => [names[k] + (/tehsil/.test(String(sl.hazards[k].scope || '')) ? ' (tehsil value)' : '')].concat(sl.hazards[k].days.map((x) => { const w = cellWord(x); return x.assessed ? w : x.tehsilValue && x.tehsilValue.level != null ? w + ' (tehsil)' : w; })));
    ok(!!rep && JSON.stringify(rep) === JSON.stringify(wr), 'K4r ' + P.id + ' the site report prints the same site levels', JSON.stringify({ rep, wr }).slice(0, 600));
  }
  ok(o.errs.length === 0, 'Customize: no page error', o.errs.join(' | ')); await o.ctx.close(); }
/* ---------- console ---------- */
{ const o = await open(br, '/analyst'); await consoleReady(o.pg);
  for (const P of PL) {
    const la = r5(P.lat), lo = r5(P.lon);
    const B = await get('/api/point?lat=' + la + '&lon=' + lo + '&complete=1'); const sl = B && B.parts && B.parts.siteLevels && B.parts.siteLevels.v, pr = B && B.parts && B.parts.placeRecord && B.parts.placeRecord.v;
    const SC = await get('/api/scenario?lat=' + la + '&lon=' + lo + '&preset=baseline'); const sb = SC && SC.places && SC.places[0] && SC.places[0].baseline;
    await place(o.pg, la + ', ' + lo).catch(() => {});
    await o.pg.waitForFunction(([a, b]) => { try { const B = AGN.pointState.peek(+a, +b); return !!(B && B.parts && B.parts.siteLevels && !B.parts.siteLevels.pending && B.parts.placeRecord && !B.parts.placeRecord.pending); } catch (_) { return false; } }, [la, lo], { timeout: 180000, polling: 1000 }).catch(() => {});
    await tab(o.pg, 'assessments', 2500);
    await o.pg.evaluate(() => { const s = document.getElementById('asmtAsset'); s.value = 'industrial'; s.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('asmtRun').click(); });
    await o.pg.waitForTimeout(6000);
    const site = await o.pg.evaluate(() => [...document.querySelectorAll('#asmtResultsRows tr')].map((tr) => { const td = tr.querySelectorAll('td'); return td.length >= 2 ? [td[0].textContent.trim(), (td[1].querySelector('.asmt-pill') || td[1]).textContent.trim()] : null; }).filter(Boolean));
    const lab = { heat: 'Heat', cold: 'Cold', wind: 'Wind' };
    for (const k of ['heat', 'cold', 'wind']) { const H = sl && sl.hazards[k]; const row = site.find((r) => new RegExp('^' + lab[k], 'i').test(r[0]));
      const w = H && H.peak && H.peak.level != null ? (H.peak.word || WORDS[H.peak.level]) : null;
      ok(!!row && (w ? row[1] === w : !/^(Normal|Low|Moderate|High|Severe)$/.test(row[1])), 'K5 ' + P.id + ' Client Risk at the site · ' + k + ' = served peak (' + w + ')', JSON.stringify(row)); }
    await o.pg.evaluate(() => { const t = document.getElementById('agn-tab-hybridlab'); if (t) t.click(); });
    /* the panel settles on its own place (the decision subject once Client Risk set one): read the answer and the painted rows together */
    const scnH = await o.pg.waitForFunction(() => { try { const r = AGN.scenario76.result(), tb = document.getElementById('agnScnRows');
      if (!(r && r.place && r.place.baseline) || !tb || tb.getAttribute('aria-busy') === 'true') return false;
      return { q: r.query, rows: [...tb.querySelectorAll('tr[data-hz]')].map((tr) => [tr.dataset.hz, String(((tr.querySelectorAll('td')[0] || document.createElement('td')).querySelector('.lv') || {}).textContent || '').trim()]) }; } catch (_) { return false; } }, null, { timeout: 300000, polling: 1000 }).catch(() => null);
    const scn = scnH ? await scnH.jsonValue() : { q: null, rows: [] };
    const SQ = scn.q ? await get('/api/scenario?' + scn.q) : null, sq = SQ && SQ.places && SQ.places[0] && SQ.places[0].baseline;
    const ws = sq ? HZ.map((k) => [k, peakWord(sq.hazards[k])]) : null;
    ok(!!ws && JSON.stringify(scn.rows) === JSON.stringify(ws), 'K6 ' + P.id + ' console scenario "Now" = /api/scenario baseline', JSON.stringify({ scn, ws }).slice(0, 600));
    await tab(o.pg, 'livedata', 5000);
    const kpi = await o.pg.evaluate(() => { const k = [...document.querySelectorAll('.kpi')].find((e) => /High, next 3 days/.test(e.textContent)); return k ? k.querySelector('b').textContent : null; });
    const h = pr ? hi3(pr) : null;
    ok(kpi != null && (h == null ? kpi === '—' : kpi === h.toFixed(1) + ' °C'), 'K7 ' + P.id + ' console High, next 3 days = placeRecord (' + h + ')', String(kpi));
  }
  ok(o.errs.length === 0, 'console: no page error', o.errs.join(' | ')); await o.ctx.close(); }
await br.close(); done();
