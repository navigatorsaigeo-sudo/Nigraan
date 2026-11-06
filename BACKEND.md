# NIGRAAN local backend

One process (`RUN_NIGRAAN.bat`) serves the dashboard and the backend on http://localhost:8787.
The dashboard connects to it automatically (Integration console, development profile).

## What it implements

All **89 endpoints** declared by the artefact in `AGN.backendInterfaces`, under `/api/v1/`, plus `GET /health`.
The contract is exported from the artefact into `server/contract/endpoints.json` and enforced on every request:
scopes and roles, field types/enums/ranges, `Idempotency-Key` on writes (replay returns the stored response,
a different body with the same key is refused), cursor/offset pagination, and the standard `vnd.agn+json` envelope.

| Area | Endpoints | Behaviour |
|---|---|---|
| Live & national data | point/national forecast, ingest, runs, records, cache, snapshots, units, providers | Real data from the paid provider, server-side only. 577 tehsils, batched. Fails closed; never falls back to the free tier. |
| Ingestion | jobs, worker, schedules, leases, heartbeats, recovery, quotas, replay, alerts, events | Persistent queue with leases, retries with backoff, dead-letter, schedules. Background worker every 20 s (`NIGRAAN_WORKER=0` disables). |
| Quality & promotion | gates, evaluate, promotions, scientific/operations review, revoke, promoted snapshot | 8 blocking gates (coverage, completeness, freshness, plausibility, spatial sanity, full run, disputed-territory flag, integrity hash). Scientific and operations reviewers must be different actors. |
| Security | posture, policies, identity, audit list/export, secret references, migrations, access evaluate | Hash-chained audit log. Browser role headers are ignored. Secret values are never returned. Migration plans are planning-only. |
| Acceptance & handover | scenarios, runs, backups + restore test, failover tests, UAT sign-offs, go/no-go, checklist, attestations, dossiers, release decision, runbook | Automated scenarios execute real checks; backups are SHA-256 verified and restore-tested in memory. |
| Operations & science | actions (optimistic locking, approval SoD), outcomes, assessments/evidence, risk explanation, model verification + skill, hybrid experiments, urban heat | Model verification computes real MAE/RMSE/bias from the previous-runs archive against ERA5. Explanations are deterministic from supplied evidence (no language model). Urban heat is a 630,784-cell field at about 270 m: Oke (1981) canyon geometry on GHSL 2025 built surface and volume, anchored on the WUDAPT local climate zone, reduced for MODIS NDVI vegetation, and calibrated 0.559 by least squares over two urban/rural station pairs (Rawalpindi and Lahore, 49,555 concurrent hours 2018–2025, residuals −0.14 K and +0.23 K). It is an amount ADDED to the grid forecast, never an air temperature and never a forecast, and it feeds no hazard score: both calibration pairs sit at a street aspect ratio near 0.47 while a dense city core is 1.8–2.5, so the magnitude where it matters most is still an extrapolation, and every response says so. |

## Deliberate refusals

* `GET /national/hazards/{hazard}` and hazard verdicts in `/operations/state` return `status: unavailable`,
  `reason: SERVER_ENGINE_NOT_DEPLOYED`. The canonical hazard engine is inside the sealed artefact; a second
  server-side implementation would publish numbers that can disagree with the dashboard.
* `security/posture` and `acceptance/posture` report `productionReady: false` on this machine: development token
  enabled, no OIDC issuer, JSON-file store instead of PostgreSQL, no TLS. These are true statements, not defects.

## Identity

* The dashboard uses the development token `agn-dev-token`, accepted **only from this machine**. Disable with `NIGRAAN_ALLOW_DEV_TOKEN=0`.
* Named actors: `node nigraan-local\scripts\issue-token.mjs --sub asim --roles scientific_reviewer`
  Roles: viewer, analyst, operator, supervisor, approver, scientific_reviewer, operations_approver, security_auditor, platform_admin, admin.

## Data

