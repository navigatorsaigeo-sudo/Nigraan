(function(G){'use strict';var D=G.document,AGN=G.AGN=G.AGN||{};function test(id,fn){try{var r=fn();
    

    if(r&&r.notApplicable===true) return{id:id,pass:false,notApplicable:true,
      detail:r.detail?r.detail:'not applicable in this state'};
    return{id:id,pass:r===true||r&&r.pass===true,detail:r&&r.detail?r.detail:(r===true?'pass':String(r&&r.detail||r||'failed'))}}catch(e){return{id:id,pass:false,detail:e.message}}}function run(){var T=[];T.push(test('release identity',function(){var meta=D.querySelector('meta[name="agn-release"]');var rel=D.documentElement.getAttribute('data-agn-release');return{pass:String(G.AGN_VERSION)===String(rel)&&meta&&meta.content.indexOf(rel+';')===0,detail:'runtime '+G.AGN_VERSION+' · '+(meta&&meta.content)}}));T.push(test('no operational nowcast',function(){return{pass:!D.querySelector('[data-view="operations"] #nowcastCard'),detail:'Temporal QA must live outside Operations'}}));T.push(test('no browser client save/restore UI',function(){return{pass:!D.getElementById('assetSave')&&!D.getElementById('assetRestore')&&AGN.assets&&typeof AGN.assets.forget==='function',detail:'project files only; legacy store deletable'}}));T.push(test('landslide ineligible is null',function(){if(!AGN.cascade||!AGN.cascade.landslide)return{pass:false,detail:'cascade engine absent'};var f=AGN.cascade.landslide('__g50',{rain:40,api:.6},{zone:'irrigated_plains',slope:2,slopeP95:4,emin:150,emax:220});return{pass:f&&f.ineligible===true&&f.score===null,detail:JSON.stringify({score:f&&f.score,ineligible:f&&f.ineligible})}}));T.push(test('no synthetic lead multiplier',function(){return{pass:typeof hzScore==='function'&&!/current_scaled|\.7,12:/.test(String(hzScore)),detail:'hzScore source has no lead multiplier'}}));T.push(test('AI future refusal',function(){return{pass:typeof aiStationRisk==='function'&&!/current_scaled/.test(String(aiStationRisk)),detail:'station AI has no current_scaled fallback'}}));T.push(test('global time context',function(){return{pass:AGN.timeContext&&AGN.timeSelection&&typeof AGN.timeSelection.set==='function',detail:'single declared horizon controller present'}}));

T.push(test('project schema version is declared and self-consistent',function(){var v=AGN.project&&AGN.project.schemaVersion&&AGN.project.schemaVersion();var doc=null;try{doc=AGN.project.toDocument?AGN.project.toDocument():null;}catch(_){}var dv=doc&&(doc.schema_version!=null?doc.schema_version:doc.schemaVersion);return{pass:Number.isInteger(v)&&v>0&&(dv==null||Number(dv)===Number(v)),detail:'runtime schema '+v+(dv!=null?(' · serialized '+dv):' · serializer not queried')}}));T.push(test('canonical active asset',function(){return{pass:AGN.project&&typeof AGN.project.activeAsset==='function'&&typeof AGN.project.setActiveAsset==='function',detail:'one active_asset_id API shared across client workspaces'}}));T.push(test('industry mapping',function(){var p=AGN.project&&AGN.project.state?AGN.project.state():null,a=(p&&p.assets)||[];
    

    if(!a.length) return{notApplicable:true,detail:'no assets in the open project, so there is no mapping to verify'};
    var allowed=['industrial','hospital','telecom','energy','transport','bank','agriculture','water','commercial'];var bad=a.filter(function(x){var r=AGN.industryRegistry&&AGN.industryRegistry.resolve(x);return!r||allowed.indexOf(r.broad_mapping)<0});return{pass:bad.length===0,detail:bad.length?bad.length+' asset(s) unmapped':a.length+' project asset(s) explicitly mapped'}}));T.push(test('client asset legend',function(){var shown=AGN.overviewAssets&&AGN.overviewAssets.shown&&AGN.overviewAssets.shown();
    

    if(!shown) return{notApplicable:true,detail:'the asset overlay is not active, so there is no map key to verify'};
    return{pass:!!D.getElementById('agnAssetLegendRow'),detail:'shown assets have a map key'}}));T.push(test('no financial or ESG surface',function(){return{pass:!AGN.financialScenario&&!AGN.sustainabilityIntake&&!D.getElementById('agnFinRatioSource')&&!D.getElementById('agnSusRegime'),detail:'financial and ESG content left NIGRAAN in v91.17.266'}}));T.push(test('deployment manifest identity',function(){var src='';try{src=String(AGN.deploymentReadiness&&AGN.deploymentReadiness.handoverManifest||'')}catch(_){}return{pass:htmlIdentity()&&D.documentElement.innerHTML.indexOf('AGN-NIGRAAN-v'+'78-11')<0,detail:'handover artifact identity derives from canonical release'}}));

  var ran=T.filter(function(x){return !x.notApplicable});
  var na=T.length-ran.length;
  var pass=ran.length>0&&ran.every(function(x){return x.pass});
  return{pass:pass,tests:T,passed:ran.filter(function(x){return x.pass}).length,
         total:ran.length,applicable:ran.length,notApplicable:na,declared:T.length,
         run_at:new Date().toISOString()};function htmlIdentity(){return String(D.documentElement.getAttribute('data-agn-release'))===String(G.AGN_VERSION)}}function paint(){ try{if(!(G.AGN&&G.AGN.operator&&G.AGN.operator())){var _h0=D.getElementById('agnG50Panel');if(_h0)_h0.style.display='none';return;}}catch(_){return;}var r=run(),host=D.getElementById('agnG50Panel');if(host)host.style.display='';if(!host){var ml=D.querySelector('[data-view="modelab"]');if(!ml)return r;host=D.createElement('section');host.id='agnG50Panel';host.className='agn-g50';var hero=ml.querySelector('.ml-hero');if(hero)hero.insertAdjacentElement('afterend',host);else ml.insertBefore(host,ml.firstChild)}var _qa=(G.AGN&&G.AGN.qaReceipt)||null;
    var _qaLine=_qa&&_qa.stamped
      ? 'External suite '+String(_qa.suite_version)+' \u00b7 '+String(_qa.gates)+' gates \u00b7 '
        +String(_qa.checks)+' checks \u00b7 '+String(_qa.mutations)+' mutations \u00b7 build '
        +String(_qa.identity_sha256).slice(0,12)
      : 'No external QA run is bound to this build.';
    host.innerHTML='<div class="agn-g50-head"><div><b>G50 · Final release qualification</b><div>'+(r.pass?('All executable acceptance gates pass in this session.'+((r.notApplicable||0)?(' '+r.notApplicable+' gate(s) had no subject here and were not run \u2014 '+'they are marked N/A below and are not counted in the ratio.'):'')):'Release blocked: one or more acceptance gates fail.')+'</div><div class="agn-g50-qa">'+_qaLine.replace(/</g,'&lt;')+'</div></div><span class="'+(r.pass?'agn-g50-pass':'agn-g50-fail')+'">'+r.passed+'/'+r.total+' PASS'+((r.notApplicable||0)?(' \u00b7 '+r.notApplicable+' N/A'):'')+'</span></div><div class="agn-g50-list">'

+r.tests.map(function(t){
    var na = (t.notApplicable===true);
    var cls = na ? 'agn-g50-na' : (t.pass?'agn-g50-pass':'agn-g50-fail');
    var word = na ? 'N/A' : (t.pass?'PASS':'FAIL');
    return '<div class="agn-g50-row"><span class="'+cls+'">'+word+'</span><span><b>'+t.id
         +'</b> · '+String(t.detail).replace(/</g,'&lt;')
         +(na?' <i style="font-style:normal;opacity:.75">\u2014 this gate has no subject in '
              +'this session, so it was not run and is not counted in the ratio</i>':'')
         +'</span></div>'}).join('')+'</div>';return r}AGN.G50={run:run,paint:paint};if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',function(){setTimeout(paint,900)});else setTimeout(paint,900);})(window);