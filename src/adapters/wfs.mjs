import { scoreLayer } from '../confidence/scoring.mjs';
import { geometryBounds, pointInGeometry, geometriesIntersect } from '../geometry/geojson.mjs';

function baseUrl(input) {
  const u = new URL(input);
  for (const key of [...u.searchParams.keys()]) {
    if (/^(service|request|version|typenames?|typeName|outputFormat|bbox|srsName)$/i.test(key)) u.searchParams.delete(key);
  }
  return u.toString();
}

function xmlText(value = '') {
  return String(value).replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseWfsCapabilities(xml) {
  const layers = [];
  const blocks = String(xml).match(/<(?:\w+:)?FeatureType\b[\s\S]*?<\/(?:\w+:)?FeatureType>/gi) || [];
  for (const block of blocks) {
    const name = block.match(/<(?:\w+:)?Name>([\s\S]*?)<\/(?:\w+:)?Name>/i)?.[1]?.trim();
    if (!name) continue;
    const title = xmlText(block.match(/<(?:\w+:)?Title>([\s\S]*?)<\/(?:\w+:)?Title>/i)?.[1] || name);
    const description = xmlText(block.match(/<(?:\w+:)?Abstract>([\s\S]*?)<\/(?:\w+:)?Abstract>/i)?.[1] || '');
    layers.push({ id: name, name: title || name, nativeName: name, description, geometryType: 'esriGeometryPolygon', capabilities: 'Query', fields: [] });
  }
  return layers;
}

export class WFSAdapter {
  constructor({ http }) { this.http = http; }

  supports(url) {
    try {
      const u = new URL(url);
      return /(?:^|\/)wfs(?:\/|$)/i.test(u.pathname) || /^wfs$/i.test(u.searchParams.get('service') || '') || /geoserver/i.test(u.pathname);
    } catch { return false; }
  }

  async inspectService(serviceUrl) {
    const url = new URL(baseUrl(serviceUrl));
    url.searchParams.set('service', 'WFS');
    url.searchParams.set('request', 'GetCapabilities');
    const { text, response } = await this.http.getText(url.toString(), { headers: { Accept: 'application/xml,text/xml,*/*' } });
    return {
      url: baseUrl(serviceUrl),
      service: { description: 'OGC Web Feature Service', contentType: response.headers.get('content-type') || 'application/xml' },
      layers: parseWfsCapabilities(text)
    };
  }

  rankLayers(inspection, purpose) {
    return inspection.layers.map((layer) => ({ layer, ...scoreLayer(layer, purpose) })).sort((a, b) => b.score - a.score);
  }

  async getFeature(serviceUrl, layerName, bbox) {
    const url = new URL(baseUrl(serviceUrl));
    url.searchParams.set('service', 'WFS');
    url.searchParams.set('version', '2.0.0');
    url.searchParams.set('request', 'GetFeature');
    url.searchParams.set('typeNames', layerName);
    url.searchParams.set('outputFormat', 'application/json');
    url.searchParams.set('srsName', 'EPSG:4326');
    if (bbox) url.searchParams.set('bbox', `${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY},EPSG:4326`);
    const raw = await this.http.getJson(url.toString(), { headers: { Accept: 'application/geo+json,application/json,*/*' } });
    return { features: raw.features || [], raw };
  }

  async queryPoint(serviceUrl, layerId, { longitude, latitude }) {
    const e = 0.000003;
    const result = await this.getFeature(serviceUrl, layerId, { minX: longitude - e, minY: latitude - e, maxX: longitude + e, maxY: latitude + e });
    return { ...result, features: result.features.filter((f) => !f.geometry || pointInGeometry([longitude, latitude], f.geometry)) };
  }

  async queryGeometry(serviceUrl, layerId, geometry) {
    const bbox = geometryBounds(geometry);
    if (!bbox) return { features: [] };
    const result = await this.getFeature(serviceUrl, layerId, bbox);
    return { ...result, features: result.features.filter((f) => !f.geometry || geometriesIntersect(geometry, f.geometry)) };
  }
}
