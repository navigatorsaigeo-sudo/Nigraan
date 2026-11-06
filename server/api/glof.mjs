/* ══ v91.17.31 · P6-10 · GLACIAL LAKES UPSTREAM OF AN ASSET ════════════════════════════════════
   GLOF was screened as a zone: a tehsil in the north was "exposed", with no lake named. This module
   names the lakes.

   v91.17.70 · SPRINT 1 · data-source option 2. The register served to customers is the OPEN register
   (data/glof-register-open.json, station-lake/scripts/glof_open_register.py):
     · lakes: Hi-MAG 2008-2017 (Chen et al. 2021, ESSD; zenodo 4275164; CC BY 4.0), 1,920 lakes in or
       draining into Pakistan-administered territory, plus 28 event sites from HMAGLOFDB (CC BY 4.0);
     · glaciers: RGI 7.0 (CC BY 4.0) terminus distance and surge flag; terrain: Copernicus DEM GLO-90;
       routing: HydroBASINS v1c level 12, EVERY lake routed to 100 km; places and dams: OpenStreetMap (ODbL);
     · susceptibility S: a logistic model on open attributes, leave-one-basin-out AUC 0.82 against
       HMAGLOFDB outbursts (the licence, attribution and model are in the file header);
     · current area: our own Sentinel-2 reads on those outlines (data/glof-lakes-live-open.json).
   v91.17.71 · CEO decision 25 Sep 2026: the national glacial-lake inventory, its satellite bulletins and our
   Sentinel-2 reads of its outlines feed customer values again (stationData(), default on). The register served is
   data/glof-register-merged.json (station-lake/scripts/lake_register_merge.py): the national inventory's 3,408
   objects, each matched to its Hi-MAG outline where one exists (and then carrying the open register's validated S),
   plus the Hi-MAG lakes and outburst sites the inventory lacks. The supplier is credited generically
   (label('lakeInventory')); its name appears only with internalNames(). NIGRAAN_STATION_DATA=0 serves the open
   register alone, as v91.17.70 did.
   v91.17.71 · APPLICABILITY: a place gets a GLOF level only where a mapped glacial lake drains into it within the
   routing distance (or lies in it). Everywhere else the answer is "No glacial lake upstream", with no level: the
   map leaves those tehsils unfilled (v91.17.70 gave all 577 tehsils a level, so Karachi carried one).

   What this is not: a failure probability for any lake, a flood-routing model, or a warning. The level
   (Low / Monitor / Watch / Act) is an evidence ladder: susceptibility gives Monitor, a precursor gives
   Watch, only an observed signal gives Act. */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stationData, internalNames, label, namedPublic } from './refmode.mjs';
import { schedule } from './scheduler.mjs';

const SITE = 'https://space4climate.gov.pk';
const UA = 'MACH-NIGRAAN/91.17.31 (local climate-risk dashboard; reads public GLOF bulletins)';

/* ── bulletin parser: two layouts seen so far (HTML table; accordion cards) ───────────────────── */
const strip = (s) => String(s || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
const ent = (s) => String(s).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;|&#8212;/g, '-').replace(/&#0?39;|&#8217;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const txt = (s) => ent(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function isoDate(s) {
  s = String(s || '').trim(); let m;
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if ((m = s.match(/(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})[\s-]+(\d{4})/))) { const mo = MON[m[2].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
}
const num = (s) => { const m = String(s || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };

export function parseBulletin(html, meta = {}) {
  const H = strip(html), rows = [], problems = [];
  let layout = null, statedTotal = null;
  const tm = txt(H).match(/(\d{2,3})\s+Total (?:Potentially Dangerous Glacial Lakes|Glacial Lakes|PDGL Locations|PGDL Locations)|Total (?:PDGL|PGDL) Locations\s+(\d{2,3})/i);
  if (tm) statedTotal = Number(tm[1] || tm[2]);
  /* a table counts only when it carries a lake id column: the May 2026 post also held a summary table without one */
  const tbl = [...H.matchAll(/<table[\s\S]*?<\/table>/gi)].map(m => m[0]).find(t => { const h = (t.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i) || [])[1] || ''; return /<t[hd][^>]*>\s*(?:<[^>]+>\s*)*(?:lake\s*)?id\b/i.test(h); });
  if (tbl) {
    layout = 'table';
    const trs = [...tbl.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c => txt(c[1])));
    const head = (trs[0] || []).map(h => h.toLowerCase());
    const col = (re) => head.findIndex(h => re.test(h));
    const cId = col(/\bid\b/), cArea = col(/^area/), cMax = col(/maximum|max/), cDate = col(/imagery date|date/), cStat = col(/status/);
    const headDate = isoDate((trs[0] || [])[cArea] || '');
    if (cId < 0 || cArea < 0) problems.push('table header not recognised: ' + JSON.stringify(trs[0] || []));
    else trs.slice(1).forEach((r, i) => {
      const id = num(r[cId]), area = num(r[cArea]);
      if (!Number.isInteger(id) || id < 1 || id > 400) { problems.push('row ' + (i + 1) + ': id ' + JSON.stringify(r[cId])); return; }
      if (area == null || area < 0 || area > 50) { problems.push('row ' + (i + 1) + ': area ' + JSON.stringify(r[cArea])); return; }
      rows.push({ id, areaKm2: area, max2025Km2: cMax >= 0 ? num(r[cMax]) : null, imageryDate: cDate >= 0 && cDate !== cArea ? isoDate(r[cDate]) || headDate : headDate,
                  status: cStat >= 0 ? r[cStat] : (area > 0 ? 'Unfrozen' : 'Frozen') });
    });
  } else if (/ID\s*\d+/.test(txt(H))) {
    layout = 'cards';
    const tokens = ent(H.replace(/<[^>]+>/g, '\u0001')).split('\u0001').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    let cur = null;
    const flush = () => { if (!cur) return; const obs = cur.obs.filter(o => o.areaKm2 != null); const last = obs[obs.length - 1];
      if (last) rows.push({ id: cur.id, areaKm2: last.areaKm2, imageryDate: last.date, max2025Km2: cur.max, status: cur.status, region: cur.region, series: cur.obs });
      else rows.push({ id: cur.id, areaKm2: null, imageryDate: null, max2025Km2: cur.max, status: cur.status, region: cur.region, series: cur.obs });
      cur = null; };
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]; let m;
      if ((m = t.match(/^ID\s*(\d+)$/))) { flush(); cur = { id: Number(m[1]), region: tokens[i + 1] || null, status: tokens[i + 3] || null, obs: [], max: null }; i += 3; continue; }
      if (!cur) continue;
      if (/max/i.test(t) && /\d{4}/.test(t)) { const v = tokens[i + 1]; cur.max = /sq\.?\s*km/i.test(v || '') ? num(v) : null; i++; continue; }
      const d = isoDate(t);
      if (d && i + 1 < tokens.length) { const v = tokens[i + 1]; if (v === '-' || /sq\.?\s*km/i.test(v)) { cur.obs.push({ date: d, areaKm2: v === '-' ? null : num(v) }); i++; continue; } }
      if (/^(Satellite Images|Summary)/i.test(t)) flush();
    }
    flush();
  } else problems.push('no lake table or lake cards found');
  const ids = rows.map(r => r.id), maxId = ids.length ? Math.max(...ids) : 0;
  /* the 131-lake set (June 2026 onward) is the one the SUPARCO points carry; the older 84-lake list is not */
  const joinable = (statedTotal != null && statedTotal >= 100) || maxId > 84;
  return { postId: meta.id || null, slug: meta.slug || null, title: meta.title || null, published: meta.date || null, link: meta.link || null,
           layout, statedTotal, rows, problems, joinable,
           joinNote: joinable ? 'IDs match the 131-lake national list' : 'older lake list (IDs do not match the 131-lake set); shown, not joined' };
}

/* v91.17.93 audit A3-7: the lapse rate comes from data/lapse-table.json (46 valley stations, fitted gamma agrees with the
   provider's -6.51 C/km within the month-to-month spread), not a literal */
