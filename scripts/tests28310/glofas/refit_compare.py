#!/usr/bin/env python3
"""v283.10 part 2 · R5: rivercal and flood-extent refits on the served series vs the current tables applied to the served flow.

inputs (produced by the runbook in REPORT.md part 2):
  --current   data/river-cal.json as shipped (fitted on the station file)
  --old       river-cal.json rebuilt by the v283.9 method (fit on the station file, lags -2..+2) with every held-out prediction and
              the served level taken from the SERVED flow (RIVERCAL_FIT=<station file> RIVERCAL_APPLY=<served> RIVERCAL_LAGS=-2,3):
              how the current table actually performs in production
  --new       river-cal.json refitted on the served series (default scripts)
  --stale     rivercal_stale.json of the new run (gain of the model level over the stale sheet by sheet age, on the SERVED level;
              the stale switch does not depend on the calibration, so it is the same for old and new)
  --fx-old / --fx-new   fx-model.json of fx_calibrate.py with FX_FLOW_SERIES=<station file> and with the served series
rule R5 (PASS_RULES.txt): a refit is adopted only if no worse on held-out data than the current table applied to the served flow.
  flow: per reach that either serves, held-out MAE of the calibrated flow (all held-out days) new <= old.
  stale switch: at the sheet ages where the current and the new switch age disagree, the summed gain of the policy the new table
  picks must be >= that of the current one, over all seasons and over 2026 alone (2026 is held out from the ladder).
  flood extent: CSI gain over B0 on 2025 (held out) new >= old."""
import sys, json
a = sys.argv[1:]; opt = lambda n, d=None: a[a.index(n) + 1] if n in a else d
J = lambda f: json.load(open(f))
cur, old, new, st = J(opt('--current'))['reaches'], J(opt('--old'))['reaches'], J(opt('--new'))['reaches'], J(opt('--stale'))
out = dict(flow={}, stale={}, fx={})
for k in new:
    c, o, n = cur[k]['flowGate'], old[k]['flowGate'], new[k]['flowGate']
    servesNow = bool(c['passes'] and 'flow' in cur[k]); servesNew = bool(n['passes'] and 'flow' in new[k])
    if not (servesNow or servesNew or o['passes']): continue
    out['flow'][k] = dict(currentServes=servesNow, newServes=servesNew, maeRawServed=o['maeRaw'], maeCalCurrentMethodOnServed=o['maeCal'],
                          maeCalNew=n['maeCal'], w1Current=o['w1'], w2Current=o['w2'], w1New=n['w1'], w2New=n['w2'],
                          newNoWorse=bool(n['maeCal'] <= o['maeCal']))
flowAdopt = all(v['newNoWorse'] for v in out['flow'].values() if v['currentServes'] or v['newServes'])
for k in set(new) | set(cur):
    ac = (cur.get(k, {}).get('staleSheet') or {}).get('switchAgeDays'); an = (new.get(k, {}).get('staleSheet') or {}).get('switchAgeDays')
    if ac == an: continue
    T = {r['age']: r for r in st.get(k, {}).get('table', [])}
    lo, hi = min(x for x in (ac, an) if x is not None), max(x for x in (ac, an) if x is not None) if None not in (ac, an) else 15
    ages = range(lo, hi)
    s_all = sum(T[x]['gain'][0] for x in ages if x in T); s26 = sum((T[x]['gain2026'][0] or 0) for x in ages if x in T)
    sign = 1 if (an is not None and (ac is None or an < ac)) else -1   # +: the new table uses the model level on these ages
    out['stale'][k] = dict(currentAge=ac, newAge=an, ages=list(ages), newMinusCurrentGainAll=round(sign * s_all, 3), newMinusCurrent2026=round(sign * s26, 3),
                           gainsAll=[[x, [round(v, 3) for v in T[x]['gain']]] for x in ages if x in T], gains2026=[[x, None if T[x]['gain2026'][0] is None else round(T[x]['gain2026'][0], 3)] for x in ages if x in T],
                           newNoWorse=bool(sign * s_all >= 0 and sign * s26 >= 0))
staleAdopt = all(v['newNoWorse'] for v in out['stale'].values())
fo, fn = J(opt('--fx-old')), J(opt('--fx-new'))
gain = lambda M: (M.get('csiGain2025') or {}).get('vsB0')
out['fx'] = dict(chosenOld=fo['chosen'], chosenNew=fn['chosen'], servedOld=fo['served'], servedNew=fn['served'], csiGainVsB0Old=gain(fo), csiGainVsB0New=gain(fn),
                 csi2025={m: [fo['test2025'].get(m, {}).get('csi'), fn['test2025'].get(m, {}).get('csi')] for m in ('B0', 'B1', 'M1', 'M2')},
                 q2={r: [fo['reaches'][r].get('q2'), fn['reaches'][r].get('q2')] for r in fn['reaches'] if r in fo['reaches']},
                 conditions='cloud run: height band t_elev (the laptop t_hand band and the JRC tiles are not in the cloud copy), so the B2 gate is not assessed here; old and new under the same conditions',
                 newNoWorse=bool(gain(fn)[0] >= gain(fo)[0]))
out['decision'] = dict(rivercalFlowAdopt=flowAdopt, rivercalStaleAdopt=staleAdopt, fxAdopt=out['fx']['newNoWorse'])
json.dump(out, open(opt('--out'), 'w'), indent=1)
print(json.dumps(out['decision'])); print(json.dumps(out['flow'], indent=0)); print(json.dumps({k: {x: v[x] for x in ('currentAge', 'newAge', 'newMinusCurrentGainAll', 'newMinusCurrent2026')} for k, v in out['stale'].items()}))
print(json.dumps({k: out['fx'][k] for k in ('csiGainVsB0Old', 'csiGainVsB0New', 'csi2025', 'servedOld', 'servedNew')}))
