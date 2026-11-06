/* ══════════════════════════════════════════════════════════════════════════
   URBAN HEAT ISLAND — a field, not three hand-typed points.

   What was here before, in the browser: three PROFILES objects — F-7, I-8
   Markaz and Raja Bazaar — each with its impervious fraction, NDVI, building
   fraction, road fraction and anthropogenic heat index typed in by hand and
   labelled 'provisional_expert_demonstration'. Anywhere else in Pakistan the
   morphology fell back to the tehsil mean, which is one number for a whole
   tehsil and therefore cannot separate I-8 from H-8, or Karachi Saddar from
   DHA, which is the only question anyone asks of an urban heat layer.

   This replaces those three points with measured fields over the whole
   country, at about 270 m:

     built surface fraction   GHS-BUILT-S E2025 (GHSL R2023A, 3 arc-second),
                              aggregated 3x3
     mean building height     GHS-BUILT-V / GHS-BUILT-S, same release
     population density       GHS-POP E2025, 30 arc-second
     NDVI                     MODIS Terra L3 monthly, 1 km, via NASA GIBS
     local climate zone       WUDAPT v1 100 m (Demuzere et al. 2022), already
                              shipped with this build, 1 km grid

   1,401,708 cells carry all four GHSL/MODIS fields. Nothing below 5% built
   surface is carried: there is no urban canopy to describe below that.

   ── THE MODEL ───────────────────────────────────────────────────────────
   Canopy-layer heat island, computed from canyon geometry and modulated by
   weather, time of day and vegetation. Every relation is published and named;
   nothing here is a coefficient chosen to make a curve behave.

   1. Geometric index of the cell, for a regular array of square buildings of
      side D at plan fraction L and height H, the street width is
      W = D(1-sqrt(L))/sqrt(L), so

          H/W = (H/D) * sqrt(L)/(1-sqrt(L))     and     g = H*sqrt(L)/(1-sqrt(L))

      g is H/W up to the unknown footprint size D.

   2. D cannot be measured from GHSL, and fitting one national D against the
      Stewart & Oke class values gave an SVF RMSE of 0.21 and a correlation of
      0.40 — measured, and not good enough to publish as geometry. Letting D
      scale with height (D = 0.75*H^1.65) improved RMSE to 0.155 and the
      correlation not at all. The honest reading is that the LCZ class knows
      something about building spacing that lambda and H cannot recover.

      So the class supplies the anchor and GHSL supplies the variation WITHIN
      the class:

          H/W(cell) = AR(LCZ class) * clamp( g(cell) / g_median(class), 0.4, 2.5 )

      By construction the class median is preserved, so this introduces no
      bias against Stewart & Oke; it only resolves the cell-to-cell
      differences the class label cannot. Cells with no LCZ coverage fall back
      to the fitted D(H) geometry and say so in `tier`.

   3. Sky view factor, mean over a two-dimensional canyon floor:

          psi = sqrt(1 + (H/W)^2) - H/W

      Checked against the Stewart & Oke class ranges: H/W 1.25 gives 0.35
      (LCZ 3 range 0.2-0.4), H/W 0.5 gives 0.62 and H/W 0.3 gives 0.74
      (LCZ 6 range 0.6-0.9).

   4. Maximum nocturnal heat island, Oke (1981):

          dT_max = 7.45 + 3.97 * ln(H/W)          [K]

      It falls to zero near H/W = 0.15, which is the open-country limit, so no
      artificial rural reference is needed. Oke states it for 0.2 <= H/W <= 4;
      outside that the result is returned with `beyondFittedRange`.

   5. Weather factor, Oke (1998) / Runnalls & Oke (2000). The heat island is a
      calm, clear-night phenomenon and collapses under wind and cloud:

          phi_w = (1 - 0.68 * n^2) / sqrt(U)      n = cloud fraction, U = m/s

      normalised to 1 at n = 0, U = 1 m/s, and capped there.

   6. Vegetation. Fractional vegetation cover from NDVI, Carlson & Ripley
      (1997):

          Fv = ((NDVI - 0.15) / (0.85 - 0.15))^2   clamped to 0..1

      and the heat island is reduced by VEG_COOLING * Fv. VEG_COOLING is a
      DECLARED coefficient (value and fleet review in data/urban-heat-model.json
      vegetation.coolingCoefficient), not a measured one for Pakistan.

   7. Time of day. MEASURED, not assumed. v91.17.13 remeasured this on a
      longer record and on a SECOND city, and both the diurnal curve and the
      calibration constant moved. What follows is the current measurement;
      what it replaced is recorded in note 7d so the change is not silent.

      PAIR A - Rawalpindi. OPRN, the old Chaklala airfield inside
      Rawalpindi's built-up area (33.6166 N, 73.0992 E, 508 m), against
      OPIS, Islamabad International, 25 km west in open country
      (33.5491 N, 72.8256 E, 541 m). 18,092 concurrent hours, May 2018 to
      August 2025. OPRN comes from NCEI ISD (USAF 415710), OPIS from the
      Iowa State IEM ASOS archive; OPRN stopped reaching IEM in January
      2022, which is why the earlier measurement ended there and this one
      does not. Hourly mean of OPRN minus OPIS, binned on hours from local
      sunset:

        -8 h  -0.35 K      the urban COOL island of the late morning
        -5 h  -0.31
        -1 h  +0.64
         0 h  +1.55
        +2 h  +2.49        the maximum (standard error 0.06 K, n = 703)
        +5 h  +1.83
        +8 h  +1.43
       +11 h  +1.08

      Canonical canopy-layer shape: negative by day, sharply positive after
      sunset, decaying through the night. The maximum is two hours after
      sunset. This curve is used directly, interpolated.

      A fixed site offset would be flat across the day. A signal that is
      +2.5 K after sunset and -0.35 K in the late morning is a heat island,
      not an instrument difference.

      PAIR B - Lahore. OPLH, the Lahore City observatory (31.550 N,
      74.333 E, 214 m, NCEI USAF 416400), against OPLA, Allama Iqbal
      International, 7.4 km east (31.5216 N, 74.4036 E, 217 m, IEM).
      31,463 concurrent hours, January 2018 to August 2025. Maximum
      +1.18 K (standard error 0.03 K) at ELEVEN hours after sunset - around
      dawn - with the afternoon at +0.01 to +0.16 K.

      The two pairs AGREE on sign and on the day/night split, and DISAGREE
      on when the night maximum falls: Rawalpindi two hours after sunset,
      Lahore at dawn. Both are documented canopy-layer shapes - the first is
      the rural site out-cooling the city immediately, the second is the
      difference accumulating all night. They are NOT averaged. Averaging
      two genuinely different shapes would produce a curve that describes
      neither. The shipped curve is Pair A's, and the diurnal TIMING is
      therefore a one-city result with a known counter-example in the other.

   7a. Cross-network check, because each pair mixes NCEI with IEM. OPLA is
      the one station present in both archives: 499 common hours, NCEI minus
      IEM mean -0.18 K, median 0.00 K, 5th-95th percentile -0.50 to 0.00 K.
      The difference is rounding, not calibration. That bounds the
      cross-network confound at about 0.2 K, well below either pair's
      signal. OPRN is also in both for 2018-2021: 6,795 common hours, mean
      -0.04 K, median 0.00 K.

   7b. Weather factor. Oke (1998) says the heat island collapses under wind:
      phi_w = (1 - 0.68 n^2)/sqrt(U). It is COMPUTED AND REPORTED HERE BUT
      NOT APPLIED, because the only Pakistani data available contradicts it.
      Pair A, nights 21:00-04:00, binned by wind speed:

        0.0-1.5 m/s   n=687   +1.17 K
        1.5-3.0 m/s   n=447   +1.81 K
        3.0-5.0 m/s   n=289   +1.84 K
        5.0-20  m/s   n=227   +1.73 K

      The calmest nights show the SMALLEST anomaly, which is the opposite of
      the relation. The likely reason is confounding rather than physics -
      calm nights here are winter nights, and winter nights in this pair run
      lower (January +0.85 K) than monsoon nights (July-September +1.71 K) -
      but a relation that cannot be demonstrated in the only data that exists
      is not applied to a published number.

   7c. Calibration, on TWO pairs. The model is run at each of the four
      stations and the predicted pair difference compared with the observed
      maximum. Predictions are vegetation-adjusted and UNCALIBRATED, so the
      constant is what closes the gap:

        pair              H/W urban  H/W rural   predicted   observed
        A  Rawalpindi       0.472      0.080       4.209       2.490
        B  Lahore           0.479      0.241       2.525       1.181

      Least squares through the origin over both pairs gives
      CALIBRATION = 0.559, applied to every cell.

        constant            residual A   residual B    rms
        0.689 (v91.17.12)     +0.41 K      +0.56 K    0.49 K
        0.592 (pair A only)    0.00        +0.31      0.22
        0.559 (both pairs)    -0.14        +0.23      0.19

      Two pairs in two cities, 49,555 hours. The constant is no longer a
      single point. It is still two points, both at an aspect ratio near
      0.47, so the extrapolation to a compact city core at 1.8-2.5 is
      unchanged and still declared on every response.

   7c-i. Which OPLH coordinate. ISD gives Lahore City as 31.550/74.333 and
      also attaches the ICAO code OPLH, which belongs to Walton aerodrome at
      31.5247/74.3479, 2.8 km away. The two land in very different cells:
      Walton is LCZ 3, 40.6% built, H/W 2.50, predicted pair difference
      8.88 K against an observed 1.18 K; the ISD coordinate is LCZ 6, 12.3%
      built, H/W 0.479, predicted 2.53 K. The observation rules Walton out
      by a factor of seven, so the ISD coordinate is used. This test exists
      because a rounded coordinate for OPST Sialkot had previously landed
      inside the city and produced a false 10.06 K reading.

   7c-ii. No third pair. Karachi would be the natural one - Jinnah
      International against Masroor - but NCEI holds 196 to 529 bytes per
      year for Masroor (USAF 417810), i.e. no usable record, and it is not
      in IEM. Every other Pakistani station in the 103-station ISD list is
      an airport with no urban counterpart within useful distance.

   7d. WHAT THIS REPLACED, recorded rather than quietly corrected.
      v91.17.12 shipped CALIBRATION = 0.689 and a diurnal curve peaking one
      hour after sunset at 2.90 K, both from Pair A over 5,080 hours,
      2018-2021 only. The longer record for the same pair gives a maximum of
      2.490 K at +2 h, not 2.90 K at +1 h. The old numbers were not wrong
      for the window they were measured on; they were measured on a quarter
      of the data now available. Everything the old constant fed - the
      national values, the map ramp, the external comparison in EXTERNAL_CHECK
      - moves down by a factor of 0.559/0.689 = 0.811.

      One near-miss is worth recording because it nearly went the other way.
      The script that produced the first version of this remeasurement had a
      broken sunset routine, twelve hours out, and it reported that Pair A
      peaks TEN HOURS BEFORE sunset and goes negative at night - a flat
      contradiction of the shipped curve. Checked against known sunset times
      for four Pakistani cities the routine was off by 12 h; corrected, the
      same data reproduces the night-peaking shape. The module's own
      sunHours was then validated the same way and is accurate to -19 to
      +10 minutes across the year, which is inside the one-hour binning.

   8. Anthropogenic heat is REPORTED, NOT ADDED. Oke's regression was fitted
      to observed heat islands in real cities, which already contained
      anthropogenic heat, so adding a separate term would count it twice.
      Q_F = population density * 550 W per person / 1e6, where 550 W is
      Pakistan's primary energy use per capita: 414.95 kg of oil equivalent
      per person in 2023 (World Bank / IEA), at 41.868 MJ per kg oe, over
      31.5576e6 s in a year.

   ── WHAT THIS IS NOT ────────────────────────────────────────────────────
   Not validated against a Pakistani station. Oke's coefficients come from
   mid-latitude cities. Until a station pair in a Pakistani city has been
   scored against this, the number is a physically-derived susceptibility in
   kelvin, and every response says so.

   ── v91.17.78 · U · TOWN SIZE, CLAMPS, CONSTANTS ────────────────────────
   All constants moved to data/urban-heat-model.json with source and status.
   Town size: x f(P) = (2.01 log10 P - 4.06)/(2.01 log10 Pref - 4.06), Oke
   (1973) European line, P = people on the cell's town patch, Pref = the
   Islamabad-Rawalpindi patch (4.73 M) where 15 of the 18 scored points sit.
   Skardu's patch (87,000) gets 0.63, Gilgit's (73,000) 0.61, Karachi's 1.12.
   Clamps reviewed (both kept, see classScale.clamp.basis): the fleet supports
   an upper bound and cannot test the lower one, which guards cells where GHSL
   under-detects earthen roofs inside WUDAPT-compact areas (Skardu). Vegetation
   coefficient 0.40 stays declared: the fleet has no leverage on it. C 0.349.
   [measured] leave-one-out over the 18 points: MAE 1.03 -> 1.03 K, Spearman
   0.13 -> 0.15: the scored points span three town sizes only, so the fleet
   checks the town term (no worse) but cannot fit it. Karachi: coastal label,
   no factor (the fleet there is referenced to an urban airport).         */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* v91.17.78 · U · EVERY CONSTANT OF THE MODEL NOW LIVES IN data/urban-heat-model.json, each with its source and status
   (published / measured / fitted / declared). What used to be typed here - the Stewart & Oke class table, Oke (1981)
   coefficients, the class-scale clamp, the footprint fallback, the vegetation coefficient and NDVI end points, the calibration,
   the diurnal curve and the per-capita energy - is read from that file at start. Without the file the module is not ready
   (it says so); it does not fall back to numbers of its own. New in v78: the town-size term (Oke 1973) and the coastal term.
   The values are held per instance (inside createUrbanHeat). */

