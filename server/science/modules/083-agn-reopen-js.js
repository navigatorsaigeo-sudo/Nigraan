
(function(){
  

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function entries(){ try{ return (AGN.project.state().reports||[]).filter(function(r){ return r && r.document; }).slice().reverse(); }catch(_){ return []; } }
  function fill(){
    var sel=$('agnReopenSel'); if(!sel) return;
    var E=entries(), cur=sel.value;
     
    var pkt=function(iso){ try{ var d=new Date(Date.parse(iso)+5*3600e3); return isFinite(d)?d.toISOString().slice(0,16).replace('T',' ')+' PKT':'time not recorded'; }catch(_){ return 'time not recorded'; } };
    sel.innerHTML='<option value="">'+(E.length?'Generated documents in this project ('+E.length+')':'No stored documents yet')+'</option>'+E.map(function(r){
      return '<option value="'+esc(r.document_id)+'">'+esc(r.document_id)+' · '+esc(r.type||'')+' · '+esc(pkt(r.generated_at))+' · '+esc(r.output_class||'output class not recorded')+' · '+(r.issuable===true?'issued':'not for issue')+'</option>'; }).join('');
    if(cur) sel.value=cur;
  }
  function reopen(id){
    var r=entries().filter(function(x){ return x.document_id===id; })[0];
    var pv=$('asmtReportPreview'); if(!r||!pv) return null;
    var doc=JSON.parse(JSON.stringify(r.document));
    var ver=AGN.report.verify(doc), out=AGN.report.render(doc);
    var ok=ver&&ver.ok;
    pv.innerHTML='<div id="agnReopenBanner" data-verified="'+(ok?'1':'0')+'" style="margin:0 0 12px;padding:10px 12px;border:2px solid '+(ok?'#1b6e3a':'#B3261E')+';border-radius:6px;background:'+(ok?'#eaf6ee':'#fdecea')+';font:600 12px/1.5 system-ui,sans-serif">'
      +'<b>Re-opened from the register: '+esc(doc.id)+'</b> ('+esc(doc.type)+', frozen '+esc((function(){ try{ return new Date(Date.parse(doc.generated_at)+5*3600e3).toISOString().slice(0,16).replace('T',' ')+' PKT'; }catch(_){ return String(doc.generated_at||''); } })())+'). '
      +(ok?'Seal verified: the stored hash matches this document.':'Seal NOT verified: '+esc(ver&&ver.why))
      +' Nothing below was read from live data. <button type="button" id="agnReopenPrint" class="asmt-btn" style="margin-left:6px">Save as PDF / Print this document</button></div>'+out.html;
    var pb=$('agnReopenPrint'); if(pb) pb.addEventListener('click', function(){
      var css=[].slice.call(document.querySelectorAll('style')).map(function(s){ return s.textContent; }).filter(function(t){ return /\.rpt-/.test(t); }).join('\n');
      var w=window.open('','_blank'); if(!w) return;
      w.document.open(); w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+esc(doc.title||'NIGRAAN report')+' · '+esc(doc.id)+' (re-opened)</title><style>body{font-family:Manrope,Arial,sans-serif;color:#22333d;max-width:900px;margin:24px auto;padding:0 16px}'+css+'</style></head><body>'+pv.innerHTML.replace(/<button[^>]*agnReopenPrint[\s\S]*?<\/button>/,'')+'</body></html>'); w.document.close();
      setTimeout(function(){ try{ w.focus(); w.print(); }catch(_){} }, 500);
    });
    return { id:doc.id, verified:!!ok, hash:doc.document_hash, recomputed:ver&&ver.recomputed, pages:out.rendered.length };
  }
  function mount(n){
    var fz=$('asmtFreezeState');
    if(!fz) return n<80&&setTimeout(function(){ mount(n+1); },500);
    if($('agnReopenRow')) return;
    var row=document.createElement('div'); row.id='agnReopenRow';
    row.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0';
    row.innerHTML='<select id="agnReopenSel" class="asmt-select" style="flex:1;min-width:220px"></select><button type="button" id="agnReopenBtn" class="asmt-btn">Re-open issued document</button>';
    fz.parentNode.insertBefore(row, fz.nextSibling);
    fill();
    $('agnReopenBtn').addEventListener('click', function(){ var v=$('agnReopenSel').value; if(v) reopen(v); });
    $('agnReopenSel').addEventListener('focus', fill);
  }
  ['agn:project','agn:report'].forEach(function(ev){ document.addEventListener(ev, function(){ setTimeout(fill,300); }); });
  document.addEventListener('click', function(e){ if(e.target&&e.target.id==='asmtGenerateReport') setTimeout(fill,2500); }, true);
  window.AGN=window.AGN||{}; AGN.reportReopen={ reopen:reopen, entries:entries, fill:fill };
  mount(0);
})();
