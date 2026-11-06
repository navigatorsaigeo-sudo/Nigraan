#!/usr/bin/env python3
"""v283.10 · the river model flow series in the SERVED frame, for fitting anything that is applied to the served river forecast.

Why (v283.10 defect, scripts/tests28310/glofas/{xcorr_lag,live_frame}.py, data/evidence/glofas28310/):
  glofascal, rivercal and the flood-extent fit were fitted on station-lake/archive/glofas/glofas_irsa_daily.csv.gz but applied to
  the river forecast flood.mjs fetches from the provider flood API (GloFAS v4 at the snapped reach cells). They differed in:
   1. date frame: GloFAS stamps a 24 h mean at the END of its 24 h (ECMWF: "time stamp = end of averaging period"). The station
      file labels the mean by its own UTC day (EWDS valid_time - 1 day). The provider labels its reanalysis part (GMT labels up to
      2023-08-04) the same way, but its operational-forecast part (GMT labels from 2023-08-05, and every live forecast) by the
      valid date, i.e. 1 day late; with timezone=Asia/Karachi, which the server requested until v283.10, every label moved 1 more
      day: the live forecast row shown as day D held the UTC mean of D-2 (scripts/tests28310/glofas/live_frame.py, 16/16 gauges).
      v283.10 part 3: the 06:00 PKT gauge sheet of day G pairs with the UTC mean of G-1 (R6, gauge_pairing.py), and the relabel
      'client day D = UTC mean of D-1' passed its gauge-truth rule (R7). That is exactly the provider's GMT label for the forecast
      product, so the server now requests timezone GMT (flood.mjs, limits.mjs) and the served frame is 'provider-gmt'.
   2. product: from 2023-08-05 the provider's seamless series is its archived operational forecast (IFS-forced), not the
      ERA5-forced reanalysis the station file continues with. Every season with gauge data (2024-2026) is in that part.
   3. cell: Tarbela, Balloki and Sidhnai station-file columns are other model cells than the served reach cells.
frame: 'provider-gmt' (default; exactly what the server serves from v283.10): provider default model (seamless v4), timezone GMT,
       labels as returned -> glofas_served_gmt_daily.csv.gz (the series glofascal, rivercal and the flood extent fit on). In the
       forecast part (from 2023-08-05: every season with gauge data, and every live forecast) label D = UTC mean of D-1.
       'provider-asia-karachi' (evidence only; the pre-v283.10 served frame) -> glofas_served_pkt_daily.csv.gz.
       'utc-day-of-mean' (evidence / the proposed relabel only): timezone GMT; labels up to SPLICE - 1 kept, labels from SPLICE moved
       back 1 day; at the overlap day the reanalysis value is kept. The splice is checked against the provider's consolidated
       (reanalysis) model on every such build; the build stops if it moved. -> glofas_served_daily.csv.gz
cells: each reach's snapped cell in data/river-rarity.json (snapLat, snapLon). Columns = reach ids.
out  : <station-lake>/archive/glofas/glofas_served_gmt_daily.csv.gz (GLOFAS_SERVED overrides) + a .json sidecar (frame, cells, built).
key  : OPEN_METEO_KEY (environment only) selects the customer endpoint; it is never read from a file here and never printed.
usage: python glofas_served_series.py [--app <nigraan data dir>] [--out <file>] [--frame provider-gmt|provider-asia-karachi|utc-day-of-mean]
"""
import os, sys, json, time, datetime as dt, urllib.request, urllib.parse
import numpy as np, pandas as pd

a = sys.argv[1:]; opt = lambda n, d: a[a.index(n) + 1] if n in a else d
HERE = os.path.dirname(os.path.abspath(__file__))
APPD = os.path.abspath(opt('--app', os.environ.get('WS9_APP', os.path.join(HERE, '..', '..', '..', 'data'))))
_NIG = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..'))
UP = os.environ.get('WS9_UP') or (_NIG if os.path.isdir(os.path.join(_NIG, 'station-lake')) else '/mnt/user-data/uploads/NIGRAAN/nig')
FRAME = opt('--frame', 'provider-gmt')
NAMES = {'provider-gmt': 'glofas_served_gmt_daily.csv.gz', 'provider-asia-karachi': 'glofas_served_pkt_daily.csv.gz', 'utc-day-of-mean': 'glofas_served_daily.csv.gz'}
OUT = os.path.abspath(opt('--out', os.environ.get('GLOFAS_SERVED') or os.path.join(UP, 'station-lake', 'archive', 'glofas',
                          NAMES[FRAME])))
