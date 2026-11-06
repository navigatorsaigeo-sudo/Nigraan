/* ══ v91.17.283.49 · NIGRAAN 1.0.10 · REPORT ENGINE ROUTES ═══════════════════════════════════════════════════════════════════════════
   GET  /api/place/answer?lat=&lon=[&scenario=]            the one served place answer (placeanswer.mjs)
   POST /api/report/generate {lat, lon, kind, section, edition, scenario, sites:[{lat,lon,name,sector}] (portfolio, network); v91.17.283.51: kinds in repkinds.mjs}
                                                           -> {ok, id, pdf, html, pages, lint} : made, linted, STORED in My reports
   GET  /api/report/pdf?lat=&lon=&kind=&section=&edition=  the same, answered with the PDF itself (attachment): the pages' Report buttons
   GET  /api/report/html?lat=&lon=&kind=...                the same, answered with the HTML view
   GET  /api/reports/<id>.pdf | /api/reports/<id>           the stored PDF | HTML (reports.mjs)
   The view is the caller's (customer unless the operator on this computer). A report that fails the linter is not stored and not sent:
   the answer is 500 with the failures (the operator sees them; a customer sees one plain sentence). */
import { createHash } from 'node:crypto';
import { createPlaceAnswer } from './placeanswer.mjs';
import { buildReport, KIND_TITLES, placeName } from './repengine.mjs';
import { pdf as toPdf, html as toHtml } from './repdraw.mjs';
import { lint } from './replint.mjs';
import { normaliseKind, REPORT_KINDS } from './report.mjs';
import { kindKey as kindOf, EXTRA, MULTI, ALL_KINDS, buildMulti } from './repkinds.mjs';   /* v91.17.283.51 · 1.0.10.2: every report on the engine */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function createReportService(app, dataDir) {
  const PA = createPlaceAnswer(app);
  const RATE = []; const rateOk = () => { const t = Date.now(); while (RATE.length && t - RATE[0] > 60e3) RATE.shift(); if (RATE.length >= (Number(process.env.NIGRAAN_REPORT_RATE) || 120)) return false; RATE.push(t); return true; };
  /* v91.17.283.51 · the place of a saved scenario (its first place), when the request names only the scenario */
  async function scenarioPlace(id, customer) { if (!id || typeof app.inject !== 'function') return null;
    const r = await app.inject('/api/scenario/result?id=' + encodeURIComponent(id), { 'x-agn-report': 'engine', 'x-agn-view': customer ? 'customer' : 'operator' });
    const P = r && r.status === 200 && r.json && Array.isArray(r.json.places) ? r.json.places.find((x) => x && Number.isFinite(+x.lat)) : null; return P ? { lat: +P.lat, lon: +P.lon } : null; }
  /* v91.17.283.51 · portfolio / network: the place answer of every site (three at a time; each one single-flight and cached in
     placeanswer.mjs), the multi-site layout of repkinds.mjs, the same linter, stored like any engine report */
  async function generateMulti(q, kk, { customer }) {
    const sites = Array.isArray(q.sites) ? q.sites.filter((s) => s && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon))).slice(0, 61) : [];
    if (!sites.length) return { status: 400, body: { ok: false, error: 'no_sites', why: 'sites: [{lat, lon, name}] (1 to 60 sites) required' } };
    if (sites.length > 60) return { status: 400, body: { ok: false, error: 'too_many_sites', why: 'at most 60 sites in one report' } };
    if (!rateOk()) return { status: 429, body: { ok: false, error: 'busy', why: 'too many reports in the last minute; try again shortly' } };
    const items = new Array(sites.length); let next = 0;
    await Promise.all([0, 1, 2].map(async () => { while (next < sites.length) { const i = next++; const s = sites[i]; let A = null;
      try { A = await PA.answer({ lat: Number(s.lat), lon: Number(s.lon) }, { customer }); } catch (e) { A = { ok: false, why: 'the place forecast could not be read' }; }
      items[i] = { site: { lat: Number(s.lat), lon: Number(s.lon), name: s.name ? String(s.name).slice(0, 80) : null, sector: s.sector ? String(s.sector).slice(0, 60) : null, id: s.id != null ? String(s.id).slice(0, 60) : null }, A }; } }));
    if (!items.some((it) => it.A && it.A.ok !== false)) return { status: 503, body: { ok: false, error: 'place_answer', why: 'no site of the list has a forecast now' } };
    const view = customer ? 'customer' : 'operator', first = items.find((it) => it.A && it.A.ok !== false).A;
    const t = Date.now(), d = new Date(t + 5 * 3600e3), p2 = (n) => String(n).padStart(2, '0');   /* v91.17.283.51 g2 · the id and 'Issued' are the time the report is made */
    const id = 'NGR-' + d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + '-' + p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + '-'
      + createHash('sha256').update([items.map((it) => (it.A && it.A.answerId) || (it.site.lat + ',' + it.site.lon)).join(','), items.map((it) => it.site.name || '').join(','), kk, view, q.edition || 'main', q.title || ''].join('|')).digest('hex').slice(0, 8);
    const R = buildMulti(items, { generatedAt: new Date(t).toISOString(), kind: kk, view, id, dataDir, title: q.title ? String(q.title).slice(0, 80) : null });
    const pdf = toPdf(R.cv, { title: R.title, subject: 'AI GEO NIGRAAN ' + KIND_TITLES[kk] + ', report ' + id, date: first.issuedAt });
    const html = toHtml(R.cv, { title: R.title, id });
    const L = lint({ cv: R.cv, manifest: R.manifest, pdf, html, answer: { cannotHappen: [] } });
    if (!L.ok) { console.error('  report engine: ' + id + ' failed the linter: ' + L.failures.slice(0, 5).map((f) => f.code + ' p' + f.page + ' ' + f.what).join(' | '));
      return { status: 500, body: customer ? { ok: false, error: 'report_not_ready', why: 'The report could not be finished right now. Please try again in a few minutes.' } : { ok: false, error: 'lint_failed', id, failures: L.failures } }; }
    let st = null;
    if (app.reports && app.reports.storeGenerated) st = app.reports.storeGenerated({ id, kindKey: kk, kindTitle: KIND_TITLES[kk], title: R.title, place: items.length + ' sites', edition: q.edition, section: q.section || null, verdict: R.manifest.summary.text,
      run: first.run, dataAt: first.issuedAt, pages: R.manifest.pages, pdf, html, manifest: R.manifest, answer: { sites: items.map((it) => ({ site: it.site, answer: it.A })) }, audience: view === 'operator' ? 'operator' : 'client' });
    return { status: 200, body: { ok: true, id, kind: kk, stored: !!(st && st.ok), dup: !!(st && st.dup), pdf: '/api/reports/' + id + '.pdf', html: '/api/reports/' + id, pages: R.manifest.pages, customerPages: R.manifest.customerPages,
      title: R.title, summary: R.manifest.summary.text, sites: items.length, lint: { ok: true, checks: L.checks } }, pdf, html, id };
  }
  async function generate(q, { customer }) {
    /* v91.17.283.51 · the kinds of repkinds.mjs (site, situation, readiness_72h, executive, assurance, weather_impact, data_gap,
       engineering_note, scenario, portfolio, network; the 1.0.10 names and labels still work) */
    const kk0 = kindOf(q.kind || 'site_assessment'), kindKey1 = kk0 || normaliseKind(q.kind || 'site_assessment');
    const kindKey_ = kindKey1 === 'portfolio_screening' ? 'portfolio' : kindKey1;
    if (!kindKey_ || !(ALL_KINDS.includes(kindKey_) || REPORT_KINDS[kindKey_])) return { status: 400, body: { ok: false, error: 'unknown_kind', why: 'kind must be one of: ' + ALL_KINDS.join(', ') } };
    if (MULTI.includes(kindKey_)) return generateMulti(q, kindKey_, { customer });
    if (kindKey_ === 'scenario') { if (!q.scenario) return { status: 400, body: { ok: false, error: 'no_scenario', why: 'scenario: the id of a saved Scenario Lab result is required' } };
      if (!Number.isFinite(Number(q.lat)) || !Number.isFinite(Number(q.lon))) { const P = await scenarioPlace(String(q.scenario), customer); if (!P) return { status: 404, body: { ok: false, error: 'scenario', why: 'this saved scenario is not held on this server (run it again)' } }; q = { ...q, lat: P.lat, lon: P.lon }; } }
    const kindKey = kindKey_;
    if (!rateOk()) return { status: 429, body: { ok: false, error: 'busy', why: 'too many reports in the last minute; try again shortly' } };
    const A = await PA.answer(q, { customer });
    if (kindKey === 'scenario' && A && A.ok !== false && !A.scenario) return { status: 404, body: { ok: false, error: 'scenario', why: 'this saved scenario is not held on this server (run it again)' } };
    if (!A || A.ok === false) return { status: A && A.status || 503, body: { ok: false, error: 'place_answer', why: (A && A.why) || 'the place answer could not be assembled' } };
    const view = customer ? 'customer' : 'operator';
    const t = Date.now(), d = new Date(t + 5 * 3600e3), p2 = (n) => String(n).padStart(2, '0');   /* v91.17.283.51 g2 · the id and 'Issued' are the time the report is made (was the place forecast's time) */
    const id = 'NGR-' + d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + '-' + p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + '-'
      + createHash('sha256').update([A.answerId, kindKey, view, q.edition || 'main'].concat(q.scenario ? [String(q.scenario)] : []).concat(q.name ? ['name:' + String(q.name).slice(0, 60)] : []).join('|')).digest('hex').slice(0, 8);
    /* v91.17.283.52 D · #104: the name the person searched or picked (body.name, Latin letters only, no coordinates) titles the report */
    const asked = typeof q.name === 'string' && /^[\x20-\x7E\u00C0-\u024F]{2,60}$/.test(q.name.trim()) && !/^-?\d+(?:\.\d+)?\s*,/.test(q.name.trim()) ? q.name.trim() : null;
    const R = buildReport(asked && A.place ? { ...A, place: { ...A.place, asked } } : A, { generatedAt: new Date(t).toISOString(), kind: kindKey, view, id, dataDir, extra: EXTRA[kindKey] || null });
    const pdf = toPdf(R.cv, { title: R.title, subject: 'AI GEO NIGRAAN ' + (KIND_TITLES[kindKey] || 'report') + ', report ' + id, date: A.issuedAt });
    const html = toHtml(R.cv, { title: R.title, id });
    const L = lint({ cv: R.cv, manifest: R.manifest, pdf, html, answer: A });
    if (!L.ok) { console.error('  report engine: ' + id + ' failed the linter: ' + L.failures.slice(0, 5).map((f) => f.code + ' p' + f.page + ' ' + f.what).join(' | '));
      return { status: 500, body: customer ? { ok: false, error: 'report_not_ready', why: 'The report could not be finished for this place right now. Please try again in a few minutes.' } : { ok: false, error: 'lint_failed', id, failures: L.failures } }; }
    let st = null;
    if (app.reports && app.reports.storeGenerated) st = app.reports.storeGenerated({ id, kindKey, kindTitle: KIND_TITLES[kindKey], title: R.title, place: [placeName(A.place), A.place.tehsil ? A.place.tehsil + ' tehsil' : null, A.place.district].filter(Boolean).join(', '),
      edition: q.edition, section: q.section || null, verdict: R.manifest.summary.text, run: A.run, dataAt: A.issuedAt, pages: R.manifest.pages, pdf, html, manifest: R.manifest, answer: A, audience: view === 'operator' ? 'operator' : 'client' });
    return { status: 200, body: { ok: true, id, stored: !!(st && st.ok), dup: !!(st && st.dup), pdf: '/api/reports/' + id + '.pdf', html: '/api/reports/' + id, pages: R.manifest.pages, customerPages: R.manifest.customerPages,
      title: R.title, summary: R.manifest.summary.text, lint: { ok: true, checks: L.checks } }, pdf, html, id };
  }
  const fileName = (id) => id + '.pdf';
  async function route(req, res, p, url, { send, customerView }) {
    const customer = customerView(req);
    if (p === '/api/place/answer' && req.method === 'GET') { const q = Object.fromEntries(url.searchParams); const A = await PA.answer(q, { customer });
      return send(res, A.ok === false ? (A.status || 503) : 200, A); }
    if (p === '/api/report/generate' && req.method !== 'POST') { res.setHeader('allow', 'POST'); return send(res, 405, { ok: false, error: 'method', why: 'POST a JSON body {lat, lon, kind}' }); }   /* v91.17.283.49 merge: a GET is told, not 404 (the deploy-script endpoint check) */
    if (p === '/api/report/generate' && req.method === 'POST') { let b = ''; for await (const c of req) { b += c; if (b.length > 65536) return send(res, 413, { ok: false, why: 'body too large' }); }
      let q; try { q = JSON.parse(b || '{}'); } catch (_) { return send(res, 400, { ok: false, error: 'bad_json' }); }
      const r = await generate(q, { customer }); return send(res, r.status, r.body); }
    if ((p === '/api/report/pdf' || p === '/api/report/html') && req.method === 'GET') { const q = Object.fromEntries(url.searchParams); const r = await generate(q, { customer });
      if (r.status !== 200) return send(res, r.status, r.body);
      if (p === '/api/report/pdf') { res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': r.pdf.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-agn-report-id': r.id,
        'content-disposition': (q.inline === '1' ? 'inline' : 'attachment') + '; filename="' + fileName(r.id) + '"' }); return res.end(r.pdf); }
      const b = Buffer.from(r.html, 'utf8'); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': b.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-agn-report-id': r.id,
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-ancestors 'self'" }); res.__agnClean = true; return res.end(b); }
    return false;
  }
  void MON;
  return { route, generate, answer: PA.answer };
}
