
(function(){
  

  var DAY=null, HOUR=null, FMT=null, HFMT=null, stampD=0, stampH=0;
  function fmt(){ if(!FMT) FMT=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}); return FMT; }
  function hfmt(){ if(!HFMT) HFMT=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',hour:'2-digit',hourCycle:'h23'}); return HFMT; }
  function pkDay(offset){
    offset=offset||0;
    var now=Date.now();
    if(offset===0 && DAY && now-stampD<60000) return DAY;
    var d=new Date(now); d.setDate(d.getDate()+offset);
    var p=fmt().formatToParts(d), v={};
    for(var i=0;i<p.length;i++) v[p[i].type]=p[i].value;
    var out=v.year+'-'+v.month+'-'+v.day;
    if(offset===0){ DAY=out; stampD=now; }
    return out;
  }
  function pkHour(){
    var now=Date.now();
    if(HOUR!=null && now-stampH<60000) return HOUR;
    var p=hfmt().formatToParts(new Date(now)), h=0;
    for(var i=0;i<p.length;i++) if(p[i].type==='hour') h=Number(p[i].value);
    HOUR=h; stampH=now; return h;
  }
  try{ window.MACH_TIME=Object.freeze({ day:pkDay, hour:pkHour, timezone:'Asia/Karachi' }); }catch(_){}

  

})();
