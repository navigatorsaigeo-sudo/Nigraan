import { useEffect, useState } from 'react';
import { setOperator, setOperatorGuard } from './analyst/operator.js';

const EVENT = 'agn-gate';
let open = false;
let ready = false;
let pending = null;
let watching = false;
let epoch = 0;

setOperatorGuard(() => open);

function publish() {
  window.dispatchEvent(new Event(EVENT));
}

export function gateOpen() {
  return open;
}

export function refreshGate() {
  if (pending) return pending;
  const ticket = epoch;
  pending = fetch('/api/dashboard/session', { cache: 'no-store', credentials: 'same-origin' })
    .then((res) => res.json().catch(() => ({})))
    .then((body) => {
      if (ticket !== epoch) return open;
      open = body?.open === true;
      ready = true;
      if (!open) setOperator(false);
      publish();
      return open;
    })
    .catch(() => {
      if (ticket !== epoch) return open;
      open = false;
      ready = true;
      setOperator(false);
      publish();
      return false;
    })
    .finally(() => { pending = null; });
  return pending;
}

export async function unlockGate(token) {
  const ticket = ++epoch;
  const res = await fetch('/api/dashboard/unlock', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: String(token || '').trim() }),
  });
  const body = await res.json().catch(() => ({}));
  epoch += 1;
  if (ticket !== epoch - 1) return { open };
  if (!res.ok || body.open !== true) {
    open = false;
    ready = true;
    setOperator(false);
    publish();
    return { open: false, error: 'That token is not valid, or the dashboard has locked it again.' };
  }
  open = true;
  ready = true;
  publish();
  return { open: true };
}

export function noteLocked() {
  epoch += 1;
  open = false;
  ready = true;
  setOperator(false);
  publish();
}

function watch() {
  if (watching) return;
  watching = true;
  setInterval(() => { refreshGate(); }, 15000);
  window.addEventListener('focus', () => { refreshGate(); });
}

export function useGate() {
  const [state, setState] = useState(() => ({ ready, open }));
  useEffect(() => {
    watch();
    const sync = () => setState({ ready, open });
    window.addEventListener(EVENT, sync);
    refreshGate();
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return state;
}
