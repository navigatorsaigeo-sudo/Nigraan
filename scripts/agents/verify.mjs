/* == v91.17.283.7 . AGENT 2: VERIFICATION (daily 06:30 PKT, a child process of the server; server/api/agents.mjs) ==================
   Scores the forecasts NIGRAAN issued (as issued, from its own permanent archives) against what the stations measured, for one target
   Pakistan day at a time, and keeps a 400-day ledger of exact sufficient statistics (data/agents/verify/ledger.jsonl), so every window,
   interval and drift test is recomputed from the ledger, never from typed figures.
   FORECASTS (as issued, never recomputed)
     tehsil    data/archive/forecast/fc_YYYY-MM.jsonl.gz: the served national tehsil forecast of the 00 PKT run, 73 hourly values from its
               first hour (T, RH, precipitation, wind); lead L = target day - issue day (0, 1, 2; day 3 from the issues archived with 97 hours, v91.17.283.8)
     range     data/archive/points/points_YYYY-MM.jsonl.gz: the point chain with its 90 % range at the eight airport points (72 h)
     heat      data/archive/engine/engine_YYYY-MM.jsonl.gz: the heat level of each tehsil for days 0-3 of the first engine result
               received at or after 06:00 PKT on the issue day (the morning issue)
   OBSERVATIONS (NIGRAAN's own records; read only. v91.17.283.28: independence from LAMHA - the "copies" folder of this agent is now
   NIGRAAN's own folder nig/own (server/api/ownpaths.mjs, LAMHA's relative layout), filled by NIGRAAN's own fetches; nig/copies/lamha
   and nig/data/from_lamha are no longer read)
     MACH      station-lake/archive/fleet/db/mach_db_YYYY-MM.csv (NIGRAAN's MACH database sync) and nig/own/data/mach/db/
               obs_YYYYMMDD.csv (NIGRAAN's 10-minute window, machdb.mjs); forecast rows (provider apple*, source qm/apple) left out; the fleet's range rules and the
               stuck / replayed / jump / frozen / array-silent screen (server/api/stuckscreen.mjs) applied per station
     METAR     nig/own/data/obs_other/metar_live/metar_YYYYMM.csv (metar_sync.py) (temperature, dew point; wind from the report)
     AWS       nig/own/data/pmd/ews_live/raw/ews_raw_YYYYMMDD.csv.gz (ews_sync.py) where present (temperature, humidity, wind); operator only
     SYNOP     station-lake/archive/synop/synop_YYYY-MM.jsonl (the synoptic reports the server's synop module keeps, every 3 h: temperature,
               dew point, 10 m wind in m/s) at the positions of data/synop-stations.json; numeric station ids only (the airport rows the
               module stores beside them are METAR, already read above); the forecast value stored with a report (served_c) is never read
               (v91.17.283.8 HEATSKILL)
   QUALITY    v91.17.283.14: no station is excluded. Every hourly value (station x variable x hour) of every network goes through the one
              value-level quality control, server/api/obsqc.mjs (gross range, step / persistence, internal consistency, the TITAN buddy
              check against same-zone neighbours at the station height); a failing value is not scored, the station's other variables and
              hours are. Counts in qc (ledger).
              v91.17.283.24 · self-audit J5 · the truth is judged WITHOUT the forecast being scored: no background (forecast-departure)
              check, no residual-mode buddy check (value minus forecast) and no forecast-residual climatological range. Before, a reading
              far from the issued forecast was dropped as wrong, so the forecast's own large misses were taken out of its score (circular).
              What judges a value now is independent of every issue scored: its own series (step, persistence, stuck / replay), its
              internal consistency, the gross range, the national monthly climatological envelope (NOAA GSOD Pakistan, fleet-range-screen
              byMonth) and its neighbours at its height (TITAN buddy check, raw mode). A value with too few neighbours is 'spatial-
              unchecked' and stays (counted): wind, which has no buddy check, is never dropped for lack of neighbours.
   MATCHING   each station is placed in its tehsil (point in polygon, data/pk-tehsils.json); its zone is the zone the tehsil forecast was
              issued under (plains, hills, mountain, coast); urban when its 9-arc-second cell holds at least 1,500 people per km2 (the
              GHSL / UN Degree of Urbanisation urban-centre density, data/urban.* GHS-POP E2025), else rural. The tehsil temperature is
              moved from the served height to the station height (GLO-30, server/api/pointheight.mjs) at 6.5 C/km, the standard-atmosphere
              lapse rate the server applies elsewhere; humidity, wind and rain are compared as issued.
              An hourly observation is the reading nearest the top of the hour within 15 min. Daily maximum and minimum come from the
              SAME hours on both sides (v91.17.283.24 · J16: the hours that have both an observed and an issued temperature, at least
              20 of them, archive.mjs DAY_MIN_HOURS; before, the observed extreme came from the hours observed and the forecast one from
              every issued hour). Rain: the gauge's day (v91.17.283.28 RAIN TRUTH below: counter increments, flipping / stuck / isolated
              gauges held, a day the counter does not cover is missing, never 0) against the issued hourly rain summed over the 24 hours
              ending 01:00 ... 24:00 PKT (the hour-ending rule, server/api/pktday.mjs); a day with any issued hour missing is not scored
              (v91.17.283.24 · J17); wet day = at least 1 mm (the ETCCDI wet-day threshold). The satellite (IMERG Late, Pakistan day) is
              scored apart at every issued tehsil (cells RI / wetI, totals RT i|), labelled 'satellite (IMERG Late)', never 'measured'.
   SCORES     MAE and bias (forecast - observed); hit rate (POD) and false-alarm ratio (FAR) for a wet day, for heat Moderate or higher and
              High or higher; the share of hours inside the issued 90 % range.
   PERSISTENCE (v91.17.283.24 · J4) the heat level observed the day before the issue, scored against the forecast on the SAME station-days
              (cells fm* = the forecast, pm* = persistence, written only where both exist); before, persistence was scored on its own
              subset and set against the forecast's score on all days.
   HEAT TRUTH (v91.17.283.8 HEATSKILL, like for like with the issued level) the observed level is the day's highest HOURLY shade UTCI over the
              whole Pakistan day (the engine's day peak, hzDayWindow utciPair: Tmrt = Ta, the page's polynomial with its in-range clamp),
              from the hourly values (the reading nearest each hour, never the maximum of 10-minute readings), at least DAY_MIN_HOURS hours
              (synoptic stations: SYNOP_MIN_REPORTS of the 8 synoptic hours). UTCI takes the wind at 10 m: a network whose anemometer is a
              10 m exposure (synoptic stations, airports) uses its own wind; MACH and AWS masts are not 10 m exposures (low masts read about
              1 m/s calm, which lifts UTCI), so their hours use the served 10 m wind of the station's tehsil at that hour (the SCI2821 /
              score-monthly convention). The client heat line rests on the standard-exposure networks only (HEAT_TRUTH_NETS): the MACH
              hygrometers read about 13 points more humid by day than the forecast (synoptic stations about 7), which alone lifts the
              observed peak UTCI by about 3.5 C, so MACH heat cells are scored and shown to the operator apart, never quoted to a client
              (reconciliation of 22 Oct 2026: data/evidence/heat2838/summary.json).
              the share of hours inside the issued 90 % range. Every interval is a 95 % day-block bootstrap (days resampled, 2,000 draws,
              fixed seed): the stations of one day share their weather, so they are not independent.
   DRIFT      a cell (variable x zone x urban/rural) whose last 7 days of bias or MAE lie outside the 95 % bootstrap interval of a 7-day
              value drawn from the 30 days before them (at least 14 of those days with data) is flagged, with a plain sentence.
   CLIENT     data/agents/verify/client-lines.json: the live heat line is offered to data/skill-evidence.json readers (evidence.mjs) only
              when it rests on at least 30 days and states its interval; until then the current text stays and the file says why. It
              covers exactly the domain the evidence covers (CLIENT_HEAT_PROVINCES, CLIENT_HEAT_LEADS, HEAT_TRUTH_NETS) and says that the
              level is not yet verified outside it.
   EWS-ANCHOR SHADOW (v91.17.283.25) the EWS live anchor the server computes every hour beside the served value and never serves
              (server/api/ewsshadow.mjs, data/archive/ewsanchor): at every archived hour of the day, served against served + anchor at
              (a) every EWS station with its own reading, and every station within exclude_within_km of it, LEFT OUT of its anchor (held
              out), and (b) the MACH, airport and synoptic stations within the anchor's reach; truth = this agent's quality-controlled
              hourly value (the reading nearest the hour). Cells by network and height band (data/ews-live-anchor.json heightBands) in
              the ledger (field ewsShadow); the pre-registered promotion rule (data/ews-live-anchor.json promotion, gate register entry
              ews-live-anchor) is applied in the summary (ewsAnchor, with the operator line) and written as the promotion record
              data/agents/verify/ews-anchor-promotion.json that the owner's approve command reads. Operator only.
   usage (the server does this): node scripts/agents/verify.mjs --app <nigraan-local> --data <dir> --copies <dir> [--lake <station-lake>]
          [--day YYYY-MM-DD | --backfill 30] [--force] [--now ISO]                        exit 0 done, 5 another copy running */
import { machRainHolds } from '../../server/api/rainholds.mjs';   /* v283.31 · owner 9.5 */
import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';   /* v283.47: gzipSync for the WN3 shadow pairs archive */
import { levelOfScreeningScore } from '../../server/api/scalecuts.mjs';
import { anchorAt, loadAnchorModel, ewsAccept } from '../../server/api/ewsanchor.mjs';   /* v283.44 · ewsAccept: the per-station EWS channel (switch NIGRAAN_EWS_THS) */   /* v91.17.283.25 · the EWS shadow anchor: one home of the method */
import { createHash } from 'node:crypto';
import { ownDir } from '../../server/api/ownpaths.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { args, readJson, writeJsonAtomic, appendLine, quantile, mean, fin, pktDay, pktHour, dayStartMs, addDays, pktText, takeLock, agentLog, readCsv, utcMs, num, rng, bootRatio, gzMembers, r1, r2, r3 } from './lib.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const API = join(HERE, '..', '..', 'server', 'api');
export const LAPSE_K_PER_M = 0.0065;      /* the standard-atmosphere lapse rate (ecmwf010.mjs LAPSE, Open-Meteo's own) */
export const DAY_MIN_HOURS = 20;          /* = server/api/archive.mjs DAY_MIN_HOURS (tests2837 checks they agree) */
export const WET_MM = 1;                  /* ETCCDI wet day */
export const URBAN_POP_KM2 = 1500;        /* GHSL / UN Degree of Urbanisation urban-centre cell density */
export const NEAREST_MIN = 15;            /* an hourly observation: the reading nearest the top of the hour within 15 min */
export const LEDGER_DAYS = 400, WINDOW = 30, RECENT = 7, MIN_REF_DAYS = 14, CLIENT_MIN_DAYS = 30;
/* v91.17.283.23 · self-audit J3 · the client heat line needs CLIENT_MIN_DAYS scored days within the last CLIENT_WINDOW days (it needed 30 of
   30, so one day the laptop was off blocked it and the line flipped as gaps entered and left the window) */
export const CLIENT_WINDOW = 60, INCOMPLETE_RETRY_DAYS = 7;
export const CHECKPOINT_DAYS = 7;   /* v91.17.283.24 · J19: days loaded and scored together (one drift-test recent window); the ledger is written after each day */
export const ZONES = ['plains', 'hills', 'mountain', 'coast'];
/* v91.17.283.8 HEATSKILL: heat truth and the client domain (data/evidence/heat2838: forecast days 1-2 in Sindh and Punjab at the
   standard-exposure networks are what the evidence covers) */
export const HEAT_TRUTH_NETS = ['synop', 'metar'];          /* WMO-sited screens and 10 m anemometers */
export const TEN_M_WIND_NETS = new Set(['synop', 'metar']);
export const SYNOP_MIN_REPORTS = 6;                         /* of the 8 synoptic hours (SCI2821 / score-monthly rule) */
export const CLIENT_HEAT_PROVINCES = ['Punjab', 'Sindh'];
export const CLIENT_HEAT_LEADS = [1, 2];
export const VARS = { T: 'temperature (hourly)', TX: 'daily maximum', TN: 'night minimum', RH: 'humidity (hourly)', W: 'wind (hourly)', R: 'daily rain' };
const UNIT = { T: '°C', TX: '°C', TN: '°C', RH: '%', W: 'km/h', R: 'mm' };
/* v91.17.283.24 · integration item 1 · the screening band of a UTCI AGN score is read from the one home of the cuts, data/hazard-scale.json
   screeningCuts via server/api/scalecuts.mjs (values unchanged); no register gives no level (null), never a typed guess */
const bandOf = (s) => (s == null ? null : levelOfScreeningScore(s));

/* ---------------------------------------------------------------------------------------------------------------------------- */
/* geometry: point in the tehsil polygons */
function pip(lon, lat, ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j];
  if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
