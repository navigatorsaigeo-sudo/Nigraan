import { useEffect, useMemo, useState } from 'react';
import { getJson } from '../start/api.js';
import { LEVEL_WORDS } from './layers.js';
import { usePlace } from './place.js';
import {
  ADV_DEFS,
  ADV_GROUPS,
  CORE_DEFS,
  HAZARDS,
  PRESETS,
  STRESS_HAZARDS,
  WET_OPTIONS,
  advBaselineDisplay,
  advScenarioDisplay,
  advancedDiagnostics,
  baselineFromBundle,
  baseControlValue,
  defaultsForHazard,
  evaluateHazard,
  forecastDays,
  fmt,
  num,
  runSensitivitySweep,
} from './scenarioEngine.js';

const HAZARD_ORDER = ['flood', 'heat', 'wind', 'drought', 'multi'];

function LevelBadge({ level, word, date, tehsil, why }) {
  if (level == null || !Number.isFinite(+level)) {
    return <span className="lv nd" title={why || undefined}>Not assessed</span>;
  }
  const i = Math.max(0, Math.min(4, Math.round(+level)));
  const tip = [date, tehsil ? 'tehsil value' : '', why].filter(Boolean).join(' · ');
  return (
    <>
      <span className={`lv l${i}`} title={tip || undefined}>{word || LEVEL_WORDS[i] || '—'}</span>
      {date ? <div className="scn-day">{date}{tehsil ? ' · tehsil' : ''}</div> : null}
    </>
  );
}

function peakOf(hazard) {
  if (!hazard) return { level: null, word: 'Not assessed', why: 'not in the server answer' };
  if (hazard.peak && num(hazard.peak.level) != null) {
    return {
      level: +hazard.peak.level,
      word: hazard.peak.word || LEVEL_WORDS[hazard.peak.level],
      date: hazard.peak.date || null,
      tehsil: /tehsil/.test(String(hazard.scope || '')),
    };
  }
  let best = null;
  (hazard.days || []).forEach((d) => {
    if (d?.assessed && Number.isFinite(+d.level) && (!best || +d.level > best.level)) {
      best = { level: +d.level, word: d.word || LEVEL_WORDS[d.level], date: d.date || null };
    }
  });
  if (best) return best;
  const whyDay = (hazard.days || []).find((d) => d?.why);
  return { level: null, word: 'Not assessed', why: whyDay?.why || 'not assessed' };
}

function changeText(now, next) {
  if (now.level == null || next.level == null) return { text: '—', cls: 'same' };
  if (now.level === next.level) return { text: 'No change', cls: 'same' };
  const d = next.level - now.level;
  return { text: `${d > 0 ? '▲' : '▼'} ${Math.abs(d)} level${Math.abs(d) > 1 ? 's' : ''}`, cls: d > 0 ? 'up' : 'down' };
}

function pctChance(p) {
  if (!Number.isFinite(+p)) return '—';
  return `${(+p < 0.01 ? (100 * p).toFixed(2) : (100 * p).toFixed(1))} %`;
}

function pctNum(p) {
  if (!Number.isFinite(+p)) return null;
  const v = 100 * +p;
  return v < 1 ? v.toFixed(2) : v.toFixed(1);
}

function floodSide(side, label) {
  if (!side) {
    return (
      <div className="scn-flood-side">
        <span className="scn-flood-k">{label}</span>
        <b className="scn-flood-p">—</b>
      </div>
    );
  }
  if (!side.modelled) {
    return (
      <div className="scn-flood-side">
        <span className="scn-flood-k">{label}</span>
        <span className="scn-flood-nm" title={side.why || undefined}>{cap(side.why) || 'Not modelled'}</span>
      </div>
    );
  }
  const mm = num(side.mm) != null ? `${Math.round(side.mm * 10) / 10} mm` : null;
  const lo = pctNum(side.p5);
  const hi = pctNum(side.p95);
  return (
    <div className="scn-flood-side">
      <div className="scn-flood-side-top">
        <span className="scn-flood-k">{label}</span>
        {mm ? <span className="scn-flood-mm">{mm}</span> : null}
      </div>
      <b className="scn-flood-p">{pctChance(side.p)}</b>
      <span className="scn-flood-r">
        {lo != null && hi != null ? `90% range ${lo}–${hi}%` : '90% range —'}
        {side.rate ? ` · ${side.rate}` : ''}
      </span>
    </div>
  );
}

