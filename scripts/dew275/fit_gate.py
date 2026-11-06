"""DEW v275 - a fitted final dew-point correction on the SERVED tehsil chain, and its held-out gate (v270 rules).

Data      scripts/dew275/out/tehsil_pairs.parquet (tehpairs.py = the ARCH v275 pairing: served tehsil forecast archive, run at 00:00 PKT
          after every correction, vs SYNOP / METAR / MACH (stuck-screened) at stations within 25 km, same zone, 300 m), lead days 0-2
          (the archive holds 73 h), valid 26 Sep - 14 Oct 2026. Served dew point = Magnus over the served T and RH (as ARCH).
Fit       offset(zone, PKT block) = median(observed - served dew point) on the standard networks (SYNOP + METAR; MACH rooftop
          humidity sensors are not fitted on, only scored); block = 24 h (C0), 6 h (C1) or 3 h (C2): the held-out folds pick one.
          Applied: dew' = min(dew + offset, T); RH from T and dew'.
Held out  two windows (W1 valid 26 Sep - 5 Oct, W2 6 - 14 Oct) x leave-one-station-out: a test row's offset is fitted on the OTHER
          window and OTHER stations only.
Gate      per zone, all networks scored (MAE gain = served - fixed, positive = better, 90 % interval by resampling whole valid days):
          W1 lower bound > 0; W2 gain >= 0; no month (Sep, Oct) worse beyond doubt; humid days (zone's top 10 % station-days by
          observed daily mean dew point) not worse beyond doubt; every network with >= 3 stations in the zone not worse beyond doubt;
          UTCI in shade daily maximum vs observed shade UTCI (D4: Tmrt = Ta, the served wind on both sides) not worse beyond doubt.
Out       scripts/dew275/out/gate.json, data/dew-final.json (served offsets; zones that pass only)."""
import os, sys, json, subprocess, numpy as np, pandas as pd
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.abspath(os.path.join(HERE, '..', '..'))
rng = np.random.default_rng(275)
P = pd.read_parquet(os.path.join(HERE, 'out', 'tehsil_pairs.parquet'))
P = P[(P.lead <= 2)].dropna(subset=['fT', 'fRH', 'oT', 'oTd']).copy()
P = P[P.oTd <= P.oT + 0.5]
P['hpk'] = ((P.vms // 3600_000 + 5) % 24).astype(int)
P['month'] = P.vday.str[5:7]
P['win'] = np.where(P.vday <= '2026-10-05', 'W1', 'W2')
P['sid'] = P.net + ':' + P.key.astype(str)
def dew(T, RH):
    RH = np.clip(np.asarray(RH, float), 1, 100); T = np.asarray(T, float); g = np.log(RH / 100) + 17.625 * T / (243.04 + T); return 243.04 * g / (17.625 - g)
def rh(T, Td): return np.clip(100 * np.exp(17.625 * Td / (243.04 + Td)) / np.exp(17.625 * T / (243.04 + T)), 1, 100)
P['fTd'] = dew(P.fT, P.fRH); P['oRH'] = rh(P.oT, P.oTd)
P['res'] = P.oTd - P.fTd
FIT_NETS = ['synop', 'metar']
BLK = {'C0': 24, 'C1': 6, 'C2': 3}
def blk(h, w): return (h // w).astype(int)
def offsets(D, w):
    """zone x block median of (obs - served) on the fit networks; a block with no rows takes the zone median"""
    D = D[D.net.isin(FIT_NETS)]
    z = D.groupby('zone').res.median().to_dict()
    c = D.assign(b=blk(D.hpk, w)).groupby(['zone', 'b']).res.median().to_dict()
    return z, c
def apply_off(D, z, c, w):
    b = blk(D.hpk, w).values
    o = np.array([c.get((zz, bb), z.get(zz, 0.0)) for zz, bb in zip(D.zone.values, b)])
    return o
def heldout(w):
    """per row: offset fitted on the other window and other stations"""
    out = np.full(len(P), np.nan)
    for win in ['W1', 'W2']:
        T = P[P.win == win]; F = P[P.win != win]
        for s, idx in T.groupby('sid').groups.items():
            z, c = offsets(F[F.sid != s], w)
            out[P.index.get_indexer(idx)] = apply_off(P.loc[idx], z, c, w)
    return out
P = P.reset_index(drop=True)
choice = {}
for name, w in BLK.items():
    off = heldout(w); P['off_' + name] = off
    fx = np.minimum(P.fTd + off, P.fT); choice[name] = {zz: float((np.abs(fx - P.oTd)[P.zone == zz]).mean()) for zz in P.zone.unique()}
print('held-out MAE by candidate', json.dumps({k: {z: round(v, 3) for z, v in d.items()} for k, d in choice.items()}))
def boot(err_a, err_b, days, n=1000):
    """gain = mean|a| - mean|b| (positive: b better); 90 % by whole valid days"""
    a = np.abs(np.asarray(err_a, float)); b = np.abs(np.asarray(err_b, float)); d = np.asarray(days)
    if len(a) < 20: return None
    ud = np.unique(d); ix = {k: np.where(d == k)[0] for k in ud}; g = a.mean() - b.mean(); bs = []
    for _ in range(n):
        pk = rng.choice(ud, len(ud)); ii = np.concatenate([ix[k] for k in pk]); bs.append(a[ii].mean() - b[ii].mean())
    return {'n': int(len(a)), 'days': int(len(ud)), 'served': round(float(a.mean()), 3), 'fixed': round(float(b.mean()), 3), 'gain': round(float(g), 3), 'lo': round(float(np.quantile(bs, .05)), 3), 'hi': round(float(np.quantile(bs, .95)), 3)}
# UTCI in shade for served / fixed / observed (the server's own utci.mjs)
def utci_batch(T, V, R):
    rows = [[None if not np.isfinite(t) else float(t), None if not np.isfinite(v) else float(v), None if not np.isfinite(r) else float(r)] for t, v, r in zip(T, V, R)]
    res = subprocess.run(['node', os.path.join(HERE, 'utci_batch.mjs')], input=json.dumps({'rows': rows}), capture_output=True, text=True, check=True)
    j = json.loads(res.stdout); return np.array([np.nan if x is None else x for x in j['utci']], float), j['level']
GATE = {}
for zone in ['plains', 'hills', 'mountain', 'coast']:
    Z = P[P.zone == zone].copy()
    if not len(Z): continue
    best = min(BLK, key=lambda k: choice[k].get(zone, 9e9)); Z['off'] = Z['off_' + best]
    Z['fx'] = np.minimum(Z.fTd + Z.off, Z.fT); Z['es'] = Z.fTd - Z.oTd; Z['ef'] = Z.fx - Z.oTd
    Z['rs'] = Z.fRH - Z.oRH; Z['rf'] = rh(Z.fT, Z.fx) - Z.oRH
    g = {'candidate': best, 'stations': int(Z.sid.nunique()), 'bias_served': round(float(Z.es.mean()), 2), 'bias_fixed': round(float(Z.ef.mean()), 2)}
    g['W1'] = boot(Z.es[Z.win == 'W1'], Z.ef[Z.win == 'W1'], Z.vday[Z.win == 'W1']); g['W2'] = boot(Z.es[Z.win == 'W2'], Z.ef[Z.win == 'W2'], Z.vday[Z.win == 'W2'])
    g['all'] = boot(Z.es, Z.ef, Z.vday); g['rh'] = boot(Z.rs, Z.rf, Z.vday)
    g['months'] = {m: boot(Z.es[Z.month == m], Z.ef[Z.month == m], Z.vday[Z.month == m]) for m in sorted(Z.month.unique())}
    sd = Z.groupby(['sid', 'vday']).oTd.mean(); thr = sd.quantile(0.9); hum = set(sd[sd >= thr].index)
    hm = np.array([(s, d) in hum for s, d in zip(Z.sid, Z.vday)])
    g['humid'] = boot(Z.es[hm], Z.ef[hm], Z.vday[hm]); g['humidThresholdC'] = round(float(thr), 1)
    g['nets'] = {}
    for n_, s in Z.groupby('net'):
        if s.sid.nunique() >= 3: g['nets'][n_] = dict(boot(s.es, s.ef, s.vday) or {}, stations=int(s.sid.nunique()))
    # UTCI shade daily maximum (station x issue x valid day, >= 18 hours)
    V = (Z.fW.astype(float) / 3.6).values
    us, _ = utci_batch(Z.fT.values, V, Z.fRH.astype(float).values); uf, _ = utci_batch(Z.fT.values, V, rh(Z.fT, Z.fx).values); uo, _ = utci_batch(Z.oT.values, V, Z.oRH.values)
    Z['us'], Z['uf'], Z['uo'] = us, uf, uo
    D = Z.dropna(subset=['us', 'uf', 'uo']).groupby(['sid', 'issue', 'vday']).agg(n=('us', 'size'), us=('us', 'max'), uf=('uf', 'max'), uo=('uo', 'max')).reset_index()
    D = D[D.n >= 18]
    g['utciDailyMax'] = boot(D.us - D.uo, D.uf - D.uo, D.vday); g['utciBias'] = {'served': round(float((D.us - D.uo).mean()), 2), 'fixed': round(float((D.uf - D.uo).mean()), 2)} if len(D) else None
    if len(D):
        _, ls = utci_batch(D.us.values, np.full(len(D), 0.5), np.full(len(D), 50.0))   # level from the value itself (placeholder inputs unused)
    def notworse(b): return b is None or b['hi'] >= 0
    lines = {'W1 lower bound > 0': bool(g['W1'] and g['W1']['lo'] > 0), 'W2 >= 0': bool(g['W2'] and g['W2']['gain'] >= 0),
             'no month worse beyond doubt': all(notworse(b) for b in g['months'].values()), 'humid days not worse': notworse(g['humid']),
             'networks (>= 3 stations) not worse': all(notworse(b) for b in g['nets'].values()), 'UTCI daily max not worse': notworse(g['utciDailyMax'])}
    g['lines'] = lines; g['pass'] = all(lines.values()); GATE[zone] = g
    print(zone, best, 'PASS' if g['pass'] else 'FAIL', {k: v for k, v in lines.items()}, 'all', g['all'], 'utci', g['utciDailyMax'], g['utciBias'])
# the served offsets: fitted on ALL rows of the fit networks, for the zones that pass, with the candidate block the folds chose
served = {}
for zone, g in GATE.items():
    w = BLK[g['candidate']]; z, c = offsets(P[P.zone == zone], w)
    served[zone] = {'applied': g['pass'], 'blockH': w, 'zoneMedianC': round(z.get(zone, 0.0), 2), 'offsetsC': [round(c.get((zone, b), z.get(zone, 0.0)), 2) for b in range(24 // w)],
                    'pairs': int(((P.zone == zone) & P.net.isin(FIT_NETS)).sum()), 'stations': int(P[(P.zone == zone) & P.net.isin(FIT_NETS)].sid.nunique())}
json.dump({'gate': GATE, 'served': served, 'heldOutMaeByCandidate': choice}, open(os.path.join(HERE, 'out', 'gate.json'), 'w'), indent=1, default=float)
print(json.dumps(served, indent=0))
