import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceAuthorityScore, sourceLifecycle } from '../src/confidence/scoring.mjs';

test('explicitly superseded zoning datasets are strongly down-ranked', () => {
  const current = sourceAuthorityScore({ url:'https://gis.example.gov/zoning/FeatureServer', title:'Current Zoning', access:'public' }, { state:'Kentucky' });
  const old = sourceAuthorityScore({ url:'https://gis.example.gov/zoning_old/FeatureServer', title:'Superseded Zoning - Do Not Use', access:'public' }, { state:'Kentucky' });
  assert.equal(sourceLifecycle({ title:'Superseded Zoning - Do Not Use' }).status, 'superseded');
  assert.ok(current.score > old.score);
  assert.ok(old.reasons.includes('superseded-source'));
});

test('state-coded government hosts reward matching states and reject conflicting states', () => {
  const matching = sourceAuthorityScore({ url:'https://gis.franklincounty.ky.gov/arcgis/rest/services/Parcels/FeatureServer', title:'Franklin County Parcels', access:'public' }, { county:'Franklin County', state:'Kentucky' });
  const wrong = sourceAuthorityScore({ url:'https://gis.franklincounty.pa.gov/arcgis/rest/services/Parcels/FeatureServer', title:'Franklin County Parcels', access:'public' }, { county:'Franklin County', state:'Kentucky' });
  assert.ok(matching.score > wrong.score);
  assert.ok(matching.reasons.includes('state-host-match:ky'));
  assert.ok(wrong.reasons.includes('conflicting-state-host:pa'));
});

test('year-stamped zoning layers distinguish current/prior-year data from older historical snapshots', () => {
  const year = new Date().getUTCFullYear();
  assert.equal(sourceLifecycle({ title:`Zoning_${year}` }).status, 'current-signal');
  assert.equal(sourceLifecycle({ title:`Zoning_${year - 1}` }).status, 'current-signal');
  assert.equal(sourceLifecycle({ title:`Zoning_${year - 4}` }).status, 'historical');
  assert.equal(sourceLifecycle({ title:`Current Zoning ${year - 8}` }).status, 'current-signal');
});
