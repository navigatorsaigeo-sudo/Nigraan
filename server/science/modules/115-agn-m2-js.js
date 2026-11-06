
(function(G){
  'use strict';
  /* v91.17.266 MAIN-2 · station status labels (interface 2), the past 30 days (interface 1) and one bounded wait for every
     "Loading…" line on the page. Nothing here invents a value: every number comes from a server answer. v91.17.268: the
     situation report is built on the report kit (agn-r268-js); the past-30 cache never reuses a failed answer (interface 3). */
  var D=document; G.AGN=G.AGN||{};
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function num(v){ return (v==null||v===''||!isFinite(Number(v)))?null:Number(v); }
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function pkt(iso){ var t=Date.parse(String(iso||'')); if(!isFinite(t)) return null; var d=new Date(t+5*3600e3);
    return d.getUTCDate()+' '+MON[d.getUTCMonth()]+' '+d.getUTCFullYear()+', '+('0'+d.getUTCHours()).slice(-2)+':'+('0'+d.getUTCMinutes()).slice(-2)+' PKT'; }

  /* ---------- 1 · station status (interface 2) ---------- */
  var ST={idx:null,at:0,busy:false};
  function stKey(x){ return String(x==null?'':x).trim().toLowerCase(); }
  function loadCheck(){ if(ST.busy||(ST.idx&&Date.now()-ST.at<5*60e3)) return; ST.busy=true;
    fetch('/api/fleet/check',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; }).then(function(j){ ST.busy=false; ST.at=Date.now();
      if(!j||!j.stations) return; var ix={}; j.stations.forEach(function(s){ [s.key,s.no!=null?'no:'+s.no:null,s.name].forEach(function(k){ if(k!=null&&k!=='') ix[stKey(k)]=s; }); });
      ST.idx=ix; ST.list=j.stations; try{ D.dispatchEvent(new CustomEvent('agn:station-status')); }catch(_){}
      /* v91.17.278.1 · FIX2781 · a station the server has not polled yet (just after a start) comes pending, with no status: nothing is
         shown for it, and the check is asked again in 30 s instead of 5 min */
      if(j.stations.some(function(s){ return s&&s.pending; })){ ST.at=Date.now()-5*60e3+30e3; setTimeout(loadCheck,30e3+500); } }); }
  function statusOf(r){ if(!r) return null; if(r.status) return r; if(!ST.idx) return null;
    return ST.idx[stKey(r.key)]||ST.idx[stKey(r.no!=null?'no:'+r.no:'')]||ST.idx[stKey(r.name)]||ST.idx[stKey(r.station)]||null; }
  function stLabel(r){ var s=statusOf(r); if(!s||!s.status) return null;
    var t=s.status==='checked'?'Checked':s.status==='not-yet-checked'?'Not yet checked':s.status==='site-problem'?'Site problem, not used'
      :s.status==='silent'?(s.silentSince&&pkt(s.silentSince)?'Silent since '+pkt(s.silentSince):'Silent, no reading received yet'):null;
    return t?{text:t,note:s.statusNote||'',status:s.status}:null; }
  function stHtml(r){ var L=stLabel(r); return L?'<span class="m2-st m2-st-'+esc(L.status)+'" title="'+esc(L.note)+'">'+esc(L.text)+'</span>':''; }
  G.AGN.stationStatus={ label:stLabel, html:stHtml, list:function(){ return ST.list||null; }, refresh:function(){ ST.at=0; loadCheck(); } };
  loadCheck(); setInterval(loadCheck,5*60e3);

  /* ---------- 2 · the past 30 days (interface 1) · v91.17.268 interface 3: an answer that failed is never reused (the next ask reads
     again); one read waits up to 45 s and is retried once; a report that needs it waits up to 15 s (wait) ---------- */
  var P30={};
  function p30Key(lat,lon){ return (+lat).toFixed(3)+','+(+lon).toFixed(3); }
  function p30Read(lat,lon,c,k,left){
    var ctl=('AbortController' in G)?new AbortController():null, t=setTimeout(function(){ try{ ctl&&ctl.abort(); }catch(_){} },45000);
    fetch('/api/report/past30?lat='+encodeURIComponent(+lat)+'&lon='+encodeURIComponent(+lon)+'&days=30',{cache:'no-store',signal:ctl?ctl.signal:undefined})
      .then(function(r){ return r.json().catch(function(){ return null; }); })
      .then(function(j){ return (j&&typeof j.ok==='boolean')?j:null; },function(){ return null; })
      .then(function(j){ clearTimeout(t);
        if(!j&&left>0) return setTimeout(function(){ p30Read(lat,lon,c,k,left-1); },1500);
        c.state=j?'ok':'failed'; c.j=j; c.at=Date.now();
        try{ D.dispatchEvent(new CustomEvent('agn:past30',{detail:{key:k,ok:!!j}})); }catch(_){} }); }
  function p30Get(lat,lon){ if(num(lat)==null||num(lon)==null) return null; var k=p30Key(lat,lon), c=P30[k];
    if(c&&(c.state==='loading'||(c.state==='ok'&&Date.now()-c.at<30*60e3))) return c;
    c=P30[k]={state:'loading',at:Date.now(),j:null}; p30Read(lat,lon,c,k,1); return c; }
  function p30Peek(lat,lon){ return (num(lat)==null||num(lon)==null)?null:(P30[p30Key(lat,lon)]||null); }
  function p30Wait(lat,lon,ms){ var c=p30Get(lat,lon); if(!c) return Promise.resolve(null); if(c.state!=='loading') return Promise.resolve(c);
    var k=p30Key(lat,lon); return new Promise(function(res){ var done=false, to=null;
      function end(){ if(done) return; done=true; clearTimeout(to); D.removeEventListener('agn:past30',on); res(P30[k]||null); }
      function on(e){ if(!e||!e.detail||e.detail.key===k) end(); }
      D.addEventListener('agn:past30',on); to=setTimeout(end,ms||15000); }); }
  G.AGN.past30={ get:p30Get, peek:p30Peek, wait:p30Wait };
  function dashPoint(){ try{ var s=G.AGN.subject.get(); if(s&&s.asset_lat!=null&&s.asset_lon!=null) return {lat:+s.asset_lat,lon:+s.asset_lon,name:s.asset_name}; }catch(_){}
    try{ var p=G.AGN.data.activePoint(); if(p&&p.lat!=null) return {lat:+p.lat,lon:+p.lon,name:p.name}; }catch(_){}
    try{ var q=G.AGN.subjectPoint?G.AGN.subjectPoint():null; if(q&&q.lat!=null) return q; }catch(_){} return null; }
  /* the past 30 days are read ahead where the situation report buttons are (Forecast, Operations), once per place */
  var WARMV={livedata:1,operations:1};
  function viewOn(){ var v=D.querySelector('.view.active'); return v?v.getAttribute('data-view'):null; }
  function warm(){ var p=dashPoint(); if(p) p30Get(p.lat,p.lon); }
  D.addEventListener('agn:view',function(e){ if(e&&e.detail&&WARMV[e.detail.view]) warm(); });
  D.addEventListener('agn:location',function(){ if(WARMV[viewOn()]) setTimeout(warm,600); });

  /* ---------- 4 · every "Loading…" line gets a bounded wait ---------- */
  var SEEN=(typeof Map==='function')?new Map():null, LOADRE=/^(loading|checking|retrieving|fetching|finding|reading)\b[^]{0,140}(\u2026|\.\.\.)$/i;
  function sweep(){ if(!SEEN) return; var now=Date.now(), root=D.querySelector('main')||D.body; if(!root) return;
    var tw=D.createTreeWalker(root,NodeFilter.SHOW_TEXT,null), n, hit=new Map();
    while((n=tw.nextNode())){ var t=(n.nodeValue||'').trim(); if(t.length<8||t.length>160||!LOADRE.test(t)) continue; var el=n.parentNode; if(!el||!el.closest||el.closest('script,style,option,select,svg,textarea')||!el.getClientRects().length) continue; hit.set(el,t); }    /* only what is on screen: a hidden pane's wait starts when it is shown */
    SEEN.forEach(function(v,el){ if(!hit.has(el)) SEEN.delete(el); });    /* an element that stopped saying "Loading…" starts a fresh wait next time */
    hit.forEach(function(t,el){ var s=SEEN.get(el); if(!s||s.t!==t){ SEEN.set(el,{t:t,at:now}); return; }
      if(now-s.at>60000){ el.setAttribute('data-m2-gaveup','1'); SEEN.delete(el);
        [].slice.call(el.childNodes).forEach(function(c){ if(c.nodeType===3&&(c.nodeValue||'').trim()===t) c.nodeValue=' Not available right now. '; }); } });
  }
  setInterval(sweep,5000);
})(window);
