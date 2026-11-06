import { getJson, peekJson, viewName, withQuiet } from './start/api.js';
import { getPointBundle, peekPointBundle } from './analyst/placeCache.js';
import { readHashPlace } from './analyst/place.js';

/* Background warm-up: once a place is open, fetch what every page will ask for
   (same URLs, same cache keys), a few at a time and only when the browser is
   idle. Anything already cached or in flight is skipped by the shared layer. */

const CONCURRENCY = 2;
const START_DELAY_MS = 1200;
const NATIONAL_LAYERS = ['heat', 'cold', 'rain_hz', 'flood', 'landslide', 'drought'];

const queue = [];
const queued = new Set();
let running = 0;
let timer = 0;
let lastPlaceKey = '';
let nationalDone = false;

function idle(fn) {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn, { timeout: 2000 });
  else setTimeout(fn, 60);
}

function pump() {
  while (running < CONCURRENCY && queue.length) {
    const job = queue.shift();
    running += 1;
    idle(() => {
      Promise.resolve()
        .then(() => withQuiet(job.run))
        .catch(() => {})
        .finally(() => {
          running -= 1;
          queued.delete(job.id);
          pump();
        });
    });
  }
}

function add(id, run, front = false) {
  if (queued.has(id)) return;
  queued.add(id);
  if (front) queue.unshift({ id, run });
  else queue.push({ id, run });
}

function url(id) {
  add(id, () => (peekJson(id) ? null : getJson(id)));
}

function bundle(place, parts, withName = false) {
  const id = `bundle|${place.lat.toFixed(5)},${place.lon.toFixed(5)}|${parts}`;
  add(id, () => (peekPointBundle(place.lat, place.lon, parts)
    ? null
    : getPointBundle({ lat: place.lat, lon: place.lon, name: withName ? place.name || '' : undefined, parts })));
}

function placeJobs(place) {
  const lat = place.lat.toFixed(5);
  const lon = place.lon.toFixed(5);
  const name = place.name ? `&name=${encodeURIComponent(place.name)}` : '';

  bundle(place, 'default,context,hazardCount', true);
  url(`/api/report/past30?lat=${lat}&lon=${lon}${name}`);
  bundle(place, 'land,poolHazard');
  url(`/api/guidance?lat=${lat}&lon=${lon}&audience=business&lang=en`);
  url(`/api/pointstate/sweep-near?lat=${lat}&lon=${lon}&km=12&limit=36`);
  bundle(place, 'default,siteLevels,siteScreening,facts,placeRecord', true);
  url(`/api/point/batch?with=inputs&pts=${lat},${lon}`);
  url(`/api/scenario?lat=${lat}&lon=${lon}&preset=baseline`);
  url(`/api/ecmwf010/point?lat=${lat}&lon=${lon}&hourly=1&maxLead=120`);
  bundle(place, 'cmip6');
}

function nationalJobs() {
  url('/n3/tehsils.json');
  url('/n3/rivers.json');
  url('/api/registry/levels');
  url('/api/alerts');
  url('/api/map/layer?id=scales:map');
  NATIONAL_LAYERS.forEach((layer) => url(`/api/levels?layer=${layer}&day=0`));
  url('/api/levels?layer=heat&day=1');
  url('/health');
  url('/api/verdicts');
  url('/api/fleet/status');
  url('/api/fleet/pairs');
  url('/api/ecmwf010/status');
  url('/api/ai/status');
  url('/api/report/gate-status');
  url('/api/skill');
  if (viewName() === 'operator') {
    add('op|/api/fleet/latest', () => getJson('/api/fleet/latest', { view: 'operator' }));
    add('op|/api/ops/scorecard', () => getJson('/api/ops/scorecard', { view: 'operator' }));
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const place = readHashPlace();
    const key = place ? `${place.lat.toFixed(5)},${place.lon.toFixed(5)}` : '';
    if (place && key !== lastPlaceKey) {
      lastPlaceKey = key;
      placeJobs(place);
    }
    if (!nationalDone) {
      nationalDone = true;
      nationalJobs();
    }
    pump();
  }, START_DELAY_MS);
}

let started = false;
export function startPrefetch() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('hashchange', schedule);
  window.addEventListener('agn-place', schedule);
  window.addEventListener('popstate', schedule);
  schedule();
}
