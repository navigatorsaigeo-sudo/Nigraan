/* Classic scenario-engine control catalogue and client-side sensitivity helpers
   (ported from server/science/modules/034-agn-scenario-engine-v8911.js). Core scores
   here are bounded screening sensitivities for the React sandbox — not forecasts. */

export const HAZARDS = {
  flood: {
    label: 'Flood',
    maturity: 'Physically anchored screening',
    validation: 'Local impact calibration incomplete',
    boundary: 'Flood scenario uses the NIGRAAN pluvial/riverine screening engine. Advanced features remain analytically separate unless an existing core equation already consumes them.',
  },
  heat: {
    label: 'Heat stress',
    maturity: 'Physically anchored screening',
    validation: 'Heat pathway physically anchored; local impact validation incomplete',
    boundary: 'Core response uses the existing heat pathway on cloned temperature, humidity and wind. LST, 850 hPa warmth, stagnation and urban form are contextual diagnostics unless a production heat equation explicitly consumes them.',
  },
  wind: {
    label: 'Wind and gusts',
    maturity: 'Physically anchored screening',
    validation: 'Damage-threshold curve anchored; local impact validation incomplete',
    boundary: 'Core response uses the existing gust-load and terrain-exposure wind pathway. Atmospheric ventilation assumptions and urban exposure remain separate context.',
  },
  drought: {
    label: 'Drought',
    maturity: 'Experimental short-window screening',
    validation: 'Not SPI; impact calibration incomplete',
    boundary: 'Operational SPI-30/90 is not slider-adjusted. The core scenario uses the existing P − ET₀, VPD and root-zone short-window screen. NDVI and NDMI are EO corroboration only until a validated crop-response model is connected.',
  },
  multi: {
    label: 'Multi-driver',
    maturity: 'Parallel pathway comparison',
    validation: 'No compound probability or aggregate score',
    boundary: 'Flood, heat, wind and short-window drought are recalculated in parallel. Advanced diagnostics are reported beside them. Unlike hazards are never collapsed into a synthetic compound score.',
  },
};

