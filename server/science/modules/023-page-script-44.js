

const PK_PROVINCES = AGN.geoData('PK_PROVINCES');

const PK_NATIONAL = AGN.geoData('PK_NATIONAL');

const PK_DISTRICTS = AGN.geoData('PK_DISTRICTS');
try{ window.PK_DISTRICTS = PK_DISTRICTS; }catch(e){}   

const PK_DISTRICT_CENTROIDS = AGN.geoData('PK_DISTRICT_CENTROIDS');
try{ window.PK_DISTRICT_CENTROIDS = PK_DISTRICT_CENTROIDS; }catch(e){}   

const PK_DISTRICT_TERRAIN = AGN.geoData('PK_DISTRICT_TERRAIN');


(function agnUrbanNational(n){
  try{
    var D=window.DISTRICT_IN||{};
    var ready=Object.keys(D).some(function(k){ return D[k] && D[k].weatherLive; });
    if(!ready) return n<900 && setTimeout(function(){ agnUrbanNational(n+1); },1000);    
    var key2uid={};
    try{ ((window.PK_DISTRICTS&&PK_DISTRICTS.features)||[]).forEach(function(f){
           var q=f.properties||{}; if(q.key&&q.uid) key2uid[q.key]=q.uid; }); }catch(_){}
    fetch(location.origin+'/api/urban/national',{cache:'no-store'})
      .then(function(r){ return r.ok?r.json():null; })
      .then(function(j){
        if(j&&j.withheld){ Object.keys(D).forEach(function(k){ try{ D[k].uhi=null; D[k].uhiWhy=j.why; }catch(_){} }); window.__agnUrbanNat={joined:0, withheld:true, why:j.why}; return; }   /* v91.17.283.5 C12: no tehsil roll-up, and no unit is told it has no built cells */
        if(!j||!j.ready||!j.units){ window.__agnUrbanNat={joined:0, why:(j&&j.why)||'not available'}; return; }
        var joined=0, noCells=0;
        Object.keys(D).forEach(function(k){
          var uid=key2uid[k]||k, u=j.units[uid];
          if(!u){ noCells++; try{ D[k].uhi=null; D[k].uhiWhy='no built cell of 5% or more inside this unit, so it has no urban canopy to describe'; }catch(_){} return; }
          joined++;
          try{ D[k].uhi={ popWeightedC:u.popWeightedC, medianC:u.medianC, p90C:u.p90C,
                          maxC:u.maxC, minC:u.minC, spreadC:u.spreadC, cells:u.cells,
                          warmestCell:u.warmestCell, basis:j.method, caveat:j.caveat }; }catch(_){}
        });
        window.__agnUrbanNat={joined:joined, withoutBuiltCells:noCells, units:j.unitsWithUrbanCells};
        try{ console.info('[AGN] urban heat joined to '+joined+' units, '+noCells+' have no built cells'); }catch(_){}
        try{ document.dispatchEvent(new CustomEvent('agn:urban-national')); }catch(_){}
      }).catch(function(){ window.__agnUrbanNat={joined:0, why:'the request failed'}; });
  }catch(_){}
})(0);


const GLOF_BASINS = {"Swat":{lakes:214,areaKm2:12.5,largestKm2:0.74},"Chitral":{lakes:116,areaKm2:5.8,largestKm2:1.61},"Gilgit":{lakes:660,areaKm2:37.8,largestKm2:2.71},"Hunza":{lakes:216,areaKm2:9.2,largestKm2:5.78},"Shigar":{lakes:110,areaKm2:2.3,largestKm2:0.21},"Shyok":{lakes:270,areaKm2:6.0,largestKm2:0.29},"Indus":{lakes:815,areaKm2:32.4,largestKm2:2.56},"Shingo":{lakes:247,areaKm2:11.8,largestKm2:1.4},"Astore":{lakes:196,areaKm2:5.8,largestKm2:0.49},"Jhelum":{lakes:200,areaKm2:11.2,largestKm2:0.98}};


