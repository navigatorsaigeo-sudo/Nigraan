import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJson } from '../start/api.js';
import { getPointBundle } from '../analyst/placeCache.js';
import {
  readHash, rememberedPlace, rememberPlace, sectorOf, startSite, writeHash, worstWindow,
} from './model.js';

function normalizeSite(site) {
  return {
    name: site.name,
    lat: +site.lat,
    lon: +site.lon,
    province: site.province || '',
    city: site.city || '',
    type: site.type || '',
    floor: site.floor == null || site.floor === '' ? null : +site.floor,
    sector: site.sector || sectorOf(site.type),
  };
}

export function useCustomize() {
  const opened = readHash();
  const [step, setStepState] = useState(opened.step);
  const [place, setPlaceState] = useState(() => opened.place || rememberedPlace());
  const [bundle, setBundle] = useState(null);
  const [loadingPlace, setLoadingPlace] = useState(false);
  const [sites, setSites] = useState([]);
  const [sitesNote, setSitesNote] = useState('');
  const [provisional, setProvisional] = useState(false);
  const [pack, setPack] = useState({});
  const [packState, setPackState] = useState('idle');

  const setStep = useCallback((next) => {
    setStepState(next);
    writeHash(next, place);
  }, [place]);

  const setPlace = useCallback((next, nextStep = step) => {
    const point = {
      lat: +(+next.lat).toFixed(5),
      lon: +(+next.lon).toFixed(5),
      name: next.name || '',
    };
    setPlaceState(point);
    rememberPlace(point);
    writeHash(nextStep, point);
  }, [step]);

  useEffect(() => {
    let live = true;
    getJson('/customize/sites.json').then((body) => {
      if (!live) return;
      const list = (body?.sites || []).map(normalizeSite).filter((site) => Number.isFinite(site.lat) && Number.isFinite(site.lon));
      setSites(list);
      setProvisional(!!body?.provisional);
      setSitesNote(list.length ? '' : 'No AJG site list on this server.');
      setPlaceState((current) => {
        if (current) return current;
        const home = startSite(list);
        if (!home) return current;
        const point = { lat: +home.lat.toFixed(5), lon: +home.lon.toFixed(5), name: home.name };
        rememberPlace(point);
        writeHash(readHash().step, point);
        return point;
      });
    }).catch(() => { if (live) setSitesNote('The site list did not load.'); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!place) return undefined;
    let live = true;
    setLoadingPlace(true);
    setBundle(null);
    getPointBundle({ lat: place.lat, lon: place.lon, name: place.name, parts: 'all' }).then((body) => {
      if (!live) return;
      setBundle(body && body.ok !== false ? body : body || { ok: false, why: 'no answer' });
    }).catch(() => {
      if (live) setBundle({ ok: false, why: 'the place did not answer' });
    }).finally(() => { if (live) setLoadingPlace(false); });
    return () => { live = false; };
  }, [place]);

  useEffect(() => {
    if (!sites.length) return undefined;
    let live = true;
    setPackState('loading');
    const pts = sites.map((site) => {
      const floor = site.floor != null && Number.isFinite(+site.floor) ? `,${site.floor}` : '';
      return `${site.lat.toFixed(5)},${site.lon.toFixed(5)}${floor}`;
    }).join(';');
    getJson(`/api/point/batch?pts=${encodeURIComponent(pts)}&with=place,levels`).then((body) => {
      if (!live) return;
      const next = {};
      (body?.states || []).forEach((state, index) => {
        const site = sites[index];
        if (!site) return;
        const levels = state?.parts?.levels;
        const value = levels && !levels.unavailable ? levels.v : null;
        next[`${site.lat.toFixed(5)},${site.lon.toFixed(5)}`] = worstWindow(value);
      });
      setPack(next);
      setPackState('ready');
    }).catch(() => { if (live) setPackState('error'); });
    return () => { live = false; };
  }, [sites]);

  const ranked = useMemo(() => sites.map((site) => ({
    ...site,
    worst: pack[`${site.lat.toFixed(5)},${site.lon.toFixed(5)}`] || null,
  })).sort((a, b) => (b.worst?.level ?? -9) - (a.worst?.level ?? -9)), [sites, pack]);

  return {
    step, setStep, place, setPlace, bundle, loadingPlace,
    sites, ranked, provisional, sitesNote, setSites, setProvisional, setSitesNote, packState,
  };
}