export function tehsilIndex(gj) {
  const F = (gj && gj.features || []).map((f) => { const g = f.geometry || {}; const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    let x0 = 180, x1 = -180, y0 = 90, y1 = -90; for (const p of polys) for (const [x, y] of p[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { uid: f.properties && f.properties.uid, polys, bb: [x0, y0, x1, y1] }; });
  return (lat, lon) => { for (const f of F) { const b = f.bb; if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
    for (const p of f.polys) { if (pip(lon, lat, p[0]) && !p.slice(1).some((h) => pip(lon, lat, h))) return f.uid; } } return null; };
}
/* GHSL urban grid (data/urban.meta.json, urban.idx, urban.f16): population per km2 at a point, 0 where no built cell is carried */
export function urbanGrid(dataDir) {
  const meta = readJson(join(dataDir, 'urban.meta.json')); if (!meta) return null; let idx, f16;
  try { const a = readFileSync(join(dataDir, 'urban.idx')); idx = new Int32Array(a.buffer, a.byteOffset, a.length >> 2); const b = readFileSync(join(dataDir, 'urban.f16')); f16 = new Int16Array(b.buffer, b.byteOffset, b.length >> 1); } catch (_) { return null; }
  const g = meta.grid; const fi = (meta.fields || []).findIndex((x) => /population/i.test(x)); if (fi < 0) return null;
  return (lat, lon) => { const row = Math.round((g.lat0 - lat) / g.step - 0.5), col = Math.round((lon - g.lon0) / g.step - 0.5); const k = row * g.cols + col;
    let lo = 0, hi = idx.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (idx[m] === k) return f16[m * 4 + fi] * 10; if (idx[m] < k) lo = m + 1; else hi = m - 1; } return 0; };
}

/* ---------------------------------------------------------------------------------------------------------------------------- */
/* the stations of the networks, with their tehsil, zone (filled from the forecast rows), urban flag, height (no station list: obsqc.mjs judges values) */
export async function loadStations(ctx) {
  const { dataDir, copiesDir } = ctx; const out = [];
  const M = (readJson(join(dataDir, 'mach-fleet-stations.json'), {}) || {}).stations || []; const siting = ((readJson(join(dataDir, 'mach-siting.json'), {}) || {}).stations) || {};
  for (const s of M) if (fin(s.lat) && fin(s.lon)) out.push({ pid: 'mach:' + s.key, net: 'mach', key: String(s.key), name: s.name || s.key, lat: s.lat, lon: s.lon, elevHint: siting[s.key] && fin(siting[s.key].elevM) ? siting[s.key].elevM : null });
  const ap = readCsv(join(copiesDir, 'data', 'obs_other', 'metar_live', 'airports.csv'), { icao: ['icao'], name: ['title', 'name'], lat: ['lat'], lon: ['lon'], el: ['elev_m'] }) || [];
  for (const a of ap) { const lat = num(a.lat), lon = num(a.lon); if (fin(lat) && fin(lon)) out.push({ pid: 'metar:' + a.icao, net: 'metar', key: a.icao, name: a.name || a.icao, lat, lon, elevHint: num(a.el) }); }
  const cat = readCsv(join(copiesDir, 'data', 'pmd', 'aegis_gb_station_catalog.csv'), { id: ['stationId'], name: ['stationName'], lat: ['latitude'], lon: ['longitude'], el: ['altitude'] }) || [];
  for (const c of cat) { const lat = num(c.lat), lon = num(c.lon); if (fin(lat) && fin(lon)) out.push({ pid: 'aws:' + c.name, net: 'aws', key: String(c.id), name: c.name, lat, lon, elevHint: num(c.el) }); }
  const syn = ((readJson(join(dataDir, 'synop-stations.json'), {}) || {}).stations) || {};
  for (const [sid, m] of Object.entries(syn)) if (/^\d+$/.test(sid) && m && fin(m.lat) && fin(m.lon)) out.push({ pid: 'synop:' + sid, net: 'synop', key: sid, name: m.name || sid, lat: m.lat, lon: m.lon, elevHint: fin(m.elevM) ? m.elevM : null });
  const inT = tehsilIndex(readJson(join(dataDir, 'pk-tehsils.json'))); const urb = urbanGrid(dataDir);
  let PH = null; try { const { createPointHeight } = await import(pathToFileURL(join(API, 'pointheight.mjs')).href); PH = createPointHeight(dataDir); } catch (_) { PH = null; }
  for (const s of out) {
    s.uid = inT(s.lat, s.lon); const pop = urb ? urb(s.lat, s.lon) : null; s.urban = pop == null ? null : pop >= URBAN_POP_KM2; s.popKm2 = pop;
    let h = null; try { const r = PH && PH.heightAt(s.lat, s.lon); if (r && fin(r.elevM)) h = r.elevM; else if (r && fin(r.cellElevM)) h = r.cellElevM; } catch (_) {}
    s.elevM = fin(h) ? h : s.elevHint; s.elevBasis = fin(h) ? 'GLO-30' : (fin(s.elevHint) ? 'station record' : null);
  }
  return out;
}

/* ---------------------------------------------------------------------------------------------------------------------------- */
/* archives (gzip members appended per day: read as one stream) */
export const DAMAGED = [];   /* archive members that could not be read (skipped, reported in the summary) */
async function eachGzLine(file, fn) { const M = gzMembers(file); if (!M) return false;
  for (const d of M.damaged) DAMAGED.push({ file: file.split(/[\\/]/).slice(-2).join('/'), at: d.at, bytes: d.bytes });
  for (const t of M.texts) for (const l of t.split('\n')) if (l) fn(l); return true; }
const months = (days) => [...new Set(days.map((d) => d.slice(0, 7)))];
export async function loadForecasts(dataDir, issueDays) {
  const want = new Set(issueDays), FC = new Map();
  for (const m of months(issueDays)) await eachGzLine(join(dataDir, 'archive', 'forecast', 'fc_' + m + '.jsonl.gz'), (l) => { const d = (/"d"\s*:\s*"([^"]+)"/.exec(l.slice(0, 40)) || [])[1]; if (!want.has(d)) return; let r; try { r = JSON.parse(l); } catch (_) { return; }
    if (!FC.has(r.d)) FC.set(r.d, new Map()); FC.get(r.d).set(r.u, { lat: r.lat, lon: r.lon, t0: Date.parse(r.t0), n: r.n, T: r.T, RH: r.RH, P: r.P, W: r.W, z: r.z, sel: r.sel ?? r.el, iss: r.iss }); });
  return FC;
}
export async function loadPoints(dataDir, issueDays) {
  const want = new Set(issueDays), P = new Map();
  for (const m of months(issueDays)) await eachGzLine(join(dataDir, 'archive', 'points', 'points_' + m + '.jsonl.gz'), (l) => { let r; try { r = JSON.parse(l); } catch (_) { return; } if (!want.has(r.d)) return;
    const k = r.d + '|' + r.id; if (P.has(k)) return; const H = new Map(); for (const h of r.hours || []) { const ms = Date.parse(h[0] + ':00Z') - 5 * 3600e3; if (fin(ms)) H.set(ms, [h[1], h[2], h[3]]); } P.set(k, H); });
  return P;
}
/* the morning issue's heat levels: the first engine result received at or after 06:00 PKT of each issue day (before 12:00 PKT) */
export async function loadHeat(dataDir, issueDays) {
  const want = new Set(issueDays), E = new Map();
  for (const m of months(issueDays)) await eachGzLine(join(dataDir, 'archive', 'engine', 'engine_' + m + '.jsonl.gz'), (l) => {
    const at = Date.parse((/"at"\s*:\s*"([^"]+)"/.exec(l.slice(0, 300)) || [])[1] || ''); if (!fin(at)) return; const d = pktDay(at), h = pktHour(at);
    if (!want.has(d) || h < 6 || h >= 12) return; const prev = E.get(d); if (prev && prev.at < at) return;
    let r; try { r = JSON.parse(l); } catch (_) { return; }
    /* v91.17.283.23 · audit 1 · revisions of one issue (same engine time): the last revision that was live before 12:00 PKT of the issue day
       is the one scored (what the morning issue showed); a later revision of the same issue is not */
    const rev = Number(r.revision) || 0, live = r.revisedAt ? Date.parse(r.revisedAt) : at;
    if (prev && prev.at === at && (rev <= prev.rev || !(fin(live) && pktDay(live) === d && pktHour(live) < 12))) return;
    const days = new Map(); for (const x of r.days || []) { const L = x.layers && x.layers.heat; if (L) days.set(Number(x.day), L); }
    if (days.size) E.set(d, { at, rev, issueId: r.issueId || null, build: r.build || null, days }); });
  return E;
}

/* ---------------------------------------------------------------------------------------------------------------------------- */
/* observations: readings per station, screened, for the UTC days that cover the Pakistan days asked */
export async function loadObs(ctx, pktDays, stations, FC = null) {
  const { dataDir, copiesDir, lake } = ctx; const lo = dayStartMs(pktDays[0]), hi = dayStartMs(addDays(pktDays[pktDays.length - 1], 1));
  const utcDays = []; for (let t = lo - 864e5; t <= hi; t += 864e5) utcDays.push(new Date(t).toISOString().slice(0, 10));
  const byPid = new Map(); const add = (pid, r) => { let a = byPid.get(pid); if (!a) byPid.set(pid, a = []); a.push(r); };
  const reg = new Map(stations.filter((s) => s.net === 'mach').map((s) => [s.key, s]));
  /* MACH: NIGRAAN's database sync (month files) and LAMHA's daily copies; one reading per station and time */
  const seen = new Set(); const src = { machDb: 0, machCopy: 0, metar: 0, aws: 0, synop: 0 };
  const takeMach = (r, from) => { const key = r.key; if (!reg.has(key)) return; const prov = String(r.provider || '').toLowerCase(), so = String(r.source || '').toLowerCase();
    if (/^apple/.test(prov) || so === 'qm' || so === 'apple') return; const ms = utcMs(r.time); if (!fin(ms) || ms < lo - 3600e3 || ms >= hi + 3600e3) return;
    const k = key + '|' + ms; if (seen.has(k)) return; seen.add(k); src[from]++;
    add('mach:' + key, { ms, T: num(r.T), Td: num(r.Td), RH: num(r.RH), W: num(r.W), G: num(r.G), P: num(r.P), S: num(r.S), PT: num(r.PT), RR: num(r.RR) }); };   /* RR: rain rate mm/h (v283.28 rain truth; not a judged variable) */
  const AL = { key: ['station_key', 'stationKey', 'key'], time: ['time', 'time_utc'], source: ['source'], provider: ['provider'], T: ['temperature_c', 'temperatureC'], Td: ['dew_point_c', 'dewPointC'], RH: ['humidity_pct', 'humidityPct'],
    W: ['wind_speed_kmh', 'windSpeedKmh'], G: ['wind_gust_kmh', 'windGustKmh'], P: ['pressure_hpa', 'pressureHpa'], S: ['solar_wm2', 'solarWm2'], PT: ['precip_total_mm', 'precipTotalMm'], RR: ['precip_rate_mmhr', 'precipRateMmhr', 'precip_rate_mm'] };
  if (lake) for (const m of months(utcDays)) { const rows = readCsv(join(lake, 'archive', 'fleet', 'db', 'mach_db_' + m + '.csv'), AL); if (rows) for (const r of rows) takeMach(r, 'machDb'); }
  for (const d of utcDays) { const rows = readCsv(join(copiesDir, 'data', 'mach', 'db', 'obs_' + d.replace(/-/g, '') + '.csv'), AL); if (rows) for (const r of rows) takeMach(r, 'machCopy'); }
  /* METAR */
  for (const m of [...new Set(utcDays.map((d) => d.slice(0, 7).replace('-', '')))]) { const rows = readCsv(join(copiesDir, 'data', 'obs_other', 'metar_live', 'metar_' + m + '.csv'), { st: ['station'], t: ['time_utc'], T: ['t_c'], Td: ['td_c'], raw: ['raw'] }) || [];
    for (const r of rows) { const ms = utcMs(r.t); if (!fin(ms) || ms < lo - 3600e3 || ms >= hi + 3600e3) continue; const T = num(r.T), Td = num(r.Td); let W = null; const w = /\b(\d{3}|VRB)(\d{2,3})(G\d{2,3})?(KT|MPS)\b/.exec(r.raw || ''); if (w) W = Number(w[2]) * (w[4] === 'MPS' ? 3.6 : 1.852);
      const RH = fin(T) && fin(Td) ? Math.max(0, Math.min(100, 100 * Math.exp(17.67 * Td / (Td + 243.5) - 17.67 * T / (T + 243.5)))) : null;   /* the psychro.mjs constants (rhFromDew) */
      src.metar++; add('metar:' + r.st, { ms, T, Td, RH, W }); } }
  /* SYNOP (v91.17.283.8): the synoptic reports kept by the server's synop module; numeric ids only, one report per station and time */
  { const synIds = new Set(stations.filter((s) => s.net === 'synop').map((s) => s.key)); const sSeen = new Set();
    if (lake && synIds.size) for (const m of months(utcDays)) { let txt = ''; try { txt = readFileSync(join(lake, 'archive', 'synop', 'synop_' + m + '.jsonl'), 'utf8'); } catch (_) { continue; }
      for (const l of txt.split('\n')) { if (!l.trim()) continue; let r; try { r = JSON.parse(l); } catch (_) { continue; } const sid = String(r.sid || ''); if (!/^\d+$/.test(sid) || !synIds.has(sid)) continue;
        const ms = Date.parse(r.t); if (!fin(ms) || ms < lo - 3600e3 || ms >= hi + 3600e3) continue; const k = sid + '|' + ms; if (sSeen.has(k)) continue; sSeen.add(k);
        const T = num(r.t_c), Td = num(r.td_c); const RH = fin(T) && fin(Td) ? Math.max(0, Math.min(100, 100 * Math.exp(17.67 * Td / (Td + 243.5) - 17.67 * T / (T + 243.5)))) : null;
        const ws = num(r.wspd); src.synop++; add('synop:' + sid, { ms, T, Td, RH, W: fin(ws) ? ws * 3.6 : null }); } } }
  /* AWS (operator-only network) */
  const awsName = new Map(stations.filter((s) => s.net === 'aws').map((s) => [s.key, s.pid])); const accT = ewsAccept(copiesDir, 'T'), accRH = ewsAccept(copiesDir, 'RH');   /* v283.44 · off: 'Air Temperature' / 'Relative Humidity' only */
  for (const d of utcDays) { const f = join(copiesDir, 'data', 'pmd', 'ews_live', 'raw', 'ews_raw_' + d.replace(/-/g, '') + '.csv.gz'); if (!existsSync(f)) continue; let txt = ''; try { txt = gunzipSync(readFileSync(f)).toString('utf8'); } catch (_) { continue; }
    const lines = txt.split('\n'); const head = lines.shift().split(','); const ix = (n) => head.indexOf(n); const iv = ix('value'), it = ix('time_utc'), is = ix('station_id'), ie = ix('element');
    const acc = new Map(); for (const l of lines) { if (!l) continue; const c = l.split(','); const pid = awsName.get(c[is]); if (!pid) continue; const el = c[ie]; const ms = utcMs(c[it]); const v = num(c[iv]); if (!fin(ms) || !fin(v)) continue;
      const k = pid + '|' + ms; const o = acc.get(k) || { pid, ms }; if (accT(c[is], el)) o.T = v; else if (accRH(c[is], el)) o.RH = v; else if (el === 'Wind Speed') o.W = v * 3.6; else continue; acc.set(k, o); }
    for (const o of acc.values()) { src.aws++; add(o.pid, { ms: o.ms, T: o.T ?? null, RH: o.RH ?? null, W: o.W ?? null }); } }
  /* v91.17.283.14 · value-level quality control (server/api/obsqc.mjs), every network, one call: the hourly value of each station and
     variable (the reading nearest the hour within NEAREST_MIN, the one whose temperature passes first) is judged; a failing variable is
     nulled on that reading (its raw value kept in r.raw), the other variables stay. Readings that are not an hour's pick are marked
     r.bad for the hourly series (they carry no spatial verdict) and keep only the rain total. The zone comes from the issued tehsil
     forecasts (FC) when the caller has them; the forecast is never a background of the truth (v91.17.283.24 · J5). */
  if (ctx.rawOnly) { for (const a of byPid.values()) a.sort((x, y) => x.ms - y.ms); return { byPid, src }; }   /* unjudged readings (scripts/tests28314: parameter derivation, replay) */
  const Q = await import(pathToFileURL(join(API, 'obsqc.mjs')).href); const P = Q.loadParams(dataDir);
  const zoneOfUid = new Map(); if (FC) for (const m of FC.values()) for (const [u, r] of m) if (r.z && !zoneOfUid.has(u)) zoneOfUid.set(u, r.z);
  const qs = stations.map((s) => ({ pid: s.pid, net: s.net, lat: s.lat, lon: s.lon, elev: fin(s.elevM) ? s.elevM : null, zone: zoneOfUid.get(s.uid) || null }));   /* net: the per-network settings (v91.17.283.16) */
  /* v91.17.283.24 · J5: bgAt null - no check of a value against the issued forecast (see QUALITY above); FC gives the zone only */
  const res = Q.qcBatch(qs, byPid, P, { nearestMin: NEAREST_MIN, bgAt: null, copyOf: copyOfMach(dataDir), ...(ctx.qcView === 'offsets' ? { spatial: false, climate: false } : {}) });
  const qc = { ...res.counts, params: P.version };
  for (const [pid, a] of byPid) { const picks = new Set((res.hourly.get(pid) || new Map()).values());
    for (const r of a) { if (!picks.has(r)) { r.bad = true; continue; } if (r.f) { r.raw = {}; for (const v of Object.keys(r.f)) { r.raw[v] = r[v]; r[v] = null; } } } }
  return { byPid, src, qc, hourly: res.hourly };
}
/* the issued tehsil forecast at a station and hour (the newest issue covering it): temperature moved to the station height, humidity
   and wind as issued - obsqc's background ({ T, RH, W }). v91.17.283.24: used only by the parameter derivation (scripts/tests28314); the
   verification truth is never judged against the forecast it scores (J5) */
export function backgroundOf(FC, stations) {
  const st = new Map(stations.map((s) => [s.pid, s])); const days = [...FC.keys()].sort().reverse();
  return (pid, h) => { const s = st.get(pid); if (!s || !s.uid) return null;
    for (const d of days) { const f = FC.get(d).get(s.uid); if (!f || !f.T) continue; const i = Math.round((h - f.t0) / 3600e3); if (i < 0 || i >= f.n || f.T[i] == null) continue;
      return { T: f.T[i] / 10 + (fin(s.elevM) && fin(f.sel) ? -LAPSE_K_PER_M * (s.elevM - f.sel) : 0), RH: f.RH && f.RH[i] != null ? f.RH[i] : null, W: f.W && f.W[i] != null ? f.W[i] : null }; } return null; };
}
/* the registry's identity record (data/mach-fleet-stations.json "identity": { kind: duplicate | mixup, of }): a feed carrying another
   station's device. Used ONLY by obsqc's copy check to say which of two identical values is the copy; it drops no station. */
export function copyOfMach(dataDir) {
  const M = (readJson(join(dataDir, 'mach-fleet-stations.json'), {}) || {}).stations || []; const out = new Map();
  for (const s of M) { const x = s.identity; if (x && x.of && (x.kind === 'duplicate' || x.kind === 'mixup')) out.set('mach:' + s.key, 'mach:' + x.of); }
  return out;
}
/* hourly values: the reading nearest the top of each UTC hour within NEAREST_MIN */
function hourly(rows, h0, h1) { const H = new Map(); let j = 0;
  for (let h = h0; h < h1; h += 3600e3) { while (j < rows.length && rows[j].ms < h - NEAREST_MIN * 6e4) j++; let best = null;
    for (let k = j; k < rows.length && rows[k].ms <= h + NEAREST_MIN * 6e4; k++) { const r = rows[k]; if (r.bad) continue; if (!best || Math.abs(r.ms - h) < Math.abs(best.ms - h)) best = r; }
    if (best) H.set(h, best); }
  return H; }