SPLICE = '2023-08-05'   # first GMT label of the provider's forecast part (checked below)


def fetch(ids, R, start, end, tz='GMT', model=None):
    key = os.environ.get('OPEN_METEO_KEY')
    host = 'https://customer-flood-api.open-meteo.com' if key else 'https://flood-api.open-meteo.com'
    q = dict(latitude=','.join(str(R[i]['snapLat']) for i in ids), longitude=','.join(str(R[i]['snapLon']) for i in ids),
             daily='river_discharge', start_date=start, end_date=end, timezone=tz)
    if model: q['models'] = model
    if key: q['apikey'] = key
    for k in range(3):
        try:
            d = json.loads(urllib.request.urlopen(host + '/v1/flood?' + urllib.parse.urlencode(q), timeout=600).read()); break
        except Exception as e:
            if k == 2: raise SystemExit('provider request failed: %s' % type(e).__name__)   # never echo the URL (it may carry the key)
            time.sleep(10 * (k + 1))
    d = d if isinstance(d, list) else [d]
    out = {}
    for i, r in zip(ids, d):
        if abs(r['latitude'] - R[i]['snapLat']) > 0.03 or abs(r['longitude'] - R[i]['snapLon']) > 0.03:
            raise SystemExit('provider returned another cell for %s' % i)
        out[i] = pd.Series(r['daily']['river_discharge'], index=pd.to_datetime(r['daily']['time']), dtype=float)
    return pd.DataFrame(out)


def check_splice(ids, R):
    s = fetch(ids, R, '2023-07-20', '2023-08-20'); c = fetch(ids, R, '2023-07-20', '2023-08-20', model='consolidated_v4')
    same = ((s - c).abs() < 1e-6).where(c.notna()).mean(axis=1)
    first = same[same < 0.5].index.min()
    if str(first.date()) != SPLICE: raise SystemExit('the provider splice moved: first forecast-part label %s, expected %s' % (first.date(), SPLICE))


def to_frame(G):
    """GMT-labelled provider series -> UTC day of the 24 h mean"""
    sp = pd.Timestamp(SPLICE)
    re_ = G[G.index < sp]; fc = G[G.index >= sp].copy(); fc.index = fc.index - pd.Timedelta(days=1)
    return pd.concat([re_, fc[~fc.index.isin(re_.index)]]).sort_index()


def main():
    R = json.load(open(os.path.join(APPD, 'river-rarity.json')))['reaches']
    ids = sorted(R)
    end = (dt.datetime.now(dt.timezone.utc).date() - dt.timedelta(days=1)).isoformat()
    tz = 'Asia/Karachi' if FRAME == 'provider-asia-karachi' else 'GMT'
    parts = [fetch(ids[i:i + 10], R, '1997-01-01', end, tz) for i in range(0, len(ids), 10)]
    D = pd.concat(parts, axis=1).sort_index()
    if FRAME == 'utc-day-of-mean':
        check_splice(ids[:10], R); D = to_frame(D)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    D.round(2).to_csv(OUT)
    json.dump(dict(built=dt.datetime.now(dt.timezone(dt.timedelta(hours=5))).strftime('%Y-%m-%d %H:%M PKT'), frame=FRAME,
                   label={'utc-day-of-mean': 'UTC day of the 24 h mean (provider reanalysis labels to %s, forecast labels -1 day from it)' % SPLICE,
                          'provider-gmt': 'provider label in timezone GMT (the served frame from v283.10; UTC mean of the label day to 2023-08-04, of label-1 day after)',
                          'provider-asia-karachi': 'provider label in timezone Asia/Karachi (served until v283.9; UTC mean of label-1 day to 2023-08-04, label-2 days after)'}[FRAME],
                   splice=SPLICE, cells={i: [R[i]['snapLat'], R[i]['snapLon']] for i in ids}, first=str(D.index.min().date()),
                   last=str(D.index.max().date()),
                   source='GloFAS v4 river discharge (Copernicus Emergency Management Service) via the provider flood API'),
              open(OUT.replace('.csv.gz', '.json'), 'w'), indent=1)
    print('reaches', len(ids), 'frame', FRAME, D.index.min().date(), '..', D.index.max().date(), '->', OUT)


if __name__ == '__main__':
    main()
