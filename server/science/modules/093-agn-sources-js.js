
(function(){
  

  var D=document, BASE=location.origin, LAST=null;
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function get(p){ return fetch(BASE+p,{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; }); }
  function load(){ return get('/api/sources').then(function(j){ return (j&&j.entries)?j:get('/api/v1/sources'); }).then(function(j){ if(j&&j.entries){ LAST=j; window.AGN_SOURCES=j; window.AGN_INTERNAL_REF=!!j.internalRef; } return LAST; }); }
  function link(u,t){ return u?'<a href="'+esc(u)+'" target="_blank" rel="noopener">'+esc(t||u)+'</a>':esc(t||''); }
  function nav(){
    var nv=D.getElementById('machNav'); if(!nv||nv.querySelector('[data-goto="sources"]')) return;
    var b=D.createElement('button'); b.setAttribute('role','tab'); b.setAttribute('aria-selected','false'); b.dataset.goto='sources'; b.title='Sources and licences: the data behind every NIGRAAN value';
    b.innerHTML='<svg class="ic" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg><span class="nav-label">Sources</span>';
    nv.appendChild(b);
  }
  function view(){
    if(D.querySelector('.view[data-view="sources"]')) return true;
    var anchor=D.querySelector('.view[data-view="observations"]')||D.querySelector('.view[data-view="operations"]'); if(!anchor) return false;
    var v=D.createElement('div'); v.className='view'; v.dataset.view='sources'; v.id='agnSourcesView';
    v.innerHTML='<div class="agn-src-head"><h2>Sources and licences</h2><p id="agnSrcStatement">NIGRAAN values are built from AGN\u2019s own MACH weather stations and from openly licensed datasets.</p></div><div class="agn-src-wrap"><table class="agn-src-table" id="agnSrcTable"><thead><tr><th>Dataset</th><th>Provider</th><th>Licence</th><th>Attribution</th><th>Used for</th></tr></thead><tbody><tr><td colspan="5">Loading\u2026</td></tr></tbody></table></div>';
    anchor.parentNode.insertBefore(v, anchor.nextSibling); return true;
  }
  function render(j){
    var tb=D.querySelector('#agnSrcTable tbody'); if(!tb||!j) return;
    var st=D.getElementById('agnSrcStatement'); if(st&&j.statement) st.textContent=j.statement;
    tb.innerHTML=(j.entries||[]).map(function(e){ return '<tr'+(e.internalOnly?' class="int"':'')+' data-source="'+esc(e.id)+'"><td><b>'+link(e.url,e.dataset)+'</b>'+(e.internalOnly?'<div class="u">internal reference, not used in customer outputs</div>':'')+'</td><td>'+esc(e.provider||'')+'</td><td>'+link(e.licenceUrl,e.licence||'')+'</td><td class="a">'+esc(e.attribution||'')+'</td><td class="u">'+esc(String(e.use||'').replace(/\s*\([\w.-]+\.py\)/g,'').replace(/\s*\((?:data|server|scripts)\/[^)]*\)/g,'').replace(/\s*\b(?:data|server|scripts)\/[\w.\/-]+/g,'').replace(/\s*\(v\d+\)/g,'').replace(/\bthe v\d+ /g,'the '))+'</td></tr>'; }).join('')||'<tr><td colspan="5">No licence headers were found on this server.</td></tr>';
  }
  function show(){ load().then(render); }
  function boot(){ nav(); if(view()){ if(LAST) render(LAST); } D.addEventListener('agn:view',function(e){ if(e.detail&&e.detail.view==='sources') show(); }); }
  load();
  if(D.readyState==='loading') D.addEventListener('DOMContentLoaded',function(){ setTimeout(boot,900); }); else setTimeout(boot,900);
  setTimeout(function(){ nav(); view(); if(LAST) render(LAST); },3500);
  window.AGN=window.AGN||{}; window.AGN.sources={ load:load, render:render, last:function(){ return LAST; } };
})();
