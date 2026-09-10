import { scoreLayer } from '../confidence/scoring.mjs';
import { geometryBounds, geometriesIntersect, pointInGeometry } from '../geometry/geojson.mjs';

function extensionFormat(input) {
  try {
    const u = new URL(input);
    const path = decodeURIComponent(u.pathname).toLowerCase();
    if (/\.geojson$|\.json$/.test(path) || /(?:format|f|outputformat)=geojson/i.test(u.search)) return 'geojson';
    if (/\.zip$|\.shp$/.test(path)) return 'shapefile';
  } catch {}
  return null;
}

function normalizeCollections(raw, fallbackName = 'Dataset') {
  const values = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (!value) continue;
    if (value.type === 'FeatureCollection' && Array.isArray(value.features)) {
      out.push({ name:value.fileName || fallbackName || `Dataset ${index + 1}`, features:value.features });
    } else if (value.type === 'Feature') {
      out.push({ name:fallbackName, features:[value] });
    } else if (Array.isArray(value.features)) {
      out.push({ name:value.fileName || fallbackName, features:value.features });
    }
  }
  return out;
}

function fieldSchema(features = []) {
  const fields = new Map();
  for (const feature of features.slice(0, 25)) {
    for (const [name, value] of Object.entries(feature?.properties || {})) {
      if (fields.has(name)) continue;
      fields.set(name, { name, alias:name, type:typeof value });
    }
  }
  return [...fields.values()];
}

function geometryType(features = []) {
  const types = new Set(features.map((f) => f?.geometry?.type).filter(Boolean));
  if ([...types].some((x) => /Polygon/i.test(x))) return 'esriGeometryPolygon';
  if ([...types].some((x) => /Line/i.test(x))) return 'esriGeometryPolyline';
  if ([...types].some((x) => /Point/i.test(x))) return 'esriGeometryPoint';
  return '';
}

async function defaultShapefileDecoder(bytes) {
  let mod;
  try { mod = await import('shpjs'); }
  catch {
    throw new Error('Shapefile support requires optional dependency "shpjs". Run npm install before using .zip/.shp datasets.');
  }
  const shp = mod.default || mod;
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return shp(buffer);
}

export class StaticGisAdapter {
  constructor({ http, shapefileDecoder = defaultShapefileDecoder, maxBytes = 100 * 1024 * 1024 } = {}) {
    this.http = http;
    this.shapefileDecoder = shapefileDecoder;
    this.maxBytes = maxBytes;
    this.cache = new Map();
  }

  supports(url) { return Boolean(extensionFormat(url)); }

  async load(serviceUrl) {
    if (this.cache.has(serviceUrl)) return this.cache.get(serviceUrl);
    const format = extensionFormat(serviceUrl);
    if (!format) throw new Error(`Unsupported static GIS dataset: ${serviceUrl}`);
    let collections;
    let contentType = null;
    let bytes = null;
    let modified = null;

    if (format === 'geojson') {
      const response = await this.http.request(serviceUrl, { headers:{ Accept:'application/geo+json,application/json,*/*' } });
      contentType = response.headers.get('content-type') || 'application/geo+json';
      modified = response.headers.get('last-modified') || null;
      const text = await response.text();
      bytes = new TextEncoder().encode(text).byteLength;
      if (bytes > this.maxBytes) throw new Error(`Static GIS dataset exceeds ${this.maxBytes} bytes`);
      let raw;
      try { raw = JSON.parse(text); }
      catch { throw new Error(`Invalid GeoJSON/JSON dataset: ${serviceUrl}`); }
      collections = normalizeCollections(raw, new URL(serviceUrl).pathname.split('/').pop() || 'GeoJSON dataset');
    } else {
      const result = await this.http.getBytes(serviceUrl, { headers:{ Accept:'application/zip,application/octet-stream,*/*' } });
      bytes = result.bytes.byteLength;
      contentType = result.response.headers.get('content-type') || 'application/zip';
      modified = result.response.headers.get('last-modified') || null;
      if (bytes > this.maxBytes) throw new Error(`Static GIS dataset exceeds ${this.maxBytes} bytes`);
      const raw = await this.shapefileDecoder(result.bytes);
      collections = normalizeCollections(raw, new URL(serviceUrl).pathname.split('/').pop() || 'Shapefile dataset');
    }

    if (!collections.length) throw new Error(`No feature collections found in static GIS dataset: ${serviceUrl}`);
    const loaded = { format, collections, contentType, bytes, modified };
    this.cache.set(serviceUrl, loaded);
    return loaded;
  }

  async inspectService(serviceUrl) {
    const loaded = await this.load(serviceUrl);
    const layers = loaded.collections.map((collection, index) => ({
      id:String(index),
      name:collection.name || `Dataset ${index + 1}`,
      description:`Static ${loaded.format === 'shapefile' ? 'shapefile' : 'GeoJSON'} download`,
      geometryType:geometryType(collection.features),
      capabilities:'Query',
      fields:fieldSchema(collection.features)
    }));
    return {
      url:serviceUrl,
      service:{
        description:`Static ${loaded.format} GIS dataset`,
        contentType:loaded.contentType,
        sourceModifiedAt:loaded.modified,
        byteCount:loaded.bytes
      },
      layers
    };
  }

  rankLayers(inspection, purpose) {
    return inspection.layers.map((layer) => ({ layer, ...scoreLayer(layer, purpose) })).sort((a,b) => b.score - a.score);
  }

  async featuresFor(serviceUrl, layerId) {
    const loaded = await this.load(serviceUrl);
    const index = Number(layerId);
    return loaded.collections[Number.isInteger(index) ? index : 0]?.features || [];
  }

  async queryPoint(serviceUrl, layerId, { longitude, latitude }) {
    const features = await this.featuresFor(serviceUrl, layerId);
    return {
      features:features.filter((feature) => feature?.geometry && pointInGeometry([longitude, latitude], feature.geometry)),
      raw:null
    };
  }

  async queryGeometry(serviceUrl, layerId, geometry) {
    if (!geometryBounds(geometry)) return { features:[] };
    const features = await this.featuresFor(serviceUrl, layerId);
    return {
      features:features.filter((feature) => feature?.geometry && geometriesIntersect(geometry, feature.geometry)),
      raw:null
    };
  }
}

export { extensionFormat as staticGisFormat, normalizeCollections };
