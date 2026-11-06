#!/usr/bin/env python3
"""v91.17.178 · ENSEMBLE FORECAST ARCHIVE (ingestion only; nothing here is served)
v91.17.193 · checked every 15 min (the 00 UTC ECMWF run is served alone for only ~1-2 h a day); a run still being written stops the
            fetch at once; a failed fetch is charged only for the requests it made
v91.17.261 · ECMWF 00 / 12 UTC runs were not saved 11-13 Oct 2026. Measured 14 Oct: the provider serves ONE time series stitched
            from several runs, and its servers are out of step. A server that never received the tail (+150..+360 h) of the long
            runs after 10 Oct 00 UTC kept serving 10 Oct's tail (data end 25 Oct 00 UTC; ensemble-mean values from 19 Oct 12 UTC on
            equal the saved 10 Oct 00 UTC run), so "no run time explains the served data end"; a server that was up to date named a
            06 / 18 UTC run in its metadata, so the run was skipped even when the data served did not contain it. Now:
              - the data end is read up to 3 times (one read per server answer) and the newest is used; a stale end is reported
                as such ("still serving the tail of <run>"), not as an unexplained failure
              - the run inside the data is checked FROM THE DATA: ECMWF ENS output is 3-hourly to +144 h and 6-hourly after, and the
                provider splits a 6-hour total evenly, so the two 3-hour halves of every 6-hour block past +144 h are exactly equal.
                Run T is accepted only if its 3-hourly output ends exactly at T+144 h (a newer run would carry 3-hourly output past
                it; an older one would end it earlier); checked on the anchor before the fetch, on every chunk, and on the whole grid
              - the first chunk's anchor values must equal the identification read's (both come from the same server state)
              - metadata naming a newer run decides only when the data cannot (no rain or snow anywhere in +139..+150 h)
              - every request is counted the provider's way (members x variables / 10 per location, x days / 14 past two weeks;
                Open-Meteo ForecastapiController / calculateQueryWeight), the same formula as the server ledger (provider.mjs)
              - status 'missed' when a model's newest saved run is older than its cadence + the provider's measured delay
v91.17.267 · the ensemble mean (ecmwf_ifs025_ensemble_mean) was not saved 14-15 Oct 2026 while the members were (14 Oct 12 UTC):
              - its own probe of the +144 h step is 'indeterminate' in dry weather (14 Oct 12 UTC: 4 and 1 wet pairs; 5 decide), and
                its fetch was stopped at chunk 5 by the step check on its snowfall ("1 of 1 3-hourly past +144 h"), ~156 weighted
                calls each time, eight times between 01:50 and 04:44 UTC on 15 Oct. Measured on the saved mean runs (9, 10 Oct 00 UTC, 13 Oct 12 UTC): the
                provider's ensemble-mean SNOWFALL is not split evenly over the 6-hourly part (+150 h: 29 of 181, 15 of 85, 5 of 100 wet
                pairs with unequal halves; +228 h: 10 of 77), while member precipitation is (0 unequal pairs past +144 h in all four
                saved member runs, thousands of pairs). The step is now read only from precipitation (STEPVAR); the mean fetches no
                precipitation, so its chunks and grid carry no step check and its identity comes from the probe or the members
              - the mean is the same ECMWF IFS ensemble run as the members: when its own check is undecided it takes the run
                identity of the members' run of the same cycle (SIBLING), only when the members proved that run from their own data
                (anchor or probe verdict 'pass' this check or earlier, or the saved members run's run checks) AND the mean's served
                data end is where that run ends under the identification rule (ends_at). Without that, the mean waits: identity
                unknown, nothing fetched (no fetch on the metadata alone). An undecided probe is re-used for an hour, not re-bought
                every 15 min
              - a stale data end now names the run whose documented length ends there (run_ending; the mean's end lies 2 h past
                the run's, so "the 10 Oct 02 UTC run (not saved)" was reported for the saved 10 Oct 00 UTC run)
v91.17.272 · NIGRAAN's own copy (nigraan-local\\scripts\\ens_archive.py; the server runs it, station-lake's copy only if this one is
            missing). The ensemble-mean archive was stale from 15 Oct 2026: on dry days the +144 h step check sees 1-4 wet pairs, its
            5-pair rule left the run "indeterminate", and the mean then waited for a proof that never came, so the whole run was
            refused. Wetness says nothing about whether a run is complete or which run it is; it only decides whether the step can be
            READ. Now:
              - a run is saved when it is COMPLETE and nothing contradicts its identity:
                  complete   every member x grid point x 3-hour step (+3 h to the run's lead end) x variable holds a value (a value
                             the provider left empty used to be stored as 'missing' and the run kept; now the run is refused)
                  identity   the served data end is where run T ends (ends_at), every chunk's anchor equals the identification
                             read's, the data end is unchanged after the fetch, and no step check finds output of another run
              - the step check is evidence only: 'fail' (3-hourly output past +144 h, or 6-hourly output before it on enough wet
                pairs) refuses; 'pass' proves the run; too few wet pairs ('indeterminate') is "no evidence either way" and no
                longer refuses or blocks a complete run by itself
              - the one case still held back: the step cannot be read AND the provider's metadata names a newer run for the very
                series being served (same data end within one 3-hour step: a 06 / 18 UTC short run written over the first 150 h
                of the long run, the end unchanged). That is evidence of an overlay the dry data cannot rule out, so the run waits
                for the next check (no fetch). A newer run named with another data end is another provider server's state and
                does not describe the data read (v261: the servers are out of step)
              - MIN_WET (5) is kept only where a count is evidence: "all wet pairs equal" proves 6-hourly output only with enough
                pairs (5 pairs equal by chance in 3-hourly output: 0.23^5 = 0.0006); it is never a completeness rule
              - NIGRAAN writes its own archive: D:\\NIGRAAN\\nig\\archive\\ens (station-lake is a link into the read-only DATA LAKE;
                v269 OPEN A4). The runs saved before (station-lake\\archive\\ens) are read, never written: their index counts as
                saved, their sidecars as the members' proof; the grid file is copied from there once
              - same call budget (NIGRAAN_ENS_BUDGET, 20,000 weighted calls a day); the mean's run, no longer refused on dry days,
                costs what it was designed to cost (~1,814 weighted calls a day)

Why: a rain correction for day 1-10 can only be trained on forecasts as they were issued, member by member, paired later with
observed rain. The provider keeps only a short archive of members, so NIGRAAN saves its own from now on.

What is saved, once per model run (00 UTC run by default), for every 0.25 degree grid point over Pakistan plus one ring
(archive/ens/grid_pk025.json, 1,743 points):
  ecmwf_ifs025                 ECMWF IFS ENS 0.25 deg, precipitation of all 51 members (control + 50)
  ncep_gefs025                 NOAA GEFS 0.25 deg, precipitation of all 31 members (control + 30)
  ecmwf_ifs025_ensemble_mean   ECMWF ENS mean (and CAPE spread) of the weather-type predictors: CAPE, CAPE spread, total column
                               water vapour, 850 hPa wind speed / direction / relative humidity / temperature, snowfall,
                               2 m temperature, 500 hPa height
  leads                        from the run time to +240 h (10 days), or the run's own end if shorter
  precipitation                3-hour totals ending at each valid time (sum of the provider's three hourly values; ECMWF ENS
                               output is 6-hourly after +144 h, so there only 6-hour sums are native)
  instantaneous predictors     the value at each 3-hourly valid time
Each run is one compressed file archive/ens/<model>/<YYYY>/<MM>/<model>_<YYYYMMDDHH>.npz plus a .json sidecar holding: model
and dataset, run (issue) time, provider availability / modification time and data end, member ids, valid times, accumulation
interval, grid (lat, lon, rule), variables and units, fetch start / end, number of requests, provider-weighted calls, SHA-256.
archive/ens/index.jsonl gets one line per saved run.

Safety (ingestion is kept apart from live forecasting):
  - runs as its own process (the server only starts it, hourly), one at a time (lock file, stale after 3 h)
  - a run is written only if it is complete and from ONE model run: the provider's servers are not always in step, so the run is
    identified by matching where the served data end to the metadata, every request carries a fixed anchor point whose values
    must equal the first request's exactly, and the data end is checked again after the last request (otherwise discarded and
    tried again at the next check); nothing partial is ever kept
  - storage cap (default 10 GB): at the cap it stops saving and says so; it never deletes anything
  - call budget (default 20,000 provider-weighted calls a day, counted the provider's way: members x variables / 10 per point)
  - requests go through the local server's /px route (the paid key stays in the server); the provider's public model metadata
    (no key) is read only to spot a newer run
  - the run is identified from the data themselves: the latest run time (00 / 06 / 12 / 18 UTC) whose documented length ends where
    the served data end. For ECMWF, a newer short run (06 / 18 UTC) overlays the first days of the long run while the end stays the
    same, so the 00 UTC run is saved only while no newer run is out (about six hours a day; the check runs hourly)
usage: python ens_archive.py [--app ../nigraan-local] [--limit N] [--out DIR] [--old DIR] [--dry] [--runs 0,12]
"""
import os, sys, json, time, shutil, hashlib, datetime as dt, urllib.request, urllib.parse
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
a = sys.argv[1:]; opt = lambda n, d: a[a.index(n) + 1] if n in a else d
# v91.17.272 · this file lives in nigraan-local\scripts: the app is its parent, NIGRAAN's own archive is nig\archive\ens, and the runs
# saved before by station-lake's copy (nig\station-lake\archive\ens, inside the read-only DATA LAKE) are read only
APP = os.path.abspath(opt('--app', os.path.dirname(HERE)))
NIG = os.path.dirname(APP)
OUT = os.path.abspath(opt('--out', os.environ.get('NIGRAAN_ENS_OUT') or os.path.join(NIG, 'archive', 'ens')))
OLD = os.path.abspath(opt('--old', os.path.join(NIG, 'station-lake', 'archive', 'ens')))
GRID = os.path.join(OUT, 'grid_pk025.json')
STATUS = os.path.join(APP, 'data', 'ens-archive.json')
PORT = os.environ.get('NIGRAAN_PORT', '8787')
RUNS = [int(x) for x in opt('--runs', os.environ.get('NIGRAAN_ENS_RUNS', '0')).split(',')]
# v91.17.260 · ECMWF: the 00 UTC long run is served cleanly only between the end of its writing and the start of the 06 UTC short run
# (both late at this provider: on 13 Oct the 12 Oct 18 UTC run became available at 05:06 UTC). 8-10 Oct it was caught (saved 11:39-12:20
# UTC); 11-13 Oct it was not (every check found the run still being written, or already overlaid). The 12 UTC long run (+360 h, the
# same length) is now a second chance: an ECMWF long run is saved when it is a 00 or 12 UTC run AND no run of that model was saved in
# the 20 h before it, so at most one ECMWF run a day is kept (the call budget is unchanged) and a missed 00 UTC run is replaced by the
# 12 UTC run of the same day. GEFS keeps RUNS (00 UTC; caught every day 8-13 Oct). NIGRAAN_ENS_ECMWF_RUNS=0 restores 00 UTC only.
ECMWF_RUNS = [int(x) for x in os.environ.get('NIGRAAN_ENS_ECMWF_RUNS', '0,12').split(',')]
ECMWF_GAP_H = 20
CAP_GB = float(os.environ.get('NIGRAAN_ENS_CAP_GB', '10'))
BUDGET = float(os.environ.get('NIGRAAN_ENS_BUDGET', '20000'))
LEAD_H = 240; CHUNK = 25; STEP = 3
META = 'https://customer-ensemble-api.open-meteo.com/data/{}/static/meta.json'
MEAN_VARS = ['cape', 'cape_spread', 'total_column_integrated_water_vapour', 'wind_speed_850hPa', 'wind_direction_850hPa',
             'relative_humidity_850hPa', 'temperature_850hPa', 'snowfall', 'temperature_2m', 'geopotential_height_500hPa']
