/* v91.17.283.14 · shared loader of the replay / derivation scripts: the stations, the issued forecasts and the unjudged readings of
   every network over a window of Pakistan days, through the verification agent's own readers (scripts/agents/verify.mjs). */
import { loadStations, loadForecasts, loadObs, backgroundOf, copyOfMach } from '../agents/verify.mjs';
import { addDays } from '../agents/lib.mjs';
export function days(from, to) { const o = []; for (let d = from; d <= to; d = addDays(d, 1)) o.push(d); return o; }
export async function loadAll(ctx, from, to) {
  const stations = await loadStations(ctx); const D = days(from, to);
  const issues = [...new Set(D.flatMap((d) => [0, 1, 2, 3, 4].map((L) => addDays(d, -L))))].sort();
  const FC = await loadForecasts(ctx.dataDir, issues);
  const zoneOfUid = new Map(); for (const m of FC.values()) for (const [u, r] of m) if (r.z && !zoneOfUid.has(u)) zoneOfUid.set(u, r.z);
  const OB = await loadObs({ ...ctx, rawOnly: true }, D, stations);
  const qs = stations.map((s) => ({ pid: s.pid, net: s.net, name: s.name, key: s.key, lat: s.lat, lon: s.lon, elev: Number.isFinite(s.elevM) ? s.elevM : null, zone: zoneOfUid.get(s.uid) || null, uid: s.uid }));
  return { stations, qs, FC, OB, bgAt: backgroundOf(FC, stations), copyOf: copyOfMach(ctx.dataDir), D };
}
