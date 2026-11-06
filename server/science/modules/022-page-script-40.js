(function (global) {
  'use strict';
  const AGN = global.AGN = global.AGN || {};
  if (!AGN.store) return;

  function currentHazard(detail) {
    if (detail && typeof detail === 'string') return detail;
    if (detail && detail.hazard) return detail.hazard;
    try { return AGN.hazard && AGN.hazard.get ? AGN.hazard.get() : null; } catch (_) { return null; }
  }
  function currentSector(detail) {
    if (detail && typeof detail === 'string') return detail;
    if (detail && detail.sector) return detail.sector;
    try { return AGN.sector && AGN.sector.get ? AGN.sector.get() : null; } catch (_) { return null; }
  }
  function stationPatch(detail) {
    const s = detail && (detail.station || detail.point || detail.location) || null;
    if (!s) return null;
    let district = s.district || s.parentDistrict || null;
    let tehsil = s.tehsil || s.unit || null;
    let province = s.province || null;
    try {
      if (AGN.units && typeof AGN.units.context === 'function') {
        const c = AGN.units.context(tehsil || s.name || s.id);
        if (c) { tehsil = tehsil || c.tehsil; district = district || c.district; province = province || c.province; }
      }
    } catch (_) {}
    return { stationId: s.id || null, tehsil, district, province, preview: detail && detail.preview ? { name: s.name, lat: s.lat, lon: s.lon } : null };
  }
  document.addEventListener('agn:location', event => {
    const patch = stationPatch(event.detail || {});
    if (patch) AGN.store.set({ location: patch }, { reason: 'legacy-event', event: 'agn:location' });
  });
  document.addEventListener('agn:hazard', event => {
    const hazard = currentHazard(event.detail);
    if (hazard) AGN.store.update('context.hazard', hazard, { reason: 'legacy-event', event: 'agn:hazard' });
  });
  document.addEventListener('agn:sector', event => {
    const sector = currentSector(event.detail);
    if (sector) AGN.store.update('context.sector', sector, { reason: 'legacy-event', event: 'agn:sector' });
  });
  document.addEventListener('agn:day', event => {
    const d = event && event.detail || {};
    const hours = d.leadHours != null ? Number(d.leadHours) : d.day != null ? Number(d.day) * 24 : null;
    if (Number.isFinite(hours)) AGN.store.update('context.leadHours', hours, { reason: 'legacy-event', event: 'agn:day' });
  });
  document.addEventListener('agn:data', event => {
    const d = event && event.detail || {};
    AGN.store.set({ data: { status: d.status || 'updated', validTime: d.validTime || d.valid_at || AGN.store.select('data.validTime') } }, { reason: 'legacy-event', event: 'agn:data' });
  });
  document.addEventListener('agn:national', event => {
    const d = event && event.detail || {};
    const coverage = d.coverage != null ? d.coverage : d.loaded != null && d.total ? d.loaded / d.total : AGN.store.select('data.coverage');
    AGN.store.set({ data: { status: d.status || 'national-ready', coverage } }, { reason: 'legacy-event', event: 'agn:national' });
  });
  AGN.architecture = Object.assign({}, AGN.architecture, { legacyBridge: 'custom events mirrored into AGN.store' });
})(window);
