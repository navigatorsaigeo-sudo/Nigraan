import { useEffect, useState } from 'react';
import Overview from '../analyst/Overview.jsx';
import { Account, Consoles, PlaceMenu, openChrome } from '../analyst/HeaderTools.jsx';
import { TAB_ACCENT, TABS } from '../analyst/layers.js';
import { Reports } from '../analyst/Reports.jsx';
import { AskTab, ForecastTab, MethodsTab, OperationsTab, RiskTab, ScenarioTab } from '../analyst/sections.jsx';
import { ensureCurrentPlace, readHashPlace } from '../analyst/place.js';
import { go } from '../nav.js';
import { CustomizeLink } from '../GateLock.jsx';
import { pktClock } from '../start/api.js';

const PANES = {
  overview: Overview,
  livedata: ForecastTab,
  assessments: RiskTab,
  operations: OperationsTab,
  hybridlab: ScenarioTab,
  airisk: AskTab,
  modelab: MethodsTab,
};

const ICONS = {
  overview: <svg className="ic" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg>,
  livedata: <svg className="ic" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>,
  operations: <svg className="ic" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  assessments: <svg className="ic" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4h16v16H4z" /><path d="M8 9h8M8 13h5M8 17h7" /></svg>,
  hybridlab: <svg className="ic" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 18h16M6 15l3-4 3 2 4-7 2 3" /></svg>,
  airisk: <svg className="ic" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>,
  modelab: <svg className="ic" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6M9 16h4" /></svg>,
};

export default function AnalystPage() {
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'overview');
  const [clock, setClock] = useState(pktClock);
  const [place, setPlace] = useState(readHashPlace);
  const [reportsOpen, setReportsOpen] = useState(false);
  useEffect(() => {
    document.body.classList.add('an-app');
    document.body.classList.remove('v-start', 'agn-nat', 'agn-dark', 'v-card', 'nv-has', 'nv-open');
    return () => document.body.classList.remove('an-app');
  }, []);
  useEffect(() => {
    ensureCurrentPlace(`${window.location.pathname}${window.location.search}`);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setClock(pktClock()), 30000);
    const sync = () => setPlace(readHashPlace());
    const syncTab = () => setTab(new URLSearchParams(window.location.search).get('tab') || 'overview');
    const openReports = () => {
      openChrome('reports');
      setReportsOpen(true);
    };
    const onChrome = (event) => {
      if (event.detail?.open !== 'reports') setReportsOpen(false);
    };
    window.addEventListener('agn-place', sync);
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', syncTab);
    window.addEventListener('agn-reports', openReports);
    window.addEventListener('agn-chrome', onChrome);
    return () => {
      clearInterval(timer);
      window.removeEventListener('agn-place', sync);
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', syncTab);
      window.removeEventListener('agn-reports', openReports);
      window.removeEventListener('agn-chrome', onChrome);
    };
  }, []);

  function open(id) {
    const next = `${window.location.pathname}?tab=${id}${window.location.hash || ''}`;
    window.history.pushState({}, '', next);
    setTab(id);
  }

  const Pane = PANES[tab] || Overview;
  const accent = TAB_ACCENT[tab] || TAB_ACCENT.overview;
  return (
    <div className="app anw" data-tab={tab} style={{ '--an-accent': accent, '--t84': accent }}>
      <header className="topbar">
        <div className="brand">
          <div className="logo"><img className="logo-img" src="/agn-logo.png" alt="AI Geo Navigators" /></div>
          <div className="divider" />
          <div className="product">
            <span className="code">NIGRAAN 1.0</span>
            <span className="name">National Integrated Geo-Risk, Alert &amp; Atmospheric Network</span>
          </div>
        </div>
        <span className="pk" title="Pakistan">
          <svg className="pkflag" width="27" height="18" viewBox="0 0 30 20" role="img" aria-label="Flag of Pakistan">
            <rect width="30" height="20" fill="#FFFFFF" />
            <rect x="7.5" width="22.5" height="20" fill="#01411C" />
            <path d="M16.919 4.286A6 6 0 1 0 24.21 12.489A5.5 5.5 0 0 1 16.919 4.286Z" fill="#FFFFFF" />
            <polygon points="23.234,6.014 22.5,7.268 23.465,8.354 22.046,8.042 21.311,9.296 21.169,7.85 19.749,7.539 21.081,6.956 20.938,5.51 21.903,6.596" fill="#FFFFFF" />
          </svg>
        </span>
        <nav id="agn-switch" className="in-top" aria-label="Switch page">
          <button type="button" onClick={() => go(`/${window.location.hash || ''}`)}>Start</button>
          <button type="button" className="on">Analyst view</button>
          <CustomizeLink to={`/customize${window.location.hash || ''}`}>Customize</CustomizeLink>
        </nav>
        <div className="freshness"><span className="pulse" /><span>Updated {clock}{place ? ` · ${place.name}` : ''}</span></div>
        <button type="button" className="agn-reports" onClick={() => { openChrome('reports'); setReportsOpen(true); }}>My reports</button>
        <PlaceMenu place={place} tab={tab} />
        <Consoles />
        <Account />
      </header>
      <Reports open={reportsOpen} onClose={() => setReportsOpen(false)} place={place} />
      <nav id="machNav" className="machnav machnav-sequenced" aria-label="NIGRAAN client decision journey" role="tablist">
        {TABS.map(([id, label], index) => (
          <button key={id} type="button" role="tab" data-goto={id} className={tab === id ? 'active' : ''} aria-selected={tab === id} onClick={() => open(id)}>
            {ICONS[id]}
            <span className="nav-label"><b>{String(index + 1).padStart(2, '0')}</b> {label}</span>
          </button>
        ))}
      </nav>
      <div className={`view active${tab === 'overview' ? '' : ' sheet'}`} data-view={tab}>
        <Pane embedded />
      </div>
    </div>
  );
}
