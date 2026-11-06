#!/usr/bin/env node
/* v91.17.283.52 set A · P1 map colour check: for every layer of the analyst layer chooser, days 0-3, customer and operator view, the fill of
   EVERY tehsil polygon is compared with the served answer (GET /api/levels?layer=<served layer>&day=<d>, fetched here with the view's header),
   by an independent rule table (below); the key's counts are compared with the painted map and with the served counts.
   Layer switches run in a shuffled order (the stale-paint bug came from the layer history).
   usage: node mapcheck.mjs <base> <outdir> [view=customer|operator|both] [layers=a,b] [days=0,1,2,3] */
import { writeFileSync, mkdirSync } from 'node:fs';
const T = await import('../lib/testenv.mjs'); const PW = T.playwrightSync();
const B = process.argv[2] || 'http://127.0.0.1:8941', O = process.argv[3] || '/dev/shm/s52A/map'; mkdirSync(O, { recursive: true });
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(k + '=')); return a ? a.slice(k.length + 1) : d; };
const VIEWS = arg('view', 'both') === 'both' ? ['customer', 'operator'] : [arg('view')];
const DAYS = arg('days', '0,1,2,3').split(',').map(Number);
const FILL = ['#74c476', '#ffe680', '#fdae61', '#e8552d', '#a50026'], SIX = ['#74c476', '#ffe680', '#fdae61', '#e8552d', '#a50026', '#67001f'], CYC = ['#74c476', '#fdae61', '#a50026'];
const NSS = ['#efe6c8', '#d9d9a6', '#a8cf8e', '#66b07c', '#2e8b57'];
const ST = { not_tested: '#c3ccd3', outside_range: '#ddd6ea', no_reach: '#e3eff0', input_not_current: '#d9c9a3', not_applicable: 'url(#agnNAHatch)' };
const FB = { rain_hz: 'rain_amount', flood: 'rain_amount', flood_riverine: 'rain_amount', wind: 'wind_gust' };
const SDEF = { '-1': 'missing', '-2': 'outside_range', '-3': 'no_reach', '-4': 'not_applicable', '-5': 'not_tested', '-6': 'input_not_current' };
const rgb = (c) => { c = String(c || '').trim().toLowerCase(); let m = /^#([0-9a-f]{6})$/.exec(c); if (m) return [0, 2, 4].map((i) => parseInt(m[1].substr(i, 2), 16)).join(',');
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(c); if (m) return [m[1], m[2], m[3]].map((x) => Math.round(+x)).join(','); return c; };
let SCALES = null;
function palette(k) { if (/^nss_/.test(k)) return (SCALES && SCALES[k] && SCALES[k].valuePalette) || NSS; if (k === 'aqi') return SIX; if (k === 'cyclone') return CYC; return FILL; }
function stateOf(j, uid) { const v = j.levels ? j.levels[uid] : null; if (v != null && isFinite(+v) && +v >= 0) return { state: 'value', i: +v }; const key = v != null && isFinite(+v) ? String(+v) : '-1'; return { state: (j.stateOf && j.stateOf[key]) || SDEF[key] || 'missing' }; }
/* the expected fill of one tehsil: [colour, why] or [null(=not coloured)] */
function expected(view, k, j, fbj, uid, cur) {
  if (!cur) return { off: true, why: 'no current answer' };
  const q = stateOf(j, uid);
  if (q.state === 'value') return { c: palette(k)[q.i], why: 'level ' + q.i };
  if (q.state === 'not_tested' && fbj && (view === 'customer' || k === 'wind')) { const f = stateOf(fbj, uid); if (f.state === 'value') return { c: FILL[Math.min(4, f.i)], why: 'not tested: forecast value class ' + f.i + ' (' + FB[k] + ')', fb: true }; }
  if (q.state === 'missing') return { c: view === 'operator' ? '#9467c9' : '#c3ccd3', why: 'missing' };
  return { c: ST[q.state], why: q.state };
}
const SNAP = () => { const k = AGN.v52A.layerKey(), o = k ? AGN.v52A.answer(k) : null; const fills = {};
        districtLayer.eachLayer((l) => { const p = l.feature.properties; if (p.uid == null) return; fills[p.uid] = [l.options.fillColor || '', +l.options.fillOpacity || 0, p.dq === true || /Occupied/.test(p.province || '')]; });
        const el = document.getElementById('v3legend'); const rows = el ? [...el.querySelectorAll('.agn-leg-row')].map((r) => { const i = r.querySelector('i'), sp = r.querySelector(':scope > span'), st = i ? (i.getAttribute('style') || '') : '';
          const m = /background(?:-color)?\s*:\s*([^;]+)/.exec(st); return { sw: m ? m[1].trim() : null, n: sp && /^\s*\d+\s*$/.test(sp.textContent) ? +sp.textContent : null, label: (r.querySelector('b') || r).textContent.trim().slice(0, 80) }; }) : [];
        const sel = document.getElementById('mapHazardPick');
        return { k, load: !!(o && o.load), st: o && o.st, sel: sel.value, selText: sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.trim() : '', ml: window.mapLayer, aq: districtAqiMode, hm: districtHazardMode,
          day: AGN.day.get(), chip: (document.getElementById('v283RunChip') || {}).textContent || '', legendTitle: el ? ((el.querySelector('.t') || {}).textContent || '') : '', rows,
          valid: el ? ((el.querySelector('.agn-leg-valid') || {}).textContent || '') : '', dist: el ? ((el.querySelector('.agn-leg-dist') || {}).textContent || '') : '', fills,
          sponge: !!(window.map && map.getPane('agnsponge') && map.getPane('agnsponge').querySelector('img')) && document.getElementById('mpMapWrap').classList.contains('agn-sponge250') }; };
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=700'] });
const report = { at: new Date().toISOString(), base: B, results: [] }; let totalMis = 0, totalCells = 0, legendBad = 0, cspTotal = 0;
for (const view of VIEWS) {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((op) => { try { localStorage.setItem('agn.operator', op ? '1' : '0'); localStorage.setItem('agn.operator.v2', op ? '1' : '0'); } catch (_) {}
    window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + (e.sample || '').slice(0, 60))); }, view === 'operator');
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await pg.goto(B + '/analyst', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => typeof districtLayer !== 'undefined' && districtLayer && document.getElementById('mapHazardPick') && window.AGN && AGN.v52A, null, { timeout: 120000 });
  await pg.waitForTimeout(9000);
  if (!SCALES) SCALES = await pg.evaluate(async () => { try { const j = await (await fetch('/api/map/layer?id=scales:map', { cache: 'no-store' })).json(); return j && j.layers || null; } catch (_) { return null; } });   /* the sponge value ramps: data/map-layer-scales.json (each layer its own direction) */
  let layers = await pg.evaluate(() => [...document.getElementById('mapHazardPick').options].filter((o) => !o.disabled && !o.hidden && o.style.display !== 'none').map((o) => o.value));
  const want = arg('layers', null); if (want) layers = layers.filter((l) => want.split(',').includes(l));
  const seq = []; for (const l of layers) for (const d of DAYS) seq.push([l, d]);
  for (let i = seq.length - 1; i > 0; i--) { const r = (i * 7919 + 13) % (i + 1); [seq[i], seq[r]] = [seq[r], seq[i]]; }   /* a fixed shuffle: layer history varies */
  for (const [lay, d] of seq) {
    await pg.selectOption('#mapHazardPick', lay); await pg.waitForTimeout(1500); await pg.evaluate((dd) => { try { AGN.day.set(dd); } catch (_) {} }, d); await pg.waitForTimeout(800); await pg.evaluate((dd) => { try { if (AGN.day.get() !== dd) AGN.day.set(dd); } catch (_) {} }, d);
    let snap = null, prev = '', t0 = Date.now();
    while (Date.now() - t0 < 40000) { await pg.waitForTimeout(900);
      snap = await pg.evaluate(SNAP);
      const sig = JSON.stringify([snap.fills, snap.rows, snap.chip]); if (!snap.load && sig === prev && !/reading the issued run/.test(snap.chip)) break; prev = sig; }
    let tries = 0, conv = 0; for (;;) {
    const k = snap.k; const dd = snap.day; const served = k ? await pg.evaluate(async ([k2, dd, op]) => { const g = async (L) => { const r = await fetch('/api/levels?layer=' + L + '&day=' + dd, { cache: 'no-store', headers: { 'x-agn-view': op ? 'operator' : 'customer' } }); return r.json(); };
      return { j: await g(k2), fb: null }; }, [k, dd, view === 'operator']) : null;
    let fbj = null; if (served && FB[k] && !(view === 'operator' && k !== 'wind')) fbj = await pg.evaluate(async ([L, dd, op]) => { const r = await fetch('/api/levels?layer=' + L + '&day=' + dd, { cache: 'no-store', headers: { 'x-agn-view': op ? 'operator' : 'customer' } }); return r.json(); }, [FB[k], dd, view === 'operator']);
    const j = served && served.j; const vu = j ? Date.parse(j.validUntil || '') : NaN;
    const cur = !!(j && j.ready !== false && j.levels && !(j.kind !== 'reference' && (j.stale || (isFinite(vu) && Date.now() >= vu))));
    const mis = [], painted = {}; let cells = 0;
    for (const [uid, [fc, fo, skip]] of Object.entries(snap.fills)) { if (skip) continue; cells++;
      const key = fo > 0 ? (/^url\(/.test(fc) ? fc : rgb(fc)) : 'none'; painted[key] = (painted[key] || 0) + 1;
      if (!j) { if (fo > 0 && k) mis.push([uid, 'no served answer', fc]); continue; }
      const e = expected(view, k, j, fbj && fbj.levels ? fbj : null, uid, cur);
      if (e.off) { if (fo > 0) mis.push([uid, 'should be uncoloured (' + e.why + ')', fc]); continue; }
      if (!(fo > 0) || (/^url/.test(e.c) ? fc !== e.c : rgb(fc) !== rgb(e.c))) mis.push([uid, e.why + ' -> ' + e.c, fc + '@' + fo]); }
    /* the key: every row with a swatch and a count = the painted count of that colour (rows sharing a colour are summed) */
    const byKey = {}; for (const r of snap.rows) { if (r.sw == null || r.n == null) continue; const kk = /repeating-linear-gradient/.test(r.sw) ? 'url(#agnNAHatch)' : rgb(r.sw); byKey[kk] = (byKey[kk] || 0) + r.n; }
    const legMis = []; if (cur) { for (const [kk, n] of Object.entries(byKey)) if ((painted[kk] || 0) !== n) legMis.push(kk + ': key ' + n + ' map ' + (painted[kk] || 0));
      for (const [kk, n] of Object.entries(painted)) if (kk !== 'none' && byKey[kk] == null && n > 0) legMis.push(kk + ': painted ' + n + ', no key row'); }
    let servedCountsOk = null; if (cur && j.counts && Array.isArray(j.counts)) { const pc = palette(k).map((c) => 0); for (const [uid] of Object.entries(snap.fills)) { const q = stateOf(j, uid); if (q.state === 'value' && q.i < pc.length) pc[q.i]++; }
      servedCountsOk = j.counts.every((n, i) => n === pc[i]); }
    if ((mis.length || legMis.length) && tries < 8) { tries++; conv += 10; await pg.waitForTimeout(10000); snap = await pg.evaluate(SNAP); continue; }
    const layerOk = snap.sel === lay && (lay === '' ? true : (snap.ml === lay || (lay === 'aqi' && snap.aq)));
    totalMis += mis.length; totalCells += cells; legendBad += legMis.length ? 1 : 0;
    const row = { view, layer: lay, served: k, day: d, pageDay: dd, current: cur, kind: j && j.kind, mismatches: mis.length, mis: mis.slice(0, 6), cells, painted, legend: snap.rows.filter((r) => r.n != null).map((r) => r.label + '=' + r.n), legendMis: legMis, servedCounts: j && j.counts, servedCountsOk,
      states: j && j.states, layerOk, chip: snap.chip, valid: snap.valid, dist: snap.dist, title: snap.legendTitle, selText: snap.selText, sponge: snap.sponge };
    if (snap.sponge && lay !== 'nss_baseline') row.spongeLeft = true;
    report.results.push(row);
    console.log([view, lay || '(comfort)', 'd' + d + (dd !== d ? '(page day ' + dd + ': the day control does not offer d' + d + ' for this layer)' : ''), k, cur ? 'current' : 'NOT current', 'mis=' + mis.length, legMis.length ? 'KEY:' + legMis.join(';') : 'key ok', layerOk ? '' : 'LAYER-STATE ' + snap.sel + '/' + snap.ml, row.spongeLeft ? 'SPONGE-RASTER-LEFT' : ''].join(' | '));
    if (mis.length) console.log('   e.g.', JSON.stringify(mis.slice(0, 3)));
    if (tries) console.log('   (waited ' + conv + ' s for the page to show the re-read answer)'); row.waitedS = conv;
    break; }
  }
  const csp = await pg.evaluate(() => window.__csp || []); cspTotal += csp.length; report.results.push({ view, csp, pageErrors: errs.slice(0, 20) });
  console.log(view, 'CSP violations', csp.length, csp.slice(0, 5).join(' / '), 'page errors', errs.length);
  await pg.screenshot({ path: O + '/' + view + '_last.png' }); await ctx.close();
}
await br.close();
report.summary = { cells: totalCells, mismatches: totalMis, keyStatesWithMismatch: legendBad, csp: cspTotal };
writeFileSync(O + '/mapcheck.json', JSON.stringify(report, null, 1));
console.log('SUMMARY', JSON.stringify(report.summary));