/* ══ v91.17.13 · AN INDEPENDENT CHECK, AND WHAT MOVED ══════════════════
   Published work on five large Pakistani cities, MODIS land surface
   temperature 2001-2022 (Theoretical and Applied Climatology, 2024,
   doi:10.1007/s00704-024-04959-x) reports a city-to-outskirts difference of
   4.1-5.0 C at night and 2.9-4.1 C by day.

   MEASURED on this build, 574 units, 630,784 cells: the twelve densest units
   come out at 4.03 to 5.13 C population-weighted - Liaqatabad Town 5.13,
   Liyari 4.81, Peshawar Town-I 4.66, North Nazimabad 4.58, Lahore Cantt 4.30,
   Rawalpindi 4.26 - and single cells reach 6.2 to 6.7. Across all 574 units
   the population-weighted median is 1.80 C and the 99th percentile 4.33 C.

   That now sits ON the published night range rather than above it. Under
   v91.17.12's CALIBRATION = 0.689 the same units read 5.2 to 6.3 C, roughly
   a fifth to a third high. The constant was not tuned to this paper. It was
   refitted on two ground station pairs (note 7c), the value fell from 0.689
   to 0.559 for reasons entirely independent of MODIS, and the agreement with
   an independent satellite study is the consequence rather than the target.
   That is the useful kind of corroboration and it is recorded as such.

   It is still not an exact comparison, in both directions: those are SURFACE
   temperatures from satellite, which at night usually run at or a little
   above the canopy-layer air difference this model is about, and they are
   whole-city means against per-cell and population-weighted values here. The
   agreement should not be read as better than about a kelvin.

   The extrapolation this model declares is unchanged: both calibration pairs
   sit at an aspect ratio near 0.47 and a compact city core is at 1.8 to 2.5,
   so Oke's logarithmic relation is still carried a long way past its tie
   points. Trust the ranking and the differences before the kelvin value. */
