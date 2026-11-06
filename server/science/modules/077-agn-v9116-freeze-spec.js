
(function(G){'use strict';var D=G.document,AGN=G.AGN=G.AGN||{};
  function freeze(o){try{return Object.freeze(o)}catch(_){return o}}
  function field(name,type,required,unit,description,extra){return Object.assign({name:name,type:type||'string',required:!!required,unit:unit||null,description:description||''},extra||{});}

   
  var ASSET_FIELDS=[
    field('asset_id','string',true,null,'Stable client asset identifier'),field('asset_name','string',true,null,'Asset display name'),
    field('parent_company','string',false),field('business_unit','string',false),field('industry','string',true),field('asset_type','string',true),field('asset_subtype','string',false),
    field('country','string',true),field('province','string',false),field('district','string',false),field('address','string',false),
    field('latitude','number',false,'degrees'),field('longitude','number',false,'degrees'),field('geometry_id','string',false),field('geometry_type','string',true,null,'point, polygon or route',{enum:['point','polygon','route']}),
    field('criticality','integer',false,'1-5','Business/service criticality',{min:1,max:5}),
    field('maximum_tolerable_downtime_hr','number',false,'hour'),field('operating_hours','string',false),
    field('construction_type','string',false),field('year_built','integer',false,'year'),field('floor_elevation_m','number',false,'m'),field('flood_protection','string',false),field('drainage_condition','string',false),field('roof_type','string',false),field('cooling_type','string',false),field('backup_power','string',false),field('backup_duration_hr','number',false,'hour'),
    field('data_owner','string',false),field('source','string',true),field('last_updated','date-time',false),field('confidence','string',false,null,'Declared data confidence'),field('confidentiality_class','string',false)
  ];
  var BLOCKS={
    core:['asset_id','asset_name','parent_company','business_unit','industry','asset_type','asset_subtype','country','province','district','address','latitude','longitude','geometry_id','geometry_type','criticality'],
    operating:['maximum_tolerable_downtime_hr','operating_hours'],
    physical:['construction_type','year_built','floor_elevation_m','flood_protection','drainage_condition','roof_type','cooling_type','backup_power','backup_duration_hr'],
    operating_limits:['linked through operating_limits template by asset_id'],dependencies:['linked through dependencies template by asset_id'],
    vulnerability:['linked through vulnerability_fragility template by asset_id or asset class'],evidence:['source','last_updated','confidence','data_owner','confidentiality_class']
  };
  var QUICK=['asset_name','address','asset_type','latitude','longitude'];
  function readiness(a){a=a||{};var core=['asset_id','asset_name','industry','asset_type','geometry_type','source'];var recommended=['criticality','maximum_tolerable_downtime_hr','construction_type','floor_elevation_m','backup_power'];var c=core.filter(function(k){return a[k]!=null&&String(a[k]).trim()!==''}),r=recommended.filter(function(k){return a[k]!=null&&String(a[k]).trim()!==''});return {core:{present:c.length,total:core.length,percent:Math.round(c.length/core.length*100),missing:core.filter(function(k){return c.indexOf(k)<0})},recommended:{present:r.length,total:recommended.length,percent:Math.round(r.length/recommended.length*100),missing:recommended.filter(function(k){return r.indexOf(k)<0})}};}
  AGN.assetSchema=freeze({id:'nigraan.asset',version:'1.0.0',status:'freeze-candidate',fields:ASSET_FIELDS,blocks:BLOCKS,quickScreeningSubset:QUICK,geometryTypes:['point','polygon','route'],readiness:readiness});

  

  var VF_FIELDS=[field('vulnerability_id','string',true),field('asset_id_or_class','string',true),field('hazard','string',true),field('intensity_metric','string',true),field('intensity_unit','string',true),field('function_type','string',true,null,'threshold, step, piecewise, fragility_curve, vulnerability_curve, expert_screening_class',{enum:['threshold','step','piecewise','fragility_curve','vulnerability_curve','expert_screening_class']}),field('intensity_value','number',false),field('damage_ratio','number',false,'0-1',null,{min:0,max:1}),field('operational_state','string',false),field('downtime_hr','number',false,'hour'),field('construction_applicability','string',false),field('geographic_applicability','string',false),field('source','string',true),field('source_year','integer',false,'year'),field('version','string',true),field('confidence','string',true),field('calibration_status','string',true),field('validation_status','string',true),field('notes','string',false)];
  AGN.vulnerabilityRegistry=freeze({id:'nigraan.vulnerability',version:'1.0.0',fields:VF_FIELDS,records:[],approvedOnly:true,boundary:'No generic vulnerability curve is approved in this standalone candidate. A damage or operational response needs a client/engineering relationship or a future approved registry result.',resolve:function(){return null;}});

  

  var COMMON=[field('schema_version','string',true),field('template_date','date',true),field('source','string',true),field('data_owner','string',false),field('confidence','string',false),field('notes','string',false)];
  

  

  var COLUMN_META={"accuracy_m":{"d":"Positional accuracy of the coordinates, in metres.","s":"3"},"action_lead_minutes":{"d":"Minutes of warning the operator needs to act before the breach.","s":"360","s2":"120"},"address":{"d":"Street address or site description.","s":"Plot 14, Sundar Industrial Estate, Lahore","s2":"Plot 7, Korangi Industrial Area"},"alternate_available":{"d":"Whether an alternate supply or route exists.","e":["yes","no","partial"],"s":"partial","s2":"yes"},"alternate_route":{"d":"Description of the fallback route, if one exists.","s":"N-5 via Multan when M-4 is closed"},"asset_id":{"d":"Stable unique identifier for the asset. Used to join every other template to this one. Never reuse an id.","s":"AST-0001","s2":"AST-0002"},"asset_id_or_class":{"d":"The asset_id this relationship applies to, or an asset class it applies to generally.","s":"AST-0001","s2":"AST-0002"},"asset_name":{"d":"Human-readable asset name as the client refers to it.","s":"Lahore Plant 1","s2":"Karachi Warehouse 3"},"asset_subtype":{"d":"More specific classification within the asset type.","s":"spinning mill","s2":"distribution warehouse"},"asset_type":{"d":"Primary asset class: industrial, hospital, telecom, energy, transport, bank, agriculture, water or commercial (factory, warehouse, port and similar words are mapped to these).","e":["industrial","hospital","telecom","energy","transport","bank","agriculture","water","commercial"],"s":"industrial","s2":"commercial"},"authority_reference":{"d":"Document, standard or permit number the limit comes from.","s":"HSE-STD-114"},"authority_type":{"d":"Who set this limit: client (the operator, its own engineering standard or permit condition), manufacturer (OEM), standard, site-rule, regulator or insurer.","e":["client","manufacturer","standard","site-rule","regulator","insurer"],"s":"client"},"backup_duration_hr":{"d":"Hours the backup supply can carry the site at its declared load.","s":"12","s2":"4"},"backup_power":{"d":"Standby power present at the site.","e":["none","generator","ups","generator_and_ups","grid_dual_feed"],"s":"generator","s2":"ups"},"business_unit":{"d":"Internal division or operating unit responsible for the asset.","s":"Textiles"},"calibration_status":{"d":"Whether this relationship has been calibrated to local evidence.","e":["uncalibrated","locally_calibrated","regionally_calibrated"],"s":"uncalibrated"},"confidence":{"d":"How reliable the supplier considers this record.","e":["high","medium","low"],"s":"high"},"confidentiality_class":{"d":"Handling restriction for this record.","e":["public","internal","confidential","restricted"],"s":"confidential","s2":"internal"},"construction_applicability":{"d":"Construction types this relationship is valid for.","s":"steel portal frame","s2":"reinforced concrete frame"},"construction_type":{"d":"Primary structural system.","s":"steel portal frame","s2":"reinforced concrete frame"},"cooling_type":{"d":"Cooling system serving the asset.","s":"evaporative","s2":"none"},"country":{"d":"ISO 3166-1 country name or alpha-2 code.","s":"PK"},"critical_nodes":{"d":"Named upstream nodes whose loss interrupts this dependency.","s":"Sundar 132 kV grid station","s2":"Korangi Causeway"},"criticality":{"d":"How severely loss of this asset affects operations, 1 (lowest) to 5 (highest). Drives management ordering; leave blank rather than guessing.","s":"4","s2":"3"},"crs":{"d":"Coordinate reference system, for example EPSG:4326.","s":"EPSG:4326"},"curve_confidence":{"d":"Confidence in the relationship itself, as assessed by its source or by a reviewer.","e":["high","medium","low"],"s":"medium","s2":"low"},"curve_notes":{"d":"Free text about the relationship itself, its assumptions and its limits.","s":""},"curve_source":{"d":"Publication, standard or study the relationship comes from. Not the same as who sent us the row.","s":"client engineering study","s2":"expert screening panel"},"damage_ratio":{"d":"Damage as a fraction of replacement value, 0 to 1. Never a percentage. This is the fragility/vulnerability relationship's own column and keeps its scale.","s":"0.35","s2":"0.12"},"data_owner":{"d":"Person or team accountable for this record being correct and current.","s":"HSE Manager"},"datum_or_reference":{"d":"Vertical datum or reference surface for elevation.","s":"EGM2008"},"dependency_id":{"d":"Stable unique identifier for the dependency.","s":"DEP-0001","s2":"DEP-0002"},"dependency_type":{"d":"What kind of dependency this is.","e":["power","water","gas","telecom","transport","supplier","workforce"],"s":"power","s2":"transport"},"description":{"d":"Free-text description of this record.","s":"example record"},"design_standard":{"d":"Code or standard the design value is taken from.","s":"BCP SP-2007"},"destination":{"d":"End point of the route.","s":"Karachi Port","s2":"Port Qasim"},"district":{"d":"District or second-level administrative unit.","s":"Lahore","s2":"Karachi South"},"downtime_hr":{"d":"Hours of lost operation at this intensity.","s":"72","s2":"24"},"drainage_condition":{"d":"Condition and capacity of site drainage.","e":["good","fair","poor","unknown"],"s":"fair","s2":"good"},"duration_minutes":{"d":"Minutes the threshold must be exceeded before the limit counts as breached.","s":"180","s2":"60"},"elevation_m":{"d":"Ground elevation above datum, in metres.","s":"214","s2":"8"},"end_time":{"d":"When the incident ended (ISO 8601 with timezone).","s":"2026-07-21T09:00:00+05:00","s2":"2026-08-02T23:00:00+05:00"},"feature_id":{"d":"Stable unique identifier for the feature.","s":"FT-0001","s2":"FT-0002"},"feature_type":{"d":"What kind of feature this is.","e":["site","building","plot","corridor","route","line","intake","outfall","catchment","point","other"],"s":"site","s2":"building"},"flood_protection":{"d":"Flood defences present at the site, and their stated standard.","e":["none","bund","floodwall","raised_platform","pumped_drainage"],"s":"bund","s2":"raised_platform"},"floor_elevation_m":{"d":"Height of the lowest finished floor above surrounding ground, in metres.","s":"0.6","s2":"1.1"},"function_type":{"d":"Form of the relationship.","e":["fragility_curve","vulnerability_curve","expert_screening_class"],"s":"fragility_curve","s2":"expert_screening_class"},"geographic_applicability":{"d":"Region this relationship was derived for and may be applied to.","s":"Punjab, Pakistan"},"geometry_geojson":{"d":"Feature geometry as a GeoJSON geometry object.","s":"{\"type\":\"Polygon\",\"coordinates\":[[[74.186,31.363],[74.189,31.363],[74.189,31.366],[74.186,31.366],[74.186,31.363]]]}","s2":"{\"type\":\"Point\",\"coordinates\":[67.1320,24.8215]}"},"geometry_id":{"d":"Identifier joining this asset to a footprint in the spatial_geometry template.","s":"GEO-0001","s2":"GEO-0002"},"geometry_type":{"d":"How the asset is represented spatially.","e":["point","polygon","multipolygon","line","none"],"s":"polygon","s2":"point"},"hazard":{"d":"Hazard the relationship describes.","s":"flood","s2":"wind"},"incident_id":{"d":"Stable unique identifier for the incident.","s":"INC-0001","s2":"INC-0002"},"industry":{"d":"Industry sector of the asset.","s":"manufacturing"},"instrument":{"d":"Instrument model or type.","s":"Vaisala WXT536","s2":"OTT Pluvio2"},"intensity_metric":{"d":"Physical quantity that drives the damage, for example flood depth or 3-second gust.","s":"flood depth","s2":"3-second gust"},"intensity_unit":{"d":"Unit of intensity_metric. Required: an intensity without a unit is not a measurement.","s":"metre","s2":"m/s"},"intensity_value":{"d":"Intensity at which the stated damage ratio or operational state applies.","s":"1.2","s2":"33"},"last_updated":{"d":"Date this record was last verified (ISO 8601).","s":"2026-09-01","s2":"2026-08-15"},"latitude":{"d":"Decimal degrees, WGS84. Positive north. Required for any spatial screening.","s":"31.3641","s2":"24.8215"},"location":{"d":"Place name or description of where the feature is.","s":"Sundar Industrial Estate, Lahore","s2":"Korangi, Karachi"},"longitude":{"d":"Decimal degrees, WGS84. Positive east. Required for any spatial screening.","s":"74.1875","s2":"67.1320"},"max_outage_hr":{"d":"Hours the asset can operate without this dependency.","s":"12","s2":"24"},"maximum_tolerable_downtime_hr":{"d":"Hours of outage after which consequences become unacceptable to the business.","s":"48","s2":"96"},"name":{"d":"Name of the feature.","s":"Lahore Plant 1","s2":"Karachi Warehouse 3"},"network_type":{"d":"Transport network the route uses.","e":["road","rail","port","air","pipeline","transmission"],"s":"road","s2":"port"},"notes":{"d":"Free text. Anything a reviewer needs that no other column holds.","s":""},"observed_intensity":{"d":"Hazard intensity observed during the incident, in the stated unit.","s":"0.9","s2":"28"},"operating_hours":{"d":"Normal operating pattern, for example 24/7, or 08:00-18:00 Mon-Sat.","s":"24/7","s2":"08:00-20:00 Mon-Sat"},"operational_state":{"d":"Operating state at this intensity.","e":["operational","degraded","shutdown","destroyed"],"s":"degraded","s2":"degraded"},"operational_threshold":{"d":"What happens operationally when this limit is breached.","s":"reduce shift length","s2":"suspend yard loading"},"operator":{"d":"Comparison that defines exceedance.","e":[">",">=","<","<=","=","!="],"s":">=","s2":">="},"origin":{"d":"Start point of the route.","s":"Lahore Plant 1","s2":"Karachi Warehouse 3"},"owner_role":{"d":"Role of the accountable owner.","s":"Site Engineering Manager"},"parameter":{"d":"Engineering design parameter being recorded.","s":"design wind speed","s2":"design flood level"},"parent_company":{"d":"Legal entity that owns the asset.","s":"Example Industries (Pvt) Ltd"},"province":{"d":"Province or first-level administrative unit.","s":"Punjab","s2":"Sindh"},"qc_flag":{"d":"Quality-control status of this record.","e":["pass","provisional","fail"],"s":"pass"},"recovery_time_hr":{"d":"Hours to restore normal operation.","s":"96"},"required_action":{"d":"The action taken when this limit is breached.","s":"move outdoor work to night shift","s2":"clear yard and secure containers"},"responsible_engineer":{"d":"Engineer accountable for the value.","s":"A. Rahman, PE"},"return_period_years":{"d":"Return period the design value corresponds to, in years.","s":"50","s2":"100"},"roof_type":{"d":"Roof construction and covering.","s":"insulated steel sheet","s2":"concrete slab"},"route_id":{"d":"Stable unique identifier for the route.","s":"RTE-0001","s2":"RTE-0002"},"schema_version":{"d":"Version of this template contract. Do not edit; it must match the schema you validated against.","s":"1.0.0"},"sensor_id":{"d":"Stable unique identifier for the sensor or station.","s":"SEN-0001","s2":"SEN-0002"},"source":{"d":"Where this record came from: the client system, survey, document or authority that supplied it.","s":"client asset register"},"source_year":{"d":"Year the relationship was published.","s":"2024","s2":"2026"},"start_time":{"d":"When the incident began (ISO 8601 with timezone).","s":"2026-07-18T03:00:00+05:00","s2":"2026-08-02T11:00:00+05:00"},"station_name":{"d":"Name of the station the sensor belongs to.","s":"Plant 1 met mast","s2":"Warehouse 3 rain gauge"},"survey_date":{"d":"Date of the survey or assessment (ISO 8601).","s":"2026-06-12"},"template_date":{"d":"Publication date of this template version (ISO 8601, YYYY-MM-DD).","s":"2026-09-14"},"threshold":{"d":"Value at which the limit is reached, in the stated unit.","s":"42","s2":"25"},"timestamp":{"d":"Observation time (ISO 8601 with timezone).","s":"2026-09-01T06:00:00+05:00","s2":"2026-09-01T06:00:00+05:00"},"unit":{"d":"Unit of the threshold. Required: a threshold without a unit cannot be evaluated.","s":"degC","s2":"mm/h"},"valid_from":{"d":"Date this limit takes effect (ISO 8601).","s":"2026-04-01"},"validation_status":{"d":"Whether this relationship has been validated against observed loss.","e":["unvalidated","validated_against_loss","peer_reviewed"],"s":"unvalidated"},"value":{"d":"Value of the parameter, in the stated unit.","s":"145","s2":"2.4"},"variable":{"d":"Measured quantity the limit applies to (temperature_2m, wet_bulb_temperature_2m, precipitation, precipitation_24h, wind_gusts_10m, wind_speed_10m, river_discharge, cape and the other nowcast variables).","s":"temperature_2m","s2":"precipitation"},"version":{"d":"Version of the relationship as published by its source.","s":"1.0"},"vulnerability_id":{"d":"Stable unique identifier for this vulnerability or fragility relationship.","s":"VUL-0001","s2":"VUL-0002"},"year_built":{"d":"Year of original construction (YYYY).","s":"2011","s2":"2018"}};
  function withMeta(c){
    var m=COLUMN_META[c.name]; if(!m) return c;
    var out=Object.assign({},c);
    if(m.d && !out.description) out.description=m.d;
    if(m.e && !out.enum) out.enum=m.e;
    out.sample  = (m.s  !== undefined) ? m.s  : null;
    out.sample2 = (m.s2 !== undefined) ? m.s2 : out.sample;
    return out;
  }
  var TPL_RENAME={vulnerability_fragility:{source:'curve_source',confidence:'curve_confidence',notes:'curve_notes'}};
  function resolveColumns(id,cols){
    var envNames={},out=[],seen={},ren=TPL_RENAME[id]||{},i,c,n;
    for(i=0;i<COMMON.length;i++) envNames[COMMON[i].name]=true;
    var all=COMMON.concat(cols);
    for(i=0;i<all.length;i++){
      c=all[i]; n=c.name;
      if(!seen[n]){ seen[n]=true; out.push(withMeta(c)); continue; }
      if(ren[n]){ var r=Object.assign({},c,{name:ren[n]});
                  if(!seen[r.name]){ seen[r.name]=true; out.push(withMeta(r)); } continue; }
       
    }
    return out;
  }
  function tpl(id,label,cols,purpose){return {id:id,label:label,version:'1.0.0',template_date:'2026-09-14',purpose:purpose,columns:resolveColumns(id,cols),prototypeFormats:['csv','xlsx','json-schema'],productionFormats:['csv','xlsx','json-schema']};}
  var T=[
    tpl('master_asset','Master Asset Register',ASSET_FIELDS,'Authoritative asset identity, geometry, business value and physical profile.'),
    tpl('operating_limits','Operating Limits',[field('asset_id','string',true),field('variable','string',true),field('operator','string',true),field('threshold','number',true),field('unit','string',true),field('duration_minutes','number',false,'min'),field('action_lead_minutes','number',false,'min'),field('authority_type','string',true),field('authority_reference','string',true),field('required_action','string',true),field('owner_role','string',false),field('valid_from','date',false)],'Client/manufacturer/regulatory limits that convert weather into operational consequences.'),
    tpl('vulnerability_fragility','Vulnerability / Fragility',VF_FIELDS,'Governed intensity-to-damage/operational response relationships.'),
    tpl('engineering','Engineering Information',[field('asset_id','string',true),field('parameter','string',true),field('value','number',true),field('unit','string',true),field('datum_or_reference','string',false),field('design_standard','string',false),field('return_period_years','number',false,'year'),field('survey_date','date',false),field('responsible_engineer','string',false)],'Engineering/design-basis evidence for screening-to-design escalation.'),
    tpl('spatial_points','Spatial Points',[field('name','string',true),field('latitude','number',true,'degrees'),field('longitude','number',true,'degrees'),field('feature_type','string',true),field('asset_id','string',false),field('crs','string',true),field('accuracy_m','number',false,'m'),field('survey_date','date',false)],'Point evidence and asset-linked site features.'),
    tpl('spatial_geometry','Polygon / Route Geometry',[field('feature_id','string',true),field('asset_id','string',false),field('feature_type','string',true),field('name','string',true),field('geometry_geojson','object',true),field('crs','string',true),field('accuracy_m','number',false,'m')],'Polygon and route geometry contract.'),
    tpl('incidents_losses','Historical Incidents / Losses',[field('incident_id','string',true),field('asset_id','string',true),field('hazard','string',true),field('start_time','date-time',true),field('end_time','date-time',false),field('observed_intensity','number',false),field('intensity_unit','string',false),field('downtime_hr','number',false,'hour'),field('description','string',false)],'Observed incidents for validation, vulnerability and loss learning.'),
    tpl('ground_sensors','Ground Stations / Sensors',[field('sensor_id','string',true),field('asset_id','string',false),field('station_name','string',true),field('latitude','number',true,'degrees'),field('longitude','number',true,'degrees'),field('elevation_m','number',false,'m'),field('variable','string',true),field('timestamp','date-time',true),field('value','number',true),field('unit','string',true),field('qc_flag','string',false),field('instrument','string',false)],'Client/public observations for verification and local evidence.'),
    tpl('dependencies','Suppliers / Dependencies',[field('asset_id','string',true),field('dependency_id','string',true),field('dependency_type','string',true),field('name','string',true),field('location','string',false),field('criticality','integer',false,'1-5',null,{min:1,max:5}),field('max_outage_hr','number',false,'hour'),field('alternate_available','string',false),field('recovery_time_hr','number',false,'hour')],'Power, water, supplier, telecom, fuel and service dependencies.'),
    tpl('critical_routes','Critical Routes / Networks',[field('route_id','string',true),field('asset_id','string',true),field('network_type','string',true),field('origin','string',true),field('destination','string',true),field('geometry_id','string',true),field('critical_nodes','string',false),field('operational_threshold','string',false),field('alternate_route','string',false)],'Access, logistics and network pathways whose failure can interrupt the asset.')
  ];
  function schemaFor(t){
    

    var props={},req=[];
    t.columns.forEach(function(c){
      var p={type:(c.type==='date-time'||c.type==='date')?'string'
                 :(c.type==='integer'?'integer':(c.type==='number'?'number'
                 :(c.type==='boolean'?'boolean':(c.type==='object'?['object','string']:'string'))))};
      if(c.type==='date') p.format='date';
      if(c.type==='date-time') p.format='date-time';
      if(c.type==='object') p['x-csv-form']='the object written as JSON text in one cell';
      var b=bounds(c); if(b.min!=null) p.minimum=b.min; if(b.max!=null) p.maximum=b.max;
      if(c.description) p.description=c.description;
      if(c.unit) p['x-unit']=c.unit;
      if(c.enum) p.enum=c.enum;
      props[c.name]=p;
      if(c.required) req.push(c.name);
    });
    return {$schema:'https://json-schema.org/draft/2020-12/schema',
            title:t.label, description:t.purpose||'',
            'x-template-id':t.id, 'x-template-version':t.version,
            'x-template-date':t.template_date,
            type:'object', properties:props,
            required:req.filter(function(v,i,a){return a.indexOf(v)===i;}).sort(),
            additionalProperties:false};
  }
  function csvFor(t){
    

    if(SAMPLES[t.id]) return csvText(t, sampleRows(t));
    var fill=function(which){ return t.columns.map(function(c){
      if(c.name==='schema_version') return t.version;
      if(c.name==='template_date')  return t.template_date;
      var v = which===2 ? c.sample2 : c.sample;
      if(v===undefined || v===null) v = (c.enum && c.enum.length) ? c.enum[0] : '';
      return v; }); };
    var rows=[t.columns.map(function(c){return c.name;}), fill(1), fill(2)];
    return rows.map(function(r){ return r.map(function(v){
      v=String(v==null?'':v);
      return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v;
    }).join(','); }).join('\n');
  }
  

  var SAMPLE_ENV={source:'AJG Supplies sample — SAMPLE data, invented for illustration (not an AJG submission)',
                  data_owner:'Group HSE & Risk, AJG Supplies (sample)', confidence:'medium'};
  

  var KHI='DEMO-A3', LHR='DEMO-A10';
  function masterRow(id, notes){
    var a=(G.samplePortfolio?G.samplePortfolio():[]).filter(function(x){ return x.asset_id===id; })[0]||{},
        al=(AGN.portfolio&&AGN.portfolio.intake&&AGN.portfolio.intake.alias)||{},
        o={country:'PK', geometry_type:'polygon', last_updated:'2026-09-01T09:00:00+05:00', confidentiality_class:'confidential', notes:notes};
    ASSET_FIELDS.forEach(function(f){ var c=f.name, v=a[al[c]||c]; if(o[c]===undefined && c!=='source' && v!=null && v!=='') o[c]=String(v); });
    return o;
  }
  var SAMPLES={
    master_asset:[
      masterRow(KHI,'SAMPLE: perimeter bund 1.0 m above the local reference'),
      masterRow(LHR,'SAMPLE: the condensers lose capacity above 45 °C')
    ],
    operating_limits:[
      {asset_id:KHI,variable:'precipitation',operator:'>',threshold:'18',unit:'mm/h',duration_minutes:'60',action_lead_minutes:'90',authority_type:'site-rule',authority_reference:'HSE-KHI-07 bund-drain procedure (sample)',required_action:'clear the bund drains and start the pumps',owner_role:'Warehouse HSE manager',valid_from:'2026-04-01'},
      {asset_id:LHR,variable:'temperature_2m',operator:'>',threshold:'45',unit:'degC',duration_minutes:'180',action_lead_minutes:'240',authority_type:'site-rule',authority_reference:'HSE-LHR-03 heat rule for the dock and condensers (sample)',required_action:'run the standby condenser and move dock loading to the early hours',owner_role:'Cold store HSE officer',valid_from:'2026-04-01'}
    ],
    vulnerability_fragility:[
      {vulnerability_id:'VUL-KHI-FL-01',asset_id_or_class:KHI,hazard:'flood',intensity_metric:'flood depth above finished floor',intensity_unit:'m',function_type:'fragility_curve',intensity_value:'0.5',damage_ratio:'0.35',operational_state:'shutdown',downtime_hr:'288',construction_applicability:'reinforced concrete frame',geographic_applicability:'Karachi coastal plain, Sindh',curve_source:'client engineering study KHI-ENG-2026-04 (sample)',source_year:'2026',version:'1.0',curve_confidence:'medium',calibration_status:'uncalibrated',validation_status:'unvalidated',curve_notes:'one point of the depth-damage curve'},
      {vulnerability_id:'VUL-LHR-HT-01',asset_id_or_class:LHR,hazard:'heat',intensity_metric:'daily maximum air temperature',intensity_unit:'degC',function_type:'threshold',intensity_value:'46',damage_ratio:'0.02',operational_state:'degraded',downtime_hr:'72',construction_applicability:'insulated-panel cold rooms in a steel portal frame',geographic_applicability:'central Punjab plains',curve_source:'cold store maintenance records 2024-2025 (sample)',source_year:'2025',version:'1.0',curve_confidence:'low',calibration_status:'uncalibrated',validation_status:'unvalidated',curve_notes:'compressor and condenser-fan failures above 46 °C; capacity curtailed, not destroyed'}
    ],
    engineering:[
      {asset_id:KHI,parameter:'design flood level above local reference',value:'1.2',unit:'m',datum_or_reference:'local ground reference at the main gate',design_standard:'client flood design basis KHI-ENG-2026-04 (sample)',return_period_years:'100',survey_date:'2026-06-12',responsible_engineer:'Site civil engineer (sample)',notes:'finished floor 1.4 m sits 0.2 m above this level'},
      {asset_id:LHR,parameter:'design outdoor dry-bulb temperature',value:'46',unit:'degC',datum_or_reference:'shade air temperature at 2 m',design_standard:'condenser design basis LHR-ENG-2025-02 (sample)',return_period_years:'50',survey_date:'2026-06-12',responsible_engineer:'Refrigeration engineer (sample)'}
    ],
    spatial_points:[
      {name:'Karachi port warehouse boundary marker',latitude:'24.8570',longitude:'67.0060',feature_type:'site',asset_id:KHI,crs:'EPSG:4326',accuracy_m:'3',survey_date:'2026-06-12'},
      {name:'Lahore cold store main gate',latitude:'31.5580',longitude:'74.3502',feature_type:'point',asset_id:LHR,crs:'EPSG:4326',accuracy_m:'3',survey_date:'2026-06-12'}
    ],
    spatial_geometry:[
      {feature_id:'GEO-KHI-PLANT-01',asset_id:KHI,feature_type:'site',name:'AJG port warehouse site boundary',geometry_geojson:'{"type":"Polygon","coordinates":[[[67.005,24.856],[67.016,24.856],[67.016,24.865],[67.005,24.865],[67.005,24.856]]]}',crs:'EPSG:4326',accuracy_m:'3'},
      {feature_id:'GEO-LHR-MILL-01',asset_id:LHR,feature_type:'site',name:'AJG cold store Lahore site boundary',geometry_geojson:'{"type":"Polygon","coordinates":[[[74.3490,31.5570],[74.3525,31.5570],[74.3525,31.5592],[74.3490,31.5592],[74.3490,31.5570]]]}',crs:'EPSG:4326',accuracy_m:'3'},
      {feature_id:'GEO-KHI-RTE-01',asset_id:KHI,feature_type:'route',name:'Port warehouse to Karachi Port haul road',geometry_geojson:'{"type":"LineString","coordinates":[[67.0104,24.8608],[66.9990,24.8480],[66.9870,24.8370]]}',crs:'EPSG:4326',accuracy_m:'10'},
      {feature_id:'GEO-LHR-RTE-01',asset_id:LHR,feature_type:'route',name:'Cold store to Lahore dry port rail siding',geometry_geojson:'{"type":"LineString","coordinates":[[74.35071,31.5580],[74.3600,31.5650],[74.3710,31.5700]]}',crs:'EPSG:4326',accuracy_m:'10'}
    ],
    incidents_losses:[
      {incident_id:'INC-KHI-2025-01',asset_id:KHI,hazard:'flood',start_time:'2025-08-19T06:00:00+05:00',end_time:'2025-08-20T18:00:00+05:00',observed_intensity:'0.4',intensity_unit:'m',downtime_hr:'72',description:'monsoon downpour; yard water 0.4 m, below the 1.4 m floor; bund drains overwhelmed (sample)'},
      {incident_id:'INC-LHR-2025-01',asset_id:LHR,hazard:'heat',start_time:'2025-05-24T11:00:00+05:00',end_time:'2025-05-28T18:00:00+05:00',observed_intensity:'46.5',intensity_unit:'degC',downtime_hr:'36',description:'pre-monsoon heatwave; afternoon dock shifts curtailed, two compressor motors replaced (sample)'}
    ],
    ground_sensors:[
      {sensor_id:'SEN-KHI-01',asset_id:KHI,station_name:'Karachi port warehouse rain gauge',latitude:'24.8605',longitude:'67.0100',elevation_m:'8',variable:'precipitation',timestamp:'2026-08-12T15:00:00+05:00',value:'12.6',unit:'mm/h',qc_flag:'pass',instrument:'tipping-bucket rain gauge, 0.2 mm'},
      {sensor_id:'SEN-LHR-01',asset_id:LHR,station_name:'Lahore cold store weather mast',latitude:'31.5582',longitude:'74.3505',elevation_m:'216',variable:'temperature_2m',timestamp:'2026-06-10T15:00:00+05:00',value:'44.8',unit:'degC',qc_flag:'pass',instrument:'aspirated temperature sensor in a radiation shield'}
    ],
    dependencies:[
      {asset_id:KHI,dependency_id:'DEP-KHI-PWR-01',dependency_type:'power',name:'utility 11 kV grid feeder',location:'Mauripur grid station, Karachi',criticality:'5',max_outage_hr:'8',alternate_available:'partial',recovery_time_hr:'24',notes:'diesel standby covers 48 h at reduced load'},
      {asset_id:LHR,dependency_id:'DEP-LHR-WTR-01',dependency_type:'water',name:'cold store tube-well and municipal supply',location:'Lahore',criticality:'4',max_outage_hr:'12',alternate_available:'yes',recovery_time_hr:'6'}
    ],
    critical_routes:[
      {route_id:'RTE-KHI-01',asset_id:KHI,network_type:'road',origin:'AJG port warehouse · Mauripur Road',destination:'Karachi Port',geometry_id:'GEO-KHI-RTE-01',critical_nodes:'Mauripur Road underpass; Lyari river crossing',operational_threshold:'closed to tankers when standing water exceeds 0.3 m',alternate_route:'Northern Bypass to Port Qasim'},
      {route_id:'RTE-LHR-01',asset_id:LHR,network_type:'rail',origin:'AJG cold store · Lahore',destination:'Lahore dry port',geometry_id:'GEO-LHR-RTE-01',critical_nodes:'dry-port rail yard',operational_threshold:'yard handling suspended above 45 °C in the afternoon',alternate_route:'road haul via the Lahore Ring Road'}
    ]
  };
  

  var TPL_KEY={master_asset:'asset_id',vulnerability_fragility:'vulnerability_id',
               incidents_losses:'incident_id',dependencies:'dependency_id',
               critical_routes:'route_id',spatial_geometry:'feature_id'};
   
  var TPL_IMPORTER={spatial_points:'spatial'};
  function sampleRows(t){
    var rows=SAMPLES[t.id]||[];
    return rows.map(function(r){ var o={};
      t.columns.forEach(function(c){
        var v;
        if(c.name==='schema_version') v=t.version;
        else if(c.name==='template_date') v=t.template_date;
        else if(r[c.name]!==undefined) v=r[c.name];
        else if(SAMPLE_ENV[c.name]!==undefined) v=SAMPLE_ENV[c.name];
        else v='';
        o[c.name]=v; });
      return o; });
  }
   
  function bounds(c){
    var lo=(c.min!=null?c.min:null), hi=(c.max!=null?c.max:null);
    if(c.name==='latitude'){ if(lo==null) lo=-90; if(hi==null) hi=90; }
    if(c.name==='longitude'){ if(lo==null) lo=-180; if(hi==null) hi=180; }
    return {min:lo,max:hi};
  }
  function blank(v){ return v==null || (typeof v==='string' && v.trim()===''); }
  var GEO_TYPES=['Point','MultiPoint','LineString','MultiLineString','Polygon','MultiPolygon'];
  function checkCell(c,v){
    if(blank(v)) return c.required ? 'is required and is empty' : null;
    var s=(typeof v==='string')?v.trim():v, n=Number(s);
    if(c.type==='number'||c.type==='integer'){
      if(typeof s==='boolean'||!isFinite(n)) return 'must be a number, got "'+s+'"';
      if(c.type==='integer' && Math.floor(n)!==n) return 'must be a whole number, got "'+s+'"';
      var b=bounds(c);
      if(b.min!=null && n<b.min) return 'must be at least '+b.min+', got '+n;
      if(b.max!=null && n>b.max) return 'must be at most '+b.max+', got '+n;
    } else if(c.type==='date'){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return 'must be a date written YYYY-MM-DD, got "'+s+'"';
      var d=new Date(String(s)+'T00:00:00Z');
      if(isNaN(d.getTime()) || d.toISOString().slice(0,10)!==String(s)) return 'is not a calendar date: "'+s+'"';
    } else if(c.type==='date-time'){
      if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(String(s)) || isNaN(Date.parse(String(s))))
        return 'must be an ISO 8601 date-time with its UTC offset (e.g. 2026-09-01T09:00:00+05:00), got "'+s+'"';
    } else if(c.type==='object'){
      var o=s;
      if(typeof o==='string'){ try{ o=JSON.parse(o); }catch(_){ return 'must be a JSON object; the text does not parse'; } }
      if(!o || typeof o!=='object' || Array.isArray(o)) return 'must be a JSON object';
      if(c.name==='geometry_geojson'){
        if(GEO_TYPES.indexOf(o.type)<0) return 'must be a GeoJSON geometry ('+GEO_TYPES.join(', ')+'), got type "'+o.type+'"';
        if(!Array.isArray(o.coordinates) || !o.coordinates.length) return 'is a GeoJSON geometry with no coordinates';
      }
    } else if(c.type==='boolean'){
      if(!/^(true|false)$/i.test(String(s))) return 'must be true or false, got "'+s+'"';
    }
    if(c.enum && c.enum.indexOf(String(s))<0) return 'must be one of '+c.enum.join(', ')+'; got "'+s+'"';
    if(c.name==='hazard'){
      try{ if(AGN.hazardRegistry && AGN.hazardRegistry.resolve && AGN.hazardRegistry.resolve(String(s))==null)
             return 'is not a hazard id this build knows ("'+s+'")'; }catch(_){}
    }
     
    return null;
  }
  function validateRows(t,rows){
    var errors=[], cols={}, keyCol=TPL_KEY[t.id]||null, seen={};
    t.columns.forEach(function(c){ cols[c.name]=c; });
    (rows||[]).forEach(function(r,i){
      var line=i+2;    
      Object.keys(r||{}).forEach(function(k){
        if(!cols[k]) errors.push({line:line,column:k,why:'is not a column of '+t.id+' v'+t.version});
      });
      t.columns.forEach(function(c){
        var why=checkCell(c,(r||{})[c.name]);
        if(why) errors.push({line:line,column:c.name,why:why});
      });
      if(!blank((r||{}).schema_version) && String(r.schema_version).trim()!==t.version)
        errors.push({line:line,column:'schema_version',why:'was written for version '+r.schema_version+'; this build reads '+t.version});
      if(keyCol && !blank((r||{})[keyCol])){
        var kv=String(r[keyCol]).trim();
        if(seen[kv]) errors.push({line:line,column:keyCol,why:'repeats '+kv+' from line '+seen[kv]});
        else seen[kv]=line;
      }
    });
    return errors;
  }
   
  function importerCheck(t,rows){
    if(t.id==='operating_limits'){
      try{
        if(!(AGN.assets && AGN.assets.parseCsv && AGN.assets.validateAsset)) return null;
        var parsed=AGN.assets.parseCsv(csvText(t,rows));
        var bad=[], ok=0;
        (parsed||[]).forEach(function(a,i){ var v=AGN.assets.validateAsset(a,i);
          if(v && v.errors && v.errors.length) bad.push({line:i+2,why:v.errors[0]}); else if(v) ok++; });
        return {importer:'Operations limit register',accepted:ok,rejected:bad};
      }catch(e){ return {importer:'Operations limit register',accepted:0,rejected:[{line:0,why:String(e&&e.message||e)}]}; }
    }
    var k=TPL_IMPORTER[t.id]; if(!k || !(AGN.intake && AGN.intake.get)) return null;
    var spec=AGN.intake.get(k); if(!spec) return null;
    var acc=0, rej=[];
    (rows||[]).forEach(function(r,i){
      var why=null;
      (spec.columns||[]).forEach(function(c){ if(!why && c.required && blank(r[c.name])) why='is missing '+c.name; });
      if(!why && typeof spec.validate==='function'){
        try{ var v=spec.validate(Object.assign({},r)); if(typeof v==='string' && v) why=v; else if(v && v.ok===false) why=v.why||'refused'; }
        catch(e){ why=String(e&&e.message||e); }
      }
      if(why) rej.push({line:i+2,why:why}); else acc++;
    });
    return {importer:(spec.label||k)+' importer',accepted:acc,rejected:rej};
  }
  function validate(id,rows){
    var t=T.filter(function(x){return x.id===id})[0]||null;
    if(!t) return {ok:false,template:id,rows:0,errors:[{line:0,column:null,why:'no template '+id}],importer:null};
    var errs=validateRows(t,rows);
    return {ok:errs.length===0,template:id,version:t.version,rows:(rows||[]).length,
            columns:t.columns.length,required:t.columns.filter(function(c){return c.required}).length,
            errors:errs,importer:importerCheck(t,rows)};
  }
  function csvCell(v){ v=String(v==null?'':v); return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
  function csvText(t,rows){
    return [t.columns.map(function(c){return c.name;}).join(',')].concat((rows||[]).map(function(r){
      return t.columns.map(function(c){ return csvCell(r[c.name]); }).join(','); })).join('\n');
  }
  function parseCsvText(text){
    var out=[],row=[],f='',q=false,s=String(text||'').replace(/^﻿/,'');
    for(var i=0;i<s.length;i++){ var ch=s[i];
      if(q){ if(ch==='"'){ if(s[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=ch; continue; }
      if(ch==='"'){ q=true; continue; }
      if(ch===','){ row.push(f); f=''; continue; }
      if(ch==='\r') continue;
      if(ch==='\n'){ row.push(f); out.push(row); row=[]; f=''; continue; }
      f+=ch; }
    if(f!=='' || row.length){ row.push(f); out.push(row); }
    out=out.filter(function(r){ return r.some(function(x){ return String(x).trim()!==''; }); });
    if(!out.length) return [];
    var head=out[0].map(function(h){ return String(h).trim(); });
    return out.slice(1).map(function(r){ var o={}; head.forEach(function(h,j){ if(h) o[h]=(r[j]==null?'':r[j]); }); return o; });
  }

  

  var CRC_T=(function(){ var t=[],c,n,k; for(n=0;n<256;n++){ c=n; for(k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[n]=c>>>0; } return t; })();
  function crc32(b){ var c=0xFFFFFFFF; for(var i=0;i<b.length;i++) c=CRC_T[(c^b[i])&0xFF]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
  function utf8(s){ return new TextEncoder().encode(s); }
  function zipStore(files){
    var parts=[], central=[], off=0;
    function u16(v){ return [v&255,(v>>>8)&255]; }
    function u32(v){ return [v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255]; }
    files.forEach(function(f){
      var name=utf8(f.name), data=utf8(f.text), crc=crc32(data);
      var head=[].concat([0x50,0x4b,0x03,0x04],u16(20),u16(0x0800),u16(0),u16(0),u16(0x21),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0));
      parts.push(new Uint8Array(head),name,data);
      central.push({name:name,crc:crc,len:data.length,off:off});
      off+=head.length+name.length+data.length;
    });
    var cstart=off, clen=0;
    central.forEach(function(e){
      var h=[].concat([0x50,0x4b,0x01,0x02],u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0x21),u32(e.crc),u32(e.len),u32(e.len),u16(e.name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(e.off));
      parts.push(new Uint8Array(h),e.name); clen+=h.length+e.name.length;
    });
    parts.push(new Uint8Array([].concat([0x50,0x4b,0x05,0x06],u16(0),u16(0),u16(central.length),u16(central.length),u32(clen),u32(cstart),u16(0))));
    var total=parts.reduce(function(a,p){return a+p.length},0), out=new Uint8Array(total), o=0;
    parts.forEach(function(p){ out.set(p,o); o+=p.length; });
    return out;
  }
  function xmlEsc(v){ return String(v==null?'':v).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]}).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,''); }
  function colRef(i){ var s=''; i++; while(i>0){ var m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; }
  function sheetXml(rows,numericCols){
    var body=rows.map(function(r,ri){
      return '<row r="'+(ri+1)+'">'+r.map(function(v,ci){
        var ref=colRef(ci)+(ri+1), sty=(ri===0?' s="1"':'');
        if(ri>0 && numericCols && numericCols[ci] && !blank(v) && isFinite(Number(v)))
          return '<c r="'+ref+'"'+sty+'><v>'+Number(v)+'</v></c>';
        if(blank(v)) return '';
        return '<c r="'+ref+'" t="inlineStr"'+sty+'><is><t xml:space="preserve">'+xmlEsc(v)+'</t></is></c>';
      }).join('')+'</row>'; }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>'+body+'</sheetData></worksheet>';
  }
  function xlsxFor(t){
    var rows=sampleRows(t), num=t.columns.map(function(c){ return c.type==='number'||c.type==='integer'; });
    var data=[t.columns.map(function(c){return c.name;})].concat(rows.map(function(r){ return t.columns.map(function(c){ return r[c.name]; }); }));
    var defs=[['column','type','required','unit','allowed values','minimum','maximum','description']].concat(t.columns.map(function(c){
      var b=bounds(c); return [c.name,c.type,c.required?'yes':'no',c.unit||'',(c.enum||[]).join(' | '),b.min==null?'':String(b.min),b.max==null?'':String(b.max),c.description||'']; }));
    var about=[['field','value'],['template',t.id],['label',t.label],['version',t.version],['template date',t.template_date],['purpose',t.purpose||''],
               ['generated from','AGN.templateRegistry in this build: the CSV header, the JSON Schema, this workbook and the import validator read one column list'],
               ['sample','the data sheet holds the worked sample (AJG Supplies sample sites, invented values); replace every row with your own']];
    var sheets=[['data',sheetXml(data,num)],['definitions',sheetXml(defs,null)],['about',sheetXml(about,null)]];
    var files=[
      {name:'[Content_Types].xml',text:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        +sheets.map(function(s,i){ return '<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('')+'</Types>'},
      {name:'_rels/.rels',text:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
      {name:'xl/workbook.xml',text:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
        +sheets.map(function(s,i){ return '<sheet name="'+s[0]+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>'; }).join('')+'</sheets></workbook>'},
      {name:'xl/_rels/workbook.xml.rels',text:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        +sheets.map(function(s,i){ return '<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>'; }).join('')
        +'<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
      {name:'xl/styles.xml',text:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'}
    ].concat(sheets.map(function(s,i){ return {name:'xl/worksheets/sheet'+(i+1)+'.xml',text:s[1]}; }));
    return zipStore(files);
  }
  function download(name,text,type){var u=URL.createObjectURL(new Blob([text],{type:type||'text/plain'})),a=D.createElement('a');a.href=u;a.download=name;D.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},800);}
  AGN.templateRegistry=freeze({version:'1.0.0',count:T.length,templates:T,get:function(id){return T.filter(function(x){return x.id===id})[0]||null;},schema:schemaFor,

  buildCsv:function(id){var t=this.get(id);return t?csvFor(t):null;},
  buildSchema:function(id){var t=this.get(id);return t?schemaFor(t):null;},
  downloadCsv:function(id){var t=this.get(id);if(t)download('NIGRAAN_'+id+'_v'+t.version+'.csv',this.buildCsv(id),'text/csv');},
  downloadSchema:function(id){var t=this.get(id);if(t)download('NIGRAAN_'+id+'_schema_v'+t.version+'.json',JSON.stringify(this.buildSchema(id),null,2),'application/json');},
  

  buildXlsx:function(id){var t=this.get(id);return t?xlsxFor(t):null;},
  downloadXlsx:function(id){var t=this.get(id);if(t)download('NIGRAAN_'+id+'_v'+t.version+'.xlsx',xlsxFor(t),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');},
  sample:function(id){var t=this.get(id);return t?sampleRows(t):[];},
  validate:validate,
  parseCsv:parseCsvText,
  importerFor:function(id){return id==='operating_limits'?'operations-register':(TPL_IMPORTER[id]||null);},
  xlsx:'generated in the browser from this registry: a data sheet (header and the worked sample), a definitions sheet (type, required, unit, allowed values, range, description per column) and an about sheet'});

   
  var OEF=[
    {id:'mach',provider:'MACH',role:'live/forecast',status:'integrated',use:'weather, ensemble, air quality, flood, seasonal, climate'},
    {id:'era5',provider:'Copernicus global reanalysis / land reanalysis',role:'baseline',status:'integrated',use:'historical climate and verification context'},
    {id:'glofas',provider:'global river-flow model',role:'hydrology',status:'integrated',use:'river discharge; local gauge bias adjustment only where declared'},
    {id:'worldpop',provider:'WorldPop',role:'exposure',status:'partial',use:'population exposure; expand to asset buffers and age-sensitive heat context'},
    {id:'glo30',provider:'Copernicus DEM GLO-30',role:'terrain',status:'partial',use:'terrain/elevation baseline and future 3D COG terrain'},
    {id:'soilgrids',provider:'ISRIC SoilGrids',role:'soil',status:'partial',use:'soil properties and derived HSG with transformation provenance'},
    {id:'osm',provider:'OpenStreetMap',role:'dependency',status:'partial',use:'settlements now; expand to roads, bridges, power, hospitals and dependency graph'},
    {id:'worldcover',provider:'ESA WorldCover',role:'landcover',status:'planned',use:'10 m land cover and runoff/site context'},
    {id:'hydrosheds',provider:'HydroSHEDS / HydroATLAS',role:'hydrology baseline',status:'planned',use:'catchment, river reach, upstream basin and network context'},
    {id:'jrc_water',provider:'JRC Global Surface Water',role:'historical water',status:'planned',use:'water occurrence/seasonality; not a return-period flood map'},
    {id:'imerg',provider:'satellite record GPM satellite rainfall',role:'observation',status:'planned',use:'independent precipitation evidence and event reconstruction'},
    {id:'smap',provider:'satellite record SMAP',role:'antecedent wetness',status:'planned',use:'soil wetness/drought/flood preconditioning; not a site sensor'},
    {id:'sentinel',provider:'Copernicus Sentinel-1/2',role:'satellite',status:'planned',use:'flood extent, NDVI/NDMI/water/land condition workflows'},
    {id:'wapor',provider:'FAO WaPOR',role:'agriculture/water',status:'planned',use:'ET, biomass and water-productivity context'},
    {id:'ghsl',provider:'EC JRC GHSL',role:'built environment',status:'planned',use:'built-up morphology and settlement context alongside WorldPop'},
    {id:'nasa_power',provider:'satellite climate record',role:'solar/met baseline',status:'planned',use:'solar-energy and historical meteorological context; not a replacement for operational forecast'},
    {id:'worldbank',provider:'World Bank CCKP / WDI',role:'context/benchmark',status:'planned',use:'development vulnerability and external climate benchmark; never a physical hazard engine'},
    {id:'faostat',provider:'FAOSTAT',role:'sector context',status:'planned',use:'agriculture/food sector context, not site-level hazard'}
  ];
  AGN.openEvidenceFabric=freeze({version:'1.0.0',classes:['live','baseline','context'],sources:OEF,rule:'ingest/version/preprocess/cite once, then serve NIGRAAN evidence objects; product modules do not depend directly on provider-specific semantics'});

  

  AGN.reportCatalog=freeze({version:'1.0.0',tiers:{decision:['executive','readiness72','weatherImpact','dataGap'],management:['site','portfolio','engineering'],evidence:['assurance']},

  reports:{
    executive:{title:'Executive Climate Risk Brief',audience:'executive',route:'brief',status:'generated'},readiness72:{title:'72-Hour Operational Readiness Brief',audience:'operations',route:'readiness72',status:'generated'},weatherImpact:{title:'Operational Weather Impact Brief',audience:'operations',route:'weatherImpact',status:'generated'},dataGap:{title:'Data Gap Brief',audience:'client data owner / executive',route:'dataGap',status:'generated'},site:{title:'Asset Climate & Hazard Screening',audience:'risk / engineering',route:'technical',status:'generated'},portfolio:{title:'Portfolio Prioritisation',audience:'risk / management',route:'portfolio',status:'generated'},engineering:{title:'Engineering Data Readiness',audience:'engineering',route:'engineering',status:'generated'},assurance:{title:'Methodology & Evidence / Assurance Pack',audience:'technical assurance',route:'assurance',status:'generated'}
  },
  statusRule:'generated = this build renders the report today; specified = the contract is fixed and the generator is a backend deliverable. A specified report is NOT a capability this build has. v91.16.3: five entries were marked specified while their routes existed or could be composed from the fifteen page renderers already present - site and assurance had working routes the whole time. The catalogue was understating the build, which is the same class of error as overstating it: both make the status field unusable.',
  generatedCount:function(){var n=0,r=this.reports||{};for(var k in r){if(r[k].status==='generated')n++;}return n;},
  specifiedCount:function(){var n=0,r=this.reports||{};for(var k in r){if(r[k].status==='specified')n++;}return n;}
  });

  

  

  AGN.productReadiness=freeze({release:'91.17',score:null,scale:10,scoreType:'internal master-specification maturity estimate',scoreBasis:'assigned only after the full gate suite and the mutation suite pass against these exact bytes and qaReceipt.stamped is true',status:'DECISION RECORD ISSUER — external QA/mutation suite must pass against these bytes before issue',backendFoundation:'READY TO BUILD',scienceDomainFreeze:'CANDIDATE',requirements:{crossHazard:'class-first everywhere; no index comparison inside or across a class',canonicalAsset:'declared AND emitted by assetsFromPortfolio',vulnerability:'declared; approved-only; no invented curves',templates:'15 generated from one contract; no BOM, no duplicate column',backendContracts:'endpoint override -> class default -> UNSET; no authoritative boilerplate',reports:'catalogue and routes expanded',openEvidenceFabric:'declared',geoLibre3D:'MapLibre/Cesium renderer contract added'}});

  function assetProfile(){var p=null,a=null;try{p=AGN.project&&AGN.project.state?AGN.project.state():null;a=AGN.project&&AGN.project.activeAsset?AGN.project.activeAsset():null;}catch(_){}var rd=AGN.assetSchema.readiness(a||{});return {asset:a||null,readiness:rd,automatic:[{name:'Coordinates',status:a&&(a.latitude!=null||a.geometry_id)?'available':'missing'},{name:'Terrain / elevation',status:'evidence service (Open Evidence Fabric)'},{name:'Catchment / river reach',status:'planned HydroSHEDS enrichment'},{name:'Historical water',status:'planned JRC enrichment'},{name:'Land cover',status:'planned WorldCover enrichment'},{name:'Population',status:'partial WorldPop/GHSL pathway'},{name:'Soil',status:'partial SoilGrids pathway'},{name:'Road/power dependencies',status:'planned OSM dependency graph'},{name:'Historical/current/future climate',status:'available where provider evidence resolves'}],clientRequired:(function(){var x=a||{},P=p||{},id=x.asset_id,has=function(v){return v!=null&&v!==''&&!(Array.isArray(v)&&!v.length);},rows=function(k){return (P[k]||[]).filter(function(r){return r&&r.asset_id===id;}).length>0;};var need=[]; if(!(has(x.limits)||rows('limits')))need.push('operating limits');if(!has(x.criticality))need.push('criticality');if(!(has(x.floor_elevation_m)&&has(x.drainage_condition)&&has(x.flood_protection)))need.push('floor/drainage/protection attributes');if(!(has(x.vulnerability_curve_id)||rows('vulnerability')))need.push('approved vulnerability/fragility');if(!has(x.recovery_time_hr))need.push('recovery time');if(!(has(x.dependencies)||rows('dependencies')||has(x.backup_power)))need.push('business dependencies');return need;})()};}
  AGN.assetEvidenceProfile={build:assetProfile};

  function esc(v){return String(v==null?'':v).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]});}
  function renderReadiness(){var ml=D.querySelector('[data-view="modelab"]');if(!ml||D.getElementById('agnProductReadiness'))return;var x=AGN.productReadiness,bi=AGN.backendInterfaces&&AGN.backendInterfaces.list?AGN.backendInterfaces.list():[],

    _unsetish=function(v){
      if(v==null) return true;
      var s=(typeof v==='object')?JSON.stringify(v):String(v);
      return !s.trim() || s.indexOf('UNSET')>=0;
    },
    metaOk=bi.filter(function(e){
      return [e.purpose,e.responseUnits,e.refreshCadence,e.providerFallback,e.evidenceProvenance]
             .every(function(v){ return !_unsetish(v); }); }).length,
    _gaps=(function(){ var g={}; bi.forEach(function(e){
        ['purpose','responseUnits','refreshCadence','providerFallback','evidenceProvenance']
          .forEach(function(k){ if(_unsetish(e[k])) g[k]=(g[k]||0)+1; }); }); return g; })(),
    _gapLine=Object.keys(_gaps).map(function(k){ return _gaps[k]+' '+k; }).join(', ');var el=D.createElement('section');el.id='agnProductReadiness';el.className='agn-v9116-panel';el.innerHTML='<div class="agn-v9116-kicker">INTERNAL · PRODUCT READINESS</div><div class="agn-v9116-score"><div><span>Master-specification maturity</span><b>'+(x.score==null?'not yet scored':x.score.toFixed(1)+'/10')+'</b><small>'+esc(x.score==null?x.scoreBasis:x.status)+'</small></div><div><span>Backend foundation</span><b>'+esc(x.backendFoundation)+'</b><small>Science/domain freeze remains candidate until external QA rerun</small></div><div><span>Professional templates</span><b>'+AGN.templateRegistry.count+'/15</b><small>CSV, XLSX and JSON Schema generated in the browser from one registry, each with a validated worked sample</small></div><div><span>Backend contracts</span><b>'+metaOk+'/'+bi.length+'</b><small>Purpose · units policy · cadence · fallback · provenance metadata'+(_gapLine?(' · still UNSET: '+_gapLine):'')+'</small></div></div><div class="agn-v9116-freeze"><b>Freeze candidate checklist</b><span>✓ Cross-hazard raw ranking removed from governed decision paths</span><span>✓ Canonical Asset schema</span><span>✓ Vulnerability/fragility contract</span><span>✓ 15 professional templates</span>'+(metaOk===bi.length?'<span>✓ Backend governance metadata</span>':'<span class="pending">PENDING: Backend governance metadata — '+(bi.length-metaOk)+' endpoint(s) still carry the UNSET sentinel</span>')+'<span>✓ Expanded report family</span><span>✓ Open Evidence Fabric contract</span><span class="pending">PENDING: the external gate and mutation suites must be rerun and stamped against THESE bytes. qaReceipt.stamped refers to the run recorded on the receipt, which is a different statement from this build having been stamped since its last edit.</span></div>';var g=D.getElementById('agnG50Panel');if(g)g.insertAdjacentElement('afterend',el);else{var h=ml.querySelector('.ml-hero');if(h)h.insertAdjacentElement('afterend',el);else ml.prepend(el);}}
  function renderContracts(){var host=D.getElementById('agnV9116Contracts');if(host)return;var v=D.querySelector('[data-view="assessments"]');if(!v)return;host=D.createElement('section');host.id='agnV9116Contracts';host.className='asmt-card agn-v9116-contracts';host.style.marginTop='16px';var opts=T.map(function(t){return '<option value="'+esc(t.id)+'">'+esc(t.label)+'</option>';}).join('');
    

    host.innerHTML='<div class="asmt-head"><div><div class="asmt-eyebrow">PROFESSIONAL DATA CONTRACTS · v91.16</div><h3>Canonical Asset, Vulnerability and '+T.length+' governed upload templates</h3><p class="asmt-sub">The seven-column portfolio remains a Quick Screening subset. The CSV, the XLSX workbook, the JSON Schema, the worked sample and the file check below are all generated from this one registry.</p></div><span class="asmt-pill">'+T.length+' schemas</span></div>'
      +'<div class="asmt-form"><div class="asmt-field"><label for="agnV9116Template">Template</label><select class="asmt-select" id="agnV9116Template">'+opts+'</select></div></div>'
      +'<div class="asmt-actions"><button class="asmt-btn" id="agnV9116Sample" type="button">Load sample</button><button class="asmt-btn" id="agnV9116Csv" type="button">Download CSV template</button><button class="asmt-btn" id="agnV9116Xlsx" type="button">Download XLSX template</button><button class="asmt-btn" id="agnV9116Schema" type="button">Download JSON Schema</button><label class="asmt-btn" for="agnV9116File" style="cursor:pointer">Check a filled file</label><input id="agnV9116File" type="file" accept=".csv,.json,text/csv,application/json" hidden></div>'
      +'<div id="agnV9116TemplateInfo" class="asmt-evidence" style="margin-top:10px"></div>'
      +'<div id="agnV9116SampleOut" class="asmt-evidence" style="margin-top:10px" hidden></div>';
    var shell=v.querySelector('.asmt-shell')||v; shell.appendChild(host);
    var sel=D.getElementById('agnV9116Template'),info=D.getElementById('agnV9116TemplateInfo'),out=D.getElementById('agnV9116SampleOut');
    function paint(){var t=AGN.templateRegistry.get(sel.value);if(!t)return;info.innerHTML='<h4>'+esc(t.label)+'</h4><p>'+esc(t.purpose)+'</p><p><b>'+t.columns.length+' columns</b> · required fields: '+esc(t.columns.filter(function(c){return c.required}).map(function(c){return c.name}).join(', '))+'</p>';out.hidden=true;out.innerHTML='';}
    function verdict(res,label){
      var h='<p><b>'+esc(label)+':</b> '+res.rows+' record'+(res.rows===1?'':'s')+' checked against '+esc(res.template)+' v'+esc(res.version||'')+' ('+res.columns+' columns, '+res.required+' required) — '
        +(res.ok?'<span data-agn-valid="yes">valid, 0 errors</span>':'<span data-agn-valid="no">'+res.errors.length+' error'+(res.errors.length===1?'':'s')+'</span>')+'.</p>';
      if(!res.ok) h+='<ul>'+res.errors.slice(0,12).map(function(e){return '<li>line '+e.line+(e.column?' · '+esc(e.column):'')+' '+esc(e.why)+'</li>';}).join('')+(res.errors.length>12?'<li>and '+(res.errors.length-12)+' more</li>':'')+'</ul>';
      if(res.importer){ var im=res.importer;
        h+='<p><b>'+esc(im.importer)+':</b> '+(im.rejected.length?('<span data-agn-import="no">'+im.accepted+' would be accepted, '+im.rejected.length+' refused — '+esc(im.rejected.slice(0,2).map(function(x){return 'line '+x.line+' '+x.why;}).join('; '))+'</span>'):('<span data-agn-import="yes">all '+im.accepted+' would be accepted</span>'))+'. Nothing is written until you import through that section.</p>'; }
      return h;
    }
    function table(t,rows){
      return '<div style="overflow-x:auto;max-width:100%"><table class="asmt-table" data-agn-sample-table="'+esc(t.id)+'"><thead><tr>'+t.columns.map(function(c){return '<th>'+esc(c.name)+(c.required?' *':'')+'</th>';}).join('')+'</tr></thead><tbody>'
        +rows.map(function(r){return '<tr>'+t.columns.map(function(c){var x=r[c.name];return '<td>'+esc(x==null?'':x)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
    }
    function loadSample(){
      var t=AGN.templateRegistry.get(sel.value); if(!t) return null;
      

      var prep=null;
      try{ var p=AGN.project&&AGN.project.state?AGN.project.state():null;
           if(p && !(p.assets||[]).length && AGN.intake && AGN.intake.ensureSampleAssets) prep=AGN.intake.ensureSampleAssets('DEMO-A3'); }catch(_){}
      var rows=AGN.templateRegistry.sample(t.id), res=AGN.templateRegistry.validate(t.id,rows);
      out.hidden=false;
      out.innerHTML='<h4>Sample · '+esc(t.label)+'</h4><p>The AJG Supplies sample: sites and values are invented, not AJG records. Its records join across all fifteen templates on asset_id (DEMO-A3 Karachi, DEMO-A10 Lahore: the sample client\u2019s own sites), the hazard ids flood and heat, and the geometry ids the sites and routes share'
        +(prep&&prep.did?'. '+esc(prep.did.replace(/,? then$/,''))+'':'')+'.</p>'+verdict(res,'Registry validator')+table(t,rows);
      return res;
    }
    function readFile(f){
      var rd=new FileReader(); rd.onload=function(){
        var t=AGN.templateRegistry.get(sel.value); if(!t) return; var txt=String(rd.result||''), rows=[];
        try{ if(/^\s*[\[{]/.test(txt)){ var j=JSON.parse(txt); rows=Array.isArray(j)?j:(Array.isArray(j.records)?j.records:[j]); } else rows=AGN.templateRegistry.parseCsv(txt); }
        catch(e){ out.hidden=false; out.innerHTML='<p>That file did not parse: '+esc(e&&e.message||e)+'</p>'; return; }
        var res=AGN.templateRegistry.validate(t.id,rows); out.hidden=false;
        out.innerHTML='<h4>'+esc(f.name)+' · '+esc(t.label)+'</h4>'+verdict(res,'Registry validator')+(rows.length?table(t,rows.slice(0,20)):'');
      }; rd.readAsText(f);
    }
    sel.addEventListener('change',paint);
    D.getElementById('agnV9116Sample').addEventListener('click',loadSample);
    D.getElementById('agnV9116Csv').addEventListener('click',function(){AGN.templateRegistry.downloadCsv(sel.value)});
    D.getElementById('agnV9116Xlsx').addEventListener('click',function(){AGN.templateRegistry.downloadXlsx(sel.value)});
    D.getElementById('agnV9116Schema').addEventListener('click',function(){AGN.templateRegistry.downloadSchema(sel.value)});
    var fin=D.getElementById('agnV9116File'); fin.addEventListener('change',function(){ var f=fin.files&&fin.files[0]; if(f) readFile(f); fin.value=''; });
    paint();}
  function renderSpatialEnhancement(){var s=D.getElementById('agnSpatialEvidence');if(!s||D.getElementById('agnAssetEvidenceProfile'))return; var box=D.createElement('article');box.id='agnAssetEvidenceProfile';box.className='asmt-card agn-op-only';box.style.marginTop='16px';box.innerHTML='<div class="asmt-head"><div><div class="asmt-eyebrow">OPEN EVIDENCE FABRIC · ASSET-CENTRIC ENRICHMENT</div><h3>Automatic Asset Evidence Profile</h3><p class="asmt-sub">Upload/select an asset, then assemble terrain, hydrology, water history, land cover, soil, population, infrastructure and climate evidence while keeping client-only operating information explicit.</p></div><span class="asmt-pill">Open Evidence Fabric (OEF) · '+OEF.length+' sources</span></div><div id="agnAssetEvidenceProfileBody"></div>';s.appendChild(box);function paint(){var p=assetProfile(),a=p.asset,b=D.getElementById('agnAssetEvidenceProfileBody');if(!b)return;b.innerHTML='<div class="agn-v9116-profile"><div><b>Active asset</b><span>'+esc(a?(a.name||a.asset_name||a.asset_id):'None selected')+'</span></div><div><b>Core readiness</b><span>'+p.readiness.core.percent+'% · missing '+esc(p.readiness.core.missing.join(', ')||'none')+'</span></div><div><b>Recommended readiness</b><span>'+p.readiness.recommended.percent+'% · missing '+esc(p.readiness.recommended.missing.join(', ')||'none')+'</span></div></div><div class="agn-v9116-oef">'+p.automatic.map(function(x){return '<span><b>'+esc(x.name)+'</b>'+esc(x.status)+'</span>';}).join('')+'</div>'+(p.clientRequired.length?'<div class="asmt-warning"><b>Client-only data still required:</b> '+esc(p.clientRequired.join(' · '))+'.</div>':'<div class="asmt-note"><b>Client-only data:</b> the asset record holds every item this profile asks for.</div>')+'';}paint();D.addEventListener('agn:project',paint);D.addEventListener('agn:active-asset',paint);}
  function init(){renderReadiness();renderContracts();renderSpatialEnhancement();}
  if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',function(){setTimeout(init,1200)});else setTimeout(init,1200);
})(window);
