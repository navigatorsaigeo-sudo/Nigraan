"""DEW v275 - the nine blend members' own dew point and the served plains start (blend v3: the temperature weights applied to dew point,
blend.mjs) against synoptic stations, at the plains points the station-lake multi-model archive holds (archive/model/mm: forecasts as
issued, leads 1, 2, 3, 5 d; Oct 2025 - Feb 2026). best_match proxy = ECMWF IFS 0.25 (best_match serves ECMWF IFS over Pakistan)."""
import os, sys, json, glob, numpy as np, pandas as pd
sys.dont_write_bytecode = True
LAKE = '/mnt/user-data/uploads/NIGRAAN/nig/station-lake/archive'; APP = '/tmp/claude-0/v275/srv_dew'
MODELS = {'ifs': 'ecmwf_ifs025', 'gfs': 'gfs_global', 'icon': 'icon_global', 'gem': 'gem_global', 'jma': 'jma_gsm', 'ukmo': 'ukmo_global_deterministic_10km', 'cma': 'cma_grapes_global', 'arp': 'meteofrance_arpege_world', 'aifs': 'ecmwf_aifs025_single'}
LEADS = [1, 2, 3, 5, 7]; VARS = ['t', 'td', 'cc', 'ws', 'wd', 'sw', 'pr']; CORE = ['ifs', 'gfs', 'icon', 'gem', 'cma', 'jma']
W = json.load(open(APP + '/data/blend-weights-v3.json')); SETS = [W['sets'][str(i)] for i in range(len(W['sets']))]
def frame(m, pid):
    parts = []
    for f in sorted(glob.glob(f'{LAKE}/model/mm/{m}/{pid}_*.npz')):
        z = np.load(f); x = z['x'].astype(np.float32); s0 = pd.Timestamp(os.path.basename(f).rsplit('_', 1)[1][:10], tz='UTC')
        t = s0 + pd.to_timedelta(np.arange(x.shape[-1]), unit='h')
        for li, L in enumerate(LEADS): parts.append(pd.DataFrame({'ts': t, 'L': L, 't': x[0, li], 'td': x[1, li]}))
    return pd.concat(parts).drop_duplicates(['ts', 'L']).set_index(['ts', 'L']) if parts else None
def pick(si, L, blk, hot):
    keys = ([f'set{si}|plains|L{L}|blk{blk}|hot', f'set{si}|plains|L{L}|blk-1|hot'] if hot else []) + [f'set{si}|plains|L{L}|blk{blk}', f'set{si}|plains|L{L}|blk-1', f'set{si}|*|L{L}|blk-1']
    for k in keys:
        v = W['window2_weights'].get(k)
        if v:
            w = np.array([float(v['w'].get(m, 0)) for m in SETS[si]]); s = w.sum()
            if s > 0: return w / s
    return None
sy = pd.read_parquet(LAKE + '/synop_ogimet/synop_ogimet_all.parquet'); sy['sid'] = sy.sid.astype(str); sy['ts'] = pd.to_datetime(sy.t, utc=True)
rows = []
for pid in ['syn_41530', 'syn_41641', 'syn_41712', 'syn_41715']:
    F = {s: frame(m, pid) for s, m in MODELS.items()}
    D = pd.concat({s: f for s, f in F.items() if f is not None}, axis=1); D.columns = [f'{a}_{b}' for a, b in D.columns]
    o = sy[sy.sid == pid[4:]].dropna(subset=['td_c']).set_index('ts')
    D = D.reset_index(); D = D[D.L.isin([1, 2, 3, 5])]
    D['otd'] = D.ts.map(o.td_c[~o.index.duplicated()]); D = D.dropna(subset=['otd'])
    bl = []
    for r in D.itertuples(index=False):
        rr = r._asdict(); T = {s: rr.get(f'{s}_t') for s in MODELS}; Td = {s: rr.get(f'{s}_td') for s in MODELS}
        med = np.median([T[s] for s in CORE if T[s] == T[s]]) if any(T[s] == T[s] for s in CORE) else np.nan
        thr = W['regime'].get(f'plains|{r.ts.month}'); hot = thr is not None and med >= thr
        blk = ((r.ts.hour + 5) % 24) // 3; v = np.nan
        for si, S in enumerate(SETS):
            if not all(T[m] == T[m] and Td[m] == Td[m] for m in S): continue
            w = pick(si, r.L, blk, hot)
            if w is None: continue
            v = min(float(sum(wj * Td[m] for wj, m in zip(w, S))), float(sum(wj * T[m] for wj, m in zip(w, S)))); break
        bl.append(v)
    D['blend_td'] = bl; D['mix3_td'] = D[['icon_td', 'gfs_td', 'arp_td']].mean(axis=1, skipna=False); D['pid'] = pid; rows.append(D)
R = pd.concat(rows, ignore_index=True); R['month'] = R.ts.dt.month
out = {}
for c in [f'{s}_td' for s in MODELS] + ['blend_td', 'mix3_td']:
    e = (R[c] - R.otd).dropna(); out[c] = {'n': int(len(e)), 'bias': round(float(e.mean()), 2), 'mae': round(float(e.abs().mean()), 2)}
print(json.dumps(out, indent=0))
ok = R.dropna(subset=['blend_td', 'ifs_td'])
print('paired blend vs ifs: n', len(ok), 'blend bias', round((ok.blend_td - ok.otd).mean(), 2), 'mae', round((ok.blend_td - ok.otd).abs().mean(), 2), '| ifs bias', round((ok.ifs_td - ok.otd).mean(), 2), 'mae', round((ok.ifs_td - ok.otd).abs().mean(), 2))
print(ok.assign(eb=(ok.blend_td - ok.otd).abs(), ei=(ok.ifs_td - ok.otd).abs(), bb=ok.blend_td - ok.otd, bi=ok.ifs_td - ok.otd).groupby(['month']).agg(n=('eb', 'size'), blend_mae=('eb', 'mean'), ifs_mae=('ei', 'mean'), blend_bias=('bb', 'mean'), ifs_bias=('bi', 'mean')).round(2).to_string())
R.to_parquet(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'members_mm.parquet'))