const GLOF_INVENTORY_COVERAGE = {};
const GLOF_REGISTER = {"Hunza":{tier:3,base:90,basin:"Hunza",named:["Shisper", "Khurdopin", "Ghulkin", "Attabad (Hunz_gl 13)"],note:"Surge-glacier GLOFs; national GLOF-programme priority"},"Ghizer":{tier:3,base:82,basin:"Gilgit",named:["Darkut", "Badswat"],note:"Yasin/Ishkoman PDGLs; national GLOF-programme priority"},"Nagar":{tier:3,base:80,basin:"Hunza",named:["Hispar", "Hopar"],note:"Hispar basin; GLOF-alert district"},"Ghanche":{tier:3,base:80,basin:"Shyok",named:["Shyk_gl 265", "Shyk_gl 262"],note:"Shyok/Khaplu; end-moraine PDGLs; national GLOF programme"},"Shigar":{tier:3,base:82,basin:"Shigar",named:["Baltoro", "Braldu"],note:"Shigar/Braldu (Baltoro) basin; national GLOF-programme priority"},"Skardu":{tier:3,base:72,basin:"Indus",named:["Ind_gl 148"],note:"Indus-Shigar confluence; national GLOF-programme district"},"Astore":{tier:3,base:75,basin:"Astore",named:["Ast_gl 160"],note:"Astore basin; highly susceptible lake; national GLOF programme"},"Diamir":{tier:3,base:70,basin:"Indus",named:["Nanga Parbat massif"],note:"Diamer basin; national GLOF-programme priority"},"Kharmang":{tier:3,base:68,basin:"Indus",named:[],note:"Upper Indus; GLOF-alert district"},"Gilgit":{tier:2,base:62,basin:"Gilgit",named:["Gil_gl 595 (Dahimal)"],note:"Gilgit River basin; hanging-lake hazard"},"Gupis Yasin":{tier:2,base:66,basin:"Gilgit",named:["Darkut", "Badswat"],note:"Yasin/Ishkoman PDGLs"},"Roundu":{tier:2,base:60,basin:"Shigar",named:[],note:"Indus gorge; glaciated catchment"},"Darel":{tier:2,base:55,basin:"Indus",named:[],note:"Glaciated tributary catchment"},"Tangir":{tier:2,base:55,basin:"Indus",named:[],note:"Glaciated tributary catchment"},"Chitral Upper":{tier:3,base:80,basin:"Chitral",named:["Golen Gol", "Reshun"],note:"Golen Gol/Reshun; national GLOF-programme priority"},"Chitral Lower":{tier:3,base:70,basin:"Chitral",named:["Reshun"],note:"Lower Chitral GLOF history; national GLOF programme"},"Upper Dir":{tier:2,base:58,basin:"Swat",named:[],note:"GLOF-alert district"},"Swat":{tier:2,base:52,basin:"Swat",named:["Mankiyal", "Utror"],note:"Mankiyal/Utror glaciated valleys; GLOF-alerted"},"Upper Kohistan":{tier:2,base:55,basin:"Indus",named:[],note:"Glaciated Indus catchment; GLOF-alerted"},"Lower Kohistan":{tier:1,base:45,basin:"Indus",named:[],note:"Glaciated catchment fringe"},"Kolai Palas":{tier:1,base:42,basin:"Indus",named:[],note:"Glaciated catchment fringe"},"Mansehra":{tier:1,base:38,basin:"Jhelum",named:[],note:"Upper Hazara; GLOF-alerted downstream"},"Batagram":{tier:1,base:35,basin:"Indus",named:[],note:"Glaciated fringe"},"Shangla":{tier:1,base:33,basin:"Swat",named:[],note:"Glaciated fringe"},"Bajaur":{tier:1,base:30,basin:"Swat",named:[],note:"High HKH fringe"},"Lower Dir":{tier:1,base:35,basin:"Swat",named:[],note:"Glaciated fringe"}};


try{ Object.keys(GLOF_REGISTER).forEach(function(d){ GLOF_INVENTORY_COVERAGE[d]=true; }); }catch(_){}

