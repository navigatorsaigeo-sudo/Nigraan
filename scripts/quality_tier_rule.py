#!/usr/bin/env python3
"""v91.17.70 · the source-chain tier rule for customer reports (data/quality-tier.json).

The CEO's practical plan (audit/board/PRACTICAL_PLAN_v1.md, "Source chain") ranks every value by the best source at the
place: A = a MACH station within its valid radius (shown as the MACH check), B = the model served at the settlement height
from the open DEM and population layers, C = the model plus terrain proxies. The report's forecast-basis page prints
the tier and, where A holds, the MACH station's own measured error against the served forecast. The reanalysis
agreement and the PMD station figures that page used to print are internal diagnostics (option 2).

Numbers in the rule, with their basis [read]:
  reachKm 15   the radius of the dashboard's "observed nearby" MACH line (server/api/fleet.mjs nearest(), maxKm = 15)
  maxDzM 150   the height gap the AI/ML seat allows a station-specific term (seat_ai_ml.md 2.2: 5 km and 150 m); a
               station more than 150 m above or below the served height does not stand for it
  minHours 720 thirty days of hourly pairs before a station's error is printed (fleet trust rule needs >= 90 days;
               720 h is the floor for a printed figure, below the trust rule, so trust is required as well)
Counts [measured] from data/fleet-history-skill.json at build time.
"""
import json, os, datetime
HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.normpath(os.path.join(HERE, '..', 'data'))
F = json.load(open(os.path.join(DATA, 'fleet-history-skill.json')))
st = F.get('stations', [])
trusted = [s for s in st if isinstance(s.get('trust'), dict) and s['trust'].get('temperature')]
out = {
  'built': datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z',
  'source': 'data/fleet-history-skill.json (built %s): %d MACH stations, %d trusted for temperature' % (F.get('built'), len(st), len(trusted)),
  'method': 'tier A: a MACH station trusted for temperature within reachKm of the unit point and within maxDzM of the served height, with at least minHours of pairs; tier B: the unit is served at its population-weighted settlement height (Copernicus DEM, GHS-POP); tier C: otherwise. Rule basis in scripts/quality_tier_rule.py.',
  'n': len(trusted),
  'reachKm': 15, 'maxDzM': 150, 'minHours': 720,
  'marks': {'A': '●●●', 'B': '●●○', 'C': '●○○'},
  'labels': {'A': 'MACH-checked: an AGN station within reach has scored this forecast against its own readings (a past record of at least a month, not a live reading)', 'B': 'forecast served at the settlement height from open terrain and population layers', 'C': 'forecast with terrain proxies'},
  'licence': [{'id': 'mach', 'dataset': 'MACH weather-station network', 'provider': 'AI Geo Navigators (AGN)', 'licence': 'AGN proprietary (own network)', 'licenceUrl': None, 'attribution': 'MACH stations, AI Geo Navigators (AGN)', 'url': 'https://mach.aigeo360.com', 'use': 'the tier A check', 'customer': True}],
}
p = os.path.join(DATA, 'quality-tier.json'); t = p + '.tmp'
json.dump(out, open(t, 'w'), indent=1, ensure_ascii=False); os.replace(t, p)
print('wrote', p, 'trusted', len(trusted), 'of', len(st))