export const PRESETS = {
  flood: [
    { key: 'baseline', label: 'Current baseline', v: {}, a: {} },
    { key: 'heavy_rain', label: 'Extreme rainfall', v: { rainIntensity: 22, duration: 3, wetness: 65 }, a: { ndwiChange: 0.06 } },
    { key: 'saturated', label: 'Saturated catchment', v: { rainIntensity: 28, duration: 6, wetness: 92 }, a: { ndmiAnom: 0.08, ndwiChange: 0.04 } },
    { key: 'cloudburst', label: 'Cloudburst test', v: { rainIntensity: 65, duration: 2, wetness: 78 }, a: { ndwiChange: 0.12 } },
    { key: 'urban_runoff', label: 'Urban runoff context', v: { rainIntensity: 35, duration: 2, wetness: 72 }, a: { builtUpPct: 75, popDensity: 6500, ndviAnom: -0.12, lstAnom: 2.5 } },
    { key: 'water_check', label: 'Post-event water check', v: {}, a: { ndwiChange: 0.35 } },
  ],
  heat: [
    { key: 'baseline', label: 'Current baseline', v: {}, a: {} },
    { key: 'dry_heat', label: 'Dry heatwave', v: { tempDelta: 6, rhDelta: -12, windPct: 80 }, a: { lstAnom: 6, t850Delta: 3.5, mslpDelta: 4, ventPct: 25, blhPct: 25, ndviAnom: -0.08, ndmiAnom: -0.08 } },
    { key: 'humid_heat', label: 'Humid heat', v: { tempDelta: 4, rhDelta: 20, windPct: 75 }, a: { lstAnom: 4, t850Delta: 2, mslpDelta: 3, ventPct: 35, blhPct: 35 } },
    { key: 'urban_heat', label: 'Urban heat island', v: { tempDelta: 2.5, rhDelta: 5, windPct: 70 }, a: { lstAnom: 7, t850Delta: 2.5, mslpDelta: 2, ventPct: 20, blhPct: 20, builtUpPct: 80, popDensity: 9000, ndviAnom: -0.18, ndmiAnom: -0.12 } },
    { key: 'stagnation', label: 'Atmospheric stagnation', v: { tempDelta: 1, rhDelta: 0, windPct: 55 }, a: { t850Delta: 1.5, mslpDelta: 8, ventPct: 10, blhPct: 10 } },
    { key: 'extreme_heat', label: 'Extreme heat test', v: { tempDelta: 8, rhDelta: 5, windPct: 60 }, a: { lstAnom: 9, t850Delta: 5, mslpDelta: 5, ventPct: 15, blhPct: 15 } },
  ],
  wind: [
    { key: 'baseline', label: 'Current baseline', v: {}, a: {} },
    { key: 'gust_front', label: 'Gust front', v: { windAdd: 15, gustAdd: 45 }, a: { ventPct: 75, blhPct: 70 } },
    { key: 'severe_gust', label: 'Severe gust', v: { windAdd: 25, gustAdd: 75 }, a: { ventPct: 85, blhPct: 80 } },
    { key: 'urban_wind', label: 'Urban wind exposure', v: { windAdd: 20, gustAdd: 60 }, a: { builtUpPct: 75, popDensity: 8000, ventPct: 60 } },
    { key: 'extreme_gust', label: 'Extreme gust test', v: { windAdd: 35, gustAdd: 105 }, a: { ventPct: 90, blhPct: 85 } },
  ],
  drought: [
    { key: 'baseline', label: 'Current baseline', v: {}, a: {} },
    { key: 'dry_spell', label: 'Dry spell', v: { wbDelta: -12, vpdAdd: 0.6, rootDelta: -0.03 }, a: { ndviAnom: -0.10, ndmiAnom: -0.12, lstAnom: 3, t850Delta: 1.5, phenology: true } },
    { key: 'crop_stress', label: 'Crop stress', v: { wbDelta: -25, vpdAdd: 1.2, rootDelta: -0.07 }, a: { ndviAnom: -0.22, ndmiAnom: -0.18, lstAnom: 5.5, t850Delta: 2.5, phenology: true } },
    { key: 'vegetation_decline', label: 'Vegetation decline', v: { wbDelta: -10, vpdAdd: 0.4, rootDelta: -0.03 }, a: { ndviAnom: -0.28, ndmiAnom: -0.22, lstAnom: 4, phenology: true } },
    { key: 'severe_deficit', label: 'Severe deficit test', v: { wbDelta: -40, vpdAdd: 1.8, rootDelta: -0.10 }, a: { ndviAnom: -0.32, ndmiAnom: -0.25, lstAnom: 7, t850Delta: 3.5, phenology: true } },
  ],
  multi: [
    { key: 'baseline', label: 'Current baseline', v: {}, a: {} },
    { key: 'monsoon_heat', label: 'Hot wet monsoon', v: { rainIntensity: 28, duration: 4, wetness: 82, tempDelta: 4, rhDelta: 15, windPct: 85, windAdd: 10, gustAdd: 35, wbDelta: -8, vpdAdd: 0.4, rootDelta: -0.02 }, a: { lstAnom: 4, t850Delta: 2.5, mslpDelta: 2, ventPct: 35, blhPct: 35, ndviAnom: -0.05, ndmiAnom: 0.03, ndwiChange: 0.15, builtUpPct: 55, popDensity: 5000 } },
    { key: 'hot_dry_wind', label: 'Hot dry wind', v: { rainIntensity: 0, duration: 1, wetness: 25, tempDelta: 7, rhDelta: -18, windPct: 120, windAdd: 25, gustAdd: 60, wbDelta: -28, vpdAdd: 1.6, rootDelta: -0.08 }, a: { lstAnom: 7, t850Delta: 4, mslpDelta: 3, ventPct: 70, blhPct: 65, ndviAnom: -0.22, ndmiAnom: -0.20, popDensity: 3000 } },
    { key: 'compound_stress', label: 'Compound stress test', v: { rainIntensity: 35, duration: 3, wetness: 90, tempDelta: 5, rhDelta: 10, windPct: 90, windAdd: 18, gustAdd: 50, wbDelta: -20, vpdAdd: 1.0, rootDelta: -0.05 }, a: { lstAnom: 6, t850Delta: 3, mslpDelta: 6, ventPct: 20, blhPct: 18, ndviAnom: -0.18, ndmiAnom: -0.15, ndwiChange: 0.10, builtUpPct: 70, popDensity: 7000 } },
    { key: 'urban_heat_stagnation', label: 'Urban heat + stagnation', v: { tempDelta: 4, rhDelta: 8, windPct: 55 }, a: { lstAnom: 8, t850Delta: 3.5, mslpDelta: 8, ventPct: 10, blhPct: 10, builtUpPct: 85, popDensity: 9500, ndviAnom: -0.20 } },
  ],
};

