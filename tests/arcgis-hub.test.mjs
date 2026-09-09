import test from 'node:test';
import assert from 'node:assert/strict';
import { ArcGISHubResolver, extractArcGisItemId } from '../src/discovery/arcgis-hub.mjs';

test('extracts ArcGIS item ids from common Hub and item URLs', () => {
  const id = '0123456789abcdef0123456789abcdef';
  assert.equal(extractArcGisItemId(`https://hub.arcgis.com/datasets/${id}/about`), id);
  assert.equal(extractArcGisItemId(`https://www.arcgis.com/home/item.html?id=${id}`), id);
  assert.equal(extractArcGisItemId(`https://apps.arcgis.com/apps/mapviewer/index.html?webmap=${id}`), id);
  assert.equal(extractArcGisItemId('https://example.gov/data/zoning'), null);
});

test('resolves a Hub/Web Map item to backing FeatureServer and MapServer candidates', async () => {
  const id = '0123456789abcdef0123456789abcdef';
  const http = {
    async getJson(url) {
      if (url.endsWith('/data?f=json')) return {
        operationalLayers: [
          { url: 'https://gis.example.gov/server/rest/services/Planning/Zoning/FeatureServer/0' },
          { url: 'https://gis.example.gov/server/rest/services/Cadastral/Parcels/MapServer' }
        ]
      };
      if (url.endsWith('?f=json')) return {
        id, title: 'Official Planning Map', owner: 'city_gis', access: 'public',
        type: 'Web Map', modified: 1770000000000, extent: [[-77, 38], [-76, 39]]
      };
      throw new Error(`unexpected ${url}`);
    }
  };
  const resolver = new ArcGISHubResolver({ http });
  const rows = await resolver.resolveResults([{ url: `https://hub.arcgis.com/datasets/${id}/about`, title: 'Planning' }], { municipality: 'Example', state: 'XY' });
  assert.equal(rows.length, 2);
  assert.ok(rows.some((x) => x.url.endsWith('/FeatureServer')));
  assert.ok(rows.some((x) => x.url.endsWith('/MapServer')));
  assert.ok(rows.every((x) => x.discoverySource === 'arcgis-hub-item'));
});
