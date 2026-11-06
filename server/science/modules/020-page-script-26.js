(function(global){
'use strict';
const AGN=global.AGN=global.AGN||{};
const release={
 schema:'agn.release-metadata.v1',
 product:'AI-GEO-NIGRAAN',
 version:(window.AGN_VERSION|| 'version-unset'),
 channel:(window.AGN_BUILD&&AGN_BUILD.channel?AGN_BUILD.channel:'handover-freeze'),
 sourceDateEpoch:1786995660,
 builtAt:'2026-08-17T19:41:00Z',
 interfaceDesign:'frozen',
 dependencyPolicy:'locked',
 signingPolicy:'external-release-authority-required-for-production',
 signatureStatus:'build-attestation-only',
 productionStatus:'scientific-handover-candidate-pending-hazard-skill-and-impact-validation',
 verification:{architecture:true,security:true,urbanHeatMicroclimate:true,releasePipeline:true}
};
function snapshot(){return JSON.parse(JSON.stringify(release));}
AGN.release={metadata:release,snapshot};
})(window);
