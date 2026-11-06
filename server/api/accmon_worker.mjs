/* ══ v91.17.273.1 · ACC · the accuracy monitor's backfill replay, in a worker thread ═══════════════════════════════════════════════════
   The 17 Oct 2026 deploy check failed while the first-start backfill replayed a month of MACH readings on the server's main thread
   (point forecast ok:false, the checks 48 s slow). Here the replay (reading the copied database days and the fleet pairs file, the
   stuck screen, the live-layer replay hour by hour) runs in its own thread with its own heap and garbage collector; the main thread
   only receives finished hours, a day at a time, and stores them in slices. Read only: this thread writes no file.
   Its world is a snapshot taken by the main thread (registry, siting offsets, exclusions, heights, the pairs' forecast cache) and the
   same data files (the live layer's model, the synoptic station list): the same functions as the main thread. */
import { parentPort, workerData } from 'node:worker_threads';
import { createAccMon } from './accmon.mjs';
import { createHyperlocal } from './hyperlocal.mjs';
import { createSynop } from './synop.mjs';

const W = workerData; const S = W.snap;
const app = { copies: { copiesDir: S.copiesDir }, mos: { zoneOfPoint: (lat, lon) => (S.zones && S.zones[lat + ',' + lon]) ?? null },
  fleet: { stations: () => S.stations, offsetFor: (k) => (S.offsets && S.offsets[k]) || null, elevOf: (k) => (S.elev && S.elev[k] != null ? S.elev[k] : null),
    servedAt: (k, h) => { const v = S.cache && S.cache[k + '|' + String(h).slice(0, 13)]; return Number.isFinite(v) ? v : null; }, liveReadings: () => [] } };
app.hyperlocal = createHyperlocal(app, W.dataDir);
try { app.synop = createSynop(app, W.dataDir); } catch (_) { app.synop = { records: () => ({ stations: {}, records: {} }), termAt: () => null }; }
const acc = createAccMon(app, W.root, W.dataDir, { ...W.accOpts, noSchedule: true, noLoad: true, noWrite: true, cities: [] });
let batch = [];
const send = () => { if (batch.length) { parentPort.postMessage({ type: 'hours', hours: batch }); batch = []; } };
try {
  const r = await acc.replay(W.o, async (T, M) => {
    if (T == null) { send(); return; }
    batch.push([T, [...M].map(([id, v]) => [id, v.o, v.pre, v.post, v.hk, v.meta, v.raw])]);   /* v91.17.277: + the reading as measured */
    if (batch.length >= 24) send();
  });
  send(); delete r.pairs; parentPort.postMessage({ type: 'done', result: r });
} catch (e) { parentPort.postMessage({ type: 'error', error: String(e && e.message || e) }); }
