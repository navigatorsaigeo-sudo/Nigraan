/* ══ v91.17.268 · THE REPORTS LIBRARY (interface 1 of build v268) ═══════════════════════════════════════════════════════════════
   A report is made inside the section it belongs to (main page, Customize NIGRAAN) with the report kit and, when it is issued (printed
   or downloaded), the page POSTs the stand-alone HTML and its assessment record here. The Reports tab lists them, re-opens them,
   downloads them and puts several into one pack. Nothing is deleted: archiving moves the files.

   POST /api/reports/issue            {record:{report_id, kind, ...}, html, title, place, edition:"main"|"customize", verdict}
                                      → 200 {ok, id, at, url}; the same id again → 200 {ok, id, dup:true} (the stored copy is kept)
                                      400 bad id (^[A-Za-z0-9_-]{6,80}$), missing html, html over 12 MB, bad edition
   GET  /api/reports?edition=&limit=  → {ok, reports:[{id, kind, title, place, edition, verdict, at, atPkt, run, bytes}]} newest first
   GET  /api/reports/<id>             → the stored HTML (text/html, CSP default-src 'none'; style-src 'unsafe-inline'; img-src data:)
   GET  /api/reports/<id>.json        → the record
   GET  /api/reports/pack?ids=a,b,c   → one HTML: pack cover, summary table (report, place, issued, verdict), each report on a new page
   POST /api/reports/<id>/archive     → both files moved to data/reports/_archive/; 200 {ok}

   Storage: data/reports/<YYYY-MM PKT>/<id>.html + <id>.json, and data/reports/index.jsonl (one line per issue, one per archive;
   the list folds it, so the index is only ever appended to).
   Audience: a report issued by the operator view (not the customer view) is 'operator'; the customer view never lists, opens, packs or
   archives one, so operator material cannot reach a client through the library. Titles, places and verdicts sent to the customer
   view pass through customerscrub.mjs. Write protection (index.mjs): the operator scope or the page on this computer, the rule of the
   server's other page POSTs (localOrSigned || loopbackDirect). */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { REPORT_KINDS, normaliseKind } from './report.mjs';   /* v91.17.283 · INTEG (WS3 request) · the report kinds table */
import { writeFileAtomicSync, appendLineSync } from './store.mjs';   /* v91.17.283 · WS3 · fsynced temp + rename; journal lines that survive a torn append */
import { customerScrub } from './customerscrub.mjs';
import { compareShown } from './placerecord.mjs';   /* v283.31 · owner 3.3 */
import { GUIDANCE_ON, bindGuidance } from './guidance.mjs';   /* v91.17.283.48 · "What to do here" (GUIDANCE_PANEL=1) */

const ID_RE = /^[A-Za-z0-9_-]{6,80}$/;
/* v283.36 · launch item 2 · THE DECISION VALUES OF AN ISSUED REPORT ARE RENDERED BY THE SERVER FROM THE RECORD. The page's HTML keeps its
   narrative, but the table of decision values (per day: temperatures, rain, and each hazard's level with its state) is written here from
   the place record the server holds, and placed at the top of the stored report. A report without the record binding (shown values or
   the record checksum) is refused; an issued report is never overwritten. */
const escH = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (x, u) => (typeof x === 'number' && Number.isFinite(x) ? (Math.round(x * 10) / 10) + (u || '') : '—');
export function decisionHtml(placeRecords) {
  const out = ['<section class="agn-decision" data-agn-decision="server"><h2>Issued values (from the server record)</h2>'];
  for (const P of placeRecords || []) { const R = P.record || {}, SL = P.siteLevels || {}, H = SL.hazards || {};
    out.push('<p class="small">Place ' + escH(P.unitId || '') + ' · record ' + escH(R.checksum || '') + (R.at ? ' · issued data ' + escH(R.at) : '') + '</p>');
    const days = R.days || [];
    out.push('<table><tr><th>Day</th><th>Max °C</th><th>Min °C</th><th>Feels-like max °C</th><th>Rain mm</th>' + Object.keys(H).map((k) => '<th>' + escH(k) + '</th>').join('') + '</tr>');
    days.forEach((d, i) => { out.push('<tr><td>' + escH(d.date) + '</td><td>' + fmt(d.tmaxC) + '</td><td>' + fmt(d.tminC) + '</td><td>' + fmt(d.feelsMaxC) + '</td><td>' + fmt(d.rainMm) + '</td>'
      + Object.keys(H).map((k) => { const x = ((H[k] && H[k].days) || []).find((y) => y && y.date === d.date) || null; return '<td>' + (!x ? '—' : x.assessed ? escH(x.word) : escH(x.state === 'not_tested' ? 'not tested' : 'not assessed')) + '</td>'; }).join('') + '</tr>'); });
    out.push('</table>'); }
  out.push('</section>'); return out.join('');
}
export function bindDecision(html, placeRecords) { const blk = decisionHtml(placeRecords); const i = String(html).search(/<body[^>]*>/i);
  if (i < 0) return blk + String(html); const j = String(html).indexOf('>', i) + 1; return String(html).slice(0, j) + blk + String(html).slice(j); }
