/* == v91.17.283.36 (NIGRAAN 1.0) · launch item 18 · GLOF APPLICABILITY FROM DRAINAGE CONNECTIVITY ======================================
   A tehsil can receive a glacial-lake outburst flood when a mapped glacial lake lies in it or drains into it, at any distance: the 100 km
   lake route of the register names what lies downstream, it is not a limit of how far a flood travels, so it is not an impossibility.
   Connectivity is read from HydroBASINS level 7 (data/hybas_pk_lev07.json: id, down = next basin downstream): each lake is placed in its
   level-7 basin and the chain of "down" basins is followed to the outlet; a tehsil is connected when any of its ground (its polygon's
   vertices and centre) lies in a basin on such a chain. No share-of-basin cut (the 25 % basin-overlap rule is not used).
   Pure functions; the service caches the answer per file set. */
const inRing = (x, y, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
  if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; };
const polysOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const inPoly = (x, y, g) => polysOf(g).some((p) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h)));
const bboxOf = (g) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of polysOf(g)) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
export function basinIndex(hybas) {
  const B = (hybas && hybas.features || []).map((f) => ({ id: String(f.properties.id), down: f.properties.down ? String(f.properties.down) : null, g: f.geometry, bb: bboxOf(f.geometry) }));
  const byId = new Map(B.map((b) => [b.id, b]));
  const at = (lon, lat) => { for (const b of B) if (lon >= b.bb[0] && lon <= b.bb[2] && lat >= b.bb[1] && lat <= b.bb[3] && inPoly(lon, lat, b.g)) return b; return null; };
  return { B, byId, at };
}
/* lakes: [{ id, lat, lon, name?, tier? }]; tehsils: GeoJSON features with properties.uid. Returns { units: { uid: { connected, lakesUpstream, lakesIn } }, basins }
   v91.17.283.38 · item 8 · opts.stopAt [{ name, lon, lat }]: a lake's chain ends at the basin holding that point (a large reservoir: the
   flood enters it and goes no further); opts.inRegion(uid, feature) false = outside the reach (connected false, outside: true, the
   full-chain count kept as lakesUpstreamAnyDistance). Each unit also carries the lakes upstream by susceptibility tier (t1 high, t2
   moderate, t3 low) and its exposure: 'priority' (a tier-1 lake upstream or in it), 'watch' (tier 2), 'none' (tier-3 lakes only). */
export function drainageUnits(hybas, lakes, tehsils, opts = {}) {
  const I = basinIndex(hybas); if (!I.B.length) return { ok: false, why: 'the drainage map (HydroBASINS level 7) is not in this install' };
  const up = new Map(), upAll = new Map(), tierUp = new Map();   /* basin id -> lakes upstream (within the reach / any distance), by tier */
  const stop = new Set(); for (const s of (opts.stopAt || [])) { const b = I.at(s.lon, s.lat); if (b) stop.add(b.id); }
  let placed = 0;
  for (const L of lakes || []) { if (!Number.isFinite(L.lat) || !Number.isFinite(L.lon)) continue; const b = I.at(L.lon, L.lat); if (!b) continue; placed++;
    const seen = new Set(); let c = b, cut = false; while (c && !seen.has(c.id)) { seen.add(c.id); upAll.set(c.id, (upAll.get(c.id) || 0) + 1);
      if (!cut) { up.set(c.id, (up.get(c.id) || 0) + 1); const t = tierUp.get(c.id) || { 1: 0, 2: 0, 3: 0 }; const k = [1, 2, 3].includes(L.tier) ? L.tier : 3; t[k]++; tierUp.set(c.id, t); if (stop.has(c.id)) cut = true; }
      c = c.down ? I.byId.get(c.down) : null; } }
  const units = {};
  for (const f of (tehsils && tehsils.features) || []) { const uid = f.properties && f.properties.uid; if (!uid) continue;
    const pts = []; for (const p of polysOf(f.geometry)) { const r = p[0], step = Math.max(1, Math.floor(r.length / 60)); for (let i = 0; i < r.length; i += step) pts.push(r[i]); }
    const bb = bboxOf(f.geometry); pts.push([(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]);
    let best = 0, bestAll = 0; const hit = new Set(), tiers = { 1: 0, 2: 0, 3: 0 };
    for (const [x, y] of pts) { const b = I.at(x, y); if (!b) continue; if (upAll.has(b.id)) bestAll = Math.max(bestAll, upAll.get(b.id));
      if (up.has(b.id) && !hit.has(b.id)) { hit.add(b.id); best = Math.max(best, up.get(b.id)); const t = tierUp.get(b.id); if (t) for (const k of [1, 2, 3]) tiers[k] = Math.max(tiers[k], t[k]); } }
    let lakesIn = 0; const tin = { 1: 0, 2: 0, 3: 0 }; for (const L of lakes || []) if (Number.isFinite(L.lat) && L.lon >= bb[0] && L.lon <= bb[2] && L.lat >= bb[1] && L.lat <= bb[3] && inPoly(L.lon, L.lat, f.geometry)) { lakesIn++; tin[[1, 2, 3].includes(L.tier) ? L.tier : 3]++; }
    const inR = opts.inRegion ? !!opts.inRegion(uid, f) : true;
    const conn = best > 0 || lakesIn > 0;
    const T = { t1: Math.max(tiers[1], tin[1]), t2: Math.max(tiers[2], tin[2]), t3: Math.max(tiers[3], tin[3]) };
    units[uid] = { connected: conn && inR, lakesUpstream: best, lakesIn, basins: hit.size, ...(opts.inRegion ? { inRegion: inR, lakesUpstreamAnyDistance: Math.max(bestAll, lakesIn) } : {}),
      tiers: T, exposure: !(conn && inR) ? null : T.t1 > 0 ? 'priority' : T.t2 > 0 ? 'watch' : 'none' }; }
  return { ok: true, units, lakesPlaced: placed, basinsOnChains: up.size, stopBasins: [...stop], method: 'HydroBASINS level 7 downstream chains of every mapped glacial lake' + (stop.size ? ', each ending at the first large reservoir on it' : ' (no distance limit, no basin-share cut)') + (opts.inRegion ? ', within the mountain reach' : '') };
}
