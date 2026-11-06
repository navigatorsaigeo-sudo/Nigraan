
(function(){
  'use strict';
  var G=window;
  function isOp(){ try{ return !!(G.AGN && typeof G.AGN.operator==='function' && G.AGN.operator()); }catch(_){ return false; } }
  var VAR={temp:'temperature_2m',feels:'temperature_2m',precip:'precipitation',wind:'wind_speed_10m'};
  var RANK={key:null,data:null,busy:false};
  function station(){ try{ return mmState && mmState.station; }catch(_){ return null; } }
  function elevOf(s){ return s ? (s.elev!=null ? s.elev : (s.elevation!=null ? s.elevation : (s.alt!=null ? s.alt : null))) : null; }
  function fetchRank(){
    var s=station(), v=VAR[(mmState&&mmState.variable)||'temp']||'temperature_2m', e=elevOf(s);
    var key=(e==null?'':Math.round(e))+'|'+v; if(RANK.key===key||RANK.busy) return;
    RANK.busy=true;
    fetch('/api/pool/rank?var='+encodeURIComponent(v)+(e!=null?'&elev='+encodeURIComponent(e):'')).then(function(r){ return r.json(); })
      .then(function(j){ RANK.key=key; RANK.data=(j&&j.ok)?j:null; RANK.busy=false; try{ mmRender(); }catch(_){} })
      .catch(function(){ RANK.key=key; RANK.data=null; RANK.busy=false; });
  }
  function q(arr,p){ if(!arr.length) return null; var a=arr.slice().sort(function(x,y){return x-y;}), i=(a.length-1)*p, lo=Math.floor(i), hi=Math.ceil(i); return a[lo]+(a[hi]-a[lo])*(i-lo); }
  function ensureShell(){
    var box=document.getElementById('mmModels'); if(!box) return null;
    var rank=box.closest('.mm-rank'); if(!rank) return box;
    if(!document.getElementById('mmSummary')){
      var sum=document.createElement('div'); sum.id='mmSummary'; sum.setAttribute('aria-live','polite');
      var h=rank.querySelector('h4'); if(h && h.nextSibling) rank.insertBefore(sum,h); else rank.insertBefore(sum,rank.firstChild);
    }
    if(!document.getElementById('mmHow')){
      var d=document.createElement('details'); d.id='mmHow';
      var s=document.createElement('summary'); s.textContent='How this forecast was made'; d.appendChild(s);
      var h4=rank.querySelector('h4'), note=rank.querySelector('.mm-chartnote');
      rank.insertBefore(d, h4||box);
      if(h4) d.appendChild(h4); if(note) d.appendChild(note); d.appendChild(box);
    }
    var how=document.getElementById('mmHow'); if(isOp()) how.open=true;
    return box;
  }
  function kindOf(m){
    if(m.provider==='metno') return 'Independent provider · comparison only';
    var k=m.ml?'AI model':'Physics model';
    return /not pooled/i.test(m.org||'') ? k+' · comparison only' : k;
  }
   
  mmRenderRanking=function(series, st){
    var box=ensureShell(); if(!box) return; box.innerHTML='';
    fetchRank();
    var vm=MM_VARMAP[mmState.variable], ref=st.peak, dec=mmState.variable==='precip'?1:0;
    var R=RANK.data && RANK.data.models ? RANK.data.models : null;
    var rows=MM_MODELS.map(function(m){
      var arr=series&&series[m.key], mp=null;
      if(arr){ var w=arr.slice(0,Math.min(36,mmState.lead)).filter(function(x){return x!=null;}); if(w.length) mp=Math.max.apply(null,w); }
      var delta=(mp==null||ref==null)?null:mp-ref;
      return {m:m, mp:mp, delta:delta, rank:R&&R[m.key]?R[m.key].rank:null, absd:delta==null?999:Math.abs(delta)};
    }).sort(function(a,b){
      if(a.rank!=null||b.rank!=null){ if(a.rank==null) return 1; if(b.rank==null) return -1; return a.rank-b.rank; }
      return a.absd-b.absd;
    });
     
    var act=rows.filter(function(r){ return r.mp!=null && mmHasData(r.m.key) && !mmState.off.has(r.m.key); }).map(function(r){ return r.mp; });
    var cuts=mmState.variable==='wind'?[2,4,7]:mmState.variable==='precip'?[2,6,15]:[1.5,3,5];
    var sp=st.avgSpread, conf=sp==null?null:(sp<=cuts[0]?'High':sp<=cuts[1]?'Medium':'Low');
    var lab=mmState.variable==='precip'?'Peak rain rate, next 36 h':(mmState.variable==='wind'?'Peak wind, next 36 h':'Highest temperature, next 36 h');
    var sum=document.getElementById('mmSummary');
    if(sum){
      if(ref==null||!act.length){ sum.innerHTML='<span class="mm-sum-lab">'+lab+'</span> <b>—</b>'; }
      else{
        var lo=q(act,0.1), hi=q(act,0.9);
        sum.innerHTML='<div class="mm-sum-row"><span class="mm-sum-lab">'+lab+'</span><b>'+ref.toFixed(dec)+vm.unit+'</b>'
          +'<span>likely '+lo.toFixed(dec)+'–'+hi.toFixed(dec)+vm.unit+'</span>'
          +(conf?'<span>confidence <span class="mm-conf-word">'+conf+'</span></span>':'')+'</div>';
      }
    }
    var how=document.getElementById('mmHow');
    if(how){ var s=how.querySelector('summary'); if(s) s.textContent='How this forecast was made · '+rows.length+' models'; }
    var h4=how?how.querySelector('h4'):null, note=how?how.querySelector('.mm-chartnote'):null;
    if(h4) h4.textContent=R?'Models ranked by measured accuracy here':'Models · ordered by agreement (no accuracy record for this zone yet)';
    if(note) note.textContent=R?'Rank = measured accuracy against stations for this zone, season and lead. The forecast above weights the models by it. Tap a model to toggle it in the range.'
                               :'Tap a model to toggle it in the range. Difference = next-day peak vs the consensus.';
    rows.forEach(function(r){
      var m=r.m, avail=mmHasData(m.key);
      var row=document.createElement('div'); row.className='mm-model'+((!avail||mmState.off.has(m.key))?' off':''); row.setAttribute('data-mm-key',m.key);
      var d=r.delta, dcls=d==null?'zero':(Math.abs(d)<0.3?'zero':(d>0?'warm':'cool'));
      var dtxt=!avail?'no feed':(d==null?'—':(d>0?'+':'')+d.toFixed(1)+vm.unit+' vs consensus');
      row.innerHTML='<span class="mm-chip-color" style="background:'+m.color+'"></span>'
        +'<span>'+(r.rank!=null?'<span class="mm-rankno">#'+r.rank+'</span>':'')+'<span class="mm-mname">'+m.name+(m.ml?'<span class="mm-ml-tag">ML</span>':'')+'</span>'
        +'<span class="mm-morg">'+(isOp()?m.org:kindOf(m))+'</span></span>'
        +'<span class="mm-mval"><span class="mm-mtemp">'+(!avail||r.mp==null?'—':r.mp.toFixed(dec)+vm.unit)+'</span><span class="mm-mdelta '+dcls+'">'+dtxt+'</span></span>';
      if(avail){ row.onclick=function(){ if(mmState.off.has(m.key)){ mmState.off.delete(m.key); } else if(mmActiveKeys().length>2){ mmState.off.add(m.key); } mmRender(); }; }
      else row.style.cursor='default';
      box.appendChild(row);
    });
  };
  document.addEventListener('agn:operator', function(){ try{ mmRender(); }catch(_){} });
})();
