function ringHas(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function polygonsOf(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates || [];
  return [];
}

export function featureHas(feature, lat, lon) {
  return polygonsOf(feature).some((poly) => {
    if (!poly?.[0] || !ringHas(poly[0], lon, lat)) return false;
    return !poly.slice(1).some((hole) => ringHas(hole, lon, lat));
  });
}

export function insidePoint(feature) {
  const ring = polygonsOf(feature)[0]?.[0];
  if (!ring?.length) return null;
  let lat = 0;
  let lon = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  ring.forEach(([x, y]) => {
    lon += x;
    lat += y;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  lat /= ring.length;
  lon /= ring.length;
  if (featureHas(feature, lat, lon)) return { lat, lon };
  const steps = 12;
  let best = null;
  let bestDistance = Infinity;
  const midLat = (minY + maxY) / 2;
  const midLon = (minX + maxX) / 2;
  for (let row = 1; row < steps; row += 1) {
    for (let col = 1; col < steps; col += 1) {
      const nextLat = minY + ((maxY - minY) * row) / steps;
      const nextLon = minX + ((maxX - minX) * col) / steps;
      if (!featureHas(feature, nextLat, nextLon)) continue;
      const distance = (nextLat - midLat) ** 2 + (nextLon - midLon) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { lat: nextLat, lon: nextLon };
      }
    }
  }
  return best || { lat, lon };
}

export function tehsilAt(features, lat, lon) {
  const hit = (features || []).find((feature) => featureHas(feature, lat, lon));
  if (!hit) return null;
  const props = hit.properties || {};
  return {
    uid: props.uid,
    tehsil: props.tehsil || props.name || 'Tehsil',
    district: props.district || '',
    province: props.province || '',
    lat,
    lon,
  };
}

export function tehsilRows(features) {
  return (features || []).map((feature) => {
    const props = feature.properties || {};
    const at = insidePoint(feature);
    return {
      uid: props.uid,
      tehsil: props.tehsil || props.name || props.uid,
      district: props.district || '',
      province: props.province || '',
      lat: at?.lat,
      lon: at?.lon,
    };
  }).filter((row) => row.uid);
}
