export const STEPS = [
  ['overview', '1', 'Overview', 'Pakistan now'],
  ['outlook', '2', 'Outlook', 'Next hours to the 2050s'],
  ['sites', '3', 'Sites & operations', 'Every AJG site'],
  ['lab', '4', 'Scenario', 'Stress test'],
  ['proof', '5', 'Proof & report', 'Why trust it'],
];

export const HAZARDS = [
  ['heat', 'Heat stress'],
  ['cold', 'Cold stress (UTCI)'],
  ['rain_hz', 'Heavy rain'],
  ['wind', 'Wind and gusts'],
  ['flood', 'Flood'],
  ['landslide', 'Landslide'],
  ['glof', 'Glacial lake outburst flood (GLOF)'],
  ['drought', 'Drought'],
];

export const SECTORS = [
  ['industrial', 'Industry'],
  ['transport', 'Transport'],
  ['agriculture', 'Agriculture'],
  ['construction', 'Construction'],
  ['commercial', 'Commercial'],
];

export const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
export const FILLS = ['#74c476', '#ffe680', '#fdae61', '#e8552d', '#a50026'];

export const HORIZONS = [
  ['d15', '15 days'],
  ['w26', 'Weeks 2–6'],
  ['sea', 'Season'],
  ['air', 'Air & smog'],
  ['nat', 'National view'],
];

export const HORIZON_LAYER = {
  w26: 'week:t',
  sea: 'month:t',
  air: 'air:pm25',
};

const TYPE_SECTOR = {
  warehouse: 'commercial',
  'cold store': 'industrial',
  'logistics hub': 'transport',
  depot: 'transport',
  'farm house': 'agriculture',
  'construction site': 'construction',
};

export function sectorOf(type) {
  const t = String(type || '').toLowerCase();
  if (TYPE_SECTOR[t]) return TYPE_SECTOR[t];
  if (/cold/.test(t)) return 'industrial';
  if (/construct|site works/.test(t)) return 'construction';
  if (/farm|orchard|dairy/.test(t)) return 'agriculture';
  if (/transport|depot|hub|fleet/.test(t)) return 'transport';
  if (/plant|factory|mill/.test(t)) return 'industrial';
  return 'commercial';
}

export function sectorName(key) {
  return SECTORS.find(([id]) => id === key)?.[1] || key || '—';
}

export function num(value) {
  return Number.isFinite(+value) ? +value : null;
}

export function fixed(value, digits = 1) {
  const n = num(value);
  if (n == null) return '—';
  const text = n.toFixed(digits);
  return text.endsWith('.0') ? String(Math.round(n)) : text;
}

export function pktNow() {
  return new Date(Date.now() + 5 * 3600e3);
}

export function localHour() {
  return pktNow().toISOString().slice(0, 13) + ':00';
}

export function dayLabel(offset) {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  const pkt = pktNow();
  const day = new Date(Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate()) + offset * 864e5);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.getUTCDay()] + ' ' + day.getUTCDate();
}

export function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

export function partValue(bundle, key) {
  const part = bundle?.parts?.[key];
  if (!part || part.unavailable) return null;
  return part.v == null ? null : part.v;
}

export function partWhy(bundle, key) {
  const part = bundle?.parts?.[key];
  if (!part) return '';
  if (part.unavailable) return part.why || 'not available';
  return '';
}

export function hazardOn(day, key) {
  return day?.layers?.[key] || null;
}

export function topToday(levels) {
  const day = levels?.days?.[0];
  if (!day) return null;
  let best = null;
  for (const [key, name] of HAZARDS) {
    const row = hazardOn(day, key);
    if (!row || row.level == null || row.level < 0) continue;
    if (key === 'glof' && row.level <= 2) continue;
    if (!best || row.level > best.level) best = { level: row.level, word: row.word || WORDS[row.level], by: name };
  }
  return best;
}

export function worstWindow(levels) {
  const days = levels?.days || [];
  const miss = [];
  let best = { level: -1, word: 'no data', hazard: '', day: null, date: null };
  days.slice(0, 4).forEach((day, index) => {
    for (const [key, name] of HAZARDS) {
      const row = hazardOn(day, key);
      if (row && row.level === -1 && !miss.includes(name)) miss.push(name);
      if (key === 'glof' && row && row.level <= 2) continue;
      if (row && row.level > best.level) {
        best = { level: row.level, word: row.word || WORDS[row.level], hazard: name, day: index, date: day.date || null };
      }
    }
  });
  best.miss = miss;
  return best;
}

