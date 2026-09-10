import test from 'node:test';
import assert from 'node:assert/strict';
import { prioritizeRankedLayers } from '../src/engine/research-helpers.mjs';

test('verified source metadata can prioritize known layer ids without jurisdiction-specific engine code', () => {
  const ranked = [
    { layer:{ id:3, name:'Property Group' }, score:80 },
    { layer:{ id:5, name:'Parcels' }, score:70 },
    { layer:{ id:8, name:'Other' }, score:60 }
  ];
  const out = prioritizeRankedLayers(ranked, [5]);
  assert.equal(out[0].layer.id, 5);
  assert.equal(out[1].layer.id, 3);
});
