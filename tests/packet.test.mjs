import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPacket, buildResearchPacket, packetToMarkdown } from '../src/packets/research-packet.mjs';

test('packet assessment distinguishes complete and partial source assembly', () => {
  const complete = assessPacket({
    geocode:{ok:true}, parcel:{geometry:{type:'Polygon'}}, zoning:[{features:[{}]}],
    ordinanceSources:[{confidence:90}], documents:[], parcelSource:{confidence:95}, zoningSources:[{confidence:92}]
  });
  assert.equal(complete.status, 'complete');
  assert.equal(complete.completenessScore, 95);
  assert.deepEqual(complete.missing, []);
  const partial = assessPacket({ geocode:{ok:true}, parcel:{geometry:{type:'Polygon'}}, zoning:[], ordinanceSources:[], documents:[] });
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.missing, ['zoning','ordinance-source']);
});

test('research packet publishes deterministic coverage in JSON and Markdown', () => {
  const packet = buildResearchPacket({ inputAddress:'1 Main St', geocode:{ok:true,jurisdiction:{}}, parcel:null, zoning:[], ordinanceSources:[], documents:[] });
  assert.equal(packet.schemaVersion, '0.3');
  assert.match(packetToMarkdown(packet), /## Coverage/);
  assert.match(packetToMarkdown(packet), /Completeness:/);
});

test('research packet preserves source limitations', () => {
  const packet = buildResearchPacket({
    inputAddress:'1 Main St', geocode:{ok:true,jurisdiction:{}},
    parcel:{ geometry:{type:'Polygon'}, sourceUrl:'https://county.gov/parcels', sourceLimitations:[{code:'not-survey-grade', excerpt:'not survey-grade'}] },
    zoning:[], ordinanceSources:[], documents:[]
  });
  assert.equal(packet.sourceLimitations.length, 1);
  assert.match(packetToMarkdown(packet), /not-survey-grade/);
});