export function band(value) {
  if (!Array.isArray(value) || !value.length) return null;
  const nums = value.map(num).filter((n) => n != null);
  if (!nums.length) return null;
  if (nums.length === 1) return { lo: nums[0], mid: nums[0], hi: nums[0] };
  if (nums.length === 2) return { lo: nums[0], mid: (nums[0] + nums[1]) / 2, hi: nums[1] };
  return { lo: nums[0], mid: nums[1], hi: nums[nums.length - 1] };
}

export function mean(list) {
  const nums = (list || []).map(num).filter((n) => n != null);
  if (!nums.length) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

export function cmipShift(cmip) {
  if (!cmip?.windows || !Array.isArray(cmip.models)) return [];
  const base = cmip.windows.baseline?.body?.daily;
  return cmip.models.map((model) => {
    const key = `temperature_2m_max_${model}`;
    const rain = `precipitation_sum_${model}`;
    const baseT = mean(base?.[key]);
    const row = { model, baseT };
    for (const window of ['2030', '2050']) {
      const daily = cmip.windows[window]?.body?.daily;
      const temp = mean(daily?.[key]);
      const wet = mean(daily?.[rain]);
      row[window] = temp;
      row[window + 'd'] = temp != null && baseT != null ? temp - baseT : null;
      row[window + 'rain'] = wet;
    }
    return row;
  }).filter((row) => row['2030'] != null || row['2050'] != null);
}

export function hoursAhead(bundle, count = 72) {
  const from = localHour();
  return (bundle?.hours || []).filter((hour) => hour.time >= from).slice(0, count);
}

export function readHash() {
  const hash = window.location.hash || '';
  const stepMatch = /[#&](overview|outlook|sites|lab|proof)\b/.exec(hash);
  const placeMatch = /[#&]agnplace=(-?[0-9.]+),(-?[0-9.]+)(?:,([^&]*))?/.exec(hash);
  let name = '';
  if (placeMatch?.[3]) {
    try { name = decodeURIComponent(placeMatch[3]); } catch { name = placeMatch[3]; }
  }
  return {
    step: stepMatch ? stepMatch[1] : 'overview',
    place: placeMatch ? { lat: +placeMatch[1], lon: +placeMatch[2], name } : null,
  };
}

export function writeHash(step, place) {
  const bits = [step || 'overview'];
  if (place && Number.isFinite(+place.lat) && Number.isFinite(+place.lon)) {
    const name = place.name ? ',' + encodeURIComponent(place.name) : '';
    bits.push(`agnplace=${(+place.lat).toFixed(5)},${(+place.lon).toFixed(5)}${name}`);
  }
  const next = '#' + bits.join('&');
  if (window.location.hash !== next) window.history.replaceState({}, '', window.location.pathname + window.location.search + next);
}

export function rememberedPlace() {
  try {
    const handed = JSON.parse(localStorage.getItem('agn.switchPlace') || 'null');
    if (handed && Number.isFinite(+handed.lat) && Number.isFinite(+handed.lon) && Date.now() - handed.t < 120000) {
      localStorage.removeItem('agn.switchPlace');
      return { lat: +handed.lat, lon: +handed.lon, name: handed.name || '' };
    }
  } catch { /* ignore */ }
  try {
    const last = JSON.parse(localStorage.getItem('agn3.lastPlace') || 'null');
    if (last && Number.isFinite(+last.lat) && Number.isFinite(+last.lon)) return { lat: +last.lat, lon: +last.lon, name: last.name || '' };
  } catch { /* ignore */ }
  return null;
}

export function rememberPlace(place) {
  try {
    localStorage.setItem('agn3.lastPlace', JSON.stringify({ lat: place.lat, lon: place.lon, name: place.name || null }));
  } catch { /* ignore */ }
}

export function startSite(sites) {
  return sites.find((site) => /warehouse/i.test(site.type || '')) || sites[0] || null;
}
