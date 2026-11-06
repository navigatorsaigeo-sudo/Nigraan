#!/usr/bin/env python3
"""v91.17.70 · licence headers for every open layer NIGRAAN serves (Sprint 1, data-source decision option 2).

WHY. The CEO's decision (25 Sep 2026) puts customer outputs on AGN's MACH stations and openly licensed data only, and the
brief requires every open dataset to carry its licence, attribution text and URL in its data-file header. The governance
seat (build_governance_legal.md W5, W8) measured that no credits page existed and that most layers recorded a source
string but no licence. server/api/sources.mjs builds the customer Sources page (/api/sources) from these headers; it
holds no licence text of its own.

WHAT. Writes a top-level "licence" list into each data file below: one record per dataset the file is built from,
{id, dataset, provider, licence, licenceUrl, attribution, url, use, customer}. customer=false marks an internal reference
(PMD, SUPARCO, NOAA ISD) that the Sources page shows only with NIGRAAN_INTERNAL_REF=1. The file data/open-feeds.json is
created for the datasets that reach the server as live feeds (the weather API, ERA5, GloFAS, CAMS, IMERG ...) or through
offline jobs whose output files other workstreams rebuild; it has the built/method/source header the brief asks for.

Idempotent: re-run after any data file is rebuilt (python3 nigraan-local/scripts/licence_headers.py). A file whose
existing header already equals the records is not rewritten. Formatting: a compact file stays compact, an indented file
keeps an indent.

Evidence tags: the licence of each dataset is [read] from the provider's licence page or from the governance seat's
inventory (build_governance_legal.md section 2, read 25 Sep 2026); nothing here is [measured].
"""
import json, os, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, '..', 'data'))
YEAR = datetime.date.today().year
CC_BY = 'https://creativecommons.org/licenses/by/4.0/'

