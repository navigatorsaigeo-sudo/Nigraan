"""v283 WS5 - LANDSLIDE RAIN BASIS: fetch the two rain series the landslide layer needs to put training and serving on ONE basis.

Finding (v283 EVIDENCE.md, item 2): the odds model was TRAINED on archive rain (customer archive /v1/archive, daily rain_sum, archive
default model, UTC days, catalogue point) but is SERVED past rain from the forecast endpoint (/v1/forecast past_days, daily rain_sum,
tehsil point and settlement height, Asia/Karachi days). At 4 tehsils, 18 Aug-12 Oct 2026, the archive totals were 2-5x the live ones.

This script fetches, per tehsil the landslide layer assesses (server/contract/units.json minus data/hazard-applicability.json
layers.landslide.units, minus disputed), 2022-01-01 to the latest available day:
  archive/<uid>.json   SOURCE (a) the training basis: customer archive, daily=rain_sum, no `models` (archive default, as trained),
                       latitude/longitude rounded to 4 decimals, no elevation parameter (as trained), timezone=UTC
  hist/<uid>.json      SOURCE (b) the serving basis: customer historical-forecast, daily=rain_sum, tehsil latitude/longitude,
                       elevation = the tehsil settlement height (units.json elevM, as landslideodds.mjs sends), timezone=Asia/Karachi
and, with --catalogue, the training cache that was lost on 11 Oct (catalogue cells, 2007-01-01..2017-12-31, exactly the request of
station-lake/scripts/landslide_prob_liquid.py) into cache/<sha1>.json, the file names landslide_backtest.py uses.

Key: environment MACH_API_KEY or OPEN_METEO_API_KEY, else nigraan-local/mach.key (the server's own order, server/server.mjs). The key
is never printed, logged or written; error texts are scrubbed of it. Writes ONLY under nigraan-local/data/landslide-basis/.
Resumable: a file already holding the target end day is skipped; a partial run continues where it stopped. Paced: one request per
place, --pause seconds between requests (default 1.5), backoff on HTTP 429/5xx.
usage (from nigraan-local):  python scripts/landslide_basis/fetch_landslide_basis.py [--catalogue <landslide_events.csv>] [--pause 1.5]"""
import os, sys, json, time, hashlib, datetime as dt, urllib.request, urllib.parse, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(APP, 'data', 'landslide-basis')
A = sys.argv[1:]; arg = lambda k, d=None: A[A.index(k) + 1] if k in A else d
PAUSE = float(arg('--pause', '1.5')); CAT = arg('--catalogue')
HOSTS = {'archive': 'https://customer-archive-api.open-meteo.com/v1/archive', 'hist': 'https://customer-historical-forecast-api.open-meteo.com/v1/forecast'}
START = '2022-01-01'

def key():
    k = os.environ.get('MACH_API_KEY') or os.environ.get('OPEN_METEO_API_KEY')
    if not k:
        try: k = open(os.path.join(APP, 'mach.key'), encoding='utf-8').read().strip()
        except OSError: k = ''
    return k
KEY = key()
def scrub(s): return str(s).replace(KEY, '***') if KEY else str(s)
os.makedirs(os.path.join(OUT, 'archive'), exist_ok=True); os.makedirs(os.path.join(OUT, 'hist'), exist_ok=True); os.makedirs(os.path.join(OUT, 'cache'), exist_ok=True)
LOG = open(os.path.join(OUT, 'progress.log'), 'a', encoding='utf-8')
def log(*a):
    line = dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S PKT ') + scrub(' '.join(str(x) for x in a)); print(line, flush=True); LOG.write(line + '\n'); LOG.flush()

def get(host, q):
    url = HOSTS[host] + '?' + urllib.parse.urlencode({**q, 'apikey': KEY})
    for k in range(6):
        try:
            with urllib.request.urlopen(url, timeout=180) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and k < 5: time.sleep(10 * (k + 1)); continue
            raise RuntimeError('HTTP %s from %s' % (e.code, host)) from None
        except Exception as e:
            if k < 5: time.sleep(10 * (k + 1)); continue
            raise RuntimeError(scrub(e)) from None

