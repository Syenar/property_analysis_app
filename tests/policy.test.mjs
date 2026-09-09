import test from 'node:test';
import assert from 'node:assert/strict';
import { SourcePolicy, sourceLimitations } from '../src/policy/source-policy.mjs';

test('automation-restricted vendor is link-only', () => {
  const p = new SourcePolicy();
  assert.equal(p.decision('https://qpublic.net/ga/foo/').action, 'link-only');
  assert.equal(p.decision('https://beacon.schneidercorp.com/Application.aspx').action, 'link-only');
});

test('official government source can be fetched', () => {
  const p = new SourcePolicy();
  assert.equal(p.decision('https://gis.examplecounty.gov/server/rest/services/Parcels/FeatureServer', { official: true }).action, 'fetch');
});

test('metadata that requires permission blocks automated GIS use', () => {
  const p = new SourcePolicy();
  const decision = p.decision('https://maps.example.org/arcgis/rest/services/Public/MapServer', {
    description: 'All rights reserved. Please request permission to integrate in your applications.'
  });
  assert.equal(decision.action, 'link-only');
  assert.match(decision.reason, /metadata/);
});

test('metadata that expressly prohibits sharing or use blocks automation', () => {
  const p = new SourcePolicy();
  for (const description of [
    'This dataset cannot be shared outside the department without approval.',
    'Using this dataset to make ownership conclusions is expressly unauthorized.'
  ]) {
    const decision = p.decision('https://services.arcgis.com/example/FeatureServer', { description });
    assert.equal(decision.action, 'link-only');
  }
});

test('reference and survey limitations are preserved without automatically blocking public data', () => {
  const metadata = { description: 'For general reference purposes only. This data is not survey-grade and is updated monthly.' };
  const limitations = sourceLimitations(metadata);
  assert.deepEqual(limitations.map((x) => x.code), ['not-survey-grade', 'general-reference-only', 'periodic-update']);
  const p = new SourcePolicy();
  const decision = p.decision('https://county.gov/arcgis/rest/services/Parcels/MapServer', { official: true, ...metadata });
  assert.equal(decision.action, 'fetch');
  assert.equal(decision.limitations.length, 3);
});