/* v91.17.283.8 HEATSKILL · the observed heat level, like for like with the issued level (see HEAT TRUTH above):
   the day's highest hourly shade UTCI over the Pakistan day, from the hourly values, with the 10 m wind (the station's own on a 10 m
   exposure, else the served 10 m wind of the tehsil at that hour). Returns { u, level, hours } or null when the day is not covered.
   (Before v283.8 the level was the maximum over every 10-minute reading 09:00-18:00 with the station's own mast wind, at every network.) */
export function utciInRange(U, t, v, h) {   /* v91.17.283.23 · audit 8 · the served rule: the polynomial inside its validity range, else null
                                             (utci.mjs agnUtci refuses; no clamp, as the point record, the area heat and the page engine) */
  const u = U.utci(t, t, v, h); return u != null && Number.isFinite(u) ? u : null; }
export function servedWindAt(FC, uid, day) {   /* the served 10 m wind (km/h) at each hour of a day: the newest issue that covers the day */
  for (let L = 0; L <= 4; L++) { const f = (FC.get(addDays(day, -L)) || new Map()).get(uid); if (!f || !f.W) continue;
    return (h) => { const i = Math.round((h - f.t0) / 3600e3); return i >= 0 && i < f.n && f.W[i] != null ? f.W[i] : null; }; }
  return null; }
export function heatObserved(rows, day, net, windAt, U) {
  const d0 = dayStartMs(day), H = hourly(rows, d0, d0 + 864e5); let best = null, hours = 0, outside = 0;
  for (const [h, r] of H) { if (!fin(r.T) || !fin(r.RH)) continue; let w;
    if (TEN_M_WIND_NETS.has(net)) w = fin(r.W) ? Math.max(0.5, r.W / 3.6) : 0.5;   /* calm or missing: the model's 0.5 m/s reference, as the page */
    else { const fw = windAt ? windAt(h) : null; if (!fin(fw)) continue; w = Math.max(0.5, fw / 3.6); }
    const u = utciInRange(U, r.T, w, r.RH); if (u == null || !Number.isFinite(u)) { outside++; continue; } hours++; if (best == null || u > best) best = u; }
  const need = net === 'synop' ? SYNOP_MIN_REPORTS : DAY_MIN_HOURS;
  /* a measured hour outside the UTCI range (valid readings) makes the day's peak unknown, as on the served side: the day is not scored */
  return best == null || hours < need || outside > 0 ? null : { u: best, level: bandOf(U.utciAgnScore(best)), hours }; }

/* v91.17.283.24 · J16 · the daily maximum and minimum of one station day, like for like: pairs [forecast, observed] of the hours that hold
   both; null below DAY_MIN_HOURS such hours (the extremes are not scored) */
export function dailyExtremes(pairs) {
  const P = pairs.filter((p) => fin(p[0]) && fin(p[1])); if (P.length < DAY_MIN_HOURS) return null;
  let fx = -Infinity, fn = Infinity, ox = -Infinity, on = Infinity; for (const [f, o] of P) { if (f > fx) fx = f; if (f < fn) fn = f; if (o > ox) ox = o; if (o < on) on = o; }
  return { fTX: fx, fTN: fn, oTX: ox, oTN: on, hours: P.length };
}
/* v91.17.283.24 · J17 · the issued rain of one Pakistan day: the sum of its 24 hourly values, null when any hour is not issued (never 0).
   v91.17.283.28 · the hour-ending rule (server/api/pktday.mjs HOUR_ENDING_RULE): an hourly amount stamped hh is the preceding hour, so the
   day holds the values stamped 01:00 ... 24:00 PKT (was 00:00 ... 23:00: one hour of the day before in, the last hour of the day out) */
export function dayRain(f, d0) {
  let s = 0; for (let h = d0 + 3600e3; h <= d0 + 864e5; h += 3600e3) { const i = Math.round((h - f.t0) / 3600e3); if (!f.P || i < 0 || i >= f.n || f.P[i] == null) return null; s += f.P[i] / 10; }
  return s;
}

/* ---------------------------------------------------------------------------------------------------------------------------- */
/* v91.17.283.28 · RAIN TRUTH (findings V1-V3 of the rain investigation, 28 Oct 2026). Every number from data/obs-qc-params.json "rain".
   V1 the daily rain of a MACH gauge is the sum of the positive steps of its counter within the Pakistan day (gaps up to 1 h bridged; a
      longer gap is bridged only when the counter did not move across it; otherwise the day is MISSING, never 0). Before: the highest
      counter reading of the day, which counted yesterday's total still on the counter after midnight and every stuck counter.
   V2 a station-day whose counter falls more than once (a flipping counter) or rises >= 1 mm while the rain rate stays 0 is held; a
      station whose counter shows the same non-zero daily maximum day after day (stuck / non-resetting) is held.
   V3 buddy check: a wet day is isolated when its >= 3 gauges within 50 km are all dry, or, with fewer neighbours, when the satellite reads
      0 there; a station whose isolated days are >= 3 and >= half of its wet days is held.
   The truth is judged without the forecast (J5): nothing here reads an issued value. */
export const RAIN_TRUTH_V = 'rain-incr-91.17.283.28';
export const RAIN_TRUTH_LABEL = 'rain gauges (MACH counter increments, quality-controlled)';
export const SATELLITE_LABEL = 'satellite (IMERG Late)';
const OWN_DATA = join(HERE, '..', '..', 'data');
export function rainParams(dataDir) {
  /* v283.31 owner 9.5: the owner's rain-channel holds ride with the rain parameters (P.rainHolds: key -> why) */
  for (const d of [dataDir, OWN_DATA]) { const j = d ? readJson(join(d, 'obs-qc-params.json'), null) : null; if (j && j.rain && j.rain.counter) return { ...j.rain, rainHolds: Object.fromEntries(machRainHolds(dataDir || OWN_DATA).held) }; }
  throw new Error('data/obs-qc-params.json has no "rain" section (the rain truth has no typed fallback)');
}
/* first index with ms > t (rows sorted by ms) */
function after(rows, t) { let lo = 0, hi = rows.length; while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m].ms > t) hi = m; else lo = m + 1; } return lo; }
/* one gauge day. rows: the station's readings with a counter (PT) and the rain rate (RR, mm/h, may be null), sorted by time.
   Returns { mm (null = missing), why, resets, rise, rateMm, rateHours, maxRate, maxPT, readings } */
export function gaugeDay(rows, d0, P) {
  const C = P.counter, br = (C.bridge_gap_min + (C.bridge_tol_min || 0)) * 6e4, dipW = (C.dip_window_min + (C.bridge_tol_min || 0)) * 6e4, tol = C.drop_tol_mm, d1 = d0 + 864e5;
  const R = rows.filter((r) => fin(r.PT)); const a = after(R, d0), z = after(R, d1);   /* readings in (d0, d1] are R[a .. z-1] */
  const out = { mm: null, why: null, resets: 0, dips: 0, rise: 0, rateMm: 0, rateHours: 0, maxRate: null, maxPT: null, readings: z - a, hours: 0, longGaps: 0 };
  if (z <= a) { out.why = 'no counter reading in the day'; return out; }
  let mm = 0, missing = null, p = a > 0 ? R[a - 1] : null; const rh = new Set(), hh = new Set();
  for (let i = a; i < z; i++) { const r = R[i]; hh.add(Math.floor((r.ms - d0 - 1) / 3600e3));
    if (fin(r.RR)) { rh.add(Math.floor((r.ms - d0) / 3600e3)); if (out.maxRate == null || r.RR > out.maxRate) out.maxRate = r.RR; }
    if (!p) { p = r; if (r.ms - d0 > br) missing = missing || 'no reading before ' + pktText(r.ms); if (out.maxPT == null || r.PT > out.maxPT) out.maxPT = r.PT; continue; }   /* the head of the record */
    const gap = r.ms - p.ms, dv = r.PT - p.PT;
    /* a dip: a fall the counter recovers from (back to its value before the fall) within dip_window_min: a glitch or two interleaved
       copies of one feed, not a reset; the readings in the dip are skipped (counted) */
    if (dv < -tol) { let back = false; for (let j = i + 1; j < R.length && R[j].ms - r.ms <= dipW; j++) if (R[j].PT >= p.PT - tol) { back = true; break; } if (back) { out.dips++; continue; } }
    /* a spike: a rise the counter falls back from to its non-zero value before the rise within dip_window_min (Avenue 28 Sep 2026: 7.11 ->
       24.38 -> 7.11); a return to 0 is a reset, not a spike, so a zero baseline is never skipped here */
    if (dv > tol && p.PT > tol) { let back = false; for (let j = i + 1; j < R.length && R[j].ms - r.ms <= dipW; j++) { if (Math.abs(R[j].PT - p.PT) <= tol) { back = true; break; } if (R[j].PT < p.PT - tol) break; } if (back) { out.dips++; continue; } }
    if (out.maxPT == null || r.PT > out.maxPT) out.maxPT = r.PT;
    if (gap > br) {   /* a longer gap: exact when the counter did not move, or rose without a reset with both readings inside the day (the counter
                         carries the accumulation through the gap); a fall across it, or a rise across the day's start, leaves the day missing */
      if (Math.abs(dv) <= tol && p.ms >= d0 - 864e5) { p = r; continue; }
      if (dv > tol && p.ms > d0) { mm += dv; out.rise += dv; out.longGaps++; p = r; continue; }
      missing = missing || 'a ' + Math.round(gap / 6e4) + '-min gap across which the counter ' + (dv < 0 ? 'fell' : 'rose from the day before') + ' (' + pktText(p.ms) + ' to ' + pktText(r.ms) + ')'; p = r; continue; }
    if (fin(r.RR)) out.rateMm += Math.max(0, r.RR) * gap / 3600e3;
    if (dv < -tol) { out.resets++; mm += Math.max(0, r.PT); out.rise += Math.max(0, r.PT); }   /* a reset: the counter value is the rain since it */
    else if (dv > 0) { mm += dv; out.rise += dv; }   /* a fall within one tip is reading noise: 0 */
    p = r; }
  /* the tail: the time after the last reading of the day is covered when it is short, or when the next reading shows the counter unmoved */
  const last = p; if (last && d1 - last.ms > br) { const n = R[z]; if (!n || !(Math.abs(n.PT - last.PT) <= tol && n.ms - d1 <= 864e5)) missing = missing || 'no reading after ' + pktText(last.ms) + ' that shows the counter unmoved'; }
  out.rateHours = rh.size; out.rateMm = r3(out.rateMm); out.hours = hh.size;
  if (!missing && out.hours < C.min_hours) missing = 'counter read in ' + out.hours + ' hours of the day (' + C.min_hours + ' needed)';
  if (missing) { out.why = missing; return out; }
  out.mm = Math.round(mm * 100) / 100; return out;
}
const km = (a, b) => { const R = 6371, dl = (b.lat - a.lat) * Math.PI / 180, dn = (b.lon - a.lon) * Math.PI / 180; const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); };
/* the satellite's Pakistan day at a tehsil (data/imerg/pkt/<day>.json, the half-hourly Late Run summed over 00-24 PKT, imerg.mjs fetchPktDay);
   null when that day was not built (the UTC daily file is never used for a Pakistan day) */
export function imergPktReader(dataDir) { const memo = new Map();
  return (uid, day) => { if (!memo.has(day)) { const j = readJson(join(dataDir, 'imerg', 'pkt', day + '.json'), null); memo.set(day, j && j.units ? j.units : null); }
    const u = memo.get(day); const v = u ? u[uid] : null; return fin(v) ? v : null; }; }
/* the rain truth of every MACH station over a run of days: Map 'pid|day' -> { mm (null = not scored), held, why, ... } and counts.
   days: the days asked (sorted); station-level holds look back window_days within the readings given (callers load that history). */