UNITS = {'precipitation': 'mm per 3 h ending at the valid time', 'cape': 'J/kg', 'cape_spread': 'J/kg', 'total_column_integrated_water_vapour': 'kg/m2',
         'wind_speed_850hPa': 'km/h', 'wind_direction_850hPa': 'deg', 'relative_humidity_850hPa': '%', 'temperature_850hPa': 'C',
         'snowfall': 'cm per 3 h ending at the valid time', 'temperature_2m': 'C', 'geopotential_height_500hPa': 'm'}
MODELS = [
    dict(id='ecmwf_ifs025', meta='ecmwf_ifs025_ensemble', kind='members', vars=['precipitation'], members=51,
         label='ECMWF IFS ENS 0.25 deg', nativeNote='3-hourly to +144 h, 6-hourly after (only 6-hour sums are native beyond +144 h)'),
    dict(id='ncep_gefs025', meta='ncep_gefs025', kind='members', vars=['precipitation'], members=31,
         label='NOAA GEFS 0.25 deg', nativeNote='3-hourly to +240 h'),
    dict(id='ecmwf_ifs025_ensemble_mean', meta='ecmwf_ifs025_ensemble_mean', kind='mean', vars=MEAN_VARS, members=1,
         label='ECMWF IFS ENS 0.25 deg, ensemble mean', nativeNote='3-hourly to +144 h, 6-hourly after'),
]
ACCUM = {'precipitation', 'snowfall'}
# run lengths (hours) by run hour, from the producers' model descriptions: ECMWF ENS long runs at 00 / 12 UTC (+360 h), short runs at
# 06 / 18 UTC (+144 h); GEFS 0.25 deg +240 h from every run
RUNLEN = {'ecmwf_ifs025': {0: 360, 12: 360, 6: 144, 18: 144}, 'ecmwf_ifs025_ensemble_mean': {0: 360, 12: 360, 6: 144, 18: 144},
          'ncep_gefs025': {0: 240, 6: 240, 12: 240, 18: 240}}
