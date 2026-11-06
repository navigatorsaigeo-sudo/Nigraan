"""DEW v275 - writes data/dew-final.json from out/gate.json: the served final dew-point offsets, ONLY for zones whose every gate line
passed, valid only in the calendar months the fit covered and to the lead the archive scored (72 h)."""
import os, json
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.abspath(os.path.join(HERE, '..', '..'))
G = json.load(open(os.path.join(HERE, 'out', 'gate.json'))); M = json.load(open(os.path.join(HERE, 'out', 'mountain_check.json')))
zones = {}
for z, s in G['served'].items():
    g = G['gate'][z]
    zones[z] = {'applied': bool(g['pass']), 'blockH': s['blockH'], 'offsetsC': s['offsetsC'] if g['pass'] else None, 'fit': {'pairs': s['pairs'], 'stations': s['stations'], 'networks': ['synop', 'metar']},
                'gate': {k: v for k, v in g['lines'].items()}, 'heldOut': {'W1': g['W1'], 'W2': g['W2'], 'all': g['all'], 'rh': g['rh'], 'humid': g['humid'], 'utciDailyMax': g['utciDailyMax'], 'nets': g['nets']},
                'biasC': {'served': g['bias_served'], 'fixed': g['bias_fixed']}}
out = {'version': 'dewfinal-91.17.275', 'built': '2026-10-17', 'script': 'scripts/dew275/fit_gate.py + ship.py',
       'rule': 'served dew point + offset(zone, PKT block), capped at the served temperature; relative humidity, wet bulb, apparent temperature and the daily humidity families follow (one physical state). Only zones with applied = true, only in the months listed, only to horizonH hours ahead.',
       'months': [9, 10], 'horizonH': 72,
       'why': 'the served tehsil dew point read 2-3 C too dry (ARCH v275 monthly score, 26 Sep - 14 Oct 2026). The provider dew points are dry over Pakistan; in the mountains the moist model adds to it (raw -2.82 -> served -3.23 C at 5 synop stations). Fitted on synop + METAR; held out by window (26 Sep-5 Oct / 6-14 Oct) x leave-one-station-out; v270 gate lines + humid days + every network + UTCI (D4).',
       'months_why': 'fitted on 26 Sep - 14 Oct only: served in September and October; November needs the November archive (re-run fit_gate.py, ship.py)',
       'mountainIndependentCheck': {'fleet_MACH_3_stations': M['fleet_all']['served_vs_fixed'], 'synop_raw_vs_fixed': M['synop']['raw_vs_fixed'], 'synop_served_vs_raw': M['synop']['served_vs_raw'], 'fleet_served_vs_raw': M['fleet_all']['served_vs_raw']},
       'zones': zones}
json.dump(out, open(os.path.join(APP, 'data', 'dew-final.json'), 'w'), indent=1)
print({z: (v['applied'], v['offsetsC']) for z, v in zones.items()})