D = {
  'mach': dict(dataset='MACH weather-station network', provider='AI Geo Navigators (AGN)', licence='AGN proprietary (own network)', licenceUrl=None,
               attribution='MACH stations, AI Geo Navigators (AGN)', url='https://mach.aigeo360.com',
               use='live station readings, the fleet check of the served forecast, the urban term'),
  'weather_feed': dict(dataset='Weather forecast, ensemble, reanalysis, air-quality, flood-model and geocoding API (served as MACH forecast)', provider='Open-Meteo',
               licence='CC BY 4.0', licenceUrl=CC_BY, attribution='Weather data by Open-Meteo.com (https://open-meteo.com/)', url='https://open-meteo.com/en/license',
               use='every forecast value, the ensembles, the seasonal outlook and the point forecasts; the product brand is MAch, the data provider is credited here as its licence requires'),
  'ecmwf': dict(dataset='ECMWF IFS / AIFS forecasts, ENS ensemble, EC46 and SEAS5', provider='European Centre for Medium-Range Weather Forecasts (ECMWF)', licence='CC BY 4.0', licenceUrl=CC_BY,
               attribution='Contains ECMWF data, © ECMWF, licensed under CC BY 4.0', url='https://www.ecmwf.int/en/forecasts/datasets/open-data',
               use='the named model run, the 51-member ensemble, weeks-ahead and season-ahead anomalies (through the weather API)'),
  'era5land': dict(dataset='ERA5-Land reanalysis (monthly means and hourly)', provider='Copernicus Climate Change Service (C3S) / ECMWF', licence='CC BY 4.0 (Copernicus CDS)', licenceUrl=CC_BY,
               attribution='Contains modified Copernicus Climate Change Service information %d; Muñoz Sabater (2019) ERA5-Land monthly averaged data, DOI 10.24381/cds.68d2bb30; ERA5-Land hourly data, DOI 10.24381/cds.e2161bac. Neither the European Commission nor ECMWF is responsible for any use of this information.' % YEAR,
               url='https://cds.climate.copernicus.eu', use='antecedent soil water and snow water per tehsil (wetness and melt inputs)'),
  'era5': dict(dataset='ERA5 and ERA5-Land reanalysis', provider='Copernicus Climate Change Service (C3S) / ECMWF', licence='CC BY 4.0 (Copernicus CDS, from 2 Jul 2025)', licenceUrl=CC_BY,
               attribution='Contains modified Copernicus Climate Change Service information %d; Hersbach et al. (2020) ERA5; Muñoz-Sabater et al. (2021) ERA5-Land' % YEAR,
               url='https://cds.climate.copernicus.eu', use='climate normals and percentiles, drought indices (SPI, SPEI), soil moisture, the landslide back-test'),
  'glofas': dict(dataset='GloFAS river discharge (Global Flood Awareness System)', provider='Copernicus Emergency Management Service (CEMS)', licence='Copernicus licence (free, full and open access to Copernicus data)', licenceUrl='https://www.copernicus.eu/en/access-data/copyright-and-licences',
               attribution='Contains modified Copernicus Emergency Management Service information %d. Neither the European Commission nor ECMWF is responsible for any use of this information.' % YEAR,
               url='https://global-flood.emergency.copernicus.eu', use='river-flow context on the flood screen'),
  'cams': dict(dataset='CAMS global atmospheric composition forecast (PM2.5, AQI)', provider='Copernicus Atmosphere Monitoring Service (CAMS) / ECMWF', licence='CC BY 4.0', licenceUrl=CC_BY,
               attribution='Contains modified Copernicus Atmosphere Monitoring Service information %d' % YEAR, url='https://atmosphere.copernicus.eu', use='air quality and smog'),
  'imerg': dict(dataset='GPM IMERG satellite precipitation', provider='NASA / JAXA', licence='NASA open data (no restriction on use)', licenceUrl='https://earthdata.nasa.gov/engage/open-data-services-and-software/data-and-information-policy',
               attribution='GPM IMERG, NASA/JAXA (Huffman et al.)', url='https://gpm.nasa.gov/data/imerg', use='observed rain over the last days where no gauge exists'),
  'sentinel2': dict(dataset='Sentinel-2 L2A imagery', provider='European Union / ESA, Copernicus (via Earth Search on AWS)', licence='Copernicus Sentinel data terms (free, full and open)', licenceUrl='https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice',
               attribution='Contains modified Copernicus Sentinel data %d' % YEAR, url='https://registry.opendata.aws/sentinel-2-l2a-cogs/', use='glacial-lake area measurements'),
  'sentinel1': dict(dataset='Sentinel-1 SAR imagery', provider='European Union / ESA, Copernicus', licence='Copernicus Sentinel data terms (free, full and open)', licenceUrl='https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice',
               attribution='Contains modified Copernicus Sentinel data %d' % YEAR, url='https://sentinels.copernicus.eu', use='flood-extent calibration'),
  'viirs': dict(dataset='VIIRS 375 m imagery and flood products', provider='NOAA / NASA', licence='US Government open data (no restriction on use)', licenceUrl='https://www.noaa.gov/information-technology/open-data-dissemination',
               attribution='VIIRS data, NOAA/NASA', url='https://www.star.nesdis.noaa.gov/jpss/', use='flood-extent calibration'),
  'modis': dict(dataset='MODIS Terra monthly NDVI (via NASA GIBS)', provider='NASA', licence='NASA open data (no restriction on use)', licenceUrl='https://earthdata.nasa.gov/engage/open-data-services-and-software/data-and-information-policy',
               attribution='MODIS NDVI, NASA EOSDIS GIBS', url='https://earthdata.nasa.gov/gibs', use='vegetation in the urban heat layer'),
  'copernicus_dem': dict(dataset='Copernicus DEM GLO-90', provider='European Union / ESA; DLR and Airbus', licence='Copernicus DEM licence (free, commercial use allowed)', licenceUrl='https://spacedata.copernicus.eu/documents/20123/121286/CSCDA_ESA_Mission-specific+Annex_31_Oct_22.pdf',
               attribution='Copernicus DEM GLO-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA; all rights reserved',
               url='https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model', use='terrain, settlement heights, slope, floodplain (HAND) and lake terrain'),
  # v91.17.72 (agent T) · Copernicus GLO-30 and HydroRIVERS for the 30 m terrain set (station-lake/scripts/terrain30_*.py)
  'copernicus_dem30': dict(dataset='Copernicus DEM GLO-30 (DSM, 1 arc-second)', provider='European Union / ESA; DLR and Airbus', licence='Copernicus DEM licence (free, commercial use allowed with attribution)', licenceUrl='https://spacedata.copernicus.eu/documents/20123/121286/CSCDA_ESA_Mission-specific+Annex_31_Oct_22.pdf',
               attribution='© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved',
               url='https://registry.opendata.aws/copernicus-dem/', use='30 m terrain features, settlement and place heights, tehsil elevation and slope, 30 m HAND'),
  'hydrorivers': dict(dataset='HydroRIVERS v1.0 (Asia; Europe & Middle East)', provider='World Wildlife Fund (WWF) and McGill University (Lehner & Grill)',
               licence='HydroSHEDS version 1 License Agreement (HydroSHEDS Technical Documentation v1.4, Appendix A): "HydroSHEDS data are free for non-commercial and commercial use." Derivative Works only, not as a stand-alone product; end-user terms at least as protective (2.1.2); Exhibit B attribution (2.2).',
               licenceUrl='https://data.hydrosheds.org/file/technical-documentation/HydroSHEDS_TechDoc_v1_4.pdf',
               attribution='This product NIGRAAN incorporates data from the HydroSHEDS version 1 database which is © World Wildlife Fund, Inc. (2006-2022) and has been used herein under license. WWF has not evaluated the data as altered and incorporated within NIGRAAN, and therefore gives no warranty regarding its accuracy, completeness, currency or suitability for any particular purpose. Portions of the HydroSHEDS v1 database incorporate data which are the intellectual property rights of © USGS (2006-2008), NASA (2000-2005), ESRI (1992-1998), CIAT (2004-2006), UNEP-WCMC (1993), WWF (2004), Commonwealth of Australia (2007), and Her Royal Majesty and the British Crown and are used under license. The HydroSHEDS v1 database and more information are available at https://www.hydrosheds.org.',
               url='https://www.hydrosheds.org/products/hydrorivers', use='river lines burned into the 30 m DSM for the flat-plains HAND (height above nearest drainage); independent check on the 30 m channels'),
  'esa_worldcover': dict(dataset='ESA WorldCover 2021 v200, 10 m land cover', provider='European Space Agency (ESA) WorldCover consortium', licence='CC BY 4.0', licenceUrl=CC_BY,
               attribution='© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium', url='https://esa-worldcover.org', use='land cover, runoff curve numbers, the sponge index'),
  'esri_io_lulc': dict(dataset='Esri / Impact Observatory 10 m annual land use and land cover (2025)', provider='Impact Observatory, Microsoft and Esri', licence='CC BY 4.0', licenceUrl=CC_BY,
               attribution='Esri Land Cover 2025, Impact Observatory, Microsoft and Esri (Karra et al. 2021), CC BY 4.0', url='https://livingatlas.arcgis.com/landcoverexplorer', use='land-cover shares per tehsil (context layer)'),
  'ghsl': dict(dataset='GHSL R2023A: GHS-POP, GHS-BUILT-S and GHS-BUILT-V (epoch 2025)', provider='European Commission, Joint Research Centre (JRC)', licence='CC BY 4.0', licenceUrl=CC_BY,
               attribution='GHSL Data Package 2023, European Commission JRC (Schiavina et al. 2023; Pesaresi et al. 2023)', url='https://human-settlement.emergency.copernicus.eu', use='population, settlement heights, built surface and building height'),
  'open_buildings': dict(dataset='Google Open Buildings v3', provider='Google Research', licence='CC BY 4.0 (elected; also offered under ODbL)', licenceUrl=CC_BY,
               attribution='Google Open Buildings v3 (Sirko et al. 2021), CC BY 4.0', url='https://sites.research.google/open-buildings/', use='building counts and footprints per tehsil and per urban cell'),
  'hydrosheds': dict(dataset='HydroSHEDS / HydroBASINS v1c', provider='WWF and McGill University (Lehner & Grill)', licence='HydroSHEDS licence (free, commercial use allowed with attribution)', licenceUrl='https://www.hydrosheds.org/terms-of-use',
               attribution='HydroBASINS: Lehner, B., Grill, G. (2013) Hydrological Processes 27(15): 2171-2186; data available at www.hydrosheds.org', url='https://www.hydrosheds.org', use='river basins and the routing of glacial lakes to downstream places'),
  'rgi': dict(dataset='Randolph Glacier Inventory 7.0', provider='RGI 7.0 Consortium (GLIMS / NSIDC)', licence='CC BY 4.0', licenceUrl=CC_BY,
               attribution='RGI 7.0 Consortium (2023) Randolph Glacier Inventory 7.0, NSIDC, doi:10.5067/f6jmovy5navz', url='https://www.glims.org/rgi_user_guide/', use='glacier attributes beside glacial lakes'),
  'hmaglofdb': dict(dataset='HMAGLOFDB, glacial lake outburst floods in High Mountain Asia', provider='Steiner, Shrestha et al.; ICIMOD', licence='CC BY 4.0', licenceUrl=CC_BY,
               attribution='Steiner, Shrestha et al. (2023) ESSD 15, 3941-3961, doi:10.5194/essd-15-3941-2023; ICIMOD RDS doi:10.26066/RDS.1973283', url='https://github.com/fidelsteiner/HMAGLOFDB', use='documented outbursts per lake'),
  'giri': dict(dataset='GIRI landslide susceptibility', provider='NGI for UNDRR / CDRI / UNEP-GRID-Geneva', licence='CC BY 4.0', licenceUrl=CC_BY,
               attribution='GIRI / UNEP-GRID-Geneva / NGI', url='https://giri.unepgrid.ch', use='landslide susceptibility per tehsil'),
  'soilgrids': dict(dataset='SoilGrids 2.0 soil texture', provider='ISRIC World Soil Information', licence='CC BY 4.0', licenceUrl=CC_BY,
               attribution='SoilGrids 2.0, ISRIC (Poggio et al. 2021)', url='https://soilgrids.org', use='hydrologic soil groups and soil water'),
  'canopy': dict(dataset='Global canopy height map, 1 m', provider='Meta and World Resources Institute', licence='CC BY 4.0', licenceUrl=CC_BY,
               attribution='Tolan et al. (2024) Very high resolution canopy height maps, Meta and WRI', url='https://registry.opendata.aws/dataforgood-fb-forests/', use='tree cover in the urban heat layer'),
  'lithology': dict(dataset='Global landform and lithology class at 250 m', provider='T. Hengl (OpenGeoHub), after USGS / GLiM', licence='CC BY-SA 4.0 (ShareAlike: the derived per-tehsil table is offered under the same licence)', licenceUrl='https://creativecommons.org/licenses/by-sa/4.0/',
               attribution='Hengl, T. (2018) Global landform and lithology class at 250 m, Zenodo, doi:10.5281/zenodo.1464846', url='https://doi.org/10.5281/zenodo.1464846', use='rock and soil class per tehsil for the landslide screen'),
  'wudapt': dict(dataset='WUDAPT global Local Climate Zone map v1, 100 m', provider='WUDAPT (Demuzere et al. 2022)', licence='CC BY 4.0', licenceUrl=CC_BY,
               attribution='Demuzere et al. (2022) A global map of Local Climate Zones, doi:10.5281/zenodo.6364594', url='https://www.wudapt.org', use='local climate zones in the urban heat layer'),
  'geonames': dict(dataset='GeoNames gazetteer (Pakistan)', provider='GeoNames', licence='CC BY 4.0', licenceUrl=CC_BY, attribution='GeoNames, www.geonames.org', url='https://www.geonames.org', use='place search'),
  'osm': dict(dataset='OpenStreetMap places', provider='OpenStreetMap contributors', licence='ODbL 1.0', licenceUrl='https://opendatacommons.org/licenses/odbl/1-0/',
               attribution='© OpenStreetMap contributors', url='https://www.openstreetmap.org/copyright', use='place search (neighbourhoods, localities)'),
  'nasa_glc': dict(dataset='NASA Global Landslide Catalog', provider='NASA Goddard (Kirschbaum et al.)', licence='NASA open data (no restriction on use)', licenceUrl='https://earthdata.nasa.gov/engage/open-data-services-and-software/data-and-information-policy',
               attribution='NASA Global Landslide Catalog (Kirschbaum et al. 2010, 2015)', url='https://data.nasa.gov', use='landslide rain-threshold back-test'),
  'metno': dict(dataset='MET Norway Locationforecast', provider='The Norwegian Meteorological Institute (MET Norway)', licence='CC BY 4.0 and NLOD 2.0', licenceUrl=CC_BY,
               attribution='Data from The Norwegian Meteorological Institute (MET Norway)', url='https://api.met.no/doc/License', use='second-opinion point forecast'),
  'usgs': dict(dataset='USGS earthquake feed', provider='U.S. Geological Survey', licence='US public domain', licenceUrl='https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
               attribution='U.S. Geological Survey, Earthquake Hazards Program', url='https://earthquake.usgs.gov', use='recent earthquakes'),
  # internal references (option 2): testing and choosing among open methods only; never in a customer output
  'pmd': dict(dataset='PMD station archive, synop records, FFD bulletins and the 2024 Glacier and Lake Inventory', provider='Pakistan Meteorological Department', licence='government data, no licence for customer use', licenceUrl=None,
               attribution='internal reference', url=None, use='internal verification and model choice only', customer=False),
  'suparco': dict(dataset='SUPARCO PDGL list and Space4Climate bulletins', provider='SUPARCO', licence='government data, no licence for customer use', licenceUrl=None,
               attribution='internal reference', url=None, use='internal comparison of lake readings only', customer=False),
  'noaa_isd': dict(dataset='NOAA ISD / GSOD (non-US stations)', provider='NOAA NCEI', licence='WMO Resolution 40: no commercial redistribution', licenceUrl='https://community.wmo.int/en/resolution-40',
               attribution='internal reference', url=None, use='internal verification only', customer=False),
}

