"""v91.17.274 PLUVIAL · re-apply this agent's page and data edits on another tree (e.g. /tmp/claude-0/v273/integ), then reseal there.
Edits (each must match exactly once, else the script stops and changes nothing):
  1 agn-lcz: Keti Bunder no_lcz_coverage -> no_built_area (+ statusBasis), status_codes text
  2 INFO_CONTENT.flood.l: client wording (local-rain level = rain-based screening, not a flood observation)
  3 AI_HAZARDS.flood_pluvial.note: the same wording, short
  4 data/lcz-grid.json: Keti Bunder status no_built_area (written as a new file: safe on hard-linked copies)
python3 apply_page_edits.py <treeRoot>     then: python3 <scratchpad>/main2/seal.py IN OUT MANIFEST_IN MANIFEST_OUT (and restore the
MANIFEST 'change' history, see CHANGES.md)"""
import sys, os
R = sys.argv[1]; P = os.path.join(R, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html')
s = open(P, encoding='utf8', newline='').read()
E = [
 ('"Sindh|Sujawal|Keti Bunder":{"d":"Sujawal","p":"Sindh","status":"no_lcz_coverage",',
  '"Sindh|Sujawal|Keti Bunder":{"d":"Sujawal","p":"Sindh","status":"no_built_area","statusBasis":"v91.17.274: no WUDAPT LCZ raster over this 4.5 km2 coastal polygon; ESA WorldCover 2021 10 m built share 0.0 and no Google Open Buildings v3 footprint inside it (data/landcover-2025-tehsil.json) -> measured absence of built cells",'),
 ('"no_lcz_coverage":"no LCZ raster coverage (Keti Bunder)"',
  '"no_lcz_coverage":"no LCZ raster coverage and no other land-cover record (none since v91.17.274)"'),
 ("l:'global river-flow model is 5km — reliable for major rivers (Indus/Chenab/Jhelum/Kabul), unreliable for small catchments. Not bias-corrected. Uncalibrated until validated against flood records.'}",
  "l:'Flood from local rain is a rain-based screening level, not a flood observation: it is set by the heaviest forecast rain hour and the heaviest 6 hours, "
  "scaled by how much of that rain this ground sheds. It does not see drains, nullahs or underpasses. On days of intense city downpours it can stay at Normal, "
  "so read it together with the Heavy rain layer. River flooding uses a 5 km global river-flow model: reliable for major rivers "
  "(Indus/Chenab/Jhelum/Kabul), unreliable for small catchments, not bias-corrected. Neither part is yet calibrated against dated flood reports.'}"),
 ("note:'Rain falling on this cell. Lead time is hours. Scored wherever a rainfall '\n           +'value exists, so its coverage is the rainfall sweep\\u2019s coverage.'},",
  "note:'Rain-based screening, not a flood observation: the heaviest forecast rain hour and 6 hours, scaled by how much of that rain '\n"
  "           +'this ground sheds. Lead time is hours. Scored wherever a rainfall value exists. It does not see drains or nullahs; '\n"
  "           +'read it together with the Heavy rain layer.'},"),
]
for a, b in E:
    n = s.count(a)
    if n != 1: sys.exit('edit not applied (found %d): %s' % (n, a[:90]))
for a, b in E: s = s.replace(a, b)
G = os.path.join(R, 'data', 'lcz-grid.json'); g = open(G, encoding='utf8').read()
ga = '"Sindh|Sujawal|Keti Bunder":{"d":"Sujawal","p":"Sindh","status":"no_lcz_coverage"'
if g.count(ga) != 1: sys.exit('lcz-grid.json edit not applied')
open(P, 'w', encoding='utf8', newline='').write(s)
open(G + '.new', 'w', encoding='utf8').write(g.replace(ga, ga.replace('no_lcz_coverage', 'no_built_area'))); os.replace(G + '.new', G)
print('applied 4 page edits + lcz-grid.json; now reseal')
