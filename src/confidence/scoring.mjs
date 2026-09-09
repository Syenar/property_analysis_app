const GOVERNMENT_HOST = /(^|\.)gov$|(^|\.)us$|(^|\.)[a-z]{2}\.us$/i;
const ARCGIS_HOST = /(^|\.)(arcgis\.com|arcgisonline\.com)$/i;
const CODE_HOST = /(^|\.)(ecode360\.com|municode\.com|amlegal\.com)$/i;

export function sourceAuthorityScore(candidate, jurisdiction = {}) {
  let score = 0;
  const reasons = [];
  let host = '';
  try { host = new URL(candidate.url).hostname.toLowerCase(); } catch {}

  if (GOVERNMENT_HOST.test(host) || host.endsWith('.gov')) { score += 45; reasons.push('government-host'); }
  if (ARCGIS_HOST.test(host)) { score += 20; reasons.push('arcgis-platform'); }
  if (CODE_HOST.test(host)) { score += 22; reasons.push('known-code-host'); }
  if (/FeatureServer|MapServer/i.test(candidate.url || '')) { score += 20; reasons.push('queryable-gis-service'); }
  if (candidate.platform === 'wfs' || /(?:[?&]service=WFS(?:&|$)|\/wfs(?:[/?]|$))/i.test(candidate.url || '')) { score += 18; reasons.push('queryable-wfs-service'); }
  if (/parcel|cadastre|tax.?lot/i.test(`${candidate.title || ''} ${candidate.description || ''}`)) { score += 12; reasons.push('parcel-signal'); }
  if (/zoning|zone|land.?use/i.test(`${candidate.title || ''} ${candidate.description || ''}`)) { score += 12; reasons.push('zoning-signal'); }
  const hay = `${candidate.title || ''} ${candidate.description || ''} ${candidate.owner || ''}`.toLowerCase();
  const jurisdictionTerms = [jurisdiction.municipality, jurisdiction.county, jurisdiction.state, ...(jurisdiction.candidates || []).map((x) => x.name)].filter(Boolean);
  for (const term of [...new Set(jurisdictionTerms)]) {
    if (hay.includes(String(term).toLowerCase())) { score += 6; reasons.push(`jurisdiction:${term}`); }
  }
  if (candidate.access === 'public') { score += 5; reasons.push('public-item'); }
  if (candidate.modified) { score += 2; reasons.push('has-modified-date'); }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export function sourceFreshness(modified, { now = Date.now() } = {}) {
  if (!modified) return { status: 'unknown', ageDays: null, reason: 'no-modified-date' };
  const ts = typeof modified === 'number' ? modified : Date.parse(modified);
  if (!Number.isFinite(ts)) return { status: 'unknown', ageDays: null, reason: 'invalid-modified-date' };
  const ageDays = Math.max(0, Math.floor((now - ts) / 86400000));
  if (ageDays <= 180) return { status: 'recent', ageDays, reason: 'modified-within-180-days' };
  if (ageDays <= 730) return { status: 'aging', ageDays, reason: 'modified-within-2-years' };
  return { status: 'stale-signal', ageDays, reason: 'item-metadata-older-than-2-years' };
}

const PARCEL_TERMS = ['parcel', 'parcels', 'tax parcel', 'tax lot', 'cadastre', 'cadastral', 'property', 'assessment'];
const ZONING_TERMS = ['zoning', 'zone', 'zones', 'zoning district', 'land use zoning'];
const PARCEL_FIELD_RE = /(parcel|apn|pin|folio|tax.?id|account|owner|situs|address|acre|assess|land.?value|building.?value)/i;
const ZONING_FIELD_RE = /(zoning|zone|district|zonedesc|zone_desc|base.?zone|overlay)/i;

export function scoreLayer(layer, purpose) {
  const name = `${layer.name || ''} ${layer.description || ''}`.toLowerCase();
  const fields = (layer.fields || []).map((f) => `${f.name || ''} ${f.alias || ''}`).join(' ');
  let score = 0;
  const reasons = [];
  if (/polygon/i.test(layer.geometryType || '')) { score += 25; reasons.push('polygon-geometry'); }
  if (layer.capabilities?.includes?.('Query') || layer.capabilities === 'Query' || layer.advancedQueryCapabilities) { score += 10; reasons.push('query-capable'); }
  if (purpose === 'parcel') {
    for (const term of PARCEL_TERMS) if (name.includes(term)) { score += 18; reasons.push(`name:${term}`); break; }
    const hits = (fields.match(new RegExp(PARCEL_FIELD_RE.source, 'ig')) || []).length;
    score += Math.min(35, hits * 4);
    if (hits) reasons.push(`parcel-field-signals:${hits}`);
  } else if (purpose === 'zoning') {
    for (const term of ZONING_TERMS) if (name.includes(term)) { score += 28; reasons.push(`name:${term}`); break; }
    const hits = (fields.match(new RegExp(ZONING_FIELD_RE.source, 'ig')) || []).length;
    score += Math.min(35, hits * 8);
    if (hits) reasons.push(`zoning-field-signals:${hits}`);
  }
  return { score: Math.min(100, score), reasons };
}