# v91.17.261 · last 3-hourly lead of the producer's output (ECMWF ENS: 3-hourly to +144 h, 6-hourly to +360 h; the provider's own
# download schedule, EcmwfDomain.getDownloadForecastSteps). GEFS is 3-hourly to +240 h: no step change, no check.
NATIVE3_H = {'ecmwf_ifs025': 144, 'ecmwf_ifs025_ensemble_mean': 144}
# a 3-hourly block shows two unequal 3-hour halves in 77-86 % of wet member-points (measured on the saved 9, 10 Oct 00 UTC and 13 Oct
# 12 UTC runs, block ending +144 h); 5 wet pairs all equal by chance is then < 0.23^5 = 0.0006, so 5 wet pairs decide a block
# v91.17.272 · evidence only: fewer wet pairs leave the step unread ('indeterminate'), never refuse a complete run (completeness())
MIN_WET = 5
# v91.17.267 · the variable the step is read from: precipitation, which the provider splits evenly over a 6-hour block (measured: 0
# unequal halves past +144 h in the saved member runs). Ensemble-mean snowfall is not (5-29 % unequal past +144 h in the saved mean
# runs), so it is never used for the check.
STEPVAR = 'precipitation'
# v91.17.267 · a model computed from another model's run: the ensemble mean is the same ECMWF IFS ensemble run as the 51 members
SIBLING = {'ecmwf_ifs025_ensemble_mean': 'ecmwf_ifs025'}
ANCHOR_READS = 3
MEMBERS = {m['id']: m['members'] for m in MODELS}
SPENT = [0.0]                                                   # provider-weighted calls of every request this process made
now = lambda: dt.datetime.now(dt.timezone.utc)
iso = lambda t: t.strftime('%Y-%m-%dT%H:%MZ')
pt = lambda s: dt.datetime.strptime(s, '%Y-%m-%dT%H:%MZ').replace(tzinfo=dt.timezone.utc)


def ends_at(mid, t, e):
    """the identification rule: run t of model mid explains a served data end e when its documented length ends within one 3-hour step of e"""
    L = RUNLEN[mid].get(t.hour)
    return L is not None and abs((t + dt.timedelta(hours=L) - e).total_seconds()) <= STEP * 3600


def run_ending(mid, e):
    """v91.17.267 · every run time (00 / 06 / 12 / 18 UTC) whose documented length ends at the data end e under ends_at, newest first"""
    t = e.replace(minute=0, second=0, microsecond=0) + dt.timedelta(hours=STEP); t -= dt.timedelta(hours=t.hour % 6)
    back = max(RUNLEN[mid].values()) // 6 + 2
    return [c for c in (t - dt.timedelta(hours=6 * k) for k in range(back)) if ends_at(mid, c, e)]


def sibling_identity(model, init, aend, P, IDN, out=None):
    """v91.17.267 · the run identity a model takes from its SIBLING (the members of the same ECMWF IFS ensemble run): a sentence saying
       how the sibling proved run init from its own data, or None. Only when the model's served data end aend is where run init ends
       (ends_at) and the sibling's verdict for init is 'pass': on its anchor in this check (IDN), on its probe (P, this check or
       earlier), or in the run checks of its saved run (the sidecar). Nothing here costs a provider call."""
    sib = SIBLING.get(model['id'])
    if not sib or init is None or aend is None or not ends_at(model['id'], init, aend): return None
    I = IDN.get(sib)
    if I and I.get('init') == init and I.get('verdict') == 'pass': return f'{sib} identified {iso(init)} from its own data in this check ({I.get("detail")})'
    pv = P.get(sib + '|' + iso(init))
    if pv and pv.get('verdict') == 'pass': return f'{sib} identified {iso(init)} from its own data, probe at {pv.get("at")} ({pv.get("detail")})'
    ok = []
    for root in ([out] if out else [OUT, OLD]):                 # v91.17.272 · NIGRAAN's archive first, then the runs saved under station-lake (read only)
        side = os.path.join(root, sib, init.strftime('%Y'), init.strftime('%m'), f'{sib}_{init.strftime("%Y%m%d%H")}.json')
        try: ok = [c for c in (json.load(open(side)).get('runChecks') or []) if c.get('verdict') == 'pass' and c.get('on') != 'members']
        except Exception: ok = []
        if ok: break
    if ok: return f'{sib} run {iso(init)} saved, identified from its own data on the {ok[0].get("on")} check ({ok[0].get("detail")})'
    return None


def get_json(url, headers=None, timeout=180):
    r = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(r, timeout=timeout) as f: return json.load(f)


def meta(ds):
    m = get_json(META.format(ds), timeout=30)
    ts = lambda k: dt.datetime.fromtimestamp(m[k], dt.timezone.utc) if m.get(k) else None
    return dict(init=ts('last_run_initialisation_time'), available=ts('last_run_availability_time'), modified=ts('last_run_modification_time'),
                dataEnd=ts('data_end_time'), stepS=m.get('temporal_resolution_seconds'), updateS=m.get('update_interval_seconds'))


def om_weight(nlocs, nvars_members, days):
    """v91.17.261 · the provider's rule (Open-Meteo calculateQueryWeight): per location max(1, v/10 x max(1, days/14)), v = variables
       x members summed over the models asked. The server ledger (provider.mjs weightOf) uses the same formula."""
    return nlocs * max(1.0, nvars_members / 10.0 * max(1.0, days / 14.0))


def q_weight(q):
    """weight of one /px ensemble request, from the request itself (the same reading of the query as weightOf in provider.mjs)"""
    n = lambda k: len([x for x in str(q.get(k, '')).split(',') if x.strip()])
    locs = n('latitude') or 1
    nv = sum(n(k) for k in ('hourly', 'daily', 'minutely_15', 'current')) or 1
    mem = sum(MEMBERS.get(m.strip(), 1) for m in str(q.get('models', '')).split(',') if m.strip()) or 1
    if q.get('start_hour') and q.get('end_hour'):
        p = lambda s: dt.datetime.strptime(s, '%Y-%m-%dT%H:%M')
        days = max(1 / 24.0, (p(q['end_hour']) - p(q['start_hour'])).total_seconds() / 86400.0 + 1 / 24.0)
    else: days = float(q.get('forecast_days', 7)) + float(q.get('past_days', 0))
    return om_weight(locs, nv * mem, days)


