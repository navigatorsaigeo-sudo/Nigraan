import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getJson } from '../start/api.js';

export const CONSOLE_TARGETS = {
  handover: { label: 'Operational handover' },
  sequence: { label: 'Backend sequence' },
  integration: { label: 'Integration' },
  urban: { label: 'Urban heat' },
};

const SEQUENCE = {
  title: 'v78.8 identity, permission and persistence sequence',
  sub: 'Scientific consistency corrections are active. Orange items require services outside a standalone HTML.',
  steps: [
    ['1', 'District integrity', 'Operations uses worst-tehsil district roll-up, driving tehsil and spatial coverage.', 'frontend'],
    ['2', 'Verification integrity', 'Archive diagnostic is separated from lead-specific skill and cannot change live models.', 'frontend'],
    ['3', 'Assessment evidence', 'Calculation ID, valid time, input snapshot and JSON evidence export are active.', 'frontend'],
    ['4', 'Scenario governance', 'CMIP6 remains context only until bias correction and engineering integration exist.', 'mixed'],
    ['5', 'Identity and persistence services', 'Connect an identity provider, tenant directory, durable stores, audit ledger and workflow approvals.', 'backend'],
  ],
};

const URBAN_C12 = {
  why: 'The urban heat cell map showed no skill against independent stations (Karachi and Lahore, 11 stations: rank correlation 0.005, and a larger error than assuming no difference), so it is withheld in all of Pakistan.',
  rule: "Nothing is served unless it beats the current value (no urban-rural difference) on held-out data.",
  releaseWhen: "A held-out test at independent stations in which the cell map beats 'no difference' (lower error, confidence interval of the paired difference below 0) and ranks stations (rank correlation interval above 0).",
};

const HANDOVER_ACTIONS = [
  ['posture', 'Final posture', 'GET', '/api/v1/handover/posture'],
  ['checklist', 'Checklist', 'GET', '/api/v1/handover/checklist'],
  ['attestations', 'Attestations', 'GET', '/api/v1/handover/attestations?limit=200'],
  ['dossiers', 'Dossiers', 'GET', '/api/v1/handover/dossiers?limit=50'],
  ['create', 'Generate dossier', 'POST', '/api/v1/handover/dossiers', { note: 'v81.0 final handover candidate dossier' }],
  ['decision', 'Final decision', 'POST', '/api/v1/handover/release-decision', null],
  ['latest', 'Latest decision', 'GET', '/api/v1/handover/release-decision/latest'],
  ['runbook', 'Runbook', 'GET', '/api/v1/handover/runbook'],
];

const EMPTY_HINT = '{\n  "ready": true,\n  "hint": "Choose an action above."\n}';
const MAX_JSON = 24000;

function localHost() {
  try {
    return /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname);
  } catch {
    return false;
  }
}

function authHeaders() {
  const headers = { 'x-agn-view': 'operator', Accept: 'application/json' };
  if (localHost()) headers.Authorization = 'Bearer agn-dev-token';
  return headers;
}