export function rainTruthTable(stations, byPid, days, P, imergAt = null) {
  const RH = { held: P && P.rainHolds ? new Map(Object.entries(P.rainHolds)) : machRainHolds().held }; const ms = stations.filter((s) => s.net === 'mach'); const T = new Map(); const G = new Map();   /* G: pid -> Map(day -> gaugeDay) */
  const ownerHold = (pid) => { const w = RH.held.get(String(pid).replace(/^mach:/, '')); return w ? 'rain channel held by the owner (data/mach-rain-holds.json): ' + w : null; };   /* v283.31 owner 9.5: never rain truth, never a neighbour */
  const all = [...new Set(days)].sort(); const S = P.stuck, I = P.isolation, F = P.flip;
  const counts = { stationDays: 0, measured: 0, missing: 0, flip: 0, rateZero: 0, stuck: 0, isolatedDays: 0, isolatedHeld: 0, isolationUnjudged: 0, wet: 0, scored: 0 };
  for (const s of ms) { const rows = (byPid.get(s.pid) || []).filter((r) => fin(r.PT)).sort((x, y) => x.ms - y.ms); if (!rows.length) continue; const g = new Map();
    for (const d of all) { const x = gaugeDay(rows, dayStartMs(d), P); if (x.readings) g.set(d, x); } G.set(s.pid, g); }
  const inWin = (d, D, w) => d <= D && d > addDays(D, -w);
  /* V2 day holds and the stuck counter (trailing window, the day itself included) */
  const dayHold = (x) => (x.resets > P.counter.max_resets_per_day ? 'flip: the counter fell ' + x.resets + ' times in one day' : fin(x.mm) && x.rise >= F.rise_mm && x.rateHours >= F.rate_min_hours && x.maxRate === 0 ? 'counter rose ' + r2(x.rise) + ' mm while the rain rate stayed 0' : null);
  const stuckOn = (g, D) => { const v = []; for (const [d, x] of g) if (inWin(d, D, S.window_days) && fin(x.maxPT)) v.push(x.maxPT); if (!v.length) return null;
    const by = new Map(); for (const m of v) { if (!(m > S.same_tol_mm)) continue; const k = Math.round(m / S.same_tol_mm); by.set(k, (by.get(k) || 0) + 1); }
    let best = 0, bk = null; for (const [k, n] of by) if (n > best) { best = n; bk = k; } return best >= S.min_days && best / v.length >= S.min_share ? { value: r2(bk * S.same_tol_mm), days: best, of: v.length } : null; };
  const base = new Map();   /* pid|day -> { x, hold } after V1 and V2 */
  for (const s of ms) { const g = G.get(s.pid); if (!g) continue; for (const [d, x] of g) { let hold = ownerHold(s.pid) || dayHold(x); if (!hold) { const st = stuckOn(g, d); if (st) hold = 'stuck counter: the same daily maximum ' + st.value + ' mm on ' + st.days + ' of ' + st.of + ' days'; }
    base.set(s.pid + '|' + d, { x, hold }); } }
  /* V3 isolation of each valid wet day */
  const nb = new Map(); for (const s of ms) nb.set(s.pid, ms.filter((o) => o !== s && fin(o.lat) && fin(s.lat) && km(s, o) <= I.radius_km));
  const iso = new Map();   /* pid|day -> true (isolated) | false (corroborated) | null (not judged) */
  for (const s of ms) for (const d of all) { const b = base.get(s.pid + '|' + d); if (!b || b.hold || !fin(b.x.mm) || b.x.mm < I.wet_mm) continue;
    const N = nb.get(s.pid).map((o) => base.get(o.pid + '|' + d)).filter((o) => o && !o.hold && fin(o.x.mm));
    if (N.length >= I.num_min) { iso.set(s.pid + '|' + d, !N.some((o) => o.x.mm >= I.corroborate_mm)); continue; }
    const im = imergAt && s.uid ? imergAt(s.uid, d) : null; iso.set(s.pid + '|' + d, fin(im) ? im < I.imerg_zero_mm : null); }
  const isoHeld = (pid, D) => { let wet = 0, n = 0; for (const [k, v] of iso) { const [p, d] = [k.slice(0, k.lastIndexOf('|')), k.slice(k.lastIndexOf('|') + 1)]; if (p !== pid || !inWin(d, D, I.window_days)) continue; wet++; if (v === true) n++; }
    return n >= I.hold_min_days && wet > 0 && n / wet >= I.hold_min_share ? { isolated: n, wet } : null; };
  for (const s of ms) for (const d of days) { const b = base.get(s.pid + '|' + d); if (!b) continue; counts.stationDays++; const x = b.x; let hold = b.hold, why = x.why;
    if (!fin(x.mm)) counts.missing++; else counts.measured++;
    if (hold) { if (/^flip/.test(hold)) counts.flip++; else if (/^counter rose/.test(hold)) counts.rateZero++; else counts.stuck++; }
    const iv = iso.get(s.pid + '|' + d); if (iv === true) counts.isolatedDays++; if (iv === null) counts.isolationUnjudged++;
    if (!hold) { const ih = isoHeld(s.pid, d); if (ih) { hold = 'isolated gauge: ' + ih.isolated + ' of its ' + ih.wet + ' wet days in ' + I.window_days + ' days had no corroborating neighbour'; counts.isolatedHeld++; } }
    const mm = hold ? null : x.mm; if (fin(mm)) { counts.scored++; if (mm >= I.wet_mm) counts.wet++; }
    T.set(s.pid + '|' + d, { mm, raw: x.mm, held: hold || null, why: hold || why || null, isolated: iv ?? null, resets: x.resets, rateMm: x.rateMm, rateHours: x.rateHours }); }
  return { table: T, counts, version: RAIN_TRUTH_V };
}
/* the ledger note of one day's rain truth: the rule version, the counts of that day and the stations held (with the reason) */
export function rainTruthOfDay(RAIN, D, P) {
  const T = RAIN.table || RAIN; const c = { stationDays: 0, scored: 0, missing: 0, held: 0, wet: 0, isolatedDays: 0 }; const held = [];
  for (const [k, t] of T) { if (!k.endsWith('|' + D)) continue; c.stationDays++; if (t.held) { c.held++; held.push([k.slice(0, k.lastIndexOf('|')), t.held]); } else if (!fin(t.mm)) c.missing++; else { c.scored++; if (t.mm >= P.isolation.wet_mm) c.wet++; } if (t.isolated === true) c.isolatedDays++; }
  return { v: RAIN_TRUTH_V, params: P.version, truth: RAIN_TRUTH_LABEL, satellite: SATELLITE_LABEL + ', Pakistan day', ...c, heldStations: held.slice(0, 40) };
}
/* the MACH counter and rate readings of a run of Pakistan days (NIGRAAN's database sync and LAMHA's daily copies, forecast rows left out) */
export function loadRainRows(ctx, fromDay, toDay, stations) {
  const { copiesDir, lake } = ctx; const lo = dayStartMs(fromDay) - 864e5, hi = dayStartMs(toDay) + 2 * 864e5; const reg = new Set(stations.filter((s) => s.net === 'mach').map((s) => s.key));
  const byPid = new Map(), seen = new Set(); const AL = { key: ['station_key', 'stationKey', 'key'], time: ['time', 'time_utc'], source: ['source'], provider: ['provider'], PT: ['precip_total_mm', 'precipTotalMm'], RR: ['precip_rate_mmhr', 'precipRateMmhr', 'precip_rate_mm'] };
  const take = (r) => { if (!reg.has(r.key)) return; const prov = String(r.provider || '').toLowerCase(), so = String(r.source || '').toLowerCase(); if (/^apple/.test(prov) || so === 'qm' || so === 'apple') return;
    const ms = utcMs(r.time); if (!fin(ms) || ms < lo || ms >= hi) return; const k = r.key + '|' + ms; if (seen.has(k)) return; seen.add(k); const PT = num(r.PT); if (!fin(PT)) return;
    const pid = 'mach:' + r.key; let a = byPid.get(pid); if (!a) byPid.set(pid, a = []); a.push({ ms, PT, RR: num(r.RR) }); };
  const utcDays = []; for (let t = lo; t < hi; t += 864e5) utcDays.push(new Date(t).toISOString().slice(0, 10));
  if (lake) for (const m of [...new Set(utcDays.map((d) => d.slice(0, 7)))]) { const rows = readCsv(join(lake, 'archive', 'fleet', 'db', 'mach_db_' + m + '.csv'), AL); if (rows) for (const r of rows) take(r); }
  if (copiesDir) for (const d of utcDays) { const rows = readCsv(join(copiesDir, 'data', 'mach', 'db', 'obs_' + d.replace(/-/g, '') + '.csv'), AL); if (rows) for (const r of rows) take(r); }
  for (const a of byPid.values()) a.sort((x, y) => x.ms - y.ms); return byPid;
}
/* the rain cells of one target day: gauge (R, wet, RT g|) first, then the satellite at every issued tehsil (RI, wetI, RT i|), labelled apart */
export function rainCells(D, stations, FC, RAIN, imergAt, zoneOf, S, C, RT) {
  const issue = [0, 1, 2, 3].map((L) => addDays(D, -L)), d0 = dayStartMs(D), d1 = d0 + 864e5;
  const acc = (k, e) => { const a = S[k] || (S[k] = [0, 0, 0, 0]); a[0]++; a[1] += e; a[2] += Math.abs(e); a[3] += e * e; };
  const cont = (k, f, o) => { const a = C[k] || (C[k] = [0, 0, 0, 0]); a[f && o ? 0 : f ? 1 : o ? 2 : 3]++; };
  const tot = (k, f, o) => { const a = RT[k] || (RT[k] = [0, 0, 0]); a[0]++; a[1] += f; a[2] += o; };
  const covers = (f) => { let cov = 0; for (let h = d0; h < d1; h += 3600e3) { const i = Math.round((h - f.t0) / 3600e3); if (i >= 0 && i < f.n) cov++; } return cov >= DAY_MIN_HOURS; };
  for (const s of stations) { if (s.net !== 'mach' || !s.uid) continue; const t = RAIN.get(s.pid + '|' + D); if (!t || !fin(t.mm)) continue; const zone = zoneOf.get(s.uid); if (!zone) continue;
    const urb = s.urban == null ? 'unknown' : s.urban ? 'urban' : 'rural';
    for (let L = 0; L <= 3; L++) { const f = (FC.get(issue[L]) || new Map()).get(s.uid); if (!f || !covers(f)) continue; const fr = dayRain(f, d0); if (!fin(fr)) continue;
      const k = '|mach|' + zone + '|' + L + '|' + urb; acc('R' + k, fr - t.mm); cont('wet' + k, fr >= WET_MM, t.mm >= WET_MM); tot('g|' + zone + '|' + L, fr, t.mm); } }
  if (imergAt) { const done = new Set(); for (let L = 0; L <= 3; L++) for (const [uid, f] of (FC.get(issue[L]) || new Map())) { const key = uid + '|' + L; if (done.has(key)) continue; done.add(key);
      const zone = f.z || zoneOf.get(uid); if (!zone || !covers(f)) continue; const im = imergAt(uid, D); if (!fin(im)) continue; const fr = dayRain(f, d0); if (!fin(fr)) continue;
      const k = '|imerg|' + zone + '|' + L + '|all'; acc('RI' + k, fr - im); cont('wetI' + k, fr >= WET_MM, im >= WET_MM); tot('i|' + zone + '|' + L, fr, im); } }
}

/* ---------------------------------------------------------------------------------------------------------------------------- */
/* one target day: the ledger record */
export async function scoreDay(ctx, D, pre = {}) {
  const stations = pre.stations || await loadStations(ctx); const issue = [0, 1, 2, 3].map((L) => addDays(D, -L));
  const FC = pre.FC || await loadForecasts(ctx.dataDir, [...issue, addDays(D, -4)]); const PTS = pre.PTS || await loadPoints(ctx.dataDir, issue); const HEAT = pre.HEAT || await loadHeat(ctx.dataDir, issue);
  const OB = pre.OB || await loadObs(ctx, daysBetween(addDays(D, -4), D), stations, FC);
  const U = pre.U || await import(pathToFileURL(join(API, 'utci.mjs')).href);
  const S = {}, C = {}, V = {}, RT = {}; const used = { mach: 0, metar: 0, aws: 0, synop: 0 }, noTehsil = [];
  /* v91.17.283.28 · the rain truth (V1-V3): from the caller's table (run() builds it over the trailing window), else from the readings at hand */
  const RP = pre.RP || rainParams(ctx.dataDir); const imergAt = pre.IMERG !== undefined ? pre.IMERG : (ctx.dataDir ? imergPktReader(ctx.dataDir) : null);
  const RAIN = pre.RAIN || rainTruthTable(stations, OB.byPid, daysBetween(addDays(D, -4), D), RP, imergAt);
  const acc = (k, e) => { const a = S[k] || (S[k] = [0, 0, 0, 0]); a[0]++; a[1] += e; a[2] += Math.abs(e); a[3] += e * e; };
  const cont = (k, f, o) => { const a = C[k] || (C[k] = [0, 0, 0, 0]); a[f && o ? 0 : f ? 1 : o ? 2 : 3]++; };   /* a hit, b false alarm, c miss, d correct none */
  const d0 = dayStartMs(D), d1 = d0 + 864e5; const zoneOf = new Map();
  for (const m of FC.values()) for (const [u, r] of m) if (r.z && !zoneOf.has(u)) zoneOf.set(u, r.z);
  for (const s of stations) {
    const rows = OB.byPid.get(s.pid) || []; if (!rows.length) continue; if (!s.uid) { noTehsil.push(s.pid); continue; }
    const zone = zoneOf.get(s.uid) || null; if (!zone) continue; const urb = s.urban == null ? 'unknown' : s.urban ? 'urban' : 'rural';
    const H = hourly(rows, d0, d1); let any = false;
    for (let L = 0; L <= 3; L++) { const f = (FC.get(issue[L]) || new Map()).get(s.uid); if (!f) continue;
      { let cov = 0; for (let h = d0; h < d1; h += 3600e3) { const i = Math.round((h - f.t0) / 3600e3); if (i >= 0 && i < f.n) cov++; } if (cov < DAY_MIN_HOURS) continue; }   /* a lead is scored only where the issue covers the day */
      const adj = fin(s.elevM) && fin(f.sel) ? -LAPSE_K_PER_M * (s.elevM - f.sel) : 0; const pairT = [];
      for (let h = d0; h < d1; h += 3600e3) { const i = Math.round((h - f.t0) / 3600e3); if (i < 0 || i >= f.n) continue;
        const ft = f.T && f.T[i] != null ? f.T[i] / 10 + adj : null;
        const o = H.get(h); if (!o) continue; const k = '|' + s.net + '|' + zone + '|' + L + '|' + urb;
        if (fin(ft) && fin(o.T)) { acc('T' + k, ft - o.T); pairT.push([ft, o.T]); any = true; }
        if (f.RH && f.RH[i] != null && fin(o.RH)) acc('RH' + k, f.RH[i] - o.RH);
        if (f.W && f.W[i] != null && fin(o.W)) acc('W' + k, f.W[i] - o.W); }
      const k = '|' + s.net + '|' + zone + '|' + L + '|' + urb;
      const X = dailyExtremes(pairT); if (X) { acc('TX' + k, X.fTX - X.oTX); acc('TN' + k, X.fTN - X.oTN); }
    }
    /* heat levels (days 0-3 of the morning issue) against the observed level; persistence = the level observed the day before issue.
       v91.17.283.24 · J4: persistence and the forecast it is compared with are scored on the same station-days (fm* / pm*) */
    const oH = heatObserved(rows, D, s.net, servedWindAt(FC, s.uid, D), U); const oL = oH ? oH.level : null;
    const sp = CLIENT_HEAT_PROVINCES.includes(String(s.uid).split('|')[0]);   /* the client domain is kept in its own cells */
    if (oL != null) for (let L = 0; L <= 3; L++) { const E = HEAT.get(issue[L]); const lv = E && E.days.get(L) ? E.days.get(L)[s.uid] : null; if (lv == null || lv < 0) continue;
      const k = '|' + s.net + '|' + zone + '|' + L + '|' + urb; cont('heat2' + k, lv >= 2, oL >= 2); cont('heat3' + k, lv >= 3, oL >= 3); if (sp) cont('heat2sp' + k, lv >= 2, oL >= 2);
      const pd = addDays(issue[L], -1), pH = heatObserved(rows, pd, s.net, servedWindAt(FC, s.uid, pd), U), pL = pH ? pH.level : null;
      if (pL != null) { cont('fm2' + k, lv >= 2, oL >= 2); cont('pm2' + k, pL >= 2, oL >= 2); cont('fm3' + k, lv >= 3, oL >= 3); cont('pm3' + k, pL >= 3, oL >= 3);
        if (sp) { cont('fm2sp' + k, lv >= 2, oL >= 2); cont('pm2sp' + k, pL >= 2, oL >= 2); } } any = true; }
    /* the issued 90 % range at the airport points */
    if (s.net === 'metar') for (let L = 0; L <= 3; L++) { const P = PTS.get(issue[L] + '|' + s.key); if (!P) continue;
      for (let h = d0; h < d1; h += 3600e3) { const p = P.get(h), o = H.get(h); if (!p || !o || !fin(o.T) || !fin(p[1]) || !fin(p[2])) continue; const k = 'cov|' + s.net + '|' + zone + '|' + L + '|' + urb; const a = V[k] || (V[k] = [0, 0, 0, 0]);
        a[0]++; if (o.T >= p[1] && o.T <= p[2]) a[1]++; a[2] += p[0] - o.T; a[3] += Math.abs(p[0] - o.T); } }
    if (any) used[s.net]++;
  }
  /* partner-network radar rain (operator only): the served hourly rain of each tehsil whose served point lies inside radar range, against
     the radar's hourly rain interval (scripts/agents/radar_points.py); an hour is wet at 1 mm or more; an hour whose interval straddles
     1 mm is undetermined and left out (counted) */
  const radarNotes = {};
  for (const [site, R] of Object.entries((pre.RADAR && pre.RADAR[D]) || {})) { if (!R || !R.hours) continue; radarNotes[site] = { notes: R.notes, files: R.files, points: Object.keys(R.points || {}).length, reader: R.reader };
    for (const [uid, H] of Object.entries(R.hours)) for (let L = 0; L <= 3; L++) { const f = (FC.get(issue[L]) || new Map()).get(uid); if (!f || !f.P) continue;
      let cov = 0; for (let h = d0; h < d1; h += 3600e3) { const i = Math.round((h - f.t0) / 3600e3); if (i >= 0 && i < f.n) cov++; } if (cov < DAY_MIN_HOURS) continue;
      for (let h = d0 + 3600e3; h <= d1; h += 3600e3) { const i = Math.round((h - f.t0) / 3600e3); if (i < 0 || i >= f.n || f.P[i] == null) continue; const b = H[String(h)]; if (!b) continue;
        const k = '|radar|' + site + '|' + L + '|all'; const obsYes = b[0] >= WET_MM, obsNo = b[1] != null && b[1] <= WET_MM;   /* band upper limits are exclusive: an hour whose upper bound is 1 mm had less than 1 mm */
        if (!obsYes && !obsNo) { const u = S['radarU' + k] || (S['radarU' + k] = [0, 0, 0, 0]); u[0]++; continue; }
        cont('radar1' + k, f.P[i] / 10 >= WET_MM, obsYes); } } }
  rainCells(D, stations, FC, RAIN.table || RAIN, imergAt, zoneOf, S, C, RT);   /* v91.17.283.28: gauges first, the satellite apart (RI / wetI / RT i|) */
  const issues = issue.map((d, L) => ({ lead: L, issue: d, tehsilForecast: FC.has(d) ? FC.get(d).size : 0, heatIssue: HEAT.has(d) ? pktText(HEAT.get(d).at) : null }));
  return { day: D, built: new Date(ctx.now || Date.now()).toISOString(), v: 1, stations: used, noTehsil: noTehsil.length, issues, radar: radarNotes, S, C, V, RT, rainTruth: rainTruthOfDay(RAIN, D, RP) };
}

