import { scoreLayer } from '../confidence/scoring.mjs';

function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    area += (x1 * y2) - (x2 * y1);
  }
  return area / 2;
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function esriRingsToGeoJSON(rings) {
  const normalized = rings
    .filter((ring) => Array.isArray(ring) && ring.length >= 4)
    .map((ring, index) => ({ ring, index, area: Math.abs(ringArea(ring)), parent: null, depth: 0 }))
    .sort((a, b) => b.area - a.area);

  for (let i = 0; i < normalized.length; i++) {
    const child = normalized[i];
    const sample = child.ring[0];
    let parent = null;
    for (let j = 0; j < i; j++) {
      const candidate = normalized[j];
      if (pointInRing(sample, candidate.ring) && (!parent || candidate.area < parent.area)) parent = candidate;
    }
    child.parent = parent;
    child.depth = parent ? parent.depth + 1 : 0;
  }

  const shells = normalized.filter((r) => r.depth % 2 === 0);
  const polygons = shells.map((shell) => {
    const holes = normalized.filter((r) => r.depth === shell.depth + 1 && r.parent === shell);
    return [shell.ring, ...holes.map((h) => h.ring)];
  });

  if (!polygons.length) return null;
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
}

export function esriGeometryToGeoJSON(geometry) {
  if (!geometry) return null;
  if (Number.isFinite(geometry.x) && Number.isFinite(geometry.y)) return { type: 'Point', coordinates: [geometry.x, geometry.y] };
  if (Array.isArray(geometry.rings)) return esriRingsToGeoJSON(geometry.rings);
  if (Array.isArray(geometry.paths)) {
    return geometry.paths.length === 1
      ? { type: 'LineString', coordinates: geometry.paths[0] }
      : { type: 'MultiLineString', coordinates: geometry.paths };
  }
  if (Array.isArray(geometry.points)) return { type: 'MultiPoint', coordinates: geometry.points };
  if (geometry.type && geometry.coordinates) return geometry;
  return null;
}

function normalizeServiceUrl(input) {
  const u = new URL(input);
  u.search = '';
  u.hash = '';
  u.pathname = u.pathname.replace(/\/(\d+)\/?$/, '').replace(/\/$/, '');
  return u.toString();
}

function layerUrl(serviceUrl, layerId) {
  return `${normalizeServiceUrl(serviceUrl)}/${layerId}`;
}

async function queryJson(http, url) {
  if (url.length < 1800 || typeof http.request !== 'function') return http.getJson(url);
  const parsed = new URL(url);
  const body = parsed.searchParams.toString();
  parsed.search = '';
  const response = await http.request(parsed.toString(), {
    method:'POST',
    headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8', Accept:'application/json' },
    body
  });
  const text = await response.text();
  try { return JSON.parse(text); } catch { throw new Error(`Invalid ArcGIS JSON from ${parsed}`); }
}

export class ArcGISAdapter {
  constructor({ http }) { this.http = http; }

  supports(url) { return /\/(FeatureServer|MapServer)(\/\d+)?\/?(?:\?|$)/i.test(url); }

  async inspectService(serviceUrl) {
    const base = normalizeServiceUrl(serviceUrl);
    const service = await this.http.getJson(`${base}?f=pjson`);
    const layers = [];
    for (const stub of service.layers || []) {
      try {
        const meta = await this.http.getJson(`${layerUrl(base, stub.id)}?f=pjson`);
        layers.push(meta);
      } catch (error) {
        layers.push({ ...stub, _inspectionError: String(error.message || error) });
      }
    }
    return { url: base, service, layers };
  }

  rankLayers(inspection, purpose) {
    return inspection.layers
      .map((layer) => ({ layer, ...scoreLayer(layer, purpose) }))
      .sort((a, b) => b.score - a.score);
  }

  async queryPoint(serviceUrl, layerId, { longitude, latitude }, { outFields = '*', returnGeometry = true } = {}) {
    const url = new URL(`${layerUrl(serviceUrl, layerId)}/query`);
    const p = url.searchParams;
    p.set('f', 'pjson');
    p.set('where', '1=1');
    p.set('geometry', `${longitude},${latitude}`);
    p.set('geometryType', 'esriGeometryPoint');
    p.set('inSR', '4326');
    p.set('spatialRel', 'esriSpatialRelIntersects');
    p.set('outFields', outFields);
    p.set('returnGeometry', String(returnGeometry));
    p.set('outSR', '4326');
    return this.http.getJson(url.toString());
  }

  async queryGeometry(serviceUrl, layerId, geometry, { geometryType = 'esriGeometryPolygon', inSR = 4326, outFields = '*', returnGeometry = true } = {}) {
    const url = new URL(`${layerUrl(serviceUrl, layerId)}/query`);
    const p = url.searchParams;
    p.set('f', 'pjson');
    p.set('where', '1=1');
    p.set('geometry', typeof geometry === 'string' ? geometry : JSON.stringify(geometry));
    p.set('geometryType', geometryType);
    p.set('inSR', String(inSR));
    p.set('spatialRel', 'esriSpatialRelIntersects');
    p.set('outFields', outFields);
    p.set('returnGeometry', String(returnGeometry));
    p.set('outSR', '4326');
    return queryJson(this.http, url.toString());
  }

  async queryNearby(serviceUrl, layerId, { longitude, latitude }, { meters = 40, outFields = '*', returnGeometry = true } = {}) {
    const latitudeRadians = latitude * Math.PI / 180;
    const dy = meters / 111320;
    const dx = meters / Math.max(111320 * Math.cos(latitudeRadians), 1000);
    const envelope = { xmin:longitude-dx, ymin:latitude-dy, xmax:longitude+dx, ymax:latitude+dy, spatialReference:{wkid:4326} };
    const url = new URL(`${layerUrl(serviceUrl, layerId)}/query`);
    const p = url.searchParams;
    p.set('f','json');
    p.set('where','1=1');
    p.set('geometry',JSON.stringify(envelope));
    p.set('geometryType','esriGeometryEnvelope');
    p.set('inSR','4326');
    p.set('spatialRel','esriSpatialRelIntersects');
    p.set('outFields',outFields);
    p.set('returnGeometry',String(returnGeometry));
    p.set('outSR','4326');
    const result = await queryJson(this.http, url.toString());
    return { ...result, _nearbyMeters:meters };
  }

  firstFeature(result) { return result?.features?.[0] || null; }
  featureGeometry(feature) {
    if (!feature) return null;
    if (feature.type === 'Feature') return feature.geometry;
    return feature.geometry || null;
  }
  featureProperties(feature) { return feature?.properties || feature?.attributes || {}; }
}
