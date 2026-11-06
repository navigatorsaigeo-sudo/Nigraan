#!/usr/bin/env python3
"""
build_applicability.py  (v91.17.71, agent G) -> data/hazard-applicability.json

WHERE EACH MAPPED HAZARD CAN PHYSICALLY OCCUR. The CEO found the GLOF map colouring the whole of Pakistan (v91.17.70 gave
all 577 tehsils a GLOF level) and asked for the same check on every layer. A tehsil outside a layer's mask is not
coloured: it is left unfilled and carries one line saying why ("No glacial lake upstream", "Not on a river floodplain",
"Terrain too flat for landslides", ...). That is a confident answer, not a gap.

Every threshold is written into the output with its method, source and n; the server and the client read them from
the file. Inputs are files already in nigraan-local (data/ and the unit contract):
  glof            data/glof-register-{merged,open}.json + glof-basins-{merged,open}.json + pk-tehsils.json
  flood_riverine  data/hand-tehsil.json (HAND to the major river network, Copernicus GLO-90)
  landslide       data/giri-landslide-tehsil.json (GIRI rain-triggered susceptibility classes), checked against the
                  NASA Global Landslide Catalogue events of station-lake/reports/landslide_events.csv when present
  snow / frost    data/climatology.json (ERA5 1991-2020 coldest-day tn10 at the unit height), calibrated on the observed
                  station minima of data/obs/Pakistan_Historical_Weather.csv, and the unit terrain range (units.json emaxM)
  melt            unit terrain range and the RGI 7.0 glacier minimum elevations carried by data/glof-register-open.json
  coastal/cyclone pk-tehsils.json (the national outline's sea edge) and the unit anchor points
  drought         dynamic (per window): climatology.mjs droughtClassOf marks a unit not applicable where no rain index
                  is defined for aridity; the rule and its sentence are recorded here
Everything else (heat, cold, wind, rain chance, temperature and rain anomalies, air quality, smog, dust, fog,
pluvial flood, seismic zone, natural sponginess) applies everywhere.

v91.17.72 (agent T) · THE TERRAIN-DRIVEN MASKS READ THE 30 m COPERNICUS GLO-30 STATISTICS (data/terrain30-tehsil.json, built by
station-lake/scripts/terrain30_*.py): landslide = the tehsil's area steeper than 25 deg on the 30 m slope (event-calibrated
share, GIRI kept as a reference column); snow and melt = the tehsil's 30 m p99 elevation (the top 1 % of its area) instead of
the single highest pixel of the old DEM (units.json emaxM); a new `hill_torrent` layer (steep ground within reach, from the
t_slope feature band) is recorded for the flash-flood map but not yet mapped to a client layer id. Every rule falls back to
its v91.17.71 input when the 30 m file is absent. The run prints the before -> after count of every layer.

Usage: python3 scripts/build_applicability.py [--app <nigraan-local>] [--events <landslide_events.csv>]
"""
import sys, os, json, math, csv, datetime as dt, collections

HERE = os.path.dirname(os.path.abspath(__file__)); APP0 = os.path.dirname(HERE)


