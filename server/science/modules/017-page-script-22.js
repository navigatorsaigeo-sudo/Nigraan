(function(global){
'use strict';
const AGN=global.AGN=global.AGN||{};
if(!AGN.deploymentReadiness||!AGN.securityPolicy)return;
const originalEvaluate=AGN.deploymentReadiness.evaluate.bind(AGN.deploymentReadiness);
AGN.deploymentReadiness.evaluate=function(options){
 const report=originalEvaluate(options||{}); const sec=AGN.securityPolicy.evaluate();
 const production=report.environment==='production';
 const add=(id,label,severity,passed,detail,remediation)=>report.checks.push({id,label,category:'Security',severity,passed:passed===true,detail,remediation,source:'AGN.securityPolicy'});
 add('leaflet-css-local','Leaflet CSS and icons are locally vendored',production?'blocker':'warning',sec.inventory.leaflet.cssVendored&&sec.inventory.leaflet.iconsVendored,sec.inventory.leaflet.cssVendored?'Local CSS and icon assets detected.':'External Leaflet CSS detected.','Keep Leaflet CSS and icon assets under vendor/leaflet.');
 add('leaflet-js-local','Leaflet JavaScript is locally vendored',production?'blocker':'warning',sec.inventory.leaflet.javascriptVendored,sec.inventory.leaflet.javascriptVendored?'Local Leaflet JavaScript detected.':'Official CDN runtime retained with SRI.','Run python3 vendor/install_leaflet.py in a controlled network-enabled build environment, then replace the CDN script with vendor/leaflet/leaflet.js.');
 add('security-headers','Deployment security-header templates are included','blocker',!!sec.headers['Strict-Transport-Security']&&!!sec.csp,'CSP, HSTS, permissions and cross-origin templates included.','Deploy and verify the supplied server-header templates.');
 

  
 const applies=AGN.deploymentReadiness.checkApplies;
 const scored=report.checks.filter(applies);
 report.notApplicable=report.checks.filter(x=>!applies(x));
 report.unconfirmed=report.checks.filter(x=>x.source==='manual'&&applies(x)&&!x.passed);
 report.blockers=scored.filter(x=>x.severity==='blocker'&&!x.passed);
 report.warnings=scored.filter(x=>x.severity==='warning'&&!x.passed);
 const w=x=>x.severity==='blocker'?3:x.severity==='warning'?1:.5;
 const weights=scored.reduce((s,x)=>s+w(x),0);
 const earned=scored.reduce((s,x)=>s+(x.passed?w(x):0),0);
 report.score=Math.round(weights?earned/weights*100:0);
 report.scoreBasis=report.score+'/100 over '+scored.length+' applicable check'
   +(scored.length===1?'':'s')+'. '+report.notApplicable.length+' check'
   +(report.notApplicable.length===1?' is':'s are')+' out of scope for the '
   +report.environment+' target and are excluded from the score rather than counted as passed. '
   +(report.unconfirmed.length
      ? report.unconfirmed.length+' manual confirmation'+(report.unconfirmed.length===1?'':'s')
        +' remain outstanding: '+report.unconfirmed.map(x=>x.label).join(', ')+'.'
      : 'No manual confirmation is outstanding.');
 report.status=report.blockers.length?'not-ready':report.warnings.length?'conditional':'ready';
 report.security=sec;
 return report;
};
const originalSnapshot=AGN.deploymentReadiness.snapshot&&AGN.deploymentReadiness.snapshot.bind(AGN.deploymentReadiness);
if(originalSnapshot)AGN.deploymentReadiness.snapshot=function(){const x=originalSnapshot();x.security=AGN.securityPolicy.snapshot();return x;};
})(window);