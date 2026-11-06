import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getJson } from '../start/api.js';
import { go } from '../nav.js';
import { usePlace, writePlace } from './place.js';
import { generateReport } from './climate.js';
import Guidance from './Guidance.jsx';

const STORE = 'agn.clientRisk.v1';

const ASSET_TYPES = [
  ['industrial', 'Industrial facility'],
  ['warehouse', 'Warehouse'],
  ['hospital', 'Hospital'],
  ['telecom', 'Telecom site'],
  ['energy', 'Energy site'],
  ['transport', 'Transport site'],
  ['bank', 'Bank branch'],
  ['agriculture', 'Agriculture'],
  ['water', 'Water site'],
  ['commercial', 'Commercial building'],
  ['data_centre', 'Data centre'],
];

const HAZARDS = [
  { key: 'rain', area: 'rain_hz', label: 'Heavy rain', screen: /daily rain|heavy rain/i },
  { key: 'flood', area: 'flood', label: 'Flood', screen: /flood position|river flood depth/i },
  { key: 'heat', area: 'heat', label: 'Heat stress', screen: /extreme heat|heat stress/i },
  { key: 'wind', area: 'wind', label: 'Wind and gusts', pick: 'Wind', hint: 'and gusts', screen: /wind|gust/i },
  { key: 'drought', area: 'drought', label: 'Drought', screen: /drought/i },
  { key: 'cold', area: 'cold', label: 'Cold stress (UTCI)', pick: 'Cold stress', hint: 'UTCI', screen: /cold/i },
  { key: 'glof', area: 'glof', label: 'Glacial lake outburst flood (GLOF)', pick: 'GLOF', hint: 'lake outburst', screen: /glof|glacial/i },
  { key: 'seismic', area: null, label: 'Seismic', screen: /seismic/i },
  { key: 'landslide', area: 'landslide', label: 'Landslide', screen: /landslide/i },
  { key: 'cyclone', area: null, label: 'Cyclone', screen: /cyclone/i },
];

const SHOW_ORDER = ['heat', 'cold', 'drought', 'rain', 'landslide', 'flood', 'seismic', 'wind', 'glof', 'cyclone'];

const HELP = {
  site: {
    title: 'Site Assessment', phase: 'Apply — single site',
    purpose: 'Screens the place chosen at the top of the page against the selected hazards for the asset type you pick.',
    input: 'The global place, asset type, selected hazards.',
    process: 'Reads the hazard engine’s served level for the site and for its tehsil on each hazard; nothing is scored on this page.',
    read: 'A level is not a probability. The asset type picks which hazards are shown and the advice; it does not change a level.',
    limits: 'The screening reads hazard levels only; it is not a survey of your asset. A loss assessment needs geometry, fragility, replacement value and downtime cost.',
  },
  portfolio: {
    title: 'Client portfolio', phase: 'Apply — rank the sites',
    purpose: 'Ranks the client’s sites by the highest hazard level NIGRAAN issues at each site, today and the next three days.',
    input: 'The site register added on this tab (template, CSV or XLSX upload, or rows pasted from a spreadsheet).',
    process: 'Reads the served levels at each site’s own point and orders the sites by level, then by the served hazard index.',
    read: 'Each row: the site, its tehsil, the leading hazard, the served 0–100 index where the server issues one, the level, and the data gaps. Report opens that site’s report.',
    limits: 'A level is not a probability of damage or loss. Not assessed is never counted as Normal.',
  },
  engineering: {
    title: 'Engineering Conditions', phase: 'Apply — design inputs',
    purpose: 'Assembles the atmospheric and terrain conditions an engineer asks for at concept stage.',
    input: 'The place, and the long records the screening engine holds for it.',
    process: 'Lays each parameter beside its screening value, the next 15 days, and a level or a standing state.',
    read: 'A coloured level is a screening verdict. Standing, observed, reference and input-required states are not a 15-day forecast.',
    limits: 'Concept-stage inputs. Not design values, not code-compliant, not return-period derived. Wind design speed, seismic PGA and flood design depth each need the relevant standard and a site study.',
  },
};

const CORE_FIELDS = ['asset_id', 'asset_name', 'industry', 'asset_type', 'geometry_type', 'source'];
const REC_FIELDS = ['criticality', 'maximum_tolerable_downtime_hr', 'construction_type', 'floor_elevation_m', 'backup_power'];

const FACT_TILES = [
  ['elevation', 'Terrain / elevation'],
  ['terrainPosition', 'Landform'],
  ['nearestWater', 'Catchment / river reach'],
  ['riverPoint', 'Stream corridor (height above stream)'],
  ['heightAboveRiver', 'Height above river'],
  ['floodHistory', 'Historical water (permanent water nearby)'],
  ['floodMap', 'River flood maps'],
  ['pastEvents', 'Past floods'],
  ['landCover', 'Land cover'],
  ['fault', 'Active faults'],
  ['normals', 'Climate normal (this month)'],
  ['glof', 'Glacial lakes'],
  ['flashCorridor', 'Flash corridor'],
  ['sun', 'Sun'],
];

const TEMPLATES = [
  { id: 'master_asset', label: 'Master Asset Register', columns: ['asset_id', 'asset_name', 'parent_company', 'business_unit', 'industry', 'asset_type', 'asset_subtype', 'country', 'province', 'district', 'address', 'latitude', 'longitude', 'geometry_id', 'geometry_type', 'criticality', 'maximum_tolerable_downtime_hr', 'operating_hours', 'construction_type', 'year_built', 'floor_elevation_m', 'flood_protection', 'drainage_condition', 'roof_type', 'cooling_type', 'backup_power', 'backup_duration_hr', 'data_owner', 'source', 'last_updated', 'confidence', 'confidentiality_class'] },
  { id: 'operating_limits', label: 'Operating Limits', columns: ['asset_id', 'variable', 'operator', 'threshold', 'unit', 'duration_minutes', 'action_lead_minutes', 'authority_type', 'authority_reference', 'required_action', 'owner_role', 'valid_from'] },
  { id: 'vulnerability_fragility', label: 'Vulnerability / Fragility', columns: ['vulnerability_id', 'asset_id_or_class', 'hazard', 'intensity_metric', 'intensity_unit', 'function_type', 'intensity_value', 'damage_ratio', 'operational_state', 'downtime_hr', 'construction_applicability', 'geographic_applicability', 'source', 'source_year', 'version', 'confidence', 'calibration_status', 'validation_status', 'notes'] },
  { id: 'engineering', label: 'Engineering Information', columns: ['asset_id', 'parameter', 'value', 'unit', 'datum_or_reference', 'design_standard', 'return_period_years', 'survey_date', 'responsible_engineer'] },
  { id: 'spatial_points', label: 'Spatial Points', columns: ['name', 'latitude', 'longitude', 'feature_type', 'asset_id', 'crs', 'accuracy_m', 'survey_date'] },
  { id: 'spatial_geometry', label: 'Polygon / Route Geometry', columns: ['feature_id', 'asset_id', 'feature_type', 'name', 'geometry_geojson', 'crs', 'accuracy_m'] },
  { id: 'incidents_losses', label: 'Historical Incidents / Losses', columns: ['incident_id', 'asset_id', 'hazard', 'start_time', 'end_time', 'observed_intensity', 'intensity_unit', 'downtime_hr', 'description'] },
  { id: 'ground_sensors', label: 'Ground Stations / Sensors', columns: ['sensor_id', 'asset_id', 'station_name', 'latitude', 'longitude', 'elevation_m', 'variable', 'timestamp', 'value', 'unit', 'qc_flag', 'instrument'] },
  { id: 'dependencies', label: 'Suppliers / Dependencies', columns: ['asset_id', 'dependency_id', 'dependency_type', 'name', 'location', 'criticality', 'max_outage_hr', 'alternate_available', 'recovery_time_hr'] },
  { id: 'critical_routes', label: 'Critical Routes / Networks', columns: ['route_id', 'asset_id', 'network_type', 'origin', 'destination', 'geometry_id', 'critical_nodes', 'operational_threshold', 'alternate_route'] },
];

function emptyProject() {
  return { client: '', projectId: '', serverSavedAt: '', activeId: '', assets: [], sheets: {}, geometryName: '' };
}

function loadProject() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!raw || typeof raw !== 'object') return emptyProject();
    return { ...emptyProject(), ...raw, assets: Array.isArray(raw.assets) ? raw.assets : [], sheets: raw.sheets || {} };
  } catch {
    return emptyProject();
  }
}

function persist(project) {
  try { localStorage.setItem(STORE, JSON.stringify(project)); } catch { /* the form still holds the project this visit */ }
  try {
    window.dispatchEvent(new CustomEvent('agn:client-risk', {
      detail: {
        assets: Array.isArray(project?.assets) ? project.assets.length : 0,
        limits: Array.isArray(project?.sheets?.operating_limits) ? project.sheets.operating_limits.length : 0,
      },
    }));
  } catch { /* Operations / other tabs refresh when they can */ }
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(columns, rows) {
  const head = columns.join(',');
  const body = rows.map((row) => columns.map((col) => csvCell(row[col])).join(','));
  return [head, ...body].join('\n');
}

function xml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toWorkbook(sheets) {
  const body = sheets.map((sheet) => {
    const rows = [sheet.columns, ...(sheet.rows || []).map((row) => sheet.columns.map((col) => row[col] ?? ''))];
    const table = rows.map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${xml(cell)}</Data></Cell>`).join('')}</Row>`).join('');
    return `<Worksheet ss:Name="${xml(sheet.name.slice(0, 31))}"><Table>${table}</Table></Worksheet>`;
  }).join('');
  return `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${body}</Workbook>`;
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function splitLine(line, sep) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseTable(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes('\t') && !lines[0].includes(',') ? '\t' : ',';
  const head = splitLine(lines[0], sep).map((cell) => cell.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitLine(line, sep);
    const row = {};
    head.forEach((key, index) => { if (key) row[key] = cells[index] || ''; });
    return row;
  }).filter((row) => Object.values(row).some(Boolean));
}

function assetFromRow(row, index) {
  const lat = Number(row.latitude || row.lat);
  const lon = Number(row.longitude || row.lon);
  const name = row.asset_name || row.name || row.site || '';
  if (!name && !row.asset_id) return null;
  return {
    asset_id: row.asset_id || `row-${index + 1}`,
    asset_name: name || row.asset_id,
    industry: row.industry || '',
    asset_type: row.asset_type || '',
    geometry_type: row.geometry_type || (Number.isFinite(lat) ? 'point' : ''),
    source: row.source || 'uploaded register',
    country: row.country || '',
    province: row.province || '',
    district: row.district || '',
    address: row.address || '',
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lon) ? lon : null,
    criticality: row.criticality || '',
    maximum_tolerable_downtime_hr: row.maximum_tolerable_downtime_hr || '',
    construction_type: row.construction_type || '',
    floor_elevation_m: row.floor_elevation_m || '',
    backup_power: row.backup_power || '',
    tehsil: row.tehsil || row.unit || row.location || row.district || '',
  };
}

