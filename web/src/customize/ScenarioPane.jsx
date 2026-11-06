import { useEffect, useState } from 'react';
import { getJson } from '../start/api.js';
import { WORDS, fixed } from './model.js';

const HAZ = [['heat', 'Heat'], ['cold', 'Cold'], ['wind', 'Wind'], ['rain', 'Rain']];

function cells(block, key) {
  const hazard = block?.hazards?.[key];
  return (hazard?.days || []).map((day) => (day.assessed === false || day.level == null || day.level < 0 ? '—' : (WORDS[day.level] || day.level)));
}

export default function ScenarioPane({ place }) {
  const [preset, setPreset] = useState('baseline');
  const [custom, setCustom] = useState({ dT: 1, rainMm: 50, gustKmh: 60 });
  const [useCustom, setUseCustom] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!place) return undefined;
    let live = true;
    setBusy(true);
    const query = new URLSearchParams({
      lat: place.lat.toFixed(5),
      lon: place.lon.toFixed(5),
    });
    if (!useCustom) query.set('preset', preset);
    else {
      if (custom.dT) query.set('dT', String(custom.dT));
      if (custom.rainMm > 0) query.set('rainMm', String(custom.rainMm));
      if (custom.gustKmh > 0) query.set('gustKmh', String(custom.gustKmh));
    }
    getJson(`/api/scenario?${query}`).then((body) => { if (live) setAnswer(body); }).catch(() => {
      if (live) setAnswer({ ok: false, why: 'the server did not answer the scenario run' });
    }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [place, preset, useCustom, custom.dT, custom.rainMm, custom.gustKmh]);

  const presets = answer?.presets || {};
  const spot = answer?.places?.[0];
  const outcomes = spot?.outcomes;

  return (
    <section className="cz-step">
      <div className="cz-hero tone-lab">
        <h1>Scenario</h1>
        <span>What if it gets hotter, rains harder or blows stronger?</span>
        <p>{place?.name || 'Choose a place'}</p>
      </div>
      <div className="cz-card">
        <h2>Stress test · today and the next 3 days</h2>
        <p>The scenario is run on the NIGRAAN server, on the same forecast hours and with the same scoring as every other section. It shows hazard levels only: no days stopped and no loss figure.</p>
        <div className="cz-chips">
          {Object.entries(presets).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={!useCustom && preset === id} onClick={() => { setUseCustom(false); setPreset(id); }}>{label || id}</button>
          ))}
          <button type="button" aria-pressed={useCustom} onClick={() => setUseCustom(true)}>Your own change</button>
        </div>
        {useCustom && (
          <div className="cz-row">
            <label>Temperature change °C <input type="number" step="0.5" value={custom.dT} onChange={(event) => setCustom({ ...custom, dT: +event.target.value })} /></label>
            <label>Rain day mm <input type="number" min="0" value={custom.rainMm} onChange={(event) => setCustom({ ...custom, rainMm: +event.target.value })} /></label>
            <label>Gust km/h <input type="number" min="0" value={custom.gustKmh} onChange={(event) => setCustom({ ...custom, gustKmh: +event.target.value })} /></label>
          </div>
        )}
        {busy && <p className="cz-muted">Running the scenario…</p>}
        {!busy && answer && answer.ok === false && <p>{answer.why}</p>}
        {spot && (
          <>
            <p>{answer.presetLabel || answer.preset || 'Custom'} · {answer.exposureOnly}</p>
            <table className="cz-table">
              <thead><tr><th>Hazard</th><th>Forecast</th><th>Scenario</th></tr></thead>
              <tbody>
                {HAZ.map(([key, label]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>{cells(spot.baseline, key).join(' · ') || '—'}</td>
                    <td>{cells(spot.scenario, key).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {spot.why && <p className="cz-muted">{spot.why}</p>}
            {outcomes?.days?.length > 0 && (
              <div>
                <h3>Member range</h3>
                <table className="cz-table">
                  <thead><tr><th>Day</th><th>Heat</th><th>Cold</th><th>Wind</th></tr></thead>
                  <tbody>
                    {outcomes.days.map((day) => (
                      <tr key={day.lead ?? day.date}>
                        <td>{day.date || `+${day.lead}d`}</td>
                        {['heat', 'cold', 'wind'].map((key) => <td key={key}>{day[key]?.range ? day[key].range.join('–') : '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {outcomes?.flood?.modelled && <p>Flood chance from the member runs: {fixed((outcomes.flood.p || 0) * 100, 0)}%.</p>}
          </>
        )}
      </div>
    </section>
  );
}
