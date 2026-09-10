const GOVERNMENT_HOST = /(^|\.)gov$|(^|\.)us$|(^|\.)[a-z]{2}\.us$/i;
const ARCGIS_HOST = /(^|\.)(arcgis\.com|arcgisonline\.com)$/i;
const CODE_HOST = /(^|\.)(ecode360\.com|municode\.com|amlegal\.com)$/i;

const STATE_CODES = {
  alabama:'al', alaska:'ak', arizona:'az', arkansas:'ar', california:'ca', colorado:'co', connecticut:'ct', delaware:'de',
  florida:'fl', georgia:'ga', hawaii:'hi', idaho:'id', illinois:'il', indiana:'in', iowa:'ia', kansas:'ks', kentucky:'ky',
  louisiana:'la', maine:'me', maryland:'md', massachusetts:'ma', michigan:'mi', minnesota:'mn', mississippi:'ms', missouri:'mo',
  montana:'mt', nebraska:'ne', nevada:'nv', 'new hampshire':'nh', 'new jersey':'nj', 'new mexico':'nm', 'new york':'ny',
  'north carolina':'nc', 'north dakota':'nd', ohio:'oh', oklahoma:'ok', oregon:'or', pennsylvania:'pa', 'rhode island':'ri',
  'south carolina':'sc', 'south dakota':'sd', tennessee:'tn', texas:'tx', utah:'ut', vermont:'vt', virginia:'va', washington:'wa',
  'west virginia':'wv', wisconsin:'wi', wyoming:'wy', 'district of columbia':'dc', 'washington dc':'dc',
  'puerto rico':'pr', guam:'gu', 'u.s. virgin islands':'vi', 'virgin islands':'vi', 'american samoa':'as'
};
const VALID_STATE_CODES = new Set(Object.values(STATE_CODES));

function stateCode(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[.,]/g, '');
  if (VALID_STATE_CODES.has(normalized)) return normalized;
  return STATE_CODES[normalized] || null;
}

export function sourceLifecycle(candidate = {}) {
  const tags = Array.isArray(candidate.tags) ? candidate.tags.join(' ') : candidate.tags || '';
  const text = `${candidate.title || ''} ${candidate.description || ''} ${candidate.name || ''} ${tags}`.toLowerCase();

  const hardSuperseded = [
    /\bsuperseded\b/, /\bdeprecated\b/, /\bobsolete\b/, /\bretired\b/, /\bdo not use\b/,
    /\bno longer (?:maintained|current|used)\b/, /\breplaced by\b/, /\bformer zoning\b/, /\bold zoning\b/
  ];
  if (hardSuperseded.some((r) => r.test(text))) return { status:'superseded', reason:'explicit-supersession-signal' };

  const archival = [
    /\barchive(?:d)?\b/, /\blegacy\b/, /\bhistorical zoning\b/, /\bhistoric zoning data\b/
  ];
  if (archival.some((r) => r.test(text))) return { status:'historical', reason:'historical-or-archive-signal' };

  const explicitCurrent = /\bcurrent\b|\bauthoritative\b|\bactive\b|\bproduction\b/.test(text);
  if (explicitCurrent) return { status:'current-signal', reason:'current-signal' };
  const zoningYears = [...text.matchAll(/\bzoning[_ /-]?(20\d{2})\b/g)].map((m) => Number(m[1])).filter(Number.isFinite);
  if (zoningYears.length) {
    const newest = Math.max(...zoningYears);
    const currentYear = new Date().getUTCFullYear();
    if (newest >= currentYear - 1) return { status:'current-signal', reason:`recent-year-stamped-zoning:${newest}` };
    if (newest <= currentYear - 2) return { status:'historical', reason:`older-year-stamped-zoning:${newest}` };
  }
  return { status:'unknown', reason:'no-lifecycle-signal' };
}

function stateHostEvidence(host, jurisdiction = {}) {
  const target = stateCode(jurisdiction.state);
  if (!target || !host) return { score:0, reasons:[] };
  const reasons = [];
  let score = 0;
  const explicit = host.match(/(?:^|\.)([a-z]{2})\.gov$/i)?.[1]?.toLowerCase()
    || host.match(/(?:^|\.)state\.([a-z]{2})\.us$/i)?.[1]?.toLowerCase();
  if (explicit && VALID_STATE_CODES.has(explicit)) {
    if (explicit === target) { score += 18; reasons.push(`state-host-match:${target}`); }
    else { score -= 50; reasons.push(`conflicting-state-host:${explicit}`); }
  }
  return { score, reasons };
}

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
  if (candidate.platform === 'static-geojson' || candidate.platform === 'static-shapefile') { score += 10; reasons.push('downloadable-gis-dataset'); }
  if (/parcel|cadastre|tax.?lot/i.test(`${candidate.title || ''} ${candidate.description || ''}`)) { score += 12; reasons.push('parcel-signal'); }
  if (/zoning|zone|land.?use/i.test(`${candidate.title || ''} ${candidate.description || ''}`)) { score += 12; reasons.push('zoning-signal'); }
  const hay = `${candidate.title || ''} ${candidate.description || ''} ${candidate.owner || ''}`.toLowerCase();
  const jurisdictionTerms = [jurisdiction.municipality, jurisdiction.county, jurisdiction.state, ...(jurisdiction.candidates || []).map((x) => x.name)].filter(Boolean);
  for (const term of [...new Set(jurisdictionTerms)]) {
    if (hay.includes(String(term).toLowerCase())) { score += 6; reasons.push(`jurisdiction:${term}`); }
  }
  if (candidate.access === 'public') { score += 5; reasons.push('public-item'); }
  if (candidate.modified) { score += 2; reasons.push('has-modified-date'); }

  const hostEvidence = stateHostEvidence(host, jurisdiction);
  score += hostEvidence.score;
  reasons.push(...hostEvidence.reasons);

  const lifecycle = sourceLifecycle(candidate);
  if (lifecycle.status === 'superseded') { score -= 60; reasons.push('superseded-source'); }
  else if (lifecycle.status === 'historical') { score -= 25; reasons.push('historical-source'); }
  else if (lifecycle.status === 'current-signal') { score += 5; reasons.push('current-source-signal'); }

  return { score: Math.max(0, Math.min(100, score)), reasons, lifecycle };
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

export { stateCode };