def safe(uid): return uid.replace('|', '__').replace(' ', '_').replace('/', '_')
def have(f, end):
    try: d = json.load(open(f, encoding='utf-8')); return d.get('daily', {}).get('time', [''])[-1] >= end
    except Exception: return False
def save(f, obj): t = f + '.tmp'; json.dump(obj, open(t, 'w', encoding='utf-8')); os.replace(t, f)

def units():
    U = json.load(open(os.path.join(APP, 'server', 'contract', 'units.json'), encoding='utf-8'))
    H = json.load(open(os.path.join(APP, 'data', 'hazard-applicability.json'), encoding='utf-8'))
    out = set(((H.get('layers') or {}).get('landslide') or {}).get('units') or {})
    return [u for u in U if not u.get('disputed') and u.get('lat') is not None and u.get('lon') is not None and u['unitId'] not in out]

def main():
    if not KEY: log('STOP: no paid key (MACH_API_KEY / OPEN_METEO_API_KEY / mach.key)'); return 2
    today = dt.date.today()
    end_arc = (today - dt.timedelta(days=6)).isoformat()   # the archive holds reanalysis to about 5 days back
    end_his = (today - dt.timedelta(days=1)).isoformat()
    L = units(); log('landslide basis fetch:', len(L), 'tehsils;', START, '->', end_arc, '(archive) /', end_his, '(historical forecast)')
    done = failed = skipped = 0
    for i, u in enumerate(L):
        uid = u['unitId']
        for src, end, q in (
            ('archive', end_arc, {'latitude': round(u['lat'], 4), 'longitude': round(u['lon'], 4), 'start_date': START, 'end_date': end_arc, 'timezone': 'UTC', 'daily': 'rain_sum'}),
            ('hist', end_his, {'latitude': u['lat'], 'longitude': u['lon'], 'elevation': u['elevM'] if u.get('elevM') is not None else 'nan', 'start_date': START, 'end_date': end_his, 'timezone': 'Asia/Karachi', 'daily': 'rain_sum'})):
            f = os.path.join(OUT, src, safe(uid) + '.json')
            if have(f, end): skipped += 1; continue
            try:
                j = get(src, q); j['agn'] = {'unitId': uid, 'source': src, 'request': {k: v for k, v in q.items()}, 'fetched': dt.datetime.now().isoformat(timespec='seconds')}
                save(f, j); done += 1
            except Exception as e: failed += 1; log('FAILED', src, uid, scrub(e))
            time.sleep(PAUSE)
        if (i + 1) % 10 == 0: log('progress', i + 1, '/', len(L), 'tehsils; fetched', done, 'skipped', skipped, 'failed', failed)
    if CAT:
        import csv
        rows = list(csv.DictReader(open(CAT, encoding='utf-8'))); first = {}
        for r in rows: first.setdefault(r['cell'], r)
        log('catalogue cache: ', len(first), 'cells, 2007-01-01..2017-12-31 (training request of landslide_prob_liquid.py)')
        for c, r in first.items():
            q = {'latitude': round(float(r['lat']), 4), 'longitude': round(float(r['lon']), 4), 'start_date': '2007-01-01', 'end_date': '2017-12-31', 'timezone': 'UTC', 'daily': 'rain_sum'}
            url_nokey = HOSTS['archive'] + '?' + urllib.parse.urlencode(q) + '&'
            f = os.path.join(OUT, 'cache', hashlib.sha1(url_nokey.encode()).hexdigest() + '.json')
            if os.path.exists(f): skipped += 1; continue
            try: save(f, get('archive', q)); done += 1
            except Exception as e: failed += 1; log('FAILED catalogue', c, scrub(e))
            time.sleep(PAUSE)
    save(os.path.join(OUT, 'manifest.json'), {'finished': dt.datetime.now().isoformat(timespec='seconds'), 'tehsils': len(L), 'start': START, 'archiveEnd': end_arc, 'histEnd': end_his,
        'fetched': done, 'skipped': skipped, 'failed': failed, 'catalogue': bool(CAT)})
    log('finished: fetched', done, 'skipped', skipped, 'failed', failed); return 0 if not failed else 1

if __name__ == '__main__': sys.exit(main())
