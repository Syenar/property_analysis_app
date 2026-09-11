import { readFile, writeFile } from 'node:fs/promises';

async function replaceRequired(path, oldText, newText) {
  const source = await readFile(path, 'utf8');
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) throw new Error(`Missing blueprint finalize anchor in ${path}`);
  await writeFile(path, source.replace(oldText, newText));
}

const path = 'src/plans/blueprint-discovery.mjs';

await replaceRequired(
  path,
  `              const signalRow = planSignal(\`${'${title}'} ${'${info.contentType || \'\'}'}\`);\n              if (!signalRow) continue;\n              const official = officialHost(candidate.url);`,
  `              const signalRow = planSignal(\`${'${title}'} ${'${info.contentType || \'\'}'}\`);\n              const documentLike = DIRECT_DOCUMENT_RE.test(url) || /pdf|tiff?|png|jpe?g|dwg|dxf/i.test(info.contentType || '');\n              if (!signalRow && !documentLike) continue;\n              const planType = signalRow?.type || 'permit-record-attachment';\n              const signalScore = signalRow?.score || 8;\n              const official = officialHost(candidate.url);`
);

await replaceRequired(
  path,
  `                planType:signalRow.type,\n                official,\n                directDocument:true,\n                confidence:Math.min(100, authority.score + signalRow.score + 25),\n                confidenceReasons:[...(authority.reasons || []), \`plan-signal:${'${signalRow.type}'}\`, row.parcelIdMatch ? \`parcel-id:${'${row.parcelIdMatch.key}'}\` : 'address-evidence', 'arcgis-attachment'],\n                matchEvidence:{ addressScore:row.addressScore, parcelIdMatch:row.parcelIdMatch || null, layerId:layer.id, objectId },`,
  `                planType,\n                documentTypeConfirmed:Boolean(signalRow),\n                classificationLimitation:signalRow ? null : 'Attachment came from an address/parcel-matched permit or planning record, but its filename/metadata did not identify the document type.',\n                official,\n                directDocument:true,\n                confidence:Math.min(100, authority.score + signalScore + (signalRow ? 25 : 14)),\n                confidenceReasons:[...(authority.reasons || []), signalRow ? \`plan-signal:${'${signalRow.type}'}\` : 'permit-record-attachment', row.parcelIdMatch ? \`parcel-id:${'${row.parcelIdMatch.key}'}\` : 'address-evidence', 'arcgis-attachment'],\n                matchEvidence:{ addressScore:row.addressScore, parcelIdMatch:row.parcelIdMatch || null, layerId:layer.id, objectId },`
);

console.log('Blueprint finalization patch applied.');

const archiveParts = await Promise.all([
  '_archive_patch/a00.part',
  '_archive_patch/a01.part',
  '_archive_patch/a02.part',
  '_archive_patch/a03.part',
  '_archive_patch/a04.part'
].map((part) => readFile(part, 'utf8')));
await writeFile('src/plans/archive-catalog-discovery.mjs', archiveParts.join(''));
await import('./patch-preview-archive.mjs');
console.log('Deterministic archive/catalog discovery wired into preview build.');
