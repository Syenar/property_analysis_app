import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceFreshness } from '../src/confidence/scoring.mjs';

test('classifies source modified dates without changing authority', () => {
  const now = Date.parse('2026-09-09T12:00:00Z');
  assert.equal(sourceFreshness('2026-08-01T00:00:00Z', { now }).status, 'recent');
  assert.equal(sourceFreshness('2025-09-01T00:00:00Z', { now }).status, 'aging');
  const old = sourceFreshness('2020-01-01T00:00:00Z', { now });
  assert.equal(old.status, 'stale-signal');
  assert.ok(old.ageDays > 2000);
  assert.equal(sourceFreshness(null, { now }).status, 'unknown');
});