function cap(s) {
  const t = String(s || '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

function ControlSlider({ def, value, disabled, unavailable, onChange }) {
  const dec = def.step < 1 ? (def.step < 0.1 ? 2 : 1) : 0;
  const out = unavailable && Number(value) === 0 && def.status
    ? '—'
    : def.unit === 'percentile' ? `${Math.round(value)} percentile`
      : def.unit === 'index' ? `${Number(value).toFixed(dec)} index`
        : def.unit === '' ? `${Number(value).toFixed(dec)}` : `${Number(value).toFixed(dec)} ${def.unit}`;
  if (def.type === 'checkbox') {
    return (
      <div className={`scenario-check-control status-${def.status}`}>
        <div>
          <label>
            <input type="checkbox" checked={!!value} onChange={(e) => onChange(!!e.target.checked)} />
            {def.label}
          </label>
          <small>{def.role || def.scientific}</small>
          <i className="scenario-status-chip">scenario assumption</i>
        </div>
      </div>
    );
  }
  return (
    <div className={`scenario-control${disabled ? ' disabled' : ''}${def.status ? ` status-${def.status}` : ''}`}>
      <div className="scenario-control-top">
        <div>
          <b>{def.label}</b>
          <small>{def.scientific || def.role}</small>
          {def.status && (
            <i className="scenario-status-chip">
              {def.status === 'scenario' ? 'scenario-only' : def.status === 'context' ? 'context / experimental' : 'exposure only'}
            </i>
          )}
        </div>
        <output>{out}</output>
      </div>
      <input
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        disabled={disabled}
        aria-label={def.label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {unavailable && (
        <em>
          {def.status
            ? 'Observed baseline unavailable. Zero means no declared scenario value; presets or the user may still define an explicit scenario assumption.'
            : 'Baseline unavailable for this term; it is omitted from the core pathway.'}
        </em>
      )}
    </div>
  );
}

function ScoreCard({ label, base, scen, note }) {
  const d = num(base) != null && num(scen) != null ? Number(scen) - Number(base) : null;
  const cls = d == null ? 'zero' : d > 0.49 ? 'up' : d < -0.49 ? 'down' : 'zero';
  return (
    <article className="scenario-score-card">
      <span>{label}</span>
      <div className="scenario-score-pair">
        <b>{num(base) == null ? '—' : Math.round(base)}</b>
        <i>→</i>
        <b>{num(scen) == null ? '—' : Math.round(scen)}</b>
      </div>
      <div className={`scenario-score-delta ${cls}`}>{d == null ? 'Δ —' : `Δ ${d >= 0 ? '+' : ''}${d.toFixed(1)}`}</div>
      <small>{note || '0–100 screening, not probability'}</small>
    </article>
  );
}

export default function Scenario() {
  const { place, bundle } = usePlace('default,context,hazardCount,land,facts');

  const [asked, setAsked] = useState(false);
  const [stress, setStress] = useState({ preset: 'baseline', dT: 0, rainMm: 0, rainDay: forecastDays(0), gustKmh: 0, gustDay: forecastDays(0), wetPct: '' });
  const [presets, setPresets] = useState({});
  const [bounds, setBounds] = useState({});
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const [omInputs, setOmInputs] = useState(null);

  const [hazard, setHazard] = useState('flood');
  const [preset, setPreset] = useState('baseline');
  const [values, setValues] = useState({});
  const [advanced, setAdvanced] = useState({});
  const [sweepN, setSweepN] = useState(500);
  const [sweepCore, setSweepCore] = useState([]);
  const [sweepAdv, setSweepAdv] = useState([]);
  const [sweepResult, setSweepResult] = useState(null);

  const baseline = useMemo(
    () => (place ? baselineFromBundle(place, bundle, omInputs) : null),
    [place, bundle, omInputs],
  );

  useEffect(() => {
    if (!place) return undefined;
    let cancel = false;
    getJson(`/api/scenario?lat=${place.lat.toFixed(5)}&lon=${place.lon.toFixed(5)}&preset=baseline`)
      .then((body) => {
        if (cancel || !body) return;
        if (body.presets) setPresets(body.presets);
        if (body.bounds) setBounds(body.bounds);
        if (!asked) setRun(body);
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, [place?.lat, place?.lon]);

  useEffect(() => {
    if (!place) {
      setOmInputs(null);
      return undefined;
    }
    let cancel = false;
    const pts = `${place.lat.toFixed(5)},${place.lon.toFixed(5)}`;
    getJson(`/api/point/batch?with=inputs&pts=${pts}`)
      .then((body) => {
        if (cancel) return;
        setOmInputs(body?.states?.[0]?.inputs || null);
      })
      .catch(() => {
        if (!cancel) setOmInputs(null);
      });
    return () => { cancel = true; };
  }, [place?.lat, place?.lon]);

  useEffect(() => {
    if (!baseline) return;
    const next = defaultsForHazard(hazard, baseline);
    setValues(next.values);
    setAdvanced(next.advanced);
    setPreset('baseline');
    setSweepResult(null);
    const coreChanged = (CORE_DEFS[hazard] || []).filter((d) => Math.abs(Number(next.values[d.id]) - Number(baseControlValue(d, baseline))) > 1e-9).map((d) => d.id);
    const advChanged = ADV_DEFS.filter((d) => d.type !== 'checkbox' && Math.abs(Number(next.advanced[d.id]) - Number(baseControlValue(d, baseline))) > 1e-9).map((d) => d.id);
    setSweepCore(coreChanged);
    setSweepAdv(advChanged);
  }, [baseline?.name, hazard]);

  async function runStress(next = stress) {
    if (!place) return;
    setBusy(true);
    setAsked(true);
    const q = { lat: place.lat.toFixed(5), lon: place.lon.toFixed(5) };
    if (next.wetPct !== '') q.wetPct = next.wetPct;
    if (next.preset && next.preset !== 'custom') {
      q.preset = next.preset;
      if (next.rainDay) q.rainDay = next.rainDay;
    } else {
      if (+next.dT) q.dT = next.dT;
      if (+next.rainMm > 0) { q.rainMm = next.rainMm; q.rainDay = next.rainDay; }
      if (+next.gustKmh > 0) { q.gustKmh = next.gustKmh; q.gustDay = next.gustDay; }
    }
    try {
      const body = await getJson(`/api/scenario?${new URLSearchParams(q)}`);
      setRun(body || { ok: false, why: 'The scenario was not run.' });
      if (body?.presets) setPresets(body.presets);
      if (body?.bounds) setBounds(body.bounds);
    } catch {
      setRun({ ok: false, why: 'The scenario was not run.' });
    } finally {
      setBusy(false);
    }
  }

  function setStressField(key, value) {
    const next = { ...stress, [key]: value, preset: (key === 'rainDay' || key === 'gustDay' || key === 'wetPct') ? stress.preset || 'custom' : 'custom' };
    if (key !== 'wetPct' && key !== 'rainDay' && key !== 'gustDay') next.preset = 'custom';
    setStress(next);
    clearTimeout(window.__scnDeb);
    window.__scnDeb = setTimeout(() => runStress(next), key === 'wetPct' || key === 'rainDay' || key === 'gustDay' ? 0 : 450);
  }

  function applyEnginePreset(p) {
    if (!baseline) return;
    const next = defaultsForHazard(hazard, baseline);
    Object.entries(p.v || {}).forEach(([k, v]) => { next.values[k] = v; });
    Object.entries(p.a || {}).forEach(([k, v]) => { next.advanced[k] = v; });
    setValues(next.values);
    setAdvanced(next.advanced);
    setPreset(p.key);
    setSweepResult(null);
  }

  function setCoreValue(id, value) {
    setValues((prev) => ({ ...prev, [id]: value }));
    setPreset('custom');
    setSweepResult(null);
  }

  function setAdvValue(id, value) {
    setAdvanced((prev) => ({ ...prev, [id]: value }));
    setPreset('custom');
    setSweepResult(null);
  }

  function syncBaseline() {
    if (!baseline) return;
    const next = defaultsForHazard(hazard, baseline);
    setValues(next.values);
    setAdvanced(next.advanced);
    setPreset('baseline');
    setSweepResult(null);
  }

  function runSweep() {
    if (!baseline) return;
    const result = runSensitivitySweep({
      hazard,
      baseline,
      values,
      advanced,
      n: sweepN,
      selectedCore: sweepCore,
      selectedAdv: sweepAdv,
    });
    setSweepResult(result);
  }

  const spot = run?.ok && run.places ? run.places[0] : null;
  const baseHaz = spot?.baseline?.hazards || {};
  const scenHaz = spot?.scenario?.hazards || {};
  const rainMax = bounds.rainMmDay ? Math.min(bounds.rainMmDay[1], 500) : 500;
  const gustMax = bounds.gustKmh ? Math.min(bounds.gustKmh[1], 200) : 200;
  const dayOptions = [0, 1, 2, 3].map((i) => forecastDays(i));

  const engineEval = useMemo(() => {
    if (!baseline) return null;
    if (hazard === 'multi') {
      return ['flood', 'heat', 'wind', 'drought'].map((h) => {
        const defs = CORE_DEFS[h] || [];
        const bv = Object.fromEntries(defs.map((d) => [d.id, baseControlValue(d, baseline)]));
        const sv = { ...bv, ...values };
        const base = evaluateHazard(h, baseline, bv);
        const scen = evaluateHazard(h, baseline, sv);
        return { h, base, scen };
      });
    }
    const defs = CORE_DEFS[hazard] || [];
    const bv = Object.fromEntries(defs.map((d) => [d.id, baseControlValue(d, baseline)]));
    const sv = { ...bv, ...values };
    return {
      single: true,
      base: evaluateHazard(hazard, baseline, bv),
      scen: evaluateHazard(hazard, baseline, sv),
    };
  }, [baseline, hazard, values]);

  const diags = useMemo(() => (baseline ? advancedDiagnostics(baseline, advanced) : []), [baseline, advanced]);
  const meta = HAZARDS[hazard];

  if (!place) {
    return (
      <section className="an-pane an-scenario" style={{ '--ac': '#2F7D8C' }}>
        <p className="an-purpose"><b>What this tab is for:</b> Controlled scenario analysis — change bounded assumptions and inspect how the existing NIGRAAN baseline responds. Scenario outputs are sensitivity results, not forecasts or event probabilities.</p>
        <p className="an-note">Choose a place on Overview. Search, use your location, or click the map.</p>
      </section>
    );
  }

  return (
    <section className="an-pane an-scenario hybrid-view" style={{ '--ac': '#2F7D8C' }} data-view="hybridlab">
      <div className="tab-purpose"><b>What this tab is for:</b> Controlled scenario analysis — change bounded assumptions and inspect how the existing NIGRAAN baseline responds. Scenario outputs are sensitivity results, not forecasts or event probabilities.</div>

      <section aria-label="Scenario laboratory" className="hybrid-hero">
        <div>
          <span className="hybrid-eyebrow">CONTROLLED WHAT-IF · SENSITIVITY ANALYSIS</span>
          <h2>Scenario &amp; Stress Test</h2>
          <p>Test how bounded changes in environmental and exposure assumptions alter the current NIGRAAN screening response while the operational forecast and hazard engines remain protected.</p>
        </div>
        <div aria-label="Laboratory operating status" className="hybrid-hero-status">
          <span><i />Live baseline</span>
          <span><i />Deterministic sensitivity</span>
          <span><i />Operational engine protected</span>
        </div>
      </section>

      {/* —— Server weather stress test —— */}
      <section className="agn-scn" aria-label="Scenario and stress test">
        <header className="scn-head">
          <div className="scn-head-main">
            <p className="scn-kicker">Weather stress test</p>
            <h3>Scenario &amp; stress test · <span>{place.name}</span></h3>
            <p className="scn-sub">What would the levels at this place be for today and the next 3 days under a warmer climate, a heavy rain day or a strong gust? Pick a stress test or set your own.</p>
          </div>
          <div className="scn-place">
            <span className="k">Place</span>
            <span className="v">{place.name}</span>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('agn-change-place'))}>Change</button>
          </div>
        </header>

        <div className="scn-panel">
          <div className="scn-panel-label">Stress tests</div>
          <div className="scn-presets" role="group" aria-label="Stress tests">
            {!Object.keys(presets).length ? (
              <button type="button" onClick={() => runStress({ ...stress, preset: 'baseline' })}>Show the stress tests (server scenario run)</button>
            ) : Object.entries(presets).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`${stress.preset === id ? 'on' : ''}${/rain|precip/i.test(id) || /rain/i.test(label) ? ' kind-rain' : (/gwl|temp|\+.*°C/i.test(id + label) ? ' kind-warm' : ' kind-base')}`}
                aria-pressed={stress.preset === id}
                onClick={() => {
                  const next = { ...stress, preset: id, dT: 0, rainMm: 0, gustKmh: 0 };
                  setStress(next);
                  runStress(next);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="scn-sliders" aria-label="Your own settings">
          <label className="scn-control">
            <span className="scn-control-top">
              <span>Temperature +0 to 4 °C</span>
              <output>{+stress.dT ? `+${Number(stress.dT).toFixed(1)} °C` : 'as forecast'}</output>
            </span>
            <small>Hypothetical warming on the hourly temperature</small>
            <input type="range" min="0" max="4" step="0.5" value={+stress.dT || 0} aria-label="Temperature increase, degrees, hypothetical" onChange={(e) => setStressField('dT', Number(e.target.value) || 0)} />
          </label>
          <label className="scn-control">
            <span className="scn-control-top">
              <span>Rain in one day</span>
              <output>{+stress.rainMm > 0 ? `${Math.round(+stress.rainMm)} mm` : 'as forecast'}</output>
            </span>
            <small>Millimetres on the chosen day</small>
            <input type="range" min="0" max={rainMax} step="5" value={+stress.rainMm || 0} aria-label="Rain in one day, millimetres" onChange={(e) => setStressField('rainMm', Number(e.target.value) || 0)} />
            <select value={stress.rainDay} aria-label="Rain day" onChange={(e) => setStressField('rainDay', e.target.value)}>
              {dayOptions.map((d, i) => <option key={d} value={d}>{(i ? `day ${i}` : 'today')} · {d}</option>)}
            </select>
          </label>
          <label className="scn-control">
            <span className="scn-control-top">
              <span>The day’s peak gust</span>
              <output>{+stress.gustKmh > 0 ? `${Math.round(+stress.gustKmh)} km/h` : 'as forecast'}</output>
            </span>
            <small>Strongest gust on the chosen day</small>
            <input type="range" min="0" max={gustMax} step="5" value={+stress.gustKmh || 0} aria-label="Strongest gust, km per hour" onChange={(e) => setStressField('gustKmh', Number(e.target.value) || 0)} />
            <select value={stress.gustDay} aria-label="Gust day" onChange={(e) => setStressField('gustDay', e.target.value)}>
              {dayOptions.map((d, i) => <option key={d} value={d}>{(i ? `day ${i}` : 'today')} · {d}</option>)}
            </select>
          </label>
        </div>

        <p className="scn-na" role="status" hidden={!!(spot?.ok && !spot?.refused)}>{busy ? 'Running the scenario on the server…' : (spot?.why || run?.why || '')}</p>

        {(spot || busy) && (
          <div className="scn-results">
            <div className="scn-results-head">
              <h4>Hazard levels at this place</h4>
              <p>Highest of today and the next 3 days · now vs this scenario</p>
            </div>
            <div className="scn-table-wrap">
              <table className="scn-hz">
                <caption className="agn-scn-sr">Hazard levels at this place, now and under the scenario</caption>
                <thead>
                  <tr>
                    <th scope="col">Hazard</th>
                    <th scope="col">Now</th>
                    <th scope="col">Scenario</th>
                    <th scope="col">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {STRESS_HAZARDS.map(([key, label]) => {
                    const now = peakOf(baseHaz[key]);
                    const next = peakOf(scenHaz[key]);
                    const ch = changeText(now, next);
                    const method = scenHaz[key]?.method || baseHaz[key]?.method || '';
                    return (
                      <tr key={key} data-hz={key}>
                        <th scope="row">
                          <span className="scn-hz-name">{label}</span>
                          {method ? (
                            <details className="scn-method">
                              <summary>Method</summary>
                              <p>{method}</p>
                            </details>
                          ) : null}
                        </th>
                        <td><LevelBadge level={now.level} word={now.word} date={now.date} tehsil={now.tehsil} why={now.why} /></td>
                        <td><LevelBadge level={next.level} word={next.word} date={next.date} tehsil={next.tehsil} why={next.why} /></td>
                        <td><span className={`scn-delta ${ch.cls}`}>{ch.text}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="scn-foot">
          {run?.fromBundle
            ? 'Highest level of today and the next 3 days at this place, as served for the place (the place record). Pick a stress test or move a slider to run the NIGRAAN server’s scenario on these hours. Exposure only: no downtime or loss estimate.'
            : `Highest level of today and the next 3 days at this place, from the NIGRAAN server’s scenario run: the place’s own forecast hours, changed as set above${spot?.applied?.rainBasis ? ` (${spot.applied.rainBasis})` : ''}, scored the same way as the place record. Glacial lake outburst floods are not part of the scenario run (their level is the tehsil’s, on the map). Exposure only: no downtime or loss estimate. The live forecast and alerts are not changed.`}
        </p>

        {spot?.floodOutcome && (
          <aside className="scn-flood" aria-label="Local-rain flooding chance">
            <header className="scn-flood-head">
              <div>
                <h4>
                  Local-rain flooding
                  {spot.floodOutcome.district ? ` · ${spot.floodOutcome.district}` : ''}
                  {spot.floodOutcome.day ? ` · ${spot.floodOutcome.day}` : ''}
                </h4>
                <p className="scn-flood-lab">District chance only · not river / GLOF · not a site forecast</p>
              </div>
              <label className="scn-flood-w">
                <span>Ground wetness</span>
                <select aria-label="Ground wetness before the rain day" value={stress.wetPct} onChange={(e) => setStressField('wetPct', e.target.value)}>
                  {WET_OPTIONS.map(([v, label]) => <option key={v || 'cur'} value={v}>{label}</option>)}
                </select>
              </label>
            </header>
            {spot.floodOutcome.modelled ? (
              <div className="scn-flood-compare" role="group" aria-label="Chance of local-rain flooding reported in the district, now and under the scenario">
                {floodSide(spot.floodOutcome.baseline, 'Now')}
                {floodSide(spot.floodOutcome.scenario, 'Scenario')}
              </div>
            ) : <p className="scn-flood-nm">{cap(spot.floodOutcome.why)}.</p>}
            <details className="scn-flood-notes">
              <summary>How this chance is read</summary>
              <p>{spot.floodOutcome.wetness?.basis ? `Wetness: ${spot.floodOutcome.wetness.basis}.` : null}</p>
              {spot.floodOutcome.durationNote ? <p>{cap(spot.floodOutcome.durationNote)}.</p> : null}
              {spot.floodOutcome.display ? <p>{cap(spot.floodOutcome.display)}.</p> : null}
            </details>
          </aside>
        )}

        {spot?.outcomes?.days && (
          <div className="scn-mc" data-ui="ensemble-cards-v2">
            <header className="scn-mc-head">
              <div>
                <h4>How sure · ensemble members</h4>
                <p>Heat, cold and wind under this scenario across the forecast runs</p>
              </div>
              {spot.outcomes.members?.ok ? (
                <span className="scn-mc-chip">
                  {spot.outcomes.members.count} runs
                  {spot.outcomes.members.run ? ` · ${spot.outcomes.members.run}` : ''}
                </span>
              ) : null}
            </header>
            {spot.outcomes.members && !spot.outcomes.members.ok && (
              <p className="scn-mc-warn">{cap(spot.outcomes.members.why)}.</p>
            )}
            <div className="scn-mc-days" role="list" aria-label="Scenario levels by day across ensemble members">
              {spot.outcomes.days.map((d) => {
                const cell = (x, kind) => {
                  if (!x) return <span className="scn-mc-na">—</span>;
                  if (x.assumed) return <span className="scn-mc-tag set">set by you</span>;
                  if (!x.assessed) {
                    return (
                      <span className="scn-mc-tag na" title={x.why || undefined}>
                        {kind === 'wind' ? 'Not tested' : 'Not assessed'}
                      </span>
                    );
                  }
                  return (
                    <span className="scn-mc-level">
                      <LevelBadge level={x.level} word={x.word} />
                      {x.rangeWords && x.range?.[0] !== x.range?.[1] ? (
                        <span className="scn-mc-range">{x.rangeWords[0]}–{x.rangeWords[1]}</span>
                      ) : null}
                    </span>
                  );
                };
                return (
                  <article className="scn-mc-day" role="listitem" key={d.date}>
                    <h5>{d.date}</h5>
                    <dl>
                      <div><dt>Heat</dt><dd>{cell(d.heat, 'heat')}</dd></div>
                      <div><dt>Cold</dt><dd>{cell(d.cold, 'cold')}</dd></div>
                      <div><dt>Wind</dt><dd>{cell(d.wind, 'wind')}</dd></div>
                    </dl>
                  </article>
                );
              })}
            </div>
            <div className="scn-mc-footer">
              {spot.outcomes.flood ? (
                <div className="scn-mc-metric">
                  <span className="scn-mc-metric-k">
                    Local-rain flooding
                    {spot.outcomes.flood.day ? ` · ${spot.outcomes.flood.day}` : ''}
                  </span>
                  {spot.outcomes.flood.modelled ? (
                    <>
                      <b className="scn-mc-metric-v">{pctChance(spot.outcomes.flood.p)}</b>
                      <span className="scn-mc-metric-s">
                        mean of draws · 90% {pctChance(spot.outcomes.flood.range90?.[0])}–{pctChance(spot.outcomes.flood.range90?.[1])}
                        {spot.outcomes.flood.rate ? ` · ${spot.outcomes.flood.rate}` : ''}
                      </span>
                    </>
                  ) : (
                    <span className="scn-mc-tag na" title={spot.outcomes.flood.why || undefined}>{cap(spot.outcomes.flood.why) || 'Not modelled'}</span>
                  )}
                </div>
              ) : null}
              <div className="scn-mc-tags">
                <span className="scn-mc-tag na">Landslide · not modelled</span>
                <span className="scn-mc-tag na">Vegetation stress · not modelled</span>
              </div>
              <p className="scn-mc-note">
                {spot.outcomes.members?.ok
                  ? 'Range leaves out the lowest and highest tenth of the runs. '
                  : ''}
                Flood chance repeats the flood model 2,000 times over its own uncertainty; the same settings always give the same answer.
              </p>
            </div>
          </div>
        )}

      </section>

      {/* —— Advanced scientific scenario engine —— */}
      <section aria-label="NIGRAAN scientific scenario engine" className="cfe-section scenario-v8910 scenario-v8911 agn-scn113" id="cfeSection">
        <div className="cfe-card">
          <div className="cfe-head scenario-head">
            <div>
              <div className="cfe-eyebrow">ADVANCED SCIENTIFIC SCENARIO ENGINE</div>
              <h3>Baseline → Scenario → Change · <span>{baseline?.name || place.name}</span></h3>
              <p>Clone the active NIGRAAN state, re-run supported hazard equations, and explore advanced Earth-observation, atmospheric, land-form and exposure assumptions without contaminating operational forecasts or alerts.</p>
              <div style={{ fontSize: '0.75rem', lineHeight: 1.4, fontWeight: 650, marginTop: 4, color: '#5d6b76' }}>
                No decision subject is set, so this baseline is the location picker. Exploratory only — it is not bound to any asset or case.
              </div>
            </div>
            <div className="scenario-integrity">
              <span><i />Core equations preserved</span>
              <span><i />Advanced features separated</span>
              <span><i />Operational state protected</span>
            </div>
          </div>

          <div className="cfe-baseline-strip scenario-live-strip" aria-label="Current baseline inputs">
            {[
              ['Location', baseline?.name, 'active state'],
              ['Air temp', fmt(baseline?.inp.t, 1, '°C'), '2 m, instantaneous now · not today\'s maximum'],
              ['Humidity', fmt(baseline?.inp.hum, 0, '%'), '2 m'],
              ['Rain', fmt(baseline?.inp.rain, 1, ' mm/h'), 'current mm/h'],
              ['Gust', fmt(baseline?.inp.gust, 0, ' km/h'), 'km/h'],
              ['Wetness', num(baseline?.inp.api) != null ? fmt(baseline.inp.api * 100, 0, '%') : '—', 'antecedent'],
              ['Water balance', fmt(baseline?.inp.waterBalance, 1, ' mm'), 'P − ET₀'],
              ['VPD', fmt(baseline?.inp.vpd, 2, ' kPa'), 'kPa'],
            ].map(([label, value, small]) => (
              <div className="cfe-bm" key={label}><span>{label}</span><b>{value}</b><small>{small}</small></div>
            ))}
            {[
              [
                '850 hPa temp',
                baseline?.adv.t850Masked ? 'below ground' : fmt(baseline?.adv.liveT850, 1, '°C'),
                baseline?.adv.t850Masked
                  || (num(baseline?.adv.liveT850) != null
                    ? 'Open-Meteo · ~1.5 km up · air-mass diagnostic, not a surface temperature'
                    : 'Open-Meteo when available · air-mass diagnostic'),
              ],
              [
                'MSLP',
                fmt(baseline?.adv.liveMslp, 0, ' hPa'),
                num(baseline?.adv.liveMslp) != null ? 'Open-Meteo · mean sea level · not an anomaly' : 'Open-Meteo when available',
              ],
              ['Boundary layer', fmt(baseline?.adv.liveBlh, 0, ' m'), 'modelled m'],
              ['Built-up', num(baseline?.adv.builtUpPct) != null ? fmt(baseline.adv.builtUpPct, 0, '%') : '—', 'LCZ morphology'],
              ['Population density', num(baseline?.adv.popDensity) != null ? `${Math.round(baseline.adv.popDensity).toLocaleString()}/km²` : '—', 'district avg'],
            ].map(([label, value, small]) => (
              <div className="cfe-bm advanced" key={label}><span>{label}</span><b>{value}</b><small>{small}</small></div>
            ))}
          </div>

          <p style={{ fontSize: '0.75rem', lineHeight: 1.45, color: '#5d6b76', fontWeight: 650, margin: '6px 0 0' }}>
            More than one temperature appears on this screen and they are different quantities, not disagreeing estimates of one.
            <b> Air temp</b> above is the instantaneous 2 m value valid now.
            <b> 850 hPa temp</b> is the air mass about 1.5 km overhead. None of these is today’s daily maximum, which is what the heat thresholds are cut on.
          </p>

          <div className="scenario-mode-row">
            <div className="scenario-hazard-tabs" role="tablist" aria-label="Scenario pathway">
              {HAZARD_ORDER.map((id) => (
                <button key={id} type="button" className={hazard === id ? 'active' : ''} aria-selected={hazard === id} onClick={() => setHazard(id)}>
                  {id === 'multi' ? 'Multi-driver' : HAZARDS[id].label.replace(' stress', '').replace(' and gusts', '')}
                </button>
              ))}
            </div>
            <button className="cfe-sync" type="button" onClick={syncBaseline}>Sync current state</button>
          </div>

          <div className="scenario-boundary">{meta.boundary}</div>

          <div className="cfe-grid scenario-grid advanced-scenario-grid">
            <div className="cfe-controls scenario-controls">
              <div className="scenario-section-title">
                <div>
                  <h4>Scenario controls</h4>
                  <p>Core controls re-run the operational scientific pathway on a cloned state. Advanced controls create transparent diagnostic or exposure scenarios and never silently enter a core hazard score.</p>
                </div>
              </div>
              <div className="cfe-scenarios scenario-presets" role="group" aria-label="Scenario presets">
                {(PRESETS[hazard] || []).map((p) => (
                  <button key={p.key} type="button" className={preset === p.key ? 'on' : ''} aria-pressed={preset === p.key} onClick={() => applyEnginePreset(p)}>{p.label}</button>
                ))}
              </div>

              <details className="scenario-control-group core-group" open>
                <summary><span>Core hazard drivers</span><small>Consumed by the existing NIGRAAN equation</small></summary>
                <div className="scenario-dynamic-controls">
                  {(CORE_DEFS[hazard] || []).map((def) => {
                    const missing = def.optional === 'root' && num(baseline.inp.smRoot) == null;
                    return (
                      <ControlSlider
                        key={def.id}
                        def={def}
                        value={values[def.id] ?? baseControlValue(def, baseline)}
                        disabled={missing}
                        unavailable={missing}
                        onChange={(v) => setCoreValue(def.id, v)}
                      />
                    );
                  })}
                </div>
              </details>

              <details className="scenario-control-group" open>
                <summary><span>Earth Observation</span><small>Scenario-only until EO services are connected and validated</small></summary>
                <div className="scenario-dynamic-controls advanced-controls">
                  {ADV_GROUPS.eo.map((def) => (
                    <ControlSlider key={def.id} def={def} value={advanced[def.id] ?? baseControlValue(def, baseline)} onChange={(v) => setAdvValue(def.id, v)} />
                  ))}
                </div>
              </details>

              <details className="scenario-control-group" open>
                <summary><span>Atmosphere &amp; persistence</span><small>Live atmospheric context where available; scenario deltas remain non-operational</small></summary>
                <div className="scenario-dynamic-controls advanced-controls">
                  {ADV_GROUPS.atmosphere.map((def) => (
                    <ControlSlider key={def.id} def={def} value={advanced[def.id] ?? baseControlValue(def, baseline)} onChange={(v) => setAdvValue(def.id, v)} />
                  ))}
                </div>
              </details>

              <details className="scenario-control-group" open>
                <summary><span>Land, urban form &amp; exposure</span><small>Morphology and exposure do not become meteorological hazard</small></summary>
                <div className="scenario-dynamic-controls advanced-controls">
                  {ADV_GROUPS.exposure.map((def) => {
                    const unavailable = (def.optional === 'built' && num(baseline.adv.builtUpPct) == null)
                      || (def.optional === 'pop' && num(baseline.adv.popDensity) == null);
                    return (
                      <ControlSlider
                        key={def.id}
                        def={def}
                        value={advanced[def.id] ?? baseControlValue(def, baseline)}
                        unavailable={unavailable}
                        onChange={(v) => setAdvValue(def.id, v)}
                      />
                    );
                  })}
                </div>
              </details>

              <div className="scenario-assumption-box"><b>Assumption boundary.</b> {meta.boundary}</div>
              <div className="scenario-lock"><b>Isolation rule.</b> Core hazard controls are evaluated on a cloned input object. EO, atmospheric-context and exposure controls are reported separately unless the existing NIGRAAN engine already contains that dependency. No scenario value writes to live forecasts, hazard caches, alerts or operational evidence.</div>
            </div>

            <div className="cfe-results scenario-results" aria-live="polite">
              <div className="scenario-result-head">
                <div>
                  <h4>Core hazard response</h4>
                  <p>{hazard === 'multi' ? 'Parallel core pathways; no aggregate score.' : `Same ${meta.label.toLowerCase()} core pathway, cloned scenario inputs.`}</p>
                </div>
                <span className="scenario-maturity">{meta.maturity}</span>
              </div>
              <div className="agn-wi51"><p><b>What-if score</b> from NIGRAAN’s scenario model – for comparing options, not a tested forecast.</p></div>

              <div className="scenario-compare-grid">
                {engineEval?.single ? (
                  <ScoreCard label={`Baseline ${meta.label}`} base={engineEval.scen.baseScore ?? engineEval.base.score} scen={engineEval.scen.score} note={hazard === 'drought' ? 'Short-window screen; not SPI' : '0–100 screening; not probability'} />
                ) : (engineEval || []).map((row) => (
                  <ScoreCard key={row.h} label={HAZARDS[row.h].label} base={row.scen.baseScore ?? row.base.score} scen={row.scen.score} note="No cross-hazard aggregation." />
                ))}
              </div>

              <div className="scenario-pathway">
                {hazard === 'multi' ? (
                  <div><b>Compound handling</b><span>Parallel hazards only. No synthetic compound score or event probability is generated.</span></div>
                ) : (
                  <div><b>{meta.label} pathway</b><span>{engineEval?.scen?.raw?.top || 'Existing NIGRAAN equation'}</span></div>
                )}
              </div>

              <div className="scenario-driver-table agn-wi51-drivers">
                <table>
                  <thead><tr><th>Core driver</th><th>Baseline</th><th>Scenario</th><th>Scientific role</th></tr></thead>
                  <tbody>
                    {(engineEval?.single
                      ? (engineEval.scen.drivers || [])
                      : (engineEval || []).flatMap((row) => (row.scen.drivers || []).slice(0, 2).map((d) => [`${HAZARDS[row.h].label} · ${d[0]}`, d[1], d[2], d[3]]))
                    ).map((row, i) => (
                      <tr key={i}><td>{row[0]}</td><td>{row[1]}</td><td>{row[2]}</td><td>{row[3]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="scenario-explain">
                {engineEval?.single && num(engineEval.scen.baseScore ?? engineEval.base.score) != null && num(engineEval.scen.score) != null && Math.round(engineEval.scen.baseScore ?? engineEval.base.score) === Math.round(engineEval.scen.score)
                  ? <><b>No core-score change.</b> Core controls did run. The altered inputs either remain below the next response threshold or a held-constant pathway still governs. Advanced diagnostics below may still change because they are deliberately kept separate from the core score.</>
                  : hazard === 'multi'
                    ? <><b>Multi-driver mode preserves unlike quantities.</b> Flood, heat, wind and drought screening remain separate, with advanced diagnostics shown independently below.</>
                    : <><b>Core scenario response changed.</b> The delta comes from re-running the declared NIGRAAN pathway on cloned inputs. It is sensitivity, not forecast.</>}
              </div>

              <section className="scenario-advanced-results" aria-label="Advanced feature diagnostics">
                <div className="scenario-result-head advanced-head">
                  <div>
                    <h4>Advanced feature diagnostics</h4>
                    <p>Raw scenario signals and directional interpretation. These do not alter the core hazard score unless a validated pathway explicitly consumes them.</p>
                  </div>
                  <span className="scenario-maturity experimental">Experimental / contextual</span>
                </div>
                <div className="advanced-diagnostic-grid">
                  {diags.map((d) => (
                    <article key={d.title} className={`advanced-diagnostic${d.warn ? ' warn' : ''}`}>
                      <span>{d.title}</span>
                      <b>{d.state}</b>
                      <small>{d.raw}</small>
                      <i className="diag-state">{d.warn ? 'attention' : 'context'}</i>
                      <small>{d.note}</small>
                    </article>
                  ))}
                </div>
                <details className="scenario-driver-table advanced-table" style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 750, fontSize: '.85rem', color: '#154A4E' }}>The same diagnostics as a table (baseline, scenario, role)</summary>
                  <table>
                    <thead><tr><th>Feature</th><th>Baseline</th><th>Scenario</th><th>Role / status</th></tr></thead>
                    <tbody>
                      {ADV_DEFS.map((d) => {
                        const v = Object.prototype.hasOwnProperty.call(advanced, d.id) ? advanced[d.id] : baseControlValue(d, baseline);
                        const src = d.status === 'scenario' ? 'Scenario-only / no live EO service'
                          : d.status === 'context' ? ((d.id === 't850Delta' || d.id === 'mslpDelta' || d.id === 'blhPct') ? 'Live baseline where available + scenario assumption' : 'Scenario percentile assumption')
                            : (d.id === 'builtUpPct' ? baseline.adv.builtSource : baseline.adv.popSource);
                        return (
                          <tr key={d.id}>
                            <td>{d.label}</td>
                            <td>{advBaselineDisplay(d, baseline)}</td>
                            <td>{advScenarioDisplay(d, v, baseline)}</td>
                            <td>{d.role}<br /><small>{src}</small></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </details>
              </section>

              <section className="agn-scn113-served" aria-live="polite" aria-label="Result from the NIGRAAN server">
                <h4>Results from the NIGRAAN server · {place.name}</h4>
                {spot?.ok ? (
                  <>
                    <table className="s113-t">
                      <thead><tr><th>Outcome</th><th>Today’s forecast</th><th>Your scenario</th></tr></thead>
                      <tbody>
                        {[['heat', 'Heat stress'], ['cold', 'Cold stress'], ['rain', 'Rain'], ['drought', 'Drought']].map(([key, label]) => {
                          const now = peakOf(baseHaz[key]);
                          const next = peakOf(scenHaz[key]);
                          return (
                            <tr key={key}>
                              <td>{label}</td>
                              <td><LevelBadge level={now.level} word={now.word} why={now.why} /></td>
                              <td><LevelBadge level={next.level} word={next.word} why={next.why} /></td>
                            </tr>
                          );
                        })}
                        {spot.floodOutcome && (
                          <tr>
                            <td>Local-rain flooding, district chance</td>
                            <td>{spot.floodOutcome.baseline?.modelled ? pctChance(spot.floodOutcome.baseline.p) : '—'}</td>
                            <td>
                              {spot.floodOutcome.scenario?.modelled
                                ? `${pctChance(spot.floodOutcome.scenario.p)} (90%: ${pctChance(spot.floodOutcome.scenario.p5)} to ${pctChance(spot.floodOutcome.scenario.p95)})`
                                : '—'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    <p className="scn-foot">Spread over the server’s random draws (the same settings always give the same answer).</p>
                  </>
                ) : (
                  <p className="scn-foot">Pick a stress test above to load the server scenario result for this place.</p>
                )}
              </section>

              <div className="scenario-sweep">
                <div className="scenario-sweep-head">
                  <div>
                    <h4>Uncertainty simulation · Monte Carlo sensitivity sweep</h4>
                    <p>Uniformly samples selected variables between baseline and the declared scenario boundary. Core-score percentiles and advanced-variable envelopes are reported separately. They are <b>not event probabilities</b>.</p>
                  </div>
                  <div className="scenario-sweep-actions">
                    <select aria-label="Number of sensitivity samples" value={sweepN} onChange={(e) => setSweepN(Number(e.target.value))}>
                      <option value={250}>250 runs</option>
                      <option value={500}>500 runs</option>
                      <option value={1000}>1,000 runs</option>
                    </select>
                    <button type="button" onClick={runSweep}>Run sweep</button>
                  </div>
                </div>
                <div className="scenario-sweep-vars" aria-label="Sensitivity variables">
                  {(CORE_DEFS[hazard] || []).map((d) => (
                    <label key={d.id}>
                      <input type="checkbox" checked={sweepCore.includes(d.id)} onChange={(e) => setSweepCore((prev) => (e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id)))} />
                      {d.label}
                    </label>
                  ))}
                  {ADV_DEFS.filter((d) => d.type !== 'checkbox').map((d) => (
                    <label key={d.id} className="advanced">
                      <input type="checkbox" checked={sweepAdv.includes(d.id)} onChange={(e) => setSweepAdv((prev) => (e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id)))} />
                      {d.label}
                    </label>
                  ))}
                </div>
                <div className="scenario-sweep-result">
                  {!sweepResult && <span>Run a sweep to calculate the core screening envelope and selected advanced-variable envelopes.</span>}
                  {sweepResult && (
                    <div>
                      {sweepResult.pathways.map((p) => (
                        <div key={p.hazard} style={{ marginBottom: 10 }}>
                          <b>{p.label}</b>
                          <div className="sweep-kpis">
                            <span><small>P10</small><b>{p.p10 == null ? '—' : Math.round(p.p10)}</b></span>
                            <span><small>P50</small><b>{p.p50 == null ? '—' : Math.round(p.p50)}</b></span>
                            <span><small>P90</small><b>{p.p90 == null ? '—' : Math.round(p.p90)}</b></span>
                            <span><small>Range</small><b>{p.min == null ? '—' : `${Math.round(p.min)}–${Math.round(p.max)}`}</b></span>
                          </div>
                        </div>
                      ))}
                      {sweepResult.advancedRows.length > 0 && (
                        <table className="sweep-advanced-table">
                          <thead><tr><th>Advanced variable</th><th>P10</th><th>P50</th><th>P90</th></tr></thead>
                          <tbody>
                            {sweepResult.advancedRows.map((row) => (
                              <tr key={row.d.id}>
                                <td>{row.d.label}</td>
                                <td>{row.p10?.toFixed?.(2) ?? '—'}</td>
                                <td>{row.p50?.toFixed?.(2) ?? '—'}</td>
                                <td>{row.p90?.toFixed?.(2) ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <p className="scn-foot">{sweepResult.n} samples · envelopes are sensitivity ranges, not event probabilities.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="cfe-provenance scenario-provenance">
                <h4>Scientific boundary</h4>
                <div className="cfe-provenance-grid">
                  <div className="cfe-provenance-item"><span>Core calculation</span><b>Sandboxed re-execution of existing pathway</b></div>
                  <div className="cfe-provenance-item"><span>Advanced features</span><b>Separate diagnostics / scenario assumptions</b></div>
                  <div className="cfe-provenance-item"><span>Probability status</span><b className="warn">No calibrated event probability</b></div>
                  <div className="cfe-provenance-item"><span>Validation status</span><b className="warn">{meta.validation}</b></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
