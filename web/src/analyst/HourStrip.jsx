import { useEffect, useMemo, useRef, useState } from 'react';
import { getPointBundle, peekPointBundle } from './placeCache.js';

function loadApi() {
  if (typeof window !== 'undefined' && window.AGNHourStrip) return Promise.resolve(window.AGNHourStrip);
  return new Promise((resolve, reject) => {
    const ready = () => {
      if (window.AGNHourStrip) resolve(window.AGNHourStrip);
      else reject(new Error('hour strip'));
    };
    const existing = document.querySelector('script[data-agnhs]');
    if (existing) {
      if (window.AGNHourStrip) { ready(); return; }
      existing.addEventListener('load', ready, { once: true });
      existing.addEventListener('error', () => reject(new Error('hour strip')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = '/agn-hour-strip.js';
    script.async = true;
    script.setAttribute('data-agnhs', '1');
    script.onload = ready;
    script.onerror = () => reject(new Error('hour strip'));
    document.head.appendChild(script);
  });
}

export default function HourStrip({ place, bundle, registry }) {
  const host = useRef(null);
  const bundleRef = useRef(null);
  const opts = useRef({ mode: '3' });
  const [api, setApi] = useState(typeof window !== 'undefined' ? window.AGNHourStrip : null);
  const [extra, setExtra] = useState(null);

  useEffect(() => {
    opts.current.registry = registry || null;
    opts.current.productType = registry?.rainChance?.productType || registry?.levels?.rainChance?.productType || 'Forecast';
  }, [registry]);

  useEffect(() => {
    if (api) return undefined;
    let live = true;
    loadApi().then((strip) => { if (live) setApi(strip); }).catch(() => {});
    return () => { live = false; };
  }, [api]);

  useEffect(() => {
    if (!place) { setExtra(null); return undefined; }
    let live = true;
    let timer = 0;
    const cached = peekPointBundle(place.lat, place.lon, 'poolHazard,land');
    if (cached?.parts) setExtra(cached.parts);
    else setExtra(null);
    const pull = (n) => {
      getPointBundle({ lat: place.lat, lon: place.lon, parts: 'poolHazard,land' }).then((body) => {
        if (!live) return;
        const parts = body?.parts || {};
        setExtra(parts);
        if (n < 4 && (parts.poolHazard?.pending || parts.land?.pending)) timer = setTimeout(() => pull(n + 1), 4000);
      }).catch(() => { if (live) setExtra({ error: true }); });
    };
    pull(0);
    return () => { live = false; clearTimeout(timer); };
  }, [place?.lat, place?.lon]);

  const stripBundle = useMemo(() => {
    if (!bundle?.ok) return null;
    const parts = { ...(bundle.parts || {}) };
    if (extra?.poolHazard) parts.poolHazard = extra.poolHazard;
    if (extra?.land && !extra.land.pending) parts.land = extra.land;
    return {
      ...bundle,
      point: bundle.point || { lat: bundle.lat ?? place?.lat, lon: bundle.lon ?? place?.lon },
      parts,
    };
  }, [bundle, extra, place?.lat, place?.lon]);

  bundleRef.current = stripBundle;

  useEffect(() => {
    if (!api || !host.current) return;
    if (!stripBundle) {
      const name = place?.name ? String(place.name).replace(/[&<>"]/g, '') : '';
      host.current.innerHTML = `<div class="agnhs"><h2 class="hsTitle">Next 4 days, hour by hour</h2><div class="note">${place ? `Loading the forecast record of ${name || 'this place'}…` : 'Choose a place to see its hours.'}</div></div>`;
      return;
    }
    const scroller = host.current.querySelector('.hsScroll');
    const left = scroller ? scroller.scrollLeft : 0;
    host.current.innerHTML = api.box(stripBundle, opts.current);
    api.wire(host.current, () => bundleRef.current, opts.current);
    const next = host.current.querySelector('.hsScroll');
    if (next && left) next.scrollLeft = left;
  }, [api, stripBundle, place?.name, registry]);

  return (
    <section className="ov-hs" aria-label="Next 4 days, hour by hour">
      {!api && place && <p className="note">Loading the hour-by-hour strip…</p>}
      <div ref={host} className="ov-hs-host" />
    </section>
  );
}
