


(function (G) {
  'use strict';
  var D = G.document, AGN = G.AGN = G.AGN || {};
  

  var SCHEMA = 3;
  var SUPPORTED = [1, 2, 3];        

  

  var BLOCKS = ['company', 'assets', 'engineering', 'limits'];
  

  function EVIDENCE_STORES() {
    try {
      if (AGN.decisionCase && AGN.decisionCase.stores)
        return AGN.decisionCase.stores().map(function (d) { return d.store; });
    } catch (_) {}
    return [];
  }
  function EVIDENCE_ONLY() {
    return EVIDENCE_STORES().filter(function (st) { return BLOCKS.indexOf(st) < 0; });
  }
  var BLOCK_WORDS = {
    company:'client identification', assets:'asset locations and values',
    engineering:'engineering design limits', limits:'operating thresholds'
  };

  var STATE = blank();
  function blank() {
    return { company:{ client_name:null, active_asset_id:null },
             assets:[], engineering:[], limits:[], project_id:null, created_at:null };
  }
  function blankWithEvidence() {
    var b = blank();
    

    EVIDENCE_ONLY().forEach(function (st) { b[st] = []; });
    

    b.reports = [];
    return b;
  }
  function $(id) { return D.getElementById(id); }
  function nowIso() { return new Date().toISOString(); }
  function present() {
    return BLOCKS.filter(function (b) {
      var v = STATE[b];
      if (Array.isArray(v)) return v.length > 0;
      return !!(v && Object.keys(v).some(function (k) { return v[k] != null && v[k] !== ''; }));
    });
  }

   
  function reset(reason) {
    try { window.localStorage.removeItem('agn.unsavedProjectId'); } catch (_) {}    
    STATE = blankWithEvidence();
    var cleared = [];
    try { AGN.sectionState.for('assessments').getState().portfolio = []; cleared.push('portfolio'); } catch (_) {}
    try { if (AGN.assets && AGN.assets.load) { AGN.assets.load([], 'project reset'); cleared.push('asset register'); } } catch (_) {}
    try { if (AGN.assets && AGN.assets.forget) { AGN.assets.forget(); cleared.push('browser asset store'); } } catch (_) {}
    

    try { AGN.reportFreeze.clear(reason||'project reset'); cleared.push('frozen report'); }
    catch (e) { cleared.push('frozen report NOT cleared: '+(e&&e.message)); }
    ['agnProjClient','agnProjActiveAsset'].forEach(function (id) {
      var el = $(id); if (el) el.value = '';
    });
    try { D.dispatchEvent(new CustomEvent('agn:project', { detail:{ reason:reason||'reset', cleared:cleared } })); } catch (_) {}
    paint();
    return { ok:true, cleared:cleared };
  }

   
  function readFields() {
    var c = $('agnProjClient'), act=$('agnProjActiveAsset');
    

    function _set(key, el, xform) {
      if (!el) return;                        
      var raw = (el.value == null) ? '' : String(el.value).trim();
      if (!raw) return;                       
      STATE.company[key] = xform ? xform(raw) : raw;
    }
    _set('client_name', c);
    _set('active_asset_id', act);
  }
  

  

  var CANONICAL_ASSET_FIELDS=['asset_id','asset_name','parent_company','business_unit',
    'asset_type','asset_subtype','country','province','district','address',
    'latitude','longitude','geometry_id','geometry_type','criticality',
    'maximum_tolerable_downtime_hr','operating_hours','construction_type','year_built',
    'floor_elevation_m','flood_protection','drainage_condition','roof_type','cooling_type',
    'backup_power','backup_duration_hr','data_owner','source','last_updated','confidence',
    'confidentiality_class'];
  function normaliseToCanonical(a){
    if(!a||typeof a!=='object') return a;
     
    var alias={ asset_name:'name', asset_subtype:'subtype', district:'unit' };
    for(var i=0;i<CANONICAL_ASSET_FIELDS.length;i++){
      var f=CANONICAL_ASSET_FIELDS[i];
      if(a[f]!==undefined && a[f]!==''){ continue; }
      var src=alias[f];
      a[f]=(src && a[src]!==undefined && a[src]!=='') ? a[src] : null;
    }
     
    if(a.criticality==='') a.criticality=null;
    a.schema='nigraan.asset'; a.schema_version='1.0.0';
    a.canonical_gaps=CANONICAL_ASSET_FIELDS.filter(function(f){ return a[f]==null; });
    return a;
  }
  try{ window.normaliseToCanonical=normaliseToCanonical;
       window.CANONICAL_ASSET_FIELDS=CANONICAL_ASSET_FIELDS; }catch(_){}
  function assetsFromPortfolio() {
    try {
      var pf = (AGN.sectionState.for('assessments').getState().portfolio || []).filter(function (r) { return !(r && r.duplicateOf != null); });    
      

      var _num=function(v){ return (v===null||v===undefined||v===''||!isFinite(Number(v)))
                                   ? null : Number(v); };
      return pf.map(function (row) {
        var nm=String(row.name||'asset-'+Date.now());
        var _lat=_num(row.latitude!=null?row.latitude:row.lat);
        var _lon=_num(row.longitude!=null?row.longitude:row.lon);
        return { asset_id:row.asset_id || ('asset-'+nm.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')),
                 name:row.name, location:row.location || row.unit || null,
                 unit:row.unit || row.location || null,
                 asset_type:row.asset_type,
                 industry:row.industry || null,
                 subtype:row.subtype || null,
                 latitude:_lat, longitude:_lon,
                 elevation_m:(row.elevation_m==null||row.elevation_m===''?null:Number(row.elevation_m)),    
                 

                 origin:(row.origin || (row.demo===true ? 'demo' : null)),
                 

                 origin_company:(row.origin_company || null),
                 demo:(row.demo===true) || (row.origin==='demo'),
                 limits:(Array.isArray(row.limits)&&row.limits.length?row.limits:null) };
      

      }).map(function (a, i) {
        try {
          var row = pf[i] || {}, prev = (STATE.assets || []).filter(function (x) { return x && x.asset_id === a.asset_id; })[0] || {};
          CANONICAL_ASSET_FIELDS.concat(['condition_class','last_inspection','defects_open','maintenance_status','recovery_time_hr','elevation_m','record_source']).forEach(function (f) {    
            if (a[f] !== undefined && a[f] !== null && a[f] !== '') return;
            var v = (row[f] !== undefined && row[f] !== null && row[f] !== '') ? row[f] : prev[f];
            if (v !== undefined && v !== null && v !== '') a[f] = v;
          });
        } catch (_) {}
        return a;
      }).map(normaliseToCanonical).filter(function (a) { return a.name; });
    } catch (_) { return null; }
  }
  

  function syncAssets() {
    var next = assetsFromPortfolio();
    if (next == null) return null;
    STATE.assets = next;
    

    if (!STATE.company.active_asset_id) {
      if (next.length === 1) {
        STATE.company.active_asset_id = next[0].asset_id || next[0].name;
        STATE.company.active_asset_basis = 'the only asset in this project';
      } else if (next.length > 1) {
        STATE.company.active_asset_basis = null;
      }
    } else if (!next.some(function (a) { return a.asset_id === STATE.company.active_asset_id; })) {
      

      STATE.company.active_asset_id = null;
      STATE.company.active_asset_basis = null;
    }
    

    if (!syncAssets.__inFlight) {
      syncAssets.__inFlight = true;
      try { D.dispatchEvent(new CustomEvent('agn:project', { detail:{ assets:next.length, source:'portfolio' } })); }
      catch (_) {}
      finally { syncAssets.__inFlight = false; }
    }
    

    try {
      if (AGN.assets && AGN.assets.load && AGN.assets.summary) {
        var _sm = AGN.assets.summary() || {};
        if (!_sm.assets || _sm.source === 'project assets') {
          var _rows = next.filter(function (a) { return a && Array.isArray(a.limits) && a.limits.length; })
            .map(function (a) { return { id:a.asset_id || a.name, name:a.name || a.asset_name, type:a.asset_type || null,
                                        lat:a.latitude, lon:a.longitude, unit:a.unit || a.location || null,
                                        limits:a.limits.map(function (L) { return {
                                          variable:L.variable, limit:(L.limit != null ? L.limit : L.threshold),
                                          dir:L.dir || L.operator, unit:L.unit, authority:L.authority || L.authority_type,
                                          reference:L.reference || L.authority_reference, actionMin:(L.actionMin != null ? L.actionMin : L.action_lead_minutes),
                                          action:L.action || L.required_action, owner:L.owner || L.owner_role }; }) }; });
          if (_rows.length) AGN.assets.load(_rows, 'project assets');
        }
      }
    } catch (_) {}
    return next.length;
  }

  function collect() {
    readFields();
    syncAssets();
    try {
      var reg = (AGN.assets && AGN.assets.register) ? AGN.assets.register() : [];
      STATE.limits = (reg || []).map(function (a) { return JSON.parse(JSON.stringify(a)); });
    } catch (_) {}
    return STATE;
  }

  function manifest() {
    return { project_schema_version:SCHEMA,
             nigraan_build_version:String(G.AGN_VERSION || ''),
             created_at:STATE.created_at || nowIso(),
             last_saved_at:nowIso(),
             project_id:STATE.project_id || ('proj-' + Date.now().toString(36)),
             client_name:STATE.company.client_name,
             data_categories_present:present(),
             

             evidence_stores:EVIDENCE_STORES(),
             evidence_counts:EVIDENCE_STORES().reduce(function (m, st) {
               m[st] = (Array.isArray(STATE[st]) ? STATE[st].length : 0); return m; }, {}) };
  }

  function document_() {
    collect();
    var man = manifest();
    STATE.project_id = man.project_id;
    STATE.created_at = man.created_at;
    var out = { manifest:man };             
    BLOCKS.forEach(function (b) { out[b] = STATE[b]; });
    

    out.evidence = {};
    EVIDENCE_STORES().forEach(function (st) {
      out.evidence[st] = Array.isArray(STATE[st]) ? STATE[st] : [];
    });
    

    out.reports = Array.isArray(STATE.reports) ? STATE.reports : [];
    return out;
  }

  function save() {
    var doc = document_(), text = JSON.stringify(doc, null, 2);
    var name = 'nigraan-project-' + (doc.manifest.client_name || 'unnamed')
      .replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() + '.json';
    try {
      var blob = new Blob([text], { type:'application/json' });
      var url = URL.createObjectURL(blob);
      var a = D.createElement('a'); a.href = url; a.download = name;
      D.body.appendChild(a); a.click(); D.body.removeChild(a);
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (_) {} }, 400);
    } catch (_) { return { ok:false, why:'the browser refused the download' }; }
    paint();
    try { D.dispatchEvent(new CustomEvent('agn:project', { detail:{ reason:'save', id:STATE.project_id } })); } catch (_) {}
    return { ok:true, bytes:text.length, categories:doc.manifest.data_categories_present };
  }

   
  function migrate(doc, from) {
    

    if (from === 1) {
      var v1=JSON.parse(JSON.stringify(doc));
      v1.company=Object.assign(blank().company, v1.company||{});
      v1.assets=(v1.assets||[]).map(function(a,i){
        if(!a.asset_id){ var nm=String(a.name||('asset-'+(i+1))); a.asset_id='asset-'+nm.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
        return a;
      });
      return v1;
    }
    return doc;
  }

  function load(text) {
    var doc;
    try { doc = (typeof text === 'string') ? JSON.parse(text) : text; }
    catch (e) { return { ok:false, why:'that file is not valid JSON, so nothing was read from it' }; }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      return { ok:false, why:'that file is not a NIGRAAN project document' };
    }
    var man = doc.manifest;
    if (!man || typeof man !== 'object') {
      return { ok:false, why:'that file carries no manifest, so this build cannot tell which '
                          + 'schema wrote it or what client data it holds. A project is not '
                          + 'parsed on a guess.' };
    }
    var ver = man.project_schema_version;
    if (typeof ver !== 'number' || !isFinite(ver)) {
      return { ok:false, why:'the manifest declares no schema version, so nothing was loaded' };
    }
    if (SUPPORTED.indexOf(ver) < 0) {
      return { ok:false, from:ver,
               why:'this project was written at schema version ' + ver + ', and this build '
                 + '(NIGRAAN ' + (G.AGN_VERSION || '') + ') reads versions '
                 + SUPPORTED.join(' and ') + '. Nothing was loaded, because reading part of a '
                 + 'client project is worse than reading none of it.' };
    }

    

    reset('loading ' + (man.project_id || 'a project'));
    var migrated = (ver !== SCHEMA);
    var body = migrated ? migrate(doc, ver) : doc;

    STATE.company = Object.assign(blank().company, body.company || {});
    BLOCKS.slice(1).forEach(function (b) {
      STATE[b] = Array.isArray(body[b]) ? body[b].slice() : [];
    });
    

    var _ev = (body && body.evidence && typeof body.evidence === 'object') ? body.evidence : null;
    EVIDENCE_STORES().forEach(function (st) {
      if (_ev && Array.isArray(_ev[st])) STATE[st] = _ev[st].slice();
      else if (BLOCKS.indexOf(st) >= 0) {   }
      else STATE[st] = [];
    });
    

    STATE.reports = (body && Array.isArray(body.reports)) ? body.reports.slice() : [];
    STATE.project_id = man.project_id || null;
    STATE.created_at = man.created_at || null;

    

    if (!STATE.company.active_asset_id) {
      var _usable = (STATE.assets||[]).filter(function (a) { return a && (a.asset_id || a.name); });
      if (_usable.length === 1) {
        STATE.company.active_asset_id = _usable[0].asset_id || _usable[0].name;
        STATE.company.active_asset_basis = 'the only asset in this project';
      } else if (_usable.length > 1) {
        STATE.company.active_asset_basis = null;    
      }
    }

    var c = $('agnProjClient');
    if (c) c.value = STATE.company.client_name || '';

    if (STATE.limits.length) {
      try { if (AGN.assets && AGN.assets.load) AGN.assets.load(STATE.limits, 'client project'); } catch (_) {}
    }
    try { D.dispatchEvent(new CustomEvent('agn:project', { detail:{ reason:'load', id:STATE.project_id } })); } catch (_) {}
    paint();
    return { ok:true, migrated:migrated, fromVersion:ver, toVersion:SCHEMA,
             assets:STATE.assets.length, client:STATE.company.client_name };
  }

   
  function paint() {
    var st = $('agnProjectState'), warn = $('agnProjectWarning');
    try {
      var _cmp = STATE.company || {}, _map = { agnProjClient:_cmp.client_name };
      Object.keys(_map).forEach(function (id) { var el = $(id), v = _map[id]; if (!el || v == null || v === '' || el === D.activeElement || String(el.value || '') !== '') return;
        if (el.tagName === 'SELECT') { if ([].some.call(el.options, function (o) { return o.value === String(v); })) el.value = String(v); } else el.value = String(v); });
    } catch (_) {}
    var cats = present();
    if (st) {
      st.textContent = STATE.company.client_name
        ? (STATE.company.client_name + ' · ' + STATE.assets.length + ' asset'
           + (STATE.assets.length === 1 ? '' : 's'))
        : 'No project loaded — this session holds nothing about a client.';
    }
    if (warn) {
      if (!cats.length) { warn.textContent = ''; return; }
      warn.textContent = 'A saved project file contains '
        + cats.map(function (b) { return BLOCK_WORDS[b]; }).join(', ')
        + '. It is written to your computer as an unencrypted local file and is not '
        + 'protected by this application once it leaves it.';
    }
  }

  function wire() {
    var b;
    if ((b = $('agnProjectSave'))) b.addEventListener('click', function () { save(); });
    if ((b = $('agnProjectClear'))) b.addEventListener('click', function () { reset('cleared by the user'); });
    ['agnProjClient','agnProjActiveAsset'].forEach(function (id) {
      var el = $(id); if (el) el.addEventListener('input', function () { readFields(); paint(); });
    });
    var f = $('agnProjectFile');
    if (f) f.addEventListener('change', function () {
      var file = f.files && f.files[0]; if (!file) return;
      var rd = new FileReader();
      rd.onload = function () {
        var res = load(String(rd.result || ''));
        var st = $('agnProjectState');
        if (!res.ok && st) st.textContent = res.why;
        f.value = '';
      };
      rd.readAsText(file);
    });
    D.addEventListener('agn:assets', function () { paint(); });
    D.addEventListener('agn:project', function () { setTimeout(paint, 0); });    
    paint();
  }

  AGN.project = { save:save, load:load, reset:reset, syncAssets:syncAssets,
                  state:function () { return STATE; },
                  activeAsset:function(){ var id=STATE.company.active_asset_id; return (STATE.assets||[]).find(function(a){return String(a.asset_id||'')===String(id||'');}) || null; },
                  setActiveAsset:function(id){ STATE.company.active_asset_id=id||null; var el=$('agnProjActiveAsset'); if(el) el.value=id||''; try{D.dispatchEvent(new CustomEvent('agn:active-asset',{detail:{asset_id:id||null}}));D.dispatchEvent(new CustomEvent('agn:project',{detail:{reason:'active-asset',id:STATE.project_id}}));}catch(_){} paint(); return STATE.company.active_asset_id; },
                  schemaVersion:function () { return SCHEMA; },
                  supported:function () { return SUPPORTED.slice(); },
                  document:document_ };

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', wire);
  else wire();
})(window);
