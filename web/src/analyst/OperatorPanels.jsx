import { useEffect, useState } from 'react';
import { getJson } from '../start/api.js';

function escNum(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '–';
  return n.toFixed(digits);
}
function signed(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '–';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}`;
}
function statusTone(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'pass' || s === 'operational' || s === 'ok' || s === 'clean') return 'ok';
  if (s === 'warn' || s === 'provisional' || s === 'pending') return 'warn';
  if (s === 'fail' || s === 'critical' || s === 'open') return 'fail';
  if (s === 'reference' || s === 'experimental') return 'mute';
  return 'mute';
}

function Rail({ index, title, blurb, children }) {
  return (
    <section className="ops-rail">
      <header className="ops-rail-h">
        <span>{index}</span>
        <div>
          <b>{title}</b>
          <p>{blurb}</p>
        </div>
      </header>
      <div className="ops-rail-body">{children}</div>
    </section>
  );
}

function FoldCard({
  id,
  title,
  note,
  badge = 'Operator',
  badgeTone,
  summary,
  actions,
  children,
}) {
  return (
    <article className="ops-fold ops-fold-open" id={id}>
      <div className="ops-fold-sum">
        <div className="ops-fold-titles">
          <div className="ops-fold-title-row">
            <h3>{title}</h3>
            <span className={`opsx-badge${badgeTone ? ` ${badgeTone}` : ''}`}>{badge}</span>
          </div>
          {summary ? <p className="ops-fold-sumline">{summary}</p> : null}
          {note ? <p className="ops-fold-note">{note}</p> : null}
        </div>
      </div>
      <div className="ops-fold-body">
        {actions}
        {children}
      </div>
    </article>
  );
}

function MetricStrip({ items }) {
  if (!items?.length) return null;
  return (
    <div className="ops-metrics">
      {items.map((item) => (
        <div key={item.label} className={`ops-metric${item.tone ? ` ${item.tone}` : ''}`}>
          <span>{item.label}</span>
          <b>{item.value}</b>
          {item.hint ? <em>{item.hint}</em> : null}
        </div>
      ))}
    </div>
  );
}

function Loading({ text = 'Loading…' }) {
  return <div className="ops-loading">{text}</div>;
}

function SubTabs({ tabs, active, onChange }) {
  return (
    <div className="ops-subtabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={active === tab.id ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count != null ? <i>{tab.count}</i> : null}
        </button>
      ))}
    </div>
  );
}

function Table({ className = 'agn-sc-t', columns, rows, empty = 'No rows yet.' }) {
  return (
    <div className="opsx-tablewrap ops-tablewrap">
      <table className={className}>
        <thead>
          <tr>{columns.map((col) => <th key={col.key || col.label}>{col.label}</th>)}</tr>
        </thead>
        <tbody>
          {!rows.length && <tr><td colSpan={columns.length}>{empty}</td></tr>}
          {rows.map((row) => (
            <tr key={row.key} className={row.className || ''}>
              {columns.map((col) => (
                <td key={col.key || col.label} className={typeof row.cells[col.key]?.tone === 'string' ? row.cells[col.key].tone : undefined}>
                  {row.cells[col.key]?.node ?? row.cells[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function seedSampleLimitsIfNeeded(project) {
  const assets = Array.isArray(project.assets) ? project.assets : [];
  const demoIds = assets.filter((a) => a.demo || String(a.asset_id || '').startsWith('SMP-A')).map((a) => String(a.asset_id));
  if (!demoIds.length) return project;
  const seed = {
    'SMP-A1': ['tmax', 42, '>', 'Move outdoor labour into shade and pause harvest', 'Farm operations'],
    'SMP-A2': ['gust', 70, '>', 'Secure shed doors and halt loading', 'Depot supervisor'],
    'SMP-A3': ['rain_24h', 50, '>', 'Raise goods off the floor and check drainage', 'Warehouse lead'],
    'SMP-A4': ['wet_bulb', 30, '>', 'Stop outdoor erection work and rest crews', 'Site manager'],
    'SMP-A5': ['gust', 65, '>', 'Pause yard movements and secure trailers', 'Hub operations'],
    'SMP-A6': ['tmax', 40, '>', 'Limit outdoor shifts and check cold-chain power', 'Facilities'],
    'SMP-A7': ['tmin', -5, '<', 'Protect pipes and confirm generator fuel', 'Cold-store ops'],
    'SMP-A8': ['rain_24h', 40, '>', 'Inspect slope drainage above the depot', 'Depot supervisor'],
    'SMP-A9': ['gust', 75, '>', 'Close roller doors and halt forklift runs', 'Warehouse lead'],
    'SMP-A10': ['tmax', 41, '>', 'Confirm refrigeration load and shade outdoor staff', 'Cold-store ops'],
  };
  const limits = Array.isArray(project.sheets?.operating_limits) ? project.sheets.operating_limits.slice() : [];
  const have = new Set(limits.map((row) => String(row.asset_id)));
  let added = 0;
  demoIds.forEach((id) => {
    if (have.has(id) || !seed[id]) return;
    const [variable, threshold, operator, required_action, owner_role] = seed[id];
    limits.push({
      asset_id: id, variable, operator, threshold, unit: variable.includes('rain') ? 'mm' : variable.includes('gust') ? 'km/h' : '°C',
      duration_minutes: 60, action_lead_minutes: 180, authority_type: 'example', authority_reference: 'Sample SOP',
      required_action, owner_role, valid_from: '2026-01-01',
    });
    added += 1;
  });
  if (!added) return project;
  const next = { ...project, sheets: { ...project.sheets, operating_limits: limits } };
  try {
    localStorage.setItem('agn.clientRisk.v1', JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('agn:client-risk', { detail: { assets: assets.length, limits: limits.length } }));
  } catch { /* keep repaired project for this evaluate */ }
  return next;
}

function loadPortfolioAssets() {
  let project = {};
  try { project = JSON.parse(localStorage.getItem('agn.clientRisk.v1') || '{}'); } catch { project = {}; }
  project = seedSampleLimitsIfNeeded(project);
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

function CrossingsCard() {
  const [state, setState] = useState({ note: 'Not evaluated yet.', rows: [], busy: false, stamp: 'Ready' });
  async function evaluate() {
    setState((s) => ({ ...s, busy: true, note: 'Evaluating crossings…' }));
    try {
      const assets = loadPortfolioAssets();
      if (!assets.length) {
        setState({ stamp: 'No register', note: 'Add sites with operating limits in Client Risk › Add sites.', rows: [], busy: false });
        return;
      }
      const response = await fetch('/api/limits/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-agn-view': 'operator' },
        body: JSON.stringify({ assets, origin: 'client' }),
      });
      const body = await response.json().catch(() => ({ ok: false }));
      if (!body?.ok) {
        setState({ stamp: 'Not evaluated', note: body?.why || 'The crossings answer did not arrive.', rows: [], busy: false });
        return;
      }
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 40) : [];
      setState({
        stamp: rows.length ? `${rows.length} crossings` : 'Clear',
        note: rows.length
          ? 'One row per crossing, ordered by time. Exposure only.'
          : `${assets.length} site${assets.length === 1 ? '' : 's'} clear across the served horizons.`,
        rows,
        busy: false,
      });
    } catch {
      setState({ stamp: 'Not evaluated', note: 'The crossings request failed.', rows: [], busy: false });
    }
  }
  useEffect(() => {
    evaluate();
    function onRisk() { evaluate(); }
    function onStorage(event) {
      if (event.key === 'agn.clientRisk.v1' || event.key == null) evaluate();
    }
    window.addEventListener('agn:client-risk', onRisk);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('agn:client-risk', onRisk);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return (
    <FoldCard
      id="crossCard"
      title="Limit crossings · now to 15 days"
      badge={state.stamp}
      badgeTone={state.rows.length ? 'warn' : undefined}
      summary={state.note}
      note="Wet bulb, apparent and daily temperatures, rain, gusts and river flow. 0–72 h from the named global run; days 3–14 from the 51-member ensemble."
      actions={(
        <div className="opsx-actions-top">
          <button type="button" className="opsx-btn primary" disabled={state.busy} onClick={evaluate}>
            {state.busy ? 'Evaluating…' : 'Evaluate crossings'}
          </button>
        </div>
      )}
    >
      {!state.rows.length && !state.busy && (
        <p className="ops-empty">{/clear|ready|no register/i.test(state.stamp || '') ? state.note : 'No crossings yet. Evaluate the register against the forecast.'}</p>
      )}
      {!!state.rows.length && (
        <div className="ops-card-list" role="list" aria-label="Limit crossings">
          {state.rows.map((row, index) => {
            const stateText = String(row.state || '—');
            const tone = /cross/i.test(stateText) ? 'cross'
              : /possible|near/i.test(stateText) ? 'possible'
              : 'clear';
            const when = row.when || row.near || (row.days != null ? `day ${row.days}` : null);
            const detail = row.detail || row.action || row.episode || null;
            return (
              <article className={`ops-item-card tone-${tone}`} key={`${row.assetId || row.asset}-${row.variable}-${index}`} role="listitem">
                <div className="ops-item-top">
                  <div className="ops-item-main">
                    <b>{row.asset || row.name || row.assetId || 'Asset'}</b>
                    <span>{row.variable || row.limit?.variable || 'limit'}</span>
                  </div>
                  <em className="ops-item-state">{stateText}</em>
                </div>
                {(when || detail) && (
                  <div className="ops-item-meta">
                    {when ? <span><i>When</i>{when}</span> : null}
                    {detail ? <span><i>Detail</i>{detail}</span> : null}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </FoldCard>
  );
}

const VERIFY_REG_PAGE = 6;

function LeadMetric({ label, value, tone }) {
  return (
    <div className={`ops-lead-metric${tone ? ` ${tone}` : ''}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function SimplePager({ page, pageCount, total, pageSize, onChange, label }) {
  if (total <= pageSize) return null;
  const safe = Math.min(page, pageCount);
  const start = (safe - 1) * pageSize;
  return (
    <div className="ops-gate-pager" aria-label={label || 'Pages'}>
      <button type="button" className="opsx-btn" disabled={safe <= 1} onClick={() => onChange(safe - 1)}>Previous</button>
      <div className="ops-gate-page-list">
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={n === safe ? 'active' : ''}
            aria-current={n === safe ? 'page' : undefined}
            onClick={() => onChange(n)}
          >{n}</button>
        ))}
      </div>
      <span className="ops-gate-page-meta">
        {start + 1}–{Math.min(start + pageSize, total)} of {total}
      </span>
      <button type="button" className="opsx-btn" disabled={safe >= pageCount} onClick={() => onChange(safe + 1)}>Next</button>
    </div>
  );
}

