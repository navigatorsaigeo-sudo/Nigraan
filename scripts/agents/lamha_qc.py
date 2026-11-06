"""v91.17.283.7 - QC summary of the partner-network (EWS) hydrology copy, for the operator Health page only. Nothing here is scored or served.
Reads NIGRAAN's copy <dest>/ews_live/ews_hydro_hourly.parquet (never LAMHA's folder) and writes per station:
  hours held, first / last hour (UTC), elements;
  waterLevelFaultHours   hours whose minimum Water Level is the -10 m fault value README_hydro.txt names (min <= -9.99 m)
  missingCodeHours       hours carrying the portal's missing-code residue (|value| >= 2,000,000: 2147483648 / 1000 variants)
  waterTempBelow0Hours   Water Temperature below 0 C (liquid water cannot be: sensor out of the water or frozen, README_hydro.txt)
and the README's standing cautions (Cumulative Flow is a volume counter with a wrong unit; Alarm Button coding unconfirmed).
Also the newest hour of the EWS weather copy (ews_live_hourly.parquet) for the feed check.
usage: python lamha_qc.py --dest <...\\nig\\data\\from_lamha> --out <data\\agents\\lamha\\ews_hydro_qc.json>"""
import sys, os, json, argparse, datetime
ap = argparse.ArgumentParser(); ap.add_argument('--dest', required=True); ap.add_argument('--out', required=True); A = ap.parse_args()
try:
    import pandas as pd
except Exception as e:
    print('pandas not installed: ' + str(e)); sys.exit(3)
out = {'built': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'source': os.path.join(A.dest, 'ews_live') + ' (v91.17.283.28: NIGRAAN own EWS fetch; partner network EWS hydrology)', 'scored': False,
       'cautions': ['Water Level -10 m is a fault value, not a level', 'Cumulative Flow is a running volume counter (its m3/s unit is wrong): use Instantaneous Flow',
                    'Alarm Button reads 1 almost all the time: coding unconfirmed, not used', 'not used for scoring until these are confirmed'], 'stations': []}
f = os.path.join(A.dest, 'ews_live', 'ews_hydro_hourly.parquet')
try:
    h = pd.read_parquet(f)
except Exception as e:
    print('hydrology copy not readable: ' + str(e)); sys.exit(4)
h['hour_utc'] = pd.to_datetime(h['hour_utc'])
out['hoursFrom'] = str(h['hour_utc'].min()); out['newestHour'] = str(h['hour_utc'].max()); out['rows'] = int(len(h))
for (sid, st), g in h.groupby(['station_id', 'station']):
    wl = g[g['element'] == 'Water Level']; wt = g[g['element'] == 'Water Temperature']
    big = (g['value'].abs() >= 2e6) | (g['max'].abs() >= 2e6) | (g['min'].abs() >= 2e6)
    out['stations'].append({'id': int(sid), 'station': st, 'lat': float(g['latitude'].iloc[0]) if pd.notna(g['latitude'].iloc[0]) else None, 'lon': float(g['longitude'].iloc[0]) if pd.notna(g['longitude'].iloc[0]) else None,
        'hours': int(g['hour_utc'].nunique()), 'first': str(g['hour_utc'].min()), 'last': str(g['hour_utc'].max()), 'elements': sorted(g['element'].unique().tolist()),
        'waterLevelHours': int(len(wl)), 'waterLevelFaultHours': int((wl['min'] <= -9.99).sum()), 'missingCodeHours': int(big.sum()), 'waterTempBelow0Hours': int((wt['value'] < 0).sum())})
S = out['stations']; out['totals'] = {'stations': len(S), 'withWaterLevelFault': sum(1 for s in S if s['waterLevelFaultHours']), 'waterLevelFaultHours': sum(s['waterLevelFaultHours'] for s in S),
    'withMissingCode': sum(1 for s in S if s['missingCodeHours']), 'missingCodeHours': sum(s['missingCodeHours'] for s in S), 'withWaterTempBelow0': sum(1 for s in S if s['waterTempBelow0Hours'])}
try:
    w = pd.read_parquet(os.path.join(A.dest, 'ews_live', 'ews_live_hourly.parquet'), columns=['hour_utc', 'station'])
    out['weather'] = {'newestHour': str(pd.to_datetime(w['hour_utc']).max()), 'stations': int(w['station'].nunique())}
except Exception as e:
    out['weather'] = {'why': 'weather copy not readable: ' + str(e)[:120]}
os.makedirs(os.path.dirname(A.out), exist_ok=True); t = A.out + '.tmp'; json.dump(out, open(t, 'w'), indent=1); os.replace(t, A.out)
print('ews hydrology QC: %d stations, %d with -10 m fault hours (%d hours), %d with missing-code residue' % (out['totals']['stations'], out['totals']['withWaterLevelFault'], out['totals']['waterLevelFaultHours'], out['totals']['withMissingCode']))
