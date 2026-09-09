import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPacket } from '../src/packets/research-packet.mjs';

const base = {
  geocode:{ok:true},
  parcel:{geometry:{type:'Polygon',coordinates:[]}},
  zoning:[{features:[{properties:{ZONE:'R-1'}}]}],
  ordinanceSources:[{url:'https://example.gov/code'}]
};

test('downloaded but unindexed documents do not increase completeness', () => {
  const result = assessPacket({...base, documents:[{fetched:true,sections:[]}]});
  assert.equal(result.completenessScore, 95);
  assert.equal(result.counts.fetchedDocuments, 1);
  assert.equal(result.counts.indexedDocuments, 0);
});

test('indexed ordinance text earns document completeness credit', () => {
  const result = assessPacket({...base, documents:[{fetched:true,sections:[{body:'text'}]}]});
  assert.equal(result.completenessScore, 100);
  assert.equal(result.counts.indexedDocuments, 1);
});
