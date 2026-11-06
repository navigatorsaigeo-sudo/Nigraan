

(function(){
  if(typeof window.AGN==='undefined') window.AGN={};
  if(AGN.diagnostics) return;
  var LOG=[], CAP=300;
  function capture(rec){
    try{
      var e=rec&&rec.error;
      LOG.push({ at:new Date().toISOString(),
                 module:(rec&&rec.module)||'unknown',
                 message:(e&&e.message)||String(e||'(no error object)'),
                 context:(rec&&rec.context)||null });
      if(LOG.length>CAP) LOG.shift();
      if(window.__MACH_DEBUG) console.warn('[AGN]', rec&&rec.module, e&&e.message, rec&&rec.context);
    }catch(_){}
  }
  AGN.diagnostics={ capture:capture,
    all:function(){ return LOG.slice(); },
    byModule:function(m){ return LOG.filter(function(r){ return r.module===m; }); },
    clear:function(){ LOG.length=0; },
    count:function(){ return LOG.length; } };
})();
