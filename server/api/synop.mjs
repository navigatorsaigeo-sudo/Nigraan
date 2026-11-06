/* ══ v91.17.147 · SYNOPTIC STATION RUNNING CORRECTION (PMD synop via the Ogimet relay of the WMO GTS) ══════════════════════
   What it is: 46 Pakistani synoptic stations report every 3 hours on the WMO network; Ogimet republishes the reports (FM-12 SYNOP).
   Every hour this module reads the last 30 hours for WMO blocks 415-417, decodes them (temperature, dew point, wind, rain; see
   decodeSynop), keeps 12 days, and pairs each reading with the value NIGRAAN serves at that station and hour (the full chain
   without this layer and without the live MACH layer: __nolive=1&__nosynop=1).

   The correction at a station (tested on Jun - Oct 2026, 47 stations, issue times every 12 h, only data before the issue time):
       residual(t) = observed - served
       running bias for an hour of day h = mean residual at h over the previous 10 days (at least 4 values)
       correction(t) = running bias(hour of t) + a(lead) * (latest residual - running bias at the latest report hour)
       a = 0.6 up to 3 h after the latest report, falling linearly to 0.2 at 6 h, 0.2 after
   Held out by time (scripts: station-lake synop/running_test.py): MAE of the served temperature at the station
       lead 3 h 1.39 -> 0.90 C, 6 h 1.29 -> 0.97, 12 h 1.34 -> 1.08, 24 h 1.34 -> 1.04, 48 h 1.33 -> 1.10.
   Reach: the correction belongs to the station's site. It applies in full within 5 km and fades to nothing at 15 km (the same
   reach as the airport thermometer offsets); spreading residuals between synop stations was tested and is not used: at the same
   hour neighbours within 150 km explain little (MAE 1.36 -> 1.31 at the station left out), the residual is mostly the site's own.
   It is not applied where the MACH running correction already applies (the two would correct the same error twice).
   NIGRAAN_SYNOP=0 switches it off. Ogimet asks for moderate use: 3 requests an hour. */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { esatHpa } from './psychro.mjs';
import { schedule } from './scheduler.mjs';
import { streamCsv, utcMs } from './copies.mjs';
import { ownDir } from './ownpaths.mjs';

/* ══ v91.17.280 · SYN280 (c2) · THE SYNOP TERM AT A POINT WITH ITS OWN STATION IS KEPT ONLY WHERE IT HELPED THERE ════════════════════
   Why: the running term belongs to the synop site, and it reached MACH 105 (Gilgit, AGN office, 3.8 km from the Gilgit synop 41516)
   in full: the airport's river cold pool came with it (night bias +2.96 C at 105, 1-18 Oct 2026). A point that has its own MACH
   station (one the live layer serves from) has its own evidence: the station's readings beside the value served there, with and without the term.
   Rule, per Pakistan day-part of the hour (day 09-16 PKT, night 20-05, between otherwise; the live layer's siting-offset parts):
     over the previous 10 complete PKT days at the station (the running term's own window), MAE(served with the term) and
     MAE(served without it) of the station's pairs of that part; the term is kept for that part when MAE with <= MAE without.
     Fewer than MIN_N pairs (the module's own minimum for a same-hour running bias, 4): kept (the behaviour before this rule).
   Pairs: the fleet pairs as recorded when served (station-lake/archive/fleet/fleet_pairs_YYYY-MM.csv: the reading and the served
   chain up to the live layer, i.e. WITH the term as served then; one per station hour: the shortest lead, then the reading nearest the hour), only pairs made at the
   station's current position (a moved station, MACH 108 14 Oct 2026, keeps none from the old one: the fleet's own 0.5 km rule).
   The term served with each pair is rebuilt from the synop records as they stood when the pair was made (model(sid, paired),
   corrAt at the pair's hour, the station's own reach weight); without = served - term. The records: the lake's synop archive
   (synop_YYYY-MM.jsonl, every report kept) under the 12 days the module holds. No threshold is typed: the comparison decides.
   Held out by day (GILGIT280: /tmp/claude-0/v280/gilgit/replay.py, replay_test_c2.csv; 12-18 Oct 2026, each day decided only from
   the 10 days before it): MACH 105 MAE 2.37 -> 1.63 C (95 % CI of the change -1.14..-0.40), MACH 108 1.24 -> 1.24 (too few pairs at
   its new position: kept), Kanju (MACH 84, 1.9 km from Saidu Sharif) 1.68 -> 1.67. Points with no own station: unchanged.
   The decision table is rebuilt once per PKT day (and after the synop poll); each served point records its decision, both MAEs and n
   (agn_synop.stationTest). NIGRAAN_SYNOP_C2=0 switches the rule off (the term then applies as before). */
