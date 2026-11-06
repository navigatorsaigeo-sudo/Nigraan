import { useEffect, useState } from 'react';
import { activeRequests } from '../start/api.js';

const SHOW_AFTER_MS = 220;
const HIDE_AFTER_MS = 260;

/** Thin top progress bar + "Loading data" pill while foreground requests are in flight. */
export default function NetBar() {
  const [count, setCount] = useState(activeRequests);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onNet = (event) => setCount(Number(event.detail) || 0);
    window.addEventListener('agn:net', onNet);
    return () => window.removeEventListener('agn:net', onNet);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(count > 0), count > 0 ? SHOW_AFTER_MS : HIDE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [count > 0]);

  return (
    <div className={`agn-netbar${visible ? ' on' : ''}`} role="status" aria-live="polite" aria-hidden={!visible}>
      <div className="agn-netbar-track"><i /></div>
      <span className="agn-netbar-pill">
        <b aria-hidden="true" />
        Loading data{count > 1 ? ` · ${count}` : ''}
      </span>
    </div>
  );
}