const HTML_MAX = 12 * 1048576;                 /* interface 1: html over 12 MB is refused */
const BODY_MAX = HTML_MAX + 2 * 1048576;       /* the html, the record and the labels; anything larger is refused unread */
const EDITIONS = new Set(['main', 'customize']);
/* v91.17.283 · WS3 · which section may issue which report kind (the same table as report.mjs REPORT_KINDS: site_assessment from
   operations / assets, portfolio_screening from portfolio) */
const KIND_SECTIONS = REPORT_KINDS;   /* v91.17.283 · INTEG: one table, exported by report.mjs */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
const CSP_ENGINE = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-ancestors 'self'";   /* v91.17.283.49 · an engine report carries its subset Carlito font inline and is framed by the start page */
const pk = (ms) => new Date(ms + 5 * 3600e3);
/* the kit's when(): "15 Oct 2026, 12:18 PKT" */
const whenPkt = (ms) => { const d = pk(ms); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ', ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' PKT'; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const str = (v, max) => (typeof v === 'string' && v.trim()) ? v.trim().slice(0, max) : null;

export function createReports(dataDir, app = null) {
  const ROOT = join(dataDir, 'reports'), ARCH = join(ROOT, '_archive'), INDEX = join(ROOT, 'index.jsonl');
  /* ── the index, folded: id → entry (archived ones flagged); re-read when the file changes ── */
  let IX = null, IXsize = -1, IXmt = 0;
  function index() {
    let s = null; try { s = statSync(INDEX); } catch (_) { IX = new Map(); IXsize = -1; return IX; }
    if (IX && s.size === IXsize && s.mtimeMs === IXmt) return IX;
    const M = new Map();
    for (const line of readFileSync(INDEX, 'utf8').split('\n')) {
      if (!line.trim()) continue; let r; try { r = JSON.parse(line); } catch (_) { continue; }
      if (!r || typeof r.id !== 'string') continue;
      if (r.op === 'archive') { const e = M.get(r.id); if (e) { e.archived = true; e.archivedAt = r.at; } continue; }
      M.set(r.id, { ...r, archived: false });
    }
    IX = M; IXsize = s.size; IXmt = s.mtimeMs; return IX;
  }
  /* v91.17.283 · WS3 · the index is a journal: each line fsynced; a torn last line (a crash mid-append) is closed first, never glued to the next */
  const append = (o) => { mkdirSync(ROOT, { recursive: true }); appendLineSync(INDEX, JSON.stringify(o)); IX = null; };
  const writeAtomic = (f, data) => writeFileAtomicSync(f, data);
  const fileOf = (e, ext) => join(ROOT, e.month, e.id + ext);
  /* an entry the caller may see: in the library (not archived) and, for the customer view, not an operator report */
  const visible = (id, client) => { const e = ID_RE.test(String(id || '')) ? index().get(id) : null; return e && !e.archived && !(client && e.audience === 'operator') ? e : null; };
  /* the customer view gets the labels with supplier names replaced by role words; the id is never rewritten (it opens the report) */
  const pub = (e, client) => { const o = { id: e.id, kind: e.kind, title: e.title, place: e.place, edition: e.edition, verdict: e.verdict, at: e.at, atPkt: e.atPkt, run: e.run, bytes: e.bytes, dataAt: e.dataAt || null,
      ...(e.engine ? { engine: true, pdf: '/api/reports/' + e.id + '.pdf', html: '/api/reports/' + e.id, pages: e.pages || null } : {}) };
    return client ? { ...o, ...customerScrub({ kind: o.kind, title: o.title, place: o.place, verdict: o.verdict }) } : o; };

  /* the request body, read up to BODY_MAX (larger bodies are drained and refused, not buffered) */
  async function readJson(req) {
    const chunks = []; let size = 0, over = false;
    for await (const c of req) { size += c.length; if (size > BODY_MAX) { over = true; chunks.length = 0; continue; } chunks.push(c); }
    if (over) return { error: 'html_too_large', why: 'the request is larger than the 12 MB report limit' };
    try { return { body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }; } catch (_) { return { error: 'bad_json', why: 'the body is not JSON' }; }
  }

  /* v91.17.283.28 · S9 · the place a report is issued for: the record's point (lat/lon, coordinates, the reproducibility coordinates, the
     subject or site) or its tehsil; a portfolio names several sites (each checked) */
  const num = (x) => (x == null || x === '' ? NaN : Number(x));
  function placesOf(rec, b) {
    const pts = []; const add = (o) => { if (!o || typeof o !== 'object') return; const la = num(o.lat ?? o.latitude), lo = num(o.lon ?? o.longitude); if (isFinite(la) && isFinite(lo)) pts.push({ lat: la, lon: lo }); };
    add(rec); add(rec.coordinates); add(rec.reproducibility && rec.reproducibility.coordinates); add(rec.subject); add(rec.site); add(rec.place && typeof rec.place === 'object' ? rec.place : null);
    for (const x of Array.isArray(rec.sites) ? rec.sites.slice(0, 50) : []) add(x);
    if (!pts.length) for (const x of (rec.inputs && Array.isArray(rec.inputs.sites)) ? rec.inputs.sites.slice(0, 50) : []) add(x);   /* v91.17.283.29 · W4: a network record lists its sites under inputs */
    if (!pts.length && (rec.unit || rec.unitId)) pts.push({ unit: String(rec.unit || rec.unitId) });
    return pts; }
  async function issue(b, { audience }) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return [400, { ok: false, error: 'bad_body', why: 'a JSON object is required' }];
    const rec = b.record;
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return [400, { ok: false, error: 'bad_record', why: 'record is required' }];
    const id = rec.report_id;
    if (typeof id !== 'string' || !ID_RE.test(id)) return [400, { ok: false, error: 'bad_id', why: 'record.report_id must match ^[A-Za-z0-9_-]{6,80}$' }];
    if (typeof b.html !== 'string' || !b.html.trim()) return [400, { ok: false, error: 'missing_html', why: 'html is required' }];
    const bytes = Buffer.byteLength(b.html, 'utf8');
    if (bytes > HTML_MAX) return [400, { ok: false, error: 'html_too_large', why: 'html is ' + Math.round(bytes / 1048576 * 10) / 10 + ' MB; the limit is 12 MB' }];
    const edition = b.edition == null ? 'main' : b.edition;
    if (!EDITIONS.has(edition)) return [400, { ok: false, error: 'bad_edition', why: 'edition must be main or customize' }];
    /* v91.17.283 · WS3 (request of WS4) · a report kind is issued only from its own section: a site assessment from Operations or Assets,
       a portfolio screening from Portfolio (the rule /api/report/context?section= serves, report.mjs REPORT_KINDS). The section comes in
       body.section or record.section; for these two kinds it is required. Other kinds are unchanged. */
    /* v91.17.283.8 · audit 15 · every kind: normalised (a label such as "Site report" is site_assessment), an unknown kind refused, the
       section required and checked for each */
    const kindKey = normaliseKind(rec.kind || b.kind);
    const rule = kindKey ? KIND_SECTIONS[kindKey] : null;
    if (!rule) return [400, { ok: false, error: 'unknown_kind', why: 'the report kind "' + String(rec.kind || b.kind || '').slice(0, 80) + '" is not one of: ' + Object.values(KIND_SECTIONS).map((v) => v.title).join(', ') }];
    const section = String(b.section || rec.section || (rec.context && rec.context.section) || '').trim().toLowerCase() || null;
    if (!section) return [400, { ok: false, error: 'section_required', why: 'a ' + rule.title.toLowerCase() + ' is issued from ' + rule.from.join(' or ') + '; send section' }];
    if (!rule.sections.includes(section)) return [400, { ok: false, error: 'kind_section_mismatch', why: 'a ' + rule.title.toLowerCase() + ' is issued only from ' + rule.from.join(' or ') + ', not from ' + section }];
    const old = index().get(id);
    if (old && !old.archived) return [200, { ok: true, id, dup: true, at: old.at, url: '/api/reports/' + id }];
    /* v91.17.283.28 · S9 · issued only from a COMPLETE place record (the screen's values); never frozen from partial data */
    let placeRecords = null;
    if (app && app.report && app.report.placeFor) {
      const pts = placesOf(rec, b); if (!pts.length) return [409, { ok: false, error: 'no_place', why: 'the report record names no place (lat/lon, coordinates or tehsil): a report is issued from a place record' }];
      placeRecords = [];
      for (const q of pts) { const P = await app.report.placeFor(q, { customer: audience !== 'operator' });
        if (!P.complete) return [409, { ok: false, error: 'place_record_incomplete', why: 'not issued: the place record is not complete (' + (P.why || 'levels not loaded') + '); issue it again when the levels are loaded', place: q }];
        /* v91.17.283.31 · owner 3.3 · one checked record: the values the page shows must be the record's (an edited number is refused) */
        const shown = (rec.shown && typeof rec.shown === 'object') ? (pts.length > 1 ? (rec.shown[pts.indexOf(q)] || null) : rec.shown) : null, sum = rec.recordChecksum != null ? (Array.isArray(rec.recordChecksum) ? rec.recordChecksum[pts.indexOf(q)] : rec.recordChecksum) : null;
        if (!shown && sum == null) return [409, { ok: false, error: 'record_unbound', why: 'not issued: the report carries neither the shown values nor the record checksum, so it cannot be checked against the place record', place: q }];   /* v283.36 item 2: binding mandatory */
        { const C = compareShown(P.record, shown, sum);
          if (!C.match) return [409, { ok: false, error: 'record_mismatch', why: 'not issued: the report does not match the checked place record (' + C.mismatches.map((m) => m.path + ': shown ' + m.shown + ', record ' + m.record).slice(0, 3).join('; ') + ')', mismatches: C.mismatches, place: q }]; }
        placeRecords.push({ lat: P.lat, lon: P.lon, unitId: P.unitId, checksum: P.record && P.record.checksum, record: P.record, siteLevels: P.siteLevels }); } }
    const now = Date.now(), at = new Date(now).toISOString(), month = pk(now).toISOString().slice(0, 7);
    const e = { id, kind: str(rec.kind, 80) || 'Report', title: str(b.title, 300) || str(rec.kind, 80) || 'Report', place: str(b.place, 300), edition,
      verdict: str(b.verdict, 2000) || str(rec.verdict, 2000), at, atPkt: whenPkt(now), run: str(rec.run, 80), bytes, month, audience,
      /* v91.17.282.1 · FIX2821 B · the data issue time the report was made from (record.data_issued_at), kept beside the archive time */
      section, kindKey, snapshot: (() => { try { return app && app.snapshot ? app.snapshot.id() : null; } catch (_) { return null; } })(), dataAt: (typeof rec.data_issued_at === 'string' && !isNaN(Date.parse(rec.data_issued_at))) ? new Date(Date.parse(rec.data_issued_at)).toISOString() : null };
    mkdirSync(join(ROOT, month), { recursive: true });
    if (existsSync(fileOf(e, '.html'))) return [409, { ok: false, error: 'issued_immutable', why: 'an issued report is never overwritten', id }];   /* v283.36 item 2 */
    /* == BEGIN v91.17.283.48 · GUIDANCE (GUIDANCE_PANEL=1 only): a site report gets the server-written "What to do" section, from the same
       selection as GET /api/guidance, after the decision values; its library version and item ids are kept in <id>.guidance.json == */
    let guid = null;
    if (GUIDANCE_ON() && app && app.guidance && placeRecords && kindKey === 'site_assessment') { guid = [];
      for (const P of placeRecords) { try { guid.push(await app.guidance.forPlace({ lat: P.lat, lon: P.lon, audience: rec.guidanceAudience || b.guidanceAudience || 'business', lang: rec.lang }, { view: audience === 'operator' ? 'operator' : 'customer' })); } catch (_) { guid.push({ ok: false, why: 'the guidance could not be read' }); } } }
    if (guid) { writeAtomic(fileOf(e, '.html'), bindGuidance(bindDecision(b.html, placeRecords), guid));
      writeAtomic(fileOf(e, '.guidance.json'), JSON.stringify({ at, rule: 'the "What to do" section of this report: items selected by the guidance matching (no generated text)', places: guid.map((g) => g && g.ok !== false ? { place: g.place, audience: g.audience, provenance: g.provenance } : { ok: false, why: g && g.why }) })); }
    /* == END v91.17.283.48 · GUIDANCE == */
    if (!guid) writeAtomic(fileOf(e, '.html'), placeRecords ? bindDecision(b.html, placeRecords) : b.html);
    writeAtomic(fileOf(e, '.json'), JSON.stringify(rec, null, 1));
    if (placeRecords) writeAtomic(fileOf(e, '.place.json'), JSON.stringify({ at, rule: 'the place record(s) the report was issued from (the values the screen showed)', places: placeRecords }));
    writeAtomic(fileOf(e, '.entry.json'), JSON.stringify(e));   /* v91.17.283 · WS3 · the index line, kept beside the report: replayed at start if the append was lost */
    append(e);
    return [200, { ok: true, id, at, url: '/api/reports/' + id }];
  }

  /* ══ v91.17.283.49 · 1.0.10 · A REPORT IS STORED WHEN IT IS GENERATED ═══════════════════════════════════════════════════════════════
     The report engine (repengine.mjs) writes the PDF and its HTML view on the server from the place answer; both are kept here at once
     (not only when a page prints or downloads), with the place answer they were made from and the engine's manifest. The id is a
     function of the place answer, the kind and the view, so the same report asked twice is the same stored report (dup:true). */
  function storeGenerated(g) {
    if (!g || !ID_RE.test(String(g.id || ''))) return { ok: false, why: 'bad id' };
    const old = index().get(g.id); if (old && !old.archived && existsSync(fileOf(old, '.pdf'))) return { ok: true, id: g.id, dup: true, at: old.at };
    const now = Date.now(), at = new Date(now).toISOString(), month = pk(now).toISOString().slice(0, 7);
    const e = { id: g.id, kind: str(g.kindTitle, 80) || 'Report', title: str(g.title, 300) || 'Report', place: str(g.place, 300), edition: EDITIONS.has(g.edition) ? g.edition : 'main',
      verdict: str(g.verdict, 2000), at, atPkt: whenPkt(now), run: str(g.run, 80), bytes: g.pdf.length, month, audience: g.audience === 'operator' ? 'operator' : 'client',
      section: g.section || null, kindKey: g.kindKey || null, engine: true, pages: g.pages || null,
      snapshot: (() => { try { return app && app.snapshot ? app.snapshot.id() : null; } catch (_) { return null; } })(), dataAt: g.dataAt || null };
    mkdirSync(join(ROOT, month), { recursive: true });
    writeAtomic(fileOf(e, '.pdf'), g.pdf); writeAtomic(fileOf(e, '.html'), g.html);
    writeAtomic(fileOf(e, '.json'), JSON.stringify({ report_id: e.id, kind: e.kind, kindKey: e.kindKey, view: e.audience === 'operator' ? 'operator' : 'customer', engine: 'report engine 1.0.10', manifest: g.manifest }, null, 1));
    writeAtomic(fileOf(e, '.place.json'), JSON.stringify({ at, rule: 'the place answer the report was generated from (GET /api/place/answer)', answer: g.answer }));
    writeAtomic(fileOf(e, '.entry.json'), JSON.stringify(e)); append(e);
    return { ok: true, id: e.id, at };
  }
  function list(q, client) {
    const edition = q.get('edition');
    if (edition && !EDITIONS.has(edition)) return [400, { ok: false, error: 'bad_edition', why: 'edition must be main or customize' }];
    const lim = q.has('limit') ? Number(q.get('limit')) : 100;
    if (!Number.isInteger(lim) || lim < 1 || lim > 1000) return [400, { ok: false, error: 'bad_limit', why: 'limit is a whole number from 1 to 1000' }];
    const rows = [...index().values()].filter((e) => !e.archived && (!edition || e.edition === edition) && !(client && e.audience === 'operator'))
      .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, lim).map((e) => pub(e, client));
    return [200, { ok: true, reports: rows }];
  }

  function archive(id, client, reason = null) {
    const e = ID_RE.test(String(id || '')) ? index().get(id) : null;
    if (!e || (client && e.audience === 'operator')) return [404, { ok: false, error: 'report_not_found', id }];
    if (e.archived) return [200, { ok: true, id, already: true }];
    mkdirSync(ARCH, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    for (const ext of ['.html', '.pdf', '.json', '.entry.json', '.place.json', '.guidance.json']) { const f = fileOf(e, ext); if (!existsSync(f)) continue;
      let dst = join(ARCH, e.id + ext); if (existsSync(dst)) dst = join(ARCH, e.id + '.' + stamp + ext);   /* an earlier archived copy is kept, never overwritten */
      renameSync(f, dst); }
    append({ op: 'archive', id, at: new Date().toISOString(), ...(reason ? { reason } : {}) });
    return [200, { ok: true, id }];
  }

  /* ══ v91.17.283 · WS3 · RECOVERY AND RETENTION ════════════════════════════════════════════════════════════════════════════════════
     recover(): at start, the index (the journal) is replayed: a report whose files and entry were written but whose index line was lost
     (a stop between the two) is put back in the library from its <id>.entry.json.
     retention(): reports issued more than NIGRAAN_REPORTS_KEEP_DAYS ago (default 365 days) leave the library: their files are MOVED to
     data/reports/_archive/ (never deleted) and the index records op:"archive", reason:"retention". Checked at start and every 6 hours. */
  const KEEP_DAYS = Math.max(1, Number(process.env.NIGRAAN_REPORTS_KEEP_DAYS) || 365);
  function recover() {
    const out = { replayed: [] };
    let months = []; try { months = readdirSync(ROOT).filter((d) => /^\d{4}-\d{2}$/.test(d)); } catch (_) { return out; }
    const I = index();
    for (const m of months) { let names = []; try { names = readdirSync(join(ROOT, m)).filter((n) => n.endsWith('.entry.json')); } catch (_) { continue; }
      for (const n of names) { const id = n.slice(0, -'.entry.json'.length); if (!ID_RE.test(id) || I.has(id)) continue;
        let e = null; try { e = JSON.parse(readFileSync(join(ROOT, m, n), 'utf8')); } catch (_) { continue; }
        if (!e || e.id !== id || !existsSync(join(ROOT, m, id + '.html'))) continue;
        append({ ...e, recoveredAt: new Date().toISOString() }); out.replayed.push(id); } }
    if (out.replayed.length) console.error('  reports: ' + out.replayed.length + ' report(s) put back in the library from their entry files (index line lost): ' + out.replayed.join(', '));
    return out;
  }
  function retention(now = Date.now()) {
    const cut = now - KEEP_DAYS * 864e5, moved = [];
    for (const e of [...index().values()]) { if (e.archived) continue; const t = Date.parse(e.at); if (!Number.isFinite(t) || t >= cut) continue;
      try { const [st] = archive(e.id, false, 'retention: issued over ' + KEEP_DAYS + ' days ago'); if (st === 200) moved.push(e.id); } catch (err) { console.error('  reports: retention could not move ' + e.id + ' (' + err.message + ')'); } }
    if (moved.length) console.error('  reports: retention moved ' + moved.length + ' report(s) older than ' + KEEP_DAYS + ' days to data/reports/_archive/');
    return { keepDays: KEEP_DAYS, moved };
  }
  try { recover(); } catch (e) { console.error('  reports: recovery failed (' + e.message + ')'); }
  try { retention(); } catch (e) { console.error('  reports: retention failed (' + e.message + ')'); }
  { const t = setInterval(() => { try { retention(); } catch (_) {} }, 6 * 3600e3); if (t.unref) t.unref(); }

  /* ── the pack: one document from 2 to 12 stored reports, in the order asked ── */
  /* every <style> block of a stored report (the kit's AGNRK.standalone() writes one: the kit CSS and its body rule) */
  const stylesOf = (h) => [...h.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const bodyOf = (h) => { const a = h.search(/<body[^>]*>/i), z = h.toLowerCase().lastIndexOf('</body>');
    let s = a >= 0 ? h.slice(h.indexOf('>', a) + 1, z > a ? z : h.length) : h.replace(/<!doctype[^>]*>/i, '').replace(/<head[\s\S]*?<\/head>/i, '').replace(/<\/?html[^>]*>/gi, '');
    return s.replace(/<script\b[\s\S]*?<\/script>/gi, ''); };
  /* the kit's cover() markup (kit/rk.js), so the pack cover reads like every report cover */
  const cover = (o) => '<section class="rk-cover"><div class="top"><div class="brand">AI GEO NIGRAAN</div><div class="kind">' + esc(o.kind) + '</div></div>'
    + '<div class="title"><h1>' + esc(o.title) + '</h1><p class="sub">' + esc(o.subtitle || '') + '</p></div>'
    + ((o.contents || []).length ? '<div class="contents"><h3>Contents</h3><ol>' + o.contents.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ol></div>' : '')
    + '<div class="bottom">Prepared with AI GEO NIGRAAN by AI Geo Navigators (Private) Limited · www.aigeo360.com · info@aigeo360.com. '
    + 'Every sentence in this report is written by fixed rules from the figures shown; nothing is written by an AI model. It ranks and dates what needs attention; it does not replace a site survey, a design calculation or an official warning.</div></section>';
  function pack(q, client) {
    const ids = String(q.get('ids') || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (ids.length < 2 || ids.length > 12) return [400, { ok: false, error: 'bad_ids', why: 'a pack holds 2 to 12 reports (ids=a,b,c)' }];
    if (new Set(ids).size !== ids.length) return [400, { ok: false, error: 'bad_ids', why: 'a report is named twice' }];
    const bad = ids.find((x) => !ID_RE.test(x)); if (bad) return [400, { ok: false, error: 'bad_id', id: bad }];
    const R = [];
    for (const id of ids) { const e = visible(id, client); let h = null; try { h = e ? readFileSync(fileOf(e, '.html'), 'utf8') : null; } catch (_) { h = null; }
      if (!h) return [404, { ok: false, error: 'report_not_found', id }]; R.push({ e: pub(e, client), h }); }
    /* the stylesheets of the stored reports, each distinct block once (reports issued with the same kit share one), then one pack rule:
       the cover of every report inside the pack prints without the running header and footer, as page 1 of a single report does */
    const css = [...new Set(R.flatMap((r) => stylesOf(r.h)))].join('\n')
      + '\n.rk-pb .rk-cover{page:rkcover}@page rkcover{@top-left{content:none} @bottom-right{content:none} @bottom-left{content:none}}';
    const places = [...new Set(R.map((r) => r.e.place).filter(Boolean))];
    const now = Date.now();
    const title = places.length === 1 ? places[0] : R.length + ' reports';
    const subtitle = places.length === 1 ? R.length + ' reports' : places.join('; ');
    const NA = '<span class="rk-sev na">Not available</span>';
    const rows = R.map((r) => '<tr><td>' + esc(r.e.title) + '</td><td>' + (r.e.place ? esc(r.e.place) : NA) + '</td><td>' + esc(r.e.atPkt)
      + '</td><td>' + (r.e.verdict ? esc(r.e.verdict) : NA) + '</td></tr>').join('');
    const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + esc('Report pack: ' + title) + '</title><style>' + css.replace(/<\/style/gi, '') + '</style></head><body>'
      + '<div class="rk">' + cover({ kind: 'Report pack', title, subtitle, contents: R.map((r) => r.e.title + (r.e.place && places.length > 1 ? ' · ' + r.e.place : '')) })
      + '<h2><span class="n">1</span>Reports in this pack</h2><p class="muted">Assembled ' + esc(whenPkt(now)) + ' from the reports library · ' + R.length + ' reports</p>'
      + '<table><thead><tr><th>Report</th><th>Place</th><th>Issued</th><th>Verdict</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<p class="small">Each report follows on a new page exactly as it was issued; the verdict of each is the one stored with it.</p>'
      + '<div class="rk-foot">Report pack · assembled ' + esc(whenPkt(now)) + ' · ' + R.map((r) => esc(r.e.id)).join(', ') + '<br>AI Geo Navigators (Private) Limited · www.aigeo360.com · info@aigeo360.com</div></div>'
      + R.map((r) => '<div class="rk-pb">' + bodyOf(r.h) + '</div>').join('') + '</body></html>';
    return [200, html];
  }

  function sendHtml(res, status, html, name, engine) {
    const b = Buffer.from(html, 'utf8');
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'content-length': b.length, 'content-security-policy': engine ? CSP_ENGINE : CSP, 'x-content-type-options': 'nosniff',
      'cache-control': 'no-store', 'referrer-policy': 'no-referrer', ...(name ? { 'content-disposition': 'attachment; filename="' + name + '"' } : {}) });
    res.end(b);
  }

  /* the routes; ctx = { send, client (customer view), canWrite (operator scope or this computer's page) }; false when not ours */
  async function route(req, res, p, url, { send, client, canWrite }) {
    const q = url.searchParams, dl = q.get('download') === '1';
    if (p === '/api/reports' && req.method === 'GET') { const [s, o] = list(q, client); return send(res, s, o); }
    if (p === '/api/reports/issue' && req.method === 'POST') {
      if (!canWrite) return send(res, 403, { ok: false, error: 'operator_scope_required' });
      const r = await readJson(req); if (r.error) return send(res, 400, { ok: false, error: r.error, why: r.why });
      const [s, o] = await issue(r.body, { audience: client ? 'client' : 'operator' }); return send(res, s, o); }
    if (p === '/api/reports/pack' && req.method === 'GET') { const [s, o] = pack(q, client); return typeof o === 'string' ? sendHtml(res, s, o, dl ? 'nigraan-report-pack.html' : null) : send(res, s, o); }
    let m = /^\/api\/reports\/([^/]+)\/archive$/.exec(p);
    if (m && req.method === 'POST') { if (!canWrite) return send(res, 403, { ok: false, error: 'operator_scope_required' }); const [s, o] = archive(m[1], client); return send(res, s, o); }
    m = /^\/api\/reports\/([^/]+?)\.pdf$/.exec(p);
    if (m && req.method === 'GET') { const e = visible(m[1], client); if (!e) return send(res, 404, { ok: false, error: 'report_not_found', id: m[1] });
      let b = null; try { b = readFileSync(fileOf(e, '.pdf')); } catch (_) { b = null; } if (!b) return send(res, 404, { ok: false, error: 'report_pdf_missing', id: e.id, why: 'this report was issued before the report engine made PDFs; open its HTML' });
      res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': b.length, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'content-disposition': (dl ? 'attachment' : 'inline') + '; filename="' + e.id + '.pdf"' }); return res.end(b); }
    m = /^\/api\/reports\/([^/]+?)(\.json)?$/.exec(p);
    if (m && req.method === 'GET') {
      const e = visible(m[1], client); if (!e) return send(res, 404, { ok: false, error: 'report_not_found', id: m[1] });
      let t = null; try { t = readFileSync(fileOf(e, m[2] ? '.json' : '.html'), 'utf8'); } catch (_) { t = null; }
      if (t == null) return send(res, 404, { ok: false, error: 'report_file_missing', id: e.id });
      if (!m[2]) { if (e.engine) res.__agnClean = true;   /* v91.17.283.49 · an engine report is written clean for its view; its inline font must pass byte for byte */
        return sendHtml(res, 200, t, dl ? e.id + '.html' : null, !!e.engine); }
      let j = null; try { j = JSON.parse(t); } catch (_) { return send(res, 500, { ok: false, error: 'record_unreadable', id: e.id }); }
      return send(res, 200, j, dl ? { 'content-disposition': 'attachment; filename="' + e.id + '.record.json"' } : {}); }
    return false;
  }
  /* v91.17.283.8 · audit 16 · one entry by id (in the library or archived): its snapshot id resolves the report's analysis snapshot */
  const entry = (id) => (ID_RE.test(String(id || "")) ? index().get(id) || null : null);
  return { route, recover, retention, KEEP_DAYS, entry, storeGenerated };
}
