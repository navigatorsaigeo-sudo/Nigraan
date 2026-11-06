"""Smog inversion on the stored 14 Oct 2026 run: served (mixed, as stored) vs ICON-only one column, plus the historical best_match pair
for an apples-to-apples old. Free Open-Meteo historical-forecast API (no key)."""
import json, urllib.request, urllib.parse, time
S = json.load(open('/tmp/claude-0/v28310sp/srv/data/smog.json'))
U = [u for u in json.load(open('/tmp/claude-0/v28310sp/srv/server/contract/units.json')) if u.get('unitId') in S['units'] and u.get('elevM') is not None and u['elevM'] < 500]
days = S['days']; d0, d1 = days[0], days[-1]
def get(q):
    url = 'https://historical-forecast-api.open-meteo.com/v1/forecast?' + urllib.parse.urlencode(q)
    time.sleep(15)
    for i in range(5):
        try:
            with urllib.request.urlopen(url, timeout=120) as r: j = json.load(r)
            return j if isinstance(j, list) else [j]
        except Exception as e: err = e; time.sleep(65 * (i + 1))
    raise err
out = {}
for i in range(0, len(U), 50):
    b = U[i:i + 50]; base = dict(latitude=','.join('%.4f' % u['lat'] for u in b), longitude=','.join('%.4f' % u['lon'] for u in b), start_date=d0, end_date=d1, timezone='Asia/Karachi')
    I = get(dict(base, elevation=','.join('nan' for u in b), models='icon_global', hourly='temperature_2m,temperature_925hPa,surface_pressure'))
    O = get(dict(base, elevation=','.join(str(u['elevM']) for u in b), models='best_match', hourly='temperature_2m,temperature_925hPa'))
    for u, a, o in zip(b, I, O): out[u['unitId']] = dict(icon=a['hourly'], bm=o['hourly'])
json.dump(out, open('inv14oct_raw.json', 'w')); print('units', len(out), 'days', d0, d1)
