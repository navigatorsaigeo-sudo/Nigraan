import { useEffect, useMemo, useRef, useState } from 'react';
import { getJson } from '../start/api.js';
import { generateReport } from './climate.js';
import OperatorPanels from './OperatorPanels.jsx';
import { useOperator } from './operator.js';
import { readHashPlace, usePlace, writePlace } from './place.js';

const HAZARD_LABELS = {
  flood: 'Flood', heat: 'Heat stress', drought: 'Drought', wind: 'Wind and gusts',
  cold: 'Cold stress (UTCI)', glof: 'Glacial lake outburst flood (GLOF)', seismic: 'Seismic',
  cyclone: 'Cyclone', landslide: 'Landslide', rain_hz: 'Heavy rain', rain: 'Rain',
};
const HAZARD_COLORS = {
  flood: '#2c7fb8', heat: '#e31a1c', drought: '#b45309', wind: '#0d9488', cold: '#3b82f6',
  glof: '#0891b2', seismic: '#b91c1c', cyclone: '#0f766e', landslide: '#a65d0a', rain_hz: '#2c7fb8',
};
const OWNERS = {
  flood: 'District administration', heat: 'Health and labour operations', drought: 'Agriculture and water management',
  wind: 'Infrastructure operations', cold: 'District emergency services', glof: 'GLOF monitoring and district control',
  seismic: 'Emergency management authority', cyclone: 'Coastal emergency operations', landslide: 'District administration',
};
const SUSCEPT = {
  flood: 'Terrain, drainage, soil wetness and river context shape consequence.',
  heat: 'Urban form, humidity, labour exposure and power reliability shape consequence.',
  drought: 'Water storage, crop stage, irrigation and historical anomaly shape consequence.',
  wind: 'Terrain exposure, structure type and operating thresholds shape consequence.',
  cold: 'Elevation, access, housing and vulnerable population shape consequence.',
  glof: 'Glacial lake inventory, melt conditions, downstream pathways and communication readiness shape consequence.',
  seismic: 'Background seismic susceptibility and critical facility vulnerability shape consequence.',
  cyclone: 'Coastal segment, surge, port, drainage and evacuation capacity shape consequence.',
  landslide: 'Slope, antecedent wetness, geology and drainage shape consequence.',
};
const HORIZON_LABEL = { now: 'Now', '6': 'Next 6 hours', '24': 'Next 24 hours', '72': 'Next 3 days' };
const HORIZON_LEAD = { now: 0, '6': 0, '24': 1, '72': 2 };
const LEVEL_RANK = { Severe: 4, High: 3, Moderate: 2, Low: 1, Normal: 0 };

function fmtRange(values, unit = '') {
  if (!Array.isArray(values) || values.length < 2) return null;
  const a = Number(values[0]);
  const b = Number(values[values.length - 1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a - b) < 1e-6) return `${a}${unit}`;
  return `${a}–${b}${unit}`;
}

function horizonBriefing(context, horizon, placeName) {
  const days = Array.isArray(context?.levels?.days) ? context.levels.days : [];
  const ensembleDays = Array.isArray(context?.outlook?.ensemble?.days) ? context.outlook.ensemble.days : [];
  const lead = HORIZON_LEAD[horizon] ?? 0;
  const windowDays = horizon === '72' ? days.filter((d) => Number(d.day) <= 2) : days.filter((d) => Number(d.day) === lead);
  const focus = windowDays[windowDays.length - 1] || days.find((d) => Number(d.day) === lead) || days[0] || null;
  const layerMap = {};
  windowDays.forEach((day) => {
    Object.entries(day?.layers || {}).forEach(([key, layer]) => {
      if (!layer || layer.level == null || layer.word === 'Not assessed') return;
      const rank = LEVEL_RANK[layer.word] ?? -1;
      const prev = layerMap[key];
      if (!prev || rank > (LEVEL_RANK[prev.word] ?? -1)) {
        layerMap[key] = { key, name: layer.name || key, word: layer.word, level: layer.level, date: day.date, day: day.day };
      }
    });
  });
  const layers = Object.values(layerMap).sort((a, b) => (LEVEL_RANK[b.word] ?? -1) - (LEVEL_RANK[a.word] ?? -1) || a.name.localeCompare(b.name));
  const top = layers.find((row) => (LEVEL_RANK[row.word] ?? 0) > 0) || layers[0] || null;
  const ensFocus = ensembleDays.filter((row) => Number(row.leadDays ?? row.day) === lead)[0]
    || ensembleDays[lead]
    || null;
  const ensWindow = horizon === '72'
    ? ensembleDays.filter((row) => Number(row.leadDays ?? 0) <= 2).slice(0, 3)
    : (ensFocus ? [ensFocus] : []);
  const weather = ensWindow.map((row) => {
    const bits = [
      fmtRange(row.tx, '°C high'),
      fmtRange(row.tn, '°C low'),
      fmtRange(row.pr, ' mm rain'),
      fmtRange(row.gu, ' km/h gust'),
    ].filter(Boolean);
    return { date: row.date || row.leadDays, text: bits.join(' · ') || 'ensemble members held' };
  });
  const dateLabel = focus?.date || (ensFocus?.date) || 'served day';
  const title = horizon === 'now'
    ? `Now · ${placeName || 'this place'}`
    : horizon === '6'
      ? `Next 6 hours · today (${dateLabel}) at ${placeName || 'this place'}`
      : horizon === '24'
        ? `Next 24 hours · ${dateLabel} at ${placeName || 'this place'}`
        : `Next 3 days · through ${dateLabel} at ${placeName || 'this place'}`;
  const summary = !focus && !ensFocus
    ? 'No day-level place context is loaded yet for this horizon.'
    : top
      ? `${top.name} is the strongest level in this horizon: ${top.word}.`
      : `All scored hazards are Normal for this horizon (${dateLabel}).`;
  return {
    title,
    summary,
    dateLabel,
    lead,
    top,
    layers: layers.slice(0, 8),
    weather,
    basis: horizon === '6'
      ? 'Uses today’s hazard levels with the near-term ensemble envelope (true sub-daily operational state is not a separate product yet).'
      : horizon === '72'
        ? 'Highest level across lead days 0–2 from the served place context, with the 51-member ensemble envelope.'
        : 'Hazard levels for the matching lead day from the served place context, with the ensemble envelope.',
  };
}
const HELP = {
  'ops-situation': {
    title: 'How Situation Room works',
    purpose: 'Turn national screening into a shortlist of units that need a response, with ownership and a decision chain for the place you have open.',
    input: 'District verdicts from the NIGRAAN engine, the active place, and actions kept in this browser.',
    process: 'Event lanes at Act or Watch drive the KPIs and the priority board. Standing and condition lanes are shown as flags and do not reorder the board.',
    output: 'Read the board left to right: lead hazard, score, people (when known), verdict, implication, then whether an action already exists.',
    next: 'Asset limits need sites with operating limits in Client Risk. Horizon buttons re-frame the decision chain for Now / 6 h / 24 h / 3 days.',
  },
  'ops-verification': {
    title: 'How Post Event Verification works',
    purpose: 'Capture what was predicted, what happened, which action was taken and what should change — a local learning ledger.',
    input: 'The current priority unit and hazard, plus the review form fields you fill.',
    process: 'Reviews stay in this browser under the active project namespace. They do not rewrite the forecast.',
    output: 'The scorecard counts reviews, verified impacts and timely actions. The register lists every saved record.',
    next: 'Institutional evidence storage, permissions and notifications are not in this build.',
  },
};
const BOARD_ROWS = 8;
const ACTION_KEY = 'agn:operations:unassigned:actions:v2';
const REVIEW_KEY = 'agn:operations:unassigned:reviews:v2';
const RISK_STORE = 'agn.clientRisk.v1';

function hazardLabel(h) {
  if (h == null || h === '' || h === 'null') return 'no hazard resolved yet';
  return HAZARD_LABELS[h] || String(h).replace(/_/g, ' ');
}
function scoreText(score) {
  return score != null && Number.isFinite(+score) ? `${Math.round(+score)}/100` : '—/100';
}
function statusClass(s) {
  return String(s || 'open').toLowerCase();
}
function timeText(ts) {
  try {
    return `${new Date(ts).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} PKT`;
  } catch {
    return 'Not set';
  }
}
function actionId() {
  return `AGN-ACT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}
function reviewId() {
  return `AGN-REV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}
