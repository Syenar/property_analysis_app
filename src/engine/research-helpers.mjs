import { esriGeometryToGeoJSON } from '../adapters/arcgis.mjs';

export function featureProps(f) { return f?.properties || f?.attributes || {}; }
export function featureGeom(f) { return f?.geometry || null; }

function normalizeAddressText(value) {
  return String(value || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|place|pl|highway|hwy|north|south|east|west|n|s|e|w)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function likelyAddressComponentKey(key) {
  const k = String(key || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!k || /(owner|mail|billing|legal|parceltype|propertytype)/.test(k)) return false;
  return /^(adr|addr)|situs|siteaddr|premise|paddress|propaddr|house(no|num|number)?|street(no|num|number|name)?|str(no|num|number|name|nam|type)?|pstrnam|pstrtype|predir|postdir|sufdir|psufdir|roadname|locationaddr|adrcity|adrzip/.test(k);
}

function scoreAddressText(candidate, input, inputTokens, house) {
  const text = normalizeAddressText(candidate);
  if (!text) return 0;
  let score = 0;
  if (house && new RegExp(`(^| )${house}( |$)`).test(text)) score += 8;
  const tokens = new Set(text.split(' ').filter((x) => x.length > 1));
  for (const token of inputTokens) if (tokens.has(token)) score += 1;
  if (input && text === input) score += 4;
  return score;
}

function parcelAddressScore(feature, inputAddress) {
  const props = featureProps(feature);
  const input = normalizeAddressText(inputAddress);
  const inputTokens = new Set(input.split(' ').filter((x) => x.length > 1));
  const house = input.match(/^\d+[a-z]?\b/)?.[0] || null;
  let best = 0;
  const components = [];
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    const explicitAddress = /(address|addr|situs|site|location|street|premise|property)/i.test(key) && !/(owner|mail|billing)/i.test(key);
    if (explicitAddress) best = Math.max(best, scoreAddressText(value, input, inputTokens, house));
    if (likelyAddressComponentKey(key) && (typeof value === 'string' || typeof value === 'number')) components.push(String(value));
  }
  if (components.length) best = Math.max(best, scoreAddressText(components.join(' '), input, inputTokens, house));
  return best;
}

function pointSegmentDistanceMeters(point, a, b) {
  const lat0 = point[1] * Math.PI / 180;
  const sx = Math.max(Math.cos(lat0), 0.01) * 111320;
  const sy = 110540;
  const ax = (a[0] - point[0]) * sx, ay = (a[1] - point[1]) * sy;
  const bx = (b[0] - point[0]) * sx, by = (b[1] - point[1]) * sy;
  const dx = bx - ax, dy = by - ay;
  const denom = dx * dx + dy * dy;
  const t = denom ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denom)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function featureDistanceMeters(feature, coordinates) {
  const g = esriGeometryToGeoJSON(featureGeom(feature));
  if (!g || !coordinates) return Infinity;
  const point = [coordinates.longitude, coordinates.latitude];
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  let best = Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) best = Math.min(best, pointSegmentDistanceMeters(point, ring[i - 1], ring[i]));
    }
  }
  return best;
}

export function chooseNearbyParcel(features, inputAddress, coordinates = null) {
  if (!features?.length) return { feature:null, reason:'none' };
  if (features.length === 1) return { feature:features[0], reason:'single-nearby' };
  const ranked = features.map((feature) => ({
    feature,
    score:parcelAddressScore(feature, inputAddress),
    distance:featureDistanceMeters(feature, coordinates)
  })).sort((a,b) => (b.score - a.score) || (a.distance - b.distance));
  if (ranked[0].score >= 5 && ranked[0].score >= (ranked[1]?.score || 0) + 2) {
    return { feature:ranked[0].feature, reason:'address-match', score:ranked[0].score };
  }
  const nearest = [...ranked].sort((a,b) => a.distance - b.distance);
  if (Number.isFinite(nearest[0].distance) && nearest[0].distance <= 30) {
    const second = nearest[1]?.distance ?? Infinity;
    if (second - nearest[0].distance >= 4 || second >= nearest[0].distance * 1.7) {
      return { feature:nearest[0].feature, reason:'nearest-geometry', distanceMeters:nearest[0].distance };
    }
  }
  return {
    feature:null,
    reason:'ambiguous',
    count:features.length,
    bestAddressScore:ranked[0]?.score || 0,
    nearestMeters:Number.isFinite(nearest[0]?.distance) ? nearest[0].distance : null
  };
}

export function layerSourceUrl(candidate, inspection, layerId) {
  if (candidate?.platform === 'wfs') return `${candidate.url}#typeName=${encodeURIComponent(layerId)}`;
  if (candidate?.platform === 'static-geojson' || candidate?.platform === 'static-shapefile') {
    return Number(layerId) > 0 ? `${candidate.url}#layer=${encodeURIComponent(layerId)}` : candidate.url;
  }
  return `${inspection.url}/${layerId}`;
}

export function candidateExtentContains(candidate, coordinates) {
  const extent = candidate?.extent;
  if (!Array.isArray(extent) || extent.length < 2 || !coordinates) return true;
  const a = extent[0], b = extent[1];
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return true;
  const nums = [a[0], a[1], b[0], b[1]].map(Number);
  if (!nums.every(Number.isFinite)) return true;
  if (Math.max(Math.abs(nums[0]), Math.abs(nums[2])) > 180 || Math.max(Math.abs(nums[1]), Math.abs(nums[3])) > 90) return true;
  const minX = Math.min(nums[0], nums[2]), maxX = Math.max(nums[0], nums[2]);
  const minY = Math.min(nums[1], nums[3]), maxY = Math.max(nums[1], nums[3]);
  return coordinates.longitude >= minX && coordinates.longitude <= maxX && coordinates.latitude >= minY && coordinates.latitude <= maxY;
}

export function mergeLimitations(...groups) {
  const byCode = new Map();
  for (const row of groups.flat().filter(Boolean)) {
    const key = `${row.code || 'limitation'}:${row.excerpt || ''}`;
    if (!byCode.has(key)) byCode.set(key, row);
  }
  return [...byCode.values()];
}
