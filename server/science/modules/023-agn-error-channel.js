


(function(){
  var LOG=[], MAX=200;
  function push(kind,msg,src){
    LOG.push({at:new Date().toISOString(),kind:kind,msg:String(msg).slice(0,300),src:src||''});
    if(LOG.length>MAX) LOG.shift();
    paint();
  }
  function paint(){
    var el=document.getElementById('agnErrChip');
    if(!el){
      var host=document.querySelector('.topbar')||document.body;
      el=document.createElement('button');
      el.id='agnErrChip'; el.type='button';
      el.style.cssText='margin-left:8px;font:inherit;font-size:0.75rem;font-weight:800;'
        +'letter-spacing:.04em;padding:3px 9px;border-radius:999px;cursor:pointer;'
        +'border:1px solid rgba(152,33,34,.35);background:rgba(152,33,34,.10);color:#982122';
      el.addEventListener('click',function(){
        var w=document.getElementById('agnErrPanel');
        if(w){ w.remove(); return; }
        w=document.createElement('div'); w.id='agnErrPanel';
        w.style.cssText='position:fixed;right:14px;bottom:14px;z-index:9999;max-width:520px;'
          +'max-height:46vh;overflow:auto;background:#fff;border:1px solid rgba(12,56,81,.18);'
          +'border-radius:12px;padding:12px 14px;box-shadow:0 12px 34px rgba(12,56,81,.18);'
          +'font-size:0.75rem;line-height:1.5;color:#3d4f57';
        w.innerHTML='<b style="color:#0C3851">Runtime issues ('+LOG.length+')</b><br>'
          +LOG.slice(-40).reverse().map(function(e){
            return '<div style="margin-top:7px;border-top:1px solid #eef3f4;padding-top:6px">'
              +'<code style="color:#982122">'+e.kind+'</code> '+e.at.slice(11,19)+'<br>'
              +e.msg.replace(/[<>&]/g,function(c){return {'<':'&lt;','>':'&gt;','&':'&amp;'}[c];})
              +(e.src?'<br><span style="color:#9aa8b0">'+e.src+'</span>':'')+'</div>';
          }).join('');
        document.body.appendChild(w);
      });
      host.appendChild(el);
    }
    el.textContent='\u26A0 '+LOG.length;
    el.title=LOG.length+' runtime issue'+(LOG.length===1?'':'s')+' — click for detail';
    el.hidden = LOG.length===0;
  }
  window.addEventListener('error',function(e){ push('error', e.message, (e.filename||'')+':'+(e.lineno||'')); });
  window.addEventListener('unhandledrejection',function(e){
    push('promise', (e.reason && e.reason.message) || e.reason || 'rejected'); });
  

  window.AGN=window.AGN||{}; AGN.err=push;
  document.addEventListener('DOMContentLoaded',paint);
})();