function readList(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function writeList(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* keep in memory this visit */ }
}
function loadRiskProject() {
  try {
    const raw = JSON.parse(localStorage.getItem(RISK_STORE) || 'null');
    if (!raw || typeof raw !== 'object') return { assets: [], sheets: {} };
    return { assets: Array.isArray(raw.assets) ? raw.assets : [], sheets: raw.sheets || {} };
  } catch {
    return { assets: [], sheets: {} };
  }
}
function portfolioAssetsForEvaluate(project = loadRiskProject()) {
  const limits = Array.isArray(project.sheets?.operating_limits) ? project.sheets.operating_limits : [];
  return (project.assets || []).map((asset) => {
    const own = limits.filter((row) => String(row.asset_id) === String(asset.asset_id || asset.id));
    return {
      id: asset.asset_id || asset.id,
      name: asset.asset_name || asset.name,
      lat: Number(asset.latitude ?? asset.lat),
      lon: Number(asset.longitude ?? asset.lon),
      limits: own.map((row) => ({
        variable: row.variable,
        limit: Number(row.threshold),
        dir: row.operator || '>',
        durationMin: Number(row.duration_minutes) || 0,
        actionMin: Number(row.action_lead_minutes) || 0,
        authority: row.authority_reference || row.authority_type || '',
        action: row.required_action || '',
        owner: row.owner_role || '',
      })),
    };
  }).filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon) && a.limits.length);
}
function portfolioStamp(project = loadRiskProject()) {
  const assets = Array.isArray(project.assets) ? project.assets.length : 0;
  const ready = portfolioAssetsForEvaluate(project).length;
  if (!assets) return { stamp: 'No register', note: 'No sites with operating limits yet: add them in Client Risk › Add sites.' };
  if (!ready) return { stamp: `${assets} site${assets === 1 ? '' : 's'}`, note: `${assets} site${assets === 1 ? '' : 's'} in Client Risk, but none have operating limits yet. In Client Risk use Load sample again, or add an Operating Limits sheet.` };
  return { stamp: `${ready} ready`, note: `${ready} site${ready === 1 ? '' : 's'} with limits · click Evaluate register to score the forecast.` };
}

const SAMPLE_LIMIT_SEED = {
  'SMP-A1': ['tmax', 42, '>', '°C', 'Move outdoor labour into shade and pause harvest', 'Farm operations'],
  'SMP-A2': ['gust', 70, '>', 'km/h', 'Secure shed doors and halt loading', 'Depot supervisor'],
  'SMP-A3': ['rain_24h', 50, '>', 'mm', 'Raise goods off the floor and check drainage', 'Warehouse lead'],
  'SMP-A4': ['wet_bulb', 30, '>', '°C', 'Stop outdoor erection work and rest crews', 'Site manager'],
  'SMP-A5': ['gust', 65, '>', 'km/h', 'Pause yard movements and secure trailers', 'Hub operations'],
  'SMP-A6': ['tmax', 40, '>', '°C', 'Limit outdoor shifts and check cold-chain power', 'Facilities'],
  'SMP-A7': ['tmin', -5, '<', '°C', 'Protect pipes and confirm generator fuel', 'Cold-store ops'],
  'SMP-A8': ['rain_24h', 40, '>', 'mm', 'Inspect slope drainage above the depot', 'Depot supervisor'],
  'SMP-A9': ['gust', 75, '>', 'km/h', 'Close roller doors and halt forklift runs', 'Warehouse lead'],
  'SMP-A10': ['tmax', 41, '>', '°C', 'Confirm refrigeration load and shade outdoor staff', 'Cold-store ops'],
};

