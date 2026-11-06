/* ══ v91.17.77 · Q · RECENT EARTHQUAKES: WHICH TEHSILS CAN HAVE FELT IT, AND HOW STRONGLY ═══════════════════════════════
   Replaces the browser's seismic "nudge" (a 0-22 point bonus inside 250 km, numbers with no source; E s75 finding 2).
   Every number is read from data/seismic-felt-rule.json (built by nig/s77/quake_build/build_seismic_rule.py with its
   provenance): the Allen, Wald & Worden (2012) intensity prediction equation (coefficients read from the OpenQuake source),
   its validity (Mw 5.0-7.9, < 300 km), the ShakeMap intensity legend mapped to our levels (Low IV, Moderate V, High VI,
   Severe VII+), the region, the poll period (the feeds' own max-age), the magnitude floor and the retention.

   Per event and tehsil: expected intensity = the event's ShakeMap MMI grid where the event carries one (highest value inside
   the tehsil; a tehsil with no grid cell inside takes the value at its nearest point), else the equation at the hypocentral
   distance to the NEAREST point of the tehsil polygon, used only inside the equation's validity. Events are an EVENT overlay:
   nothing here touches the BCP-SP 2007 design-basis zone (v89.44 FIX 5).

   Sources (keyless, U.S. public domain): the M2.5+ day feed and the significant-week feed, polled every poll.feedSeconds;
   an hourly fdsnws revision query (updatedafter, includedeleted) over the buffered Pakistan box at magMin, which catches
   late-published events and magnitude / location revisions. Customer text names the feed only by the generic label
   (data/source-labels.json key earthquakeFeed); the supplier is credited on the Sources tab (licence header of the rule file).

   Routes (wired from server/api/index.mjs through route()):
     GET /api/quake/live[?geom=1]          events of the last retainDays + flagged tehsils (level, distance, intensity, source)
     GET /api/quake/replay?event=<id>[&geom=1]   one catalogue event through the same rule (tests: 2005 Kashmir, 2023 Jurm)
     GET /api/quake/status                 poll state (times, counts, last error)
     GET /api/ext/usgs                     compatibility: the retained events as a GeoJSON FeatureCollection (was a 900 s
                                           proxy of the 7-day feed; E s75 finding 3)
   Timers run unless NIGRAAN_WORKER=0 or NIGRAAN_QUAKE=0; /api/quake/live refreshes on demand when the cache is older than
   poll.feedSeconds, so a scratch server without timers still answers with current data. State persists in
   data/cache/quake/state.json (atomic write); fetched replays in data/cache/quake/replay-<id>.json (a replay is repeatable
   offline once fetched). */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { schedule } from './scheduler.mjs';
import { label } from './refmode.mjs';

const UA = { 'user-agent': 'nigraan-local/91.17 (AI Geo Navigators, Islamabad; operational hazard screening)' };
const D2R = Math.PI / 180, RE = 6371.0088;
const ID_RE = /^[a-z0-9]{4,24}$/i;
/* v91.17.280 · FIX280-2 · owner rule (9 Oct 2026): earthquakes are reference only, no damage estimates. Alert window 24 h after the event. */
const OWNER_ALERT_WINDOW_H = 24;
/* the level's words say the shaking intensity only (the ShakeMap legend's perceived-shaking column of the rule file); the legend's
   potential-damage column is not served (owner rule: no damage estimate anywhere client-facing) */
function shakingWords(l, top) { const sh = l && l.shaking ? String(l.shaking).toLowerCase() : null; const cls = l && l.shakeMapClass ? String(l.shakeMapClass) : null;
  if (!sh) return 'shaking of intensity ' + (cls || 'level ' + (l && l.level)) + (top ? ' or stronger' : '');
  return sh + ' shaking' + (top ? ' or stronger' : '') + (cls ? ' (intensity ' + cls + (top ? '+' : '') + ')' : ''); }

