/* == v91.17.283.35 · audit B3 · WHICH HAZARDS CAN HAPPEN AT A PLACE: ONE READER, ONE RULE ===========================================
   GET /api/hazards/applicability (operator Methods table; the endpoint is public). Until v283.34:
     - a statistical cut-off (frost: ERA5 tn10 less a 7.7 C margin; snow; hill torrent 25 km2) was worded "cannot happen here";
     - the cyclone and coastal unit entries carry no `applies` key (a unit LISTED there is outside), so every tehsil, Gilgit included, was
       answered "Tropical cyclone: can happen here" while the map mask (maplayers.mjs) treated the listed units as outside.
   Now each row has one of the map states (states.mjs) and its rule with the rule's parameter:
     cannot happen here            physical impossibility only: landslide on terrain too flat; river flooding off the floodplain (HAND)
     not expected here (rule ...)  a climatological or reach rule (frost, snow, melt, hill torrent, coastal heat): rarity, not impossibility
     outside the method's range    GLOF where no mapped glacial lake lies in the tehsil or drains into it within the routed corridor
     cyclone                       the reference record of the map's cyclone layer (reflayers.mjs): "No gale on record 1980-2025",
                                   "Gale reached" or "Storm force reached" (a record class, never "cannot happen")
   A unit listed in a layer's units is outside when its entry says applies:false, or (coastal, cyclone) when it is listed at all, exactly
   as the map mask reads the file. */
const NAMES = { glof: 'Glacial lake outburst flood', flood_riverine: 'River flooding', landslide: 'Landslide', hill_torrent: 'Hill torrent', frost: 'Frost', snow: 'Heavy snow', melt: 'Snow and glacier melt', coastal: 'Coastal heat and surge', cyclone: 'Tropical cyclone', drought: 'Drought' };
const PHYSICAL = new Set([]);   /* v283.36: C-now test 5 failed: no river "cannot happen" either */   /* v283.36 item 24: landslide is never "cannot happen here" (run-out from upstream) */
const LISTED_IS_OUTSIDE = new Set(['coastal', 'cyclone']);
const paramText = (P) => Object.entries(P || {}).filter(([, v]) => v && typeof v === 'object' && 'value' in v && typeof v.value !== 'object')
  .map(([k, v]) => k + ' ' + v.value + (v.unit ? ' ' + String(v.unit).split(' (')[0] : '')).join(', ');
/* the rule in plain words: each parameter name of the file replaced by its value and unit (no variable name reaches a client) */
function ruleText(rule, P) { let t = String(rule || '');
  for (const [k, v] of Object.entries(P || {})) { if (!v || typeof v !== 'object' || !('value' in v) || typeof v.value === 'object') continue;
    const u = String(v.unit || '').split(' (')[0].split(' share')[0]; t = t.replace(new RegExp('\\b' + k + '\\b', 'g'), v.value + (u && !/^share|^deg|^C$/.test(u) ? ' ' + u : u === 'C' ? ' \u00b0C' : /^deg/.test(u) ? '\u00b0' : '')); }
  return t.replace(/%%/g, '%'); }
/* v91.17.283.41 · owner update 31 Oct 22:55 PKT: river flooding from the river network (data/river-link.json: no channel = cannot happen,
   ungauged river = not tested, gauged = level) and landslide in three groups (data/landslide-groups.json), the same words as the map cells
   (hazsci.mjs riverCell / applyLandslide) */
