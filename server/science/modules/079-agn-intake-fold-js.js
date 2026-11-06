
(function(){
  

  var KEY='agn.intake.open.v1'; var open={}; try{ open=JSON.parse(sessionStorage.getItem(KEY)||'{}')||{}; }catch(_){}
  function empty(card){ var f=card.querySelectorAll('.asmt-form input,.asmt-form select,.asmt-form textarea'); if(!f.length) return false;
    for(var i=0;i<f.length;i++){ var e=f[i]; if(e.type==='checkbox'||e.type==='radio'){ if(e.checked!==e.defaultChecked) return false; continue; }
      if(e.tagName==='SELECT'){ if(e.selectedIndex>0) return false; continue; } if(String(e.value||'').trim()) return false; }
    return true; }
  function keyOf(card){ var h=card.querySelector('.asmt-head h3,.asmt-head h2,h3'); return (h?h.textContent.trim():'')||card.id||'card'; }
  function mark(card){ if(card.dataset.agnFold||card.hasAttribute('data-agn-nofold')) return; var head=card.querySelector(':scope>.asmt-head'), form=card.querySelector(':scope>.asmt-form'); if(!head||!form) return;
    card.dataset.agnFold='1'; var k=keyOf(card);
    var b=document.createElement('button'); b.type='button'; b.className='agn-intake-toggle';
    function paint(){ var on=card.classList.contains('agn-intake-fold'); b.textContent=on?'Open form':'Fold form'; b.setAttribute('aria-expanded',on?'false':'true'); }
    b.onclick=function(){ card.classList.toggle('agn-intake-fold'); open[k]=!card.classList.contains('agn-intake-fold'); try{ sessionStorage.setItem(KEY,JSON.stringify(open)); }catch(_){} paint(); };
    head.appendChild(b);
    if(open[k]!==true && empty(card)) card.classList.add('agn-intake-fold');
    card.addEventListener('input',function(){ if(card.classList.contains('agn-intake-fold')){ card.classList.remove('agn-intake-fold'); paint(); } },true);
    paint(); }
  function sweep(){ document.querySelectorAll('.asmt-card').forEach(mark); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(sweep,400); }); else setTimeout(sweep,400);
  document.addEventListener('click',function(e){ if(e.target&&e.target.closest&&e.target.closest('[data-goto]')) setTimeout(sweep,600); },true);
   
  (function(f){ setInterval(f,10000); document.addEventListener('agn:dom',f); })(function(){ document.querySelectorAll('.asmt-card.agn-intake-fold').forEach(function(c){ if(!empty(c)){ c.classList.remove('agn-intake-fold'); var b=c.querySelector('.agn-intake-toggle'); if(b){ b.textContent='Fold form'; b.setAttribute('aria-expanded','true'); } } }); });
})();
