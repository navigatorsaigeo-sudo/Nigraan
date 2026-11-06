import { useEffect, useState } from 'react';
import { go } from '../nav.js';
import { getJson } from '../start/api.js';
import { STEPS } from '../customize/model.js';
import { useCustomize } from '../customize/useCustomize.js';
import OverviewPane from '../customize/OverviewPane.jsx';
import OutlookPane from '../customize/OutlookPane.jsx';
import SitesPane, { ReportDialog, useReport } from '../customize/SitesPane.jsx';
import ScenarioPane from '../customize/ScenarioPane.jsx';
import ProofPane from '../customize/ProofPane.jsx';

function SearchBox({ sites, onPick }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) { setHits([]); return undefined; }
    let live = true;
    const timer = setTimeout(() => {
      const local = sites.filter((site) => site.name.toLowerCase().includes(text.toLowerCase())).slice(0, 4)
        .map((site) => ({ name: site.name, lat: site.lat, lon: site.lon, kind: site.type || 'site' }));
      getJson(`/api/geo/search?q=${encodeURIComponent(text)}`).then((body) => {
        if (!live) return;
        const remote = (body?.results || []).slice(0, 6).map((row) => ({
          name: row.resolvedLabel || row.name,
          lat: row.lat,
          lon: row.lon,
          kind: row.kind || row.level || 'place',
        }));
        setHits([...local, ...remote].slice(0, 8));
      }).catch(() => { if (live) setHits(local); });
    }, 220);
    return () => { live = false; clearTimeout(timer); };
  }, [query, sites]);

  return (
    <div className="cz-search">
      <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Find a place or site, or click the map" aria-label="Find a place" />
      {!!hits.length && (
        <div className="cz-hits" role="listbox">
          {hits.map((hit) => (
            <button key={`${hit.kind}-${hit.lat}-${hit.name}`} type="button" onClick={() => { onPick(hit); setQuery(hit.name); setHits([]); }}>
              <b>{hit.name}</b>
              <span>{hit.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CustomizePage() {
  const model = useCustomize();
  const reportApi = useReport();
  useEffect(() => {
    document.body.classList.add('cz-app');
    document.body.classList.remove('v-start', 'agn-nat', 'agn-dark', 'v-card', 'an-app', 'cz-sealed');
    return () => document.body.classList.remove('cz-app');
  }, []);

  function locate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      model.setPlace({ lat: position.coords.latitude, lon: position.coords.longitude, name: 'My location' });
    });
  }

  const placeLabel = model.bundle?.place?.name || model.place?.name || '';

  return (
    <div className="cz">
      <header className="cz-top">
        <div className="cz-brand">Customize NIGRAAN<small>AJG Supplies · weather → hazard → impact at every site</small></div>
        <SearchBox sites={model.sites} onPick={model.setPlace} />
        <button type="button" className="cz-btn ghost" onClick={locate}>My location</button>
        <nav className="cz-switch" aria-label="Switch page">
          <button type="button" onClick={() => go('/')}>NIGRAAN</button>
          <button type="button" className="on">Customize NIGRAAN · AJG Supplies</button>
        </nav>
      </header>
      {model.provisional && (
        <div className="cz-demo" role="note">
          DEMO site list: these sites are a synthetic demonstration list, not AJG Supplies&apos; real network. Every ranking on this page uses them; upload AJG&apos;s own site file on Sites &amp; operations to replace them.
        </div>
      )}
      <nav className="cz-steps" role="tablist" aria-label="Five tabs">
        {STEPS.map(([id, n, title, sub]) => (
          <button key={id} type="button" role="tab" aria-selected={model.step === id} onClick={() => model.setStep(id)}>
            <b><i>{n}</i>{title}</b>
            <span>{sub}</span>
          </button>
        ))}
        <div className="cz-place">{placeLabel}</div>
      </nav>
      <div className="cz-wrap">
        {model.step === 'overview' && (
          <OverviewPane place={model.place} bundle={model.bundle} loadingPlace={model.loadingPlace} ranked={model.ranked} onPick={model.setPlace} />
        )}
        {model.step === 'outlook' && <OutlookPane bundle={model.bundle} loading={model.loadingPlace} />}
        {model.step === 'sites' && (
          <SitesPane place={model.place} bundle={model.bundle} ranked={model.ranked} onPick={model.setPlace} reportApi={reportApi} />
        )}
        {model.step === 'lab' && <ScenarioPane place={model.place} />}
        {model.step === 'proof' && <ProofPane place={model.place} bundle={model.bundle} onOpen={reportApi.setReport} />}
      </div>
      <ReportDialog report={reportApi.report} onClose={() => reportApi.setReport(null)} />
    </div>
  );
}