function sampleAssets() {
  const rows = [
    ['SMP-A1', 'Farm house · Sheikhupura', 'agriculture', 'agriculture', 31.7131, 73.9783, 'Sheikhupura', 'Punjab', 3, 48, 'RCC frame, steel-truss roof over the produce shed', 0.6, 'generator'],
    ['SMP-A2', 'Goods depot · Muridke', 'transport', 'transport', 31.8022, 74.257, 'Muridke', 'Punjab', 3, 72, 'pre-engineered steel shed', 0.3, 'none'],
    ['SMP-A3', 'Port warehouse · Mauripur Road', 'transport', 'transport', 24.8608, 67.0104, 'Karachi', 'Sindh', 5, 168, 'reinforced concrete frame', 1.4, 'generator'],
    ['SMP-A4', 'Construction site · Jhimpir', 'other', 'commercial', 25.0186, 68.0143, 'Thatta', 'Sindh', 3, 72, 'site works: steel frame under erection', 0.3, 'generator'],
    ['SMP-A5', 'Logistics hub · Hattar Industrial Estate', 'transport', 'transport', 33.8596, 72.859, 'Haripur', 'Khyber Pakhtunkhwa', 3, 48, 'steel portal frame', 0.4, 'generator'],
    ['SMP-A6', 'Warehouse · Quetta Industrial Area', 'transport', 'transport', 30.1798, 66.975, 'Quetta', 'Balochistan', 3, 72, 'pre-engineered steel shed', 0.3, 'generator'],
    ['SMP-A7', 'Cold store · Gilgit', 'agriculture', 'industrial', 35.9208, 74.308, 'Gilgit', 'Gilgit-Baltistan', 4, 12, 'insulated panel on RCC base', 0.6, 'generator'],
    ['SMP-A8', 'Goods depot · Muzaffarabad', 'transport', 'transport', 34.37, 73.4711, 'Muzaffarabad', 'Azad Jammu and Kashmir', 3, 96, 'RCC frame on a cut slope', 0.5, 'generator'],
    ['SMP-A9', 'Warehouse · I-9 Industrial Area', 'transport', 'transport', 33.656, 73.048, 'Islamabad', 'Islamabad Capital Territory', 4, 48, 'pre-engineered steel shed on an RCC slab', 0.3, 'generator_and_ups'],
    ['SMP-A10', 'Cold store · Lahore', 'agriculture', 'industrial', 31.558, 74.35071, 'Lahore', 'Punjab', 4, 72, 'insulated panel on a steel portal frame', 0.6, 'generator_and_ups'],
  ];
  return rows.map(([asset_id, asset_name, industry, asset_type, latitude, longitude, tehsil, province, criticality, downtime, construction, floor, backup]) => ({
    asset_id,
    asset_name,
    industry,
    asset_type,
    geometry_type: 'point',
    source: 'Sample sites (example): invented values at real places',
    country: 'Pakistan',
    province,
    tehsil,
    district: tehsil,
    latitude,
    longitude,
    criticality,
    maximum_tolerable_downtime_hr: downtime,
    construction_type: construction,
    floor_elevation_m: floor,
    backup_power: backup,
    demo: true,
  }));
}

function sampleOperatingLimits() {
  /* Example thresholds only — invented for the sample sites so Operations can evaluate crossings. */
  return [
    { asset_id: 'SMP-A1', variable: 'tmax', operator: '>', threshold: 42, unit: '°C', duration_minutes: 120, action_lead_minutes: 360, authority_type: 'example', authority_reference: 'Sample SOP', required_action: 'Move outdoor labour into shade and pause harvest', owner_role: 'Farm operations', valid_from: '2026-01-01' },
    { asset_id: 'SMP-A2', variable: 'gust', operator: '>', threshold: 70, unit: 'km/h', duration_minutes: 30, action_lead_minutes: 180, authority_type: 'example', authority_reference: 'Sample SOP', required_action: 'Secure shed doors and halt loading', owner_role: 'Depot supervisor', valid_from: '2026-01-01' },
    { asset_id: 'SMP-A3', variable: 'rain_24h', operator: '>', threshold: 50, unit: 'mm', duration_minutes: 0, action_lead_minutes: 360, authority_type: 'example', authority_reference: 'Sample SOP', required_action: 'Raise goods off the floor and check drainage', owner_role: 'Warehouse lead', valid_from: '2026-01-01' },
    { asset_id: 'SMP-A4', variable: 'wet_bulb', operator: '>', threshold: 30, unit: '°C', duration_minutes: 60, action_lead_minutes: 240, authority_type: 'example', authority_reference: 'Sample SOP', required_action: 'Stop outdoor erection work and rest crews', owner_role: 'Site manager', valid_from: '2026-01-01' },
    { asset_id: 'SMP-A5', variable: 'gust', operator: '>', threshold: 65, unit: 'km/h', duration_minutes: 30, action_lead_minutes: 180, authority_type: 'example', authority_reference: 'Sample SOP', required_action: 'Pause yard movements and secure trailers', owner_role: 'Hub operations', valid_from: '2026-01-01' },
    { asset_id: 'SMP-A6', variable: 'tmax', operator: '>', threshold: 40, unit: '°C', duration_minutes: 120, action_lead_minutes: 360, authority_type: 'example', authority_reference: 'Sample SOP', required_action: 'Limit outdoor shifts and check cold-chain power', owner_role: 'Facilities', valid_from: '2026-01-01' },
    { asset_id: 'SMP-A7', variable: 'tmin', operator: '<', threshold: -5, unit: '°C', duration_minutes: 180, action_lead_minutes: 360, authority_type: 'example', authority_reference: 'Sample SOP', required_action: 'Protect pipes and confirm generator fuel', owner_role: 'Cold-store ops', valid_from: '2026-01-01' },
    { asset_id: 'SMP-A8', variable: 'rain_24h', operator: '>', threshold: 40, unit: 'mm', duration_minutes: 0, action_lead_minutes: 360, authority_type: 'example', authority_reference: 'Sample SOP', required_action: 'Inspect slope drainage above the depot', owner_role: 'Depot supervisor', valid_from: '2026-01-01' },
    { asset_id: 'SMP-A9', variable: 'gust', operator: '>', threshold: 75, unit: 'km/h', duration_minutes: 30, action_lead_minutes: 180, authority_type: 'example', authority_reference: 'Sample SOP', required_action: 'Close roller doors and halt forklift runs', owner_role: 'Warehouse lead', valid_from: '2026-01-01' },
    { asset_id: 'SMP-A10', variable: 'tmax', operator: '>', threshold: 41, unit: '°C', duration_minutes: 120, action_lead_minutes: 360, authority_type: 'example', authority_reference: 'Sample SOP', required_action: 'Confirm refrigeration load and shade outdoor staff', owner_role: 'Cold-store ops', valid_from: '2026-01-01' },
  ];
}

