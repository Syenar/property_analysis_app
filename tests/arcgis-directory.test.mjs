import test from 'node:test';
import assert from 'node:assert/strict';
import { ArcGISDirectoryDiscovery, arcgisDirectoryRoot } from '../src/discovery/arcgis-directory.mjs';

class MockHttp {
  async getJson(url) {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '');
    if (path.endsWith('/arcgis/rest/services')) {
      return {
        folders: ['Planning', 'Utilities'],
        services: [
          { name: 'Public/County_Parcels', type: 'FeatureServer' },
          { name: 'Basemap', type: 'MapServer' }
        ]
      };
    }
    if (path.endsWith('/arcgis/rest/services/Planning')) {
      return { folders: [], services: [{ name: 'Planning/Zoning_Districts', type: 'MapServer' }] };
    }
    return { folders: [], services: [] };
  }
}

test('extracts ArcGIS REST directory root from service/folder URLs', () => {
  assert.equal(arcgisDirectoryRoot('https://gis.example.gov/arcgis/rest/services/Planning/Zoning/MapServer/3'), 'https://gis.example.gov/arcgis/rest/services');
  assert.equal(arcgisDirectoryRoot('https://gis.example.gov/server/rest/services'), 'https://gis.example.gov/server/rest/services');
});

test('discovers parcel and zoning services from public ArcGIS REST directory', async () => {
  const d = new ArcGISDirectoryDiscovery({ http: new MockHttp() });
  const roots = ['https://gis.example.gov/arcgis/rest/services/Planning'];
  const jurisdiction = { municipality: 'Example', state: 'PA' };
  const parcels = await d.discoverFromRoots(roots, jurisdiction, 'parcel');
  const zoning = await d.discoverFromRoots(roots, jurisdiction, 'zoning');
  assert.ok(parcels.some((x) => /County_Parcels\/FeatureServer$/.test(x.url)));
  assert.ok(zoning.some((x) => /Zoning_Districts\/MapServer$/.test(x.url)));
  assert.ok(parcels[0].official);
});