let _LAPSE = null;
function LAPSE() { if (_LAPSE == null) { try { const j = JSON.parse(readFileSync(join(process.cwd(), 'data', 'lapse-table.json'), 'utf8')); _LAPSE = Number.isFinite(j.providerLapseAsApplied_c_per_km) ? j.providerLapseAsApplied_c_per_km / 1000 : -6.5 / 1000; } catch (_) { _LAPSE = -6.5 / 1000; } } return _LAPSE; }
export function createGlof(app) {
  const dataDir = () => app.dataDir || join(process.cwd(), 'data');
  /* ══ v91.17.70 · SPRINT 1 · OPEN REGISTER BY DEFAULT (data-source option 2) ═══════════════════
     Customer outputs use only MACH stations and openly licensed data. The v91.17.31 register (PMD 2024
     outlines, SUPARCO list and bulletins) is internal reference only and is served only with
     NIGRAAN_INTERNAL_REF=1. By default every file below is the open one, built by
     station-lake/scripts/glof_open_register.py (Hi-MAG CC BY 4.0, RGI 7.0 CC BY 4.0, HMAGLOFDB CC BY 4.0,
     Copernicus DEM, HydroBASINS, OpenStreetMap ODbL) and station-lake/scripts/lake_monitor.py (our own
     Sentinel-2 reads on the open outlines). Licence and attribution sit in each file's header. */
  /* v91.17.71 · two switches (server/api/refmode.mjs): stationData() decides which DATA is used (default: the merged
     register, the inventory's Sentinel-2 reads and the bulletins); internalNames() decides only whether the supplier is
     NAMED (bulletin titles and links, the list's own ids). The merged register is used when it is installed; without it
     the open register serves, so a data directory from v91.17.70 still answers. */
  const SD = stationData(), NAMES = internalNames();
  /* decided on first use, once app.dataDir is known (it is set after this module is created) */
  let MERGED = false, FILES = null, LIVE_FILES = null, MODE = null;
  function init() {
    if (MODE && FILES) return;
    const m = SD && existsSync(join(dataDir(), 'glof-register-merged.json'));
    MERGED = m;
    /* v91.17.275 HAZ2 · owner (30 Sep, 17 Oct): SUPARCO's lake inventory is more current than the 2024 national inventory. The
       register built on it where it is newer (scripts/glof_suparco_update.py: SUPARCO areas for the 2,599 matched lakes with S
       recomputed by the same fitted model, 808 SUPARCO lakes the register lacked added and routed) is read first;
       NIGRAAN_GLOF_SUPARCO=0 or a missing file falls back to the merged register. */
    const cur = m && process.env.NIGRAAN_GLOF_SUPARCO !== '0' && existsSync(join(dataDir(), 'glof-register-current.json'));
    FILES = m ? { reg: cur ? 'glof-register-current.json' : 'glof-register-merged.json', bas: 'glof-basins-merged.json', ter: 'glof-terrain-merged.json', evt: 'glof-events-merged.json' }
              : { reg: 'glof-register-open.json', bas: 'glof-basins-open.json', ter: 'glof-terrain-open.json', evt: 'glof-events-open.json' };
    LIVE_FILES = m ? [['inventory', 'glof-lakes-live.json'], ['open', 'glof-lakes-live-open.json']] : [['open', 'glof-lakes-live-open.json']];
    MODE = m ? 'merged' : 'open';
    if (!app.dataDir) MODE = null;   /* not final until the data directory is known */
  }
  /* our own Sentinel-2 reads: of the inventory outlines (lake_monitor.py --register pmd) and of the Hi-MAG outlines (default run).
     A lake is looked up by the ids it carries (liveIds); a file is used only when its radiometry pre-flight passed (v91.17.70 guard, board S16),
     so a read from before the guard never reaches a customer value. */
  let REG = null, BAS = null, BUL = null;
  const LV = {}; let LIVE_MTIME = 0;
  function liveFile(k, f) {
    try { const p = join(dataDir(), f); if (!existsSync(p)) { LV[k] = { V: false, mt: 0 }; return false; }
      const mt = statSync(p).mtimeMs; if (LV[k] && LV[k].mt === mt) return LV[k].V;
      let V = JSON.parse(readFileSync(p, 'utf8')); if (!(V && V.preflight && V.preflight.passed)) V = false;
      LV[k] = { V, mt }; NAT = null; return V; } catch (_) { LV[k] = { V: false, mt: 0 }; return false; }
  }
  /* v91.17.144 · B5 · lives() ran an existsSync + statSync per live file for every lake on every call (0.9 s of the national layer
     on this server, several seconds on the laptop); the files are now looked at on disk at most every 5 s */
  let LIVES_C = null, LIVES_AT = 0;
  function lives() { if (LIVES_C && Date.now() - LIVES_AT < 5000) return LIVES_C; LIVES_C = livesNow(); LIVES_AT = Date.now(); return LIVES_C; }
  function livesNow() { init(); const out = []; let s = 0; for (const [k, f] of LIVE_FILES) { const V = liveFile(k, f); s += (LV[k] && LV[k].mt) || 0; if (V) out.push({ k, V }); } LIVE_MTIME = s; return out; }
  /* one combined view for the status blocks: the newest file's dates, counts summed */
  function live() {
    const L = lives(); if (!L.length) return false; if (L.length === 1) return L[0].V;
    const sum = (key) => { const o = {}; L.forEach(({ V }) => Object.entries(V[key] || {}).forEach(([a, b]) => { o[a] = (o[a] || 0) + b; })); return o; };
    const newest = L.map(x => x.V).sort((a, b) => String(b.built).localeCompare(String(a.built)))[0];
    return { ...newest, counts: sum('counts'), changeCounts: sum('changeCounts'), measured: L.reduce((s, x) => s + (x.V.measured || 0), 0), total: L.reduce((s, x) => s + (x.V.total || 0), 0),
             surge: { count: L.reduce((s, x) => s + ((x.V.surge && x.V.surge.count) || 0), 0) }, lakes: null, files: L.map(x => x.k) };
  }
  function liveRec(L) {
    for (const { k, V } of lives()) { const id = L.liveIds ? L.liveIds[k] : (k === 'open' ? L.id : null); if (id && V.lakes && V.lakes[id]) return { v: V.lakes[id], V }; }
    return null;
  }
  function liveOf(L) { const r = liveRec(L); return r ? r.v : null; }
  /* surge: every register carries the RGI 7.0 surge flag per lake (it is a term of S) */
  function surgeOf(L) { if (L.surge !== undefined) return L.surge || null; const v = liveOf(L); return v && v.surge ? v.surge : null; }
  function effectiveTier(L) { return L.tier; }
  /* v91.17.70 · tier names: "Watch" means one thing now (the level), so the second tier is Elevated (board C5) */
  /* v91.17.275 HAZ2 · owner: tier words only Normal / Low / Moderate / High / Severe in the client view. A lake's screening tier is
     shown as its susceptibility word: tier 1 (S at or above the Priority cut, or SUPARCO's dangerous-lake list) High, tier 2 Moderate,
     tier 3 Low (register rules 1-3; the numeric tier stays in the payload). */
  const TIER_LABEL = ['', 'High', 'Moderate', 'Low'];
  const tierLabel = (t) => TIER_LABEL[t] || 'Low';
  /* the five-word level of each rung of the evidence ladder, as the served map and hazard engine already show it (page AGN.hz5.catLevel:
     Low "Normal", Monitor "Susceptible (standing, not a forecast)" -> Normal, Watch -> High, Act -> Severe). Ladder codes stay as
     machine codes (class); every customer sentence uses the word. */
  /* v91.17.283.13 · audit B10 · ONE CLASS-TO-LEVEL TABLE: the ladder word comes from data/hazard-scale.json glofLadder, the table the
     issued map level reads too (hazsci.mjs); it was a second copy here (Monitor -> Normal) while hazard-scale.json's operationalLadder said
     Monitor -> Moderate. A missing table gives no word (never a guess). */
  let LW = null, LWt = 0;
  const ladder = () => { try { const f = join(dataDir(), 'hazard-scale.json'); const mt = statSync(f).mtimeMs; if (!LW || mt !== LWt) { LW = JSON.parse(readFileSync(f, 'utf8')).glofLadder || null; LWt = mt; } } catch (_) { LW = null; } return LW; };
  /* v91.17.283.47 · NIGRAAN 1.0.8 item 1 · GLOF IS SITE CONTEXT, NOT A LEVEL. The class ladder (Monitor / Watch / Act -> Normal / High /
     Severe) rests on the untested monitor sum and tier cuts (C-now 1: insufficient data, withheld) and no dynamic trigger has passed (the
     rise-rate watch failed 1 Nov): no class carries a level word, so no report row, AI answer, alert or count reads lake susceptibility as a
     hazard level. NIGRAAN_GLOF_LEVEL_WORDS=1 restores the 1.0.7 words (only with a tested trigger). */
  const wordOf = (c) => { if (process.env.NIGRAAN_GLOF_LEVEL_WORDS !== '1') return null; const L = ladder(); return (c && L && L[c]) || null; };
  const state = { lastFetchAt: null, lastOkAt: null, lastError: null, running: false };
  /* v91.17.166 · the lake check (station-lake/scripts/lake_relevance.py -> data/glof-lake-relevance.json): a lake whose 100 km route
     never enters Pakistan (23 lakes just across the Afghan and Chinese borders, filed under the nearest tehsil) or that is not a
     glacial lake (beyond the Hi-MAG 10 km glacier rule, or mapped as a reservoir / pond such as Satpara) is taken out of the
     routing, the levels and the map; it stays readable by id with the reason. Glacial lakes with no populated place on their
     100 km route stay in, marked. */
  function reg() { init(); if (REG === null) { try { REG = JSON.parse(readFileSync(join(dataDir(), FILES.reg), 'utf8'));
      let RV = null; try { RV = JSON.parse(readFileSync(join(dataDir(), 'glof-lake-relevance.json'), 'utf8')); } catch (_) {}
      if (RV && RV.lakes) { const keep = [], out = [];
        for (const L of REG.lakes) { const r = RV.lakes[L.id]; if (r) L.relevance = { class: r.class, why: r.why, placesDownstream: r.placesDownstream, builtCells1km: r.builtCells1km };
          (r && (r.class === 'outside' || r.class === 'not-glacial') ? out : keep).push(L); }
        REG.lakes = keep; REG.excluded = out; REG.relevance = { version: RV.version, built: RV.built, rule: RV.rule, counts: RV.counts }; }
      /* v91.17.168 · documented corrections to register fields (data/glof-lake-corrections.json), each with its source */
      try { const CO = JSON.parse(readFileSync(join(dataDir(), 'glof-lake-corrections.json'), 'utf8')).lakes || {};
        for (const L of REG.lakes) { const c = CO[L.id]; if (!c) continue; L.registerDam = L.dam; L.registerLakeType = L.lakeType;
          if (c.dam) L.dam = c.dam; if (c.lakeType) L.lakeType = c.lakeType; if (c.name && !L.name) L.name = c.name; L.correction = { note: c.note || null, source: c.source || null }; } } catch (_) {}
    } catch (e) { REG = false; state.lastError = 'register not readable: ' + e.message; } } return REG; }
  function basins() { init(); if (BAS === null) { try { BAS = JSON.parse(readFileSync(join(dataDir(), FILES.bas), 'utf8')); BAS.features.forEach(f => { f.bbox = bboxOf(f.geometry); }); } catch (_) { BAS = false; } } return BAS; }
  function bul() { if (BUL === null) { try { BUL = JSON.parse(readFileSync(join(dataDir(), 'glof-bulletins.json'), 'utf8')); } catch (_) { BUL = { bulletins: [] }; } } return BUL; }
  function saveBul() { try { writeFileSync(join(dataDir(), 'glof-bulletins.json'), JSON.stringify(BUL, null, 1)); } catch (_) {} }
  /* every threshold from the register's params block (source, method, status, date); the internal register predates it,
     so its fallbacks are the v91.17.37 constants and apply only under NIGRAAN_INTERNAL_REF=1 */
  const PDEF = { weatherMaxAgeH: 12, precursorMaxDays: 120, monitorE: 0.2, recurrenceYears: 6, reachKm: { priority: 40, elevated: 25, inventory: 15 }, dilutionKm2: [2000, 20000], dropMPerKm: [5, 30], reachActMin: 0.25, meltScaleC: 3, rainScaleMm: [10, 60], eventReportDays: 14, joinKm: 3 };
  function param(k) { const R = reg(); const p = R && R.params && R.params[k]; return p && p.value != null ? p.value : PDEF[k]; }

  const inRing = (x, y, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; };
  const inPoly = (x, y, g) => { const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    return polys.some(p => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h))); };
  const bboxOf = (g) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; polys.forEach(p => p[0].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); })); return [x0, y0, x1, y1]; };
  const kmTo = (a, b, c, d) => { const R = 6371, rr = Math.PI / 180, x = Math.sin((c - a) * rr / 2) ** 2 + Math.cos(a * rr) * Math.cos(c * rr) * Math.sin((d - b) * rr / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

  /* index: basin id -> [{lake, km}] */
  let IDX = null;
  function index() {
    if (IDX) return IDX; const R = reg(); IDX = new Map(); if (!R) return IDX;
    R.lakes.forEach(L => (L.route || []).forEach(([b, km]) => { const k = String(b); if (!IDX.has(k)) IDX.set(k, []); IDX.get(k).push({ L, km }); }));
    return IDX;
  }
  function basinAt(lat, lon) { const B = basins(); if (!B) return null; for (const f of B.features) { const bb = f.bbox; if (bb && (lon < bb[0] || lon > bb[2] || lat < bb[1] || lat > bb[3])) continue; if (inPoly(lon, lat, f.geometry)) return f; } return null; }

  /* latest joinable bulletin observation for a listed lake (national list id), and its series; the bulletin's title and link name
     the supplier, so they travel only with internalNames() */
  function observations(sid) {
    const out = [];
    (bul().bulletins || []).filter(b => b.joinable).forEach(b => b.rows.filter(r => r.id === sid).forEach(r => out.push({ bulletin: b.published ? b.published.slice(0, 10) : null, ...(namedPublic('SUPARCO') ? { title: b.title, link: b.link } : {}),
      areaKm2: r.areaKm2, max2025Km2: r.max2025Km2, imageryDate: r.imageryDate, status: r.status })));
    return out.sort((a, b) => String(a.imageryDate || a.bulletin).localeCompare(String(b.imageryDate || b.bulletin)));
  }
  function latestJoinable() { init(); if (!MERGED) return null; const J = (bul().bulletins || []).filter(b => b.joinable).sort((a, b) => String(a.published).localeCompare(String(b.published))); return J[J.length - 1] || null; }
  const listOf = (L) => L.listed || L.suparco || null;
  /* ── our own Sentinel-2 read of the lake (lake_monitor.py) ──
     v91.17.70 · "expanding" (buffer area >= 1.15 x outline) is retired: all 122 cases were buffer artefacts (board S3).
     Growth and drainage are the monitor's in-outline change against the lake's own earlier reads of ONE method, with the
     threshold measured from same-day two-tile pairs (p90); the rule and its numbers are in the live file (rules.change). */
  function measured(L) {
    const lr = liveRec(L); if (!lr) return null; const v = lr.v, V = lr.V;
    if (!v.latest) return v.state === 'read-failed' ? { state: 'not-measured', readFailed: true, text: 'the Sentinel-2 reads for this lake failed on this machine', window: V && V.window }
                                                    : { state: 'not-measured', text: 'no clear Sentinel-2 scene in the monitor window (cloud, shadow or ice)', window: V && V.window };
    const m = v.latest, ol = v.outlineKm2 != null ? v.outlineKm2 : v.pmd2024Km2;
    const st = v.state === 'expanding' ? 'within' : v.state;   /* internal file from before v91.17.70: the retired buffer rule reads as a plain measurement */
    const ch = v.change && v.change.state ? v.change : null;
    const txt = { within: `Sentinel-2 area ${m.areaKm2} km² on ${m.date} (outline ${ol} km²)`,
      'not-visible': `open water on the kept scenes (median, ${m.date}) is ${m.areaKm2} km² against a ${ol} km² outline: dry, drained, ice-covered or in terrain shadow` }[st] || st;
    const chText = ch && ch.state === 'growing' ? `growing: ${ch.latestKm2} km² inside the outline on ${ch.latestDates[1]}, above its own baseline ${ch.baselineKm2} km² by ${Math.round(100 * Math.min(...ch.relChange))}% or more on two dates (threshold ${Math.round(100 * ch.growT)}%, same-day two-tile p90)`
      : ch && ch.state === 'draining' ? `draining: ${ch.latestKm2} km² inside the outline on ${ch.latestDates[1]}, ${Math.round(-100 * Math.max(...ch.relChange))}% or more below its own baseline ${ch.baselineKm2} km² on two dates`
      : ch && ch.state === 'stable' ? `stable against its own reads (baseline ${ch.baselineKm2} km²)` : null;
    return { state: st, text: txt, change: ch, changeText: chText, areaKm2: m.areaKm2, areaInOutlineKm2: m.areaInOutlineKm2, date: m.date, scene: m.scene, valid: m.valid, ratio: v.ratio, outlineKm2: ol, method: m.method || null,
             series: (v.series || []).map(x => ({ date: x.date, areaKm2: x.areaKm2, areaInOutlineKm2: x.areaInOutlineKm2, valid: x.valid, method: x.method || null })) };
  }
  function condition(L) {
    const m = measured(L), sg = surgeOf(L);
    const c = (MERGED && listOf(L)) ? conditionBulletin(L) : { state: 'not-read', text: 'not yet read by the Sentinel-2 monitor; its level comes from its susceptibility' };
    if (m) c.measured = m;
    if (sg) c.surge = sg;
    if (m && m.change && (m.change.state === 'growing' || m.change.state === 'draining')) { c.state = m.change.state; c.text = m.changeText; }
    else if (m && m.state !== 'not-measured' && ['not-read', 'not-monitored', 'no-bulletin', 'frozen-or-not-measured'].includes(c.state)) { c.state = 'measured-' + m.state; c.text = m.text + (m.changeText ? '; ' + m.changeText : ''); }
    else if (m && m.state === 'not-measured' && c.state === 'not-read') { c.state = 'not-measured'; c.text = m.text; }
    return c;
  }
  function conditionBulletin(L) {
    /* v91.17.71 · bulletin areas feed the lake's condition again (customer output); the wording names no supplier. A bulletin
       exceedance is condition text only: it is not a Watch precursor, because the bulletins' own 2025 maxima move between
       issues (audit/research/space4climate_vs_register.md D6) [read]. */
    const S = listOf(L); if (!S) return { state: 'not-monitored', text: 'not on the national potentially-dangerous list, so no satellite bulletin covers it' };
    const lb = latestJoinable(); const obs = observations(S.sid); const last = obs[obs.length - 1] || null;
    const inLatest = lb && lb.rows.some(r => r.id === S.sid);
    let max2025 = null; for (const o of obs) if (o.max2025Km2 != null) max2025 = o.max2025Km2;
    if (!last) return { state: 'no-bulletin', text: 'on the national list; no 2026 satellite bulletin carries an area for it', series: obs };
    const a = last.areaKm2, ol = L.areaRegisterKm2 != null ? L.areaRegisterKm2 : L.areaKm2;   /* v91.17.275 · the outline area of the register (SUPARCO's current area may now sit in areaKm2) */
    const above25 = a != null && max2025 != null && a > max2025, aboveOl = a != null && ol != null && a > ol;
    let st = a == null ? 'frozen-or-not-measured' : max2025 == null ? 'no-2025-baseline' : (above25 && (aboveOl || ol == null)) ? (ol == null ? 'above-2025-max' : 'above-both-baselines') : above25 ? 'above-2025-max-within-2024' : 'within';
    const txt2 = { 'above-both-baselines': 'latest bulletin area above both its 2025 maximum and the 2024 inventory outline',
      'above-2025-max': 'latest bulletin area above its 2025 maximum (no inventory outline to compare)',
      'above-2025-max-within-2024': 'latest bulletin area above its 2025 maximum, within the 2024 inventory outline',
      'within': 'latest bulletin area within its 2025 maximum', 'no-2025-baseline': 'latest bulletin area ' + a + ' km²; the bulletins publish no 2025 maximum for this lake', 'frozen-or-not-measured': 'frozen or not measured in the latest bulletin imagery' }[st];
    return { state: st, text: txt2, textBulletin: txt2, areaKm2: a, max2025Km2: max2025, inventory2024Km2: ol, imageryDate: last.imageryDate, bulletin: last.bulletin,
             inLatestBulletin: !!inLatest, latestBulletin: lb ? lb.published.slice(0, 10) : null, series: obs,
             stale: !inLatest ? 'not in the latest bulletin (' + (lb ? lb.published.slice(0, 10) : '–') + ')' : null };
  }
  const nameOf = (L) => L.name || (listOf(L) && listOf(L).name) || ('unnamed lake ' + L.id + (L.settlement ? ' near ' + L.settlement : L.nullah ? ', ' + L.nullah : L.tehsil ? ', ' + L.tehsil : ''));
  function brief(L, km) {
    const c = condition(L);
    const tier = effectiveTier(L), ls = listOf(L);
    return { id: L.id, name: nameOf(L), tier, tierLabel: tierLabel(tier), tierRegister: L.tier, tierRule: L.tierBasis || null, kmAlong: km, lat: L.lat, lon: L.lon,
      tehsil: L.tehsil, district: L.district, areaKm2: L.areaKm2, areaSource: L.areaSource || 'register', ...(L.areaRegisterKm2 != null ? { areaRegisterKm2: L.areaRegisterKm2 } : {}), dam: L.dam, lakeType: L.lakeType, glacierType: L.glacierType, glacierDistM: L.glacierDistM, elevApproxM: L.elevApproxM,
      susceptibility: sOf(L), documentedEvents: L.events || null,
      /* the national list is data (kept, generic key); the supplier's own ids and names only with internalNames() */
      listed: ls ? { id: ls.sid, status: ls.status || 'listed, status not given', sensor: !!ls.sensor, district: ls.district } : null,
      ...(NAMES ? { suparco: ls ? { id: ls.sid, status: ls.status || 'listed, status not given', sensor: !!ls.sensor, district: ls.district } : null, liveIds: L.liveIds || null, internal: L.internal || null } : {}),
      settlement: L.settlement, settlementDistM: L.settlementDistM, ...(L.correction ? { correction: L.correction } : {}), damsDownstream: L.damsDownstream || [], condition: c, source: L.src, origin: L.origin || null,
      ...(L.relevance ? { peopleDownstream: L.relevance.placesDownstream > 0 ? 'populated places on the 100 km route: ' + L.relevance.placesDownstream : 'no populated place on its 100 km route', inSettlement: L.relevance.builtCells1km > 0 } : {}) };
  }

  /* ══ v91.17.70 · SPRINT 1 · THE GLOF LEVEL: Low / Monitor / Watch / Act (board C5, C6, S1-S3) ═══════════════
     "Clear" is retired: a place with no mapped lake upstream, or whose upstream lakes add up to little, is Low, a
     level, not a claim of absence. The level is an evidence ladder, not an index:
       Monitor  the upstream lakes' susceptibility, summed over EVERY lake that drains here (the tier-3 skip is gone):
                E = sum of S x R, with S the lake's susceptibility and R its reach to this basin, at or above
                params.monitorE (the S of the lowest Elevated lake at the lake itself).
       Watch    a slow precursor at a lake within reach (R >= params.reachActMin): measured growth from our own
                Sentinel-2 reads (in-outline, same method, above the same-day two-tile p90 on two dates), or a
                documented outburst within params.recurrenceYears. A precursor never gives more than Watch.
       Act      only an observed signal at a lake within reach: a measured drainage from our own reads, or a
                confirmed event report (data/glof-event-reports.json), younger than params.eventReportDays.
     The meteorological trigger (melt, rain) is a modifier printed beside the level ("trigger loaded"); it never
     raises the level, and the catchment heavy-rain gate on Act is removed with it (board C8: in one change).
     Melt is the forecast system's own anomaly (ECMWF EC46 week against its re-forecast climate), never the ERA5
     absolute gap, which was measuring ERA5's cold bias (board S2: +3.9 °C median at lake units). */
  let TER = null;
  function terrain() { init(); if (TER === null) { try { TER = JSON.parse(readFileSync(join(dataDir(), FILES.ter), 'utf8')); } catch (_) { TER = false; } } return TER; }
  const physOn = () => process.env.NIGRAAN_GLOF_PHYS !== '0' && !!terrain();
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  let WX = { runId: null, at: 0, rec: new Map() };
  function weatherIndex() {
    try {
      const runs = (app.store.all('runs') || []).filter(r => r.unit_level === 'tehsil' && ['complete', 'partial'].includes(r.status) && !r.records_pruned).sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at));
      const run = runs[0]; if (!run) return WX;
      /* v91.17.149 · audit D8 · a forecast run older than params.weatherMaxAgeH (an operating rule: the melt and rain trigger reads the next 72 h)
         no longer modifies any level; the run id, its time and the reason are shown */
      const ageH = (Date.now() - Date.parse(run.completed_at)) / 3600e3;
      if (!(ageH <= param('weatherMaxAgeH'))) { WX = { runId: run.run_id, at: Date.parse(run.completed_at), rec: new Map(), stale: true, why: 'the newest forecast run is ' + Math.round(ageH) + ' h old (limit ' + param('weatherMaxAgeH') + ' h): the melt and rain modifier is off' }; return WX; }
      if (WX.runId === run.run_id && !WX.stale) return WX;
      const m = new Map(); app.store.filter('records', x => x.runId === run.run_id).forEach(r => m.set(r.unitKey, r));
      WX = { runId: run.run_id, at: Date.parse(run.completed_at), rec: m };
    } catch (_) {}
    return WX;
  }
  /* the forecast system's own anomaly for the next week at the lake's tehsil: ECMWF EC46 against its re-forecast climate */
  function modelAnomaly(unitUid) {
    try {
      const s = app.outlook && app.outlook.seasonalUnit ? app.outlook.seasonalUnit(unitUid) : null;
      const w = s && s.subseasonal && (s.subseasonal.weeks || [])[0];
      if (w && w.tAnom != null) return { tAnomC: w.tAnom, week: [w.start, w.end], shareAbove1C: w.pT1 != null ? w.pT1 : null, at: s.at, basis: 'ECMWF EC46 week anomaly against the model’s own re-forecast climate (bias cancels by construction)' };
    } catch (_) {}
    return null;
  }
  function trigger(L) {
    /* melt, rain and growth at the lake: a MODIFIER of the level, never its cause */
    const out = { weatherMissing: false, melt: 0, rain: 0, growth: 0, pdd: null, freezingShare: null, rain72: null, lakeElevM: null, servedElevM: null, source: null, meltAnomC: null, meltBasis: null };
    const W = weatherIndex(); const r = W.rec.get(L.unitUid); const te = terrain(); const t = te && te.lakes ? te.lakes[L.id] : null;
    const zL = t && t.lakeElevDemM != null ? t.lakeElevDemM : L.elevApproxM; out.lakeElevM = zL;
    const m = measured(L);
    if (m && m.change && m.change.state === 'growing') out.growth = 1;
    const an = modelAnomaly(L.unitUid);
    if (!(r && r.hourly && Array.isArray(r.hourly.time))) { out.weatherMissing = true; out.weatherWhy = W.why || 'no forecast record for this tehsil in the newest run'; }
    if (r && r.hourly && Array.isArray(r.hourly.time)) {
      const H = r.hourly, zS = r.resolvedElevationM; out.servedElevM = zS; out.source = W.runId;
      const T = H.temperature_2m || [], P = H.precipitation || [], SN = H.snowfall || null, F = H.freezing_level_height || [];
      const n = Math.min(T.length, H.time.length, 5 * 24);
      if (zL != null && zS != null && n) {
        /* positive degree-days at the lake height from the served forecast (context only); the melt TERM is the model anomaly below */
        const lapse = LAPSE(); let pdd = 0, days = 0, above = 0, fh = 0, tsum = 0;
        for (let d = 0; d * 24 < n; d++) {
          let s = 0, k = 0; for (let h = d * 24; h < Math.min(n, d * 24 + 24); h++) { if (T[h] == null) continue; s += T[h] + lapse * (zL - zS); k++; }
          if (k < 12) continue; const tl = s / k; pdd += Math.max(0, tl); days++; tsum += tl;
        }
        for (let h = 0; h < n; h++) if (F[h] != null) { fh++; if (F[h] > zL) above++; }
        out.pdd = Math.round(pdd * 10) / 10; out.days = days; out.meanLakeC = days ? Math.round(tsum / days * 10) / 10 : null; out.freezingShare = fh ? Math.round(100 * above / fh) / 100 : null;
      }
      const rs = param('rainScaleMm');
      /* v91.17.157 · audit: liquid rain (precipitation minus snowfall water at the provider's 0.7 cm -> mm ratio), and the 72-h total
         needs all 72 hours; it accepted 48 (a third under-read) and counted snow as rain. A run without snowfall withholds the term. */
      let r72 = 0, k72 = 0; for (let h = 0; h < Math.min(P.length, 72); h++) { const sn = SN ? SN[h] : null; if (P[h] != null && sn != null) { r72 += Math.max(0, P[h] - sn / 0.7); k72++; } }
      if (k72 === 72) { out.rain72 = Math.round(r72); out.rain = clamp01((r72 - rs[0]) / (rs[1] - rs[0])); }
      else out.rainWhy = SN ? 'the run holds ' + k72 + ' of the 72 hours with rain and snowfall; the rain term is withheld' : 'the run carries no snowfall, so liquid rain cannot be separated; the rain term is withheld';
    }
    if (an && out.freezingShare != null) {
      out.meltAnomC = an.tAnomC; out.melt = clamp01(an.tAnomC / param('meltScaleC')) * out.freezingShare;
      out.meltBasis = an.basis + `, week ${an.week[0]}; scaled 1 at +${param('meltScaleC')} °C, times the share of hours the model freezing level is above the lake`;
    } else { out.melt = 0; out.meltBasis = an ? 'melt term off: no freezing-level hours at the lake in the current run' : 'melt term off: the forecast system’s own re-forecast anomaly is not loaded for this tehsil (the ERA5 absolute normal is never used)'; }
    out.window = 'the hours the tehsil record holds (73 h, three days) at the lake height; melt from the EC46 week anomaly';
    return out;
  }
  function susceptibility(L) {
    /* internal register only: the v91.17.37 hand-weighted S (the open register carries a fitted S per lake) */
    const te = terrain(); const t = te && te.lakes ? te.lakes[L.id] : null;
    const dam = { ice: 1.0, 'ice-moraine': 1.0, moraine: 0.9, mixed: 0.7, bedrock: 0.3, erosion: 0.5 }[L.dam] ?? 0.6;
    const gd = L.glacierDistM; const contact = gd == null ? 0.5 : gd <= 200 ? 1.0 : gd <= 1000 ? 0.7 : gd <= 3000 ? 0.4 : 0.2;
    const area = L.areaKm2 == null ? 0.5 : L.areaKm2 >= 0.2 ? 1.0 : L.areaKm2 >= 0.05 ? 0.8 : L.areaKm2 >= 0.02 ? 0.6 : 0.4;
    const relief = t && t.relief1kmM != null ? clamp01((t.relief1kmM - 200) / 500) : 0.5;
    const slope = t && t.slope1kmDeg != null ? clamp01((t.slope1kmDeg - 10) / 20) : 0.5;
    const glac = { crevassed: 1.0, hanging: 1.0, fluctuating: 0.9, stable: 0.6, none: 0.3 }[L.glacierType] ?? 0.5;
    const sg = surgeOf(L) ? 1.0 : 0;
    const S = clamp01(0.25 * dam + 0.2 * contact + 0.15 * area + 0.15 * (0.5 * relief + 0.5 * slope) + 0.15 * glac + 0.1 * sg + (L.tier === 1 ? 0.1 : 0));
    return { S: Math.round(S * 100) / 100, dam: L.dam, glacierDistM: gd, areaKm2: L.areaKm2, relief1kmM: t ? t.relief1kmM : null, slope1kmDeg: t ? t.slope1kmDeg : null, glacierType: L.glacierType, surge: !!sg, basis: 'v91.17.37 expert weights (internal reference)' };
  }
  function sOf(L) {
    if (L.S == null) return susceptibility(L);
    const te = terrain(); const t = te && te.lakes ? te.lakes[L.id] : null;
    /* v91.17.101 · audit C / registry L3 · the ladder reads the MODEL's own susceptibility (sModel). The register's S carries the
       outburst record written over it (a repeat probability 0.30-0.75 for the 50 documented lakes), and that record is also the model's
       training label: every Watch on the map came from it. The written-over value stays on the record as sWithHistory. */
    const _sm = (L.sModel != null && isFinite(L.sModel)) ? L.sModel : L.S;
    return { S: _sm, sWithHistory: L.S, sModel: L.sModel ?? null, percentile: L.sPct ?? null, dam: L.dam, lakeType: L.lakeType, glacierDistM: L.glacierDistM, areaKm2: L.areaKm2, relief1kmM: t ? t.relief1kmM : null, slope1kmDeg: t ? t.slope1kmDeg : null,
             surge: !!surgeOf(L), basis: L.tierBasis || 'logistic susceptibility on open attributes (register model block; leave-one-basin-out validated)' };
  }
  function reach(L, basinId, km) {
    const te = terrain(); const b = te && te.basins ? te.basins[String(basinId)] : null; const t = te && te.lakes ? te.lakes[L.id] : null;
    const rk = param('reachKm'), tier = effectiveTier(L); const Lc = tier === 1 ? rk.priority : tier === 2 ? rk.elevated : rk.inventory;
    const dist = Math.exp(-km / Lc);
    const up = b && b.up != null ? b.up : null; const [d0, d1] = param('dilutionKm2');
    const dilution = up == null ? 1 : up <= d0 ? 1 : up >= d1 ? 0 : 1 - (Math.log(up) - Math.log(d0)) / (Math.log(d1) - Math.log(d0));
    const drop = (b && b.repElevM != null && t && t.lakeElevDemM != null && km > 1) ? (t.lakeElevDemM - b.repElevM) / km : null; const [s0, s1] = param('dropMPerKm');
    const slopeF = drop == null ? 0.85 : clamp01(0.6 + 0.4 * clamp01((drop - s0) / (s1 - s0)));
    return { R: Math.round(dist * dilution * slopeF * 1000) / 1000, km, dist: Math.round(dist * 100) / 100, upKm2: up, dilution: Math.round(dilution * 100) / 100, dropMPerKm: drop == null ? null : Math.round(drop), slopeFactor: Math.round(slopeF * 100) / 100 };
  }
  /* event reports: operator-confirmed observations of an outburst (data/glof-event-reports.json, rows {lakeId | lat+lon, date, source, confirmed}) */
  let REP = null, REP_MT = 0, REP_AT = 0;
  function reports() {
    /* v91.17.233 · the file is checked on disk at most every 30 s (the laptop profile: existsSync/statSync on every call, 8 s in 150 s) */ 
    if (REP_AT && Date.now() - REP_AT < 30e3) return REP || []; REP_AT = Date.now();
    try { const f = join(dataDir(), 'glof-event-reports.json'); if (!existsSync(f)) return []; const mt = statSync(f).mtimeMs; if (REP && mt === REP_MT) return REP;
      const j = JSON.parse(readFileSync(f, 'utf8')); REP = (j.reports || []).filter(x => x && x.confirmed === true && x.date); REP_MT = mt; NAT = null; return REP; } catch (_) { return []; }
  }
  const ageDays = (iso) => iso ? (Date.now() - Date.parse(String(iso).slice(0, 10) + 'T12:00:00Z')) / 86400e3 : Infinity;
  function lastEventYear(L) { if (L.events && L.events.lastYear) return L.events.lastYear; const e = eventsFor(L.id); return e && e.lastYear ? e.lastYear : null; }
  function signals(L) {
    const out = { act: null, precursor: null };
    const days = param('eventReportDays'), jk = param('joinKm');
    const m = measured(L);
    if (m && m.change && m.change.state === 'draining' && ageDays(m.change.latestDates && m.change.latestDates[1]) <= days) out.act = { kind: 'measured-drainage', date: m.change.latestDates[1], text: 'measured drainage of ' + nameOf(L) + ': ' + m.changeText };
    const rp = reports().filter(x => ageDays(x.date) <= days && (x.lakeId === L.id || (x.lakeId == null && Number.isFinite(x.lat) && Number.isFinite(x.lon) && kmTo(x.lat, x.lon, L.lat, L.lon) <= jk)));
    if (rp.length) out.act = { kind: 'event-report', date: rp[0].date, text: 'confirmed outburst report at ' + nameOf(L) + ' on ' + rp[0].date + (rp[0].source ? ' (' + rp[0].source + ')' : '') };
    /* v91.17.147 · audit hazard F8 · growth is a precursor only while the read is recent: a growing state must be seen again within
       params.precursorMaxDays (one melt season, an operating rule, not a fitted value); an older read is history and the age is shown */
    if (m && m.change && m.change.state === 'growing' && ageDays(m.change.latestDates && m.change.latestDates[1]) <= param('precursorMaxDays')) out.precursor = { kind: 'growth', date: m.change.latestDates[1], ageDays: Math.round(ageDays(m.change.latestDates[1])), text: nameOf(L) + ' ' + m.changeText + ' (read ' + Math.round(ageDays(m.change.latestDates[1])) + ' days ago)' };
    else if (m && m.change && m.change.state === 'growing') out.history = { kind: 'old-growth', date: m.change.latestDates && m.change.latestDates[1], text: nameOf(L) + ' was last read growing on ' + (m.change.latestDates && m.change.latestDates[1]) + ', more than ' + param('precursorMaxDays') + ' days ago; not counted as a precursor until it is read again' };
    /* v91.17.101 · audit C / registry L3 · a documented past outburst is HISTORY shown beside the level, not a precursor that raises it:
       it is the same record the susceptibility model is trained on. Growth measured by our own reads and observed drainage still act. */
    else { const y = lastEventYear(L), rec = param('recurrenceYears'); if (y && y >= new Date().getUTCFullYear() - rec) out.history = { kind: 'recent-outburst', year: y, text: nameOf(L) + ': documented outburst in ' + y + ', within the ' + rec + '-year recurrence window (HMAGLOFDB); in Pakistan 2000-2024 a tehsil with an outburst in the 6 years before had another in 18 % of years, against 5 % otherwise, almost all in March to September' }; }
    return out;
  }
  const LEVEL_RANK = { Low: 0, Monitor: 1, Watch: 2, Act: 3 };
  /* the one sentence a place outside the GLOF mask carries (data/hazard-applicability.json layers.glof.reason when present) */
  let NA_TXT = null;
  const naText = () => { if (NA_TXT && app.dataDir) return NA_TXT; try { const A = JSON.parse(readFileSync(join(dataDir(), 'hazard-applicability.json'), 'utf8')); NA_TXT = (A.layers && A.layers.glof && A.layers.glof.reason) || 'No glacial lake upstream'; } catch (_) { NA_TXT = 'No glacial lake upstream'; } return NA_TXT; };
  const LEVEL_INDEX = { Low: 0.1, Monitor: 0.36, Watch: 0.6, Act: 0.9 };   /* map grade of each level (the client's fill), not a probability */
  let PHYS = { key: null, basins: new Map(), trig: new Map() };
  function physKey() { reports(); lives(); const W0 = weatherIndex(); return (W0.runId || '-') + (W0.stale ? ':stale' : '') + '|' + LIVE_MTIME + '|' + REP_MT; }
  function lakePhysics(L) {
    const key = physKey(); if (PHYS.key !== key) PHYS = { key, basins: new Map(), trig: new Map() };
    if (!PHYS.trig.has(L.id)) { const S = sOf(L), T = trigger(L); const ts = [T.melt, T.rain, T.growth].sort((a, b) => b - a);
      const Tm = ts[0] * (0.7 + 0.3 * (ts[1] >= 0.5 ? 1 : 0));
      PHYS.trig.set(L.id, { S, T, Tmax: Math.round(Tm * 100) / 100, triggers: ts.filter(x => x > 0).length, driver: ts[0] === 0 ? 'none' : ts[0] === T.melt ? 'melt' : ts[0] === T.rain ? 'rain' : 'growth' }); }
    return PHYS.trig.get(L.id);
  }
  function basinAssess(fid) {
    const key = physKey(); if (PHYS.key !== key) PHYS = { key, basins: new Map(), trig: new Map() };
    if (PHYS.basins.has(String(fid))) return PHYS.basins.get(String(fid));
    const hits = index().get(String(fid)) || []; const rMin = param('reachActMin');
    let E = 0, top = null, act = null, watch = null, n = 0;
    for (const { L, km } of hits) {
      const S = sOf(L), rc = reach(L, fid, km), c = S.S * rc.R; E += c; n++;
      const row = { L, km, S, reach: rc, c };
      if (!top || c > top.c) top = row;
      const sg = signals(L);
      if (sg.act && rc.R >= rMin) { if (!act || c > act.c) act = { ...row, sig: sg.act }; }
      else if (sg.act || (sg.precursor && rc.R >= rMin)) { const s2 = sg.act ? { ...sg.act, beyondReach: true } : sg.precursor; if (!watch || c > watch.c) watch = { ...row, sig: s2 }; }
    }
    const level = act ? 'Act' : watch ? 'Watch' : E >= param('monitorE') ? 'Monitor' : 'Low';
    const lead = act || watch || top;
    const res = { level, E: Math.round(E * 10000) / 10000, lakes: n, lead, act, watch, top };
    PHYS.basins.set(String(fid), res); return res;
  }
  function assessText(a) {
    if (!a || !a.lead) return 'no mapped glacial lake drains here within ' + ((reg() || {}).routeKm || 100) + ' km';
    const b = a.lead, S = b.S, parts = [];
    if (a.level === 'Act') parts.push('observed signal: ' + a.act.sig.text);
    else if (a.level === 'Watch') parts.push('precursor: ' + a.watch.sig.text + (a.watch.sig.beyondReach ? ' (an observed signal beyond reach counts as a precursor)' : ''));
    else if (a.level === 'Monitor') parts.push(a.lakes + ' lake' + (a.lakes === 1 ? '' : 's') + ' upstream add up to ' + a.E + ' (susceptible lakes upstream from ' + param('monitorE') + '; a standing condition, not a forecast)');
    else parts.push(a.lakes + ' lake' + (a.lakes === 1 ? '' : 's') + ' upstream add up to ' + a.E + ', below the susceptibility line ' + param('monitorE'));
    parts.push(`${nameOf(b.L)} (${tierLabel(effectiveTier(b.L))} susceptibility, ${b.km} km upstream): S ${S.S}${S.lakeType ? ', ' + S.lakeType : S.dam ? ', ' + S.dam + ' dam' : ''}${S.areaKm2 != null ? ', ' + S.areaKm2 + ' km²' : ''}${S.surge ? ', surge-type glacier' : ''}; reach ${b.reach.R}`);
    return parts.join(' · ');
  }
  function physText(b) {
    /* kept for the national physics block and the trigger modifier */
    const ph = lakePhysics(b.lead.L), T = ph.T;
    const trig = ph.Tmax >= 0.5 ? `trigger loaded (${ph.driver}${ph.driver === 'melt' ? ': +' + T.meltAnomC + ' °C against the model’s own normal' : ph.driver === 'rain' ? ': ' + T.rain72 + ' mm in 72 h' : ''}), shown as a modifier` : null;
    return assessText(b) + (trig ? ' · ' + trig : '');
  }

  /* ── the question an asset asks ──────────────────────────────────────────────────────────── */
  function upstream(lat, lon, opts = {}) {
    const R = reg(); if (!R) return { ok: false, why: state.lastError || 'GLOF register not installed' };
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, why: 'lat and lon required' };
    if (basins() === false) return { ok: false, why: 'GLOF basin routing (' + FILES.bas + ') is not installed' };
    const f = basinAt(lat, lon);
    const lb = latestJoinable();
    const head = { ok: true, register: MODE, asset: { lat, lon }, routeKm: R.routeKm, rules: R.rules, cautions: R.cautions, sources: R.sources, levels: LEVELS(),
      bulletin: lb ? { ...(namedPublic('SUPARCO') ? { title: lb.title, link: lb.link, credit: label('lakeBulletins') } : {}), published: lb.published, rows: lb.rows.length, ageDays: Math.round((Date.now() - Date.parse(lb.published)) / 86400e3) } : null, feed: status(),
      credit: MERGED ? label('lakeInventory') : null };
    /* v91.17.71 · no mapped glacial lake drains to this point within the routing distance: GLOF does not apply here. No level, no
       class, no map grade; one confident sentence. (v91.17.70 answered "Low", which put a GLOF level on Karachi.) */
    if (!f || !(index().get(String(f.properties.id)) || []).length) {
      const nearest = R.lakes.filter(L => effectiveTier(L) <= 2).map(L => ({ L, d: kmTo(lat, lon, L.lat, L.lon) })).filter(x => x.d <= 150).sort((a, b) => a.d - b.d)[0];
      return { ...head, basin: null, lakes: [], applicable: false, class: null, level: null, word: null, index: null, text: naText(),
        basis: naText() + ': no mapped glacial lake drains to this point within ' + R.routeKm + ' km along the HydroBASINS network' + (nearest ? '; nearest High or Moderate susceptibility lake ' + nameOf(nearest.L) + ', ' + Math.round(nearest.d) + ' km away in a straight line' : ''),
        why: naText(), counts: { priority: 0, watch: 0, elevated: 0, growing: 0, draining: 0, expanding: 0, withSensor: 0 } };
    }
    const fid = f.properties.id;
    /* v91.17.275 HAZ2 · speed: the register now holds SUPARCO's lakes too (up to +20 % lakes on a route), so the full lake brief
       (condition, bulletin series, susceptibility) is built only for the lakes returned (limit); the counts read the same fields
       directly: tier, our own read's change state (the only source of growing / draining) and the listing's sensor flag */
    const lim = opts.limit || 25;
    const raw = (index().get(String(fid)) || []).map(({ L, km }) => ({ L, km, c: sOf(L).S * reach(L, fid, km).R })).sort((a, b) => b.c - a.c);
    const hits = raw.slice(0, lim).map(x => ({ ...brief(x.L, x.km), contribution: Math.round(x.c * 10000) / 10000 }));
    const chState = (L) => { const m = measured(L); return m && m.change && (m.change.state === 'growing' || m.change.state === 'draining') ? m.change.state : null; };
    let nP = 0, nW = 0, nG = 0, nD = 0, nS = 0;
    for (const x of raw) { const t = effectiveTier(x.L); if (t === 1) nP++; else if (t === 2) nW++; const st = chState(x.L); if (st === 'growing') nG++; else if (st === 'draining') nD++; const ls = listOf(x.L); if (NAMES && ls && ls.sensor) nS++; }
    const counts = { priority: nP, elevated: nW, watch: nW, growing: nG, draining: nD, expanding: nG, withSensor: nS, lakes: raw.length };
    const a = basinAssess(fid);
    let physical = null;
    if (a.lead) {
      const ph = lakePhysics(a.lead.L);
      physical = { E: a.E, class: a.level, H: a.E, driver: ph.driver, text: physText(a), lake: a.lead.L.id, S: a.lead.S, T: ph.T, Tmax: ph.Tmax, triggerLoaded: ph.Tmax >= 0.5, reach: a.lead.reach,
                   signal: a.act ? a.act.sig : a.watch ? a.watch.sig : null };
      try { if (effectiveTier(a.lead.L) <= 2) physical.outlook = triggerOutlook(a.lead.L); } catch (_) {}
    }
    return { ...head, basin: { id: fid, areaKm2: f.properties.area, upKm2: f.properties.up }, applicable: true, class: a.level, level: a.level, word: wordOf(a.level), index: LEVEL_INDEX[a.level], basis: physical ? physical.text : assessText(a), physical, rule: 'evidence-ladder',
      counts, lakes: hits, more: Math.max(0, raw.length - lim) };
  }
  function LEVELS() {
    return { Low: 'Normal: glacial lakes drain here, and their summed susceptibility x reach is below ' + param('monitorE'),
      Monitor: 'Normal (susceptible lakes upstream, a standing condition, not a forecast): the upstream lakes’ summed susceptibility x reach is at least ' + param('monitorE') + ' (every mapped lake counts)',
      Watch: 'High: a precursor at a lake within reach: growth measured by our own satellite reads; a documented past outburst is shown as history beside the level, not counted as a precursor; a precursor never gives more than High',   /* v91.17.118 · the description followed the v101 rule */
      Act: 'Severe: an observed signal at a lake within reach: a measured drainage or a confirmed event report within ' + param('eventReportDays') + ' days' };
  }

  /* ── map payload ───────────────────────────────────────────────────────────────────────── */
  /* v91.17.79 · CEO: lakes east of the Line of Control and across the border sat on the national map as if they were ours.
     Each lake is placed by the tehsil polygons: 'pk' inside a Pakistan-administered tehsil (GB, KP, AJK included) or within
     ADMIN_TOL_KM of one (the tehsil polygons leave slivers of a kilometre or two between neighbours: Bumburait in Chitral read
     "outside" by 1.6 km); 'iiojk' inside the disputed IIOJK unit; 'outside' otherwise. The map draws 'pk' only; the others stay
     in the register because the upstream check of an asset routes through them. */
  const ADMIN_TOL_KM = 5; let ADM = null;
  function adminPolys() { if (ADM) return ADM; try { const g = JSON.parse(readFileSync(join(dataDir(), 'pk-tehsils.json'), 'utf8'));
      ADM = g.features.filter(f => f && f.geometry).map(f => { const rings = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
        let bb = [180, 90, -180, -90]; for (const r of rings) for (const [x, y] of r) { if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y; }
        return { io: /Indian Illegally Occupied/i.test((f.properties || {}).province || ''), rings, bb }; }); } catch (_) { ADM = []; } return ADM; }
  function adminOf(lat, lon) {
    const P = adminPolys(); if (!P.length) return 'pk';
    const inside = (rs) => { let c = false; for (const r of rs) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } return c; };
    for (const t of P) { if (lon < t.bb[0] || lon > t.bb[2] || lat < t.bb[1] || lat > t.bb[3]) continue; if (inside(t.rings)) return t.io ? 'iiojk' : 'pk'; }
    const kx = 111.32 * Math.cos(lat * Math.PI / 180), d = ADMIN_TOL_KM / 111.32;
    for (const t of P) { if (t.io || lon < t.bb[0] - d * 2 || lon > t.bb[2] + d * 2 || lat < t.bb[1] - d || lat > t.bb[3] + d) continue;
      for (const r of t.rings) for (let i = 1; i < r.length; i++) { const ax = (r[i - 1][0] - lon) * kx, ay = (r[i - 1][1] - lat) * 111.32, bx = (r[i][0] - lon) * kx, by = (r[i][1] - lat) * 111.32;
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let q = L ? -(ax * dx + ay * dy) / L : 0; q = Math.max(0, Math.min(1, q)); if (Math.hypot(ax + q * dx, ay + q * dy) <= ADMIN_TOL_KM) return 'pk'; } }
    return 'outside'; }
  const ADMC = new Map(); const adminAt = (L) => { const k = L.id || (L.lat + ',' + L.lon); if (!ADMC.has(k)) ADMC.set(k, adminOf(L.lat, L.lon)); return ADMC.get(k); };
  let SUPI = null, SUPm = 0, SUPc = 0;
  function supInv() { const now = Date.now(); if (SUPI !== null && now - SUPc < 60000) return SUPI; SUPc = now;
    try { const f = join(dataDir(), 'glof-suparco-inventory.json'); if (!existsSync(f)) return (SUPI = false); const t = statSync(f).mtimeMs; if (t !== SUPm) { SUPI = JSON.parse(readFileSync(f, 'utf8')); SUPm = t; } } catch (_) { SUPI = false; } return SUPI; }
  function mapLayer() {
    const R = reg(); if (!R) return { ok: false, why: state.lastError || 'GLOF register not installed' };
    const V = live();
    /* v91.17.97 · CEO 30 Sep: "so many lakes … use SUPARCO inventory, PMD inventory is outdated". On the MAP:
         Priority  = the lakes on SUPARCO's dangerous-lake list (its GLOF bulletins), whatever our own screening says
         Elevated  = our susceptibility screening (tiers 1-2, and documented outburst sites) for lakes NOT on that list (zoom 7+)
         Inventory = SUPARCO's current lake inventory (data/glof-suparco-inventory.json, scripts/suparco_lakes.py; zoom 9+);
                     the 2024 national inventory is no longer drawn. The hazard engine (tehsil levels, asset upstream checks)
                     is unchanged and still reads the full register. */
    const SUP = supInv();
    /* v91.17.205 · audit: a documented outburst site whose own model screening is low is drawn as a documented site, not as a model-Elevated
       lake. The model tier follows the register's percentile cuts (Priority top 1.29 %, Elevated next 11.85 %: register rules). */
    const modelTier = (L) => { const p = L.sPct; if (p == null || !isFinite(p)) return effectiveTier(L); return p >= 0.9871 ? 1 : (p >= 0.8686 ? 2 : 3); };
    const documentedOnly = (L) => !listOf(L) && !!L.events && modelTier(L) > 2 && effectiveTier(L) <= 2;
    const mapTier = (L) => listOf(L) ? 1 : (effectiveTier(L) <= 2 ? 2 : 3);
    const drawn = R.lakes.filter(L => mapTier(L) <= 2 || !SUP);
    const near = new Set(drawn.map(L => Math.round(L.lat * 250) + ',' + Math.round(L.lon * 250)));
    const supRows = SUP ? SUP.lakes.filter(r => !near.has(Math.round(r[0] * 250) + ',' + Math.round(r[1] * 250))).map(r => {
      const A = { lat: r[0], lon: r[1], id: 'SUP-' + (r[6] || (r[0] + ',' + r[1])) };
      return [r[0], r[1], 3, 'glacial lake ' + (r[6] || '') + (r[4] ? ' (' + r[4] + ' basin)' : ''), r[2], r[3], null, 0, null, A.id, null, null, null, null, null, null, 'Low', null, adminAt(A)]; }) : [];
    return { ok: true, register: MODE, inventory: SUP ? { source: SUP.credit, built: SUP.built, count: SUP.count, url: SUP.url } : null, lakes: drawn.map(L => { const c = condition(L), ls = listOf(L); const mt = SUP ? mapTier(L) : effectiveTier(L);
      return [L.lat, L.lon, mt, nameOf(L), L.areaKm2, L.dam, ls ? (ls.status || 'listed') : null, ls && ls.sensor ? 1 : 0, c ? c.state : null, L.id, L.tehsil,
        c && c.measured && c.measured.areaKm2 != null ? c.measured.areaKm2 : null, c && c.measured ? c.measured.date : null, (surgeOf(L) || {}).surge || null,
        (effectiveTier(L) <= 2 && physOn()) ? (() => { try { const o = triggerOutlook(L); const w = (o.windows || []).find(x => x.id === 'short'); return [o.trigger.T, o.trigger.class, o.trigger.driver, w && w.members ? w.loadedShare : null, o.trigger.drivers.freezingAboveLakeM ?? null]; } catch (_) { return null; } })() : null,
        sOf(L).S, documentedOnly(L) ? 'Documented outburst site' : tierLabel(mt), L.events ? L.events.lastYear || null : null, adminAt(L)]; }).concat(supRows),
      measured: V ? { built: V.built, window: V.window, measured: V.measured, total: V.total, counts: V.counts, changeCounts: V.changeCounts || null, surge: V.surge && V.surge.count } : null,
      dams: (R.dams || []).map(d => [d.lat, d.lon, d.name, d.kind, d.status]),
      fields: ['lat', 'lon', 'tier', 'name', 'areaKm2', 'dam', 'listStatus', 'sensor', 'condition', 'id', 'tehsil', 's2AreaKm2', 's2Date', 'surge', 'outlook', 'S', 'tierLabel', 'lastOutburstYear', 'admin'],
      rules: R.rules, sources: (R.sources && R.sources.lakeInventory) ? { ...R.sources, lakeInventory: { ...R.sources.lakeInventory, attribution: 'credited as: ' + label('lakeInventory') } } : R.sources,   /* v91.17.94 · the credit line follows data/source-labels.json */ license: R.license || null, attribution: R.attribution || null, bulletin: (latestJoinable() || {}).published || null, credit: MERGED ? label('lakeInventory') : null };
  }
  /* documented outbursts (HMAGLOFDB, Steiner et al. 2023, CC BY 4.0) joined to the register: glof-events-open.json (open ids) or glof-events.json (internal) */
  let EVT = null;
  function events() { init(); if (EVT === null) { try { EVT = JSON.parse(readFileSync(join(dataDir(), FILES.evt), 'utf8')); } catch (_) { EVT = false; } } return EVT; }
  function eventsFor(id) { const E = events(); return E && E.lakes && E.lakes[id] ? E.lakes[id] : null; }
  function eventsNational() { const E = events(); if (!E) return { ok: false, why: 'data/' + FILES.evt + ' missing (station-lake/scripts/glof_open_register.py)' }; return { ok: true, built: E.built, source: E.source, license: E.license || (E.source && E.source.license) || null, join: E.join, national: E.national, lakes: Object.fromEntries(Object.entries(E.lakes).map(([k, v]) => [k, { events: v.events, lastYear: v.lastYear, mechanisms: v.mechanisms, lives: v.lives }])), unmatched: (E.unmatched || []).length }; }
  function lake(id) { const R = reg(); const X = R && R.excluded && R.excluded.find(x => x.id === id);
    if (X) return { ok: true, register: MODE, id: X.id, excluded: true, relevance: X.relevance, lat: X.lat, lon: X.lon, tehsil: X.tehsil, note: 'not a GLOF source for Pakistan: ' + ((X.relevance && X.relevance.why) || []).join('; ') };
    const L = R && R.lakes.find(x => x.id === id); return L ? { ok: true, register: MODE, ...brief(L, 0), route: L.route, nearGlacier: L.nearGlacier, documentedEvents: eventsFor(id), signals: signals(L) } : { ok: false, why: 'no such lake' }; }

  /* ══ v91.17.41 · GLOF TRIGGER OUTLOOK PER LAKE (a modifier of the level; v91.17.70 melt basis) ═══════════
     Per Priority and Elevated lake: deterministic drivers at the lake height (freezing level above the lake, positive
     degree-days from the served forecast, 24/72-h rain) and the 51-member agreement on the rain trigger. Melt uses the
     forecast system's own EC46 anomaly; the members carry no re-forecast climate, so the member melt term is off rather
     than measured against ERA5 (board S2). Volume: Huggel et al. (2002) V = 0.104 A^1.42, a factor-of-two scaling. */
  const VOL = (areaKm2) => areaKm2 == null ? null : Math.round(0.104 * Math.pow(areaKm2 * 1e6, 1.42) / 1000);   /* thousand m³ */
  const WINDOWS = [{ id: 'nowcast', label: 'GLOF trigger nowcast', days: [0, 1] }, { id: 'short', label: 'short-range outlook', days: [1, 4] }, { id: 'watch', label: 'week-ahead window', days: [4, 8] }, { id: 'environment', label: 'environmental outlook', days: [8, 15] }];
  const tLadder = (T) => T < 0.25 ? 'quiet' : T < 0.5 ? 'elevated' : T < 0.75 ? 'loaded' : 'severe';
  function lakeUnits() { const R = reg(); const set = new Set(); if (R) for (const L of R.lakes) if (effectiveTier(L) <= 2 && L.unitUid) set.add(L.unitUid); return set; }
  function memberTrigger(g, m, d0, d1, zL, growth) {
    /* the trigger for one member over days [d0, d1): rain from the worst 3-day total in the window, rain on snow as a flag
       that lifts it; melt is off for members (no member re-forecast climate; never the ERA5 normal) */
    const lapse = LAPSE(), dz = zL != null && g.elevM != null ? lapse * (zL - g.elevM) : 0; const rs = param('rainScaleMm');
    let days = 0, tsum = 0, ros = 0, worst3 = 0;
    for (let d = d0; d < Math.min(d1, g.days.length); d++) {
      const tx = g.tx[m] && g.tx[m][d], tn = g.tn[m] && g.tn[m][d]; if (tx == null || tn == null) continue;
      const tl = (tx + tn) / 2 + dz; days++; tsum += tl;
      /* v91.17.93 · science audit: a missing member value is not 0 mm; windows with a gap are skipped */
      const at = (A, k) => (A[m] && A[m][k] != null) ? A[m][k] : null;
      const pr = at(g.pr, d), sn = at(g.sn, d);
      let s3 = 0, full = true; for (let k = d; k < Math.min(d + 3, d1, g.days.length); k++) { const v = at(g.pr, k), w = at(g.sn, k); if (v == null || w == null) { full = false; break; } s3 += Math.max(0, v - w / 0.7); }   /* v91.17.157 · liquid rain */ if (full && s3 > worst3) worst3 = s3;
      let lying = 0, lyOk = true; for (let k = Math.max(0, d - 5); k < d; k++) { const v = at(g.sn, k); if (v == null) { lyOk = false; break; } lying += v; }
      if (lyOk && pr != null && sn != null && lying >= 5 && Math.max(0, pr - sn / 0.7) >= 5 && tx + dz > 2) ros = 1;   /* snow cm -> water mm at the provider's own 0.7 ratio */
    }
    if (!days) return null;
    const meanC = tsum / days, melt = 0;
    const rain = Math.max(clamp01((worst3 - rs[0]) / (rs[1] - rs[0])), ros ? 0.5 : 0);
    const T = rain * (0.7 + 0.3 * (growth >= 0.5 ? 1 : 0));
    return { T, melt, rain, ros, meanC, worst3 };
  }
  let OUT = { key: null, lakes: new Map() };
  function triggerOutlook(L) {
    const g = app.outlook && app.outlook.members ? app.outlook.members(L.unitUid) : null;
    const key = physKey() + '|' + (g ? g.at : '-');
    if (OUT.key !== key) OUT = { key, lakes: new Map() };
    if (OUT.lakes.has(L.id)) return OUT.lakes.get(L.id);
    const ph = lakePhysics(L), T = ph.T, te = terrain(), t = te && te.lakes ? te.lakes[L.id] : null;
    const zL = t && t.lakeElevDemM != null ? t.lakeElevDemM : L.elevApproxM;
    const W = weatherIndex(); const r = W.rec.get(L.unitUid); const drivers = { lakeElevM: zL, servedElevM: T.servedElevM, source: T.source };
    if (r && r.hourly && Array.isArray(r.hourly.time)) {
      const H = r.hourly, F = H.freezing_level_height || [], Tt = H.temperature_2m || [], P0 = H.precipitation || [], SN = H.snowfall || null, zS = r.resolvedElevationM, lapse = LAPSE();
      const P = P0.map((v, i) => v == null || !SN || SN[i] == null ? null : Math.max(0, v - SN[i] / 0.7));   /* v91.17.157 · liquid rain */
      const mean = (a, n) => { let s = 0, k = 0; for (let i = 0; i < Math.min(n, a.length); i++) if (a[i] != null) { s += a[i]; k++; } return k ? s / k : null; };
      const fl24 = mean(F, 24); drivers.freezingLevelM = fl24 == null ? null : Math.round(fl24); drivers.freezingAboveLakeM = fl24 == null || zL == null ? null : Math.round(fl24 - zL);
      drivers.meltEnvironment = drivers.freezingAboveLakeM == null ? 'unknown' : drivers.freezingAboveLakeM < -300 ? 'frozen' : drivers.freezingAboveLakeM < 0 ? 'marginal' : drivers.freezingAboveLakeM < 500 ? 'elevated' : 'high';
      drivers.freezingLevelUncertaintyM = 300; drivers.freezingLevelBasis = 'model freezing_level_height, 24-h mean; MAE about 300 m in the melt season (internal verification)';
      if (drivers.freezingAboveLakeM != null && Math.abs(drivers.freezingAboveLakeM) <= 300) drivers.meltEnvironmentNote = 'within the ±300 m band of the freezing level: marginal and elevated are not distinguishable here';
      const pdd = (nd) => { let s = 0, ds = 0; for (let d = 0; d < nd; d++) { let m = 0, k = 0; for (let h = d * 24; h < Math.min(Tt.length, d * 24 + 24); h++) if (Tt[h] != null && zS != null && zL != null) { m += Tt[h] + lapse * (zL - zS); k++; } if (k < 12) continue; s += Math.max(0, m / k); ds++; } return { pdd: Math.round(s * 10) / 10, days: ds }; };
      drivers.pdd = { d1: pdd(1), d3: pdd(3), d5: pdd(5) };
      const sum = (a, n) => { let s = 0, k = 0; for (let i = 0; i < Math.min(n, a.length); i++) if (a[i] != null) { s += a[i]; k++; } return k === n ? Math.round(s) : null; };   /* v91.17.157 · a total needs every hour */
      drivers.rain24Mm = sum(P, 24); drivers.rain72Mm = sum(P, 72);
    }
    drivers.meltAnomaly = modelAnomaly(L.unitUid); drivers.meltBasis = T.meltBasis;
    drivers.growth = T.growth; drivers.melt = Math.round(T.melt * 100) / 100; drivers.rain = Math.round(T.rain * 100) / 100;
    const windows = [];
    if (g && g.days && g.tx && g.tx.length) {
      for (const w of WINDOWS) {
        const Ts = []; let nRain = 0, nRos = 0, sumC = 0, sumP = 0;
        for (let m = 0; m < g.tx.length; m++) { const x = memberTrigger(g, m, w.days[0], w.days[1], zL, T.growth); if (!x) continue; Ts.push(x.T); if (x.rain >= 0.5) nRain++; if (x.ros) nRos++; sumC += x.meanC; sumP += x.worst3; }
        if (!Ts.length) { windows.push({ ...w, members: 0, why: 'no member data' }); continue; }
        const n = Ts.length, loaded = Ts.filter(x => x >= 0.5).length, med = [...Ts].sort((a, b) => a - b)[Math.floor(n / 2)];
        const lead = w.days[1] - 1; const verified = (g.verifiedLeads || []).some(l => l >= w.days[0] && l < w.days[1]);
        windows.push({ id: w.id, label: w.label, days: [w.days[0], Math.min(w.days[1], g.days.length)], dates: [g.days[w.days[0]], g.days[Math.min(w.days[1], g.days.length) - 1]], members: n,
          loadedShare: Math.round(100 * loaded / n) / 100, medianT: Math.round(med * 100) / 100, class: tLadder(med), agreement: loaded / n >= 0.75 || loaded / n <= 0.1 ? 'high' : loaded / n >= 0.5 || loaded / n <= 0.25 ? 'moderate' : 'low',
          drivers: { meltShare: null, meltBasis: 'members carry no re-forecast climate: melt off', rainShare: Math.round(100 * nRain / n) / 100, rainOnSnowShare: Math.round(100 * nRos / n) / 100, meanLakeC: Math.round(sumC / n * 10) / 10, worst3dRainMm: Math.round(sumP / n) },
          confidence: w.id === 'environment' ? 'environment only: conditions becoming more or less favourable, never a timing' : verified ? 'members verified at leads inside this window' : 'members not verified at these leads',
          leadDaysMax: lead });
      }
    }
    const S = ph.S;
    const out = { ok: true, lake: { id: L.id, name: nameOf(L), tier: effectiveTier(L), tierLabel: tierLabel(effectiveTier(L)), lat: L.lat, lon: L.lon, tehsil: L.tehsil, district: L.district, unitUid: L.unitUid, elevM: zL },
      susceptibility: { ...S, volumeThousandM3: VOL(L.areaKm2), volumeBasis: 'Huggel et al. 2002, V = 0.104 A^1.42: an empirical scaling, right to a factor of two', measured: measured(L), condition: condition(L).state },
      trigger: { T: ph.Tmax, class: (T && T.weatherMissing && !(ph.Tmax > 0)) ? null : tLadder(ph.Tmax), classWhy: (T && T.weatherMissing && !(ph.Tmax > 0)) ? 'trigger unknown: ' + T.weatherWhy + ' (not quiet)' : null, driver: ph.driver,   /* v91.17.157 · audit: missing weather read as quiet */ triggers: ph.triggers, loaded: ph.Tmax >= 0.5, role: 'modifier: it never raises the level', window: (ph.T && ph.T.window) || null, drivers },
      windows, ensemble: g ? { at: g.at, model: g.model, members: g.tx.length, verifiedLeads: g.verifiedLeads } : { why: 'no ensemble members kept for this unit yet: the ensemble job stores them for lake-hosting tehsils at its next run' },
      statement: 'GLOF trigger outlook: whether the meteorological triggers are loaded at a susceptible lake and how many ensemble members agree. It modifies the level; it is not a forecast that the lake will fail.' };
    OUT.lakes.set(L.id, out); return out;
  }
  function outlookNational() {
    const R = reg(); if (!R) return { ok: false, why: state.lastError || 'GLOF register not installed' };
    const rows = R.lakes.filter(L => effectiveTier(L) <= 2).map(L => { const o = triggerOutlook(L); const w = (o.windows || []); const pick = (id) => { const x = w.find(y => y.id === id); return x && x.members ? x.loadedShare : null; };
      return { id: L.id, name: o.lake.name, tier: o.lake.tier, tierLabel: o.lake.tierLabel, tehsil: L.tehsil, district: L.district, S: o.susceptibility.S, T: o.trigger.T, class: o.trigger.class, driver: o.trigger.driver, freezingAboveLakeM: o.trigger.drivers.freezingAboveLakeM ?? null, meltEnvironment: o.trigger.drivers.meltEnvironment || null,
        loaded: { nowcast: pick('nowcast'), short: pick('short'), watch: pick('watch'), environment: pick('environment') }, volumeThousandM3: o.susceptibility.volumeThousandM3, condition: o.susceptibility.condition }; })
      .sort((a, b) => (b.loaded.short ?? -1) - (a.loaded.short ?? -1) || b.T - a.T);
    const withMembers = rows.filter(x => x.loaded.short != null).length;
    return { ok: true, register: MODE, at: new Date().toISOString(), lakes: rows.length, withMembers, windows: WINDOWS, counts: { severe: rows.filter(x => x.class === 'severe').length, loaded: rows.filter(x => x.class === 'loaded').length, elevated: rows.filter(x => x.class === 'elevated').length, quiet: rows.filter(x => x.class === 'quiet').length },
      rows, statement: 'GLOF trigger outlook per High and Moderate susceptibility lake: loaded = share of ensemble members whose rebuilt rain trigger reaches 0.5 in the window. A modifier of the level, not a failure forecast.' };
  }
  let NAT = null, NAT_KEY = null;
  /* data/hazard-applicability.json layers.glof.byRegister[<this register>]: tehsil -> routed basins (polygon overlap) */
  let APG = null, APG_MT = 0;
  function applicabilityGlof() {
    init();
    try { const p = join(dataDir(), 'hazard-applicability.json'); if (!existsSync(p)) return null; const mt = statSync(p).mtimeMs; if (APG !== null && mt === APG_MT) return APG;
      const A = JSON.parse(readFileSync(p, 'utf8')); const G = A.layers && A.layers.glof; const r = G && G.byRegister && G.byRegister[MODE];
      APG = r ? { ...r, built: A.built, method: G.method } : false; APG_MT = mt; NAT = null; return APG; } catch (_) { APG = false; return APG; }
  }
  function basinClass(fid) {
    const a = basinAssess(fid);
    const hits = index().get(String(fid)) || [];
    const P = hits.filter(h => effectiveTier(h.L) === 1).length, Wt = hits.filter(h => effectiveTier(h.L) === 2).length;
    const grow = hits.filter(h => { const m = measured(h.L); return m && m.change && m.change.state === 'growing'; }).length;
    return { cls: a.level, H: a.E, priority: P, watch: Wt, elevated: Wt, expanding: grow, growing: grow, lakes: hits.length,
      named: hits.filter(h => effectiveTier(h.L) === 1).slice(0, 4).map(h => nameOf(h.L)), physics: a.lead ? physText(a) : assessText(a), driver: a.lead ? lakePhysics(a.lead.L).driver : null, worstLake: a.lead ? a.lead.L.id : null,
      signal: a.act ? a.act.sig.kind : a.watch ? a.watch.sig.kind : null };
  }
  function national(force) {
    let natKey = null; try { applicabilityGlof(); natKey = [physKey(), (bul() && bul().checkedAt) || 0, MODE, APG_MT].join('|'); } catch (_) { natKey = null; }
    if (NAT && !force && natKey === NAT_KEY) return NAT;
    /* v91.17.144 · B5 · the national GLOF layer took 7-10 s of one block on the laptop each time the weather run changed (about
       hourly), freezing every other request. With a previous answer in hand the new one is now built in slices in the background
       (other requests run between slices) and the previous answer is served until it is ready; the first build and ?force=1 stay
       synchronous. */
    if (NAT && !force) { natRebuild(natKey); return NAT; }
    const g = natSteps(natKey); let r = g.next(); while (!r.done) r = g.next(); return r.value;
  }
  let NAT_BUILDING = null;
  function natRebuild(natKey) {
    if (NAT_BUILDING === natKey) return; NAT_BUILDING = natKey;
    const g = natSteps(natKey);
    const step = () => { try { const t = Date.now(); let r = g.next(); while (!r.done && Date.now() - t < 30) r = g.next(); if (!r.done) return setImmediate(step); } catch (_) {} NAT_BUILDING = null; };
    setImmediate(step);
  }
  /* the first build after a start is made in slices too, 45 s after start-up, so the first map or report does not wait for it */
  { const t = setTimeout(() => { try { if (NAT) return; applicabilityGlof(); natRebuild([physKey(), (bul() && bul().checkedAt) || 0, MODE, APG_MT].join('|')); } catch (_) {} }, 11000); if (t.unref) t.unref(); }
  function* natSteps(natKey) {
    NAT_KEY = natKey;
    const R = reg(); if (!R) return { ok: false, why: state.lastError || 'GLOF register not installed' };
    const B = basins(); if (!B) return { ok: false, why: 'GLOF basin routing (' + FILES.bas + ') is not installed' };
    let fc = null; try { fc = JSON.parse(readFileSync(join(dataDir(), 'pk-tehsils.json'), 'utf8')); } catch (_) { return { ok: false, why: 'pk-tehsils.json not readable' }; }
    const reps = []; let k0 = 0;
    for (const f of B.features) { const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; let sx = 0, sy = 0, n = 0;
      polys.forEach(p => p[0].forEach(([x, y]) => { sx += x; sy += y; n++; })); reps.push({ id: f.properties.id, x: sx / n, y: sy / n, cls: basinClass(f.properties.id) }); if (++k0 % 25 === 0) yield; }
    const lb = latestJoinable();
    const units = {}; let touched = 0, notApplicable = 0, disputedN = 0; const counts = { Low: 0, Monitor: 0, Watch: 0, Act: 0 };
    /* v91.17.71 · WHICH TEHSILS GLOF APPLIES TO. A tehsil gets a level only when a mapped glacial lake drains into it within the routing
       distance, or lies in it. The routed basins of a tehsil are the ones data/hazard-applicability.json lists for this register
       (polygon overlap, built by scripts/build_applicability.py; the overlap floor and its reason are in that file); without the
       file, the basins whose representative point lies in the tehsil. The lakes lying in the tehsil add their own basin, and the
       tehsil's anchor point adds the basin it sits in. A tehsil with none of these carries no level and the sentence naText(). */
    const AP = applicabilityGlof();
    const byBasin = new Map(reps.map(r => [String(r.id), r]));
    const lakesIn = new Map(); R.lakes.forEach(L => { if (L.unitUid) { if (!lakesIn.has(L.unitUid)) lakesIn.set(L.unitUid, []); lakesIn.get(L.unitUid).push(L); } });
    let k1 = 0;
    for (const f of fc.features) {
      if (++k1 % 10 === 0) yield;
      const g = f.geometry; if (!g) continue; const uid = f.properties.uid;
      /* the disputed unit is not scored by design (as on every other layer): no level, and it is outside both counts */
      if (/Indian Illegally Occupied/i.test(String(f.properties.province || ''))) { units[uid] = { applicable: null, disputed: true, class: null, level: null, index: null, text: 'not scored (disputed territory)' }; disputedN++; continue; }
      const ids = new Set();
      if (AP && AP.units) ((AP.units[uid] || {}).basins || []).forEach(b => ids.add(String(b)));
      else { const [x0, y0, x1, y1] = bboxOf(g); reps.forEach(r => { if (r.x >= x0 && r.x <= x1 && r.y >= y0 && r.y <= y1 && inPoly(r.x, r.y, g)) ids.add(String(r.id)); }); }
      const here = lakesIn.get(uid) || [];
      here.forEach(L => { if (L.basin12 != null && byBasin.has(String(L.basin12))) ids.add(String(L.basin12)); });
      const u = (app.units && app.units.tehsil || []).find(t => t.unitId === uid);
      const anchor = u && Number.isFinite(u.lat) ? upstream(u.lat, u.lon, { limit: 3 }) : null;
      if (anchor && anchor.ok && anchor.applicable && anchor.basin) ids.add(String(anchor.basin.id));
      const inside = [...ids].map(id => byBasin.get(id)).filter(r => r && r.cls.lakes > 0);
      if (!inside.length && !here.length) {
        notApplicable++;
        units[uid] = { applicable: false, class: null, level: null, word: null, index: null, text: naText(),
          basis: naText() + ': no mapped glacial lake lies in this tehsil or drains into it within ' + R.routeKm + ' km along the HydroBASINS network', corridorBasins: 0 };
        continue;
      }
      let cls = 'Low', basis = here.length + ' mapped glacial lake(s) lie in this tehsil';
      let worst = null;
      inside.forEach(r => { if (!worst || LEVEL_RANK[r.cls.cls] > LEVEL_RANK[worst.cls.cls] || (LEVEL_RANK[r.cls.cls] === LEVEL_RANK[worst.cls.cls] && r.cls.H > worst.cls.H)) worst = r; });
      if (worst) { cls = worst.cls.cls; touched++; basis = inside.length + ' routed basin(s) with glacial lakes upstream cross this tehsil; worst: ' + worst.cls.physics; }
      let sig = worst ? worst.cls.signal : null;
      if (anchor && anchor.ok && anchor.applicable && LEVEL_RANK[anchor.class] > LEVEL_RANK[cls]) { cls = anchor.class; basis = 'at the tehsil anchor point: ' + anchor.basis; sig = anchor.physical && anchor.physical.signal ? anchor.physical.signal.kind : null; }
      counts[cls]++;
      units[uid] = { applicable: true, class: cls, level: cls, word: wordOf(cls), basis, corridorBasins: inside.length, lakesInTehsil: here.length, index: LEVEL_INDEX[cls], E: worst ? worst.cls.H : 0, driver: worst ? worst.cls.driver || null : null, signal: sig,
        priority: worst ? worst.cls.priority : 0, watch: worst ? worst.cls.watch : 0, elevated: worst ? worst.cls.elevated : 0, expanding: worst ? worst.cls.growing : 0, growing: worst ? worst.cls.growing : 0,
        named: worst ? worst.cls.named : [], anchorClass: anchor && anchor.ok ? anchor.class : null };
    }
    const countsWord = {}; for (const [k, n] of Object.entries(counts)) { const w = wordOf(k); countsWord[w] = (countsWord[w] || 0) + n; }
    NAT = { ok: true, register: MODE, registerVersion: R.version || null, builtAt: new Date().toISOString(), units, touched, total: fc.features.length, counts, countsWord, words: ['Normal', 'Low', 'Moderate', 'High', 'Severe'], applicable: fc.features.length - notApplicable - disputedN, notApplicable, disputed: disputedN, notApplicableText: naText(), rule: 'evidence-ladder',
      credit: MERGED ? label('lakeInventory') : null, applicability: AP ? { source: 'data/hazard-applicability.json', method: AP.method || null, built: AP.built || null } : { source: 'runtime: basin representative points', method: null },
      physics: { formula: 'E = sum over every lake upstream of S x R; S the lake’s susceptibility (' + 'logistic model on open attributes, leave-one-basin-out validated' + (MERGED ? '; inventory lakes without an open outline take the same model on their own attributes' : '') + '), R its reach (e^(-km/L) by tier, dilution above ' + param('dilutionKm2')[0] + ' km² upstream, drop per km)',
        ladder: 'Normal below ' + param('monitorE') + ' and at or above it (susceptible lakes upstream, a standing condition) · High on a precursor within reach · Severe on an observed signal within reach; the melt and rain trigger is a modifier', weatherRun: weatherIndex().runId, weatherRunAt: weatherIndex().at ? new Date(weatherIndex().at).toISOString() : null, weatherStale: weatherIndex().stale ? weatherIndex().why : null, terrainBuilt: (terrain() || {}).built, params: (R.params || null) },
      ladder: LEVELS(),
      bulletin: lb ? { published: lb.published.slice(0, 10), imageryNote: 'lake areas are from the imagery date inside the bulletin, not its publication date' } : null,
      sources: R.sources || null, license: R.license || null, attribution: R.attribution || null,
      method: 'a tehsil gets a level only where a mapped glacial lake drains into it within ' + R.routeKm + ' km or lies in it; the level is the worst over its routed HydroBASINS units (and the lakes lying in it), or the level at the tehsil anchor point, whichever is worse. Every other tehsil: ' + naText() + ', no level.' };
    return NAT;
  }

  /* ── bulletin feed (SUPARCO Space4Climate): internal reference only since v91.17.70 ───────────────────────── */
  async function getJSON(url) {
    for (let t = 0; t < 3; t++) {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(45000) });
      const s = await r.text();
      if (r.ok && /^\s*[[{]/.test(s)) return JSON.parse(s);
      await new Promise(res => setTimeout(res, 8000));
    }
    throw new Error('space4climate.gov.pk did not return JSON after 3 tries');
  }
  async function refresh() {
    init();
    if (!MERGED) return { ok: false, why: 'the bulletin feed is off: station data is switched off (NIGRAAN_STATION_DATA=0) or the merged register is not installed' };
    if (state.running) return { ok: false, why: 'refresh already running' };
    state.running = true; state.lastFetchAt = new Date().toISOString();
    try {
      const B = bul(); const have = new Map((B.bulletins || []).map(b => [b.postId, b]));
      const seen = new Map();
      for (const q of ['glof', 'glacial lakes']) {
        const list = await getJSON(SITE + '/wp-json/wp/v2/posts?search=' + encodeURIComponent(q) + '&per_page=30&_fields=id,date,modified,slug,link,title');
        list.filter(p => /glof|glacial-lake/i.test(p.slug) && !/retreat|destabili/i.test(p.slug)).forEach(p => seen.set(p.id, p));
      }
      let added = 0, updated = 0; const problems = [];
      for (const p of seen.values()) {
        const old = have.get(p.id);
        if (old && old.modified === p.modified && !(old.problems || []).length) continue;
        if ((B.skipped || []).some(x => x.postId === p.id && x.modified === p.modified)) continue;
        const post = await getJSON(SITE + '/wp-json/wp/v2/posts/' + p.id + '?_fields=id,date,modified,slug,link,title,content');
        const parsed = parseBulletin(post.content && post.content.rendered, { id: post.id, slug: post.slug, date: post.date, link: post.link, title: txt((post.title || {}).rendered || '') });
        parsed.modified = post.modified; parsed.fetchedAt = new Date().toISOString();
        if (!parsed.rows.length) { problems.push(post.slug + ': ' + (parsed.problems[0] || 'no rows'));
          B.skipped = (B.skipped || []).filter(x => x.postId !== post.id).concat([{ postId: post.id, slug: post.slug, published: post.date, modified: post.modified, why: parsed.problems[0] || 'no rows' }]); continue; }
        if (old) { Object.assign(old, parsed); updated++; } else { (B.bulletins = B.bulletins || []).push(parsed); added++; }
      }
      B.checkedAt = new Date().toISOString(); saveBul();
      state.lastOkAt = B.checkedAt; state.lastError = problems.length ? problems.join('; ') : null;
      return { ok: true, added, updated, bulletins: B.bulletins.length, problems };
    } catch (e) { state.lastError = e.message; return { ok: false, why: e.message, keeping: (bul().bulletins || []).length + ' bulletin(s) from the last good read' }; }
    finally { state.running = false; }
  }
  function status() {
    init();
    const V = live(); const liveAge = V && V.built ? (Date.now() - Date.parse(V.built)) / 86400e3 : null;
    const measuredBlock = V ? { built: V.built, window: V.window, measured: V.measured, total: V.total, counts: V.counts, changeCounts: V.changeCounts || null, methodVersion: V.methodVersion || null, preflight: V.preflight ? { passed: V.preflight.passed, lakesRead: V.preflight.lakesRead } : null, surgeFlagged: V.surge ? V.surge.count : 0, ageDays: liveAge == null ? null : Math.round(liveAge), stale: liveAge == null || liveAge > 45 } : null;
    if (!MERGED) return { register: MODE, bulletins: 0, latest: null, measured: measuredBlock, checkedAt: measuredBlock ? measuredBlock.built : null, stale: measuredBlock ? measuredBlock.stale : true, bulletinOld: null, lastError: null, running: false, source: 'open register (Hi-MAG, RGI 7.0, HMAGLOFDB) and our own Sentinel-2 reads' };
    const B = bul(); const lb = latestJoinable();
    const ageD = B.checkedAt ? (Date.now() - Date.parse(B.checkedAt)) / 86400e3 : null;
    const bulAgeD = lb ? (Date.now() - Date.parse(lb.published)) / 86400e3 : null;
    return { register: MODE, bulletins: (B.bulletins || []).length, latest: lb ? { ...(namedPublic('SUPARCO') ? { title: lb.title, link: lb.link } : {}), published: lb.published, rows: lb.rows.length, ageDays: bulAgeD == null ? null : Math.round(bulAgeD) } : null,
      measured: measuredBlock, checkedAt: B.checkedAt || null, stale: ageD == null || ageD > 3, bulletinOld: bulAgeD == null || bulAgeD > 45, lastError: NAMES ? state.lastError : (state.lastError ? 'the last bulletin read did not complete' : null), running: state.running,
      source: NAMES ? SITE + ' (SUPARCO Space4Climate bulletins; PMD 2024 inventory)' : label('lakeInventory') + '; open register (Hi-MAG, RGI 7.0, HMAGLOFDB) and our own Sentinel-2 reads' };
  }
  function liveSummary() {
    const V = live(); const R = reg(); if (!V) return { ok: false, why: 'no Sentinel-2 lake read that passed its radiometry pre-flight is installed: run station-lake/scripts/lake_monitor.py (LEARN_NIGRAAN.bat lakes)' };
    /* one row per register lake that carries a read (the merged register reads the inventory outline first, the Hi-MAG outline second) */
    const rows = [];
    for (const L of (R ? R.lakes : [])) { const v = liveOf(L); if (!v) continue;
      rows.push({ id: L.id, name: nameOf(L), tehsil: L.tehsil, district: L.district, tier: effectiveTier(L), tierLabel: tierLabel(effectiveTier(L)), tierRegister: L.tier,
        state: v.state === 'expanding' ? 'within' : v.state, change: v.change ? v.change.state : null, outlineKm2: v.outlineKm2 != null ? v.outlineKm2 : v.pmd2024Km2, areaKm2: v.latest ? v.latest.areaKm2 : null, areaInOutlineKm2: v.latest ? v.latest.areaInOutlineKm2 : null, date: v.latest ? v.latest.date : null, valid: v.latest ? v.latest.valid : null, ratio: v.ratio, surge: v.surge || null }); }
    const order = { draining: 0, growing: 1, stable: 2, insufficient: 3 };
    rows.sort((a, b) => ((order[a.change] ?? 4) - (order[b.change] ?? 4)) || (a.tier - b.tier) || ((b.ratio || 0) - (a.ratio || 0)));
    const gen = (t) => NAMES || t == null ? t : String(t).replace(/the PMD 2024 outline \(internal reference\)/g, 'the 2024 inventory outline').replace(/\bPMD 2024\b/g, '2024 inventory');
    return { ok: true, register: MODE, built: V.built, window: V.window, scenes: V.scenes, method: gen(V.method), methodVersion: V.methodVersion || null, rules: V.rules || null, preflight: V.preflight ? (NAMES ? V.preflight : { passed: V.preflight.passed, lakesRead: V.preflight.lakesRead, failed: V.preflight.failed, rule: V.preflight.rule, at: V.preflight.at }) : null, states: V.states, surge: V.surge, caveats: V.caveats, counts: V.counts, changeCounts: V.changeCounts || null, measured: V.measured, total: V.total, license: gen(V.license) || null, files: V.files || null,
      growing: rows.filter(r => r.change === 'growing'), draining: rows.filter(r => r.change === 'draining'), expanding: rows.filter(r => r.change === 'growing'), surgeFlagged: rows.filter(r => r.surge), rows: rows.slice(0, 600) };
  }
  function bulletins() { init(); if (!MERGED) return { ok: true, register: MODE, list: [], skipped: [], why: 'the bulletin feed is off (station data switched off)' }; return { ...status(), skipped: NAMES ? (bul().skipped || []) : (bul().skipped || []).map(x => ({ published: x.published, why: x.why })), list: (bul().bulletins || []).map(b => ({ ...(namedPublic('SUPARCO') ? { title: b.title, link: b.link } : { title: 'satellite lake bulletin ' + String(b.published || '').slice(0, 10) }), published: b.published, layout: b.layout, rows: b.rows.length, statedTotal: b.statedTotal, joinable: b.joinable, joinNote: NAMES ? b.joinNote : (b.joinable ? 'IDs match the 131-lake national list' : 'older lake list (IDs do not match the 131-lake list); shown, not joined'), problems: NAMES ? b.problems : (b.problems || []).length })) }; }
  /* v91.17.71 · the bulletin feed keeps its v91.17.69 cadence (90 s after start, then every 12 h) wherever the station data is used;
     no new polling is added. Never blocks a request. */
  if (SD && !app.__noGlofTimer && !process.env.MACH_OFFLINE) {
    schedule(app, 'glof', 12 * 3600e3, () => { init(); return MERGED ? refresh() : null; }, { firstMs: 90e3, heavy: true, label: 'glacial lakes refresh' });
  }
  const _refresh0 = refresh;
  return { upstream, mapLayer, lake, lakeUnits, eventsNational, eventsFor, reloadEvents: () => { EVT = null; }, triggerOutlook, outlookNational, refresh: async (...a) => { const r = await _refresh0(...a); NAT = null; return r; }, status, bulletins, condition, parseBulletin, register: reg, national, liveSummary, effectiveTier, lakePhysics, physOn, basinAssess, signals, get mode() { init(); return MODE; }, param };
}
