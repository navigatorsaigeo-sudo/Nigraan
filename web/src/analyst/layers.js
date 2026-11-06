export const LAYER_GROUPS = [
  {
    label: 'Event hazards',
    items: [
      ['flood', 'Flood'],
      ['flood_pluvial', 'Flood — pluvial only'],
      ['flood_riverine', 'Flood — riverine'],
      ['landslide', 'Landslide'],
      ['glof', 'GLOF'],
    ],
  },
  {
    label: 'Stress conditions',
    items: [
      ['heat', 'Heat stress'],
      ['cold', 'Cold stress'],
      ['wind', 'Wind'],
      ['drought', 'Drought'],
    ],
  },
  {
    label: 'Land and water',
    items: [
      ['nss_baseline', 'Ground sponge — usual'],
      ['nss_dynamic', 'Ground sponge — today'],
      ['nss_runoff', 'Runoff potential'],
    ],
  },
  {
    label: 'Geography',
    items: [
      ['seismic', 'Seismic'],
      ['cyclone', 'Cyclone exposure'],
    ],
  },
  {
    label: 'Measured, not ranked',
    items: [
      ['rain_hz', 'Heavy rain'],
      ['aqi', 'Air quality'],
    ],
  },
];

export const LAYERS = LAYER_GROUPS.flatMap((group) => group.items.map(([id, name]) => ({ id, name })));

export const LAYER_ABOUT = {
  heat: 'Plan outdoor work, hours, water and rest. The colour is the tehsil heat level from the issued forecast run.',
  cold: 'Cold stress for each tehsil from the issued forecast run.',
  wind: 'Wind level for each tehsil from the issued forecast run. The gust levels are not tested, so the map shows the forecast gust instead.',
  wind_gust: 'Forecast gust for each tehsil, in kilometres per hour. Display bins, not a tested wind level.',
  drought: 'Drought level for each tehsil from the issued forecast run.',
  flood: 'Flood screening for each tehsil. A grey tehsil was not tested.',
  flood_pluvial: 'Local rain flood, over hours, where that method applies.',
  flood_riverine: 'River-flood level where the method has a gauged reach. A grey tehsil is not a zero.',
  landslide: 'Landslide screening level for each tehsil.',
  glof: 'Glacial-lake outburst screening where the inventory applies.',
  nss_baseline: 'How much water the ground usually absorbs, at 250 m.',
  nss_dynamic: 'How wet the ground is in this forecast run.',
  nss_runoff: 'How readily this storm would run off.',
  seismic: 'Background seismic susceptibility. Not today\'s weather.',
  cyclone: 'Coastal cyclone exposure. Not today\'s weather.',
  rain_hz: 'Heavy-rain level for each tehsil. A forecast level, not a gauge reading.',
  aqi: 'Air quality where the method has a value. Not a hazard rank.',
  rain_amount: 'Rain forecast amount in millimetres. A forecast value, not a tested hazard level.',
  heat_index: 'Heat index for the tehsil. A reference, not a tested hazard level. Today is not tested; the next days use the heat-index bands.',
};

export const LEVEL_COLOURS = ['#74c476', '#ffe680', '#fdae61', '#e8552d', '#a50026'];
export const LEVEL_WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
export const AQI_COLOURS = ['#74c476', '#ffe680', '#fdae61', '#e8552d', '#a50026', '#7a0177'];
export const HEAT_INDEX_WORDS = ['Below Extreme Caution', 'Extreme Caution', 'Danger or higher'];
export const HEAT_INDEX_COLOURS = ['#74c476', '#fdae61', '#e8552d'];
export const GLOF_EXPOSURE = {
  none: { word: 'Low-susceptibility lakes only', colour: '#ffe680', rank: 1 },
  watch: { word: 'Moderate-susceptibility lake upstream', colour: '#fdae61', rank: 2 },
  priority: { word: 'High-susceptibility lake upstream', colour: '#e8552d', rank: 3 },
};
export const UNTESTED = '#c3ccd3';
export const CANNOT = '#e7eef0';


export const CITIES = [
  ['Islamabad', 33.6938, 73.0652],
  ['Lahore', 31.52, 74.3587],
  ['Karachi', 24.8608, 67.0104],
  ['Peshawar', 34.015, 71.58],
  ['Quetta', 30.1798, 66.975],
  ['Sukkur', 27.7052, 68.8574],
  ['Gilgit', 35.92, 74.31],
  ['Muzaffarabad', 34.37, 73.471],
  ['Multan', 30.1575, 71.5249],
  ['Faisalabad', 31.4504, 73.135],
  ['Hyderabad', 25.396, 68.3578],
  ['Skardu', 35.297, 75.633],
];

export const DAILY_MENU = [
  ['Daily hazards', [
    ['heat', 'Heat stress'],
    ['cold', 'Cold stress'],
    ['rain_hz', 'Heavy rain', 'experimental'],
    ['flood', 'Flood', 'experimental'],
    ['flood_riverine', 'River flood', 'experimental'],
    ['landslide', 'Landslide'],
    ['drought', 'Drought'],
  ]],
  ['Forecast values (no tested level)', [
    ['rain_amount', 'Rain forecast amount', 'experimental'],
    ['wind_gust', 'Wind and gusts', 'experimental'],
    ['aqi', 'Air quality', 'experimental'],
    ['heat_index', 'Comfort', 'reference'],
    ['flood_pluvial', 'Flood from local rain', 'experimental'],
    ['nss_dynamic', 'Runoff retention today', 'experimental'],
    ['nss_runoff', 'Rain run-off, last 5 days', 'experimental'],
  ]],
  ['Site context', [
    ['seismic', 'Earthquake zone', 'reference'],
    ['cyclone', 'Cyclone wind exposure', 'reference'],
    ['glof', 'Glacial lake outburst flood (GLOF)', 'experimental'],
  ]],
];

export const TABS = [
  ['overview', 'Overview', '#2B4C5C'],
  ['livedata', 'Forecast', '#2F7EB5'],
  ['assessments', 'Client Risk', '#0F7A78'],
  ['operations', 'Operations', '#E07B24'],
  ['hybridlab', 'Scenario', '#7B4BB7'],
  ['airisk', 'Ask NIGRAAN', '#1E5A6E'],
  ['modelab', 'Methods & Verification', '#2F7D8C'],
];

/** Analyst page accent tokens — keep in sync with workspace.css --an-accent-* */
export const TAB_ACCENT = Object.fromEntries(TABS.map(([id, , color]) => [id, color]));
