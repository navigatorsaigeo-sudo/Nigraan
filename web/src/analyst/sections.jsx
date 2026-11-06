import { useEffect, useMemo, useState } from 'react';
import { getJson } from '../start/api.js';
import { usePlace } from './place.js';
import ForecastView from './ForecastView.jsx';
import ClientRisk from './ClientRisk.jsx';
import Operations from './Operations.jsx';
import Scenario from './Scenario.jsx';

const PROMPTS = [
  ['Weather now', 'What is the weather like right now at this place?'],
  ['Hazards now', 'Which hazards matter here today?'],
  ['Forecast', 'What should I expect over the next few days weather-wise?'],
  ['Hazards ahead', 'Any hazards I should watch over the next few days?'],
  ['Combined', 'Brief me on weather and hazards here — now and over the next few days.'],
];

function splitAskCells(line) {
  return String(line || '').replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function isAskTableSep(line) {
  const cells = splitAskCells(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseAskAnswer(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\|.+\|/.test(line.trim()) && i + 1 < lines.length && isAskTableSep(lines[i + 1].trim())) {
      const headers = splitAskCells(line.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.+\|/.test(lines[i].trim())) {
        rows.push(splitAskCells(lines[i].trim()));
        i += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }
    const bar = line.match(/^([^\n:]{0,40}?):\s*([▁▂▃▄▅▆▇█\s]{3,})\s*$/);
    if (bar) {
      const levels = [...bar[2].replace(/\s/g, '')].map((ch) => '▁▂▃▄▅▆▇█'.indexOf(ch)).filter((n) => n >= 0);
      if (levels.length >= 2) {
        blocks.push({ type: 'bars', label: bar[1].trim() || 'Series', values: levels.map((n) => (n + 1) / 8) });
        i += 1;
        continue;
      }
    }
    if (!line.trim() && !blocks.length) { i += 1; continue; }
    const chunk = [];
    while (i < lines.length) {
      const next = lines[i];
      if (/^\|.+\|/.test(next.trim()) && i + 1 < lines.length && isAskTableSep(lines[i + 1].trim())) break;
      if (/^[^\n:]{0,40}:\s*[▁▂▃▄▅▆▇█\s]{3,}\s*$/.test(next)) break;
      chunk.push(next);
      i += 1;
      if (!next.trim() && chunk.some((row) => row.trim())) break;
    }
    const prose = chunk.join('\n').trim();
    if (prose) blocks.push({ type: 'text', text: prose });
  }
  return blocks.length ? blocks : [{ type: 'text', text: String(text || '') }];
}

function AskAnswer({ text }) {
  const blocks = parseAskAnswer(text);
  return (
    <div className="an-answer-body">
      {blocks.map((block, index) => {
        if (block.type === 'table') {
          return (
            <div key={index} className="an-ask-table-wrap">
              <table className="an-ask-table">
                <thead><tr>{block.headers.map((cell, c) => <th key={c}>{cell}</th>)}</tr></thead>
                <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
        if (block.type === 'bars') {
          return (
            <div key={index} className="an-ask-bars" aria-label={block.label}>
              <span className="an-ask-bars-label">{block.label}</span>
              <div className="an-ask-bars-row">
                {block.values.map((value, v) => (
                  <i key={v} style={{ height: `${Math.max(8, Math.round(value * 56))}px` }} />
                ))}
              </div>
            </div>
          );
        }
        return <p key={index}>{block.text}</p>;
      })}
    </div>
  );
}

export function ForecastTab() {
  return <ForecastView />;
}

export function RiskTab() {
  return <ClientRisk />;
}

export function OperationsTab() {
  return <Operations />;
}

export function ScenarioTab() {
  return <Scenario />;
}

export function AskTab() {
  const { place, bundle } = usePlace('default,hazardCount');
  const [prompt, setPrompt] = useState('');
  const [thread, setThread] = useState([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('');
  useEffect(() => { getJson('/api/ai/status').then((body) => setMode(body?.mode || body?.provider || '')).catch(() => {}); }, []);
  function ask(text) {
    const value = (text || prompt).trim();
    if (!value) return;
    setBusy(true);
    setThread((rows) => [...rows, { role: 'you', text: value }]);
    setPrompt('');
    const now = bundle?.now || {};
    const bars = bundle?.parts?.hazardCount?.v?.days?.[0]?.bars || [];
    const context = {
      place: place ? { lat: place.lat, lon: place.lon, name: place.name } : null,
      location: place?.name || null,
      point: place ? { lat: place.lat, lon: place.lon } : null,
      temperatureC: now.tempC ?? null,
      humidityPct: now.rhPct ?? null,
      windKmh: now.windKmh ?? null,
      condition: now.condition || bundle?.shown?.now?.text || null,
      hazardsNow: bars.map((bar) => `${bar.name} ${bar.word}`).filter(Boolean).join('; ') || null,
    };
    fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agn-view': 'customer' },
      body: JSON.stringify({ prompt: value, context }),
    }).then((response) => response.json()).then((body) => {
      const textOut = body?.answer || body?.why || (body?.error === 'provider_error' ? 'The language model could not answer just now. Try again in a moment.' : null) || body?.error || 'No answer was returned.';
      setThread((rows) => [...rows, { role: 'ai', text: textOut }]);
    }).catch(() => setThread((rows) => [...rows, { role: 'ai', text: 'Ask NIGRAAN did not answer.' }])).finally(() => setBusy(false));
  }
  const heat = bundle?.parts?.hazardCount?.v?.days?.[0]?.bars?.find((bar) => bar.key === 'heat');
  return (
    <section className="an-pane" style={{ '--ac': 'var(--an-ask, #1E5A6E)', '--an-accent': 'var(--an-ask, #1E5A6E)' }}>
      <div className="an-hero">
        <div className="an-eye">ASK NIGRAAN</div>
        <h2>AI Decision Intelligence</h2>
        <p>Ask about current weather, hazards, and the forecast for places in Pakistan. Answers come from NIGRAAN data for this place.{mode ? ` Mode: ${mode}.` : ''}</p>
      </div>
      <div className="an-metrics">
        <span><small>Location</small><b>{place?.name || 'Selected location'}</b></span>
        <span><small>Weather</small><b>{bundle?.shown?.now?.text || (bundle?.now ? `${Math.round(bundle.now.tempC)}°C` : 'Loading')}</b></span>
        <span><small>Hazard signal</small><b>{heat ? `${heat.name} ${heat.word}` : 'Screening layer'}</b></span>
      </div>
      <div className="an-thread">
        {!thread.length && <p><b>NIGRAAN Climate Analyst</b><br />Ask about weather now, hazards now, the forecast, forecast hazards, or a short combined brief — for places in Pakistan only.</p>}
        {thread.map((row, index) => (
          row.role === 'ai'
            ? <div key={index} className="an-answer"><b>NIGRAAN</b><AskAnswer text={row.text} /></div>
            : <p key={index}><b>You</b><br />{row.text}</p>
        ))}
      </div>
      <div className="an-days">
        {PROMPTS.map(([label, text]) => <button key={label} type="button" onClick={() => ask(text)} disabled={busy}><b>{label}</b></button>)}
      </div>
      <form className="an-ask" onSubmit={(event) => { event.preventDefault(); ask(); }}>
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-label="Ask NIGRAAN" rows={3} maxLength={700} placeholder="Ask about weather or hazards for a place in Pakistan" />
        <button type="submit" className="an-pri" disabled={busy}>{busy ? 'Asking…' : 'Ask AI'}</button>
      </form>
      <p className="an-note">Pakistan only. Answers use NIGRAAN weather and hazard data. The interface does not issue warnings or invent unavailable values; a person should review operational decisions.</p>
    </section>
  );
}

export function MethodsTab() {
  const [gate, setGate] = useState(null);
  const [health, setHealth] = useState(null);
  const [checks, setChecks] = useState(null);
  const [skill, setSkill] = useState(null);
  const [busy, setBusy] = useState(false);
  const [browse, setBrowse] = useState('gate');
  const [query, setQuery] = useState('');
  const [gateType, setGateType] = useState('all');

  function load(force = false) {
    getJson('/api/report/gate-status', { force }).then(setGate).catch(() => setGate({ error: true }));
    getJson('/health', { force }).then(setHealth).catch(() => setHealth({ error: true }));
    getJson('/api/skill', { force }).then(setSkill).catch(() => setSkill({ error: true }));
  }

  async function runChecks(force = false) {
    setBusy(true);
    const [live, gateBody, pool, grades] = await Promise.all([
      getJson('/health', { force }).catch(() => ({ error: true })),
      getJson('/api/report/gate-status', { force }).catch(() => ({ error: true })),
      getJson('/api/pool/point?lat=33.656&lon=73.048', { force }).catch(() => ({ error: true })),
      getJson('/api/verification/grades', { force }).catch(() => ({ error: true })),
    ]);
    if (gateBody && !gateBody.error) setGate(gateBody);
    if (live && !live.error) setHealth(live);
    setChecks([
      { name: 'Server health', pass: live && !live.error && live.status !== 'down', detail: live?.status || 'no answer' },
      { name: 'Model gate', pass: Array.isArray(gateBody?.entries) && gateBody.entries.length > 0, detail: Array.isArray(gateBody?.entries) ? `${gateBody.entries.length} entries` : 'no answer' },
      { name: 'Multi-model pool', pass: Array.isArray(pool?.hourly) && pool.hourly.length > 0, detail: Array.isArray(pool?.hourly) ? `${pool.hourly.length} hours` : 'no answer' },
      { name: 'Verification grades', pass: grades && !grades.error && grades.__status !== 403, detail: grades?.__status === 403 ? 'held for the operator view' : (grades?.error ? 'did not answer' : 'answered') },
    ]);
    setBusy(false);
  }

  useEffect(() => {
    runChecks();
    getJson('/api/skill').then(setSkill).catch(() => setSkill({ error: true }));
  }, []);

  const entries = Array.isArray(gate?.entries) ? gate.entries : [];
  const parameters = Array.isArray(skill?.parameters) ? skill.parameters : [];
  const serverOk = !(health?.ok === false || health?.error);
  const serverLabel = serverOk ? String(health?.status || health?.ok || 'up') : 'No answer';
  const passCount = Array.isArray(checks) ? checks.filter((row) => row.pass).length : null;
  const q = query.trim().toLowerCase();

  const gateTypes = useMemo(() => {
    const counts = new Map();
    for (const entry of entries) {
      const key = entry.productType || entry.status || 'Other';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const filteredGate = useMemo(() => entries.filter((entry) => {
    const type = entry.productType || entry.status || 'Other';
    if (gateType !== 'all' && type !== gateType) return false;
    if (!q) return true;
    const hay = [
      entry.name,
      entry.id,
      type,
      Array.isArray(entry.limitations) ? entry.limitations[0] : '',
    ].join(' ').toLowerCase();
    return hay.includes(q);
  }), [entries, gateType, q]);

  const filteredParams = useMemo(() => parameters.filter((row) => {
    if (!q) return true;
    return `${row.label || ''} ${row.measurand || ''}`.toLowerCase().includes(q);
  }), [parameters, q]);

  return (
    <section className="an-pane an-methods">
      <div className="mv-hero">
        <div>
          <span className="mv-eyebrow">Methods &amp; Verification</span>
          <h2>Health and skill</h2>
          <p>Scientific assurance for the active result. Agents only read; they never change a served value.</p>
        </div>
        <div className="mv-hero-status">
          <span><i aria-hidden="true" /> Read-only</span>
          <span><i aria-hidden="true" /> Gate cited by reports</span>
          <span><i aria-hidden="true" /> Values protected</span>
        </div>
      </div>

      <div className="mv-kpis">
        <article className="mv-kpi">
          <span>Server</span>
          <b>{serverLabel}</b>
          <small>{health?.version ? `Build ${health.version}` : (serverOk ? 'Answering' : 'No answer')}</small>
        </article>
        <article className="mv-kpi">
          <span>Model gate</span>
          <b>{entries.length || '—'}</b>
          <small>{gate?.asOf ? `As of ${gate.asOf}` : 'Loading…'}</small>
        </article>
        <article className="mv-kpi">
          <span>Measurands</span>
          <b>{parameters.length || '—'}</b>
          <small>{parameters.length ? 'Stated measures' : 'Loading…'}</small>
        </article>
        <article className="mv-kpi mv-kpi-act">
          <span>Live checks</span>
          <b>{passCount == null ? '—' : `${passCount}/${checks.length}`}</b>
          <div className="mv-actions">
            <button type="button" onClick={() => load(true)}>Refresh</button>
            <button type="button" className="pri" disabled={busy} onClick={() => runChecks(true)}>{busy ? 'Running…' : 'Re-run'}</button>
          </div>
        </article>
      </div>

      <div className="mv-maturity" title="Science maturity legend">
        <span data-tone="validated"><b>Validated</b> observed skill</span>
        <span data-tone="calibrated"><b>Calibrated</b> corrected</span>
        <span data-tone="anchored"><b>Anchored</b> formulation only</span>
        <span data-tone="experimental"><b>Experimental</b> not a probability</span>
      </div>

      <div className="mv-grid">
        <article className="mv-card">
          <div className="mv-card-head">
            <h3>Assurance</h3>
            <span className="mv-chip">{passCount == null ? 'Running…' : `${passCount} passed`}</span>
          </div>
          {checks ? (
            <div className="mv-checks">
              {checks.map((row) => (
                <div key={row.name} className={`mv-check ${row.pass ? 'pass' : 'fail'}`}>
                  <span className="dot" aria-hidden="true" />
                  <div>
                    <b>{row.name}</b>
                    <small>{row.detail}</small>
                  </div>
                  <em>{row.pass ? 'Pass' : 'Fail'}</em>
                </div>
              ))}
            </div>
          ) : (
            <p className="mv-idle">Running assurance checks…</p>
          )}
        </article>

        <article className="mv-card mv-browse">
          <div className="mv-card-head">
            <h3>Browse</h3>
            <div className="mv-tabs" role="tablist" aria-label="Browse methods">
              <button type="button" role="tab" aria-selected={browse === 'gate'} className={browse === 'gate' ? 'on' : ''} onClick={() => { setBrowse('gate'); setQuery(''); }}>Gate · {entries.length}</button>
              <button type="button" role="tab" aria-selected={browse === 'skill'} className={browse === 'skill' ? 'on' : ''} onClick={() => { setBrowse('skill'); setQuery(''); setGateType('all'); }}>Measurands · {parameters.length}</button>
            </div>
          </div>

          <div className="mv-tools">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={browse === 'gate' ? 'Filter models or limitations…' : 'Filter parameters…'}
              aria-label="Filter list"
            />
            {browse === 'gate' && gateTypes.length > 0 && (
              <div className="mv-filters">
                <button type="button" className={gateType === 'all' ? 'on' : ''} onClick={() => setGateType('all')}>All · {entries.length}</button>
                {gateTypes.slice(0, 5).map(([type, count]) => (
                  <button key={type} type="button" className={gateType === type ? 'on' : ''} onClick={() => setGateType(type)}>{type} · {count}</button>
                ))}
              </div>
            )}
          </div>

          {browse === 'gate' ? (
            <>
              <div className="mv-table-wrap mv-scroll">
                <table className="mv-table">
                  <thead><tr><th>Model</th><th>Status</th><th>Limitation</th></tr></thead>
                  <tbody>
                    {filteredGate.length ? filteredGate.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.name || entry.id}</td>
                        <td>{entry.productType || entry.status || '—'}</td>
                        <td>{Array.isArray(entry.limitations) ? entry.limitations[0] : '—'}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={3}>{entries.length ? 'No models match this filter.' : 'Reading the model gate…'}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mv-foot">Showing {filteredGate.length} of {entries.length}</p>
            </>
          ) : (
            <>
              {skill?.statement && <p className="mv-note">{skill.statement}</p>}
              <div className="mv-table-wrap mv-scroll">
                <table className="mv-table">
                  <thead><tr><th>Parameter</th><th>What is measured</th></tr></thead>
                  <tbody>
                    {filteredParams.length ? filteredParams.map((row) => (
                      <tr key={row.id}><td>{row.label}</td><td>{row.measurand}</td></tr>
                    )) : (
                      <tr><td colSpan={2}>{parameters.length ? 'No parameters match this filter.' : 'Loading the skill sheet…'}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mv-foot">Showing {filteredParams.length} of {parameters.length}</p>
            </>
          )}
        </article>
      </div>
    </section>
  );
}