export const CORE_DEFS = {
  flood: [
    { id: 'rainIntensity', label: 'Rain rate', unit: 'mm/h', min: 0, max: 100, step: 1, scientific: 'Feeds the existing PK-tuned rainfall-intensity curve.', base: (b) => Math.max(0, num(b.inp.rain) || 0) },
    { id: 'duration', label: 'Storm length', unit: 'h', min: 1, max: 6, step: 1, scientific: 'Defines the hypothetical 1–6 h accumulation as intensity × duration.', base: () => 1 },
    { id: 'wetness', label: 'Ground wetness before the storm (percentile of the wet-season record)', unit: '', min: 0, max: 100, step: 1, scientific: 'Feeds the existing antecedent-wetness amplifier/API pathway.', base: (b) => Math.round((num(b.inp.api) || 0) * 100) },
  ],
  heat: [
    { id: 'tempDelta', label: 'Air temperature change', unit: '°C', min: -5, max: 12, step: 0.5, scientific: 'Changes the same dry-bulb and wet-bulb heat inputs.', base: () => 0 },
    { id: 'rhDelta', label: 'Humidity change', unit: '% points', min: -40, max: 40, step: 1, scientific: 'Changes wet-bulb load and apparent temperature.', base: () => 0 },
    { id: 'windPct', label: "Wind strength, share of today's", unit: '%', min: 20, max: 180, step: 5, scientific: 'Used only through the existing apparent-temperature/comfort calculation before heat scoring.', base: () => 100 },
  ],
  wind: [
    { id: 'windAdd', label: 'Wind speed change', unit: 'km/h', min: -30, max: 80, step: 5, scientific: 'Changes sustained wind; used as fallback if gust is unavailable.', base: () => 0 },
    { id: 'gustAdd', label: 'Gust change', unit: 'km/h', min: -50, max: 140, step: 5, scientific: 'Feeds the existing gust damage-threshold curve directly.', base: () => 0 },
  ],
  drought: [
    { id: 'wbDelta', label: 'Rain minus evaporation, change over 4 days', unit: 'mm', min: -60, max: 30, step: 1, scientific: 'Changes the same water-balance deficit term used by the NIGRAAN fallback screen.', base: () => 0 },
    { id: 'vpdAdd', label: 'Air dryness change (VPD)', unit: 'kPa', min: -1.5, max: 3, step: 0.1, scientific: 'Changes the same atmospheric-demand term.', base: () => 0 },
    { id: 'rootDelta', label: 'Root-zone soil moisture change', unit: 'm³/m³', min: -0.15, max: 0.15, step: 0.01, scientific: 'Applied only when a root-zone baseline exists; otherwise this term stays unavailable.', base: () => 0, optional: 'root' },
  ],
};
CORE_DEFS.multi = [...CORE_DEFS.flood, ...CORE_DEFS.heat, ...CORE_DEFS.wind, ...CORE_DEFS.drought];

export const ADV_GROUPS = {
  eo: [
    { id: 'ndviAnom', label: 'Vegetation greenness change (NDVI)', unit: 'index', min: -0.40, max: 0.30, step: 0.01, status: 'scenario', role: 'Vegetation-condition evidence. Does not directly modify core hazard.', base: () => 0 },
    { id: 'ndmiAnom', label: 'Plant moisture change (NDMI)', unit: 'index', min: -0.35, max: 0.30, step: 0.01, status: 'scenario', role: 'Canopy-moisture evidence for drought/agriculture interpretation.', base: () => 0 },
    { id: 'ndwiChange', label: 'Open water change (NDWI)', unit: 'index', min: -0.30, max: 0.60, step: 0.01, status: 'scenario', role: 'Post-event surface-water change candidate; never a flood forecast.', base: () => 0 },
    { id: 'lstAnom', label: 'Ground surface temperature change', unit: '°C', min: -3, max: 12, step: 0.1, status: 'scenario', role: 'Surface thermal context; kept separate from 2 m air-temperature hazard physics.', base: () => 0 },
  ],
  atmosphere: [
    { id: 't850Delta', label: 'Air-mass temperature change (850 hPa, about 1.5 km up)', unit: '°C', min: -5, max: 10, step: 0.1, status: 'context', role: 'Warm-air-mass persistence context; scenario delta applied to the modelled 850 hPa baseline when available.', base: () => 0 },
    { id: 'mslpDelta', label: 'Sea-level pressure change', unit: 'hPa', min: -10, max: 15, step: 0.5, status: 'context', role: 'Synoptic-pressure context only; not a pollution or hazard score.', base: () => 0 },
    { id: 'ventPct', label: 'Air ventilation', unit: 'percentile', min: 0, max: 100, step: 1, status: 'context', role: 'Scenario percentile assumption. A climatological percentile service is not connected in this HTML.', base: () => 50 },
    { id: 'blhPct', label: 'Mixing height', unit: 'percentile', min: 0, max: 100, step: 1, status: 'context', role: 'Scenario percentile assumption. Live BLH metres are shown separately when available.', base: () => 50 },
  ],
  exposure: [
    { id: 'builtUpPct', label: 'Built-up area', unit: '%', min: 0, max: 100, step: 1, status: 'exposure', role: 'LCZ morphology / urban exposure context. Does not make meteorological hazard larger by itself.', base: (b) => (num(b.adv.builtUpPct) != null ? num(b.adv.builtUpPct) : 0), optional: 'built' },
    { id: 'popDensity', label: 'Population density', unit: 'people/km²', min: 0, max: 15000, step: 100, status: 'exposure', role: 'Resident exposure context from population / polygon area when available; never a physical hazard driver.', base: (b) => (num(b.adv.popDensity) != null ? Math.min(15000, num(b.adv.popDensity)) : 0), optional: 'pop' },
    { id: 'phenology', label: 'Crop growing season', type: 'checkbox', status: 'scenario', role: 'Gates agricultural interpretation of NDVI/NDMI only; it does not alter meteorological drought physics.', base: () => true },
  ],
};

export const STRESS_HAZARDS = [
  ['heat', 'Heat stress'],
  ['cold', 'Cold stress (UTCI)'],
  ['wind', 'Wind and gusts'],
  ['rain', 'Heavy rain'],
  ['flood', 'Flood'],
  ['landslide', 'Landslide'],
  ['drought', 'Drought'],
];