function decodeXml(value) {
  return String(value || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function objectsFromGrid(grid) {
  if (!grid.length) return [];
  const head = grid[0].map((cell) => String(cell || '').trim().toLowerCase());
  return grid.slice(1).map((cells) => {
    const row = {};
    head.forEach((key, index) => { if (key) row[key] = cells[index] == null ? '' : String(cells[index]); });
    return row;
  }).filter((row) => Object.values(row).some((value) => String(value).trim()));
}

function gridFromSpreadsheetMl(chunk) {
  const rows = [...chunk.matchAll(/<Row\b[\s\S]*?<\/Row>/gi)].map((match) => [...match[0].matchAll(/<Data\b[^>]*>([\s\S]*?)<\/Data>/gi)].map((cell) => decodeXml(cell[1])));
  return rows.filter((row) => row.some((cell) => String(cell).trim()));
}

function sheetsFromSpreadsheetMl(text) {
  const parts = text.split(/<Worksheet\b/i).slice(1);
  const chunks = parts.length ? parts : [text];
  return chunks.map((chunk, index) => ({ name: /ss:Name="([^"]+)"/i.exec(chunk)?.[1] || `Sheet ${index + 1}`, rows: objectsFromGrid(gridFromSpreadsheetMl(chunk)) })).filter((sheet) => sheet.rows.length);
}

function sharedStrings(xml) {
  return [...xml.matchAll(/<si\b[\s\S]*?<\/si>/gi)].map((match) => [...match[0].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((cell) => decodeXml(cell[1])).join(''));
}

function columnIndex(ref) {
  const letters = String(ref || '').replace(/[0-9]/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

function gridFromSheetXml(xml, strings) {
  const rows = [...xml.matchAll(/<row\b[\s\S]*?<\/row>/gi)].map((match) => {
    const cells = [];
    for (const cell of match[0].match(/<c\b[\s\S]*?<\/c>/gi) || []) {
      const ref = /r="([A-Z]+)\d+"/i.exec(cell);
      const type = /t="([^"]+)"/i.exec(cell);
      const value = /<v>([\s\S]*?)<\/v>/i.exec(cell);
      const inline = /<t\b[^>]*>([\s\S]*?)<\/t>/i.exec(cell);
      let text = '';
      if (type?.[1] === 's' && value) text = strings[Number(value[1])] || '';
      else if (inline) text = decodeXml(inline[1]);
      else if (value) text = decodeXml(value[1]);
      cells[ref ? columnIndex(ref[1]) : cells.length] = text;
    }
    return cells;
  });
  return rows.filter((row) => row.some((cell) => String(cell || '').trim()));
}

async function unzip(buffer) {
  const view = new DataView(buffer);
  const files = {};
  let offset = 0;
  while (offset + 30 < buffer.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 30, nameLen));
    const start = offset + 30 + nameLen + extraLen;
    const compressed = new Uint8Array(buffer, start, size);
    let bytes = compressed;
    if (method === 8 && typeof DecompressionStream === 'function') {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    if (method === 0 || method === 8) files[name] = new TextDecoder().decode(bytes);
    offset = start + size;
  }
  return files;
}

async function sheetsFromXlsx(buffer) {
  const files = await unzip(buffer);
  const strings = sharedStrings(files['xl/sharedStrings.xml'] || '');
  return Object.keys(files)
    .filter((name) => /xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort()
    .map((name, index) => ({ name: `Sheet ${index + 1}`, rows: objectsFromGrid(gridFromSheetXml(files[name], strings)) }))
    .filter((sheet) => sheet.rows.length);
}

async function readUpload(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return sheetsFromXlsx(buffer);
  if (/<Workbook\b|<Worksheet\b/i.test(text)) return sheetsFromSpreadsheetMl(text);
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) return [{ name: 'json', rows: [], json: text }];
  return [{ name: file.name, rows: parseTable(text) }];
}

function sheetLooksLikeSites(rows) {
  const row = rows[0] || {};
  return row.latitude != null || row.lat != null || row.longitude != null || row.lon != null || row.asset_name != null || row.asset_id != null || row.name != null;
}

function filled(asset, fields) {
  const present = fields.filter((key) => asset && asset[key] != null && String(asset[key]).trim() !== '');
  return { percent: Math.round((present.length / fields.length) * 100), missing: fields.filter((key) => !present.includes(key)) };
}

function factLine(field) {
  if (!field || field.value == null || field.value === '') return 'missing';
  return `available${field.source ? ` · ${field.source}` : ''}`;
}

function peakDay(hazard) {
  if (!hazard) return null;
  const days = Array.isArray(hazard.days) ? hazard.days : [];
  if (hazard.peak?.date) return days.find((day) => day.date === hazard.peak.date) || { ...hazard.peak, assessed: hazard.peak.word != null };
  return days.find((day) => day && day.assessed && day.word) || null;
}

function areaPeak(levels, key) {
  if (!key) return null;
  let best = null;
  for (const day of levels?.days || []) {
    const layer = day.layers?.[key];
    if (!layer || layer.word == null || layer.level == null || Number(layer.level) < 0) continue;
    const row = { word: layer.word, level: Number(layer.level), day: day.day, date: day.date || '' };
    if (!best || row.level > best.level) best = row;
  }
  return best;
}

function when(row) {
  if (!row) return '';
  if (row.date) return row.date;
  if (row.day === 0) return 'today';
  if (row.day != null) return `day +${row.day}`;
  return '';
}

function screenRow(rows, pattern) {
  return (rows || []).find((row) => pattern.test(row.parameter || '')) || null;
}

function engineLine(engine) {
  if (!engine) return '';
  if (typeof engine === 'string') return engine;
  return engine.note || engine.name || engine.method || '';
}

function shortSite(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return 'No level';
  if (value.length <= 72) return value;
  if (/cannot happen here/i.test(value)) return 'Cannot happen here';
  if (/not tested|no wind level|gust ladder/i.test(value)) return 'Not tested';
  if (/not scored|no point method|tehsil inputs/i.test(value)) return 'Not scored at the point';
  if (/reach value, not a point|gauged reach/i.test(value)) return 'No point level';
  if (/not assessed|no level|did not return/i.test(value)) return 'No level';
  const category = value.match(/Seismic Design Category [A-F]/i);
  if (category) return category[0];
  return `${value.slice(0, 68).replace(/\s+\S*$/, '')}…`;
}

function cap(text) {
  const value = String(text || 'No level').trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'No level';
}

function DriverText({ text }) {
  const clean = String(text || '—').replace(/\s+·\s+/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= 210) return <p className="cr-driver">{clean}</p>;
  const head = clean.slice(0, 188).replace(/\s+\S*$/, '');
  return (
    <details className="cr-more">
      <summary><span>{head}…</span><em>More</em></summary>
      <p className="cr-driver">{clean}</p>
    </details>
  );
}

function describeHazard(spec, siteHazards, levels, rows, facts) {
  const hazard = siteHazards?.[spec.key] || null;
  const day = peakDay(hazard);
  const area = areaPeak(levels, spec.area);
  const screen = screenRow(rows, spec.screen);
  const bits = [day?.basis, hazard?.method, screen?.source, screen?.meaning].filter(Boolean);
  if (day?.word) {
    const score = Number.isFinite(+day.score) ? ` · index ${day.score}/100` : '';
    const tehsil = /tehsil/i.test(hazard?.method || '') ? ' · tehsil level' : '';
    return { key: spec.key, label: spec.label, word: day.word, level: Number(day.level), score: Number.isFinite(+day.score) ? Number(day.score) : null, site: `${when(day)}${score}${tehsil}`.replace(/^ · /, ''), area: area ? `${area.word} · ${when(area)}` : 'no level', driver: bits.join(' · ') || '—' };
  }
  if (spec.key === 'seismic') {
    return { key: spec.key, label: spec.label, word: screen?.verdict || '', level: null, site: shortSite(screen?.values), area: screen?.forecast || 'no level', driver: bits.join(' · ') || screen?.values || '—' };
  }
  if (spec.key === 'glof') {
    const glof = facts?.glof;
    const relevant = glof && glof.applicable !== false && glof.value != null;
    return {
      key: spec.key,
      label: spec.label,
      word: relevant ? '' : 'not relevant',
      level: null,
      site: relevant ? `${glof.value} ${glof.unit || ''}`.trim() : (glof ? 'not relevant at this place' : 'no level'),
      area: area ? `${area.word} · ${when(area)}` : (glof && glof.applicable === false ? 'not relevant' : 'no level'),
      driver: [glof?.source, hazard?.method, screen?.meaning].filter(Boolean).join(' · ') || '—',
    };
  }
  if (spec.key === 'cyclone') {
    return { key: spec.key, label: spec.label, word: '', level: null, site: 'no level', area: 'no level', driver: 'The site-level engine did not return a cyclone row for this coordinate.' };
  }
  return {
    key: spec.key,
    label: spec.label,
    word: '',
    level: null,
    site: shortSite(hazard?.method || screen?.values || screen?.verdict),
    area: area ? `${area.word} · ${when(area)}` : 'no level',
    driver: bits.join(' · ') || '—',
  };
}

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LEVEL_WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];

function prettyDate(iso) {
  const day = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(day.getTime())) return iso;
  return `${WEEK[day.getUTCDay()]} ${day.getUTCDate()} ${MONTH[day.getUTCMonth()]}`;
}

function siteBits(site) {
  const text = String(site || '');
  const date = text.match(/\d{4}-\d{2}-\d{2}/);
  const index = text.match(/index\s+(\d+)\/100/i);
  return { date: date ? prettyDate(date[0]) : text, index: index ? index[1] : null, tehsil: /tehsil/i.test(text) };
}

function areaBits(area) {
  const text = String(area || 'no level');
  const match = /^(Normal|Low|Moderate|High|Severe)\s*·\s*(.*)$/.exec(text);
  if (!match) return { word: '', rest: text === 'no level' ? 'No level' : text, date: '' };
  const date = match[2].match(/\d{4}-\d{2}-\d{2}/);
  return { word: match[1], rest: '', date: date ? prettyDate(date[0]) : match[2] };
}

function ResultBoard({ results }) {
  return (
    <div className="cr-board">
      <div className="cr-head"><span>Hazard</span><span>At the site</span><span>Area level</span></div>
      {results.map((row) => {
        const site = row.word ? siteBits(row.site) : null;
        const area = areaBits(row.area);
        return (
          <article key={row.key} className={`hzt hzt-${row.key}`}>
            <b><i />{row.label}</b>
            <div className="cr-pair">
              {row.word ? <em className={`cr-pill ${lvClass(row.word)}`}>{row.word}</em> : <span className="cr-quiet">{cap(row.site)}</span>}
              {site ? <span className="cr-when">{site.date}{site.index != null ? ` · ${site.index}/100` : ''}{site.tehsil ? ' · tehsil' : ''}</span> : null}
              {row.score != null && (
                <div className={`cr-meter ${lvClass(row.word)}`} aria-hidden="true">
                  <span><i style={{ width: `${Math.max(4, Math.min(100, row.score))}%` }} /></span>
                </div>
              )}
            </div>
            <div className="cr-pair">
              {area.word ? <em className={`cr-pill ${lvClass(area.word)}`}>{area.word}</em> : <span className="cr-quiet">{cap(area.rest)}</span>}
              {area.date ? <span className="cr-when">{area.date}</span> : null}
            </div>
            <DriverText text={row.driver} />
          </article>
        );
      })}
    </div>
  );
}
const PORT_HZ = [['heat', 'Heat stress'], ['cold', 'Cold stress'], ['wind', 'Wind and gusts'], ['rain', 'Heavy rain'], ['flood', 'River flood'], ['landslide', 'Landslide'], ['drought', 'Drought']];

function plain(text) {
  return String(text ?? '')
    .replace(/\s*\((?:[\w.-]+\/)*[\w.-]+\.(?:mjs|js|py|json|csv|parquet)\)/g, '')
    .replace(/(?:[\w.-]+\/)+[\w.-]+\.(?:mjs|js|py|json|csv|parquet)\b/g, '')
    .replace(/\b[\w-]+\.(?:mjs|js|py|json|csv|parquet)\b/g, '')
    .replace(/(\d)\((\w*)\)/g, '$1 ($2)')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([;,.)])/g, '$1')
    .trim();
}

function dayName(date) {
  const time = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(time.getTime())) return String(date || '');
  return `${WEEK[time.getUTCDay()]} ${time.getUTCDate()}`;
}

function dayLong(date) {
  if (!date) return '';
  const time = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(time.getTime())) return '';
  return `${WEEK[time.getUTCDay()]} ${time.getUTCDate()} ${MONTH[time.getUTCMonth()]}`;
}

function placeRows(record) {
  if (!record || record.ok === false) return [['Place record', `not available${record?.why ? `: ${record.why}` : ''}`, '']];
  const rows = [];
  const seismic = record.seismic;
  const rain = record.rainReturn;
  const river = record.river;
  let stations = record.stations;
  const accuracy = record.accuracy;
  if (record.modelCheck && record.modelCheck.passed === false) {
    rows.push(['Model check', `failed: ${record.modelCheck.why || 'the model gate did not pass'} · the levels of this place are withheld`, '']);
  }
  if (seismic) {
    if (seismic.assessed && seismic.bcp2021) {
      const code = seismic.bcp2021;
      const older = seismic.bcp2007?.codeClass ? ` · ${seismic.bcp2007.label}: ${seismic.bcp2007.codeClass}` : '';
      rows.push(['Seismic design category (code class, not a forecast)', `${code.label}: ${code.codeClass}${code.siteClassAssumed ? ` (site class ${code.siteClass} assumed)` : ''}${older}`, code.source || '']);
    } else rows.push(['Seismic design category', `not assessed${seismic.why ? `: ${seismic.why}` : ''}`, '']);
  }
  if (rain) {
    const day = rain.ready && rain.durations?.['24h'];
    if (day) {
      const values = day.pointRl || day.areaRl || [];
      const periods = rain.returnPeriods || [];
      const levels = [2, 10, 100].filter((year) => periods.indexOf(year) >= 0).map((year) => `${year}-year ${values[periods.indexOf(year)]} mm`).join(' · ');
      rows.push([`24-hour rain return levels (${day.pointRl ? 'point' : 'area'})`, levels, `${day.scale || ''}${day.years ? ` · ${day.years} years of record` : ''}`]);
    } else rows.push(['Rain return levels', `not assessed${rain.why ? `: ${rain.why}` : ''}`, '']);
  }
  if (river?.measured?.length) {
    const gauge = river.measured[0];
    rows.push(['River measured (nearest gauge)', `${gauge.station || ''}${gauge.river ? ` (${gauge.river})` : ''}: ${gauge.status || gauge.word || ''}${gauge.flowCusec != null ? ` · ${Math.round(gauge.flowCusec).toLocaleString('en-US')} cusec measured` : ''}${gauge.date ? ` on ${gauge.date}` : ''}`, 'river gauge sheet (observed); days 1-3 carry the status forward']);
  }
  if (river) {
    const assessed = (river.days || []).filter((day) => day.assessed);
    const first = (river.days || [])[0];
    let status = river.why || first?.why || (river.noGaugedReach ? 'no gauged reach' : 'no river status');
    if (river.assessed && assessed.length) status = assessed.slice(0, 4).map((day) => `${dayName(day.date)}: ${day.word || ''}`).join(' · ');
    else {
      status = String(status).replace(/^not assessed:\s*/, '');
      if (!/^cannot happen here/.test(status)) status = `not assessed: ${status}`;
    }
    const reaches = (river.reaches || []).map((item) => `${item.river} (${item.insideKm} km)`).join(', ');
    const share = Number.isFinite(+river.floodplainShare) ? `${reaches ? '; ' : ''}${Math.round(river.floodplainShare * 100)} % of the tehsil on the floodplain (a fact, not part of the level)` : '';
    rows.push(['River status', status, `${reaches}${share}`]);
  }
  if (stations?.unavailable) {
    rows.push(['AGN stations', String(stations.unavailable), stations.rule || '']);
    stations = null;
  }
  if (stations) {
    const near = stations.near || {};
    const fleet = stations.fleet || {};
    const value = stations.ready === false && !fleet.reportingNow
      ? `not yet checked: ${fleet.notYetChecked || 0} of ${fleet.total || 0} stations`
      : `${near.reportingNow || 0} reporting now within ${near.km || '–'} km · ${fleet.reportingNow || 0} of ${fleet.total || 0} across the network`;
    rows.push(['AGN stations', value, stations.rule || '']);
  }
  if (accuracy) rows.push(['Forecast accuracy', accuracy.text || (accuracy.headline?.maeC != null ? `${accuracy.headline.maeC} °C` : accuracy.headline?.why) || 'not measured', accuracy.basis || '']);
  const leads = accuracy?.byLead?.TX || accuracy?.byLead?.T || [];
  if (leads.length) {
    rows.push(['Forecast accuracy by lead day (max temperature)', leads.map((item) => {
      const label = `day ${item.lead}: `;
      if (item.maeC != null && !item.notMeasured && !item.notEnoughDays) return `${label}${item.maeC} °C${item.scoredDays != null ? ` (${item.scoredDays} days)` : ''}`;
      if (item.notEnoughDays) return `${label}not enough days yet${item.scoredDays != null ? ` (${item.scoredDays} scored)` : ''}`;
      return `${label}not measured`;
    }).join(' · '), 'a figure is shown only for a lead day with enough scored days']);
  }
  return rows.map((row) => row.map(plain));
}

