export function normalizeResearchRequest(body = {}) {
  const address = String(body?.address || '').trim().replace(/\s+/g, ' ');
  if (!address) throw new Error('address is required');
  if (address.length < 5) throw new Error('address is too short');
  if (address.length > 240) throw new Error('address exceeds 240 characters');
  const maxGisCandidatesRaw = Number(body?.maxGisCandidates ?? 6);
  const maxGisCandidates = Number.isFinite(maxGisCandidatesRaw)
    ? Math.max(1, Math.min(20, Math.trunc(maxGisCandidatesRaw)))
    : 6;
  const maxOrdinanceDocumentsRaw = Number(body?.maxOrdinanceDocuments ?? 3);
  const maxOrdinanceDocuments = Number.isFinite(maxOrdinanceDocumentsRaw)
    ? Math.max(0, Math.min(10, Math.trunc(maxOrdinanceDocumentsRaw)))
    : 3;
  return {
    address,
    fetchOrdinanceDocuments: body?.fetchOrdinanceDocuments === true,
    maxGisCandidates,
    maxOrdinanceDocuments
  };
}

export function normalizeCodeSearchParams({ runId, q, limit = 20 } = {}) {
  const id = String(runId || '').trim();
  const query = String(q || '').trim().replace(/\s+/g, ' ');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('runId must be a UUID');
  if (!query) throw new Error('q is required');
  if (query.length > 300) throw new Error('q exceeds 300 characters');
  const n = Number(limit);
  return { runId:id, q:query, limit:Number.isFinite(n) ? Math.max(1, Math.min(100, Math.trunc(n))) : 20 };
}
