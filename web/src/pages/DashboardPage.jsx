import { useEffect, useState } from 'react';
import { go } from '../nav.js';
import { noteLocked, unlockGate, useGate } from '../gate.js';

async function gateApi(method, body) {
  const res = await fetch('/api/dashboard/gate', {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export default function DashboardPage() {
  const gate = useGate();
  const [status, setStatus] = useState(null);
  const [denied, setDenied] = useState(false);
  const [token, setToken] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [used, setUsed] = useState(false);

  async function load() {
    const result = await gateApi('GET');
    if (result.status === 403) {
      setDenied(true);
      setStatus(null);
      return;
    }
    setDenied(false);
    setStatus(result.data);
  }

  useEffect(() => { load(); }, []);

  async function savePassword(event) {
    event.preventDefault();
    setBusy('password');
    setNote('');
    const res = await fetch('/api/dashboard/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setBusy('');
    setPassword('');
    if (!res.ok) {
      setNote('That password was not accepted.');
      return;
    }
    load();
  }

  async function issue() {
    setBusy('issue');
    setNote('');
    const result = await gateApi('POST', { action: 'issue' });
    setBusy('');
    if (!result.ok || !result.data.token) {
      setNote(result.status === 401 ? 'Enter the dashboard password before issuing a token.' : 'The token could not be issued.');
      if (result.status === 401) load();
      return;
    }
    setToken(result.data.token);
    setCopied(false);
    setUsed(false);
    setStatus((prev) => ({
      ...prev,
      authed: true,
      configured: true,
      locked: false,
      hasToken: true,
      issuedAt: result.data.issuedAt,
      sessions: Array.isArray(result.data.sessions) ? result.data.sessions : [],
    }));
    noteLocked();
    setNote('This token is shown once. Use it here, or enter it on another browser. Computers that enter it appear below.');
  }

  async function copyToken() {
    const text = token;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '0';
      area.style.left = '0';
      document.body.appendChild(area);
      area.focus();
      area.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      area.remove();
    }
    setCopied(ok);
    setNote(ok ? 'Copied.' : 'Select the token above and copy it.');
  }

  async function useHere() {
    setBusy('use');
    const result = await unlockGate(token);
    setBusy('');
    setUsed(!!result.open);
    setNote(result.open ? 'This browser can now open Operator mode and Customize.' : result.error);
    if (result.open) load();
  }

  async function lock() {
    setBusy('lock');
    const result = await gateApi('POST', { action: 'lock' });
    setBusy('');
    if (!result.ok) {
      setNote(result.status === 403 ? 'The dashboard can lock only on this computer.' : 'The lock did not take.');
      return;
    }
    setToken('');
    setStatus((prev) => ({
      ...prev,
      authed: true,
      configured: true,
      locked: true,
      hasToken: false,
      issuedAt: null,
      sessions: Array.isArray(result.data.sessions) ? result.data.sessions : (prev?.sessions || []),
    }));
    noteLocked();
    setNote('Locked. Operator mode and Customize are closed on every computer that had the token. The previous token no longer works.');
  }

  const locked = !status || status.locked !== false;
  const sessions = Array.isArray(status?.sessions) ? status.sessions : [];

  function when(value) {
    if (!value) return '';
    return String(value).replace('T', ' ').slice(0, 19) + ' UTC';
  }

  return (
    <div className="gate-page">
      <section className="gate-card gate-dash">
        <p className="gate-kicker">NIGRAAN dashboard</p>
        <h1>Operator mode and Customize</h1>
        <p>A password is required before a token can be issued or locked. Entering it signs in this browser only. Other people using the app stay signed out.</p>
        {denied && <p className="gate-error">This dashboard is available on this computer only.</p>}
        {!denied && status && !status.configured && (
          <>
            <p>Set <b>NIGRAAN_DASHBOARD_PASSWORD</b> in the server file <b>nigraan-local/.env</b>. The page cannot create this password. Until that value is set, nobody can issue a token.</p>
            <div className="gate-actions">
              <button type="button" onClick={() => go('/')}>Back</button>
            </div>
          </>
        )}
        {!denied && status?.configured && !status.authed && (
          <form onSubmit={savePassword}>
            <p>Enter the dashboard password from the server. This signs in this browser only and does not issue a token.</p>
            <label>
              Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" aria-label="Dashboard password" />
            </label>
            {note && <p className="gate-error">{note}</p>}
            <div className="gate-actions">
              <button type="submit" className="gate-primary" disabled={busy === 'password'}>{busy === 'password' ? 'Checking…' : 'Continue'}</button>
              <button type="button" onClick={() => go('/')}>Back</button>
            </div>
          </form>
        )}
        {!denied && status?.authed && (
          <>
            <p className={`gate-state${locked ? ' is-locked' : ' is-open'}`}>{locked ? 'Locked' : 'Token issued'}</p>
            <p>Operator mode and Customize open only in a browser that enters the token. Issuing it does not unlock everyone else.</p>
            {status?.issuedAt && !locked && <p className="gate-meta">Issued {when(status.issuedAt)}</p>}
            <div className="gate-actions">
              <button type="button" className="gate-primary" disabled={!!busy} onClick={issue}>{busy === 'issue' ? 'Issuing…' : 'Issue token'}</button>
              <button type="button" disabled={!!busy || (locked && !gate.open)} onClick={lock}>{busy === 'lock' ? 'Locking…' : 'Lock again'}</button>
              <button type="button" disabled={!!busy} onClick={load}>Refresh</button>
              <button type="button" onClick={() => go('/')}>Back</button>
            </div>
            {token && (
              <div className="gate-token">
                <span>Dashboard token</span>
                <code>{token}</code>
                <div className="gate-actions">
                  <button type="button" onClick={copyToken}>{copied ? 'Copied' : 'Copy'}</button>
                  <button type="button" disabled={busy === 'use'} onClick={useHere}>{busy === 'use' ? 'Opening…' : used ? 'Opened on this browser' : 'Use on this browser'}</button>
                </div>
                {note && <p className="gate-note">{note}</p>}
              </div>
            )}
            {!token && note && <p className="gate-note">{note}</p>}
            <div className="gate-devices">
              <span>Computers</span>
              {sessions.length === 0 ? (
                <p className="gate-note">No laptop or PC has entered the token yet. Until one does, Operator mode and Customize stay locked everywhere.</p>
              ) : (
                <ul>
                  {sessions.map((row) => (
                    <li key={row.id} className={row.open ? 'is-open' : 'is-locked'}>
                      <div className="gate-device-top">
                        <strong>{row.label || 'Unknown device'}</strong>
                        <em>{row.open ? 'Unlocked' : 'Locked'}</em>
                      </div>
                      <p>
                        {[row.ip, row.host].filter(Boolean).join(' · ') || 'Address unknown'}
                        {row.open
                          ? ` · unlocked ${when(row.unlockedAt)}${row.lastSeenAt && row.lastSeenAt !== row.unlockedAt ? ` · last seen ${when(row.lastSeenAt)}` : ''}`
                          : ` · locked ${when(row.lockedAt || status?.issuedAt)}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