FILES = {
  'mach-fleet-stations.json': ['mach'], 'fleet-history-skill.json': ['mach', 'weather_feed'],
  'settlement-elevation.json': ['ghsl', 'copernicus_dem30'], 'glof-terrain.json': ['copernicus_dem'], 'era5land-climatology.json': ['era5land'], 'era5land-recent.json': ['era5land'], 'era5land-cells.json': ['era5land'], 'era5land-backtest.json': ['era5land', 'era5'], 'hand-tehsil.json': ['copernicus_dem', 'copernicus_dem30', 'esa_worldcover', 'hydrorivers'],   # v91.17.72 terrain30
  'terrain30-tehsil.json': ['copernicus_dem30'], 'place-height30.json': ['copernicus_dem30', 'geonames', 'osm'],
  'landcover-tehsil.json': ['esa_worldcover'], 'landcover-2025-tehsil.json': ['esa_worldcover', 'open_buildings', 'esri_io_lulc'],   # v91.17.70 engineering: builtShare/imperviousProxy now WorldCover 10 m bounded by Open Buildings (cn.py)
  'cn-tehsil.json': ['esa_worldcover', 'soilgrids', 'open_buildings'], 'engineering-references.json': ['era5'],   # v91.17.70 engineering (cn.py, engineering_refs.py)
  'buildings-tehsil.json': ['open_buildings'], 'urban-buildings.meta.json': ['open_buildings'],
  'urban.meta.json': ['ghsl', 'modis'], 'urban-tree.meta.json': ['canopy'], 'lcz-grid.json': ['wudapt'],
  'hybas_pk_lev07.json': ['hydrosheds'], 'glof-basins.json': ['hydrosheds'],
  'glof-events.json': ['hmaglofdb'], 'giri-landslide-tehsil.json': ['giri'],
  'hsg-tehsil.json': ['soilgrids'], 'lithology-tehsil.json': ['lithology'],
  'pk-places.meta.json': ['geonames'], 'pk-places-osm.meta.json': ['osm'],
  'landslide-calibration.json': ['nasa_glc', 'era5'],
  'landslide-susceptibility30.json': ['copernicus_dem30', 'esa_worldcover', 'sentinel2', 'lithology', 'nasa_glc', 'giri'],   # v91.17.75 terrain30_landslide.py (agent T)
}
# live feeds, and datasets whose output files other workstreams rebuild in this sprint (glof-register, glof-lakes-live,
# flood-extent-calibration, cn-tehsil): their licence lives in open-feeds.json with the file it reaches
FEEDS = {
  'weather_feed': ['live API (server/api/provider.mjs)'], 'ecmwf': ['live API', 'data/outlook.json'], 'era5': ['live API', 'data/climatology.json', 'data/outlook-event-climate.json', 'data/drought-national.json', 'data/soil-moisture-climatology.json'],
  'glofas': ['live API', 'data/flood.json'], 'cams': ['live API', 'data/smog.json'], 'imerg': ['data/imerg/'],
  'sentinel2': ['data/glof-lakes-live.json'], 'sentinel1': ['data/flood-extent-calibration.json'], 'viirs': ['data/flood-extent-calibration.json'],
  'rgi': ['data/glof-register.json'], 'metno': ['/api/ext/metno'], 'usgs': ['/api/ext/usgs'],
  'pmd': ['station-lake (internal)', 'data/glof-register.json'], 'suparco': ['data/glof-register.json', 'data/glof-bulletins.json'], 'noaa_isd': ['station-lake (internal)'],
}