def main():
    a = sys.argv[1:]; opt = lambda n, d: a[a.index(n) + 1] if n in a else d
    app = os.path.abspath(opt('--app', APP0)); data = os.path.abspath(opt('--data', os.path.join(app, 'data')))
    ev_csv = opt('--events', os.path.join(os.path.dirname(app), 'station-lake', 'reports', 'landslide_events.csv'))
    J = lambda f: json.load(open(os.path.join(data, f), encoding='utf-8'))
    from shapely.geometry import shape, Point, LineString, MultiLineString
    from shapely.ops import unary_union, linemerge
    from shapely.strtree import STRtree
    import numpy as np
    from math import erf, sqrt

    TE = J('pk-tehsils.json')['features']
    units = json.load(open(os.path.join(app, 'server', 'contract', 'units.json'), encoding='utf-8'))
    U = {u['unitId']: u for u in units}
    uids = [f['properties']['uid'] for f in TE]
    disputed = {f['properties']['uid'] for f in TE if 'Indian Illegally Occupied' in str(f['properties'].get('province'))}
    geoms = {f['properties']['uid']: shape(f['geometry']) for f in TE}
    for k, g in list(geoms.items()):
        if not g.is_valid: geoms[k] = g.buffer(0)
    built = dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%MZ')
    MIN_WINTER_DAYS = 80   # one full December-February season in the station record
    L = {}

    def km2(g, lat):   # equirectangular area at the latitude, adequate for shares and km2 floors at this scale
        return g.area * (111.32 ** 2) * math.cos(math.radians(lat))

    # ── GLOF: tehsil -> routed basins that carry at least one mapped glacial lake within the routing distance ──
    MIN_BASIN_SHARE = 0.25
    glof = {'reason': 'No glacial lake upstream', 'rule': 'applies where a mapped glacial lake drains into the tehsil within the register routing distance (HydroBASINS level 12) or lies in it',
            'method': 'a routed basin counts for a tehsil when at least minBasinShare of the basin area lies in the tehsil polygon; lakes lying in the tehsil add their own basin (server side)',
            'params': {'minBasinShare': {'value': MIN_BASIN_SHARE, 'unit': 'share of the routed basin area', 'status': 'expert',
                                         'method': 'a level-12 basin\'s trunk channel runs through its interior, so a tehsil holding a quarter of the basin holds part of its valley floor; smaller overlaps are edge slivers from the 15-arc-second basin outline against the admin polygon [inference]; v91.17.70 used the basin representative point (about half the area)'}},
            'byRegister': {}}
    for regname in ('merged', 'open'):
        rf, bf = os.path.join(data, 'glof-register-%s.json' % regname), os.path.join(data, 'glof-basins-%s.json' % regname)
        if not (os.path.exists(rf) and os.path.exists(bf)): continue
        R = json.load(open(rf, encoding='utf-8')); B = json.load(open(bf, encoding='utf-8'))
        routed = collections.Counter(str(b) for Lk in R['lakes'] for b, _ in (Lk.get('route') or []))
        bg = [(str(f['properties']['id']), shape(f['geometry'])) for f in B['features'] if str(f['properties']['id']) in routed]
        tree = STRtree([g for _, g in bg])
        out = {}
        for uid in uids:
            tg = geoms[uid]; lat = tg.representative_point().y; hits = []
            for i in tree.query(tg):
                bid, g = bg[i]
                if not g.is_valid: g = g.buffer(0)
                inter = tg.intersection(g).area
                if inter > 0 and inter / g.area >= MIN_BASIN_SHARE: hits.append(bid)
            lakes_in = sum(1 for Lk in R['lakes'] if Lk.get('unitUid') == uid)
            if hits or lakes_in: out[uid] = {'basins': sorted(hits), 'lakes': lakes_in}
        glof['byRegister'][regname] = {'register': os.path.basename(rf), 'registerBuilt': R.get('built'), 'lakes': len(R['lakes']), 'routeKm': R.get('routeKm'), 'n': len(out), 'units': out}
        print(regname, 'GLOF applies in', len(out), 'tehsils (static part; the server adds the anchor-point basin)')
    glof['n'] = (glof['byRegister'].get('merged') or glof['byRegister'].get('open') or {}).get('n')
    L['glof'] = glof

    # ── riverine flood: land within 10 m above a major river (HAND) ──
    H = J('hand-tehsil.json'); HAND_MAX_BAND = ['lt2', 'b2_5', 'b5_10']; MIN_KM2 = 1.0
    rv = {}
    for uid in uids:
        h = (H['units'] or {}).get(uid); m = h and h.get('major')
        f = sum((m or {}).get(b, 0) for b in HAND_MAX_BAND) if m else 0.0
        area = f * (h.get('km2') or 0) if h else 0.0
        rv[uid] = {'share': round(f, 4), 'km2': round(area, 2), 'applies': area >= MIN_KM2}
    L['flood_riverine'] = {'reason': 'Not on a river floodplain', 'rule': 'applies where at least minFloodplainKm2 of the tehsil lies within 10 m above a river of the major network (drainage > 970 km2)',
        'params': {'handMaxM': {'value': 10, 'unit': 'm above the major river', 'status': 'measured', 'method': 'hand-tehsil.json bands: under 10 m is where the 2022 riverine flood reached (P(flooded) 0.18-0.28 by band); over 20 m it was 0.008',
                                'source': 'data/flood-extent-calibration.json sets.hi2022.bandRates'},
                   'minFloodplainKm2': {'value': MIN_KM2, 'unit': 'km2', 'status': 'expert', 'method': 'about 30 HAND cells (6 arc-second grid): excludes single-cell edge misregistration while keeping a mountain valley whose river is 1-2 % of the tehsil (Gojal 0.7 %, Gilgit 1.1 %) [inference]'}},
        'source': 'data/hand-tehsil.json (%s)' % H.get('built'), 'units': {k: v for k, v in rv.items() if not v['applies']}, 'n': sum(1 for v in rv.values() if v['applies'])}

    # ── landslide: rain-triggered susceptibility above "very low" ──
    G = J('giri-landslide-tehsil.json')['units']
    share = {}
    for uid in uids:
        g = G.get(uid)
        if g and sum(g['classes']): share[uid] = (sum(g['classes']) - g['classes'][0]) / sum(g['classes'])
    evmin, evn, evused = None, 0, []
    if os.path.exists(ev_csv):
        for r in csv.DictReader(open(ev_csv, encoding='utf-8')):
            if r.get('accuracy') not in ('exact', '1km', '5km') or r['uid'] in disputed or r['uid'] not in share: continue
            evn += 1; evused.append(r['uid'])
            if evmin is None or share[r['uid']] < evmin: evmin = share[r['uid']]
    thr = evmin if evmin is not None else 0.0
    thr = math.floor(thr * 1000) / 1000
    ls = {uid: {'susceptibleShare': round(share.get(uid, 0.0), 4), 'applies': share.get(uid, 0.0) >= thr and share.get(uid, 0.0) > 0} for uid in uids}
    # ── v91.17.72 · landslide on the 30 m slope: the tehsil's area steeper than steepDeg, event-calibrated like the GIRI rule ──
    T30p = os.path.join(data, 'terrain30-tehsil.json')
    T30 = json.load(open(T30p, encoding='utf-8')) if os.path.exists(T30p) else None
    STEEP_DEG = 25
    if T30:
        T30u = T30['units']; sk = 'shareOver%d' % STEEP_DEG
        steep = {uid: (T30u[uid]['slope'][sk] if uid in T30u else None) for uid in uids}
        ev30 = [steep[u] for u in evused if steep.get(u) is not None]
        thr30 = math.floor(min(ev30) * 10000) / 10000 if ev30 else 0.0
        ls30 = {}
        for uid in uids:
            v = steep[uid]
            if v is None: ls30[uid] = {'susceptibleShare': ls[uid]['susceptibleShare'], 'steepShare30m': None, 'applies': ls[uid]['applies'], 'basis': 'GIRI (no 30 m statistics)'}
            else: ls30[uid] = {'steepShare30m': round(v, 4), 'susceptibleShare': ls[uid]['susceptibleShare'], 'applies': v >= thr30 and v > 0}
        print('landslide: GIRI rule applies in %d, 30 m slope rule in %d (threshold %.4f of the area steeper than %d deg, n=%d events)' % (
            sum(1 for v in ls.values() if v['applies']), sum(1 for v in ls30.values() if v['applies']), thr30, STEEP_DEG, len(ev30)))
    if T30:
        L['landslide'] = {'reason': 'Terrain too flat for landslides', 'rule': 'applies where at least minSteepShare of the tehsil area is steeper than steepDeg on the 30 m Copernicus GLO-30 slope',
            'params': {'steepDeg': {'value': STEEP_DEG, 'unit': 'deg (30 m Horn slope)', 'status': 'expert', 'method': 'rain-triggered shallow landslides start mostly on slopes of 25-45 deg (e.g. Dahal et al. 2008, Nepal Himalaya; the NASA catalogue events in Pakistan sit on an effective slope p50 of about 35 deg in landslide_events.csv effSlope) [read + inference]'},
                       'minSteepShare': {'value': thr30, 'unit': 'share of the tehsil area steeper than steepDeg', 'status': 'measured',
                                         'method': 'the lowest steep share among tehsils holding a catalogue landslide located to 5 km or better (so every such tehsil stays inside the mask), floored to 0.0001',
                                         'source': 'NASA Global Landslide Catalogue, rainfall-triggered, Pakistan-administered (station-lake/reports/landslide_events.csv); data/terrain30-tehsil.json', 'n': len(ev30)},
                       'giriReference': {'value': thr, 'unit': 'share of cells in GIRI class >= 2', 'status': 'measured', 'method': 'the v91.17.71 rule (GIRI rain-triggered susceptibility, 370 m) with the same event calibration; kept per unit as susceptibleShare for comparison, not applied'}},
            'source': 'data/terrain30-tehsil.json (%s, Copernicus GLO-30); data/giri-landslide-tehsil.json (GIRI, CC BY 4.0) for reference' % T30.get('built'),
            'units': {k: v for k, v in ls30.items() if not v['applies']}, 'n': sum(1 for v in ls30.values() if v['applies'])}
    else:
      L['landslide'] = {'reason': 'Terrain too flat for landslides', 'rule': 'applies where at least minSusceptibleShare of the tehsil is in GIRI rain-triggered susceptibility class low or above (class 1 "very low" is flat ground)',
        'params': {'minSusceptibleShare': {'value': thr, 'unit': 'share of cells in class >= 2', 'status': 'measured' if evmin is not None else 'expert',
                   'method': 'the lowest susceptible share among tehsils holding a catalogue landslide located to 5 km or better (so every such tehsil stays inside the mask), floored to 0.001',
                   'source': 'NASA Global Landslide Catalogue, rainfall-triggered, Pakistan-administered (station-lake/reports/landslide_events.csv)', 'n': evn}},
        'source': 'data/giri-landslide-tehsil.json (GIRI, CC BY 4.0)', 'units': {k: v for k, v in ls.items() if not v['applies']}, 'n': sum(1 for v in ls.values() if v['applies'])}

    # ── v91.17.72 · hill torrents / flash floods: steep ground within reach of the tehsil (feature band t_slope, 30 m slope per 9" cell) ──
    TORR_DEG, TORR_KM, TORR_KM2 = 15, 20, 25
    ht = None
    try:
        sys.path.insert(0, HERE); import featgrid as FGm
        if os.path.exists(os.path.join(data, 'feat', 't_slope.json')):
            import rasterio.features as RF
            from rasterio.transform import from_origin
            SL = FGm.read_band(data, 't_slope'); GR = FGm.GRID; tr = from_origin(GR['west'], GR['north'], GR['cell'], GR['cell'])
            lat_c = GR['north'] - (np.arange(GR['rows']) + 0.5) * GR['cell']
            cellkm2 = (GR['cell'] * 111.32) ** 2 * np.cos(np.radians(lat_c))
            steepA = np.where(SL >= TORR_DEG, 1.0, 0.0) * cellkm2[:, None]
            ht = {}
            for uid in uids:
                g = geoms[uid]; lat = g.representative_point().y; kd = TORR_KM / (111.32 * math.cos(math.radians(lat)))
                gb = g.buffer(kd)
                x0, y0, x1, y1 = gb.bounds
                c0 = max(0, int((x0 - GR['west']) / GR['cell'])); c1 = min(GR['cols'], int((x1 - GR['west']) / GR['cell']) + 1)
                r0 = max(0, int((GR['north'] - y1) / GR['cell'])); r1 = min(GR['rows'], int((GR['north'] - y0) / GR['cell']) + 1)
                if r1 <= r0 or c1 <= c0: ht[uid] = {'steepKm2Within': 0.0, 'steepKm2Own': 0.0, 'applies': False}; continue
                from rasterio.windows import Window
                wt = RF.rasterize([(gb, 1)], out_shape=(r1 - r0, c1 - c0), transform=from_origin(GR['west'] + c0 * GR['cell'], GR['north'] - r0 * GR['cell'], GR['cell'], GR['cell']), fill=0, dtype='uint8').astype(bool)
                wo = RF.rasterize([(g, 1)], out_shape=(r1 - r0, c1 - c0), transform=from_origin(GR['west'] + c0 * GR['cell'], GR['north'] - r0 * GR['cell'], GR['cell'], GR['cell']), fill=0, dtype='uint8').astype(bool)
                sub = steepA[r0:r1, c0:c1]
                kin = float(np.nansum(sub[wt])); kown = float(np.nansum(sub[wo]))
                ht[uid] = {'steepKm2Within': round(kin, 1), 'steepKm2Own': round(kown, 1), 'applies': kin >= TORR_KM2}
            del SL, steepA
    except Exception as e:
        print('hill_torrent layer skipped:', e); ht = None
    if ht:
        L['hill_torrent'] = {'reason': 'No steep catchment within reach', 'rule': 'applies where at least minSteepKm2 of ground with a 30 m slope of steepDeg or more lies in the tehsil or within reachKm of it: the steep catchments whose torrents (rod-kohi) reach the piedmont plains below them',
            'params': {'steepDeg': {'value': TORR_DEG, 'unit': 'deg (cell mean of the 30 m slope, feature band t_slope)', 'status': 'expert', 'method': 'hill slopes that shed flash runoff; the Suleman and Kirthar piedmont fans themselves are 1-3 deg [inference]'},
                       'reachKm': {'value': TORR_KM, 'unit': 'km', 'status': 'expert', 'method': 'the reach of the Koh-e-Suleman hill torrents from the range front across the Dera Ghazi Khan and Rajanpur piedmont (Vehova, Sanghar, Kaha: 15-30 km of fan) [read: FFC/PID descriptions of the rod-kohi system; inference for the value]'},
                       'minSteepKm2': {'value': TORR_KM2, 'unit': 'km2', 'status': 'expert', 'method': 'about 400 feature cells: excludes isolated mounds and embankments while keeping a small hill catchment [inference]'}},
            'source': 'data/feat/t_slope.json (Copernicus GLO-30, v91.17.72)', 'mapped': False,
            'note': 'not in layerMap yet: the client has no flash-flood map layer id; the integrator maps one (e.g. a future ev:flashFlood) to "hill_torrent"',
            'units': {k: v for k, v in ht.items() if not v['applies']}, 'n': sum(1 for v in ht.values() if v['applies'])}

    # ── snow and frost: ERA5 cold tail, calibrated on observed station minima ──
    # ERA5 tn10 runs warm of what stations record on radiative nights (Thar: Mithi observed 1.0 C against an ERA5 tn10 of 8.3 C),
    # so the mask is not the raw reanalysis: the margin is the largest gap between the ERA5 coldest-day tn10 (at the station
    # height, provider lapse) and the station's observed minimum, over every station with a full winter in the record.
    C = J('climatology.json'); per = C.get('period', '1991-2020'); LAPSE = -6.5 / 1000
    import pandas as pd
    obs_f = os.path.join(data, 'obs', 'Pakistan_Historical_Weather.csv'); cal = []
    if os.path.exists(obs_f):
        d = pd.read_csv(obs_f)
        d['m'] = pd.to_datetime(d['date_utc']).dt.month
        gs = d.groupby('station_id').agg(lat=('latitude', 'first'), lon=('longitude', 'first'), z=('elevation_m', 'first'), tmin=('temperature_min_c', 'min'),
                                         winter=('m', lambda x: int(x.isin([12, 1, 2]).sum())), snow=('snow_depth_mm', lambda x: int((x > 0).sum())))
        tt = STRtree([geoms[u] for u in uids])
        for sid, r in gs.iterrows():
            if r.winter < MIN_WINTER_DAYS: continue
            pt = Point(r.lon, r.lat); hit = [uids[i] for i in tt.query(pt) if geoms[uids[i]].contains(pt)]
            if not hit or hit[0] not in C['units']: continue
            cu = C['units'][hit[0]]; z0 = cu.get('zM') if cu.get('zM') is not None else U.get(hit[0], {}).get('elevM') or 0
            t10 = float(min(cu['tn10']) + LAPSE * (float(r.z) - z0))
            cal.append({'uid': hit[0], 'tn10': round(t10, 2), 'obsMin': float(r.tmin), 'gap': float(round(t10 - float(r.tmin), 2)), 'snowDays': int(r.snow), 'winterDays': int(r.winter)})
    gaps = [c['gap'] for c in cal]
    FROST_MARGIN = float(round(max(gaps), 1)) if gaps else None
    GAP_P90 = round(float(np.percentile(gaps, 90)), 1) if gaps else None
    snow_st = [c['tn10'] for c in cal if c['snowDays'] > 0]
    SNOW_T = float(round(max(snow_st) + GAP_P90, 1)) if snow_st and GAP_P90 is not None else None
    fr, sn = {}, {}
    for uid in uids:
        cu = C['units'].get(uid); u = U.get(uid, {})
        if not cu or not cu.get('tn10'): continue
        z0 = cu.get('zM') if cu.get('zM') is not None else (u.get('elevM') or 0); emax = u.get('emaxM')
        if T30 and uid in T30['units']: emax = T30['units'][uid]['elev']['p99']   # v91.17.72: the top 1 % of the tehsil area on GLO-30
        t10 = min(cu['tn10']); top = t10 + LAPSE * max(0, (emax or z0) - z0)
        fr[uid] = {'tn10MinC': round(t10, 1), 'applies': FROST_MARGIN is None or t10 - FROST_MARGIN <= 0}
        sn[uid] = {'tn10MinAtTopC': round(top, 1), 'topM': emax, 'applies': SNOW_T is None or top <= SNOW_T}
    calib = {'stations': len(cal), 'source': 'surface station daily summaries 2024-2025 (data/obs/Pakistan_Historical_Weather.csv), stations with at least %d winter days' % MIN_WINTER_DAYS,
             'gapP50': round(float(np.percentile(gaps, 50)), 1) if gaps else None, 'gapP90': GAP_P90, 'gapMax': FROST_MARGIN, 'snowStations': len(snow_st)}
    L['frost'] = {'reason': 'Too warm for frost', 'rule': 'applies where the ERA5 coldest-day tn10 at the unit height, less frostMarginC, is at or below 0 C',
                  'params': {'frostMarginC': {'value': FROST_MARGIN, 'unit': 'C', 'status': 'measured', 'method': 'the largest gap between the ERA5 coldest-day tn10 (lapsed to the station height at -6.5 C/km) and the observed minimum, over the calibration stations, so every station\'s observed minimum lies above tn10 - margin', 'calibration': calib}},
                  'source': 'data/climatology.json (%s, %s)' % (C.get('source'), per), 'units': {k: v for k, v in fr.items() if not v['applies']}, 'n': sum(1 for v in fr.values() if v['applies'])}
    L['snow'] = {'reason': 'Too warm for snow', 'rule': 'applies where the ERA5 coldest-day tn10 lapsed to the highest ground of the tehsil (%s) is at or below snowTn10C' % ('its 30 m p99 elevation: the top 1 %% of the area on Copernicus GLO-30' if T30 else 'units.json emaxM'),
                 'params': {'snowTn10C': {'value': SNOW_T, 'unit': 'C', 'status': 'measured', 'method': 'the warmest station-height ERA5 coldest-day tn10 among stations that recorded lying snow, plus the p90 ERA5-minus-observed gap for the short record', 'calibration': calib},
                            'lapseCPerKm': {'value': -6.5, 'unit': 'C per km', 'status': 'measured', 'method': 'the lapse rate the provider applies, found right by station-lake/scripts/lapse.py (national.mjs v91.17.37 note)'}},
                 'source': 'data/climatology.json + ' + ('data/terrain30-tehsil.json elev.p99 (Copernicus GLO-30; units.json emaxM where absent)' if T30 else 'server/contract/units.json emaxM'), 'units': {k: v for k, v in sn.items() if not v['applies']}, 'n': sum(1 for v in sn.values() if v['applies'])}

    # ── melt: terrain reaching the glacier floor ──
    O = J('glof-register-open.json')['lakes']
    zmin = sorted(Lk['nearGlacier']['minElevM'] for Lk in O if Lk.get('nearGlacier') and Lk['nearGlacier'].get('minElevM'))
    floor_m = float(np.percentile(zmin, 1)) if zmin else 3500.0
    def top30(uid):   # v91.17.72: the tehsil's 30 m p99 elevation (top 1 % of its area), else the old DEM maximum
        return T30['units'][uid]['elev']['p99'] if T30 and uid in T30['units'] else U.get(uid, {}).get('emaxM')
    ml = {uid: {'topM': top30(uid), 'emaxM': U.get(uid, {}).get('emaxM'), 'applies': (top30(uid) or 0) >= floor_m} for uid in uids}
    L['melt'] = {'reason': 'No glacier or snowfield terrain', 'rule': 'applies where the tehsil terrain reaches the glacier floor' + (' (its 30 m p99 elevation, the top 1 % of the area on Copernicus GLO-30)' if T30 else ''),
                 'params': {'glacierFloorM': {'value': round(floor_m), 'unit': 'm', 'status': 'measured', 'method': 'p1 of the RGI 7.0 minimum elevations of the glaciers nearest the mapped lakes (v91.17.36 used 3,500 m)', 'source': 'data/glof-register-open.json nearGlacier.minElevM (RGI 7.0, CC BY 4.0)', 'n': len(zmin)}},
                 'units': {k: v for k, v in ml.items() if not v['applies']}, 'n': sum(1 for v in ml.values() if v['applies'])}

    # ── coast: the national outline's sea edge ──
    SEA = {'maxLat': 25.6, 'minLon': 61.6, 'maxLon': 68.3}
    outline = unary_union([g for k, g in geoms.items() if k not in disputed])
    ext = outline.exterior if outline.geom_type == 'Polygon' else max(outline.geoms, key=lambda p: p.area).exterior
    cs = list(ext.coords); segs = []
    for (x1, y1), (x2, y2) in zip(cs[:-1], cs[1:]):
        if max(y1, y2) <= SEA['maxLat'] and SEA['minLon'] <= min(x1, x2) and max(x1, x2) <= SEA['maxLon']: segs.append(((x1, y1), (x2, y2)))
    coast = linemerge(MultiLineString(segs)) if segs else None
    def coast_km(lat, lon):
        if coast is None: return None
        c = math.cos(math.radians(lat)); p = Point(lon * c, lat)
        from shapely.affinity import scale
        return scale(coast, xfact=c, yfact=1.0, origin=(0, 0)).distance(p) * 111.32
    COAST_KM, CYC_KM = 60, 200
    ck = {uid: (None if U.get(uid) is None else round(coast_km(U[uid]['lat'], U[uid]['lon']), 1)) for uid in uids}
    cl_json = [[round(x, 4), round(y, 4)] for g in (coast.geoms if coast is not None and coast.geom_type == 'MultiLineString' else [coast] if coast is not None else []) for x, y in g.coords]
    L['coastal'] = {'reason': 'Not on the coast', 'rule': 'applies where the tehsil anchor point is within coastKm of the sea edge of the national outline',
                    'params': {'coastKm': {'value': COAST_KM, 'unit': 'km', 'status': 'expert', 'method': 'the reach of the sea breeze that carries coastal humidity inland; the same distance the outlook engine screens coastal humid heat at (outlook.mjs COAST_KM)'},
                               'seaEdge': {'value': SEA, 'unit': 'degrees', 'status': 'measured', 'method': 'edges of the national outline (pk-tehsils.json union) south of maxLat and between minLon and maxLon: the Arabian Sea coast from Jiwani to Sir Creek; the land borders leave this window'}},
                    'units': {k: {'coastKm': v} for k, v in ck.items() if v is None or v > COAST_KM}, 'n': sum(1 for v in ck.values() if v is not None and v <= COAST_KM)}
    L['cyclone'] = {'reason': 'No tropical-cyclone pathway', 'rule': 'applies where the tehsil anchor point is within cycloneKm of the sea edge',
                    'params': {'cycloneKm': {'value': CYC_KM, 'unit': 'km', 'status': 'expert',
                               'method': 'inland decay of a landfalling tropical cyclone (Kaplan and DeMaria 1995, alpha 0.095 per hour): a Category-1 landfall, the usual Arabian Sea intensity, falls below tropical-storm wind in about 15 h, about 200 km at a slow Arabian Sea forward speed; remnant rain beyond is carried by the rain and flood layers [read + inference]'},
                               'seaEdge': L['coastal']['params']['seaEdge']},
                    'units': {k: {'coastKm': v} for k, v in ck.items() if v is None or v > CYC_KM}, 'n': sum(1 for v in ck.values() if v is not None and v <= CYC_KM)}

    # ── drought: dynamic ──
    L['drought'] = {'reason': 'Arid climate: drought index not defined', 'rule': 'dynamic, per window: a unit whose SPI/SPEI are refused for aridity (the window\'s 1991-2020 mean rain under the climatology engine\'s arid floor) and that has no other rain index carries no drought class',
                    'method': 'server/api/climatology.mjs droughtClassOf (v91.17.71) returns applicable:false; the served count is in /api/climatology/drought', 'dynamic': True}

    everywhere = ['heat', 'cold', 'wind', 'rain_hz', 'aqi', 'flood', 'flood_pluvial', 'seismic', 'nss_baseline', 'nss_dynamic', 'nss_retention', 'nss_runoff',
                  'ev:heatSpell', 'ev:unusualWarmth', 'ev:rain3_75', 'ev:rain3Local', 'ev:coldSpell', 'day:tx40', 'day:tx45', 'day:pr10', 'day:pr25', 'day:pr50', 'day:pr100', 'day:gu60',
                  'air:pm25', 'air:smog', 'air:dust', 'air:fog', 'air:disp', 'week:t', 'week:pT1', 'week:p', 'month:t', 'month:p']
    layer_map = {'glof': 'glof', 'flood_riverine': 'flood_riverine', 'landslide': 'landslide', 'cyclone': 'cyclone', 'drought': 'drought',
                 'ev:meltWarmth': 'melt', 'ev:coastalHeat': 'coastal', 'ev:rainOnSnow': 'snow', 'ev:heavySnow': 'snow', 'day:sn10': 'snow', 'ev:frostSpell': 'frost', 'day:tn0': 'frost'}
    out = {'version': 'ha-91.17.71', 'built': built, 'method': 'scripts/build_applicability.py (every threshold carries its method and source below)',
           'source': 'nigraan-local data files named per layer', 'n': len(uids), 'disputedExcluded': sorted(disputed),
           'note': 'a tehsil outside a layer mask is left unfilled on every map and carries the layer reason; everywhere-layers have no mask',
           'layerMap': layer_map, 'everywhere': everywhere, 'layers': L,
           'counts': {k: (v.get('n') if not v.get('dynamic') else None) for k, v in L.items()}}
    try: before = json.load(open(os.path.join(data, 'hazard-applicability.json'), encoding='utf-8')).get('counts') or {}
    except Exception: before = {}
    out['version'] = 'ha-91.17.72'
    json.dump(out, open(os.path.join(data, 'hazard-applicability.json'), 'w', encoding='utf-8'), separators=(',', ':'))
    print('before -> after (tehsils inside each mask):')
    for k in sorted(set(before) | set(out['counts'])): print('  %-15s %s -> %s' % (k, before.get(k), out['counts'].get(k)))
    print('written', os.path.join(data, 'hazard-applicability.json'))
    for k, v in L.items(): print('  %-15s applies in %s of %d  (%s)' % (k, v.get('n', 'dynamic'), len(uids), v['reason']))


if __name__ == '__main__':
    main()
