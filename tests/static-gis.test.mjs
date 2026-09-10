import test from 'node:test';
import assert from 'node:assert/strict';
import { StaticGisAdapter } from '../src/adapters/static-gis.mjs';

const geojson = {
  type:'FeatureCollection',
  features:[
    { type:'Feature', properties:{ PARCEL:'A-1', OWNER:'Test Owner', ACRES:1.2 }, geometry:{ type:'Polygon', coordinates:[[[-77,39],[-76.99,39],[-76.99,39.01],[-77,39.01],[-77,39]]] } },
    { type:'Feature', properties:{ PARCEL:'A-2' }, geometry:{ type:'Polygon', coordinates:[[[-76.98,39],[-76.97,39],[-76.97,39.01],[-76.98,39.01],[-76.98,39]]] } }
  ]
};

function response(body, contentType='application/geo+json') {
  return new Response(JSON.stringify(body), { status:200, headers:{ 'content-type':contentType, 'last-modified':'Wed, 09 Sep 2026 12:00:00 GMT' } });
}

test('static GeoJSON adapter inspects and spatially queries downloadable datasets', async () => {
  const http = { request: async () => response(geojson) };
  const adapter = new StaticGisAdapter({ http });
  const url = 'https://data.example.gov/parcels.geojson';
  assert.equal(adapter.supports(url), true);
  const inspection = await adapter.inspectService(url);
  assert.equal(inspection.layers.length, 1);
  assert.ok(adapter.rankLayers(inspection, 'parcel')[0].score >= 40);
  const point = await adapter.queryPoint(url, '0', { longitude:-76.995, latitude:39.005 });
  assert.equal(point.features.length, 1);
  assert.equal(point.features[0].properties.PARCEL, 'A-1');
  const polygon = { type:'Polygon', coordinates:[[[-77.001,38.999],[-76.994,38.999],[-76.994,39.006],[-77.001,39.006],[-77.001,38.999]]] };
  const intersected = await adapter.queryGeometry(url, '0', polygon);
  assert.equal(intersected.features.length, 1);
});

test('static shapefile adapter can use an injected decoder without municipality-specific code', async () => {
  const http = {
    getBytes: async () => ({ bytes:new Uint8Array([1,2,3]), response:new Response('', { headers:{ 'content-type':'application/zip' } }) })
  };
  const adapter = new StaticGisAdapter({ http, shapefileDecoder:async () => ({ ...geojson, fileName:'County Parcels' }) });
  const inspection = await adapter.inspectService('https://data.example.gov/parcels.zip');
  assert.equal(inspection.layers[0].name, 'County Parcels');
  assert.equal((await adapter.queryPoint('https://data.example.gov/parcels.zip', '0', { longitude:-76.995, latitude:39.005 })).features.length, 1);
});

import { PropertyResearchEngine } from '../src/engine/property-research-engine.mjs';
import { MemoryJurisdictionRegistry } from '../src/registry/jurisdiction-registry.mjs';
import { SourcePolicy } from '../src/policy/source-policy.mjs';

test('engine can use static parcel and zoning datasets without inventing REST layer URLs', async () => {
  const parcelData = { type:'FeatureCollection', features:[geojson.features[0]] };
  const zoningData = { type:'FeatureCollection', features:[{
    type:'Feature', properties:{ ZONING:'C-2', DISTRICT:'Commercial' }, geometry:{ type:'Polygon', coordinates:[[[-77.01,38.99],[-76.98,38.99],[-76.98,39.02],[-77.01,39.02],[-77.01,38.99]]] }
  }] };
  const http = { request: async (url) => response(String(url).includes('zoning') ? zoningData : parcelData) };
  const staticGis = new StaticGisAdapter({ http });
  const parcelUrl = 'https://data.example.gov/parcels.geojson';
  const zoningUrl = 'https://data.example.gov/zoning.geojson';
  const engine = new PropertyResearchEngine({
    geocoder:{ geocode:async () => ({ ok:true, matchedAddress:'1 TEST ST', coordinates:{longitude:-76.995,latitude:39.005}, jurisdiction:{state:'Pennsylvania',county:'Test County',municipality:'Test City'} }) },
    discovery:{ discoverGis:async () => ({
      parcelCandidates:[{ url:parcelUrl, platform:'static-geojson', title:'Official Parcels', official:true, confidence:90 }],
      zoningCandidates:[{ url:zoningUrl, platform:'static-geojson', title:'Official Zoning', official:true, confidence:90 }]
    }) },
    arcgis:null, wfs:null, genericRest:null, staticGis,
    registry:new MemoryJurisdictionRegistry(),
    ordinanceDiscovery:{ discover:async () => [{ url:'https://testcity.gov/zoning-code', title:'Zoning Code', confidence:95, automation:{action:'fetch'} }] },
    documentDownloader:{ fetchDocument:async () => ({ fetched:false }) },
    sourcePolicy:new SourcePolicy()
  });
  const { packet } = await engine.run('1 Test St, Test City, PA', { fetchOrdinanceDocuments:false });
  assert.equal(packet.parcel.sourceUrl, parcelUrl);
  assert.equal(packet.zoning[0].sourceUrl, zoningUrl);
  assert.equal(packet.assessment.status, 'complete');
});
