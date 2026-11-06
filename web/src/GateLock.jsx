import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { go } from './nav.js';
import { refreshGate, unlockGate, useGate } from './gate.js';
import CustomizePage from './pages/CustomizePage.jsx';

export function LockIcon() {
  return (
    <svg className="gate-lock-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function TokenDialog({ title, detail, onClose, onUnlocked }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const result = await unlockGate(token);
    setBusy(false);
    if (!result.open) {
      setError(result.error);
      return;
    }
    if (onUnlocked) onUnlocked();
    else onClose();
  }

  return createPortal(
    <div className="gate-back" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="gate-card" role="dialog" aria-modal="true" aria-labelledby="gate-title" onSubmit={submit}>
        <div className="gate-title">
          <LockIcon />
          <h2 id="gate-title">{title}</h2>
        </div>
        <p>{detail || 'Enter the token from the dashboard. A typed address does not open this.'}</p>
        <label>
          Dashboard token
          <input value={token} onChange={(event) => setToken(event.target.value)} autoFocus autoComplete="off" spellCheck="false" aria-label="Dashboard token" />
        </label>
        {error && <p className="gate-error">{error}</p>}
        <div className="gate-actions">
          <button type="submit" className="gate-primary" disabled={busy || !token.trim()}>{busy ? 'Checking…' : 'Unlock'}</button>
          <button type="button" onClick={() => go('/dashboard')}>Open dashboard</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

export function CustomizeLink({ id, className = '', to, children }) {
  const gate = useGate();
  const [ask, setAsk] = useState(false);
  const locked = gate.ready && !gate.open;
  return (
    <>
      <button
        id={id}
        type="button"
        className={`${className}${locked ? ' is-locked' : ''}`.trim()}
        aria-haspopup={locked ? 'dialog' : undefined}
        onClick={async () => {
          const openNow = gate.ready ? gate.open : await refreshGate();
          if (openNow) go(to);
          else setAsk(true);
        }}
      >
        {locked && <LockIcon />}
        {children}
      </button>
      {ask && (
        <TokenDialog
          title="Customize is locked"
          onClose={() => setAsk(false)}
          onUnlocked={() => { setAsk(false); go(to); }}
        />
      )}
    </>
  );
}

export function CustomizeRoute() {
  const gate = useGate();
  if (!gate.ready) {
    return (
      <div className="gate-page">
        <section className="gate-card">
          <h2>Customize</h2>
          <p>Checking the dashboard lock…</p>
        </section>
      </div>
    );
  }
  if (!gate.open) {
    return (
      <div className="gate-page">
        <TokenDialog
          title="Customize is locked"
          detail="This address stays closed until the dashboard token is entered. Lock again on the dashboard closes it, including a saved address."
          onClose={() => go('/')}
          onUnlocked={() => {}}
        />
      </div>
    );
  }
  return <CustomizePage />;
}