/* ---------------------------------------------------------------------------------------------------------------------------- */
/* v91.17.283.25 · EWS-ANCHOR SHADOW: served against served + anchor (see the header); nothing here is served */
export async function loadEwsShadow(dataDir, fromMs, toMs) {
  const out = new Map(); const ms = []; for (let t = Date.UTC(new Date(fromMs).getUTCFullYear(), new Date(fromMs).getUTCMonth(), 1); t <= toMs; t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1)) ms.push(new Date(t).toISOString().slice(0, 7));
  for (const m of ms) await eachGzLine(join(dataDir, 'archive', 'ewsanchor', 'ewsa_' + m + '.jsonl.gz'), (l) => { let r; try { r = JSON.parse(l); } catch (_) { return; } const h = Date.parse(r.h + ':00:00Z'); if (!fin(h) || h < fromMs || h >= toMs) return; out.set(h, r); });
  return out;
}
const bandOfElev = (M, e) => { if (!fin(e)) return 'height unknown'; const b = (M.heightBands || []).find((x) => e >= x.from && e < x.to); return b ? b.name : 'height unknown'; };
export function scoreEwsShadow(D, rowsByHour, OB, M) {
  const d0 = dayStartMs(D), d1 = d0 + 864e5; const cells = {}; const add = (k, es, ea) => { const a = cells[k] || (cells[k] = [0, 0, 0]); a[0]++; a[1] += es; a[2] += ea; };
  const HH = new Map(); const hourOf = (pid) => { if (!HH.has(pid)) HH.set(pid, hourly(OB.byPid.get(pid) || [], d0, d1)); return HH.get(pid); };
  let hours = 0, noAnchor = 0;
  for (const [h, row] of rowsByHour) { if (h < d0 || h >= d1) continue; hours++; const atMs = Date.parse(row.at);
    const set = (row.r || []).map((x) => ({ id: x[1], name: x[0], lat: x[2], lon: x[3], elevM: x[4], res: fin(x[6]) && fin(x[8]) ? x[6] - x[8] : null, obsMs: atMs - x[7] * 6e4, servedH: x[9] }));
    for (const s of set) { if (!fin(s.servedH)) continue; const o = hourOf('aws:' + s.name).get(h); if (!o || !fin(o.T)) continue;
      const a = anchorAt(M, set, s.lat, s.lon, h, { exclude: s.id }); if (!a.applied) { noAnchor++; continue; }
      const es = Math.abs(s.servedH - o.T), ea = Math.abs(s.servedH + a.dT - o.T); add('ews|all', es, ea); add('ews|' + bandOfElev(M, s.elevM), es, ea); }
    for (const x of row.o || []) { const [pid, , , elevM, served, dT] = x; if (!fin(served) || !fin(dT)) continue; const o = hourOf(pid).get(h); if (!o || !fin(o.T)) continue;
      const es = Math.abs(served - o.T), ea = Math.abs(served + dT - o.T); const net = String(pid).split(':')[0]; add('other|all', es, ea); add('other|' + net, es, ea); add('other|' + bandOfElev(M, elevM), es, ea); } }
  return { hours, noAnchor, cells, model: M ? M.version : null };
}
export function ewsShadowSummary(recs, M) {
  if (!M) return { assessed: false, why: 'no model file (data/ews-live-anchor.json)' };
  const P = M.promotion || {}; const mr = P.marginRule || {}; const margin = (mae) => Math.max(mr.floorC, mr.shareOfMae * mae);
  const days = recs.filter((r) => r.ewsShadow && r.ewsShadow.cells && r.ewsShadow.cells['ews|all']);
  const stratum = (k, seed) => { const b = recs.filter((r) => r.ewsShadow && r.ewsShadow.cells && r.ewsShadow.cells[k]).map((r) => { const c = r.ewsShadow.cells[k]; return { day: r.day, num: c[1] - c[2], den: c[0], es: c[1], ea: c[2] }; });
    const n = b.reduce((a, x) => a + x.den, 0); if (!n) return null; const es = b.reduce((a, x) => a + x.es, 0) / n, ea = b.reduce((a, x) => a + x.ea, 0) / n;
    const ci = bootRatio(b, (P.bootstrap || {}).B || 2000, ((P.bootstrap || {}).seed || 20261027) + seed); return { n, days: b.length, maeServed: r3(es), maeShadow: r3(ea), gain: r3(es - ea), ci: ci ? ci.map(r3) : null, margin: r3(margin(es)) }; };
  const all = stratum('ews|all', 0); const bands = (M.heightBands || []).map((b, i) => ({ band: b.name, ...(stratum('ews|' + b.name, i + 1) || { n: 0, days: 0 }) }));
  const other = stratum('other|all', 9); const nets = ['mach', 'metar', 'synop'].map((n, i) => ({ net: n, ...(stratum('other|' + n, 20 + i) || { n: 0, days: 0 }) }));
  const reasons = []; const minDays = P.minDays, minBand = P.minBandDays;
  if (!(days.length >= minDays)) reasons.push(days.length + ' scored day' + (days.length === 1 ? '' : 's') + ' (' + minDays + ' needed)');
  if (!(all && all.ci && all.ci[0] > 0)) reasons.push('held-out EWS gain lower bound ' + (all && all.ci ? all.ci[0] : 'not computed') + ' is not above 0');
  for (const b of bands) if (b.days >= minBand && !(b.ci && b.ci[0] > -b.margin)) reasons.push(b.band + ': lower bound ' + (b.ci ? b.ci[0] : 'not computed') + ' below -' + b.margin);
  if (other && other.ci && !(other.ci[0] > -other.margin)) reasons.push('other stations: lower bound ' + other.ci[0] + ' below -' + other.margin);
  const rulePassed = !reasons.length; const hook = !!M.servingHook; const promote = rulePassed && hook && M.live !== true;
  const why = promote ? 'the pre-registered rule passed: the owner may approve' : rulePassed ? (M.live === true ? 'already live' : 'the rule passed but this build has no serving hook: ' + (M.servingHookWhy || 'a later package adds it')) : 'the pre-registered rule is not met: ' + reasons.join('; ');
  const f = (x) => (x == null ? '-' : x);
  const line = 'EWS anchor (shadow, not served): ' + days.length + ' of ' + minDays + ' scored days; held-out EWS MAE ' + (all ? f(all.maeServed) + ' C served -> ' + f(all.maeShadow) + ' C with the anchor, gain ' + f(all.gain) + ' C [' + (all.ci ? all.ci.join(', ') : 'interval not computed') + '], ' + all.n + ' pairs' : 'not scored yet')
    + (other ? '; other stations gain ' + f(other.gain) + ' C [' + (other.ci ? other.ci.join(', ') : '-') + ']' : '') + '; ' + (promote ? 'PROMOTION READY (owner approval)' : rulePassed ? 'rule passed, no serving hook' : 'rule not met') + '.';
  return { assessed: !!all, id: P.id || null, version: M.version, live: M.live === true, days: days.length, need: minDays, heldOut: all, bands, other, networks: nets, rulePassed, promote, why, reasons, rule: P.rule || null, line, served: false };
}
export function writeEwsPromotion(dataDir, S, nowMs = Date.now()) {
  const f = join(dataDir, 'ews-live-anchor.json'); let sha = null; try { sha = createHash('sha256').update(readFileSync(f)).digest('hex'); } catch (_) { sha = null; }
  const rec = { id: S.id || 'ews-anchor@1', at: new Date(nowMs).toISOString(), version: S.version || null, promote: S.promote === true, rulePassed: !!S.rulePassed, reasons: S.promote ? [] : [S.why],
    rule: S.rule, pointer: { target: 'ews-anchor-live', fromSha256: sha }, evidence: { days: S.days, heldOut: S.heldOut, bands: S.bands, other: S.other }, served: false };
  writeJsonAtomic(join(dataDir, 'agents', 'verify', 'ews-anchor-promotion.json'), rec); return rec;
}

/* ---------------------------------------------------------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------------------------------------------------------- */
/* v91.17.283.47 (NIGRAAN 1.0.9) · WN3 SHADOW: WeatherNext 3 (Google DeepMind) as a shadow member of the blend, scored against the
   stations every day under data/evidence/wn3/RULES_WN3_LIVE_SHADOW_20261102.md (locked; its sha256 and the sha256 of data/wn3-shadow.json
   are checked before any summary). Nothing here is served: no server module reads these files (scripts/tests28347wn).
     run      the WN3 00 UTC run of the day BEFORE the served issue day (data/archive/wn3, station-lake/scripts/wn3_live_import.py),
              counted only when its store was published before 00:00 PKT of the issue day (the newest run a 00 PKT issue could use)
     where    each station of this agent with its nearest WN3 point of kind 'station' within matchKm; the zone of its tehsil forecast
     values   served = the served tehsil forecast of the issue as this agent scores it (T moved to the station height); WN3-cal = WN3 + the
              2024-fitted bias (zone | lead h | season of the init month, RULES_WN3_SCORE_20261102 C1); blend+WN3 = (served + WN3-cal) / 2;
              rain: WN3 as issued, blend = (served + WN3) / 2
     truth    this agent's quality-controlled hourly value (T, Td, wind) and gauge day (rain), never judged against any forecast
   ledger field wn3Shadow (cells: n, sum |error| served / blend / WN3, sum error served / blend / WN3; cont: 2x2 tables at 10 mm), the pairs
   of the day in data/archive/wn3shadow/<day>.json.gz, the summary and the look of the rules in data/agents/verify/wn3-shadow-promotion.json. */
export const WN3_SHADOW_ON = () => process.env.NIGRAAN_WN3_SHADOW !== '0';
export const WN3_RULES_SHA256 = '4fd0405a4789f8f01e4ee132081374963fd458e7573ea40928bf4ec7c680e1ba';
export const WN3_CONFIG_SHA256 = 'ac86cb8bc5350718c09b8903c8214badf60824964586235de254bea13e801d9a';
export function loadWn3Config(dataDir) {
  if (!WN3_SHADOW_ON()) return null; const f = join(dataDir, 'wn3-shadow.json'); if (!existsSync(f)) return null;
  try { const raw = readFileSync(f); const C = JSON.parse(raw.toString('utf8')); C._sha256 = createHash('sha256').update(raw).digest('hex'); return C; } catch (_) { return null; }
}
export function wn3RulesCheck(dataDir, C) {
  const rf = join(dataDir, 'evidence', 'wn3', 'RULES_WN3_LIVE_SHADOW_20261102.md'); let rs = null; try { rs = createHash('sha256').update(readFileSync(rf)).digest('hex'); } catch (_) { rs = null; }
  const why = []; if (rs !== WN3_RULES_SHA256) why.push('rules file ' + (rs ? 'sha256 ' + rs.slice(0, 12) + '... differs from the lock' : 'missing'));
  if (!C || C._sha256 !== WN3_CONFIG_SHA256) why.push('data/wn3-shadow.json ' + (C ? 'sha256 ' + String(C._sha256).slice(0, 12) + '... differs from the lock' : 'missing'));
  return { ok: !why.length, why, rulesSha256: rs, configSha256: C ? C._sha256 : null };
}
const ymdOf = (day) => day.replace(/-/g, '');
export function loadWn3Runs(dataDir, initDays) {
  const out = new Map(); for (const d of [...new Set(initDays)]) { const f = join(dataDir, 'archive', 'wn3', 'wn3_' + ymdOf(d) + '_00.json.gz'); if (!existsSync(f)) continue;
    try { const r = JSON.parse(gunzipSync(readFileSync(f)).toString('utf8')); r._i3 = new Map((r.leads3 || []).map((h, k) => [h, k])); r._i1 = new Map((r.leads1 || []).map((h, k) => [h, k])); out.set(d, r); } catch (_) {} }
  return out;
}
export function loadWn3Points(dataDir) { const j = readJson(join(dataDir, 'archive', 'wn3', 'points.json'), null); if (!j || !Array.isArray(j.points)) return [];
  return j.points.map((p) => ({ id: String(p[0]), kind: p[1], net: p[2], key: p[3], lat: p[4], lon: p[5] })); }
const kmOf = (a, b) => { const R = 6371, la = (a.lat + b.lat) / 2 * Math.PI / 180; const x = (b.lon - a.lon) * Math.PI / 180 * Math.cos(la), y = (b.lat - a.lat) * Math.PI / 180; return R * Math.sqrt(x * x + y * y); };
export function wn3Match(stations, pts, maxKm) {
  const P = pts.filter((p) => p.kind === 'station' && fin(p.lat) && fin(p.lon)); const M = new Map();
  for (const s of stations) { if (!fin(s.lat) || !fin(s.lon)) continue; let best = null, bd = Infinity; for (const p of P) { if (Math.abs(p.lat - s.lat) > 0.05 || Math.abs(p.lon - s.lon) > 0.06) continue; const d = kmOf(s, p); if (d < bd) { bd = d; best = p; } }
    if (best && bd <= maxKm) M.set(s.pid, { id: best.id, km: Math.round(bd * 1000) / 1000 }); }
  return M;
}
const SEAS4 = (m) => (m === 12 || m <= 2 ? 'DJF' : m <= 5 ? 'MAM' : m <= 8 ? 'JJA' : 'SON');
const magTd = (t, rh) => { if (!fin(t) || !fin(rh) || rh <= 0) return null; const g = Math.log(Math.min(rh, 100) / 100) + 17.625 * t / (243.04 + t); return 243.04 * g / (17.625 - g); };
const parseUtc = (s) => { if (!s) return NaN; const t = String(s); return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : t + 'Z'); };
export function scoreWn3Shadow(D, stations, FC, OB, RAIN, runs, match, C, zoneOf) {
  const d0 = dayStartMs(D); const cells = {}, cont = {}, pairs = [], runInfo = {}; const maxLead = C.maxLeadH || 72; const bias = (C.calibration && C.calibration.bias) || {};
  const leads = [...new Set(C.cells.flatMap((c) => c.leads))].sort();
  const acc = (k, s, b, w, o) => { const a = cells[k] || (cells[k] = [0, 0, 0, 0, 0, 0, 0]); a[0]++; a[1] += Math.abs(s - o); a[2] += Math.abs(b - o); a[3] += Math.abs(w - o); a[4] += s - o; a[5] += b - o; a[6] += w - o; };
  const tab = (k, f, o) => { const a = cont[k] || (cont[k] = [0, 0, 0, 0]); a[f && o ? 0 : f ? 1 : o ? 2 : 3]++; };
  const H3 = []; for (let k = 0; k < 8; k++) H3.push(d0 + 2 * 3600e3 + k * 3 * 3600e3);   /* 21 UTC the day before .. 18 UTC */
  const hourMaps = new Map(); const hourOf = (pid) => { if (!hourMaps.has(pid)) hourMaps.set(pid, hourly(OB.byPid.get(pid) || [], d0, d0 + 864e5)); return hourMaps.get(pid); };
  for (const L of leads) {
    const I = addDays(D, -L), initDay = addDays(I, -1), run = runs.get(initDay), issueMs = dayStartMs(I);
    const pub = run ? parseUtc(run.published_utc) : NaN; const inTime = !!run && fin(pub) && pub < issueMs;
    runInfo[L] = { issue: I, wn3Init: initDay + 'T00Z', held: !!run, published: run ? run.published_utc || null : null, inTime };
    if (!inTime) continue;
    const initMs = Date.parse(initDay + 'T00:00:00Z'); const season = SEAS4(new Date(initMs).getUTCMonth() + 1); const fcI = FC.get(I) || new Map();
    const cal = (v, zone, lead, x) => { if (!fin(x)) return null; const t = bias[v]; const b = t ? t[zone + '|' + lead + '|' + season] : null; return fin(b) ? x + b : x; };
    for (const s of stations) {
      if (!s.uid) continue; const zone = zoneOf.get(s.uid) || null; if (!zone) continue;
      const my = C.cells.filter((c) => c.zone === zone && c.leads.includes(L) && (!c.nets || c.nets.includes(s.net))); if (!my.length) continue;
      const m = match.get(s.pid); const P = m ? run.pts[m.id] : null; if (!P) continue; const f = fcI.get(s.uid); if (!f) continue;
      const adj = fin(s.elevM) && fin(f.sel) ? -LAPSE_K_PER_M * (s.elevM - f.sel) : 0; const has = (v) => my.some((c) => c.v === v); const H = hourOf(s.pid);
      const day = { T: [] };
      for (const h of H3) {
        const i = Math.round((h - f.t0) / 3600e3); const lead = Math.round((h - initMs) / 3600e3); const k3 = run._i3.get(lead);
        if (i < 0 || i >= f.n || lead > maxLead || k3 == null) { day.T.push(null); continue; }
        const T0 = f.T && f.T[i] != null ? f.T[i] / 10 : null; const sv = { T: fin(T0) ? T0 + adj : null, Td: f.RH && f.RH[i] != null ? magTd(T0, f.RH[i]) : null, W: f.W && f.W[i] != null ? f.W[i] / 3.6 : null };
        const wv = { T: cal('T', zone, lead, P.T ? P.T[k3] : null), Td: cal('Td', zone, lead, P.Td ? P.Td[k3] : null), W: cal('W', zone, lead, P.W ? P.W[k3] : null) };
        const o = H.get(h); const ov = o ? { T: fin(o.T) ? o.T : null, Td: fin(o.Td) ? o.Td : magTd(o.T, o.RH), W: fin(o.W) ? o.W / 3.6 : null } : { T: null, Td: null, W: null };
        for (const v of ['T', 'Td', 'W']) { if (!has(v) || !fin(sv[v]) || !fin(wv[v]) || !fin(ov[v])) continue; const b = (sv[v] + wv[v]) / 2;
          acc(v + '|' + zone + '|' + L + '|' + s.net, sv[v], b, wv[v], ov[v]); pairs.push([s.pid, v, L, h, r2(sv[v]), r2(b), r2(wv[v]), r2(ov[v]), lead]); }
        day.T.push(fin(sv.T) && fin(wv.T) && fin(ov.T) ? [sv.T, wv.T, ov.T] : null);
      }
      if ((has('TX') || has('TN')) && day.T.every((x) => x)) {
        const mx = (j) => Math.max(...day.T.map((x) => x[j])), mn = (j) => Math.min(...day.T.map((x) => x[j]));
        if (has('TX')) { const sv = mx(0), wv = mx(1), ov = mx(2); acc('TX|' + zone + '|' + L + '|' + s.net, sv, (sv + wv) / 2, wv, ov); pairs.push([s.pid, 'TX', L, d0, r2(sv), r2((sv + wv) / 2), r2(wv), r2(ov), null]); }
        if (has('TN')) { const sv = mn(0), wv = mn(1), ov = mn(2); acc('TN|' + zone + '|' + L + '|' + s.net, sv, (sv + wv) / 2, wv, ov); pairs.push([s.pid, 'TN', L, d0, r2(sv), r2((sv + wv) / 2), r2(wv), r2(ov), null]); }
      }
      const rc = my.find((c) => c.v === 'R10');
      if (rc) { const t = RAIN ? RAIN.get(s.pid + '|' + D) : null; const fr = dayRain(f, d0);
        let wr = 0; for (let k = 1; k <= 24; k++) { const lead = Math.round((d0 + k * 3600e3 - initMs) / 3600e3); const j = run._i1.get(lead); const x = j == null || lead > maxLead || !P.R ? null : P.R[j]; if (!fin(x)) { wr = null; break; } wr += x; }
        if (t && fin(t.mm) && fin(fr) && fin(wr)) { const thr = rc.thresholdMm || 10, b = (fr + wr) / 2, k = 'R10|' + zone + '|' + L + '|' + s.net;
          tab(k + '|s', fr >= thr, t.mm >= thr); tab(k + '|b', b >= thr, t.mm >= thr); tab(k + '|w', wr >= thr, t.mm >= thr); pairs.push([s.pid, 'R24', L, d0, r2(fr), r2(b), r2(wr), r2(t.mm), null]); } }
    }
  }
  return { v: 1, rules: C.rules && C.rules.id, config: C.version, runs: runInfo, matched: match.size, cells, cont, pairs };
}
/* the rules' look: decision dates, the cells, the day-block bootstrap (B 2000, seed 20261102), the pass rule (rules sections 5-7) */
export const WN3_LOOKS = [{ date: '2026-12-20', level: 0.95 }, { date: '2027-01-20', level: 0.995 }, { date: '2027-02-20', level: 0.995 }, { date: '2027-03-20', level: 0.995 }];
export const WN3_FIRST_DAY = '2026-11-04';
const STD_NETS = new Set(['synop', 'metar']);
const etsOf = (a, b, c, d) => { const n = a + b + c + d; if (!n) return null; const ar = (a + b) * (a + c) / n; const den = a + b + c - ar; return den > 0 ? (a - ar) / den : null; };
function bootDays(blocks, stat, B, seed, lv) { if (blocks.length < 2) return null; const R = rng(seed), out = [];
  for (let i = 0; i < B; i++) { const pick = []; for (let j = 0; j < blocks.length; j++) pick.push(blocks[Math.floor(R() * blocks.length)]); const v = stat(pick); if (fin(v)) out.push(v); }
  if (out.length < 100) return null; const q = (1 - lv) / 2; return [quantile(out, q), quantile(out, 1 - q)]; }
