import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ArcGISAdapter, esriGeometryToGeoJSON } from '../src/adapters/arcgis.mjs';

const service = JSON.parse(await readFile(new URL('./fixtures/arcgis-service.json', import.meta.url), 'utf8'));
const parcelLayer = JSON.parse(await readFile(new URL('./fixtures/arcgis-layer-parcel.json', import.meta.url), 'utf8'));
const zoningLayer = JSON.parse(await readFile(new URL('./fixtures/arcgis-layer-zoning.json', import.meta.url), 'utf8'));
const parcelQuery = JSON.parse(await readFile(new URL('./fixtures/arcgis-parcel-query.json', import.meta.url), 'utf8'));
const zoningQuery = JSON.parse(await readFile(new URL('./fixtures/arcgis-zoning-query.json', import.meta.url), 'utf8'));

test('ArcGIS adapter inspects service and spatially queries point/polygon', async () => {
  const seen = [];
  const http = { getJson: async (url) => {
    seen.push(url);
    if (/FeatureServer\?f=pjson/.test(url)) return service;
    if (/FeatureServer\/0\?f=pjson/.test(url)) return parcelLayer;
    if (/FeatureServer\/1\?f=pjson/.test(url)) return zoningLayer;
    if (/FeatureServer\/0\/query/.test(url)) return parcelQuery;
    if (/FeatureServer\/1\/query/.test(url)) return zoningQuery;
    throw new Error(`unexpected URL ${url}`);
  }};
  const a = new ArcGISAdapter({ http });
  const inspection = await a.inspectService('https://gis.example.gov/arcgis/rest/services/Test/FeatureServer');
  assert.equal(inspection.layers.length, 2);
  assert.equal(a.rankLayers(inspection, 'parcel')[0].layer.id, 0);
  assert.equal(a.rankLayers(inspection, 'zoning')[0].layer.id, 1);
  const pq = await a.queryPoint(inspection.url, 0, { longitude:-76.927, latitude:38.846 });
  const geom = pq.features[0].geometry;
  const zq = await a.queryGeometry(inspection.url, 1, geom);
  assert.equal(zq.features[0].attributes.ZONE, 'C-2');
  assert.ok(seen.some((u) => u.includes('geometryType=esriGeometryPoint')));
  assert.ok(seen.some((u) => u.includes('geometryType=esriGeometryPolygon')));
});

test('Esri polygon converts to GeoJSON', () => {
  const g = esriGeometryToGeoJSON(parcelQuery.features[0].geometry);
  assert.equal(g.type, 'Polygon');
  assert.equal(g.coordinates[0].length, 5);
});

test('Esri multipart polygon converts to GeoJSON MultiPolygon without treating a second shell as a hole', () => {
  const geometry = {
    rings: [
      [[0,0],[0,10],[10,10],[10,0],[0,0]],
      [[2,2],[8,2],[8,8],[2,8],[2,2]],
      [[20,20],[20,30],[30,30],[30,20],[20,20]]
    ]
  };
  const out = esriGeometryToGeoJSON(geometry);
  assert.equal(out.type, 'MultiPolygon');
  assert.equal(out.coordinates.length, 2);
  assert.equal(out.coordinates[0].length, 2);
});