def rec(i, files=None):
    r = {'id': i}; r.update(D[i]); r.setdefault('customer', True)
    if files: r['reaches'] = files
    return r

def write(path, obj, pretty):
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        if pretty: json.dump(obj, f, indent=1, ensure_ascii=False)
        else: json.dump(obj, f, separators=(',', ':'), ensure_ascii=False)
    os.replace(tmp, path)

def main():
    changed = 0
    for fn, ids in FILES.items():
        p = os.path.join(DATA, fn)
        if not os.path.exists(p): print('skip (missing)', fn); continue
        raw = open(p, encoding='utf-8').read()
        j = json.loads(raw)
        if not isinstance(j, dict): print('skip (not an object)', fn); continue
        L = [rec(i) for i in ids]
        if j.get('licence') == L: print('ok  ', fn); continue
        out = {}
        placed = False
        for k, v in j.items():
            if k == 'licence': continue
            out[k] = v
            if not placed and k in ('source', 'sources', 'built', 'generated', 'type'): out['licence'] = L; placed = True
        if not placed: out = {'licence': L, **{k: v for k, v in j.items() if k != 'licence'}}
        pretty = '\n ' in raw[:400] or '\n  ' in raw[:400]
        write(p, out, pretty); changed += 1; print('head', fn, ids)
    p = os.path.join(DATA, 'open-feeds.json')
    feeds = {'built': datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z',
             'source': 'nigraan-local/scripts/licence_headers.py; licences read from each provider licence page and from audit/board/build_governance_legal.md section 2 (read 25 Sep 2026)',
             'method': 'one record per dataset that reaches the server as a live feed, or through an offline job whose output file another workstream rebuilds; "reaches" names where it lands. customer=false: internal reference, never in a customer output (NIGRAAN_INTERNAL_REF=1 shows it)',
             'n': len(FEEDS),
             'licence': [rec(i, f) for i, f in FEEDS.items()]}
    old = None
    try: old = json.load(open(p))
    except Exception: pass
    if not old or old.get('licence') != feeds['licence']:
        write(p, feeds, True); changed += 1; print('feeds open-feeds.json', len(FEEDS))
    else: print('ok   open-feeds.json')
    print('files rewritten:', changed)

if __name__ == '__main__':
    main()