export const WET_OPTIONS = [
  ['', "the place's current wetness"],
  ['10', 'dry (10th percentile)'],
  ['50', 'normal (50th percentile)'],
  ['75', 'wet (75th percentile)'],
  ['90', 'very wet (90th percentile)'],
];

export const MC_WHY = 'The joint heat-and-flood chance is withheld. Its heat part converts the spread of the forecast runs’ air temperature into the heat screening index with a fixed slope (2.8 index points per °C) that comes from no published method. It returns when the heat part is worked out from each run’s own UTCI (the measure the heat level uses), so that no slope is typed in.';

export const MC_HOW = 'What it simulates: how often heat and flooding both reach Watch (High on the map) on the same day at this place, as a chance out of 100 for the coming days — not a yearly probability. Inputs: the forecast runs held for the place. Method: 10,000 replays of those runs; a wide range means the runs disagree. The result is withheld in this release (see the note).';

export const ADV_DEFS = [...ADV_GROUPS.eo, ...ADV_GROUPS.atmosphere, ...ADV_GROUPS.exposure];

export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function fmt(v, d = 1, s = '') {
  return num(v) == null ? '—' : `${Number(v).toFixed(d)}${s}`;
}

export function clamp(v, a = 0, b = 100) {
  return Math.max(a, Math.min(b, Number(v)));
}

export function baseControlValue(def, baseline) {
  return def.type === 'checkbox' ? !!def.base(baseline) : Number(def.base(baseline));
}

export function defaultsForHazard(hazard, baseline) {
  const values = {};
  (CORE_DEFS[hazard] || []).forEach((d) => { values[d.id] = baseControlValue(d, baseline); });
  const advanced = {};
  ADV_DEFS.forEach((d) => { advanced[d.id] = baseControlValue(d, baseline); });
  return { values, advanced };
}

function droughtScreen(inp) {
  const terms = [];
  const weights = [];
  const detail = [];
  const wb = num(inp.waterBalance);
  const vp = num(inp.vpd);
  const sr = num(inp.smRoot);
  if (wb != null) {
    const t = clamp((-wb / 40) * 100, 0, 100);
    terms.push(t); weights.push(0.55);
    detail.push(['P − ET0 deficit', `${wb.toFixed(1)} mm`, `${t.toFixed(0)}/100`, '4-day water-balance forcing']);
  }
  if (vp != null && wb == null) {
    const t = clamp(((vp - 1.0) / 2.5) * 100, 0, 100);
    terms.push(t); weights.push(0.20);
    detail.push(['VPD', `${vp.toFixed(2)} kPa`, `${t.toFixed(0)}/100`, 'atmospheric evaporative demand']);
  }
  if (sr != null) {
    const avail = Math.max(0, Math.min(1, (sr - 0.12) / Math.max(1e-6, 0.32 - 0.12)));
    const t = clamp((1 - avail) * 100, 0, 100);
    terms.push(t); weights.push(0.25);
    detail.push(['Root-zone moisture', `${sr.toFixed(3)} m³/m³`, `${t.toFixed(0)}/100`, 'FAO-inspired available-water depletion']);
  }
  if (!terms.length) return { score: null, top: 'No short-window drought inputs', detail };
  let tw = 0;
  let acc = 0;
  weights.forEach((w, i) => { tw += w; acc += w * terms[i]; });
  return { score: clamp(acc / Math.max(1e-6, tw), 0, 100), top: terms.length === 3 ? 'Water balance + VPD + root zone' : 'Partial water-stress screen', detail };
}

function floodScore(rain, wet, dur) {
  const intensity = clamp((rain / 40) * 70, 0, 70);
  const accum = clamp(((rain * Math.max(1, dur)) / 120) * 20, 0, 20);
  const antecedent = clamp((wet / 100) * 25, 0, 25);
  const score = clamp(intensity + accum + antecedent, 0, 100);
  const top = rain <= 0.2 ? 'Antecedent only — no rain falling' : (rain >= 40 ? 'Intensity-dominated screening' : 'Rainfall + wetness screening');
  return { score, top };
}

function heatScore(t, hum, wind) {
  if (t == null || hum == null) return { score: null, top: 'temperature or humidity missing' };
  const feels = t + 0.33 * (hum / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t)) - 0.7 * Math.max(0, (wind || 0) / 3.6) - 4;
  const score = clamp(((feels - 26) / 18) * 100, 0, 100);
  return { score, top: feels >= 38 ? 'High apparent-temperature load' : 'Existing comfort physics before heat score', feels };
}

function windScore(gust) {
  if (gust == null) return { score: null, top: 'no wind or gust' };
  const score = clamp(((gust - 40) / 80) * 100, 0, 100);
  return { score, top: gust >= 90 ? 'Gust damage-threshold region' : 'Gust screening' };
}

