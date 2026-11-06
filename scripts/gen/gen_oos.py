"""v91.17.282.1 FIX2821 (science check SCI2821): the measured out-of-sample temperature figures the start page report prints in its
limitations, generated from the science summary (its path and sha256 kept with them); no number is typed into the page.
usage: python3 scripts/gen/gen_oos.py <summary.json> <out json>   (build/start/build.py inlines the out json as #agn-oos)"""
import json, hashlib, sys, os, re
src, out = sys.argv[1], sys.argv[2]
raw = open(src, 'rb').read(); S = json.loads(raw); F = S['findings']
T1, H, C = F['T1_strict_daily_L1_L2_L3'], F['T1_post_fit_hourly_L1'], F['T2_coverage']
def rng(a, f=lambda v: v):
    lo, hi = min(f(v) for v in a), max(f(v) for v in a); lo, hi = round(lo, 1), round(hi, 1)
    return ('%.1f' % lo) if lo == hi else ('%.1f–%.1f' % (lo, hi))
def pct(v): return round(100 * v)
def prng(a):
    lo, hi = min(pct(v) for v in a), max(pct(v) for v in a); return str(lo) if lo == hi else '%d–%d' % (lo, hi)
TS = S.get('truth_sets', {})
m1 = re.search(r'(\d{1,2} \w{3})-(\d{1,2} \w{3} \d{4})', TS.get('strict_daily', '')); w1 = (m1.group(1) + '\u2013' + m1.group(2)) if m1 else 'the test period'
m2 = re.search(r'(\d{1,2} \w{3})-(\d{1,2} \w{3} \d{4})', TS.get('post_fit_hourly', '')); w2 = (m2.group(1) + '\u2013' + m2.group(2)) if m2 else 'after the fitting window'
TS = S.get('truth_sets', {})
def window(t, alt):
    m = re.search(r'(\d{1,2} \w{3})-(\d{1,2} \w{3} \d{4})', t or ''); return (m.group(1) + '\u2013' + m.group(2)) if m else alt
w1, w2 = window(TS.get('strict_daily'), 'the test period'), window(TS.get('post_fit_hourly'), 'after the fitting window')
ci = [float(x) for x in H['mountain']['ci'].strip('[]').split(',')]
lines = [
  'Daily maximum off by %s \u00b0C on average and %s \u00b0C too cool; daily minimum off by %s \u00b0C and %s \u00b0C too warm (forecast days 1 to 3, stations never used in training, %s)'
    % (rng(T1['Tmax_mae']), rng(T1['Tmax_bias'], abs), rng(T1['Tmin_mae']), rng(T1['Tmin_bias'], abs), w1)
    + ((('; for the minimum the correction is not better than the uncorrected model (%s \u00b0C uncorrected)' % rng(T1['Tmin_raw_mae'])) if any(x > 0 for x in T1.get('Tmin_chain_minus_raw', [])) else '')),
  'Mountains: hourly temperature off by %.1f \u00b0C [%.2f\u2013%.2f], about %d \u00b0C too cold; hills: %.1f \u00b0C, about %d \u00b0C too cold (measured out of sample, %s, after the model\u2019s fitting window)'
    % (H['mountain']['mae'], ci[0], ci[1], round(abs(H['mountain']['bias'])), H['hills']['mae'], round(abs(H['hills']['bias'])), w2),
  'The 90 %% range held %s %% of hours overall, %d %% in the hills, %s %% in the mountains, and %s %% of plains daily maxima and minima'
    % (prng(C['hourly_L1_L2_L3']), pct(C['hills']), ('%.1f' % (100 * C['mountain'])).rstrip('0').rstrip('.'), prng(C['daily_Tmax'] + C['daily_Tmin'])),
]
o = {'schema': 'agn.oos.v1', 'source': os.path.abspath(src), 'sha256': hashlib.sha256(raw).hexdigest(), 'task': S.get('task'), 'built': S.get('built'),
     'truth': S.get('truth_sets', {}).get('strict_daily', '')[:400], 'lines': lines}
json.dump(o, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); print('\n'.join(lines))