function PlaceRecord({ record }) {
  if (!record || record.ok === false) {
    return <p className="cr-note">Place record not available{record?.why ? `: ${plain(record.why)}` : ''}.</p>;
  }
  const seismic = record.seismic;
  const code = seismic?.assessed && seismic.bcp2021 ? seismic.bcp2021 : null;
  const rain = record.rainReturn;
  const day = rain?.ready && rain.durations?.['24h'];
  const periods = rain?.returnPeriods || [];
  const values = day ? (day.pointRl || day.areaRl || []) : [];
  const rainYears = [2, 10, 100].filter((year) => periods.indexOf(year) >= 0).map((year) => ({ year, mm: values[periods.indexOf(year)] }));
  const river = record.river;
  const assessed = (river?.days || []).filter((item) => item.assessed);
  const first = (river?.days || [])[0];
  let riverStatus = river?.why || first?.why || (river?.noGaugedReach ? 'no gauged reach' : '');
  if (river?.assessed && assessed.length) riverStatus = assessed.slice(0, 4).map((item) => `${dayName(item.date)}: ${item.word || ''}`).join(' · ');
  else if (riverStatus) {
    riverStatus = String(riverStatus).replace(/^not assessed:\s*/, '');
    if (!/^cannot happen here/.test(riverStatus)) riverStatus = `not assessed: ${riverStatus}`;
  }
  const reaches = (river?.reaches || []).map((item) => `${item.river} (${item.insideKm} km)`).join(', ');
  const share = Number.isFinite(+river?.floodplainShare) ? `${Math.round(river.floodplainShare * 100)}% of the tehsil is on the floodplain` : '';
  const gauge = river?.measured?.[0];
  let stations = record.stations;
  const stationsDown = stations?.unavailable ? String(stations.unavailable) : '';
  if (stations?.unavailable) stations = null;
  const near = stations?.near || {};
  const fleet = stations?.fleet || {};
  const accuracy = record.accuracy;
  const mae = accuracy?.headline?.maeC;
  const leads = accuracy?.byLead?.TX || accuracy?.byLead?.T || [];
  const riverText = String(gauge
    ? `${gauge.station || ''}${gauge.river ? ` (${gauge.river})` : ''}: ${gauge.status || gauge.word || ''}${gauge.flowCusec != null ? ` · ${Math.round(gauge.flowCusec).toLocaleString('en-US')} cusec` : ''}`
    : riverStatus || '').trim();
  const riverTone = /^cannot happen here/i.test(riverText) ? 'off' : /^not assessed/i.test(riverText) ? 'wait' : riverText ? 'on' : 'off';
  const riverChip = riverTone === 'off' && /^cannot happen here/i.test(riverText) ? 'Cannot happen here' : riverTone === 'wait' ? 'Not assessed' : riverText ? 'On record' : 'No status';
  const riverBody = riverText.replace(/^(cannot happen here|not assessed):\s*/i, '').replace(/^level not tested here:\s*/i, '').replace(/^./, (letter) => letter.toUpperCase());
  const floodplain = Number.isFinite(+river?.floodplainShare) ? `${Math.round(river.floodplainShare * 100)}%` : '';
  const sources = [
    code?.source && ['Seismic', plain(`${code.source}${code.siteClassAssumed ? `. Site class ${code.siteClass} assumed.` : ''}`)],
    !code && seismic?.why && ['Seismic', plain(seismic.why)],
    day && ['Rain', plain([day.scale, day.years ? `${day.years} years of record` : ''].filter(Boolean).join(' · '))],
    !day && rain?.why && ['Rain', plain(rain.why)],
    (accuracy?.text || accuracy?.basis) && ['Forecast', plain([accuracy.text, accuracy.basis].filter(Boolean).join(' '))],
    stations?.rule && ['Stations', plain(stations.rule)],
    gauge && ['River', 'River gauge sheet, observed. Days 1–3 carry the status forward.'],
    reaches && ['River reach', plain(reaches)],
  ].filter(Boolean);
  return (
    <div className="cr-place">
      {record.modelCheck?.passed === false && <p className="cr-warn">Model check failed: {plain(record.modelCheck.why || 'the model gate did not pass')}. The levels of this place are withheld.</p>}
      <div className="cr-meters">
        <article className="cr-rec">
          <span>Seismic code</span>
          {code ? (
            <div className="cr-figs">
              <div><b>{code.codeClass}</b><small>BCP 2021</small></div>
              {seismic.bcp2007?.codeClass ? <div><b>{seismic.bcp2007.codeClass}</b><small>BCP 2007</small></div> : null}
            </div>
          ) : <b className="cr-miss">Not assessed</b>}
        </article>
        <article className="cr-rec">
          <span>24-hour rain{day ? ` · ${day.pointRl ? 'point' : 'area'}` : ''}</span>
          {rainYears.length ? (
            <div className="cr-figs">
              {rainYears.map((item) => <div key={item.year}><b>{item.mm}</b><small>{item.year}-year</small></div>)}
            </div>
          ) : <b className="cr-miss">Not assessed</b>}
        </article>
        <article className="cr-rec">
          <span>Forecast error</span>
          {mae != null ? <div className="cr-figs"><div><b>{mae}°</b><small>mean °C</small></div></div> : <b className="cr-miss">Not measured</b>}
        </article>
        <article className="cr-rec">
          <span>AGN stations</span>
          {stations ? (
            <div className="cr-figs">
              <div><b>{near.reportingNow || 0}</b><small>within {near.km || '–'} km</small></div>
              <div><b>{fleet.reportingNow || 0}</b><small>of {fleet.total || 0}</small></div>
            </div>
          ) : <b className="cr-miss">{stationsDown || 'Not checked'}</b>}
        </article>
      </div>
      {!!leads.length && (
        <div className="cr-band">
          <span>By lead</span>
          {leads.map((item) => {
            const measured = item.maeC != null && !item.notMeasured && !item.notEnoughDays;
            return (
              <div key={item.lead} className={measured ? '' : 'off'}>
                <span>Day {item.lead}</span>
                <b>{measured ? `${item.maeC}°` : '—'}</b>
                <small>{item.scoredDays != null ? `${item.scoredDays}d` : ''}</small>
              </div>
            );
          })}
        </div>
      )}
      {(river || gauge) && (
        <div className="cr-river">
          <div>
            <em className={riverTone}>{riverChip}</em>
            {riverBody ? <p>{plain(riverBody)}</p> : null}
          </div>
          {floodplain ? <div className="cr-figs"><div><b>{floodplain}</b><small>on the floodplain</small></div></div> : null}
        </div>
      )}
      {!!sources.length && (
        <details className="cr-src">
          <summary>Where these figures come from</summary>
          <ul>
            {sources.map(([label, text]) => <li key={label}><b>{label}</b><span>{text}</span></li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function gapKind(day) {
  const why = `${day?.why || ''} ${day?.tehsilValue?.why || ''}`;
  if (/cannot happen here/i.test(why)) return 'cannot';
  if (day?.state === 'not_tested' || /^not tested/i.test(String(day?.why || ''))) return 'nottested';
  return 'na';
}

function judgeSite(state) {
  const blank = { ok: false, place: '', why: '', lead: null, gaps: { cannot: [], nottested: [], na: [] } };
  if (!state) return { ...blank, why: 'not checked yet' };
  if (state.outside || (state.ok === false && !state.place)) return { ...blank, why: 'outside Pakistan: no level is issued there' };
  const located = state.place || {};
  const placeName = located.tehsil ? `${located.tehsil}${located.district && located.district !== located.tehsil ? `, ${located.district}` : ''}` : '';
  const part = state.parts?.siteLevels;
  const levels = part && !part.unavailable && part.v?.hazards ? part.v : null;
  if (!levels) return { ...blank, place: placeName, why: `the levels at this site did not arrive${part?.why ? `: ${part.why}` : ''}` };
  const gaps = { cannot: [], nottested: [], na: [] };
  let best = null;
  PORT_HZ.forEach(([key, name]) => {
    const hazard = levels.hazards[key];
    if (!hazard) return;
    let top = null;
    (hazard.days || []).forEach((day) => {
      let level = null;
      let by = 'site';
      if (day.assessed && Number.isFinite(+day.level)) level = +day.level;
      else if (Number.isFinite(+day.tehsilValue?.level)) { level = +day.tehsilValue.level; by = 'tehsil'; }
      if (level == null) return;
      const score = day.assessed && Number.isFinite(+day.score) ? +day.score : null;
      if (!top || level > top.level || (level === top.level && (score ?? -1) > (top.score ?? -1))) top = { level, score, date: day.date, by };
    });
    if (!top) {
      const first = (hazard.days || [])[0] || {};
      gaps[gapKind(first)].push({ name, why: first.why || first.tehsilValue?.why || '' });
      return;
    }
    const candidate = { name, ...top };
    if (!best || candidate.level > best.level || (candidate.level === best.level && (candidate.score ?? -1) > (best.score ?? -1))) best = candidate;
  });
  return { ok: true, place: placeName, why: '', lead: best, gaps };
}

function lvClass(word) {
  const name = String(word || '').toLowerCase();
  if (name.startsWith('severe')) return 'severe';
  if (name.startsWith('high')) return 'high';
  if (name.startsWith('moderate')) return 'moderate';
  if (name.startsWith('low')) return 'low';
  if (name.startsWith('normal')) return 'normal';
  return '';
}

function ReportLine({ report }) {
  if (!report) return null;
  if (report.busy) return <p className="cr-note">Making the report on the server…</p>;
  if (!report.ok) return <p className="cr-note">{report.why || 'The report could not be made.'}</p>;
  return (
    <p className="cr-note">
      <a href={report.html}>Open {report.id}</a>
      {report.pdf && <> · <a href={`${report.pdf}?download=1`} download={`${report.id}.pdf`}>Download PDF</a></>}
      {report.pages ? ` · ${report.pages} pages` : ''}
    </p>
  );
}

export default function ClientRisk() {
  const { place, bundle } = usePlace('default,siteLevels,siteScreening,facts,placeRecord');
  const [project, setProject] = useState(loadProject);
  const [note, setNote] = useState('');
  const [backendOpen, setBackendOpen] = useState(false);
  const [helpKey, setHelpKey] = useState(null);
  const [pane, setPane] = useState('site');
  const [formOpen, setFormOpen] = useState(true);
  const [assetType, setAssetType] = useState('industrial');
  const [checks, setChecks] = useState(() => Object.fromEntries(HAZARDS.map((hazard) => [hazard.key, hazard.key !== 'glof'])));
  const [siteScreens, setSiteScreens] = useState({});
  const askedScreens = useRef(new Set());
  const [report, setReport] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [templateId, setTemplateId] = useState('vulnerability_fragility');
  const [sampleView, setSampleView] = useState(null);
  const [serverList, setServerList] = useState(null);
  const [caseLine, setCaseLine] = useState('');
  const [horizon, setHorizon] = useState('present');
  const [rated, setRated] = useState('');
  const sitesFile = useRef(null);
  const filledFile = useRef(null);
  const packFile = useRef(null);
  const projectFile = useRef(null);
  const geoFile = useRef(null);

  const template = TEMPLATES.find((item) => item.id === templateId) || TEMPLATES[2];
  const assets = project.assets || [];
  const active = assets.find((asset) => asset.asset_id === project.activeId) || null;
  const demo = assets.some((asset) => asset.demo);
  const screen = bundle?.parts?.siteScreening?.v;
  const facts = bundle?.parts?.facts?.v?.fields || {};
  const near = bundle?.place?.near;

  useEffect(() => {
    let cancel = false;
    const pending = assets.filter((asset) => Number.isFinite(+asset.latitude) && Number.isFinite(+asset.longitude) && !askedScreens.current.has(asset.asset_id));
    pending.forEach((asset) => askedScreens.current.add(asset.asset_id));
    if (!pending.length) return undefined;
    (async () => {
      for (let index = 0; index < pending.length; index += 10) {
        if (cancel) return;
        const chunk = pending.slice(index, index + 10);
        const pts = chunk.map((asset) => `${Number(asset.latitude).toFixed(5)},${Number(asset.longitude).toFixed(5)}`).join(';');
        try {
          const body = await getJson(`/api/point/batch?pts=${encodeURIComponent(pts)}&with=place,siteLevels`);
          const states = body?.states || [];
          if (cancel) return;
          setSiteScreens((current) => {
            const next = { ...current };
            chunk.forEach((asset, item) => { next[asset.asset_id] = judgeSite(states[item]); });
            return next;
          });
        } catch {
          if (cancel) return;
          setSiteScreens((current) => {
            const next = { ...current };
            chunk.forEach((asset) => { next[asset.asset_id] = { ok: false, why: 'the server did not answer', gaps: { cannot: [], nottested: [], na: [] } }; });
            return next;
          });
        }
      }
    })();
    return () => {
      cancel = true;
      pending.forEach((asset) => askedScreens.current.delete(asset.asset_id));
    };
  }, [assets]);

  function commit(next) {
    setProject(next);
    persist(next);
  }

  function patch(partial) {
    commit({ ...project, ...partial });
  }

  const ready = Boolean(bundle?.ok);
  const results = useMemo(() => {
    if (!ready) return [];
    const siteHazards = bundle.parts?.siteLevels?.v?.hazards || {};
    const levels = bundle.parts?.levels?.v;
    const rows = screen?.rows || [];
    return SHOW_ORDER
      .map((key) => HAZARDS.find((hazard) => hazard.key === key))
      .filter((hazard) => hazard && checks[hazard.key])
      .map((hazard) => describeHazard(hazard, siteHazards, levels, rows, facts));
  }, [ready, bundle, checks, screen, facts]);

  const leading = useMemo(() => {
    const ranked = results.filter((row) => Number.isFinite(row.level));
    if (!ranked.length) return results[0] || null;
    return ranked.reduce((best, row) => (row.level > best.level ? row : best));
  }, [results]);

  const core = filled(active, CORE_FIELDS);
  const recommended = filled(active, REC_FIELDS);
  const factCount = FACT_TILES.filter(([key]) => facts[key] && facts[key].value != null && facts[key].value !== '').length;

  function askReport(kind) {
    if (!place) { setNote('Choose a place at the top of the page first.'); return; }
    askReportAt({ latitude: place.lat, longitude: place.lon, asset_name: place.name }, kind);
  }

  function askReportAt(asset, kind = 'site_assessment') {
    if (!Number.isFinite(+asset.latitude) || !Number.isFinite(+asset.longitude)) { setNote('That site has no coordinates.'); return; }
    setReportOpen(true);
    setReport({ busy: true, name: asset.asset_name || asset.asset_id || 'Site', assetId: asset.asset_id || '' });
    generateReport({ lat: +asset.latitude, lon: +asset.longitude, kind, section: 'assets', edition: 'main', name: asset.asset_name || asset.asset_id || 'Site' })
      .then((body) => setReport({ ...(body || { ok: false }), name: asset.asset_name || asset.asset_id || 'Site', assetId: asset.asset_id || '' }))
      .catch(() => setReport({ ok: false, name: asset.asset_name || asset.asset_id || 'Site', assetId: asset.asset_id || '' }));
  }

  function screenSite(asset) {
    if (!Number.isFinite(+asset.latitude) || !Number.isFinite(+asset.longitude)) { setNote('That site has no coordinates.'); return; }
    patch({ activeId: asset.asset_id || project.activeId });
    writePlace({ lat: +asset.latitude, lon: +asset.longitude, name: asset.asset_name || asset.asset_id || 'Site' }, '/analyst?tab=assessments');
    setPane('site');
    setTimeout(() => document.querySelector('.cr-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  }

  function showPortfolio() {
    setPane('portfolio');
    setTimeout(() => document.getElementById('cr-portfolio')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  }

  function addAssets(rows, origin, extra = {}) {
    const incoming = rows.map(assetFromRow).filter(Boolean);
    if (!incoming.length) { setNote(`No site rows were found in ${origin}. Keep the header row (asset_id, asset_name, latitude, longitude).`); return; }
    const known = new Set(assets.map((asset) => asset.asset_id));
    const fresh = incoming.filter((asset) => !known.has(asset.asset_id));
    commit({ ...project, ...extra, assets: [...assets, ...fresh], activeId: project.activeId || fresh[0]?.asset_id || incoming[0]?.asset_id || '' });
    setNote(fresh.length ? `${fresh.length} site${fresh.length === 1 ? '' : 's'} added from ${origin}.` : `Every site in ${origin} is already in the register.`);
    showPortfolio();
  }

  function loadSample() {
    const sample = sampleAssets();
    const sampleLimits = sampleOperatingLimits();
    const ids = new Set(sample.map((asset) => asset.asset_id));
    const kept = assets.filter((asset) => !asset.demo && !ids.has(asset.asset_id));
    const existingLimits = Array.isArray(project.sheets?.operating_limits) ? project.sheets.operating_limits : [];
    const keptLimits = existingLimits.filter((row) => !ids.has(String(row.asset_id)));
    commit({
      ...project,
      client: project.client || 'Sample sites (example)',
      assets: [...kept, ...sample],
      activeId: sample[0].asset_id,
      sheets: {
        ...project.sheets,
        operating_limits: [...keptLimits, ...sampleLimits],
      },
    });
    setNote('Sample loaded: 10 example sites with example operating limits. The values are invented and sit at real places. They are not a client register.');
    showPortfolio();
  }

  function clearSample() {
    const kept = assets.filter((asset) => !asset.demo);
    const sampleIds = new Set(sampleAssets().map((asset) => asset.asset_id));
    const existingLimits = Array.isArray(project.sheets?.operating_limits) ? project.sheets.operating_limits : [];
    commit({
      ...project,
      assets: kept,
      activeId: kept.some((asset) => asset.asset_id === project.activeId) ? project.activeId : '',
      client: project.client === 'Sample sites (example)' && !kept.length ? '' : project.client,
      sheets: {
        ...project.sheets,
        operating_limits: existingLimits.filter((row) => !sampleIds.has(String(row.asset_id))),
      },
    });
    setNote('Sample client cleared.');
  }

  async function takeSheets(file, preferSites) {
    setNote(`Reading ${file.name}…`);
    let sheets = [];
    try { sheets = await readUpload(file); } catch { setNote(`${file.name} could not be read. Use CSV, or the Excel file from Download template.`); return; }
    const jsonSheet = sheets.find((sheet) => sheet.json);
    if (jsonSheet) {
      try {
        const json = JSON.parse(jsonSheet.json);
        if (json.type === 'FeatureCollection' || json.type === 'Feature') {
          patch({ geometryName: file.name });
          setNote(`${file.name}: ${Array.isArray(json.features) ? json.features.length : 1} feature recorded as spatial evidence. This does not change a hazard level.`);
          return;
        }
      } catch { /* fall through */ }
      setNote(`${file.name} is not a site table. Use the asset-register template.`);
      return;
    }
    const siteSheet = sheets.find((sheet) => sheetLooksLikeSites(sheet.rows));
    const stored = {};
    sheets.forEach((sheet) => { if (sheet.rows?.length) stored[sheet.name] = sheet.rows; });
    if (preferSites && siteSheet) {
      addAssets(siteSheet.rows, file.name, { sheets: { ...project.sheets, ...stored } });
      return;
    }
    if (!preferSites && template.id !== 'master_asset' && sheets[0]?.rows?.length && !sheetLooksLikeSites(sheets[0].rows)) {
      commit({ ...project, sheets: { ...project.sheets, [template.id]: sheets[0].rows } });
      setNote(`${sheets[0].rows.length} row${sheets[0].rows.length === 1 ? '' : 's'} from ${file.name} stored with ${template.label}. A client template does not change the hazard level.`);
      return;
    }
    if (siteSheet) addAssets(siteSheet.rows, file.name);
    else if (sheets[0]?.rows?.length) {
      commit({ ...project, sheets: { ...project.sheets, [template.id]: sheets[0].rows } });
      setNote(`${sheets[0].rows.length} rows from ${file.name} stored with ${template.label}.`);
    } else setNote(`${file.name} had no data rows under a header.`);
  }

  function saveLocal() {
    const projectId = project.projectId || `cr-${Math.random().toString(36).slice(2, 10)}`;
    commit({ ...project, projectId });
    setNote(`Saved in this browser${project.client ? ` for ${project.client}` : ''}.`);
  }

  function clearClient() {
    commit(emptyProject());
    setServerList(null);
    setCaseLine('');
    setNote('Client data cleared from this browser.');
  }

  function deleteLegacy() {
    const drop = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || key === STORE) continue;
      if (key === 'agn.assets' || key === 'agn.unsavedProjectId' || key === 'agn.project' || key === 'agn.clientProject' || key.startsWith('agn.asset') || key.startsWith('agn.portfolio') || key.startsWith('agn.unsaved')) drop.push(key);
    }
    drop.forEach((key) => localStorage.removeItem(key));
    setNote(drop.length ? `Removed ${drop.length} legacy browser key${drop.length === 1 ? '' : 's'}.` : 'No legacy browser asset data was stored.');
  }

  async function loadFromServer() {
    const body = await getJson('/api/case/project');
    const list = body?.projects || [];
    if (!list.length) {
      setNote('No project is stored on this server. You can open a project JSON file.');
      projectFile.current?.click();
      return;
    }
    setServerList(list);
    setNote('Projects on this server. Choose one, or open a JSON file.');
  }

  async function takeServerProject(id) {
    const body = await getJson(`/api/case/project?id=${encodeURIComponent(id)}`);
    const doc = body?.document;
    if (!doc) { setNote(body?.why || 'That project was not on the server.'); return; }
    const next = {
      ...emptyProject(),
      client: doc.manifest?.client_name || body.clientName || '',
      projectId: body.projectId || doc.manifest?.project_id || id,
      serverSavedAt: body.savedAt || '',
      assets: Array.isArray(doc.assets) ? doc.assets : [],
      activeId: doc.assets?.[0]?.asset_id || '',
    };
    commit(next);
    setNote(`Loaded ${next.client || next.projectId} from the server.`);
  }

  function onProjectFile(file) {
    if (!file) return undefined;
    return file.text().then((text) => {
      const doc = JSON.parse(text);
      const manifest = doc.manifest || {};
      const next = {
        ...emptyProject(),
        client: manifest.client_name || doc.client || '',
        projectId: manifest.project_id || doc.projectId || '',
        assets: Array.isArray(doc.assets) ? doc.assets : [],
        sheets: doc.sheets || {},
        activeId: doc.activeId || doc.assets?.[0]?.asset_id || '',
      };
      commit(next);
      setNote(`Loaded ${file.name}.`);
    }).catch(() => setNote(`${file.name} is not a project JSON file.`));
  }

  async function syncProject() {
    if (!project.client) { setCaseLine('Enter the client name before syncing.'); return; }
    if (!assets.length) { setCaseLine('Add at least one asset before syncing.'); return; }
    const projectId = project.projectId || `cr-${Math.random().toString(36).slice(2, 10)}`;
    const doc = {
      manifest: {
        project_id: projectId,
        project_schema_version: 1,
        client_name: project.client,
        ...(project.serverSavedAt ? { expected_saved_at: project.serverSavedAt } : {}),
      },
      assets,
    };
    setCaseLine('Saving the project to the server…');
    try {
      const res = await fetch('/api/case/project', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setCaseLine(body.why || body.error || 'The server did not store the project.'); return; }
      commit({ ...project, projectId: body.projectId || projectId, serverSavedAt: body.savedAt || '' });
      setCaseLine(`Project stored on the server (${body.projectId || projectId}).`);
    } catch {
      setCaseLine('The server did not answer the casebook.');
    }
  }

  async function reloadCase() {
    if (!project.projectId) { setCaseLine('Sync the project to the server first.'); return; }
    if (!project.activeId) { setCaseLine('Choose the active asset, then reload its case document.'); return; }
    setCaseLine('Reading the case document…');
    const [doc, iv] = await Promise.all([
      getJson(`/api/case/document?project=${encodeURIComponent(project.projectId)}&asset=${encodeURIComponent(project.activeId)}`),
      getJson(`/api/case/interventions?project=${encodeURIComponent(project.projectId)}&asset=${encodeURIComponent(project.activeId)}`),
    ]);
    if (doc?.__status || doc?.ok === false) { setCaseLine(doc?.why || 'The case document was not returned.'); return; }
    const count = Array.isArray(iv?.interventions) ? iv.interventions.length : 0;
    const coverage = doc?.confidence?.observationalCoverage || '';
    setCaseLine(`Case document read for ${project.activeId}. ${count} adaptation item${count === 1 ? '' : 's'}.${coverage ? ` ${coverage}` : ''}`);
  }

  function screenAsset() {
    if (!active || !Number.isFinite(+active.latitude) || !Number.isFinite(+active.longitude)) {
      setNote('The active asset has no coordinates.');
      return;
    }
    screenSite(active);
  }

  function showOnMap() {
    const site = active && Number.isFinite(+active.latitude) ? active : assets.find((asset) => Number.isFinite(+asset.latitude) && Number.isFinite(+asset.longitude));
    if (!site) { setNote('Add a site with coordinates first.'); return; }
    const hash = `#agnplace=${Number(site.latitude).toFixed(5)},${Number(site.longitude).toFixed(5)},${encodeURIComponent(site.asset_name || 'Site')}`;
    window.history.pushState({}, '', `/analyst?tab=overview${hash}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new Event('agn-place'));
  }

  function onGeoFile(file) {
    if (!file) return undefined;
    return file.text().then((text) => {
      let features = 0;
      try {
        const json = JSON.parse(text);
        features = Array.isArray(json.features) ? json.features.length : (json.type ? 1 : 0);
      } catch { features = 0; }
      patch({ geometryName: file.name });
      setNote(features
        ? `${file.name}: ${features} feature${features === 1 ? '' : 's'} recorded as spatial evidence. This does not change a hazard level.`
        : `${file.name} was kept as spatial evidence. It does not change a hazard level.`);
    }).catch(() => setNote(`${file.name} could not be read.`));
  }

  const heatBasis = bundle?.parts?.siteLevels?.v?.hazards?.heat?.days?.find((day) => /UTCI/.test(day.basis || ''))?.basis || '';
  const utci = /UTCI\s+([0-9.]+)/.exec(heatBasis);
  const utciC = utci ? Number(utci[1]) : null;
  const ratedN = String(rated).trim() === '' ? NaN : Number(rated);
  let stress = 'Enter a rated temperature to compare it with the screened shade UTCI. This is a planning check, not a design factor.';
  if (horizon !== 'present') stress = '2030s and 2050s planning offsets are the climate-stress table on Forecast. This page does not invent a design factor.';
  else if (Number.isFinite(ratedN) && utciC != null) stress = utciC > ratedN ? `The screened shade UTCI (${utciC} °C) is above the rated limit of ${ratedN} °C.` : `The screened shade UTCI (${utciC} °C) is within the rated limit of ${ratedN} °C.`;
  else if (Number.isFinite(ratedN)) stress = 'No shade UTCI was parsed from this place’s heat basis, so the rated limit was not compared.';

  const nearBit = near?.name && !String(place?.name || '').includes(near.name) ? `${near.km} km from ${near.name}` : '';
  const placeLabel = place ? [place.name, nearBit].filter(Boolean).join(' · ') : 'Choose a place at the top of the page';
  const loaded = Boolean(project.client || project.projectId || assets.length);
  const rankedSites = [...assets].sort((a, b) => {
    const left = siteScreens[a.asset_id]?.lead;
    const right = siteScreens[b.asset_id]?.lead;
    return (right?.level || 0) - (left?.level || 0) || (right?.score ?? -1) - (left?.score ?? -1) || String(a.asset_name || '').localeCompare(String(b.asset_name || ''));
  });
  const checkedSites = assets.filter((asset) => siteScreens[asset.asset_id]?.ok);
  const aboveCounts = [4, 3, 2, 1].map((level) => ({ word: LEVEL_WORDS[level], count: checkedSites.filter((asset) => siteScreens[asset.asset_id]?.lead?.level === level).length })).filter((item) => item.count);

  return (
    <section className="an-pane cr">
      <header className="cr-hero">
        <p className="cr-eye">Decision products · connected to NIGRAAN</p>
        <h2>Client Risk</h2>
        <p>Screen this place, or rank every site in the register. A level is a signal, not a loss.</p>
        <div className="cr-chips">
          <span>Signal separate from exposure</span>
          <span>Level is not a probability</span>
          <span>Design needs its own study</span>
          <span>Reports keep their sources</span>
        </div>
      </header>

      <div className="cr-kit" role="region" aria-label="Add sites">
        <span className="cr-grp">
          <span className="cr-lab">Add sites</span>
          <button type="button" className="cr-pri" onClick={() => sitesFile.current?.click()}>Upload CSV / XLSX</button>
          <button type="button" onClick={() => download('NIGRAAN_asset_register.csv', toCsv(TEMPLATES[0].columns, sampleAssets()), 'text/csv')}>Download template</button>
          {demo && <span className="cr-count">Sample loaded · {assets.filter((asset) => asset.demo).length}</span>}
          {demo
            ? <button type="button" onClick={clearSample}>Clear sample</button>
            : <button type="button" className="cr-pri" onClick={loadSample}>Load sample</button>}
        </span>
        <span className="cr-grp">
          <span className="cr-lab">Rows</span>
          <button type="button" onClick={() => setPasteOpen((open) => !open)}>Paste rows</button>
        </span>
        <span className="cr-grp">
          <span className="cr-lab">Templates</span>
          <select aria-label="Template" value={templateId} onChange={(event) => { setTemplateId(event.target.value); setSampleView(null); }}>
            {TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <button type="button" onClick={() => setSampleView(template)}>See sample</button>
          <button type="button" onClick={() => download(`NIGRAAN_${template.id}.xls`, toWorkbook([{ name: template.label, columns: template.columns, rows: template.id === 'master_asset' ? sampleAssets() : [] }]), 'application/vnd.ms-excel')}>XLSX</button>
          <button type="button" onClick={() => download(`NIGRAAN_${template.id}.csv`, toCsv(template.columns, template.id === 'master_asset' ? sampleAssets() : []), 'text/csv')}>CSV</button>
          <button type="button" onClick={() => filledFile.current?.click()}>Upload filled</button>
        </span>
        <span className="cr-grp">
          <span className="cr-lab">Client pack</span>
          <button type="button" onClick={() => download('NIGRAAN_client_pack.xls', toWorkbook(TEMPLATES.map((item) => ({ name: item.label, columns: item.columns, rows: item.id === 'master_asset' ? sampleAssets() : [] }))), 'application/vnd.ms-excel')}>Download</button>
          <button type="button" onClick={() => packFile.current?.click()}>Upload</button>
        </span>
        <input ref={sitesFile} type="file" accept=".csv,.tsv,.txt,.xls,.xlsx,.geojson,.json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) takeSheets(file, true).finally(() => { event.target.value = ''; }); }} />
        <input ref={filledFile} type="file" accept=".csv,.tsv,.txt,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) takeSheets(file, false).finally(() => { event.target.value = ''; }); }} />
        <input ref={packFile} type="file" accept=".csv,.tsv,.txt,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) takeSheets(file, true).finally(() => { event.target.value = ''; }); }} />
      </div>
      {pasteOpen && (
        <div className="cr-paste">
          <p>Paste rows from the spreadsheet, header row first (tab- or comma-separated).</p>
          <textarea rows={7} aria-label="Asset register rows" value={pasteText} onChange={(event) => setPasteText(event.target.value)} />
          <button type="button" className="cr-pri" onClick={() => addAssets(parseTable(pasteText), 'pasted rows')}>Screen these rows</button>
        </div>
      )}
      {sampleView && (
        <div className="cr-sample">
          <b>Sample · {sampleView.label}</b>
          <p>Example values only. A vulnerability or fragility row is client evidence and is not an approved damage curve.</p>
          <div className="cr-table">
            <table>
              <thead><tr>{sampleView.columns.map((col) => <th key={col}>{col}</th>)}</tr></thead>
              <tbody><tr>{sampleView.columns.map((col) => <td key={col}>{col.includes('name') ? 'Sample plant (example)' : (col.endsWith('_id') || col === 'asset_id' ? 'SMP-A1' : 'example')}</td>)}</tr></tbody>
            </table>
          </div>
        </div>
      )}
      {note && <p className="cr-note">{note}</p>}

      <div className="cr-bound">
        <p>Client Risk — identity, permission and persistence boundary (sequence v1.0)</p>
        <button type="button" onClick={() => setBackendOpen((open) => !open)}>Backend requirements</button>
      </div>
      {backendOpen && (
        <div className="cr-card cr-req">
          <p>A client project is a document: a manifest (project id, schema version, client name) and one asset row per site. Sync writes that document to this server’s casebook. Screening reads the engines at the place chosen at the top of the page. It does not read a loss model, and a client template does not change a hazard level.</p>
        </div>
      )}

      <article className="cr-card">
        <div className="cr-cardhead">
          <h3>Client project</h3>
          <button type="button" disabled={!place || report?.busy} onClick={() => askReport('executive_brief')}>Executive brief</button>
        </div>
        <p className="cr-quiet">{loaded ? `${project.client || 'Unnamed client'}${project.projectId ? ` · ${project.projectId}` : ''}${project.serverSavedAt ? ' · on the server' : ' · in this browser'}` : 'No project loaded — this session holds nothing about a client.'}</p>
        <div className="cr-fields">
          <label>Client<input value={project.client} placeholder="e.g. Alpha Cement" onChange={(event) => patch({ client: event.target.value })} /></label>
          <label>Active asset
            <select value={project.activeId} onChange={(event) => patch({ activeId: event.target.value })}>
              <option value="">No active asset</option>
              {assets.map((asset) => <option key={asset.asset_id} value={asset.asset_id}>{asset.asset_name || asset.asset_id}</option>)}
            </select>
          </label>
        </div>
        <div className="cr-actions">
          <button type="button" className="cr-pri" onClick={saveLocal}>Save project</button>
          <button type="button" onClick={loadFromServer}>Load project</button>
          <button type="button" onClick={clearClient}>Clear client data</button>
          <button type="button" onClick={deleteLegacy}>Delete legacy browser asset data</button>
          {active && <button type="button" onClick={screenAsset}>Screen at this asset</button>}
        </div>
        {serverList && (
          <label className="cr-inline">Server project
            <select defaultValue="" onChange={(event) => { if (event.target.value) takeServerProject(event.target.value); }}>
              <option value="">Choose a project</option>
              {serverList.map((item) => <option key={item.projectId} value={item.projectId}>{item.clientName || item.projectId} · {item.assets} assets</option>)}
            </select>
            <button type="button" onClick={() => projectFile.current?.click()}>Open JSON file</button>
          </label>
        )}
        <input ref={projectFile} type="file" accept=".json,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) Promise.resolve(onProjectFile(file)).finally(() => { event.target.value = ''; }); }} />
      </article>

      <article className="cr-card">
        <h3>Casebook</h3>
        <p className="cr-quiet">One case document per asset — hazard from the engines, the client record with a provenance class on every field, the adaptation tracker, snapshots.</p>
        <div className="cr-actions">
          <button type="button" className="cr-pri" onClick={syncProject}>Sync project to server</button>
          <button type="button" onClick={reloadCase}>Reload case document</button>
        </div>
        {caseLine && <p className="cr-note">{caseLine}</p>}
        <div className="cr-record">
          <b>Asset record</b>
          <span>Fill the 29 asset fields in the template, or paste the rows.</span>
          <button type="button" onClick={() => document.querySelector('.cr-kit')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Asset register →</button>
        </div>
        <p className="cr-quiet">Load a client project and choose the active asset, then sync to put the project on the server.</p>
      </article>
      <ReportLine report={report} />

      <div className="cr-tabs" role="tablist">
        {[['site', 'Site Assessment'], ['portfolio', 'Client portfolio'], ['engineering', 'Engineering Conditions']].map(([id, label]) => (
          <div className="cr-tab" key={id}>
            <button type="button" role="tab" aria-selected={pane === id} className={pane === id ? 'on' : ''} onClick={() => setPane(id)}>{label}</button>
            <button type="button" className="cr-info" aria-expanded={helpKey === id} aria-label={`How ${label} works`} title={`How ${label} works`} onClick={() => setHelpKey((key) => (key === id ? null : id))}>i</button>
          </div>
        ))}
      </div>
      {helpKey && HELP[helpKey] && (
        <div className="cr-helpbox">
          <span className="cr-kicker">{HELP[helpKey].phase}</span>
          <b>{HELP[helpKey].title}</b>
          <p><em>Purpose. </em>{HELP[helpKey].purpose}</p>
          <p><em>Input. </em>{HELP[helpKey].input}</p>
          <p><em>Process. </em>{HELP[helpKey].process}</p>
          <p><em>How to read it. </em>{HELP[helpKey].read}</p>
          <p><em>Limits. </em>{HELP[helpKey].limits}</p>
        </div>
      )}

      {pane === 'site' && (
        <>
          <div className="cr-work">
            <article className="cr-card">
              <div className="cr-cardhead">
                <h3>Site and asset screening</h3>
                <button type="button" onClick={() => setFormOpen((open) => !open)}>{formOpen ? 'Fold form' : 'Open form'}</button>
              </div>
              <p className="cr-quiet">Place from the top of the page. The engine returns the site level and the tehsil level.</p>
              {formOpen && (
                <div className="cr-form">
                  <div className="cr-locrow">
                    <span className="cr-lab">Assessment location</span>
                    <span className="cr-loc">{placeLabel}</span>
                    {place && <button type="button" onClick={() => document.querySelector('.citysel > button')?.click()}>Change</button>}
                  </div>
                  <label>Asset type
                    <select value={assetType} onChange={(event) => setAssetType(event.target.value)}>
                      {ASSET_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  </label>
                  <fieldset>
                    <legend>Hazards included</legend>
                    <div className="cr-checks">
                      {HAZARDS.map((hazard) => (
                        <label key={hazard.key} className={`hzt hzt-${hazard.key}`} title={hazard.label}>
                          <input type="checkbox" checked={!!checks[hazard.key]} onChange={(event) => setChecks({ ...checks, [hazard.key]: event.target.checked })} />
                          <span>
                            <b>{hazard.pick || hazard.label}</b>
                            {hazard.hint ? <small>{hazard.hint}</small> : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="cr-actions">
                    <button type="button" className="cr-pri" disabled={!ready} onClick={() => document.getElementById('cr-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Run site screening</button>
                    <button type="button" disabled={!place || report?.busy} onClick={() => askReport('site_assessment')}>Site report</button>
                  </div>
                  <p className="cr-warn">Screening outputs are decision-support signals. A detailed risk or loss assessment requires asset geometry, floor level, construction, fragility, criticality, replacement value, downtime cost and protection measures.</p>
                </div>
              )}
              {!formOpen && <p className="cr-quiet">Form folded — nothing entered yet.</p>}
            </article>

            <article className="cr-card cr-summary">
              <div className="cr-cardhead">
                <h3>Assessment summary</h3>
                <span className="cr-pre">Preliminary screening</span>
              </div>
              <p className="cr-quiet">{place ? (ASSET_TYPES.find((item) => item[0] === assetType)?.[1] || assetType) : 'Choose a place to screen.'}{ready && bundle?.parts?.siteLevels?.v?.at ? ` · ${String(bundle.parts.siteLevels.v.at).slice(0, 16)} UTC` : ''}</p>
              <div className="cr-kpis">
                <div><span>Leading hazard</span><b className={leading?.key ? `hzt hzt-${leading.key}` : ''}>{ready ? (leading?.label || 'None assessed') : '—'}</b><small>{ready && leading?.site ? leading.site : 'Highest level included'}</small></div>
                <div className={ready && leading?.word ? `lv lv-${lvClass(leading.word)}` : ''}><span>Level</span><b>{ready && leading?.word ? <em className={`cr-pill ${lvClass(leading.word)}`}>{leading.word}</em> : '—'}</b><small>Not a probability of loss</small></div>
                <div><span>Place facts</span><b>{ready ? `${factCount}/${FACT_TILES.length}` : '—'}</b><small>Held at this coordinate</small></div>
              </div>
            </article>
          </div>

          <article className="cr-card" id="cr-results">
            <h3>Hazard results</h3>
            {!ready && <p className="cr-note">{place ? 'Reading the hazard engine for this place…' : 'Choose a place at the top of the page.'}</p>}
            {ready && !results.length && <p className="cr-note">No hazard was included.</p>}
            {ready && !!results.length && <ResultBoard results={results} />}
            {ready && <p className="cr-foot">{[engineLine(bundle?.parts?.siteLevels?.v?.engine), screen?.note].filter(Boolean).join(' ') || 'At the site is the server score at this coordinate. Area level is the tehsil engine. A level is a screening level, not a probability.'}</p>}
          </article>

          <article className="cr-card">
            <h3>Place record at the site</h3>
            {!bundle?.parts?.placeRecord && <p className="cr-note">{place ? 'Reading the place record…' : 'Choose a place at the top of the page.'}</p>}
            {bundle?.parts?.placeRecord && <PlaceRecord record={bundle.parts.placeRecord.unavailable ? { ok: false, why: bundle.parts.placeRecord.why } : bundle.parts.placeRecord.v} />}
          </article>

          <article className="cr-card">
            <div className="cr-cardhead">
              <h3>Site geometry and evidence</h3>
              <button type="button" onClick={() => geoFile.current?.click()}>Client geometry</button>
            </div>
            <p className="cr-quiet">A GeoJSON file is stored as evidence. It does not change a level.</p>
            <p className="cr-note">{project.geometryName ? `Recorded: ${project.geometryName}.` : 'No client geometry uploaded.'}</p>
            <input ref={geoFile} type="file" accept=".geojson,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) Promise.resolve(onGeoFile(file)).finally(() => { event.target.value = ''; }); }} />
          </article>

          <article className="cr-card" id="cr-evidence">
            <p className="cr-kicker">Asset evidence</p>
            <h3>Automatic Asset Evidence Profile</h3>
            <p className="cr-quiet">Terrain, water, land cover, faults and climate normals held for this place.</p>
            <div className="cr-ready">
              <div>
                <span>Core readiness</span>
                <b>{core.percent}%</b>
                <div className="cr-bar" aria-hidden="true"><i style={{ width: `${core.percent}%` }} /></div>
                <small>{core.missing.length ? `Missing ${core.missing.join(', ')}` : 'Core fields are filled'}</small>
              </div>
              <div>
                <span>Recommended</span>
                <b>{recommended.percent}%</b>
                <div className="cr-bar" aria-hidden="true"><i style={{ width: `${recommended.percent}%` }} /></div>
                <small>{recommended.missing.length ? `Missing ${recommended.missing.join(', ')}` : 'Recommended fields are filled'}</small>
              </div>
              <div>
                <span>Active asset</span>
                <b className="cr-name">{active ? (active.asset_name || active.asset_id) : 'None selected'}</b>
                <small>{active && Number.isFinite(+active.latitude) ? `${Number(active.latitude).toFixed(5)}, ${Number(active.longitude).toFixed(5)}` : 'No coordinates in the asset record'}</small>
              </div>
            </div>
            <div className="cr-tiles">
              {FACT_TILES.map(([key, label]) => {
                const field = facts[key];
                const on = Boolean(field && field.value != null && field.value !== '');
                return (
                  <div key={key} className={on ? 'is-on' : 'is-off'}>
                    <b>{label}</b>
                    <em>{on ? 'Available' : 'Missing'}</em>
                    {on && field.source ? <span>{field.source}</span> : null}
                  </div>
                );
              })}
            </div>
            <p className="cr-banner"><b>Still from the client</b><span>Operating limits</span><span>Flood and drainage</span><span>Fragility</span><span>Recovery time</span><span>Dependencies</span></p>
          </article>

        </>
      )}

      {pane === 'portfolio' && (
        <article className="cr-card" id="cr-portfolio">
          <div className="cr-cardhead">
            <h3>Client portfolio</h3>
            <button type="button" onClick={showOnMap}>Show the sites on the map</button>
          </div>
          <p className="cr-quiet">Ranked by the highest level at each site, today and the next three days.</p>
          {demo && <p className="cr-banner"><b>Sample</b><span>{assets.length} example sites</span><span>Invented names, real places</span><span>Levels are the real assessment</span></p>}
          <div className="cr-kpis">
            <div><span>Sites</span><b>{assets.length}</b><small>in the register</small></div>
            <div><span>Above Normal</span><b>{!checkedSites.length ? '—' : aboveCounts.length ? aboveCounts.map((item) => `${item.count} ${item.word}`).join(' · ') : 'none above Normal'}</b><small>the leading hazard’s level</small></div>
            <div><span>Checked</span><b>{checkedSites.length} of {assets.length}</b><small>sites with a coordinate</small></div>
          </div>
          {!assets.length && <p className="cr-note">No sites yet. Load sample, or download the template, fill one row per site, and upload it.</p>}
          {!!assets.length && (
            <div className="cr-table cr-port">
              <table>
                <thead><tr><th>#</th><th>Site</th><th>Tehsil</th><th>Leading hazard</th><th>Hazard index</th><th>Level</th><th>Data gaps</th><th>Report</th></tr></thead>
                <tbody>
                  {rankedSites.map((asset, index) => {
                    const row = siteScreens[asset.asset_id];
                    const lead = row?.lead;
                    const gaps = row?.gaps || { cannot: [], nottested: [], na: [] };
                    return (
                      <tr key={asset.asset_id} className={lead ? `lv lv-${lvClass(LEVEL_WORDS[lead.level] || '')}` : ''}>
                        <td>{index + 1}</td>
                        <td>{asset.asset_name || asset.asset_id}{asset.demo ? <em className="cr-sample">Sample</em> : null}</td>
                        <td>{row?.place || asset.tehsil || asset.district || '—'}</td>
                        <td>
                          {!Number.isFinite(+asset.latitude) ? 'no coordinates' : !row ? 'Reading the site level…' : !row.ok ? (row.why || '—') : lead && lead.level > 0 ? (
                            <span className="hz-name">
                              {lead.name}
                              <small>{[lead.date ? dayLong(lead.date) : '', lead.by === 'tehsil' ? 'tehsil' : ''].filter(Boolean).join(' · ')}</small>
                            </span>
                          ) : 'No hazard above Normal'}
                        </td>
                        <td>{lead && lead.level > 0 && lead.score != null ? `${Math.round(lead.score)}/100` : '—'}</td>
                        <td>{row?.ok && lead ? <em className={`cr-pill ${lvClass(LEVEL_WORDS[lead.level] || '')}`}>{LEVEL_WORDS[lead.level] || '—'}</em> : row?.ok ? <em className="cr-pill state">Not assessed</em> : '—'}</td>
                        <td className="cr-gaps">
                          {row?.why && !lead ? <span className="gap na">{row.why}</span> : (
                            <>
                              {gaps.cannot.length ? <span className="gap no">Cannot happen here: {gaps.cannot.map((item) => item.name).join(', ')}</span> : null}
                              {gaps.nottested.length ? <span className="gap nt">Not tested: {gaps.nottested.map((item) => item.name).join(', ')}</span> : null}
                              {gaps.na.length ? <span className="gap na">Not assessed: {gaps.na.map((item) => item.name).join(', ')}</span> : null}
                              {!gaps.cannot.length && !gaps.nottested.length && !gaps.na.length ? <span className="gap ok">none</span> : null}
                            </>
                          )}
                        </td>
                        <td>
                          {Number.isFinite(+asset.latitude) && <button type="button" onClick={() => screenSite(asset)}>Screen</button>}
                          {row?.ok && <button type="button" disabled={report?.busy} onClick={() => askReportAt(asset)}>{report?.busy && report.assetId === asset.asset_id ? 'Making…' : 'Report'}</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>
      )}

      {pane === 'engineering' && (
        <div className="cr-work cr-eng">
          <article className="cr-card">
            <div className="cr-cardhead">
              <h3>Screening values for {place?.name || 'the site'}</h3>
              <button type="button" className="cr-pri" disabled={!ready} onClick={() => { setPane('site'); setTimeout(() => document.getElementById('cr-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40); }}>Sync site assessment</button>
            </div>
            <p className="cr-quiet">Long-record screening. Not design values.</p>
            {!screen?.rows?.length && <p className="cr-note">{place ? 'Reading the screening values…' : 'Choose a place at the top of the page.'}</p>}
            {!!screen?.rows?.length && (
              <div className="cr-table cr-screen">
                <table>
                  <colgroup>
                    <col className="c-name" /><col className="c-val" /><col className="c-next" /><col className="c-level" /><col className="c-why" />
                  </colgroup>
                  <thead><tr><th>Parameter</th><th>Screening values</th><th>Next 15 days</th><th>Level</th><th>What it means</th></tr></thead>
                  <tbody>
                    {screen.rows.map((row) => {
                      const levels = screen.scale?.levels || LEVEL_WORDS;
                      const named = row.verdict && levels.includes(row.verdict);
                      const state = row.state || 'Input required: a level for this row';
                      return (
                        <tr key={row.parameter}>
                          <td>{row.parameter}</td>
                          <td>
                            {row.values || '—'}
                            {row.valuesWhy && <small>{row.valuesWhy}</small>}
                            {row.history && <small>{row.history}</small>}
                          </td>
                          <td>{row.forecast || '—'}</td>
                          <td>
                            {named
                              ? <em className={`cr-pill ${lvClass(row.verdict)}`}>{row.verdict}</em>
                              : <span className="cr-state">{state}</span>}
                            {row.standing && <small>{row.standing}</small>}
                          </td>
                          <td>{row.meaning || row.source || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {screen?.note && <p className="cr-foot">{screen.note}{screen.returnLevels ? ` Return levels: ${screen.returnLevels.method || 'the long record'}, ${screen.returnLevels.years || 'the years held'}. ${screen.returnLevels.caveat || ''}` : ''}</p>}
          </article>
          <article className="cr-card">
            <div className="cr-cardhead">
              <h3>Bounded planning stress test</h3>
            </div>
            <p className="cr-quiet">A transparent check against the screened shade UTCI. It is not a downscaled design factor.</p>
            <div className="cr-stress">
              <label>Scenario horizon
                <select value={horizon} onChange={(event) => setHorizon(event.target.value)}>
                  <option value="present">Present</option>
                  <option value="2030s">2030s</option>
                  <option value="2050s">2050s</option>
                </select>
              </label>
              <label>Asset rated temperature limit (°C, optional)
                <input type="number" value={rated} placeholder="e.g. 45 — from your own records" onChange={(event) => setRated(event.target.value)} />
              </label>
            </div>
            <div className="cr-table">
              <table>
                <caption>What can be compared at the {horizon} horizon, and what is missing</caption>
                <thead><tr><th>Parameter</th><th>Climate evidence</th><th>Asset input</th><th>Result</th></tr></thead>
                <tbody>
                  <tr>
                    <td>Temperature</td>
                    <td>{utciC != null ? `Screened shade UTCI ${utciC} °C` : 'No shade UTCI was parsed from this place’s heat basis.'}</td>
                    <td>{Number.isFinite(ratedN) ? `Rated ${ratedN} °C` : 'No rated limit entered'}</td>
                    <td>{horizon !== 'present' ? 'Open climate stress on Forecast' : (Number.isFinite(ratedN) && utciC != null ? (utciC > ratedN ? 'Exceeds the rated limit' : 'Inside the rated limit') : 'Engineering input required')}</td>
                  </tr>
                  <tr>
                    <td>Rain intensity</td>
                    <td>No intensity-duration-frequency curve is held here. A factor on the current hour is not a design intensity.</td>
                    <td>—</td>
                    <td>Cannot assess</td>
                  </tr>
                  <tr>
                    <td>Wind gust</td>
                    <td>No validated future design gust is held. A factor on the current gust is not a design wind speed.</td>
                    <td>—</td>
                    <td>Cannot assess</td>
                  </tr>
                  <tr>
                    <td>Flood depth</td>
                    <td>This build screens flood pathways. A screening index is not a depth.</td>
                    <td>—</td>
                    <td>Cannot assess</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="cr-foot">{stress}</p>
            {horizon !== 'present' && <button type="button" className="cr-pri" onClick={() => go(`/analyst?tab=livedata&sec=fccm${window.location.hash || ''}`)}>Open climate stress</button>}
            <p className="cr-warn">Production engineering values should be calculated from quality-controlled observations or bias-corrected climate series using suitable extreme-value methods, uncertainty intervals and engineering-code review.</p>
          </article>
        </div>
      )}
      <Guidance place={place} />
      {reportOpen && report && createPortal(
        <div className="ov-modal" role="dialog" aria-modal="true" aria-label="Site report" onClick={(event) => { if (event.target === event.currentTarget) setReportOpen(false); }}>
          <div className="ov-repview">
            <header>
              <div className="who">
                <p className="eyebrow">Site report</p>
                <h2>{report.name || 'Site'}</h2>
                <p className="meta">{report.ok && report.id ? `${report.id}${report.pages ? ` · ${report.pages} pages` : ''}` : 'The checked forecast for this site'}</p>
              </div>
              <div className="acts">
                {report.pdf ? <a className="pri" href={`${report.pdf}?download=1`} download={`${report.id || 'report'}.pdf`}>Download PDF</a> : null}
                <button type="button" className="ov-x" onClick={() => setReportOpen(false)}>Close</button>
              </div>
            </header>
            <div className="sheet">
              {report.busy && <p className="wait">Making the report…</p>}
              {report.ok && report.html && <iframe title="Site report" src={report.html} />}
              {!report.busy && !report.ok && <p className="fail">{report.why || 'The report could not be made.'}</p>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
