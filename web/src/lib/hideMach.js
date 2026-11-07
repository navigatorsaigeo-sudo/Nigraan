/* Display-only: never surface MACH / near-station branding in the UI. */

export function scrubMachText(value) {
  if (value == null) return value;
  if (typeof value !== 'string') return value;
  let t = value;
  t = t.replace(/\bAGN(?:['’]s)?\s+own\s+MACH\s+(?:weather\s+)?stations?\b/gi, 'local weather observations');
  t = t.replace(/\bAGN\s+MACH\s+station\s+(?:fleet|network)\b/gi, 'observation network');
  t = t.replace(/\bAGN\s+MACH\s+fleet\b/gi, 'observation network');
  t = t.replace(/\bAGN\s+station\s+network\s*\(MACH\)\b/gi, 'observation network');
  t = t.replace(/\bMACH\s+station\s+network\b/gi, 'observation network');
  t = t.replace(/\bMACH\s+fleet\b/gi, 'observation network');
  t = t.replace(/\blive\s+MACH\s+stations?\b/gi, 'live observations');
  t = t.replace(/\bchecked\s+MACH\s+stations?\b/gi, 'checked weather stations');
  t = t.replace(/\bnearest\s+MACH\s+stations?\b/gi, 'nearest weather station');
  t = t.replace(/\bno\s+MACH\s+station\b/gi, 'no weather station');
  t = t.replace(/\ba\s+MACH\s+station\b/gi, 'a weather station');
  t = t.replace(/\bMACH\s+stations\b/gi, 'weather stations');
  t = t.replace(/\bMACH\s+station\b/gi, 'weather station');
  t = t.replace(/\bon\s+MACH\b/gi, 'on the network');
  t = t.replace(/\bin\s+the\s+MACH\s+database\b/gi, 'in the observation database');
  t = t.replace(/\bLive\s+MACH\s+database\b/gi, 'Live observation database');
  t = t.replace(/\blive\s+MACH\b/gi, 'live network');
  t = t.replace(/\bMACH\s+pairs\b/gi, 'Observation pairs');
  t = t.replace(/\bMACH\s+is\s+AGN['’]s\s+own\s+network\.?/gi, '');
  t = t.replace(/\bMACH\s+forecast\b/gi, 'Forecast');
  t = t.replace(/\bMAch\s+service\b/gi, 'weather service');
  t = t.replace(/\bvs\s+MACH\b/gi, 'vs local');
  t = t.replace(/\bmach\d+\b/gi, 'local station');
  t = t.replace(/\bMACH\b/g, '');
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').replace(/\s+·\s+·/g, ' · ').trim();
  return t;
}
