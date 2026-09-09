import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryJurisdictionRegistry } from '../src/registry/jurisdiction-registry.mjs';

test('jurisdiction registry records source health without replacing sources', async () => {
  const registry = new MemoryJurisdictionRegistry();
  const j = { stateCode:'PA', county:'Lehigh County', municipality:'Allentown' };
  await registry.put(j, { parcelCandidates:[{url:'https://example.gov/parcels'}], zoningCandidates:[] });
  await registry.markSuccess(j);
  const afterSuccess = await registry.get(j);
  assert.ok(afterSuccess.lastSuccessAt);
  assert.equal(afterSuccess.sources.parcelCandidates.length, 1);
  await registry.markFailure(j);
  const afterFailure = await registry.get(j);
  assert.ok(afterFailure.lastFailureAt);
  assert.equal(afterFailure.sources.parcelCandidates[0].url, 'https://example.gov/parcels');
});
