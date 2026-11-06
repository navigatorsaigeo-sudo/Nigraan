#!/usr/bin/env python3
"""v91.17.272 hotfix · stuck / replayed MACH readings: the derivation of the screen's limits and the national before/after check.
usage: python stuck_screen.py [folder with obs_YYYYMMDD.csv of the MACH database (LAMHA copy)] [--parity out.csv]
  1 limits from the clean sources (wu_api, ecowitt): K99 / K999 = 99th / 99.9th percentile of |change| / sqrt(gap / 10 min) over
    consecutive readings with gap <= 90 min; FROZEN = 99.9th percentile of constant-temperature run length at the clean stations whose
    humidity passes the fleet's range rules
  2 the screen (identical to server/api/stuckscreen.mjs; --parity writes the verdicts for stuck_parity.mjs)
  3 national check: every usable MACH station minus the median of the clean stations within 40 km, every 30 min, before / after, by city
    and PKT hour (registry data/mach-fleet-stations.json; excluded keys and Apple rows out)
Read only; prints its tables."""
import sys, glob, json, math, os
import numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else '/mnt/user-data/uploads/LAMHA/data/mach/db'
K999=3.44; K99=1.27; MAXGAP=90.0; FROZEN=120.0
def sig(T,Td,RH,P):
    v=[T,Td,RH,P]; ok=[x is not None and not (isinstance(x,float) and math.isnan(x)) for x in v]
    if sum(ok[1:])<2: return None
    return tuple(round(x,2) if o else None for x,o in zip(v,ok))
def lim(k,dtmin): return k*math.sqrt(max(dtmin,1.0)/10.0)
def screen(rows):
    first={}; tfirst={}; lastchg=-1; prev=None; anchor=None; pending=None; out=[]; runT=None; runMs=None
    for i,(ms,T,Td,RH,P) in enumerate(rows):
        s=sig(T,Td,RH,P)
        rep = s is not None and s in first and lastchg>first[s]
        if s is not None and s not in first: first[s]=i
        if i>0 and s!=prev: lastchg=i
        prev=s
        tk=round(T,2); tl=tfirst.get(tk,(None,None)); tfirst[tk]=(ms,tl[0])
        if runT is None or T!=runT: runT=T; runMs=ms
        ref = anchor if anchor and (ms-anchor[0])/6e4<=MAXGAP else None
        v='ok'
        if (ms-runMs)/6e4>FROZEN: v='frozen'
        elif rep and (ref is None or abs(T-ref[1])>lim(K99,(ms-ref[0])/6e4)): v='stuck-replay'
        elif ref is not None and abs(T-ref[1])>lim(K999,(ms-ref[0])/6e4):
            if not rep and pending is not None and abs(T-pending[1])<=lim(K999,(ms-pending[0])/6e4) and not any(x is not None and x<pending[0] and (pending[0]-x)/6e4<=MAXGAP for x in tl): v='ok'
            else:
                v='jump'
                if not rep: pending=(ms,T)
        if v=='ok':
            anchor=(ms,T)
            if not rep: pending=None
        out.append(v)
    return out


def load():
    d = pd.concat([pd.read_csv(f) for f in sorted(glob.glob(os.path.join(SRC, 'obs_2*.csv')))])
    d['t'] = pd.to_datetime(d.time, format='ISO8601'); d['ms'] = (d.t - pd.Timestamp('1970-01-01', tz='UTC')).dt.total_seconds() * 1000
    d = d[d.temperatureC.notna()].drop_duplicates(['stationKey', 'ms']).sort_values(['stationKey', 'ms']); d['pkth'] = (d.t.dt.hour + 5) % 24
    return d


def derive(d):
    c = d[d.source.isin(['wu_api', 'ecowitt'])].copy()
    c['dt'] = c.groupby('stationKey').ms.diff() / 6e4; c['dT'] = c.groupby('stationKey').temperatureC.diff().abs()
    g = c[(c.dt > 0) & (c.dt <= 90)]; z = g.dT / np.sqrt(np.maximum(g.dt, 1) / 10)
    bad = set(d[(d.dewPointC > 40) | (d.dewPointC < -35) | (d.humidityPct > 100) | (d.humidityPct <= 2)].stationKey)
    spans = []
    for k, s in c[~c.stationKey.isin(bad)].groupby('stationKey'):
        T = s.temperatureC.values; ms = s.ms.values; a = 0
        for i in range(1, len(T) + 1):
            if i == len(T) or T[i] != T[a]: spans.append((ms[i - 1] - ms[a]) / 6e4); a = i
    print('limits: pairs %d, stations %d: K99 %.2f, K999 %.2f; constant runs %d: FROZEN q99.9 %.0f min' % (len(g), c.stationKey.nunique(), z.quantile(.99), z.quantile(.999), len(spans), pd.Series(spans).quantile(.999)))


