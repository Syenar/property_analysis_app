import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scoreLayer, sourceAuthorityScore } from '../src/confidence/scoring.mjs';

const parcel = JSON.parse(await readFile(new URL('./fixtures/arcgis-layer-parcel.json', import.meta.url), 'utf8'));
const zoning = JSON.parse(await readFile(new URL('./fixtures/arcgis-layer-zoning.json', import.meta.url), 'utf8'));

test('parcel layer scores higher for parcel purpose', () => {
  assert.ok(scoreLayer(parcel, 'parcel').score > scoreLayer(zoning, 'parcel').score);
});

test('zoning layer scores higher for zoning purpose', () => {
  assert.ok(scoreLayer(zoning, 'zoning').score > scoreLayer(parcel, 'zoning').score);
});

test('official queryable GIS source gets strong authority score', () => {
  const s = sourceAuthorityScore({ url:'https://gis.example.gov/arcgis/rest/services/Parcels/FeatureServer', title:'County Parcels', access:'public' }, { county:'Example County' });
  assert.ok(s.score >= 70);
});
