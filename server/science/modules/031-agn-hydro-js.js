


(function(G){
  'use strict';
  var AGN=G.AGN=G.AGN||{}, T=null, M=null;
  function load(){ if(T) return T;
    var el=document.getElementById('agn-hydro'); if(!el) throw new Error('AGN.hydro: payload missing');
    M=JSON.parse(el.textContent); T=M.t; return T; }
  AGN.hydro={
    forUnit:function(k){ load(); return T[k]||null; },
    meta:function(){ load(); return {v:M.v,src:M.src,method:M.method,units:Object.keys(T).length}; },
    caveats:function(){ load(); return M.caveats; },
    distribution:function(f){ load(); var v=[];
      Object.keys(T).forEach(function(k){ var x=T[k][f]; if(typeof x==="number") v.push(x); });
      if(!v.length) return {field:f,n:0}; v.sort(function(a,b){return a-b;});
      return {field:f,n:v.length,min:v[0],median:v[Math.floor(v.length/2)],max:v[v.length-1]}; }
  };
})(window);
