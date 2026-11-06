#!/usr/bin/env python3
"""when the daily river sheet stops: from what sheet age does the reach model level (served rarity ladder) match the gauge class
better than the last sheet reading carried forward? per reach, all three seasons and 2026 alone (the ladder was set on 2024-25)."""
import os, sys, json
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rivercal import blocks_boot, served_shown
OUT = os.environ.get('RIVERCAL_WORK') or os.path.dirname(os.path.abspath(__file__))
D = pd.read_csv(os.path.join(OUT, 'rivercal_heldout_days.csv.gz'), parse_dates=['date'])
res = {}
for rid, R in D.groupby('reach'):
    if not served_shown(rid): continue
    s = R.set_index('date').sort_index(); lvo = s.lv_obs; srv = s.lv_srv.fillna(0)
    row = []
    for a in range(1, 15):
        p = lvo.reindex(lvo.index - pd.Timedelta(days=a)); p.index = lvo.index
        ok = p.notna()
        d = (p[ok] - lvo[ok]).abs().values - (srv[ok] - lvo[ok]).abs().values   # > 0: model level closer than the stale reading
        b = blocks_boot(d, lvo.index[ok], 1000)
        o26 = (lvo.index[ok].year == 2026)
        b26 = blocks_boot(d[o26], lvo.index[ok][o26], 1000)
        row.append(dict(age=a, n=int(ok.sum()), gain=b, gain2026=b26))
    first = next((r['age'] for r in row if r['gain'][1] is not None and r['gain'][1] > 0 and (r['gain2026'][0] or 0) >= 0), None)
    res[rid] = dict(switchAgeDays=first, table=row)
    print(rid, 'model beats the stale sheet from age', first, ' | gain at 3/7/14 d:', [(r['age'], round(r['gain'][0], 3), round(r['gain'][1], 3)) for r in row if r['age'] in (3, 7, 14)])
json.dump(res, open(os.path.join(OUT, 'rivercal_stale.json'), 'w'), indent=1)
