(function (global) {
  'use strict';
  const AGN = global.AGN = global.AGN || {};
  

  AGN.version = global.AGN_VERSION || 'version-unset';
  AGN.architecture = {
    release: 'v' + (global.AGN_VERSION || 'version-unset') + ' Handover Freeze',
    mode: 'modular source with standalone bundle',
    state: 'central shared store plus isolated section-owned state registries',
    controllers: 'contract-checked section services with lifecycle-owned access',
    implementations: 'section-owned implementation modules behind stable service contracts',
    dependencies: 'legacy globals isolated behind AGN.adapters and AGN.dataServices',
    contracts: 'validated station, tehsil, district, forecast, hazard-result, evidence and API payload schemas',
    backend: 'endpoint contracts configured through named connection profiles with health, retry, identity and persistence policy',
    network: 'dedicated AGN.api client, browser fetch untouched; explicit synchronisation queue never runs automatically'
  };
})(window);
