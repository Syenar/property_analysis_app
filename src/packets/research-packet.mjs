function pretty(value) { return value == null ? 'Not found' : String(value); }

function maxConfidence(rows = []) {
  const values = rows.map((r) => Number(r?.confidence)).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

export function assessPacket(data) {
  const geocodeOk = Boolean(data.geocode?.ok);
  const parcelFound = Boolean(data.parcel?.geometry);
  const zoningCount = (data.zoning || []).reduce((sum, row) => sum + (row.features?.length || 0), 0);
  const zoningFound = zoningCount > 0;
  const ordinanceFound = (data.ordinanceSources || []).length > 0;
  const fetchedDocs = (data.documents || []).filter((d) => d.fetched).length;
  const indexedDocs = (data.documents || []).filter((d) => d.fetched && Array.isArray(d.sections) && d.sections.length > 0).length;

  let score = 0;
  if (geocodeOk) score += 15;
  if (parcelFound) score += 30;
  if (zoningFound) score += 30;
  if (ordinanceFound) score += 20;
  if (indexedDocs) score += 5;

  const missing = [];
  if (!geocodeOk) missing.push('geocode');
  if (!parcelFound) missing.push('parcel');
  if (!zoningFound) missing.push('zoning');
  if (!ordinanceFound) missing.push('ordinance-source');

  const status = !geocodeOk ? 'failed' : (parcelFound && zoningFound && ordinanceFound ? 'complete' : score >= 45 ? 'partial' : 'limited');
  return {
    status,
    completenessScore: score,
    missing,
    counts: { zoningFeatures: zoningCount, ordinanceSources: (data.ordinanceSources || []).length, fetchedDocuments: fetchedDocs, indexedDocuments: indexedDocs },
    confidence: {
      parcelSource: Number.isFinite(data.parcelSource?.confidence) ? data.parcelSource.confidence : null,
      zoningSources: maxConfidence(data.zoningSources || []),
      ordinanceSources: maxConfidence(data.ordinanceSources || [])
    }
  };
}

function publicDocumentShape(d) {
  return {
    url: d.url,
    title: d.title || null,
    fetched: Boolean(d.fetched),
    retrievedAt: d.retrievedAt || null,
    contentType: d.contentType || null,
    bytes: d.bytes || null,
    sha256: d.sha256 || null,
    sourceModifiedAt: d.sourceModifiedAt || null,
    keywordHits: d.keywordHits || [],
    policy: d.policy || null,
    sections: d.sections || [],
    planType: d.planType || null,
    confidence: Number.isFinite(d.confidence) ? d.confidence : null,
    sourceCandidate: d.sourceCandidate || null
  };
}

export function buildResearchPacket(data) {
  const assessment = assessPacket(data);
  const sourceLimitations = [];
  if (data.parcel?.sourceLimitations?.length) sourceLimitations.push({ kind: 'parcel-gis', url: data.parcel.sourceUrl, limitations: data.parcel.sourceLimitations });
  for (const z of data.zoning || []) {
    if (z.sourceLimitations?.length) sourceLimitations.push({ kind: 'zoning-gis', url: z.sourceUrl, limitations: z.sourceLimitations });
  }
  for (const d of data.documents || []) {
    if (d.policy?.limitations?.length) sourceLimitations.push({ kind: 'ordinance-document', url: d.url, limitations: d.policy.limitations });
  }
  for (const d of data.blueprintDocuments || []) {
    if (d.policy?.limitations?.length) sourceLimitations.push({ kind: 'building-document', url: d.url, limitations: d.policy.limitations });
  }

  const blueprintResearch = data.blueprintResearch && typeof data.blueprintResearch === 'object'
    ? {
        attempted: Boolean(data.blueprintResearch.attempted),
        webSearchAvailable: data.blueprintResearch.webSearchAvailable == null ? null : Boolean(data.blueprintResearch.webSearchAvailable),
        directDocumentCount: Number(data.blueprintResearch.directDocumentCount || 0),
        arcgisAttachmentCount: Number(data.blueprintResearch.arcgisAttachmentCount || 0)
      }
    : { attempted:false, webSearchAvailable:null, directDocumentCount:0, arcgisAttachmentCount:0 };

  return {
    schemaVersion: '0.3',
    generatedAt: new Date().toISOString(),
    inputAddress: data.inputAddress,
    geocode: data.geocode,
    jurisdiction: data.geocode?.jurisdiction || null,
    assessment,
    parcel: data.parcel || null,
    zoning: data.zoning || [],
    zoningIdentifiers: data.zoningIdentifiers || [],
    gisSources: data.gisSources || [],
    ordinanceSources: data.ordinanceSources || [],
    blueprintResearch,
    blueprintSources: data.blueprintSources || data.blueprintResearch?.sources || [],
    blueprintDocuments: (data.blueprintDocuments || []).map(publicDocumentShape),
    sourceLimitations,
    documents: (data.documents || []).map(publicDocumentShape),
    warnings: data.warnings || [],
    provenance: data.provenance || []
  };
}

export function packetToMarkdown(packet) {
  const j = packet.jurisdiction || {};
  const parcelProps = packet.parcel?.properties || {};
  const zoningRows = packet.zoning || [];
  const assessment = packet.assessment || {};
  const lines = [
    '# Property / Zoning Research Packet', '',
    `Generated: ${packet.generatedAt}`, '',
    '## Coverage', '',
    `- Status: ${pretty(assessment.status)}`,
    `- Completeness: ${pretty(assessment.completenessScore)}%`,
    `- Missing: ${assessment.missing?.length ? assessment.missing.join(', ') : 'None detected'}`,
    '', '## Property', '',
    `- Input address: ${packet.inputAddress}`,
    `- Matched address: ${pretty(packet.geocode?.matchedAddress)}`,
    `- Coordinates: ${pretty(packet.geocode?.coordinates?.latitude)}, ${pretty(packet.geocode?.coordinates?.longitude)}`,
    `- Municipality: ${pretty(j.municipality)}`,
    `- County: ${pretty(j.county)}`,
    `- State: ${pretty(j.state)}`,
    '', '## Parcel', '',
    packet.parcel ? 'Parcel feature was retrieved from a spatially intersecting GIS layer.' : 'No parcel feature was retrieved.',
    ''
  ];
  if (packet.parcel) {
    for (const [k, v] of Object.entries(parcelProps).slice(0, 60)) lines.push(`- ${k}: ${pretty(v)}`);
  }
  lines.push('', '## Zoning intersections', '');
  if (!zoningRows.length) lines.push('No zoning intersection was retrieved.');
  for (const z of zoningRows) {
    lines.push(`### ${z.sourceTitle || 'Zoning source'}`);
    for (const f of z.features || []) {
      lines.push('');
      for (const [k, v] of Object.entries(f.properties || f.attributes || {})) lines.push(`- ${k}: ${pretty(v)}`);
    }
  }
  if (packet.zoningIdentifiers?.length) {
    lines.push('', '## Zoning identifiers', '');
    packet.zoningIdentifiers.forEach((z) => lines.push(`- ${z}`));
  }
  lines.push('', '## Ordinance / code sources', '');
  if (!packet.ordinanceSources.length) lines.push('No ordinance source discovered by configured deterministic search providers.');
  packet.ordinanceSources.slice(0, 15).forEach((s) => lines.push(`- ${s.title || s.url} — ${s.url} — confidence ${s.confidence ?? 'n/a'} — automation: ${s.automation?.action || 'unknown'}`));

  lines.push('', '## Blueprints / building plans', '');
  if (!packet.blueprintResearch?.attempted) {
    lines.push('Building-document discovery was not run.');
  } else if (!(packet.blueprintSources || []).length) {
    lines.push(packet.blueprintResearch.webSearchAvailable === false
      ? 'Public ArcGIS permit/planning records and attachments were searched; no address-matched building-plan candidate was found. Conventional web search was not configured for this run.'
      : 'Public permit/planning sources were searched; no address-matched building-plan candidate was found.');
  } else {
    packet.blueprintSources.slice(0, 20).forEach((s) => lines.push(`- ${s.title || s.url} — ${s.url} — type ${s.planType || 'plan-candidate'} — confidence ${s.confidence ?? 'n/a'} — automation: ${s.automation?.action || 'unknown'}`));
  }
  if ((packet.blueprintDocuments || []).length) {
    lines.push('', '### Retrieved building documents', '');
    packet.blueprintDocuments.slice(0, 20).forEach((d) => lines.push(`- ${d.title || d.url} — fetched ${d.fetched ? 'yes' : 'no'} — ${d.url}`));
  }

  lines.push('', '## Source limitations', '');
  if (!packet.sourceLimitations?.length) lines.push('- No source-specific limitations were detected in fetched metadata.');
  for (const source of packet.sourceLimitations || []) {
    lines.push(`- ${source.kind}: ${source.url}`);
    for (const limitation of source.limitations || []) lines.push(`  - ${limitation.code}: ${limitation.excerpt}`);
  }
  lines.push('', '## Warnings', '');
  if (!packet.warnings.length) lines.push('- None generated by the engine.');
  packet.warnings.forEach((w) => lines.push(`- ${typeof w === 'string' ? w : JSON.stringify(w)}`));
  lines.push('', '## Provenance', '');
  packet.provenance.forEach((p) => lines.push(`- ${p.kind}: ${p.url} (retrieved ${p.retrievedAt || 'unknown'})`));
  lines.push('', '> This packet assembles public-source research. GIS geometry may be reference-grade rather than survey-grade, and zoning/legal interpretation should be independently verified.');
  return lines.join('\n');
}
