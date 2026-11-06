import { useEffect, useState } from 'react';
import { getPointBundle, peekPointBundle } from './placeCache.js';

const PK = { s: 23.5, n: 37.2, w: 60.5, e: 77.9 };
let locatePromise = null;

export function readHashPlace() {
  const match = /[#&]agnplace=(-?[0-9.]+),(-?[0-9.]+)(?:,([^&]*))?/.exec(window.location.hash || '');
  if (!match) return null;
  const lat = +match[1];
  const lon = +match[2];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let name = 'Selected place';
  try { name = match[3] ? decodeURIComponent(match[3]) : name; } catch { /* keep the fallback */ }
  return { lat, lon, name };
}

export function writePlace(place, path, options = {}) {
  const hash = `#agnplace=${place.lat.toFixed(5)},${place.lon.toFixed(5)},${encodeURIComponent(place.name || '')}`;
  const base = path || `${window.location.pathname}${window.location.search}`;
  window.history.replaceState({}, '', `${base}${hash}`);
  window.dispatchEvent(new CustomEvent('agn-place', { detail: { reveal: options.reveal !== false } }));
}

export function inPakistan(lat, lon) {
  return Number.isFinite(+lat) && Number.isFinite(+lon)
    && +lat >= PK.s && +lat <= PK.n && +lon >= PK.w && +lon <= PK.e;
}

function placeName(body, accuracyM) {
  const found = body?.place?.name || body?.place?.tehsil || body?.place?.near?.name;
  if (found) return found;
  if (Number.isFinite(+accuracyM) && +accuracyM >= 1000) {
    return `Approximate location (about ${Math.max(1, Math.round(+accuracyM / 1000))} km)`;
  }
  return 'Your location';
}

/** Pick the browser location once when no #agnplace is set. Returns the place or null. */
export function ensureCurrentPlace(path) {
  const existing = readHashPlace();
  if (existing) return Promise.resolve(existing);
  if (locatePromise) return locatePromise;
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  locatePromise = new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = +pos.coords.latitude;
      const lon = +pos.coords.longitude;
      const accuracyM = pos.coords.accuracy;
      if (!inPakistan(lat, lon)) {
        locatePromise = null;
        resolve(null);
        return;
      }
      const rounded = { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 };
      getPointBundle({ lat: rounded.lat, lon: rounded.lon, parts: 'context' }).then((body) => {
        const place = {
          ...rounded,
          name: placeName(body, accuracyM),
          accuracyM: Number.isFinite(+accuracyM) ? +accuracyM : null,
        };
        writePlace(place, path || `${window.location.pathname}${window.location.search}`, { reveal: false });
        locatePromise = null;
        resolve(place);
      }).catch(() => {
        const place = { ...rounded, name: placeName(null, accuracyM), accuracyM: Number.isFinite(+accuracyM) ? +accuracyM : null };
        writePlace(place, path || `${window.location.pathname}${window.location.search}`, { reveal: false });
        locatePromise = null;
        resolve(place);
      });
    }, () => {
      locatePromise = null;
      resolve(null);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
  return locatePromise;
}

export function usePlace(parts = 'default,context,hazardCount') {
  const [place, setPlace] = useState(readHashPlace);
  const [bundle, setBundle] = useState(() => {
    const current = readHashPlace();
    return current ? peekPointBundle(current.lat, current.lon, parts) : null;
  });
  useEffect(() => {
    const sync = () => setPlace(readHashPlace());
    window.addEventListener('hashchange', sync);
    window.addEventListener('agn-place', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('agn-place', sync);
    };
  }, []);
  useEffect(() => {
    if (!place) {
      setBundle(null);
      return undefined;
    }
    const cached = peekPointBundle(place.lat, place.lon, parts);
    if (cached) setBundle(cached);
    else setBundle(null);
    let cancel = false;
    getPointBundle({
      lat: place.lat,
      lon: place.lon,
      name: place.name || '',
      parts,
    }).then((body) => {
      if (!cancel) setBundle(body?.ok ? body : (body?.error ? body : { error: true, why: body?.why }));
    }).catch(() => { if (!cancel) setBundle({ error: true }); });
    return () => { cancel = true; };
  }, [place?.lat, place?.lon, place?.name, parts]);
  return { place, bundle };
}