export function createQuake(app, dataDir, opts = {}) {
  const RULE_F = join(dataDir, 'seismic-felt-rule.json');
  const CDIR = join(dataDir, 'cache', 'quake');
  const STATE_F = join(CDIR, 'state.json');
  let RULE = null, ruleStamp = null;
  function rule() {
    try { const st = statSync(RULE_F); const k = st.mtimeMs + ':' + st.size;
      if (!RULE || k !== ruleStamp) { RULE = JSON.parse(readFileSync(RULE_F, 'utf8')); ruleStamp = k; } } catch (e) { if (!RULE) throw new Error('data/seismic-felt-rule.json missing or unreadable: ' + e.message); }
    return RULE;
  }
  /* v283.36 · launch item 31 · THE LIVE FEED IS VERIFIED ON ITS OWN, separately from the building-code reference map: the felt-intensity rule
     must be the built rule (an intensity equation with its validity, levels, at least one feed, a magnitude floor below 9), else the live
     feed does not start and says "not available" (a stub rule showed no earthquake ever, silently). */
  function ruleCheck() { let R = null; try { R = rule(); } catch (e) { return { ok: false, why: 'not available: ' + e.message }; }
    const bad = []; if (!R.ipe || !R.ipe.validity || !Number.isFinite(R.ipe.validity.mwMin)) bad.push('no intensity-equation validity'); if (!Array.isArray(R.levels) || R.levels.length < 2) bad.push('fewer than 2 intensity levels');
    if (!R.poll || !Array.isArray(R.poll.feeds) || !R.poll.feeds.length) bad.push('no feed'); if (!(Number(R.magMin) < 9)) bad.push('magnitude floor ' + R.magMin); if (/stub/i.test(String(R.version || ''))) bad.push('stub version');
    return bad.length ? { ok: false, why: 'not available: the earthquake felt-intensity rule (data/seismic-felt-rule.json) is not the built rule (' + bad.join(', ') + ')', version: R.version || null } : { ok: true, version: R.version }; }
  /* ── tehsils: the Pakistan units (the disputed IIOJK unit is displayed elsewhere, never scored) ── */
  let T = null;
  function tehsils() {
    if (T) return T;
    const g = JSON.parse(readFileSync(join(dataDir, 'pk-tehsils.json'), 'utf8'));
    T = g.features.filter((f) => f && f.geometry && !/Indian Illegally Occupied/i.test(f.properties.province || '')).map((f) => {
      const rings = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
      let bb = [180, 90, -180, -90]; for (const r of rings) for (const [x, y] of r) { if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y; }
      const p = f.properties; return { uid: p.uid, tehsil: p.tehsil, district: p.district, province: p.province, rings, bb, geometry: f.geometry };
    });
    return T;
  }
  const gc = (la1, lo1, la2, lo2) => { const a = Math.sin((la2 - la1) * D2R / 2) ** 2 + Math.cos(la1 * D2R) * Math.cos(la2 * D2R) * Math.sin((lo2 - lo1) * D2R / 2) ** 2; return 2 * RE * Math.asin(Math.min(1, Math.sqrt(a))); };
  function inside(lon, lat, rings) {   /* even-odd over every ring (holes handled) */
    let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; }
    return c;
  }
  /* nearest point of the polygon to (lon, lat): {km, lon, lat}; km 0 inside. Local equirectangular frame (< 0.5 % at 300 km) */
  function nearest(lon, lat, t) {
    if (inside(lon, lat, t.rings)) return { km: 0, lon, lat };
    const kx = RE * D2R * Math.cos(lat * D2R), ky = RE * D2R; let best = Infinity, bx0 = lon, by0 = lat;
    for (const r of t.rings) for (let i = 1; i < r.length; i++) {
      const ax = (r[i - 1][0] - lon) * kx, ay = (r[i - 1][1] - lat) * ky, bx = (r[i][0] - lon) * kx, by = (r[i][1] - lat) * ky;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let s = L ? -(ax * dx + ay * dy) / L : 0; s = Math.max(0, Math.min(1, s));
      const px = ax + s * dx, py = ay + s * dy, d = Math.hypot(px, py);
      if (d < best) { best = d; bx0 = lon + px / kx; by0 = lat + py / ky; } }
    return { km: best, lon: bx0, lat: by0 };
  }
  function ipe(M, R) {
    const C = rule().ipe.coeffs; const rm = C.m1 + C.m2 * Math.exp(M - 5);
    let f = C.c2 * Math.log(Math.sqrt(R * R + rm * rm)); if (R > 50) f += C.c4 * Math.log(R / 50);
    return C.c0 + C.c1 * M + f;
  }
  function levelOf(mmi) { let L = null, i = -1; rule().levels.forEach((x, k) => { if (mmi >= x.mmiMin) { L = x; i = k; } }); return L ? { L, i } : null; }
  function box() {
    const R = rule().region, B = R.pakistanBbox, buf = R.bufferKm;
    return { minlatitude: B[1] - buf / 111.2, maxlatitude: B[3] + buf / 111.2, minlongitude: B[0] - buf / (111.2 * Math.cos(B[3] * D2R)), maxlongitude: B[2] + buf / (111.2 * Math.cos(B[3] * D2R)) };
  }
  const inBox = (lon, lat) => { const b = box(); return lat >= b.minlatitude && lat <= b.maxlatitude && lon >= b.minlongitude && lon <= b.maxlongitude; };
  async function get(u) {
    const ms = ((rule().poll && rule().poll.timeoutSeconds) || 20) * 1000;
    const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error('upstream ' + r.status + ' ' + u.replace(/\?.*/, '')); return r.json();
  }

  /* ── the ShakeMap grid of an event (null when it has none) ── */
  function smProduct(detail) { const P = detail && detail.properties && detail.properties.products; const sm = P && P.shakemap && P.shakemap[0]; return sm || null; }
  function smVersion(sm) { return sm ? String((sm.properties && sm.properties.version) || '') + '@' + (sm.updateTime || '') : null; }
  async function smGrid(sm) {
    const c = sm && sm.contents && sm.contents['download/coverage_mmi_low_res.covjson']; if (!c) return null;
    const j = await get(c.url); return packGrid(j);
  }
  function packGrid(j) {
    const ax = j.domain.axes, step = (a) => (a.stop - a.start) / (a.num - 1);
    return { nx: ax.x.num, ny: ax.y.num, x0: ax.x.start, y0: ax.y.start, dx: step(ax.x), dy: step(ax.y), vals: j.ranges.MMI.values };
  }
  function gridAt(g, lon, lat) {
    const ix = Math.round((lon - g.x0) / g.dx), iy = Math.round((lat - g.y0) / g.dy);
    if (ix < 0 || iy < 0 || ix >= g.nx || iy >= g.ny) return null; const v = g.vals[iy * g.nx + ix]; return v == null ? null : v;
  }

  /* ── flags for one event ── */
  function flagsFor(ev, grid) {
    const RL = rule(), V = RL.ipe.validity, buf = Math.min(RL.region.bufferKm, V.distanceKmMax);
    const { lon, lat, depthKm: dep, mag: M } = ev; const ipeOk = M >= V.mwMin && M <= V.mwMax && dep != null && Number.isFinite(dep); const out = [];   /* v91.17.93: an unknown depth is not 0 km: no equation estimate without it (ShakeMap still used) */
    if (!grid && !ipeOk) return out;
    for (const t of tehsils()) {
      /* bounding-box prefilter: the box's nearest point is never farther than the polygon's */
      const cx = Math.max(t.bb[0], Math.min(lon, t.bb[2])), cy = Math.max(t.bb[1], Math.min(lat, t.bb[3]));
      if (gc(lat, lon, cy, cx) > buf) continue;
      const n = nearest(lon, lat, t); if (n.km > buf) continue;
      let mmi = null, src = null;
      if (grid) { let mx = null;
        const i0 = Math.max(0, Math.floor((Math.min(t.bb[0], t.bb[2]) - grid.x0) / grid.dx) - 1), i1 = Math.min(grid.nx - 1, Math.ceil((t.bb[2] - grid.x0) / grid.dx) + 1);
        const ja = (t.bb[1] - grid.y0) / grid.dy, jb = (t.bb[3] - grid.y0) / grid.dy;
        const j0 = Math.max(0, Math.floor(Math.min(ja, jb)) - 1), j1 = Math.min(grid.ny - 1, Math.ceil(Math.max(ja, jb)) + 1);
        for (let iy = j0; iy <= j1; iy++) { const y = grid.y0 + iy * grid.dy;
          for (let ix = i0; ix <= i1; ix++) { const x = grid.x0 + ix * grid.dx; const v = grid.vals[iy * grid.nx + ix];
            if (v != null && (mx == null || v > mx) && inside(x, y, t.rings)) mx = v; } }
        if (mx == null) mx = gridAt(grid, n.lon, n.lat);   /* a small tehsil between grid cells: the value at its nearest point */
        if (mx != null) { mmi = mx; src = 'ShakeMap'; } }
      /* v91.17.283.3 · audit C7 · the equation (Allen et al. 2012, Rhypo) is valid below 300 km HYPOCENTRAL distance: the guard is on
         Rhypo, not on the epicentral distance (a deep event 250 km away at 200 km depth is 320 km away: no equation estimate) */
      if (mmi == null && ipeOk) { const rh = Math.sqrt(n.km * n.km + dep * dep); if (rh <= V.distanceKmMax) { mmi = ipe(M, rh); src = 'equation'; } }
      if (mmi == null) continue;
      const lv = levelOf(mmi); if (!lv) continue;
      out.push({ uid: t.uid, tehsil: t.tehsil, district: t.district, province: t.province, level: lv.L.level, levelIndex: lv.i + 1,
                 expectedIntensity: Math.round(mmi * 100) / 100, distanceKm: Math.round(n.km * 10) / 10, source: src });
    }
    return out.sort((a, b) => b.expectedIntensity - a.expectedIntensity || a.distanceKm - b.distanceKm);
  }

  /* ── state ── */
  const S = { events: new Map(), emsc: new Map(), emscAt: 0, emscOk: 0, emscError: null, emscPolls: 0, emscFeed: null, lastPollAt: 0, lastPollOk: 0, lastRevisionAt: 0, revisedThrough: null, lastError: null, polls: 0, revisions: 0, busy: null, feeds: {}, revision: null };
  try { if (existsSync(STATE_F)) { const j = JSON.parse(readFileSync(STATE_F, 'utf8'));
      for (const e of j.events || []) S.events.set(e.id, e); for (const e of j.emsc || []) S.emsc.set(e.id, e); S.emscOk = j.emscOk || 0; S.lastPollOk = j.lastPollOk || 0; S.lastRevisionAt = j.lastRevisionAt || 0; S.revisedThrough = j.revisedThrough || null; } } catch (_) {}
  function persist() {
    try { mkdirSync(CDIR, { recursive: true }); const tmp = STATE_F + '.tmp';
      writeFileSync(tmp, JSON.stringify({ rule: rule().version, saved: new Date().toISOString(), lastPollOk: S.lastPollOk, lastRevisionAt: S.lastRevisionAt, revisedThrough: S.revisedThrough, events: [...S.events.values()], emsc: [...S.emsc.values()], emscOk: S.emscOk }));
      renameSync(tmp, STATE_F); } catch (e) { S.lastError = 'persist: ' + e.message; }
  }
  function prune() { const cut = Date.now() - rule().retainDays * 864e5; for (const [k, e] of S.events) if (e.time < cut) S.events.delete(k); for (const [k, e] of S.emsc) if (e.time < cut) S.emsc.delete(k); }
  function baseEvent(f) {
    const p = f.properties || {}, g = (f.geometry && f.geometry.coordinates) || [];
    return { id: f.id, time: p.time, updated: p.updated, mag: p.mag, magType: p.magType || null, depthKm: g[2], lon: g[0], lat: g[1], place: p.place || null, status: p.status || null };
  }
  /* one feature (summary feed, fdsnws list or detail): recompute only when the event or its ShakeMap changed */
  async function ingest(f, via) {
    const RL = rule(), p = f.properties || {}, g = f.geometry && f.geometry.coordinates;
    if (!f.id || !g || p.mag == null) return false;
    if (p.status === 'deleted' || (p.type && p.type !== 'earthquake')) { return S.events.delete(f.id); }
    if (p.mag < RL.magMin || !inBox(g[0], g[1]) || p.time < Date.now() - RL.retainDays * 864e5) return false;
    const old = S.events.get(f.id); const hasSm = /,shakemap,/.test(p.types || '') || !!smProduct(f);
    /* ComCat bumps `updated` when any product of the event changes (a new ShakeMap version included): unchanged = skip.
       A ShakeMap that failed to download is retried on the next polls (at most 3 tries per event version). */
    /* (compared to the second: events saved from the former lake read (to 283.24) carry `updated` to the second, the feeds to the millisecond) */
    if (old && Math.floor(old.updated / 1000) === Math.floor(p.updated / 1000) && !(hasSm && !old.shakemap && (old.smTries || 0) < 3)) return false;
    const ev = baseEvent(f); let grid = null, ver = null;
    if (hasSm) { try { const det = smProduct(f) ? f : await get(p.detail); const sm = smProduct(det); ver = smVersion(sm); if (sm) grid = await smGrid(sm); }
      catch (e) { S.lastError = 'shakemap ' + f.id + ': ' + e.message; grid = null; } }
    ev.shakemap = !!grid; ev.shakemapVersion = grid ? ver : null; ev.via = via; ev.flags = flagsFor(ev, grid); ev.source = 'USGS'; ev.firstSeen = old && old.firstSeen ? old.firstSeen : Date.now();
    ev.smTries = hasSm && !grid ? (old && old.updated === p.updated ? (old.smTries || 0) + 1 : 1) : 0;
    S.events.set(ev.id, ev); return true;
  }
  function serial(fn) { const run = (S.busy || Promise.resolve()).catch(() => {}).then(fn); S.busy = run.finally(() => { if (S.busy === run) S.busy = null; }); return run; }
  async function poll() {
    return serial(async () => {
      S.lastPollAt = Date.now(); S.polls++; let n = 0, errs = [];
      for (const u of rule().poll.feeds) {
        try { const j = await get(u); let kept = 0;
          for (const f of j.features || []) { const p = f.properties || {}, g = f.geometry && f.geometry.coordinates;
            if (g && p.mag != null && p.mag >= rule().magMin && inBox(g[0], g[1])) kept++;
            if (await ingest(f, 'feed')) n++; }
          S.feeds[u.replace(/^.*\/summary\//, '')] = { features: (j.features || []).length, inRegion: kept, generated: j.metadata && j.metadata.generated ? new Date(j.metadata.generated).toISOString() : null, at: new Date().toISOString() };
        } catch (e) { errs.push(e.message); }
      }
      if (errs.length < rule().poll.feeds.length) S.lastPollOk = Date.now();
      S.lastError = errs.length ? errs.join('; ') : (S.lastError && /^shakemap/.test(S.lastError) ? S.lastError : null);
      prune(); persist(); return { changed: n, errors: errs };
    });
  }
  /* v91.17.283.25 · the revision pass asks USGS itself (fdsnws updatedafter): the AGN data lake's copy of that query (v91.17.216-283.24)
     is no longer read (owner, 27 Oct 2026: NIGRAAN leaves D:\DATA LAKE). The 1-minute summary feeds were always this server's own. */
  async function revise() {
    return serial(async () => {
      const RL = rule(), b = box(), now = Date.now();
      const q = new URLSearchParams({ format: 'geojson', includedeleted: 'true', minmagnitude: String(RL.magMin), orderby: 'time', ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.toFixed(3)])) });
      if (S.revisedThrough) q.set('updatedafter', new Date(S.revisedThrough - 60e3).toISOString().slice(0, 19));
      else q.set('starttime', new Date(now - RL.retainDays * 864e5).toISOString().slice(0, 19));
      let n = 0;
      try { const j = await get((process.env.NIGRAAN_USGS_FDSN_URL || 'https://earthquake.usgs.gov/fdsnws/event/1/query') + '?' + q);   /* v283.31 · test override */
        for (const f of j.features || []) if (await ingest(f, 'revision')) n++;
        S.revision = { features: (j.features || []).length, changed: n, mode: q.has('updatedafter') ? 'updatedafter' : 'starttime', at: new Date(now).toISOString() };
        S.revisedThrough = now; S.lastRevisionAt = now; S.revisions++; prune(); persist(); return { changed: n };
      } catch (e) { S.lastError = 'revision: ' + e.message; S.lastRevisionAt = now; return { changed: 0, error: e.message }; }
    });
  }
  /* == v91.17.283.31 · owner request · A SECOND EARTHQUAKE SOURCE: EMSC ==============================================================
     The European-Mediterranean Seismological Centre's FDSN event service (https://www.seismicportal.eu/fdsnws/event/1/query, public;
     credit "EMSC"), asked over the same buffered Pakistan box and magnitude floor as the USGS revision query, at the USGS feed cadence.
     MERGE RULE: an EMSC event and a USGS event are the same event when their origin times are within 60 s and their epicentres within
     100 km; the merged event keeps the USGS record (its ShakeMap, its id) and lists both sources' magnitude and location; "first known at"
     is the earliest time this server learnt of it from either source. An event only one source reports is kept, labelled with that
     source; an EMSC-only event is scored with the intensity equation (no ShakeMap). One source down: the other's events are served as
     before and the down source is named in the status and in feed health. */
  const SAME_S = 60, SAME_KM = 100;
  const EMSC_URL = process.env.NIGRAAN_EMSC_URL || 'https://www.seismicportal.eu/fdsnws/event/1/query';
  function emscEvent(f) {
    const p = f.properties || {}, g = (f.geometry && f.geometry.coordinates) || [];
    const id = String(p.unid || f.id || ''); const t = Date.parse(p.time); if (!id || !Number.isFinite(t) || p.mag == null) return null;
    const lat = Number.isFinite(+p.lat) ? +p.lat : g[1], lon = Number.isFinite(+p.lon) ? +p.lon : g[0];
    return { id: 'emsc' + id.replace(/[^a-z0-9]/gi, ''), emscId: id, time: t, updated: Date.parse(p.lastupdate) || t, mag: +p.mag, magType: p.magtype || null,
      depthKm: Number.isFinite(+p.depth) ? +p.depth : (g[2] != null ? Math.abs(g[2]) : null), lon, lat, place: p.flynn_region || null, status: p.evtype || null, authority: p.auth || null };
  }
  async function pollEmsc() {
    return serial(async () => {
      const RL = rule(), b = box(), now = Date.now(); S.emscAt = now; S.emscPolls++;
      const q = new URLSearchParams({ format: 'json', minmagnitude: String(RL.magMin), orderby: 'time', limit: '500', starttime: new Date(now - RL.retainDays * 864e5).toISOString().slice(0, 19),
        ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.toFixed(3)])) });
      try { const j = await get(EMSC_URL + '?' + q); let n = 0; const seen = new Set();
        for (const f of j.features || []) { const e = emscEvent(f); if (!e || e.mag < RL.magMin || !inBox(e.lon, e.lat) || e.time < now - RL.retainDays * 864e5) continue;
          seen.add(e.id); const old = S.emsc.get(e.id);
          if (old && old.updated === e.updated) continue;
          e.firstSeen = old && old.firstSeen ? old.firstSeen : now; e.source = 'EMSC'; e.flags = flagsFor(e, null); S.emsc.set(e.id, e); n++; }
        S.emscOk = now; S.emscError = null; S.emscFeed = { features: (j.features || []).length, kept: seen.size, changed: n, at: new Date(now).toISOString() };
        prune(); persist(); return { changed: n };
      } catch (e) { S.emscError = e.message; return { changed: 0, error: e.message }; }
    });
  }
  function distKm(a, b) { const p1 = a.lat * D2R, p2 = b.lat * D2R, dp = (b.lat - a.lat) * D2R, dl = (b.lon - a.lon) * D2R;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 2 * RE * Math.asin(Math.min(1, Math.sqrt(h))); }
  const srcOf = (e, name) => ({ source: name, id: name === 'EMSC' ? e.emscId : e.id, mag: e.mag, magType: e.magType, lat: e.lat, lon: e.lon, depthKm: e.depthKm, time: new Date(e.time).toISOString(), firstSeen: e.firstSeen ? new Date(e.firstSeen).toISOString() : null });
  /* the merged event list: USGS events (with any matching EMSC event attached) and EMSC-only events */
  /* v91.17.283.40 · item 31 · ONE EVENT, NOT TWO, WHEN ONE AGENCY'S EPICENTRE IS FAR OFF. 12-month check (scripts/tests28340/quake_feeds40.py,
     M4+, the buffered box): 326 USGS-EMSC pairs by the 60 s / 100 km rule (time difference max 11 s, distance median 7 km, p90 27 km), but two
     events were split into two map events because the EMSC record's authority (a regional agency) placed them 137 and 139 km from the USGS
     epicentre (26 Oct 2026 Sann M4.3, 10 Aug 2026 Gadani M4.2). Second pass, for events still unmatched: within 60 s and within the rule
     file's region buffer (bufferKm, the intensity equation's 300 km validity limit, beyond which no tehsil is scored anyway) when the pair is
     MUTUALLY UNIQUE (each is the other's only unmatched candidate). Chance coincidence of two different events within 60 s anywhere in the
     box: about 0.5 a year at the 12-month rates, and 0 ambiguous cases in the 12 months; the merged event keeps the USGS location and lists
     the EMSC one with its distance (matchWide true). */
  function merged(usgs = [...S.events.values()], emsc = [...S.emsc.values()]) {
    const used = new Set(), out = [], match = new Map();
    for (const u of usgs) {
      let best = null, bd = Infinity;
      for (const e of emsc) { if (used.has(e.id) || Math.abs(e.time - u.time) > SAME_S * 1000) continue; const d = distKm(u, e); if (d <= SAME_KM && d < bd) { best = e; bd = d; } }
      if (best) { used.add(best.id); match.set(u.id, { e: best, d: bd, wide: false }); }
    }
    let WIDE_KM = SAME_KM; try { const b = Number(rule().region && rule().region.bufferKm); if (b > SAME_KM) WIDE_KM = b; } catch (_) {}
    const cand = (a, pool, ok) => pool.filter((x) => ok(x) && Math.abs(x.time - a.time) <= SAME_S * 1000 && distKm(a, x) <= WIDE_KM);
    for (const u of usgs) { if (match.has(u.id)) continue;
      const c = cand(u, emsc, (e) => !used.has(e.id)); if (c.length !== 1) continue;
      const back = cand(c[0], usgs, (x) => !match.has(x.id)); if (back.length !== 1 || back[0].id !== u.id) continue;
      used.add(c[0].id); match.set(u.id, { e: c[0], d: distKm(u, c[0]), wide: true }); }
    for (const u of usgs) {
      const m = match.get(u.id) || null, best = m ? m.e : null, bd = m ? m.d : Infinity;
      const sources = [srcOf(u, 'USGS')]; if (best) { sources.push(srcOf(best, 'EMSC')); }
      const fk = Math.min(...[u.firstSeen, best && best.firstSeen].filter(Number.isFinite));
      out.push({ ...u, source: best ? 'USGS + EMSC' : 'USGS', sources, ...(best ? { matchKm: Math.round(bd * 10) / 10, matchSeconds: Math.round(Math.abs(best.time - u.time) / 1000), ...(m.wide ? { matchWide: true } : {}) } : {}), firstKnownAt: Number.isFinite(fk) ? fk : null });
    }
    for (const e of emsc) if (!used.has(e.id)) out.push({ ...e, source: 'EMSC', sources: [srcOf(e, 'EMSC')], firstKnownAt: e.firstSeen || null });
    return out;
  }
  async function fresh(maxWaitMs = 25000) {
    const RL = rule(), tasks = [];
    if (!S.revisedThrough || Date.now() - S.lastRevisionAt > RL.poll.revisionSeconds * 1000) tasks.push(revise());
    if (Date.now() - S.lastPollAt > RL.poll.feedSeconds * 1000) tasks.push(poll());
    if (emscOn && Date.now() - S.emscAt > RL.poll.feedSeconds * 1000) tasks.push(pollEmsc());
    if (!tasks.length) return;
    await Promise.race([Promise.allSettled(tasks), new Promise((r) => setTimeout(r, maxWaitMs).unref?.())]);
  }

  /* ── output ── */
  const PKT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  const pkt = (t) => { try { return PKT.format(new Date(t)) + ' PKT'; } catch { return null; } };
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  function geomOf(uid) { const t = tehsils().find((x) => x.uid === uid); if (!t) return null;
    const rr = (r) => r.map(([x, y]) => [r4(x), r4(y)]); const g = t.geometry;
    return g.type === 'Polygon' ? { type: 'Polygon', coordinates: g.coordinates.map(rr) } : { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map(rr)) }; }
  const PKIN = new Map();
  function inPk(lon, lat) { const k = lon.toFixed(3) + ',' + lat.toFixed(3); if (PKIN.has(k)) return PKIN.get(k);
    let v = false; for (const t of tehsils()) { if (lon < t.bb[0] || lon > t.bb[2] || lat < t.bb[1] || lat > t.bb[3]) continue; if (inside(lon, lat, t.rings)) { v = true; break; } }
    if (PKIN.size > 5000) PKIN.clear(); PKIN.set(k, v); return v; }
  function shape(events, { geom = false, replay = false } = {}) {
    const RL = rule(), W = RL.levels.map((l) => l.level);
    /* v91.17.280 · FIX280-2 · owner rule (9 Oct 2026, restated 19 Oct): an earthquake is a reference, not a forecast. It alerts for
       24 hours after its origin time, then stays on the map overlay only (retainDays). This replaces the rule file's "[assumed]" 7-day
       window (alert.windowDays); the shorter of the two is used, so a rule file can only narrow it. */
    const winMs = Math.min(OWNER_ALERT_WINDOW_H * 3600e3, ((RL.alert && RL.alert.windowDays) || 0) * 864e5 || Infinity);
    const evs = events.slice().sort((a, b) => b.time - a.time).map((e) => {
      const by = Object.fromEntries(W.map((w) => [w, 0])); for (const f of e.flags || []) by[f.level]++;
      const top = (e.flags || [])[0] || null;
      return { id: e.id, time: new Date(e.time).toISOString(), timePkt: pkt(e.time), mag: e.mag, magType: e.magType, depthKm: e.depthKm, lon: e.lon, lat: e.lat, place: e.place,
               source: e.source || 'USGS', sources: e.sources || [{ source: e.source || 'USGS', id: e.id, mag: e.mag, lat: e.lat, lon: e.lon }], firstKnownAt: e.firstKnownAt ? new Date(e.firstKnownAt).toISOString() : (e.firstSeen ? new Date(e.firstSeen).toISOString() : null),
               status: e.status, intensitySource: e.shakemap ? 'ShakeMap' : (e.mag >= RL.ipe.validity.mwMin && e.mag <= RL.ipe.validity.mwMax ? 'equation' : 'none'),
               outsideValidity: !e.shakemap && !(e.mag >= RL.ipe.validity.mwMin && e.mag <= RL.ipe.validity.mwMax),
               withinAlertWindow: replay || Date.now() - e.time <= winMs,
               /* v91.17.79 · CEO: the epicentres across the border that shook no tehsil were most of the map. Each event says
                  whether its epicentre lies in Pakistan (inside a tehsil polygon, AJK and GB included); the map shows those and
                  the ones across the border that are expected to have been felt in a tehsil, and counts the rest. */
               inPakistan: inPk(e.lon, e.lat),
               flaggedCount: (e.flags || []).length, byLevel: by, maxLevel: top ? top.level : null, maxIntensity: top ? top.expectedIntensity : null,
               tehsils: (e.flags || []).map((f) => ({ ...f })) };
    });
    /* the worst flag per tehsil across the retained events */
    const worst = new Map();
    for (const e of evs) for (const f of e.tehsils) { const w = worst.get(f.uid);
      if (!w || f.levelIndex > w.levelIndex || (f.levelIndex === w.levelIndex && f.expectedIntensity > w.expectedIntensity)) worst.set(f.uid, { ...f, eventId: e.id, mag: e.mag, time: e.time, timePkt: e.timePkt, withinAlertWindow: e.withinAlertWindow }); }
    const flagged = [...worst.values()].sort((a, b) => b.levelIndex - a.levelIndex || b.expectedIntensity - a.expectedIntensity);
    if (geom) for (const f of flagged) f.geometry = geomOf(f.uid);
    return { events: evs, flagged, levels: RL.levels.map((l, i, A) => ({ level: l.level, levelIndex: i + 1, mmiMin: l.mmiMin, shaking: l.shaking, plain: shakingWords(l, i === A.length - 1) })),
             credit: label('earthquakeFeed'), rule: RL.version, retainDays: RL.retainDays, magMin: RL.magMin, alertWindowDays: Math.round(winMs / 864e5 * 100) / 100, alertWindowHours: Math.round(winMs / 3600e3),
             refreshSeconds: RL.poll.feedSeconds,
             markerRadiusPx: RL.display && RL.display.markerRadiusPx ? { base: RL.display.markerRadiusPx.base, perMagnitude: RL.display.markerRadiusPx.perMagnitude } : null };
  }
  async function live(q = {}) {
    await fresh();
    const age = S.lastPollOk ? Math.round((Date.now() - S.lastPollOk) / 6e4) : null;
    return { ok: true, generated: new Date().toISOString(), stale: !S.lastPollOk || Date.now() - S.lastPollOk > 3 * rule().poll.feedSeconds * 1000, ageMin: age,
             emsc: { ok: !!S.emscOk && !S.emscError, lastOk: S.emscOk ? new Date(S.emscOk).toISOString() : null, error: S.emscError },
             ...shape(merged(), q) };
  }
  const RP = new Map();
  async function replay(id, q = {}) {
    if (!ID_RE.test(String(id || ''))) return { ok: false, status: 422, why: 'event must be a catalogue event id (letters and digits)' };
    let ev = RP.get(id);
    if (!ev) {
      const f = join(CDIR, 'replay-' + id + '.json'); let raw = null;
      try { if (existsSync(f)) raw = JSON.parse(readFileSync(f, 'utf8')); } catch { raw = null; }
      if (!raw) {
        try { const det = await get('https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=' + encodeURIComponent(id));
          const sm = smProduct(det); let covjson = null;
          const c = sm && sm.contents && sm.contents['download/coverage_mmi_low_res.covjson']; if (c) covjson = await get(c.url);
          raw = { fetched: new Date().toISOString(), event: { type: 'Feature', id: det.id, geometry: det.geometry, properties: { ...det.properties, products: undefined } }, shakemapVersion: smVersion(sm), covjson };
          try { mkdirSync(CDIR, { recursive: true }); writeFileSync(f + '.tmp', JSON.stringify(raw)); renameSync(f + '.tmp', f); } catch (_) {}
        } catch (e) { return { ok: false, status: /404|400/.test(e.message) ? 404 : 502, why: 'event not available: ' + e.message }; }
      }
      const b = baseEvent(raw.event), grid = raw.covjson ? packGrid(raw.covjson) : null;
      ev = { ...b, shakemap: !!grid, shakemapVersion: grid ? raw.shakemapVersion : null, via: 'replay', flags: flagsFor(b, grid) };
      if (RP.size > 20) RP.delete(RP.keys().next().value); RP.set(id, ev);
    }
    return { ok: true, replay: true, generated: new Date().toISOString(), ...shape([ev], { ...q, replay: true }) };
  }
  function status() {
    const RC = ruleCheck(); if (!RC.ok) return { ok: false, verified: false, why: RC.why, rule: RC.version || null, timers: false, events: 0, lastPollOk: null };
    return { ok: true, verified: true, rule: rule().version, events: S.events.size, flaggedEvents: [...S.events.values()].filter((e) => (e.flags || []).length).length,
             lastPollAt: S.lastPollAt ? new Date(S.lastPollAt).toISOString() : null, lastPollOk: S.lastPollOk ? new Date(S.lastPollOk).toISOString() : null,
             lastRevisionAt: S.lastRevisionAt ? new Date(S.lastRevisionAt).toISOString() : null, polls: S.polls, revisions: S.revisions, feeds: S.feeds, revision: S.revision, lastError: S.lastError,
             feedSeconds: rule().poll.feedSeconds, revisionSeconds: rule().poll.revisionSeconds, timers: timersOn,
             emsc: { on: emscOn, events: S.emsc.size, polls: S.emscPolls, lastPollAt: S.emscAt ? new Date(S.emscAt).toISOString() : null, lastPollOk: S.emscOk ? new Date(S.emscOk).toISOString() : null, lastError: S.emscError, feed: S.emscFeed, periodSeconds: rule().poll.feedSeconds, url: EMSC_URL.replace(/\?.*/, '') },
             sources: ['USGS', 'EMSC'], mergeRule: { seconds: SAME_S, km: SAME_KM, wideKm: (() => { try { const b = Number(rule().region.bufferKm); return b > SAME_KM ? b : SAME_KM; } catch (_) { return SAME_KM; } })(), wideRule: 'still unmatched, within the seconds and wideKm, and each the other\'s only candidate' } };
  }
  /* compatibility for the old client loader (/api/ext/usgs): the retained regional events, GeoJSON */
  async function extFeed() {
    await fresh(20000);
    return { type: 'FeatureCollection', metadata: { generated: Date.now(), count: S.events.size, title: 'recent regional earthquakes (M' + rule().magMin + '+, ' + rule().retainDays + ' days)' },
             features: merged().sort((a, b) => b.time - a.time).map((e) => ({ type: 'Feature', id: e.id, geometry: { type: 'Point', coordinates: [e.lon, e.lat, e.depthKm] },
               properties: { mag: e.mag, magType: e.magType, time: e.time, updated: e.updated, place: e.place, status: e.status, source: e.source, sources: e.sources } })) };
  }
  async function route(p, url, req) {
    if (req.method !== 'GET') return null;
    const geom = url.searchParams.get('geom') === '1';
    try {
      if (p === '/api/quake/live' || p === '/api/quake/replay' || p === '/api/ext/usgs') { const RC = ruleCheck(); if (!RC.ok) return { status: 503, body: { ok: false, state: 'not available', why: RC.why } }; }   /* v283.36 item 31 */
      if (p === '/api/quake/live') return { status: 200, body: await live({ geom }) };
      if (p === '/api/quake/replay') { const r = await replay(url.searchParams.get('event'), { geom }); return { status: r.ok ? 200 : r.status, body: r.ok ? r : { ok: false, why: r.why } }; }
      if (p === '/api/quake/status') return { status: 200, body: status() };
      if (p === '/api/ext/usgs') return { status: 200, body: await extFeed(), headers: { 'x-agn-ext-cache': 'quake-module' } };
    } catch (e) { return { status: 503, body: { ok: false, why: 'earthquake module: ' + e.message } }; }
    return null;
  }

  const timersOn = opts.timers !== false && process.env.NIGRAAN_WORKER !== '0' && process.env.NIGRAAN_QUAKE !== '0' && ruleCheck().ok;   /* v283.36 item 31: never on a stub rule */
  var emscOn = opts.emsc !== false && process.env.NIGRAAN_EMSC !== '0';
  if (timersOn) {
    schedule(app, 'quake-revise', rule().poll.revisionSeconds * 1000, () => revise(), { firstMs: 30e3, label: 'earthquake catalogue revision (USGS)' });
    schedule(app, 'quake-feed', rule().poll.feedSeconds * 1000, () => poll(), { firstMs: 40e3, label: 'earthquake feed' });
    if (emscOn) schedule(app, 'quake-emsc', rule().poll.feedSeconds * 1000, () => pollEmsc(), { firstMs: 50e3, label: 'earthquake feed (EMSC)' });
  }
  return { live, replay, status, extFeed, poll, revise, pollEmsc, merged, emscEvent, route, flagsFor, ipe, rule };
}
