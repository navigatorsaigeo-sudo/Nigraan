


(function(G){'use strict';
  var D=G.document, AGN=G.AGN=G.AGN||{};
  function $(i){ return D.getElementById(i); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function local(){ try{ return /^https?:$/.test(location.protocol); }catch(_){ return false; } }
  function project(){ try{ return AGN.project&&AGN.project.state?AGN.project.state():null; }catch(_){ return null; } }
  function activeAsset(){ try{ return AGN.project&&AGN.project.activeAsset?AGN.project.activeAsset():null; }catch(_){ return null; } }
  function pid(){ var p=project(); return p&&p.project_id?p.project_id:null; }
  var PROV={verified:'verified',client_supplied:'client-supplied',estimated:'estimated',missing:'missing'};
  var st={doc:null,busy:false,msg:''};
  function api(path,opt){ return fetch(path,Object.assign({cache:'no-store',headers:{'content-type':'application/json'}},opt||{})).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j&&j.why||('HTTP '+r.status)); return j; }); }); }
  

  var ONS={at:0,ids:null,p:null};
  function onServer(id,fresh){ if(!id||!local()) return Promise.resolve(false);
    if(!fresh&&ONS.ids&&Date.now()-ONS.at<30000) return Promise.resolve(ONS.ids.indexOf(id)>=0);
    if(!ONS.p) ONS.p=fetch('/api/case/project',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){ ONS.ids=((j&&j.projects)||[]).map(function(x){ return x.projectId; }); ONS.at=Date.now(); ONS.p=null; return ONS.ids; }).catch(function(){ ONS.p=null; ONS.ids=ONS.ids||[]; return ONS.ids; });
    return ONS.p.then(function(ids){ return ids.indexOf(id)>=0; }); }
  function stat(m,bad){ st.msg=m; var e=$('agnCaseStatus'); if(e){ e.textContent=m; e.style.color=bad?'#8a2626':''; } }
  async function sync(){
    if(!local()) return stat('No local server: the casebook needs RUN_NIGRAAN.bat.',true);
    var p=project(); if(!p||!AGN.project.document) return stat('No client project loaded.',true);
    try{ var doc=AGN.project.document(); var r=await api('/api/case/project',{method:'PUT',body:JSON.stringify(doc)}); ONS.ids=(ONS.ids||[]).concat([r.projectId||(p&&p.project_id)]); ONS.at=Date.now(); stat('Project '+r.projectId+' on the server: '+r.assets+' assets, saved '+r.savedAt.slice(0,16).replace('T',' ')+' UTC'+(r.replaced?' (replaced the earlier copy)':'')); await load(); }catch(e){ stat('Sync failed: '+e.message,true); }
  }
  async function load(){
    var a=activeAsset(), id=pid(); var box=$('agnCaseBody'); if(!box) return;
    if(!local()){ box.innerHTML='<p class="agn-case-note">The casebook lives on the local server (RUN_NIGRAAN.bat). Open NIGRAAN from it to use this panel.</p>'; return; }
    if(!id||!a){ box.innerHTML='<p class="agn-case-note"><span class="agn-op-only">Load a client project and choose the active asset; then press Sync to put the project on the server.</span><span class="agn-cust-only">Choose an asset in the client project to open its case document.</span></p>'; return; }
    if(!(await onServer(id))){ box.innerHTML='<p class="agn-case-note"><span class="agn-op-only">This project is not on the server yet — press Sync to put it there.</span><span class="agn-cust-only">Press “Open case document” to build the case document for '+esc(a.name||a.asset_id)+'.</span></p>'; return; }
    try{ st.doc=await api('/api/case/document?project='+encodeURIComponent(id)+'&asset='+encodeURIComponent(a.asset_id||a.name)); paint(); try{ D.dispatchEvent(new CustomEvent('agn:casebook',{detail:{project:id,asset:st.doc&&st.doc.asset&&st.doc.asset.id}})); }catch(_){} }
    catch(e){ box.innerHTML='<p class="agn-case-note">'+esc(e.message)+' — press Sync to put the current project on the server.</p>'; }
  }
  function row(layer,name,rec){ return '<tr><td>'+esc(name.replace(/_/g,' '))+'</td><td>'+(rec.value==null?'<i>—</i>':esc(typeof rec.value==='object'?JSON.stringify(rec.value):(typeof rec.value==='number'&&Math.abs(rec.value)>=10000&&!/year|latitude|longitude/.test(name)?rec.value.toLocaleString('en-US'):rec.value)))+'</td><td><span class="agn-prov agn-prov-'+esc(rec.provenance)+'">'+esc(PROV[rec.provenance]||rec.provenance)+'</span></td><td>'+esc(rec.source||'')+'</td><td><button type="button" class="asmt-btn agn-case-mini" data-field="'+esc(name)+'" data-layer="'+esc(layer)+'">set</button></td></tr>'; }
  function paint(){
    var d=st.doc, box=$('agnCaseBody'); if(!d||!box) return;
    var c=d.confidence, h=d.chain.hazard, iv=d.chain.response.interventions||[];
    var haz='';
    

    (d.riskCards||[]).forEach(function(k){ if(k.id==='assetRecord') return; haz+='<li><b>'+esc(k.hazard)+'</b>: '+(k.value==null?'not available — ':'')+esc(k.headline)+'</li>'; });
    if(!haz) haz='<li>'+esc(h.why||h.status||'no hazard source answered')+'</li>';
    var tables=['exposure','vulnerability','condition','consequence'].map(function(layer){ var L=d.chain[layer]; return '<details'+(layer==='condition'?' open':'')+'><summary>'+layer.charAt(0).toUpperCase()+layer.slice(1)+'</summary><table class="agn-case-table"><thead><tr><th>field</th><th>value</th><th>provenance</th><th>source</th><th></th></tr></thead><tbody>'+Object.keys(L).map(function(n){ return row(layer,n,L[n]); }).join('')+'</tbody></table></details>'; }).join('');
    var ivs=iv.length?'<table class="agn-case-table"><thead><tr><th>intervention</th><th>hazard</th><th>status</th><th>owner · due</th><th>risk before → after</th><th></th></tr></thead><tbody>'+iv.map(function(x){ return '<tr><td>'+esc(x.title)+'</td><td>'+esc(x.hazard||'')+'</td><td><select data-iv="'+esc(x.id)+'" class="agn-case-status">'+d.statuses.map(function(s){ return '<option value="'+s+'"'+(s===x.status?' selected':'')+'>'+s.replace('_',' ')+'</option>'; }).join('')+'</select></td><td>'+esc(x.owner||'')+(x.due?' · '+esc(x.due):'')+'</td><td>'+esc(x.riskBefore.class)+' → '+esc(x.riskAfter.class)+' <span class="agn-prov agn-prov-'+esc(x.riskAfter.provenance)+'">'+esc(PROV[x.riskAfter.provenance])+'</span></td><td><button type="button" class="asmt-btn agn-case-mini" data-del="'+esc(x.id)+'">remove</button></td></tr>'; }).join('')+'</tbody></table>':'<p class="agn-case-note">No intervention recorded for this asset.</p>';
    var mon=d.chain.monitoring;
    box.innerHTML='<div class="agn-case-grid">'
      +'<div><h4>Hazard <small>from the engines</small></h4><ul class="agn-case-list">'+haz+'</ul></div>'
      +'<div><h4>Confidence</h4><ul class="agn-case-list"><li>Observational coverage: '+esc(c.observationalCoverage)+'</li><li>Model agreement (rain, day 1): '+esc(c.modelAgreement)+'</li><li>Asset data: '+esc(c.assetDataQuality.verified)+' verified · '+esc(c.assetDataQuality.client_supplied)+' client-supplied · '+esc(c.assetDataQuality.estimated)+' estimated · '+esc(c.assetDataQuality.missing)+' missing ('+esc(c.assetCompleteness)+' % of the chain fields present)</li><li>Engineering information: '+esc(c.engineeringInformation)+'</li><li><b>Overall: '+esc(c.overall)+'</b> — '+esc(c.rule)+'</li></ul></div>'
      +'</div>'
      +'<h4>Exposure · vulnerability · condition · consequence <small>client record, provenance per field; "set" records a value with its class</small></h4>'+tables
      +'<h4>Response — the adaptation tracker</h4>'+ivs
      +'<div class="agn-case-add"><input id="agnIvTitle" placeholder="Intervention title" type="text"/><input id="agnIvHazard" placeholder="hazard (flood, heat, …)" type="text" class="agn-w12"/><input id="agnIvOwner" placeholder="owner" type="text" class="agn-w12"/><input id="agnIvDue" placeholder="due YYYY-MM-DD" type="text" class="agn-w14"/><select id="agnIvBefore">'+d.riskClasses.map(function(r){ return '<option value="'+r+'">before: '+r.replace('_',' ')+'</option>'; }).join('')+'</select><select id="agnIvAfter">'+d.riskClasses.map(function(r){ return '<option value="'+r+'">after: '+r.replace('_',' ')+'</option>'; }).join('')+'</select><button type="button" class="asmt-btn primary" id="agnIvAdd">Add intervention</button></div>'
      +'<h4>Monitoring</h4><p class="agn-case-note">'+esc(mon.snapshots)+' snapshot'+(mon.snapshots===1?'':'s')+(mon.lastSnapshot?', last '+esc(mon.lastSnapshot.slice(0,10)):'')+' · residual declared on '+esc(d.chain.residual.declared.length)+' completed intervention'+(d.chain.residual.declared.length===1?'':'s')+'. <button type="button" class="asmt-btn agn-case-mini" id="agnCaseSnap">Take snapshot</button> <button type="button" class="asmt-btn agn-case-mini" id="agnCaseHist">Show changes</button></p><div id="agnCaseHistBox"></div>';
    box.querySelectorAll('button[data-field]').forEach(function(b){ b.addEventListener('click',function(){ setField(b.dataset.layer,b.dataset.field); }); });
    box.querySelectorAll('button[data-del]').forEach(function(b){ b.addEventListener('click',function(){ delIv(b.dataset.del); }); });
    box.querySelectorAll('select.agn-case-status').forEach(function(s){ s.addEventListener('change',function(){ setStatus(s.dataset.iv,s.value); }); });
    var add=$('agnIvAdd'); if(add) add.addEventListener('click',addIv);
    var sn=$('agnCaseSnap'); if(sn) sn.addEventListener('click',snapshot);
    var hb=$('agnCaseHist'); if(hb) hb.addEventListener('click',history);
  }
  async function setField(layer,field){
    var d=st.doc; if(!d) return; var cur=d.chain[layer][field];
    var v=G.prompt('Value for '+field.replace(/_/g,' ')+' (leave empty to keep '+(cur.value==null?'missing':cur.value)+')', cur.value==null?'':String(cur.value)); if(v===null) return;
    var pr=G.prompt('Provenance: verified / client_supplied / estimated / missing', cur.provenance==='missing'?'client_supplied':cur.provenance); if(pr===null) return;
    var src=G.prompt('Source (document, inspection, who said it)', cur.source||''); if(src===null) return;
    try{ await api('/api/case/asset/fields',{method:'PUT',body:JSON.stringify({projectId:d.project.id,assetId:d.asset.id,fields:[{field:field,value:v===''?cur.value:(isFinite(Number(v))&&v.trim()!==''?Number(v):v),provenance:pr.trim(),source:src}]})}); stat('Recorded '+field+' as '+pr); await load(); }catch(e){ stat('Field not recorded: '+e.message,true); }
  }
  async function addIv(){
    var d=st.doc; if(!d) return; var title=($('agnIvTitle')||{}).value||''; if(!title.trim()) return stat('An intervention needs a title.',true);
    try{ await api('/api/case/interventions',{method:'POST',body:JSON.stringify({projectId:d.project.id,assetId:d.asset.id,title:title,hazard:($('agnIvHazard')||{}).value||null,owner:($('agnIvOwner')||{}).value||null,due:($('agnIvDue')||{}).value||null,status:'proposed',riskBefore:{class:($('agnIvBefore')||{}).value||'unknown',provenance:'client_supplied'},riskAfter:{class:($('agnIvAfter')||{}).value||'unknown',provenance:'estimated',basis:'declared with the proposal'}})}); stat('Intervention recorded.'); await load(); }catch(e){ stat('Not recorded: '+e.message,true); }
  }
  async function setStatus(id,status){ var d=st.doc; if(!d) return; try{ await api('/api/case/interventions',{method:'PUT',body:JSON.stringify({id:id,projectId:d.project.id,assetId:d.asset.id,status:status,title:(d.chain.response.interventions.find(function(x){ return x.id===id; })||{}).title})}); stat('Status set to '+status.replace('_',' ')+'.'); await load(); }catch(e){ stat('Status not set: '+e.message,true); } }
  async function delIv(id){ if(!G.confirm('Remove this intervention record?')) return; try{ await api('/api/case/interventions?id='+encodeURIComponent(id),{method:'DELETE'}); stat('Removed.'); await load(); }catch(e){ stat('Not removed: '+e.message,true); } }
  async function snapshot(){ var d=st.doc; if(!d) return; var label=G.prompt('Snapshot label (e.g. "annual 2026")','')||''; try{ await api('/api/case/snapshot',{method:'POST',body:JSON.stringify({projectId:d.project.id,assetId:d.asset.id,label:label})}); stat('Snapshot taken.'); await load(); }catch(e){ stat('Snapshot failed: '+e.message,true); } }
  async function history(){ var d=st.doc; if(!d) return; try{ var h=await api('/api/case/history?project='+encodeURIComponent(d.project.id)+'&asset='+encodeURIComponent(d.asset.id)); var box=$('agnCaseHistBox'); if(!box) return; box.innerHTML=h.snapshots.length?'<table class="agn-case-table"><thead><tr><th>snapshot</th><th>label</th><th>completeness</th><th>interventions</th><th>residual declared</th><th>overall</th></tr></thead><tbody>'+h.snapshots.map(function(s){ return '<tr><td>'+esc(s.at.slice(0,16).replace('T',' '))+'</td><td>'+esc(s.label||'')+'</td><td>'+esc(s.summary.completeness)+' %</td><td>'+esc(Object.keys(s.summary.interventions).filter(function(k){ return s.summary.interventions[k]; }).map(function(k){ return s.summary.interventions[k]+' '+k.replace('_',' '); }).join(', ')||'none')+'</td><td>'+esc(s.summary.residualDeclared)+'</td><td>'+esc(s.summary.overall)+'</td></tr>'; }).join('')+'</tbody></table>'+(h.changes.length?'<p class="agn-case-note">Changes: '+esc(h.changes.map(function(c){ return c.from.slice(0,10)+' → '+c.to.slice(0,10)+': '+Object.keys(c.changed).join(', '); }).join('; '))+'</p>':''):'<p class="agn-case-note">No snapshot yet.</p>'; }catch(e){ stat('History not read: '+e.message,true); } }
  function mount(){
    var host=$('agnProject'); if(!host||$('agnCasebook')) return;
    var sec=D.createElement('section'); sec.id='agnCasebook'; sec.className='agn-project agn-op-only'; sec.setAttribute('aria-label','Casebook');
    sec.innerHTML=''
      +'<div class="agn-project-head"><b>Casebook</b><span id="agnCaseStatus">one case document per asset — hazard from the engines, the client record with a provenance class on every field, the adaptation tracker, snapshots</span></div>'
      +'<div class="agn-project-actions"><button class="asmt-btn primary" id="agnCaseSync" type="button">Sync project to server</button><button class="asmt-btn" id="agnCaseReload" type="button">Reload case document</button></div>'
      +'<div id="agnCaseBody"><p class="agn-case-note">Choose an asset in the client project to open its case document.</p></div>';
    host.parentNode.insertBefore(sec, host.nextSibling);
    $('agnCaseSync').addEventListener('click',sync); $('agnCaseReload').addEventListener('click',load);
    

    ['agn:project','agn:active-asset'].forEach(function(n){ D.addEventListener(n,function(){ setTimeout(load,300); }); });
    setTimeout(load,2500);
  }
  AGN.casebook={sync:sync,load:load,document:function(){ return st.doc; },projectId:pid,onServer:onServer};    
  if(D.readyState==='loading') D.addEventListener('DOMContentLoaded',mount); else mount();
})(window);
