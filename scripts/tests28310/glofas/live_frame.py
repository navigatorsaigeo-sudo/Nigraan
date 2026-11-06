#!/usr/bin/env python3
"""v283.10 part 2 · R4(a): the date frame of the LIVE river forecast path.

Requests exactly what server/api/flood.mjs runForecast and limits.mjs request (daily river_discharge, ensemble, timezone
Asia/Karachi) plus the same in GMT, with past_days=40 so the response overlaps the station file (UTC day of the 24 h mean,
EWDS valid_time - 1 day). Per gauge: best lag of the control member vs the station file (Pearson r of daily log changes and share
of days within 2 %), and continuity across the past/forecast boundary (the forecast days must be in the same frame).
usage: python live_frame.py --file <glofas_irsa_daily.csv.gz> --app <data dir> --out <json> [--cache <dir>]  (no key needed; the
       customer endpoint is used when OPEN_METEO_KEY is in the environment; the key is never printed)"""
import os, sys, json, urllib.request, urllib.parse, datetime as dt
import numpy as np, pandas as pd
a = sys.argv[1:]; opt = lambda n, d=None: a[a.index(n) + 1] if n in a else d
IDS = {'kalabagh': 'Kala Bagh', 'chashma': 'Chashma', 'taunsa': 'Taunsa', 'guddu': 'Guddu', 'sukkur': 'Sukkur', 'kotri': 'Kotri',
       'nowshera': 'Nowshera', 'mangla': 'Mangla Dam', 'rasul': 'New Rasul', 'marala': 'Marala', 'khanki': 'Khanki', 'qadirabad': 'Qadirabad',
       'trimmu': 'Trimmu', 'panjnad': 'Panjnad', 'sulemanki': 'Sulemanki', 'islam': 'Islam'}   # the 16 gauges whose file column is the served cell


def pull(tz, R, cache):
    f = cache and os.path.join(cache, 'ens_%s.json' % tz.replace('/', '_'))
    if f and os.path.exists(f): return json.load(open(f))
    key = os.environ.get('OPEN_METEO_KEY'); host = 'https://customer-flood-api.open-meteo.com' if key else 'https://flood-api.open-meteo.com'
    ids = list(IDS)
    q = dict(latitude=','.join(str(R[i]['snapLat']) for i in ids), longitude=','.join(str(R[i]['snapLon']) for i in ids),
             daily='river_discharge', ensemble='true', forecast_days=30, past_days=40, timezone=tz)
    if key: q['apikey'] = key
    J = dict(ids=ids, fetchedUTC=dt.datetime.now(dt.timezone.utc).isoformat(), tz=tz,
             data=json.loads(urllib.request.urlopen(host + '/v1/flood?' + urllib.parse.urlencode(q), timeout=300).read()))
    if f: os.makedirs(cache, exist_ok=True); json.dump(J, open(f, 'w'))
    return J


def main():
    R = json.load(open(os.path.join(opt('--app'), 'river-rarity.json')))['reaches']
    F0 = pd.read_csv(opt('--file'), index_col=0, parse_dates=True)
    out = dict(rule='R4(a): one offset wins in >= 80 % of gauges', lagConvention='L: live(t+L) matches station file(t)', byTz={})
    for tz in ('Asia/Karachi', 'GMT'):
        J = pull(tz, R, opt('--cache')); per = {}
        for i, d in zip(J['ids'], J['data']):
            s = pd.Series(d['daily']['river_discharge'], index=pd.to_datetime(d['daily']['time']), dtype=float)
            f = F0[IDS[i]]['2026-09-01':].dropna()
            r, w = {}, {}
            for L in range(-3, 4):
                b = s.shift(-L).reindex(f.index); x = pd.concat([np.log(f).diff(), np.log(b).diff()], axis=1).dropna()
                if len(x) >= 8: r[L] = round(float(np.corrcoef(x.iloc[:, 0], x.iloc[:, 1])[0, 1]), 3)
                ok = b.notna(); w[L] = round(float(((f - b).abs() <= 0.02 * b.abs())[ok].mean() * 100), 1) if ok.sum() else None
            best = max(w, key=lambda L: -1 if w[L] is None else w[L])
            today = dt.datetime.fromisoformat(J['fetchedUTC']).astimezone(dt.timezone(dt.timedelta(hours=5 if tz != 'GMT' else 0))).date()
            k = s.index.get_indexer([pd.Timestamp(today)])[0]
            steps = np.abs(np.diff(np.log(s.values)))
            jump = float(steps[k - 1]) if k > 0 else None; typical = float(np.median(steps[max(0, k - 20):k + 20]))
            per[i] = dict(bestLagWithin2pct=best, within2pct=w, r=r, overlapDays=int(len(f)), firstForecastDate=str(today),
                          boundaryStep=round(jump, 4) if jump is not None else None, typicalStep=round(typical, 4))
        lags = [v['bestLagWithin2pct'] for v in per.values()]
        top = max(set(lags), key=lags.count)
        out['byTz'][tz] = dict(fetchedUTC=J['fetchedUTC'], gauges=per, modalLag=top, share=round(lags.count(top) / len(lags), 3),
                               established=lags.count(top) / len(lags) >= 0.8)
        print(tz, 'modal lag', top, 'share', out['byTz'][tz]['share'], 'fetched', J['fetchedUTC'])
    json.dump(out, open(opt('--out'), 'w'), indent=1)


if __name__ == '__main__':
    main()