export function wn3ShadowSummary(recs, C, check, nowMs = Date.now()) {
  if (!C) return { assessed: false, why: WN3_SHADOW_ON() ? 'no data/wn3-shadow.json in this install' : 'NIGRAAN_WN3_SHADOW=0' };
  const today = pktDay(nowMs); const look = [...WN3_LOOKS].reverse().find((l) => today >= l.date) || null; const lookNo = look ? WN3_LOOKS.indexOf(look) + 1 : 0;
  const last = look ? addDays(look.date, -2) : addDays(today, -1);
  const days = recs.filter((r) => r.wn3Shadow && r.wn3Shadow.cells && r.day >= WN3_FIRST_DAY && r.day <= last);
  const level = look ? look.level : 0.95; const B = 2000, SEED = 20261102;
  const leadsAll = [...new Set(C.cells.flatMap((c) => c.leads))];
  const feed = {}; for (const L of leadsAll) { const n = days.length, k = days.filter((r) => r.wn3Shadow.runs && r.wn3Shadow.runs[L] && r.wn3Shadow.runs[L].inTime).length; feed[L] = { days: n, inTime: k, share: n ? r3(k / n) : null }; }
  const out = []; let seedK = 0;
  for (const c of C.cells) for (const L of c.leads) {
    const pre = c.v + '|' + c.zone + '|' + L + '|'; seedK++;
    if (c.v === 'R10') {
      const blocks = days.map((r) => { const T = { s: [0, 0, 0, 0], b: [0, 0, 0, 0], w: [0, 0, 0, 0] }; let n = 0;
        for (const [k, a] of Object.entries(r.wn3Shadow.cont || {})) { if (!k.startsWith(pre)) continue; const side = k.slice(-1); for (let j = 0; j < 4; j++) T[side][j] += a[j]; if (side === 's') n += a[0] + a[1] + a[2] + a[3]; }
        return { day: r.day, T, n }; }).filter((x) => x.n > 0);
      const sum = (bl, side) => { const t = [0, 0, 0, 0]; for (const x of bl) for (let j = 0; j < 4; j++) t[j] += x.T[side][j]; return t; };
      const n = blocks.reduce((a, x) => a + x.n, 0), ev = blocks.reduce((a, x) => a + x.T.s[0] + x.T.s[2], 0);
      const es = n ? etsOf(...sum(blocks, 's')) : null, eb = n ? etsOf(...sum(blocks, 'b')) : null, ew = n ? etsOf(...sum(blocks, 'w')) : null;
      const judged = blocks.length >= 30 && n >= 300 && ev >= 20;
      const ci = judged ? bootDays(blocks, (bl) => { const x = etsOf(...sum(bl, 'b')), y = etsOf(...sum(bl, 's')); return fin(x) && fin(y) ? x - y : null; }, B, SEED + seedK, level) : null;
      out.push({ v: c.v, zone: c.zone, lead: L, days: blocks.length, stationDays: n, events: ev, etsServed: r3(es), etsBlend: r3(eb), etsWn3: r3(ew), dEts: fin(eb) && fin(es) ? r3(eb - es) : null, ci: ci ? ci.map(r3) : null,
        decision: !judged ? 'not judged (too few)' : !ci ? 'not computable' : ci[0] > 0 ? 'blend+WN3 better' : ci[1] < 0 ? 'served better' : 'no clear difference' });
      continue;
    }
    const blocks = [], grp = { std: [0, 0, 0], other: [0, 0, 0] };
    for (const r of days) { let n = 0, s = 0, b = 0, w = 0, es = 0, eb = 0;
      for (const [k, a] of Object.entries(r.wn3Shadow.cells)) { if (!k.startsWith(pre)) continue; n += a[0]; s += a[1]; b += a[2]; w += a[3]; es += a[4]; eb += a[5];
        const g = STD_NETS.has(k.slice(pre.length)) ? grp.std : grp.other; g[0] += a[0]; g[1] += a[1]; g[2] += a[2]; }
      if (n) blocks.push({ day: r.day, num: s - b, den: n, s, b, w, es, eb }); }
    const n = blocks.reduce((a, x) => a + x.den, 0); const tot = (f) => blocks.reduce((a, x) => a + x[f], 0);
    const daily = c.v === 'TX' || c.v === 'TN'; const judged = blocks.length >= 30 && n >= (daily ? 300 : 500);
    const ci = judged ? bootDays(blocks, (bl) => { let u = 0, d = 0; for (const x of bl) { u += x.num; d += x.den; } return d > 0 ? u / d : null; }, B, SEED + seedK, level) : null;
    out.push({ v: c.v, zone: c.zone, lead: L, days: blocks.length, n, maeServed: n ? r3(tot('s') / n) : null, maeBlend: n ? r3(tot('b') / n) : null, maeWn3: n ? r3(tot('w') / n) : null,
      biasServed: n ? r3(tot('es') / n) : null, biasBlend: n ? r3(tot('eb') / n) : null, D: n ? r3((tot('s') - tot('b')) / n) : null, ci: ci ? ci.map(r3) : null,
      groups: { std: grp.std[0] ? { n: grp.std[0], D: r3((grp.std[1] - grp.std[2]) / grp.std[0]) } : null, other: grp.other[0] ? { n: grp.other[0], D: r3((grp.other[1] - grp.other[2]) / grp.other[0]) } : null },
      decision: !judged ? 'not judged (too few)' : !ci ? 'not computable' : ci[0] > 0 ? 'blend+WN3 better' : ci[1] < 0 ? 'served better' : 'no clear difference' });
  }
  /* pass per variable x zone (rules section 7): at a look only; >= 1 judged lead "blend+WN3 better", none "served better"; the run in time on
     >= 90 % of the scored days for every lead of the cell; the rule and configuration hashes as locked */
  const passes = [], reasons = [];
  if (!check.ok) reasons.push(...check.why);
  for (const c of C.cells) { const rows = out.filter((x) => x.v === c.v && x.zone === c.zone); const win = rows.filter((x) => x.decision === 'blend+WN3 better').length, loss = rows.filter((x) => x.decision === 'served better').length;
    const fd = c.leads.every((L) => feed[L] && feed[L].share != null && feed[L].share >= 0.9); const ok = !!look && check.ok && win >= 1 && loss === 0 && fd;
    if (ok) passes.push({ v: c.v, zone: c.zone, wins: win }); }
  const why = !look ? 'collecting: the first look of the rules is on ' + WN3_LOOKS[0].date + ' (target days from ' + WN3_FIRST_DAY + ')' : passes.length ? 'look ' + lookNo + ' (' + look.date + '): ' + passes.length + ' cell(s) passed; serving needs a release with a serving hook and the owner\'s acceptance of the GDM real-time terms' : 'look ' + lookNo + ' (' + look.date + '): no cell passed';
  const line = 'WN3 shadow (not served): ' + days.length + ' scored day(s) since ' + WN3_FIRST_DAY + '; ' + out.filter((x) => x.D != null || x.dEts != null).map((x) => x.v + ' ' + x.zone + ' L' + x.lead + ' ' + (x.v === 'R10' ? 'dETS ' + x.dEts : 'D ' + x.D + ' C/m/s') + ' (' + x.decision + ')').join('; ') + '. ' + why + '.';
  return { assessed: days.length > 0, id: C.id, version: C.version, rules: C.rules && C.rules.id, check, look: look ? { no: lookNo, date: look.date, level } : null, window: { from: WN3_FIRST_DAY, to: last, days: days.length },
    feed, cells: out, passes: look ? passes : [], reasons, served: false, live: false, why, line, credit: (C.credit && C.credit[0] && C.credit[0].attribution) || 'WeatherNext 3, Google DeepMind' };
}
export function writeWn3Promotion(dataDir, S, nowMs = Date.now()) { const rec = { id: S.id || 'wn3-shadow@1', at: new Date(nowMs).toISOString(), ...S, served: false }; writeJsonAtomic(join(dataDir, 'agents', 'verify', 'wn3-shadow-promotion.json'), rec); return rec; }
export function writeWn3Pairs(dataDir, D, sc) { const dir = join(dataDir, 'archive', 'wn3shadow'); mkdirSync(dir, { recursive: true });
  const t = join(dir, D + '.json.gz.tmp' + process.pid); writeFileSync(t, gzipSync(Buffer.from(JSON.stringify({ day: D, rules: sc.rules, config: sc.config, runs: sc.runs, columns: ['station', 'v', 'lead', 'ms', 'served', 'blend', 'wn3', 'obs', 'wn3_lead_h'], pairs: sc.pairs })))); renameSync(t, join(dir, D + '.json.gz')); }

/* the ledger: one line per target day, the newest record of a day wins, 400 days kept */
export function readLedger(dir) { const f = join(dir, 'ledger.jsonl'); let t = ''; try { t = readFileSync(f, 'utf8'); } catch (_) { return []; }
  const by = new Map(); for (const l of t.split('\n')) { if (!l.trim()) continue; try { const r = JSON.parse(l); by.set(r.day, r); } catch (_) {} } return [...by.values()].sort((a, b) => a.day < b.day ? -1 : 1); }
export function writeLedger(dir, recs) { const keep = recs.slice(-LEDGER_DAYS); mkdirSync(dir, { recursive: true }); const t = join(dir, 'ledger.jsonl.tmp'); writeFileSync(t, keep.map((r) => JSON.stringify(r)).join('\n') + '\n'); renameSync(t, join(dir, 'ledger.jsonl')); return keep.length; }

/* sum the cells of the records whose key matches */
const parts = (k) => { const [v, net, zone, lead, urb] = k.split('|'); return { v, net, zone, lead: Number(lead), urb }; };
function blocks(recs, field, test, kind) { return recs.map((r) => { let num = 0, den = 0, n = 0, se = 0, sa = 0;
  for (const [k, a] of Object.entries(r[field] || {})) { if (!test(parts(k))) continue;
    if (kind === 'bias') { num += a[1]; den += a[0]; } else if (kind === 'mae') { num += a[2]; den += a[0]; } else if (kind === 'pod') { num += a[0]; den += a[0] + a[2]; } else if (kind === 'far') { num += a[1]; den += a[0] + a[1]; } else if (kind === 'cov') { num += a[1]; den += a[0]; } }
  return { day: r.day, num, den }; }).filter((b) => b.den > 0); }
function stat(recs, field, test, kind, seed) { const b = blocks(recs, field, test, kind); const n = b.reduce((a, x) => a + x.den, 0); if (!n) return null;
  const v = b.reduce((a, x) => a + x.num, 0) / n; const ci = bootRatio(b, 2000, seed); return { v: kind === 'pod' || kind === 'far' || kind === 'cov' ? r3(v) : r2(v), ci: ci ? ci.map((x) => kind === 'pod' || kind === 'far' || kind === 'cov' ? r3(x) : r2(x)) : null, n, days: b.length }; }