async function api(method, path, body, signal) {
  const res = await fetch(path, {
    method,
    cache: 'no-store',
    signal,
    headers: {
      ...authHeaders(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = json?.error?.code || res.status;
    const message = json?.error?.message || `Request failed (${res.status})`;
    const err = new Error(message);
    err.code = code;
    err.body = json;
    throw err;
  }
  return json;
}

function plainError(error) {
  if (error?.name === 'AbortError') return 'Cancelled.';
  const code = error?.code || '';
  const message = String(error?.message || error || '');
  if (/AUTH|401/.test(`${code} ${message}`)) {
    return localHost()
      ? `The server refused the local operator session (${message}).`
      : 'Operator sign-in required: these controls answer an operator identity, and the local session works only on the server machine itself.';
  }
  return message || 'The request failed.';
}

function formatOut(value) {
  if (value == null) return EMPTY_HINT;
  if (typeof value === 'string') return value.length > MAX_JSON ? `${value.slice(0, MAX_JSON)}\n… truncated` : value;
  try {
    const text = JSON.stringify(value, null, 2);
    if (!text) return EMPTY_HINT;
    return text.length > MAX_JSON ? `${text.slice(0, MAX_JSON)}\n… truncated` : text;
  } catch {
    return '{"error":"Could not display this result."}';
  }
}

function Shell({ title, eyebrow, sub, tone = 'handover', onClose, children }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') closeRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return createPortal(
    <div
      className={`op-console-back tone-${tone}`}
      role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) closeRef.current?.(); }}
    >
      <div className={`op-console tone-${tone}`} role="dialog" aria-modal="true" aria-labelledby="op-console-title">
        <button type="button" className="op-console-x" aria-label="Close" onClick={() => closeRef.current?.()}>×</button>
        {eyebrow && <div className="op-console-eye">{eyebrow}</div>}
        <h2 id="op-console-title">{title}</h2>
        {sub && <div className="op-console-sub">{sub}</div>}
        {children}
        <div className="op-console-foot">
          <button type="button" className="op-console-close" onClick={() => closeRef.current?.()}>Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function JsonOut({ text, note }) {
  return (
    <>
      {note ? <p className="op-console-note" role="status">{note}</p> : null}
      <pre className="op-console-pre">{text}</pre>
    </>
  );
}

function useAbortable() {
  const ctrl = useRef(null);
  useEffect(() => () => { try { ctrl.current?.abort(); } catch { /* ignore */ } }, []);
  function next() {
    try { ctrl.current?.abort(); } catch { /* ignore */ }
    ctrl.current = new AbortController();
    return ctrl.current.signal;
  }
  return next;
}

function HandoverConsole({ onClose }) {
  const [text, setText] = useState(EMPTY_HINT);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const dossierId = useRef(null);
  const signalOf = useAbortable();

  async function run(id) {
    const action = HANDOVER_ACTIONS.find(([key]) => key === id);
    if (!action) return;
    const [, label, method, path, body] = action;
    const signal = signalOf();
    setBusy(id);
    setNote(`${label}…`);
    try {
      let payload = body;
      let url = path;
      if (id === 'decision') {
        let dos = dossierId.current;
        if (!dos) {
          const created = await api('POST', '/api/v1/handover/dossiers', { note: 'v81.0 final handover candidate dossier' }, signal);
          dos = created?.data?.dossier_id || created?.data?.dossierId || null;
          dossierId.current = dos;
        }
        if (!dos) throw new Error('Generate a dossier before recording a release decision.');
        payload = {
          dossier_id: dos,
          confirmed: true,
          note: 'Final candidate decision; unresolved production blockers retained.',
        };
        url = '/api/v1/handover/release-decision';
      }
      const json = await api(method, url, payload, signal);
      if (id === 'create') {
        dossierId.current = json?.data?.dossier_id || json?.data?.dossierId || dossierId.current;
      }
      setText(formatOut(json?.data ?? json));
      setNote('');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setText(formatOut(error.body || { error: plainError(error) }));
      setNote(plainError(error));
    } finally {
      setBusy('');
    }
  }

  return (
    <Shell
      tone="handover"
      eyebrow="NIGRAAN 1.0 · SCIENTIFIC CORRECTION"
      title="Production acceptance and operational handover"
      sub="Final governed candidate only. It consolidates evidence and preserves a no-go decision until operational providers, production identity, managed infrastructure, independent validation and organizational approval are verifiably connected."
      onClose={onClose}
    >
      <div className="op-console-actions">
        {HANDOVER_ACTIONS.map(([id, label]) => (
          <button key={id} type="button" disabled={!!busy} onClick={() => { run(id); }}>{label}</button>
        ))}
      </div>
      <JsonOut text={text} note={note} />
    </Shell>
  );
}

function SequenceConsole({ onClose }) {
  return (
    <Shell
      tone="sequence"
      eyebrow="SCIENTIFIC CONSISTENCY"
      title={SEQUENCE.title}
      sub={SEQUENCE.sub}
      onClose={onClose}
    >
      <div className="op-console-seq">
        {SEQUENCE.steps.map(([n, name, detail, kind]) => (
          <div className="op-seq-row" key={n} data-kind={kind}>
            <i>{n}</i>
            <div>
              <strong>{name}</strong>
              <span>{detail}</span>
            </div>
            <em>{kind}</em>
          </div>
        ))}
      </div>
    </Shell>
  );
}

function slimHealth(body) {
  if (!body || typeof body !== 'object') return body;
  return {
    status: body.status,
    role: body.role,
    service: body.service,
    serviceVersion: body.serviceVersion,
    apiVersion: body.apiVersion,
    productionReady: body.productionReady,
    disk: body.disk,
    storeWrites: body.storeWrites && {
      failing: body.storeWrites.failing,
      lastError: body.storeWrites.lastError,
    },
    warm: body.warm,
    warmFailed: body.warmFailed,
    time: body.time,
  };
}

function IntegrationConsole({ onClose }) {
  const [url, setUrl] = useState(() => window.location.origin);
  const [text, setText] = useState(() => formatOut({
    configured: true,
    mode: localHost() ? 'development-token' : 'unconfigured',
    baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
    note: localHost()
      ? 'This machine may use the development token for operator APIs.'
      : 'Operator APIs need a real identity off this machine.',
  }));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const signalOf = useAbortable();

  async function health() {
    const signal = signalOf();
    setBusy('health');
    setNote('Health check…');
    try {
      const body = await getJson('/api/health').catch(() => getJson('/health'));
      if (signal.aborted) return;
      setText(formatOut({
        mode: localHost() ? 'development-connected' : 'remote',
        baseUrl: url,
        identity: localHost() ? { token: 'agn-dev-token', actor: 'dev-admin' } : null,
        health: slimHealth(body),
      }));
      setNote('');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setText(formatOut({ error: plainError(error) }));
      setNote(plainError(error));
    } finally {
      setBusy('');
    }
  }

  async function probe() {
    const signal = signalOf();
    setBusy('probe');
    setNote('Contract probe…');
    try {
      const [healthBody, posture] = await Promise.all([
        getJson('/api/health').catch(() => getJson('/health')),
        api('GET', '/api/v1/handover/posture', undefined, signal).catch((error) => ({ ok: false, error: plainError(error) })),
      ]);
      if (signal.aborted) return;
      setText(formatOut({
        baseUrl: url,
        health: slimHealth(healthBody),
        handoverPosture: posture?.data ?? posture,
        loopback: localHost(),
      }));
      setNote('');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setText(formatOut({ error: plainError(error) }));
      setNote(plainError(error));
    } finally {
      setBusy('');
    }
  }

  return (
    <Shell
      tone="integration"
      eyebrow="NIGRAAN 1.0 · BACKEND INTEGRATION"
      title="Integration candidate console"
      sub="Connects only to the supplied local development backend. It uses a server-derived development identity and does not represent production OIDC, managed secrets, a managed database, validated model service or operational deployment."
      onClose={onClose}
    >
      <label className="op-console-label">
        Local backend URL
        <input value={url} onChange={(event) => setUrl(event.target.value)} />
      </label>
      <div className="op-console-actions">
        <button type="button" className="pri" disabled={!!busy} onClick={() => { health(); }}>Health check</button>
        <button type="button" disabled={!!busy} onClick={() => { probe(); }}>Run contract probe</button>
      </div>
      <JsonOut text={text} note={note} />
    </Shell>
  );
}

function UrbanConsole({ onClose }) {
  const [text, setText] = useState(() => formatOut({
    schema: 'agn.urban-heat-c12.v1',
    assessed: false,
    status: 'not assessed (no tested skill)',
    why: URBAN_C12.why,
    rule: URBAN_C12.rule,
    releaseWhen: URBAN_C12.releaseWhen,
  }));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const signalOf = useAbortable();

  async function posture() {
    const signal = signalOf();
    setBusy(true);
    setNote('Reading backend posture…');
    try {
      const json = await api('GET', '/api/v1/urban-heat/posture', undefined, signal);
      setText(formatOut(json?.data ?? json));
      setNote('');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setText(formatOut(error.body || { error: plainError(error) }));
      setNote(plainError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      tone="urban"
      eyebrow="URBAN HEAT · NOT ASSESSED"
      title="Urban heat microclimate and Local Climate Zone correction"
      sub={<><b>Not assessed (no tested skill).</b> {URBAN_C12.why}</>}
      onClose={onClose}
    >
      <div className="op-console-method"><b>Rule</b><span>{URBAN_C12.rule}</span></div>
      <div className="op-console-method"><b>Served again when</b><span>{URBAN_C12.releaseWhen}</span></div>
      <div className="op-console-actions">
        <button type="button" disabled={busy} onClick={() => { posture(); }}>Backend posture</button>
      </div>
      <JsonOut text={text} note={note} />
    </Shell>
  );
}

const PANELS = {
  handover: HandoverConsole,
  sequence: SequenceConsole,
  integration: IntegrationConsole,
  urban: UrbanConsole,
};

export default function OperatorConsoles({ consoleKey, onClose }) {
  const Panel = PANELS[consoleKey];
  if (!Panel) return null;
  return <Panel onClose={onClose} />;
}
