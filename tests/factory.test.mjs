import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/index.mjs';

test('createEngine wires configured generic REST adapters', () => {
  const configs = [{
    baseUrl:'https://example.gov/api/',
    layers:[{id:'parcel', name:'Tax Parcels', purpose:'parcel'}],
    pointLookup:{parcel:{path:'parcel', query:{lon:'{lon}', lat:'{lat}'}}}
  }];
  const engine = createEngine({ GENERIC_REST_CONFIGS_JSON:JSON.stringify(configs) });
  assert.equal(engine.genericRest.supports('https://example.gov/api/parcel'), true);
});

test('createEngine rejects malformed generic REST configuration JSON', () => {
  assert.throws(() => createEngine({ GENERIC_REST_CONFIGS_JSON:'{' }), /must be a JSON array/);
});
