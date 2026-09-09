import test from 'node:test';
import assert from 'node:assert/strict';
import { WFSAdapter, parseWfsCapabilities } from '../src/adapters/wfs.mjs';

const XML = `<?xml version="1.0"?><WFS_Capabilities><FeatureTypeList>
<FeatureType><Name>county:parcels</Name><Title>Tax Parcels</Title><Abstract>Parcel polygons</Abstract></FeatureType>
<FeatureType><Name>city:zoning</Name><Title>Zoning Districts</Title></FeatureType>
</FeatureTypeList></WFS_Capabilities>`;

class MockHttp {
  async getText() { return { text: XML, response: { headers: new Headers({ 'content-type': 'text/xml' }) } }; }
  async getJson(url) {
    const u = new URL(url); const type = u.searchParams.get('typeNames');
    if (type === 'county:parcels') return { type:'FeatureCollection', features:[{type:'Feature',properties:{PIN:'1'},geometry:{type:'Polygon',coordinates:[[[-75,40],[-74.999,40],[-74.999,40.001],[-75,40.001],[-75,40]]]}}] };
    return { type:'FeatureCollection', features:[{type:'Feature',properties:{ZONE:'R-2'},geometry:{type:'Polygon',coordinates:[[[-75.001,39.999],[-74.998,39.999],[-74.998,40.002],[-75.001,40.002],[-75.001,39.999]]]}}] };
  }
}

test('parses WFS feature types and scores parcel/zoning layers', async () => {
  const layers = parseWfsCapabilities(XML);
  assert.equal(layers.length, 2);
  const adapter = new WFSAdapter({ http: new MockHttp() });
  const inspection = await adapter.inspectService('https://gis.example.gov/geoserver/wfs');
  assert.equal(adapter.rankLayers(inspection, 'parcel')[0].layer.nativeName, 'county:parcels');
  assert.equal(adapter.rankLayers(inspection, 'zoning')[0].layer.nativeName, 'city:zoning');
});

test('WFS adapter performs point parcel lookup and polygon zoning intersection', async () => {
  const adapter = new WFSAdapter({ http: new MockHttp() });
  const parcel = await adapter.queryPoint('https://gis.example.gov/geoserver/wfs', 'county:parcels', { longitude:-74.9995, latitude:40.0005 });
  assert.equal(parcel.features.length, 1);
  const zoning = await adapter.queryGeometry('https://gis.example.gov/geoserver/wfs', 'city:zoning', parcel.features[0].geometry);
  assert.equal(zoning.features.length, 1);
  assert.equal(zoning.features[0].properties.ZONE, 'R-2');
});
