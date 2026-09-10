import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeResearchRequest, normalizeCodeSearchParams } from '../src/core/api-input.mjs';

test('research request normalization enforces address and bounded options', () => {
  assert.throws(() => normalizeResearchRequest({ address:'' }), /required/);
  assert.throws(() => normalizeResearchRequest({ address:'x'.repeat(241) }), /240/);
  assert.deepEqual(normalizeResearchRequest({ address:'  200   E Colfax Ave, Denver, CO 80203  ', maxGisCandidates:999, maxOrdinanceDocuments:-4, fetchOrdinanceDocuments:true }), {
    address:'200 E Colfax Ave, Denver, CO 80203', maxGisCandidates:20, maxOrdinanceDocuments:0, fetchOrdinanceDocuments:true
  });
});

test('code search validates UUID and bounded query', () => {
  const row = normalizeCodeSearchParams({ runId:'550e8400-e29b-41d4-a716-446655440000', q:'  parking   requirements ', limit:999 });
  assert.equal(row.q, 'parking requirements');
  assert.equal(row.limit, 100);
  assert.throws(() => normalizeCodeSearchParams({ runId:'not-an-id', q:'zoning' }), /UUID/);
});