function VerifyCard() {
  const [body, setBody] = useState(null);
  const [tab, setTab] = useState('temp');
  const [regPage, setRegPage] = useState(1);
  useEffect(() => {
    let cancel = false;
    getJson('/api/ops/verify').then((j) => { if (!cancel) setBody(j); }).catch(() => { if (!cancel) setBody({ ok: false }); });
    return () => { cancel = true; };
  }, []);
  useEffect(() => { setRegPage(1); }, [tab]);
  const v = body?.verify;
  const temp = v?.temperature?.byLead || {};
  const rainGauge = v?.rainGauge?.byLead || {};
  const rainSat = v?.rain?.byLead || {};
  const chancesGauge = v?.chancesGauge || {};
  const chancesSat = v?.chances || {};
  function chanceRows(block) {
    return Object.keys(block).filter((key) => block[key] && block[key].n).map((key) => {
      const row = block[key];
      return {
        key,
        label: row.thr_mm != null ? `Rain ≥ ${row.thr_mm} mm · ${key}` : key,
        n: row.n,
        baseRate: row.baseRate,
        brier: row.brier,
        skill: row.brierSkill,
      };
    });
  }
  const temp0 = temp['0'] || temp[0];
  const regModels = Array.isArray(body?.registry?.models) ? body.registry.models : [];
  const regPageCount = Math.max(1, Math.ceil(regModels.length / VERIFY_REG_PAGE));
  const regSafe = Math.min(regPage, regPageCount);
  const regSlice = regModels.slice((regSafe - 1) * VERIFY_REG_PAGE, regSafe * VERIFY_REG_PAGE);
  const gaugeChance = chanceRows(chancesGauge);
  const satChance = chanceRows(chancesSat);
  return (
    <FoldCard
      id="agnTrkCard"
      title="What we said vs what happened"
      badge={body?.ok ? 'Loaded' : body ? 'Unavailable' : 'Loading'}
      badgeTone={body?.ok ? undefined : body ? 'warn' : 'pending'}
      summary={v?.built ? `Verification ledger · built ${v.built}` : 'Issued forecasts scored against later measurements'}
      note="Operator only. Gauge truth first, then satellite; model register leakage checks at the end."
    >
      {!body && <Loading />}
      {body && !body.ok && <p className="ops-empty">{body.why || 'Could not read the verification ledger.'}</p>}
      {v && (
        <>
          <MetricStrip items={[
            { label: 'Tmax MAE d0', value: temp0 ? `${escNum(temp0.tmaxMAE)} °C` : '–', hint: temp0 ? `${temp0.n} station-days` : 'temperature', tone: 'ok' },
            { label: 'Rain gauge d0', value: rainGauge['0'] ? `${escNum(rainGauge['0'].maeMm)} mm` : '–', hint: 'MAE' },
            { label: 'Served models', value: body.registry?.summary?.served ?? '–', hint: `${body.registry?.summary?.servedClean ?? '–'} clean`, tone: 'ok' },
          ]} />
          {v.what ? <p className="ops-lede">{v.what}</p> : null}
          <SubTabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'temp', label: 'Temperature', count: Object.keys(temp).length },
              { id: 'gauge', label: 'Rain gauges', count: Object.keys(rainGauge).length },
              { id: 'sat', label: 'Satellite', count: Object.keys(rainSat).length },
              { id: 'chance', label: 'Chances', count: gaugeChance.length + satChance.length },
              { id: 'reg', label: 'Register', count: regModels.length },
            ]}
          />
          {tab === 'temp' && (
            Object.keys(temp).length ? (
              <div className="ops-lead-grid" role="list" aria-label="Temperature by lead day">
                {Object.keys(temp).sort().map((lead) => {
                  const row = temp[lead];
                  return (
                    <article key={lead} className="ops-lead-card" role="listitem">
                      <header>
                        <b>Lead day {lead}</b>
                        <span>{row.n} station-days</span>
                      </header>
                      <div className="ops-lead-metrics">
                        <LeadMetric label="Tmax MAE" value={escNum(row.tmaxMAE)} />
                        <LeadMetric label="Tmax bias" value={signed(row.tmaxBias)} tone={Number(row.tmaxBias) < 0 ? 'cool' : 'warm'} />
                        <LeadMetric label="Tmin MAE" value={escNum(row.tminMAE)} />
                        <LeadMetric label="Tmin bias" value={signed(row.tminBias)} tone={Number(row.tminBias) < 0 ? 'cool' : 'warm'} />
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <p className="ops-empty">{v.temperature?.why || 'No temperature verification yet.'}</p>
          )}
          {tab === 'gauge' && (
            Object.keys(rainGauge).length ? (
              <div className="ops-lead-grid" role="list" aria-label="Rain gauges by lead day">
                {Object.keys(rainGauge).sort().map((lead) => {
                  const row = rainGauge[lead];
                  const cat = (row.categories || []).find((c) => c.thr_mm === 1) || {};
                  return (
                    <article key={lead} className="ops-lead-card" role="listitem">
                      <header>
                        <b>Lead day {lead}</b>
                        <span>{row.n} samples</span>
                      </header>
                      <div className="ops-lead-metrics">
                        <LeadMetric label="Forecast" value={`${row.fcTotalMm ?? '–'} mm`} />
                        <LeadMetric label="Gauge" value={`${row.gaugeTotalMm ?? row.obsTotalMm ?? '–'} mm`} />
                        <LeadMetric label="Ratio" value={row.ratio == null ? '–' : escNum(row.ratio)} />
                        <LeadMetric label="Bias / day" value={signed(row.biasMmPerDay)} tone={Number(row.biasMmPerDay) < 0 ? 'cool' : 'warm'} />
                        <LeadMetric label="Found 1 mm+" value={cat.pod == null ? '–' : escNum(cat.pod)} />
                        <LeadMetric label="False 1 mm+" value={cat.far == null ? '–' : escNum(cat.far)} />
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <p className="ops-empty">{v.rainGauge?.why || 'No gauge verification yet.'}</p>
          )}
          {tab === 'sat' && (
            Object.keys(rainSat).length ? (
              <div className="ops-lead-grid" role="list" aria-label="Satellite rain by lead day">
                {Object.keys(rainSat).sort().map((lead) => {
                  const row = rainSat[lead];
                  const cat = (row.categories || []).find((c) => c.thr_mm === 10) || {};
                  return (
                    <article key={lead} className="ops-lead-card" role="listitem">
                      <header>
                        <b>Lead day {lead}</b>
                        <span>{row.n} tehsil-days</span>
                      </header>
                      <div className="ops-lead-metrics">
                        <LeadMetric label="Forecast" value={`${row.fcTotalMm ?? '–'} mm`} />
                        <LeadMetric label="IMERG Late" value={`${row.obsTotalMm ?? '–'} mm`} />
                        <LeadMetric label="Ratio" value={row.ratio == null ? '–' : escNum(row.ratio)} />
                        <LeadMetric label="10 mm+ hit" value={cat.pod == null ? '–' : escNum(cat.pod)} />
                        <LeadMetric label="10 mm+ FAR" value={cat.far == null ? '–' : escNum(cat.far)} />
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <p className="ops-empty">{v.rain?.why || 'No satellite verification yet.'}</p>
          )}
          {tab === 'chance' && (
            <div className="ops-split">
              <div>
                <h4 className="ops-op-h4">Vs rain gauges</h4>
                {!gaugeChance.length && <p className="ops-empty">{chancesGauge.why || 'No gauge-scored chance day yet'}</p>}
                {!!gaugeChance.length && (
                  <div className="ops-card-list">
                    {gaugeChance.map((row) => (
                      <article key={row.key} className="ops-item-card tone-live">
                        <div className="ops-item-top">
                          <div className="ops-item-main">
                            <b>{row.label}</b>
                            <span>{row.n} cases</span>
                          </div>
                          <em className="ops-item-state">skill {row.skill == null ? '–' : escNum(row.skill, 3)}</em>
                        </div>
                        <div className="ops-item-meta">
                          <span><i>Base rate</i>{escNum(row.baseRate, 3)}</span>
                          <span><i>Brier</i>{escNum(row.brier, 4)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h4 className="ops-op-h4">Vs satellite</h4>
                {!satChance.length && <p className="ops-empty">{chancesSat.why || 'No satellite-scored chance day yet'}</p>}
                {!!satChance.length && (
                  <div className="ops-card-list">
                    {satChance.map((row) => (
                      <article key={row.key} className="ops-item-card tone-live">
                        <div className="ops-item-top">
                          <div className="ops-item-main">
                            <b>{row.label}</b>
                            <span>{row.n} cases</span>
                          </div>
                          <em className="ops-item-state">skill {row.skill == null ? '–' : escNum(row.skill, 3)}</em>
                        </div>
                        <div className="ops-item-meta">
                          <span><i>Base rate</i>{escNum(row.baseRate, 3)}</span>
                          <span><i>Brier</i>{escNum(row.brier, 4)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {tab === 'reg' && (
            <>
              {!regModels.length && <p className="ops-empty">No models in the register.</p>}
              {!!regModels.length && (
                <div className="ops-card-list" role="list" aria-label="Model register">
                  {regSlice.map((model) => {
                    const status = model.clean ? 'clean' : (model.mitigated ? `mitigated` : (model.issue || 'open'));
                    const tone = statusTone(model.clean ? 'clean' : (model.issue || 'open'));
                    return (
                      <article key={model.id} className={`ops-item-card tone-${tone === 'ok' ? 'clear' : tone === 'fail' ? 'cross' : tone === 'warn' ? 'possible' : 'live'}`} role="listitem">
                        <div className="ops-item-top">
                          <div className="ops-item-main">
                            <b>{model.id}</b>
                            <span>{model.served ? 'Served' : 'Not served'}{Array.isArray(model.test) ? ` · ${model.test.join(' → ')}` : ''}</span>
                          </div>
                          <em className="ops-item-state">{status}</em>
                        </div>
                        <p className="ops-item-body">{(model.findings || []).join(', ') || (model.mitigated ? `mitigated: ${model.mitigated}` : 'clean')}</p>
                      </article>
                    );
                  })}
                </div>
              )}
              <SimplePager
                page={regSafe}
                pageCount={regPageCount}
                total={regModels.length}
                pageSize={VERIFY_REG_PAGE}
                onChange={setRegPage}
                label="Register pages"
              />
            </>
          )}
        </>
      )}
    </FoldCard>
  );
}

const GATE_PAGE_SIZE = 8;

function GateCard() {
  const [body, setBody] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  useEffect(() => {
    let cancel = false;
    getJson('/api/ops/gate').then((j) => { if (!cancel) setBody(j); }).catch(() => { if (!cancel) setBody(null); });
    return () => { cancel = true; };
  }, []);
  useEffect(() => {
    setPage(1);
    setOpenId(null);
  }, [filter, query]);
  const entries = Array.isArray(body?.entries) ? body.entries : [];
  const counts = entries.reduce((acc, entry) => {
    const status = entry.resolved?.status || entry.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    if (entry.resolved?.canAlert || entry.canAlert) acc.alert = (acc.alert || 0) + 1;
    return acc;
  }, { all: entries.length, alert: 0 });
  const filters = [
    ['all', 'All', counts.all || 0],
    ['operational', 'Operational', counts.operational || 0],
    ['provisional', 'Provisional', counts.provisional || 0],
    ['reference', 'Reference', counts.reference || 0],
    ['experimental', 'Experimental', counts.experimental || 0],
    ['alert', 'Can alert', counts.alert || 0],
  ];
  const q = query.trim().toLowerCase();
  const shown = entries.filter((entry) => {
    const status = entry.resolved?.status || entry.status || '';
    if (filter === 'alert') {
      if (!(entry.resolved?.canAlert || entry.canAlert)) return false;
    } else if (filter !== 'all' && status !== filter) return false;
    if (!q) return true;
    const hay = [
      entry.name, entry.id, entry.class, status,
      ...(entry.layers || []),
      entry.method, entry.source, entry.version,
      ...((entry.known_limitations) || []),
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
  const pageCount = Math.max(1, Math.ceil(shown.length / GATE_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = shown.slice((safePage - 1) * GATE_PAGE_SIZE, safePage * GATE_PAGE_SIZE);
  function goTo(next) {
    const clamped = Math.max(1, Math.min(pageCount, next));
    setPage(clamped);
    setOpenId(null);
  }
  return (
    <FoldCard
      id="agnGateCard"
      title="Model gate"
      badge={entries.length ? `${entries.length} models` : 'Gate'}
      summary={entries.length ? `${counts.operational || 0} operational · ${counts.alert || 0} can raise alerts` : 'Every map layer and what it may do'}
      note="Browse by status. Open a card for method, source and known limitations."
    >
      {!body && <Loading />}
      {body && !entries.length && <p className="ops-empty">Could not read the model gate.</p>}
      {!!entries.length && (
        <>
          <MetricStrip items={[
            { label: 'Models', value: entries.length, hint: body.version || 'gate' },
            { label: 'Operational', value: counts.operational || 0, tone: 'ok' },
            { label: 'Experimental', value: counts.experimental || 0, tone: 'warn' },
            { label: 'Can alert', value: counts.alert || 0 },
          ]} />
          <div className="ops-gate-toolbar">
            <div className="ops-gate-filters" role="tablist" aria-label="Model status filter">
              {filters.map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  className={filter === id ? 'active' : ''}
                  onClick={() => setFilter(id)}
                >
                  {label}<i>{count}</i>
                </button>
              ))}
            </div>
            <label className="ops-gate-search">
              <span className="sr-only">Search models</span>
              <input
                type="search"
                value={query}
                placeholder="Search model, layer or class…"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          {!shown.length && <p className="ops-empty">No models match this filter.</p>}
          <div className="ops-gate-grid">
            {pageRows.map((entry) => {
              const resolved = entry.resolved || {};
              const status = resolved.status || entry.status || 'unknown';
              const canAlert = !!(resolved.canAlert || entry.canAlert);
              const open = openId === entry.id;
              const layers = entry.layers || [];
              const limits = entry.known_limitations || [];
              return (
                <article key={entry.id} className={`ops-gate-card st-${statusTone(status)}${open ? ' open' : ''}`}>
                  <header className="ops-gate-card-head">
                    <div className="ops-gate-card-titles">
                      <h4>{entry.name}</h4>
                      <code>{entry.id}</code>
                    </div>
                    <div className="ops-gate-card-flags">
                      <span className={`ops-pill ${statusTone(status)}`}>{status}</span>
                      <span className={`ops-pill ${canAlert ? 'ok' : 'mute'}`}>{canAlert ? 'alerts' : 'display'}</span>
                    </div>
                  </header>
                  <div className="ops-gate-card-meta">
                    <span>{String(entry.class || 'unclassified').replace(/_/g, ' ')}</span>
                    {entry.version ? <span>{entry.version}</span> : null}
                  </div>
                  {!!layers.length && (
                    <div className="ops-gate-layers">
                      {layers.slice(0, 6).map((layer) => <span key={layer}>{layer}</span>)}
                      {layers.length > 6 ? <span>+{layers.length - 6}</span> : null}
                    </div>
                  )}
                  {Array.isArray(resolved.why) && resolved.why.length > 0 && (
                    <p className="ops-gate-why">{resolved.why[0]}</p>
                  )}
                  <button
                    type="button"
                    className="ops-gate-more"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : entry.id)}
                  >
                    {open ? 'Hide detail' : 'Method & limits'}
                  </button>
                  {open && (
                    <div className="ops-gate-detail">
                      <div>
                        <span>Method</span>
                        <b>{entry.method || '—'}</b>
                      </div>
                      <div>
                        <span>Source</span>
                        <b>{entry.source || '—'}</b>
                      </div>
                      <div>
                        <span>Known limitations</span>
                        {limits.length
                          ? <ul>{limits.map((item) => <li key={item}>{item}</li>)}</ul>
                          : <b>None listed</b>}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          <SimplePager
            page={safePage}
            pageCount={pageCount}
            total={shown.length}
            pageSize={GATE_PAGE_SIZE}
            onChange={goTo}
            label="Model gate pages"
          />
        </>
      )}
    </FoldCard>
  );
}

function SelfCheckCard() {
  const [body, setBody] = useState(null);
  const [score, setScore] = useState(null);
  useEffect(() => {
    let cancel = false;
    getJson('/api/ops/selfcheck').then((j) => { if (!cancel) setBody(j); }).catch(() => { if (!cancel) setBody(null); });
    getJson('/api/ops/shown/score').then((j) => { if (!cancel) setScore(j); }).catch(() => {});
    return () => { cancel = true; };
  }, []);
  const checks = Array.isArray(body?.checks) ? body.checks : [];
  const fail = body?.summary?.fail ?? 0;
  const warn = body?.summary?.warn ?? 0;
  return (
    <FoldCard
      id="agnScCard"
      title="Self-check"
      badge={body ? `${fail} fail · ${warn} warn` : 'Self-check'}
      badgeTone={fail ? 'critical' : warn ? 'warn' : undefined}
      summary={body ? `${body.units} units · day ${body.day} (${body.basis || '—'}) · ${body.ms ?? '–'} ms` : 'Hourly re-derivation against each method’s own rules'}
      note="Each check is a method rule. Open examples only when a check is not PASS."
    >
      {!body && <Loading />}
      {body && (
        <>
          <MetricStrip items={[
            { label: 'FAIL', value: fail, tone: fail ? 'fail' : 'ok' },
            { label: 'WARN', value: warn, tone: warn ? 'warn' : 'ok' },
            { label: 'PASS', value: checks.filter((c) => c.status === 'PASS').length, tone: 'ok' },
            { label: 'Runtime', value: body.ms != null ? `${body.ms} ms` : '–', hint: body.at },
          ]} />
          <div className="ops-check-grid">
            {checks.map((check) => {
              const tone = statusTone(check.status);
              const examples = check.examples || [];
              return (
                <article key={check.id} className={`ops-check-card ${tone}`}>
                  <header>
                    <span className={`ops-pill ${tone}`}>{check.status}</span>
                    <b>{check.id}</b>
                  </header>
                  <p>{check.name}</p>
                  <footer>
                    <span>{check.n} unit{check.n === 1 ? '' : 's'}</span>
                    {examples.length ? <span title={examples.join('; ')}>{examples.length} example{examples.length === 1 ? '' : 's'}</span> : <span>clean</span>}
                  </footer>
                  {examples.length > 0 && check.status !== 'PASS' && (
                    <ul>{examples.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
                  )}
                </article>
              );
            })}
          </div>
          {score && (
            <div className="ops-scorebox">
              <h4 className="ops-op-h4">What the map showed vs what happened</h4>
              <div className="ops-score-grid">
                <div><span>Rain</span><b>{score.rain?.text || score.rain?.why || 'not scored yet'}</b></div>
                <div><span>Heat</span><b>{score.heat?.text || score.heat?.why || 'not scored yet'}</b></div>
              </div>
            </div>
          )}
        </>
      )}
    </FoldCard>
  );
}

function AccuracyCard() {
  const [body, setBody] = useState(null);
  useEffect(() => {
    let cancel = false;
    getJson('/api/accuracy').then((j) => { if (!cancel) setBody(j); }).catch(() => { if (!cancel) setBody({ ok: false }); });
    return () => { cancel = true; };
  }, []);
  const national = body?.h24?.national;
  const cities = body?.h24?.city || {};
  const week = body?.d7?.city || {};
  const keys = Object.keys(cities).filter((key) => (cities[key]?.n || 0) >= 6).sort((a, b) => (cities[b].mae || 0) - (cities[a].mae || 0)).slice(0, 20);
  const flags = Array.isArray(body?.flags) ? body.flags : [];
  const zones = body?.h24?.zone || {};
  return (
    <FoldCard
      id="agnAccCard"
      title="Accuracy monitor"
      badge={body?.ok ? (flags.length ? `${flags.length} flagged` : 'Nominal') : body ? 'Down' : 'Loading'}
      badgeTone={flags.length ? 'warn' : body?.ok ? undefined : 'critical'}
      summary={body?.ok
        ? `Last run ${body.lastRun || 'not yet'} · national MAE ${escNum(national?.mae)} °C`
        : 'Served temperature vs local, synoptic and airport observations'}
      note="A city is flagged when its 24-hour error leaves the 95th percentile of its own past 30 days."
    >
      {!body && <Loading />}
      {body && !body.ok && <p className="ops-empty">{body.why || 'The monitor has not answered.'}</p>}
      {body?.ok && (
        <>
          <MetricStrip items={[
            { label: '24 h pairs', value: national?.n || 0 },
            { label: 'National MAE', value: `${escNum(national?.mae)} °C`, tone: 'ok' },
            { label: 'Bias', value: `${signed(national?.bias)} °C` },
            { label: 'Flagged', value: flags.length, tone: flags.length ? 'warn' : 'ok' },
          ]} />
          {flags.length ? (
            <div className="ops-flaglist">
              {flags.slice(0, 8).map((f) => (
                <span key={`${f.city}-${f.reference}`} className="ops-flag">{f.city} — {f.why}</span>
              ))}
            </div>
          ) : (
            <p className="ops-lede">No city outside its own normal range.</p>
          )}
          {!!keys.length && (
            <Table
              columns={[
                { key: 'city', label: 'City' },
                { key: 'mae24', label: '24 h MAE' },
                { key: 'bias24', label: '24 h bias' },
                { key: 'n', label: 'n' },
                { key: 'mae7', label: '7 d MAE' },
                { key: 'bias7', label: '7 d bias' },
                { key: 'worst', label: 'Worst station' },
              ]}
              rows={keys.map((key) => {
                const c = cities[key];
                const w = week[key] || {};
                return {
                  key,
                  cells: {
                    city: <b>{key}</b>,
                    mae24: escNum(c.mae),
                    bias24: signed(c.bias),
                    n: c.n,
                    mae7: escNum(w.mae),
                    bias7: signed(w.bias),
                    worst: c.worst ? `${c.worst.name} (${escNum(c.worst.mae)})` : '—',
                  },
                };
              })}
            />
          )}
          {!!Object.keys(zones).length && (
            <div className="ops-zonechips">
              {Object.keys(zones).map((key) => (
                <div key={key} className="ops-zonechip">
                  <b>{key}</b>
                  <span>MAE {escNum(zones[key].mae)}</span>
                  <span>bias {signed(zones[key].bias)}</span>
                  <span>n {zones[key].n}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </FoldCard>
  );
}

function ScoreCard() {
  const [body, setBody] = useState(null);
  const [tab, setTab] = useState('temperature');
  useEffect(() => {
    let cancel = false;
    getJson('/api/score/monthly').then((j) => { if (!cancel) setBody(j); }).catch(() => { if (!cancel) setBody({ ok: false }); });
    return () => { cancel = true; };
  }, []);
  const leads = ['0', '1', '2', '3'];
  const variables = [
    ['temperature', 'Temperature'],
    ['dewPoint', 'Dew point'],
    ['wind', 'Wind'],
    ['rainDay', 'Rain day'],
  ];
  const zones = ['national', 'plains', 'hills', 'mountain', 'coast'];
  const windowInfo = body?.window || {};
  const isRain = tab === 'rainDay';
  return (
    <FoldCard
      id="agnScoreCard"
      title="Forecast score"
      badge={body?.ok ? 'Monthly' : body ? 'Down' : 'Loading'}
      summary={body?.ok
        ? `${(windowInfo.issues || []).length} issues · ${windowInfo.validFrom || '—'} → ${windowInfo.validTo || '—'}`
        : 'Archived 00:00 PKT forecast vs stations, by lead day and zone'}
      note="Operator only. Not shown to customers."
    >
      {!body && <Loading />}
      {body && !body.ok && <p className="ops-empty">{body.why || 'The score has not answered.'}</p>}
      {body?.ok && (
        <>
          {body.ownerSummary && <p className="ops-skill-lede">{body.ownerSummary}</p>}
          <SubTabs
            active={tab}
            onChange={setTab}
            tabs={variables.map(([key, label]) => ({ id: key, label }))}
          />
          <div className="ops-score-zones" role="list" aria-label={`${tab} score by zone`}>
            {zones.map((zone) => {
              const block = zone === 'national' ? body.national : (body.zones || {})[zone];
              if (!block?.[tab]) return null;
              return (
                <article key={zone} className={`ops-score-zone${zone === 'national' ? ' national' : ''}`} role="listitem">
                  <header>
                    <b>{zone}</b>
                    <span>{variables.find(([key]) => key === tab)?.[1]}</span>
                  </header>
                  <div className="ops-lead-metrics ops-score-leads">
                    {leads.map((lead) => {
                      const value = block[tab][lead];
                      if (!value) {
                        return <div key={lead} className="ops-lead-metric muted"><span>Lead {lead}</span><b>—</b></div>;
                      }
                      if (value.missing) {
                        return <div key={lead} className="ops-lead-metric muted"><span>Lead {lead}</span><b>not held</b></div>;
                      }
                      if (isRain) {
                        return (
                          <div key={lead} className="ops-lead-metric">
                            <span>Lead {lead}</span>
                            <b>{value.hitRate == null ? '–' : escNum(value.hitRate)} <em>/ {value.falseAlarmRatio == null ? '–' : escNum(value.falseAlarmRatio)}</em></b>
                            <i>{value.n} st-days</i>
                          </div>
                        );
                      }
                      return (
                        <div key={lead} className={`ops-lead-metric${Number(value.bias) < 0 ? ' cool' : Number(value.bias) > 0 ? ' warm' : ''}`}>
                          <span>Lead {lead}</span>
                          <b>{escNum(value.mae)} <em>({signed(value.bias)})</em></b>
                          <i>{value.stations} st · {value.n} h</i>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
          {Array.isArray(body.limits) && body.limits.length > 0 && (
            <details className="ops-watchfold">
              <summary>Limits and caveats</summary>
              <ul>{body.limits.map((line) => <li key={line}>{line}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </FoldCard>
  );
}

function ActionsOpsCard({ place, actions }) {
  const rows = Array.isArray(actions) ? actions.filter((row) => row && row.source !== 'planning' && row.source !== 'watch' && row.source !== 'standing') : [];
  const watch = Array.isArray(actions) ? actions.filter((row) => row?.source === 'watch') : [];
  const standing = Array.isArray(actions) ? actions.filter((row) => row?.source === 'standing') : [];
  return (
    <FoldCard
      id="agnActionsOps"
      title="Actions"
      badge={`${rows.length} live`}
      badgeTone={rows.some((r) => r.cls === 'Act' || r.urgent) ? 'critical' : rows.length ? 'warn' : undefined}
      summary={`${rows.length} action${rows.length === 1 ? '' : 's'} for ${place?.name || 'the current subject'}`}
      note="Same records as the decision chain and the tracked register below."
    >
      {!rows.length && (
        <p className="ops-empty">
          No action is triggered: no client limit is forecast to be crossed, no hazard at the asset has reached its response trigger, and no ensemble event reaches its threshold.
        </p>
      )}
      {!!rows.length && (
        <div className="ops-card-list" role="list" aria-label="Live actions">
          {rows.slice(0, 24).map((row, index) => {
            const tone = row.cls === 'Act' || row.urgent ? 'act' : row.cls === 'Watch' ? 'watch' : 'live';
            const trigger = [row.trigger || row.text, row.chance != null ? `${row.chance}%` : null].filter(Boolean).join(' · ');
            const ready = row.prepare_by_text || row.prepare_by || null;
            const action = row.action || row.recommendation || null;
            const owner = row.owner_role || row.owner || null;
            return (
              <article className={`ops-item-card tone-${tone}`} key={row.action_id || `${row.hazard}-${index}`} role="listitem">
                <div className="ops-item-top">
                  <div className="ops-item-main">
                    <b>{row.hazard_label || row.hazard || 'Action'}</b>
                    <span>{[row.source, row.action_id].filter(Boolean).join(' · ') || 'site action'}</span>
                  </div>
                  <em className="ops-item-state">{row.cls || (row.urgent ? 'Act' : 'Live')}</em>
                </div>
                {trigger ? <p className="ops-item-body">{trigger}</p> : null}
                {action ? <p className="ops-item-action">{action}</p> : null}
                <div className="ops-item-meta">
                  {ready ? <span><i>Ready by</i>{ready}</span> : null}
                  {owner ? <span><i>Owner</i>{owner}</span> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {(watch.length > 0 || standing.length > 0) && (
        <details className="ops-watchfold">
          <summary>
            {watch.length} on the watch list · {standing.length} standing measure{standing.length === 1 ? '' : 's'}
          </summary>
          <ul>
            {watch.map((row, index) => (
              <li key={`w-${index}`}><b>Below the line · {row.hazard_label || row.hazard}</b>: {row.trigger || row.text}</li>
            ))}
            {standing.map((row, index) => (
              <li key={`s-${index}`}><b>{row.hazard_label || row.hazard}</b>: {row.action || row.text} <span className="agn-enssub">({row.owner_role || row.owner}; {row.trigger})</span></li>
            ))}
          </ul>
        </details>
      )}
    </FoldCard>
  );
}

function SiteRiskCard({ place, actions }) {
  const rows = Array.isArray(actions) ? actions.slice(0, 8) : [];
  return (
    <FoldCard
      id="agnSiteRisk"
      title={`What could affect ${place?.name || 'this place'} in the next 15 days`}
      badge="Site"
      summary={place ? `${rows.length} site signal${rows.length === 1 ? '' : 's'}` : 'Choose a place'}
      note="Only what the forecast switches on at this site. Use Client Risk for asset limits and portfolio screening."
    >
      {!place && <p className="ops-empty">Choose a place to read the site actions.</p>}
      {place && !rows.length && <p className="ops-empty">No action was raised for {place.name} in the served context.</p>}
      {!!rows.length && (
        <div className="ops-card-list ops-signal-list" role="list" aria-label="Site signals">
          {rows.map((row, index) => {
            const tone = row.cls === 'Act' || row.urgent ? 'act' : row.cls === 'Watch' ? 'watch' : 'live';
            return (
              <article key={`${row.hazard || row.hazard_label}-${index}`} className={`ops-item-card ops-signal tone-${tone}`} role="listitem">
                <div className="ops-item-top">
                  <div className="ops-item-main">
                    <b>{row.hazard_label || row.hazard || row.title || 'Signal'}</b>
                    {(row.source) && <span>{row.source}</span>}
                  </div>
                  {(row.cls || row.urgent) && <em className="ops-item-state">{row.cls || 'Act'}</em>}
                </div>
                <p className="ops-item-body">{row.trigger || row.text || row.action || '—'}</p>
                {(row.owner_role || row.owner) && (
                  <div className="ops-item-meta">
                    <span><i>Owner</i>{row.owner_role || row.owner}</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </FoldCard>
  );
}

export default function OperatorPanels({ place, actions }) {
  return (
    <div className="ops-op-stack">
      <Rail index="01" title="Site & limits" blurb="Actions raised for this place, limit crossings on the client register, and site-specific signals.">
        <ActionsOpsCard place={place} actions={actions} />
        <CrossingsCard />
        <SiteRiskCard place={place} actions={actions} />
      </Rail>
      <Rail index="02" title="Verification & models" blurb="What was issued against what was measured, the model gate, and the hourly self-check.">
        <VerifyCard />
        <GateCard />
        <SelfCheckCard />
      </Rail>
      <Rail index="03" title="Accuracy & score" blurb="Live temperature monitor and the monthly forecast score by lead day and zone.">
        <AccuracyCard />
        <ScoreCard />
      </Rail>
    </div>
  );
}