/* drift of one cell: the last RECENT days against 7-day values bootstrapped from the WINDOW days before them */
export function driftTest(recs, field, test, kind, seed = 7) {
  if (recs.length < 2) return null; const last = recs[recs.length - 1].day; const recentFrom = addDays(last, -(RECENT - 1)), refFrom = addDays(recentFrom, -WINDOW);
  const rec = blocks(recs.filter((r) => r.day >= recentFrom), field, test, kind), ref = blocks(recs.filter((r) => r.day >= refFrom && r.day < recentFrom), field, test, kind);
  if (ref.length < MIN_REF_DAYS || rec.length < Math.ceil(RECENT / 2)) return { assessed: false, refDays: ref.length, recentDays: rec.length };
  const val = rec.reduce((a, x) => a + x.num, 0) / rec.reduce((a, x) => a + x.den, 0); const refV = ref.reduce((a, x) => a + x.num, 0) / ref.reduce((a, x) => a + x.den, 0);
  const R = rng(seed), draws = []; for (let i = 0; i < 2000; i++) { let n = 0, d = 0; for (let j = 0; j < rec.length; j++) { const x = ref[Math.floor(R() * ref.length)]; n += x.num; d += x.den; } draws.push(n / d); }
  const lo = quantile(draws, 0.025), hi = quantile(draws, 0.975); const out = val > hi ? 1 : val < lo ? -1 : 0;
  const pu = (draws.filter((x) => x >= val).length + 1) / (draws.length + 1), pl = (draws.filter((x) => x <= val).length + 1) / (draws.length + 1); const p = Math.min(1, 2 * Math.min(pu, pl));
  /* since when: the onset of the shift by Page's CUSUM (reference value half-way between the 30-day value and the recent one), the days
     from the onset to the last day; days without data are skipped */
  let run = 0; if (out) { const ser = blocks(recs, field, test, kind).filter((b) => b.day <= last).map((b) => [b.day, b.num / b.den]); const half = (val + refV) / 2; let S = 0, best = 0, onset = null;
    for (let i = ser.length - 1; i >= 0; i--) { if (ser[i][0] < recentFrom) break; S += out * (ser[i][1] - half); if (S > best) { best = S; onset = ser[i][0]; } }
    if (onset) run = Math.round((Date.parse(last) - Date.parse(onset)) / 864e5) + 1; }
  const atLeast = !!out && run >= RECENT;   /* the onset is at the start of the recent window: it may be older */
  return { assessed: true, value: r2(val), ref: r2(refV), ci: [r2(lo), r2(hi)], dir: out, p: r3(p), runDays: run, atLeast, refDays: ref.length, recentDays: rec.length };
}

const ZNAME = { plains: 'Plains', hills: 'Hills', mountain: 'Mountains', coast: 'Coast', all: 'All zones' };
export function driftSentence(c) {
  const v = c.var, u = UNIT[v]; const zone = ZNAME[c.zone] || c.zone; const where = c.urb === 'all' ? 'stations' : c.urb + ' stations';
  if (c.metric === 'bias') { const word = v === 'RH' ? (c.value > 0 ? 'too humid' : 'too dry') : v === 'W' ? (c.value > 0 ? 'too windy' : 'too calm') : v === 'R' ? (c.value > 0 ? 'too wet' : 'too dry') : (c.value > 0 ? 'warm' : 'cold');
    return zone + ' ' + VARS[v] + ' running ' + (c.value > 0 ? '+' : '') + c.value + ' ' + u + ' ' + word + ' at ' + where + (c.runDays >= 2 ? ' for ' + (c.atLeast ? 'at least ' : '') + c.runDays + ' days' : ' over the last ' + c.recentDays + ' days') + ' (the 30 days before: ' + (c.ref > 0 ? '+' : '') + c.ref + ' ' + u + '; a usual 7-day value lies in ' + c.ci[0] + ' to ' + c.ci[1] + ')'; }
  return zone + ' ' + VARS[v] + ' error ' + (c.dir > 0 ? 'up' : 'down') + ' to ' + c.value + ' ' + u + ' on average at ' + where + (c.runDays >= 2 ? ' for ' + (c.atLeast ? 'at least ' : '') + c.runDays + ' days' : ' over the last ' + c.recentDays + ' days') + ' (the 30 days before: ' + c.ref + ' ' + u + '; a usual 7-day value lies in ' + c.ci[0] + ' to ' + c.ci[1] + ')';
}

/* v91.17.283.47 · NIGRAAN 1.0.8 item 3 · THE DAILY OPERATOR SUMMARY CARRIES THE FEED STATE: the feed-health incidents of yesterday and today
   (data/agents/feed/alerts.jsonl: a feed, a provider model run or a layer's inputs going late / down, and back) and every feed late or
   down now (data/agents/feed/state.json), each with its own line, so a stale input (2 Nov: ICON-EPS 26 days, the run-off layers "input not
   current" in 575 tehsils) reaches the operator in the daily summary and not only on the 10-minute panel. Read only. */
export function feedDaySummary(dataDir, now = Date.now()) {
  const dir = join(dataDir, 'agents', 'feed'); const today = pktDay(now), yday = pktDay(now - 864e5); const inc = [];
  try { for (const l of readFileSync(join(dir, 'alerts.jsonl'), 'utf8').split('\n')) { if (!l.trim()) continue; let a = null; try { a = JSON.parse(l); } catch (_) { continue; }
      const d = a && a.at ? pktDay(Date.parse(a.at)) : null; if (d === today || d === yday) inc.push({ at: a.at, feed: a.feed, label: a.label, to: a.to, text: a.text }); } } catch (_) {}
  const st = readJson(join(dir, 'state.json'), null); const bad = [];
  for (const [id, f] of Object.entries((st && st.feeds) || {})) if (f && (f.status === 'late' || f.status === 'down')) bad.push({ feed: id, label: f.label || id, status: f.status, since: f.since || null, detail: String(f.detail || f.why || '').slice(0, 240) });
  const lines = bad.map((b) => (b.label + ': ' + b.status.toUpperCase() + (b.since ? ' since ' + pktText(Date.parse(b.since)) : '') + (b.detail ? ' (' + b.detail + ')' : '')));
  return { assessed: !!st, checkedAt: st ? st.at : null, days: [yday, today], incidents: inc.slice(-60), lateOrDownNow: bad, lines, line: bad.length ? bad.length + ' feed(s) or inputs late or down now: ' + bad.map((b) => b.label).join('; ') : 'every feed and input on its cadence at the last check' };
}
/* the summary the operator page and the skill endpoint read */
export function summarize(all, nowMs = Date.now()) {
  if (!all.length) return { ready: false, why: 'no verified day yet', days: 0 };
  const last = all[all.length - 1].day, from = addDays(last, -(WINDOW - 1)); const recs = all.filter((r) => r.day >= from);
  const days = recs.filter((r) => Object.keys(r.S || {}).length || Object.keys(r.C || {}).length).length;
  const z = (zone) => (p) => zone === 'all' || p.zone === zone;
  const table = []; let seed = 11;
  for (const v of Object.keys(VARS)) for (const zone of [...ZONES, 'all']) for (let L = 0; L <= 3; L++) {
    const t = (p) => p.v === v && z(zone)(p) && p.lead === L; const mae = stat(recs, 'S', t, 'mae', seed++), bias = stat(recs, 'S', t, 'bias', seed++);
    if (!mae) { table.push({ var: v, zone, lead: L, n: 0, why: L === 3 && v !== 'R' ? 'not assessed: the issues of this window were archived with 73 hours (days 0-2); from v91.17.283.8 the archive keeps 96 h, so day 3 is scored for issues archived after the deploy' : 'no matched observations' }); continue; }
    const tr = driftTest(recs.length ? all : recs, 'S', t, 'mae', seed++);
    table.push({ var: v, zone, lead: L, n: mae.n, days: mae.days, mae: mae.v, maeCi: mae.ci, bias: bias.v, biasCi: bias.ci, trend: tr && tr.assessed ? (tr.dir > 0 ? 'worse' : tr.dir < 0 ? 'better' : 'steady') : 'not assessed', trendBasis: tr && tr.assessed ? 'last 7 days ' + tr.value + ' against ' + tr.ci[0] + '..' + tr.ci[1] : (tr ? tr.refDays + ' reference days (' + MIN_REF_DAYS + ' needed)' : null) }); }
  const urban = []; for (const v of ['T', 'TX', 'TN', 'RH', 'W']) for (const urb of ['urban', 'rural']) for (let L = 0; L <= 3; L++) { const t = (p) => p.v === v && p.urb === urb && p.lead === L; const mae = stat(recs, 'S', t, 'mae', seed++), bias = stat(recs, 'S', t, 'bias', seed++); if (mae) urban.push({ var: v, urb, lead: L, n: mae.n, mae: mae.v, maeCi: mae.ci, bias: bias.v, biasCi: bias.ci }); }
  const nets = []; for (const net of ['mach', 'metar', 'aws']) { const t = (p) => p.v === 'T' && p.net === net; const mae = stat(recs, 'S', t, 'mae', seed++), bias = stat(recs, 'S', t, 'bias', seed++); nets.push(mae ? { net, n: mae.n, mae: mae.v, maeCi: mae.ci, bias: bias.v, biasCi: bias.ci } : { net, n: 0 }); }
  const cont = (ev, extra = () => true) => { const out = []; for (let L = 0; L <= 3; L++) { const t = (p) => p.v === ev && p.lead === L && extra(p); const b = blocks(recs, 'C', t, 'pod'); const f = blocks(recs, 'C', t, 'far');
      let a = 0, bb = 0, c = 0, d = 0; for (const r of recs) for (const [k, x] of Object.entries(r.C || {})) { if (!t(parts(k))) continue; a += x[0]; bb += x[1]; c += x[2]; d += x[3]; }
      const n = a + bb + c + d; if (!n) { out.push({ lead: L, n: 0 }); continue; }
      const pod = stat(recs, 'C', t, 'pod', seed++), far = stat(recs, 'C', t, 'far', seed++);
      out.push({ lead: L, n, events: a + c, forecasts: a + bb, hits: a, misses: c, falseAlarms: bb, pod: pod ? pod.v : null, podCi: pod ? pod.ci : null, far: far ? far.v : null, farCi: far ? far.ci : null, days: Math.max(b.length, f.length) }); } return out; };
  const rain = { all: cont('wet') }; for (const zone of ZONES) rain[zone] = cont('wet', (p) => p.zone === zone);
  /* v91.17.283.28 · rain against the gauges first (truth = RAIN_TRUTH_LABEL), the satellite apart and labelled as such (never 'measured') */
  rain.truth = RAIN_TRUTH_LABEL; rain.truthVersion = RAIN_TRUTH_V; const seedKeep = seed; seed = 5001;   /* own seeds: the heat and coverage intervals keep theirs */
  const rainTot = (pre, wetKey, sv) => { const out = []; for (const zone of [...ZONES, 'all']) for (let L = 0; L <= 3; L++) { let n = 0, F = 0, O = 0; const blk = [];
      for (const r of recs) { let bn = 0, bf = 0, bo = 0; for (const [k, a] of Object.entries(r.RT || {})) { const [p, z, l] = k.split('|'); if (p !== pre || Number(l) !== L || (zone !== 'all' && z !== zone)) continue; bn += a[0]; bf += a[1]; bo += a[2]; }
        if (bn) { n += bn; F += bf; O += bo; blk.push({ day: r.day, num: bf, den: bo }); } }
      if (!n) continue; const t = (p) => p.v === sv && p.lead === L && (zone === 'all' || p.zone === zone); const bias = stat(recs, 'S', t, 'bias', seed++), mae = stat(recs, 'S', t, 'mae', seed++);
      const ci = blk.length >= 2 && blk.some((b) => b.den > 0) ? bootRatio(blk.filter((b) => b.den > 0), 2000, seed++) : null;
      const cc = cont(wetKey, (p) => p.lead === L && (zone === 'all' || p.zone === zone))[L] || {};
      out.push({ zone, lead: L, n, days: blk.length, forecastMm: r1(F), observedMm: r1(O), ratio: O > 0 ? r2(F / O) : null, ratioCi: ci ? ci.map(r2) : null, bias: bias ? bias.v : null, biasCi: bias ? bias.ci : null, mae: mae ? mae.v : null, pod1: cc.pod ?? null, far1: cc.far ?? null, events1: cc.events ?? null }); } return out; };
  rain.byZoneLead = rainTot('g', 'wet', 'R');
  rain.satellite = { label: SATELLITE_LABEL, day: 'Pakistan day (half-hourly Late Run summed 00-24 PKT, data/imerg/pkt); a day without it is not scored (the UTC daily file is never used)', note: 'a satellite estimate, not a measurement: it read 2.8 times the gauge totals at the same places in Sep-Oct 2026 and twice their wet-day frequency', byZoneLead: rainTot('i', 'wetI', 'RI'), wet: cont('wetI') };
  const rq = recs.map((r) => r.rainTruth).filter((x) => x && x.v === RAIN_TRUTH_V); const heldBy = new Map(); for (const x of rq) for (const [pid, why] of x.heldStations || []) heldBy.set(pid, why);
  seed = seedKeep;
  rain.qc = { days: rq.length, stationDays: rq.reduce((a, x) => a + x.stationDays, 0), scored: rq.reduce((a, x) => a + x.scored, 0), missing: rq.reduce((a, x) => a + x.missing, 0), held: rq.reduce((a, x) => a + x.held, 0), isolatedDays: rq.reduce((a, x) => a + x.isolatedDays, 0), stationsHeld: [...heldBy].slice(0, 30).map(([pid, why]) => ({ pid, why })) };
  const radar = {}; for (const site of ['islamabad', 'karachi']) { const lead = cont('radar1', (p) => p.zone === site); const und = [0, 1, 2, 3].map((L) => recs.reduce((a, r) => a + ((r.S || {})['radarU|radar|' + site + '|' + L + '|all'] || [0])[0], 0));
    const notes = recs.map((r) => r.radar && r.radar[site]).filter(Boolean).slice(-1)[0] || null; radar[site] = { byLead: lead.map((x, i) => ({ ...x, undetermined: und[i] })), notes: notes ? notes.notes : null, points: notes ? notes.points : 0 }; }
  /* v91.17.283.8 HEATSKILL: the headline heat scores rest on the standard-exposure networks; MACH (and AWS) heat apart, operator only */
  const std = (p) => HEAT_TRUTH_NETS.includes(p.net);
  /* v91.17.283.24 · J4: the persistence comparison on matched station-days (cells fm* and pm* hold the same days); ledger days scored
     before 283.24 carry no matched cells and are left out of it */
  const pers = (f, pp, extra = () => true) => ({ forecast: cont(f, extra), persistence: cont(pp, extra) });
  const heat = { truthNetworks: HEAT_TRUTH_NETS, moderatePlus: cont('heat2', std), highPlus: cont('heat3', std),
    persistence: { rule: 'the forecast and persistence (the level observed the day before the issue) on the same station-days', moderatePlus: pers('fm2', 'pm2', std), highPlus: pers('fm3', 'pm3', std) },
    clientDomain: { provinces: CLIENT_HEAT_PROVINCES, leads: CLIENT_HEAT_LEADS, moderatePlus: cont('heat2sp', std), persistence: pers('fm2sp', 'pm2sp', std) },
    byNetwork: Object.fromEntries(['synop', 'metar', 'mach', 'aws'].map((n) => [n, { moderatePlus: cont('heat2', (p) => p.net === n), persistence: pers('fm2', 'pm2', (p) => p.net === n) }])),
    note: 'the client line and the headline rows use synoptic and airport stations only; MACH observed heat reads warm (humidity about 13 points above the forecast by day against about 7 at synoptic stations), so the MACH rows are shown apart and never quoted to a client' };
  const heatAssessed = heat.moderatePlus.some((x) => x.n > 0);
  const cov = []; for (let L = 0; L <= 3; L++) { const t = (p) => p.lead === L; const s = stat(recs, 'V', t, 'cov', seed++); cov.push(s ? { lead: L, hours: s.n, share: s.v, ci: s.ci, days: s.days } : { lead: L, hours: 0 }); }
  /* drift: bias and MAE of each variable x zone x urban/rural (leads pooled) */
  /* every cell is a test: the flags are the tests that stay significant after the Benjamini-Hochberg false-discovery control at 5 %
     over the whole family (about 150 tests a day would otherwise give some 7 flags by chance alone) */
  const tests = []; let ds = 101;
  for (const v of ['T', 'TX', 'TN', 'RH', 'W']) for (const zone of [...ZONES, 'all']) for (const urb of ['urban', 'rural', 'all']) for (const metric of ['bias', 'mae']) {
    const t = (p) => p.v === v && z(zone)(p) && (urb === 'all' || p.urb === urb); const r = driftTest(all, 'S', t, metric, ds++);
    if (r && r.assessed) tests.push({ var: v, zone, urb, metric, ...r }); }
  const m = tests.length; const ord = tests.filter((x) => x.dir).sort((a, b) => a.p - b.p); let kmax = 0; const all2 = tests.slice().sort((a, b) => a.p - b.p);
  all2.forEach((x, i) => { if (x.p <= 0.05 * (i + 1) / m) kmax = i + 1; }); const cut = kmax ? all2[kmax - 1].p : -1;
  const drift = ord.filter((x) => x.p <= cut).map((c) => ({ ...c, worse: c.metric === 'mae' ? c.dir > 0 : Math.abs(c.value) > Math.abs(c.ref), text: driftSentence(c) }))
    .sort((a, b) => (b.worse - a.worse) || (a.p - b.p));
  const driftFamily = { tests: m, outside95: ord.length, flagged: drift.length, rule: 'outside the 95 % bootstrap interval and significant after Benjamini-Hochberg at 5 % over ' + m + ' tests' };
  const anyAssessed = (() => { const r = driftTest(all, 'S', (p) => p.v === 'T', 'bias', 5); return r ? r.assessed : false; })();
  /* the client heat line: only from at least CLIENT_MIN_DAYS days, with its interval */
  const inDomain = (p) => p.v === 'heat2sp' && HEAT_TRUTH_NETS.includes(p.net) && CLIENT_HEAT_LEADS.includes(p.lead);
  const cFrom = addDays(last, -(CLIENT_WINDOW - 1)), cRecs = all.filter((r) => r.day >= cFrom).filter((r) => Object.keys(r.C || {}).some((k) => inDomain(parts(k))));
  const hd = cRecs.length; const cFirst = hd ? cRecs[0].day : from; const pooled = (() => { const pod = stat(cRecs, 'C', inDomain, 'pod', 901), far = stat(cRecs, 'C', inDomain, 'far', 902); return { pod, far }; })();
  const eligible = hd >= CLIENT_MIN_DAYS && !!(pooled.pod && pooled.pod.ci && pooled.far && pooled.far.ci);
  const pct = (x) => Math.round(100 * x);
  const client = { eligible, days: hd, need: CLIENT_MIN_DAYS, within: CLIENT_WINDOW, window: cFirst + '..' + last,
    why: eligible ? 'at least ' + CLIENT_MIN_DAYS + ' days of live verification with the interval stated' : hd + ' day' + (hd === 1 ? '' : 's') + ' of live heat verification (' + CLIENT_MIN_DAYS + ' needed): the current client text stays',
    domain: { provinces: CLIENT_HEAT_PROVINCES, leads: CLIENT_HEAT_LEADS, networks: HEAT_TRUTH_NETS },
    line: eligible ? 'Heat stress at Moderate or higher, forecast days ' + CLIENT_HEAT_LEADS.join(' and ') + ', Sindh and Punjab (live check at standard weather and airport stations, ' + cFirst + ' to ' + last + ', ' + hd + ' days scored): the level caught ' + pct(pooled.pod.v) + ' % of the observed days (95 % interval ' + pct(pooled.pod.ci[0]) + '–' + pct(pooled.pod.ci[1]) + ' %), and ' + pct(pooled.far.v) + ' % of its forecasts were false alarms (' + pct(pooled.far.ci[0]) + '–' + pct(pooled.far.ci[1]) + ' %). Elsewhere, and on other forecast days, the heat level is not yet verified' : null,
    pod: pooled.pod, far: pooled.far };
  return { ready: true, built: new Date(nowMs).toISOString(), window: { from, to: last, days, ledgerDays: all.length }, method: 'MAE and bias (forecast minus observed); POD and FAR; share of hours inside the issued 90 % range; 95 % day-block bootstrap intervals (2,000 draws); drift: last 7 days against 7-day values bootstrapped from the 30 days before (at least ' + MIN_REF_DAYS + ' days), Benjamini-Hochberg at 5 % over the family',
    table, urban, networks: nets, rain, heat: heatAssessed ? heat : { notAssessed: 'no station day yet has both a morning heat level and an observed UTCI level', ...heat }, coverage90: cov, radar, drift, driftFamily, driftAssessed: anyAssessed, client, radarNotRead: RADAR_WHY.slice(0, 10), archiveDamage: DAMAGED.length ? DAMAGED.slice(0, 20) : [] };
}

