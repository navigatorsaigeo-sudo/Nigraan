import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getJson, viewName } from '../start/api.js';
import { useOperator } from './operator.js';

function headers() {
  return { 'x-agn-view': viewName() };
}

const BUILDER = [
  ['weather_impact', 'Operational weather impact brief'],
  ['data_gap', 'Data gap brief'],
  ['engineering_note', 'Engineering data-readiness note'],
  ['site_assessment', 'Asset case report (decision chain, risk cards, tracker)'],
  ['portfolio', 'Portfolio case report (every asset on the server)'],
  ['executive_brief', 'Board brief (one page from the case documents)'],
];

export function Reports({ open, onClose, place }) {
  const operator = useOperator();
  const dialogRef = useRef(null);
  const [rows, setRows] = useState(null);
  const [picked, setPicked] = useState({});
  const [note, setNote] = useState('');
  const [reading, setReading] = useState(null);
  const [kind, setKind] = useState(BUILDER[0][0]);
  const [title, setTitle] = useState(BUILDER[0][1]);
  const [purpose, setPurpose] = useState('Preliminary screening and prioritisation for detailed assessment');
  const [folded, setFolded] = useState(false);
  const [issued, setIssued] = useState(null);
  const [builderNote, setBuilderNote] = useState('');
  const [reopenId, setReopenId] = useState('');

  function load() {
    setRows(null);
    getJson('/api/reports?edition=main&limit=1000').then((body) => {
      setRows(body?.ok ? body.reports || [] : []);
      if (!body?.ok) setNote('The reports library is not available right now.');
    }).catch(() => { setRows([]); setNote('The reports library is not available right now.'); });
  }

  useEffect(() => { if (open) load(); }, [open, operator]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return undefined;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    return undefined;
  }, [open]);

  if (!open) return null;
  const ids = Object.keys(picked).filter((id) => picked[id]);
  const packReady = ids.length >= 2 && ids.length <= 12;

  function toggle(id) {
    setPicked((current) => ({ ...current, [id]: !current[id] }));
  }

  function show(id, title) {
    setReading({ id, title: title || 'Report' });
  }

  function download(row) {
    const path = row.pdf || `/api/reports/${encodeURIComponent(row.id)}`;
    const name = row.pdf ? `${row.id}.pdf` : `${row.id}.html`;
    fetch(path, { cache: 'no-store', headers: headers() }).then(async (res) => {
      if (!res.ok) throw new Error('missing');
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
    }).catch(() => setNote(`The report ${row.id} could not be read from the library.`));
  }

  function archive(id) {
    fetch(`/api/reports/${encodeURIComponent(id)}/archive`, { method: 'POST', headers: headers() }).then((res) => res.json()).then((body) => {
      setNote(body?.ok ? `Archived ${id}. It is kept on the server and no longer listed.` : `The report ${id} was not archived.`);
      load();
    }).catch(() => setNote(`The report ${id} was not archived.`));
  }

  function pack() {
    if (!packReady) return;
    setReading({ title: 'Report pack', src: `/api/reports/pack?ids=${ids.map(encodeURIComponent).join(',')}` });
  }

  function issue(nextKind, label) {
    if (!place || !Number.isFinite(+place.lat) || !Number.isFinite(+place.lon)) {
      setBuilderNote('Pick a place first. The report is made for the place on screen.');
      return;
    }
    setBuilderNote('Making the report on the server…');
    fetch('/api/report/generate', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', 'x-agn-view': viewName() },
      body: JSON.stringify({
        lat: place.lat,
        lon: place.lon,
        name: place.name,
        kind: nextKind,
        section: 'reports',
        edition: 'main',
      }),
    }).then((res) => res.json().catch(() => ({ ok: false }))).then((body) => {
      if (!body?.ok) {
        setBuilderNote(body?.why || 'The report could not be made right now.');
        return;
      }
      setIssued(body);
      setBuilderNote('');
      setReading({ id: body.id, title: body.title || label });
      load();
    }).catch(() => setBuilderNote('The report could not be made right now.'));
  }

  return (
    <>
    {createPortal(
    <dialog ref={dialogRef} className="rep" aria-label="My reports" onClose={onClose} onClick={(event) => { if (event.target === dialogRef.current) onClose(); }}>
      <div className="rep-h">
        <h2>My reports</h2>
        <button type="button" className="rep-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="rep-body">
        <h3>Reports library</h3>
        <p>Every report issued from this page is made from the button in its section (Forecast, Client Risk, Operations) and stored as soon as it is made. Open, download or archive a report, or select 2 to 12 for one full pack.</p>
        <div className="rep-tools">
          <span>{ids.length ? `${ids.length} selected${ids.length < 2 ? ': choose at least 2' : ids.length > 12 ? ': a pack holds at most 12' : ''}` : 'Select 2 to 12 reports for a full pack.'}</span>
          <button type="button" onClick={load}>Refresh</button>
          <button type="button" className="go" disabled={!packReady} onClick={pack}>Full pack</button>
        </div>
        {note && <p className="rep-note">{note}</p>}
        {!rows && <p>Loading stored reports…</p>}
        {rows && rows.length === 0 && <p>No report has been issued yet. Reports are made from the buttons in their sections and appear here when they are printed or downloaded.</p>}
        {rows && <p className="rep-note">{rows.length} stored report{rows.length === 1 ? '' : 's'}{operator ? ', including operator reports.' : '.'}</p>}
        {rows && rows.length > 0 && (
          <div className="rep-scroll">
          <table>
            <thead><tr><th /><th>Report</th><th>Place</th><th>Issued</th><th>Verdict</th><th /></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><input type="checkbox" checked={!!picked[row.id]} aria-label={`Add ${row.title || row.id} to the pack`} onChange={() => toggle(row.id)} /></td>
                  <td><b>{row.title || row.kind || row.id}</b><small>{row.id}</small></td>
                  <td>{row.place || 'Not available'}</td>
                  <td>{row.atPkt || ''}</td>
                  <td>{row.verdict || 'Not available'}</td>
                  <td className="rep-act">
                    <button type="button" onClick={() => show(row.id, row.title || row.id)}>Open</button>
                    <button type="button" onClick={() => download(row)}>Download</button>
                    <button type="button" onClick={() => archive(row.id)}>Archive</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        <section className="rep-card">
          <h3>Other documents</h3>
          <p>Documents that are not made from one section.</p>
          <div className="rep-other">
            <button type="button" onClick={() => issue('assurance_pack', 'Methodology and assurance pack')}>
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="5" y="3" width="12" height="18" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M8 8h6M8 12h6M8 16h4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
              Methodology &amp; assurance pack
            </button>
            <span>How every figure in a NIGRAAN report is produced, its evidence and its limits.</span>
          </div>
        </section>
        {operator && (
          <section className="rep-build" aria-label="Report builder (operator)">
            <article className={folded ? 'is-folded' : ''}>
              <div className="rep-build-h">
                <div>
                  <p className="rep-oph">Operator</p>
                  <h3>Report builder (operator)</h3>
                  <p>Operator documents built from the current assessment. Client reports are made from the buttons in their sections and stored in the library above.</p>
                </div>
                <button type="button" className="fold" onClick={() => setFolded((value) => !value)}>{folded ? 'Open form' : 'Fold form'}</button>
              </div>
              <div className="rep-form">
                <label>Report type
                  <select value={kind} onChange={(event) => {
                    const next = BUILDER.find((row) => row[0] === event.target.value);
                    setKind(event.target.value);
                    if (next) setTitle(next[1]);
                  }}>
                    {BUILDER.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
                <label>Report title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
                <label className="full">Decision purpose<input value={purpose} onChange={(event) => setPurpose(event.target.value)} /></label>
              </div>
              <div className="rep-actions">
                <button type="button" className="go" onClick={() => issue(kind, title)}>Generate preview</button>
                <button type="button" onClick={() => (issued?.id ? download({ id: issued.id }) : setBuilderNote('No document frozen yet. Generate a preview; every export then issues that same document.'))}>Download HTML (archive)</button>
                <button type="button" className="print" onClick={() => (issued?.id ? setReading({ id: issued.id, title: issued.title || title }) : setBuilderNote('No document frozen yet. Generate a preview; every export then issues that same document.'))}>Save as PDF / Print</button>
              </div>
              <p className="rep-freeze">{issued?.id ? `Issued ${issued.id}. Copy, HTML and print use this document.` : 'No document frozen yet. Generate a preview; every export then issues that same document.'}</p>
              <div className="rep-reopen">
                <select value={reopenId} onChange={(event) => setReopenId(event.target.value)} aria-label="Stored documents">
                  <option value="">No stored documents yet</option>
                  {(rows || []).map((row) => <option key={row.id} value={row.id}>{row.title || row.kind} · {row.atPkt || row.id}</option>)}
                </select>
                <button type="button" onClick={() => {
                  const row = (rows || []).find((item) => item.id === reopenId);
                  if (row) setReading({ id: row.id, title: row.title || row.id });
                }}>Re-open issued document</button>
              </div>
              <p className="rep-warn">The report is generated from the current front-end state. Operational use requires frozen source snapshots, model versions, Decision Register references and server-side audit logging.</p>
              {builderNote && <p className="rep-note">{builderNote}</p>}
            </article>
            <article className="rep-preview">
              {issued?.id ? <p><b>{issued.title || title}</b><br />{issued.summary || issued.id}</p> : (
                <div className="rep-none">
                  <b>No frozen document</b>
                  <ul><li>the report that was frozen here has been cleared because the project changed (project reset). Generate a new report for the current client, asset, hazard and decision time.</li></ul>
                </div>
              )}
            </article>
          </section>
        )}
      </div>
    </dialog>,
    document.body,
    )}
    {reading && <ReportView key={reading.id || reading.src || 'report'} reading={reading} operator={operator} onClose={() => setReading(null)} />}
    </>
  );
}

function ReportView({ reading, operator, onClose }) {
  const ref = useRef(null);
  const frameRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    try { if (!el.open) el.showModal(); } catch (err) { el.dataset.err = String(err); }
    const closed = () => onCloseRef.current();
    el.addEventListener('close', closed);
    return () => { el.removeEventListener('close', closed); };
  }, []);
  const src = reading.src || `/api/reports/${encodeURIComponent(reading.id)}${operator ? '?view=operator' : ''}`;
  const pdf = reading.id && /^NGR-/.test(reading.id)
    ? `/api/reports/${encodeURIComponent(reading.id)}.pdf?download=1${operator ? '&view=operator' : ''}`
    : null;
  return createPortal(
    <dialog ref={ref} className="repview" aria-label="Report">
      <div className="bar">
        <b>{reading.title || 'Report'}{reading.id ? ` · ${reading.id}` : ''}</b>
        <button type="button" onClick={() => { try { frameRef.current?.contentWindow?.focus(); frameRef.current?.contentWindow?.print(); } catch { /* the report has not loaded */ } }}>Print</button>
        {pdf && <a href={pdf} download={`${reading.id}.pdf`}>Download PDF</a>}
        <button type="button" onClick={() => onCloseRef.current()}>Close</button>
      </div>
      <iframe ref={frameRef} title={reading.title || 'The report'} src={src} />
    </dialog>,
    document.body,
  );
}
