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
