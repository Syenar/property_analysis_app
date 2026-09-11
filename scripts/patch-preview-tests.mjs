import { readFile, writeFile } from 'node:fs/promises';

const path = 'tests/engine.test.mjs';
let source = await readFile(path, 'utf8');

const oldBlock = `  assert.equal(packet.parcel.properties.SITUS_ADDRESS, '4600 SILVER HILL RD');\n  assert.equal(packet.parcel.resolutionMethod, 'address-match');\n  assert.ok(packet.warnings.some((w) => /nearby address matching/i.test(w)));`;

const newBlock = `  assert.equal(packet.parcel.properties.SITUS_ADDRESS, '4600 SILVER HILL RD');\n  assert.equal(packet.parcel.resolutionMethod, 'address-match');\n  assert.equal(packet.parcel.matchEvidence.status, 'review');\n  assert.equal(packet.parcel.matchEvidence.insideParcel, false);\n  assert.equal(packet.parcel.matchEvidence.candidateCount, 2);\n  assert.ok(Number.isFinite(packet.parcel.matchEvidence.distanceMeters));\n  assert.ok(packet.warnings.some((w) => /parcel match requires review/i.test(w)));`;

if (!source.includes(newBlock)) {
  if (!source.includes(oldBlock)) throw new Error('Could not find legacy nearby-parcel assertion block');
  source = source.replace(oldBlock, newBlock);
  await writeFile(path, source);
}
