import { useEffect, useRef } from 'react';

/* The sealed document stays byte-for-byte. Its page links open the top
   window, so Start, Analyst and Customize stay three pages rather than
   a page inside a page. */
function lift(frame, openTab) {
  let doc;
  try { doc = frame.contentDocument; } catch { return false; }
  if (!doc || doc.documentElement == null) return false;
  if (!doc.__agnLift) {
    doc.__agnLift = true;
    doc.addEventListener('click', (event) => {
      const link = event.target.closest && event.target.closest('#agn-switch a, nav.pswitch a, .an-switch a');
      if (link) {
        link.setAttribute('target', '_top');
        /* Keep the active place when leaving Customize for Analyst / Start. */
        const href = link.getAttribute('href') || '';
        if (href.startsWith('/') && !href.includes('#')) {
          const hash = window.top.location.hash || '';
          if (hash) link.setAttribute('href', `${href}${hash}`);
        }
      }
      const back = event.target.closest && event.target.closest('#machNav [data-goto="overview"]');
      if (!back || !frame.dataset.openTab) return;
      event.preventDefault();
      event.stopPropagation();
      const top = window.top.location;
      window.top.location.href = `${top.pathname}${top.hash || ''}`;
    }, true);
    /* Keep a top-window #agnplace when the sealed page rewrites the frame
       hash to a step name (#outlook). Sync real place hashes upward. */
    if (!doc.__agnHashLift) {
      doc.__agnHashLift = true;
      const pushHash = () => {
        try {
          const next = frame.contentWindow?.location?.hash || '';
          const topHash = window.top.location.hash || '';
          if (!next || next === topHash) return;
          const stepOnly = /^#(overview|outlook|sites|lab|proof)$/i.test(next);
          if (stepOnly && /[#&]agnplace=/.test(topHash)) return;
          if (/[#&]agnplace=/.test(next) || !stepOnly) {
            window.top.history.replaceState({}, '', `${window.top.location.pathname}${window.top.location.search}${next}`);
            window.dispatchEvent(new Event('agn-place'));
          }
        } catch { /* cross-origin guard */ }
      };
      frame.contentWindow?.addEventListener('hashchange', pushHash);
    }
  }
  if (openTab) {
    frame.dataset.openTab = openTab;
    const button = doc.querySelector(`#machNav [data-goto="${openTab}"]`);
    if (button && button.getAttribute('aria-selected') !== 'true') button.click();
  }
  return true;
}

export default function SealFrame({ title, src, openTab }) {
  const ref = useRef(null);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return undefined;
    const tick = () => lift(frame, openTab);
    frame.addEventListener('load', tick);
    const timer = setInterval(tick, 200);
    const stop = setTimeout(() => clearInterval(timer), 20000);
    return () => {
      frame.removeEventListener('load', tick);
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [src, openTab]);
  return <iframe ref={ref} className="full-seal" title={title} src={src} />;
}