`nigraan-local\data\` holds the database (`nigraan-db.json`), token signing secret, and `backups\`. Keep it out of git.
Records are kept for the last 12 runs plus every promoted run (`NIGRAAN_KEEP_RUN_RECORDS`).

## Check it

With the server running: `node nigraan-local\scripts\test-backend.mjs --full`
(runs a 577-tehsil ingest and exercises all 89 endpoints; about 2 minutes, roughly 15 paid provider calls).

## 15-day outlook and sunshine check (v91.17 local)

- `GET /api/outlook/status` · `GET /api/outlook/unit?unit=<tehsil name or unitId>` · `GET /api/outlook/national?day=<0-14>` · `POST /api/outlook/run?what=ensemble|radiation|all` (loopback or token).
- Ensemble: ECMWF IFS ENS 0.25°, 51 members, 15 days, daily max/min temperature, rain and gusts for all 576 tehsils at their population-weighted elevation. p10/p50/p90 and the share of members crossing: max ≥40/45 °C, night minimum ≥30 °C, frost ≤0 °C, rain ≥25/50 mm, gusts ≥60 km/h. Refreshed every 6 h (`NIGRAAN_ENSEMBLE_HOURS`). Shares are raw, not calibrated.
- Sunshine check: satellite shortwave (`satellite_radiation_seamless`, ~1 h latency) against the forecast model for the same hours, last 15 days, judged against each tehsil's own median ratio. Refreshed hourly.
- Stored in `data/outlook.json` (about 2 MB). `NIGRAAN_OUTLOOK=0` disables the schedule.
- The dashboard shows it under the "15-day outlook" button (bottom left); the chat uses it for questions such as "10 day outlook for Jacobabad" or "is it cloudy in Islamabad".

## Hazard Monte Carlo, ensemble adjustment, calibration record and station checks

- Multi-day events are counted member by member across the 51 ensemble members (heatwave ≥40 °C 3+ days; unusual heat, warm nights and cold spells against each tehsil's 1991-2020 ERA5 percentiles; 3-day rain ≥75 mm and ≥ local 99th percentile). Climatology: `data/climatology.json`, built once (~2 min, ~24 archive requests).
- Ensemble temperature adjustment: ECMWF IFS 0.25° past forecasts vs ERA5 daily max/min over 60 days, learned on 30, kept only where it cuts the next 30 days' MAE by >0.1 °C; refreshed daily. `POST /api/outlook/run?what=bias`.
- Ensemble log: one run per day (`data/ensemble-log/`), scored against ERA5 after 6 days (`data/ensemble-scores.json`): Brier skill, reliability bins, 10-90% coverage, MAE. No backfill exists for ensemble members.
- Stations: METAR from 8 airports (Iowa Environmental Mesonet) plus any CSV in `data/stations/import/` (`station_id,name,lat,lon,elev_m,time_utc,temp_c`), scored on the national test month. Where the ERA5-trained correction makes an airport worse by >0.1 °C, the correction is switched off within 40 km. Grade A additionally needs ≥75% of stations within 2.0 °C served and no rise in the station median.
- `GET /api/checks` · `POST /api/checks/run?what=stations|ensemble-score|climatology`.

## Weeks ahead, season ahead and the site report

- `GET /api/outlook/seasonal?unit=` · `GET /api/outlook/seasonal/national?week=&month=` · `POST /api/outlook/run?what=seasonal`. ECMWF EC46 weekly anomalies and probabilities and ECMWF SEAS5 monthly means and anomalies for all 576 tehsils, both against model climate; refreshed every 12 h.
- Dashboard: an "Outlook" card in Forecast & Outlook (15 days · Weeks 2–6 · Season), a "Weeks & season" tab in the outlook panel, and a "Weeks 2–6" button plus a working "Seasonal" button in Operations.
- `GET /api/report/context?unit=` feeds the report pages Situation and decision, Next 15 days, Weeks ahead and season ahead, Recommended actions, and How accurate this forecast has been.

## Air and smog, operations health, backups, seasonal record

- `GET /api/smog/unit?unit=` · `GET /api/smog/national?day=` · `POST /api/outlook/run?what=smog`. CAMS PM2.5/PM10/US AQI/dust plus afternoon ventilation index, morning inversion (below 500 m) and fog risk for 576 tehsils, 5 days, every 3 h. "Smog day" = Unhealthy PM2.5 (US EPA 24 h ≥55.5 µg/m³) with poor dispersion. CAMS under-reads Punjab winter smog; not verified against monitors.
- `GET /api/ops/health`: every scheduled job with its age and limit; a late job raises an alert once a day and turns the outlook button red.
- Nightly backup to `data/nightly/YYYY-MM-DD/` (database, outlook, smog, stations, ensemble and seasonal logs, scores, climatology), last 14 kept. `POST /api/outlook/run?what=backup` runs one now.
- Weeks-ahead and seasonal record: EC46 logged weekly and SEAS5 monthly (`data/seasonal-log/`), scored against ERA5 anomalies from the 1993-2016 climate (`data/anomaly-climate.json`): sign hit rate, Brier score, anomaly correlation, MAE (`data/seasonal-scores.json`).
- Autostart on Windows: `INSTALL_AUTOSTART.bat` (scheduled task at sign-in, hidden watchdog that restarts the server; log in `data/server-console.log`), `REMOVE_AUTOSTART.bat` to undo.

## Mountain temperature correction (MOS)

`server/api/mos.mjs`, table in `data/mos-table.json`, built by
`station-lake/scripts/train_mos.py` from the PMD mountain AWS network (the delivered
files carried another label; all of it is PMD data).

Measured against 47 stations over a year (2025-09 to 2026-08): on the plains the model
is already right (bias Lahore −0.57 °C, Multan +0.33 °C, Karachi −0.83 °C; hourly MAE 1.3–1.6 °C), in the northern
mountains it runs about 4.5 °C cold, and ERA5 — the reference the older bias correction
trusts — is worse still (−5.96 °C). The correction is the station-measured error by
month and part of day.

| Path | MAE before | MAE after |
|---|---|---|
| Station within 25 km and 500 m | 4.8 °C | 2.0 °C |
| Height band, no station near | 4.9 °C | 2.8 °C |

Applied in `verification.correctLocation`, so it reaches every proxied `/v1/forecast`
response and therefore the whole dashboard. Inside the MOS domain the ERA5-trained
correction is not applied at all: the two never stack.

Guards:

- only inside the sampled box (34.78–36.87 N, 71.51–76.57 E) and 1,362–4,669 m
- never within 15 km of a station where the raw model already verified within 2.6 °C
  (four such stations; correcting them made them worse in testing)
- a height-band cell needs at least 3 stations and 400 station hours
- no single adjustment beyond ±6 °C
- `NIGRAAN_MOS=0` switches it off

Endpoints: `GET /api/mos/status`, `GET /api/mos/point?lat=&lon=&elev=`. Also in
`/api/checks` as `mountainCorrection`.

Limits: one year of record, so month terms rest on one cycle each; about 1.6 °C of the
gap is a station-height error and the rest is unattributed (model cold bias or warm
sensors); temperature only — rain is not corrected because 17 of 46 gauges are broken.

Two related fixes: the anomaly climatology and the seasonal scoring archive calls now
send the unit elevation, like every other call, so all baselines sit at the same height.

## Added since v91.17.30 (see `audit/TODO_REGISTER.md` for the measured evidence)

- `/api/limits/evaluate` (POST), `/vars`, `/ledger`, `/ledger/verify` (POST, loopback or signed), `/catchment` — v91.17.26–30.
- `/api/glof/upstream`, `/map`, `/lake`, `/bulletins`, `/refresh` (POST, loopback or signed) — v91.17.31.
- `/api/imerg/status`, `/verification`, `/run` (POST, loopback or signed) — v91.17.32. The Earthdata token lives in
  `earthdata.key` (or `earthdata.key.txt`) beside `mach.key`; only its JWT part is read, it is sent only to NASA hosts,
  and `/api/imerg/status` reports presence and expiry only.
- Every `/api` route refuses a cross-site request (`Sec-Fetch-Site` or a foreign `Origin`), not only `/px` — v91.17.34.
- Coordinates must be present, numeric and inside 20–40 N, 58–82 E; `day` and `i` indexes must be integers in range — v91.17.34.
- The version served by `/health` and the API envelope is `package.json`'s — v91.17.34.
- `/api/fleet/history` (summary; `?station=<key|WU id>` the full record; `?city=OPIS` the season × local-hour fleet-minus-airport
  table; PUT reloads), `/api/fleet/uhi-check` (the urban heat model against the fleet night maximum at the Islamabad-Rawalpindi
  points) — v91.17.63. Read from `data/fleet-history-skill.json`, written by `LEARN_FLEET.bat` (station-lake `mach_history_coords.py`,
  `mach_history_ingest.py`, `mach_sheets_pull.py`, `mach_history_pair.py`). Tier B, diagnostic: no registry weight, no grade gate.
- `/api/fleet/urban` (no coordinates: the city tables and rule; `?lat&lon[&elev&at]`: the fleet urban term at a point) — v91.17.64.
  The served hourly temperature, apparent temperature and daily extremes at built cells in Islamabad-Rawalpindi and Karachi
  carry the fleet's season × local-hour residual (reversed) — or the fleet-minus-airport offset where the synop correction is
  already on the point — scaled by the cell's heat-island potential within [0.5, 1.2]; nothing within 3 km of an airport
  reference. Envelope: `agn_bias_correction.urban`. `/api/urban/point` carries the same term and the fleet check as `fleet`.
- `/api/glof/events` (the documented outburst record, HMAGLOFDB joined to the register; `?lake=<id>` one lake; `/api/glof/lake?id=`
  carries `documentedEvents`), `/api/landslide/giri[?unit=]` (GIRI / UNEP-GRID landslide susceptibility per tehsil with the
  NASA-catalogue check) — v91.17.64. Neither changes a tier or a class.
- `/api/pool/hazard?lat&lon[&elev&mm]` — v91.17.65. Per hour for 72 h P(≥ 0.1 / 1 / 5 mm) and P50/P90 from the two ensembles
  (equal system weight); per day P(R24 ≥ 1…100 mm) with the served single-run total beside it; `mm=` adds the trigger
  probability and verdict per day (single run / ensemble watch / supported / below on both); `temperature` carries the
  nine-model P10/P50/P90 per hour for the client dissent flag. 20-minute cache per point. The client module `AGN.prob`
  (build/prob_ui.html) reads it for the hourly strip and the landslide / flood driver notes.
- `/api/case/*` — v91.17.66, the casebook. `PUT /project` stores a schema-3 project document by manifest id (`GET /project[?id=]` lists or
- `/api/case/document` (v91.17.67) also carries `riskCards` — seven cards in one shape (served weather +24 h, heavy-rain probability day 1, urban heat term, hot-season baseline, landslide susceptibility, GLOF record, the asset record), each with evidence class, validation verdict, source, method, limitation and drill routes; a source that did not answer is a card with `value: null` and the reason — and `history`. `GET /api/case/portfolio?project=` gives one row per asset from its own case document with flags against fixed thresholds (not a ranking). `GET /api/case/families` declares the five report families; `caseEsg` and `caseFinancial` are gated with the inputs that unlock them. The client routes (`build/casereport_ui.html`) print them: caseAsset, casePortfolio, caseBoard, caseEsg, caseFinancial; the standard risk card follows the decision summary on every single-asset route.
  returns it); `GET /asset?project&asset` the asset with a provenance class on every chain field; `PUT /asset/fields` records
  values with their class (verified / client_supplied / estimated / missing — the platform never writes estimated);
  `/interventions` (GET, POST, PUT, DELETE) the adaptation tracker with risk-before / risk-after as declared classes and a
  status history; `GET /document?project&asset` the case document (the chain plus the confidence panel); `POST /snapshot`,
  `GET /history` for year-to-year change. Writes need loopback or a signed ops identity. Collections projects, assetFields,
  interventions, caseSnapshots in the JSON store.
- v91.17.68 (the end-to-end audit): the pool feed's `hourly[].pRain` is the share of members above the frequency-matched
  wet-hour threshold τ for the point's group (`rainCalibration` on the feed names the group, τ, the gauges and the POD/FAR after
  matching; null with `why` when `data/ens-wet-reliability.json` is absent), `pWet` stays the raw trace share; `now` and `leadH`
  are relative to the current hour; day totals on Asia/Karachi days (`dayBasis`). `GET /api/verification/wet-hours` serves the
  gauge check (404 with why until `LEARN_NIGRAAN.bat rainprob` has run). `/api/idf` returns `{withheld:true, why}` — the curves are
  withdrawn until a station passes the completeness rule. The snow-load and the two percentages (confidence, model agreement)
  are withheld the same way. Job-starting, fleet-poll, limits-evaluate and every reload route need loopback or a signed ops /
  admin identity. `alignBatch` pairs a multi-location reply to its units by nearest coordinate on any model grid.
