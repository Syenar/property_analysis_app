import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceDiscoveryEngine, normalizeArcGisServiceUrl } from '../src/discovery/source-discovery.mjs';

test('normalizes ArcGIS service URLs from web results', () => {
  assert.equal(
    normalizeArcGisServiceUrl('https://gis.example.gov/arcgis/rest/services/Parcels/FeatureServer/0?f=pjson'),
    'https://gis.example.gov/arcgis/rest/services/Parcels/FeatureServer'
  );
});

test('merges web-discovered government ArcGIS services with Portal results', async () => {
  const engine = new SourceDiscoveryEngine({
    arcgis: { search: async (_j, purpose) => purpose === 'parcel' ? [{ url: 'https://www.arcgis.com/a/FeatureServer', title: 'Portal Parcels', confidence: 40 }] : [] },
    webSearch: { search: async (q) => q.includes('parcel') ? [{ title: 'County Parcels', url: 'https://gis.example.gov/arcgis/rest/services/Parcels/FeatureServer/0', description: 'official parcel service', source: 'test' }] : [{ title: 'Town Zoning', url: 'https://gis.example.gov/arcgis/rest/services/Zoning/MapServer', description: 'official zoning districts', source: 'test' }] }
  });
  const result = await engine.discoverGis({ municipality: 'Example', county: 'Example County', state: 'Test' });
  assert.ok(result.parcelCandidates.some((c) => c.url.includes('gis.example.gov') && c.url.endsWith('/FeatureServer')));
  assert.ok(result.zoningCandidates.some((c) => c.url.endsWith('/MapServer')));
});

test('GIS web discovery searches county separately as a parcel fallback and detects static downloads', async () => {
  const queries = [];
  const engine = new SourceDiscoveryEngine({
    arcgis:{ search:async () => [] },
    webSearch:{ search:async (q) => {
      queries.push(q);
      if (q.includes('Kent County Delaware') && q.includes('GeoJSON')) return [{ title:'Kent County Parcels GeoJSON', url:'https://gis.kentcountyde.gov/download/parcels.geojson', description:'Official parcel GIS download', source:'test' }];
      return [];
    }}
  });
  const result = await engine.discoverGis({ municipality:'Dover', county:'Kent County', state:'Delaware' });
  assert.ok(queries.some((q) => q.startsWith('Kent County Delaware parcel')));
  assert.ok(result.parcelCandidates.some((c) => c.platform === 'static-geojson' && c.discoveryScope === 'county'));
});

test('broad GIS web discovery limits duplicate search-provider calls', async () => {
  let calls = 0;
  const engine = new SourceDiscoveryEngine({
    arcgis:{ search:async () => [] },
    webSearch:{ search:async () => { calls++; return []; } }
  });
  await engine.discoverGis({ municipality:'Example City', county:'Example County', state:'Pennsylvania' });
  assert.ok(calls <= 8, `expected at most 8 search calls, got ${calls}`);
});
