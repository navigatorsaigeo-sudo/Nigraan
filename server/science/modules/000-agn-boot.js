/* v91.17.283.17 · read before the body: (1) the view class on <html> (operator view only when asked for on this machine:
   ?operator=1, or remembered; the server still decides, agn-operator-js removes it when this machine is not an operator), so operator-only
   content is never painted and then hidden; (2) the place handed over by the start page (#agnplace=lat,lon,name) and, when it is the same
   place, the start page's place bundle (sessionStorage agn.handoff v2: GET /api/point's answer, checked against the bundle stamp of
   GET /api/pointstate/run by the page store before it is kept). The page opens at that place: the default place is not shown first. */
(function(W,D){ var R=D.documentElement, B=W.AGN_BOOT={place:null, handoff:null, booted:false};
  try{ var q=new URLSearchParams(W.location.search).get('operator'); var on=q==='1'||(q!=='0'&&W.localStorage.getItem('agn.operator.v2')==='1'); if(on) R.classList.add('agn-operator'); }catch(_){}
  try{ var m=/[#&]agnplace=(-?[0-9.]+),(-?[0-9.]+)(?:,([^&]*))?/.exec(W.location.hash||''); if(m){ var la=+m[1], lo=+m[2], nm=null; try{ nm=m[3]?decodeURIComponent(m[3]):null; }catch(_){ nm=null; }
      if(isFinite(la)&&isFinite(lo)&&la>=20&&la<=40&&lo>=55&&lo<=85) B.place={lat:la, lon:lo, name:nm&&nm.trim()?nm.trim().slice(0,80):null}; } }catch(_){}
  /* (3) the Overview is assembled by the page's scripts after the document is read (its info bar, map tools and day bar are put in place
     by agn-v91-journey, agn-v84 and agn-v242); the view is shown once they are in place (at most 4 s after the document is read), so it
     is drawn once in its final layout. The header and the tab row are drawn at once (their size is set by CSS). */
  R.classList.add('agn-boot');
  var ready=function(){ var v=D.querySelector('.view.active'); if(!v||v.getAttribute('data-view')!=='overview') return true;
    var pl=v.querySelector('.agn-v91-story-head #agnLive84 .agn-place span'); if(!pl||(B.place&&String(pl.textContent||'').trim()!==(B.place.name||'Selected point'))) return false;
    return !!(D.querySelector('#agn242Tools #alertBtn')&&D.getElementById('agnP2839Fit')&&D.getElementById('agn242Bar')); };
  D.addEventListener('DOMContentLoaded',function(){ var t0=Date.now(); (function f(){ if(ready()||Date.now()-t0>4000){ R.classList.remove('agn-boot'); try{ D.dispatchEvent(new CustomEvent('agn:shown',{detail:{ms:Math.round(performance.now())}})); }catch(_){} return; } setTimeout(f,30); })(); });
  try{ var h=JSON.parse(W.sessionStorage.getItem('agn.handoff')||'null'); W.sessionStorage.removeItem('agn.handoff');
    var k=function(a,b){ return (+a).toFixed(4)+','+(+b).toFixed(4); }, pp=h&&h.ps&&h.ps.place;
    if(B.place&&h&&h.v===2&&h.ps&&h.ps.ok&&h.stamp&&h.ps.stamp===h.stamp&&Date.now()-(+h.at||0)<15*60e3&&pp&&k(pp.lat,pp.lon)===k(B.place.lat,B.place.lon)){ B.handoff=h; if(pp.name) B.place.name=pp.name; } }catch(_){}
})(window,document);