/* ---------------------------------------------------------------------------------------------------------------------------- */
export async function run(o) {
  const now = o.now || Date.now(); const dir = join(o.dataDir, 'agents', 'verify'); const ctx = { dataDir: o.dataDir, copiesDir: o.copiesDir, lake: o.lake, now };
  const yday = addDays(pktDay(now), -1); let targets;
  if (o.backfill) { const n = Number(o.backfill) || WINDOW; targets = []; for (let i = n; i >= 1; i--) targets.push(addDays(pktDay(now), -i)); }
  else targets = [o.day || yday];
  /* v91.17.283.23 · self-audit J2 · a day stored without its observations (the copies had not arrived: the laptop woke and verified before
     the MACH sync) is marked incomplete and scored again on later runs, for INCOMPLETE_RETRY_DAYS days; it never enters the summary */
  const L0 = readLedger(dir); const young = (d) => addDays(d, INCOMPLETE_RETRY_DAYS) >= pktDay(now);
  const have = new Set(L0.filter((r) => !(r.incomplete && young(r.day))).map((r) => r.day)); if (!o.force) targets = targets.filter((d) => !have.has(d));
  const all = new Map(L0.map((r) => [r.day, r])); const done = [], rescored = [];
  /* v91.17.283.24 · self-audit J19 · the target days are scored in blocks of CHECKPOINT_DAYS and the ledger is written after every day, so
     a run stopped by the server's 45-minute limit (or the laptop going off) keeps every day it scored and the next run asks only the
     rest (agents.mjs verifyDue); before, a 30-day back-fill wrote nothing until its very end and could start over forever */
  const ordered = () => [...all.values()].sort((a, b) => a.day < b.day ? -1 : 1);
  /* v91.17.283.28 · the rain truth (V1-V3) over the trailing window of every day scored now, and the ledger days scored under an older rain
     truth: those keep every other cell and have their rain cells (R, wet, RT, RI, wetI) re-made (rain only: no other variable is re-read) */
  const RP = rainParams(o.dataDir); const imergAt = imergPktReader(o.dataDir);
  const stale = [...all.values()].filter((r) => !targets.includes(r.day) && !(r.rainTruth && r.rainTruth.v === RAIN_TRUTH_V)).map((r) => r.day);
  let stationsAll = null, RAIN = null;
  if (targets.length || stale.length) { stationsAll = await loadStations(ctx); const span = [...targets, ...stale].sort();
    const w = Math.max(RP.stuck.window_days, RP.isolation.window_days); const from = addDays(span[0], -(w - 1)), to = span[span.length - 1];
    const RR = loadRainRows(ctx, from, to, stationsAll); RAIN = rainTruthTable(stationsAll, RR, daysBetween(from, to), RP, imergAt); }
  for (let b = 0; b < stale.length; b += CHECKPOINT_DAYS) { const T = stale.slice(b, b + CHECKPOINT_DAYS);
    const FC = await loadForecasts(o.dataDir, [...new Set(T.flatMap((D) => [0, 1, 2, 3, 4].map((L) => addDays(D, -L))))].sort());
    const zoneOf = new Map(); for (const m of FC.values()) for (const [u, r] of m) if (r.z && !zoneOf.has(u)) zoneOf.set(u, r.z);
    for (const D of T) { const r = all.get(D); const S = {}, C = {}, RT = {};
      for (const [k, x] of Object.entries(r.S || {})) if (!/^(R|RI)\|/.test(k)) S[k] = x;
      for (const [k, x] of Object.entries(r.C || {})) if (!/^(wet|wetI)\|/.test(k)) C[k] = x;
      rainCells(D, stationsAll, FC, RAIN.table, imergAt, zoneOf, S, C, RT);
      all.set(D, { ...r, S, C, RT, rainTruth: { ...rainTruthOfDay(RAIN, D, RP), rescored: new Date(now).toISOString(), from: r.rainTruth ? r.rainTruth.v : 'highest counter reading of the day (before v91.17.283.28)' } });
      rescored.push(D); }
    writeLedger(dir, ordered()); }
  if (targets.length) {
    const stations = stationsAll || await loadStations(ctx); const U = await import(pathToFileURL(join(API, 'utci.mjs')).href);
    for (let b = 0; b < targets.length; b += CHECKPOINT_DAYS) { const T = targets.slice(b, b + CHECKPOINT_DAYS);
      const issues = [...new Set(T.flatMap((D) => [0, 1, 2, 3, 4].map((L) => addDays(D, -L))))].sort();
      const FC = await loadForecasts(o.dataDir, issues), PTS = await loadPoints(o.dataDir, issues), HEAT = await loadHeat(o.dataDir, issues);
      const OB = await loadObs(ctx, daysBetween(addDays(T[0], -4), T[T.length - 1]), stations, FC);
      const RADAR = await radarFor(o, T, FC);
      let newest = -Infinity; for (const a of OB.byPid.values()) for (const x of a) if (fin(x.ms) && x.ms > newest) newest = x.ms;
      const EM = loadAnchorModel(o.dataDir); const EWS = EM ? await loadEwsShadow(o.dataDir, dayStartMs(T[0]), dayStartMs(T[T.length - 1]) + 864e5) : new Map();   /* v91.17.283.25 */
      /* v91.17.283.47 · WN3 shadow (NIGRAAN_WN3_SHADOW=0 or no data/wn3-shadow.json: nothing here runs, the record is as before) */
      const W3C = loadWn3Config(o.dataDir); let W3 = null, W3M = null;
      if (W3C) { const Ls = [...new Set(W3C.cells.flatMap((c) => c.leads))]; W3 = loadWn3Runs(o.dataDir, T.flatMap((D) => Ls.map((L) => addDays(D, -L - 1)))); W3M = wn3Match(stations, loadWn3Points(o.dataDir), W3C.matchKm || 1.5); }
      for (const D of T) { const r = await scoreDay(ctx, D, { stations, FC, PTS, HEAT, OB, U, RADAR, RAIN, RP, IMERG: imergAt }); r.obsSources = OB.src; r.qc = OB.qc;
        if (EM) { try { r.ewsShadow = scoreEwsShadow(D, EWS, OB, EM); } catch (e) { r.ewsShadow = { error: String(e.message || e) }; } }
        if (W3C) { try { const zo = new Map(); for (const m of FC.values()) for (const [u, x] of m) if (x.z && !zo.has(u)) zo.set(u, x.z);
          const sc = scoreWn3Shadow(D, stations, FC, OB, (RAIN && RAIN.table) || RAIN, W3, W3M, W3C, zo); writeWn3Pairs(o.dataDir, D, sc); sc.pairs = sc.pairs.length; r.wn3Shadow = sc; } catch (e) { r.wn3Shadow = { error: String(e.message || e) }; } }   /* v283.47 */
        const end = dayStartMs(D) + 864e5; if (!Object.keys(r.S || {}).length) r.incomplete = 'no matched observations for this day yet';
        else if (!(newest >= end - 3600e3)) r.incomplete = 'the observations held end at ' + (fin(newest) ? pktText(newest) : 'none') + ', before the end of the day';
        all.set(D, r); done.push(r); writeLedger(dir, ordered());
        if (o.onDay) o.onDay(D); } }
  }
  const recs = ordered(); const kept = writeLedger(dir, recs);
  const sum = summarize(recs.slice(-LEDGER_DAYS).filter((r) => !r.incomplete), now);   /* v283.23 J2: incomplete days never enter the summary */
  try { sum.ewsAnchor = ewsShadowSummary(recs.slice(-LEDGER_DAYS).filter((r) => !r.incomplete), loadAnchorModel(o.dataDir)); if (sum.ewsAnchor.id) writeEwsPromotion(o.dataDir, sum.ewsAnchor, now); } catch (e) { sum.ewsAnchor = { assessed: false, why: 'EWS shadow summary failed: ' + e.message }; }   /* v91.17.283.25 */
  { const C3 = loadWn3Config(o.dataDir); if (C3) { try { sum.wn3Shadow = wn3ShadowSummary(recs.slice(-LEDGER_DAYS).filter((r) => !r.incomplete), C3, wn3RulesCheck(o.dataDir, C3), now); writeWn3Promotion(o.dataDir, sum.wn3Shadow, now); } catch (e) { sum.wn3Shadow = { assessed: false, why: 'WN3 shadow summary failed: ' + String(e && e.message || e).slice(0, 120) }; } } }   /* v91.17.283.47 */
  try { sum.feeds = feedDaySummary(o.dataDir, now); } catch (e) { sum.feeds = { assessed: false, why: 'feed summary failed: ' + String(e && e.message || e).slice(0, 120) }; }   /* v91.17.283.47 item 3 */
  writeJsonAtomic(join(dir, 'summary.json'), sum);
  writeJsonAtomic(join(dir, 'client-lines.json'), { built: sum.built, ...(sum.client || { eligible: false, why: 'no verified day yet' }) });
  writeJsonAtomic(join(dir, 'drift.json'), { built: sum.built, assessed: !!sum.driftAssessed, flags: sum.drift || [] });
  const scored = done.filter((r) => Object.keys(r.S).length); const nT = done.reduce((a, r) => a + Object.entries(r.S).filter(([k]) => k.startsWith('T|')).reduce((b, [, x]) => b + x[0], 0), 0);
  agentLog(o.dataDir, 'verification', (done.length ? 'scored ' + done.length + ' day(s) (' + (done.length === 1 ? done[0].day : done[0].day + ' to ' + done[done.length - 1].day) + '): ' + scored.length + ' with matched observations, ' + nT + ' station-hours of temperature' : 'nothing new to score') + (rescored.length ? '; rain re-scored on ' + rescored.length + ' ledger day(s) with the counter-increment truth (' + RAIN_TRUTH_V + ')' : '') + '; ledger ' + kept + ' days; ' + (sum.drift ? sum.drift.length : 0) + ' drift flag(s); client heat line ' + (sum.client && sum.client.eligible ? 'from live scores' : 'unchanged (' + (sum.client ? sum.client.why : '') + ')'), { days: done.map((r) => r.day) }, now);
  return { done, summary: sum, kept, rescored };
}
/* radar rain at the served tehsil points, per site and target day, from NIGRAAN's own radar pull (nig/own/data/radar/netcdf, v91.17.283.28) through Python */
async function radarFor(o, targets, FC) {
  const out = {}; const rd = o.fromLamha ? join(o.fromLamha, 'radar', 'netcdf') : null; if (!rd || !existsSync(rd)) return out;
  const pts = new Map(); for (const m of FC.values()) for (const [u, r] of m) if (!pts.has(u) && fin(r.lat) && fin(r.lon)) pts.set(u, { id: u, lat: r.lat, lon: r.lon });
  if (!pts.size) return out; const { mkdtempSync, rmSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const tmp = mkdtempSync(join(tmpdir(), 'nig-radar-'));
  try { writeFileSync(join(tmp, 'pts.json'), JSON.stringify([...pts.values()])); const { pyRun } = await import('./lamha_copy.mjs');
    for (const D of targets) for (const site of ['islamabad', 'karachi']) { if (!existsSync(join(rd, site, 'sri', site + '_sri_' + D + '.nc'))) continue;
      const f = join(tmp, site + D + '.json'); const r = await pyRun(o, 'radar_points.py', ['--radar', rd, '--site', site, '--days', D, '--points', join(tmp, 'pts.json'), '--out', f], 10);
      if (r.code === 0) { try { (out[D] = out[D] || {})[site] = JSON.parse(readFileSync(f, 'utf8')); } catch (_) {} } else RADAR_WHY.push(site + ' ' + D + ': ' + r.out.trim().split('\n').slice(-1)[0]); }
  } finally { try { rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
  return out;
}
export const RADAR_WHY = [];
function daysBetween(a, b) { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const A = args(); const app = A.app || join(HERE, '..', '..'); const dataDir = A.data || join(app, 'data');
  const rel = takeLock(join(dataDir, 'agents', 'verify.lock'), 60 * 60e3); if (!rel) { console.log('another verification run is going'); process.exit(5); }
  /* v91.17.283.28 · the observations come from NIGRAAN's own folder (--own, default nig/own); --copies / --from-lamha are accepted and ignored */
  const own = A.own || ownDir(app);
  try { const r = await run({ dataDir, copiesDir: own, lake: A.lake || join(app, '..', 'station-lake'), fromLamha: join(own, 'data'), day: A.day, backfill: A.backfill, force: !!A.force, now: A.now ? Date.parse(A.now) : undefined });
    console.log('verification: ' + r.done.length + ' day(s) scored; ledger ' + r.kept + ' days; window ' + (r.summary.window ? r.summary.window.from + '..' + r.summary.window.to + ' (' + r.summary.window.days + ' days)' : '-') + '; drift flags ' + (r.summary.drift || []).length + '; client line ' + (r.summary.client && r.summary.client.eligible ? 'live' : 'unchanged'));
  } finally { rel(); }
}