export function evaluateHazard(hazard, baseline, values) {
  const b = baseline;
  if (hazard === 'flood') {
    const rain = Math.max(0, Number(values.rainIntensity) || 0);
    const dur = Math.max(1, Math.min(6, Number(values.duration) || 1));
    const wet = clamp(Number(values.wetness) || 0, 0, 100);
    const scen = floodScore(rain, wet, dur);
    const base = floodScore(Math.max(0, num(b.inp.rain) || 0), Math.round((num(b.inp.api) || 0) * 100), 1);
    return {
      score: scen.score,
      baseScore: base.score,
      raw: scen,
      drivers: [
        ['Rain intensity', fmt(b.inp.rain, 1, ' mm/h'), fmt(rain, 1, ' mm/h'), 'PK-tuned intensity curve'],
        ['Storm accumulation', 'current observed window', fmt(rain * dur, 1, ' mm'), 'scenario assumes constant intensity × duration'],
        ['Antecedent wetness', fmt((num(b.inp.api) || 0) * 100, 0, '%'), fmt(wet, 0, '%'), 'existing API/wetness amplifier'],
        ['River state', 'unchanged / unavailable', 'unchanged / unavailable', 'held at current baseline; not scenario-generated'],
      ],
    };
  }
  if (hazard === 'heat') {
    if (num(b.inp.t) == null || num(b.inp.hum) == null) {
      return { score: null, baseScore: null, unavailable: true, why: 'temperature or humidity missing: no heat sensitivity is computed', drivers: [] };
    }
    const t = (num(b.inp.t) || 0) + Number(values.tempDelta || 0);
    const hum = clamp((num(b.inp.hum) || 50) + Number(values.rhDelta || 0), 1, 100);
    const wind = Math.max(0, (num(b.inp.wind) || 0) * Number(values.windPct || 100) / 100);
    const scen = heatScore(t, hum, wind);
    const base = heatScore(num(b.inp.t), num(b.inp.hum), num(b.inp.wind));
    return {
      score: scen.score,
      baseScore: base.score,
      raw: scen,
      drivers: [
        ['Air temperature', fmt(b.inp.t, 1, '°C'), fmt(t, 1, '°C'), 'dry-heat + wet-bulb inputs'],
        ['Relative humidity', fmt(b.inp.hum, 0, '%'), fmt(hum, 0, '%'), 'wet-bulb load'],
        ['Wind', fmt(b.inp.wind, 0, ' km/h'), fmt(wind, 0, ' km/h'), 'apparent-temperature calculation'],
        ['Apparent temperature', fmt(b.inp.feels, 1, '°C'), fmt(scen.feels, 1, '°C'), 'existing comfort physics before heat score'],
      ],
    };
  }
  if (hazard === 'wind') {
    if (num(b.inp.gust) == null && num(b.inp.wind) == null) {
      return { score: null, baseScore: null, unavailable: true, why: 'no wind or gust for this place: no wind sensitivity is computed', drivers: [] };
    }
    const wind = Math.max(0, (num(b.inp.wind) || 0) + Number(values.windAdd || 0));
    const bg = num(b.inp.gust) != null ? num(b.inp.gust) : (num(b.inp.wind) || 0) * 1.5;
    const gust = Math.max(0, bg + Number(values.gustAdd || 0));
    const scen = windScore(gust);
    const base = windScore(bg);
    return {
      score: scen.score,
      baseScore: base.score,
      raw: scen,
      drivers: [
        ['Sustained wind', fmt(b.inp.wind, 0, ' km/h'), fmt(wind, 0, ' km/h'), 'fallback support'],
        ['Gust', fmt(bg, 0, ' km/h'), fmt(gust, 0, ' km/h'), 'damage-threshold driver'],
        ['Terrain', '—', '—', 'held constant'],
        ['Exposure factor', 'baseline', 'engine derived', 'terrain-derived; not user-adjusted'],
      ],
    };
  }
  if (hazard === 'drought') {
    if (num(b.inp.waterBalance) == null && num(b.inp.vpd) == null && num(b.inp.smRoot) == null) {
      return {
        score: null,
        unavailable: true,
        reason: 'Core drought scenario unavailable — baseline P−ET₀, VPD and root-zone moisture are all missing for this unit. Advanced NDVI/NDMI diagnostics remain available.',
        drivers: [],
      };
    }
    const inp = {
      waterBalance: num(b.inp.waterBalance) != null ? num(b.inp.waterBalance) + Number(values.wbDelta || 0) : null,
      vpd: num(b.inp.vpd) != null ? Math.max(0, num(b.inp.vpd) + Number(values.vpdAdd || 0)) : null,
      smRoot: num(b.inp.smRoot) != null ? clamp(num(b.inp.smRoot) + Number(values.rootDelta || 0), 0, 1) : null,
    };
    const scen = droughtScreen(inp);
    const base = droughtScreen(b.inp);
    const drivers = [
      ['P − ET0', fmt(b.inp.waterBalance, 1, ' mm'), fmt(inp.waterBalance, 1, ' mm'), 'water-balance forcing'],
      ['VPD', fmt(b.inp.vpd, 2, ' kPa'), fmt(inp.vpd, 2, ' kPa'), 'atmospheric demand'],
      ['Root-zone moisture', fmt(b.inp.smRoot, 3, ' m³/m³'), fmt(inp.smRoot, 3, ' m³/m³'), 'available-water depletion'],
    ];
    return { score: scen.score, baseScore: base.score, raw: scen, drivers };
  }
  return { score: null, drivers: [] };
}

