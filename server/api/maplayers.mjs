/* Map layers for the outlook: one value per tehsil (keyed by the same uid the map geometry
   carries), plus what the value is and which periods are available. Colours are chosen in
   the browser from the layer type.

   v91.17.71 · WHERE A HAZARD CANNOT OCCUR, NOTHING IS COLOURED. The CEO found the GLOF map colouring the whole
   country (v91.17.70 gave every tehsil a level) and asked for the same check on every layer. Each layer that has a
   physical mask (data/hazard-applicability.json, scripts/build_applicability.py: glacial lakes upstream, river
   floodplain, landslide-prone terrain, snow and frost climate, glacier terrain, coast) serves NO value for a tehsil
   outside it, and the tehsil's `whys` entry is the layer's one-line reason; the map leaves it unfilled. The
   thresholds live in that file with their method and source, not here. `mask:all` serves every mask by tehsil key
   for the national hazard view. */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { rainClassesEntry } from './scalecuts.mjs';   /* v91.17.283.27 · item 3 */

export function createMapLayers(app) {
  let AP = null, APMT = 0, KEYS = null;
  function applic() {
    try { const f = join(app.dataDir || join(process.cwd(), 'data'), 'hazard-applicability.json'); if (!existsSync(f)) return null;
      const mt = statSync(f).mtimeMs; if (AP && mt === APMT) return AP; AP = JSON.parse(readFileSync(f, 'utf8')); APMT = mt; return AP; } catch (_) { return AP; }
  }
  function tehsilKeys() {
    if (KEYS) return KEYS;
    try { const fc = JSON.parse(readFileSync(join(app.dataDir || join(process.cwd(), 'data'), 'pk-tehsils.json'), 'utf8')); KEYS = new Map(fc.features.map(f => [f.properties.uid, f.properties.key])); } catch (_) { KEYS = new Map(); }
    return KEYS;
  }
  /* uid -> reason for every tehsil OUTSIDE the mask of a map layer id or hazard key; null when the layer has no mask */
  function outside(layerId) {
    const A = applic(); if (!A) return null;
    const mk = (A.layerMap || {})[layerId] || (layerId === 'ls:odds' ? 'landslide' : null); if (!mk) return null;   /* v91.17.112 · the rain trigger shares the terrain mask */
    const Lr = (A.layers || {})[mk]; if (!Lr) return null;
    const out = new Map();
    if (mk === 'glof') {
      /* GLOF applicability is decided by the lake module itself (routed basins + anchor point + lakes in the tehsil) */
      /* v283.36 item 18 · drainage connectivity at any distance (no 100 km cut, no basin-share cut) */
      try { const D = app.hazSci && app.hazSci.glofDrain ? app.hazSci.glofDrain() : null; if (D && D.ok) { for (const [uid, u] of Object.entries(D.units)) if (!u.connected) out.set(uid, 'no mapped glacial lake lies in this tehsil or anywhere upstream in its drainage'); return out; } } catch (_) {}
      return out;   /* without the drainage file nothing is masked (100 km is not an impossibility) */
      const reg = Lr.byRegister && (Lr.byRegister.merged || Lr.byRegister.open);
      if (reg && reg.units) for (const uid of tehsilKeys().keys()) if (!reg.units[uid]) out.set(uid, Lr.reason);
      return out;
    }
    if (Lr.dynamic) return null;
    /* v91.17.283.41 · owner update 31 Oct 22:55 PKT: river flooding is masked where the tehsil has no river channel at all (river network,
       data/river-link.json); landslide: group c (no steep ground in or near) cannot happen, group b keeps its grey reason (landslide-groups.json) */
    const rj41 = (f) => { try { return JSON.parse(readFileSync(join(app.dataDir || join(process.cwd(), 'data'), f), 'utf8')); } catch (_) { return null; } };
    if (mk === 'flood_riverine') { if (process.env.NIGRAAN_RIVER_NETWORK === '0') return null; const RL = rj41('river-link.json'); if (!RL || !RL.units) return null;
      for (const [uid, U] of Object.entries(RL.units)) if (!(U.reaches && Object.keys(U.reaches).length) && !(U.modelChannelCells > 0)) out.set(uid, 'cannot happen here: no river channel in this tehsil');
      return out; }
    const LG = mk === 'landslide' && process.env.NIGRAAN_LANDSLIDE_GROUPS !== '0' ? rj41('landslide-groups.json') : null;
    const reason = mk === 'landslide' ? 'not assessed: no local steep ground; run-out from upstream not modelled' : Lr.reason;   /* v283.36 item 24: never "too flat for landslides" */
    for (const uid of Object.keys(Lr.units || {})) { const g = LG && LG.units && LG.units[uid] ? LG.units[uid].group : null;
      out.set(uid, g === 'c' ? 'cannot happen here: no steep ground in this tehsil or near it' : g === 'b' ? 'No local steep ground; debris from nearby slopes possible' : reason); }
    return out;
  }
  const DF = new Map();
  function dataFile(name, id) {
    try { const f = join(app.dataDir || join(process.cwd(), 'data'), name); if (!existsSync(f)) return { id, ready: false, error: 'data/' + name + ' not installed' };
      const mt = statSync(f).mtimeMs, c = DF.get(name); if (c && c.mt === mt) return c.v;
      const v = { id, ready: true, file: 'data/' + name, ...JSON.parse(readFileSync(f, 'utf8')) }; DF.set(name, { mt, v }); return v; }
    catch (e) { return { id, ready: false, error: 'data/' + name + ' unreadable: ' + e.message }; }
  }
  function maskAll() {
    const A = applic(); if (!A) return { id: 'mask:all', ready: false, error: 'data/hazard-applicability.json not installed (scripts/build_applicability.py)' };
    const keys = tehsilKeys(), layers = {};
    const hz = new Set(Object.keys(A.layerMap || {}));
    for (const id of hz) {
      const m = outside(id); if (!m) continue;
      const byKey = {}; for (const [uid, why] of m) { const k = keys.get(uid); if (k) byKey[k] = why; }
      layers[id] = { reason: A.layerMap[id] === 'landslide' ? 'not assessed: no local steep ground; run-out from upstream not modelled' : A.layerMap[id] === 'glof' ? 'no mapped glacial lake lies in this tehsil or anywhere upstream in its drainage' : ((A.layers || {})[A.layerMap[id]] || {}).reason || null, outside: m.size, applies: keys.size - m.size, byKey };
    }
    return { id: 'mask:all', ready: true, built: A.built, version: A.version, units: keys.size, layers, everywhere: A.everywhere || [],
             note: 'a tehsil listed under a layer is outside that hazard\'s physical mask: the map leaves it unfilled and shows the reason' };
  }
  const LAYERS = [
    { group: 'Next 15 days · chance of a multi-day event', items: [
      /* v91.17.3 · 2.15 · one heat spell, not three. The sub-classes ride inside it. */
      ['ev:heatSpell', 'Heat spell: hotter than usual here, and hot enough to matter'], ['ev:unusualWarmth', 'Unusually warm for the place'], ['ev:meltWarmth', 'Snow and ice melt warmth (units reaching 3,500 m only)'],
      /* v283.36 items 20 / 23: coastal heat (apparent >= 40 C), 3-day >= 75 mm, extreme-for-the-place rain and the 3-night frost spell are withheld (untested cuts) */
      ['ev:rainOnSnow', 'Rain on snow (above 1,500 m)'], ['ev:heavySnow', 'Heavy snow (3-day ≥30 cm)'],
      ['ev:coldSpell', 'Cold spell: colder than usual here, and cold enough to matter'] ] },
    { group: 'Single day · chance', items: [
      /* v91.17.3 · 3.7 · a rainfall ladder rather than two rungs; 2.13/2.17 labels */
      ['day:tx40', 'Max ≥40 °C'], ['day:tx45', 'Max ≥45 °C (uncalibrated)'], /* v91.17.212 · measured on Pakistan days 18-28 Sep 2026 against IMERG (station-lake/reports/imerg_pkt_day_verify.json): the share of
         members at ≥10 mm averaged 0.5 % in the plains where 6.7 % of tehsil-days reached it, so these rungs say so in their name; the
         calibrated chance is the 'Rain chance' group below */
      ['day:sn10', 'Snow ≥10 cm'], ['day:tn0', 'Frost below 2,000 m'] ] },
    /* v283.36 items 17 / 20 · values instead of untested member-share cuts: the members' daily rain and gust percentiles */
    { group: 'Single day · amounts (members)', items: [['amt:pr50', 'Rain in the day, middle member (mm; p10-p90 on hover)'], ['amt:pr90', 'Rain in the day, wet end (90th percentile member, mm)'], ['amt:gu50', 'Strongest gust, middle member (km/h; p10-p90 on hover; below 1,500 m only)'], ['amt:tn50', 'Night minimum, middle member (°C)']] },
    /* v91.17.101 · audit #11 · the served rain as calibrated chances (station-lake/scripts/rain_chance_model.py, tested on 2026) */
    { group: 'Rain chance · calibrated against satellite rain', items: [['rc:1', 'Chance of a rain day (≥1 mm, calibrated)'], ['rc:10', 'Chance of ≥10 mm (calibrated)'], ['rc:15.6', 'Chance of moderate rain or more (≥15.6 mm, calibrated)'], ['rc:25', 'Chance of ≥25 mm (calibrated)']] },
    /* v91.17.101 · the rain that fell: the satellite day totals the server already fetches to score the forecast (imerg.mjs) */
    /* v91.17.105 · river flood as a calibrated chance of the official observed flow class at the gauged reach (station-lake/scripts/river_prob_model.py) */
    { group: 'River flood chance · official flow class', items: [['rv:2', 'Chance river flow reaches Medium flood or higher'], ['rv:1', 'Chance river flow reaches Low flood or higher']] },
    /* v91.17.112 · rain-triggered landslide likelihood against an ordinary day (station-lake/scripts/landslide_prob.py) */
    { group: 'Landslide · rain trigger', items: [['ls:odds', 'Rain-triggered landslide likelihood vs an ordinary day']] },
    { group: 'Rain that fell · satellite estimate', items: [['fell:day', 'Rain that fell (one day, satellite estimate)']] },
    { group: 'Vegetation health · satellite, weekly', items: [['veg:vhi', 'Vegetation health (VHI, 4 km, weekly)']] },
    { group: 'Air and smog · next 5 days', items: [['air:pm25', 'PM2.5 daily mean'], ['air:dust', 'Dust (daily mean, µg/m³)'], ['air:fog', 'Fog hours (visibility under 1 km)'], ['air:disp', 'Dispersion (smog-trapping weather; untuned bands)'], ['air:fires', 'Crop burning upwind (satellite fires, last 3 days)']] },   /* v91.17.72 · F */
    { group: 'Weeks ahead · sub-seasonal forecast', items: [['week:t', 'Temperature vs normal'], ['week:pT1', 'Chance of >1 °C above normal'], ['week:p', 'Rain vs normal']] },
    { group: 'Season ahead · seasonal forecast', items: [['month:t', 'Temperature vs normal'], ['month:p', 'Rain vs normal (%)']] },
  ];
  const label = (id) => { for (const g of LAYERS) for (const [k, l] of g.items) if (k === id) return l; return id; };
  /* v91.17.15 · F4 · AN UNKNOWN LAYER ANSWERED ready:true.
     'ev:nonsense' fell through the kind test, matched no event key, set no
     values, and came back ready with a count of zero — indistinguishable, to
     the caller and to the map, from a real layer that happens to be empty.
     A name this build does not publish is an error, not an empty result. */
  const KNOWN = new Set(); for (const g of LAYERS) for (const [k] of g.items) KNOWN.add(k);

  function layer(id, idx) {
    const [kind, key] = String(id || '').split(':'); const i = Math.max(0, Number(idx) || 0);
    if (id === 'mask:all') return maskAll();
    /* v91.17.76 · M · the level cuts of the non-hazard map layers (A-12) and the Line of Control geometry (bundled AGN
       boundaries) are data files with their provenance; the map reads them here rather than typing a number */
    if (id === 'scales:map') return dataFile('map-layer-scales.json', id);
    if (id === 'line:loc') return dataFile('loc-line.json', id);
    if (!KNOWN.has(id)) return { id, title: String(id || ''), values: {}, whys: {}, periods: [], index: i,
                                 ready: false, error: 'unknown layer', known: [...KNOWN] };
    const out = { id, title: label(id), values: {}, whys: {}, periods: [], index: i };
    if (kind === 'ev' || kind === 'day') {
      const st = app.outlook.status(); if (!st.ensemble) return { ...out, ready: false };
      const all = app.outlook.national(0); // for days list
      out.periods = kind === 'day' ? all.days.map(d => ({ id: d, label: d })) : [];
      for (const u of app.units.tehsil) {
        const r = app.outlook.unit(u.unitId); if (!r) continue;
        if (kind === 'ev') {
          /* v91.17.36 · AUDIT L03 · the melt reading is the unusual-warmth chance
             screened to units whose terrain reaches the glacier floor; the plain
             relative layer keeps its own name. Before: 100 % "melt" at Awaran and
             Buleda (Balochistan desert) and 98 % at Jacobabad (58 m). */
          const ek = key === 'meltWarmth' ? 'unusualWarmth' : key;
          const e = r.events && r.events[ek];
          /* v91.17.71 · the glacier-floor screen is the data file's melt mask (applied below with every other mask) */
          if (e && e.p != null) out.values[u.unitId] = e.p;
          /* v91.17.15 · F3 · the engine already knows why a unit carries no number —
             it sets the event to null where the mechanism is not screened (coastal
             heat inland, rain-on-snow below 1,500 m) and writes pWhy for a withheld
             daily threshold. None of that reached the map, so the map washed the
             unit white and let the reader decide. It travels now. */
          else if (r.events && (key in r.events)) out.whys[u.unitId] = (e && e.why) || 'this event is not screened in this unit';
          if (r.events) out.valid = r.events.window[0] + ' to ' + r.events.window[1]; }
        else { const d = r.ensemble && r.ensemble.days[Math.min(i, r.ensemble.days.length - 1)];
          if (d && d.p && d.p[key] != null) out.values[u.unitId] = d.p[key];
          else if (d && d.pWhy && d.pWhy[key]) out.whys[u.unitId] = d.pWhy[key];
          if (d) out.valid = d.date; }
      }
      Object.assign(out, { type: 'chance', unit: '%', source: 'global ensemble forecast, 51 members (share of members, not calibrated)' });
    } else if (kind === 'amt') {
      const st = app.outlook.status(); if (!st.ensemble) return { ...out, ready: false };
      const all = app.outlook.national(0); out.periods = all.days.map(d => ({ id: d, label: d }));
      const v = key.slice(0, 2), q = key.slice(2) === '90' ? 2 : 1; out.ranges = {};
      for (const u of app.units.tehsil) { const r = app.outlook.unit(u.unitId); if (!r) continue;
        const d = r.ensemble && r.ensemble.days[Math.min(i, r.ensemble.days.length - 1)]; if (!d) continue; out.valid = d.date;
        if (v === 'gu' && !(u.elevM != null && u.elevM < 1500)) { out.whys[u.unitId] = 'not tested: the ensemble gust did not pass its test above 1,500 m (model 23.2 km/h against 13.7 observed)'; continue; }
        const t = d[v]; if (Array.isArray(t) && t[q] != null) { out.values[u.unitId] = Math.round((v === 'tn' ? t[q] : Math.max(0, t[q])) * 10) / 10; out.ranges[u.unitId] = [t[0], t[2]]; } }
      Object.assign(out, { type: 'amount', unit: v === 'pr' ? 'mm' : v === 'gu' ? 'km/h' : '°C', source: 'global ensemble forecast, 51 members (percentiles of the members; values, no level)' });
    } else if (kind === 'rc') {
      const n = app.rainChance ? app.rainChance.national() : { ready: false, why: 'rain-chance module not loaded' }; if (!n.ready) return { ...out, ready: false, why: n.why };
      out.periods = n.days.map(d => ({ id: d, label: d })); const T = Number(key); const d = n.days[Math.min(i, n.days.length - 1)]; out.valid = d;
      for (const [uid, u] of Object.entries(n.units)) { const r = u.days.find(x => x.date === d); if (!r) continue; if (r.p[T] != null) out.values[uid] = r.p[T]; else if (r.why && r.why[T]) out.whys[uid] = r.why[T]; }
      Object.assign(out, { type: 'chance', unit: '%', source: 'the served forecast turned into a calibrated chance of a satellite day rain total at or above ' + T + ' mm; trained 2024-25, tested on 2026 (' + n.modelVersion + ')' });
    } else if (kind === 'rv') {
      const P = app.riverProb; if (!P) return { ...out, ready: false, why: 'river-chance module not loaded' };
      const L = P.unitLayer(key, i); if (!L.ready) return { ...out, ready: false, why: L.why };
      out.periods = L.days.map(d => ({ id: d, label: d })); out.valid = L.date; Object.assign(out.values, L.values);
      for (const [uid, w] of Object.entries(L.whys)) if (!(uid in out.values)) out.whys[uid] = w;
      for (const u of app.units.tehsil) if (!(u.unitId in out.values) && !(u.unitId in out.whys)) out.whys[u.unitId] = 'no gauged river reach mapped to this tehsil';
      /* v91.17.283 · WS4 · item 1 · the wording follows the gate entry (river-chance: Indicative, worse than persistence at the gauges) */
      Object.assign(out, { type: 'chance', unit: '%', source: 'indicative: the river forecast flow at the gauged reach turned into a chance of the observed flow class, fitted on two monsoons (' + L.version + '); at the gauges it did worse than simply carrying today\u2019s measured flow forward, so read it as raised likelihood, not yes or no. High flood chance is withheld: it did not pass its test' });
    } else if (kind === 'ls') {
      const P = app.landslideOdds; if (!P) return { ...out, ready: false, why: 'landslide module not loaded' };
      const L = P.unitLayer(i); if (!L.ready) return { ...out, ready: false, why: L.why };
      out.periods = L.days.map(d => ({ id: d, label: d })); out.valid = L.date; Object.assign(out.values, L.values);
      for (const [uid, w] of Object.entries(L.whys)) if (!(uid in out.values)) out.whys[uid] = w;
      const SC = L.scale; const cuts = SC.cuts.slice().sort((a, b) => a.min - b.min);
      Object.assign(out, { type: 'levels', unit: 'x', classes: cuts.map((c, k) => ({ level: c.level, label: SC.words[k], max: k < cuts.length - 1 ? cuts[k + 1].min : null })),
        source: 'a ranking of rain-triggered landslide likelihood against an ordinary day here at this time of year, from the forecast and recent rain; each class names how often slides happened on days in that class in the held-out test (the observed ratio, not the model\u2019s own multiplier); ' + SC.customerSource + ' (' + L.version + '). ' + SC.caveat });
    } else if (kind === 'fell') {
      const DD = app.dataDir || join(process.cwd(), 'data'); const dir = join(DD, 'imerg'); let files = [];
      try { files = readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-7).reverse(); } catch (_) {}
      if (!files.length) return { ...out, ready: false, why: 'no satellite rain days on this computer yet (fetched daily once the satellite token is set)' };
      out.periods = files.map(f => ({ id: f.slice(0, 10), label: f.slice(0, 10) })); const f = files[Math.min(i, files.length - 1)]; out.valid = f.slice(0, 10) + ' (UTC day)';
      let J = null; try { J = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch (_) {}
      for (const u of app.units.tehsil) { const v = J && J.units ? J.units[u.unitId] : null; if (v != null && isFinite(v)) out.values[u.unitId] = Math.round(v * 10) / 10; else out.whys[u.unitId] = 'no satellite rain value for this unit on this day'; }
      /* v91.17.283.27 · item 3 · the cuts, words and source are the 24-hour rain classes' one home (data/hazard-scale.json rainClasses24h);
         map-layer-scales.json rain_fell keeps only the layer's own caveat and how the scale is applied */
      let SC = null; try { SC = JSON.parse(readFileSync(join(DD, 'map-layer-scales.json'), 'utf8')).layers.rain_fell; } catch (_) {}
      const RC = rainClassesEntry();
      if (!SC || !RC) return { ...out, ready: false, why: !RC ? 'the 24-hour rain classes are missing from data/hazard-scale.json (rainClasses24h)' : 'the rain_fell scale is missing from data/map-layer-scales.json' };
      const LV = ['Normal', 'Low', 'Moderate', 'High', 'Severe'], mins = [0, ...RC.value];
      Object.assign(out, { type: 'levels', unit: 'mm', classes: mins.map((m, k) => ({ level: LV[k], label: RC.words[k], max: k < mins.length - 1 ? mins[k + 1] : null })),
        source: 'satellite rain estimate, tehsil average (about 10 km), ' + RC.customerSource + (SC.appliedAs ? ', ' + SC.appliedAs : '') + '. ' + SC.caveat });
    } else if (kind === 'veg') {
      const W = app.vegetation ? app.vegetation.weeks() : []; const SC = app.vegetation ? app.vegetation.scale() : null;
      if (!W.length || !SC) return { ...out, ready: false, why: 'no vegetation-health weeks on this computer yet' };
      out.periods = W.map(w => ({ id: w.week, label: w.week })); const w = W[Math.min(i, W.length - 1)]; out.valid = w.week + ' (mid ' + w.mid + ')';
      for (const u of app.units.tehsil) { const v = app.vegetation.unit(u.unitId, Math.min(i, W.length - 1)); if (v && v.vhi != null) out.values[u.unitId] = v.vhi; else out.whys[u.unitId] = (v && v.why) || 'no vegetation value'; }
      /* lower is worse: the classes ascend in VHI, each names its AGN level (data/vegetation-health-scale.json) */
      Object.assign(out, { type: 'levels', unit: 'VHI', classes: SC.cuts.map(c => ({ level: c.level, label: c.word, max: c.max })),
        source: 'satellite vegetation health (greenness and canopy temperature against their own weekly record since 1981, 4 km), median over the vegetated part of each tehsil; bare desert is not scored. Kogan (1995, 2002) classes: under 40 is vegetation drought.' });
    } else if (kind === 'air') {
      const n = app.smog.national(0); if (!n.ready) return { ...out, ready: false };
      out.periods = n.days.map(d => ({ id: d, label: d }));
      for (const u of app.units.tehsil) { const r = app.smog.unit(u.unitId); const d = r && r.days[Math.min(i, r.days.length - 1)]; if (!d) { out.whys[u.unitId] = 'no air-quality forecast for this unit in the latest run (the provider did not return it); it is retried every 3 hours'; continue; }   /* v91.17.101 · the gap has a reason */ out.valid = d.date;
        const v = key === 'pm25' ? d.pm25 : key === 'smog' ? (d.smogDay == null ? null : d.smogDay ? 1 : 0) : key === 'dust' ? d.dust : key === 'fog' ? d.fogHours : key === 'fires' ? (d.fires ? d.fires.cls : null) : d.dispersion; if (v != null) out.values[u.unitId] = v;
        else out.whys[u.unitId] = 'not assessed: the air-quality forecast for this unit holds no ' + (key === 'pm25' ? 'PM2.5' : key === 'fires' ? 'fire' : key) + ' value for this day';   /* v91.17.283 · WS4 · item 3 · a gap has its reason */ }
      Object.assign(out, key === 'pm25' ? { type: 'pm25', unit: 'µg/m³', classes: app.smog.PM_CLASSES.map(c => ({ label: c.label, max: c.max === Infinity ? null : c.max })) }
        : key === 'smog' ? { type: 'binary', unit: '', labels: ['No', 'Smog day'] } : key === 'dust' ? { type: 'amount', unit: 'µg/m³', note: 'dust mass, no class (v283.36 item 19)' } : key === 'fog' ? { type: 'hours', unit: 'h' } : key === 'fires' ? { type: 'classes4', labels: app.smog.FIRE_LABELS() } : { type: 'classes4', labels: app.smog.DISPERSION },
        { source: key === 'fires' ? 'satellite fire detections (last 3 days, within 300 km, weighted toward the forecast wind); explanatory, not verified against monitors' : 'the air-quality forecast and the weather forecast (not verified against monitors)' });
    } else if (kind === 'week' || kind === 'month') {
      const nat = app.outlook.seasonalNational(0, 0); if (!nat.ready) return { ...out, ready: false };
      /* v91.17.101 · audit A · the season layer opens on the first month that is still ahead: the month in progress (ending this
         week on 30 Sep) was the default and is dropped once it has started */
      const curMo = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 7);
      const MO = nat.months.filter(m => String(m).slice(0, 7) > curMo).length ? nat.months.filter(m => String(m).slice(0, 7) > curMo) : nat.months;
      out.periods = (kind === 'week' ? nat.weeks : MO).map(d => ({ id: d, label: d }));
      for (const u of app.units.tehsil) {
        const r = app.outlook.seasonalUnit(u.unitId); if (!r) { out.whys[u.unitId] = 'no sub-seasonal / seasonal forecast for this unit in the stored run (the provider did not return it)'; continue; }   /* v91.17.101 */
        if (kind === 'week') { const all = nat.weeks[i]; const w = r.subseasonal.weeks.find(x => x.start === all) || null; if (w) { out.values[u.unitId] = key === 't' ? w.tAnom : key === 'p' ? w.pAnom : w.pT1; } out.valid = all; }
        else { const mo = MO[Math.min(i, MO.length - 1)]; const m = r.seasonal.months.find(x => x.month === mo);
          if (m) {
            if (key === 't') out.values[u.unitId] = m.tAnom;
            else {
              /* v91.17.36 · AUDIT L05 · a percent anomaly on a dry month is the arid
                 degeneracy again (Chagai Oct: mean 4.5 mm, +3.6 mm = +400 %; national
                 max +667 %). Where the month's mean is under 10 mm the layer carries
                 the reason instead of a colour; elsewhere the percent is kept. */
              /* v91.17.101 · audit A · the screen tests the NORMAL (pNormal), not the forecast total (pMean): a dry forecast on a wet month was hidden */
              const nrm = m.pNormal != null ? m.pNormal : (m.pMean != null && m.pAnom != null ? m.pMean - m.pAnom : null);
              if (nrm != null && nrm < 10) out.whys[u.unitId] = 'not screened: this month\'s normal is ' + Math.round(nrm * 10) / 10 + ' mm, too small for a percent anomaly to mean anything (' + (m.pAnom != null ? (m.pAnom > 0 ? '+' : '') + m.pAnom + ' mm' : 'no anomaly') + ')';
              else out.values[u.unitId] = m.pPct;
            }
          }
          out.valid = mo; }
      }
      Object.assign(out, key === 't' ? { type: 'diverging', unit: '°C', range: kind === 'week' ? 3 : 2.5, palette: 'temp' } : key === 'p' ? { type: 'diverging', unit: kind === 'week' ? 'mm' : '%', range: kind === 'week' ? 20 : 100, palette: 'rain' } : { type: 'chance', unit: '%' },
        { source: (kind === 'week' ? 'weeks-ahead outlook: sub-seasonal forecast against its own re-forecast climate' : 'season-ahead outlook: seasonal forecast against its hindcast climate') + '; an outlook only, no action is raised from it' });
      /* v91.17.101 · audit N5 · the skill gate: what our own record says about this product in Pakistan, on the layer itself */
      try { const V = app.seasVerify && app.seasVerify.summary(); const X = V && (kind === 'week' ? V.ec46 : V.seas5) || {}; const k0 = Object.keys(X)[0]; const a = k0 ? X[k0] : null;
        const issues = V ? (kind === 'week' ? V.logs.ec46 : V.logs.seas5) : 0;
        out.skill = a && a.n ? { scored: k0, tehsilCases: a.n, signHit: a.tHitRate ?? a.tHit ?? null, note: 'measured on ' + issues + ' issue(s) so far; a sign hit rate of 0.5 is a coin toss' } : { scored: null, note: 'skill for Pakistan not yet measured: ' + issues + ' issue(s) logged, scoring starts once the target period has ended' };
        out.confidence = (a && a.n && issues >= 8) ? 'measured' : 'unverified';
        out.source += (out.confidence === 'unverified' ? ' · skill in Pakistan not yet established (our own verification has ' + issues + ' issue(s) logged)' : ''); } catch (_) {}
    } else return { ...out, ready: false, error: 'unknown layer' };
    /* v91.17.71 · the physical mask: no value outside it, the layer's one-line reason instead */
    const OUT = outside(id);
    if (OUT) { let n = 0; for (const [uid, why] of OUT) { if (uid in out.values) delete out.values[uid]; out.whys[uid] = why; n++; } out.mask = { outside: n, reason: (() => { const A = applic(); return A ? ((A.layers || {})[(A.layerMap || {})[id]] || {}).reason : null; })(), source: 'data/hazard-applicability.json' }; }
    out.ready = true; out.count = Object.keys(out.values).length;
    /* v91.17.283 · WS4 · item 1 · every layer names its product type from the model gate (the same field the legend, reports and AI read) */
    try { const t = app.gate && app.gate.tagOf ? app.gate.tagOf(id) : null; if (t) out.productType = t.productType || null; } catch (_) {}
    /* v91.17.15 · F3 · a layer whose every unit returns the same number draws as
       one flat colour, which reads as a failed render. Seven layers are in that
       state today (max ≥ 45 °C, rain ≥ 25/50/100 mm, snow ≥ 10 cm, frost, gusts
       ≥ 60 km/h) and every one of them is correct: nowhere in the window crosses
       the threshold. The map has to say so rather than leave it to be inferred. */
    out.units = app.units.tehsil.filter(u => !u.disputed).length;   /* v91.17.36 · AUDIT L15 · the disputed unit is not 'not screened', it is not scored by design */
    const _v = Object.values(out.values);
    out.uniform = (_v.length > 1 && _v.every(x => x === _v[0])) ? { value: _v[0], n: _v.length } : null;
    return out;
  }
  return { catalogue: () => LAYERS, layer, outside, maskAll };
}
