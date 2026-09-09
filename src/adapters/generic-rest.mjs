import { scoreLayer } from '../confidence/scoring.mjs';
import { geometryBounds, geometriesIntersect, pointInGeometry } from '../geometry/geojson.mjs';

function asFeatures(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((row) => row?.type === 'Feature' ? row : ({ type:'Feature', properties:row?.properties || row?.attributes || row, geometry:row?.geometry || null }));
  if (Array.isArray(value.features)) return value.features;
  if (value.type === 'Feature') return [value];
  return [];
}

function interpolate(template, values) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => values[key] == null ? '' : String(values[key]));
}

function configuredLayers(config) {
  const rows = config.layers || [
    { id:'parcel', name:'Parcel', purpose:'parcel', geometryType:'esriGeometryPolygon' },
    { id:'zoning', name:'Zoning', purpose:'zoning', geometryType:'esriGeometryPolygon' }
  ];
  return rows.map((row) => ({ capabilities:'Query', fields:[], ...row }));
}

// Declarative JSON REST adapter. It does not reverse-engineer arbitrary sites;
// configurations are added only for sanctioned, documented public APIs.
export class GenericRestAdapter {
  constructor({ http, config = null, configs = [] }) {
    this.http = http;
    this.configs = [...configs, ...(config ? [config] : [])];
  }

  configFor(url) {
    return this.configs.find((c) => c?.baseUrl && String(url).startsWith(c.baseUrl)) || null;
  }

  supports(url) { return Boolean(this.configFor(url)); }

  async inspectService(serviceUrl) {
    const config = this.configFor(serviceUrl);
    if (!config) throw new Error(`No generic REST configuration for ${serviceUrl}`);
    return {
      url: config.baseUrl,
      service: {
        description: config.description || 'Configured public JSON REST service',
        licenseInfo: config.licenseInfo || null,
        termsOfUse: config.terms || null,
        copyrightText: config.copyrightText || null
      },
      layers: configuredLayers(config)
    };
  }

  rankLayers(inspection, purpose) {
    return inspection.layers.map((layer) => {
      const generic = scoreLayer(layer, purpose);
      if (layer.purpose === purpose) return { layer, score:Math.max(80, generic.score), reasons:[...generic.reasons, `configured-purpose:${purpose}`] };
      return { layer, ...generic };
    }).sort((a,b) => b.score - a.score);
  }

  requestUrl(config, spec, values) {
    const url = new URL(interpolate(spec.path || '', values), config.baseUrl);
    for (const [key, template] of Object.entries(spec.query || {})) url.searchParams.set(key, interpolate(template, values));
    return url.toString();
  }

  normalize(config, spec, raw) {
    if (typeof spec.normalize === 'function') return spec.normalize(raw);
    if (typeof config.normalize === 'function') return config.normalize(raw, spec);
    return { features:asFeatures(raw), raw };
  }

  async queryPoint(serviceUrl, layerId, { longitude, latitude }) {
    const config = this.configFor(serviceUrl);
    const spec = config?.pointLookup?.[layerId] || config?.pointLookup;
    if (!config || !spec) return { features:[] };
    const url = this.requestUrl(config, spec, { lon:longitude, lat:latitude, layer:layerId });
    const raw = await this.http.getJson(url, { headers: config.headers || {} });
    const result = this.normalize(config, spec, raw);
    return { ...result, features:(result.features || []).filter((f) => !f.geometry || pointInGeometry([longitude,latitude], f.geometry)) };
  }

  async queryGeometry(serviceUrl, layerId, geometry) {
    const config = this.configFor(serviceUrl);
    const spec = config?.geometryLookup?.[layerId] || config?.geometryLookup;
    if (!config || !spec) return { features:[] };
    const bbox = geometryBounds(geometry);
    if (!bbox) return { features:[] };
    const values = { layer:layerId, minX:bbox.minX, minY:bbox.minY, maxX:bbox.maxX, maxY:bbox.maxY };
    const url = this.requestUrl(config, spec, values);
    const raw = await this.http.getJson(url, { headers: config.headers || {} });
    const result = this.normalize(config, spec, raw);
    return { ...result, features:(result.features || []).filter((f) => !f.geometry || geometriesIntersect(geometry, f.geometry)) };
  }

  // Backward-compatible convenience method for one configured point lookup.
  async lookupByPoint({ longitude, latitude }) {
    const config = this.configs[0];
    if (!config) return null;
    const layer = configuredLayers(config)[0];
    return this.queryPoint(config.baseUrl, layer.id, { longitude, latitude });
  }
}