def main():
    d = load(); derive(d)
    V = []
    for k, g in d.groupby('stationKey', sort=False): V += screen(list(zip(g.ms, g.temperatureC, g.dewPointC, g.humidityPct, g.pressureHpa)))
    d['v'] = V
    for s, g in d.groupby('source'): print('%-8s rejected %5.2f %%  18-23 PKT %5.2f %%' % (s, 100 * (g.v != 'ok').mean(), 100 * (g[(g.pkth >= 18)].v != 'ok').mean()))
    if '--parity' in sys.argv: d[['stationKey', 'ms', 'temperatureC', 'dewPointC', 'humidityPct', 'pressureHpa', 'v']].to_csv(sys.argv[sys.argv.index('--parity') + 1], index=False)
    reg = {s['key']: s for s in json.load(open(os.path.join(APP, 'data', 'mach-fleet-stations.json')))['stations']}
    km = lambda a, b, c, e: 6371 * math.acos(min(1, math.sin(math.radians(a)) * math.sin(math.radians(c)) + math.cos(math.radians(a)) * math.cos(math.radians(c)) * math.cos(math.radians(b - e))))
    city = lambda n: (lambda c: 'Islamabad-Rawalpindi' if c in ('Islamabad', 'Rawalpindi') else c)(n.split(',')[-1].strip())
    use = [k for k, s in reg.items() if not s.get('exclude')]
    fl = d[d.stationKey.isin(use) & ~d.source.isin(['qm', 'apple'])]
    bad = set(fl[(fl.dewPointC > 32) | (fl.dewPointC < -35) | (fl.humidityPct > 100) | (fl.humidityPct <= 2)].stationKey); fl = fl[~fl.stationKey.isin(bad)]
    src = fl.groupby('stationKey').source.agg(lambda s: s.mode()[0])
    clean = [k for k in src.index if src[k] in ('wu_api', 'ecowitt')]; others = [k for k in src.index if k not in clean]
    nb = {k: [c for c in clean if km(reg[k]['lat'], reg[k]['lon'], reg[c]['lat'], reg[c]['lon']) <= 40] for k in others}
    rows = []
    end = d.t.max().tz_convert('Asia/Karachi')
    for t in pd.date_range(end.normalize() - pd.Timedelta(days=1), end, freq='30min'):
        tms = (t.tz_convert('UTC') - pd.Timestamp('1970-01-01', tz='UTC')).total_seconds() * 1000
        w = fl[(fl.ms <= tms) & (fl.ms > tms - 3600000)]; raw = w.groupby('stationKey').last().temperatureC; scr = w[w.v == 'ok'].groupby('stationKey').last().temperatureC
        for k in others:
            cs = [c for c in nb[k] if c in scr.index]
            if not cs or k not in raw.index: continue
            ref = float(np.median(scr[cs])); rows.append(dict(h=t.tz_convert('Asia/Karachi').hour, city=city(reg[k]['name']), before=raw[k] - ref, after=(scr[k] - ref) if k in scr.index else np.nan))
    r = pd.DataFrame(rows); r['ab'] = r.before.abs(); r['aa'] = r.after.abs()
    band = lambda h: 'night 00-05' if h < 6 else 'morning 06-08' if h < 9 else 'day 09-16' if h < 17 else 'evening 17-23'
    r['band'] = r.h.map(band)
    pd.set_option('display.width', 250)
    print(r.groupby(['city', 'band']).agg(n=('ab', 'size'), mae_before=('ab', 'mean'), mae_after=('aa', 'mean'), bias_before=('before', 'mean'), bias_after=('after', 'mean')).round(2).to_string())
    print(r.groupby('h').agg(mae_before=('ab', 'mean'), mae_after=('aa', 'mean')).round(2).T.to_string())


if __name__ == '__main__':
    main()