export function advancedDiagnostics(baseline, advanced) {
  const a = advanced || {};
  const phen = !!a.phenology;
  const ndvi = Number(a.ndviAnom || 0);
  const ndmi = Number(a.ndmiAnom || 0);
  const lst = Number(a.lstAnom || 0);
  const t850 = Number(a.t850Delta || 0);
  const mslp = Number(a.mslpDelta || 0);
  const vent = Number(a.ventPct == null ? 50 : a.ventPct);
  const blh = Number(a.blhPct == null ? 50 : a.blhPct);
  const ndwi = Number(a.ndwiChange || 0);
  const built = Number(a.builtUpPct || 0);
  const pop = Number(a.popDensity || 0);

  let veg = 'Limited departure';
  let vegNote = 'NDVI/NDMI are scenario anomalies, not live EO observations.';
  if (!phen) { veg = 'Phenology gate off'; vegNote = 'Crop interpretation is withheld outside the declared phenology window.'; }
  else if (ndvi <= -0.20 || ndmi <= -0.15) veg = 'Strong negative signal';
  else if (ndvi <= -0.10 || ndmi <= -0.08) veg = 'Moderate negative signal';
  else if (ndvi >= 0.10 && ndmi >= 0.08) veg = 'Positive vegetation/moisture signal';

  let thermal = 'Limited thermal departure';
  if (lst >= 6 || t850 >= 3.5) thermal = 'Strong warm persistence context';
  else if (lst >= 3 || t850 >= 2) thermal = 'Elevated warm persistence context';
  else if (lst <= -1 || t850 <= -1) thermal = 'Cooler surface / air-mass context';

  const n = (mslp >= 5 ? 1 : 0) + (vent <= 25 ? 1 : 0) + (blh <= 25 ? 1 : 0);
  const stag = n === 3 ? 'Strong stagnation setup' : n === 2 ? 'Elevated stagnation setup' : 'Limited stagnation setup';
  const water = ndwi >= 0.20 ? 'Strong water-change candidate' : ndwi >= 0.05 ? 'Water-change candidate' : ndwi <= -0.05 ? 'Lower open-water signal' : 'No material NDWI change';
  let urban = 'Exposure context';
  if ((num(baseline.adv.builtUpPct) != null && built > baseline.adv.builtUpPct + 15)
    || (num(baseline.adv.popDensity) != null && pop > baseline.adv.popDensity * 1.5)) {
    urban = 'Higher urban/exposure scenario';
  }

  return [
    { title: 'Vegetation / canopy moisture', state: veg, note: vegNote, raw: `NDVI ${ndvi >= 0 ? '+' : ''}${ndvi.toFixed(2)} · NDMI ${ndmi >= 0 ? '+' : ''}${ndmi.toFixed(2)}`, warn: veg !== 'Limited departure' && veg !== 'Positive vegetation/moisture signal' },
    { title: 'Surface & warm-air context', state: thermal, note: 'LST and T850 are context diagnostics; they do not silently replace 2 m air temperature.', raw: `LST ${lst >= 0 ? '+' : ''}${lst.toFixed(1)}°C · T850 ${t850 >= 0 ? '+' : ''}${t850.toFixed(1)}°C`, warn: thermal.startsWith('Strong') },
    { title: 'Atmospheric stagnation', state: stag, note: 'Directional heuristic from pressure + ventilation + BLH assumptions. Not AQI and not emissions modelling.', raw: `MSLP ${mslp >= 0 ? '+' : ''}${mslp.toFixed(1)} hPa · vent ${Math.round(vent)}th · BLH ${Math.round(blh)}th`, warn: n >= 2 },
    { title: 'Open-water change', state: water, note: 'NDWI is confirmation context only. Cloud mask, pre-event baseline and preferably SAR are required for inundation evidence.', raw: `NDWI Δ ${ndwi >= 0 ? '+' : ''}${ndwi.toFixed(2)}`, warn: ndwi >= 0.05 },
    { title: 'Urban form & exposure', state: urban, note: 'Built-up and population affect exposure/context. They do not increase meteorological hazard by themselves.', raw: `Built ${Math.round(built)}% · ${Math.round(pop).toLocaleString()} /km²`, warn: false },
  ];
}

export function advBaselineDisplay(def, baseline) {
  if (def.id === 't850Delta') return num(baseline.adv.liveT850) != null ? fmt(baseline.adv.liveT850, 1, '°C') : '—';
  if (def.id === 'mslpDelta') return num(baseline.adv.liveMslp) != null ? fmt(baseline.adv.liveMslp, 0, ' hPa') : '—';
  if (def.id === 'blhPct') return num(baseline.adv.liveBlh) != null ? fmt(baseline.adv.liveBlh, 0, ' m live') : '—';
  if (def.id === 'ventPct') return 'climatology not connected';
  if (def.id === 'builtUpPct') return num(baseline.adv.builtUpPct) != null ? fmt(baseline.adv.builtUpPct, 0, '%') : '—';
  if (def.id === 'popDensity') return num(baseline.adv.popDensity) != null ? `${Math.round(baseline.adv.popDensity).toLocaleString()} /km²` : '—';
  if (def.id === 'phenology') return 'scenario assumption';
  return '0.00 anomaly';
}