export function applicabilityRows(A, uid, { glofNational = null, cycloneUnit = null, glofDrain = null, riverLink = null, lsGroups = null } = {}) {
  const rows = [];
  for (const [k, L] of Object.entries(A.layers || {})) {
    if (k === 'cyclone') { const c = cycloneUnit;
      if (c && c.assessed) rows.push({ hazard: k, name: NAMES[k], applies: c.level > 0, state: 'value', text: c.word, why: c.level > 0 ? null : (c.facts && c.facts.note) || null, rule: 'tropical-cyclone wind record 1980-2025 (the cyclone reference layer)' });
      else rows.push({ hazard: k, name: NAMES[k], applies: null, state: 'missing', text: 'data missing', why: (c && c.why) || 'the cyclone record is not loaded' });
      continue; }
    let outside = false, why = L.reason || null;
    if (k === 'flood_riverine' && riverLink && riverLink.units && riverLink.units[uid] && process.env.NIGRAAN_RIVER_NETWORK !== '0') { const U = riverLink.units[uid], reached = !!(U.reaches && Object.keys(U.reaches).length);
      if (reached) rows.push({ hazard: k, name: NAMES[k], applies: true, state: 'value', text: 'can happen here: a gauged river reach passes through or along this tehsil', why: null });
      else if (U.modelChannelCells > 0) rows.push({ hazard: k, name: NAMES[k], applies: null, state: 'not_tested', text: 'level not tested here: a river runs through this tehsil but has no gauge', why: 'no gauge on this river; nullahs and hill torrents are local-rain flooding', rule: 'river network: the channels of the river model after the national channel review' });
      else rows.push({ hazard: k, name: NAMES[k], applies: false, state: 'not_applicable', text: 'cannot happen here: no river channel in this tehsil', why: 'no river channel (river network only); nullahs and hill torrents are local-rain flooding', rule: 'river network: the channels of the river model after the national channel review' });
      continue; }
    if (k === 'landslide' && lsGroups && lsGroups.units && lsGroups.units[uid] && process.env.NIGRAAN_LANDSLIDE_GROUPS !== '0') { const g = lsGroups.units[uid].group;
      if (g === 'b') { rows.push({ hazard: k, name: NAMES[k], applies: null, state: 'not_tested', text: 'No local steep ground; debris from nearby slopes possible', why: 'flat inside the tehsil; steep ground within ' + ((lsGroups.params && lsGroups.params.reachKm && lsGroups.params.reachKm.value) || 5) + ' km', rule: (lsGroups.rule || {}).b || null }); continue; }
      if (g === 'c') { rows.push({ hazard: k, name: NAMES[k], applies: false, state: 'not_applicable', text: 'cannot happen here', why: 'no steep ground in this tehsil or near it', rule: (lsGroups.rule || {}).c || null }); continue; } }
    if (k === 'glof' && glofDrain && glofDrain.ok && glofDrain.units && glofDrain.units[uid]) { const g = glofDrain.units[uid];   /* v283.36 item 18: drainage connectivity, any distance */
      if (g.connected) { rows.push({ hazard: k, name: NAMES[k], applies: true, state: 'value', text: 'can happen here: ' + (g.lakesIn ? g.lakesIn + ' mapped glacial lake(s) in the tehsil' : g.lakesUpstream + ' mapped glacial lake(s) upstream in its drainage'), why: null, rule: glofDrain.method }); continue; }
      rows.push({ hazard: k, name: NAMES[k], applies: false, state: 'not_applicable', text: 'cannot happen here', why: 'no mapped glacial lake lies in this tehsil or anywhere upstream in its drainage', rule: glofDrain.method }); continue; }
    if (k === 'glof') { const n = glofNational && glofNational.units ? glofNational.units[uid] : null;
      if (n) { outside = n.applicable === false; if (outside) why = n.basis || n.text || why; }
      else if (L.byRegister) { const reg = L.byRegister.merged || Object.values(L.byRegister)[0]; if (reg && reg.units && !reg.units[uid]) outside = true; } }
    else if (L.units && L.units[uid]) outside = LISTED_IS_OUTSIDE.has(k) ? true : L.units[uid].applies === false;
    if (!outside) { rows.push({ hazard: k, name: NAMES[k] || k, applies: true, state: 'value', text: 'can happen here', why: null }); continue; }
    const rule = ruleText(L.rule || '', L.params);
    if (PHYSICAL.has(k)) rows.push({ hazard: k, name: NAMES[k] || k, applies: false, state: 'not_applicable', text: 'cannot happen here', why, rule });
    else if (k === 'landslide') rows.push({ hazard: k, name: NAMES[k], applies: null, state: 'missing', text: 'not assessed: no local steep ground; run-out from upstream not modelled', why: 'little steep ground in this tehsil (a fact, not a level); a landslide coming down from upstream ground is not modelled', rule });   /* v283.36 item 24 + C-now 2b */
    else if (k === 'flood_riverine') rows.push({ hazard: k, name: NAMES[k], applies: null, state: 'missing', text: 'not assessed here: the off-floodplain rule failed its held-out test', why: 'outside the mapped floodplain (a fact, not a level)', rule });   /* v283.36 C-now 5 */
    else if (k === 'glof') rows.push({ hazard: k, name: NAMES[k], applies: null, state: 'outside_range', text: 'no mapped glacial lake within the 100 km routed reach; lakes further up the drainage are checked on the map', why, rule });   /* v283.36 item 18: 100 km is not an impossibility */
    else rows.push({ hazard: k, name: NAMES[k] || k, applies: false, state: 'not_expected', text: 'not expected here (rule: ' + rule + ')', why, rule });
  }
  for (const k of ['heat', 'cold', 'wind', 'rain']) rows.unshift({ hazard: k, name: { heat: 'Heat stress', cold: 'Cold stress', wind: 'Wind and gusts', rain: 'Heavy rain' }[k], applies: true, state: 'value', text: 'can happen anywhere', why: null });
  return rows;
}
