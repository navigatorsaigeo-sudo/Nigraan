import { LEVEL_COLOURS, LEVEL_WORDS } from './layers.js';
import { getPointBundle } from './placeCache.js';

export const SITE_HAZARDS = [
  ['heat', 'Heat stress'],
  ['cold', 'Cold stress (UTCI)'],
  ['rain_hz', 'Heavy rain'],
  ['flood', 'Flood'],
  ['wind', 'Wind and gusts'],
  ['landslide', 'Landslide'],
  ['glof', 'GLOF'],
  ['drought', 'Drought'],
];

const SRV = { rain_hz: 'rain' };
const MAX_SAMPLES = 4;

export function areaHa(corners) {
  const R = 6371008.8;
  if (!corners || corners.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < corners.length; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    sum += ((b.lon - a.lon) * Math.PI) / 180
      * (2 + Math.sin((a.lat * Math.PI) / 180) + Math.sin((b.lat * Math.PI) / 180));
  }
  return Math.abs((sum * R * R) / 2) / 1e4;
}

export function areaLabel(ha) {
  if (!(ha > 0)) return '';
  if (ha >= 100) return `${(ha / 100).toFixed(ha >= 1000 ? 0 : 1)} km²`;
  return `${ha.toFixed(ha < 10 ? 1 : 0)} ha`;
}

function inside(point, ring) {
  let cross = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (((a.lat > point.lat) !== (b.lat > point.lat))
      && (point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon)) {
      cross = !cross;
    }
  }
  return cross;
}

/** Few interior points — enough for a site peak, fast to score. */
export function samplePoints(corners) {
  if (!corners?.length) return [];
  const lats = corners.map((p) => p.lat);
  const lons = corners.map((p) => p.lon);
  const a0 = Math.min(...lats);
  const a1 = Math.max(...lats);
  const o0 = Math.min(...lons);
  const o1 = Math.max(...lons);
  const centre = {
    lat: lats.reduce((sum, value) => sum + value, 0) / lats.length,
    lon: lons.reduce((sum, value) => sum + value, 0) / lons.length,
  };
  const samples = [];
  if (inside(centre, corners)) samples.push(centre);
  for (let i = 1; i <= 2; i += 1) {
    for (let j = 1; j <= 2; j += 1) {
      const point = { lat: a0 + ((a1 - a0) * i) / 3, lon: o0 + ((o1 - o0) * j) / 3 };
      if (!inside(point, corners)) continue;
      if (samples.some((s) => Math.abs(s.lat - point.lat) < 1e-5 && Math.abs(s.lon - point.lon) < 1e-5)) continue;
      samples.push(point);
      if (samples.length >= MAX_SAMPLES) return samples;
    }
  }
  if (!samples.length) samples.push(centre);
  return samples.slice(0, MAX_SAMPLES);
}

function fmtDay(ymd) {
  const when = Date.parse(`${String(ymd || '')}T00:00:00+05:00`);
  if (!Number.isFinite(when)) return '';
  return new Date(when).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Karachi',
  });
}

function convertSiteLevels(body) {
  const part = body?.parts?.siteLevels;
  const value = part?.v || part;
  if (!value || value.ok === false || !value.hazards) {
    return { ok: false, why: value?.why || part?.why || body?.why || 'the levels at the site are not available' };
  }
  const place = body?.place || {};
  const heat = value.hazards.heat;
  const days = (heat?.days || []).map((day) => day.date).filter(Boolean);
  const hz = SITE_HAZARDS.map(([key]) => {
    const hazard = value.hazards[SRV[key] || key];
    if (!hazard) {
      return {
        key,
        peak: null,
        why: 'not scored at the site',
        notApplicable: false,
        tehsilValue: false,
      };
    }
    const tehsil = /tehsil/.test(String(hazard.scope || ''));
    const peak = hazard.peak && Number.isFinite(+hazard.peak.level)
      ? {
        i: +hazard.peak.level,
        score: Number.isFinite(+hazard.peak.score) ? +hazard.peak.score : null,
        date: hazard.peak.date,
        day: Number.isFinite(+hazard.peak.lead) ? +hazard.peak.lead : null,
      }
      : null;
    const firstWhy = (hazard.days || []).find((day) => !day.assessed && day.why)?.why;
    return {
      key,
      peak,
      why: peak ? null : (firstWhy || hazard.why || 'not assessed'),
      notApplicable: false,
      tehsilValue: tehsil,
      basis: hazard.method || '',
    };
  });
  return {
    ok: true,
    tehsil: place.tehsil || null,
    days,
    hz,
  };
}

function aggregate(out, samples, ha) {
  const ok = out.filter((row) => row && row.ok);
  if (!ok.length) {
    return {
      ok: false,
      ha,
      samples,
      why: out.find((row) => row?.why)?.why || 'no answer',
      rows: [],
      tehsils: [],
      days: 0,
      scored: 0,
      total: samples.length,
      partial: out.length < samples.length,
    };
  }
  const tehsils = [];
  ok.forEach((row) => {
    if (row.tehsil && !tehsils.includes(row.tehsil)) tehsils.push(row.tehsil);
  });
  const days = ok[0].days || [];
  const rows = SITE_HAZARDS.map(([key, name]) => {
    let top = null;
    let lo = null;
    let any = false;
    let na = false;
    let why = null;
    let carried = false;
    ok.forEach((row) => {
      const hazard = (row.hz || []).find((item) => item.key === key);
      if (!hazard) return;
      if (hazard.notApplicable) na = true;
      if (!hazard.peak) {
        why = why || hazard.why;
        return;
      }
      any = true;
      if (!top || hazard.peak.i > top.i || (hazard.peak.i === top.i && (hazard.peak.score || 0) > (top.score || 0))) {
        top = { ...hazard.peak };
      }
      if (lo == null || hazard.peak.i < lo) lo = hazard.peak.i;
      if (hazard.tehsilValue) carried = true;
    });
    if (!any) {
      return {
        key,
        name,
        missing: true,
        note: na ? 'Does not occur here' : (why || 'not scored'),
      };
    }
    return {
      key,
      name,
      level: top.i,
      word: LEVEL_WORDS[top.i] || '',
      colour: LEVEL_COLOURS[top.i] || '#c3ccd3',
      when: fmtDay(top.date),
      spread: lo != null && lo < top.i
        ? `${LEVEL_WORDS[lo]}–${LEVEL_WORDS[top.i]}`
        : 'same across site',
      carried,
    };
  });
  return {
    ok: true,
    ha,
    samples,
    rows,
    tehsils,
    days: days.length,
    scored: ok.length,
    total: samples.length,
    partial: ok.length < samples.length,
  };
}

/** Score a few points; call onPartial as each answer arrives so the panel can show early. */
export function scoreSite(corners, onPartial) {
  const samples = samplePoints(corners);
  const ha = areaHa(corners);
  const out = new Array(samples.length);
  let settled = 0;

  function publish() {
    const ready = out.filter((row) => row != null);
    if (!ready.length) return;
    const result = aggregate(ready, samples, ha);
    if (typeof onPartial === 'function') onPartial(result);
    return result;
  }

  return Promise.all(samples.map((point, index) => getPointBundle({
    lat: point.lat,
    lon: point.lon,
    parts: 'siteLevels',
  }).then((body) => convertSiteLevels(body)).catch(() => ({ ok: false, why: 'not scored' })).then((row) => {
    out[index] = row;
    settled += 1;
    const partial = publish();
    if (settled === samples.length) return partial || aggregate(out, samples, ha);
    return row;
  }))).then(() => aggregate(out, samples, ha));
}