export function advScenarioDisplay(def, value, baseline) {
  if (def.id === 'phenology') return value ? 'Valid window' : 'Outside / unspecified';
  if (def.id === 't850Delta' && num(baseline.adv.liveT850) != null) return `${fmt(baseline.adv.liveT850 + Number(value), 1, '°C')} (${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(1)})`;
  if (def.id === 'mslpDelta' && num(baseline.adv.liveMslp) != null) return `${fmt(baseline.adv.liveMslp + Number(value), 0, ' hPa')} (${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(1)})`;
  if (def.id === 'builtUpPct') return num(baseline.adv.builtUpPct) == null && Number(value) === 0 ? '—' : fmt(value, 0, '%');
  if (def.id === 'popDensity') return num(baseline.adv.popDensity) == null && Number(value) === 0 ? '—' : `${Math.round(value).toLocaleString()} /km²`;
  if (def.id === 'ventPct' || def.id === 'blhPct') return `${Math.round(value)}th percentile assumption`;
  if (def.id === 't850Delta' || def.id === 'lstAnom') return `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(1)}°C`;
  if (def.id === 'mslpDelta') return `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(1)} hPa`;
  return `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}`;
}

function seedFrom(obj) {
  const t = JSON.stringify(obj);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < t.length; i += 1) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(arr, q) {
  if (!arr.length) return null;
  const s = [...arr].sort((x, y) => x - y);
  const p = (s.length - 1) * q;
  const lo = Math.floor(p);
  const hi = Math.ceil(p);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (p - lo);
}

export function runSensitivitySweep({ hazard, baseline, values, advanced, n = 500, selectedCore, selectedAdv }) {
  const rand = rng(seedFrom({ h: hazard, v: values, a: advanced, n, b: baseline.name, ver: '89.11-react' }));
  const coreSel = new Set(selectedCore || []);
  const advSel = new Set(selectedAdv || []);
  const hazards = hazard === 'multi' ? ['flood', 'heat', 'wind', 'drought'] : [hazard];
  const pathways = hazards.map((h) => {
    const defs = CORE_DEFS[h] || [];
    const bv = Object.fromEntries(defs.map((d) => [d.id, baseControlValue(d, baseline)]));
    const target = { ...bv, ...values };
    const scores = [];
    for (let i = 0; i < n; i += 1) {
      const v = {};
      defs.forEach((d) => {
        const a = Number(bv[d.id]);
        const z = Number(target[d.id]);
        v[d.id] = coreSel.has(d.id) ? a + (z - a) * rand() : z;
      });
      const r = evaluateHazard(h, baseline, v);
      if (r && num(r.score) != null) scores.push(Number(r.score));
    }
    return {
      hazard: h,
      label: HAZARDS[h].label,
      n: scores.length,
      p10: quantile(scores, 0.1),
      p50: quantile(scores, 0.5),
      p90: quantile(scores, 0.9),
      min: scores.length ? Math.min(...scores) : null,
      max: scores.length ? Math.max(...scores) : null,
    };
  });
  const advancedRows = ADV_DEFS.filter((d) => d.type !== 'checkbox' && advSel.has(d.id)).map((d) => {
    const a = Number(baseControlValue(d, baseline));
    const z = Number(Object.prototype.hasOwnProperty.call(advanced, d.id) ? advanced[d.id] : a);
    const vals = [];
    for (let i = 0; i < n; i += 1) vals.push(a + (z - a) * rand());
    return { d, p10: quantile(vals, 0.1), p50: quantile(vals, 0.5), p90: quantile(vals, 0.9) };
  });
  return { n, pathways, advancedRows };
}

function partValue(parts, key) {
  const row = parts?.[key];
  if (!row || typeof row !== 'object') return row || null;
  return Object.prototype.hasOwnProperty.call(row, 'v') ? row.v : row;
}

function landHourIndex(land, nowTime) {
  const times = land?.hourly?.time || [];
  if (!times.length) return null;
  const want = String(nowTime || land?.current?.time || '');
  if (!want) return times.length - 1;
  const exact = times.indexOf(want);
  if (exact >= 0) return exact;
  const hour = want.slice(0, 13);
  for (let i = 0; i < times.length; i += 1) {
    if (String(times[i]).startsWith(hour)) return i;
  }
  return Math.max(0, times.length - 1);
}

function landSeries(land, key, index) {
  const arr = land?.hourly?.[key];
  if (!Array.isArray(arr) || index == null || index < 0 || index >= arr.length) return null;
  return num(arr[index]);
}

function landWindowSum(land, key, index, hours) {
  const arr = land?.hourly?.[key];
  if (!Array.isArray(arr) || index == null) return null;
  const from = Math.max(0, index - (hours - 1));
  let sum = 0;
  let n = 0;
  for (let i = from; i <= index; i += 1) {
    const v = num(arr[i]);
    if (v == null) continue;
    sum += v;
    n += 1;
  }
  return n ? sum : null;
}

