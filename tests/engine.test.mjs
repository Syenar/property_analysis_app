import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PropertyResearchEngine } from '../src/engine/property-research-engine.mjs';
import { ArcGISAdapter } from '../src/adapters/arcgis.mjs';
import { MemoryJurisdictionRegistry } from '../src/registry/jurisdiction-registry.mjs';

const service = JSON.parse(await readFile(new URL('./fixtures/arcgis-service.json', import.meta.url), 'utf8'));
const parcelLayer = JSON.parse(await readFile(new URL('./fixtures/arcgis-layer-parcel.json', import.meta.url), 'utf8'));
const zoningLayer = JSON.parse(await readFile(new URL('./fixtures/arcgis-layer-zoning.json', import.meta.url), 'utf8'));
const parcelQuery = JSON.parse(await readFile(new URL('./fixtures/arcgis-parcel-query.json', import.meta.url), 'utf8'));
const zoningQuery = JSON.parse(await readFile(new URL('./fixtures/arcgis-zoning-query.json', import.meta.url), 'utf8'));
const sourceUrl = 'https://gis.example.gov/arcgis/rest/services/Test/FeatureServer';

test('engine completes deterministic parcel -> zoning -> packet flow', async () => {
  const http = { getJson: async (url) => {
    if (/FeatureServer\?f=pjson/.test(url)) return service;
    if (/FeatureServer\/0\?f=pjson/.test(url)) return parcelLayer;
    if (/FeatureServer\/1\?f=pjson/.test(url)) return zoningLayer;
    if (/FeatureServer\/0\/query/.test(url)) return parcelQuery;
    if (/FeatureServer\/1\/query/.test(url)) return zoningQuery;
    throw new Error(`unexpected ${url}`);
  }};
  const arcgis = new ArcGISAdapter({ http });
  const geocoder = { geocode: async () => ({ ok:true, matchedAddress:'4600 SILVER HILL RD, WASHINGTON, DC, 20233', coordinates:{longitude:-76.927,latitude:38.846,srid:4326}, jurisdiction:{state:'District of Columbia',stateCode:'11',county:'District of Columbia',countyCode:'11001',municipality:'Washington city'} })};
  const candidates = [{ url:sourceUrl, title:'Official Test Parcels/Zoning', confidence:95 }];
  const engine = new PropertyResearchEngine({ geocoder, discovery:{discoverGis:async()=>({parcelCandidates:candidates,zoningCandidates:candidates})}, arcgis, registry:new MemoryJurisdictionRegistry(), ordinanceDiscovery:{discover:async()=>[]}, documentDownloader:{fetchDocument:async()=>{throw new Error('should not be called');}}, store:null, sourcePolicy:null });
  const progress = [];
  const { packet, markdown } = await engine.run('4600 Silver Hill Rd', { fetchOrdinanceDocuments:false, onProgress:(event)=>progress.push(event) });
  assert.equal(packet.parcel.properties.PARCELNUM, 'ABC-123');
  assert.equal(packet.zoning[0].features[0].attributes.ZONE, 'C-2');
  assert.match(markdown, /C-2/);
  assert.ok(packet.provenance.some((p) => p.kind === 'parcel-gis'));
  assert.ok(progress.some((e) => e.stage === 'geocode' && e.status === 'done'));
  assert.ok(progress.some((e) => e.stage === 'parcel' && e.status === 'done'));
  assert.ok(progress.some((e) => e.stage === 'packet' && e.status === 'done'));
});

test('engine resolves a street-centerline geocode through nearby parcel address matching', async () => {
  const exactEmpty = { features:[] };
  const wrong = JSON.parse(JSON.stringify(parcelQuery.features[0]));
  wrong.attributes = { ...wrong.attributes, PADDRESS:'999 OTHER ROAD', SITUS_ADDRESS:'999 OTHER ROAD' };
  const right = JSON.parse(JSON.stringify(parcelQuery.features[0]));
  right.attributes = { ...right.attributes, SITUS_ADDRESS:'4600 SILVER HILL RD' };
  const http = { getJson: async (url) => {
    if (/FeatureServer\?f=pjson/.test(url)) return service;
    if (/FeatureServer\/0\?f=pjson/.test(url)) return parcelLayer;
    if (/FeatureServer\/1\?f=pjson/.test(url)) return zoningLayer;
    if (/FeatureServer\/0\/query/.test(url)) {
      const q = new URL(url);
      return q.searchParams.get('geometryType') === 'esriGeometryEnvelope' ? { features:[wrong,right] } : exactEmpty;
    }
    if (/FeatureServer\/1\/query/.test(url)) return zoningQuery;
    throw new Error(`unexpected ${url}`);
  }};
  const arcgis = new ArcGISAdapter({ http });
  const engine = new PropertyResearchEngine({
    geocoder:{ geocode:async () => ({ ok:true, matchedAddress:'4600 SILVER HILL RD, WASHINGTON, DC', coordinates:{longitude:-76.927,latitude:38.846}, jurisdiction:{state:'District of Columbia',county:'District of Columbia',municipality:'Washington city'} }) },
    discovery:{ discoverGis:async () => ({ parcelCandidates:[{url:sourceUrl,title:'Test',confidence:95}], zoningCandidates:[{url:sourceUrl,title:'Test',confidence:95}] }) },
    arcgis, registry:new MemoryJurisdictionRegistry(), ordinanceDiscovery:{discover:async()=>[]}, documentDownloader:{fetchDocument:async()=>({fetched:false})}, sourcePolicy:null
  });
  const { packet } = await engine.run('4600 Silver Hill Rd, Washington, DC', { fetchOrdinanceDocuments:false });
  assert.equal(packet.parcel.properties.SITUS_ADDRESS, '4600 SILVER HILL RD');
  assert.equal(packet.parcel.resolutionMethod, 'address-match');
  assert.ok(packet.warnings.some((w) => /nearby address matching/i.test(w)));
});
