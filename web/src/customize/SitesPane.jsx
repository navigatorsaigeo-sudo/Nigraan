import { useEffect, useMemo, useState } from 'react';
import { getJson, viewName } from '../start/api.js';
import {
  HAZARDS, SECTORS, WORDS, fixed, hazardOn, partValue, partWhy, sectorName,
} from './model.js';

function postJson(url, body) {
  return fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', 'x-agn-view': viewName() },
    body: JSON.stringify(body),
  }).then((res) => res.json().catch(() => ({ ok: false, why: `HTTP ${res.status}` })));
}

export function useReport() {
  const [report, setReport] = useState(null);
  const [note, setNote] = useState('');
  function issue(body, label) {
    setNote(`Making the ${label}…`);
    setReport({ title: label, state: 'wait' });
    postJson('/api/report/generate', body).then((answer) => {
      if (!answer?.ok) {
        setNote(answer?.why || 'The report could not be made right now.');
        setReport({ title: label, state: 'fail', text: answer?.why || 'The report could not be made right now.' });
        return;
      }
      setNote('');
      setReport({ title: answer.title || label, state: 'ok', html: answer.html, pdf: answer.pdf, id: answer.id });
    }).catch(() => {
      setNote('The report could not be made right now.');
      setReport({ title: label, state: 'fail', text: 'The report could not be made right now.' });
    });
  }
  return { report, setReport, note, issue };
}

export function ReportDialog({ report, onClose }) {
  if (!report) return null;
  return (
    <div className="cz-report" role="dialog" aria-label={report.title || 'Report'}>
      <header>
        <b>{report.title || 'Report'}</b>
        <span>
          {report.pdf && <a href={report.pdf}>Download PDF</a>}
          <button type="button" onClick={onClose}>Close</button>
        </span>
      </header>
      {report.state === 'wait' && <p>Making the report on the server…</p>}
      {report.state === 'fail' && <p>{report.text}</p>}
      {report.state === 'ok' && report.html && <iframe title={report.title || 'Report'} src={report.html} />}
    </div>
  );
}

