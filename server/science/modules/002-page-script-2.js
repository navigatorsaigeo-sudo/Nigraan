

(function(){var G=(typeof window!=='undefined')?window:this;
  

  

  G.AGN_VERSION='91.17';
  G.AGN_RELEASE=G.AGN_VERSION;
  G.AGN=G.AGN||{}; G.AGN.version=G.AGN_VERSION;
  

  

  try{ document.addEventListener('DOMContentLoaded', function(){
         var b=document.getElementById('agnProvBuild');
         if(b) b.textContent='v'+G.AGN_VERSION+' \u00b7 '+(G.AGN_BUILD.stage||'build').replace(/-/g,' ');
       }); }catch(_){}
  G.AGN.parse=G.AGN.parse||{};
  G.AGN.parse.numberOrNull=function(v){
    if(v===null||v===undefined) return null;
    if(typeof v==='number') return isFinite(v)?v:null;
    if(typeof v==='boolean') return null;
    var s=String(v).trim();
    if(s==='') return null;
    var n=Number(s);
    return isFinite(n)?n:null;
  };
  

  G.AGN.parse.roundOrNull=function(v){
    var n=G.AGN.parse.numberOrNull(v);
    return n===null?null:Math.round(n);
  };
  

  

  

  

  

  G.AGN.liveAcceptance=Object.freeze({
    run_at:'2026-09-16T21:17:55+00:00',
    binds_identity:'c608eafcc49950fab7597527df8adbb6cb1a5e705617cfe7f834ec0ea6c7f31c',
    binds_basis:'the tier-neutral identity_sha256 of the build these calls were made '
               +'against. A pass that does not say what it passed is not evidence: '
               +'without this field an acceptance run can be carried forward into any '
               +'later artefact and still read as true. If this value does not match '
               +'the qaReceipt identity_sha256 of the file you are reading, the run '
               +'belongs to a different build - and this build refuses to issue while '
               +'that is so.',
    endpoints:10, passed:10,
    basis:'real provider calls from the build container, Lahore 31.5497/74.3436',
    results:Object.freeze([{id:'forecast',http:200,ms:601,attempts:2},{id:'airquality',http:200,ms:579,attempts:1},{id:'flood',http:200,ms:624,attempts:1},{id:'ensemble',http:200,ms:664,attempts:2},{id:'geocoding',http:200,ms:570,attempts:1},{id:'archive',http:200,ms:565,attempts:1},{id:'seasonal_seas5',http:200,ms:655,attempts:1},{id:'seasonal_ec46',http:200,ms:675,attempts:2},{id:'climate_7model',http:200,ms:696,attempts:1},{id:'model_updates',http:200,ms:504,attempts:1}]),
    transport:'three endpoints needed a second attempt (forecast, ensemble, seasonal_ec46) and the attempt count is '
             +'recorded for every one of them, so a reader sees how stable the path was '
             +'rather than having a retry hidden. What made this release need the record: '
             +'while 91.17 was being assembled the acceptance script was run four times '
             +'in one session and the free forecast host began returning HTTP 429 - a '
             +'rate limit this build earned, per source address, not a provider fault and '
             +'not a defect in the artefact. Two runs were discarded rather than stamped '
             +'as a nine-of-ten pass or trimmed to nine endpoints to make the count agree. '
             +'The run recorded here is a clean ten of ten made after the limit cleared. '
             +'A rate limit is different from the TLS handshake failures the predecessor '
             +'release discarded: a handshake fault says nothing about the provider, '
             +'whereas a 429 is the provider answering, and what it says is no.',
    evidence:Object.freeze({
      forecast:'48 h returned, units \u00b0C / %% / mm / km/h, uv_index non-null 48/48, tz Asia/Karachi',
      airquality:'us_aqi, pm2_5, pm10, no2, o3, dust and aod all present',
      flood:'30 daily river_discharge values with p25/p75 ensemble percentiles',
      ensemble:'ensemble member series returned for temperature_2m',
      climate:'all seven HighResMIP models returned 365 of 365 daily values for 1991, '
             +'HiRAM_SIT_HR included - the 1991-2010 baseline claim holds for the seventh model',
      seasonal:'SEAS5 and EC46 both answered',
      model_updates:'last_run_initialisation_time, last_run_availability_time, '
                   +'temporal_resolution_seconds and update_interval_seconds all present; '
                   +'metadata calls are not billed'
    }),
    boundary:'A live acceptance pass proves the provider answered with the shape '
            +'this build expects. It does NOT validate hazard skill, calibration '
            +'or forecast accuracy, and it is not a substitute for station '
            +'verification.'
  });

  

  G.AGN.freezeContract=Object.freeze({
    version:'91.17',
    basis:'each rule is held by the named gate and the named mutation reinstates '
         +'the defect it removed. Both are external to this artefact; the QA receipt '
         +'binds a run of them to these exact bytes.',
    rules:Object.freeze([
      Object.freeze({id:'FZ-MC-01', gate:'G154', mutation:'v91.16.5 C1 cross-hazard quantiles',
        rule:'a Monte Carlo run over two hazards screened on different index scales publishes '
            +'no combined quantiles and no combined severity class; a same-hazard or cascade '
            +'run keeps its native quantiles'}),
      Object.freeze({id:'FZ-LIVE-02', gate:'G155', mutation:'v91.16.5 C2 seeds score in live',
        rule:'in live mode a dynamic hazard with no provider evidence is reported unavailable '
            +'rather than scored from a seed, and the refusal is made in the dispatcher every '
            +'consumer passes through, not at individual screens'}),
      Object.freeze({id:'FZ-DRAFT-03', gate:'G156', mutation:'v91.16.5 C3 worked example commits',
        rule:'loading a worked example fills draft controls and writes zero governed rows; the '
            +'store\u2019s own refusal, where it has one, is stated word for word'}),
      Object.freeze({id:'FZ-CASE-04', gate:'G157', mutation:'v91.16.5 C4 unattributable is silent',
        rule:'an incomplete decision subject yields no case id and binds no evidence. A record '
            +'that cannot be attributed is KEPT, flagged envelope_incomplete, announced to the '
            +'operator and excluded from issuance - it is never dropped'}),
      Object.freeze({id:'FZ-FLOOD-05', gate:'G158', mutation:'v91.16.5 C5 flood pathway goes silent',
        rule:'with neither the pluvial nor the riverine pathway scored there is no flood score; '
            +'any antecedent signal is retained as context under a name that is not a score, and '
            +'the reason names the pathways'}),
      Object.freeze({id:'FZ-LIVEID-08', gate:'G103', mutation:'v91.16.5a F6 issues without a bound receipt',
        rule:'liveAcceptance.binds_identity must equal the stamped qaReceipt.identity_sha256, and '
            +'issuance refuses while it does not - an unstamped or inherited receipt cannot '
            +'qualify these bytes'}),
      Object.freeze({id:'FZ-LADDER-09', gate:'G165', mutation:'v91.17 L1 ladder floor ignored',
        rule:'consequence calibration is declared per stage - damage, functionality, service, '
            +'downtime - each with the floor it must reach before a number from it '
            +'may be issued. belowFloor() is derived from the table on every call, never '
            +'asserted, so a stage cannot be declared compliant by editing one field'}),
      Object.freeze({id:'FZ-PAYLOAD-10', gate:'G166', mutation:'v91.17 P1 payload accepts a bare number',
        rule:'a number crossing from NIGRAAN ACTION carries value, unit, stage, calibration, '
            +'evidence, curve, model, uncertainty, refusal conditions, licences and the run '
            +'hash. A null value with a reason passes; a finite number missing any of the '
            +'rest is refused and recorded as refused, never defaulted or rounded'}),
      Object.freeze({id:'FZ-RECORD-11', gate:'G167', mutation:'v91.17 R1 refused number enters the record',
        rule:'compile() routes and audit() re-derives the verdict from the issued list alone; '
            +'they share the predicates and not the routing. issuance refuses while '
            +'consistent is false, so a record that disagrees with its own contract cannot '
            +'become a document'}),
      Object.freeze({id:'FZ-AIFIRE-12', gate:'G168', mutation:'v91.17 A1 firewall defaults to allow',
        rule:'the v91.16.6 rule that no foundation model emits a hazard score is widened to '
            +'every governed number in the consequence chain and made executable. aiMayEmit() '
            +'defaults to deny, so a kind nobody anticipated is refused rather than permitted, '
            +'and the governed list is rendered in the AI section rather than only declared'})
    ]),
    evidenceVisibility:'Changing the active subject changes which records are in scope; it does '
                      +'not delete stored evidence. Restoring the same subject restores the same '
                      +'case-bound records, and G157 and G161 run that round trip.',
    freezeBoundary:'91.17 makes this artefact a Decision Record issuer and nothing more. No '
                  +'forecasting model is added, no hazard engine changes, no consequence number '
                  +'is computed here - the calibration ladder exists to say which of them may '
                  +'not be. Registries, dependency graphs and outcome history belong to NIGRAAN '
                  +'ACTION, which is a separate product on a separate version line; this build '
                  +'holds the contract at the seam and the authority to refuse. TimesFM remains '
                  +'out: its 3.0 weights are published under a non-commercial, non-production '
                  +'licence, so it could not ship from here even if it won a skill gate.',
    closedSince9116:Object.freeze([
      Object.freeze({id:'OPEN-CSP-HOSTS', closedIn:'91.17',
        what:'previous-runs-api, marine-api and satellite-api were mapped in OM_COMMERCIAL_HOST '
            +'but only their customer- forms were in connect-src, so the client tier met an '
            +'opaque CSP refusal on three services the build believes it can call. The three '
            +'free hosts are now allowlisted. It was found after 91.16.5 was stamped and is '
            +'named here rather than closed silently.'})
    ]),
    openAtFreeze:Object.freeze([
      Object.freeze({id:'OPEN-FLOOD-PANEL', severity:'P2',
        what:'an audited export showed a flood screening score beside "Governing pathway: none". '
            +'hzFlood cannot produce that pair - a known rainfall always scores the pluvial layer '
            +'and an unknown one makes the result unavailable - so the two lines came from two '
            +'evaluations reaching one panel. This is a rendering fault upstream of the engine '
            +'and 91.16.5 does not close it. It is named here rather than deferred silently.'})
    ])
  });

  

  G.AGN.calibrationLadder=Object.freeze({
    version:'91.17',
    basis:'the state is what the evidence supports today, the floor is what this build '
         +'requires before a number from that stage may be issued. state below floor is '
         +'not a defect to be hidden - it is the reason the number is refused.',
    levels:Object.freeze([
      Object.freeze({id:'H0', label:'Expert heuristic',
        means:'a judgement. Nothing published stands behind the number.'}),
      Object.freeze({id:'H1', label:'Literature supported',
        means:'a published function from elsewhere, adopted unchanged.'}),
      Object.freeze({id:'H2', label:'Regional evidence',
        means:'a function derived over a region that contains this country but was not '
             +'built from its data. A cost rescaling to local prices does not raise a '
             +'curve above H2; it changes the magnitude, not the shape.'}),
      Object.freeze({id:'H3', label:'Locally calibrated',
        means:'fitted to observations from this country, each loss paired to a measured '
             +'hazard intensity. Loss records without a paired intensity cannot reach H3.'}),
      Object.freeze({id:'H4', label:'Out-of-sample validated',
        means:'tested against cases withheld from the fit.'}),
      Object.freeze({id:'H5', label:'Outcome verified',
        means:'checked in operation against what was recorded after the event.'})
    ]),
    order:Object.freeze(['damage','functionality','service','downtime']),
    stages:Object.freeze({
      damage:Object.freeze({state:'H2', floor:'H2',
        basis:'continental flood depth-damage curves. The Asia curve is an average over '
             +'eleven Asian countries and Pakistan contributed none of them; the country '
             +'layer is a maximum-damage cost rescaling, not a curve refit. "Pakistan" at '
             +'this stage means Pakistan-cost-adjusted and nothing stronger.'}),
      functionality:Object.freeze({state:'H0', floor:'H2',
        basis:'no functionality-loss function is adopted. How damaged an asset is and what '
             +'it can still do are different questions, and this build has no published '
             +'function for the second.'}),
      service:Object.freeze({state:'H0', floor:'H2',
        basis:'service interruption follows the dependency graph of the site - which '
             +'substation, which access road, which supplier. That graph is client-supplied '
             +'and no part of it is held in this artefact.'}),
      downtime:Object.freeze({state:'H0', floor:'H2',
        basis:'no recovery or downtime function is adopted for this country. The published '
             +'work is institution-specific and does not transfer.'})
    }),
    rank:function(id){
      var L=this.levels; for(var i=0;i<L.length;i++) if(L[i].id===String(id)) return i;
      return -1;
    },
    isLevel:function(id){ return this.rank(id)>=0; },
    meetsFloor:function(stage,level){
      var s=this.stages[String(stage)];
      if(!s) return false;
      var a=this.rank(level), b=this.rank(s.floor);
      return a>=0 && b>=0 && a>=b;
    },
    

    belowFloor:function(){
      var out=[], o=this.order;
      for(var i=0;i<o.length;i++){
        var s=this.stages[o[i]];
        if(s && !this.meetsFloor(o[i], s.state)) out.push(o[i]);
      }
      return out;
    },
    debt:function(){
      var o=this.order, out=[];
      for(var i=0;i<o.length;i++){
        var s=this.stages[o[i]];
        if(!s) continue;
        var gap=this.rank(s.floor)-this.rank(s.state);
        if(gap>0) out.push({stage:o[i], state:s.state, floor:s.floor, levels:gap});
      }
      return out;
    }
  });

  

  G.AGN.payloadContract=Object.freeze({
    version:'91.17',
    required:Object.freeze(['value','unit','stage','calibration','evidence','curve',
                            'model','uncertainty','refusalConditions','licences','run_sha256']),
    basis:'every field is something a reader needs to check the number without asking '
         +'the person who produced it. A field that can be omitted is a field nobody '
         +'checks.',
    _isArr:function(v){ return Object.prototype.toString.call(v)==='[object Array]'; },
    validate:function(p){
      var missing=[], bad=[];
      if(!p || typeof p!=='object' || this._isArr(p))
        return {ok:false, missing:this.required.slice(), bad:['payload'],
                why:'not a payload object'};
      var R=this.required;
      for(var i=0;i<R.length;i++){
        if(!Object.prototype.hasOwnProperty.call(p,R[i]) || p[R[i]]===undefined) missing.push(R[i]);
      }
       
      if(missing.indexOf('value')<0){
        var v=p.value;
        if(v!==null && (typeof v!=='number' || !isFinite(v))) bad.push('value');
      }
      var L=(G.AGN&&G.AGN.calibrationLadder)||null;
      if(missing.indexOf('stage')<0 && (!L || !L.stages[String(p.stage)])) bad.push('stage');
      if(missing.indexOf('calibration')<0 && (!L || !L.isLevel(p.calibration))) bad.push('calibration');
      if(missing.indexOf('evidence')<0 && !(this._isArr(p.evidence) && p.evidence.length)) bad.push('evidence');
      if(missing.indexOf('licences')<0 && !(this._isArr(p.licences) && p.licences.length)) bad.push('licences');
      if(missing.indexOf('refusalConditions')<0 && !this._isArr(p.refusalConditions)) bad.push('refusalConditions');
      if(missing.indexOf('curve')<0 && !(p.curve && p.curve.id && p.curve.version)) bad.push('curve');
      if(missing.indexOf('model')<0 && !(p.model && p.model.id && p.model.version)) bad.push('model');
      if(missing.indexOf('uncertainty')<0 && !(p.uncertainty===null || (p.uncertainty && p.uncertainty.kind))) bad.push('uncertainty');
      if(missing.indexOf('run_sha256')<0 && !/^[0-9a-f]{64}$/.test(String(p.run_sha256||''))) bad.push('run_sha256');
      var ok=!missing.length && !bad.length;
      return {ok:ok, missing:missing, bad:bad,
              why: ok ? null
                 : ('this number does not carry what a reader needs to check it: '
                    +(missing.length?('missing '+missing.join(', ')):'')
                    +((missing.length&&bad.length)?'; ':'')
                    +(bad.length?('unusable '+bad.join(', ')):'')
                    +'. It is recorded as refused rather than issued.')};
    },
    

    meetsLadder:function(p){
      var L=(G.AGN&&G.AGN.calibrationLadder)||null;
      if(!L) return false;
      return L.meetsFloor(p&&p.stage, p&&p.calibration);
    }
  });

  

  G.AGN.decisionRecord=(function(){
    var LAST=null;
    function _pc(){ return (G.AGN&&G.AGN.payloadContract)||null; }
    function _verdict(p){
      var pc=_pc();
      if(!pc) return {ok:false, why:'no payload contract is present in this build'};
      var v=pc.validate(p);
      if(!v.ok) return {ok:false, why:v.why, missing:v.missing, bad:v.bad, kind:'contract'};
      if(!pc.meetsLadder(p)){
        var L=G.AGN.calibrationLadder, s=L.stages[String(p.stage)];
        return {ok:false, kind:'calibration',
                why:'the '+p.stage+' stage of this number is calibrated at '+p.calibration
                   +' and this build does not issue below '+(s?s.floor:'its floor')
                   +'. '+(s?s.basis:'')};
      }
      return {ok:true, why:null};
    }
    function _licences(list){
      var seen={}, out=[];
      for(var i=0;i<list.length;i++){
        var ls=(list[i]&&list[i].licences)||[];
        for(var j=0;j<ls.length;j++){
          var k=String(ls[j]&&ls[j].id!=null?ls[j].id:ls[j]);
          if(!seen[k]){ seen[k]=1; out.push(ls[j]); }
        }
      }
      return out;
    }
    function audit(issued){
      for(var i=0;i<issued.length;i++){ if(!_verdict(issued[i]).ok) return false; }
      return true;
    }
    function compile(payloads, opts){
      var list=Object.prototype.toString.call(payloads)==='[object Array]'?payloads:[];
      var issued=[], refused=[], o=opts||{};
      for(var i=0;i<list.length;i++){
        var v=_verdict(list[i]);
        if(v.ok) issued.push(list[i]);
        else refused.push({index:i, id:(list[i]&&list[i].id)||null, stage:(list[i]&&list[i].stage)||null,
                           kind:v.kind||'contract', why:v.why});
      }
      var q=(G.AGN&&G.AGN.qaReceipt)||{};
      var rec={
        version:'91.17',
        issued:issued,
        refused:refused,
        ledger:{received:list.length, issued:issued.length, refused:refused.length},
        licences:_licences(issued),
        stagesBelowFloor:(G.AGN&&G.AGN.calibrationLadder)?G.AGN.calibrationLadder.belowFloor():[],
        identity:{
          run_sha256:(o.run_sha256||null),
          identity_sha256:(q.identity_sha256||null),
          record_sha256:null,
          record_sha256_basis:'computed by the sealer over the issued record, not by this '
                             +'artefact. A file cannot hash the object it is inside, and a '
                             +'field that claims otherwise invites exactly the comparison '
                             +'that fails.'
        },
        consistent:false
      };
      rec.consistent=audit(issued);
      LAST=rec;
      try{ G.document.dispatchEvent(new CustomEvent('agn:decision-record',
        {detail:{issued:issued.length, refused:refused.length, consistent:rec.consistent}})); }catch(_){}
      return rec;
    }
    

    try{
      G.document.addEventListener('agn:decision-record', function(ev){
        var d=(ev&&ev.detail)||{};
        try{
          var el=G.document.documentElement;
          el.setAttribute('data-agn-record-issued', String(d.issued==null?'':d.issued));
          el.setAttribute('data-agn-record-refused', String(d.refused==null?'':d.refused));
          el.setAttribute('data-agn-record-consistent', d.consistent===false?'false':'true');
        }catch(_){}
      });
    }catch(_){}
    function summary(){
      if(!LAST) return null;
      return {received:LAST.ledger.received, issued:LAST.ledger.issued,
              refused:LAST.ledger.refused, consistent:LAST.consistent};
    }
    return { compile:compile, audit:audit, verdict:_verdict,
             last:function(){ return LAST; },
             summary:summary,
             clear:function(){
               LAST=null;
               try{
                 var el=G.document.documentElement;
                 el.removeAttribute('data-agn-record-issued');
                 el.removeAttribute('data-agn-record-refused');
                 el.removeAttribute('data-agn-record-consistent');
               }catch(_){}
             } };
  })();

  G.AGN.qaReceipt={
    stamped:true,
    identity_sha256:'c608eafcc49950fab7597527df8adbb6cb1a5e705617cfe7f834ec0ea6c7f31c',
    identity_basis:'sha256 of the file with the qaReceipt block, the Content-Security-Policy meta tag and the seven tier-dependent lines and the live-acceptance block removed; NOT the sha256 of the delivered file. It identifies the CODE the suite ran against, which both tiers share.',
    artefact_sha256:'574e66e1c203a71de05d5901d00063fef29b9a8b89ea2d3a1f28e48cdfb597b7',
    artefact_basis:'sha256 of the delivered bytes with the qaReceipt block and the CSP hash list normalised (both are rewritten by stamping and sealing) and EVERY TIER LINE LEFT IN. It identifies THIS ARTEFACT, so the client and internal builds hash differently and a receipt cannot be mistaken for the other tier.',
    channel:'client',
    credential_embedded:false,
    suite_version:'91.17',
    gates:'166',
    checks:'4892',
    mutations:'842',
    run_at:'2026-09-17T00:08:53+00:00',
    note:'external NIGRAAN gate suite; the harness is not shipped in this artefact'
  };

  

  G.AGN.providers = (function () {
    var P = {
      forecast:   { host:'api.open-meteo.com', tier:'all', wired:true, called:true,
                    covers:['now','short'], models:'30+ incl. best_match composite',
                    note:'pin models= per use; best_match is a seamless blend' },
      airquality: { host:'air-quality-api.open-meteo.com', tier:'all', wired:true, called:true,
                    covers:[], models:'CAMS' },
      flood:      { host:'flood-api.open-meteo.com', tier:'all', wired:true, called:true,
                    covers:['short','medium'], models:'global river-flow model ensemble, to 30 days' },
      geocoding:  { host:'geocoding-api.open-meteo.com', tier:'all', wired:true, called:true,
                    covers:[], models:'place-name resolution' },
      elevation:  { host:'api.open-meteo.com', tier:'all', wired:false, called:false,
                    covers:[], models:'90 m DEM',
                    note:'deliberately unused: the bundled tehsil DEM is better for Pakistan' },
      marine:     { host:'marine-api.open-meteo.com', tier:'professional', wired:true, called:false,
                    covers:['short'], models:'global and regional wave models',
                    note:'routed and allowlisted, never called: no coastal product yet' },
      satellite:  { host:'satellite-api.open-meteo.com', tier:'professional', wired:true, called:false,
                    covers:['now'], models:'observed radiation, Asia from 2015, 2.5-5 km',
                    note:'routed and allowlisted, never called: shortwave is taken from the model instead' },
      ensemble:   { host:'ensemble-api.open-meteo.com', tier:'professional', wired:true, called:true,
                    covers:['short','medium'], models:'global ensemble forecast 15 d, AI weather model',
                    note:'fetched daily; medium range is not yet declared as a product' },
      seasonal:   { host:'seasonal-api.open-meteo.com', tier:'professional', wired:true, called:true,
                    covers:['subseasonal','seasonal'], models:'SEAS5 pinned; EC46 available on the same endpoint',
                    note:'EC46 covers weeks 2-6 and is one models= parameter away' },
      climate:    { host:'climate-api.open-meteo.com', tier:'professional', wired:true, called:true,
                    

                    covers:['y2030','y2050'],
                    models:'HighResMIP, seven models read by this build',
                    modelsNote:'this build requests seven named HighResMIP models. The '
                      +'provider catalogue is not enumerated at runtime, so the number '
                      +'available upstream is not asserted here - confirm it against the '
                      +'provider climate API at deployment and widen the request if it '
                      +'has grown.',
                    note:'downscaled and bias-corrected to land reanalysis by default' },
      archive:    { host:'archive-api.open-meteo.com', tier:'professional', wired:true, called:true,
                    covers:[], models:'global reanalysis / land reanalysis from 1940' },
      histfc:     { host:'historical-forecast-api.open-meteo.com', tier:'professional', wired:true, called:true,
                    covers:[], models:'stitched forecast archive from 2021' },
      prevruns:   { host:'previous-runs-api.open-meteo.com', tier:'professional', wired:true, called:true,
                    covers:[], models:'fixed 1-7 day leads from 2024',
                    note:'called at one point only; national skill needs the grid' },
      singleruns: { host:'single-runs-api.open-meteo.com', tier:'professional', wired:false, called:false,
                    covers:[], models:'complete run by initialisation time, global forecast model from 2024-03',
                    note:'NOT routed and NOT allowlisted: reconstructing a past decision needs this' }
    };
    function all(){ return Object.keys(P); }
    function get(k){ return P[k] || null; }
    function called(){ return Object.keys(P).filter(function(k){ return P[k].called; }); }
    function unused(){ return Object.keys(P).filter(function(k){ return P[k].wired && !P[k].called; }); }
    function absent(){ return Object.keys(P).filter(function(k){ return !P[k].wired; }); }
     
    function coverageOf(h){
      return Object.keys(P).filter(function(k){
        return P[k].called && (P[k].covers||[]).indexOf(h) >= 0; });
    }
    return { SERVICES:P, all:all, get:get, called:called, unused:unused,
             absent:absent, coverageOf:coverageOf };
  })();
  G.AGN.hazardRegistry=(function(){
    var H={
      flood:    {id:'flood',    label:'Flood',            kind:'dynamic',     score_type:'index_0_100', unit:'screening index', rankable:true,  operations:true},
      heat:     {id:'heat',     label:'Heat stress',             kind:'dynamic',     score_type:'index_0_100', unit:'screening index', rankable:true,  operations:true},
      

      drought:  {id:'drought',  label:'Drought',          kind:'accumulated', score_type:'index_0_100', unit:'screening index (90-day SPEI/SPI and root-zone stress)', rankable:true,  operations:true, timescale:'weeks-months',
                 why:'an accumulated condition on a 90-day window (global reanalysis to about five days back). It is reported in its own lane beside the event hazards and never as the lead signal of a unit, because a condition that changes monthly cannot share a triage ladder with a burst that changes hourly.'},
      wind:     {id:'wind',     label:'Wind and gusts',             kind:'dynamic',     score_type:'index_0_100', unit:'screening index', rankable:true,  operations:true},
      cold:     {id:'cold',     label:'Cold stress (UTCI)',             kind:'dynamic',     score_type:'index_0_100', unit:'screening index', rankable:true,  operations:true},
      landslide:{id:'landslide',label:'Landslide',        kind:'dynamic',     score_type:'index_0_100', unit:'screening index', rankable:true,  operations:true},
      

      

      glof:     {id:'glof',     label:'Glacial lake outburst flood (GLOF)', kind:'standing', score_type:'code_class', unit:'GLOF level: Normal / High / Severe', rankable:false, operations:true, short:'GLOF', timescale:'static-with-monthly-lake-reads',
                 canonicalEngine:'lake-routed class (server glof.mjs national(); client hzGLOF reads __agnGlofNat)',
                 why:'a level from the mapped glacial lakes (Hi-MAG, CC BY 4.0) routed 100 km along HydroBASINS: Normal where the lakes upstream add up to little or are only susceptible (a standing condition, not a forecast; every lake counts), High on a precursor within reach (growth in our own Sentinel-2 reads), Severe only on an observed signal (a measured drainage or a confirmed outburst report). Lake areas from the SUPARCO Glacier Geospatial Portal inventory where it holds the lake. The melt and rain trigger is a modifier, never the cause of a level. Updated with each lake read, not by today\'s temperature. The expert register (Hunza 90, Chitral 80/70) is evidence; measured 2026-09-22 it inverted the lake ranking.'},
      seismic:  {id:'seismic',  label:'Seismic zone',     kind:'categorical', score_type:'code_class',  unit:'BCP-SP 2007 zone', rankable:false, operations:false,
                 why:'a building-code class, not a screening index. It has no position on the 0-100 ladder.',
                 calibration_status:'provisional: the mapped zone table is hand-entered and not yet reconciled against the official zone map'},
      

      cyclone:  {id:'cyclone',  label:'Coastal cyclone exposure (static)',    kind:'categorical',  score_type:'code_class',  unit:'coastal exposure segment', rankable:false, operations:true, short:'Cyclone',
                 why:'a coastal landfall-climatology segment entered by hand, not a screening index computed from an input. It has no position on the 0-100 ladder.',
                 calibrationStatus:'expert-entered, uncalibrated',
                 evidenceClass:'C',
                 sourceNote:'Arabian Sea landfall-climatology segments assigned by AGN expert judgement. No published national cyclone hazard zoning is bundled in this build.'}
    };
    function get(id){ return H[id]||null; }
    

    

    function _norm(v){ return String(v==null?'':v).trim().toLowerCase()
                              .replace(/\s+/g,' '); }
    function resolve(v){
      if(v==null) return null;
      var raw=String(v).trim();
      if(!raw) return null;
      if(H[raw]) return raw;
      var s=_norm(raw);
      if(H[s]) return s;
       
      var hit=Object.keys(H).filter(function(k){
        return _norm(H[k].display||'')===s || _norm(H[k].label)===s || k===s; })[0];
      if(hit) return hit;
       
      var head=s.split(/\s+[\u2014\u2013-]\s+/)[0].trim();
      if(H[head]) return head;
      hit=Object.keys(H).filter(function(k){
        return _norm(H[k].label)===head || k===head; })[0];
      if(hit) return hit;
      

      var first=head.split(' ')[0];
      if(H[first]) return first;
      hit=Object.keys(H).filter(function(k){ return _norm(H[k].label)===first; })[0];
      return hit||null;
    }
    function all(){ return Object.keys(H); }
    function of(kind){ return Object.keys(H).filter(function(k){ return H[k].kind===kind; }); }
    function rankable(){ return Object.keys(H).filter(function(k){ return H[k].rankable===true; }); }
    

    function crossComparable(){ return false; }
    var CROSS_WHY='hazard indexes are built on different physical quantities and '
      +'different cut points; they order severity within one hazard only. To order '
      +'two hazards use AGN.hazardValue.worstClass or compareStanding, which compare '
      +'the verdict class each hazard earned from its own index.';
    function label(id){ var h=H[id]; return h?h.label:String(id); }
    

    function shortName(id){ var h=H[id]; return h?(h.short||h.label):String(id); }
    return { HAZARDS:H, get:get, all:all, of:of, rankable:rankable, shortName:shortName,
             crossComparable:crossComparable, crossComparableWhy:CROSS_WHY, label:label,
             resolve:resolve,
             KINDS:['dynamic','standing','categorical'] };
  })();
  G.AGN.parse.fieldOrNull=function(el){
    if(typeof el==='string'){
      try{ el=document.getElementById(el); }catch(_){ return null; }
    }
    return G.AGN.parse.numberOrNull(el&&el.value);
  };
  G.AGN_BUILD=G.AGN_BUILD||{}; G.AGN_BUILD.version=G.AGN_VERSION;
  G.AGN_BUILD.channel='client'; G.AGN_BUILD.patch='91.17.283.16';    
  G.AGN_BUILD.stage='decision-integrity';
})();
