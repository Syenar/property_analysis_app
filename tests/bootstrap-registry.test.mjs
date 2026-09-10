import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryJurisdictionRegistry } from '../src/registry/jurisdiction-registry.mjs';
import { BOOTSTRAP_JURISDICTIONS } from '../src/registry/bootstrap-sources.mjs';

test('bootstrap registry matches Census incorporated-place suffixes without jurisdiction hacks', async () => {
  const registry = new MemoryJurisdictionRegistry(BOOTSTRAP_JURISDICTIONS);
  const denver = await registry.get({ state:'Colorado', municipality:'Denver city', county:'Denver County', stateCode:'08', municipalityCode:'0820000' });
  assert.ok(denver);
  assert.ok(denver.sources.parcelCandidates[0].url.includes('ODC_PROP_PARCELS_A'));
  assert.ok(denver.sources.ordinanceSources.length > 0);
});