const PKT_MS = 5 * 3600e3, DAY_MS = 864e5;
export function dayPart(ms) { const h = new Date(ms + PKT_MS).getUTCHours(); return h >= 9 && h <= 16 ? 'day' : (h >= 20 || h <= 5) ? 'night' : 'between'; }
export const pktDay = (ms) => Math.floor((ms + PKT_MS) / DAY_MS);
/* rows: [{ hourMs, obs, withT, withoutT }]; today: PKT day index. Window: PKT days today-win .. today-1. */
export function c2Decide(rows, today, win = 10, minN = 4) {
  const acc = { day: [0, 0, 0], night: [0, 0, 0], between: [0, 0, 0] };
  for (const r of rows) { const d = pktDay(r.hourMs); if (d >= today || d < today - win) continue;
    if (![r.obs, r.withT, r.withoutT].every(Number.isFinite)) continue;
    const a = acc[dayPart(r.hourMs)]; a[0]++; a[1] += Math.abs(r.obs - r.withT); a[2] += Math.abs(r.obs - r.withoutT); }
  const out = {};
  for (const [k, [n, sw, so]] of Object.entries(acc)) {
    const mw = n ? Math.round(sw / n * 1000) / 1000 : null, mo = n ? Math.round(so / n * 1000) / 1000 : null;
    out[k] = n < minN ? { keep: true, n, maeWith: mw, maeWithout: mo, why: 'fewer than ' + minN + ' pairs: term kept (as before)' }
                      : { keep: sw <= so, n, maeWith: mw, maeWithout: mo, why: sw <= so ? 'term helped at the station' : 'term did not help at the station' };
  }
  return out;
}