export default function SitesPane({ place, bundle, ranked, onPick, reportApi }) {
  const [sector, setSector] = useState('commercial');
  const [csvText, setCsvText] = useState('');
  const [status, setStatus] = useState('');
  const [ops, setOps] = useState(null);
  const screening = partValue(bundle, 'siteScreening');
  const risk = partValue(bundle, 'siteRisk');
  const levels = partValue(bundle, 'levels');
  const record = partValue(bundle, 'placeRecord');
  const site = ranked.find((row) => place && row.lat.toFixed(5) === place.lat.toFixed(5) && row.lon.toFixed(5) === place.lon.toFixed(5));
  const counts = useMemo(() => {
    const map = {};
    ranked.forEach((row) => { map[row.sector] = (map[row.sector] || 0) + 1; });
    return map;
  }, [ranked]);
  const activeSector = risk?.bySector?.[sector];

  useEffect(() => {
    if (!site?.type) { setOps(null); return undefined; }
    let live = true;
    setOps(null);
    getJson(`/api/site/operations?type=${encodeURIComponent(site.type)}`).then((template) => {
      if (!live || !template?.limits?.length) { if (live) setOps(template || { limits: [] }); return; }
      postJson('/api/limits/evaluate', {
        origin: 'customize',
        assets: [{
          id: site.name,
          name: site.name,
          lat: site.lat,
          lon: site.lon,
          limits: template.limits.map((row) => ({
            variable: row.variable,
            limit: row.limit,
            dir: row.dir,
            durationMin: row.durationMin || null,
            action: row.action,
            consequence: row.operation,
            authority: row.sourceText,
          })),
        }],
      }).then((answer) => { if (live) setOps({ ...template, evaluation: answer }); });
    }).catch(() => { if (live) setOps({ error: true }); });
    return () => { live = false; };
  }, [site]);

  function onFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then((text) => { setCsvText(text); setStatus(`${file.name} is ready. Save it to replace the list on this computer.`); });
  }

  function saveList() {
    setStatus('Saving…');
    fetch('/customize/sites', {
      method: 'POST',
      headers: { 'content-type': 'text/csv', 'x-agn-view': viewName() },
      body: csvText,
    }).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setStatus(body.why || body.error || 'The list was not saved. Saving is allowed from this computer only.'); return; }
      setStatus(`Saved ${body.saved} sites. Reload the page to screen the new list.`);
    }).catch(() => setStatus('The list was not saved.'));
  }

  function template() {
    const text = 'name,lat,lon,province,city,type,floor\n';
    const blob = new Blob([text], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ajg-sites-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  const days = levels?.days || [];
  const evalAsset = ops?.evaluation?.assets?.[0] || ops?.evaluation?.results?.[0] || null;
  const evalRows = evalAsset?.rows || evalAsset?.limits || evalAsset?.breaches || [];

  return (
    <section className="cz-step">
      <div className="cz-hero tone-sites">
        <h1>Sites & operations</h1>
        <span>What does it hit, and what should you do?</span>
        <p>{bundle?.place?.name || place?.name || 'Choose a place'}</p>
      </div>
      <div className="cz-card">
        <h2>Sites & operations</h2>
        <p className="cz-flow"><span>Hazard</span> → <span>Sector</span> → <span>Assets and operations</span> → <span>Action</span></p>
        <div className="cz-chips">
          {SECTORS.filter(([id]) => counts[id]).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={sector === id} onClick={() => setSector(id)}>{label} · {counts[id]}</button>
          ))}
        </div>
        <div className="cz-row">
          <button type="button" className="cz-btn" onClick={() => reportApi.issue({ lat: place.lat, lon: place.lon, name: place.name, kind: 'site_assessment', section: 'assets', edition: 'customize' }, 'site report')}>Site report</button>
          <button type="button" className="cz-btn" onClick={() => reportApi.issue({ lat: place.lat, lon: place.lon, name: place.name, kind: 'site_assessment', section: 'assets', edition: 'customize' }, 'sector briefing')}>Sector briefing</button>
          <span className="cz-muted">{reportApi.note}</span>
        </div>
        <h3>{sectorName(sector)}</h3>
        {!activeSector && <p className="cz-muted">{partWhy(bundle, 'siteRisk') || 'Loading the sector account…'}</p>}
        {activeSector?.facts?.length > 0 && (
          <ul className="cz-facts">{activeSector.facts.map((fact) => <li key={fact.id || fact.text}>{fact.text}</li>)}</ul>
        )}
        {activeSector?.note && <p>{activeSector.note}</p>}
      </div>
      <div className="cz-grid">
        <div className="cz-card">
          <h3>Site screening at this point</h3>
          <table className="cz-table">
            <thead><tr><th>Check</th><th>Design values here</th><th>Forecast</th><th>Result</th></tr></thead>
            <tbody>
              {(screening?.rows || []).map((row) => (
                <tr key={row.parameter}>
                  <td>{row.parameter}</td>
                  <td>{row.values}</td>
                  <td>{row.forecast}</td>
                  <td>{row.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!screening?.rows?.length && <p className="cz-muted">{partWhy(bundle, 'siteScreening') || 'Loading…'}</p>}
        </div>
        <div className="cz-card">
          <h3>Hazard levels at this site</h3>
          <table className="cz-table">
            <thead>
              <tr><th>Hazard</th>{days.slice(0, 4).map((day) => <th key={day.date}>{String(day.date || '').slice(5)}</th>)}</tr>
            </thead>
            <tbody>
              {HAZARDS.map(([key, name]) => (
                <tr key={key}>
                  <td>{name}</td>
                  {days.slice(0, 4).map((day) => {
                    const row = hazardOn(day, key);
                    return <td key={day.date}>{row?.word || WORDS[row?.level] || '—'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {record?.accuracy && <p className="cz-muted">Place record held{record.at ? ` · ${String(record.at).slice(0, 16)}` : ''}.</p>}
        </div>
      </div>
      <div className="cz-card">
        <h3>Operations at this site · {site?.type || 'pick an AJG site'}</h3>
        {!site && <p className="cz-muted">Choose a site from the list below. The operating limits follow that site’s type.</p>}
        {!!ops?.limits?.length && (
          <table className="cz-table">
            <thead><tr><th>Operation</th><th>Limit</th><th>Action</th></tr></thead>
            <tbody>
              {ops.limits.map((row) => (
                <tr key={row.variable + row.operation}>
                  <td>{row.operation}</td>
                  <td>{row.dir} {row.limit}{row.durationMin ? ` for ${row.durationMin} min` : ''}</td>
                  <td>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {Array.isArray(evalRows) && evalRows.length > 0 && <p className="cz-muted">{evalRows.length} evaluated limit rows returned for this site.</p>}
        {ops?.error && <p className="cz-muted">The operating limits did not load.</p>}
      </div>
      <div className="cz-card">
        <h3>AJG Supplies · all sites</h3>
        <p>Each site is checked at its own location. Worst in the next four days is listed first. Upload a CSV with name, lat, lon, province, city, type, floor to replace the demonstration list.</p>
        <div className="cz-row">
          <label className="cz-btn">Upload sites (CSV)<input type="file" accept=".csv,text/csv" hidden onChange={onFile} /></label>
          {csvText && <button type="button" className="cz-btn" onClick={saveList}>Save as AJG’s site list</button>}
          <button type="button" className="cz-btn" onClick={template}>CSV template</button>
          <button type="button" className="cz-btn" onClick={() => reportApi.issue({
            kind: 'network',
            edition: 'customize',
            section: 'assets',
            sites: ranked.slice(0, 60).map((row) => ({ lat: row.lat, lon: row.lon, name: row.name, sector: row.sector })),
          }, 'network report')}>Network report</button>
          <span className="cz-muted">{status}</span>
        </div>
        <table className="cz-table">
          <thead><tr><th>Site</th><th>Sector</th><th>Worst in 4 days</th><th>When</th></tr></thead>
          <tbody>
            {ranked.map((row) => (
              <tr key={`${row.lat},${row.lon}`} className={site && row.name === site.name ? 'on' : ''} onClick={() => onPick(row)}>
                <td><b>{row.name}</b><div className="cz-muted">{row.city}</div></td>
                <td>{sectorName(row.sector)}</td>
                <td>{row.worst ? (row.worst.level >= 0 ? `${row.worst.word} · ${row.worst.hazard}` : 'no data') : '…'}</td>
                <td>{row.worst?.date ? row.worst.date.slice(5) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="cz-muted">{ranked.length} sites{ranked[0] ? ` · highest now ${ranked[0].worst?.word || 'still screening'} at ${fixed(ranked[0].lat, 3)}, ${fixed(ranked[0].lon, 3)}` : ''}</p>
      </div>
    </section>
  );
}
