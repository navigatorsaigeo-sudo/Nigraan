export function num(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function fmt(value, digits = 0) {
  const number = num(value);
  if (number == null) return '—';
  return digits ? number.toFixed(digits) : String(Math.round(number));
}

export function pct(value) {
  const number = num(value);
  if (number == null) return null;
  return number <= 1 ? number * 100 : number;
}

export function eventRows(events) {
  const defs = Array.isArray(events?.definitions) ? events.definitions : [];
  return defs.map((def) => {
    const row = events?.[def.id] || {};
    return { id: def.id, label: def.label || def.id, p: pct(row.p), clim: pct(row.climP) };
  });
}

function stat(body, model) {
  const daily = body?.daily || {};
  const temps = (daily[`temperature_2m_max_${model}`] || []).filter((value) => value != null);
  const rain = (daily[`precipitation_sum_${model}`] || []).filter((value) => value != null);
  if (!temps.length) return null;
  const years = temps.length / 365.25;
  const sum = (rows) => rows.reduce((total, value) => total + value, 0);
  return {
    t: sum(temps) / temps.length,
    p: sum(rain) / Math.max(1, years),
    hot: temps.filter((value) => value >= 40).length / Math.max(1, years),
    hot35: temps.filter((value) => value >= 35).length / Math.max(1, years),
  };
}

export function cmipRows(part) {
  const body = part?.v || part;
  const models = Array.isArray(body?.models) ? body.models : [];
  const windows = body?.windows || {};
  const keys = Object.keys(windows).filter((key) => key !== 'baseline').sort();
  const baseline = windows.baseline?.body;
  const near = windows[keys[0]]?.body;
  const far = windows[keys[1]]?.body;
  if (!baseline?.daily || !near?.daily || !far?.daily) return [];
  return models.map((model) => {
    const base = stat(baseline, model);
    const y2030 = stat(near, model);
    const y2050 = stat(far, model);
    if (!base || !y2030 || !y2050 || !base.p) return null;
    return {
      model,
      t0: base.t,
      t30: y2030.t,
      t50: y2050.t,
      p0: base.p,
      p30: y2030.p,
      p50: y2050.p,
      dt30: y2030.t - base.t,
      dt50: y2050.t - base.t,
      dp30: 100 * (y2030.p - base.p) / base.p,
      dp50: 100 * (y2050.p - base.p) / base.p,
      h0: base.hot,
      h30: y2030.hot,
      h50: y2050.hot,
    };
  }).filter(Boolean);
}

export function spread(rows, key) {
  const values = rows.map((row) => row[key]).filter((value) => value != null).sort((a, b) => a - b);
  if (!values.length) return null;
  return { m: values[Math.floor(values.length / 2)], lo: values[0], hi: values[values.length - 1] };
}

export function floodText(outcome) {
  if (!outcome) return '';
  if (outcome.modelled === false) return outcome.label || 'Local-rain flooding is not modelled for this scenario.';
  const side = (value) => {
    if (value == null || typeof value !== 'object') return '—';
    const chance = pct(value.p ?? value.chance ?? value.prob);
    if (chance != null) return `${chance.toFixed(chance < 1 ? 2 : 1)}%`;
    return value.word || value.text || value.label || '—';
  };
  const where = [outcome.district, outcome.region].filter(Boolean).join(', ');
  return `${outcome.label || 'Local-rain flood'}: now ${side(outcome.baseline)}, scenario ${side(outcome.scenario)}${where ? ` · ${where}` : ''}`;
}

export function worstLevel(days) {
  let best = null;
  (days || []).forEach((day) => {
    Object.values(day.layers || {}).forEach((layer) => {
      if (layer?.level == null || layer.level < 0) return;
      if (!best || layer.level > best.level) best = { ...layer, date: day.date, day: day.day };
    });
  });
  return best;
}

export async function generateReport(body) {
  const response = await fetch('/api/report/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-agn-view': 'customer' },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({ ok: false }));
  return json || { ok: false };
}