const km = (a, b, c, d) => { const p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const r1 = (x) => Math.round(x * 10) / 10;
const TR = { 1: 6, 2: 12, 3: 18, 4: 24, 5: 1, 6: 2, 7: 3, 8: 9, 9: 15 };
function t10(g) { if (!/^[01]\d{3}$/.test(g)) return null; const v = Number(g.slice(1)) / 10; return g[0] === '1' ? -v : v; }
/* FM-12 SYNOP, section 1 and 333 (max / min); wind unit from iw (0/1 m/s, 3/4 knots) */
export function decodeSynop(line) {
  const p = String(line).trim().split(','); if (p.length < 7) return null;
  const body = p.slice(6).join(',').replace(/=/g, '').trim().split(/\s+/); const i = body.indexOf('AAXX'); if (i < 0) return null;
  const g = body.slice(i + 1); if (g.length < 4) return null;
  const iw = g[0].length === 5 ? g[0][4] : '/'; const kt = iw === '3' || iw === '4';
  const rec = { sid: p[0], t: `${p[1]}-${p[2]}-${p[3]}T${p[4]}:${p[5]}:00Z` };
  let s1 = g.slice(2), s3 = []; const k3 = s1.indexOf('333'); if (k3 >= 0) { s3 = s1.slice(k3 + 1); s1 = s1.slice(0, k3); }
  for (const stop of ['555', '444', '222']) { let k = s1.indexOf(stop); if (k >= 0) s1 = s1.slice(0, k); k = s3.indexOf(stop); if (k >= 0) s3 = s3.slice(0, k); }
  if (!s1.length) return rec;
  const ir = s1[0].length === 5 ? s1[0][0] : '/';
  if (/^[0-4]$/.test(ir)) rec.ir = ir;   /* v91.17.284 · kept in the lake line: iR 3 = no precipitation (group 6 omitted), so a dry 6 h can be scored (shadow_score.mjs) */
  if (s1[1] && /^[\d/]{5}$/.test(s1[1])) { const dd = Number(s1[1].slice(1, 3)), ff = Number(s1[1].slice(3, 5)); if (Number.isFinite(dd) && Number.isFinite(ff) && (dd <= 36 || dd === 99)) { rec.wdir = dd === 0 ? 0 : dd === 99 ? null : dd * 10; rec.wspd = r1(ff * (kt ? 0.514444 : 1)); } }
  const seen = new Set(); const start = (s1[2] && s1[2].startsWith('00')) ? 3 : 2;
  for (const grp of s1.slice(start)) { if (grp.length !== 5) continue; const c = grp[0]; if (seen.has(c)) continue; seen.add(c);
    if (c === '1') rec.t_c = t10(grp.slice(1)); else if (c === '2' && (grp[1] === '0' || grp[1] === '1')) rec.td_c = t10(grp.slice(1));
    else if (c === '6' && (ir === '0' || ir === '1') && /^\d{3}$/.test(grp.slice(1, 4))) { const r = Number(grp.slice(1, 4)); rec.rain_mm = r === 990 ? 0 : r > 990 ? (r - 990) / 10 : r; rec.rain_h = TR[grp[4]] || null; } }
  for (const grp of s3) { if (grp.length !== 5) continue; if (grp[0] === '1' && (grp[1] === '0' || grp[1] === '1')) rec.tmax_c = t10(grp.slice(1)); else if (grp[0] === '2' && (grp[1] === '0' || grp[1] === '1')) rec.tmin_c = t10(grp.slice(1)); }
  /* plausibility (physics screen): -40..55 C, dew point not above temperature by more than 0.5 C */
  if (rec.t_c != null && (rec.t_c < -40 || rec.t_c > 55)) rec.t_c = null;
  if (rec.td_c != null && (rec.t_c == null || rec.td_c > rec.t_c + 0.5)) rec.td_c = null;
  return rec;
}

export function createSynop(app, dataDir) {
  const on = () => process.env.NIGRAAN_SYNOP !== '0';
  const stFile = join(dataDir, 'synop-stations.json'), recFile = join(dataDir, 'cache', 'synop-recent.json');
  let ST = {}; try { ST = JSON.parse(readFileSync(stFile, 'utf8')).stations || {}; } catch (_) { ST = {}; }
  let REC = {}; try { REC = JSON.parse(readFileSync(recFile, 'utf8')); } catch (_) { REC = {}; }   /* sid -> { t -> {o, s, ...} } */
  const state = { lastPoll: null, lastError: null, reports: 0, paired: 0, stations: Object.keys(ST).length };
  const FULL_KM = 5, ZERO_KM = 15, WINDOW_D = 10, MIN_N = 4;
  const port = () => Number(process.env.PORT || 8787);
  const lake = join(dataDir, '..', '..', 'station-lake', 'archive', 'synop');

  async function servedAt(sid, s, pastDays = 2, fcDays = 1) {
    const q = new URLSearchParams({ __omhost: 'api.open-meteo.com', latitude: s.lat.toFixed(4), longitude: s.lon.toFixed(4), elevation: String(Math.round(s.elevM)),
      hourly: 'temperature_2m', past_days: String(pastDays), forecast_days: String(fcDays), timezone: 'GMT', __nolive: '1' });   /* __nolive also leaves this layer out (it is a live term) */
    const r = await fetch(`http://127.0.0.1:${port()}/px/v1/forecast?` + q, { headers: { 'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': 'synop-pairs' }, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error('px ' + r.status); const j = await r.json(); const H = j.hourly || {}; const m = new Map();
    (H.time || []).forEach((t, i) => m.set(String(t).slice(0, 13), H.temperature_2m[i])); return m;
  }
  /* v91.17.283.28 · NIGRAAN's own METAR record (station-lake/scripts/metar_sync.py): the reports since sinceMs, every airport */
  async function ownMetar(sinceMs) {
    const dir = join(ownDir(join(dataDir, '..')), 'data', 'obs_other', 'metar_live'); const rows = []; let newest = 0;
    const months = new Set(); for (let t = sinceMs; t <= Date.now() + 864e5; t += 20 * 864e5) months.add(new Date(t).toISOString().slice(0, 7).replace('-', '')); months.add(new Date().toISOString().slice(0, 7).replace('-', ''));
    for (const m of [...months].sort()) { const f = join(dir, 'metar_' + m + '.csv'); if (!existsSync(f)) continue;
      await streamCsv(f, (r) => { const ms = utcMs(r.time_utc); const t = r.t_c === '' ? NaN : Number(r.t_c); if (!Number.isFinite(ms) || ms < sinceMs || !r.station) return;
        if (ms > newest) newest = ms; rows.push({ sid: r.station, ms, t_c: Number.isFinite(t) ? t : null, td_c: r.td_c === '' || r.td_c == null ? null : Number(r.td_c), wspd: null, type: r.type || 'METAR' }); }); }
    return { rows, newest: newest || null, dir };
  }
  async function poll() {
    if (!on()) return;
    state.lastError = null;   /* v91.17.283.27 · item 8: lastError is this poll's error (it was never cleared, so a refusal of last week read as current) */
    /* the first poll (or after a gap) reads 11 days, so the 10-day running bias exists from the start */
    const have = Math.max(0, ...Object.values(REC).flatMap((R) => Object.keys(R).map((t) => Date.parse(t))));
    const back = (!have || Date.now() - have > 24 * 3600e3) ? 11 * 864e5 : 30 * 3600e3;
    const end = new Date(), begin = new Date(end.getTime() - back), f = (d) => d.toISOString().replace(/[-:T]/g, '').slice(0, 12);
    const lines = [];
    for (const b of ['415', '416', '417']) {
      try { const r = await fetch(`https://www.ogimet.com/cgi-bin/getsynop?block=${b}&begin=${f(begin)}&end=${f(end)}`, { headers: { 'User-Agent': 'AGN-NIGRAAN/91.17 (hourly, 3 requests)' }, signal: AbortSignal.timeout(60000) });
        if (r.ok) { const t = await r.text(); if (/^\d{5},/.test(t)) lines.push(...t.split('\n')); } else state.lastError = 'ogimet ' + r.status; } catch (e) { state.lastError = 'ogimet: ' + e.message; }
      await new Promise((ok) => setTimeout(ok, 4000));
    }
    const recs = lines.map(decodeSynop).filter((x) => x && x.t_c != null && ST[x.sid]);
    /* airports: METAR, kept at the synoptic hours so the same tested model applies.
       v91.17.283.28 · INDEPENDENCE FROM LAMHA (owner, 28 Oct 2026 11:10 PKT): the reports no longer come from a copy of LAMHA's
       metar_live folder. NIGRAAN keeps its own METAR record (station-lake/scripts/metar_sync.py every 30 min: NOAA AWC, IEM when AWC
       fails; the own folder nig/own/data/obs_other/metar_live/metar_YYYYMM.csv, LAMHA's file layout). While that record is fresh
       (newest report within OWN_METAR_STALE_MIN = 60 min: reports come every 30 min, so the 30-min cycle plus one more, as the
       retired copy's staleMin) the reports come from it: the report nearest each synoptic hour (within 20 min), the same selection as
       the IEM path. Airports the record does not carry, or a stale / missing record -> this module's own IEM request below, as
       before. Every report read is also kept in the lake (archive/metar_all/metar_YYYY-MM.jsonl); the served model is unchanged. */
    const OWN_METAR_STALE_MIN = 60;
    let apLeft = Object.keys(ST).filter((k) => ST[k].kind === 'metar');
    try { const got = apLeft.length ? await ownMetar(Date.now() - back) : null; const fresh = !!(got && got.rows.length && Date.now() - got.newest <= OWN_METAR_STALE_MIN * 60e3);
      state.metarSource = fresh ? 'NIGRAAN METAR record (AWC / IEM)' : 'IEM'; state.copyMetar = null;
      state.ownMetar = got ? { rows: got.rows.length, newest: got.newest ? new Date(got.newest).toISOString() : null, fresh, dir: got.dir } : null;
      if (fresh) { const best = new Map(), have = new Set();
        for (const x of got.rows) { if (!ST[x.sid] || ST[x.sid].kind !== 'metar') continue; have.add(x.sid);
          const hr = Math.round(x.ms / 3600e3) * 3600e3; if (new Date(hr).getUTCHours() % 3) continue; const k = x.sid + '|' + hr; const dt = Math.abs(x.ms - hr);
          if (!best.has(k) || dt < best.get(k).dt) best.set(k, { dt, sid: x.sid, t: new Date(hr).toISOString().slice(0, 16) + ':00Z', t_c: x.t_c, td_c: x.td_c, wspd: x.wspd }); }
        for (const v of best.values()) if (Number.isFinite(v.t_c) && v.t_c > -40 && v.t_c < 55 && v.dt <= 1200e3) { delete v.dt; recs.push(v); }
        apLeft = apLeft.filter((k) => !have.has(k));
        try { const lm = join(dataDir, '..', '..', 'station-lake', 'archive', 'metar_all'); mkdirSync(lm, { recursive: true });
          const seenF = join(lm, 'seen.json'); let seen = {}; try { seen = JSON.parse(readFileSync(seenF, 'utf8')); } catch (_) {}
          const add = got.rows.filter((x) => !seen[x.sid] || x.ms > seen[x.sid]).sort((a, b) => a.ms - b.ms);
          if (add.length) { const byM = new Map(); for (const x of add) { const m = new Date(x.ms).toISOString().slice(0, 7); (byM.get(m) || byM.set(m, []).get(m)).push(JSON.stringify({ sid: x.sid, t: new Date(x.ms).toISOString().slice(0, 16) + 'Z', t_c: x.t_c, td_c: x.td_c, wspd: x.wspd, type: x.type, src: 'NIGRAAN metar_live (own fetch)' }));
              seen[x.sid] = Math.max(seen[x.sid] || 0, x.ms); }
            for (const [m, ls] of byM) appendFileSync(join(lm, 'metar_' + m + '.jsonl'), ls.join('\n') + '\n');
            writeFileSync(seenF, JSON.stringify(seen)); }
        } catch (_) {}
      } } catch (e) { state.lastError = 'own metar: ' + e.message; }
    try { const ap = apLeft; if (ap.length) {
      const d0 = new Date(Date.now() - back), d1 = new Date(Date.now() + 3600e3);
      const q = ap.map((k) => 'station=' + k).join('&') + '&data=tmpc&data=dwpc&data=sknt&tz=Etc%2FUTC&format=onlycomma&latlon=no&elev=no&missing=empty&trace=empty&direct=no&report_type=3'
        + `&year1=${d0.getUTCFullYear()}&month1=${d0.getUTCMonth() + 1}&day1=${d0.getUTCDate()}&year2=${d1.getUTCFullYear()}&month2=${d1.getUTCMonth() + 1}&day2=${d1.getUTCDate()}`;
      const r = await fetch('https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?' + q, { signal: AbortSignal.timeout(90000) });
      if (r.ok) { const t = await r.text(); const best = new Map(); const keepAll = [];
        for (const line of t.split('\n').slice(1)) { const c = line.split(','); if (c.length < 3 || c[2] === '') continue; const ms = Date.parse(c[1].replace(' ', 'T') + ':00Z'); if (!Number.isFinite(ms)) continue;
          keepAll.push({ sid: c[0], ms, t_c: Number(c[2]), td_c: c[3] === '' ? null : Number(c[3]), wspd: c[4] === '' || c[4] == null ? null : Math.round(Number(c[4]) * 0.514444 * 10) / 10 });
          const hr = Math.round(ms / 3600e3) * 3600e3; if (new Date(hr).getUTCHours() % 3) continue; const k = c[0] + '|' + hr; const dt = Math.abs(ms - hr);
          if (!best.has(k) || dt < best.get(k).dt) best.set(k, { dt, sid: c[0], t: new Date(hr).toISOString().slice(0, 16) + ':00Z', t_c: Number(c[2]), td_c: c[3] === '' ? null : Number(c[3]), wspd: c[4] === '' ? null : Math.round(Number(c[4]) * 0.514444 * 10) / 10 }); }
        for (const v of best.values()) if (Number.isFinite(v.t_c) && v.t_c > -40 && v.t_c < 55 && v.dt <= 1200e3) { delete v.dt; recs.push(v); }
        /* 28 Oct 2026 · every report of this own fetch is kept in the lake too (archive/metar_all, as the copied reports above): without
           LAMHA (the DGX) this is NIGRAAN's only METAR record, and the monthly retrain's METAR truth is built from it
           (station-lake/retrain/produce/truth.py). Nothing served changes. */
        try { const lm = join(dataDir, '..', '..', 'station-lake', 'archive', 'metar_all'); mkdirSync(lm, { recursive: true });
          const seenF = join(lm, 'seen.json'); let seen = {}; try { seen = JSON.parse(readFileSync(seenF, 'utf8')); } catch (_) {}
          const add = keepAll.filter((x) => !seen[x.sid] || x.ms > seen[x.sid]).sort((a, b) => a.ms - b.ms);
          if (add.length) { const byM = new Map(); for (const x of add) { const m = new Date(x.ms).toISOString().slice(0, 7); (byM.get(m) || byM.set(m, []).get(m)).push(JSON.stringify({ sid: x.sid, t: new Date(x.ms).toISOString().slice(0, 16) + 'Z', t_c: x.t_c, td_c: x.td_c, wspd: x.wspd, type: 'METAR', src: 'IEM (NIGRAAN own fetch)' }));
              seen[x.sid] = Math.max(seen[x.sid] || 0, x.ms); }
            for (const [m, ls] of byM) appendFileSync(join(lm, 'metar_' + m + '.jsonl'), ls.join('\n') + '\n');
            writeFileSync(seenF, JSON.stringify(seen)); }
        } catch (_) {}
      } else state.lastError = 'iem ' + r.status;
    } } catch (e) { state.lastError = 'iem: ' + e.message; }
    state.reports = recs.length; state.lastPoll = new Date().toISOString();
    const bySid = new Map(); for (const x of recs) { if (!bySid.has(x.sid)) bySid.set(x.sid, []); bySid.get(x.sid).push(x); }
    const arch = [];
    for (const [sid, xs] of bySid) {
      let m = null; try { m = await servedAt(sid, ST[sid], back > 2 * 864e5 ? 12 : 2); } catch (e) { state.lastError = sid + ': ' + e.message; continue; }
      const R = REC[sid] || (REC[sid] = {});
      for (const x of xs) { const sv = m.get(x.t.slice(0, 13)); if (sv == null) continue;
        if (!R[x.t]) { arch.push(JSON.stringify({ ...x, served_c: sv })); state.paired++; }
        R[x.t] = { o: x.t_c, s: sv, td: x.td_c ?? null, w: x.wspd ?? null }; }
    }
    const cut = Date.now() - 12 * 864e5; for (const R of Object.values(REC)) for (const t of Object.keys(R)) if (Date.parse(t) < cut) delete R[t];
    try { mkdirSync(join(dataDir, 'cache'), { recursive: true }); writeFileSync(recFile + '.tmp', JSON.stringify(REC)); renameSync(recFile + '.tmp', recFile); } catch (_) {}
    try { if (arch.length) { mkdirSync(lake, { recursive: true }); appendFileSync(join(lake, 'synop_' + new Date().toISOString().slice(0, 7) + '.jsonl'), arch.join('\n') + '\n'); } } catch (_) {}
    try { await logIssued(); } catch (e) { state.lastError = 'issued log: ' + e.message; }
  }
  /* v91.17.163 · O3 · the correction was tested on reconstructed issue times. From now every 00 and 12 UTC issue is kept as it was
     made: per station, the served value without this layer (raw) and the correction this layer adds at the station (corr), for
     valid times 3 to 48 h ahead every 3 h (synoptic hours). scripts/synop_issued_score.py joins them with the reports that arrive later
     (station-lake/archive/synop/issued_YYYY-MM.jsonl + synop_YYYY-MM.jsonl) and scores MAE by lead, raw vs corrected.
     Cost: one forecast request per station per issue (about 94 a day). */
  async function logIssued() {
    /* one issue per 12 h block (00 / 12 UTC); leads count from the hour the forecast was actually read */
    const now = new Date(); const block = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() >= 12 ? 12 : 0)).toISOString().slice(0, 13);
    if (state.lastIssueBlock === block) return; state.lastIssueBlock = block;
    const issue = new Date(Math.floor(Date.now() / 3600e3) * 3600e3).toISOString().slice(0, 16) + ':00Z';
    const iMs = Date.parse(issue), out = [];
    for (const [sid, s] of Object.entries(ST)) {
      const M = model(sid, Date.now()); if (!M) continue;
      let m = null; try { m = await servedAt(sid, s, 0, 3); } catch (_) { continue; }
      for (let L = 1; L <= 50; L++) { const ms = iMs + L * 3600e3; if (new Date(ms).getUTCHours() % 3) continue; const key = new Date(ms).toISOString().slice(0, 13); const raw = m.get(key); if (raw == null) continue;
        const c = corrAt(M, ms, 1, Date.now()); out.push(JSON.stringify({ issued: issue, sid, valid: key + ':00Z', lead: L, raw, corr: c == null ? null : Math.round(c * 100) / 100 })); }
    }
    state.lastIssue = issue; state.issuedRows = out.length;
    if (out.length) { mkdirSync(lake, { recursive: true }); appendFileSync(join(lake, 'issued_' + issue.slice(0, 7) + '.jsonl'), out.join('\n') + '\n'); }
  }
  /* the running correction of one station, as a function of the target time */
  function model(sid, nowMs, RX = REC) {   /* v91.17.273 · RX: another record set of the same shape (the accuracy monitor's backfill); default the live one */
    const R = RX[sid]; if (!R) return null; const ts = Object.keys(R).filter((t) => Date.parse(t) <= nowMs).sort(); if (!ts.length) return null;
    const res0 = ts.map((t) => ({ t, ms: Date.parse(t), h: new Date(t).getUTCHours(), r: R[t].o - R[t].s })).filter((x) => nowMs - x.ms <= WINDOW_D * 864e5);
    /* v91.17.163 · gross errors: a fixed 8 C cut also threw away real, persistent valley-inversion residuals (Gilgit and Chitral
       autumn mornings run 8-9 C colder than served, every day), so the correction there was built from the milder days only.
       A report is dropped only when it is far from the same station's same-hour median: |r - median| > max(8, 4 x 1.4826 x MAD)
       (Hampel rule). Held out on Jun-Oct 2026 (synop/qc_test.py): MAE equal to the 8 C cut at every lead (24 h 1.034 both). */
    const med = (a) => { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
    const byH = {}; for (const x of res0) (byH[x.h] || (byH[x.h] = [])).push(x.r);
    const qc = {}; for (const [h, v] of Object.entries(byH)) { const m = med(v), mad = med(v.map((r) => Math.abs(r - m))) * 1.4826; qc[h] = { m, lim: Math.max(8, 4 * mad) }; }
    const res = res0.filter((x) => Math.abs(x.r - qc[x.h].m) <= qc[x.h].lim);
    const hod = {}; for (const h of [0, 3, 6, 9, 12, 15, 18, 21]) { const v = res.filter((x) => x.h === h).map((x) => x.r); hod[h] = v.length >= MIN_N ? v.reduce((a, b) => a + b, 0) / v.length : null; }
    const last = res[res.length - 1]; if (!last || nowMs - last.ms > 7 * 3600e3) return { hod, last: null };
    const anom = hod[last.h] == null ? null : last.r - hod[last.h];
    return { hod, last, anom };
  }
  function hodAt(hod, utcH) {
    const a = Math.floor(utcH / 3) * 3 % 24, b = (a + 3) % 24, f = (utcH - Math.floor(utcH / 3) * 3) / 3;
    if (hod[a] == null && hod[b] == null) return null; if (hod[a] == null) return hod[b]; if (hod[b] == null) return hod[a]; return hod[a] + (hod[b] - hod[a]) * f;
  }
  const aLead = (h) => h <= 3 ? 0.6 : h >= 6 ? 0.2 : 0.6 - (h - 3) / 3 * 0.4;
  /* v91.17.273 · the Gilgit/Skardu seam (tests71): the anomaly started AT the latest report, so the hours just before it had none and the
     correction stepped by 0.6 x anomaly at the report hour (Gilgit 14 Oct 2026 03 UTC: anomaly +1.9 C -> a 1.1 C step 07 -> 08 PKT; the
     laptop's tests71 seam 1.17-1.37 C). The same weight now runs backwards too (0.6 within 3 h before the report, falling to 0 at 6 h
     before): no step. Held out (scripts/tests273/synop_backfill_test.py, synop 1-16 Oct 2026, 51 stations, running bias built only from
     reports up to the 'latest', as live): the report 3 h before, MAE 0.894 -> 0.718 C (gain +0.175, 90 % CI +0.143..+0.210; 1-8 Oct
     +0.151, 9-16 Oct +0.223; Gilgit 1.94 -> 1.49). 6 h and more before: weight 0, unchanged. Hours at or after the report: unchanged. */
  const aBack = (h) => h <= 3 ? 0.6 : h >= 6 ? 0 : 0.6 * (6 - h) / 3;
  function corrAt(M, ms, w, nowMs) { const h = new Date(ms).getUTCHours() + new Date(ms).getUTCMinutes() / 60; const hb = hodAt(M.hod, h); if (hb == null) return null;
    let c = hb; if (M.last && M.anom != null) c += (ms >= M.last.ms ? aLead((ms - M.last.ms) / 3600e3) : aBack((M.last.ms - ms) / 3600e3)) * M.anom;
    /* tested to 48 h ahead: full to 48 h, fading to nothing at 72 h */
    const lead = (ms - nowMs) / 3600e3; const fade = lead <= 48 ? 1 : lead >= 72 ? 0 : 1 - (lead - 48) / 24; return c * w * fade; }
  /* v91.17.157 · audit: a station's running error is spread only to points within 150 m of its height (the L2 rule); a valley or airfield
     bias was spread up to 15 km onto slopes at any height. The 5/15 km reach itself has no spatial test; it was tested at the station. */
  const DZ_MAX = 150;
  function near(lat, lon, elev) { let best = null; for (const [sid, s] of Object.entries(ST)) { const d = km(lat, lon, s.lat, s.lon); if (d >= ZERO_KM) continue; if (Number.isFinite(elev) && Number.isFinite(s.elevM) && Math.abs(elev - s.elevM) > DZ_MAX) continue; if (!best || d < best.d) best = { sid, s, d }; }
    if (!best) return null; return { ...best, w: best.d <= FULL_KM ? 1 : 1 - (best.d - FULL_KM) / (ZERO_KM - FULL_KM) }; }
  function follow(o, i, T0, T1) { const get = (k) => (i == null ? o[k] : (Array.isArray(o[k]) ? o[k][i] : undefined)), set = (k, v) => { if (i == null) o[k] = v; else o[k][i] = v; };
    const rh = get('relative_humidity_2m'); if (typeof rh === 'number' && Number.isFinite(rh)) set('relative_humidity_2m', Math.round(Math.max(1, Math.min(100, rh * esatHpa(T0) / esatHpa(T1))) * 10) / 10);
    const td = get('dew_point_2m'); if (typeof td === 'number' && td > T1) set('dew_point_2m', T1);
    const ap = get('apparent_temperature'); if (typeof ap === 'number' && Number.isFinite(ap)) set('apparent_temperature', r1(ap + (T1 - T0))); }
  function apply(loc, lat, lon) {
    if (!on() || !loc || loc.__noLive) return false;
    const bc = loc.agn_bias_correction; if (bc && bc.applied && /running correction/.test(String(bc.reference || ''))) return false;
    const n0 = near(lat, lon, Number(loc.elevation)); if (!n0) return false; const M = model(n0.sid, Date.now()); if (!M) return false;
    const off = (loc.utc_offset_seconds || 0) * 1000; let n = 0, sum = 0, nowTerm = null;
    /* v91.17.280 · SYN280 (c2): at a point with its own MACH station (served by the live layer), the term only in the day-parts where it helped there */
    const own = c2For(lat, lon, Number(loc.elevation), n0.sid); const parts = own ? own.s.parts : null; let dropped = 0;
    const at = (ms) => { if (parts && parts[dayPart(ms)] && !parts[dayPart(ms)].keep) { dropped++; return null; } return corrAt(M, ms, n0.w, Date.now()); };
    const H = loc.hourly;
    if (H && Array.isArray(H.time) && Array.isArray(H.temperature_2m)) H.time.forEach((t, i) => { const v = H.temperature_2m[i]; if (v == null) return; const ms = Date.parse(String(t).length <= 16 ? t + 'Z' : t) - off;
      const c = at(ms); if (c == null) return; const T1 = r1(v + c); H.temperature_2m[i] = T1; follow(H, i, v, T1); n++; sum += c; if (Math.abs(ms - Date.now()) <= 1800e3) nowTerm = r1(c); });
    const Cu = loc.current; if (Cu && Cu.temperature_2m != null && Cu.time) { const ms = Date.parse(String(Cu.time).length <= 16 ? Cu.time + 'Z' : Cu.time) - off; const c = at(ms); if (c != null) { const v = Cu.temperature_2m, T1 = r1(v + c); Cu.temperature_2m = T1; follow(Cu, null, v, T1); nowTerm = r1(c); n++; } }
    if (n) loc.agn_synop = { applied: true, station: n0.s.name, km: r1(n0.d), weight: Math.round(n0.w * 100) / 100, hours: n, meanChangeC: r1(sum / n), nowTermC: nowTerm,
      latestReport: M.last ? M.last.t : null, reference: 'synoptic station running correction (10-day same-hour bias + latest anomaly), held-out tested' };
    if (own) { const T = { station: own.s.name, stationKm: r1(own.d), window: '10 PKT days before ' + new Date(C2.day * DAY_MS).toISOString().slice(0, 10), rule: 'kept in a day-part when MAE with the term <= MAE without it at the station',
        parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, { decision: v.keep ? 'kept' : 'dropped', maeWithC: v.maeWith, maeWithoutC: v.maeWithout, n: v.n }])), hoursDropped: dropped };
      if (n) loc.agn_synop.stationTest = T; else loc.agn_synop = { applied: false, station: n0.s.name, km: r1(n0.d), why: 'the term did not help at this point\'s own station in these hours', stationTest: T }; }
    return n > 0;
  }
  /* v91.17.280 · SYN280 (c2): the per-station decision table (see the header of c2Decide) */
  const c2on = () => process.env.NIGRAAN_SYNOP_C2 !== '0';
  const C2 = { day: null, busy: false, at: null, error: null, stations: {}, reach: null, files: [], rows: {} };
  const fleetDir = () => join(dataDir, '..', '..', 'station-lake', 'archive', 'fleet');
  function lakeSynop(months) { const RX = {};
    for (const m of months) { const f = join(lake, 'synop_' + m + '.jsonl'); if (!existsSync(f)) continue;
      for (const line of readFileSync(f, 'utf8').split('\n')) { if (!line) continue; let j; try { j = JSON.parse(line); } catch (_) { continue; }
        if (!j.sid || !Number.isFinite(j.t_c) || !Number.isFinite(j.served_c)) continue; (RX[j.sid] || (RX[j.sid] = {}))[j.t] = { o: j.t_c, s: j.served_c }; } }
    for (const [sid, R] of Object.entries(REC)) for (const [t, v] of Object.entries(R)) (RX[sid] || (RX[sid] = {}))[t] = v;   /* the held records win */
    return RX; }
  /* the station rows of the pairs file: one per hour (shortest lead), at the station's current position */
  async function stationRows(months, keys) { const by = new Map();
    for (const m of months) { const f = join(fleetDir(), 'fleet_pairs_' + m + '.csv'); if (!existsSync(f)) continue; C2.files.push('fleet_pairs_' + m + '.csv');
      await streamCsv(f, (o) => { const k = o.key; if (!keys.has(k)) return; const hourMs = Date.parse(o.hour_utc);
        const pairedMs = Date.parse(o.paired_utc), lead = Number(o.lead_h), obs = o.temp_c === '' ? NaN : Number(o.temp_c), sv = o.fc_served_c === '' ? NaN : Number(o.fc_served_c);
        if (![hourMs, pairedMs, lead, obs, sv].every(Number.isFinite)) return; const lat = Number(o.lat), lon = Number(o.lon), el = o.model_elev_m === '' ? null : Number(o.model_elev_m);
        const obsMs = Date.parse(o.obs_utc), dObs = Number.isFinite(obsMs) ? Math.abs(obsMs - hourMs) : Infinity;
        const M = by.get(k) || by.set(k, new Map()).get(k); const prev = M.get(hourMs);
        /* one pair per station hour: the shortest lead; at the same lead (the hour paired again by a later poll) the reading nearest the
           hour, as the live layer and the running correction take it */
        if (prev && (prev.lead < lead || (prev.lead === lead && prev.dObs <= dObs))) return;
        M.set(hourMs, { hourMs, pairedMs, lead, obs, served: sv, lat, lon, el, dObs }); }); }
    return by; }
  async function c2Refresh(nowMs = Date.now()) {
    if (C2.busy || !on() || !c2on()) return C2; C2.busy = true; C2.files = [];
    try { const today = pktDay(nowMs);
      const months = [...new Set([0, WINDOW_D + 1, 2 * WINDOW_D + 2].map((d) => new Date(nowMs - d * DAY_MS).toISOString().slice(0, 7)))].sort();
      let reg = []; try { reg = (app.fleet && app.fleet.stations ? app.fleet.stations() : []) || []; } catch (_) { reg = []; }
      const cand = reg.filter((r) => Object.values(ST).some((s) => km(r.lat, r.lon, s.lat, s.lon) < ZERO_KM));   /* v91.17.283.14 · no station excluded: the pairs hold only values obsqc.mjs passed */
      const rowsBy = await stationRows(months, new Set(cand.map((r) => r.key)));
      const RX = lakeSynop(months); const out = {}, rowsOut = {}; const mc = new Map();
      for (const r of cand) { const H = rowsBy.get(r.key); if (!H || !H.size) continue;
        const rows = [...H.values()].filter((x) => km(x.lat, x.lon, r.lat, r.lon) <= 0.5);   /* pairs made at the current position only */
        if (!rows.length) continue; const el = rows[rows.length - 1].el;
        const n0 = near(r.lat, r.lon, el); if (!n0) continue;
        const R = []; for (const x of rows) { const ck = n0.sid + '|' + x.pairedMs; let M = mc.get(ck); if (M === undefined) { M = model(n0.sid, x.pairedMs, RX); mc.set(ck, M); }
          if (!M) continue; const c = corrAt(M, x.hourMs, n0.w, x.pairedMs); if (c == null) continue; R.push({ hourMs: x.hourMs, obs: x.obs, withT: x.served, withoutT: x.served - c, term: c }); }
        rowsOut[r.key] = R;
        out[r.key] = { key: r.key, no: r.no ?? null, name: r.name || r.key, lat: r.lat, lon: r.lon, elevM: el, sid: n0.sid, synop: n0.s.name, km: r1(n0.d), w: Math.round(n0.w * 100) / 100, pairs: R.length, parts: c2Decide(R, today, WINDOW_D, MIN_N) }; }
      let rule = null; try { rule = app.fleet && app.fleet.runningStatus ? app.fleet.runningStatus().rule : null; } catch (_) { rule = null; }
      C2.reach = { km: rule && Number.isFinite(rule.t_reach_km) ? rule.t_reach_km : null, dzM: rule && Number.isFinite(rule.dz_m) ? rule.dz_m : null };
      C2.stations = out; C2.rows = rowsOut; C2.day = today; C2.at = new Date(nowMs).toISOString(); C2.error = null;
    } catch (e) { C2.error = e.message; } finally { C2.busy = false; }
    return C2; }
  /* the point's own station: the nearest table station within the running correction's own-site reach (fleet rule t_reach_km / dz_m,
     data/model-zone.json l2Rule) that the live MACH layer itself serves from (v91.17.283.14: every station; its values reach the layer
     only when obsqc.mjs passes them; a station the siting offsets flag carries no site term).
     The neighbour siting screen's verdict is not used: MACH 105 has one reference (the Gilgit synop) and no MACH neighbour, so it stays
     'unscreened' there although the live layer uses it with its measured night offset. */
  function liveUses(key) { return !!key; }
  function ownStation(lat, lon, elev) { if (!C2.reach || !Number.isFinite(C2.reach.km)) return null; let best = null;
    for (const s of Object.values(C2.stations)) { const d = km(lat, lon, s.lat, s.lon); if (d > C2.reach.km) continue;
      if (Number.isFinite(elev) && Number.isFinite(s.elevM) && Number.isFinite(C2.reach.dzM) && Math.abs(elev - s.elevM) > C2.reach.dzM) continue;
      if (!liveUses(s.key)) continue;
      if (!best || d < best.d) best = { s, d }; }
    return best; }
  function c2For(lat, lon, elev, sid) { if (!c2on()) return null; if (C2.day !== pktDay(Date.now())) { c2Refresh().catch(() => {}); if (C2.day == null) return null; }
    const o = ownStation(lat, lon, elev); if (!o || o.s.sid !== sid) return null; return o; }
  function status() { return { on: on(), stations: Object.keys(ST).length, withData: Object.keys(REC).filter((k) => Object.keys(REC[k]).length).length, ...state, reach: { fullKm: FULL_KM, zeroKm: ZERO_KM }, windowDays: WINDOW_D,
    stationTest: { on: c2on(), day: C2.day == null ? null : new Date(C2.day * DAY_MS).toISOString().slice(0, 10), at: C2.at, error: C2.error, ownReach: C2.reach, files: C2.files, stations: Object.values(C2.stations).map((s) => ({ key: s.key, name: s.name, synop: s.synop, km: s.km, pairs: s.pairs, liveLayer: liveUses(s.key), parts: s.parts })) } }; }
  function start() { if (!on()) return; const run = () => poll().catch((e) => { state.lastError = e.message; });
    schedule(app, 'synop', 3600e3, () => run().then(() => c2Refresh()), { firstMs: 90000, label: 'synoptic observations' });
    c2Refresh().catch(() => {}); }
  /* v91.17.186 · the stations and their recent readings, for the live layer's siting offsets (fleet.mjs, sitingoffsets.mjs) */
  const records = () => ({ stations: ST, records: REC });
  /* v91.17.273 · ACC · the running term this layer served at the station's own site for the report at ms, made only from reports before
     it (the issue as it stood just before the report arrived; weight 1 at the station). null: no model. Read only (accmon.mjs). */
  function termAt(sid, ms, RX) { const M = model(sid, ms - 1, RX || REC); if (!M) return null; const c = corrAt(M, ms, 1, ms - 1); return c == null ? null : Math.round(c * 100) / 100; }
  return { poll, apply, status, start, near, model, decodeSynop, records, termAt, corrAt, c2Refresh, c2Table: () => C2 };
}
