(function (global) {
  'use strict';
  const AGN=global.AGN=global.AGN||{};
  const registry=new Map();
  const stats=new Map();
  const aliases=new Map();
  function now(){return Date.now();}
  function iso(value){if(value==null||value==='')return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d.toISOString();}
  function num(value){if(value==null||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
  function str(value){return value==null?null:String(value).trim()||null;}
  function arr(value){return Array.isArray(value)?value.slice():[];}
  function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
  function clone(value){if(value==null)return value;if(typeof structuredClone==='function'){try{return structuredClone(value);}catch(_){}}try{return JSON.parse(JSON.stringify(value));}catch(_){return value;}}
  function resolve(name){return aliases.get(name)||name;}
  function issue(path,code,message,severity){return {path:path||'',code,message,severity:severity||'error'};}
  function define(name,version,definition){
    const key=name+'@'+version;if(registry.has(key))throw new Error('Contract already defined: '+key);
    const record=Object.freeze({name,version,key,description:definition.description||'',normalize:definition.normalize||clone,validate:definition.validate||function(){return[];},examples:arr(definition.examples)});
    registry.set(key,record);aliases.set(name,key);stats.set(key,{calls:0,valid:0,invalid:0,warnings:0,lastAt:null,lastContext:null,lastIssues:[]});return record;
  }
  function get(name){return registry.get(resolve(name))||null;}
  function observe(name,value,context){
    const c=get(name);if(!c)throw new Error('Unknown data contract: '+name);
    const s=stats.get(c.key);s.calls+=1;s.lastAt=now();s.lastContext=clone(context||null);
    let normalized,issues=[];
    try{normalized=c.normalize(clone(value),context||{});issues=arr(c.validate(normalized,context||{}));}
    catch(error){normalized=clone(value);issues=[issue('', 'normalization_error', String(error&&error.message||error))];}
    const errors=issues.filter(x=>x.severity!=='warning'),warnings=issues.filter(x=>x.severity==='warning');
    if(errors.length)s.invalid+=1;else s.valid+=1;s.warnings+=warnings.length;s.lastIssues=clone(issues);
    if(issues.length&&AGN.events)AGN.events.emit('contract:issues',{contract:c.key,issues:clone(issues),context:clone(context||null),at:s.lastAt});
    return {ok:errors.length===0,contract:c.name,version:c.version,key:c.key,value:normalized,issues,errors,warnings};
  }
  function normalize(name,value,context){return observe(name,value,context).value;}
  function validate(name,value,context){const r=observe(name,value,context);return {ok:r.ok,contract:r.key,issues:r.issues};}
  function assert(name,value,context){const r=observe(name,value,context);if(!r.ok){const e=new Error('Contract '+r.key+' failed: '+r.errors.map(x=>x.path+': '+x.message).join('; '));e.contract=r.key;e.issues=r.issues;throw e;}return r.value;}
  function envelope(name,data,meta){const c=get(name);if(!c)throw new Error('Unknown data contract: '+name);const r=observe(name,data,meta);return {schema:c.name,version:c.version,valid:r.ok,generatedAt:new Date().toISOString(),meta:clone(meta||{}),issues:r.issues,data:r.value};}
  function diagnostics(name){
    if(name){const c=get(name);if(!c)return null;const s=stats.get(c.key);return Object.assign({name:c.name,version:c.version,key:c.key,description:c.description},clone(s));}
    const contracts={};registry.forEach(c=>{contracts[c.key]=diagnostics(c.key);});return {registered:registry.size,aliases:Object.fromEntries(aliases),contracts};
  }
  AGN.contracts={define,get,observe,normalize,validate,assert,envelope,diagnostics,snapshot:function(){return clone(diagnostics());},names:function(){return Array.from(registry.values()).map(x=>x.name);},keys:function(){return Array.from(registry.keys());},version:function(name){const c=get(name);return c&&c.version;}};

  define('station','1.0.0',{
    description:'Named point location with optional live meteorological attributes and source metadata.',
    normalize:function(v){v=object(v);const out=Object.assign({},v);out.id=str(v.id||v.key||v.code||v.name);out.name=str(v.name||v.label||v.id);out.lat=num(v.lat!=null?v.lat:v.latitude);out.lon=num(v.lon!=null?v.lon:v.longitude);out.tehsil=str(v.tehsil);out.district=str(v.district);out.province=str(v.province);out.validTime=iso(v.validTime||v.valid_at||v.time);out.retrievedAt=iso(v.retrievedAt||v.retrieved_at);out.source=str(v.source||v.provider);out.contractVersion='station@1.0.0';return out;},
    validate:function(v){const x=[];if(!v.id&&!v.name)x.push(issue('id','required','Station requires an id or name.'));if(v.lat!=null&&(v.lat < -90||v.lat>90))x.push(issue('lat','range','Latitude must be between -90 and 90.'));if(v.lon!=null&&(v.lon < -180||v.lon>180))x.push(issue('lon','range','Longitude must be between -180 and 180.'));if((v.lat==null)!=(v.lon==null))x.push(issue('coordinates','pair','Latitude and longitude must be supplied together.'));if(!v.validTime)x.push(issue('validTime','missing','Valid time is not supplied.','warning'));return x;}
  });
  define('tehsil','1.0.0',{
    description:'Canonical tehsil identity plus parent hierarchy and its current input payload.',
    normalize:function(v){v=object(v);const input=object(v.input||v.data);return Object.assign({},v,{key:str(v.key||v.tehsil||v.name),name:str(v.name||v.tehsil||v.key),district:str(v.district),province:str(v.province),input:input,validTime:iso(v.validTime||input.validTime||input.updatedAt),contractVersion:'tehsil@1.0.0'});},
    validate:function(v){const x=[];if(!v.key)x.push(issue('key','required','Tehsil key is required.'));if(!v.district)x.push(issue('district','missing','Parent district is not supplied.','warning'));if(!v.province)x.push(issue('province','missing','Province is not supplied.','warning'));if(!v.input||typeof v.input!=='object')x.push(issue('input','type','Input payload must be an object.'));return x;}
  });
  define('district','1.0.0',{
    description:'District roll-up with member tehsils, driving tehsil, score and spatial coverage.',
    normalize:function(v){v=object(v);const members=arr(v.memberTehsils||v.tehsils);return Object.assign({},v,{key:str(v.key||v.district||v.name),name:str(v.name||v.district||v.key),province:str(v.province),memberTehsils:members.map(String),drivingTehsil:str(v.drivingTehsil||v.topTehsil||v.driver),score:num(v.score),coverage:num(v.coverage),validTime:iso(v.validTime),contractVersion:'district@1.0.0'});},
    validate:function(v){const x=[];if(!v.key)x.push(issue('key','required','District key is required.'));if(!v.memberTehsils.length)x.push(issue('memberTehsils','empty','District has no member tehsils.','warning'));if(v.coverage!=null&&(v.coverage<0||v.coverage>100))x.push(issue('coverage','range','Coverage must be between 0 and 100.'));if(v.score!=null&&(v.score<0||v.score>100))x.push(issue('score','range','Score must be between 0 and 100.'));return x;}
  });
  define('forecast','1.0.0',{
    description:'Versioned point or administrative forecast with provider, valid times and daily or hourly values.',
    normalize:function(v){v=object(v);return Object.assign({},v,{unitKey:str(v.unitKey||v.key||v.location),unitType:str(v.unitType||v.scope||'point'),provider:str(v.provider||v.source),providerRun:iso(v.providerRun||v.runTime),retrievedAt:iso(v.retrievedAt),validTime:iso(v.validTime),days:arr(v.days),hourly:object(v.hourly),coverage:num(v.coverage),contractVersion:'forecast@1.0.0'});},
    validate:function(v){const x=[];if(!v.unitKey)x.push(issue('unitKey','required','Forecast unit key is required.'));if(!v.provider)x.push(issue('provider','missing','Provider is not supplied.','warning'));if(!v.days.length&&!Object.keys(v.hourly).length)x.push(issue('values','empty','Forecast has neither daily nor hourly values.'));if(v.coverage!=null&&(v.coverage<0||v.coverage>100))x.push(issue('coverage','range','Coverage must be between 0 and 100.'));return x;}
  });
  define('hazardResult','1.0.0',{
    description:'Hazard screening result with explicit unit, status, coverage, valid time and formula version.',
    normalize:function(v){v=object(v);let score=num(v.score);const status=str(v.status)||(score==null?'unavailable':'available');return Object.assign({},v,{hazard:str(v.hazard||v.key),unitKey:str(v.unitKey||v.unit||v.name||v.district||v.tehsil),unitType:str(v.unitType||v.scope||'tehsil'),score:score,status:status,coverage:num(v.coverage),validTime:iso(v.validTime),formulaVersion:str(v.formulaVersion||v.engineVersion),driver:str(v.driver||v.drivingTehsil||v.dominantDriver),contractVersion:'hazardResult@1.0.0'});},
    validate:function(v){const x=[];if(!v.hazard)x.push(issue('hazard','required','Hazard key is required.'));if(!v.unitKey)x.push(issue('unitKey','required','Result unit key is required.'));if(v.score!=null&&(v.score<0||v.score>100))x.push(issue('score','range','Hazard score must be between 0 and 100.'));if(v.status==='available'&&v.score==null)x.push(issue('score','missing','Available result requires a score.'));if(v.coverage!=null&&(v.coverage<0||v.coverage>100))x.push(issue('coverage','range','Coverage must be between 0 and 100.'));if(!v.validTime)x.push(issue('validTime','missing','Result valid time is not supplied.','warning'));if(!v.formulaVersion)x.push(issue('formulaVersion','missing','Formula version is not supplied.','warning'));return x;}
  });
  define('evidence','1.0.0',{
    description:'Frozen calculation evidence record for audit, export and backend persistence.',
    normalize:function(v){v=object(v);return Object.assign({},v,{calculationId:str(v.calculationId||v.calculation_id||v.id),calculatedAt:iso(v.calculatedAt||v.calculated_at||v.createdAt),validTime:iso(v.validTime||v.valid_for),buildVersion:str(v.buildVersion||v.build&&v.build.version||global.AGN_BUILD&&global.AGN_BUILD.version||AGN.version),formulaVersion:str(v.formulaVersion||v.formula_version),inputCoverage:num(v.inputCoverage!=null?v.inputCoverage:(v.input_coverage&&v.input_coverage.fraction!=null?v.input_coverage.fraction*100:v.coverage)),inputs:object(v.inputs),sources:arr(v.sources),results:arr(v.results),contractVersion:'evidence@1.0.0'});},
    validate:function(v){const x=[];if(!v.calculationId)x.push(issue('calculationId','required','Calculation id is required.'));if(!v.calculatedAt)x.push(issue('calculatedAt','required','Calculation timestamp is required.'));if(!v.validTime)x.push(issue('validTime','required','Evidence valid time is required.'));if(!v.buildVersion)x.push(issue('buildVersion','required','Build version is required.'));if(!Object.keys(v.inputs).length)x.push(issue('inputs','empty','Evidence inputs are empty.','warning'));if(v.inputCoverage!=null&&(v.inputCoverage<0||v.inputCoverage>100))x.push(issue('inputCoverage','range','Input coverage must be between 0 and 100.'));return x;}
  });
  define('apiPayload','1.0.0',{
    description:'Versioned API request or response envelope with schema, request id, timestamps, data and errors.',
    normalize:function(v){v=object(v);return Object.assign({},v,{schema:str(v.schema||v.contract||'unspecified'),version:str(v.version||'1.0.0'),requestId:str(v.requestId||v.id),generatedAt:iso(v.generatedAt||v.retrievedAt||new Date().toISOString()),data:v.data===undefined?null:v.data,errors:arr(v.errors),meta:object(v.meta),contractVersion:'apiPayload@1.0.0'});},
    validate:function(v){const x=[];if(!v.schema)x.push(issue('schema','required','Payload schema is required.'));if(!v.generatedAt)x.push(issue('generatedAt','required','Payload generation time is required.'));if(v.errors.some(e=>typeof e!=='object'&&typeof e!=='string'))x.push(issue('errors','type','Errors must contain strings or objects.'));return x;}
  });
  AGN.architecture=Object.assign({},AGN.architecture,{contracts:'versioned runtime schemas with non-destructive normalisation and boundary diagnostics'});
})(window);