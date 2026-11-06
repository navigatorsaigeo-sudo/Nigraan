#!/usr/bin/env python3
"""v91.17.267 · the parity reference for the live plains start (server/api/blend.mjs): the Step 2 script's OWN functions decide.
ref/step2_blend.py is station-lake/scripts/step2_blend.py as it built blend_v3 (byte copy); its blend_rows() and pick() blend the rows,
and the heat-regime flag is computed by the same lines as its main() --regime (median of the CORE models present >= the zone x month
90th percentile in the weights file's 'regime'). mm_table is stubbed with mm_table.py's SHORT and CORE (the real module reads the laptop
archive at import). The weights are the file's window2_weights, renormalised to sum 1 (the file rounds to 3 decimals; step2_blend.solve
returns w / sum w, step2_tc_blend.weights renormalises the same way), with the '|hot' keys as (set, zone, L, blk, 'hot').
usage: python -I blend_ref.py <in.json> <out.json>   in: {weights, rows: [{zone, ts (ms UTC), L, t: {model: degC|null}, td: {...}}]}"""
import sys, os, types, json
import numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
mm = types.ModuleType('mm_table')
mm.SHORT = {'ecmwf_ifs025': 'ifs', 'gfs_global': 'gfs', 'icon_global': 'icon', 'gem_global': 'gem', 'ukmo_global_deterministic_10km': 'ukmo',
            'ecmwf_aifs025_single': 'aifs', 'cma_grapes_global': 'cma', 'meteofrance_arpege_world': 'arp', 'jma_gsm': 'jma', 'ecmwf_ifs': 'ifs9'}
mm.CORE = ['ifs', 'gfs', 'icon', 'gem', 'cma', 'jma']; mm.LOCK = set()
sys.modules['mm_table'] = mm
sys.path.insert(0, os.path.join(HERE, 'ref'))
import step2_blend as SB

inp, out = sys.argv[1], sys.argv[2]
I = json.load(open(inp)); R = json.load(open(I['weights']))
SB.SETS[:] = [R['sets'][str(i)] for i in range(len(R['sets']))]
Wt = {}
for k, v in R['window2_weights'].items():
    p = k.split('|'); si = int(p[0][3:]); z = p[1]; L = int(p[2][1:]); b = int(p[3][3:])
    w = np.array([v['w'][m] for m in SB.SETS[si]], float); w = w / w.sum() if w.sum() > 0 else w
    Wt[(si, z, L, b) + (('hot',) if len(p) > 4 else ())] = (w, v['n'])
HOTQ = {(k.split('|')[0], int(k.split('|')[1])): float(v) for k, v in R['regime'].items()}
res = [None] * len(I['rows'])
rows = pd.DataFrame([dict(i=i, zone=r['zone'], ts=pd.Timestamp(r['ts'], unit='ms', tz='UTC'), L=int(r['L']),
                          **{m + '_t': (np.nan if r['t'].get(m) is None else r['t'][m]) for m in SB.SET9},
                          **{m + '_td': (np.nan if r['td'].get(m) is None else r['td'][m]) for m in SB.SET9}) for i, r in enumerate(I['rows'])])
for z, F in rows.groupby('zone'):
    F = F.reset_index(drop=True)
    F['blk'] = ((F.ts.dt.hour + 5) % 24) // 3
    core = [c + '_t' for c in mm.CORE if c + '_t' in F]; med = F[core].median(axis=1)       # step2_blend.main(), locked points, --regime
    F = F.assign(hot=(med >= np.array([HOTQ.get((z, m), np.inf) for m in F.ts.dt.month])).values)
    bt, bd, used = SB.blend_rows(F, Wt, z)
    for k in range(len(F)):
        res[int(F.i[k])] = dict(bt=None if np.isnan(bt[k]) else float(bt[k]), bd=None if np.isnan(bd[k]) else float(bd[k]), used=int(used[k]), hot=bool(F.hot[k]))
json.dump({'rows': res}, open(out, 'w'))
print('reference rows', len(res), 'blended', sum(r['bt'] is not None for r in res), 'hot', sum(r['hot'] for r in res))