def weight(model, npts, hours):
    """predicted weight of one run's fetch: every chunk carries the anchor point, plus two anchor reads (identification, end check)"""
    nch = -(-npts // CHUNK)
    return om_weight(npts + nch, len(model['vars']) * model['members'], hours / 24.0) + 2 * om_weight(1, model['members'], 16)


def status_load():
    try: return json.load(open(STATUS))
    except Exception: return dict(runs=[], days={})


def status_save(S):
    S['updated'] = iso(now()); os.makedirs(os.path.dirname(STATUS), exist_ok=True)
    tmp = STATUS + '.tmp'; json.dump(S, open(tmp, 'w'), indent=1); os.replace(tmp, STATUS)


def dir_gb(p):
    s = 0
    for r, _, fs in os.walk(p):
        for f in fs:
            try: s += os.path.getsize(os.path.join(r, f))
            except OSError: pass
    return s / 1e9


def px(q):
    url = f'http://127.0.0.1:{PORT}/px/v1/ensemble?' + urllib.parse.urlencode(q)
    SPENT[0] += q_weight(q)          # v91.17.261 · every attempt is billable (the server ledger counts each attempt too)
    return get_json(url, {'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': 'ens-archive'})


def three_hour(times, series, valid):
    """3-hour totals ending at each valid time from the provider's hourly values (nan if any hour is missing)"""
    tt = {t: k for k, t in enumerate(times)}
    out = np.full(len(valid), np.nan)
    for j, v in enumerate(valid):
        ks = [tt.get((v - dt.timedelta(hours=b)).strftime('%Y-%m-%dT%H:%M')) for b in range(STEP)]
        if all(k is not None and series[k] is not None for k in ks): out[j] = sum(series[k] for k in ks)
    return out


def native_step_check(model, acc, init, valid):
    """v91.17.261 · which run supplies the hours around +144 h, read from the data. acc: accumulated 3-hour totals, shape
       (member, point, valid). ECMWF ENS is 3-hourly to +144 h and 6-hourly after; the provider splits a 6-hour total evenly over its
       hours, so in the 6-hourly part the two 3-hour halves of a block are exactly equal, in the 3-hourly part they differ in most wet
       cases. Run T supplies +139..+150 h only if the block ending T+144 h is 3-hourly AND the block ending T+150 h is 6-hourly: a newer
       run would still be 3-hourly at T+150 h, an older one already 6-hourly at T+144 h. Returns (verdict, detail) with verdict
       'pass', 'fail', 'indeterminate' (fewer than MIN_WET wet pairs) or 'n/a' (no step change in this model)."""
    h3 = NATIVE3_H.get(model['id'])
    if h3 is None or acc is None: return 'n/a', 'no step change in this model'
    ix = {int((v - init).total_seconds() // 3600): j for j, v in enumerate(valid)}
    if not all(h in ix for h in (h3 - 3, h3, h3 + 3, h3 + 6)): return 'n/a', f'run shorter than +{h3 + 6} h'
    def block(h):                                   # the 6-hour block ending at lead h: (wet pairs, pairs with unequal halves)
        a, b = acc[..., ix[h - 3]], acc[..., ix[h]]; ok = np.isfinite(a) & np.isfinite(b) & ((a + b) > 0)
        return int(ok.sum()), int((np.abs(a - b)[ok] > 1e-4).sum())
    n0, d0 = block(h3); n1, d1 = block(h3 + 6)
    det = f'+{h3 - 5}..+{h3} h: {d0} of {n0} wet pairs 3-hourly; +{h3 + 1}..+{h3 + 6} h: {d1} of {n1} 3-hourly'
    if d1 > 0:
        # v91.17.283.38 · item 11 · since the 28 Oct 12 UTC run the provider serves the ECMWF members 3-hourly far beyond +144 h (checked
        # on its live answer 30 Oct: unequal 3-hour halves in most wet 6-hour blocks out to +200 h). A newer run inside the data would end
        # its own 3-hourly part at +144 h of ITS run, so the far tail (the blocks ending +156 h .. the end, 6-hourly in a newer run as
        # well) would still be split evenly. Far tail 3-hourly too = no step change in the served data: the run cannot be read from the
        # step and is identified by its data end and anchors (as a model without a step change); far tail split evenly = a newer run.
        far = [h for h in sorted(ix) if h >= h3 + 12 and (h - h3) % 6 == 0 and (h - 3) in ix]
        if far:
            nf = df = 0
            for h in far: a_, b_ = block(h); nf += a_; df += b_
            det2 = det + f'; +{h3 + 7}..+{far[-1]} h: {df} of {nf} 3-hourly'
            if nf >= MIN_WET and df > 0: return 'n/a', det2 + f' (the provider serves this model 3-hourly beyond +{h3} h, to the end of the run: no step change to read the run from)'
            if nf >= MIN_WET and df == 0: return 'fail', det2 + f' (3-hourly output continues past +{h3} h and stops later: a newer run supplies these hours)'
            return 'indeterminate', det2 + f' (3-hourly output continues past +{h3} h; the far tail is too dry to tell a newer run from 3-hourly output)'
        return 'fail', det + f' (3-hourly output continues past +{h3} h: a newer run supplies these hours)'
    if n0 >= MIN_WET and d0 == 0: return 'fail', det + f' (6-hourly output already before +{h3} h: an older run supplies these hours)'
    if n0 >= MIN_WET and n1 >= MIN_WET: return 'pass', det
    # v91.17.272 · too dry to read the step: no evidence either way (not a refusal; the run is identified by its data end and anchors)
    return 'indeterminate', det + f' (fewer than {MIN_WET} wet pairs: too dry to read the step from; no evidence of another run)'


def completeness(model, arr, valid, init, hours, npts):
    """v91.17.272 · the run is complete when every member x grid point x 3-hour step x variable holds a value, and the steps run from
       +3 h to the run's lead end (the shorter of LEAD_H and the run's documented length). Returns (True, detail) or (False, detail).
       Wetness plays no part."""
    want_h = min(LEAD_H, RUNLEN[model['id']].get(init.hour, LEAD_H))
    nm = model['members'] if model['kind'] == 'members' else 1
    want = [init + dt.timedelta(hours=h) for h in range(STEP, want_h + 1, STEP)]
    if hours < want_h or list(valid) != want:
        return False, f'steps +{STEP}..+{hours} h fetched, +{STEP}..+{want_h} h expected ({len(valid)} of {len(want)} steps)'
    miss = []
    for v in model['vars']:
        x = arr.get(v)
        if x is None: miss.append(f'{v}: variable missing'); continue
        if x.shape != (nm, npts, len(want)): miss.append(f'{v}: shape {x.shape}, expected {(nm, npts, len(want))}'); continue
        bad = ~np.isfinite(x)
        if bad.any():
            m_, p_, s_ = np.nonzero(bad)
            miss.append(f'{v}: {int(bad.sum())} of {bad.size} values empty ({len(set(m_.tolist()))} members, {len(set(p_.tolist()))} points, '
                        f'{len(set(s_.tolist()))} steps; first +{STEP * (int(s_.min()) + 1)} h)')
    if miss: return False, '; '.join(miss)
    return True, f'{nm} members x {npts} points x {len(want)} steps x {len(model["vars"])} variables, every value present'


def identify(model):
    """which run the provider is serving now. Its servers are not always in step (two metadata reads a second apart can name
       different runs), so: (1) read the metadata five times and keep every run named; (2) fetch the anchor point (the first
       grid point) with no end limit and find where its control precipitation ends; (3) the run is the named one whose data end
       matches (within one 3-hour step). Returns (run metadata, anchor data end) or raises."""
    seen = {}
    for _ in range(5):
        try: m = meta(model['meta']); seen[(m['init'], m['dataEnd'])] = m
        except Exception: pass
        time.sleep(1)
    if not seen: raise RuntimeError('metadata unavailable')
    return seen


def anchor_end(model, lat0, lon0, full=False):
    """served data end at the anchor point; with full=True also its hourly series of the first variable (every member)"""
    q = dict(__omhost='ensemble-api.open-meteo.com', __raw='1', latitude=f'{lat0:.2f}', longitude=f'{lon0:.2f}', models=model['id'],
             hourly=model['vars'][0], forecast_days='16', timezone='GMT')
    d = px(q); d = d[0] if isinstance(d, list) else d; H = d['hourly']; v = H[model['vars'][0]]
    last = max((k for k, x in enumerate(v) if x is not None), default=None)
    if last is None: raise RuntimeError('anchor point has no data')
    end = dt.datetime.strptime(H['time'][last], '%Y-%m-%dT%H:%M').replace(tzinfo=dt.timezone.utc)
    return (end, H) if full else end


def member_keys(model, v):
    return [v] + [f'{v}_member{m:02d}' for m in range(1, model['members'])] if model['kind'] == 'members' else [v]


def same_server(model, anc, H, v):
    """True when the anchor values of variable v in response H equal the identification read's wherever both have the hour"""
    at = {t: k for k, t in enumerate(H.get('time', []))}
    for k in member_keys(model, v):
        a, b = anc.get(k) or [], H.get(k) or []
        for t, x in zip(anc.get('time', []), a):
            if t in at and at[t] < len(b) and b[at[t]] != x: return False
    return True


def probe(model, tr, lat, lon, anc):
    """v91.17.261 · the native-step check on the anchor plus points spread over the grid, for the hours +139..+150 h only: 25 points
       for the 51 members (25 x 5.1 = 128 weighted calls), 150 for the ensemble mean (one value per point: 150 calls; a longer
       point list would pass the server's 4,000-character query cap). Precipitation is asked because it is wet far more often
       than snowfall; the anchor's first variable is asked too, so the answer can be tied to the identification read's server."""
    npts = 25 if model['members'] > 1 else 150
    h3 = NATIVE3_H[model['id']]; v0 = model['vars'][0]
    ix = sorted(set(np.linspace(0, len(lat) - 1, npts).round().astype(int).tolist()) | {0})
    s0, s1 = tr + dt.timedelta(hours=h3 - 5), tr + dt.timedelta(hours=h3 + 6)
    hv = [v0] + (['precipitation'] if v0 != 'precipitation' else [])
    q = dict(__omhost='ensemble-api.open-meteo.com', __raw='1', latitude=','.join(f'{lat[i]:.2f}' for i in ix), longitude=','.join(f'{lon[i]:.2f}' for i in ix),
             models=model['id'], hourly=','.join(hv), start_hour=s0.strftime('%Y-%m-%dT%H:%M'), end_hour=s1.strftime('%Y-%m-%dT%H:%M'), timezone='GMT')
    d = px(q); d = d if isinstance(d, list) else [d]
    if not same_server(model, anc, d[0].get('hourly') or {}, v0): return 'indeterminate', 'the probe was answered by another provider server than the identification'
    valid = [tr + dt.timedelta(hours=h) for h in (h3 - 3, h3, h3 + 3, h3 + 6)]
    keys = member_keys(model, 'precipitation')
    acc = np.array([[three_hour(L['hourly']['time'], L['hourly'][k], valid) for L in d] for k in keys])   # member x point x valid
    return native_step_check(model, acc, tr, valid)


def fetch_model(model, M0, lat, lon, anc=None):
    """returns (arrays dict, valid times, n requests, anchor retries) for the run M0 describes; raises on any failure. Every request
       carries the anchor point first; a chunk is accepted only when its anchor values equal the first chunk's exactly, so every
       chunk is known to come from the same model run
       v91.17.261 · anc: the identification read's anchor series; the first chunk's anchor must equal it where both have hours (the
       provider's servers are out of step: identification and fetch must have read the same one). Each chunk's accumulated variable
       is checked for 3-hourly output past +144 h (a newer run inside the data) and the fetch stops at the first such chunk."""
    init = M0['init']; end = min(init + dt.timedelta(hours=LEAD_H), M0['dataEnd'] or init + dt.timedelta(hours=LEAD_H))
    h0 = init + dt.timedelta(hours=1); hours = int((end - init).total_seconds() // 3600)
    hourly = list(model['vars'])
    valid = [init + dt.timedelta(hours=h) for h in range(STEP, hours + 1, STEP)]
    nm = model['members'] if model['kind'] == 'members' else 1
    arr = {v: np.full((nm, len(lat), len(valid)), np.nan, dtype='float32') for v in hourly}
    nreq = 0; ref = None; mism = 0
    for i in range(0, len(lat), CHUNK):
        la, lo = [lat[0]] + list(lat[i:i + CHUNK]), [lon[0]] + list(lon[i:i + CHUNK])
        q = dict(__omhost='ensemble-api.open-meteo.com', __raw='1', latitude=','.join(f'{x:.2f}' for x in la), longitude=','.join(f'{x:.2f}' for x in lo),
                 models=model['id'], hourly=','.join(hourly), start_hour=h0.strftime('%Y-%m-%dT%H:%M'), end_hour=end.strftime('%Y-%m-%dT%H:%M'), timezone='GMT')
        err = None; d = None
        for att in range(6):
            try:
                d = px(q); d = d if isinstance(d, list) else [d]; nreq += 1
                if len(d) != len(la): raise RuntimeError(f'{len(d)} locations returned for {len(la)}')
                sig = json.dumps(d[0].get('hourly'), sort_keys=True)
                if ref is None:
                    ref = sig
                    if anc is not None and not same_server(model, anc, d[0].get('hourly') or {}, hourly[0]):
                        e = RuntimeError('the fetch was answered by another provider server than the identification (anchor values differ); retried at the next check'); e.nreq = nreq; raise e
                if sig != ref:
                    # v91.17.193 · the provider is still writing (or has replaced) the run: retrying the same chunk cannot help and the
                    # 6 slow retries used to eat the window. Stop now; the next check (15 min) starts the run again from the beginning.
                    mism += 1; e = RuntimeError(f'anchor differs from the first chunk at chunk {i // CHUNK} (the provider is still writing or replaced the run)'); e.nreq = nreq; raise e
                break
            except Exception as e:
                if getattr(e, 'nreq', None) is not None: raise
                err = e; d = None; time.sleep(10 * (att + 1))
        if d is None: e = RuntimeError(f'chunk {i // CHUNK} failed after 6 tries: {str(err)[:120]}'); e.nreq = nreq; raise e
        d = d[1:]
        for j, L in enumerate(d):
            H = L.get('hourly') or {}
            tt = np.array([int(dt.datetime.strptime(t, '%Y-%m-%dT%H:%M').replace(tzinfo=dt.timezone.utc).timestamp()) for t in H.get('time', [])], dtype='int64')
            if not len(tt): raise RuntimeError(f'chunk {i // CHUNK}: no time axis')
            vu = np.array([int(t.timestamp()) for t in valid], dtype='int64')
            def where(ts):
                k = np.searchsorted(tt, ts); ok = (k < len(tt)) & (tt[np.minimum(k, len(tt) - 1)] == ts); return np.where(ok, k, -1)
            ix_inst = where(vu); ix_acc = np.stack([where(vu - 3600 * b) for b in range(STEP)], axis=1)
            for v in hourly:
                keys = [v] + [f'{v}_member{m:02d}' for m in range(1, nm)] if model['kind'] == 'members' else [v]
                for m, k in enumerate(keys):
                    sv = H.get(k)
                    if sv is None: raise RuntimeError(f'{model["id"]}: {k} missing')
                    sv = np.append(np.array([np.nan if x is None else x for x in sv], dtype='float64'), np.nan)   # index -1 -> nan
                    if v in ACCUM: arr[v][m, i + j, :] = sv[ix_acc].sum(axis=1)                                   # nan if any hour is missing
                    else: arr[v][m, i + j, :] = sv[ix_inst]
        acc = STEPVAR if STEPVAR in hourly else None          # v91.17.267 · the step is read from precipitation only (STEPVAR)
        if acc is not None:
            vd, det = native_step_check(model, arr[acc][:, i:i + len(d), :], init, valid)
            if vd == 'fail' and 'newer run' in det:
                e = RuntimeError(f'chunk {i // CHUNK}: {det}'); e.nreq = nreq; raise e
        time.sleep(0.5)
    return arr, valid, nreq, mism


def main():
    # v91.17.272 · NIGRAAN's archive takes the grid from the runs saved before (copy, never fetched again)
    if not os.path.exists(GRID) and os.path.exists(os.path.join(OLD, 'grid_pk025.json')):
        os.makedirs(OUT, exist_ok=True); shutil.copyfile(os.path.join(OLD, 'grid_pk025.json'), GRID + '.tmp'); os.replace(GRID + '.tmp', GRID)
    G = json.load(open(GRID)); lat = np.array(G['lat']); lon = np.array(G['lon'])
    lim = int(opt('--limit', '0'))
    if lim: lat, lon = lat[:lim], lon[:lim]
    lock = os.path.join(OUT, '.lock'); os.makedirs(OUT, exist_ok=True)
    if os.path.exists(lock) and time.time() - os.path.getmtime(lock) < 3 * 3600: print('another archive run is active'); return
    open(lock, 'w').write(iso(now()))
    S = status_load(); S.setdefault('runs', []); S.setdefault('days', {})
    S['config'] = dict(models=[m['id'] for m in MODELS], runsUTC=RUNS, ecmwfRunsUTC=ECMWF_RUNS, ecmwfGapH=ECMWF_GAP_H, leadH=LEAD_H, points=len(lat), capGB=CAP_GB, budgetPerDay=BUDGET, out=OUT, readOnly=OLD)
    try:
        gb = dir_gb(OUT) + (dir_gb(OLD) if os.path.isdir(OLD) else 0.0); S['sizeGB'] = round(gb, 3)
        if gb >= CAP_GB:
            S['state'] = f'storage cap reached ({gb:.1f} of {CAP_GB:.0f} GB): nothing saved; nothing deleted (raise NIGRAAN_ENS_CAP_GB or move old files)'
            print(S['state']); return
        day = now().strftime('%Y-%m-%d'); used0 = S['days'].get(day, 0.0)
        spent = lambda: used0 + SPENT[0]                         # v91.17.261 · what this day's requests weighed, counted per request
        idx = os.path.join(OUT, 'index.jsonl'); have = set(); saved = {}; delays = {}
        # v91.17.272 · the runs saved under station-lake (read only) count as saved, then NIGRAAN's own index
        for ix in [f for f in (os.path.join(OLD, 'index.jsonl'), idx) if os.path.exists(f) and os.path.abspath(f) != os.path.abspath(idx)] + ([idx] if os.path.exists(idx) else []):
            for l in open(ix):
                try:
                    r = json.loads(l); have.add((r['model'], r['init'])); t_i = dt.datetime.strptime(r['init'], '%Y-%m-%dT%H:%MZ').replace(tzinfo=dt.timezone.utc)
                    saved.setdefault(r['model'], []).append(t_i)
                    delays.setdefault(r['model'], []).append((dt.datetime.strptime(r['saved'], '%Y-%m-%dT%H:%MZ').replace(tzinfo=dt.timezone.utc) - t_i).total_seconds() / 3600)
                except Exception: pass
        P = S.setdefault('probes', {})
        IDN = {}                                                  # v91.17.267 · each model's identified run and anchor verdict in this check
        did = []
        for model in MODELS:
            try:
                seen = identify(model)
                L = RUNLEN[model['id']]; n0 = now(); t = n0.replace(minute=0, second=0, microsecond=0) - dt.timedelta(hours=n0.hour % 6)
                cand = [t - dt.timedelta(hours=6 * k) for k in range(9)]
                explain = lambda e: [c for c in cand if ends_at(model['id'], c, e)]
                # v91.17.261 · the provider's servers are out of step (14 Oct: one still ends at 10 Oct 00 UTC + 360 h). An end that no run
                # of the last 48 h explains is read again (up to ANCHOR_READS reads, ~5.8 weighted calls each); the newest end seen is kept.
                reads = []
                for _ in range(ANCHOR_READS):
                    reads.append(anchor_end(model, lat[0], lon[0], full=True))
                    if explain(reads[-1][0]): break
                aend, anc = max(reads, key=lambda r: r[0])
                match = explain(aend)
                if not match:
                    # v91.17.267 · name the run that really ends there (the mean's end lies 2 h past its run's: "10 Oct 02 UTC" was reported)
                    ends = f'served data end {iso(aend)} (ends seen in {len(reads)} reads: {", ".join(sorted({iso(r[0]) for r in reads}))})'
                    old = run_ending(model['id'], aend)
                    if not old: raise RuntimeError(f'{ends}: no run time explains it (00 / 06 / 12 / 18 UTC with the documented run lengths), no newer complete run')
                    raise RuntimeError(f'{ends} is where the {iso(old[0])} run ends ({"saved" if (model["id"], iso(old[0])) in have else "not saved"}): the provider is still serving that run\'s tail, no newer complete run')
                tr = max(match)
                newer = sorted({i0 for (i0, de) in seen if i0 and i0 > tr})
                # v91.17.272 · a newer run named for the very series being served (its metadata data end = the served end, within one step)
                newerSame = sorted({i0 for (i0, de) in seen if i0 and i0 > tr and de and abs((de - aend).total_seconds()) <= STEP * 3600})
                # v91.17.261 · a newer run inside the data is read from the data (native_step_check), on the anchor read first (free)
                pre = ('n/a', 'no step change in this model'); aend_run = None
                if model['id'] in NATIVE3_H and model['vars'][0] == STEPVAR:
                    vv = [tr + dt.timedelta(hours=h) for h in range(STEP, LEAD_H + 1, STEP)]
                    A = np.array([[three_hour(anc['time'], anc[k], vv)] for k in member_keys(model, model['vars'][0])])
                    pre = native_step_check(model, A, tr, vv)
                    if pre[0] == 'fail' and 'newer run' in pre[1]:
                        # v91.17.283.38 · item 11 · since 28 Oct the provider runs this model four times a day: the 06 and 18 UTC runs reach
                        # +144 h only and the served series is the newest run up to its own end, an older long run after it (metadata 30 Oct:
                        # last run 06 UTC, data end +147 h). A long run is then never served whole and no run was saved for two days. The newest
                        # run named by the metadata is one run up to its own end: it is archived to that end (every hour its own), when its
                        # documented length explains the metadata's data end. A newer run inside the data is still refused otherwise.
                        nw = sorted(((i0, de) for (i0, de) in seen if i0 and de and i0 > tr and ends_at(model['id'], i0, de)), reverse=True)
                        if nw:
                            n0_, de_ = nw[0]; L_ = RUNLEN[model['id']].get(n0_.hour, LEAD_H)
                            pre = ('n/a', f'the newest run {iso(n0_)} ({L_} h) is served up to its own end and an older run after it ({pre[1]}); '
                                          f'the newest run is archived to its own end')
                            tr = n0_; aend_run = min(de_, n0_ + dt.timedelta(hours=L_))
                            newer = sorted({i0 for (i0, de) in seen if i0 and i0 > tr}); newerSame = []
                    if pre[0] == 'fail': raise RuntimeError(f'the data served are not one run at the anchor: {pre[1]}; {iso(tr)} skipped')
                IDN[model['id']] = dict(init=tr, verdict=pre[0], detail=pre[1])
                mm = [m for (i0, de), m in seen.items() if i0 == tr]
                M0 = dict(init=tr, dataEnd=(aend_run or aend), available=mm[0]['available'] if mm else None, modified=mm[0]['modified'] if mm else None, stepS=(mm[0]['stepS'] if mm else 10800),
                          newer=newer, newerSame=newerSame, check=[('anchor', pre)], reads=sorted({iso(r[0]) for r in reads}))
            except Exception as e: did.append(dict(model=model['id'], result='run not identified, nothing fetched: ' + str(e)[:300])); continue
            init = M0['init']; key = (model['id'], iso(init))
            ecm = model['id'].startswith('ecmwf_')
            catchup = None
            if init is not None and init.hour not in (ECMWF_RUNS if ecm else RUNS):
                # v91.17.283.38 · item 11 · the provider serves only its latest run: an archived run hour that was not seen while it was the
                # latest (laptop off, metadata unavailable) is lost for good, and the model then saves nothing until the next day. When no
                # run of this model was saved in the last 24 h, the latest run is saved instead (one a day, the day's run kept).
                last = max(saved.get(model['id'], []) or [None], key=lambda x: x or dt.datetime.min.replace(tzinfo=dt.timezone.utc))
                if init.hour % 6 == 0 and (last is None or (init - last) >= dt.timedelta(hours=24)) and (model['id'], iso(init)) not in have:
                    catchup = f'catch-up: no run of this model saved in the 24 h before {iso(init)} (the archived run hour was not served while the checks ran)'
                else: did.append(dict(model=model['id'], result=f'latest run {iso(init)} is not an archived run hour')); continue
            if init is None: did.append(dict(model=model['id'], result='latest run ? is not an archived run hour')); continue
            if ecm and key not in have and any(dt.timedelta(0) < (init - t0) < dt.timedelta(hours=ECMWF_GAP_H) for t0 in saved.get(model['id'], [])):
                did.append(dict(model=model['id'], result=f'run {iso(init)} skipped: a run of this model was saved less than {ECMWF_GAP_H} h before it')); continue
            if key in have: did.append(dict(model=model['id'], result=f'run {iso(init)} already saved')); continue
            hours = min(LEAD_H, int(((M0['dataEnd'] or init) - init).total_seconds() // 3600))
            w = weight(model, len(lat), hours)
            if spent() + w > BUDGET: did.append(dict(model=model['id'], result=f'daily call budget would be exceeded ({spent():.0f} + {w:.0f} > {BUDGET:.0f})')); continue
            if '--dry' in a: did.append(dict(model=model['id'], result=f'dry run: would fetch {iso(init)}, {len(lat)} points, {hours} h, ~{w:.0f} weighted calls; anchor check: {M0["check"][0][1][0]}')); continue
            # v91.17.261 · anchor too dry to read the step from: a probe of the grid (~128 / 150 weighted calls) before the fetch (~9,250 / 1,814). Its verdict is kept per run:
            # a proven overlay never goes away (the newer run stays), an undecided one is probed again after an hour.
            pk = '|'.join(key); pv = P.get(pk)
            if model['id'] in NATIVE3_H and M0['check'][0][1][0] not in ('pass', 'n/a'):   # v283.38: n/a = no step served (nothing for a probe to read)
                if pv and pv['verdict'] == 'fail': did.append(dict(model=model['id'], result=f'run {iso(init)} skipped: a newer run is inside the data ({pv["detail"]})')); continue
                # v91.17.267 · an undecided probe younger than an hour is re-used, not bought again every 15 min (~128 / 151 weighted calls)
                if pv and pv['verdict'] == 'indeterminate' and (now() - pt(pv['at'])) < dt.timedelta(hours=1): vd = ('indeterminate', f'{pv["detail"]}; probed {pv["at"]}')
                else:
                    try: vd = probe(model, init, lat, lon, anc)
                    except Exception as e: vd = ('indeterminate', 'probe failed: ' + str(e)[:100])
                    P[pk] = dict(verdict=vd[0], detail=vd[1], at=iso(now()))
                M0['check'].append(('probe', vd))
                if vd[0] == 'fail': did.append(dict(model=model['id'], result=f'run {iso(init)} skipped: {vd[1]}')); continue
                if vd[0] == 'indeterminate' and model['id'] in SIBLING:
                    # v91.17.267 · the mean is the members' run: it takes their identity of this cycle, or waits without a fetch
                    why = sibling_identity(model, init, M0['dataEnd'], P, IDN)
                    if why: M0['check'].append(('members', ('pass', why)))
                # v91.17.272 · too dry to read the step is no refusal: the run is identified by its data end and anchors. It waits only when the
                # provider's metadata names a newer run for the very series being served (an overlay the dry data cannot rule out)
                if vd[0] == 'indeterminate' and not any(c[1][0] == 'pass' for c in M0['check']) and M0['newerSame']:
                    did.append(dict(model=model['id'], result=f'run {iso(init)} waits, nothing fetched: too dry to read the step ({vd[1]}) and the metadata names the newer run '
                                                              f'{iso(M0["newerSame"][-1])} for the same data end')); continue
            t0 = now(); s_before = SPENT[0]
            try:
                arr, valid, nreq, mism = fetch_model(model, M0, lat, lon, anc)
                aend2 = anchor_end(model, lat[0], lon[0])
                if abs((aend2 - aend).total_seconds()) > STEP * 3600:
                    raise RuntimeError(f'the provider moved to another run during the fetch (data end {iso(aend)} -> {iso(aend2)}); discarded, retried at the next check')
                accv = STEPVAR if STEPVAR in model['vars'] else None   # v91.17.267 · precipitation only (the mean's snowfall is not split evenly)
                fin = native_step_check(model, arr[accv], init, valid) if accv else (('n/a', 'no precipitation in this fetch; the step is not read from snowfall (not split evenly in the ensemble mean)') if model['id'] in NATIVE3_H else ('n/a', 'no step change in this model'))
                M0['check'].append(('grid', fin))
                if fin[0] == 'fail': raise RuntimeError(f'the data fetched are not one run: {fin[1]}; discarded')
                passed = any(c[1][0] == 'pass' for c in M0['check'])
                if fin[0] == 'indeterminate' and not passed and M0['newerSame']:
                    raise RuntimeError(f'too dry to read the step on the whole grid ({fin[1]}) and the metadata names the newer run {iso(M0["newerSame"][-1])} for the same data end; discarded')
                # v91.17.272 · complete or nothing: every member x point x step x variable present
                comp = completeness(model, arr, valid, init, hours, len(lat))
                if not comp[0]: raise RuntimeError(f'incomplete run: {comp[1]}; discarded')
                M0['complete'] = comp[1]
                M0['identity'] = 'proven from the data' if passed else ('served data end and anchors (no step change in this model)' if all(c[1][0] == 'n/a' for c in M0['check']) else 'served data end and anchors (too dry to read the step; no newer run named for this series)')
            except Exception as e:
                # v91.17.193 · charge what was actually requested; v91.17.261 · counted request by request (SPENT), as the server does
                S['days'][day] = round(spent(), 1); did.append(dict(model=model['id'], result=f'failed, nothing saved (~{SPENT[0] - s_before:.0f} weighted calls used): ' + str(e)[:300])); continue
            w = SPENT[0] - s_before; S['days'][day] = round(spent(), 1)
            sub = os.path.join(OUT, model['id'], init.strftime('%Y'), init.strftime('%m')); os.makedirs(sub, exist_ok=True)
            base = os.path.join(sub, f"{model['id']}_{init.strftime('%Y%m%d%H')}")
            pack = {}
            for v, x in arr.items():
                if v in ACCUM: pack[v] = np.where(np.isnan(x), 65535, np.clip(np.round(x * 10), 0, 65534)).astype('uint16')    # 0.1 mm / 0.1 cm
                else: pack[v] = x.astype('float16')                                                               # predictors: 3 significant digits
            pack['valid_unix'] = np.array([int(t.timestamp()) for t in valid], dtype='int64'); pack['lat'] = lat.astype('float32'); pack['lon'] = lon.astype('float32')
            np.savez_compressed(base + '.npz.tmp.npz', **pack); os.replace(base + '.npz.tmp.npz', base + '.npz')
            sha = hashlib.sha256(open(base + '.npz', 'rb').read()).hexdigest()
            side = dict(model=model['id'], label=model['label'], dataset=model['meta'], kind=model['kind'], init=iso(init),
                        providerAvailable=iso(M0['available']) if M0['available'] else None, providerModified=iso(M0['modified']) if M0['modified'] else None,
                        providerDataEnd=iso(M0['dataEnd']) if M0['dataEnd'] else None, nativeStepS=M0['stepS'], nativeNote=model['nativeNote'],
                        members=(['control'] + [f'member{m:02d}' for m in range(1, model['members'])]) if model['kind'] == 'members' else ['mean'],
                        validFirst=iso(valid[0]), validLast=iso(valid[-1]), steps=len(valid), stepH=STEP, leadsH=[STEP * (k + 1) for k in range(len(valid))],
                        accumulation={v: f'{STEP} h ending at the valid time (sum of the provider\'s hourly values), stored x10 as uint16, 65535 = missing' for v in arr if v in ACCUM},
                        instantaneous=[v for v in arr if v not in ACCUM], units={v: UNITS.get(v) for v in arr}, arrayShape='member x point x valid time',
                        grid=dict(file='grid_pk025.json', version=G['version'], points=len(lat), resolutionDeg=G['resolution_deg'], rule=G['rule']),
                        fetchStart=iso(t0), fetchEnd=iso(now()), requests=nreq, anchorRetries=mism, servedDataEnd=iso(aend),
                        runCheck='every request carried the anchor point first, and its values equalled the first request\'s (and the identification read\'s) exactly; the run was identified by matching the served data end to its documented length; the hours around +144 h were checked for the producer\'s 3-hourly to 6-hourly step change (a newer run would carry 3-hourly output past it)',
                        runChecks=[dict(on=c[0], verdict=c[1][0], detail=c[1][1]) for c in M0['check']], endReads=M0['reads'], metadataNewer=[iso(x) for x in M0['newer']], complete=M0.get('complete'), identity=M0.get('identity'),
                        weightedCalls=round(w, 1), sha256=sha, bytes=os.path.getsize(base + '.npz'),
                        source='provider ensemble API via the local server (/px); run time from the provider model metadata')
            json.dump(side, open(base + '.json', 'w'), indent=1)
            with open(idx, 'a') as f: f.write(json.dumps(dict(model=model['id'], init=iso(init), file=os.path.relpath(base + '.npz', OUT), bytes=side['bytes'], sha256=sha, saved=iso(now()))) + '\n')
            sib = [c[1][1] for c in M0['check'] if c[0] == 'members']
            did.append(dict(model=model['id'], result=f'saved run {iso(init)}: {len(valid)} steps, {side["bytes"] / 1e6:.1f} MB, {nreq} requests, ~{w:.0f} weighted calls' + (f'; run identity from the members: {sib[0]}' if sib else '') + (f'; {catchup}' if catchup else '')))
            have.add(key); saved.setdefault(model['id'], []).append(init); delays.setdefault(model['id'], []).append((now() - init).total_seconds() / 3600)
        S['days'][day] = round(spent(), 1)
        S['last'] = dict(at=iso(now()), results=did); S['runs'] = (S['runs'] + [dict(at=iso(now()), results=did)])[-60:]
        S['sizeGB'] = round(dir_gb(OUT), 3)
        S['probes'] = dict(sorted(P.items(), key=lambda kv: kv[1].get('at', ''))[-20:])
        # v91.17.261 · a missed run is an error state, not 'ok': each model's newest saved run must be younger than its cadence (24 h: one
        # run a day; ECMWF one a day by the 20 h gap) + the provider's delay measured on its last 5 saves (run time -> saved) + 1 h of checks
        S['newest'] = {}; miss = []
        for m in MODELS:
            ts = saved.get(m['id'], [])
            if not ts: S['newest'][m['id']] = dict(init=None, missed=True); miss.append(m['id'] + ': no run saved yet'); continue
            nw = max(ts); dl = delays.get(m['id'], [])[-5:]                  # the last 5 saves, in the order saved
            cad = 24.0 if m['id'].startswith('ecmwf_') else 24.0 / max(1, len(RUNS))
            lim = cad + (max(dl) if dl else 0.0) + 1.0; age = (now() - nw).total_seconds() / 3600
            S['newest'][m['id']] = dict(init=iso(nw), ageH=round(age, 1), limitH=round(lim, 1), missed=age > lim)
            if age > lim: miss.append(f'{m["id"]}: newest saved run {iso(nw)} is {age:.0f} h old (limit {lim:.0f} h)')
        S['state'] = ('missed: ' + '; '.join(miss)) if miss else 'ok'
        S['days'] = dict(sorted(S['days'].items())[-40:])
        for r in did: print(r['model'], '-', r['result'])
    finally:
        status_save(S)
        try: os.remove(lock)
        except OSError: pass


if __name__ == '__main__':
    main()
