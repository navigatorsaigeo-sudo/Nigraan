import { useEffect, useState } from 'react';
import { getJson } from '../start/api.js';
import { fixed, partValue, shortDate } from './model.js';

function Chain({ bundle }) {
  const steps = bundle?.build?.steps;
  const list = Array.isArray(steps) ? steps : [];
  if (!list.length) return <p className="cz-muted">The temperature chain for this hour is still loading.</p>;
  return (
    <ol className="cz-chain">
      {list.map((step, index) => {
        if (typeof step === 'string') return <li key={index}><b>{step}</b></li>;
        return (
          <li key={index}>
            <b>{step.step || step.name || `Step ${index + 1}`}</b>
            {step.deltaC != null && <span>{step.deltaC > 0 ? '+' : ''}{fixed(step.deltaC)} °C</span>}
          </li>
        );
      })}
    </ol>
  );
}

export default function ProofPane({ place, bundle, onOpen }) {
  const [gate, setGate] = useState(null);
  const [fleet, setFleet] = useState(null);
  const [reports, setReports] = useState([]);
  const past = partValue(bundle, 'past30');
  const station = bundle?.station;
  const shown = bundle?.shown?.now;

  useEffect(() => {
    let live = true;
    getJson('/api/report/gate-status').then((body) => { if (live) setGate(body); }).catch(() => {});
    getJson('/api/fleet/status').then((body) => { if (live) setFleet(body); }).catch(() => {});
    getJson('/api/reports?edition=customize&limit=20').then((body) => {
      if (!live) return;
      const list = body?.reports || body?.items || (Array.isArray(body) ? body : []);
      setReports(list);
    }).catch(() => {});
    return () => { live = false; };
  }, [place]);

  const daily = past?.daily || [];
  const summary = past?.summary;

  return (
    <section className="cz-step">
      <div className="cz-hero tone-proof">
        <h1>Proof & report</h1>
        <span>Why can you trust this at your site?</span>
        <p>{bundle?.place?.name || place?.name || ''}</p>
      </div>
      <div className="cz-card">
        <h2>Why this forecast holds at your exact place</h2>
        <p>{shown?.label || shown?.text || 'The hour on screen is the served value for this point.'}</p>
        <h3>How this hour’s temperature is made</h3>
        <Chain bundle={bundle} />
      </div>
      <div className="cz-grid">
        <div className="cz-card">
          <h3>How each part is tested</h3>
          {!gate && <p className="cz-muted">Loading the release gate…</p>}
          {gate && <p>{gate.why || gate.summary || gate.status || (gate.ok === false ? 'A release check is not passing.' : 'The release gate answered.')}</p>}
          {gate?.checks && (
            <ul className="cz-facts">
              {Object.entries(gate.checks).slice(0, 8).map(([key, value]) => (
                <li key={key}><b>{key}</b> {typeof value === 'object' ? (value.ok === false ? 'not passing' : 'passing') : String(value)}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="cz-card">
          <h3>Live observation check</h3>
          {station?.ok && station.reading?.tempC != null && (
            <p>A checked local reading supports this place{` · ${fixed(station.reading.tempC)} °C`}.</p>
          )}
          {station?.ok && station.reading?.tempC == null && (
            <p>A checked local reading supports this place.</p>
          )}
          {station && station.ok === false && <p className="cz-muted">No live temperature measurement near this place right now.</p>}
          {!station && fleet && <p className="cz-muted">Observation network status loaded.</p>}
        </div>
      </div>
      <div className="cz-card">
        <h3>Past 30 days at this place</h3>
        {!past && <p className="cz-muted">Loading the past 30 days…</p>}
        {summary && typeof summary === 'object' && (
          <p>
            {summary.from || past.from} to {summary.to || past.to}
            {summary.rainMm != null ? ` · rain ${fixed(summary.rainMm, 0)} mm` : ''}
            {summary.tmaxC != null ? ` · highest ${fixed(summary.tmaxC)} °C` : ''}
          </p>
        )}
        {!!daily.length && (
          <table className="cz-table">
            <thead><tr><th>Day</th><th>Max °C</th><th>Min °C</th><th>Rain mm</th></tr></thead>
            <tbody>
              {daily.slice(-10).map((day) => (
                <tr key={day.date || day.day}>
                  <td>{shortDate(day.date || day.day)}</td>
                  <td>{fixed(day.tmaxC ?? day.tx)}</td>
                  <td>{fixed(day.tminC ?? day.tn)}</td>
                  <td>{fixed(day.rainMm ?? day.pr, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="cz-card">
        <h3>Reports issued</h3>
        <p>The Site report and the Sector briefing are made on Sites & operations, and the Network report is made on the all-sites card there. Each one is kept here as soon as it is made.</p>
        {!reports.length && <p className="cz-muted">No Customize report has been issued yet.</p>}
        <ul className="cz-facts">
          {reports.map((row) => (
            <li key={row.id}>
              <button type="button" className="cz-text" onClick={() => onOpen({ title: row.title || row.id, state: 'ok', html: row.html || `/api/reports/${row.id}`, pdf: row.pdf })}>{row.title || row.id}</button>
              {row.at && <span> {String(row.at).slice(0, 16)}</span>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