const EXTERNAL_CHECK = {
  source: 'MODIS land surface temperature, five large Pakistani cities, 2001-2022 (Theoretical and Applied Climatology 2024, doi:10.1007/s00704-024-04959-x)',
  publishedNightC: '4.1 to 5.0', publishedDayC: '2.9 to 4.1',
  thisModelDensestUnitsC: '4.03 to 5.13 population-weighted over the twelve densest units; single cells reach 6.2 to 6.7; national population-weighted median 1.80',
  reading: 'this model now sits on the published night range. It sat a fifth to a third above it under v91.17.12, and came down because the calibration constant was refitted on a second ground station pair and a longer record - not to match this paper. The comparison is still inexact in both directions: satellite surface temperature against canopy-layer air, whole-city means against per-cell values, so do not read the agreement as better than about a kelvin.',
  notCorrected: 'no adjustment applied to match this source; the constant comes from station pairs alone (notes 7c, 7d).',
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createUrbanHeat(app, dataDir, over = null) {
  /* v91.17.78 · U · the model constants, from data/urban-heat-model.json (`over` replaces parts of it: analysis scripts only) */
  let LCZ_UCP = {}, W_PER_CAPITA = null, CALIBRATION = null, DIURNAL = [[0, 1]], VEG_COOLING = null, NDVI_BARE = null, NDVI_FULL = null;
  let D_A = null, D_B = null, D_MIN = null, D_MAX = null, SCALE_LO = null, SCALE_HI = null, HW_LO = null, HW_HI = null, OKE_A = null, OKE_B = null;
  let TOWN_SLOPE = null, TOWN_INTERCEPT = null, TOWN_PREF = null, TOWN_ON = false, COAST = null, MODEL = null;
  let modelError = null;
  try {
    const f = join(dataDir, 'urban-heat-model.json');
    MODEL = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
    if (MODEL && over) for (const k of Object.keys(over)) MODEL[k] = (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && MODEL[k] && typeof MODEL[k] === 'object') ? { ...MODEL[k], ...over[k] } : over[k];
    if (!MODEL) throw new Error('data/urban-heat-model.json is missing');
    const M = MODEL, num = (v, what) => { if (!Number.isFinite(Number(v))) throw new Error('urban-heat-model.json: ' + what + ' is not a number'); return Number(v); };
    LCZ_UCP = {}; for (const [k, v] of Object.entries(M.lczCanopy.classes)) LCZ_UCP[k] = { svf: num(v.svf, 'svf'), ar: num(v.ar, 'ar'), name: v.name };
    OKE_A = num(M.canyon.a, 'canyon.a'); OKE_B = num(M.canyon.b, 'canyon.b');
    HW_LO = num(M.canyon.aspectRatioBounds.value[0], 'H/W bound'); HW_HI = num(M.canyon.aspectRatioBounds.value[1], 'H/W bound');
    SCALE_LO = M.classScale.clamp.value == null ? -Infinity : num(M.classScale.clamp.value[0], 'class-scale clamp');
    SCALE_HI = M.classScale.clamp.value == null ? Infinity : num(M.classScale.clamp.value[1], 'class-scale clamp');
    D_A = num(M.footprintFallback.a, 'footprint a'); D_B = num(M.footprintFallback.b, 'footprint b');
    D_MIN = num(M.footprintFallback.boundsM.value[0], 'footprint bound'); D_MAX = num(M.footprintFallback.boundsM.value[1], 'footprint bound');
    VEG_COOLING = num(M.vegetation.coolingCoefficient.value, 'vegetation.coolingCoefficient');
    NDVI_BARE = num(M.vegetation.ndviBare.value, 'ndviBare'); NDVI_FULL = num(M.vegetation.ndviFull.value, 'ndviFull');
    CALIBRATION = num(M.calibration.value, 'calibration.value');
    DIURNAL = M.diurnal.curve.map((r) => [num(r[0], 'diurnal'), num(r[1], 'diurnal')]);
    W_PER_CAPITA = num(M.anthropogenic.wattsPerCapita.value, 'wattsPerCapita');
    TOWN_ON = !!M.townSize.applied;
    TOWN_SLOPE = num(M.townSize.slope, 'townSize.slope'); TOWN_INTERCEPT = num(M.townSize.intercept, 'townSize.intercept');
    TOWN_PREF = num(M.townSize.referencePopulation.value, 'townSize.referencePopulation');
    COAST = M.coastal ? { applied: !!M.coastal.applied, factor: M.coastal.applied ? num(M.coastal.factor.value, 'coastal.factor') : 1,
      towns: (M.coastal.towns || []).map((t) => ({ name: t.name, lat: num(t.lat, 'coastal lat'), lon: num(t.lon, 'coastal lon') })) } : null;
  } catch (e) { MODEL = null; modelError = 'model constants: ' + e.message; }
  /* v91.17.72 · URBAN = DENSE ENOUGH TO BE A TOWN. A built cell below the DEGURBA urban-centre density (data/urban-mask.json)
     is a village or dispersed rural settlement: it gets no heat island and the map leaves it unfilled. Measured on the CEO's
     own screen in Gilgit: rural GB and KP hamlets were painted 0.6-2 C "urban heat" at tonight's maximum. */
  let UMASK = { rule: { populationPerKm2Min: 1500 }, reasonRural: 'low-density area: no urban heat island' };
  try { const f = join(dataDir, 'urban-mask.json'); if (existsSync(f)) UMASK = JSON.parse(readFileSync(f, 'utf8')); } catch (_) {}
  const denseCell = (cell) => !!cell && (cell.populationPerKm2 || 0) >= ((UMASK.rule && UMASK.rule.populationPerKm2Min) || 0);
  /* v91.17.77 · G · A TOWN IS A PATCH, NOT A CELL; AND THE LAYER STOPS AT THE LINE OF CONTROL (data/urban-heat-map.json).
     [measured] the per-cell density test passed hamlets (GHS-POP puts a village's people on its few built cells), 88 of 94
     dense patches in GB held < 5,000 people, and 17,995 passing cells lay in IIOJK. A dense cell is urban only when its
     contiguous dense patch holds the DEGURBA urban-cluster population (cluster.populationMin); cells of the IIOJK unit or of
     no tehsil are never drawn or counted. TOWN[p]: 1 town, 0 not dense, 2 dense but a small settlement; built at load. */
  let UHM = null;
  try { const f = join(dataDir, 'urban-heat-map.json'); if (existsSync(f)) UHM = JSON.parse(readFileSync(f, 'utf8')); } catch (_) { UHM = null; }
  let TOWN = null, OUTSIDE = null, CLUSTERS = 0, LAB = null, CLPOP = null, CLCOAST = null;
  const isUrbanCell = (cell) => { if (!denseCell(cell)) return false; if (TOWN && cell && cell.__p != null) return TOWN[cell.__p] === 1; return true; };
  const smallSettlement = (cell) => !!(TOWN && cell && cell.__p != null && TOWN[cell.__p] === 2);
  const outsideAdministered = (p) => !!(OUTSIDE && OUTSIDE[p] === 1);
  /* ══ v91.17.283.2 · WITHHELD WHERE THE ONE MOUNTAIN-VALLEY TEST FAILED (data/urban-heat-model.json withheld) ══════════════════
     MACH 105 Gilgit minus MACH 108 Khomar after sunset read +1.47 C [1.18, 1.82] (9-20 Oct 2026); the layer gives -0.87 C, the
     wrong sign. No code defect was found (no inverted difference, no unit error): the GHSL geometry and the local climate zone
     disagree at both cells (class-scale clamp hit at both ends) and both calibration pairs are plains cities. So the layer is not
     served in the administrative mountain zone of data/model-zone.json (Gilgit-Baltistan and Chitral tehsils): the point answer
     says why, and the map cells, the tehsil roll-up and the spread leave those cells out. */
  const WH = (MODEL && MODEL.withheld && MODEL.withheld.applied) ? MODEL.withheld : null;
  const whUid = (uid) => { if (!WH || uid == null) return false; const [pr, di] = String(uid).split('|');
    return ((WH.units && WH.units.provinces) || []).includes(pr) || ((WH.units && WH.units.districts) || []).includes(di); };
  /* ══ v91.17.283.3 · C12 · THE CELL MAP IS WITHHELD EVERYWHERE (science decision; data/urban-heat-c12.json) ═══════════════════════════════
     Rule: nothing is served unless it beats the current value on held-out data. In the plains cities too the cell map has no skill: Karachi
     and Lahore, 11 independent stations, evening urban minus rural, Spearman 0.005 [-0.83, 0.61]; its error is worse than assuming no
     difference (1.20 vs 0.76 C, paired difference [+0.03, +0.87]). So the urban-heat cell map, the point heat-island figure, the 12-km
     spread and the tehsil roll-up are withheld in all of Pakistan with the stated reason (the v91.17.283.2 mountain withholding is now a
     part of it). No city-level heat-island figure is served either: none has been tested. The morphology facts of a cell (built fraction,
     height, vegetation) are measurements and are not withheld by the point answer's reason. The file's `applied: false` releases it. */
  const NW = (over && over.nationalWithheld === false) ? null : (() => { try { const j = JSON.parse(readFileSync(join(dataDir, 'urban-heat-c12.json'), 'utf8')); return j && j.applied ? j : null; } catch (_) { return null; } })();
  const nationalWithheld = () => NW ? { withheld: true, assessed: false, why: NW.reason, withheldBasis: { scope: 'all of Pakistan', reason: NW.reason, evidence: NW.evidence, releaseWhen: NW.releaseWhen, source: 'data/urban-heat-c12.json' } } : null;
  let WHU = null;   /* per unit index of UIDS: 1 withheld; built on first use */
  const withheldCell = (p) => { if (!WH || !UNIT || !UIDS || p == null) return false; if (!WHU) WHU = Uint8Array.from(UIDS.map((u) => whUid(u) ? 1 : 0)); const u = UNIT[p]; return u >= 0 && WHU[u] === 1; };
  const withheldInfo = () => WH ? { zone: WH.zone, units: WH.units, reason: WH.reason, cause: WH.cause, evidence: WH.evidence, releaseWhen: WH.releaseWhen, source: 'data/urban-heat-model.json withheld' } : null;
  let IDX = null, F16 = null, META = null, GMED = null, LCZ = null, loadError = null, UNIT = null, UIDS = null, TREE = null, TREEMETA = null, BLD = null, BLDMETA = null;
  const treeAt = (p) => (TREE && TREE[p] >= 0) ? TREE[p] / 1000 : null;
  const bldAt = (p) => (BLD && BLD[p * 2] >= 0) ? { buildingCount: BLD[p * 2], footprintFraction: BLD[p * 2 + 1] / 1000 } : null;
  try {
    const mp = join(dataDir, 'urban.meta.json');
    if (existsSync(mp)) {
      META = JSON.parse(readFileSync(mp, 'utf8'));
      const ib = readFileSync(join(dataDir, 'urban.idx'));
      IDX = new Int32Array(ib.buffer, ib.byteOffset, ib.byteLength / 4);
      const fb = readFileSync(join(dataDir, 'urban.f16'));
      F16 = new Int16Array(fb.buffer, fb.byteOffset, fb.byteLength / 2);
      /* v91.17.37 · C · tree canopy fraction per cell from the Meta/WRI 1 m canopy height map
         (station-lake/scripts/urban_canopy.py), -1 where not sampled. Where present it replaces the
         1 km MODIS NDVI as the vegetation term: a park and the blocks around it stop sharing one number. */
      /* v91.17.37 · E · building footprints per cell from Google Open Buildings v3 (station-lake/scripts/buildings.py):
         count and footprint fraction, an exposure figure that stays OUT of the heat-island physics */
      try { if (existsSync(join(dataDir, 'urban-buildings.f16'))) { const bb = readFileSync(join(dataDir, 'urban-buildings.f16')); const B = new Int16Array(bb.buffer, bb.byteOffset, bb.byteLength / 2); if (B.length === IDX.length * 2) { BLD = B; BLDMETA = JSON.parse(readFileSync(join(dataDir, 'urban-buildings.meta.json'), 'utf8')); } } } catch (_) { BLD = null; }
      try { if (existsSync(join(dataDir, 'urban-tree.f16'))) { const tb = readFileSync(join(dataDir, 'urban-tree.f16')); const T = new Int16Array(tb.buffer, tb.byteOffset, tb.byteLength / 2); if (T.length === IDX.length) { const tm = JSON.parse(readFileSync(join(dataDir, 'urban-tree.meta.json'), 'utf8')); if (tm.covered > 0) { TREE = T; TREEMETA = tm; } } } } catch (_) { TREE = null; }
      GMED = JSON.parse(readFileSync(join(dataDir, 'lcz_gindex.json'), 'utf8'));
      /* ══ v91.17.12 · THE GRID WAS NOT PAKISTAN ═══════════════════════════
         The GHSL extraction box runs 60-78 E and 23-37 N, which contains
         Afghanistan, eastern Iran and Indian Punjab as well. Measured: of
         1,401,708 cells, 770,924 were outside every Pakistani tehsil - 55% of
         the file, and a query near a border could have answered with a foreign
         cell. Clipped by point-in-polygon against the 577 tehsil boundaries
         this build already ships, leaving 630,784. Each cell now carries the
         tehsil that contains it, so a point answer can name its unit and a
         national roll-up needs no second pass. */
      try {
        const ub = readFileSync(join(dataDir, 'urban.unit'));
        UNIT = new Int16Array(ub.buffer, ub.byteOffset, ub.byteLength / 2);
        UIDS = JSON.parse(readFileSync(join(dataDir, 'urban-units.json'), 'utf8'));
      } catch (_) { UNIT = null; UIDS = null; }
    }
  } catch (e) { loadError = 'morphology grid: ' + e.message; }
  if (modelError) loadError = (loadError ? loadError + '; ' : '') + modelError;
  /* v91.17.77 · G · the town patches and the administered-area clip, once, at load (~0.3 s over 630,784 cells) */
  try {
    if (IDX && F16 && META) {
      const G = META.grid, n = IDX.length, dmin = (UMASK.rule && UMASK.rule.populationPerKm2Min) || 0;
      const pmin = UHM && UHM.cluster && UHM.cluster.populationMin != null ? Number(UHM.cluster.populationMin) : 0;
      const find = (k) => { let lo = 0, hi = n - 1; while (lo <= hi) { const m = (lo + hi) >> 1; const v = IDX[m]; if (v === k) return m; if (v < k) lo = m + 1; else hi = m - 1; } return -1; };
      const dense = new Uint8Array(n);
      for (let p = 0; p < n; p++) dense[p] = (F16[p * 4] > 0 && F16[p * 4 + 1] > 0 && F16[p * 4 + 2] * 10 >= dmin) ? 1 : 0;
      TOWN = new Uint8Array(n); const lab = new Int32Array(n).fill(-1), st = [], mem = [], pops = [];
      for (let p0 = 0; p0 < n; p0++) {
        if (!dense[p0] || lab[p0] >= 0) continue;
        st.length = 0; mem.length = 0; st.push(p0); lab[p0] = CLUSTERS; let pop = 0;
        while (st.length) {
          const p = st.pop(); mem.push(p);
          const k = IDX[p], r = Math.floor(k / G.cols), c = k % G.cols, lat = G.lat0 - (r + 0.5) * G.step;
          pop += F16[p * 4 + 2] * 10 * Math.pow(G.step * 111.32, 2) * Math.cos(lat * Math.PI / 180);
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue; const q = find((r + dr) * G.cols + (c + dc));
            if (q >= 0 && dense[q] && lab[q] < 0) { lab[q] = CLUSTERS; st.push(q); } }
        }
        const v = pop >= pmin ? 1 : 2; for (const p of mem) TOWN[p] = v; pops.push(pop); CLUSTERS++;
      }
      LAB = lab; CLPOP = Float64Array.from(pops);
      /* v91.17.78 · U · a coastal town is the patch that holds one of the coastal seed points of urban-heat-model.json */
      if (COAST) { CLCOAST = new Uint8Array(CLUSTERS);
        for (const t of COAST.towns) { const r = Math.round((G.lat0 - t.lat) / G.step - 0.5), c = Math.round((t.lon - G.lon0) / G.step - 0.5);
          let hitp = -1; for (let ring = 0; ring <= 6 && hitp < 0; ring++) for (let dr = -ring; dr <= ring && hitp < 0; dr++) for (let dc = -ring; dc <= ring; dc++) { const q = find((r + dr) * G.cols + (c + dc)); if (q >= 0 && lab[q] >= 0) { hitp = q; break; } }
          if (hitp >= 0) CLCOAST[lab[hitp]] = 1; } }
      const ex = UHM && UHM.clip && UHM.clip.excludeProvince;
      if (UNIT && UIDS) { OUTSIDE = new Uint8Array(n); const bad = UIDS.map((u) => !!ex && String(u).split('|')[0] === ex);
        for (let p = 0; p < n; p++) { const u = UNIT[p]; if (u < 0 || bad[u]) OUTSIDE[p] = 1; } }
    }
  } catch (e) { TOWN = null; OUTSIDE = null; loadError = (loadError ? loadError + '; ' : '') + 'town patches: ' + e.message; }
  try {
    const lp = join(dataDir, 'lcz-grid.json');
    if (existsSync(lp)) {
      const raw = JSON.parse(readFileSync(lp, 'utf8'));
      const g = raw.grid, bin = Buffer.from(g.data, 'base64');
      const map = new Map();
      let idx = 0, i = 0;
      while (i < bin.length) {
        let delta = 0, shift = 0, b;
        do { b = bin[i++]; delta |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
        idx += delta;
        const cls = bin[i++], pct = bin[i++];
        map.set(idx, (cls << 8) | pct);
      }
      LCZ = { meta: g, map, source: raw.lcz_source, ucp: raw.ucp_source };
    }
  } catch (e) { loadError = (loadError ? loadError + '; ' : '') + 'lcz grid: ' + e.message; }

  /* the tehsil boundaries, loaded lazily, so a point outside Pakistan is told
     that rather than being told it is not urban - two different statements. */
  let FEATS = null;
  function feats() {
    if (FEATS !== null) return FEATS;
    try {
      const fc = JSON.parse(readFileSync(join(dataDir, 'pk-tehsils.json'), 'utf8'));
      FEATS = fc.features.map((f) => {
        let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
        const walk = (c) => { if (typeof c[0] === 'number') { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; } else c.forEach(walk); };
        walk(f.geometry.coordinates);
        return { uid: f.properties.uid, tehsil: f.properties.tehsil, district: f.properties.district,
                 province: f.properties.province, bbox: [x0, y0, x1, y1],
                 polys: f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates };
      });
    } catch (_) { FEATS = []; }
    return FEATS;
  }
  function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function unitAt(lat, lon) {
    for (const f of feats()) {
      if (lon < f.bbox[0] || lon > f.bbox[2] || lat < f.bbox[1] || lat > f.bbox[3]) continue;
      for (const poly of f.polys) {
        if (!inRing(lon, lat, poly[0])) continue;
        let hole = false;
        for (let h = 1; h < poly.length; h++) if (inRing(lon, lat, poly[h])) { hole = true; break; }
        if (!hole) return f;
      }
    }
    return null;
  }

  const ready = () => !!(IDX && F16 && META && MODEL);
  const buildingsStatus = () => BLD ? { kept: BLDMETA ? BLDMETA.kept : null, source: BLDMETA ? BLDMETA.source : null } : { kept: 0, why: 'data/urban-buildings.f16 not present (station-lake/scripts/buildings.py)' };
  const canopyStatus = () => TREE ? { cells: TREEMETA ? TREEMETA.covered : null, source: TREEMETA ? TREEMETA.source : null, cities: TREEMETA ? Object.keys(TREEMETA.cities || {}) : [] } : { cells: 0, why: 'data/urban-tree.f16 not present (station-lake/scripts/urban_canopy.py)' };

  /* nearest carried cell within `radius` cells of the query point */
  function cellAt(lat, lon, radius = 4) {
    if (!ready()) return null;
    const G = META.grid;
    const r0 = Math.round((G.lat0 - lat) / G.step - 0.5);
    const c0 = Math.round((lon - G.lon0) / G.step - 0.5);
    const find = (k) => {
      let lo = 0, hi = IDX.length - 1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (IDX[m] === k) return m; if (IDX[m] < k) lo = m + 1; else hi = m - 1; }
      return -1;
    };
    for (let ring = 0; ring <= radius; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (ring > 0 && Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const p = find((r0 + dr) * G.cols + (c0 + dc));
          if (p < 0) continue;
          const o = p * 4;
          return Object.defineProperty({
            unitId: (UNIT && UIDS && UNIT[p] >= 0) ? UIDS[UNIT[p]] : null,
            builtFraction: F16[o] / 1000,
            meanBuildingHeightM: F16[o + 1] / 10,
            populationPerKm2: F16[o + 2] * 10,
            ndvi: F16[o + 3] === -9990 ? null : F16[o + 3] / 1000, treeFraction: treeAt(p), buildings: bldAt(p),
            cellLat: +(G.lat0 - ((r0 + dr) + 0.5) * G.step).toFixed(5),
            cellLon: +(G.lon0 + ((c0 + dc) + 0.5) * G.step).toFixed(5),
            offsetCells: ring,
            cellSizeM: Math.round(G.step * 111320),
          }, '__p', { value: p, enumerable: false });
        }
      }
    }
    return null;
  }

  function lczAt(lat, lon, radius = 2) {
    if (!LCZ) return null;
    const g = LCZ.meta;
    const r0 = Math.floor((g.lat0 - lat) / g.step), c0 = Math.floor((lon - g.lon0) / g.step);
    for (let ring = 0; ring <= radius; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (ring > 0 && Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const v = LCZ.map.get((r0 + dr) * g.colStride + (c0 + dc));
          if (v == null) continue;
          const cls = v >> 8;
          return { class: cls, name: (LCZ_UCP[cls] || {}).name || null,
                   builtPercent: v & 0xff, ucp: LCZ_UCP[cls] || null, offsetCells: ring };
        }
      }
    }
    return null;
  }

  /* the geometry: class-anchored, GHSL-modulated */
  function geometry(cell, lcz) {
    const L = clamp(cell.builtFraction, 0.001, 0.95), H = Math.max(0.5, cell.meanBuildingHeightM);
    const sl = Math.sqrt(L);
    const g = H * sl / (1 - sl);
    let hw, tier, scale = null, note;
    const gm = lcz && GMED && GMED[String(lcz.class)] ? GMED[String(lcz.class)].gMed : null;
    if (lcz && lcz.ucp && gm > 0) {
      scale = clamp(g / gm, SCALE_LO, SCALE_HI);
      hw = clamp(lcz.ucp.ar * scale, HW_LO, HW_HI);
      tier = 'lcz-anchored';
      note = `Stewart & Oke aspect ratio ${lcz.ucp.ar} for LCZ ${lcz.class} (${lcz.name}), scaled by ${scale.toFixed(2)} — this cell's geometric index ${g.toFixed(1)} against the Pakistan median ${gm.toFixed(1)} for that class`;
    } else {
      const D = clamp(D_A * Math.pow(H, D_B), D_MIN, D_MAX);
      hw = clamp(H * sl / (D * (1 - sl)), HW_LO, HW_HI);
      tier = 'geometry-only';
      note = `no local climate zone covers this cell, so the aspect ratio comes from the fitted footprint relation D = ${D_A}·H^${D_B} (${D.toFixed(0)} m here). Measured SVF error of that relation against Stewart & Oke class values: RMSE 0.155.`;
    }
    const svf = Math.sqrt(1 + hw * hw) - hw;
    return { geometricIndex: +g.toFixed(2), aspectRatio: +hw.toFixed(3), skyViewFactor: +svf.toFixed(3),
             classScale: scale == null ? null : +scale.toFixed(2), tier, note,
             beyondFittedRange: hw < MODEL.canyon.validRange[0] || hw > MODEL.canyon.validRange[1] };
  }

  /* v91.17.78 · U · THE ONE PLACE THE CELL VALUE IS MADE (point, spread, map cells and unit roll-up all call it).
       dT = canyon(H/W) x vegetation x town(P) x coast x CALIBRATION
     canyon: Oke (1981); town: Oke (1973) ratio on the population of the town patch the cell belongs to, 1 at the reference
     population; coast: the measured Karachi reduction for towns on the open sea. Constants: data/urban-heat-model.json. */
  function townOf(p) {
    if (!LAB || p == null || LAB[p] < 0) return null;
    const l = LAB[p]; return { patch: l, population: CLPOP[l], coastal: !!(CLCOAST && CLCOAST[l]) };
  }
  function townFactor(P) {
    if (!TOWN_ON || !(P > 0)) return 1;
    const ref = TOWN_SLOPE * Math.log10(TOWN_PREF) + TOWN_INTERCEPT;
    const cap = MODEL.townSize.maxFactor == null ? Infinity : Number(MODEL.townSize.maxFactor);
    return clamp((TOWN_SLOPE * Math.log10(P) + TOWN_INTERCEPT) / ref, 0, cap);
  }
  /* ══ v91.17.259 · D12 · THE SATELLITE URBAN TERM, WHERE IT PASSED (data/urban-heat-lst-model.json) ══════════════════════
     maxC = b1 dLSTnight + b2 dBuilt + b3 dlog10(pop), each the 250 m cell minus the city's rural reference cell, clamped to the
     training range, through the origin (the reference is 0), floored at 0 like the Oke value. Held out by leaving one site out
     against the paired-station night maxima (the served target): Karachi 6 stations vs Masroor, MAE 1.18 (Oke) -> 0.52 K, 90 %
     gain interval +0.16..+1.17; heatwave nights 23-30 Jun 2024 0.92 -> 0.27 K. Served only in serve.cities (Karachi); Islamabad
     (gain interval includes 0) and Lahore (no rural reference) keep the Oke value. pointTerms() (the fit script) is not changed. */
  let LST = null, LSTt = 0, LSTc = 0;
  function lstModel() { const now = Date.now(); if (now - LSTc < 60e3) return LST; LSTc = now;
    try { const f = join(dataDir, 'urban-heat-lst-model.json'); if (!existsSync(f)) return (LST = null); const t = statSync(f).mtimeMs; if (!LST || t !== LSTt) { LST = JSON.parse(readFileSync(f, 'utf8')); LSTt = t; } } catch (_) { LST = null; }
    return LST; }
  const kmTo = (a, b, c, d) => { const q = Math.PI / 180, x = 0.5 - Math.cos((c - a) * q) / 2 + Math.cos(a * q) * Math.cos(c * q) * (1 - Math.cos((d - b) * q)) / 2; return 12742 * Math.asin(Math.sqrt(x)); };
  function lstTerm(lat, lon) {
    if (lat == null || lon == null || process.env.NIGRAAN_UHI_LST === '0') return null; const M = lstModel(); const FG = app && app.featGrid; if (!M || !FG) return null;
    let best = null; for (const [city, r] of Object.entries(M.references || {})) { if (!(M.serve && M.serve.cities || []).includes(city)) continue; const d = kmTo(lat, lon, r.anchorLat, r.anchorLon); if (d <= M.domain.reachKm && (!best || d < best.d)) best = { city, r, d }; }
    if (!best) return null;
    const ln = ['djf', 'mam', 'jja', 'son'].map(s => FG.value('l_night_anom_' + s, lat, lon)), b = FG.value('s_built10', lat, lon), pp = FG.value('p_pop', lat, lon);
    if (ln.some(v => v == null) || b == null || pp == null) return null;
    const R = M.trainingRange, cl = (v, k) => Math.max(R[k][0], Math.min(R[k][1], v)), C = M.coefficients;
    const v = C.a + C.b_dLSTn * cl(ln.reduce((x, y) => x + y, 0) / 4 - best.r.lstn, 'dLSTn') + C.b_dBuilt * cl(b - best.r.built, 'dBuilt') + C.b_dLpop * cl(Math.log10(1 + pp) - best.r.lpop, 'dLpop');
    return { city: best.city, maxC: Math.max(0, v), version: M.name + ' ' + (M.built || '') };
  }
  function cellTerms(cell, lcz, p, lat = null, lon = null) {
    const geo = geometry(cell, lcz);
    const raw = Math.max(0, OKE_A + OKE_B * Math.log(geo.aspectRatio));
    const veg = vegetation(cell.ndvi, cell.treeFraction);
    const t = townOf(p);
    const town = t ? townFactor(t.population) : 1;
    const coast = (COAST && COAST.applied && t && t.coastal) ? COAST.factor : 1;
    const oke = raw * veg.factor * town * coast * CALIBRATION;
    let lst = null; try { lst = lstTerm(lat, lon); } catch (_) { lst = null; }
    return { geo, raw, veg, town, coast, townInfo: t, dT: lst ? lst.maxC : oke, okeC: oke, lst };
  }

  function weatherFactor(windMs, cloudFrac) {
    const U = Math.max(1, windMs == null ? 1 : windMs);
    const n = clamp(cloudFrac == null ? 0 : cloudFrac, 0, 1);
    return clamp((1 - 0.68 * n * n) / Math.sqrt(U), 0, 1);
  }

  /* the measured curve, linearly interpolated. Negative hours are before
     sunset, where the observed anomaly is NEGATIVE - the urban cool island. */
  function diurnalFactor(hoursFromSunset) {
    let t = hoursFromSunset;
    while (t < -12) t += 24;
    while (t > 12) t -= 24;
    if (t <= DIURNAL[0][0]) return DIURNAL[0][1];
    if (t >= DIURNAL[DIURNAL.length - 1][0]) return DIURNAL[DIURNAL.length - 1][1];
    for (let i = 0; i < DIURNAL.length - 1; i++) {
      const [a, va] = DIURNAL[i], [b, vb] = DIURNAL[i + 1];
      if (t >= a && t <= b) return va + (vb - va) * (t - a) / (b - a);
    }
    return 0;
  }
  /* local sunrise and sunset, so a caller can pass a timestamp instead of a
     phase. Standard solar declination and hour angle; minutes-level accuracy
     is ample for a curve binned by the hour. */
  function sunHours(lat, lon, date, tzOffsetH) {
    const n = Math.floor((date - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400e3);
    const dec = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + n) / 365);
    const x = clamp(-Math.tan(lat * Math.PI / 180) * Math.tan(dec), -1, 1);
    const H = Math.acos(x) * 180 / Math.PI / 15;
    const noon = 12 + (tzOffsetH * 15 - lon) / 15;
    return { sunrise: noon - H, sunset: noon + H, dayLengthH: 2 * H };
  }

  function vegetation(ndvi, tree = null) {
    if (tree != null) {
      /* measured canopy cover replaces the NDVI proxy; the cooling coefficient is the same declared one */
      return { fractionalCover: +tree.toFixed(3), factor: +(1 - VEG_COOLING * tree).toFixed(3), source: 'canopy',
        basis: `tree canopy cover ${(100 * tree).toFixed(0)}% (Meta/WRI 1 m canopy height map, 2020, sampled at the cell centre), cooling coefficient ${VEG_COOLING} (declared, not measured for Pakistan)` };
    }
    if (ndvi == null) return { fractionalCover: null, factor: 1,
      why: 'no NDVI for this cell (cloud or fill in the monthly composite), so no vegetation cooling is applied — this OVERSTATES the heat island where the cell is green' };
    const Fv = clamp(Math.pow((ndvi - NDVI_BARE) / (NDVI_FULL - NDVI_BARE), 2), 0, 1);
    return { fractionalCover: +Fv.toFixed(3), factor: +(1 - VEG_COOLING * Fv).toFixed(3),
      basis: `Carlson & Ripley (1997) fractional vegetation cover from NDVI ${ndvi.toFixed(2)}, cooling coefficient ${VEG_COOLING} (declared, not measured for Pakistan)` };
  }

  function estimate(lat, lon, opts = {}) {
    if (!ready()) return { ready: false, why: loadError || 'the urban morphology grid is not present in this build' };
    const cell = cellAt(lat, lon);
    if (!cell) {
      const u = unitAt(lat, lon);
      if (!u) return { ready: true, urban: false, inPakistan: false,
        why: 'this point is outside Pakistan. The morphology grid is clipped to the 577 tehsil boundaries this build holds, so nothing is described beyond them - that is a coverage limit, not a statement that the place is rural.' };
      /* ══ v91.17.12 · SILENCE HERE READS AS "NO URBAN HEAT IN THIS TEHSIL" ══
         MEASURED by querying all 577 units at their centroids: 224 of them came
         back urban:false. That is not because 39% of Pakistan has no towns. A
         tehsil centroid in Balochistan lands in open desert tens of kilometres
         from the settlement, so the 1 km cell search correctly finds nothing -
         and the caller was told nothing further, which a map click on Awaran or
         Kalat turns into a card with no urban adjustment and no explanation,
         while SEARCHING the same town by name returns 1.98 and 1.61 C.
         The point answer is unchanged and still refuses: no built surface here
         means no heat island here, and inventing one would be worse than the
         silence. What is added is the unit's own built area and how far away it
         is, so a caller can say which of the two questions it is answering. */
      let nearestBuilt = null;
      try {
        const nat = national();
        const row = nat && nat.units ? nat.units[u.uid] : null;
        const w = row && row.warmestCell;
        if (w && w.lat != null && w.lon != null) {
          const km = 111.19 * Math.hypot(w.lat - lat,
            (w.lon - lon) * Math.cos(((w.lat + lat) / 2) * Math.PI / 180));
          nearestBuilt = {
            km: +km.toFixed(1), lat: w.lat, lon: w.lon,
            deltaTmaxC: w.deltaTmaxC,
            unitPopWeightedC: row.popWeightedC,
            unitBuiltCells: row.cells,
            note: 'the warmest built cell in the same tehsil. It says the unit HAS an urban '
                + 'area; it is NOT an adjustment for the point that was asked about, which sits '
                + 'outside any built surface.',
          };
        }
      } catch (_) { /* the national pass is optional here; its absence must not fail a point */ }
      return { ready: true, urban: false, inPakistan: true,
        unit: { unitId: u.uid, tehsil: u.tehsil, district: u.district, province: u.province },
        nearestBuilt,
        why: 'no cell within about 1 km of this point carries 5% or more built surface, so there is no urban canopy here and no heat island to compute'
           + (nearestBuilt ? '. The nearest built area in this tehsil is ' + nearestBuilt.km
              + ' km away and carries ' + nearestBuilt.deltaTmaxC + ' C at its nocturnal maximum.' : '') };
    }
    if (outsideAdministered(cell.__p)) {   /* v91.17.77 · G · the disputed unit is described nowhere on the layer, and not here */
      const u = unitAt(lat, lon);
      return { ready: true, urban: false, inPakistan: false, administered: false,
        why: (UHM && UHM.clip && UHM.clip.reason) || 'outside Pakistan-administered territory: not described',
        unit: u ? { unitId: u.uid, tehsil: u.tehsil, district: u.district, province: u.province } : null };
    }
    /* v91.17.283.5 · opts.fleetTerm: the MACH fleet urban term (fleethistory.mjs, a measured Tier B correction of the served temperature)
       reads the cell's morphology class (built cell or not) and its own rank-gated scale through this call; C12 withholds the layer from
       being served, not the fleet's measured term, so that internal read is not withheld (the served temperature stays as it was) */
    if (NW && !opts.fleetTerm) { const u = unitAt(lat, lon); return { ready: true, urban: false, inPakistan: true, unit: u ? { unitId: u.uid, tehsil: u.tehsil, district: u.district, province: u.province } : null, ...nationalWithheld() }; }   /* C12 */
    if (!isUrbanCell(cell)) {   /* v91.17.72 · a village or rural cell: a statement, not a gap */
      const u = unitAt(lat, lon);
      if (smallSettlement(cell)) return { ready: true, urban: false, inPakistan: true, lowDensity: true, smallSettlement: true,
        unit: u ? { unitId: u.uid, tehsil: u.tehsil, district: u.district, province: u.province } : null,
        populationPerKm2: Math.round(cell.populationPerKm2 || 0), rule: { ...UMASK.rule, clusterPopulationMin: UHM.cluster.populationMin },
        why: UHM.cluster.reason || UMASK.reasonRural };
      return { ready: true, urban: false, inPakistan: true, lowDensity: true,
        unit: u ? { unitId: u.uid, tehsil: u.tehsil, district: u.district, province: u.province } : null,
        populationPerKm2: Math.round(cell.populationPerKm2 || 0), rule: UMASK.rule, why: UMASK.reasonRural };
    }
    if (withheldCell(cell.__p) || (!UNIT && WH && (() => { const u = unitAt(lat, lon); return u && whUid(u.uid); })())) {   /* v91.17.283.2 · mountain valleys: withheld (after the rural / small-settlement statement, which stays as it was) */
      const u = unitAt(lat, lon);
      return { ready: true, urban: false, inPakistan: true, withheld: true,
        unit: u ? { unitId: u.uid, tehsil: u.tehsil, district: u.district, province: u.province } : null,
        why: WH.reason, withheldBasis: withheldInfo() };
    }
    const lcz = lczAt(lat, lon);
    const T = cellTerms(cell, lcz, cell.__p, lat, lon);
    const geo = T.geo, hw = geo.aspectRatio, dTraw = T.raw, veg = T.veg, dTmax = T.dT;
    const phiW = weatherFactor(opts.windMs, opts.cloudFraction);
    /* phase: either given directly, or derived from a timestamp */
    let phase = opts.hoursFromSunset;
    let sun = null;
    if (phase == null && opts.at) {
      const d = new Date(opts.at);
      sun = sunHours(lat, lon, d, opts.tzOffsetH == null ? 5 : opts.tzOffsetH);
      const localH = d.getUTCHours() + d.getUTCMinutes() / 60 + (opts.tzOffsetH == null ? 5 : opts.tzOffsetH);
      phase = ((localH % 24) - sun.sunset);
    }
    const phiT = phase == null ? null : diurnalFactor(phase);
    const qf = +(cell.populationPerKm2 * W_PER_CAPITA / 1e6).toFixed(2);
    const now = phiT == null ? null : +(dTmax * phiT).toFixed(2);
    return {
      ready: true, urban: true,
      point: { lat, lon },
      cell,
      lcz: lcz ? { class: lcz.class, name: lcz.name, builtPercent: lcz.builtPercent,
                   stewartOke: lcz.ucp ? { skyViewFactor: lcz.ucp.svf, aspectRatio: lcz.ucp.ar } : null } : null,
      geometry: geo,
      heatIsland: {
        maxC: +dTmax.toFixed(2),
        maxUncalibratedC: +dTraw.toFixed(2),
        calibration: CALIBRATION,
        /* v91.17.78 · U · the town-size and coastal terms, and the value in plain words (data/urban-heat-model.json) */
        town: T.townInfo ? { population: Math.round(T.townInfo.population), factor: +T.town.toFixed(3), applied: TOWN_ON,
          basis: MODEL.townSize.basis } : null,
        coastal: T.townInfo && T.townInfo.coastal ? { applied: !!(COAST && COAST.applied), factor: +T.coast.toFixed(3), uncertainty: MODEL.coastal.uncertainty } : null,
        plainWords: (MODEL.plainWords && MODEL.plainWords.point ? MODEL.plainWords.point : 'Up to {v} °C warmer than open country on a typical calm, clear night.').replace('{v}', (+dTmax.toFixed(1)).toFixed(1)),
        calibrationBasis: MODEL.calibration.basis,
        ...(T.lst ? { okeMaxC: +T.okeC.toFixed(2), satelliteTerm: { city: T.lst.city, version: T.lst.version, basis: 'night land-surface temperature anomaly, built share and population against the city rural reference, fitted on paired stations; held out (leave one site out) it beat the canyon model in this city' } } : {}),
        maxBasis: T.lst ? `satellite urban term (D12, ${T.lst.city}): night land-surface temperature, built share and population of this 250 m cell against the city's rural reference, fitted on paired MACH and synop stations` : `Oke (1981): dT_max = ${OKE_A} + ${OKE_B} ln(H/W), reduced for vegetation, scaled by town size (Oke 1973) and multiplied by the calibration fitted on 2 station pairs and 16 MACH stations`,
        vegetation: veg,
        hoursFromSunset: phase == null ? null : +Number(phase).toFixed(2),
        diurnalFactor: phiT == null ? null : +phiT.toFixed(3),
        diurnalBasis: 'the measured hourly curve from the same pair; maximum 2 h after sunset, negative (urban COOL island) in the late morning',
        nowC: now,
        sun,
        weatherFactor: +phiW.toFixed(3),
        weatherFactorApplied: false,
        weatherBasis: 'Oke (1998): (1 - 0.68 n^2)/sqrt(U). Reported, NOT applied: in the only Pakistani pair available the calmest nights show the SMALLEST anomaly (+1.17 K below 1.5 m/s against +1.84 K at 3-5 m/s), which contradicts the relation. Probably a winter/calm confound rather than physics, but it is not applied to a published number on that basis.',
        beyondFittedRange: geo.beyondFittedRange,
        /* the calibration pair sits at H/W 0.47. Oke's relation is logarithmic
           and steep, so carrying one constant fitted there up to a compact city
           core at H/W 2.5 is an extrapolation of a factor of five in the very
           variable the relation is most sensitive to. Said here rather than
           left for the reader to work out. */
        calibrationExtrapolation: (function () {
          const r = hw / 0.472;
          if (r <= 1.6 && r >= 0.63) return { factor: +r.toFixed(2), note: 'near the aspect ratio the calibration was fitted at' };
          return { factor: +r.toFixed(2),
                   note: `this cell's aspect ratio is ${r.toFixed(1)}x the 0.47-0.48 of both calibration pairs. The magnitude is an extrapolation of a logarithmic relation well outside the two points it was tied to, which sit almost on top of each other; the ranking against other cells is far better supported than the kelvin value.` };
        })(),
      },
      anthropogenicHeat: {
        qfWm2: qf,
        basis: `population density ${cell.populationPerKm2} per km2 x ${W_PER_CAPITA} W per person. Pakistan primary energy use 414.95 kg oil equivalent per capita (World Bank, 2023).`,
        notAdded: 'reported, not added to the heat island: Oke (1981) was regressed on observed heat islands in cities that already contained anthropogenic heat, so adding it again would count it twice',
      },
      caveat: MODEL.caveat || 'the model caveat could not be read (data/urban-heat-model.json); the model is fitted on a few station pairs in two towns and barely ranks places inside one city: read the value as relative between a small town and a big city, not as a ranking of neighbourhoods or a kelvin value at a point.'   /* v91.17.283.3 · audit S11 · the fallback no longer contradicts the served caveat */,
      externalCheck: EXTERNAL_CHECK,
    };
  }

  /* ══ v91.17.11 · "WHICH PARTS OF THIS CITY ARE HOTTER" ════════════════════
     A question about sectors is not a question about one point. This scans
     every carried cell within a radius and reports the spread, with the
     warmest and coolest cells named by coordinate, so the answer is the range
     across the city rather than one number for all of it. */
  function spread(lat, lon, radiusKm = 12, opts = {}) {
    if (!ready()) return { ready: false, why: loadError || 'the urban morphology grid is not present' };
    if (NW) return { ready: true, cells: 0, ...nationalWithheld() };   /* C12 */
    const G = META.grid;
    const dLat = radiusKm / 111.32, dLon = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));
    const r1 = Math.round((G.lat0 - (lat - dLat)) / G.step - 0.5);
    const r0 = Math.round((G.lat0 - (lat + dLat)) / G.step - 0.5);
    const c0 = Math.round(((lon - dLon) - G.lon0) / G.step - 0.5);
    const c1 = Math.round(((lon + dLon) - G.lon0) / G.step - 0.5);
    const out = [];
    for (let r = r0; r <= r1; r++) {
      const lo = r * G.cols + c0, hi = r * G.cols + c1;
      let p = lowerBound(lo);
      while (p < IDX.length && IDX[p] <= hi) {
        const o = p * 4;
        const cLat = +(G.lat0 - ((IDX[p] / G.cols | 0) + 0.5) * G.step).toFixed(5);
        const cLon = +(G.lon0 + ((IDX[p] % G.cols) + 0.5) * G.step).toFixed(5);
        const cell = { builtFraction: F16[o] / 1000, meanBuildingHeightM: F16[o + 1] / 10,
                       populationPerKm2: F16[o + 2] * 10, ndvi: F16[o + 3] === -9990 ? null : F16[o + 3] / 1000, treeFraction: treeAt(p),
                       cellLat: cLat, cellLon: cLon };
        if (withheldCell(p)) { p++; continue; }   /* v91.17.283.2 · mountain valleys: withheld */
        const lcz = lczAt(cLat, cLon, 1);
        const geo = geometry(cell, lcz);
        const dT = cellTerms(cell, lcz, p, cLat, cLon).dT;
        out.push({ lat: cLat, lon: cLon, deltaTmaxC: +dT.toFixed(2), ...cell,
                   aspectRatio: geo.aspectRatio, skyViewFactor: geo.skyViewFactor,
                   lcz: lcz ? lcz.class : null, lczName: lcz ? lcz.name : null });
        p++;
      }
    }
    if (!out.length) return { ready: true, cells: 0, why: 'no built cells within ' + radiusKm + ' km of this point' };
    out.sort((a, b) => a.deltaTmaxC - b.deltaTmaxC);
    const q = (f) => out[Math.min(out.length - 1, Math.floor(out.length * f))];
    return { ready: true, cells: out.length, radiusKm,
      coolest: out[0], p25: q(0.25), median: q(0.5), p75: q(0.75), warmest: out[out.length - 1],
      spreadC: +(out[out.length - 1].deltaTmaxC - out[0].deltaTmaxC).toFixed(2),
      basis: 'every carried cell (270 m, 5% built or more) within the radius, ranked by maximum nocturnal heat-island potential' };
  }
  function lowerBound(k) {
    let lo = 0, hi = IDX.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (IDX[m] < k) lo = m + 1; else hi = m; }
    return lo;
  }

  /* ══ v91.17.12 · THE WHOLE COUNTRY, ONE UNIT AT A TIME ═══════════════════
     Built once and cached: every carried cell rolled up to the tehsil that
     contains it. The headline per unit is the POPULATION-WEIGHTED mean, which
     is the heat island the average resident of that unit is in, not the mean
     of its cells - those are different numbers wherever a unit holds both a
     dense core and empty ground, which is most of them. The spread is carried
     with it, because a single number for a tehsil is exactly the thing this
     layer exists to stop. */
  /* ══ v91.17.12 · THE CELLS IN VIEW, FOR A MAP OVERLAY ════════════════════
     A tehsil choropleth cannot show this layer honestly. Measured: the median
     WITHIN-unit spread of the heat island is 5.08 K, which is larger than the
     difference between most pairs of units. Painting one value over a tehsil
     whose interior varies by more than the map's whole range is precisely the
     thing this work exists to stop, so the field is served at its own
     resolution and drawn as cells.

     Returned as a flat array of triples rather than objects, and thinned by
     stride when the view holds more cells than asked for, so the payload stays
     bounded at any zoom. */
  function cellsIn(w, s_, e, n, max = 20000, opts = {}) {
    if (!ready()) return { ready: false, why: loadError || 'the urban morphology grid is not present' };
    /* v91.17.283.49 · 1.0.10 data item 3 · the C12 withholding is about the HEAT value, not the built-up cells. Until 1.0.9 a withheld layer
       returned cells: [] and every reader of the town cells (the site report's "built-up cells in view", its map snapshot) read open
       country at Islamabad I-8 (GHSL built 44 %). The town cells (GHSL built-up, the same town-patch rule) are measurements and are served
       in every state; while the heat layer is withheld each triple's value is null and the page draws no heat fill (legend: Not assessed). */
    const G = META.grid;
    const r0 = Math.max(0, Math.round((G.lat0 - n) / G.step - 0.5));
    const r1 = Math.round((G.lat0 - s_) / G.step - 0.5);
    const c0 = Math.round((w - G.lon0) / G.step - 0.5);
    const c1 = Math.round((e - G.lon0) / G.step - 0.5);
    if (!(r1 >= r0) || !(c1 >= c0)) return { ready: true, cells: [], n: 0 };
    const hit = [];
    for (let r = r0; r <= r1; r++) {
      let p = lowerBound(r * G.cols + c0);
      const hiK = r * G.cols + c1;
      while (p < IDX.length && IDX[p] <= hiK) { hit.push(p); p++; }
      if (hit.length > max * 12) break;
    }
    /* ══ AGGREGATE, DO NOT THIN ═════════════════════════════════════════════
       The first version returned every Nth cell when the view held more than
       the limit. On a national view that is a scatter of lone cells with gaps
       between them, which looks like missing data rather than a field, and it
       throws away the information in the cells it skips. Blocks of cells are
       averaged instead, so a zoomed-out view shows a coarser but COMPLETE
       field and every cell in the view contributes to what is drawn.

       The block size is chosen so a drawn cell is at least a few pixels at the
       caller's zoom: at zoom 9 a pixel is about 260 m at this latitude and a
       278 m cell is one pixel, which is why the layer was invisible. */
    const zoom = Number(opts.zoom);
    const midLat = (s_ + n) / 2;
    let blk = 1;
    if (Number.isFinite(zoom)) {
      const mPerPx = 156543.03 * Math.cos(midLat * Math.PI / 180) / Math.pow(2, zoom);
      blk = Math.max(1, Math.round(mPerPx * 3 / (G.step * 111320)));
    }
    blk = Math.max(blk, Math.ceil(Math.sqrt(hit.length / max)));
    const bins = new Map();
    for (const p of hit) {
      const k = IDX[p], o = p * 4;
      const cell = { builtFraction: F16[o] / 1000, meanBuildingHeightM: F16[o + 1] / 10,
                     populationPerKm2: F16[o + 2] * 10, ndvi: F16[o + 3] === -9990 ? null : F16[o + 3] / 1000, treeFraction: treeAt(p) };
      if (!(cell.builtFraction > 0) || !(cell.meanBuildingHeightM > 0)) continue;
      if (outsideAdministered(p)) continue;   /* v91.17.77 · G · IIOJK and cells in no tehsil: never drawn */
      if (!NW && withheldCell(p)) continue;   /* mountain heat withholding: heat cells only (1.0.10: built-up cells are facts) */   /* v91.17.283.2 · mountain valleys (Gilgit-Baltistan, Chitral): withheld */
      cell.__p = p;
      if (!isUrbanCell(cell)) continue;   /* v91.17.72 · low-density: no heat island, no fill · v77 G: and a town patch, not a hamlet */
      const r = Math.floor(k / G.cols), c = k % G.cols;
      const lat = G.lat0 - (r + 0.5) * G.step, lon = G.lon0 + (c + 0.5) * G.step;
      let dT = NW ? 0 : cellTerms(cell, lczAt(lat, lon, 1), p, lat, lon).dT;
      if (!NW && opts.hoursFromSunset != null) dT *= diurnalFactor(opts.hoursFromSunset);
      const br = Math.floor(r / blk), bc = Math.floor(c / blk), bk = br * 100000 + bc;
      let b = bins.get(bk);
      if (!b) { b = { n: 0, sum: 0, br, bc, r0: r, r1: r, c0: c, c1: c }; bins.set(bk, b); }
      b.n++; b.sum += dT;
      if (r < b.r0) b.r0 = r; if (r > b.r1) b.r1 = r; if (c < b.c0) b.c0 = c; if (c > b.c1) b.c1 = c;
    }
    /* v91.17.77 · G · a drawn block covers the town cells it averages, not the whole block: [measured] a 23 x 23 block (6.4 km at
       national zoom) holding one small patch was painted as a 6.4 km square, and a block beside the Line of Control spilled over
       it. The centre is the bounding box of the town cells in the block and `extents` carries its half-height and half-width. */
    const out = [], ext = [];
    for (const b of bins.values()) {
      const lat = G.lat0 - ((b.r0 + b.r1 + 1) / 2) * G.step;
      const lon = G.lon0 + ((b.c0 + b.c1 + 1) / 2) * G.step;
      out.push(+lat.toFixed(4), +lon.toFixed(4), NW ? null : +(b.sum / b.n).toFixed(2));
      ext.push(+((b.r1 - b.r0 + 1) * G.step / 2).toFixed(5), +((b.c1 - b.c0 + 1) * G.step / 2).toFixed(5));
    }
    return { ready: true, ...(NW ? { ...nationalWithheld(), heatValues: 'withheld: the third value of each triple is null; the cells are the GHSL town cells (built-up), a measurement' } : {}), builtUpCells: out.length / 3, n: out.length / 3, block: blk, stepDeg: G.step * blk, extents: ext,
      extentsFormat: 'flat pairs, one per cell: half-height and half-width in degrees of the town cells the drawn cell averages',
      mask: maskInfo(),
      cellSizeM: Math.round(G.step * blk * 111320),
      sourceCellsUsed: hit.length,
      aggregated: blk > 1 ? ('each drawn cell is the mean of a ' + blk + ' x ' + blk + ' block of 278 m cells, so the field is complete at this zoom rather than sampled - zoom in for the full resolution') : null,
      format: 'flat triples: lat, lon, deltaTmaxC', cells: out };
  }

  /* v91.17.77 · G · what the map layer is allowed to paint, for its legend (the words come from the data files) */
  function maskInfo() {
    return { urbanOnly: true, populationPerKm2Min: (UMASK.rule && UMASK.rule.populationPerKm2Min) || null,
      clusterPopulationMin: UHM && UHM.cluster ? UHM.cluster.populationMin : null, townPatches: TOWN ? CLUSTERS : null,
      clip: UHM && UHM.clip ? 'Pakistan-administered area only (IIOJK and anything outside the tehsil outline are not drawn)' : null,
      legend: UHM && UHM.legend ? UHM.legend : { title: 'Urban heat island', subtitle: '°C added · urban areas only', note: '' },
      withheld: WH ? { zone: WH.zone, units: WH.units, reason: WH.reason } : null,
      files: ['data/urban-mask.json'].concat(UHM ? ['data/urban-heat-map.json'] : []).concat(WH ? ['data/urban-heat-model.json (withheld)'] : []) };
  }
  let NAT = null;
  function national() {
    if (!ready()) return { ready: false, why: loadError || 'the urban morphology grid is not present' };
    if (!UNIT || !UIDS) return { ready: false, why: 'the per-cell unit assignment is not present in this build' };
    if (NW) return { ready: true, units: {}, ...nationalWithheld() };   /* C12: no tehsil roll-up */
    if (NAT) return NAT;
    const t0 = Date.now(), G = META.grid, agg = new Map();
    for (let p = 0; p < IDX.length; p++) {
      const u = UNIT[p]; if (u < 0) continue;
      const k = IDX[p], r = Math.floor(k / G.cols), c = k % G.cols;
      const lat = G.lat0 - (r + 0.5) * G.step, lon = G.lon0 + (c + 0.5) * G.step;
      const o = p * 4;
      const cell = { builtFraction: F16[o] / 1000, meanBuildingHeightM: F16[o + 1] / 10,
                     populationPerKm2: F16[o + 2] * 10, ndvi: F16[o + 3] === -9990 ? null : F16[o + 3] / 1000, treeFraction: treeAt(p), __p: p };
      if (!(cell.builtFraction > 0) || !(cell.meanBuildingHeightM > 0)) continue;
      if (outsideAdministered(p)) continue;   /* v91.17.77 · G · the disputed unit is not summarised */
      if (withheldCell(p)) continue;   /* v91.17.283.2 · mountain valleys (Gilgit-Baltistan, Chitral): withheld */
      if (!isUrbanCell(cell)) continue;   /* v91.17.72 · villages carry no heat island in the unit summary either */
      const TT = cellTerms(cell, lczAt(lat, lon, 1), p, lat, lon), geo = TT.geo, dT = TT.dT;
      let a = agg.get(u);
      if (!a) { a = { n: 0, pop: 0, popDt: 0, dts: [], warm: null }; agg.set(u, a); }
      a.n++; a.pop += cell.populationPerKm2; a.popDt += cell.populationPerKm2 * dT; a.dts.push(dT);
      if (!a.warm || dT > a.warm.deltaTmaxC) a.warm = { deltaTmaxC: +dT.toFixed(2), lat: +lat.toFixed(4), lon: +lon.toFixed(4),
        builtFraction: cell.builtFraction, meanBuildingHeightM: cell.meanBuildingHeightM, ndvi: cell.ndvi,
        populationPerKm2: cell.populationPerKm2, aspectRatio: geo.aspectRatio };
    }
    const units = {};
    for (const [u, a] of agg) {
      a.dts.sort((x, y) => x - y);
      const q = (f) => a.dts[Math.min(a.dts.length - 1, Math.floor(a.dts.length * f))];
      units[UIDS[u]] = {
        cells: a.n,
        popWeightedC: +(a.pop > 0 ? a.popDt / a.pop : q(0.5)).toFixed(2),
        medianC: +q(0.5).toFixed(2), p90C: +q(0.9).toFixed(2),
        maxC: +a.dts[a.dts.length - 1].toFixed(2), minC: +a.dts[0].toFixed(2),
        spreadC: +(a.dts[a.dts.length - 1] - a.dts[0]).toFixed(2),
        warmestCell: a.warm,
      };
    }
    NAT = { ready: true, mask: maskInfo(), built: new Date().toISOString(), seconds: +((Date.now() - t0) / 1000).toFixed(1),
      unitsWithUrbanCells: Object.keys(units).length, totalCells: IDX.length,
      headline: 'popWeightedC is the maximum nocturnal urban heat island the average resident of the unit is in, in kelvin ON TOP of the grid forecast. It is not an air temperature and not a forecast.',
      method: MODEL.method || '',
      calibration: CALIBRATION, model: modelInfo(),
      caveat: MODEL.caveat || '',
      externalCheck: EXTERNAL_CHECK,
      canopy: canopyStatus(), buildings: buildingsStatus(),   /* v91.17.37 · C, E */
      units };
    return NAT;
  }

  const status = () => ({ ready: ready(), cells: IDX ? IDX.length : 0, canopy: canopyStatus(), buildings: buildingsStatus(),
    cellSizeM: META ? Math.round(META.grid.step * 111320) : null,
    lczCells: LCZ ? LCZ.map.size : 0, generated: META && META.generated,
    sources: META && META.sources, caveats: META && META.caveats,
    calibration: CALIBRATION, model: modelInfo(), externalCheck: EXTERNAL_CHECK, mask: maskInfo(), loadError, c12: c12Info() });
  /* v91.17.283.6 · item 2 · the C12 decision as the console's Urban heat panel reads it (applied, reason, rule, release condition) */
  function c12Info() { return NW ? { applied: true, version: NW.version || null, decided: NW.decided || null, reason: NW.reason, rule: NW.rule || null, releaseWhen: NW.releaseWhen || null, source: 'data/urban-heat-c12.json' } : { applied: false, source: 'data/urban-heat-c12.json' }; }
  function modelInfo() { if (!MODEL) return null;
    return { file: 'data/urban-heat-model.json', version: MODEL.version, calibration: CALIBRATION, townSize: { applied: TOWN_ON, form: MODEL.townSize.form, slope: TOWN_SLOPE, intercept: TOWN_INTERCEPT, referencePopulation: TOWN_PREF, source: MODEL.townSize.source },
      coastal: MODEL.coastal ? { applied: !!MODEL.coastal.applied, towns: (MODEL.coastal.towns || []).map((t) => t.name), uncertainty: MODEL.coastal.uncertainty } : null,
      classScaleClamp: MODEL.classScale.clamp.value, vegetationCooling: VEG_COOLING, skill: MODEL.skill ? MODEL.skill.summary : null, plainWords: MODEL.plainWords || null }; }

  /* v91.17.78 · U · the terms of one point, for the fit/verification script (station-lake/scripts/urban_town_fit.mjs) */
  function pointTerms(lat, lon) {
    if (!ready()) return null; const cell = cellAt(lat, lon); if (!cell) return null;
    const T = cellTerms(cell, lczAt(lat, lon), cell.__p);
    return { urban: isUrbanCell(cell), smallSettlement: smallSettlement(cell), outside: outsideAdministered(cell.__p), withheld: withheldCell(cell.__p), cell, aspectRatio: T.geo.aspectRatio, classScale: T.geo.classScale,
      raw: T.raw, veg: T.veg.factor, town: T.town, coast: T.coast, patchPopulation: T.townInfo ? T.townInfo.population : null, coastal: T.townInfo ? T.townInfo.coastal : false, dT: T.dT };
  }
  return { estimate, spread, national, cellsIn, cellAt, lczAt, unitAt, status, ready, sunHours, diurnalFactor, CALIBRATION, pointTerms, withheldInfo, c12: () => c12Info() };
}