/** Open-Meteo model inputs at the point (temperature_850hPa, pressure_msl). Mask 850 hPa when surface pressure is at or below 850 hPa. */
export function omLiveFromInputs(inputs, nowTime) {
  const hourly = inputs?.hourly;
  if (!hourly || !Array.isArray(hourly.time) || !hourly.time.length) {
    return { liveT850: null, liveMslp: null, t850Masked: null };
  }
  const landLike = { hourly };
  const hi = landHourIndex(landLike, nowTime);
  const msl = landSeries(landLike, 'pressure_msl', hi);
  const sp = landSeries(landLike, 'surface_pressure', hi);
  let t850 = landSeries(landLike, 'temperature_850hPa', hi);
  let t850Masked = null;
  if (sp != null && sp <= 850) {
    t850 = null;
    t850Masked = `850 hPa is below the ground here (surface pressure ${Math.round(sp)} hPa)`;
  }
  return { liveT850: t850, liveMslp: msl, t850Masked };
}

export function baselineFromBundle(place, bundle, omInputs = null) {
  const now = bundle?.now || bundle?.shown?.now || {};
  const parts = bundle?.parts || {};
  const ctx = partValue(parts, 'context') || {};
  const land = partValue(parts, 'land') || {};
  const facts = partValue(parts, 'facts') || {};
  const fields = facts.fields || {};
  const landCover = fields.landCover?.value || fields.landCover || {};
  const hi = landHourIndex(land, now.time || land.current?.time);
  const cur = land.current || {};
  const name = place?.name || ctx.place?.name || ctx.name || 'Selected location';
  const om = omLiveFromInputs(omInputs, now.time || land.current?.time);

  const soil = num(cur.soil_moisture_0_to_1cm ?? landSeries(land, 'soil_moisture_0_to_1cm', hi));
  const smRoot = num(cur.soil_moisture_27_to_81cm ?? cur.soil_moisture_9_to_27cm ?? landSeries(land, 'soil_moisture_9_to_27cm', hi));
  const vpd = num(cur.vapour_pressure_deficit ?? landSeries(land, 'vapour_pressure_deficit', hi) ?? ctx.vpd ?? now.vpd);
  const et0 = num(cur.et0_fao_evapotranspiration ?? landSeries(land, 'et0_fao_evapotranspiration', hi) ?? ctx.et0);
  const rainHour = num(now.rainMmH ?? now.rainMm ?? now.rain ?? landSeries(land, 'precipitation', hi) ?? ctx.rain);
  const precip4d = landWindowSum(land, 'precipitation', hi, 96);
  const et04d = landWindowSum(land, 'et0_fao_evapotranspiration', hi, 96);
  const waterBalance = num(ctx.waterBalance ?? ctx.wb)
    ?? (precip4d != null && et04d != null ? precip4d - et04d : null);
  const wet = num(ctx.api ?? ctx.wetness ?? ctx.antecedentWetness)
    ?? (soil != null ? soil : null);

  const built = num(
    ctx.builtUpPct
    ?? ctx.builtFraction
    ?? landCover.built
    ?? fields.builtUpPct
    ?? fields.builtFraction,
  );
  const pop = num(ctx.popDensity ?? ctx.populationDensity ?? fields.popDensity ?? fields.populationDensity);

  const inp = {
    t: num(now.tempC ?? now.t ?? ctx.t),
    hum: num(now.rh ?? now.hum ?? ctx.hum),
    wind: num(now.windKmh ?? now.wind ?? ctx.wind),
    gust: num(now.gustKmh ?? now.gust ?? ctx.gust),
    rain: rainHour,
    feels: num(now.feelsC ?? now.feels ?? ctx.feels),
    api: wet != null ? (wet > 1 ? wet / 100 : wet) : null,
    waterBalance,
    vpd,
    smRoot,
    et0,
  };
  const adv = {
    ndviAnom: 0,
    ndmiAnom: 0,
    ndwiChange: 0,
    lstAnom: 0,
    t850Delta: 0,
    mslpDelta: 0,
    ventPct: 50,
    blhPct: 50,
    builtUpPct: built,
    popDensity: pop,
    phenology: true,
    liveT850: num(om.liveT850 ?? ctx.t850 ?? now.t850 ?? fields.t850 ?? landSeries(land, 'temperature_850hPa', hi)),
    liveMslp: num(om.liveMslp ?? ctx.mslp ?? ctx.pressureMsl ?? now.mslp ?? now.pressureMsl ?? landSeries(land, 'pressure_msl', hi)),
    liveBlh: num(ctx.blh ?? now.blh ?? landSeries(land, 'boundary_layer_height', hi)),
    t850Masked: om.t850Masked || null,
    builtSource: ctx.builtSource || (landCover.built != null ? (fields.landCover?.source || 'ESA WorldCover built fraction') : 'LCZ / morphology when available'),
    popSource: ctx.popSource || 'population grid when available',
  };
  if (adv.builtUpPct != null && adv.builtUpPct <= 1) adv.builtUpPct *= 100;
  return { name, inp, adv, place };
}

export function forecastDays(offset = 0) {
  const pkt = new Date(Date.now() + 5 * 3600e3 + offset * 864e5);
  return pkt.toISOString().slice(0, 10);
}