function ensureSampleLimits(project = loadRiskProject()) {
  const assets = Array.isArray(project.assets) ? project.assets : [];
  const demoIds = assets.filter((a) => a.demo || String(a.asset_id || '').startsWith('SMP-A')).map((a) => String(a.asset_id));
  if (!demoIds.length) return project;
  const limits = Array.isArray(project.sheets?.operating_limits) ? project.sheets.operating_limits.slice() : [];
  const have = new Set(limits.map((row) => String(row.asset_id)));
  let added = 0;
  demoIds.forEach((id) => {
    if (have.has(id) || !SAMPLE_LIMIT_SEED[id]) return;
    const [variable, threshold, operator, unit, required_action, owner_role] = SAMPLE_LIMIT_SEED[id];
    limits.push({
      asset_id: id, variable, operator, threshold, unit,
      duration_minutes: 60, action_lead_minutes: 180,
      authority_type: 'example', authority_reference: 'Sample SOP',
      required_action, owner_role, valid_from: '2026-01-01',
    });
    added += 1;
  });
  if (!added) return project;
  const next = { ...project, sheets: { ...project.sheets, operating_limits: limits } };
  try {
    localStorage.setItem(RISK_STORE, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('agn:client-risk', { detail: { assets: assets.length, limits: limits.length } }));
  } catch { /* keep the in-memory repair for this visit */ }
  return next;
}
function eventVerdict(v) {
  if (!v) return null;
  const lanes = Array.isArray(v.lanes) ? v.lanes : [];
  if (lanes.length) {
    const live = lanes.filter((l) => l && !l.condition && !l.standing && (l.verdict === 'Act' || l.verdict === 'Watch'));
    if (!live.length) return null;
    return live.some((l) => l.verdict === 'Act') ? 'Act' : 'Watch';
  }
  if (v.top?.score != null && v.top.score >= 65) return v.verdict === 'Act' ? 'Act' : 'Watch';
  return null;
}
function actionableLanes(v) {
  return (v?.lanes || []).filter((l) => l && !l.condition && !l.standing && (l.verdict === 'Act' || l.verdict === 'Watch'));
}
function recommendedAction(v, lane) {
  if (lane?.action) return lane.action;
  if (v?.action) return v.action;
  const h = lane?.hazard || v?.top?.hazard;
  const band = lane?.verdict || v?.verdict || 'Monitor';
  if (band === 'Act') return `Initiate the ${hazardLabel(h)} response for ${v?.name || 'this unit'} and confirm ownership within the hour.`;
  if (band === 'Watch') return `Prepare the ${hazardLabel(h)} response for ${v?.name || 'this unit'} within 48 hours.`;
  return 'No action indicated';
}
function deadlineFor(lane) {
  const hours = lane?.verdict === 'Act' ? 6 : 48;
  return new Date(Date.now() + hours * 3600e3).toISOString();
}
function seasonNote() {
  const mo = new Date(Date.now() + 5 * 36e5).getUTCMonth() + 1;
  if (mo >= 10 && mo <= 11) return 'post-monsoon: drain and culvert inspection after the rains; smog season opens on the plains (masks, HVAC filters); first frost checks above 2,000 m';
  if (mo === 12 || mo <= 2) return 'winter: fog and smog on the plains, frost above 1,500 m, snow closures and avalanche season in the north';
  if (mo <= 4) return 'pre-monsoon: dust season in the south-west, heat drills before the first spell, cyclone pre-season on the coast from May';
  if (mo <= 6) return 'heat season: heat-stop rules, cooling plant and its power checked; GLOF melt season opens; cyclone season on the coast';
  return 'monsoon: pumps, drains and access-road triggers; riverine watch on the Indus reaches; GLOF and landslide season in the north';
}
function matchVerdict(rows, place, chain) {
  if (!rows?.length) return null;
  const district = chain?.district || place?.name || '';
  const tehsil = chain?.tehsil || '';
  const norm = (x) => String(x || '').trim().toLowerCase();
  return rows.find((x) => norm(x.name) === norm(district))
    || rows.find((x) => norm(x.district) === norm(district))
    || rows.find((x) => norm(x.name) === norm(tehsil))
    || rows.find((x) => norm(x.drivingTehsil) === norm(place?.name))
    || rows.find((x) => norm(x.name) === norm(place?.name))
    || {
      name: district || place?.name || 'Unresolved location',
      prov: chain?.province || '',
      verdict: 'No Data',
      top: { hazard: null, score: null, band: 'No Data', color: '#8b7aa8' },
      action: 'Resolve the active administrative unit before generating an action.',
      why: 'No operational verdict resolved for the selected location.',
      lanes: [],
    };
}
function buildAction(v, lane) {
  const hazard = lane?.hazard || v?.top?.hazard || null;
  return {
    id: actionId(),
    unit_name: v.name,
    district: v.district || v.name,
    tehsil: v.tehsil || v.drivingTehsil || '',
    hazard,
    score: lane?.score ?? v.top?.score ?? null,
    verdict: lane?.verdict || v.verdict,
    recommendation: recommendedAction(v, lane),
    owner: OWNERS[hazard] || 'Operations coordination',
    status: 'open',
    horizon: 'now',
    deadline: deadlineFor(lane || { verdict: v.verdict }),
    onset: null,
    outcome: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
  };
}
function ensureActionsForUnit(list, v) {
  const lanes = actionableLanes(v);
  if (!lanes.length) return { list, made: [] };
  const next = list.slice();
  const made = [];
  lanes.forEach((lane) => {
    const exists = next.find((a) => (a.unit_name || a.district) === v.name && a.hazard === lane.hazard && a.status !== 'closed');
    if (exists) return;
    const row = buildAction(v, lane);
    next.unshift(row);
    made.push(row);
  });
  return { list: next.slice(0, 80), made };
}
function fmtPeople(n) {
  if (n == null || !Number.isFinite(+n) || +n <= 0) return null;
  const v = +n;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)} million`;
  if (v >= 1e3) return `${Math.round(v / 1e3)} thousand`;
  return String(Math.round(v));
}
function coHazardChips(v) {
  const lead = v?.top?.hazard;
  const lanes = Array.isArray(v?.lanes) ? v.lanes : [];
  const byHazard = Object.fromEntries(lanes.map((l) => [l.hazard, l]));
  const source = lanes.length
    ? lanes
    : (Array.isArray(v?.all) ? v.all : []).map((x) => ({ ...x, ...(byHazard[x.hazard] || {}) }));
  if (source.length < 2) return [];
  const rank = { Act: 4, Watch: 3, Monitor: 2, Low: 1 };
  return source
    .filter((x) => x && x.hazard !== lead && x.score != null && !x.standing && !x.condition)
    .map((x) => ({ ...x, verdict: x.verdict || x.band || 'unclassed', verdictRank: rank[x.verdict] || 0 }))
    .sort((a, b) => (b.verdictRank - a.verdictRank) || String(a.hazard).localeCompare(String(b.hazard)));
}

function PriorityBoardBody({ board, rows, coverage, verdicts, actions, primed, glofStanding }) {
  return (
    <>
      <div className="ops-board-lede">
        <b>Top {Math.min(BOARD_ROWS, rows.length)} of {rows.length} assessed {coverage.unit || verdicts?.unitLevel || 'district'}s</b>
        <span>
          {coverage.unassessed
            ? `${coverage.unassessed} of ${coverage.total} could not be assessed.`
            : `All ${coverage.total || rows.length} were assessed.`}
          {' '}Event Act / Watch first, then verification urgency.
        </span>
      </div>
      {(primed.length > 0 || glofStanding.length > 0) && (
        <div className="ops-board-flags">
          {primed.length > 0 && (
            <div className="ops-board-flag tone-act">
              <em>Basin primed · {primed.length}</em>
              <span>{primed.slice(0, 6).map((x) => `${x.name} (${Number(x.primed?.api).toFixed(2)})`).join(', ')}{primed.length > 6 ? ` +${primed.length - 6}` : ''}</span>
            </div>
          )}
          {glofStanding.length > 0 && (
            <div className="ops-board-flag tone-live">
              <em>GLOF corridor · {glofStanding.length}</em>
              <span>{glofStanding.slice(0, 6).map((x) => `${x.name} (${Math.round(x.standing.score)})`).join(', ')}{glofStanding.length > 6 ? ` +${glofStanding.length - 6}` : ''}</span>
            </div>
          )}
        </div>
      )}
      {!board.length && <div className="opsx-empty">{verdicts?.why || 'District verdict data are not available in the current session.'}</div>}
      <div className="ops-prio-list" role="list" aria-label="National priority board">
        {board.map((v, index) => {
          const open = actions.find((x) => (x.unit_name || x.district) === v.name && x.hazard === v.top?.hazard && x.status !== 'closed');
          const chips = coHazardChips(v).slice(0, 4);
          const people = fmtPeople(v.population || v.pop || v.people);
          const tone = String(v.verdict || '').toLowerCase() === 'act' ? 'act'
            : String(v.verdict || '').toLowerCase() === 'watch' ? 'watch'
            : 'ok';
          const implication = v.action || recommendedAction(v, actionableLanes(v)[0] || null);
          const coveragePct = v.spatialCoverage != null ? `${Math.round(v.spatialCoverage * 100)}%` : null;
          return (
            <article key={`${v.name}-${v.prov}`} className={`ops-prio-row tone-${tone}`} role="listitem">
              <div className="ops-prio-rank" aria-hidden="true">{String(index + 1).padStart(2, '0')}</div>
              <div className="ops-prio-main">
                <div className="ops-prio-head">
                  <div className="ops-prio-place">
                    <b>{v.name}</b>
                    <span>{[v.prov, v.drivingTehsil].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="ops-prio-kpis">
                    <div className="ops-prio-kpi score" style={{ '--kpi': v.top?.color || HAZARD_COLORS[v.top?.hazard] || '#154A4E' }}>
                      <span>Score</span>
                      <b>{Math.round(v.top?.score ?? 0)}</b>
                    </div>
                    <div className="ops-prio-kpi">
                      <span>Verdict</span>
                      <b className={`opsx-state ${statusClass(v.verdict)}`}>{v.verdict || '—'}</b>
                    </div>
                    <div className="ops-prio-kpi">
                      <span>People</span>
                      <b>{people || '—'}</b>
                    </div>
                    <div className="ops-prio-kpi">
                      <span>Action</span>
                      <b>{open ? open.status : 'Not created'}</b>
                    </div>
                  </div>
                </div>
                <div className="ops-prio-signal">
                  <div className="ops-prio-lead">
                    <span>Top signal</span>
                    <b>{hazardLabel(v.top?.hazard)}</b>
                    <i>
                      {[v.leadIsCondition ? 'condition' : null, coveragePct ? `${coveragePct} coverage` : null].filter(Boolean).join(' · ') || 'lead hazard'}
                    </i>
                  </div>
                  {chips.map((x) => (
                    <div
                      key={x.hazard}
                      className="ops-prio-chip"
                      style={{ '--chip': HAZARD_COLORS[x.hazard] || '#4A8C93' }}
                    >
                      <span>{String(hazardLabel(x.hazard)).replace(/\s*[—(].*$/, '')}</span>
                      <b>{x.verdict || '—'}</b>
                      <i>{Math.round(x.score)}{x.band ? ` · ${x.band}` : ''}</i>
                    </div>
                  ))}
                </div>
                <div className="ops-prio-foot">
                  <p>{implication}</p>
                  <div className="ops-prio-tags">
                    {v.standing?.score != null && v.standing.score >= 25 && <span className="ops-mini-flag live">GLOF · {Math.round(v.standing.score)}</span>}
                    {v.primed && <span className="ops-mini-flag act">Basin primed · {v.primed.api}</span>}
                    {v.condition?.score != null && (v.condition.verdict === 'Act' || v.condition.verdict === 'Watch') && (
                      <span className="ops-mini-flag watch">{String(v.condition.hazard || 'condition')} · {v.condition.verdict}</span>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function ReportLinks({ report }) {
  if (!report) return null;
  if (report.busy) return <span className="agn-enssub">Making the report on the server…</span>;
  if (!report.ok) return <span className="agn-enssub">{report.why || 'The report could not be made.'}</span>;
  return (
    <span className="agn-enssub" style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
      <a href={report.html}>Open {report.id}</a>
      {report.pdf && <a href={`${report.pdf}?download=1`} download={`${report.id}.pdf`}>Download PDF</a>}
      <span>{report.pages ? `${report.pages} pages` : ''}</span>
    </span>
  );
}

export default function Operations() {
  const operator = useOperator();
  const { place, bundle } = usePlace('default,context,hazardCount');
  const context = bundle?.parts?.context?.v || bundle?.parts?.context || {};
  const chainActions = context?.actions || [];

  const [pane, setPane] = useState('situation');
  const [horizon, setHorizon] = useState('now');
  const [verdicts, setVerdicts] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [health, setHealth] = useState(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actions, setActions] = useState(() => readList(ACTION_KEY));
  const [actionFilter, setActionFilter] = useState('active');
  const [outcomes, setOutcomes] = useState({});
  const [reviews, setReviews] = useState(() => readList(REVIEW_KEY));
  const [reviewForm, setReviewForm] = useState({ district: '', hazard: 'flood', observed: 'pending', action: 'none', notes: '' });
  const [report, setReport] = useState(null);
  const [help, setHelp] = useState(null);
  const [skill, setSkill] = useState(null);
  const [skillBusy, setSkillBusy] = useState(false);
  const [skillVar, setSkillVar] = useState('temperature');
  const [assetState, setAssetState] = useState(() => ({ ...portfolioStamp(), rows: [], busy: false }));
  const searchRef = useRef(null);
  const briefingRef = useRef(null);
  const evaluateAssetsRef = useRef(null);

  useEffect(() => {
    let cancel = false;
    Promise.all([
      getJson('/api/verdicts'),
      getJson('/api/alerts'),
      getJson('/health').catch(() => null),
    ]).then(([board, alertBody, live]) => {
      if (cancel) return;
      setVerdicts(board?.ready ? board : { ready: false, rows: [], why: board?.why || 'Verdicts are not ready.' });
      setAlerts(Array.isArray(alertBody?.rows) ? alertBody.rows : []);
      setHealth(live);
    }).catch(() => {
      if (!cancel) setVerdicts({ ready: false, rows: [], why: 'The verdicts answer did not arrive.' });
    });
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) { setHits([]); return undefined; }
    const timer = setTimeout(() => {
      getJson(`/api/geo/search?q=${encodeURIComponent(text)}&limit=6`)
        .then((body) => setHits(body?.results || []))
        .catch(() => setHits([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onDoc(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const rows = useMemo(() => (Array.isArray(verdicts?.rows) ? verdicts.rows : []), [verdicts]);
  const active = useMemo(() => matchVerdict(rows, place, context), [rows, place, context]);

  useEffect(() => {
    if (!active?.name) return;
    setReviewForm((form) => (form.district ? form : {
      ...form,
      district: active.name,
      hazard: (active.top?.hazard && active.top.hazard in HAZARD_LABELS) ? active.top.hazard : 'flood',
    }));
  }, [active?.name, active?.top?.hazard]);

  useEffect(() => {
    if (!operator && pane === 'verification') setPane('situation');
  }, [operator, pane]);

  const counts = useMemo(() => {
    const out = { Act: 0, Watch: 0, Monitor: 0, Low: 0 };
    rows.forEach((v) => {
      const e = eventVerdict(v);
      if (e) out[e] += 1;
      else if (v.verdict === 'Low') out.Low += 1;
      else out.Monitor += 1;
    });
    return out;
  }, [rows]);

  const priority = (counts.Act || 0) + (counts.Watch || 0);
  const activeActions = actions.filter((a) => a.status !== 'closed');
  const shownActions = actions.filter((a) => actionFilter === 'all' || (actionFilter === 'active' && a.status !== 'closed') || a.status === actionFilter);
  const board = rows.slice(0, BOARD_ROWS);
  const coverage = verdicts?.coverage || {};
  const dataStatus = bundle?.ok ? 'Live location data' : (place ? 'Selected location' : 'National screen');
  const horizonLabel = HORIZON_LABEL[horizon] || 'Now';
  const nationalStatus = counts.Act ? 'Action required' : counts.Watch ? 'Heightened watch' : 'Routine monitoring';
  const nationalNote = counts.Act
    ? `${counts.Act} district${counts.Act === 1 ? '' : 's'} at the immediate response trigger`
    : counts.Watch
      ? `${counts.Watch} district${counts.Watch === 1 ? '' : 's'} at the 48-hour response trigger`
      : 'No Act or Watch signal in the event lanes';
  const actionNote = activeActions.length
    ? 'Open, acknowledged or escalated'
    : 'No active actions recorded';

  const briefing = useMemo(
    () => horizonBriefing(context, horizon, place?.name || active?.name || context?.place?.name),
    [context, horizon, place?.name, active?.name],
  );

  const decision = useMemo(() => {
    if (!place && !active) return [];
    const name = place?.name || active?.name || 'this place';
    const h = briefing.top?.key || active?.top?.hazard;
    const lane = actionableLanes(active)[0] || { hazard: h, verdict: active?.verdict };
    const weatherLine = briefing.weather.length
      ? briefing.weather.map((row) => `${row.date}: ${row.text}`).join(' · ')
      : 'Ensemble envelope not held for this lead yet.';
    const layerLine = briefing.layers.length
      ? briefing.layers.slice(0, 4).map((row) => `${row.name} ${row.word}`).join(' · ')
      : 'No scored hazard layers for this horizon.';
    const horizonAction = chainActions.find((row) => {
      const text = `${row.trigger || ''} ${row.text || ''} ${row.prepare_by_text || ''} ${row.action || ''}`.toLowerCase();
      if (horizon === '6') return /\b(today|tonight|hours?|6\s*h|near[- ]term)\b/.test(text);
      if (horizon === '24') return /\b(tomorrow|next day|24\s*h|fri|sat|sun|mon|tue|wed|thu)\b/.test(text);
      if (horizon === '72') return /\b(3 day|72\s*h|through|week|fri|sat|sun|mon)\b/.test(text);
      return true;
    }) || chainActions[0];
    return [
      ['Horizon in view', `${briefing.title}. ${briefing.basis}`],
      ['Strongest level', briefing.summary],
      ['Hazard stack', layerLine],
      ['Ensemble envelope', weatherLine],
      ['Place action', horizonAction
        ? `${horizonAction.hazard_label || horizonAction.hazard || 'Signal'}: ${horizonAction.trigger || horizonAction.text || horizonAction.action || '—'}`
        : `No place action was raised for ${name} in this session.`],
      ['Decision implication', active ? recommendedAction(active, lane) : `Read ${horizonLabel.toLowerCase()} levels for ${name} before assigning ownership.`],
      ['Responsible owner', OWNERS[h] || horizonAction?.owner_role || horizonAction?.owner || 'Operations coordination'],
    ];
  }, [place, active, briefing, chainActions, horizon, horizonLabel]);

  const stream = useMemo(() => {
    const h = briefing.top?.key || active?.top?.hazard;
    const alertCount = alerts.length;
    return [
      [horizonLabel, briefing.summary, briefing.dateLabel],
      ['Levels', briefing.layers.length ? briefing.layers.slice(0, 3).map((row) => `${row.name} ${row.word}`).join(' · ') : 'All clear / not scored', briefing.basis],
      ['Ensemble', briefing.weather[0]?.text || 'No ensemble row for this lead', briefing.weather[0]?.date || '—'],
      ['Alerts', alertCount ? `${alertCount} gated alert${alertCount === 1 ? '' : 's'}` : 'No gated alert rows', alertCount ? 'From the alerts board' : 'No Act/Watch alert is raised nationally'],
      ['Actions', `${activeActions.length} active action${activeActions.length === 1 ? '' : 's'}`, activeActions.length ? 'Register contains open institutional work' : 'Generate actions from the priority board'],
    ];
  }, [briefing, alerts.length, activeActions.length, horizonLabel, active?.top?.hazard]);

  const readiness = useMemo(() => {
    const project = loadRiskProject();
    const assetCount = (project.assets || []).length;
    const jobs = health?.ok === false ? 'health board reported a problem' : (health?.status || health?.ok ? 'all scheduled jobs current' : 'health board not loaded');
    return [
      ['Connected now', 'Weather (forecast model), ensemble, terrain, glacial-lake register, seismic zone, air quality (modelled), river reaches (modelled), national verdicts.'],
      ['Assets', assetCount ? `${assetCount} project asset${assetCount === 1 ? '' : 's'} loaded in this session` : 'No project assets loaded; load a portfolio to screen assets.'],
      ['Operational workflow', 'Action ownership, response windows, status, evidence and closure controls are active in this browser (local persistence).'],
      ['Server jobs', jobs],
      ['Not in this build', 'Users, permissions, notifications, an authority matrix and an institutional evidence store.'],
    ];
  }, [health, assetState.rows.length]);

  function keepActions(next) {
    setActions(next);
    writeList(ACTION_KEY, next);
  }
  function keepReviews(next) {
    setReviews(next);
    writeList(REVIEW_KEY, next);
  }
  function pickPlace(hit) {
    if (!hit || !Number.isFinite(+hit.lat) || !Number.isFinite(+hit.lon)) return;
    writePlace({ lat: +hit.lat, lon: +hit.lon, name: hit.name || hit.resolvedLabel || 'Selected place' }, '/analyst?tab=operations');
    setQuery(hit.name || hit.resolvedLabel || '');
    setMenuOpen(false);
    setHits([]);
  }
  function useActivePlace() {
    const current = place || readHashPlace();
    if (!current) {
      setQuery('');
      setMenuOpen(false);
      return;
    }
    setQuery(current.name || '');
    writePlace(current, '/analyst?tab=operations');
    setMenuOpen(false);
  }

  useEffect(() => {
    if (place?.name) setQuery((current) => current || place.name);
  }, [place?.lat, place?.lon, place?.name]);

  useEffect(() => {
    if (!briefingRef.current) return;
    briefingRef.current.dataset.horizon = horizon;
  }, [horizon]);
  function makeReport(kind) {
    if (!place) return;
    setReport({ busy: true });
    generateReport({ lat: place.lat, lon: place.lon, kind, section: 'operations', edition: 'main', name: place.name })
      .then(setReport)
      .catch(() => setReport({ ok: false }));
  }
  function generateFromPriorities() {
    let next = actions.slice();
    rows.filter((v) => v.verdict === 'Act' || v.verdict === 'Watch' || eventVerdict(v)).slice(0, 8).forEach((v) => {
      next = ensureActionsForUnit(next, v).list;
    });
    keepActions(next);
  }
  function addCurrentLocation() {
    if (!active) return;
    const { list, made } = ensureActionsForUnit(actions, active);
    if (!made.length && !actionableLanes(active).length) {
      const row = buildAction(active, { hazard: active.top?.hazard, score: active.top?.score, verdict: active.verdict || 'Monitor' });
      keepActions([row, ...actions].slice(0, 80));
      return;
    }
    keepActions(list);
  }
  function setActionStatus(id, status) {
    const next = actions.map((a) => {
      if (a.id !== id) return a;
      if (status === 'closed') {
        const outcome = String(outcomes[id] || a.outcome || '').trim();
        if (!outcome) return a;
        return { ...a, status, outcome, closed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      }
      return { ...a, status, updated_at: new Date().toISOString() };
    });
    if (status === 'closed') {
      const row = actions.find((a) => a.id === id);
      const outcome = String(outcomes[id] || row?.outcome || '').trim();
      if (!outcome) {
        setOutcomes((map) => ({ ...map, [id]: map[id] || '' }));
        return;
      }
    }
    keepActions(next);
  }
  function prefillReview() {
    if (!active) return;
    setReviewForm({
      district: active.name || '',
      hazard: (active.top?.hazard && active.top.hazard in HAZARD_LABELS) ? active.top.hazard : 'flood',
      observed: 'pending',
      action: 'none',
      notes: `Predicted ${hazardLabel(active.top?.hazard)} screening score ${scoreText(active.top?.score)}. ${active.why || active.action || ''}`,
    });
  }
  function saveReview() {
    const row = {
      id: reviewId(),
      created_at: new Date().toISOString(),
      district: reviewForm.district || active?.name || 'Unresolved',
      hazard: reviewForm.hazard,
      observed: reviewForm.observed,
      action: reviewForm.action,
      notes: reviewForm.notes,
      reviewer_id: 'offline-demo-user',
    };
    keepReviews([row, ...reviews].slice(0, 80));
    setReviewForm((form) => ({ ...form, notes: '' }));
  }
  async function runSkill() {
    setSkillBusy(true);
    try {
      const body = await getJson('/api/score/monthly');
      if (!body?.ok) {
        setSkill({ error: true, why: body?.why || body?.error || 'The monthly score did not answer.' });
        return;
      }
      setSkill(body);
    } catch (err) {
      setSkill({ error: true, why: err?.message || 'The monthly score request failed.' });
    } finally {
      setSkillBusy(false);
    }
  }
  async function evaluateAssets() {
    const project = loadRiskProject();
    const allSites = Array.isArray(project.assets) ? project.assets : [];
    const assets = portfolioAssetsForEvaluate(project);
    if (!allSites.length) {
      setAssetState({ ...portfolioStamp(project), rows: [], busy: false });
      return;
    }
    if (!assets.length) {
      setAssetState({
        ...portfolioStamp(project),
        rows: allSites.slice(0, 20).map((site) => ({
          id: site.asset_id || site.id,
          name: site.asset_name || site.name || site.asset_id,
          state: 'no operating limits yet',
        })),
        busy: false,
      });
      return;
    }
    setAssetState((s) => ({ ...s, busy: true, note: 'Evaluating the register against the forecast…' }));
    try {
      const response = await fetch('/api/limits/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-agn-view': operator ? 'operator' : 'customer' },
        body: JSON.stringify({ assets, origin: 'client' }),
      });
      const body = await response.json().catch(() => ({ ok: false }));
      if (!body?.ok) {
        setAssetState({ stamp: 'Not evaluated', note: body?.why || 'The limits answer did not arrive.', rows: [], busy: false });
        return;
      }
      const rowsOut = Array.isArray(body.rows) ? body.rows.slice(0, 12) : [];
      setAssetState({
        stamp: rowsOut.length ? `${rowsOut.length} crossings` : 'Clear',
        note: rowsOut.length
          ? 'Forecast crossings against the limits written for each asset. Exposure only — no downtime or money figure.'
          : `${assets.length} site${assets.length === 1 ? '' : 's'} evaluated · no limit crossed in the served horizons.`,
        rows: rowsOut.length ? rowsOut : assets.slice(0, 12).map((row) => ({
          id: row.id,
          name: row.name || row.id,
          state: 'evaluated · no crossing',
        })),
        busy: false,
      });
    } catch {
      setAssetState({ stamp: 'Not evaluated', note: 'The limits request failed.', rows: [], busy: false });
    }
  }
  evaluateAssetsRef.current = evaluateAssets;

  useEffect(() => {
    function refreshPortfolio(autoEvaluate = true) {
      ensureSampleLimits();
      const project = loadRiskProject();
      const assets = portfolioAssetsForEvaluate(project);
      if (!assets.length) {
        const allSites = Array.isArray(project.assets) ? project.assets : [];
        setAssetState({
          ...portfolioStamp(project),
          rows: allSites.slice(0, 20).map((site) => ({
            id: site.asset_id || site.id,
            name: site.asset_name || site.name || site.asset_id,
            state: 'no operating limits yet',
          })),
          busy: false,
        });
        return;
      }
      setAssetState((s) => ({ ...portfolioStamp(project), rows: s.rows, busy: s.busy }));
      if (autoEvaluate && evaluateAssetsRef.current) evaluateAssetsRef.current();
    }
    refreshPortfolio(true);
    function onRisk() { refreshPortfolio(true); }
    function onStorage(event) {
      if (event.key === RISK_STORE || event.key == null) refreshPortfolio(true);
    }
    window.addEventListener('agn:client-risk', onRisk);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('agn:client-risk', onRisk);
      window.removeEventListener('storage', onStorage);
    };
  }, [operator]);

  const primed = rows.filter((x) => x.primed).sort((a, b) => (b.primed?.api || 0) - (a.primed?.api || 0));
  const glofStanding = rows.filter((x) => x.standing?.score != null && x.standing.score >= 25)
    .sort((a, b) => (b.standing?.score || 0) - (a.standing?.score || 0));
  const verified = reviews.filter((r) => r.observed !== 'pending').length;
  const timely = reviews.filter((r) => r.action === 'timely').length;
  const learning = reviews.length >= 5 ? 'Developing' : reviews.length ? 'Early' : 'Pending';
  const systemStatus = `${dataStatus} · ${horizonLabel} · ${context.district || place?.name || 'Pakistan'}`;

  return (
    <div className="view opsx-view" data-view="operations">
      <div className="tab-purpose"><b>What this tab is for:</b> Turn signals into assigned actions and track them. The command view: who does what, by when.</div>

      <section aria-label="Climate operations centre" className="opsx-hero">
        <div className="opsx-eyebrow">National command, action and resilience workflow</div>
        <h2>AI GEO NIGRAAN Operations Centre <span>{place ? `· ${place.name}` : '· Pakistan'}</span></h2>
        <p>Current conditions, forecast change, susceptibility, actions and post event learning. Existing models and APIs remain the evidence base. Backend exposure, ownership and observed impact feeds connect through the same interface contract.</p>
        <div className="opsx-location-row">
          <div className="opsx-location-search" ref={searchRef}>
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input
              aria-label="Search an operational location"
              autoComplete="off"
              placeholder="Search settlement, city or operational area…"
              type="text"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setMenuOpen(true); }}
              onFocus={() => setMenuOpen(true)}
            />
            <button type="button" onClick={useActivePlace} disabled={!place}>Use active location</button>
            <div aria-label="Operational location results" className={`opsx-place-menu${menuOpen && hits.length ? ' show' : ''}`} role="listbox">
              {hits.map((hit) => (
                <button key={`${hit.lat},${hit.lon},${hit.name}`} type="button" className="opsx-place-result" role="option" onClick={() => pickPlace(hit)}>
                  <b>{hit.name}</b>
                  <span>{[hit.district, hit.province].filter(Boolean).join(' · ') || `${hit.lat?.toFixed?.(3)}, ${hit.lon?.toFixed?.(3)}`}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="opsx-location-note">Choosing a place here changes it on every tab.</div>
        </div>
        <div className="opsx-command">
          <div aria-label="Decision horizon" className="opsx-horizon" role="tablist">
            {[
              ['now', 'Now'],
              ['6', '6 hours'],
              ['24', '24 hours'],
              ['72', '3 days'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={horizon === id}
                className={horizon === id ? 'active' : ''}
                title={`Decision chain and readiness for ${label.toLowerCase()}`}
                onClick={() => setHorizon(id)}
              >{label}</button>
            ))}
          </div>
          <span className="opsx-live"><i /><span>{systemStatus}</span></span>
        </div>
      </section>

      <nav aria-label="Operations workspaces" className="opsx-tabs">
        <button type="button" className={pane === 'situation' ? 'active' : ''} onClick={() => setPane('situation')}>Situation room</button>
        <button type="button" className="tab-info-btn" title="How Situation Room works" aria-label="How Situation Room works" onClick={() => setHelp('ops-situation')}>i</button>
        {operator && (
          <>
            <button type="button" className={pane === 'verification' ? 'active' : ''} onClick={() => setPane('verification')}>Post-event verification</button>
            <button type="button" className="tab-info-btn" title="How Post Event Verification works" aria-label="How Post Event Verification works" onClick={() => setHelp('ops-verification')}>i</button>
          </>
        )}
        <span className="r268-opsbar">
          <button type="button" className="r268-rbtn" disabled={!place || report?.busy} onClick={() => makeReport('situation_report')}>Situation report</button>
          <button type="button" className="r268-rbtn" disabled={!place || report?.busy} onClick={() => makeReport('readiness_72h')}>72-hour readiness brief</button>
          <ReportLinks report={report} />
        </span>
      </nav>

      <section className={`opsx-pane${pane === 'situation' ? ' active' : ''}`} data-opsx-pane="situation">
        <div className="opsx-kpis">
          <article className={`opsx-kpi tone-${counts.Act ? 'act' : counts.Watch ? 'watch' : 'ok'}`}>
            <span>National operating status</span>
            <b>{verdicts ? nationalStatus : 'Loading'}</b>
            <em>{verdicts ? nationalNote : 'Reading current district verdicts'}</em>
          </article>
          <article className={`opsx-kpi tone-${priority ? (counts.Act ? 'act' : 'watch') : 'idle'}`}>
            <span>Action priorities</span>
            <b>{verdicts ? priority : '—'}</b>
            <em>{counts.Act || 0} immediate · {counts.Watch || 0} within 48 h</em>
          </article>
          <article className={`opsx-kpi tone-${activeActions.length ? 'active' : 'idle'}`}>
            <span>Active actions</span>
            <b>{activeActions.length}</b>
            <em>{actionNote}</em>
          </article>
          <article className={`opsx-kpi tone-${priority ? 'watch' : 'idle'}`}>
            <span>Exposed population</span>
            <b>{priority ? `${priority} units` : '—'}</b>
            <em>{priority ? 'Districts at a response trigger · population roll-up not served here' : 'People in units with a hazard at its response trigger'}</em>
          </article>
        </div>

        <article className="opsx-card ops-horizon-brief" id="opsHorizonBrief" ref={briefingRef}>
          <div className="opsx-head">
            <div>
              <h3>{briefing.title}</h3>
              <p>{briefing.basis}</p>
            </div>
            <span className="opsx-badge">{horizonLabel}</span>
          </div>
          <p className="ops-horizon-summary">{briefing.summary}</p>
          {!!briefing.layers.length && (
            <div className="ops-horizon-layers" role="list" aria-label="Hazard levels for this horizon">
              {briefing.layers.map((row) => {
                const lv = String(row.word || 'normal').toLowerCase().match(/normal|low|moderate|high|severe/)?.[0] || 'normal';
                return (
                  <div key={`${row.key}-${row.day}`} className={`ops-horizon-tile lv-${lv}`} role="listitem">
                    <span className="ops-horizon-tile-name">{row.name}</span>
                    <strong className="ops-horizon-tile-level">{row.word}</strong>
                    {row.date ? <time className="ops-horizon-tile-date" dateTime={row.date}>{row.date}</time> : null}
                  </div>
                );
              })}
            </div>
          )}
          {!!briefing.weather.length && (
            <div className="ops-horizon-weather">
              {briefing.weather.map((row) => (
                <div key={row.date}>
                  <span>{row.date}</span>
                  <b>{row.text}</b>
                </div>
              ))}
            </div>
          )}
          {!place && <p className="ops-empty">Choose a place to read horizon levels. Overview’s active place is used when the URL holds it.</p>}
        </article>

        <article className="opsx-card ops-asset-card" id="assetCard">
          <div className="opsx-head">
            <div>
              <h3>Asset limits · time left to act</h3>
              <p>Forecast crossings against each site’s operating limits. Exposure only — no downtime or money figure.</p>
            </div>
            <span className={`opsx-badge${/cross/i.test(assetState.stamp || '') ? ' warn' : ''}`}>{assetState.stamp}</span>
          </div>
          <div className="ops-asset-toolbar">
            <button type="button" className="opsx-btn primary" disabled={assetState.busy} onClick={evaluateAssets}>{assetState.busy ? 'Evaluating…' : 'Evaluate register'}</button>
            <span className="agn-enssub">{assetState.note}</span>
          </div>
          <div id="assetBody" className="ops-asset-list">
            {!assetState.rows.length && (
              <div className="opsx-empty">No portfolio sites yet. Add sites with operating limits in Client Risk, or load the sample portfolio.</div>
            )}
            {assetState.rows.map((row, index) => {
              const state = String(row.state || row.variable || row.limit?.variable || 'evaluated');
              const tone = /cross/i.test(state) ? 'cross'
                : /possible|near/i.test(state) ? 'possible'
                : /no operating|not evaluated/i.test(state) ? 'muted'
                : 'clear';
              const meta = [
                row.near != null ? `near ${row.near}` : null,
                row.days != null ? `day ${row.days}` : null,
                row.variable && row.state ? row.variable : null,
              ].filter(Boolean).join(' · ');
              return (
                <div className={`opsx-asset-row tone-${tone}`} key={row.id || row.asset_id || index}>
                  <div className="ops-asset-main">
                    <b>{row.name || row.asset || row.id || 'Asset'}</b>
                    {meta ? <span>{meta}</span> : null}
                  </div>
                  <em className="ops-asset-state">{state}</em>
                </div>
              );
            })}
          </div>
        </article>

        {operator && <OperatorPanels place={place} actions={chainActions} />}

        <details className="agn-tracked" open={!!activeActions.length}>
          <summary>
            Tracked actions <span className="opsx-badge">{activeActions.length} active actions</span>
            <small>status, owner and outcome of actions you took on (kept in this browser)</small>
          </summary>
          <div className="opsx-actions-top">
            <button type="button" className="opsx-btn primary" onClick={generateFromPriorities}>Generate from priorities</button>
            <button type="button" className="opsx-btn" onClick={addCurrentLocation} disabled={!active}>Add current location</button>
            <select className="opsx-select" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} aria-label="Action filter">
              <option value="active">Active actions</option>
              <option value="all">All actions</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="escalated">Escalated</option>
              <option value="closed">Closed</option>
            </select>
            <button type="button" className="opsx-btn danger" onClick={() => { if (window.confirm('Clear the browser-local action register? This cannot be undone.')) keepActions([]); }}>Clear register</button>
          </div>
          <div className="opsx-action-list">
            {!shownActions.length && <div className="opsx-empty">No action matches the current filter. Generate actions from the national priorities or add the active location.</div>}
            {shownActions.map((a) => (
              <article key={a.id} className="opsx-action" style={{ '--action-color': HAZARD_COLORS[a.hazard] || '#14B8A6' }}>
                <div className="opsx-action-top">
                  <div>
                    <h4>{a.id} · {a.unit_name || a.district || a.tehsil || 'Unresolved unit'}</h4>
                    <p>{a.recommendation}</p>
                  </div>
                  <span className={`opsx-state ${statusClass(a.status)}`}>{a.status}</span>
                </div>
                <div className="opsx-action-meta">
                  <span>{hazardLabel(a.hazard)} {scoreText(a.score)}</span>
                  <span>Owner: {a.owner}</span>
                  <span>{a.onset ? 'Prepare by' : 'Demo target (not institutional SOP)'}: {timeText(a.deadline)}{a.onset ? ` · onset ${timeText(a.onset)}` : ''}</span>
                  <span>Horizon: {a.horizon || 'now'}</span>
                </div>
                <div className="opsx-action-controls">
                  <button type="button" onClick={() => setActionStatus(a.id, 'acknowledged')}>Acknowledge</button>
                  <button type="button" onClick={() => setActionStatus(a.id, 'escalated')}>Escalate</button>
                  <input
                    type="text"
                    aria-label="Outcome (required to close)"
                    placeholder="Outcome (required to close)"
                    value={outcomes[a.id] ?? a.outcome ?? ''}
                    onChange={(event) => setOutcomes((map) => ({ ...map, [a.id]: event.target.value }))}
                  />
                  <button type="button" onClick={() => setActionStatus(a.id, 'closed')}>Close</button>
                </div>
                {a.outcome ? <div className="opsx-action-meta"><span>Outcome: {a.outcome}</span></div> : null}
              </article>
            ))}
          </div>
        </details>

        {operator && (() => {
          const skillOk = skill && !skill.error && skill.ok;
          const leads = Array.isArray(skill?.leads) ? skill.leads : ['0', '1', '2', '3'];
          const national = skillOk ? (skill.national?.[skillVar] || {}) : {};
          const zones = skillOk ? (skill.zones || {}) : {};
          const zoneNames = Object.keys(zones);
          const windowInfo = skill?.window || {};
          const isRain = skillVar === 'rainDay';
          const skillVars = [
            ['temperature', 'Temperature'],
            ['dewPoint', 'Dew point'],
            ['wind', 'Wind'],
            ['rainDay', 'Rain day'],
          ];
          return (
            <article className="opsx-card agn-op-only ops-skill-card" id="skillCard">
              <div className="opsx-head">
                <div>
                  <h3>Measured forecast error · by lead and by place</h3>
                  <p>Archived 00:00 PKT forecast scored against stations, by lead day and climate zone. These scores say how wrong a forecast has been at the places that hold instruments.</p>
                </div>
                <span className={`opsx-badge${skill?.error ? ' critical' : skillOk ? '' : ' pending'}`}>
                  {skillBusy ? 'Running' : skill?.error ? 'Failed' : skillOk ? 'Loaded' : 'Not run'}
                </span>
              </div>
              <div className="ops-skill-toolbar">
                <button type="button" className="opsx-btn primary" disabled={skillBusy} onClick={runSkill}>{skillBusy ? 'Running…' : 'Run verification'}</button>
                <select className="opsx-select" value={skillVar} onChange={(event) => setSkillVar(event.target.value)} aria-label="Skill variable" disabled={!skillOk}>
                  {skillVars.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
                <span className="agn-enssub">
                  {skillOk
                    ? `${(windowInfo.issues || []).length || '—'} issues · ${windowInfo.validFrom || '—'} → ${windowInfo.validTo || '—'} · ${skill.stations?.paired ?? '—'} stations paired`
                    : 'Monthly station score · load once to read lead and zone error.'}
                </span>
              </div>
              {skill?.error && (
                <div className="ops-skill-fail">
                  <b>Verification did not load</b>
                  <span>{skill.why || 'The monthly score did not answer.'}</span>
                </div>
              )}
              {!skill && !skillBusy && (
                <div className="ops-skill-idle">Click Run verification to load the measured lead and zone scores.</div>
              )}
              {skillOk && (
                <div className="ops-skill-body">
                  {skill.ownerSummary ? <p className="ops-skill-lede">{skill.ownerSummary}</p> : null}
                  <h4 className="ops-op-h4">National · by lead</h4>
                  <div className="ops-lead-grid ops-skill-leads" role="list" aria-label={`${skillVar} error by lead`}>
                    {leads.map((lead) => {
                      const row = national[lead] || national[Number(lead)] || {};
                      if (row.missing) {
                        return (
                          <article key={lead} className="ops-lead-card muted" role="listitem">
                            <header><b>Lead day {lead}</b><span>not held</span></header>
                            <p className="ops-item-body">{row.missing}</p>
                          </article>
                        );
                      }
                      if (isRain) {
                        return (
                          <article key={lead} className="ops-lead-card" role="listitem">
                            <header><b>Lead day {lead}</b><span>{row.n ?? '—'} station-days</span></header>
                            <div className="ops-lead-metrics">
                              <div className="ops-lead-metric"><span>Hit rate</span><b>{row.hitRate == null ? '—' : Number(row.hitRate).toFixed(2)}</b></div>
                              <div className="ops-lead-metric warm"><span>False alarm</span><b>{row.falseAlarmRatio == null ? '—' : Number(row.falseAlarmRatio).toFixed(2)}</b></div>
                              <div className="ops-lead-metric"><span>Observed rain days</span><b>{row.observedRainDays ?? '—'}</b></div>
                              <div className="ops-lead-metric"><span>Stations</span><b>{row.stations ?? '—'}</b></div>
                            </div>
                          </article>
                        );
                      }
                      return (
                        <article key={lead} className="ops-lead-card" role="listitem">
                          <header><b>Lead day {lead}</b><span>{row.stations ?? '—'} stations · {row.n ?? '—'} h</span></header>
                          <div className="ops-lead-metrics">
                            <div className="ops-lead-metric"><span>MAE</span><b>{row.mae == null ? '—' : Number(row.mae).toFixed(2)}</b></div>
                            <div className={`ops-lead-metric${Number(row.bias) < 0 ? ' cool' : ' warm'}`}><span>Bias</span><b>{row.bias == null ? '—' : `${Number(row.bias) >= 0 ? '+' : ''}${Number(row.bias).toFixed(2)}`}</b></div>
                            <div className="ops-lead-metric"><span>Days</span><b>{row.days ?? '—'}</b></div>
                            <div className="ops-lead-metric"><span>90% MAE band</span><b>{Array.isArray(row.mae90) ? `${Number(row.mae90[0]).toFixed(2)}–${Number(row.mae90[1]).toFixed(2)}` : '—'}</b></div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <h4 className="ops-op-h4">By climate zone · lead 0</h4>
                  <div className="ops-lead-grid ops-skill-zones" role="list" aria-label={`${skillVar} error by zone`}>
                    {zoneNames.map((zone) => {
                      const row = zones[zone]?.[skillVar]?.['0'] || zones[zone]?.[skillVar]?.[0] || {};
                      if (!row || row.missing || (row.mae == null && row.hitRate == null && row.n == null)) {
                        return (
                          <article key={zone} className="ops-lead-card muted" role="listitem">
                            <header><b>{zone}</b><span>no score</span></header>
                          </article>
                        );
                      }
                      return (
                        <article key={zone} className="ops-lead-card" role="listitem">
                          <header><b>{zone}</b><span>{row.stations ?? '—'} stations</span></header>
                          <div className="ops-lead-metrics">
                            {isRain ? (
                              <>
                                <div className="ops-lead-metric"><span>Hit rate</span><b>{row.hitRate == null ? '—' : Number(row.hitRate).toFixed(2)}</b></div>
                                <div className="ops-lead-metric warm"><span>False alarm</span><b>{row.falseAlarmRatio == null ? '—' : Number(row.falseAlarmRatio).toFixed(2)}</b></div>
                              </>
                            ) : (
                              <>
                                <div className="ops-lead-metric"><span>MAE</span><b>{row.mae == null ? '—' : Number(row.mae).toFixed(2)}</b></div>
                                <div className={`ops-lead-metric${Number(row.bias) < 0 ? ' cool' : ' warm'}`}><span>Bias</span><b>{row.bias == null ? '—' : `${Number(row.bias) >= 0 ? '+' : ''}${Number(row.bias).toFixed(2)}`}</b></div>
                              </>
                            )}
                            <div className="ops-lead-metric"><span>n</span><b>{row.n ?? '—'}</b></div>
                            <div className="ops-lead-metric"><span>Days</span><b>{row.days ?? '—'}</b></div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </article>
          );
        })()}

        <div className="opsx-grid stack">
          {operator ? (
            <details id="agnNatWatch85" open>
              <summary>
                National watch · all of Pakistan
                <small>The most exposed districts and the population in them. Your own sites are above.</small>
              </summary>
              <div className="in">
                <article className="opsx-card ops-priority-board" id="opsxPriorityBoard">
                  <div className="opsx-head">
                    <div>
                      <h3>National priority board</h3>
                      <p>Current tehsil signals with the operational implication and action state.</p>
                    </div>
                    <span className="opsx-badge">{dataStatus}</span>
                  </div>
                  <PriorityBoardBody
                    board={board}
                    rows={rows}
                    coverage={coverage}
                    verdicts={verdicts}
                    actions={actions}
                    primed={primed}
                    glofStanding={glofStanding}
                  />
                </article>
              </div>
            </details>
          ) : (
            <article className="opsx-card ops-priority-board">
              <div className="opsx-head">
                <div>
                  <h3>National priority board</h3>
                  <p>Current tehsil signals with the operational implication and action state.</p>
                </div>
                <span className="opsx-badge">{dataStatus}</span>
              </div>
              <PriorityBoardBody
                board={board}
                rows={rows}
                coverage={coverage}
                verdicts={verdicts}
                actions={actions}
                primed={primed}
                glofStanding={glofStanding}
              />
            </article>
          )}

          <article className="opsx-card ops-decision-card">
            <div className="opsx-head">
              <div>
                <h3>Decision chain</h3>
                <p>One connected explanation for the active location and selected horizon.</p>
              </div>
              <span className="opsx-badge">{horizonLabel}</span>
            </div>
            {!place && <div className="opsx-empty">Choose a place to read the actions raised there.</div>}
            {place && (() => {
              const strongest = decision.find(([label]) => /strongest/i.test(label));
              const conclusion = decision.filter(([label]) => /implication|owner/i.test(label));
              const steps = decision.filter(([label]) => !/strongest|implication|owner/i.test(label));
              return (
                <div className="ops-decision">
                  {strongest && (
                    <div className="ops-decision-banner">
                      <span>Strongest level</span>
                      <b>{strongest[1]}</b>
                    </div>
                  )}
                  <ol className="ops-decision-steps" aria-label="Decision chain">
                    {steps.map(([label, text], index) => (
                      <li key={label} className="ops-decision-step">
                        <div className="ops-decision-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</div>
                        <div className="ops-decision-body">
                          <span>{label}</span>
                          <b>{text}</b>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {!!conclusion.length && (
                    <div className="ops-decision-end">
                      {conclusion.map(([label, text]) => {
                        const ok = /implication/i.test(label) && /no action/i.test(text);
                        const watch = /implication/i.test(label) && !ok;
                        return (
                          <div key={label} className={`ops-decision-end-item${ok ? ' ok' : watch ? ' watch' : ''}`}>
                            <span>{label}</span>
                            <b>{text}</b>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </article>
        </div>

        <div className="opsx-grid equal">
          <article className="opsx-card ops-changed-card">
            <div className="opsx-head">
              <div>
                <h3>What changed</h3>
                <p>Forecast, hazard levels and actions since the last update.</p>
              </div>
              <span className="opsx-badge">Live context</span>
            </div>
            <div className="ops-changed-grid" role="list" aria-label="What changed">
              {stream.map(([when, title, copy], index) => (
                <article
                  key={when}
                  className={`ops-changed-tile${index === 0 ? ' now' : ''}${index === 2 ? ' warn' : ''}`}
                  role="listitem"
                >
                  <header>
                    <em>{when}</em>
                    <i style={{ background: index === 2 ? (HAZARD_COLORS[active?.top?.hazard] || '#14B8A6') : '#14B8A6' }} />
                  </header>
                  <b>{title}</b>
                  <p>{copy}</p>
                </article>
              ))}
            </div>
          </article>
          <article className="opsx-card agn-op-only ops-ready-card">
            <div className="opsx-head">
              <div>
                <h3>Command readiness</h3>
                <p>What is connected now and what the production backend must supply.</p>
              </div>
              <span className="opsx-badge pending">Handover</span>
            </div>
            <div className="ops-ready-grid" role="list" aria-label="Command readiness">
              {readiness.map(([label, text]) => {
                const tone = /not in this build/i.test(label) ? 'gap'
                  : /server jobs/i.test(label) ? (/problem|not loaded/i.test(text) ? 'watch' : 'ok')
                  : /assets/i.test(label) ? (/no project/i.test(text) ? 'watch' : 'ok')
                  : 'live';
                return (
                  <div key={label} className={`ops-ready-tile tone-${tone}`} role="listitem">
                    <span>{label}</span>
                    <b>{text}</b>
                  </div>
                );
              })}
            </div>
          </article>
        </div>
      </section>

      {operator && (
        <section className={`opsx-pane agn-op-only${pane === 'verification' ? ' active' : ''}`} data-opsx-pane="verification">
          <div className="opsx-grid">
            <article className="opsx-card">
              <div className="opsx-head">
                <div>
                  <h3>Post event review</h3>
                  <p>Capture what was predicted, what happened, which action was taken and what should change.</p>
                </div>
                <span className="opsx-badge">Learning loop</span>
              </div>
              <div className="opsx-review-form">
                <div>
                  <label htmlFor="opsxReviewDistrict">Administrative unit</label>
                  <input className="opsx-input" id="opsxReviewDistrict" value={reviewForm.district} onChange={(event) => setReviewForm({ ...reviewForm, district: event.target.value })} placeholder="Active district or tehsil" type="text" />
                </div>
                <div>
                  <label htmlFor="opsxReviewHazard">Hazard</label>
                  <select className="opsx-select" id="opsxReviewHazard" value={reviewForm.hazard} onChange={(event) => setReviewForm({ ...reviewForm, hazard: event.target.value })}>
                    {['flood', 'heat', 'drought', 'wind', 'cold', 'glof', 'seismic', 'cyclone'].map((id) => (
                      <option key={id} value={id}>{HAZARD_LABELS[id]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="opsxReviewObserved">Observed outcome</label>
                  <select className="opsx-select" id="opsxReviewObserved" value={reviewForm.observed} onChange={(event) => setReviewForm({ ...reviewForm, observed: event.target.value })}>
                    <option value="pending">Pending verification</option>
                    <option value="none">No material impact</option>
                    <option value="minor">Minor impact</option>
                    <option value="moderate">Moderate impact</option>
                    <option value="severe">Severe impact</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="opsxReviewAction">Action response</label>
                  <select className="opsx-select" id="opsxReviewAction" value={reviewForm.action} onChange={(event) => setReviewForm({ ...reviewForm, action: event.target.value })}>
                    <option value="none">No action recorded</option>
                    <option value="late">Action taken late</option>
                    <option value="partial">Partially implemented</option>
                    <option value="timely">Implemented on time</option>
                  </select>
                </div>
                <div className="full">
                  <label htmlFor="opsxReviewNotes">Evidence and lessons</label>
                  <textarea id="opsxReviewNotes" value={reviewForm.notes} onChange={(event) => setReviewForm({ ...reviewForm, notes: event.target.value })} placeholder="Field observation, measured impact, action outcome, model behaviour and recommended change" />
                </div>
              </div>
              <div className="opsx-actions-top" style={{ marginTop: 12 }}>
                <button type="button" className="opsx-btn primary" onClick={saveReview}>Save review</button>
                <button type="button" className="opsx-btn" onClick={prefillReview}>Use current priority</button>
                <button type="button" className="opsx-btn danger" onClick={() => { if (window.confirm('Clear the browser-local post-event reviews? This cannot be undone.')) keepReviews([]); }}>Clear reviews</button>
              </div>
            </article>
            <article className="opsx-card">
              <div className="opsx-head">
                <div>
                  <h3>Verification scorecard</h3>
                  <p>These values are based only on reviews saved in this browser prototype.</p>
                </div>
                <span className="opsx-badge pending">Prototype ledger</span>
              </div>
              <div className="opsx-review-score">
                <div className="opsx-review-metric"><span>Reviews</span><b>{reviews.length}</b><em>Saved event records</em></div>
                <div className="opsx-review-metric"><span>Verified impacts</span><b>{verified}</b><em>Outcome no longer pending</em></div>
                <div className="opsx-review-metric"><span>Timely actions</span><b>{timely}</b><em>Recorded on time</em></div>
                <div className="opsx-review-metric"><span>Learning status</span><b>{learning}</b><em>Evidence maturity</em></div>
              </div>
              <div className="opsx-chain">
                <div className="opsx-chain-row"><span>Forecast verification</span><b>Compare model issue time, lead, predicted range and observed measurements.</b></div>
                <div className="opsx-chain-row"><span>Impact verification</span><b>Compare predicted consequence with observed disruption, loss and affected population.</b></div>
                <div className="opsx-chain-row"><span>Action verification</span><b>Measure acknowledgement, implementation time, completion and avoided loss.</b></div>
                <div className="opsx-chain-row"><span>Model improvement</span><b>Update regional model role, thresholds, confidence and data requirements.</b></div>
              </div>
            </article>
          </div>
          <article className="opsx-card">
            <div className="opsx-head">
              <div>
                <h3>Review register</h3>
                <p>Persistent browser demonstration of the future backend impact ledger.</p>
              </div>
              <span className="opsx-badge">{reviews.length} record{reviews.length === 1 ? '' : 's'}</span>
            </div>
            <div className="opsx-review-list">
              {!reviews.length && <div className="opsx-empty">No post event review has been saved in this browser. Use current priority to create the first evidence record.</div>}
              {reviews.map((r) => (
                <article className="opsx-review" key={r.id}>
                  <time>{timeText(r.created_at)}</time>
                  <div>
                    <h4>{r.id} · {r.district} · {hazardLabel(r.hazard)}</h4>
                    <p>Observed: {r.observed} · Action: {r.action}. {r.notes || 'No additional evidence recorded.'}</p>
                  </div>
                  <strong>{r.observed === 'pending' ? 'Pending' : 'Reviewed'}</strong>
                </article>
              ))}
            </div>
          </article>
        </section>
      )}

      {help && HELP[help] && (
        <div className="opsx-help" role="dialog" aria-modal="true" aria-labelledby="opsxHelpTitle">
          <div>
            <button type="button" className="close" aria-label="Close explanation" onClick={() => setHelp(null)}>×</button>
            <span className="phase">SYSTEM WORKFLOW</span>
            <h3 id="opsxHelpTitle">{HELP[help].title}</h3>
            <p>{HELP[help].purpose}</p>
            <div className="opsx-help-grid">
              <div><span>Input</span><b>{HELP[help].input}</b></div>
              <div><span>Processing role</span><b>{HELP[help].process}</b></div>
              <div><span>How to read it</span><b>{HELP[help].output}</b></div>
              <div><span>Limits</span><b>{HELP[help].next}</b></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
