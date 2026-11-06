#!/usr/bin/env python3
"""v91.17.283.6 item 5 · writes data/height-extrapolation.json from the held-out test (h5_height_range_test.py output) and cand_height.json.
Nothing is typed: the margin is the test's MARGIN, the warm bias and its interval are the test's bootstrap of cand_height.json, the widening
candidate is the owner's measured interval (larger cut bias of cand_height.json), and `serve` is the test's own pass flag for it.
usage: python h5_make_data.py <h5_height_range.json> <cand_height.json> <out data/height-extrapolation.json>"""
import sys, json, hashlib
R = json.load(open(sys.argv[1])); chb = open(sys.argv[2], 'rb').read(); C = json.loads(chb)
assert R['candHeightSha256'] == hashlib.sha256(chb).hexdigest()
eb = R['extrapolationBias']; c35, c40 = R['cuts']['3500'], R['cuts']['4000']
serve = bool(R.get('candidate2_pass'))
fmt = lambda c: '%.3f [%.3f, %.3f]' % tuple(c)
out = {
  'version': 'height-extrap-91.17.283.6', 'decided': '2026-10-22',
  'rule': 'nothing is served unless it beats the current value on held-out data; the range widening is served only if its held-out test passed at both fit ceilings',
  'marginM': R['marginM'], 'topStationSource': 'data/national-model.json bias.stations (highest training station, read at run time)',
  'warmBiasC': {'mean': eb['hourWeightedMeanC'], 'ci95': eb['ci95C'], 'stationRows': eb['stations'],
                'what': 'current model minus observed, hour-weighted, at held-out stations more than marginM above the fit ceiling (cand_height.json, ceilings 3,500 and 4,000 m pooled; 95 % station bootstrap)'},
  'currentRangeCoverage': {'ceiling3500': fmt(c35['coverage_current']), 'ceiling4000': fmt(c40['coverage_current'])},
  'label': 'lower confidence: above the highest station the temperature model was trained on',
  'widen': {'serve': serve, 'lowerC': R['candidate2_B_C'], 'side': 'cold (lower) side only; the central value is unchanged',
            'test': {'ceiling3500': {'coverage': fmt(c35['candidate2']['coverage']), 'pass': c35['candidate2']['pass_']},
                     'ceiling4000': {'coverage': fmt(c40['candidate2']['coverage']), 'pass': c40['candidate2']['pass_']}},
            'why': ('held-out test passed at both ceilings' if serve else
                    'not served: the held-out rule failed at the 4,000 m ceiling - the widened range over-covers (%s against the current %s; 0.90 wanted), so the current range is kept and only the label is served' % (fmt(c40['candidate2']['coverage']), fmt(c40['coverage_current'])))},
  'source': {'test': 'scripts/gen/sci/h5_height_range_test.py', 'candHeightSha256': R['candHeightSha256'], 'national': 'station-lake/archive/national/table.parquet (leave-band-out, blk 1 weeks)'},
}
json.dump(out, open(sys.argv[3], 'w'), indent=1); print(json.dumps(out['widen'])); print('serve', serve)
