import { useEffect, useState } from 'react';
import { cachedGet, peekCached } from './placeCache.js';

const RANK = { act: 4, watch: 3, monitor: 2, exposure: 1, standing: 0 };
const TABS = [
  ['do', 'Do now'],
  ['rules', 'Rules here'],
  ['rights', 'Your rights'],
  ['contacts', 'Contacts'],
];

function stored(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

function keep(key, value) {
  try { localStorage.setItem(key, value); } catch { /* the choice still applies this visit */ }
}

function hazardLine(row) {
  if (row.status === 'level' || row.status === 'standing' || row.status === 'exposure') {
    return `${row.level?.word ? `${row.level.word} · ` : ''}${row.label || ''}`.trim();
  }
  if (row.status === 'not_relevant') return 'not relevant';
  if (row.status === 'no_level') return 'no level';
  return 'coming';
}

function levelTone(word) {
  const name = String(word || '').toLowerCase();
  if (name.startsWith('severe')) return 'severe';
  if (name.startsWith('high')) return 'high';
  if (name.startsWith('moderate')) return 'moderate';
  if (name.startsWith('low')) return 'low';
  if (name.startsWith('normal')) return 'normal';
  return '';
}

function plainReason(row) {
  const why = String(row.applicability?.why || row.level?.why || '').replace(/\s+/g, ' ').trim();
  if (!why) return '';
  const clause = why.split(';')[0].trim().replace(/\.$/, '');
  return clause.charAt(0).toUpperCase() + clause.slice(1);
}

function hazardNote(row) {
  const because = plainReason(row);
  if (row.status === 'not_relevant') return because ? `Not relevant · ${because}` : 'Not relevant';
  if (row.status === 'no_level') return because ? `No level · ${because}` : 'No level';
  if (row.status === 'coming') return 'Coming';
  const word = String(row.level?.word || '');
  const label = String(row.label || '');
  if (!label || label.toLowerCase() === word.toLowerCase()) return '';
  return label;
}

function sourceLabel(source) {
  if (!source) return '';
  const doc = source.doc || source.short || 'source';
  const section = source.section && source.id !== 'ndrr' && source.section.length < 40
    ? ` ${source.section}`
    : '';
  return `${doc}${section}`;
}

function Item({ item, onCopy }) {
  const source = item.source || {};
  const conditions = item.conditions ? Object.values(item.conditions) : [];
  const label = sourceLabel(source);
  return (
    <article className="agng-item" dir={item.lang === 'ur' ? 'rtl' : 'ltr'}>
      <p className="agng-text">{item.text}</p>
      <div className="agng-why">
        {source.url
          ? <a href={source.url} target="_blank" rel="noopener noreferrer" title={source.section || source.doc || ''}>Source: {label}</a>
          : <span className="agng-flag">{source.short || 'No official source'}</span>}
        {source.lawUrl && source.lawUrl !== source.url && (
          <a href={source.lawUrl} target="_blank" rel="noopener noreferrer">Library entry: {source.short || 'law or plan'}</a>
        )}
        <button type="button" className="agng-copy" onClick={() => onCopy(item)}>{item._copied || 'Copy'}</button>
        {item.flagged && <span className="agng-flag">{item.customerHiddenWhy || (item.conditions ? 'location fact not confirmed' : 'operator view only')}</span>}
        {conditions.map((cond, index) => (
          <span key={index} className="agng-cond">{cond.met === true ? 'Applies here: ' : cond.met == null ? 'Could not check: ' : ''}{cond.why}</span>
        ))}
        {item.jurisdictionNote && <span className="agng-cond">{item.jurisdictionNote}</span>}
        {item.langNote && <span className="agng-cond">{item.langNote}</span>}
      </div>
    </article>
  );
}

function More({ items, copied, onCopy }) {
  if (!items?.length) return null;
  return (
    <details className="agng-more">
      <summary>Show {items.length} more</summary>
      {items.map((item) => <Item key={item.id} item={{ ...item, _copied: copied === item.id ? 'Copied' : '' }} onCopy={onCopy} />)}
    </details>
  );
}

export default function Guidance({ place }) {
  const [audience, setAudience] = useState(() => stored('agn.guidance.audience', 'business'));
  const [lang, setLang] = useState(() => stored('agn.guidance.lang', 'en'));
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [hazard, setHazard] = useState(null);
  const [tab, setTab] = useState('do');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!place) { setData(null); setErr('Choose a place to see what to do there.'); return undefined; }
    let cancel = false;
    setErr('');
    const url = `/api/guidance?lat=${Number(place.lat).toFixed(5)}&lon=${Number(place.lon).toFixed(5)}&audience=${encodeURIComponent(audience)}&lang=${encodeURIComponent(lang)}`;
    const apply = (body) => {
      if (cancel) return;
      if (!body || body.__status || body.ok === false) {
        setData(null);
        setErr(body?.why || 'Guidance is not available for this place.');
        return;
      }
      const rows = body.hazards || [];
      const actionable = rows.filter((row) => row.status === 'level' || row.status === 'standing' || row.status === 'exposure')
        .sort((a, b) => (RANK[b.guidanceLevel] || 0) - (RANK[a.guidanceLevel] || 0));
      setData({ ...body, hazards: rows });
      setHazard((current) => (rows.some((row) => row.hazard === current) ? current : ((actionable[0] || rows[0])?.hazard || null)));
    };
    const cached = peekCached(url);
    if (cached) apply(cached);
    cachedGet(url).then(apply).catch(() => { if (!cancel) setErr('Guidance is not available for this place.'); });
    return () => { cancel = true; };
  }, [place?.lat, place?.lon, audience, lang]);

  const selected = data?.hazards?.find((row) => row.hazard === hazard) || null;
  const blocked = selected && (selected.status === 'not_relevant' || selected.status === 'no_level' || selected.status === 'coming');
  const withCopy = (item) => ({ ...item, _copied: copied === item.id ? 'Copied' : '' });

  function copy(item) {
    const source = item.source || {};
    const text = `${item.text} (Source: ${source.doc || source.short || ''}${source.url ? `, ${source.url}` : ''})`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(item.id);
      setTimeout(() => setCopied(''), 1200);
    }).catch(() => setCopied(''));
  }

  const placeLine = [data?.place?.tehsil, data?.place?.district, data?.place?.province].filter(Boolean).join(', ');

  return (
    <section className="agng" aria-label="What to do here">
      <header className="agng-hh">
        <div className="agng-hh-main">
          <h3>What to do here</h3>
          <span className="sub">{data ? (placeLine || 'Selected place') : (err || 'Loading the guidance for this place…')}</span>
        </div>
        {data && (
          <div className="agng-row">
            <label htmlFor="agngAud">I am</label>
            <select id="agngAud" value={audience} onChange={(event) => { setAudience(event.target.value); keep('agn.guidance.audience', event.target.value); }}>
              {(data.audiences || []).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
            </select>
            <label htmlFor="agngLang">Language</label>
            <select id="agngLang" value={lang} onChange={(event) => { setLang(event.target.value); keep('agn.guidance.lang', event.target.value); }}>
              <option value="en">English</option>
              <option value="ur">اردو</option>
            </select>
          </div>
        )}
      </header>

      <div className="agng-body">
        {!data && <p className="agng-msg">{err || 'Loading the guidance for this place…'}</p>}
        {data && (
          <>
            {data.langNote && <p className="agng-msg">{data.langNote}</p>}

            <div className="agng-hz" role="group" aria-label="Hazard">
              {data.hazards.map((row, index) => {
                const tone = levelTone(row.level?.word) || (row.status === 'no_level' || row.status === 'not_relevant' || row.status === 'coming' ? row.status : '');
                return (
                  <button
                    key={row.hazard}
                    type="button"
                    style={{ '--i': index }}
                    data-level={tone || undefined}
                    aria-pressed={row.hazard === hazard}
                    onClick={() => setHazard(row.hazard)}
                  >
                    <b>{row.name}</b>
                    <span>
                      {row.level?.word ? <em className={`agng-lv ${levelTone(row.level.word)}`}>{row.level.word}</em> : null}
                      {hazardNote(row) ? <small>{hazardNote(row)}</small> : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="agng-tabs" role="tablist" aria-label="Guidance sections">
              {TABS.map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
              ))}
            </div>

            <div className="agng-panel" role="tabpanel">
              {tab === 'contacts' && (
                <div className="agng-stack">
                  {(data.contacts?.items || []).map((row) => (
                    <div key={row.id || row.name} className="agng-contact">
                      <div>
                        <b>{row.name}</b>
                        {row.note ? <span>{row.note}</span> : null}
                        {row.source ? <a href={row.source} target="_blank" rel="noopener noreferrer">source</a> : null}
                        {row.districtNote ? <span className="agng-flag">{row.districtNote}</span> : null}
                        {row.customerHiddenWhy ? <span className="agng-flag">{row.customerHiddenWhy}</span> : null}
                      </div>
                      <div className="agng-phones">{(row.phone || []).map((phone) => <a key={phone} href={`tel:${String(phone).replace(/[^0-9+]/g, '')}`}>{phone}</a>)}</div>
                    </div>
                  ))}
                  {!data.contacts?.items?.length && <p className="agng-msg">{data.contacts?.message || 'No published contact for this place.'}</p>}
                  {data.contacts?.note && <p className="agng-msg">{data.contacts.note}</p>}
                </div>
              )}

              {tab !== 'contacts' && blocked && (
                <p className="agng-line">
                  {selected.line || hazardLine(selected)}
                  {plainReason(selected) ? ` ${plainReason(selected)}.` : ''}
                </p>
              )}

              {tab === 'do' && !blocked && selected?.tabs?.do && (
                <div className="agng-stack">
                  {selected.glofNote && <p className="agng-msg">{selected.glofNote}</p>}
                  {selected.tabs.do.phases.map((phase) => (
                    <div key={phase.title} className="agng-phase-block">
                      {(phase.items?.length || phase.more?.length) ? <p className="agng-phase">{phase.title}</p> : null}
                      <div className="agng-cards">
                        {(phase.items || []).map((item) => <Item key={item.id} item={withCopy(item)} onCopy={copy} />)}
                      </div>
                      <More items={phase.more} copied={copied} onCopy={copy} />
                    </div>
                  ))}
                  {selected.tabs.do.message && <p className="agng-msg">{selected.tabs.do.message}</p>}
                </div>
              )}

              {tab === 'rules' && !blocked && selected?.tabs?.rules && (
                <div className="agng-stack">
                  <div className="agng-cards">
                    {(selected.tabs.rules.items || []).map((item) => <Item key={item.id} item={withCopy(item)} onCopy={copy} />)}
                  </div>
                  {selected.tabs.rules.message && <p className="agng-msg">{selected.tabs.rules.message}</p>}
                </div>
              )}

              {tab === 'rights' && !blocked && selected?.tabs?.rights && (
                <div className="agng-stack">
                  <div className="agng-cards">
                    {(selected.tabs.rights.items || []).map((item) => <Item key={item.id} item={withCopy(item)} onCopy={copy} />)}
                  </div>
                  {selected.tabs.rights.duties?.length ? <p className="agng-phase">Your duties</p> : null}
                  <div className="agng-cards">
                    {(selected.tabs.rights.duties || []).map((item) => <Item key={item.id} item={withCopy(item)} onCopy={copy} />)}
                  </div>
                  {selected.tabs.rights.message && <p className="agng-msg">{selected.tabs.rights.message}</p>}
                </div>
              )}

              {tab !== 'contacts' && !selected && <p className="agng-msg">No hazard selected.</p>}
            </div>

            <footer className="agng-foot">
              Guidance library {data.library?.version || ''}
              {data.library?.reviewer ? ` · reviewed by ${data.library.reviewer}` : ''}
              {data.library?.verifiedOn ? ` · checked against official text ${data.library.verifiedOn}` : ''}
              {data.footer ? `. ${data.footer}` : ''}
            </footer>
          </>
        )}
      </div>
    </section>
  );
}
